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
    loader: "Forge",
    path: rootPath 
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
        configs: relatedConfigs, 
        scripts: relatedScripts  
      });
    }

    return { 
      mods: modsData, 
      info: modpackInfo, 
      rootFiles: itemsInRoot 
    };
    
  } catch (err) {
    console.error("Error en el escaneo:", err);
    return null;
  }
}

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

  // --- 1. RUTA DEL BOT DE IA ---
  ipcMain.handle('ask-bot', async (event, contextData, userMessage) => {
    try {
      const promptText = `
        Eres 'Modpack Assist', el cerebro de Inteligencia Artificial integrado en un IDE de modding para Minecraft.
        
        CONTEXTO DEL ENTORNO ACTUAL:
        - Nombre del Modpack: ${contextData.packName}
        - Versión de Minecraft: ${contextData.mcVersion}
        - Archivos en la raíz: ${contextData.rootFilesList}
        - Lista de Mods Instalados: ${contextData.modNames}
        - Archivos de Configuración Detectados: ${contextData.configFiles}

        BASE DE CONOCIMIENTO Y REGLAS:
        1. Eres un experto absoluto en todos los mods listados para la versión específica ${contextData.mcVersion}.
        2. REGLA DE ÉPOCA: Jamás inventes mecánicas de versiones modernas en versiones antiguas. Por ejemplo, en la 1.12.2 NO existen los 'datapacks'; las configuraciones SIEMPRE están en la carpeta 'config/' y suelen ser archivos .cfg.
        3. NO ALUCINES: Si el usuario pregunta por un mod, verifica en la 'Lista de Mods Instalados' si realmente lo tiene. Si busca una configuración, busca el nombre exacto en los 'Archivos de Configuración Detectados'.
        4. Tono: Técnico, directo de ingeniero a ingeniero. RESPONDE SIEMPRE EN ESPAÑOL.

        SISTEMA DE ACCIONES AUTOMATIZADAS (INTERFAZ):
        Si el usuario te pide abrir, buscar o editar una configuración, incluye UNA ÚNICA etiqueta de comando AL FINAL de tu respuesta:
        - Para abrir archivos: [ACCION: ABRIR | nombre_del_archivo.cfg]
        - Para buscar texto dentro de los configs: [ACCION: BUSCAR_TEXTO | palabra_clave]
        - Para editar un archivo: [ACCION: EDITAR | nombre_del_archivo.cfg | linea_vieja_exacta | linea_nueva_reemplazo]
        
        REGLA VITAL PARA EDITAR: NUNCA intentes usar la acción EDITAR si no estás 100% seguro de cómo está escrita la línea en el archivo original. Si no lo sabes, primero usa BUSCAR_TEXTO, analiza el resultado, y en tu SIGUIENTE respuesta usa EDITAR.

        Si no requiere acción, no incluyas ninguna etiqueta.

        Mensaje del usuario: "${userMessage}"
      `;

      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'llama3.1', 
          prompt: promptText,
          stream: false 
        })
      });

      if (!response.ok) throw new Error("Error en el servidor local de Ollama");

      const data = await response.json();
      return data.response;
      
    } catch (error) {
      console.error("Error en la IA Local:", error);
      return "Hubo un error al conectar con Ollama. ¿Asegúrate de que la aplicación de Ollama está abierta en tu computadora y que descargaste el modelo con 'ollama run llama3.1'?";
    }
  });

  // --- 2. RUTA PARA ABRIR ARCHIVOS ---
  ipcMain.handle('open-file', async (event, fileName, packPath) => {
    try {
      const targetPath = path.join(packPath, 'config', fileName);
      const { shell } = require('electron');
      await shell.openPath(targetPath);
      return true;
    } catch (err) {
      console.error("Error abriendo archivo:", err);
      return false;
    }
  });

  // --- 3. RUTA PARA BUSCAR TEXTO ---
  ipcMain.handle('search-configs', async (event, searchTerm, packPath) => {
    try {
      const configPath = path.join(packPath, 'config');
      const files = await fs.readdir(configPath);
      const cfgFiles = files.filter(f => f.endsWith('.cfg') || f.endsWith('.toml'));
      
      let results = [];

      for (const file of cfgFiles) {
        const filePath = path.join(configPath, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(searchTerm.toLowerCase())) {
            results.push(`[Archivo: ${file}, Línea: ${i+1}] ${lines[i].trim()}`);
          }
        }
      }

      if (results.length === 0) return "No se encontraron resultados para: " + searchTerm;
      return results.slice(0, 20).join('\n'); 
    } catch (err) {
      console.error("Error buscando en archivos:", err);
      return "Hubo un error de lectura en el disco.";
    }
  });

  // --- 4. RUTA PARA EDITAR ARCHIVOS ---
  ipcMain.handle('edit-file', async (event, fileName, packPath, oldText, newText) => {
    try {
      const filePath = path.join(packPath, 'config', fileName);
      let content = await fs.readFile(filePath, 'utf-8');
      
      if (!content.includes(oldText)) {
        return { success: false, message: `Error: No pude encontrar la línea exacta "${oldText}" en el archivo.` };
      }

      content = content.replace(oldText, newText);
      await fs.writeFile(filePath, content, 'utf-8');
      
      return { success: true, message: `¡Éxito! Se ha modificado ${fileName}.` };
    } catch (err) {
      console.error("Error editando archivo:", err);
      return { success: false, message: "Error crítico al intentar escribir en el disco." };
    }
  });

  createWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });