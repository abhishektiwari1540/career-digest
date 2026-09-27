/**
 * Imports YOUR OWN LinkedIn post history from LinkedIn's official data
 * export - not scraping, and not something that touches anyone else's
 * data. LinkedIn's terms explicitly ban automated/scraped collection, but
 * they're required to hand you your own data on request.
 *
 * How to get the file:
 *   LinkedIn -> Settings & Privacy -> "Get a copy of your data" ->
 *   request the archive -> unzip it -> find "Shares.csv".
 *
 * Usage:
 *   npm run import:linkedin -- /path/to/Shares.csv
 */
import { readFileSync } from "node:fs";
import { supabase } from "./storage/supabase.js";

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

// Handles quoted fields with embedded commas - LinkedIn's export uses them.
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

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Usage: npm run import:linkedin -- /path/to/Shares.csv");
    process.exit(1);
  }

  const rows = parseCsv(readFileSync(path, "utf-8"));
  const posts = rows.map((r) => ({
    posted_at: r["Date"] || null,
    content: r["ShareCommentary"] || r["Commentary"] || "",
    url: r["ShareLink"] || r["SharedUrl"] || "",
  }));

  const { error } = await supabase.from("linkedin_posts").insert(posts);
  if (error) throw error;

  console.log(`Imported ${posts.length} posts from ${path}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
