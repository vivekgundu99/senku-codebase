import type { AppSnapshot, FileEntry, LogEntry, Launchpad } from '../electron/types';

// ---------------------------------------------------------------------------
// Central app state
// ---------------------------------------------------------------------------

export let state = {} as AppSnapshot;
export let currentView = 'Home';
export let currentPath = '';

export const FILE_PAGE = 150;
export let fileFilter = '';
export let fileLimit = FILE_PAGE;

// Quick log bar pending input
export let quickLogText = '';

// Active note for Notes panel
export let activeNoteId: string | null = null;

export function setState(snapshot: AppSnapshot): void {
  const previousWorkspaceId = state?.workspace?.id;
  const newWorkspaceId = snapshot?.workspace?.id;

  if (previousWorkspaceId !== newWorkspaceId) {
    activeNoteId = snapshot.activeNoteId ?? (snapshot.notes && snapshot.notes[0]?.id) ?? null;
    logFilter = '';
    logLimit = LOG_PAGE;
    fileFilter = '';
    fileLimit = FILE_PAGE;
  } else if (snapshot.currentPath !== currentPath) {
    fileFilter = '';
    fileLimit = FILE_PAGE;
  }

  if (!activeNoteId && snapshot.activeNoteId) {
    activeNoteId = snapshot.activeNoteId;
  }

  state = snapshot;
  currentPath = snapshot.currentPath;
}

export function setView(view: string): void {
  currentView = view;
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

export function setActiveNoteId(id: string | null): void {
  activeNoteId = id;
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
// Log entries: filter + lazy page (sorted newest first)
// ---------------------------------------------------------------------------

export const LOG_PAGE = 40;
export let logFilter = '';
export let logLimit = LOG_PAGE;

export function setLogFilter(value: string): void {
  logFilter = value;
  logLimit = LOG_PAGE;
}

export function showMoreLogs(): void {
  logLimit += LOG_PAGE;
}

export function getLogEntries(): LogEntry[] {
  return [...(state?.logEntries ?? [])].sort((a, b) => b.createdAt - a.createdAt || b.seq - a.seq);
}

export function visibleLogEntries(): { items: LogEntry[]; matched: number; total: number } {
  const all = getLogEntries();
  const q = logFilter.trim().toLowerCase();
  const matched = q ? all.filter((entry) => entry.text.toLowerCase().includes(q)) : all;
  return { items: matched.slice(0, logLimit), matched: matched.length, total: all.length };
}

// ---------------------------------------------------------------------------
// Path availability cache (10 s TTL)
// ---------------------------------------------------------------------------

let pathAvailabilityCache: { timestamp: number; data: Record<string, boolean> } | null = null;

export function getCachedPathAvailability(): Record<string, boolean> {
  if (pathAvailabilityCache && Date.now() - pathAvailabilityCache.timestamp < 10000) {
    return pathAvailabilityCache.data;
  }
  return pathAvailabilityCache?.data ?? {};
}

export function setCachedPathAvailability(data: Record<string, boolean>): void {
  pathAvailabilityCache = {
    timestamp: Date.now(),
    data: { ...(pathAvailabilityCache?.data ?? {}), ...data },
  };
}

export function isPathAvailabilityCacheStale(): boolean {
  return !pathAvailabilityCache || Date.now() - pathAvailabilityCache.timestamp >= 10000;
}
