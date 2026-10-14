import {
  state,
  currentView,
  completedFilter,
  selectedTaskIds,
  setCompletedFilter,
  setView,
  setDailyNote,
  setNoteDirty,
  setFileFilter,
  showMoreFiles,
  visibleTasks,
  setPickedFlexibleTask,
  pickedFlexibleTaskId,
  setHomeFocusTab,
} from './state';
import { fileCountLabel, fileListMarkup } from './markup';
import { checkMainFolder, DEFAULT_GREETING, isSamePath, parentOf } from './utils';
import { registerShortcuts } from './shortcuts';
import {
  openNewTaskModal,
  openEditTaskModal,
  openSnoozeModal,
  openReassignModal,
  openProfileModal,
  openAppSettingsModal,
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
    if (!detail || detail.querySelector('.task-launch-pill, .open-resources-button')) return;

    const button = document.createElement('button');
    button.className = 'task-launch-pill';
    button.dataset.action = 'open-resources';
    button.dataset.taskId = task.id;
    button.innerHTML = `<span class="pill-icon">▷</span> Launch (${task.linkedPaths.length})`;
    button.title = 'Open all linked resources';
    detail.append(button);
  });
}

/** Selection bar above the task list. Active tasks: Complete + Delete. Completed tasks: Delete. */
export function addCompleteSelectedBar(): void {
  if (currentView === 'Error' || selectedTaskIds.size === 0) return;
  const list = document.querySelector('.task-list');
  if (!list || list.previousElementSibling?.classList.contains('selection-actions')) return;

  const allSelected = visibleTasks().every((t) => selectedTaskIds.has(t.id));
  const bar = document.createElement('div');
  bar.className = 'selection-actions';
  bar.innerHTML = `
    <span class="selection-count">${selectedTaskIds.size} selected</span>
    <button class="selection-link" data-action="select-all">${allSelected ? 'Clear' : 'Select all'}</button>
    ${currentView === 'Completed' ? '' : '<button class="selection-btn complete" data-action="complete-selected">✓ Complete</button>'}
    <button class="selection-btn delete" data-action="delete-selected">✕ Delete</button>`;
  list.before(bar);
}

