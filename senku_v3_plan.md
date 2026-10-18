# Senku V3.0.0 — Product Plan

> **Working Title:** "The Quiet Witness"
> **Author:** Vivek Gundu (idea) + Antigravity (execution plan)
> **Date:** October 2026
> **Status:** Planning Phase

---

## 1. Honest Autopsy of V2.4.0

### What Worked
| Feature | Why It Worked |
| :--- | :--- |
| **File Explorer / Spaces** | Zero friction. Shows what already exists. No maintenance needed. |
| **Resource Opening (concept)** | Genuinely original. No other software opens all your context at once. |
| **Rough Note** | Low friction scratchpad. People actually used it. |
| **Keyboard shortcuts** | Speed. No thinking required. |

### What Failed
| Feature | Why It Failed |
| :--- | :--- |
| **Task Scheduling** | Required constant maintenance. Felt like debt. Chaos of student life = dead tasks piling up. |
| **Reminders / Notifications** | Context-switched at wrong moments. Ignored quickly. |
| **"Today / Upcoming / Missed" views** | Shame UI. Missed tasks created guilt, not motivation. |
| **Open Resources (triggered by tasks)** | Tied to the broken task system. Killed a great idea by association. |

### Core Insight
> Senku V2 failed because it tried to **manage the user's life**.
> Senku V3 should only **witness and launch**.

---

## 2. The New Core Philosophy

Senku V3 is built on three honest truths about student builders:

1. **You already know what to work on.** You don't need an app to tell you. You need an app to get you *into* it, fast.

2. **You need a private witness, not a cheerleader.** Telling others about your progress can backfire — over-encouragement, discouragement, comparisons. But doing something and leaving no trace feels hollow. A private timestamped record exists just enough to create psychological closure: *"I did it. Senku saw it."*

3. **Momentum is chemical.** The dopamine from completing something lasts minutes. The goal is to stack small completions so fast that the day feels like progress. No planning, no review, just: *do → record → do again.*

---

## 3. The Three Pillars of Senku V3

### Pillar 1: Workspace Launcher (Upgraded File System)
**File explorer becomes the HERO of the app, not a side panel.**

The entire right half of the screen is the file explorer. You teleport into your Space (e.g., `DSA`, `WebDev`, `College`) and you are inside your Windows folder instantly.

