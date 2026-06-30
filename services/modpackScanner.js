// services/modpackScanner.js
// Lógica de escaneo de modpacks separada para manteneribilidad

import { dialog } from 'electron';
import fs from 'fs/promises';
import path from 'path';
import AdmZip from 'adm-zip';
import toml from '@iarna/toml';

import sec from './security.cjs';

/**
 * Abre un diálogo para seleccionar la carpeta del modpack y escanea su contenido.
 * @param {Electron.IpcMainInvokeEvent} event - Evento IPC
 * @param {string|null} knownPath - Ruta conocida (opcional)
 * @returns {Promise<Object|null>} Información del modpack o null si se cancela
 */
async function handleFolderOpen(event, knownPath) {
  let rootPath = knownPath;

  if (!rootPath) {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Selecciona la carpeta raíz de tu Modpack',
      properties: ['openDirectory']
    });

    if (canceled) return null;
    rootPath = filePaths[0];
  }

  const itemsInRoot = await fs.readdir(rootPath);

  let modsPath = itemsInRoot.includes('mods') ? path.join(rootPath, 'mods') : rootPath;

  let configFiles = [];
  let scriptFiles = [];
  try {
    if (itemsInRoot.includes('config')) configFiles = await fs.readdir(path.join(rootPath, 'config'));
    if (itemsInRoot.includes('scripts')) scriptFiles = await fs.readdir(path.join(rootPath, 'scripts'));
  } catch (e) {
    console.warn('[modpackScanner] Error leyendo carpetas de apoyo:', e.message);
  }

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
  } catch (e) {
    console.warn('[modpackScanner] No se pudo leer archivo de instancia:', e.message);
  }

  try {
    const files = await fs.readdir(modsPath);
    const jarFiles = files.filter(file => file.endsWith('.jar'));
    const modsData = [];

    for (const file of jarFiles) {
      const filePath = path.join(modsPath, file);
      let modName = file.replace('.jar', '');
      let modVersion = 'Desconocida';
      let modId = modName.toLowerCase().split(/[_\-\s]/)[0];

      let iconBase64 = null;

      try {
        await sec.validateFileSize(filePath, sec.MAX_ZIP_SIZE);
        const zip = new AdmZip(filePath);
        const fabricJson = zip.getEntry('fabric.mod.json');
        const forgeToml = zip.getEntry('META-INF/mods.toml');
        const mcmodInfo = zip.getEntry('mcmod.info');

        let expectedLogo = 'logo.png';

        if (fabricJson) {
          const data = JSON.parse(zip.readAsText(fabricJson));
          modName = data.name || modName;
          modVersion = data.version || modVersion;
          if (data.icon) expectedLogo = data.icon.replace(/^\/+/, '');
        } else if (forgeToml) {
          const data = toml.parse(zip.readAsText(forgeToml));
          if (data.mods && data.mods[0]) {
            modName = data.mods[0].displayName || modName;
            modVersion = data.mods[0].version || modVersion;
            if (data.mods[0].logoFile) expectedLogo = data.mods[0].logoFile;
          }
        } else if (mcmodInfo) {
          try {
            let textData = zip.readAsText(mcmodInfo).replace(/\n/g, '').replace(/,(\s*[\]}])/g, '$1');
            const data = JSON.parse(textData);
            const mod = Array.isArray(data) ? data[0] : (data.modList ? data.modList[0] : data);
            modName = mod.name || modName;
            modVersion = mod.version || modVersion;
            if (mod.logoFile) expectedLogo = mod.logoFile;
} catch (e) {
                console.warn('[modpackScanner] Error reading mod metadata:', e.message);
              }
            }

        let iconEntry = zip.getEntry(expectedLogo) || zip.getEntry('icon.png') || zip.getEntry('logo.png') || zip.getEntry('pack.png');

        if (iconEntry) {
          const buffer = zip.readFile(iconEntry);
          iconBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
        }
      } catch (err) {
        console.warn('[modpackScanner] Error processing mod:', err.message);
      }

      if (modVersion === 'Desconocida') {
        const versionMatch = file.match(/[_\-\s](v?[\d\.]+[a-zA-Z0-9-]*)\.jar$/i);
        if (versionMatch) {
          modVersion = versionMatch[1];
          modName = modName.replace(versionMatch[0].replace('.jar', ''), '').trim();
        }
      }

      const cleanModName = modName.toLowerCase().replace(/[\s_\-]/g, '');
      const cleanModId = modId.toLowerCase().replace(/[\s_\-]/g, '');

      const relatedConfigs = configFiles.filter(cfg => {
        const cleanCfg = cfg.toLowerCase().replace(/[\s_\-]/g, '');
        return cleanCfg.includes(cleanModName) || cleanCfg.includes(cleanModId);
      });

      const relatedScripts = scriptFiles.filter(scr => {
        const cleanScr = scr.toLowerCase().replace(/[\s_\-]/g, '');
        return cleanScr.includes(cleanModName) || cleanScr.includes(cleanModId);
      });

      modsData.push({
        id: file,
        name: modName.replace(/[\s\-_]+$/, ''),
        version: modVersion,
        icon: iconBase64,
        configs: relatedConfigs,
        scripts: relatedScripts
      });
    }

    return { mods: modsData, info: modpackInfo, rootFiles: itemsInRoot };
  } catch (err) {
    console.error("Error en el escaneo:", err);
    return null;
  }
}

export default { handleFolderOpen };