import type { AppSnapshot, FileEntry, LogEntry } from '../electron/types';

// ---------------------------------------------------------------------------
// Central app state
// ---------------------------------------------------------------------------

export let state = {} as AppSnapshot;
export let currentView = 'Home';
export let currentPath = '';
export let dailyNote = '';

let noteDirty = false;

export const FILE_PAGE = 150;
export let fileFilter = '';
export let fileLimit = FILE_PAGE;

// Quick log bar pending input
export let quickLogText = '';

export function setState(snapshot: AppSnapshot): void {
  if (snapshot.currentPath !== currentPath) {
    fileFilter = '';
    fileLimit = FILE_PAGE;
  }
  state = snapshot;
  currentPath = snapshot.currentPath;
  if (!noteDirty) dailyNote = snapshot.dailyNote;
}

export function setView(view: string): void {
  currentView = view;
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

export function setQuickLogText(value: string): void {
  quickLogText = value;
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
// Log entries (sorted newest first)
// ---------------------------------------------------------------------------

export function getLogEntries(): LogEntry[] {
  return [...(state?.logEntries ?? [])].sort((a, b) => b.createdAt - a.createdAt);
}
