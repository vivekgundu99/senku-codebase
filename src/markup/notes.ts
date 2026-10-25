import type { NoteFile } from '../../electron/types';
import {
  state,
  activeNoteId,
  noteFilter,
  collapsedBundles,
  activeNotePageIndex,
  isNoteAllPagesView,
  isNotePreviewMode,
  isNotesSidebarCollapsed,
} from '../state';
import { escapeHtml, parseNotePages } from '../utils';
import { uiIcon } from './icons';
import { marked } from 'marked';

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

  const pages = active ? parseNotePages(active.content) : [''];
  const currentPageIndex = Math.min(Math.max(0, activeNotePageIndex), Math.max(0, pages.length - 1));
  const currentContent = isNoteAllPagesView ? (active?.content ?? '') : (pages[currentPageIndex] ?? '');
  const previewHtml = isNotePreviewMode ? (marked.parse(currentContent, { gfm: true, breaks: true }) as string) : '';

  const editorArea = active
    ? `
    <div class="notes-editor-head">
      <div class="notes-title-wrap">
        <button type="button" class="notes-head-btn notes-sidebar-toggle-btn ${isNotesSidebarCollapsed ? 'active' : ''}" id="notes-sidebar-toggle-btn" title="${isNotesSidebarCollapsed ? 'Show folders and notes' : 'Hide folders and notes'}">
          ${uiIcon('sidebar', 13)}
        </button>
        <span class="notes-breadcrumb-root">Notes</span>
        ${active.bundle ? `<span class="notes-crumb-sep">/</span><span class="notes-bundle-tag">${escapeHtml(active.bundle)}</span>` : ''}
        <span class="notes-crumb-sep">/</span>
        <input
          id="notes-title-input"
          class="notes-title-header-input"
          data-note-id="${escapeHtml(active.id)}"
          value="${escapeHtml(active.name)}"
          placeholder="Untitled Note"
          maxlength="100"
          spellcheck="false"
          autocomplete="off"
          title="Click to rename"
        />
      </div>
      <div class="notes-editor-actions">
        <span class="note-save-status" id="note-save-status"></span>
        <button class="notes-action-btn ${isNotePreviewMode ? 'active' : ''}" id="notes-preview-toggle-btn" title="${isNotePreviewMode ? 'Edit Note' : 'Preview Markdown'}">
          ${uiIcon(isNotePreviewMode ? 'pen' : 'eye', 13)}
          <span>${isNotePreviewMode ? 'Edit' : 'Preview'}</span>
        </button>
        <button class="notes-action-btn vscode-btn" id="notes-vscode-btn" data-note-id="${escapeHtml(active.id)}" title="Open in VS Code">
          ${uiIcon('code', 13)}
          <span>Code</span>
        </button>
        <button class="notes-action-btn" id="notes-options-btn" data-note-id="${escapeHtml(active.id)}" title="Note options">
          ${uiIcon('dots', 13)}
        </button>
      </div>
    </div>
    <div class="notes-document-canvas">
      ${isNotePreviewMode
        ? `<div class="notes-markdown-preview" id="notes-markdown-preview">${previewHtml || '<p class="notes-preview-empty">Empty note page. Click Edit to start writing.</p>'}</div>`
        : `<textarea
            id="notes-editor"
            class="notes-editor-textarea"
            data-note-id="${escapeHtml(active.id)}"
            placeholder="${isNoteAllPagesView ? 'Start writing (all pages)...' : `Start writing on Page ${currentPageIndex + 1}...`}"
            spellcheck="false"
          >${escapeHtml(currentContent)}</textarea>`
      }
    </div>
    <div class="notes-pages-bar">
      <div class="notes-pages-nav">
        <button type="button" class="notes-page-nav-btn" id="notes-page-prev" title="Previous page (Alt+←)" ${currentPageIndex === 0 || isNoteAllPagesView ? 'disabled' : ''}>‹</button>
        <div class="notes-pages-list">
          ${pages.map((_, i) => `
            <button type="button" class="notes-page-circle ${!isNoteAllPagesView && i === currentPageIndex ? 'active' : ''}" data-page-index="${i}" title="Page ${i + 1}">
              ${i + 1}
            </button>
          `).join('')}
        </div>
        <button type="button" class="notes-page-nav-btn" id="notes-page-next" title="Next page (Alt+→)" ${currentPageIndex >= pages.length - 1 || isNoteAllPagesView ? 'disabled' : ''}>›</button>
        <button type="button" class="notes-page-add-btn" id="notes-page-add" title="Add clean page">+ Page</button>
      </div>
      <div class="notes-pages-actions">
        ${pages.length > 1 && !isNoteAllPagesView ? `
          <button type="button" class="notes-page-delete-btn" id="notes-page-delete" title="Delete current page">
            ${uiIcon('trash', 12)}
          </button>
        ` : ''}
        <button type="button" class="notes-pages-mode-btn ${isNoteAllPagesView ? 'active' : ''}" id="notes-toggle-all-view" title="${isNoteAllPagesView ? 'Switch to single page view' : 'View full note (all pages)'}">
          ${isNoteAllPagesView ? 'Page view' : 'All'}
        </button>
      </div>
    </div>`
    : `
    <div class="notes-editor-placeholder">
      <button type="button" class="notes-head-btn notes-sidebar-toggle-btn ${isNotesSidebarCollapsed ? 'active' : ''}" id="notes-sidebar-toggle-btn" title="${isNotesSidebarCollapsed ? 'Show folders and notes' : 'Hide folders and notes'}" style="position: absolute; top: 12px; left: 16px;">
        ${uiIcon('sidebar', 13)}
      </button>
      <div class="notes-placeholder-icon">${uiIcon('note', 34)}</div>
      <h3>${allNotes.length ? 'Select a note' : 'Distraction-free notes'}</h3>
      <p>${allNotes.length ? 'Choose a note from the list on the left to read or edit.' : 'Your notes are stored locally as pure Markdown. Write distraction-free or open in VS Code anytime.'}</p>
      <button class="primary-button notes-cta-btn" id="create-note-placeholder-btn">+ New Note</button>
    </div>`;

  return `
    <section class="notes-panel">
      <div class="notes-sidebar ${isNotesSidebarCollapsed ? 'collapsed' : ''}">
        <div class="notes-sidebar-head">
          <div class="notes-search-expandable ${noteFilter ? 'open' : ''}" id="notes-search-expandable">
            <button type="button" class="notes-head-btn" id="notes-search-trigger" title="Search notes" aria-label="Search notes">
              ${uiIcon('search', 13)}
            </button>
            <div class="notes-search-input-wrap">
              <input
                id="notes-search-input"
                type="search"
                placeholder="Search notes..."
                value="${escapeHtml(noteFilter)}"
                autocomplete="off"
                spellcheck="false"
              />
              <button type="button" id="notes-search-clear" class="notes-search-clear" title="Clear">✕</button>
            </div>
          </div>
          <div class="notes-sidebar-actions">
            <button class="notes-head-btn" id="create-bundle-btn" title="New folder" aria-label="New folder">${uiIcon('folder', 14)}</button>
            <button class="notes-head-btn primary" id="create-note-btn" title="New note" aria-label="New note">${uiIcon('plus', 14)}</button>
          </div>
        </div>
        <div class="notes-list">${notesListHtml}</div>
      </div>
      <div class="notes-main">
        ${editorArea}
      </div>
    </section>`;
}
