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

// Quick log draft inputs
export let quickLogText = '';
export let homeLogDraft = '';
export function setHomeLogDraft(text: string): void {
  homeLogDraft = text;
}

export let logPageDraft = '';
export function setLogPageDraft(text: string): void {
  logPageDraft = text;
}

export let activeNoteId: string | null = null;
export let noteFilter = '';
export function setNoteFilter(text: string): void {
  noteFilter = text;
}
export const collapsedBundles = new Set<string>();

export function toggleBundleCollapsed(bundle: string): void {
  if (collapsedBundles.has(bundle)) {
    collapsedBundles.delete(bundle);
  } else {
    collapsedBundles.add(bundle);
  }
}

export function setState(snapshot: AppSnapshot): void {
  const previousWorkspaceId = state?.workspace?.id;
  const newWorkspaceId = snapshot?.workspace?.id;

  if (previousWorkspaceId !== newWorkspaceId) {
    activeNoteId = snapshot.activeNoteId ?? (snapshot.notes && snapshot.notes[0]?.id) ?? null;
    noteFilter = '';
    logFilter = '';
    resetLogDates();
    fileFilter = '';
    fileLimit = FILE_PAGE;
  } else if (snapshot.currentPath !== currentPath) {
    fileFilter = '';
    fileLimit = FILE_PAGE;
  }

  if (!activeNoteId && snapshot.activeNoteId) {
    activeNoteId = snapshot.activeNoteId;
  } else if (!activeNoteId && snapshot.notes && snapshot.notes.length > 0) {
    activeNoteId = snapshot.notes[0].id;
  }

  state = snapshot;
  currentPath = snapshot.currentPath;
}

export function setView(view: string): void {
  if ((currentView === 'Log' && view === 'AllLog') || (currentView === 'AllLog' && view === 'Log')) {
    resetLogDates();
  }
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

export function defaultLogFromDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 7);
  return toLocalDateString(d.getTime());
}

export function defaultLogToDate(): string {
  return toLocalDateString(Date.now());
}

export let logFromDate = defaultLogFromDate();
export let logToDate = defaultLogToDate();
export let allLog: LogEntry[] = [];

export function setAllLog(entries: LogEntry[]): void {
  allLog = entries;
}

export function setLogFromDate(date: string): void {
  logFromDate = date;
  logLimit = LOG_PAGE;
}

export function setLogToDate(date: string): void {
  logToDate = date;
  logLimit = LOG_PAGE;
}

export function resetLogDates(): void {
  logFromDate = defaultLogFromDate();
  logToDate = defaultLogToDate();
  logLimit = LOG_PAGE;
}

export function setLogFilter(value: string): void {
  logFilter = value;
  logLimit = LOG_PAGE;
}

export function showMoreLogs(): void {
  logLimit += LOG_PAGE;
}

export function getLogEntries(scope: 'space' | 'all' = 'space'): LogEntry[] {
  const source = scope === 'all' ? allLog : (state?.logEntries ?? []);
  return [...source].sort((a, b) => b.createdAt - a.createdAt || (b.seq || 0) - (a.seq || 0));
}

function toLocalDateString(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function visibleLogEntries(scope: 'space' | 'all' = 'space'): { items: LogEntry[]; matched: number; total: number } {
  const all = getLogEntries(scope);
  const q = logFilter.trim().toLowerCase();
  const numSearch = /^#?\d+$/.test(q) ? parseInt(q.replace('#', ''), 10) : null;

  const matched = all.filter((entry) => {
    // 1. Text / number match
    if (q) {
      const textMatch = entry.text.toLowerCase().includes(q);
      const numberMatch = numSearch !== null && entry.seq === numSearch;
      if (!textMatch && !numberMatch) return false;
    }
    // 2. Date range match
    const entryDate = toLocalDateString(entry.createdAt);
    if (logFromDate && entryDate < logFromDate) return false;
    if (logToDate && entryDate > logToDate) return false;
    return true;
  });

  return { items: matched.slice(0, logLimit), matched: matched.length, total: all.length };
}

// ---------------------------------------------------------------------------
// Path availability cache (10 s TTL)
// ---------------------------------------------------------------------------

export type PathStatus = 'file' | 'folder' | 'missing';

let pathAvailabilityCache: { timestamp: number; data: Record<string, PathStatus> } | null = null;

export function getCachedPathAvailability(): Record<string, PathStatus> {
  if (pathAvailabilityCache && Date.now() - pathAvailabilityCache.timestamp < 10000) {
    return pathAvailabilityCache.data;
  }
  return pathAvailabilityCache?.data ?? {};
}

export function setCachedPathAvailability(data: Record<string, PathStatus>): void {
  pathAvailabilityCache = {
    timestamp: Date.now(),
    data: { ...(pathAvailabilityCache?.data ?? {}), ...data },
  };
}

export function isPathAvailabilityCacheStale(): boolean {
  return !pathAvailabilityCache || Date.now() - pathAvailabilityCache.timestamp >= 10000;
}
