import {
  state,
  currentView,
  setView,
  setDailyNote,
  setNoteDirty,
  setFileFilter,
  showMoreFiles,
} from './state';
import { fileCountLabel, fileListMarkup } from './markup';
import { isSamePath, parentOf } from './utils';
import { registerShortcuts } from './shortcuts';
import {
  openProfileModal,
  openWorkspaceFormModal,
  openWorkspaceSettingsModal,
  openLaunchpadFormModal,
} from './modals';

type LoadFn = (path?: string) => Promise<void>;
type RenderFn = () => void;

// ---------------------------------------------------------------------------
// Daily note autosave
// ---------------------------------------------------------------------------

let noteSaveTimer: ReturnType<typeof setTimeout> | null = null;

export function bindDailyNote(): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('#daily-note');
  const savedEl = document.querySelector<HTMLElement>('#note-saved');
  if (!textarea) return;
  if (savedEl) savedEl.style.opacity = '0';

  textarea.addEventListener('input', () => {
    const content = textarea.value;
    setDailyNote(content);
    setNoteDirty(true);
    if (noteSaveTimer) clearTimeout(noteSaveTimer);
    if (savedEl) { savedEl.textContent = 'saving…'; savedEl.style.opacity = '1'; }
    noteSaveTimer = setTimeout(async () => {
      await window.senku.saveNote(content);
      if (textarea.value === content) setNoteDirty(false);
      if (savedEl) {
        savedEl.textContent = 'saved';
        setTimeout(() => { if (savedEl) savedEl.style.opacity = '0'; }, 2000);
      }
    }, 1500);
  });
}

// ---------------------------------------------------------------------------
// Main event binding (runs after each render)
// ---------------------------------------------------------------------------

export function bindAll(load: LoadFn, render: RenderFn): void {
  bindNavigation(render);
  bindSidebarButtons(load, render);
  bindTopbarButtons(load);
  bindFileActions(load);
  bindLogBar(load, render);
  bindLaunchpadActions(load);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function bindNavigation(render: RenderFn): void {
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((btn) =>
    btn.addEventListener('click', () => {
      setView(btn.dataset.view ?? 'Home');
      render();
    }),
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function bindSidebarButtons(load: LoadFn, render: RenderFn): void {
  document.querySelector('#workspace-settings')?.addEventListener('click', () => openWorkspaceSettingsModal(load, render));
  document.querySelector('#add-space')?.addEventListener('click', () => openWorkspaceFormModal(load));
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

function bindTopbarButtons(load: LoadFn): void {
  document.querySelector('#refresh-button')?.addEventListener('click', () => void load(state.currentPath));
}

// ---------------------------------------------------------------------------
// File panel actions
// ---------------------------------------------------------------------------

function bindFileActions(load: LoadFn): void {
  const panel = document.querySelector<HTMLElement>('.files-panel');
  if (!panel) return;

  const refreshList = () => {
    const list = panel.querySelector('.file-list');
    if (list) list.innerHTML = fileListMarkup();
    const count = panel.querySelector('#file-count');
    if (count) count.textContent = fileCountLabel();
  };

  panel.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;

    const fileAction = target.closest<HTMLElement>('[data-file-action]');
    if (fileAction) {
      event.stopPropagation();
      const action = fileAction.dataset.fileAction!;
      const filePath = fileAction.dataset.path!;
      if (action === 'copy') {
        await window.senku.copyPath(filePath);
        fileAction.textContent = 'Copied';
        setTimeout(() => { fileAction.textContent = 'Copy path'; }, 1200);
        return;
      }
      const here = state.currentPath;
      if (action === 'pin') await window.senku.pinPath(filePath);
      if (action === 'unpin') await window.senku.unpinPath(filePath);
      await load(here);
      return;
    }

    const open = target.closest<HTMLElement>('[data-open-path]');
    if (open) {
      const p = open.dataset.openPath!;
      if (open.dataset.kind === 'folder') await load(p);
      else await window.senku.openPath(p);
      return;
    }

    if (target.closest('#show-more-files')) { showMoreFiles(); refreshList(); return; }
    if (target.closest('#go-up')) {
      const root = state.workspace?.masterFolder;
      if (root && !isSamePath(state.currentPath, root)) await load(parentOf(state.currentPath));
      return;
    }
    if (target.closest('#go-root')) { await load(state.workspace?.masterFolder); return; }
    if (target.closest('#open-folder')) { await window.senku.openPath(state.currentPath); return; }
    if (target.closest('#open-in-vscode')) {
      const res = await window.senku.openInVSCode(state.currentPath);
      if (!res.ok) alert(res.error ?? 'Could not open VS Code.');
      return;
    }
    if (target.closest('#open-in-terminal')) {
      const res = await window.senku.openInTerminal(state.currentPath);
      if (!res.ok) alert(res.error ?? 'Could not open terminal.');
      return;
    }

    const crumb = target.closest<HTMLElement>('[data-breadcrumb]');
    if (crumb) await load(crumb.dataset.breadcrumb);
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  panel.querySelector<HTMLInputElement>('#file-filter')?.addEventListener('input', (event) => {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(timer);
    timer = setTimeout(() => { setFileFilter(value); refreshList(); }, 120);
  });
}

// ---------------------------------------------------------------------------
// Quick Log bar (always visible at bottom)
// ---------------------------------------------------------------------------

function bindLogBar(load: LoadFn, render: RenderFn): void {
  const input = document.querySelector<HTMLInputElement>('#quick-log-input');
  if (!input) return;

  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const spaceId = state.workspace?.id;
    await window.senku.addLogEntry(text, spaceId);
    await load(state.currentPath);
    // If on Log view, stay there; else just reload silently
    if (currentView === 'Log') render();
  });

  // Ctrl+Enter from anywhere focuses the log bar
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      input.focus();
    }
  }, { capture: true });
}

