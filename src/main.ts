import { marked } from 'marked';
import type { SenkuState, Workspace, LogEntry, InboxItem } from '../electron/types';

let state: SenkuState = {
  version: 4,
  activeSpaceId: null,
  spaces: [],
  inbox: [],
  focus: {
    active: false,
    spaceId: null,
    goal: '',
    startedAt: null,
    durationMinutes: 25,
  },
  logs: [],
  settings: { userName: 'Vivek' },
};

let activeNoteContent = '';
let isNotePreview = false;
let saveNoteTimeout: any = null;
let timerInterval: any = null;

// Configure marked
marked.setOptions({
  gfm: true,
  breaks: true,
});

// Helpers
function getActiveSpace(): Workspace | null {
  if (!state.spaces || state.spaces.length === 0) return null;
  return state.spaces.find((s) => s.id === state.activeSpaceId) || state.spaces[0];
}

function getSpaceNotePath(space: Workspace): string {
  return `${space.path}\\senku.md`;
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

// ---------------------------------------------------------------------------
// Markdown Interactive Checkbox Engine
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

function toggleTaskByIndex(targetIndex: number) {
  const lines = activeNoteContent.split('\n');
  let currentIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(/^(\s*[-*]\s\[)([ xX])(\]\s.*)$/);
    if (match) {
      if (currentIdx === targetIndex) {
        const newCheck = match[2] === ' ' ? 'x' : ' ';
        lines[i] = `${match[1]}${newCheck}${match[3]}`;
        activeNoteContent = lines.join('\n');
        scheduleSaveNote();
        render();
        return;
      }
      currentIdx++;
    }
  }
}

// ---------------------------------------------------------------------------
// State Sync
// ---------------------------------------------------------------------------

async function saveCurrentState(patch?: Partial<SenkuState>) {
  if (patch) {
    state = { ...state, ...patch };
  }
  await window.senku.saveState(state);
}

async function loadNoteForActiveSpace() {
  const space = getActiveSpace();
  if (!space) {
    activeNoteContent = '';
    return;
  }
  try {
    activeNoteContent = await window.senku.readNote(getSpaceNotePath(space));
  } catch {
    activeNoteContent = '';
  }
}

function scheduleSaveNote() {
  const space = getActiveSpace();
  if (!space) return;
  if (saveNoteTimeout) clearTimeout(saveNoteTimeout);
  saveNoteTimeout = setTimeout(async () => {
    await window.senku.writeNote(getSpaceNotePath(space), activeNoteContent);
  }, 400);
}

