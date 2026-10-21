import type { FileEntry, LogEntry, Launchpad, NoteFile } from '../electron/types';
import {
  state,
  currentView,
  fileFilter,
  visibleEntries,
  getLogEntries,
  logFilter,
  logDay,
  visibleLogEntries,
  getCachedPathAvailability,
  activeNoteId,
  noteFilter,
  collapsedBundles,
  homeLogDraft,
  logPageDraft,
} from './state';
import { escapeHtml, folderName, isSamePath, pathCrumbs, renderGreeting } from './utils';

// ---------------------------------------------------------------------------
// UI stroke icons: uniform geometric stroke icons across the application
// ---------------------------------------------------------------------------

const UI_ICONS: Record<string, string> = {
  home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6h-6v6H5a1 1 0 0 1-1-1z"/>',
  play: '<path d="M8 5.5l11 6.5-11 6.5z"/>',
  list: '<path d="M5 7h14M5 12h14M5 17h9"/>',
  note: '<path d="M6 4h8l4 4v12H6z"/><path d="M14 4v4h4M9 13h6M9 17h4"/>',
  pen: '<path d="M4 20l1-4L16 5a2 2 0 0 1 3 3L8 19z"/><path d="M14 7l3 3"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  star: '<path d="M12 4l2.4 5 5.4.7-4 3.8 1 5.4-4.8-2.6-4.8 2.6 1-5.4-4-3.8 5.4-.7z"/>',
  alert: '<path d="M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>',
  code: '<polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/>',
  folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  dots: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
};

