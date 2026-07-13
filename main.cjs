const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
const dotenv = require('dotenv');
const si = require('systeminformation');
const logger = require('./logger.cjs');
const errors = require('./services/errors.cjs');
const opt = require('./services/optimizationManager.cjs');
const sec = require('./services/security.cjs');
const constants = require('./constants.cjs');
const Bottleneck = require('bottleneck');

function deepMerge(target, source) {
  const output = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
      output[key] = deepMerge(target[key], source[key]);
    } else {
      output[key] = source[key];
    }
  }
  return output;
}

const { getOptimizationLoader } = require('./services/optimizationConfigLoader.cjs');
const { getHardwareOptimizationProfile, getCategoryDescriptions } = require('./services/hardwareRecommendations.cjs');
const { getSearchCache } = require('./services/searchCache.cjs');
const bottleneck = require('./services/bottleneckDetection.cjs');
const apiStatus = require('./services/apiStatus.cjs');

dotenv.config({ path: path.join(process.cwd(), '.env') });

process.on('uncaughtException', (error) => {
  logger.error(`[UNCAUGHT_EXCEPTION] ${error.message}`, { stack: error.stack });
});

process.on('unhandledRejection', (reason) => {
  const message = reason?.message || reason || 'Unknown reason';
  logger.error(`[UNHANDLED_REJECTION] ${message}`, { stack: reason?.stack });
});

const CF_API_KEY = process.env.CURSEFORGE_API_KEY;

const rateLimiter = new Bottleneck({ minTime: 100 });

const wrapClientWithRateLimit = (client) => {
  const wrapped = {};
  for (const [key, fn] of Object.entries(client)) {
    if (typeof fn === 'function') {
      wrapped[key] = rateLimiter.wrap(fn);
    }
  }
  return wrapped;
};

const apiClientsPromise = Promise.all([
  import('./services/api/clients/curseforge.js'),
  import('./services/api/clients/modrinth.js')
]).then(([curseforge, modrinth]) => ({
  curseforge: wrapClientWithRateLimit(curseforge),
  modrinth: wrapClientWithRateLimit(modrinth)
}))
  .catch(err => {
    logger.error('[apiClientsPromise] Failed to load API clients:', err);
    return { curseforge: null, modrinth: null };
  });

const modpackScanner = require('./services/modpackScanner.js').default;

const calculateModpackWeight = (totalMods, totalSizeMB, optimizationCount, heavyCount) => {
  let score = 5;
  if (totalMods > constants.MODPACK_WEIGHT.MODS_MEDIUM) score += 1;
  if (totalMods > constants.MODPACK_WEIGHT.MODS_LARGE) score += 1;
  if (totalSizeMB > constants.MODPACK_WEIGHT.SIZE_MEDIUM) score += 1;
  if (totalSizeMB > constants.MODPACK_WEIGHT.SIZE_LARGE) score += 1;
  if (totalSizeMB > constants.MODPACK_WEIGHT.SIZE_VERY_LARGE) score += 1;
  if (heavyCount >= 3) score += 1;
  if (heavyCount >= 5) score += 1;
  if (optimizationCount === 0) score += 1;
  if (optimizationCount >= 2) score -= 1;
  if (totalMods < constants.MODPACK_WEIGHT.MODS_SMALL) score -= 1;
  if (totalSizeMB < constants.MODPACK_WEIGHT.SIZE_SMALL) score -= 1;
  score = Math.max(1, Math.min(10, score));
  return { score, totalMods, totalSizeMB, optimizationCount, heavyCount };
};

