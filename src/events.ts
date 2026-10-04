import { state, currentView, selectedTaskIds, setCompletedFilter, setView, setDailyNote, setState } from './state';
import { registerShortcuts } from './shortcuts';
import {
  openNewTaskModal,
  openEditTaskModal,
  openSnoozeModal,
  openReassignModal,
  openProfileModal,
  openAppSettingsModal,
  openWorkspaceMenuModal,
  openWorkspaceFormModal,
  openWorkspaceSettingsModal,
} from './modals';

type LoadFn = (path?: string) => Promise<void>;
type RenderFn = () => void;

// ---------------------------------------------------------------------------
// Post-render DOM patches
// ---------------------------------------------------------------------------

/** Append "Open resources" buttons to task rows that have linked paths. */
export function addResourceButtons(): void {
  const allTasks = state
    ? [...state.activeTasks, ...state.completedTasks, ...state.errorTasks]
    : [];

  document.querySelectorAll<HTMLElement>('.task-row').forEach((row) => {
    const idEl = row.querySelector<HTMLElement>('[data-id]');
    if (!idEl) return;
    const task = allTasks.find((t) => t.id === idEl.dataset.id);
    if (!task?.linkedPaths.length) return;

    const detail = row.querySelector('.task-body');
    if (!detail || detail.querySelector('.open-resources-button')) return;

    const button = document.createElement('button');
    button.className = 'open-resources-button';
    button.dataset.action = 'open-resources';
    button.dataset.taskId = task.id;
    button.textContent = `Open resources (${task.linkedPaths.length})`;
    button.title = 'Open all linked resources';
    detail.append(button);
  });
}

/** Inject Complete + Delete selection action bar above the task list in active views. */
export function addCompleteSelectedBar(): void {
  if (currentView === 'Completed' || currentView === 'Error') return;
  if (selectedTaskIds.size === 0) return;
  const list = document.querySelector('.task-list');
  if (!list || list.previousElementSibling?.classList.contains('selection-actions')) return;

  const count = selectedTaskIds.size;
  const bar = document.createElement('div');
  bar.className = 'selection-actions';
  bar.innerHTML = `
    <span class="selection-count">${count} selected</span>
    <button class="selection-btn complete" data-action="complete-selected"
      >
      ✓ Complete
    </button>
    <button class="selection-btn delete" data-action="delete-selected"
      >
      ✕ Delete
    </button>`;
  list.before(bar);
}

/** Inject filter buttons above the completed task list. */
export function addCompletedFilters(render: RenderFn): void {
  if (currentView !== 'Completed') return;
  const list = document.querySelector('.task-list');
  if (!list || list.previousElementSibling?.classList.contains('task-filters')) return;

  const filters = document.createElement('div');
  filters.className = 'task-filters';
  filters.innerHTML = `
    <button data-completed-filter="today">Today</button>
    <button data-completed-filter="last-week">Last week</button>
    <button data-completed-filter="all">All</button>`;
  list.before(filters);

  filters.querySelectorAll<HTMLElement>('[data-completed-filter]').forEach((btn) =>
    btn.addEventListener('click', () => {
      setCompletedFilter(btn.dataset.completedFilter as 'today' | 'last-week' | 'all');
      render();
    }),
  );
}

// ---------------------------------------------------------------------------
// Daily note autosave
// ---------------------------------------------------------------------------

let noteSaveTimer: ReturnType<typeof setTimeout> | null = null;

/** Bind autosave on the daily note textarea. Call after every render. */
export function bindDailyNote(): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('#daily-note');
  const savedEl = document.querySelector<HTMLElement>('#note-saved');
  if (!textarea) return;

  // Show "saved" indicator on boot, hide it until user types
  if (savedEl) savedEl.style.opacity = '0';

  textarea.addEventListener('input', () => {
    const content = textarea.value;
    setDailyNote(content);

    // Debounce saves — write 1.5 s after the user stops typing
    if (noteSaveTimer) clearTimeout(noteSaveTimer);
    if (savedEl) {
      savedEl.textContent = 'saving…';
      savedEl.style.opacity = '1';
    }
    noteSaveTimer = setTimeout(async () => {
      await window.senku.saveNote(content);
      if (savedEl) {
        savedEl.textContent = 'saved';
        // Fade out after 2 s
        setTimeout(() => { if (savedEl) savedEl.style.opacity = '0'; }, 2000);
      }
    }, 1500);
  });
}

// ---------------------------------------------------------------------------
// Main event binding (runs after each render)
// ---------------------------------------------------------------------------

