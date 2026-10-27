import type { Launchpad } from '../electron/types';
import { setState, state, setActiveNoteId, setView, activeNoteId } from './state';
import { checkMainFolder, escapeHtml, DEFAULT_GREETING } from './utils';
import { uiIcon } from './markup';
import { toast } from './toast';
import pkg from '../package.json';

// ---------------------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------------------

function createOverlay(innerHtml: string): HTMLDivElement {
  document.querySelectorAll('.modal-backdrop').forEach((m) => m.remove());
  const overlay = document.createElement('div');
  overlay.className = 'modal-backdrop';
  overlay.innerHTML = innerHtml;
  document.body.append(overlay);

  // Close on X button
  overlay.querySelector('#close-modal')?.addEventListener('click', () => overlay.remove());

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Prevent double-submits
  overlay.addEventListener('submit', (e) => {
    const form = e.target as HTMLElement;
    if (form.dataset.busy) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    form.dataset.busy = '1';
    setTimeout(() => delete form.dataset.busy, 800);
  }, true);

  // Close on Escape
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') overlay.remove(); };
  document.addEventListener('keydown', onKey);
  const removeOverlay = overlay.remove.bind(overlay);
  overlay.remove = () => {
    document.removeEventListener('keydown', onKey);
    removeOverlay();
  };

  // Focus first text input on open (select if prefilled)
  requestAnimationFrame(() => {
    const firstInput = overlay.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      'input:not([type="hidden"]):not([disabled]), textarea:not([disabled])'
    );
    if (firstInput) {
      firstInput.focus();
      if (firstInput.value) {
        firstInput.select();
      }
    }
  });

  return overlay;
}

function folderAllowed(overlay: HTMLElement, selector: string, folder: string): boolean {
  const check = checkMainFolder(folder);
  if (check.level === 'block') {
    showFormError(overlay, selector, check.message);
    return false;
  }
  return check.level === 'ok' || confirm(check.message);
}

function showFormError(overlay: HTMLElement, selector: string, message: string): void {
  const el = overlay.querySelector(selector);
  if (el) el.textContent = message;
}

// ---------------------------------------------------------------------------
// Profile & Settings modal
// ---------------------------------------------------------------------------

export function openProfileModal(render: () => void, load?: () => Promise<void>): void {
  openAppSettingsModal(render, load);
}

export function openAppSettingsModal(render: () => void, load?: () => Promise<void>): void {
  if (!state) return;

  const trashCount = state.trashWorkspaces?.length ?? 0;

  const overlay = createOverlay(`
    <div class="modal-card settings-dialog-card">
      <button type="button" class="modal-close" id="close-modal" aria-label="Close">${uiIcon('x', 14)}</button>

      <span class="settings-kicker">SETTINGS</span>
      <h2 class="dialog-title">Preferences</h2>

      <div class="settings-dialog-body">
        <div class="settings-section">
          <span class="settings-group-label">SYSTEM</span>
          <div class="settings-toggle-row">
            <div class="toggle-text">
              <strong>Launch on Windows startup</strong>
              <small>Open Senku automatically when Windows boots</small>
            </div>
            <button type="button" id="app-startup-toggle" class="toggle ${state.settings.launchAtStartup ? 'on' : ''}" aria-label="Toggle launch at startup"><span></span></button>
          </div>
        </div>

        <div class="settings-section">
          <span class="settings-group-label">STORAGE &amp; TRASH</span>
          <div class="settings-action-row">
            <div class="toggle-text">
              <strong>Trash</strong>
              <small>${trashCount > 0 ? `${trashCount} deleted space(s) can be restored` : 'No deleted spaces'}</small>
            </div>
            <button type="button" class="settings-action-btn" id="open-trash-btn">View Trash (${trashCount})</button>
          </div>
        </div>

        <div class="settings-section">
          <span class="settings-group-label">TOOLS &amp; DATA</span>
          <div class="settings-action-row">
            <div class="toggle-text">
              <strong>User Guide &amp; Shortcuts</strong>
              <small>Full keyboard navigation and manual</small>
            </div>
            <button type="button" class="settings-action-btn" id="open-user-guide-btn">View Guide ↗</button>
          </div>
          <div class="settings-action-row">
            <div class="toggle-text">
              <strong>Export All Notes</strong>
              <small>Save compiled markdown to Downloads</small>
            </div>
            <button type="button" class="settings-action-btn" id="export-notes-btn">Export Notes</button>
          </div>
        </div>
      </div>

      <div class="settings-dialog-footer">
        <span class="settings-version-tag">Senku v${pkg.version} · Offline &amp; Local</span>
      </div>
    </div>`);

  // Windows startup toggle - auto-save immediately
  const toggle = overlay.querySelector('#app-startup-toggle');
  toggle?.addEventListener('click', async () => {
    toggle.classList.toggle('on');
    const launchAtStartup = toggle.classList.contains('on');
    try {
      const snapshot = await window.senku.saveSettings({
        ...state.settings,
        launchAtStartup,
      });
      setState(snapshot);
      toast('Setting saved');
    } catch {
      toast('Could not save setting');
    }
  });

  // Open trash modal from settings
  overlay.querySelector('#open-trash-btn')?.addEventListener('click', () => {
    overlay.remove();
    openTrashModal(async () => {
      if (load) await load();
      render();
    });
  });

  // User guide
  overlay.querySelector('#open-user-guide-btn')?.addEventListener('click', async () => {
    const result = await window.senku.openUserGuide();
    if (!result.ok) toast(result.error || 'User guide not found.');
  });

  // Export notes
  overlay.querySelector('#export-notes-btn')?.addEventListener('click', async () => {
    const res = await window.senku.exportAllNotes();
    if (res.ok) {
      toast(`Exported ${res.count ?? 0} notes to Downloads.`);
    } else if (!res.empty) {
      toast(res.error || 'Could not export notes.');
    }
  });
}

