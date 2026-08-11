// transcriptFetcher.js
// Fetches a YouTube video's caption track and parses it into a flat list of
// { start, duration, text } segments. Uses only native window.fetch against
// youtube.com endpoints (same-origin, cookies included) so it does not trip
// Brave Shields or ad-block CORS-proxy rules.
//
// Exposed as a global `TranscriptFetcher` (content scripts share an isolated
// world, so globals are visible across listed content-script files).

(function () {
  'use strict';

  function extractPlayerResponse(html) {
    const marker = 'ytInitialPlayerResponse';
    const startIdx = html.indexOf(marker);
    if (startIdx === -1) return null;
    const eq = html.indexOf('=', startIdx);
    if (eq === -1) return null;
    let i = eq + 1;
    // skip whitespace
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

  function pickTrack(tracks) {
    if (!tracks || !tracks.length) return null;
    // Prefer an English track; prefer non-ASR (manual) captions over ASR.
    const en = tracks.filter(t => (t.languageCode || '').startsWith('en'));
    const pool = en.length ? en : tracks;
    const manual = pool.filter(t => !t.kind || t.kind !== 'asr');
    return (manual.length ? manual : pool)[0];
  }

  async function fetchCaptionTracks(videoId) {
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

  async function fetchTranscript(videoId) {
    const tracks = await fetchCaptionTracks(videoId);
    if (!tracks.length) return null;
    const track = pickTrack(tracks);
    if (!track) return null;
    let baseUrl = track.baseUrl || '';
    if (!baseUrl) return null;
    // fmt=json3 returns structured events with timings and text.
    const sep = baseUrl.indexOf('?') === -1 ? '?' : '&';
    const txUrl = `${baseUrl}${sep}fmt=json3`;
    const res = await fetch(txUrl, { credentials: 'include' });
    if (!res.ok) throw new Error(`timedtext fetch failed: ${res.status}`);
    const data = await res.json();
    const parsed = parseJson3(data);
    return parsed.length ? parsed : null;
  }

  self.TranscriptFetcher = { fetchTranscript, fetchCaptionTracks };
})();
