import type { AppSnapshot, Settings } from '../electron/types';

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
      restoreWorkspace(id: string): Promise<AppSnapshot>;
      purgeTrash(id?: string): Promise<AppSnapshot>;
      renameWorkspace(id: string, name: string): Promise<AppSnapshot>;
      setMasterFolder(id: string, folder: string): Promise<AppSnapshot>;
      openPath(path: string): Promise<{ ok: boolean; error?: string }>;
      openUserGuide(): Promise<{ ok: boolean; error?: string }>;
      copyPath(path: string): Promise<boolean>;
      pinPath(path: string): Promise<AppSnapshot>;
      unpinPath(path: string): Promise<AppSnapshot>;
      // V3: Log
      addLogEntry(text: string, spaceId?: string): Promise<AppSnapshot>;
      deleteLogEntry(id: string): Promise<AppSnapshot>;
      // V3: Launchpads
      createLaunchpad(name: string, spaceId: string, paths: string[]): Promise<AppSnapshot>;
      updateLaunchpad(id: string, name: string, paths: string[]): Promise<AppSnapshot>;
      deleteLaunchpad(id: string): Promise<AppSnapshot>;
      launchLaunchpad(id: string): Promise<{ ok: boolean; errors: string[] }>;
      openItem(target: string): Promise<{ ok: boolean; error?: string }>;
      // V3: Open in VS Code / Terminal
      openInVSCode(path: string): Promise<{ ok: boolean; error?: string }>;
      openInTerminal(path: string): Promise<{ ok: boolean; error?: string }>;
      // Notes
      createNote(name: string): Promise<AppSnapshot>;
      renameNote(id: string, name: string): Promise<AppSnapshot>;
      updateNote(id: string, content: string): Promise<AppSnapshot>;
      appendToNote(id: string, snippet: string): Promise<AppSnapshot>;
      deleteNote(id: string): Promise<AppSnapshot>;
      exportNote(id: string): Promise<{ ok: boolean; error?: string }>;
    };
  }
}

export {};