// ---------------------------------------------------------------------------
// Render UI
// ---------------------------------------------------------------------------

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  const activeSpace = getActiveSpace();

  // Focus remaining calculation
  let focusRemainingSec = 0;
  let focusActive = state.focus?.active && state.focus?.startedAt;
  if (focusActive && state.focus.startedAt) {
    const elapsed = Math.floor((Date.now() - state.focus.startedAt) / 1000);
    const totalSec = (state.focus.durationMinutes || 25) * 60;
    focusRemainingSec = Math.max(0, totalSec - elapsed);
  }

  app.innerHTML = `
    <!-- Top Drag Bar -->
    <header class="titlebar">
      <div class="titlebar-left">
        <span class="brand">⚡ SENKU</span>
        <div class="space-tabs">
          ${state.spaces
            .map(
              (s) => `
            <div class="space-tab ${s.id === activeSpace?.id ? 'active' : ''}" data-space-id="${s.id}">
              ${s.name}
            </div>
          `,
            )
            .join('')}
          <button class="btn-add-space" id="btn-add-space" title="Add Space (+)">+</button>
        </div>
      </div>

      <div class="titlebar-center">
        <div class="focus-pill ${focusActive ? 'active' : ''}" id="toggle-focus-top">
          ${
            focusActive
              ? `⏱️ ${formatDuration(focusRemainingSec)} — ${state.focus.goal || 'Focusing'}`
              : `🎯 Start Focus`
          }
        </div>
      </div>

      <div class="titlebar-right">
        <button class="window-btn" id="win-min" title="Minimize">—</button>
        <button class="window-btn close" id="win-close" title="Close">✕</button>
      </div>
    </header>

    <!-- Main Content Split -->
    <main class="main-view">
      <!-- Cockpit Panel (Left) -->
      <section class="cockpit-panel">
        ${
          activeSpace
            ? `
          <div class="space-header">
            <div class="space-title-row">
              <input class="space-name-input" id="space-name-input" value="${activeSpace.name}" placeholder="Space Name" />
              <div class="space-actions-meta">
                <button class="btn-secondary" id="btn-change-folder" title="Change folder path">Change Folder</button>
                <button class="btn-secondary" id="btn-del-space" style="color: var(--danger)" title="Delete space">Delete</button>
              </div>
            </div>

            <!-- Compact Action & Path Strip -->
            <div class="space-action-strip">
              <div class="path-display" id="space-path-click" title="Click to open folder in Explorer">
                📁 ${activeSpace.path}
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
            <input class="objective-input" id="space-objective-input" value="${activeSpace.objective || ''}" placeholder="What single problem are you solving here today?" />
          </div>

          <!-- Links Section -->
          <div class="links-section">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span class="section-label">Pinned Links & Docs</span>
            </div>
            <div class="links-list">
              ${(activeSpace.links || [])
                .map(
                  (l) => `
                <div class="link-chip" data-url="${l.url}">
                  <span class="link-title">${l.title}</span>
                  <span class="link-chip-del" data-del-link="${l.id}">×</span>
                </div>
              `,
                )
                .join('')}
            </div>
            <form class="add-link-form" id="add-link-form">
              <input class="input-pill" id="link-title" placeholder="Title" required />
              <input class="input-pill" id="link-url" placeholder="URL or file path..." required />
              <button class="btn-secondary" type="submit">+ Link</button>
            </form>
          </div>

          <!-- Living Workspace Note Canvas (senku.md) -->
          <div class="note-section">
            <div class="note-header">
              <span class="section-label">Workspace Canvas (senku.md)</span>
              <div class="note-actions">
                <button class="btn-secondary" id="btn-open-note-code" title="Open senku.md in VS Code">
                  💻 VS Code
                </button>
                <button class="btn-secondary" id="toggle-note-mode">
                  ${isNotePreview ? 'Edit (Ctrl+Enter)' : 'Preview (Ctrl+Enter)'}
                </button>
              </div>
            </div>
            <div class="note-editor-wrapper">
              ${
                isNotePreview
                  ? `<div class="note-preview">${renderMarkdownWithTasks(activeNoteContent)}</div>`
                  : `<textarea class="note-textarea" id="note-textarea" placeholder="Start typing thoughts, tasks (- [ ]), notes, code blocks...">${activeNoteContent}</textarea>`
              }
            </div>
          </div>
        `
            : `
          <div style="margin: auto; text-align: center; color: var(--text-dim);">
            <h2>No Spaces Configured</h2>
            <p style="margin-top: 10px;">Click the <b>+</b> button in the top bar to select a project folder.</p>
          </div>
        `
        }
      </section>

      <!-- Sidebar Stream (Right) -->
      <aside class="stream-panel">
        <!-- Focus Session Box -->
        <div class="stream-section">
          <span class="section-label">Contextual Focus Engine</span>
          <div class="focus-box ${focusActive ? 'running' : ''}">
            <div class="focus-timer-text" id="focus-display">
              ${focusActive ? formatDuration(focusRemainingSec) : `${state.focus?.durationMinutes || 25}:00`}
            </div>
            <input class="input-pill" id="focus-goal-input" value="${state.focus?.goal || ''}" placeholder="Focus target..." ${focusActive ? 'disabled' : ''} />
            <div class="focus-presets">
              <button class="preset-btn ${(state.focus?.durationMinutes || 25) === 15 ? 'active' : ''}" data-mins="15">15m</button>
              <button class="preset-btn ${(state.focus?.durationMinutes || 25) === 25 ? 'active' : ''}" data-mins="25">25m</button>
              <button class="preset-btn ${(state.focus?.durationMinutes || 25) === 45 ? 'active' : ''}" data-mins="45">45m</button>
            </div>
            <button class="btn-primary" id="btn-toggle-focus">
              ${focusActive ? 'Stop Session' : 'Start Focus'}
            </button>
          </div>
        </div>

        <!-- Fast Capture Inbox -->
        <div class="stream-section">
          <span class="section-label">Fast Capture Inbox</span>
          <input class="input-pill" id="inbox-input" placeholder="Type task & press Enter..." />
          <div class="inbox-list">
            ${(state.inbox || [])
              .map(
                (item) => `
              <div class="inbox-item ${item.done ? 'done' : ''}">
                <div class="inbox-item-left">
                  <div class="check-box" data-toggle-inbox="${item.id}">
                    ${item.done ? '✓' : ''}
                  </div>
                  <span>${item.text}</span>
                </div>
                <span class="item-del-btn" data-del-inbox="${item.id}">✕</span>
              </div>
            `,
              )
              .join('')}
          </div>
        </div>

        <!-- Timeline Logs -->
        <div class="stream-section" style="border-bottom: none; flex: 1;">
          <span class="section-label">Timeline Logs</span>
          <form class="log-input-row" id="add-log-form">
            <select class="tag-select" id="log-tag">
              <option value="dev">Dev</option>
              <option value="bug">Bug</option>
              <option value="idea">Idea</option>
              <option value="done">Done</option>
            </select>
            <input class="input-pill" id="log-text" placeholder="Logged milestone..." required />
            <button class="btn-secondary" type="submit">Log</button>
          </form>
          <div class="logs-list">
            ${(state.logs || [])
              .slice(0, 40)
              .map(
                (l) => `
              <div class="log-entry">
                <span class="log-tag-badge ${l.tag}">${l.tag}</span>
                <div class="log-content">
                  <span class="log-text">${l.text}</span>
                  <span class="log-meta">${formatTime(l.createdAt)} • ${l.spaceName || 'Global'}</span>
                </div>
                <span class="item-del-btn" data-del-log="${l.id}">✕</span>
              </div>
            `,
              )
              .join('')}
          </div>
        </div>
      </aside>
    </main>
  `;

  bindEvents();
}

