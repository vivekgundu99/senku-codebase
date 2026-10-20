import {
  state,
  setState,
  currentView,
  setView,
  setFileFilter,
  showMoreFiles,
  setLogFilter,
  showMoreLogs,
  visibleLogEntries,
  setActiveNoteId,
  activeNoteId,
} from './state';
import { fileCountLabel, fileListMarkup, logListMarkup } from './markup';
import { isSamePath, parentOf } from './utils';
import { registerShortcuts } from './shortcuts';
import { toast } from './toast';
import { openPalette } from './palette';
import {
  openProfileModal,
  openWorkspaceFormModal,
  openWorkspaceSettingsModal,
  openLaunchpadFormModal,
  openTrashModal,
  openCreateNoteModal,
} from './modals';

type LoadFn = (path?: string) => Promise<void>;
type RenderFn = () => void;

let noteSaveTimer: ReturnType<typeof setTimeout> | undefined;

export function isNoteEditorPendingSave(): boolean {
  return noteSaveTimer !== undefined;
}

// ---------------------------------------------------------------------------
// Main event binding (runs after each render)
// ---------------------------------------------------------------------------

export function bindAll(load: LoadFn, render: RenderFn): void {
  bindNavigation(render);
  bindSidebarButtons(load, render);
  bindTopbarButtons(load, render);
  bindFileActions(load);
  bindHomeActions(load, render);
  bindLogPanel(load);
  bindLaunchpadActions(load);
}

export function bindNotesPanel(load: LoadFn, render: RenderFn): void {
  const panel = document.querySelector<HTMLElement>('.notes-panel');
  if (!panel) return;

  // Create note button
  panel.querySelector('#create-note-btn')?.addEventListener('click', () => openCreateNoteModal(load, render));

  // Open a note from the list
  panel.querySelectorAll<HTMLElement>('[data-open-note]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.openNote!;
      setActiveNoteId(id);
      void window.senku.setActiveNote(id);
      render();
    }),
  );

  // Note title rename
  const titleInput = panel.querySelector<HTMLInputElement>('#notes-title-input');
  const textarea = panel.querySelector<HTMLTextAreaElement>('#notes-editor');
  const statusEl = panel.querySelector<HTMLElement>('#note-save-status');

  if (titleInput) {
    const saveTitle = async () => {
      const noteId = titleInput.dataset.noteId!;
      const newName = titleInput.value.trim();
      if (!newName) return;
      const note = state.notes?.find((n) => n.id === noteId);
      if (note && note.name !== newName) {
        if (noteSaveTimer) {
          clearTimeout(noteSaveTimer);
          noteSaveTimer = undefined;
        }
        if (textarea) {
          try {
            await window.senku.updateNote(noteId, textarea.value);
          } catch {
            // 'Note not found.' swallowed silently
          }
        }
        const { snapshot: snap, id: newId } = await window.senku.renameNote(noteId, newName);
        setActiveNoteId(newId);
        setState(snap);
        render();
      }
    };
    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        titleInput.blur();
      }
    });
    titleInput.addEventListener('blur', () => void saveTitle());
  }

  // Editor autosave
  if (textarea) {
    textarea.addEventListener('input', () => {
      const noteId = textarea.dataset.noteId!;
      const content = textarea.value;
      if (statusEl) { statusEl.textContent = 'saving…'; }
      clearTimeout(noteSaveTimer);
      noteSaveTimer = setTimeout(async () => {
        noteSaveTimer = undefined;
        try {
          const snap = await window.senku.updateNote(noteId, content);
          setState(snap);
          if (statusEl && textarea.value === content) { statusEl.textContent = 'saved'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000); }
        } catch {
          // 'Note not found.' swallowed silently
        }
      }, 1200);
    });
  }

  // Quick append input
  const appendInput = panel.querySelector<HTMLInputElement>('#notes-append-input');
  if (appendInput) {
    appendInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const snippet = appendInput.value.trim();
      if (!snippet) return;
      const noteId = appendInput.dataset.noteId!;
      appendInput.value = '';
      const snap = await window.senku.appendToNote(noteId, snippet);
      setState(snap);
      render();
      // Auto-scroll editor to bottom so user sees appended text
      requestAnimationFrame(() => {
        const updatedEditor = document.querySelector<HTMLTextAreaElement>('#notes-editor');
        if (updatedEditor) {
          updatedEditor.scrollTop = updatedEditor.scrollHeight;
        }
        document.querySelector<HTMLInputElement>('#notes-append-input')?.focus();
      });
    });
  }

  // Export
  panel.querySelector('#notes-export-btn')?.addEventListener('click', async (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.noteId!;
    const res = await window.senku.exportNote(id);
    if (!res.ok && res.error && res.error !== 'Cancelled.') toast(`Export failed: ${res.error}`);
  });

  // Delete note
  panel.querySelector('#notes-delete-btn')?.addEventListener('click', async (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.noteId!;
    const noteToDelete = state.notes?.find((n) => n.id === id);
    if (!noteToDelete) return;
    const snap = await window.senku.deleteNote(id);
    const remaining = snap.notes ?? [];
    setActiveNoteId(remaining[0]?.id ?? null);
    setState(snap);
    render();
    toast('Deleted', {
      actionLabel: 'Undo',
      onAction: async () => {
        const restoredSnap = await window.senku.restoreNote(noteToDelete);
        setActiveNoteId(noteToDelete.id);
        setState(restoredSnap);
        render();
      },
    });
  });
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
  document.querySelector('#open-trash')?.addEventListener('click', () => openTrashModal(load));
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

