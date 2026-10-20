# SENKU V3 — PROMPT 5: COMPACT SEARCH, NOTES IMPORT/EXPORT, MICRO UX PATCHES (paste this whole message into the agent chat)

You are continuing work on **Senku** (Electron + Vite + TypeScript, vanilla TS renderer, fully offline). Home/Overview/Log/Launchpads work is done. This pass is many **small** patches plus one notes feature. Every item is independent: finish one, build, move on.

## 0. Identity law (unchanged)
Senku is **quiet**: almost-empty UI, strong features. When in doubt, remove. No new colors, fonts, shadows, emoji, badges, helper paragraphs, or animations (no transitions). Reuse CSS variables. Do not add anything not listed. Do not ask me questions; pick the simplest option and report it.

## Rules
1. Run the project's typecheck/build after each phase; never leave it non-compiling.
2. Read the existing code before changing it. Keep IPC signatures unless an item says otherwise. New settings fields are optional.
3. New IPC → wire `main.ts`, `preload.ts`, `src/env.d.ts`. Mutations via `handleLocked`.
4. Delete dead code/CSS you orphan.
5. Final report: per item, files + function/selector names, assumptions, test output, anything unverified. Do not claim a visual result you did not check.

## PHASE 1 — Search boxes, keyboard, wording

**1.1 Compact search.** Every search/filter input (`#file-filter`, `#log-search`, any other) becomes small and plain:
- Placeholder is just `Search`.
- Fixed width ~150px, height 30px, `--line` border, radius 8px, transparent background; on `:focus` the width becomes ~240px (no transition).
- The file panel's count label (`3 items`) is hidden when no filter is typed; while filtering it shows `M of N`. The same rule for the log count where it sits next to the filter.

**1.2 `/` focuses search.** Pressing `/` (not while typing in an input/textarea/contenteditable, not with a modal or the palette open) focuses the first visible search input of the current view and prevents the `/` from being typed. Register it in `shortcuts.ts`.

**1.3 Esc.** In any input outside modals/palette: `Esc` clears a non-empty search input first; if it is already empty (or the input is not a search), `Esc` blurs it, so the single-letter shortcuts work again.

**1.4 Capture wording.** The capture inputs (Overview, Home, Log compose): placeholder `Log what you did…` (Home keeps `Log to {Space}…`). **Remove the `Log ↵` button** from Overview (Enter submits) and its CSS.

**1.5 Files panel header.** Title `Files and folders` → `Files`. Quick-action buttons become `Code`, `Terminal`, `Explorer` (no `↗`), 12px, `--muted`. Tooltips keep the long names.

**1.6 Modals focus.** On open, every modal focuses its first text input (select its text if it is prefilled). `Enter` submits (already the case for forms); do not change anything else in modals.

**1.7 New note focus.** After creating a note, put the cursor in the note editor (`#notes-editor`), not in the title.

## PHASE 2 — Notes: import and export (pure logic first)

A Space is the "book": its notes are its pages. No new hierarchy, no new buttons on the notes screen. Features live in the command palette and the existing Export button.

**storage.ts additions (pure, no electron imports):**
- `buildBookMarkdown(spaceName, notes)` → string. Pages sorted by **natural, case-insensitive name order** (so `2` < `10`). Format, exactly:
```
<!-- senku-book: {spaceName} -->

<!-- page: {title} -->
# {title}

{content}

<!-- page: {title2} -->
# {title2}

{content2}
```
(one blank line between blocks; no trailing blank lines beyond one final newline.)
- `splitBookMarkdown(text)` → `{ title: string; content: string }[] | null`. Returns `null` unless the first non-empty line starts with `<!-- senku-book`. Otherwise split at each line matching `/^<!-- page: (.+) -->$/`; for each page, drop the immediately following `# {title}` heading line (and the blank line after it) if present, and trim surrounding blank lines of the content. Round trip must be lossless: `split(build(notes))` returns the same titles and contents (modulo surrounding blank lines).
- `importTitleFromFile(fileName)` → file name without extension, then `sanitizeFileName`.

**Self-test (required, temporary).** Script in `os.tmpdir()`: round-trip with 3 pages including a page whose content contains `---`, a `# Heading` and blank lines; natural ordering (`Page 2` before `Page 10`); empty content page; a plain `.md` (no marker) → `null`. Run it, show the output in the report, delete the script.

**IPC + behavior (active Space only; `'Create a Space first.'` error if none):**
- `notes:import` — `dialog.showOpenDialog` with multi-select, filters `md, markdown, txt`. For each file: read utf8; if `splitBookMarkdown` returns pages → create one note per page, otherwise one note named `importTitleFromFile`. Names via `sanitizeFileName` + `uniqueName` (never overwrite). Returns the snapshot; the renderer toasts `Imported {n} page(s)` and opens the first imported note.
- `notes:export-all` — `dialog.showSaveDialog`, default file name `{Space name} notes.md`, writes `buildBookMarkdown`. Toast `Exported {n} pages`. If the Space has no notes → toast `No notes to export`.
- `notes:export` (existing, one page): change the default extension and filter from `.txt` to `.md`; content stays the raw note text.
- Palette (`palette.ts`) actions: `Import notes…` and `Export all notes…`. Nothing is added to the Notes screen except what already exists.

## PHASE 3 — Window and overlay memory

- **Main window:** remember size and position in `settings.windowBounds` (`{x,y,width,height,maximized}`, optional). Save on `resize`/`move` (debounced 500 ms) and on `close`. Restore at creation **only if** the saved rectangle is at least partly inside some `screen.getAllDisplays()` work area; otherwise use the default size, centered. Restore `maximized` too.
- **Quick-note overlay:** remember its position in `settings.overlayPosition` (`{x,y}`, optional) with the same on-screen check; on first ever open, place it horizontally centered, ~15% from the top of the primary display. Do not remember its size.

## PHASE 4 — CSS hygiene (global, tiny)

- Scrollbars: thin, consistent. `scrollbar-width: thin; scrollbar-color: var(--line) transparent;` and WebKit equivalents (8px thumb, `--line`, transparent track, no arrows) on all scrollable containers (log list, file list, notes list, textarea, palette, modals).
- `::selection` uses `--green-pale` background and `--ink` text.
- One consistent `:focus-visible` ring for buttons, nav items, rows: `outline: 2px solid var(--green); outline-offset: 2px`. Inputs and textareas keep their current focus style.
- `user-select: none` on buttons, nav items, sidebar, file-row icons/meta and day headers; text content (notes, log text, inputs) stays selectable.
- `cursor: pointer` on every clickable element that lacks it; `cursor: default` on non-interactive labels.

## Definition of done
- Zero TypeScript errors; Phase 2 self-test ran and passed (output shown).
- Every search box is small with the placeholder `Search`; `/` focuses it; `Esc` clears/blurs.
- Overview capture has no `Log ↵` button; modals focus their first field; a new note puts the cursor in the editor.
- Exporting all notes then importing that file in another Space recreates the same pages with the same titles; a normal `.md` imports as one page; names never collide or overwrite.
- Closing and reopening Senku restores the window size/position; the overlay reopens where it was left.
- Scrollbars, selection color and focus rings are consistent; nothing visual was added beyond what is listed.

Start with Phase 1 now.
