import { marked } from 'marked';
import type { SenkuState, Workspace, FocusBlock } from '../electron/types';

type NoteSlot = 'global' | 'main' | 'tasks' | 'scratch' | 'links';

let state: SenkuState = {
  version: 4,
  activeSpaceId: null,
  spaces: [],
  focus: {
    active: false,
    paused: false,
    remainingSeconds: 25 * 60,
    spaceId: null,
    goal: '',
    startedAt: null,
    durationMinutes: 25,
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
- [ ] Review sprint targets
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

function formatTime(timestamp: number): string {
  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Calculate Today's Focus Stats
function getTodayFocusStats(): { totalHoursText: string; count: number; todayBlocks: FocusBlock[] } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const history = state.focus?.history || [];
  const todayBlocks = history.filter((b) => b.completedAt >= startOfDay);
  const totalMinutes = todayBlocks.reduce((acc, b) => acc + (b.durationMinutes || 0), 0);

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const totalHoursText = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;

  return { totalHoursText, count: todayBlocks.length, todayBlocks };
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
// Markdown Parsing & Silent Interactive Tasks
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
  const path = getSlotPath(activeSlot);
  try {
    let content = await window.senku.readNote(path);
    if (!content.trim()) {
      // Seed with starter template
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
        <span class="brand">⚡ SENKU</span>
        <div class="space-tabs" id="space-tabs-container"></div>
        <button class="btn-add-space" id="btn-add-space" title="Add Space (+)">+</button>
      </div>

      <div class="titlebar-right">
        <button class="window-btn" id="win-min" title="Minimize">—</button>
        <button class="window-btn close" id="win-close" title="Close">✕</button>
      </div>
    </header>

    <!-- Main Content Split -->
    <main class="main-view">
      <!-- Cockpit Panel (Left) -->
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

      <!-- Right Panel: Focus Momentum Engine -->
      <aside class="focus-panel">
        <!-- Hero Today Summary -->
        <div class="focus-hero-card">
          <div class="focus-hero-left">
            <span class="focus-hero-label">🔥 Today's Focus</span>
            <span class="focus-hero-value" id="today-focus-value">0m</span>
          </div>
          <span class="focus-hero-badge" id="today-sessions-count">0 sessions</span>
        </div>

        <!-- Focus Timer Box -->
        <div class="focus-box" id="focus-box">
          <div class="focus-timer-text" id="focus-display">25:00</div>
          <div class="focus-progress-track">
            <div class="focus-progress-fill" id="focus-progress-bar"></div>
          </div>
          <input class="input-pill" id="focus-goal-input" placeholder="What are you focusing on?" />
          <div class="focus-presets">
            <button class="preset-btn" data-mins="15">15m</button>
            <button class="preset-btn active" data-mins="25">25m</button>
            <button class="preset-btn" data-mins="45">45m</button>
            <button class="preset-btn" data-mins="60">60m</button>
          </div>
          <div class="focus-controls-row">
            <button class="btn-primary" id="btn-toggle-focus">Start Focus</button>
            <button class="btn-secondary" id="btn-reset-focus" style="display: none;">Reset</button>
          </div>
        </div>

        <!-- Today's Completed Blocks Stream -->
        <div class="completed-section">
          <span class="section-label">Today's Completed Blocks</span>
          <div class="blocks-list" id="blocks-list-container"></div>
        </div>
      </aside>
    </main>
  `;

  bindPersistentEvents();
}

// ---------------------------------------------------------------------------
// Granular Targeted DOM Updaters (ZERO FULL-PAGE REFRESH)
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
    if (slot === activeSlot) {
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

      // Bind interactive tasks without full-page re-render
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

      // Hyperlinks open in browser
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
  const heroValue = document.getElementById('today-focus-value');
  const heroBadge = document.getElementById('today-sessions-count');

  // Update Hero Stats
  const stats = getTodayFocusStats();
  if (heroValue) heroValue.textContent = stats.totalHoursText;
  if (heroBadge) heroBadge.textContent = `${stats.count} sessions`;

  const totalSec = (state.focus?.durationMinutes || 25) * 60;
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
    box?.classList.add('running');
    if (resetBtn) resetBtn.style.display = 'block';
    if (goalInput) goalInput.disabled = true;

    if (state.focus.paused) {
      if (toggleBtn) toggleBtn.textContent = 'Resume';
    } else {
      if (toggleBtn) toggleBtn.textContent = 'Pause';
    }
  } else {
    box?.classList.remove('running');
    if (resetBtn) resetBtn.style.display = 'none';
    if (toggleBtn) toggleBtn.textContent = 'Start Focus';
    if (goalInput) goalInput.disabled = false;
  }

  updateCompletedBlocksStream();
}

function updateCompletedBlocksStream() {
  const container = document.getElementById('blocks-list-container');
  if (!container) return;

  const stats = getTodayFocusStats();
  if (stats.todayBlocks.length === 0) {
    container.innerHTML = `
      <div style="color: var(--text-dim); font-size: 11px; text-align: center; padding: 20px 0;">
        No focus blocks completed yet today.<br>Start a 25m session above to build momentum.
      </div>
    `;
    return;
  }

  container.innerHTML = stats.todayBlocks
    .slice()
    .reverse()
    .map(
      (b) => `
    <div class="block-entry">
      <div class="block-entry-left">
        <span class="block-duration-pill">${b.durationMinutes}m</span>
        <span class="block-goal-text" title="${b.goal}">${b.goal || 'Focus Session'}</span>
      </div>
      <div style="display: flex; align-items: center;">
        <span class="block-entry-meta">${formatTime(b.completedAt)} • ${b.spaceName}</span>
        <span class="block-del-btn" data-del-block="${b.id}" title="Remove entry">✕</span>
      </div>
    </div>
  `,
    )
    .join('');

  container.querySelectorAll('[data-del-block]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del-block');
      state.focus.history = (state.focus.history || []).filter((b) => b.id !== id);
      await saveCurrentState();
      updateFocusUI();
    });
  });
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
      if (slot && slot !== activeSlot) {
        switchSlot(slot);
      }
    });
  });

  // Clear Slot
  document.getElementById('btn-clear-slot')?.addEventListener('click', async () => {
    activeNoteContent = '';
    const path = getSlotPath(activeSlot);
    await window.senku.writeNote(path, '');
    updateNoteCanvas();
  });

  // Open note in VS Code
  document.getElementById('btn-open-note-code')?.addEventListener('click', () => {
    const notePath = getSlotPath(activeSlot);
    window.senku.openCode(notePath);
  });

  // Note Toggle Edit / Preview
  document.getElementById('toggle-note-mode')?.addEventListener('click', () => {
    isNotePreview = !isNotePreview;
    updateNoteCanvas();
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

  // Focus Timer Controls
  const toggleFocus = async () => {
    const activeSpace = getActiveSpace();
    const goalInput = document.getElementById('focus-goal-input') as HTMLInputElement | null;

    if (!state.focus?.active) {
      // Start fresh focus
      state.focus = {
        active: true,
        paused: false,
        remainingSeconds: (state.focus?.durationMinutes || 25) * 60,
        spaceId: activeSpace?.id || null,
        goal: goalInput?.value.trim() || activeSpace?.objective || 'Deep Focus',
        startedAt: Date.now(),
        durationMinutes: state.focus?.durationMinutes || 25,
        history: state.focus?.history || [],
      };
    } else if (state.focus.paused) {
      // Resume
      state.focus.paused = false;
      state.focus.startedAt = Date.now() - (((state.focus.durationMinutes || 25) * 60 - (state.focus.remainingSeconds || 0)) * 1000);
    } else {
      // Pause
      state.focus.paused = true;
    }
    await saveCurrentState();
    updateFocusUI();
  };

  document.getElementById('btn-toggle-focus')?.addEventListener('click', toggleFocus);

  // Reset Focus
  document.getElementById('btn-reset-focus')?.addEventListener('click', async () => {
    state.focus.active = false;
    state.focus.paused = false;
    state.focus.startedAt = null;
    state.focus.remainingSeconds = (state.focus?.durationMinutes || 25) * 60;
    await saveCurrentState();
    updateFocusUI();
  });

  // Focus presets (15m, 25m, 45m, 60m)
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const mins = Number(btn.getAttribute('data-mins')) || 25;
      state.focus.durationMinutes = mins;
      state.focus.remainingSeconds = mins * 60;
      if (!state.focus.active) {
        state.focus.startedAt = null;
      }
      await saveCurrentState();
      updateFocusUI();
    });
  });
}

// ---------------------------------------------------------------------------
// Global Keyboard Shortcuts
// ---------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  const target = e.target as HTMLElement;
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';

  if (!isInput) {
    // 1-9 switch spaces
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
  timerInterval = setInterval(() => {
    if (state.focus?.active && !state.focus?.paused && state.focus?.startedAt) {
      const totalSec = (state.focus.durationMinutes || 25) * 60;
      const elapsed = Math.floor((Date.now() - state.focus.startedAt) / 1000);
      const remaining = Math.max(0, totalSec - elapsed);
      state.focus.remainingSeconds = remaining;

      updateFocusUI();

      if (remaining === 0) {
        // Complete focus session!
        const durationMins = state.focus.durationMinutes || 25;
        const goal = state.focus.goal || 'Deep Focus';
        const activeSpace = getActiveSpace();

        state.focus.active = false;
        state.focus.paused = false;
        state.focus.startedAt = null;
        state.focus.remainingSeconds = totalSec;

        const newBlock: FocusBlock = {
          id: crypto.randomUUID(),
          spaceId: state.focus.spaceId,
          spaceName: activeSpace?.name || 'General',
          goal,
          durationMinutes: durationMins,
          completedAt: Date.now(),
        };

        if (!state.focus.history) state.focus.history = [];
        state.focus.history.push(newBlock);

        playChime();
        saveCurrentState();
        updateFocusUI();
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

    await loadNoteForActiveSlot();
    startTimerLoop();
  } catch (err) {
    console.error('[senku] Failed to initialize:', err);
  }
}

init();