// ---------------------------------------------------------------------------
// New workspace form modal
// ---------------------------------------------------------------------------

export function openWorkspaceFormModal(load: (path?: string) => Promise<void>): void {
  const overlay = createOverlay(`
    <form class="modal-card space-dialog-card">
      <button type="button" class="modal-close" id="close-modal" aria-label="Close">${uiIcon('x', 14)}</button>
      <span class="settings-kicker">NEW SPACE</span>
      <h2 class="dialog-title">New Space</h2>
      <div class="dialog-field">
        <label for="new-space-name-input">Space Name</label>
        <input name="name" id="new-space-name-input" required placeholder="e.g. Algorithms, College, WebDev" autocomplete="off" autofocus />
      </div>
      <div class="dialog-field">
        <label for="new-space-folder-input">Main Folder</label>
        <div class="dialog-path-row">
          <input name="folder" id="new-space-folder-input" required placeholder="C:\\path\\to\\project" autocomplete="off" />
          <button type="button" id="browse-folder" class="dialog-browse-btn">Browse</button>
        </div>
      </div>
      <p class="form-error" id="workspace-error"></p>
      <button class="primary-button mini" type="submit">Create Space</button>
    </form>`);

  overlay.querySelector('#browse-folder')?.addEventListener('click', async () => {
    const folder = await window.senku.chooseMasterFolder();
    if (folder) {
      (overlay.querySelector('[name="folder"]') as HTMLInputElement).value = folder;
    }
  });

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    if (!folderAllowed(overlay, '#workspace-error', String(data.get('folder')))) return;
    try {
      await window.senku.createWorkspace(
        String(data.get('name')),
        String(data.get('folder')),
      );
      overlay.remove();
      await load();
    } catch (err) {
      showFormError(
        overlay,
        '#workspace-error',
        err instanceof Error ? err.message : 'Could not create Space.',
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Space settings modal
// ---------------------------------------------------------------------------

export function openWorkspaceSettingsModal(load: (path?: string) => Promise<void>, render: () => void): void {
  if (!state?.workspace) return;
  const ws = state.workspace;

  const overlay = createOverlay(`
    <form class="modal-card space-dialog-card">
      <button type="button" class="modal-close" id="close-modal" aria-label="Close">${uiIcon('x', 14)}</button>
      <span class="settings-kicker">SPACE SETTINGS</span>
      <h2 class="dialog-title">Settings for ${escapeHtml(ws.name)}</h2>
      <div class="dialog-field">
        <label for="edit-space-name-input">Space Name</label>
        <input name="name" id="edit-space-name-input" required value="${escapeHtml(ws.name)}" autocomplete="off" />
      </div>
      <div class="dialog-field">
        <label for="edit-space-folder-input">Main Folder</label>
        <div class="dialog-path-row">
          <input name="folder" id="edit-space-folder-input" required value="${escapeHtml(ws.masterFolder)}" autocomplete="off" />
          <button type="button" id="browse-space-folder" class="dialog-browse-btn">Browse</button>
        </div>
      </div>
      <p class="form-error" id="workspace-settings-error"></p>
      <div class="dialog-actions-row">
        <button class="primary-button mini" type="submit">Save Changes</button>
        <button type="button" class="danger-text-btn" id="delete-workspace">Delete Space</button>
      </div>
    </form>`);

  overlay.querySelector('#browse-space-folder')?.addEventListener('click', async () => {
    const folder = await window.senku.chooseMasterFolder();
    if (folder) (overlay.querySelector('[name="folder"]') as HTMLInputElement).value = folder;
  });

  overlay.querySelector('#delete-workspace')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${ws.name}? The Windows folder itself will not be deleted.`)) return;
    const result = await window.senku.deleteWorkspace(ws.id);
    if (!result.ok) {
      showFormError(overlay, '#workspace-settings-error', result.error ?? 'Could not delete Space.');
      return;
    }
    overlay.remove();
    await load();
  });

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget as HTMLFormElement).get('name')).trim();
    const folder = String(new FormData(e.currentTarget as HTMLFormElement).get('folder')).trim();
    if (!name) {
      showFormError(overlay, '#workspace-settings-error', 'Space name is required.');
      return;
    }
    if (!folder) {
      showFormError(overlay, '#workspace-settings-error', 'Choose a main folder.');
      return;
    }
    if (folder.toLowerCase() !== ws.masterFolder.toLowerCase() && !folderAllowed(overlay, '#workspace-settings-error', folder)) return;
    try {
      let snapshot = await window.senku.setMasterFolder(ws.id, folder);
      snapshot = await window.senku.renameWorkspace(ws.id, name);
      setState(snapshot);
      overlay.remove();
      render();
    } catch (err) {
      showFormError(overlay, '#workspace-settings-error', err instanceof Error ? err.message : 'Could not save Space settings.');
    }
  });
}

// ---------------------------------------------------------------------------
// Launchpad form modal (V3)
// ---------------------------------------------------------------------------

export function openLaunchpadFormModal(load: (path?: string) => Promise<void>, existing?: Launchpad): void {
  const currentPath = state.currentPath || state.workspace?.masterFolder || '';
  const isEditing = Boolean(existing);
  const heading = isEditing ? 'Edit Launchpad' : 'New Launchpad';
  const defaultPaths = existing ? existing.paths.join('\n') : '';
  const defaultName = existing ? existing.name : '';
  const submitText = isEditing ? 'Save' : 'Create';

  const overlay = createOverlay(`
    <form class="modal-card space-dialog-card">
      <button type="button" class="modal-close" id="close-modal" aria-label="Close">${uiIcon('x', 14)}</button>
      <h2 class="dialog-title">${heading}</h2>

      <div class="dialog-field">
        <label for="lp-name-input">Name</label>
        <input name="name" id="lp-name-input" required value="${escapeHtml(defaultName)}" placeholder="e.g. DSA Practice, Project Lab" autocomplete="off" />
      </div>

      <div class="dialog-field">
        <div class="dialog-field-header">
          <label for="lp-paths-input">Paths & URLs (one per line)</label>
          <div class="lp-quick-actions">
            <button type="button" id="lp-browse" class="lp-pill-btn">+ Browse</button>
          </div>
        </div>
        <textarea
          name="paths"
          id="lp-paths-input"
          rows="4"
          placeholder="https://example.com&#10;C:\\projects\\app"
          spellcheck="false"
        >${escapeHtml(defaultPaths)}</textarea>
      </div>

      <p class="form-error" id="lp-error"></p>
      <div class="dialog-actions-row">
        <button class="primary-button mini" type="submit">${submitText}</button>
        ${isEditing ? '<button type="button" class="danger-text-btn" id="lp-delete-btn">Delete</button>' : ''}
      </div>
    </form>`);

  const textarea = overlay.querySelector<HTMLTextAreaElement>('#lp-paths-input')!;

  overlay.querySelector('#lp-browse')?.addEventListener('click', async () => {
    const filePaths = await window.senku.chooseFiles(currentPath);
    if (filePaths && filePaths.length > 0) {
      const added = filePaths.join('\n');
      const current = textarea.value.trim();
      textarea.value = current ? `${current}\n${added}` : added;
    }
  });

  if (isEditing && existing) {
    overlay.querySelector('#lp-delete-btn')?.addEventListener('click', async () => {
      if (!confirm(`Delete launchpad "${existing.name}"?`)) return;
      await window.senku.deleteLaunchpad(existing.id);
      overlay.remove();
      await load(state.currentPath);
    });
  }

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const name = String(data.get('name') ?? '').trim();
    if (!name) {
      showFormError(overlay, '#lp-error', 'Launchpad name is required.');
      return;
    }
    const paths = String(data.get('paths') ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (existing) {
        await window.senku.updateLaunchpad(existing.id, name, paths);
      } else {
        const spaceId = state.workspace?.id ?? '';
        await window.senku.createLaunchpad(name, spaceId, paths);
      }
      overlay.remove();
      await load(state.currentPath);
    } catch (err) {
      showFormError(overlay, '#lp-error', err instanceof Error ? err.message : 'Could not save launchpad.');
    }
  });
}

// ---------------------------------------------------------------------------
// Space Trash / Bin modal
// ---------------------------------------------------------------------------

export function openTrashModal(load: () => Promise<void>): void {
  const trash = state.trashWorkspaces ?? [];

  const itemsList = trash.length
    ? trash.map((t) => {
        const deletedStr = new Date(t.deletedAt).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
        const spaceName = (t.name || '').trim() || 'Untitled Space';
        return `
          <div class="trash-space-row" data-id="${t.id}">
            <div class="trash-space-info">
              <div class="trash-space-name-row">
                <span class="trash-space-icon">${uiIcon('folder', 13)}</span>
                <strong class="trash-space-name">${escapeHtml(spaceName)}</strong>
              </div>
              <span class="trash-space-path" title="${escapeHtml(t.masterFolder)}">${escapeHtml(t.masterFolder)}</span>
              <span class="trash-space-time">Deleted ${deletedStr}</span>
            </div>
            <div class="trash-space-actions">
              <button type="button" class="trash-btn restore" data-restore-id="${t.id}" title="Restore space to sidebar">
                ${uiIcon('refresh', 11)}
                <span>Restore</span>
              </button>
              <button type="button" class="trash-btn purge" data-purge-id="${t.id}" title="Delete permanently">
                ${uiIcon('x', 11)}
                <span>Delete</span>
              </button>
            </div>
          </div>`;
      }).join('')
    : `
      <div class="trash-empty-state">
        <div class="trash-empty-icon">${uiIcon('folder', 26)}</div>
        <p class="trash-empty-title">Trash is empty</p>
        <p class="trash-empty-sub">Deleted spaces will appear here before permanent deletion.</p>
      </div>`;

  const overlay = createOverlay(`
    <div class="modal-card space-dialog-card trash-modal-card">
      <button type="button" class="modal-close" id="close-modal" aria-label="Close">${uiIcon('x', 14)}</button>
      <span class="settings-kicker">SPACES TRASH</span>
      <h2 class="dialog-title">Deleted Spaces</h2>
      <p class="dialog-desc">Restoring a Space brings it back to your sidebar with its notes intact. Windows folders are never touched.</p>

      <div class="trash-list">${itemsList}</div>

      ${trash.length ? `
        <div class="trash-dialog-footer">
          <span class="trash-count-label">${trash.length} space${trash.length === 1 ? '' : 's'} in trash</span>
          <button type="button" class="danger-text-btn" id="empty-all-trash">Empty entire Trash</button>
        </div>` : ''}
    </div>`);

  overlay.querySelectorAll<HTMLElement>('[data-restore-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.restoreId!;
      btn.textContent = 'Restoring…';
      await window.senku.restoreWorkspace(id);
      overlay.remove();
      await load();
    });
  });

  overlay.querySelectorAll<HTMLElement>('[data-purge-id]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Permanently delete this Space configuration from trash?')) return;
      const id = btn.dataset.purgeId!;
      await window.senku.purgeTrash(id);
      overlay.remove();
      await load();
    });
  });

  overlay.querySelector('#empty-all-trash')?.addEventListener('click', async () => {
    if (!confirm('Permanently empty all items in trash?')) return;
    await window.senku.purgeTrash();
    overlay.remove();
    await load();
  });
}

// ---------------------------------------------------------------------------
// Create Note modal
// ---------------------------------------------------------------------------

export function openCreateNoteModal(load: (path?: string) => Promise<void>, render: () => void, defaultBundle?: string): void {
  const bundles = state.bundles ?? [];
  const bundleOptions = bundles.length > 0 ? `
    <div class="dialog-field">
      <label for="create-note-bundle-select">Folder (optional)</label>
      <select name="bundle" id="create-note-bundle-select" class="modal-select">
        <option value="" ${!defaultBundle ? 'selected' : ''}>No folder (loose note)</option>
        ${bundles.map((b) => `<option value="${escapeHtml(b)}" ${defaultBundle === b ? 'selected' : ''}>${escapeHtml(b)}</option>`).join('')}
      </select>
    </div>` : '';

  const overlay = createOverlay(`
    <form class="modal-card note-dialog-card">
      <button type="button" class="modal-close" id="close-modal" aria-label="Close">${uiIcon('x', 14)}</button>
      <h2 class="dialog-title">New Note</h2>
      <div class="dialog-field">
        <label for="new-note-name-input">Name</label>
        <input name="name" id="new-note-name-input" required placeholder="e.g. Algorithms" autocomplete="off" autofocus />
      </div>
      ${bundleOptions}
      <p class="form-error" id="note-create-error"></p>
      <button class="primary-button mini" type="submit">Create</button>
    </form>`);

  requestAnimationFrame(() => {
    overlay.querySelector<HTMLInputElement>('#new-note-name-input')?.focus();
  });

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const name = String(data.get('name') ?? '').trim();
    const bundleVal = String(data.get('bundle') ?? '').trim();
    const chosenBundle = bundleVal || defaultBundle || undefined;

    if (!name) {
      showFormError(overlay, '#note-create-error', 'Enter a note name.');
      return;
    }
    try {
      const snap = await window.senku.createNote(name, chosenBundle);
      setState(snap);
      const newNote = snap.notes?.find((n) => n.name.toLowerCase() === name.toLowerCase()) ?? snap.notes?.[0];
      if (newNote) setActiveNoteId(newNote.id);
      setView('Notes');
      overlay.remove();
      render();
      requestAnimationFrame(() => {
        const editor = document.querySelector<HTMLTextAreaElement>('#notes-editor');
        if (editor) {
          editor.focus();
          editor.setSelectionRange(editor.value.length, editor.value.length);
        }
      });
    } catch (err) {
      showFormError(overlay, '#note-create-error', err instanceof Error ? err.message : 'Could not create note.');
    }
  });
}

// ---------------------------------------------------------------------------
// Create Bundle (Folder) modal
// ---------------------------------------------------------------------------

export function openCreateBundleModal(load: (path?: string) => Promise<void>, render: () => void): void {
  const overlay = createOverlay(`
    <form class="modal-card note-dialog-card">
      <button type="button" class="modal-close" id="close-modal" aria-label="Close">${uiIcon('x', 14)}</button>
      <span class="settings-kicker">NEW FOLDER</span>
      <h2 class="dialog-title">New Folder</h2>
      <div class="dialog-field">
        <label for="new-bundle-name-input">Folder Name</label>
        <input name="name" id="new-bundle-name-input" required placeholder="e.g. College" autocomplete="off" autofocus />
      </div>
      <p class="form-error" id="bundle-create-error"></p>
      <button class="primary-button mini" type="submit">Create Folder</button>
    </form>`);

  requestAnimationFrame(() => {
    overlay.querySelector<HTMLInputElement>('#new-bundle-name-input')?.focus();
  });

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget as HTMLFormElement).get('name')).trim();
    if (!name) {
      showFormError(overlay, '#bundle-create-error', 'Enter a folder name.');
      return;
    }
    try {
      const snap = await window.senku.createBundle(name);
      setState(snap);
      setView('Notes');
      overlay.remove();
      render();
    } catch (err) {
      showFormError(overlay, '#bundle-create-error', err instanceof Error ? err.message : 'Could not create folder.');
    }
  });
}
