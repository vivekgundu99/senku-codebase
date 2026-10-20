export interface Settings {
  userName: string;
  activeWorkspaceId: string;
  activeNoteId?: string;
  launchAtStartup: boolean;
  greeting: string;
  lastLogSeq?: number;
}

export interface Workspace {
  id: string;
  name: string;
  masterFolder: string;
  lastSubfolder: string;
  createdAt: string;
  pinnedPaths: string[];
}

export interface FileEntry {
  name: string;
  path: string;
  kind: 'file' | 'folder';
  extension: string;
  size?: number;
  modifiedAt?: string;
  pinned?: boolean;
}

export interface LogEntry {
  id: string;
  seq: number;
  text: string;
  createdAt: number;
  spaceId?: string;
}

export interface Launchpad {
  id: string;
  name: string;
  spaceId: string;
  paths: string[];
  createdAt: number;
}

export interface NoteFile {
  id: string;
  name: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface TrashWorkspace {
  id: string;
  name: string;
  masterFolder: string;
  dailyNote?: string;
  deletedAt: number;
}

export interface AppSnapshot {
  settings: Settings;
  workspaces: Workspace[];
  workspaceFolderAvailability: Record<string, boolean>;
  workspace: Workspace | null;
  entries: FileEntry[];
  currentPath: string;
  logEntries: LogEntry[];
  launchpads: Launchpad[];
  trashWorkspaces: TrashWorkspace[];
  notes: NoteFile[];
  activeNoteId?: string;
}

