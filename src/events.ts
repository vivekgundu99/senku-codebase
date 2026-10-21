import {
  state,
  setState,
  currentView,
  setView,
  setFileFilter,
  showMoreFiles,
  setLogFilter,
  logFilter,
  showMoreLogs,
  visibleLogEntries,
  setActiveNoteId,
  activeNoteId,
  setNoteFilter,
  setLogFromDate,
  setLogToDate,
  resetLogDates,
  logFromDate,
  logToDate,
  allLog,
  setAllLog,
  toggleBundleCollapsed,
  homeLogDraft,
  setHomeLogDraft,
  logPageDraft,
  setLogPageDraft,
} from './state';
import { fileCountLabel, fileListMarkup, logListMarkup, uiIcon } from './markup';
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
  openCreateBundleModal,
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
  bindNavigation(load, render);
  bindSidebarButtons(load, render);
  bindTopbarButtons(load, render);
  bindFileActions(load);
  bindHomeActions(load, render);
  bindLogPanel(load, render);
  bindLaunchpadActions(load);
}

export function bindNotesPanel(load: LoadFn, render: RenderFn): void {
  const panel = document.querySelector<HTMLElement>('.notes-panel');
  if (!panel) return;

  // Create note buttons
  const openNewNote = () => openCreateNoteModal(load, render);
  panel.querySelector('#create-note-btn')?.addEventListener('click', openNewNote);
  panel.querySelector('#create-note-empty-btn')?.addEventListener('click', openNewNote);
  panel.querySelector('#create-note-placeholder-btn')?.addEventListener('click', openNewNote);

  // Search notes input
  const searchInput = panel.querySelector<HTMLInputElement>('#notes-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      setNoteFilter(searchInput.value);
      render();
      const nextInput = document.querySelector<HTMLInputElement>('#notes-search-input');
      if (nextInput) {
        nextInput.focus();
        nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
      }
    });
  }

  // Create bundle button
  panel.querySelector('#create-bundle-btn')?.addEventListener('click', () => openCreateBundleModal(load, render));

  // Toggle bundle expand/collapse
  panel.querySelectorAll<HTMLElement>('[data-toggle-bundle]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const bundle = btn.dataset.toggleBundle;
      if (bundle) {
        toggleBundleCollapsed(bundle);
        render();
      }
    }),
  );

  // Add note into a specific bundle
  panel.querySelectorAll<HTMLElement>('[data-add-to-bundle]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const bundle = btn.dataset.addToBundle;
      openCreateNoteModal(load, render, bundle);
    }),
  );

  // Folder options menu (Open in VS Code, Delete folder)
  panel.querySelectorAll<HTMLElement>('[data-bundle-menu]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const bundle = btn.dataset.bundleMenu;
      if (!bundle) return;

      document.querySelectorAll('.bundle-menu-popover').forEach((p) => p.remove());

      const popover = document.createElement('div');
      popover.className = 'bundle-menu-popover';
      popover.innerHTML = `
        <button class="bundle-menu-item" id="bundle-menu-vscode">
          ${uiIcon('code', 13)}
          <span>Open in VS Code</span>
        </button>
        <button class="bundle-menu-item danger" id="bundle-menu-delete">
          ${uiIcon('x', 13)}
          <span>Delete Folder</span>
        </button>
      `;

      const rect = btn.getBoundingClientRect();
      popover.style.top = `${rect.bottom + 4}px`;
      popover.style.left = `${Math.max(10, rect.right - 145)}px`;

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

      popover.querySelector('#bundle-menu-vscode')?.addEventListener('click', async () => {
        closePopover();
        const res = await window.senku.openBundleInVSCode(bundle);
        if (!res.ok) toast(res.error ?? 'Could not open folder in VS Code.');
      });

      popover.querySelector('#bundle-menu-delete')?.addEventListener('click', async () => {
        closePopover();
        if (!confirm(`Delete folder "${bundle}" and all notes inside it?`)) return;
        const snap = await window.senku.deleteBundle(bundle);
        setState(snap);
        render();
      });
    }),
  );

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

  // Open in VS Code
  panel.querySelector('#notes-vscode-btn')?.addEventListener('click', async (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.noteId!;
    if (textarea && noteSaveTimer) {
      clearTimeout(noteSaveTimer);
      noteSaveTimer = undefined;
      await window.senku.updateNote(id, textarea.value);
      if (statusEl) { statusEl.textContent = 'saved'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000); }
    }
    const res = await window.senku.openNoteInVSCode(id);
    if (!res.ok) {
      toast(res.error ?? 'Could not open in VS Code.');
    }
  });

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

