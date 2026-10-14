import type { FileEntry, Task } from '../electron/types';
import {
  state,
  currentView,
  dailyNote,
  fileFilter,
  selectedTaskIds,
  visibleEntries,
  visibleTasks,
  tasksForView,
  errorCount,
  getScheduledFocusTask,
  getFlexibleFocusTask,
  homeFocusTab,
} from './state';
import { escapeHtml, folderName, formatDate, isSamePath, pathCrumbs, renderGreeting } from './utils';

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function sidebarMarkup(): string {
  const ws = state.workspace;
  const todayCount = tasksForView('Today').length;
  const upcomingCount = tasksForView('Upcoming').length;
  const flexibleCount = tasksForView('Flexible').length;
  const missedCount = tasksForView('Overdue').length;
  const completedCount = state.completedTasks?.length ?? 0;

  const navItem = (view: string, icon: string, label: string, shortcut?: string) => `
    <button class="nav-item ${currentView === view ? 'selected' : ''}" data-view="${view}" title="${label}${shortcut ? ` (${shortcut})` : ''}">
      <span class="nav-icon">${icon}</span>
      <span class="nav-label">${label}</span>
      ${shortcut ? `<span class="nav-key">${shortcut}</span>` : ''}
    </button>`;

  const spaceRow = (space: (typeof state.workspaces)[number]) => {
    const current = ws ? space.id === ws.id : false;
    const missing = state.workspaceFolderAvailability[space.id] === false;
    const tooltip = `${space.name} · ${space.masterFolder}${space.strictMode ? ' (auto-open)' : ''}${missing ? ' [Folder missing]' : ''}`;
    return `
      <div class="space-row ${current ? 'current' : ''}">
        <button class="space-item" data-switch-space="${space.id}" title="${escapeHtml(tooltip)}">
          <span class="space-badge ${missing ? 'missing' : ''}">${escapeHtml(space.name.charAt(0).toUpperCase() || '?')}</span>
          <span class="space-name">${escapeHtml(space.name)}</span>
          <span class="space-indicator-icons">
            ${space.strictMode ? '<span class="space-strict-icon" title="Auto-open enabled">⚡</span>' : ''}
            ${missing ? '<span class="space-missing-icon" title="Folder not found">△</span>' : ''}
          </span>
        </button>
        ${current ? '<button class="space-gear" id="workspace-settings" title="Space settings" aria-label="Space settings">⚙</button>' : ''}
      </div>`;
  };

  const spacesContent = state.workspaces?.length > 0
    ? state.workspaces.map(spaceRow).join('')
    : `<div class="empty-spaces-box">
         <p class="empty-spaces-text">No Spaces yet</p>
         <button class="empty-space-add-btn" id="add-space-empty">+ Create first Space</button>
       </div>`;

  return `
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">S</span>
        <span>senku</span>
      </div>

      <div class="sidebar-section-label">VIEWS</div>
      <nav class="nav-list">
        ${navItem('Home', '⌂', 'Home', 'H')}
        ${navItem('Today', '☼', 'Today', 'T')}
        ${navItem('Upcoming', '⇥', 'Upcoming', 'U')}
        ${navItem('Flexible', '∿', 'Flexible', 'F')}
        ${navItem('Overdue', '△', 'Missed', 'M')}
        ${navItem('Completed', '✓', 'Completed', 'C')}
        ${navItem('Note', '✎', 'Rough Note', 'N')}
      </nav>

      <div class="spaces-head">
        <span class="workspace-label">SPACES</span>
        <button class="mini-button" id="add-space" title="Add a Space" aria-label="Add a Space">＋</button>
      </div>
      <div class="space-list">${spacesContent}</div>
    </aside>`;
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

export function topbarMarkup(): string {
  const ws = state.workspace;
  const greeting = renderGreeting(state.settings.greeting, state.settings.userName);
  const dateFormatted = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const spacePill = ws
    ? `<span class="topbar-space-pill" title="Folder: ${escapeHtml(ws.masterFolder)}">
        <span class="space-dot">●</span>
        <span class="space-pill-label">Space:</span>
        <strong class="space-pill-name">${escapeHtml(ws.name)}</strong>
      </span>`
    : `<button class="topbar-space-pill empty-pill" id="topbar-create-space" title="Click to create your first Space">
        <span class="space-dot empty">○</span>
        <span class="space-pill-label">Space:</span>
        <strong class="space-pill-name">+ Add Space</strong>
      </button>`;

  const userInitial = state.settings?.userName ? state.settings.userName.charAt(0).toUpperCase() : 'S';

  return `
    <header class="topbar">
      <div>
        <h1>${greeting}</h1>
        <div class="topbar-subline">
          <p class="date-line">${dateFormatted}</p>
          ${spacePill}
        </div>
      </div>
      <div class="top-actions">
        <button class="topbar-add-task" id="topbar-add-task" title="Add a task">+ Add Task</button>
        <button class="icon-button" id="refresh-button" title="Refresh">↻</button>
        <button class="avatar-button" id="profile-avatar-button" title="Profile &amp; Settings" aria-label="Profile and Settings">
          ${escapeHtml(userInitial)}
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

const ICONS: Record<string, string> = {
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  sheet: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/>',
  slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M12 16v4M8 20h8"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-8 9"/>',
  video: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m10 9 5 3-5 3z"/>',
  audio: '<path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
  code: '<path d="m8 8-5 4 5 4M16 8l5 4-5 4M14 5l-4 14"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/>',
};

const EXT_GROUPS: Record<string, string[]> = {
  pdf: ['pdf'],
  doc: ['doc', 'docx', 'txt', 'md', 'rtf', 'odt'],
  sheet: ['xls', 'xlsx', 'csv', 'ods'],
  slides: ['ppt', 'pptx', 'odp', 'key'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'],
  video: ['mp4', 'mkv', 'mov', 'avi', 'webm'],
  audio: ['mp3', 'wav', 'm4a', 'flac', 'ogg'],
  code: ['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'cpp', 'h', 'cs', 'html', 'css', 'json', 'sql', 'sh', 'bat', 'ipynb'],
  archive: ['zip', 'rar', '7z', 'tar', 'gz'],
};

function fileKind(entry: FileEntry): string {
  if (entry.kind === 'folder') return 'folder';
  const ext = entry.extension.replace(/^\./, '').toLowerCase();
  return Object.keys(EXT_GROUPS).find((group) => EXT_GROUPS[group].includes(ext)) ?? 'file';
}

const iconSvg = (kind: string): string =>
  `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind === 'pdf' ? 'doc' : kind] ?? ICONS.file}</svg>`;

export function fileEntryMarkup(entry: FileEntry): string {
  const kind = fileKind(entry);
  const pinAction = entry.pinned
    ? `data-file-action="unpin" title="Unpin"`
    : `data-file-action="pin" title="Pin to top"`;

  return `
    <div class="file-row ${entry.pinned ? 'pinned' : ''}" data-path="${escapeHtml(entry.path)}" data-kind="${entry.kind}">
      <button class="file-open" data-open-path="${escapeHtml(entry.path)}" data-kind="${entry.kind}">
        <span class="file-icon ${kind}">${iconSvg(kind)}</span>
        <span class="file-name">${escapeHtml(entry.name)}</span>
        ${entry.pinned ? '<span class="pinned-indicator">pinned</span>' : ''}
      </button>
      <span class="file-actions">
        <button data-path="${escapeHtml(entry.path)}" ${pinAction}
          class="pin-button ${entry.pinned ? 'active' : ''}" aria-label="${entry.pinned ? 'Unpin' : 'Pin'}">${entry.pinned ? '★' : '☆'}</button>
        <button data-file-action="copy" data-path="${escapeHtml(entry.path)}" title="Copy path">Copy path</button>
      </span>
    </div>`;
}

/** The scrolling list only. Re-rendered on its own while filtering. */
export function fileListMarkup(): string {
  const { items, matched, total } = visibleEntries();
  if (total === 0) {
    return `<div class="empty-files">
        <p>This folder is empty</p>
        <small>Add files through Windows Explorer and refresh Senku.</small>
      </div>`;
  }
  if (matched === 0) {
    return `<div class="empty-files"><p>No match for “${escapeHtml(fileFilter)}”</p></div>`;
  }
  const more = matched - items.length;
  return items.map(fileEntryMarkup).join('') +
    (more > 0 ? `<button class="show-more" id="show-more-files">Show ${Math.min(more, 150)} more · ${more} hidden</button>` : '');
}

export function fileCountLabel(): string {
  const { matched, total } = visibleEntries();
  const word = (n: number) => `${n} item${n === 1 ? '' : 's'}`;
  return matched === total ? word(total) : `${matched} of ${total}`;
}

export function filePanelMarkup(): string {
  const ws = state.workspace;
  if (!ws) {
    return `
      <section class="files-panel">
        <div class="section-heading">
          <div><h2>Files and folders</h2></div>
        </div>
        <div class="empty-files-unlinked">
          <div class="empty-unlinked-icon">📁</div>
          <h3>No folder linked</h3>
          <p>Create a Space and choose a project folder. Your files, documents, and notes will show up here to launch with one click.</p>
          <button class="primary-button" id="create-space-files" style="max-width:220px; margin: 14px auto 0;">+ Create a Space <span>→</span></button>
        </div>
      </section>`;
  }

  const atRoot = isSamePath(state.currentPath, ws.masterFolder);
  const crumbs = pathCrumbs(ws.masterFolder, state.currentPath);
  // Deep folder? keep the last three so the bar never overflows.
  const shown = crumbs.length > 3 ? crumbs.slice(-3) : crumbs;
  const breadcrumb =
    (crumbs.length > 3 ? '<span>/</span><span class="crumb-gap">…</span>' : '') +
    shown.map((c) => `<span>/</span><button data-breadcrumb="${escapeHtml(c.path)}">${escapeHtml(c.name)}</button>`).join('');

  return `
    <section class="files-panel">
      <div class="section-heading">
        <div><h2>Files and folders</h2></div>
        <button class="text-button" id="open-folder">Open in Explorer ↗</button>
      </div>
      <div class="folder-path">
        <button id="go-up" class="up-button" title="Up one folder (R)" aria-label="Up one folder" ${atRoot ? 'disabled' : ''}>↑</button>
        <button id="go-root" title="Go to main folder">${escapeHtml(folderName(ws.masterFolder))}</button>
        ${breadcrumb}
      </div>
      <div class="file-tools">
        <input id="file-filter" type="search" placeholder="search in this folder" value="${escapeHtml(fileFilter)}" autocomplete="off" spellcheck="false" />
        <span class="file-count" id="file-count">${fileCountLabel()}</span>
      </div>
      <div class="file-list">${fileListMarkup()}</div>
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
      <button data-action="make-flexible" data-id="${task.id}" title="Remove schedule and make flexible without guilt">Make flexible</button>
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
  // Active AND completed rows can be multi-selected. Completed rows keep a soft
  // green tick (done) until they are selected, then turn solid dark.
  const checkbox =
    (bucket === 'active' || bucket === 'completed') && selectable
      ? `<button class="task-check ${bucket === 'completed' ? 'done' : ''} ${isSelected ? 'checked' : ''}"
           data-action="select" data-id="${task.id}" aria-label="Select task">
           ${isSelected || bucket === 'completed' ? '✓' : ''}
         </button>`
      : `<span class="task-check"></span>`;

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
          <h3 title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</h3>
          <span class="status-chip ${chipClass}">${overdue ? 'Missed' : status}</span>
        </div>
        ${task.firstStep ? `<div class="task-first-step">↳ <em>${escapeHtml(task.firstStep)}</em></div>` : ''}
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
    : currentView === 'Overdue'
      ? 'Missed Tasks'
      : currentView === 'Error'
        ? 'Needs attention'
        : currentView;

  const missedBanner = currentView === 'Overdue' && tasks.length > 0
    ? `<div class="missed-helper-banner">
         <div class="missed-helper-text">
           <strong>Missed a deadline? Life happens.</strong>
           <p>Convert them into flexible tasks with one click to tackle whenever it fits your flow.</p>
         </div>
         <button class="hero-action-btn flex" id="convert-all-flexible">Convert all to flexible</button>
       </div>`
    : '';

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
      ${missedBanner}
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

