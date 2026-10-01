import { contextBridge, ipcRenderer } from 'electron';
import type { AppSnapshot, Settings, Task, TaskInput } from './types';

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

  renameWorkspace: (id: string, name: string) =>
    ipcRenderer.invoke('workspace:rename', id, name) as Promise<AppSnapshot>,

  setStrictMode: (id: string, enabled: boolean) =>
    ipcRenderer.invoke('workspace:strict-mode', id, enabled) as Promise<AppSnapshot>,

  // --- File system ---
  openPath: (path: string) =>
    ipcRenderer.invoke('path:open', path) as Promise<{ ok: boolean; error?: string }>,

  openUserGuide: () =>
    ipcRenderer.invoke('guide:open') as Promise<{ ok: boolean; error?: string }>,

  copyPath: (path: string) =>
    ipcRenderer.invoke('path:copy', path) as Promise<boolean>,

  renamePath: (path: string, name: string) =>
    ipcRenderer.invoke('path:rename', path, name) as Promise<{ ok: boolean; error?: string }>,

  pinPath: (path: string) =>
    ipcRenderer.invoke('path:pin', path) as Promise<AppSnapshot>,

  unpinPath: (path: string) =>
    ipcRenderer.invoke('path:unpin', path) as Promise<AppSnapshot>,

  // --- Daily note ---
  saveNote: (content: string) =>
    ipcRenderer.invoke('note:save', content) as Promise<void>,

  // --- Tasks ---
  createTask: (input: TaskInput) =>
    ipcRenderer.invoke('task:create', input) as Promise<Task>,

  completeTask: (id: string, reschedule?: TaskInput) =>
    ipcRenderer.invoke('task:complete', id, reschedule) as Promise<{ task: Task; next?: Task }>,

  snoozeTask: (id: string, durationMinutes: number) =>
    ipcRenderer.invoke('task:snooze', id, durationMinutes) as Promise<Task>,

  updateTask: (id: string, input: TaskInput, bucket: 'active' | 'error' = 'active') =>
    ipcRenderer.invoke('task:update', id, input, bucket) as Promise<Task>,

  recoverTask: (id: string, input: TaskInput) =>
    ipcRenderer.invoke('task:recover', id, input) as Promise<Task>,

  deleteTask: (id: string, bucket: 'active' | 'completed' | 'error') =>
    ipcRenderer.invoke('task:delete', id, bucket) as Promise<boolean>,

  completeManyTasks: (ids: string[]) =>
    ipcRenderer.invoke('task:complete-many', ids) as Promise<number>,

  deleteManyTasks: (ids: string[], bucket: 'active' | 'completed' | 'error') =>
    ipcRenderer.invoke('task:delete-many', ids, bucket) as Promise<number>,

  // --- Quick-add window ---
  closeQuickAdd: () =>
    ipcRenderer.invoke('quickadd:close') as Promise<void>,

  // Listen for tasks:changed pushed from main (after quick-add creates a task)
  onTasksChanged: (callback: () => void) => {
    ipcRenderer.on('tasks:changed', callback);
    return () => ipcRenderer.removeListener('tasks:changed', callback);
  },
};

contextBridge.exposeInMainWorld('senku', api);
