import {
  state,
  homeLogDraft,
  setHomeLogDraft,
  setHomeCenterMode,
  activeMarkdownFile,
  setActiveMarkdownFile,
  isNotePreviewMode,
  setIsNotePreviewMode,
  activeNotePageIndex,
  setActiveNotePageIndex,
  isNoteAllPagesView,
  setIsNoteAllPagesView,
  isGlobalNotesMode,
  setGlobalNotesMode,
} from '../state';
import { parseNotePages, joinNotePages } from '../utils';
import { toast } from '../toast';
import type { LoadFn, RenderFn } from './types';

/** Chat-style send key: Enter sends, Shift+Enter inserts a new line. */
export function isSendKey(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing;
}

/** Grow a textarea with its content (like a chat box), up to a maximum height. */
export function growTextarea(el: HTMLTextAreaElement, minPx: number, maxPx = 200): void {
  el.style.height = 'auto';
  el.style.height = `${Math.min(maxPx, Math.max(minPx, el.scrollHeight))}px`;
  el.style.overflowY = el.scrollHeight > maxPx ? 'auto' : 'hidden';
}

export function bindHomeActions(load: LoadFn, render: RenderFn): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('#home-capture-textarea');
  const btn = document.querySelector<HTMLButtonElement>('#home-capture-submit');

  const adjustHomeHeight = () => {
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



  // Home dual-pill mode toggle: Overview vs Notes
  document.querySelectorAll<HTMLElement>('[data-home-mode]').forEach((pillBtn) => {
    pillBtn.addEventListener('click', async () => {
      const mode = pillBtn.dataset.homeMode as 'overview' | 'notes';
      if (mode === 'overview') {
        if (isGlobalNotesMode) {
          // The Exit Handshake: exit Global Notes, restore active workspace, and refresh FM
          setGlobalNotesMode(false);
          setHomeCenterMode('overview');
          setActiveMarkdownFile(null);
          if (state.workspace?.masterFolder) {
            await load(state.workspace.masterFolder);
          } else {
            render();
          }
          return;
        }
        setHomeCenterMode('overview');
        render();
        return;
      }
      if (mode === 'notes') {
        if (!isGlobalNotesMode && activeMarkdownFile) {
          const wsFolder = state.workspace?.masterFolder;
          if (!wsFolder || !activeMarkdownFile.path.toLowerCase().startsWith(wsFolder.toLowerCase())) {
            setActiveMarkdownFile(null);
          }
        }
        setHomeCenterMode('notes');
        render();
      }
    });
  });

  // Notes Window: Create new note in current folder
  document.querySelector('#new-note-in-folder')?.addEventListener('click', async () => {
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
      setHomeCenterMode('notes');
      toast(`Created ${note.name}`);
      await load(folder);
    } catch {
      toast('Could not create note.');
    }
  });

  // Notes Window: Open active note in VS Code
  document.querySelector('#open-note-file-vscode')?.addEventListener('click', async () => {
    if (activeMarkdownFile?.path) {
      const res = await window.senku.openInVSCode(activeMarkdownFile.path);
      if (!res.ok) toast(res.error || 'Could not open in VS Code.');
    }
  });

  // Notes Window: Toggle preview / edit mode
  document.querySelector('#toggle-note-preview-mode')?.addEventListener('click', () => {
    setIsNotePreviewMode(!isNotePreviewMode);
    render();
  });

  // Notes Window: Editor input, multipage & saving
  const fileEditor = document.querySelector<HTMLTextAreaElement>('#notes-file-editor');
  const saveStatus = document.querySelector<HTMLElement>('#notes-file-save-status');

  const getFullNoteContent = (val: string): string => {
    if (isNoteAllPagesView || !activeMarkdownFile) return val;
    const pages = parseNotePages(activeMarkdownFile.content || '');
    const curIdx = Math.min(Math.max(0, activeNotePageIndex), Math.max(0, pages.length - 1));
    pages[curIdx] = val;
    return joinNotePages(pages);
  };

  const saveNoteFile = async () => {
    if (!activeMarkdownFile) return;
    const val = fileEditor ? fileEditor.value : undefined;
    const newFull = val !== undefined ? getFullNoteContent(val) : activeMarkdownFile.content;
    try {
      await window.senku.saveTextFile(activeMarkdownFile.path, newFull);
      activeMarkdownFile.content = newFull;
      if (saveStatus) {
        saveStatus.textContent = 'saved';
        setTimeout(() => { if (saveStatus) saveStatus.textContent = ''; }, 1500);
      }
    } catch {
      if (saveStatus) saveStatus.textContent = 'error';
    }
  };

  if (fileEditor && activeMarkdownFile) {
    fileEditor.addEventListener('input', () => {
      if (saveStatus) saveStatus.textContent = 'unsaved';
    });

    fileEditor.addEventListener('blur', () => void saveNoteFile());

    const onWinBlur = () => void saveNoteFile();
    window.addEventListener('blur', onWinBlur);

    fileEditor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void saveNoteFile();
        return;
      }
      if ((e.altKey && e.key === 'ArrowLeft') || e.key === 'PageUp') {
        e.preventDefault();
        void (async () => {
          await saveNoteFile();
          if (activeNotePageIndex > 0) {
            setActiveNotePageIndex(activeNotePageIndex - 1);
            setIsNoteAllPagesView(false);
            render();
          }
        })();
      } else if ((e.altKey && e.key === 'ArrowRight') || e.key === 'PageDown') {
        e.preventDefault();
        void (async () => {
          await saveNoteFile();
          const pages = parseNotePages(activeMarkdownFile?.content || '');
          if (activeNotePageIndex < pages.length - 1) {
            setActiveNotePageIndex(activeNotePageIndex + 1);
            setIsNoteAllPagesView(false);
            render();
          }
        })();
      }
    });
  }

  // Multipage Page Bar Controls
  document.querySelectorAll<HTMLElement>('.notes-page-circle').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await saveNoteFile();
      const idx = parseInt(btn.dataset.pageIndex ?? '0', 10);
      setActiveNotePageIndex(idx);
      setIsNoteAllPagesView(false);
      render();
    });
  });

  document.querySelector('#notes-page-prev, #notes-prev-page')?.addEventListener('click', async () => {
    await saveNoteFile();
    if (activeNotePageIndex > 0) {
      setActiveNotePageIndex(activeNotePageIndex - 1);
      setIsNoteAllPagesView(false);
      render();
    }
  });

  document.querySelector('#notes-page-next, #notes-next-page')?.addEventListener('click', async () => {
    await saveNoteFile();
    const pages = parseNotePages(activeMarkdownFile?.content || '');
    if (activeNotePageIndex < pages.length - 1) {
      setActiveNotePageIndex(activeNotePageIndex + 1);
      setIsNoteAllPagesView(false);
      render();
    }
  });

  document.querySelector('#notes-toggle-all-view, #notes-toggle-all-pages')?.addEventListener('click', async () => {
    await saveNoteFile();
    setIsNoteAllPagesView(!isNoteAllPagesView);
    render();
  });

  document.querySelector('#notes-page-add, #notes-add-page-btn')?.addEventListener('click', async () => {
    await saveNoteFile();
    if (!activeMarkdownFile) return;
    const separator = '\n\n<!-- page -->\n\n';
    const updated = activeMarkdownFile.content ? `${activeMarkdownFile.content.trimEnd()}${separator}` : '';
    activeMarkdownFile.content = updated;
    await window.senku.saveTextFile(activeMarkdownFile.path, updated);
    const pages = parseNotePages(updated);
    setActiveNotePageIndex(pages.length - 1);
    setIsNoteAllPagesView(false);
    render();
  });

  document.querySelector('#notes-page-delete')?.addEventListener('click', async () => {
    if (!activeMarkdownFile) return;
    const pages = parseNotePages(activeMarkdownFile.content || '');
    if (pages.length <= 1) return;
    pages.splice(activeNotePageIndex, 1);
    const updated = pages.join('\n\n<!-- page -->\n\n');
    activeMarkdownFile.content = updated;
    await window.senku.saveTextFile(activeMarkdownFile.path, updated);
    setActiveNotePageIndex(Math.max(0, activeNotePageIndex - 1));
    setIsNoteAllPagesView(false);
    render();
  });
}
