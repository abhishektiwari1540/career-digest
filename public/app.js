document.addEventListener("DOMContentLoaded", () => {
  // Navigation Tabs
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      btn.classList.add("active");
      const activeContent = document.getElementById(targetTab);
      if (activeContent) activeContent.classList.add("active");

      if (targetTab === "tab-explorer") {
        loadMemories();
      }
    });
  });

  // Load Initial Dashboard Stats
  fetchStats();

  // Dropzone & File Input Handling
  const dropzone = document.getElementById("dropzone");
  const browseBtn = document.getElementById("browse-btn");
  const fileInput = document.getElementById("file-input");
  const selectedFileName = document.getElementById("selected-file-name");
  const submitUploadBtn = document.getElementById("submit-upload-btn");
  const uploadForm = document.getElementById("upload-form");
  const categorySelect = document.getElementById("category-select");

  let selectedFile = null;

  if (browseBtn && fileInput) {
    browseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      fileInput.click();
    });
  }

  if (dropzone && fileInput) {
    dropzone.addEventListener("click", () => {
      fileInput.click();
    });

    fileInput.addEventListener("change", () => {
      if (fileInput.files && fileInput.files[0]) {
        handleFileSelected(fileInput.files[0]);
      }
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add("dragover");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove("dragover");
      });
    });

    dropzone.addEventListener("drop", (e) => {
      const dt = e.dataTransfer;
      if (dt && dt.files && dt.files[0]) {
        handleFileSelected(dt.files[0]);
      }
    });
  }

  function handleFileSelected(file) {
    selectedFile = file;
    selectedFileName.textContent = `📄 Selected: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    if (submitUploadBtn) submitUploadBtn.disabled = false;
  }

  // Handle Upload Form Submit
  if (uploadForm) {
    uploadForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!selectedFile) return;

      const category = categorySelect.value;
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("category", category);

      const progressContainer = document.getElementById("upload-progress");
      const progressFill = document.getElementById("progress-fill");
      const progressStatusText = document.getElementById("progress-status-text");
      const progressPercent = document.getElementById("progress-percent");
      const uploadResult = document.getElementById("upload-result");

      progressContainer.style.display = "block";
      uploadResult.style.display = "none";
      if (submitUploadBtn) submitUploadBtn.disabled = true;

      progressFill.style.width = "30%";
      progressPercent.textContent = "30%";
      progressStatusText.textContent = `Reading & parsing "${selectedFile.name}"...`;

      try {
        progressFill.style.width = "65%";
        progressPercent.textContent = "65%";
        progressStatusText.textContent = "Saving into Supabase & generating gemini-embedding-2 vectors...";

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data = await response.json();

        progressFill.style.width = "100%";
        progressPercent.textContent = "100%";

        if (data.success) {
          progressStatusText.textContent = "Ingestion Complete!";
          showResult(data);
          fetchStats();
        } else {
          alert(`Upload error: ${data.error}`);
        }
      } catch (err) {
        alert(`Upload failed: ${err.message}`);
      } finally {
        if (submitUploadBtn) submitUploadBtn.disabled = false;
      }
    });
  }

  function showResult(data) {
    const uploadResult = document.getElementById("upload-result");
    const resultTitle = document.getElementById("result-title");
    const resultMessage = document.getElementById("result-message");
    const resultDetails = document.getElementById("result-details");

    resultTitle.textContent = "🎉 Ingestion Successful!";
    resultMessage.textContent = data.message;
    resultDetails.innerHTML = `
      <strong>File:</strong> ${data.details.fileName}<br>
      <strong>Category:</strong> ${data.details.category}<br>
      <strong>Parsed Items:</strong> ${data.details.parsedCount}<br>
      <strong>Multimodal Vectors Created:</strong> ${data.details.vectorsGeneratedCount}<br>
      ${data.details.breakdown ? `<strong>Archive Summary:</strong> <span style="color:var(--accent-cyan); font-weight:bold;">${data.details.breakdown}</span><br>` : ''}
      ${data.details.voiceProfileExtracted ? `<strong>AI Voice Profile:</strong> <span style="color:#22c55e; font-weight:bold;">✅ Author Voice Fingerprint Updated</span><br>` : ''}
      <strong>Preview Snippet:</strong> <em>"${escapeHtml(data.details.samplePreview)}"</em>
    `;

    uploadResult.style.display = "block";
  }

  // Search Second Brain Explorer
  const searchBtn = document.getElementById("search-btn");
  const searchInput = document.getElementById("search-input");
  const searchResultsArea = document.getElementById("search-results-area");
  const searchResultsList = document.getElementById("search-results-list");

  if (searchBtn && searchInput) {
    searchBtn.addEventListener("click", performSearch);
    searchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") performSearch();
    });
  }

  async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    searchResultsList.innerHTML = "<p class='placeholder-text'>Searching gemini-embedding-2 vector space...</p>";
    searchResultsArea.style.display = "block";

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });

      const data = await res.json();
      if (data.success) {
        renderSearchResults(data.results);
      }
    } catch (err) {
      searchResultsList.innerHTML = `<p class='placeholder-text'>Search error: ${err.message}</p>`;
    }
  }

  function renderSearchResults(results) {
    const memories = results.memoryMatches || [];
    const linkedin = results.linkedInMatches || [];

    if (memories.length === 0 && linkedin.length === 0) {
      searchResultsList.innerHTML = "<p class='placeholder-text'>No vector search matches found for this query.</p>";
      return;
    }

    let html = "";
    memories.forEach((m) => {
      const formatted = formatMemoryItem(m);
      html += `
        <div class="memory-card">
          <div class="memory-head">
            <span class="memory-badge ${formatted.badgeClass}">${formatted.categoryTag}</span>
            <span class="vector-tag">Vector Match (${results.embeddingVectorDimensions}d)</span>
          </div>
          <h4 class="memory-title">${escapeHtml(formatted.title)}</h4>
          <div class="memory-body">${escapeHtml(formatted.bodyText)}</div>
        </div>
      `;
    });

    linkedin.forEach((l) => {
      html += `
        <div class="memory-card">
          <div class="memory-head">
            <span class="memory-badge badge-linkedin">📢 LinkedIn Post</span>
            <span>${l.posted_at ? new Date(l.posted_at).toLocaleDateString() : "Recent"}</span>
          </div>
          <h4 class="memory-title">Imported Post Content</h4>
          <div class="memory-body">${escapeHtml(l.content)}</div>
        </div>
      `;
    });

    searchResultsList.innerHTML = html;
  }

  // Filter Chips in Explorer
  let activeFilter = "all";
  const filterChipsContainer = document.getElementById("explorer-filter-chips");
  if (filterChipsContainer) {
    filterChipsContainer.querySelectorAll(".chip-btn").forEach((chip) => {
      chip.addEventListener("click", () => {
        filterChipsContainer.querySelectorAll(".chip-btn").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        activeFilter = chip.getAttribute("data-filter") || "all";
        loadMemories(activeFilter);
      });
    });
  }

  // Load Ingested Knowledge Memories
  let cachedMemories = [];
  let cachedLinkedIn = [];

  async function loadMemories(filter = "all") {
    const memoriesContainer = document.getElementById("memories-container");
    if (!memoriesContainer) return;

    if (cachedMemories.length === 0 && cachedLinkedIn.length === 0) {
      memoriesContainer.innerHTML = "<p class='placeholder-text'>Loading ingested brain items...</p>";
      try {
        const res = await fetch("/api/memories");
        const data = await res.json();
        if (data.success) {
          cachedMemories = data.memories || [];
          cachedLinkedIn = data.linkedInPosts || [];
        }
      } catch (err) {
        memoriesContainer.innerHTML = `<p class='placeholder-text'>Failed to load memories: ${err.message}</p>`;
        return;
      }
    }

    if (cachedMemories.length === 0 && cachedLinkedIn.length === 0) {
      memoriesContainer.innerHTML = "<p class='placeholder-text'>No memories ingested yet. Use the 'Ingest Data Files' tab to upload your files!</p>";
      return;
    }

    let filteredM = cachedMemories;
    let showLinkedIn = filter === "all" || filter === "linkedin";

    if (filter === "career") {
      filteredM = cachedMemories.filter((m) =>
        m.category?.includes("career") || m.conceptKey?.includes("position") || m.memoryText?.includes("Career Background")
      );
    } else if (filter === "resume") {
      filteredM = cachedMemories.filter((m) =>
        m.category?.includes("resume") || m.conceptKey?.includes("pdf_") || m.conceptKey?.includes("resume") || m.conceptKey?.includes("skills")
      );
    } else if (filter === "notes") {
      filteredM = cachedMemories.filter((m) =>
        m.category?.includes("research") || m.category?.includes("notes") || m.conceptKey?.includes("note_")
      );
    } else if (filter === "linkedin") {
      filteredM = cachedMemories.filter((m) =>
        m.category?.includes("linkedin") || m.category?.includes("PastPost") || m.conceptKey?.includes("linkedin") || m.conceptKey?.includes("topic_")
      );
    }

    let html = "";
    filteredM.forEach((m) => {
      const formatted = formatMemoryItem(m);
      html += `
        <div class="memory-card">
          <div class="memory-head">
            <span class="memory-badge ${formatted.badgeClass}">${formatted.categoryTag}</span>
            <span class="status-pill free">Ingested & Vectorized</span>
          </div>
          <h4 class="memory-title">${escapeHtml(formatted.title)}</h4>
          <div class="memory-body">${escapeHtml(formatted.bodyText)}</div>
        </div>
      `;
    });

    if (showLinkedIn && cachedLinkedIn.length > 0) {
      cachedLinkedIn.forEach((l) => {
        html += `
          <div class="memory-card">
            <div class="memory-head">
              <span class="memory-badge badge-linkedin">📢 LinkedIn Post</span>
              <span>${l.postedAt ? new Date(l.postedAt).toLocaleDateString() : "Imported"}</span>
            </div>
            <h4 class="memory-title">Past Post Highlight</h4>
            <div class="memory-body">${escapeHtml(l.content)}</div>
            ${l.url ? `<div style="margin-top:0.5rem;"><a href="${l.url}" target="_blank" style="color:var(--accent-cyan); font-size:0.82rem;">🔗 View Original Post</a></div>` : ''}
          </div>
        `;
      });
    }

    if (!html) {
      memoriesContainer.innerHTML = `
        <div style="text-align:center; padding:2rem; background:rgba(255,255,255,0.02); border-radius:12px; border:1px dashed var(--card-border);">
          <p class="placeholder-text" style="color:var(--accent-cyan); font-weight:600;">No items found under '${filter.toUpperCase()}' category filter.</p>
          <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.4rem;">Upload your LinkedIn archive ZIP or Shares.csv in the <strong>Ingest Data Files</strong> tab to populate this category!</p>
        </div>
      `;
    } else {
      memoriesContainer.innerHTML = html;
    }
  }

  // Format memory titles & category badges cleanly
  function formatMemoryItem(m) {
    const text = m.memoryText || m.memory_text || "";
    const key = m.conceptKey || m.concept_key || "";
    const cat = (m.category || "").toLowerCase();

    let title = "";
    let bodyText = text;

    // Check bracket pattern e.g. [Career Background - Web Developer at WEBGENSIS (Jul 2022 to Jan 2024)]:
    const bracketMatch = text.match(/^\[([^\]]+)\]:\s*([\s\S]*)$/);
    if (bracketMatch) {
      title = bracketMatch[1].trim();
      bodyText = bracketMatch[2].trim() || text;
    } else {
      if (key.includes("position")) title = "Work Experience Record";
      else if (key.includes("article")) title = "LinkedIn Article";
      else if (key.includes("skill")) title = "Skill & Expertise";
      else if (key.includes("comment")) title = "Community Comment";
      else if (key.includes("pdf_")) title = "Resume / CV Document";
      else if (key.includes("chat_")) title = "Google Chat Message";
      else if (key.includes("voice_profile")) title = "Author Voice Fingerprint";
      else title = key.replace(/_/g, " ").replace(/\d{10,}/g, "").trim() || "Ingested Note";
    }

    let categoryTag = "🧠 Knowledge Item";
    let badgeClass = "badge-general";

    if (cat.includes("career") || key.includes("position") || title.includes("Career")) {
      categoryTag = "💼 Career Experience";
      badgeClass = "badge-career";
    } else if (cat.includes("linkedin") || key.includes("share") || key.includes("article")) {
      categoryTag = "📢 LinkedIn History";
      badgeClass = "badge-linkedin";
    } else if (cat.includes("resume") || cat.includes("pdf") || key.includes("pdf_")) {
      categoryTag = "📄 Resume / CV";
      badgeClass = "badge-resume";
    } else if (cat.includes("chat") || key.includes("chat_")) {
      categoryTag = "💬 Google Chat";
      badgeClass = "badge-chat";
    } else if (cat.includes("research") || cat.includes("note") || key.includes("note_")) {
      categoryTag = "🧪 Technical Notes";
      badgeClass = "badge-research";
    } else if (cat.includes("voice")) {
      categoryTag = "🎙️ AI Voice Profile";
      badgeClass = "badge-voice";
    }

    return { title, bodyText, categoryTag, badgeClass };
  }

  // Generate Content Pack Handler
  const generatePackBtn = document.getElementById("generate-pack-btn");
  const contentPackOutput = document.getElementById("content-pack-output");

  if (generatePackBtn && contentPackOutput) {
    generatePackBtn.addEventListener("click", async () => {
      contentPackOutput.innerHTML = `
        <div class="loading-box" style="text-align:center; padding:3rem; background:rgba(11,15,23,0.6); border-radius:12px; border:1px solid var(--card-border);">
          <div class="spinner" style="font-size:2.5rem; margin-bottom:1rem;">⚡</div>
          <h3 style="font-family:'Outfit',sans-serif; color:#fff;">Analyzing Second Brain & Drafting Social Posts...</h3>
          <p style="margin-top:0.5rem; color:var(--accent-cyan); font-size:0.9rem;">Model: Gemini 3.6 Flash | Target Cadence: Every 2 Days</p>
        </div>
      `;

      try {
        const res = await fetch("/api/generate-pack", { method: "POST" });
        const data = await res.json();

        if (data.success && data.contentPack) {
          const pack = data.contentPack;
          const items = pack.items && pack.items.length > 0 ? pack.items : [
            { platform: "linkedin", postText: pack.linkedinPost, hashtags: pack.hashtags },
            { platform: "x", postText: pack.twitterPost, hashtags: pack.hashtags },
            { platform: "devto", postText: pack.blogOutline, hashtags: pack.hashtags },
            { platform: "reddit", postText: pack.redditPost, hashtags: [] },
          ];

          let html = `
            <div class="pack-header-card" style="background:linear-gradient(135deg, rgba(99,102,241,0.12), rgba(6,182,212,0.12)); border:1px solid rgba(99,102,241,0.3); padding:1.5rem; border-radius:16px; margin-bottom:1.5rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                <div>
                  <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; color:var(--accent-cyan); font-weight:700;">🎯 2-Day Content Pack Focus</span>
                  <h3 style="font-size:1.5rem; font-family:'Outfit',sans-serif; margin-top:0.25rem; color:#fff;">${escapeHtml(pack.topic)}</h3>
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                  <span class="status-badge live" style="padding:0.4rem 0.8rem; font-size:0.8rem;">🤖 Gemini 3.6 Flash</span>
                  <span class="status-badge active" style="padding:0.4rem 0.8rem; font-size:0.8rem;">🎙️ Author Voice Matched</span>
                </div>
              </div>
              ${pack.imagePrompt ? `<div style="margin-top:1rem; font-size:0.88rem; color:var(--text-muted); background:rgba(0,0,0,0.3); padding:0.75rem 1rem; border-radius:8px;">🎨 <strong>Artwork Prompt:</strong> <em>"${escapeHtml(pack.imagePrompt)}"</em></div>` : ''}
            </div>

            <div class="platform-posts-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:1.25rem;">
          `;

          const platformMeta = {
            linkedin: { name: "LinkedIn Profile", icon: "💼", badgeBg: "#0a66c2" },
            x: { name: "X (Twitter)", icon: "🐦", badgeBg: "#1da1f2" },
            devto: { name: "Dev.to / Technical Blog", icon: "✍️", badgeBg: "#0a0a0a" },
            reddit: { name: "Reddit (r/developersIndia)", icon: "👾", badgeBg: "#ff4500" },
            instagram: { name: "Instagram Caption", icon: "📸", badgeBg: "#e1306c" },
          };

          items.forEach((item) => {
            const meta = platformMeta[item.platform] || { name: item.platform, icon: "📢", badgeBg: "#4f46e5" };
            const tagsStr = (item.hashtags || []).join(" ");
            const fullText = item.postText + (tagsStr ? `\n\n${tagsStr}` : "");

            html += `
              <div class="memory-card" style="display:flex; flex-direction:column; justify-content:space-between; border-left:4px solid ${meta.badgeBg};">
                <div>
                  <div class="memory-head" style="margin-bottom:0.75rem;">
                    <span style="font-weight:700; font-size:1.05rem; display:flex; align-items:center; gap:0.4rem;">
                      <span>${meta.icon}</span> ${meta.name}
                    </span>
                    <span class="status-pill free" style="font-size:0.72rem;">2-DAY CADENCE</span>
                  </div>

                  <div class="memory-body" style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; font-family:monospace; font-size:0.88rem; max-height:260px; overflow-y:auto; white-space:pre-wrap; border:1px solid rgba(255,255,255,0.05);">${escapeHtml(fullText)}</div>

                  ${item.imageUrl ? `
                    <div style="margin-top:0.75rem; text-align:center;">
                      <img src="${item.imageUrl}" alt="Artwork Preview" style="max-width:100%; max-height:160px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); object-fit:cover;">
                    </div>
                  ` : ''}
                </div>

                <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
                  <button class="btn secondary-btn copy-btn" data-text="${escapeAttr(fullText)}" style="flex:1; font-size:0.85rem; padding:0.55rem;">
                    📋 Copy Post
                  </button>
                  <button class="btn primary-btn publish-btn" data-platform="${item.platform}" data-text="${escapeAttr(fullText)}" data-topic="${escapeAttr(pack.topic)}" data-image="${escapeAttr(item.imageUrl || '')}" style="flex:1; font-size:0.85rem; padding:0.55rem;">
                    🚀 Publish Now
                  </button>
                </div>
              </div>
            `;
          });

          html += `</div>`;
          contentPackOutput.innerHTML = html;
          attachPostActionListeners();
        }
      } catch (err) {
        contentPackOutput.innerHTML = `<p class='placeholder-text'>Generation error: ${err.message}</p>`;
      }
    });
  }

  function attachPostActionListeners() {
    document.querySelectorAll(".copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const text = btn.getAttribute("data-text");
        navigator.clipboard.writeText(text);
        const originalText = btn.innerHTML;
        btn.innerHTML = "✅ Copied!";
        setTimeout(() => (btn.innerHTML = originalText), 2000);
      });
    });

    document.querySelectorAll(".publish-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const platform = btn.getAttribute("data-platform");
        const postText = btn.getAttribute("data-text");
        const topic = btn.getAttribute("data-topic");
        const imageUrl = btn.getAttribute("data-image");

        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = "⏳ Publishing...";

        try {
          const res = await fetch("/api/publish-now", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ platform, postText, topic, imageUrl }),
          });
          const data = await res.json();
          if (data.success) {
            btn.innerHTML = "🎉 Published!";
            alert(`Result for ${platform.toUpperCase()}:\n${data.result.message || data.result.error || 'Published successfully!'}`);
          } else {
            alert(`Error publishing to ${platform}: ${data.error}`);
            btn.innerHTML = originalText;
          }
        } catch (err) {
          alert(`Publish failed: ${err.message}`);
          btn.innerHTML = originalText;
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function escapeAttr(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // Dashboard Stats & Platform Status Cards Rendering
  async function fetchStats() {
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();
      if (data.success) {
        document.getElementById("stat-linkedin-posts").textContent = data.stats.linkedInPostsCount;
        document.getElementById("stat-brain-memories").textContent = data.stats.secondBrainItemsCount;
        document.getElementById("stat-multimodal-vectors").textContent = data.stats.multimodalVectorsCount;

        const pubStatus = data.stats.publishersStatus || [];
        const platformsGrid = document.getElementById("platforms-grid");

        if (platformsGrid && pubStatus.length > 0) {
          const platformIcons = {
            devto: "✍️",
            linkedin: "💼",
            bluesky: "🦋",
            mastodon: "🐘",
            youtube: "📺",
            resend: "📧",
            gemini: "🧠",
            groq: "⚡",
          };

          const platformDescs = {
            devto: "Direct API-key POST to `dev.to/api/articles`. Zero review friction.",
            linkedin: "Official Share API v2 (`w_member_social`). Personal profile auto-shares.",
            bluesky: "AT Protocol app-password authentication.",
            mastodon: "Native REST API access token adapter.",
            youtube: "videos.list Category 28 Science & Tech (~3 units/day across IN, US, GB).",
            resend: "Transactional email digest delivery.",
            gemini: "Google AI Studio primary reasoning & content engine.",
            groq: "High-speed Groq Llama 3.3 LLM fallback tier.",
          };

          let html = "";
          pubStatus.forEach((p) => {
            const icon = platformIcons[p.platform] || "🌐";
            const desc = platformDescs[p.platform] || "Platform integration adapter.";
            const isConfigured = p.configured;

            html += `
              <div class="platform-card ${isConfigured ? 'active-plat' : ''}">
                <div class="platform-head">
                  <span class="platform-name">
                    <span>${icon}</span> ${p.name || p.platform}
                  </span>
                  <span class="status-pill ${isConfigured ? 'free' : 'optimized'}">
                    ${isConfigured ? 'READY / ACTIVE' : 'DRY-RUN / OPTIMIZED'}
                  </span>
                </div>
                <p>${desc}</p>
                <div class="platform-foot">
                  <span>${p.statusText}</span>
                  ${p.platform === 'linkedin' && !isConfigured ? `
                    <div style="margin-top:0.75rem;">
                      <a href="/api/linkedin/login" target="_blank" class="btn primary-btn" style="display:inline-block; font-size:0.78rem; padding:0.4rem 0.8rem; text-decoration:none;">🔗 Connect LinkedIn OAuth</a>
                    </div>
                  ` : ''}
                </div>
              </div>
            `;
          });

          platformsGrid.innerHTML = html;
        }
      }
    } catch (err) {
      console.warn("Stats fetch failed:", err);
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
});
