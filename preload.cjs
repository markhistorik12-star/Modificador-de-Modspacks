// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

// Exponemos una API segura al mundo de React
contextBridge.exposeInMainWorld('electronAPI', {
  // Cuando React llame a scanMods(), el puente enviará el mensaje 'dialog:openFolder' a main.js
  scanMods: () => ipcRenderer.invoke('dialog:openFolder')
});