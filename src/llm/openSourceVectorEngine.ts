import { config } from "../config.js";
import { generateMultimodalEmbedding } from "./embedding.js";
import {
  cosineSimilarity,
  fetchMultimodalVectors,
  saveMultimodalVector,
  supabase,
} from "../storage/supabase.js";
import type { OpenSourceIssue, OpenSourceRepo, OpenSourceWeeklyDigest } from "./openSourceEngine.js";

export interface VectorDecisionMatch {
  repoId: string;
  repoFullName: string;
  repoUrl: string;
  category: string;
  primaryLanguage: string;
  stars: number;
  issue: OpenSourceIssue;
  similarityScore: number; // 0-100%
  fastDecisionScore: number; // 0-100%
  decisionRank: number;
  decisionTag: string; // e.g. "⭐ #1 Top Fast Win", "🚀 High Impact PR"
  decisionReasoning: string;
}

// In-Memory cache of issue vectors for sub-10ms queries
const inMemoryVectorCache: Map<string, { vector: number[]; metadata: any }> = new Map();

/**
 * Calculates a Fast Decision Score (0-100) combining:
 * 1. Stack Fit with Abhishek Tiwari (Laravel, Node.js, TypeScript, React, Supabase, AI)
 * 2. Speed to Solve & Merge (Difficulty + Estimated Hours)
 * 3. PR Impact & Resume Leverage
 */
export function calculateDecisionScore(
  repo: { category: string; primaryLanguage: string; fullName: string },
  issue: OpenSourceIssue
): { fastDecisionScore: number; decisionTag: string; decisionReasoning: string } {
  const analysis = issue.analysis;
  const impact = analysis?.impactScore || 90;
  const hoursStr = (analysis?.estimatedHours || "2-3 hours").toLowerCase();
  const difficulty = analysis?.difficulty || "Intermediate";

  // 1. Speed factor (0-100)
  let speedScore = 80;
  if (hoursStr.includes("1-2") || hoursStr.includes("1 hr") || hoursStr.includes("quick")) {
    speedScore = 98;
  } else if (hoursStr.includes("2-3")) {
    speedScore = 90;
  } else if (hoursStr.includes("3-4")) {
    speedScore = 82;
  }

  if (difficulty === "Beginner") speedScore = Math.min(100, speedScore + 8);
  if (difficulty === "Advanced") speedScore = Math.max(70, speedScore - 10);

  // 2. Stack alignment factor (0-100)
  let stackScore = 88;
  const lang = (repo.primaryLanguage || "").toLowerCase();
  const cat = (repo.category || "").toLowerCase();

  if (cat.includes("laravel") || lang.includes("php") || repo.fullName.includes("filament") || repo.fullName.includes("livewire") || repo.fullName.includes("spatie")) {
    stackScore = 99; // Top core mastery
  } else if (cat.includes("node") || lang.includes("typescript") || lang.includes("javascript")) {
    stackScore = 96;
  } else if (cat.includes("react") || cat.includes("frontend")) {
    stackScore = 94;
  } else if (cat.includes("ai") || cat.includes("llm")) {
    stackScore = 95;
  }

  // Composite Fast Decision Score
  const fastDecisionScore = Math.round(stackScore * 0.4 + impact * 0.35 + speedScore * 0.25);

  let decisionTag = "🚀 High Impact PR";
  let decisionReasoning = `Solid match for ${repo.primaryLanguage} with ${analysis?.estimatedHours || "2-3h"} turnaround and ready code patch.`;

  if (fastDecisionScore >= 96) {
    decisionTag = "⭐ #1 Best Fast Win";
    decisionReasoning = `Top skill alignment (${repo.primaryLanguage}), rapid turnaround (${analysis?.estimatedHours || "1-2h"}), and complete production patch ready to submit.`;
  } else if (fastDecisionScore >= 92) {
    decisionTag = "⚡ Rapid Solution";
    decisionReasoning = `High impact (${impact}/100) with clear root-cause diagnosis. Excellent leverage for your portfolio.`;
  } else {
    decisionTag = "💡 Great Learning Opportunity";
    decisionReasoning = `Deepens architecture in ${repo.category}. Complete test strategy provided.`;
  }

  return { fastDecisionScore, decisionTag, decisionReasoning };
}

/**
 * Builds rich semantic content text for an open-source issue to vectorize
 */
export function buildIssueSemanticText(repo: OpenSourceRepo, issue: OpenSourceIssue): string {
  const analysis = issue.analysis;
  return `Repository: ${repo.fullName}
Category: ${repo.category}
Primary Language: ${repo.primaryLanguage}
Description: ${repo.description}
Why Fits: ${repo.whyFitsProfile}
Issue #${issue.number}: ${issue.title}
Issue Body: ${issue.body.slice(0, 400)}
Problem Diagnosis: ${analysis?.problemDiagnosis || ""}
Root Cause: ${analysis?.rootCause || ""}
Difficulty: ${analysis?.difficulty || "Intermediate"}
Estimated Time: ${analysis?.estimatedHours || "2-3 hours"}
Target Files: ${(analysis?.filesToModify || []).join(", ")}
PR Title: ${analysis?.prTitle || ""}
Tech Stack: Laravel, PHP, TypeScript, Node.js, React, Supabase, pgvector, MySQL, AI Agents`;
}

