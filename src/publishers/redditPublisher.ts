import type { PublishPayload, PublishResult, SocialPublisher } from "./types.js";

export class RedditPublisher implements SocialPublisher {
  platform = "reddit";

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const clientId = process.env.REDDIT_CLIENT_ID || "";
    const clientSecret = process.env.REDDIT_CLIENT_SECRET || "";

    if (!clientId || !clientSecret) {
      console.log("[publisher:reddit] Reddit API credentials not configured. Executing dry-run simulation mode for r/developersIndia.");
      return {
        id: `reddit_sim_${Date.now()}`,
        platform: "reddit",
        success: true,
        url: "https://www.reddit.com/r/developersIndia/",
      };
    }

    try {
      // Live Reddit API Submit Post Call
      const res = await fetch("https://oauth.reddit.com/api/submit", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${clientSecret}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          sr: "developersIndia",
          kind: "self",
          title: payload.title || "Developer Insights",
          text: payload.text,
        }),
      });

      if (!res.ok) {
        throw new Error(`Reddit API submit error: ${res.status} ${await res.text()}`);
      }

      const data = await res.json();
      return {
        id: data.json?.data?.id || `reddit_${Date.now()}`,
        url: data.json?.data?.url || "https://www.reddit.com/r/developersIndia/",
        platform: "reddit",
        success: true,
      };
    } catch (err: any) {
      console.warn("[publisher:reddit] Error posting to Reddit API:", err.message);
      return {
        id: "",
        platform: "reddit",
        success: false,
        error: err.message,
      };
    }
  }
}
