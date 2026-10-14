import type { Task, TaskInput, TaskType } from '../electron/types';
import { setState, state } from './state';
import { checkMainFolder, escapeHtml, toLocalDatetimeInput, DEFAULT_GREETING } from './utils';
import pkg from '../package.json';

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

  // A double-click on "Save" must not create the task twice.
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

  // Close on Escape (the listener is removed together with the modal)
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') overlay.remove(); };
  document.addEventListener('keydown', onKey);
  const removeOverlay = overlay.remove.bind(overlay);
  overlay.remove = () => {
    document.removeEventListener('keydown', onKey);
    removeOverlay();
  };

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
    firstStep: String(data.get('firstStep') ?? '').trim() || undefined,
    taskType,
    startAt,
    endAt,
    linkedPaths: String(data.get('linkedPaths') ?? '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

/**
 * Returns true if the folder is OK to use. Blocks system folders and asks before
 * accepting a whole drive or user folder.
 */
function folderAllowed(overlay: HTMLElement, selector: string, folder: string): boolean {
  const check = checkMainFolder(folder);
  if (check.level === 'block') {
    showFormError(overlay, selector, check.message);
    return false;
  }
  return check.level === 'ok' || confirm(check.message);
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
  firstStep?: string;
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
    <label>Tiny first step <span class="hint">optional · lowers starting friction</span>
      <input name="firstStep"
        placeholder="e.g. Open page 1, write 1 line, run test"
        value="${escapeHtml(defaults?.firstStep ?? '')}" />
    </label>
    <label>Task type</label>
    <div class="task-type-options">
      <label><input type="radio" name="taskType" value="scheduled" ${taskType === 'scheduled' ? 'checked' : ''}><span>Scheduled</span></label>
      <label><input type="radio" name="taskType" value="flexible" ${taskType === 'flexible' ? 'checked' : ''}><span>Flexible</span></label>
    </div>
    <div data-schedule-panel="scheduled" ${taskType === 'flexible' ? 'hidden' : ''}>
      <div class="time-presets">
        <span class="presets-label">Quick time:</span>
        <button type="button" class="preset-chip" data-preset="now">Right now</button>
        <button type="button" class="preset-chip" data-preset="plus30">+30 mins</button>
        <button type="button" class="preset-chip" data-preset="tonight">Tonight (8 PM)</button>
        <button type="button" class="preset-chip" data-preset="tomorrow">Tomorrow (9 AM)</button>
      </div>
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
    <label>Linked paths <span class="hint">optional · one per line · files or web links</span>
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
  // Quick time presets
  overlay.querySelectorAll<HTMLElement>('.preset-chip').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const preset = btn.dataset.preset;
      const now = new Date();
      let newStart = new Date(now);
      let newEnd = new Date(now);

      if (preset === 'now') {
        newStart = new Date(now);
        newEnd.setHours(23, 59, 59, 999);
      } else if (preset === 'plus30') {
        newStart = new Date(now.getTime() + 30 * 60_000);
        newEnd.setHours(23, 59, 59, 999);
      } else if (preset === 'tonight') {
        newStart.setHours(20, 0, 0, 0);
        if (now.getHours() >= 20) {
          newStart = new Date(now.getTime() + 15 * 60_000);
        }
        newEnd.setHours(23, 59, 59, 999);
      } else if (preset === 'tomorrow') {
        newStart.setDate(newStart.getDate() + 1);
        newStart.setHours(9, 0, 0, 0);
        newEnd.setDate(newEnd.getDate() + 1);
        newEnd.setHours(23, 59, 59, 999);
      }

      if (start) start.value = toLocalDatetimeInput(newStart);
      if (end) end.value = toLocalDatetimeInput(newEnd);

      overlay.querySelectorAll('.preset-chip').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
    });
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
    firstStep: task.firstStep,
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

  const userInitial = state.settings.userName ? state.settings.userName.charAt(0).toUpperCase() : 'S';

  const overlay = createOverlay(`
    <form class="modal-card profile-modal-card">
      <button type="button" class="modal-close" id="close-modal">×</button>

      <div class="profile-modal-header">
        <div class="profile-modal-avatar">
          <span>${escapeHtml(userInitial)}</span>
        </div>
        <div>
          <span class="section-kicker">SETTINGS &amp; IDENTITY</span>
          <h2>${escapeHtml(state.settings.userName || 'Profile')}</h2>
        </div>
      </div>

      <div class="profile-modal-body">
        <label>Your display name
          <input name="userName" id="profile-user-name" required value="${escapeHtml(state.settings.userName)}" placeholder="e.g. Vivek" autocomplete="off" />
        </label>

        <label>Daily morning greeting
          <input name="greeting" id="profile-greeting" value="${escapeHtml(state.settings.greeting || DEFAULT_GREETING)}" placeholder="${escapeHtml(DEFAULT_GREETING)}" autocomplete="off" />
        </label>

        <div class="profile-chips-line">
          <button type="button" class="preset-chip" data-set-greeting="Good morning, {name}.">Good morning</button>
          <button type="button" class="preset-chip" data-set-greeting="Deep focus mode, {name}.">Deep focus</button>
          <button type="button" class="preset-chip" data-set-greeting="Let's build, {name}.">Let's build</button>
          <button type="button" class="preset-chip" data-set-greeting="One tiny step at a time.">One step</button>
        </div>

        <div class="profile-toggle-row">
          <div class="toggle-text">
            <strong>Launch on Windows startup</strong>
            <small>Open automatically so your files and focus are ready when you log in.</small>
          </div>
          <button type="button" id="app-startup-toggle" class="toggle ${state.settings.launchAtStartup ? 'on' : ''}" aria-label="Toggle launch at startup"><span></span></button>
        </div>

        <button id="user-guide" class="profile-guide-btn" type="button">
          <span>📖 Senku User Guide &amp; Shortcuts</span>
          <span>↗</span>
        </button>
      </div>

      <p class="form-error" id="profile-error"></p>

      <div class="profile-modal-footer">
        <button class="primary-button" type="submit">Save Changes <span>→</span></button>
        <div class="profile-version-tag">Senku v${pkg.version} · Made by a Navodayan</div>
      </div>
    </form>`);

  // Greeting presets
  overlay.querySelectorAll<HTMLElement>('[data-set-greeting]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = overlay.querySelector<HTMLInputElement>('#profile-greeting');
      if (input && btn.dataset.setGreeting) {
        input.value = btn.dataset.setGreeting;
        input.focus();
      }
    });
  });

  // Windows startup toggle
  const toggle = overlay.querySelector('#app-startup-toggle');
  toggle?.addEventListener('click', () => toggle.classList.toggle('on'));

  // User guide
  overlay.querySelector('#user-guide')?.addEventListener('click', async () => {
    const result = await window.senku.openUserGuide();
    if (!result.ok) alert(result.error || 'User guide not found.');
  });

  // Form submit
  overlay.querySelector('form')!.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget as HTMLFormElement);
    const name = String(data.get('userName') ?? '').trim();
    if (!name) {
      showFormError(overlay, '#profile-error', 'Enter a display name.');
      return;
    }
    const greeting = String(data.get('greeting') ?? '').trim() || DEFAULT_GREETING;
    const launchAtStartup = overlay.querySelector('#app-startup-toggle')?.classList.contains('on') ?? state.settings.launchAtStartup;

    const snapshot = await window.senku.saveSettings({
      ...state.settings,
      userName: name,
      greeting,
      launchAtStartup,
    });
    setState(snapshot);
    overlay.remove();
    render();
  });
}

export function openAppSettingsModal(render: () => void): void {
  openProfileModal(render);
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
      <p class="modal-copy">Pick one folder for a subject or project, like “College” or “Projects”. Tasks and settings in each Space stay separate.</p>
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
    if (folder.toLowerCase() !== ws.masterFolder.toLowerCase() && !folderAllowed(overlay, '#workspace-settings-error', folder)) return;
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
