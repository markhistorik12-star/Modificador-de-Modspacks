import { useState, useMemo, useEffect } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import {
  FolderOpen, Plus, Download, Activity, Settings2, Code2, Box, FileText,
  Search, X, ChevronRight, Cpu, MemoryStick, Monitor, Zap, AlertTriangle,
  CheckCircle, RefreshCw, ShoppingCart, Gauge, Wrench, Dna, Layers, Sparkles,
  Loader2, CircleDot
} from 'lucide-react';
import ModNode from './components/nodes/ModNode';
import GroupNode from './components/nodes/GroupNode';
import ConfigEditor from './components/ConfigEditor';
import ScriptEditor from './components/ScriptEditor';
import TweaksPanel from './components/TweaksPanel';
import { useModpack } from './hooks/useModpack';
import { useModSearch } from './hooks/useModSearch';
import { useOnlineStore } from './hooks/useOnlineStore';
import { useTweaks } from './hooks/useTweaks';
import { usePerformance } from './hooks/usePerformance';
import { useDiagnosis } from './hooks/useDiagnosis';
import { useOptimization } from './hooks/useOptimization';
import { useToast } from './hooks/useToast';

const nodeTypes = { mod: ModNode, group: GroupNode };

const ShortcutRow = ({ keys, desc }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border-subtle)' }}>
    <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{desc}</span>
    <kbd style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{keys}</kbd>
  </div>
);

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

const formatCompactNumber = (num) => {
  const n = Number(num) || 0;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

const formatRelativeDate = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
};

