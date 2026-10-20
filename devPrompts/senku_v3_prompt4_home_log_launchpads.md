# SENKU V3 — PROMPT 4: SENKU HOME + SIDEBAR TREE + NUMBERED/GLOBAL LOG + LAUNCHPAD PINS (paste this whole message into the agent chat)

You are continuing work on **Senku** (Electron + Vite + TypeScript, vanilla TS renderer, fully offline). Per-Space `.md`/`.json` storage under `<userData>/spaces/<spaceId>/` is in place. This pass adds a **global Home**, a clearer **sidebar**, a better **Log**, and **pinned/recent launchpads**.

## 0. Identity law (unchanged)
Senku is **quiet**: almost-empty UI, strong features. When in doubt, remove. No new colors, fonts, shadows, animations, emoji, badges, helper paragraphs. Reuse CSS variables (`--bg --surface --ink --muted --soft --line --hover --green`). Do not add anything not listed here. Do not ask me questions; pick the simplest option and report it.

## 1. Decisions already made (do not reinterpret)

**Two kinds of Home.**
- **Home** (view key `Home`) = global. Shows things from *all* Spaces. No file panel.
- **Overview** (view key `Overview`) = the *current Space's* home. This is what `Home` used to be (greeting, capture, recent log, quick launchpads, files panel on the right). Its content stays as it is today.

**There is NO global log file.** The global log is a **derived view**: at read time, merge the log day-files of every Space. The only source of truth is each Space's `log/*.md`. Deleting/editing an entry always edits the owning Space's file, so nothing can go out of sync. Do not create any duplicate/global log file.

**Log numbers.** Every entry has a number, unique and increasing **per Space**, never reused after deletes. The number is stored in the log line itself:
`- 15:42 #42 finished binary search` (older numberless lines are still valid). Highest number is kept in `spaces/<id>/meta.json` as `lastLogSeq`.

**Launchpads.** Newest first. A launchpad can be **pinned to Home**. A launchpad remembers when it was last launched (`lastLaunchedAt`).

## 2. Rules
1. Phases in order; run the project's typecheck/build after each; never leave it non-compiling.
2. First **read** the current implementation (storage.ts, the log/launchpad/snapshot handlers in main.ts, state.ts, markup.ts, events.ts, renderer.ts, palette.ts, shortcuts.ts) and adapt function signatures where needed. Keep existing behavior otherwise. Existing data must keep loading (all new fields optional).
3. Every new IPC is wired in 3 places: `main.ts`, `preload.ts`, `src/env.d.ts`. Mutations go through `handleLocked`.
4. Delete dead code and dead CSS you create or orphan.
5. Final report: per phase, files + function names, assumptions, self-test output, anything unverified. Do not claim a visual result you did not check.

## PHASE 1 — Data layer (no UI)

**types.ts**
- `LogEntry`: add optional `spaceName?: string` (`spaceId` already exists). `seq` now means the persisted log number (0 if the line has none).
- `Launchpad`: add optional `pinned?: boolean`, `lastLaunchedAt?: number`.
- Add `HomeData { log: LogEntry[]; launchpads: Launchpad[] }` where every item carries `spaceId` and `spaceName` (add optional `spaceName?: string` to `Launchpad`).
- `AppSnapshot`: add `home: HomeData`.

**storage.ts (pure, no electron imports)**
- **Line format:** `- HH:MM #N text`. Parse with `/^- (\d{2}):(\d{2}) (?:#(\d+) )?(.+)$/`. Entry `seq = N` (0 if absent). `id = "<YYYY-MM-DD>:<N>"`; for numberless lines `id = "<YYYY-MM-DD>:line<index>"`.
- **Numbering:** `nextLogNumber(spaceDir)` = `max(meta.lastLogSeq ?? 0, highest number found in log files) + 1`, then saves it to `meta.json` (preserve other meta fields). `addLog` writes the number and returns the entry.
- `updateLog(logDir, id, text)` — replace only the text of that line; keep time and number; single-line (newlines → space); no-op if not found.
- `deleteLog`, `restoreLog` now locate by id/number. `restoreLog` re-inserts with the **original number** and time, in chronological position (existing rule), and never lowers `lastLogSeq`.
- `renumberLog(spaceDir)` — idempotent: every numberless entry line gets a number, assigned in chronological order starting after the current max; rewrites only those lines (atomic write), leaves all other lines untouched, updates `lastLogSeq`.
- `listLogRecent(logDir, limit)` — read day files newest-first and stop once `limit` entries are collected (do not read the whole history).
- `orderLaunchpads(pads)` — pinned first, then the rest; each group sorted by `createdAt` descending.

