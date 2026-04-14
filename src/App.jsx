import { useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, { Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import 'reactflow/dist/style.css';
import ModNode from './components/nodes/ModNode';
import GroupNode from './components/nodes/GroupNode'; 
import ConfigEditor from './components/ConfigEditor'; 
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const nodeTypes = { mod: ModNode, group: GroupNode };
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
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [packInfo, setPackInfo] = useState(null);

  const onNodesChange = useCallback((chs) => setNodes((nds) => applyNodeChanges(chs, nds)), []);
  const onEdgesChange = useCallback((chs) => setEdges((eds) => applyEdgeChanges(chs, eds)), []);

  const [rootFiles, setRootFiles] = useState([]);
  const [activeTab, setActiveTab] = useState('mods');
  const [versionSelectorModal, setVersionSelectorModal] = useState(null); 

  // Estado para el modal de Nuevo Proyecto
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectData, setNewProjectData] = useState({ name: '', mcVersion: '1.20.1', loader: 'Forge' });

  // --- ESTADOS DE LOS BUSCADORES ---
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMods, setSearchMods] = useState('');
  const [rfInstance, setRfInstance] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);

  // --- ESTADOS DE LA TIENDA (MODRINTH) ---
  const [onlineSearchQuery, setOnlineSearchQuery] = useState('');
  const [onlineResults, setOnlineResults] = useState([]);
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);
  const [downloadingMods, setDownloadingMods] = useState({});

  const [sortBy, setSortBy] = useState('downloads'); // downloads, relevance, newest
  const [modCategory, setModCategory] = useState(''); // technology, magic, optimization, etc.

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

  const [diagnosticReport, setDiagnosticReport] = useState(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  const [isBotOpen, setIsBotOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'bot', text: 'SISTEMA INICIADO: Modpack Assist. Contexto cargado. A la espera de instrucciones.' }
  ]);

  const [editingConfig, setEditingConfig] = useState(null);


  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault(); 
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const onPaneClick = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleAskBotAboutMod = () => {
    if (!contextMenu?.node) return;
    const modName = contextMenu.node.data.label;
    const query = `¿Para qué sirve el mod '${modName}' y qué configuraciones críticas debería revisar?`;

    setContextMenu(null);
    setIsBotOpen(true);
    setChatInput(query);
  };

  // 1. EXTRAEMOS LA LÓGICA A UNA FUNCIÓN REUTILIZABLE
  const processScanResult = (result) => {
    if (!result) return;

    const { mods, info, rootFiles: filesFromRoot } = result;
    setPackInfo(info);
    setRootFiles(filesFromRoot || []);

    // ✨ LA MAGIA DE LA MEMORIA: Guardamos la ruta del modpack al cargar
    if (info && info.path) {
      localStorage.setItem('lastModpackPath', info.path);
    }

    const newNodes = [];
    const newEdges = [];

    // --- LÓGICA DE AGRUPAMIENTO AUTOMÁTICO (POR CANTIDAD DE CONFIGS) ---
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
          style: { zIndex: 1 } 
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
            style: { stroke: '#94e2d5', strokeWidth: 2, zIndex: 1 },
          });
        });
      });

      posX += groupWidth + 100;
    });

    setNodes(newNodes);
    setEdges(newEdges);
  };

  // 2. EL BOTÓN MANUAL (Ahora es súper corto porque delega el trabajo)
  const handleScanFolder = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.scanMods();
      processScanResult(result);
    }
  };

  const handleOpenProjectWizard = () => setIsCreatingProject(true);

  // Ejecuta la creación real
  const handleConfirmCreateProject = async () => {
    if (!newProjectData.name.trim()) return alert("Dale un nombre a tu modpack.");
    
    if (window.electronAPI) {
      const result = await window.electronAPI.createProject(newProjectData);
      if (result) {
        processScanResult(result);
        setIsCreatingProject(false); // Cierra el modal
        alert(`¡Entorno creado! Carpeta configurada para ${newProjectData.loader} ${newProjectData.mcVersion}`);
      } else {
        alert("Se canceló la selección de carpeta.");
      }
    }
  };

  // ACTUALIZA LA BÚSQUEDA ONLINE PARA ENVIAR EL LOADER
  useEffect(() => {
    if (activeTab === 'store' && packInfo) {
      handleSearchOnline();
    }
  }, [activeTab, sortBy, modCategory]);

  // 2. Buscador Actualizado (¡Sin el candado de texto vacío!)
  const handleSearchOnline = async () => {
    if (!window.electronAPI || !packInfo) return; 
    
    setIsSearchingOnline(true);
    setCurrentPage(1); // <--- NUEVO: Volvemos a la página 1 en cada búsqueda nueva

    const result = await window.electronAPI.searchModsOnline(
      onlineSearchQuery, packInfo.loader, sortBy, modCategory
    );
    
    if (result && result.success) setOnlineResults(result.results);
    setIsSearchingOnline(false);
  };

  // ACTUALIZA LA BÚSQUEDA DE VERSIONES PARA ENVIAR EL LOADER
  const handleSelectModVersions = async (projectId, modTitle) => {
    if (!window.electronAPI || !packInfo) return;
    setDownloadingMods(prev => ({ ...prev, [projectId]: true }));

    const result = await window.electronAPI.getModVersions(projectId, packInfo.gameVersion, packInfo.loader);
    
    if (result && result.success && result.versions.length > 0) {
      setVersionSelectorModal({ title: modTitle, projectId: projectId, versions: result.versions });
    } else {
      alert(`No hay versiones de ${modTitle} para ${packInfo.loader} ${packInfo.gameVersion}.`);
    }
    setDownloadingMods(prev => ({ ...prev, [projectId]: false }));
  };

  // Descarga la versión seleccionada
  const handleConfirmDownload = async (version) => {
    if (!window.electronAPI || !packInfo || !versionSelectorModal) return;
    
    const modTitle = versionSelectorModal.title;
    setVersionSelectorModal(null); // Cierra el modal

    let downloadDeps = false;
    
    // 1. Si hay dependencias, le preguntamos al usuario si quiere instalarlas
    if (version.dependencies && version.dependencies.length > 0) {
      downloadDeps = window.confirm(`⚠️ El mod "${modTitle}" necesita ${version.dependencies.length} dependencia(s) obligatoria(s) para funcionar.\n\n¿Deseas que Modpack Assist las descargue e instale automáticamente por ti?`);
    }

    try {
      // 2. Descargamos el mod principal
      const mainResult = await window.electronAPI.downloadMod(version.id, packInfo.path);
      if (!mainResult || !mainResult.success) throw new Error(mainResult?.message || "Fallo en la descarga principal.");

      // 3. Descargamos las dependencias si el usuario aceptó
      if (downloadDeps) {
        for (const dep of version.dependencies) {
          let depVersionId = dep.version_id;

          // Magia: Si Modrinth no nos da una versión exacta, usamos tu buscador
          // interno para hallar la versión de la dependencia más reciente que sea compatible 
          // con el loader y la versión de tu modpack
          if (!depVersionId && dep.project_id) {
            const res = await window.electronAPI.getModVersions(dep.project_id, packInfo.gameVersion, packInfo.loader);
            if (res && res.success && res.versions.length > 0) {
              depVersionId = res.versions[0].id;
            }
          }

          // Si logramos resolver la versión, la descargamos silenciosamente
          if (depVersionId) {
            await window.electronAPI.downloadMod(depVersionId, packInfo.path);
          }
        }
      }

      // 4. Refrescamos el ecosistema visual
      const scanResult = await window.electronAPI.scanMods(packInfo.path);
      if (scanResult) processScanResult(scanResult);
      
      alert(`✅ ¡${modTitle} ${downloadDeps ? 'y sus dependencias se instalaron' : 'se instaló'} correctamente! Revisa el lienzo.`);

    } catch (err) {
      alert(`❌ Error al instalar: ${err.message}`);
    }
  };

  // 3. AUTO-CARGADOR AL INICIAR LA APP
  useEffect(() => {
    const autoLoadLastPack = async () => {
      const lastPath = localStorage.getItem('lastModpackPath');
      // Si existe una ruta guardada de la sesión anterior, la cargamos silenciosamente
      if (lastPath && window.electronAPI) {
        try {
          const result = await window.electronAPI.scanMods(lastPath);
          if (result) processScanResult(result);
        } catch (e) {
          console.warn("No se pudo auto-cargar la carpeta anterior.", e);
          localStorage.removeItem('lastModpackPath'); // Limpiamos la memoria si la carpeta ya no existe
        }
      }
    };
    
    autoLoadLastPack();
  }, []);

  // ==========================================
  // EL MOTOR DEL AGENTE AUTÓNOMO (LOOP OPTIMIZADO)
  // ==========================================
  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setChatInput('');

    const newHistory = [...messages, { role: 'user', text: userText }];
    setMessages([...newHistory, { role: 'bot', text: 'Procesando consulta...' }]);

    // Contexto restringido para evitar context bloat en OpenRouter
    const contextData = {
      packName: packInfo?.name || 'Desconocido',
      mcVersion: packInfo?.gameVersion || 'Desconocida',
      packPath: packInfo?.path 
    };

    let currentHistoryForAI = newHistory.map(msg => ({
      role: msg.role === 'bot' ? 'assistant' : 'user',
      content: msg.text
    }));

    let isAgentWorking = true;
    let finalBotMessage = '';

    try {
      while (isAgentWorking) {
        if (!window.electronAPI) throw new Error("API de Electron inactiva");

        // Filtro de historial a corto plazo
        let payloadHistory = currentHistoryForAI.length > 4 
          ? [currentHistoryForAI[0], ...currentHistoryForAI.slice(-3)]
          : currentHistoryForAI;

        const botResponse = await window.electronAPI.askBot(contextData, payloadHistory);

        if (botResponse.startsWith('[ACCION:')) {
          const cleanAction = botResponse.replace(/^\[|\]$/g, ''); 
          const parts = cleanAction.split('|').map(p => p.trim());
          const actionType = parts[0]; 
          
          let toolResult = "";

          if (actionType === 'ACCION: LEER_ARCHIVO') setMessages([...newHistory, { role: 'bot', text: `Extrayendo datos de ${parts[1]}...` }]);
          else if (actionType === 'ACCION: BUSCAR_TEXTO') setMessages([...newHistory, { role: 'bot', text: `Ejecutando búsqueda: "${parts[1]}"...` }]);
          else setMessages([...newHistory, { role: 'bot', text: `Escribiendo modificaciones en I/O...` }]);

          switch (actionType) {
            case 'ACCION: LISTAR_ARCHIVOS':
              toolResult = `SISTEMA: Archivos detectados: ${parts[1]}`;
              break;
            case 'ACCION: LEER_ARCHIVO':
              toolResult = await window.electronAPI.readFile(parts[1], contextData.packPath);
              break;
            case 'ACCION: BUSCAR_TEXTO':
              toolResult = await window.electronAPI.searchConfigs(parts[1], contextData.packPath);
              break;
            case 'ACCION: EDITAR':
              const editRes = await window.electronAPI.editFile(parts[1], contextData.packPath, parts[2], parts[3]);
              toolResult = `SISTEMA: ${editRes.message}`;
              break;
            case 'ACCION: AGREGAR_AL_INICIO':
              const prepRes = await window.electronAPI.prependFile(parts[1], contextData.packPath, parts[2]);
              toolResult = `SISTEMA: ${prepRes.message}`;
              break;
            case 'ACCION: AGREGAR_AL_FINAL':
              const appRes = await window.electronAPI.appendFile(parts[1], contextData.packPath, parts[2]);
              toolResult = `SISTEMA: ${appRes.message}`;
              break;
            default:
              toolResult = "SISTEMA: Acción desconocida/inválida.";
          }

          currentHistoryForAI.push({ role: 'assistant', content: botResponse }); 
          currentHistoryForAI.push({ role: 'user', content: `[RESULTADO I/O]:\n${toolResult}\nDIRECTIVA: Evaluar resultado. Si el objetivo se cumple, reportar al usuario. Si se requiere más información, ejecutar siguiente herramienta.` });
          
        } else {
          isAgentWorking = false;
          finalBotMessage = botResponse;
        }
      }

      setMessages([...newHistory, { role: 'bot', text: finalBotMessage }]);

    } catch (err) {
      console.error("Error crítico de agente:", err);
      setMessages([...newHistory, { role: 'bot', text: 'Error I/O: Fallo en la comunicación con el modelo de lenguaje.' }]);
    }
  };

  const filteredFiles = useMemo(() => {
    return rootFiles.filter(file => {
      if (!searchTerm) return true;
      const lowerFile = file.toLowerCase();
      const lowerSearch = searchTerm.toLowerCase();
      const description = analyzeFilePurpose(file).toLowerCase();
      return lowerFile.includes(lowerSearch) || description.includes(lowerSearch);
    });
  }, [rootFiles, searchTerm]);

  // --- LÓGICA DE OPACIDAD PARA EL ECOSISTEMA DE MODS ---
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
    // Si el nodo es una configuración (su id empieza con cfg-)
    if (node.id.startsWith('cfg-') && window.electronAPI && packInfo) {
      // Limpiamos el título para sacar el nombre del archivo (quitamos el emoji)
      const fileName = node.data.label.replace('⚙️ ', '').trim();
      // Como sabemos que en React Flow estos configs vienen de la carpeta config:
      const relativePath = `config/${fileName}`; 

      const result = await window.electronAPI.readFullFile(relativePath, packInfo.path);
      if (result.success) {
        setEditingConfig({ name: fileName, path: relativePath, content: result.content });
      } else {
        alert("No se pudo leer el archivo de configuración.");
      }
    }
  };

  // FUNCIÓN PARA GUARDAR DESDE EL MODAL
  const handleSaveConfig = async (newContent) => {
    if (window.electronAPI && packInfo && editingConfig) {
      const result = await window.electronAPI.writeFile(editingConfig.path, packInfo.path, newContent);
      if (result.success) {
        setEditingConfig(null); // Cerramos el modal
        alert("¡Configuración guardada con éxito!");
      } else {
        alert("Error al guardar el archivo.");
      }
    }
  };

  // Función para exportar el modpack a un ZIP
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
    } else {
      alert(`Error en el diagnóstico: ${result?.message}`);
    }
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#11111b', color: '#cdd6f4', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      
      {/* --- MODAL: EDITOR DE CONFIGURACIONES --- */}
      {editingConfig && (
        <ConfigEditor 
          fileName={editingConfig.name}
          initialContent={editingConfig.content}
          onClose={() => setEditingConfig(null)}
          onSave={handleSaveConfig}
        />
      )}

      {/* --- MODAL: ASISTENTE DE NUEVO PROYECTO --- */}
      {isCreatingProject && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, background: 'rgba(17, 17, 27, 0.9)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ background: '#1e1e2e', border: '2px solid #a6e3a1', borderRadius: '12px', width: '450px', padding: '30px', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}>
            <h2 style={{ color: '#a6e3a1', marginTop: 0 }}>✨ Crear Entorno Virtual</h2>
            <p style={{ color: '#a6adc8', fontSize: '14px', marginBottom: '25px' }}>Configura los parámetros base de tu nuevo Modpack.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Nombre del Proyecto</label>
                <input type="text" value={newProjectData.name} onChange={e => setNewProjectData({...newProjectData, name: e.target.value})} placeholder="Ej: Mi Aventura RPG" style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', outline: 'none' }} />
              </div>
              
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Versión de Minecraft</label>
                  <input type="text" value={newProjectData.mcVersion} onChange={e => setNewProjectData({...newProjectData, mcVersion: e.target.value})} placeholder="Ej: 1.20.1, 1.12.2..." style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', outline: 'none' }} />
                </div>
                
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Mod Loader</label>
                  <select value={newProjectData.loader} onChange={e => setNewProjectData({...newProjectData, loader: e.target.value})} style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', outline: 'none', cursor: 'pointer' }}>
                    <option value="Forge">Forge</option>
                    <option value="Fabric">Fabric</option>
                    <option value="NeoForge">NeoForge</option>
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
          <div style={{
            background: '#1e1e2e', border: '2px solid #cba6f7', borderRadius: '12px',
            width: '500px', maxHeight: '70vh', display: 'flex', flexDirection: 'column',
            boxShadow: '0 10px 30px rgba(0,0,0,0.8)', overflow: 'hidden'
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
          <div style={{ background: '#1e1e2e', border: `2px solid ${diagnosticReport.errors.length > 0 ? '#f38ba8' : '#a6e3a1'}`, borderRadius: '12px', width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.8)', overflow: 'hidden' }}>
            
            {/* Cabecera */}
            <div style={{ padding: '20px', borderBottom: '1px solid #313244', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#181825' }}>
              <h2 style={{ margin: 0, color: diagnosticReport.errors.length > 0 ? '#f38ba8' : '#a6e3a1', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {diagnosticReport.errors.length > 0 ? '❌ Conflictos Detectados' : '✅ Pack Saludable'}
              </h2>
              <button onClick={() => setDiagnosticReport(null)} style={{ background: 'transparent', border: 'none', color: '#a6adc8', fontSize: '20px', cursor: 'pointer' }}>✖</button>
            </div>

            {/* Contenido scrolleable */}
            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              
              {/* Resumen */}
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

              {/* Lista de Errores Críticos */}
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

              {/* Lista de Advertencias */}
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
        <div style={{
          position: 'absolute', top: contextMenu.y, left: contextMenu.x, zIndex: 100,
          background: '#181825', border: '1px solid #cba6f7', borderRadius: '8px',
          boxShadow: '0 4px 15px rgba(0,0,0,0.8)', padding: '5px',
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

      {/* --- BARRA SUPERIOR PROFESIONAL --- */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '70px',
        background: '#181825', display: 'flex', alignItems: 'center',
        padding: '0 20px', zIndex: 10, borderBottom: '2px solid #313244',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button onClick={handleScanFolder} style={{
            background: '#cba6f7', color: '#11111b', border: 'none',
            padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer'
          }}>
            📂 Cargar Modpack
          </button>

          <button onClick={handleOpenProjectWizard} style={{
            background: '#a6e3a1', color: '#11111b', border: 'none',
            padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
            boxShadow: '0 0 10px rgba(166, 227, 161, 0.4)'
          }}>
            ✨ Nuevo Proyecto
          </button>

          {/* NUEVOS BOTONES: EXPORTAR Y SANDBOX (Aparecen solo cuando hay un modpack) */}
          {packInfo && (
            <>
              <button onClick={handleExportModpack} style={{
                background: '#f9e2af', color: '#11111b', border: 'none',
                padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer',
                boxShadow: '0 0 10px rgba(249, 226, 175, 0.4)'
              }}>
                📦 Exportar para Jugar
              </button>

              {/* BOTÓN DE DIAGNÓSTICO ESTÁTICO */}
              <button onClick={handleDiagnosePack} disabled={isDiagnosing} style={{
                background: isDiagnosing ? '#f9e2af' : '#89dceb', color: '#11111b', border: 'none',
                padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: isDiagnosing ? 'wait' : 'pointer',
                boxShadow: '0 0 10px rgba(137, 220, 235, 0.4)', transition: 'all 0.2s'
              }}>
                {isDiagnosing ? '⏳ Analizando...' : '🩺 Diagnosticar Pack'}
              </button>
            </>
          )}

          {/* INFORMACIÓN DEL MODPACK Y PESTAÑAS */}
          {packInfo && (
            <>
              <div style={{ display: 'flex', gap: '15px', borderLeft: '2px solid #45475a', paddingLeft: '20px' }}>
                <div><small style={{ color: '#89b4fa' }}>MODPACK</small><br /><b>{packInfo.name}</b></div>
                <div><small style={{ color: '#89b4fa' }}>VERSIÓN MC</small><br /><b>{packInfo.gameVersion}</b></div>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginLeft: '30px', background: '#11111b', padding: '5px', borderRadius: '8px' }}>
                <button
                  onClick={() => setActiveTab('mods')}
                  style={{ background: activeTab === 'mods' ? '#313244' : 'transparent', color: activeTab === 'mods' ? '#cba6f7' : '#a6adc8', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  🧩 Ecosistema de Mods
                </button>
                <button
                  onClick={() => setActiveTab('global')}
                  style={{ background: activeTab === 'global' ? '#313244' : 'transparent', color: activeTab === 'global' ? '#cba6f7' : '#a6adc8', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  ⚙️ Config. General
                </button>
                <button
                  onClick={() => setActiveTab('store')}
                  style={{ background: activeTab === 'store' ? '#313244' : 'transparent', color: activeTab === 'store' ? '#cba6f7' : '#a6adc8', border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' }}
                >
                  🛒 Tienda de Mods
                </button>
              </div>
            </>
          )}
        </div>

        {/* --- BOTÓN DEL ASISTENTE Y TÍTULO --- */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <button
            onClick={() => setIsBotOpen(!isBotOpen)}
            style={{
              background: isBotOpen ? '#f38ba8' : '#a6e3a1',
              color: '#11111b', border: 'none', padding: '8px 15px',
              borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold',
              transition: 'all 0.3s ease', boxShadow: '0 2px 10px rgba(0,0,0,0.2)'
            }}
          >
            {isBotOpen ? 'Cerrar Asistente' : '🤖 Asistente IA'}
          </button>
          <div style={{ textAlign: 'right' }}><b style={{ color: '#cba6f7' }}>Modpack Assist</b> v1.0</div>
        </div>
      </div>

      {/* --- PANEL LATERAL DEL CHAT (DRAWER) --- */}
      <div style={{
        position: 'absolute', top: '70px', right: isBotOpen ? '0' : '-400px',
        width: '400px', height: 'calc(100vh - 70px)', background: '#181825',
        borderLeft: '2px solid #313244', transition: 'right 0.3s ease-in-out',
        zIndex: 20, display: 'flex', flexDirection: 'column', boxShadow: '-5px 0 20px rgba(0,0,0,0.5)'
      }}>
        {/* Cabecera del Chat */}
        <div style={{ padding: '20px', borderBottom: '1px solid #313244', background: '#11111b', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ margin: 0, color: '#a6e3a1', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>🧠</span> Modpack AI
            </h3>
            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#a6adc8' }}>Potenciado por OpenRouter (Llama 3)</p>
          </div>
        </div>

        {/* Historial de Mensajes */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
              background: msg.role === 'user' ? '#cba6f7' : '#313244',
              color: msg.role === 'user' ? '#11111b' : '#cdd6f4',
              padding: '12px 15px', borderRadius: '12px', maxWidth: '85%',
              borderBottomRightRadius: msg.role === 'user' ? '4px' : '12px',
              borderBottomLeftRadius: msg.role === 'bot' ? '4px' : '12px',
              fontSize: '14px', lineHeight: '1.4', wordBreak: 'break-word'
            }}>
              
              {/* RENDERIZADO MARKDOWN */}
              {msg.role === 'bot' ? (
                <ReactMarkdown
                  components={{
                    code({node, inline, className, children, ...props}) {
                      const match = /language-(\w+)/.exec(className || '');
                      return !inline && match ? (
                        <SyntaxHighlighter
                          children={String(children).replace(/\n$/, '')}
                          style={vscDarkPlus}
                          language={match[1]}
                          PreTag="div"
                          customStyle={{ borderRadius: '6px', margin: '10px 0', fontSize: '12px' }}
                          {...props}
                        />
                      ) : (
                        <code style={{ background: '#181825', color: '#f38ba8', padding: '2px 5px', borderRadius: '4px', fontSize: '13px' }} {...props}>
                          {children}
                        </code>
                      )
                    }
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              ) : (
                msg.text
              )}

            </div>
          ))}
        </div>

        {/* Input de Texto */}
        <div style={{ padding: '20px', borderTop: '1px solid #313244', display: 'flex', gap: '10px', background: '#181825' }}>
          <input
            type="text"
            placeholder="Instrucciones para el Agente..."
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
            style={{
              flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #313244',
              background: '#11111b', color: '#cdd6f4', outline: 'none', fontSize: '14px'
            }}
          />
          <button
            onClick={handleSendMessage}
            style={{
              background: '#89b4fa', color: '#11111b', border: 'none',
              borderRadius: '8px', padding: '0 20px', cursor: 'pointer',
              fontWeight: 'bold', fontSize: '16px', transition: 'transform 0.1s'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            ➤
          </button>
        </div>
      </div>

      {/* --- CONTENIDO PRINCIPAL --- */}
      <div id="main-scroll-area" style={{ width: '100%', height: '100%', paddingTop: '70px', overflowY: 'auto', boxSizing: 'border-box' }}>
        
        {activeTab === 'mods' && (
          /* VISTA A: MAPA DE NODOS CON BUSCADOR FLOTANTE */
          <div style={{ position: 'relative', width: '100%', height: 'calc(100vh - 70px)' }}>
            {nodes.length > 0 && (
              <div style={{
                position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
                zIndex: 10, width: '400px'
              }}>
                <input
                  type="text"
                  placeholder="🔍 Input de búsqueda (Enter para focalizar)..."
                  value={searchMods}
                  onChange={(e) => setSearchMods(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  style={{
                    width: '100%', padding: '12px 20px', borderRadius: '30px',
                    border: '1px solid #cba6f7', background: 'rgba(24, 24, 37, 0.8)',
                    color: '#cdd6f4', outline: 'none', fontSize: '14px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)'
                  }}
                />
              </div>
            )}

            <ReactFlow nodes={displayNodes} edges={edges} onNodesChange={onNodesChange} onInit={setRfInstance} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} fitView
              onNodeContextMenu={onNodeContextMenu}
              onPaneClick={onPaneClick} onNodeClick={onNodeClick}>
              <Background color="#313244" variant="dots" gap={25} size={1} />
              <Controls />
              <MiniMap nodeColor="#cba6f7" maskColor="rgba(30, 30, 46, 0.7)" style={{ background: '#11111b' }} />
            </ReactFlow>
          </div>
        )}

        {activeTab === 'global' && (
          /* VISTA B: CONFIGURACIÓN GENERAL (DINÁMICA) */
          <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>
            <h2>Configuraciones Globales</h2>
            <p style={{ color: '#a6adc8', marginBottom: '20px' }}>Estructura del directorio detectado en {packInfo?.name}</p>

            {rootFiles.length > 0 && (
              <input
                type="text"
                placeholder="🔍 Parámetro de búsqueda (Extensión o Función)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%', padding: '12px 15px', marginBottom: '20px',
                  borderRadius: '8px', border: '1px solid #313244',
                  background: '#181825', color: '#cdd6f4', outline: 'none',
                  fontSize: '14px', boxSizing: 'border-box'
                }}
              />
            )}

            <div style={{ background: '#181825', padding: '20px', borderRadius: '12px', border: '1px solid #313244' }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {rootFiles.length > 0 ? (
                  filteredFiles.length > 0 ? (
                    filteredFiles.map((file, i) => (
                      <li key={i} style={{ marginBottom: '12px', padding: '12px', background: '#11111b', borderRadius: '8px', border: '1px solid #313244' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                          <b style={{ color: '#cba6f7' }}>{file.includes('.') ? '📄' : '📁'} {file}</b>
                          <span style={{ color: '#94e2d5', fontSize: '11px' }}>OK</span>
                        </div>
                        <p style={{ margin: 0, color: '#a6adc8', fontSize: '13px', fontStyle: 'italic' }}>
                          {analyzeFilePurpose(file)}
                        </p>
                      </li>
                    ))
                  ) : (
                    <li style={{ color: '#f38ba8', textAlign: 'center', padding: '20px' }}>
                      Cero coincidencias de búsqueda.
                    </li>
                  )
                ) : (
                  <li style={{ color: '#f38ba8', textAlign: 'center', padding: '20px' }}>
                    Directorio vacío.
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        {activeTab === 'store' && (
          <div style={{ padding: '40px', paddingBottom: '100px', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '20px' }}>
              <div>
                <h2 style={{ color: '#cba6f7', margin: 0 }}>Vitrina de Mods</h2>
                <p style={{ color: '#a6adc8', margin: '5px 0 0 0' }}>Descubre e instala mods para <b>{packInfo?.loader} {packInfo?.gameVersion}</b>.</p>
              </div>
              
              {/* SELECTOR DE ORDEN */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ color: '#a6adc8', fontSize: '14px' }}>Ordenar por:</span>
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value)}
                  style={{ background: '#181825', color: '#cdd6f4', border: '1px solid #313244', padding: '8px', borderRadius: '6px', outline: 'none' }}
                >
                  <option value="downloads">🔥 Más Descargados</option>
                  <option value="relevance">⭐ Relevancia</option>
                  <option value="newest">✨ Más Recientes</option>
                  <option value="updated">🔄 Recién Actualizados</option>
                </select>
              </div>
            </div>

            {/* BARRA DE BÚSQUEDA Y CATEGORÍAS */}
            <div style={{ background: '#181825', padding: '15px', borderRadius: '12px', border: '1px solid #313244', marginBottom: '30px' }}>
              <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                <input 
                  type="text" 
                  placeholder="🔍 Buscar por nombre (ej: Create, JEI)..." 
                  value={onlineSearchQuery}
                  onChange={(e) => setOnlineSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchOnline()}
                  style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', outline: 'none', fontSize: '15px' }}
                />
                <button 
                  onClick={handleSearchOnline} disabled={isSearchingOnline}
                  style={{ background: '#cba6f7', color: '#11111b', border: 'none', padding: '0 25px', borderRadius: '8px', fontWeight: 'bold', cursor: isSearchingOnline ? 'wait' : 'pointer' }}>
                  {isSearchingOnline ? '⏳...' : 'Buscar'}
                </button>
              </div>

              {/* PÍLDORAS DE CATEGORÍA */}
              <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px' }}>
                {[
                  { id: '', label: '🌐 Todos' },
                  { id: 'optimization', label: '🚀 Optimización' },
                  { id: 'technology', label: '⚙️ Tecnología' },
                  { id: 'magic', label: '🔮 Magia' },
                  { id: 'adventure', label: '⚔️ Aventura' },
                  { id: 'worldgen', label: '🌍 Generación' },
                  { id: 'decoration', label: '🛋️ Decoración' },
                  { id: 'storage', label: '📦 Almacenamiento' },
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setModCategory(cat.id)}
                    style={{
                      background: modCategory === cat.id ? '#89b4fa' : '#11111b',
                      color: modCategory === cat.id ? '#11111b' : '#a6adc8',
                      border: '1px solid', borderColor: modCategory === cat.id ? '#89b4fa' : '#313244',
                      padding: '6px 12px', borderRadius: '20px', fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s'
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Resultados Paginados */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              {onlineResults
                .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)
                .map((mod) => (
                <div key={mod.project_id} style={{ background: '#181825', border: '1px solid #313244', borderRadius: '12px', padding: '20px', display: 'flex', gap: '20px', alignItems: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.3)' }}>
                  
                  {/* Icono del mod */}
                  <div style={{ width: '80px', height: '80px', background: '#11111b', borderRadius: '10px', overflow: 'hidden', flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {mod.icon_url ? <img src={mod.icon_url} alt={mod.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{fontSize:'30px'}}>🧩</span>}
                  </div>
                  
                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 5px 0', color: '#cdd6f4', fontSize: '20px' }}>{mod.title}</h3>
                    <p style={{ margin: '0 0 10px 0', color: '#a6adc8', fontSize: '14px', lineHeight: '1.4' }}>{mod.description}</p>
                    <div style={{ display: 'flex', gap: '15px', fontSize: '12px', color: '#6c7086' }}>
                      <span>👤 {mod.author}</span>
                      <span>⬇️ {mod.downloads.toLocaleString()} descargas</span>
                    </div>
                  </div>

                  {/* Botón Instalar */}
                  <button 
                    onClick={() => handleSelectModVersions(mod.project_id, mod.title)}
                    disabled={downloadingMods[mod.project_id]}
                    style={{ background: downloadingMods[mod.project_id] ? '#f9e2af' : '#a6e3a1', color: '#11111b', border: 'none', padding: '12px 25px', borderRadius: '8px', fontWeight: 'bold', cursor: downloadingMods[mod.project_id] ? 'wait' : 'pointer', transition: 'all 0.2s', minWidth: '140px' }}>
                    {downloadingMods[mod.project_id] ? '⏳ Descargando...' : '📥 Instalar'}
                  </button>
                </div>
              ))}
            </div>

            {/* CONTROLES DE PAGINACIÓN VISUALES */}
            {onlineResults.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '20px', marginTop: '30px', paddingTop: '20px', borderTop: '1px solid #313244' }}>
                <button 
                  onClick={() => {
                    setCurrentPage(p => Math.max(1, p - 1));
                    document.getElementById('main-scroll-area').scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  disabled={currentPage === 1}
                  style={{ background: currentPage === 1 ? '#313244' : '#cba6f7', color: '#11111b', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: currentPage === 1 ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                >
                  ⬅️ Anterior
                </button>
                
                <span style={{ color: '#a6adc8', fontWeight: 'bold', fontSize: '14px' }}>
                  Página {currentPage} de {Math.ceil(onlineResults.length / itemsPerPage)}
                </span>
                
                <button 
                  onClick={() => {
                    setCurrentPage(p => Math.min(Math.ceil(onlineResults.length / itemsPerPage), p + 1));
                    document.getElementById('main-scroll-area').scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  disabled={currentPage === Math.ceil(onlineResults.length / itemsPerPage)}
                  style={{ background: currentPage === Math.ceil(onlineResults.length / itemsPerPage) ? '#313244' : '#cba6f7', color: '#11111b', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold', cursor: currentPage === Math.ceil(onlineResults.length / itemsPerPage) ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                >
                  Siguiente ➡️
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}