function resourceChipMarkup(p: string): string {
  const trimmed = p.trim();
  const isUrl = /^https?:\/\//i.test(trimmed);
  let label = trimmed;
  let icon = '📄';
  if (isUrl) {
    icon = '🌐';
    try {
      const url = new URL(trimmed);
      label = url.hostname.replace(/^www\./, '') + (url.pathname.length > 1 ? url.pathname.slice(0, 15) + '…' : '');
    } catch {
      label = trimmed.slice(0, 25);
    }
  } else {
    label = folderName(trimmed);
  }
  return `<span class="hero-resource-chip" title="${escapeHtml(trimmed)}"><span class="chip-icon">${icon}</span> ${escapeHtml(label)}</span>`;
}

function heroScheduledContent(task: Task | null, reason: string): string {
  if (!task) {
    return `
      <div class="hero-empty-state">
        <p class="hero-empty-title">No scheduled tasks queued right now</p>
        <p class="hero-empty-subtitle">Pick a flexible task to work on, or schedule a new task for today.</p>
        <div class="hero-empty-actions">
          <button class="hero-action-btn primary" id="home-hero-add-task">+ Schedule a task</button>
          <button class="hero-action-btn ghost" data-home-tab="flexible">Switch to Flexible →</button>
        </div>
      </div>`;
  }

  const kickerMap: Record<string, string> = {
    'in-progress': 'IN PROGRESS',
    overdue: 'MISSED · READY TO START',
    today: 'SCHEDULED TODAY',
  };
  const kicker = kickerMap[reason] ?? 'SCHEDULED FOCUS';
  const timing = task.startAt && task.endAt ? scheduledTimeLabel(task.startAt, task.endAt) : 'Scheduled';

  const resources = task.linkedPaths.length
    ? `<div class="focus-resources-wrap">
         <span class="focus-resources-label">Resources (${task.linkedPaths.length}):</span>
         <div class="focus-resources">
           ${task.linkedPaths.map(resourceChipMarkup).join('')}
         </div>
       </div>`
    : '';

  return `
    <div class="hero-task-view scheduled">
      <div class="hero-task-meta-line">
        <span class="focus-card-kicker ${reason === 'in-progress' ? 'active' : ''}">${kicker}</span>
        <span class="focus-timing">${escapeHtml(timing)}</span>
      </div>
      <h3 class="hero-focus-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</h3>
      ${task.firstStep ? `<div class="focus-step-banner"><span class="step-label">First step:</span> <em>${escapeHtml(task.firstStep)}</em></div>` : ''}
      ${resources}
      <div class="focus-card-foot">
        <button class="focus-launch-hero-btn" data-hero-launch="${task.id}">
          <span class="launch-icon">▷</span>
          <span class="launch-text">Start &amp; Launch ${task.linkedPaths.length ? `(${task.linkedPaths.length} resource${task.linkedPaths.length > 1 ? 's' : ''})` : ''}</span>
          <span class="launch-arrow">→</span>
        </button>
        <div class="focus-actions-bar">
          <button class="focus-action-btn complete" data-hero-complete="${task.id}" title="Complete task">✓ Done</button>
          <button class="focus-action-btn" data-hero-snooze="${task.id}" data-mins="15" title="Snooze 15m">Snooze 15m</button>
          <button class="focus-action-btn" data-hero-flexible="${task.id}" title="Make flexible">Make flexible</button>
          <button class="focus-action-btn" data-action="edit" data-bucket="active" data-id="${task.id}">Edit</button>
        </div>
      </div>
    </div>`;
}

