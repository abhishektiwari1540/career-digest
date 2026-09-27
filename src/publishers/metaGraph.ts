import type { PublishPayload, PublishResult, SocialPublisher } from "./types.js";

export class MetaGraphPublisher implements SocialPublisher {
  platform: string;

  constructor(platform: "instagram" | "facebook" | "threads" = "instagram") {
    this.platform = platform;
  }

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const accessToken = process.env.META_ACCESS_TOKEN || "";
    const pageId = process.env.META_PAGE_ID || "";

    if (!accessToken || !pageId) {
      console.log(`[publisher:${this.platform}] META_ACCESS_TOKEN / META_PAGE_ID not set. Skipping live Meta Graph API post.`);
      return {
        id: `meta_${this.platform}_sim_${Date.now()}`,
        platform: this.platform,
        success: true,
        url: `https://www.${this.platform}.com/`,
      };
    }

    try {
      const message = `${payload.text}\n\n${(payload.hashtags || []).join(" ")}`.trim();
      const res = await fetch(`https://graph.facebook.com/v19.0/${pageId}/feed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          access_token: accessToken,
        }),
      });

      if (!res.ok) {
        throw new Error(`Meta Graph API post failed: ${res.status} ${await res.text()}`);
      }

      const data = await res.json();
      return {
        id: data.id || `meta_${Date.now()}`,
        url: `https://www.facebook.com/${data.id}`,
        platform: this.platform,
        success: true,
      };
    } catch (err: any) {
      console.warn(`[publisher:${this.platform}] Error posting to Meta Graph API: ${err.message}`);
      return {
        id: "",
        platform: this.platform,
        success: false,
        error: err.message,
      };
    }
  }
}
