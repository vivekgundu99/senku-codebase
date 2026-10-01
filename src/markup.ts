import type { FileEntry, Task } from '../electron/types';
import {
  state,
  currentView,
  dailyNote,
  selectedTaskIds,
  visibleTasks,
  errorCount,
} from './state';
import { escapeHtml, formatDate, renderGreeting } from './utils';

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function sidebarMarkup(): string {
  const ws = state.workspace!;
  const todayCount = state.activeTasks.filter(
    (t) => new Date(t.startAt).toDateString() === new Date().toDateString(),
  ).length;

  const navItem = (view: string, icon: string, label: string, badge?: number) => `
    <button class="nav-item ${currentView === view ? 'selected' : ''}" data-view="${view}">
      <span class="nav-icon">${icon}</span>
      <span class="nav-label">${label}</span>
      ${badge !== undefined && badge > 0 ? `<b class="nav-badge">${badge}</b>` : ''}
    </button>`;

  return `
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">S</span>
        <span>senku</span>
      </div>

      <div class="workspace-label">WORKSPACES</div>
      <button class="workspace-switcher" id="workspace-switcher">
        <span class="workspace-dot"></span>
        <span>${escapeHtml(ws.name)}</span>
        <span class="chevron">⌄</span>
      </button>

      <nav class="nav-list">
        ${navItem('Today', '◷', 'Today', todayCount)}
        ${navItem('Upcoming', '→', 'Upcoming')}
        ${navItem('Completed', '✓', 'Completed', state.completedTasks.length)}
        ${navItem('Note', '✎', 'Rough Note')}
      </nav>

      <div class="sidebar-divider"></div>
      <div class="workspace-label">CURRENT MASTER FOLDER</div>
      <button class="nav-item"><span class="nav-icon">⌂</span>
        <span class="nav-label">${escapeHtml(ws.name)}</span>
      </button>
      <button class="settings-link" id="workspace-settings">⚙ Workspace settings</button>

      <p class="creator-note">Made by a Navodayan</p>
    </aside>`;
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

export function topbarMarkup(): string {
  const ws = state.workspace!;
  const relative = state.currentPath
    .replace(ws.masterFolder, '')
    .split('\\')
    .filter(Boolean);

  const greeting = renderGreeting(state.settings.greeting, state.settings.userName);
  const viewLabel =
    currentView !== 'Today'
      ? `<span class="active-view-label">${escapeHtml(currentView === 'Note' ? 'Daily Note' : currentView)}</span>`
      : '';

  return `
    <header class="topbar">
      <div>
        <p class="breadcrumb">
          ${escapeHtml(ws.name)} <span>/</span>
          ${relative.length ? escapeHtml(relative.join(' / ')) : 'Overview'}
        </p>
        ${viewLabel}
        <h1>${greeting}</h1>
        <p class="date-line">
          ${new Intl.DateTimeFormat(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
          }).format(new Date())}
        </p>
      </div>
      <div class="top-actions">
        <button class="icon-button" id="refresh-button" title="Refresh">↻</button>
        <button class="avatar-button" title="Profile">
          ${escapeHtml(state.settings.userName.charAt(0).toUpperCase())}
        </button>
      </div>
    </header>`;
}

// ---------------------------------------------------------------------------
// Error banner — shown at top of Today when strict-mode tasks failed
// ---------------------------------------------------------------------------

export function errorBannerMarkup(): string {
  const count = errorCount();
  if (count === 0) return '';
  return `
    <div class="error-banner">
      <span class="error-banner-icon">△</span>
      <span>
        ${count} task${count > 1 ? 's' : ''} need${count === 1 ? 's' : ''} attention —
        linked resources couldn't be opened.
      </span>
      <button class="error-banner-link" data-view="Error">Review →</button>
    </div>`;
}

// ---------------------------------------------------------------------------
// File panel
// ---------------------------------------------------------------------------

export function fileEntryMarkup(entry: FileEntry): string {
  const iconClass =
    entry.kind === 'folder'
      ? 'folder'
      : entry.extension.toLowerCase() === 'pdf'
        ? 'pdf'
        : 'file';

  const iconGlyph =
    entry.kind === 'folder' ? '◼' : entry.extension === 'PDF' ? 'P' : '—';

  const pinAction = entry.pinned
    ? `data-file-action="unpin" title="Unpin"`
    : `data-file-action="pin" title="Pin to top"`;

  const pinGlyph = entry.pinned ? '★' : '☆';

  return `
    <div class="file-row ${entry.pinned ? 'pinned' : ''}"
      data-path="${escapeHtml(entry.path)}"
      data-kind="${entry.kind}">
      <button class="file-open"
        data-open-path="${escapeHtml(entry.path)}"
        data-kind="${entry.kind}">
        <span class="file-icon ${iconClass}">${iconGlyph}</span>
        <span class="file-name">${escapeHtml(entry.name)}</span>
        ${entry.pinned ? '<span class="pinned-indicator">pinned</span>' : ''}
      </button>
      <span class="file-actions">
        <button data-path="${escapeHtml(entry.path)}" ${pinAction}
          class="pin-button ${entry.pinned ? 'active' : ''}">${pinGlyph}</button>
        <button data-file-action="copy" data-path="${escapeHtml(entry.path)}" title="Copy path">
          Copy path
        </button>
        <button data-file-action="rename"
          data-path="${escapeHtml(entry.path)}"
          data-name="${escapeHtml(entry.name)}"
          title="Rename">
          Rename
        </button>
      </span>
    </div>`;
}

export function filePanelMarkup(): string {
  const ws = state.workspace!;
  const relative = state.currentPath
    .replace(ws.masterFolder, '')
    .split('\\')
    .filter(Boolean);

  const breadcrumb = relative
    .map(
      (part, i) =>
        `<span>/</span><button data-breadcrumb="${escapeHtml(
          ws.masterFolder + '\\' + relative.slice(0, i + 1).join('\\'),
        )}">${escapeHtml(part)}</button>`,
    )
    .join('');

  const fileList = state.entries.length
    ? state.entries.map(fileEntryMarkup).join('')
    : `<div class="empty-files">
        <span>✦</span>
        <p>This folder is empty</p>
        <small>Add files through Windows Explorer and refresh Senku.</small>
       </div>`;

  return `
    <section class="files-panel">
      <div class="section-heading">
        <div>
          <span class="section-kicker">MASTER FOLDER</span>
          <h2>Keep moving forward</h2>
        </div>
        <button class="text-button" id="open-folder">Open in Explorer ↗</button>
      </div>
      <div class="folder-path">
        <button id="go-root">⌂</button>
        ${breadcrumb}
      </div>
      <div class="file-list">${fileList}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Task panel
// ---------------------------------------------------------------------------

export function taskRowMarkup(task: Task, bucket: 'active' | 'completed' | 'error'): string {
  const overdue = bucket === 'active' && Date.now() > Date.parse(task.endAt);
  const status =
    bucket === 'completed'
      ? 'Completed'
      : bucket === 'error'
        ? 'Needs attention'
        : overdue
          ? 'Overdue'
          : task.priority === 'urgent'
            ? 'Urgent'
            : 'Active';

  const chipClass = status.toLowerCase().replaceAll(' ', '-');

  let actions = '';
  if (bucket === 'active') {
    actions = `
      <button data-action="snooze"     data-id="${task.id}">Snooze</button>
      <button data-action="reschedule" data-id="${task.id}">Reassign</button>
      <button data-action="edit" data-bucket="active" data-id="${task.id}">Edit</button>`;
  } else if (bucket === 'error') {
    actions = `
      <button data-action="recover" data-id="${task.id}">Recover</button>
      <button data-action="edit"   data-bucket="error" data-id="${task.id}">Edit</button>
      <button data-action="delete" data-bucket="error" data-id="${task.id}">Delete</button>`;
  } else {
    actions = `
      <button data-action="delete" data-bucket="completed" data-id="${task.id}">Delete</button>`;
  }

  const isSelected = selectedTaskIds.has(task.id);
  const checkbox =
    bucket === 'active'
      ? `<button class="task-check ${isSelected ? 'checked' : ''}"
           data-action="select" data-id="${task.id}" aria-label="Select task">
           ${isSelected ? '✓' : ''}
         </button>`
      : `<span class="task-check ${bucket === 'completed' ? 'checked' : ''}">
           ${bucket === 'completed' ? '✓' : ''}
         </span>`;

  const completedLinks =
    bucket === 'completed' && task.linkedPaths.length
      ? `<div class="completed-links">
          ${task.linkedPaths
            .map(
              (p) =>
                `<button data-task-path="${escapeHtml(p)}">${escapeHtml(p)}</button>`,
            )
            .join('')}
         </div>`
      : '';

  const errorReason =
    bucket === 'error' && task.errorMessage
      ? `<p class="error-reason">${escapeHtml(task.errorMessage)}</p>`
      : '';

  const timeLine =
    bucket === 'completed'
      ? `Completed ${formatDate(task.completedAt ?? task.updatedAt)}`
      : `Starts ${formatDate(task.startAt)} · Ends ${formatDate(task.endAt)}`;

  return `
    <article class="task-row">
      <div>${checkbox}</div>
      <div class="task-body">
        <div class="task-title-line">
          <h3>${escapeHtml(task.title)}</h3>
          <span class="status-chip ${chipClass}">${status}</span>
        </div>
        <p>${timeLine}</p>
        ${errorReason}
        ${completedLinks}
      </div>
      <div class="task-actions">${actions}</div>
    </article>`;
}

export function taskPanelMarkup(): string {
  // The Error view is surfaced via the banner and a special error-tasks list,
  // not as a top-level nav view. But we still need to render it if a link
  // in the banner triggers data-view="Error".
  const isError = currentView === 'Error';
  const bucket = currentView === 'Completed' ? 'completed' : isError ? 'error' : 'active';
  const tasks = isError ? state.errorTasks : visibleTasks();

  const taskList = tasks.length
    ? tasks.map((t) => taskRowMarkup(t, bucket)).join('')
    : `<div class="empty-tasks">
        <span>✦</span>
        <p>Nothing competing for your attention.</p>
        <small>Add a task when you are ready.</small>
       </div>`;

  const panelHeading = currentView === 'Today'
    ? 'On your radar'
    : currentView === 'Error'
      ? 'Needs attention'
      : currentView;

  // Add task button only makes sense for active/error views
  const addButton = bucket !== 'completed'
    ? `<button class="add-button" id="add-task">+</button>`
    : '';

  return `
    <aside class="tasks-panel">
      <div class="section-heading">
        <div>
          <span class="section-kicker">TASKS</span>
          <h2>${panelHeading}</h2>
        </div>
        ${addButton}
      </div>
      <div class="task-list">${taskList}</div>
      ${bucket !== 'completed' ? `<button class="new-task-button" id="new-task"><span>+</span> Add a new task</button>` : ''}
    </aside>`;
}

// dailyNotePanelMarkup removed — note now lives inside the sidebar when Note view is active.
// ---------------------------------------------------------------------------
// Daily note panel — renders in the task-panel slot when Note view is active
// ---------------------------------------------------------------------------

export function dailyNotePanelMarkup(): string {
  return `
    <section class="tasks-panel note-panel">
      <div class="section-heading">
        <div>
          <span class="section-kicker">DAILY NOTE</span>
          <h2>Today's thoughts</h2>
        </div>
        <span class="note-saved-indicator" id="note-saved"></span>
      </div>
      <textarea
        id="daily-note"
        class="note-textarea"
        placeholder="Dump thoughts, half-formed ideas, things to remember. This is only yours."
        spellcheck="false"
      >${escapeHtml(dailyNote)}</textarea>
    </section>`;
}

// ---------------------------------------------------------------------------
// Setup screen (first run)
// ---------------------------------------------------------------------------

export function setupScreenMarkup(): string {
  return `
    <main class="setup-shell">
      <div class="setup-mark">S</div>
      <p class="eyebrow">A focused home for your degree</p>
      <h1>Build your own<br><em>workspace.</em></h1>
      <p class="setup-copy">
        Create a private space for one master folder. Senku keeps your real files
        exactly where they are and stores tasks separately.
      </p>
      <section class="setup-card">
        <label for="user-name">Your name</label>
        <input id="user-name" placeholder="What should Senku call you?" />

        <label for="workspace-name">Workspace name</label>
        <input id="workspace-name" placeholder="Workspace 1" />

        <label for="master-path">Master folder location</label>
        <div class="path-input">
          <input id="master-path" placeholder="C:\\Users\\you\\btech24-28" />
          <button id="browse-folder" class="ghost-button">Browse</button>
        </div>

        <button id="save-folder" class="primary-button">
          Create workspace <span>→</span>
        </button>
        <p id="setup-error" class="form-error"></p>
      </section>
      <p class="setup-footnote">Your files stay local. Senku only remembers paths and tasks.</p>
    </main>`;
}
