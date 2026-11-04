import { marked } from 'marked';
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
let deleteConfirmTimeout: any = null;
let isDeletePending = false;

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
> Temporary thinking canvas. Dump logs, test commands, or WIP snippets. Hit [Clear] anytime to wipe.

`,

  links: (name) => `# ${name} — Pinned Links & Docs
> Click any link in Preview mode to open it in your browser.

- [GitHub Repository](https://github.com)
- [Documentation](https://developer.mozilla.org)
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
  const space = getActiveSpace();
  if (slot === 'global') {
    const base = appPaths.documents || appPaths.userData;
    return `${base}\\Senku Notes\\senku-global.md`;
  }
  if (!space) {
    return `${appPaths.userData}\\senku-fallback.md`;
  }
  switch (slot) {
    case 'main':
      return `${space.path}\\senku.md`;
    case 'tasks':
      return `${space.path}\\tasks.md`;
    case 'scratch':
      return `${space.path}\\scratch.md`;
    case 'links':
      return `${space.path}\\links.md`;
    default:
      return `${space.path}\\senku.md`;
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

// Gentle Web Audio API Chime on Timer Complete
function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.25); // A5
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.9);
    osc.start();
    osc.stop(ctx.currentTime + 0.9);
  } catch {}
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

function scheduleSaveNote() {
  if (isViewingLogsInCanvas) return;
  const path = getSlotPath(activeSlot);
  if (saveNoteTimeout) clearTimeout(saveNoteTimeout);
  saveNoteTimeout = setTimeout(async () => {
    await window.senku.writeNote(path, activeNoteContent);
  }, 400);
}

