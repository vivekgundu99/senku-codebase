# Senku V3 — Architecture & Specification Document

> **Static Context for AI Agents & Developers:**
> - **Product**: Senku (Version 3.0.0) — A personal student context hub & workspace for PC (Windows), local-first, offline, and quiet.
> - **Core Philosophy**: Quiet, almost-empty UI, powerful behavior. When in doubt, remove. No unneeded colors, animations, emojis, or helper text. Reuses standard tokens: `--bg`, `--surface`, `--ink`, `--muted`, `--soft`, `--line`, `--hover`, `--green`.
> - **Safety Rules**:
>   - Operating System: Windows (PowerShell / CMD). Builds run via `cmd.exe /c npm run build`.
>   - Storage isolation: Development environment storage is isolated to `%APPDATA%\senku-dev` so installed releases remain unaffected.
>   - File Safety Rule: Senku only reads and launches user files. It NEVER deletes, renames, or modifies files in the user's workspace folders.
> - **Technology Stack**:
>   - Electron 35 + TypeScript + Vite.
>   - Vanilla TypeScript renderer with direct DOM reconciliation; no heavyweight frameworks.
>   - Vanilla CSS design tokens; no Tailwind.
>   - Local filesystem persistence (Markdown for notes/logs, JSON for settings/metadata).

---

## 1. Core Architecture & Storage Model

### 1.1 Data Structure
UserData directory layout:
```
senku/
├── settings.json              # Global user settings (userName, greeting, windowBounds, overlayPosition)
├── spaces.json                # List of spaces (id, name, masterFolder, pinnedPaths)
├── trash-spaces.json          # Soft-deleted spaces
└── spaces/
    └── <spaceId>/
        ├── meta.json          # Space metadata (activeNoteId, lastLogSeq)
        ├── launchpads.json    # Launchpads in this space
        ├── log/
        │   └── YYYY-MM-DD.md  # Daily log entries
        └── notes/
            └── <noteName>.md  # Notes markdown files
```

### 1.2 Spaces
- A Space groups a student's context: linked project folder, notes, logs, and launchpads.
- Switching spaces preserves the current view without jarring transitions.
- Deleting a space moves it to Trash with restore/purge capabilities.

---

## 2. Views & Navigation

- **View Keys**:
  - `Home`: Student dashboard featuring greeting, quick capture, recent activity, launchpads, and the Space Files explorer.
  - `Overview`: Space-specific overview dashboard.
  - `Log`: Space log entries with sequence numbers, date filtering, search, and inline editing.
  - `AllLog`: Merged chronological view of log entries across all Spaces.
  - `Launchpads`: One-click context launchers with pin-to-home support.
  - `Notes`: Distraction-free markdown notes editor with quick append.
- **Keyboard Shortcuts**:
  - `H`: Home
  - `S`: Overview
  - `L`: Log
  - `P`: Launchpads
  - `N`: Notes
  - `O`: Toggle Floating Quick-Note Overlay
  - `R`: Up one directory in files explorer
  - `/`: Focus search input on active view
  - `Esc`: Clear search / blur input to restore shortcuts

---

## 3. Quiet Log System

- **Line Format**: `- HH:MM #N text`
- **Monotonic Numbering**: Every entry has a sequence number (`#N`) unique and permanent per Space. Numbers increment monotonically via `lastLogSeq` and are never reused after deletes.
- **Global Log**: No duplicate global log file. `AllLog` is dynamically derived by merging day files from every space at read time.
- **Controls & Features**:
  - Quick compose input (Enter submits).
  - `#N` sequence number filtering and substring text search.
  - Native `<input type="date">` filter with clear `✕`.
  - Double-click inline editing (Enter saves, Esc cancels).
  - Soft delete with immediate Undo toast.

---

## 4. Launchpads

- Groups related project files, folders, and browser URLs into one-click decks.
- Cards show clean icons (folder SVG, file-type SVG, hostname for URLs; no emojis).
- Pin-to-home (`☆`/`★`): Pinned launchpads appear prominently on Home.
- Remembers `lastLaunchedAt` timestamp and opens items sequentially.

---

## 5. Notes System & Import / Export

- Markdown notes stored as pure `.md` files under the space's `notes/` directory.
- Two-column layout: note list on the left, editor + quick append on the right.
- Inline title renaming and auto-scroll on append.
- **Book Markdown Format**:
  ```markdown
  <!-- senku-book: {SpaceName} -->

  <!-- page: {title} -->
  # {title}

  {content}
  ```
- **Import / Export**:
  - `Export Note`: Exports active note as `.md`.
  - `Export all notes…` (Palette): Exports all notes into a single book markdown file.
  - `Import notes…` (Palette): Imports `.md`, `.markdown`, or `.txt` files; recognizes book format to recreate pages with natural ordering and deduplicated names.

---

## 6. Floating Quick-Note Overlay

- Independent floating `BrowserWindow` (`alwaysOnTop: true`, `frame: false`, 48px height).
- Position remembered in `settings.overlayPosition` (verified on-screen; centered ~15% from top by default).
- Draggable pen handle, active note badge (`✎ [NoteName]`), single clean input, and dismiss `✕`.
- Appends raw snippet directly to active note on `Enter` with instant visual flash feedback and live renderer refresh.

---

## 7. Search & Global CSS Hygiene

- **Compact Search**: 150px width expanding to 240px on `:focus` with placeholder `Search`. Counter hidden when not filtering; displays `M of N` while filtering.
- **Scrollbars**: Thin 8px scrollbars (`scrollbar-width: thin; scrollbar-color: var(--line) transparent;`) with transparent track across all scrollable containers.
- **Selection**: `background: var(--green-pale); color: var(--ink)`.
- **Focus Rings**: `:focus-visible` ring (`outline: 2px solid var(--green); outline-offset: 2px`) for clickable buttons, nav items, and rows.
- **User Selection**: UI chrome (buttons, nav, sidebar, file metadata) is non-selectable; notes and logs remain selectable.
