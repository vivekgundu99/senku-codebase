import {
  state,
  setView,
  isGlobalNotesMode,
  setGlobalNotesMode,
  homeCenterMode,
  setHomeCenterMode,
  activeMarkdownFile,
  setActiveMarkdownFile,
  isNotePreviewMode,
  setIsNotePreviewMode,
  setActiveNotePageIndex,
  setIsNoteAllPagesView,
  setCurrentFolder,
  setFilePaneCompact,
} from './state';
import { fuzzyMatch, escapeHtml, parseNotePages, PAGE_SEPARATOR } from './utils';
import { toast } from './toast';
import {
  openWorkspaceFormModal,
  openAppSettingsModal,
} from './modals';

type LoadFn = (path?: string) => Promise<void>;
type RenderFn = () => void;

interface PaletteItem {
  id: string;
  type: 'View' | 'Space' | 'Note' | 'Action';
  typeOrder: number;
  text: string;
  run: () => Promise<void> | void;
}

let activePaletteOverlay: HTMLDivElement | null = null;

export function openPalette(load: LoadFn, render: RenderFn): void {
  // Flush any pending note edits before opening palette
  const fileEditor = document.querySelector<HTMLTextAreaElement>('#notes-file-editor');
  if (fileEditor && document.activeElement === fileEditor) {
    fileEditor.blur();
  }

  if (activePaletteOverlay) {
    activePaletteOverlay.remove();
    activePaletteOverlay = null;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop palette-backdrop';

  overlay.innerHTML = `
    <div class="palette-box">
      <div class="palette-input-wrap">
        <span class="palette-input-icon">🔍</span>
        <input
          class="palette-input"
          type="text"
          placeholder="Search commands, notes, spaces, or type to log…"
          autocomplete="off"
          spellcheck="false"
        />
      </div>
      <div class="palette-list" id="palette-list"></div>
      <div class="palette-footer">
        <span class="palette-footer-item"><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
        <span class="palette-footer-item"><kbd>↵</kbd> select</span>
        <span class="palette-footer-item"><kbd>esc</kbd> close</span>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  activePaletteOverlay = overlay;

  const input = overlay.querySelector<HTMLInputElement>('.palette-input')!;
  const list = overlay.querySelector<HTMLDivElement>('#palette-list')!;

  const close = () => {
    if (activePaletteOverlay === overlay) {
      overlay.remove();
      activePaletteOverlay = null;
    }
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  const buildItems = (): PaletteItem[] => {
    const items: PaletteItem[] = [];

    // 1. Core Views
    items.push(
      {
        id: 'view-home',
        type: 'View',
        typeOrder: 0,
        text: 'Home Overview',
        run: async () => {
          const wasGlobal = isGlobalNotesMode;
          setGlobalNotesMode(false);
          setHomeCenterMode('overview');
          setActiveMarkdownFile(null);
          setFilePaneCompact(false);
          setView('Home');
          if (wasGlobal && state.workspace?.masterFolder) {
            await load(state.workspace.masterFolder);
          } else {
            render();
          }
        },
      },
      {
        id: 'view-notes',
        type: 'View',
        typeOrder: 0,
        text: 'Senku Notes',
        run: async () => {
          setGlobalNotesMode(true);
          const notesPath = await window.senku.getNotesPath();
          const res = await window.senku.readFolder(notesPath);
          setCurrentFolder(res.entries, res.currentPath);

          const qNote = await window.senku.getOrCreateQuickNote();
          setActiveMarkdownFile(qNote);
          const pages = parseNotePages(qNote.content || '');
          setActiveNotePageIndex(Math.max(0, pages.length - 1));
          setIsNoteAllPagesView(false);
          setIsNotePreviewMode(false);

          setView('Home');
          setHomeCenterMode('notes');
          setFilePaneCompact(true);
          render();
        },
      },
      {
        id: 'view-all-logs',
        type: 'View',
        typeOrder: 0,
        text: 'Logs',
        run: () => {
          setGlobalNotesMode(false);
          setView('AllLog');
          render();
        },
      },
    );

    // 2. Spaces
    (state.workspaces || []).forEach((ws) => {
      const isCurrent = state.workspace?.id === ws.id;
      items.push({
        id: `space-${ws.id}`,
        type: 'Space',
        typeOrder: 1,
        text: `Space: ${ws.name}${isCurrent ? ' (active)' : ''}`,
        run: async () => {
          if (!isCurrent) {
            setGlobalNotesMode(false);
            setHomeCenterMode('overview');
            setActiveMarkdownFile(null);
            setFilePaneCompact(false);
            await window.senku.switchWorkspace(ws.id);
            setView('Home');
            await load();
          }
        },
      });
    });

    // 3. Notes in active folder (Simple MD Preview)
    const mdEntries = (state.entries || []).filter((e) => e.kind === 'file' && e.name.toLowerCase().endsWith('.md'));
    mdEntries.forEach((entry) => {
      items.push({
        id: `open-note-${entry.name}`,
        type: 'Note',
        typeOrder: 2,
        text: `Preview: ${entry.name}`,
        run: async () => {
          const folder = state.currentPath || state.workspace?.masterFolder;
          if (!folder) return;
          const p = `${folder}/${entry.name}`.replace(/\\/g, '/');
          try {
            const content = await window.senku.readTextFile(p);
            setActiveMarkdownFile({ path: p, name: entry.name, content });
            setHomeCenterMode('preview');
            setFilePaneCompact(true);
            setView('Home');
            render();
          } catch {
            toast('Could not open preview.');
          }
        },
      });
    });

    // 4. Actions
    items.push(
      {
        id: 'action-new-note',
        type: 'Action',
        typeOrder: 3,
        text: 'New Note in Folder',
        run: async () => {
          let folder = state.currentPath || state.workspace?.masterFolder;
          if (isGlobalNotesMode && !folder) {
            folder = await window.senku.getNotesPath();
          }
          if (!folder) {
            toast('No active folder linked.');
            return;
          }
          try {
            const note = await window.senku.createFileNote(folder);
            setActiveMarkdownFile(note);
            setActiveNotePageIndex(0);
            setIsNoteAllPagesView(false);
            setIsNotePreviewMode(false);
            setView('Home');
            setHomeCenterMode('notes');
            toast(`Created ${note.name}`);
            await load(folder);
            const editor = document.querySelector<HTMLTextAreaElement>('#notes-file-editor');
            if (editor) {
              editor.focus();
              editor.setSelectionRange(editor.value.length, editor.value.length);
            }
          } catch {
            toast('Could not create note.');
          }
        },
      },
      {
        id: 'action-quick-note',
        type: 'Action',
        typeOrder: 3,
        text: 'Quick Note Overlay',
        run: () => { void window.senku.showOverlay(); },
      },
      {
        id: 'action-new-space',
        type: 'Action',
        typeOrder: 3,
        text: 'New Space',
        run: () => { openWorkspaceFormModal(load); },
      },
      {
        id: 'action-refresh',
        type: 'Action',
        typeOrder: 3,
        text: 'Refresh (Soft Restart)',
        run: async () => {
          setGlobalNotesMode(false);
          setHomeCenterMode('overview');
          setActiveMarkdownFile(null);
          setFilePaneCompact(false);
          setView('Home');
          await load(state.workspace?.masterFolder);
          toast('Restarted to Home');
        },
      },
      {
        id: 'action-app-settings',
        type: 'Action',
        typeOrder: 3,
        text: 'App Settings',
        run: () => { openAppSettingsModal(render, load); },
      },
    );

    // Contextual Note Actions
    const currentNote = activeMarkdownFile;
    if (currentNote && homeCenterMode === 'notes') {
      items.push({
        id: 'action-toggle-preview',
        type: 'Action',
        typeOrder: 3,
        text: isNotePreviewMode ? 'Edit Active Note' : 'Preview Active Note',
        run: () => {
          setIsNotePreviewMode(!isNotePreviewMode);
          render();
          if (!isNotePreviewMode) {
            const editor = document.querySelector<HTMLTextAreaElement>('#notes-file-editor');
            if (editor) {
              editor.focus();
              editor.setSelectionRange(editor.value.length, editor.value.length);
            }
          }
        },
      });
      items.push({
        id: 'action-add-page',
        type: 'Action',
        typeOrder: 3,
        text: 'Add Page to Active Note',
        run: async () => {
          const current = (currentNote.content || '').trimEnd();
          const updated = current ? `${current}${PAGE_SEPARATOR}` : `<!-- page -->\n\n`;
          currentNote.content = updated;
          await window.senku.saveTextFile(currentNote.path, updated);
          const pages = parseNotePages(updated);
          setActiveNotePageIndex(Math.max(0, pages.length - 1));
          setIsNoteAllPagesView(false);
          setIsNotePreviewMode(false);
          setView('Home');
          setHomeCenterMode('notes');
          render();
          const editor = document.querySelector<HTMLTextAreaElement>('#notes-file-editor');
          if (editor) {
            editor.focus();
            editor.setSelectionRange(editor.value.length, editor.value.length);
          }
        },
      });
    }

    return items;
  };

  const allItems = buildItems();
  let currentRows: Array<{ item: PaletteItem; highlightedHtml: string }> = [];
  let selectedIndex = 0;

  const highlight = (text: string, indices: number[]): string => {
    if (!indices.length) return escapeHtml(text);
    const set = new Set(indices);
    let html = '';
    for (let i = 0; i < text.length; i++) {
      const c = escapeHtml(text[i]);
      if (set.has(i)) {
        html += `<mark>${c}</mark>`;
      } else {
        html += c;
      }
    }
    return html;
  };

  const updateList = () => {
    const rawQuery = input.value;
    const q = rawQuery.trim();

    if (!q) {
      // Empty query: show Views first, then Spaces, then Notes, then Actions
      const views = allItems.filter((it) => it.type === 'View');
      const spaces = allItems.filter((it) => it.type === 'Space');
      const notes = allItems.filter((it) => it.type === 'Note');
      const actions = allItems.filter((it) => it.type === 'Action');
      const combined = [...views, ...spaces, ...notes, ...actions].slice(0, 8);
      currentRows = combined.map((item) => ({ item, highlightedHtml: escapeHtml(item.text) }));
    } else {
      const scored: Array<{ item: PaletteItem; score: number; indices: number[] }> = [];
      for (const item of allItems) {
        const res = fuzzyMatch(q, item.text);
        if (res !== null) {
          scored.push({ item, score: res.score, indices: res.indices });
        }
      }

      scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.item.typeOrder - b.item.typeOrder;
      });

      const topScored = scored.slice(0, 7).map((s) => ({
        item: s.item,
        highlightedHtml: highlight(s.item.text, s.indices),
      }));

      const dynamicItem: PaletteItem = {
        id: 'dynamic-log',
        type: 'Action',
        typeOrder: 5,
        text: `Log: “${rawQuery}”`,
        run: async () => {
          const spaceId = state.workspace?.id;
          await window.senku.addLogEntry(rawQuery, spaceId);
          await load(state.currentPath);
          toast('Logged');
        },
      };

      currentRows = [...topScored, { item: dynamicItem, highlightedHtml: escapeHtml(dynamicItem.text) }];
    }

    if (selectedIndex >= currentRows.length) {
      selectedIndex = Math.max(0, currentRows.length - 1);
    }

    renderList();
  };

  const renderList = () => {
    list.innerHTML = currentRows
      .map(
        (row, idx) => `
      <div class="palette-row ${idx === selectedIndex ? 'selected' : ''}" data-idx="${idx}">
        <span class="palette-row-text">${row.highlightedHtml}</span>
        <div class="palette-row-meta">
          <span class="palette-row-type type-${row.item.type.toLowerCase()}">${row.item.type}</span>
        </div>
      </div>`,
      )
      .join('');

    list.querySelectorAll<HTMLElement>('.palette-row').forEach((el) => {
      el.addEventListener('mouseenter', () => {
        const idx = Number(el.dataset.idx);
        if (!isNaN(idx) && idx !== selectedIndex) {
          selectedIndex = idx;
          list.querySelectorAll('.palette-row').forEach((r, i) => {
            r.classList.toggle('selected', i === selectedIndex);
          });
        }
      });
      el.addEventListener('click', () => {
        const idx = Number(el.dataset.idx);
        if (!isNaN(idx)) {
          selectedIndex = idx;
          void runSelected();
        }
      });
    });

    const selectedEl = list.querySelector<HTMLElement>('.palette-row.selected');
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: 'nearest' });
    }
  };

  const runSelected = async () => {
    const row = currentRows[selectedIndex];
    if (!row) return;
    close();
    await row.item.run();
  };

  input.addEventListener('input', () => {
    selectedIndex = 0;
    updateList();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (currentRows.length > 0) {
        selectedIndex = (selectedIndex + 1) % currentRows.length;
        renderList();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (currentRows.length > 0) {
        selectedIndex = (selectedIndex - 1 + currentRows.length) % currentRows.length;
        renderList();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void runSelected();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  });

  updateList();
  input.focus();
}