function heroFlexibleContent(task: Task | null, isPicked: boolean): string {
  if (!task) {
    return `
      <div class="hero-empty-state">
        <p class="hero-empty-title">No flexible tasks right now</p>
        <p class="hero-empty-subtitle">Add tasks without deadlines so you can work on them whenever you have free time.</p>
        <div class="hero-empty-actions">
          <button class="hero-action-btn primary" id="home-hero-add-task">+ Add flexible task</button>
        </div>
      </div>`;
  }

  const kicker = isPicked ? '🎲 PICKED FOR YOU' : 'FLEXIBLE FOCUS';

  const resources = task.linkedPaths.length
    ? `<div class="focus-resources-wrap">
         <span class="focus-resources-label">Resources (${task.linkedPaths.length}):</span>
         <div class="focus-resources">
           ${task.linkedPaths.map(resourceChipMarkup).join('')}
         </div>
       </div>`
    : '';

  return `
    <div class="hero-task-view flexible">
      <div class="hero-task-meta-line">
        <span class="focus-card-kicker flex">${kicker}</span>
        <span class="focus-timing">Work anytime</span>
      </div>
      <h3 class="hero-focus-title" title="${escapeHtml(task.title)}">${escapeHtml(task.title)}</h3>
      ${task.firstStep ? `<div class="focus-step-banner"><span class="step-label">First step:</span> <em>${escapeHtml(task.firstStep)}</em></div>` : ''}
      ${resources}
      <div class="focus-card-foot">
        <button class="focus-launch-hero-btn" data-hero-launch="${task.id}">
          <span class="launch-icon">▷</span>
          <span class="launch-text">Start &amp; Launch ${task.linkedPaths.length ? `(${task.linkedPaths.length} resource${task.linkedPaths.length > 1 ? 's' : ''})` : ''}</span>
          <span class="launch-arrow">→</span>
        </button>
        <div class="focus-actions-bar">
          <button class="focus-action-btn complete" data-hero-complete="${task.id}" title="Complete task">✓ Done</button>
          <button class="focus-action-btn" data-action="pin" data-id="${task.id}">${task.isPinned ? 'Unpin' : 'Pin'}</button>
          <button class="focus-action-btn" data-action="edit" data-bucket="active" data-id="${task.id}">Edit</button>
        </div>
      </div>
    </div>`;
}

