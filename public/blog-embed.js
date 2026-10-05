/**
 * Daily Champion Blog Auto-Embed Script for https://www.abhishektiwari.online/
 * Automatically fetches today's #1 Champion Blog from https://career-digest.vercel.app/api/blogs/champion
 * Injects a live "Blog" tab, floating widget, and structured BlogPosting JSON-LD schema.
 */
(function () {
  const API_ENDPOINT = "https://career-digest.vercel.app/api/blogs/champion";

  async function initBlogEmbed() {
    try {
      const res = await fetch(API_ENDPOINT);
      if (!res.ok) return;
      const data = await res.json();
      if (!data.success || !data.champion) return;

      const champ = data.champion;

      // 1. Inject JSON-LD BlogPosting Schema for SEO
      if (champ.jsonLdSchema || champ.json_ld_schema) {
        let schemaEl = document.getElementById("champion-blog-schema");
        if (!schemaEl) {
          schemaEl = document.createElement("script");
          schemaEl.id = "champion-blog-schema";
          schemaEl.type = "application/ld+json";
          document.head.appendChild(schemaEl);
        }
        schemaEl.textContent = JSON.stringify(champ.jsonLdSchema || champ.json_ld_schema);
      }

      // 2. Check if host page has a container with id "daily-champion-blog"
      const targetContainer = document.getElementById("daily-champion-blog") || document.querySelector("[data-champion-blog]");

      if (targetContainer) {
        // Render inside page section
        targetContainer.innerHTML = createBlogHtml(champ);
      } else {
        // Inject floating "📰 Daily Blog" trigger badge & modal
        injectFloatingBlogBadgeAndModal(champ);
      }

      console.log(`[Blog Sync] Successfully synchronized Champion Blog: "${champ.title}" onto https://www.abhishektiwari.online/`);
    } catch (err) {
      console.warn("[Blog Sync] Failed to load Champion Blog:", err);
    }
  }

  function createBlogHtml(champ) {
    const coverUrl = champ.cover_url || champ.coverUrl || "";
    const title = escapeHtml(champ.title);
    const keyword = escapeHtml(champ.target_keyword || champ.targetKeyword || "");
    const tldr = escapeHtml(champ.tldr_summary || champ.tldrSummary || champ.meta_description || "");
    const content = escapeHtml(champ.content_markdown || champ.contentMarkdown || "");
    const tags = (champ.hashtags || []).map(t => `<span style="background:rgba(99,102,241,0.15); color:#818cf8; padding:3px 8px; border-radius:4px; font-size:12px; font-family:sans-serif;">${escapeHtml(t)}</span>`).join(" ");

    return `
      <article class="champion-blog-article" style="background:#0b0f19; border:1px solid rgba(255,255,255,0.1); border-radius:14px; padding:24px; color:#e2e8f0; font-family:'Inter',system-ui,sans-serif;">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:16px; margin-bottom:16px;">
          <div style="flex:1;">
            <span style="font-size:11px; font-weight:700; color:#10b981; text-transform:uppercase; letter-spacing:1px; background:rgba(16,185,129,0.1); padding:4px 10px; border-radius:12px;">🏆 Daily Champion Tech Blog</span>
            <h1 style="font-size:24px; font-weight:800; color:#ffffff; margin:10px 0 6px 0; line-height:1.3;">${title}</h1>
            <p style="font-size:13px; color:#94a3b8; margin:0;">Focus: <strong style="color:#38bdf8;">${keyword}</strong> • Ranked #1 Candidate</p>
          </div>
          ${coverUrl ? `<img src="${coverUrl}" alt="${title}" style="max-width:260px; border-radius:10px; border:1px solid rgba(255,255,255,0.1); box-shadow:0 4px 12px rgba(0,0,0,0.4);">` : ''}
        </div>

        <div style="background:rgba(16,185,129,0.08); border-left:4px solid #10b981; padding:12px 16px; border-radius:6px; margin-bottom:20px;">
          <strong style="color:#10b981; font-size:13px; text-transform:uppercase; letter-spacing:0.5px;">⚡ Key Takeaway / Direct Answer (TL;DR):</strong>
          <p style="margin:4px 0 0 0; font-size:14px; color:#f8fafc; line-height:1.5;">${tldr}</p>
        </div>

        <div style="margin-bottom:20px; display:flex; gap:8px; flex-wrap:wrap;">
          ${tags}
        </div>

        <div style="background:#040711; border:1px solid rgba(255,255,255,0.08); padding:20px; border-radius:10px; font-size:14px; line-height:1.7; white-space:pre-wrap; max-height:600px; overflow-y:auto; color:#cbd5e1;">
${content}
        </div>
      </article>
    `;
  }

  function injectFloatingBlogBadgeAndModal(champ) {
    // 1. Floating Badge Trigger
    const badge = document.createElement("div");
    badge.id = "daily-blog-floating-badge";
    badge.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      background: linear-gradient(135deg, #6366f1, #10b981);
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 30px;
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(99, 102, 241, 0.4);
      display: flex;
      align-items: center;
      gap: 8px;
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    `;
    badge.innerHTML = `<span>🏆</span> <span>Daily Tech Blog</span>`;
    badge.onmouseover = () => badge.style.transform = "scale(1.05)";
    badge.onmouseout = () => badge.style.transform = "scale(1)";

    // 2. Modal Overlay
    const overlay = document.createElement("div");
    overlay.id = "daily-blog-modal-overlay";
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 100000;
      background: rgba(4, 7, 17, 0.85);
      backdrop-filter: blur(8px);
      display: none;
      justify-content: center;
      align-items: center;
      padding: 20px;
    `;

    const modal = document.createElement("div");
    modal.style.cssText = `
      background: #0b0f19;
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 16px;
      width: 100%;
      max-width: 860px;
      max-height: 90vh;
      overflow-y: auto;
      padding: 24px;
      box-shadow: 0 20px 50px rgba(0, 0, 0, 0.6);
      position: relative;
    `;

    const closeBtn = document.createElement("button");
    closeBtn.style.cssText = `
      position: absolute;
      top: 16px; right: 16px;
      background: rgba(255, 255, 255, 0.1);
      border: none;
      color: #ffffff;
      width: 32px; height: 32px;
      border-radius: 50%;
      font-size: 16px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    `;
    closeBtn.innerHTML = "✕";
    closeBtn.onclick = () => overlay.style.display = "none";

    modal.appendChild(closeBtn);
    const contentDiv = document.createElement("div");
    contentDiv.innerHTML = createBlogHtml(champ);
    modal.appendChild(contentDiv);

    overlay.appendChild(modal);
    overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = "none"; };

    badge.onclick = () => overlay.style.display = "flex";

    document.body.appendChild(badge);
    document.body.appendChild(overlay);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBlogEmbed);
  } else {
    initBlogEmbed();
  }
})();
