const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const { Worker } = require('worker_threads');
const AdmZip = require('adm-zip');
const dotenv = require('dotenv');
const si = require('systeminformation');
const Bottleneck = require('bottleneck');

const logger = require('./logger.cjs');
const opt = require('./services/optimizationManager.cjs');
const sec = require('./services/security.cjs');
const constants = require('./constants.cjs');
const { getOptimizationLoader } = require('./services/optimizationConfigLoader.cjs');
const { getHardwareOptimizationProfile, getCategoryDescriptions } = require('./services/hardwareRecommendations.cjs');
const { getSearchCache } = require('./services/searchCache.cjs');
const bottleneck = require('./services/bottleneckDetection.cjs');
const apiStatus = require('./services/apiStatus.cjs');
const modpackScanner = require('./services/modpackScanner.js').default;
const { calculateModpackWeight } = require('./services/modpackWeight.cjs');
const tweaksManager = require('./services/tweaksManager.cjs');
const { scanModIds } = require('./services/modIdScanner.cjs');

// Merge profundo protegido contra prototype pollution y sin corromper arreglos
function deepMerge(target, source) {
  const output = { ...target };
  if (!source || typeof source !== 'object' || Array.isArray(source)) return output;
  for (const key of Object.keys(source)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    const srcVal = source[key];
    const tgtVal = target ? target[key] : undefined;
    if (
      srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal) &&
      tgtVal && typeof tgtVal === 'object' && !Array.isArray(tgtVal)
    ) {
      output[key] = deepMerge(tgtVal, srcVal);
    } else {
      output[key] = srcVal;
    }
  }
  return output;
}

const envCandidates = [
  path.join(__dirname, '.env'),
  path.join(process.cwd(), '.env'),
  path.join(__dirname, '..', '..', '.env'),
  path.join(__dirname, '..', '..', '..', '.env'),
];
for (const envPath of envCandidates) {
  if (fsSync.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

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
  import('./services/api/clients/modrinth.js'),
])
  .then(([curseforge, modrinth]) => ({
    curseforge: wrapClientWithRateLimit(curseforge),
    modrinth: wrapClientWithRateLimit(modrinth),
  }))
  .catch(err => {
    logger.error('[apiClientsPromise] Failed to load API clients:', err);
    return { curseforge: null, modrinth: null };
  });

// Verifica que la ruta pertenezca a un modpack autorizado en esta sesion
async function ensureAuthorizedPack(packPath) {
  if (!packPath || typeof packPath !== 'string' || packPath.includes('..') || packPath.includes('~')) {
    return false;
  }
  if (sec.isAuthorizedPackPath(packPath)) return true;
  const valid = await sec.looksLikeModpackRoot(packPath);
  if (valid) {
    sec.authorizePackPath(packPath);
    return true;
  }
  return false;
}

// Recolecta especificaciones de hardware en un unico lugar reutilizable
async function collectHardwareSpecs() {
  const [mem, cpu, graphics] = await Promise.all([
    si.mem(),
    si.cpu(),
    si.graphics(),
  ]);

  let bestGpu = null;
  if (graphics.controllers && graphics.controllers.length > 0) {
    bestGpu = graphics.controllers.reduce((prev, current) => {
      const prevVram = prev.vram || 0;
      const currentVram = current.vram || 0;
      return prevVram > currentVram ? prev : current;
    });
  }

  return {
    ram: {
      totalGB: parseFloat((mem.total / (1024 ** 3)).toFixed(2)),
      availableGB: parseFloat((mem.available / (1024 ** 3)).toFixed(2)),
    },
    cpu: {
      manufacturer: cpu.manufacturer,
      brand: cpu.brand,
      physicalCores: cpu.physicalCores,
      logicalCores: cpu.cores,
    },
    gpu: bestGpu
      ? {
          vendor: bestGpu.vendor,
          model: bestGpu.model,
          vramGB: bestGpu.vram ? parseFloat((bestGpu.vram / 1024).toFixed(2)) : 0,
        }
      : null,
  };
}

// Calcula el peso heuristico leyendo los .jar de mods/
async function computePackWeightFromDisk(modsPath) {
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
    } catch (zipErr) {
      logger.warn(`[computePackWeight] zip: ${zipErr.message}`);
    }
  }

  const totalSizeMB = parseFloat((totalSizeBytes / (1024 * 1024)).toFixed(1));
  return calculateModpackWeight(allJars.length, totalSizeMB, optimizationCount, heavyCount);
}

const CURSEFORGE_CATEGORY_MAP = {
  optimization: 6814,
  technology: 412,
  magic: 419,
  adventure: 422,
  worldgen: 406,
  decoration: 424,
  storage: 420,
  utility: 5191,
  library: 421,
  mobs: 411,
  equipment: 434,
  food: 436,
};

const normalizeLoaderName = (loaderStr) => {
  const l = String(loaderStr || 'forge').toLowerCase().trim();
  if (l.includes('neoforge')) return 'neoforge';
  if (l.includes('quilt')) return 'quilt';
  if (l.includes('fabric')) return 'fabric';
  if (l.includes('forge')) return 'forge';
  return 'forge';
};

const getCurseForgeLoaderId = (loaderStr) => {
  const norm = normalizeLoaderName(loaderStr);
  if (norm === 'neoforge') return 6;
  if (norm === 'quilt') return 5;
  if (norm === 'fabric') return 4;
  return 1;
};

const getCurseForgeSortField = (sortBy) => {
  if (sortBy === 'downloads') return 6;
  if (sortBy === 'updated' || sortBy === 'newest') return 3;
  if (sortBy === 'popularity' || sortBy === 'follows') return 2;
  return 1;
};

const normalizeModKey = (title, slug) => {
  const base = (slug || title || '').toLowerCase();
  return base
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/\b(forge|fabric|neoforge|quilt|edition|mod)\b/g, '')
    .replace(/[^a-z0-9]/g, '');
};

