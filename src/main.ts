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
    spaceId: null,
    goal: '',
    startedAt: null,
    durationMinutes: 30,
    history: [],
  },
  settings: { userName: 'Vivek' },
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
let saveNoteTimeout: any = null;
let timerInterval: any = null;
let targetSpaceForAction: Workspace | null = null;

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

async function flushSaveNote() {
  if (isViewingLogsInCanvas) return;
  if (saveNoteTimeout) {
    clearTimeout(saveNoteTimeout);
    saveNoteTimeout = null;
  }
  const path = getSlotPath(activeSlot);
  await window.senku.writeNote(path, activeNoteContent);
}

function scheduleSaveNote() {
  if (isViewingLogsInCanvas) return;
  if (saveNoteTimeout) clearTimeout(saveNoteTimeout);
  saveNoteTimeout = setTimeout(flushSaveNote, 400);
}

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
        <button class="btn-add-space" id="btn-add-space" title="Create Space (+)">+</button>
        <button class="btn-all-spaces" id="btn-all-spaces" title="All Workspaces Manager">🗂️ Spaces</button>
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
          <!-- Compact Path & Action Strip -->
          <div class="space-action-strip">
            <div class="path-display" id="space-path-click" title="Click to open folder in File Explorer">
              <span class="path-icon">📁</span>
              <span id="space-path-text" class="path-text">...</span>
            </div>
            <div class="space-header-actions">
              <button class="space-header-btn" id="btn-rename-active-space" title="Rename space">✎ Rename</button>
              <button class="space-header-btn" id="btn-change-folder" title="Change folder path">📁 Path</button>
              <button class="space-header-btn danger" id="btn-del-space" title="Delete space">Delete</button>
            </div>
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
              <button class="btn-secondary btn-icon" id="btn-open-note-code" title="Open active note in VS Code">&lt; &gt;</button>
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
            <span class="section-label">Global logs.md</span>
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

    <!-- All Spaces Manager Modal -->
    <div class="modal-backdrop" id="spaces-modal" style="display: none;">
      <div class="modal-card">
        <div class="modal-header">
          <div class="modal-title">
            <span>🗂️</span>
            <h3>All Workspaces</h3>
          </div>
          <div class="modal-header-actions">
            <button class="btn-primary" id="btn-modal-new-space">+ New Space</button>
            <button class="modal-close-btn" id="btn-close-spaces-modal">✕</button>
          </div>
        </div>
        <div class="modal-search-row">
          <input class="modal-search-input" id="spaces-search-input" placeholder="Search spaces by name or path..." />
        </div>
        <div class="modal-body-spaces" id="all-spaces-list"></div>
      </div>
    </div>

    <!-- Delete Confirmation Modal -->
    <div class="modal-backdrop" id="delete-space-modal" style="display: none;">
      <div class="modal-card delete-card">
        <div class="modal-header">
          <div class="modal-title">
            <span style="color: #ef4444;">⚠️</span>
            <h3>Delete Space</h3>
          </div>
          <button class="modal-close-btn" id="btn-close-del-modal">✕</button>
        </div>
        <p class="modal-delete-desc">Are you sure you want to delete workspace <strong id="delete-space-name-label"></strong>?</p>
        <label class="modal-checkbox-row">
          <input type="checkbox" id="delete-notes-checkbox" checked />
          <span>Also permanently delete notes in <code>Documents/Senku Notes/spaces/...</code></span>
        </label>
        <div class="modal-footer-actions">
          <button class="btn-secondary" id="btn-cancel-del-space">Cancel</button>
          <button class="btn-danger" id="btn-confirm-del-space">Delete Workspace</button>
        </div>
      </div>
    </div>

    <!-- Rename Space Modal -->
    <div class="modal-backdrop" id="rename-space-modal" style="display: none;">
      <div class="modal-card rename-card">
        <div class="modal-header">
          <div class="modal-title">
            <span>✎</span>
            <h3>Rename Workspace</h3>
          </div>
          <button class="modal-close-btn" id="btn-close-rename-modal">✕</button>
        </div>
        <p class="modal-desc">All existing notes in Documents will be automatically renamed to preserve your data.</p>
        <input class="modal-input" id="rename-space-input" placeholder="New Space Name" />
        <div class="modal-footer-actions">
          <button class="btn-secondary" id="btn-cancel-rename-space">Cancel</button>
          <button class="btn-primary" id="btn-confirm-rename-space">Save Name</button>
        </div>
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

  if (!state.settings) state.settings = { userName: '' };
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
}

function updateSpaceHeader() {
  const activeSpace = getActiveSpace();
  const pathText = document.getElementById('space-path-text');
  if (activeSpace && pathText) {
    pathText.textContent = activeSpace.path;
  }
}

// ---------------------------------------------------------------------------
// Space Modals & Management Helpers
// ---------------------------------------------------------------------------

