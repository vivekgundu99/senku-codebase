# Senku V3 — Development & Prompt History Log

> **Static Context for Future AI Agents & LLMs:**
> - **Project**: Senku (Version 3.0.0) — A personal student context hub & workspace for PC (Windows), solo-developed, local-first.
> - **Philosophy**: Zero-friction spaces, global quiet logs, 1-click action deck launchpads, and clean daily notes.
> - **Environment & Safety**:
>   - Operating System: Windows (PowerShell / CMD).
>   - Storage isolation: Development environment storage is isolated to `%APPDATA%\senku-dev` so installed Senku (v2.4) remains untouched and runnable concurrently.
>   - Core Safety Rule: STRICTLY read & launch only for local files on disk. NEVER delete, rename, or alter user files in their Windows folders.
>   - Commands: Direct execution policy in PowerShell can be restricted; run builds via `cmd /c "npm run build"`.
> - **Architecture**:
>   - Electron 35 + TypeScript + Vite.
>   - Pure Vanilla CSS design tokens; no Tailwind.
>   - Multi-window / Single-instance Electron with JSON persistence in userData.
> - **Prompt Logging Rule**: EVERY user prompt from V3 onwards must be logged chronologically in this file with context and decisions, ensuring full continuity across agent and LLM sessions.

---

## Session Log & Prompts

### Prompt 1 — Architecture Reflection & Core Friction Fixes
- **Date / Time**: 2026-10-19T23:40:43+05:30
- **User Prompt**:
> honestly, this all is not working. yeah senku v3 had some major changes and they all are great but some thing is missing for senku.
> these are still lot of possibilites of senku for to be and not to be.
> so we have to carefully plan everything.
> and first I will tell to my experience as a user.
> senku first experience is great.
> spaces idea is mixed, because if spaces are not there then senku is like cheap basic file explorer, but multiple spaces still create some friction. and less setting in space makes it good.
> log are great, with added search bar makes them great, and one thing I liked about logs is they are global, in case if they are per space that would simply kill the feature. and lot of future is left fot logs. then launch pad, it is not good not bad. its simplicity and clickable boxes make it good but still it need work. home page is nothing, it has nothing so no complaints on it. but it needs careful design what should be there in it and what should not.
> and one feature I want to change which was by mistakely inhereted from old senku is when changeing spaces page refreshes to home, and another while creating spaces, we hit enter and space created and still we are at space create window with empty fields so remove these two logics. and improve the them.
> and thats it nothing left to say and nothing left in senku.
> there is lot of potential for this new senku and slowly we make senku possible and really useful to students.
> first we discuss about this, then I will say what to do and all

- **Analysis & Key Takeaways**:
  1. *Space Switch Reset Bug*: In `src/events.ts`, space clicking explicitly called `setView('Home')`. Fixed to preserve the current active view (`currentView`) so browsing files or notes remains uninterrupted.
  2. *Space Creation Modal Duplicate Bug*: `#add-space` was bound twice (once in `bindSidebar` and once in a global capture listener), mounting two overlapping modal dialogs. Hitting Enter closed the first one, exposing the second empty dialog. Removed the duplicate binding so it cleanly closes and switches into the new space.
  3. *Core Product Clarity*: Spaces need zero friction (minimal settings: Name + Folder). Logs must stay global as a student second-brain. Home needs thoughtful evolution as a daily student command center.

---

