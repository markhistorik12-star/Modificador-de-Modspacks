import { useState, useCallback, useMemo, useEffect } from 'react';

const normalizeName = (str) =>
  (str || '')
    .toLowerCase()
    .replace(/\.jar$/i, '')
    .replace(/[_\-\s]*(v?\d+\.\d+.*)?$/i, '')
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/\b(forge|fabric|neoforge|quilt|edition|mod|mc)\b/g, '')
    .replace(/[^a-z0-9]/g, '');

const CURATED_RECOMMENDATIONS = [
  // Rendimiento y Optimización
  {
    id: 'rec-ferritecore',
    title: 'FerriteCore',
    query: 'FerriteCore',
    group: 'performance',
    loaders: ['forge', 'fabric', 'neoforge', 'quilt'],
    matchKeys: ['ferritecore'],
    badge: 'Ahorro RAM (-45%)',
    reason: 'Reduce drásticamente el consumo de memoria RAM de modelos y estados de bloques.'
  },
  {
    id: 'rec-modernfix',
    title: 'ModernFix',
    query: 'ModernFix',
    group: 'performance',
    loaders: ['forge', 'fabric', 'neoforge', 'quilt'],
    matchKeys: ['modernfix'],
    badge: 'Arranque 2x Rápido',
    reason: 'Optimiza tiempos de carga, corrige fugas de memoria y mejora los FPS generales.'
  },
  {
    id: 'rec-embeddium',
    title: 'Embeddium',
    query: 'Embeddium',
    group: 'performance',
    loaders: ['forge', 'neoforge'],
    matchKeys: ['embeddium', 'rubidium', 'sodium'],
    badge: 'Motor Gráfico FPS+',
    reason: 'Port oficial de Sodium para Forge/NeoForge. Multiplica los FPS de renderizado.'
  },
  {
    id: 'rec-sodium',
    title: 'Sodium',
    query: 'Sodium',
    group: 'performance',
    loaders: ['fabric', 'quilt', 'neoforge'],
    matchKeys: ['sodium', 'embeddium'],
    badge: 'Motor Gráfico FPS+',
    reason: 'El motor de renderizado más rápido para Minecraft moderno.'
  },
  {
    id: 'rec-entityculling',
    title: 'Entity Culling',
    query: 'Entity Culling',
    group: 'performance',
    loaders: ['forge', 'fabric', 'neoforge', 'quilt'],
    matchKeys: ['entityculling'],
    badge: 'CPU + GPU Culling',
    reason: 'Evita renderizar entidades y bloques detrás de paredes que no estás viendo.'
  },
  {
    id: 'rec-lithium',
    title: 'Lithium / Canary',
    query: 'Lithium',
    group: 'performance',
    loaders: ['fabric', 'quilt', 'neoforge'],
    matchKeys: ['lithium', 'canary', 'radium'],
    badge: 'Física y Ticks TPS+',
    reason: 'Optimiza la IA de mobs, física del juego y ticks del servidor sin alterar mecánicas.'
  },
  {
    id: 'rec-canary',
    title: 'Canary',
    query: 'Canary',
    group: 'performance',
    loaders: ['forge', 'neoforge'],
    matchKeys: ['canary', 'radium', 'lithium'],
    badge: 'Optimización TPS',
    reason: 'Port de Lithium para Forge que acelera la lógica interna, chunks e IA de entidades.'
  },
  {
    id: 'rec-immediatelyfast',
    title: 'ImmediatelyFast',
    query: 'ImmediatelyFast',
    group: 'performance',
    loaders: ['forge', 'fabric', 'neoforge', 'quilt'],
    matchKeys: ['immediatelyfast'],
    badge: 'Render UI / Entidades',
    reason: 'Acelera el renderizado de entidades, bloques de texto, HUD y partículas en GPU.'
  },

  // Utilidad y Calidad de Vida (QoL)
  {
    id: 'rec-jei',
    title: 'Just Enough Items (JEI)',
    query: 'Just Enough Items',
    group: 'qol',
    loaders: ['forge', 'fabric', 'neoforge'],
    matchKeys: ['jei', 'justenoughitems', 'roughlyenoughitems', 'emi'],
    badge: 'Visor de Recetas',
    reason: 'Imprescindible en cualquier modpack para consultar recetas y usos de ítems.'
  },
  {
    id: 'rec-jade',
    title: 'Jade (WAILA)',
    query: 'Jade',
    group: 'qol',
    loaders: ['forge', 'fabric', 'neoforge', 'quilt'],
    matchKeys: ['jade', 'wthit', 'theoneprobe'],
    badge: 'HUD de Información',
    reason: 'Muestra qué bloque o entidad estás mirando, su energía, fluidos y progreso.'
  },
  {
    id: 'rec-appleskin',
    title: 'AppleSkin',
    query: 'AppleSkin',
    group: 'qol',
    loaders: ['forge', 'fabric', 'neoforge', 'quilt'],
    matchKeys: ['appleskin'],
    badge: 'HUD Alimentación',
    reason: 'Muestra la saturación y regeneración de hambre de cada alimento en el HUD.'
  },
  {
    id: 'rec-mousetweaks',
    title: 'Mouse Tweaks',
    query: 'Mouse Tweaks',
    group: 'qol',
    loaders: ['forge', 'fabric', 'neoforge'],
    matchKeys: ['mousetweaks'],
    badge: 'Gestión Inventario',
    reason: 'Agiliza el movimiento y distribución de ítems arrastrando el ratón.'
  },
  {
    id: 'rec-spark',
    title: 'spark',
    query: 'spark',
    group: 'qol',
    loaders: ['forge', 'fabric', 'neoforge', 'quilt'],
    matchKeys: ['spark'],
    badge: 'Diagnóstico Lag/TPS',
    reason: 'Perfilador de CPU y memoria para detectar exactamente qué mod causa tirones o lag.'
  },

  // Sinergias y Complementos
  {
    id: 'rec-kubejs',
    title: 'KubeJS',
    query: 'KubeJS',
    group: 'synergy',
    loaders: ['forge', 'fabric', 'neoforge'],
    matchKeys: ['kubejs'],
    badge: 'Motor de Tweaks',
    reason: 'Habilita la ejecución de los scripts generados en la pestaña Tweaks y Editor IDE.'
  },
  {
    id: 'rec-oculus',
    title: 'Oculus (Shaders)',
    query: 'Oculus',
    group: 'synergy',
    loaders: ['forge', 'neoforge'],
    matchKeys: ['oculus', 'iris'],
    requiresAny: ['embeddium', 'rubidium'],
    badge: 'Soporte Shaders',
    reason: 'Complemento ideal para Embeddium que permite cargar paquetes de shaders modernos.'
  },
  {
    id: 'rec-iris',
    title: 'Iris Shaders',
    query: 'Iris Shaders',
    group: 'synergy',
    loaders: ['fabric', 'quilt', 'neoforge'],
    matchKeys: ['iris', 'oculus'],
    requiresAny: ['sodium'],
    badge: 'Soporte Shaders',
    reason: 'Complemento oficial de Sodium para usar shaders con alto rendimiento.'
  },
  {
    id: 'rec-create-slice',
    title: 'Create: Steam n Rails',
    query: 'Create Steam Rails',
    group: 'synergy',
    loaders: ['forge', 'fabric'],
    matchKeys: ['steamrails', 'createsteam'],
    requiresAny: ['create'],
    badge: 'Expansión Create',
    reason: 'Detectamos Create en tu pack: añade vías, trenes avanzados y locomotoras.'
  },
  {
    id: 'rec-create-crafts',
    title: 'Create Crafts & Additions',
    query: 'Create Crafts Additions',
    group: 'synergy',
    loaders: ['forge', 'fabric', 'neoforge'],
    matchKeys: ['createaddition'],
    requiresAny: ['create'],
    badge: 'Sinergia Energía FE',
    reason: 'Conecta la energía cinética de Create con motores eléctricos y mods tecnológicos (FE).'
  },
  {
    id: 'rec-farmers-delight',
    title: 'Farmers Delight',
    query: 'Farmers Delight',
    group: 'content',
    loaders: ['forge', 'fabric', 'neoforge'],
    matchKeys: ['farmersdelight'],
    badge: 'Cocina y Cultivos',
    reason: 'Expande la agricultura y cocina con ollas, sartenes y comidas con efectos útiles.'
  },
  {
    id: 'rec-waystones',
    title: 'Waystones',
    query: 'Waystones',
    group: 'content',
    loaders: ['forge', 'fabric', 'neoforge'],
    matchKeys: ['waystones', 'fwaystones'],
    badge: 'Transporte Rápido',
    reason: 'Añade monolitos de teletransporte descubribles en aldeas y por el mundo.'
  }
];

