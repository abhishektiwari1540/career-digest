import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import {
  buildPromptContext,
  fetchLatestContentPack,
  fetchSecondBrainMemories,
  saveContentPack,
  saveSecondBrainMemory,
} from "../storage/supabase.js";
import { HASHTAG_LIMITS, type ContentPack, type ContentPackItem, type DigestInput, type PlatformType } from "../types.js";
import { formatLlmError } from "./gemini.js";
import { generateImageUrl } from "./imageGenerator.js";
import { generateResilientText } from "./resilientLlm.js";
import { runSecondBrainADKAgent } from "./secondBrainAgent.js";

/**
 * Generates a ready-to-publish Multi-Platform Content Pack using Gemini AI & Second Brain Memory feedback loop.
 * Produces platform-enforced ContentPackItems for LinkedIn, X, dev.to, Reddit, Instagram,
 * along with hashtag limits and generated artwork URLs via Pollinations.ai.
 */
export async function getOrGenerateContentPack(input: DigestInput): Promise<ContentPack | null> {
  const today = new Date().toISOString().slice(0, 10);

  // Check if a recent content pack was generated within the last 24h/48h
  const latestPack = await fetchLatestContentPack();
  if (latestPack) {
    const packDate = new Date(latestPack.target_date || latestPack.created_at);
    const diffHours = Math.floor((new Date().getTime() - packDate.getTime()) / (1000 * 3600));

    if (diffHours < 20) {
      console.log(`[contentEngine] Using existing Content Pack generated on ${latestPack.target_date} (${diffHours}h old).`);
      return {
        targetDate: latestPack.target_date,
        topic: latestPack.topic,
        linkedinPost: latestPack.linkedin_post,
        twitterPost: latestPack.twitter_post,
        blogOutline: latestPack.blog_outline,
        redditPost: latestPack.reddit_post,
        hashtags: latestPack.hashtags || [],
        imagePrompt: latestPack.image_prompt,
        items: latestPack.items || [],
      };
    }
  }

  console.log(`[contentEngine] Generating fresh Multi-Platform Content Pack for ${today}...`);
  const newPack = await generateNewContentPack(input, today);

  if (newPack) {
    await saveContentPack(newPack);
    const conceptKey = `topic_${newPack.topic.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 40)}`;
    await saveSecondBrainMemory({
      category: "PastPost",
      conceptKey,
      memoryText: `Covered post topic on ${today}: ${newPack.topic}`,
      platform: "linkedin",
      postText: newPack.linkedinPost.slice(0, 200),
      performanceScore: 0.85,
    });
  }

  return newPack;
}

async function generateNewContentPack(input: DigestInput, targetDate: string): Promise<ContentPack | null> {
  const memories = await fetchSecondBrainMemories();
  const feedbackContext = await buildPromptContext();
  const pastTopics = memories.map((m) => `- ${m.memoryText}`).join("\n");

  const topTrends = input.trends.slice(0, 8).map((t) => `- ${t.title} (${t.source})`).join("\n");
  const projectsSummary = (input.projects || []).map((p) => `- ${p.title}: ${p.description}`).join("\n");

  const prompt = [
    `You are the personal AI Branding Director and Second Brain for ${config.candidateName}, based in ${config.candidateLocation}.`,
    `Candidate Skills: ${input.profileSkills.join(", ") || "TypeScript, Node.js, React, Web Development"}.`,
    "",
    "=== RECENT HIGH-PERFORMING POST FEEDBACK (ADAPT TONE) ===",
    feedbackContext,
    "",
    "=== RECENT TRENDING TECH TOPICS ===",
    topTrends || "(No trends retrieved today)",
    "",
    "=== CANDIDATE PROJECTS PORTFOLIO ===",
    projectsSummary || "(No projects recorded)",
    "",
    "=== SECOND BRAIN MEMORY (DO NOT REPEAT THESE TOPICS) ===",
    pastTopics || "(No past topics recorded yet)",
    "",
    "Draft a fresh, highly engaging Multi-Platform Content Package.",
    "Return ONLY a raw JSON object with NO markdown code block ticks. Use exact keys:",
    "{",
    '  "topic": "Core catchy topic title",',
    '  "linkedinPost": "Full ready-to-post LinkedIn text with a strong hook, key bullet points, personal insight, and CTA.",',
    '  "twitterPost": "Punchy 280-char tweet or multi-tweet thread format.",',
    '  "blogOutline": "dev.to / Medium article title and technical outline with code snippet ideas.",',
    '  "redditPost": "r/developersIndia community question or discussion prompt.",',
    '  "instagramPost": "Engaging visual caption with emoji bullets.",',
    '  "hashtags": ["#TypeScript", "#WebDev", "#SoftwareEngineering"],',
    '  "needsImage": true,',
    '  "imagePrompt": "Detailed prompt for Pollinations/Midjourney to generate visual artwork matching post theme."',
    "}",
  ].join("\n");

  // 1. Try Google ADK Agent
  if (config.gemini.apiKey) {
    try {
      const adkResult = await runSecondBrainADKAgent(prompt);
      if (adkResult) {
        const pack = await parseAndBuildContentPack(adkResult, targetDate);
        if (pack) return pack;
      }
    } catch (adkErr: any) {
      console.warn("[contentEngine] ADK Agent note (falling back to resilient LLM engine):", adkErr.message);
    }
  }

  // 2. Try Resilient Multi-Provider LLM Engine
  const textResult = await generateResilientText(prompt, { jsonMode: true });
  if (textResult) {
    const pack = await parseAndBuildContentPack(textResult, targetDate);
    if (pack) {
      console.log(`[contentEngine] Successfully generated Content Pack for ${targetDate}!`);
      return pack;
    }
  }

  return createFallbackContentPack(input, targetDate);
}

