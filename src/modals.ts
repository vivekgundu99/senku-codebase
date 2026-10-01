import type { Priority, Task, TaskInput } from '../electron/types';
import { setState, state } from './state';
import { escapeHtml, toLocalDatetimeInput, DEFAULT_GREETING } from './utils';

// ---------------------------------------------------------------------------
// Modal helpers
// ---------------------------------------------------------------------------

/** Create and attach a modal backdrop. Returns the overlay element. */
function createOverlay(innerHtml: string): HTMLDivElement {
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

  return overlay;
}

/** Read a TaskInput from a modal form element. */
function readTaskInput(form: HTMLFormElement): TaskInput {
  const data = new FormData(form);
  return {
    title: String(data.get('title') ?? '').trim(),
    priority: data.get('priority') as Priority,
    startAt: new Date(String(data.get('startAt'))).toISOString(),
    endAt: new Date(String(data.get('endAt'))).toISOString(),
    linkedPaths: String(data.get('linkedPaths') ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/** Show a validation error inside a modal. */
function showFormError(overlay: HTMLElement, selector: string, message: string): void {
  const el = overlay.querySelector(selector);
  if (el) el.textContent = message;
}

// ---------------------------------------------------------------------------
// Task form (new task)
// ---------------------------------------------------------------------------

/** The shared HTML body for date/priority/links fields. */
function taskFieldsMarkup(defaults?: {
  title?: string;
  startAt?: Date;
  endAt?: Date;
  priority?: Priority;
  linkedPaths?: string[];
}): string {
  const now = new Date();
  const farFuture = new Date(now);
  farFuture.setFullYear(farFuture.getFullYear() + 10);

  return `
    <label>Task name
      <input name="title" required
        placeholder="Finish operating systems notes"
        value="${escapeHtml(defaults?.title ?? '')}" />
    </label>
    <div class="form-grid">
      <label>Start time
        <input name="startAt" type="datetime-local" required
          value="${toLocalDatetimeInput(defaults?.startAt ?? now)}" />
      </label>
      <label>End time
        <input name="endAt" type="datetime-local" required
          value="${toLocalDatetimeInput(defaults?.endAt ?? farFuture)}" />
      </label>
    </div>
    <label>Priority
      <select name="priority">
        <option value="normal" ${defaults?.priority !== 'urgent' ? 'selected' : ''}>Normal</option>
        <option value="urgent" ${defaults?.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
      </select>
    </label>
    <label>Linked paths <span class="hint">optional · one per line</span>
      <textarea name="linkedPaths" rows="3"
        placeholder="C:\\path\\to\\notes.pdf or https://...">${escapeHtml(
          (defaults?.linkedPaths ?? []).join('\n'),
        )}</textarea>
    </label>`;
}

export function openNewTaskModal(load: () => Promise<void>): void {
  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">NEW TASK</span>
      <h2>Put it on your radar</h2>
      <p class="modal-copy">Text first. Add documents, links, or playlists when useful.</p>
      ${taskFieldsMarkup()}
      <p class="form-error" id="task-error"></p>
      <button class="primary-button" type="submit">Save task <span>→</span></button>
    </form>`);

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = readTaskInput(e.currentTarget as HTMLFormElement);
    if (Date.parse(input.startAt) >= Date.parse(input.endAt)) {
      showFormError(overlay, '#task-error', 'End time must be after start time.');
      return;
    }
    await window.senku.createTask(input);
    overlay.remove();
    await load();
  });
}

// ---------------------------------------------------------------------------
// Edit / recover task modal
// ---------------------------------------------------------------------------

export function openEditTaskModal(
  task: Task,
  bucket: 'active' | 'error',
  load: () => Promise<void>,
): void {
  const isError = bucket === 'error';
  const kicker = isError ? 'FIX & RECOVER' : 'EDIT TASK';
  const heading = isError ? 'Fix and recover task' : 'Edit task';
  const submitLabel = isError ? 'Recover task' : 'Save changes';

  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">${kicker}</span>
      <h2>${heading}</h2>
      <p class="modal-copy">${escapeHtml(task.title)}</p>
      ${taskFieldsMarkup({
        title: task.title,
        startAt: new Date(task.startAt),
        endAt: new Date(task.endAt),
        priority: task.priority,
        linkedPaths: task.linkedPaths,
      })}
      <p class="form-error" id="task-error"></p>
      <button class="primary-button" type="submit">${submitLabel} <span>→</span></button>
    </form>`);

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = readTaskInput(e.currentTarget as HTMLFormElement);
    if (!input.title || Date.parse(input.startAt) >= Date.parse(input.endAt)) {
      showFormError(overlay, '#task-error', 'Enter a title and an end time after the start time.');
      return;
    }
    if (isError) {
      await window.senku.recoverTask(task.id, input);
    } else {
      await window.senku.updateTask(task.id, input);
    }
    overlay.remove();
    await load();
  });
}

// ---------------------------------------------------------------------------
// Snooze modal
// ---------------------------------------------------------------------------

