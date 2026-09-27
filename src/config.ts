import "dotenv/config";

function getEnv(name: string, fallbacks: string[] = [], defaultValue?: string): string {
  const names = [name, ...fallbacks];
  for (const n of names) {
    const val = process.env[n];
    if (val !== undefined && val.trim() !== "") {
      return val.trim();
    }
  }
  if (defaultValue !== undefined) {
    return defaultValue;
  }
  throw new Error(`Missing required env var: ${name}${fallbacks.length > 0 ? ` (or ${fallbacks.join(", ")})` : ""}`);
}

export const config = {
  supabase: {
    url: getEnv("SUPABASE_URL", ["NEXT_PUBLIC_SUPABASE_URL"]),
    serviceRoleKey: getEnv("SUPABASE_SERVICE_ROLE_KEY", [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_ANON_KEY",
      "SUPABASE_KEY",
    ]),
  },
  gemini: {
    apiKey: getEnv("GEMINI_API_KEY", [], ""),
    model: process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
    gcpProjectId: process.env.GCP_PROJECT_ID ?? "",
    gcpLocation: process.env.GCP_LOCATION ?? "us-central1",
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY ?? "",
    model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
  },
  openRouter: {
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    model: process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
  },
  adzuna: {
    appId: getEnv("ADZUNA_APP_ID", [], ""),
    appKey: getEnv("ADZUNA_APP_KEY", [], ""),
    country: process.env.ADZUNA_COUNTRY ?? "in",
    what: process.env.ADZUNA_WHAT ?? "software developer",
    where: process.env.ADZUNA_WHERE ?? "jaipur",
  },
  googleSearch: {
    apiKey: process.env.GOOGLE_SEARCH_API_KEY ?? "",
    cx: process.env.GOOGLE_SEARCH_CX ?? "",
  },
  resend: {
    apiKey: getEnv("RESEND_API_KEY", [], ""),
    toEmail: getEnv("DIGEST_TO_EMAIL", [], "abhishekabhit57@gmail.com"),
    fromEmail: getEnv("DIGEST_FROM_EMAIL", [], "digest@yourdomain.com"),
  },
  profileSkills: (process.env.PROFILE_SKILLS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  candidateName: process.env.CANDIDATE_NAME ?? "Abhishek Tiwari",
  candidateLocation: process.env.CANDIDATE_LOCATION ?? "Jaipur, Rajasthan, India",
  githubUsername: process.env.GITHUB_USERNAME ?? "",
  leetcodeUsername: process.env.LEETCODE_USERNAME ?? "",
  stackoverflowUserId: process.env.STACKOVERFLOW_USER_ID ?? "",
  youtubeApiKey: process.env.YOUTUBE_API_KEY || process.env.YT_KEY || "",
  devtoApiKey: process.env.DEVTO_API_KEY || "",
  linkedInClientId: process.env.LINKEDIN_CLIENT_ID || "",
  linkedInClientSecret: process.env.LINKEDIN_CLIENT_SECRET || "",
  linkedInAccessToken: process.env.LINKEDIN_ACCESS_TOKEN || "",
  linkedInPersonUrn: process.env.LINKEDIN_PERSON_URN || process.env.LINKEDIN_MEMBER_ID || "",
};


