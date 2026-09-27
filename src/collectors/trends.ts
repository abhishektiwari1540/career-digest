import type { TrendTopic } from "../types.js";

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
}

interface DevToArticle {
  id: number;
  title: string;
  url: string;
  tag_list: string[];
}

interface GitHubRepoItem {
  id: number;
  full_name: string;
  description: string;
  html_url: string;
  stargazers_count: number;
}

interface GitHubSearchResponse {
  items: GitHubRepoItem[];
}

interface RedditPost {
  data: {
    id: string;
    title: string;
    permalink: string;
    url: string;
    score: number;
  };
}

interface RedditResponse {
  data?: {
    children?: RedditPost[];
  };
}

/**
 * Hacker News's official Firebase API - public, free, no key required.
 */
async function fetchHackerNewsTrends(limit = 10): Promise<TrendTopic[]> {
  const idsRes = await fetch("https://hacker-news.firebaseio.com/v0/topstories.json");
  const ids: number[] = await idsRes.json();

  const items = await Promise.all(
    ids.slice(0, limit).map(async (id) => {
      const res = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
      return (await res.json()) as HNItem;
    })
  );

  return items
    .filter((item) => item.title && item.url)
    .map((item) => ({
      source: "hackernews",
      externalId: String(item.id),
      title: item.title as string,
      url: item.url as string,
    }));
}

/**
 * dev.to's official public API - free, no key required.
 */
async function fetchDevToTrends(tag: string, limit = 10): Promise<TrendTopic[]> {
  const res = await fetch(
    `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&top=1&per_page=${limit}`
  );
  const articles = (await res.json()) as DevToArticle[];

  return articles.map((a) => ({
    source: "dev.to",
    externalId: String(a.id),
    title: a.title,
    url: a.url,
  }));
}

/**
 * GitHub REST Search API - 100% Free, no key required for basic queries.
 * Fetches newly trending open-source software repositories.
 */
async function fetchGitHubTrends(limit = 5): Promise<TrendTopic[]> {
  const dateStr = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const url = `https://api.github.com/search/repositories?q=created:>${dateStr}+stars:>20&sort=stars&order=desc&per_page=${limit}`;

  const res = await fetch(url, { headers: { "User-Agent": "CareerDigestApp/1.0" } });
  if (!res.ok) return [];

  const data = (await res.json()) as GitHubSearchResponse;
  return (data.items || []).map((repo) => ({
    source: "github-trending",
    externalId: String(repo.id),
    title: `${repo.full_name}: ${repo.description || "Trending GitHub Repository"} (⭐ ${repo.stargazers_count})`,
    url: repo.html_url,
  }));
}

/**
 * Reddit r/developersIndia & r/webdev Free JSON Endpoint - 100% Free, no API key needed.
 */
async function fetchRedditTrends(subreddit = "developersIndia", limit = 5): Promise<TrendTopic[]> {
  const url = `https://www.reddit.com/r/${subreddit}/hot.json?limit=${limit}`;
  const res = await fetch(url, { headers: { "User-Agent": "CareerDigestBot/1.0" } });
  if (!res.ok) return [];

  const data = (await res.json()) as RedditResponse;
  const posts = data.data?.children || [];

  return posts.map((p) => ({
    source: `reddit-r/${subreddit}`,
    externalId: p.data.id,
    title: p.data.title,
    url: `https://reddit.com${p.data.permalink}`,
  }));
}

/**
 * Combines 4 official, 100% free tech trend sources:
 * HackerNews, dev.to, GitHub Trending Repos, and Reddit r/developersIndia.
 */
export async function fetchTrendTopics(): Promise<TrendTopic[]> {
  const [hn, devto, github, reddit] = await Promise.all([
    fetchHackerNewsTrends().catch(() => []),
    fetchDevToTrends("typescript").catch(() => []),
    fetchGitHubTrends().catch(() => []),
    fetchRedditTrends("developersIndia").catch(() => []),
  ]);
  return [...hn, ...devto, ...github, ...reddit];
}

