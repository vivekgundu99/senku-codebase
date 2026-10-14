# Senku (v2.4.0)

> **“Senku is a spark, you are the fire.”**  
> *Action creates motivation — not the other way around.*

Senku is a sovereign Windows desktop workspace built specifically for student coders, builders, and engineers who struggle with **initiation friction**, **time blindness**, and subtle **executive dysfunction**.

Senku is not another bloated 50-feature task planner with color tags, sub-tasks, and complex kanban boards that you abandon after three days. **Senku is an execution launcher.** Its entire mission is to push you past the first 120 seconds of resistance so your brain can lock into flow.

---

## ✨ What Makes Senku v2.4.0 Different?

### 1. 🚀 Next Up Launchpad
When you open Senku, you are greeted with **one clean hero card** representing your immediate focus—not an overwhelming wall of 30 overdue tasks.
- **One-Click Start & Launch:** Simultaneously opens your code editor, linked browser tabs, project folders, and lecture notes in one click.
- **The 2-Minute Tiny First Step:** Prominently displays an actionable micro-step (*"open main.ts line 42"*, *"watch first 4 mins of DP lecture"*) to shrink activation energy to zero.
- **Micro-Actions:** Instant `✓ Done`, `Snooze 15m`, `Make flexible`, or `Edit`.

### 2. 📅 Scheduled vs. 🌊 Flexible Tasks
- **Scheduled Tasks:** For work with hard deadlines (college assignments, live lectures, study slots). Senku sends native Windows reminders and can auto-open linked resources at the start time.
- **Flexible Tasks:** For ongoing self-paced journeys (Striver's SDE sheet, building side projects) without guilt or artificial deadlines.
- **🎲 Pick For Me:** Analysis paralysis strikes? Hit **Pick for me** in the Flexible view to let Senku randomly pick your next task so you stop agonizing and start building.

### 3. 🕊️ Soft Missed Tasks System
Missed a study slot because college ran late or an emergency popped up? Senku never blares harsh red shaming marks. In the Missed view, you can softly convert any task with one click: **Make Flexible**, **Reschedule Today**, or **Mark Done**.

### 4. 🗂️ Spaces & Live File Exploration
Create isolated context-spaces (e.g., `DSA`, `WebDev`, `College`, `Senku`). Each Space binds:
- Its own local Windows folder.
- Its own file explorer with real-time in-folder search.
- One-click **Open in Explorer**.
- Fast parent-directory navigation with shortcut <kbd>R</kbd> (`cd ..`).

### 5. 📝 Instant Rough Note
Tap <kbd>N</kbd> from anywhere in the app to access your distraction-free scratchpad. Autosaves instantly for terminal commands, quick formulas, or fleeting ideas.

### 6. 🔒 100% Local, Fast & Private
- **Zero Account Creation:** No email, no passwords, no sync lag.
- **Local JSON Storage:** Everything stays on your machine inside Windows local data.
- **Completely Offline:** Works on trains, flights, or offline study spots with zero latency.

---

## ⌨️ Master Keyboard Shortcuts

| Key | View / Action | Description |
| :--- | :--- | :--- |
| <kbd>H</kbd> | **Home** | Next Up Launchpad and folder view |
| <kbd>T</kbd> | **Today** | Today's scheduled focus tasks |
| <kbd>U</kbd> | **Upcoming** | Tasks scheduled tomorrow and beyond |
| <kbd>F</kbd> | **Flexible** | Ongoing, self-paced backlog |
| <kbd>M</kbd> | **Missed** | Past scheduled tasks for soft rescheduling |
| <kbd>C</kbd> | **Completed** | Archive of finished tasks |
| <kbd>N</kbd> | **Rough Note** | Fast scratchpad for fleeting thoughts |
| <kbd>R</kbd> | **Folder Up (`cd ..`)** | Navigate to parent folder in file explorer |
| <kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>S</kbd> | **Summon Senku** | Global hotkey to bring Senku to front |
| <kbd>Esc</kbd> | **Cancel / Close** | Close modals or return to Home |

---

## 🛠️ Development & Building

### Prerequisites
- Node.js (v18+)
- Windows 10 / 11

### Run Locally
```bash
npm install
npm run dev
```

### Production Build
```bash
npm run build
```

### Windows Installer Package
```bash
npm run package:win
```

---

## 👤 Author & Philosophy
Crafted with pride by **Vivek Gundu** · A Navodayan.  
*Simple. Standard. Authentic.*
