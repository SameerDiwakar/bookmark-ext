// Background service worker (MV3).
// Handles the optional keyboard command and relays a toggle message to the active tab.

chrome.runtime.onInstalled.addListener(() => {
  console.log('[YT Bookmarks] installed');
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'YTB_TOGGLE_PANEL' }).catch(() => {
    // content script may not be loaded on non-watch pages; ignore
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Lightweight ping so content scripts can confirm the worker is alive.
  if (msg && msg.type === 'YTB_PING') {
    sendResponse({ ok: true });
  }
  return true;
});
