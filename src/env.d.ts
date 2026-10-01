import type { AppSnapshot, Settings, Task, TaskInput } from '../electron/types';

declare global {
  interface Window {
    senku: {
      getSnapshot(path?: string): Promise<AppSnapshot>;
      chooseMasterFolder(): Promise<string | null>;
      getDesktopPath(): Promise<string>;
      saveSettings(settings: Settings): Promise<AppSnapshot>;
      createWorkspace(name: string, masterFolder: string): Promise<AppSnapshot>;
      switchWorkspace(id: string): Promise<AppSnapshot>;
      deleteWorkspace(id: string): Promise<{ ok: boolean; error?: string }>;
      renameWorkspace(id: string, name: string): Promise<AppSnapshot>;
      setMasterFolder(id: string, folder: string): Promise<AppSnapshot>;
      setStrictMode(id: string, enabled: boolean): Promise<AppSnapshot>;
      setTaskPinned(id: string, isPinned: boolean): Promise<Task>;
      openPath(path: string): Promise<{ ok: boolean; error?: string }>;
      openUserGuide(): Promise<{ ok: boolean; error?: string }>;
      copyPath(path: string): Promise<boolean>;
      renamePath(path: string, name: string): Promise<{ ok: boolean; error?: string }>;
      pinPath(path: string): Promise<AppSnapshot>;
      unpinPath(path: string): Promise<AppSnapshot>;
      saveNote(content: string): Promise<void>;
      createTask(input: TaskInput): Promise<Task>;
      completeTask(id: string, reschedule?: TaskInput): Promise<{ task: Task; next?: Task }>;
      snoozeTask(id: string, durationMinutes: number): Promise<Task>;
      updateTask(id: string, input: TaskInput, bucket?: 'active' | 'error'): Promise<Task>;
      recoverTask(id: string, input: TaskInput): Promise<Task>;
      deleteTask(id: string, bucket: 'active' | 'completed' | 'error'): Promise<boolean>;
      completeManyTasks(ids: string[]): Promise<number>;
      deleteManyTasks(ids: string[], bucket: 'active' | 'completed' | 'error'): Promise<number>;
      closeQuickAdd(): Promise<void>;
      onTasksChanged(callback: () => void): () => void;
    };
  }
}

export {};
