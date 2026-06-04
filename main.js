import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import AdmZip from 'adm-zip';
import toml from '@iarna/toml';
import crypto from 'crypto';
import dotenv from 'dotenv';
import si from 'systeminformation';


// Sanitización de rutas: previene path traversal
const sanitizePath = (userPath, basePath) => {
  if (!userPath || typeof userPath !== 'string') return null;
  if (userPath.includes('..') || userPath.includes('~')) return null;
  if (path.isAbsolute(userPath)) return null;
  const resolved = path.resolve(basePath, userPath);
  const baseResolved = path.resolve(basePath);
  if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) return null;
  return resolved;
};

// Validación de IDs de objetos/entidades (namespace:path)
const validateItemId = (id) => /^[a-z0-9_.-]+:[a-z0-9_.\/-]+$/i.test(id);

// Validación de versiones semver-like (ej: 1.20.1, 1.21, 1.19.2)
const validateGameVersion = (v) => /^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9]+)?$/.test(v);

// Límites de seguridad
const MAX_READ_SIZE = 10 * 1024 * 1024;
const MAX_DOWNLOAD_SIZE = 200 * 1024 * 1024;
const MAX_ZIP_SIZE = 500 * 1024 * 1024;

const validateFileSize = async (filePath, maxSize) => {
  const { size } = await fs.stat(filePath);
  if (size > maxSize) throw new Error('Archivo excede el límite de tamaño.');
  return size;
};

dotenv.config({ path: path.join(process.cwd(), '.env') });


const CF_API_KEY = process.env.CURSEFORGE_API_KEY;

// Obtener rutas base del proyecto
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// --- SECCIÓN: Escaneo de modpack ---
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
        await validateFileSize(filePath, MAX_ZIP_SIZE);
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

// --- SECCIÓN: Ventana principal ---
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

