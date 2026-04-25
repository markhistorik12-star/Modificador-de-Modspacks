const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 1. Escaneo y Creación
  scanMods: (knownPath) => ipcRenderer.invoke('dialog:openFolder', knownPath),
  createProject: (projectData) => ipcRenderer.invoke('create-project', projectData),
  
  // 2. Buscador y Tienda (¡Aquí está el que te daba error!)
  getGameVersions: () => ipcRenderer.invoke('get-game-versions'),
  searchModsOnline: (query, gameVersion, loader, sortBy, category) => ipcRenderer.invoke('search-mods-online', query, gameVersion, loader, sortBy, category),
  getModVersions: (projectId, gameVersion, loader, source) => ipcRenderer.invoke('get-mod-versions', projectId, gameVersion, loader, source),
  
  // 3. Descargas
  downloadMod: (versionObj, packPath) => ipcRenderer.invoke('download-mod', versionObj, packPath),
  installModRecursively: (versionId, gameVersion, loader, packPath) => ipcRenderer.invoke('install-mod-recursively', versionId, gameVersion, loader, packPath),
  
  // 4. Utilidades del Modpack
  diagnoseModpack: (packPath) => ipcRenderer.invoke('diagnose-modpack', packPath),
  exportModpack: (packPath, packName) => ipcRenderer.invoke('export-modpack', packPath, packName),
  
  // 5. Manejo de Archivos Físicos (Eliminar, Leer, Editar)
  deleteFile: (filePath, packPath) => ipcRenderer.invoke('delete-file', filePath, packPath),
  readFile: (filePath, packPath) => ipcRenderer.invoke('read-file', filePath, packPath),
  readFullFile: (filePath, packPath) => ipcRenderer.invoke('read-full-file', filePath, packPath),
  searchConfigs: (searchTerm, packPath) => ipcRenderer.invoke('search-configs', searchTerm, packPath),
  editFile: (filePath, packPath, oldText, newText) => ipcRenderer.invoke('edit-file', filePath, packPath, oldText, newText),
  prependFile: (filePath, packPath, newText) => ipcRenderer.invoke('prepend-file', filePath, packPath, newText),
  appendFile: (filePath, packPath, newText) => ipcRenderer.invoke('append-file', filePath, packPath, newText),
  writeFile: (filePath, packPath, content) => ipcRenderer.invoke('write-file', filePath, packPath, content),

  // 6. Asistente de IA Autónoma
  askBot: (contextData, payloadHistory) => ipcRenderer.invoke('ask-bot', contextData, payloadHistory),
  // Agrega esta línea dentro de tu contextBridge.exposeInMainWorld
  readToml: (filePath) => ipcRenderer.invoke('read-toml', filePath),
  // Agrega esto junto a tus otras funciones en preload.cjs
  openExternalEditor: (filePath, packPath) => ipcRenderer.invoke('open-external-editor', filePath, packPath),
});