import { config } from "../config.js";
import type { EventItem } from "../types.js";

interface DevToArticle {
  id: number;
  title: string;
  url: string;
  published_at: string;
  tag_list: string[];
}

interface GoogleSearchItem {
  title: string;
  link: string;
  snippet?: string;
}

interface GoogleSearchResponse {
  items?: GoogleSearchItem[];
}

/**
 * Fetches tech workshops, meetups, upskilling programs, product launches,
 * and hackathons from public feeds (GDG Jaipur, dev.to, Devpost, Google Custom Search).
 */
export async function fetchEvents(): Promise<EventItem[]> {
  const events: EventItem[] = [];

  const [devToEvents, gdgEvents, devpostEvents, customSearchEvents] = await Promise.all([
    fetchDevToEvents().catch(() => []),
    fetchGDGJaipurEvents().catch(() => []),
    fetchDevpostHackathons().catch(() => []),
    fetchGoogleSearchEvents().catch(() => []),
  ]);

  events.push(...devToEvents, ...gdgEvents, ...devpostEvents, ...customSearchEvents);

  // De-duplicate by URL
  const seenUrls = new Set<string>();
  const uniqueEvents: EventItem[] = [];
  for (const item of events) {
    if (!seenUrls.has(item.url)) {
      seenUrls.add(item.url);
      uniqueEvents.push(item);
    }
  }

  return uniqueEvents;
}

/**
 * Fetches events, workshops, and webinars posted on Dev.to.
 */
async function fetchDevToEvents(): Promise<EventItem[]> {
  const tags = ["events", "workshop", "webinar", "hackathon"];
  const allArticles: DevToArticle[] = [];

  for (const tag of tags) {
    try {
      const res = await fetch(`https://dev.to/api/articles?tag=${tag}&per_page=5`);
      if (res.ok) {
        const data = (await res.json()) as DevToArticle[];
        allArticles.push(...data);
      }
    } catch {
      // Ignore individual tag fetch errors
    }
  }

  return allArticles.map((a) => ({
    source: "dev.to",
    title: a.title,
    url: a.url,
    startsAt: a.published_at || new Date().toISOString(),
    category: determineCategory(a.title, a.tag_list),
    location: "Online / Global",
  }));
}

/**
 * Fetches GDG (Google Developer Groups) Jaipur community event information.
 */
async function fetchGDGJaipurEvents(): Promise<EventItem[]> {
  try {
    const res = await fetch("https://gdg.community.dev/api/event/?chapter=1794", {
      headers: { "Accept": "application/json" }
    });
    if (!res.ok) return getFallbackGDGItem();

    const data = await res.json();
    const results = data.results || [];
    
    if (results.length === 0) return getFallbackGDGItem();

    return results.slice(0, 5).map((e: any) => ({
      source: "gdg-jaipur",
      title: e.title || "GDG Jaipur Developer Meetup",
      url: e.url || "https://gdg.community.dev/gdg-jaipur/",
      startsAt: e.start_date || new Date().toISOString(),
      category: "Developer Meetup",
      location: "Jaipur, Rajasthan",
    }));
  } catch {
    return getFallbackGDGItem();
  }
}

/**
 * Fetches open hackathons & competitions from Devpost.
 */
async function fetchDevpostHackathons(): Promise<EventItem[]> {
  try {
    const res = await fetch("https://devpost.com/api/hackathons?status[]=online&challenge_type[]=online", {
      headers: { "User-Agent": "CareerDigestBot/1.0" }
    });
    if (!res.ok) return [];

    const data = await res.json();
    const hackathons = data.hackathons || [];

    return hackathons.slice(0, 5).map((h: any) => ({
      source: "devpost",
      title: `${h.title || "Online Hackathon"} - Prize: ${h.prize_amount || "Swag & Prizes"}`,
      url: h.url || "https://devpost.com/hackathons",
      startsAt: h.submission_period_dates || new Date().toISOString(),
      category: "Hackathon",
      location: "Online",
    }));
  } catch {
    return [];
  }
}

function getFallbackGDGItem(): EventItem[] {
  return [
    {
      source: "gdg-jaipur",
      title: "GDG Jaipur Upcoming Community Workshops & Meetups",
      url: "https://gdg.community.dev/gdg-jaipur/",
      startsAt: new Date().toISOString(),
      category: "Developer Community",
      location: "Jaipur, Rajasthan",
    },
  ];
}

/**
 * Optional: Google Programmable Search Engine API for tech workshops in Jaipur / Remote India.
 */
async function fetchGoogleSearchEvents(): Promise<EventItem[]> {
  const { apiKey, cx } = config.googleSearch;
  if (!apiKey || !cx) return [];

  const query = encodeURIComponent("free developer workshop upskilling jaipur OR india 2026");
  const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${query}&num=5`;

  const res = await fetch(url);
  if (!res.ok) return [];

  const data = (await res.json()) as GoogleSearchResponse;
  if (!data.items) return [];

  return data.items.map((item) => ({
    source: "google-search",
    title: item.title,
    url: item.link,
    startsAt: new Date().toISOString(),
    category: "Workshop / Tech Event",
    location: "India / Online",
  }));
}

function determineCategory(title: string, tags: string[] = []): string {
  const t = title.toLowerCase();
  if (t.includes("workshop") || tags.includes("workshop")) return "Workshop";
  if (t.includes("hackathon") || tags.includes("hackathon")) return "Hackathon";
  if (t.includes("launch") || tags.includes("product")) return "Product Launch";
  if (t.includes("webinar")) return "Webinar";
  return "Upskilling & Event";
}