const normalizeLoader = (raw) => {
  const l = String(raw || 'forge').toLowerCase();
  if (l.includes('neoforge')) return 'neoforge';
  if (l.includes('quilt')) return 'quilt';
  if (l.includes('fabric')) return 'fabric';
  return 'forge';
};

export function useOnlineStore(packInfo, installedNodes = []) {
  const [onlineSearchQuery, setOnlineSearchQuery] = useState('');
  const [onlineResults, setOnlineResults] = useState([]);
  const [sourceCounts, setSourceCounts] = useState({ modrinth: 0, curseforge: 0, total: 0 });
  const [searchError, setSearchError] = useState(null);
  const [storeGameVersion, setStoreGameVersionState] = useState(packInfo?.gameVersion || '1.20.1');
  const [storeLoader, setStoreLoaderState] = useState(normalizeLoader(packInfo?.loader || 'forge'));
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sortBy, setSortByState] = useState('downloads');
  const [modCategory, setModCategoryState] = useState('');
  const [sourceFilter, setSourceFilter] = useState('all'); // 'all' | 'modrinth' | 'curseforge' | 'both'
  const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
  const [hideInstalled, setHideInstalled] = useState(false);
  const [visibleOnlineCount, setVisibleOnlineCount] = useState(24);
  const [apiStatus, setApiStatus] = useState({ modrinth: 'unknown', curseforge: 'unknown', overall: 'unknown' });
  const [downloadingMods, setDownloadingMods] = useState({});
  const [versionSelectorModal, setVersionSelectorModal] = useState(null);
  const [selectedMod, setSelectedMod] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(true);
  const [activeRecTab, setActiveRecTab] = useState('all'); // 'all' | 'performance' | 'qol' | 'synergy'

  const installedModKeys = useMemo(() => {
    const keys = new Set();
    for (const node of installedNodes) {
      if (node.type === 'mod') {
        const labelKey = normalizeName(node.data?.label);
        const idKey = normalizeName((node.id || '').replace(/^mod-/, ''));
        if (labelKey) keys.add(labelKey);
        if (idKey) keys.add(idKey);
      }
    }
    return keys;
  }, [installedNodes]);

  const isModInstalled = useCallback((mod) => {
    if (!mod || installedModKeys.size === 0) return false;
    const titleKey = normalizeName(mod.title);
    const slugKey = normalizeName(mod.slug);
    if (titleKey && installedModKeys.has(titleKey)) return true;
    if (slugKey && installedModKeys.has(slugKey)) return true;
    for (const installed of installedModKeys) {
      if (installed.length >= 5 && ((titleKey && titleKey === installed) || (slugKey && slugKey === installed))) {
        return true;
      }
    }
    return false;
  }, [installedModKeys]);

  const smartRecommendations = useMemo(() => {
    const loader = normalizeLoader(storeLoader || packInfo?.loader || 'forge');
    const installedArray = Array.from(installedModKeys);

    return CURATED_RECOMMENDATIONS.filter(rec => {
      if (!rec.loaders.some(l => loader.includes(l))) return false;
      const alreadyHas = rec.matchKeys.some(mk =>
        installedArray.some(inst => inst.includes(mk))
      );
      if (alreadyHas) return false;
      if (rec.requiresAny) {
        const hasPrerequisite = rec.requiresAny.some(req =>
          installedArray.some(inst => inst.includes(req))
        );
        if (!hasPrerequisite) return false;
      }
      return true;
    });
  }, [storeLoader, packInfo?.loader, installedModKeys]);

  const apiStatusDisplay = useMemo(() => {
    const modrinthState = typeof apiStatus?.modrinth === 'object' ? apiStatus.modrinth?.status : apiStatus?.modrinth;
    const modrinthLat = typeof apiStatus?.modrinth === 'object' ? apiStatus.modrinth?.latency : apiStatus?.modrinthLatency;
    const cfState = typeof apiStatus?.curseforge === 'object' ? apiStatus.curseforge?.status : apiStatus?.curseforge;
    const cfLat = typeof apiStatus?.curseforge === 'object' ? apiStatus.curseforge?.latency : apiStatus?.curseforgeLatency;
    return {
      modrinth: {
        status: modrinthState,
        color: modrinthState === 'connected' ? '#00e67a' : modrinthState === 'timeout' ? '#ffc42e' : '#ff4d6a',
        label: `Modrinth${modrinthLat ? ` (${modrinthLat}ms)` : ''}`,
      },
      curseforge: {
        status: cfState,
        color: cfState === 'connected' ? '#00e67a' : cfState === 'timeout' ? '#ffc42e' : '#ff4d6a',
        label: `CurseForge${cfLat ? ` (${cfLat}ms)` : ''}`,
      }
    };
  }, [apiStatus]);

  const executeSearch = useCallback(async ({ query, sort, category, versionOverride, loaderOverride } = {}) => {
    if (!window.electronAPI) return;
    const effectiveQuery = query !== undefined ? query : onlineSearchQuery;
    const effectiveSort = sort !== undefined ? sort : sortBy;
    const effectiveCategory = category !== undefined ? category : modCategory;
    const gameVersion = versionOverride || storeGameVersion || packInfo?.gameVersion || '1.20.1';
    const loader = normalizeLoader(loaderOverride || storeLoader || packInfo?.loader || 'forge');

    setIsSearchingOnline(true);
    setHasSearched(true);
    setSearchError(null);
    setVisibleOnlineCount(24);
    try {
      const result = await window.electronAPI.searchModsOnline(
        effectiveQuery,
        gameVersion,
        loader,
        effectiveSort,
        effectiveCategory
      );
      if (result?.success) {
        const items = result.results || [];
        setOnlineResults(items);
        if (result.errors && items.length === 0) {
          setSearchError(`Error de conexión: ${Object.values(result.errors).join(' | ')}`);
        } else if (result.errors) {
          setSearchError(`Aviso parcial: ${Object.entries(result.errors).map(([k, v]) => `${k}: ${v}`).join(' | ')}`);
        }
        if (result.counts) {
          setSourceCounts(result.counts);
        } else {
          const mrCount = items.filter(m => m.sources?.includes('modrinth') || m.source === 'modrinth').length;
          const cfCount = items.filter(m => m.sources?.includes('curseforge') || m.source === 'curseforge').length;
          setSourceCounts({ modrinth: mrCount, curseforge: cfCount, total: items.length });
        }
      } else {
        console.warn('[store] Search failed:', result?.message);
        setSearchError(result?.message || 'La búsqueda no pudo completarse.');
        setOnlineResults([]);
        setSourceCounts({ modrinth: 0, curseforge: 0, total: 0 });
      }
    } catch (err) {
      console.error('[store] Search error:', err);
      setSearchError(err?.message || 'Error inesperado al buscar mods.');
      setOnlineResults([]);
      setSourceCounts({ modrinth: 0, curseforge: 0, total: 0 });
    }
    setIsSearchingOnline(false);
  }, [onlineSearchQuery, storeGameVersion, storeLoader, packInfo, sortBy, modCategory]);

  const handleSearchOnline = useCallback((overrideSort) => {
    const sort = typeof overrideSort === 'string' ? overrideSort : sortBy;
    return executeSearch({ sort });
  }, [executeSearch, sortBy]);

  const setSortBy = useCallback((newSort) => {
    setSortByState(newSort);
    if (newSort) {
      executeSearch({ sort: newSort });
    }
  }, [executeSearch]);

  const setModCategory = useCallback((newCategory) => {
    setModCategoryState(newCategory);
    executeSearch({ category: newCategory });
  }, [executeSearch]);

  const setStoreGameVersion = useCallback((newVer) => {
    setStoreGameVersionState(newVer);
    executeSearch({ versionOverride: newVer });
  }, [executeSearch]);

  const setStoreLoader = useCallback((newLoader) => {
    const norm = normalizeLoader(newLoader);
    setStoreLoaderState(norm);
    executeSearch({ loaderOverride: norm });
  }, [executeSearch]);

  const applyQuickSearch = useCallback((queryText, categoryId = '') => {
    setOnlineSearchQuery(queryText);
    if (categoryId !== undefined) setModCategoryState(categoryId);
    executeSearch({ query: queryText, category: categoryId });
  }, [executeSearch]);

  const clearSearch = useCallback(() => {
    setOnlineSearchQuery('');
    setModCategoryState('');
    setSourceFilter('all');
    executeSearch({ query: '', category: '' });
  }, [executeSearch]);

  const filteredResults = useMemo(() => {
    return onlineResults
      .map(mod => ({
        ...mod,
        installed: isModInstalled(mod)
      }))
      .filter(mod => {
        if (hideInstalled && mod.installed) return false;
        const srcs = mod.sources || [mod.source || 'modrinth'];
        if (sourceFilter === 'modrinth') return srcs.includes('modrinth');
        if (sourceFilter === 'curseforge') return srcs.includes('curseforge');
        if (sourceFilter === 'both') return srcs.includes('modrinth') && srcs.includes('curseforge');
        return true;
      });
  }, [onlineResults, sourceFilter, hideInstalled, isModInstalled]);

  // Recalcular conteos reales sobre onlineResults
  const liveSourceCounts = useMemo(() => {
    let modrinth = 0;
    let curseforge = 0;
    let both = 0;
    for (const mod of onlineResults) {
      const srcs = mod.sources || [mod.source || 'modrinth'];
      const hasMr = srcs.includes('modrinth');
      const hasCf = srcs.includes('curseforge');
      if (hasMr) modrinth++;
      if (hasCf) curseforge++;
      if (hasMr && hasCf) both++;
    }
    return {
      all: onlineResults.length,
      modrinth,
      curseforge,
      both,
      rawModrinth: sourceCounts.modrinth || modrinth,
      rawCurseforge: sourceCounts.curseforge || curseforge
    };
  }, [onlineResults, sourceCounts]);

  const fetchApiStatus = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.apiStatus();
      if (result.success) setApiStatus(result.status);
    } catch (err) { console.warn('Failed to fetch API status:', err); }
  }, []);

  const refreshApiStatus = useCallback(async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.apiStatusRefresh();
      if (result.success) setApiStatus(result.status);
    } catch (err) { console.warn('Failed to refresh API status:', err); }
  }, []);

  const handleSelectModVersions = useCallback(async (projectId, modTitle, source, modObj = null) => {
    if (!window.electronAPI) return;
    if (!packInfo) {
      alert('Para instalar un mod, primero carga la carpeta de tu modpack o crea un Nuevo Proyecto en la barra superior.');
      return;
    }
    const targetVersion = storeGameVersion || packInfo.gameVersion || '1.20.1';
    const targetLoader = normalizeLoader(storeLoader || packInfo.loader || 'forge');
    const effectiveSource = source || modObj?.source || 'modrinth';
    const effectiveId = effectiveSource === 'curseforge'
      ? (modObj?.curseforge_id || projectId)
      : (modObj?.modrinth_id || projectId);

    setDownloadingMods(prev => ({ ...prev, [projectId]: true, [effectiveId]: true }));
    try {
      const result = await window.electronAPI.getModVersions(effectiveId, targetVersion, targetLoader, effectiveSource);
      if (result?.success && result.versions.length > 0) {
        setVersionSelectorModal({
          title: modTitle,
          projectId: effectiveId,
          source: effectiveSource,
          versions: result.versions,
          mod: modObj
        });
      } else if (modObj?.sources?.length > 1) {
        // Fallback automático a la otra plataforma si el mod existe en ambas
        const altSource = effectiveSource === 'curseforge' ? 'modrinth' : 'curseforge';
        const altId = altSource === 'curseforge' ? modObj.curseforge_id : modObj.modrinth_id;
        if (altId) {
          const altResult = await window.electronAPI.getModVersions(altId, targetVersion, targetLoader, altSource);
          if (altResult?.success && altResult.versions.length > 0) {
            setVersionSelectorModal({
              title: modTitle,
              projectId: altId,
              source: altSource,
              versions: altResult.versions,
              mod: modObj
            });
            setDownloadingMods(prev => ({ ...prev, [projectId]: false, [effectiveId]: false }));
            return;
          }
        }
        alert(`No hay versiones de ${modTitle} para ${targetLoader.toUpperCase()} ${targetVersion} en ${effectiveSource.toUpperCase()}.`);
      } else {
        alert(`No hay versiones de ${modTitle} para ${targetLoader.toUpperCase()} ${targetVersion} en la base de datos de ${effectiveSource.toUpperCase()}.`);
      }
    } catch (err) {
      console.error('[handleSelectModVersions]', err);
    }
    setDownloadingMods(prev => ({ ...prev, [projectId]: false, [effectiveId]: false }));
  }, [packInfo, storeGameVersion, storeLoader]);

  const handleConfirmDownload = useCallback(async (version, setVersionSelectorModalArg, showToast) => {
    if (!window.electronAPI || !packInfo || !versionSelectorModal) return;
    const modTitle = versionSelectorModal.title;
    setVersionSelectorModalArg(null);
    let downloadDeps = false;
    if (version.dependencies?.length > 0) {
      if (version.source === 'modrinth') {
        downloadDeps = window.confirm(`[!] "${modTitle}" necesita ${version.dependencies.length} dependencia(s) obligatoria(s).\n\n¿Deseas que el instalador recursivo las busque e instale automáticamente para ${packInfo.gameVersion}?`);
      } else {
        alert(`[!] "${modTitle}" requiere ${version.dependencies.length} dependencia(s). En CurseForge recuerda verificar que tengas sus librerías base instaladas.`);
      }
    }
    try {
      showToast("Descargando...", `Instalando ${modTitle} (${version.name})...`, "loading");
      if (downloadDeps && version.source === 'modrinth') {
        const result = await window.electronAPI.installModRecursively(version.id, packInfo.gameVersion, packInfo.loader, packInfo.path);
        console.log("Log de instalación:", result.logs);
      } else {
        const result = await window.electronAPI.downloadMod(version, packInfo.path);
        if (result && !result.success) {
          if (result.errorCode === 'RESTRICTED_BY_AUTHOR') {
            alert(`[!] Descarga Restringida por el Autor en CurseForge\n\n${result.message}\n\nSi el mod también está en Modrinth, puedes descargarlo desde allí sin restricciones.`);
          } else {
            alert(`[x] Error al descargar: ${result.message}`);
          }
          return;
        }
      }
      const scanResult = await window.electronAPI.scanMods(packInfo.path);
      showToast("Descarga Completada", `${modTitle} se instaló en tu modpack.`, "success");
      return scanResult;
    } catch (err) {
      alert(`[x] Error al instalar: ${err.message}`);
    }
  }, [packInfo, versionSelectorModal]);

  // Sincronizar versión y loader cuando se carga un modpack
  useEffect(() => {
    if (packInfo?.gameVersion || packInfo?.loader) {
      const nextVer = packInfo.gameVersion || '1.20.1';
      const nextLoader = normalizeLoader(packInfo.loader || 'forge');
      const timer = setTimeout(() => {
        setStoreGameVersionState(nextVer);
        setStoreLoaderState(nextLoader);
        executeSearch({ versionOverride: nextVer, loaderOverride: nextLoader });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [packInfo?.path, packInfo?.gameVersion, packInfo?.loader]);

  return {
    onlineSearchQuery, setOnlineSearchQuery,
    onlineResults, setOnlineResults,
    filteredResults,
    liveSourceCounts,
    searchError,
    storeGameVersion, setStoreGameVersion,
    storeLoader, setStoreLoader,
    isSearchingOnline, setIsSearchingOnline,
    hasSearched, setHasSearched,
    sortBy, setSortBy,
    modCategory, setModCategory,
    sourceFilter, setSourceFilter,
    viewMode, setViewMode,
    hideInstalled, setHideInstalled,
    visibleOnlineCount, setVisibleOnlineCount,
    apiStatus, setApiStatus, apiStatusDisplay,
    downloadingMods, setDownloadingMods,
    versionSelectorModal, setVersionSelectorModal,
    selectedMod, setSelectedMod,
    showDetails, setShowDetails,
    showRecommendations, setShowRecommendations,
    activeRecTab, setActiveRecTab,
    smartRecommendations,
    isModInstalled,
    handleSearchOnline, applyQuickSearch, clearSearch,
    fetchApiStatus, refreshApiStatus,
    handleSelectModVersions, handleConfirmDownload,
  };
}