export function openSnoozeModal(task: Task, load: () => Promise<void>): void {
  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">TASK ACTION</span>
      <h2>Snooze task</h2>
      <p class="modal-copy">${escapeHtml(task.title)}</p>
      <label>Snooze duration
        <select name="duration">
          <option value="10">10 minutes</option>
          <option value="60">1 hour</option>
          <option value="1440">1 day</option>
          <option value="10080">1 week</option>
        </select>
      </label>
      <p class="form-error" id="task-error"></p>
      <button class="primary-button" type="submit">Snooze task <span>→</span></button>
    </form>`);

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const duration = Number(new FormData(e.currentTarget as HTMLFormElement).get('duration'));
    await window.senku.snoozeTask(task.id, duration);
    overlay.remove();
    await load();
  });
}

// ---------------------------------------------------------------------------
// Reassign (partial progress) modal
// ---------------------------------------------------------------------------

export function openReassignModal(task: Task, load: () => Promise<void>): void {
  const now = new Date();
  const farFuture = new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">PARTIAL PROGRESS</span>
      <h2>Reassign task</h2>
      <p class="modal-copy">
        Your current progress will be saved as completed.
        Choose the next start and end time for the remaining work.
      </p>
      <div class="form-grid">
        <label>Next start
          <input name="startAt" type="datetime-local" required
            value="${toLocalDatetimeInput(now)}" />
        </label>
        <label>Next end
          <input name="endAt" type="datetime-local" required
            value="${toLocalDatetimeInput(farFuture)}" />
        </label>
      </div>
      <p class="form-error" id="task-error"></p>
      <button class="primary-button" type="submit">
        Save progress and reassign <span>→</span>
      </button>
    </form>`);

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const input: TaskInput = {
      title: task.title,
      priority: task.priority,
      startAt: new Date(String(data.get('startAt'))).toISOString(),
      endAt: new Date(String(data.get('endAt'))).toISOString(),
      linkedPaths: task.linkedPaths,
    };
    if (Date.parse(input.startAt) >= Date.parse(input.endAt)) {
      showFormError(overlay, '#task-error', 'End time must be after start time.');
      return;
    }
    await window.senku.completeTask(task.id, input);
    overlay.remove();
    await load();
  });
}

// ---------------------------------------------------------------------------
// Profile modal
// ---------------------------------------------------------------------------

export function openProfileModal(render: () => void): void {
  if (!state) return;

  const overlay = createOverlay(`
    <form class="modal-card profile-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">PROFILE</span>
      <h2>Your Senku profile</h2>
      <p class="modal-copy">Choose the name and behavior that feel right for you.</p>

      <label>Display name
        <input name="userName" required value="${escapeHtml(state.settings.userName)}" />
      </label>

      <label>Greeting line
        <textarea name="greeting" rows="2"
          placeholder="${escapeHtml(DEFAULT_GREETING)}">${escapeHtml(
            state.settings.greeting || DEFAULT_GREETING,
          )}</textarea>
        <small class="hint">
          Shown at the top of Today. Use {name} to insert your display name, or
          replace the whole line with your own tagline.
        </small>
      </label>

      <div class="profile-setting">
        <div>
          <strong>Strict mode</strong>
          <small>Open all linked resources when tasks start.</small>
        </div>
        <button type="button" id="profile-strict-toggle"
          class="toggle ${state.workspace?.strictMode ? 'on' : ''}"
          aria-label="Toggle strict mode"><span></span></button>
      </div>

      <div class="profile-setting">
        <div>
          <strong>Launch at Windows startup</strong>
          <small>Start Senku minimized to the tray when Windows starts.</small>
        </div>
        <button type="button" id="profile-startup-toggle"
          class="toggle ${state.settings.launchAtStartup ? 'on' : ''}"
          aria-label="Toggle launch at startup"><span></span></button>
      </div>

      <p class="form-error" id="profile-error"></p>
      <button class="primary-button" type="submit">Save profile <span>→</span></button>
      <button id="user-guide" class="guide-button" type="button">Read the Senku guide</button>
    </form>`);

  // Toggle buttons
  overlay.querySelector('#profile-strict-toggle')?.addEventListener('click', () =>
    overlay.querySelector('#profile-strict-toggle')?.classList.toggle('on'),
  );
  overlay.querySelector('#profile-startup-toggle')?.addEventListener('click', () =>
    overlay.querySelector('#profile-startup-toggle')?.classList.toggle('on'),
  );

  // User guide
  overlay.querySelector('#user-guide')?.addEventListener('click', async () => {
    const result = await window.senku.openUserGuide();
    if (!result.ok) alert(result.error || 'User guide not found.');
  });

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const name = String(data.get('userName') ?? '').trim();
    if (!name) {
      showFormError(overlay, '#profile-error', 'Enter a display name.');
      return;
    }
    const greeting = String(data.get('greeting') ?? '').trim() || DEFAULT_GREETING;
    const strictMode = overlay.querySelector('#profile-strict-toggle')!.classList.contains('on');
    const launchAtStartup = overlay
      .querySelector('#profile-startup-toggle')!
      .classList.contains('on');

    let snapshot = await window.senku.saveSettings({
      ...state.settings,
      userName: name,
      launchAtStartup,
      greeting,
    });
    if (state.workspace) {
      snapshot = await window.senku.setStrictMode(state.workspace.id, strictMode);
    }
    setState(snapshot);
    overlay.remove();
    render();
  });
}

