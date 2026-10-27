import type { FileEntry } from '../../electron/types';
import { state, fileFilter, visibleEntries, isFilePaneCompact } from '../state';
import { escapeHtml, folderName, isSamePath, pathCrumbs } from '../utils';
import { uiIcon } from './icons';

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

export function fileKind(entry: FileEntry): string {
  if (entry.kind === 'folder') return 'folder';
  const ext = entry.extension.replace(/^\./, '').toLowerCase();
  return Object.keys(EXT_GROUPS).find((group) => EXT_GROUPS[group].includes(ext)) ?? 'file';
}

export function pathKind(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return Object.keys(EXT_GROUPS).find((group) => EXT_GROUPS[group].includes(ext)) ?? 'file';
}

export const iconSvg = (kind: string, size = 17): string =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[kind === 'pdf' ? 'doc' : kind] ?? ICONS.file}</svg>`;

export function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatFileSize(bytes?: number): string {
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
  const metaParts = sizeLabel;

  return `
    <div class="file-row ${entry.pinned ? 'pinned' : ''}" data-path="${escapeHtml(entry.path)}" data-kind="${entry.kind}">
      <button class="file-open" data-open-path="${escapeHtml(entry.path)}" data-kind="${entry.kind}">
        <span class="file-icon ${kind}">${iconSvg(kind)}</span>
        <div class="file-info-block">
          <span class="file-name">${escapeHtml(entry.name)}</span>
          ${metaParts ? `<span class="file-meta">${escapeHtml(metaParts)}</span>` : ''}
        </div>
      </button>
      <span class="file-actions">
        <button data-path="${escapeHtml(entry.path)}" ${pinAction}
          class="pin-button ${entry.pinned ? 'active' : ''}" aria-label="${entry.pinned ? 'Unpin' : 'Pin'}">${uiIcon('star', 12)}</button>
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
  if (!fileFilter.trim()) return total > 0 ? `${total} items` : '';
  return `${matched} of ${total}`;
}

export function filePanelMarkup(): string {
  const ws = state.workspace;
  if (!ws) {
    return `
      <section class="files-panel">
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
        <div class="file-top-bar">
          <div class="folder-path missing-warning">
            <span class="crumb-icon" style="color: var(--orange);">${uiIcon('alert', 14)}</span>
            <span class="crumb-name" style="color: var(--orange); font-weight: 700;">Folder missing</span>
          </div>
          <div class="file-panel-actions">
            <button class="file-action-btn primary" data-action="workspace-settings" title="Space settings">Settings</button>
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
  const shown = crumbs.length > 2 ? crumbs.slice(-2) : crumbs;
  const breadcrumb =
    (crumbs.length > 2 ? `<span class="crumb-sep">›</span><span class="crumb-gap">…</span>` : '') +
    shown.map((c) => `<span class="crumb-sep">›</span><button class="crumb-btn" data-breadcrumb="${escapeHtml(c.path)}" title="${escapeHtml(c.path)}">${escapeHtml(c.name)}</button>`).join('');

  return `
    <section class="files-panel">
      <div class="file-top-bar">
        <div class="folder-path">
          <button id="go-up" class="up-button" title="Up one folder (R)" aria-label="Up one folder" ${atRoot ? 'disabled' : ''}>
            ${uiIcon('arrowUp', 13)}
          </button>
          <div class="breadcrumbs-scroll">
            <button id="go-root" class="crumb-btn root-crumb" title="Go to ${escapeHtml(ws.name)} folder">
              <span class="crumb-icon">${uiIcon('folder', 13)}</span>
              <span class="crumb-name">${escapeHtml(folderName(ws.masterFolder))}</span>
            </button>
            ${breadcrumb}
          </div>
        </div>
        <div class="file-panel-actions">
          <button class="file-action-btn primary" id="open-folder" title="Open folder in File Explorer">
            ${uiIcon('folder', 13)}
          </button>
          <button class="file-action-btn" id="open-in-vscode" title="Open in VS Code">
            ${uiIcon('code', 13)}
          </button>
          <button class="file-action-btn" id="open-in-terminal" title="Open in Terminal">
            ${uiIcon('terminal', 13)}
          </button>
          <button class="file-action-btn ${isFilePaneCompact ? 'active' : ''}" id="toggle-file-pane-size" title="${isFilePaneCompact ? 'Expand file pane' : 'Compact file pane'}">
            ${uiIcon('sidebar', 13)}
          </button>
          <div class="file-search-expandable ${fileFilter ? 'open' : ''}" id="file-search-expandable">
            <button type="button" class="file-action-btn search-trigger-btn" id="file-search-trigger" title="Search files (/)">
              ${uiIcon('search', 13)}
            </button>
            <div class="file-search-input-wrap">
              <input id="file-filter" type="text" placeholder="Search… (Enter)" value="${escapeHtml(fileFilter)}" autocomplete="off" spellcheck="false" />
              <button type="button" id="file-search-clear" class="file-search-clear" title="Clear (Esc)">✕</button>
            </div>
          </div>
        </div>
      </div>
      <div class="file-list">${fileListMarkup()}</div>
    </section>`;
}
