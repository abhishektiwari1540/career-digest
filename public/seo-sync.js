/**
 * Dynamic Universal SEO Synchronization Client Script
 * Embed this single script into ANY website to dynamically synchronize and inject
 * Meta Titles, Meta Descriptions, Keywords, OpenGraph, Canonical & Schema.org JSON-LD structured data.
 *
 * Example Usage:
 * <script src="https://career-digest.vercel.app/seo-sync.js" data-site-id="YOUR_SITE_ID" async></script>
 */
(function () {
  const currentScript = document.currentScript || 
    document.querySelector('script[data-site-id]') || 
    document.querySelector('script[src*="seo-sync.js"]');

  const siteId = currentScript ? (currentScript.getAttribute("data-site-id") || "") : "";
  const customApiUrl = currentScript ? (currentScript.getAttribute("data-api-url") || "") : "";
  const baseApi = (customApiUrl || "https://career-digest.vercel.app").replace(/\/$/, "");

  const API_ENDPOINT = siteId ? `${baseApi}/api/seo/embed/${siteId}` : `${baseApi}/api/seo/sync`;

  async function applySeoSync() {
    try {
      const response = await fetch(API_ENDPOINT, { mode: "cors" });
      if (!response.ok) return;
      const data = await response.json();
      if (!data.success || !data.pages) return;

      const currentPath = window.location.pathname.toLowerCase().replace(/\/$/, "") || "/";
      const currentHash = window.location.hash.toLowerCase();

      let targetRoute = "/";
      if (currentPath === "/about" || currentPath.includes("about")) {
        targetRoute = "/about";
      } else if (currentHash === "#contact" || currentPath === "/contact" || currentPath.includes("contact")) {
        targetRoute = "/contact";
        if (!data.pages[targetRoute] && data.pages["/#contact"]) {
          targetRoute = "/#contact";
        }
      } else if (data.pages[currentPath]) {
        targetRoute = currentPath;
      }

      const seo = data.pages[targetRoute] || data.pages["/"] || Object.values(data.pages)[0];
      if (!seo) return;

      // 1. Update Title
      if (seo.meta_title) {
        document.title = seo.meta_title;
      }

      // 2. Update Meta Description
      if (seo.meta_description) {
        setOrUpdateMeta("name", "description", seo.meta_description);
      }

      // 3. Update Meta Keywords
      if (seo.meta_keywords) {
        setOrUpdateMeta("name", "keywords", seo.meta_keywords);
      }

      // 4. Update OpenGraph Tags
      setOrUpdateMeta("property", "og:title", seo.og_title || seo.meta_title);
      setOrUpdateMeta("property", "og:description", seo.og_description || seo.meta_description);
      if (seo.og_image) setOrUpdateMeta("property", "og:image", seo.og_image);
      setOrUpdateMeta("property", "og:url", seo.canonical_url || window.location.href);

      // 5. Update Twitter Cards
      setOrUpdateMeta("name", "twitter:card", "summary_large_image");
      setOrUpdateMeta("name", "twitter:title", seo.og_title || seo.meta_title);
      setOrUpdateMeta("name", "twitter:description", seo.og_description || seo.meta_description);
      if (seo.og_image) setOrUpdateMeta("name", "twitter:image", seo.og_image);

      // 6. Update Canonical URL
      if (seo.canonical_url) {
        let canonicalEl = document.querySelector('link[rel="canonical"]');
        if (!canonicalEl) {
          canonicalEl = document.createElement("link");
          canonicalEl.setAttribute("rel", "canonical");
          document.head.appendChild(canonicalEl);
        }
        canonicalEl.setAttribute("href", seo.canonical_url);
      }

      // 7. Inject Structured Data (Schema.org JSON-LD)
      if (seo.structured_jsonld) {
        let jsonLdEl = document.getElementById("career-digest-jsonld");
        if (!jsonLdEl) {
          jsonLdEl = document.createElement("script");
          jsonLdEl.id = "career-digest-jsonld";
          jsonLdEl.type = "application/ld+json";
          document.head.appendChild(jsonLdEl);
        }
        jsonLdEl.textContent = JSON.stringify(seo.structured_jsonld);
      }

      console.log(`[Career-Digest SEO Sync] Injected optimized SEO metadata for route "${targetRoute}" (Site ID: ${siteId || "default"})`);
    } catch (err) {
      console.warn("[Career-Digest SEO Sync] Notice:", err);
    }
  }

  function setOrUpdateMeta(attrName, attrValue, contentValue) {
    if (!contentValue) return;
    let metaEl = document.querySelector(`meta[${attrName}="${attrValue}"]`);
    if (!metaEl) {
      metaEl = document.createElement("meta");
      metaEl.setAttribute(attrName, attrValue);
      document.head.appendChild(metaEl);
    }
    metaEl.setAttribute("content", contentValue);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applySeoSync);
  } else {
    applySeoSync();
  }
})();
