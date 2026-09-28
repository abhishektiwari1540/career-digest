import { config } from "../config.js";

export interface GoogleSearchResult {
  title: string;
  link: string;
  snippet: string;
  domain: string;
  displayUrl?: string;
}

export interface GoogleSearchResponse {
  query: string;
  totalResults: number;
  items: GoogleSearchResult[];
  isRealApi: boolean;
}

/**
  * Executes a Google Search API query using Custom Search API or smart web fallback.
  */
export async function searchGoogleApi(query: string, num = 5): Promise<GoogleSearchResponse> {
  const apiKey = config.googleSearch.apiKey;
  const cx = config.googleSearch.cx;

  if (apiKey && cx) {
    try {
      const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=${num}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const totalResults = parseInt(data.searchInformation?.totalResults || "0", 10);
        const items: GoogleSearchResult[] = (data.items || []).map((item: any) => ({
          title: item.title,
          link: item.link,
          snippet: item.snippet || item.htmlSnippet || "",
          domain: item.displayLink || new URL(item.link).hostname,
          displayUrl: item.formattedUrl || item.link,
        }));

        return {
          query,
          totalResults: totalResults || items.length,
          items,
          isRealApi: true,
        };
      }
    } catch (err: any) {
      console.warn("[googleSearchEngine] Custom Search API call warning:", err.message);
    }
  }

  // Smart structured fallbacks grounded in real developer ecosystem queries
  const fallbackResults: Record<string, GoogleSearchResult[]> = {
    "node.js": [
      {
        title: "Node.js v22 & v24 High-Performance Async Hooks & WebSockets Guide",
        link: "https://nodejs.org/docs/latest/api/",
        snippet: "Official guide on optimizing async performance, event loop worker threads, and memory lifecycle in server-side Node.js applications.",
        domain: "nodejs.org",
      },
      {
        title: "Building Resilient AI Microservices with Node.js and Gemini 3.6 API",
        link: "https://dev.to/t/nodejs",
        snippet: "Learn how to build background queue workers, rate limiters, and retry logic for high-throughput LLM integrations in Node.js.",
        domain: "dev.to",
      },
    ],
    "ai": [
      {
        title: "Google AI Studio: Gemini 3.6 Flash & Multimodal Vector Embeddings API",
        link: "https://ai.google.dev/",
        snippet: "Comprehensive guide to gemini-embedding-2 multimodal vector search, structured outputs, and real-time grounding in web applications.",
        domain: "ai.google.dev",
      },
      {
        title: "LLM Agentic Workflows with Google ADK in Production",
        link: "https://github.com/google/adk",
        snippet: "Autonomous Agent Development Kit patterns for multi-agent execution, function tools, and structured state persistence.",
        domain: "github.com",
      },
    ],
  };

  const lower = query.toLowerCase();
  let items: GoogleSearchResult[] = [];

  if (lower.includes("node") || lower.includes("backend")) {
    items = fallbackResults["node.js"];
  } else if (lower.includes("ai") || lower.includes("llm") || lower.includes("gemini")) {
    items = fallbackResults["ai"];
  } else {
    items = [
      {
        title: `Google Search Results for "${query}"`,
        link: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        snippet: `Latest web indexing, technical documentation, and community discussions for ${query}.`,
        domain: "google.com",
      },
      {
        title: `Dev.to & GitHub Discussions on ${query}`,
        link: `https://dev.to/search?q=${encodeURIComponent(query)}`,
        snippet: `Real-time developer posts, code snippets, and architecture reviews relating to ${query}.`,
        domain: "dev.to",
      },
    ];
  }

  return {
    query,
    totalResults: items.length,
    items,
    isRealApi: false,
  };
}

/**
 * Performs Google Search grounded audit of candidate profile & personal SEO footprint
 */
export async function fetchProfileSeoSearchResults(candidateName: string) {
  const queries = [
    `"${candidateName}" Node.js developer`,
    `"${candidateName}" software engineer Jaipur`,
    `site:github.com "${candidateName}"`,
    `site:linkedin.com/in "${candidateName}"`,
  ];

  const results: GoogleSearchResponse[] = [];
  for (const q of queries) {
    const res = await searchGoogleApi(q, 3);
    results.push(res);
  }
  return results;
}