/**
 * Syncs all 10 repositories and their issues into Supabase multimodal_vectors table
 * and updates in-memory vector cache.
 */
export async function syncOpenSourceToVectorDb(digest: OpenSourceWeeklyDigest): Promise<{
  syncedCount: number;
  totalVectors: number;
}> {
  let syncedCount = 0;

  for (const repo of digest.repositories || []) {
    for (const issue of repo.issues || []) {
      const conceptKey = `os_issue_${repo.id}_${issue.number}`;
      const semanticText = buildIssueSemanticText(repo, issue);
      const vector = await generateMultimodalEmbedding(semanticText);

      const decision = calculateDecisionScore(repo, issue);
      const metadata = {
        repoId: repo.id,
        repoFullName: repo.fullName,
        repoUrl: repo.url,
        category: repo.category,
        primaryLanguage: repo.primaryLanguage,
        stars: repo.stars,
        issueNumber: issue.number,
        issueTitle: issue.title,
        issueUrl: issue.url,
        difficulty: issue.analysis?.difficulty || "Intermediate",
        estimatedHours: issue.analysis?.estimatedHours || "2-3 hours",
        impactScore: issue.analysis?.impactScore || 92,
        fastDecisionScore: decision.fastDecisionScore,
        decisionTag: decision.decisionTag,
        decisionReasoning: decision.decisionReasoning,
        prTitle: issue.analysis?.prTitle || "",
        filesToModify: issue.analysis?.filesToModify || [],
        indexedAt: new Date().toISOString(),
      };

      // Store in memory
      inMemoryVectorCache.set(conceptKey, { vector, metadata });

      // Persist to Supabase multimodal_vectors
      await saveMultimodalVector(conceptKey, "open_source_issue", vector, metadata);
      syncedCount++;
    }
  }

  return { syncedCount, totalVectors: inMemoryVectorCache.size };
}

/**
 * Performs Semantic Vector Search across Open-Source Issues & Repositories
 * Computes cosine distance against user query vector to find the fastest, best decision PR.
 */
export async function searchOpenSourceWithVectorDb(
  digest: OpenSourceWeeklyDigest,
  query: string,
  categoryFilter?: string
): Promise<VectorDecisionMatch[]> {
  const queryText = (query || "").trim();
  const queryVector = queryText
    ? await generateMultimodalEmbedding(queryText)
    : await generateMultimodalEmbedding("Laravel PHP Node.js TypeScript fast bug fix good first issue ready patch");

  const matches: VectorDecisionMatch[] = [];

  for (const repo of digest.repositories || []) {
    if (categoryFilter && categoryFilter !== "all" && repo.category !== categoryFilter) {
      continue;
    }

    for (const issue of repo.issues || []) {
      const conceptKey = `os_issue_${repo.id}_${issue.number}`;
      let issueVector = inMemoryVectorCache.get(conceptKey)?.vector;

      if (!issueVector || issueVector.length === 0) {
        const text = buildIssueSemanticText(repo, issue);
        issueVector = await generateMultimodalEmbedding(text);
        const decision = calculateDecisionScore(repo, issue);
        inMemoryVectorCache.set(conceptKey, {
          vector: issueVector,
          metadata: {
            repoId: repo.id,
            fastDecisionScore: decision.fastDecisionScore,
            decisionTag: decision.decisionTag,
            decisionReasoning: decision.decisionReasoning,
          },
        });
      }

      const rawSimilarity = cosineSimilarity(queryVector, issueVector);
      // Map cosine similarity (-1 to 1) to clean 0-100 percentage
      const similarityScore = Math.min(100, Math.max(50, Math.round(((rawSimilarity + 1) / 2) * 100)));
      const decision = calculateDecisionScore(repo, issue);

      // Enhance issue object with decision metadata
      const enhancedIssue: OpenSourceIssue = {
        ...issue,
        analysis: issue.analysis
          ? {
              ...issue.analysis,
            }
          : undefined,
      };

      matches.push({
        repoId: repo.id,
        repoFullName: repo.fullName,
        repoUrl: repo.url,
        category: repo.category,
        primaryLanguage: repo.primaryLanguage,
        stars: repo.stars,
        issue: enhancedIssue,
        similarityScore,
        fastDecisionScore: decision.fastDecisionScore,
        decisionRank: 0,
        decisionTag: decision.decisionTag,
        decisionReasoning: decision.decisionReasoning,
      });
    }
  }

  // Sort by combined score: 50% Vector Semantic Match + 50% Fast Decision Score
  matches.sort((a, b) => {
    const scoreA = a.similarityScore * 0.5 + a.fastDecisionScore * 0.5;
    const scoreB = b.similarityScore * 0.5 + b.fastDecisionScore * 0.5;
    return scoreB - scoreA;
  });

  // Assign decision rank
  matches.forEach((m, idx) => {
    m.decisionRank = idx + 1;
    if (idx === 0) {
      m.decisionTag = "⭐ Top Recommendation (Fastest Win)";
    }
  });

  return matches;
}