### Prompt 2 — Notes Evolution, Log Sequence Numbers & Prompt Archiving
- **Date / Time**: 2026-10-20T00:00:42+05:30
- **User Prompt**:
> bro I forgot to address these two features.
> 1. about rough note. rough note is great, per space idea is also good, but I have experimental fetures like making rough note from static to dynamic. by giving it life but it comes with either heavy fiction and complex implementation.
> I will slowly increse the complexity of ideas,
> make rough note to notes, where we can create txt files and able to open in senku.
> we can literellay make a small quick overlay and start noteing anything without spliting or shifting tabs. offcourse it should be small and it should append the snippets to opened file in notes so, everytime we write it gets appended down, and we have entire notes in that file. then for new notes we can create another folder.
> they will save inside senku so user no need to create txt and then open it etc. if user want it, then we provide export button and it simply exports to browsed folder.
> many idea are there.
> and logs dont have delete button, so adding it look useful but I dont want any performance issues with it. because logs are best thing in senku dont want to mess it.
> but we can add a serial number for them, starting from 1. and they are permanet, deleting them wont rewrite them. so we can use them for hashing and lookup in future and they are like page numbers. if we tear something, page no still show same nos.
> and from now on save all my promts in versions folder. I dont know how you plan, put every promt should be stored and if I change the llm or agent it should understand this context, so write a static promt about this at begining of that file. so I development and my work should be stored and can be shown to somebody later they ask me what you were doing. so thats it bro continue.
> and save my prev prompt also. and from now on we are noteing.
> past is past leave it.

- **Actions Taken**:
  1. Created `versions/version-3.md` with static context for future agents and recorded Prompt 1 and Prompt 2.
  2. Fixed space switching view reset bug (`currentView` preserved).
  3. Fixed space creation modal duplicate overlay bug.
  4. Added permanent sequential numbering (`#1`, `#2`...) to Quiet Log entries (stored and monotonically incremented; deleting an entry never rewrites previous sequence numbers).
  5. Added lightweight log delete capability (`✕` on hover/click) with zero performance impact.

---

### Prompt 3 — Free-form Improvement Pass
- **Date / Time**: 2026-10-20T00:25:17+05:30
- **User Prompt**:
> bro as senku is simple, go ahead. add what ever you want, ui ux changes etc etc. and code them all, logic and ui should be future proof. lets go, first make a commit to save the current code. and then do what ever you want. improve, do anything.

- **Actions Taken**:
  1. Committed previous checkpoint.
  2. **Notes system**: `NoteFile` type + `notes.json` persistence + IPC handlers (`notes:create`, `notes:update`, `notes:append`, `notes:delete`, `notes:export`). Exposed via preload.
  3. **Notes panel UI**: Two-column layout (sidebar list + main editor with autosave + quick-append bar + Export/Delete actions). N shortcut navigates to Notes.
  4. **Home dashboard**: Replaced empty home with clickable stat cards (Launchpads, Log, Notes, Space) + "Recent Log" showing last 5 entries with relative timestamps.
  5. Shared `formatRelativeTime` helper used across Home and Notes.
  6. All TypeScript types updated. Build passes cleanly. Committed as `senku-v3-notes-home-dashboard`.

---

### Prompt 4 — Session Continuity, CSS Bloat & UI/UX Audit
- **Date / Time**: 2026-10-20T00:38:13+05:30
- **User Prompt**:
> bro, claude has done some work and its credits over. and it stopped.
> and I am shocked to know that our css file has 1000+ lines of code.
> and UI and UX sucks. bro first tell me do you came in to my context.

- **Status & Continuity**:
  - Context fully restored and verified across Senku V3 architecture, prompts 1–3, file safety rules, and isolated storage.
  - Audit initiated on `src/style.css` (1,392 lines) to identify duplicate/dead rules, oversized monolithic styles, and layout clutter.
  - UI/UX review underway for Home, Notes, Launchpads, and Logs to replace piecemeal tacked-on styling with a clean, cohesive design system.

---

### Prompt 5 — Core UI/UX Redesign: Minimalist Layout, First-Class Files View & Clean Architecture
- **Date / Time**: 2026-10-20T00:54:16+05:30
- **User Prompt**:
> the greeting line, the date, the full search bar bottom add log bar,
> everything in senku are not too detailed not minimalistic.
> and what is the use of space side bar, if everying are global.
> spaces are only for file manage. 
> lots of newly implemented need work and do everything you want.
> fix all the bugs

