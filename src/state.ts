import type { AppSnapshot, Task } from '../electron/types';

// ---------------------------------------------------------------------------
// Central app state
// ---------------------------------------------------------------------------

export let state = {} as AppSnapshot;
export let currentView = 'Today';
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
  const active = [...state.activeTasks].sort(
    (a, b) =>
      Number(b.priority === 'urgent') - Number(a.priority === 'urgent') ||
      Date.parse(a.startAt) - Date.parse(b.startAt),
  );

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

  if (currentView === 'Upcoming') return active.filter((t) => Date.parse(t.startAt) > now);

  // Today: tasks that have started OR start today — sorted urgent first, then by time.
  // Overdue tasks naturally appear here too (started in the past, not completed).
  return active.filter(
    (t) =>
      Date.parse(t.startAt) <= now ||
      new Date(t.startAt).toDateString() === new Date().toDateString(),
  );
}

// ---------------------------------------------------------------------------
// Derived counts for sidebar badges
// ---------------------------------------------------------------------------

export function overdueCount(): number {
  if (!state?.activeTasks) return 0;
  return state.activeTasks.filter((t) => Date.now() > Date.parse(t.endAt)).length;
}

export function errorCount(): number {
  return state?.errorTasks?.length ?? 0;
}
