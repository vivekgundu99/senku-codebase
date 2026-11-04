export interface Workspace {
  id: string;
  name: string;
  path: string;
  objective: string;
  createdAt: number;
}

export interface FocusBlock {
  id: string;
  spaceId: string | null;
  spaceName: string;
  goal: string;
  durationMinutes: number;
  completedAt: number;
}

export interface FocusSession {
  active: boolean;
  paused?: boolean;
  remainingSeconds?: number;
  spaceId: string | null;
  goal: string;
  startedAt: number | null;
  durationMinutes: number;
  history: FocusBlock[];
}

export interface SenkuState {
  version: 4;
  activeSpaceId: string | null;
  spaces: Workspace[];
  focus: FocusSession;
  settings: {
    userName: string;
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
  openFolder: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  openTerminal: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  openCode: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  openUrl: (url: string) => Promise<{ ok: boolean; error?: string }>;
  pickFolder: () => Promise<string | null>;
  readNote: (filePath: string) => Promise<string>;
  writeNote: (filePath: string, content: string) => Promise<boolean>;
  minimize: () => void;
  close: () => void;
}