**main.ts**
- `snapshot()`: tag `logEntries` with `spaceId`/`spaceName`; use `orderLaunchpads` for `launchpads`; add `home`:
  - `home.log` = merge of `listLogRecent(8)` from every Space (tagged), sorted newest first (tie-break `seq` desc), first 8.
  - `home.launchpads` = all **pinned** launchpads of every Space (newest first) followed by the **5 most recently launched unpinned** ones (`lastLaunchedAt` desc; never-launched ones are excluded). Each tagged with `spaceId`/`spaceName`.
- New IPC `log:list-all` → every entry of every Space (tagged), newest first. (Used only by the All-logs view; do not put it in the snapshot.)
- `log:delete(id, spaceId?)`, `log:update(id, text, spaceId?)` (new), `log:restore(entry)` use `spaceId` (or `entry.spaceId`) if it matches an existing Space, otherwise the active Space.
- `launchpad:create`: new launchpads go on top (`createdAt: Date.now()`; ordering is done by `orderLaunchpads`).
- `launchpad:set-pinned(id, pinned)` (new, active Space).
- `launchpad:launch(id, spaceId?)`: sets `lastLaunchedAt = Date.now()` **before** opening the items; keeps the 150 ms sequential opening and `{ ok, errors }` result.
- At startup, after the existing migration and before the window opens: run `renumberLog` for every Space (inside the lock). Must be safe to run on every launch.

**Self-test (required, temporary).** Script in `os.tmpdir()`, run it, show output in the report, then delete it. Assert at least: numbers increase and are **not reused** after a delete; `renumberLog` numbers legacy lines chronologically, is idempotent, and leaves junk lines untouched; `updateLog` keeps time+number; `restoreLog` keeps the original number and position; `listLogRecent` stops early (spy on reads or use many files); two temp Spaces merge correctly by time; `orderLaunchpads` puts pinned first and sorts by `createdAt` desc.

## PHASE 2 — Navigation model, sidebar, Senku Home

**View keys:** `Home` (global), `Overview`, `Log`, `Launchpads`, `Notes`, `AllLog`. App starts on `Home`. Rename the old Home: `homePanelMarkup` → `overviewPanelMarkup` (+ its callers, `data-view="Home"` usages, shortcuts, palette); write a new `homePanelMarkup` for the global Home.

**render():** the files panel shows for `Overview` and `Launchpads` only. `Home`, `Log`, `Notes`, `AllLog` are single-column. Global Home content is capped at `max-width: 680px`, left-aligned.

**Sidebar** (`sidebarMarkup`) — a clear tree, replacing the current view list:
```
[S] senku                      (brand, unchanged)
⌂ Home                         (global; selected on Home/AllLog)
SPACES                       +
  ▾ dsa                      ⚙   (active Space, expanded)
        Overview
        Log
        Launchpads
        Notes
    senku                          (other Spaces: one plain row each)
    college
Trash (only if non-empty)
```
- Only the **active** Space is expanded; its 4 sub-items are indented, 13px, same selected style as today. Existing space row styles/badges/⚙ stay.
- When the current view is `Home` or `AllLog`, the active Space row is not highlighted (its sub-items are shown but none selected).
- **Click rules:** clicking `Home` → view `Home`. Clicking a Space that is not active → switch to it; if the current view is `Home`/`AllLog` land on its `Overview`, otherwise **stay on the same view** (Log → Log). Clicking the already-active Space while on `Home`/`AllLog` → its `Overview`; while on one of its own views → do nothing.
- Remove the old flat "VIEWS" nav and its dead CSS. No Space → only `Home` plus the existing "+ Create first Space" box.

**Topbar:** the Space name is shown **only** on Space views (`Overview`, `Log`, `Launchpads`, `Notes`); on `Home`/`AllLog` show nothing there. Everything else unchanged.

