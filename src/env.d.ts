import type { AppSnapshot, Settings, LogEntry, Launchpad } from '../electron/types';

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
      openPath(path: string): Promise<{ ok: boolean; error?: string }>;
      openUserGuide(): Promise<{ ok: boolean; error?: string }>;
      copyPath(path: string): Promise<boolean>;
      pinPath(path: string): Promise<AppSnapshot>;
      unpinPath(path: string): Promise<AppSnapshot>;
      saveNote(content: string): Promise<void>;
      // V3: Log
      addLogEntry(text: string, spaceId?: string): Promise<AppSnapshot>;
      // V3: Launchpads
      createLaunchpad(name: string, spaceId: string, paths: string[]): Promise<AppSnapshot>;
      deleteLaunchpad(id: string): Promise<AppSnapshot>;
      launchLaunchpad(id: string): Promise<{ ok: boolean; errors: string[] }>;
      // V3: Open in VS Code / Terminal
      openInVSCode(path: string): Promise<{ ok: boolean; error?: string }>;
      openInTerminal(path: string): Promise<{ ok: boolean; error?: string }>;
    };
  }
}

export {};
