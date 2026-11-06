# Senku — Experimental Ideas & Concept Ledger
> **Author:** Vivek Gundu  
> **Repository:** `senku`  
> **Document Purpose:** An immutable record of experimental design concepts, architectural breakthroughs, and high-impact product ideas explored for Senku.

---

### 1. Multi-Page Markdown Architecture ("Notebook Pages" in Pure `.md`)
* **Date Conceived:** October 23, 2026
* **The Problem:** 
  In standard note apps (Notion, Obsidian, VS Code), starting a new topic under the same project requires either creating clutter with dozens of small files or enduring an endless, messy scroll. Users lack a "clean slate" feel without deleting or moving existing thoughts.
* **The Innovation:**
  - Introduce **pages inside a single Markdown note** using clean invisible delimiters (`<!-- page -->`).
  - Keep the physical storage as **one single, unified `.md` file** so it remains 100% compliant with Notion, VS Code, and standard file systems without proprietary database lock-in.
  - Break traditional renumbering complexity: by using unnumbered page delimiters, pages can be created, deleted, or jumped between with zero renumbering overhead.
  - Dual viewing: Senku provides both a clean, distraction-free **Single Page View** (with circle pagination `(1) (2) (3)`) and a **Full Note View** for external export and seamless cross-platform reading.

---

### 2. Dual-Zone Floating Overlay (Pencil Drag Handle & Mode Toggle)
* **Date Conceived:** October 23, 2026
* **The Problem:**
  Minimalist frameless floating overlay windows suffer from severe move-friction because the only draggable region is a razor-thin border edge, while the badge area was overloaded with mode switching.
* **The Innovation:**
  - Disentangle mode toggling from window dragging by converting the pencil icon into a dedicated, tactile **window drag handle** (`-webkit-app-region: drag; cursor: grab;`).
  - Keep the active title pill strictly for toggling between Notes and Logs.
  - Yields an effortless micro-interaction where users can grab the pencil to reposition anywhere on the screen without mis-triggering mode changes.

---

### 3. Pragmatic Workflow Philosophy (Anti-Bloat & Zero-Friction)
* **Core Philosophy:**
  - Reject IDE-like shortcut bloat and complex settings menus that distract from fast execution.
  - Senku is built specifically to remove friction when starting and switching work.
  - Standard files over proprietary formats: users always own their raw Markdown and folder trees.

---

### 4. Zero-Friction Export (The "Downloads Auto-Dump" & Clipboard Reality)
* **Date Conceived:** October 23, 2026
* **The Insight:**
  - Traditional software over-engineers export flows: `File -> Export -> Choose Folder -> File Dialog Picker -> Save`.
  - In practice (especially for modern fast-paced workflow), 95% of text sharing is simply `Ctrl+A -> Ctrl+C -> Ctrl+V` into chat, AI tools, or docs in under 1 second.
  - When a file export is genuinely needed, prompting a manual folder selection modal adds friction. Mimicking browser architecture—a 1-click silent save directly into the system `Downloads/` folder with an instant toast notification—cuts the cognitive friction completely.

---

### 5. Unified Space Notes & The Death of Redundant Sidebar Hierarchy
* **Date Conceived:** October 23, 2026
* **The Discovery (Dogfooding):**
  - By pointing a Senku Space directly to the AppData `notes/` directory, Senku's clean File Manager instantly turned into a native, high-speed note browser on the Home screen.
  - With the advent of **Pages within a single note**, users no longer need dozens of fragmented files or nested folder trees just to separate topics. One note ("DSA", "Startup", "Lab") houses all related pages neatly.
  - This reveals a key architectural truth: nested folder sidebars inside note managers are largely legacy clutter that eat screen space. Clean notes plus multi-page pagination eliminate the need for rigid folder bureaucracy.

---

### 6. The Organic Origin Principle (Personal Utility over Market Mimicry)
* **Statement of Record:**
  - Senku is not a commercial product or a replica of tools like Notion or Obsidian; it was developed without researching or studying commercial note apps for feature ideas.
  - Every innovation—including multi-page Markdown notes—was conceived organically through direct, daily personal use ("dogfooding") when hitting real barriers and inventing frictionless solutions on the fly.
  - Senku exists to serve real human work with absolute minimum friction.

