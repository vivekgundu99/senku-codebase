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
import { openNewNoteModal, openDeleteNoteModal, openAddLinkModal } from '../modals';
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
  const ws = state.workspace;

  // --- Reborn: Active Objective ---
  const objInput = document.querySelector<HTMLInputElement>('#reborn-objective-input');
  if (objInput && ws) {
    objInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        objInput.blur();
      }
    });
    objInput.addEventListener('blur', async () => {
      const val = objInput.value.trim();
      if (val !== (ws.activeObjective || '')) {
        await window.senku.updateSpaceObjective(ws.id, val);
        ws.activeObjective = val;
        render();
      }
    });
  }

  document.querySelector('#complete-objective-btn')?.addEventListener('click', async () => {
    if (!ws || !ws.activeObjective) return;
    const completedText = `[Milestone] Completed: ${ws.activeObjective}`;
    await window.senku.addLogEntry(completedText, ws.id);
    await window.senku.updateSpaceObjective(ws.id, '');
    toast('🎉 Objective completed and logged as milestone!');
    await load(state.currentPath);
    render();
  });

  // --- Reborn: Launchpad & Resources ---
  document.querySelector('#launchpad-open-folder')?.addEventListener('click', async () => {
    if (ws?.masterFolder) await window.senku.openPath(ws.masterFolder);
  });

  document.querySelector('#launchpad-open-vscode')?.addEventListener('click', async () => {
    if (ws?.masterFolder) {
      const res = await window.senku.openInVSCode(ws.masterFolder);
      if (!res.ok) toast(res.error || 'Could not open VS Code.');
    }
  });

  document.querySelector('#launchpad-open-terminal')?.addEventListener('click', async () => {
    if (ws?.masterFolder) {
      const res = await window.senku.openInTerminal(ws.masterFolder);
      if (!res.ok) toast(res.error || 'Could not open Terminal.');
    }
  });

  document.querySelectorAll<HTMLElement>('.launchpad-link-anchor').forEach((a) => {
    a.addEventListener('click', async (e) => {
      e.preventDefault();
      const url = a.dataset.launchUrl;
      if (url) await window.senku.openPath(url);
    });
  });

  document.querySelectorAll<HTMLElement>('[data-remove-link]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const linkId = btn.dataset.removeLink;
      if (ws && linkId) {
        await window.senku.removeSpaceLink(ws.id, linkId);
        await load();
        render();
        toast('Link removed');
      }
    });
  });

  document.querySelector('#add-space-link-btn')?.addEventListener('click', () => {
    if (ws) openAddLinkModal(ws.id, load, render);
  });

  // --- Reborn: Capture & Triage Inbox ---
  document.querySelectorAll<HTMLElement>('[data-triage-action]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const itemEl = btn.closest<HTMLElement>('.reborn-inbox-item');
      const id = itemEl?.dataset.inboxId;
      const action = btn.dataset.triageAction as 'objective' | 'log' | 'delete';
      if (!id || !action) return;

      if (action === 'objective' && ws) {
        await window.senku.triageInboxItem(id, 'objective', ws.id);
        toast('Set as Current Objective');
      } else if (action === 'log') {
        await window.senku.triageInboxItem(id, 'log', ws?.id);
        toast('Logged to Timeline');
      } else if (action === 'delete') {
        await window.senku.deleteInboxItem(id);
      }
      await load();
      render();
    });
  });

  // --- Reborn: Momentum Timeline & Quick Log ---
  const quickLogInput = document.querySelector<HTMLInputElement>('#reborn-quick-log-input');
  const submitRebornLog = async () => {
    if (!quickLogInput) return;
    const text = quickLogInput.value.trim();
    if (!text) return;
    quickLogInput.value = '';
    setHomeLogDraft('');
    const spaceId = state.workspace?.id;
    await window.senku.addLogEntry(text, spaceId);
    await load(state.currentPath);
    render();
    requestAnimationFrame(() => {
      document.querySelector<HTMLInputElement>('#reborn-quick-log-input')?.focus();
    });
  };

  quickLogInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submitRebornLog();
    }
  });

  document.querySelector('#reborn-quick-log-submit')?.addEventListener('click', () => void submitRebornLog());

  document.querySelectorAll<HTMLElement>('[data-log-tag]').forEach((chip) => {
    chip.addEventListener('click', () => {
      if (!quickLogInput) return;
      const tag = chip.dataset.logTag;
      let prefix = '';
      if (tag === 'milestone') prefix = '[Milestone] ';
      else if (tag === 'bug') prefix = '[Bug] ';
      else if (tag === 'note') prefix = '[Note] ';

      if (!quickLogInput.value.startsWith('[')) {
        quickLogInput.value = prefix + quickLogInput.value;
      }
      quickLogInput.focus();
    });
  });



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

  // Notes Window: Interactive Markdown Checkbox Toggle
  document.querySelectorAll<HTMLInputElement>('.notes-markdown-preview input[type="checkbox"]').forEach((box, boxIdx) => {
    box.disabled = false;
    box.style.cursor = 'pointer';
    box.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!activeMarkdownFile) return;
      let count = 0;
      const updated = activeMarkdownFile.content.replace(/(- \[[ xX]\])/g, (match) => {
        if (count === boxIdx) {
          count++;
          return match.includes('x') || match.includes('X') ? '- [ ]' : '- [x]';
        }
        count++;
        return match;
      });
      activeMarkdownFile.content = updated;
      await window.senku.saveTextFile(activeMarkdownFile.path, updated);
      render();
    });
  });
}
