import type { Task, TaskInput, TaskType } from '../electron/types';
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
function localEndOfDay(date: Date): string {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

function readTaskInput(form: HTMLFormElement): TaskInput {
  const data = new FormData(form);
  const taskType = data.get('taskType') as TaskType;
  let startAt: string | undefined;
  let endAt: string | undefined;

  if (taskType === 'scheduled') {
    const startRaw = String(data.get('startAt') ?? '').trim();
    const start = startRaw ? new Date(startRaw) : new Date();
    startAt = start.toISOString();
    const endRaw = String(data.get('endAt') ?? '').trim();
    endAt = endRaw ? new Date(endRaw).toISOString() : localEndOfDay(start);
  }

  return {
    title: String(data.get('title') ?? '').trim(),
    taskType,
    startAt,
    endAt,
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

/** Shared task fields with scheduling controls that adapt to the selected task type. */
function taskFieldsMarkup(defaults?: {
  title?: string;
  startAt?: Date;
  endAt?: Date;
  taskType?: TaskType;
  linkedPaths?: string[];
}): string {
  const now = new Date();
  const startAt = defaults?.startAt ?? now;
  const endAt = defaults?.endAt ?? new Date(startAt);
  if (!defaults?.endAt) endAt.setHours(23, 59, 59, 999);
  const taskType = defaults?.taskType ?? 'scheduled';

  return `
    <label>Task name
      <input name="title" required
        placeholder="Read a chapter, practise a problem, sketch an idea"
        value="${escapeHtml(defaults?.title ?? '')}" />
    </label>
    <label>Task type</label>
    <div class="task-type-options">
      <label><input type="radio" name="taskType" value="scheduled" ${taskType === 'scheduled' ? 'checked' : ''}><span>Scheduled</span></label>
      <label><input type="radio" name="taskType" value="flexible" ${taskType === 'flexible' ? 'checked' : ''}><span>Flexible</span></label>
    </div>
    <div data-schedule-panel="scheduled" ${taskType === 'flexible' ? 'hidden' : ''}>
      <div class="form-grid">
        <label>Start time <span class="hint">defaults to now</span>
          <input name="startAt" type="datetime-local"
            value="${toLocalDatetimeInput(startAt)}" />
        </label>
        <label>End time <span class="hint">defaults to 11:59 PM</span>
          <input name="endAt" type="datetime-local"
            value="${toLocalDatetimeInput(endAt)}" />
        </label>
      </div>
    </div>
    <div data-schedule-panel="flexible" ${taskType === 'scheduled' ? 'hidden' : ''}>
      <p class="horizon-help">No deadline or automatic reminder. It stays in Today and Upcoming until you plan it or complete it.</p>
    </div>
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
      <h2>Create a task</h2>
      <p class="modal-copy">Schedule work for today, or keep it Flexible for whenever you have room.</p>
      ${taskFieldsMarkup()}
      <p class="form-error" id="task-error"></p>
      <button class="primary-button" type="submit">Save task <span>→</span></button>
    </form>`);

  bindTaskScheduleForm(overlay);

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = readTaskInput(e.currentTarget as HTMLFormElement);
    if (input.taskType === 'scheduled' && (!input.startAt || !input.endAt || Date.parse(input.startAt) >= Date.parse(input.endAt))) {
      showFormError(overlay, '#task-error', 'End time must be after the reminder time.');
      return;
    }
    if (input.startAt && input.endAt && Date.parse(input.startAt) >= Date.parse(input.endAt)) {
      showFormError(overlay, '#task-error', 'End time must be after the reminder time.');
      return;
    }
    await window.senku.createTask(input);
    overlay.remove();
    await load();
  });
}