**Shortcuts** (`shortcuts.ts`): `h` → Home, `s` → Overview, `l` Log, `p` Launchpads, `n` Notes (unchanged), `o` overlay, `r` up-folder (unchanged). **Palette:** view rows become `Home`, `Overview`, `Log`, `Launchpads`, `Notes`, `All logs`.

**Home markup** (`homePanelMarkup`), top to bottom, nothing else:
1. Greeting (existing `renderGreeting`).
2. Capture input (same id/handler as the Overview capture, so it logs into the **active** Space). Placeholder: `Log to {active Space name}…`. Not rendered if there is no Space (then show the existing one-line "Create a Space to begin." + button).
3. Section label `RECENT LOG` + link `All` (opens `AllLog`). Rows from `state.home.log`: `#N` muted, text, and on the right `{Space name} · {relative time}` in `--soft`. Flat rows, no cards. Empty → one muted line.
4. Section label `LAUNCHPADS` (no link). Rows from `state.home.launchpads`: a small `★` (`--green`) if pinned, name, Space name in `--muted`, and on the right a `Launch` text button. Clicking `Launch` calls `launchLaunchpad(id, spaceId)`, toasts `Launched {name}`, then reloads. Empty → one muted line `Pin or launch a launchpad to see it here.` Edit/delete are **not** available here.

## PHASE 3 — Log UI

Log panel (Space `Log` view and `AllLog`) share one renderer with a `scope: 'space' | 'all'` parameter. Data: `state.logEntries` for `space`; for `all`, an in-memory `state.allLog` loaded via `log:list-all` whenever the view is `AllLog` (on navigation and inside `load()` when the current view is `AllLog`; no stale data after deletes/adds).

- **Row layout (compact, no cards):** `#N` (mono, `--soft`, right-aligned, ~44px) · time (mono, `--soft`, ~72px) · text · (scope `all` only: Space name, `--muted`, small, right) · `✕` on hover. `1px --line` separators, day headers (`Today`, `Yesterday`, `Mon, Oct 14`) as today. Entries without a number show an empty number cell.
- **Controls row** (above the list): compose input (scope `space` only; fills the remaining width), filter input, one native `<input type="date">` (`#log-day`, small) with a `✕` that appears only when a day is chosen, entry count at the far right. `AllLog` has no compose input.
- **Filtering** (all combine): text substring (case-insensitive); if the query is digits or `#digits`, also match entries whose number equals it; day filter = local calendar day equals the chosen date. Day headers with no matches are hidden. The count reads `N entries` or `M of N`.
- **Edit:** double-click an entry's text turns it into an input prefilled with the text; `Enter` saves via `log:update`, `Esc` or blur cancels. Time and number never change.
- **Delete:** unchanged behavior (immediate + Undo toast). In scope `all`, delete/undo must pass the entry's `spaceId`.
- Pagination (`Show more`, 40 per page) stays.
- State to add: `logDay` (memory only), reset when the Space changes or the view changes between `Log` and `AllLog`.

## PHASE 4 — Launchpads UI

- Lists everywhere use the order from the snapshot (pinned first, then newest first). The Launchpads view and the Overview "Quick launchpads" (max 3) both follow it.
- Launchpad card: add one pin toggle next to Launch/Edit/Delete, reusing the existing `☆`/`★` style from file pinning, title `Pin to Home` / `Unpin`. Pinned cards show the filled star. Toggling calls `launchpad:set-pinned` and reloads.
- The new-launchpad modal/flow is unchanged; a created launchpad now appears at the top.
- After `Launch All` anywhere, reload so `Home` reflects the new "recent" order.

## Definition of done
- Zero TypeScript errors; the Phase 1 self-test ran and passed (output in the report).
- No global log file exists anywhere; deleting/editing an entry from `AllLog` changes the owning Space's day file.
- Sidebar is the tree above; `Home` ≠ `Overview` everywhere (sidebar, palette, shortcuts, topbar).
- Home shows: greeting, capture (logs to the active Space), last 8 log entries across all Spaces with Space names and numbers, pinned launchpads then the 5 most recently launched, each with `Launch`.
- Log numbers survive deletes (delete #5, add a new entry → it is #N+1, not #5).
- The day filter and `#42`-style number search work in both Log views.
- New launchpads appear on top; pinned ones are first and appear on Home.
- No dead code or CSS left from the renames/removals.

Start with Phase 1 now.