---

### 7. The "Three Diamonds" Architecture & Evolutionary Lineage
* **Date Documented:** October 23, 2026
* **Evolutionary Journey:**
  - **Senku v1:** Iterated across 3 versions. Tested early assumptions and proved the baseline desktop utility.
  - **Senku v2:** Iterated across 4 versions. Served as the daily working driver for over two months of continuous real-world use.
  - **Senku v3 (The Great Overhaul):** Aggressive trimming of bloated, low-utility features accumulated in earlier iterations. Re-engineered almost entirely from the ground up to be lean, blazing fast, and purpose-built.
* **The "Three Diamonds" (90% of Senku):**
  Through 2+ months of daily dogfooding, it became clear that productivity doesn't need 50 features—it relies on three fundamental pillars working in unison:
  1. 💎 **Spaces (File Manager & Work Context):** Fast context-switching between folders, project directories, and launchpads without Explorer friction.
  2. 💎 **Logs (Action Capture & Timeline):** Frictionless micro-logging to track what was just done and preserve momentum.
  3. 💎 **Notes (Distraction-Free Markdown Canvas):** Raw, local Markdown notes with instant pagination (`<!-- page -->`) to capture deep thoughts without context fragmentation.
* **Core Truth:**
  Great software is defined by what you choose to **remove**, not what you pack in. Every version of Senku is a disciplined reduction of friction toward these Three Diamonds.

---

### 8. The Sentinel Philosophy: Senku Replaces Nothing (It's Just a Tool)
* **Date Documented:** October 25, 2026
* **The Core Truth:**
  - Senku does not replace your IDE, your browser, your terminal, or your professional tools. It never pretends to.
  - Senku is simply a starting block—a tool built to eliminate the psychological friction of starting work and context-switching.
* **The Work Cycle (How Senku Actually Lives):**
  - **The Launch (30 seconds):** The user opens Senku to overcome inertia. They see their Space, launch their resources in 1 click, check what they did earlier in Logs, and jump straight into their real tools (VS Code, Figma, terminal, browser).
  - **The Native Hand-Off:** Once work begins, native apps take complete charge. Senku steps back, sits quietly, and stays ambient in the background.
  - **The Quick Assist:** While working, if a fleeting thought strikes, the user summons the Quick Note overlay. If a milestone is finished, they log a line. When confused, overwhelmed, or switching tasks, they summon Senku back to clear their head.
* **Why the Markdown Parser is Ultra-Basic ("Showing the Path"):**
  - Senku's built-in markdown preview is intentionally simple. It exists to show beginners and minimalists: *"Look, your thoughts are stored in pure, human-readable plain text that you own forever."*
  - For heavy editing, publishing, or serious writing, users click `Code` and use dedicated editors. Senku introduces the path; it never builds a walled garden.
* **Why Exports Default to Downloads (Zero Complex Machinery):**
  - Senku is not a document publishing platform. Users don't need complex multi-tiered archive managers or batch zip engines.
  - A simple 1-click "Export Note" or "Export Folder" saving directly to the user's `Downloads` folder solves 100% of real-world export needs with zero friction.
* **Why the Sidebar Stays Fixed (Cockpit Stability):**
  - Gimmicks like collapsing sidebars (`Ctrl+B`) only make sense in code editors where someone stares at continuous lines of code for hours.
  - In Senku, the sidebar is the permanent, comforting anchor of the cockpit. It remains stable, predictable, and solid.

---

### 9. The Filesystem as the Note Engine — Unifying Notes & Explorer into the "Notes Window"
* **Date Documented:** October 27, 2026
* **The Core Truth:**
  - Notes is not a standalone app or an isolated silo. Notes are simply `.md` files residing in the real filesystem.
  - Creating a separate silo for notes caused duplicate sidebars, extra mental categories, and redundant bundle abstractions.
