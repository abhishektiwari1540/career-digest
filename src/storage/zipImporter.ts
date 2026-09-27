import AdmZip from "adm-zip";
import { generateMultimodalEmbedding } from "../llm/embedding.js";
import { extractAndSaveVoiceProfile } from "../llm/voiceProfile.js";
import { saveMultimodalVector, saveSecondBrainMemory, supabase } from "./supabase.js";

export interface ZipIngestionResult {
  fileName: string;
  sharesCount: number;
  articlesCount: number;
  positionsCount: number;
  skillsCount: number;
  commentsCount: number;
  totalIngestedItems: number;
  samplePreview: string;
  voiceProfileExtracted: boolean;
}

/**
 * Parses and ingests a full LinkedIn Data Export ZIP archive (up to 100MB+).
 * Extracts Shares.csv, Articles.csv, Positions.csv, Skills.csv, and Comments.csv.
 */
export async function processLinkedInZipArchive(buffer: Buffer, fileName: string): Promise<ZipIngestionResult> {
  const zip = new AdmZip(buffer);
  const zipEntries = zip.getEntries();

  let sharesCount = 0;
  let articlesCount = 0;
  let positionsCount = 0;
  let skillsCount = 0;
  let commentsCount = 0;
  let samplePreview = "";
  const processedItems: Array<{ key: string; text: string; category: string }> = [];

  for (const entry of zipEntries) {
    if (entry.isDirectory) continue;
    const entryName = entry.entryName.replace(/^.*[\\/]/, ""); // Get base filename
    const lowerName = entryName.toLowerCase();

    if (lowerName === "shares.csv" || lowerName === "posts.csv") {
      const content = entry.getData().toString("utf-8");
      const rows = parseCsv(content);
      const linkedinPostsToSave: any[] = [];

      rows.forEach((r, idx) => {
        const text = r["ShareCommentary"] || r["Commentary"] || "";
        const url = r["ShareLink"] || r["SharedUrl"] || "";
        const date = r["Date"] || new Date().toISOString();

        if (text.length > 5) {
          sharesCount++;
          if (!samplePreview) samplePreview = text.slice(0, 150);

          linkedinPostsToSave.push({
            posted_at: date,
            content: text,
            url,
          });

          processedItems.push({
            key: `linkedin_zip_share_${idx}_${Date.now()}`,
            text: `[LinkedIn Share - ${date}]: ${text}`,
            category: "linkedin_export",
          });
        }
      });

      if (linkedinPostsToSave.length > 0) {
        const { error } = await supabase.from("linkedin_posts").insert(linkedinPostsToSave);
        if (error) console.warn("[zipImporter] linkedin_posts insert note:", error.message);
      }
    } else if (lowerName === "articles.csv") {
      const content = entry.getData().toString("utf-8");
      const rows = parseCsv(content);

      rows.forEach((r, idx) => {
        const title = r["Title"] || r["ArticleTitle"] || "Untitled Article";
        const body = r["Text"] || r["Content"] || r["Summary"] || "";
        const date = r["Published Date"] || r["Date"] || new Date().toISOString();

        if (body.length > 10 || title.length > 5) {
          articlesCount++;
          processedItems.push({
            key: `linkedin_zip_article_${idx}_${Date.now()}`,
            text: `[LinkedIn Published Article - ${title} (${date})]: ${body.slice(0, 1500)}`,
            category: "linkedin_article",
          });
        }
      });
    } else if (lowerName === "positions.csv" || lowerName === "jobs.csv") {
      const content = entry.getData().toString("utf-8");
      const rows = parseCsv(content);

      rows.forEach((r, idx) => {
        const company = r["Company Name"] || r["Organization"] || "";
        const title = r["Title"] || r["Position"] || "";
        const description = r["Description"] || "";
        const dates = `${r["Started On"] || ""} to ${r["Finished On"] || "Present"}`;

        if (company || title) {
          positionsCount++;
          processedItems.push({
            key: `linkedin_zip_position_${idx}_${Date.now()}`,
            text: `[Career Background - ${title} at ${company} (${dates})]: ${description}`,
            category: "career_history",
          });
        }
      });
    } else if (lowerName === "skills.csv") {
      const content = entry.getData().toString("utf-8");
      const rows = parseCsv(content);

      const skillNames = rows.map((r) => r["Name"] || r["Skill"]).filter(Boolean);
      if (skillNames.length > 0) {
        skillsCount = skillNames.length;
        processedItems.push({
          key: `linkedin_zip_skills_${Date.now()}`,
          text: `[Validated Candidate Skills List]: ${skillNames.join(", ")}`,
          category: "resume_bio",
        });
      }
    } else if (lowerName === "comments.csv") {
      const content = entry.getData().toString("utf-8");
      const rows = parseCsv(content);

      rows.forEach((r, idx) => {
        const comment = r["Message"] || r["Comment"] || "";
        const date = r["Date"] || "";
        if (comment.length > 15) {
          commentsCount++;
          if (idx < 20) {
            // Keep top 20 thought leadership comments
            processedItems.push({
              key: `linkedin_zip_comment_${idx}_${Date.now()}`,
              text: `[LinkedIn Comment Leadership - ${date}]: ${comment}`,
              category: "thought_leadership",
            });
          }
        }
      });
    }
  }

  // Save memories & generate vector embeddings
  for (const item of processedItems) {
    await saveSecondBrainMemory({
      category: item.category,
      conceptKey: item.key,
      memoryText: item.text,
    });

    const vector = await generateMultimodalEmbedding(item.text);
    await saveMultimodalVector(item.key, item.category, vector, {
      fileName,
      ingestedAt: new Date().toISOString(),
    });
  }

  // Auto-run Voice Fingerprint Extraction
  let voiceProfileExtracted = false;
  try {
    await extractAndSaveVoiceProfile();
    voiceProfileExtracted = true;
  } catch (err: any) {
    console.warn("[zipImporter] Voice profile extraction note:", err.message);
  }

  return {
    fileName,
    sharesCount,
    articlesCount,
    positionsCount,
    skillsCount,
    commentsCount,
    totalIngestedItems: processedItems.length,
    samplePreview: samplePreview || "LinkedIn Archive processed successfully!",
    voiceProfileExtracted,
  };
}

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
