import { state, currentView, homeCenterMode, isGlobalNotesMode } from '../state';
import { escapeHtml } from '../utils';
import { uiIcon } from './icons';

export function topbarMarkup(): string {
  const ws = state.workspace;
  const dateFormatted = new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  let pageTitle = 'Home';
  if (currentView === 'Log' || currentView === 'AllLog') pageTitle = 'Logs';
  else if (isGlobalNotesMode || currentView === 'Notes' || (currentView === 'Home' && homeCenterMode === 'notes')) pageTitle = 'Notes';

  const spaceBadge = (!isGlobalNotesMode && ws)
    ? `<div class="topbar-space-box" title="Current Space: ${escapeHtml(ws.name)}">
        <span class="topbar-space-box-name">${escapeHtml(ws.name)}</span>
      </div>`
    : '';

  return `
    <header class="topbar">
      <div class="topbar-left">
        <span class="topbar-view-title">${pageTitle}</span>
        <span class="topbar-dot-sep">·</span>
        <span class="date-line">${dateFormatted}</span>
      </div>
      <div class="top-actions">
        ${spaceBadge}
        <button class="icon-button" id="topbar-tools-btn" title="Tools" aria-label="Tools">${uiIcon('tools', 14)}</button>
        <button class="icon-button" id="refresh-button" title="Refresh" aria-label="Refresh">${uiIcon('refresh', 14)}</button>
        <button class="icon-button" id="settings-button" title="Settings" aria-label="Settings">${uiIcon('gear', 14)}</button>
      </div>
    </header>`;
}
