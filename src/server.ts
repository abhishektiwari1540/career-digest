// Node.js DOM polyfills for PDF parsing libraries in Serverless environments
if (typeof (globalThis as any).DOMMatrix === "undefined") {
  (globalThis as any).DOMMatrix = class DOMMatrix {};
}
if (typeof (globalThis as any).Path2D === "undefined") {
  (globalThis as any).Path2D = class Path2D {};
}
if (typeof (globalThis as any).ImageData === "undefined") {
  (globalThis as any).ImageData = class ImageData {};
}

import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import { config } from "./config.js";
import { generateMultimodalEmbedding } from "./llm/embedding.js";
import { getOrGenerateContentPack } from "./llm/contentEngine.js";
import { activePublishers } from "./publishers/index.js";
import { XPublisher } from "./publishers/xPublisher.js";
import { RedditPublisher } from "./publishers/redditPublisher.js";
import { MetaGraphPublisher } from "./publishers/metaGraph.js";
import {
  fetchRecentLinkedInPosts,
  fetchSecondBrainMemories,
  fetchSeoMetadataRecords,
  getUserReadingStats,
  recordUserReadingLog,
  saveMultimodalVector,
  saveSecondBrainMemory,
  saveSeoMetadataRecords,
  supabase,
} from "./storage/supabase.js";

import { processLinkedInZipArchive } from "./storage/zipImporter.js";
import { searchGoogleApi } from "./collectors/googleSearchEngine.js";
import { generatePersonalSeoAnalysis } from "./llm/seoProfileEngine.js";
import {
  forceTriggerSelfUpdate,
  getSelfUpdatingStatus,
  setSelfUpdatingActive,
  startSelfUpdatingEngine,
} from "./engine/selfUpdatingEngine.js";
import { run as executeFullDigestRun } from "./index.js";
import {
  generate12BlogCandidatesWorkflow,
  fetchLatestChampionBlog,
  fetchAllBlogCandidates,
} from "./llm/dailyBlogEngine.js";
import {
  generate10ViralPostsWorkflow,
  fetchLatestViralPosts,
} from "./llm/viralPostEngine.js";





const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 150 * 1024 * 1024 } });

app.use(express.json());