function bindTaskScheduleForm(overlay: HTMLElement): void {
  const typeInputs = [...overlay.querySelectorAll<HTMLInputElement>('input[name="taskType"]')];
  const scheduledPanel = overlay.querySelector<HTMLElement>('[data-schedule-panel="scheduled"]');
  const flexiblePanel = overlay.querySelector<HTMLElement>('[data-schedule-panel="flexible"]');
  const start = overlay.querySelector<HTMLInputElement>('[name="startAt"]');
  const end = overlay.querySelector<HTMLInputElement>('[name="endAt"]');
  if (!typeInputs.length || !scheduledPanel || !flexiblePanel) return;

  let lastType = (typeInputs.find((input) => input.checked)?.value ?? 'scheduled');
  let endEdited = Boolean(end?.value && (() => { const value = new Date(end.value); return value.getHours() !== 23 || value.getMinutes() !== 59; })());
  end?.addEventListener('input', () => { endEdited = true; });
  start?.addEventListener('change', () => {
    if (!start.value || endEdited || !end) return;
    const selectedStart = new Date(start.value);
    end.value = toLocalDatetimeInput(new Date(selectedStart.getFullYear(), selectedStart.getMonth(), selectedStart.getDate(), 23, 59));
  });

  typeInputs.forEach((type) => type.addEventListener('change', () => {
    const nextType = type.value;
    scheduledPanel.hidden = nextType !== 'scheduled';
    flexiblePanel.hidden = nextType !== 'flexible';
    if (nextType === 'scheduled' && lastType === 'flexible' && start && end) {
      const now = new Date();
      start.value = toLocalDatetimeInput(now);
      end.value = toLocalDatetimeInput(new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59));
      endEdited = false;
    }
    lastType = nextType;
  }));
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
        startAt: task.startAt ? new Date(task.startAt) : undefined,
        endAt: task.endAt ? new Date(task.endAt) : undefined,
        taskType: task.taskType,
        linkedPaths: task.linkedPaths,
      })}
      <p class="form-error" id="task-error"></p>
      <button class="primary-button" type="submit">${submitLabel} <span>→</span></button>
    </form>`);

  bindTaskScheduleForm(overlay);

  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = readTaskInput(e.currentTarget as HTMLFormElement);
    if (!input.title || (input.taskType === 'scheduled' && (!input.startAt || !input.endAt || Date.parse(input.startAt) >= Date.parse(input.endAt))) || (input.startAt && input.endAt && Date.parse(input.startAt) >= Date.parse(input.endAt))) {
      showFormError(overlay, '#task-error', 'Enter a title and an end time after the reminder time.');
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
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59);

  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">PARTIAL PROGRESS</span>
      <h2>Reassign task</h2>
      <p class="modal-copy">
        Your current progress will be saved as completed.
        Choose when to continue. The end time defaults to 11:59 PM today.
      </p>
      <div class="form-grid">
        <label>Next start
          <input name="startAt" type="datetime-local"
            value="${toLocalDatetimeInput(now)}" />
        </label>
        <label>Next end
          <input name="endAt" type="datetime-local"
            value="${toLocalDatetimeInput(endOfToday)}" />
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
    const startRaw = String(data.get('startAt') ?? '').trim();
    const start = startRaw ? new Date(startRaw) : new Date();
    const endRaw = String(data.get('endAt') ?? '').trim();
    const input: TaskInput = {
      title: task.title,
      taskType: 'scheduled',
      startAt: start.toISOString(),
      endAt: endRaw ? new Date(endRaw).toISOString() : localEndOfDay(start),
      linkedPaths: task.linkedPaths,
    };
    if (!input.startAt || !input.endAt || Date.parse(input.startAt) >= Date.parse(input.endAt)) {
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
      <p class="modal-copy">Set the personal details Senku uses across all your Spaces.</p>

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

      <p class="form-error" id="profile-error"></p>
      <button class="primary-button" type="submit">Save profile <span>→</span></button>
      <button id="user-guide" class="guide-button" type="button">Read the Senku guide</button>
    </form>`);

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
    const snapshot = await window.senku.saveSettings({
      ...state.settings,
      userName: name,
      greeting,
    });
    setState(snapshot);
    overlay.remove();
    render();
  });
}

