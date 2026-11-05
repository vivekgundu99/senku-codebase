import { contextBridge, ipcRenderer } from 'electron';
import type { SenkuAPI, SenkuState } from './types';

const api: SenkuAPI = {
  getState: () => ipcRenderer.invoke('senku:get-state'),
  saveState: (patch: Partial<SenkuState>) => ipcRenderer.invoke('senku:save-state', patch),
  getAppPaths: () => ipcRenderer.invoke('senku:get-app-paths'),
  readLogs: () => ipcRenderer.invoke('senku:read-logs'),
  appendLog: (text: string) => ipcRenderer.invoke('senku:append-log', text),
  getLogsPath: () => ipcRenderer.invoke('senku:get-logs-path'),
  openFolder: (targetPath: string) => ipcRenderer.invoke('senku:open-folder', targetPath),
  openTerminal: (targetPath: string) => ipcRenderer.invoke('senku:open-terminal', targetPath),
  openCode: (targetPath: string) => ipcRenderer.invoke('senku:open-code', targetPath),
  openUrl: (url: string) => ipcRenderer.invoke('senku:open-url', url),
  pickFolder: () => ipcRenderer.invoke('senku:pick-folder'),
  readNote: (filePath: string) => ipcRenderer.invoke('senku:read-note', filePath),
  writeNote: (filePath: string, content: string) => ipcRenderer.invoke('senku:write-note', filePath, content),
  minimize: () => ipcRenderer.send('senku:minimize'),
  toggleMaximize: () => ipcRenderer.invoke('senku:toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('senku:is-maximized'),
  close: () => ipcRenderer.send('senku:close'),
};

contextBridge.exposeInMainWorld('senku', api);
