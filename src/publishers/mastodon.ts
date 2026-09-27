import type { PublishPayload, PublishResult, SocialPublisher } from "./types.js";

export class MastodonPublisher implements SocialPublisher {
  platform = "mastodon";

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const serverUrl = process.env.MASTODON_SERVER_URL || "https://mastodon.social";
    const accessToken = process.env.MASTODON_ACCESS_TOKEN || "";

    if (!accessToken) {
      console.log("[publisher:mastodon] MASTODON_ACCESS_TOKEN not set. Skipping live Mastodon post.");
      return {
        id: `masto_sim_${Date.now()}`,
        platform: this.platform,
        success: true,
        url: `${serverUrl}/@demo`,
      };
    }

    try {
      const statusText = `${payload.text}\n\n${(payload.hashtags || []).join(" ")}`.trim();

      const res = await fetch(`${serverUrl}/api/v1/statuses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          status: statusText,
          visibility: "public",
        }),
      });

      if (!res.ok) {
        throw new Error(`Mastodon status creation failed: ${res.status} ${await res.text()}`);
      }

      const data = await res.json();
      console.log(`[publisher:mastodon] Successfully posted to Mastodon: ${data.url}`);

      return {
        id: data.id,
        url: data.url,
        platform: this.platform,
        success: true,
      };
    } catch (err: any) {
      console.warn(`[publisher:mastodon] Error posting to Mastodon: ${err.message}`);
      return {
        id: "",
        platform: this.platform,
        success: false,
        error: err.message,
      };
    }
  }
}
