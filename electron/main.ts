import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  shell,
  Tray,
} from 'electron';
import type { IpcMainInvokeEvent } from 'electron';
import dotenv from 'dotenv';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  AppSnapshot,
  DailyNote,
  FileEntry,
  Settings,
  Task,
  TaskInput,
  TaskType,
  Workspace,
} from './types';

// ---------------------------------------------------------------------------
// App-level state
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
let quickAddWindow: BrowserWindow | null = null;
let guideWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

if (!app.isPackaged) {
  dotenv.config();
}
const isTesting = process.env.testing === '1';

// Only one Senku at a time. Two copies would both run the reminder engine and
// both write the same JSON files (duplicate notifications, save collisions).
const gotSingleInstanceLock = isTesting || app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();
app.on('second-instance', () => showMainWindow());

// ---------------------------------------------------------------------------
// Task-engine scheduling
// ---------------------------------------------------------------------------

let wakeTimer: NodeJS.Timeout | null = null;
const MAX_WAKE_DELAY_MS = 6 * 60 * 60 * 1000;
const MIN_WAKE_DELAY_MS = 1_000;

type NormalizedTaskInput = TaskInput;

function endOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function normalizeTaskInput(input: TaskInput, existing?: Task): NormalizedTaskInput {
  const taskType = (input.taskType ?? existing?.taskType ?? 'scheduled') as TaskType;
  const title = String(input.title ?? '').trim();
  if (!title) throw new Error('Task name is required.');
  const firstStep = input.firstStep !== undefined
    ? (String(input.firstStep).trim() || undefined)
    : existing?.firstStep;

  if (taskType === 'flexible') {
    return { ...input, title, firstStep, taskType: 'flexible', startAt: undefined, endAt: undefined, linkedPaths: input.linkedPaths ?? [] };
  }

  const rawStart = input.startAt ? new Date(input.startAt) : new Date();
  if (Number.isNaN(rawStart.getTime())) throw new Error('Choose a valid start time.');
  const rawEnd = input.endAt ? new Date(input.endAt) : endOfLocalDay(rawStart);
  if (input.endAt && rawEnd.getHours() === 23 && rawEnd.getMinutes() === 59 && rawEnd.getSeconds() === 0) {
    rawEnd.setSeconds(59, 999);
  }
  if (Number.isNaN(rawEnd.getTime()) || rawStart >= rawEnd) {
    throw new Error('End time must be after the start time.');
  }
  return {
    ...input,
    title,
    firstStep,
    taskType: 'scheduled',
    startAt: rawStart.toISOString(),
    endAt: rawEnd.toISOString(),
    linkedPaths: input.linkedPaths ?? [],
  };
}

// ---------------------------------------------------------------------------
// File paths
// ---------------------------------------------------------------------------

const defaultSettings: Settings = {
  userName: '',
  activeWorkspaceId: '',
  launchAtStartup: true,
  greeting: 'Good morning, {name}.',
};

const dataDir = () => path.join(app.getPath('userData'), 'data');
const settingsFile = () => path.join(dataDir(), 'settings.json');
const workspacesFile = () => path.join(dataDir(), 'workspaces.json');
const workspaceDir = (id: string) => path.join(dataDir(), 'workspaces', id);
const tasksFile = (id: string, bucket: string) =>
  path.join(workspaceDir(id), `${bucket}-tasks.json`);
const dailyNoteFile = (id: string) => path.join(workspaceDir(id), 'daily-note.json');

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

const backedUp = new Set<string>();

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (error) {
    // Missing file is normal (first run). A file that exists but cannot be parsed
    // is not: keep a copy before the next save overwrites it.
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT' && !backedUp.has(file)) {
      backedUp.add(file);
      await fs.copyFile(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined);
    }
    return fallback;
  }
}

/**
 * Atomic save: write to a unique temp file, then rename over the real one.
 * (The temp name used to be fixed, so two saves at once fought over it.)
 */
