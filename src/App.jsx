import { useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, { Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import 'reactflow/dist/style.css';
import ModNode from './components/nodes/ModNode';
import GroupNode from './components/nodes/GroupNode';
import ConfigEditor from './components/ConfigEditor';
import ScriptEditor from './components/ScriptEditor';

const nodeTypes = { mod: ModNode, group: GroupNode };

// --- SECCIÓN: AutocompleteInput ---
const AutocompleteInput = ({ value, onChange, availableIds, placeholder, colorClass }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const suggestions = value.length > 2
    ? availableIds.filter(id => id.toLowerCase().includes(value.toLowerCase())).slice(0, 50)
    : [];

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text" placeholder={placeholder} value={value}
        onChange={(e) => { onChange(e.target.value.toLowerCase()); setShowDropdown(true); }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        onFocus={() => setShowDropdown(true)}
        style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #313244', background: '#11111b', color: colorClass, outline: 'none', fontFamily: 'monospace', boxSizing: 'border-box' }}
      />
      {showDropdown && suggestions.length > 0 && (
        <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#181825', border: '1px solid #cba6f7', borderRadius: '8px', zIndex: 100, maxHeight: '250px', overflowY: 'auto', padding: 0, margin: '4px 0 0 0', listStyle: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.8)' }}>
          {suggestions.map((s, i) => (
            <li
              key={i}
              // onMouseDown evita que el input pierda el foco
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setShowDropdown(false); }}
              style={{ padding: '10px 15px', cursor: 'pointer', color: '#cdd6f4', borderBottom: '1px solid #313244', fontSize: '13px' }}
              onMouseEnter={e => e.target.style.background = '#313244'}
              onMouseLeave={e => e.target.style.background = 'transparent'}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// --- ANALIZADOR HEURÍSTICO UNIVERSAL ---
const analyzeFilePurpose = (fileName) => {
  const name = fileName.toLowerCase();

  if (!name.includes('.')) {
    if (name.includes('pack')) return "Contenedor de recursos externos (Texturas, Datapacks o Shaders).";
    if (name.includes('config')) return "Repositorio de ajustes técnicos de los mods instalados.";
    if (name.includes('script')) return "Carpeta de modificaciones de lógica y balance (Tweaks).";
    if (name.includes('save') || name.includes('world')) return "Almacenamiento de partidas y datos de nivel.";
    return "Directorio de soporte del sistema de juego.";
  }

  if (name.includes('option')) return "Ajustes de interfaz, controles y rendimiento gráfico del usuario.";
  if (name.includes('manifest') || name.includes('instance')) return "Índice de dependencias: Define qué mods y versiones requiere este pack.";
  if (name.includes('log')) return "Registro de eventos: Documenta errores y procesos de carga en tiempo real.";
  if (name.includes('server')) return "Configuración de conectividad y reglas para modo multijugador.";

  const ext = name.split('.').pop();
  const techMap = {
    'toml': 'Archivo de configuración moderno (formato legible).',
    'cfg': 'Configuración clásica de Forge para variables de juego.',
    'json': 'Estructura de datos para metadatos o sistema.',
    'txt': 'Documentación simple o parámetros de texto.',
    'zs': 'Script de CraftTweaker: Código que altera recetas.',
    'jar': 'Binario Java: Archivo ejecutable del mod.'
  };

  return techMap[ext] || "Archivo de datos auxiliares para el funcionamiento del modpack.";
};

export default function App() {
  const [toast, setToast] = useState({ show: false, title: '', message: '', type: 'success' });

  const showToast = (title, message, type = 'success') => {
    setToast({ show: true, title, message, type });
    setTimeout(() => setToast({ show: false, title: '', message: '', type: 'success' }), 4000);
  };
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [packInfo, setPackInfo] = useState(null);

  const onNodesChange = useCallback((chs) => setNodes((nds) => applyNodeChanges(chs, nds)), []);
  const onEdgesChange = useCallback((chs) => setEdges((eds) => applyEdgeChanges(chs, eds)), []);

  const [rootFiles, setRootFiles] = useState([]);
  const [activeTab, setActiveTab] = useState('mods');
  const [versionSelectorModal, setVersionSelectorModal] = useState(null);

  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectData, setNewProjectData] = useState({ name: '', mcVersion: '1.20.1', loader: 'Forge' });
  const [availableGameVersions, setAvailableGameVersions] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [searchMods, setSearchMods] = useState('');
  const [rfInstance, setRfInstance] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  const [availableIds, setAvailableIds] = useState([]);

  // --- ESTADOS DEL CENTRO DE TWEAKS ---
  const [activeTweakTab, setActiveTweakTab] = useState('items');
  const [itemTweakData, setItemTweakData] = useState({ itemId: '', damage: '', armor: '', toughness: '' });
  const [entityTweakData, setEntityTweakData] = useState({ entityId: '', health: '', damage: '', speed: '' });
  const [spawnCenter, setSpawnCenter] = useState({ entityId: 'minecraft:zombie', health: 20, speed: 0.2, damage: 5 });
  const [lootCenter, setLootCenter] = useState({ lootPath: 'data/minecraft/loot_tables/entities/zombie.json', patch: '{"sample":1}' });

  // Optimización Inteligente
  const [optimizerStep, setOptimizerStep] = useState('idle'); // idle | running | done
  const [optimizerResults, setOptimizerResults] = useState([]);
  const [optimizerMessage, setOptimizerMessage] = useState('');
  const [hasBackup, setHasBackup] = useState(false);

  // Hooks legacy (en desuso)
  const [spawnModalOpen, setSpawnModalOpen] = useState(false);
  const [spawnForm, setSpawnForm] = useState({ entityId: '', health: '', speed: '', damage: '' });
  const [lootModalOpen, setLootModalOpen] = useState(false);
  const [lootForm, setLootForm] = useState({ lootPath: '', patch: '' });

  const [currentPackPath, setCurrentPackPath] = useState(null);

  const [onlineSearchQuery, setOnlineSearchQuery] = useState('');
  const [onlineResults, setOnlineResults] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [downloadingMods, setDownloadingMods] = useState({});

  const [sortBy, setSortBy] = useState('downloads');
  const [modCategory, setModCategory] = useState('');



  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;
  const [diagnosticReport, setDiagnosticReport] = useState(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);


  const [selectedMod, setSelectedMod] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [visibleOnlineCount, setVisibleOnlineCount] = useState(20);

  const [sidebarFiles, setSidebarFiles] = useState(null);
  const [graphZoom, setGraphZoom] = useState(1);
  const [editingConfig, setEditingConfig] = useState(null);

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleAskBotAboutMod = () => {
    alert("🤖 La función de análisis con IA ha sido deshabilitada temporalmente en esta versión.");
    setContextMenu(null);
  };

  const processScanResult = (result) => {
    if (!result) return;

    const { mods, info, rootFiles: filesFromRoot } = result;
    setPackInfo(info);
    setRootFiles(filesFromRoot || []);

    if (info && info.path) {
      localStorage.setItem('lastModpackPath', info.path);
    }

    const newNodes = [];
    const newEdges = [];

    const groups = {
      'Librerías / Coremods': []
    };

    mods.forEach(mod => {
      const lowerName = mod.name.toLowerCase();

      if (
        lowerName.includes('core') || lowerName.includes('lib') ||
        lowerName.includes('api') || lowerName.includes('patch') ||
        lowerName.includes('baubles') || lowerName.includes('bookshelf')
      ) {
        groups['Librerías / Coremods'].push(mod);
      } else {
        const configCount = mod.configs.length;
        let groupName = '';

        if (configCount === 0) {
          groupName = 'Contenido (Sin Configs)';
        } else if (configCount === 1) {
          groupName = 'Contenido (1 Config)';
        } else {
          groupName = `Contenido (${configCount} Configs)`;
        }

        if (!groups[groupName]) {
          groups[groupName] = [];
        }
        groups[groupName].push(mod);
      }
    });

    const sortedGroupKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Librerías / Coremods') return -1;
      if (b === 'Librerías / Coremods') return 1;
      if (a === 'Contenido (Sin Configs)') return -1;
      if (b === 'Contenido (Sin Configs)') return 1;

      const numA = parseInt(a.match(/\d+/)?.[0] || 0);
      const numB = parseInt(b.match(/\d+/)?.[0] || 0);
      return numA - numB;
    });

    let posX = 100;
    let posY = 150;

    sortedGroupKeys.forEach((groupName, groupIndex) => {
      const modsInGroup = groups[groupName];
      if (modsInGroup.length === 0) return;

      const groupId = `group-${groupIndex}`;
      const cols = 4;

      const maxConfigsInGroup = Math.max(...modsInGroup.map(m => m.configs.length), 0);
      const baseModHeight = 100;
      const configSpacing = 35;
      const rowHeight = baseModHeight + (maxConfigsInGroup * configSpacing) + 50;

      const numRows = Math.ceil(modsInGroup.length / cols);
      const groupWidth = Math.min(modsInGroup.length, cols) * 310 + 40;
      const groupHeight = (numRows * rowHeight) + 60;

      newNodes.push({
        id: groupId,
        type: 'group',
        position: { x: posX, y: posY },
        style: { width: groupWidth, height: groupHeight, zIndex: 0 },
        data: { label: groupName }
      });

      modsInGroup.forEach((mod, index) => {
        const modId = `mod-${mod.id}`;

        const relX = (index % cols) * 310 + 20;
        const relY = Math.floor(index / cols) * rowHeight + 60;

        newNodes.push({
          id: modId,
          type: 'mod',
          position: { x: relX, y: relY },
          parentNode: groupId,
          extent: 'parent',
          data: {
            label: mod.name,
            version: mod.version,
            icon: mod.icon,
            hasConfigs: mod.configs.length > 0
          },
          style: { zIndex: 1, borderRadius: 12, boxShadow: '0 6px 14px rgba(0,0,0,.25)', background: '#1e1e2e', border: '1px solid #37334a' }
        });

        mod.configs.forEach((cfg, cIndex) => {
          const cfgId = `cfg-${mod.id}-${cIndex}`;
          newNodes.push({
            id: cfgId,
            parentNode: modId,
            extent: 'parent',
            style: {
              background: '#94e2d5', color: '#11111b', fontSize: '10px',
              width: 150, borderRadius: '4px', padding: '4px', border: '1px solid #11111b', zIndex: 2
            },
            position: { x: 20, y: 75 + (cIndex * 35) },
            data: { label: `⚙️ ${cfg}` }
          });
          newEdges.push({
            id: `edge-${modId}-${cfgId}`,
            source: modId, target: cfgId, animated: true,
            type: 'smoothstep',
            style: { stroke: '#94e2d5', strokeWidth: 2, zIndex: 1 },
          });
        });
      });

      posX += groupWidth + 100;
    });

    setNodes(newNodes);
    setEdges(newEdges);
  };

  // --- SECCIÓN: Escaneo de carpeta ---
  const handleScanFolder = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.scanMods();
      if (result && result.info) {
        processScanResult(result);
        // Normalizar ruta de mods
        const cleanPath = result.info.path.replace(/[\\\/]mods[\\\/]?$/, '');
        const modPath = cleanPath + '/mods';
        const ids = await window.electronAPI.scanModIds(modPath);
        setAvailableIds(ids);
      }
    }
  };

  const handleOpenProjectWizard = () => setIsCreatingProject(true);

  const handleConfirmCreateProject = async () => {
    if (!newProjectData.name.trim()) return alert("Dale un nombre a tu modpack.");

    if (window.electronAPI) {
      const result = await window.electronAPI.createProject(newProjectData);
      if (result) {
        processScanResult(result);
        setIsCreatingProject(false);
        alert(`¡Entorno creado! Carpeta configurada para ${newProjectData.loader} ${newProjectData.mcVersion}`);
      } else {
        alert("Se canceló la selección de carpeta.");
      }
    }
  };

  useEffect(() => {
    if (activeTab === 'store' && packInfo) {
      handleSearchOnline();
    }
  }, [activeTab, sortBy, modCategory]);

  useEffect(() => {
    const fetchVersions = async () => {
      if (isCreatingProject && availableGameVersions.length === 0 && window.electronAPI) {
        const result = await window.electronAPI.getGameVersions();
        if (result && result.success) {
          const releases = result.versions.filter(v => v.version_type === 'release');
          setAvailableGameVersions(releases);
        }
      }
    };
    fetchVersions();
  }, [isCreatingProject]);

  const handleSearchOnline = async () => {
    if (!window.electronAPI || !packInfo) return;

    setIsSearchingOnline(true);
    setCurrentPage(1);

    const result = await window.electronAPI.searchModsOnline(
      onlineSearchQuery, packInfo.gameVersion, packInfo.loader, sortBy, modCategory
    );

    if (result && result.success) setOnlineResults(result.results);
    setIsSearchingOnline(false);
  };

  const handleSelectModVersions = async (projectId, modTitle, source) => {
    if (!window.electronAPI || !packInfo) return;
    setDownloadingMods(prev => ({ ...prev, [projectId]: true }));

    const result = await window.electronAPI.getModVersions(projectId, packInfo.gameVersion, packInfo.loader, source);

    if (result && result.success && result.versions.length > 0) {
      setVersionSelectorModal({ title: modTitle, projectId: projectId, source: source, versions: result.versions });
    } else {
      alert(`No hay versiones de ${modTitle} para ${packInfo.loader} ${packInfo.gameVersion} en la base de datos de ${source.toUpperCase()}.`);
    }
    setDownloadingMods(prev => ({ ...prev, [projectId]: false }));
  };

  // --- SECCIÓN: Descarga de mod ---
  const handleConfirmDownload = async (version) => {
    if (!window.electronAPI || !packInfo || !versionSelectorModal) return;

    const modTitle = versionSelectorModal.title;
    setVersionSelectorModal(null);

    let downloadDeps = false;
    if (version.dependencies && version.dependencies.length > 0) {
      if (version.source === 'modrinth') {
        downloadDeps = window.confirm(`⚠️ "${modTitle}" necesita dependencias obligatorias.\n\n¿Deseas que el Algoritmo Recursivo las busque, filtre por la versión ${packInfo.gameVersion} y las instale automáticamente?`);
      } else {
        alert(`⚠️ "${modTitle}" requiere dependencias. Como viene de CurseForge, el instalador no las bajará automáticamente. Por favor, instálalas tú mismo desde la tienda.`);
      }
    }

    try {
      if (downloadDeps && version.source === 'modrinth') {
        alert(`Iniciando descarga recursiva de ${modTitle} y su árbol de dependencias...`);
        const result = await window.electronAPI.installModRecursively(version.id, packInfo.gameVersion, packInfo.loader, packInfo.path);
        console.log("Log de instalación:", result.logs);
      } else {
        const result = await window.electronAPI.downloadMod(version, packInfo.path);

        if (result && !result.success) {
          if (result.errorCode === 'RESTRICTED_BY_AUTHOR') {
            alert(
              `⚠️ Descarga Restringida por el Autor\n\n` +
              `${result.message}\n\n` +
              `Abre tu navegador, busca "${modTitle}" en CurseForge y descárgalo manualmente en tu carpeta 'mods/'.`
            );
          } else {
            alert(`❌ Error al descargar: ${result.message}`);
          }
          return;
        }
      }

      const scanResult = await window.electronAPI.scanMods(packInfo.path);
      if (scanResult) processScanResult(scanResult);

      alert(`✅ ¡Instalación de ${modTitle} completada! Revisa tu ecosistema de mods.`);
    } catch (err) {
      alert(`❌ Error al instalar: ${err.message}`);
    }
  };

  useEffect(() => {
    const autoLoadLastPack = async () => {
      const lastPath = localStorage.getItem('lastModpackPath');
      if (lastPath && window.electronAPI) {
        try {
          const result = await window.electronAPI.scanMods(lastPath);
          if (result && result.info) {
            processScanResult(result);
            const cleanPath = result.info.path.replace(/[\\\/]mods[\\\/]?$/, '');
            const modPath = cleanPath + '/mods';
            const ids = await window.electronAPI.scanModIds(modPath);
            setAvailableIds(ids);
          }
        } catch (e) {
          console.warn("No se pudo auto-cargar la carpeta anterior.", e);
          localStorage.removeItem('lastModpackPath');
        }
      }
    };
    autoLoadLastPack();
  }, []);

  const filteredFiles = useMemo(() => {
    return rootFiles.filter(file => {
      if (!searchTerm) return true;
      const lowerFile = file.toLowerCase();
      const lowerSearch = searchTerm.toLowerCase();
      const description = analyzeFilePurpose(file).toLowerCase();
      return lowerFile.includes(lowerSearch) || description.includes(lowerSearch);
    });
  }, [rootFiles, searchTerm]);

  const displayNodes = useMemo(() => {
    return nodes.map(node => {
      if (!searchMods) return { ...node, style: { ...node?.style, opacity: 1, pointerEvents: 'all' } };
      const lowerSearch = searchMods.toLowerCase();
      const isMatch =
        (node.data.label && node.data.label.toLowerCase().includes(lowerSearch)) ||
        (node.data.version && node.data.version.toLowerCase().includes(lowerSearch));

      return {
        ...node,
        style: {
          ...node.style,
          opacity: isMatch ? 1 : 0.15,
          transition: 'opacity 0.3s ease',
          pointerEvents: isMatch ? 'all' : 'none'
        }
      };
    });
  }, [nodes, searchMods]);

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchMods && rfInstance) {
      const matches = nodes.filter(n => n.type === 'mod' &&
        n.data.label.toLowerCase().includes(searchMods.toLowerCase())
      );
      if (matches.length > 0) {
        const exactMatch = matches.find(n =>
          n.data.label.toLowerCase() === searchMods.toLowerCase()
        );
        const targetNode = exactMatch || matches[0];
        rfInstance.setCenter(targetNode.position.x + 75, targetNode.position.y + 25, {
          zoom: 1.2,
          duration: 800
        });
      }
    }
  };

  const onNodeClick = async (event, node) => {
    if (node.id.startsWith('cfg-') && window.electronAPI && packInfo) {
      const fileName = node.data.label.replace('⚙️ ', '').trim();
      const relativePath = `config/${fileName}`;

      if (!fileName.includes('.')) {
        const result = await window.electronAPI.listFolderContent(relativePath, packInfo.path);
        if (result.success) {
          setSidebarFiles({ title: fileName, path: relativePath, files: result.files, isJar: false });
        }
        return;
      }

      const result = await window.electronAPI.readFullFile(relativePath, packInfo.path);
      if (result.success) {
        setEditingConfig({ name: fileName, path: relativePath, content: result.content });
      }
    }
  };

  const handleOpenGlobalFile = async (fileName) => {
    if (!window.electronAPI || !packInfo) return;

    if (!fileName.includes('.')) {
      const extResult = await window.electronAPI.openExternalEditor(fileName, packInfo.path);
      if (!extResult.success) {
        alert(`Fallo al abrir en editor externo: ${extResult.message}`);
      }
      return;
    }

    const result = await window.electronAPI.readFullFile(fileName, packInfo.path);

    if (result.success) {
      setEditingConfig({ name: fileName, path: fileName, content: result.content });
    } else {
      alert(result.message);
    }
  };

  const handleSaveConfig = async (newContent) => {
    if (window.electronAPI && packInfo && editingConfig) {
      const result = await window.electronAPI.writeFile(editingConfig.path, packInfo.path, newContent);
      if (result.success) {
        setEditingConfig(null);
        alert("¡Configuración guardada con éxito!");
      } else {
        alert("Error al guardar el archivo.");
      }
    }
  };

  const handleOpenExternal = async () => {
    if (window.electronAPI && packInfo && editingConfig) {
      await window.electronAPI.openExternalEditor(editingConfig.path, packInfo.path);
    }
  };

  // --- SECCIÓN: Exportación de modpack ---
  const handleExportModpack = async () => {
    if (!window.electronAPI || !packInfo) return;

    alert("📦 Empaquetando modpack...\n\nEsto puede tardar unos segundos dependiendo de cuántos mods tengas. Presiona Aceptar y espera.");

    const result = await window.electronAPI.exportModpack(packInfo.path, packInfo.name);

    if (result && result.success) {
      alert(`✅ ¡Modpack exportado con éxito!\n\nSe ha guardado en:\n${result.path}\n\nSe abrirá la carpeta automáticamente. Arrastra este archivo .zip a Prism Launcher o CurseForge para jugarlo.`);
    } else {
      alert(`❌ Error al exportar: ${result?.message}`);
    }
  };

  const handleDiagnosePack = async () => {
    if (!window.electronAPI || !packInfo) return;
    setIsDiagnosing(true);

    const result = await window.electronAPI.diagnoseModpack(packInfo.path);
    setIsDiagnosing(false);

    if (result && result.success) {
      setDiagnosticReport(result.report);

      setNodes(nds => nds.map(node => {
        if (node.type === 'mod') {
          const hasError = Object.entries(result.report.fileStatusMap).some(([fileName, status]) =>
            status === 'error' && fileName.includes(node.data.label.toLowerCase().replace(/\s/g, ''))
          );

          if (hasError) {
            return {
              ...node,
              style: { ...node.style, border: '3px solid #f38ba8', boxShadow: '0 0 20px rgba(243, 139, 168, 0.8)' }
            };
          } else {
            return {
              ...node,
              style: { ...node.style, border: '2px solid #a6e3a1', boxShadow: '0 0 10px rgba(166, 227, 161, 0.3)' }
            };
          }
        }
        return node;
      }));
    } else {
      alert(`Error en el diagnóstico: ${result?.message}`);
    }
  };

  const handleNodesDelete = async (deletedNodes) => {
    for (const node of deletedNodes) {
      console.log("🔍 Intentando borrar el nodo:", node);

      let fileName = node.data?.id || node.data?.name || node.id;

      if (fileName.startsWith('mod-')) {
        fileName = fileName.replace('mod-', '');
      }

      if (!fileName.endsWith('.jar')) {
        console.error(`❌ El nombre extraído no parece un archivo: ${fileName}`);
        alert(`Error interno: React intentó borrar algo que no es un .jar (${fileName})`);
        continue;
      }

      try {
        const result = await window.electronAPI.deleteFile(`mods/${fileName}`, packInfo.path);

        if (result.success) {
          console.log(`✅ ¡Fuego en el hoyo! Archivo eliminado del disco: ${fileName}`);
        } else {
          console.error(`❌ Fallo en el backend: ${result.message}`);
          alert(`El nodo desapareció, pero Node.js no pudo borrar el archivo: ${fileName}\nMotivo: ${result.message}`);
        }
      } catch (error) {
        console.error("Error grave de comunicación:", error);
      }
    }
  };

  const onNodeDoubleClick = async (event, node) => {
    if (node.type === 'mod' && window.electronAPI && packInfo) {
      const jarName = node.id.replace('mod-', '');

      console.log(`🕵️‍♂️ Escaneando el interior del mod: ${jarName}`);

      const result = await window.electronAPI.exploreJarContents(jarName, packInfo.path);

      if (result.success) {
        if (result.files.length === 0) {
          alert(`El mod ${node.data.label} no expone archivos JSON de recetas ni configuraciones por defecto.`);
        } else {
          setSidebarFiles({
            title: node.data.label,
            jarName: jarName,
            files: result.files,
            isJar: true
          });
        }
      } else {
        alert(result.message);
      }
    }
  };

  const [hardwareSpecs, setHardwareSpecs] = useState(null);
  // Hook para solicitar la radiografía del PC al backend apenas cargue la app
  useEffect(() => {
    const fetchHardware = async () => {
      if (window.electronAPI && window.electronAPI.getSystemSpecs) {
        const specs = await window.electronAPI.getSystemSpecs();
        if (specs.success) {
          setHardwareSpecs(specs.data);
        }
      }
    };
    fetchHardware();
  }, []);

  // Verificar si hay respaldo de optimización al cargar pack
  useEffect(() => {
    if (packInfo?.path && window.electronAPI?.optimizationCheckStatus) {
      (async () => {
        const res = await window.electronAPI.optimizationCheckStatus(packInfo.path);
        if (res.success && res.hasBackup) {
          setHasBackup(true);
          setOptimizerStep('done');
        }
      })();
    }
  }, [packInfo?.path]);

  const [isCalculatingImpact, setIsCalculatingImpact] = useState(false);

  const handleCalculateImpact = async () => {
    if (!window.electronAPI || !packInfo) return;
    setIsCalculatingImpact(true);

    const result = await window.electronAPI.calculateAllImpacts(packInfo.path);

    if (result && result.success) {
      // Inyectamos los puntajes reales en los nodos que ya tenemos cargados
      setNodes(nds => nds.map(node => {
        if (node.type === 'mod') {
          const fileName = node.id.replace('mod-', ''); 
          const newScore = result.scores[fileName] !== undefined ? result.scores[fileName] : 20;
          return { ...node, data: { ...node.data, impactScore: newScore } };
        }
        return node;
      }));
      showToast("Análisis Heurístico", "Impacto calculado para todos los mods.", "success");
    } else {
      showToast("Error", "No se pudo calcular el impacto.", "error");
    }
    setIsCalculatingImpact(false);
  };

  const modsOrdenados = useMemo(() => {
    return nodes
      .filter(n => n.type === 'mod')
      .map(n => ({
        id: n.id,
        label: n.data.label,
        impact: n.data.impactScore !== undefined ? n.data.impactScore : null
      }))
      .sort((a, b) => {
        if (a.impact === null || b.impact === null) return a.label.localeCompare(b.label);
        return b.impact - a.impact;
      });
  }, [nodes]);

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#11111b', color: '#cdd6f4', fontFamily: 'sans-serif', overflow: 'hidden' }}>

      {/* --- INYECCIÓN DE MOTOR DE ANIMACIONES CSS --- */}
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(100px); }
          to { opacity: 1; transform: translateX(0); }
        }
        .animate-tab { 
          animation: fadeSlideUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; 
        }
        .animate-modal { 
          animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; 
        }
        .toast-enter {
          animation: slideInRight 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
        }
        /* Efecto de presión suave para botones */
        button { transition: all 0.2s ease-in-out; }
        button:active:not(:disabled) { transform: scale(0.95); }
      `}</style>

      {/* --- ENTORNO DE EDICIÓN: SIDEBAR + EDITOR --- */}
      {(sidebarFiles || editingConfig) && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 3000, background: '#11111b', display: 'flex' }}>
          {/* SIDEBAR PERSISTENTE */}
          {sidebarFiles && (
            <div className="animate-tab" style={{ width: '280px', background: '#181825', borderRight: '1px solid #313244', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{ padding: '15px', borderBottom: '1px solid #313244', color: '#89b4fa', fontSize: '13px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📂 {sidebarFiles.title.toUpperCase()}</span>
                <button onClick={() => { setSidebarFiles(null); setEditingConfig(null); }} style={{ background: 'transparent', border: 'none', color: '#f38ba8', cursor: 'pointer', fontSize: '16px' }}>✖</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                {sidebarFiles.files.map((file, i) => {
                  const shortName = file.split('/').pop();
                  return (
                    <div
                      key={i}
                      onClick={async () => {
                        let res;
                        if (sidebarFiles.isJar) {
                          res = await window.electronAPI.readJarFile(sidebarFiles.jarName, file, packInfo.path);
                        } else {
                          res = await window.electronAPI.readFullFile(`${sidebarFiles.path}/${file}`, packInfo.path);
                        }
                        if (res.success) {
                          setEditingConfig({
                            name: shortName,
                            path: sidebarFiles.isJar ? `INTERNO/${file}` : `${sidebarFiles.path}/${file}`,
                            content: res.content
                          });
                        } else {
                          showToast("Error de lectura", res.message, "error");
                        }
                      }}
                      style={{
                        padding: '10px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#cdd6f4',
                        background: editingConfig?.name === shortName ? '#313244' : 'transparent',
                        borderLeft: editingConfig?.name === shortName ? '3px solid #89b4fa' : '3px solid transparent',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'background 0.2s'
                      }}
                    >
                      📄 {shortName}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* EDITOR GLOBALES */}
          <div className="animate-tab" style={{ flex: 1, position: 'relative' }}>
            {editingConfig ? (
              <ConfigEditor
                fileName={editingConfig.name}
                initialContent={editingConfig.content}
                onClose={() => setEditingConfig(null)}
                onSave={handleSaveConfig}
                onOpenExternal={handleOpenExternal}
              />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6c7086', flexDirection: 'column', gap: '15px' }}>
                <span style={{ fontSize: '48px' }}>📄</span>
                <p style={{ fontSize: '16px' }}>Selecciona un archivo del panel izquierdo para empezar a editar.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODAL: ASISTENTE DE NUEVO PROYECTO --- */}
      {isCreatingProject && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, background: 'rgba(17, 17, 27, 0.9)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="animate-modal" style={{ background: '#1e1e2e', border: '2px solid #a6e3a1', borderRadius: '12px', width: '450px', padding: '30px', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}>
            <h2 style={{ color: '#a6e3a1', marginTop: 0 }}>✨ Crear Entorno Virtual</h2>
            <p style={{ color: '#a6adc8', fontSize: '14px', marginBottom: '25px' }}>Configura los parámetros base de tu nuevo Modpack.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Nombre del Proyecto</label>
                <input type="text" value={newProjectData.name} onChange={e => setNewProjectData({ ...newProjectData, name: e.target.value })} placeholder="Ej: Mi Aventura RPG" style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', outline: 'none' }} />
              </div>

              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Versión de Minecraft</label>
                  <select
                    value={newProjectData.mcVersion}
                    onChange={e => setNewProjectData({ ...newProjectData, mcVersion: e.target.value })}
                    style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', outline: 'none', cursor: 'pointer' }}
                  >
                    {availableGameVersions.length > 0 ? (
                      availableGameVersions.map(v => (
                        <option key={v.version} value={v.version}>{v.version}</option>
                      ))
                    ) : (
                      <option value="1.20.1">Cargando versiones...</option>
                    )}
                  </select>
                </div>

                <div style={{ flex: 1 }}>
                  <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Mod Loader</label>
                  <select value={newProjectData.loader} onChange={e => setNewProjectData({ ...newProjectData, loader: e.target.value })} style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', outline: 'none', cursor: 'pointer' }}>
                    <option value="Forge">Forge</option>
                    <option value="Fabric">Fabric</option>
                    <option value="NeoForge">NeoForge</option>
                    <option value="Quilt">Quilt</option>
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => setIsCreatingProject(false)} style={{ background: '#313244', color: '#cdd6f4', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={handleConfirmCreateProject} style={{ background: '#a6e3a1', color: '#11111b', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Elegir Carpeta y Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: SELECTOR DE VERSIONES DE MODS --- */}
      {versionSelectorModal && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000,
          background: 'rgba(17, 17, 27, 0.8)', backdropFilter: 'blur(5px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
          <div className="animate-modal" style={{
            background: 'linear-gradient(135deg, #1b1e2a 0%, #2a2f62 100%)', border: '2px solid #89b4fa', borderRadius: '14px',
            width: '520px', maxHeight: '72vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 14px 40px rgba(0,0,0,0.5)', overflow: 'hidden'
          }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #313244', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#cba6f7' }}>📥 Instalar: {versionSelectorModal.title}</h3>
              <button onClick={() => setVersionSelectorModal(null)} style={{ background: 'transparent', border: 'none', color: '#f38ba8', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ margin: '0 0 10px 0', color: '#a6adc8', fontSize: '14px' }}>
                Selecciona la versión para Minecraft <b>{packInfo?.gameVersion}</b>:
              </p>

              {versionSelectorModal.versions.map(v => (
                <div key={v.id} style={{ background: '#11111b', border: '1px solid #313244', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#cdd6f4', fontWeight: 'bold' }}>{v.name}</div>
                    <div style={{ color: '#6c7086', fontSize: '12px' }}>Actualizado: {v.date}</div>
                    {v.dependencies.length > 0 && (
                      <div style={{ color: '#f9e2af', fontSize: '12px', marginTop: '5px' }}>
                        ⚠️ Requiere {v.dependencies.length} dependencia(s).
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => handleConfirmDownload(v)}
                    style={{ background: '#89b4fa', color: '#11111b', border: 'none', padding: '8px 15px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Descargar
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: REPORTE DE DIAGNÓSTICO --- */}
      {diagnosticReport && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 3000, background: 'rgba(17, 17, 27, 0.9)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="animate-modal" style={{ background: '#1e1e2e', border: `2px solid ${diagnosticReport.errors.length > 0 ? '#f38ba8' : '#a6e3a1'}`, borderRadius: '12px', width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.8)', overflow: 'hidden' }}>

            <div style={{ padding: '20px', borderBottom: '1px solid #313244', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#181825' }}>
              <h2 style={{ margin: 0, color: diagnosticReport.errors.length > 0 ? '#f38ba8' : '#a6e3a1', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {diagnosticReport.errors.length > 0 ? '❌ Conflictos Detectados' : '✅ Pack Saludable'}
              </h2>
              <button onClick={() => setDiagnosticReport(null)} style={{ background: 'transparent', border: 'none', color: '#a6adc8', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>

            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', gap: '15px', justifyContent: 'space-between' }}>
                <div style={{ background: '#11111b', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center', border: '1px solid #313244' }}>
                  <div style={{ color: '#cdd6f4', fontSize: '24px', fontWeight: 'bold' }}>{diagnosticReport.total}</div>
                  <div style={{ color: '#a6adc8', fontSize: '12px' }}>Total Mods</div>
                </div>
                <div style={{ background: '#11111b', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center', border: '1px solid #a6e3a1' }}>
                  <div style={{ color: '#a6e3a1', fontSize: '24px', fontWeight: 'bold' }}>{diagnosticReport.okCount}</div>
                  <div style={{ color: '#a6e3a1', fontSize: '12px' }}>Mods Válidos</div>
                </div>
                <div style={{ background: '#11111b', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center', border: '1px solid #f38ba8' }}>
                  <div style={{ color: '#f38ba8', fontSize: '24px', fontWeight: 'bold' }}>{diagnosticReport.errors.length}</div>
                  <div style={{ color: '#f38ba8', fontSize: '12px' }}>Errores Críticos</div>
                </div>
              </div>

              {/* PESO DEL MODPACK */}
              {diagnosticReport.weightReport && (
                <div style={{ background: '#181825', borderRadius: '12px', border: '1px solid #313244', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, color: '#fab387', fontSize: '16px' }}>🔥 Peso del Modpack</h3>
                    <span style={{
                      fontSize: '24px', fontWeight: 'bold',
                      color: diagnosticReport.weightReport.score <= 3 ? '#a6e3a1' : diagnosticReport.weightReport.score <= 5 ? '#f9e2af' : diagnosticReport.weightReport.score <= 7 ? '#fab387' : '#f38ba8'
                    }}>
                      {diagnosticReport.weightReport.score}/10
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                    {[1,2,3,4,5,6,7,8,9,10].map(i => {
                      const color = i <= diagnosticReport.weightReport.score
                        ? (diagnosticReport.weightReport.score <= 3 ? '#a6e3a1' : diagnosticReport.weightReport.score <= 5 ? '#f9e2af' : diagnosticReport.weightReport.score <= 7 ? '#fab387' : '#f38ba8')
                        : '#313244';
                      return <div key={i} style={{ flex: 1, height: '8px', background: color, borderRadius: '4px' }} />;
                    })}
                  </div>
                  <div style={{ color: '#6c7086', fontSize: '13px', textAlign: 'center', marginBottom: '15px' }}>
                    {diagnosticReport.weightReport.score <= 3 ? '🟢 Ligero — Excelente rendimiento' :
                     diagnosticReport.weightReport.score <= 5 ? '🟡 Moderado — Rendimiento aceptable' :
                     diagnosticReport.weightReport.score <= 7 ? '🟠 Pesado — Considera optimizar' :
                     '🔴 Muy pesado — Se recomienda optimizar'}
                  </div>
                  <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <div style={{ background: '#11111b', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #313244' }}>
                      <div style={{ color: '#cdd6f4', fontSize: '18px', fontWeight: 'bold' }}>📦 {diagnosticReport.weightReport.totalMods}</div>
                      <div style={{ color: '#a6adc8', fontSize: '11px' }}>Mods</div>
                    </div>
                    <div style={{ background: '#11111b', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #313244' }}>
                      <div style={{ color: '#89b4fa', fontSize: '18px', fontWeight: 'bold' }}>💾 {diagnosticReport.weightReport.totalSizeMB} MB</div>
                      <div style={{ color: '#a6adc8', fontSize: '11px' }}>Peso Total</div>
                    </div>
                    <div style={{ background: '#11111b', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #a6e3a1' }}>
                      <div style={{ color: '#a6e3a1', fontSize: '18px', fontWeight: 'bold' }}>⚡ {diagnosticReport.weightReport.optimizationCount}</div>
                      <div style={{ color: '#a6adc8', fontSize: '11px' }}>Optimización</div>
                    </div>
                    <div style={{ background: '#11111b', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #f38ba8' }}>
                      <div style={{ color: '#f38ba8', fontSize: '18px', fontWeight: 'bold' }}>🏋️ {diagnosticReport.weightReport.heavyCount}</div>
                      <div style={{ color: '#a6adc8', fontSize: '11px' }}>Mods Pesados</div>
                    </div>
                  </div>
                </div>
              )}

              {diagnosticReport.errors.length > 0 && (
                <div>
                  <h3 style={{ color: '#f38ba8', margin: '0 0 10px 0', fontSize: '16px' }}>Errores que causarán crasheos:</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {diagnosticReport.errors.map((err, i) => (
                      <div key={i} style={{ background: 'rgba(243, 139, 168, 0.1)', borderLeft: '4px solid #f38ba8', padding: '10px 15px', color: '#cdd6f4', fontSize: '14px', borderRadius: '0 6px 6px 0' }}>
                        {err}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diagnosticReport.warnings.length > 0 && (
                <div>
                  <h3 style={{ color: '#f9e2af', margin: '0 0 10px 0', fontSize: '16px' }}>Advertencias (Desconocidos):</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {diagnosticReport.warnings.map((warn, i) => (
                      <div key={i} style={{ background: 'rgba(249, 226, 175, 0.05)', borderLeft: '4px solid #f9e2af', padding: '10px 15px', color: '#a6adc8', fontSize: '13px', borderRadius: '0 6px 6px 0' }}>
                        {warn}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {diagnosticReport.errors.length === 0 && diagnosticReport.warnings.length === 0 && (
                <div style={{ textAlign: 'center', color: '#a6adc8', padding: '20px 0' }}>
                  Todo parece estar en perfecto orden. ¡Listo para exportar y jugar!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MENU CONTEXTUAL CLICK DERECHO --- */}
      {contextMenu && (
        <div className="animate-modal" style={{
          position: 'absolute', top: contextMenu.y, left: contextMenu.x, zIndex: 100,
          background: 'linear-gradient(135deg, #1b1e2a 0%, #232037 100%)', border: '1px solid #7c88ff', borderRadius: '10px',
          boxShadow: '0 6px 18px rgba(0,0,0,.4)', padding: '6px',
          display: 'flex', flexDirection: 'column'
        }}>
          <button
            onClick={handleAskBotAboutMod}
            style={{
              background: 'transparent', color: '#cdd6f4', border: 'none',
              padding: '10px 15px', cursor: 'pointer', display: 'flex',
              gap: '10px', alignItems: 'center', fontSize: '14px', borderRadius: '4px',
              transition: 'background 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.background = '#313244'}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}
          >
            <span>🤖</span> Analizar Mod con IA
          </button>
        </div>
      )}

      {/* --- BARRA SUPERIOR: DOS NIVELES (HEADER + NAV) --- */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, boxShadow: '0 8px 25px rgba(0,0,0,.35)' }}>
        {/* Nivel 1 — Header de acciones (64px) */}
        <div style={{
          height: '64px', background: 'linear-gradient(135deg, #1b1e2a 0%, #2a2b50 100%)',
          display: 'flex', alignItems: 'center', padding: '0 24px',
          borderBottom: '1px solid #3a3a64', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={handleScanFolder} style={{
              background: '#cba6f7', color: '#11111b', border: 'none',
              padding: '8px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'
            }}>
              📂 Cargar Modpack
            </button>
            <button onClick={handleOpenProjectWizard} style={{
              background: '#a6e3a1', color: '#11111b', border: 'none',
              padding: '8px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
              boxShadow: '0 0 10px rgba(166, 227, 161, 0.4)'
            }}>
              ✨ Nuevo Proyecto
            </button>
          </div>

          {packInfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: '#89b4fa', fontSize: '11px', fontWeight: '700', letterSpacing: '1px' }}>MODPACK</span>
                <div style={{ color: '#cdd6f4', fontWeight: 'bold', fontSize: '15px' }}>{packInfo.name}</div>
              </div>
              <div style={{ width: '1px', height: '32px', background: '#45475a' }} />
              <div style={{ textAlign: 'center' }}>
                <span style={{ color: '#89b4fa', fontSize: '11px', fontWeight: '700', letterSpacing: '1px' }}>MC</span>
                <div style={{ color: '#cdd6f4', fontWeight: 'bold', fontSize: '15px' }}>{packInfo.gameVersion}</div>
              </div>
            </div>
          )}

          {packInfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <button onClick={() => { showToast("Empaquetando...", "Comprimiendo tus mods. Esto puede tardar.", "loading"); handleExportModpack(); }} style={{
                background: '#f9e2af', color: '#11111b', border: 'none',
                padding: '8px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
                boxShadow: '0 0 10px rgba(249, 226, 175, 0.4)'
              }}>
                📦 Exportar
              </button>
              <button onClick={handleDiagnosePack} disabled={isDiagnosing} style={{
                background: isDiagnosing ? '#f9e2af' : '#89dceb', color: '#11111b', border: 'none',
                padding: '8px 18px', borderRadius: '6px', fontWeight: 'bold', cursor: isDiagnosing ? 'wait' : 'pointer',
                boxShadow: '0 0 10px rgba(137, 220, 235, 0.4)', transition: 'all 0.2s'
              }}>
                {isDiagnosing ? '⏳ Analizando...' : '🩺 Diagnosticar'}
              </button>
            </div>
          )}
        </div>

        {/* Nivel 2 — Barra de navegación (48px) */}
        <div style={{
          height: '48px', background: '#181825', display: 'flex', alignItems: 'center',
          padding: '0 24px', borderBottom: '1px solid #313244', gap: '4px'
        }}>
          {[
            { key: 'mods', label: '🧩 Ecosistema', color: '#cba6f7' },
            { key: 'global', label: '⚙️ Config. Gral', color: '#cba6f7' },
            { key: 'store', label: '🛒 Tienda', color: '#cba6f7' },
            { key: 'tweaks', label: '🧪 Tweaks', color: '#f5c2e7' },
            { key: 'performance', label: '📊 Rendimiento', color: '#fab387' },
            { key: 'ide', label: '📝 Editor IDE', color: '#a6e3a1' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
              background: activeTab === tab.key ? '#313244' : 'transparent',
              color: activeTab === tab.key ? tab.color : '#a6adc8',
              border: 'none', padding: '8px 16px', borderRadius: '6px',
              cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
              transition: 'all 0.2s ease', position: 'relative'
            }}>
              {tab.label}
              {activeTab === tab.key && (
                <div style={{ position: 'absolute', bottom: '-2px', left: '10%', width: '80%', height: '3px', background: tab.color, borderRadius: '2px' }} />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* --- DETALLES DE MOD (TIENDA) --- */}
      {showDetails && selectedMod && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="animate-modal" style={{ width: '720px', maxHeight: '80vh', overflowY: 'auto', background: '#1e1e2e', border: '2px solid #cba6f7', borderRadius: '12px', padding: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #313244', paddingBottom: 8 }}>
              <h3 style={{ margin: 0, color: '#cba6f7' }}>{selectedMod.title}</h3>
              <button onClick={() => setShowDetails(false)} style={{ background: 'transparent', border: '1px solid #313244', color: '#cdd6f4', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>Cerrar</button>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              {selectedMod.icon_url && (
                <img src={selectedMod.icon_url} alt={selectedMod.title} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }} />
              )}
              <div style={{ flex: 1 }}>
                <p style={{ color: '#a6adc8' }}>{selectedMod.description}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {selectedMod.author && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Autor: {selectedMod.author}</span>}
                  {selectedMod.version && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Versión: {String(selectedMod.version)}</span>}
                  {selectedMod.loaders?.length > 0 && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Loaders: {selectedMod.loaders.join(', ')}</span>}
                  {selectedMod.categories?.length > 0 && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Tags: {selectedMod.categories.join(' / ')}</span>}
                  {selectedMod.license && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Licencia: {selectedMod.license}</span>}
                  {selectedMod.dependencies?.length > 0 && (
                    <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Dep: {selectedMod.dependencies.map(d => d.project_id || d.name || d).join(', ')}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CONTENEDOR PRINCIPAL DE PESTAÑAS --- */}
      <div id="main-scroll-area" style={{ width: '100%', height: '100%', paddingTop: '112px', overflowY: 'auto', boxSizing: 'border-box' }}>

        {/* --- PESTAÑA 1: REACTFLOW (ECOSISTEMA) --- */}
        {activeTab === 'mods' && (
          <div className="animate-tab" style={{ position: 'relative', width: '100%', height: 'calc(100vh - 112px)' }}>
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 50, display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: 8, background: 'rgba(20,20,40,0.9)', border: '1px solid #313244' }}>
              <button onClick={() => {
                if (rfInstance?.setViewport) {
                  const newZoom = Math.min(3, graphZoom + 0.1);
                  setGraphZoom(newZoom);
                  rfInstance.setViewport({ x: 0, y: 0, zoom: newZoom }, 150);
                }
              }} title="Zoom in" style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#2d2f68', color: '#fff', cursor: 'pointer' }}>+</button>
              <button onClick={() => {
                if (rfInstance?.setViewport) {
                  const newZoom = Math.max(0.2, graphZoom - 0.1);
                  setGraphZoom(newZoom);
                  rfInstance.setViewport({ x: 0, y: 0, zoom: newZoom }, 150);
                }
              }} title="Zoom out" style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#2d2f68', color: '#fff', cursor: 'pointer' }}>−</button>
              <button onClick={() => rfInstance?.fitView?.()} title="Ajustar Vista" style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#4a5bd4', color: '#fff', cursor: 'pointer' }}>Fit</button>
              <span style={{ color: '#cdd6f4', fontSize: 12 }}>Zoom</span>
              <input
                type="range" min={0.2} max={2.5} step={0.05}
                value={graphZoom}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  setGraphZoom(v);
                  if (rfInstance && typeof rfInstance.setViewport === 'function') {
                    rfInstance.setViewport({ x: 0, y: 0, zoom: v }, 0);
                  } else if (rfInstance && typeof rfInstance.zoomTo === 'function') {
                    try { rfInstance.zoomTo(v); } catch { }
                  }
                }}
                style={{ width: 120 }}
              />
            </div>
            {nodes.length > 0 && (
              <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10, width: '400px' }}>
                <input
                  type="text"
                  placeholder="🔍 Input de búsqueda (Enter para focalizar)..."
                  value={searchMods}
                  onChange={(e) => setSearchMods(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  style={{
                    width: '100%', padding: '12px 20px', borderRadius: '30px', border: '1px solid #cba6f7', background: 'rgba(24, 24, 37, 0.8)',
                    color: '#cdd6f4', outline: 'none', fontSize: '14px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)'
                  }}
                />
              </div>
            )}

            <ReactFlow nodes={displayNodes} edges={edges} onNodesChange={onNodesChange} onInit={setRfInstance} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={2.5}
              onNodeContextMenu={onNodeContextMenu} onPaneClick={onPaneClick} onNodeClick={onNodeClick}
              onNodesDelete={handleNodesDelete} onNodeDoubleClick={onNodeDoubleClick}>
              <Background color="#313244" variant="dots" gap={25} size={1} />
              <Controls />
              <MiniMap nodeColor="#cba6f7" maskColor="rgba(30, 30, 46, 0.7)" style={{ background: '#11111b' }} />
            </ReactFlow>
          </div>
        )}

        {/* --- PESTAÑA 2: ARCHIVOS GLOBALES --- */}
        {activeTab === 'global' && (
          <div className="animate-tab" style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>
            <h2>Configuraciones Globales</h2>
            <p style={{ color: '#a6adc8', marginBottom: '20px' }}>Estructura del directorio detectado en {packInfo?.name}</p>

            {rootFiles.length > 0 && (
              <input
                type="text" placeholder="🔍 Parámetro de búsqueda (Extensión o Función)..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                style={{ width: '100%', padding: '12px 15px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #313244', background: '#181825', color: '#cdd6f4', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }}
              />
            )}

            <div style={{ background: '#181825', padding: '20px', borderRadius: '12px', border: '1px solid #313244' }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {rootFiles.length > 0 ? (
                  filteredFiles.length > 0 ? (
                    filteredFiles.map((file, i) => (
                      <li key={i} style={{ marginBottom: '12px', padding: '12px', background: '#11111b', borderRadius: '8px', border: '1px solid #313244', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <b style={{ color: '#cba6f7' }}>{file.includes('.') ? '📄' : '📁'} {file}</b>
                          </div>
                          <p style={{ margin: 0, color: '#a6adc8', fontSize: '13px', fontStyle: 'italic' }}>{analyzeFilePurpose(file)}</p>
                        </div>
                        <button onClick={() => handleOpenGlobalFile(file)} style={{ background: '#89b4fa', color: '#11111b', border: 'none', padding: '8px 15px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'transform 0.1s', flexShrink: 0 }}>✏️ Abrir</button>
                      </li>
                    ))
                  ) : (<li style={{ color: '#f38ba8', textAlign: 'center', padding: '20px' }}>Cero coincidencias de búsqueda.</li>)
                ) : (<li style={{ color: '#f38ba8', textAlign: 'center', padding: '20px' }}>Directorio vacío.</li>)}
              </ul>
            </div>
          </div>
        )}

        {/* --- PESTAÑA 3: TIENDA ONLINE --- */}
        {activeTab === 'store' && (
          <div className="animate-tab" style={{ padding: '40px', paddingBottom: '100px', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
              <div>
                <h2 style={{ color: '#cba6f7', margin: 0 }}>Vitrina de Mods</h2>
                <p style={{ color: '#a6adc8', margin: '5px 0 0 0' }}>Descubre e instala mods para <b>{packInfo?.loader} {packInfo?.gameVersion}</b>.</p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#a6adc8', fontSize: '14px' }}>Ordenar por:</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={{ background: '#181825', color: '#cdd6f4', border: '1px solid #313244', padding: '8px', borderRadius: '6px', outline: 'none' }}>
                  <option value="downloads">🔥 Más Descargados</option>
                  <option value="relevance">⭐ Relevancia</option>
                  <option value="newest">✨ Más Recientes</option>
                  <option value="updated">🔄 Recién Actualizados</option>
                </select>
              </div>
            </div>

            <div style={{ background: '#181825', padding: '15px', borderRadius: '12px', border: '1px solid #313244', marginBottom: '30px' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <input
                  type="text" placeholder="🔍 Buscar por nombre (ej: Create, JEI)..." value={onlineSearchQuery} onChange={(e) => setOnlineSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchOnline()}
                  style={{ flex: 1, padding: '12px 14px', borderRadius: '10px', border: '1px solid #3a3a64', background: '#141522', color: '#e8eaff', outline: 'none', fontSize: '15px', transition: 'border 0.2s' }}
                />
                <button onClick={handleSearchOnline} disabled={isSearchingOnline} style={{ background: '#cba6f7', color: '#11111b', border: 'none', padding: '0 25px', borderRadius: '8px', fontWeight: 'bold', cursor: isSearchingOnline ? 'wait' : 'pointer' }}>
                  {isSearchingOnline ? '⏳...' : 'Buscar'}
                </button>
              </div>

              <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px' }}>
                {[
                  { id: '', label: '🌐 Todos' }, { id: 'optimization', label: '🚀 Optimización' }, { id: 'technology', label: '⚙️ Tecnología' },
                  { id: 'magic', label: '🔮 Magia' }, { id: 'adventure', label: '⚔️ Aventura' }, { id: 'worldgen', label: '🌍 Generación' },
                  { id: 'decoration', label: '🛋️ Decoración' }, { id: 'storage', label: '📦 Almacenamiento' },
                ].map(cat => (
                  <button
                    key={cat.id} onClick={() => setModCategory(cat.id)}
                    style={{ background: modCategory === cat.id ? '#89b4fa' : '#11111b', color: modCategory === cat.id ? '#11111b' : '#a6adc8', border: '1px solid', borderColor: modCategory === cat.id ? '#89b4fa' : '#313244', padding: '6px 12px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s' }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {onlineResults.slice(0, visibleOnlineCount).map((mod) => (
                <div key={mod.project_id} style={{ background: '#181825', border: '1px solid #313244', borderRadius: '12px', padding: '20px', display: 'flex', gap: '20px', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.3)', cursor: 'pointer' }} onClick={() => { setSelectedMod(mod); setShowDetails(true); }}>
                  <div style={{ width: '80px', height: '80px', background: '#11111b', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {mod.icon_url ? <img src={mod.icon_url} alt={mod.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: '30px' }}>🧩</span>}
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
                      <h3 style={{ margin: 0, color: '#cdd6f4', fontSize: '20px' }}>{mod.title}</h3>
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', background: mod.source === 'modrinth' ? '#a6e3a1' : '#f9e2af', color: '#11111b', fontWeight: 'bold' }}>
                        {mod.source ? mod.source.toUpperCase() : 'MODRINTH'}
                      </span>
                    </div>
                    <p style={{ margin: '0 0 10px 0', color: '#a6adc8', fontSize: '14px', lineHeight: '1.4' }}>{mod.description}</p>
                    <div style={{ display: 'flex', gap: '15px', fontSize: '12px', color: '#6c7086' }}>
                      <span>👤 {mod.author}</span>
                      <span>⬇️ {mod.downloads.toLocaleString()} descargas</span>
                    </div>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); handleSelectModVersions(mod.project_id, mod.title, mod.source); }}
                    disabled={downloadingMods[mod.project_id]}
                    style={{ background: downloadingMods[mod.project_id] ? '#f9e2af' : '#a6e3a1', color: '#11111b', border: 'none', padding: '12px 25px', borderRadius: '8px', fontWeight: 'bold', cursor: downloadingMods[mod.project_id] ? 'wait' : 'pointer', transition: 'all 0.2s', minWidth: '140px' }}>
                    {downloadingMods[mod.project_id] ? '⏳ Descargando...' : '📥 Instalar'}
                  </button>
                </div>
              ))}
            </div>

            {visibleOnlineCount < onlineResults.length && (
              <div style={{ textAlign: 'center', marginTop: 12 }}>
                <button onClick={() => setVisibleOnlineCount(v => Math.min(v + 20, onlineResults.length))} style={{ background: '#89b4fa', color: '#11111b', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>Cargar más resultados</button>
              </div>
            )}
          </div>
        )}

        {/* --- PESTAÑA 4: TWEAKS --- */}
        {activeTab === 'tweaks' && (
          <div className="animate-tab" style={{ display: 'flex', height: 'calc(100vh - 112px)', width: '100%' }}>
            <div style={{ width: '250px', background: '#181825', borderRight: '1px solid #313244', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h3 style={{ color: '#f5c2e7', margin: '0 0 15px 0' }}>Módulos de Inyección</h3>
              <button onClick={() => setActiveTweakTab('items')} style={{ background: activeTweakTab === 'items' ? '#313244' : 'transparent', color: activeTweakTab === 'items' ? '#cdd6f4' : '#6c7086', border: 'none', padding: '12px', textAlign: 'left', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', borderLeft: activeTweakTab === 'items' ? '4px solid #f5c2e7' : '4px solid transparent' }}>⚔️ Ajuste de Ítems</button>
              <button onClick={() => setActiveTweakTab('entities')} style={{ background: activeTweakTab === 'entities' ? '#313244' : 'transparent', color: activeTweakTab === 'entities' ? '#cdd6f4' : '#6c7086', border: 'none', padding: '12px', textAlign: 'left', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', borderLeft: activeTweakTab === 'entities' ? '4px solid #a6e3a1' : '4px solid transparent' }}>🧟‍♂️ Mutador Genético</button>
              <button onClick={() => setActiveTweakTab('spawn')} style={{ background: activeTweakTab === 'spawn' ? '#313244' : 'transparent', color: activeTweakTab === 'spawn' ? '#cdd6f4' : '#6c7086', border: 'none', padding: '12px', textAlign: 'left', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', borderLeft: activeTweakTab === 'spawn' ? '4px solid #8ef29a' : '4px solid transparent' }}>⚡ Control de Spawns</button>
              <button onClick={() => setActiveTweakTab('loot')} style={{ background: activeTweakTab === 'loot' ? '#313244' : 'transparent', color: activeTweakTab === 'loot' ? '#cdd6f4' : '#6c7086', border: 'none', padding: '12px', textAlign: 'left', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', borderLeft: activeTweakTab === 'loot' ? '4px solid #8bdc8a' : '4px solid transparent' }}>🎁 Editor de Loot</button>
              <button onClick={() => setActiveTweakTab('optimizer')} style={{ background: activeTweakTab === 'optimizer' ? '#313244' : 'transparent', color: activeTweakTab === 'optimizer' ? '#f38ba8' : '#6c7086', border: 'none', padding: '12px', textAlign: 'left', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', borderLeft: activeTweakTab === 'optimizer' ? '4px solid #f38ba8' : '4px solid transparent' }}>🔧 Optimizador</button>
            </div>

            <div style={{ flex: 1, padding: '40px', overflowY: 'auto' }}>
              {activeTweakTab === 'items' && (
                <div style={{ maxWidth: '600px' }}>
                  <h2 style={{ color: '#cdd6f4', marginTop: 0 }}>Modificador de Armas y Armaduras</h2>
                  <p style={{ color: '#a6adc8', marginBottom: '30px' }}>Inyecta código KubeJS para sobrescribir las estadísticas base de cualquier objeto en el juego.</p>
                  <p style={{ color: '#a6e3a1', fontSize: '13px', marginTop: '-20px', marginBottom: '20px' }}>✅ Base de datos activa: {availableIds.length} objetos detectados.</p>

                  <div style={{ background: '#181825', padding: '25px', borderRadius: '12px', border: '1px solid #313244', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>ID del Objeto (mod:item)</label>
                      <AutocompleteInput placeholder="Ej: minecraft:diamond_chestplate" value={itemTweakData.itemId} availableIds={availableIds} colorClass="#a6e3a1" onChange={(val) => setItemTweakData({ ...itemTweakData, itemId: val })} />
                    </div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Daño de Ataque</label>
                        <input type="number" step="0.5" placeholder="Ej: 12.5" value={itemTweakData.damage} onChange={e => setItemTweakData({ ...itemTweakData, damage: e.target.value })} style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #313244', background: '#11111b', color: '#f38ba8', outline: 'none' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Puntos de Armadura</label>
                        <input type="number" placeholder="Ej: 8" value={itemTweakData.armor} onChange={e => setItemTweakData({ ...itemTweakData, armor: e.target.value })} style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #313244', background: '#11111b', color: '#89b4fa', outline: 'none' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Dureza (Toughness)</label>
                        <input type="number" placeholder="Ej: 3" value={itemTweakData.toughness} onChange={e => setItemTweakData({ ...itemTweakData, toughness: e.target.value })} style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #313244', background: '#11111b', color: '#f9e2af', outline: 'none' }} />
                      </div>
                    </div>
                    <button onClick={async () => {
                      if (!itemTweakData.itemId.includes(':')) return showToast("Error", "El ID debe tener formato mod:item", "error");
                      const res = await window.electronAPI.injectItemTweak(itemTweakData, packInfo.path);
                      showToast("Inyección KubeJS", res.message, res.success ? "success" : "error");
                      if (res.success) setItemTweakData({ itemId: '', damage: '', armor: '', toughness: '' });
                    }} style={{ background: '#f5c2e7', color: '#11111b', border: 'none', padding: '15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>⚡ Inyectar Código de Balance</button>
                  </div>
                </div>
              )}

              {activeTweakTab === 'entities' && (
                <div style={{ maxWidth: '600px' }}>
                  <h2 style={{ color: '#cdd6f4', marginTop: 0 }}>Mutador Genético</h2>
                  <p style={{ color: '#a6adc8', marginBottom: '30px' }}>Altera la genética de cualquier monstruo o jefe. Los cambios se aplicarán globalmente en tu mundo.</p>
                  <p style={{ color: '#a6e3a1', fontSize: '13px', marginTop: '-20px', marginBottom: '20px' }}>✅ Base de datos activa: {availableIds.length} objetos detectados.</p>
                  <div style={{ background: '#181825', padding: '25px', borderRadius: '12px', border: '1px solid #313244', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>ID de la Entidad (mod:mob)</label>
                      <AutocompleteInput placeholder="Ej: minecraft:zombie o borninchaos:bone_imp" value={entityTweakData.entityId} availableIds={availableIds} colorClass="#a6e3a1" onChange={(val) => setEntityTweakData({ ...entityTweakData, entityId: val })} />
                    </div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Vida Máxima (HP)</label>
                        <input type="number" placeholder="Ej: 100" value={entityTweakData.health} onChange={e => setEntityTweakData({ ...entityTweakData, health: e.target.value })} style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #313244', background: '#11111b', color: '#a6e3a1', outline: 'none' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Daño de Ataque</label>
                        <input type="number" placeholder="Ej: 15" value={entityTweakData.damage} onChange={e => setEntityTweakData({ ...entityTweakData, damage: e.target.value })} style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #313244', background: '#11111b', color: '#f38ba8', outline: 'none' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Velocidad (Base 0.2)</label>
                        <input type="number" step="0.05" placeholder="Ej: 0.35" value={entityTweakData.speed} onChange={e => setEntityTweakData({ ...entityTweakData, speed: e.target.value })} style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #313244', background: '#11111b', color: '#89dceb', outline: 'none' }} />
                      </div>
                    </div>
                    <button onClick={async () => {
                      if (!entityTweakData.entityId.includes(':')) return showToast("Error", "El ID debe tener formato mod:entidad", "error");
                      const res = await window.electronAPI.injectEntityTweak(entityTweakData, packInfo.path);
                      showToast("Mutación Genética", res.message, res.success ? "success" : "error");
                      if (res.success) setEntityTweakData({ entityId: '', health: '', damage: '', speed: '' });
                    }} style={{ background: '#a6e3a1', color: '#11111b', border: 'none', padding: '15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>🧬 Inyectar Mutación Genética</button>
                  </div>
                </div>
              )}

              {activeTweakTab === 'spawn' && (
                <div style={{ maxWidth: '600px' }}>
                  <h2 style={{ color: '#cdd6f4', marginTop: 0 }}>Control de Spawns</h2>
                  <p style={{ color: '#a6adc8', marginBottom: '30px' }}>Inyecta reglas para alterar las estadísticas de los mobs justo cuando aparecen en el mundo.</p>
                  <p style={{ color: '#a6e3a1', fontSize: '13px', marginTop: '-20px', marginBottom: '20px' }}>✅ Base de datos activa: {availableIds.length} objetos detectados.</p>
                  <div style={{ background: '#181825', padding: '25px', borderRadius: '12px', border: '1px solid #313244', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Entidad (mod:mob)</label>
                        <AutocompleteInput placeholder="Ej: minecraft:zombie" value={spawnCenter.entityId} availableIds={availableIds} colorClass="#cdd6f4" onChange={(val) => setSpawnCenter({ ...spawnCenter, entityId: val })} />
                      </div>
                      <div>
                        <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Vida Máxima (HP)</label>
                        <input placeholder="Ej: 20" type="number" value={spawnCenter.health} onChange={e => setSpawnCenter({ ...spawnCenter, health: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Daño de Ataque</label>
                        <input placeholder="Ej: 5" type="number" value={spawnCenter.damage} onChange={e => setSpawnCenter({ ...spawnCenter, damage: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#f38ba8', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Velocidad (Base 0.2)</label>
                        <input placeholder="Ej: 0.2" type="number" step="0.01" value={spawnCenter.speed} onChange={e => setSpawnCenter({ ...spawnCenter, speed: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#89dceb', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <button style={{ marginTop: '6px', padding: '14px', borderRadius: 8, border: 'none', background: '#8ef29a', fontWeight: 'bold', cursor: 'pointer' }} onClick={async () => {
                      const packPath = packInfo?.path || localStorage.getItem('lastModpackPath');
                      const res = await window.electronAPI.injectSpawnControl(spawnCenter, packPath);
                      showToast("Regla de Spawn", res?.message || 'Acción ejecutada', "success");
                    }}>⚡ Inyectar Mutación de Spawn</button>
                  </div>
                </div>
              )}

              {activeTweakTab === 'loot' && (
                <div style={{ maxWidth: '600px' }}>
                  <h2 style={{ color: '#cdd6f4', marginTop: 0 }}>Editor de Loot</h2>
                  <p style={{ color: '#a6adc8', marginBottom: '30px' }}>Aplica parches JSON para modificar las tablas de botín de tu modpack.</p>
                  <p style={{ color: '#a6e3a1', fontSize: '13px', marginTop: '-20px', marginBottom: '20px' }}>✅ Base de datos activa: {availableIds.length} objetos detectados.</p>
                  <div style={{ background: '#181825', padding: '25px', borderRadius: '12px', border: '1px solid #313244', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Ruta relativa (ej: data/minecraft/loot_tables/entities/zombie.json)</label>
                      <input placeholder="Ruta del loot..." value={lootCenter.lootPath} onChange={e => setLootCenter({ ...lootCenter, lootPath: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Parche en formato JSON</label>
                      <textarea placeholder='{"pools": [{"rolls": 1, "entries": [{"type": "item", "name": "diamond"}]}]}' rows={8} value={lootCenter.patch} onChange={e => setLootCenter({ ...lootCenter, patch: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                    </div>
                    <button style={{ marginTop: '6px', padding: '14px', borderRadius: 8, border: 'none', background: '#8bdc8a', fontWeight: 'bold', cursor: 'pointer' }} onClick={async () => {
                      try {
                        const packPath = packInfo?.path || localStorage.getItem('lastModpackPath');
                        const patchObj = JSON.parse(lootCenter.patch || '{}');
                        const res = await window.electronAPI.lootEditorApply(packPath, lootCenter.lootPath, patchObj);
                        showToast("Editor de Loot", res?.message || 'Loot aplicado con éxito', "success");
                      } catch (err) {
                        showToast("Error de Formato", 'JSON patch inválido. Revisa la sintaxis.', "error");
                      }
                    }}>⚡ Aplicar Loot Patch</button>
                  </div>
                </div>
              )}

              {activeTweakTab === 'optimizer' && (
                <div style={{ maxWidth: '700px' }}>
                  <h2 style={{ color: '#f38ba8', marginTop: 0 }}>🔧 Optimizador Inteligente</h2>
                  <p style={{ color: '#a6adc8', marginBottom: '30px' }}>Analiza y optimiza los archivos de configuración de tu modpack para mejorar el rendimiento general.</p>

                  {optimizerStep === 'idle' && (
                    <div style={{ background: '#181825', padding: '40px', borderRadius: '12px', border: '1px solid #313244', textAlign: 'center' }}>
                      <div style={{ fontSize: '48px', marginBottom: '20px' }}>🚀</div>
                      <h3 style={{ color: '#cdd6f4', margin: '0 0 10px 0' }}>¿Deseas optimizar el modpack actual?</h3>
                      <p style={{ color: '#6c7086', marginBottom: '30px' }}>Se ajustarán configuraciones clave para reducir el consumo de VRAM y CPU, sin perder funcionalidad esencial.</p>
                      <button onClick={async () => {
                        setOptimizerStep('running');
                        setOptimizerMessage('Analizando y optimizando archivos...');
                        const packPath = packInfo?.path || localStorage.getItem('lastModpackPath');
                        const res = await window.electronAPI.optimizationStart(packPath);
                        if (res.success) {
                          setOptimizerResults(res.results);
                          setOptimizerMessage(res.message);
                          setOptimizerStep('done');
                          setHasBackup(res.results.length > 0);
                          showToast("Optimización", res.message, "success");
                        } else {
                          setOptimizerMessage(res.message);
                          setOptimizerStep('idle');
                          showToast("Error de Optimización", res.message, "error");
                        }
                      }} style={{
                        background: '#f38ba8', color: '#11111b', border: 'none',
                        padding: '16px 40px', borderRadius: '10px', fontWeight: 'bold',
                        fontSize: '16px', cursor: 'pointer', boxShadow: '0 0 20px rgba(243, 139, 168, 0.4)'
                      }}>
                        ⚡ Optimizar Ecosistema
                      </button>
                    </div>
                  )}

                  {optimizerStep === 'running' && (
                    <div style={{ background: '#181825', padding: '40px', borderRadius: '12px', border: '1px solid #313244', textAlign: 'center' }}>
                      <div style={{ fontSize: '40px', marginBottom: '20px', animation: 'spin 1s linear infinite' }}>⏳</div>
                      <h3 style={{ color: '#cdd6f4', margin: '0 0 10px 0' }}>Optimizando...</h3>
                      <p style={{ color: '#6c7086' }}>{optimizerMessage}</p>
                    </div>
                  )}

                  {optimizerStep === 'done' && (
                    <div>
                      {hasBackup ? (
                        <div>
                          <div style={{ background: '#181825', padding: '30px', borderRadius: '12px', border: '1px solid #a6e3a1', marginBottom: '20px' }}>
                            <div style={{ fontSize: '36px', marginBottom: '15px' }}>✅</div>
                            <h3 style={{ color: '#a6e3a1', margin: '0 0 15px 0' }}>Optimización Completada</h3>
                            <p style={{ color: '#a6adc8' }}>{optimizerMessage}</p>
                          </div>

                          <div style={{ background: '#181825', padding: '20px', borderRadius: '12px', border: '1px solid #313244', marginBottom: '20px' }}>
                            <h4 style={{ color: '#cdd6f4', margin: '0 0 15px 0' }}>Archivos Modificados</h4>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                              {optimizerResults.map((r, i) => (
                                <div key={i} style={{
                                  padding: '12px 16px', borderRadius: '8px',
                                  background: '#11111b', borderLeft: '4px solid #a6e3a1',
                                  display: 'flex', alignItems: 'center', gap: '12px'
                                }}>
                                  <span style={{ color: '#a6e3a1', fontSize: '18px' }}>✓</span>
                                  <span style={{ color: '#cdd6f4', fontFamily: 'monospace', fontSize: '13px' }}>{r.file}</span>
                                  <span style={{ color: '#a6adc8', fontSize: '12px', marginLeft: 'auto' }}>Ajustes de rendimiento aplicados</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <button onClick={async () => {
                            const packPath = packInfo?.path || localStorage.getItem('lastModpackPath');
                            const res = await window.electronAPI.optimizationRollback(packPath);
                            if (res.success) {
                              setOptimizerStep('idle');
                              setOptimizerResults([]);
                              setHasBackup(false);
                              showToast("Rollback", res.message, "success");
                            } else {
                              showToast("Error", res.message, "error");
                            }
                          }} style={{
                            background: '#f9e2af', color: '#11111b', border: 'none',
                            padding: '14px 30px', borderRadius: '8px', fontWeight: 'bold',
                            fontSize: '15px', cursor: 'pointer', width: '100%',
                            boxShadow: '0 0 15px rgba(249, 226, 175, 0.4)'
                          }}>
                            ↩️ Deshacer Cambios / Restaurar a la Normalidad
                          </button>
                        </div>
                      ) : (
                        <div style={{ background: '#181825', padding: '30px', borderRadius: '12px', border: '1px solid #f9e2af', textAlign: 'center' }}>
                          <h3 style={{ color: '#f9e2af', margin: '0 0 10px 0' }}>No se encontraron archivos optimizables</h3>
                          <p style={{ color: '#6c7086' }}>Tu modpack ya parece estar en una configuración eficiente.</p>
                          <button onClick={() => { setOptimizerStep('idle'); setOptimizerResults([]); }} style={{
                            background: '#313244', color: '#cdd6f4', border: 'none',
                            padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', marginTop: '15px'
                          }}>Volver</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- PESTAÑA 5: DASHBOARD DE RENDIMIENTO (NUEVA FASE 1 Y 2) --- */}
        {activeTab === 'performance' && (
          <div className="animate-tab" style={{ padding: '40px', maxWidth: '900px', margin: '0 auto', paddingBottom: '100px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
              <div>
                <h2 style={{ color: '#fab387', margin: 0, fontSize: '28px' }}>Monitor de Rendimiento</h2>
                <p style={{ color: '#a6adc8', marginTop: '5px' }}>Análisis heurístico de carga para <b>{packInfo?.name || 'tu modpack'}</b>.</p>
              </div>
            </div>

            {/* PANEL DE HARDWARE LOCAL */}
            <div style={{ background: '#181825', borderRadius: '12px', border: '1px solid #313244', padding: '20px', marginBottom: '30px', display: 'flex', gap: '20px' }}>
              <div style={{ flex: 1, background: '#11111b', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #89b4fa' }}>
                <div style={{ color: '#a6adc8', fontSize: '12px', fontWeight: 'bold' }}>PROCESADOR (CPU)</div>
                <div style={{ color: '#cdd6f4', fontSize: '16px', marginTop: '5px' }}>
                  {hardwareSpecs?.cpu ? `${hardwareSpecs.cpu.manufacturer} ${hardwareSpecs.cpu.brand}` : 'Escaneando...'}
                </div>
                <div style={{ color: '#6c7086', fontSize: '12px' }}>{hardwareSpecs?.cpu?.logicalCores} Hilos Lógicos</div>
              </div>

              <div style={{ flex: 1, background: '#11111b', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #a6e3a1' }}>
                <div style={{ color: '#a6adc8', fontSize: '12px', fontWeight: 'bold' }}>MEMORIA (RAM)</div>
                <div style={{ color: '#cdd6f4', fontSize: '20px', marginTop: '5px' }}>
                  {hardwareSpecs?.ram ? `${hardwareSpecs.ram.totalGB} GB Total` : 'Escaneando...'}
                </div>
                <div style={{ color: '#6c7086', fontSize: '12px' }}>{hardwareSpecs?.ram ? `${hardwareSpecs.ram.availableGB} GB Libres` : ''}</div>
              </div>

              <div style={{ flex: 1, background: '#11111b', padding: '15px', borderRadius: '8px', borderLeft: '4px solid #f38ba8' }}>
                <div style={{ color: '#a6adc8', fontSize: '12px', fontWeight: 'bold' }}>GRÁFICOS (GPU)</div>
                <div style={{ color: '#cdd6f4', fontSize: '16px', marginTop: '5px' }}>
                  {hardwareSpecs?.gpu ? `${hardwareSpecs.gpu.vendor} ${hardwareSpecs.gpu.model}` : 'Buscando Dedicada...'}
                </div>
                <div style={{ color: '#6c7086', fontSize: '12px' }}>{hardwareSpecs?.gpu ? `${hardwareSpecs.gpu.vramGB} GB VRAM` : ''}</div>
              </div>
            </div>

            <h3 style={{ color: '#cdd6f4', marginBottom: '15px' }}>Top Mods por Consumo de Recursos</h3>

            {/* CABECERA CON EL NUEVO BOTÓN */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ color: '#cdd6f4', margin: 0 }}>Lista de Módulos Instalados ({modsOrdenados.length})</h3>
              <button
                onClick={handleCalculateImpact}
                disabled={isCalculatingImpact || modsOrdenados.length === 0}
                style={{ background: isCalculatingImpact ? '#f9e2af' : '#fab387', color: '#11111b', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: isCalculatingImpact ? 'wait' : 'pointer' }}
              >
                {isCalculatingImpact ? '⏳ Analizando Archivos...' : '🧮 Calcular Peso Heurístico'}
              </button>
            </div>
            
            {/* LISTA DE MODS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {modsOrdenados.map((mod, i) => {
                  
                  const hasImpact = mod.impact !== null;
                  const isOpt = hasImpact && mod.impact < 0;
                  const color = !hasImpact ? '#313244' : (isOpt ? '#a6e3a1' : (mod.impact > 60 ? '#f38ba8' : (mod.impact > 30 ? '#f9e2af' : '#89dceb')));
                  const barWidth = !hasImpact ? 0 : (isOpt ? 100 : Math.min(mod.impact, 100));

                  return (
                    <div key={i} style={{ background: '#181825', padding: '15px 20px', borderRadius: '10px', border: '1px solid #313244', display: 'flex', alignItems: 'center', gap: '20px' }}>
                      <div style={{ width: '250px', flexShrink: 0 }}>
                        <div style={{ color: '#cdd6f4', fontWeight: 'bold', fontSize: '15px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mod.label}</div>
                        <div style={{ color: '#6c7086', fontSize: '12px' }}>{!hasImpact ? 'Pendiente de cálculo' : (isOpt ? 'Módulo de Optimización' : 'Módulo de Contenido')}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '5px', fontSize: '12px' }}>
                          <span style={{ color: '#a6adc8' }}>Impacto Proyectado</span>
                          <span style={{ color, fontWeight: 'bold' }}>{!hasImpact ? '-- pts' : (isOpt ? 'REDUCE CARGA' : `${mod.impact} pts`)}</span>
                        </div>
                        <div style={{ width: '100%', height: '8px', background: '#11111b', borderRadius: '4px', overflow: 'hidden' }}>
                          <div style={{ width: `${barWidth}%`, height: '100%', background: isOpt ? 'linear-gradient(90deg, #11111b, #a6e3a1)' : color, borderRadius: '4px', transition: 'width 0.5s ease-out' }} />
                        </div>
                      </div>
                    </div>
                  );
              })}
              {modsOrdenados.length === 0 && (
                <div style={{ textAlign: 'center', color: '#6c7086', padding: '40px' }}>
                  No hay mods cargados en el ecosistema.
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- PESTAÑA 6: EDITOR IDE (NUEVA) --- */}
        {activeTab === 'ide' && (
          <div className="animate-tab" style={{ width: '100%', height: 'calc(100vh - 112px)' }}>
            <ScriptEditor packPath={packInfo?.path} />
          </div>
        )}

      </div>

      {/* --- SISTEMA DE NOTIFICACIONES TOAST --- */}
      {toast && toast.show && (
        <div className="toast-enter" style={{
          position: 'fixed', bottom: '30px', right: '30px', zIndex: 9999,
          background: toast.type === 'success' ? 'linear-gradient(135deg, #a6e3a1 0%, #40a02b 100%)' :
            toast.type === 'loading' ? 'linear-gradient(135deg, #89b4fa 0%, #1e66f5 100%)' :
              'linear-gradient(135deg, #f38ba8 0%, #d20f39 100%)',
          color: '#11111b', padding: '18px 24px', borderRadius: '14px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: '15px'
        }}>
          <span style={{ fontSize: '28px', filter: 'drop-shadow(0px 2px 4px rgba(0,0,0,0.3))' }}>
            {toast.type === 'success' ? '✅' : toast.type === 'loading' ? '⏳' : '❌'}
          </span>
          <div>
            <div style={{ fontSize: '16px', fontWeight: '900', letterSpacing: '0.5px' }}>{toast.title}</div>
            <div style={{ fontSize: '13px', fontWeight: '600', opacity: 0.9, marginTop: '2px' }}>{toast.message}</div>
          </div>
        </div>
      )}

    </div>
  );
}