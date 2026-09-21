import { state, currentView, selectedTaskIds, setCompletedFilter, setView } from './state';
import {
  openNewTaskModal,
  openEditTaskModal,
  openSnoozeModal,
  openReassignModal,
  openProfileModal,
  openWorkspaceMenuModal,
  openWorkspaceFormModal,
  openWorkspaceSettingsModal,
  openRenameFileModal,
} from './modals';

type LoadFn = (path?: string) => Promise<void>;
type RenderFn = () => void;

// ---------------------------------------------------------------------------
// Post-render DOM patches
// (things easier to append after innerHTML is set than to embed in markup)
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

/** Inject the "complete selected" bar above the task list when in active bucket. */
export function addCompleteSelectedBar(): void {
  if (currentView === 'Completed' || currentView === 'Error') return;
  const list = document.querySelector('.task-list');
  if (!list || list.previousElementSibling?.classList.contains('complete-selected')) return;

  const bar = document.createElement('button');
  bar.className = 'complete-selected';
  bar.dataset.action = 'complete-selected';
  bar.textContent =
    selectedTaskIds.size > 0
      ? `Complete selected (${selectedTaskIds.size})`
      : 'Select tasks to complete';
  bar.disabled = selectedTaskIds.size === 0;
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

/** Appends the "Made by a Navodayan" creator note to the sidebar once. */
export function addCreatorNote(): void {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar || sidebar.querySelector('.creator-note')) return;
  const note = document.createElement('p');
  note.className = 'creator-note';
  note.textContent = 'Made by a Navodayan';
  sidebar.append(note);
}

// ---------------------------------------------------------------------------
// Main event binding (runs after each render)
// ---------------------------------------------------------------------------

// bindAll is called after every render() — only bind listeners that attach to
// freshly-created DOM nodes (querySelector results change each render).
// Anything on a stable ancestor (document / appRoot) must be registered ONCE
// at boot via initGlobalListeners() — NOT here — or listeners stack up.
export function bindAll(load: LoadFn, render: RenderFn): void {
  bindNavigation(render);
  bindSidebarButtons(load, render);
  bindTopbarButtons(load);
  bindFileActions(load);
  bindTaskRowActions(load);
  // ⚠️  Do NOT call bindDelegatedClicks here.
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

function bindNavigation(render: RenderFn): void {
  // nav-item and task-tab buttons share data-view
  document.querySelectorAll<HTMLElement>('[data-view]').forEach((btn) =>
    btn.addEventListener('click', () => {
      setView(btn.dataset.view ?? 'Today');
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
    ?.addEventListener('click', () => openWorkspaceSettingsModal(render));
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
    ?.addEventListener('click', () =>
      void load(state.workspace?.masterFolder),
    );

  // Breadcrumb buttons inside the folder-path bar
  document.querySelectorAll<HTMLElement>('[data-breadcrumb]').forEach((btn) =>
    btn.addEventListener('click', () => void load(btn.dataset.breadcrumb)),
  );
}

// ---------------------------------------------------------------------------
// File actions
// ---------------------------------------------------------------------------

function bindFileActions(load: LoadFn): void {
  // Open file/folder on click of the file-open button
  document.querySelectorAll<HTMLElement>('[data-open-path]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const p = btn.dataset.openPath!;
      if (btn.dataset.kind === 'folder') await load(p);
      else await window.senku.openPath(p);
    }),
  );

  // Double-click on the row itself also opens
  document.querySelectorAll<HTMLElement>('[data-path]').forEach((row) =>
    row.addEventListener('dblclick', () => {
      const p = row.dataset.path!;
      if (row.dataset.kind === 'folder') void load(p);
      else void window.senku.openPath(p);
    }),
  );

  // Copy path / rename
  document.querySelectorAll<HTMLElement>('[data-file-action]').forEach((btn) =>
    btn.addEventListener('click', async () => {
      const action = btn.dataset.fileAction!;
      const filePath = btn.dataset.path!;

      if (action === 'copy') {
        await window.senku.copyPath(filePath);
        btn.textContent = 'Copied';
        setTimeout(() => { btn.textContent = 'Copy path'; }, 1200);
      }

      if (action === 'rename') {
        openRenameFileModal(filePath, btn.dataset.name!, load, state.currentPath);
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Task row actions (buttons inside each task card)
// ---------------------------------------------------------------------------

function bindTaskRowActions(load: LoadFn): void {
  // Select checkbox
  document.querySelectorAll<HTMLElement>('[data-action="select"]').forEach((btn) =>
    btn.addEventListener('click', () => {
      const id = btn.dataset.id!;
      if (selectedTaskIds.has(id)) selectedTaskIds.delete(id);
      else selectedTaskIds.add(id);
      // Re-render is handled via the delegated click handler below
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
  document.querySelectorAll<HTMLElement>('[data-action="edit"], [data-action="recover"]').forEach((btn) =>
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
// Delegated click handler on appRoot (catches dynamic / post-render elements)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Global listeners — call ONCE at app boot, never again
// ---------------------------------------------------------------------------
// These attach to `document` (a node that never gets replaced by render),
// so they work regardless of which view is currently rendered and never
// accumulate across re-renders.

export function initGlobalListeners(load: LoadFn, render: RenderFn): void {
  document.addEventListener(
    'click',
    async (e) => {
      const target = e.target as HTMLElement;

      // --- Avatar / profile ---
      if (target.closest('.avatar-button, #profile-sidebar-button')) {
        e.preventDefault();
        openProfileModal(render);
        return;
      }

      // --- Add task buttons ---
      if (target.closest('#new-task, #add-task')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        openNewTaskModal(load);
        return;
      }

      // --- Open linked resources button (on task row) ---
      const resourceBtn = target.closest<HTMLElement>('[data-action="open-resources"]');
      if (resourceBtn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const allTasks = state
          ? [...state.activeTasks, ...state.completedTasks, ...state.errorTasks]
          : [];
        const task = allTasks.find((t) => t.id === resourceBtn.dataset.taskId);
        if (task) {
          for (const p of task.linkedPaths) await window.senku.openPath(p);
        }
        return;
      }

      // --- Open a completed task's linked path ---
      const linkedPathBtn = target.closest<HTMLElement>('[data-task-path]');
      if (linkedPathBtn) {
        e.preventDefault();
        await window.senku.openPath(linkedPathBtn.dataset.taskPath!);
        return;
      }

      // --- Select checkbox (re-render to update bar) ---
      const selectBtn = target.closest<HTMLElement>('[data-action="select"]');
      if (selectBtn) {
        // Toggle already happened in bindTaskRowActions; just sync the UI.
        render();
        return;
      }

      // --- Complete selected bar ---
      const completeBar = target.closest<HTMLElement>('[data-action="complete-selected"]');
      if (completeBar) {
        e.preventDefault();
        e.stopImmediatePropagation();
        for (const id of selectedTaskIds) await window.senku.completeTask(id);
        selectedTaskIds.clear();
        await load();
        return;
      }
    },
    true, // capture phase so it fires before per-element listeners
  );
}

// ---------------------------------------------------------------------------
// Setup screen events
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
      errorEl.textContent = 'Enter your name, workspace name, and master folder.';
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
        err instanceof Error ? err.message : 'Could not create workspace.';
    }
  });
}
