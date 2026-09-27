import { FunctionTool, InMemoryRunner, LlmAgent, SequentialAgent } from "@google/adk";
import { z } from "zod";
import { config } from "../config.js";
import { fetchRecentLinkedInPosts, fetchSecondBrainMemories, supabase } from "../storage/supabase.js";

/**
 * ADK FunctionTool: Check Duplicate Topic
 * Checks if a topic was already posted about in the last 30 days in Supabase.
 */
export const checkDuplicateTopic = new FunctionTool({
  name: "check_duplicate_topic",
  description: "Checks if a topic or concept was already posted about in the last 30 days to prevent redundant content.",
  parameters: z.object({
    topic: z.string().describe("The topic or keyword to check for duplicates, e.g., 'TypeScript microservices'."),
  }),
  execute: async ({ topic }) => {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
      const { data } = await supabase
        .from("second_brain_memory")
        .select("post_text, concept_key, created_at")
        .ilike("post_text", `%${topic}%`)
        .gte("created_at", thirtyDaysAgo)
        .limit(5);

      const isDuplicate = Boolean(data && data.length > 0);
      return {
        isDuplicate,
        matchingPostsCount: data?.length || 0,
        recentMatches: data || [],
      };
    } catch (err: any) {
      console.warn("[adk:tool:checkDuplicateTopic] warning:", err.message);
      return { isDuplicate: false, matchingPostsCount: 0, recentMatches: [] };
    }
  },
});

/**
 * ADK FunctionTool: Score Job Match
 * Evaluates how closely a job listing matches the candidate's target skill profile.
 */
export const scoreJobMatch = new FunctionTool({
  name: "score_job_match",
  description: "Scores how well a job listing matches the user's skill profile (0-100 score).",
  parameters: z.object({
    jobTitle: z.string().describe("Job position title"),
    jobDescription: z.string().describe("Job description snippet or requirements"),
  }),
  execute: async ({ jobTitle, jobDescription }) => {
    const skills = config.profileSkills.length > 0 ? config.profileSkills : ["typescript", "node", "react", "postgres"];
    const text = `${jobTitle} ${jobDescription}`.toLowerCase();
    
    let matchedCount = 0;
    const matchedSkills: string[] = [];

    for (const skill of skills) {
      if (text.includes(skill.toLowerCase())) {
        matchedCount++;
        matchedSkills.push(skill);
      }
    }

    const matchScore = Math.min(100, Math.round((matchedCount / Math.max(1, skills.length)) * 100 + 20));
    return {
      matchScore,
      matchedSkills,
      totalCandidateSkills: skills.length,
    };
  },
});

/**
 * ADK FunctionTool: Fetch Past Memory
 * Queries historical post feedback and second brain memories.
 */
export const fetchPastMemory = new FunctionTool({
  name: "fetch_past_memory",
  description: "Fetches recent second brain memory items and top-performing post history.",
  parameters: z.object({
    category: z.string().optional().describe("Memory category filter e.g. 'linkedin_export', 'google_chat', 'resume_bio'"),
  }),
  execute: async ({ category }) => {
    try {
      const memories = await fetchSecondBrainMemories();
      const filtered = category
        ? memories.filter((m) => m.category.toLowerCase().includes(category.toLowerCase()))
        : memories;

      return {
        count: filtered.length,
        memories: filtered.slice(0, 5),
      };
    } catch (err: any) {
      return { count: 0, memories: [] };
    }
  },
});

/**
 * ADK LLM Agent: Second Brain Agent
 */
export const secondBrainAgent = new LlmAgent({
  name: "second_brain_agent",
  model: config.gemini.model || "gemini-3.6-flash",
  instruction: `You are an expert developer career & social content Second Brain agent.
  Given today's collected jobs, web trends, YouTube videos, and user profile context:
  1. Use 'check_duplicate_topic' to ensure the proposed topic hasn't been posted in 30 days.
  2. Use 'score_job_match' if analyzing developer job listings.
  3. Use 'fetch_past_memory' to retrieve past high-performing writing styles.
  4. Produce a high-value, authentic developer post proposal with LinkedIn post, Dev.to/Blog title, X post, and artwork prompt.`,
  tools: [checkDuplicateTopic, scoreJobMatch, fetchPastMemory],
});

/**
 * Runs the ADK Second Brain Agent with InMemoryRunner.
 * Includes graceful fallback if ADK runner encounters API/environment limits.
 */
export async function runSecondBrainADKAgent(dailyInput: string): Promise<string | null> {
  if (!config.gemini.apiKey) {
    console.warn("[adk] GEMINI_API_KEY not configured. Skipping ADK agent execution.");
    return null;
  }

  try {
    console.log("[adk] Executing Google ADK Second Brain Agent pipeline...");
    const runner = new InMemoryRunner({ agent: secondBrainAgent });
    const session = await runner.sessionService.createSession({
      appName: runner.appName,
      userId: "abhishek_second_brain",
    });

    const events: any[] = [];
    for await (const event of runner.runAsync({
      userId: "abhishek_second_brain",
      sessionId: session.id,
      newMessage: { role: "user", parts: [{ text: dailyInput }] },
    })) {
      events.push(event);
    }

    const finalEvent = events.at(-1);
    if (finalEvent && finalEvent.content) {
      const textOutput = typeof finalEvent.content === "string"
        ? finalEvent.content
        : JSON.stringify(finalEvent.content);

      console.log(`[adk] Second Brain Agent run completed successfully (${events.length} workflow events captured).`);
      return textOutput;
    }

    return null;
  } catch (err: any) {
    console.warn("[adk] ADK Agent run warning (falling back gracefully):", err.message);
    return null;
  }
}
