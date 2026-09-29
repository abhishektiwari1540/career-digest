import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";
import type {
  BrandCitation,
  EventItem,
  JobListing,
  LinkedInPostContext,
  ProjectContext,
  TrendTopic,
} from "../types.js";

export const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

export async function upsertJobListings(jobs: JobListing[]) {
  if (jobs.length === 0) return;
  const rows = jobs.map((j) => ({
    source: j.source,
    external_id: j.externalId,
    title: j.title,
    company: j.company,
    location: j.location,
    url: j.url,
    description_snippet: j.descriptionSnippet,
    skill_match_score: j.skillMatchScore ?? null,
    match_reasoning: j.matchReasoning ?? null,
  }));
  const { error } = await supabase.from("job_listings").upsert(rows, {
    onConflict: "source,external_id",
  });
  if (error) {
    console.warn("[supabase] job_listings table warning (run supabase/schema.sql in your Supabase SQL Editor):", error.message);
  }
}

export async function upsertTrendTopics(trends: TrendTopic[]) {
  if (trends.length === 0) return;
  const rows = trends.map((t) => ({
    source: t.source,
    external_id: t.externalId,
    title: t.title,
    url: t.url,
    relevance_note: t.relevanceNote ?? null,
  }));
  const { error } = await supabase.from("trend_topics").upsert(rows, {
    onConflict: "source,external_id",
  });
  if (error) {
    console.warn("[supabase] trend_topics table warning (run supabase/schema.sql in your Supabase SQL Editor):", error.message);
  }
}

export async function insertEvents(events: EventItem[]) {
  if (events.length === 0) return;
  const rows = events.map((e) => ({
    source: e.source,
    title: e.title,
    url: e.url,
    starts_at: e.startsAt,
    category: e.category ?? "Event",
    location: e.location ?? null,
  }));
  const { error } = await supabase.from("events").insert(rows);
  if (error) {
    console.warn("[supabase] events table warning (run supabase/schema.sql in your Supabase SQL Editor):", error.message);
  }
}

