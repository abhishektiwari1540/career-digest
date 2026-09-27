import { config } from "../config.js";
import type { PublishPayload, PublishResult, SocialPublisher } from "./types.js";

/**
 * LinkedIn Personal Profile Publisher
 * Uses LinkedIn Share API v2 (`ugcPosts`) with self-serve `w_member_social` permission.
 * Genuinely zero-friction: Requires no partner review process for personal profile text/image shares.
 * Rate limit: 150 posts/member/day, 100,000 requests/app/day.
 */
export class LinkedInPublisher implements SocialPublisher {
  platform = "linkedin";

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const accessToken = config.linkedInAccessToken;
    const personUrnRaw = config.linkedInPersonUrn;

    if (!accessToken || !personUrnRaw) {
      console.log(`[publisher:linkedin] LINKEDIN_ACCESS_TOKEN or LINKEDIN_PERSON_URN not configured. Dry-run mode: LinkedIn share simulated successfully.`);
      return {
        id: `linkedin_sim_${Date.now()}`,
        platform: "linkedin",
        success: true,
        url: "https://www.linkedin.com/feed/",
      };
    }

    try {
      const personUrn = personUrnRaw.startsWith("urn:li:person:")
        ? personUrnRaw
        : `urn:li:person:${personUrnRaw}`;

      const hashtagsText = payload.hashtags && payload.hashtags.length > 0
        ? `\n\n${payload.hashtags.slice(0, 5).join(" ")}`
        : "";
      
      const commentary = `${payload.text}${hashtagsText}`;

      const postBody: any = {
        author: personUrn,
        lifecycleState: "PUBLISHED",
        specificContent: {
          "com.linkedin.ugc.ShareContent": {
            shareCommentary: {
              text: commentary,
            },
            shareMediaCategory: payload.mediaUrl ? "ARTICLE" : "NONE",
            ...(payload.mediaUrl
              ? {
                  media: [
                    {
                      status: "READY",
                      originalUrl: payload.mediaUrl,
                      title: {
                        text: payload.title || "Career & Developer Digest Update",
                      },
                    },
                  ],
                }
              : {}),
          },
        },
        visibility: {
          "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
        },
      };

      const res = await fetch("https://api.linkedin.com/v2/ugcPosts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(postBody),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`LinkedIn API returned status ${res.status}: ${errText}`);
      }

      const postUrn = res.headers.get("x-restli-id") || (await res.json().catch(() => ({}))).id || `urn:li:share:${Date.now()}`;
      console.log(`[publisher:linkedin] Live published to LinkedIn! Share URN: ${postUrn}`);

      return {
        id: String(postUrn),
        platform: "linkedin",
        success: true,
        url: `https://www.linkedin.com/feed/update/${encodeURIComponent(postUrn)}`,
      };
    } catch (err: any) {
      console.error("[publisher:linkedin] LinkedIn publish failed:", err.message);
      return {
        id: "",
        platform: "linkedin",
        success: false,
        error: err.message,
      };
    }
  }
}
