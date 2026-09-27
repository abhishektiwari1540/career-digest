import express from "express";
import fs from "fs";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");
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
  saveMultimodalVector,
  saveSecondBrainMemory,
  supabase,
} from "./storage/supabase.js";

import { processLinkedInZipArchive } from "./storage/zipImporter.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 150 * 1024 * 1024 } });

app.use(express.json());
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
      const pdfData = await pdfParse(buffer);
      extractedText = pdfData.text || "";
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

    // Process & Embed in parallel with vector embeddings
    let vectorsGeneratedCount = 0;
    for (const item of processedItems) {
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

export default app;

if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3005;
  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Second Brain Data Hub & Multi-Platform Web Dashboard is LIVE!`);
    console.log(`🔗 Open in Browser: http://localhost:${PORT}`);
    console.log(`======================================================\n`);
  });
}

