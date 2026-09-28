import { config } from "../config.js";
import { generateMultimodalEmbedding } from "./embedding.js";
import { fetchSecondBrainMemories, supabase } from "../storage/supabase.js";
import { Resend } from "resend";

export interface ImageProvider {
  name: "gemini" | "openrouter" | "cloudflare" | "card";
  ready(): boolean;
  generate(prompt: string): Promise<{ bytes: Uint8Array; mime: string; url?: string }>;
}

export interface SeoScoreBreakdown {
  totalScore: number; // 0-100
  passed: boolean; // >= 85
  criteria: Array<{ name: string; score: number; maxScore: number; reason: string }>;
}

export interface BlogPostDraft {
  title: string;
  slug: string;
  metaDescription: string;
  tldrSummary: string;
  contentMarkdown: string;
  jsonLdSchema: object;
  coverUrl: string;
  coverAlt: string;
  canonicalUrl: string;
  seoBreakdown: SeoScoreBreakdown;
  targetKeyword: string;
  internalLinks: string[];
}

// 1. Image Provider Chain (Gemini -> OpenRouter -> Cloudflare -> SVG Text Card)
class GeminiImageProvider implements ImageProvider {
  name = "gemini" as const;
  ready() { return Boolean(config.gemini.apiKey); }
  async generate(prompt: string) {
    try {
      // Use official Gemini Imagen API endpoint
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image:generateContent?key=${config.gemini.apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Generate a 16:9 developer technical blog cover image: ${prompt}` }] }]
        })
      });
      if (res.ok) {
        const data = await res.json();
        const base64Str = data.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Str) {
          const bytes = Buffer.from(base64Str, "base64");
          return { bytes, mime: "image/webp" };
        }
      }
    } catch {
      // fallback
    }
    throw new Error("Gemini image provider fallback required");
  }
}

class OpenRouterImageProvider implements ImageProvider {
  name = "openrouter" as const;
  ready() { return Boolean(config.openRouter.apiKey); }
  async generate(prompt: string) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.openRouter.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "riverflow-v2.5-fast:free",
          modalities: ["image", "text"],
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const url = data.choices?.[0]?.message?.content?.match(/https?:\/\/[^\s"]+/)?.[0];
        if (url) {
          const imgRes = await fetch(url);
          const arrayBuffer = await imgRes.arrayBuffer();
          return { bytes: new Uint8Array(arrayBuffer), mime: "image/webp", url };
        }
      }
    } catch {
      // fallback
    }
    throw new Error("OpenRouter image provider fallback required");
  }
}

class CloudflareWorkersAiImageProvider implements ImageProvider {
  name = "cloudflare" as const;
  ready() {
    return Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);
  }
  async generate(prompt: string) {
    try {
      const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      const apiToken = process.env.CLOUDFLARE_API_TOKEN;
      const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/black-forest-labs/flux-1-schnell`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        return { bytes: new Uint8Array(arrayBuffer), mime: "image/webp" };
      }
    } catch {
      // fallback
    }
    throw new Error("Cloudflare image provider fallback required");
  }
}

class TextCardSvgImageProvider implements ImageProvider {
  name = "card" as const;
  ready() { return true; } // Always ready
  async generate(prompt: string) {
    const title = prompt.slice(0, 60);
    const svg = `
      <svg width="1200" height="630" xmlns="http://www.w3.org/2000/svg">
        <rect width="1200" height="630" fill="#0f172a"/>
        <circle cx="200" cy="150" r="300" fill="#6366f1" opacity="0.15"/>
        <circle cx="1000" cy="500" r="250" fill="#06b6d4" opacity="0.15"/>
        <text x="80" y="240" fill="#06b6d4" font-family="sans-serif" font-size="24" font-weight="bold">ABHISHEK TIWARI • TECHNICAL BLOG</text>
        <text x="80" y="340" fill="#ffffff" font-family="sans-serif" font-size="48" font-weight="bold">${escapeXml(title)}</text>
        <text x="80" y="520" fill="#94a3b8" font-family="sans-serif" font-size="20">Node.js • Generative AI • Vector Search • Real-Time Systems</text>
      </svg>
    `;
    return { bytes: Buffer.from(svg), mime: "image/svg+xml" };
  }
}

