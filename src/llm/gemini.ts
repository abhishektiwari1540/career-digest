import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import type { DigestInput, DigestResult } from "../types.js";
import { generateResilientText } from "./resilientLlm.js";

/**
 * Calls Gemini (or optional Groq / OpenRouter) to generate the daily digest.
 * Provides multi-provider LLM support across Google AI Studio, Groq, and OpenRouter.
 */
export async function summarizeDigest(input: DigestInput): Promise<DigestResult> {
  const prompt = buildPrompt(input);

  const text = await generateResilientText(prompt);
  if (text) {
    return { summaryMarkdown: text };
  }

  console.warn("[llm] No working LLM API key provided or quota limit reached. Generating fallback structured summary.");
  return { summaryMarkdown: buildFallbackMarkdown(input) };
}

export function formatLlmError(err: any): string {
  if (!err) return "Unknown error";
  const rawMsg = typeof err === "string" ? err : err.message || String(err);
  if (typeof rawMsg === "string" && rawMsg.trim().startsWith("{")) {
    try {
      const parsed = JSON.parse(rawMsg);
      if (parsed?.error?.message) {
        const code = parsed.error.code ? `HTTP ${parsed.error.code}` : "API Error";
        const status = parsed.error.status ? ` [${parsed.error.status}]` : "";
        const cleanMessage = parsed.error.message.split("\n")[0].trim();
        return `${code}${status}: ${cleanMessage}`;
      }
    } catch {
      // ignore
    }
  }
  return rawMsg.split("\n")[0].trim();
}

function buildFallbackMarkdown(input: DigestInput): string {
  const topJobs = [...input.jobs]
    .sort((a, b) => (b.skillMatchScore ?? 0) - (a.skillMatchScore ?? 0))
    .slice(0, 5);

  const jobLines = topJobs
    .map((j) => `- **[${j.title}](${j.url})** at ${j.company} (${j.location}) - Match Score: ${j.skillMatchScore}%`)
    .join("\n");

  const trendLines = input.trends
    .slice(0, 5)
    .map((t) => `- [${t.title}](${t.url}) [${t.source}]`)
    .join("\n");

  const eventLines = input.events
    .slice(0, 5)
    .map((e) => `- [${e.title}](${e.url}) - ${e.startsAt || "Upcoming"}`)
    .join("\n");

  return [
    `# Daily Career Digest for ${config.candidateName}`,
    `> *Note: Set GEMINI_API_KEY in .env to enable AI-powered career insights and tailored recommendations.*\n`,
    "## 🎯 Top Matched Job Opportunities",
    jobLines || "No job listings collected today.",
    "\n## 🔥 Trending Tech Topics",
    trendLines || "No trend topics collected today.",
    "\n## 📅 Upcoming Workshops & Hackathons",
    eventLines || "No events collected today.",
  ].join("\n");
}

async function callGroqApi(prompt: string): Promise<string | null> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.groq.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.groq.model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

async function callOpenRouterApi(prompt: string): Promise<string | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.openRouter.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.openRouter.model,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.choices?.[0]?.message?.content || null;
}

async function fallbackRestGenerate(prompt: string): Promise<DigestResult> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.gemini.model}:generateContent?key=${config.gemini.apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const text: string =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "(No summary generated.)";

  return { summaryMarkdown: text };
}

function buildPrompt(input: DigestInput): string {
  const topJobs = [...input.jobs]
    .sort((a, b) => (b.skillMatchScore ?? 0) - (a.skillMatchScore ?? 0))
    .slice(0, 10);

  const linkedinSummary = (input.linkedinPosts || [])
    .slice(0, 5)
    .map((p) => `- [${p.postedAt || "Post"}]: ${p.content.slice(0, 150)}...`)
    .join("\n");

  const projectSummary = (input.projects || [])
    .map((pr) => `- ${pr.title}: ${pr.description} (Skills: ${pr.skills.join(", ")})`)
    .join("\n");

  const brandSummary = (input.brandCitations || [])
    .map((b) => `- ${b.platform}: ${b.status} (${b.indexedCount} citations)`)
    .join("\n");

  return [
    `You are drafting a daily personalized career digest for ${config.candidateName} based in ${config.candidateLocation}.`,
    "Be concise, actionable, and structured. Do not invent unverified facts.",
    "Output clean GitHub-flavored markdown with the following clear sections:",
    "1. 🎯 Top Matched Job Opportunities (Mention skill match score as-is)",
    "2. 🔥 Trending Tech Topics & Content Creation Recommendations (Cross-reference trends with past post history & project work)",
    "3. 📅 Free Workshops, GDG Events, Hackathons & Upskilling Opportunities",
    "4. 🌐 Developer Brand SEO & Profile Visibility Overview",
    "",
    `Candidate Profile & Stated Skills: ${input.profileSkills.join(", ") || "(none set)"}`,
    "",
    "Imported Past LinkedIn Post Highlights:",
    linkedinSummary || "(No past LinkedIn post history imported yet)",
    "",
    "Stored Personal Projects Portfolio:",
    projectSummary || "(No custom projects stored yet)",
    "",
    "Developer Brand Citations & SEO Status:",
    brandSummary || "(Baseline platform profiles active)",
    "",
    "Today's Scraped Job Listings (Adzuna + Remotive + Jobicy):",
    JSON.stringify(topJobs, null, 2),
    "",
    "Today's Scraped Trend Topics (HackerNews + dev.to + GitHub Trending + Reddit r/developersIndia):",
    JSON.stringify(input.trends, null, 2),
    "",
    "Today's Scraped Events, Hackathons & Workshops (GDG Jaipur + Dev.to + Devpost):",
    JSON.stringify(input.events, null, 2),
  ].join("\n");
}


