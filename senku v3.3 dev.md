# Senku v3.3-dev Architecture & Implementation Plan

**Author:** Antigravity AI & Creator  
**Target Version:** Senku 3.3.0-dev  
**Branch:** `v3.3-dev`  
**Date:** October 2026  

---

## 1. Vision & Core Philosophy

Senku is a **distraction-free personal cockpit**, not an IDE. It bridges daily logging, workspace file awareness, and rapid note capture without cognitive overhead or UI thrashing.

### The 5 Tenets of Senku v3.3:
1. **Zero UI Thrashing:** Capturing thoughts via the floating overlay must never cause main window file re-scans or DOM wipes. Background writes happen silently.
2. **Strict Separation of Viewers:**
   - **Simple MD Preview:** Pure, read-only viewer for external workspace `.md` files. Has an "Open in Default App" button and close `[✕]`. No in-place editing.
   - **Senku Notes:** The dedicated, raw multipage scratchpad linked strictly to `Documents/Senku Notes/senku.md` with auto-saving, page navigation, and capture history.
3. **Spaces as Persistent Sidebar Tabs:**
   - Spaces shown in the sidebar function like browser/editor tabs (`openSpaceIds`).
   - Open tabs persist across app restarts.
   - Tabs can be closed, but the last remaining tab cannot be removed.
   - Topbar displays the current space and opens an alphabetical dropdown of all spaces for quick switching and opening.
4. **Adaptive Split-Pane Geometry:**
   - File Manager automatically compresses to compact mode when reading a note or viewing a preview.
   - File Manager automatically re-expands to full 50/50 balance when returning to Space Overview (Home).
   - Home Overview has zero pills—pure focus on Recent Logs and micro-logging.
5. **Zero Migration Overhead:**
   - Internal dogfooding project. No migration code or legacy fallbacks needed.

---

## 2. Terminology & State Model

To eliminate confusion between the global catalog of spaces, the open sidebar tabs, and the currently focused space, Senku v3.3 introduces clear terminology:

| Legacy Term | New Term (v3.3) | Type / Location | Description |
|---|---|---|---|
| `workspaces` | **All Spaces** (`workspaces`) | `Workspace[]` in `electron/types.ts` | The complete library/catalog of all spaces registered in Senku. |
| *None (implied)* | **Open Spaces / Sidebar Tabs** (`openSpaceIds`) | `string[]` in `Settings` & `AppSnapshot` | IDs of the spaces currently pinned/open as tabs in the sidebar. Persisted in `settings.json`. |
| `activeWorkspaceId` | **Active Space / Current Space** (`activeWorkspaceId`) | `string` in `Settings` & `AppSnapshot` | The specific space currently selected and displayed in the main window. Must always be an element of `openSpaceIds`. |
| `homeCenterMode` | **Center Mode** (`'overview' \| 'preview' \| 'notes'`) | `state.ts` | `'overview'` (Home log station), `'preview'` (Simple MD Preview), or `'notes'` (Senku Notes). |

### Tab Lifecycle Rules:
1. **App Startup:**
   - Senku loads `openSpaceIds` from `settings.json`.
   - If `openSpaceIds` is missing, empty, or points to missing spaces, it initializes with `[activeWorkspaceId]` (or the first available workspace).
   - If `activeWorkspaceId` is not inside `openSpaceIds`, `activeWorkspaceId` defaults to `openSpaceIds[0]`.
2. **Switching Spaces via Topbar / Command Palette:**
   - If the selected space is already in `openSpaceIds`, set `activeWorkspaceId` to it.
   - If the selected space is NOT in `openSpaceIds`, append it to `openSpaceIds`, save settings, and set `activeWorkspaceId`.
3. **Closing a Space Tab (`✕`):**
   - **Guard rule:** If `openSpaceIds.length === 1`, closing is blocked. Senku displays a toast: `"Cannot remove the last space from sidebar"`.
   - If the tab being closed is the currently `activeWorkspaceId`, Senku automatically switches `activeWorkspaceId` to the nearest sibling tab before removing the tab ID from `openSpaceIds`.
   - Closing a tab only removes it from the sidebar; the space remains intact in the global catalog and can be reopened anytime from the topbar or command palette.

