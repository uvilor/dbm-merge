import { app, BrowserWindow, shell } from 'electron';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { registerIpcHandlers } from './ipc';

const mainDir = path.dirname(fileURLToPath(import.meta.url));

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'dist')
  : path.join(mainDir, '../../dist');

function resolvePreloadPath(): string {
  const preloadDir = app.isPackaged
    ? path.join(process.resourcesPath, 'dist', 'preload')
    : path.join(mainDir, '../preload');
  const extensions = ['.mjs', '.cjs', '.js'];

  for (const ext of extensions) {
    const candidate = path.join(preloadDir, `index${ext}`);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to locate preload script in ${preloadDir}`);
}

registerIpcHandlers();

function createWindow() {
  const preloadPath = resolvePreloadPath();

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
    title: 'SchemaSync',
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RESOURCES_PATH, 'renderer/index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