async function switchSlot(newSlot: NoteSlot) {
  if (saveNoteTimeout) {
    clearTimeout(saveNoteTimeout);
    await window.senku.writeNote(getSlotPath(activeSlot), activeNoteContent);
  }
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
          <img src="./assets/senku.ico" class="brand-icon" alt="Senku" />
          <span>SENKU</span>
        </div>
        <div class="space-tabs" id="space-tabs-container"></div>
        <button class="btn-add-space" id="btn-add-space" title="Add Space (+)">+</button>
      </div>

      <div class="titlebar-right">
        <button class="window-btn" id="win-min" title="Minimize">—</button>
        <button class="window-btn close" id="win-close" title="Close">✕</button>
      </div>
    </header>

    <!-- Main Content Split: Left (Space Context) / Right (Global Engine) -->
    <main class="main-view">
      <!-- LEFT HEMISPHERE: Local Space Context -->
      <section class="cockpit-panel" id="cockpit-panel">
        <div class="space-header">
          <div class="space-title-row">
            <input class="space-name-input" id="space-name-input" placeholder="Space Name" />
            <div class="space-actions-meta">
              <button class="btn-secondary" id="btn-change-folder" title="Change folder path">Change Folder</button>
              <button class="btn-danger" id="btn-del-space" title="Delete space">Delete</button>
            </div>
          </div>

          <!-- Compact Action & Path Strip -->
          <div class="space-action-strip">
            <div class="path-display" id="space-path-click" title="Click to open folder in Explorer">
              📁 <span id="space-path-text">...</span>
            </div>
            <div class="quick-launch-group">
              <button class="action-pill code" id="btn-launch-code" title="Launch VS Code">
                💻 VS Code
              </button>
              <button class="action-pill terminal" id="btn-launch-terminal" title="Launch Terminal">
                ⌨️ Terminal
              </button>
              <button class="action-pill folder" id="btn-launch-explorer" title="Open in Explorer">
                📂 Explorer
              </button>
            </div>
          </div>
        </div>

        <!-- Objective Strip -->
        <div class="objective-strip">
          <span class="objective-label">Active Target</span>
          <input class="objective-input" id="space-objective-input" placeholder="What single problem are you solving here today?" />
        </div>

        <!-- Full-Height 5-Slot Note Workbench Canvas -->
        <div class="note-section">
          <div class="note-header-bar">
            <div class="note-slot-tabs" id="note-slot-tabs">
              <button class="slot-tab" data-slot="global">🌐 Global</button>
              <button class="slot-tab" data-slot="main">📝 Main</button>
              <button class="slot-tab" data-slot="tasks">🎯 Tasks</button>
              <button class="slot-tab" data-slot="scratch">💡 Scratch</button>
              <button class="slot-tab" data-slot="links">📌 Links</button>
            </div>
            <div class="note-actions">
              <button class="btn-secondary" id="btn-clear-slot" title="Clear this slot">Clear</button>
              <button class="btn-secondary" id="btn-open-note-code" title="Open active note in VS Code">
                💻 VS Code
              </button>
              <button class="btn-secondary" id="toggle-note-mode">
                Preview (Ctrl+Enter)
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
              <span class="metric-label work">🔥 Work</span>
              <span class="metric-value" id="today-work-value">0m</span>
            </div>
            <div class="metric-group">
              <span class="metric-label rest">☕ Rest</span>
              <span class="metric-value" id="today-rest-value">0m</span>
            </div>
          </div>
          <span class="focus-hero-badge" id="today-sessions-count">0 sessions</span>
        </div>

        <!-- Focus Session Box -->
        <div class="focus-box" id="focus-box">
          <!-- Mode Toggle: Work vs Rest -->
          <div class="mode-toggle-group">
            <button class="mode-btn active work" id="btn-mode-work">🎯 Work Mode</button>
            <button class="mode-btn rest" id="btn-mode-rest">☕ Rest Mode</button>
          </div>

          <div class="focus-timer-text" id="focus-display">30:00</div>
          <div class="focus-progress-track">
            <div class="focus-progress-fill" id="focus-progress-bar"></div>
          </div>

          <input class="input-pill" id="focus-goal-input" placeholder="What are you working on?" />

          <!-- Presets: 15m, 30m, 45m, Custom -->
          <div class="focus-presets">
            <button class="preset-btn" data-mins="15">15m</button>
            <button class="preset-btn active" data-mins="30">30m</button>
            <button class="preset-btn" data-mins="45">45m</button>
            <button class="preset-btn" id="btn-preset-custom">Custom</button>
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
              <button class="btn-secondary" id="btn-view-logs-md" title="View logs.md in Senku viewer">View in Senku</button>
              <button class="btn-secondary" id="btn-open-logs-code" title="Open logs.md in VS Code">💻 VS Code</button>
            </div>
          </div>

          <input class="quick-log-input" id="quick-log-input" placeholder="Log completed work & hit Enter..." />

          <!-- Lazy-loaded stream of recent logs -->
          <div class="logs-stream-list" id="logs-stream-container"></div>
        </div>
      </aside>
    </main>
  `;

  bindPersistentEvents();
}

// ---------------------------------------------------------------------------
// Granular Targeted DOM Updaters (NO FULL PAGE REFRESH)
// ---------------------------------------------------------------------------

function updateSpaceTabs() {
  const container = document.getElementById('space-tabs-container');
  if (!container) return;

  const activeSpace = getActiveSpace();
  container.innerHTML = state.spaces
    .map(
      (s) => `
    <div class="space-tab ${s.id === activeSpace?.id ? 'active' : ''}" data-space-id="${s.id}">
      ${s.name}
    </div>
  `,
    )
    .join('');

  container.querySelectorAll('.space-tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      const spaceId = tab.getAttribute('data-space-id');
      if (spaceId && spaceId !== state.activeSpaceId) {
        state.activeSpaceId = spaceId;
        await saveCurrentState();
        updateSpaceTabs();
        updateSpaceHeader();
        await loadNoteForActiveSlot();
      }
    });
  });
}

function updateSpaceHeader() {
  const activeSpace = getActiveSpace();
  const nameInput = document.getElementById('space-name-input') as HTMLInputElement | null;
  const pathText = document.getElementById('space-path-text');
  const objInput = document.getElementById('space-objective-input') as HTMLInputElement | null;

  if (activeSpace) {
    if (nameInput) nameInput.value = activeSpace.name;
    if (pathText) pathText.textContent = activeSpace.path;
    if (objInput) objInput.value = activeSpace.objective || '';
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
    toggleBtn.textContent = isNotePreview ? 'Edit (Ctrl+Enter)' : 'Preview (Ctrl+Enter)';
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

  if (display) display.textContent = formatDuration(remaining);
  if (bar) bar.style.width = `${progressPct}%`;

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

    // Latest 30 entries (lazy slice)
    const recent = lines.slice(-30).reverse();

    container.innerHTML = recent
      .map((line) => {
        // Line format: - 16:45 [Space] Text
        const match = line.match(/^-\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(?:\[(.*?)\]\s+)?(.*)$/);
        if (match) {
          const time = match[1];
          const tag = match[2] || '';
          const text = match[3];
          return `
            <div class="log-stream-entry">
              <span class="log-stream-time">${time}</span>
              ${tag ? `<span class="log-stream-tag">${tag}</span>` : ''}
              <span class="log-stream-text">${text}</span>
            </div>
          `;
        }
        return `
          <div class="log-stream-entry">
            <span class="log-stream-text">${line.replace(/^-\s*/, '')}</span>
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

  // Add Space
  document.getElementById('btn-add-space')?.addEventListener('click', async () => {
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
    state.activeSpaceId = newSpace.id;
    await saveCurrentState();
    updateSpaceTabs();
    updateSpaceHeader();
    await loadNoteForActiveSlot();
  });

  // Space Name Inline Edit
  const nameInput = document.getElementById('space-name-input') as HTMLInputElement | null;
  nameInput?.addEventListener('change', async () => {
    const activeSpace = getActiveSpace();
    if (activeSpace && nameInput.value.trim()) {
      activeSpace.name = nameInput.value.trim();
      await saveCurrentState();
      updateSpaceTabs();
    }
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

  // Safe 2-Step Space Delete
  const delBtn = document.getElementById('btn-del-space');
  delBtn?.addEventListener('click', async () => {
    const activeSpace = getActiveSpace();
    if (!activeSpace) return;

    if (!isDeletePending) {
      isDeletePending = true;
      delBtn.textContent = 'Confirm Delete?';
      delBtn.classList.add('btn-confirm-delete');
      if (deleteConfirmTimeout) clearTimeout(deleteConfirmTimeout);
      deleteConfirmTimeout = setTimeout(() => {
        isDeletePending = false;
        delBtn.textContent = 'Delete';
        delBtn.classList.remove('btn-confirm-delete');
      }, 3000);
    } else {
      clearTimeout(deleteConfirmTimeout);
      isDeletePending = false;
      delBtn.textContent = 'Delete';
      delBtn.classList.remove('btn-confirm-delete');

      state.spaces = state.spaces.filter((s) => s.id !== activeSpace.id);
      state.activeSpaceId = state.spaces[0]?.id || null;
      await saveCurrentState();
      updateSpaceTabs();
      updateSpaceHeader();
      await loadNoteForActiveSlot();
    }
  });

  // Launchpad Buttons
  document.getElementById('btn-launch-code')?.addEventListener('click', () => {
    const activeSpace = getActiveSpace();
    if (activeSpace) window.senku.openCode(activeSpace.path);
  });
  document.getElementById('btn-launch-terminal')?.addEventListener('click', () => {
    const activeSpace = getActiveSpace();
    if (activeSpace) window.senku.openTerminal(activeSpace.path);
  });
  document.getElementById('btn-launch-explorer')?.addEventListener('click', () => {
    const activeSpace = getActiveSpace();
    if (activeSpace) window.senku.openFolder(activeSpace.path);
  });
  document.getElementById('space-path-click')?.addEventListener('click', () => {
    const activeSpace = getActiveSpace();
    if (activeSpace) window.senku.openFolder(activeSpace.path);
  });

  // Objective Change
  const objInput = document.getElementById('space-objective-input') as HTMLInputElement | null;
  objInput?.addEventListener('change', async () => {
    const activeSpace = getActiveSpace();
    if (activeSpace) {
      activeSpace.objective = objInput.value.trim();
      await saveCurrentState();
    }
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

  // Clear Slot
  document.getElementById('btn-clear-slot')?.addEventListener('click', async () => {
    if (isViewingLogsInCanvas) return;
    activeNoteContent = '';
    const path = getSlotPath(activeSlot);
    await window.senku.writeNote(path, '');
    updateNoteCanvas();
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
      const activeSpace = getActiveSpace();
      const text = quickLog.value.trim();
      await window.senku.appendLog(text, activeSpace?.name);
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
      state.focus = {
        mode,
        active: true,
        paused: false,
        remainingSeconds: (state.focus?.durationMinutes || 30) * 60,
        spaceId: activeSpace?.id || null,
        goal: goalInput?.value.trim() || (mode === 'work' ? activeSpace?.objective || 'Deep Focus' : 'Recharge Break'),
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

  // Custom Preset (Prompt)
  document.getElementById('btn-preset-custom')?.addEventListener('click', async () => {
    const input = prompt('Enter custom minutes (e.g. 20, 50, 90):', '20');
    const mins = parseInt(input || '', 10);
    if (!isNaN(mins) && mins > 0) {
      document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      document.getElementById('btn-preset-custom')?.classList.add('active');
      state.focus.durationMinutes = mins;
      state.focus.remainingSeconds = mins * 60;
      if (!state.focus.active) {
        state.focus.startedAt = null;
      }
      await saveCurrentState();
      updateFocusUI();
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
        const goal = state.focus.goal || (mode === 'work' ? 'Deep Work' : 'Rest Break');
        const activeSpace = getActiveSpace();

        const newRecord: FocusRecord = {
          id: crypto.randomUUID(),
          type: mode,
          spaceId: mode === 'work' ? activeSpace?.id || null : null,
          spaceName: mode === 'work' ? activeSpace?.name || 'General' : 'Break',
          goal,
          durationMinutes: durationMins,
          completedAt: Date.now(),
        };

        if (!state.focus.history) state.focus.history = [];
        state.focus.history.push(newRecord);

        // Append to Documents/Senku Notes/logs.md
        const logMsg = mode === 'work'
          ? `(Work ${durationMins}m) ${goal}`
          : `(Rest ${durationMins}m) Recharged`;
        await window.senku.appendLog(logMsg, mode === 'work' ? activeSpace?.name : undefined);

        playChime();

        // Switch to the other mode seamlessly!
        if (mode === 'work') {
          state.focus.mode = 'rest';
          state.focus.active = false;
          state.focus.paused = false;
          state.focus.durationMinutes = 5;
          state.focus.remainingSeconds = 5 * 60;
          state.focus.startedAt = null;
        } else {
          state.focus.mode = 'work';
          state.focus.active = false;
          state.focus.paused = false;
          state.focus.durationMinutes = 30;
          state.focus.remainingSeconds = 30 * 60;
          state.focus.startedAt = null;
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