---

## 3. Component Specifications

### 3.1. Floating Overlay (Ultra-Minimalist Capture)

- **Target:** Dedicated exclusively to `Documents/Senku Notes/senku.md`.
- **UI Layout:**
  - `[✎]` (Pencil drag handle on left, `#overlay-drag-handle`)
  - `[Input Textarea]` (Expands to fill all remaining width; `#overlay-target-name` label removed)
  - `[✕]` (Close button on right)
- **Save Behavior:**
  - Pressing <kbd>Enter</kbd> (or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>) appends text to `Documents/Senku Notes/senku.md`.
  - Delimiter prepended: `\n\n<!-- pagebreak -->\n\n`.
  - If `senku.md` does not exist, it creates the file with the text.
  - Brief green border flash indicates save confirmation.
  - **Zero IPC Broadcast:** Does **NOT** broadcast `snapshot:updated` or trigger a file tree re-scan in the main window.
- **Removed Bloat:**
  - Removed "Log" mode toggle in overlay.
  - Removed mode label pill.

### 3.2. Simple MD Preview (Workspace File Viewer)

- **Purpose:** Fast, read-only preview of `.md` files located in the active space or its subfolders.
- **Trigger:** Clicking any `.md` file in the File Manager.
- **Split-Pane Transition:** File Manager automatically compresses to compact mode.
- **Header:**
  - Left: File name (with markdown file icon).
  - Right:
    - `[Open in Default App]` button (calls `window.senku.openPath(filePath)` via OS default handler).
    - `[✕]` Close button.
  - **Removed:** `+ Note` button, `Edit / Preview` pill toggle, in-place textarea editor, save status indicator.
- **Exit Action:**
  - Pressing <kbd>Esc</kbd> or clicking `[✕]` closes the preview.
  - File Manager automatically re-expands to full 50/50 balance.
  - Center pane restores Space Overview (Recent Logs + Log Station).

### 3.3. Senku Notes (Global Multipage Notebook)

- **Purpose:** Dedicated markdown scratchpad and multipage personal notebook living in `Documents/Senku Notes/`.
- **Trigger:** Clicking **"Notes"** in the Sidebar.
- **Default Note & View Modes:**
  - `senku.md` always opens in **Edit mode** (`isNotePreviewMode = false`), in **Page mode** (`isNoteAllPagesView = false`), viewing the **last page** (`pages.length - 1`), directly ready for typing where floating captures land.
  - Other notes in `Documents/Senku Notes/` open in **Preview mode** (`isNotePreviewMode = true`) by default.
  - Newly created notes (`+` button) open in **Edit mode** on page 1.
- **File Manager in Notes Mode:**
  - Automatically compressed to compact mode, displaying the contents of `Documents/Senku Notes/`.
  - Shows a dedicated **`+` (New Note)** button in the toolbar (hidden in regular workspace mode).
  - Clicking `+` prompts for a custom note name and creates `<name>.md` inside `Documents/Senku Notes/`.
  - Clicking any `.md` file in the File Manager switches active note in the editor directly.
- **Notes Header:**
  - File name display.
  - Save status indicator (`saved` / `unsaved`).
  - `[Edit / Preview]` toggle button.
  - `[↗ Open]` button to open note in default OS application.
- **Pagebreak Delimiter:**
  - Separator: `\n\n<!-- pagebreak -->\n\n`
  - Split Regex: `/(?:^|\r?\n)\s*<!--\s*pagebreak\s*-->\s*(?:\r?\n|$)/` (strictly line-isolated so occurrences of "pagebreak" inside prose or code blocks are never treated as page dividers).
- **Default Page on Load:**
  - Always defaults to the **last page** (`pages.length - 1`), where the newest entries and overlay captures land.
- **Editor Typography:**
  - Modern neutral system font stack: `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`.
  - Font size: `14px`, line-height: `1.7`.
