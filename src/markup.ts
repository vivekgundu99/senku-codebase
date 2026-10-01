import type { FileEntry, Task } from '../electron/types';
import {
  state,
  currentView,
  dailyNote,
  selectedTaskIds,
  visibleTasks,
  overdueCount,
  errorCount,
} from './state';
import { escapeHtml, formatDate, renderGreeting } from './utils';

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function sidebarMarkup(): string {
  const ws = state.workspace!;
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

      <nav class="nav-list">
        ${navItem('Home', '⌂', 'Home')}
        ${navItem('Note', '✎', 'Rough Note')}
      </nav>

      <div class="sidebar-divider"></div>
      <div class="workspace-label">SPACES</div>
      <div class="space-list">
        ${state.workspaces.map((space) => `
          <button class="space-item ${space.id === ws.id ? 'current' : ''}" data-switch-space="${space.id}" title="${escapeHtml(space.masterFolder)}">
            <span class="workspace-dot"></span><span>${escapeHtml(space.name)}</span>
          </button>`).join('')}
      </div>
      <button class="settings-link" id="add-space">＋ Add a Space</button>
      <button class="settings-link" id="workspace-settings">⚙ Current space settings</button>
      <button class="settings-link" id="app-settings">⚙ App settings</button>
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
  return `
    <header class="topbar">
      <div>
        <p class="breadcrumb">
          ${escapeHtml(ws.name)} <span>/</span>
          ${relative.length ? escapeHtml(relative.join(' / ')) : 'Overview'}
        </p>
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
          <span class="section-kicker">MAIN FOLDER</span>
          <h2>Files and folders</h2>
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

export function taskRowMarkup(task: Task, bucket: 'active' | 'completed' | 'error', selectable = true): string {
  const overdue = bucket === 'active' && task.taskType === 'scheduled' && Boolean(task.endAt && Date.now() > Date.parse(task.endAt));
  const status =
    bucket === 'completed'
      ? 'Completed'
      : bucket === 'error'
        ? 'Needs attention'
        : overdue
          ? 'Overdue'
          : 'Active';

  const chipClass = status.toLowerCase().replaceAll(' ', '-');

  let actions = '';
  if (bucket === 'active' && task.taskType === 'flexible') {
    actions = `
      <button data-action="pin" data-id="${task.id}">${task.isPinned ? 'Unpin' : 'Pin'}</button>
      <button data-action="edit" data-bucket="active" data-id="${task.id}">Edit</button>`;
  } else if (bucket === 'active') {
    actions = `
      <button data-action="snooze" data-id="${task.id}">Snooze</button>
      <button data-action="reschedule" data-id="${task.id}">Reassign</button>
      <button data-action="pin" data-id="${task.id}">${task.isPinned ? 'Unpin' : 'Pin'}</button>
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
    bucket === 'active' && selectable
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

      const scheduleLabel = task.taskType === 'flexible'
        ? 'Whenever it fits'
        : task.startAt && task.endAt ? scheduledTimeLabel(task.startAt, task.endAt) : '';
  const completionLabel = bucket === 'completed'
    ? `Completed ${formatDate(task.completedAt ?? task.updatedAt)}`
    : scheduleLabel;

  return `
    <article class="task-row" title="Added ${escapeHtml(formatDate(task.createdAt))} · Last updated ${escapeHtml(formatDate(task.updatedAt))}">
      <div>${checkbox}</div>
      <div class="task-body">
        <div class="task-title-line">
          <h3>${escapeHtml(task.title)}</h3>
          <span class="status-chip ${chipClass}">${status}</span>
        </div>
        <div class="task-meta"><span class="task-type-chip ${task.taskType}">${task.taskType === 'flexible' ? 'Flexible' : 'Scheduled'}</span><span class="schedule-chip">${escapeHtml(completionLabel)}</span>${task.isPinned ? '<span class="task-pin-badge">Pinned</span>' : ''}</div>
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
    ? "Today's Focus"
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

function scheduledTimeLabel(startValue: string, endValue: string): string {
  const start = new Date(startValue);
  const end = new Date(endValue);
  const today = new Date();
  const startDate = start.toDateString() === today.toDateString()
    ? 'Today'
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(start);
  const time = (date: Date) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  const endOfDay = end.getHours() === 23 && end.getMinutes() === 59;
  if (start.toDateString() === end.toDateString()) {
    return endOfDay ? `${startDate} · ${time(start)}` : `${startDate} · ${time(start)} – ${time(end)}`;
  }
  const endDateTime = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(end);
  return `${startDate} · ${time(start)} – ${endDateTime}`;
}

export function homePanelMarkup(): string {
  const active = state.activeTasks;
  const scheduledToday = active.filter((task) =>
    task.taskType === 'scheduled' && task.startAt &&
    new Date(task.startAt).toDateString() === new Date().toDateString() &&
    task.endAt && Date.parse(task.endAt) >= Date.now(),
  ).length;
  const flexibleCount = active.filter((task) => task.taskType === 'flexible').length;
  const upcomingCount = active.filter((task) => task.taskType === 'flexible' || Boolean(
    task.startAt && task.endAt && Date.parse(task.startAt) > Date.now() && Date.parse(task.endAt) >= Date.now(),
  )).length;
  return `
    <section class="home-panel">
      <div class="home-welcome">
        <span class="section-kicker">HOME</span>
        <h2>Your space, at a glance.</h2>
        <p>Pick up where you left off, or decide what to work on today.</p>
        <button class="primary-button" id="home-add-task">Add a task <span>→</span></button>
      </div>
      <div class="home-stats">
        <button data-view="Today"><strong>${scheduledToday}</strong><span>Scheduled today</span></button>
        <button data-view="Flexible"><strong>${flexibleCount}</strong><span>Flexible</span></button>
        <button data-view="Overdue"><strong>${overdueCount()}</strong><span>Overdue</span></button>
      </div>
      <section class="home-tools">
        <div>
          <span class="section-kicker">TASK VIEWS</span>
          <div class="home-shortcuts">
            <button data-view="Today"><strong>Today</strong><span>${scheduledToday} scheduled</span></button>
            <button data-view="Upcoming"><strong>Upcoming</strong><span>${upcomingCount} tasks</span></button>
            <button data-view="Overdue"><strong>Overdue</strong><span>${overdueCount()} tasks</span></button>
            <button data-view="Completed"><strong>Completed</strong><span>${state.completedTasks.length} tasks</span></button>
          </div>
        </div>
      </section>
    </section>`;
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
      <p class="eyebrow">YOUR FILES, YOUR FLOW</p>
      <h1>A space for<br><em>what matters.</em></h1>
      <p class="setup-copy">
        Choose a folder to make a Space. Senku keeps your files in place
        and helps you return to the work, notes, and resources you care about.
      </p>
      <section class="setup-card">
        <label for="user-name">Your name</label>
        <input id="user-name" placeholder="Your name or nickname" />

        <label for="workspace-name">Space name</label>
        <input id="workspace-name" placeholder="e.g. Personal, College, Projects" />

        <label for="master-path">Main folder</label>
        <div class="path-input">
          <input id="master-path" placeholder="C:\\Users\\you\\3rd year" />
          <button id="browse-folder" class="ghost-button">Browse</button>
        </div>

        <button id="save-folder" class="primary-button">
          Create Space <span>→</span>
        </button>
        <p id="setup-error" class="form-error"></p>
      </section>
      <p class="setup-footnote">Choose any folder, or create a new one from Browse.</p>
    </main>`;
}
