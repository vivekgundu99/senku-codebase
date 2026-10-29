import {
  state,
  getLogEntries,
  homeLogDraft,
  homeCenterMode,
  activeMarkdownFile,
  isNotePreviewMode,
  isGlobalNotesMode,
} from '../state';
import { escapeHtml, renderGreeting } from '../utils';
import { uiIcon } from './icons';
import { formatRelativeTime } from './files';
import { marked } from 'marked';

export function overviewPanelMarkup(): string {
  if (homeCenterMode === 'preview') {
    return simpleMdPreviewMarkup();
  }
  if (homeCenterMode === 'notes') {
    return notesWindowMarkup();
  }

  const ws = state.workspace;
  const greeting = renderGreeting(state.settings.greeting, state.settings.userName);

  if (!ws) {
    return `
    <section class="home-panel-v3">
      <div class="home-hero">
        <h1 class="home-greeting">${greeting}</h1>
        <p class="home-hero-subtitle">Link a project folder to log progress and track files.</p>
        <button class="primary-button" id="create-space-files">+ Create a Space</button>
      </div>
    </section>`;
  }

  return homePanelV3Markup();
}

export function simpleMdPreviewMarkup(): string {
  const file = activeMarkdownFile;
  if (!file) {
    return homePanelV3Markup();
  }

  const previewHtml = file.content.trim()
    ? (marked.parse(file.content, { gfm: true, breaks: true }) as string)
    : '<p class="notes-preview-empty">Empty markdown file.</p>';

  return `
    <section class="simple-md-preview-panel">
      <div class="simple-md-header">
        <div class="simple-md-header-left">
          <span class="simple-md-file-icon">${uiIcon('note', 14)}</span>
          <span class="simple-md-file-name" title="${escapeHtml(file.path)}">${escapeHtml(file.name)}</span>
        </div>
        <div class="simple-md-header-right">
          <button type="button" class="simple-md-open-btn" id="simple-md-open-default" title="Open in default app" data-file-path="${escapeHtml(file.path)}">
            <span class="simple-md-btn-icon">${uiIcon('external', 12)}</span>
            <span>Open</span>
          </button>
          <button type="button" class="simple-md-close-btn" id="simple-md-close-preview" title="Close preview (Esc)" aria-label="Close preview">
            ✕
          </button>
        </div>
      </div>
      <div class="simple-md-body">
        <div class="simple-md-scroll markdown-body">
          ${previewHtml}
        </div>
      </div>
    </section>
  `;
}

export function homePanelV3Markup(): string {
  const logEntries = getLogEntries();
  const recentLogs = logEntries.slice(0, 8);

  const recentLogsHtml = recentLogs.length
    ? recentLogs.map((e) => `
        <div class="home-recent-log-item">
          <span class="home-log-text">${escapeHtml(e.text.replace(/^\[[^\]]+\]\s*/, ''))}</span>
          <span class="home-log-time">${formatRelativeTime(e.createdAt)}</span>
        </div>`).join('')
    : `<p class="home-log-empty">No entries logged yet. Type above to record what you just did.</p>`;

  return `
    <section class="home-panel-v3">
      <div class="home-top-bar">
        <span class="home-top-bar-title">Overview</span>
      </div>
      <div class="home-decks-container">
        <!-- Log Station (Input + Feed) -->
        <div class="home-recent-deck home-log-station">
          <div class="home-deck-header">
            <span class="home-section-label">RECENT LOG</span>
            <button class="home-deck-link" data-view="Log">All</button>
          </div>
          <div class="home-capture-card">
            <span class="home-capture-icon">${uiIcon('pen', 13)}</span>
            <textarea
              id="home-capture-textarea"
              class="home-capture-input"
              placeholder="Log what you did… (Enter to save)"
              spellcheck="false"
              rows="1"
            >${escapeHtml(homeLogDraft)}</textarea>
          </div>
          <div class="home-recent-logs">${recentLogsHtml}</div>
        </div>
      </div>
    </section>`;
}

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
    </section>`;
}

export function notesWindowMarkup(): string {
  let file = activeMarkdownFile;
  if (!isGlobalNotesMode && file) {
    const wsFolder = state.workspace?.masterFolder;
    if (!wsFolder || !file.path.toLowerCase().startsWith(wsFolder.toLowerCase())) {
      file = null;
    }
  }
  const isPreview = isNotePreviewMode;

  const headerPill = `
    <div class="home-center-header">
      <div class="notes-header-file-title">
        ${file ? `
          <span class="notes-window-file-icon">${uiIcon('note', 13)}</span>
          <span class="notes-window-file-name" id="notes-file-title" title="Double-click or press F2 to rename (${escapeHtml(file.name)})">${escapeHtml(file.name)}</span>
        ` : ''}
      </div>
      <div class="notes-window-actions">
        ${file ? `
          <span class="notes-window-save-status" id="notes-file-save-status"></span>
          <button type="button" class="notes-window-action-btn ${isPreview ? 'active' : ''}" id="toggle-note-preview-mode" title="${isPreview ? 'Switch to Edit' : 'Switch to Preview'}">
            ${uiIcon(isPreview ? 'pen' : 'eye', 11)} <span>${isPreview ? 'Edit' : 'Preview'}</span>
          </button>
          <button type="button" class="notes-window-action-btn" id="open-note-in-default" title="Open in default application">
            ${uiIcon('external', 11)} <span>Open</span>
          </button>
          ${file.name.toLowerCase() !== 'senku.md' ? `
            <button type="button" class="notes-window-action-btn danger-hover icon-only" id="delete-note-file" title="Delete ${escapeHtml(file.name)}">
              ${uiIcon('trash', 12)}
            </button>
          ` : ''}
        ` : ''}
      </div>
    </div>`;

  if (!file) {
    return `
      <section class="notes-window-panel">
        ${headerPill}
        <div class="notes-window-empty">
          <div class="notes-empty-icon">${uiIcon('note', 32)}</div>
          <h3 class="notes-empty-title">Notes Window</h3>
          <p class="notes-empty-sub">No file is selected for preview. Select a markdown to show here.</p>
          <button type="button" class="primary-button mini" id="new-note-in-folder">+ New Note</button>
        </div>
      </section>
    `;
  }

  const content = file.content || '';
  const hasVisibleContent = content.trim().length > 0;
  const previewHtml = isPreview && hasVisibleContent ? (marked.parse(content, { gfm: true, breaks: true }) as string) : '';

  return `
    <section class="notes-window-panel">
      ${headerPill}
      <div class="notes-window-body">

        ${isPreview ? `
          <div class="notes-preview-scroll">
            <div class="notes-markdown-preview markdown-body">${previewHtml || '<p class="notes-preview-empty" id="notes-preview-empty-click" title="Click to start writing">Empty note. Click Edit to start writing.</p>'}</div>
          </div>
        ` : `
          <textarea
            id="notes-file-editor"
            class="notes-window-editor"
            placeholder="Start writing markdown…"
            data-file-path="${escapeHtml(file.path)}"
            spellcheck="false"
          >${escapeHtml(content)}</textarea>
        `}
      </div>
    </section>
  `;
}
