import { config } from "../config.js";
import type { JobListing } from "../types.js";

interface AdzunaResult {
  id: string;
  title: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  redirect_url: string;
  description?: string;
}

interface AdzunaResponse {
  results: AdzunaResult[];
}

interface RemotiveJob {
  id: number;
  title: string;
  company_name: string;
  url: string;
  candidate_required_location: string;
  description: string;
}

interface RemotiveResponse {
  jobs: RemotiveJob[];
}

interface JobicyJob {
  id: number;
  jobTitle: string;
  companyName: string;
  jobGeo: string;
  url: string;
  jobExcerpt: string;
}

interface JobicyResponse {
  jobs: JobicyJob[];
}

/**
 * Fetches job listings from multiple 100% free & official sources:
 * 1. Adzuna India Jobs (requires free App ID / Key)
 * 2. Remotive Software Dev Jobs (100% Free, Keyless)
 * 3. Jobicy Tech Jobs (100% Free, Keyless)
 */
export async function fetchJobListings(): Promise<JobListing[]> {
  const [adzunaJobs, remotiveJobs, jobicyJobs] = await Promise.all([
    fetchAdzunaJobs().catch(() => []),
    fetchRemotiveJobs().catch(() => []),
    fetchJobicyJobs().catch(() => []),
  ]);

  const allJobs = [...adzunaJobs, ...remotiveJobs, ...jobicyJobs];
  return allJobs.map(scoreJob);
}

async function fetchAdzunaJobs(): Promise<JobListing[]> {
  const params = new URLSearchParams({
    app_id: config.adzuna.appId,
    app_key: config.adzuna.appKey,
    what: config.adzuna.what,
    "content-type": "application/json",
    results_per_page: "20",
  });
  if (config.adzuna.where) params.set("where", config.adzuna.where);

  const url = `https://api.adzuna.com/v1/api/jobs/${config.adzuna.country}/search/1?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = (await res.json()) as AdzunaResponse;
  return data.results.map((r) => ({
    source: "adzuna",
    externalId: String(r.id),
    title: r.title,
    company: r.company?.display_name ?? null,
    location: r.location?.display_name ?? "India",
    url: r.redirect_url,
    descriptionSnippet: (r.description ?? "").slice(0, 500),
  }));
}

/**
 * 100% Free API - Remotive Remote Software Development Jobs
 */
async function fetchRemotiveJobs(): Promise<JobListing[]> {
  const url = "https://remotive.com/api/remote-jobs?category=software-dev&limit=10";
  const res = await fetch(url);
  if (!res.ok) return [];

  const data = (await res.json()) as RemotiveResponse;
  return (data.jobs || []).map((j) => ({
    source: "remotive",
    externalId: String(j.id),
    title: j.title,
    company: j.company_name,
    location: j.candidate_required_location || "Remote",
    url: j.url,
    descriptionSnippet: (j.description || "").replace(/<[^>]*>/g, "").slice(0, 500),
  }));
}

/**
 * 100% Free API - Jobicy Tech Remote Jobs
 */
async function fetchJobicyJobs(): Promise<JobListing[]> {
  const url = "https://jobicy.com/api/v2/remote-jobs?count=10&industry=engineering";
  const res = await fetch(url, { headers: { "User-Agent": "CareerDigest/1.0" } });
  if (!res.ok) return [];

  const data = (await res.json()) as JobicyResponse;
  return (data.jobs || []).map((j) => ({
    source: "jobicy",
    externalId: String(j.id),
    title: j.jobTitle,
    company: j.companyName,
    location: j.jobGeo || "Remote",
    url: j.url,
    descriptionSnippet: (j.jobExcerpt || "").slice(0, 500),
  }));
}

/**
 * Honest skill-match score (0-100%) based on keyword overlap with profile skills.
 */
function scoreJob(job: JobListing): JobListing {
  const haystack = `${job.title} ${job.descriptionSnippet}`.toLowerCase();
  const skills = config.profileSkills;
  if (skills.length === 0) return job;

  const matched = skills.filter((skill) => haystack.includes(skill));
  const score = Math.round((matched.length / skills.length) * 100);

  return {
    ...job,
    skillMatchScore: score,
    matchReasoning: matched.length
      ? `Matches on: ${matched.join(", ")}`
      : "No stated skills found in listing text",
  };
}

