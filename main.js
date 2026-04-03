import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';
import toml from '@iarna/toml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function handleFolderOpen() {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Selecciona la carpeta raíz de tu Modpack',
    properties: ['openDirectory']
  });

  if (canceled) return null;

  const rootPath = filePaths[0];
  const itemsInRoot = await fs.readdir(rootPath);
  
  let modsPath = itemsInRoot.includes('mods') ? path.join(rootPath, 'mods') : rootPath;

  // --- 1. ESCANEAR CARPETAS ADICIONALES (Config y Scripts) ---
  let configFiles = [];
  let scriptFiles = [];
  try {
    if (itemsInRoot.includes('config')) {
      configFiles = await fs.readdir(path.join(rootPath, 'config'));
    }
    if (itemsInRoot.includes('scripts')) {
      scriptFiles = await fs.readdir(path.join(rootPath, 'scripts'));
    }
  } catch (e) { console.log("Error leyendo carpetas de apoyo"); }

  // 2. Extraer información global del Modpack
  let modpackInfo = {
    name: path.basename(rootPath),
    gameVersion: "1.12.2",
    loader: "Forge"
  };

  try {
    if (itemsInRoot.includes('minecraftinstance.json')) {
      const data = JSON.parse(await fs.readFile(path.join(rootPath, 'minecraftinstance.json'), 'utf-8'));
      modpackInfo.name = data.name || modpackInfo.name;
      modpackInfo.gameVersion = data.gameVersion || modpackInfo.gameVersion;
      modpackInfo.loader = data.baseModLoader?.name || "Forge";
    } else if (itemsInRoot.includes('manifest.json')) {
      const data = JSON.parse(await fs.readFile(path.join(rootPath, 'manifest.json'), 'utf-8'));
      modpackInfo.name = data.name || modpackInfo.name;
      modpackInfo.gameVersion = data.minecraft?.version || modpackInfo.gameVersion;
    }
  } catch (e) { console.log("No se pudo leer archivo de instancia."); }

  // 3. Escaneo de archivos .jar
  try {
    const files = await fs.readdir(modsPath);
    const jarFiles = files.filter(file => file.endsWith('.jar'));
    const modsData = [];

    for (const file of jarFiles) {
      const filePath = path.join(modsPath, file);
      let modName = file.replace('.jar', '');
      let modVersion = 'Desconocida';
      let modId = modName.toLowerCase().split(/[_\-\s]/)[0]; // ID simplificado para mapeo

      try {
        const zip = new AdmZip(filePath);
        const fabricJson = zip.getEntry('fabric.mod.json');
        const forgeToml = zip.getEntry('META-INF/mods.toml');
        const mcmodInfo = zip.getEntry('mcmod.info');

        if (fabricJson) {
          const data = JSON.parse(zip.readAsText(fabricJson));
          modName = data.name || modName;
          modVersion = data.version || modVersion;
        } 
        else if (forgeToml) {
          const data = toml.parse(zip.readAsText(forgeToml));
          if (data.mods && data.mods[0]) {
            modName = data.mods[0].displayName || modName;
            modVersion = data.mods[0].version || modVersion;
          }
        } 
        else if (mcmodInfo) {
          try {
            let textData = zip.readAsText(mcmodInfo).replace(/\n/g, '').replace(/,(\s*[\]}])/g, '$1');
            const data = JSON.parse(textData);
            const mod = Array.isArray(data) ? data[0] : (data.modList ? data.modList[0] : data);
            modName = mod.name || modName;
            modVersion = mod.version || modVersion;
          } catch(e) {}
        }
      } catch (err) {}

      if (modVersion === 'Desconocida') {
        const versionMatch = file.match(/[_\-\s](v?[\d\.]+[a-zA-Z0-9-]*)\.jar$/i);
        if (versionMatch) {
          modVersion = versionMatch[1];
          modName = modName.replace(versionMatch[0].replace('.jar', ''), '').trim();
        }
      }

      // --- 4. RELACIONAR CONFIGS Y SCRIPTS ---
      // Buscamos archivos que contengan el nombre del mod en su nombre de archivo
      const searchKey = modName.toLowerCase().replace(/\s/g, '');
      const relatedConfigs = configFiles.filter(cfg => 
        cfg.toLowerCase().includes(searchKey) || cfg.toLowerCase().includes(modId)
      );
      const relatedScripts = scriptFiles.filter(scr => 
        scr.toLowerCase().includes(searchKey) || scr.toLowerCase().includes(modId)
      );

      modsData.push({ 
        id: file, 
        name: modName.replace(/[\s\-_]+$/, ''), 
        version: modVersion,
        configs: relatedConfigs, // Ahora el mod lleva sus configs
        scripts: relatedScripts  // Y sus scripts
      });
    }

    return { 
      mods: modsData, 
      info: modpackInfo, 
      rootFiles: itemsInRoot // <-- ESTA LÍNEA ES VITAL
    };
    
  } catch (err) {
    console.error("Error en el escaneo:", err);
    return null;
  }
}

// ... resto del archivo (createWindow, app.on, etc.) se mantiene igual
function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 850, title: "Modpack Assist", autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), 
      nodeIntegration: false, contextIsolation: true
    }
  });
  win.loadURL('http://localhost:5173');
}
app.whenReady().then(() => {
  ipcMain.handle('dialog:openFolder', handleFolderOpen);
  createWindow();
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });