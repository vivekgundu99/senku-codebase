import { marked } from 'marked';
import senkuIcon from './assets/senku.ico';
import type { SenkuState, Workspace, FocusRecord } from '../electron/types';

type NoteSlot = 'global' | 'main' | 'tasks' | 'scratch' | 'links';

let state: SenkuState = {
  version: 4,
  activeSpaceId: null,
  spaces: [],
  focus: {
    mode: 'work',
    active: false,
    paused: false,
    remainingSeconds: 30 * 60,
    goal: '',
    startedAt: null,
    durationMinutes: 30,
    history: [],
  },
  settings: {},
};

let appPaths = {
  userData: '',
  documents: '',
  home: '',
};

let activeSlot: NoteSlot = 'main';
let activeNoteContent = '';
let isNotePreview = false;
let isViewingLogsInCanvas = false;
let timerInterval: any = null;

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Built-in Starter Reference Templates
const STARTER_TEMPLATES: Record<NoteSlot, (spaceName: string) => string> = {
  global: () => `# Global Brain Dump
> Universal thoughts and cross-project ideas.

## Daily Scratchpad
- 

## Quick Todos
- [ ] 
`,

  main: (name) => `# ${name} — Documentation & Specs
> Core architecture, key decisions, and run commands.

## Overview
- Project goal:
- Primary dependencies:

## Quick Run Commands
\`\`\`bash
npm run dev
\`\`\`
`,

  tasks: (name) => `# ${name} — Tasks & Checklist
> Click any checkbox in Preview mode to toggle it live.

### Next Up
- [ ] Plan sprint targets
- [ ] Implement core features
- [ ] Test edge cases

### Completed
- [x] Workspace initialized
`,

  scratch: () => `# Scratchpad
> Temporary thinking canvas. Dump logs, test commands, or WIP snippets.

`,

  links: () => `# Global Pinned Links & Docs
> Universal bookmarks across all your projects. Click any link in Preview mode to open.

- [GitHub](https://github.com)
- [ChatGPT / Claude](https://chatgpt.com)
- [MDN Web Docs](https://developer.mozilla.org)
- [Localhost Dev](http://localhost:5173)
`,
};

// ---------------------------------------------------------------------------
// Helpers & Calculations
// ---------------------------------------------------------------------------

function getActiveSpace(): Workspace | null {
  if (!state.spaces || state.spaces.length === 0) return null;
  return state.spaces.find((s) => s.id === state.activeSpaceId) || state.spaces[0];
}

function getSlotPath(slot: NoteSlot): string {
  const base = appPaths.documents || appPaths.userData;
  if (slot === 'global') {
    return `${base}\\Senku Notes\\senku-global.md`;
  }
  if (slot === 'links') {
    return `${base}\\Senku Notes\\links.md`;
  }
  const space = getActiveSpace();
  if (!space) {
    return `${base}\\Senku Notes\\senku-fallback.md`;
  }
  const safeSpaceName = space.name.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'default';
  const spaceNotesDir = `${base}\\Senku Notes\\spaces\\${safeSpaceName}`;
  switch (slot) {
    case 'main':
      return `${spaceNotesDir}\\senku.md`;
    case 'tasks':
      return `${spaceNotesDir}\\tasks.md`;
    case 'scratch':
      return `${spaceNotesDir}\\scratch.md`;
    default:
      return `${spaceNotesDir}\\senku.md`;
  }
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Calculate Daily Work & Rest Stats
function getTodayFocusStats(): { workText: string; restText: string; totalSessions: number } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const history = state.focus?.history || [];
  const todayRecords = history.filter((b) => b.completedAt >= startOfDay);

  const workMinutes = todayRecords.filter((b) => b.type === 'work').reduce((acc, b) => acc + (b.durationMinutes || 0), 0);
  const restMinutes = todayRecords.filter((b) => b.type === 'rest').reduce((acc, b) => acc + (b.durationMinutes || 0), 0);

  const formatHrsMins = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return {
    workText: formatHrsMins(workMinutes),
    restText: formatHrsMins(restMinutes),
    totalSessions: todayRecords.length,
  };
}

// Rich Resonant Dual-Tone Harmonic Bell Chime
function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const playBellTone = (freq: number, startTime: number, duration: number, gainLevel: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const overtone = ctx.createOscillator();
      const overtoneGain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      overtone.type = 'sine';
      overtone.frequency.setValueAtTime(freq * 2, startTime);

      gain.gain.setValueAtTime(gainLevel, startTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      overtoneGain.gain.setValueAtTime(gainLevel * 0.35, startTime);
      overtoneGain.gain.exponentialRampToValueAtTime(0.0001, startTime + (duration * 0.6));

      osc.connect(gain);
      gain.connect(ctx.destination);
      overtone.connect(overtoneGain);
      overtoneGain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
      overtone.start(startTime);
      overtone.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playBellTone(880, now, 1.1, 0.45);        // Stroke 1: A5 (880 Hz)
    playBellTone(1046.5, now + 0.16, 1.3, 0.5); // Stroke 2: C6 (1046.5 Hz)
  } catch (err) {
    console.error('[chime]', err);
  }
}

// ---------------------------------------------------------------------------
// Markdown Parsing & Interactive Tasks
// ---------------------------------------------------------------------------

function renderMarkdownWithTasks(md: string): string {
  if (!md.trim()) {
    return '<p style="color: var(--text-dim); font-style: italic;">Empty note. Click Edit or type to start writing...</p>';
  }
  let html = marked.parse(md) as string;
  let taskIndex = 0;
  html = html.replace(/<input\s+([^>]*?)type=["']checkbox["']([^>]*?)>/gi, (_match, before, after) => {
    const clean = (before + after).replace(/disabled(="")?/gi, '');
    const idx = taskIndex++;
    return `<input type="checkbox" class="interactive-task" data-task-idx="${idx}" ${clean}>`;
  });
  return html;
}

function toggleTaskInMemory(targetIndex: number, isChecked: boolean) {
  const lines = activeNoteContent.split('\n');
  let currentIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*[-*]\s\[)([ xX])(\]\s.*)$/);
    if (match) {
      if (currentIdx === targetIndex) {
        const mark = isChecked ? 'x' : ' ';
        lines[i] = `${match[1]}${mark}${match[3]}`;
        activeNoteContent = lines.join('\n');
        return;
      }
      currentIdx++;
    }
  }
}

// ---------------------------------------------------------------------------
// State & File Operations
// ---------------------------------------------------------------------------

async function saveCurrentState(patch?: Partial<SenkuState>) {
  if (patch) {
    state = { ...state, ...patch };
  }
  await window.senku.saveState(state);
}

async function loadNoteForActiveSlot() {
  isViewingLogsInCanvas = false;
  const path = getSlotPath(activeSlot);
  try {
    let content = await window.senku.readNote(path);
    if (!content.trim()) {
      const space = getActiveSpace();
      const template = STARTER_TEMPLATES[activeSlot](space?.name || 'Workspace');
      content = template;
      await window.senku.writeNote(path, content);
    }
    activeNoteContent = content;
  } catch {
    activeNoteContent = '';
  }
  updateNoteCanvas();
}

async function saveActiveNote() {
  if (isViewingLogsInCanvas) return;
  const path = getSlotPath(activeSlot);
  await window.senku.writeNote(path, activeNoteContent);
}
const flushSaveNote = saveActiveNote;

async function switchSlot(newSlot: NoteSlot) {
  await flushSaveNote();
  activeSlot = newSlot;
  updateNoteSlotTabs();
  await loadNoteForActiveSlot();
}

// ---------------------------------------------------------------------------
// Shell Mounting (RUNS ONLY ONCE)
// ---------------------------------------------------------------------------

function buildShell() {
  const app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = `
    <!-- Top Drag Bar -->
    <header class="titlebar">
      <div class="titlebar-left">
        <div class="brand">
          <img src="${senkuIcon}" class="brand-icon" alt="Senku" onerror="this.src='./senku.ico'" />
          <span>SENKU</span>
        </div>
        <div class="space-tabs" id="space-tabs-container"></div>
        <button class="btn-more-spaces" id="btn-more-spaces" title="All Spaces (⋯)">⋯</button>
        <button class="btn-add-space" id="btn-add-space" title="Create Space (+)">+</button>
      </div>

      <div class="titlebar-right">
        <button class="window-btn theme-toggle" id="btn-theme-toggle" title="Toggle Light/Dark Theme">☀️</button>
        <button class="window-btn" id="win-min" title="Minimize">—</button>
        <button class="window-btn" id="win-max" title="Maximize">□</button>
        <button class="window-btn close" id="win-close" title="Close">✕</button>
      </div>
    </header>

    <!-- Main Content Split: Left (Space Context) / Right (Global Engine) -->
    <main class="main-view">
      <!-- LEFT HEMISPHERE: Local Space Context -->
      <section class="cockpit-panel" id="cockpit-panel">
        <div class="space-header">
          <div class="space-strip">
            <input class="space-name-input" id="space-name-input" placeholder="Space Name" title="Click to rename space" spellcheck="false" />
            <div class="space-strip-divider"></div>
            <div class="path-display" id="space-path-click" title="Click to open folder in File Explorer">
              <span class="path-icon">📁</span>
              <span id="space-path-text" class="path-text">...</span>
            </div>
            <button class="btn-danger btn-del-space" id="btn-del-space" title="Delete space (moves notes to Senku Notes/trash)">Delete</button>
          </div>
        </div>

        <!-- Full-Height 5-Slot Note Workbench Canvas -->
        <div class="note-section">
          <div class="note-header-bar">
            <div class="note-slot-bar">
              <!-- Global Notes Cluster -->
              <div class="note-slot-tabs" title="Global notes (shared across all spaces)">
                <button class="slot-tab" data-slot="global">Global</button>
                <button class="slot-tab" data-slot="links">Links</button>
              </div>
              <div class="note-slot-divider"></div>
              <!-- Space Notes Cluster -->
              <div class="note-slot-tabs" title="Space notes (specific to this workspace)">
                <button class="slot-tab" data-slot="main">Notes</button>
                <button class="slot-tab" data-slot="tasks">Tasks</button>
                <button class="slot-tab" data-slot="scratch">Scratch</button>
              </div>
            </div>
            <div class="note-actions">
              <button class="btn-secondary btn-icon" id="btn-open-note-code" title="Open active note in VS Code">&lt;&gt;</button>
              <button class="btn-secondary" id="toggle-note-mode" title="Toggle Preview (Ctrl+Enter)">
                Preview
              </button>
            </div>
          </div>
          <div class="note-editor-wrapper">
            <textarea class="note-textarea" id="note-textarea" placeholder="Start typing thoughts, tasks (- [ ]), notes, code blocks..."></textarea>
            <div class="note-preview" id="note-preview" style="display: none;"></div>
          </div>
        </div>
      </section>

      <!-- RIGHT HEMISPHERE: 100% Global Engine (Independent) -->
      <aside class="global-panel">
        <!-- Hero Daily Focus & Rest Stats Card -->
        <div class="focus-hero-card">
          <div class="focus-hero-metrics">
            <div class="metric-group">
              <span class="metric-label work">Work</span>
              <span class="metric-value" id="today-work-value">0m</span>
            </div>
            <div class="metric-group">
              <span class="metric-label rest">Rest</span>
              <span class="metric-value" id="today-rest-value">0m</span>
            </div>
          </div>
          <span class="focus-hero-badge" id="today-sessions-count">0 sessions</span>
        </div>

        <!-- Focus Session Box -->
        <div class="focus-box" id="focus-box">
          <!-- Mode Toggle: Work vs Rest -->
          <div class="mode-toggle-group">
            <button class="mode-btn active work" id="btn-mode-work">Work</button>
            <button class="mode-btn rest" id="btn-mode-rest">Rest</button>
            <button class="btn-icon-subtle" id="btn-test-chime" title="Test focus end chime">🔔</button>
          </div>

          <div class="focus-timer-container">
            <div class="focus-timer-text" id="focus-display" title="Click to edit custom minutes">30:00</div>
            <input type="number" class="focus-timer-input" id="focus-timer-input" min="1" max="720" style="display: none;" />
          </div>
          <div class="focus-progress-track">
            <div class="focus-progress-fill" id="focus-progress-bar"></div>
          </div>

          <input class="input-pill" id="focus-goal-input" placeholder="What are you working on?" />

          <!-- Presets: 15m, 30m, 45m -->
          <div class="focus-presets">
            <button class="preset-btn" data-mins="15">15m</button>
            <button class="preset-btn active" data-mins="30">30m</button>
            <button class="preset-btn" data-mins="45">45m</button>
          </div>

          <div class="focus-controls-row">
            <button class="btn-primary" id="btn-toggle-focus">Start Focus</button>
            <button class="btn-secondary" id="btn-reset-focus" style="display: none;">Reset</button>
          </div>
        </div>

        <!-- Global Work Logs Section -->
        <div class="global-logs-card">
          <div class="logs-header-row">
            <span class="section-label">logs.md</span>
            <div class="logs-header-actions">
              <button class="btn-secondary" id="btn-view-logs-md" title="View full logs.md inside Senku viewer">View</button>
              <button class="btn-secondary" id="btn-open-logs-code" title="Open logs.md in VS Code">Code</button>
            </div>
          </div>

          <input class="quick-log-input" id="quick-log-input" placeholder="Log completed work & hit Enter..." />

          <!-- Lazy-loaded stream of recent logs -->
          <div class="logs-stream-list" id="logs-stream-container"></div>
        </div>
      </aside>
    </main>

    <!-- Command Palette (Ctrl+P / Ctrl+K) -->
    <div id="palette-overlay" class="palette-overlay" style="display: none;">
      <div class="palette-box">
        <input id="palette-input" class="palette-input" placeholder="Type a command or space name..." autocomplete="off" />
        <div id="palette-list" class="palette-list"></div>
      </div>
    </div>
  `;

  bindPersistentEvents();
}

// ---------------------------------------------------------------------------
// Granular Targeted DOM Updaters (NO FULL PAGE REFRESH)
// ---------------------------------------------------------------------------

function updateSpaceTabs() {
  const container = document.getElementById('space-tabs-container');
  if (!container) return;

  if (!state.settings) state.settings = {};
  if (!state.settings.openSpaceIds || state.settings.openSpaceIds.length === 0) {
    state.settings.openSpaceIds = state.spaces.map((s) => s.id);
  }

  // Ensure active space is in openSpaceIds
  const activeSpace = getActiveSpace();
  if (activeSpace && !state.settings.openSpaceIds.includes(activeSpace.id)) {
    state.settings.openSpaceIds.push(activeSpace.id);
  }

  let openSpaces = state.spaces.filter((s) => state.settings.openSpaceIds?.includes(s.id));
  if (openSpaces.length === 0 && state.spaces.length > 0) {
    openSpaces = [state.spaces[0]];
    state.settings.openSpaceIds = [state.spaces[0].id];
    state.activeSpaceId = state.spaces[0].id;
  }

  container.innerHTML = openSpaces
    .map(
      (s) => `
    <div class="space-tab ${s.id === activeSpace?.id ? 'active' : ''}" data-space-id="${s.id}" title="${s.name} (${s.path})">
      <span class="space-tab-label">${s.name}</span>
      <span class="space-tab-close" data-close-id="${s.id}" title="Close tab">✕</span>
    </div>
  `,
    )
    .join('');

  container.querySelectorAll('.space-tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      const spaceId = tab.getAttribute('data-space-id');
      if (spaceId && spaceId !== state.activeSpaceId) {
        await flushSaveNote();
        state.activeSpaceId = spaceId;
        await saveCurrentState();
        updateSpaceTabs();
        updateSpaceHeader();
        await loadNoteForActiveSlot();
      }
    });
  });

  container.querySelectorAll('.space-tab-close').forEach((closeBtn) => {
    closeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const closeId = closeBtn.getAttribute('data-close-id');
      if (!closeId || !state.settings.openSpaceIds) return;

      if (state.settings.openSpaceIds.length <= 1) {
        return; // Keep at least one tab open
      }

      state.settings.openSpaceIds = state.settings.openSpaceIds.filter((id) => id !== closeId);
      if (state.activeSpaceId === closeId) {
        state.activeSpaceId = state.settings.openSpaceIds[state.settings.openSpaceIds.length - 1];
        await loadNoteForActiveSlot();
      }
      await saveCurrentState();
      updateSpaceTabs();
      updateSpaceHeader();
    });
  });
  updateSpaceHeader();
}

function canDeleteActiveSpace(): boolean {
  if (state.spaces.length <= 1) return false;
  const openSpaces = state.spaces.filter((s) => state.settings.openSpaceIds?.includes(s.id));
  if (openSpaces.length <= 1) return false;
  return true;
}

function updateSpaceHeader() {
  const activeSpace = getActiveSpace();
  const nameInput = document.getElementById('space-name-input') as HTMLInputElement | null;
  const pathText = document.getElementById('space-path-text');
  const delBtn = document.getElementById('btn-del-space') as HTMLButtonElement | null;

  if (activeSpace) {
    if (nameInput) {
      nameInput.value = activeSpace.name;
      nameInput.size = Math.max(activeSpace.name.length, 6);
    }
    if (pathText) pathText.textContent = activeSpace.path;
  }

  if (delBtn) {
    if (!canDeleteActiveSpace()) {
      delBtn.disabled = true;
      delBtn.style.opacity = '0.35';
      delBtn.style.cursor = 'not-allowed';
      delBtn.title = 'Cannot delete when only one space tab is active';
    } else {
      delBtn.disabled = false;
      delBtn.style.opacity = '1';
      delBtn.style.cursor = 'pointer';
      delBtn.title = 'Delete space (moves notes to Senku Notes/trash)';
    }
  }
}

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme);
  const themeBtn = document.getElementById('btn-theme-toggle');
  if (themeBtn) {
    themeBtn.textContent = theme === 'light' ? '🌙' : '☀️';
    themeBtn.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode (OG Paper)';
  }
}

async function toggleTheme() {
  const current = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark';
  const nextTheme: 'dark' | 'light' = current === 'light' ? 'dark' : 'light';
  applyTheme(nextTheme);
  state.settings.theme = nextTheme;
  await saveCurrentState();
}

// ---------------------------------------------------------------------------
// Space Actions & Command Palette
// ---------------------------------------------------------------------------

async function handleAddNewSpace() {
  const folder = await window.senku.pickFolder();
  if (!folder) return;
  const name = folder.split(/[\\/]/).filter(Boolean).pop() || 'New Space';
  const newSpace: Workspace = {
    id: crypto.randomUUID(),
    name,
    path: folder,
    createdAt: Date.now(),
  };
  state.spaces.push(newSpace);
  if (!state.settings.openSpaceIds) state.settings.openSpaceIds = [];
  state.settings.openSpaceIds.push(newSpace.id);
  state.activeSpaceId = newSpace.id;
  await saveCurrentState();
  updateSpaceTabs();
  updateSpaceHeader();
  await loadNoteForActiveSlot();
}

