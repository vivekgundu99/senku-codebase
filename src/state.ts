import type { AppSnapshot, Task } from '../electron/types';

// ---------------------------------------------------------------------------
// Central app state — import this in any module that needs it
// ---------------------------------------------------------------------------

export let state = {} as AppSnapshot;
export let currentView = 'Today';
export let currentPath = '';
export let completedFilter: 'today' | 'last-week' | 'all' = 'last-week';
export const selectedTaskIds = new Set<string>();

export function setState(snapshot: AppSnapshot): void {
  state = snapshot;
  currentPath = snapshot.currentPath;
}

export function setView(view: string): void {
  currentView = view;
}

export function setCompletedFilter(filter: 'today' | 'last-week' | 'all'): void {
  completedFilter = filter;
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

  if (currentView === 'Error') return state.errorTasks;
  if (currentView === 'Overdue') return active.filter((t) => now > Date.parse(t.endAt));
  if (currentView === 'Upcoming') return active.filter((t) => Date.parse(t.startAt) > now);

  // Today: started already OR start date is today
  return active.filter(
    (t) =>
      Date.parse(t.startAt) <= now ||
      new Date(t.startAt).toDateString() === new Date().toDateString(),
  );
}
