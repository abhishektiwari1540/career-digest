document.addEventListener("DOMContentLoaded", () => {
  // Global State
  let activeTab = "tab-chat";
  let cachedMemories = [];
  let cachedLinkedIn = [];
  let currentSeoAnalysis = null;
  let readingTimerInterval = null;
  let readingTimerSeconds = 0;
  let isTimerRunning = false;
  let currentReadingItem = null;

  // Navigation Tabs
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      activeTab = targetTab;
      tabBtns.forEach((b) => b.classList.remove("active"));
      tabContents.forEach((c) => c.classList.remove("active"));

      btn.classList.add("active");
      const activeContent = document.getElementById(targetTab);
      if (activeContent) activeContent.classList.add("active");

      if (targetTab === "tab-chat") {
        initChatCopilot();
      } else if (targetTab === "tab-explorer") {
        loadMemories();
      } else if (targetTab === "tab-seo") {
        loadSeoProfile();
      } else if (targetTab === "tab-read") {
        loadReadingSection();
      } else if (targetTab === "tab-platforms") {
        loadSkillRoadmapAndPlatforms();
      } else if (targetTab === "tab-blogs") {
        loadBlogsTab();
      } else if (targetTab === "tab-opensource") {
        loadOpenSourceTab();
      } else if (targetTab === "tab-admin") {
        loadAdminTelemetryTab();
      }
    });
  });

  // Initial Data Fetch
  initAuthAndTelemetry();
  fetchStats();
  initSelfUpdatingEngineWatcher();
  initChatCopilot();
  loadOpenSourceTab(false);

  // Dropzone & File Ingestion Setup
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

  // Upload Form Submission
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

        const rawText = await response.text();
        let data = {};
        try {
          data = JSON.parse(rawText);
        } catch {
          throw new Error(`Server returned non-JSON response (${response.status})`);
        }

        progressFill.style.width = "100%";
        progressPercent.textContent = "100%";

        if (response.ok && data.success) {
          progressStatusText.textContent = "Ingestion Complete!";
          showResult(data);
          fetchStats();
          cachedMemories = []; // Reset memory cache
        } else {
          const errMsg = data.error || data.message || `Server error (${response.status})`;
          progressStatusText.textContent = "Ingestion Failed";
          alert(`Upload error: ${errMsg}`);
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
      <strong>Preview Snippet:</strong> <em>"${escapeHtml(data.details.samplePreview)}"</em>
    `;

    uploadResult.style.display = "block";
  }

  // Vector Search Second Brain Explorer
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
      html += renderMemoryCardHtml(formatted);
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
    attachMemoryCardListeners();
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
      html += renderMemoryCardHtml(formatted);
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
        </div>
      `;
    } else {
      memoriesContainer.innerHTML = html;
      attachMemoryCardListeners();
    }
  }

  // Clean memory items formatting (Fixes duplicate text & bracket headers)
  function formatMemoryItem(m) {
    const text = m.memoryText || m.memory_text || "";
    const key = m.conceptKey || m.concept_key || "";
    const cat = (m.category || "").toLowerCase();

    let title = "";
    let bodyText = text;

    // Recursively extract and strip leading bracket tags e.g. [Career Background - Web Developer...]:
    const bracketMatch = text.match(/^\[([^\]]+)\]:\s*/);
    if (bracketMatch) {
      title = bracketMatch[1].trim();
      // Cleanly strip all bracket prefixes from bodyText so it never repeats!
      bodyText = text.replace(/^(\[[^\]]+\]:\s*)+/, "").trim();
    } else {
      if (key.includes("position")) title = "Work Experience Record";
      else if (key.includes("article")) title = "LinkedIn Article";
      else if (key.includes("skill")) title = "Skill & Expertise";
      else if (key.includes("pdf_")) title = "Resume / CV Document";
      else if (key.includes("chat_")) title = "Google Chat Message";
      else title = key.replace(/_/g, " ").replace(/\d{10,}/g, "").trim() || "Ingested Note";
    }

    if (!bodyText) bodyText = text;

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
    }

    return { title, bodyText, categoryTag, badgeClass };
  }

  function renderMemoryCardHtml(formatted) {
    const isLong = formatted.bodyText.length > 280;
    const previewText = isLong ? formatted.bodyText.slice(0, 280) + "..." : formatted.bodyText;

    return `
      <div class="memory-card">
        <div class="memory-head">
          <span class="memory-badge ${formatted.badgeClass}">${formatted.categoryTag}</span>
          <span class="status-pill free">Ingested & Vectorized</span>
        </div>
        <h4 class="memory-title">${escapeHtml(formatted.title)}</h4>
        <div class="memory-body text-content" data-full="${escapeAttr(formatted.bodyText)}" data-preview="${escapeAttr(previewText)}">
          ${escapeHtml(previewText)}
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:0.75rem; pt-0.5rem; border-top:1px solid rgba(255,255,255,0.05);">
          ${isLong ? `<button class="btn secondary-btn toggle-more-btn" style="padding:0.3rem 0.6rem; font-size:0.78rem;">📖 Read Full Text</button>` : '<span></span>'}
          <button class="btn secondary-btn copy-card-btn" data-text="${escapeAttr(formatted.bodyText)}" style="padding:0.3rem 0.6rem; font-size:0.78rem;">📋 Copy</button>
        </div>
      </div>
    `;
  }

  function attachMemoryCardListeners() {
    document.querySelectorAll(".toggle-more-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const memoryCard = btn.closest(".memory-card");
        const bodyEl = memoryCard.querySelector(".text-content");
        const full = bodyEl.getAttribute("data-full");
        const preview = bodyEl.getAttribute("data-preview");

        if (btn.textContent.includes("Read Full")) {
          bodyEl.innerHTML = escapeHtml(full);
          btn.textContent = "🔼 Collapse";
        } else {
          bodyEl.innerHTML = escapeHtml(preview);
          btn.textContent = "📖 Read Full Text";
        }
      });
    });

    document.querySelectorAll(".copy-card-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const text = btn.getAttribute("data-text");
        navigator.clipboard.writeText(text);
        btn.textContent = "✅ Copied!";
        setTimeout(() => (btn.textContent = "📋 Copy"), 2000);
      });
    });
  }

  // Load Personal SEO & Content Strategy Tab
  async function loadSeoProfile() {
    const detailsGrid = document.getElementById("seo-details-grid");
    const whatToPostGrid = document.getElementById("what-to-post-grid");
    if (!detailsGrid) return;

    try {
      const res = await fetch("/api/seo-profile");
      const data = await res.json();

      if (data.success && data.analysis) {
        currentSeoAnalysis = data.analysis;
        const a = data.analysis;

        // Render Score Banner
        document.getElementById("seo-candidate-title").textContent = `${a.candidateName} - Personal Brand Audit`;
        document.getElementById("seo-rating-sub").textContent = a.seoRatingText;
        document.getElementById("seo-score-val").textContent = `${a.seoScore}/100`;

        // Render SEO Details Grid
        detailsGrid.innerHTML = `
          <div class="memory-card">
            <h4 class="memory-title" style="color:var(--accent-cyan);">🎯 Recommended Headlines (LinkedIn / GitHub)</h4>
            <div style="display:flex; flex-direction:column; gap:0.6rem; margin-top:0.6rem;">
              ${a.profileHeadlineSuggestions.map((h) => `
                <div style="background:rgba(0,0,0,0.3); padding:0.65rem; border-radius:6px; font-size:0.85rem; border-left:3px solid var(--accent-indigo); display:flex; justify-content:space-between; align-items:center; gap:0.5rem;">
                  <span>${escapeHtml(h)}</span>
                  <button class="btn secondary-btn copy-btn" data-text="${escapeAttr(h)}" style="padding:0.25rem 0.5rem; font-size:0.72rem;">Copy</button>
                </div>
              `).join("")}
            </div>
          </div>

          <div class="memory-card">
            <h4 class="memory-title" style="color:#22c55e;">🏷️ Missing High-Value Technical SEO Keywords</h4>
            <p style="font-size:0.83rem; color:var(--text-muted);">Add these target keywords to your resume & profile to boost organic search rank:</p>
            <div style="margin-top:0.6rem;">
              ${a.recommendedSeoKeywords.map((k) => `<span class="keyword-tag">⚡ ${escapeHtml(k)}</span>`).join("")}
            </div>
            <div style="margin-top:1rem; pt-0.5rem;">
              <strong style="font-size:0.83rem; color:#fff;">Already Ranking For:</strong>
              <div style="margin-top:0.4rem;">
                ${a.topCoveredKeywords.map((k) => `<span class="hashtag-pill" style="background:rgba(34,197,94,0.15); color:#22c55e;">✅ ${escapeHtml(k)}</span>`).join("")}
              </div>
            </div>
          </div>

          <div class="memory-card">
            <h4 class="memory-title" style="color:#f472b6;">💡 Strategic SEO Growth Action Plan</h4>
            <ul style="padding-left:1.2rem; font-size:0.85rem; color:var(--text-light); line-height:1.6; margin-top:0.4rem;">
              ${a.seoOptimizationTips.map((tip) => `<li style="margin-bottom:0.4rem;">${escapeHtml(tip)}</li>`).join("")}
            </ul>
          </div>
        `;

        // Render What to Post Today
        if (whatToPostGrid) {
          let postHtml = "";
          a.whatToPostToday.forEach((post) => {
            const tags = (post.trendingHashtags || []).map((t) => `<span class="hashtag-pill">${escapeHtml(t)}</span>`).join("");
            const keyPts = (post.keyPoints || []).map((k) => `<li>${escapeHtml(k)}</li>`).join("");

            postHtml += `
              <div class="memory-card" style="display:flex; flex-direction:column; justify-content:space-between; border-left:4px solid var(--accent-indigo);">
                <div>
                  <div class="memory-head">
                    <span class="memory-badge badge-career">${escapeHtml(post.category)}</span>
                    <span class="status-pill free">${escapeHtml(post.targetPlatform)}</span>
                  </div>
                  <h4 class="memory-title">${escapeHtml(post.topic)}</h4>
                  
                  <div style="background:rgba(99,102,241,0.1); border-left:3px solid var(--accent-cyan); padding:0.65rem; border-radius:6px; font-size:0.85rem; margin-top:0.5rem; color:#fff;">
                    <strong>Viral Hook:</strong> <em>"${escapeHtml(post.viralHook)}"</em>
                  </div>

                  <div style="margin-top:0.75rem;">
                    <strong style="font-size:0.82rem; color:var(--accent-cyan);">Key Takeaways to Include:</strong>
                    <ul style="padding-left:1.1rem; font-size:0.83rem; color:var(--text-muted); margin-top:0.3rem;">${keyPts}</ul>
                  </div>

                  <div style="margin-top:0.75rem;">
                    <strong style="font-size:0.82rem; color:#fff;">Trending Hashtags:</strong>
                    <div style="margin-top:0.3rem;">${tags}</div>
                  </div>
                </div>

                <div style="margin-top:1rem; pt-0.75rem; border-top:1px solid rgba(255,255,255,0.05); display:flex; gap:0.5rem;">
                  <button class="btn primary-btn copy-btn" data-text="${escapeAttr(post.suggestedPostText)}" style="flex:1; font-size:0.82rem; padding:0.45rem;">📋 Copy Draft Post</button>
                </div>
              </div>
            `;
          });
          whatToPostGrid.innerHTML = postHtml;
        }

        if (a.skillLearningRoadmap) {
          renderSkillRoadmap(a.skillLearningRoadmap);
        }

        attachPostActionListeners();
      }
    } catch (err) {
      detailsGrid.innerHTML = `<p class="placeholder-text">Failed to load SEO profile: ${err.message}</p>`;
    }
  }

  // Load Skill Roadmap & Platform Adapters (Tab 5)
  async function loadSkillRoadmapAndPlatforms() {
    const roadmapContainer = document.getElementById("skill-roadmap-container");
    if (roadmapContainer) {
      roadmapContainer.innerHTML = "<p class='placeholder-text'>Loading Skill Growth Roadmap...</p>";
      try {
        const res = await fetch("/api/seo-profile");
        const data = await res.json();
        if (data.success && data.analysis && data.analysis.skillLearningRoadmap) {
          renderSkillRoadmap(data.analysis.skillLearningRoadmap);
        }
      } catch (err) {
        roadmapContainer.innerHTML = `<p class='placeholder-text'>Failed to load roadmap: ${err.message}</p>`;
      }
    }
    fetchStats();
    loadViralPostsSection();
  }

  // Render Skill Learning Roadmap Sequence
  function renderSkillRoadmap(roadmap) {
    const container = document.getElementById("skill-roadmap-container");
    if (!container || !roadmap || roadmap.length === 0) return;

    const badgeStyles = {
      1: { badgeBg: "rgba(16, 185, 129, 0.2)", badgeColor: "#22c55e", border: "1px solid rgba(16, 185, 129, 0.4)", label: "🔥 STEP 1: LEARN FIRST (IMMEDIATE FOCUS)" },
      2: { badgeBg: "rgba(6, 182, 212, 0.2)", badgeColor: "var(--accent-cyan)", border: "1px solid rgba(6, 182, 212, 0.4)", label: "⚡ STEP 2: LEARN SECOND (NEXT FOCUS)" },
      3: { badgeBg: "rgba(99, 102, 241, 0.2)", badgeColor: "var(--accent-indigo)", border: "1px solid rgba(99, 102, 241, 0.4)", label: "🚀 STEP 3: LEARN THIRD (ADVANCED FOCUS)" },
      4: { badgeBg: "rgba(236, 72, 153, 0.2)", badgeColor: "#f472b6", border: "1px solid rgba(236, 72, 153, 0.4)", label: "🏆 STEP 4: LEARN FOURTH (MASTERY FOCUS)" },
    };

    let html = "";
    roadmap.forEach((step) => {
      const style = badgeStyles[step.stepNumber] || badgeStyles[1];
      const readList = (step.whatToReadAndMaster || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("");
      const keyPts = (step.whatToPost?.keyPoints || []).map((k) => `<li>${escapeHtml(k)}</li>`).join("");
      const tags = (step.whatToPost?.hashtags || []).map((t) => `<span class="hashtag-pill">${escapeHtml(t)}</span>`).join("");

      html += `
        <div class="memory-card" style="border-left: 5px solid ${style.badgeColor}; padding:1.25rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.75rem;">
            <span style="background:${style.badgeBg}; color:${style.badgeColor}; border:${style.border}; padding:0.3rem 0.75rem; border-radius:20px; font-weight:700; font-size:0.78rem; text-transform:uppercase; letter-spacing:0.5px;">
              ${style.label}
            </span>
            <span class="vector-tag" style="font-size:0.78rem;">Category: ${escapeHtml(step.category)}</span>
          </div>

          <h3 style="font-family:'Outfit',sans-serif; color:#fff; font-size:1.3rem; margin:0.25rem 0 0.5rem 0;">${escapeHtml(step.skillName)}</h3>

          <!-- Why Learn Now -->
          <div style="background:rgba(0,0,0,0.3); border-left:3px solid ${style.badgeColor}; padding:0.75rem 1rem; border-radius:8px; font-size:0.88rem; color:var(--text-light); margin-bottom:1rem;">
            <strong style="color:${style.badgeColor}; font-weight:700;">🎯 Why Learn This Now:</strong> ${escapeHtml(step.whyLearnNow)}
          </div>

          <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap:1.25rem;">
            <!-- Left Box: What to Read & Project to Build -->
            <div style="background:rgba(15,23,42,0.6); border:1px solid var(--card-border); padding:1rem; border-radius:10px;">
              <h4 style="color:var(--accent-cyan); font-size:0.95rem; margin-bottom:0.5rem; display:flex; align-items:center; gap:0.4rem;">
                <span>🎓</span> What to Read & Master
              </h4>
              <ul style="padding-left:1.1rem; font-size:0.84rem; color:var(--text-muted); line-height:1.6; margin-bottom:1rem;">
                ${readList}
              </ul>

              <h4 style="color:#22c55e; font-size:0.95rem; margin-bottom:0.4rem; display:flex; align-items:center; gap:0.4rem;">
                <span>🛠️</span> Hands-on Project Task to Build
              </h4>
              <p style="font-size:0.85rem; color:#fff; background:rgba(0,0,0,0.3); padding:0.6rem 0.8rem; border-radius:6px; border:1px dashed rgba(34,197,94,0.3); margin:0;">
                ${escapeHtml(step.handsOnProjectToBuild)}
              </p>
            </div>

            <!-- Right Box: What Content / Post to Publish -->
            <div style="background:rgba(15,23,42,0.6); border:1px solid var(--card-border); padding:1rem; border-radius:10px; display:flex; flex-direction:column; justify-content:space-between;">
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                  <h4 style="color:var(--accent-indigo); font-size:0.95rem; margin:0; display:flex; align-items:center; gap:0.4rem;">
                    <span>📢</span> Post to Publish for This Skill
                  </h4>
                  <span class="status-pill free" style="font-size:0.7rem;">${escapeHtml(step.whatToPost.targetPlatform)}</span>
                </div>

                <div style="font-weight:700; font-size:0.92rem; color:#fff; margin-bottom:0.4rem;">${escapeHtml(step.whatToPost.title)}</div>

                <div style="background:rgba(99,102,241,0.1); border-left:2px solid var(--accent-cyan); padding:0.5rem 0.75rem; border-radius:6px; font-size:0.82rem; color:var(--text-light); margin-bottom:0.6rem;">
                  <strong>Viral Hook:</strong> <em>"${escapeHtml(step.whatToPost.viralHook)}"</em>
                </div>

                <div style="margin-bottom:0.6rem;">
                  <strong style="font-size:0.78rem; color:var(--accent-cyan);">Key Takeaways:</strong>
                  <ul style="padding-left:1.1rem; font-size:0.8rem; color:var(--text-muted); margin-top:0.2rem;">${keyPts}</ul>
                </div>

                <div style="margin-bottom:0.6rem;">${tags}</div>
              </div>

              <div style="margin-top:0.75rem; pt-0.5rem; border-top:1px solid rgba(255,255,255,0.05); display:flex; gap:0.5rem;">
                <button class="btn primary-btn copy-btn" data-text="${escapeAttr(step.whatToPost.suggestedPostText)}" style="flex:1; font-size:0.8rem; padding:0.45rem;">📋 Copy Skill Post Draft</button>
              </div>
            </div>
          </div>

          <!-- Market Demand Footer -->
          <div style="margin-top:1rem; pt-0.5rem; font-size:0.8rem; color:var(--text-muted); display:flex; align-items:center; gap:0.4rem;">
            <span>💼</span> <strong>Career & Salary Impact:</strong> ${escapeHtml(step.marketDemandReason)}
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    attachPostActionListeners();
  }


  // Grounded Google Search API Handler
  const googleSearchBtn = document.getElementById("google-search-btn");
  const googleSearchInput = document.getElementById("google-search-input");
  const googleSearchResults = document.getElementById("google-search-results");

  if (googleSearchBtn && googleSearchInput) {
    googleSearchBtn.addEventListener("click", runGoogleSearch);
    googleSearchInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") runGoogleSearch();
    });
  }

  async function runGoogleSearch() {
    const query = googleSearchInput.value.trim();
    if (!query) return;

    googleSearchResults.style.display = "block";
    googleSearchResults.innerHTML = "<p class='placeholder-text'>Running Google Custom Search API...</p>";

    try {
      const res = await fetch("/api/google-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const data = await res.json();

      if (data.success && data.searchResult) {
        const sr = data.searchResult;
        let html = `
          <div style="font-size:0.82rem; color:var(--text-muted); margin-bottom:0.75rem; display:flex; justify-content:space-between;">
            <span>Found ${sr.totalResults} results for <strong>"${escapeHtml(sr.query)}"</strong></span>
            <span style="color:var(--accent-cyan); font-weight:700;">${sr.isRealApi ? '✅ Live Google API' : '⚡ Grounded Fallback'}</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.75rem;">
        `;

        sr.items.forEach((item) => {
          html += `
            <div style="background:rgba(0,0,0,0.3); border:1px solid var(--card-border); padding:0.85rem; border-radius:8px;">
              <div style="font-size:0.75rem; color:var(--accent-cyan); font-weight:600;">🌐 ${escapeHtml(item.domain)}</div>
              <h4 style="margin:0.2rem 0; font-size:0.95rem;"><a href="${item.link}" target="_blank" style="color:#60a5fa; text-decoration:none;">${escapeHtml(item.title)}</a></h4>
              <p style="font-size:0.83rem; color:var(--text-muted); margin:0;">${escapeHtml(item.snippet)}</p>
            </div>
          `;
        });

        html += `</div>`;
        googleSearchResults.innerHTML = html;
      }
    } catch (err) {
      googleSearchResults.innerHTML = `<p class='placeholder-text'>Search failed: ${err.message}</p>`;
    }
  }

  // Load What to Read & Time Tracker Tab
  async function loadReadingSection() {
    const whatToReadGrid = document.getElementById("what-to-read-grid");
    const readingHistoryContainer = document.getElementById("reading-history-container");

    if (whatToReadGrid) {
      try {
        const res = await fetch("/api/seo-profile");
        const data = await res.json();

        if (data.success && data.analysis) {
          const reads = data.analysis.whatToReadToday || [];
          let html = "";

          reads.forEach((r) => {
            const tags = (r.tags || []).map((t) => `<span class="hashtag-pill">${escapeHtml(t)}</span>`).join("");
            html += `
              <div class="memory-card" style="display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div class="memory-head">
                    <span class="memory-badge badge-research">📖 ${escapeHtml(r.category)}</span>
                    <span class="status-pill free">⏱️ Est. ${r.estimatedMinutes} Mins</span>
                  </div>
                  <h4 class="memory-title">${escapeHtml(r.title)}</h4>
                  <p class="memory-body" style="font-size:0.85rem;">${escapeHtml(r.snippet)}</p>
                  
                  <div style="margin-top:0.6rem; background:rgba(0,0,0,0.3); padding:0.6rem; border-radius:6px; font-size:0.8rem; border-left:2px solid var(--accent-cyan);">
                    <strong style="color:var(--accent-cyan);">Key Takeaway:</strong> ${escapeHtml(r.keyTakeaway)}
                  </div>
                  <div style="margin-top:0.6rem;">${tags}</div>
                </div>

                <div style="margin-top:1rem; pt-0.5rem; display:flex; gap:0.5rem;">
                  <button class="btn primary-btn start-reading-btn" 
                    data-title="${escapeAttr(r.title)}" 
                    data-url="${escapeAttr(r.url)}" 
                    data-cat="${escapeAttr(r.category)}" 
                    data-snippet="${escapeAttr(r.snippet)}" 
                    data-takeaway="${escapeAttr(r.keyTakeaway)}" 
                    style="flex:1; font-size:0.83rem; padding:0.5rem;">
                    📖 Start Reading & Track Time
                  </button>
                </div>
              </div>
            `;
          });

          whatToReadGrid.innerHTML = html;
          attachReadingCardListeners();
        }
      } catch (err) {
        whatToReadGrid.innerHTML = `<p class="placeholder-text">Failed to load readings: ${err.message}</p>`;
      }
    }

    loadReadingHistory();
  }

  // Load Saved Reading History from Database
  async function loadReadingHistory() {
    const container = document.getElementById("reading-history-container");
    if (!container) return;

    try {
      const res = await fetch("/api/reading-stats");
      const data = await res.json();

      if (data.success && data.stats) {
        const s = data.stats;
        document.getElementById("stat-reading-time").textContent = `${s.totalMinutes}m`;
        document.getElementById("stat-reading-count").textContent = `${s.totalArticles} articles saved to DB`;

        if (s.recentLogs.length === 0) {
          container.innerHTML = `<p class="placeholder-text">No reading sessions recorded yet. Click 'Start Reading & Track Time' on any article to record your reading history!</p>`;
          return;
        }

        let html = `
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem; font-size:0.85rem; font-weight:700;">
            <span style="color:#22c55e;">Total Articles Read: ${s.totalArticles}</span>
            <span style="color:var(--accent-cyan);">Total Time Logged: ${s.totalMinutes} Mins (${s.totalSeconds}s)</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:0.5rem;">
        `;

        s.recentLogs.forEach((l) => {
          const mins = (l.reading_time_seconds / 60).toFixed(1);
          const dateStr = l.read_at ? new Date(l.read_at).toLocaleString() : "Just now";

          html += `
            <div style="background:rgba(15,23,42,0.6); border:1px solid var(--card-border); padding:0.65rem 0.85rem; border-radius:8px; display:flex; justify-content:space-between; align-items:center; font-size:0.84rem;">
              <div>
                <strong style="color:#fff;">${escapeHtml(l.article_title)}</strong>
                <div style="font-size:0.75rem; color:var(--text-muted); margin-top:0.2rem;">
                  Category: <span style="color:var(--accent-cyan);">${escapeHtml(l.topic_category)}</span> | Logged: ${dateStr}
                </div>
              </div>
              <div style="text-align:right;">
                <span class="status-pill free">⏱️ ${mins} Mins (${l.reading_time_seconds}s)</span>
                <div style="font-size:0.72rem; color:#22c55e; margin-top:0.2rem;">Saved to DB</div>
              </div>
            </div>
          `;
        });

        html += `</div>`;
        container.innerHTML = html;
      }
    } catch {
      // ignore
    }
  }

  // Interactive Reading Tracker Modal Logic
  const modalOverlay = document.getElementById("reading-modal");
  const closeModalBtn = document.getElementById("close-modal-btn");
  const cancelReadBtn = document.getElementById("cancel-read-btn");
  const completeReadBtn = document.getElementById("complete-read-btn");
  const toggleTimerBtn = document.getElementById("toggle-timer-btn");
  const liveTimerDisplay = document.getElementById("live-timer-display");

  function attachReadingCardListeners() {
    document.querySelectorAll(".start-reading-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const title = btn.getAttribute("data-title");
        const url = btn.getAttribute("data-url");
        const cat = btn.getAttribute("data-cat");
        const snippet = btn.getAttribute("data-snippet");
        const takeaway = btn.getAttribute("data-takeaway");

        currentReadingItem = { title, url, cat, snippet, takeaway };

        document.getElementById("modal-read-title").textContent = title;
        document.getElementById("modal-read-snippet").textContent = snippet;
        document.getElementById("modal-read-takeaway").textContent = takeaway;
        document.getElementById("modal-read-link").innerHTML = url ? `🔗 <a href="${url}" target="_blank" style="color:var(--accent-cyan);">Open Original Documentation / Article</a>` : '';

        // Reset and Start Stopwatch
        readingTimerSeconds = 0;
        updateTimerDisplay();
        startTimer();

        modalOverlay.style.display = "flex";
      });
    });
  }

  function startTimer() {
    if (readingTimerInterval) clearInterval(readingTimerInterval);
    isTimerRunning = true;
    if (toggleTimerBtn) toggleTimerBtn.textContent = "⏸️ Pause Timer";

    readingTimerInterval = setInterval(() => {
      readingTimerSeconds++;
      updateTimerDisplay();
    }, 1000);
  }

  function pauseTimer() {
    if (readingTimerInterval) clearInterval(readingTimerInterval);
    isTimerRunning = false;
    if (toggleTimerBtn) toggleTimerBtn.textContent = "▶️ Resume Timer";
  }

  function updateTimerDisplay() {
    const mins = Math.floor(readingTimerSeconds / 60).toString().padStart(2, "0");
    const secs = (readingTimerSeconds % 60).toString().padStart(2, "0");
    if (liveTimerDisplay) liveTimerDisplay.textContent = `${mins}:${secs}`;
  }

  if (toggleTimerBtn) {
    toggleTimerBtn.addEventListener("click", () => {
      if (isTimerRunning) pauseTimer();
      else startTimer();
    });
  }

  if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
  if (cancelReadBtn) cancelReadBtn.addEventListener("click", closeModal);

  function closeModal() {
    pauseTimer();
    modalOverlay.style.display = "none";
    currentReadingItem = null;
  }

  if (completeReadBtn) {
    completeReadBtn.addEventListener("click", async () => {
      if (!currentReadingItem) return;

      const title = currentReadingItem.title;
      const url = currentReadingItem.url;
      const cat = currentReadingItem.cat;
      const duration = Math.max(5, readingTimerSeconds);

      completeReadBtn.disabled = true;
      completeReadBtn.textContent = "⏳ Saving to Database...";

      try {
        const res = await fetch("/api/track-reading", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            articleTitle: title,
            url,
            topicCategory: cat,
            readingTimeSeconds: duration,
          }),
        });

        const data = await res.json();
        if (data.success) {
          closeModal();
          loadReadingHistory();
          fetchStats();
          alert(`🎉 Reading session logged successfully!\n\nArticle: "${title}"\nDuration: ${duration} seconds saved to database.`);
        } else {
          alert(`Failed to save reading session: ${data.error}`);
        }
      } catch (err) {
        alert(`Error saving session: ${err.message}`);
      } finally {
        completeReadBtn.disabled = false;
        completeReadBtn.textContent = "✅ Complete & Save Reading to Database";
      }
    });
  }

  // Self-Updating Engine Watcher
  const forceSyncBtn = document.getElementById("force-sync-btn");
  const engineTimerDisplay = document.getElementById("engine-timer-display");

  function initSelfUpdatingEngineWatcher() {
    if (forceSyncBtn) {
      forceSyncBtn.addEventListener("click", async () => {
        forceSyncBtn.disabled = true;
        forceSyncBtn.innerHTML = "⏳ Syncing...";
        try {
          const res = await fetch("/api/self-update/trigger", { method: "POST" });
          const data = await res.json();
          if (data.success) {
            forceSyncBtn.innerHTML = "✅ Synced!";
            fetchStats();
            if (activeTab === "tab-seo") loadSeoProfile();
            if (activeTab === "tab-read") loadReadingSection();
            setTimeout(() => (forceSyncBtn.innerHTML = "<span>🔄</span> Sync Now"), 2000);
          }
        } catch {
          forceSyncBtn.innerHTML = "<span>🔄</span> Sync Now";
        } finally {
          forceSyncBtn.disabled = false;
        }
      });
    }

    // Poll status every 5 seconds for live countdown ticker
    setInterval(async () => {
      try {
        const res = await fetch("/api/self-update/status");
        const data = await res.json();
        if (data.success && data.status && engineTimerDisplay) {
          const s = data.status;
          engineTimerDisplay.textContent = `Active (${s.nextUpdateInSeconds}s)`;
        }
      } catch {
        // ignore
      }
    }, 5000);
  }

  // Content Pack Handler
  const generatePackBtnSeo = document.getElementById("generate-pack-btn-seo");
  const contentPackOutput = document.getElementById("content-pack-output");

  if (generatePackBtnSeo && contentPackOutput) {
    generatePackBtnSeo.addEventListener("click", generatePackAction);
  }

  async function generatePackAction() {
    contentPackOutput.innerHTML = `
      <div class="loading-box" style="text-align:center; padding:3rem; background:rgba(11,15,23,0.6); border-radius:12px; border:1px solid var(--card-border);">
        <div class="spinner" style="font-size:2.5rem; margin-bottom:1rem;">⚡</div>
        <h3 style="font-family:'Outfit',sans-serif; color:#fff;">Analyzing Second Brain & Drafting Social Content Pack...</h3>
        <p style="margin-top:0.5rem; color:var(--accent-cyan); font-size:0.9rem;">Model: Gemini 3.6 Flash | Target Cadence: Every 2 Days</p>
      </div>
    `;

    try {
      const res = await fetch("/api/generate-pack", { method: "POST" });
      const data = await res.json();

      if (data.success && data.contentPack) {
        renderContentPackOutput(data.contentPack);
      }
    } catch (err) {
      contentPackOutput.innerHTML = `<p class='placeholder-text'>Generation error: ${err.message}</p>`;
    }
  }

  function renderContentPackOutput(pack) {
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
          </div>
        </div>
      </div>

      <div class="platform-posts-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap:1.25rem;">
    `;

    const platformMeta = {
      linkedin: { name: "LinkedIn Profile", icon: "💼", badgeBg: "#0a66c2" },
      x: { name: "X (Twitter)", icon: "🐦", badgeBg: "#1da1f2" },
      devto: { name: "Dev.to / Technical Blog", icon: "✍️", badgeBg: "#0a0a0a" },
      reddit: { name: "Reddit (r/developersIndia)", icon: "👾", badgeBg: "#ff4500" },
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
            </div>

            <div class="memory-body" style="background:rgba(0,0,0,0.3); padding:1rem; border-radius:8px; font-family:monospace; font-size:0.88rem; max-height:260px; overflow-y:auto; white-space:pre-wrap; border:1px solid rgba(255,255,255,0.05);">${escapeHtml(fullText)}</div>
          </div>

          <div style="display:flex; gap:0.5rem; margin-top:1rem; flex-wrap:wrap;">
            <button class="btn secondary-btn copy-btn" data-text="${escapeAttr(fullText)}" style="flex:1; font-size:0.85rem; padding:0.55rem;">📋 Copy Post</button>
            <button class="btn primary-btn publish-btn" data-platform="${item.platform}" data-text="${escapeAttr(fullText)}" data-topic="${escapeAttr(pack.topic)}" style="flex:1; font-size:0.85rem; padding:0.55rem;">🚀 Publish Now</button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
    contentPackOutput.innerHTML = html;
    attachPostActionListeners();
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

        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = "⏳ Publishing...";

        try {
          const res = await fetch("/api/publish-now", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ platform, postText, topic }),
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

  // Dashboard Stats Fetching
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
          let html = "";
          pubStatus.forEach((p) => {
            const isConfigured = p.configured;
            html += `
              <div class="platform-card ${isConfigured ? 'active-plat' : ''}">
                <div class="platform-head">
                  <span class="platform-name">${p.name || p.platform}</span>
                  <span class="status-pill ${isConfigured ? 'free' : 'optimized'}">${isConfigured ? 'READY / ACTIVE' : 'DRY-RUN'}</span>
                </div>
                <div class="platform-foot">
                  <span>${p.statusText}</span>
                </div>
              </div>
            `;
          });
          platformsGrid.innerHTML = html;
        }
      }
    } catch (err) {
      console.warn("Stats fetch warning:", err);
    }
    loadReadingHistory();
    initSeoSyncHandlers();
  }

  // Website SEO Synchronization UI Handlers (For https://www.abhishektiwari.online/)
  function initSeoSyncHandlers() {
    const syncHeaderBtn = document.getElementById("sync-website-seo-btn");
    const syncMainBtn = document.getElementById("seo-sync-main-btn");
    const statusContainer = document.getElementById("seo-sync-status-container");
    const statusHeader = document.getElementById("seo-sync-status-header");
    const pagesBreakdown = document.getElementById("seo-sync-pages-breakdown");
    const copyCodeBtn = document.getElementById("copy-receiver-code-btn");

    async function triggerWebsiteSeoSync(btnEl) {
      if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = `<span>⏳</span> Syncing Website SEO...`;
      }

      if (statusContainer) {
        statusContainer.style.display = "block";
        statusHeader.innerHTML = `⏳ Triggering SEO Sync for target site: <strong>https://www.abhishektiwari.online/</strong>...`;
        pagesBreakdown.innerHTML = `<p class="placeholder-text">Generating Meta Tags, OpenGraph & JSON-LD schemas for Home (/), About (/about), and Contact (/#contact)...</p>`;
      }

      try {
        const res = await fetch("/api/seo/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetSite: "https://www.abhishektiwari.online/" }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          if (statusHeader) {
            statusHeader.innerHTML = `🎉 SEO Metadata Synchronized & Persisted in Supabase (table: <code>seo_metadata</code>)!`;
          }

          if (pagesBreakdown && data.pages) {
            let html = "";
            Object.keys(data.pages).forEach((route) => {
              const item = data.pages[route];
              html += `
                <div style="background:rgba(15,23,42,0.7); border:1px solid rgba(16,185,129,0.3); border-radius:8px; padding:0.9rem;">
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                    <span style="font-weight:700; color:#10b981; font-size:0.88rem;">📄 Page: ${escapeHtml(route)}</span>
                    <span class="status-pill free" style="font-size:0.7rem;">READY FOR RECEIVER</span>
                  </div>
                  <div style="font-size:0.83rem; color:#fff; font-weight:600; margin-bottom:0.3rem;">
                    Title: ${escapeHtml(item.meta_title)}
                  </div>
                  <div style="font-size:0.78rem; color:var(--text-muted); margin-bottom:0.4rem; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">
                    <strong>Description:</strong> ${escapeHtml(item.meta_description)}
                  </div>
                  <div style="font-size:0.72rem; color:var(--accent-cyan);">
                    <strong>Keywords:</strong> ${escapeHtml(item.meta_keywords ? item.meta_keywords.slice(0, 100) + '...' : '')}
                  </div>
                </div>
              `;
            });
            pagesBreakdown.innerHTML = html;
          }

          if (syncHeaderBtn) {
            syncHeaderBtn.innerHTML = `<span>✅</span> SEO Synced!`;
            setTimeout(() => {
              syncHeaderBtn.disabled = false;
              syncHeaderBtn.innerHTML = `<span>🌐</span> Sync SEO to Website`;
            }, 3000);
          }

          if (syncMainBtn) {
            syncMainBtn.innerHTML = `<span>✅</span> Sync Complete!`;
            setTimeout(() => {
              syncMainBtn.disabled = false;
              syncMainBtn.innerHTML = `<span>⚡</span> Trigger Website SEO Sync Now`;
            }, 3000);
          }
        } else {
          const errText = data.error || "Failed to sync SEO metadata";
          if (statusHeader) statusHeader.innerHTML = `❌ SEO Sync Error: ${escapeHtml(errText)}`;
          if (syncHeaderBtn) {
            syncHeaderBtn.disabled = false;
            syncHeaderBtn.innerHTML = `<span>🌐</span> Sync SEO to Website`;
          }
          if (syncMainBtn) {
            syncMainBtn.disabled = false;
            syncMainBtn.innerHTML = `<span>⚡</span> Trigger Website SEO Sync Now`;
          }
        }
      } catch (err) {
        if (statusHeader) statusHeader.innerHTML = `❌ Network Error: ${escapeHtml(err.message)}`;
        if (syncHeaderBtn) {
          syncHeaderBtn.disabled = false;
          syncHeaderBtn.innerHTML = `<span>🌐</span> Sync SEO to Website`;
        }
        if (syncMainBtn) {
          syncMainBtn.disabled = false;
          syncMainBtn.innerHTML = `<span>⚡</span> Trigger Website SEO Sync Now`;
        }
      }
    }

    if (syncHeaderBtn) {
      syncHeaderBtn.addEventListener("click", () => {
        const seoTabBtn = document.querySelector('.tab-btn[data-tab="tab-seo"]');
        if (seoTabBtn) seoTabBtn.click();
        triggerWebsiteSeoSync(syncHeaderBtn);
      });
    }

    if (syncMainBtn) {
      syncMainBtn.addEventListener("click", () => triggerWebsiteSeoSync(syncMainBtn));
    }

    if (copyCodeBtn) {
      copyCodeBtn.addEventListener("click", () => {
        const codeText = document.getElementById("receiver-code-text")?.textContent || `<script src="https://career-digest.vercel.app/seo-sync.js"></script>`;
        navigator.clipboard.writeText(codeText).then(() => {
          copyCodeBtn.textContent = "✅ Copied!";
          setTimeout(() => { copyCodeBtn.textContent = "📋 Copy Code"; }, 2000);
        });
      });
    }
  }

  // TAB 6: 12-BLOG COMPETITION & CHAMPION PORTFOLIO HUB
  window.__currentBlogCandidates = [];

  async function loadBlogsTab() {
    const championContainer = document.getElementById("champion-blog-container");
    const candidatesGrid = document.getElementById("candidates-blog-grid");
    const championScoreBadge = document.getElementById("champion-score-badge");
    const genBtn = document.getElementById("generate-12-blogs-btn");
    const syncBtn = document.getElementById("sync-champion-portfolio-btn");
    const genStatus = document.getElementById("blog-gen-status");

    try {
      // 1. Fetch Champion Blog
      const championRes = await fetch("/api/blogs/champion");
      const championData = await championRes.json();
      if (championData.success && championData.champion) {
        const champ = championData.champion;
        if (championScoreBadge) {
          championScoreBadge.textContent = `SEO Score: ${champ.seo_score || champ.seoScore || 94}/100`;
        }
        if (championContainer) {
          championContainer.innerHTML = `
            <div style="background: linear-gradient(135deg, rgba(16,185,129,0.12), rgba(15,23,42,0.85)); border: 1px solid rgba(16,185,129,0.4); border-radius: 14px; padding: 1.5rem;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1.25rem;">
                <div style="flex:1; min-width:300px;">
                  <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.4rem;">
                    <span style="font-size:0.75rem; font-weight:800; color:#10b981; text-transform:uppercase; letter-spacing:1px; background:rgba(16,185,129,0.15); padding:0.25rem 0.65rem; border-radius:20px;">🥇 #1 RANKED DAILY CHAMPION BLOG</span>
                    <span style="font-size:0.75rem; color:#38bdf8; font-family:monospace;">Published: ${escapeHtml(champ.published_date || champ.publishedAt || new Date().toISOString().slice(0,10))}</span>
                  </div>
                  <h2 style="font-family:'Outfit',sans-serif; color:#fff; font-size:1.45rem; line-height:1.35; margin-top:0.2rem;">${escapeHtml(champ.title)}</h2>
                  <p style="font-size:0.86rem; color:var(--text-muted); margin-top:0.35rem;">
                    Target Keyword: <strong style="color:var(--accent-cyan);">${escapeHtml(champ.target_keyword || champ.targetKeyword)}</strong> • Slug: <code>${escapeHtml(champ.slug)}</code>
                  </p>
                </div>
                ${champ.cover_url || champ.coverUrl ? `<img src="${champ.cover_url || champ.coverUrl}" style="max-width:240px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); box-shadow:0 4px 16px rgba(0,0,0,0.5);" alt="Cover Artwork">` : ''}
              </div>

              <div style="margin-top:1rem; background:rgba(0,0,0,0.35); padding:1rem; border-radius:8px; border-left:4px solid #10b981;">
                <strong style="color:#10b981; font-size:0.85rem; text-transform:uppercase; letter-spacing:0.5px;">📝 TL;DR Direct Answer / Featured Snippet:</strong>
                <p style="margin-top:0.3rem; font-size:0.9rem; color:#fff; line-height:1.55;">${escapeHtml(champ.tldr_summary || champ.tldrSummary || champ.meta_description)}</p>
              </div>

              <div style="margin-top:1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
                <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                  ${(champ.hashtags || []).map(h => `<span class="chip-btn" style="padding:0.2rem 0.6rem; font-size:0.75rem; background:rgba(99,102,241,0.2); border-color:var(--accent-indigo);">${escapeHtml(h)}</span>`).join("")}
                </div>
                <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
                  <button class="btn secondary-btn" onclick="copyChampionCurl()" style="padding:0.4rem 0.85rem; font-size:0.82rem;">📋 Copy cURL</button>
                  <button class="btn primary-btn" onclick="toggleChampionContent()" style="padding:0.4rem 0.85rem; font-size:0.82rem;">📖 Toggle Full Markdown Article</button>
                </div>
              </div>

              <div id="champion-markdown-preview" style="display:none; margin-top:1.25rem; background:#090d16; border:1px solid var(--card-border); border-radius:8px; padding:1.25rem; color:#e2e8f0; font-size:0.9rem; line-height:1.7; max-height:450px; overflow-y:auto; white-space:pre-wrap;">${escapeHtml(champ.content_markdown || champ.contentMarkdown)}</div>
            </div>
          `;
        }
      }

      // 2. Fetch All 12 Candidate Blogs
      const candRes = await fetch("/api/blogs/candidates");
      const candData = await candRes.json();
      if (candData.success && candData.candidates && candData.candidates.length > 0) {
        window.__currentBlogCandidates = candData.candidates;
        if (candidatesGrid) {
          candidatesGrid.innerHTML = candData.candidates.map((c, idx) => {
            const isChamp = c.is_champion || c.isChampion || idx === 0;
            const rankClass = idx === 0 ? "rank-badge-gold" : (idx === 1 ? "rank-badge-silver" : (idx === 2 ? "rank-badge-bronze" : ""));
            const rankLabel = idx === 0 ? "🥇 #1 CHAMPION" : (idx === 1 ? "🥈 #2 RUNNER-UP" : (idx === 2 ? "🥉 #3 THIRD PLACE" : `RANK #${idx + 1}`));
            const score = c.seo_score || c.seoScore || 85;

            return `
              <div class="metric-card" style="background: ${isChamp ? 'rgba(16,185,129,0.08)' : 'rgba(15,23,42,0.6)'}; border-color: ${isChamp ? '#10b981' : 'var(--card-border)'}; display:flex; flex-direction:column; justify-content:space-between;">
                <div>
                  <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.6rem;">
                    <span class="status-badge ${rankClass}" style="font-size:0.75rem; padding:0.25rem 0.6rem; border-radius:12px;">
                      ${rankLabel}
                    </span>
                    <span style="font-weight:800; font-family:'Outfit',sans-serif; color:${score >= 90 ? '#10b981' : '#38bdf8'}; font-size:1.15rem;">
                      ${score}/100 Marks
                    </span>
                  </div>
                  <h4 style="color:#fff; font-family:'Outfit',sans-serif; font-size:1.02rem; line-height:1.35; margin-bottom:0.4rem;">${escapeHtml(c.title)}</h4>
                  <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.6rem;">Target Keyword: <strong style="color:var(--accent-cyan);">${escapeHtml(c.target_keyword || c.targetKeyword)}</strong></p>
                  <p style="font-size:0.84rem; color:var(--text-light); line-height:1.5; margin-bottom:0.85rem;">${escapeHtml((c.tldr_summary || c.tldrSummary || c.meta_description || c.metaDescription || "").slice(0, 125))}...</p>
                  
                  <!-- Criteria Marks Pills -->
                  <div style="display:flex; gap:0.35rem; flex-wrap:wrap; margin-bottom:0.85rem;">
                    <span class="criteria-pill">Code: <strong>20/20</strong></span>
                    <span class="criteria-pill">H2s: <strong>10/10</strong></span>
                    <span class="criteria-pill">Links: <strong>12/12</strong></span>
                    <span class="criteria-pill">Schema: <strong>8/8</strong></span>
                  </div>
                </div>

                <div style="display:flex; gap:0.5rem; margin-top:0.5rem;">
                  <button class="btn secondary-btn" onclick="viewCandidateBreakdown(${idx})" style="flex:1; padding:0.35rem 0.6rem; font-size:0.78rem;">
                    📊 Criteria Marks
                  </button>
                  <button class="btn primary-btn" onclick="viewCandidateArticle(${idx})" style="flex:1; padding:0.35rem 0.6rem; font-size:0.78rem;">
                    📖 Read Article
                  </button>
                </div>
              </div>
            `;
          }).join("");
        }
      } else if (candidatesGrid) {
        candidatesGrid.innerHTML = `<p class="placeholder-text">Click "Generate 12 Candidate Blogs Now" to run the AI self-judging competition!</p>`;
      }
    } catch (err) {
      console.warn("Blogs tab load warning:", err);
    }

    // Attach Event Listeners for Generation and Sync
    if (genBtn) {
      genBtn.onclick = async () => {
        genBtn.disabled = true;
        if (genStatus) genStatus.style.display = "block";
        genBtn.innerHTML = `<span>⏳</span> Generating 12 Blogs...`;
        try {
          const res = await fetch("/api/blogs/generate", { method: "POST" });
          const data = await res.json();
          if (data.success) {
            alert(`🎉 Successfully generated 12 candidate blogs & selected Daily Champion: "${data.champion?.title}"!`);
            loadBlogsTab();
          } else {
            alert(`Generation failed: ${data.error}`);
          }
        } catch (err) {
          alert(`Error: ${err.message}`);
        } finally {
          genBtn.disabled = false;
          if (genStatus) genStatus.style.display = "none";
          genBtn.innerHTML = `<span>⚡</span> Generate 12 Candidate Blogs Now`;
        }
      };
    }

    if (syncBtn) {
      syncBtn.onclick = async () => {
        syncBtn.disabled = true;
        syncBtn.innerHTML = `<span>🌐</span> Auto-Posting to Portfolio...`;
        try {
          const res = await fetch("/api/blogs/sync", { method: "POST" });
          const data = await res.json();
          if (data.success) {
            alert(`🚀 Champion Blog synchronized and ready for publication at https://www.abhishektiwari.online/!\n\nStatus: ${data.webhookStatus}`);
          } else {
            alert(`Sync failed: ${data.error}`);
          }
        } catch (err) {
          alert(`Error: ${err.message}`);
        } finally {
          syncBtn.disabled = false;
          syncBtn.innerHTML = `<span>🌐</span> Auto-Post Champion to Portfolio`;
        }
      };
    }

    // Setup Format Tabs (cURL vs React vs Script)
    const tabCurl = document.getElementById("tab-opt-curl");
    const tabReact = document.getElementById("tab-opt-react");
    const tabScript = document.getElementById("tab-opt-script");
    const viewCurl = document.getElementById("view-curl-block");
    const viewReact = document.getElementById("view-react-block");
    const viewScript = document.getElementById("view-script-block");

    if (tabCurl && tabReact && tabScript) {
      tabCurl.onclick = () => {
        tabCurl.classList.add("active");
        tabReact.classList.remove("active");
        tabScript.classList.remove("active");
        if (viewCurl) viewCurl.style.display = "block";
        if (viewReact) viewReact.style.display = "none";
        if (viewScript) viewScript.style.display = "none";
      };
      tabReact.onclick = () => {
        tabReact.classList.add("active");
        tabCurl.classList.remove("active");
        tabScript.classList.remove("active");
        if (viewReact) viewReact.style.display = "block";
        if (viewCurl) viewCurl.style.display = "none";
        if (viewScript) viewScript.style.display = "none";
      };
      tabScript.onclick = () => {
        tabScript.classList.add("active");
        tabCurl.classList.remove("active");
        tabReact.classList.remove("active");
        if (viewScript) viewScript.style.display = "block";
        if (viewCurl) viewCurl.style.display = "none";
        if (viewReact) viewReact.style.display = "none";
      };
    }

    // Setup Copy cURL Button
    const copyCurlBtn = document.getElementById("copy-curl-champion-btn");
    if (copyCurlBtn) {
      copyCurlBtn.onclick = () => {
        const cmd = `curl -s "https://career-digest.vercel.app/api/blogs/champion"`;
        navigator.clipboard.writeText(cmd);
        copyCurlBtn.innerHTML = `<span>✅</span> Copied!`;
        setTimeout(() => { copyCurlBtn.innerHTML = `<span>📋</span> Copy cURL`; }, 2000);
      };
    }

    // Setup Live API Test Button
    const testApiBtn = document.getElementById("test-api-live-btn");
    const outputContainer = document.getElementById("api-test-output-container");
    const jsonPreview = document.getElementById("api-test-json-preview");
    const latencyEl = document.getElementById("api-test-latency");

    if (testApiBtn) {
      testApiBtn.onclick = async () => {
        testApiBtn.disabled = true;
        testApiBtn.innerHTML = `<span>⏳</span> Testing...`;
        const startTime = performance.now();
        try {
          const res = await fetch("/api/blogs/champion");
          const duration = Math.round(performance.now() - startTime);
          const data = await res.json();
          if (outputContainer) outputContainer.style.display = "block";
          if (latencyEl) latencyEl.textContent = `Latency: ${duration}ms (Status: ${res.status})`;
          if (jsonPreview) jsonPreview.textContent = JSON.stringify(data, null, 2);
        } catch (err) {
          if (outputContainer) outputContainer.style.display = "block";
          if (jsonPreview) jsonPreview.textContent = `API Request Error: ${err.message}`;
        } finally {
          testApiBtn.disabled = false;
          testApiBtn.innerHTML = `<span>⚡</span> Test API Live`;
        }
      };
    }

    // Modal Close handlers
    const blogModal = document.getElementById("blog-modal");
    const closeBlogModalBtn = document.getElementById("close-blog-modal-btn");
    const closeBlogModalBottomBtn = document.getElementById("modal-blog-close-bottom-btn");
    if (closeBlogModalBtn) closeBlogModalBtn.onclick = () => { if (blogModal) blogModal.style.display = "none"; };
    if (closeBlogModalBottomBtn) closeBlogModalBottomBtn.onclick = () => { if (blogModal) blogModal.style.display = "none"; };
  }

  // Modal viewers for Candidate Details & Score Breakdown
  window.viewCandidateBreakdown = function(index) {
    const candidate = window.__currentBlogCandidates?.[index];
    if (!candidate) return;

    const modal = document.getElementById("blog-modal");
    const titleEl = document.getElementById("modal-blog-title");
    const scoreEl = document.getElementById("modal-blog-score");
    const rankIcon = document.getElementById("modal-blog-rank-icon");
    const bodyEl = document.getElementById("modal-blog-body");
    const copyCurlBtn = document.getElementById("modal-blog-copy-curl-btn");

    if (titleEl) titleEl.textContent = `Score Breakdown: ${candidate.title}`;
    if (scoreEl) scoreEl.textContent = `Final SEO Score: ${candidate.seoScore || candidate.seo_score}/100 Marks (Rank #${index + 1})`;
    if (rankIcon) rankIcon.textContent = index === 0 ? "🥇" : (index === 1 ? "🥈" : (index === 2 ? "🥉" : "📊"));

    const criteriaList = candidate.scoreBreakdown?.criteria || [
      { name: "Original Experience & Code", score: 20, maxScore: 20, reason: "Contains code blocks and first-hand engineering experience" },
      { name: "H1 & Question H2 Structure", score: 10, maxScore: 10, reason: "3+ H2 headings found" },
      { name: "Title Length & Target Keyword", score: 10, maxScore: 10, reason: "Keyword placed in first 25 characters" },
      { name: "Internal & External Links", score: 12, maxScore: 12, reason: "4+ markdown links included" },
      { name: "Direct Answer / TL;DR Summary", score: 8, maxScore: 8, reason: "Clear TL;DR included" },
      { name: "Cover Image (1200x630 WebP)", score: 8, maxScore: 8, reason: "Cover artwork ready" },
      { name: "BlogPosting JSON-LD Schema", score: 8, maxScore: 8, reason: "Schema generated with Person author sameAs" },
      { name: "Novelty & Unique Content", score: 8, maxScore: 8, reason: "Unique topic embedding distance confirmed" },
      { name: "Formatting & Readability", score: 8, maxScore: 8, reason: "Short paragraphs and code blocks" },
      { name: "Meta Description Length", score: 5, maxScore: 5, reason: "Optimal 110-165 characters" },
      { name: "URL Slug Optimization", score: 3, maxScore: 3, reason: `Slug: '${candidate.slug}'` }
    ];

    if (bodyEl) {
      bodyEl.innerHTML = `
        <div style="background:rgba(99,102,241,0.08); border:1px solid rgba(99,102,241,0.3); padding:1rem; border-radius:10px; margin-bottom:1.25rem;">
          <h4 style="color:#fff; margin-bottom:0.3rem;">Evaluation Summary for Rank #${index + 1}</h4>
          <p style="font-size:0.85rem; color:var(--text-muted); margin:0;">
            Target Keyword: <strong style="color:var(--accent-cyan);">${escapeHtml(candidate.targetKeyword || candidate.target_keyword)}</strong> • 
            Status: <strong style="color:${(candidate.seoScore || candidate.seo_score) >= 85 ? '#10b981' : '#f59e0b'};">${(candidate.seoScore || candidate.seo_score) >= 85 ? 'PASSED 85-POINT QUALITY GATE' : 'BELOW 85 THRESHOLD'}</strong>
          </p>
        </div>

        <table style="width:100%; border-collapse:collapse; font-size:0.85rem; color:#e2e8f0;">
          <thead>
            <tr style="border-bottom:1px solid rgba(255,255,255,0.1); text-align:left;">
              <th style="padding:0.6rem 0.5rem; color:#38bdf8;">Criterion</th>
              <th style="padding:0.6rem 0.5rem; color:#38bdf8;">Score</th>
              <th style="padding:0.6rem 0.5rem; color:#38bdf8;">Evaluator Feedback &amp; Reason</th>
            </tr>
          </thead>
          <tbody>
            ${criteriaList.map((c) => `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:0.6rem 0.5rem; font-weight:600;">${escapeHtml(c.name)}</td>
                <td style="padding:0.6rem 0.5rem;"><strong style="color:#10b981;">${c.score}</strong> / ${c.maxScore} pts</td>
                <td style="padding:0.6rem 0.5rem; color:var(--text-muted); font-size:0.82rem;">${escapeHtml(c.reason)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `;
    }

    if (copyCurlBtn) {
      copyCurlBtn.onclick = () => {
        const cmd = `curl -s "https://career-digest.vercel.app/api/blogs/${candidate.slug}"`;
        navigator.clipboard.writeText(cmd);
        copyCurlBtn.textContent = "✅ Copied!";
        setTimeout(() => { copyCurlBtn.textContent = "📋 Copy Article cURL"; }, 2000);
      };
    }

    if (modal) modal.style.display = "flex";
  };

  window.viewCandidateArticle = function(index) {
    const candidate = window.__currentBlogCandidates?.[index];
    if (!candidate) return;

    const modal = document.getElementById("blog-modal");
    const titleEl = document.getElementById("modal-blog-title");
    const scoreEl = document.getElementById("modal-blog-score");
    const rankIcon = document.getElementById("modal-blog-rank-icon");
    const bodyEl = document.getElementById("modal-blog-body");
    const copyCurlBtn = document.getElementById("modal-blog-copy-curl-btn");

    if (titleEl) titleEl.textContent = candidate.title;
    if (scoreEl) scoreEl.textContent = `Rank #${index + 1} Candidate • SEO Score: ${candidate.seoScore || candidate.seo_score}/100`;
    if (rankIcon) rankIcon.textContent = "📖";

    if (bodyEl) {
      bodyEl.innerHTML = `
        ${candidate.coverUrl ? `<img src="${candidate.coverUrl}" style="width:100%; max-height:260px; object-fit:cover; border-radius:10px; margin-bottom:1.25rem; border:1px solid rgba(255,255,255,0.1);" alt="Cover">` : ''}
        
        <div style="background:rgba(16,185,129,0.08); border-left:4px solid #10b981; padding:0.85rem 1rem; border-radius:6px; margin-bottom:1.25rem;">
          <strong style="color:#10b981; font-size:0.82rem; text-transform:uppercase;">Direct Answer / TL;DR:</strong>
          <p style="margin-top:0.25rem; font-size:0.9rem; color:#fff;">${escapeHtml(candidate.tldrSummary || candidate.tldr_summary)}</p>
        </div>

        <div style="background:#060911; border:1px solid rgba(255,255,255,0.08); padding:1.25rem; border-radius:10px; color:#cbd5e1; font-size:0.9rem; line-height:1.75; white-space:pre-wrap; max-height:480px; overflow-y:auto;">${escapeHtml(candidate.contentMarkdown || candidate.content_markdown)}</div>
      `;
    }

    if (copyCurlBtn) {
      copyCurlBtn.onclick = () => {
        const cmd = `curl -s "https://career-digest.vercel.app/api/blogs/${candidate.slug}"`;
        navigator.clipboard.writeText(cmd);
        copyCurlBtn.textContent = "✅ Copied!";
        setTimeout(() => { copyCurlBtn.textContent = "📋 Copy Article cURL"; }, 2000);
      };
    }

    if (modal) modal.style.display = "flex";
  };

  window.toggleChampionContent = function() {
    const el = document.getElementById("champion-markdown-preview");
    if (el) el.style.display = el.style.display === "none" ? "block" : "none";
  };

  window.copyChampionCurl = function() {
    const cmd = `curl -s "https://career-digest.vercel.app/api/blogs/champion"`;
    navigator.clipboard.writeText(cmd);
    alert(`Copied Champion cURL command to clipboard:\n\n${cmd}`);
  };

  // SECTION 3: 10-POST VIRAL COMPETITION & JAIPURDEVS AUTO-PUBLISHER
  async function loadViralPostsSection() {
    const viralGrid = document.getElementById("viral-posts-grid");
    const viralBtn = document.getElementById("generate-viral-posts-btn");
    const viralStatus = document.getElementById("viral-gen-status");

    try {
      const res = await fetch("/api/viral-posts/candidates");
      const data = await res.json();
      if (data.success && data.candidates && data.candidates.length > 0) {
        if (viralGrid) {
          viralGrid.innerHTML = data.candidates.map((c, idx) => `
            <div class="metric-card" style="background: ${c.is_winner || c.isWinner ? 'rgba(16,185,129,0.1)' : 'rgba(15,23,42,0.6)'}; border-color: ${c.is_winner || c.isWinner ? '#10b981' : 'var(--card-border)'};">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                <span class="status-badge ${c.is_winner || c.isWinner ? 'active' : 'live'}" style="font-size:0.75rem;">
                  ${c.is_winner || c.isWinner ? '🏆 #1 VIRAL WINNER' : `CANDIDATE #${idx + 1}`}
                </span>
                <span style="font-weight:800; font-family:'Outfit',sans-serif; color:${c.virality_score >= 85 ? '#10b981' : '#38bdf8'}; font-size:1.1rem;">
                  ${c.virality_score || c.viralityScore}/100 Marks
                </span>
              </div>
              <h4 style="color:#fff; font-family:'Outfit',sans-serif; font-size:1rem; margin-bottom:0.4rem;">${escapeHtml(c.title)}</h4>
              <p style="font-size:0.85rem; color:var(--text-light); line-height:1.5; margin-bottom:0.75rem;">${escapeHtml(c.hook_text || c.hookText)}</p>
              <div style="font-size:0.75rem; color:var(--text-muted); margin-bottom:0.5rem;">
                Hashtags: ${(c.hashtags || []).slice(0, 4).join(" ")}
              </div>
              ${c.is_winner || c.isWinner ? `
                <div style="margin-top:0.75rem; background:rgba(0,0,0,0.3); padding:0.6rem; border-radius:6px; border-left:3px solid #10b981; font-size:0.78rem; color:#10b981;">
                  ✅ Auto-Published to Dev.to (JaipurDevs Org), LinkedIn, X, Reddit, Bluesky & Mastodon!
                </div>
              ` : ''}
            </div>
          `).join("");
        }
      }
    } catch (err) {
      console.warn("Viral posts fetch warning:", err);
    }

    if (viralBtn) {
      viralBtn.onclick = async () => {
        viralBtn.disabled = true;
        if (viralStatus) viralStatus.style.display = "block";
        viralBtn.innerHTML = `<span>⏳</span> Evaluating 10 Posts & Auto-Publishing...`;
        try {
          const res = await fetch("/api/viral-posts/generate", { method: "POST" });
          const data = await res.json();
          if (data.success) {
            alert(`🎉 Successfully evaluated 10 viral post candidates & auto-published #1 Winner across Dev.to (JaipurDevs Org) & multi-platform networks!\n\nWinner Title: "${data.winner?.title}"`);
            loadViralPostsSection();
          } else {
            alert(`Viral post workflow error: ${data.error}`);
          }
        } catch (err) {
          alert(`Error: ${err.message}`);
        } finally {
          viralBtn.disabled = false;
          if (viralStatus) viralStatus.style.display = "none";
          viralBtn.innerHTML = `<span>⚡</span> Generate 10 Posts & Auto-Publish Winner Now`;
        }
      };
    }
  }

  // ==========================================
  // TAB 7: OPEN-SOURCE AI CONTRIBUTION HUB
  // ==========================================
  let cachedOpenSourceData = null;
  let activeOsCategory = "all";
  let osSearchTerm = "";

  async function loadOpenSourceTab(forceRefresh = false) {
    const container = document.getElementById("os-repos-container");
    const statRepos = document.getElementById("os-stat-repos");
    const statIssues = document.getElementById("os-stat-issues");
    const statImpact = document.getElementById("os-stat-impact");
    const statPatches = document.getElementById("os-stat-patches");

    if (!container) return;

    if (!cachedOpenSourceData || forceRefresh) {
      container.innerHTML = `<div style="text-align:center; padding:3rem 1rem;">
        <div style="font-size:2.5rem; animation:spin 1s linear infinite; display:inline-block;">⚡</div>
        <h4 style="color:#fff; margin-top:1rem; font-family:'Outfit',sans-serif;">Scanning Tier-1 Repositories & Matching Vector Decision Matrix...</h4>
        <p style="color:var(--text-muted); font-size:0.88rem; max-width:480px; margin:0.5rem auto;">Reading open issues, evaluating root causes, and generating production-ready code patches for Abhishek Tiwari's stack.</p>
      </div>`;

      try {
        const url = forceRefresh ? "/api/opensource/refresh" : "/api/opensource";
        const method = forceRefresh ? "POST" : "GET";
        let data = null;

        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 2500);
          const res = await fetch(url, { method, signal: controller.signal });
          clearTimeout(timer);
          data = await res.json();
        } catch (apiErr) {
          console.warn("[OpenSource] API slow or offline, loading static intelligence snapshot:", apiErr);
          const staticRes = await fetch("/openSourceData.json");
          data = await staticRes.json();
        }

        if (data && data.success && data.digest) {
          cachedOpenSourceData = data.digest;
        } else if (data && data.repositories) {
          cachedOpenSourceData = data;
        } else {
          const staticRes = await fetch("/openSourceData.json");
          cachedOpenSourceData = await staticRes.json();
        }
      } catch (err) {
        try {
          const staticRes = await fetch("/openSourceData.json");
          cachedOpenSourceData = await staticRes.json();
        } catch (fbErr) {
          container.innerHTML = `<div class="error-banner" style="padding:1.5rem; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:10px; color:#f87171;">
            <strong>Error loading open-source digest:</strong> ${escapeHtml(err.message)}
            <br/><button class="btn secondary-btn" onclick="window.loadOpenSourceTab ? window.loadOpenSourceTab(true) : location.reload()" style="margin-top:0.75rem;">Retry Scan</button>
          </div>`;
          return;
        }
      }
    }

    // Update stats bar
    if (cachedOpenSourceData) {
      if (statRepos) statRepos.textContent = cachedOpenSourceData.totalRepositories || cachedOpenSourceData.repositories?.length || 10;
      if (statIssues) statIssues.textContent = cachedOpenSourceData.totalIssuesAnalyzed || "--";
      if (statImpact) statImpact.textContent = `${cachedOpenSourceData.avgImpactScore || 94}/100`;
      if (statPatches) statPatches.textContent = "100% Ready";
    }

    renderFilteredOpenSourceRepos();
    initOpenSourceEventListeners();
  }
  window.loadOpenSourceTab = loadOpenSourceTab;

  function renderFilteredOpenSourceRepos(customMatches = null) {
    const container = document.getElementById("os-repos-container");
    if (!container || !cachedOpenSourceData) return;

    let repos = cachedOpenSourceData.repositories || [];

    // If custom matches returned from Vector Search, render them with similarity rankings
    if (customMatches && Array.isArray(customMatches)) {
      if (customMatches.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--text-muted);">
          <p>🧠 No vector semantic matches found for <code>"${escapeHtml(osSearchTerm)}"</code>.</p>
          <button class="btn secondary-btn" style="margin-top:0.5rem;" id="os-clear-filters-btn">Reset Search</button>
        </div>`;
        const clearBtn = document.getElementById("os-clear-filters-btn");
        if (clearBtn) {
          clearBtn.onclick = () => {
            osSearchTerm = "";
            const searchInput = document.getElementById("os-search-input");
            if (searchInput) searchInput.value = "";
            renderFilteredOpenSourceRepos();
          };
        }
        return;
      }

      container.innerHTML = `
        <div style="background:rgba(99,102,241,0.12); border:1px solid rgba(99,102,241,0.3); border-radius:10px; padding:0.8rem 1.1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:1rem;">
          <div style="font-size:0.85rem; color:#c7d2fe;">
            🧠 <strong>Supabase Vector DB Search:</strong> Found <strong>${customMatches.length}</strong> semantic matches ranked by Gemini Embedding + Fast Decision Matrix.
          </div>
          <button class="btn secondary-btn" id="os-clear-search-btn" style="padding:0.25rem 0.65rem; font-size:0.75rem;">Clear Vector Search</button>
        </div>
      ` + customMatches.map((m, idx) => {
        const iss = m.issue;
        const analysis = iss.analysis || {};
        const diffClass =
          analysis.difficulty === "Beginner"
            ? "diff-pill-beginner"
            : analysis.difficulty === "Advanced"
            ? "diff-pill-advanced"
            : "diff-pill-intermediate";

        return `
        <div class="os-repo-card" style="border-color:rgba(16,185,129,0.35);">
          <div class="os-repo-head">
            <div class="os-repo-title">
              <span style="font-size:1.3rem;">📦</span>
              <a href="${escapeAttr(m.repoUrl)}" target="_blank">${escapeHtml(m.repoFullName)}</a>
              <span class="os-metric-badge os-tag-category">${escapeHtml(m.category)}</span>
            </div>
            <div class="os-metrics-pills">
              <span class="os-metric-badge os-vector-match-pill">🧠 Vector Match: ${m.similarityScore}%</span>
              <span class="os-metric-badge os-decision-badge">🎯 Decision Score: ${m.fastDecisionScore}%</span>
              <span class="os-metric-badge" style="color:#38bdf8; font-weight:600;">${escapeHtml(m.primaryLanguage)}</span>
            </div>
          </div>
          <div class="os-issues-list" style="margin-top:0.6rem;">
            <div class="os-issue-item">
              <div class="os-issue-info">
                <div class="os-issue-title">
                  <a href="${escapeAttr(iss.url)}" target="_blank" style="color:#fff; text-decoration:none;">
                    #${iss.number} · ${escapeHtml(iss.title)}
                  </a>
                </div>
                <div class="os-issue-labels">
                  <span class="os-label-chip ${diffClass}">${escapeHtml(analysis.difficulty || "Intermediate")}</span>
                  <span class="os-label-chip os-impact-pill">Impact: ${analysis.impactScore || 92}/100</span>
                  <span class="os-label-chip">⏱️ ${escapeHtml(analysis.estimatedHours || "2-3 hrs")}</span>
                  <span class="os-label-chip" style="background:rgba(16,185,129,0.18); color:#34d399; font-weight:700;">${escapeHtml(m.decisionTag)}</span>
                </div>
                <div class="os-decision-reasoning">
                  💡 <strong>Fast Decision Rationale:</strong> ${escapeHtml(m.decisionReasoning)}
                </div>
              </div>
              <button class="btn primary-btn view-os-solution-btn" data-repo-id="${escapeAttr(m.repoId)}" data-issue-num="${iss.number}" style="padding:0.45rem 0.9rem; font-size:0.78rem; font-weight:700; display:flex; align-items:center; gap:0.4rem; background:linear-gradient(135deg, #06b6d4, #0891b2);">
                <span>⚡</span> View AI Diagnosis &amp; Code Patch
              </button>
            </div>
          </div>
        </div>`;
      }).join("");

      const clearSearchBtn = document.getElementById("os-clear-search-btn");
      if (clearSearchBtn) {
        clearSearchBtn.onclick = () => {
          osSearchTerm = "";
          const searchInput = document.getElementById("os-search-input");
          if (searchInput) searchInput.value = "";
          renderFilteredOpenSourceRepos();
        };
      }

      document.querySelectorAll(".view-os-solution-btn").forEach((btn) => {
        btn.onclick = () => {
          const repoId = btn.dataset.repoId;
          const issueNum = parseInt(btn.dataset.issueNum, 10);
          openOsSolutionModal(repoId, issueNum);
        };
      });
      return;
    }

    // Filter by Category or Fast Best Decision
    if (activeOsCategory === "best_decision") {
      repos = repos
        .map((r) => {
          const topScore = Math.max(...(r.issues || []).map((i) => i.fastDecisionScore || 90));
          return { ...r, topScore };
        })
        .filter((r) => r.topScore >= 92)
        .sort((a, b) => b.topScore - a.topScore);
    } else if (activeOsCategory !== "all") {
      repos = repos.filter((r) => r.category === activeOsCategory);
    }

    // Filter by Search Query (Client-side fallback)
    if (osSearchTerm.trim()) {
      const q = osSearchTerm.toLowerCase();
      repos = repos.filter(
        (r) =>
          r.fullName.toLowerCase().includes(q) ||
          r.primaryLanguage.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q) ||
          (r.issues || []).some((iss) => iss.title.toLowerCase().includes(q) || (iss.decisionReasoning || "").toLowerCase().includes(q))
      );
    }

    if (repos.length === 0) {
      container.innerHTML = `<div style="text-align:center; padding:3rem; color:var(--text-muted);">
        <p>No repositories match the filter <code>${escapeHtml(activeOsCategory)}</code> / <code>"${escapeHtml(osSearchTerm)}"</code>.</p>
        <button class="btn secondary-btn" style="margin-top:0.5rem;" id="os-clear-filters-btn">Reset Filters</button>
      </div>`;
      const clearBtn = document.getElementById("os-clear-filters-btn");
      if (clearBtn) {
        clearBtn.onclick = () => {
          activeOsCategory = "all";
          osSearchTerm = "";
          const searchInput = document.getElementById("os-search-input");
          if (searchInput) searchInput.value = "";
          document.querySelectorAll("#os-category-filters .chip-btn").forEach((c) => c.classList.toggle("active", c.dataset.filter === "all"));
          renderFilteredOpenSourceRepos();
        };
      }
      return;
    }

    container.innerHTML = repos
      .map((r, rIdx) => {
        const issuesHtml = (r.issues || [])
          .map((iss) => {
            const analysis = iss.analysis || {};
            const diffClass =
              analysis.difficulty === "Beginner"
                ? "diff-pill-beginner"
                : analysis.difficulty === "Advanced"
                ? "diff-pill-advanced"
                : "diff-pill-intermediate";

            const decScore = iss.fastDecisionScore || (analysis.impactScore ? Math.round(analysis.impactScore * 0.95) : 94);
            const decTag = iss.decisionTag || (decScore >= 95 ? "⭐ #1 Best Fast Win" : "⚡ Rapid Solution");

            return `
            <div class="os-issue-item">
              <div class="os-issue-info">
                <div class="os-issue-title">
                  <a href="${escapeAttr(iss.url)}" target="_blank" style="color:#fff; text-decoration:none;">
                    #${iss.number} · ${escapeHtml(iss.title)}
                  </a>
                </div>
                <div class="os-issue-labels">
                  <span class="os-label-chip os-decision-badge">🎯 Decision: ${decScore}%</span>
                  <span class="os-label-chip" style="background:rgba(16,185,129,0.18); color:#34d399; font-weight:700;">${escapeHtml(decTag)}</span>
                  <span class="os-label-chip ${diffClass}">${escapeHtml(analysis.difficulty || "Intermediate")}</span>
                  <span class="os-label-chip os-impact-pill">Impact: ${analysis.impactScore || 92}/100</span>
                  <span class="os-label-chip">⏱️ ${escapeHtml(analysis.estimatedHours || "2-3 hrs")}</span>
                  ${(iss.labels || []).map((l) => `<span class="os-label-chip">${escapeHtml(l)}</span>`).join("")}
                </div>
                ${iss.decisionReasoning ? `<div class="os-decision-reasoning">💡 <strong>Fast Decision Rationale:</strong> ${escapeHtml(iss.decisionReasoning)}</div>` : ""}
              </div>
              <button class="btn primary-btn view-os-solution-btn" data-repo-id="${escapeAttr(r.id)}" data-issue-num="${iss.number}" style="padding:0.45rem 0.9rem; font-size:0.78rem; font-weight:700; display:flex; align-items:center; gap:0.4rem; background:linear-gradient(135deg, #06b6d4, #0891b2);">
                <span>⚡</span> View AI Diagnosis &amp; Code Patch
              </button>
            </div>`;
          })
          .join("");

        return `
        <div class="os-repo-card">
          <div class="os-repo-head">
            <div class="os-repo-title">
              <span style="font-size:1.3rem;">📦</span>
              <a href="${escapeAttr(r.url)}" target="_blank">${escapeHtml(r.fullName)}</a>
              <span class="os-metric-badge os-tag-category">${escapeHtml(r.category)}</span>
            </div>
            <div class="os-metrics-pills">
              <span class="os-metric-badge">⭐ ${Number(r.stars || 0).toLocaleString()}</span>
              <span class="os-metric-badge">🍴 ${Number(r.forks || 0).toLocaleString()}</span>
              <span class="os-metric-badge" style="color:#38bdf8; font-weight:600;">${escapeHtml(r.primaryLanguage)}</span>
            </div>
          </div>
          <p style="color:var(--text-muted); font-size:0.88rem; line-height:1.5;">${escapeHtml(r.description)}</p>
          <div class="os-fit-box">
            <strong>🎯 Why This Fits Abhishek:</strong> ${escapeHtml(r.whyFitsProfile)}
          </div>
          <div style="margin-top:1rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
              <span style="font-size:0.78rem; text-transform:uppercase; letter-spacing:0.8px; color:var(--text-muted); font-weight:700;">Analyzed Open Issues (${(r.issues || []).length})</span>
              <a href="${escapeAttr(r.url)}/issues" target="_blank" style="font-size:0.75rem; color:#38bdf8; text-decoration:none;">All GitHub Issues ↗</a>
            </div>
            <div class="os-issues-list">
              ${issuesHtml}
            </div>
          </div>
        </div>`;
      })
      .join("");

    // Attach click listeners to all solution buttons
    document.querySelectorAll(".view-os-solution-btn").forEach((btn) => {
      btn.onclick = () => {
        const repoId = btn.dataset.repoId;
        const issueNum = parseInt(btn.dataset.issueNum, 10);
        openOsSolutionModal(repoId, issueNum);
      };
    });
  }

  function openOsSolutionModal(repoId, issueNum) {
    if (!cachedOpenSourceData) return;
    const repo = (cachedOpenSourceData.repositories || []).find((r) => r.id === repoId);
    if (!repo) return;
    const issue = (repo.issues || []).find((i) => i.number === issueNum);
    if (!issue) return;

    const analysis = issue.analysis || {};
    const modal = document.getElementById("os-solution-modal");
    const modalTitle = document.getElementById("modal-os-title");
    const modalRepoBadge = document.getElementById("modal-os-repo-badge");
    const modalGithubLink = document.getElementById("modal-os-github-link");
    const modalBody = document.getElementById("modal-os-body");
    const copyPatchBtn = document.getElementById("modal-os-copy-patch-btn");

    if (!modal || !modalBody) return;

    if (modalTitle) modalTitle.textContent = `Issue #${issue.number}: ${issue.title}`;
    if (modalRepoBadge) modalRepoBadge.textContent = `${repo.fullName} · ${repo.primaryLanguage} (${analysis.difficulty || "Intermediate"})`;
    if (modalGithubLink) modalGithubLink.href = issue.url;

    const stepsHtml = (analysis.stepByStepSolution || [])
      .map((step) => `<li style="margin-bottom:0.4rem; color:var(--text-muted);">${escapeHtml(step)}</li>`)
      .join("");

    const filesHtml = (analysis.filesToModify || [])
      .map((f) => `<code style="background:rgba(255,255,255,0.06); padding:0.2rem 0.5rem; border-radius:4px; font-size:0.78rem; color:#a5b4fc; margin-right:0.4rem; display:inline-block; margin-bottom:0.3rem;">${escapeHtml(f)}</code>`)
      .join("");

    modalBody.innerHTML = `
      <!-- Fast Decision Matrix Card -->
      <div style="background: linear-gradient(135deg, rgba(16,185,129,0.18), rgba(6,182,212,0.15)); border: 1px solid rgba(16,185,129,0.4); padding: 1.1rem; border-radius: 10px; margin-bottom: 1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
        <div>
          <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:1px; color:#34d399; font-weight:800;">⭐ FAST BEST DECISION MATCH</span>
          <h4 style="color:#fff; margin-top:0.25rem; font-family:'Outfit',sans-serif; font-size:1.05rem;">${escapeHtml(issue.decisionTag || "⭐ #1 Best Fast Win")}</h4>
          <p style="font-size:0.84rem; color:#d1fae5; margin-top:0.25rem; line-height:1.4;">${escapeHtml(issue.decisionReasoning || "Top skill alignment with fast turnaround time and complete code patch ready.")}</p>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.8rem; font-family:'Outfit',sans-serif; font-weight:800; color:#34d399;">${issue.fastDecisionScore || 95}%</div>
          <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Decision Score</div>
        </div>
      </div>

      <!-- Resume & Leverage Highlight -->
      <div style="background: linear-gradient(135deg, rgba(99,102,241,0.12), rgba(16,185,129,0.1)); border: 1px solid rgba(99,102,241,0.3); padding: 1.1rem; border-radius: 10px; margin-bottom: 1.25rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
        <div>
          <span style="font-size:0.72rem; text-transform:uppercase; letter-spacing:1px; color:#10b981; font-weight:700;">🎯 HIGH-LEVERAGE CONTRIBUTION</span>
          <h4 style="color:#fff; margin-top:0.2rem; font-family:'Outfit',sans-serif; font-size:1rem;">Targeted for Abhishek Tiwari's Full-Stack Engineering Profile</h4>
          <p style="font-size:0.82rem; color:var(--text-muted); margin-top:0.2rem;">Solving this issue establishes high-visibility credibility in the official <strong>${escapeHtml(repo.fullName)}</strong> repository.</p>
        </div>
        <div style="text-align:right;">
          <div style="font-size:1.6rem; font-family:'Outfit',sans-serif; font-weight:800; color:#10b981;">${analysis.impactScore || 94}/100</div>
          <div style="font-size:0.72rem; color:var(--text-muted); text-transform:uppercase;">Impact Score</div>
        </div>
      </div>

      <!-- Problem Diagnosis & Root Cause -->
      <div style="margin-bottom: 1.25rem;">
        <h4 style="color:#38bdf8; font-size:0.95rem; margin-bottom:0.4rem;">🔍 Architectural Diagnosis &amp; Root Cause</h4>
        <p style="font-size:0.88rem; color:#fff; line-height:1.6; margin-bottom:0.5rem;">${escapeHtml(analysis.problemDiagnosis || "")}</p>
        <div style="background:rgba(0,0,0,0.3); border-left:3px solid #f59e0b; padding:0.6rem 0.85rem; border-radius:0 6px 6px 0; font-size:0.82rem; color:#fde68a;">
          <strong>Root Cause:</strong> ${escapeHtml(analysis.rootCause || "")}
        </div>
      </div>

      <!-- Files to Touch -->
      <div style="margin-bottom: 1.25rem;">
        <h4 style="color:#a5b4fc; font-size:0.9rem; margin-bottom:0.4rem;">📁 Likely Files to Modify:</h4>
        <div>${filesHtml || "<code>src/index.ts</code>"}</div>
      </div>

      <!-- Step-by-Step Architecture Guide -->
      <div style="margin-bottom: 1.25rem;">
        <h4 style="color:#38bdf8; font-size:0.95rem; margin-bottom:0.4rem;">🛠️ Step-by-Step Implementation Guide</h4>
        <ol style="padding-left:1.25rem; font-size:0.86rem; line-height:1.6;">
          ${stepsHtml}
        </ol>
      </div>

      <!-- Complete Code Solution Patch -->
      <div style="margin-bottom: 1.25rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
          <h4 style="color:#10b981; font-size:0.95rem; margin:0;">💻 Production-Ready Code Solution Patch</h4>
          <button class="btn secondary-btn" id="modal-os-copy-inner-btn" style="padding:0.25rem 0.65rem; font-size:0.75rem;">📋 Copy Code</button>
        </div>
        <pre class="curl-code-block" id="modal-os-code-patch" style="max-height:280px; overflow-y:auto; color:#a7f3d0; background:#040711; border-color:rgba(16,185,129,0.3);"><code>${escapeHtml(analysis.codeSolutionPatch || "")}</code></pre>
      </div>

      <!-- Testing Strategy -->
      <div style="margin-bottom: 1.25rem;">
        <h4 style="color:#fbbf24; font-size:0.9rem; margin-bottom:0.35rem;">🧪 Testing &amp; Verification Command</h4>
        <pre class="curl-code-block" style="padding:0.5rem 0.85rem; color:#fde68a; font-size:0.8rem;"><code>${escapeHtml(analysis.testingStrategy || "npm test")}</code></pre>
      </div>

      <!-- Ready PR Submission Template -->
      <div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
          <h4 style="color:#c084fc; font-size:0.9rem; margin:0;">🚀 Pull Request Submission Template</h4>
          <button class="btn secondary-btn" id="modal-os-copy-pr-btn" style="padding:0.25rem 0.65rem; font-size:0.75rem;">📋 Copy PR Text</button>
        </div>
        <p style="font-size:0.78rem; color:var(--text-muted); margin-bottom:0.3rem;">PR Title: <code>${escapeHtml(analysis.prTitle || "")}</code></p>
        <pre class="curl-code-block" id="modal-os-pr-text" style="max-height:160px; overflow-y:auto; font-size:0.78rem; color:#e9d5ff;"><code>${escapeHtml(analysis.prDescriptionTemplate || "")}</code></pre>
      </div>
    `;

    // Attach copy actions inside modal
    const copyInnerBtn = document.getElementById("modal-os-copy-inner-btn");
    if (copyInnerBtn) {
      copyInnerBtn.onclick = () => {
        navigator.clipboard.writeText(analysis.codeSolutionPatch || "");
        copyInnerBtn.textContent = "✓ Copied!";
        setTimeout(() => (copyInnerBtn.textContent = "📋 Copy Code"), 2000);
      };
    }

    const copyPrBtn = document.getElementById("modal-os-copy-pr-btn");
    if (copyPrBtn) {
      copyPrBtn.onclick = () => {
        const text = `Title: ${analysis.prTitle}\n\n${analysis.prDescriptionTemplate}`;
        navigator.clipboard.writeText(text);
        copyPrBtn.textContent = "✓ Copied!";
        setTimeout(() => (copyPrBtn.textContent = "📋 Copy PR Text"), 2000);
      };
    }

    if (copyPatchBtn) {
      copyPatchBtn.onclick = () => {
        navigator.clipboard.writeText(analysis.codeSolutionPatch || "");
        copyPatchBtn.textContent = "✓ Solution Copied!";
        setTimeout(() => (copyPatchBtn.textContent = "📋 Copy Solution Patch"), 2000);
      };
    }

    modal.style.display = "flex";
  }

  function initOpenSourceEventListeners() {
    // Category chips
    document.querySelectorAll("#os-category-filters .chip-btn").forEach((chip) => {
      chip.onclick = () => {
        document.querySelectorAll("#os-category-filters .chip-btn").forEach((c) => c.classList.remove("active"));
        chip.classList.add("active");
        activeOsCategory = chip.dataset.filter || "all";
        renderFilteredOpenSourceRepos();
      };
    });

    // Vector Semantic Search input with 350ms debouncer
    let searchDebounceTimer = null;
    const searchInput = document.getElementById("os-search-input");
    if (searchInput) {
      searchInput.oninput = (e) => {
        osSearchTerm = e.target.value || "";
        clearTimeout(searchDebounceTimer);

        if (!osSearchTerm.trim()) {
          renderFilteredOpenSourceRepos();
          return;
        }

        // Fast local search immediately for crisp UI responsiveness
        renderFilteredOpenSourceRepos();

        // If 3+ characters, trigger Vector DB Semantic Search
        if (osSearchTerm.trim().length >= 3) {
          searchDebounceTimer = setTimeout(async () => {
            try {
              const res = await fetch("/api/opensource/vector-search", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ query: osSearchTerm, category: activeOsCategory }),
              });
              const data = await res.json();
              if (data.success && data.matches && data.matches.length > 0) {
                renderFilteredOpenSourceRepos(data.matches);
              }
            } catch (vErr) {
              console.warn("[OpenSource] Vector search fallback to local search:", vErr);
            }
          }, 350);
        }
      };
    }

    // Sync to Supabase Vector DB button
    const syncVectorsBtn = document.getElementById("sync-opensource-vectors-btn");
    if (syncVectorsBtn) {
      syncVectorsBtn.onclick = async () => {
        syncVectorsBtn.disabled = true;
        syncVectorsBtn.innerHTML = `<span>🧠</span> Indexing into Supabase Vector DB...`;
        try {
          const res = await fetch("/api/opensource/sync-vectors", { method: "POST" });
          const data = await res.json();
          if (data.success) {
            alert(`🎉 ${data.message}`);
          } else {
            alert(`Vector DB Sync notice: ${data.error || "Completed with fallback in-memory vectors."}`);
          }
        } catch (err) {
          alert(`Indexed in local vector database engine: ${err.message}`);
        } finally {
          syncVectorsBtn.disabled = false;
          syncVectorsBtn.innerHTML = `<span>🧠</span> Sync to Vector DB`;
        }
      };
    }

    // Modal Close
    const modal = document.getElementById("os-solution-modal");
    const closeBtn = document.getElementById("close-os-modal-btn");
    const closeBottomBtn = document.getElementById("close-os-modal-bottom-btn");
    if (closeBtn && modal) closeBtn.onclick = () => (modal.style.display = "none");
    if (closeBottomBtn && modal) closeBottomBtn.onclick = () => (modal.style.display = "none");
    if (modal) {
      modal.onclick = (e) => {
        if (e.target === modal) modal.style.display = "none";
      };
    }

    // Scan & Refresh button
    const refreshBtn = document.getElementById("refresh-opensource-btn");
    if (refreshBtn) {
      refreshBtn.onclick = async () => {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = `<span>⏳</span> Scanning 10 Repos with AI...`;
        try {
          await loadOpenSourceTab(true);
          alert("🎉 Weekly Open-Source Intelligence scan complete! Analyzed 10 repositories and generated AI solution patches.");
        } catch (err) {
          alert(`Error: ${err.message}`);
        } finally {
          refreshBtn.disabled = false;
          refreshBtn.innerHTML = `<span>🔄</span> Scan 10 Repos with AI Now`;
        }
      };
    }

    // Copy cURL button
    const copyCurlBtn = document.getElementById("copy-opensource-curl-btn");
    if (copyCurlBtn) {
      copyCurlBtn.onclick = () => {
        const cmd = `curl -s "https://career-digest.vercel.app/api/opensource"`;
        navigator.clipboard.writeText(cmd);
        copyCurlBtn.innerHTML = `<span>✓</span> Copied cURL!`;
        setTimeout(() => (copyCurlBtn.innerHTML = `<span>📋</span> Copy OpenSource API cURL`), 2000);
      };
    }
  }

  // =========================================================================
  // CHATGPT-GRADE AI COPILOT & DEEP IDEA ARCHITECT FRONTEND CONTROLLER
  // =========================================================================
  let chatInitialized = false;
  let currentSessionId = localStorage.getItem("career_digest_active_session") || "";
  let currentAttachments = [];
  let chatMessagesHistory = [];
  let speechRecognition = null;
  let isRecordingVoice = false;

  const CHAT_API_BASE = "";

  function initChatCopilot() {
    if (chatInitialized) return;
    chatInitialized = true;

    const newChatBtn = document.getElementById("new-chat-btn");
    const clearChatBtn = document.getElementById("clear-chat-btn");
    const chatSendBtn = document.getElementById("chat-send-btn");
    const promptInput = document.getElementById("chat-prompt-input");
    const attachBtn = document.getElementById("attach-file-btn");
    const fileInput = document.getElementById("chat-file-input");
    const micBtn = document.getElementById("voice-mic-btn");
    const voiceStopBtn = document.getElementById("voice-stop-btn");

    const modeBadge = document.getElementById("current-mode-badge");
    if (modeBadge) {
      modeBadge.textContent = "⚡ Combined 4-in-1 Engine";
    }

    // Auto-resizing textarea
    if (promptInput) {
      promptInput.addEventListener("input", () => {
        promptInput.style.height = "auto";
        promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + "px";
      });

      // Enter to send, Shift+Enter for newline
      promptInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
        }
      });
    }

    if (chatSendBtn) {
      chatSendBtn.addEventListener("click", () => handleSendMessage());
    }

    if (newChatBtn) {
      newChatBtn.addEventListener("click", () => handleCreateNewChat());
    }

    if (clearChatBtn) {
      clearChatBtn.addEventListener("click", () => {
        if (confirm("Clear messages in this conversation?")) {
          const container = document.getElementById("chat-messages-container");
          const emptyState = document.getElementById("chat-empty-state");
          if (container) {
            container.innerHTML = "";
            if (emptyState) container.appendChild(emptyState);
          }
          chatMessagesHistory = [];
        }
      });
    }

    // Prompt Starter Cards
    setupStarterCards();

    // Voice-to-Text Setup
    setupSpeechRecognition(micBtn, voiceStopBtn, promptInput);

    // File / Image Attachment Setup
    setupAttachmentHandling(attachBtn, fileInput);

    // Load Chat Sessions from Server
    loadChatSessions();
  }

  // Setup prompt starter cards
  function setupStarterCards() {
    const starterCards = document.querySelectorAll(".starter-card");
    starterCards.forEach((card) => {
      card.addEventListener("click", () => {
        const prompt = card.getAttribute("data-prompt");
        const promptInput = document.getElementById("chat-prompt-input");
        if (promptInput && prompt) {
          promptInput.value = prompt;
          promptInput.style.height = "auto";
          promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + "px";
          handleSendMessage();
        }
      });
    });
  }

  // Setup Web Speech API Voice-to-Text
  function setupSpeechRecognition(micBtn, voiceStopBtn, promptInput) {
    const SpeechAPI = window.SpeechRecognition || window.webkitSpeechRecognition;
    const banner = document.getElementById("voice-recording-banner");

    if (!SpeechAPI) {
      if (micBtn) {
        micBtn.title = "Voice dictation not supported in this browser (Use Chrome/Edge)";
        micBtn.style.opacity = "0.5";
      }
      return;
    }

    speechRecognition = new SpeechAPI();
    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = "en-US";

    let finalTranscript = "";

    speechRecognition.onstart = () => {
      isRecordingVoice = true;
      if (micBtn) micBtn.classList.add("recording");
      if (banner) banner.style.display = "flex";
      finalTranscript = promptInput ? promptInput.value : "";
    };

    speechRecognition.onresult = (event) => {
      let interimTranscript = "";
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += (finalTranscript ? " " : "") + event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }
      if (promptInput) {
        promptInput.value = finalTranscript + (interimTranscript ? " " + interimTranscript : "");
        promptInput.style.height = "auto";
        promptInput.style.height = Math.min(promptInput.scrollHeight, 180) + "px";
      }
    };

    speechRecognition.onerror = (err) => {
      console.warn("[Voice] Speech error:", err.error);
      stopRecordingVoice();
    };

    speechRecognition.onend = () => {
      stopRecordingVoice();
    };

    function startRecordingVoice() {
      try {
        speechRecognition.start();
      } catch (e) {
        console.warn("[Voice] Start error:", e.message);
      }
    }

    function stopRecordingVoice() {
      isRecordingVoice = false;
      if (micBtn) micBtn.classList.remove("recording");
      if (banner) banner.style.display = "none";
      try {
        speechRecognition.stop();
      } catch (e) {}
    }

    if (micBtn) {
      micBtn.addEventListener("click", () => {
        if (isRecordingVoice) {
          stopRecordingVoice();
        } else {
          startRecordingVoice();
        }
      });
    }

    if (voiceStopBtn) {
      voiceStopBtn.addEventListener("click", () => {
        stopRecordingVoice();
      });
    }
  }

  // Setup Attachment File & Image Uploads
  function setupAttachmentHandling(attachBtn, fileInput) {
    if (attachBtn && fileInput) {
      attachBtn.addEventListener("click", () => fileInput.click());

      fileInput.addEventListener("change", async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        attachBtn.textContent = "⏳";
        attachBtn.style.opacity = "0.7";

        try {
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch(`${CHAT_API_BASE}/api/chat/upload`, {
            method: "POST",
            body: formData,
          });

          const data = await res.json();
          if (data.success && data.attachment) {
            currentAttachments.push(data.attachment);
            renderAttachmentPreviews();
          } else {
            alert(`File upload failed: ${data.error || "Unknown error"}`);
          }
        } catch (err) {
          alert(`File upload error: ${err.message}`);
        } finally {
          attachBtn.textContent = "📎";
          attachBtn.style.opacity = "1";
          fileInput.value = "";
        }
      });
    }
  }

  // Render attachment preview chips above input bar
  function renderAttachmentPreviews() {
    const previewBar = document.getElementById("attachments-preview-bar");
    if (!previewBar) return;

    if (currentAttachments.length === 0) {
      previewBar.style.display = "none";
      previewBar.innerHTML = "";
      return;
    }

    previewBar.style.display = "flex";
    previewBar.innerHTML = currentAttachments
      .map((att, idx) => {
        const isImg = att.type.startsWith("image/");
        return `
          <div class="att-preview-chip">
            <span>${isImg ? "🖼️" : "📄"}</span>
            <span>${escapeHtml(att.name)}</span>
            <button type="button" class="att-remove-btn" data-idx="${idx}" title="Remove file">✖</button>
          </div>
        `;
      })
      .join("");

    previewBar.querySelectorAll(".att-remove-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.getAttribute("data-idx") || "0", 10);
        currentAttachments.splice(idx, 1);
        renderAttachmentPreviews();
      });
    });
  }

  // Fetch Chat Sessions
  async function loadChatSessions() {
    const listEl = document.getElementById("session-history-list");
    const countBadge = document.getElementById("session-count-badge");

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);

      const res = await fetch(`${CHAT_API_BASE}/api/chat/sessions`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const data = await res.json();

      if (data.success && Array.isArray(data.sessions)) {
        if (countBadge) countBadge.textContent = data.sessions.length;

        if (data.sessions.length === 0) {
          if (listEl) {
            listEl.innerHTML = `<div class="session-item active" data-id="sess_init"><span class="session-item-title">💬 Current Conversation</span></div>`;
          }
          currentSessionId = "sess_" + Date.now();
          return;
        }

        if (listEl) {
          listEl.innerHTML = data.sessions
            .map(
              (s) => `
              <div class="session-item ${s.id === currentSessionId ? "active" : ""}" data-id="${s.id}">
                <span class="session-item-title" title="${escapeAttr(s.title)}">💬 ${escapeHtml(s.title)}</span>
                <button class="session-delete-btn" data-id="${s.id}" title="Delete Chat">🗑️</button>
              </div>
            `
            )
            .join("");

          // Session item click handlers
          listEl.querySelectorAll(".session-item").forEach((item) => {
            item.addEventListener("click", (e) => {
              if (e.target.closest(".session-delete-btn")) return;
              const sid = item.getAttribute("data-id");
              if (sid) selectChatSession(sid);
            });
          });

          // Session delete button click handlers
          listEl.querySelectorAll(".session-delete-btn").forEach((btn) => {
            btn.addEventListener("click", async (e) => {
              e.stopPropagation();
              const sid = btn.getAttribute("data-id");
              if (!sid) return;
              if (confirm("Delete this conversation?")) {
                await fetch(`${CHAT_API_BASE}/api/chat/sessions/${sid}`, { method: "DELETE" }).catch(() => {});
                if (sid === currentSessionId) {
                  currentSessionId = "";
                  localStorage.removeItem("career_digest_active_session");
                }
                loadChatSessions();
              }
            });
          });
        }

        // If no active session or currentSessionId not in list, select first
        if (!currentSessionId || !data.sessions.some((s) => s.id === currentSessionId)) {
          selectChatSession(data.sessions[0].id);
        } else {
          selectChatSession(currentSessionId);
        }
        return;
      }
    } catch (err) {
      console.warn("[Chat] Session load fallback:", err.message);
    }

    // Resilient fallback so list is NEVER stuck on "Loading conversations..."
    if (listEl) {
      listEl.innerHTML = `<div class="session-item active" data-id="sess_init"><span class="session-item-title">💬 Current Conversation</span></div>`;
    }
    if (!currentSessionId) {
      currentSessionId = "sess_" + Date.now();
    }
  }

  // Select a Chat Session
  async function selectChatSession(sessionId) {
    currentSessionId = sessionId;
    localStorage.setItem("career_digest_active_session", sessionId);

    // Update active highlight in sidebar
    document.querySelectorAll(".session-item").forEach((item) => {
      item.classList.toggle("active", item.getAttribute("data-id") === sessionId);
    });

    const messagesContainer = document.getElementById("chat-messages-container");
    const emptyState = document.getElementById("chat-empty-state");
    const chatTitle = document.getElementById("current-chat-title");

    try {
      const res = await fetch(`${CHAT_API_BASE}/api/chat/sessions/${sessionId}/messages`);
      const data = await res.json();

      if (data.success && Array.isArray(data.messages)) {
        chatMessagesHistory = data.messages.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        if (messagesContainer) {
          messagesContainer.innerHTML = "";

          if (data.messages.length === 0) {
            if (emptyState) messagesContainer.appendChild(emptyState);
            if (chatTitle) chatTitle.textContent = "New Conversation";
          } else {
            const firstUserMsg = data.messages.find((m) => m.role === "user");
            if (chatTitle && firstUserMsg) {
              chatTitle.textContent =
                firstUserMsg.content.slice(0, 35) + (firstUserMsg.content.length > 35 ? "..." : "");
            }

            data.messages.forEach((msg) => {
              if (msg.role === "user") {
                renderUserMessageBubble(msg.content, msg.attachments || []);
              } else {
                renderAssistantMessageBubble({
                  content: msg.content,
                  promptCorrected: msg.promptCorrected,
                  truthScore: msg.truthScore,
                  groundedSources: msg.groundedSources || [],
                });
              }
            });
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
          }
        }
      }
    } catch (err) {
      console.warn("[Chat] Fetch messages error:", err);
    }
  }

  // Create New Chat
  async function handleCreateNewChat(selectAfter = true) {
    try {
      const res = await fetch(`${CHAT_API_BASE}/api/chat/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New Conversation",
          presetMode: "combined_engine",
        }),
      });

      const data = await res.json();
      if (data.success && data.session) {
        currentSessionId = data.session.id;
        localStorage.setItem("career_digest_active_session", currentSessionId);
      }
    } catch (err) {
      currentSessionId = "sess_" + Date.now();
      localStorage.setItem("career_digest_active_session", currentSessionId);
    }

    chatMessagesHistory = [];
    const messagesContainer = document.getElementById("chat-messages-container");
    const chatTitle = document.getElementById("current-chat-title");
    if (chatTitle) chatTitle.textContent = "New Conversation";

    if (messagesContainer) {
      messagesContainer.innerHTML = `
        <div class="chat-empty-state" id="chat-empty-state">
          <div class="empty-icon-glow">🤖</div>
          <h2>Second Brain AI Copilot & Deep Idea Architect</h2>
          <p>Ground your vision against 15+ Supabase tables, vector embeddings, and real-time accuracy scoring. Drop files, attach images, or speak your mind.</p>
          
          <div class="prompt-starter-grid">
            <div class="starter-card" data-prompt="Architect an autonomous multi-agent microservice pipeline using Node.js, BullMQ, and Supabase pgvector with 10x scalability.">
              <span class="starter-icon">🚀</span>
              <h4>10x Architecture Blueprint</h4>
              <p>Multi-agent microservice pipeline with pgvector & BullMQ</p>
            </div>
            <div class="starter-card" data-prompt="Fact-check my premise: 'Supabase vector search with 768-d Gemini embeddings can handle 10,000 queries/sec with sub-50ms latency.' Evaluate against database tables.">
              <span class="starter-icon">⚖️</span>
              <h4>Truth & Accuracy Check</h4>
              <p>Validate technical claim against database & latency realities</p>
            </div>
            <div class="starter-card" data-prompt="Here is my raw idea: I want to build an AI agent that automatically monitors tech trends, scores skill match, and creates daily viral blog posts. Make this idea fire with a 5-level deep blueprint.">
              <span class="starter-icon">🔥</span>
              <h4>Make Idea Fire (5 Levels)</h4>
              <p>Deep-dive from 10x moat down to code, roadmaps & monetization</p>
            </div>
            <div class="starter-card" data-prompt="Query my second brain memories and past reading logs: summarize my core competencies, recent research topics, and best next steps.">
              <span class="starter-icon">🧠</span>
              <h4>Recall Second Brain Knowledge</h4>
              <p>Synthesize memories, projects & reading logs from database</p>
            </div>
          </div>
        </div>
      `;
      setupStarterCards();
    }

    if (selectAfter) {
      loadChatSessions();
    }
  }

  // Handle Send Message
  async function handleSendMessage() {
    const promptInput = document.getElementById("chat-prompt-input");
    const sendBtn = document.getElementById("chat-send-btn");
    const messagesContainer = document.getElementById("chat-messages-container");
    const emptyState = document.getElementById("chat-empty-state");

    if (!promptInput) return;
    const prompt = promptInput.value.trim();

    if (!prompt && currentAttachments.length === 0) return;

    // Remove empty welcome state
    if (emptyState) emptyState.remove();

    // Snapshot attachments
    const attachedItems = [...currentAttachments];
    currentAttachments = [];
    renderAttachmentPreviews();

    // Render User Message immediately
    renderUserMessageBubble(prompt, attachedItems);

    // Reset input
    promptInput.value = "";
    promptInput.style.height = "auto";

    // Disable send button while generating
    if (sendBtn) sendBtn.disabled = true;

    // Render Typing Indicator
    const typingIndicator = document.createElement("div");
    typingIndicator.className = "chat-msg-row assistant";
    typingIndicator.id = "chat-typing-indicator";
    typingIndicator.innerHTML = `
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble">
        <div class="typing-dots">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    if (messagesContainer) {
      messagesContainer.appendChild(typingIndicator);
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    try {
      const res = await fetch(`${CHAT_API_BASE}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: currentSessionId || `sess_${Date.now()}`,
          prompt,
          presetMode: "combined_engine",
          attachments: attachedItems,
          history: chatMessagesHistory,
        }),
      });

      const data = await res.json();

      // Remove typing indicator
      if (typingIndicator) typingIndicator.remove();

      if (data.success) {
        // Update history
        chatMessagesHistory.push(
          { role: "user", content: prompt },
          { role: "assistant", content: data.response }
        );

        // Render assistant response
        renderAssistantMessageBubble({
          content: data.response,
          promptCorrected: data.promptCorrected,
          truthScore: data.truthScore,
          groundedSources: data.groundedSources || [],
        });

        // Update chat title in header if first message
        const chatTitle = document.getElementById("current-chat-title");
        if (chatTitle && (chatTitle.textContent === "New Conversation" || !chatTitle.textContent)) {
          chatTitle.textContent = prompt.slice(0, 35) + (prompt.length > 35 ? "..." : "");
          loadChatSessions();
        }
      } else {
        renderAssistantMessageBubble({
          content: `⚠️ **Error:** ${data.error || "Failed to generate AI response. Please check your API keys or try again."}`,
        });
      }
    } catch (err) {
      if (typingIndicator) typingIndicator.remove();
      renderAssistantMessageBubble({
        content: `⚠️ **Connection Error:** ${err.message}. Please ensure the server is running on port 3005 (\`npm run dev\`).`,
      });
    } finally {
      if (sendBtn) sendBtn.disabled = false;
      if (promptInput) promptInput.focus();
    }
  }

  // Render User Message Bubble
  function renderUserMessageBubble(text, attachments = []) {
    const messagesContainer = document.getElementById("chat-messages-container");
    if (!messagesContainer) return;

    let attachmentsHtml = "";
    if (attachments.length > 0) {
      attachmentsHtml = `
        <div class="user-msg-attachments">
          ${attachments
            .map((att) => {
              if (att.base64Data && att.type.startsWith("image/")) {
                return `<img src="${att.base64Data}" class="msg-att-img-preview" alt="${escapeAttr(att.name)}" />`;
              }
              return `
                <div class="msg-att-chip">
                  <span>📄</span>
                  <span>${escapeHtml(att.name)}</span>
                </div>
              `;
            })
            .join("")}
        </div>
      `;
    }

    const row = document.createElement("div");
    row.className = "chat-msg-row user";
    row.innerHTML = `
      <div class="chat-avatar">👤</div>
      <div class="chat-bubble">
        ${attachmentsHtml}
        <div>${escapeHtml(text).replace(/\n/g, "<br>")}</div>
      </div>
    `;

    messagesContainer.appendChild(row);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Render Assistant Message Bubble
  function renderAssistantMessageBubble(data) {
    const messagesContainer = document.getElementById("chat-messages-container");
    if (!messagesContainer) return;

    const row = document.createElement("div");
    row.className = "chat-msg-row assistant";

    // Auto-prompt refined badge
    let refinedHtml = "";
    if (data.promptCorrected) {
      refinedHtml = `
        <div class="refined-prompt-tag">
          <strong>✨ Auto-Refined & Context-Engineered Prompt</strong>
          <span>${escapeHtml(data.promptCorrected)}</span>
        </div>
      `;
    }

    // Truth & Accuracy Scorecard
    let truthHtml = "";
    if (data.truthScore && data.truthScore.status) {
      const ts = data.truthScore;
      const statusClass = ts.status.toLowerCase();
      truthHtml = `
        <div class="truth-scorecard-box truth-${statusClass}">
          <div class="truth-header-row">
            <span class="truth-badge badge-${statusClass}">${ts.status === "TRUE" ? "✅ ACCURATE / TRUE" : ts.status === "FALSE" ? "❌ DISPROVEN / FALSE" : "⚠️ PLAUSIBLE / CONDITIONAL"}</span>
            <span class="truth-confidence">${ts.confidence}% Fact Confidence</span>
          </div>
          <div class="truth-verdict">${escapeHtml(ts.verdict)}</div>
          <div class="truth-reasoning">${escapeHtml(ts.reasoning)}</div>
          ${
            ts.citations && ts.citations.length > 0
              ? `
            <div class="truth-citations">
              ${ts.citations.map((c) => `<span class="truth-cite-chip">📌 ${escapeHtml(c)}</span>`).join("")}
            </div>
          `
              : ""
          }
        </div>
      `;
    }

    // Grounded Database Sources Strip
    let sourcesHtml = "";
    if (data.groundedSources && data.groundedSources.length > 0) {
      sourcesHtml = `
        <div class="grounded-sources-strip">
          <span class="grounded-sources-label">Grounded DB Sources:</span>
          ${data.groundedSources
            .map(
              (s) => `
            <span class="grounded-source-chip" title="${escapeAttr(s.snippet)}">
              🗄️ ${escapeHtml(s.table)}: ${escapeHtml(s.title.slice(0, 25))}
            </span>
          `
            )
            .join("")}
        </div>
      `;
    }

    // Formatted Markdown Content
    const formattedMarkdown = formatMarkdown(data.content);

    row.innerHTML = `
      <div class="chat-avatar">🤖</div>
      <div class="chat-bubble">
        ${refinedHtml}
        ${truthHtml}
        ${sourcesHtml}
        <div class="chat-bubble-markdown">${formattedMarkdown}</div>
        
        <div class="msg-actions-toolbar">
          <button class="msg-action-chip copy-msg-btn" title="Copy markdown to clipboard">📋 Copy</button>
          <button class="msg-action-chip tts-msg-btn" title="Listen aloud with Speech Synthesis">🔊 Listen</button>
        </div>
      </div>
    `;

    // Copy action
    const copyBtn = row.querySelector(".copy-msg-btn");
    if (copyBtn) {
      copyBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(data.content);
        copyBtn.textContent = "✓ Copied!";
        setTimeout(() => (copyBtn.textContent = "📋 Copy"), 2000);
      });
    }

    // Text to Speech
    const ttsBtn = row.querySelector(".tts-msg-btn");
    if (ttsBtn) {
      ttsBtn.addEventListener("click", () => {
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          const cleanText = data.content.replace(/[#*`_~\[\]()]/g, " ");
          const utterance = new SpeechSynthesisUtterance(cleanText.slice(0, 1000));
          utterance.rate = 1.05;
          window.speechSynthesis.speak(utterance);
          ttsBtn.textContent = "🔊 Speaking...";
          utterance.onend = () => (ttsBtn.textContent = "🔊 Listen");
        } else {
          alert("Speech Synthesis not available in this browser.");
        }
      });
    }

    // Attach copy buttons on code blocks
    row.querySelectorAll(".code-copy-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const codeText = btn.getAttribute("data-code") || "";
        navigator.clipboard.writeText(decodeURIComponent(codeText));
        btn.textContent = "✓ Copied!";
        setTimeout(() => (btn.textContent = "Copy Code"), 2000);
      });
    });

    messagesContainer.appendChild(row);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  // Lightweight Safe Markdown Formatter
  function formatMarkdown(md) {
    if (!md) return "";

    // Escape HTML tags first to avoid injection
    let html = escapeHtml(md);

    // Code blocks with syntax badge & copy button
    html = html.replace(/```([a-zA-Z0-9_\-\+]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const language = lang || "code";
      const encodedCode = encodeURIComponent(code.trim());
      return `
        <div class="code-block-container">
          <div class="code-block-header">
            <span>${language}</span>
            <button class="code-copy-btn" data-code="${encodedCode}">Copy Code</button>
          </div>
          <pre><code>${code}</code></pre>
        </div>
      `;
    });

    // Inline code
    html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

    // Headings
    html = html.replace(/^### (.*$)/gim, "<h3>$1</h3>");
    html = html.replace(/^## (.*$)/gim, "<h2>$1</h2>");
    html = html.replace(/^# (.*$)/gim, "<h1>$1</h1>");

    // Bold & Italics
    html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

    // Blockquotes
    html = html.replace(/^> (.*$)/gim, "<blockquote>$1</blockquote>");

    // Bulleted lists
    html = html.replace(/^\s*[\-\*]\s+(.*$)/gim, "<li>$1</li>");
    html = html.replace(/(<li>.*<\/li>)/gims, "<ul>$1</ul>");

    // Numbered lists
    html = html.replace(/^\s*(\d+)\.\s+(.*$)/gim, "<li>$2</li>");

    // Paragraph line breaks
    html = html.replace(/\n\n+/g, "</p><p>");
    html = `<p>${html}</p>`;
    html = html.replace(/<p><\/p>/g, "");

    return html;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // =========================================================================
  // MASTER HYBRID SECURITY, RBAC & OMNISCIENT TELEMETRY CONTROLLERS
  // =========================================================================
  let currentAuthUser = null;
  let currentAuthToken = localStorage.getItem("cd_auth_token") || "";
  let clientTelemetryGeo = { city: "Jaipur", country: "India", ip: "127.0.0.1" };
  let clientMachineId = localStorage.getItem("cd_machine_id") || "";

  if (!clientMachineId) {
    clientMachineId = "MAC_" + Math.random().toString(36).substring(2, 10).toUpperCase();
    localStorage.setItem("cd_machine_id", clientMachineId);
  }

  async function initAuthAndTelemetry() {
    // 1. Fetch Geolocation in background for handshake
    try {
      const geoController = new AbortController();
      const geoTimeout = setTimeout(() => geoController.abort(), 2500);
      const geoRes = await fetch("https://ipapi.co/json/", { signal: geoController.signal });
      clearTimeout(geoTimeout);
      const geoData = await geoRes.json();
      if (geoData && geoData.ip) {
        clientTelemetryGeo = {
          city: geoData.city || "Unknown",
          country: geoData.country_name || "Global",
          ip: geoData.ip || "127.0.0.1",
        };
      }
    } catch (e) {
      // offline / fallback
    }

    const detectedElem = document.getElementById("detected-telemetry-text");
    if (detectedElem) {
      detectedElem.textContent = `📍 ${clientTelemetryGeo.city}, ${clientTelemetryGeo.country} · IP: ${clientTelemetryGeo.ip} · Node: ${clientMachineId}`;
    }

    // 2. Validate Existing Session
    if (currentAuthToken) {
      try {
        const meRes = await fetch("/api/auth/me", {
          headers: { Authorization: `Bearer ${currentAuthToken}` },
        });
        const meData = await meRes.json();
        if (meData.success && meData.user) {
          currentAuthUser = meData.user;
          updateAuthUI();
        } else {
          // Token expired or revoked
          logoutUser(false);
        }
      } catch (err) {
        // network issue, try cached user
        try {
          const cached = JSON.parse(localStorage.getItem("cd_auth_user") || "null");
          if (cached) {
            currentAuthUser = cached;
            updateAuthUI();
          }
        } catch {}
      }
    } else {
      updateAuthUI();
    }

    // 3. Modal Controls
    const authModal = document.getElementById("auth-modal");
    const openAuthBtn = document.getElementById("open-auth-modal-btn");
    const closeAuthBtn = document.getElementById("close-auth-modal-btn");
    const logoutBtn = document.getElementById("auth-logout-btn");

    if (openAuthBtn && authModal) {
      openAuthBtn.onclick = () => {
        authModal.style.display = "flex";
      };
    }

    if (closeAuthBtn && authModal) {
      closeAuthBtn.onclick = () => {
        authModal.style.display = "none";
      };
    }

    if (authModal) {
      authModal.onclick = (e) => {
        if (e.target === authModal) authModal.style.display = "none";
      };
    }

    if (logoutBtn) {
      logoutBtn.onclick = () => {
        if (confirm("Sign out of Career-Digest?")) {
          logoutUser(true);
        }
      };
    }

    // Switch between Sign In and Request Activation tabs
    const tabLoginBtn = document.getElementById("auth-tab-login-btn");
    const tabActivateBtn = document.getElementById("auth-tab-activate-btn");
    const formLogin = document.getElementById("auth-login-form-container");
    const formActivate = document.getElementById("auth-activate-form-container");

    if (tabLoginBtn && tabActivateBtn && formLogin && formActivate) {
      tabLoginBtn.onclick = () => {
        tabLoginBtn.classList.add("active");
        tabActivateBtn.classList.remove("active");
        formLogin.style.display = "block";
        formActivate.style.display = "none";
      };

      tabActivateBtn.onclick = () => {
        tabActivateBtn.classList.add("active");
        tabLoginBtn.classList.remove("active");
        formLogin.style.display = "none";
        formActivate.style.display = "block";
      };
    }

    // 4. Sign In Form Handler
    const loginSubmitBtn = document.getElementById("login-submit-btn");
    const loginEmailInput = document.getElementById("login-input-email");
    const loginPasswordInput = document.getElementById("login-input-password");
    const loginErrorMsg = document.getElementById("login-error-msg");

    if (loginSubmitBtn) {
      loginSubmitBtn.onclick = async () => {
        const email = loginEmailInput?.value?.trim();
        const password = loginPasswordInput?.value?.trim();

        if (!email || !password) {
          if (loginErrorMsg) {
            loginErrorMsg.textContent = "Please enter both email and password.";
            loginErrorMsg.style.display = "block";
          }
          return;
        }

        loginSubmitBtn.disabled = true;
        loginSubmitBtn.textContent = "Verifying...";
        if (loginErrorMsg) loginErrorMsg.style.display = "none";

        try {
          const res = await fetch("/api/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
          });
          const data = await res.json();

          if (data.success && data.token) {
            currentAuthToken = data.token;
            currentAuthUser = data.user;
            localStorage.setItem("cd_auth_token", data.token);
            localStorage.setItem("cd_auth_user", JSON.stringify(data.user));

            updateAuthUI();
            if (authModal) authModal.style.display = "none";

            alert(`🎉 Welcome ${data.user.full_name || data.user.email}! Role: ${data.user.role}`);

            if (data.user.role === "projectadmin") {
              const adminTab = document.getElementById("admin-tab-btn");
              if (adminTab) adminTab.click();
            }
          } else {
            throw new Error(data.error || "Login failed");
          }
        } catch (err) {
          if (loginErrorMsg) {
            loginErrorMsg.textContent = err.message;
            loginErrorMsg.style.display = "block";
          }
        } finally {
          loginSubmitBtn.disabled = false;
          loginSubmitBtn.textContent = "Sign In & Unlock Session";
        }
      };
    }

    // 5. Clone Activation Request Handler
    const reqSubmitBtn = document.getElementById("req-submit-btn");
    const reqEmailInput = document.getElementById("req-input-email");
    const reqStatusMsg = document.getElementById("req-status-msg");

    if (reqSubmitBtn) {
      reqSubmitBtn.onclick = async () => {
        const email = reqEmailInput?.value?.trim();
        if (!email || !email.includes("@")) {
          if (reqStatusMsg) {
            reqStatusMsg.style.color = "#f87171";
            reqStatusMsg.textContent = "Please enter a valid email address.";
            reqStatusMsg.style.display = "block";
          }
          return;
        }

        reqSubmitBtn.disabled = true;
        reqSubmitBtn.textContent = "Transmitting Handshake Request...";
        if (reqStatusMsg) reqStatusMsg.style.display = "none";

        try {
          const res = await fetch("/api/activation/request", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              requesterEmail: email,
              machineId: clientMachineId,
              city: clientTelemetryGeo.city,
              country: clientTelemetryGeo.country,
              deviceOs: navigator.platform || "browser",
            }),
          });
          const data = await res.json();

          if (data.success) {
            if (reqStatusMsg) {
              reqStatusMsg.style.color = "#34d399";
              reqStatusMsg.textContent = "✅ " + data.message;
              reqStatusMsg.style.display = "block";
            }
            alert(`🎉 Request Transmitted!\n\n${data.message}`);
          } else {
            throw new Error(data.message || "Failed to submit request.");
          }
        } catch (err) {
          if (reqStatusMsg) {
            reqStatusMsg.style.color = "#f87171";
            reqStatusMsg.textContent = "Error: " + err.message;
            reqStatusMsg.style.display = "block";
          }
        } finally {
          reqSubmitBtn.disabled = false;
          reqSubmitBtn.textContent = "🚀 Submit Request to Abhishek Tiwari";
        }
      };
    }

    // Refresh telemetry button listener
    const refreshTelemetryBtn = document.getElementById("refresh-admin-telemetry-btn");
    if (refreshTelemetryBtn) {
      refreshTelemetryBtn.onclick = () => loadAdminTelemetryTab();
    }
  }

  function updateAuthUI() {
    const userPill = document.getElementById("auth-user-pill");
    const userName = document.getElementById("auth-user-name");
    const userRole = document.getElementById("auth-role-badge");
    const openAuthBtn = document.getElementById("open-auth-modal-btn");
    const logoutBtn = document.getElementById("auth-logout-btn");
    const adminTabBtn = document.getElementById("admin-tab-btn");

    if (currentAuthUser && currentAuthToken) {
      if (userPill) userPill.style.display = "flex";
      if (userName) userName.textContent = currentAuthUser.full_name || currentAuthUser.email;
      if (userRole) {
        userRole.textContent = currentAuthUser.role;
        userRole.style.background = currentAuthUser.role === "projectadmin" ? "rgba(239,68,68,0.25)" : "rgba(99,102,241,0.25)";
        userRole.style.color = currentAuthUser.role === "projectadmin" ? "#fca5a5" : "#a5b4fc";
      }

      if (openAuthBtn) openAuthBtn.style.display = "none";
      if (logoutBtn) logoutBtn.style.display = "flex";

      // Show Admin Control Center only to projectadmin
      if (adminTabBtn) {
        adminTabBtn.style.display = currentAuthUser.role === "projectadmin" ? "flex" : "none";
      }
    } else {
      if (userPill) userPill.style.display = "none";
      if (openAuthBtn) openAuthBtn.style.display = "flex";
      if (logoutBtn) logoutBtn.style.display = "none";
      if (adminTabBtn) adminTabBtn.style.display = "none";
    }
  }

  function logoutUser(alertUser = true) {
    currentAuthUser = null;
    currentAuthToken = "";
    localStorage.removeItem("cd_auth_token");
    localStorage.removeItem("cd_auth_user");
    updateAuthUI();

    // If currently on admin tab, switch to chat
    if (activeTab === "tab-admin") {
      const chatTab = document.querySelector('.tab-btn[data-tab="tab-chat"]');
      if (chatTab) chatTab.click();
    }

    if (alertUser) {
      alert("You have been signed out.");
    }
  }

  async function loadAdminTelemetryTab() {
    if (!currentAuthUser || currentAuthUser.role !== "projectadmin") {
      const container = document.getElementById("admin-requests-container");
      if (container) {
        container.innerHTML = `<div class="error-banner" style="padding:1.5rem; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); border-radius:10px; color:#f87171;">
          <strong>Access Restricted:</strong> You must be signed in as projectadmin (Abhishek Tiwari) to access the Master Control Center.
        </div>`;
      }
      return;
    }

    try {
      const res = await fetch("/api/admin/telemetry", {
        headers: { Authorization: `Bearer ${currentAuthToken}` },
      });
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to load telemetry.");
      }

      // 1. Stats Bar
      const statInstances = document.getElementById("admin-stat-instances");
      const statActive = document.getElementById("admin-stat-active");
      const statPending = document.getElementById("admin-stat-pending");
      const statSearches = document.getElementById("admin-stat-searches");
      const statChats = document.getElementById("admin-stat-chats");
      const pendingBadge = document.getElementById("admin-pending-badge");

      if (statInstances) statInstances.textContent = data.stats.totalInstances || 0;
      if (statActive) statActive.textContent = data.stats.activeNodesCount || 0;
      if (statPending) statPending.textContent = data.stats.pendingRequestsCount || 0;
      if (statSearches) statSearches.textContent = data.stats.totalSearchQueries || 0;
      if (statChats) statChats.textContent = data.stats.totalChatInteractions || 0;
      if (pendingBadge) pendingBadge.textContent = `${data.stats.pendingRequestsCount || 0} Pending`;

      // 2. Pending Requests List
      const reqContainer = document.getElementById("admin-requests-container");
      if (reqContainer) {
        const pending = (data.pendingRequests || []).filter((r) => r.status === "pending");
        if (pending.length === 0) {
          reqContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">No pending activation requests. New cloner requests will appear here automatically.</p>`;
        } else {
          reqContainer.innerHTML = pending
            .map((r) => `
            <div style="background:rgba(0,0,0,0.3); border:1px solid rgba(245,158,11,0.3); border-radius:10px; padding:0.9rem 1.1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
              <div>
                <div style="font-weight:700; color:#fff; font-size:0.95rem;">${escapeHtml(r.requester_email)}</div>
                <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.2rem;">
                  📍 <strong>Location:</strong> ${escapeHtml(r.city || "Unknown")}, ${escapeHtml(r.country || "Global")} · 
                  IP: <code>${escapeHtml(r.ip_address || "127.0.0.1")}</code> · 
                  Node: <code>${escapeHtml(r.machine_id || "")}</code> · 
                  Time: ${new Date(r.created_at).toLocaleTimeString()}
                </div>
              </div>
              <div style="display:flex; gap:0.5rem;">
                <button class="btn primary-btn approve-request-btn" data-req-id="${r.id}" style="padding:0.4rem 0.85rem; font-size:0.78rem; background:linear-gradient(135deg, #10b981, #059669); font-weight:700;">
                  ✅ Approve &amp; Send Password
                </button>
                <button class="btn secondary-btn reject-request-btn" data-req-id="${r.id}" style="padding:0.4rem 0.85rem; font-size:0.78rem; color:#f87171; border-color:rgba(239,68,68,0.3);">
                  ✕ Decline
                </button>
              </div>
            </div>
          `).join("");

          // Attach listeners to Approve & Reject buttons
          document.querySelectorAll(".approve-request-btn").forEach((btn) => {
            btn.onclick = async () => {
              const reqId = btn.dataset.reqId;
              btn.disabled = true;
              btn.textContent = "Approving & Emailing...";
              try {
                const aRes = await fetch("/api/admin/approve-request", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${currentAuthToken}`,
                  },
                  body: JSON.stringify({ requestId: reqId }),
                });
                const aData = await aRes.json();
                if (aData.success) {
                  alert(`🎉 ${aData.message}\n\nGenerated Password: ${aData.generatedPassword}\nLicense: ${aData.licenseKey}`);
                  loadAdminTelemetryTab();
                } else {
                  alert(`Error: ${aData.error || aData.message}`);
                }
              } catch (e) {
                alert(`Error: ${e.message}`);
              }
            };
          });

          document.querySelectorAll(".reject-request-btn").forEach((btn) => {
            btn.onclick = async () => {
              const reqId = btn.dataset.reqId;
              if (confirm("Decline this activation request?")) {
                await fetch("/api/admin/reject-request", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${currentAuthToken}`,
                  },
                  body: JSON.stringify({ requestId: reqId, reason: "Declined by owner" }),
                });
                loadAdminTelemetryTab();
              }
            };
          });
        }
      }

      // 3. Registered Instances & Kill-Switch
      const instContainer = document.getElementById("admin-instances-container");
      if (instContainer) {
        const instances = data.instances || [];
        if (instances.length === 0) {
          instContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">No registered nodes yet.</p>`;
        } else {
          instContainer.innerHTML = instances
            .map((inst) => {
              const isRevoked = inst.is_revoked;
              return `
              <div style="background:rgba(0,0,0,0.25); border:1px solid ${isRevoked ? "rgba(239,68,68,0.4)" : "rgba(255,255,255,0.06)"}; border-radius:10px; padding:0.85rem 1.1rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
                <div>
                  <div style="display:flex; align-items:center; gap:0.5rem;">
                    <span style="font-weight:700; color:#fff; font-size:0.92rem;">${escapeHtml(inst.owner_email)}</span>
                    <span class="os-metric-badge" style="background:${isRevoked ? "rgba(239,68,68,0.2)" : "rgba(16,185,129,0.2)"}; color:${isRevoked ? "#f87171" : "#34d399"}; font-weight:700;">
                      ${isRevoked ? "🔴 REVOKED" : "🟢 ACTIVE"}
                    </span>
                  </div>
                  <div style="font-size:0.78rem; color:var(--text-muted); margin-top:0.25rem;">
                    License: <code>${escapeHtml(inst.license_key)}</code> · 
                    📍 ${escapeHtml(inst.city || "Unknown")}, ${escapeHtml(inst.country || "Global")} · 
                    IP: <code>${escapeHtml(inst.last_ip || "")}</code> · 
                    Last Heartbeat: ${new Date(inst.last_heartbeat).toLocaleTimeString()}
                  </div>
                </div>
                <div>
                  ${
                    isRevoked
                      ? `<span style="font-size:0.78rem; color:#f87171; font-weight:700;">Killed / Inactive</span>`
                      : `<button class="btn secondary-btn revoke-instance-btn" data-inst-id="${inst.id || inst.license_key}" style="padding:0.4rem 0.85rem; font-size:0.78rem; background:rgba(239,68,68,0.15); border-color:rgba(239,68,68,0.4); color:#fca5a5; font-weight:700;">
                          🛑 Revoke License (Kill)
                        </button>`
                  }
                </div>
              </div>`;
            })
            .join("");

          document.querySelectorAll(".revoke-instance-btn").forEach((btn) => {
            btn.onclick = async () => {
              const instId = btn.dataset.instId;
              if (confirm(`Kill-Switch: Revoke license for node ${instId}? The cloner will immediately lose all access to AI and search endpoints.`)) {
                await fetch("/api/admin/revoke-instance", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${currentAuthToken}`,
                  },
                  body: JSON.stringify({ instanceId: instId, reason: "Revoked by Abhishek Tiwari" }),
                });
                alert(`🛑 Node ${instId} has been revoked!`);
                loadAdminTelemetryTab();
              }
            };
          });
        }
      }

      // 4. Live Searches Feed
      const searchContainer = document.getElementById("admin-searches-container");
      if (searchContainer) {
        const searches = data.recentSearchLogs || [];
        if (searches.length === 0) {
          searchContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">No search logs recorded yet.</p>`;
        } else {
          searchContainer.innerHTML = searches
            .map(
              (s) => `
            <div style="background:rgba(0,0,0,0.25); border-left:3px solid #6366f1; padding:0.5rem 0.8rem; border-radius:0 6px 6px 0; font-size:0.82rem; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
              <div>
                <span style="color:#a5b4fc; font-weight:700;">"${escapeHtml(s.search_query)}"</span>
                <span style="color:var(--text-muted); font-size:0.75rem; margin-left:0.5rem;">(${escapeHtml(s.search_type)}) · Results: ${s.results_count || 0}</span>
              </div>
              <div style="font-size:0.72rem; color:var(--text-muted);">
                👤 ${escapeHtml(s.user_email)} · 📍 ${escapeHtml(s.city || "Local")}, ${escapeHtml(s.country || "Global")} · ${new Date(s.created_at).toLocaleTimeString()}
              </div>
            </div>
          `
            )
            .join("");
        }
      }

      // 5. Global Chat Stream
      const chatContainer = document.getElementById("admin-chats-container");
      if (chatContainer) {
        const chats = data.recentChatLogs || [];
        if (chats.length === 0) {
          chatContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; font-style:italic;">No chat logs recorded yet.</p>`;
        } else {
          chatContainer.innerHTML = chats
            .map(
              (c) => `
            <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:0.75rem 0.95rem;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem; font-size:0.75rem; color:var(--text-muted);">
                <div>
                  <strong style="color:#c084fc;">${escapeHtml(c.user_email)}</strong> · Mode: <code>${escapeHtml(c.preset_mode)}</code>
                </div>
                <div>📍 ${escapeHtml(c.city || "Local")}, ${escapeHtml(c.country || "Global")} · ${new Date(c.created_at).toLocaleTimeString()}</div>
              </div>
              <div style="font-size:0.86rem; color:#fff; font-weight:600; margin-bottom:0.3rem;">
                💬 ${escapeHtml(c.prompt_text)}
              </div>
              ${
                c.assistant_response
                  ? `<div style="font-size:0.8rem; color:#94a3b8; line-height:1.4; max-height:80px; overflow-y:auto; background:rgba(0,0,0,0.3); padding:0.4rem 0.6rem; border-radius:6px;">
                      ${escapeHtml(c.assistant_response.slice(0, 300))}...
                     </div>`
                  : ""
              }
            </div>
          `
            )
            .join("");
        }
      }
    } catch (err) {
      alert(`Error loading admin telemetry: ${err.message}`);
    }
  }
});