async function handleRenameSpace(space: Workspace) {
  if (space.id !== state.activeSpaceId) {
    state.activeSpaceId = space.id;
    updateSpaceTabs();
    updateSpaceHeader();
    await loadNoteForActiveSlot();
  }
  const nameInput = document.getElementById('space-name-input') as HTMLInputElement | null;
  if (nameInput) {
    nameInput.focus();
    nameInput.select();
  }
}

interface PaletteItem {
  id: string;
  category: string;
  label: string;
  hint?: string;
  action: () => void | Promise<void>;
}

let paletteItems: PaletteItem[] = [];
let paletteSelectedIndex = 0;

function openPalette(initialQuery = '') {
  const overlay = document.getElementById('palette-overlay');
  const input = document.getElementById('palette-input') as HTMLInputElement | null;
  if (!overlay || !input) return;

  paletteSelectedIndex = 0;
  input.value = initialQuery;
  overlay.style.display = 'flex';
  input.focus();
  if (initialQuery) {
    input.select();
  }
  renderPalette();
}

function closePalette() {
  const overlay = document.getElementById('palette-overlay');
  if (overlay) overlay.style.display = 'none';
}

function getAvailablePaletteItems(query = ''): PaletteItem[] {
  const q = query.toLowerCase().trim();
  const items: PaletteItem[] = [];

  // Spaces (all workspaces, click to switch/open)
  state.spaces.forEach((s) => {
    items.push({
      id: `space-${s.id}`,
      category: 'Space',
      label: s.name,
      hint: s.path,
      action: async () => {
        if (!state.settings.openSpaceIds) state.settings.openSpaceIds = [];
        if (!state.settings.openSpaceIds.includes(s.id)) {
          state.settings.openSpaceIds.push(s.id);
        }
        await flushSaveNote();
        state.activeSpaceId = s.id;
        await saveCurrentState();
        updateSpaceTabs();
        updateSpaceHeader();
        await loadNoteForActiveSlot();
      },
    });
  });

  // Notes navigation
  const slots: { slot: NoteSlot; label: string }[] = [
    { slot: 'global', label: 'Global.md' },
    { slot: 'links', label: 'Links.md' },
    { slot: 'main', label: 'Notes.md' },
    { slot: 'tasks', label: 'Tasks.md' },
    { slot: 'scratch', label: 'Scratch.md' },
  ];
  slots.forEach((s) => {
    items.push({
      id: `note-${s.slot}`,
      category: 'Note',
      label: s.label,
      action: () => switchSlot(s.slot),
    });
  });

  // Actions
  items.push({
    id: 'act-new-space',
    category: 'Action',
    label: '+ Create New Space',
    action: () => handleAddNewSpace(),
  });
  items.push({
    id: 'act-rename-space',
    category: 'Action',
    label: 'Rename Active Space',
    action: () => {
      const s = getActiveSpace();
      if (s) handleRenameSpace(s);
    },
  });
  items.push({
    id: 'act-theme',
    category: 'Action',
    label: 'Toggle Light / Dark Theme',
    action: () => toggleTheme(),
  });
  items.push({
    id: 'act-explorer',
    category: 'Action',
    label: 'Open in Explorer',
    action: () => {
      const s = getActiveSpace();
      if (s) window.senku.openFolder(s.path);
    },
  });
  items.push({
    id: 'act-code',
    category: 'Action',
    label: 'Open in VS Code',
    action: () => {
      const s = getActiveSpace();
      if (s) window.senku.openCode(s.path);
    },
  });
  items.push({
    id: 'act-terminal',
    category: 'Action',
    label: 'Open in Terminal',
    action: () => {
      const s = getActiveSpace();
      if (s) window.senku.openTerminal(s.path);
    },
  });
  items.push({
    id: 'act-logs',
    category: 'Action',
    label: 'View logs.md',
    action: () => {
      document.getElementById('btn-view-logs-md')?.click();
    },
  });

  if (!q) return items;
  return items.filter(
    (item) => item.label.toLowerCase().includes(q) || item.category.toLowerCase().includes(q) || (item.hint && item.hint.toLowerCase().includes(q)),
  );
}

function renderPalette() {
  const input = document.getElementById('palette-input') as HTMLInputElement | null;
  const list = document.getElementById('palette-list');
  if (!list) return;

  const query = input?.value || '';
  paletteItems = getAvailablePaletteItems(query);

  if (paletteSelectedIndex >= paletteItems.length) {
    paletteSelectedIndex = Math.max(0, paletteItems.length - 1);
  }

  if (paletteItems.length === 0) {
    list.innerHTML = `<div class="palette-empty">No results found</div>`;
    return;
  }

  list.innerHTML = paletteItems
    .map(
      (item, idx) => `
    <div class="palette-item ${idx === paletteSelectedIndex ? 'selected' : ''}" data-idx="${idx}">
      <span class="palette-item-badge">${item.category}</span>
      <span class="palette-item-label">${item.label}</span>
      ${item.hint ? `<span class="palette-item-hint">${item.hint}</span>` : ''}
    </div>
  `,
    )
    .join('');

  list.querySelectorAll('.palette-item').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.getAttribute('data-idx'));
      runPaletteItem(idx);
    });
  });

  const selectedEl = list.children[paletteSelectedIndex] as HTMLElement | undefined;
  if (selectedEl) {
    selectedEl.scrollIntoView({ block: 'nearest' });
  }
}

async function runPaletteItem(index: number) {
  const item = paletteItems[index];
  if (item) {
    closePalette();
    await item.action();
  }
}

