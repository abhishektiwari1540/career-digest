import type { PublishPayload, PublishResult, SocialPublisher } from "./types.js";

export class XPublisher implements SocialPublisher {
  platform = "x";

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const apiKey = process.env.X_API_KEY || process.env.TWITTER_API_KEY || "";
    const bearerToken = process.env.X_BEARER_TOKEN || process.env.TWITTER_BEARER_TOKEN || "";

    if (!apiKey && !bearerToken) {
      console.log("[publisher:x] X / Twitter API credentials not configured. Executing dry-run simulation mode.");
      return {
        id: `x_sim_${Date.now()}`,
        platform: "x",
        success: true,
        url: "https://x.com/post/simulation",
      };
    }

    try {
      // Live X API v2 Tweet Creation Call
      const res = await fetch("https://api.twitter.com/2/tweets", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${bearerToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: `${payload.text.slice(0, 270)}...`,
        }),
      });

      if (!res.ok) {
        throw new Error(`X API v2 error: ${res.status} ${await res.text()}`);
      }

      const data = await res.json();
      return {
        id: data.data?.id || `x_${Date.now()}`,
        url: `https://x.com/i/status/${data.data?.id}`,
        platform: "x",
        success: true,
      };
    } catch (err: any) {
      console.warn("[publisher:x] Error posting to X API:", err.message);
      return {
        id: "",
        platform: "x",
        success: false,
        error: err.message,
      };
    }
  }
}