- **Decisions & Architectural Plan**:
  1. **Top Bar Redesign**: Replace loud 2-line greeting and giant date from global header. Make the topbar a clean, minimal ~44px utility header (clean view title, sleek space indicator, subtle status, action icons). Greeting moved to Home dashboard where it belongs.
  2. **Removal of Omnipresent Bottom Quick-Log Bar**: Remove the 100vw bottom input bar from every view. Place a dedicated, beautiful compose bar directly inside Log (`+ Add an entry...`), a quick capture card in Home, and a clean global shortcut (`Ctrl+Enter` / `L`).
  3. **Decouple Spaces & Elevate "Files" to First-Class View**:
     - Spaces are explicitly for file management. Make `Files` (`F`) its own dedicated view in navigation.
     - Clicking a space opens that space directly inside the full-screen Files explorer (no more squeezing files into the right 50% of Home and Launchpads!).
     - Home and Launchpads now have full-width space to breathe.
  4. **CSS Consolidation & Clean Aesthetics**:
     - Consolidate bloated `src/style.css`, eliminate dead styles and overlapping rules, unify design tokens.
     - Modern typography, calm warm background `#f6f4ee`, crisp subtle borders, beautiful glass cards, zero visual noise.
  5. **Bug Fixes**:
     - Note title inline renaming.
     - Space selection synchronization.
     - Quick append auto-scroll & instant preview.
     - Shortcut `F` for Files.

---

### Prompt 6 — Restore File Manager to Home Screen
- **Date / Time**: 2026-10-20T01:03:08+05:30
- **User Prompt**:
> bro what you have done, by removing file manager from home.
> keep file manager in home screen as it was before. and you can leave that full file manager view for now.

- **Action**:
  - Immediately restored the split screen file manager on Home (and Launchpads): Home has its left panel + right column with full File Manager (`filePanelMarkup()`).
  - Restored clean nav items in Sidebar: Home (`H`), My Log (`L`), Launchpads (`P`), Notes (`N`).
  - Restored space clicks so they switch space and stay on Home with the selected space's files right there in the right column!

---

### Prompt 7 — Complete Feature Audit & Honest Architectural Review
- **Date / Time**: 2026-10-20T01:14:42+05:30
- **User Prompt**:
> bro once go through each senku feature, page and tell me honest review. because there is unnessesary things added in past by agents which are either useless now or irrelevent and safely removed.
> first do your job and then we will discurss

- **Audit Findings**:
  1. *Legacy Dead Weight*: `dailyNote` (from V2) still had active IPC handlers, snapshot fields, and orphaned renderer markup (`dailyNotePanelMarkup`), even though V3 fully migrated to multi-file `Notes` (`notes.json`).
  2. *Incomplete Notes Panel*: No note rename feature; notes append did not auto-scroll; no auto-selection fallback on delete.
  3. *Home Screen Glitch*: `quickLaunchHtml` was computed in `homePanelMarkup` but never included in the returned template, leaving Launchpads unreachable from Home.
  4. *File Explorer Underutilization*: File sizes and modification dates were gathered in Electron backend (`fs.stat`) but never rendered on file rows; no direct "Open in VS Code" on file items.
  5. *CSS Duplication*: Multiple duplicated selector blocks (e.g. `.home-panel-v3` declared twice) contributing to the 1,450-line stylesheet.

---

### Prompt 8 — Systematic Iterative Overhaul (One Task at a Time)
- **Date / Time**: 2026-10-20T01:26:01+05:30
- **User Prompt**:
> bro this is senku and I am developing it with the help of agentic ai.
> senku got majour changes and many works and implementations are imcomplete. so slowly go through senku and do what ever you like.
> you can change anything, add features, delete features litereally do anything. you can check you own work and redesin it.
> brecause many things are missing in senku.
> so one task at a time,

