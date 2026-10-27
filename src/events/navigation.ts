import {
  state,
  setState,
  setView,
  setAllLog,
  toggleAppSidebarCollapsed,
  setHomeCenterMode,
  isFilePaneCompact,
  toggleFilePaneCompact,
  setCurrentFolder,
  setActiveMarkdownFile,
  setActiveNotePageIndex,
  setIsNoteAllPagesView,
  setIsNotePreviewMode,
  isGlobalNotesMode,
  setGlobalNotesMode,
} from '../state';
import { uiIcon } from '../markup';
import { toast } from '../toast';
import { openPalette } from '../palette';
import { openProfileModal } from '../modals';
import type { LoadFn, RenderFn } from './types';

export function bindNavigation(load: LoadFn, render: RenderFn): void {
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const view = btn.dataset.view ?? 'Home';
      if (view === 'Notes') {
        setGlobalNotesMode(true);
        const notesPath = await window.senku.getNotesPath();
        const res = await window.senku.readFolder(notesPath);
        setCurrentFolder(res.entries, res.currentPath);

        const qNote = await window.senku.getOrCreateQuickNote();
        setActiveMarkdownFile(qNote);
        setActiveNotePageIndex(0);
        setIsNoteAllPagesView(true);
        setIsNotePreviewMode(true);

        setView('Home');
        setHomeCenterMode('notes');
        if (!isFilePaneCompact) toggleFilePaneCompact();
        render();
        return;
      }
      if (view === 'Home') {
        const wasGlobal = isGlobalNotesMode;
        setGlobalNotesMode(false);
        setView('Home');
        setHomeCenterMode('overview');
        setActiveMarkdownFile(null);
        if (wasGlobal && state.workspace?.masterFolder) {
          await load(state.workspace.masterFolder);
        } else {
          render();
        }
        return;
      }
      if (isGlobalNotesMode) {
        setGlobalNotesMode(false);
        if (state.workspace?.masterFolder) {
          await load(state.workspace.masterFolder);
        }
      }
      setView(view);
      if (view === 'AllLog') {
        const all = await window.senku.listAllLogs();
        setAllLog(all);
      }
      render();
    }),
  );
}

export function bindSidebarButtons(_load: LoadFn, render: RenderFn): void {
  document.querySelector('#toggle-sidebar')?.addEventListener('click', () => {
    toggleAppSidebarCollapsed();
    render();
  });
}

export function bindTopbarButtons(load: LoadFn, render: RenderFn): void {
  document.querySelector('#refresh-button')?.addEventListener('click', () => void load(state.currentPath));

  // Tools dropdown menu
  document.querySelector('#topbar-tools-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const btn = e.currentTarget as HTMLElement;

    document.querySelectorAll('.tools-menu-popover').forEach((p) => p.remove());

    const popover = document.createElement('div');
    popover.className = 'tools-menu-popover';
    popover.innerHTML = `
      <div class="tools-menu-kicker">TOOLS &amp; UTILITIES</div>
      <button class="tools-menu-item" id="tools-quicknote">
        <span class="tools-menu-icon">${uiIcon('pen', 13)}</span>
        <div class="tools-menu-text">
          <span class="tools-menu-label">Quick Note Overlay</span>
          <span class="tools-menu-sub">Floating scratchpad</span>
        </div>
      </button>
      <button class="tools-menu-item" id="tools-palette">
        <span class="tools-menu-icon">${uiIcon('search', 13)}</span>
        <div class="tools-menu-text">
          <span class="tools-menu-label">Command Palette</span>
          <span class="tools-menu-sub">Search and navigation</span>
        </div>
        <kbd class="tools-menu-key">P</kbd>
      </button>
      <button class="tools-menu-item" id="tools-guide">
        <span class="tools-menu-icon">${uiIcon('note', 13)}</span>
        <div class="tools-menu-text">
          <span class="tools-menu-label">User Guide</span>
          <span class="tools-menu-sub">Shortcuts &amp; walkthrough</span>
        </div>
        <span class="tools-menu-arrow">↗</span>
      </button>
    `;

    const rect = btn.getBoundingClientRect();
    popover.style.top = `${rect.bottom + 6}px`;
    popover.style.right = `${window.innerWidth - rect.right}px`;

    document.body.appendChild(popover);

    const closePopover = () => {
      popover.remove();
      document.removeEventListener('click', onDocClick);
      document.removeEventListener('keydown', onDocKey);
    };

    const onDocClick = (evt: MouseEvent) => {
      if (!popover.contains(evt.target as Node) && evt.target !== btn) {
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

    popover.querySelector('#tools-quicknote')?.addEventListener('click', () => {
      closePopover();
      void window.senku.showOverlay();
    });

    popover.querySelector('#tools-palette')?.addEventListener('click', () => {
      closePopover();
      openPalette(load, render);
    });

    popover.querySelector('#tools-guide')?.addEventListener('click', async () => {
      closePopover();
      const res = await window.senku.openUserGuide();
      if (!res.ok) toast(res.error || 'User guide not found.');
    });
  });
}
