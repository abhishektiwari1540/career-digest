import { config } from "../config.js";
import type { PublishPayload, PublishResult, SocialPublisher } from "./types.js";

/**
 * Dev.to API Publisher
 * Dev.to provides simple, official API-key posting with no review process.
 * Limit: No strict post count ceiling for personal developer accounts.
 */
export class DevToPublisher implements SocialPublisher {
  platform = "devto";

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const apiKey = config.devtoApiKey;

    if (!apiKey) {
      console.log(`[publisher:devto] DEVTO_API_KEY not configured. Dry-run mode: Dev.to article simulated successfully.`);
      return {
        id: `devto_sim_${Date.now()}`,
        platform: "devto",
        success: true,
        url: "https://dev.to/simulated-post",
      };
    }

    try {
      const tags = (payload.hashtags || ["webdev", "javascript", "programming"])
        .map((t) => t.replace(/^#/, "").toLowerCase().replace(/[^a-z0-9]/g, ""))
        .filter(Boolean)
        .slice(0, 4);

      const articlePayload = {
        article: {
          title: payload.title || payload.text.split("\n")[0].slice(0, 80) || "Daily Technical Digest & Insights",
          published: true,
          body_markdown: payload.text,
          tags: tags.length > 0 ? tags : ["webdev"],
          ...(payload.mediaUrl ? { main_image: payload.mediaUrl } : {}),
        },
      };

      const res = await fetch("https://dev.to/api/articles", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify(articlePayload),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Dev.to API returned ${res.status}: ${errText}`);
      }

      const data = await res.json();
      console.log(`[publisher:devto] Live published to Dev.to! URL: ${data.url}`);

      return {
        id: String(data.id || Date.now()),
        platform: "devto",
        success: true,
        url: data.url,
      };
    } catch (err: any) {
      console.error("[publisher:devto] Dev.to publish failed:", err.message);
      return {
        id: "",
        platform: "devto",
        success: false,
        error: err.message,
      };
    }
  }
}