export const uiIcon = (name: string, size = 16): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${UI_ICONS[name] ?? ''}</svg>`;

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function sidebarMarkup(): string {
  const ws = state.workspace;

  // Spaces arranged in alphabetical order
  const sortedWorkspaces = [...(state.workspaces ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  const spaceRow = (space: (typeof state.workspaces)[number]) => {
    const isActive = ws ? space.id === ws.id : false;
    const missing = state.workspaceFolderAvailability[space.id] === false;

    return `
      <div class="space-row ${isActive ? 'current' : ''}">
        <button class="space-item" data-switch-space="${space.id}" title="${escapeHtml(space.name)} · ${escapeHtml(space.masterFolder)}${missing ? ' [Folder missing]' : ''}">
          <span class="space-badge ${missing ? 'missing' : ''}">${escapeHtml(space.name.charAt(0).toUpperCase() || '?')}</span>
          <span class="space-name">${escapeHtml(space.name)}</span>
          ${missing ? `<span class="space-missing-icon" title="Folder not found">${uiIcon('alert', 12)}</span>` : ''}
        </button>
        ${isActive ? `<button class="space-gear" id="workspace-settings" title="Space settings" aria-label="Space settings">${uiIcon('gear', 13)}</button>` : ''}
      </div>`;
  };

  const spacesContent = sortedWorkspaces.length > 0
    ? sortedWorkspaces.map(spaceRow).join('')
    : `<div class="empty-spaces-box">
         <span class="empty-spaces-text">No Spaces yet</span>
       </div>`;

  return `
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">S</span>
        <span class="brand-text">senku</span>
      </div>

      <div class="nav-list">
        <button class="nav-item ${currentView === 'Home' || currentView === 'Overview' ? 'selected' : ''}" data-view="Home" title="Home (H)">
          <span class="nav-icon">${uiIcon('home', 15)}</span>
          <span class="nav-label">Home</span>
          <span class="nav-key">H</span>
        </button>
        <button class="nav-item ${currentView === 'Launchpads' ? 'selected' : ''}" data-view="Launchpads" title="Launchpads (L)">
          <span class="nav-icon">${uiIcon('play', 15)}</span>
          <span class="nav-label">Launchpads</span>
          <span class="nav-key">L</span>
        </button>
        <button class="nav-item ${currentView === 'Log' || currentView === 'AllLog' ? 'selected' : ''}" data-view="Log" title="Logs (G)">
          <span class="nav-icon">${uiIcon('list', 15)}</span>
          <span class="nav-label">Logs</span>
          <span class="nav-key">G</span>
        </button>
        <button class="nav-item ${currentView === 'Notes' ? 'selected' : ''}" data-view="Notes" title="Notes (N)">
          <span class="nav-icon">${uiIcon('note', 15)}</span>
          <span class="nav-label">Notes</span>
          <span class="nav-key">N</span>
        </button>
      </div>

      <div class="spaces-head">
        <span class="workspace-label">SPACES</span>
        <button class="mini-button" id="add-space" title="Add a Space" aria-label="Add a Space">${uiIcon('plus', 13)}</button>
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

  const spacePill = ws
    ? `<button class="topbar-space-pill" id="topbar-space-pill" data-action="workspace-settings" title="Active Space: ${escapeHtml(ws.name)} (${escapeHtml(ws.masterFolder)})">
        <span class="topbar-space-name">${escapeHtml(ws.name)}</span>
      </button>`
    : '';

  const hasUserName = Boolean(state.settings?.userName?.trim());
  const avatarContent = hasUserName
    ? escapeHtml(state.settings.userName.trim().charAt(0).toUpperCase())
    : uiIcon('gear', 14);

  return `
    <header class="topbar">
      <div class="topbar-left">
        <span class="date-line">${dateFormatted}</span>
      </div>
      <div class="top-actions">
        ${spacePill}
        <button class="icon-button" id="topbar-quicknote" title="Quick note (O)">${uiIcon('pen', 14)}</button>
        <button class="icon-button" id="refresh-button" title="Refresh">${uiIcon('refresh', 14)}</button>
        <button class="avatar-button${hasUserName ? '' : ' icon-avatar'}" id="profile-avatar-button" title="Profile &amp; Settings" aria-label="Profile and Settings">
          ${avatarContent}
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
          class="pin-button ${entry.pinned ? 'active' : ''}" aria-label="${entry.pinned ? 'Unpin' : 'Pin'}">${uiIcon('star', 12)}</button>
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
  if (!fileFilter.trim()) return '';
  return `${matched} of ${total}`;
}

export function filePanelMarkup(): string {
  const ws = state.workspace;
  if (!ws) {
    return `
      <section class="files-panel">
        <div class="section-heading">
          <div><h2>Files</h2></div>
        </div>
        <div class="empty-files-unlinked">
          <div class="empty-unlinked-icon">${iconSvg('folder', 32)}</div>
          <h3>No folder linked</h3>
          <p>Create a Space to link a folder. Your project files will show up here.</p>
        </div>
      </section>`;
  }

  if (state.workspaceFolderAvailability[ws.id] === false) {
    return `
      <section class="files-panel">
        <div class="section-heading">
          <div><h2>Files</h2></div>
          <div class="file-panel-actions">
            <button class="text-button" data-action="workspace-settings" title="Space settings">Settings</button>
          </div>
        </div>
        <div class="empty-files-unlinked">
          <div class="empty-unlinked-icon" style="color: var(--orange);">${uiIcon('alert', 32)}</div>
          <h3>Folder not found</h3>
          <p>The folder linked to <strong>${escapeHtml(ws.name)}</strong> no longer exists at:</p>
          <code class="missing-path-display">${escapeHtml(ws.masterFolder)}</code>
          <div style="margin-top: 14px;">
            <button class="primary-button mini" data-action="workspace-settings">Update Space Folder</button>
          </div>
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
        <div><h2>Files</h2></div>
        <div class="file-panel-actions">
          <button class="text-button" id="open-in-vscode" title="Open in VS Code">Code</button>
          <button class="text-button" id="open-in-terminal" title="Open in Terminal">Terminal</button>
          <button class="text-button" id="open-folder" title="Open File Explorer">Explorer</button>
        </div>
      </div>
      <div class="folder-path">
        <button id="go-up" class="up-button" title="Up one folder (R)" aria-label="Up one folder" ${atRoot ? 'disabled' : ''}>↑</button>
        <button id="go-root" title="Go to main folder">${escapeHtml(folderName(ws.masterFolder))}</button>
        ${breadcrumb}
      </div>
      <div class="file-tools">
        <input id="file-filter" type="search" placeholder="Search" value="${escapeHtml(fileFilter)}" autocomplete="off" spellcheck="false" />
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
        <p class="home-hero-subtitle">Link a project folder to log progress, launch resources, and track files.</p>
        <button class="primary-button" id="create-space-files">+ Create a Space</button>
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
        <span class="home-capture-icon">${uiIcon('pen', 14)}</span>
        <textarea
          id="home-capture-textarea"
          class="home-capture-input"
          placeholder="Log what you did…"
          spellcheck="false"
          rows="1"
        >${escapeHtml(homeLogDraft)}</textarea>
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

