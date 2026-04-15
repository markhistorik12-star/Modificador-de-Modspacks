// preload.cjs
const { contextBridge, ipcRenderer } = require('electron');

// Exponemos una API segura al mundo de React
contextBridge.exposeInMainWorld('electronAPI', {
  // Escáner y Chat (¡AQUÍ ESTÁ EL CAMBIO PRINCIPAL!)
  scanMods: (path) => ipcRenderer.invoke('dialog:openFolder', path),
  askBot: (contextData, userMessage) => ipcRenderer.invoke('ask-bot', contextData, userMessage),
  
  // Herramientas de Búsqueda y Lectura
  openFile: (fileName, packPath) => ipcRenderer.invoke('open-file', fileName, packPath),
  searchConfigs: (searchTerm, packPath) => ipcRenderer.invoke('search-configs', searchTerm, packPath),
  readFile: (fileName, packPath) => ipcRenderer.invoke('read-file', fileName, packPath),
  readLines: (fileName, packPath, startLine, endLine) => ipcRenderer.invoke('read-lines', fileName, packPath, startLine, endLine),
  
  // Herramientas de Edición
  editFile: (fileName, packPath, oldText, newText) => ipcRenderer.invoke('edit-file', fileName, packPath, oldText, newText),
  prependFile: (fileName, packPath, newText) => ipcRenderer.invoke('prepend-file', fileName, packPath, newText),
  appendFile: (fileName, packPath, newText) => ipcRenderer.invoke('append-file', fileName, packPath, newText),
  
  // Herramientas de Sistema
  writeFile: (fileName, packPath, content) => ipcRenderer.invoke('write-file', fileName, packPath, content),
  deleteFile: (fileName, packPath) => ipcRenderer.invoke('delete-file', fileName, packPath),
  renameFile: (oldName, newName, packPath) => ipcRenderer.invoke('rename-file', oldName, newName, packPath),
  readFullFile: (fileName, packPath) => ipcRenderer.invoke('read-full-file', fileName, packPath),
  createProject: (projectData) => ipcRenderer.invoke('create-project', projectData),
  searchModsOnline: (query, loader, sortBy, category) => ipcRenderer.invoke('search-mods-online', query, loader, sortBy, category),
  getModVersions: (projectId, gameVersion, loader) => ipcRenderer.invoke('get-mod-versions', projectId, gameVersion, loader),
  downloadMod: (versionId, packPath) => ipcRenderer.invoke('download-mod', versionId, packPath),
  diagnoseModpack: (packPath) => ipcRenderer.invoke('diagnose-modpack', packPath),
  exportModpack: (packPath, packName) => ipcRenderer.invoke('export-modpack', packPath, packName),
  installModRecursively: (versionId, packVersion, packLoader, packPath) => ipcRenderer.invoke('install-mod-recursively', versionId, packVersion, packLoader, packPath),
  getGameVersions: () => ipcRenderer.invoke('get-game-versions'),
});