// ---------------------------------------------------------------------------
// Workspace switcher modal
// ---------------------------------------------------------------------------

export function openWorkspaceMenuModal(load: () => Promise<void>): void {
  const overlay = createOverlay(`
    <section class="modal-card">
      <button class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">WORKSPACES</span>
      <h2>Choose your space</h2>
      <p class="modal-copy">Each workspace has its own master folder and task history.</p>
      <div class="workspace-list">
        ${state.workspaces
          .map(
            (ws) => `
          <button class="workspace-option ${ws.id === state.workspace?.id ? 'current' : ''}"
            data-workspace-id="${ws.id}">
            <span class="workspace-dot"></span>
            <span>
              <strong>${escapeHtml(ws.name)}</strong>
              <small>${escapeHtml(ws.masterFolder)}</small>
            </span>
            <span>→</span>
          </button>`,
          )
          .join('')}
      </div>
      <button class="primary-button" id="new-workspace">+ Create another workspace</button>
      <button class="danger-button" id="delete-workspace">Delete current workspace</button>
    </section>`);

  overlay.querySelectorAll<HTMLElement>('[data-workspace-id]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      await window.senku.switchWorkspace(btn.dataset.workspaceId!);
      overlay.remove();
      await load();
    }),
  );

  overlay.querySelector('#new-workspace')?.addEventListener('click', () => {
    overlay.remove();
    openWorkspaceFormModal(load);
  });

  overlay.querySelector('#delete-workspace')?.addEventListener('click', async () => {
    const wsName = state.workspace!.name;
    if (
      confirm(
        `Delete ${wsName} and all its Senku tasks? The Windows folder will not be touched.`,
      )
    ) {
      const result = await window.senku.deleteWorkspace(state.workspace!.id);
      if (!result.ok) alert(result.error);
      else {
        overlay.remove();
        await load();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// New workspace form modal
// ---------------------------------------------------------------------------

export function openWorkspaceFormModal(load: () => Promise<void>): void {
  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">NEW WORKSPACE</span>
      <h2>Give a folder its own space.</h2>
      <p class="modal-copy">Tasks from this workspace will never mix with another one.</p>
      <label>Workspace name
        <input name="name" required placeholder="Workspace 2" />
      </label>
      <label>Master folder
        <div class="path-input">
          <input name="folder" required placeholder="C:\\Users\\you\\projects" />
          <button type="button" id="browse-folder" class="ghost-button">Browse</button>
        </div>
      </label>
      <p class="form-error" id="workspace-error"></p>
      <button class="primary-button" type="submit">Create workspace <span>→</span></button>
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
        err instanceof Error ? err.message : 'Could not create workspace.',
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Workspace settings modal (rename)
// ---------------------------------------------------------------------------

export function openWorkspaceSettingsModal(render: () => void): void {
  if (!state?.workspace) return;
  const ws = state.workspace;

  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">WORKSPACE SETTINGS</span>
      <h2>Edit this workspace</h2>
      <p class="modal-copy">${escapeHtml(ws.masterFolder)}</p>
      <label>Workspace name
        <input name="name" required value="${escapeHtml(ws.name)}" />
      </label>
      <p class="form-error" id="workspace-settings-error"></p>
      <button class="primary-button" type="submit">Save changes <span>→</span></button>
    </form>`);

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget as HTMLFormElement).get('name')).trim();
    if (!name) {
      showFormError(overlay, '#workspace-settings-error', 'Workspace name is required.');
      return;
    }
    const snapshot = await window.senku.renameWorkspace(ws.id, name);
    setState(snapshot);
    overlay.remove();
    render();
  });
}

// ---------------------------------------------------------------------------
// Rename file modal
// ---------------------------------------------------------------------------

export function openRenameFileModal(
  entryPath: string,
  currentName: string,
  load: (path?: string) => Promise<void>,
  currentFolderPath: string,
): void {
  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">RENAME RESOURCE</span>
      <h2>Rename carefully</h2>
      <p class="modal-copy">
        This changes the real Windows file or folder name.
        Senku will not move or copy it.
      </p>
      <label>New name
        <input name="name" required value="${escapeHtml(currentName)}" />
      </label>
      <p class="rename-warning">
        Warning: any Windows app, shortcut, task link, or external reference using the
        old name may stop working.
      </p>
      <p class="form-error" id="rename-error"></p>
      <button class="primary-button" type="submit">Rename resource <span>→</span></button>
    </form>`);

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = String(new FormData(e.currentTarget as HTMLFormElement).get('name')).trim();
    if (!name || name === currentName) {
      overlay.remove();
      return;
    }
    const result = await window.senku.renamePath(entryPath, name);
    if (!result.ok) {
      showFormError(overlay, '#rename-error', result.error || 'Rename failed.');
      return;
    }
    overlay.remove();
    await load(currentFolderPath);
  });
}
