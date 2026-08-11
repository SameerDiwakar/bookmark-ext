// Background service worker (MV3).
// Handles toolbar action click & keyboard shortcut to toggle side panel.

chrome.runtime.onInstalled.addListener(() => {
  console.log('[YT Bookmarks] installed');
});

// Toggle side panel when extension action icon in toolbar is clicked
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'YTB_TOGGLE_PANEL' }).catch(() => {});
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'toggle-panel') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  chrome.tabs.sendMessage(tab.id, { type: 'YTB_TOGGLE_PANEL' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Lightweight ping so content scripts can confirm the worker is alive.
  if (msg && msg.type === 'YTB_PING') {
    sendResponse({ ok: true });
  }
  return true;
});