async function handleAddNewSpace() {
  const folder = await window.senku.pickFolder();
  if (!folder) return;
  const name = folder.split(/[\\/]/).filter(Boolean).pop() || 'New Space';
  const newSpace: Workspace = {
    id: crypto.randomUUID(),
    name,
    path: folder,
    objective: '',
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
  closeAllSpacesModal();
}

async function openSpaceInWorkspace(spaceId: string) {
  if (!state.settings.openSpaceIds) state.settings.openSpaceIds = [];
  if (!state.settings.openSpaceIds.includes(spaceId)) {
    state.settings.openSpaceIds.push(spaceId);
  }
  await flushSaveNote();
  state.activeSpaceId = spaceId;
  await saveCurrentState();
  updateSpaceTabs();
  updateSpaceHeader();
  await loadNoteForActiveSlot();
}

function openAllSpacesModal() {
  const modal = document.getElementById('spaces-modal');
  const searchInput = document.getElementById('spaces-search-input') as HTMLInputElement | null;
  if (modal) {
    modal.style.display = 'flex';
    if (searchInput) {
      searchInput.value = '';
      searchInput.focus();
    }
    renderAllSpacesList();
  }
}

function closeAllSpacesModal() {
  const modal = document.getElementById('spaces-modal');
  if (modal) modal.style.display = 'none';
}

function renderAllSpacesList(filterText = '') {
  const container = document.getElementById('all-spaces-list');
  if (!container) return;

  const query = filterText.toLowerCase().trim();
  const filtered = state.spaces.filter(
    (s) => s.name.toLowerCase().includes(query) || s.path.toLowerCase().includes(query),
  );

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 30px 0; font-size: 13px;">No workspaces found.</div>`;
    return;
  }

  const openIds = new Set(state.settings.openSpaceIds || []);

  container.innerHTML = filtered
    .map((s) => {
      const isOpen = openIds.has(s.id);
      const isActive = s.id === state.activeSpaceId;
      return `
        <div class="space-list-item ${isActive ? 'active-item' : ''}" data-space-id="${s.id}">
          <div class="space-item-info">
            <div class="space-item-name-row">
              <span class="space-item-name">${s.name}</span>
              ${isOpen ? '<span class="space-status-badge">Open in Tabs</span>' : ''}
              ${isActive ? '<span class="space-status-badge active-badge">Current</span>' : ''}
            </div>
            <div class="space-item-path" title="${s.path}">📁 ${s.path}</div>
          </div>
          <div class="space-item-actions">
            <button class="space-btn-action" data-action="open" data-space-id="${s.id}" title="Open space">Open</button>
            <button class="space-btn-action" data-action="rename" data-space-id="${s.id}" title="Rename space">✎</button>
            <button class="space-btn-action danger" data-action="delete" data-space-id="${s.id}" title="Delete space">🗑️</button>
          </div>
        </div>
      `;
    })
    .join('');

  container.querySelectorAll('.space-btn-action').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.getAttribute('data-action');
      const spaceId = btn.getAttribute('data-space-id');
      const space = state.spaces.find((s) => s.id === spaceId);
      if (!space) return;

      if (action === 'open') {
        await openSpaceInWorkspace(space.id);
        closeAllSpacesModal();
      } else if (action === 'rename') {
        openRenameModal(space);
      } else if (action === 'delete') {
        openDeleteModal(space);
      }
    });
  });

  container.querySelectorAll('.space-list-item').forEach((item) => {
    item.addEventListener('click', async () => {
      const spaceId = item.getAttribute('data-space-id');
      if (spaceId) {
        await openSpaceInWorkspace(spaceId);
        closeAllSpacesModal();
      }
    });
  });
}

function openRenameModal(space: Workspace) {
  targetSpaceForAction = space;
  const modal = document.getElementById('rename-space-modal');
  const input = document.getElementById('rename-space-input') as HTMLInputElement | null;
  if (modal && input) {
    input.value = space.name;
    modal.style.display = 'flex';
    input.focus();
    input.select();
  }
}

function closeRenameModal() {
  const modal = document.getElementById('rename-space-modal');
  if (modal) modal.style.display = 'none';
  targetSpaceForAction = null;
}

async function handleRenameConfirm() {
  if (!targetSpaceForAction) return;
  const input = document.getElementById('rename-space-input') as HTMLInputElement | null;
  const newName = input?.value.trim();
  if (!newName || newName === targetSpaceForAction.name) {
    closeRenameModal();
    return;
  }

  const oldName = targetSpaceForAction.name;
  // 1. Rename folder on disk in Documents/Senku Notes/spaces/<oldName> -> <newName>
  await window.senku.renameSpaceNotesDir(oldName, newName);

  // 2. Update memory & state
  targetSpaceForAction.name = newName;
  await saveCurrentState();

  closeRenameModal();
  updateSpaceTabs();
  updateSpaceHeader();
  renderAllSpacesList((document.getElementById('spaces-search-input') as HTMLInputElement)?.value || '');
  await loadNoteForActiveSlot();
}

