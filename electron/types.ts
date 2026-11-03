export interface Settings {
  userName: string;
  activeWorkspaceId: string;
  openSpaceIds?: string[];
  activeNoteId?: string;
  launchAtStartup: boolean;
  greeting: string;
  lastLogSeq?: number;
  windowBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
    maximized?: boolean;
  };
  overlayPosition?: {
    x: number;
    y: number;
  };
}

export interface PinnedLink {
  id: string;
  title: string;
  url: string;
  icon?: string;
}

export interface Workspace {
  id: string;
  name: string;
  masterFolder: string;
  lastSubfolder?: string;
  createdAt: string;
  pinnedPaths: string[];
  activeObjective?: string;
  pinnedLinks?: PinnedLink[];
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
  spaceName?: string;
  refId?: string;
  tag?: 'milestone' | 'bug' | 'note' | 'focus';
}

export interface InboxItem {
  id: string;
  text: string;
  createdAt: number;
  spaceId?: string;
}

export interface FocusSession {
  id: string;
  spaceId?: string;
  objective?: string;
  durationMinutes: number;
  startedAt: number;
  state: 'running' | 'paused' | 'completed' | 'cancelled';
}

export interface HomeData {
  log: LogEntry[];
}

export interface NoteFile {
  id: string;
  name: string;
  bundle?: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  filePath?: string;
}

export interface TrashWorkspace {
  id: string;
  name: string;
  masterFolder: string;
  deletedAt: number;
}

export interface AppSnapshot {
  settings: Settings;
  workspaces: Workspace[];
  openSpaceIds: string[];
  workspaceFolderAvailability: Record<string, boolean>;
  workspace: Workspace | null;
  entries: FileEntry[];
  currentPath: string;
  logEntries: LogEntry[];
  trashWorkspaces: TrashWorkspace[];
  notes: NoteFile[];
  bundles: string[];
  activeNoteId?: string;
  home: HomeData;
  inboxItems: InboxItem[];
  activeSession: FocusSession | null;
}
