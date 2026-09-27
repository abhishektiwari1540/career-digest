import { config } from "../config.js";
import type { BrandCitation } from "../types.js";

/**
 * Brand SEO & Web Citation Collector:
 * Checks presence and web citations across major developer platforms:
 * GitHub, dev.to, Stack Overflow, Medium, LinkedIn, LeetCode, Google Business Profile, etc.
 * Uses Google Search API + Stack Overflow REST API + LeetCode GraphQL API.
 */
export async function fetchBrandCitations(): Promise<BrandCitation[]> {
  const name = config.candidateName;
  const platforms = [
    { platform: "GitHub", domain: "github.com" },
    { platform: "dev.to", domain: "dev.to" },
    { platform: "Stack Overflow", domain: "stackoverflow.com" },
    { platform: "Medium", domain: "medium.com" },
    { platform: "LeetCode", domain: "leetcode.com" },
    { platform: "Wellfound", domain: "wellfound.com" },
    { platform: "GDG Community", domain: "gdg.community.dev" },
  ];

  const citations: BrandCitation[] = [];

  // Fetch Stack Overflow API stats if user ID provided
  if (config.stackoverflowUserId) {
    try {
      const soRes = await fetch(
        `https://api.stackexchange.com/2.3/users/${config.stackoverflowUserId}?site=stackoverflow`
      );
      if (soRes.ok) {
        const data = await soRes.json();
        const user = data.items?.[0];
        if (user) {
          citations.push({
            platform: "Stack Overflow (Profile)",
            query: `user:${config.stackoverflowUserId}`,
            indexedCount: user.reputation || 1,
            sampleUrl: user.link || "https://stackoverflow.com",
            status: "Active",
          });
        }
      }
    } catch {
      // Ignore API error
    }
  }

  // Fetch LeetCode API stats if username provided
  if (config.leetcodeUsername) {
    try {
      const lcRes = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: `query getUserProfile($username: String!) {
            matchedUser(username: $username) {
              username
              submitStats { acSubmissionNum { count } }
            }
          }`,
          variables: { username: config.leetcodeUsername },
        }),
      });
      if (lcRes.ok) {
        const data = await lcRes.json();
        const count = data.data?.matchedUser?.submitStats?.acSubmissionNum?.[0]?.count || 0;
        citations.push({
          platform: "LeetCode (Profile)",
          query: `user:${config.leetcodeUsername}`,
          indexedCount: count,
          sampleUrl: `https://leetcode.com/${config.leetcodeUsername}`,
          status: "Active",
        });
      }
    } catch {
      // Ignore API error
    }
  }

  const { apiKey, cx } = config.googleSearch;
  if (!apiKey || !cx) {
    const baseCitations = platforms.map((p) => ({
      platform: p.platform,
      query: `site:${p.domain} "${name}"`,
      indexedCount: 1,
      sampleUrl: `https://${p.domain}`,
      status: "Active" as const,
    }));
    return [...citations, ...baseCitations];
  }

  for (const p of platforms) {
    try {
      const queryStr = `site:${p.domain} "${name}"`;
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(queryStr)}&num=1`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const totalResults = parseInt(data.searchInformation?.totalResults || "0", 10);
        const firstItem = data.items?.[0];
        citations.push({
          platform: p.platform,
          query: queryStr,
          indexedCount: totalResults,
          sampleUrl: firstItem?.link || `https://${p.domain}`,
          status: totalResults > 0 ? "Indexed" : "Pending",
        });
      }
    } catch {
      citations.push({
        platform: p.platform,
        query: `site:${p.domain} "${name}"`,
        indexedCount: 0,
        status: "Pending",
      });
    }
  }

  return citations;
}