// ---------------------------------------------------------------------------
// Launchpad actions
// ---------------------------------------------------------------------------

function bindLaunchpadActions(load: LoadFn): void {
  document.querySelector('#add-launchpad')?.addEventListener('click', () => openLaunchpadFormModal(load));

  document.querySelectorAll<HTMLElement>('[data-launch-id]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.launchId!;
      btn.textContent = '⏳ Opening…';
      const res = await window.senku.launchLaunchpad(id);
      if (!res.ok && res.errors.length) alert('Some resources could not be opened:\n' + res.errors.join('\n'));
      btn.textContent = '▷ Launch';
    }),
  );

  document.querySelectorAll<HTMLElement>('[data-delete-lp]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this Launchpad? Your files are not affected.')) return;
      await window.senku.deleteLaunchpad(btn.dataset.deleteLp!);
      await load(state.currentPath);
    }),
  );
}

// ---------------------------------------------------------------------------
// Global listeners — registered ONCE at boot
// ---------------------------------------------------------------------------

export function initGlobalListeners(load: LoadFn, render: RenderFn): void {
  registerShortcuts(load, render);

  document.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;

    if (target.closest('.avatar-button, #profile-avatar-button')) {
      e.preventDefault();
      openProfileModal(render);
      return;
    }

    const switchSpaceBtn = target.closest<HTMLElement>('[data-switch-space]');
    if (switchSpaceBtn) {
      e.preventDefault();
      const spaceId = switchSpaceBtn.dataset.switchSpace;
      if (spaceId) {
        await window.senku.switchWorkspace(spaceId);
        setView('Home');
        await load();
      }
      return;
    }

    if (target.closest('#add-space, #add-space-empty, #topbar-create-space, #create-space-files, #home-add-space')) {
      e.preventDefault();
      openWorkspaceFormModal(load);
      return;
    }
  }, true);
}