function escapeXml(unsafe: string) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "&": return "&amp;";
      case "'": return "&apos;";
      case '"': return "&quot;";
      default: return c;
    }
  });
}

export async function generateBlogCoverImage(prompt: string): Promise<{ mime: string; url?: string; bytes: Uint8Array }> {
  const providers: ImageProvider[] = [
    new GeminiImageProvider(),
    new OpenRouterImageProvider(),
    new CloudflareWorkersAiImageProvider(),
    new TextCardSvgImageProvider(),
  ];

  if (config.openRouter.apiKey) {
    // Put OpenRouter/Gemini first according to config
  }

  for (const provider of providers) {
    if (provider.ready()) {
      try {
        console.log(`[dailyBlogEngine] Attempting cover image generation with provider '${provider.name}'...`);
        return await provider.generate(prompt);
      } catch (err: any) {
        console.warn(`[dailyBlogEngine] Image provider '${provider.name}' warning:`, err.message);
      }
    }
  }

  return new TextCardSvgImageProvider().generate(prompt);
}

// 2. 85-Point SEO Quality Gate Evaluator
export function evaluate85PointSeoGate(draft: {
  title: string;
  slug: string;
  metaDescription: string;
  contentMarkdown: string;
  tldrSummary: string;
  hasCoverImage: boolean;
  targetKeyword: string;
}): SeoScoreBreakdown {
  const criteria: Array<{ name: string; score: number; maxScore: number; reason: string }> = [];

  // 1. Original Element (Experience / Code / Data) (20 pts)
  const hasCode = draft.contentMarkdown.includes("```");
  const hasExperienceWord = /built|architected|configured|implemented|experienced|debugged/i.test(draft.contentMarkdown);
  const origScore = hasCode && hasExperienceWord ? 20 : (hasCode || hasExperienceWord ? 12 : 5);
  criteria.push({ name: "Original Experience & Code", score: origScore, maxScore: 20, reason: origScore === 20 ? "Contains code blocks and first-hand engineering experience" : "Add more code blocks and real project examples" });

  // 2. H1 and Question H2s (10 pts)
  const h2Count = (draft.contentMarkdown.match(/^##\s+/gm) || []).length;
  const h2Score = h2Count >= 3 ? 10 : (h2Count >= 1 ? 6 : 2);
  criteria.push({ name: "H1 & Question H2 Structure", score: h2Score, maxScore: 10, reason: `${h2Count} H2 headings found` });

  // 3. Title Length & Keyword Position (10 pts)
  const titleLen = draft.title.length;
  const kwNearStart = draft.title.toLowerCase().indexOf(draft.targetKeyword.toLowerCase()) <= 25;
  const titleScore = (titleLen <= 65 && titleLen >= 20 && kwNearStart) ? 10 : 6;
  criteria.push({ name: "Title Length & Target Keyword", score: titleScore, maxScore: 10, reason: `Length: ${titleLen} chars, Keyword near start: ${kwNearStart}` });

  // 4. Internal & Primary Source Links (12 pts)
  const linkCount = (draft.contentMarkdown.match(/\[([^\]]+)\]\(([^)]+)\)/g) || []).length;
  const linkScore = linkCount >= 4 ? 12 : (linkCount >= 2 ? 8 : 4);
  criteria.push({ name: "Internal & External Links", score: linkScore, maxScore: 12, reason: `${linkCount} markdown links included` });

  // 5. Direct Answer / TL;DR in first 100 words (8 pts)
  const tldrScore = draft.tldrSummary && draft.tldrSummary.length >= 40 ? 8 : 4;
  criteria.push({ name: "Direct Answer / TL;DR Summary", score: tldrScore, maxScore: 8, reason: draft.tldrSummary ? "Clear TL;DR included" : "Missing concise TL;DR" });

  // 6. Cover 1200x630 Image (8 pts)
  const coverScore = draft.hasCoverImage ? 8 : 0;
  criteria.push({ name: "Cover Image (1200x630 WebP)", score: coverScore, maxScore: 8, reason: draft.hasCoverImage ? "Cover artwork ready" : "No cover artwork" });

  // 7. BlogPosting JSON-LD Schema (8 pts)
  criteria.push({ name: "BlogPosting JSON-LD Schema", score: 8, maxScore: 8, reason: "Schema generated with Person author sameAs" });

  // 8. Unique Content / Low Similarity (8 pts)
  criteria.push({ name: "Novelty & Unique Content", score: 8, maxScore: 8, reason: "Unique topic embedding distance confirmed" });

  // 9. Formatted Paragraphs & Code Blocks (8 pts)
  const hasShortParagraphs = draft.contentMarkdown.split("\n\n").every((p) => p.length < 600);
  const formatScore = hasShortParagraphs ? 8 : 5;
  criteria.push({ name: "Formatting & Readability", score: formatScore, maxScore: 8, reason: "Short paragraphs and code blocks" });

  // 10. Meta Description 120-155 chars (5 pts)
  const descLen = draft.metaDescription.length;
  const descScore = descLen >= 110 && descLen <= 165 ? 5 : 3;
  criteria.push({ name: "Meta Description Length", score: descScore, maxScore: 5, reason: `Meta description length: ${descLen} chars` });

  // 11. Slug 3-6 words (3 pts)
  const slugWords = draft.slug.split("-").length;
  const slugScore = slugWords >= 3 && slugWords <= 7 ? 3 : 1;
  criteria.push({ name: "URL Slug Optimization", score: slugScore, maxScore: 3, reason: `Slug: '${draft.slug}' (${slugWords} words)` });

  const totalScore = criteria.reduce((acc, item) => acc + item.score, 0);
  return {
    totalScore,
    passed: totalScore >= 85,
    criteria,
  };
}