export default function App() {
  const { toast, showToast } = useToast();
  const modpack = useModpack();
  const modSearch = useModSearch(modpack.nodes, modpack.rfInstance);
  const onlineStore = useOnlineStore(modpack.packInfo, modpack.nodes);
  const tweaks = useTweaks(modpack.packInfo, modpack.availableIds, showToast);
  const performance = usePerformance(modpack.nodes);
  const diagnosis = useDiagnosis();
  const optimization = useOptimization(modpack.packInfo, showToast);
  const [activeTab, setActiveTab] = useState('mods');
  const [graphZoom, setGraphZoom] = useState(1);
  const [performanceSearch, setPerformanceSearch] = useState('');
  const [showShortcuts, setShowShortcuts] = useState(false);

  const handleAskBotAboutMod = () => {
    alert("[IA] La función de análisis con IA ha sido deshabilitada temporalmente.");
    modpack.setContextMenu(null);
  };

  const filteredFiles = useMemo(() => {
    return modpack.rootFiles.filter(file => {
      if (!modSearch.searchTerm) return true;
      const lowerFile = file.toLowerCase();
      const lowerSearch = modSearch.searchTerm.toLowerCase();
      const description = analyzeFilePurpose(file).toLowerCase();
      return lowerFile.includes(lowerSearch) || description.includes(lowerSearch);
    });
  }, [modpack.rootFiles, modSearch.searchTerm]);

  const onNodeClick = async (event, node) => {
    if (node.id.startsWith('cfg-') && window.electronAPI && modpack.packInfo) {
      const fileName = node.data.label.replace('Config: ', '').trim();
      const relativePath = `config/${fileName}`;
      if (!fileName.includes('.')) {
        const result = await window.electronAPI.listFolderContent(relativePath, modpack.packInfo.path);
        if (result.success) modpack.setSidebarFiles({ title: fileName, path: relativePath, files: result.files, isJar: false });
        return;
      }
      const result = await window.electronAPI.readFullFile(relativePath, modpack.packInfo.path);
      if (result.success) modpack.setEditingConfig({ name: fileName, path: relativePath, content: result.content });
    }
  };

  const handleOpenGlobalFile = async (fileName) => {
    if (!window.electronAPI || !modpack.packInfo) return;
    if (!fileName.includes('.')) {
      const extResult = await window.electronAPI.openExternalEditor(fileName, modpack.packInfo.path);
      if (!extResult.success) alert(`Fallo al abrir: ${extResult.message}`);
      return;
    }
    const result = await window.electronAPI.readFullFile(fileName, modpack.packInfo.path);
    if (result.success) modpack.setEditingConfig({ name: fileName, path: fileName, content: result.content });
    else alert(result.message);
  };

  const handleSaveConfig = async (newContent) => {
    if (!window.electronAPI || !modpack.packInfo || !modpack.editingConfig) return;
    const result = await window.electronAPI.writeFile(modpack.editingConfig.path, modpack.packInfo.path, newContent);
    if (result.success) { modpack.setEditingConfig(null); alert("¡Configuración guardada con éxito!"); }
    else alert("Error al guardar el archivo.");
  };

  const handleOpenExternal = async () => {
    if (window.electronAPI && modpack.packInfo && modpack.editingConfig) {
      await window.electronAPI.openExternalEditor(modpack.editingConfig.path, modpack.packInfo.path);
    }
  };

  const handleExportModpack = async () => {
    if (!window.electronAPI || !modpack.packInfo) return;
    alert("[Export] Empaquetando modpack...\n\nEsto puede tardar unos segundos.");
    const result = await window.electronAPI.exportModpack(modpack.packInfo.path, modpack.packInfo.name);
    if (result?.success) alert(`[OK] Modpack exportado con éxito!\n\nSe ha guardado en:\n${result.path}`);
    else alert(`[x] Error al exportar: ${result?.message}`);
  };

  const handleDiagnosePack = async () => {
    if (!window.electronAPI || !modpack.packInfo) return;
    diagnosis.setIsDiagnosing(true);
    const result = await diagnosis.handleDiagnosePack(modpack.packInfo.path);
    diagnosis.setIsDiagnosing(false);
    if (result?.success) {
      diagnosis.setDiagnosticReport(result.report);
      modpack.setNodes(nds => nds.map(node => {
        if (node.type === 'mod') {
          const hasError = Object.entries(result.report.fileStatusMap).some(([fileName, status]) =>
            status === 'error' && fileName.includes(node.data.label.toLowerCase().replace(/\s/g, '')));
          return hasError
            ? { ...node, style: { ...node.style, border: '3px solid #ff4d6a', boxShadow: '0 0 20px rgba(243, 139, 168, 0.8)' } }
            : { ...node, style: { ...node.style, border: '2px solid #00e67a', boxShadow: '0 0 10px rgba(166, 227, 161, 0.3)' } };
        }
        return node;
      }));
    } else alert(`Error en el diagnóstico: ${result?.message}`);
  };

  const handleNodesDelete = async (deletedNodes) => {
    for (const node of deletedNodes) {
      let fileName = node.data?.id || node.data?.name || node.id;
      if (fileName.startsWith('mod-')) fileName = fileName.replace('mod-', '');
      if (!fileName.endsWith('.jar')) { alert(`Error interno: React intentó borrar algo que no es un .jar (${fileName})`); continue; }
      try {
        const result = await window.electronAPI.deleteFile(`mods/${fileName}`, modpack.packInfo.path);
        if (result.success) console.log(`[OK] Archivo eliminado: ${fileName}`);
        else alert(`El nodo desapareció, pero no se pudo borrar: ${result.message}`);
      } catch (error) { console.error("Error grave de comunicación:", error); }
    }
  };

  const onNodeDoubleClick = async (event, node) => {
    if (node.type === 'mod' && window.electronAPI && modpack.packInfo) {
      const jarName = node.id.replace('mod-', '');
      const result = await window.electronAPI.exploreJarContents(jarName, modpack.packInfo.path);
      if (result.success) {
        if (result.files.length === 0) alert(`El mod ${node.data.label} no expone archivos JSON.`);
        else modpack.setSidebarFiles({ title: node.data.label, jarName, files: result.files, isJar: true });
      } else alert(result.message);
    }
  };

  useEffect(() => {
    if (activeTab === 'store') {
      onlineStore.handleSearchOnline();
      onlineStore.fetchApiStatus();
    }
  }, [activeTab]);

  useEffect(() => { performance.setPackInfo(modpack.packInfo); }, [modpack.packInfo]);

  useEffect(() => {
    const handler = (e) => {
      if (e.ctrlKey && e.key === 'k') { e.preventDefault(); setShowShortcuts(v => !v); }
      if (showShortcuts) return;
      if (e.ctrlKey && e.key === 's') { e.preventDefault(); handleSaveConfig(); }
      if (e.ctrlKey && e.key === 'o') { e.preventDefault(); modpack.handleScanFolder(); }
      if (e.ctrlKey && e.key === 'e') { e.preventDefault(); if (modpack.packInfo) handleExportModpack(); }
      if (e.key === 'Escape') { setShowShortcuts(false); modpack.setIsCreatingProject(false); onlineStore.setVersionSelectorModal(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showShortcuts, modpack.packInfo]);

  const handleConfirmDownload = async (version) => {
    const scanResult = await onlineStore.handleConfirmDownload(version, onlineStore.setVersionSelectorModal, showToast);
    if (scanResult) modpack.processScanResult(scanResult);
  };

  const handleCalculateImpact = async () => {
    if (!window.electronAPI || !modpack.packInfo) return;
    performance.setIsCalculatingImpact(true);
    const result = await performance.handleCalculateImpact(modpack.packInfo.path);
    if (result) {
      modpack.setNodes(nds => nds.map(node => {
        if (node.type === 'mod') {
          const fileName = node.id.replace('mod-', '');
          const newScore = result[fileName] !== undefined ? result[fileName] : 20;
          return { ...node, data: { ...node.data, impactScore: newScore } };
        }
        return node;
      }));
      showToast("Análisis Heurístico", "Impacto calculado para todos los mods.", "success");
    } else showToast("Error", "No se pudo calcular el impacto.", "error");
    performance.setIsCalculatingImpact(false);
  };

  const handleDeleteMod = async (modId) => {
    if (!window.electronAPI || !modpack.packInfo) return;
    const fileName = modId.startsWith('mod-') ? modId.replace('mod-', '') : modId;
    if (!confirm(`¿Eliminar "${fileName}" del modpack?\n\nEsta acción borra el archivo .jar de la carpeta mods y no se puede deshacer.`)) return;
    try {
      const result = await window.electronAPI.deleteFile(`mods/${fileName}`, modpack.packInfo.path);
      if (result.success) {
        modpack.setNodes(nds => nds.filter(node => node.id !== modId));
        showToast("Mod eliminado", `${fileName} fue borrado del modpack.`, "success");
      } else {
        showToast("Error", `No se pudo borrar: ${result.message}`, "error");
      }
    } catch (err) {
      console.error('[handleDeleteMod]', err);
      showToast("Error", `Fallo al borrar: ${err.message}`, "error");
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0d0f12', color: '#f8f9fa', fontFamily: 'sans-serif', overflow: 'hidden' }}>
      <style>{`
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes popIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        @keyframes slideInRight { from { opacity: 0; transform: translateX(100px); } to { opacity: 1; transform: translateX(0); } }
        .animate-tab { animation: fadeSlideUp 0.4s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; }
        .animate-modal { animation: popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .toast-enter { animation: slideInRight 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>

      {/* SIDEBAR + EDITOR */}
      {(modpack.sidebarFiles || modpack.editingConfig) && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 3000, background: '#0d0f12', display: 'flex' }}>
          {modpack.sidebarFiles && (
            <div className="animate-tab" style={{ width: '280px', background: '#1a1d24', borderRight: '1px solid #2a2e36', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{ padding: '15px', borderBottom: '1px solid #2a2e36', color: '#00e5ff', fontSize: '13px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>[DIR] {modpack.sidebarFiles.title.toUpperCase()}</span>
                <button onClick={() => { modpack.setSidebarFiles(null); modpack.setEditingConfig(null); }} style={{ background: 'transparent', border: 'none', color: '#ff4d6a', cursor: 'pointer', fontSize: '16px' }}>x</button>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '10px' }}>
                {modpack.sidebarFiles.files.map((file, i) => {
                  const shortName = file.split('/').pop();
                  return (
                    <div key={i} onClick={async () => {
                      let res;
                      if (modpack.sidebarFiles.isJar) res = await window.electronAPI.readJarFile(modpack.sidebarFiles.jarName, file, modpack.packInfo.path);
                      else res = await window.electronAPI.readFullFile(`${modpack.sidebarFiles.path}/${file}`, modpack.packInfo.path);
                      if (res.success) modpack.setEditingConfig({ name: shortName, path: modpack.sidebarFiles.isJar ? `INTERNO/${file}` : `${modpack.sidebarFiles.path}/${file}`, content: res.content });
                      else showToast("Error de lectura", res.message, "error");
                    }} style={{
                      padding: '10px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#f8f9fa',
                      background: modpack.editingConfig?.name === shortName ? '#2a2e36' : 'transparent',
                      borderLeft: modpack.editingConfig?.name === shortName ? '3px solid #00e5ff' : '3px solid transparent',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'background 0.2s'
                    }}>
                      [FILE] {shortName}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div className="animate-tab" style={{ flex: 1, position: 'relative' }}>
            {modpack.editingConfig ? (
              <ConfigEditor fileName={modpack.editingConfig.name} initialContent={modpack.editingConfig.content} onClose={() => modpack.setEditingConfig(null)} onSave={handleSaveConfig} onOpenExternal={handleOpenExternal} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', flexDirection: 'column', gap: '15px' }}>
                <span style={{ fontSize: '48px' }}>[FILE]</span>
                <p style={{ fontSize: '16px' }}>Selecciona un archivo del panel izquierdo para empezar a editar.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MODAL: NUEVO PROYECTO */}
      {modpack.isCreatingProject && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 2000, background: 'rgba(17, 17, 27, 0.9)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="animate-modal" style={{ background: '#1a1d24', border: '2px solid #00e67a', borderRadius: '12px', width: '450px', padding: '30px', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}>
            <h2 style={{ color: '#00e67a', marginTop: 0 }}>Crear Entorno Virtual</h2>
            <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '25px' }}>Configura los parámetros base de tu nuevo Modpack.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>Nombre del Proyecto</label>
                <input type="text" value={modpack.newProjectData.name} onChange={e => modpack.setNewProjectData({ ...modpack.newProjectData, name: e.target.value })} placeholder="Ej: Mi Aventura RPG" style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #2a2e36', background: '#0d0f12', color: '#f8f9fa', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>Versión de Minecraft</label>
                  <select value={modpack.newProjectData.mcVersion} onChange={e => modpack.setNewProjectData({ ...modpack.newProjectData, mcVersion: e.target.value })} style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #2a2e36', background: '#0d0f12', color: '#f8f9fa', outline: 'none', cursor: 'pointer' }}>
                    {modpack.availableGameVersions.length > 0 ? modpack.availableGameVersions.map(v => <option key={v.version} value={v.version}>{v.version}</option>) : <option value="1.20.1">Cargando versiones...</option>}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#f8f9fa', fontSize: '13px', fontWeight: 'bold' }}>Mod Loader</label>
                  <select value={modpack.newProjectData.loader} onChange={e => modpack.setNewProjectData({ ...modpack.newProjectData, loader: e.target.value })} style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #2a2e36', background: '#0d0f12', color: '#f8f9fa', outline: 'none', cursor: 'pointer' }}>
                    <option value="Forge">Forge</option><option value="Fabric">Fabric</option><option value="NeoForge">NeoForge</option><option value="Quilt">Quilt</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => modpack.setIsCreatingProject(false)} style={{ background: '#2a2e36', color: '#f8f9fa', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={modpack.handleConfirmCreateProject} style={{ background: '#00e67a', color: '#0d0f12', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Elegir Carpeta y Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SELECTOR DE VERSIONES */}
      {onlineStore.versionSelectorModal && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: 'rgba(10, 12, 16, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => onlineStore.setVersionSelectorModal(null)}>
          <div className="animate-modal" style={{ background: '#1a1d24', border: '2px solid #00e5ff', borderRadius: '14px', width: '600px', maxHeight: '78vh', display: 'flex', flexDirection: 'column', boxShadow: '0 18px 50px rgba(0,0,0,0.7)', overflow: 'hidden' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid #2a2e36', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#12141c' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <h3 style={{ margin: 0, color: '#00e5ff', fontSize: '18px' }}>Instalar: {onlineStore.versionSelectorModal.title}</h3>
                  <span style={{
                    fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '4px',
                    background: onlineStore.versionSelectorModal.source === 'curseforge' ? '#ff8c42' : '#00e67a',
                    color: '#0d0f12'
                  }}>
                    {onlineStore.versionSelectorModal.source.toUpperCase()}
                  </span>
                </div>
                <p style={{ margin: '4px 0 0 0', color: '#9ca3af', fontSize: '12px' }}>
                  Compatible con <b>{modpack.packInfo?.loader} {modpack.packInfo?.gameVersion}</b> ({onlineStore.versionSelectorModal.versions.length} archivos disponibles)
                </p>
              </div>
              {onlineStore.versionSelectorModal.mod?.sources?.length > 1 && (
                <button
                  onClick={() => {
                    const nextSource = onlineStore.versionSelectorModal.source === 'curseforge' ? 'modrinth' : 'curseforge';
                    const mod = onlineStore.versionSelectorModal.mod;
                    onlineStore.setVersionSelectorModal(null);
                    onlineStore.handleSelectModVersions(mod.project_id, mod.title, nextSource, mod);
                  }}
                  style={{ background: '#2a2e36', border: '1px solid #00e5ff', color: '#00e5ff', borderRadius: '6px', padding: '6px 10px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', marginLeft: 'auto', marginRight: '12px' }}
                >
                  Cambiar a {onlineStore.versionSelectorModal.source === 'curseforge' ? 'Modrinth' : 'CurseForge'}
                </button>
              )}
              <button onClick={() => onlineStore.setVersionSelectorModal(null)} style={{ background: 'transparent', border: 'none', color: '#ff4d6a', fontSize: '20px', cursor: 'pointer' }}>x</button>
            </div>
            <div style={{ padding: '18px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {onlineStore.versionSelectorModal.versions.map((v, idx) => {
                const relType = (v.release_type || 'release').toLowerCase();
                const relBadgeColor = relType === 'release' ? '#00e67a' : (relType === 'beta' ? '#ffc42e' : '#ff4d6a');
                const sizeMB = v.file_size ? `${(v.file_size / (1024 * 1024)).toFixed(2)} MB` : null;
                return (
                  <div key={v.id} style={{ background: '#0d0f12', border: idx === 0 ? '1px solid rgba(0, 229, 255, 0.45)' : '1px solid #2a2e36', padding: '14px 16px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ color: '#f8f9fa', fontWeight: 'bold', fontSize: '14px', wordBreak: 'break-all' }}>{v.name}</span>
                        <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '1px 6px', borderRadius: '4px', background: `${relBadgeColor}22`, color: relBadgeColor, border: `1px solid ${relBadgeColor}55` }}>
                          {relType.toUpperCase()}
                        </span>
                        {idx === 0 && <span style={{ fontSize: '10px', fontWeight: 'bold', padding: '1px 6px', borderRadius: '4px', background: 'rgba(0, 229, 255, 0.15)', color: '#00e5ff' }}>RECOMENDADA</span>}
                      </div>
                      <div style={{ color: '#9ca3af', fontSize: '12px', marginTop: '4px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        <span>Fecha: {v.date}</span>
                        {sizeMB && <span>Tamaño: {sizeMB}</span>}
                        {v.fileName && <span style={{ fontFamily: 'monospace', color: '#7a7f99' }}>{v.fileName}</span>}
                      </div>
                      {v.dependencies?.length > 0 && (
                        <div style={{ color: '#ffc42e', fontSize: '12px', marginTop: '6px' }}>
                          [!] Requiere {v.dependencies.length} dependencia(s) obligatoria(s){v.source === 'modrinth' ? ' (instalación automática disponible)' : ''}.
                        </div>
                      )}
                    </div>
                    <button onClick={() => handleConfirmDownload(v)} style={{ background: '#00e5ff', color: '#0d0f12', border: 'none', padding: '9px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flexShrink: 0 }}>
                      Descargar
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REPORTE DE DIAGNÓSTICO */}
      {diagnosis.diagnosticReport && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 3000, background: 'rgba(17, 17, 27, 0.9)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="animate-modal" style={{ background: '#1a1d24', border: `2px solid ${diagnosis.diagnosticReport.errors.length > 0 ? '#ff4d6a' : '#00e67a'}`, borderRadius: '12px', width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.8)', overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #2a2e36', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1a1d24' }}>
              <h2 style={{ margin: 0, color: diagnosis.diagnosticReport.errors.length > 0 ? '#ff4d6a' : '#00e67a', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {diagnosis.diagnosticReport.errors.length > 0 ? '[x] Conflictos Detectados' : '[OK] Pack Saludable'}
              </h2>
              <button onClick={() => diagnosis.setDiagnosticReport(null)} style={{ background: 'transparent', border: 'none', color: '#9ca3af', fontSize: '20px', cursor: 'pointer' }}>x</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', gap: '15px', justifyContent: 'space-between' }}>
                <div style={{ background: '#0d0f12', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center', border: '1px solid #2a2e36' }}>
                  <div style={{ color: '#f8f9fa', fontSize: '24px', fontWeight: 'bold' }}>{diagnosis.diagnosticReport.total}</div>
                  <div style={{ color: '#9ca3af', fontSize: '12px' }}>Total Mods</div>
                </div>
                <div style={{ background: '#0d0f12', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center', border: '1px solid #00e67a' }}>
                  <div style={{ color: '#00e67a', fontSize: '24px', fontWeight: 'bold' }}>{diagnosis.diagnosticReport.okCount}</div>
                  <div style={{ color: '#00e67a', fontSize: '12px' }}>Mods Válidos</div>
                </div>
                <div style={{ background: '#0d0f12', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center', border: '1px solid #ff4d6a' }}>
                  <div style={{ color: '#ff4d6a', fontSize: '24px', fontWeight: 'bold' }}>{diagnosis.diagnosticReport.errors.length}</div>
                  <div style={{ color: '#ff4d6a', fontSize: '12px' }}>Errores Críticos</div>
                </div>
              </div>
              {diagnosis.diagnosticReport.weightReport && (
                <div style={{ background: '#1a1d24', borderRadius: '12px', border: '1px solid #2a2e36', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, color: '#ff8c42', fontSize: '16px' }}>Peso del Modpack</h3>
                    <span style={{ fontSize: '24px', fontWeight: 'bold', color: diagnosis.diagnosticReport.weightReport.score <= 3 ? '#00e67a' : diagnosis.diagnosticReport.weightReport.score <= 5 ? '#ffc42e' : diagnosis.diagnosticReport.weightReport.score <= 7 ? '#ff8c42' : '#ff4d6a' }}>
                      {diagnosis.diagnosticReport.weightReport.score}/10
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                    {[1,2,3,4,5,6,7,8,9,10].map(i => {
                      const color = i <= diagnosis.diagnosticReport.weightReport.score
                        ? (diagnosis.diagnosticReport.weightReport.score <= 3 ? '#00e67a' : diagnosis.diagnosticReport.weightReport.score <= 5 ? '#ffc42e' : diagnosis.diagnosticReport.weightReport.score <= 7 ? '#ff8c42' : '#ff4d6a')
                        : '#2a2e36';
                      return <div key={i} style={{ flex: 1, height: '8px', background: color, borderRadius: '4px' }} />;
                    })}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '13px', textAlign: 'center', marginBottom: '15px' }}>
                    {diagnosis.diagnosticReport.weightReport.score <= 3 ? '[OK] Ligero — Excelente rendimiento' :
                     diagnosis.diagnosticReport.weightReport.score <= 5 ? '[WARN] Moderado — Rendimiento aceptable' :
                     diagnosis.diagnosticReport.weightReport.score <= 7 ? '[WARN] Pesado — Considera optimizar' :
                     '[ERROR] Muy pesado — Se recomienda optimizar'}
                  </div>
                  <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <div style={{ background: '#0d0f12', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #2a2e36' }}>
                      <div style={{ color: '#f8f9fa', fontSize: '18px', fontWeight: 'bold' }}>Mods: {diagnosis.diagnosticReport.weightReport.totalMods}</div>
                      <div style={{ color: '#9ca3af', fontSize: '11px' }}>Mods</div>
                    </div>
                    <div style={{ background: '#0d0f12', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #2a2e36' }}>
                      <div style={{ color: '#00e5ff', fontSize: '18px', fontWeight: 'bold' }}>{diagnosis.diagnosticReport.weightReport.totalSizeMB} MB</div>
                      <div style={{ color: '#9ca3af', fontSize: '11px' }}>Peso Total</div>
                    </div>
                    <div style={{ background: '#0d0f12', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #00e67a' }}>
                      <div style={{ color: '#00e67a', fontSize: '18px', fontWeight: 'bold' }}>Opt: {diagnosis.diagnosticReport.weightReport.optimizationCount}</div>
                      <div style={{ color: '#9ca3af', fontSize: '11px' }}>Optimización</div>
                    </div>
                    <div style={{ background: '#0d0f12', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #ff4d6a' }}>
                      <div style={{ color: '#ff4d6a', fontSize: '18px', fontWeight: 'bold' }}>Heavy: {diagnosis.diagnosticReport.weightReport.heavyCount}</div>
                      <div style={{ color: '#9ca3af', fontSize: '11px' }}>Mods Pesados</div>
                    </div>
                  </div>
                </div>
              )}
              {diagnosis.diagnosticReport.errors.length > 0 && (
                <div>
                  <h3 style={{ color: '#ff4d6a', margin: '0 0 10px 0', fontSize: '16px' }}>Errores que causarán crasheos:</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {diagnosis.diagnosticReport.errors.map((err, i) => (
                      <div key={i} style={{ background: 'rgba(243, 139, 168, 0.1)', borderLeft: '4px solid #ff4d6a', padding: '10px 15px', color: '#f8f9fa', fontSize: '14px', borderRadius: '0 6px 6px 0' }}>{err}</div>
                    ))}
                  </div>
                </div>
              )}
              {diagnosis.diagnosticReport.warnings.length > 0 && (
                <div>
                  <h3 style={{ color: '#ffc42e', margin: '0 0 10px 0', fontSize: '16px' }}>Advertencias (Desconocidos):</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {diagnosis.diagnosticReport.warnings.map((warn, i) => (
                      <div key={i} style={{ background: 'rgba(249, 226, 175, 0.05)', borderLeft: '4px solid #ffc42e', padding: '10px 15px', color: '#9ca3af', fontSize: '13px', borderRadius: '0 6px 6px 0' }}>{warn}</div>
                    ))}
                  </div>
                </div>
              )}
              {diagnosis.diagnosticReport.errors.length === 0 && diagnosis.diagnosticReport.warnings.length === 0 && (
                <div style={{ textAlign: 'center', color: '#9ca3af', padding: '20px 0' }}>Todo parece estar en perfecto orden. ¡Listo para exportar y jugar!</div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MENU CONTEXTUAL */}
      {modpack.contextMenu && (
        <div className="animate-modal" style={{
          position: 'absolute', top: modpack.contextMenu.y, left: modpack.contextMenu.x, zIndex: 100,
          background: 'linear-gradient(135deg, #1b1e2a 0%, #232037 100%)', border: '1px solid #7c88ff', borderRadius: '10px',
          boxShadow: '0 6px 18px rgba(0,0,0,.4)', padding: '6px', display: 'flex', flexDirection: 'column'
        }}>
          <button onClick={handleAskBotAboutMod} style={{
            background: 'transparent', color: '#f8f9fa', border: 'none',
            padding: '10px 15px', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', fontSize: '14px', borderRadius: '4px', transition: 'background 0.2s'
          }}
            onMouseEnter={(e) => e.target.style.background = '#2a2e36'}
            onMouseLeave={(e) => e.target.style.background = 'transparent'}>
            <span>[IA]</span> Analizar Mod con IA
          </button>
        </div>
      )}

      {/* BARRA SUPERIOR */}
      <div className="topbar">
        <div className="topbar-primary">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
            <button onClick={modpack.handleScanFolder} className="btn btn-secondary" style={{ background: 'var(--accent-secondary)', color: 'var(--text-inverse)', fontWeight: 700 }}>
              <FolderOpen size={16} /> Cargar Modpack
            </button>
            <button onClick={modpack.handleOpenProjectWizard} className="btn btn-success">
              <Plus size={16} /> Nuevo Proyecto
            </button>
            <button onClick={() => setShowShortcuts(true)} className="btn btn-secondary" style={{ background: '#2a2e36', border: '1px solid #2a2e36', fontSize: '12px', padding: '6px 10px' }}>
              <span style={{ fontFamily: 'monospace' }}>Ctrl+K</span>
            </button>
          </div>
          {modpack.packInfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)' }}>
              <div style={{ textAlign: 'center' }}>
                <div className="topbar-label">MODPACK</div>
                <div className="topbar-value">{modpack.packInfo.name}</div>
              </div>
              <div className="topbar-divider" />
              <div style={{ textAlign: 'center' }}>
                <div className="topbar-label">MC</div>
                <div className="topbar-value">{modpack.packInfo.gameVersion}</div>
              </div>
            </div>
          )}
          {modpack.packInfo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <button data-tooltip="Comprimir todo el modpack (mods, configs, scripts) en un archivo ZIP" onClick={() => { showToast("Empaquetando...", "Comprimiendo tus mods. Esto puede tardar.", "loading"); handleExportModpack(); }} className="btn btn-warning">
                <Download size={15} /> Exportar
              </button>
              <button data-tooltip="Detecta versiones incompatibles, dependencias faltantes y conflictos" onClick={handleDiagnosePack} disabled={diagnosis.isDiagnosing} className="btn" style={{ background: diagnosis.isDiagnosing ? '#ffc42e' : '#00e5ff', color: '#0d0f12', boxShadow: '0 0 10px rgba(137, 220, 235, 0.4)', cursor: diagnosis.isDiagnosing ? 'wait' : 'pointer' }}>
                {diagnosis.isDiagnosing ? <><RefreshCw size={15} className="spin" /> Analizando...</> : <><Activity size={15} /> Diagnosticar</>}
              </button>
            </div>
          )}
        </div>
        <div className="topbar-secondary">
          {[
            { key: 'mods', label: 'Ecosistema', icon: Box, color: '#00e5ff', tip: 'Vista de grafo con todos los mods y sus conexiones' },
            { key: 'global', label: 'Config. Gral', icon: Settings2, color: '#00e5ff', tip: 'Archivos de configuración generales del modpack' },
            { key: 'store', label: 'Tienda', icon: ShoppingCart, color: '#00e5ff', tip: 'Buscar y descargar mods desde CurseForge y Modrinth' },
            { key: 'tweaks', label: 'Tweaks', icon: Wrench, color: '#f5c2e7', tip: 'Balanceo de ítems y entidades (KubeJS)' },
            { key: 'performance', label: 'Rendimiento', icon: Gauge, color: '#ff8c42', tip: 'Análisis de rendimiento y detección de cuellos de botella' },
            { key: 'ide', label: 'Editor IDE', icon: Code2, color: '#00e67a', tip: 'Editor avanzado de scripts y configuraciones' },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} data-tooltip={tab.tip} onClick={() => setActiveTab(tab.key)} style={{
                background: activeTab === tab.key ? '#2a2e36' : 'transparent',
                color: activeTab === tab.key ? tab.color : '#9ca3af',
                border: 'none', padding: '8px 16px', borderRadius: 'var(--radius-md)',
                cursor: 'pointer', fontWeight: 'bold', fontSize: '14px',
                display: 'flex', alignItems: 'center', gap: '6px',
                transition: 'all var(--duration-fast) var(--ease-out)', position: 'relative'
              }}>
                <Icon size={15} />
                {tab.label}
                {activeTab === tab.key && <div style={{ position: 'absolute', bottom: '-2px', left: '10%', width: '80%', height: '3px', background: tab.color, borderRadius: '2px' }} />}
              </button>
            );
          })}
        </div>
      </div>

      {/* DETALLES DE MOD (TIENDA) */}
      {onlineStore.showDetails && onlineStore.selectedMod && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(10, 12, 16, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 }} onClick={() => onlineStore.setShowDetails(false)}>
          <div className="animate-modal" style={{ width: '780px', maxHeight: '85vh', overflowY: 'auto', background: '#1a1d24', border: '2px solid #00e5ff', borderRadius: '14px', padding: '24px', boxShadow: '0 24px 70px rgba(0,0,0,0.75)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #2a2e36', paddingBottom: '16px', gap: '16px' }}>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                <div style={{ width: '76px', height: '76px', borderRadius: '12px', background: '#0d0f12', border: '1px solid #2a2e36', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {onlineStore.selectedMod.icon_url ? (
                    <img src={onlineStore.selectedMod.icon_url} alt={onlineStore.selectedMod.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <Box size={32} color="#00e5ff" />
                  )}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <h2 style={{ margin: 0, color: '#f8f9fa', fontSize: '22px' }}>{onlineStore.selectedMod.title}</h2>
                    {(onlineStore.selectedMod.sources || [onlineStore.selectedMod.source || 'modrinth']).map(src => (
                      <span key={src} style={{
                        fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px',
                        background: src === 'curseforge' ? '#ff8c42' : '#00e67a', color: '#0d0f12'
                      }}>
                        {src.toUpperCase()}
                      </span>
                    ))}
                    {onlineStore.isModInstalled(onlineStore.selectedMod) && (
                      <span style={{ fontSize: '10px', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', background: 'rgba(0, 230, 122, 0.18)', color: '#00e67a', border: '1px solid #00e67a' }}>
                        INSTALADO EN TU PACK
                      </span>
                    )}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: '13px', marginTop: '4px', display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                    <span>Por <b style={{ color: '#f8f9fa' }}>{onlineStore.selectedMod.author || 'Desconocido'}</b></span>
                    <span>Descargas: <b style={{ color: '#00e5ff' }}>{(onlineStore.selectedMod.downloads || 0).toLocaleString()}</b></span>
                    {onlineStore.selectedMod.updated_at && <span>Actualizado: {formatRelativeDate(onlineStore.selectedMod.updated_at)}</span>}
                  </div>
                </div>
              </div>
              <button onClick={() => onlineStore.setShowDetails(false)} style={{ background: '#2a2e36', border: 'none', color: '#f8f9fa', borderRadius: '8px', padding: '8px 14px', cursor: 'pointer', fontWeight: 'bold' }}>Cerrar</button>
            </div>

            <div style={{ marginTop: '18px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#00e5ff', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Resumen del Mod</h4>
              <p style={{ color: '#f0f2f7', fontSize: '14px', lineHeight: 1.6, background: '#0d0f12', padding: '14px 16px', borderRadius: '10px', border: '1px solid #2a2e36', margin: 0 }}>
                {onlineStore.selectedMod.description || 'Sin descripción disponible.'}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '10px', marginTop: '16px' }}>
              {onlineStore.selectedMod.loaders?.length > 0 && (
                <div style={{ background: '#0d0f12', padding: '10px 14px', borderRadius: '8px', border: '1px solid #2a2e36' }}>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>MODLOADERS</div>
                  <div style={{ fontSize: '13px', color: '#f8f9fa', fontWeight: 'bold', marginTop: '2px', textTransform: 'capitalize' }}>{onlineStore.selectedMod.loaders.join(', ')}</div>
                </div>
              )}
              {onlineStore.selectedMod.categories?.length > 0 && (
                <div style={{ background: '#0d0f12', padding: '10px 14px', borderRadius: '8px', border: '1px solid #2a2e36' }}>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>CATEGORÍAS</div>
                  <div style={{ fontSize: '13px', color: '#f8f9fa', fontWeight: 'bold', marginTop: '2px', textTransform: 'capitalize' }}>{onlineStore.selectedMod.categories.slice(0, 4).join(' • ')}</div>
                </div>
              )}
              {(onlineStore.selectedMod.client_side || onlineStore.selectedMod.server_side) && (
                <div style={{ background: '#0d0f12', padding: '10px 14px', borderRadius: '8px', border: '1px solid #2a2e36' }}>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>ENTORNO</div>
                  <div style={{ fontSize: '13px', color: '#f8f9fa', fontWeight: 'bold', marginTop: '2px' }}>
                    Cliente: {onlineStore.selectedMod.client_side || '?'} | Servidor: {onlineStore.selectedMod.server_side || '?'}
                  </div>
                </div>
              )}
              {onlineStore.selectedMod.license && (
                <div style={{ background: '#0d0f12', padding: '10px 14px', borderRadius: '8px', border: '1px solid #2a2e36' }}>
                  <div style={{ fontSize: '11px', color: '#9ca3af' }}>LICENCIA</div>
                  <div style={{ fontSize: '13px', color: '#f8f9fa', fontWeight: 'bold', marginTop: '2px' }}>{onlineStore.selectedMod.license}</div>
                </div>
              )}
            </div>

            {onlineStore.selectedMod.gallery?.length > 0 && (
              <div style={{ marginTop: '18px' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#00e5ff', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Galería / Capturas</h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '10px' }}>
                  {onlineStore.selectedMod.gallery.map((imgUrl, idx) => (
                    <img key={idx} src={imgUrl} alt={`Captura ${idx + 1}`} style={{ width: '100%', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #2a2e36', background: '#0d0f12' }} />
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: '22px', paddingTop: '16px', borderTop: '1px solid #2a2e36', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
              <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                Elegí desde qué plataforma descargar los archivos para <b>{modpack.packInfo?.loader} {modpack.packInfo?.gameVersion}</b>:
              </div>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                {(onlineStore.selectedMod.sources?.includes('modrinth') || onlineStore.selectedMod.source === 'modrinth') && (
                  <button
                    onClick={() => {
                      const mod = onlineStore.selectedMod;
                      onlineStore.setShowDetails(false);
                      onlineStore.handleSelectModVersions(mod.modrinth_id || mod.project_id, mod.title, 'modrinth', mod);
                    }}
                    style={{ background: '#00e67a', color: '#0d0f12', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Ver versiones en Modrinth
                  </button>
                )}
                {(onlineStore.selectedMod.sources?.includes('curseforge') || onlineStore.selectedMod.source === 'curseforge') && (
                  <button
                    onClick={() => {
                      const mod = onlineStore.selectedMod;
                      onlineStore.setShowDetails(false);
                      onlineStore.handleSelectModVersions(mod.curseforge_id || mod.project_id, mod.title, 'curseforge', mod);
                    }}
                    style={{ background: '#ff8c42', color: '#0d0f12', border: 'none', padding: '10px 18px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                  >
                    Ver versiones en CurseForge
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CONTENEDOR PRINCIPAL */}
      <div id="main-scroll-area" className="main-scroll">

        {/* PESTAÑA 1: ECOSISTEMA */}
        {activeTab === 'mods' && (
          <div className="tab-content" style={{ position: 'relative', width: '100%', height: 'calc(100vh - 112px)' }}>
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 50, display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: 8, background: 'rgba(20,20,40,0.9)', border: '1px solid #2a2e36' }}>
              <button onClick={() => { if (modpack.rfInstance?.setViewport) { const newZoom = Math.min(3, graphZoom + 0.1); setGraphZoom(newZoom); modpack.rfInstance.setViewport({ x: 0, y: 0, zoom: newZoom }, 150); } }} title="Zoom in" style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#00e5ff', color: '#fff', cursor: 'pointer' }}>+</button>
              <button onClick={() => { if (modpack.rfInstance?.setViewport) { const newZoom = Math.max(0.2, graphZoom - 0.1); setGraphZoom(newZoom); modpack.rfInstance.setViewport({ x: 0, y: 0, zoom: newZoom }, 150); } }} title="Zoom out" style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#00e5ff', color: '#fff', cursor: 'pointer' }}>−</button>
              <button onClick={() => modpack.rfInstance?.fitView?.()} title="Ajustar Vista" style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#00e5ff', color: '#fff', cursor: 'pointer' }}>Fit</button>
              <span style={{ color: '#f8f9fa', fontSize: 12 }}>Zoom</span>
              <input type="range" min={0.2} max={2.5} step={0.05} value={graphZoom} onChange={(e) => { const v = parseFloat(e.target.value); setGraphZoom(v); if (modpack.rfInstance?.setViewport) modpack.rfInstance.setViewport({ x: 0, y: 0, zoom: v }, 0); }} style={{ width: 120 }} />
            </div>
            {modpack.nodes.length > 0 && (
              <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10, width: '400px' }}>
                <input type="text" placeholder="Buscar... (Enter para focalizar)" value={modSearch.searchMods} onChange={(e) => modSearch.setSearchMods(e.target.value)} onKeyDown={modSearch.handleSearchKeyDown} style={{
                  width: '100%', padding: '12px 20px', borderRadius: '30px', border: '1px solid #00e5ff', background: 'rgba(26, 29, 36, 0.8)',
                  color: '#f8f9fa', outline: 'none', fontSize: '14px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)'
                }} />
              </div>
            )}
            <ReactFlow nodes={modSearch.displayNodes} edges={modpack.edges} onNodesChange={modpack.onNodesChange} onInit={modpack.setRfInstance} onEdgesChange={modpack.onEdgesChange} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={2.5}
              onNodeContextMenu={modpack.onNodeContextMenu} onPaneClick={modpack.onPaneClick} onNodeClick={onNodeClick}
              onNodesDelete={handleNodesDelete} onNodeDoubleClick={onNodeDoubleClick}>
              <Background color="#2a2e36" variant="dots" gap={25} size={1} />
              <Controls />
              <MiniMap nodeColor="#00e5ff" maskColor="rgba(26, 29, 36, 0.7)" style={{ background: '#0d0f12' }} />
            </ReactFlow>
          </div>
        )}

        {/* PESTAÑA 2: ARCHIVOS GLOBALES */}
        {activeTab === 'global' && (
          <div className="tab-content" style={{ padding: 'var(--space-10)', maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>
            <h2>Configuraciones Globales</h2>
            <p style={{ color: '#9ca3af', marginBottom: '20px' }}>Estructura del directorio detectado en {modpack.packInfo?.name}</p>
            {modpack.rootFiles.length > 0 && (
              <input type="text" placeholder="Buscar (Extensión o Función)..." value={modSearch.searchTerm} onChange={(e) => modSearch.setSearchTerm(e.target.value)} style={{ width: '100%', padding: '12px 15px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #2a2e36', background: '#1a1d24', color: '#f8f9fa', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }} />
            )}
            <div style={{ background: '#1a1d24', padding: '20px', borderRadius: '12px', border: '1px solid #2a2e36' }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {modpack.rootFiles.length > 0 ? (
                  filteredFiles.length > 0 ? filteredFiles.map((file, i) => (
                    <li key={i} style={{ marginBottom: '12px', padding: '12px', background: '#0d0f12', borderRadius: '8px', border: '1px solid #2a2e36', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <b style={{ color: '#00e5ff' }}>{file.includes('.') ? '[FILE]' : '[DIR]'} {file}</b>
                        </div>
                        <p style={{ margin: 0, color: '#9ca3af', fontSize: '13px', fontStyle: 'italic' }}>{analyzeFilePurpose(file)}</p>
                      </div>
                      <button onClick={() => handleOpenGlobalFile(file)} style={{ background: '#00e5ff', color: '#0d0f12', border: 'none', padding: '8px 15px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'transform 0.1s', flexShrink: 0 }}>Abrir</button>
                    </li>
                  )) : <li style={{ color: '#ff4d6a', textAlign: 'center', padding: '20px' }}>Cero coincidencias de búsqueda.</li>
                ) : <li style={{ color: '#ff4d6a', textAlign: 'center', padding: '20px' }}>Directorio vacío.</li>}
              </ul>
            </div>
          </div>
        )}

        {/* PESTAÑA 3: TIENDA */}
        {activeTab === 'store' && (
          <div className="tab-content" style={{ padding: 'var(--space-8) var(--space-10)', paddingBottom: '100px', maxWidth: '1240px', margin: '0 auto' }}>
            {/* ENCABEZADO DE LA TIENDA */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 'var(--space-5)', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h2 style={{ color: '#00e5ff', margin: 0, fontSize: '26px' }}>Tienda Unificada de Mods</h2>
                  {modpack.packInfo && (
                    <span style={{ background: 'rgba(0, 229, 255, 0.12)', border: '1px solid rgba(0, 229, 255, 0.35)', color: '#00e5ff', padding: '3px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 700 }}>
                      {modpack.packInfo.loader} {modpack.packInfo.gameVersion}
                    </span>
                  )}
                </div>
                <p style={{ color: 'var(--text-secondary)', margin: '6px 0 0 0', fontSize: '14px' }}>
                  Explora, compara e instala mods desde <b>Modrinth</b> y <b>CurseForge</b> en un solo lugar.
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                {modpack.packInfo && (
                  <button
                    onClick={() => onlineStore.setShowRecommendations(v => !v)}
                    className="btn btn-secondary"
                    style={{
                      background: onlineStore.showRecommendations ? 'rgba(0, 229, 255, 0.14)' : 'var(--bg-surface)',
                      borderColor: onlineStore.showRecommendations ? '#00e5ff' : 'var(--border-default)',
                      color: onlineStore.showRecommendations ? '#00e5ff' : 'var(--text-secondary)',
                      padding: '7px 12px',
                      fontSize: '12px'
                    }}
                  >
                    <Sparkles size={14} /> {onlineStore.showRecommendations ? 'Ocultar Recomendaciones' : `Recomendados (${onlineStore.smartRecommendations.length})`}
                  </button>
                )}
                {onlineStore.apiStatus && (
                  <div className="api-status">
                    <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>APIs:</span>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                        <span className="api-status-dot" style={{ background: onlineStore.apiStatusDisplay.modrinth.color }}></span>
                        <span style={{ color: onlineStore.apiStatusDisplay.modrinth.color }}>{onlineStore.apiStatusDisplay.modrinth.label}</span>
                      </span>
                      <span style={{ color: 'var(--border-default)' }}>|</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px' }}>
                        <span className="api-status-dot" style={{ background: onlineStore.apiStatusDisplay.curseforge.color }}></span>
                        <span style={{ color: onlineStore.apiStatusDisplay.curseforge.color }}>{onlineStore.apiStatusDisplay.curseforge.label}</span>
                      </span>
                      <button onClick={onlineStore.refreshApiStatus} style={{ background: 'transparent', border: '1px solid var(--accent-secondary)', color: 'var(--accent-secondary)', padding: '2px 6px', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontSize: '10px', marginLeft: 'var(--space-1)' }} title="Revisar estado">Actualizar</button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* PANEL DE RECOMENDACIONES INTELIGENTES */}
            {modpack.packInfo && onlineStore.showRecommendations && onlineStore.smartRecommendations.length > 0 && (
              <div className="store-recommendations-panel">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ width: '34px', height: '34px', borderRadius: '8px', background: 'rgba(0, 229, 255, 0.15)', color: '#00e5ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={18} />
                    </div>
                    <div>
                      <h3 style={{ margin: 0, color: '#f8f9fa', fontSize: '16px' }}>
                        Recomendaciones Inteligentes para {modpack.packInfo.name}
                      </h3>
                      <p style={{ margin: '2px 0 0 0', color: '#9ca3af', fontSize: '12px' }}>
                        Basadas en los mods que aún no tienes instalados en tu ecosistema ({modpack.packInfo.loader} {modpack.packInfo.gameVersion}).
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {[
                      { id: 'all', label: 'Todos' },
                      { id: 'performance', label: 'FPS y RAM' },
                      { id: 'qol', label: 'Utilidad / QoL' },
                      { id: 'synergy', label: 'Sinergias y Tweaks' },
                      { id: 'content', label: 'Contenido' }
                    ].map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => onlineStore.setActiveRecTab(tab.id)}
                        style={{
                          padding: '5px 12px',
                          borderRadius: '999px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          border: onlineStore.activeRecTab === tab.id ? '1px solid #00e5ff' : '1px solid #2a2e36',
                          background: onlineStore.activeRecTab === tab.id ? '#00e5ff' : '#0d0f12',
                          color: onlineStore.activeRecTab === tab.id ? '#0d0f12' : '#9ca3af'
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rec-cards-grid">
                  {onlineStore.smartRecommendations
                    .filter(r => onlineStore.activeRecTab === 'all' || r.group === onlineStore.activeRecTab)
                    .slice(0, 8)
                    .map(rec => {
                      const groupColor = rec.group === 'performance' ? '#00e67a' : (rec.group === 'qol' ? '#00e5ff' : (rec.group === 'synergy' ? '#b897f7' : '#ff8c42'));
                      return (
                        <div key={rec.id} className="rec-card">
                          <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                              <span style={{ color: '#f8f9fa', fontWeight: 700, fontSize: '14px' }}>{rec.title}</span>
                              <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 7px', borderRadius: '4px', background: `${groupColor}1f`, color: groupColor, border: `1px solid ${groupColor}44`, whiteSpace: 'nowrap' }}>
                                {rec.badge}
                              </span>
                            </div>
                            <p style={{ margin: 0, color: '#9ca3af', fontSize: '12px', lineHeight: 1.4 }}>{rec.reason}</p>
                          </div>
                          <button
                            onClick={() => onlineStore.applyQuickSearch(rec.query, '')}
                            style={{
                              marginTop: '8px',
                              width: '100%',
                              padding: '7px 10px',
                              borderRadius: '6px',
                              border: `1px solid ${groupColor}`,
                              background: 'transparent',
                              color: groupColor,
                              fontWeight: 700,
                              fontSize: '12px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '6px'
                            }}
                          >
                            <Search size={13} /> Buscar e Instalar
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* BUSCADOR Y FILTROS */}
            <div style={{ background: 'var(--bg-surface)', padding: 'var(--space-5)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)', marginBottom: 'var(--space-6)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '240px', position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <Search size={18} style={{ position: 'absolute', left: '14px', color: '#7a7f99', pointerEvents: 'none' }} />
                  <input
                    type="text"
                    placeholder="Buscar mod por nombre, autor o etiqueta (ej: Create, Sodium, JEI, Ice and Fire)..."
                    value={onlineStore.onlineSearchQuery}
                    onChange={(e) => onlineStore.setOnlineSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && onlineStore.handleSearchOnline()}
                    style={{
                      width: '100%',
                      padding: '12px 38px 12px 42px',
                      borderRadius: 'var(--radius-lg)',
                      border: '1px solid #3a3a64',
                      background: '#0d0f12',
                      color: '#f8f9fa',
                      outline: 'none',
                      fontSize: 'var(--text-md)'
                    }}
                  />
                  {onlineStore.onlineSearchQuery && (
                    <button
                      onClick={() => onlineStore.clearSearch()}
                      title="Limpiar búsqueda"
                      style={{ position: 'absolute', right: '10px', background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <select
                    title="Modloader para filtrar"
                    value={onlineStore.storeLoader}
                    onChange={(e) => onlineStore.setStoreLoader(e.target.value)}
                    style={{
                      background: '#0d0f12',
                      color: '#00e5ff',
                      border: '1px solid #3a3a64',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-lg)',
                      outline: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    <option value="forge">Forge</option>
                    <option value="fabric">Fabric</option>
                    <option value="neoforge">NeoForge</option>
                    <option value="quilt">Quilt</option>
                  </select>

                  <select
                    title="Versión de Minecraft para filtrar"
                    value={onlineStore.storeGameVersion}
                    onChange={(e) => onlineStore.setStoreGameVersion(e.target.value)}
                    style={{
                      background: '#0d0f12',
                      color: '#f8f9fa',
                      border: '1px solid #3a3a64',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-lg)',
                      outline: 'none',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    {Array.from(new Set([
                      onlineStore.storeGameVersion,
                      modpack.packInfo?.gameVersion,
                      '1.21.4', '1.21.1', '1.21', '1.20.4', '1.20.2', '1.20.1', '1.19.4', '1.19.2', '1.18.2', '1.16.5', '1.12.2'
                    ].filter(Boolean))).map(ver => (
                      <option key={ver} value={ver}>MC {ver}</option>
                    ))}
                  </select>
                </div>

                <button
                  onClick={() => onlineStore.handleSearchOnline()}
                  disabled={onlineStore.isSearchingOnline}
                  className="btn btn-primary"
                  style={{ padding: '0 22px', fontWeight: 700, cursor: onlineStore.isSearchingOnline ? 'wait' : 'pointer' }}
                >
                  {onlineStore.isSearchingOnline ? <><RefreshCw size={15} className="spin" /> Buscando...</> : <><Search size={15} /> Buscar</>}
                </button>
              </div>

              {/* CHIPS DE CATEGORÍAS */}
              <div className="category-filters">
                {[
                  { id: '', label: 'Todos' },
                  { id: 'optimization', label: 'Optimización / FPS' },
                  { id: 'technology', label: 'Tecnología' },
                  { id: 'magic', label: 'Magia' },
                  { id: 'adventure', label: 'Aventura y RPG' },
                  { id: 'worldgen', label: 'Generación de Mundo' },
                  { id: 'decoration', label: 'Decoración' },
                  { id: 'storage', label: 'Almacenamiento' },
                  { id: 'utility', label: 'Utilidad' },
                  { id: 'library', label: 'Librerías / API' },
                  { id: 'mobs', label: 'Criaturas / Mobs' },
                  { id: 'equipment', label: 'Armas y Armaduras' },
                  { id: 'food', label: 'Comida y Cultivos' }
                ].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => onlineStore.setModCategory(cat.id)}
                    className={`category-chip ${onlineStore.modCategory === cat.id ? 'active' : ''}`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* BARRA DE HERRAMIENTAS: FILTRO POR FUENTE, ORDEN Y VISTA */}
              <div className="store-toolbar">
                <div className="source-filter-group">
                  <span style={{ color: 'var(--text-muted)', fontSize: '12px', marginRight: '4px' }}>Plataforma:</span>
                  <button
                    onClick={() => onlineStore.setSourceFilter('all')}
                    className={`source-pill ${onlineStore.sourceFilter === 'all' ? 'active-all' : ''}`}
                  >
                    Todas ({onlineStore.liveSourceCounts.all})
                  </button>
                  <button
                    onClick={() => onlineStore.setSourceFilter('modrinth')}
                    className={`source-pill ${onlineStore.sourceFilter === 'modrinth' ? 'active-modrinth' : ''}`}
                  >
                    Modrinth ({onlineStore.liveSourceCounts.modrinth})
                  </button>
                  <button
                    onClick={() => onlineStore.setSourceFilter('curseforge')}
                    className={`source-pill ${onlineStore.sourceFilter === 'curseforge' ? 'active-curseforge' : ''}`}
                  >
                    CurseForge ({onlineStore.liveSourceCounts.curseforge})
                  </button>
                  {onlineStore.liveSourceCounts.both > 0 && (
                    <button
                      onClick={() => onlineStore.setSourceFilter('both')}
                      className={`source-pill ${onlineStore.sourceFilter === 'both' ? 'active-both' : ''}`}
                    >
                      En Ambas ({onlineStore.liveSourceCounts.both})
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px', cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={onlineStore.hideInstalled}
                      onChange={(e) => onlineStore.setHideInstalled(e.target.checked)}
                      style={{ accentColor: '#00e5ff', cursor: 'pointer' }}
                    />
                    Ocultar ya instalados
                  </label>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>Ordenar:</span>
                    <select
                      value={onlineStore.sortBy}
                      onChange={(e) => onlineStore.setSortBy(e.target.value)}
                      style={{ background: '#0d0f12', color: 'var(--text-primary)', border: '1px solid var(--border-default)', padding: '6px 10px', borderRadius: 'var(--radius-md)', outline: 'none', fontSize: '12px', cursor: 'pointer' }}
                    >
                      <option value="downloads">Más Descargados</option>
                      <option value="relevance">Relevancia</option>
                      <option value="popularity">Popularidad / Favoritos</option>
                      <option value="updated">Recién Actualizados</option>
                    </select>
                  </div>

                  <div style={{ display: 'flex', background: '#0d0f12', borderRadius: '8px', border: '1px solid var(--border-default)', overflow: 'hidden' }}>
                    <button
                      onClick={() => onlineStore.setViewMode('grid')}
                      style={{
                        padding: '6px 10px',
                        border: 'none',
                        background: onlineStore.viewMode === 'grid' ? '#00e5ff' : 'transparent',
                        color: onlineStore.viewMode === 'grid' ? '#0d0f12' : '#9ca3af',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Cuadrícula
                    </button>
                    <button
                      onClick={() => onlineStore.setViewMode('list')}
                      style={{
                        padding: '6px 10px',
                        border: 'none',
                        background: onlineStore.viewMode === 'list' ? '#00e5ff' : 'transparent',
                        color: onlineStore.viewMode === 'list' ? '#0d0f12' : '#9ca3af',
                        fontSize: '11px',
                        fontWeight: 700,
                        cursor: 'pointer'
                      }}
                    >
                      Lista
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* BANNER INFORMATIVO SI NO HAY MODPACK CARGADO O HAY AVISO DE RED */}
            {!modpack.packInfo && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px 16px', marginBottom: '16px', background: 'rgba(0, 229, 255, 0.08)', border: '1px solid rgba(0, 229, 255, 0.3)', borderRadius: '10px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', color: '#f8f9fa' }}>
                  Estás explorando la tienda en modo libre (<b>{onlineStore.storeLoader.toUpperCase()} {onlineStore.storeGameVersion}</b>). Para instalar mods directamente en una carpeta, carga tu modpack.
                </span>
                <button onClick={modpack.handleScanFolder} className="btn btn-primary" style={{ padding: '6px 14px', fontSize: '12px' }}>
                  <FolderOpen size={14} /> Cargar Modpack
                </button>
              </div>
            )}
            {onlineStore.searchError && (
              <div style={{ padding: '10px 16px', marginBottom: '16px', background: 'rgba(255, 196, 46, 0.1)', borderLeft: '4px solid #ffc42e', borderRadius: '6px', color: '#ffc42e', fontSize: '12px' }}>
                {onlineStore.searchError}
              </div>
            )}

            {/* RESULTADOS DE LA TIENDA */}
            {onlineStore.isSearchingOnline ? (
              <div className={onlineStore.viewMode === 'grid' ? 'store-grid' : 'store-list'}>
                {[1, 2, 3, 4, 5, 6].map(i => (
                  <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-4)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center' }}>
                    <div className="skeleton skeleton-avatar" style={{ width: '64px', height: '64px' }}></div>
                    <div style={{ flex: 1 }}>
                      <div className="skeleton skeleton-title"></div>
                      <div className="skeleton skeleton-text" style={{ width: '90%' }}></div>
                      <div className="skeleton skeleton-text" style={{ width: '50%' }}></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : onlineStore.filteredResults.length === 0 && onlineStore.hasSearched ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-10)', background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)' }}>
                <div style={{ fontSize: '32px', marginBottom: 'var(--space-3)', color: '#ffc42e' }}>[SIN COINCIDENCIAS]</div>
                <p style={{ fontSize: 'var(--text-lg)', color: '#f8f9fa', margin: '0 0 8px 0' }}>
                  No se encontraron mods para "{onlineStore.onlineSearchQuery || 'esta categoría'}" en {onlineStore.storeLoader.toUpperCase()} {onlineStore.storeGameVersion}.
                </p>
                <p style={{ fontSize: 'var(--text-sm)', margin: '0 0 16px 0' }}>
                  Prueba cambiando la versión de Minecraft o el Modloader en los selectores de arriba, o restablece los filtros.
                </p>
                <button onClick={onlineStore.clearSearch} className="btn btn-secondary" style={{ borderColor: '#00e5ff', color: '#00e5ff' }}>
                  Restablecer Búsqueda y Filtros
                </button>
              </div>
            ) : (
              <div className={onlineStore.viewMode === 'grid' ? 'store-grid' : 'store-list'}>
                {onlineStore.filteredResults.slice(0, onlineStore.visibleOnlineCount).map((mod) => {
                  const modSources = mod.sources || [mod.source || 'modrinth'];
                  const hasModrinth = modSources.includes('modrinth');
                  const hasCurseforge = modSources.includes('curseforge');
                  const isDownloading = Boolean(
                    onlineStore.downloadingMods[mod.project_id] ||
                    (mod.modrinth_id && onlineStore.downloadingMods[mod.modrinth_id]) ||
                    (mod.curseforge_id && onlineStore.downloadingMods[mod.curseforge_id])
                  );
                  const preferredSource = onlineStore.sourceFilter === 'curseforge' && hasCurseforge
                    ? 'curseforge'
                    : (onlineStore.sourceFilter === 'modrinth' && hasModrinth ? 'modrinth' : mod.source);

                  return (
                    <div
                      key={`${mod.source}_${mod.project_id}`}
                      className={`mod-card-v2 ${mod.installed ? 'is-installed' : ''}`}
                      onClick={() => { onlineStore.setSelectedMod(mod); onlineStore.setShowDetails(true); }}
                    >
                      <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                        <div style={{ width: '64px', height: '64px', borderRadius: '12px', background: '#0d0f12', border: '1px solid #2a2e36', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {mod.icon_url ? (
                            <img src={mod.icon_url} alt={mod.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <Box size={28} color="#00e5ff" />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8f9fa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                              {mod.title}
                            </h3>
                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexShrink: 0 }}>
                              {hasModrinth && (
                                <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: '#00e67a', color: '#0d0f12' }}>
                                  MODRINTH
                                </span>
                              )}
                              {hasCurseforge && (
                                <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: '#ff8c42', color: '#0d0f12' }}>
                                  CURSEFORGE
                                </span>
                              )}
                              {mod.installed && (
                                <span style={{ fontSize: '10px', fontWeight: 800, padding: '2px 6px', borderRadius: '4px', background: 'rgba(0, 230, 122, 0.16)', color: '#00e67a', border: '1px solid #00e67a' }}>
                                  INSTALADO
                                </span>
                              )}
                            </div>
                          </div>
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '6px' }}>
                            por <b style={{ color: '#d0d4e8' }}>{mod.author}</b>
                          </div>
                          <p className="mod-card-desc-clamp">{mod.description || 'Sin descripción disponible.'}</p>
                        </div>
                      </div>

                      {/* TAGS Y METADATOS + BOTÓN DE ACCIÓN */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', paddingTop: '10px', borderTop: '1px solid rgba(42, 46, 66, 0.6)', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0, flex: 1 }}>
                          {mod.categories?.length > 0 && (
                            <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                              {mod.categories.slice(0, 3).map((cat, idx) => (
                                <span key={idx} style={{ fontSize: '10px', padding: '2px 7px', borderRadius: '4px', background: '#0d0f12', color: '#b8bcd4', border: '1px solid #2a2e36', textTransform: 'capitalize' }}>
                                  {cat}
                                </span>
                              ))}
                            </div>
                          )}
                          <div style={{ display: 'flex', gap: '12px', fontSize: '11px', color: '#7a7f99', flexWrap: 'wrap' }}>
                            <span style={{ color: '#00e5ff', fontWeight: 600 }}>
                              <Download size={11} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                              {formatCompactNumber(mod.downloads)} descargas
                            </span>
                            {mod.updated_at && (
                              <span>Act: {formatRelativeDate(mod.updated_at)}</span>
                            )}
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                          {hasModrinth && hasCurseforge ? (
                            <>
                              <button
                                title="Elegir versión desde Modrinth"
                                onClick={() => onlineStore.handleSelectModVersions(mod.modrinth_id || mod.project_id, mod.title, 'modrinth', mod)}
                                disabled={isDownloading}
                                style={{
                                  background: '#00e67a',
                                  color: '#0d0f12',
                                  border: 'none',
                                  padding: '7px 11px',
                                  borderRadius: '6px',
                                  fontWeight: 700,
                                  fontSize: '11px',
                                  cursor: isDownloading ? 'wait' : 'pointer'
                                }}
                              >
                                {isDownloading ? '...' : 'MR'}
                              </button>
                              <button
                                title="Elegir versión desde CurseForge"
                                onClick={() => onlineStore.handleSelectModVersions(mod.curseforge_id || mod.project_id, mod.title, 'curseforge', mod)}
                                disabled={isDownloading}
                                style={{
                                  background: '#ff8c42',
                                  color: '#0d0f12',
                                  border: 'none',
                                  padding: '7px 11px',
                                  borderRadius: '6px',
                                  fontWeight: 700,
                                  fontSize: '11px',
                                  cursor: isDownloading ? 'wait' : 'pointer'
                                }}
                              >
                                {isDownloading ? '...' : 'CF'}
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => onlineStore.handleSelectModVersions(mod.project_id, mod.title, preferredSource, mod)}
                              disabled={isDownloading}
                              className={mod.installed ? 'btn btn-secondary' : 'btn btn-success'}
                              style={{
                                minWidth: '105px',
                                padding: '8px 14px',
                                fontSize: '12px',
                                borderColor: mod.installed ? '#00e67a' : undefined,
                                color: mod.installed ? '#00e67a' : undefined,
                                cursor: isDownloading ? 'wait' : 'pointer'
                              }}
                            >
                              {isDownloading ? 'Cargando...' : (mod.installed ? 'Reinstalar' : 'Instalar')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {!onlineStore.isSearchingOnline && onlineStore.visibleOnlineCount < onlineStore.filteredResults.length && (
              <div style={{ textAlign: 'center', marginTop: 'var(--space-6)' }}>
                <button
                  onClick={() => onlineStore.setVisibleOnlineCount(v => Math.min(v + 24, onlineStore.filteredResults.length))}
                  className="btn btn-primary"
                  style={{ padding: '10px 24px' }}
                >
                  <ChevronRight size={15} /> Cargar más mods ({onlineStore.filteredResults.length - onlineStore.visibleOnlineCount} restantes)
                </button>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 4: TWEAKS */}
        {activeTab === 'tweaks' && (
          <TweaksPanel
            packInfo={modpack.packInfo}
            modCatalog={modpack.modCatalog}
            tweaks={tweaks}
            optimization={optimization}
            onSearchKubeJSInStore={() => {
              if (onlineStore.applyQuickSearch) onlineStore.applyQuickSearch('KubeJS');
              else onlineStore.setOnlineSearchQuery('kubejs');
              setActiveTab('store');
            }}
            onOpenIde={() => setActiveTab('ide')}
          />
        )}

        {/* PESTAÑA 5: RENDIMIENTO */}
        {activeTab === 'performance' && (
          <div className="tab-content" style={{ padding: 'var(--space-10)', maxWidth: '900px', margin: '0 auto', paddingBottom: '100px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
              <div>
                <h2 style={{ color: '#ff8c42', margin: 0, fontSize: '28px' }}>Monitor de Rendimiento</h2>
                <p style={{ color: 'var(--text-secondary)', marginTop: 'var(--space-1)' }}>Análisis heurístico de carga para <b>{modpack.packInfo?.name || 'tu modpack'}</b>.</p>
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)', padding: 'var(--space-5)', marginBottom: 'var(--space-8)', display: 'flex', gap: 'var(--space-5)' }}>
              <div className="stat-card accent-primary">
                <div className="topbar-label" style={{ marginBottom: 'var(--space-2)' }}>PROCESADOR (CPU)</div>
                <div style={{ color: 'var(--text-primary)', fontSize: 'var(--text-md)', marginTop: 'var(--space-1)' }}>{performance.hardwareSpecs?.cpu ? `${performance.hardwareSpecs.cpu.manufacturer} ${performance.hardwareSpecs.cpu.brand}` : 'Escaneando...'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{performance.hardwareSpecs?.cpu?.logicalCores} Hilos Lógicos</div>
              </div>
              <div className="stat-card accent-success">
                <div className="topbar-label" style={{ marginBottom: 'var(--space-2)' }}>MEMORIA (RAM)</div>
                <div style={{ color: 'var(--text-primary)', fontSize: 'var(--text-xl)', marginTop: 'var(--space-1)' }}>{performance.hardwareSpecs?.ram ? `${performance.hardwareSpecs.ram.totalGB} GB Total` : 'Escaneando...'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{performance.hardwareSpecs?.ram ? `${performance.hardwareSpecs.ram.availableGB} GB Libres` : ''}</div>
              </div>
              <div className="stat-card accent-error">
                <div className="topbar-label" style={{ marginBottom: 'var(--space-2)' }}>GRÁFICOS (GPU)</div>
                <div style={{ color: 'var(--text-primary)', fontSize: 'var(--text-md)', marginTop: 'var(--space-1)' }}>{performance.hardwareSpecs?.gpu ? `${performance.hardwareSpecs.gpu.vendor} ${performance.hardwareSpecs.gpu.model}` : 'Buscando Dedicada...'}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{performance.hardwareSpecs?.gpu ? `${performance.hardwareSpecs.gpu.vramGB} GB VRAM` : ''}</div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <h3 style={{ color: 'var(--text-primary)', margin: 0 }}>Lista de Módulos Instalados ({performance.modsOrdenados.length})</h3>
              <button data-tooltip="Analiza el peso de cada mod según su tamaño, tipo y cantidad de archivos de configuración." onClick={handleCalculateImpact} disabled={performance.isCalculatingImpact || performance.modsOrdenados.length === 0} className="btn btn-warning" style={{ cursor: performance.isCalculatingImpact ? 'wait' : 'pointer' }}>
                {performance.isCalculatingImpact ? 'Analizando Archivos...' : 'Calcular Peso Heurístico'}
              </button>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', marginBottom: 'var(--space-4)' }}>
              <input
                type="text"
                placeholder="Buscar mod por nombre..."
                value={performanceSearch}
                onChange={e => setPerformanceSearch(e.target.value)}
                className="input"
                style={{ flex: 1, color: 'var(--text-primary)' }}
              />
              {performanceSearch && (
                <span style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', whiteSpace: 'nowrap' }}>
                  {(() => {
                    const filteredCount = performance.modsOrdenados.filter(m => m.label.toLowerCase().includes(performanceSearch.toLowerCase())).length;
                    return `${filteredCount} resultado${filteredCount === 1 ? '' : 's'}`;
                  })()}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {performance.modsOrdenados
                .filter(mod => !performanceSearch || mod.label.toLowerCase().includes(performanceSearch.toLowerCase()))
                .map((mod) => {
                  const originalIndex = performance.modsOrdenados.indexOf(mod);
                  const { hasImpact, isOpt, color, barWidth } = performance.modImpactStyles[originalIndex] || {};
                  return (
                    <div key={mod.id} style={{ background: 'var(--bg-surface)', padding: 'var(--space-4) var(--space-5)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
                      <div style={{ width: '250px', flexShrink: 0 }}>
                        <div style={{ color: 'var(--text-primary)', fontWeight: 'bold', fontSize: 'var(--text-md)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{mod.label}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 'var(--text-xs)' }}>{!hasImpact ? 'Pendiente de cálculo' : (isOpt ? 'Módulo de Optimización' : 'Módulo de Contenido')}</div>
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--space-1)', fontSize: 'var(--text-xs)' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Impacto Proyectado</span>
                          <span style={{ color, fontWeight: 'bold' }}>{!hasImpact ? '-- pts' : (isOpt ? 'REDUCE CARGA' : `${mod.impact} pts`)}</span>
                        </div>
                        <div className="progress-bar">
                          <div className="progress-bar-fill" style={{ width: `${barWidth}%`, background: isOpt ? 'linear-gradient(90deg, var(--bg-surface), var(--accent-success))' : color }} />
                        </div>
                      </div>
                      <button
                        data-tooltip={`Eliminar ${mod.label} del modpack`}
                        onClick={() => handleDeleteMod(mod.id)}
                        className="btn"
                        style={{
                          background: 'transparent',
                          color: 'var(--accent-error)',
                          border: '1px solid var(--accent-error)',
                          padding: '8px 12px',
                          flexShrink: 0,
                          fontSize: 'var(--text-sm)'
                        }}
                      >
                        Eliminar
                      </button>
                    </div>
                  );
                })}
              {performance.modsOrdenados.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-10)' }}>No hay mods cargados en el ecosistema.</div>
              )}
              {performance.modsOrdenados.length > 0 && performance.modsOrdenados.filter(mod => !performanceSearch || mod.label.toLowerCase().includes(performanceSearch.toLowerCase())).length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-8)' }}>Sin resultados para "{performanceSearch}".</div>
              )}
            </div>
          </div>
        )}

        {/* PESTAÑA 6: EDITOR IDE */}
        {activeTab === 'ide' && (
          <div className="tab-content" style={{ width: '100%', height: 'calc(100vh - 112px)' }}>
            <ScriptEditor packPath={modpack.packInfo?.path} />
          </div>
        )}

      </div>

      {/* ATAJOS DE TECLADO */}
      {showShortcuts && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(17, 17, 27, 0.85)', backdropFilter: 'blur(6px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }} onClick={() => setShowShortcuts(false)}>
          <div className="animate-modal" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-2xl)', width: '580px', maxHeight: '80vh', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: 'var(--space-5) var(--space-6)', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                <div style={{ background: 'var(--accent-secondary)', color: 'var(--text-inverse)', width: '32px', height: '32px', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Sparkles size={18} />
                </div>
                <h2 style={{ margin: 0, fontSize: 'var(--text-xl)', color: 'var(--text-primary)' }}>Atajos de Teclado</h2>
              </div>
              <button onClick={() => setShowShortcuts(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '20px' }}>x</button>
            </div>
            <div style={{ padding: 'var(--space-5) var(--space-6)', overflowY: 'auto', maxHeight: 'calc(80vh - 70px)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
              <div>
                <h4 style={{ color: 'var(--accent-secondary)', margin: '0 0 var(--space-3) 0', fontSize: 'var(--text-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>General</h4>
                <ShortcutRow keys="Ctrl+K" desc="Mostrar/Ocultar ayuda de atajos" />
                <ShortcutRow keys="Ctrl+O" desc="Abrir carpeta de modpack" />
                <ShortcutRow keys="Ctrl+E" desc="Exportar modpack a ZIP" />
                <ShortcutRow keys="Ctrl+S" desc="Guardar archivo de configuración" />
                <ShortcutRow keys="Esc" desc="Cerrar modal / Cancelar" />
              </div>
              <div>
                <h4 style={{ color: 'var(--accent-secondary)', margin: '0 0 var(--space-3) 0', fontSize: 'var(--text-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Navegación</h4>
                <ShortcutRow keys="1-6" desc="Ir a pestaña (Ecosistema, Config, Tienda...)" />
                <ShortcutRow keys="Ctrl+F" desc="Buscar en lista de archivos" />
                <ShortcutRow keys="Tab" desc="Siguiente campo de entrada" />
              </div>
              <div>
                <h4 style={{ color: 'var(--accent-secondary)', margin: '0 0 var(--space-3) 0', fontSize: 'var(--text-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Grafo de Mods</h4>
                <ShortcutRow keys="Scroll" desc="Zoom in/out" />
                <ShortcutRow keys="Click + Arrastrar" desc="Mover el grafo" />
                <ShortcutRow keys="Doble Click" desc="Abrir contenido del mod" />
              </div>
              <div>
                <h4 style={{ color: 'var(--accent-secondary)', margin: '0 0 var(--space-3) 0', fontSize: 'var(--text-sm)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Tienda</h4>
                <ShortcutRow keys="Enter" desc="Buscar en la tienda" />
                <ShortcutRow keys="Click en resultado" desc="Ver detalles del mod" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && toast.show && (
        <div style={{
          position: 'fixed', bottom: '30px', right: '30px', zIndex: 9999,
          background: toast.type === 'success' ? 'linear-gradient(135deg, #00e67a 0%, #40a02b 100%)' :
            toast.type === 'loading' ? 'linear-gradient(135deg, #00e5ff 0%, #1e66f5 100%)' :
              'linear-gradient(135deg, #ff4d6a 0%, #d20f39 100%)',
          color: '#0d0f12', padding: '18px 24px', borderRadius: '14px',
          boxShadow: '0 10px 40px rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', gap: '15px',
          animation: 'slide-in-right 0.5s var(--ease-out)'
        }}>
          <span className="toast-icon">
            {toast.type === 'success' ? <CheckCircle size={28} /> :
             toast.type === 'loading' ? <Loader2 size={28} className="spin" /> :
             <AlertTriangle size={28} />}
          </span>
          <div>
            <div className="toast-title">{toast.title}</div>
            <div className="toast-message">{toast.message}</div>
          </div>
        </div>
      )}
    </div>
  );
}