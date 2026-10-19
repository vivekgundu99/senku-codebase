import type { FileEntry, LogEntry, Launchpad, NoteFile } from '../electron/types';
import {
  state,
  currentView,
  dailyNote,
  fileFilter,
  visibleEntries,
  getLogEntries,
  logFilter,
  visibleLogEntries,
  activeNoteId,
} from './state';
import { escapeHtml, folderName, isSamePath, pathCrumbs, renderGreeting } from './utils';

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function sidebarMarkup(): string {
  const ws = state.workspace;

  const navItem = (view: string, icon: string, label: string, shortcut?: string) => `
    <button class="nav-item ${currentView === view ? 'selected' : ''}" data-view="${view}" title="${label}${shortcut ? ` (${shortcut})` : ''}">
      <span class="nav-icon">${icon}</span>
      <span class="nav-label">${label}</span>
      ${shortcut ? `<span class="nav-key">${shortcut}</span>` : ''}
    </button>`;

  const spaceRow = (space: (typeof state.workspaces)[number]) => {
    const current = ws ? space.id === ws.id : false;
    const missing = state.workspaceFolderAvailability[space.id] === false;
    return `
      <div class="space-row ${current ? 'current' : ''}">
        <button class="space-item" data-switch-space="${space.id}" title="${escapeHtml(space.name)} · ${escapeHtml(space.masterFolder)}${missing ? ' [Folder missing]' : ''}">
          <span class="space-badge ${missing ? 'missing' : ''}">${escapeHtml(space.name.charAt(0).toUpperCase() || '?')}</span>
          <span class="space-name">${escapeHtml(space.name)}</span>
          ${missing ? '<span class="space-missing-icon" title="Folder not found">△</span>' : ''}
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
        <span class="brand-text">senku</span>
      </div>

      <div class="sidebar-section-label">VIEWS</div>
      <nav class="nav-list">
        ${navItem('Home', '⌂', 'Home', 'H')}
        ${navItem('Log', '◎', 'My Log', 'L')}
        ${navItem('Launchpads', '▷', 'Launchpads', 'P')}
        ${navItem('Notes', '✎', 'Notes', 'N')}
      </nav>

      <div class="spaces-head">
        <span class="workspace-label">SPACES</span>
        <button class="mini-button" id="add-space" title="Add a Space" aria-label="Add a Space">＋</button>
      </div>
      <div class="space-list">${spacesContent}</div>
      ${state.trashWorkspaces && state.trashWorkspaces.length > 0 ? `
        <div class="space-trash-wrap">
          <button class="space-trash-btn" id="open-trash" title="Trash (${state.trashWorkspaces.length} deleted spaces)">
            <span>🗑 Trash</span>
            <span class="trash-count">${state.trashWorkspaces.length}</span>
          </button>
        </div>` : ''}
    </aside>`;
}

// ---------------------------------------------------------------------------
// Topbar (clean, minimalist utility header)
// ---------------------------------------------------------------------------

export function topbarMarkup(): string {
  const ws = state.workspace;
  const dateFormatted = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  const viewTitles: Record<string, string> = {
    Home: '⌂ Home',
    Notes: '✎ Notes',
    Launchpads: '▷ Launchpads',
    Log: '◎ Quiet Log',
  };
  const title = viewTitles[currentView] ?? currentView;

  const spacePill = ws
    ? `<span class="topbar-space-pill" title="Active Space: ${escapeHtml(ws.name)} (${escapeHtml(ws.masterFolder)})">
        <span class="space-dot">●</span>
        <span class="space-pill-label">Space:</span>
        <strong class="space-pill-name">${escapeHtml(ws.name)}</strong>
      </span>`
    : `<button class="topbar-space-pill empty-pill" id="topbar-create-space" title="Click to create your first Space">
        <span class="space-dot empty">○</span>
        <strong class="space-pill-name">+ Add Space</strong>
      </button>`;

  const userInitial = state.settings?.userName ? state.settings.userName.charAt(0).toUpperCase() : 'S';

  return `
    <header class="topbar">
      <div class="topbar-left">
        <span class="topbar-view-title">${title}</span>
        <span class="topbar-dot-sep">·</span>
        <span class="date-line">${dateFormatted}</span>
      </div>
      <div class="top-actions">
        ${spacePill}
        <button class="icon-button" id="refresh-button" title="Refresh">↻</button>
        <button class="avatar-button" id="profile-avatar-button" title="Profile &amp; Settings" aria-label="Profile and Settings">
          ${escapeHtml(userInitial)}
        </button>
      </div>
    </header>`;
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

export function fileListMarkup(): string {
  const { items, matched, total } = visibleEntries();
  if (total === 0) {
    return `<div class="empty-files">
        <p>This folder is empty</p>
        <small>Add files through Windows Explorer and refresh Senku.</small>
      </div>`;
  }
  if (matched === 0) {
    return `<div class="empty-files"><p>No match for "${escapeHtml(fileFilter)}"</p></div>`;
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
          <p>Create a Space and choose a project folder. Your files will show up here.</p>
          <button class="primary-button" id="create-space-files" style="max-width:220px; margin: 14px auto 0;">+ Create a Space <span>→</span></button>
        </div>
      </section>`;
  }

  const atRoot = isSamePath(state.currentPath, ws.masterFolder);
  const crumbs = pathCrumbs(ws.masterFolder, state.currentPath);
  const shown = crumbs.length > 3 ? crumbs.slice(-3) : crumbs;
  const breadcrumb =
    (crumbs.length > 3 ? '<span>/</span><span class="crumb-gap">…</span>' : '') +
    shown.map((c) => `<span>/</span><button data-breadcrumb="${escapeHtml(c.path)}">${escapeHtml(c.name)}</button>`).join('');

  return `
    <section class="files-panel">
      <div class="section-heading">
        <div><h2>Files and folders</h2></div>
        <div class="file-panel-actions">
          <button class="text-button" id="open-in-vscode" title="Open in VS Code">VS Code ↗</button>
          <button class="text-button" id="open-in-terminal" title="Open in Terminal">Terminal ↗</button>
          <button class="text-button" id="open-folder">Explorer ↗</button>
        </div>
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
// Shared time helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ---------------------------------------------------------------------------
// Home panel — dashboard
// ---------------------------------------------------------------------------

export function homePanelMarkup(): string {
  const ws = state.workspace;
  const greeting = renderGreeting(state.settings.greeting, state.settings.userName);
  const logEntries = getLogEntries();
  const logCount = state.logEntries?.length ?? 0;
  const launchpads = state.launchpads ?? [];
  const launchpadCount = launchpads.length;
  const noteCount = state.notes?.length ?? 0;
  const recentLogs = logEntries.slice(0, 5);

  const statCard = (icon: string, label: string, val: number | string, view: string, extraClass = '') => `
    <button class="home-stat-card ${extraClass}" data-view="${view}">
      <span class="home-stat-icon">${icon}</span>
      <div class="home-stat-body">
        <span class="home-stat-val">${val}</span>
        <span class="home-stat-label">${label}</span>
      </div>
    </button>`;

  const recentLogsHtml = recentLogs.length
    ? recentLogs.map((e) => `
        <div class="home-recent-log-item">
          <span class="home-log-seq">#${e.seq ?? '·'}</span>
          <span class="home-log-text">${escapeHtml(e.text)}</span>
          <span class="home-log-time">${formatRelativeTime(e.createdAt)}</span>
        </div>`).join('')
    : `<p class="home-log-empty">No entries logged yet. Type above to record what you just did.</p>`;

  const quickLaunchHtml = launchpads.length
    ? launchpads.slice(0, 3).map(launchpadCardMarkup).join('')
    : `<div class="home-lp-empty">
         <p>No launchpads yet.</p>
         <button class="secondary-button mini" data-view="Launchpads">+ Create a Launchpad</button>
       </div>`;

  return `
    <section class="home-panel-v3">
      <div class="home-hero">
        <h1 class="home-greeting">${greeting}</h1>
        <p class="home-sub">Your personal student workspace.</p>
      </div>

      <div class="home-capture-card">
        <span class="home-capture-icon">◎</span>
        <input
          id="home-capture-input"
          type="text"
          placeholder="Capture what you just did... (Hit Enter)"
          autocomplete="off"
          spellcheck="false"
          maxlength="500"
        />
        <button class="home-capture-btn" id="home-capture-submit">Log ↵</button>
      </div>

      <div class="home-stats-grid">
        ${statCard('▷', 'Launchpads', launchpadCount, 'Launchpads')}
        ${statCard('✎', 'Notes', noteCount, 'Notes')}
        ${statCard('◎', 'Log entries', logCount, 'Log')}
      </div>

      <div class="home-recent-deck">
        <div class="home-deck-header">
          <span class="home-section-label">RECENT LOG</span>
          <button class="home-deck-link" data-view="Log">See all →</button>
        </div>
        <div class="home-recent-logs">${recentLogsHtml}</div>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// The Quiet Log panel
// ---------------------------------------------------------------------------

function formatLogTime(ts: number): string {
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today · ${timeStr}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${timeStr}`;
}

export function logListMarkup(): string {
  const { items, matched, total } = visibleLogEntries();
  if (total === 0) {
    return `<div class="log-empty">
         <p>Nothing logged yet.</p>
         <small>Type what you just did in the box above. No pressure, just quick capture.</small>
       </div>`;
  }
  if (matched === 0) {
    return `<div class="log-empty"><p>No log entries matching "${escapeHtml(logFilter)}"</p></div>`;
  }

  const more = matched - items.length;
  return items.map((e: LogEntry) => `
      <div class="log-entry" data-id="${e.id}">
        <div class="log-entry-head">
          <span class="log-seq">#${e.seq ?? '·'}</span>
          <span class="log-time">${formatLogTime(e.createdAt)}</span>
          <button type="button" class="log-delete-btn" data-delete-log="${e.id}" title="Delete log #${e.seq ?? ''}">✕</button>
        </div>
        <p class="log-text">${escapeHtml(e.text)}</p>
      </div>`).join('') +
    (more > 0 ? `<button class="show-more" id="show-more-logs">Show ${Math.min(more, 40)} more · ${more} remaining</button>` : '');
}

export function logPanelMarkup(): string {
  const { matched, total } = visibleLogEntries();
  const countLabel = matched === total ? `${total} entries` : `${matched} of ${total}`;

  return `
    <section class="log-panel">
      <div class="section-heading">
        <div>
          <span class="section-kicker">QUIET LOG</span>
          <h2>Timeline</h2>
        </div>
        <span class="log-count-badge">${countLabel}</span>
      </div>
      <div class="log-input-row">
        <input
          id="log-compose-input"
          type="text"
          placeholder="What just happened? Type and hit Enter to log..."
          autocomplete="off"
          spellcheck="false"
          maxlength="500"
        />
        <input
          id="log-search"
          type="search"
          placeholder="Filter logs..."
          value="${escapeHtml(logFilter)}"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <div class="log-entries">${logListMarkup()}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Launchpads panel
// ---------------------------------------------------------------------------

function launchpadCardMarkup(lp: Launchpad): string {
  const pathChips = lp.paths.map(p => {
    const isUrl = /^https?:\/\//i.test(p);
    const label = isUrl
      ? (() => { try { return new URL(p).hostname; } catch { return p.slice(0, 30); } })()
      : folderName(p);
    const icon = isUrl ? '🌐' : '📁';
    const titleText = isUrl ? `Open website: ${p}` : `Open item: ${p}`;
    return `<button type="button" class="lp-path-chip interactive" data-open-item="${escapeHtml(p)}" title="${escapeHtml(titleText)}">${icon} <span>${escapeHtml(label)}</span> <span class="chip-arrow">↗</span></button>`;
  }).join('');

  return `
    <div class="launchpad-card">
      <div class="lp-card-head">
        <h3 class="lp-name">${escapeHtml(lp.name)}</h3>
        <div class="lp-card-actions">
          <button class="lp-launch-btn" data-launch-id="${lp.id}" title="Open all resources">▷ Launch All</button>
          <button class="lp-edit-btn" data-edit-lp="${lp.id}" title="Edit launchpad">✎ Edit</button>
          <button class="lp-delete-btn" data-delete-lp="${lp.id}" title="Delete launchpad">✕</button>
        </div>
      </div>
      <div class="lp-paths">${pathChips || '<span class="lp-empty-paths">No resources added yet</span>'}</div>
    </div>`;
}

export function launchpadsPanelMarkup(): string {
  const launchpads = state.launchpads ?? [];
  const content = launchpads.length
    ? launchpads.map(launchpadCardMarkup).join('')
    : `<div class="lp-empty-state">
         <p>No Launchpads yet.</p>
         <small>Create one to bundle files, folders, and URLs and open them all at once.</small>
       </div>`;

  return `
    <section class="launchpads-panel">
      <div class="section-heading">
        <div>
          <span class="section-kicker">LAUNCHPADS</span>
          <h2>Quick Launch</h2>
        </div>
        <button class="add-button" id="add-launchpad">+</button>
      </div>
      <div class="launchpads-list">${content}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Daily note panel (legacy Rough Note — now hidden behind Notes)
// ---------------------------------------------------------------------------

export function dailyNotePanelMarkup(): string {
  return `
    <section class="tasks-panel note-panel">
      <div class="section-heading">
        <div>
          <span class="section-kicker">ROUGH NOTE</span>
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
// Notes panel — full note manager
// ---------------------------------------------------------------------------

export function notesPanelMarkup(): string {
  const notes: NoteFile[] = state.notes ?? [];
  const active = notes.find((n) => n.id === activeNoteId) ?? notes[0] ?? null;

  const noteListItems = notes.map((n) => `
    <button class="notes-list-item ${active?.id === n.id ? 'active' : ''}" data-open-note="${n.id}">
      <span class="notes-item-name">${escapeHtml(n.name)}</span>
      <span class="notes-item-meta">${formatRelativeTime(n.updatedAt)}</span>
    </button>`).join('');

  const notesList = notes.length
    ? noteListItems
    : `<div class="notes-empty-list"><p>No notes yet.</p><small>Create one to start.</small></div>`;

  const editorArea = active ? `
    <div class="notes-editor-head">
      <span class="notes-editor-title">${escapeHtml(active.name)}</span>
      <div class="notes-editor-actions">
        <span class="note-save-status" id="note-save-status"></span>
        <button class="notes-action-btn" id="notes-export-btn" data-note-id="${active.id}" title="Export as .txt">↓ Export</button>
        <button class="notes-action-btn danger" id="notes-delete-btn" data-note-id="${active.id}" title="Delete note">✕</button>
      </div>
    </div>
    <textarea
      id="notes-editor"
      class="notes-textarea"
      data-note-id="${active.id}"
      placeholder="Start writing..."
      spellcheck="false"
    >${escapeHtml(active.content)}</textarea>
    <div class="notes-append-bar">
      <input
        id="notes-append-input"
        type="text"
        placeholder="Quick append — type and hit Enter to add a timestamped snippet"
        autocomplete="off"
        spellcheck="false"
        maxlength="500"
        data-note-id="${active.id}"
      />
    </div>` : `
    <div class="notes-editor-placeholder">
      <span>✎</span>
      <p>${notes.length ? 'Select a note to edit it.' : 'Create your first note.'}</p>
    </div>`;

  return `
    <section class="notes-panel">
      <div class="notes-sidebar">
        <div class="notes-sidebar-head">
          <span class="section-kicker">NOTES</span>
          <button class="add-button small" id="create-note-btn" title="New note">+</button>
        </div>
        <div class="notes-list">${notesList}</div>
      </div>
      <div class="notes-main">
        ${editorArea}
      </div>
    </section>`;
}
