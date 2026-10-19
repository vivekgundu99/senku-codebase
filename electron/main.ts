import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
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
  FileEntry,
  Launchpad,
  LogEntry,
  NoteFile,
  Settings,
  TrashWorkspace,
  Workspace,
} from './types';

// ---------------------------------------------------------------------------
// App-level state
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
let guideWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

if (!app.isPackaged) {
  dotenv.config();
  app.setName('senku-dev');
  app.setPath('userData', path.join(app.getPath('appData'), 'senku-dev'));
}
const isTesting = process.env.testing === '1';

// Only one Senku at a time per environment (isolated lock for dev vs installed)
const gotSingleInstanceLock = isTesting || app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) app.quit();
app.on('second-instance', () => showMainWindow());

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
const logFile = () => path.join(dataDir(), 'log.json');
const launchpadsFile = () => path.join(dataDir(), 'launchpads.json');
const trashFile = () => path.join(dataDir(), 'trash-workspaces.json');
const workspaceDir = (id: string) => path.join(dataDir(), 'workspaces', id);
const notesFile = () => path.join(dataDir(), 'notes.json');

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

const backedUp = new Set<string>();

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code !== 'ENOENT' && !backedUp.has(file)) {
      backedUp.add(file);
      await fs.copyFile(file, `${file}.corrupt-${Date.now()}`).catch(() => undefined);
    }
    return fallback;
  }
}

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
// Queue lock for atomic state transitions
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
  return workspaces.map((ws) => ({ ...ws, pinnedPaths: ws.pinnedPaths ?? [] }));
}



async function getLogEntries(): Promise<LogEntry[]> {
  const entries = await readJson<LogEntry[]>(logFile(), []);
  if (entries.some((e) => typeof e.seq !== 'number')) {
    const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
    let cur = 1;
    for (const e of sorted) {
      if (typeof e.seq !== 'number') {
        e.seq = cur;
      }
      cur = Math.max(cur, e.seq) + 1;
    }
    await writeJson(logFile(), entries);
  }
  return entries;
}

async function saveLogEntries(entries: LogEntry[]): Promise<void> {
  await writeJson(logFile(), entries);
}

async function getLaunchpads(): Promise<Launchpad[]> {
  return readJson<Launchpad[]>(launchpadsFile(), []);
}

async function saveLaunchpads(pads: Launchpad[]): Promise<void> {
  await writeJson(launchpadsFile(), pads);
}

async function getTrashWorkspaces(): Promise<TrashWorkspace[]> {
  return readJson<TrashWorkspace[]>(trashFile(), []);
}

async function saveTrashWorkspaces(items: TrashWorkspace[]): Promise<void> {
  await writeJson(trashFile(), items);
}

async function getNotes(): Promise<NoteFile[]> {
  return readJson<NoteFile[]>(notesFile(), []);
}