function createWindow() {
  const win = new BrowserWindow({
    width: constants.WINDOW_WIDTH,
    height: constants.WINDOW_HEIGHT,
    title: 'Modpack Assist',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  // Bloquear ventanas emergentes; abrir enlaces externos validos en el navegador del sistema
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      const allowedWebHosts = ['modrinth.com', 'www.curseforge.com', 'curseforge.com', 'github.com'];
      if (parsed.protocol === 'https:' && allowedWebHosts.includes(parsed.hostname.toLowerCase())) {
        shell.openExternal(url);
      }
    } catch {
      // ignorar URL invalida
    }
    return { action: 'deny' };
  });

  // Evitar que la ventana principal navegue fuera de la app local
  win.webContents.on('will-navigate', (event, url) => {
    const devOrigin = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    if (!url.startsWith(devOrigin) && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });

  if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

let optimizationLoader = null;

async function getOptimizationRules(selectedCategories, profileId = 'default') {
  if (!optimizationLoader) {
    optimizationLoader = getOptimizationLoader();
    await optimizationLoader.loadConfigs();
  }

  const baseRules = {};
  const profile = optimizationLoader.getConfig(profileId);

  if (profile && profile.categories) {
    for (const catRules of Object.values(profile.categories)) {
      Object.assign(baseRules, catRules);
    }
  } else if (profileId === 'default') {
    for (const cat of selectedCategories) {
      if (opt.OPTIMIZATION_CATEGORIES[cat]) {
        Object.assign(baseRules, opt.OPTIMIZATION_CATEGORIES[cat]);
      }
    }
  }

  const activeRules = {};
  for (const cat of selectedCategories) {
    if (profile && profile.categories && profile.categories[cat]) {
      for (const [file, rules] of Object.entries(profile.categories[cat])) {
        Object.assign(activeRules, { [file]: rules });
      }
    } else if (opt.OPTIMIZATION_CATEGORIES[cat]) {
      for (const [file, rules] of Object.entries(opt.OPTIMIZATION_CATEGORIES[cat])) {
        Object.assign(activeRules, { [file]: rules });
      }
    }
  }

  return Object.keys(activeRules).length > 0 ? activeRules : baseRules;
}

function registerIpcHandlers() {
  ipcMain.handle('dialog:openFolder', async (event, knownPath) => {
    return modpackScanner.handleFolderOpen(event, knownPath);
  });

  ipcMain.handle('read-full-file', async (event, filePath, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const targetPath = sec.sanitizePath(filePath, packPath);
      if (!targetPath) return { success: false, message: 'Ruta invalida.' };
      const stats = await fs.stat(targetPath);
      if (stats.isDirectory()) {
        return { success: false, message: `'${filePath}' es una carpeta. El editor solo abre archivos.` };
      }
      await sec.validateFileSize(targetPath, sec.MAX_READ_SIZE);
      const content = await fs.readFile(targetPath, 'utf-8');
      return { success: true, content };
    } catch (err) {
      logger.error(`[read-full-file] ${err.message}`);
      return { success: false, message: 'Error al leer el archivo.' };
    }
  });

  ipcMain.handle('write-file', async (event, filePath, packPath, content) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const targetPath = sec.sanitizePath(filePath, packPath);
      if (!targetPath) return { success: false, message: 'Ruta invalida.' };
      if (typeof content !== 'string' || Buffer.byteLength(content, 'utf-8') > sec.MAX_READ_SIZE) {
        return { success: false, message: 'Contenido demasiado grande o invalido.' };
      }
      await fs.writeFile(targetPath, content, 'utf-8');
      return { success: true, message: 'Sobrescritura completada.' };
    } catch (err) {
      logger.error(`[write-file] ${err.message}`);
      return { success: false, message: 'Fallo al escribir archivo.' };
    }
  });

  ipcMain.handle('delete-file', async (event, filePath, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const targetPath = sec.sanitizePath(filePath, packPath);
      if (!targetPath) return { success: false, message: 'Ruta invalida.' };
      await fs.access(targetPath);
      await fs.unlink(targetPath);
      return { success: true, message: 'Eliminacion ejecutada.' };
    } catch (err) {
      logger.error(`[delete-file] ${err.message}`);
      return { success: false, message: 'Archivo no localizado.' };
    }
  });

  ipcMain.handle('rename-file', async (event, oldPathName, newPathName, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const oldPath = sec.sanitizePath(oldPathName, packPath);
      const newPath = sec.sanitizePath(newPathName, packPath);
      if (!oldPath || !newPath) return { success: false, message: 'Ruta invalida.' };
      await fs.access(oldPath);
      await fs.rename(oldPath, newPath);
      return { success: true, message: 'Renombrado completado.' };
    } catch (err) {
      logger.error(`[rename-file] ${err.message}`);
      return { success: false, message: 'Origen no localizado.' };
    }
  });

  ipcMain.handle('create-project', async (event, projectData) => {
    const safeName = String(projectData?.name || '').trim().slice(0, 80);
    const mcVersion = String(projectData?.mcVersion || '1.20.1').trim();
    const loader = String(projectData?.loader || 'Forge').trim();
    if (!safeName || !sec.validateGameVersion(mcVersion)) return null;

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Selecciona una CARPETA VACIA para tu Modpack',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (canceled || filePaths.length === 0) return null;
    const projectPath = filePaths[0];
    sec.authorizePackPath(projectPath);

    try {
      await fs.mkdir(path.join(projectPath, 'mods'), { recursive: true });
      await fs.mkdir(path.join(projectPath, 'config'), { recursive: true });
      await fs.mkdir(path.join(projectPath, 'scripts'), { recursive: true });

      const normLoader = normalizeLoaderName(loader);
      const manifest = {
        name: safeName,
        version: '1.0.0',
        minecraft: {
          version: mcVersion,
          modLoaders: [{ id: `${normLoader}-latest`, primary: true }],
        },
        manifestType: 'minecraftModpack',
        manifestVersion: 1,
        _appData: { loader },
      };

      await fs.writeFile(path.join(projectPath, 'manifest.json'), JSON.stringify(manifest, null, 2));

      return {
        mods: [],
        info: { name: safeName, gameVersion: mcVersion, loader, path: projectPath },
        rootFiles: ['mods', 'config', 'scripts', 'manifest.json'],
      };
    } catch (err) {
      logger.error('Error creando proyecto:', err);
      return null;
    }
  });

  ipcMain.handle('search-mods-online', async (event, query = '', gameVersion = '1.20.1', loader = 'forge', sortBy = 'downloads', category = '') => {
    const cleanQuery = String(query || '').replace(/[<>`$\\{}]/g, '').trim().slice(0, 120);
    let safeGameVersion = String(gameVersion || '1.20.1').trim();
    if (!sec.validateGameVersion(safeGameVersion)) {
      const verExtract = safeGameVersion.match(/(\d+\.\d+(?:\.\d+)?)/);
      safeGameVersion = verExtract ? verExtract[1] : '1.20.1';
    }
    const safeLoader = normalizeLoaderName(loader);
    const modloaderId = getCurseForgeLoaderId(safeLoader);
    const cfCategoryId = category ? CURSEFORGE_CATEGORY_MAP[category] : undefined;
    const cfSortField = getCurseForgeSortField(sortBy);
    const mrSortBy = sortBy === 'popularity' ? 'follows' : (['relevance', 'downloads', 'follows', 'newest', 'updated'].includes(sortBy) ? sortBy : 'downloads');

    const searchCache = getSearchCache({ maxSizeMB: 50, maxEntries: 500 });
    const cacheKeyQuery = `v3_${cleanQuery}`;
    try {
      const cached = await searchCache.get(cacheKeyQuery, safeGameVersion, safeLoader, sortBy, category);
      if (cached && Array.isArray(cached.results) && cached.results.length > 0 && cached.counts?.curseforge > 0) {
        return { ...cached, fromCache: true };
      }
    } catch (cacheErr) {
      logger.warn(`[search-mods-online] cache read error: ${cacheErr.message}`);
    }

    try {
      const { curseforge, modrinth } = await apiClientsPromise;

      const facetsArray = [
        [`categories:${safeLoader}`],
        [`versions:${safeGameVersion}`],
        ['project_type:mod'],
      ];
      if (category) facetsArray.push([`categories:${category}`]);

      const [modrinthOutcome, curseOutcome] = await Promise.allSettled([
        (async () => {
          const modrinthRes = await modrinth.searchMods({
            query: cleanQuery,
            facets: facetsArray,
            sortBy: mrSortBy,
            limit: 80,
          });
          if (!modrinthRes.ok) throw new Error(`Modrinth HTTP ${modrinthRes.status}`);
          const modrinthData = await modrinthRes.json();
          return (modrinthData.hits || []).map(mod => ({
            project_id: mod.project_id,
            modrinth_id: mod.project_id,
            slug: mod.slug || '',
            title: mod.title,
            description: mod.description || '',
            icon_url: mod.icon_url ? (mod.icon_url.startsWith('http') ? mod.icon_url : `https://cdn.modrinth.com${mod.icon_url}`) : null,
            author: mod.author || 'Desconocido',
            downloads: mod.downloads || 0,
            follows: mod.follows || 0,
            categories: (mod.display_categories || mod.categories || []).filter(c => !['forge', 'fabric', 'neoforge', 'quilt', 'liteloader', 'modloader', 'rift'].includes(c.toLowerCase())),
            loaders: (mod.categories || []).filter(c => ['forge', 'fabric', 'neoforge', 'quilt'].includes(c.toLowerCase())),
            updated_at: mod.date_modified || mod.date_created || null,
            client_side: mod.client_side || null,
            server_side: mod.server_side || null,
            license: mod.license || null,
            gallery: Array.isArray(mod.gallery) ? mod.gallery.slice(0, 4) : [],
            website_url: `https://modrinth.com/mod/${mod.slug || mod.project_id}`,
            source: 'modrinth',
            sources: ['modrinth'],
          }));
        })(),
        (async () => {
          if (!CF_API_KEY) throw new Error('CURSEFORGE_API_KEY no configurada');
          const cfRes = await curseforge.searchMods({
            apiKey: CF_API_KEY,
            query: cleanQuery,
            gameVersion: safeGameVersion,
            modloaderId,
            categoryId: cfCategoryId,
            sortField: cfSortField,
            pageSize: 50,
          });
          if (!cfRes.ok) {
            throw new Error(`CurseForge HTTP ${cfRes.status}`);
          }
          const cfData = await cfRes.json();
          const loaderNames = { 1: 'forge', 4: 'fabric', 5: 'quilt', 6: 'neoforge' };
          return (cfData.data || []).map(mod => {
            const loadersSet = new Set();
            if (Array.isArray(mod.latestFilesIndexes)) {
              mod.latestFilesIndexes.forEach(idx => {
                if (loaderNames[idx.modLoader]) loadersSet.add(loaderNames[idx.modLoader]);
              });
            }
            if (loadersSet.size === 0) loadersSet.add(safeLoader);
            return {
              project_id: String(mod.id),
              curseforge_id: String(mod.id),
              slug: mod.slug || '',
              title: mod.name,
              description: mod.summary || '',
              icon_url: mod.logo ? (mod.logo.thumbnailUrl || mod.logo.url) : null,
              author: mod.authors?.[0]?.name || 'Desconocido',
              downloads: mod.downloadCount || 0,
              follows: mod.thumbsUpCount || mod.favoriteCount || 0,
              categories: Array.isArray(mod.categories) ? mod.categories.map(c => c.name).slice(0, 5) : [],
              loaders: Array.from(loadersSet),
              updated_at: mod.dateModified || mod.dateReleased || null,
              allow_distribution: mod.allowModDistribution !== false,
              gallery: Array.isArray(mod.screenshots) ? mod.screenshots.map(s => s.thumbnailUrl || s.url).filter(Boolean).slice(0, 4) : [],
              website_url: mod.links?.websiteUrl || `https://www.curseforge.com/minecraft/mc-mods/${mod.slug}`,
              source_url: mod.links?.sourceUrl || null,
              issues_url: mod.links?.issuesUrl || null,
              source: 'curseforge',
              sources: ['curseforge'],
            };
          });
        })(),
      ]);

      const modrinthResults = modrinthOutcome.status === 'fulfilled' ? modrinthOutcome.value : [];
      const curseResults = curseOutcome.status === 'fulfilled' ? curseOutcome.value : [];
      const searchErrors = {};

      if (modrinthOutcome.status === 'rejected') {
        searchErrors.modrinth = 'No disponible temporalmente';
        logger.warn(`[search-mods-online] Modrinth fallo: ${modrinthOutcome.reason?.message}`);
      }
      if (curseOutcome.status === 'rejected') {
        searchErrors.curseforge = 'No disponible temporalmente';
        logger.warn(`[search-mods-online] CurseForge fallo: ${curseOutcome.reason?.message}`);
      }

      const mergedMap = new Map();
      const maxLen = Math.max(modrinthResults.length, curseResults.length);

      const addOrMergeMod = (item) => {
        const normKey = normalizeModKey(item.title, item.slug) || `${item.source}_${item.project_id}`;
        if (!mergedMap.has(normKey)) {
          mergedMap.set(normKey, { ...item });
        } else {
          const existing = mergedMap.get(normKey);
          if (!existing.sources.includes(item.source)) {
            existing.sources.push(item.source);
          }
          if (item.source === 'curseforge') {
            existing.curseforge_id = item.curseforge_id;
            existing.curseforge_downloads = item.downloads;
            existing.curseforge_url = item.website_url;
            if (!existing.icon_url && item.icon_url) existing.icon_url = item.icon_url;
            if ((!existing.gallery || existing.gallery.length === 0) && item.gallery?.length > 0) existing.gallery = item.gallery;
            if (!existing.source_url && item.source_url) existing.source_url = item.source_url;
            if (!existing.issues_url && item.issues_url) existing.issues_url = item.issues_url;
          } else if (item.source === 'modrinth') {
            existing.modrinth_id = item.modrinth_id;
            existing.modrinth_downloads = item.downloads;
            existing.modrinth_url = item.website_url;
            if (!existing.license && item.license) existing.license = item.license;
            if (!existing.client_side && item.client_side) existing.client_side = item.client_side;
            if (!existing.server_side && item.server_side) existing.server_side = item.server_side;
          }
          existing.downloads = Math.max(existing.downloads || 0, item.downloads || 0);
          existing.total_downloads = (existing.modrinth_downloads || (existing.source === 'modrinth' ? existing.downloads : 0)) +
                                     (existing.curseforge_downloads || (existing.source === 'curseforge' ? existing.downloads : 0));
          const mergedCats = new Set([...(existing.categories || []), ...(item.categories || [])]);
          existing.categories = Array.from(mergedCats).slice(0, 6);
          const mergedLoaders = new Set([...(existing.loaders || []), ...(item.loaders || [])]);
          existing.loaders = Array.from(mergedLoaders);
        }
      };

      for (let i = 0; i < maxLen; i++) {
        if (i < modrinthResults.length) addOrMergeMod(modrinthResults[i]);
        if (i < curseResults.length) addOrMergeMod(curseResults[i]);
      }

      const uniqueResults = Array.from(mergedMap.values());
      const lowerQuery = cleanQuery.toLowerCase();
      uniqueResults.sort((a, b) => {
        if (lowerQuery) {
          const aTitle = a.title.toLowerCase();
          const bTitle = b.title.toLowerCase();
          const aExact = aTitle === lowerQuery || a.slug?.toLowerCase() === lowerQuery ? 3 : (aTitle.startsWith(lowerQuery) ? 2 : (aTitle.includes(lowerQuery) ? 1 : 0));
          const bExact = bTitle === lowerQuery || b.slug?.toLowerCase() === lowerQuery ? 3 : (bTitle.startsWith(lowerQuery) ? 2 : (bTitle.includes(lowerQuery) ? 1 : 0));
          if (sortBy === 'relevance' && aExact !== bExact) return bExact - aExact;
          if (aExact >= 2 && bExact === 0) return -1;
          if (bExact >= 2 && aExact === 0) return 1;
        }
        if (sortBy === 'updated') {
          const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          return dateB - dateA;
        }
        if (sortBy === 'popularity') {
          return (b.follows || 0) - (a.follows || 0);
        }
        return (b.downloads || 0) - (a.downloads || 0);
      });

      const responsePayload = {
        success: true,
        results: uniqueResults,
        appliedFilters: {
          gameVersion: safeGameVersion,
          loader: safeLoader,
        },
        errors: Object.keys(searchErrors).length > 0 ? searchErrors : null,
        counts: {
          modrinth: modrinthResults.length,
          curseforge: curseResults.length,
          total: uniqueResults.length,
        },
      };

      if (uniqueResults.length > 0) {
        searchCache.set(cacheKeyQuery, safeGameVersion, safeLoader, sortBy, category, responsePayload).catch(() => {});
      }

      return responsePayload;
    } catch (err) {
      logger.error('Error critico en el buscador:', err);
      return { success: false, message: 'Fallo de conexion principal.' };
    }
  });

  ipcMain.handle('get-mod-versions', async (event, projectId, gameVersion, loader, source) => {
    let safeGameVersion = String(gameVersion || '1.20.1').trim();
    if (!sec.validateGameVersion(safeGameVersion)) {
      const verExtract = safeGameVersion.match(/(\d+\.\d+(?:\.\d+)?)/);
      safeGameVersion = verExtract ? verExtract[1] : '1.20.1';
    }
    try {
      const { curseforge, modrinth } = await apiClientsPromise;
      const safeLoader = normalizeLoaderName(loader);

      if (source === 'curseforge') {
        const cleanId = String(projectId);
        if (!/^\d+$/.test(cleanId)) return { success: false, message: 'ID de proyecto invalido.' };
        const modloaderId = getCurseForgeLoaderId(safeLoader);
        const res = await curseforge.getModFiles({
          apiKey: CF_API_KEY,
          projectId: cleanId,
          gameVersion: safeGameVersion,
          modloaderId,
        });

        if (!res.ok) throw new Error('Fallo de conexion con CurseForge API.');
        const data = await res.json();

        const formattedVersions = (data.data || []).map(v => ({
          id: v.id,
          name: v.displayName || v.fileName,
          fileName: v.fileName,
          version_number: v.fileName || v.id.toString(),
          release_type: v.releaseType === 1 ? 'release' : (v.releaseType === 2 ? 'beta' : 'alpha'),
          file_size: v.fileLength || 0,
          date: new Date(v.fileDate).toLocaleDateString(),
          dependencies: v.dependencies ? v.dependencies.filter(d => d.relationType === 3) : [],
          downloadUrl: v.downloadUrl,
          source: 'curseforge',
          projectId: cleanId,
        }));

        return { success: true, versions: formattedVersions };
      } else {
        const cleanId = String(projectId || '');
        if (!/^[a-zA-Z0-9_-]+$/.test(cleanId)) return { success: false, message: 'ID de proyecto invalido.' };
        const res = await modrinth.getProjectVersions(cleanId);
        if (!res.ok) throw new Error('Fallo de conexion con Modrinth API.');
        const versions = await res.json();

        const validVersions = (Array.isArray(versions) ? versions : []).filter(v =>
          v.loaders.map(l => l.toLowerCase()).includes(safeLoader) && v.game_versions.includes(safeGameVersion)
        );

        const formattedVersions = validVersions.map(v => {
          const primaryFile = v.files?.find(f => f.primary) || v.files?.[0];
          return {
            id: v.id,
            name: v.name || v.version_number,
            fileName: primaryFile?.filename || `${v.version_number}.jar`,
            version_number: v.version_number,
            release_type: v.version_type || 'release',
            file_size: primaryFile?.size || 0,
            date: new Date(v.date_published).toLocaleDateString(),
            dependencies: (v.dependencies || []).filter(d => d.dependency_type === 'required'),
            source: 'modrinth',
          };
        });

        return { success: true, versions: formattedVersions };
      }
    } catch (err) {
      logger.error(`[get-mod-versions] ${err.message}`);
      return { success: false, message: 'Error al obtener versiones.' };
    }
  });

  ipcMain.handle('download-mod', async (event, versionObj, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const { curseforge, modrinth } = await apiClientsPromise;
      let downloadUrl = '';
      let fileName = '';

      if (versionObj?.source === 'curseforge') {
        if (!/^\d+$/.test(String(versionObj.projectId))) return { success: false, message: 'ID de proyecto de CurseForge invalido.' };
        if (!/^\d+$/.test(String(versionObj.id))) return { success: false, message: 'ID de archivo de CurseForge invalido.' };
        downloadUrl = versionObj.downloadUrl;

        if (!downloadUrl) {
          const res = await curseforge.getDownloadUrl({
            apiKey: CF_API_KEY,
            projectId: versionObj.projectId,
            fileId: versionObj.id,
          });
          if (res.ok) {
            const data = await res.json();
            if (!data.data) {
              return {
                success: false,
                errorCode: 'RESTRICTED_BY_AUTHOR',
                message: 'El autor de este mod en CurseForge no permite descargas desde apps externas.',
              };
            }
            downloadUrl = data.data;
          } else {
            return {
              success: false,
              errorCode: 'RESTRICTED_BY_AUTHOR',
              message: 'El autor de este mod en CurseForge no permite descargas desde apps externas.',
            };
          }
        }
        const rawName = (versionObj.fileName || versionObj.name || 'mod').replace(/[^\x20-\x7E]/g, '_').replace(/[/\\?%*:|"<>]/g, '_');
        fileName = rawName.endsWith('.jar') ? rawName : `${rawName}.jar`;
      } else {
        if (!versionObj?.id || !/^[a-zA-Z0-9_-]+$/.test(String(versionObj.id))) return { success: false, message: 'ID de version invalido.' };
        const res = await modrinth.getVersion(versionObj.id);
        if (!res.ok) return { success: false, message: 'No se pudo consultar la version en Modrinth.' };
        const versionData = await res.json();
        const fileInfo = versionData.files?.find(f => f.primary) || versionData.files?.[0];
        if (!fileInfo) return { success: false, message: 'Archivo de mod no disponible.' };
        downloadUrl = fileInfo.url;
        fileName = fileInfo.filename;
      }

      if (!sec.validateDownloadUrl(downloadUrl)) {
        return { success: false, message: 'URL o dominio de descarga no autorizado.' };
      }

      if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\') || !fileName.endsWith('.jar') || /[^\x20-\x7E]/.test(fileName)) {
        return { success: false, message: 'Nombre de archivo invalido.' };
      }

      const modRes = await fetch(downloadUrl);
      if (!modRes.ok) return { success: false, message: `Error HTTP ${modRes.status} al descargar.` };

      const contentType = modRes.headers.get('content-type');
      const allowedContentTypes = ['application/java-archive', 'application/zip', 'application/x-java-archive', 'application/x-zip-compressed', 'application/octet-stream'];
      if (contentType && !allowedContentTypes.some(ct => contentType.toLowerCase().includes(ct))) {
        return { success: false, message: 'Tipo de contenido de descarga no autorizado.' };
      }
      const contentLength = modRes.headers.get('content-length');
      if (contentLength && parseInt(contentLength, 10) > sec.MAX_DOWNLOAD_SIZE) {
        return { success: false, message: 'El archivo excede el tamano maximo de descarga.' };
      }
      const buffer = await modRes.arrayBuffer();
      if (buffer.byteLength > sec.MAX_DOWNLOAD_SIZE) {
        return { success: false, message: 'El archivo excede el tamano maximo de descarga.' };
      }

      const modsDir = sec.sanitizePath('mods', packPath);
      if (!modsDir) return { success: false, message: 'Ruta de mods invalida.' };
      await fs.mkdir(modsDir, { recursive: true });
      const destPath = sec.sanitizePath(fileName, modsDir);
      if (!destPath) return { success: false, message: 'Ruta de destino invalida.' };
      await fs.writeFile(destPath, Buffer.from(buffer));

      return { success: true, fileName };
    } catch (err) {
      logger.error(`[download-mod] ${err.message}`);
      return { success: false, message: 'Error al descargar el mod.' };
    }
  });

  ipcMain.handle('diagnose-modpack', async (event, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const { modrinth } = await apiClientsPromise;
      const modsPath = sec.sanitizePath('mods', packPath);
      if (!modsPath) return { success: false, message: 'Ruta invalida.' };
      const files = await fs.readdir(modsPath);
      const jarFiles = files.filter(f => f.endsWith('.jar'));

      if (jarFiles.length === 0) {
        return { success: false, message: 'No hay mods en la carpeta mods/ para analizar.' };
      }

      let packVersion = '1.20.1';
      let packLoader = 'forge';
      try {
        const manifestPath = sec.sanitizePath('manifest.json', packPath);
        if (manifestPath) {
          await sec.validateFileSize(manifestPath, sec.MAX_READ_SIZE);
          const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
          packVersion = manifest.minecraft?.version || manifest.gameVersion || packVersion;
          const loaderStr = manifest.minecraft?.modLoaders?.[0]?.id || manifest._appData?.loader || packLoader;
          packLoader = normalizeLoaderName(loaderStr);
        }
      } catch {
        // Si no hay manifest.json se mantiene el valor por defecto
      }

      const { fileHashes } = await new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, 'services/workers/modAnalysisWorker.cjs'), {
          workerData: { task: 'compute-hashes', modsPath, jarFiles },
        });
        worker.on('message', (msg) => {
          if (msg.type === 'result') resolve(msg);
          if (msg.type === 'error') reject(new Error(msg.message));
        });
        worker.on('error', (err) => reject(err));
        worker.on('exit', (code) => { if (code !== 0) reject(new Error('Worker crashed.')); });
      });
      const hashArray = Object.keys(fileHashes);

      const res = await modrinth.getVersionsByHashes({ hashes: hashArray, algorithm: 'sha1' });
      if (!res.ok) return { success: false, message: 'Fallo de conexion con Modrinth API.' };
      const data = await res.json();

      const diagErrors = [];
      const warnings = [];
      let okCount = 0;
      const fileStatusMap = {};

      const installedProjectIds = new Set();
      Object.values(data).forEach(version => installedProjectIds.add(version.project_id));

      for (const hash of hashArray) {
        const fileName = fileHashes[hash];
        const versionData = data[hash];

        if (!versionData) {
          warnings.push(`[AVISO] "${fileName}" no figura en Modrinth. Verifica su compatibilidad manualmente.`);
          continue;
        }

        let isOk = true;

        if (!versionData.game_versions.includes(packVersion)) {
          diagErrors.push(`[VERSION] "${fileName}" es para MC ${versionData.game_versions[0] || '?'}, pero el pack usa ${packVersion}.`);
          fileStatusMap[fileName.toLowerCase()] = 'error';
          isOk = false;
        }

        const vLoaders = versionData.loaders.map(l => l.toLowerCase());
        if (!vLoaders.includes(packLoader)) {
          diagErrors.push(`[LOADER] "${fileName}" requiere ${vLoaders.join('/')}, pero el pack usa ${packLoader}.`);
          fileStatusMap[fileName.toLowerCase()] = 'error';
          isOk = false;
        }

        if (versionData.dependencies) {
          for (const dep of versionData.dependencies) {
            if (dep.dependency_type === 'required' && dep.project_id && /^[a-zA-Z0-9_-]+$/.test(dep.project_id) && !installedProjectIds.has(dep.project_id)) {
              diagErrors.push(`[FALTA DEPENDENCIA] "${fileName}" requiere una libreria obligatoria no instalada.`);
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

      let weightReport = null;
      try {
        weightReport = await computePackWeightFromDisk(modsPath);
      } catch (weightErr) {
        logger.warn(`[diagnose-modpack] weight: ${weightErr.message}`);
      }

      return {
        success: true,
        report: { errors: diagErrors, warnings, okCount, total: jarFiles.length, fileStatusMap, weightReport },
      };
    } catch (error) {
      logger.error(`[diagnose-modpack] ${error.message}`);
      return { success: false, message: 'No se pudo completar el diagnostico del modpack.' };
    }
  });

  ipcMain.handle('export-modpack', async (event, packPath, packName) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const safeName = String(packName || path.basename(packPath) || 'Modpack')
        .replace(/[/\\?%*:|"<>]/g, '_')
        .slice(0, 80);

      const { canceled, filePath: chosenPath } = await dialog.showSaveDialog({
        title: 'Guardar Modpack Exportado (.zip)',
        defaultPath: path.join(path.dirname(packPath), `${safeName}_Exportado.zip`),
        filters: [{ name: 'Archivo ZIP', extensions: ['zip'] }],
      });

      if (canceled || !chosenPath) {
        return { success: false, message: 'Exportacion cancelada.' };
      }

      const zip = new AdmZip();
      zip.addLocalFolder(packPath, '', (relEntry) => !relEntry.includes('.modpack_assist_backups'));
      zip.writeZip(chosenPath);
      shell.showItemInFolder(chosenPath);
      return { success: true, path: chosenPath };
    } catch (error) {
      logger.error(`[export-modpack] ${error.message}`);
      return { success: false, message: 'Error al exportar el modpack a ZIP.' };
    }
  });

  ipcMain.handle('install-mod-recursively', async (event, initialVersionId, packVersion, packLoader, packPath) => {
    if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
    if (!/^[a-zA-Z0-9_-]+$/.test(String(initialVersionId))) return { success: false, message: 'ID de version invalido.' };
    if (packVersion && !sec.validateGameVersion(packVersion)) return { success: false, message: 'Version de MC invalida.' };
    const modsDir = sec.sanitizePath('mods', packPath);
    if (!modsDir) return { success: false, message: 'Ruta invalida.' };
    await fs.mkdir(modsDir, { recursive: true });

    const { modrinth } = await apiClientsPromise;
    const downloadedIds = new Set();
    const logs = [];
    const MAX_RECURSION = 25;

    const processDependencyTree = async (versionId) => {
      if (downloadedIds.has(versionId) || downloadedIds.size >= MAX_RECURSION) return;
      downloadedIds.add(versionId);

      try {
        if (!/^[a-zA-Z0-9_-]+$/.test(String(versionId))) throw new Error('ID de version invalido.');
        const res = await modrinth.getVersion(versionId);
        if (!res.ok) throw new Error('No se encontro la version en Modrinth.');
        const vData = await res.json();

        const fileInfo = vData.files?.find(f => f.primary) || vData.files?.[0];
        if (!fileInfo || !sec.validateDownloadUrl(fileInfo.url)) throw new Error('URL de descarga no autorizada.');
        if (!fileInfo.filename || !fileInfo.filename.endsWith('.jar') || /[^\x20-\x7E]/.test(fileInfo.filename)) {
          throw new Error('Nombre de archivo .jar invalido.');
        }

        const modRes = await fetch(fileInfo.url);
        if (!modRes.ok) throw new Error(`HTTP ${modRes.status}`);
        const contentLength = modRes.headers.get('content-length');
        if (contentLength && parseInt(contentLength, 10) > sec.MAX_DOWNLOAD_SIZE) {
          throw new Error('El archivo excede el tamano maximo permitido.');
        }
        const buffer = await modRes.arrayBuffer();
        if (buffer.byteLength > sec.MAX_DOWNLOAD_SIZE) {
          throw new Error('El archivo excede el tamano maximo permitido.');
        }
        const destPath = sec.sanitizePath(fileInfo.filename, modsDir);
        if (!destPath) throw new Error('Ruta de destino invalida.');
        await fs.writeFile(destPath, Buffer.from(buffer));

        logs.push(`[OK] Descargado: ${fileInfo.filename}`);

        if (Array.isArray(vData.dependencies)) {
          for (const dep of vData.dependencies) {
            if (dep.dependency_type !== 'required') continue;
            if (dep.version_id && /^[a-zA-Z0-9_-]+$/.test(dep.version_id)) {
              await processDependencyTree(dep.version_id);
            } else if (dep.project_id && /^[a-zA-Z0-9_-]+$/.test(dep.project_id)) {
              const safeLoader = normalizeLoaderName(packLoader);
              const depRes = await modrinth.getProjectVersionsByFilters({
                projectId: dep.project_id,
                loaders: [safeLoader],
                gameVersions: [packVersion],
              });
              if (depRes.ok) {
                const depVersions = await depRes.json();
                if (Array.isArray(depVersions) && depVersions.length > 0) {
                  await processDependencyTree(depVersions[0].id);
                } else {
                  logs.push(`[AVISO] Sin version compatible de dependencia (${dep.project_id})`);
                }
              }
            }
          }
        }
      } catch (err) {
        logs.push(`[ERROR] Fallo en dependencia: ${err.message}`);
      }
    };

    await processDependencyTree(initialVersionId);
    return { success: true, logs };
  });

  ipcMain.handle('open-external-editor', async (event, filePath, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const exactPath = sec.sanitizePath(filePath, packPath);
      if (!exactPath) return { success: false, message: 'Ruta invalida.' };

      const stat = await fs.stat(exactPath);
      if (stat.isFile() && !sec.isSafeForExternalEditor(exactPath)) {
        return { success: false, message: 'Por seguridad, solo se abren archivos de texto o configuracion.' };
      }

      const result = await shell.openPath(exactPath);
      return { success: result === '', message: result ? 'No se pudo abrir en el sistema.' : 'Abierto con aplicacion predeterminada.' };
    } catch (err) {
      logger.error(`[open-external-editor] ${err.message}`);
      return { success: false, message: 'Error al abrir archivo.' };
    }
  });

  ipcMain.handle('get-game-versions', async () => {
    try {
      const { modrinth } = await apiClientsPromise;
      const res = await modrinth.getGameVersions();
      if (!res.ok) throw new Error('Fallo de red');
      const versions = await res.json();
      return { success: true, versions };
    } catch (error) {
      logger.error('Error al obtener versiones:', error);
      return { success: false, message: 'No se pudieron obtener las versiones de Minecraft.' };
    }
  });

  ipcMain.handle('list-folder-content', async (event, folderPath, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const fullPath = sec.sanitizePath(folderPath, packPath);
      if (!fullPath) return { success: false, message: 'Ruta invalida.' };
      const files = await fs.readdir(fullPath);
      return { success: true, files };
    } catch (err) {
      logger.error(`[list-folder-content] ${err.message}`);
      return { success: false, message: 'Error al leer carpeta.' };
    }
  });

  ipcMain.handle('explore-jar-contents', async (event, jarName, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const jarSanitized = sec.sanitizePath(jarName, path.join(packPath, 'mods'));
      if (!jarSanitized) return { success: false, message: 'Nombre de mod invalido.' };
      await sec.validateFileSize(jarSanitized, sec.MAX_ZIP_SIZE);
      const zip = new AdmZip(jarSanitized);
      const internalFiles = [];
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        const pathInsideJar = entry.entryName;
        if ((pathInsideJar.startsWith('data/') && pathInsideJar.endsWith('.json')) || pathInsideJar.startsWith('defaultconfigs/')) {
          internalFiles.push(pathInsideJar);
        }
      }
      internalFiles.sort();
      return { success: true, files: internalFiles };
    } catch (err) {
      logger.error(`[explore-jar-contents] ${err.message}`);
      return { success: false, message: 'Error al abrir el mod.' };
    }
  });

  ipcMain.handle('read-jar-file', async (event, jarName, internalPath, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      if (!internalPath || typeof internalPath !== 'string' || internalPath.includes('..') || internalPath.startsWith('/')) {
        return { success: false, message: 'Ruta interna invalida.' };
      }
      const jarSanitized = sec.sanitizePath(jarName, path.join(packPath, 'mods'));
      if (!jarSanitized) return { success: false, message: 'Nombre de mod invalido.' };
      await sec.validateFileSize(jarSanitized, sec.MAX_ZIP_SIZE);
      const zip = new AdmZip(jarSanitized);
      const entry = zip.getEntry(internalPath);
      if (!entry || entry.isDirectory) return { success: false, message: 'Archivo no encontrado dentro del mod.' };
      if (entry.header.size > sec.MAX_READ_SIZE) {
        return { success: false, message: 'El archivo interno excede el limite de lectura.' };
      }
      const content = zip.readAsText(entry);
      return { success: true, content };
    } catch (err) {
      logger.error(`[read-jar-file] ${err.message}`);
      return { success: false, message: 'Error al leer archivo interno.' };
    }
  });

  // --- TWEAKS Y BALANCE KUBEJS ---
  ipcMain.handle('inject-spawn-control', async (event, tweakData, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      return await tweaksManager.upsertSpawnRule(tweakData, packPath);
    } catch (err) {
      logger.error(`[inject-spawn-control] ${err.message}`);
      return { success: false, message: 'Error al aplicar control de spawn.' };
    }
  });

  ipcMain.handle('loot-editor-apply', async (event, packPath, lootPathOrPayload, patch, gameVersion) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      if (lootPathOrPayload && typeof lootPathOrPayload === 'object' && Array.isArray(lootPathOrPayload.drops)) {
        return await tweaksManager.applyLootTweak(packPath, lootPathOrPayload, gameVersion);
      }
      return await tweaksManager.applyRawLootPatch(packPath, lootPathOrPayload, patch, gameVersion);
    } catch (err) {
      logger.error(`[loot-editor-apply] ${err.message}`);
      return { success: false, message: 'Error al editar loot.' };
    }
  });

  ipcMain.handle('tweaks:list', async (event, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const state = await tweaksManager.loadState(packPath);
      return { success: true, state };
    } catch (err) {
      logger.error(`[tweaks:list] ${err.message}`);
      return { success: false, message: 'No se pudieron cargar los tweaks.' };
    }
  });

  ipcMain.handle('tweaks:delete', async (event, packPath, category, id) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      return await tweaksManager.deleteTweak(packPath, category, id);
    } catch (err) {
      logger.error(`[tweaks:delete] ${err.message}`);
      return { success: false, message: 'Error al eliminar el ajuste.' };
    }
  });

  ipcMain.handle('inject-item-tweak', async (event, tweakData, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      return await tweaksManager.upsertItemTweak(tweakData, packPath);
    } catch (err) {
      logger.error(`[inject-item-tweak] ${err.message}`);
      return { success: false, message: 'Error al inyectar ajuste de item.' };
    }
  });

  ipcMain.handle('inject-entity-tweak', async (event, tweakData, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      return await tweaksManager.upsertEntityTweak(tweakData, packPath);
    } catch (err) {
      logger.error(`[inject-entity-tweak] ${err.message}`);
      return { success: false, message: 'Error al inyectar mutacion.' };
    }
  });

  ipcMain.handle('scan-mod-ids', async (event, modsPath) => {
    try {
      if (modsPath && typeof modsPath === 'string' && path.isAbsolute(modsPath)) {
        const parentPack = path.dirname(path.resolve(modsPath));
        if (!(await ensureAuthorizedPack(parentPack))) {
          return await scanModIds(null);
        }
      }
      return await scanModIds(modsPath);
    } catch (error) {
      logger.error('Error al escanear IDs de mods:', error);
      return { items: [], entities: [], chests: [], all: [], hasKubeJS: false };
    }
  });

  // --- EDITOR IDE DE SCRIPTS ---
  ipcMain.handle('scripts:get-tree', async (event, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
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
                children: await scanDir(fullPath),
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
        data: { kubejs: kubejsTree, scripts: craftTweakerTree },
      };
    } catch (err) {
      logger.error(`[scripts:get-tree] ${err.message}`);
      return { success: false, message: 'Error al escanear scripts.' };
    }
  });

  ipcMain.handle('scripts:read', async (event, filePath, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const targetPath = sec.sanitizePath(filePath, packPath);
      if (!targetPath || (!targetPath.endsWith('.js') && !targetPath.endsWith('.zs'))) {
        return { success: false, message: 'Ruta de script invalida.' };
      }
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
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const targetPath = sec.sanitizePath(filePath, packPath);
      if (!targetPath || (!targetPath.endsWith('.js') && !targetPath.endsWith('.zs'))) {
        return { success: false, message: 'Ruta de script invalida.' };
      }
      if (typeof content !== 'string' || Buffer.byteLength(content, 'utf-8') > sec.MAX_READ_SIZE) {
        return { success: false, message: 'Contenido de script demasiado grande o invalido.' };
      }
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content, 'utf-8');
      return { success: true, message: 'Script guardado correctamente.' };
    } catch (err) {
      logger.error(`[scripts:save] ${err.message}`);
      return { success: false, message: 'Error al guardar el script.' };
    }
  });

  // --- RENDIMIENTO Y HARDWARE ---
  ipcMain.handle('get-system-specs', async () => {
    try {
      const data = await collectHardwareSpecs();
      return { success: true, data };
    } catch (error) {
      logger.error('Error escaneando el hardware:', error);
      return { success: false, message: 'No se pudo leer la informacion del hardware.' };
    }
  });

  ipcMain.handle('calculate-all-impacts', async (event, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const modsPath = sec.sanitizePath('mods', packPath);
      if (!modsPath) return { success: false, message: 'Ruta invalida.' };
      const files = await fs.readdir(modsPath);
      const jarFiles = files.filter(f => f.endsWith('.jar'));

      return new Promise((resolve) => {
        const worker = new Worker(path.join(__dirname, 'services/workers/modAnalysisWorker.cjs'), {
          workerData: { task: 'calculate-impacts', modsPath, jarFiles },
        });
        worker.on('message', (msg) => {
          if (msg.type === 'result') resolve({ success: true, scores: msg.scores });
          if (msg.type === 'error') resolve({ success: false, message: 'Error en analisis de impacto.' });
        });
        worker.on('error', () => resolve({ success: false, message: 'Error en analisis de impacto.' }));
        worker.on('exit', (code) => { if (code !== 0) resolve({ success: false, message: 'Worker finalizado con error.' }); });
      });
    } catch (error) {
      logger.error(`[calculate-all-impacts] ${error.message}`);
      return { success: false, message: 'No se pudo calcular el impacto.' };
    }
  });

  // --- OPTIMIZACION INTELIGENTE ---
  ipcMain.handle('optimization:start', async (event, packPath, selectedCategories = ['gpu_vram', 'cpu_maps', 'cpu_entities', 'engine_system'], profileId = 'default') => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const configDir = sec.sanitizePath('config', packPath);
      const backupDir = sec.sanitizePath('.modpack_assist_backups', packPath);
      if (!configDir || !backupDir) return { success: false, message: 'Ruta invalida.' };
      await fs.mkdir(backupDir, { recursive: true });

      let allFiles;
      try {
        allFiles = await fs.readdir(configDir);
      } catch (err) {
        logger.error(`[optimization:start] ${err.message}`);
        return { success: false, message: 'No se encontro carpeta config/' };
      }

      const results = [];
      const activeRules = await getOptimizationRules(selectedCategories, profileId);

      for (const [ruleFile, rules] of Object.entries(activeRules)) {
        const match = allFiles.find(f => f.toLowerCase() === ruleFile.toLowerCase() || f.toLowerCase().endsWith('/' + ruleFile.toLowerCase()));
        if (!match) continue;

        const fullPath = path.join(configDir, match);
        const backupPath = path.join(backupDir, match);

        await fs.copyFile(fullPath, backupPath);

        const ext = path.extname(match).toLowerCase();
        await sec.validateFileSize(fullPath, sec.MAX_READ_SIZE);
        let raw = await fs.readFile(fullPath, 'utf-8');
        let modified = false;

        if (ext === '.toml') {
          for (const [key, value] of Object.entries(rules)) {
            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const tomlVal = typeof value === 'string' ? JSON.stringify(value) : String(value);
            const regex = new RegExp(`^(\\s*)${escapedKey}\\s*=\\s*.*$`, 'm');
            if (regex.test(raw)) {
              raw = raw.replace(regex, `$1${key} = ${tomlVal}`);
              modified = true;
            }
          }
        } else if (ext === '.json') {
          try {
            let obj = JSON.parse(raw);
            const mergedRules = {};
            for (const [jkey, jval] of Object.entries(rules)) {
              const jparts = jkey.split('.').filter(p => p && p !== '__proto__' && p !== 'constructor' && p !== 'prototype');
              if (jparts.length === 0) continue;
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
          } catch (parseErr) {
            logger.error(`[optimization:start] JSON invalido en ${match}: ${parseErr.message}`);
          }
        } else if (ext === '.properties' || ext === '.cfg') {
          for (const [key, value] of Object.entries(rules)) {
            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`^[#!]?\\s*${escapedKey}\\s*[=:]\\s*.*$`, 'm');
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
          await fs.copyFile(backupPath, fullPath);
          await fs.unlink(backupPath);
        }
      }

      if (results.length === 0) {
        await fs.rm(backupDir, { recursive: true, force: true }).catch(() => {});
        return { success: true, message: 'No se encontraron archivos optimizables.', results: [] };
      }

      return { success: true, message: `Optimizados ${results.length} archivos.`, results };
    } catch (err) {
      logger.error(`[optimization:start] ${err.message}`);
      return { success: false, message: 'Error al optimizar el modpack.' };
    }
  });

  ipcMain.handle('optimization:rollback', async (event, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const backupDir = sec.sanitizePath('.modpack_assist_backups', packPath);
      const configDir = sec.sanitizePath('config', packPath);
      if (!backupDir || !configDir) return { success: false, message: 'Ruta invalida.' };

      let backupFiles;
      try {
        backupFiles = await fs.readdir(backupDir);
      } catch {
        return { success: false, message: 'No hay respaldo disponible.' };
      }

      for (const file of backupFiles) {
        const src = sec.sanitizePath(file, backupDir);
        const dst = sec.sanitizePath(file, configDir);
        if (src && dst) await fs.copyFile(src, dst);
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
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, hasBackup: false, fileCount: 0 };
      const backupDir = sec.sanitizePath('.modpack_assist_backups', packPath);
      if (!backupDir) return { success: false, hasBackup: false, fileCount: 0 };
      let files = [];
      try { files = await fs.readdir(backupDir); } catch { /* sin backup previo */ }
      return { success: true, hasBackup: files.length > 0, fileCount: files.length };
    } catch {
      return { success: false, hasBackup: false, fileCount: 0 };
    }
  });

  ipcMain.handle('optimization:configs:list', async () => {
    try {
      if (!optimizationLoader) {
        optimizationLoader = getOptimizationLoader();
        await optimizationLoader.loadConfigs();
      }
      return { success: true, configs: optimizationLoader.getAllConfigs() };
    } catch (err) {
      logger.error(`[optimization:configs:list] ${err.message}`);
      return { success: false, message: 'No se pudieron cargar los perfiles.' };
    }
  });

  ipcMain.handle('optimization:configs:get', async (event, configId) => {
    try {
      if (!optimizationLoader) {
        optimizationLoader = getOptimizationLoader();
        await optimizationLoader.loadConfigs();
      }
      const config = optimizationLoader.getConfig(String(configId || ''));
      if (!config) return { success: false, message: 'Perfil no encontrado.' };
      return { success: true, config: optimizationLoader.sanitizeConfig(config) };
    } catch (err) {
      logger.error(`[optimization:configs:get] ${err.message}`);
      return { success: false, message: 'Error al leer el perfil.' };
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
      return { success: false, message: 'Error al obtener categorias.' };
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
      return { success: false, message: 'No se pudo crear el perfil.' };
    }
  });

  ipcMain.handle('optimization:configs:delete', async (event, configId) => {
    try {
      const id = String(configId || '');
      if (['default', 'heavy-modpack', 'server'].includes(id)) {
        return { success: false, message: 'No se pueden eliminar perfiles integrados.' };
      }
      if (!optimizationLoader) {
        optimizationLoader = getOptimizationLoader();
        await optimizationLoader.loadConfigs();
      }
      const deleted = await optimizationLoader.deleteConfig(id);
      return { success: deleted, message: deleted ? 'Perfil eliminado.' : 'Perfil no encontrado.' };
    } catch (err) {
      logger.error(`[optimization:configs:delete] ${err.message}`);
      return { success: false, message: 'Error al eliminar el perfil.' };
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
      return { success: false, message: 'Error al recargar perfiles.' };
    }
  });

  ipcMain.handle('optimization:hardware:recommend', async () => {
    try {
      const hardware = await collectHardwareSpecs();
      const result = await getHardwareOptimizationProfile(hardware);
      result.categoryDescriptions = getCategoryDescriptions();
      return { success: true, data: result };
    } catch (error) {
      logger.error(`[optimization:hardware:recommend] ${error.message}`);
      return { success: false, message: 'No se pudo generar la recomendacion de hardware.' };
    }
  });

  ipcMain.handle('optimization:hardware:categories', async () => {
    return { success: true, categories: getCategoryDescriptions() };
  });

  ipcMain.handle('optimization:bottlenecks:analyze', async (event, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const hardwareSpecs = await collectHardwareSpecs();
      const report = await bottleneck.analyzeBottlenecks(packPath, hardwareSpecs);
      return { success: true, report };
    } catch (error) {
      logger.error(`[optimization:bottlenecks:analyze] ${error.message}`);
      return { success: false, message: 'Error al analizar cuellos de botella.' };
    }
  });

  ipcMain.handle('optimization:bottlenecks:quickscan', async (event, packPath) => {
    try {
      if (!(await ensureAuthorizedPack(packPath))) return { success: false, message: 'Carpeta no autorizada.' };
      const scan = await bottleneck.quickScan(packPath);
      return { success: true, scan };
    } catch (error) {
      logger.error(`[optimization:bottlenecks:quickscan] ${error.message}`);
      return { success: false, message: 'Error en escaneo rapido.' };
    }
  });

  ipcMain.handle('api:status', async () => {
    try {
      const status = await apiStatus.getStatus();
      return { success: true, status };
    } catch (error) {
      logger.error(`[api:status] ${error.message}`);
      return { success: false, message: 'No se pudo consultar el estado de las APIs.' };
    }
  });

  ipcMain.handle('api:status:refresh', async () => {
    try {
      const status = await apiStatus.forceRefresh();
      return { success: true, status };
    } catch (error) {
      logger.error(`[api:status:refresh] ${error.message}`);
      return { success: false, message: 'No se pudo actualizar el estado de las APIs.' };
    }
  });

  ipcMain.handle('search:cache:clear', async () => {
    try {
      const cache = getSearchCache({ maxSizeMB: 50, maxEntries: 500 });
      await cache.clear();
      return { success: true, message: 'Cache de busqueda limpiado.' };
    } catch (error) {
      logger.error(`[search:cache:clear] ${error.message}`);
      return { success: false, message: 'No se pudo limpiar el cache.' };
    }
  });

  ipcMain.handle('search:cache:stats', async () => {
    try {
      const cache = getSearchCache({ maxSizeMB: 50, maxEntries: 500 });
      const stats = await cache.getStats();
      return { success: true, stats };
    } catch (error) {
      logger.error(`[search:cache:stats] ${error.message}`);
      return { success: false, message: 'No se pudieron leer las estadisticas de cache.' };
    }
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
