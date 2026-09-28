import { generatePersonalSeoAnalysis } from "../llm/seoProfileEngine.js";
import { fetchTrendTopics } from "../collectors/trends.js";
import { fetchYouTubeTrends } from "../collectors/youtube.js";

export interface SelfUpdatingStatus {
  active: boolean;
  intervalSeconds: number;
  lastUpdated: string;
  nextUpdateInSeconds: number;
  cycleCount: number;
  lastLogMessage: string;
  cachedSeoAnalysis: any;
  cachedTrendsCount: number;
}

let isActive = true;
const intervalSeconds = 60; // Auto update every 60 seconds (1 minute)
let lastUpdated = new Date().toISOString();
let cycleCount = 0;
let lastLogMessage = "Engine initialized";
let countdownSeconds = intervalSeconds;
let cachedSeoAnalysis: any = null;
let cachedTrendsCount = 0;
let timerId: NodeJS.Timeout | null = null;
let countdownTimerId: NodeJS.Timeout | null = null;

export async function performSelfUpdateCycle(): Promise<string> {
  try {
    cycleCount++;
    lastUpdated = new Date().toISOString();
    countdownSeconds = intervalSeconds;

    // 1. Recalculate SEO Profile & Grounded Read/Post Recommendations
    cachedSeoAnalysis = await generatePersonalSeoAnalysis();

    // 2. Fetch fresh trends count
    const [trends, yttrends] = await Promise.all([
      fetchTrendTopics().catch(() => []),
      fetchYouTubeTrends().catch(() => []),
    ]);
    cachedTrendsCount = trends.length + yttrends.length;

    lastLogMessage = `Cycle #${cycleCount} complete: Synced ${cachedTrendsCount} live trends & refreshed SEO recommendations for ${cachedSeoAnalysis.candidateName}`;
    console.log(`[selfUpdatingEngine] ${lastLogMessage}`);
    return lastLogMessage;
  } catch (err: any) {
    lastLogMessage = `Cycle #${cycleCount} warning: ${err.message}`;
    console.warn(`[selfUpdatingEngine] ${lastLogMessage}`);
    return lastLogMessage;
  }
}

export function startSelfUpdatingEngine() {
  if (timerId) return;

  console.log(`[selfUpdatingEngine] Starting continuous self-updating engine (Cycle interval: ${intervalSeconds}s)...`);

  // Perform initial immediate run
  performSelfUpdateCycle();

  // Ticker for countdown
  countdownTimerId = setInterval(() => {
    if (isActive) {
      countdownSeconds = Math.max(0, countdownSeconds - 1);
      if (countdownSeconds === 0) {
        countdownSeconds = intervalSeconds;
      }
    }
  }, 1000);

  // Main update cycle timer
  timerId = setInterval(() => {
    if (isActive) {
      performSelfUpdateCycle();
    }
  }, intervalSeconds * 1000);
}

export function getSelfUpdatingStatus(): SelfUpdatingStatus {
  return {
    active: isActive,
    intervalSeconds,
    lastUpdated,
    nextUpdateInSeconds: countdownSeconds,
    cycleCount,
    lastLogMessage,
    cachedSeoAnalysis,
    cachedTrendsCount,
  };
}

export function setSelfUpdatingActive(active: boolean) {
  isActive = active;
  if (active && countdownSeconds === 0) {
    countdownSeconds = intervalSeconds;
  }
}

export async function forceTriggerSelfUpdate(): Promise<SelfUpdatingStatus> {
  await performSelfUpdateCycle();
  return getSelfUpdatingStatus();
}
