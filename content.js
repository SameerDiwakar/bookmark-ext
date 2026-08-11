// content.js
// YouTube Timeline Bookmarks + Transcript Search (Manifest V3, vanilla JS).
// Runs on https://www.youtube.com/*.

(function () {
  'use strict';

  // ---- Color map & State -------------------------------------------------
  const COLOR_MAP = {
    red: '#ff4e45',
    green: '#2ba640',
    blue: '#3ea6ff',
    yellow: '#f1c40f'
  };

  let videoId = null;
  let video = null;
  let bookmarks = [];        // [{ time, label, color }]
  let transcript = null;     // [{ start, duration, text }] | null
  let transcriptError = false;
  let panelOpen = false;
  let panel = null;
  let bookmarkBtn = null;
  let tickLayer = null;
  let tooltipEl = null;

  // Undo Toast state
  let undoState = null;      // { type: 'single'|'bulk', item?, index?, listBackup? }
  let toastEl = null;
  let toastTimer = null;

  const STORAGE_KEY = 'ytb_bookmarks'; // { [videoId]: [{ time, label, color }] }

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

  // ---- Undo Toast Notification -------------------------------------------
  function ensureToastContainer() {
    if (toastEl && document.contains(toastEl)) return;
    toastEl = document.createElement('div');
    toastEl.className = 'ytb-toast';
    toastEl.style.display = 'none';
    toastEl.innerHTML = `
      <span class="ytb-toast-msg"></span>
      <button class="ytb-toast-undo">Undo</button>
    `;
    document.body.appendChild(toastEl);

    const undoBtn = toastEl.querySelector('.ytb-toast-undo');
    undoBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      handleUndo();
    });
  }

  function showUndoToast(msg, allowUndo = false) {
    ensureToastContainer();
    clearTimeout(toastTimer);
    toastEl.querySelector('.ytb-toast-msg').textContent = msg;
    const undoBtn = toastEl.querySelector('.ytb-toast-undo');
    
    if (allowUndo && undoState) {
      undoBtn.style.display = 'inline-block';
      undoBtn.textContent = 'Undo';
    } else {
      undoBtn.style.display = 'none';
    }

    toastEl.classList.add('show');
    toastEl.style.display = 'flex';

    toastTimer = setTimeout(() => {
      hideUndoToast();
    }, 5000);
  }

  function hideUndoToast() {
    if (!toastEl) return;
    toastEl.classList.remove('show');
    setTimeout(() => {
      if (toastEl && !toastEl.classList.contains('show')) {
        toastEl.style.display = 'none';
      }
    }, 200);
  }

  async function handleUndo() {
    if (!undoState) return;
    if (undoState.type === 'single' && undoState.item) {
      bookmarks.splice(undoState.index, 0, undoState.item);
    } else if (undoState.type === 'bulk' && undoState.listBackup) {
      bookmarks = [...undoState.listBackup];
    }
    undoState = null;
    hideUndoToast();
    await persistBookmarks();
    renderTicks();
    renderBookmarkList();
  }

  // ---- Bookmark actions --------------------------------------------------
  async function addBookmark(time, label = '', color = 'red') {
    if (!video || time == null || isNaN(time)) return;
    const roundedTime = Math.round(time * 10) / 10;
    const entry = {
      time: roundedTime,
      label: label || `Bookmark @ ${fmtTime(time)}`,
      color: color || 'red'
    };
    bookmarks.push(entry);
    bookmarks.sort((a, b) => a.time - b.time);
    await persistBookmarks();
    renderTicks();

    const addedIndex = bookmarks.findIndex(bm => bm.time === roundedTime);
    
    if (panel) {
      const bmsTab = panel.querySelector('.ytb-tab[data-tab="bookmarks"]');
      if (bmsTab && !bmsTab.classList.contains('active')) {
        bmsTab.click();
      }
    }
    renderBookmarkList(addedIndex);
    undoState = null;
    showUndoToast(`Bookmark added @ ${fmtTime(time)}`, false);
  }

  async function deleteBookmark(index) {
    if (index < 0 || index >= bookmarks.length) return;
    const item = bookmarks[index];
    undoState = { type: 'single', item, index };
    bookmarks.splice(index, 1);
    await persistBookmarks();
    renderTicks();
    renderBookmarkList();
    showUndoToast(`Bookmark @ ${fmtTime(item.time)} deleted`, true);
  }

  async function clearAllBookmarks() {
    if (!bookmarks.length) return;
    if (!confirm('Clear all bookmarks for this video?')) return;
    undoState = { type: 'bulk', listBackup: [...bookmarks] };
    bookmarks = [];
    await persistBookmarks();
    renderTicks();
    renderBookmarkList();
    showUndoToast('All bookmarks cleared', true);
  }

  function setBookmarkColor(index, color) {
    if (index < 0 || index >= bookmarks.length) return;
    bookmarks[index].color = color;
    persistBookmarks();
    renderBookmarkList();
    renderTicks();
  }

  function editBookmarkLabel(index, newLabel, reRender = true) {
    if (index < 0 || index >= bookmarks.length) return;
    const label = (newLabel || '').trim() || `Bookmark @ ${fmtTime(bookmarks[index].time)}`;
    if (bookmarks[index].label === label) return;
    bookmarks[index].label = label;
    persistBookmarks();
    renderTicks();
    if (reRender) renderBookmarkList();
  }

  function jumpTo(time) {
    if (!video || time == null || isNaN(time)) return;
    video.currentTime = time;
    video.classList.add('ytb-seek-flash');
    setTimeout(() => video.classList.remove('ytb-seek-flash'), 400);
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

  // ---- Progress bar tick marks ------------------------------------------
  function ensureProgressBarElements() {
    if (!video) return;
    const bar = $('.ytp-progress-bar');
    if (!bar) return;

    if (!tickLayer || !document.contains(tickLayer)) {
      tickLayer = document.createElement('div');
      tickLayer.className = 'ytb-tick-layer';
      bar.appendChild(tickLayer);
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
      const colorHex = COLOR_MAP[bm.color] || COLOR_MAP.red;
      tick.style.background = colorHex;
      tick.style.boxShadow = `0 0 5px ${colorHex}`;
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

  function showTooltip(e, bm) {
    if (!tooltipEl) return;
    tooltipEl.innerHTML =
      `<div class="ytb-tt-time" style="color:${COLOR_MAP[bm.color] || '#ff4e45'}">${fmtTime(bm.time)}</div>` +
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
        <button class="ytb-tab" data-tab="guide">📖 Guide</button>
      </div>
      <div class="ytb-tab-panel" data-panel="search">
        <input class="ytb-search" type="text" placeholder="Search transcript…" />
        <div class="ytb-search-status"></div>
        <div class="ytb-search-results"></div>
      </div>
      <div class="ytb-tab-panel" data-panel="bookmarks" style="display:none">
        <div class="ytb-bm-toolbar">
          <button class="ytb-add">+ Add Bookmark</button>
          <button class="ytb-clear-all" title="Clear all bookmarks for this video">Clear All</button>
          <button class="ytb-export">Export Markdown</button>
        </div>
        <div class="ytb-bm-list"></div>
      </div>
      <div class="ytb-tab-panel" data-panel="guide" style="display:none">
        <div class="ytb-guide-content">
          <h3>📖 Features &amp; User Guide</h3>
          
          <div class="ytb-guide-section">
            <h4>🔖 1-Click Bookmarking</h4>
            <p>Click the <b>🔖 button</b> in YouTube's video player controls (bottom-right) or press the <b>B key</b> anytime to instantly bookmark the current timestamp.</p>
          </div>

          <div class="ytb-guide-section">
            <h4>✏️ Instant Renaming</h4>
            <p>Adding a bookmark auto-focuses the label field. Type your custom note and press <b>Enter</b> or click away to save. Press <b>Escape</b> to cancel.</p>
          </div>

          <div class="ytb-guide-section">
            <h4>🎨 Color-Coded Tags</h4>
            <p>Click color dots on any bookmark to tag it:
              <br>🔴 <b>Red</b> — Important / Key point
              <br>🟢 <b>Green</b> — Concept / Definition
              <br>🔵 <b>Blue</b> — Reference / Resource
              <br>🟡 <b>Yellow</b> — Review / Question
              <br>Progress bar tick marks automatically update to match the chosen color!
            </p>
          </div>

          <div class="ytb-guide-section">
            <h4>🗑 Deleting &amp; Undo Toast</h4>
            <p>Click <b>🗑</b> to delete a bookmark. A floating <b>Undo Toast</b> appears at the bottom — click <b>Undo</b> within 5 seconds to restore it immediately!</p>
          </div>

          <div class="ytb-guide-section">
            <h4>🔍 Real-Time Transcript Search</h4>
            <p>Use the <b>Search tab</b> to search caption lines in real-time. Click any result line to seek straight to that exact moment.</p>
          </div>

          <div class="ytb-guide-section">
            <h4>📥 Markdown Export</h4>
            <p>Click <b>Export Markdown</b> to download a <code>.md</code> file with clickable timestamp links for note-taking apps like Obsidian or Notion.</p>
          </div>

          <div class="ytb-guide-section">
            <h4>⌨️ Keyboard Shortcuts</h4>
            <table class="ytb-guide-table">
              <tr><td><b>B</b></td><td>Add bookmark</td></tr>
              <tr><td><b>Ctrl+Shift+Y</b></td><td>Toggle side panel</td></tr>
              <tr><td><b>Enter</b></td><td>Save bookmark label</td></tr>
              <tr><td><b>Esc</b></td><td>Cancel label edit</td></tr>
            </table>
          </div>
        </div>
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
    panel.querySelector('.ytb-clear-all').addEventListener('click', clearAllBookmarks);
    panel.querySelector('.ytb-export').addEventListener('click', exportMarkdown);

    const searchInput = panel.querySelector('.ytb-search');
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => renderSearchResults(searchInput.value), 80);
    });
  }

  function setPanelOpen(open) {
    panelOpen = !!open;
    if (!panel) return;
    panel.classList.toggle('open', panelOpen);
  }

  function togglePanel() { setPanelOpen(!panelOpen); }

  // ---- Bookmark list rendering ------------------------------------------
  function renderBookmarkList(focusIndex = -1) {
    if (!panel) return;
    const list = panel.querySelector('.ytb-bm-list');
    if (!list) return;
    list.innerHTML = '';
    if (!bookmarks.length) {
      list.innerHTML = '<div class="ytb-empty">No bookmarks yet. Press <b>B</b> or click 🔖 to add one.</div>';
      return;
    }

    let inputToFocus = null;

    bookmarks.forEach((bm, i) => {
      const color = bm.color || 'red';
      const row = document.createElement('div');
      row.className = 'ytb-bm-row';
      row.innerHTML = `
        <div class="ytb-bm-time" style="color:${COLOR_MAP[color]}">${fmtTime(bm.time)}</div>
        <div class="ytb-bm-colors">
          <span class="ytb-dot red ${color === 'red' ? 'active' : ''}" data-color="red" title="Red tag"></span>
          <span class="ytb-dot green ${color === 'green' ? 'active' : ''}" data-color="green" title="Green tag"></span>
          <span class="ytb-dot blue ${color === 'blue' ? 'active' : ''}" data-color="blue" title="Blue tag"></span>
          <span class="ytb-dot yellow ${color === 'yellow' ? 'active' : ''}" data-color="yellow" title="Yellow tag"></span>
        </div>
        <input class="ytb-bm-label" type="text" value="${escapeHtml(bm.label)}" title="Click to rename" />
        <div class="ytb-bm-actions">
          <button class="ytb-bm-jump" title="Jump to moment">▶</button>
          <button class="ytb-bm-edit" title="Save label">✓</button>
          <button class="ytb-bm-del" title="Delete bookmark">🗑</button>
        </div>
      `;

      row.querySelectorAll('.ytb-dot').forEach(dot => {
        dot.addEventListener('click', () => setBookmarkColor(i, dot.dataset.color));
      });
      row.querySelector('.ytb-bm-jump').addEventListener('click', () => jumpTo(bm.time));
      row.querySelector('.ytb-bm-del').addEventListener('click', () => deleteBookmark(i));
      
      const input = row.querySelector('.ytb-bm-label');
      row.querySelector('.ytb-bm-edit').addEventListener('click', () => editBookmarkLabel(i, input.value, false));

      input.addEventListener('blur', () => editBookmarkLabel(i, input.value, false));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          editBookmarkLabel(i, input.value, false);
          input.blur();
        }
        if (e.key === 'Escape') {
          input.value = bm.label;
          input.blur();
        }
      });

      if (i === focusIndex) {
        inputToFocus = input;
      }

      list.appendChild(row);
    });

    if (inputToFocus) {
      setTimeout(() => {
        inputToFocus.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        inputToFocus.focus();
        inputToFocus.select();
      }, 60);
    }
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
      ensureBookmarkButton();
      ensureProgressBarElements();
      renderTicks();
      return;
    }

    videoId = newVid;
    video = newVideoEl;
    transcript = null;
    transcriptError = false;
    bookmarks = [];

    loadBookmarks(videoId).then((list) => {
      bookmarks = list || [];
      ensureBookmarkButton();
      ensureProgressBarElements();
      renderTicks();
      renderBookmarkList();
      renderSearchResults('');
      ensureTranscript();
    });

    if (!video.__ytbDurWired) {
      video.__ytbDurWired = true;
      video.addEventListener('durationchange', () => { renderTicks(); });
      video.addEventListener('loadedmetadata', () => { renderTicks(); });
    }
  }

  // ---- Bootstrap --------------------------------------------------------
  function boot() {
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('yt-navigate-finish', onRouteChange);
    window.addEventListener('popstate', onRouteChange);

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