export function homePanelMarkup(): string {
  const scheduledFocus = getScheduledFocusTask();
  const flexibleFocus = getFlexibleFocusTask();
  const todayCount = tasksForView('Today').length;
  const upcomingCount = tasksForView('Upcoming').length;
  const flexibleCount = tasksForView('Flexible').length;
  const missedCount = tasksForView('Overdue').length;
  const completedCount = state.completedTasks?.length ?? 0;

  const activeTab = homeFocusTab;

  const heroBody = activeTab === 'scheduled'
    ? heroScheduledContent(scheduledFocus.task, scheduledFocus.reason)
    : heroFlexibleContent(flexibleFocus.task, flexibleFocus.isPicked);

  return `
    <section class="home-panel">
      <div class="home-hero-card ${activeTab}">
        <div class="hero-top-bar">
          <div class="hero-tab-group">
            <button class="hero-tab-btn ${activeTab === 'scheduled' ? 'active' : ''}" data-home-tab="scheduled">
              <span class="tab-dot">●</span>
              <span>Next Up</span>
            </button>
            <button class="hero-tab-btn ${activeTab === 'flexible' ? 'active' : ''}" data-home-tab="flexible">
              <span class="tab-icon">🎲</span>
              <span>Flexible</span>
            </button>
          </div>
          ${activeTab === 'flexible' && flexibleFocus.totalFlexible > 1 ? '<button class="hero-pick-btn" id="hero-pick-random" title="Randomly pick another flexible task">🎲 Pick for me</button>' : ''}
        </div>
        <div class="hero-content">
          ${heroBody}
        </div>
      </div>

      <div class="home-metrics-bar">
        <button class="metric-box-chip" data-view="Today" title="Today's tasks (T)">today <span class="metric-box-count">${todayCount}</span></button>
        <button class="metric-box-chip" data-view="Upcoming" title="Upcoming tasks (U)">upcoming <span class="metric-box-count">${upcomingCount}</span></button>
        <button class="metric-box-chip" data-view="Flexible" title="Flexible tasks (F)">flexible <span class="metric-box-count">${flexibleCount}</span></button>
        <button class="metric-box-chip ${missedCount > 0 ? 'alert' : ''}" data-view="Overdue" title="Missed tasks (M)">missed <span class="metric-box-count">${missedCount}</span></button>
        <button class="metric-box-chip" data-view="Completed" title="Completed tasks (C)">completed <span class="metric-box-count">${completedCount}</span></button>
      </div>
    </section>`;
}

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


