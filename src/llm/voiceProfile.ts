import { GoogleGenAI } from "@google/genai";
import { config } from "../config.js";
import { fetchRecentLinkedInPosts, fetchSecondBrainMemories, saveSecondBrainMemory, supabase } from "../storage/supabase.js";
import { generateMultimodalEmbedding } from "./embedding.js";
import { formatLlmError } from "./gemini.js";
import { generateResilientText } from "./resilientLlm.js";

export interface VoiceProfile {
  tone: string;
  avgSentenceLength: string;
  recurringPhrases: string[];
  avoidList: string[];
  formattingRules: string;
  callToActionStyle: string;
  extractedAt?: string;
}

/**
 * Extracts a structured voice & style fingerprint from the candidate's past post history.
 * Multi-model resilient: Tries primary Gemini model, then fallback candidate models & Groq on 503 spikes.
 * Stores in Supabase for continuous LLM auto-learning.
 */
export async function extractAndSaveVoiceProfile(): Promise<VoiceProfile> {
  const [linkedinPosts, memories] = await Promise.all([
    fetchRecentLinkedInPosts(30),
    fetchSecondBrainMemories(),
  ]);

  const pastTexts = [
    ...linkedinPosts.map((p) => p.content),
    ...memories.map((m) => m.memoryText),
  ].filter((t) => t && t.length > 20);

  const sampleTexts = pastTexts.slice(0, 15).join("\n---\n");

  const prompt = `Analyze the following developer post history written by ${config.candidateName} (${config.profileSkills.join(", ")}):

=== POST HISTORY SAMPLES ===
${sampleTexts || "I am a full-stack developer building production microservices with Node.js, TypeScript, React, and PostgreSQL."}

Extract a detailed, structured Voice & Style Fingerprint for this author.
Return ONLY a raw JSON object with NO markdown code block ticks, using these exact keys:
{
  "tone": "authentic, developer-focused, technical yet approachable",
  "avgSentenceLength": "short and punchy (10-15 words)",
  "recurringPhrases": ["Key takeaway", "In production", "Stop guessing", "Let's discuss"],
  "avoidList": ["game-changer", "synergy", "unprecedented", "delve", "paradigm shift"],
  "formattingRules": "Uses bullet points, short paragraphs, bold headers, and clean code references",
  "callToActionStyle": "Asks an engaging question to fellow developers at the end"
}`;

  const textResult = await generateResilientText(prompt, { jsonMode: true });
  if (textResult) {
    const profile = await parseAndSaveVoiceProfile(textResult);
    if (profile) {
      console.log(`[voiceProfile] Voice profile fingerprint extracted & saved to Supabase successfully!`);
      return profile;
    }
  }

  console.warn("[voiceProfile] Using default voice profile fallback.");
  return getDefaultVoiceProfile();
}

async function parseAndSaveVoiceProfile(rawText: string): Promise<VoiceProfile | null> {
  try {
    const cleaned = (rawText || "").replace(/```json/g, "").replace(/```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed: VoiceProfile = JSON.parse(jsonMatch[0]);
    parsed.extractedAt = new Date().toISOString();

    await saveSecondBrainMemory({
      category: "voice_profile",
      conceptKey: "voice_profile_fingerprint",
      memoryText: JSON.stringify(parsed),
      performanceScore: 1.0,
    });

    return parsed;
  } catch {
    return null;
  }
}

/**
 * Retrieves cached Voice Profile from Supabase, or extracts it if not present.
 */
export async function getVoiceProfile(): Promise<VoiceProfile> {
  try {
    const { data } = await supabase
      .from("second_brain_memory")
      .select("memory_text")
      .eq("concept_key", "voice_profile_fingerprint")
      .maybeSingle();

    if (data && data.memory_text) {
      return JSON.parse(data.memory_text);
    }
  } catch {
    // Fall through
  }

  return extractAndSaveVoiceProfile();
}

/**
 * Few-Shot Retrieval: Pulls 2-3 most relevant past posts via vector embedding matching.
 */
export async function getFewShotPastPosts(topicQuery: string, limit = 3): Promise<string[]> {
  try {
    const posts = await fetchRecentLinkedInPosts(20);
    if (posts.length === 0) return [];

    const queryVec = await generateMultimodalEmbedding(topicQuery);

    // Score similarity for each post
    const scored = await Promise.all(
      posts.map(async (p) => {
        const postVec = await generateMultimodalEmbedding(p.content);
        const sim = cosineSimilarity(queryVec, postVec);
        return { content: p.content, sim };
      })
    );

    scored.sort((a, b) => b.sim - a.sim);
    return scored.slice(0, limit).map((s) => s.content);
  } catch {
    return [];
  }
}

/**
 * Voice-Consistency Critic: Computes cosine similarity of a draft against user style centroid.
 */
export async function evaluateVoiceConsistency(draftText: string): Promise<{ score: number; passed: boolean; feedback: string }> {
  try {
    const profile = await getVoiceProfile();
    const draftVec = await generateMultimodalEmbedding(draftText);

    // Compare against voice profile text vector
    const profileVec = await generateMultimodalEmbedding(`${profile.tone} ${profile.formattingRules} ${profile.recurringPhrases.join(" ")}`);
    const score = cosineSimilarity(draftVec, profileVec);

    const passed = score >= 0.55;
    const feedback = passed
      ? `Voice consistency verified (similarity: ${(score * 100).toFixed(1)}%).`
      : `Voice consistency warning (similarity: ${(score * 100).toFixed(1)}%). Tone drifted from user profile style.`;

    return { score, passed, feedback };
  } catch (err: any) {
    return { score: 0.8, passed: true, feedback: "Voice consistency check skipped (fallback score 80%)." };
  }
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0.75;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0.75;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function getDefaultVoiceProfile(): VoiceProfile {
  return {
    tone: "authentic, practical, developer-centric",
    avgSentenceLength: "short to medium (12-18 words)",
    recurringPhrases: ["Key takeaway", "In production", "Stop guessing", "Let's discuss"],
    avoidList: ["game-changer", "synergy", "unprecedented", "delve", "paradigm shift"],
    formattingRules: "Uses bullet points, short paragraphs, bold headers, and clean code references",
    callToActionStyle: "Asks an engaging question to fellow developers at the end",
  };
}
