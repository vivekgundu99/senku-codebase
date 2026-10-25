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
  toggleNotesSidebarCollapsed,
} from '../state';
import { parseNotePages, joinNotePages } from '../utils';
import { uiIcon } from '../markup';
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
        <button class="bundle-menu-item" id="bundle-menu-export">
          ${uiIcon('folder', 13)}
          <span>Export Folder (.md)</span>
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

      popover.querySelector('#bundle-menu-export')?.addEventListener('click', async () => {
        closePopover();
        const res = await window.senku.exportBundle(bundle);
        if (res.ok) {
          toast(`Exported "${bundle}" (${res.count ?? 0} notes) to Downloads.`);
        } else if (res.error && res.error !== 'Cancelled.') {
          toast(`Export failed: ${res.error}`);
        }
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

  // Helper to resolve full note content considering multi-page mode
  const getFullNoteContent = (val: string): string => {
    if (!textarea) return val;
    const noteId = textarea.dataset.noteId;
    const note = state.notes?.find((n) => n.id === noteId);
    if (!note) return val;

    if (isNoteAllPagesView) {
      note.content = val;
      return val;
    }

    const curPages = parseNotePages(note.content);
    while (curPages.length <= activeNotePageIndex) curPages.push('');
    curPages[activeNotePageIndex] = val;
    const full = joinNotePages(curPages);
    note.content = full;
    return full;
  };

  const flushNoteSave = async (): Promise<void> => {
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
        e.preventDefault();
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

    textarea.addEventListener('keydown', (e) => {
      if ((e.altKey && e.key === 'ArrowLeft') || e.key === 'PageUp') {
        e.preventDefault();
        void goToPrevPage();
      } else if ((e.altKey && e.key === 'ArrowRight') || e.key === 'PageDown') {
        e.preventDefault();
        void goToNextPage();
      }
    });
  }

  // Page Navigation functions
  const goToPrevPage = async () => {
    await flushNoteSave();
    if (activeNotePageIndex > 0) {
      setActiveNotePageIndex(activeNotePageIndex - 1);
      setIsNoteAllPagesView(false);
      render();
    }
  };

  const goToNextPage = async () => {
    await flushNoteSave();
    const note = state.notes?.find((n) => n.id === activeNoteId);
    const curPages = parseNotePages(note?.content || '');
    if (activeNotePageIndex < curPages.length - 1) {
      setActiveNotePageIndex(activeNotePageIndex + 1);
      setIsNoteAllPagesView(false);
      render();
    }
  };

  // Keyboard navigation for page swapping & sidebar toggle across notes panel (anywhere on screen)
  const onNotesKeydown = (e: KeyboardEvent) => {
    if (!document.contains(panel)) {
      document.removeEventListener('keydown', onNotesKeydown);
      return;
    }
    if (document.querySelector('.modal-backdrop, .palette-backdrop')) return;

    if ((e.ctrlKey || e.metaKey) && (e.key === '\\' || e.key === 'b')) {
      e.preventDefault();
      toggleNotesSidebarCollapsed();
      render();
      return;
    }
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === 'ArrowLeft' || e.key === 'PageUp') {
      e.preventDefault();
      void goToPrevPage();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      void goToNextPage();
    }
  };
  document.addEventListener('keydown', onNotesKeydown);

  // Sidebar toggle button
  panel.querySelectorAll('#notes-sidebar-toggle-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleNotesSidebarCollapsed();
      render();
    });
  });

  // Page Navigation
  panel.querySelector('#notes-page-prev')?.addEventListener('click', () => {
    void goToPrevPage();
  });

  panel.querySelector('#notes-page-next')?.addEventListener('click', () => {
    void goToNextPage();
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

  // Auto-scroll active page circle into view when navigating pages
  requestAnimationFrame(() => {
    panel.querySelector('.notes-page-circle.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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

  // Note options menu (Export Note & Delete Note)
  panel.querySelector('#notes-options-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    const btn = e.currentTarget as HTMLElement;
    const id = btn.dataset.noteId;
    if (!id) return;
    const note = state.notes?.find((n) => n.id === id);
    if (!note) return;

    document.querySelectorAll('.bundle-menu-popover, .notes-options-popover').forEach((p) => p.remove());

    const popover = document.createElement('div');
    popover.className = 'bundle-menu-popover notes-options-popover';
    popover.innerHTML = `
      <button class="bundle-menu-item" id="note-menu-export">
        ${uiIcon('folder', 13)}
        <span>Export Note (.md)</span>
      </button>
      <button class="bundle-menu-item danger" id="note-menu-delete">
        ${uiIcon('x', 13)}
        <span>Delete Note</span>
      </button>
    `;

    const rect = btn.getBoundingClientRect();
    popover.style.top = `${rect.bottom + 4}px`;
    popover.style.right = `${Math.max(10, window.innerWidth - rect.right)}px`;

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

    popover.querySelector('#note-menu-export')?.addEventListener('click', async () => {
      closePopover();
      const res = await window.senku.exportNote(id);
      if (res.ok) {
        toast(`Exported "${note.name}" to Downloads.`);
      } else if (res.error && res.error !== 'Cancelled.') {
        toast(`Export failed: ${res.error}`);
      }
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
}