// Enable CORS for SEO Sync API endpoints (allows https://www.abhishektiwari.online to fetch SEO data directly)
app.use("/api/seo/sync", (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-second-brain-secret");
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// Security Middleware 1: Enforce NOINDEX on private Second Brain App
app.use((req, res, next) => {
  res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  next();
});

// Security Middleware 2: Guard API routes with secret header check option
app.use("/api", (req, res, next) => {
  const urlPath = `${req.url || ''} ${req.path || ''} ${req.originalUrl || ''}`.toLowerCase();

  // Allow all public dashboard & auto-post endpoints without requiring API_SECRET
  if (
    urlPath.includes("viral-posts") ||
    urlPath.includes("blogs") ||
    urlPath.includes("stats") ||
    urlPath.includes("memories") ||
    urlPath.includes("search") ||
    urlPath.includes("seo") ||
    urlPath.includes("reading") ||
    urlPath.includes("self-update") ||
    urlPath.includes("google-search") ||
    urlPath.includes("upload") ||
    urlPath.includes("cron")
  ) {
    return next();
  }

  const isVercelCron = Boolean(req.headers["x-vercel-cron"]);
  const isCronJobOrg = (req.headers["user-agent"] || "").toLowerCase().includes("cron-job");
  if (isVercelCron || isCronJobOrg) {
    return next();
  }

  const requiredSecret = process.env.CRON_SECRET || process.env.API_SECRET;
  if (requiredSecret && requiredSecret.trim() !== "") {
    const authHeader = req.headers.authorization;
    const clientSecret = req.headers["x-second-brain-secret"] || (authHeader ? authHeader.replace("Bearer ", "") : req.query.secret);
    if (clientSecret !== requiredSecret) {
      return res.status(401).json({ success: false, error: "Unauthorized: Invalid or missing API secret" });
    }
  }

  next();
});

app.use(express.static(path.join(__dirname, "../public")));

/**
 * CSV Helper: Parses LinkedIn Shares.csv with quoted text support
 */
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// GET /api/stats - Second Brain Metrics Dashboard
app.get("/api/stats", async (req, res) => {
  try {
    const [linkedInRes, memoryRes, vectorRes] = await Promise.all([
      supabase.from("linkedin_posts").select("id", { count: "exact", head: true }),
      supabase.from("second_brain_memory").select("id", { count: "exact", head: true }),
      supabase.from("multimodal_vectors").select("id", { count: "exact", head: true }),
    ]);

    const publishersStatus = [
      {
        platform: "devto",
        name: "Dev.to",
        configured: Boolean(config.devtoApiKey),
        statusText: config.devtoApiKey ? "✅ DEVTO_API_KEY Active & Ready" : "⚡ Dry-Run Simulation Mode Active",
      },
      {
        platform: "linkedin",
        name: "LinkedIn Profile",
        configured: Boolean(config.linkedInAccessToken && config.linkedInPersonUrn),
        statusText: config.linkedInAccessToken && config.linkedInPersonUrn
          ? "✅ Share API v2 Token Active"
          : "⚡ OAuth Setup Available (/api/linkedin/login)",
      },
      {
        platform: "x",
        name: "X (Twitter)",
        configured: Boolean(process.env.X_API_KEY || process.env.TWITTER_API_KEY || process.env.X_BEARER_TOKEN),
        statusText: Boolean(process.env.X_API_KEY || process.env.X_BEARER_TOKEN)
          ? "✅ API Key Configured"
          : "⚡ Dry-Run Simulation Mode Active",
      },
      {
        platform: "reddit",
        name: "Reddit (r/developersIndia)",
        configured: Boolean(process.env.REDDIT_CLIENT_ID),
        statusText: Boolean(process.env.REDDIT_CLIENT_ID)
          ? "✅ Client ID Active"
          : "⚡ Community Auto-Posting Ready",
      },
      {
        platform: "instagram",
        name: "Instagram (Meta Graph)",
        configured: Boolean(process.env.META_ACCESS_TOKEN && process.env.META_PAGE_ID),
        statusText: Boolean(process.env.META_ACCESS_TOKEN)
          ? "✅ Meta Graph API Active"
          : "⚡ Image Banner Artwork Auto-Generated",
      },
      {
        platform: "bluesky",
        name: "Bluesky",
        configured: Boolean(process.env.BLUESKY_HANDLE && process.env.BLUESKY_APP_PASSWORD),
        statusText: process.env.BLUESKY_HANDLE
          ? `✅ Handle: ${process.env.BLUESKY_HANDLE}`
          : "⚡ App Password Configurable (.env)",
      },
      {
        platform: "mastodon",
        name: "Mastodon",
        configured: Boolean(process.env.MASTODON_ACCESS_TOKEN),
        statusText: process.env.MASTODON_ACCESS_TOKEN
          ? "✅ REST Token Active"
          : "⚡ Access Token Configurable (.env)",
      },
      {
        platform: "youtube",
        name: "YouTube Data API v3",
        configured: Boolean(config.youtubeApiKey),
        statusText: config.youtubeApiKey
          ? "✅ Quota Optimized (~1 unit/call)"
          : "⚡ Quota Optimized Mode Active",
      },
      {
        platform: "resend",
        name: "Resend Email",
        configured: Boolean(config.resend.apiKey),
        statusText: config.resend.apiKey
          ? `✅ Active (${config.resend.toEmail})`
          : "⚡ Email API Key Ready",
      },
      {
        platform: "gemini",
        name: "Google Gemini AI Studio",
        configured: Boolean(config.gemini.apiKey),
        statusText: `✅ Primary LLM (${config.gemini.model})`,
      },
      {
        platform: "groq",
        name: "Groq Llama 3.3",
        configured: Boolean(config.groq.apiKey),
        statusText: config.groq.apiKey ? `✅ Fallback LLM (${config.groq.model})` : "⚡ Fallback Mode",
      },
    ];

    res.json({
      success: true,
      stats: {
        linkedInPostsCount: linkedInRes.count || 0,
        secondBrainItemsCount: memoryRes.count || 0,
        multimodalVectorsCount: vectorRes.count || 0,
        candidateName: config.candidateName,
        publishersStatus,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/memories - Fetch Ingested Memories & LinkedIn Posts
app.get("/api/memories", async (req, res) => {
  try {
    const [memories, linkedInPosts] = await Promise.all([
      fetchSecondBrainMemories(),
      fetchRecentLinkedInPosts(15),
    ]);

    res.json({
      success: true,
      memories,
      linkedInPosts,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/upload - Ingest Data File (LinkedIn CSV, Google Chat JSON/TXT, Resume PDF/TXT, Research Notes)
app.post("/api/upload", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const category = (req.body.category || "auto").toLowerCase();

    if (!file) {
      return res.status(400).json({ success: false, error: "No file uploaded" });
    }

    const fileName = file.originalname;
    const fileExt = path.extname(fileName).toLowerCase();
    const buffer = file.buffer;

    let extractedText = "";
    let itemType = category;
    let parsedCount = 0;
    const processedItems: Array<{ key: string; text: string; category: string }> = [];

    // Parse according to extension & detected category
    if (fileExt === ".zip") {
      const zipResult = await processLinkedInZipArchive(buffer, fileName);
      return res.json({
        success: true,
        message: `Successfully processed full LinkedIn Data Export ZIP archive "${fileName}"!`,
        details: {
          fileName,
          category: "linkedin_zip_export",
          parsedCount: zipResult.totalIngestedItems,
          vectorsGeneratedCount: zipResult.totalIngestedItems,
          samplePreview: zipResult.samplePreview,
          breakdown: `Parsed ${zipResult.sharesCount} Posts, ${zipResult.articlesCount} Articles, ${zipResult.positionsCount} Positions, ${zipResult.skillsCount} Skills, ${zipResult.commentsCount} Comments`,
          voiceProfileExtracted: zipResult.voiceProfileExtracted,
        },
      });
    } else if (fileExt === ".pdf") {
      try {
        const pdfParse = require("pdf-parse");
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text || "";
      } catch (pdfErr: any) {
        console.warn("[server] PDF parse warning:", pdfErr.message);
        extractedText = buffer.toString("utf-8");
      }
      itemType = category === "auto" ? "resume_bio" : category;

      // Split PDF into clean paragraph chunks
      const paragraphs = extractedText
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p.length > 30);

      paragraphs.forEach((p, idx) => {
        processedItems.push({
          key: `pdf_${Date.now()}_chunk_${idx}`,
          text: p,
          category: itemType,
        });
      });
    } else if (fileExt === ".csv" || category === "linkedin_export") {
      const csvContent = buffer.toString("utf-8");
      const rows = parseCsv(csvContent);

      if (rows.length > 0 && (rows[0]["ShareCommentary"] !== undefined || rows[0]["Commentary"] !== undefined || rows[0]["Date"] !== undefined)) {
        // LinkedIn Shares.csv Export Format
        itemType = "linkedin_export";
        const linkedinPostsToSave: any[] = [];

        rows.forEach((r, idx) => {
          const content = r["ShareCommentary"] || r["Commentary"] || "";
          const url = r["ShareLink"] || r["SharedUrl"] || "";
          const date = r["Date"] || new Date().toISOString();

          if (content.length > 5) {
            linkedinPostsToSave.push({
              posted_at: date,
              content,
              url,
            });

            processedItems.push({
              key: `linkedin_csv_${idx}_${Date.now()}`,
              text: `[LinkedIn Post - ${date}] ${content}`,
              category: "linkedin_export",
            });
          }
        });

        // Insert into linkedin_posts table
        if (linkedinPostsToSave.length > 0) {
          const { error: insertErr } = await supabase.from("linkedin_posts").insert(linkedinPostsToSave);
          if (insertErr) {
            console.warn("[server] linkedin_posts insert warning:", insertErr.message);
          }
        }
      } else {
        // Generic CSV text
        itemType = category === "auto" ? "data_export" : category;
        rows.forEach((r, idx) => {
          const rowText = Object.entries(r)
            .map(([k, v]) => `${k}: ${v}`)
            .join(" | ");
          if (rowText.length > 10) {
            processedItems.push({
              key: `csv_row_${idx}_${Date.now()}`,
              text: rowText,
              category: itemType,
            });
          }
        });
      }
    } else if (fileExt === ".json") {
      const jsonContent = buffer.toString("utf-8");
      try {
        const jsonData = JSON.parse(jsonContent);
        itemType = category === "auto" ? "google_chat" : category;

        if (Array.isArray(jsonData)) {
          jsonData.forEach((item: any, idx: number) => {
            const text = typeof item === "string" ? item : JSON.stringify(item);
            if (text.length > 10) {
              processedItems.push({
                key: `json_arr_${idx}_${Date.now()}`,
                text: text.slice(0, 1000),
                category: itemType,
              });
            }
          });
        } else if (jsonData.messages && Array.isArray(jsonData.messages)) {
          // Google Chat / Slack export format
          jsonData.messages.forEach((msg: any, idx: number) => {
            const sender = msg.creator?.name || msg.sender || "User";
            const text = msg.text || msg.content || "";
            if (text.length > 5) {
              processedItems.push({
                key: `chat_${idx}_${Date.now()}`,
                text: `[Google Chat - ${sender}]: ${text}`,
                category: "google_chat",
              });
            }
          });
        } else {
          // Generic object
          const str = JSON.stringify(jsonData, null, 2);
          processedItems.push({
            key: `json_obj_${Date.now()}`,
            text: str.slice(0, 2000),
            category: itemType,
          });
        }
      } catch {
        extractedText = buffer.toString("utf-8");
      }
    } else {
      // .txt, .md or raw text file
      extractedText = buffer.toString("utf-8");
      itemType = category === "auto" ? "research_notes" : category;

      const sections = extractedText
        .split(/\n(?=#{1,3}\s|\n\n)/)
        .map((s) => s.trim())
        .filter((s) => s.length > 20);

      sections.forEach((sec, idx) => {
        processedItems.push({
          key: `note_${Date.now()}_sec_${idx}`,
          text: sec,
          category: itemType,
        });
      });
    }

    parsedCount = processedItems.length;

    // Process & Embed (capped at 30 items for serverless speed)
    let vectorsGeneratedCount = 0;
    const itemsToProcess = processedItems.slice(0, 30);
    for (const item of itemsToProcess) {
      try {
        // 1. Save to second_brain_memory table
        await saveSecondBrainMemory({
          category: item.category,
          conceptKey: item.key,
          memoryText: item.text,
        });

        // 2. Generate gemini-embedding-2 Multimodal Vector Embedding
        const vector = await generateMultimodalEmbedding(item.text);
        await saveMultimodalVector(item.key, item.category, vector, {
          fileName,
          ingestedAt: new Date().toISOString(),
        });
        vectorsGeneratedCount++;
      } catch (err: any) {
        console.warn("[server] Item processing warning:", err.message);
      }
    }

    console.log(`[server] Upload processed: ${fileName} (${parsedCount} items parsed, ${vectorsGeneratedCount} gemini-embedding-2 vectors created)`);

    res.json({
      success: true,
      message: `Successfully ingested "${fileName}" into Second Brain!`,
      details: {
        fileName,
        category: itemType,
        parsedCount,
        vectorsGeneratedCount,
        samplePreview: processedItems[0]?.text?.slice(0, 150) || "Ingested successfully",
      },
    });
  } catch (err: any) {
    console.error("[server] Upload ingestion error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/search - Search Ingested Second Brain Knowledge
app.post("/api/search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, error: "Query is required" });

    // Generate query embedding
    const queryVector = await generateMultimodalEmbedding(query);

    // Fetch memory items from Supabase matching query text or recent items
    const { data: memories } = await supabase
      .from("second_brain_memory")
      .select("category, concept_key, memory_text, created_at")
      .ilike("memory_text", `%${query}%`)
      .limit(10);

    const { data: linkedInMatches } = await supabase
      .from("linkedin_posts")
      .select("posted_at, content, url")
      .ilike("content", `%${query}%`)
      .limit(10);

    res.json({
      success: true,
      query,
      results: {
        memoryMatches: memories || [],
        linkedInMatches: linkedInMatches || [],
        embeddingVectorDimensions: queryVector.length,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/generate-pack - Trigger Content Pack Generator directly from Web UI
app.post("/api/generate-pack", async (req, res) => {
  try {
    const recentPosts = await fetchRecentLinkedInPosts(5);
    const contentPack = await getOrGenerateContentPack({
      jobs: [],
      trends: [],
      events: [],
      brandCitations: [],
      linkedinPosts: recentPosts,
      projects: [],
      profileSkills: config.profileSkills,
    });

    res.json({
      success: true,
      contentPack,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/publish-now - Manually trigger post publish to a specific platform from Web UI
app.post("/api/publish-now", async (req, res) => {
  try {
    const { platform, postText, topic, imageUrl } = req.body;
    let publisher = activePublishers.find((p) => p.platform === platform);

    if (!publisher) {
      if (platform === "x") publisher = new XPublisher();
      else if (platform === "reddit") publisher = new RedditPublisher();
      else if (platform === "instagram" || platform === "facebook" || platform === "threads") {
        publisher = new MetaGraphPublisher(platform as any);
      }
    }

    if (!publisher) {
      return res.status(400).json({ success: false, error: `Publisher for platform '${platform}' not found` });
    }

    const result = await publisher.publish({
      title: topic || "Daily Career Digest",
      text: postText,
      mediaUrl: imageUrl,
    });

    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/linkedin/login - Redirect to LinkedIn OAuth authorization URL
app.get("/api/linkedin/login", (req, res) => {
  const clientId = config.linkedInClientId || process.env.LINKEDIN_CLIENT_ID;
  if (!clientId) {
    return res.status(400).send("LINKEDIN_CLIENT_ID is missing in .env file! Please set LINKEDIN_CLIENT_ID and retry.");
  }
  const redirectUri = "http://localhost:3005/api/linkedin/callback";
  const scope = encodeURIComponent("w_member_social profile openid email");
  const url = `https://www.linkedin.com/oauth/v2/authorization?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scope}`;
  res.redirect(url);
});

// GET /api/linkedin/callback - Handles LinkedIn OAuth code exchange and saves access token
app.get("/api/linkedin/callback", async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    return res.status(400).send("No authorization code received from LinkedIn.");
  }

  const clientId = config.linkedInClientId || process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = config.linkedInClientSecret || process.env.LINKEDIN_CLIENT_SECRET;
  const redirectUri = "http://localhost:3005/api/linkedin/callback";

  try {
    const tokenRes = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: clientId || "",
        client_secret: clientSecret || "",
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return res.status(400).send(`LinkedIn token exchange failed: ${errText}`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    let personUrn = "";
    try {
      const profileRes = await fetch("https://api.linkedin.com/v2/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        personUrn = profileData.sub || profileData.id || "";
      }
    } catch {
      // ignore
    }

    config.linkedInAccessToken = accessToken;
    if (personUrn) config.linkedInPersonUrn = personUrn;

    const envPath = path.join(__dirname, "../.env");
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf-8") : "";

    if (envContent.includes("LINKEDIN_ACCESS_TOKEN=")) {
      envContent = envContent.replace(/LINKEDIN_ACCESS_TOKEN=.*/, `LINKEDIN_ACCESS_TOKEN=${accessToken}`);
    } else {
      envContent += `\nLINKEDIN_ACCESS_TOKEN=${accessToken}`;
    }

    if (personUrn) {
      if (envContent.includes("LINKEDIN_PERSON_URN=")) {
        envContent = envContent.replace(/LINKEDIN_PERSON_URN=.*/, `LINKEDIN_PERSON_URN=${personUrn}`);
      } else {
        envContent += `\nLINKEDIN_PERSON_URN=${personUrn}`;
      }
    }

    fs.writeFileSync(envPath, envContent, "utf-8");

    res.send(`
      <html>
        <body style="font-family:sans-serif; background:#0f172a; color:#fff; text-align:center; padding:3rem;">
          <h1 style="color:#22c55e;">🎉 LinkedIn Connected Successfully!</h1>
          <p>Access token and Member URN (<strong>${personUrn || 'urn:li:person:...'}</strong>) have been saved to your <strong>.env</strong> file.</p>
          <a href="/" style="display:inline-block; margin-top:1rem; padding:0.75rem 1.5rem; background:#3b82f6; color:#fff; text-decoration:none; border-radius:6px; font-weight:bold;">Return to Web Dashboard</a>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`LinkedIn authorization error: ${err.message}`);
  }
});

// GET /api/seo-profile - Personal SEO & Profile Optimization Insights
app.get("/api/seo-profile", async (req, res) => {
  try {
    const analysis = await generatePersonalSeoAnalysis();
    res.json({ success: true, analysis });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/seo/sync - Generate & Synchronize SEO Metadata for https://www.abhishektiwari.online/
app.post("/api/seo/sync", async (req, res) => {
  try {
    const analysis = await generatePersonalSeoAnalysis();
    const candidateName = analysis.candidateName || "Abhishek Tiwari";
    const keywordsList = [...analysis.topCoveredKeywords, ...analysis.recommendedSeoKeywords].join(", ");

    const webhookUrl = req.body?.webhookUrl || process.env.RECEIVER_WEBHOOK_URL;

    // Build SEO metadata records for target site https://www.abhishektiwari.online/
    const pagesSeoData = [
      {
        page_route: "/",
        meta_title: `Abhishek Tiwari | Full Stack Developer – React, Node, AI`,
        meta_description: `Full stack developer building booking platforms, fintech dashboards and identity systems with React, Node.js, Laravel and AI. See projects and get in touch.`,
        meta_keywords: keywordsList,
        og_title: `Abhishek Tiwari | Full Stack Developer`,
        og_description: `Booking platforms, fintech dashboards and identity systems with React, Node, Laravel and AI.`,
        og_image: "https://www.abhishektiwari.online/og.png",
        canonical_url: "https://www.abhishektiwari.online/",
        structured_jsonld: {
          "@context": "https://schema.org",
          "@type": "Person",
          "name": candidateName,
          "url": "https://www.abhishektiwari.online/",
          "jobTitle": "Full Stack Developer",
          "sameAs": [
            "https://linkedin.com/in/abhishektiwari1540",
            "https://github.com/abhishektiwari1540"
          ],
          "knowsAbout": ["React", "Node.js", "Laravel", "TypeScript", "AI integration"],
          "description": `Full stack developer building booking platforms, fintech dashboards and identity systems with React, Node.js, Laravel and AI.`
        }
      },
      {
        page_route: "/about",
        meta_title: `About Abhishek Tiwari | Full Stack & AI Systems Engineer`,
        meta_description: `Learn more about Abhishek Tiwari's technical journey, expertise in React, Node.js, TypeScript, Laravel, and cloud microservices.`,
        meta_keywords: `About Abhishek Tiwari, Full Stack Developer Bio, Node.js Expert, React Developer, Gemini AI Engineer`,
        og_title: `About Abhishek Tiwari - Full Stack & AI Engineer`,
        og_description: `Building scalable web platforms, booking systems, and AI integrations.`,
        og_image: "https://www.abhishektiwari.online/og.png",
        canonical_url: "https://www.abhishektiwari.online/about",
        structured_jsonld: {
          "@context": "https://schema.org",
          "@type": "ProfilePage",
          "mainEntity": {
            "@type": "Person",
            "name": candidateName,
            "jobTitle": "Full Stack Developer",
            "description": analysis.profileStrengths.join(" ")
          }
        }
      },
      {
        page_route: "/#contact",
        meta_title: `Contact Abhishek Tiwari | Full Stack & AI Developer`,
        meta_description: `Get in touch with Abhishek Tiwari for full stack development, web platforms, AI integrations, and technical consulting.`,
        meta_keywords: `Contact Abhishek Tiwari, Hire Full Stack Developer, React Node Consultant, AI Developer Hire`,
        og_title: `Contact Abhishek Tiwari - Full Stack & AI Developer`,
        og_description: `Available for full stack engineering projects and technical consulting.`,
        og_image: "https://www.abhishektiwari.online/og.png",
        canonical_url: "https://www.abhishektiwari.online/#contact",
        structured_jsonld: {
          "@context": "https://schema.org",
          "@type": "ContactPage",
          "name": `Contact ${candidateName}`,
          "url": "https://www.abhishektiwari.online/#contact",
          "mainEntity": {
            "@type": "Person",
            "name": candidateName,
            "email": "abhishektiwari1540@gmail.com"
          }
        }
      }
    ];

    // 1. Save records to database
    await saveSeoMetadataRecords(pagesSeoData);

    // 2. Fire receiver webhook if configured
    let webhookStatus = "No webhook URL specified (saved locally & database)";
    if (webhookUrl) {
      try {
        const hookRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "SEO_METADATA_SYNC",
            targetSite: "https://www.abhishektiwari.online/",
            updatedAt: new Date().toISOString(),
            pages: pagesSeoData
          })
        });
        webhookStatus = hookRes.ok ? `Webhook delivered successfully (${hookRes.status})` : `Webhook failed (${hookRes.status})`;
      } catch (err: any) {
        webhookStatus = `Webhook error: ${err.message}`;
      }
    }

    const seoMap: Record<string, any> = {};
    pagesSeoData.forEach((p) => { seoMap[p.page_route] = p; });

    res.json({
      success: true,
      message: "SEO metadata generated, synchronized, and saved successfully!",
      timestamp: new Date().toISOString(),
      targetSite: "https://www.abhishektiwari.online/",
      pagesUpdatedCount: pagesSeoData.length,
      pages: seoMap,
      webhookStatus,
      receiverScriptUrl: "https://career-digest.vercel.app/api/seo/sync"
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/seo/sync - Retrieve synchronized SEO metadata (Used by client receiver script on https://www.abhishektiwari.online/)
app.get("/api/seo/sync", async (req, res) => {
  try {
    const records = await fetchSeoMetadataRecords();
    
    // If store is empty, trigger initial generation
    if (Object.keys(records).length === 0) {
      const analysis = await generatePersonalSeoAnalysis();
      const candidateName = analysis.candidateName || "Abhishek Tiwari";
      const keywordsList = [...analysis.topCoveredKeywords, ...analysis.recommendedSeoKeywords].join(", ");

      const pagesSeoData = [
        {
          page_route: "/",
          meta_title: `${candidateName} | Senior Backend Developer (Node.js, Express, TypeScript) & AI Engineer`,
          meta_description: `Official Portfolio of ${candidateName} - Senior Backend Developer & AI LLM Integration Specialist with 3+ years experience building high-concurrency Node.js microservices, Gemini vector search engines, and PHP/Laravel applications.`,
          meta_keywords: keywordsList,
          og_title: `${candidateName} | Senior Backend Developer & AI LLM Specialist`,
          og_description: `Building high-throughput Node.js microservices, real-time WebSockets, and Gemini multimodal vector search systems.`,
          og_image: "https://www.abhishektiwari.online/og-image.jpg",
          canonical_url: "https://www.abhishektiwari.online/",
          structured_jsonld: {
            "@context": "https://schema.org",
            "@type": "Person",
            "name": candidateName,
            "url": "https://www.abhishektiwari.online/",
            "jobTitle": "Senior Backend Developer & AI LLM Engineer",
            "sameAs": ["https://career-digest.vercel.app/"]
          }
        },
        {
          page_route: "/about",
          meta_title: `About ${candidateName} | Senior Backend Architect & AI Systems Specialist`,
          meta_description: `Learn more about ${candidateName}'s technical journey, 3+ years production expertise in Node.js, TypeScript, Express, Supabase pgvector, and cloud microservices.`,
          meta_keywords: `About ${candidateName}, Backend Engineer Bio, Node.js Expert, Gemini AI RAG Engineer, Supabase pgvector Specialist`,
          og_title: `About ${candidateName} - Senior Backend & AI Architect`,
          og_description: `3+ years engineering scalable backend systems, async retry queues, and multimodal vector search engines.`,
          og_image: "https://www.abhishektiwari.online/og-about-image.jpg",
          canonical_url: "https://www.abhishektiwari.online/about"
        },
        {
          page_route: "/#contact",
          meta_title: `Contact ${candidateName} | Hire Senior Backend Developer & AI LLM Consultant`,
          meta_description: `Get in touch with ${candidateName} for senior backend developer roles, AI system architecture, microservices engineering, and technical consulting. Available for high-impact remote engagements.`,
          meta_keywords: `Contact ${candidateName}, Hire Senior Backend Developer, Node.js Consultant, AI Developer Hire, Tech Consultant`,
          og_title: `Contact ${candidateName} - Hire Senior Backend & AI LLM Developer`,
          og_description: `Available for senior backend engineering roles, AI microservice architecture, and technical consulting.`,
          og_image: "https://www.abhishektiwari.online/og-contact-image.jpg",
          canonical_url: "https://www.abhishektiwari.online/#contact"
        }
      ];

      await saveSeoMetadataRecords(pagesSeoData);
      const updatedRecords = await fetchSeoMetadataRecords();
      return res.json({ success: true, pages: updatedRecords });
    }

    res.json({ success: true, pages: records });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/google-search - Grounded Google Search Query API
app.post("/api/google-search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, error: "Query is required" });
    const searchResult = await searchGoogleApi(query, 6);
    res.json({ success: true, searchResult });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/track-reading - Record reading time & interaction in database
app.post("/api/track-reading", async (req, res) => {
  try {
    const { articleTitle, url, topicCategory, readingTimeSeconds } = req.body;
    if (!articleTitle) {
      return res.status(400).json({ success: false, error: "articleTitle is required" });
    }
    const logEntry = await recordUserReadingLog({
      articleTitle,
      url,
      topicCategory,
      readingTimeSeconds: Number(readingTimeSeconds) || 60,
    });
    const stats = await getUserReadingStats();
    res.json({ success: true, logEntry, stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/reading-stats - Retrieve user reading statistics
app.get("/api/reading-stats", async (req, res) => {
  try {
    const stats = await getUserReadingStats();
    res.json({ success: true, stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ALL /api/cron/daily - Vercel Scheduled Daily Cron Route Handler
app.all("/api/cron/daily", async (req, res) => {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = Boolean(req.headers["x-vercel-cron"]);
  const isCronJobOrg = (req.headers["user-agent"] || "").toLowerCase().includes("cron-job");

  if (cronSecret && cronSecret.trim() !== "" && !isVercelCron && !isCronJobOrg) {
    const authHeader = req.headers.authorization;
    const clientSecret = req.headers["x-second-brain-secret"] || (authHeader ? authHeader.replace("Bearer ", "") : req.query.secret);
    if (clientSecret !== cronSecret) {
      return res.status(401).json({ success: false, error: "Unauthorized Vercel Cron Secret" });
    }
  }

  try {
    const status = await forceTriggerSelfUpdate();
    // Await full data collection pipeline (Jobs, Trends, Events, Brand SEO, Supabase, Email)
    await executeFullDigestRun().catch((err) => {
      console.error("[server] Cron digest run error:", err.message);
    });

    res.json({
      success: true,
      message: "Vercel Cron executed successfully & Supabase database updated!",
      status,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/blogs/champion - Retrieve the #1 Ranked Daily Champion Blog (Used by https://www.abhishektiwari.online/)
app.get("/api/blogs/champion", async (req, res) => {
  try {
    const champion = await fetchLatestChampionBlog();
    res.json({
      success: true,
      targetPortfolio: "https://www.abhishektiwari.online/",
      champion,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/blogs/candidates - Retrieve all 12 candidate blogs and their SEO benchmark scores
app.get("/api/blogs/candidates", async (req, res) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const candidates = await fetchAllBlogCandidates(date);
    res.json({
      success: true,
      date,
      count: candidates.length,
      candidates,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/blogs/generate - Trigger 12-Blog Candidate Competition & Self-Judging Cycle
app.post("/api/blogs/generate", async (req, res) => {
  try {
    const result = await generate12BlogCandidatesWorkflow();
    res.json({
      success: true,
      message: "Generated 12 candidate blogs & selected Daily Champion!",
      champion: result.champion,
      candidatesCount: result.candidates.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/blogs/sync - Webhook Sync Daily Champion Blog to https://www.abhishektiwari.online/
app.post("/api/blogs/sync", async (req, res) => {
  try {
    const webhookUrl = req.body?.webhookUrl || process.env.PORTFOLIO_BLOG_WEBHOOK_URL;
    const champion = await fetchLatestChampionBlog();

    let webhookStatus = "No webhook URL specified (saved in Supabase & served via /api/blogs/champion API)";
    if (webhookUrl) {
      try {
        const hookRes = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: "DAILY_CHAMPION_BLOG_PUBLISH",
            targetSite: "https://www.abhishektiwari.online/",
            publishedAt: new Date().toISOString(),
            blog: champion,
          }),
        });
        webhookStatus = hookRes.ok ? `Delivered to webhook (${hookRes.status})` : `Webhook HTTP error (${hookRes.status})`;
      } catch (err: any) {
        webhookStatus = `Webhook dispatch error: ${err.message}`;
      }
    }

    res.json({
      success: true,
      message: "Daily Champion Blog synchronized!",
      targetSite: "https://www.abhishektiwari.online/",
      champion,
      webhookStatus,
      apiEndpoint: "https://career-digest.vercel.app/api/blogs/champion",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/viral-posts/candidates - Retrieve 10 viral post candidates & auto-publish results
app.get("/api/viral-posts/candidates", async (req, res) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
    const candidates = await fetchLatestViralPosts(date);
    res.json({
      success: true,
      date,
      count: candidates.length,
      candidates,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/viral-posts/generate - Trigger 10-Post Viral Competition & Auto-Publish Winner Across All Platforms
app.post("/api/viral-posts/generate", async (req, res) => {
  try {
    const result = await generate10ViralPostsWorkflow();
    res.json({
      success: true,
      message: "Generated 10 viral posts & published #1 Winner across all connected platforms!",
      winner: result.winner,
      publishResults: result.publishResults,
      candidatesCount: result.candidates.length,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/self-update/status - Engine status & heartbeat
app.get("/api/self-update/status", (req, res) => {
  res.json({ success: true, status: getSelfUpdatingStatus() });
});

// POST /api/self-update/trigger - Force immediate self-update
app.post("/api/self-update/trigger", async (req, res) => {
  try {
    const status = await forceTriggerSelfUpdate();
    res.json({ success: true, status });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/self-update/toggle - Toggle auto sync active state
app.post("/api/self-update/toggle", (req, res) => {
  const { active } = req.body;
  setSelfUpdatingActive(Boolean(active));
  res.json({ success: true, status: getSelfUpdatingStatus() });
});

export default app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3005;
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Second Brain Data Hub & Multi-Platform Web Dashboard is LIVE!`);
    console.log(`🔗 Open in Browser: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
    startSelfUpdatingEngine();
  });
}