function bindNavigation(load: LoadFn, render: RenderFn): void {
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const view = btn.dataset.view ?? 'Home';
      setView(view);
      if (view === 'AllLog') {
        const all = await window.senku.listAllLogs();
        setAllLog(all);
      }
      render();
    }),
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function bindSidebarButtons(load: LoadFn, _render: RenderFn): void {
  document.querySelector('#open-trash')?.addEventListener('click', () => openTrashModal(load));
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

function bindTopbarButtons(load: LoadFn, render: RenderFn): void {
  document.querySelector('#refresh-button')?.addEventListener('click', () => void load(state.currentPath));
  document.querySelector('#settings-button')?.addEventListener('click', () => openProfileModal(render));

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
        <kbd class="tools-menu-key">O</kbd>
      </button>
      <button class="tools-menu-item" id="tools-palette">
        <span class="tools-menu-icon">${uiIcon('search', 13)}</span>
        <div class="tools-menu-text">
          <span class="tools-menu-label">Command Palette</span>
          <span class="tools-menu-sub">Search and navigation</span>
        </div>
        <kbd class="tools-menu-key">Ctrl+K</kbd>
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

/** Chat-style send key: Enter sends, Shift+Enter inserts a new line. */
function isSendKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing;
}

/** Grow a textarea with its content (like a chat box), up to a maximum height. */
function growTextarea(el: HTMLTextAreaElement, minPx: number, maxPx = 200): void {
  el.style.height = 'auto';
  el.style.height = `${Math.min(maxPx, Math.max(minPx, el.scrollHeight))}px`;
  el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
}

function bindHomeActions(load: LoadFn, render: RenderFn): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('#home-capture-textarea');
  const btn = document.querySelector<HTMLButtonElement>('#home-capture-submit');

  const adjustHomeHeight = () => {
    if (!textarea) return;
    // Set to single-line base height first to measure scrollHeight accurately
    textarea.style.height = '22px';
    const scrollH = textarea.scrollHeight;
    if (scrollH > 26) {
      // Pro-dev Shift+Enter multiline Easter Egg: strictly enlarge by that extra line
      const targetH = Math.min(180, scrollH);
      textarea.style.height = `${targetH}px`;
      textarea.style.overflowY = scrollH > 180 ? 'auto' : 'hidden';
    } else {
      textarea.style.height = '22px';
      textarea.style.overflowY = 'hidden';
    }
  };

  if (textarea) {
    textarea.addEventListener('input', () => {
      setHomeLogDraft(textarea.value);
      adjustHomeHeight();
    });
    adjustHomeHeight();
    textarea.addEventListener('keydown', (e) => {
      if (isSendKey(e)) {
        e.preventDefault();
        void submit();
      }
    });
  }

  const submit = async () => {
    const rawVal = textarea ? textarea.value : homeLogDraft;
    const text = rawVal.trim();
    if (!text) return;
    setHomeLogDraft('');
    if (textarea) {
      textarea.value = '';
      textarea.style.height = '22px';
      textarea.style.overflowY = 'hidden';
    }
    const spaceId = state.workspace?.id;
    await window.senku.addLogEntry(text, spaceId);
    await load(state.currentPath);
    render();
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLTextAreaElement>('#home-capture-textarea');
      if (el) {
        el.focus();
        el.style.height = '22px';
        el.style.overflowY = 'hidden';
      }
    });
  };

  btn?.addEventListener('click', () => void submit());

  document.querySelector('#home-add-launchpad')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openLaunchpadFormModal(load);
  });

  document.querySelectorAll<HTMLElement>('[data-launch-home-id]').forEach((launchBtn) => {
    launchBtn.addEventListener('click', async () => {
      const id = launchBtn.dataset.launchHomeId!;
      const spaceId = launchBtn.dataset.spaceId;
      const pad = state.home?.launchpads?.find((p) => p.id === id);
      const name = pad?.name ?? 'Launchpad';
      launchBtn.textContent = 'Launching…';
      const res = await window.senku.launchLaunchpad(id, spaceId);
      if (res.ok) {
        toast(`Launched ${name}`);
      } else {
        const count = res.errors.length;
        toast(`Launched ${name} · ${count} failed`);
      }
      await load();
    });
  });
}