function updateNoteSlotTabs() {
  document.querySelectorAll('.slot-tab').forEach((tab) => {
    const slot = tab.getAttribute('data-slot');
    if (slot === activeSlot && !isViewingLogsInCanvas) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
}

function updateNoteCanvas() {
  const textarea = document.getElementById('note-textarea') as HTMLTextAreaElement | null;
  const preview = document.getElementById('note-preview');
  const toggleBtn = document.getElementById('toggle-note-mode');

  if (toggleBtn) {
    toggleBtn.textContent = isNotePreview ? 'Edit' : 'Preview';
  }

  if (isNotePreview) {
    if (textarea) textarea.style.display = 'none';
    if (preview) {
      preview.style.display = 'block';
      preview.innerHTML = renderMarkdownWithTasks(activeNoteContent);

      preview.querySelectorAll('.interactive-task').forEach((cb) => {
        cb.addEventListener('change', async (e) => {
          const input = e.target as HTMLInputElement;
          const idx = Number(input.getAttribute('data-task-idx'));
          if (!isNaN(idx)) {
            toggleTaskInMemory(idx, input.checked);
            await saveActiveNote();
            const parentLi = input.closest('li');
            if (parentLi) {
              if (input.checked) parentLi.classList.add('task-done');
              else parentLi.classList.remove('task-done');
            }
          }
        });
      });

      preview.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const href = link.getAttribute('href');
          if (href) window.senku.openUrl(href);
        });
      });
    }
  } else {
    if (preview) preview.style.display = 'none';
    if (textarea) {
      textarea.style.display = 'block';
      textarea.value = activeNoteContent;
    }
  }
}

