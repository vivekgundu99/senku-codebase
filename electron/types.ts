export interface Settings {
  userName: string;
  activeWorkspaceId: string;
  launchAtStartup: boolean;
  greeting: string;
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

export interface DailyNote {
  workspaceId: string;
  content: string;
  updatedAt: string;
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
  dailyNote: string;
  logEntries: LogEntry[];
  launchpads: Launchpad[];
  trashWorkspaces: TrashWorkspace[];
}
