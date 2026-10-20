import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
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
import {
  writeFileAtomic,
  sanitizeFileName,
  uniqueName,
  listNotes,
  createNote,
  updateNote,
  renameNote,
  appendToNote,
  deleteNote,
  restoreNote,
  listLog,
  addLog,
  deleteLog,
  restoreLog,
  readLaunchpads,
  writeLaunchpads,
  readSpaceMeta,
  writeSpaceMeta,
  migrateLegacy,
} from './storage';

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

const baseDir = () => app.getPath('userData');
const settingsFile = () => path.join(baseDir(), 'settings.json');
const workspacesFile = () => path.join(baseDir(), 'workspaces.json');
const trashFile = () => path.join(baseDir(), 'trash.json');
const spaceDir = (id: string) => path.join(baseDir(), 'spaces', id);
const trashSpaceDir = (id: string) => path.join(baseDir(), 'trash', id);

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
  const current = await readJson<Settings | null>(settingsFile(), null);
  if (current) return current;
  const legacy = await readJson<Settings | null>(path.join(baseDir(), 'data', 'settings.json'), null);
  return legacy ?? defaultSettings;
}

async function getWorkspaces(): Promise<Workspace[]> {
  const current = await readJson<Workspace[] | null>(workspacesFile(), null);
  const workspaces = current ?? (await readJson<Workspace[]>(path.join(baseDir(), 'data', 'workspaces.json'), []));
  return workspaces.map((ws) => ({ ...ws, pinnedPaths: ws.pinnedPaths ?? [] }));
}

async function getTrashWorkspaces(): Promise<TrashWorkspace[]> {
  const current = await readJson<TrashWorkspace[] | null>(trashFile(), null);
  if (current) return current;
  return readJson<TrashWorkspace[]>(path.join(baseDir(), 'data', 'trash-workspaces.json'), []);
}

async function saveTrashWorkspaces(items: TrashWorkspace[]): Promise<void> {
  await writeJson(trashFile(), items);
}

async function activeSpaceId(): Promise<string | null> {
  const workspaces = await getWorkspaces();
  if (workspaces.length === 0) return null;
  const settings = await getSettings();
  if (settings.activeWorkspaceId && workspaces.some((ws) => ws.id === settings.activeWorkspaceId)) {
    return settings.activeWorkspaceId;
  }
  return workspaces[0].id;
}

