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

      let orgId = process.env.DEVTO_ORGANIZATION_ID ? Number(process.env.DEVTO_ORGANIZATION_ID) : undefined;

      // Auto-detect JaipurDevs organization if not explicitly provided
      if (!orgId) {
        try {
          const orgsRes = await fetch("https://dev.to/api/organizations", {
            headers: { "api-key": apiKey }
          });
          if (orgsRes.ok) {
            const orgs = await orgsRes.json();
            const jaipurOrg = orgs.find((o: any) =>
              (o.name || "").toLowerCase().includes("jaipur") || (o.slug || "").toLowerCase().includes("jaipur")
            );
            if (jaipurOrg) {
              orgId = jaipurOrg.id;
              console.log(`[publisher:devto] Auto-detected Dev.to Organization '${jaipurOrg.name}' (ID: ${orgId})`);
            }
          }
        } catch {
          // ignore auto-detect error
        }
      }

      const articlePayload = {
        article: {
          title: payload.title || payload.text.split("\n")[0].slice(0, 80) || "Daily Technical Digest & Insights",
          published: true,
          body_markdown: payload.text,
          tags: tags.length > 0 ? tags : ["webdev"],
          ...(orgId ? { organization_id: orgId } : {}),
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
