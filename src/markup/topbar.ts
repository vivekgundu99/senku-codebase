import { state, currentView, homeCenterMode } from '../state';
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
  if (currentView === 'Launchpads') pageTitle = 'Launchpads';
  else if (currentView === 'Log' || currentView === 'AllLog') pageTitle = 'Logs';
  else if (currentView === 'Notes' || (currentView === 'Home' && homeCenterMode === 'notes')) pageTitle = 'Notes';

  const spacePill = ws
    ? `<button class="topbar-space-pill" id="topbar-space-pill" data-action="workspace-settings" title="Active Space: ${escapeHtml(ws.name)} (${escapeHtml(ws.masterFolder)})">
        <span class="topbar-space-name">${escapeHtml(ws.name)}</span>
      </button>`
    : '';

  return `
    <header class="topbar">
      <div class="topbar-left">
        <span class="topbar-view-title">${pageTitle}</span>
        <span class="topbar-dot-sep">·</span>
        <span class="date-line">${dateFormatted}</span>
      </div>
      <div class="top-actions">
        ${spacePill}
        <button class="icon-button" id="topbar-tools-btn" title="Tools" aria-label="Tools">${uiIcon('tools', 14)}</button>
        <button class="icon-button" id="refresh-button" title="Refresh" aria-label="Refresh">${uiIcon('refresh', 14)}</button>
        <button class="icon-button" id="settings-button" title="Settings" aria-label="Settings">${uiIcon('gear', 14)}</button>
      </div>
    </header>`;
}
