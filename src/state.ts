import type { AppSnapshot, FileEntry, LogEntry } from '../electron/types';

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

export let homeCenterMode: 'overview' | 'preview' | 'notes' = 'overview';
export function setHomeCenterMode(mode: 'overview' | 'preview' | 'notes'): void {
  homeCenterMode = mode;
}

export let isGlobalNotesMode = false;
export function setGlobalNotesMode(val: boolean): void {
  isGlobalNotesMode = val;
}


export interface MarkdownFileState {
  path: string;
  name: string;
  content: string;
}
export let activeMarkdownFile: MarkdownFileState | null = null;
export function setActiveMarkdownFile(file: MarkdownFileState | null): void {
  activeMarkdownFile = file;
}

export let activeNoteId: string | null = null;
export let isNotePreviewMode = true;

export function setIsNotePreviewMode(val: boolean): void {
  isNotePreviewMode = val;
}

export let isNotesSidebarCollapsed = localStorage.getItem('senku:notesSidebarCollapsed') === 'true';
export function toggleNotesSidebarCollapsed(): void {
  isNotesSidebarCollapsed = !isNotesSidebarCollapsed;
  localStorage.setItem('senku:notesSidebarCollapsed', String(isNotesSidebarCollapsed));
}

export let isAppSidebarCollapsed = localStorage.getItem('senku:appSidebarCollapsed') === 'true';
export function toggleAppSidebarCollapsed(): void {
  isAppSidebarCollapsed = !isAppSidebarCollapsed;
  localStorage.setItem('senku:appSidebarCollapsed', String(isAppSidebarCollapsed));
}

export let isFilePaneCompact = localStorage.getItem('senku:filePaneCompact') === 'true';
export function toggleFilePaneCompact(): void {
  isFilePaneCompact = !isFilePaneCompact;
  localStorage.setItem('senku:filePaneCompact', String(isFilePaneCompact));
}
export function setFilePaneCompact(val: boolean): void {
  isFilePaneCompact = val;
  localStorage.setItem('senku:filePaneCompact', String(isFilePaneCompact));
}

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

export function packInactiveBundles(): void {
  if (!state.bundles || state.bundles.length === 0) return;
  const activeNote = state.notes?.find((n) => n.id === activeNoteId);
  const activeBundle = activeNote?.bundle;
  collapsedBundles.clear();
  for (const b of state.bundles) {
    if (b !== activeBundle) {
      collapsedBundles.add(b);
    }
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
  packInactiveBundles();
}

export function setCurrentFolder(entries: FileEntry[], folderPath: string): void {
  if (state) {
    state.entries = entries;
    state.currentPath = folderPath;
  }
  currentPath = folderPath;
  fileFilter = '';
  fileLimit = FILE_PAGE;
}

export function setView(view: string): void {
  if (view === 'Notes') {
    view = 'Home';
    homeCenterMode = 'notes';
  }
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
  if (activeNoteId !== id) {
    isNotePreviewMode = true;
  }
  activeNoteId = id;
  packInactiveBundles();
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
    // 1. Text / number / space match
    if (q) {
      const textMatch =
        entry.text.toLowerCase().includes(q) ||
        (Boolean(entry.spaceName) && entry.spaceName!.toLowerCase().includes(q));
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


