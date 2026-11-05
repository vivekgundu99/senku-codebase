export interface Workspace {
  id: string;
  name: string;
  path: string;
  objective?: string;
  createdAt: number;
}

export interface FocusRecord {
  id: string;
  type: 'work' | 'rest';
  goal: string;
  durationMinutes: number;
  completedAt: number;
}

export interface FocusSession {
  mode: 'work' | 'rest';
  active: boolean;
  paused: boolean;
  remainingSeconds: number;
  goal: string;
  startedAt: number | null;
  durationMinutes: number;
  history: FocusRecord[];
}

export interface SenkuState {
  version: 4;
  activeSpaceId: string | null;
  spaces: Workspace[];
  focus: FocusSession;
  settings: {
    theme?: 'dark' | 'light';
    openSpaceIds?: string[];
    windowBounds?: {
      x: number;
      y: number;
      width: number;
      height: number;
      maximized?: boolean;
    };
  };
}

export interface SenkuAPI {
  getState: () => Promise<SenkuState>;
  saveState: (patch: Partial<SenkuState>) => Promise<SenkuState>;
  getAppPaths: () => Promise<{ userData: string; documents: string; home: string }>;
  readLogs: () => Promise<string>;
  appendLog: (text: string) => Promise<boolean>;
  getLogsPath: () => Promise<string>;
  openFolder: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  openTerminal: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  openCode: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  openUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
  pickFolder: () => Promise<string | null>;
  readNote: (filePath: string) => Promise<string>;
  writeNote: (filePath: string, content: string) => Promise<boolean>;
  renameSpaceNotesDir: (oldName: string, newName: string) => Promise<boolean>;
  trashSpaceNotesDir: (spaceName: string) => Promise<boolean>;
  deleteSpaceNotesDir?: (spaceName: string) => Promise<boolean>;
  minimize: () => void;
  toggleMaximize: () => Promise<boolean>;
  isMaximized: () => Promise<boolean>;
  close: () => void;
}
