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
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AppSnapshot, FileEntry, Settings, Task, TaskInput, Workspace } from './types';

// ---------------------------------------------------------------------------
// App-level state
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// ---------------------------------------------------------------------------
// Task-engine scheduling
//
// Instead of polling every minute, we calculate the timestamp of the next
// task that still needs its start-event fired and sleep exactly until then.
// Any change that could move that timestamp (new task, edit, snooze, delete,
// workspace switch) calls scheduleNextWake() so the sleep is recalculated
// immediately rather than waiting for the next tick.
// ---------------------------------------------------------------------------

let wakeTimer: NodeJS.Timeout | null = null;
let nextWakeAt = 0;

// Safety caps so we never pass Node a huge delay and so we still wake
// periodically even when no tasks are queued.
const MAX_WAKE_DELAY_MS = 6 * 60 * 60 * 1000; // 6 hours
const MIN_WAKE_DELAY_MS = 1_000;               // avoid tight loop on same-time tasks

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

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, file); // atomic on same FS
}

// ---------------------------------------------------------------------------
// Data accessors
// ---------------------------------------------------------------------------

async function getSettings(): Promise<Settings> {
  return readJson(settingsFile(), defaultSettings);
}

async function getWorkspaces(): Promise<Workspace[]> {
  return readJson(workspacesFile(), []);
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

async function listFolder(masterFolder: string, currentPath: string): Promise<FileEntry[]> {
  if (!masterFolder || !isInside(masterFolder, currentPath)) return [];

  try {
    const items = await fs.readdir(currentPath, { withFileTypes: true });
    const entries: FileEntry[] = [];

    for (const item of items) {
      const itemPath = path.join(currentPath, item.name);
      try {
        const stats = await fs.stat(itemPath);
        entries.push({
          name: item.name,
          path: itemPath,
          kind: item.isDirectory() ? 'folder' : 'file',
          extension: item.isDirectory() ? '' : path.extname(item.name).slice(1).toUpperCase(),
          size: item.isDirectory() ? undefined : stats.size,
          modifiedAt: stats.mtime.toISOString(),
        });
      } catch {
        // Ignore inaccessible entries (permissions, locked files, etc.)
      }
    }

    // Folders first, then alphabetical
    return entries.sort(
      (a, b) =>
        Number(b.kind === 'folder') - Number(a.kind === 'folder') ||
        a.name.localeCompare(b.name),
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Snapshot — single source of truth sent to the renderer on every load
// ---------------------------------------------------------------------------

async function snapshot(requestedPath?: string): Promise<AppSnapshot> {
  const settings = await getSettings();
  const workspaces = await getWorkspaces();
  const workspace = getWorkspace(workspaces, settings.activeWorkspaceId);

  if (!workspace) {
    return {
      settings,
      workspaces,
      workspace: null,
      entries: [],
      currentPath: '',
      activeTasks: [],
      completedTasks: [],
      errorTasks: [],
    };
  }

  const currentPath =
    requestedPath && isInside(workspace.masterFolder, requestedPath)
      ? path.resolve(requestedPath)
      : workspace.lastSubfolder || workspace.masterFolder;

  // Persist last-visited subfolder
  workspace.lastSubfolder = currentPath;
  await writeJson(workspacesFile(), workspaces);

  const [entries, activeTasks, completedTasks, errorTasks] = await Promise.all([
    listFolder(workspace.masterFolder, currentPath),
    getTasks(workspace.id, 'active'),
    getTasks(workspace.id, 'completed'),
    getTasks(workspace.id, 'error'),
  ]);

  return { settings, workspaces, workspace, entries, currentPath, activeTasks, completedTasks, errorTasks };
}

// ---------------------------------------------------------------------------
// Task engine — fires start-event notifications and handles strict mode
// ---------------------------------------------------------------------------

async function runTaskEngine(): Promise<void> {
  for (const workspace of await getWorkspaces()) {
    const active = await getTasks(workspace.id, 'active');
    const remaining: Task[] = [];
    const failed: Task[] = [];
    let changed = false;

    for (const task of active) {
      const shouldFire = !task.startEventHandled && Date.now() >= Date.parse(task.startAt);

      if (shouldFire) {
        task.startEventHandled = true;
        task.updatedAt = new Date().toISOString();
        changed = true;

        new Notification({
          title:
            task.priority === 'urgent'
              ? `Urgent · ${workspace.name}`
              : `Reminder · ${workspace.name}`,
          body: task.title,
        }).show();

        // Strict mode: open all linked resources when the task starts.
        // If any resource fails to open, move the task to the error bucket.
        if (workspace.strictMode && task.linkedPaths.length) {
          const failures: string[] = [];
          for (const linkedPath of task.linkedPaths) {
            const error = await shell.openPath(linkedPath);
            if (error) failures.push(`${linkedPath}: ${error}`);
          }
          if (failures.length) {
            failed.push({ ...task, errorMessage: failures.join('\n') });
            continue; // don't add to remaining
          }
        }
      }

      remaining.push(task);
    }

    if (changed) await saveTasks(workspace.id, 'active', remaining);
    if (failed.length) {
      await saveTasks(workspace.id, 'error', [
        ...await getTasks(workspace.id, 'error'),
        ...failed,
      ]);
    }
  }
}

// ---------------------------------------------------------------------------
// Smart wake scheduling
// ---------------------------------------------------------------------------

/** Returns the earliest un-fired startAt across all workspaces, or null. */
async function computeNextWakeAt(): Promise<number | null> {
  let earliest: number | null = null;
  for (const workspace of await getWorkspaces()) {
    for (const task of await getTasks(workspace.id, 'active')) {
      if (task.startEventHandled) continue;
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

  nextWakeAt = now + delay;
  wakeTimer = setTimeout(() => void wake(), delay);
}

async function wake(): Promise<void> {
  await runTaskEngine();
  await scheduleNextWake();
}

// ---------------------------------------------------------------------------
// Window & tray
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

  // Hide to tray on close (unless actually quitting)
  mainWindow.on('close', (event) => {
    if (tray && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  // In dev mode show immediately; in production the tray click shows it
  mainWindow.once('ready-to-show', () => {
    if (!app.isPackaged) showMainWindow();
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);

  const startupSettings = await getSettings();
  app.setLoginItemSettings({
    openAtLogin: startupSettings.launchAtStartup,
    openAsHidden: true,
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
      { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
    ]),
  );
  tray.on('click', showMainWindow);

  await wake();
});

// On resume from sleep, the OS may have held our timer. Re-run immediately.
powerMonitor.on('resume', () => { void wake(); });

app.on('before-quit', () => {
  isQuitting = true;
  if (wakeTimer) clearTimeout(wakeTimer);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC handlers
// ---------------------------------------------------------------------------

ipcMain.handle('folder:choose', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('app:get-snapshot', (_event, requestedPath?: string) =>
  snapshot(requestedPath),
);

ipcMain.handle('settings:save', async (_event, settings: Settings) => {
  await writeJson(settingsFile(), settings);
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup, openAsHidden: true });
  return snapshot();
});

// --- Workspace IPC ---

ipcMain.handle('workspace:create', async (_event, name: string, masterFolder: string) => {
  const stats = await fs.stat(masterFolder).catch(() => null);
  if (!stats?.isDirectory()) throw new Error('Master folder does not exist.');

  const workspace: Workspace = {
    id: randomUUID(),
    name: name.trim(),
    masterFolder: path.resolve(masterFolder),
    lastSubfolder: path.resolve(masterFolder),
    strictMode: false,
    createdAt: new Date().toISOString(),
  };

  await writeJson(workspacesFile(), [...await getWorkspaces(), workspace]);
  await writeJson(settingsFile(), { ...(await getSettings()), activeWorkspaceId: workspace.id });
  return snapshot();
});

ipcMain.handle('workspace:switch', async (_event, id: string) => {
  await writeJson(settingsFile(), { ...(await getSettings()), activeWorkspaceId: id });
  return snapshot();
});

ipcMain.handle('workspace:rename', async (_event, id: string, name: string) => {
  const workspaces = await getWorkspaces();
  const workspace = getWorkspace(workspaces, id);
  if (!workspace || !name.trim()) throw new Error('Workspace name is required.');
  workspace.name = name.trim();
  await writeJson(workspacesFile(), workspaces);
  return snapshot();
});

ipcMain.handle('workspace:strict-mode', async (_event, id: string, enabled: boolean) => {
  const workspaces = await getWorkspaces();
  const workspace = getWorkspace(workspaces, id);
  if (!workspace) throw new Error('Workspace not found.');
  workspace.strictMode = enabled;
  await writeJson(workspacesFile(), workspaces);
  return snapshot();
});

ipcMain.handle('workspace:delete', async (_event, id: string) => {
  const workspaces = await getWorkspaces();
  const next = workspaces.filter((ws) => ws.id !== id);
  if (next.length === workspaces.length) return { ok: false, error: 'Workspace not found.' };

  await writeJson(workspacesFile(), next);
  await fs.rm(workspaceDir(id), { recursive: true, force: true });

  const settings = await getSettings();
  if (settings.activeWorkspaceId === id) {
    await writeJson(settingsFile(), { ...settings, activeWorkspaceId: next[0]?.id ?? '' });
  }

  await scheduleNextWake();
  return { ok: true };
});

// --- File-system IPC ---

ipcMain.handle('path:open', async (_event, target: string) => ({
  ok: !(await shell.openPath(target)),
}));

ipcMain.handle('guide:open', async () => {
  const guidePath = path.join(app.getAppPath(), 'assets', 'Senku-User-Guide.pdf');
  const error = await shell.openPath(guidePath);
  return error ? { ok: false, error } : { ok: true };
});

ipcMain.handle('path:copy', async (_event, target: string) => {
  clipboard.writeText(target);
  return true;
});

ipcMain.handle('path:rename', async (_event, target: string, name: string) => {
  const settings = await getSettings();
  const workspace = getWorkspace(await getWorkspaces(), settings.activeWorkspaceId);
  const safeName = path.basename(name);

  if (
    !workspace ||
    !isInside(workspace.masterFolder, target) ||
    path.resolve(target) === path.resolve(workspace.masterFolder)
  ) {
    return { ok: false, error: 'Only resources inside the master folder can be renamed.' };
  }

  if (!safeName || safeName !== name || safeName === '.' || safeName === '..') {
    return { ok: false, error: 'Invalid name.' };
  }

  try {
    await fs.rename(target, path.join(path.dirname(target), safeName));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
});

// --- Task IPC ---

ipcMain.handle('task:create', async (_event, input: TaskInput) => {
  const settings = await getSettings();
  if (!settings.activeWorkspaceId) throw new Error('No workspace selected.');

  const task: Task = {
    ...input,
    id: randomUUID(),
    startEventHandled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveTasks(settings.activeWorkspaceId, 'active', [
    ...await getTasks(settings.activeWorkspaceId, 'active'),
    task,
  ]);
  await scheduleNextWake();
  return task;
});

ipcMain.handle('task:complete', async (_event, id: string, reschedule?: TaskInput) => {
  const settings = await getSettings();
  const active = await getTasks(settings.activeWorkspaceId, 'active');
  const task = active.find((t) => t.id === id);
  if (!task) throw new Error('Task not found');

  const completed = { ...task, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await saveTasks(settings.activeWorkspaceId, 'active', active.filter((t) => t.id !== id));
  await saveTasks(settings.activeWorkspaceId, 'completed', [
    ...await getTasks(settings.activeWorkspaceId, 'completed'),
    completed,
  ]);

  let next: Task | undefined;
  if (reschedule) {
    next = {
      ...reschedule,
      id: randomUUID(),
      startEventHandled: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveTasks(settings.activeWorkspaceId, 'active', [
      ...await getTasks(settings.activeWorkspaceId, 'active'),
      next,
    ]);
  }

  await scheduleNextWake();
  return { task: completed, next };
});

ipcMain.handle('task:snooze', async (_event, id: string, durationMinutes: number) => {
  const settings = await getSettings();
  const active = await getTasks(settings.activeWorkspaceId, 'active');
  const task = active.find((t) => t.id === id);
  if (!task) throw new Error('Task not found');

  task.startAt = new Date(Date.parse(task.startAt) + durationMinutes * 60_000).toISOString();
  task.startEventHandled = false;
  task.updatedAt = new Date().toISOString();

  await saveTasks(settings.activeWorkspaceId, 'active', active);
  await scheduleNextWake();
  return task;
});

ipcMain.handle(
  'task:update',
  async (_event, id: string, input: TaskInput, bucket: 'active' | 'error' = 'active') => {
    const settings = await getSettings();
    const tasks = await getTasks(settings.activeWorkspaceId, bucket);
    const index = tasks.findIndex((t) => t.id === id);
    if (index < 0) throw new Error('Task not found.');

    const existing = tasks[index];
    const startTimeChanged = input.startAt !== existing.startAt;
    const updated: Task = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString(),
      // Only reset the start-event flag when start time actually changes
      startEventHandled:
        bucket === 'active' && !startTimeChanged ? existing.startEventHandled : false,
    };

    tasks[index] = updated;
    await saveTasks(settings.activeWorkspaceId, bucket, tasks);
    if (bucket === 'active') await scheduleNextWake();
    return updated;
  },
);

ipcMain.handle('task:recover', async (_event, id: string, input: TaskInput) => {
  const settings = await getSettings();
  const errors = await getTasks(settings.activeWorkspaceId, 'error');
  const task = errors.find((t) => t.id === id);
  if (!task) throw new Error('Error task not found.');

  const recovered: Task = {
    ...task,
    ...input,
    errorMessage: undefined,
    startEventHandled: false,
    updatedAt: new Date().toISOString(),
  };

  await saveTasks(settings.activeWorkspaceId, 'error', errors.filter((t) => t.id !== id));
  await saveTasks(settings.activeWorkspaceId, 'active', [
    ...await getTasks(settings.activeWorkspaceId, 'active'),
    recovered,
  ]);
  await scheduleNextWake();
  return recovered;
});

ipcMain.handle(
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
