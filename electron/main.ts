import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, nativeImage, shell, Tray } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as cp from 'node:child_process';
import { loadState, saveState } from './store';
import type { SenkuState } from './types';

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// Dev environment isolation
if (!app.isPackaged) {
  app.setName('senku-dev');
  app.setPath('userData', path.join(app.getPath('appData'), 'senku-dev'));
}

// Single instance lock
const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function toggleWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
  } else {
    showWindow();
  }
}

function createWindow() {
  const state = loadState();
  const savedBounds = state.settings?.windowBounds;

  const defaultWidth = 960;
  const defaultHeight = 620;
  const initialWidth = savedBounds?.width || defaultWidth;
  const initialHeight = savedBounds?.height || defaultHeight;

  mainWindow = new BrowserWindow({
    width: initialWidth,
    height: initialHeight,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 880,
    minHeight: 560,
    icon: path.join(__dirname, '../../assets/senku.ico'),
    frame: false,
    backgroundColor: '#0c0e12',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });

  if (savedBounds?.maximized) {
    mainWindow.maximize();
  }

  // Save bounds on resize/move
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const isMax = mainWindow.isMaximized();
    const b = isMax ? mainWindow.getNormalBounds() : mainWindow.getBounds();
    saveState({
      settings: {
        ...state.settings,
        windowBounds: {
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          maximized: isMax,
        },
      },
    });
  };

  let boundsTimer: NodeJS.Timeout | null = null;
  const scheduleSaveBounds = () => {
    if (boundsTimer) clearTimeout(boundsTimer);
    boundsTimer = setTimeout(saveBounds, 500);
  };

  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('senku:window-maximized-change', true);
    scheduleSaveBounds();
  });

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('senku:window-maximized-change', false);
    scheduleSaveBounds();
  });

  mainWindow.on('resize', scheduleSaveBounds);
  mainWindow.on('move', scheduleSaveBounds);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow?.hide();
    }
  });
}

// ---------------------------------------------------------------------------
// Global Logs Storage
// ---------------------------------------------------------------------------

function getLogsFilePath(): string {
  const dir = path.join(app.getPath('documents'), 'Senku Notes');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'logs.md');
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '# Senku Work Logs\n\n', 'utf8');
  }
  return file;
}

function readLogsContent(): string {
  try {
    const file = getLogsFilePath();
    return fs.readFileSync(file, 'utf8');
  } catch (err) {
    console.error('[readLogs]', err);
    return '';
  }
}

