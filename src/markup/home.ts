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
  const ws = state.workspace;
  const objective = ws?.activeObjective || '';
  const links = ws?.pinnedLinks || [];
  const inbox = state.inboxItems || [];
  const logEntries = getLogEntries();

  // 1. Objective Card
  const objectiveCard = `
    <div class="reborn-card reborn-objective-card">
      <div class="reborn-card-header">
        <div class="reborn-header-title">
          <span class="reborn-card-icon objective-icon">${uiIcon('target', 14)}</span>
          <span class="reborn-card-label">CURRENT OBJECTIVE</span>
        </div>
        ${objective ? `
          <button type="button" class="reborn-action-btn complete-btn" id="complete-objective-btn" title="Mark objective complete and log milestone">
            ${uiIcon('check', 12)} <span>Done</span>
          </button>
        ` : ''}
      </div>
      <div class="reborn-objective-body">
        <input
          type="text"
          id="reborn-objective-input"
          class="reborn-objective-input"
          placeholder="What is the single thing you are working on right now? (Enter to lock in)"
          value="${escapeHtml(objective)}"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
    </div>
  `;

  // 2. Launchpad & Resources
  const linksHtml = links.map((l) => `
    <div class="reborn-launchpad-item link-item" title="${escapeHtml(l.url)}">
      <a class="launchpad-link-anchor" href="${escapeHtml(l.url)}" data-launch-url="${escapeHtml(l.url)}">
        <span class="link-icon">${uiIcon('link', 12)}</span>
        <span class="link-label">${escapeHtml(l.title)}</span>
      </a>
      <button type="button" class="launchpad-item-remove" data-remove-link="${l.id}" title="Remove link">✕</button>
    </div>
  `).join('');

  const launchpadCard = `
    <div class="reborn-card reborn-launchpad-card">
      <div class="reborn-card-header">
        <div class="reborn-header-title">
          <span class="reborn-card-icon launch-icon">${uiIcon('play', 13)}</span>
          <span class="reborn-card-label">LAUNCHPAD &amp; RESOURCES</span>
        </div>
        <button type="button" class="reborn-mini-btn" id="add-space-link-btn" title="Add web link or resource">+ Link</button>
      </div>
      <div class="reborn-launchpad-grid">
        <button type="button" class="reborn-launchpad-item folder-item" id="launchpad-open-folder" title="Open Space folder in Explorer">
          <span class="launch-icon">${uiIcon('folder', 13)}</span>
          <span>Explorer</span>
        </button>
        <button type="button" class="reborn-launchpad-item vscode-item" id="launchpad-open-vscode" title="Open Space in VS Code">
          <span class="launch-icon">${uiIcon('code', 13)}</span>
          <span>VS Code</span>
        </button>
        <button type="button" class="reborn-launchpad-item terminal-item" id="launchpad-open-terminal" title="Open Space in Terminal">
          <span class="launch-icon">${uiIcon('terminal', 13)}</span>
          <span>Terminal</span>
        </button>
        ${linksHtml}
      </div>
    </div>
  `;

  // 3. Capture & Triage Inbox Deck (Only if inbox has items)
  let inboxCard = '';
  if (inbox.length > 0) {
    const itemsHtml = inbox.slice(0, 5).map((item) => `
      <div class="reborn-inbox-item" data-inbox-id="${item.id}">
        <span class="inbox-item-text">${escapeHtml(item.text)}</span>
        <div class="inbox-item-actions">
          <button type="button" class="inbox-triage-btn focus-target" data-triage-action="objective" title="Set as Current Objective">
            ${uiIcon('target', 11)} <span>Focus</span>
          </button>
          <button type="button" class="inbox-triage-btn log-milestone" data-triage-action="log" title="Log as Milestone">
            ${uiIcon('star', 11)} <span>Log</span>
          </button>
          <button type="button" class="inbox-triage-btn delete-item" data-triage-action="delete" title="Dismiss">✕</button>
        </div>
      </div>
    `).join('');

    inboxCard = `
      <div class="reborn-card reborn-inbox-card">
        <div class="reborn-card-header">
          <div class="reborn-header-title">
            <span class="reborn-card-icon inbox-icon">${uiIcon('inbox', 13)}</span>
            <span class="reborn-card-label">INBOX (${inbox.length})</span>
          </div>
          <span class="inbox-sub-hint">Captured from overlay · 1-click triage</span>
        </div>
        <div class="reborn-inbox-list">${itemsHtml}</div>
      </div>
    `;
  }

  // 4. Momentum Timeline (Grouped by Day)
  const now = new Date();
  const todayDateStr = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(now);
  const yesterday = new Date(Date.now() - 86400000);
  const yesterdayDateStr = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(yesterday);

  const todayLogs: typeof logEntries = [];
  const yesterdayLogs: typeof logEntries = [];
  const olderLogs: typeof logEntries = [];

  for (const log of logEntries) {
    const logDate = new Date(log.createdAt);
    const logDateStr = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'numeric', day: 'numeric' }).format(logDate);
    if (logDateStr === todayDateStr) {
      todayLogs.push(log);
    } else if (logDateStr === yesterdayDateStr) {
      yesterdayLogs.push(log);
    } else {
      olderLogs.push(log);
    }
  }

  const renderLogRow = (e: (typeof logEntries)[0]) => {
    const timeFormatted = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(e.createdAt));
    const tagMatch = e.text.match(/^\[(milestone|bug|note|focus)\]\s*(.*)$/i);
    const tag = tagMatch ? tagMatch[1].toLowerCase() : (e.tag || null);
    const cleanText = tagMatch ? tagMatch[2] : e.text;

    let tagBadge = '';
    if (tag === 'milestone') {
      tagBadge = `<span class="reborn-tag-badge milestone">★ Milestone</span>`;
    } else if (tag === 'bug') {
      tagBadge = `<span class="reborn-tag-badge bug">🐛 Bug</span>`;
    } else if (tag === 'focus') {
      tagBadge = `<span class="reborn-tag-badge focus">⏱ Focus</span>`;
    } else if (tag === 'note') {
      tagBadge = `<span class="reborn-tag-badge note">📝 Note</span>`;
    }

    return `
      <div class="reborn-timeline-row">
        <span class="timeline-row-time">${timeFormatted}</span>
        ${tagBadge}
        <span class="timeline-row-text">${escapeHtml(cleanText)}</span>
      </div>
    `;
  };

  let timelineFeedHtml = '';
  if (todayLogs.length > 0) {
    timelineFeedHtml += `
      <div class="timeline-group-header">Today (${todayLogs.length})</div>
      <div class="timeline-group-list">${todayLogs.slice(0, 10).map(renderLogRow).join('')}</div>
    `;
  }
  if (yesterdayLogs.length > 0) {
    timelineFeedHtml += `
      <div class="timeline-group-header">Yesterday (${yesterdayLogs.length})</div>
      <div class="timeline-group-list">${yesterdayLogs.slice(0, 6).map(renderLogRow).join('')}</div>
    `;
  }
  if (olderLogs.length > 0 && todayLogs.length + yesterdayLogs.length < 5) {
    timelineFeedHtml += `
      <div class="timeline-group-header">Earlier</div>
      <div class="timeline-group-list">${olderLogs.slice(0, 4).map(renderLogRow).join('')}</div>
    `;
  }
  if (!timelineFeedHtml) {
    timelineFeedHtml = `<p class="timeline-empty-hint">No logs recorded yet. Type below to record a milestone or quick thought.</p>`;
  }

  const timelineCard = `
    <div class="reborn-card reborn-timeline-card">
      <div class="reborn-card-header">
        <div class="reborn-header-title">
          <span class="reborn-card-icon timeline-icon">${uiIcon('list', 14)}</span>
          <span class="reborn-card-label">MOMENTUM TIMELINE</span>
        </div>
        <button class="reborn-mini-link" data-view="Log">All Logs</button>
      </div>

      <div class="reborn-quick-log-wrap">
        <div class="reborn-quick-log-input-box">
          <input
            id="reborn-quick-log-input"
            class="reborn-quick-log-input"
            type="text"
            placeholder="Log progress… (Enter to save)"
            value="${escapeHtml(homeLogDraft)}"
            autocomplete="off"
            spellcheck="false"
          />
          <button type="button" class="reborn-quick-log-submit" id="reborn-quick-log-submit" title="Save log entry (Enter)">
            ${uiIcon('arrowUp', 12)}
          </button>
        </div>
        <div class="reborn-quick-tags">
          <button type="button" class="reborn-tag-chip" data-log-tag="milestone" title="Tag as Milestone">★ Milestone</button>
          <button type="button" class="reborn-tag-chip" data-log-tag="bug" title="Tag as Bug Fix">🐛 Bug Fix</button>
          <button type="button" class="reborn-tag-chip" data-log-tag="note" title="Tag as Note">📝 Note</button>
        </div>
      </div>

      <div class="reborn-timeline-scroll">
        ${timelineFeedHtml}
      </div>
    </div>
  `;

  return `
    <section class="reborn-cockpit-panel">
      <div class="reborn-cockpit-grid">
        ${objectiveCard}
        ${launchpadCard}
        ${inboxCard}
        ${timelineCard}
      </div>
    </section>
  `;
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
