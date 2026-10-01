export type TaskType = 'scheduled' | 'flexible';
export type TaskBucket = 'active' | 'completed' | 'error';

export interface Settings {
  userName: string;
  activeWorkspaceId: string;
  launchAtStartup: boolean;
  /** Full greeting shown on Today. Use {name} token, e.g. "Good morning, {name}."
   *  or write a static tagline with no token at all. */
  greeting: string;
}

export interface Workspace {
  id: string;
  name: string;
  masterFolder: string;
  lastSubfolder: string;
  strictMode: boolean;
  createdAt: string;
  /** Paths pinned to the top of the file browser for this workspace. */
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

export interface Task {
  id: string;
  title: string;
  taskType: TaskType;
  startAt?: string;
  endAt?: string;
  linkedPaths: string[];
  isPinned?: boolean;
  startEventHandled: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export interface TaskInput {
  title: string;
  taskType: TaskType;
  startAt?: string;
  endAt?: string;
  linkedPaths: string[];
}

export interface DailyNote {
  workspaceId: string;
  content: string;
  updatedAt: string;
}

export interface AppSnapshot {
  settings: Settings;
  workspaces: Workspace[];
  workspace: Workspace | null;
  entries: FileEntry[];
  currentPath: string;
  activeTasks: Task[];
  completedTasks: Task[];
  errorTasks: Task[];
  dailyNote: string;
}
