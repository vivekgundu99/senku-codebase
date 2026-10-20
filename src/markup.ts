import type { FileEntry, LogEntry, Launchpad, NoteFile } from '../electron/types';
import {
  state,
  currentView,
  fileFilter,
  visibleEntries,
  getLogEntries,
  logFilter,
  visibleLogEntries,
  getCachedPathAvailability,
  activeNoteId,
} from './state';
import { escapeHtml, folderName, isSamePath, pathCrumbs, renderGreeting } from './utils';

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function sidebarMarkup(): string {
  const ws = state.workspace;
  const isGlobal = currentView === 'Home' || currentView === 'AllLog';

  const subNavItem = (view: string, label: string) => `
    <button class="space-sub-item ${!isGlobal && currentView === view ? 'selected' : ''}" data-view="${view}">
      ${label}
    </button>`;

  const spaceRow = (space: (typeof state.workspaces)[number]) => {
    const isActive = ws ? space.id === ws.id : false;
    const missing = state.workspaceFolderAvailability[space.id] === false;

    if (isActive) {
      return `
        <div class="space-tree-group">
          <div class="space-row current ${isGlobal ? 'not-highlighted' : ''}">
            <button class="space-item" data-switch-space="${space.id}" title="${escapeHtml(space.name)} · ${escapeHtml(space.masterFolder)}${missing ? ' [Folder missing]' : ''}">
              <span class="space-chevron">▾</span>
              <span class="space-badge ${missing ? 'missing' : ''}">${escapeHtml(space.name.charAt(0).toUpperCase() || '?')}</span>
              <span class="space-name">${escapeHtml(space.name)}</span>
              ${missing ? '<span class="space-missing-icon" title="Folder not found">△</span>' : ''}
            </button>
            <button class="space-gear" id="workspace-settings" title="Space settings" aria-label="Space settings">⚙</button>
          </div>
          <div class="space-sub-nav">
            ${subNavItem('Overview', 'Overview')}
            ${subNavItem('Log', 'Log')}
            ${subNavItem('Launchpads', 'Launchpads')}
            ${subNavItem('Notes', 'Notes')}
          </div>
        </div>`;
    }

    return `
      <div class="space-row">
        <button class="space-item" data-switch-space="${space.id}" title="${escapeHtml(space.name)} · ${escapeHtml(space.masterFolder)}${missing ? ' [Folder missing]' : ''}">
          <span class="space-badge ${missing ? 'missing' : ''}">${escapeHtml(space.name.charAt(0).toUpperCase() || '?')}</span>
          <span class="space-name">${escapeHtml(space.name)}</span>
          ${missing ? '<span class="space-missing-icon" title="Folder not found">△</span>' : ''}
        </button>
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

      <div class="sidebar-home-item">
        <button class="nav-item ${isGlobal ? 'selected' : ''}" data-view="Home" title="Home (H)">
          <span class="nav-icon">⌂</span>
          <span class="nav-label">Home</span>
        </button>
      </div>

      <div class="spaces-head">
        <span class="workspace-label">SPACES</span>
        <button class="mini-button" id="add-space" title="Add a Space" aria-label="Add a Space">＋</button>
      </div>
      <div class="space-list">${spacesContent}</div>
      ${state.trashWorkspaces && state.trashWorkspaces.length > 0 ? `
        <div class="space-trash-wrap">
          <button class="space-trash-btn" id="open-trash" title="Trash (${state.trashWorkspaces.length} deleted spaces)">
            <span>Trash</span>
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
  const isSpaceView = currentView === 'Overview' || currentView === 'Log' || currentView === 'Launchpads' || currentView === 'Notes';
  const dateFormatted = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  const spacePill = isSpaceView && ws
    ? `<span class="topbar-space-pill" title="Active Space: ${escapeHtml(ws.name)} (${escapeHtml(ws.masterFolder)})">${escapeHtml(ws.name)}</span>`
    : '';

  const userInitial = state.settings?.userName ? state.settings.userName.charAt(0).toUpperCase() : 'S';

  return `
    <header class="topbar">
      <div class="topbar-left">
        <span class="date-line">${dateFormatted}</span>
      </div>
      <div class="top-actions">
        ${spacePill}
        <button class="icon-button" id="topbar-quicknote" title="Quick note (O)">✎</button>
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

function pathKind(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return Object.keys(EXT_GROUPS).find((group) => EXT_GROUPS[group].includes(ext)) ?? 'file';
}

const iconSvg = (kind: string, size = 17): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind === 'pdf' ? 'doc' : kind] ?? ICONS.file}</svg>`;

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function fileEntryMarkup(entry: FileEntry): string {
  const kind = fileKind(entry);
  const pinAction = entry.pinned
    ? `data-file-action="unpin" title="Unpin"`
    : `data-file-action="pin" title="Pin to top"`;

  const sizeLabel = entry.kind === 'file' ? formatFileSize(entry.size) : '';
  const timeLabel = entry.modifiedAt ? formatRelativeTime(new Date(entry.modifiedAt).getTime()) : '';
  const metaParts = [sizeLabel, timeLabel].filter(Boolean).join(' · ');

  return `
    <div class="file-row ${entry.pinned ? 'pinned' : ''}" data-path="${escapeHtml(entry.path)}" data-kind="${entry.kind}">
      <button class="file-open" data-open-path="${escapeHtml(entry.path)}" data-kind="${entry.kind}">
        <span class="file-icon ${kind}">${iconSvg(kind)}</span>
        <div class="file-info-block">
          <span class="file-name">${escapeHtml(entry.name)}</span>
          ${metaParts ? `<span class="file-meta">${escapeHtml(metaParts)}</span>` : ''}
        </div>
        ${entry.pinned ? '<span class="pinned-indicator">pinned</span>' : ''}
      </button>
      <span class="file-actions">
        <button data-file-action="code" data-path="${escapeHtml(entry.path)}" class="quick-code-btn" title="Open in VS Code">Code</button>
        <button data-path="${escapeHtml(entry.path)}" ${pinAction}
          class="pin-button ${entry.pinned ? 'active' : ''}" aria-label="${entry.pinned ? 'Unpin' : 'Pin'}">${entry.pinned ? '★' : '☆'}</button>
        <button data-file-action="copy" data-path="${escapeHtml(entry.path)}" title="Copy path">Copy</button>
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
          <div class="empty-unlinked-icon">${iconSvg('folder', 32)}</div>
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
// Overview panel — the current Space's home
// ---------------------------------------------------------------------------

export function overviewPanelMarkup(): string {
  const ws = state.workspace;
  const greeting = renderGreeting(state.settings.greeting, state.settings.userName);

  if (!ws) {
    return `
    <section class="home-panel-v3">
      <div class="home-hero">
        <h1 class="home-greeting">${greeting}</h1>
        <p style="margin-top: 16px; color: var(--text-muted, #767676);">Create a Space to begin.</p>
        <button class="primary-button" id="create-space-files" style="margin-top: 12px;">+ Create a Space</button>
      </div>
    </section>`;
  }

  const logEntries = getLogEntries();
  const launchpads = state.launchpads ?? [];
  const recentLogs = logEntries.slice(0, 5);

  const recentLogsHtml = recentLogs.length
    ? recentLogs.map((e) => `
        <div class="home-recent-log-item">
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

      <div class="home-decks-container">
        <div class="home-recent-deck">
          <div class="home-deck-header">
            <span class="home-section-label">RECENT LOG</span>
            <button class="home-deck-link" data-view="Log">All</button>
          </div>
          <div class="home-recent-logs">${recentLogsHtml}</div>
        </div>

        <div class="home-recent-deck home-lp-deck">
          <div class="home-deck-header">
            <span class="home-section-label">QUICK LAUNCHPADS</span>
            <button class="home-deck-link" data-view="Launchpads">All</button>
          </div>
          <div class="home-launchpads-wrap">${quickLaunchHtml}</div>
        </div>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Global Home panel
// ---------------------------------------------------------------------------

export function homePanelMarkup(): string {
  const ws = state.workspace;
  const greeting = renderGreeting(state.settings.greeting, state.settings.userName);

  if (!ws) {
    return `
      <section class="global-home-panel">
        <div class="home-hero">
          <h1 class="home-greeting">${greeting}</h1>
          <p style="margin-top: 16px; color: var(--text-muted, #767676);">Create a Space to begin.</p>
          <button class="primary-button" id="create-space-files" style="margin-top: 12px;">+ Create a Space</button>
        </div>
      </section>`;
  }

  const captureInput = `
    <div class="home-capture-card">
      <span class="home-capture-icon">◎</span>
      <input
        id="home-capture-input"
        type="text"
        placeholder="Log to ${escapeHtml(ws.name)}…"
        autocomplete="off"
        spellcheck="false"
        maxlength="500"
      />
      <button class="home-capture-btn" id="home-capture-submit">Log ↵</button>
    </div>`;

  const logs = state.home?.log ?? [];
  const logRows = logs.length > 0
    ? logs.map((e) => {
        const seqHtml = e.seq ? `<span class="home-log-seq">#${e.seq}</span>` : `<span class="home-log-seq"></span>`;
        const spacePart = e.spaceName ? escapeHtml(e.spaceName) : 'Space';
        const timePart = formatRelativeTime(e.createdAt);
        return `
          <div class="global-home-log-row">
            ${seqHtml}
            <span class="global-home-log-text">${escapeHtml(e.text)}</span>
            <span class="global-home-log-meta">${spacePart} · ${timePart}</span>
          </div>`;
      }).join('')
    : `<p class="home-empty-line">No recent entries across spaces.</p>`;

  const launchpads = state.home?.launchpads ?? [];
  const padRows = launchpads.length > 0
    ? launchpads.map((p) => {
        const starHtml = p.pinned ? `<span class="home-lp-star">★</span>` : '';
        const spacePart = p.spaceName ? escapeHtml(p.spaceName) : '';
        return `
          <div class="global-home-lp-row">
            <div class="global-home-lp-info">
              ${starHtml}
              <span class="global-home-lp-name">${escapeHtml(p.name)}</span>
              ${spacePart ? `<span class="global-home-lp-space">${spacePart}</span>` : ''}
            </div>
            <button class="text-button global-home-lp-launch" data-launch-home-id="${p.id}" data-space-id="${p.spaceId}">Launch</button>
          </div>`;
      }).join('')
    : `<p class="home-empty-line">Pin or launch a launchpad to see it here.</p>`;

  return `
    <section class="global-home-panel">
      <div class="home-hero">
        <h1 class="home-greeting">${greeting}</h1>
      </div>

      ${captureInput}

      <div class="global-home-section">
        <div class="global-home-section-head">
          <span class="home-section-label">RECENT LOG</span>
          <button class="home-deck-link" data-view="AllLog">All</button>
        </div>
        <div class="global-home-log-list">${logRows}</div>
      </div>

      <div class="global-home-section">
        <div class="global-home-section-head">
          <span class="home-section-label">LAUNCHPADS</span>
        </div>
        <div class="global-home-lp-list">${padRows}</div>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------------
// The Quiet Log panel
// ---------------------------------------------------------------------------

function formatDayHeader(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const dMidnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneDayMs = 24 * 60 * 60 * 1000;

  if (dMidnight === todayMidnight) return 'Today';
  if (dMidnight === todayMidnight - oneDayMs) return 'Yesterday';

  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatLogTimeOnly(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

  const groups: Array<{ dayKey: string; dayLabel: string; entries: LogEntry[] }> = [];
  let currentGroup: { dayKey: string; dayLabel: string; entries: LogEntry[] } | null = null;

  for (const entry of items) {
    const d = new Date(entry.createdAt);
    const dayKey = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!currentGroup || currentGroup.dayKey !== dayKey) {
      currentGroup = {
        dayKey,
        dayLabel: formatDayHeader(entry.createdAt),
        entries: [entry],
      };
      groups.push(currentGroup);
    } else {
      currentGroup.entries.push(entry);
    }
  }

  const groupsHtml = groups
    .map(
      (group) => `
      <div class="log-day-group">
        <div class="log-day-header">${escapeHtml(group.dayLabel)}</div>
        ${group.entries
          .map(
            (e) => `
          <div class="log-entry" data-id="${e.id}">
            <div class="log-entry-head">
              <span class="log-time">${formatLogTimeOnly(e.createdAt)}</span>
              <button type="button" class="log-delete-btn" data-delete-log="${e.id}" title="Delete log">✕</button>
            </div>
            <p class="log-text">${escapeHtml(e.text)}</p>
          </div>`,
          )
          .join('')}
      </div>`,
    )
    .join('');

  const more = matched - items.length;
  return groupsHtml + (more > 0 ? `<button class="show-more" id="show-more-logs">Show ${Math.min(more, 40)} more · ${more} remaining</button>` : '');
}

export function logPanelMarkup(): string {
  if (!state.workspace) {
    return `
    <section class="log-panel">
      <p style="margin-top: 24px; color: var(--text-muted, #767676);">Create a Space to begin.</p>
      <button class="primary-button" id="create-space-files" style="margin-top: 12px;">+ Create a Space</button>
    </section>`;
  }

  const { matched, total } = visibleLogEntries();
  const countLabel = matched === total ? `${total} entries` : `${matched} of ${total}`;

  return `
    <section class="log-panel">
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
        <span class="log-count-badge">${countLabel}</span>
      </div>
      <div class="log-entries">${logListMarkup()}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Launchpads panel
// ---------------------------------------------------------------------------

function launchpadCardMarkup(lp: Launchpad): string {
  const availability = getCachedPathAvailability();
  const pathChips = lp.paths.map(p => {
    const isUrl = /^https?:\/\//i.test(p);
    const label = isUrl
      ? (() => { try { return new URL(p).hostname; } catch { return p.slice(0, 30); } })()
      : folderName(p);
    const status = availability[p];
    const isMissing = !isUrl && status === 'missing';
    const isFolder = !isUrl && status === 'folder';

    let iconHtml = '';
    if (!isUrl) {
      const kind = isFolder ? 'folder' : pathKind(p);
      iconHtml = iconSvg(kind, 14);
    }

    const titleText = isMissing ? 'Missing' : (isUrl ? `Open website: ${p}` : `Open item: ${p}`);
    const chipClass = `lp-path-chip interactive${isMissing ? ' missing' : ''}`;
    return `<button type="button" class="${chipClass}" data-open-item="${escapeHtml(p)}" title="${escapeHtml(titleText)}">${iconHtml}<span>${escapeHtml(label)}</span><span class="chip-arrow">↗</span></button>`;
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
  if (!state.workspace) {
    return `
    <section class="launchpads-panel">
      <p style="margin-top: 24px; color: var(--text-muted, #767676);">Create a Space to begin.</p>
      <button class="primary-button" id="create-space-files" style="margin-top: 12px;">+ Create a Space</button>
    </section>`;
  }

  const launchpads = state.launchpads ?? [];
  const content = launchpads.length
    ? launchpads.map(launchpadCardMarkup).join('')
    : `<div class="lp-empty-state">
         <p>No Launchpads yet.</p>
         <small>Create one to bundle files, folders, and URLs and open them all at once.</small>
       </div>`;

  return `
    <section class="launchpads-panel">
      <div class="launchpads-top-row">
        <button class="add-button" id="add-launchpad" title="Add launchpad">+</button>
      </div>
      <div class="launchpads-list">${content}</div>
    </section>`;
}

// ---------------------------------------------------------------------------
// Notes panel — full note manager
// ---------------------------------------------------------------------------

export function notesPanelMarkup(): string {
  if (!state.workspace) {
    return `
    <section class="notes-panel">
      <div style="padding: 24px;">
        <p style="color: var(--text-muted, #767676);">Create a Space to begin.</p>
        <button class="primary-button" id="create-space-files" style="margin-top: 12px;">+ Create a Space</button>
      </div>
    </section>`;
  }

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
      <div class="notes-title-wrap">
        <input
          id="notes-title-input"
          class="notes-editor-title-input"
          data-note-id="${active.id}"
          value="${escapeHtml(active.name)}"
          placeholder="Note title..."
          maxlength="100"
          spellcheck="false"
          title="Click to rename note"
        />
      </div>
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
    ` : `
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
