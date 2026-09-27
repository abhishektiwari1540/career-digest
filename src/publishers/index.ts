import { BlueskyPublisher } from "./bluesky.js";
import { DevToPublisher } from "./devto.js";
import { LinkedInPublisher } from "./linkedin.js";
import { MastodonPublisher } from "./mastodon.js";
import { MetaGraphPublisher } from "./metaGraph.js";
import { RedditPublisher } from "./redditPublisher.js";
import type { PublishPayload, PublishResult, SocialPublisher } from "./types.js";
import { XPublisher } from "./xPublisher.js";
import { YouTubePublisher } from "./youtube.js";

export * from "./types.js";

export const activePublishers: SocialPublisher[] = [
  new DevToPublisher(),
  new LinkedInPublisher(),
  new XPublisher(),
  new RedditPublisher(),
  new BlueskyPublisher(),
  new MastodonPublisher(),
  new YouTubePublisher(),
  new MetaGraphPublisher("instagram"),
  new MetaGraphPublisher("facebook"),
  new MetaGraphPublisher("threads"),
];

/**
 * Runs all configured social platform publishers for a given payload and returns detailed results.
 */
export async function publishToAllPlatforms(payload: PublishPayload): Promise<PublishResult[]> {
  console.log(`[publisher:orchestrator] Publishing content across ${activePublishers.length} registered platforms...`);
  const results: PublishResult[] = [];

  for (const pub of activePublishers) {
    try {
      const res = await pub.publish(payload);
      results.push(res);
    } catch (err: any) {
      results.push({
        id: "",
        platform: pub.platform,
        success: false,
        error: err.message,
      });
    }
  }

  return results;
}