// --- SECCIÓN: Handlers IPC ---
app.whenReady().then(() => {
  createWindow(); 
  
  ipcMain.handle('dialog:openFolder', handleFolderOpen);



  ipcMain.handle('read-full-file', async (event, filePath, packPath) => {
    try {
      const targetPath = sanitizePath(filePath, packPath);
      if (!targetPath) return { success: false, message: `Ruta inválida.` };
      const stats = await fs.stat(targetPath);
      if (stats.isDirectory()) {
        return { success: false, message: `⛔ '${filePath}' es una CARPETA. El editor solo puede abrir archivos.` };
      }
      await validateFileSize(targetPath, MAX_READ_SIZE);
      const content = await fs.readFile(targetPath, 'utf-8');
      return { success: true, content: content };
    } catch {
      return { success: false, message: `Error al leer el archivo.` };
    }
  });



  ipcMain.handle('write-file', async (event, filePath, packPath, content) => {
    try {
      const targetPath = sanitizePath(filePath, packPath);
      if (!targetPath) return { success: false, message: `Ruta inválida.` };
      await fs.writeFile(targetPath, content, 'utf-8');
      return { success: true, message: `Sobrescritura completada.` };
    } catch { return { success: false, message: `Fallo al escribir archivo.` }; }
  });

  ipcMain.handle('delete-file', async (event, filePath, packPath) => {
    try {
      const targetPath = sanitizePath(filePath, packPath);
      if (!targetPath) return { success: false, message: `Ruta inválida.` };
      await fs.access(targetPath);
      await fs.unlink(targetPath); 
      return { success: true, message: `Eliminación ejecutada.` };
    } catch { return { success: false, message: `Archivo no localizado.` }; }
  });

  ipcMain.handle('rename-file', async (event, oldPathName, newPathName, packPath) => {
    try {
      const oldPath = sanitizePath(oldPathName, packPath);
      const newPath = sanitizePath(newPathName, packPath);
      if (!oldPath || !newPath) return { success: false, message: `Ruta inválida.` };
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
    if (!query || !/^[a-zA-Z0-9\s\-_]+$/.test(query)) return { success: false, message: 'Consulta inválida.' };
    if (gameVersion && !validateGameVersion(gameVersion)) return { success: false, message: 'Versión de MC inválida.' };
    const safeLoader = loader ? loader.toLowerCase() : "forge";
    const modloaderId = safeLoader === 'forge' ? 1 : (safeLoader === 'fabric' ? 4 : 5);
    
    try {
      // --- 1. MODRINTH ---
      // Filtrar por loader y versión de MC
      let facetsArray = [
        [`categories:${safeLoader}`],
        [`versions:${gameVersion}`] 
      ];
      if (category) facetsArray.push([`categories:${category}`]);
      

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
    if (gameVersion && !validateGameVersion(gameVersion)) return { success: false, message: 'Versión de MC inválida.' };
    if (projectId && source === 'curseforge' && !/^\d+$/.test(projectId)) return { success: false, message: 'ID de proyecto inválido.' };
    try {
      const safeLoader = loader ? loader.toLowerCase() : "forge";

       if (source === 'curseforge') {
        if (!/^\d+$/.test(projectId)) return { success: false, message: 'ID de proyecto inválido.' };
        const modloaderId = safeLoader === 'forge' ? 1 : (safeLoader === 'fabric' ? 4 : 5);
        const cfUrl = `https://api.curseforge.com/v1/mods/${projectId}/files?gameVersion=${gameVersion}&modLoaderType=${modloaderId}`;
        

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
    } catch { return { success: false, message: 'Error al obtener versiones.' }; }
  });

  // --- SECCIÓN: Descarga de mods ---
  ipcMain.handle('download-mod', async (event, versionObj, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      let downloadUrl = '';
      let fileName = '';

      if (versionObj.source === 'curseforge') {
        if (!/^\d+$/.test(versionObj.projectId)) return { success: false, message: 'ID de proyecto de CurseForge inválido.' };
        downloadUrl = versionObj.downloadUrl;
        
        if (!downloadUrl) {

          const res = await fetch(`https://api.curseforge.com/v1/mods/${versionObj.projectId}/files/${versionObj.id}/download-url`, {
            headers: { 'x-api-key': CF_API_KEY, 'Accept': 'application/json' }
          });
          
          if (res.ok) {
              const data = await res.json();

              if (!data.data) {
                  return { 
                      success: false, 
                      errorCode: 'RESTRICTED_BY_AUTHOR',
                      message: "El autor de este mod en CurseForge no permite descargas desde apps externas. Debes bajarlo de la web." 
                  };
              }
              downloadUrl = data.data;
          } else {

              return { 
                  success: false, 
                  errorCode: 'RESTRICTED_BY_AUTHOR',
                  message: "El autor de este mod en CurseForge no permite descargas desde apps externas. Debes bajarlo de la web." 
              };
          }
        }
        fileName = versionObj.name.endsWith('.jar') ? versionObj.name : `${versionObj.name}.jar`;
      
      } else {
        if (!/^[a-zA-Z0-9_-]+$/.test(versionObj.id)) return { success: false, message: 'ID de versión inválido.' };
        const res = await fetch(`https://api.modrinth.com/v2/version/${versionObj.id}`);
        const versionData = await res.json();
        const fileInfo = versionData.files.find(f => f.primary) || versionData.files[0];
        downloadUrl = fileInfo.url;
        fileName = fileInfo.filename;
      }

      if (!downloadUrl || !downloadUrl.startsWith('https://')) return { success: false, message: 'URL de descarga inválida.' };
      if (!fileName || fileName.includes('..') || fileName.includes('/') || !fileName.endsWith('.jar')) return { success: false, message: 'Nombre de archivo inválido.' };

      const modRes = await fetch(downloadUrl);
      const contentLength = modRes.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > MAX_DOWNLOAD_SIZE) return { success: false, message: 'El archivo excede el tamaño máximo de descarga.' };
      const buffer = await modRes.arrayBuffer();
      if (buffer.byteLength > MAX_DOWNLOAD_SIZE) return { success: false, message: 'El archivo excede el tamaño máximo de descarga.' };
      
      const destPath = sanitizePath(fileName, path.join(packPath, 'mods'));
      if (!destPath) return { success: false, message: 'Ruta de destino inválida.' };
      await fs.writeFile(destPath, Buffer.from(buffer));

      return { success: true, fileName: fileName };
    } catch {
      return { success: false, message: 'Error al descargar el mod.' };
    }
});

  // --- SECCIÓN: Evaluación de peso del modpack ---
  const OPTIMIZATION_MODS = ['sodium', 'lithium', 'phosphor', 'ferritecore', 'entityculling', 'modernfix', 'immediatelyfast', 'enhancedblockentities', 'starlight', 'canary', 'krypton', 'hydrogen', 'lazydfu', 'smoothboot', 'fastload', 'memoryleakfix', 'betterfpsdist', 'particleculling', 'connectivity', 'farsight', 'oculus'];
  const HEAVY_MODS = ['create', 'mekanism', 'biomesoplenty', 'ad_astra', 'adastra', 'tectonic', 'terralith', 'alexsmobs', 'alexs_mobs', 'enderio', 'ender_io', 'thermal', 'draconicevolution', 'draconic_evolution', 'arsnouveau', 'ars_nouveau', 'botania', 'thaumcraft', 'twilightforest', 'iceandfire', 'ice_and_fire', 'minecolonies', 'appliedenergistics', 'refinedstorage', 'gregtech', 'gregtechceu', 'oculus', 'iris'];

  const getModNameFromJar = (zip, fileName) => {
    try {
      const fabricJson = zip.getEntry('fabric.mod.json');
      if (fabricJson) {
        const data = JSON.parse(zip.readAsText(fabricJson));
        return (data.name || fileName).toLowerCase().replace(/[\s_-]/g, '');
      }
      const forgeToml = zip.getEntry('META-INF/mods.toml');
      if (forgeToml) {
        const data = toml.parse(zip.readAsText(forgeToml));
        if (data.mods && data.mods[0]) return (data.mods[0].modId || fileName).toLowerCase().replace(/[\s_-]/g, '');
      }
    } catch {}
    return fileName.toLowerCase().replace(/[\s_-]/g, '');
  };

  ipcMain.handle('assess-modpack-weight', async (event, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const modsPath = sanitizePath('mods', packPath);
      if (!modsPath) return { success: false, message: 'Ruta inválida.' };
      const files = await fs.readdir(modsPath);
      const jarFiles = files.filter(f => f.endsWith('.jar'));

      let totalSizeBytes = 0;
      let optimizationCount = 0;
      let heavyCount = 0;

      for (const file of jarFiles) {
        const filePath = path.join(modsPath, file);
        try {
          const stats = await fs.stat(filePath);
          totalSizeBytes += stats.size;

          await validateFileSize(filePath, MAX_ZIP_SIZE);
          const zip = new AdmZip(filePath);
          const modName = getModNameFromJar(zip, file);
          if (OPTIMIZATION_MODS.some(k => modName.includes(k))) optimizationCount++;
          if (HEAVY_MODS.some(k => modName.includes(k))) heavyCount++;
        } catch {
          totalSizeBytes += 0;
        }
      }

      const totalSizeMB = parseFloat((totalSizeBytes / (1024 * 1024)).toFixed(1));
      const totalMods = jarFiles.length;

      // Fórmula de score (1 = ligero, 10 = muy pesado)
      let score = 5;
      if (totalMods > 80) score += 1;
      if (totalMods > 120) score += 1;
      if (totalSizeMB > 500) score += 1;
      if (totalSizeMB > 1000) score += 1;
      if (totalSizeMB > 2000) score += 1;
      if (heavyCount >= 3) score += 1;
      if (heavyCount >= 5) score += 1;
      if (optimizationCount === 0) score += 1;
      if (optimizationCount >= 2) score -= 1;
      if (totalMods < 30) score -= 1;
      if (totalSizeMB < 300) score -= 1;
      score = Math.max(1, Math.min(10, score));

      return { success: true, weightReport: { score, totalMods, totalSizeMB, optimizationCount, heavyCount } };
    } catch (error) {
      return { success: false, message: 'Error al evaluar el peso del modpack.' };
    }
  });

  // --- SECCIÓN: Diagnóstico ---
  ipcMain.handle('diagnose-modpack', async (event, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const modsPath = sanitizePath('mods', packPath);
      if (!modsPath) return { success: false, message: 'Ruta inválida.' };
      const files = await fs.readdir(modsPath);
      const jarFiles = files.filter(f => f.endsWith('.jar'));

      if (jarFiles.length === 0) throw new Error("No hay mods para analizar.");

      let packVersion = "1.20.1", packLoader = "forge";
      try {
         const manifestPath = sanitizePath('manifest.json', packPath);
         if (manifestPath) {
           await validateFileSize(manifestPath, MAX_READ_SIZE);
           const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
           packVersion = manifest.minecraft?.version || manifest.gameVersion || packVersion;
           const loaderStr = manifest.minecraft?.modLoaders?.[0]?.id || manifest._appData?.loader || packLoader;
           packLoader = loaderStr.toLowerCase().includes('fabric') ? 'fabric' : (loaderStr.toLowerCase().includes('neoforge') ? 'neoforge' : 'forge');
         }
      } catch(e) {}

      const fileHashes = {};
      for (const file of jarFiles) {
        const filePathForHash = path.join(modsPath, file);
        await validateFileSize(filePathForHash, MAX_ZIP_SIZE);
        const buffer = await fs.readFile(filePathForHash);
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
              if (dep.dependency_type === 'required' && dep.project_id && /^[a-zA-Z0-9_-]+$/.test(dep.project_id) && !installedProjectIds.has(dep.project_id)) {
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

      // Integrar evaluación de peso
      let weightReport = null;
      if (packPath) {
        try {
          const modsPath = path.join(packPath, 'mods');
          const allFiles = await fs.readdir(modsPath);
          const allJars = allFiles.filter(f => f.endsWith('.jar'));

          let totalSizeBytes = 0;
          let optimizationCount = 0;
          let heavyCount = 0;

          for (const file of allJars) {
            const filePath = path.join(modsPath, file);
            try {
              const stats = await fs.stat(filePath);
              totalSizeBytes += stats.size;
              await validateFileSize(filePath, MAX_ZIP_SIZE);
              const zip = new AdmZip(filePath);
              const modName = getModNameFromJar(zip, file);
              if (OPTIMIZATION_MODS.some(k => modName.includes(k))) optimizationCount++;
              if (HEAVY_MODS.some(k => modName.includes(k))) heavyCount++;
            } catch {}
          }

          const totalSizeMB = parseFloat((totalSizeBytes / (1024 * 1024)).toFixed(1));
          const totalMods = allJars.length;

          let score = 5;
          if (totalMods > 80) score += 1;
          if (totalMods > 120) score += 1;
          if (totalSizeMB > 500) score += 1;
          if (totalSizeMB > 1000) score += 1;
          if (totalSizeMB > 2000) score += 1;
          if (heavyCount >= 3) score += 1;
          if (heavyCount >= 5) score += 1;
          if (optimizationCount === 0) score += 1;
          if (optimizationCount >= 2) score -= 1;
          if (totalMods < 30) score -= 1;
          if (totalSizeMB < 300) score -= 1;
          score = Math.max(1, Math.min(10, score));

          weightReport = { score, totalMods, totalSizeMB, optimizationCount, heavyCount };
        } catch {}
      }

      return { success: true, report: { errors, warnings, okCount, total: jarFiles.length, fileStatusMap, weightReport } }; 

    } catch (error) {
      console.error(error);
      return { success: false, message: error.message };
    }
  });

  // --- SECCIÓN: Exportación ---
  ipcMain.handle('export-modpack', async (event, packPath, packName) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const zip = new AdmZip();
      zip.addLocalFolder(packPath);
      const exportDir = sanitizePath('..', packPath);
      if (!exportDir) return { success: false, message: 'Ruta de exportación inválida.' };
      const exportPath = path.join(path.dirname(packPath), `${packName}_Exportado.zip`);
      zip.writeZip(exportPath);
      shell.showItemInFolder(exportPath);
      return { success: true, path: exportPath };
    } catch (error) {
      console.error(error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('install-mod-recursively', async (event, initialVersionId, packVersion, packLoader, packPath) => {
    if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
    if (!/^[a-zA-Z0-9_-]+$/.test(initialVersionId)) return { success: false, message: 'ID de versión inválido.' };
    const modsDir = sanitizePath('mods', packPath);
    if (!modsDir) return { success: false, message: 'Ruta inválida.' };
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
        if (!fileInfo.url || !fileInfo.url.startsWith('https://')) throw new Error("URL de descarga inválida.");
        if (!fileInfo.filename || !fileInfo.filename.endsWith('.jar')) throw new Error("El archivo descargado no es un .jar.");
        const modRes = await fetch(fileInfo.url);
        const contentLength = modRes.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > MAX_DOWNLOAD_SIZE) throw new Error("El archivo excede el tamaño máximo de descarga.");
        const buffer = await modRes.arrayBuffer();
        if (buffer.byteLength > MAX_DOWNLOAD_SIZE) throw new Error("El archivo excede el tamaño máximo de descarga.");
        const destPath = sanitizePath(fileInfo.filename, modsDir);
        if (!destPath) throw new Error("Ruta de destino inválida.");
        await fs.writeFile(destPath, Buffer.from(buffer));
        
        logs.push(`✅ Descargado: ${fileInfo.filename}`);

        if (vData.dependencies && vData.dependencies.length > 0) {
          for (const dep of vData.dependencies) {
            if (dep.dependency_type === 'required') {
              if (dep.version_id) {
                await processDependencyTree(dep.version_id);
              } else if (dep.project_id && /^[a-zA-Z0-9_-]+$/.test(dep.project_id)) {
                const safeLoader = packLoader.toLowerCase() === 'neoforge' ? 'forge' : packLoader.toLowerCase();
                const searchUrl = `https://api.modrinth.com/v2/project/${encodeURIComponent(dep.project_id)}/version?loaders=["${safeLoader}"]&game_versions=["${packVersion}"]`;
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

  ipcMain.handle('open-external-editor', async (event, filePath, packPath) => {
    try {
      const exactPath = sanitizePath(filePath, packPath);
      if (!exactPath) return { success: false, message: 'Ruta inválida.' };
      const result = await shell.openPath(exactPath);
      return { success: result === '', message: result || 'Abierto con editor predeterminado.' };
    } catch {
      return { success: false, message: 'Error al abrir archivo.' };
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
      const fullPath = sanitizePath(folderPath, packPath);
      if (!fullPath) return { success: false, message: 'Ruta inválida.' };
      const files = await fs.readdir(fullPath);
      return { success: true, files };
    } catch {
      return { success: false, message: 'Error al leer carpeta.' };
    }
  });

  ipcMain.handle('explore-jar-contents', async (event, jarName, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const jarSanitized = sanitizePath(jarName, path.join(packPath, 'mods'));
      if (!jarSanitized) return { success: false, message: 'Nombre de mod inválido.' };
      await validateFileSize(jarSanitized, MAX_ZIP_SIZE);
      const zip = new AdmZip(jarSanitized);
      const zipEntries = zip.getEntries();
      const internalFiles = [];
      zipEntries.forEach(entry => {
        if (entry.isDirectory) return;
        const pathInsideJar = entry.entryName;
        if ((pathInsideJar.startsWith('data/') && pathInsideJar.endsWith('.json')) || pathInsideJar.startsWith('defaultconfigs/')) {
          internalFiles.push(pathInsideJar);
        }
      });
      internalFiles.sort();
      return { success: true, files: internalFiles };
    } catch {
      return { success: false, message: 'Error al abrir el mod.' };
    }
  });

  ipcMain.handle('read-jar-file', async (event, jarName, internalPath, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const jarSanitized = sanitizePath(jarName, path.join(packPath, 'mods'));
      if (!jarSanitized) return { success: false, message: 'Nombre de mod inválido.' };
      await validateFileSize(jarSanitized, MAX_ZIP_SIZE);
      const zip = new AdmZip(jarSanitized);
      const entry = zip.getEntry(internalPath);
      if (!entry) return { success: false, message: 'Archivo no encontrado dentro del mod.' };
      const content = zip.readAsText(entry);
      return { success: true, content: content };
    } catch {
      return { success: false, message: 'Error al leer archivo interno.' };
    }
  });


  // Spawn control
  ipcMain.handle('inject-spawn-control', async (event, tweakData, packPath) => {
    try {
      if (!tweakData || !validateItemId(tweakData.entityId)) return { success: false, message: 'ID de entidad inválido.' };
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const kubejsPath = sanitizePath('kubejs/server_scripts', packPath);
      if (!kubejsPath) return { success: false, message: 'Ruta inválida.' };
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

      const safeSpawnEntityId = tweakData.entityId.replace(/'/g, "\\'");
      const rule = `EntityEvents.spawned(event => {\n  if (event.entity.type === '${safeSpawnEntityId}') {\n${lines.map(l => '    '+l).join('\n')}\n  }\n});\n`;
      await fs.appendFile(scriptPath, rule, 'utf-8');
      return { success: true, message: `Spawn control applied for ${safeSpawnEntityId}` };
    } catch (err) {
      return { success: false, message: 'Error al aplicar control de spawn.' };
    }
  });

  // Loot editor
  ipcMain.handle('loot-editor-apply', async (event, packPath, lootPath, patch) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta del pack inválida.' };
      const targetPath = sanitizePath(lootPath, packPath);
      if (!targetPath) return { success: false, message: 'Ruta de loot inválida.' };
      let base = {};
      try {
        await validateFileSize(targetPath, MAX_READ_SIZE);
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
      return { success: false, message: 'Error al editar loot.' };
    }
  });

  ipcMain.handle('scripts:get-tree', async (event, packPath) => {
  try {
    if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
    const scanDir = async (dirPath) => {
      const tree = [];
      try {
        const items = await fs.readdir(dirPath, { withFileTypes: true });
        for (const item of items) {
          const fullPath = path.join(dirPath, item.name);
          if (item.isDirectory()) {
            tree.push({
              type: 'folder',
              name: item.name,
              path: fullPath,
              children: await scanDir(fullPath)
            });
          } else if (item.name.endsWith('.js') || item.name.endsWith('.zs')) {
            tree.push({ type: 'file', name: item.name, path: fullPath });
          }
        }
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      return tree;
    };

    const kubejsDir = sanitizePath('kubejs', packPath);
    const scriptsDir = sanitizePath('scripts', packPath);
    const kubejsTree = kubejsDir ? await scanDir(kubejsDir) : [];
    const craftTweakerTree = scriptsDir ? await scanDir(scriptsDir) : [];

    return { 
      success: true, 
      data: { kubejs: kubejsTree, scripts: craftTweakerTree } 
    };
  } catch (err) {
    return { success: false, message: 'Error al escanear scripts.' };
  }
});

ipcMain.handle('scripts:read', async (event, filePath, packPath) => {
  try {
    const targetPath = sanitizePath(filePath, packPath);
    if (!targetPath) return { success: false, message: 'Ruta inválida.' };
    await validateFileSize(targetPath, MAX_READ_SIZE);
    const content = await fs.readFile(targetPath, 'utf-8');
    return { success: true, data: content };
  } catch {
    return { success: false, message: 'Error al leer el script.' };
  }
});

ipcMain.handle('scripts:save', async (event, filePath, content, packPath) => {
  try {
    const targetPath = sanitizePath(filePath, packPath);
    if (!targetPath) return { success: false, message: 'Ruta inválida.' };
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf-8');
    return { success: true, message: 'Script guardado correctamente.' };
  } catch {
    return { success: false, message: 'Error al guardar el script.' };
  }
});

ipcMain.handle('get-system-specs', async () => {
  try {
    // Leemos los tres pilares del rendimiento en paralelo para no bloquear el hilo
    const [mem, cpu, graphics] = await Promise.all([
      si.mem(),
      si.cpu(),
      si.graphics()
    ]);

    // Filtro heurístico para aislar la GPU dedicada (busca la de mayor VRAM)
    let bestGpu = null;
    if (graphics.controllers && graphics.controllers.length > 0) {
      bestGpu = graphics.controllers.reduce((prev, current) => {
        // systeminformation suele devolver la VRAM en Megabytes
        const prevVram = prev.vram || 0;
        const currentVram = current.vram || 0;
        return (prevVram > currentVram) ? prev : current;
      });
    }

    return {
      success: true,
      data: {
        ram: {
          // Convertimos de Bytes a Gigabytes con 2 decimales
          totalGB: parseFloat((mem.total / (1024 ** 3)).toFixed(2)),
          availableGB: parseFloat((mem.available / (1024 ** 3)).toFixed(2))
        },
        cpu: {
          manufacturer: cpu.manufacturer,
          brand: cpu.brand,
          physicalCores: cpu.physicalCores,
          logicalCores: cpu.cores
        },
        gpu: bestGpu ? {
          vendor: bestGpu.vendor,
          model: bestGpu.model,
          vramGB: bestGpu.vram ? parseFloat((bestGpu.vram / 1024).toFixed(2)) : 0
        } : null
      }
    };
  } catch (error) {
    console.error("Error escaneando el hardware:", error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('scanMods', async (event, packPath) => {
    try {
        if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
        const modsPath = sanitizePath('mods', packPath);
        if (!modsPath) return { success: false, message: 'Ruta inválida.' };
        const files = await fs.readdir(modsPath);
        const modsData = [];

        for (const file of files) {
            if (file.endsWith('.jar')) {
                const filePath = path.join(modsPath, file);
                
                const score = await calculateModImpact(filePath);

                // 2. LO AGREGAMOS AL OBJETO DEL MOD
                modsData.push({
                    id: file,
                    name: file.replace('.jar', ''),
                    version: 'Desconocida', 
                    configs: [], 
                    impactScore: score //
                });
            }
        }

        return { success: true, mods: modsData };
        
    } catch (error) {
        return { success: false, message: error.message };
    }
});

  // --- INYECCIÓN DE BALANCE DE ÍTEMS ---
  ipcMain.handle('inject-item-tweak', async (event, tweakData, packPath) => {
    try {
      if (!tweakData || !validateItemId(tweakData.itemId)) return { success: false, message: 'ID de objeto inválido.' };
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const kubejsPath = sanitizePath('kubejs/startup_scripts', packPath);
      if (!kubejsPath) return { success: false, message: 'Ruta inválida.' };
      await fs.mkdir(kubejsPath, { recursive: true });
      const scriptPath = path.join(kubejsPath, '1_item_tweaks.js');

      const safeItemId = tweakData.itemId.replace(/'/g, "\\'");
      let script = `\nItemEvents.modification(event => {\n  event.modify('${safeItemId}', item => {\n`;
      if (tweakData.damage) script += `    item.attackDamage = ${tweakData.damage};\n`;
      if (tweakData.armor) script += `    item.armorProtection = ${tweakData.armor};\n`;
      if (tweakData.toughness) script += `    item.armorToughness = ${tweakData.toughness};\n`;
      script += `  });\n});\n`;

      await fs.appendFile(scriptPath, script, 'utf-8');
      return { success: true, message: `✅ Balance inyectado exitosamente a: ${safeItemId} (Startup Script)` };
    } catch (err) {
      return { success: false, message: 'Error al inyectar ajuste de ítem.' };
    }
  });

  ipcMain.handle('inject-entity-tweak', async (event, tweakData, packPath) => {
    try {
      if (!tweakData || !validateItemId(tweakData.entityId)) return { success: false, message: 'ID de entidad inválido.' };
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const kubejsPath = sanitizePath('kubejs/server_scripts', packPath);
      if (!kubejsPath) return { success: false, message: 'Ruta inválida.' };
      await fs.mkdir(kubejsPath, { recursive: true });
      const scriptPath = path.join(kubejsPath, '2_entity_tweaks.js');

      const safeEntityId = tweakData.entityId.replace(/'/g, "\\'");
      let script = `\nEntityEvents.spawned(event => {\n  if (event.entity.type === '${safeEntityId}') {\n`;
      if (tweakData.health) {
        script += `    event.entity.setAttributeBaseValue('minecraft:generic.max_health', ${tweakData.health});\n`;
        script += `    event.entity.setHealth(${tweakData.health});\n`;
      }
      if (tweakData.damage) script += `    event.entity.setAttributeBaseValue('minecraft:generic.attack_damage', ${tweakData.damage});\n`;
      if (tweakData.speed) script += `    event.entity.setAttributeBaseValue('minecraft:generic.movement_speed', ${tweakData.speed});\n`;
      script += `  }\n});\n`;

      await fs.appendFile(scriptPath, script, 'utf-8');
      return { success: true, message: `✅ Mutación genética aplicada a: ${safeEntityId}` };
    } catch (err) {
      return { success: false, message: 'Error al inyectar mutación.' };
    }
  });


// --- SECCIÓN: Escaneo de IDs de mods ---
ipcMain.handle('scan-mod-ids', async (event, modsPath) => {
      let extractedIds = new Set(); 
      
      try {
          if (!modsPath || typeof modsPath !== 'string' || modsPath.includes('..') || modsPath.includes('~')) return [];
          if (!path.isAbsolute(modsPath)) return [];
          const normalizedPath = path.normalize(modsPath);
          const files = await fs.readdir(normalizedPath);

          for (const file of files) {
              if (file.endsWith('.jar')) {
                  try {
                      const jarPath = path.join(normalizedPath, file);
                      await validateFileSize(jarPath, MAX_ZIP_SIZE);
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

  async function calculateModImpact(filePath) {
    let score = 0;
    
    try {
        // 1. IMPACTO POR TAMAÑO BRUTO (RAM)
        const stats = await fs.stat(filePath);
        const sizeMB = stats.size / (1024 * 1024);
        
        score += Math.min(sizeMB * 1.5, 45);

        // Abrimos el mod en la memoria (súper rápido, no extrae nada al disco)
        await validateFileSize(filePath, MAX_ZIP_SIZE);
        const zip = new AdmZip(filePath);
        const zipEntries = zip.getEntries();

        let mixinCount = 0;
        let hasHeavyAssets = false;
        let isOptimization = false;

        for (const entry of zipEntries) {
            const name = entry.entryName.toLowerCase();

            // Los "mixins" son inyecciones de código profundo. Muchos mixins = más carga de procesador.
            if (name.includes('mixins.') && name.endsWith('.json')) {
                mixinCount++;
            }

            // Si el mod tiene carpetas de texturas o modelos, impactará la Tarjeta Gráfica.
            if (name.startsWith('assets/') && (name.endsWith('.png') || name.endsWith('.obj') || name.endsWith('.json'))) {
                hasHeavyAssets = true;
            }
            
            // Detección heurística de metadatos de optimización
            if (name.includes('sodium') || name.includes('lithium') || name.includes('embeddium')) {
                isOptimization = true;
            }
        }

        // Sumamos 5 puntos por cada archivo de configuración de mixins encontrado
        score += (mixinCount * 5);

        // Sumamos 15 puntos fijos si trae muchos recursos visuales
        if (hasHeavyAssets) {
            score += 15;
        }

        // 3. BONIFICACIÓN (MODS DE OPTIMIZACIÓN)
        // Revisamos el nombre del archivo como validación final
        const fileName = path.basename(filePath).toLowerCase();
        if (isOptimization || fileName.includes('ferritecore') || fileName.includes('rubidium') || fileName.includes('sodium')) {
            score -= 60; // Restamos drásticamente el peso, haciéndolo negativo
        }

        return Math.round(score);

    } catch (error) {
        console.warn(`No se pudo analizar internamente ${filePath}:`, error.message);
        return 20; // Puntaje medio por defecto si el archivo .jar está bloqueado o corrupto
    }
}

// --- CALCULADORA HEURÍSTICA MASIVA ---
  ipcMain.handle('calculate-all-impacts', async (event, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const modsPath = sanitizePath('mods', packPath);
      if (!modsPath) return { success: false, message: 'Ruta inválida.' };
      const files = await fs.readdir(modsPath);
      const scores = {};

      for (const file of files) {
        if (file.endsWith('.jar')) {
          const filePath = path.join(modsPath, file);
          scores[file] = await calculateModImpact(filePath);
        }
      }
      return { success: true, scores };
    } catch (error) {
      return { success: false, message: error.message };
    }
  });

  // --- OPTIMIZACIÓN INTELIGENTE ---

  const OPTIMIZATION_CATEGORIES = {
    gpu_vram: {
      'sodium-options.json': { 'quality.graphics_quality': 'FANCY', 'quality.smooth_lighting': 'OFF', 'performance.fog': 'FAST' },
      'embeddium-options.json': { 'quality.graphics_quality': 'FANCY', 'quality.smooth_lighting': 'OFF', 'performance.fog': 'FAST' },
      'oculus.properties': { 'shaderPack': '', 'internalShaders': false, 'fog': false },
      'iris.properties': { 'shaderPack': '', 'internalShaders': false, 'fog': false }
    },
    cpu_maps: {
      'xaerominimap.toml': { 'enable_update_chunks': false, 'update_frequency': 0, 'enable_entity_icons': false, 'max_entities': 32 },
      'xaeroworldmap.toml': { 'enable_cave_mapping': false, 'max_zoom_level': 2 },
      'journeymap.core.config': { 'renderDistance': 2, 'surfaceMapping': false }
    },
    cpu_entities: {
      'entityculling.toml': { 'cull_blocks': true, 'cull_entities': true, 'cull_distance': 64 },
      'alexsmobs.toml': { 'limit_spawns': true, 'spawn_weight_multiplier': 0.5 },
      'iceandfire.toml': { 'dragon_spawn_distance': 1000, 'dragon_griefing': 0 },
      'physicsmod.json': { 'mobPhysics': false, 'blockPhysics': false, 'vinePhysics': false, 'itemPhysics': false }
    },
    engine_system: {
      'betterfpsdist.toml': { 'reduced_view_distance': 32, 'fast_render': true },
      'particleculling.properties': { 'cull_particles': true, 'max_particles': 200 },
      'connectivity.properties': { 'timeout': 10000, 'retry_attempts': 1 },
      'farsight.toml': { 'fake_chunks': false, 'max_chunks': 256 },
      'forge-client.toml': { 'alwaysSetupTerrainOffThread': true }
    }
  };

  const parseConfigValue = (raw, key) => {
    const ruleKey = Object.keys(OPTIMIZATION_RULES).find(r => key.endsWith(r)) || key;
    const rules = OPTIMIZATION_RULES[ruleKey];
    if (!rules) return null;
    const val = rules[key];
    if (typeof val === 'boolean') return val ? 'true' : 'false';
    if (typeof val === 'number') return String(val);
    return val;
  };

  ipcMain.handle('optimization:start', async (event, packPath, selectedCategories = ['gpu_vram', 'cpu_maps', 'cpu_entities', 'engine_system']) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const configDir = sanitizePath('config', packPath);
      const backupDir = sanitizePath('.modpack_assist_backups', packPath);
      if (!configDir || !backupDir) return { success: false, message: 'Ruta inválida.' };
      await fs.mkdir(backupDir, { recursive: true });

      let allFiles;
      try { allFiles = await fs.readdir(configDir); } catch { return { success: false, message: 'No se encontró carpeta config/' }; }

      const results = [];

      // 1. Unimos las reglas SOLO de las categorías que el usuario seleccionó
      let activeRules = {};
      for (const cat of selectedCategories) {
        if (OPTIMIZATION_CATEGORIES[cat]) {
          Object.assign(activeRules, OPTIMIZATION_CATEGORIES[cat]);
        }
      }

      // 2. Aplicar las reglas activas (Cambia OPTIMIZATION_RULES por activeRules)
      for (const [ruleFile, rules] of Object.entries(activeRules)) {
        const match = allFiles.find(f => f.toLowerCase() === ruleFile.toLowerCase() || f.toLowerCase().endsWith('/' + ruleFile.toLowerCase()));
        if (!match) continue;

        const fullPath = path.join(configDir, match);
        const backupPath = path.join(backupDir, match);

        // Backup
        await fs.copyFile(fullPath, backupPath);

        const ext = path.extname(match).toLowerCase();
        await validateFileSize(fullPath, MAX_READ_SIZE);
        let raw = await fs.readFile(fullPath, 'utf-8');
        let modified = false;

        if (ext === '.toml') {
          for (const [key, value] of Object.entries(rules)) {
            const oldKey = key;
            const regex = new RegExp(`^${oldKey}\\s*=\\s*.*$`, 'm');
            if (regex.test(raw)) {
              raw = raw.replace(regex, `${oldKey} = ${value}`);
              modified = true;
            } else {
              raw += `\n${oldKey} = ${value}`;
              modified = true;
            }
          }
        } else if (ext === '.json') {
          let obj;
          try {
            obj = JSON.parse(raw);
            for (const [jkey, jval] of Object.entries(rules)) {
              const jparts = jkey.split('.');
              let cur = obj;
              for (let i = 0; i < jparts.length - 1; i++) {
                if (!cur[jparts[i]]) cur[jparts[i]] = {};
                cur = cur[jparts[i]];
              }
              cur[jparts[jparts.length - 1]] = jval;
            }
            raw = JSON.stringify(obj, null, 2);
            modified = true;
          } catch { /* skip invalid json */ }
        } else if (ext === '.properties' || ext === '.cfg') {
          for (const [key, value] of Object.entries(rules)) {
            const regex = new RegExp(`^[#!]?\\s*${key}\\s*[=:]\\s*.*$`, 'm');
            if (regex.test(raw)) {
              raw = raw.replace(regex, `${key}=${value}`);
              modified = true;
            } else {
              raw += `\n${key}=${value}`;
              modified = true;
            }
          }
        }

        if (modified) {
          await fs.writeFile(fullPath, raw, 'utf-8');
          results.push({ file: match, status: 'optimized' });
        } else {
          await fs.copyFile(backupPath, fullPath); // restore unmodified backup
          await fs.unlink(backupPath);
        }
      }

      if (results.length === 0) {
        await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
        return { success: true, message: 'No se encontraron archivos optimizables.', results: [] };
      }

      return { success: true, message: `Optimizados ${results.length} archivos.`, results };
    } catch (err) {
      return { success: false, message: 'Error al optimizar el modpack.' };
    }
  });

  ipcMain.handle('optimization:rollback', async (event, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const backupDir = sanitizePath('.modpack_assist_backups', packPath);
      const configDir = sanitizePath('config', packPath);
      if (!backupDir || !configDir) return { success: false, message: 'Ruta inválida.' };

      let backupFiles;
      try { backupFiles = await fs.readdir(backupDir); } catch { return { success: false, message: 'No hay respaldo disponible.' }; }

      for (const file of backupFiles) {
        const src = path.join(backupDir, file);
        const dst = path.join(configDir, file);
        await fs.copyFile(src, dst);
      }

      await fs.rm(backupDir, { recursive: true, force: true });

      return { success: true, message: `Restaurados ${backupFiles.length} archivos.` };
    } catch {
      return { success: false, message: 'Error al restaurar el respaldo.' };
    }
  });

  ipcMain.handle('optimization:check-status', async (event, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const backupDir = sanitizePath('.modpack_assist_backups', packPath);
      if (!backupDir) return { success: false, hasBackup: false, fileCount: 0 };
      let files = [];
      try { files = await fs.readdir(backupDir); } catch { /* no backup */ }
      return { success: true, hasBackup: files.length > 0, fileCount: files.length };
    } catch (err) {
      return { success: false, hasBackup: false, fileCount: 0 };
    }
  });

app.on('window-all-closed', () => { 
  if (process.platform !== 'darwin') app.quit(); 
});