export function logListMarkup(scope: 'space' | 'all' = 'space'): string {
  const { items, matched, total } = visibleLogEntries(scope);
  if (total === 0) {
    return `<div class="log-empty">
         <p>${scope === 'all' ? 'No entries across spaces.' : 'Nothing logged yet.'}</p>
         ${scope === 'space' ? '<small>Type what you just did in the box above. No pressure, just quick capture.</small>' : ''}
       </div>`;
  }
  if (matched === 0) {
    return `<div class="log-empty"><p>No log entries matching current filters.</p></div>`;
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
        <div class="log-day-entries">
          ${group.entries
          .map(
            (e) => {
              const seqLabel = e.seq && e.seq > 0 ? `#${e.seq}` : '';
              const spaceBadge = scope === 'all' && e.spaceName
                ? `<span class="log-row-space">${escapeHtml(e.spaceName)}</span>`
                : '';
              return `
                  <div class="log-row-compact${e.text.includes('\n') ? ' multi' : ''}" data-id="${e.id}" data-space-id="${e.spaceId || ''}">
                    <span class="log-row-seq">${seqLabel}</span>
                    <span class="log-row-time">${formatLogTimeOnly(e.createdAt)}</span>
                    <span class="log-row-text" title="Double click to edit">${escapeHtml(e.text)}</span>
                    ${spaceBadge}
                    <button type="button" class="log-row-del-btn" data-delete-log="${e.id}" data-space-id="${e.spaceId || ''}" title="Delete log">${uiIcon('x', 11)}</button>
                  </div>`;
            },
          )
          .join('')}
        </div>
      </div>`,
    )
    .join('');

  const more = matched - items.length;
  return groupsHtml + (more > 0 ? `<button class="show-more" id="show-more-logs">Show ${Math.min(more, 40)} more · ${more} remaining</button>` : '');
}

export function logPanelMarkup(scope: 'space' | 'all' = 'space'): string {
  if (scope === 'space' && !state.workspace) {
    return `
    <section class="log-panel">
      <p style="margin-top: 24px; color: var(--text-muted, #767676);">Create a Space to begin.</p>
      <button class="primary-button" id="create-space-files" style="margin-top: 12px;">+ Create a Space</button>
    </section>`;
  }

  const { matched, total } = visibleLogEntries(scope);
  const countLabel = logFilter.trim() || logDay ? `${matched} of ${total}` : '';

  const composeBoxHtml = scope === 'space'
    ? `
      <div class="log-compose-box">
        <div class="log-compose-box-head">
          ${logPageDraft.trim() ? '<span class="draft-indicator">Draft saved</span>' : ''}
        </div>
        <textarea
          id="log-compose-textarea"
          class="log-compose-textarea"
          placeholder="Log what you did…   Enter to save · Shift+Enter for a new line"
          spellcheck="false"
          rows="2"
        >${escapeHtml(logPageDraft)}</textarea>
        <div class="log-compose-box-foot">
          <button class="primary-button mini" id="log-compose-submit" title="Add log (Enter)">+ Add Log</button>
        </div>
      </div>`
    : '';

  return `
    <section class="log-panel" data-scope="${scope}">
      <div class="log-top-bar">
        <div class="log-scope-nav">
          <button class="log-scope-btn ${scope === 'space' ? 'active' : ''}" data-log-scope="space" title="Space Logs">
            <span>Local</span>
          </button>
          <button class="log-scope-btn ${scope === 'all' ? 'active' : ''}" data-log-scope="all" title="View Full Global Logs">
            <span>Global</span>
          </button>
        </div>
        <div class="log-tools-right">
          <input
            id="log-search"
            class="log-search-small"
            type="search"
            placeholder="Search"
            value="${escapeHtml(logFilter)}"
            autocomplete="off"
            spellcheck="false"
          />
          <div class="log-date-wrap">
            <input type="date" id="log-day" value="${escapeHtml(logDay)}" class="log-date-picker" title="Filter by date" />
            <button id="clear-log-day" class="log-clear-day-btn" title="Clear date filter" style="${logDay ? '' : 'display:none;'}">${uiIcon('x', 11)}</button>
          </div>
          <span class="log-count-badge">${countLabel}</span>
        </div>
      </div>
      ${composeBoxHtml}
      <div class="log-entries">${logListMarkup(scope)}</div>
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
          <button class="lp-pin-btn ${lp.pinned ? 'active' : ''}" data-pin-lp="${lp.id}" data-pinned="${Boolean(lp.pinned)}" title="${lp.pinned ? 'Unpin' : 'Pin to Home'}">${uiIcon('star', 12)}</button>
          <button class="lp-launch-btn" data-launch-id="${lp.id}" title="Open all resources">${uiIcon('play', 11)} Launch</button>
          <button class="lp-edit-btn" data-edit-lp="${lp.id}" title="Edit launchpad">${uiIcon('pen', 11)}</button>
          <button class="lp-delete-btn" data-delete-lp="${lp.id}" title="Delete launchpad">${uiIcon('x', 11)}</button>
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
// Notes panel — distraction-free markdown note manager
// ---------------------------------------------------------------------------

export function notesPanelMarkup(): string {
  const allNotes: NoteFile[] = state.notes ?? [];
  const bundles: string[] = state.bundles ?? [];
  const q = noteFilter.trim().toLowerCase();

  // Filter notes if search query is active
  const notes = q
    ? allNotes.filter(
        (n) => n.name.toLowerCase().includes(q) || (n.bundle && n.bundle.toLowerCase().includes(q)),
      )
    : allNotes;

  const active = allNotes.find((n) => n.id === activeNoteId) ?? (allNotes.length > 0 ? allNotes[0] : null);

  // Group into bundles and loose notes
  const bundledMap = new Map<string, NoteFile[]>();
  for (const b of bundles) {
    bundledMap.set(b, []);
  }
  const looseNotes: NoteFile[] = [];
  for (const n of notes) {
    if (n.bundle) {
      if (!bundledMap.has(n.bundle)) {
        bundledMap.set(n.bundle, []);
      }
      bundledMap.get(n.bundle)!.push(n);
    } else {
      looseNotes.push(n);
    }
  }

  // Render bundles
  let bundlesHtml = '';
  for (const [bundleName, bNotes] of bundledMap.entries()) {
    if (q && bNotes.length === 0 && !bundleName.toLowerCase().includes(q)) {
      continue;
    }
    const isCollapsed = collapsedBundles.has(bundleName) && !q;
    const notesInside = bNotes
      .map(
        (n) => `
      <button class="notes-list-item in-bundle ${active?.id === n.id ? 'active' : ''}" data-open-note="${escapeHtml(n.id)}" title="${escapeHtml(n.name)}">
        <span class="notes-item-title">${escapeHtml(n.name)}</span>
      </button>`,
      )
      .join('');

    bundlesHtml += `
      <div class="bundle-group ${isCollapsed ? 'collapsed' : ''}" data-bundle="${escapeHtml(bundleName)}">
        <div class="bundle-header">
          <button class="bundle-toggle" data-toggle-bundle="${escapeHtml(bundleName)}" title="Toggle folder">
            <span class="bundle-chevron">${isCollapsed ? '›' : '▾'}</span>
            <span class="bundle-icon">${uiIcon('folder', 13)}</span>
            <span class="bundle-name">${escapeHtml(bundleName)}</span>
            <span class="bundle-count">${bNotes.length}</span>
          </button>
          <div class="bundle-actions">
            <button class="bundle-action-btn" data-add-to-bundle="${escapeHtml(bundleName)}" title="New note in folder" aria-label="Add note to folder">${uiIcon('plus', 11)}</button>
            <button class="bundle-action-btn" data-bundle-menu="${escapeHtml(bundleName)}" title="Folder options" aria-label="Folder options">${uiIcon('dots', 13)}</button>
          </div>
        </div>
        ${!isCollapsed ? `<div class="bundle-notes-list">${notesInside || '<div class="bundle-empty">Empty folder</div>'}</div>` : ''}
      </div>`;
  }

  const looseNotesHtml = looseNotes
    .map(
      (n) => `
    <button class="notes-list-item ${active?.id === n.id ? 'active' : ''}" data-open-note="${escapeHtml(n.id)}" title="${escapeHtml(n.name)}">
      <span class="notes-item-title">${escapeHtml(n.name)}</span>
    </button>`,
    )
    .join('');

  let notesListHtml = '';
  if (allNotes.length === 0 && bundles.length === 0) {
    notesListHtml = `
      <div class="notes-empty-list">
        <p>No notes yet</p>
        <small>Click + to create one.</small>
      </div>`;
  } else if (q && notes.length === 0) {
    notesListHtml = `
      <div class="notes-search-empty">
        <p>No matching notes</p>
        <small>Try another search term.</small>
      </div>`;
  } else {
    notesListHtml = `
      ${bundlesHtml}
      ${looseNotes.length > 0 && bundles.length > 0 ? '<div class="notes-section-divider">LOOSE NOTES</div>' : ''}
      ${looseNotesHtml}`;
  }

  const editorArea = active
    ? `
    <div class="notes-editor-head">
      <div class="notes-title-wrap">
        <span class="notes-breadcrumb-root">Notes</span>
        ${active.bundle ? `<span class="notes-crumb-sep">/</span><span class="notes-bundle-tag">${escapeHtml(active.bundle)}</span>` : ''}
      </div>
      <div class="notes-editor-actions">
        <span class="note-save-status" id="note-save-status"></span>
        <button class="notes-action-btn vscode-btn" id="notes-vscode-btn" data-note-id="${escapeHtml(active.id)}" title="Open in VS Code">
          ${uiIcon('code', 13)}
          <span>Code</span>
        </button>
        <button class="notes-action-btn" id="notes-export-btn" data-note-id="${escapeHtml(active.id)}" title="Export as markdown">
          Export
        </button>
        <button class="notes-action-btn danger" id="notes-delete-btn" data-note-id="${escapeHtml(active.id)}" title="Delete note">
          ${uiIcon('x', 13)}
        </button>
      </div>
    </div>
    <div class="notes-document-canvas">
      <input
        id="notes-title-input"
        class="notes-title-input"
        data-note-id="${escapeHtml(active.id)}"
        value="${escapeHtml(active.name)}"
        placeholder="Untitled Note"
        maxlength="100"
        spellcheck="false"
        autocomplete="off"
        title="Click to rename"
      />
      <textarea
        id="notes-editor"
        class="notes-editor-textarea"
        data-note-id="${escapeHtml(active.id)}"
        placeholder="Start writing markdown..."
        spellcheck="false"
      >${escapeHtml(active.content)}</textarea>
    </div>`
    : `
    <div class="notes-editor-placeholder">
      <div class="notes-placeholder-icon">${uiIcon('note', 34)}</div>
      <h3>${allNotes.length ? 'Select a note' : 'Distraction-free notes'}</h3>
      <p>${allNotes.length ? 'Choose a note from the list on the left to read or edit.' : 'Your notes are stored locally as pure Markdown. Write distraction-free or open in VS Code anytime.'}</p>
      <button class="primary-button notes-cta-btn" id="create-note-placeholder-btn">+ New Note</button>
    </div>`;

  return `
    <section class="notes-panel">
      <div class="notes-sidebar">
        <div class="notes-sidebar-head">
          <span class="notes-sidebar-title">Notes</span>
          <div class="notes-sidebar-actions">
            <button class="notes-head-btn" id="create-bundle-btn" title="New folder" aria-label="New folder">${uiIcon('folder', 14)}</button>
            <button class="notes-head-btn primary" id="create-note-btn" title="New note" aria-label="New note">${uiIcon('plus', 14)}</button>
          </div>
        </div>
        <div class="notes-search-wrap">
          <span class="notes-search-icon">${uiIcon('search', 12)}</span>
          <input
            id="notes-search-input"
            type="search"
            placeholder="Search notes..."
            value="${escapeHtml(noteFilter)}"
            autocomplete="off"
            spellcheck="false"
          />
        </div>
        <div class="notes-list">${notesListHtml}</div>
      </div>
      <div class="notes-main">
        ${editorArea}
      </div>
    </section>`;
}