function bindTopbarButtons(load: LoadFn, render: RenderFn): void {
  document.querySelector('#refresh-button')?.addEventListener('click', () => void load(state.currentPath));
  document.querySelector('#topbar-quicknote')?.addEventListener('click', () => {
    void window.senku.showOverlay();
  });
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
      if (action === 'code') {
        const res = await window.senku.openInVSCode(filePath);
        if (!res.ok) toast(res.error ?? 'Could not open in VS Code.');
        return;
      }
      if (action === 'copy') {
        await window.senku.copyPath(filePath);
        fileAction.textContent = 'Copied';
        setTimeout(() => { fileAction.textContent = 'Copy'; }, 1200);
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
      if (!res.ok) toast(res.error ?? 'Could not open VS Code.');
      return;
    }
    if (target.closest('#open-in-terminal')) {
      const res = await window.senku.openInTerminal(state.currentPath);
      if (!res.ok) toast(res.error ?? 'Could not open terminal.');
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
// Home actions: Quick capture
// ---------------------------------------------------------------------------

function bindHomeActions(load: LoadFn, _render: RenderFn): void {
  const input = document.querySelector<HTMLInputElement>('#home-capture-input');
  const btn = document.querySelector<HTMLButtonElement>('#home-capture-submit');
  if (!input) return;

  const submit = async () => {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    const spaceId = state.workspace?.id;
    await window.senku.addLogEntry(text, spaceId);
    await load(state.currentPath);
    document.querySelector<HTMLInputElement>('#home-capture-input')?.focus();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') void submit();
  });
  btn?.addEventListener('click', () => void submit());
}

function bindLogPanel(load: LoadFn): void {
  const panel = document.querySelector<HTMLElement>('.log-panel');
  if (!panel) return;

  const refreshList = () => {
    const list = panel.querySelector('.log-entries');
    if (list) list.innerHTML = logListMarkup();
    const count = panel.querySelector('.log-count-badge');
    const { matched, total } = visibleLogEntries();
    if (count) count.textContent = matched === total ? `${total} entries` : `${matched} of ${total}`;
  };

  const composeInput = panel.querySelector<HTMLInputElement>('#log-compose-input');
  if (composeInput) {
    composeInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const text = composeInput.value.trim();
      if (!text) return;
      composeInput.value = '';
      const spaceId = state.workspace?.id;
      await window.senku.addLogEntry(text, spaceId);
      await load(state.currentPath);
      refreshList();
      document.querySelector<HTMLInputElement>('#log-compose-input')?.focus();
    });
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  panel.querySelector<HTMLInputElement>('#log-search')?.addEventListener('input', (event) => {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(timer);
    timer = setTimeout(() => { setLogFilter(value); refreshList(); }, 80);
  });

  panel.addEventListener('click', async (e) => {
    const target = e.target as HTMLElement;
    if (target.closest('#show-more-logs')) {
      showMoreLogs();
      refreshList();
      return;
    }
    const delBtn = target.closest<HTMLElement>('[data-delete-log]');
    if (delBtn) {
      const id = delBtn.dataset.deleteLog;
      if (!id) return;
      const entryToDelete = state.logEntries?.find((e) => e.id === id);
      delBtn.style.pointerEvents = 'none';
      delBtn.style.opacity = '0.3';
      try {
        const snap = await window.senku.deleteLogEntry(id);
        setState(snap);
        refreshList();
        if (entryToDelete) {
          toast('Deleted', {
            actionLabel: 'Undo',
            onAction: async () => {
              const restoredSnap = await window.senku.restoreLogEntry(entryToDelete);
              setState(restoredSnap);
              refreshList();
            },
          });
        }
      } catch (err) {
        delBtn.style.pointerEvents = '';
        delBtn.style.opacity = '';
        toast(`Could not delete log: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Launchpad actions
// ---------------------------------------------------------------------------

function bindLaunchpadActions(load: LoadFn): void {
  document.querySelector('#add-launchpad')?.addEventListener('click', () => openLaunchpadFormModal(load));

  document.querySelectorAll<HTMLElement>('[data-open-item]').forEach((chip) =>
    chip.addEventListener('click', async (e) => {
      e.stopPropagation();
      const target = chip.dataset.openItem;
      if (!target) return;
      chip.classList.add('opening');
      try {
        const res = await window.senku.openItem(target);
        if (!res.ok && res.error) {
          toast(`Could not open item: ${res.error}`);
        }
      } catch (err) {
        toast(`Error opening item: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        chip.classList.remove('opening');
      }
    }),
  );

  document.querySelectorAll<HTMLElement>('[data-launch-id]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.launchId!;
      const lp = state.launchpads?.find((p) => p.id === id);
      const name = lp?.name ?? 'Launchpad';
      btn.textContent = '⏳ Opening…';
      const res = await window.senku.launchLaunchpad(id);
      if (res.ok) {
        toast(`Launched ${name}`);
      } else {
        const count = res.errors.length;
        toast(`Launched ${name} · ${count} failed`);
      }
      btn.textContent = '▷ Launch All';
    }),
  );

  document.querySelectorAll<HTMLElement>('[data-edit-lp]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.editLp!;
      const lp = state.launchpads?.find((p) => p.id === id);
      if (lp) openLaunchpadFormModal(load, lp);
    }),
  );

  document.querySelectorAll<HTMLElement>('[data-delete-lp]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.deleteLp!;
      const padToDelete = state.launchpads?.find((p) => p.id === id);
      if (!padToDelete) return;
      await window.senku.deleteLaunchpad(id);
      await load(state.currentPath);
      toast('Deleted', {
        actionLabel: 'Undo',
        onAction: async () => {
          const snap = await window.senku.restoreLaunchpad(padToDelete);
          setState(snap);
          await load(state.currentPath);
        },
      });
    }),
  );
}

// ---------------------------------------------------------------------------
// Global listeners — registered ONCE at boot
// ---------------------------------------------------------------------------

export function initGlobalListeners(load: LoadFn, render: RenderFn): void {
  registerShortcuts(load, render);

  // Global Ctrl+K opens Command Palette
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      openPalette(load, render);
    }
  }, { capture: true });

  // Global Ctrl+Enter focuses quick capture or navigates to Log
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      const homeInput = document.querySelector<HTMLInputElement>('#home-capture-input');
      const logInput = document.querySelector<HTMLInputElement>('#log-compose-input');
      if (homeInput) {
        homeInput.focus();
      } else if (logInput) {
        logInput.focus();
      } else {
        setView('Log');
        render();
        setTimeout(() => document.querySelector<HTMLInputElement>('#log-compose-input')?.focus(), 50);
      }
    }
  }, { capture: true });

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
