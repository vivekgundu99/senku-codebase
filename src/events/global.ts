import { state, setState, currentView, setView, toggleAppSidebarCollapsed, setGlobalNotesMode, isGlobalNotesMode, setHomeCenterMode, homeCenterMode, setActiveMarkdownFile, setFilePaneCompact } from '../state';
import { registerShortcuts } from '../shortcuts';
import { openPalette } from '../palette';
import {
  openProfileModal,
  openWorkspaceFormModal,
  openWorkspaceSettingsModal,
} from '../modals';
import { toast } from '../toast';
import { uiIcon } from '../markup';
import { escapeHtml } from '../utils';
import type { LoadFn, RenderFn } from './types';

export function initGlobalListeners(load: LoadFn, render: RenderFn): void {
  registerShortcuts(load, render);

  // Global Ctrl+K / Ctrl+P opens Command Palette
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K' || e.key === 'p' || e.key === 'P')) {
      e.preventDefault();
      openPalette(load, render);
    }
  }, { capture: true });

  // Global Zoom: Ctrl+=, Ctrl++, Ctrl+-, Ctrl+0
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === '=' || e.key === '+' || e.code === 'NumpadAdd') {
        e.preventDefault();
        window.senku.zoomIn();
      } else if (e.key === '-' || e.key === '_' || e.code === 'NumpadSubtract') {
        e.preventDefault();
        window.senku.zoomOut();
      } else if (e.key === '0' || e.code === 'Numpad0') {
        e.preventDefault();
        window.senku.resetZoom();
      }
    }
  });

  // Global F11: Toggle Fullscreen (Zen Writing Mode)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'F11') {
      e.preventDefault();
      void window.senku.toggleFullscreen();
    }
  });

  // Esc: cancel / dismiss / clear, and at last navigate to Home
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // 1. Let open modal or command palette handle their own dismissal
      if (document.querySelector('.modal-backdrop, .palette-backdrop')) {
        return;
      }

      // 2. If dropdown menu or tools popover is open, close it
      const openMenu = document.querySelector<HTMLElement>('.file-tools-dropdown-menu.open, .tools-menu-popover');
      if (openMenu) {
        e.preventDefault();
        openMenu.classList.remove('open');
        if (openMenu.classList.contains('tools-menu-popover')) openMenu.remove();
        return;
      }

      // 3. If file search input is active: clear filter query or close search bar
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.id === 'file-filter-input') {
        e.preventDefault();
        if (active.value) {
          active.value = '';
          active.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          active.blur();
          const searchExp = document.querySelector<HTMLElement>('#file-search-expandable.open');
          if (searchExp) searchExp.classList.remove('open');
        }
        return;
      }

      // If any other input or textarea is focused, blur it safely (never wipe value!)
      if (active instanceof HTMLElement && (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)) {
        active.blur();
      }

      // 4. Navigate to Home overview
      if (currentView !== 'Home' || isGlobalNotesMode || homeCenterMode !== 'overview') {
        e.preventDefault();
        setGlobalNotesMode(false);
        setHomeCenterMode('overview');
        setActiveMarkdownFile(null);
        setFilePaneCompact(false);
        setView('Home');
        if (state.workspace?.masterFolder) {
          void load(state.workspace.masterFolder);
        } else {
          render();
        }
      }
    }
  });

  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    if (target.closest('#settings-button, .avatar-button, #profile-avatar-button')) {
      e.preventDefault();
      openProfileModal(render, load);
      return;
    }

    // Close space tab from sidebar
    const closeTabBtn = target.closest<HTMLElement>('[data-close-space-tab]');
    if (closeTabBtn) {
      e.preventDefault();
      e.stopPropagation();
      const spaceId = closeTabBtn.dataset.closeSpaceTab;
      if (!spaceId) return;
      const res = await window.senku.closeWorkspaceTab(spaceId);
      if (!res.ok) {
        toast(res.error || 'Cannot remove space tab from sidebar.');
        return;
      }
      if (res.snapshot) {
        setState(res.snapshot);
        await load(res.snapshot.workspace?.masterFolder);
      } else {
        await load();
      }
      return;
    }

    const switchSpaceBtn = target.closest<HTMLElement>('[data-switch-space]');
    if (switchSpaceBtn) {
      e.preventDefault();
      const targetSpaceId = switchSpaceBtn.dataset.switchSpace;
      if (!targetSpaceId) return;

      if (isGlobalNotesMode) {
        setGlobalNotesMode(false);
        setHomeCenterMode('overview');
      }

      const isActive = state.workspace?.id === targetSpaceId;
      if (isActive) {
        setView('Home');
        await load(state.workspace?.masterFolder);
        return;
      }

      await window.senku.switchWorkspace(targetSpaceId);
      setView('Home');
      await load();
      return;
    }

    // Sidebar Create Space button (+)
    const createSpaceSidebarBtn = target.closest<HTMLElement>('#create-space-sidebar-btn');
    if (createSpaceSidebarBtn) {
      e.preventDefault();
      e.stopPropagation();
      openWorkspaceFormModal(load);
      return;
    }

    // Sidebar View All Spaces button (Filterable popover)
    const searchSpacesBtn = target.closest<HTMLElement>('#search-spaces-btn');
    if (searchSpacesBtn) {
      e.preventDefault();
      e.stopPropagation();
      openSearchSpacesMenu(searchSpacesBtn, load);
      return;
    }

    if (target.closest('#add-space-empty, #create-space-files, #home-add-space')) {
      e.preventDefault();
      openWorkspaceFormModal(load);
      return;
    }

    if (target.closest('#workspace-settings')) {
      e.preventDefault();
      openWorkspaceSettingsModal(load, render);
      return;
    }
  }, true);
}