function updateFocusUI() {
  const box = document.getElementById('focus-box');
  const display = document.getElementById('focus-display');
  const bar = document.getElementById('focus-progress-bar');
  const toggleBtn = document.getElementById('btn-toggle-focus');
  const resetBtn = document.getElementById('btn-reset-focus');
  const goalInput = document.getElementById('focus-goal-input') as HTMLInputElement | null;
  const workVal = document.getElementById('today-work-value');
  const restVal = document.getElementById('today-rest-value');
  const sessBadge = document.getElementById('today-sessions-count');
  const workModeBtn = document.getElementById('btn-mode-work');
  const restModeBtn = document.getElementById('btn-mode-rest');

  // Daily Stats
  const stats = getTodayFocusStats();
  if (workVal) workVal.textContent = stats.workText;
  if (restVal) restVal.textContent = stats.restText;
  if (sessBadge) sessBadge.textContent = `${stats.totalSessions} sessions`;

  const mode = state.focus?.mode || 'work';
  if (mode === 'work') {
    workModeBtn?.classList.add('active');
    restModeBtn?.classList.remove('active');
    bar?.classList.remove('rest');
    if (goalInput && !state.focus?.active) goalInput.placeholder = 'What are you working on?';
  } else {
    restModeBtn?.classList.add('active');
    workModeBtn?.classList.remove('active');
    bar?.classList.add('rest');
    if (goalInput && !state.focus?.active) goalInput.placeholder = 'Rest & recharge...';
  }

  const totalSec = (state.focus?.durationMinutes || 30) * 60;
  let remaining = state.focus?.remainingSeconds ?? totalSec;

  if (state.focus?.active && !state.focus?.paused && state.focus?.startedAt) {
    const elapsed = Math.floor((Date.now() - state.focus.startedAt) / 1000);
    remaining = Math.max(0, totalSec - elapsed);
    state.focus.remainingSeconds = remaining;
  }

  const progressPct = Math.min(100, Math.max(0, ((totalSec - remaining) / totalSec) * 100));

  if (display) {
    display.textContent = formatDuration(remaining);
    if (state.focus?.active) {
      display.classList.add('running');
      display.title = 'Focus timer running';
    } else {
      display.classList.remove('running');
      display.title = 'Click to edit custom minutes';
    }
  }
  if (bar) bar.style.width = `${progressPct}%`;

  // Highlight active preset button if matches current minutes
  document.querySelectorAll('.preset-btn[data-mins]').forEach((btn) => {
    const m = Number(btn.getAttribute('data-mins'));
    if (m === state.focus?.durationMinutes && !state.focus?.active) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  if (state.focus?.active) {
    box?.classList.add('running', mode);
    if (resetBtn) resetBtn.style.display = 'block';
    if (goalInput) goalInput.disabled = true;

    if (state.focus.paused) {
      if (toggleBtn) {
        toggleBtn.textContent = 'Resume';
        toggleBtn.className = mode === 'rest' ? 'btn-primary rest-active' : 'btn-primary';
      }
    } else {
      if (toggleBtn) {
        toggleBtn.textContent = 'Pause';
        toggleBtn.className = mode === 'rest' ? 'btn-primary rest-active' : 'btn-primary';
      }
    }
  } else {
    box?.classList.remove('running', 'work', 'rest');
    if (resetBtn) resetBtn.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.textContent = mode === 'work' ? 'Start Focus' : 'Start Rest';
      toggleBtn.className = mode === 'rest' ? 'btn-primary rest-active' : 'btn-primary';
    }
    if (goalInput) goalInput.disabled = false;
  }
}

function updateFocusTimerTick(remaining: number, progressPct: number) {
  const display = document.getElementById('focus-display');
  const bar = document.getElementById('focus-progress-bar');
  if (display) display.textContent = formatDuration(remaining);
  if (bar) bar.style.width = `${progressPct}%`;
}

// Lazy load & parse recent logs from documents/Senku Notes/logs.md
async function updateLogsStream() {
  const container = document.getElementById('logs-stream-container');
  if (!container) return;

  try {
    const raw = await window.senku.readLogs();
    const lines = raw.split('\n').filter((l) => l.trim().startsWith('- '));

    if (lines.length === 0) {
      container.innerHTML = `
        <div style="color: var(--text-dim); font-size: 11px; text-align: center; padding: 20px 0;">
          No logs recorded yet.<br>Type work above or finish a focus session.
        </div>
      `;
      return;
    }

    // Top 15 entries in descending order (logs.md prepends newest on top)
    const recent = lines.slice(0, 15);

    const escapeHtml = (str: string) =>
      str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    container.innerHTML = recent
      .map((line) => {
        // Line format: - 21:39 Text or legacy - 16:45 [Space] Text
        const match = line.match(/^-\s+(\d{1,2}[:.]\d{2}(?:\s*[aApP][mM])?)\s+(?:\[.*?\]\s+)?(.*)$/);
        if (match) {
          const time = match[1].replace('.', ':');
          const text = escapeHtml(match[2].trim());
          return `
            <div class="log-stream-entry">
              <span class="log-stream-time">${time}</span>
              <span class="log-stream-text">${text}</span>
            </div>
          `;
        }
        return `
          <div class="log-stream-entry">
            <span class="log-stream-text">${escapeHtml(line.replace(/^-\s*/, ''))}</span>
          </div>
        `;
      })
      .join('');
  } catch (err) {
    console.error('[logs-stream]', err);
  }
}

// ---------------------------------------------------------------------------
// Bind Persistent Events (RUNS ONCE)
// ---------------------------------------------------------------------------

function bindPersistentEvents() {
  // Window Controls
  document.getElementById('win-min')?.addEventListener('click', () => window.senku.minimize());
  document.getElementById('win-close')?.addEventListener('click', () => window.senku.close());

  const winMaxBtn = document.getElementById('win-max');
  const updateMaximizeUI = async () => {
    const isMax = await window.senku.isMaximized();
    if (winMaxBtn) winMaxBtn.textContent = isMax ? '❐' : '□';
    const app = document.getElementById('app');
    if (isMax) app?.classList.add('maximized');
    else app?.classList.remove('maximized');
  };

  winMaxBtn?.addEventListener('click', async () => {
    await window.senku.toggleMaximize();
    await updateMaximizeUI();
  });

  // Double-click titlebar to maximize / restore
  document.querySelector('.titlebar')?.addEventListener('dblclick', async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('.window-btn') || target.closest('.space-tab') || target.closest('.btn-add-space') || target.closest('.btn-more-spaces')) return;
    await window.senku.toggleMaximize();
    await updateMaximizeUI();
  });

  // Theme Toggle: Dark vs Light (OG Warm Paper)
  document.getElementById('btn-theme-toggle')?.addEventListener('click', toggleTheme);

  // Test Bell Chime
  document.getElementById('btn-test-chime')?.addEventListener('click', () => {
    playChime();
  });

  // Space Actions
  document.getElementById('btn-add-space')?.addEventListener('click', handleAddNewSpace);
  document.getElementById('btn-more-spaces')?.addEventListener('click', () => {
    openPalette('space');
  });

  // Space Name Inline Edit (with safe Documents folder renaming)
  const nameInput = document.getElementById('space-name-input') as HTMLInputElement | null;
  nameInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      nameInput.blur();
    }
  });

  nameInput?.addEventListener('input', () => {
    if (nameInput) {
      nameInput.size = Math.max(nameInput.value.length, 6);
    }
  });

  nameInput?.addEventListener('change', async () => {
    const activeSpace = getActiveSpace();
    if (!activeSpace) return;
    const newName = nameInput.value.trim();
    if (newName && newName !== activeSpace.name) {
      const oldName = activeSpace.name;
      await window.senku.renameSpaceNotesDir(oldName, newName);
      activeSpace.name = newName;
      await saveCurrentState();
      updateSpaceTabs();
      await loadNoteForActiveSlot();
    } else {
      nameInput.value = activeSpace.name;
    }
    nameInput.size = Math.max(nameInput.value.length, 6);
  });

  // Safe 2-Step Space Delete (moves notes to Documents/Senku Notes/trash)
  let deleteConfirmTimeout: any = null;
  let isDeletePending = false;
  const delBtn = document.getElementById('btn-del-space');
  delBtn?.addEventListener('click', async () => {
    if (!canDeleteActiveSpace()) return;
    const activeSpace = getActiveSpace();
    if (!activeSpace) return;

    if (!isDeletePending) {
      // Step 1: Arm delete
      isDeletePending = true;
      delBtn.textContent = 'Confirm?';
      delBtn.classList.add('btn-confirm-delete');
      if (deleteConfirmTimeout) clearTimeout(deleteConfirmTimeout);
      deleteConfirmTimeout = setTimeout(() => {
        isDeletePending = false;
        delBtn.textContent = 'Delete';
        delBtn.classList.remove('btn-confirm-delete');
      }, 3000);
      return;
    }

    // Step 2: Confirm click
    clearTimeout(deleteConfirmTimeout);
    isDeletePending = false;
    delBtn.textContent = 'Delete';
    delBtn.classList.remove('btn-confirm-delete');

    const targetId = activeSpace.id;
    const targetName = activeSpace.name;

    // Safely move space notes directory to Documents/Senku Notes/trash
    try {
      await window.senku.trashSpaceNotesDir(targetName);
    } catch (err) {
      console.warn('Failed moving space notes to trash:', err);
    }

    // Remove target space from spaces & openSpaceIds
    state.spaces = state.spaces.filter((s) => s.id !== targetId);
    if (state.settings.openSpaceIds) {
      state.settings.openSpaceIds = state.settings.openSpaceIds.filter((id) => id !== targetId);
    }

    // Safely fallback to the other remaining open space tab
    const remainingOpenIds = state.settings.openSpaceIds || [];
    if (remainingOpenIds.length > 0) {
      state.activeSpaceId = remainingOpenIds[0];
    } else if (state.spaces.length > 0) {
      state.settings.openSpaceIds = [state.spaces[0].id];
      state.activeSpaceId = state.spaces[0].id;
    }

    await saveCurrentState();
    updateSpaceTabs();
    updateSpaceHeader();
    await loadNoteForActiveSlot();
  });

  document.getElementById('space-path-click')?.addEventListener('click', () => {
    const activeSpace = getActiveSpace();
    if (activeSpace) window.senku.openFolder(activeSpace.path);
  });

  // Command Palette Listeners (Ctrl+K or 'c')
  window.addEventListener('keydown', (e) => {
    // 1. Ctrl+K (or Cmd+K)
    const isCtrlK = (e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K');

    // 2. Single 'c' key when NOT typing in an editable field or holding modifier keys
    const activeEl = document.activeElement as HTMLElement | null;
    const isEditing = activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.isContentEditable
    );
    const isPlainC = !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === 'c' || e.key === 'C') && !isEditing;

    if (isCtrlK || isPlainC) {
      e.preventDefault();
      const overlay = document.getElementById('palette-overlay');
      if (overlay && overlay.style.display !== 'none') {
        closePalette();
      } else {
        openPalette();
      }
    }
  });

  const pInput = document.getElementById('palette-input') as HTMLInputElement | null;
  pInput?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (paletteSelectedIndex < paletteItems.length - 1) {
        paletteSelectedIndex++;
        renderPalette();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (paletteSelectedIndex > 0) {
        paletteSelectedIndex--;
        renderPalette();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runPaletteItem(paletteSelectedIndex);
    } else if (e.key === 'Escape') {
      closePalette();
    }
  });

  pInput?.addEventListener('input', () => {
    paletteSelectedIndex = 0;
    renderPalette();
  });

  document.getElementById('palette-overlay')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closePalette();
  });

  // 5 Desk-Pad Slot Tabs
  document.querySelectorAll('.slot-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const slot = tab.getAttribute('data-slot') as NoteSlot;
      if (slot && (slot !== activeSlot || isViewingLogsInCanvas)) {
        switchSlot(slot);
      }
    });
  });

  // Open active note in VS Code
  document.getElementById('btn-open-note-code')?.addEventListener('click', () => {
    if (isViewingLogsInCanvas) {
      window.senku.getLogsPath().then((p) => window.senku.openCode(p));
    } else {
      const notePath = getSlotPath(activeSlot);
      window.senku.openCode(notePath);
    }
  });

  // Note Toggle Edit / Preview
  document.getElementById('toggle-note-mode')?.addEventListener('click', async () => {
    if (!isNotePreview) {
      await saveActiveNote();
    }
    isNotePreview = !isNotePreview;
    updateNoteCanvas();
  });

  // View logs.md in Senku Canvas
  document.getElementById('btn-view-logs-md')?.addEventListener('click', async () => {
    isViewingLogsInCanvas = true;
    document.querySelectorAll('.slot-tab').forEach((t) => t.classList.remove('active'));
    activeNoteContent = await window.senku.readLogs();
    isNotePreview = true;
    updateNoteCanvas();
  });

  // Open logs.md in VS Code
  document.getElementById('btn-open-logs-code')?.addEventListener('click', async () => {
    const p = await window.senku.getLogsPath();
    window.senku.openCode(p);
  });

  // Quick Log Input (Enter submits directly to logs.md)
  const quickLog = document.getElementById('quick-log-input') as HTMLInputElement | null;
  quickLog?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && quickLog.value.trim()) {
      const text = quickLog.value.trim();
      await window.senku.appendLog(text);
      quickLog.value = '';
      updateLogsStream();
    }
  });

  // Note Textarea Editor
  const noteArea = document.getElementById('note-textarea') as HTMLTextAreaElement | null;
  if (noteArea) {
    noteArea.addEventListener('input', () => {
      activeNoteContent = noteArea.value;
    });

    noteArea.addEventListener('blur', () => {
      saveActiveNote();
    });

    window.addEventListener('blur', () => {
      saveActiveNote();
    });

    noteArea.addEventListener('keydown', (e) => {
      // Tab -> 2 spaces indent
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = noteArea.selectionStart;
        const end = noteArea.selectionEnd;
        if (e.shiftKey) {
          const textBefore = noteArea.value.substring(0, start);
          if (textBefore.endsWith('  ')) {
            noteArea.value = noteArea.value.substring(0, start - 2) + noteArea.value.substring(start);
            noteArea.selectionStart = noteArea.selectionEnd = start - 2;
          }
        } else {
          noteArea.value = noteArea.value.substring(0, start) + '  ' + noteArea.value.substring(end);
          noteArea.selectionStart = noteArea.selectionEnd = start + 2;
        }
        activeNoteContent = noteArea.value;
        return;
      }

      // Enter -> Smart list continuation
      if (e.key === 'Enter') {
        const cursor = noteArea.selectionStart;
        const textBefore = noteArea.value.substring(0, cursor);
        const lastLine = textBefore.split('\n').pop() || '';

        const taskMatch = lastLine.match(/^(\s*[-*]\s\[[ xX]\]\s)(.*)$/);
        if (taskMatch) {
          if (!taskMatch[2].trim()) {
            e.preventDefault();
            const lineStart = cursor - lastLine.length;
            noteArea.value = noteArea.value.substring(0, lineStart) + noteArea.value.substring(cursor);
            noteArea.selectionStart = noteArea.selectionEnd = lineStart;
            activeNoteContent = noteArea.value;
            return;
          }
          e.preventDefault();
          const insert = `\n${taskMatch[1].replace(/\[[xX]\]/, '[ ]')}`;
          noteArea.value = noteArea.value.substring(0, cursor) + insert + noteArea.value.substring(cursor);
          noteArea.selectionStart = noteArea.selectionEnd = cursor + insert.length;
          activeNoteContent = noteArea.value;
          return;
        }

        const bulletMatch = lastLine.match(/^(\s*[-*]\s)(.*)$/);
        if (bulletMatch) {
          if (!bulletMatch[2].trim()) {
            e.preventDefault();
            const lineStart = cursor - lastLine.length;
            noteArea.value = noteArea.value.substring(0, lineStart) + noteArea.value.substring(cursor);
            noteArea.selectionStart = noteArea.selectionEnd = lineStart;
            activeNoteContent = noteArea.value;
            return;
          }
          e.preventDefault();
          const insert = `\n${bulletMatch[1]}`;
          noteArea.value = noteArea.value.substring(0, cursor) + insert + noteArea.value.substring(cursor);
          noteArea.selectionStart = noteArea.selectionEnd = cursor + insert.length;
          activeNoteContent = noteArea.value;
          return;
        }
      }
    });
  }

  // Focus Mode Buttons: Work vs Rest
  document.getElementById('btn-mode-work')?.addEventListener('click', async () => {
    state.focus.mode = 'work';
    state.focus.active = false;
    state.focus.paused = false;
    state.focus.durationMinutes = 30;
    state.focus.remainingSeconds = 30 * 60;
    state.focus.startedAt = null;
    await saveCurrentState();
    updateFocusUI();
  });

  document.getElementById('btn-mode-rest')?.addEventListener('click', async () => {
    state.focus.mode = 'rest';
    state.focus.active = false;
    state.focus.paused = false;
    state.focus.durationMinutes = 5;
    state.focus.remainingSeconds = 5 * 60;
    state.focus.startedAt = null;
    await saveCurrentState();
    updateFocusUI();
  });

  // Focus Timer Controls
  const toggleFocus = async () => {
    const goalInput = document.getElementById('focus-goal-input') as HTMLInputElement | null;
    const mode = state.focus.mode || 'work';

    if (!state.focus?.active) {
      const typedGoal = goalInput?.value.trim() || '';
      state.focus = {
        mode,
        active: true,
        paused: false,
        remainingSeconds: (state.focus?.durationMinutes || 30) * 60,
        goal: typedGoal,
        startedAt: Date.now(),
        durationMinutes: state.focus?.durationMinutes || 30,
        history: state.focus?.history || [],
      };
    } else if (state.focus.paused) {
      state.focus.paused = false;
      state.focus.startedAt = Date.now() - (((state.focus.durationMinutes || 30) * 60 - (state.focus.remainingSeconds || 0)) * 1000);
    } else {
      state.focus.paused = true;
    }
    await saveCurrentState();
    updateFocusUI();
  };

  document.getElementById('btn-toggle-focus')?.addEventListener('click', toggleFocus);

  // Reset Focus
  document.getElementById('btn-reset-focus')?.addEventListener('click', async () => {
    const defMins = state.focus.mode === 'rest' ? 5 : 30;
    state.focus.active = false;
    state.focus.paused = false;
    state.focus.startedAt = null;
    state.focus.remainingSeconds = defMins * 60;
    state.focus.durationMinutes = defMins;
    await saveCurrentState();
    updateFocusUI();
  });

  // Focus presets: 15m, 30m, 45m
  document.querySelectorAll('.preset-btn[data-mins]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const mins = Number(btn.getAttribute('data-mins')) || 30;
      state.focus.durationMinutes = mins;
      state.focus.remainingSeconds = mins * 60;
      if (!state.focus.active) {
        state.focus.startedAt = null;
      }
      await saveCurrentState();
      updateFocusUI();
    });
  });

  // In-place Timer Edit (Click big timer numbers when stopped to edit custom minutes)
  const display = document.getElementById('focus-display');
  const timerInput = document.getElementById('focus-timer-input') as HTMLInputElement | null;

  display?.addEventListener('click', () => {
    if (state.focus?.active) return;
    if (timerInput && display) {
      timerInput.value = String(state.focus?.durationMinutes || 30);
      display.style.display = 'none';
      timerInput.style.display = 'block';
      timerInput.focus();
      timerInput.select();
    }
  });

  const commitTimerEdit = async () => {
    if (!timerInput || timerInput.style.display === 'none') return;
    const mins = Math.max(1, Math.min(720, parseInt(timerInput.value, 10) || 30));
    state.focus.durationMinutes = mins;
    state.focus.remainingSeconds = mins * 60;
    state.focus.startedAt = null;
    timerInput.style.display = 'none';
    if (display) display.style.display = 'block';
    await saveCurrentState();
    updateFocusUI();
  };

  timerInput?.addEventListener('blur', commitTimerEdit);
  timerInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      commitTimerEdit();
    } else if (e.key === 'Escape') {
      if (timerInput) timerInput.style.display = 'none';
      if (display) display.style.display = 'block';
    }
  });
}

