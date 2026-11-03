import { state, currentView, homeCenterMode, isGlobalNotesMode } from '../state';
import { escapeHtml } from '../utils';
import { uiIcon } from './icons';
import { formatTimerSeconds, getRemainingSeconds } from '../focus';

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

  const session = state.activeSession;
  const focusPill = (session && session.state === 'running')
    ? `<div class="topbar-focus-pill running" title="${escapeHtml(session.objective || 'Focus Session')}">
        <span class="focus-pulse-dot"></span>
        <span class="focus-countdown" id="topbar-focus-countdown">${formatTimerSeconds(getRemainingSeconds())}</span>
        <span class="focus-title">${escapeHtml(session.objective || ws?.name || 'Focus')}</span>
        <button type="button" class="focus-pill-btn done" id="topbar-focus-done" title="Finish session (✓)">${uiIcon('check', 11)}</button>
        <button type="button" class="focus-pill-btn stop" id="topbar-focus-stop" title="Cancel session (✕)">✕</button>
      </div>`
    : `<div class="topbar-focus-pill idle">
        <span class="focus-idle-icon">${uiIcon('clock', 12)}</span>
        <button type="button" class="focus-preset-btn" data-start-focus="25" title="Start 25m focus sprint">25m</button>
        <button type="button" class="focus-preset-btn" data-start-focus="45" title="Start 45m deep flow">45m</button>
      </div>`;

  return `
    <header class="topbar">
      <div class="topbar-left">
        <span class="topbar-view-title">${pageTitle}</span>
        <span class="topbar-dot-sep">·</span>
        <span class="date-line">${dateFormatted}</span>
      </div>
      <div class="topbar-center">
        ${focusPill}
      </div>
      <div class="top-actions">
        ${spaceBadge}
        <button class="icon-button" id="topbar-tools-btn" title="Tools" aria-label="Tools">${uiIcon('tools', 14)}</button>
        <button class="icon-button" id="refresh-button" title="Refresh" aria-label="Refresh">${uiIcon('refresh', 14)}</button>
        <button class="icon-button" id="settings-button" title="Settings" aria-label="Settings">${uiIcon('gear', 14)}</button>
      </div>
    </header>`;
}
