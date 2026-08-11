# YouTube Timeline Bookmark & Transcript Search

A modern Chrome Extension (Manifest V3) designed for video note-taking, study navigation, and real-time transcript searching on YouTube. Bookmark key moments with 1-click, color-code progress bar tick marks, and export timestamped notes to Markdown.

---

## 📦 Installation Guide (One-Time Setup)

Follow these simple steps to load the unpacked extension in Google Chrome:

1. **Download / Clone the Repository**:
   - Save this project folder to a convenient location on your computer.

2. **Open Chrome Extensions Page**:
   - Open Chrome and type `chrome://extensions` into the address bar, then press **Enter**.

3. **Enable Developer Mode**:
   - Turn on the **Developer mode** toggle switch located in the **top-right corner** of the extensions page.

4. **Load Unpacked Extension**:
   - Click the **Load unpacked** button located in the **top-left corner**.
   - Select the project folder (the folder containing `manifest.json`).

5. **Pin Extension (Optional but Recommended)**:
   - Click the **Puzzle Piece (Extensions)** icon in Chrome's top toolbar.
   - Click the **Pin 📌** icon next to **YouTube Timeline Bookmark & Transcript Search** to keep it visible in your toolbar.

---

## 🧭 How to Use Each Feature

### 1. Opening & Closing the Side Panel
- **Method A (Toolbar Icon)**: Click the colorful **Bookmark Icon** in Chrome's top-right extension toolbar.
- **Method B (Keyboard Shortcut)**: Press `Ctrl+Shift+Y` (Mac: `Cmd+Shift+Y`) anywhere on YouTube.
- **Method C (Close Panel)**: Click the **`×`** button in the top-right corner of the panel or press the keyboard shortcut again.

---

### 2. Adding Bookmarks (1-Click & Hotkeys)
Go to any YouTube video (`youtube.com/watch?v=...`):
- **Player Control Bar**: Click the **🔖** button located in YouTube's video control bar (bottom-right, near the settings gear).
- **Keyboard Shortcut**: Press the **`B`** key while watching the video.
- **Side Panel Toolbar**: Click the **`+ Add Bookmark`** button inside the **🔖 Bookmarks** tab.
- **Visual Feedback**: A floating confirmation toast appears on screen (*"Bookmark added @ 02:15"*), and a tick mark appears on the video progress bar at that exact moment.

---

### 3. Instant Inline Renaming & Auto-Focus Editing
- **Auto-Focus on Add**: Adding a bookmark automatically opens/switches to the **🔖 Bookmarks** tab and selects the new bookmark's label input field so you can immediately type a custom name.
- **Editing Existing Bookmarks**: Click on any bookmark's text box in the panel.
- **Saving Edits**: Press **Enter** or click away (**blur**) — changes save automatically. You can also click the **`✓`** button.
- **Canceling Edits**: Press **Escape** to restore the previous label text.

---

### 4. Color-Coded Category Tags & Progress Bar Ticks
Organize your video notes by topic or priority using 4 distinct color tags:
- **Assigning a Tag**: Click any of the color dots in a bookmark row:
  - 🔴 **Red**: Important / Default
  - 🟢 **Green**: Key Concept / Definition
  - 🔵 **Blue**: Reference / Code Example
  - 🟡 **Yellow**: Review / Question
- **Interactive Player Ticks**: The tick mark on YouTube's progress bar dynamically inherits the assigned tag color and glow. Hover over any tick mark on the video player to view its timestamp and note label in a floating tooltip, or click it to seek there instantly.

---

### 5. In-Panel Features & User Guide Tab (📖 Guide)
Access built-in help and instructions directly within the extension:
1. Open the side panel and click the **`📖 Guide`** tab.
2. View quick instructions for 1-click bookmarking, auto-focus renaming, color tags, transcript search, undo notifications, and keyboard shortcuts without leaving YouTube!

---

### 6. Deleting Bookmarks & Floating Undo Toast
- **Deleting a Single Bookmark**: Click the **`🗑`** button next to any bookmark row.
- **Floating Undo Toast**: When a bookmark is deleted, a floating notification appears at the bottom center of the screen (*"Bookmark @ 01:25 deleted — [Undo]"*). Click **Undo** within 5 seconds to restore it instantly!
- **Bulk Clear All**: Click **`Clear All`** in the Bookmarks toolbar to wipe all bookmarks for the current video. A confirmation prompt prevents accidental clears, and the Undo Toast allows restoring the entire list if needed.


---

### 7. Real-Time Transcript Search
1. Open the side panel and click the **`🔍 Search`** tab.
2. Type any keyword or phrase into the search box.
3. The transcript filters in real-time showing matching lines with highlighted search terms.
4. Click any search result line to jump directly to that exact moment in the video.
5. *Note*: If the video does not have captions enabled, the tab will display *"Transcript unavailable for this video."*

---

### 8. Exporting Bookmarks to Markdown
1. Open the **🔖 Bookmarks** tab.
2. Click **`Export Markdown`**.
3. A `.md` file (e.g. `bookmarks-VIDEO_ID.md`) will download containing timestamped markdown links formatted as:
   ```markdown
   # Bookmarks — VIDEO_ID

   - [01:15](https://www.youtube.com/watch?v=VIDEO_ID&t=75s) Intro & Overview
   - [04:30](https://www.youtube.com/watch?v=VIDEO_ID&t=270s) Key Concept Explanation
   ```

---

## ⌨️ Summary Keyboard Shortcuts

| Shortcut | Action | Location |
| :--- | :--- | :--- |
| **`B`** | Add bookmark at current timestamp | Anywhere on YouTube video page |
| **`Ctrl + Shift + Y`** *(Mac: `Cmd + Shift + Y`)* | Toggle side panel open/closed | Anywhere on YouTube |
| **`Enter`** | Save bookmark label | Label input field |
| **`Escape`** | Cancel label editing | Label input field |

---

## ❓ Frequently Asked Questions & Troubleshooting

- **Q: The extension icon looks gray or nothing happens when clicking.**
  - **Fix**: Go to `chrome://extensions` and click the **Reload (↻)** button on the extension card so Chrome registers the updated background service worker.

- **Q: Bookmarks didn't load after clicking a video from the YouTube homepage.**
  - **Fix**: The extension includes SPA observers to track video switches automatically. If a video player swap fails due to network lag, simply click the toolbar icon to refresh the panel.

- **Q: Are my bookmarks saved when I close Chrome?**
  - **Fix**: Yes! All bookmarks are stored locally in Chrome's storage per video ID and persist across browser restarts.


