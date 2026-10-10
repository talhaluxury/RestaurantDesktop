const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('desktop', {
  getPrinters: () => ipcRenderer.invoke('get-printers'),
  printHtml: (html, silent, deviceName) => ipcRenderer.invoke('print-html', { html, silent, deviceName }),
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});
