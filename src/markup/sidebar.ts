import { state, currentView } from '../state';
import { escapeHtml } from '../utils';
import { uiIcon } from './icons';

export function sidebarMarkup(): string {
  const ws = state.workspace;

  // Spaces arranged in alphabetical order
  const sortedWorkspaces = [...(state.workspaces ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  );

  const spaceRow = (space: (typeof state.workspaces)[number]) => {
    const isActive = ws ? space.id === ws.id : false;
    const missing = state.workspaceFolderAvailability[space.id] === false;

    return `
      <div class="space-row ${isActive ? 'current' : ''}">
        <button class="space-item" data-switch-space="${space.id}" title="${escapeHtml(space.name)} · ${escapeHtml(space.masterFolder)}${missing ? ' [Folder missing]' : ''}">
          <span class="space-badge ${missing ? 'missing' : ''}">${escapeHtml(space.name.charAt(0).toUpperCase() || '?')}</span>
          <span class="space-name">${escapeHtml(space.name)}</span>
          ${missing ? `<span class="space-missing-icon" title="Folder not found">${uiIcon('alert', 12)}</span>` : ''}
        </button>
        ${isActive ? `<button class="space-gear" id="workspace-settings" title="Space settings" aria-label="Space settings">${uiIcon('gear', 13)}</button>` : ''}
      </div>`;
  };

  const spacesContent = sortedWorkspaces.length > 0
    ? sortedWorkspaces.map(spaceRow).join('')
    : `<div class="empty-spaces-box">
         <span class="empty-spaces-text">No Spaces yet</span>
       </div>`;

  return `
    <aside class="sidebar">
      <div class="brand">
        <span class="brand-mark">S</span>
        <span class="brand-text">senku</span>
      </div>

      <div class="nav-list">
        <button class="nav-item ${currentView === 'Home' || currentView === 'Overview' ? 'selected' : ''}" data-view="Home" title="Home (H)">
          <span class="nav-icon">${uiIcon('home', 15)}</span>
          <span class="nav-label">Home</span>
          <span class="nav-key">H</span>
        </button>
        <button class="nav-item ${currentView === 'Launchpads' ? 'selected' : ''}" data-view="Launchpads" title="Launchpads (L)">
          <span class="nav-icon">${uiIcon('play', 15)}</span>
          <span class="nav-label">Launchpads</span>
          <span class="nav-key">L</span>
        </button>
        <button class="nav-item ${currentView === 'Log' || currentView === 'AllLog' ? 'selected' : ''}" data-view="AllLog" title="Logs (G)">
          <span class="nav-icon">${uiIcon('list', 15)}</span>
          <span class="nav-label">Logs</span>
          <span class="nav-key">G</span>
        </button>
        <button class="nav-item ${currentView === 'Notes' ? 'selected' : ''}" data-view="Notes" title="Notes (N)">
          <span class="nav-icon">${uiIcon('note', 15)}</span>
          <span class="nav-label">Notes</span>
          <span class="nav-key">N</span>
        </button>
      </div>

      <div class="spaces-head">
        <span class="workspace-label">SPACES</span>
        <button class="mini-button" id="add-space" title="Add a Space" aria-label="Add a Space">${uiIcon('plus', 13)}</button>
      </div>
      <div class="space-list">${spacesContent}</div>
      ${state.trashWorkspaces && state.trashWorkspaces.length > 0 ? `
        <div class="space-trash-wrap">
          <button class="space-trash-btn" id="open-trash" title="Trash (${state.trashWorkspaces.length} deleted spaces)">
            <span>Trash</span>
            <span class="trash-count">${state.trashWorkspaces.length}</span>
          </button>
        </div>` : ''}
    </aside>`;
}