// ---------------------------------------------------------------------------
// Event Binding
// ---------------------------------------------------------------------------

function bindEvents() {
  const activeSpace = getActiveSpace();

  // Window Controls
  document.getElementById('win-min')?.addEventListener('click', () => window.senku.minimize());
  document.getElementById('win-close')?.addEventListener('click', () => window.senku.close());

  // Space Tabs Switch
  document.querySelectorAll('.space-tab').forEach((tab) => {
    tab.addEventListener('click', async () => {
      const spaceId = tab.getAttribute('data-space-id');
      if (spaceId && spaceId !== state.activeSpaceId) {
        state.activeSpaceId = spaceId;
        await saveCurrentState();
        await loadNoteForActiveSpace();
        render();
      }
    });
  });

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
      links: [],
      createdAt: Date.now(),
    };
    state.spaces.push(newSpace);
    state.activeSpaceId = newSpace.id;
    await saveCurrentState();
    await loadNoteForActiveSpace();
    render();
  });

  // Space Name Inline Edit
  const nameInput = document.getElementById('space-name-input') as HTMLInputElement | null;
  nameInput?.addEventListener('change', async () => {
    if (activeSpace && nameInput.value.trim()) {
      activeSpace.name = nameInput.value.trim();
      await saveCurrentState();
      render();
    }
  });

  // Change Space Folder
  document.getElementById('btn-change-folder')?.addEventListener('click', async () => {
    if (!activeSpace) return;
    const folder = await window.senku.pickFolder();
    if (folder) {
      activeSpace.path = folder;
      await saveCurrentState();
      await loadNoteForActiveSpace();
      render();
    }
  });

  // Delete Space
  document.getElementById('btn-del-space')?.addEventListener('click', async () => {
    if (!activeSpace) return;
    state.spaces = state.spaces.filter((s) => s.id !== activeSpace.id);
    state.activeSpaceId = state.spaces[0]?.id || null;
    await saveCurrentState();
    await loadNoteForActiveSpace();
    render();
  });

  // Open Space Folder
  document.getElementById('space-path-click')?.addEventListener('click', () => {
    if (activeSpace) window.senku.openFolder(activeSpace.path);
  });

  // Objective Change
  const objInput = document.getElementById('space-objective-input') as HTMLInputElement | null;
  objInput?.addEventListener('change', async () => {
    if (activeSpace) {
      activeSpace.objective = objInput.value.trim();
      await saveCurrentState();
    }
  });

  // Launchpad Buttons
  document.getElementById('btn-launch-code')?.addEventListener('click', () => {
    if (activeSpace) window.senku.openCode(activeSpace.path);
  });
  document.getElementById('btn-launch-terminal')?.addEventListener('click', () => {
    if (activeSpace) window.senku.openTerminal(activeSpace.path);
  });
  document.getElementById('btn-launch-explorer')?.addEventListener('click', () => {
    if (activeSpace) window.senku.openFolder(activeSpace.path);
  });

  // Pinned Links
  document.querySelectorAll('.link-chip').forEach((chip) => {
    chip.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).classList.contains('link-chip-del')) return;
      const url = chip.getAttribute('data-url');
      if (url) window.senku.openUrl(url);
    });
  });

  document.querySelectorAll('[data-del-link]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const linkId = btn.getAttribute('data-del-link');
      if (activeSpace && linkId) {
        activeSpace.links = (activeSpace.links || []).filter((l) => l.id !== linkId);
        await saveCurrentState();
        render();
      }
    });
  });

  const linkForm = document.getElementById('add-link-form') as HTMLFormElement | null;
  linkForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeSpace) return;
    const title = (document.getElementById('link-title') as HTMLInputElement)?.value.trim();
    const url = (document.getElementById('link-url') as HTMLInputElement)?.value.trim();
    if (title && url) {
      if (!activeSpace.links) activeSpace.links = [];
      activeSpace.links.push({ id: crypto.randomUUID(), title, url });
      await saveCurrentState();
      render();
    }
  });

  // Open note in VS Code
  document.getElementById('btn-open-note-code')?.addEventListener('click', () => {
    if (activeSpace) {
      const notePath = getSpaceNotePath(activeSpace);
      window.senku.openCode(notePath);
    }
  });

  // Note Toggle & Textarea
  document.getElementById('toggle-note-mode')?.addEventListener('click', () => {
    isNotePreview = !isNotePreview;
    render();
  });

  // Interactive Task Checkbox clicks in Preview mode
  document.querySelectorAll('.interactive-task').forEach((cb) => {
    cb.addEventListener('change', () => {
      const idx = Number(cb.getAttribute('data-task-idx'));
      if (!isNaN(idx)) {
        toggleTaskByIndex(idx);
      }
    });
  });

  // Smart Note Editor Key Handling
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
          // Unindent
          const textBefore = noteArea.value.substring(0, start);
          if (textBefore.endsWith('  ')) {
            noteArea.value = noteArea.value.substring(0, start - 2) + noteArea.value.substring(start);
            noteArea.selectionStart = noteArea.selectionEnd = start - 2;
          }
        } else {
          // Indent
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

        // Match task list item: "- [ ] " or "- [x] "
        const taskMatch = lastLine.match(/^(\s*[-*]\s\[[ xX]\]\s)(.*)$/);
        if (taskMatch) {
          if (!taskMatch[2].trim()) {
            // Empty task item -> exit list
            e.preventDefault();
            const lineStart = cursor - lastLine.length;
            noteArea.value = noteArea.value.substring(0, lineStart) + noteArea.value.substring(cursor);
            noteArea.selectionStart = noteArea.selectionEnd = lineStart;
            activeNoteContent = noteArea.value;
            scheduleSaveNote();
            return;
          }
          // Continue new task
          e.preventDefault();
          const insert = `\n${taskMatch[1].replace(/\[[xX]\]/, '[ ]')}`;
          noteArea.value = noteArea.value.substring(0, cursor) + insert + noteArea.value.substring(cursor);
          noteArea.selectionStart = noteArea.selectionEnd = cursor + insert.length;
          activeNoteContent = noteArea.value;
          scheduleSaveNote();
          return;
        }

        // Match bullet list item: "- " or "* "
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

  // Focus Session Controls
  const toggleFocus = async () => {
    if (state.focus?.active) {
      // Stop focus
      const goal = state.focus.goal;
      state.focus.active = false;
      state.focus.startedAt = null;
      if (goal) {
        state.logs.unshift({
          id: crypto.randomUUID(),
          spaceId: activeSpace?.id || null,
          spaceName: activeSpace?.name || 'General',
          text: `Completed focus: ${goal}`,
          tag: 'done',
          createdAt: Date.now(),
        });
      }
    } else {
      // Start focus
      const goalInput = document.getElementById('focus-goal-input') as HTMLInputElement | null;
      state.focus = {
        active: true,
        spaceId: activeSpace?.id || null,
        goal: goalInput?.value.trim() || activeSpace?.objective || 'Deep Focus',
        startedAt: Date.now(),
        durationMinutes: state.focus?.durationMinutes || 25,
      };
    }
    await saveCurrentState();
    render();
  };

  document.getElementById('btn-toggle-focus')?.addEventListener('click', toggleFocus);
  document.getElementById('toggle-focus-top')?.addEventListener('click', toggleFocus);

  // Focus presets
  document.querySelectorAll('.preset-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const mins = Number(btn.getAttribute('data-mins')) || 25;
      state.focus.durationMinutes = mins;
      await saveCurrentState();
      render();
    });
  });

  // Inbox Add
  const inboxInput = document.getElementById('inbox-input') as HTMLInputElement | null;
  inboxInput?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && inboxInput.value.trim()) {
      const item: InboxItem = {
        id: crypto.randomUUID(),
        text: inboxInput.value.trim(),
        done: false,
        createdAt: Date.now(),
      };
      state.inbox.unshift(item);
      inboxInput.value = '';
      await saveCurrentState();
      render();
    }
  });

  // Inbox Toggle & Delete
  document.querySelectorAll('[data-toggle-inbox]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-toggle-inbox');
      const item = state.inbox.find((i) => i.id === id);
      if (item) {
        item.done = !item.done;
        await saveCurrentState();
        render();
      }
    });
  });

  document.querySelectorAll('[data-del-inbox]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del-inbox');
      state.inbox = state.inbox.filter((i) => i.id !== id);
      await saveCurrentState();
      render();
    });
  });

  // Logs Form Add
  const logForm = document.getElementById('add-log-form') as HTMLFormElement | null;
  logForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const textEl = document.getElementById('log-text') as HTMLInputElement | null;
    const tagEl = document.getElementById('log-tag') as HTMLSelectElement | null;
    if (textEl && textEl.value.trim()) {
      const newLog: LogEntry = {
        id: crypto.randomUUID(),
        spaceId: activeSpace?.id || null,
        spaceName: activeSpace?.name || 'General',
        text: textEl.value.trim(),
        tag: (tagEl?.value as any) || 'dev',
        createdAt: Date.now(),
      };
      state.logs.unshift(newLog);
      textEl.value = '';
      await saveCurrentState();
      render();
    }
  });

  // Delete Log
  document.querySelectorAll('[data-del-log]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-del-log');
      state.logs = state.logs.filter((l) => l.id !== id);
      await saveCurrentState();
      render();
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
        loadNoteForActiveSpace().then(render);
      }
    }
  }

  // Ctrl+Enter anywhere toggles note preview
  if (e.ctrlKey && e.key === 'Enter') {
    isNotePreview = !isNotePreview;
    render();
  }
});

