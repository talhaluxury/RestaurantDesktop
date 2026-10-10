const { app, BrowserWindow, ipcMain, shell, Menu } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// The UI is served from a tiny local web server (instead of file://) so that Firebase
// sign-in works reliably and the login is remembered between launches (same origin every time).
const PORT = 47831;
const APP_DIR = path.join(__dirname, 'app');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2'
};

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      try {
        let rel = decodeURIComponent((req.url || '/').split('?')[0]);
        if (rel === '/') rel = '/index.html';
        const file = path.normalize(path.join(APP_DIR, rel));
        if (!file.startsWith(APP_DIR)) { res.writeHead(403); return res.end(); }
        fs.readFile(file, (err, data) => {
          if (err) { res.writeHead(404); return res.end('Not found'); }
          res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
          res.end(data);
        });
      } catch (e) { res.writeHead(500); res.end(); }
    });
    server.once('error', () => {
      // Fixed port busy -> fall back to any free port (login will not be remembered in that rare case).
      server.listen(0, '127.0.0.1', () => resolve(server.address().port));
    });
    server.listen(PORT, '127.0.0.1', () => resolve(PORT));
  });
}

let win;
async function createWindow() {
  const port = await startServer();
  win = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#070B12',
    title: 'Restaurant POS',
    icon: path.join(__dirname, 'build', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required' // new-order alert sound must play without a click
    }
  });
  win.loadURL(`http://localhost:${port}/`);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.on('closed', () => { win = null; });
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); });
  app.on('window-all-closed', () => app.quit());
}

ipcMain.handle('get-printers', async () => {
  try { return await win.webContents.getPrintersAsync(); } catch (e) { return []; }
});

ipcMain.handle('print-html', async (_e, { html, silent, deviceName }) => {
  return new Promise((resolve) => {
    const w = new BrowserWindow({ show: false, webPreferences: { offscreen: false } });
    w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    w.webContents.once('did-finish-load', () => {
      const opts = { silent: !!silent, printBackground: false, margins: { marginType: 'none' } };
      if (silent && deviceName) opts.deviceName = deviceName;
      w.webContents.print(opts, (ok, reason) => { resolve({ ok, reason }); setTimeout(() => w.destroy(), 500); });
    });
  });
});

ipcMain.handle('open-external', (_e, url) => {
  if (/^https?:/i.test(url)) shell.openExternal(url);
});
