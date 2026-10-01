import type { AppSnapshot, Task } from '../electron/types';

// ---------------------------------------------------------------------------
// Central app state
// ---------------------------------------------------------------------------

export let state = {} as AppSnapshot;
export let currentView = 'Home';
export let currentPath = '';
export let completedFilter: 'today' | 'last-week' | 'all' = 'last-week';
export let dailyNote = '';
export const selectedTaskIds = new Set<string>();

export function setState(snapshot: AppSnapshot): void {
  state = snapshot;
  currentPath = snapshot.currentPath;
  // Only sync the note from disk on a full load — not on every render,
  // so the user's in-progress typing is never overwritten mid-session.
  dailyNote = snapshot.dailyNote;
}

export function setView(view: string): void {
  currentView = view;
  selectedTaskIds.clear();
}

export function setCompletedFilter(filter: 'today' | 'last-week' | 'all'): void {
  completedFilter = filter;
}

export function setDailyNote(content: string): void {
  dailyNote = content;
}

// ---------------------------------------------------------------------------
// Derived task lists
// ---------------------------------------------------------------------------

export function visibleTasks(): Task[] {
  if (!state) return [];

  const now = Date.now();
  const sortTasks = (tasks: Task[]) => tasks.sort((a, b) =>
    Number(Boolean(b.isPinned)) - Number(Boolean(a.isPinned)) ||
    Number(a.taskType === 'flexible') - Number(b.taskType === 'flexible') ||
    (a.startAt && b.startAt ? Date.parse(a.startAt) - Date.parse(b.startAt) : 0),
  );
  const active = sortTasks([...state.activeTasks]);

  if (currentView === 'Completed') {
    return state.completedTasks.filter((task) => {
      if (completedFilter === 'all') return true;
      const completedAt = Date.parse(task.completedAt ?? task.updatedAt);
      const day = 24 * 60 * 60 * 1000;
      if (completedFilter === 'today') {
        return new Date(completedAt).toDateString() === new Date().toDateString();
      }
      return completedAt >= now - 7 * day;
    });
  }

  if (currentView === 'Upcoming') return sortTasks(active.filter((task) =>
    task.taskType === 'flexible' || Boolean(task.startAt && task.endAt && Date.parse(task.startAt) > now && Date.parse(task.endAt) >= now),
  ));
  if (currentView === 'Flexible') return sortTasks(active.filter((task) => task.taskType === 'flexible'));
  if (currentView === 'Overdue') return active.filter((task) =>
    task.taskType === 'scheduled' && Boolean(task.endAt && Date.parse(task.endAt) < now),
  );

  const today = active.filter((task) => task.taskType === 'scheduled' && Boolean(
    task.startAt && task.endAt && Date.parse(task.endAt) >= now &&
    (Date.parse(task.startAt) <= now || new Date(task.startAt).toDateString() === new Date().toDateString()),
  ));
  return sortTasks(today);
}

// ---------------------------------------------------------------------------
// Derived counts for sidebar badges
// ---------------------------------------------------------------------------

export function overdueCount(): number {
  if (!state?.activeTasks) return 0;
  return state.activeTasks.filter((task) => task.taskType === 'scheduled' && Boolean(task.endAt && Date.now() > Date.parse(task.endAt))).length;
}

export function errorCount(): number {
  return state?.errorTasks?.length ?? 0;
}
