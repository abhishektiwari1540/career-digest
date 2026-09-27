import cron from "node-cron";
import { config } from "./config.js";
import { fetchJobListings } from "./collectors/jobs.js";
import { fetchTrendTopics } from "./collectors/trends.js";
import { fetchEvents } from "./collectors/events.js";
import { fetchBrandCitations } from "./collectors/brandSeo.js";
import { fetchYouTubeTrends } from "./collectors/youtube.js";
import { fetchSelfProfileStats } from "./collectors/selfProfile.js";
import { summarizeDigest } from "./llm/gemini.js";
import { fetchSeoRankMetrics } from "./collectors/seoRankTracker.js";
import { publishToAllPlatforms } from "./publishers/index.js";
import { generateMultimodalEmbedding } from "./llm/embedding.js";
import { generateAudioBriefing } from "./llm/tts.js";
import {
  fetchProjectsPortfolio,
  fetchRecentLinkedInPosts,
  insertEvents,
  recordDailyReport,
  recordPlatformPostStatus,
  recordSeoRankMetrics,
  saveAudioBriefing,
  saveMultimodalVector,
  upsertBrandCitations,
  upsertJobListings,
  upsertTrendTopics,
} from "./storage/supabase.js";
import { sendDigestEmail } from "./report/email.js";

import { getOrGenerateContentPack } from "./llm/contentEngine.js";