function bindLogPanel(load: LoadFn, render: RenderFn): void {
  const panel = document.querySelector<HTMLElement>('.log-panel');
  if (!panel) return;

  const scope = (panel.dataset.scope as 'space' | 'all') || 'space';

  const refreshList = () => {
    const list = panel.querySelector('.log-entries');
    if (list) list.innerHTML = logListMarkup(scope);
    const count = panel.querySelector('.log-count-badge');
    const { matched, total } = visibleLogEntries(scope);
    if (count) count.textContent = logFilter.trim() || logFromDate || logToDate ? `${matched} of ${total}` : '';
  };

  // Scope switcher
  panel.querySelectorAll<HTMLElement>('[data-log-scope]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const targetScope = btn.dataset.logScope;
      if (targetScope === 'all') {
        setView('AllLog');
        const all = await window.senku.listAllLogs();
        setAllLog(all);
        render();
      } else {
        setView('Log');
        await load(state.currentPath);
        render();
      }
    });
  });

  const textarea = panel.querySelector<HTMLTextAreaElement>('#log-compose-textarea');

  const adjustLogHeight = () => {
    if (!textarea) return;
    textarea.style.height = '22px';
    const scrollH = textarea.scrollHeight;
    if (scrollH > 26) {
      const targetH = Math.min(180, scrollH);
      textarea.style.height = `${targetH}px`;
      textarea.style.overflowY = scrollH > 180 ? 'auto' : 'hidden';
    } else {
      textarea.style.height = '22px';
      textarea.style.overflowY = 'hidden';
    }
  };

  if (textarea) {
    textarea.addEventListener('input', () => {
      setLogPageDraft(textarea.value);
      adjustLogHeight();
    });
    adjustLogHeight();
    textarea.addEventListener('keydown', (e) => {
      if (isSendKey(e)) {
        e.preventDefault();
        void submit();
      }
    });
  }

  const submit = async () => {
    const rawVal = textarea ? textarea.value : logPageDraft;
    const text = rawVal.trim();
    if (!text) return;
    setLogPageDraft('');
    if (textarea) {
      textarea.value = '';
      textarea.style.height = '22px';
      textarea.style.overflowY = 'hidden';
    }
    const spaceId = state.workspace?.id;
    await window.senku.addLogEntry(text, spaceId);
    await load(state.currentPath);
    render();
    requestAnimationFrame(() => {
      document.querySelector<HTMLTextAreaElement>('#log-compose-textarea')?.focus();
    });
  };

  // Search on Enter or button click
  const searchInput = panel.querySelector<HTMLInputElement>('#log-search');
  const triggerSearch = () => {
    const val = searchInput ? searchInput.value : '';
    setLogFilter(val);
    refreshList();
  };

  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      triggerSearch();
    }
  });

  panel.querySelector('#log-search-btn')?.addEventListener('click', () => {
    triggerSearch();
  });

  // Date range filter
  const fromInput = panel.querySelector<HTMLInputElement>('#log-from-date');
  fromInput?.addEventListener('change', (e) => {
    setLogFromDate((e.target as HTMLInputElement).value);
    refreshList();
  });

  const toInput = panel.querySelector<HTMLInputElement>('#log-to-date');
  toInput?.addEventListener('change', (e) => {
    setLogToDate((e.target as HTMLInputElement).value);
    refreshList();
  });

  panel.querySelector('#reset-log-dates')?.addEventListener('click', () => {
    resetLogDates();
    if (fromInput) fromInput.value = logFromDate;
    if (toInput) toInput.value = logToDate;
    refreshList();
  });

  // Lazy loading on scroll
  const entriesEl = panel.querySelector<HTMLElement>('.log-entries');
  entriesEl?.addEventListener('scroll', () => {
    if (entriesEl.scrollTop + entriesEl.clientHeight >= entriesEl.scrollHeight - 60) {
      const { matched, items } = visibleLogEntries(scope);
      if (items.length < matched) {
        showMoreLogs();
        refreshList();
      }
    }
  });

  // Double-click inline edit
  panel.querySelector('.log-entries')?.addEventListener('dblclick', (e) => {
    const target = e.target as HTMLElement;
    const textEl = target.closest<HTMLElement>('.log-row-text');
    if (!textEl) return;
    const row = textEl.closest<HTMLElement>('.log-row-compact');
    if (!row) return;

    const id = row.dataset.id;
    const spaceId = row.dataset.spaceId;
    if (!id) return;

    const originalText = textEl.textContent || '';
    const editTextarea = document.createElement('textarea');
    editTextarea.className = 'log-row-edit-textarea';
    editTextarea.value = originalText;
    editTextarea.rows = Math.max(2, originalText.split('\n').length);
    textEl.replaceWith(editTextarea);
    editTextarea.focus();
    editTextarea.select();

    let committed = false;
    const save = async () => {
      if (committed) return;
      committed = true;
      const newText = editTextarea.value.trim();
      if (newText && newText !== originalText) {
        await window.senku.updateLogEntry(id, newText, spaceId);
        if (scope === 'all') {
          const all = await window.senku.listAllLogs();
          setAllLog(all);
        } else {
          await load(state.currentPath);
        }
      }
      refreshList();
    };

    const cancel = () => {
      if (committed) return;
      committed = true;
      refreshList();
    };

    editTextarea.addEventListener('keydown', (ev) => {
      if (isSendKey(ev)) {
        ev.preventDefault();
        void save();
      } else if (ev.key === 'Escape') {
        ev.preventDefault();
        cancel();
      }
    });
    editTextarea.addEventListener('blur', () => void save());
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
      const spaceId = delBtn.dataset.spaceId;
      if (!id) return;
      const allEntries = scope === 'all' ? allLog : (state.logEntries ?? []);
      const entryToDelete = allEntries.find((item) => item.id === id);
      delBtn.style.pointerEvents = 'none';
      delBtn.style.opacity = '0.3';
      try {
        const snap = await window.senku.deleteLogEntry(id, spaceId);
        setState(snap);
        if (scope === 'all') {
          const all = await window.senku.listAllLogs();
          setAllLog(all);
        }
        refreshList();
        if (entryToDelete) {
          toast('Deleted', {
            actionLabel: 'Undo',
            onAction: async () => {
              const restoredSnap = await window.senku.restoreLogEntry(entryToDelete);
              setState(restoredSnap);
              if (scope === 'all') {
                const all = await window.senku.listAllLogs();
                setAllLog(all);
              }
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

  document.querySelectorAll<HTMLElement>('[data-pin-lp]').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.pinLp!;
      const isPinned = btn.dataset.pinned === 'true';
      await window.senku.setLaunchpadPinned(id, !isPinned);
      await load(state.currentPath);
    }),
  );

  document.querySelectorAll<HTMLElement>('[data-launch-id]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const id = btn.dataset.launchId!;
      const lp = state.launchpads?.find((p) => p.id === id);
      const name = lp?.name ?? 'Launchpad';
      const origHtml = btn.innerHTML;
      btn.textContent = 'Opening…';
      const res = await window.senku.launchLaunchpad(id);
      if (res.ok) {
        toast(`Launched ${name}`);
      } else {
        const count = res.errors.length;
        toast(`Launched ${name} · ${count} failed`);
      }
      btn.innerHTML = origHtml;
      await load(state.currentPath);
    }),
  );

  document.querySelectorAll<HTMLElement>('[data-lp-menu]').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const id = btn.dataset.lpMenu;
      if (!id) return;
      const lp = state.launchpads?.find((p) => p.id === id);
      if (!lp) return;

      document.querySelectorAll('.lp-menu-popover').forEach((p) => p.remove());

      const popover = document.createElement('div');
      popover.className = 'lp-menu-popover';
      popover.innerHTML = `
        <button class="lp-menu-item" id="lp-menu-edit">
          ${uiIcon('pen', 12)}
          <span>Edit</span>
        </button>
        <button class="lp-menu-item danger" id="lp-menu-delete">
          ${uiIcon('x', 12)}
          <span>Delete</span>
        </button>
      `;

      const rect = btn.getBoundingClientRect();
      popover.style.top = `${rect.bottom + 4}px`;
      popover.style.left = `${Math.max(10, rect.right - 140)}px`;

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

      popover.querySelector('#lp-menu-edit')?.addEventListener('click', () => {
        closePopover();
        openLaunchpadFormModal(load, lp);
      });

      popover.querySelector('#lp-menu-delete')?.addEventListener('click', async () => {
        closePopover();
        await window.senku.deleteLaunchpad(lp.id);
        await load(state.currentPath);
        toast(`Deleted ${lp.name}`, {
          actionLabel: 'Undo',
          onAction: async () => {
            const snap = await window.senku.restoreLaunchpad(lp);
            setState(snap);
            await load(state.currentPath);
          },
        });
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
      openProfileModal(render);
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
