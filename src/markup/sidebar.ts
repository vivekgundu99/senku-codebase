import { state, currentView, isAppSidebarCollapsed, homeCenterMode, isGlobalNotesMode } from '../state';
import { escapeHtml } from '../utils';
import { uiIcon } from './icons';

export function sidebarMarkup(): string {
  const ws = state.workspace;
  const isCollapsed = isAppSidebarCollapsed;

  // Open spaces (sidebar tabs)
  const openIds = state.openSpaceIds && state.openSpaceIds.length > 0
    ? state.openSpaceIds
    : (ws ? [ws.id] : []);

  const openWorkspaces = openIds
    .map((id) => (state.workspaces ?? []).find((w) => w.id === id))
    .filter((w): w is (typeof state.workspaces)[number] => w !== undefined && w.id !== '__senku_notes__' && !(w as any).isNotesSpace);

  const displaySpaces = openWorkspaces.length > 0
    ? openWorkspaces
    : (state.workspaces ?? []).filter((w) => w.id !== '__senku_notes__' && !(w as any).isNotesSpace).slice(0, 1);

  const canClose = displaySpaces.length > 1;

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
        <div class="space-actions">
          ${isActive ? `<button class="space-gear" id="workspace-settings" title="Space settings" aria-label="Space settings">${uiIcon('gear', 13)}</button>` : ''}
          ${canClose ? `<button class="space-close-tab" data-close-space-tab="${space.id}" title="Close space tab" aria-label="Close space tab">✕</button>` : ''}
        </div>
      </div>`;
  };

  const spacesContent = displaySpaces.length > 0
    ? displaySpaces.map(spaceRow).join('')
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
        <span class="workspace-label">ACTIVE SPACES</span>
        <div class="spaces-head-actions">
          <button class="spaces-head-btn" id="create-space-sidebar-btn" title="New Space" aria-label="New Space">
            ${uiIcon('plus', 15)}
          </button>
          <button class="spaces-head-btn" id="search-spaces-btn" title="View all spaces" aria-label="View all spaces">
            ${uiIcon('search', 15)}
          </button>
        </div>
      </div>
      <div class="space-list">${spacesContent}</div>
    </aside>`;
}
