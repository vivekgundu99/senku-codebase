import { contextBridge, ipcRenderer, webFrame } from 'electron';
import type { AppSnapshot, Settings, LogEntry, Launchpad, NoteFile, FileEntry } from './types';

const api = {
  zoomIn: () => {
    const current = webFrame.getZoomFactor();
    webFrame.setZoomFactor(Math.min(current + 0.1, 2.5));
  },
  zoomOut: () => {
    const current = webFrame.getZoomFactor();
    webFrame.setZoomFactor(Math.max(current - 0.1, 0.5));
  },
  resetZoom: () => {
    webFrame.setZoomFactor(1);
  },
  toggleFullscreen: () =>
    ipcRenderer.invoke('window:toggle-fullscreen') as Promise<boolean>,


  getSnapshot: (path?: string) =>
    ipcRenderer.invoke('app:get-snapshot', path) as Promise<AppSnapshot>,

  chooseMasterFolder: () =>
    ipcRenderer.invoke('folder:choose') as Promise<string | null>,

  chooseFiles: (defaultDir?: string) =>
    ipcRenderer.invoke('files:choose', defaultDir) as Promise<string[]>,

  getDesktopPath: () =>
    ipcRenderer.invoke('folder:desktop-path') as Promise<string>,

  saveSettings: (settings: Settings) =>
    ipcRenderer.invoke('settings:save', settings) as Promise<AppSnapshot>,

  // --- Workspace ---
  createWorkspace: (name: string, masterFolder: string) =>
    ipcRenderer.invoke('workspace:create', name, masterFolder) as Promise<AppSnapshot>,

  switchWorkspace: (id: string) =>
    ipcRenderer.invoke('workspace:switch', id) as Promise<AppSnapshot>,

  deleteWorkspace: (id: string) =>
    ipcRenderer.invoke('workspace:delete', id) as Promise<{ ok: boolean; error?: string }>,

  restoreWorkspace: (id: string) =>
    ipcRenderer.invoke('workspace:restore', id) as Promise<AppSnapshot>,

  purgeTrash: (id?: string) =>
    ipcRenderer.invoke('workspace:purge-trash', id) as Promise<AppSnapshot>,

  renameWorkspace: (id: string, name: string) =>
    ipcRenderer.invoke('workspace:rename', id, name) as Promise<AppSnapshot>,

  setMasterFolder: (id: string, folder: string) =>
    ipcRenderer.invoke('workspace:set-master-folder', id, folder) as Promise<AppSnapshot>,

  // --- File system ---
  readFolder: (folderPath: string) =>
    ipcRenderer.invoke('folder:read', folderPath) as Promise<{ entries: FileEntry[]; currentPath: string }>,

  openPath: (path: string) =>
    ipcRenderer.invoke('path:open', path) as Promise<{ ok: boolean; error?: string }>,

  openUserGuide: () =>
    ipcRenderer.invoke('guide:open') as Promise<{ ok: boolean; error?: string }>,

  copyPath: (path: string) =>
    ipcRenderer.invoke('path:copy', path) as Promise<boolean>,

  pinPath: (path: string) =>
    ipcRenderer.invoke('path:pin', path) as Promise<AppSnapshot>,

  unpinPath: (path: string) =>
    ipcRenderer.invoke('path:unpin', path) as Promise<AppSnapshot>,

  readTextFile: (filePath: string) =>
    ipcRenderer.invoke('file:read-text', filePath) as Promise<string>,

  saveTextFile: (filePath: string, content: string) =>
    ipcRenderer.invoke('file:save-text', filePath, content) as Promise<boolean>,

  createFileNote: (folderPath: string, name?: string) =>
    ipcRenderer.invoke('file:create-note', folderPath, name) as Promise<{ path: string; name: string; content: string }>,

  // --- V3: Quiet Log ---
  addLogEntry: (text: string, spaceId?: string) =>
    ipcRenderer.invoke('log:add', text, spaceId) as Promise<AppSnapshot>,

  deleteLogEntry: (id: string, spaceId?: string) =>
    ipcRenderer.invoke('log:delete', id, spaceId) as Promise<AppSnapshot>,

  updateLogEntry: (id: string, text: string, spaceId?: string) =>
    ipcRenderer.invoke('log:update', id, text, spaceId) as Promise<AppSnapshot>,

  restoreLogEntry: (entry: LogEntry) =>
    ipcRenderer.invoke('log:restore', entry) as Promise<AppSnapshot>,

  listAllLogs: () =>
    ipcRenderer.invoke('log:list-all') as Promise<LogEntry[]>,

  // --- V3: Launchpads ---
  createLaunchpad: (name: string, spaceId: string, paths: string[]) =>
    ipcRenderer.invoke('launchpad:create', name, spaceId, paths) as Promise<AppSnapshot>,

  updateLaunchpad: (id: string, name: string, paths: string[]) =>
    ipcRenderer.invoke('launchpad:update', id, name, paths) as Promise<AppSnapshot>,

  deleteLaunchpad: (id: string) =>
    ipcRenderer.invoke('launchpad:delete', id) as Promise<AppSnapshot>,

  restoreLaunchpad: (pad: Launchpad) =>
    ipcRenderer.invoke('launchpad:restore', pad) as Promise<AppSnapshot>,

  setLaunchpadPinned: (id: string, pinned: boolean) =>
    ipcRenderer.invoke('launchpad:set-pinned', id, pinned) as Promise<AppSnapshot>,

  launchLaunchpad: (id: string, spaceId?: string) =>
    ipcRenderer.invoke('launchpad:launch', id, spaceId) as Promise<{ ok: boolean; errors: string[] }>,

  openItem: (target: string) =>
    ipcRenderer.invoke('path:open-item', target) as Promise<{ ok: boolean; error?: string }>,

  checkPathsExist: (paths: string[]) =>
    ipcRenderer.invoke('path:exists-many', paths) as Promise<Record<string, 'file' | 'folder' | 'missing'>>,

  // --- V3: Quick Actions ---
  openInVSCode: (path: string) =>
    ipcRenderer.invoke('code:open', path) as Promise<{ ok: boolean; error?: string }>,

  openInTerminal: (path: string) =>
    ipcRenderer.invoke('terminal:open', path) as Promise<{ ok: boolean; error?: string }>,

  // --- Notes ---
  createNote: (name: string, bundle?: string) =>
    ipcRenderer.invoke('notes:create', name, bundle) as Promise<AppSnapshot>,

  createBundle: (name: string) =>
    ipcRenderer.invoke('notes:create-bundle', name) as Promise<AppSnapshot>,

  renameBundle: (oldName: string, newName: string) =>
    ipcRenderer.invoke('notes:rename-bundle', oldName, newName) as Promise<AppSnapshot>,

  deleteBundle: (name: string) =>
    ipcRenderer.invoke('notes:delete-bundle', name) as Promise<AppSnapshot>,

  renameNote: (id: string, name: string) =>
    ipcRenderer.invoke('notes:rename', id, name) as Promise<{ snapshot: AppSnapshot; id: string }>,

  updateNote: (id: string, content: string) =>
    ipcRenderer.invoke('notes:update', id, content) as Promise<AppSnapshot>,

  appendToNote: (id: string, snippet: string) =>
    ipcRenderer.invoke('notes:append', id, snippet) as Promise<AppSnapshot>,

  deleteNote: (id: string) =>
    ipcRenderer.invoke('notes:delete', id) as Promise<AppSnapshot>,

  restoreNote: (note: NoteFile) =>
    ipcRenderer.invoke('notes:restore', note) as Promise<AppSnapshot>,

  exportNote: (id: string) =>
    ipcRenderer.invoke('notes:export', id) as Promise<{ ok: boolean; error?: string }>,

  openNoteInVSCode: (id: string) =>
    ipcRenderer.invoke('notes:open-vscode', id) as Promise<{ ok: boolean; error?: string }>,

  openBundleInVSCode: (bundleName: string) =>
    ipcRenderer.invoke('notes:open-bundle-vscode', bundleName) as Promise<{ ok: boolean; error?: string }>,

  importNotes: () =>
    ipcRenderer.invoke('notes:import') as Promise<{ snapshot: AppSnapshot; count: number; firstNoteId?: string } | null>,

  exportAllNotes: () =>
    ipcRenderer.invoke('notes:export-all') as Promise<{ ok: boolean; count?: number; empty?: boolean; error?: string }>,

  exportBundle: (bundleName: string) =>
    ipcRenderer.invoke('notes:export-bundle', bundleName) as Promise<{ ok: boolean; count?: number; error?: string }>,

  exportLogs: (content: string, defaultName?: string) =>
    ipcRenderer.invoke('log:export', content, defaultName) as Promise<{ ok: boolean; error?: string }>,

  // --- Floating Quick Note Overlay ---
  showOverlay: () =>
    ipcRenderer.invoke('overlay:show') as Promise<{ ok: boolean }>,

  hideOverlay: () =>
    ipcRenderer.invoke('overlay:hide') as Promise<{ ok: boolean }>,

  minimizeOverlay: () =>
    ipcRenderer.invoke('overlay:minimize') as Promise<{ ok: boolean }>,

  resizeOverlay: (height: number) =>
    ipcRenderer.invoke('overlay:resize', height) as Promise<{ ok: boolean }>,

  getActiveNote: () =>
    ipcRenderer.invoke('notes:get-active') as Promise<{ activeId: string; activeName: string; workspaceId?: string; notes: Array<{ id: string; name: string }> }>,

  setActiveNote: (id: string) =>
    ipcRenderer.invoke('notes:set-active', id) as Promise<{ ok: boolean }>,

  appendToActiveNote: (snippet: string, targetId?: string) =>
    ipcRenderer.invoke('notes:append-active', snippet, targetId) as Promise<{ ok: boolean; noteName?: string; error?: string }>,

  onOverlayRefresh: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('overlay:refresh', handler);
    return () => { ipcRenderer.removeListener('overlay:refresh', handler); };
  },

  onSnapshotUpdated: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('snapshot:updated', handler);
    return () => { ipcRenderer.removeListener('snapshot:updated', handler); };
  },

  onOpenQuickNote: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('action:open-quick-note', handler);
    return () => { ipcRenderer.removeListener('action:open-quick-note', handler); };
  },
};

contextBridge.exposeInMainWorld('senku', api);
