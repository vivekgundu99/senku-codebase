import {
  state,
  setFileFilter,
  showMoreFiles,
  setCurrentFolder,
  toggleFilePaneCompact,
  setFilePaneCompact,
  isFilePaneCompact,
  setView,
  setActiveMarkdownFile,
  setIsNotePreviewMode,
  setHomeCenterMode,
  isGlobalNotesMode,
} from '../state';
import { fileCountLabel, fileListMarkup, filePanelMarkup } from '../markup';
import { isSamePath, parentOf } from '../utils';
import { openNewNoteModal } from '../modals';
import { toast } from '../toast';
import type { LoadFn, RenderFn } from './types';

export function bindFileActions(load: LoadFn, render?: RenderFn): void {
  const panel = document.querySelector<HTMLElement>('.files-panel');
  if (!panel) return;

  const refreshList = () => {
    const list = panel.querySelector('.file-list');
    if (list) list.innerHTML = fileListMarkup();
    const count = panel.querySelector('#file-count');
    if (count) count.textContent = fileCountLabel();
  };

  const navigateToFolder = async (folderPath?: string) => {
    if (!folderPath) return;
    try {
      const res = await window.senku.readFolder(folderPath);
      setCurrentFolder(res.entries, res.currentPath);
      const rightCol = document.querySelector('.right-column');
      if (rightCol) {
        rightCol.innerHTML = filePanelMarkup();
        bindFileActions(load, render);
      }
    } catch {
      await load(folderPath);
    }
  };

  panel.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;

    if (target.closest('#toggle-file-pane-size')) {
      toggleFilePaneCompact();
      if (render) render();
      return;
    }

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
      if (open.dataset.kind === 'folder') {
        await navigateToFolder(p);
        return;
      }
      if (p.toLowerCase().endsWith('.md')) {
        try {
          const content = await window.senku.readTextFile(p);
          const name = p.split(/[\\/]/).pop() || 'Note.md';
          setActiveMarkdownFile({ path: p, name, content });
          if (isGlobalNotesMode) {
            setHomeCenterMode('notes');
            const isSenku = name.toLowerCase() === 'senku.md';
            setIsNotePreviewMode(!isSenku);
          } else {
            setHomeCenterMode('preview');
          }
          setFilePaneCompact(true);
          setView('Home');
          if (render) render();
          return;
        } catch {}
      }
      await window.senku.openPath(p);
      return;
    }

    if (target.closest('#create-note-file')) {
      const notesPath = await window.senku.getNotesPath();
      openNewNoteModal(state.currentPath || notesPath, load, render);
      return;
    }

    if (target.closest('#show-more-files')) { showMoreFiles(); refreshList(); return; }
    if (target.closest('#go-up')) {
      const root = isGlobalNotesMode
        ? document.querySelector<HTMLElement>('#go-root')?.dataset.rootTarget
        : state.workspace?.masterFolder;
      if (root && !isSamePath(state.currentPath, root)) await navigateToFolder(parentOf(state.currentPath));
      return;
    }
    const goRoot = target.closest<HTMLElement>('#go-root');
    if (goRoot) {
      const rootTarget = goRoot.dataset.rootTarget || (isGlobalNotesMode ? await window.senku.getNotesPath() : state.workspace?.masterFolder);
      if (rootTarget) await navigateToFolder(rootTarget);
      return;
    }
    if (target.closest('#open-folder')) {
      panel.querySelector('#file-tools-dropdown-menu')?.classList.remove('open');
      await window.senku.openPath(state.currentPath);
      return;
    }
    if (target.closest('#open-tools-dropdown')) {
      panel.querySelector('#file-tools-dropdown-menu')?.classList.toggle('open');
      return;
    }
    if (target.closest('#open-in-vscode')) {
      panel.querySelector('#file-tools-dropdown-menu')?.classList.remove('open');
      const res = await window.senku.openInVSCode(state.currentPath);
      if (!res.ok) toast(res.error ?? 'Could not open VS Code.');
      return;
    }
    if (target.closest('#open-in-terminal')) {
      panel.querySelector('#file-tools-dropdown-menu')?.classList.remove('open');
      const res = await window.senku.openInTerminal(state.currentPath);
      if (!res.ok) toast(res.error ?? 'Could not open terminal.');
      return;
    }

    if (!target.closest('.file-action-split-wrap')) {
      panel.querySelector('#file-tools-dropdown-menu')?.classList.remove('open');
    }

    const crumb = target.closest<HTMLElement>('[data-breadcrumb]');
    if (crumb) await navigateToFolder(crumb.dataset.breadcrumb);
  });

  const runFileSearch = () => {
    const input = panel.querySelector<HTMLInputElement>('#file-filter');
    if (!input) return;
    setFileFilter(input.value);
    refreshList();
  };

  const searchExpandable = panel.querySelector<HTMLElement>('#file-search-expandable');
  const fileInput = panel.querySelector<HTMLInputElement>('#file-filter');
  const searchTrigger = panel.querySelector<HTMLElement>('#file-search-trigger');
  const searchClear = panel.querySelector<HTMLElement>('#file-search-clear');

  searchTrigger?.addEventListener('click', () => {
    searchExpandable?.classList.add('open');
    fileInput?.focus();
    fileInput?.select();
  });

  searchClear?.addEventListener('click', () => {
    if (fileInput) fileInput.value = '';
    setFileFilter('');
    refreshList();
    searchExpandable?.classList.remove('open');
  });

  if (fileInput) {
    fileInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        runFileSearch();
      } else if (e.key === 'Escape') {
        fileInput.value = '';
        setFileFilter('');
        refreshList();
        searchExpandable?.classList.remove('open');
        fileInput.blur();
      }
    });
  }
}