export async function upsertBrandCitations(citations: BrandCitation[]) {
  if (!citations || citations.length === 0) return;
  const rows = citations.map((c) => ({
    platform: c.platform,
    query: c.query,
    indexed_count: c.indexedCount,
    sample_url: c.sampleUrl ?? null,
    status: c.status,
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("brand_citations").upsert(rows, {
    onConflict: "platform",
  });
  if (error) {
    console.warn("[supabase] brand_citations table warning (run supabase/schema.sql in your Supabase SQL Editor):", error.message);
  }
}

export async function fetchRecentLinkedInPosts(limit = 5): Promise<LinkedInPostContext[]> {
  try {
    const { data, error } = await supabase
      .from("linkedin_posts")
      .select("posted_at, content, url")
      .order("posted_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data.map((d) => ({
      postedAt: d.posted_at,
      content: d.content,
      url: d.url,
    }));
  } catch {
    return [];
  }
}

export async function fetchProjectsPortfolio(): Promise<ProjectContext[]> {
  try {
    const { data, error } = await supabase
      .from("projects")
      .select("title, description, skills, url");

    if (error || !data) return [];
    return data.map((d) => ({
      title: d.title,
      description: d.description,
      skills: d.skills || [],
      url: d.url,
    }));
  } catch {
    return [];
  }
}

export async function recordDailyReport(params: {
  reportDate: string; // YYYY-MM-DD
  summaryMarkdown: string;
  jobCount: number;
  trendCount: number;
  eventCount: number;
}) {
  const { error } = await supabase.from("daily_reports").upsert(
    {
      report_date: params.reportDate,
      summary_markdown: params.summaryMarkdown,
      job_count: params.jobCount,
      trend_count: params.trendCount,
      event_count: params.eventCount,
    },
    { onConflict: "report_date" }
  );
  if (error) {
    console.warn("[supabase] daily_reports table warning (run supabase/schema.sql in your Supabase SQL Editor):", error.message);
  }
}

export async function fetchLatestContentPack(): Promise<any | null> {
  try {
    const { data, error } = await supabase
      .from("content_ideas")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export async function saveContentPack(pack: {
  targetDate: string;
  topic: string;
  linkedinPost: string;
  twitterPost: string;
  blogOutline: string;
  redditPost: string;
  hashtags: string[];
  imagePrompt: string;
}) {
  try {
    const { error } = await supabase.from("content_ideas").insert({
      target_date: pack.targetDate,
      topic: pack.topic,
      linkedin_post: pack.linkedinPost,
      twitter_post: pack.twitterPost,
      blog_outline: pack.blogOutline,
      reddit_post: pack.redditPost,
      hashtags: pack.hashtags,
      image_prompt: pack.imagePrompt,
    });
    if (error) {
      console.warn("[supabase] content_ideas insert warning:", error.message);
    }
  } catch (err: any) {
    console.warn("[supabase] content_ideas save failed:", err.message);
  }
}

export async function fetchSecondBrainMemories(): Promise<Array<{ category: string; conceptKey: string; memoryText: string }>> {
  try {
    const { data, error } = await supabase
      .from("second_brain_memory")
      .select("category, concept_key, memory_text")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error || !data) return [];
    return data.map((d) => ({
      category: d.category,
      conceptKey: d.concept_key,
      memoryText: d.memory_text,
    }));
  } catch {
    return [];
  }
}

export async function saveSecondBrainMemory(memory: {
  category: string;
  conceptKey: string;
  memoryText: string;
  platform?: string;
  postText?: string;
  performanceScore?: number;
}) {
  try {
    const { error } = await supabase.from("second_brain_memory").upsert(
      {
        category: memory.category,
        concept_key: memory.conceptKey,
        memory_text: memory.memoryText,
        platform: memory.platform || "linkedin",
        post_text: memory.postText || memory.memoryText,
        performance_score: memory.performanceScore ?? 0.8,
      },
      { onConflict: "concept_key" }
    );
    if (error) {
      console.warn("[supabase] second_brain_memory upsert warning:", error.message);
    }
  } catch (err: any) {
    console.warn("[supabase] second_brain_memory save failed:", err.message);
  }
}

export async function recordPlatformPostStatus(results: Array<{ id: string; url?: string; platform: string; success: boolean; error?: string }>, contentId?: string) {
  if (!results || results.length === 0) return;
  const rows = results.map((r) => ({
    content_id: contentId || `content_${Date.now()}`,
    platform: r.platform,
    status: r.success ? "Published" : "Failed",
    external_id: r.id,
    post_url: r.url || null,
    error_message: r.error || null,
    posted_at: new Date().toISOString(),
  }));
  try {
    const { error } = await supabase.from("platform_posts").insert(rows);
    if (error) {
      console.warn("[supabase] platform_posts insert warning:", error.message);
    }
  } catch (err: any) {
    console.warn("[supabase] platform_posts save failed:", err.message);
  }
}

export async function recordSeoRankMetrics(metrics: Array<{ query: string; rankPosition: number; indexedStatus: string }>) {
  if (!metrics || metrics.length === 0) return;
  const rows = metrics.map((m) => ({
    query: m.query,
    rank_position: m.rankPosition,
    indexed_status: m.indexedStatus,
    checked_at: new Date().toISOString(),
  }));
  try {
    const { error } = await supabase.from("seo_rank_history").insert(rows);
    if (error) {
      console.warn("[supabase] seo_rank_history insert warning:", error.message);
    }
  } catch (err: any) {
    console.warn("[supabase] seo_rank_history save failed:", err.message);
  }
}

export async function buildPromptContext(): Promise<string> {
  try {
    const { data: pastPosts } = await supabase
      .from("second_brain_memory")
      .select("platform, post_text, performance_score")
      .order("created_at", { ascending: false })
      .limit(10);

    if (!pastPosts || pastPosts.length === 0) return "(No past post feedback recorded yet)";

    return pastPosts
      .map(
        (p) =>
          `[${p.platform || "post"}] performed ${(p.performance_score ?? 0.8) > 0.6 ? "well" : "poorly"}: "${(p.post_text || "").slice(0, 80)}..."`
      )
      .join("\n");
  } catch {
    return "(No past post feedback context)";
  }
}

export async function saveMultimodalVector(conceptKey: string, contentType: string, vector: number[], metadata: any = {}) {
  try {
    const { error } = await supabase.from("multimodal_vectors").insert({
      concept_key: conceptKey,
      content_type: contentType,
      embedding_vector: JSON.stringify(vector),
      metadata,
    });
    if (error) {
      console.warn("[supabase] multimodal_vectors insert warning:", error.message);
    }
  } catch (err: any) {
    console.warn("[supabase] saveMultimodalVector failed:", err.message);
  }
}

export async function saveAudioBriefing(reportDate: string, audioUrl: string, durationSeconds = 120) {
  try {
    const { error } = await supabase.from("audio_briefings").upsert(
      {
        report_date: reportDate,
        audio_url: audioUrl,
        duration_seconds: durationSeconds,
      },
      { onConflict: "report_date" }
    );
    if (error) {
      console.warn("[supabase] audio_briefings upsert warning:", error.message);
    }
  } catch (err: any) {
    console.warn("[supabase] saveAudioBriefing failed:", err.message);
  }
}

// In-Memory fallback for reading logs
export interface UserReadingLog {
  id?: string;
  article_title: string;
  url?: string;
  topic_category: string;
  reading_time_seconds: number;
  read_at: string;
}

const inMemoryReadingLogs: UserReadingLog[] = [];

export async function recordUserReadingLog(log: {
  articleTitle: string;
  url?: string;
  topicCategory: string;
  readingTimeSeconds: number;
}): Promise<UserReadingLog> {
  const entry: UserReadingLog = {
    id: `read_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    article_title: log.articleTitle,
    url: log.url || "",
    topic_category: log.topicCategory || "Tech Reading",
    reading_time_seconds: Math.max(1, Math.round(log.readingTimeSeconds)),
    read_at: new Date().toISOString(),
  };

  inMemoryReadingLogs.unshift(entry);

  try {
    const { data, error } = await supabase.from("user_reading_logs").insert({
      article_title: entry.article_title,
      url: entry.url,
      topic_category: entry.topic_category,
      reading_time_seconds: entry.reading_time_seconds,
      read_at: entry.read_at,
    }).select().single();

    if (!error && data) {
      return data as UserReadingLog;
    }
  } catch (err: any) {
    console.warn("[supabase] user_reading_logs table notice (used in-memory store):", err.message);
  }

  return entry;
}

export async function fetchUserReadingLogs(limit = 20): Promise<UserReadingLog[]> {
  try {
    const { data, error } = await supabase
      .from("user_reading_logs")
      .select("*")
      .order("read_at", { ascending: false })
      .limit(limit);

    if (!error && data && data.length > 0) {
      return data as UserReadingLog[];
    }
  } catch {
    // fallback
  }

  return inMemoryReadingLogs.slice(0, limit);
}

export async function getUserReadingStats() {
  const logs = await fetchUserReadingLogs(100);
  const totalArticles = logs.length;
  const totalSeconds = logs.reduce((acc, item) => acc + (item.reading_time_seconds || 0), 0);
  const totalMinutes = (totalSeconds / 60).toFixed(1);

  const topicCounts: Record<string, number> = {};
  logs.forEach((l) => {
    const cat = l.topic_category || "General";
    topicCounts[cat] = (topicCounts[cat] || 0) + 1;
  });

  return {
    totalArticles,
    totalSeconds,
    totalMinutes,
    topicCounts,
    recentLogs: logs.slice(0, 10),
  };
}

export interface SeoPageMetadataRecord {
  id?: string;
  page_route: string;
  meta_title: string;
  meta_description: string;
  meta_keywords: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  canonical_url?: string;
  structured_jsonld?: any;
  updated_at?: string;
}

const inMemorySeoStore: Record<string, SeoPageMetadataRecord> = {};

export async function saveSeoMetadataRecords(records: SeoPageMetadataRecord[]): Promise<boolean> {
  const updatedTime = new Date().toISOString();
  
  // Always update in-memory cache as fallback
  records.forEach((r) => {
    r.updated_at = updatedTime;
    inMemorySeoStore[r.page_route] = r;
  });

  try {
    const rows = records.map((r) => ({
      page_route: r.page_route,
      meta_title: r.meta_title,
      meta_description: r.meta_description,
      meta_keywords: r.meta_keywords,
      og_title: r.og_title || r.meta_title,
      og_description: r.og_description || r.meta_description,
      og_image: r.og_image || "https://www.abhishektiwari.online/og-image.jpg",
      canonical_url: r.canonical_url || `https://www.abhishektiwari.online${r.page_route}`,
      structured_jsonld: r.structured_jsonld || {},
      updated_at: updatedTime,
    }));

    const { error } = await supabase.from("seo_metadata").upsert(rows, {
      onConflict: "page_route",
    });

    if (error) {
      console.warn("[supabase] seo_metadata upsert notice (used in-memory store):", error.message);
    }
    return true;
  } catch (err: any) {
    console.warn("[supabase] saveSeoMetadataRecords exception:", err.message);
    return false;
  }
}

export async function fetchSeoMetadataRecords(): Promise<Record<string, SeoPageMetadataRecord>> {
  try {
    const { data, error } = await supabase.from("seo_metadata").select("*");
    if (!error && data && data.length > 0) {
      const out: Record<string, SeoPageMetadataRecord> = {};
      data.forEach((row: any) => {
        out[row.page_route] = row;
      });
      return out;
    }
  } catch {
    // fallback
  }

  return inMemorySeoStore;
}



