import type { LogEntry } from '../../electron/types';
import {
  state,
  logFilter,
  logFromDate,
  logToDate,
  visibleLogEntries,
  logPageDraft,
} from '../state';
import { escapeHtml } from '../utils';
import { uiIcon } from './icons';

export function formatDayHeader(ts: number): string {
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

export function formatLogTimeOnly(ts: number): string {
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
              const cleanText = e.text.replace(/^\[[^\]]+\]\s*/, '');
              const rawSpace = e.spaceName || (scope === 'all' && (!e.spaceId || e.spaceId === 'senku') ? '#senku' : '');
              const spaceBadge = scope === 'all' && rawSpace
                ? `<span class="log-row-space" data-space-filter="${escapeHtml(rawSpace)}" title="Filter by ${escapeHtml(rawSpace)}">${escapeHtml(rawSpace)}</span>`
                : '';
              return `
                  <div class="log-row-compact${cleanText.includes('\n') ? ' multi' : ''}" data-id="${e.id}" data-space-id="${e.spaceId || ''}">
                    <span class="log-row-time">${formatLogTimeOnly(e.createdAt)}</span>
                    <span class="log-row-text">${escapeHtml(cleanText)}</span>
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

export function logPanelMarkup(scope: 'space' | 'all' = 'all'): string {
  const ws = state.workspace;
  if (scope === 'space' && !ws) {
    return `
    <section class="log-panel">
      <p style="margin-top: 24px; color: var(--text-muted, #767676);">Create a Space to begin.</p>
      <button class="primary-button" id="create-space-files" style="margin-top: 12px;">+ Create a Space</button>
    </section>`;
  }

  const { matched, total } = visibleLogEntries(scope);
  const countLabel = logFilter.trim() || logFromDate || logToDate ? `${matched} of ${total}` : '';
  const spaceLabel = ws ? ws.name : 'Current Space';

  const placeholderText = scope === 'all'
    ? 'Write an independent log… #senku (Enter to save · Shift+Enter for new line)'
    : `Log to ${escapeHtml(spaceLabel)}… (Enter to save · Shift+Enter for new line)`;

  const composeBoxHtml = `
    <div class="log-capture-card">
      <span class="log-capture-icon">${uiIcon('pen', 14)}</span>
      <textarea
        id="log-compose-textarea"
        class="log-capture-input"
        placeholder="${placeholderText}"
        spellcheck="false"
        rows="1"
      >${escapeHtml(logPageDraft)}</textarea>
    </div>`;

  return `
    <section class="log-panel" data-scope="${scope}">
      <div class="log-top-bar">
        <div class="log-scope-nav">
          <button class="log-scope-btn ${scope === 'all' ? 'active' : ''}" data-log-scope="all" title="View All Logs">
            <span>All Logs</span>
          </button>
          <button class="log-scope-btn ${scope === 'space' ? 'active' : ''}" data-log-scope="space" title="${escapeHtml(spaceLabel)} Logs">
            <span>${escapeHtml(spaceLabel)}</span>
          </button>
        </div>
        <div class="log-tools-right">
          <div class="log-date-range">
            <span class="log-date-label">From</span>
            <input type="date" id="log-from-date" value="${escapeHtml(logFromDate)}" class="log-date-picker" title="From date" />
            <span class="log-date-label">To</span>
            <input type="date" id="log-to-date" value="${escapeHtml(logToDate)}" class="log-date-picker" title="To date" />
            <button type="button" id="reset-log-dates" class="log-mini-btn" title="Reset to last 7 days">7d</button>
          </div>
          <button type="button" id="log-export-btn" class="log-mini-btn export-btn" title="Export filtered logs to markdown">
            ${uiIcon('folder', 12)} <span>Export</span>
          </button>
          <div class="log-search-expandable ${logFilter ? 'open' : ''}" id="log-search-expandable">
            <button type="button" class="log-mini-btn search-trigger-btn" id="log-search-trigger" title="Search logs (/)">
              ${uiIcon('search', 12)}
            </button>
            <div class="log-search-input-wrap">
              <input
                id="log-search"
                class="log-search-small"
                type="text"
                placeholder="Search… (Enter)"
                value="${escapeHtml(logFilter)}"
                autocomplete="off"
                spellcheck="false"
              />
              <button type="button" id="log-search-clear" class="log-search-clear" title="Clear (Esc)">✕</button>
            </div>
          </div>
          <span class="log-count-badge">${countLabel}</span>
        </div>
      </div>
      ${composeBoxHtml}
      <div class="log-entries">${logListMarkup(scope)}</div>
    </section>`;
}