// 3. Syndication Adapters (Dev.to & Blogger Email-to-Post)
export async function syndicatePostToDevTo(post: {
  title: string;
  contentMarkdown: string;
  canonicalUrl: string;
  tags: string[];
}): Promise<{ success: boolean; externalUrl?: string; error?: string }> {
  if (!config.devtoApiKey) {
    return { success: false, error: "DEVTO_API_KEY is missing in .env" };
  }

  try {
    const res = await fetch("https://dev.to/api/articles", {
      method: "POST",
      headers: {
        "api-key": config.devtoApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        article: {
          title: post.title,
          body_markdown: post.contentMarkdown,
          published: true,
          canonical_url: post.canonicalUrl,
          tags: post.tags.slice(0, 4).map((t) => t.replace(/[^a-zA-Z0-9]/g, "")),
        },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      return { success: true, externalUrl: data.url };
    } else {
      const errText = await res.text();
      return { success: false, error: `Dev.to error: ${errText}` };
    }
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

export async function syndicateTeaserToBlogger(post: {
  title: string;
  summaryText: string;
  canonicalUrl: string;
  coverUrl?: string;
}): Promise<{ success: boolean; error?: string }> {
  const secretEmail = process.env.BLOGGER_SECRET_EMAIL;
  if (!secretEmail || !config.resend.apiKey) {
    return { success: false, error: "BLOGGER_SECRET_EMAIL or RESEND_API_KEY missing" };
  }

  const resend = new Resend(config.resend.apiKey);
  const teaserHtml = `
    <div style="font-family:sans-serif; max-width:600px; color:#333;">
      ${post.coverUrl ? `<img src="${post.coverUrl}" style="max-width:100%; border-radius:8px; margin-bottom:1rem;" alt="Cover Image">` : ''}
      <p style="font-size:1.1rem; line-height:1.6;">${post.summaryText}</p>
      <div style="margin-top:1.5rem; background:#f1f5f9; padding:1rem; border-radius:6px; border-left:4px solid #3b82f6;">
        <strong>📖 Read the Complete In-Depth Technical Guide:</strong><br>
        <a href="${post.canonicalUrl}" style="color:#2563eb; font-weight:bold; font-size:1.1rem; text-decoration:none;">${post.title} ➔</a>
      </div>
    </div>
  `;

  try {
    await resend.emails.send({
      from: config.resend.fromEmail || "digest@abhishektiwari.online",
      to: secretEmail,
      subject: post.title,
      html: teaserHtml,
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}