New file explorer powers:
- **Open in VS Code** — one click to open any file/folder in VS Code
- **Open in Terminal** — one click to open Windows Terminal at that path
- **Open in Explorer** — already exists, keep it
- **Quick Launch Pins** — pin any file/folder to the top permanently
- **Cross-space Recent Files** — see recently opened files across ALL spaces (like VS Code's recent list)
- **R = cd ..** — already exists, keep it
- **Smart file search** — already exists, keep it

### Pillar 2: Resource Launchpad (Rescued from V2)
**The best original idea — completely decoupled from tasks.**

Instead of tying resources to tasks, you create **named Launchpads**:
- `"DSA Session"` → VS Code folder + Striver's sheet URL + Notion page
- `"College Lab"` → Lab manual PDF + compiler folder + Teams link

One click launches everything at once. No scheduling, no reminders, no tasks.

This is the **unique feature** that no other app has. Make it the flagship.

### Pillar 3: The Quiet Log (The New Idea — The Core of V3)
**A private, timestamped, frictionless win journal.**

This is the new soul of Senku V3. Here is how it works:

**The Flow:**
1. You do something. Anything. Write 50 lines of code. Understand recursion. Finish a video. Fix a bug.
2. You open Senku (or it's already open).
3. You type one line: *"figured out dynamic programming memoization"*
4. You hit `Enter`. It saves with a timestamp. The text field clears.
5. You forget about it. Senku remembers.

**The Rules:**
- No editing past entries. What happened, happened.
- No categories, no tags, no projects. Just raw text + timestamp.
- No word limits. Could be 3 words or 3 sentences.
- Private and local. Never synced anywhere.
- Entries are never shown on the home screen (to avoid review friction).
- You access the log only intentionally: press `L` or click "My Log".

**Why This Works Psychologically:**
- Creates **closure** without external validation.
- Removes the "I did nothing today" spiral because even tiny entries count.
- The timestamp makes it feel real and witnessed.
- In the future: AI can scan your log and tell you things like *"you've written about recursion 14 times — you clearly care about this."*
- **Zero maintenance.** You never need to organize, review, or clean it up.

**The Log View (when you open it intentionally):**
```
Oct 19 · 2:47 AM    figured out dynamic programming memoization
Oct 19 · 1:12 AM    pushed first commit of the auth module
Oct 18 · 11:30 PM   watched 8 videos of striver's tree playlist
Oct 18 · 8:15 PM    created the folder structure for webdev project
```
Simple. Clean. No actions. Just memory.

---

## 4. What Gets Removed from V3

| Feature Removed | Reason |
| :--- | :--- |
| Task Scheduling system | Replaced by Launchpad + The Log |
| Today / Upcoming / Missed / Completed views | Dead weight |
| Task reminders & notifications | Caused friction, ignored |
| Profile modal (current version) | Simplify to just name setting |
| Senku Setup screen | Already removed in V2.4 |
| Home "hero task card" | No more tasks |

---

## 5. New App Structure

### Sidebar (simplified)
```
[ Spaces ]
  DSA
  WebDev
  College
  + Add Space

──────────
[ Log ]         L
[ Rough Note ]  N
[ Launchpads ]  P
──────────
[ Profile ]
```

### Main Area Layout
```
┌─────────────────────────────────────────────────┐
│  SPACE NAME              [ Open VS Code ] [ Terminal ] [ Explorer ] │
├─────────────────────────────────────────────────┤
│                                                  │
│   📁 File Explorer (full width, full height)    │
│                                                  │
│   [ Search files... ]    breadcrumb navigation  │
│                                                  │
│   📁 algorithms/          📁 graphs/            │
│   📁 trees/               📄 notes.md           │
│   📄 merge_sort.java      📄 README.md          │
│                                                  │
└─────────────────────────────────────────────────┘

──────────────────────────────────────────────────
│ Quick Log: [________________________] [ + Log it ] │  ← always visible at bottom
──────────────────────────────────────────────────
```

### The Quick Log Bar
- Always visible at the bottom of the app (every view, every space).
- One text field. Placeholder: *"What just happened?"*
- Hit `Enter` → saves with timestamp → clears → done.
- Shortcut `Ctrl + Enter` from anywhere to focus the log bar.

---

## 6. Keyboard Shortcuts (V3)

| Key | Action |
| :--- | :--- |
| `H` | Home (Spaces / File Explorer) |
| `L` | Open the Quiet Log view |
| `N` | Rough Note |
| `P` | Launchpads |
| `R` | Folder Up (`cd ..`) |
| `Ctrl + Enter` | Focus Quick Log bar from anywhere |
| `Ctrl + Alt + S` | Summon Senku globally |
| `Esc` | Close modal / Back |

---

## 7. Database / Schema Changes

### Remove
- `tasks` table / array
- `completedTasks`
- Task scheduling fields

### Add
```typescript
// The Quiet Log entries
interface LogEntry {
  id: string;
  text: string;
  createdAt: number; // Unix timestamp (ms)
  spaceId?: string;  // optional — which space was active when logged
}

// Launchpad
interface Launchpad {
  id: string;
  name: string;       // e.g. "DSA Session"
  spaceId: string;    // which space it belongs to
  paths: string[];    // files, folders, URLs to open
  createdAt: number;
}
```

### Keep
- `Workspace` / Space structure
- `masterFolder` (file explorer root)
- `roughNote` (daily note content)
- `currentPath` (file browser navigation state)
- User settings (name, greeting, startup)

---

## 8. Implementation Order

### Phase 1: Strip V2 (1 session)
1. Remove task-related code: types, markup, events, state
2. Remove task views: Today, Upcoming, Flexible, Missed, Completed
3. Remove home hero card
4. Clean sidebar — remove task navigation items
5. Verify app doesn't crash

### Phase 2: File Explorer as Hero (1 session)
1. Make file explorer full-width in main area
2. Add "Open in VS Code" button
3. Add "Open in Terminal" button (Windows Terminal / cmd)
4. Add Quick Launch Pins (pin file/folder to top of explorer)
5. Add cross-space Recent Files list

### Phase 3: The Quiet Log (1 session)
1. Create `LogEntry` schema in local JSON store
2. Build the always-visible Quick Log bar at bottom
3. Build Log view (sorted by newest first, no editing, no deletion)
4. Wire `Ctrl + Enter` global focus shortcut
5. Wire `L` key navigation

### Phase 4: Launchpads (1 session)
1. Create `Launchpad` schema
2. Build Launchpad creation UI (name + add files/folders/URLs)
3. Build Launchpad view with one-click launch
4. Wire `P` shortcut

### Phase 5: Polish (1 session)
1. Update guide/index.html for V3
2. Update README.md
3. Update package.json version to 3.0.0
4. Final build + commit

---

## 9. Design Language (Keep from V2)

- Same warm paper palette: `#f5f2ea`, `#fffdf8`, `#29362f`, `#5f805f`
- Same typography, same monospace accents
- Same border-radius, same subtle shadows
- **Less is more** — V3 should feel lighter than V2, not heavier

---

## 10. The One Thing to Protect

> **The Quiet Log must NEVER become another task manager.**

No editing. No deleting. No organizing. No tags. No projects. No streaks. No graphs on the home screen. No reminders to log. 

It is a witness. Not a manager. Not a tracker.

The moment you add complexity to the log, it dies like the task system did.

---

## Future V3.x (Don't Build Yet)

These are ideas for after V3.0 is stable and being used daily:

- **AI Log Analysis:** Feed your log to an AI to discover patterns. *"You've been studying algorithms for 3 weeks — here's what stands out."*
- **Log Insights view:** Simple stats — entries per day, most active hours, word frequency.
- **Log Export:** Export as plain text or JSON for your own analysis.
- **Launchpad scheduling** (optional, only if explicitly needed): Schedule a Launchpad to auto-open at a time — but NO TASKS, just context opening.

---

*Document created: October 19, 2026*
*Next step: User reviews this plan, confirms direction, then Phase 1 begins.*