/** Inject filter buttons above the completed task list. */
export function addCompletedFilters(render: RenderFn): void {
  if (currentView !== 'Completed') return;
  const list = document.querySelector('.task-list');
  if (!list || list.previousElementSibling?.classList.contains('task-filters')) return;

  const filters = document.createElement('div');
  filters.className = 'task-filters';
  const option = (value: string, label: string) =>
    `<button data-completed-filter="${value}" class="${completedFilter === value ? 'active' : ''}">${label}</button>`;
  filters.innerHTML = option('today', 'Today') + option('last-week', 'Last week') + option('all', 'All');
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
    setNoteDirty(true);

    // Debounce saves — write 1.5 s after the user stops typing
    if (noteSaveTimer) clearTimeout(noteSaveTimer);
    if (savedEl) {
      savedEl.textContent = 'saving…';
      savedEl.style.opacity = '1';
    }
    noteSaveTimer = setTimeout(async () => {
      await window.senku.saveNote(content);
      // Only "clean" if nothing new was typed while saving.
      if (textarea.value === content) setNoteDirty(false);
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
    .querySelector('#workspace-settings')
    ?.addEventListener('click', () => openWorkspaceSettingsModal(load, render));

  document.querySelector('#add-space')?.addEventListener('click', () => openWorkspaceFormModal(load));

  document.querySelector('#app-settings')?.addEventListener('click', () => openAppSettingsModal(render));
}

// ---------------------------------------------------------------------------
// Topbar
// ---------------------------------------------------------------------------

function bindTopbarButtons(load: LoadFn): void {
  document
    .querySelector('#refresh-button')
    ?.addEventListener('click', () => void load(state.currentPath));
}

// ---------------------------------------------------------------------------
// File actions
// ---------------------------------------------------------------------------

/** One listener for the whole panel (instead of 3 per row), so big folders stay fast. */
function bindFileActions(load: LoadFn): void {
  const panel = document.querySelector<HTMLElement>('.files-panel');
  if (!panel) return;

  const refreshList = () => {
    const list = panel.querySelector('.file-list');
    if (list) list.innerHTML = fileListMarkup();
    const count = panel.querySelector('#file-count');
    if (count) count.textContent = fileCountLabel();
  };

  panel.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;

    const fileAction = target.closest<HTMLElement>('[data-file-action]');
    if (fileAction) {
      event.stopPropagation();
      const action = fileAction.dataset.fileAction!;
      const filePath = fileAction.dataset.path!;
      if (action === 'copy') {
        await window.senku.copyPath(filePath);
        fileAction.textContent = 'Copied';
        setTimeout(() => { fileAction.textContent = 'Copy path'; }, 1200);
        return;
      }
      const here = state.currentPath;
      if (action === 'pin') await window.senku.pinPath(filePath);
      if (action === 'unpin') await window.senku.unpinPath(filePath);
      await load(here);
      return;
    }

    const open = target.closest<HTMLElement>('[data-open-path]');
    if (open) {
      const p = open.dataset.openPath!;
      if (open.dataset.kind === 'folder') await load(p);
      else await window.senku.openPath(p);
      return;
    }

    if (target.closest('#show-more-files')) {
      showMoreFiles();
      refreshList();
      return;
    }
    if (target.closest('#go-up')) {
      const root = state.workspace?.masterFolder;
      if (root && !isSamePath(state.currentPath, root)) await load(parentOf(state.currentPath));
      return;
    }
    if (target.closest('#go-root')) {
      await load(state.workspace?.masterFolder);
      return;
    }
    if (target.closest('#open-folder')) {
      await window.senku.openPath(state.currentPath);
      return;
    }
    const crumb = target.closest<HTMLElement>('[data-breadcrumb]');
    if (crumb) await load(crumb.dataset.breadcrumb);
  });

  // Live filter: only the list is redrawn, so typing never loses focus.
  let timer: ReturnType<typeof setTimeout> | undefined;
  panel.querySelector<HTMLInputElement>('#file-filter')?.addEventListener('input', (event) => {
    const value = (event.target as HTMLInputElement).value;
    clearTimeout(timer);
    timer = setTimeout(() => {
      setFileFilter(value);
      refreshList();
    }, 120);
  });
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
      if (target.closest('.avatar-button, #profile-avatar-button, #profile-sidebar-button')) {
        e.preventDefault();
        openProfileModal(render);
        return;
      }

      // Switch Space -> Always return to Home
      const switchSpaceBtn = target.closest<HTMLElement>('[data-switch-space]');
      if (switchSpaceBtn) {
        e.preventDefault();
        const spaceId = switchSpaceBtn.dataset.switchSpace;
        if (spaceId) {
          await window.senku.switchWorkspace(spaceId);
          setView('Home');
          await load();
        }
        return;
      }

      // Create Space triggers (header +, empty states, topbar pill, files unlinked button)
      if (target.closest('#add-space, #add-space-empty, #topbar-create-space, #create-space-files')) {
        e.preventDefault();
        openWorkspaceFormModal(load);
        return;
      }

      // Add task
      if (target.closest('#new-task, #add-task, #home-add-task, #home-hero-add-task, #home-agenda-add-task, #topbar-add-task')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (!state.workspace) {
          openWorkspaceFormModal(load);
          return;
        }
        openNewTaskModal(load);
        return;
      }

      // Hero Tab switcher (Scheduled Focus vs Flexible Focus)
      const tabBtn = target.closest<HTMLElement>('[data-home-tab]');
      if (tabBtn) {
        e.preventDefault();
        const tab = tabBtn.dataset.homeTab as 'scheduled' | 'flexible';
        if (tab) {
          setHomeFocusTab(tab);
          render();
        }
        return;
      }

      // Hero Launchpad: Start & Launch all resources
      const launchBtn = target.closest<HTMLElement>('[data-hero-launch]');
      if (launchBtn) {
        e.preventDefault();
        const taskId = launchBtn.dataset.heroLaunch;
        const task = state.activeTasks?.find((t) => t.id === taskId);
        if (task) {
          const originalHtml = launchBtn.innerHTML;
          launchBtn.innerHTML = `<span class="launch-icon">✓</span> <span class="launch-label">Opening resources...</span>`;
          for (const p of task.linkedPaths) {
            await window.senku.openPath(p);
          }
          setTimeout(() => {
            launchBtn.innerHTML = `<span class="launch-icon">✓</span> <span class="launch-label">Launched! Focus well</span> <span class="launch-arrow">→</span>`;
          }, 400);
          setTimeout(() => {
            if (document.body.contains(launchBtn)) launchBtn.innerHTML = originalHtml;
          }, 3500);
        }
        return;
      }

      // Hero Launchpad: Quick complete
      const heroCompleteBtn = target.closest<HTMLElement>('[data-hero-complete]');
      if (heroCompleteBtn) {
        e.preventDefault();
        const taskId = heroCompleteBtn.dataset.heroComplete;
        if (taskId) {
          await window.senku.completeTask(taskId);
          setPickedFlexibleTask(null);
          await load();
        }
        return;
      }

      // Hero Launchpad: Quick snooze
      const heroSnoozeBtn = target.closest<HTMLElement>('[data-hero-snooze]');
      if (heroSnoozeBtn) {
        e.preventDefault();
        const taskId = heroSnoozeBtn.dataset.heroSnooze;
        const mins = Number(heroSnoozeBtn.dataset.mins ?? 15);
        if (taskId) {
          await window.senku.snoozeTask(taskId, mins);
          await load();
        }
        return;
      }

      // Hero Launchpad: Quick make-flexible (guilt-free escape)
      const heroFlexBtn = target.closest<HTMLElement>('[data-hero-flexible]');
      if (heroFlexBtn) {
        e.preventDefault();
        const taskId = heroFlexBtn.dataset.heroFlexible;
        const task = state.activeTasks?.find((t) => t.id === taskId);
        if (task) {
          await window.senku.updateTask(task.id, {
            title: task.title,
            taskType: 'flexible',
            linkedPaths: task.linkedPaths,
          });
          await load();
        }
        return;
      }

      // Hero Launchpad: Pick random flexible task
      if (target.closest('#hero-pick-random, #hero-pick-another')) {
        e.preventDefault();
        const flexible = state.activeTasks?.filter((t) => t.taskType === 'flexible') ?? [];
        if (flexible.length > 0) {
          const other = flexible.filter((t) => t.id !== pickedFlexibleTaskId);
          const pool = other.length > 0 ? other : flexible;
          const choice = pool[Math.floor(Math.random() * pool.length)];
          setPickedFlexibleTask(choice.id);
          render();
        }
        return;
      }

      // Task row: 1-click make-flexible
      const rowMakeFlex = target.closest<HTMLElement>('[data-action="make-flexible"]');
      if (rowMakeFlex) {
        e.preventDefault();
        const id = rowMakeFlex.dataset.id;
        const task = state.activeTasks?.find((t) => t.id === id);
        if (task) {
          await window.senku.updateTask(task.id, {
            title: task.title,
            firstStep: task.firstStep,
            taskType: 'flexible',
            linkedPaths: task.linkedPaths,
          });
          await load();
        }
        return;
      }

      // Missed banner: Convert all to flexible
      if (target.closest('#convert-all-flexible')) {
        e.preventDefault();
        const now = Date.now();
        const overdueTasks = (state.activeTasks ?? []).filter(
          (t) => t.taskType === 'scheduled' && t.endAt && Date.parse(t.endAt) < now,
        );
        for (const task of overdueTasks) {
          await window.senku.updateTask(task.id, {
            title: task.title,
            firstStep: task.firstStep,
            taskType: 'flexible',
            linkedPaths: task.linkedPaths,
          });
        }
        await load();
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

      // Select all / clear (only the rows currently visible)
      if (target.closest('[data-action="select-all"]')) {
        const ids = visibleTasks().map((t) => t.id);
        if (ids.every((id) => selectedTaskIds.has(id))) selectedTaskIds.clear();
        else ids.forEach((id) => selectedTaskIds.add(id));
        render();
        return;
      }

      // Bulk actions only touch rows that are visible right now.
      const selectedVisibleIds = () => visibleTasks().map((t) => t.id).filter((id) => selectedTaskIds.has(id));

      // Complete selected — single atomic IPC call, no file-race
      if (target.closest('[data-action="complete-selected"]')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const ids = selectedVisibleIds();
        selectedTaskIds.clear();
        if (ids.length) await window.senku.completeManyTasks(ids);
        await load();
        return;
      }

      // Delete selected — works for active and completed tasks
      if (target.closest('[data-action="delete-selected"]')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const ids = selectedVisibleIds();
        if (ids.length && confirm(`Delete ${ids.length} task${ids.length === 1 ? '' : 's'}? This cannot be undone. Your files are not affected.`)) {
          selectedTaskIds.clear();
          await window.senku.deleteManyTasks(ids, currentView === 'Completed' ? 'completed' : 'active');
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


