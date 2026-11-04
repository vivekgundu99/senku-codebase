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

  mainWindow = new BrowserWindow({
    width: savedBounds?.width || 1280,
    height: savedBounds?.height || 820,
    x: savedBounds?.x,
    y: savedBounds?.y,
    minWidth: 900,
    minHeight: 580,
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

ipcMain.on('senku:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('senku:close', () => {
  mainWindow?.hide();
});
