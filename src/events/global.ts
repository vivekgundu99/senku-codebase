import { state, currentView, setView, toggleAppSidebarCollapsed } from '../state';
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

  // Global Ctrl+B toggles collapsible sidebar
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
      e.preventDefault();
      toggleAppSidebarCollapsed();
      render();
    }
  });

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

  // Global Ctrl+Enter focuses quick capture or navigates to Log
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      const homeInput = document.querySelector<HTMLTextAreaElement>('#home-capture-textarea');
      const logInput = document.querySelector<HTMLTextAreaElement>('#log-compose-textarea');
      if (homeInput) {
        homeInput.focus();
      } else if (logInput) {
        logInput.focus();
      } else {
        setView('Log');
        render();
        setTimeout(() => document.querySelector<HTMLTextAreaElement>('#log-compose-textarea')?.focus(), 50);
      }
    }
  }, { capture: true });

  // Esc clears non-empty search input first; if empty or not search, blurs it
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        if (active.closest('.modal-backdrop, .palette-backdrop')) return;
        if (active.type === 'search' || active.id === 'file-filter' || active.id === 'log-search') {
          if (active.value) {
            e.preventDefault();
            active.value = '';
            active.dispatchEvent(new Event('input', { bubbles: true }));
            return;
          }
        }
        e.preventDefault();
        active.blur();
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

      const isActive = state.workspace?.id === targetSpaceId;
      if (isActive) {
        if (currentView === 'Home' || currentView === 'AllLog') {
          setView('Overview');
          render();
        }
        return;
      }

      await window.senku.switchWorkspace(targetSpaceId);
      if (currentView === 'Home' || currentView === 'AllLog') {
        setView('Overview');
      }
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