export function bindAll(load: LoadFn, render: RenderFn): void {
  bindNavigation(render);
  bindSidebarButtons(load, render);
  bindTopbarButtons(load);
  bindFileActions(load);
  bindTaskRowActions(load);
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function bindNavigation(render: RenderFn): void {
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((btn) =>
    btn.addEventListener('click', () => {
      setView(btn.dataset.view ?? 'Today');
      selectedTaskIds.clear();
      render();
    }),
  );
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

function bindSidebarButtons(load: LoadFn, render: RenderFn): void {
  document
    .querySelector('#workspace-switcher')
    ?.addEventListener('click', () => openWorkspaceMenuModal(load));

  document
    .querySelector('#workspace-settings')
    ?.addEventListener('click', () => openWorkspaceSettingsModal(load, render));

  document.querySelector('#add-space')?.addEventListener('click', () => openWorkspaceFormModal(load));

  document.querySelector('#app-settings')?.addEventListener('click', () => openAppSettingsModal(render));

  document.querySelectorAll<HTMLElement>('[data-switch-space]').forEach((button) =>
    button.addEventListener('click', async () => {
      await window.senku.switchWorkspace(button.dataset.switchSpace!);
      await load();
    }),
  );
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

function bindTopbarButtons(load: LoadFn): void {
  document
    .querySelector('#refresh-button')
    ?.addEventListener('click', () => void load(state.currentPath));

  document
    .querySelector('#open-folder')
    ?.addEventListener('click', () => void window.senku.openPath(state.currentPath));

  document
    .querySelector('#go-root')
    ?.addEventListener('click', () => void load(state.workspace?.masterFolder));

  document.querySelectorAll<HTMLElement>('[data-breadcrumb]').forEach((btn) =>
    btn.addEventListener('click', () => void load(btn.dataset.breadcrumb)),
  );
}

// ---------------------------------------------------------------------------
// File actions
// ---------------------------------------------------------------------------

function bindFileActions(load: LoadFn): void {
  // Open file / navigate into folder
  document.querySelectorAll<HTMLElement>('[data-open-path]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const p = btn.dataset.openPath!;
      if (btn.dataset.kind === 'folder') await load(p);
      else await window.senku.openPath(p);
    }),
  );

  // Double-click row also opens
  document.querySelectorAll<HTMLElement>('.file-row').forEach((row) =>
    row.addEventListener('dblclick', () => {
      const p = row.dataset.path!;
      if (row.dataset.kind === 'folder') void load(p);
      else void window.senku.openPath(p);
    }),
  );

  // Copy path / pin / unpin
  document.querySelectorAll<HTMLElement>('[data-file-action]').forEach((btn) =>
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.fileAction!;
      const filePath = btn.dataset.path!;

      if (action === 'copy') {
        await window.senku.copyPath(filePath);
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy path'; }, 1200);
        return;
      }

      if (action === 'pin') {
        const snap = await window.senku.pinPath(filePath);
        setState(snap);
        await load(state.currentPath);
        return;
      }

      if (action === 'unpin') {
        const snap = await window.senku.unpinPath(filePath);
        setState(snap);
        await load(state.currentPath);
        return;
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Task row actions
// ---------------------------------------------------------------------------

function bindTaskRowActions(load: LoadFn): void {
  document.querySelectorAll<HTMLElement>('[data-action="pin"]').forEach((button) =>
    button.addEventListener('click', async () => {
      const task = state.activeTasks.find((item) => item.id === button.dataset.id);
      if (!task) return;
      await window.senku.setTaskPinned(task.id, !task.isPinned);
      await load(state.currentPath);
    }),
  );

  // Snooze
  document.querySelectorAll<HTMLElement>('[data-action="snooze"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const task = state.activeTasks.find((t) => t.id === btn.dataset.id);
      if (task) openSnoozeModal(task, load);
    }),
  );

  // Reassign
  document.querySelectorAll<HTMLElement>('[data-action="reschedule"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const task = state.activeTasks.find((t) => t.id === btn.dataset.id);
      if (task) openReassignModal(task, load);
    }),
  );

  // Edit / recover
  document
    .querySelectorAll<HTMLElement>('[data-action="edit"], [data-action="recover"]')
    .forEach((btn) =>
      btn.addEventListener('click', () => {
        const bucket = (btn.dataset.bucket as 'active' | 'error') ?? 'active';
        const source = bucket === 'error' ? state.errorTasks : state.activeTasks;
        const task = source.find((t) => t.id === btn.dataset.id);
        if (task) openEditTaskModal(task, bucket, load);
      }),
    );

  // Delete
  document.querySelectorAll<HTMLElement>('[data-action="delete"]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const bucket = btn.dataset.bucket as 'active' | 'completed' | 'error';
      if (confirm('Delete this task from Senku? Your files will not be affected.')) {
        await window.senku.deleteTask(btn.dataset.id!, bucket);
        await load();
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Global listeners — registered ONCE at boot, never inside render
// ---------------------------------------------------------------------------

export function initGlobalListeners(load: LoadFn, render: RenderFn): void {
  registerShortcuts(load, render);

  document.addEventListener(
    'click',
    async (e) => {
      const target = e.target as HTMLElement;

      // Avatar / profile
      if (target.closest('.avatar-button, #profile-sidebar-button')) {
        e.preventDefault();
        openProfileModal(render);
        return;
      }

      // Add task
      if (target.closest('#new-task, #add-task, #home-add-task')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openNewTaskModal(load);
        return;
      }

      // Open linked resources
      const resourceBtn = target.closest<HTMLElement>('[data-action="open-resources"]');
      if (resourceBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const allTasks = state
          ? [...state.activeTasks, ...state.completedTasks, ...state.errorTasks]
          : [];
        const task = allTasks.find((t) => t.id === resourceBtn.dataset.taskId);
        if (task) for (const p of task.linkedPaths) await window.senku.openPath(p);
        return;
      }

      // Completed task linked path
      const linkedPathBtn = target.closest<HTMLElement>('[data-task-path]');
      if (linkedPathBtn) {
        e.preventDefault();
        await window.senku.openPath(linkedPathBtn.dataset.taskPath!);
        return;
      }

      // Select checkbox → re-render to sync bar
      const selectBtn = target.closest<HTMLElement>('[data-action="select"]');
      if (selectBtn) {
        const id = selectBtn.dataset.id;
        if (id) {
          if (selectedTaskIds.has(id)) selectedTaskIds.delete(id);
          else selectedTaskIds.add(id);
        }
        render();
        return;
      }

      // Complete selected — single atomic IPC call, no file-race
      const completeBar = target.closest<HTMLElement>('[data-action="complete-selected"]');
      if (completeBar && !completeBar.hasAttribute('disabled')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const ids = [...selectedTaskIds];
        selectedTaskIds.clear();
        await window.senku.completeManyTasks(ids);
        await load();
        return;
      }

      // Delete selected — same atomic approach
      const deleteBar = target.closest<HTMLElement>('[data-action="delete-selected"]');
      if (deleteBar && !deleteBar.hasAttribute('disabled')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const ids = [...selectedTaskIds];
        if (confirm(`Delete ${ids.length} task(s)? This cannot be undone.`)) {
          selectedTaskIds.clear();
          await window.senku.deleteManyTasks(ids, 'active');
          await load();
        }
        return;
      }

      // Error banner "Review →" link — treated as a view switch
      const bannerLink = target.closest<HTMLElement>('.error-banner-link');
      if (bannerLink) {
        e.preventDefault();
        setView('Error');
        render();
        return;
      }
    },
    true,
  );
}

// ---------------------------------------------------------------------------
// Setup screen
// ---------------------------------------------------------------------------

export function bindSetupScreen(load: LoadFn): void {
  document.querySelector('#browse-folder')?.addEventListener('click', async () => {
    const selected = await window.senku.chooseMasterFolder();
    if (selected) {
      (document.querySelector<HTMLInputElement>('#master-path')!).value = selected;
    }
  });

  document.querySelector('#save-folder')?.addEventListener('click', async () => {
    const name = (document.querySelector<HTMLInputElement>('#user-name')!).value.trim();
    const wsName = (document.querySelector<HTMLInputElement>('#workspace-name')!).value.trim();
    const folder = (document.querySelector<HTMLInputElement>('#master-path')!).value.trim();
    const errorEl = document.querySelector('#setup-error')!;

    if (!name || !wsName || !folder) {
      errorEl.textContent = 'Enter your name, Space name, and main folder.';
      return;
    }

    try {
      const { DEFAULT_GREETING } = await import('./utils');
      await window.senku.saveSettings({
        userName: name,
        activeWorkspaceId: '',
        launchAtStartup: true,
        greeting: DEFAULT_GREETING,
      });
      await window.senku.createWorkspace(wsName, folder);
      await load();
    } catch (err) {
      errorEl.textContent =
        err instanceof Error ? err.message : 'Could not create Space.';
    }
  });
}
