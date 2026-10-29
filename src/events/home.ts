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
import { openNewNoteModal, openDeleteNoteModal } from '../modals';
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

  // Notes Window: Delete active note (never senku.md)
  document.querySelector('#delete-note-file')?.addEventListener('click', () => {
    if (!activeMarkdownFile || activeMarkdownFile.name.toLowerCase() === 'senku.md') return;
    const target = activeMarkdownFile;
    openDeleteNoteModal(target.name, async () => {
      const res = await window.senku.deleteFileNote(target.path);
      if (res.ok) {
        toast(`Deleted ${target.name}`);
        const qNote = await window.senku.getOrCreateQuickNote();
        setActiveMarkdownFile(qNote);
        setIsNotePreviewMode(false);
        let folder = state.currentPath;
        if (isGlobalNotesMode && (!folder || !folder.toLowerCase().includes('notes'))) {
          folder = await window.senku.getNotesPath();
        }
        if (folder) await load(folder);
        render();
      } else {
        toast(res.error || 'Failed to delete note');
      }
    });
  });

  // Notes Window: Inline rename (Double-click title or F2)
  const startInlineRename = () => {
    if (!activeMarkdownFile) return;
    const titleEl = document.querySelector<HTMLElement>('#notes-file-title');
    if (!titleEl || titleEl.querySelector('input')) return;

    const oldName = activeMarkdownFile.name;
    const baseName = oldName.replace(/\.md$/i, '');
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'notes-file-rename-input';
    input.className = 'notes-file-rename-input';
    input.value = baseName;
    input.spellcheck = false;

    titleEl.textContent = '';
    titleEl.appendChild(input);
    input.focus();
    input.select();

    let committed = false;
    const commit = async () => {
      if (committed) return;
      committed = true;
      const raw = input.value.trim();
      if (!raw || raw === baseName) {
        titleEl.textContent = oldName;
        return;
      }
      const res = await window.senku.renameFileNote(activeMarkdownFile!.path, raw);
      if (res.ok && res.path && res.name) {
        activeMarkdownFile!.path = res.path;
        activeMarkdownFile!.name = res.name;
        toast(`Renamed to ${res.name}`);
        let folder = state.currentPath;
        if (isGlobalNotesMode && (!folder || !folder.toLowerCase().includes('notes'))) {
          folder = await window.senku.getNotesPath();
        }
        if (folder) await load(folder);
        render();
      } else {
        toast(res.error || 'Failed to rename note');
        titleEl.textContent = oldName;
      }
    };

    input.addEventListener('blur', () => void commit());
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        input.blur();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        committed = true;
        titleEl.textContent = oldName;
      }
    });
  };

  document.querySelector('#notes-file-title')?.addEventListener('dblclick', startInlineRename);


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
      if (e.key === 'F2') {
        e.preventDefault();
        startInlineRename();
        return;
      }
    });
  }
}
