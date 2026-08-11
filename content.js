// content.js
// YouTube Timeline Bookmarks + Transcript Search + A/B Looping (Manifest V3, vanilla JS).
// Runs on https://www.youtube.com/*.

(function () {
  'use strict';

  // ---- State -------------------------------------------------------------
  let videoId = null;
  let video = null;
  let bookmarks = [];        // [{ time, label }]
  let transcript = null;     // [{ start, duration, text }] | null
  let transcriptError = false;
  let panelOpen = false;
  let panel = null;
  let bookmarkBtn = null;
  let tickLayer = null;
  let loopOverlayEl = null;
  let tooltipEl = null;

  // A/B Loop state
  let loopA = null;
  let loopB = null;
  let loopActive = false;

  const STORAGE_KEY = 'ytb_bookmarks'; // { [videoId]: [{ time, label }] }

  // ---- Utilities ---------------------------------------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function fmtTime(t) {
    if (t == null || isNaN(t)) return '00:00';
    const s = Math.floor(t % 60);
    const m = Math.floor((t / 60) % 60);
    const h = Math.floor(t / 3600);
    const pad = n => String(n).padStart(2, '0');
    return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  }

  function getVideoIdFromURL() {
    try {
      const u = new URL(location.href);
      if (u.hostname.includes('youtube.com') && u.pathname === '/watch') {
        return u.searchParams.get('v') || null;
      }
    } catch (e) {}
    return null;
  }

  function getVideoEl() {
    return document.querySelector('video.html5-main-video') ||
           document.querySelector('video.video-stream') ||
           document.querySelector('video');
  }

  // ---- Storage -----------------------------------------------------------
  async function loadBookmarks(vid) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const all = res[STORAGE_KEY] || {};
        resolve(Array.isArray(all[vid]) ? all[vid] : []);
      });
    });
  }

  async function saveBookmarks(vid, list) {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEY], (res) => {
        const all = res[STORAGE_KEY] || {};
        all[vid] = list;
        chrome.storage.local.set({ [STORAGE_KEY]: all }, () => resolve());
      });
    });
  }

  async function persistBookmarks() {
    if (!videoId) return;
    await saveBookmarks(videoId, bookmarks);
  }

  // ---- Bookmark actions --------------------------------------------------
  async function addBookmark(time, label = '') {
    if (!video || time == null || isNaN(time)) return;
    const entry = { time: Math.round(time * 10) / 10, label: label || `Bookmark @ ${fmtTime(time)}` };
    bookmarks.push(entry);
    bookmarks.sort((a, b) => a.time - b.time);
    await persistBookmarks();
    renderTicks();
    renderBookmarkList();
  }

  async function deleteBookmark(index) {
    bookmarks.splice(index, 1);
    await persistBookmarks();
    renderTicks();
    renderBookmarkList();
  }

  function editBookmarkLabel(index, newLabel) {
    if (index < 0 || index >= bookmarks.length) return;
    const label = (newLabel || '').trim() || `Bookmark @ ${fmtTime(bookmarks[index].time)}`;
    bookmarks[index].label = label;
    persistBookmarks();
    renderBookmarkList();
    renderTicks();
  }

  function jumpTo(time) {
    if (!video || time == null || isNaN(time)) return;
    video.currentTime = time;
    // Visual feedback: brief seek flash
    video.classList.add('ytb-seek-flash');
    setTimeout(() => video.classList.remove('ytb-seek-flash'), 400);
  }

  // ---- A/B Loop Logic ---------------------------------------------------
  function setLoopPointA(t) {
    const val = (t != null && !isNaN(t)) ? Math.round(t * 10) / 10 : (video ? Math.round(video.currentTime * 10) / 10 : null);
    if (val == null) return;
    loopA = val;
    if (loopB !== null && loopA >= loopB) {
      loopB = null; // reset end if point A is after point B
    }
    renderLoopUI();
    renderLoopOverlay();
  }

  function setLoopPointB(t) {
    const val = (t != null && !isNaN(t)) ? Math.round(t * 10) / 10 : (video ? Math.round(video.currentTime * 10) / 10 : null);
    if (val == null) return;
    if (loopA !== null && val <= loopA) return; // point B must be after A
    loopB = val;
    renderLoopUI();
    renderLoopOverlay();
  }

  function clearLoop() {
    loopA = null;
    loopB = null;
    loopActive = false;
    renderLoopUI();
    renderLoopOverlay();
  }

  function toggleLoopActive() {
    if (loopA == null || loopB == null) return;
    loopActive = !loopActive;
    if (loopActive && video) {
      if (video.currentTime < loopA || video.currentTime >= loopB) {
        video.currentTime = loopA;
      }
    }
    renderLoopUI();
    renderLoopOverlay();
  }

  function onVideoTimeUpdate() {
    if (!loopActive || !video || loopA == null || loopB == null || loopB <= loopA) return;
    if (video.currentTime >= loopB || video.currentTime < loopA - 0.5) {
      video.currentTime = loopA;
    }
  }

  // ---- Player controls: bookmark button ---------------------------------
  function ensureBookmarkButton() {
    if (!video) return;
    const controls = $('.ytp-right-controls');
    if (!controls) return;
    if (bookmarkBtn && document.contains(bookmarkBtn)) return;

    bookmarkBtn = document.createElement('button');
    bookmarkBtn.className = 'ytp-button ytb-bookmark-btn';
    bookmarkBtn.title = 'Bookmark current time (B)';
    bookmarkBtn.setAttribute('aria-label', 'Bookmark current time');
    bookmarkBtn.textContent = '🔖';

    controls.insertBefore(bookmarkBtn, controls.firstChild);

    bookmarkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (video) addBookmark(video.currentTime);
    });
  }

  // ---- Progress bar tick marks & Loop overlay ---------------------------
  function ensureProgressBarElements() {
    if (!video) return;
    const bar = $('.ytp-progress-bar');
    if (!bar) return;

    if (!tickLayer || !document.contains(tickLayer)) {
      tickLayer = document.createElement('div');
      tickLayer.className = 'ytb-tick-layer';
      bar.appendChild(tickLayer);
    }

    if (!loopOverlayEl || !document.contains(loopOverlayEl)) {
      loopOverlayEl = document.createElement('div');
      loopOverlayEl.className = 'ytb-loop-overlay';
      bar.appendChild(loopOverlayEl);
    }

    if (!tooltipEl || !document.contains(tooltipEl)) {
      tooltipEl = document.createElement('div');
      tooltipEl.className = 'ytb-tick-tooltip';
      tooltipEl.style.display = 'none';
      document.body.appendChild(tooltipEl);
    }
  }

  function renderTicks() {
    if (!tickLayer) return;
    tickLayer.innerHTML = '';
    const dur = video && isFinite(video.duration) ? video.duration : 0;
    if (!dur) return;
    bookmarks.forEach((bm, i) => {
      const pct = (bm.time / dur) * 100;
      if (pct < 0 || pct > 100) return;
      const tick = document.createElement('div');
      tick.className = 'ytb-tick';
      tick.style.left = `${pct}%`;
      tick.dataset.index = String(i);
      tick.title = `${fmtTime(bm.time)} — ${bm.label}`;

      tick.addEventListener('mouseenter', (e) => showTooltip(e, bm));
      tick.addEventListener('mousemove', (e) => moveTooltip(e));
      tick.addEventListener('mouseleave', hideTooltip);
      tick.addEventListener('click', (e) => {
        e.stopPropagation();
        jumpTo(bm.time);
      });

      tickLayer.appendChild(tick);
    });
  }

  function renderLoopOverlay() {
    if (!loopOverlayEl) return;
    const dur = video && isFinite(video.duration) ? video.duration : 0;
    if (!dur || loopA == null || loopB == null || loopB <= loopA) {
      loopOverlayEl.style.display = 'none';
      return;
    }

    const startPct = Math.max(0, Math.min(100, (loopA / dur) * 100));
    const endPct = Math.max(0, Math.min(100, (loopB / dur) * 100));
    const widthPct = endPct - startPct;

    loopOverlayEl.style.display = 'block';
    loopOverlayEl.style.left = `${startPct}%`;
    loopOverlayEl.style.width = `${widthPct}%`;
    loopOverlayEl.classList.toggle('active', loopActive);
  }

  function showTooltip(e, bm) {
    if (!tooltipEl) return;
    tooltipEl.innerHTML =
      `<div class="ytb-tt-time">${fmtTime(bm.time)}</div>` +
      `<div class="ytb-tt-label">${escapeHtml(bm.label)}</div>`;
    tooltipEl.style.display = 'block';
    moveTooltip(e);
  }

  function moveTooltip(e) {
    if (!tooltipEl) return;
    const pad = 12;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    const r = tooltipEl.getBoundingClientRect();
    if (x + r.width > window.innerWidth) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight) y = e.clientY - r.height - pad;
    tooltipEl.style.left = `${x}px`;
    tooltipEl.style.top = `${y}px`;
  }

  function hideTooltip() {
    if (tooltipEl) tooltipEl.style.display = 'none';
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function highlight(text, query) {
    const safe = escapeHtml(text);
    if (!query) return safe;
    const q = query.trim();
    if (!q) return safe;
    try {
      const re = new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
      return safe.replace(re, '<mark class="ytb-mark">$1</mark>');
    } catch (e) { return safe; }
  }

  // ---- Side panel --------------------------------------------------------
  function ensurePanel() {
    if (panel && document.contains(panel)) return;
    panel = document.createElement('div');
    panel.className = 'ytb-panel';
    panel.innerHTML = `
      <div class="ytb-panel-head">
        <span class="ytb-title">🔖 Bookmarks &amp; Search</span>
        <button class="ytb-close" title="Close">×</button>
      </div>
      <div class="ytb-tabs">
        <button class="ytb-tab active" data-tab="search">🔍 Search</button>
        <button class="ytb-tab" data-tab="bookmarks">🔖 Bookmarks</button>
      </div>
      <div class="ytb-tab-panel" data-panel="search">
        <input class="ytb-search" type="text" placeholder="Search transcript…" />
        <div class="ytb-search-status"></div>
        <div class="ytb-search-results"></div>
      </div>
      <div class="ytb-tab-panel" data-panel="bookmarks" style="display:none">
        <div class="ytb-loop-box">
          <div class="ytb-loop-head">
            <span>🔁 A/B Repeat Loop</span>
            <button class="ytb-loop-toggle-btn" title="Toggle Loop Active">Off</button>
          </div>
          <div class="ytb-loop-controls">
            <button class="ytb-loop-btn-a" title="Set start loop point">Set A (${loopA != null ? fmtTime(loopA) : '--:--'})</button>
            <button class="ytb-loop-btn-b" title="Set end loop point">Set B (${loopB != null ? fmtTime(loopB) : '--:--'})</button>
            <button class="ytb-loop-btn-clear" title="Clear A/B loop">Clear</button>
          </div>
        </div>
        <div class="ytb-bm-toolbar">
          <button class="ytb-add">+ Bookmark current time</button>
          <button class="ytb-export">Export to Markdown</button>
        </div>
        <div class="ytb-bm-list"></div>
      </div>
    `;
    document.body.appendChild(panel);

    // Events
    panel.querySelector('.ytb-close').addEventListener('click', () => setPanelOpen(false));
    panel.querySelectorAll('.ytb-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        panel.querySelectorAll('.ytb-tab').forEach(b => b.classList.toggle('active', b === btn));
        panel.querySelectorAll('.ytb-tab-panel').forEach(p => {
          p.style.display = (p.dataset.panel === tab) ? '' : 'none';
        });
      });
    });
    panel.querySelector('.ytb-add').addEventListener('click', () => {
      if (video) addBookmark(video.currentTime);
    });
    panel.querySelector('.ytb-export').addEventListener('click', exportMarkdown);

    // Loop UI listeners
    panel.querySelector('.ytb-loop-btn-a').addEventListener('click', () => setLoopPointA());
    panel.querySelector('.ytb-loop-btn-b').addEventListener('click', () => setLoopPointB());
    panel.querySelector('.ytb-loop-btn-clear').addEventListener('click', clearLoop);
    panel.querySelector('.ytb-loop-toggle-btn').addEventListener('click', toggleLoopActive);

    const searchInput = panel.querySelector('.ytb-search');
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderSearchResults(searchInput.value), 80);
    });

    renderLoopUI();
  }

  function setPanelOpen(open) {
    panelOpen = !!open;
    if (!panel) return;
    panel.classList.toggle('open', panelOpen);
  }

  function togglePanel() { setPanelOpen(!panelOpen); }

  function renderLoopUI() {
    if (!panel) return;
    const btnA = panel.querySelector('.ytb-loop-btn-a');
    const btnB = panel.querySelector('.ytb-loop-btn-b');
    const toggleBtn = panel.querySelector('.ytb-loop-toggle-btn');
    if (!btnA || !btnB || !toggleBtn) return;

    btnA.textContent = `Point A (${loopA != null ? fmtTime(loopA) : '--:--'})`;
    btnB.textContent = `Point B (${loopB != null ? fmtTime(loopB) : '--:--'})`;

    const canLoop = loopA != null && loopB != null && loopB > loopA;
    toggleBtn.disabled = !canLoop;
    toggleBtn.textContent = loopActive ? 'LOOP ON' : 'Loop Off';
    toggleBtn.classList.toggle('active', loopActive);
  }

  // ---- Bookmark list rendering ------------------------------------------
  function renderBookmarkList() {
    if (!panel) return;
    const list = panel.querySelector('.ytb-bm-list');
    if (!list) return;
    list.innerHTML = '';
    if (!bookmarks.length) {
      list.innerHTML = '<div class="ytb-empty">No bookmarks yet. Press <b>B</b> or click 🔖 to add one.</div>';
      return;
    }
    bookmarks.forEach((bm, i) => {
      const row = document.createElement('div');
      row.className = 'ytb-bm-row';
      row.innerHTML = `
        <div class="ytb-bm-time">${fmtTime(bm.time)}</div>
        <input class="ytb-bm-label" type="text" value="${escapeHtml(bm.label)}" />
        <div class="ytb-bm-actions">
          <button class="ytb-bm-set-a" title="Set as Loop A">A</button>
          <button class="ytb-bm-set-b" title="Set as Loop B">B</button>
          <button class="ytb-bm-jump" title="Jump to">▶</button>
          <button class="ytb-bm-edit" title="Save label">✓</button>
          <button class="ytb-bm-del" title="Delete">🗑</button>
        </div>
      `;
      row.querySelector('.ytb-bm-set-a').addEventListener('click', () => setLoopPointA(bm.time));
      row.querySelector('.ytb-bm-set-b').addEventListener('click', () => setLoopPointB(bm.time));
      row.querySelector('.ytb-bm-jump').addEventListener('click', () => jumpTo(bm.time));
      row.querySelector('.ytb-bm-del').addEventListener('click', () => deleteBookmark(i));
      const input = row.querySelector('.ytb-bm-label');
      row.querySelector('.ytb-bm-edit').addEventListener('click', () => editBookmarkLabel(i, input.value));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { editBookmarkLabel(i, input.value); input.blur(); }
      });
      list.appendChild(row);
    });
  }

  function exportMarkdown() {
    if (!videoId) return;
    const base = `https://www.youtube.com/watch?v=${videoId}`;
    const lines = bookmarks.map(bm => {
      const t = Math.floor(bm.time);
      const url = `${base}&t=${t}s`;
      return `- [${fmtTime(bm.time)}](${url}) ${bm.label}`;
    });
    const md = `# Bookmarks — ${videoId}\n\n` + lines.join('\n') + '\n';
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bookmarks-${videoId}.md`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }

  // ---- Transcript search -------------------------------------------------
  async function ensureTranscript() {
    if (transcript || transcriptError) return;
    if (!videoId) return;
    try {
      const data = await window.TranscriptFetcher.fetchTranscript(videoId);
      if (data && data.length) {
        transcript = data;
      } else {
        transcript = null;
        transcriptError = true;
      }
    } catch (e) {
      transcript = null;
      transcriptError = true;
    }
    renderSearchResults(panel ? panel.querySelector('.ytb-search').value : '');
  }

  function renderSearchResults(query) {
    if (!panel) return;
    const results = panel.querySelector('.ytb-search-results');
    const status = panel.querySelector('.ytb-search-status');
    if (!results || !status) return;

    if (transcriptError && !transcript) {
      results.innerHTML = '';
      status.textContent = 'Transcript unavailable for this video.';
      status.className = 'ytb-search-status empty';
      return;
    }
    if (!transcript) {
      status.textContent = 'Loading transcript…';
      status.className = 'ytb-search-status loading';
      results.innerHTML = '';
      return;
    }

    const q = (query || '').trim().toLowerCase();
    let matches = transcript;
    if (q) {
      matches = transcript.filter(seg => seg.text.toLowerCase().includes(q));
    }
    status.textContent = q
      ? `${matches.length} match${matches.length === 1 ? '' : 'es'}`
      : `${transcript.length} transcript lines`;
    status.className = 'ytb-search-status';

    results.innerHTML = '';
    const frag = document.createDocumentFragment();
    matches.slice(0, 200).forEach(seg => {
      const row = document.createElement('div');
      row.className = 'ytb-result';
      row.innerHTML =
        `<span class="ytb-result-time">[${fmtTime(seg.start)}]</span> ` +
        `<span class="ytb-result-text">${highlight(seg.text, q)}</span>`;
      row.addEventListener('click', () => jumpTo(seg.start));
      frag.appendChild(row);
    });
    results.appendChild(frag);
    if (matches.length > 200) {
      const more = document.createElement('div');
      more.className = 'ytb-more';
      more.textContent = `… ${matches.length - 200} more results (refine your search)`;
      results.appendChild(more);
    }
  }

  // ---- Hotkeys -----------------------------------------------------------
  function onKeydown(e) {
    const tag = (e.target.tagName || '').toLowerCase();
    const isEditable = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    if (isEditable) return;

    if (e.key === 'b' || e.key === 'B') {
      if (video && videoId) {
        e.preventDefault();
        addBookmark(video.currentTime);
      }
    }
  }

  // ---- SPA routing & Init ------------------------------------------------
  let routeTimer = null;
  function onRouteChange() {
    clearTimeout(routeTimer);
    routeTimer = setTimeout(initForCurrentVideo, 350);
  }

  function initForCurrentVideo() {
    const newVid = getVideoIdFromURL();

    if (!newVid) {
      videoId = null;
      if (panel) setPanelOpen(false);
      return;
    }

    const newVideoEl = getVideoEl();
    if (!newVideoEl) {
      setTimeout(initForCurrentVideo, 400);
      return;
    }

    if (newVid === videoId && video === newVideoEl && document.contains(video)) {
      // Same video and element; ensure UI components are intact
      ensureBookmarkButton();
      ensureProgressBarElements();
      renderTicks();
      renderLoopOverlay();
      return;
    }

    // Video changed or element re-created
    if (video) {
      video.removeEventListener('timeupdate', onVideoTimeUpdate);
    }

    videoId = newVid;
    video = newVideoEl;
    transcript = null;
    transcriptError = false;
    bookmarks = [];

    // Clear A/B loop for new video
    clearLoop();

    // Attach timeupdate listener for A/B loop repeat
    video.addEventListener('timeupdate', onVideoTimeUpdate);

    loadBookmarks(videoId).then((list) => {
      bookmarks = list || [];
      ensureBookmarkButton();
      ensureProgressBarElements();
      renderTicks();
      renderLoopOverlay();
      renderBookmarkList();
      renderSearchResults('');
      ensureTranscript();
    });

    if (!video.__ytbDurWired) {
      video.__ytbDurWired = true;
      video.addEventListener('durationchange', () => { renderTicks(); renderLoopOverlay(); });
      video.addEventListener('loadedmetadata', () => { renderTicks(); renderLoopOverlay(); });
    }
  }

  // ---- Bootstrap --------------------------------------------------------
  function boot() {
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('yt-navigate-finish', onRouteChange);
    window.addEventListener('popstate', onRouteChange);

    // Watch for title/url mutations for SPA changes
    let lastUrl = location.href;
    const obs = new MutationObserver(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        onRouteChange();
      }
      if (getVideoIdFromURL() && getVideoEl()) {
        ensureBookmarkButton();
        ensureProgressBarElements();
      }
    });
    obs.observe(document.documentElement, { childList: true, subtree: true });

    // Handle background service worker message (toolbar icon click & hotkey)
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'YTB_TOGGLE_PANEL') {
        ensurePanel();
        togglePanel();
      }
    });

    initForCurrentVideo();
  }

  boot();
})();

