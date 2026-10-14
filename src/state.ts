import type { AppSnapshot, FileEntry, Task } from '../electron/types';

// ---------------------------------------------------------------------------
// Central app state
// ---------------------------------------------------------------------------

export let state = {} as AppSnapshot;
export let currentView = 'Home';
export let currentPath = '';
export let completedFilter: 'today' | 'last-week' | 'all' = 'last-week';
export let dailyNote = '';
export const selectedTaskIds = new Set<string>();

/** True while the note has typing that hasn't reached the disk yet. */
let noteDirty = false;

/** How many rows the file list draws at once, so huge folders stay fast. */
export const FILE_PAGE = 150;
export let fileFilter = '';
export let fileLimit = FILE_PAGE;

export function setState(snapshot: AppSnapshot): void {
  // New folder -> start with a clean filter and a short list.
  if (snapshot.currentPath !== currentPath) {
    fileFilter = '';
    fileLimit = FILE_PAGE;
  }
  state = snapshot;
  currentPath = snapshot.currentPath;
  // Never overwrite what the person is typing with the older copy from disk.
  if (!noteDirty) dailyNote = snapshot.dailyNote;
}

export function setView(view: string): void {
  currentView = view;
  selectedTaskIds.clear();
}

export function setCompletedFilter(filter: 'today' | 'last-week' | 'all'): void {
  completedFilter = filter;
  selectedTaskIds.clear(); // never act on rows that are no longer visible
}

export function setDailyNote(content: string): void {
  dailyNote = content;
}

export function setNoteDirty(value: boolean): void {
  noteDirty = value;
}

export function setFileFilter(value: string): void {
  fileFilter = value;
  fileLimit = FILE_PAGE;
}

export function showMoreFiles(): void {
  fileLimit += FILE_PAGE;
}

// ---------------------------------------------------------------------------
// Files: filter + page
// ---------------------------------------------------------------------------

export function visibleEntries(): { items: FileEntry[]; matched: number; total: number } {
  const all = state?.entries ?? [];
  const q = fileFilter.trim().toLowerCase();
  const matched = q ? all.filter((entry) => entry.name.toLowerCase().includes(q)) : all;
  return { items: matched.slice(0, fileLimit), matched: matched.length, total: all.length };
}

// ---------------------------------------------------------------------------
// Derived task lists
// ---------------------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;

export function tasksForView(view: string): Task[] {
  if (!state?.activeTasks) return [];

  const now = Date.now();
  const sortTasks = (tasks: Task[]) => tasks.sort((a, b) =>
    Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) ||
    Number(a.taskType === 'flexible') - Number(b.taskType === 'flexible') ||
    (a.startAt && b.startAt ? Date.parse(a.startAt) - Date.parse(b.startAt) : 0),
  );
  const active = sortTasks([...state.activeTasks]);

  if (view === 'Completed') {
    return state.completedTasks.filter((task) => {
      if (completedFilter === 'all') return true;
      const completedAt = Date.parse(task.completedAt ?? task.updatedAt);
      if (completedFilter === 'today') {
        return new Date(completedAt).toDateString() === new Date().toDateString();
      }
      return completedAt >= now - 7 * DAY;
    });
  }

  if (view === 'Upcoming') {
    const startOfTomorrow = new Date();
    startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
    startOfTomorrow.setHours(0, 0, 0, 0);

    return active.filter((task) =>
      task.taskType === 'scheduled' &&
      Boolean(task.startAt && Date.parse(task.startAt) >= startOfTomorrow.getTime())
    );
  }
  if (view === 'Flexible') return active.filter((task) => task.taskType === 'flexible');
  if (view === 'Overdue') return active.filter((task) =>
    task.taskType === 'scheduled' && Boolean(task.endAt && Date.parse(task.endAt) < now),
  );

  return active.filter((task) => task.taskType === 'scheduled' && Boolean(
    task.startAt && task.endAt && Date.parse(task.endAt) >= now &&
    (Date.parse(task.startAt) <= now || new Date(task.startAt).toDateString() === new Date().toDateString()),
  ));
}

export const visibleTasks = (): Task[] => tasksForView(currentView);

// ---------------------------------------------------------------------------
// Derived counts for the Home screen
// ---------------------------------------------------------------------------

export function overdueCount(): number {
  return tasksForView('Overdue').length;
}

export function errorCount(): number {
  return state?.errorTasks?.length ?? 0;
}

// ---------------------------------------------------------------------------
// Two-card focus resolution for the Home launchpad
// ---------------------------------------------------------------------------

export let pickedFlexibleTaskId: string | null = null;

export function setPickedFlexibleTask(id: string | null): void {
  pickedFlexibleTaskId = id;
}

export let homeFocusTab: 'scheduled' | 'flexible' = 'scheduled';

export function setHomeFocusTab(tab: 'scheduled' | 'flexible'): void {
  homeFocusTab = tab;
}

export interface ScheduledFocusResult {
  task: Task | null;
  reason: 'in-progress' | 'overdue' | 'today' | 'none';
}

export function getScheduledFocusTask(): ScheduledFocusResult {
  if (!state?.activeTasks?.length) return { task: null, reason: 'none' };
  const now = Date.now();
  const scheduled = state.activeTasks.filter((t) => t.taskType === 'scheduled');

  // 1. In-progress (startAt <= now <= endAt)
  const inProgress = scheduled.find(
    (t) => t.startAt && t.endAt && Date.parse(t.startAt) <= now && Date.parse(t.endAt) >= now,
  );
  if (inProgress) return { task: inProgress, reason: 'in-progress' };

  // 2. Overdue / Missed
  const overdue = scheduled.find((t) => t.endAt && Date.parse(t.endAt) < now);
  if (overdue) return { task: overdue, reason: 'overdue' };

  // 3. Upcoming today
  const todayUpcoming = scheduled
    .filter((t) => {
      if (!t.startAt) return false;
      const start = Date.parse(t.startAt);
      return start > now && new Date(start).toDateString() === new Date().toDateString();
    })
    .sort((a, b) => Date.parse(a.startAt!) - Date.parse(b.startAt!));
  if (todayUpcoming.length > 0) return { task: todayUpcoming[0], reason: 'today' };

  return { task: null, reason: 'none' };
}

export interface FlexibleFocusResult {
  task: Task | null;
  isPicked: boolean;
  totalFlexible: number;
}

export function getFlexibleFocusTask(): FlexibleFocusResult {
  if (!state?.activeTasks?.length) return { task: null, isPicked: false, totalFlexible: 0 };
  const flexible = state.activeTasks.filter((t) => t.taskType === 'flexible');
  if (flexible.length === 0) return { task: null, isPicked: false, totalFlexible: 0 };

  // 1. Picked via randomizer
  if (pickedFlexibleTaskId) {
    const picked = flexible.find((t) => t.id === pickedFlexibleTaskId);
    if (picked) return { task: picked, isPicked: true, totalFlexible: flexible.length };
  }

  // 2. Pinned flexible task
  const pinned = flexible.find((t) => t.isPinned);
  if (pinned) return { task: pinned, isPicked: false, totalFlexible: flexible.length };

  // 3. First flexible task
  return { task: flexible[0], isPicked: false, totalFlexible: flexible.length };
}

