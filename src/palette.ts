import { state, setView, setActiveNoteId, currentView } from './state';
import { fuzzyMatch } from './utils';
import { toast } from './toast';
import {
  openCreateNoteModal,
  openLaunchpadFormModal,
  openWorkspaceFormModal,
  openAppSettingsModal,
} from './modals';

type LoadFn = (path?: string) => Promise<void>;
type RenderFn = () => void;

interface PaletteItem {
  id: string;
  type: 'View' | 'Space' | 'Launchpad' | 'Note' | 'Action';
  typeOrder: number;
  text: string;
  shortcut?: string;
  run: () => Promise<void> | void;
}

let activePaletteOverlay: HTMLDivElement | null = null;

export function openPalette(load: LoadFn, render: RenderFn): void {
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
        <span class="palette-footer-item"><kbd>n text</kbd> note</span>
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

    // 1. Views
    items.push(
      { id: 'view-home', type: 'View', typeOrder: 0, text: 'Home', shortcut: 'H', run: () => { setView('Home'); render(); } },
      { id: 'view-overview', type: 'View', typeOrder: 0, text: 'Overview', shortcut: 'S', run: () => { setView('Overview'); render(); } },
      { id: 'view-launchpads', type: 'View', typeOrder: 0, text: 'Launchpads', shortcut: 'L', run: () => { setView('Launchpads'); render(); } },
      { id: 'view-notes', type: 'View', typeOrder: 0, text: 'Notes', shortcut: 'N', run: () => { setView('Notes'); render(); } },
      { id: 'view-log', type: 'View', typeOrder: 0, text: 'Quiet Log (Space)', run: () => { setView('Log'); render(); } },
      { id: 'view-all-logs', type: 'View', typeOrder: 0, text: 'All Logs (#senku)', shortcut: 'G', run: () => { setView('AllLog'); render(); } },
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
            await window.senku.switchWorkspace(ws.id);
            if (currentView === 'Home' || currentView === 'AllLog') {
              setView('Overview');
            }
            await load();
          }
        },
      });
    });

    // 3. Launchpads
    (state.launchpads || []).forEach((lp) => {
      items.push({
        id: `lp-${lp.id}`,
        type: 'Launchpad',
        typeOrder: 2,
        text: `Launch: ${lp.name}`,
        shortcut: '↗',
        run: async () => {
          const res = await window.senku.launchLaunchpad(lp.id);
          if (res.ok) {
            toast(`Launched ${lp.name}`);
          } else {
            toast(`Launched ${lp.name} · ${res.errors.length} failed`);
          }
        },
      });
    });

    // 4. Notes
    (state.notes || []).forEach((note) => {
      const prefix = note.bundle ? `[${note.bundle}] ` : '';
      items.push({
        id: `note-${note.id}`,
        type: 'Note',
        typeOrder: 3,
        text: `${prefix}${note.name}`,
        run: async () => {
          setActiveNoteId(note.id);
          void window.senku.setActiveNote(note.id);
          setView('Notes');
          render();
        },
      });
    });

    // 5. Actions
    items.push(
      {
        id: 'action-quick-note',
        type: 'Action',
        typeOrder: 4,
        text: 'Quick Note Overlay',
        shortcut: 'O',
        run: () => { void window.senku.showOverlay(); },
      },
      {
        id: 'action-new-note',
        type: 'Action',
        typeOrder: 4,
        text: 'New Note',
        run: () => { openCreateNoteModal(load, render); },
      },
      {
        id: 'action-new-launchpad',
        type: 'Action',
        typeOrder: 4,
        text: 'New Launchpad',
        run: () => { openLaunchpadFormModal(load); },
      },
      {
        id: 'action-new-space',
        type: 'Action',
        typeOrder: 4,
        text: 'New Space',
        run: () => { openWorkspaceFormModal(load); },
      },
      {
        id: 'action-app-settings',
        type: 'Action',
        typeOrder: 4,
        text: 'App Settings',
        run: () => { openAppSettingsModal(render); },
      },
      {
        id: 'action-guide',
        type: 'Action',
        typeOrder: 4,
        text: 'User Guide & Shortcuts',
        shortcut: '?',
        run: async () => {
          const res = await window.senku.openUserGuide();
          if (!res.ok) toast(res.error || 'User guide not found.');
        },
      },
    );

    return items;
  };

  const allItems = buildItems();
  let currentRows: Array<{ item: PaletteItem; highlightedHtml: string }> = [];
  let selectedIndex = 0;

  const escapeHtmlText = (str: string): string =>
    str.replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]!));

  const highlight = (text: string, indices: number[]): string => {
    if (!indices.length) return escapeHtmlText(text);
    const set = new Set(indices);
    let html = '';
    for (let i = 0; i < text.length; i++) {
      const c = escapeHtmlText(text[i]);
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
      // Empty query: show Views first, then Launchpads, then Spaces, then Actions
      const views = allItems.filter((it) => it.type === 'View');
      const lps = allItems.filter((it) => it.type === 'Launchpad');
      const spaces = allItems.filter((it) => it.type === 'Space');
      const actions = allItems.filter((it) => it.type === 'Action');
      const combined = [...views, ...lps, ...spaces, ...actions].slice(0, 8);
      currentRows = combined.map((item) => ({ item, highlightedHtml: escapeHtmlText(item.text) }));
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

      let dynamicItem: PaletteItem;
      if (/^(?:n|note)\s+/i.test(rawQuery)) {
        const rest = rawQuery.replace(/^(?:n|note)\s+/i, '').trim();
        dynamicItem = {
          id: 'dynamic-note',
          type: 'Note',
          typeOrder: 5,
          text: `Note: “${rest}”`,
          run: async () => {
            if (!rest) return;
            const res = await window.senku.appendToActiveNote(rest);
            if (res.ok) {
              await load(state.currentPath);
              toast('Saved to Note');
            } else {
              toast(res.error || 'Could not save note');
            }
          },
        };
      } else {
        dynamicItem = {
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
      }

      currentRows = [...topScored, { item: dynamicItem, highlightedHtml: escapeHtmlText(dynamicItem.text) }];
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
          ${row.item.shortcut ? `<kbd class="palette-row-kbd">${escapeHtmlText(row.item.shortcut)}</kbd>` : ''}
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
