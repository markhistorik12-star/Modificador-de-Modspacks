import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';
import toml from '@iarna/toml';
import { exec } from 'child_process';
import crypto from 'crypto';
import dotenv from 'dotenv';

// 1. Cargamos el .env desde la raíz de modpack_asist (Esto ya funciona)
dotenv.config({ path: path.join(process.cwd(), '.env') });

// 2. Asignamos la constante
const CF_API_KEY = process.env.CURSEFORGE_API_KEY;

// 5. Recreamos __filename y __dirname para tus otras funciones
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
  } catch (e) { console.log("Error leyendo carpetas de apoyo"); }

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
          } catch(e) {}
        }

        let iconEntry = zip.getEntry(expectedLogo) || zip.getEntry('icon.png') || zip.getEntry('logo.png') || zip.getEntry('pack.png');
        
        if (iconEntry) {
          const buffer = zip.readFile(iconEntry);
          iconBase64 = `data:image/png;base64,${buffer.toString('base64')}`;
        }
      } catch (err) {}

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
  createWindow(); 
  
  ipcMain.handle('dialog:openFolder', handleFolderOpen);

  ipcMain.handle('read-file', async (event, filePath, packPath) => {
    try {
      const targetPath = path.join(packPath, filePath);
      const content = await fs.readFile(targetPath, 'utf-8');
      const limitedContent = content.split('\n').slice(0, 70).join('\n');
      return `[MUESTRA 70 LÍNEAS DE ${filePath}]\n${limitedContent}`;
    } catch (err) { return `ERROR 404: Archivo '${filePath}' inexistente.`; }
  });

  ipcMain.handle('read-full-file', async (event, filePath, packPath) => {
    try {
      const targetPath = path.join(packPath, filePath);
      
      // 1. Revisamos qué tipo de elemento es antes de intentar leerlo
      const stats = await fs.stat(targetPath);
      
      if (stats.isDirectory()) {
        return { success: false, message: `⛔ '${filePath}' es una CARPETA. El editor solo puede abrir archivos.` };
      }

      // 2. Si es un archivo, lo leemos
      const content = await fs.readFile(targetPath, 'utf-8');
      return { success: true, content: content };
      
    } catch (err) {
      // 3. Si falla, devolvemos el error nativo exacto
      return { success: false, message: `Error Nativo: ${err.message}` };
    }
  });

  ipcMain.handle('search-configs', async (event, searchTerm, packPath) => {
    try {
      let results = [];
      const foldersToSearch = ['.', 'config', 'scripts', 'kubejs', 'defaultconfigs'];
      const allowedExts = ['.cfg', '.toml', '.json', '.zs', '.js', '.txt', '.properties'];
      
      for (const folder of foldersToSearch) {
        const folderPath = path.join(packPath, folder);
        try {
          const files = await fs.readdir(folderPath);
          const textFiles = files.filter(f => allowedExts.some(ext => f.endsWith(ext)));
          
          for (const file of textFiles) {
            const content = await fs.readFile(path.join(folderPath, file), 'utf-8');
            const lines = content.split('\n');
            for (let i = 0; i < lines.length; i++) {
              if (lines[i].toLowerCase().includes(searchTerm.toLowerCase())) {
                const prefix = folder === '.' ? '' : `${folder}/`;
                results.push(`[${prefix}${file}, Línea ${i+1}]: ${lines[i].trim()}`);
              }
            }
          }
        } catch(e) {}
      }
      return results.length === 0 ? "Sin coincidencias." : results.slice(0, 20).join('\n'); 
    } catch (err) { return "Error I/O en la búsqueda global."; }
  });

  ipcMain.handle('edit-file', async (event, filePath, packPath, oldText, newText) => {
    try {
      const targetPath = path.join(packPath, filePath);
      let content = await fs.readFile(targetPath, 'utf-8');
      if (!content.includes(oldText)) return { success: false, message: `Línea de origen no detectada en ${filePath}.` };
      content = content.replace(oldText, newText);
      await fs.writeFile(targetPath, content, 'utf-8');
      return { success: true, message: `Modificación aplicada en ${filePath}.` };
    } catch (err) { return { success: false, message: "Fallo I/O." }; }
  });

  ipcMain.handle('prepend-file', async (event, filePath, packPath, newText) => {
    try {
      const targetPath = path.join(packPath, filePath);
      let content = await fs.readFile(targetPath, 'utf-8');
      await fs.writeFile(targetPath, newText + '\n' + content, 'utf-8');
      return { success: true, message: `Inyección completada en ${filePath}.` };
    } catch (err) { return { success: false, message: "Fallo I/O." }; }
  });

  ipcMain.handle('append-file', async (event, filePath, packPath, newText) => {
    try {
      const targetPath = path.join(packPath, filePath);
      let content = await fs.readFile(targetPath, 'utf-8');
      const separator = content.endsWith('\n') ? '' : '\n';
      await fs.writeFile(targetPath, content + separator + newText, 'utf-8');
      return { success: true, message: `Inyección completada en ${filePath}.` };
    } catch (err) { return { success: false, message: "Fallo I/O." }; }
  });

  ipcMain.handle('write-file', async (event, filePath, packPath, content) => {
    try {
      const targetPath = path.join(packPath, filePath); 
      await fs.writeFile(targetPath, content, 'utf-8');
      return { success: true, message: `Sobrescritura completada.` };
    } catch (error) { return { success: false, message: `Fallo I/O.` }; }
  });

  ipcMain.handle('delete-file', async (event, filePath, packPath) => {
    try {
      const targetPath = path.join(packPath, filePath); 
      await fs.access(targetPath);
      await fs.unlink(targetPath); 
      return { success: true, message: `Eliminación ejecutada.` };
    } catch { return { success: false, message: `Archivo no localizado.` }; }
  });

  ipcMain.handle('rename-file', async (event, oldPathName, newPathName, packPath) => {
    try {
      const oldPath = path.join(packPath, oldPathName);
      const newPath = path.join(packPath, newPathName);
      await fs.access(oldPath);
      await fs.rename(oldPath, newPath); 
      return { success: true, message: `Renombrado completado.` };
    } catch { return { success: false, message: `Origen no localizado.` }; }
  });

  ipcMain.handle('create-project', async (event, projectData) => {
    const { name, mcVersion, loader } = projectData;

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Selecciona una CARPETA VACÍA para tu Modpack',
      properties: ['openDirectory', 'createDirectory']
    });

    if (canceled || filePaths.length === 0) return null;

    const projectPath = filePaths[0]; 

    try {
      await fs.mkdir(path.join(projectPath, 'mods'), { recursive: true });
      await fs.mkdir(path.join(projectPath, 'config'), { recursive: true });
      await fs.mkdir(path.join(projectPath, 'scripts'), { recursive: true });

      const manifest = { 
        name: name, 
        version: "1.0.0",
        minecraft: {
          version: mcVersion,
          modLoaders: [{ id: `${loader.toLowerCase()}-latest`, primary: true }]
        },
        manifestType: "minecraftModpack",
        manifestVersion: 1,
        _appData: { loader: loader } 
      };
      
      await fs.writeFile(path.join(projectPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

      return { 
        mods: [], 
        info: { name, gameVersion: mcVersion, loader, path: projectPath }, 
        rootFiles: ['mods', 'config', 'scripts', 'manifest.json'] 
      };
    } catch (err) {
      console.error("Error creando proyecto:", err);
      return null;
    }
  });

  ipcMain.handle('search-mods-online', async (event, query, gameVersion, loader, sortBy = 'downloads', category = '') => {
    const safeLoader = loader ? loader.toLowerCase() : "forge";
    const modloaderId = safeLoader === 'forge' ? 1 : (safeLoader === 'fabric' ? 4 : 5);
    
    try {
      // --- 1. MODRINTH ---
      // 🎯 Añadimos el filtro estricto de versión al array de facetas
      let facetsArray = [
        [`categories:${safeLoader}`],
        [`versions:${gameVersion}`] 
      ];
      if (category) facetsArray.push([`categories:${category}`]);
      
      // Balanceamos: Pedimos 50 resultados exactos
      const modrinthUrl = `https://api.modrinth.com/v2/search?query=${query}&facets=${encodeURIComponent(JSON.stringify(facetsArray))}&index=${sortBy}&limit=200`;
      const modrinthRes = await fetch(modrinthUrl);
      const modrinthData = await modrinthRes.json();

      const modrinthResults = modrinthData.hits.map(mod => ({
        project_id: mod.project_id,
        title: mod.title,
        description: mod.description,
        icon_url: mod.icon_url,
        author: mod.author,
        downloads: mod.downloads,
        source: 'modrinth'
      }));

      // --- 2. CURSEFORGE (BÚSQUEDA) ---
      let curseResults = [];
      try {
        const cfSort = sortBy === 'downloads' ? 4 : (sortBy === 'newest' ? 2 : 1);
        
        // 🎯 Añadimos &gameVersion=${gameVersion} y subimos el pageSize a 50
        const cfUrl = `https://api.curseforge.com/v1/mods/search?gameId=432&classId=6&searchFilter=${query}&modLoaderType=${modloaderId}&gameVersion=${gameVersion}&sortField=${cfSort}&sortOrder=desc&pageSize=50`;
        
        const cfRes = await fetch(cfUrl, {
          headers: { 'x-api-key': CF_API_KEY, 'Accept': 'application/json' }
        });

        if (cfRes.ok) {
          const cfData = await cfRes.json();
          curseResults = cfData.data.map(mod => ({
            project_id: String(mod.id),
            title: mod.name,
            description: mod.summary,
            icon_url: mod.logo ? mod.logo.thumbnailUrl : null,
            author: mod.authors[0]?.name || 'Unknown',
            downloads: mod.downloadCount,
            source: 'curseforge'
          }));
        } else {
          const errorText = await cfRes.text();
          console.warn(`⚠️ CurseForge rechazó la conexión. (${cfRes.status}): ${errorText}`);
        }
      } catch (cfError) {
        console.warn("⚠️ No se pudo conectar a CurseForge:", cfError.message);
      }

      // --- 3. MEZCLAMOS Y FILTRAMOS ---
      const combined = [...modrinthResults, ...curseResults];
      const uniqueResults = Array.from(new Map(combined.map(item => [item.title.toLowerCase(), item])).values());

      return { success: true, results: uniqueResults };
      
    } catch (err) {
      console.error("Error crítico en el buscador:", err);
      return { success: false, message: "Fallo de conexión principal." };
    }
  });

  ipcMain.handle('get-mod-versions', async (event, projectId, gameVersion, loader, source) => {
    try {
      const safeLoader = loader ? loader.toLowerCase() : "forge";

      if (source === 'curseforge') {
        const modloaderId = safeLoader === 'forge' ? 1 : (safeLoader === 'fabric' ? 4 : 5);
        const cfUrl = `https://api.curseforge.com/v1/mods/${projectId}/files?gameVersion=${gameVersion}&modLoaderType=${modloaderId}`;
        
        // ✨ USAMOS LA LLAVE GLOBAL AQUÍ ✨
        const res = await fetch(cfUrl, { headers: { 'x-api-key': CF_API_KEY, 'Accept': 'application/json' } });
        
        if (!res.ok) throw new Error("Fallo de conexión con CurseForge API.");
        const data = await res.json();
        
        const formattedVersions = data.data.map(v => ({
          id: v.id, 
          name: v.displayName, 
          version_number: v.id.toString(), 
          date: new Date(v.fileDate).toLocaleDateString(),
          dependencies: v.dependencies ? v.dependencies.filter(d => d.relationType === 3) : [],
          downloadUrl: v.downloadUrl,
          source: 'curseforge',
          projectId: projectId
        }));
        
        return { success: true, versions: formattedVersions };
      } 
      else {
        const res = await fetch(`https://api.modrinth.com/v2/project/${projectId}/version`);
        const versions = await res.json();

        const validVersions = versions.filter(v => 
          v.loaders.includes(safeLoader) && v.game_versions.includes(gameVersion)
        );

        const formattedVersions = validVersions.map(v => ({
          id: v.id, name: v.name, version_number: v.version_number,
          date: new Date(v.date_published).toLocaleDateString(),
          dependencies: v.dependencies.filter(d => d.dependency_type === 'required'),
          source: 'modrinth'
        }));

        return { success: true, versions: formattedVersions };
      }
    } catch (err) { return { success: false, message: err.message }; }
  });

  ipcMain.handle('download-mod', async (event, versionObj, packPath) => {
    try {
      let downloadUrl = '';
      let fileName = '';

      if (versionObj.source === 'curseforge') {
        downloadUrl = versionObj.downloadUrl;
        
        if (!downloadUrl) {
          // USAMOS LA LLAVE GLOBAL AQUÍ 
          const res = await fetch(`https://api.curseforge.com/v1/mods/${versionObj.projectId}/files/${versionObj.id}/download-url`, {
            headers: { 'x-api-key': CF_API_KEY, 'Accept': 'application/json' }
          });
          
          if (res.ok) {
              const data = await res.json();
              // Validamos por si CurseForge da OK pero envía el enlace vacío
              if (!data.data) {
                  return { 
                      success: false, 
                      errorCode: 'RESTRICTED_BY_AUTHOR',
                      message: "El autor de este mod en CurseForge no permite descargas desde apps externas. Debes bajarlo de la web." 
                  };
              }
              downloadUrl = data.data;
          } else {
              // Validamos si CurseForge rechaza la conexión (ej. Error 403 Forbidden)
              return { 
                  success: false, 
                  errorCode: 'RESTRICTED_BY_AUTHOR',
                  message: "El autor de este mod en CurseForge no permite descargas desde apps externas. Debes bajarlo de la web." 
              };
          }
        }
        fileName = versionObj.name.endsWith('.jar') ? versionObj.name : `${versionObj.name}.jar`;
      
      } else {
        const res = await fetch(`https://api.modrinth.com/v2/version/${versionObj.id}`);
        const versionData = await res.json();
        const fileInfo = versionData.files.find(f => f.primary) || versionData.files[0];
        downloadUrl = fileInfo.url;
        fileName = fileInfo.filename;
      }

      const modRes = await fetch(downloadUrl);
      const buffer = await modRes.arrayBuffer();
      
      const destPath = path.join(packPath, 'mods', fileName);
      await fs.writeFile(destPath, Buffer.from(buffer));

      return { success: true, fileName: fileName };
    } catch (err) {
      console.error(err);
      return { success: false, message: err.message };
    }
});

  ipcMain.handle('diagnose-modpack', async (event, packPath) => {
    try {
      const modsPath = path.join(packPath, 'mods');
      const files = await fs.readdir(modsPath);
      const jarFiles = files.filter(f => f.endsWith('.jar'));

      if (jarFiles.length === 0) throw new Error("No hay mods para analizar.");

      let packVersion = "1.20.1", packLoader = "forge";
      try {
         const manifest = JSON.parse(await fs.readFile(path.join(packPath, 'manifest.json'), 'utf-8'));
         packVersion = manifest.minecraft?.version || manifest.gameVersion || packVersion;
         const loaderStr = manifest.minecraft?.modLoaders?.[0]?.id || manifest._appData?.loader || packLoader;
         packLoader = loaderStr.toLowerCase().includes('fabric') ? 'fabric' : (loaderStr.toLowerCase().includes('neoforge') ? 'neoforge' : 'forge');
      } catch(e) {}

      const fileHashes = {};
      for (const file of jarFiles) {
        const buffer = await fs.readFile(path.join(modsPath, file));
        const hash = crypto.createHash('sha1').update(buffer).digest('hex');
        fileHashes[hash] = file;
      }
      const hashArray = Object.keys(fileHashes);

      const res = await fetch('https://api.modrinth.com/v2/version_files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes: hashArray, algorithm: "sha1" })
      });

      if (!res.ok) throw new Error("Fallo de conexión con Modrinth API.");
      const data = await res.json(); 

      const errors = [];
      const warnings = [];
      let okCount = 0;
      const fileStatusMap = {};

      const installedProjectIds = new Set();
      Object.values(data).forEach(version => installedProjectIds.add(version.project_id));

      for (const hash of hashArray) {
        const fileName = fileHashes[hash];
        const versionData = data[hash];

        if (!versionData) {
          warnings.push(`⚠️ "${fileName}" es desconocido (No está en la base de datos de Modrinth). Revisa su compatibilidad manualmente.`);
          continue;
        }

        let isOk = true;

        if (!versionData.game_versions.includes(packVersion)) {
          errors.push(`❌ [VERSIÓN] "${fileName}" es para MC ${versionData.game_versions[0] || '?'}, pero tu pack usa ${packVersion}.`);
          fileStatusMap[fileName.toLowerCase()] = 'error'; 
          isOk = false;
        }

        const vLoaders = versionData.loaders.map(l => l.toLowerCase());
        if (!vLoaders.includes(packLoader)) {
          errors.push(`❌ [LOADER] "${fileName}" es exclusivo de ${vLoaders.join('/')}, pero tu pack usa ${packLoader}.`);
          fileStatusMap[fileName.toLowerCase()] = 'error'; 
          isOk = false;
        }

        if (versionData.dependencies) {
           for (const dep of versionData.dependencies) {
              if (dep.dependency_type === 'required' && dep.project_id && !installedProjectIds.has(dep.project_id)) {
                 errors.push(`❌ [FALTA DEPENDENCIA] "${fileName}" requiere un mod obligatorio que no tienes instalado.`);
                 fileStatusMap[fileName.toLowerCase()] = 'error'; 
                 isOk = false;
              }
           }
        }

        if (isOk) {
            okCount++;
            fileStatusMap[fileName.toLowerCase()] = 'ok'; 
        }
      }

      return { success: true, report: { errors, warnings, okCount, total: jarFiles.length, fileStatusMap } }; 

    } catch (error) {
      console.error(error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('export-modpack', async (event, packPath, packName) => {
    try {
      const zip = new AdmZip();
      zip.addLocalFolder(packPath);
      const exportPath = path.join(path.dirname(packPath), `${packName}_Exportado.zip`);
      zip.writeZip(exportPath);
      shell.showItemInFolder(exportPath);
      return { success: true, path: exportPath };
    } catch (error) {
      console.error(error);
      return { success: false, message: error.message };
    }
  });

  
  ipcMain.handle('read-toml', async (event, filePath) => {
    try {
      // Ya tienes 'fs' y 'toml' importados en la línea 4 y 6 de tu archivo
      const rawContent = await fs.readFile(filePath, 'utf-8');
      const parsedData = toml.parse(rawContent);
      
      return { success: true, data: parsedData };
    } catch (error) {
      console.error("Error leyendo TOML:", error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('install-mod-recursively', async (event, initialVersionId, packVersion, packLoader, packPath) => {
    const downloadedIds = new Set();
    const logs = [];

    const processDependencyTree = async (versionId) => {
      if (downloadedIds.has(versionId)) return;
      downloadedIds.add(versionId);

      try {
        const res = await fetch(`https://api.modrinth.com/v2/version/${versionId}`);
        if (!res.ok) throw new Error("No se encontró la versión en Modrinth.");
        const vData = await res.json();

        const fileInfo = vData.files.find(f => f.primary) || vData.files[0];
        const modRes = await fetch(fileInfo.url);
        const buffer = await modRes.arrayBuffer();
        const destPath = path.join(packPath, 'mods', fileInfo.filename);
        await fs.writeFile(destPath, Buffer.from(buffer));
        
        logs.push(`✅ Descargado: ${fileInfo.filename}`);

        if (vData.dependencies && vData.dependencies.length > 0) {
          for (const dep of vData.dependencies) {
            if (dep.dependency_type === 'required') {
              if (dep.version_id) {
                await processDependencyTree(dep.version_id);
              } else if (dep.project_id) {
                const safeLoader = packLoader.toLowerCase() === 'neoforge' ? 'forge' : packLoader.toLowerCase();
                const searchUrl = `https://api.modrinth.com/v2/project/${dep.project_id}/version?loaders=["${safeLoader}"]&game_versions=["${packVersion}"]`;
                const depRes = await fetch(searchUrl);
                const depVersions = await depRes.json();
                
                if (depVersions.length > 0) {
                  await processDependencyTree(depVersions[0].id); 
                } else {
                  logs.push(`⚠️ No hay versión compatible de la dependencia (ID: ${dep.project_id})`);
                }
              }
            }
          }
        }
      } catch (err) {
        logs.push(`❌ Fallo al procesar un nodo del árbol: ${err.message}`);
      }
    };

    await processDependencyTree(initialVersionId);
    return { success: true, logs };
  });

  // Abrir archivo en editor externo ---
  ipcMain.handle('open-external-editor', async (event, filePath, packPath) => {
    try {
      const exactPath = path.join(packPath, filePath);
      
      // Intenta abrir con VS Code primero, si falla, usa el editor por defecto del sistema
      exec(`code "${exactPath}"`, (error) => {
        if (error) shell.openPath(exactPath);
      });
      
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('get-game-versions', async () => {
    try {
      const res = await fetch('https://api.modrinth.com/v2/tag/game_version');
      if (!res.ok) throw new Error("Fallo de red");
      
      const versions = await res.json();
      return { success: true, versions: versions };
    } catch (error) {
      console.error("Error al obtener versiones:", error);
      return { success: false, message: error.message };
    }
  });

}); 

//  Escanear contenido de una subcarpeta ---
  ipcMain.handle('list-folder-content', async (event, folderPath, packPath) => {
    try {
      const fullPath = path.join(packPath, folderPath);
      const files = await fs.readdir(fullPath);
      
      // Opcional: Podrías filtrar para que no muestre carpetas dentro de carpetas si quieres
      return { success: true, files };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // --- NUEVO: Escanear el interior de un mod (.jar) ---
  ipcMain.handle('explore-jar-contents', async (event, jarName, packPath) => {
    try {
      const jarPath = path.join(packPath, 'mods', jarName);
      const zip = new AdmZip(jarPath);
      const zipEntries = zip.getEntries();

      const internalFiles = [];

      zipEntries.forEach(entry => {
        if (entry.isDirectory) return;

        const pathInsideJar = entry.entryName;
        
        // 🎯 Nuestro filtro: Solo buscamos JSONs de datos y configuraciones por defecto
        if (
          (pathInsideJar.startsWith('data/') && pathInsideJar.endsWith('.json')) ||
          pathInsideJar.startsWith('defaultconfigs/')
        ) {
          internalFiles.push(pathInsideJar);
        }
      });

      // Ordenamos alfabéticamente para que la lista se vea profesional
      internalFiles.sort();

      return { success: true, files: internalFiles };
    } catch (err) {
      return { success: false, message: `Error al abrir el mod: ${err.message}` };
    }
  });

  //Leer un archivo específico desde adentro del .jar ---
  ipcMain.handle('read-jar-file', async (event, jarName, internalPath, packPath) => {
    try {
      const jarPath = path.join(packPath, 'mods', jarName);
      const zip = new AdmZip(jarPath);
      
      const entry = zip.getEntry(internalPath);
      if (!entry) {
        return { success: false, message: `El archivo ${internalPath} desapareció o no se puede leer.` };
      }

      // Leemos el texto puro desde el interior del ZIP
      const content = zip.readAsText(entry);
      return { success: true, content: content };
    } catch (err) {
      return { success: false, message: `Fallo de I/O interno: ${err.message}` };
    }
  });


 
  // Spawn control (pronto)
  ipcMain.handle('inject-spawn-control', async (event, tweakData, packPath) => {
    try {
      const kubejsPath = path.join(packPath, 'kubejs', 'server_scripts');
      await fs.mkdir(kubejsPath, { recursive: true });
      const scriptPath = path.join(kubejsPath, '3_spawn_tweaks.js');
      if (!tweakData || !tweakData.entityId) return { success: false, message: 'No entityId provided' };
      let lines = [];
      if (tweakData.health) {
        lines.push(`    event.entity.setAttributeBaseValue('minecraft:generic.max_health', ${tweakData.health});`);
        lines.push(`    event.entity.setHealth(${tweakData.health});`);
      }
      if (tweakData.speed) lines.push(`    event.entity.setAttributeBaseValue('minecraft:generic.movement_speed', ${tweakData.speed});`);
      if (tweakData.damage) lines.push(`    event.entity.setAttributeBaseValue('minecraft:generic.attack_damage', ${tweakData.damage});`);
      if (lines.length === 0) return { success:false, message:'No tweak data provided' };

      const rule = `EntityEvents.spawned(event => {\n  if (event.entity.type === '${tweakData.entityId}') {\n${lines.map(l => '    '+l).join('\n')}\n  }\n});\n`;
      await fs.appendFile(scriptPath, rule, 'utf-8');
      return { success: true, message: `Spawn control applied for ${tweakData.entityId}` };
    } catch (err) {
      return { success: false, message: `Spawn control error: ${err.message}` };
    }
  });

  // Loot editor (pronto)
  ipcMain.handle('loot-editor-apply', async (event, packPath, lootPath, patch) => {
    try {
      const targetPath = path.join(packPath, lootPath);
      let base = {};
      try {
        const raw = await fs.readFile(targetPath, 'utf-8');
        base = JSON.parse(raw);
      } catch {
        base = {};
      }
      const merge = (dst, src) => {
        for (const k of Object.keys(src)) {
          if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
            dst[k] = dst[k] || {};
            merge(dst[k], src[k]);
          } else {
            dst[k] = src[k];
          }
        }
      };
      merge(base, patch || {});
      await fs.writeFile(targetPath, JSON.stringify(base, null, 2), 'utf-8');
      return { success: true, message: `Loot edited: ${lootPath}` };
    } catch (err) {
      return { success: false, message: `Loot editor error: ${err.message}` };
    }
  });

  // --- INYECCIÓN DE BALANCE DE ÍTEMS ---
  ipcMain.handle('inject-item-tweak', async (event, tweakData, packPath) => {
    try {
      // CORRECCIÓN: Los items se modifican en el startup, antes de que cargue el mundo
      const kubejsPath = path.join(packPath, 'kubejs', 'startup_scripts');
      await fs.mkdir(kubejsPath, { recursive: true });
      const scriptPath = path.join(kubejsPath, '1_item_tweaks.js');

      let script = `\nItemEvents.modification(event => {\n  event.modify('${tweakData.itemId}', item => {\n`;
      if (tweakData.damage) script += `    item.attackDamage = ${tweakData.damage};\n`;
      if (tweakData.armor) script += `    item.armorProtection = ${tweakData.armor};\n`;
      if (tweakData.toughness) script += `    item.armorToughness = ${tweakData.toughness};\n`;
      script += `  });\n});\n`;

      await fs.appendFile(scriptPath, script, 'utf-8');
      return { success: true, message: `✅ Balance inyectado exitosamente a: ${tweakData.itemId} (Startup Script)` };
    } catch (err) {
      return { success: false, message: `❌ Error al inyectar código: ${err.message}` };
    }
  });

  ipcMain.handle('inject-entity-tweak', async (event, tweakData, packPath) => {
    try {
      const kubejsPath = path.join(packPath, 'kubejs', 'server_scripts');
      await fs.mkdir(kubejsPath, { recursive: true });
      const scriptPath = path.join(kubejsPath, '2_entity_tweaks.js');

      let script = `\nEntityEvents.spawned(event => {\n  if (event.entity.type === '${tweakData.entityId}') {\n`;
      if (tweakData.health) {
        script += `    event.entity.setAttributeBaseValue('minecraft:generic.max_health', ${tweakData.health});\n`;
        script += `    event.entity.setHealth(${tweakData.health});\n`;
      }
      if (tweakData.damage) script += `    event.entity.setAttributeBaseValue('minecraft:generic.attack_damage', ${tweakData.damage});\n`;
      if (tweakData.speed) script += `    event.entity.setAttributeBaseValue('minecraft:generic.movement_speed', ${tweakData.speed});\n`;
      script += `  }\n});\n`;

      await fs.appendFile(scriptPath, script, 'utf-8');
      return { success: true, message: `✅ Mutación genética aplicada a: ${tweakData.entityId}` };
    } catch (err) {
      return { success: false, message: `❌ Error al inyectar código: ${err.message}` };
    }
  });


// Esta función se ejecuta cuando React se lo pide
ipcMain.handle('scan-mod-ids', async (event, modsPath) => {
      let extractedIds = new Set(); // Usamos Set para evitar duplicados automáticamente
      
      try {
          const normalizedPath = path.normalize(modsPath);
          const files = await fs.readdir(normalizedPath);

          for (const file of files) {
              if (file.endsWith('.jar')) {
                  // Agregamos un try/catch interno. Si un .jar está corrupto, lo ignora y sigue con el resto.
                  try {
                      const jarPath = path.join(normalizedPath, file);
                      const zip = new AdmZip(jarPath);
                      const zipEntries = zip.getEntries();

                      zipEntries.forEach(entry => {
                          // 1. Extraer Armas, Armaduras e Ítems
                          const itemMatch = entry.entryName.match(/^assets\/([a-z0-9_.-]+)\/models\/item\/([a-z0-9_.-]+)\.json$/);
                          if (itemMatch) extractedIds.add(`${itemMatch[1]}:${itemMatch[2]}`);

                          // 2. Extraer Entidades, Mobs y Jefes
                          const entityMatch = entry.entryName.match(/^data\/([a-z0-9_.-]+)\/loot_tables\/entities\/([a-z0-9_.-]+)\.json$/);
                          if (entityMatch) extractedIds.add(`${entityMatch[1]}:${entityMatch[2]}`);
                      });
                  } catch (jarError) {
                      // Ignoramos silenciosamente archivos que no sean ZIP válidos
                  }
              }
          }
          return [...extractedIds].sort();
      } catch (error) {
          console.error("Error al leer la carpeta mods:", error);
          return [];
      }
  });

app.on('window-all-closed', () => { 
  if (process.platform !== 'darwin') app.quit(); 
});
