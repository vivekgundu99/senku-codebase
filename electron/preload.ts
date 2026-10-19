import { contextBridge, ipcRenderer } from 'electron';
import type { AppSnapshot, Settings } from './types';

const api = {
  getSnapshot: (path?: string) =>
    ipcRenderer.invoke('app:get-snapshot', path) as Promise<AppSnapshot>,

  chooseMasterFolder: () =>
    ipcRenderer.invoke('folder:choose') as Promise<string | null>,

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

  // --- V3: Quiet Log ---
  addLogEntry: (text: string, spaceId?: string) =>
    ipcRenderer.invoke('log:add', text, spaceId) as Promise<AppSnapshot>,

  deleteLogEntry: (id: string) =>
    ipcRenderer.invoke('log:delete', id) as Promise<AppSnapshot>,

  // --- V3: Launchpads ---
  createLaunchpad: (name: string, spaceId: string, paths: string[]) =>
    ipcRenderer.invoke('launchpad:create', name, spaceId, paths) as Promise<AppSnapshot>,

  updateLaunchpad: (id: string, name: string, paths: string[]) =>
    ipcRenderer.invoke('launchpad:update', id, name, paths) as Promise<AppSnapshot>,

  deleteLaunchpad: (id: string) =>
    ipcRenderer.invoke('launchpad:delete', id) as Promise<AppSnapshot>,

  launchLaunchpad: (id: string) =>
    ipcRenderer.invoke('launchpad:launch', id) as Promise<{ ok: boolean; errors: string[] }>,

  openItem: (target: string) =>
    ipcRenderer.invoke('path:open-item', target) as Promise<{ ok: boolean; error?: string }>,

  // --- V3: Quick Actions ---
  openInVSCode: (path: string) =>
    ipcRenderer.invoke('code:open', path) as Promise<{ ok: boolean; error?: string }>,

  openInTerminal: (path: string) =>
    ipcRenderer.invoke('terminal:open', path) as Promise<{ ok: boolean; error?: string }>,

  // --- Notes ---
  createNote: (name: string) =>
    ipcRenderer.invoke('notes:create', name) as Promise<AppSnapshot>,

  renameNote: (id: string, name: string) =>
    ipcRenderer.invoke('notes:rename', id, name) as Promise<AppSnapshot>,

  updateNote: (id: string, content: string) =>
    ipcRenderer.invoke('notes:update', id, content) as Promise<AppSnapshot>,

  appendToNote: (id: string, snippet: string) =>
    ipcRenderer.invoke('notes:append', id, snippet) as Promise<AppSnapshot>,

  deleteNote: (id: string) =>
    ipcRenderer.invoke('notes:delete', id) as Promise<AppSnapshot>,

  exportNote: (id: string) =>
    ipcRenderer.invoke('notes:export', id) as Promise<{ ok: boolean; error?: string }>,

  onOpenQuickNote: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('action:open-quick-note', handler);
    return () => { ipcRenderer.removeListener('action:open-quick-note', handler); };
  },
};

contextBridge.exposeInMainWorld('senku', api);