// ---------------------------------------------------------------------------
// Global Keyboard Shortcuts
// ---------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  // Ctrl+Enter toggles preview anywhere
  if (e.ctrlKey && e.key === 'Enter') {
    if (!isNotePreview) {
      saveActiveNote();
    }
    isNotePreview = !isNotePreview;
    updateNoteCanvas();
  }
});

// ---------------------------------------------------------------------------
// Precision 1-Second Timer Loop
// ---------------------------------------------------------------------------

function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(async () => {
    if (state.focus?.active && !state.focus?.paused && state.focus?.startedAt) {
      const totalSec = (state.focus.durationMinutes || 30) * 60;
      const elapsed = Math.floor((Date.now() - state.focus.startedAt) / 1000);
      const remaining = Math.max(0, totalSec - elapsed);
      state.focus.remainingSeconds = remaining;

      const progressPct = Math.min(100, Math.max(0, ((totalSec - remaining) / totalSec) * 100));
      updateFocusTimerTick(remaining, progressPct);

      if (remaining === 0) {
        // Complete focus session!
        const durationMins = state.focus.durationMinutes || 30;
        const mode = state.focus.mode || 'work';
        const rawGoal = (state.focus.goal || '').trim();

        const newRecord: FocusRecord = {
          id: crypto.randomUUID(),
          type: mode,
          goal: rawGoal || (mode === 'work' ? 'Deep Work' : 'Break'),
          durationMinutes: durationMins,
          completedAt: Date.now(),
        };

        if (!state.focus.history) state.focus.history = [];
        state.focus.history.push(newRecord);

        // ONLY append to logs.md if user explicitly typed a goal!
        if (mode === 'work' && rawGoal.length > 0) {
          const logMsg = `(Work ${durationMins}m) ${rawGoal}`;
          await window.senku.appendLog(logMsg);
        }

        playChime();

        // Switch to the other mode seamlessly!
        if (mode === 'work') {
          state.focus.mode = 'rest';
          state.focus.active = false;
          state.focus.paused = false;
          state.focus.durationMinutes = 5;
          state.focus.remainingSeconds = 5 * 60;
          state.focus.startedAt = null;
          state.focus.goal = '';
          const gInput = document.getElementById('focus-goal-input') as HTMLInputElement | null;
          if (gInput) gInput.value = '';
        } else {
          state.focus.mode = 'work';
          state.focus.active = false;
          state.focus.paused = false;
          state.focus.durationMinutes = 30;
          state.focus.remainingSeconds = 30 * 60;
          state.focus.startedAt = null;
          state.focus.goal = '';
          const gInput = document.getElementById('focus-goal-input') as HTMLInputElement | null;
          if (gInput) gInput.value = '';
        }

        await saveCurrentState();
        updateFocusUI();
        updateLogsStream();
      }
    }
  }, 1000);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  try {
    appPaths = await window.senku.getAppPaths();
    state = await window.senku.getState();

    buildShell();

    // Apply saved theme
    if (state.settings?.theme) {
      document.documentElement.setAttribute('data-theme', state.settings.theme);
      const themeBtn = document.getElementById('btn-theme-toggle');
      if (themeBtn) {
        themeBtn.textContent = state.settings.theme === 'light' ? '🌙' : '☀️';
        themeBtn.title = state.settings.theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode (OG Paper)';
      }
    }

    // Apply initial window maximize state
    const isMax = await window.senku.isMaximized();
    const winMaxBtn = document.getElementById('win-max');
    if (winMaxBtn) winMaxBtn.textContent = isMax ? '❐' : '□';
    const app = document.getElementById('app');
    if (isMax) app?.classList.add('maximized');

    updateSpaceTabs();
    updateSpaceHeader();
    updateNoteSlotTabs();
    updateFocusUI();
    updateLogsStream();

    await loadNoteForActiveSlot();
    startTimerLoop();
  } catch (err) {
    console.error('[senku] Failed to initialize:', err);
  }
}

init();
