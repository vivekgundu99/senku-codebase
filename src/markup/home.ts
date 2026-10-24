import type { Launchpad } from '../../electron/types';
import { state, getLogEntries, homeLogDraft } from '../state';
import { escapeHtml, renderGreeting } from '../utils';
import { uiIcon } from './icons';
import { formatRelativeTime } from './files';

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

  return homePanelV3Markup();
}

export function homeLaunchpadRowMarkup(lp: Launchpad): string {
  return `
    <div class="home-lp-row" data-id="${escapeHtml(lp.id)}">
      <button type="button" class="home-lp-launch-btn" data-launch-id="${escapeHtml(lp.id)}" title="Launch ${escapeHtml(lp.name)}">
        <span class="home-lp-icon">${uiIcon('play', 10)}</span>
        <span class="home-lp-name">${escapeHtml(lp.name)}</span>
      </button>
      <div class="home-lp-actions">
        <button type="button" class="home-lp-pin-btn ${lp.pinned ? 'active' : ''}" data-pin-lp="${escapeHtml(lp.id)}" data-pinned="${Boolean(lp.pinned)}" title="${lp.pinned ? 'Unpin' : 'Pin to Home'}">
          ${uiIcon('star', 12)}
        </button>
        <button type="button" class="home-lp-menu-btn" data-lp-menu="${escapeHtml(lp.id)}" title="Launchpad options" aria-label="Launchpad options">
          ${uiIcon('dots', 13)}
        </button>
      </div>
    </div>`;
}

export function homePanelV3Markup(): string {
  const logEntries = getLogEntries();
  const launchpads = state.launchpads ?? [];
  const recentLogs = logEntries.slice(0, 5);

  const recentLogsHtml = recentLogs.length
    ? recentLogs.map((e) => `
        <div class="home-recent-log-item">
          <span class="home-log-text">${escapeHtml(e.text.replace(/^\[[^\]]+\]\s*/, ''))}</span>
          <span class="home-log-time">${formatRelativeTime(e.createdAt)}</span>
        </div>`).join('')
    : `<p class="home-log-empty">No entries logged yet. Type above to record what you just did.</p>`;

  const quickLaunchHtml = launchpads.length
    ? launchpads.slice(0, 5).map(homeLaunchpadRowMarkup).join('')
    : `<div class="home-lp-empty">
         <p>No launchpads yet.</p>
         <button class="secondary-button mini" data-view="Launchpads">Create</button>
       </div>`;

  return `
    <section class="home-panel-v3">
      <div class="panel-header-line">
        <h2 class="panel-header-title">Overview</h2>
      </div>
      <div class="home-decks-container">
        <!-- Top: Quick Launchpads -->
        <div class="home-recent-deck home-lp-deck">
          <div class="home-deck-header">
            <span class="home-section-label">QUICK LAUNCHPADS</span>
            <div class="home-deck-actions">
              <button type="button" class="home-deck-add-btn" id="home-add-launchpad" title="New Launchpad" aria-label="New Launchpad">${uiIcon('plus', 11)}</button>
              <button class="home-deck-link" data-view="Launchpads">All</button>
            </div>
          </div>
          <div class="home-launchpads-wrap">${quickLaunchHtml}</div>
        </div>

        <!-- Bottom: Log Station (Input + Feed) -->
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
