import type { PublishPayload, PublishResult, SocialPublisher } from "./types.js";

export class BlueskyPublisher implements SocialPublisher {
  platform = "bluesky";

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const handle = process.env.BLUESKY_HANDLE || "";
    const password = process.env.BLUESKY_APP_PASSWORD || "";

    if (!handle || !password) {
      console.log("[publisher:bluesky] BLUESKY_HANDLE/APP_PASSWORD not set. Skipping live AT Protocol post.");
      return {
        id: `bsky_sim_${Date.now()}`,
        platform: this.platform,
        success: true,
        url: `https://bsky.app/profile/demo.bsky.social`,
      };
    }

    try {
      // Authenticate via AT Protocol REST API endpoints
      const authRes = await fetch("https://bsky.social/xrpc/com.atproto.server.createSession", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: handle, password }),
      });

      if (!authRes.ok) {
        throw new Error(`Session creation failed: ${authRes.status} ${await authRes.text()}`);
      }

      const session = await authRes.json();
      const postText = `${payload.text}\n\n${(payload.hashtags || []).join(" ")}`.trim();

      const postRes = await fetch("https://bsky.social/xrpc/com.atproto.repo.createRecord", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.accessJwt}`,
        },
        body: JSON.stringify({
          repo: session.did,
          collection: "app.bsky.feed.post",
          record: {
            $type: "app.bsky.feed.post",
            text: postText,
            createdAt: new Date().toISOString(),
          },
        }),
      });

      if (!postRes.ok) {
        throw new Error(`Post creation failed: ${postRes.status} ${await postRes.text()}`);
      }

      const postData = await postRes.json();
      const rkey = postData.uri.split("/").pop();
      const postUrl = `https://bsky.app/profile/${handle}/post/${rkey}`;

      console.log(`[publisher:bluesky] Successfully posted to Bluesky: ${postUrl}`);
      return {
        id: postData.uri,
        url: postUrl,
        platform: this.platform,
        success: true,
      };
    } catch (err: any) {
      console.warn(`[publisher:bluesky] Error posting to Bluesky: ${err.message}`);
      return {
        id: "",
        platform: this.platform,
        success: false,
        error: err.message,
      };
    }
  }
}
