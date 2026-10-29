import {
  state,
  homeLogDraft,
  setHomeLogDraft,
  setHomeCenterMode,
  activeMarkdownFile,
  setActiveMarkdownFile,
  isNotePreviewMode,
  setIsNotePreviewMode,
  isGlobalNotesMode,
  setGlobalNotesMode,
  setView,
  setFilePaneCompact,
} from '../state';
import { openNewNoteModal } from '../modals';
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
    textarea.style.height = '20px';
    const scrollH = textarea.scrollHeight;
    if (scrollH > 24) {
      const targetH = Math.min(180, scrollH);
      textarea.style.height = `${targetH}px`;
      textarea.style.overflowY = scrollH > 180 ? 'auto' : 'hidden';
    } else {
      textarea.style.height = '20px';
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
      textarea.style.height = '20px';
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
        el.style.height = '20px';
        el.style.overflowY = 'hidden';
      }
    });
  };

  btn?.addEventListener('click', () => void submit());



  // Simple MD Preview: Open in Default Application
  document.querySelector('#simple-md-open-default')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLElement;
    const p = btn.dataset.filePath || activeMarkdownFile?.path;
    if (p) {
      await window.senku.openPath(p);
    }
  });

  // Simple MD Preview: Close preview and return to overview
  document.querySelector('#simple-md-close-preview')?.addEventListener('click', () => {
    setActiveMarkdownFile(null);
    setHomeCenterMode('overview');
    setFilePaneCompact(false);
    render();
  });

  // Notes Window: Open in Default Application
  document.querySelector('#open-note-in-default')?.addEventListener('click', async () => {
    if (activeMarkdownFile?.path) {
      await window.senku.openPath(activeMarkdownFile.path);
    }
  });

  // Notes Window: Local refresh note and folder (reflects overlay changes instantly)
  document.querySelector('#refresh-notes-file')?.addEventListener('click', async () => {
    if (!activeMarkdownFile) return;
    try {
      const content = await window.senku.readTextFile(activeMarkdownFile.path);
      activeMarkdownFile.content = content;
      let folder = state.currentPath;
      if (isGlobalNotesMode && !folder) {
        folder = await window.senku.getNotesPath();
      }
      if (folder) await load(folder);
      render();
      toast('Note refreshed');
    } catch {
      toast('Could not refresh note.');
    }
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
    openNewNoteModal(folder, load, render);
  });

  // Notes Window: Open active note in VS Code
  document.querySelector('#open-note-file-vscode')?.addEventListener('click', async () => {
    if (activeMarkdownFile?.path) {
      const res = await window.senku.openInVSCode(activeMarkdownFile.path);
      if (!res.ok) toast(res.error || 'Could not open in VS Code.');
    }
  });

  // Notes Window: Toggle preview / edit mode
  const togglePreview = () => {
    setIsNotePreviewMode(!isNotePreviewMode);
    render();
    if (!isNotePreviewMode) {
      const editor = document.querySelector<HTMLTextAreaElement>('#notes-file-editor');
      if (editor) {
        editor.focus();
        editor.setSelectionRange(editor.value.length, editor.value.length);
      }
    }
  };
  document.querySelector('#toggle-note-preview-mode')?.addEventListener('click', togglePreview);
  document.querySelector('#notes-preview-empty-click')?.addEventListener('click', togglePreview);

  // Notes Window: Editor input & saving
  const fileEditor = document.querySelector<HTMLTextAreaElement>('#notes-file-editor');
  const saveStatus = document.querySelector<HTMLElement>('#notes-file-save-status');

  const saveNoteFile = async () => {
    if (!activeMarkdownFile) return;
    const val = fileEditor ? fileEditor.value : activeMarkdownFile.content;
    try {
      await window.senku.saveTextFile(activeMarkdownFile.path, val);
      activeMarkdownFile.content = val;
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
    window.addEventListener('blur', onWinBlur, { once: true });

    fileEditor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        void (async () => {
          await saveNoteFile();
          fileEditor.blur();
          setGlobalNotesMode(false);
          setHomeCenterMode('overview');
          setView('Home');
          if (state.workspace?.masterFolder) {
            await load(state.workspace.masterFolder);
          } else {
            render();
          }
        })();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void saveNoteFile();
        return;
      }
    });
  }
}