async function saveNotes(notes: NoteFile[]): Promise<void> {
  await writeJson(notesFile(), notes);
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

function isIgnoredEntry(name: string): boolean {
  const lower = name.toLowerCase();

  // OS & system metadata
  if (
    lower === 'desktop.ini' ||
    lower === 'thumbs.db' ||
    lower === 'ehthumbs.db' ||
    lower === '$recycle.bin' ||
    lower === 'system volume information' ||
    lower === '.ds_store'
  ) {
    return true;
  }

  // Office lock/owner files: ~$Document.docx, ~$Book.xlsx
  if (lower.startsWith('~$')) return true;

  // Temp working files: ~WRL0001.tmp, any .tmp file
  if (lower.startsWith('~') && lower.endsWith('.tmp')) return true;
  if (lower.endsWith('.tmp')) return true;

  // Google Drive & Cloud sync temporary download/upload markers
  if (lower.includes('.tmp.drive') || lower.endsWith('.tmp.driveupload') || lower.endsWith('.tmp.drivedownload')) {
    return true;
  }

  // Incomplete browser downloads
  if (lower.endsWith('.crdownload') || lower.endsWith('.part')) {
    return true;
  }

  return false;
}

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

const listCache = new Map<string, { mtimeMs: number; at: number; entries: FileEntry[] }>();

async function readFolderEntries(dir: string): Promise<FileEntry[]> {
  const dirStat = await fs.stat(dir);
  const cached = listCache.get(dir);
  if (cached && cached.mtimeMs === dirStat.mtimeMs && Date.now() - cached.at < 15_000) return cached.entries;

  const items = (await fs.readdir(dir, { withFileTypes: true })).filter(
    (item) => !isIgnoredEntry(item.name),
  );

  const found = await mapLimit(items, 48, async (item): Promise<FileEntry | null> => {
    const itemPath = path.join(dir, item.name);
    try {
      const stats = await fs.stat(itemPath);
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
      return null;
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

// Lazy cached check so network drives / unmounted drives don't lag Senku
const availabilityCache = new Map<string, { ok: boolean; at: number }>();
async function isDirectoryCached(id: string, folder: string): Promise<boolean> {
  const cached = availabilityCache.get(id);
  if (cached && Date.now() - cached.at < 20_000) return cached.ok;
  const ok = await isDirectory(folder);
  availabilityCache.set(id, { ok, at: Date.now() });
  return ok;
}

// ---------------------------------------------------------------------------
// App Snapshot
// ---------------------------------------------------------------------------

async function snapshot(requestedPath?: string): Promise<AppSnapshot> {
  const settings = await getSettings();
  const workspaces = await getWorkspaces();
  const workspaceFolderAvailability = Object.fromEntries(
    await Promise.all(workspaces.map(async (workspace) => {
      return [workspace.id, await isDirectoryCached(workspace.id, workspace.masterFolder)] as const;
    })),
  );
  const workspace = getWorkspace(workspaces, settings.activeWorkspaceId);
  const [logEntries, launchpads, trashWorkspaces, notes] = await Promise.all([
    getLogEntries(),
    getLaunchpads(),
    getTrashWorkspaces(),
    getNotes(),
  ]);

  if (!workspace) {
    return {
      settings,
      workspaces,
      workspaceFolderAvailability,
      workspace: null,
      entries: [],
      currentPath: '',
      logEntries,
      launchpads,
      trashWorkspaces,
      notes,
    };
  }

  let currentPath =
    requestedPath && isInside(workspace.masterFolder, requestedPath)
      ? path.resolve(requestedPath)
      : workspace.lastSubfolder || workspace.masterFolder;

  if (currentPath !== workspace.masterFolder && !(await isDirectory(currentPath))) {
    currentPath = workspace.masterFolder;
  }

  if (workspace.lastSubfolder !== currentPath) {
    workspace.lastSubfolder = currentPath;
    await writeJson(workspacesFile(), workspaces);
  }

  const entries = await listFolder(workspace.masterFolder, currentPath, workspace.pinnedPaths);

  return {
    settings,
    workspaces,
    workspaceFolderAvailability,
    workspace,
    entries,
    currentPath,
    logEntries,
    launchpads,
    trashWorkspaces,
    notes,
  };
}

// ---------------------------------------------------------------------------
// Window & Tray
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
// Floating Quick Note Overlay Window
// ---------------------------------------------------------------------------

async function createOverlayWindow(): Promise<BrowserWindow> {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    return overlayWindow;
  }

  overlayWindow = new BrowserWindow({
    width: 480,
    height: 160,
    minWidth: 320,
    minHeight: 120,
    frame: false,
    backgroundColor: '#f5f2ea',
    alwaysOnTop: true,
    resizable: true,
    movable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    await overlayWindow.loadURL(`${devUrl}/overlay.html`);
  } else {
    await overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay.html'));
  }

  overlayWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      overlayWindow?.hide();
    }
  });

  return overlayWindow;
}

async function showOverlayWindow(): Promise<void> {
  const win = await createOverlayWindow();
  win.show();
  win.focus();
  win.webContents.send('overlay:refresh');
}

function hideOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.hide();
  }
}

function minimizeOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.minimize();
  }
}