function createWindow() {
  const win = new BrowserWindow({
    width: constants.WINDOW_WIDTH, height: constants.WINDOW_HEIGHT, title: "Modpack Assist", autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), 
      nodeIntegration: false, contextIsolation: true
    }
  });
  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow(); 
  
  ipcMain.handle('dialog:openFolder', async (event, knownPath) => { return await modpackScanner.handleFolderOpen(event, knownPath); });



  ipcMain.handle('read-full-file', async (event, filePath, packPath) => {
    try {
      const targetPath = sec.sanitizePath(filePath, packPath);
      if (!targetPath) return { success: false, message: `Ruta inválida.` };
      const stats = await fs.stat(targetPath);
      if (stats.isDirectory()) {
        return { success: false, message: `⛔ '${filePath}' es una CARPETA. El editor solo puede abrir archivos.` };
      }
      await sec.validateFileSize(targetPath, sec.MAX_READ_SIZE);
      const content = await fs.readFile(targetPath, 'utf-8');
      return { success: true, content: content };
    } catch (err) {
      logger.error(`[read-full-file] ${err.message}`);
      return { success: false, message: `Error al leer el archivo.` };
    }
  });

  ipcMain.handle('write-file', async (event, filePath, packPath, content) => {
    try {
      const targetPath = sec.sanitizePath(filePath, packPath);
      if (!targetPath) return { success: false, message: `Ruta inválida.` };
      await fs.writeFile(targetPath, content, 'utf-8');
      return { success: true, message: `Sobrescritura completada.` };
    } catch (err) { logger.error(`[write-file] ${err.message}`); return { success: false, message: `Fallo al escribir archivo.` }; }
  });

  ipcMain.handle('delete-file', async (event, filePath, packPath) => {
    try {
      const targetPath = sec.sanitizePath(filePath, packPath);
      if (!targetPath) return { success: false, message: `Ruta inválida.` };
      await fs.access(targetPath);
      await fs.unlink(targetPath); 
      return { success: true, message: `Eliminación ejecutada.` };
    } catch (err) { logger.error(`[delete-file] ${err.message}`); return { success: false, message: `Archivo no localizado.` }; }
  });

  ipcMain.handle('rename-file', async (event, oldPathName, newPathName, packPath) => {
    try {
      const oldPath = sec.sanitizePath(oldPathName, packPath);
      const newPath = sec.sanitizePath(newPathName, packPath);
      if (!oldPath || !newPath) return { success: false, message: `Ruta inválida.` };
      await fs.access(oldPath);
      await fs.rename(oldPath, newPath); 
      return { success: true, message: `Renombrado completado.` };
    } catch (err) { logger.error(`[rename-file] ${err.message}`); return { success: false, message: `Origen no localizado.` }; }
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
      logger.error("Error creando proyecto:", err);
      return null;
    }
  });

  ipcMain.handle('search-mods-online', async (event, query, gameVersion, loader, sortBy = 'downloads', category = '') => {
    if (query && !/^[a-zA-Z0-9\s\-_.]+$/.test(query)) return { success: false, message: 'Consulta inválida.' };
    if (gameVersion && !sec.validateGameVersion(gameVersion)) return { success: false, message: 'Versión de MC inválida.' };
    const safeLoader = loader ? loader.toLowerCase() : "forge";
    const modloaderId = safeLoader === 'forge' ? 1 : (safeLoader === 'fabric' ? 4 : 5);
    
    try {
      const { curseforge, modrinth } = await apiClientsPromise;
      // --- 1. MODRINTH ---
      // Filtrar por loader y versión de MC
      let facetsArray = [
        [`categories:${safeLoader}`],
        [`versions:${gameVersion}`] 
      ];
      if (category) facetsArray.push([`categories:${category}`]);
      

      const modrinthRes = await modrinth.searchMods({ query, facets: facetsArray, sortBy, limit: 200 });
      const modrinthData = await modrinthRes.json();

      const modrinthResults = modrinthData.hits.map(mod => ({
        project_id: mod.project_id,
        title: mod.title,
        description: mod.description,
        icon_url: mod.icon_url ? (mod.icon_url.startsWith('http') ? mod.icon_url : `https://cdn.modrinth.com${mod.icon_url}`) : null,
        author: mod.author,
        downloads: mod.downloads,
        source: 'modrinth'
      }));

      // --- 2. CURSEFORGE (BÚSQUEDA) ---
      let curseResults = [];
      try {
        const cfSort = sortBy === 'downloads' ? 4 : (sortBy === 'newest' ? 2 : 1);
        

        const cfRes = await curseforge.searchMods({
          apiKey: CF_API_KEY,
          query,
          gameVersion,
          modloaderId,
          sortField: cfSort,
          pageSize: 50
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
          logger.warn(`⚠️ CurseForge rechazó la conexión. (${cfRes.status}): ${errorText}`);
        }
      } catch (cfError) {
        logger.warn("⚠️ No se pudo conectar a CurseForge:", cfError.message);
      }

      // --- 3. MEZCLAMOS Y FILTRAMOS ---
      const combined = [...modrinthResults, ...curseResults];
      const uniqueResults = Array.from(new Map(combined.map(item => [item.title.toLowerCase(), item])).values());

      return { success: true, results: uniqueResults };
      
    } catch (err) {
      logger.error("Error crítico en el buscador:", err);
      return { success: false, message: "Fallo de conexión principal." };
    }
  });

  ipcMain.handle('get-mod-versions', async (event, projectId, gameVersion, loader, source) => {
    if (gameVersion && !sec.validateGameVersion(gameVersion)) return { success: false, message: 'Versión de MC inválida.' };
    if (projectId && source === 'curseforge' && !/^\d+$/.test(projectId)) return { success: false, message: 'ID de proyecto inválido.' };
    try {
      const { curseforge, modrinth } = await apiClientsPromise;
      const safeLoader = loader ? loader.toLowerCase() : "forge";

       if (source === 'curseforge') {
        if (!/^\d+$/.test(projectId)) return { success: false, message: 'ID de proyecto inválido.' };
        const modloaderId = safeLoader === 'forge' ? 1 : (safeLoader === 'fabric' ? 4 : 5);
        const res = await curseforge.getModFiles({
          apiKey: CF_API_KEY,
          projectId,
          gameVersion,
          modloaderId
        });
        
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
        const res = await modrinth.getProjectVersions(projectId);
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
    } catch (err) { logger.error(`[get-mod-versions] ${err.message}`); return { success: false, message: 'Error al obtener versiones.' }; }
  });

  ipcMain.handle('download-mod', async (event, versionObj, packPath) => {
    try {
      const { curseforge, modrinth } = await apiClientsPromise;
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      let downloadUrl = '';
      let fileName = '';

      if (versionObj.source === 'curseforge') {
        if (!/^\d+$/.test(versionObj.projectId)) return { success: false, message: 'ID de proyecto de CurseForge inválido.' };
        downloadUrl = versionObj.downloadUrl;
        
        if (!downloadUrl) {

          const res = await curseforge.getDownloadUrl({
            apiKey: CF_API_KEY,
            projectId: versionObj.projectId,
            fileId: versionObj.id
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
        const res = await modrinth.getVersion(versionObj.id);
        const versionData = await res.json();
        const fileInfo = versionData.files.find(f => f.primary) || versionData.files[0];
        downloadUrl = fileInfo.url;
        fileName = fileInfo.filename;
      }

      if (!downloadUrl || !downloadUrl.startsWith('https://')) return { success: false, message: 'URL de descarga inválida.' };

      const allowedDomains = ['cdn.modrinth.com', 'files.curseforge.com'];
      let urlDomain;
      try { urlDomain = new URL(downloadUrl).hostname; } catch { return { success: false, message: 'URL de descarga inválida.' }; }
      if (!allowedDomains.includes(urlDomain)) return { success: false, message: 'Dominio de descarga no autorizado.' };

      if (!fileName || fileName.includes('..') || fileName.includes('/') || !fileName.endsWith('.jar') || /[^\x00-\x7F]/.test(fileName)) return { success: false, message: 'Nombre de archivo inválido.' };

      const modRes = await fetch(downloadUrl);
      const contentType = modRes.headers.get('content-type');
      const allowedContentTypes = ['application/java-archive', 'application/zip', 'application/x-java-archive', 'application/x-zip-compressed'];
      if (contentType && !allowedContentTypes.some(ct => contentType.includes(ct))) {
        return { success: false, message: 'Content-Type de descarga no autorizado.' };
      }
      const contentLength = modRes.headers.get('content-length');
      if (contentLength && parseInt(contentLength) > sec.MAX_DOWNLOAD_SIZE) return { success: false, message: 'El archivo excede el tamaño máximo de descarga.' };
      const buffer = await modRes.arrayBuffer();
      if (buffer.byteLength > sec.MAX_DOWNLOAD_SIZE) return { success: false, message: 'El archivo excede el tamaño máximo de descarga.' };
      
      const destPath = sec.sanitizePath(fileName, path.join(packPath, 'mods'));
      if (!destPath) return { success: false, message: 'Ruta de destino inválida.' };
      await fs.writeFile(destPath, Buffer.from(buffer));

      return { success: true, fileName: fileName };
    } catch (err) {
      logger.error(`[download-mod] ${err.message}`);
      return { success: false, message: 'Error al descargar el mod.' };
    }
});

  ipcMain.handle('assess-modpack-weight', async (event, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const modsPath = sec.sanitizePath('mods', packPath);
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

          await sec.validateFileSize(filePath, sec.MAX_ZIP_SIZE);
          const zip = new AdmZip(filePath);
          const modName = opt.getModNameFromJar(zip, file);
          if (opt.OPTIMIZATION_MODS.some(k => modName.includes(k))) optimizationCount++;
          if (opt.HEAVY_MODS.some(k => modName.includes(k))) heavyCount++;
        } catch (zipErr) {
          logger.error(`[assess-modpack-weight] zip: ${zipErr.message}`);
          totalSizeBytes += 0;
        }
      }

      const totalSizeMB = parseFloat((totalSizeBytes / (1024 * 1024)).toFixed(1));
      const totalMods = jarFiles.length;

      const weightReport = calculateModpackWeight(totalMods, totalSizeMB, optimizationCount, heavyCount);

      return { success: true, weightReport };
    } catch (error) {
      logger.error(`[assess-modpack-weight] ${error.message}`);
      return { success: false, message: 'Error al evaluar el peso del modpack.' };
    }
  });

  ipcMain.handle('diagnose-modpack', async (event, packPath) => {
    try {
      const { modrinth } = await apiClientsPromise;
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const modsPath = sec.sanitizePath('mods', packPath);
      if (!modsPath) return { success: false, message: 'Ruta inválida.' };
      const files = await fs.readdir(modsPath);
      const jarFiles = files.filter(f => f.endsWith('.jar'));

      if (jarFiles.length === 0) throw new Error("No hay mods para analizar.");

      let packVersion = "1.20.1", packLoader = "forge";
      try {
         const manifestPath = sec.sanitizePath('manifest.json', packPath);
         if (manifestPath) {
           await sec.validateFileSize(manifestPath, sec.MAX_READ_SIZE);
           const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
           packVersion = manifest.minecraft?.version || manifest.gameVersion || packVersion;
           const loaderStr = manifest.minecraft?.modLoaders?.[0]?.id || manifest._appData?.loader || packLoader;
           packLoader = loaderStr.toLowerCase().includes('fabric') ? 'fabric' : (loaderStr.toLowerCase().includes('neoforge') ? 'neoforge' : 'forge');
         }
      } catch(e) { logger.error(`[diagnose-modpack] parseLoader: ${e.message}`); }

      const { fileHashes } = await new Promise((resolve, reject) => {
        const { Worker } = require('worker_threads');
        const worker = new Worker(path.join(__dirname, 'services/workers/modAnalysisWorker.cjs'), {
          workerData: { task: 'compute-hashes', modsPath, jarFiles }
        });
        worker.on('message', (msg) => { if (msg.type === 'result') resolve(msg); });
        worker.on('error', (err) => reject(err));
        worker.on('exit', (code) => { if (code !== 0) reject(new Error('Worker crashed.')); });
      });
      const hashArray = Object.keys(fileHashes);

      const res = await modrinth.getVersionsByHashes({ hashes: hashArray, algorithm: "sha1" });

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
              await sec.validateFileSize(filePath, sec.MAX_ZIP_SIZE);
              const zip = new AdmZip(filePath);
              const modName = opt.getModNameFromJar(zip, file);
              if (opt.OPTIMIZATION_MODS.some(k => modName.includes(k))) optimizationCount++;
              if (opt.HEAVY_MODS.some(k => modName.includes(k))) heavyCount++;
            } catch (zipErr) { logger.error(`[diagnose-modpack] zip: ${zipErr.message}`); }
          }

          const totalSizeMB = parseFloat((totalSizeBytes / (1024 * 1024)).toFixed(1));
          const totalMods = allJars.length;

          weightReport = calculateModpackWeight(totalMods, totalSizeMB, optimizationCount, heavyCount);
        } catch (weightErr) { logger.error(`[diagnose-modpack] weight: ${weightErr.message}`); }
      }

      return { success: true, report: { errors, warnings, okCount, total: jarFiles.length, fileStatusMap, weightReport } };

    } catch (error) {
      logger.error(`[diagnose-modpack] ${error.message}`);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('export-modpack', async (event, packPath, packName) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const absPackPath = path.resolve(packPath);
      if (!absPackPath.startsWith(path.resolve(process.cwd()))) return { success: false, message: 'Ruta fuera del directorio autorizado.' };
      const zip = new AdmZip();
      zip.addLocalFolder(packPath);
      const exportDir = sec.sanitizePath('..', packPath);
      if (!exportDir) return { success: false, message: 'Ruta de exportación inválida.' };
      const exportPath = path.join(path.dirname(packPath), `${packName}_Exportado.zip`);
      const absExportPath = path.resolve(exportPath);
      if (!absExportPath.startsWith(path.resolve(process.cwd()))) return { success: false, message: 'Ruta de exportación fuera del directorio autorizado.' };
      zip.writeZip(exportPath);
      shell.showItemInFolder(exportPath);
      return { success: true, path: exportPath };
    } catch (error) {
      logger.error(error);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('install-mod-recursively', async (event, initialVersionId, packVersion, packLoader, packPath) => {
    if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
    if (!/^[a-zA-Z0-9_-]+$/.test(initialVersionId)) return { success: false, message: 'ID de versión inválido.' };
    if (packVersion && !sec.validateGameVersion(packVersion)) return { success: false, message: 'Versión de MC inválida.' };
    const modsDir = sec.sanitizePath('mods', packPath);
    if (!modsDir) return { success: false, message: 'Ruta inválida.' };
    const { modrinth } = await apiClientsPromise;
    const downloadedIds = new Set();
    const logs = [];

    const processDependencyTree = async (versionId) => {
      if (downloadedIds.has(versionId)) return;
      downloadedIds.add(versionId);

      try {
        const res = await modrinth.getVersion(versionId);
        if (!res.ok) throw new Error("No se encontró la versión en Modrinth.");
        const vData = await res.json();

        const fileInfo = vData.files.find(f => f.primary) || vData.files[0];
        if (!fileInfo.url || !fileInfo.url.startsWith('https://')) throw new Error("URL de descarga inválida.");
        if (!fileInfo.filename || !fileInfo.filename.endsWith('.jar')) throw new Error("El archivo descargado no es un .jar.");
        const modRes = await fetch(fileInfo.url);
        const contentLength = modRes.headers.get('content-length');
        if (contentLength && parseInt(contentLength) > sec.MAX_DOWNLOAD_SIZE) throw new Error("El archivo excede el tamaño máximo de descarga.");
        const buffer = await modRes.arrayBuffer();
        if (buffer.byteLength > sec.MAX_DOWNLOAD_SIZE) throw new Error("El archivo excede el tamaño máximo de descarga.");
        const destPath = sec.sanitizePath(fileInfo.filename, modsDir);
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
                const depRes = await modrinth.getProjectVersionsByFilters({
                  projectId: dep.project_id,
                  loaders: [safeLoader],
                  gameVersions: [packVersion]
                });
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
      const exactPath = sec.sanitizePath(filePath, packPath);
      if (!exactPath) return { success: false, message: 'Ruta inválida.' };
      const result = await shell.openPath(exactPath);
      return { success: result === '', message: result || 'Abierto con editor predeterminado.' };
    } catch (err) {
      logger.error(`[open-external-editor] ${err.message}`);
      return { success: false, message: 'Error al abrir archivo.' };
    }
  });

  ipcMain.handle('get-game-versions', async () => {
    try {
      const { modrinth } = await apiClientsPromise;
      const res = await modrinth.getGameVersions();
      if (!res.ok) throw new Error("Fallo de red");
      
      const versions = await res.json();
      return { success: true, versions: versions };
    } catch (error) {
      logger.error("Error al obtener versiones:", error);
      return { success: false, message: error.message };
    }
  });

}); 

//  Escanear contenido de una subcarpeta ---
  ipcMain.handle('list-folder-content', async (event, folderPath, packPath) => {
    try {
      const fullPath = sec.sanitizePath(folderPath, packPath);
      if (!fullPath) return { success: false, message: 'Ruta inválida.' };
      const files = await fs.readdir(fullPath);
      return { success: true, files };
    } catch (err) {
      logger.error(`[list-folder-content] ${err.message}`);
      return { success: false, message: 'Error al leer carpeta.' };
    }
  });

  ipcMain.handle('explore-jar-contents', async (event, jarName, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const jarSanitized = sec.sanitizePath(jarName, path.join(packPath, 'mods'));
      if (!jarSanitized) return { success: false, message: 'Nombre de mod inválido.' };
      await sec.validateFileSize(jarSanitized, sec.MAX_ZIP_SIZE);
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
    } catch (err) {
      logger.error(`[explore-jar-contents] ${err.message}`);
      return { success: false, message: 'Error al abrir el mod.' };
    }
  });

  ipcMain.handle('read-jar-file', async (event, jarName, internalPath, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const jarSanitized = sec.sanitizePath(jarName, path.join(packPath, 'mods'));
      if (!jarSanitized) return { success: false, message: 'Nombre de mod inválido.' };
      await sec.validateFileSize(jarSanitized, sec.MAX_ZIP_SIZE);
      const zip = new AdmZip(jarSanitized);
      const entry = zip.getEntry(internalPath);
      if (!entry) return { success: false, message: 'Archivo no encontrado dentro del mod.' };
      const content = zip.readAsText(entry);
      return { success: true, content: content };
    } catch (err) {
      logger.error(`[read-jar-file] ${err.message}`);
      return { success: false, message: 'Error al leer archivo interno.' };
    }
  });

  // Spawn control
  ipcMain.handle('inject-spawn-control', async (event, tweakData, packPath) => {
    try {
      if (!tweakData || !sec.validateItemId(tweakData.entityId)) return { success: false, message: 'ID de entidad inválido.' };
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const kubejsPath = sec.sanitizePath('kubejs/server_scripts', packPath);
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

      const safeSpawnEntityId = sec.sanitizeForScript(tweakData.entityId);
      const rule = `EntityEvents.spawned(event => {\n  if (event.entity.type === '${safeSpawnEntityId}') {\n${lines.map(l => '    '+l).join('\n')}\n  }\n});\n`;
      await fs.appendFile(scriptPath, rule, 'utf-8');
      return { success: true, message: `Spawn control applied for ${safeSpawnEntityId}` };
    } catch (err) {
      logger.error(`[inject-spawn-control] ${err.message}`);
      return { success: false, message: 'Error al aplicar control de spawn.' };
    }
  });

  // Loot editor
  ipcMain.handle('loot-editor-apply', async (event, packPath, lootPath, patch) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta del pack inválida.' };
      const targetPath = sec.sanitizePath(lootPath, packPath);
      if (!targetPath) return { success: false, message: 'Ruta de loot inválida.' };
      let base = {};
      try {
        await sec.validateFileSize(targetPath, sec.MAX_READ_SIZE);
        const raw = await fs.readFile(targetPath, 'utf-8');
        base = JSON.parse(raw);
      } catch (readErr) {
        logger.error(`[loot-editor-apply] read: ${readErr.message}`);
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
      logger.error(`[loot-editor-apply] ${err.message}`);
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

    const kubejsDir = sec.sanitizePath('kubejs', packPath);
    const scriptsDir = sec.sanitizePath('scripts', packPath);
    const kubejsTree = kubejsDir ? await scanDir(kubejsDir) : [];
    const craftTweakerTree = scriptsDir ? await scanDir(scriptsDir) : [];

    return { 
      success: true, 
      data: { kubejs: kubejsTree, scripts: craftTweakerTree } 
    };
  } catch (err) {
    logger.error(`[scripts:get-tree] ${err.message}`);
    return { success: false, message: 'Error al escanear scripts.' };
  }
});