// ---------------------------------------------------------------------------
// Focus Countdown Loop
// ---------------------------------------------------------------------------

function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (state.focus?.active && state.focus?.startedAt) {
      const elapsed = Math.floor((Date.now() - state.focus.startedAt) / 1000);
      const totalSec = (state.focus.durationMinutes || 25) * 60;
      const remaining = Math.max(0, totalSec - elapsed);

      const pill = document.getElementById('toggle-focus-top');
      if (pill) {
        pill.innerHTML = `⏱️ ${formatDuration(remaining)} — ${state.focus.goal || 'Focusing'}`;
      }
      const display = document.getElementById('focus-display');
      if (display) {
        display.textContent = formatDuration(remaining);
      }

      if (remaining === 0) {
        state.focus.active = false;
        state.focus.startedAt = null;
        state.logs.unshift({
          id: crypto.randomUUID(),
          spaceId: state.focus.spaceId,
          spaceName: state.spaces.find((s) => s.id === state.focus.spaceId)?.name || 'General',
          text: `🎉 Completed focus session: ${state.focus.goal || 'Session'}`,
          tag: 'done',
          createdAt: Date.now(),
        });
        saveCurrentState();
        render();
      }
    }
  }, 1000);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

async function init() {
  try {
    state = await window.senku.getState();
    await loadNoteForActiveSpace();
    render();
    startTimerLoop();
  } catch (err) {
    console.error('[senku] Failed to initialize:', err);
  }
}

init();