export function openAppSettingsModal(render: () => void): void {
  if (!state) return;
  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">APP SETTINGS</span>
      <h2>Senku settings</h2>
      <p class="modal-copy">These preferences apply across all your Spaces.</p>
      <div class="profile-setting">
        <div><strong>Launch when Windows starts</strong><small>Open Senku when you sign in.</small></div>
        <button type="button" id="app-startup-toggle" class="toggle ${state.settings.launchAtStartup ? 'on' : ''}" aria-label="Toggle launch at startup"><span></span></button>
      </div>
      <button class="primary-button" type="submit">Save app settings <span>→</span></button>
    </form>`);
  overlay.querySelector('#app-startup-toggle')?.addEventListener('click', () =>
    overlay.querySelector('#app-startup-toggle')?.classList.toggle('on'),
  );
  overlay.querySelector('form')!.addEventListener('submit', async (event) => {
    event.preventDefault();
    const launchAtStartup = overlay.querySelector('#app-startup-toggle')!.classList.contains('on');
    const snapshot = await window.senku.saveSettings({ ...state.settings, launchAtStartup });
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
      <span class="section-kicker">SPACES</span>
      <h2>Choose a Space</h2>
      <p class="modal-copy">Each Space has its own main folder and tasks.</p>
      <div class="workspace-list">
        ${state.workspaces
          .map(
            (ws) => `
          <button class="workspace-option ${ws.id === state.workspace?.id ? 'current' : ''}"
            data-workspace-id="${ws.id}">
            <span class="workspace-dot ${state.workspaceFolderAvailability[ws.id] === false ? 'missing' : ws.strictMode ? 'open-resources' : ''}" title="${state.workspaceFolderAvailability[ws.id] === false ? 'Main folder not found' : ws.strictMode ? 'Opens linked resources automatically' : 'Gentle reminder mode'}"></span>
            <span>
              <strong>${escapeHtml(ws.name)}</strong>
              <small>Main folder · ${escapeHtml(ws.masterFolder)}</small>
            </span>
            <span>→</span>
          </button>`,
          )
          .join('')}
      </div>
      <button class="primary-button" id="new-workspace">+ Add a Space</button>
      <button class="danger-button" id="delete-workspace">Delete this Space</button>
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
      <span class="section-kicker">NEW SPACE</span>
      <h2>Give a folder its own Space.</h2>
      <p class="modal-copy">Tasks and settings in this Space stay separate.</p>
      <label>Space name
        <input name="name" required placeholder="e.g. College, Personal, Projects" />
      </label>
      <label>Main folder
        <div class="path-input">
          <input name="folder" required placeholder="C:\\Users\\you\\projects" />
          <button type="button" id="browse-folder" class="ghost-button">Browse</button>
        </div>
      </label>
      <p class="form-error" id="workspace-error"></p>
      <button class="primary-button" type="submit">Create Space <span>→</span></button>
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
        err instanceof Error ? err.message : 'Could not create Space.',
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Space settings — applies only to the selected Space
// ---------------------------------------------------------------------------

export function openWorkspaceSettingsModal(load: () => Promise<void>, render: () => void): void {
  if (!state?.workspace) return;
  const ws = state.workspace;

  const overlay = createOverlay(`
    <form class="modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>
      <span class="section-kicker">SPACE SETTINGS</span>
      <h2>Settings for ${escapeHtml(ws.name)}</h2>
      <p class="modal-copy">Main folder: ${escapeHtml(ws.masterFolder)}. These settings affect this Space only.</p>
      <label>Space name
        <input name="name" required value="${escapeHtml(ws.name)}" />
      </label>
      <label>Main folder
        <div class="path-input">
          <input name="folder" required value="${escapeHtml(ws.masterFolder)}" />
          <button type="button" id="browse-space-folder" class="ghost-button">Browse</button>
        </div>
      </label>
      <div class="profile-setting">
        <div><strong>Open linked resources automatically</strong><small>When on, files and links open when Scheduled tasks start. This applies only to ${escapeHtml(ws.name)}.</small></div>
        <button type="button" id="space-auto-open" class="toggle ${ws.strictMode ? 'on' : ''}" aria-label="Toggle automatic resource opening"><span></span></button>
      </div>
      <p class="form-error" id="workspace-settings-error"></p>
      <button class="primary-button" type="submit">Save Space settings <span>→</span></button>
      <button type="button" class="danger-button" id="delete-workspace">Delete this Space</button>
    </form>`);

  overlay.querySelector('#browse-space-folder')?.addEventListener('click', async () => {
    const folder = await window.senku.chooseMasterFolder();
    if (folder) (overlay.querySelector('[name="folder"]') as HTMLInputElement).value = folder;
  });

  overlay.querySelector('#delete-workspace')?.addEventListener('click', async () => {
    if (!confirm(`Delete ${ws.name} and its Senku tasks? The Windows folder will not be touched.`)) return;
    const result = await window.senku.deleteWorkspace(ws.id);
    if (!result.ok) {
      showFormError(overlay, '#workspace-settings-error', result.error ?? 'Could not delete Space.');
      return;
    }
    overlay.remove();
    await load();
  });

  overlay.querySelector('#space-auto-open')?.addEventListener('click', () =>
    overlay.querySelector('#space-auto-open')?.classList.toggle('on'),
  );

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
    try {
      let snapshot = await window.senku.setMasterFolder(ws.id, folder);
      snapshot = await window.senku.renameWorkspace(ws.id, name);
      const autoOpen = overlay.querySelector('#space-auto-open')!.classList.contains('on');
      snapshot = await window.senku.setStrictMode(ws.id, autoOpen);
      setState(snapshot);
      overlay.remove();
      render();
    } catch (err) {
      showFormError(overlay, '#workspace-settings-error', err instanceof Error ? err.message : 'Could not save Space settings.');
    }
  });
}
