import { state, currentView, isAppSidebarCollapsed, homeCenterMode, isGlobalNotesMode } from '../state';
import { escapeHtml } from '../utils';
import { uiIcon } from './icons';

export function sidebarMarkup(): string {
  const ws = state.workspace;
  const isCollapsed = isAppSidebarCollapsed;

  // Spaces arranged in alphabetical order (excluding internal notes space)
  const sortedWorkspaces = [...(state.workspaces ?? [])]
    .filter((w) => w.id !== '__senku_notes__' && !(w as any).isNotesSpace)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const spaceRow = (space: (typeof state.workspaces)[number]) => {
    const isActive = !isGlobalNotesMode && (ws ? space.id === ws.id : false);
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
    <aside class="sidebar ${isCollapsed ? 'collapsed' : ''}">
      <div class="brand">
        <div class="brand-left">
          <span class="brand-mark" title="Senku">S</span>
          <span class="brand-text">senku</span>
        </div>
        <button class="sidebar-toggle-btn" id="toggle-sidebar" title="${isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}" aria-label="Toggle sidebar">
          ${uiIcon('sidebar', 14)}
        </button>
      </div>

      <div class="nav-list">
        <button class="nav-item ${!isGlobalNotesMode && currentView === 'Home' ? 'selected' : ''}" data-view="Home" title="Home">
          <span class="nav-icon">${uiIcon('home', 15)}</span>
          <span class="nav-label">Home</span>
        </button>
        <button class="nav-item ${currentView === 'Launchpads' ? 'selected' : ''}" data-view="Launchpads" title="Launchpads">
          <span class="nav-icon">${uiIcon('play', 15)}</span>
          <span class="nav-label">Launchpads</span>
        </button>
        <button class="nav-item ${currentView === 'Log' || currentView === 'AllLog' ? 'selected' : ''}" data-view="AllLog" title="Logs">
          <span class="nav-icon">${uiIcon('list', 15)}</span>
          <span class="nav-label">Logs</span>
        </button>
        <button class="nav-item ${isGlobalNotesMode || currentView === 'Notes' ? 'selected' : ''}" data-view="Notes" title="Notes">
          <span class="nav-icon">${uiIcon('note', 15)}</span>
          <span class="nav-label">Notes</span>
        </button>
      </div>

      <div class="spaces-head">
        <span class="workspace-label">SPACES</span>
        <button class="mini-button" id="add-space" title="Add a Space" aria-label="Add a Space">${uiIcon('plus', 13)}</button>
      </div>
      <div class="space-list">${spacesContent}</div>
    </aside>`;
}
