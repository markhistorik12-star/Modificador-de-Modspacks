export const processScanResult = (result, setPackInfo, setRootFiles, setNodes, setEdges) => {
  if (!result) return;

  const { mods, info, rootFiles: filesFromRoot } = result;
  setPackInfo(info);
  setRootFiles(filesFromRoot || []);

  if (info && info.path) {
    localStorage.setItem('lastModpackPath', info.path);
  }

  return mods;
};

export const handleScanFolder = async (setPackInfo, setRootFiles, setAvailableIds, setNodes, setEdges, electronAPI) => {
  if (electronAPI) {
    const result = await electronAPI.scanMods();
    if (result && result.info) {
      const mods = processScanResult(result, setPackInfo, setRootFiles, setNodes, setEdges);
      // Normalizar ruta de mods
      const cleanPath = result.info.path.replace(/[\\\/]mods[\\\/]?$/, '');
      const modPath = cleanPath + '/mods';
      const ids = await electronAPI.scanModIds(modPath);
      setAvailableIds(ids);
      return mods;
    }
  }
  return null;
};