function openDeleteModal(space: Workspace) {
  targetSpaceForAction = space;
  const modal = document.getElementById('delete-space-modal');
  const nameLabel = document.getElementById('delete-space-name-label');
  if (modal && nameLabel) {
    nameLabel.textContent = `"${space.name}"`;
    modal.style.display = 'flex';
  }
}

function closeDeleteModal() {
  const modal = document.getElementById('delete-space-modal');
  if (modal) modal.style.display = 'none';
  targetSpaceForAction = null;
}

async function handleDeleteConfirm() {
  if (!targetSpaceForAction) return;
  const targetId = targetSpaceForAction.id;
  const targetName = targetSpaceForAction.name;
  const deleteNotes = (document.getElementById('delete-notes-checkbox') as HTMLInputElement)?.checked ?? true;

  // 1. Optionally delete notes on disk
  if (deleteNotes) {
    await window.senku.deleteSpaceNotesDir(targetName);
  }

  // 2. Remove space from state
  state.spaces = state.spaces.filter((s) => s.id !== targetId);
  if (state.settings.openSpaceIds) {
    state.settings.openSpaceIds = state.settings.openSpaceIds.filter((id) => id !== targetId);
  }

  // 3. Ensure at least one space exists
  if (state.spaces.length === 0) {
    const defaultSpace: Workspace = {
      id: crypto.randomUUID(),
      name: 'General',
      path: appPaths.home || appPaths.documents,
      objective: '',
      createdAt: Date.now(),
    };
    state.spaces.push(defaultSpace);
    state.settings.openSpaceIds = [defaultSpace.id];
    state.activeSpaceId = defaultSpace.id;
  } else if (state.activeSpaceId === targetId) {
    state.activeSpaceId = state.settings.openSpaceIds?.[0] || state.spaces[0].id;
  }

  await saveCurrentState();
  closeDeleteModal();
  updateSpaceTabs();
  updateSpaceHeader();
  renderAllSpacesList((document.getElementById('spaces-search-input') as HTMLInputElement)?.value || '');
  await loadNoteForActiveSlot();
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
        cb.addEventListener('change', (e) => {
          const input = e.target as HTMLInputElement;
          const idx = Number(input.getAttribute('data-task-idx'));
          if (!isNaN(idx)) {
            toggleTaskInMemory(idx, input.checked);
            scheduleSaveNote();
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
        // Line format: - 21.30 Text or legacy - 16:45 [Space] Text
        const match = line.match(/^-\s+(\d{1,2}[.:]\d{2}(?:\s*[aApP][mM])?)\s+(?:\[.*?\]\s+)?(.*)$/);
        if (match) {
          const time = match[1];
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
    if (target.closest('.window-btn') || target.closest('.space-tab') || target.closest('.btn-add-space') || target.closest('.btn-all-spaces')) return;
    await window.senku.toggleMaximize();
    await updateMaximizeUI();
  });

  // Theme Toggle: Dark vs Light (OG Warm Paper)
  const applyTheme = (theme: 'dark' | 'light') => {
    document.documentElement.setAttribute('data-theme', theme);
    const themeBtn = document.getElementById('btn-theme-toggle');
    if (themeBtn) {
      themeBtn.textContent = theme === 'light' ? '🌙' : '☀️';
      themeBtn.title = theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode (OG Paper)';
    }
  };

  document.getElementById('btn-theme-toggle')?.addEventListener('click', async () => {
    const current = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') || 'dark';
    const nextTheme: 'dark' | 'light' = current === 'light' ? 'dark' : 'light';
    applyTheme(nextTheme);
    state.settings.theme = nextTheme;
    await saveCurrentState();
  });

  // Test Bell Chime
  document.getElementById('btn-test-chime')?.addEventListener('click', () => {
    playChime();
  });

  // Space Management Actions
  document.getElementById('btn-add-space')?.addEventListener('click', handleAddNewSpace);
  document.getElementById('btn-modal-new-space')?.addEventListener('click', handleAddNewSpace);

  document.getElementById('btn-all-spaces')?.addEventListener('click', openAllSpacesModal);
  document.getElementById('btn-close-spaces-modal')?.addEventListener('click', closeAllSpacesModal);

  const spacesSearch = document.getElementById('spaces-search-input') as HTMLInputElement | null;
  spacesSearch?.addEventListener('input', () => {
    renderAllSpacesList(spacesSearch.value);
  });

  // Rename Space (from Header and Modal)
  document.getElementById('btn-rename-active-space')?.addEventListener('click', () => {
    const activeSpace = getActiveSpace();
    if (activeSpace) openRenameModal(activeSpace);
  });
  document.getElementById('btn-close-rename-modal')?.addEventListener('click', closeRenameModal);
  document.getElementById('btn-cancel-rename-space')?.addEventListener('click', closeRenameModal);
  document.getElementById('btn-confirm-rename-space')?.addEventListener('click', handleRenameConfirm);
  document.getElementById('rename-space-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleRenameConfirm();
    if (e.key === 'Escape') closeRenameModal();
  });

  // Delete Space (from Header and Modal)
  document.getElementById('btn-del-space')?.addEventListener('click', () => {
    const activeSpace = getActiveSpace();
    if (activeSpace) openDeleteModal(activeSpace);
  });
  document.getElementById('btn-close-del-modal')?.addEventListener('click', closeDeleteModal);
  document.getElementById('btn-cancel-del-space')?.addEventListener('click', closeDeleteModal);
  document.getElementById('btn-confirm-del-space')?.addEventListener('click', handleDeleteConfirm);

  // Close modals on Escape key or backdrop click
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeAllSpacesModal();
      closeRenameModal();
      closeDeleteModal();
    }
  });

  document.querySelectorAll('.modal-backdrop').forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeAllSpacesModal();
        closeRenameModal();
        closeDeleteModal();
      }
    });
  });

  // Change Space Folder
  document.getElementById('btn-change-folder')?.addEventListener('click', async () => {
    const activeSpace = getActiveSpace();
    if (!activeSpace) return;
    const folder = await window.senku.pickFolder();
    if (folder) {
      activeSpace.path = folder;
      await saveCurrentState();
      updateSpaceHeader();
      await loadNoteForActiveSlot();
    }
  });

  // Open Space Folder in File Explorer
  document.getElementById('space-path-click')?.addEventListener('click', () => {
    const activeSpace = getActiveSpace();
    if (activeSpace) window.senku.openFolder(activeSpace.path);
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
  document.getElementById('toggle-note-mode')?.addEventListener('click', () => {
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
      scheduleSaveNote();
    });

    noteArea.addEventListener('blur', () => {
      flushSaveNote();
    });

    window.addEventListener('blur', () => {
      flushSaveNote();
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
        scheduleSaveNote();
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
            scheduleSaveNote();
            return;
          }
          e.preventDefault();
          const insert = `\n${taskMatch[1].replace(/\[[xX]\]/, '[ ]')}`;
          noteArea.value = noteArea.value.substring(0, cursor) + insert + noteArea.value.substring(cursor);
          noteArea.selectionStart = noteArea.selectionEnd = cursor + insert.length;
          activeNoteContent = noteArea.value;
          scheduleSaveNote();
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
            scheduleSaveNote();
            return;
          }
          e.preventDefault();
          const insert = `\n${bulletMatch[1]}`;
          noteArea.value = noteArea.value.substring(0, cursor) + insert + noteArea.value.substring(cursor);
          noteArea.selectionStart = noteArea.selectionEnd = cursor + insert.length;
          activeNoteContent = noteArea.value;
          scheduleSaveNote();
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
    const activeSpace = getActiveSpace();
    const goalInput = document.getElementById('focus-goal-input') as HTMLInputElement | null;
    const mode = state.focus.mode || 'work';

    if (!state.focus?.active) {
      const typedGoal = goalInput?.value.trim() || '';
      state.focus = {
        mode,
        active: true,
        paused: false,
        remainingSeconds: (state.focus?.durationMinutes || 30) * 60,
        spaceId: activeSpace?.id || null,
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
  const target = e.target as HTMLElement;
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

  if (!isInput) {
    // 1-9 switch spaces (ONLY affects Left Hemisphere)
    if (e.key >= '1' && e.key <= '9') {
      const index = parseInt(e.key, 10) - 1;
      if (state.spaces[index] && state.spaces[index].id !== state.activeSpaceId) {
        state.activeSpaceId = state.spaces[index].id;
        saveCurrentState();
        updateSpaceTabs();
        updateSpaceHeader();
        loadNoteForActiveSlot();
      }
    }
  }

  // Ctrl+Enter toggles preview anywhere
  if (e.ctrlKey && e.key === 'Enter') {
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

      updateFocusUI();

      if (remaining === 0) {
        // Complete focus session!
        const durationMins = state.focus.durationMinutes || 30;
        const mode = state.focus.mode || 'work';
        const rawGoal = (state.focus.goal || '').trim();
        const activeSpace = getActiveSpace();

        const newRecord: FocusRecord = {
          id: crypto.randomUUID(),
          type: mode,
          spaceId: mode === 'work' ? activeSpace?.id || null : null,
          spaceName: mode === 'work' ? activeSpace?.name || 'General' : 'Break',
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
