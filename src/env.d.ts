import type { AppSnapshot, Settings, LogEntry, Launchpad, NoteFile } from '../electron/types';

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
      deleteLogEntry(id: string, spaceId?: string): Promise<AppSnapshot>;
      updateLogEntry(id: string, text: string, spaceId?: string): Promise<AppSnapshot>;
      restoreLogEntry(entry: LogEntry): Promise<AppSnapshot>;
      listAllLogs(): Promise<LogEntry[]>;
      // V3: Launchpads
      createLaunchpad(name: string, spaceId: string, paths: string[]): Promise<AppSnapshot>;
      updateLaunchpad(id: string, name: string, paths: string[]): Promise<AppSnapshot>;
      deleteLaunchpad(id: string): Promise<AppSnapshot>;
      restoreLaunchpad(pad: Launchpad): Promise<AppSnapshot>;
      setLaunchpadPinned(id: string, pinned: boolean): Promise<AppSnapshot>;
      launchLaunchpad(id: string, spaceId?: string): Promise<{ ok: boolean; errors: string[] }>;
      openItem(target: string): Promise<{ ok: boolean; error?: string }>;
      checkPathsExist(paths: string[]): Promise<Record<string, 'file' | 'folder' | 'missing'>>;
      // V3: Open in VS Code / Terminal
      openInVSCode(path: string): Promise<{ ok: boolean; error?: string }>;
      openInTerminal(path: string): Promise<{ ok: boolean; error?: string }>;
      // Notes
      createNote(name: string, bundle?: string): Promise<AppSnapshot>;
      createBundle(name: string): Promise<AppSnapshot>;
      renameBundle(oldName: string, newName: string): Promise<AppSnapshot>;
      deleteBundle(name: string): Promise<AppSnapshot>;
      renameNote(id: string, name: string): Promise<{ snapshot: AppSnapshot; id: string }>;
      updateNote(id: string, content: string): Promise<AppSnapshot>;
      appendToNote(id: string, snippet: string): Promise<AppSnapshot>;
      deleteNote(id: string): Promise<AppSnapshot>;
      restoreNote(note: NoteFile): Promise<AppSnapshot>;
      exportNote(id: string): Promise<{ ok: boolean; error?: string }>;
      importNotes(): Promise<{ snapshot: AppSnapshot; count: number; firstNoteId?: string } | null>;
      exportAllNotes(): Promise<{ ok: boolean; count?: number; empty?: boolean; error?: string }>;
      // Floating Overlay
      showOverlay(): Promise<{ ok: boolean }>;
      hideOverlay(): Promise<{ ok: boolean }>;
      minimizeOverlay(): Promise<{ ok: boolean }>;
      resizeOverlay(height: number): Promise<{ ok: boolean }>;
      getActiveNote(): Promise<{ activeId: string; activeName: string; workspaceId?: string; notes: Array<{ id: string; name: string }> }>;
      setActiveNote(id: string): Promise<{ ok: boolean }>;
      appendToActiveNote(snippet: string, targetId?: string): Promise<{ ok: boolean; noteName?: string; error?: string }>;
      onOverlayRefresh(callback: () => void): () => void;
      onSnapshotUpdated(callback: () => void): () => void;
      onOpenQuickNote(callback: () => void): () => void;
    };
  }
}

export {};