- **Bottom Pagination Bar:**
  - `[Page view / All]` toggle.
  - `[+ Page]` button (appends `<!-- pagebreak -->` and focuses the new blank page).
  - Page navigation numbers (`1 2 3 ...`) with prev/next arrows.
  - Delete page button (with confirmation).
- **Exit Action:**
  - Clicking **Home** or any Space in the sidebar navigates back to the workspace and automatically re-expands the File Manager.

### 3.4. Sidebar Spaces as Tabs

- **Rendering:**
  - Sidebar renders only spaces listed in `openSpaceIds`.
  - Each space row contains:
    - First-letter monogram badge.
    - Space name.
    - Close button `[✕]` on hover (hidden or disabled if `openSpaceIds.length <= 1`).
    - Settings gear icon if active.
- **Add Space Button (`+`):**
  - Located in the `SPACES` section header.
  - Clicking opens a menu or modal offering:
    1. "Open Existing Space" (from spaces not currently in sidebar).
    2. "Create New Space" (pick name & master folder).

### 3.5. Topbar Space Switcher (Global Directory)

- **Display:** Pill showing the current active space name.
- **Click Behavior:** Opens an alphabetical popover/dropdown listing **all spaces** in the library.
- **Action on Select:**
  - Switches active space immediately.
  - Adds the space to `openSpaceIds` if not already open as a sidebar tab.
  - Updates snapshot and saves settings.

### 3.6. Global Refresh (Soft Restart)

- **Trigger:** <kbd>r</kbd> shortcut or Topbar Refresh button.
- **Behavior:** Acts as a clean soft reset to Home Overview of the current active space:
  - Closes any active Simple MD Preview.
  - Resets center mode back to `'overview'`.
  - Re-reads file tree and logs from disk.
  - Clears transient filter inputs.

---

## 4. Step-by-Step Implementation Plan

### Phase 1: Data Model & Backend Storage (`electron/`)
- [ ] **Task 1.1:** Update `electron/types.ts`:
  - Add `openSpaceIds: string[]` to `Settings`.
  - Add `openSpaceIds: string[]` to `AppSnapshot`.
- [ ] **Task 1.2:** Update `electron/storage.ts`:
  - Ensure default settings populate `openSpaceIds: [defaultWorkspaceId]`.
  - Add validation helper: ensure `openSpaceIds` contains valid IDs and at least one workspace.
- [ ] **Task 1.3:** Update `electron/main.ts`:
  - Add IPC handlers:
    - `spaces:open-tab(spaceId: string)`: Appends space to `openSpaceIds`, sets as active, returns snapshot.
    - `spaces:close-tab(spaceId: string)`: If `openSpaceIds.length > 1`, removes space; if active, reassigns active to adjacent space; returns snapshot.
  - Update `notes:append-active`:
    - Set target path to `path.join(globalNotesDir(), 'senku.md')`.
    - Format append with `\n\n<!-- pagebreak -->\n\n${trimmed}\n`.
    - **Remove** `mainWindow?.webContents.send('snapshot:updated')`.
  - Update `notes:get-or-create-quicknote`:
    - Point to `senku.md` instead of `QuickNote.md`.
  - Comment out/remove migration code in `migrateNotesToGlobal()`.

### Phase 2: Delimiters & Typography (`src/utils.ts`, `src/styles/`)
- [ ] **Task 2.1:** Update `src/utils.ts`:
  - `PAGE_SEPARATOR = '\n\n<!-- pagebreak -->\n\n'`.
  - `PAGE_SPLIT_REGEX = /(?:^|\r?\n)\s*<!--\s*pagebreak\s*-->\s*(?:\r?\n|$)/`.
- [ ] **Task 2.2:** Update `src/styles/home.css`:
  - Update `.notes-window-editor` font family to `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`.
  - Set font size to `14px` and line-height to `1.7`.

### Phase 3: Floating Overlay Redesign (`src/overlay.*`, `src/styles/overlay.css`)
- [ ] **Task 3.1:** In `src/overlay.html`:
  - Remove `#overlay-target-name`.
  - Ensure `#overlay-drag-handle` remains the drag target.
  - Update textarea placeholder: `"Write note · Shift+Enter for new line"`.
