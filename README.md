# SENKU

> **A simple, ultra-fast desktop app to help you focus and get work done.**

Senku replaces nothing. It does not replace your favorite apps, browser, or tools. It sits beside you on your desktop—giving you a clean place to organize your project folders, write plain-text notes, track your focus, and log your daily progress.

---

### Layout: Two Simple Sides

Senku is cleanly split into two sides:

```
┌───────────────────────────────────────────────┬─────────────────────────────┐
│              WORKSPACE & NOTES                │        FOCUS & LOGS         │
│  [Space Tabs]   (Clean Pinned Folders)        │  Today: 2h 15m (5 sessions) │
│  ───────────────────────────────────────────  │  ─────────────────────────  │
│  Notes · Tasks · Scratch · Links · Global     │  [Work / Rest]  30:00       │
│  (Plain Markdown · Clickable Checkboxes)      │  ─────────────────────────  │
│                                               │  logs.md (Quick Input)      │
└───────────────────────────────────────────────┴─────────────────────────────┘
```

#### 1. Workspace & Notes (Left Side)
* **Spaces (Organized Pinned Folders):** In Windows Explorer, pinned folders are hard to organize. In Senku, your important work, study, or project folders sit as clean tabs on the top bar so you can switch between them in one click.
* **5 Note Tabs:** Each space has quick reference tabs ready to write:
  * `Notes` & `Tasks` — General notes and todo checklists with clickable `[ ]` checkboxes.
  * `Scratch` — A quick scratchpad to dump rough thoughts and clipboard text.
  * `Links` & `Global` — Important bookmarks and shared notes accessible across all your spaces.
  * *(The tab names are just starter suggestions—all of them are plain `.md` files you can use however you like).*
* **Edit & Preview:** Toggle between typing and Markdown preview anytime with `Ctrl+Enter` or the Preview button.

#### 2. Focus & Logs (Right Side)
* **Focus Timer:** Built-in timer for Work and Rest (15m, 30m, 45m presets, or click to enter custom minutes).
* **Daily Stats:** Shows how much time you spent working and resting today.
* **logs.md:** A simple daily log. Type what you did in the input box and press Enter to save a timestamped note:
  ```markdown
  ## 2026-11-06
  - 14:30 (Work 30m) Finished reading Chapter 3
  - 15:15 Prepared slides for presentation
  ```
* **Command Palette:** Press `c` or `Ctrl+K` to quickly switch spaces, open folders in explorer, launch tools, or open notes in your editor.
* **Show/Hide Shortcut:** Press `Ctrl+Alt+Space` from anywhere to instantly show or hide Senku.

---

### Local Files Only (No Database)

* All notes and logs are plain `.md` files saved directly on your computer (inside your project folders and `Documents/Senku Notes`).
* No databases, no accounts, and no cloud logins. You can open and edit your files in any text editor.
* **Super Fast:** No heavy frameworks. It opens instantly, has zero typing lag, and builds in under a second.

---

### Installation

Download the latest installer (`.exe`) from the [Releases](https://github.com/vivekgundu99/senku-codebase/releases) page and run it. No setup needed.

> **Note on Windows SmartScreen:** Because Senku is a free open-source project without a paid certificate, Windows might show a blue popup (*"Windows protected your PC"*). Click **More info** &rarr; **Run anyway** to install.

---

### Development

```bash
# Install dependencies
npm install

# Run app in dev mode
npm run dev

# Build app
npm run build

# Create Windows installer (.exe)
npm run package:win
```

---

<p align="center">
  <sub>Designed and built by Vivek Gundu</sub>
</p>
