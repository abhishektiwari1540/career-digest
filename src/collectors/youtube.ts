import { config } from "../config.js";
import type { TrendTopic } from "../types.js";

export interface YouTubeTrendItem extends TrendTopic {
  channel?: string;
  viewCount?: number;
  summary?: string;
  regionCode?: string;
}

/**
 * Fetches top trending tech videos using YouTube Data API v3 quota-optimized endpoint:
 * https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&videoCategoryId=28
 * Cost: ~1 quota unit per call (vs 100 units for search.list), keeping usage under 50 units/day across IN, US, GB.
 */
export async function fetchYouTubeTrends(): Promise<YouTubeTrendItem[]> {
  const regions = ["IN", "US", "GB"];
  const ytKey = config.youtubeApiKey;

  if (ytKey) {
    try {
      const allResults: YouTubeTrendItem[] = [];

      for (const regionCode of regions) {
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&chart=mostPopular&regionCode=${regionCode}&videoCategoryId=28&maxResults=10&key=${ytKey}`;
        const res = await fetch(url);

        if (res.ok) {
          const data = await res.json();
          const items = data.items || [];

          for (const item of items) {
            const snippet = item.snippet || {};
            const stats = item.statistics || {};
            const viewCount = parseInt(stats.viewCount || "0", 10);

            allResults.push({
              source: "YouTube",
              externalId: `yt_${regionCode}_${item.id}`,
              title: snippet.title || "Trending Tech Video",
              url: `https://www.youtube.com/watch?v=${item.id}`,
              channel: snippet.channelTitle || "Tech Creator",
              viewCount,
              regionCode,
              relevanceNote: `Top trending Science & Tech video in ${regionCode} (${viewCount.toLocaleString()} views)`,
              summary: snippet.description ? snippet.description.slice(0, 150) + "..." : snippet.title,
            });
          }
        } else {
          const errData = await res.json().catch(() => ({}));
          console.warn(`[youtube] API v3 warning for ${regionCode}:`, errData.error?.message || res.statusText);
        }
      }

      if (allResults.length > 0) {
        console.log(`[youtube] Fetched ${allResults.length} trending tech videos across IN, US, GB via v3 API (quota optimized ~3 units)`);
        return allResults;
      }
    } catch (err: any) {
      console.warn("[youtube] API v3 failed, attempting RSS fallback:", err.message);
    }
  }

  // Fallback to RSS feed if API key is not active or call failed
  try {
    const query = encodeURIComponent("software engineering web development tech trends");
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?search_query=${query}`;

    const res = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feedUrl)}`);
    if (res.ok) {
      const data = await res.json();
      const items = data.items || [];

      const results: YouTubeTrendItem[] = items.slice(0, 5).map((item: any, idx: number) => ({
        source: "YouTube",
        externalId: item.guid || `yt_rss_${idx}_${Date.now()}`,
        title: item.title,
        url: item.link,
        channel: item.author || "Tech Channel",
        relevanceNote: `Trending developer video by ${item.author || "Tech Community"}`,
        summary: `Popular technical video covering ${item.title.slice(0, 80)}...`,
      }));

      if (results.length > 0) return results;
    }
  } catch (err: any) {
    console.warn("[youtube] RSS fallback warning:", err.message);
  }

  return getFallbackYouTubeTrends();
}

function getFallbackYouTubeTrends(): YouTubeTrendItem[] {
  return [
    {
      source: "YouTube",
      externalId: "yt_fallback_1",
      title: "Building Production Microservices with Node.js & TypeScript",
      url: "https://www.youtube.com/results?search_query=nodejs+typescript+architecture",
      channel: "Fireship",
      relevanceNote: "Popular high-level developer architectural breakdown",
      summary: "Overview of microservice separation, event-driven message queues, and API gateways.",
    },
    {
      source: "YouTube",
      externalId: "yt_fallback_2",
      title: "PostgreSQL Indexing & Query Optimization Deep Dive",
      url: "https://www.youtube.com/results?search_query=postgresql+indexing+performance",
      channel: "Hussein Nasser",
      relevanceNote: "Database performance tuning insights for backend engineers",
      summary: "Explores B-Tree indexes, EXPLAIN ANALYZE execution plans, and connection pooling.",
    },
  ];
}
