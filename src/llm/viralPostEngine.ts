import { config } from "../config.js";
import { generateResilientText } from "./resilientLlm.js";
import { publishToAllPlatforms, type PublishResult } from "../publishers/index.js";
import { fetchSecondBrainMemories, supabase } from "../storage/supabase.js";

export interface EvaluatedViralPost {
  candidateIndex: number;
  topic: string;
  title: string;
  hookText: string;
  postText: string;
  hashtags: string[];
  viralityScore: number;
  isWinner: boolean;
  scoreBreakdown: {
    hookScore: number;
    techDepthScore: number;
    brandMentionScore: number;
    hashtagScore: number;
    totalScore: number;
    reasoning: string;
  };
}

export interface ViralEngineRunResult {
  winner: EvaluatedViralPost;
  candidates: EvaluatedViralPost[];
  publishResults: PublishResult[];
  timestamp: string;
}

const VIRAL_TOPICS = [
  "Why 90% of Node.js Developers Misunderstand Async Queues (And How to Fix It)",
  "How I Built a 768-d Multimodal Vector Search Engine with Supabase & Gemini",
  "The JaipurDevs Guide to High-Throughput TypeScript Microservices in Production",
  "Stop Using Raw Promises in Express APIs: Use Resilient Retry Cascades Instead",
  "PostgreSQL vs Supabase pgvector: Benchmarking 100k QPS Semantic Queries",
  "Full Stack Architecture in 2026: React 19, Server Actions & Express Microservices",
  "Why Every Developer in Jaipur Should Master Generative AI & Vector Embeddings",
  "Designing Scalable WebSockets for Real-Time Dashboards Without Memory Leaks",
  "SEO Masterclass for Developers: Structured JSON-LD & Dynamic OpenGraph Meta Tags",
  "Automating Multi-Platform Social Auto-Publishers with Node.js & Docker"
];

