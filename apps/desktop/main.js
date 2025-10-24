import { app, BrowserWindow } from 'electron';
import path from 'node:path';
let win;
function createWindow() {
  win = new BrowserWindow({
    width: 1000, height: 700,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  win.loadFile(path.join(process.cwd(), 'apps/desktop', 'index.html'));
}
app.whenReady().then(createWindow);