- **Task 1 Scope — Core Foundation & Friction Elimination**:
  1. *Purge Legacy V2 DailyNote*: Remove orphaned `dailyNote` from backend snapshot, IPC channels, and renderer, unifying notes entirely on the modern `NoteFile` system.
  2. *Complete the Notes Feature*:
     - Add `notes:rename` IPC handler, preload binding, and inline double-click / button rename in editor header.
     - Auto-scroll editor to bottom when snippets are appended.
     - Autofocus note name field in create modal.
     - Auto-select remaining note after deletion.
  3. *Restore Quick Launchpads on Home*: Wire `quickLaunchHtml` into `homePanelMarkup` so students can launch their primary contexts directly from Home.
  4. *Enrich File Explorer Rows*: Display human-readable file sizes (`12 KB`, `4.1 MB`) and relative modified times on file rows. Add direct VS Code opening for code/doc files and folders.
  5. *Clean CSS Duplication*: Eliminate duplicate `.home-panel-v3` rules and tidy related style tokens.

---

### Prompt 9 — Revert In-DOM Overlay & Clarify Separate Floating Overlay Window
- **Date / Time**: 2026-10-20T01:57:02+05:30
- **User Prompt**:
> urgent revert back. senku is not working.
> what you have done, I thought you would add a simple html overlay and add it to app tray to launch that overlay but you have done something else. revert and do again.

- **Status & Immediate Actions**:
  - Reverted the earlier complex setup and prepared for dedicated clean multi-window architecture.

---

### Prompt 10 — Separate Floating Quick Note Overlay Window for External Reading
- **Date / Time**: 2026-10-20T02:06:09+05:30
- **User Prompt**:
> bro you are mad.
> I will explan the senario, you are reading pdf notes and suddenly you want to note some thing. you use the overlay, you can adjust it anywhere and it will keep running as a separate window. and who the hell you implemented. running in senku why you need that.
> this was the idea. and you fucked up everything.
> (Referencing Prompt 2 Notes Evolution snippet)

- **Scenario & Architecture Decisions**:
  1. *Target User Scenario*: Student reading external PDFs or watching lectures in third-party windows (Acrobat, Chrome, Edge, VS Code). Wants an independent floating notepad that stays visible alongside external content without switching away or opening full Senku.
  2. *Dedicated Separate BrowserWindow (`overlayWindow`)*:
     - Independent floating window with `alwaysOnTop: true`, `resizable: true`, and `movable: true` so it can be repositioned and resized anywhere on screen.
     - Persists continuously alongside reading material (no auto-hide on blur; user keeps it running as long as desired).
     - Minimizable (`—`) and dismissible via `✕` or `Esc` (hides to tray for instant reopen without memory recreation).
  3. *Tray & Topbar Launch*:
     - Tray context menu: `Quick Note Overlay` launches/focuses the separate floating window directly.
     - In-app Topbar & shortcut `O` also summon or focus the floating overlay.
  4. *Clean Standalone Multi-Page Architecture*:
     - Standalone `src/overlay.html` + `src/overlay.ts` bundled cleanly via Vite Rollup input without fragile hash hacks.
     - Live synchronization: appends text directly to currently opened note in Notes. If main Senku is open, updates editor instantly in real time.

---

### Prompt 11 — Ultra-Minimalist Overlay Bar & Timestamp Removal
- **Date / Time**: 2026-10-20T02:25:24+05:30
- **User Prompt**:
> little improvements,
> dont add any times, and I have said overlay shoud be minimal, why it has unwanted data, revome make it as simple as you can.

- **Refinements**:
  1. *Timestamp Removal*: Removed `[HH:MM]` timestamp prefix when appending snippets in both `notes:append` and `notes:append-active`. Snippets append raw note text directly.
  2. *Ultra-Minimalist Floating Bar*:
     - Reduced overlay window from 160px height down to a sleek 48px compact floating bar (`height: 48, minHeight: 44`).
     - Stripped away unnecessary labels, dropdown arrows, help hint footers, status pills, and minimize buttons.
     - Kept only: draggable pen icon + active note name badge (`✎ [NoteName]`), single clean input field, and subtle dismiss `✕`.
  3. *Immediate Interaction*: Type snippet -> hit `Enter` -> appends raw snippet to active note -> instant visual flash feedback -> input clears and remains focused.