function appendLogEntry(text: string): boolean {
  try {
    const file = getLogsFilePath();
    let content = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '# Senku Work Logs\n\n';

    const now = new Date();
    const todayHeader = `## ${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;
    const line = `- ${timeStr} ${text.trim()}\n`;

    if (content.includes(todayHeader)) {
      const parts = content.split(todayHeader);
      content = parts[0] + todayHeader + '\n' + line + parts[1].replace(/^\n*/, '');
    } else {
      content = content.replace(/^(#\s+Senku\s+Work\s+Logs\s*\n+)?/, `# Senku Work Logs\n\n${todayHeader}\n${line}\n`);
    }

    fs.writeFileSync(file, content, 'utf8');
    return true;
  } catch (err) {
    console.error('[appendLog]', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Shell & OS Actions
// ---------------------------------------------------------------------------

function launchCode(targetFolder: string): { ok: boolean; error?: string } {
  try {
    cp.exec(`code "${targetFolder}"`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function launchTerminal(targetFolder: string): { ok: boolean; error?: string } {
  try {
    let folder = targetFolder;
    try {
      const stat = fs.statSync(targetFolder);
      if (!stat.isDirectory()) folder = path.dirname(targetFolder);
    } catch {}

    const child = cp.spawn('wt', ['-d', folder], { shell: true, detached: true, stdio: 'ignore' });
    child.on('error', () => {
      cp.spawn('powershell', ['-NoExit', '-Command', `Set-Location '${folder}'`], {
        shell: true,
        detached: true,
        stdio: 'ignore',
      }).unref();
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function openPathFolder(targetPath: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const error = await shell.openPath(targetPath);
    return { ok: !error, error: error || undefined };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// App Lifecycle & IPC
// ---------------------------------------------------------------------------

app.whenReady().then(() => {
  createWindow();

  // Tray
  try {
    const iconPath = path.join(__dirname, '../../assets/senku.ico');
    if (fs.existsSync(iconPath)) {
      tray = new Tray(nativeImage.createFromPath(iconPath));
      tray.setToolTip('Senku Reborn');
      tray.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Show Senku', click: showWindow },
          { type: 'separator' },
          {
            label: 'Quit',
            click: () => {
              isQuitting = true;
              app.quit();
            },
          },
        ]),
      );
      tray.on('click', showWindow);
    }
  } catch (err) {
    console.warn('[tray] Failed to initialize tray:', err);
  }

  // Global hotkey
  globalShortcut.register('CommandOrControl+Alt+Space', () => {
    toggleWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('senku:get-state', () => loadState());

ipcMain.handle('senku:save-state', (_event, patch: Partial<SenkuState>) => saveState(patch));

ipcMain.handle('senku:get-app-paths', () => ({
  userData: app.getPath('userData'),
  documents: app.getPath('documents'),
  home: app.getPath('home'),
}));

ipcMain.handle('senku:read-logs', () => readLogsContent());

ipcMain.handle('senku:append-log', (_event, text: string) => appendLogEntry(text));

ipcMain.handle('senku:get-logs-path', () => getLogsFilePath());

ipcMain.handle('senku:open-folder', (_event, folderPath: string) => openPathFolder(folderPath));

ipcMain.handle('senku:open-terminal', (_event, folderPath: string) => launchTerminal(folderPath));

ipcMain.handle('senku:open-code', (_event, folderPath: string) => launchCode(folderPath));

ipcMain.handle('senku:open-url', async (_event, url: string) => {
  try {
    await shell.openExternal(url);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('senku:pick-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle('senku:read-note', (_event, filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf8');
    }
    return '';
  } catch (err) {
    console.error('[note:read]', err);
    return '';
  }
});

ipcMain.handle('senku:write-note', (_event, filePath: string, content: string) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (err) {
    console.error('[note:write]', err);
    return false;
  }
});

function renameSpaceNotesDir(oldName: string, newName: string): boolean {
  try {
    const docs = app.getPath('documents');
    const base = path.join(docs, 'Senku Notes', 'spaces');
    const safeOld = oldName.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'default';
    const safeNew = newName.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'default';
    if (safeOld === safeNew) return true;
    const oldDir = path.join(base, safeOld);
    const newDir = path.join(base, safeNew);
    if (fs.existsSync(oldDir)) {
      if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
      fs.renameSync(oldDir, newDir);
      return true;
    }
    return true;
  } catch (err) {
    console.error('[renameSpaceNotesDir]', err);
    return false;
  }
}

function trashSpaceNotesDir(spaceName: string): boolean {
  try {
    const docs = app.getPath('documents');
    const safeName = spaceName.replace(/[/\\?%*:|"<>]/g, '_').trim() || 'default';
    const sourceDir = path.join(docs, 'Senku Notes', 'spaces', safeName);
    const trashBase = path.join(docs, 'Senku Notes', 'trash');

    if (!fs.existsSync(sourceDir)) {
      return true;
    }

    if (!fs.existsSync(trashBase)) {
      fs.mkdirSync(trashBase, { recursive: true });
    }

    let targetDir = path.join(trashBase, safeName);
    if (fs.existsSync(targetDir)) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      targetDir = path.join(trashBase, `${safeName}_${stamp}`);
    }

    fs.renameSync(sourceDir, targetDir);
    return true;
  } catch (err) {
    console.error('[trashSpaceNotesDir]', err);
    return false;
  }
}

ipcMain.handle('senku:rename-space-notes-dir', (_event, oldName: string, newName: string) => renameSpaceNotesDir(oldName, newName));
ipcMain.handle('senku:delete-space-notes-dir', (_event, spaceName: string) => trashSpaceNotesDir(spaceName));
ipcMain.handle('senku:trash-space-notes-dir', (_event, spaceName: string) => trashSpaceNotesDir(spaceName));

ipcMain.on('senku:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.handle('senku:toggle-maximize', () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
    return false;
  } else {
    mainWindow.maximize();
    return true;
  }
});

ipcMain.handle('senku:is-maximized', () => {
  return mainWindow?.isMaximized() ?? false;
});

ipcMain.on('senku:close', () => {
  mainWindow?.hide();
});
