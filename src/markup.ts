import type { FileEntry, LogEntry, Launchpad } from '../electron/types';
import {
  state,
  currentView,
  dailyNote,
  fileFilter,
  visibleEntries,
  getLogEntries,
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
        <span>senku</span>
      </div>

      <div class="sidebar-section-label">VIEWS</div>
      <nav class="nav-list">
        ${navItem('Home', '⌂', 'Home', 'H')}
        ${navItem('Log', '◎', 'My Log', 'L')}
        ${navItem('Launchpads', '▷', 'Launchpads', 'P')}
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
// Home panel (V3: just file explorer + quick log teaser)
// ---------------------------------------------------------------------------

export function homePanelMarkup(): string {
  const ws = state.workspace;
  const logCount = state.logEntries?.length ?? 0;
  const launchpadCount = state.launchpads?.length ?? 0;

  return `
    <section class="home-panel-v3">
      <div class="home-welcome">
        <p class="home-welcome-sub">Your workspace. Ready when you are.</p>
        <div class="home-quick-actions">
          <button class="home-quick-btn" data-view="Launchpads">
            <span class="hq-icon">▷</span>
            <span class="hq-label">Launchpads</span>
            <span class="hq-count">${launchpadCount}</span>
          </button>
          <button class="home-quick-btn" data-view="Log">
            <span class="hq-icon">◎</span>
            <span class="hq-label">My Log</span>
            <span class="hq-count">${logCount}</span>
          </button>
          <button class="home-quick-btn" data-view="Note">
            <span class="hq-icon">✎</span>
            <span class="hq-label">Rough Note</span>
          </button>
        </div>
        ${!ws ? `<div class="home-no-space-hint">
          <p>No Space selected. <button class="inline-link" id="home-add-space">Create your first Space →</button></p>
        </div>` : ''}
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

export function logPanelMarkup(): string {
  const entries = getLogEntries();
  const entriesList = entries.length
    ? entries.map((e: LogEntry) => `
        <div class="log-entry">
          <span class="log-time">${formatLogTime(e.createdAt)}</span>
          <p class="log-text">${escapeHtml(e.text)}</p>
        </div>`).join('')
    : `<div class="log-empty">
         <p>Nothing logged yet.</p>
         <small>Use the bar below to capture what you just did. No pressure.</small>
       </div>`;

  return `
    <section class="log-panel">
      <div class="section-heading">
        <div>
          <span class="section-kicker">QUIET LOG</span>
          <h2>What happened</h2>
        </div>
        <span class="log-count-badge">${entries.length} entries</span>
      </div>
      <div class="log-entries">${entriesList}</div>
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
    return `<span class="lp-path-chip" title="${escapeHtml(p)}">${isUrl ? '🌐' : '📄'} ${escapeHtml(label)}</span>`;
  }).join('');

  return `
    <div class="launchpad-card">
      <div class="lp-card-head">
        <h3 class="lp-name">${escapeHtml(lp.name)}</h3>
        <div class="lp-card-actions">
          <button class="lp-launch-btn" data-launch-id="${lp.id}" title="Open all resources">▷ Launch</button>
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
// Daily note panel
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