async function createFallbackContentPack(input: DigestInput, targetDate: string): Promise<ContentPack> {
  const topTrend = input.trends[0]?.title || "Modern Full-Stack Development";
  const imagePrompt = `Isometric 3D artwork of a developer desk for ${topTrend}, modern dark theme, 8k render`;
  const imageUrl = await generateImageUrl(imagePrompt);
  const rawTags = ["#DevelopersIndia", "#WebDev", "#SoftwareEngineering", "#TechTrends"];

  return {
    targetDate,
    topic: `Insights on ${topTrend}`,
    linkedinPost: `🚀 Excited to share key insights on ${topTrend}!\n\nAs a developer building modern web applications with ${input.profileSkills.slice(0, 3).join(", ")}, staying ahead of ecosystem shifts is essential.\n\n💡 Key Takeaway:\n- Continuous learning & active project building beats passive reading.\n- Focus on clean architecture, API reliability, and developer experience.\n\nWhat are your thoughts on this trend? Let's discuss in the comments below! 👇`,
    twitterPost: `🔥 Quick breakdown on ${topTrend}:\n1. Build in public\n2. Focus on architecture\n3. Iterate fast\n\nWhat tools are you using this week? 💻`,
    blogOutline: `Article Title: Deep Dive into ${topTrend}\n- Intro: Why ${topTrend} matters now\n- Implementation Guide\n- Code Snippet & Best Practices\n- Conclusion`,
    redditPost: `Hey r/developersIndia! How are you approaching ${topTrend} in production? Would love to learn how teams are handling this.`,
    hashtags: rawTags.slice(0, HASHTAG_LIMITS.linkedin),
    imagePrompt,
    items: [
      {
        platform: "linkedin",
        postText: `Insights on ${topTrend}`,
        hashtags: rawTags.slice(0, HASHTAG_LIMITS.linkedin),
        needsImage: true,
        imagePrompt,
        imageUrl,
      },
      {
        platform: "x",
        postText: `Quick breakdown on ${topTrend}`,
        hashtags: rawTags.slice(0, HASHTAG_LIMITS.x),
        needsImage: true,
        imagePrompt,
        imageUrl,
      },
    ],
  };
}

async function parseAndBuildContentPack(rawText: string, targetDate: string): Promise<ContentPack | null> {
  try {
    const cleanedText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);

    const topic = parsed.topic || "Developer Growth & Tech Trends";
    const imagePrompt = parsed.imagePrompt || `Modern minimalist tech artwork for ${topic}`;
    const needsImage = parsed.needsImage ?? true;
    const imageUrl = needsImage ? await generateImageUrl(imagePrompt) : undefined;
    const rawTags = Array.isArray(parsed.hashtags) ? parsed.hashtags : ["#Tech", "#SoftwareDevelopment"];

    const items: ContentPackItem[] = [
      {
        platform: "linkedin",
        postText: parsed.linkedinPost || "",
        hashtags: rawTags.slice(0, HASHTAG_LIMITS.linkedin),
        needsImage,
        imagePrompt,
        imageUrl,
      },
      {
        platform: "x",
        postText: parsed.twitterPost || "",
        hashtags: rawTags.slice(0, HASHTAG_LIMITS.x),
        needsImage,
        imagePrompt,
        imageUrl,
      },
      {
        platform: "devto",
        postText: parsed.blogOutline || "",
        hashtags: rawTags.slice(0, HASHTAG_LIMITS.devto),
        needsImage,
        imagePrompt,
        imageUrl,
      },
      {
        platform: "reddit",
        postText: parsed.redditPost || "",
        hashtags: [],
        needsImage: false,
      },
      {
        platform: "instagram",
        postText: parsed.instagramPost || parsed.linkedinPost || "",
        hashtags: rawTags.slice(0, HASHTAG_LIMITS.instagram),
        needsImage: true,
        imagePrompt,
        imageUrl,
      },
    ];

    return {
      targetDate,
      topic,
      linkedinPost: parsed.linkedinPost || "",
      twitterPost: parsed.twitterPost || "",
      blogOutline: parsed.blogOutline || "",
      redditPost: parsed.redditPost || "",
      hashtags: rawTags.slice(0, HASHTAG_LIMITS.linkedin),
      imagePrompt,
      items,
    };
  } catch (err: any) {
    return null;
  }
}
