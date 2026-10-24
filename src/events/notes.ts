import {
  state,
  setState,
  setActiveNoteId,
  activeNoteId,
  setNoteFilter,
  activeNotePageIndex,
  setActiveNotePageIndex,
  isNoteAllPagesView,
  setIsNoteAllPagesView,
  isNotePreviewMode,
  setIsNotePreviewMode,
  toggleBundleCollapsed,
} from '../state';
import { parseNotePages, joinNotePages } from '../utils';
import { toast } from '../toast';
import { openCreateNoteModal, openCreateBundleModal } from '../modals';
import type { LoadFn, RenderFn } from './types';

let noteSaveTimer: ReturnType<typeof setTimeout> | undefined;

export function isNoteEditorPendingSave(): boolean {
  return noteSaveTimer !== undefined;
}

export function bindNotesPanel(load: LoadFn, render: RenderFn): void {
  const panel = document.querySelector<HTMLElement>('.notes-panel');
  if (!panel) return;

  // Create note buttons
  const openNewNote = () => openCreateNoteModal(load, render);
  panel.querySelector('#create-note-btn')?.addEventListener('click', openNewNote);
  panel.querySelector('#create-note-empty-btn')?.addEventListener('click', openNewNote);
  panel.querySelector('#create-note-placeholder-btn')?.addEventListener('click', openNewNote);

  // Search notes expandable
  const searchExpandable = panel.querySelector<HTMLElement>('#notes-search-expandable');
  const searchTrigger = panel.querySelector<HTMLElement>('#notes-search-trigger');
  const searchClear = panel.querySelector<HTMLElement>('#notes-search-clear');
  const searchInput = panel.querySelector<HTMLInputElement>('#notes-search-input');

  searchTrigger?.addEventListener('click', () => {
    searchExpandable?.classList.add('open');
    searchInput?.focus();
    searchInput?.select();
  });

  searchClear?.addEventListener('click', () => {
    if (searchInput) searchInput.value = '';
    setNoteFilter('');
    render();
    const nextExp = document.querySelector<HTMLElement>('#notes-search-expandable');
    nextExp?.classList.remove('open');
  });

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

    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        setNoteFilter('');
        render();
        const nextExp = document.querySelector<HTMLElement>('#notes-search-expandable');
        nextExp?.classList.remove('open');
      }
    });
  }

  // Create bundle button
  panel.querySelector('#create-bundle-btn')?.addEventListener('click', () => {
    openCreateBundleModal(load, render);
  });

  // Bundle toggle expand/collapse
  panel.querySelectorAll<HTMLElement>('.notes-bundle-row').forEach((row) => {
    row.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.notes-bundle-menu-btn')) return;
      const bundle = row.dataset.bundle;
      if (!bundle) return;
      toggleBundleCollapsed(bundle);
      render();
    });
  });

  // Bundle menu button
  panel.querySelectorAll<HTMLElement>('.notes-bundle-menu-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const bundleName = btn.dataset.bundle;
      if (!bundleName) return;

      document.querySelectorAll('.context-popover').forEach((p) => p.remove());

      const popover = document.createElement('div');
      popover.className = 'context-popover bundle-popover';
      popover.innerHTML = `
        <button class="context-popover-item" id="bundle-menu-vscode">
          <span>Open in VS Code</span>
        </button>
        <button class="context-popover-item" id="bundle-menu-export">
          <span>Export as Markdown</span>
        </button>
        <button class="context-popover-item danger" id="bundle-menu-delete">
          <span>Delete Folder</span>
        </button>
      `;

      document.body.appendChild(popover);

      const rect = btn.getBoundingClientRect();
      popover.style.top = `${rect.bottom + 4}px`;
      popover.style.left = `${Math.max(8, rect.left - 120)}px`;

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
        const res = await window.senku.openBundleInVSCode(bundleName);
        if (!res.ok) {
          toast(res.error ?? 'Could not open folder in VS Code.');
        }
      });

      popover.querySelector('#bundle-menu-export')?.addEventListener('click', async () => {
        closePopover();
        const res = await window.senku.exportBundle(bundleName);
        if (!res.ok && res.error && res.error !== 'Cancelled.') {
          toast(`Export failed: ${res.error}`);
        }
      });

      popover.querySelector('#bundle-menu-delete')?.addEventListener('click', async () => {
        closePopover();
        const count = state.notes?.filter((n) => n.bundle === bundleName).length ?? 0;
        const msg = count > 0
          ? `Delete "${bundleName}" and all ${count} note(s) inside?`
          : `Delete folder "${bundleName}"?`;
        if (!confirm(msg)) return;

        const snap = await window.senku.deleteBundle(bundleName);
        setState(snap);
        render();
        toast(`Deleted folder "${bundleName}"`);
      });
    });
  });

  // Select note
  panel.querySelectorAll<HTMLElement>('.notes-item').forEach((item) => {
    item.addEventListener('click', async (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('.notes-item-menu-btn')) return;
      const id = item.dataset.noteId;
      if (!id || id === activeNoteId) return;

      if (noteSaveTimer && textarea) {
        clearTimeout(noteSaveTimer);
        noteSaveTimer = undefined;
        try {
          const curNoteId = textarea.dataset.noteId;
          if (curNoteId) {
            const snap = await window.senku.updateNote(curNoteId, getFullNoteContent(textarea.value));
            setState(snap);
          }
        } catch {}
      }

      setActiveNoteId(id);
      render();
    });
  });

  // Title rename
  const titleInput = panel.querySelector<HTMLInputElement>('#notes-title-input');
  const textarea = panel.querySelector<HTMLTextAreaElement>('#notes-editor');
  const statusEl = panel.querySelector<HTMLElement>('#note-save-status');

  const getFullNoteContent = (currentPaneText: string): string => {
    if (isNoteAllPagesView) return currentPaneText;
    const note = state.notes?.find((n) => n.id === activeNoteId);
    if (!note) return currentPaneText;
    const pages = parseNotePages(note.content);
    const curIdx = Math.min(Math.max(0, activeNotePageIndex), Math.max(0, pages.length - 1));
    pages[curIdx] = currentPaneText;
    return joinNotePages(pages);
  };

  const flushNoteSave = async () => {
    if (noteSaveTimer) {
      clearTimeout(noteSaveTimer);
      noteSaveTimer = undefined;
    }
    if (textarea) {
      const noteId = textarea.dataset.noteId;
      if (noteId) {
        const full = getFullNoteContent(textarea.value);
        try {
          const snap = await window.senku.updateNote(noteId, full);
          setState(snap);
          if (statusEl) {
            statusEl.textContent = 'saved';
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 1500);
          }
        } catch {}
      }
    }
  };

  if (titleInput) {
    const saveTitle = async () => {
      const noteId = titleInput.dataset.noteId!;
      const newName = titleInput.value.trim();
      if (!newName) return;
      const note = state.notes?.find((n) => n.id === noteId);
      if (note && note.name !== newName) {
        await flushNoteSave();
        const { snapshot: snap, id: newId } = await window.senku.renameNote(noteId, newName);
        setActiveNoteId(newId);
        setState(snap);
        render();
      }
    };

    titleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        titleInput.blur();
      }
    });
    titleInput.addEventListener('blur', () => void saveTitle());
  }

  // Preview / Edit toggle
  panel.querySelector('#notes-preview-toggle-btn')?.addEventListener('click', async () => {
    await flushNoteSave();
    setIsNotePreviewMode(!isNotePreviewMode);
    render();
  });

  // Intercept links in preview mode
  panel.querySelectorAll<HTMLAnchorElement>('#notes-markdown-preview a').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const href = a.getAttribute('href');
      if (href) void window.senku.openPath(href);
    });
  });

  // Interactive task checkboxes in markdown preview mode
  const previewEl = panel.querySelector<HTMLElement>('#notes-markdown-preview');
  if (previewEl) {
    const checkboxes = previewEl.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    checkboxes.forEach((cb, index) => {
      cb.removeAttribute('disabled');
      cb.addEventListener('change', async () => {
        const note = state.notes?.find((n) => n.id === activeNoteId);
        if (!note) return;
        const pages = parseNotePages(note.content);
        const curIdx = Math.min(Math.max(0, activeNotePageIndex), Math.max(0, pages.length - 1));
        const targetText = isNoteAllPagesView ? note.content : (pages[curIdx] ?? '');

        let occurrence = 0;
        const taskRegex = /^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/gm;
        const updatedText = targetText.replace(taskRegex, (match, prefix, _check, suffix) => {
          if (occurrence === index) {
            occurrence++;
            return `${prefix}${cb.checked ? 'x' : ' '}${suffix}`;
          }
          occurrence++;
          return match;
        });

        if (isNoteAllPagesView) {
          note.content = updatedText;
        } else {
          pages[curIdx] = updatedText;
          note.content = joinNotePages(pages);
        }

        const snap = await window.senku.updateNote(note.id, note.content);
        setState(snap);
      });
    });
  }

  // Editor autosave (relaxed 4s debounce + save immediately on blur)
  if (textarea) {
    textarea.addEventListener('input', () => {
      const noteId = textarea.dataset.noteId!;
      const full = getFullNoteContent(textarea.value);
      if (statusEl) { statusEl.textContent = 'saving…'; }
      clearTimeout(noteSaveTimer);
      noteSaveTimer = setTimeout(async () => {
        noteSaveTimer = undefined;
        try {
          const snap = await window.senku.updateNote(noteId, full);
          setState(snap);
          if (statusEl && textarea && (isNoteAllPagesView ? textarea.value === full : true)) {
            statusEl.textContent = 'saved';
            setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000);
          }
        } catch {
          // 'Note not found.' swallowed silently
        }
      }, 4000);
    });

    textarea.addEventListener('blur', () => {
      void flushNoteSave();
    });
  }

  // Page Navigation
  panel.querySelector('#notes-page-prev')?.addEventListener('click', async () => {
    await flushNoteSave();
    if (activeNotePageIndex > 0) {
      setActiveNotePageIndex(activeNotePageIndex - 1);
      setIsNoteAllPagesView(false);
      render();
    }
  });

  panel.querySelector('#notes-page-next')?.addEventListener('click', async () => {
    await flushNoteSave();
    const note = state.notes?.find((n) => n.id === activeNoteId);
    const curPages = parseNotePages(note?.content || '');
    if (activeNotePageIndex < curPages.length - 1) {
      setActiveNotePageIndex(activeNotePageIndex + 1);
      setIsNoteAllPagesView(false);
      render();
    }
  });

  panel.querySelectorAll<HTMLElement>('.notes-page-circle[data-page-index]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await flushNoteSave();
      const idx = parseInt(btn.dataset.pageIndex ?? '0', 10);
      setActiveNotePageIndex(idx);
      setIsNoteAllPagesView(false);
      render();
    });
  });

  panel.querySelector('#notes-page-add')?.addEventListener('click', async () => {
    await flushNoteSave();
    const note = state.notes?.find((n) => n.id === activeNoteId);
    if (note) {
      const curPages = parseNotePages(note.content);
      curPages.push('');
      const full = joinNotePages(curPages);
      note.content = full;
      const snap = await window.senku.updateNote(note.id, full);
      setState(snap);
      setActiveNotePageIndex(curPages.length - 1);
      setIsNoteAllPagesView(false);
      setIsNotePreviewMode(false);
      render();
      document.querySelector<HTMLTextAreaElement>('#notes-editor')?.focus();
    }
  });

  panel.querySelector('#notes-page-delete')?.addEventListener('click', async () => {
    const note = state.notes?.find((n) => n.id === activeNoteId);
    if (note) {
      const curPages = parseNotePages(note.content);
      if (curPages.length > 1) {
        const pageText = curPages[activeNotePageIndex]?.trim();
        if (pageText && !confirm(`Delete Page ${activeNotePageIndex + 1}?`)) return;
        if (noteSaveTimer) {
          clearTimeout(noteSaveTimer);
          noteSaveTimer = undefined;
        }
        curPages.splice(activeNotePageIndex, 1);
        const full = joinNotePages(curPages);
        note.content = full;
        const snap = await window.senku.updateNote(note.id, full);
        setState(snap);
        setActiveNotePageIndex(Math.max(0, activeNotePageIndex - 1));
        render();
      }
    }
  });

  panel.querySelector('#notes-toggle-all-view')?.addEventListener('click', async () => {
    await flushNoteSave();
    setIsNoteAllPagesView(!isNoteAllPagesView);
    render();
  });

  // Open in VS Code
  panel.querySelector('#notes-vscode-btn')?.addEventListener('click', async (e) => {
    const id = (e.currentTarget as HTMLElement).dataset.noteId!;
    await flushNoteSave();
    const res = await window.senku.openNoteInVSCode(id);
    if (!res.ok) {
      toast(res.error ?? 'Could not open in VS Code.');
    }
  });

  // Note menu popover
  panel.querySelectorAll<HTMLElement>('.notes-item-menu-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.noteId!;
      const note = state.notes?.find((n) => n.id === id);
      if (!note) return;

      document.querySelectorAll('.context-popover').forEach((p) => p.remove());

      const popover = document.createElement('div');
      popover.className = 'context-popover';
      popover.innerHTML = `
        <button class="context-popover-item" id="note-menu-export">
          <span>Export as Markdown</span>
        </button>
        <button class="context-popover-item danger" id="note-menu-delete">
          <span>Delete Note</span>
        </button>
      `;

      document.body.appendChild(popover);

      const rect = btn.getBoundingClientRect();
      popover.style.top = `${rect.bottom + 4}px`;
      popover.style.left = `${Math.max(8, rect.left - 130)}px`;

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

      popover.querySelector('#note-menu-export')?.addEventListener('click', async () => {
        closePopover();
        const res = await window.senku.exportNote(id);
        if (!res.ok && res.error && res.error !== 'Cancelled.') toast(`Export failed: ${res.error}`);
      });

      popover.querySelector('#note-menu-delete')?.addEventListener('click', async () => {
        closePopover();
        const snap = await window.senku.deleteNote(id);
        const remaining = snap.notes ?? [];
        setActiveNoteId(remaining[0]?.id ?? null);
        setState(snap);
        render();
        toast('Deleted', {
          actionLabel: 'Undo',
          onAction: async () => {
            const restoredSnap = await window.senku.restoreNote(note);
            setActiveNoteId(note.id);
            setState(restoredSnap);
            render();
          },
        });
      });
    });
  });
}
