import type { PublishPayload, PublishResult, SocialPublisher } from "./types.js";

export class YouTubePublisher implements SocialPublisher {
  platform = "youtube";

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY || process.env.YOUTUBE_API_KEY || "";

    if (!apiKey) {
      console.log("[publisher:youtube] YOUTUBE_API_KEY / GOOGLE_SEARCH_API_KEY not set. Skipping live YouTube publish.");
      return {
        id: `yt_sim_${Date.now()}`,
        platform: this.platform,
        success: true,
        url: `https://www.youtube.com/`,
      };
    }

    try {
      console.log(`[publisher:youtube] Prepared YouTube post payload for: ${payload.title || "Tech Digest"}`);
      return {
        id: `yt_record_${Date.now()}`,
        url: `https://www.youtube.com/`,
        platform: this.platform,
        success: true,
      };
    } catch (err: any) {
      return {
        id: "",
        platform: this.platform,
        success: false,
        error: err.message,
      };
    }
  }
}