async function writeJson(file: string, value: unknown): Promise<void> {
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `${path.basename(file)}.${randomUUID().slice(0, 8)}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  for (let attempt = 0; ; attempt++) {
    try {
      await fs.rename(tmp, file);
      return;
    } catch (error) {
      // Antivirus / search indexer can briefly lock the file on Windows.
      const code = (error as NodeJS.ErrnoException)?.code;
      const retryable = code === 'EPERM' || code === 'EBUSY' || code === 'EACCES';
      if (!retryable || attempt >= 4) {
        await fs.rm(tmp, { force: true });
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 40 * (attempt + 1)));
    }
  }
}

// ---------------------------------------------------------------------------
// One-at-a-time queue. Every handler that reads, changes and saves data runs
// through this, so two requests (or a request and the reminder engine) can
// never overwrite each other's changes.
// ---------------------------------------------------------------------------

let lockChain: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = lockChain.then(() => fn());
  lockChain = run.catch(() => undefined);
  return run;
}

function handleLocked(channel: string, listener: (event: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args) => withLock(async () => listener(event, ...args)));
}

// ---------------------------------------------------------------------------
// Data accessors
// ---------------------------------------------------------------------------

async function getSettings(): Promise<Settings> {
  return readJson(settingsFile(), defaultSettings);
}

async function getWorkspaces(): Promise<Workspace[]> {
  const workspaces = await readJson<Workspace[]>(workspacesFile(), []);
  // Backfill pinnedPaths for workspaces created before v2
  return workspaces.map((ws) => ({ ...ws, pinnedPaths: ws.pinnedPaths ?? [] }));
}

async function getTasks(id: string, bucket: 'active' | 'completed' | 'error'): Promise<Task[]> {
  return readJson(tasksFile(id, bucket), []);
}

async function saveTasks(
  id: string,
  bucket: 'active' | 'completed' | 'error',
  tasks: Task[],
): Promise<void> {
  await writeJson(tasksFile(id, bucket), tasks);
}

async function getDailyNote(id: string): Promise<string> {
  const note = await readJson<DailyNote | null>(dailyNoteFile(id), null);
  return note?.content ?? '';
}

async function saveDailyNote(id: string, content: string): Promise<void> {
  const note: DailyNote = { workspaceId: id, content, updatedAt: new Date().toISOString() };
  await writeJson(dailyNoteFile(id), note);
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

function isInside(masterFolder: string, target: string): boolean {
  const master = path.resolve(masterFolder).toLowerCase();
  const resolved = path.resolve(target).toLowerCase();
  return resolved === master || resolved.startsWith(`${master}${path.sep}`);
}

function getWorkspace(workspaces: Workspace[], id: string): Workspace | null {
  return workspaces.find((ws) => ws.id === id) ?? null;
}

// ---------------------------------------------------------------------------
// File browser
// ---------------------------------------------------------------------------

const IGNORED_NAMES = new Set(['desktop.ini', 'thumbs.db', '$recycle.bin', 'system volume information']);
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await fn(items[i]);
      }
    }),
  );
  return results;
}

// Re-reading a big folder after every click is wasteful. Reuse the last listing
// while the folder itself is unchanged (adding, removing or renaming changes it).
const listCache = new Map<string, { mtimeMs: number; at: number; entries: FileEntry[] }>();

async function readFolderEntries(dir: string): Promise<FileEntry[]> {
  const dirStat = await fs.stat(dir);
  const cached = listCache.get(dir);
  if (cached && cached.mtimeMs === dirStat.mtimeMs && Date.now() - cached.at < 15_000) return cached.entries;

  const items = (await fs.readdir(dir, { withFileTypes: true })).filter(
    (item) => !IGNORED_NAMES.has(item.name.toLowerCase()) && !item.name.startsWith('~$'),
  );

  // Stats run in parallel (48 at a time) instead of one by one.
  const found = await mapLimit(items, 48, async (item): Promise<FileEntry | null> => {
    const itemPath = path.join(dir, item.name);
    try {
      const stats = await fs.stat(itemPath); // follows shortcuts/links
      const isFolder = stats.isDirectory();
      return {
        name: item.name,
        path: itemPath,
        kind: isFolder ? 'folder' : 'file',
        extension: isFolder ? '' : path.extname(item.name).slice(1).toUpperCase(),
        size: isFolder ? undefined : stats.size,
        modifiedAt: stats.mtime.toISOString(),
      };
    } catch {
      return null; // inaccessible entry
    }
  });

  const entries = found.filter((entry): entry is FileEntry => entry !== null);
  listCache.set(dir, { mtimeMs: dirStat.mtimeMs, at: Date.now(), entries });
  if (listCache.size > 20) listCache.delete(listCache.keys().next().value as string);
  return entries;
}

async function listFolder(
  masterFolder: string,
  currentPath: string,
  pinnedPaths: string[],
): Promise<FileEntry[]> {
  if (!masterFolder || !isInside(masterFolder, currentPath)) return [];

  try {
    const pinned = new Set(pinnedPaths);
    const entries = (await readFolderEntries(currentPath)).map((entry) => ({ ...entry, pinned: pinned.has(entry.path) }));

    // Pinned first, then folders, then A-Z (numbers in natural order: 2 before 10)
    return entries.sort((a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      Number(b.kind === 'folder') - Number(a.kind === 'folder') ||
      collator.compare(a.name, b.name),
    );
  } catch {
    return [];
  }
}

async function isDirectory(target: string): Promise<boolean> {
  try {
    return (await fs.stat(target)).isDirectory();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

async function snapshot(requestedPath?: string): Promise<AppSnapshot> {
  const settings = await getSettings();
  const workspaces = await getWorkspaces();
  const workspaceFolderAvailability = Object.fromEntries(
    await Promise.all(workspaces.map(async (workspace) => {
      // Any failure (missing, disconnected drive, no permission) just means "not available".
      // It must never break the whole app.
      return [workspace.id, await isDirectory(workspace.masterFolder)] as const;
    })),
  );
  const workspace = getWorkspace(workspaces, settings.activeWorkspaceId);

  if (!workspace) {
    return {
      settings,
      workspaces,
      workspaceFolderAvailability,
      workspace: null,
      entries: [],
      currentPath: '',
      activeTasks: [],
      completedTasks: [],
      errorTasks: [],
      dailyNote: '',
    };
  }

  let currentPath =
    requestedPath && isInside(workspace.masterFolder, requestedPath)
      ? path.resolve(requestedPath)
      : workspace.lastSubfolder || workspace.masterFolder;

  // The remembered folder may have been deleted or renamed: go back to the main folder
  // instead of showing a confusing "empty" list.
  if (currentPath !== workspace.masterFolder && !(await isDirectory(currentPath))) {
    currentPath = workspace.masterFolder;
  }

  // Only touch the disk when the folder actually changed. (Saving on every
  // read was the cause of the "rename ... workspaces.json.tmp" error.)
  if (workspace.lastSubfolder !== currentPath) {
    workspace.lastSubfolder = currentPath;
    await writeJson(workspacesFile(), workspaces);
  }

  const [entries, activeTasks, completedTasks, errorTasks, dailyNote] = await Promise.all([
    listFolder(workspace.masterFolder, currentPath, workspace.pinnedPaths),
    getTasks(workspace.id, 'active'),
    getTasks(workspace.id, 'completed'),
    getTasks(workspace.id, 'error'),
    getDailyNote(workspace.id),
  ]);

  return {
    settings,
    workspaces,
    workspaceFolderAvailability,
    workspace,
    entries,
    currentPath,
    activeTasks,
    completedTasks,
    errorTasks,
    dailyNote,
  };
}

// ---------------------------------------------------------------------------
// Task engine
// ---------------------------------------------------------------------------

async function runTaskEngine(): Promise<void> {
  for (const workspace of await getWorkspaces()) {
    const active = await getTasks(workspace.id, 'active');
    const remaining: Task[] = [];
    const failed: Task[] = [];
    let changed = false;

    let missed = 0;

    for (const task of active) {
      if (task.taskType === 'flexible' || !task.startAt) {
        remaining.push(task);
        continue;
      }
      const shouldFire = !task.startEventHandled && Date.now() >= Date.parse(task.startAt);

      if (shouldFire) {
        task.startEventHandled = true;
        task.updatedAt = new Date().toISOString();
        changed = true;

        // Its whole time window passed while Senku was closed or asleep. Don't pop a
        // notification per task or open old files: it shows up as Overdue instead.
        if (task.endAt && Date.now() > Date.parse(task.endAt)) {
          missed += 1;
          remaining.push(task);
          continue;
        }

        new Notification({
          title: `Scheduled reminder · ${workspace.name}`,
          body: task.title,
        }).show();

        if (workspace.strictMode && task.linkedPaths.length) {
          const failures: string[] = [];
          for (const linkedPath of task.linkedPaths) {
            const trimmed = linkedPath.trim();
            if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
              try {
                await shell.openExternal(trimmed);
              } catch (err) {
                failures.push(`${trimmed}: ${String(err)}`);
              }
            } else {
              const error = await shell.openPath(trimmed);
              if (error) failures.push(`${trimmed}: ${error}`);
            }
          }
          if (failures.length) {
            failed.push({ ...task, errorMessage: failures.join('\n') });
            continue;
          }
        }
      }

      remaining.push(task);
    }

    if (missed > 0) {
      new Notification({
        title: `Senku · ${workspace.name}`,
        body: `${missed} scheduled task${missed === 1 ? ' was' : 's were'} missed while Senku was closed. See Overdue.`,
      }).show();
    }
    if (changed) await saveTasks(workspace.id, 'active', remaining);
    if (failed.length) {
      await saveTasks(workspace.id, 'error', [
        ...(await getTasks(workspace.id, 'error')),
        ...failed,
      ]);
    }
    if (failed.length || missed > 0) mainWindow?.webContents.send('tasks:changed');
  }
}

async function computeNextWakeAt(): Promise<number | null> {
  let earliest: number | null = null;
  for (const workspace of await getWorkspaces()) {
    for (const task of await getTasks(workspace.id, 'active')) {
      if (task.taskType !== 'scheduled' || !task.startAt || task.startEventHandled) continue;
      const startMs = Date.parse(task.startAt);
      if (Number.isNaN(startMs)) continue;
      if (earliest === null || startMs < earliest) earliest = startMs;
    }
  }
  return earliest;
}

async function scheduleNextWake(): Promise<void> {
  if (wakeTimer) {
    clearTimeout(wakeTimer);
    wakeTimer = null;
  }
  const earliest = await computeNextWakeAt();
  const now = Date.now();
  const target = earliest === null ? now + MAX_WAKE_DELAY_MS : earliest;
  const delay = Math.min(Math.max(target - now, MIN_WAKE_DELAY_MS), MAX_WAKE_DELAY_MS);
  wakeTimer = setTimeout(() => void wake(), delay);
}

async function wake(): Promise<void> {
  await withLock(runTaskEngine);
  await scheduleNextWake();
}

// ---------------------------------------------------------------------------
// Quick-add window (tray shortcut)
// ---------------------------------------------------------------------------

async function openQuickAdd(): Promise<void> {
  if (quickAddWindow && !quickAddWindow.isDestroyed()) {
    quickAddWindow.focus();
    return;
  }

  quickAddWindow = new BrowserWindow({
    width: 420,
    height: 220,
    resizable: false,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#f5f4ef',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    const base = devUrl.endsWith('/') ? devUrl : `${devUrl}/`;
    await quickAddWindow.loadURL(`${base}quick-add.html`);
  } else {
    await quickAddWindow.loadFile(path.join(__dirname, '../renderer/quick-add.html'));
  }

  quickAddWindow.once('blur', () => {
    quickAddWindow?.close();
  });

  quickAddWindow.on('closed', () => {
    quickAddWindow = null;
  });
}

// ---------------------------------------------------------------------------
// Main window & tray
// ---------------------------------------------------------------------------

function showMainWindow(): void {
  mainWindow?.show();
  mainWindow?.focus();
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1060,
    minHeight: 680,
    backgroundColor: '#f4f1ea',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.maximize();

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
  } else {
    await mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('close', (event) => {
    if (tray && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.once('ready-to-show', () => {
    showMainWindow();
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return;
  if (isTesting) {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        { role: 'fileMenu' },
        { role: 'editMenu' },
        { role: 'viewMenu' },
        { role: 'windowMenu' },
        { role: 'help' },
      ]),
    );
  } else {
    Menu.setApplicationMenu(null);
  }

  const startupSettings = await getSettings();
  app.setLoginItemSettings({
    openAtLogin: startupSettings.launchAtStartup,
    openAsHidden: false,
  });

  await createWindow();

  const trayIcon = nativeImage
    .createFromPath(path.join(app.getAppPath(), 'assets', 'senku.ico'))
    .resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip('Senku');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Senku', click: showMainWindow },
      { label: 'Quick add task', click: () => void openQuickAdd() },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
    ]),
  );
  tray.on('click', showMainWindow);

  powerMonitor.on('resume', () => { void wake(); });
  await wake();
});

app.on('before-quit', () => {
  isQuitting = true;
  if (wakeTimer) clearTimeout(wakeTimer);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC — existing handlers
// ---------------------------------------------------------------------------

ipcMain.handle('folder:choose', async () => {
  const result = await dialog.showOpenDialog({ defaultPath: app.getPath('desktop'), properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('folder:desktop-path', () => app.getPath('desktop'));

handleLocked('app:get-snapshot', (_event, requestedPath?: string) =>
  snapshot(requestedPath),
);

handleLocked('settings:save', async (_event, settings: Settings) => {
  await writeJson(settingsFile(), settings);
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup, openAsHidden: false });
  return snapshot();
});

handleLocked('workspace:create', async (_event, name: string, masterFolder: string) => {
  const stats = await fs.stat(masterFolder).catch(() => null);
  if (!stats?.isDirectory()) throw new Error('Master folder does not exist.');
  if (!name.trim()) throw new Error('Space name is required.');

  const workspace: Workspace = {
    id: randomUUID(),
    name: name.trim(),
    masterFolder: path.resolve(masterFolder),
    lastSubfolder: path.resolve(masterFolder),
    strictMode: false,
    pinnedPaths: [],
    createdAt: new Date().toISOString(),
  };

  await writeJson(workspacesFile(), [...(await getWorkspaces()), workspace]);
  await writeJson(settingsFile(), { ...(await getSettings()), activeWorkspaceId: workspace.id });
  return snapshot();
});

handleLocked('workspace:switch', async (_event, id: string) => {
  await writeJson(settingsFile(), { ...(await getSettings()), activeWorkspaceId: id });
  return snapshot();
});

handleLocked('workspace:rename', async (_event, id: string, name: string) => {
  const workspaces = await getWorkspaces();
  const workspace = getWorkspace(workspaces, id);
  if (!workspace || !name.trim()) throw new Error('Space name is required.');
  workspace.name = name.trim();
  await writeJson(workspacesFile(), workspaces);
  return snapshot();
});

handleLocked('workspace:set-master-folder', async (_event, id: string, folder: string) => {
  const stats = await fs.stat(folder).catch(() => null);
  if (!stats?.isDirectory()) throw new Error('Main folder does not exist.');
  const workspaces = await getWorkspaces();
  const workspace = getWorkspace(workspaces, id);
  if (!workspace) throw new Error('Space not found.');
  workspace.masterFolder = path.resolve(folder);
  workspace.lastSubfolder = workspace.masterFolder;
  await writeJson(workspacesFile(), workspaces);
  return snapshot(workspace.masterFolder);
});

handleLocked('workspace:strict-mode', async (_event, id: string, enabled: boolean) => {
  const workspaces = await getWorkspaces();
  const workspace = getWorkspace(workspaces, id);
  if (!workspace) throw new Error('Space not found.');
  workspace.strictMode = enabled;
  await writeJson(workspacesFile(), workspaces);
  return snapshot();
});

handleLocked('workspace:delete', async (_event, id: string) => {
  const workspaces = await getWorkspaces();
  const next = workspaces.filter((ws) => ws.id !== id);
  if (next.length === workspaces.length) return { ok: false, error: 'Space not found.' };

  await writeJson(workspacesFile(), next);
  await fs.rm(workspaceDir(id), { recursive: true, force: true });

  const settings = await getSettings();
  if (settings.activeWorkspaceId === id) {
    await writeJson(settingsFile(), { ...settings, activeWorkspaceId: next[0]?.id ?? '' });
  }

  await scheduleNextWake();
  return { ok: true };
});

ipcMain.handle('path:open', async (_event, target: string) => {
  const trimmed = target.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    try {
      await shell.openExternal(trimmed);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: String(error) };
    }
  }
  const error = await shell.openPath(trimmed);
  return { ok: !error, error: error || undefined };
});

ipcMain.handle('guide:open', async () => {
  const guidePath = app.isPackaged
    ? path.join(process.resourcesPath, 'guide', 'index.html')
    : path.join(app.getAppPath(), 'guide', 'index.html');
  try {
    await fs.access(guidePath);
    if (guideWindow && !guideWindow.isDestroyed()) {
      guideWindow.show();
      guideWindow.focus();
      return { ok: true };
    }

    guideWindow = new BrowserWindow({
      width: 1100,
      height: 800,
      title: 'Senku Guide',
      autoHideMenuBar: true,
      parent: mainWindow ?? undefined,
    });
    const window = guideWindow;
    window.once('closed', () => {
      if (guideWindow === window) guideWindow = null;
    });
    await window.loadFile(guidePath, { query: { version: app.getVersion() } });
    window.show();
    return { ok: true };
  } catch (error) {
    guideWindow?.close();
    guideWindow = null;
    return { ok: false, error: error instanceof Error ? error.message : 'Guide not found.' };
  }
});

ipcMain.handle('path:copy', async (_event, target: string) => {
  clipboard.writeText(target);
  return true;
});

// ---------------------------------------------------------------------------
// IPC — pin / unpin
// ---------------------------------------------------------------------------

handleLocked('path:pin', async (_event, target: string) => {
  const settings = await getSettings();
  const workspaces = await getWorkspaces();
  const workspace = getWorkspace(workspaces, settings.activeWorkspaceId);
  if (!workspace || !isInside(workspace.masterFolder, target)) {
    return snapshot();
  }
  const resolved = path.resolve(target);
  if (!workspace.pinnedPaths.includes(resolved)) {
    workspace.pinnedPaths.push(resolved);
    await writeJson(workspacesFile(), workspaces);
  }
  return snapshot();
});

handleLocked('path:unpin', async (_event, target: string) => {
  const settings = await getSettings();
  const workspaces = await getWorkspaces();
  const workspace = getWorkspace(workspaces, settings.activeWorkspaceId);
  if (!workspace) return snapshot();
  const resolved = path.resolve(target);
  workspace.pinnedPaths = workspace.pinnedPaths.filter((p) => p !== resolved);
  await writeJson(workspacesFile(), workspaces);
  return snapshot();
});

// ---------------------------------------------------------------------------
// IPC — daily note
// ---------------------------------------------------------------------------

handleLocked('note:save', async (_event, content: string) => {
  const settings = await getSettings();
  if (!settings.activeWorkspaceId) return;
  await saveDailyNote(settings.activeWorkspaceId, content);
});

// ---------------------------------------------------------------------------
// IPC — tasks
// ---------------------------------------------------------------------------

handleLocked('task:create', async (_event, input: TaskInput) => {
  const settings = await getSettings();
  if (!settings.activeWorkspaceId) throw new Error('No workspace selected.');

  const task: Task = {
    ...normalizeTaskInput(input),
    id: randomUUID(),
    isPinned: false,
    startEventHandled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveTasks(settings.activeWorkspaceId, 'active', [
    ...(await getTasks(settings.activeWorkspaceId, 'active')),
    task,
  ]);
  await scheduleNextWake();

  // Notify the main window to refresh if the quick-add window fired this
  mainWindow?.webContents.send('tasks:changed');

  return task;
});

handleLocked('task:complete', async (_event, id: string, reschedule?: TaskInput) => {
  const settings = await getSettings();
  const active = await getTasks(settings.activeWorkspaceId, 'active');
  const task = active.find((t) => t.id === id);
  if (!task) throw new Error('Task not found');

  const completed = {
    ...task,
    completedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveTasks(settings.activeWorkspaceId, 'completed', [
    ...(await getTasks(settings.activeWorkspaceId, 'completed')),
    completed,
  ]);
  await saveTasks(settings.activeWorkspaceId, 'active', active.filter((t) => t.id !== id));

  let next: Task | undefined;
  if (reschedule) {
    const normalized = normalizeTaskInput(reschedule);
    next = {
      ...normalized,
      id: randomUUID(),
      isPinned: task.isPinned ?? false,
      startEventHandled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveTasks(settings.activeWorkspaceId, 'active', [
      ...(await getTasks(settings.activeWorkspaceId, 'active')),
      next,
    ]);
  }

  await scheduleNextWake();
  return { task: completed, next };
});

handleLocked('task:snooze', async (_event, id: string, durationMinutes: number) => {
  const settings = await getSettings();
  const active = await getTasks(settings.activeWorkspaceId, 'active');
  const task = active.find((t) => t.id === id);
  if (!task) throw new Error('Task not found');
  if (task.taskType !== 'scheduled' || !task.startAt) {
    throw new Error('Plan this Flexible task for today before snoozing it.');
  }

  // Snooze counts from now (or from the start time if that is still ahead).
  // It used to add to the old start time, so an old task came straight back.
  const base = Math.max(Date.now(), Date.parse(task.startAt));
  const newStart = new Date(base + durationMinutes * 60_000);
  task.startAt = newStart.toISOString();
  // A snooze must never push the start past the end (that made the task "Overdue" at once).
  if (!task.endAt || newStart.getTime() >= Date.parse(task.endAt)) {
    task.endAt = endOfLocalDay(newStart).toISOString();
  }
  task.startEventHandled = false;
  task.updatedAt = new Date().toISOString();

  await saveTasks(settings.activeWorkspaceId, 'active', active);
  await scheduleNextWake();
  return task;
});

handleLocked(
  'task:update',
  async (_event, id: string, input: TaskInput, bucket: 'active' | 'error' = 'active') => {
    const settings = await getSettings();
    const tasks = await getTasks(settings.activeWorkspaceId, bucket);
    const index = tasks.findIndex((t) => t.id === id);
    if (index < 0) throw new Error('Task not found.');

    const existing = tasks[index];
    const normalized = normalizeTaskInput(input, existing);
    const startTimeChanged = normalized.startAt !== existing.startAt;
    const updated: Task = {
      ...existing,
      ...normalized,
      updatedAt: new Date().toISOString(),
      startEventHandled:
        bucket === 'active' && normalized.taskType === 'scheduled' && !startTimeChanged
          ? existing.startEventHandled
          : false,
    };

    tasks[index] = updated;
    await saveTasks(settings.activeWorkspaceId, bucket, tasks);
    if (bucket === 'active') await scheduleNextWake();
    return updated;
  },
);

handleLocked('task:recover', async (_event, id: string, input: TaskInput) => {
  const settings = await getSettings();
  const errors = await getTasks(settings.activeWorkspaceId, 'error');
  const task = errors.find((t) => t.id === id);
  if (!task) throw new Error('Error task not found.');

  const normalized = normalizeTaskInput(input, task);
  const recovered: Task = {
    ...task,
    ...normalized,
    errorMessage: undefined,
    startEventHandled: false,
    updatedAt: new Date().toISOString(),
  };

  await saveTasks(settings.activeWorkspaceId, 'active', [
    ...(await getTasks(settings.activeWorkspaceId, 'active')),
    recovered,
  ]);
  await saveTasks(settings.activeWorkspaceId, 'error', errors.filter((t) => t.id !== id));
  await scheduleNextWake();
  return recovered;
});

handleLocked(
  'task:delete',
  async (_event, id: string, bucket: 'active' | 'completed' | 'error') => {
    const settings = await getSettings();
    await saveTasks(
      settings.activeWorkspaceId,
      bucket,
      (await getTasks(settings.activeWorkspaceId, bucket)).filter((t) => t.id !== id),
    );
    if (bucket === 'active') await scheduleNextWake();
    return true;
  },
);

handleLocked('task:pin', async (_event, id: string, isPinned: boolean) => {
  const settings = await getSettings();
  const active = await getTasks(settings.activeWorkspaceId, 'active');
  const index = active.findIndex((task) => task.id === id);
  if (index < 0) throw new Error('Active task not found.');
  active[index] = {
    ...active[index],
    isPinned,
    updatedAt: new Date().toISOString(),
  };
  await saveTasks(settings.activeWorkspaceId, 'active', active);
  return active[index];
});

// ---------------------------------------------------------------------------
// IPC — bulk task operations (multiselect)
// ---------------------------------------------------------------------------

handleLocked('task:complete-many', async (_event, ids: string[]) => {
  const settings = await getSettings();
  const wsId = settings.activeWorkspaceId;
  if (!wsId) throw new Error('No workspace selected.');

  let active = await getTasks(wsId, 'active');
  const existing = await getTasks(wsId, 'completed');
  const now = new Date().toISOString();

  const completed = ids
    .map((id) => active.find((t) => t.id === id))
    .filter((t): t is Task => t !== undefined)
    .map((t) => ({ ...t, completedAt: now, updatedAt: now }));

  active = active.filter((t) => !ids.includes(t.id));

  await saveTasks(wsId, 'completed', [...existing, ...completed]);
  await saveTasks(wsId, 'active', active);
  await scheduleNextWake();
  return completed.length;
});

handleLocked('task:delete-many', async (_event, ids: string[], bucket: 'active' | 'completed' | 'error') => {
  const settings = await getSettings();
  const wsId = settings.activeWorkspaceId;
  if (!wsId) throw new Error('No workspace selected.');

  const tasks = await getTasks(wsId, bucket);
  await saveTasks(wsId, bucket, tasks.filter((t) => !ids.includes(t.id)));
  if (bucket === 'active') await scheduleNextWake();
  return ids.length;
});

ipcMain.handle('quickadd:close', () => {
  quickAddWindow?.close();
});