// ---------------------------------------------------------------------------
// App Lifecycle
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

  if (app.isPackaged) {
    const startupSettings = await getSettings();
    app.setLoginItemSettings({
      openAtLogin: startupSettings.launchAtStartup,
      openAsHidden: false,
    });
  }

  await createWindow();

  const trayIcon = nativeImage
    .createFromPath(path.join(app.getAppPath(), 'assets', 'senku.ico'))
    .resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip(app.isPackaged ? 'Senku' : 'Senku (Dev v3)');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Senku', click: showMainWindow },
      {
        label: 'Quick Note Overlay',
        click: () => {
          void showOverlayWindow();
        },
      },
      { type: 'separator' },
      { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
    ]),
  );
  tray.on('click', showMainWindow);
});

app.on('before-quit', () => {
  isQuitting = true;
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.destroy();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC Handlers
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
  if (app.isPackaged) {
    app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup, openAsHidden: false });
  }
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

handleLocked('workspace:delete', async (_event, id: string) => {
  const workspaces = await getWorkspaces();
  const target = workspaces.find((ws) => ws.id === id);
  if (!target) return { ok: false, error: 'Space not found.' };

  const next = workspaces.filter((ws) => ws.id !== id);
  await writeJson(workspacesFile(), next);

  const trash = await getTrashWorkspaces();
  const item: TrashWorkspace = {
    id: target.id,
    name: target.name,
    masterFolder: target.masterFolder,
    deletedAt: Date.now(),
  };
  await saveTrashWorkspaces([item, ...trash.filter((t) => t.id !== id)]);

  const settings = await getSettings();
  if (settings.activeWorkspaceId === id) {
    await writeJson(settingsFile(), { ...settings, activeWorkspaceId: next[0]?.id ?? '' });
  }

  return { ok: true };
});

handleLocked('workspace:restore', async (_event, id: string) => {
  const trash = await getTrashWorkspaces();
  const item = trash.find((t) => t.id === id);
  if (!item) return snapshot();

  await saveTrashWorkspaces(trash.filter((t) => t.id !== id));

  const workspaces = await getWorkspaces();
  const restored: Workspace = {
    id: item.id,
    name: item.name,
    masterFolder: item.masterFolder,
    lastSubfolder: item.masterFolder,
    pinnedPaths: [],
    createdAt: new Date().toISOString(),
  };
  await writeJson(workspacesFile(), [...workspaces, restored]);

  const settings = await getSettings();
  await writeJson(settingsFile(), { ...settings, activeWorkspaceId: restored.id });

  return snapshot();
});

