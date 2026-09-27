export interface JobListing {
  source: string;
  externalId: string;
  title: string;
  company: string | null;
  location: string | null;
  url: string;
  descriptionSnippet: string;
  skillMatchScore?: number;
  matchReasoning?: string;
}

export interface TrendTopic {
  source: string;
  externalId: string;
  title: string;
  url: string;
  relevanceNote?: string;
}

export interface EventItem {
  source: string;
  title: string;
  url: string;
  startsAt: string | null;
  category?: string; // e.g. "Workshop", "Meetup", "Product Launch", "Upskilling"
  location?: string | null;
}

export interface BrandCitation {
  platform: string;
  query: string;
  indexedCount: number;
  sampleUrl?: string;
  status: "Indexed" | "Active" | "Pending";
}

export interface LinkedInPostContext {
  postedAt: string | null;
  content: string;
  url: string;
}

export interface ProjectContext {
  title: string;
  description: string;
  skills: string[];
  url?: string;
}

export interface DigestInput {
  jobs: JobListing[];
  trends: TrendTopic[];
  events: EventItem[];
  brandCitations?: BrandCitation[];
  linkedinPosts?: LinkedInPostContext[];
  projects?: ProjectContext[];
  profileSkills: string[];
}

export type PlatformType = "linkedin" | "x" | "devto" | "reddit" | "instagram";

export const HASHTAG_LIMITS: Record<PlatformType, number> = {
  linkedin: 5,
  x: 2,
  devto: 4,
  reddit: 0,
  instagram: 8,
};

export interface ContentPackItem {
  platform: PlatformType;
  postText: string;
  hashtags: string[];
  needsImage: boolean;
  imagePrompt?: string;
  imageUrl?: string;
}

export interface DigestResult {
  summaryMarkdown: string;
  contentPack?: ContentPack;
}

export interface ContentPack {
  targetDate: string;
  topic: string;
  linkedinPost: string;
  twitterPost: string;
  blogOutline: string;
  redditPost: string;
  hashtags: string[];
  imagePrompt: string;
  items?: ContentPackItem[];
}

export interface SecondBrainMemoryItem {
  category: "PastPost" | "Project" | "Skill" | "TrendInsight" | "LearnedTopic";
  conceptKey: string;
  memoryText: string;
  platform?: string;
  postText?: string;
  performanceScore?: number;
}

export interface ContentIdeaRecord extends ContentPack {
  id?: string;
  status?: string;
  createdAt?: string;
}

