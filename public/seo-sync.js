/**
 * Auto-Updating SEO Synchronization Client Script for https://www.abhishektiwari.online/
 * Automatically fetches synchronized SEO metadata from https://career-digest.vercel.app/api/seo/sync
 * and updates document title, meta description, keywords, OpenGraph, Canonical & JSON-LD structured data.
 */
(function () {
  const API_ENDPOINT = "https://career-digest.vercel.app/api/seo/sync";

  async function applySeoSync() {
    try {
      const response = await fetch(API_ENDPOINT);
      if (!response.ok) return;
      const data = await response.json();
      if (!data.success || !data.pages) return;

      const currentPath = window.location.pathname.toLowerCase().replace(/\/$/, "") || "/";
      const currentHash = window.location.hash.toLowerCase();

      let targetRoute = "/";
      if (currentPath === "/about" || currentPath.includes("about")) {
        targetRoute = "/about";
      } else if (currentHash === "#contact" || currentPath === "/contact" || currentPath.includes("contact")) {
        targetRoute = "/#contact";
      }

      const seo = data.pages[targetRoute] || data.pages["/"];
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
        let jsonLdEl = document.getElementById("seo-sync-jsonld");
        if (!jsonLdEl) {
          jsonLdEl = document.createElement("script");
          jsonLdEl.id = "seo-sync-jsonld";
          jsonLdEl.type = "application/ld+json";
          document.head.appendChild(jsonLdEl);
        }
        jsonLdEl.textContent = JSON.stringify(seo.structured_jsonld);
      }

      console.log(`[SEO Sync] Applied updated SEO metadata for route "${targetRoute}" on https://www.abhishektiwari.online/`);
    } catch (err) {
      console.warn("[SEO Sync] Failed to fetch or apply SEO metadata:", err);
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