handleLocked('workspace:purge-trash', async (_event, id?: string) => {
  const trash = await getTrashWorkspaces();
  if (id) {
    await saveTrashWorkspaces(trash.filter((t) => t.id !== id));
    await fs.rm(workspaceDir(id), { recursive: true, force: true }).catch(() => undefined);
  } else {
    for (const t of trash) {
      await fs.rm(workspaceDir(t.id), { recursive: true, force: true }).catch(() => undefined);
    }
    await saveTrashWorkspaces([]);
  }
  return snapshot();
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
// V3: Quiet Log Handlers
// ---------------------------------------------------------------------------

handleLocked('log:add', async (_event, text: string, spaceId?: string) => {
  const trimmed = (text || '').trim();
  if (!trimmed) return snapshot();
  const entries = await getLogEntries();
  const settings = await getSettings();
  const maxExisting = entries.reduce((max, e) => (typeof e.seq === 'number' && e.seq > max ? e.seq : max), 0);
  const nextSeq = Math.max((settings as any).lastLogSeq || 0, maxExisting) + 1;

  const entry: LogEntry = {
    id: randomUUID(),
    seq: nextSeq,
    text: trimmed,
    createdAt: Date.now(),
    spaceId,
  };
  (settings as any).lastLogSeq = nextSeq;
  await writeJson(settingsFile(), settings);
  await saveLogEntries([entry, ...entries]);
  return snapshot();
});

handleLocked('log:delete', async (_event, id: string) => {
  const entries = await getLogEntries();
  await saveLogEntries(entries.filter((e) => e.id !== id));
  return snapshot();
});

// ---------------------------------------------------------------------------
// V3: Resource Opening (Web URL or default OS handler)
// ---------------------------------------------------------------------------

async function openSingleItem(target: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = target.trim();
  if (!trimmed) return { ok: true };

  // 1. Web URL or mailto
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    try {
      await shell.openExternal(trimmed);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }

  // 2. Local folder or file: open with default OS application / File Explorer
  const err = await shell.openPath(trimmed);
  return { ok: !err, error: err || undefined };
}

// ---------------------------------------------------------------------------
// V3: Launchpad Handlers
// ---------------------------------------------------------------------------

handleLocked('launchpad:create', async (_event, name: string, spaceId: string, paths: string[]) => {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Launchpad name is required.');
  const pads = await getLaunchpads();
  const pad: Launchpad = {
    id: randomUUID(),
    name: trimmedName,
    spaceId,
    paths: paths.map((p) => p.trim()).filter(Boolean),
    createdAt: Date.now(),
  };
  await saveLaunchpads([...pads, pad]);
  return snapshot();
});

handleLocked('launchpad:update', async (_event, id: string, name: string, paths: string[]) => {
  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Launchpad name is required.');
  const pads = await getLaunchpads();
  const index = pads.findIndex((p) => p.id === id);
  if (index < 0) throw new Error('Launchpad not found.');
  pads[index] = {
    ...pads[index],
    name: trimmedName,
    paths: paths.map((p) => p.trim()).filter(Boolean),
  };
  await saveLaunchpads(pads);
  return snapshot();
});

handleLocked('launchpad:delete', async (_event, id: string) => {
  const pads = await getLaunchpads();
  await saveLaunchpads(pads.filter((p) => p.id !== id));
  return snapshot();
});

ipcMain.handle('launchpad:launch', async (_event, id: string) => {
  const pads = await getLaunchpads();
  const pad = pads.find((p) => p.id === id);
  if (!pad) return { ok: false, errors: ['Launchpad not found'] };

  const errors: string[] = [];
  for (const target of pad.paths) {
    const res = await openSingleItem(target);
    if (!res.ok && res.error) errors.push(`${target}: ${res.error}`);
  }
  return { ok: errors.length === 0, errors };
});

ipcMain.handle('path:open-item', async (_event, target: string) => {
  return openSingleItem(target);
});

// ---------------------------------------------------------------------------
// V3: Quick Actions (VS Code / Terminal)
// ---------------------------------------------------------------------------

ipcMain.handle('code:open', async (_event, targetPath: string) => {
  try {
    const cp = await import('node:child_process');
    cp.spawn('code', [targetPath], { shell: true, detached: true, stdio: 'ignore' }).unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('terminal:open', async (_event, targetPath: string) => {
  try {
    const cp = await import('node:child_process');
    let folder = targetPath;
    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isDirectory()) folder = path.dirname(targetPath);
    } catch {
      // fallback
    }
    const child = cp.spawn('wt', ['-d', folder], { shell: true, detached: true, stdio: 'ignore' });
    child.on('error', () => {
      cp.spawn('cmd', ['/c', 'start', 'cmd', '/k', `cd /d "${folder}"`], { shell: true, detached: true, stdio: 'ignore' }).unref();
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// ---------------------------------------------------------------------------
// Notes Handlers
// ---------------------------------------------------------------------------

handleLocked('notes:create', async (_event, name: string) => {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Note name is required.');
  const notes = await getNotes();
  const now = Date.now();
  const note: NoteFile = {
    id: randomUUID(),
    name: trimmed,
    content: '',
    createdAt: now,
    updatedAt: now,
  };
  await saveNotes([note, ...notes]);
  return snapshot();
});

handleLocked('notes:rename', async (_event, id: string, name: string) => {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Note name cannot be empty.');
  const notes = await getNotes();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx < 0) throw new Error('Note not found.');
  notes[idx] = { ...notes[idx], name: trimmed, updatedAt: Date.now() };
  await saveNotes(notes);
  return snapshot();
});

handleLocked('notes:update', async (_event, id: string, content: string) => {
  const notes = await getNotes();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx < 0) throw new Error('Note not found.');
  notes[idx] = { ...notes[idx], content, updatedAt: Date.now() };
  await saveNotes(notes);
  return snapshot();
});

handleLocked('notes:append', async (_event, id: string, snippet: string) => {
  const trimmed = (snippet || '').trim();
  if (!trimmed) return snapshot();
  const notes = await getNotes();
  const idx = notes.findIndex((n) => n.id === id);
  if (idx < 0) throw new Error('Note not found.');
  const sep = notes[idx].content ? '\n' : '';
  const ts = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  notes[idx] = {
    ...notes[idx],
    content: notes[idx].content + sep + `[${ts}] ${trimmed}`,
    updatedAt: Date.now(),
  };
  await saveNotes(notes);
  return snapshot();
});

handleLocked('notes:delete', async (_event, id: string) => {
  const notes = await getNotes();
  await saveNotes(notes.filter((n) => n.id !== id));
  return snapshot();
});

ipcMain.handle('notes:export', async (_event, id: string) => {
  const notes = await getNotes();
  const note = notes.find((n) => n.id === id);
  if (!note) return { ok: false, error: 'Note not found.' };
  const result = await dialog.showSaveDialog({
    title: 'Export Note',
    defaultPath: path.join(app.getPath('desktop'), `${note.name}.txt`),
    filters: [{ name: 'Text Files', extensions: ['txt'] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, error: 'Cancelled.' };
  await fs.writeFile(result.filePath, note.content, 'utf8');
  return { ok: true };
});

// ---------------------------------------------------------------------------
// Floating Overlay IPC Handlers
// ---------------------------------------------------------------------------

ipcMain.handle('overlay:show', async () => {
  await showOverlayWindow();
  return { ok: true };
});

ipcMain.handle('overlay:hide', async () => {
  hideOverlayWindow();
  return { ok: true };
});

ipcMain.handle('overlay:minimize', async () => {
  minimizeOverlayWindow();
  return { ok: true };
});

ipcMain.handle('notes:get-active', async () => {
  const notes = await getNotes();
  const settings = await getSettings();
  let active = notes.find((n) => n.id === settings.activeNoteId) ?? notes[0];
  if (!active) {
    const now = Date.now();
    active = {
      id: randomUUID(),
      name: 'Quick Notes',
      content: '',
      createdAt: now,
      updatedAt: now,
    };
    notes.unshift(active);
    settings.activeNoteId = active.id;
    await saveNotes(notes);
    await writeJson(settingsFile(), settings);
  }
  return {
    activeId: active.id,
    activeName: active.name,
    notes: notes.map((n) => ({ id: n.id, name: n.name })),
  };
});

handleLocked('notes:set-active', async (_event, id: string) => {
  const settings = await getSettings();
  settings.activeNoteId = id;
  await writeJson(settingsFile(), settings);
  return { ok: true };
});

handleLocked('notes:append-active', async (_event, snippet: string, targetId?: string) => {
  const trimmed = (snippet || '').trim();
  if (!trimmed) return { ok: false, error: 'Snippet cannot be empty.' };
  const notes = await getNotes();
  const settings = await getSettings();
  const noteId = targetId || settings.activeNoteId;
  let active = notes.find((n) => n.id === noteId);

  if (!active) {
    if (notes.length > 0) {
      active = notes[0];
    } else {
      const now = Date.now();
      active = {
        id: randomUUID(),
        name: 'Quick Notes',
        content: '',
        createdAt: now,
        updatedAt: now,
      };
      notes.unshift(active);
    }
    settings.activeNoteId = active.id;
    await writeJson(settingsFile(), settings);
  }

  const sep = active.content ? '\n' : '';
  const ts = new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  active.content = active.content + sep + `[${ts}] ${trimmed}`;
  active.updatedAt = Date.now();
  await saveNotes(notes);

  mainWindow?.webContents.send('snapshot:updated');

  return { ok: true, noteName: active.name };
});