async function run() {
  const today = new Date().toISOString().slice(0, 10);
  console.log(`[career-digest] starting run for ${today}`);

  // Collectors run independently; one source failing shouldn't take down
  // the others. Each returns [] on failure instead of throwing.
  const [jobs, trends, events, brandCitations, linkedinPosts, projects, youtubeTrends, selfProfileMetrics, seoRankMetrics] = await Promise.all([
    fetchJobListings().catch((err) => {
      console.error("[career-digest] job collector failed:", err.message);
      return [];
    }),
    fetchTrendTopics().catch((err) => {
      console.error("[career-digest] trend collector failed:", err.message);
      return [];
    }),
    fetchEvents().catch((err) => {
      console.error("[career-digest] event collector failed:", err.message);
      return [];
    }),
    fetchBrandCitations().catch((err) => {
      console.error("[career-digest] brand SEO collector failed:", err.message);
      return [];
    }),
    fetchRecentLinkedInPosts().catch((err) => {
      console.error("[career-digest] fetching LinkedIn posts context failed:", err.message);
      return [];
    }),
    fetchProjectsPortfolio().catch((err) => {
      console.error("[career-digest] fetching project portfolio failed:", err.message);
      return [];
    }),
    fetchYouTubeTrends().catch((err) => {
      console.error("[career-digest] YouTube trend collector failed:", err.message);
      return [];
    }),
    fetchSelfProfileStats().catch((err) => {
      console.error("[career-digest] Self profile monitor failed:", err.message);
      return [];
    }),
    fetchSeoRankMetrics().catch((err) => {
      console.error("[career-digest] SEO Rank tracker failed:", err.message);
      return [];
    }),
  ]);

  console.log(
    `[career-digest] collected ${jobs.length} jobs, ${trends.length} web trends, ${youtubeTrends.length} YouTube trends, ${events.length} events, ${brandCitations.length} brand citations, ${selfProfileMetrics.length} self-profile metrics, ${seoRankMetrics.length} SEO rank metrics`
  );

  const combinedTrends = [...trends, ...youtubeTrends];

  const digestInput = {
    jobs,
    trends: combinedTrends,
    events,
    brandCitations,
    linkedinPosts,
    projects,
    profileSkills: config.profileSkills,
  };

  const { summaryMarkdown } = await summarizeDigest(digestInput);
  const contentPack = await getOrGenerateContentPack(digestInput);

  // Generate Flash TTS Audio Briefing
  const audioBriefing = await generateAudioBriefing(summaryMarkdown);
  await saveAudioBriefing(today, audioBriefing.audioUrl, audioBriefing.durationSeconds);

  // Generate gemini-embedding-2 Multimodal Vector Embedding
  const vector = await generateMultimodalEmbedding(summaryMarkdown.slice(0, 1000));
  await saveMultimodalVector(`digest_${today}`, "text", vector, { reportDate: today });

  // Trigger Universal Social Publisher across Bluesky, Mastodon, YouTube, Instagram, Threads, Facebook
  let publishResults: any[] = [];
  if (contentPack) {
    publishResults = await publishToAllPlatforms({
      title: contentPack.topic,
      text: contentPack.linkedinPost || contentPack.topic,
      hashtags: contentPack.hashtags,
    });
    await recordPlatformPostStatus(publishResults, `pack_${today}`);
  }

  await recordSeoRankMetrics(seoRankMetrics);

  let finalMarkdown = summaryMarkdown;

  if (audioBriefing && audioBriefing.audioUrl) {
    finalMarkdown += `\n\n---\n\n## 🎙️ Gemini Flash TTS Spoken Audio Briefing\n`;
    finalMarkdown += `🎧 **Listen to Daily Briefing**: [Click to Play Audio Briefing](${audioBriefing.audioUrl})\n`;
  }

  if (contentPack) {
    finalMarkdown += `\n\n---\n\n## 🚀 Daily Multi-Platform Content Pack (Ready to Publish)\n`;
    finalMarkdown += `**Topic Focus**: ${contentPack.topic}\n\n`;

    if (contentPack.items && contentPack.items.length > 0) {
      for (const item of contentPack.items) {
        finalMarkdown += `### 📲 Platform: ${item.platform.toUpperCase()}\n`;
        finalMarkdown += `\`\`\`text\n${item.postText}\n\`\`\`\n`;
        if (item.hashtags && item.hashtags.length > 0) {
          finalMarkdown += `**Hashtags (${item.hashtags.length} max enforced)**: ${item.hashtags.join(" ")}\n`;
        }
        if (item.needsImage && item.imageUrl) {
          finalMarkdown += `**Generated Artwork URL**: [Click to Download Image](${item.imageUrl})\n`;
          finalMarkdown += `> *Image Prompt*: \`${item.imagePrompt}\`\n`;
        }
        finalMarkdown += `\n`;
      }
    }

    if (publishResults.length > 0) {
      finalMarkdown += `\n### 🌐 Universal Social Publisher Live Status\n`;
      for (const pub of publishResults) {
        finalMarkdown += `- **${pub.platform.toUpperCase()}**: ${pub.success ? `✅ Published (${pub.url})` : `❌ ${pub.error || "Skipped"}`}\n`;
      }
    }
  }

  await Promise.all([
    upsertJobListings(jobs),
    upsertTrendTopics(combinedTrends),
    insertEvents(events),
    upsertBrandCitations(brandCitations),
  ]);

  await recordDailyReport({
    reportDate: today,
    summaryMarkdown: finalMarkdown,
    jobCount: jobs.length,
    trendCount: combinedTrends.length,
    eventCount: events.length,
  });

  await sendDigestEmail(finalMarkdown, today);

  console.log("[career-digest] done");
}

const isDaemon =
  process.argv.includes("--daemon") ||
  process.argv.includes("--watch") ||
  process.env.DAEMON_MODE === "true";

if (isDaemon) {
  console.log(`[career-digest] Running in continuous daily daemon mode (scheduled for 9:00 AM IST / Asia/Kolkata). Press Ctrl+C to stop.`);

  // Execute immediate run on startup
  run().catch((err) => console.error("[career-digest] daemon startup run failed:", err));

  // Schedule daily 9 AM IST trigger using node-cron (0 9 * * *)
  cron.schedule(
    "0 9 * * *",
    () => {
      console.log("[career-digest] Triggering daily 9:00 AM IST scheduled digest run...");
      run().catch((err) => console.error("[career-digest] daily cron run failed:", err));
    },
    { timezone: "Asia/Kolkata" }
  );
} else {
  run().catch((err) => {
    console.error("[career-digest] run failed:", err);
    process.exit(1);
  });
}

