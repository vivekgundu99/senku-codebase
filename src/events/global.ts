import { state, currentView, setView, toggleAppSidebarCollapsed, setGlobalNotesMode, isGlobalNotesMode, setHomeCenterMode, homeCenterMode } from '../state';
import { registerShortcuts } from '../shortcuts';
import { openPalette } from '../palette';
import {
  openProfileModal,
  openWorkspaceFormModal,
  openWorkspaceSettingsModal,
} from '../modals';
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

    if (target.closest('#add-space, #add-space-empty, #topbar-create-space, #create-space-files, #home-add-space')) {
      e.preventDefault();
      openWorkspaceFormModal(load);
      return;
    }

    if (target.closest('#workspace-settings, #topbar-space-pill, [data-action="workspace-settings"]')) {
      e.preventDefault();
      openWorkspaceSettingsModal(load, render);
      return;
    }
  }, true);
}