- [ ] **Task 3.2:** In `src/styles/overlay.css`:
  - Remove styles for `.overlay-mini-note`.
  - Let `textarea.overlay-mini-input` flex to fill available width.
- [ ] **Task 3.3:** In `src/overlay.ts`:
  - Remove mode switching logic (`'Note' | 'Log'`).
  - Always submit to `window.senku.appendToActiveNote(text)`.

### Phase 4: Simple MD Preview (Workspace File Viewer)
- [ ] **Task 4.1:** In `src/state.ts`:
  - Ensure `homeCenterMode` supports `'overview' | 'preview' | 'notes'`.
  - Store `activePreviewFile: { path: string; name: string; content: string } | null`.
- [ ] **Task 4.2:** In `src/markup/home.ts`:
  - Build `simpleMdPreviewMarkup(file)`:
    - Header: filename on left, `[Open in Default App]` + `[✕]` on right.
    - Body: pure read-only rendered markdown.
    - No editor textarea, no `+ Note`, no mode toggle pill.
  - In `overviewPanelMarkup()`:
    - When `homeCenterMode === 'preview'`, render `simpleMdPreviewMarkup`.
    - When `homeCenterMode === 'notes'`, render `notesWindowMarkup`.
    - When `homeCenterMode === 'overview'`, render `homePanelV3Markup` with **zero pills**.
- [ ] **Task 4.3:** In `src/events/files.ts` & `src/events/home.ts`:
  - Clicking a `.md` file sets `homeCenterMode = 'preview'`, loads content, and auto-compresses File Manager (`setFilesSplitCompressed(true)`).
  - Clicking `[Open in Default App]` calls `window.senku.openPath(file.path)`.
  - Clicking `[✕]` or pressing <kbd>Esc</kbd> clears preview, restores `homeCenterMode = 'overview'`, and re-expands File Manager (`setFilesSplitCompressed(false)`).

### Phase 5: Senku Notes (Global Multipage Canvas)
- [ ] **Task 5.1:** In `src/renderer.ts` & `src/events/sidebar.ts`:
  - Clicking sidebar "Notes" loads `Documents/Senku Notes/senku.md`.
  - Auto-compresses File Manager to `Documents/Senku Notes`.
  - If `senku.md` exists, parses pages and sets `activeNotePageIndex = pages.length - 1` (last page view).
  - If not found, shows clean "+ Create senku.md" prompt.
- [ ] **Task 5.2:** Exiting Notes (clicking Home or Space tab) restores workspace path and re-expands File Manager.

### Phase 6: Spaces as Tabs in Sidebar & Topbar Switcher
- [ ] **Task 6.1:** In `src/markup/sidebar.ts`:
  - Filter spaces displayed in sidebar to strictly match `openSpaceIds`.
  - Render close button `[✕]` on each space row (disabled/hidden if `openSpaceIds.length === 1`).
  - Render `+ Add Space` button in header.
- [ ] **Task 6.2:** In `src/events/sidebar.ts`:
  - Handle clicking tab close button: calls `spaces:close-tab`.
  - If only 1 space open, show toast/notification.
  - Handle clicking `+ Add Space`: open modal with option to pick existing space or create new.
- [ ] **Task 6.3:** In `src/markup/topbar.ts` & `src/events/topbar.ts`:
  - Topbar space pill displays current active space.
  - Clicking space pill toggles an alphabetical dropdown list of all spaces in `state.workspaces`.
  - Selecting a space switches to it and opens it as a sidebar tab if not already open.

### Phase 7: Global Refresh (Soft Restart)
- [ ] **Task 7.1:** In `src/events/topbar.ts` & `src/events/global.ts`:
  - Refresh button / <kbd>r</kbd> key resets center mode to `'overview'`, clears preview state, and re-fetches current workspace files and logs.

### Phase 8: Verification & Packaging
- [ ] **Task 8.1:** Typecheck and build: `npm.cmd run build`.
- [ ] **Task 8.2:** Test package build: `npm.cmd run package:win`.
- [ ] **Task 8.3:** Verify all requirements against user prompt.

