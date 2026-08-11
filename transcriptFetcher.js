// transcriptFetcher.js
// Fetches YouTube video caption tracks (both manual & auto-generated ASR)
// and parses them into a flat list of { start, duration, text } segments.

(function () {
  'use strict';

  function extractPlayerResponse(html) {
    if (!html) return null;
    const marker = 'ytInitialPlayerResponse';
    const startIdx = html.indexOf(marker);
    if (startIdx === -1) return null;
    const eq = html.indexOf('=', startIdx);
    if (eq === -1) return null;
    let i = eq + 1;
    while (i < html.length && /\s/.test(html[i])) i++;
    if (html[i] !== '{') return null;
    let depth = 0;
    const begin = i;
    let inStr = false;
    let esc = false;
    for (; i < html.length; i++) {
      const ch = html[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) { i++; break; }
      }
    }
    const slice = html.slice(begin, i);
    try { return JSON.parse(slice); } catch (e) { return null; }
  }

  function getDOMPlayerResponse() {
    try {
      // Check window property if exposed
      if (window.ytInitialPlayerResponse && window.ytInitialPlayerResponse.captions) {
        return window.ytInitialPlayerResponse;
      }
      // Scan inline script elements in active document
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const text = s.textContent || '';
        if (text.includes('ytInitialPlayerResponse')) {
          const pr = extractPlayerResponse(text);
          if (pr && pr.captions) return pr;
        }
      }
    } catch (e) {}
    return null;
  }

  function pickTrack(tracks) {
    if (!tracks || !tracks.length) return null;
    
    // 1. Manual English
    const manualEn = tracks.filter(t => (t.languageCode || '').startsWith('en') && (!t.kind || t.kind !== 'asr'));
    if (manualEn.length) return manualEn[0];

    // 2. Auto-generated English (ASR)
    const asrEn = tracks.filter(t => (t.languageCode || '').startsWith('en') && t.kind === 'asr');
    if (asrEn.length) return asrEn[0];

    // 3. Manual non-English
    const manualAny = tracks.filter(t => !t.kind || t.kind !== 'asr');
    if (manualAny.length) return manualAny[0];

    // 4. Any track available (including ASR auto-generated in any language)
    return tracks[0];
  }

  async function fetchCaptionTracks(videoId) {
    // 1. Try instant DOM extraction from active YouTube player
    const domPr = getDOMPlayerResponse();
    if (domPr) {
      const domTracks = (((domPr.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || [];
      if (domTracks.length) return domTracks;
    }

    // 2. Fallback to watch page fetch
    const url = `https://www.youtube.com/watch?v=${videoId}&hl=en`;
    const res = await fetch(url, { credentials: 'include' });
    if (!res.ok) throw new Error(`watch page fetch failed: ${res.status}`);
    const html = await res.text();
    const pr = extractPlayerResponse(html);
    if (!pr) return [];
    const tracks = (((pr.captions || {}).playerCaptionsTracklistRenderer || {}).captionTracks) || [];
    return tracks;
  }

  function parseJson3(data) {
    const events = Array.isArray(data.events) ? data.events : [];
    const out = [];
    for (const ev of events) {
      if (ev == null) continue;
      const start = (ev.tStartMs != null) ? ev.tStartMs / 1000 : null;
      const duration = (ev.dDurationMs != null) ? ev.dDurationMs / 1000 : 0;
      let text = '';
      if (Array.isArray(ev.segs)) {
        text = ev.segs.map(s => (s && s.utf8) ? s.utf8 : '').join('');
      }
      text = text.replace(/\n/g, ' ').trim();
      if (start != null && text) out.push({ start, duration, text });
    }
    return out;
  }

  function parseXmlCaptions(xmlStr) {
    try {
      const parser = new DOMParser();
      const xml = parser.parseFromString(xmlStr, 'text/xml');
      const nodes = xml.querySelectorAll('text');
      const out = [];
      nodes.forEach(node => {
        const start = parseFloat(node.getAttribute('start'));
        const dur = parseFloat(node.getAttribute('dur') || '0');
        let text = (node.textContent || '').replace(/\n/g, ' ').trim();
        text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        if (!isNaN(start) && text) {
          out.push({ start, duration: isNaN(dur) ? 0 : dur, text });
        }
      });
      return out;
    } catch (e) {
      return [];
    }
  }

  async function fetchTranscript(videoId) {
    const tracks = await fetchCaptionTracks(videoId);
    if (!tracks || !tracks.length) return null;
    
    const track = pickTrack(tracks);
    if (!track) return null;

    let baseUrl = track.baseUrl || '';
    if (!baseUrl) return null;

    // Attach fmt=json3
    const sep = baseUrl.indexOf('?') === -1 ? '?' : '&';
    const txUrl = `${baseUrl}${sep}fmt=json3`;
    
    const res = await fetch(txUrl, { credentials: 'include' });
    if (!res.ok) throw new Error(`timedtext fetch failed: ${res.status}`);

    const rawText = await res.text();
    let parsed = [];

    // Try parsing as JSON first, fallback to XML if YouTube returned srv XML
    try {
      const jsonData = JSON.parse(rawText);
      parsed = parseJson3(jsonData);
    } catch (e) {
      parsed = parseXmlCaptions(rawText);
    }

    return parsed.length ? parsed : null;
  }

  self.TranscriptFetcher = { fetchTranscript, fetchCaptionTracks };
})();

