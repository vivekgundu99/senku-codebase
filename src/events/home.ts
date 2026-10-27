import {
  state,
  homeLogDraft,
  setHomeLogDraft,
  setHomeCenterMode,
  activeMarkdownFile,
  setActiveMarkdownFile,
  isNotePreviewMode,
  setIsNotePreviewMode,
} from '../state';
import { toast } from '../toast';
import { openLaunchpadFormModal } from '../modals';
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

  // Home dual-pill mode toggle: Overview vs Notes
  document.querySelectorAll<HTMLElement>('[data-home-mode]').forEach((pillBtn) => {
    pillBtn.addEventListener('click', () => {
      const mode = pillBtn.dataset.homeMode as 'overview' | 'notes';
      if (mode) {
        setHomeCenterMode(mode);
        render();
      }
    });
  });

  // Notes Window: Create new note in current folder
  document.querySelector('#new-note-in-folder')?.addEventListener('click', async () => {
    const folder = state.currentPath || state.workspace?.masterFolder;
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

  // Notes Window: Editor input & saving
  const fileEditor = document.querySelector<HTMLTextAreaElement>('#notes-file-editor');
  const saveStatus = document.querySelector<HTMLElement>('#notes-file-save-status');
  if (fileEditor && activeMarkdownFile) {
    let isDirty = false;
    fileEditor.addEventListener('input', () => {
      isDirty = true;
      if (saveStatus) saveStatus.textContent = 'unsaved';
    });

    const saveNoteFile = async () => {
      if (!isDirty || !activeMarkdownFile) return;
      const newContent = fileEditor.value;
      try {
        await window.senku.saveTextFile(activeMarkdownFile.path, newContent);
        activeMarkdownFile.content = newContent;
        isDirty = false;
        if (saveStatus) {
          saveStatus.textContent = 'saved';
          setTimeout(() => { if (saveStatus && !isDirty) saveStatus.textContent = ''; }, 1500);
        }
      } catch {
        if (saveStatus) saveStatus.textContent = 'error';
      }
    };

    fileEditor.addEventListener('blur', () => void saveNoteFile());

    const onWinBlur = () => void saveNoteFile();
    window.addEventListener('blur', onWinBlur);

    fileEditor.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        void saveNoteFile();
      }
    });
  }
}