ipcMain.handle('scripts:read', async (event, filePath, packPath) => {
  try {
    const targetPath = sec.sanitizePath(filePath, packPath);
    if (!targetPath) return { success: false, message: 'Ruta inválida.' };
    await sec.validateFileSize(targetPath, sec.MAX_READ_SIZE);
    const content = await fs.readFile(targetPath, 'utf-8');
    return { success: true, data: content };
  } catch (err) {
    logger.error(`[scripts:read] ${err.message}`);
    return { success: false, message: 'Error al leer el script.' };
  }
});

ipcMain.handle('scripts:save', async (event, filePath, content, packPath) => {
  try {
    const targetPath = sec.sanitizePath(filePath, packPath);
    if (!targetPath) return { success: false, message: 'Ruta inválida.' };
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, 'utf-8');
    return { success: true, message: 'Script guardado correctamente.' };
  } catch (err) {
    logger.error(`[scripts:save] ${err.message}`);
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
    logger.error("Error escaneando el hardware:", error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('scanMods', async (event, packPath) => {
    try {
        if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
        const modsPath = sec.sanitizePath('mods', packPath);
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
        logger.error(`[scanMods] ${error.message}`);
        return { success: false, message: error.message };
    }
});

  // --- INYECCIÓN DE BALANCE DE ÍTEMS ---
  ipcMain.handle('inject-item-tweak', async (event, tweakData, packPath) => {
    try {
      if (!tweakData || !sec.validateItemId(tweakData.itemId)) return { success: false, message: 'ID de objeto inválido.' };
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const kubejsPath = sec.sanitizePath('kubejs/startup_scripts', packPath);
      if (!kubejsPath) return { success: false, message: 'Ruta inválida.' };
      await fs.mkdir(kubejsPath, { recursive: true });
      const scriptPath = path.join(kubejsPath, '1_item_tweaks.js');

      const safeItemId = sec.sanitizeForScript(tweakData.itemId);
      let script = `\nItemEvents.modification(event => {\n  event.modify('${safeItemId}', item => {\n`;
      if (tweakData.damage) script += `    item.attackDamage = ${tweakData.damage};\n`;
      if (tweakData.armor) script += `    item.armorProtection = ${tweakData.armor};\n`;
      if (tweakData.toughness) script += `    item.armorToughness = ${tweakData.toughness};\n`;
      script += `  });\n});\n`;

      await fs.appendFile(scriptPath, script, 'utf-8');
      return { success: true, message: `✅ Balance inyectado exitosamente a: ${safeItemId} (Startup Script)` };
    } catch (err) {
      logger.error(`[inject-item-tweak] ${err.message}`);
      return { success: false, message: 'Error al inyectar ajuste de ítem.' };
    }
  });

  ipcMain.handle('inject-entity-tweak', async (event, tweakData, packPath) => {
    try {
      if (!tweakData || !sec.validateItemId(tweakData.entityId)) return { success: false, message: 'ID de entidad inválido.' };
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const kubejsPath = sec.sanitizePath('kubejs/server_scripts', packPath);
      if (!kubejsPath) return { success: false, message: 'Ruta inválida.' };
      await fs.mkdir(kubejsPath, { recursive: true });
      const scriptPath = path.join(kubejsPath, '2_entity_tweaks.js');

      const safeEntityId = sec.sanitizeForScript(tweakData.entityId);
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
      logger.error(`[inject-entity-tweak] ${err.message}`);
      return { success: false, message: 'Error al inyectar mutación.' };
    }
  });


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
                      await sec.validateFileSize(jarPath, sec.MAX_ZIP_SIZE);
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
          logger.error("Error al leer la carpeta mods:", error);
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
        await sec.validateFileSize(filePath, sec.MAX_ZIP_SIZE);
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
        logger.warn(`No se pudo analizar internamente ${filePath}:`, error.message);
        return 20; // Puntaje medio por defecto si el archivo .jar está bloqueado o corrupto
    }
}

// --- CALCULADORA HEURÍSTICA MASIVA ---
  ipcMain.handle('calculate-all-impacts', async (event, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const modsPath = sec.sanitizePath('mods', packPath);
      if (!modsPath) return { success: false, message: 'Ruta inválida.' };
      const files = await fs.readdir(modsPath);
      const jarFiles = files.filter(f => f.endsWith('.jar'));

      return new Promise((resolve) => {
        const { Worker } = require('worker_threads');
        const worker = new Worker(path.join(__dirname, 'services/workers/modAnalysisWorker.cjs'), {
          workerData: { task: 'calculate-impacts', modsPath, jarFiles }
        });
        worker.on('message', (msg) => {
          if (msg.type === 'result') resolve({ success: true, scores: msg.scores });
        });
        worker.on('error', (err) => resolve({ success: false, message: err.message }));
        worker.on('exit', (code) => { if (code !== 0) resolve({ success: false, message: 'Worker crashed.' }); });
      });
    } catch (error) {
      logger.error(`[calculate-all-impacts] ${error.message}`);
      return { success: false, message: error.message };
    }
  });

  // --- OPTIMIZACIÓN INTELIGENTE ---

  let optimizationLoader = null;

  async function getOptimizationRules(selectedCategories, profileId = 'default') {
    if (!optimizationLoader) {
      optimizationLoader = getOptimizationLoader();
      await optimizationLoader.loadConfigs();
    }

    // Load base rules from profile
    let baseRules = {};
    const profile = optimizationLoader.getConfig(profileId);
    
    if (profile && profile.categories) {
      // Merge all categories from the profile
      for (const [catName, catRules] of Object.entries(profile.categories)) {
        Object.assign(baseRules, catRules);
      }
    } else if (profileId === 'default') {
      // Fallback to builtin default from optimizationManager
      for (const cat of selectedCategories) {
        if (opt.OPTIMIZATION_CATEGORIES[cat]) {
          Object.assign(baseRules, opt.OPTIMIZATION_CATEGORIES[cat]);
        }
      }
    }

    // Filter by selectedCategories - only keep rules from selected categories
    const activeRules = {};
    for (const cat of selectedCategories) {
      if (profile && profile.categories && profile.categories[cat]) {
        // If profile has this category, use it
        for (const [file, rules] of Object.entries(profile.categories[cat])) {
          Object.assign(activeRules, { [file]: rules });
        }
      } else if (opt.OPTIMIZATION_CATEGORIES[cat]) {
        // Otherwise use builtin
        for (const [file, rules] of Object.entries(opt.OPTIMIZATION_CATEGORIES[cat])) {
          Object.assign(activeRules, { [file]: rules });
        }
      }
    }

    // If no rules matched selectedCategories, return all base rules
    return Object.keys(activeRules).length > 0 ? activeRules : baseRules;
  }

  ipcMain.handle('optimization:start', async (event, packPath, selectedCategories = ['gpu_vram', 'cpu_maps', 'cpu_entities', 'engine_system'], profileId = 'default') => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const configDir = sec.sanitizePath('config', packPath);
      const backupDir = sec.sanitizePath('.modpack_assist_backups', packPath);
      if (!configDir || !backupDir) return { success: false, message: 'Ruta inválida.' };
      await fs.mkdir(backupDir, { recursive: true });

      let allFiles;
      try { allFiles = await fs.readdir(configDir); } catch (err) { logger.error(`[optimization:start] ${err.message}`); return { success: false, message: 'No se encontró carpeta config/' }; }

      const results = [];

      // 1. Obtener reglas desde el loader dinámico o builtin
      let activeRules = await getOptimizationRules(selectedCategories, profileId);

      // 2. Aplicar las reglas activas
      for (const [ruleFile, rules] of Object.entries(activeRules)) {
        const match = allFiles.find(f => f.toLowerCase() === ruleFile.toLowerCase() || f.toLowerCase().endsWith('/' + ruleFile.toLowerCase()));
        if (!match) continue;

        const fullPath = path.join(configDir, match);
        const backupPath = path.join(backupDir, match);

        // Backup
        await fs.copyFile(fullPath, backupPath);

        const ext = path.extname(match).toLowerCase();
        await sec.validateFileSize(fullPath, sec.MAX_READ_SIZE);
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
            const mergedRules = {};
            for (const [jkey, jval] of Object.entries(rules)) {
              const jparts = jkey.split('.');
              let cur = mergedRules;
              for (let i = 0; i < jparts.length - 1; i++) {
                if (!cur[jparts[i]]) cur[jparts[i]] = {};
                cur = cur[jparts[i]];
              }
              cur[jparts[jparts.length - 1]] = jval;
            }
            obj = deepMerge(obj, mergedRules);
            raw = JSON.stringify(obj, null, 2);
            modified = true;
          } catch (parseErr) { logger.error(`[optimization:start] JSON inválido en ${match}: ${parseErr.message}`); }
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
      const backupDir = sec.sanitizePath('.modpack_assist_backups', packPath);
      const configDir = sec.sanitizePath('config', packPath);
      if (!backupDir || !configDir) return { success: false, message: 'Ruta inválida.' };

      let backupFiles;
      try { backupFiles = await fs.readdir(backupDir); } catch (err) { logger.error(`[optimization:rollback] ${err.message}`); return { success: false, message: 'No hay respaldo disponible.' }; }

      for (const file of backupFiles) {
        const src = path.join(backupDir, file);
        const dst = path.join(configDir, file);
        await fs.copyFile(src, dst);
      }

      await fs.rm(backupDir, { recursive: true, force: true });

      return { success: true, message: `Restaurados ${backupFiles.length} archivos.` };
    } catch (err) {
      logger.error(`[optimization:rollback] ${err.message}`);
      return { success: false, message: 'Error al restaurar el respaldo.' };
    }
  });

  ipcMain.handle('optimization:check-status', async (event, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) return { success: false, message: 'Ruta inválida.' };
      const backupDir = sec.sanitizePath('.modpack_assist_backups', packPath);
      if (!backupDir) return { success: false, hasBackup: false, fileCount: 0 };
      let files = [];
      try { files = await fs.readdir(backupDir); } catch (e) { logger.error(`[optimization:check-status] ${e.message}`); }
      return { success: true, hasBackup: files.length > 0, fileCount: files.length };
    } catch (err) {
      return { success: false, hasBackup: false, fileCount: 0 };
    }
  });

  // --- OPTIMIZATION CONFIG LOADER HANDLERS ---
  ipcMain.handle('optimization:configs:list', async () => {
    try {
      if (!optimizationLoader) {
        optimizationLoader = getOptimizationLoader();
        await optimizationLoader.loadConfigs();
      }
      return { success: true, configs: optimizationLoader.getAllConfigs() };
    } catch (err) {
      logger.error(`[optimization:configs:list] ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('optimization:configs:get', async (event, configId) => {
    try {
      if (!optimizationLoader) {
        optimizationLoader = getOptimizationLoader();
        await optimizationLoader.loadConfigs();
      }
      const config = optimizationLoader.getConfig(configId);
      if (!config) {
        return { success: false, message: 'Config not found' };
      }
      return { success: true, config: optimizationLoader.sanitizeConfig(config) };
    } catch (err) {
      logger.error(`[optimization:configs:get] ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('optimization:configs:categories', async () => {
    try {
      if (!optimizationLoader) {
        optimizationLoader = getOptimizationLoader();
        await optimizationLoader.loadConfigs();
      }
      return { success: true, categories: optimizationLoader.getCategories() };
    } catch (err) {
      logger.error(`[optimization:configs:categories] ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('optimization:configs:create', async (event, config) => {
    try {
      if (!optimizationLoader) {
        optimizationLoader = getOptimizationLoader();
        await optimizationLoader.loadConfigs();
      }
      const created = await optimizationLoader.createConfig(config);
      return { success: true, config: optimizationLoader.sanitizeConfig(created) };
    } catch (err) {
      logger.error(`[optimization:configs:create] ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('optimization:configs:delete', async (event, configId) => {
    try {
      if (!optimizationLoader) {
        optimizationLoader = getOptimizationLoader();
        await optimizationLoader.loadConfigs();
      }
      const deleted = await optimizationLoader.deleteConfig(configId);
      return { success: deleted, message: deleted ? 'Config deleted' : 'Config not found' };
    } catch (err) {
      logger.error(`[optimization:configs:delete] ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('optimization:configs:reload', async () => {
    try {
      if (!optimizationLoader) {
        optimizationLoader = getOptimizationLoader();
      }
      await optimizationLoader.loadConfigs();
      return { success: true, configs: optimizationLoader.getAllConfigs() };
    } catch (err) {
      logger.error(`[optimization:configs:reload] ${err.message}`);
      return { success: false, message: err.message };
    }
  });

  ipcMain.handle('optimization:hardware:recommend', async () => {
    try {
      const [mem, cpu, graphics] = await Promise.all([
        si.mem(),
        si.cpu(),
        si.graphics()
      ]);

      let bestGpu = null;
      if (graphics.controllers && graphics.controllers.length > 0) {
        bestGpu = graphics.controllers.reduce((prev, current) => {
          const prevVram = prev.vram || 0;
          const currentVram = current.vram || 0;
          return (prevVram > currentVram) ? prev : current;
        });
      }

      const hardware = {
        ram: {
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
      };

      const result = await getHardwareOptimizationProfile(hardware);
      result.categoryDescriptions = getCategoryDescriptions();

      return { success: true, data: result };
    } catch (error) {
      logger.error(`[optimization:hardware:recommend] ${error.message}`);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('optimization:hardware:categories', async () => {
    return { success: true, categories: getCategoryDescriptions() };
  });

  ipcMain.handle('optimization:bottlenecks:analyze', async (event, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) {
        return { success: false, message: 'Ruta inválida.' };
      }

      const [mem, cpu, graphics] = await Promise.all([
        si.mem(),
        si.cpu(),
        si.graphics()
      ]);

      let bestGpu = null;
      if (graphics.controllers && graphics.controllers.length > 0) {
        bestGpu = graphics.controllers.reduce((prev, current) => {
          const prevVram = prev.vram || 0;
          const currentVram = current.vram || 0;
          return (prevVram > currentVram) ? prev : current;
        });
      }

      const hardwareSpecs = {
        ram: {
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
      };

      const report = await bottleneck.analyzeBottlenecks(packPath, hardwareSpecs);
      return { success: true, report };
    } catch (error) {
      logger.error(`[optimization:bottlenecks:analyze] ${error.message}`);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('optimization:bottlenecks:quickscan', async (event, packPath) => {
    try {
      if (!packPath || packPath.includes('..') || packPath.includes('~')) {
        return { success: false, message: 'Ruta inválida.' };
      }
      const scan = await bottleneck.quickScan(packPath);
      return { success: true, scan };
    } catch (error) {
      logger.error(`[optimization:bottlenecks:quickscan] ${error.message}`);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('api:status', async () => {
    try {
      const status = await apiStatus.getStatus();
      return { success: true, status };
    } catch (error) {
      logger.error(`[api:status] ${error.message}`);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('api:status:refresh', async () => {
    try {
      const status = await apiStatus.forceRefresh();
      return { success: true, status };
    } catch (error) {
      logger.error(`[api:status:refresh] ${error.message}`);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('search:cache:clear', async () => {
    try {
      const cache = getSearchCache({ maxSizeMB: 50, maxEntries: 500 });
      await cache.clear();
      return { success: true, message: 'Caché de búsqueda limpiado' };
    } catch (error) {
      logger.error(`[search:cache:clear] ${error.message}`);
      return { success: false, message: error.message };
    }
  });

  ipcMain.handle('search:cache:stats', async () => {
    try {
      const cache = getSearchCache({ maxSizeMB: 50, maxEntries: 500 });
      const stats = await cache.getStats();
      return { success: true, stats };
    } catch (error) {
      logger.error(`[search:cache:stats] ${error.message}`);
      return { success: false, message: error.message };
    }
  });

app.on('window-all-closed', () => { 
  if (process.platform !== 'darwin') app.quit(); 
});
