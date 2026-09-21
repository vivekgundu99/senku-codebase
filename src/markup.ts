import type { FileEntry, Task } from '../electron/types';
import { state, currentView, selectedTaskIds, visibleTasks } from './state';
import { escapeHtml, formatDate, renderGreeting } from './utils';

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function sidebarMarkup(): string {
  const ws = state.workspace!;
  const todayCount = state.activeTasks.filter(
    (t) => new Date(t.startAt).toDateString() === new Date().toDateString(),
  ).length;
  const overdueCount = state.activeTasks.filter((t) => Date.now() > Date.parse(t.endAt)).length;

  const navItem = (view: string, icon: string, label: string, badge?: number) => `
    <button class="nav-item ${currentView === view ? 'selected' : ''}" data-view="${view}">
      <span>${icon}</span> ${label}
      ${badge !== undefined && badge > 0 ? `<b>${badge}</b>` : ''}
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
        ${navItem('Overdue', '!', 'Overdue', overdueCount)}
        ${navItem('Completed', '✓', 'Completed', state.completedTasks.length)}
        ${navItem('Error', '△', 'Error', state.errorTasks.length)}
      </nav>

      <div class="sidebar-divider"></div>
      <div class="workspace-label">CURRENT MASTER FOLDER</div>
      <button class="nav-item selected"><span>⌂</span> ${escapeHtml(ws.name)}</button>
      <button class="settings-link" id="workspace-settings">⚙ Workspace settings</button>
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

  const breadcrumbParts = relative
    .map(
      (part, i) =>
        `<span>/</span><button data-breadcrumb="${escapeHtml(
          ws.masterFolder + '\\' + relative.slice(0, i + 1).join('\\'),
        )}">${escapeHtml(part)}</button>`,
    )
    .join('');

  // The greeting always shows in h1 so it doesn't vanish when switching views.
  // When not on Today, the active view name appears as a small label above it.
  const greeting = renderGreeting(state.settings.greeting, state.settings.userName);
  const viewLabel =
    currentView !== 'Today'
      ? `<span class="active-view-label">${escapeHtml(currentView)}</span>`
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
        <button class="avatar-button">
          ${escapeHtml(state.settings.userName.charAt(0).toUpperCase())}
        </button>
      </div>
    </header>`;
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

  return `
    <div class="file-row" data-path="${escapeHtml(entry.path)}" data-kind="${entry.kind}">
      <button class="file-open"
        data-open-path="${escapeHtml(entry.path)}"
        data-kind="${entry.kind}">
        <span class="file-icon ${iconClass}">${iconGlyph}</span>
        <span class="file-name">${escapeHtml(entry.name)}</span>
      </button>
      <span class="file-actions">
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

  // Action buttons differ by bucket
  let actions = '';
  if (bucket === 'active') {
    actions = `
      <button data-action="snooze"     data-id="${task.id}" title="Snooze">Snooze</button>
      <button data-action="reschedule" data-id="${task.id}" title="Partially completed and reassign">Reassign</button>
      <button data-action="edit"       data-bucket="active" data-id="${task.id}" title="Edit task">Edit</button>`;
  } else if (bucket === 'error') {
    actions = `
      <button data-action="recover" data-id="${task.id}" title="Fix links and return to active">Recover</button>
      <button data-action="edit"    data-bucket="error" data-id="${task.id}" title="Edit task">Edit</button>
      <button data-action="delete"  data-bucket="error" data-id="${task.id}">Delete</button>`;
  } else {
    actions = `
      <button data-action="delete" data-bucket="completed" data-id="${task.id}">Delete</button>`;
  }

  // Checkbox / tick
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

  // Linked-path buttons (completed view)
  const completedLinks =
    bucket === 'completed' && task.linkedPaths.length
      ? `<div class="completed-links">
          ${task.linkedPaths
            .map(
              (p) =>
                `<button data-task-path="${escapeHtml(p)}" title="Open linked resource">
                   ${escapeHtml(p)}
                 </button>`,
            )
            .join('')}
         </div>`
      : '';

  // Error message
  const errorReason =
    bucket === 'error' && task.errorMessage
      ? `<p class="error-reason">${escapeHtml(task.errorMessage)}</p>`
      : '';

  // Timestamp line
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
  const tasks = visibleTasks();
  const bucket =
    currentView === 'Completed' ? 'completed' : currentView === 'Error' ? 'error' : 'active';

  const taskList = tasks.length
    ? tasks.map((t) => taskRowMarkup(t, bucket)).join('')
    : `<div class="empty-tasks">
        <span>✦</span>
        <p>Nothing competing for your attention.</p>
        <small>Add a task when you are ready.</small>
       </div>`;

  const heading = currentView === 'Today' ? 'On your radar' : currentView;

  return `
    <aside class="tasks-panel">
      <div class="section-heading">
        <div>
          <span class="section-kicker">TASKS</span>
          <h2>${heading}</h2>
        </div>
        <button class="add-button" id="add-task">+</button>
      </div>
      <div class="task-tabs">
        <button class="${currentView === 'Today' ? 'active' : ''}" data-view="Today">Today</button>
        <button class="${currentView === 'Upcoming' ? 'active' : ''}" data-view="Upcoming">Upcoming</button>
      </div>
      <div class="task-list">${taskList}</div>
      <button class="new-task-button" id="new-task"><span>+</span> Add a new task</button>
    </aside>`;
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
