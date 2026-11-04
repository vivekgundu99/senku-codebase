export interface PinnedLink {
  id: string;
  title: string;
  url: string;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
  objective: string;
  links: PinnedLink[];
  createdAt: number;
}

export interface InboxItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
}

export interface FocusSession {
  active: boolean;
  spaceId: string | null;
  goal: string;
  startedAt: number | null;
  durationMinutes: number;
}

export interface LogEntry {
  id: string;
  spaceId: string | null;
  spaceName?: string;
  text: string;
  tag: 'dev' | 'bug' | 'idea' | 'done';
  createdAt: number;
}

export interface SenkuState {
  version: number;
  activeSpaceId: string | null;
  spaces: Workspace[];
  inbox: InboxItem[];
  focus: FocusSession;
  logs: LogEntry[];
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