function openSearchSpacesMenu(anchorBtn: HTMLElement, load: LoadFn): void {
  document.querySelectorAll('.topbar-spaces-popover').forEach((p) => p.remove());

  const allWorkspaces = [...(state.workspaces ?? [])]
    .filter((w) => w.id !== '__senku_notes__' && !(w as any).isNotesSpace)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const currentWsId = state.workspace?.id;

  const renderList = (filter = ''): string => {
    const q = filter.trim().toLowerCase();
    const matched = q
      ? allWorkspaces.filter((w) => w.name.toLowerCase().includes(q))
      : allWorkspaces;

    if (matched.length === 0) {
      return '<div style="padding: 8px; font-size: 11px; color: var(--muted);">No matching space</div>';
    }

    return matched.map((ws) => {
      const isCurrent = ws.id === currentWsId;
      return `
        <button type="button" class="spaces-popover-item ${isCurrent ? 'active' : ''}" data-select-space="${ws.id}">
          <span class="spaces-popover-badge">${escapeHtml(ws.name.charAt(0).toUpperCase() || '?')}</span>
          <span class="spaces-popover-name">${escapeHtml(ws.name)}</span>
          ${isCurrent ? `<span class="spaces-popover-check">✓</span>` : ''}
        </button>
      `;
    }).join('');
  };

  const popover = document.createElement('div');
  popover.className = 'topbar-spaces-popover';
  popover.innerHTML = `
    <div class="spaces-popover-search-wrap">
      <span class="spaces-popover-search-icon">${uiIcon('search', 12)}</span>
      <input type="text" id="spaces-popover-filter" class="spaces-popover-search-input" placeholder="Find space…" autocomplete="off" spellcheck="false" />
    </div>
    <div class="spaces-popover-list" id="spaces-popover-list">
      ${renderList()}
    </div>
    <div class="spaces-popover-footer">
      <button type="button" class="spaces-popover-add-btn" id="popover-create-space">
        ${uiIcon('plus', 12)}
        <span>New Space</span>
      </button>
    </div>
  `;

  const rect = anchorBtn.getBoundingClientRect();
  popover.style.top = `${rect.bottom + 4}px`;
  popover.style.left = `${rect.left}px`;

  document.body.appendChild(popover);

  const input = popover.querySelector<HTMLInputElement>('#spaces-popover-filter')!;
  const listEl = popover.querySelector<HTMLElement>('#spaces-popover-list')!;

  setTimeout(() => input.focus(), 10);

  const closePopover = () => {
    popover.remove();
    document.removeEventListener('click', onDocClick);
    document.removeEventListener('keydown', onDocKey);
  };

  const onDocClick = (evt: MouseEvent) => {
    if (!popover.contains(evt.target as Node) && evt.target !== anchorBtn) {
      closePopover();
    }
  };

  const onDocKey = (evt: KeyboardEvent) => {
    if (evt.key === 'Escape') closePopover();
  };

  setTimeout(() => {
    document.addEventListener('click', onDocClick);
    document.addEventListener('keydown', onDocKey);
  }, 0);

  popover.querySelector('#popover-create-space')?.addEventListener('click', () => {
    closePopover();
    openWorkspaceFormModal(load);
  });

  const bindItemClicks = () => {
    listEl.querySelectorAll<HTMLElement>('[data-select-space]').forEach((item) => {
      item.addEventListener('click', async () => {
        const targetId = item.dataset.selectSpace;
        closePopover();
        if (targetId && targetId !== currentWsId) {
          if (isGlobalNotesMode) {
            setGlobalNotesMode(false);
            setHomeCenterMode('overview');
          }
          await window.senku.switchWorkspace(targetId);
          setView('Home');
          await load();
        }
      });
    });
  };

  bindItemClicks();

  input.addEventListener('input', () => {
    listEl.innerHTML = renderList(input.value);
    bindItemClicks();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const firstBtn = listEl.querySelector<HTMLElement>('[data-select-space]');
      if (firstBtn) {
        firstBtn.click();
      }
    }
  });
}