async function moveFolder(src: string, dest: string): Promise<void> {
  try {
    await fs.access(src);
  } catch {
    return;
  }
  await fs.mkdir(path.dirname(dest), { recursive: true });
  try {
    await fs.rename(src, dest);
  } catch (err: any) {
    if (err?.code === 'EXDEV' || err?.code === 'EPERM' || err?.code === 'EBUSY') {
      await fs.cp(src, dest, { recursive: true });
      await fs.rm(src, { recursive: true, force: true }).catch(() => undefined);
    } else {
      throw err;
    }
  }
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
    await Promise.all(
      workspaces.map(async (workspace) => {
        return [workspace.id, await isDirectoryCached(workspace.id, workspace.masterFolder)] as const;
      }),
    ),
  );
  const spaceId = await activeSpaceId();
  const workspace = spaceId ? getWorkspace(workspaces, spaceId) : null;
  const trashWorkspaces = await getTrashWorkspaces();

  let logEntries: LogEntry[] = [];
  let launchpads: Launchpad[] = [];
  let notes: NoteFile[] = [];
  let activeNoteId: string | undefined = undefined;

  if (spaceId) {
    const spaceNotesDir = path.join(spaceDir(spaceId), 'notes');
    const spaceLogDir = path.join(spaceDir(spaceId), 'log');
    const spaceLaunchpadsFile = path.join(spaceDir(spaceId), 'launchpads.json');
    const spaceMetaFile = path.join(spaceDir(spaceId), 'meta.json');

    const [lEntries, lPads, nList, meta] = await Promise.all([
      listLog(spaceLogDir),
      readLaunchpads(spaceLaunchpadsFile),
      listNotes(spaceNotesDir),
      readSpaceMeta(spaceMetaFile),
    ]);

    logEntries = lEntries;
    launchpads = lPads;
    notes = nList;

    if (meta.activeNoteId && notes.some((n) => n.id === meta.activeNoteId)) {
      activeNoteId = meta.activeNoteId;
    } else if (notes.length > 0) {
      activeNoteId = notes[0].id;
    }
  }

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
      activeNoteId,
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
    activeNoteId,
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
    height: 48,
    minWidth: 480,
    maxWidth: 480,
    minHeight: 48,
    maxHeight: 48,
    frame: false,
    backgroundColor: '#f5f2ea',
    alwaysOnTop: true,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  overlayWindow.on('maximize', () => {
    overlayWindow?.unmaximize();
  });
  overlayWindow.on('will-resize', (event) => {
    event.preventDefault();
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
  if (win.isMaximized()) {
    win.unmaximize();
  }
  win.setSize(480, 48);
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

function toggleOverlayWindow(): void {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.isVisible() && overlayWindow.isFocused()) {
    hideOverlayWindow();
  } else {
    void showOverlayWindow();
  }
}

// ---------------------------------------------------------------------------
// One-time legacy migration
// ---------------------------------------------------------------------------

async function migrateLegacyData(): Promise<void> {
  const userData = baseDir();
  const markerFile = path.join(userData, 'storage-version.json');
  try {
    await fs.access(markerFile);
    return; // Already migrated
  } catch {
    // Proceed
  }

  const workspaces = await getWorkspaces();
  if (workspaces.length === 0) {
    return; // Zero spaces -> do nothing, do not write marker
  }

  const settings = await getSettings();
  const activeId = await activeSpaceId();

  // Backup first: copy legacy data files into <userData>/backup-before-md/
  const backupDir = path.join(userData, 'backup-before-md');
  await fs.mkdir(backupDir, { recursive: true });

  const candidateDirs = [path.join(userData, 'data'), userData];
  const legacyFiles = [
    'notes.json',
    'log.json',
    'launchpads.json',
    'trash-workspaces.json',
    'workspaces.json',
    'settings.json',
  ];

  for (const dir of candidateDirs) {
    for (const file of legacyFiles) {
      const src = path.join(dir, file);
      const dest = path.join(backupDir, file);
      try {
        await fs.access(src);
        const alreadyBackedUp = await fs.access(dest).then(() => true).catch(() => false);
        if (!alreadyBackedUp) {
          await fs.copyFile(src, dest);
        }
      } catch {
        // File does not exist
      }
    }
  }

  // Read legacy data
  let legacyNotes: NoteFile[] = [];
  let legacyLogs: LogEntry[] = [];
  let legacyPads: Launchpad[] = [];

  for (const dir of candidateDirs) {
    if (legacyNotes.length === 0) {
      legacyNotes = await readJson<NoteFile[]>(path.join(dir, 'notes.json'), []);
    }
    if (legacyLogs.length === 0) {
      legacyLogs = await readJson<LogEntry[]>(path.join(dir, 'log.json'), []);
    }
    if (legacyPads.length === 0) {
      legacyPads = await readJson<Launchpad[]>(path.join(dir, 'launchpads.json'), []);
    }
  }

  await migrateLegacy(
    userData,
    {
      notes: legacyNotes,
      logEntries: legacyLogs,
      launchpads: legacyPads,
      legacyActiveNoteId: settings.activeNoteId,
    },
    workspaces,
    activeId,
  );
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

  try {
    await migrateLegacyData();
  } catch (err) {
    console.error('Migration failed:', err);
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

app.on('will-quit', () => {
  // Global shortcuts cleanup
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

  // Move spaces/<id> -> trash/<id>
  await moveFolder(spaceDir(id), trashSpaceDir(id));

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

  // Move trash/<id> -> spaces/<id>
  await moveFolder(trashSpaceDir(id), spaceDir(id));

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
    await fs.rm(trashSpaceDir(id), { recursive: true, force: true }).catch(() => undefined);
  } else {
    for (const t of trash) {
      await fs.rm(trashSpaceDir(t.id), { recursive: true, force: true }).catch(() => undefined);
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
  const workspaces = await getWorkspaces();
  const targetSpaceId = spaceId && workspaces.some((w) => w.id === spaceId) ? spaceId : await activeSpaceId();
  if (!targetSpaceId) throw new Error('Create a Space first.');

  const trimmed = (text || '').trim();
  if (!trimmed) return snapshot();

  const spaceLogDir = path.join(spaceDir(targetSpaceId), 'log');
  await addLog(spaceLogDir, trimmed);
  mainWindow?.webContents.send('snapshot:updated');
  return snapshot();
});

handleLocked('log:delete', async (_event, id: string) => {
  const spaceId = await activeSpaceId();
  if (!spaceId) return snapshot();
  const spaceLogDir = path.join(spaceDir(spaceId), 'log');
  await deleteLog(spaceLogDir, id);
  return snapshot();
});

handleLocked('log:restore', async (_event, entry: LogEntry) => {
  const spaceId = await activeSpaceId();
  if (!spaceId || !entry || !entry.id) return snapshot();
  const spaceLogDir = path.join(spaceDir(spaceId), 'log');
  await restoreLog(spaceLogDir, entry);
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
  const workspaces = await getWorkspaces();
  const targetSpaceId = spaceId && workspaces.some((w) => w.id === spaceId) ? spaceId : await activeSpaceId();
  if (!targetSpaceId) throw new Error('Create a Space first.');

  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Launchpad name is required.');

  const padFile = path.join(spaceDir(targetSpaceId), 'launchpads.json');
  const pads = await readLaunchpads(padFile);
  const pad: Launchpad = {
    id: randomUUID(),
    name: trimmedName,
    spaceId: targetSpaceId,
    paths: paths.map((p) => p.trim()).filter(Boolean),
    createdAt: Date.now(),
  };
  await writeLaunchpads(padFile, [...pads, pad]);
  return snapshot();
});

handleLocked('launchpad:update', async (_event, id: string, name: string, paths: string[]) => {
  const spaceId = await activeSpaceId();
  if (!spaceId) throw new Error('Create a Space first.');

  const trimmedName = (name || '').trim();
  if (!trimmedName) throw new Error('Launchpad name is required.');

  const padFile = path.join(spaceDir(spaceId), 'launchpads.json');
  const pads = await readLaunchpads(padFile);
  const index = pads.findIndex((p) => p.id === id);
  if (index < 0) throw new Error('Launchpad not found.');
  pads[index] = {
    ...pads[index],
    name: trimmedName,
    paths: paths.map((p) => p.trim()).filter(Boolean),
  };
  await writeLaunchpads(padFile, pads);
  return snapshot();
});

handleLocked('launchpad:delete', async (_event, id: string) => {
  const spaceId = await activeSpaceId();
  if (!spaceId) return snapshot();
  const padFile = path.join(spaceDir(spaceId), 'launchpads.json');
  const pads = await readLaunchpads(padFile);
  await writeLaunchpads(padFile, pads.filter((p) => p.id !== id));
  return snapshot();
});

handleLocked('launchpad:restore', async (_event, pad: Launchpad) => {
  const spaceId = await activeSpaceId();
  if (!spaceId || !pad || !pad.id) return snapshot();
  const padFile = path.join(spaceDir(spaceId), 'launchpads.json');
  const pads = await readLaunchpads(padFile);
  if (pads.some((p) => p.id === pad.id)) return snapshot();
  await writeLaunchpads(padFile, [...pads, pad]);
  return snapshot();
});

ipcMain.handle('launchpad:launch', async (_event, id: string) => {
  const spaceId = await activeSpaceId();
  if (!spaceId) return { ok: false, errors: ['Launchpad not found'] };
  const padFile = path.join(spaceDir(spaceId), 'launchpads.json');
  const pads = await readLaunchpads(padFile);
  const pad = pads.find((p) => p.id === id);
  if (!pad) return { ok: false, errors: ['Launchpad not found'] };

  const validPaths = (pad.paths || []).map((p) => p.trim()).filter(Boolean);
  const errors: string[] = [];
  for (let i = 0; i < validPaths.length; i++) {
    const target = validPaths[i];
    const res = await openSingleItem(target);
    if (!res.ok && res.error) errors.push(`${target}: ${res.error}`);
    if (i < validPaths.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }
  return { ok: errors.length === 0, errors };
});

ipcMain.handle('path:open-item', async (_event, target: string) => {
  return openSingleItem(target);
});

ipcMain.handle('path:exists-many', async (_event, paths: string[]) => {
  const result: Record<string, 'file' | 'folder' | 'missing'> = {};
  if (!Array.isArray(paths)) return result;
  await Promise.all(
    paths.map(async (p) => {
      try {
        const stat = await fs.stat(p);
        result[p] = stat.isDirectory() ? 'folder' : 'file';
      } catch {
        result[p] = 'missing';
      }
    }),
  );
  return result;
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
  const spaceId = await activeSpaceId();
  if (!spaceId) throw new Error('Create a Space first.');
  const trimmed = (name || '').trim();
  if (!trimmed) throw new Error('Note name is required.');

  const spaceNotesDir = path.join(spaceDir(spaceId), 'notes');
  const note = await createNote(spaceNotesDir, trimmed);

  const spaceMetaFile = path.join(spaceDir(spaceId), 'meta.json');
  const meta = await readSpaceMeta(spaceMetaFile);
  await writeSpaceMeta(spaceMetaFile, { ...meta, activeNoteId: note.id });

  return snapshot();
});

handleLocked('notes:rename', async (_event, id: string, name: string) => {
  const spaceId = await activeSpaceId();
  if (!spaceId) throw new Error('Create a Space first.');

  const spaceNotesDir = path.join(spaceDir(spaceId), 'notes');
  const spaceMetaFile = path.join(spaceDir(spaceId), 'meta.json');
  const newId = await renameNote(spaceNotesDir, id, name);

  const meta = await readSpaceMeta(spaceMetaFile);
  if (meta.activeNoteId === id) {
    await writeSpaceMeta(spaceMetaFile, { ...meta, activeNoteId: newId });
  }

  const snap = await snapshot();
  return { snapshot: snap, id: newId };
});

handleLocked('notes:update', async (_event, id: string, content: string) => {
  const spaceId = await activeSpaceId();
  if (!spaceId) throw new Error('Create a Space first.');

  const spaceNotesDir = path.join(spaceDir(spaceId), 'notes');
  await updateNote(spaceNotesDir, id, content);
  return snapshot();
});

handleLocked('notes:append', async (_event, id: string, snippet: string) => {
  const spaceId = await activeSpaceId();
  if (!spaceId) throw new Error('Create a Space first.');

  const trimmed = (snippet || '').trim();
  if (!trimmed) return snapshot();

  const spaceNotesDir = path.join(spaceDir(spaceId), 'notes');
  await appendToNote(spaceNotesDir, id, trimmed);
  return snapshot();
});

handleLocked('notes:delete', async (_event, id: string) => {
  const spaceId = await activeSpaceId();
  if (!spaceId) return snapshot();

  const spaceNotesDir = path.join(spaceDir(spaceId), 'notes');
  await deleteNote(spaceNotesDir, id);

  const spaceMetaFile = path.join(spaceDir(spaceId), 'meta.json');
  const meta = await readSpaceMeta(spaceMetaFile);
  if (meta.activeNoteId === id) {
    const remaining = await listNotes(spaceNotesDir);
    await writeSpaceMeta(spaceMetaFile, { ...meta, activeNoteId: remaining[0]?.id });
  }

  return snapshot();
});

handleLocked('notes:restore', async (_event, note: NoteFile) => {
  const spaceId = await activeSpaceId();
  if (!spaceId || !note || !note.id) return snapshot();

  const spaceNotesDir = path.join(spaceDir(spaceId), 'notes');
  await restoreNote(spaceNotesDir, note);
  return snapshot();
});

ipcMain.handle('notes:export', async (_event, id: string) => {
  const spaceId = await activeSpaceId();
  if (!spaceId) return { ok: false, error: 'Create a Space first.' };

  const spaceNotesDir = path.join(spaceDir(spaceId), 'notes');
  const notes = await listNotes(spaceNotesDir);
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
  const spaceId = await activeSpaceId();
  if (!spaceId) {
    return {
      activeId: '',
      activeName: '',
      workspaceId: undefined,
      notes: [],
    };
  }

  const spaceNotesDir = path.join(spaceDir(spaceId), 'notes');
  const spaceMetaFile = path.join(spaceDir(spaceId), 'meta.json');
  const notes = await listNotes(spaceNotesDir);
  const meta = await readSpaceMeta(spaceMetaFile);
  let active = notes.find((n) => n.id === meta.activeNoteId) ?? notes[0];

  if (!active) {
    active = await createNote(spaceNotesDir, 'Quick Notes');
    notes.unshift(active);
    await writeSpaceMeta(spaceMetaFile, { ...meta, activeNoteId: active.id });
  }

  return {
    activeId: active.id,
    activeName: active.name,
    workspaceId: spaceId,
    notes: notes.map((n) => ({ id: n.id, name: n.name })),
  };
});

handleLocked('notes:set-active', async (_event, id: string) => {
  const spaceId = await activeSpaceId();
  if (!spaceId) return { ok: false };

  const spaceMetaFile = path.join(spaceDir(spaceId), 'meta.json');
  const meta = await readSpaceMeta(spaceMetaFile);
  await writeSpaceMeta(spaceMetaFile, { ...meta, activeNoteId: id });
  return { ok: true };
});

handleLocked('notes:append-active', async (_event, snippet: string, targetId?: string) => {
  const spaceId = await activeSpaceId();
  if (!spaceId) return { ok: false, error: 'Create a Space first.' };

  const trimmed = (snippet || '').trim();
  if (!trimmed) return { ok: false, error: 'Snippet cannot be empty.' };

  const spaceNotesDir = path.join(spaceDir(spaceId), 'notes');
  const spaceMetaFile = path.join(spaceDir(spaceId), 'meta.json');
  const notes = await listNotes(spaceNotesDir);
  const meta = await readSpaceMeta(spaceMetaFile);
  const noteId = targetId || meta.activeNoteId;
  let active = notes.find((n) => n.id === noteId);

  if (!active) {
    if (notes.length > 0) {
      active = notes[0];
    } else {
      active = await createNote(spaceNotesDir, 'Quick Notes');
      notes.unshift(active);
    }
    await writeSpaceMeta(spaceMetaFile, { ...meta, activeNoteId: active.id });
  }

  await appendToNote(spaceNotesDir, active.id, trimmed);
  mainWindow?.webContents.send('snapshot:updated');

  return { ok: true, noteName: active.name };
});