export async function generate10ViralPostsWorkflow(): Promise<ViralEngineRunResult> {
  console.log(`[viralPostEngine] Initiating Daily 10-Post Competition & Multi-Platform Auto-Publisher...`);
  const today = new Date().toISOString().slice(0, 10);

  // Fetch memory context
  const memories = await fetchSecondBrainMemories().catch(() => []);
  const memoryContext = memories.map((m) => m.memoryText || (m as any).memory_text || "").join("\n").slice(0, 1500);

  const candidates: EvaluatedViralPost[] = [];

  for (let i = 0; i < 10; i++) {
    const rawTopic = VIRAL_TOPICS[i] || `Developer Insight #${i + 1}`;
    console.log(`[viralPostEngine] Generating Candidate Post ${i + 1}/10: "${rawTopic}"...`);

    const prompt = `You are a Lead Developer Advocate writing for Abhishek Tiwari (Founder of JaipurDevs - https://www.abhishektiwari.online/).
Generate an engaging, viral, technical post for software engineers on the topic: "${rawTopic}".

Context:
${memoryContext || "Specialized in Node.js, Express, TypeScript, Supabase pgvector, and Gemini AI."}

Requirements:
- Create a powerful viral opening hook.
- Include actionable technical insights or a code snippet.
- Mention JaipurDevs community (https://dev.to/jaipurdevs) or Abhishek Tiwari portfolio.
- Include 4-5 relevant hashtags.

Return a valid JSON object matching:
{
  "title": "Short Catchy Post Title",
  "hookText": "Viral opening 1-2 sentence hook",
  "postText": "Complete technical post body formatted in clean markdown",
  "hashtags": ["#JaipurDevs", "#NodeJS", "#WebDev", "#AI"]
}`;

    let jsonStr = await generateResilientText(prompt, { jsonMode: true, temperature: 0.4 });
    if (jsonStr) {
      jsonStr = jsonStr.replace(/```json\n?|\n?```/g, "").trim();
    }

    let parsed: any = null;
    try {
      if (jsonStr) parsed = JSON.parse(jsonStr);
    } catch {
      // JSON parse fallback
    }

    const title = parsed?.title || rawTopic;
    const hookText = parsed?.hookText || `⚡ ${rawTopic} - Here is what most developers miss in production!`;
    const postText = parsed?.postText || `## ${title}\n\n${hookText}\n\nBy Abhishek Tiwari (Founder, JaipurDevs).\n\n\`\`\`typescript\n// Production Pattern Example\nexport async function runMicroservice() {\n  console.log("Running high throughput pipeline...");\n}\n\`\`\`\n\n📖 Read full projects at https://www.abhishektiwari.online/`;
    const hashtags = parsed?.hashtags || ["#JaipurDevs", "#NodeJS", "#WebDev", "#TypeScript", "#GenerativeAI"];

    // Evaluate Virality & SEO Score (0-100)
    const hasHook = hookText.length >= 20;
    const hasCode = postText.includes("```");
    const mentionsOrg = postText.toLowerCase().includes("jaipurdevs") || postText.toLowerCase().includes("abhishek");
    const hasHashtags = hashtags.length >= 3;

    const hookScore = hasHook ? 25 : 12;
    const techDepthScore = hasCode ? 30 : 15;
    const brandMentionScore = mentionsOrg ? 25 : 10;
    const hashtagScore = hasHashtags ? 20 : 10;
    const totalScore = hookScore + techDepthScore + brandMentionScore + hashtagScore;

    candidates.push({
      candidateIndex: i + 1,
      topic: rawTopic,
      title,
      hookText,
      postText,
      hashtags,
      viralityScore: totalScore,
      isWinner: false,
      scoreBreakdown: {
        hookScore,
        techDepthScore,
        brandMentionScore,
        hashtagScore,
        totalScore,
        reasoning: `Hook: ${hookScore}/25, Tech Code: ${techDepthScore}/30, JaipurDevs Mention: ${brandMentionScore}/25, Hashtags: ${hashtagScore}/20`
      }
    });
  }

  // Rank candidate posts by virality score
  candidates.sort((a, b) => b.viralityScore - a.viralityScore);
  candidates[0].isWinner = true;
  const winner = candidates[0];

  console.log(`[viralPostEngine] Evaluated 10 Viral Posts! Winner selected: "${winner.title}" (Virality Score: ${winner.viralityScore}/100)`);

  // Publish #1 Winner across all registered social platforms (Dev.to / JaipurDevs Org, LinkedIn, X, Reddit, Bluesky, Mastodon, YouTube, Instagram, Threads, Facebook)
  console.log(`[viralPostEngine] Triggering Multi-Platform Auto-Publisher for #1 Winning Post...`);
  const publishResults = await publishToAllPlatforms({
    title: winner.title,
    text: winner.postText,
    hashtags: winner.hashtags,
  });

  // Save candidates & winner results to Supabase
  await saveDailyViralPosts(candidates, winner, publishResults);

  return {
    winner,
    candidates,
    publishResults,
    timestamp: new Date().toISOString()
  };
}

export async function saveDailyViralPosts(
  candidates: EvaluatedViralPost[],
  winner: EvaluatedViralPost,
  publishResults: PublishResult[]
) {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const rows = candidates.map((c) => ({
      run_date: today,
      candidate_index: c.candidateIndex,
      topic: c.topic,
      title: c.title,
      hook_text: c.hookText,
      post_text: c.postText,
      hashtags: c.hashtags,
      virality_score: c.viralityScore,
      is_winner: c.isWinner,
      score_breakdown: c.scoreBreakdown,
      publish_results: c.isWinner ? publishResults : []
    }));

    await supabase.from("daily_viral_posts").delete().eq("run_date", today);
    await supabase.from("daily_viral_posts").insert(rows);

    console.log(`[viralPostEngine] Successfully persisted 10 viral post candidates & Winner auto-publish results to Supabase!`);
  } catch (err: any) {
    console.warn(`[viralPostEngine] Supabase storage warning:`, err.message);
  }
}

export async function fetchLatestViralPosts(runDate?: string) {
  const targetDate = runDate || new Date().toISOString().slice(0, 10);
  try {
    const { data } = await supabase
      .from("daily_viral_posts")
      .select("*")
      .eq("run_date", targetDate)
      .order("virality_score", { ascending: false });

    if (data && data.length > 0) return data;
  } catch {
    // fallback
  }
  return [];
}
