import { useState, useCallback, useEffect, useMemo } from 'react';

export function useOnlineStore(packInfo) {
  const [onlineSearchQuery, setOnlineSearchQuery] = useState('');
  const [onlineResults, setOnlineResults] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [sortBy, setSortBy] = useState('downloads');
  const [modCategory, setModCategory] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [visibleOnlineCount, setVisibleOnlineCount] = useState(20);
  const [apiStatus, setApiStatus] = useState({ modrinth: 'unknown', curseforge: 'unknown', overall: 'unknown' });
  const [downloadingMods, setDownloadingMods] = useState({});
  const [versionSelectorModal, setVersionSelectorModal] = useState(null);
  const [selectedMod, setSelectedMod] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  const apiStatusDisplay = useMemo(() => ({
    modrinth: {
      color: apiStatus?.modrinth === 'connected' ? '#a6e3a1' : apiStatus?.modrinth === 'timeout' ? '#f9e2af' : '#f38ba8',
      label: `Modrinth${apiStatus?.modrinthLatency ? ` (${apiStatus.modrinthLatency}ms)` : ''}`,
    },
    curseforge: {
      color: apiStatus?.curseforge === 'connected' ? '#a6e3a1' : apiStatus?.curseforge === 'timeout' ? '#f9e2af' : '#f38ba8',
      label: `CurseForge${apiStatus?.curseforgeLatency ? ` (${apiStatus.curseforgeLatency}ms)` : ''}`,
    }
  }), [apiStatus]);

  const handleSearchOnline = useCallback(async () => {
    if (!window.electronAPI || !packInfo) return;
    setIsSearchingOnline(true);
    setCurrentPage(1);
    const result = await window.electronAPI.searchModsOnline(onlineSearchQuery, packInfo.gameVersion, packInfo.loader, sortBy, modCategory);
    if (result?.success) setOnlineResults(result.results);
    setIsSearchingOnline(false);
  }, [onlineSearchQuery, packInfo, sortBy, modCategory]);

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

  const handleSelectModVersions = useCallback(async (projectId, modTitle, source) => {
    if (!window.electronAPI || !packInfo) return;
    setDownloadingMods(prev => ({ ...prev, [projectId]: true }));
    const result = await window.electronAPI.getModVersions(projectId, packInfo.gameVersion, packInfo.loader, source);
    if (result?.success && result.versions.length > 0) {
      setVersionSelectorModal({ title: modTitle, projectId, source, versions: result.versions });
    } else {
      alert(`No hay versiones de ${modTitle} para ${packInfo.loader} ${packInfo.gameVersion} en la base de datos de ${source.toUpperCase()}.`);
    }
    setDownloadingMods(prev => ({ ...prev, [projectId]: false }));
  }, [packInfo]);

  const handleConfirmDownload = useCallback(async (version, setVersionSelectorModal, showToast) => {
    if (!window.electronAPI || !packInfo || !versionSelectorModal) return;
    const modTitle = versionSelectorModal.title;
    setVersionSelectorModal(null);
    let downloadDeps = false;
    if (version.dependencies?.length > 0) {
      if (version.source === 'modrinth') {
        downloadDeps = window.confirm(`[!] "${modTitle}" necesita dependencias obligatorias.\n\n¿Deseas que el Algoritmo Recursivo las busque, filtre por la versión ${packInfo.gameVersion} y las instale automáticamente?`);
      } else {
        alert(`[!] "${modTitle}" requiere dependencias. Como viene de CurseForge, el instalador no las bajará automáticamente.`);
      }
    }
    try {
      if (downloadDeps && version.source === 'modrinth') {
        const result = await window.electronAPI.installModRecursively(version.id, packInfo.gameVersion, packInfo.loader, packInfo.path);
        console.log("Log de instalación:", result.logs);
      } else {
        const result = await window.electronAPI.downloadMod(version, packInfo.path);
        if (result && !result.success) {
          if (result.errorCode === 'RESTRICTED_BY_AUTHOR') {
            alert(`[!] Descarga Restringida por el Autor\n\n${result.message}\n\nAbre tu navegador y descárgalo manualmente.`);
          } else {
            alert(`[x] Error al descargar: ${result.message}`);
          }
          return;
        }
      }
      const scanResult = await window.electronAPI.scanMods(packInfo.path);
      showToast("Descarga", `¡Instalación de ${modTitle} completada!`, "success");
      return scanResult;
    } catch (err) {
      alert(`[x] Error al instalar: ${err.message}`);
    }
  }, [packInfo]);

  useEffect(() => {
    if (packInfo) handleSearchOnline();
  }, [sortBy, modCategory]);

  return {
    onlineSearchQuery, setOnlineSearchQuery,
    onlineResults, setOnlineResults,
    isSearchingOnline, setIsSearchingOnline,
    sortBy, setSortBy,
    modCategory, setModCategory,
    visibleOnlineCount, setVisibleOnlineCount,
    apiStatus, setApiStatus, apiStatusDisplay,
    downloadingMods, setDownloadingMods,
    versionSelectorModal, setVersionSelectorModal,
    selectedMod, setSelectedMod,
    showDetails, setShowDetails,
    handleSearchOnline, fetchApiStatus, refreshApiStatus,
    handleSelectModVersions, handleConfirmDownload,
  };
}