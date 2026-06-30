import { useState, useCallback, useEffect } from 'react';
import { applyNodeChanges, applyEdgeChanges } from 'reactflow';

export function useModpack() {
  const [packInfo, setPackInfo] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [rootFiles, setRootFiles] = useState([]);
  const [currentPackPath, setCurrentPackPath] = useState(null);
  const [rfInstance, setRfInstance] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const [availableIds, setAvailableIds] = useState([]);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectData, setNewProjectData] = useState({ name: '', mcVersion: '1.20.1', loader: 'Forge' });
  const [availableGameVersions, setAvailableGameVersions] = useState([]);
  const [versionSelectorModal, setVersionSelectorModal] = useState(null);
  const [editingConfig, setEditingConfig] = useState(null);
  const [sidebarFiles, setSidebarFiles] = useState(null);

  const onNodesChange = useCallback((chs) => setNodes((nds) => applyNodeChanges(chs, nds)), []);
  const onEdgesChange = useCallback((chs) => setEdges((eds) => applyEdgeChanges(chs, eds)), []);

  const onPaneClick = useCallback(() => setContextMenu(null), []);
  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const processScanResult = useCallback((result) => {
    if (!result) return;
    const { mods, info, rootFiles: filesFromRoot } = result;
    setPackInfo(info);
    setRootFiles(filesFromRoot || []);
    if (info?.path) localStorage.setItem('lastModpackPath', info.path);

    const newNodes = [];
    const newEdges = [];
    const groups = { 'Librerías / Coremods': [] };

    mods.forEach(mod => {
      const lowerName = mod.name.toLowerCase();
      if (lowerName.includes('core') || lowerName.includes('lib') || lowerName.includes('api') ||
        lowerName.includes('patch') || lowerName.includes('baubles') || lowerName.includes('bookshelf')) {
        groups['Librerías / Coremods'].push(mod);
      } else {
        const configCount = mod.configs.length;
        let groupName = configCount === 0 ? 'Contenido (Sin Configs)' :
          configCount === 1 ? 'Contenido (1 Config)' : `Contenido (${configCount} Configs)`;
        if (!groups[groupName]) groups[groupName] = [];
        groups[groupName].push(mod);
      }
    });

    const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Librerías / Coremods') return -1;
      if (b === 'Librerías / Coremods') return 1;
      if (a === 'Contenido (Sin Configs)') return -1;
      if (b === 'Contenido (Sin Configs)') return 1;
      return parseInt(a.match(/\d+/)?.[0] || 0) - parseInt(b.match(/\d+/)?.[0] || 0);
    });

    let posX = 100, posY = 150;
    sortedGroupKeys.forEach((groupName, groupIndex) => {
      const modsInGroup = groups[groupName];
      if (modsInGroup.length === 0) return;
      const groupId = `group-${groupIndex}`;
      const cols = 4;
      const maxConfigsInGroup = Math.max(...modsInGroup.map(m => m.configs.length), 0);
      const rowHeight = 100 + (maxConfigsInGroup * 35) + 50;
      const numRows = Math.ceil(modsInGroup.length / cols);
      const groupWidth = Math.min(modsInGroup.length, cols) * 310 + 40;
      const groupHeight = (numRows * rowHeight) + 60;

      newNodes.push({ id: groupId, type: 'group', position: { x: posX, y: posY },
        style: { width: groupWidth, height: groupHeight, zIndex: 0 }, data: { label: groupName } });

      modsInGroup.forEach((mod, index) => {
        const modId = `mod-${mod.id}`;
        const relX = (index % cols) * 310 + 20;
        const relY = Math.floor(index / cols) * rowHeight + 60;
        newNodes.push({
          id: modId, type: 'mod', position: { x: relX, y: relY }, parentNode: groupId, extent: 'parent',
          data: { label: mod.name, version: mod.version, icon: mod.icon, hasConfigs: mod.configs.length > 0 },
          style: { zIndex: 1, borderRadius: 12, boxShadow: '0 6px 14px rgba(0,0,0,.25)', background: '#1e1e2e', border: '1px solid #37334a' }
        });
        mod.configs.forEach((cfg, cIndex) => {
          const cfgId = `cfg-${mod.id}-${cIndex}`;
          newNodes.push({
            id: cfgId, parentNode: modId, extent: 'parent',
            style: { background: '#94e2d5', color: '#11111b', fontSize: '10px', width: 150, borderRadius: '4px', padding: '4px', border: '1px solid #11111b', zIndex: 2 },
            position: { x: 20, y: 75 + (cIndex * 35) },
            data: { label: `Config: ${cfg}` }
          });
          newEdges.push({ id: `edge-${modId}-${cfgId}`, source: modId, target: cfgId, animated: true, type: 'smoothstep',
            style: { stroke: '#94e2d5', strokeWidth: 2, zIndex: 1 } });
        });
      });
      posX += groupWidth + 100;
    });

    setNodes(newNodes);
    setEdges(newEdges);
  }, []);

  const handleScanFolder = useCallback(async () => {
    if (!window.electronAPI) return;
    const result = await window.electronAPI.scanMods();
    if (result?.info) {
      processScanResult(result);
      const cleanPath = result.info.path.replace(/[\\\/]mods[\\\/]?$/, '');
      const ids = await window.electronAPI.scanModIds(cleanPath + '/mods');
      setAvailableIds(ids);
    }
  }, [processScanResult]);

  const handleOpenProjectWizard = useCallback(() => setIsCreatingProject(true), []);

  const handleConfirmCreateProject = useCallback(async () => {
    if (!newProjectData.name.trim()) return alert("Dale un nombre a tu modpack.");
    if (!window.electronAPI) return;
    const result = await window.electronAPI.createProject(newProjectData);
    if (result) {
      processScanResult(result);
      setIsCreatingProject(false);
      alert(`¡Entorno creado! Carpeta configurada para ${newProjectData.loader} ${newProjectData.mcVersion}`);
    } else {
      alert("Se canceló la selección de carpeta.");
    }
  }, [newProjectData, processScanResult]);

  useEffect(() => {
    const fetchVersions = async () => {
      if (isCreatingProject && availableGameVersions.length === 0 && window.electronAPI) {
        const result = await window.electronAPI.getGameVersions();
        if (result?.success) {
          setAvailableGameVersions(result.versions.filter(v => v.version_type === 'release'));
        }
      }
    };
    fetchVersions();
  }, [isCreatingProject, availableGameVersions.length]);

  useEffect(() => {
    const autoLoadLastPack = async () => {
      const lastPath = localStorage.getItem('lastModpackPath');
      if (!lastPath || !window.electronAPI) return;
      try {
        const result = await window.electronAPI.scanMods(lastPath);
        if (result?.info) {
          processScanResult(result);
          const cleanPath = result.info.path.replace(/[\\\/]mods[\\\/]?$/, '');
          const ids = await window.electronAPI.scanModIds(cleanPath + '/mods');
          setAvailableIds(ids);
        }
      } catch (e) {
        localStorage.removeItem('lastModpackPath');
      }
    };
    autoLoadLastPack();
  }, [processScanResult]);

  return {
    packInfo, setPackInfo,
    nodes, setNodes,
    edges, setEdges,
    rootFiles,
    currentPackPath, setCurrentPackPath,
    rfInstance, setRfInstance,
    contextMenu, setContextMenu,
    availableIds,
    isCreatingProject, setIsCreatingProject,
    newProjectData, setNewProjectData,
    availableGameVersions,
    versionSelectorModal, setVersionSelectorModal,
    editingConfig, setEditingConfig,
    sidebarFiles, setSidebarFiles,
    onNodesChange, onEdgesChange,
    onPaneClick, onNodeContextMenu,
    processScanResult,
    handleScanFolder, handleOpenProjectWizard, handleConfirmCreateProject,
  };
}