* **The Unified Workflow:**
  - **Notes as a Space:** The default Notes location is `Documents/Senku Notes`. When the user clicks "Notes" in the sidebar, Senku points the File Manager directly to this directory, compresses the pane into compact mode, and reveals the Notes Window.
  - **The Dual Toggle at Home:** The Home cockpit features a clean dual toggle pill: `[ Overview ]` (cockpit, stats, logs) and `[ 📝 ]` (the Notes Window / Reader).
  - **Any Markdown Everywhere:** Clicking any `.md` file in the File Manager (whether inside a project space or personal notes) instantly switches the pill to the Notes Window, minimizes/compresses the file manager, and loads the document into the reader.
  - **1-Click Creation in Active Context:** Inside the Notes Window, `+ New Note` creates a clean `.md` file directly in whatever active folder or subfolder the File Manager is currently browsing.
  - **Default Empty State:** If no file has been opened yet, the Notes Window shows a calm, welcoming default placeholder without forcing any file open.
  - **Zero Database / Zero Magic:** Everything is pure plain-text `.md` files on the user's hard drive, easily browsable via Windows Explorer, VS Code, or Senku.

---

### 10. Proposed Ideas & Bloat Removal: Pure Folder Navigation (No Fake Spaces) & QuickNote Streamline
* **Date Documented:** October 27, 2026
* **Bloat Removed (The "Notes Space" Trap):**
  - Trying to register "Senku Notes" as a workspace in `workspaces.json` caused immediate bloat and danger: it risked accidental space renaming, space deletion, and overrode the user's active project workspace in the topbar.
  - **The Solution:** Notes is **not** a space. The user's active project workspace stays untouched. Clicking "Notes" in the sidebar simply directs the File Explorer to `Documents/Senku Notes` and opens the Notes Window.
* **QuickNote.md as the Single Source of Truth:**
  - The floating Quick Note overlay drops all complex bundle/note lookup logic. It has one simple job: append directly to `Documents/Senku Notes/QuickNote.md`.
  - When the user clicks "Notes" in the sidebar, Senku opens `QuickNote.md` by default, giving immediate access to recently captured thoughts without hunting.
* **Visual Symmetry & Vertical Space Optimization:**
  - The Home header pill is converted from text (`[Overview] [📄]`) to balanced icons: `[ 🏠 | 📄 ]`.
  - The pill is centered in the header row.
  - The active file name moves into the left space of the header row, eliminating the redundant title row below and allowing the note editor canvas to begin immediately.

---

### 11. Architecture Refinement: The Two Notes Windows & The Exit Handshake
* **Date Documented:** October 27, 2026
* **The Core Distinction (Dual Notes Workflow):**
  - **Type 1: Contextual Project Space Notes (Inside an Active Space):**
    - The user is working inside a dedicated project space (e.g. `College`).
    - The File Manager shows `College` files.
    - Toggling the center pill to `[ 📄 ]` opens the Notes Window for `College`.
    - If no file is selected yet, it presents a clear placeholder: *"No file is selected for preview. Select a markdown to show here."* with `[+ New Note]`.
    - Clicking `+ New Note` creates a clean note directly in `College`.
    - Toggling back to `[ 🏠 ]` returns to Overview for `College` with zero space change.
  - **Type 2: Global Notes Engine (Via Sidebar "Notes"):**
    - The user clicks **Notes** in the primary sidebar.
    - The active project space (`College`) is saved safely in the background.
    - The File Manager bypasses project boundaries and roots directly into `Documents/Senku Notes`.
    - The Notes Window opens `QuickNote.md` by default (or the empty state if absent).
    - The Senku topbar displays `Notes · <Date>` cleanly without a confusing space pill.
  - **The Exit Handshake (Symmetrical Return):**
    - When in Global Notes (Type 2), clicking **Home** in the sidebar OR clicking the **`[ 🏠 ]`** toggle pill in the center header executes the Exit Handshake.
    - Both actions immediately exit Global Notes mode, restore the active project space (`College`), re-anchor the File Manager back to `College`, and open the Home Overview.
* **UX Safety: Accidental Page Deletion Prevention:**
  - Placing page deletion `[🗑]` directly adjacent to `[+ Page]` is high friction and risky.
  - Page deletion is moved to the far-right end of the bottom pagination bar (`.notes-pages-danger`), creating a clear physical separation between creation/navigation (`+ Page`, `‹ (1) 2 ›`) and destructive removal.
* **Radical Legacy Purge:**
  - Eliminated 800+ lines of obsolete v3.1 code, including bundled notes machinery, dead modals, and redundant sidebars. Notes are pure local markdown files.


