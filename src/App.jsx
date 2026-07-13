import { useState, useCallback, useMemo, useEffect, useRef, memo } from 'react';
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
import { useModpack } from './hooks/useModpack';
import { useModSearch } from './hooks/useModSearch';
import { useOnlineStore } from './hooks/useOnlineStore';
import { useTweaks } from './hooks/useTweaks';
import { usePerformance } from './hooks/usePerformance';
import { useDiagnosis } from './hooks/useDiagnosis';
import { useOptimization } from './hooks/useOptimization';
import { useToast } from './hooks/useToast';

const useRipple = () => {
  const handleRipple = useCallback((e) => {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const wave = document.createElement('span');
    wave.className = 'ripple-wave';
    wave.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px;`;
    btn.appendChild(wave);
    wave.addEventListener('animationend', () => wave.remove());
  }, []);
  return handleRipple;
};

const nodeTypes = { mod: ModNode, group: GroupNode };

const ShortcutRow = ({ keys, desc }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-2) 0', borderBottom: '1px solid var(--border-subtle)' }}>
    <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>{desc}</span>
    <kbd style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)', borderRadius: 'var(--radius-sm)', padding: '2px 8px', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>{keys}</kbd>
  </div>
);

const AutocompleteInput = memo(({ value, onChange, availableIds, placeholder, colorClass }) => {
  const [showDropdown, setShowDropdown] = useState(false);
  const suggestions = useMemo(() => {
    if (value.length <= 2) return [];
    const lower = value.toLowerCase();
    return availableIds.filter(id => id.toLowerCase().includes(lower)).slice(0, 50);
  }, [value, availableIds]);

  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text" placeholder={placeholder} value={value}
        onChange={(e) => { onChange(e.target.value.toLowerCase()); setShowDropdown(true); }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
        onFocus={() => setShowDropdown(true)}
        className="input input-mono"
        style={{ marginTop: '8px', color: colorClass }}
      />
      {showDropdown && suggestions.length > 0 && (
        <ul style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--bg-surface)', border: '1px solid var(--accent-secondary)', borderRadius: 'var(--radius-md)', zIndex: 'var(--z-dropdown)', maxHeight: '250px', overflowY: 'auto', padding: 0, margin: '4px 0 0 0', listStyle: 'none', boxShadow: 'var(--shadow-lg)' }}>
          {suggestions.map((s, i) => (
            <li
              key={i}
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setShowDropdown(false); }}
              style={{ padding: '10px 15px', cursor: 'pointer', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-subtle)', fontSize: 'var(--text-sm)' }}
              onMouseEnter={e => e.target.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.target.style.background = 'transparent'}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
});

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
  const { toast, showToast } = useToast();
  const modpack = useModpack();
  const modSearch = useModSearch(modpack.nodes, modpack.rfInstance);
  const onlineStore = useOnlineStore(modpack.packInfo);
  const tweaks = useTweaks(modpack.packInfo, modpack.availableIds, showToast);
  const performance = usePerformance(modpack.nodes);
  const diagnosis = useDiagnosis();
  const optimization = useOptimization(modpack.packInfo, showToast);
  const [activeTab, setActiveTab] = useState('mods');
  const [graphZoom, setGraphZoom] = useState(1);
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
            ? { ...node, style: { ...node.style, border: '3px solid #f38ba8', boxShadow: '0 0 20px rgba(243, 139, 168, 0.8)' } }
            : { ...node, style: { ...node.style, border: '2px solid #a6e3a1', boxShadow: '0 0 10px rgba(166, 227, 161, 0.3)' } };
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

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#11111b', color: '#cdd6f4', fontFamily: 'sans-serif', overflow: 'hidden' }}>
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
        <div style={{ position: 'absolute', inset: 0, zIndex: 3000, background: '#11111b', display: 'flex' }}>
          {modpack.sidebarFiles && (
            <div className="animate-tab" style={{ width: '280px', background: '#181825', borderRight: '1px solid #313244', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <div style={{ padding: '15px', borderBottom: '1px solid #313244', color: '#89b4fa', fontSize: '13px', fontWeight: 'bold', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>[DIR] {modpack.sidebarFiles.title.toUpperCase()}</span>
                <button onClick={() => { modpack.setSidebarFiles(null); modpack.setEditingConfig(null); }} style={{ background: 'transparent', border: 'none', color: '#f38ba8', cursor: 'pointer', fontSize: '16px' }}>x</button>
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
                      padding: '10px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', color: '#cdd6f4',
                      background: modpack.editingConfig?.name === shortName ? '#313244' : 'transparent',
                      borderLeft: modpack.editingConfig?.name === shortName ? '3px solid #89b4fa' : '3px solid transparent',
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#6c7086', flexDirection: 'column', gap: '15px' }}>
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
          <div className="animate-modal" style={{ background: '#1e1e2e', border: '2px solid #a6e3a1', borderRadius: '12px', width: '450px', padding: '30px', boxShadow: '0 10px 40px rgba(0,0,0,0.8)' }}>
            <h2 style={{ color: '#a6e3a1', marginTop: 0 }}>Crear Entorno Virtual</h2>
            <p style={{ color: '#a6adc8', fontSize: '14px', marginBottom: '25px' }}>Configura los parámetros base de tu nuevo Modpack.</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
              <div>
                <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Nombre del Proyecto</label>
                <input type="text" value={modpack.newProjectData.name} onChange={e => modpack.setNewProjectData({ ...modpack.newProjectData, name: e.target.value })} placeholder="Ej: Mi Aventura RPG" style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', outline: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Versión de Minecraft</label>
                  <select value={modpack.newProjectData.mcVersion} onChange={e => modpack.setNewProjectData({ ...modpack.newProjectData, mcVersion: e.target.value })} style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', outline: 'none', cursor: 'pointer' }}>
                    {modpack.availableGameVersions.length > 0 ? modpack.availableGameVersions.map(v => <option key={v.version} value={v.version}>{v.version}</option>) : <option value="1.20.1">Cargando versiones...</option>}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Mod Loader</label>
                  <select value={modpack.newProjectData.loader} onChange={e => modpack.setNewProjectData({ ...modpack.newProjectData, loader: e.target.value })} style={{ width: '100%', padding: '10px', marginTop: '5px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', outline: 'none', cursor: 'pointer' }}>
                    <option value="Forge">Forge</option><option value="Fabric">Fabric</option><option value="NeoForge">NeoForge</option><option value="Quilt">Quilt</option>
                  </select>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '30px' }}>
              <button onClick={() => modpack.setIsCreatingProject(false)} style={{ background: '#313244', color: '#cdd6f4', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={modpack.handleConfirmCreateProject} style={{ background: '#a6e3a1', color: '#11111b', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Elegir Carpeta y Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SELECTOR DE VERSIONES */}
      {onlineStore.versionSelectorModal && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: 'rgba(17, 17, 27, 0.8)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="animate-modal" style={{ background: 'linear-gradient(135deg, #1b1e2a 0%, #2a2f62 100%)', border: '2px solid #89b4fa', borderRadius: '14px', width: '520px', maxHeight: '72vh', display: 'flex', flexDirection: 'column', boxShadow: '0 14px 40px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #313244', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, color: '#cba6f7' }}>Instalar: {onlineStore.versionSelectorModal.title}</h3>
              <button onClick={() => onlineStore.setVersionSelectorModal(null)} style={{ background: 'transparent', border: 'none', color: '#f38ba8', fontSize: '20px', cursor: 'pointer' }}>x</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <p style={{ margin: '0 0 10px 0', color: '#a6adc8', fontSize: '14px' }}>Selecciona la versión para Minecraft <b>{modpack.packInfo?.gameVersion}</b>:</p>
              {onlineStore.versionSelectorModal.versions.map(v => (
                <div key={v.id} style={{ background: '#11111b', border: '1px solid #313244', padding: '15px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ color: '#cdd6f4', fontWeight: 'bold' }}>{v.name}</div>
                    <div style={{ color: '#6c7086', fontSize: '12px' }}>Actualizado: {v.date}</div>
                    {v.dependencies.length > 0 && <div style={{ color: '#f9e2af', fontSize: '12px', marginTop: '5px' }}>[!] Requiere {v.dependencies.length} dependencia(s).</div>}
                  </div>
                  <button onClick={() => handleConfirmDownload(v)} style={{ background: '#89b4fa', color: '#11111b', border: 'none', padding: '8px 15px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>Descargar</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* MODAL: REPORTE DE DIAGNÓSTICO */}
      {diagnosis.diagnosticReport && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 3000, background: 'rgba(17, 17, 27, 0.9)', backdropFilter: 'blur(5px)', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          <div className="animate-modal" style={{ background: '#1e1e2e', border: `2px solid ${diagnosis.diagnosticReport.errors.length > 0 ? '#f38ba8' : '#a6e3a1'}`, borderRadius: '12px', width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.8)', overflow: 'hidden' }}>
            <div style={{ padding: '20px', borderBottom: '1px solid #313244', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#181825' }}>
              <h2 style={{ margin: 0, color: diagnosis.diagnosticReport.errors.length > 0 ? '#f38ba8' : '#a6e3a1', display: 'flex', alignItems: 'center', gap: '10px' }}>
                {diagnosis.diagnosticReport.errors.length > 0 ? '[x] Conflictos Detectados' : '[OK] Pack Saludable'}
              </h2>
              <button onClick={() => diagnosis.setDiagnosticReport(null)} style={{ background: 'transparent', border: 'none', color: '#a6adc8', fontSize: '20px', cursor: 'pointer' }}>x</button>
            </div>
            <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', gap: '15px', justifyContent: 'space-between' }}>
                <div style={{ background: '#11111b', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center', border: '1px solid #313244' }}>
                  <div style={{ color: '#cdd6f4', fontSize: '24px', fontWeight: 'bold' }}>{diagnosis.diagnosticReport.total}</div>
                  <div style={{ color: '#a6adc8', fontSize: '12px' }}>Total Mods</div>
                </div>
                <div style={{ background: '#11111b', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center', border: '1px solid #a6e3a1' }}>
                  <div style={{ color: '#a6e3a1', fontSize: '24px', fontWeight: 'bold' }}>{diagnosis.diagnosticReport.okCount}</div>
                  <div style={{ color: '#a6e3a1', fontSize: '12px' }}>Mods Válidos</div>
                </div>
                <div style={{ background: '#11111b', padding: '15px', borderRadius: '8px', flex: 1, textAlign: 'center', border: '1px solid #f38ba8' }}>
                  <div style={{ color: '#f38ba8', fontSize: '24px', fontWeight: 'bold' }}>{diagnosis.diagnosticReport.errors.length}</div>
                  <div style={{ color: '#f38ba8', fontSize: '12px' }}>Errores Críticos</div>
                </div>
              </div>
              {diagnosis.diagnosticReport.weightReport && (
                <div style={{ background: '#181825', borderRadius: '12px', border: '1px solid #313244', padding: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <h3 style={{ margin: 0, color: '#fab387', fontSize: '16px' }}>Peso del Modpack</h3>
                    <span style={{ fontSize: '24px', fontWeight: 'bold', color: diagnosis.diagnosticReport.weightReport.score <= 3 ? '#a6e3a1' : diagnosis.diagnosticReport.weightReport.score <= 5 ? '#f9e2af' : diagnosis.diagnosticReport.weightReport.score <= 7 ? '#fab387' : '#f38ba8' }}>
                      {diagnosis.diagnosticReport.weightReport.score}/10
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '12px' }}>
                    {[1,2,3,4,5,6,7,8,9,10].map(i => {
                      const color = i <= diagnosis.diagnosticReport.weightReport.score
                        ? (diagnosis.diagnosticReport.weightReport.score <= 3 ? '#a6e3a1' : diagnosis.diagnosticReport.weightReport.score <= 5 ? '#f9e2af' : diagnosis.diagnosticReport.weightReport.score <= 7 ? '#fab387' : '#f38ba8')
                        : '#313244';
                      return <div key={i} style={{ flex: 1, height: '8px', background: color, borderRadius: '4px' }} />;
                    })}
                  </div>
                  <div style={{ color: '#6c7086', fontSize: '13px', textAlign: 'center', marginBottom: '15px' }}>
                    {diagnosis.diagnosticReport.weightReport.score <= 3 ? '[OK] Ligero — Excelente rendimiento' :
                     diagnosis.diagnosticReport.weightReport.score <= 5 ? '[WARN] Moderado — Rendimiento aceptable' :
                     diagnosis.diagnosticReport.weightReport.score <= 7 ? '[WARN] Pesado — Considera optimizar' :
                     '[ERROR] Muy pesado — Se recomienda optimizar'}
                  </div>
                  <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <div style={{ background: '#11111b', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #313244' }}>
                      <div style={{ color: '#cdd6f4', fontSize: '18px', fontWeight: 'bold' }}>Mods: {diagnosis.diagnosticReport.weightReport.totalMods}</div>
                      <div style={{ color: '#a6adc8', fontSize: '11px' }}>Mods</div>
                    </div>
                    <div style={{ background: '#11111b', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #313244' }}>
                      <div style={{ color: '#89b4fa', fontSize: '18px', fontWeight: 'bold' }}>{diagnosis.diagnosticReport.weightReport.totalSizeMB} MB</div>
                      <div style={{ color: '#a6adc8', fontSize: '11px' }}>Peso Total</div>
                    </div>
                    <div style={{ background: '#11111b', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #a6e3a1' }}>
                      <div style={{ color: '#a6e3a1', fontSize: '18px', fontWeight: 'bold' }}>Opt: {diagnosis.diagnosticReport.weightReport.optimizationCount}</div>
                      <div style={{ color: '#a6adc8', fontSize: '11px' }}>Optimización</div>
                    </div>
                    <div style={{ background: '#11111b', padding: '10px 16px', borderRadius: '8px', textAlign: 'center', border: '1px solid #f38ba8' }}>
                      <div style={{ color: '#f38ba8', fontSize: '18px', fontWeight: 'bold' }}>Heavy: {diagnosis.diagnosticReport.weightReport.heavyCount}</div>
                      <div style={{ color: '#a6adc8', fontSize: '11px' }}>Mods Pesados</div>
                    </div>
                  </div>
                </div>
              )}
              {diagnosis.diagnosticReport.errors.length > 0 && (
                <div>
                  <h3 style={{ color: '#f38ba8', margin: '0 0 10px 0', fontSize: '16px' }}>Errores que causarán crasheos:</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {diagnosis.diagnosticReport.errors.map((err, i) => (
                      <div key={i} style={{ background: 'rgba(243, 139, 168, 0.1)', borderLeft: '4px solid #f38ba8', padding: '10px 15px', color: '#cdd6f4', fontSize: '14px', borderRadius: '0 6px 6px 0' }}>{err}</div>
                    ))}
                  </div>
                </div>
              )}
              {diagnosis.diagnosticReport.warnings.length > 0 && (
                <div>
                  <h3 style={{ color: '#f9e2af', margin: '0 0 10px 0', fontSize: '16px' }}>Advertencias (Desconocidos):</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {diagnosis.diagnosticReport.warnings.map((warn, i) => (
                      <div key={i} style={{ background: 'rgba(249, 226, 175, 0.05)', borderLeft: '4px solid #f9e2af', padding: '10px 15px', color: '#a6adc8', fontSize: '13px', borderRadius: '0 6px 6px 0' }}>{warn}</div>
                    ))}
                  </div>
                </div>
              )}
              {diagnosis.diagnosticReport.errors.length === 0 && diagnosis.diagnosticReport.warnings.length === 0 && (
                <div style={{ textAlign: 'center', color: '#a6adc8', padding: '20px 0' }}>Todo parece estar en perfecto orden. ¡Listo para exportar y jugar!</div>
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
            background: 'transparent', color: '#cdd6f4', border: 'none',
            padding: '10px 15px', cursor: 'pointer', display: 'flex', gap: '10px', alignItems: 'center', fontSize: '14px', borderRadius: '4px', transition: 'background 0.2s'
          }}
            onMouseEnter={(e) => e.target.style.background = '#313244'}
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
            <button onClick={() => setShowShortcuts(true)} className="btn btn-secondary" style={{ background: '#313244', border: '1px solid #45475a', fontSize: '12px', padding: '6px 10px' }}>
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
              <button data-tooltip="Detecta versiones incompatibles, dependencias faltantes y conflictos" onClick={handleDiagnosePack} disabled={diagnosis.isDiagnosing} className="btn" style={{ background: diagnosis.isDiagnosing ? '#f9e2af' : '#89dceb', color: '#11111b', boxShadow: '0 0 10px rgba(137, 220, 235, 0.4)', cursor: diagnosis.isDiagnosing ? 'wait' : 'pointer' }}>
                {diagnosis.isDiagnosing ? <><RefreshCw size={15} className="spin" /> Analizando...</> : <><Activity size={15} /> Diagnosticar</>}
              </button>
            </div>
          )}
        </div>
        <div className="topbar-secondary">
          {[
            { key: 'mods', label: 'Ecosistema', icon: Box, color: '#cba6f7', tip: 'Vista de grafo con todos los mods y sus conexiones' },
            { key: 'global', label: 'Config. Gral', icon: Settings2, color: '#cba6f7', tip: 'Archivos de configuración generales del modpack' },
            { key: 'store', label: 'Tienda', icon: ShoppingCart, color: '#cba6f7', tip: 'Buscar y descargar mods desde CurseForge y Modrinth' },
            { key: 'tweaks', label: 'Tweaks', icon: Wrench, color: '#f5c2e7', tip: 'Balanceo de ítems y entidades (KubeJS)' },
            { key: 'performance', label: 'Rendimiento', icon: Gauge, color: '#fab387', tip: 'Análisis de rendimiento y detección de cuellos de botella' },
            { key: 'ide', label: 'Editor IDE', icon: Code2, color: '#a6e3a1', tip: 'Editor avanzado de scripts y configuraciones' },
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button key={tab.key} data-tooltip={tab.tip} onClick={() => setActiveTab(tab.key)} style={{
                background: activeTab === tab.key ? '#313244' : 'transparent',
                color: activeTab === tab.key ? tab.color : '#a6adc8',
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div className="animate-modal" style={{ width: '720px', maxHeight: '80vh', overflowY: 'auto', background: '#1e1e2e', border: '2px solid #cba6f7', borderRadius: '12px', padding: '16px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #313244', paddingBottom: 8 }}>
              <h3 style={{ margin: 0, color: '#cba6f7' }}>{onlineStore.selectedMod.title}</h3>
              <button onClick={() => onlineStore.setShowDetails(false)} style={{ background: 'transparent', border: '1px solid #313244', color: '#cdd6f4', borderRadius: 6, padding: '6px 10px', cursor: 'pointer' }}>Cerrar</button>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
              {onlineStore.selectedMod.icon_url && <img src={onlineStore.selectedMod.icon_url} alt={onlineStore.selectedMod.title} style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8 }} />}
              <div style={{ flex: 1 }}>
                <p style={{ color: '#a6adc8' }}>{onlineStore.selectedMod.description}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {onlineStore.selectedMod.author && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Autor: {onlineStore.selectedMod.author}</span>}
                  {onlineStore.selectedMod.version && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Versión: {String(onlineStore.selectedMod.version)}</span>}
                  {onlineStore.selectedMod.loaders?.length > 0 && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Loaders: {onlineStore.selectedMod.loaders.join(', ')}</span>}
                  {onlineStore.selectedMod.categories?.length > 0 && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Tags: {onlineStore.selectedMod.categories.join(' / ')}</span>}
                  {onlineStore.selectedMod.license && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Licencia: {onlineStore.selectedMod.license}</span>}
                  {onlineStore.selectedMod.dependencies?.length > 0 && <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, background: '#1e1e2e', border: '1px solid #313244' }}>Dep: {onlineStore.selectedMod.dependencies.map(d => d.project_id || d.name || d).join(', ')}</span>}
                </div>
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
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 50, display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderRadius: 8, background: 'rgba(20,20,40,0.9)', border: '1px solid #313244' }}>
              <button onClick={() => { if (modpack.rfInstance?.setViewport) { const newZoom = Math.min(3, graphZoom + 0.1); setGraphZoom(newZoom); modpack.rfInstance.setViewport({ x: 0, y: 0, zoom: newZoom }, 150); } }} title="Zoom in" style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#2d2f68', color: '#fff', cursor: 'pointer' }}>+</button>
              <button onClick={() => { if (modpack.rfInstance?.setViewport) { const newZoom = Math.max(0.2, graphZoom - 0.1); setGraphZoom(newZoom); modpack.rfInstance.setViewport({ x: 0, y: 0, zoom: newZoom }, 150); } }} title="Zoom out" style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#2d2f68', color: '#fff', cursor: 'pointer' }}>−</button>
              <button onClick={() => modpack.rfInstance?.fitView?.()} title="Ajustar Vista" style={{ padding: '6px 10px', borderRadius: 6, border: 'none', background: '#4a5bd4', color: '#fff', cursor: 'pointer' }}>Fit</button>
              <span style={{ color: '#cdd6f4', fontSize: 12 }}>Zoom</span>
              <input type="range" min={0.2} max={2.5} step={0.05} value={graphZoom} onChange={(e) => { const v = parseFloat(e.target.value); setGraphZoom(v); if (modpack.rfInstance?.setViewport) modpack.rfInstance.setViewport({ x: 0, y: 0, zoom: v }, 0); }} style={{ width: 120 }} />
            </div>
            {modpack.nodes.length > 0 && (
              <div style={{ position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 10, width: '400px' }}>
                <input type="text" placeholder="Buscar... (Enter para focalizar)" value={modSearch.searchMods} onChange={(e) => modSearch.setSearchMods(e.target.value)} onKeyDown={modSearch.handleSearchKeyDown} style={{
                  width: '100%', padding: '12px 20px', borderRadius: '30px', border: '1px solid #cba6f7', background: 'rgba(24, 24, 37, 0.8)',
                  color: '#cdd6f4', outline: 'none', fontSize: '14px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)'
                }} />
              </div>
            )}
            <ReactFlow nodes={modSearch.displayNodes} edges={modpack.edges} onNodesChange={modpack.onNodesChange} onInit={modpack.setRfInstance} onEdgesChange={modpack.onEdgesChange} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={2.5}
              onNodeContextMenu={modpack.onNodeContextMenu} onPaneClick={modpack.onPaneClick} onNodeClick={onNodeClick}
              onNodesDelete={handleNodesDelete} onNodeDoubleClick={onNodeDoubleClick}>
              <Background color="#313244" variant="dots" gap={25} size={1} />
              <Controls />
              <MiniMap nodeColor="#cba6f7" maskColor="rgba(30, 30, 46, 0.7)" style={{ background: '#11111b' }} />
            </ReactFlow>
          </div>
        )}

        {/* PESTAÑA 2: ARCHIVOS GLOBALES */}
        {activeTab === 'global' && (
          <div className="tab-content" style={{ padding: 'var(--space-10)', maxWidth: '800px', margin: '0 auto', paddingBottom: '100px' }}>
            <h2>Configuraciones Globales</h2>
            <p style={{ color: '#a6adc8', marginBottom: '20px' }}>Estructura del directorio detectado en {modpack.packInfo?.name}</p>
            {modpack.rootFiles.length > 0 && (
              <input type="text" placeholder="Buscar (Extensión o Función)..." value={modSearch.searchTerm} onChange={(e) => modSearch.setSearchTerm(e.target.value)} style={{ width: '100%', padding: '12px 15px', marginBottom: '20px', borderRadius: '8px', border: '1px solid #313244', background: '#181825', color: '#cdd6f4', outline: 'none', fontSize: '14px', boxSizing: 'border-box' }} />
            )}
            <div style={{ background: '#181825', padding: '20px', borderRadius: '12px', border: '1px solid #313244' }}>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {modpack.rootFiles.length > 0 ? (
                  filteredFiles.length > 0 ? filteredFiles.map((file, i) => (
                    <li key={i} style={{ marginBottom: '12px', padding: '12px', background: '#11111b', borderRadius: '8px', border: '1px solid #313244', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <b style={{ color: '#cba6f7' }}>{file.includes('.') ? '[FILE]' : '[DIR]'} {file}</b>
                        </div>
                        <p style={{ margin: 0, color: '#a6adc8', fontSize: '13px', fontStyle: 'italic' }}>{analyzeFilePurpose(file)}</p>
                      </div>
                      <button onClick={() => handleOpenGlobalFile(file)} style={{ background: '#89b4fa', color: '#11111b', border: 'none', padding: '8px 15px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'transform 0.1s', flexShrink: 0 }}>Abrir</button>
                    </li>
                  )) : <li style={{ color: '#f38ba8', textAlign: 'center', padding: '20px' }}>Cero coincidencias de búsqueda.</li>
                ) : <li style={{ color: '#f38ba8', textAlign: 'center', padding: '20px' }}>Directorio vacío.</li>}
              </ul>
            </div>
          </div>
        )}

        {/* PESTAÑA 3: TIENDA */}
        {activeTab === 'store' && (
          <div className="tab-content" style={{ padding: 'var(--space-10)', paddingBottom: '100px', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 'var(--space-5)' }}>
              <div>
                <h2 style={{ color: 'var(--accent-secondary)', margin: 0 }}>Vitrina de Mods</h2>
                <p style={{ color: 'var(--text-secondary)', margin: 'var(--space-1) 0 0 0' }}>Descubre e instala mods para <b>{modpack.packInfo?.loader} {modpack.packInfo?.gameVersion}</b>.</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>Ordenar por:</span>
                <select value={onlineStore.sortBy} onChange={(e) => onlineStore.setSortBy(e.target.value)} style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-default)', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', outline: 'none' }}>
                  <option value="downloads">Mas Descargados</option><option value="relevance">Relevancia</option><option value="updated">Recien Actualizados</option>
                </select>
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
                      <button onClick={onlineStore.refreshApiStatus} style={{ background: 'transparent', border: '1px solid var(--accent-secondary)', color: 'var(--accent-secondary)', padding: '2px 6px', borderRadius: 'var(--radius-xs)', cursor: 'pointer', fontSize: '10px', marginLeft: 'var(--space-1)' }} title="Revisar estado">⟳</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div style={{ background: 'var(--bg-surface)', padding: 'var(--space-4)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)', marginBottom: 'var(--space-8)' }}>
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
                <input type="text" placeholder="Buscar por nombre (ej: Create, JEI)..." value={onlineStore.onlineSearchQuery} onChange={(e) => onlineStore.setOnlineSearchQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && onlineStore.handleSearchOnline()} style={{ flex: 1, padding: 'var(--space-3) var(--space-4)', borderRadius: 'var(--radius-lg)', border: '1px solid #3a3a64', background: '#141522', color: '#e8eaff', outline: 'none', fontSize: 'var(--text-md)', transition: 'border var(--duration-fast) var(--ease-out)' }} />
                <button onClick={onlineStore.handleSearchOnline} disabled={onlineStore.isSearchingOnline} className="btn btn-secondary" style={{ background: 'var(--accent-secondary)', color: 'var(--text-inverse)', cursor: onlineStore.isSearchingOnline ? 'wait' : 'pointer' }}>
                  {onlineStore.isSearchingOnline ? 'Buscando...' : 'Buscar'}
                </button>
              </div>
              <div className="category-filters">
                {[{ id: '', label: 'Todos' }, { id: 'optimization', label: 'Optimización' }, { id: 'technology', label: 'Tecnología' }, { id: 'magic', label: 'Magia' }, { id: 'adventure', label: 'Aventura' }, { id: 'worldgen', label: 'Generación' }, { id: 'decoration', label: 'Decoración' }, { id: 'storage', label: 'Almacenamiento' }].map(cat => (
                  <button key={cat.id} onClick={() => onlineStore.setModCategory(cat.id)} className={`category-chip ${onlineStore.modCategory === cat.id ? 'active' : ''}`}>
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {!modpack.packInfo ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-10)' }}>
                  <div style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}>[TIENDA]</div>
                  <p style={{ fontSize: 'var(--text-lg)', marginBottom: 'var(--space-2)' }}>Primero cargá un modpack para buscar mods.</p>
                  <button onClick={modpack.handleScanFolder} className="btn btn-secondary" style={{ background: 'var(--accent-secondary)', color: 'var(--text-inverse)', marginTop: 'var(--space-3)' }}>
                    <FolderOpen size={16} /> Cargar Modpack
                  </button>
                </div>
              ) : onlineStore.isSearchingOnline ? (
                <>
                  {[1,2,3,4].map(i => (
                    <div key={i} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-xl)', padding: 'var(--space-5)', display: 'flex', gap: 'var(--space-5)', alignItems: 'center' }}>
                      <div className="skeleton skeleton-avatar"></div>
                      <div style={{ flex: 1 }}>
                        <div className="skeleton skeleton-title"></div>
                        <div className="skeleton skeleton-text" style={{ width: '90%' }}></div>
                        <div className="skeleton skeleton-text" style={{ width: '40%' }}></div>
                      </div>
                      <div className="skeleton" style={{ width: '120px', height: '40px', borderRadius: 'var(--radius-md)' }}></div>
                    </div>
                  ))}
                </>
              ) : onlineStore.onlineResults.length === 0 && onlineStore.hasSearched ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-10)' }}>
                  <div style={{ fontSize: '48px', marginBottom: 'var(--space-4)' }}>[BÚSQUEDA]</div>
                  <p style={{ fontSize: 'var(--text-lg)' }}>Sin resultados. Probá con otro término.</p>
                </div>
              ) : (
                onlineStore.onlineResults.slice(0, onlineStore.visibleOnlineCount).map((mod) => (
                  <div key={mod.project_id} className="mod-card interactive-row hover-lift" onClick={() => { onlineStore.setSelectedMod(mod); onlineStore.setShowDetails(true); }}>
                    <div className="mod-card-icon">
                      {mod.icon_url ? <img src={mod.icon_url} alt={mod.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span>[MOD]</span>}
                    </div>
                    <div className="mod-card-info">
                      <div className="mod-card-title">
                        <h3>{mod.title}</h3>
                        <span className={`mod-card-source ${mod.source || 'modrinth'}`}>{mod.source ? mod.source.toUpperCase() : 'MODRINTH'}</span>
                      </div>
                      <p className="mod-card-desc">{mod.description}</p>
                      <div className="mod-card-meta">
                        <span>Autor: {mod.author}</span>
                        <span>Descargas: {mod.downloads.toLocaleString()}</span>
                      </div>
                    </div>
                    <button onClick={(e) => { e.stopPropagation(); onlineStore.handleSelectModVersions(mod.project_id, mod.title, mod.source); }} disabled={onlineStore.downloadingMods[mod.project_id]} className="btn btn-success" style={{ minWidth: '120px', cursor: onlineStore.downloadingMods[mod.project_id] ? 'wait' : 'pointer' }}>
                      {onlineStore.downloadingMods[mod.project_id] ? 'Descargando...' : 'Instalar'}
                    </button>
                  </div>
                ))
              )}
            </div>
            {!onlineStore.isSearchingOnline && onlineStore.visibleOnlineCount < onlineStore.onlineResults.length && (
              <div style={{ textAlign: 'center', marginTop: 'var(--space-4)' }}>
                <button onClick={() => onlineStore.setVisibleOnlineCount(v => Math.min(v + 20, onlineStore.onlineResults.length))} className="btn btn-secondary" style={{ background: '#89b4fa', color: '#11111b' }}>
                  <ChevronRight size={15} /> Cargar más resultados
                </button>
              </div>
            )}
          </div>
        )}

        {/* PESTAÑA 4: TWEAKS */}
        {activeTab === 'tweaks' && (
          <div className="tab-content" style={{ display: 'flex', height: 'calc(100vh - 112px)', width: '100%' }}>
            <div className="tweak-sidebar">
              <h3>Módulos de Inyección</h3>
              <button onClick={() => tweaks.setActiveTweakTab('items')} className={`tweak-nav-item ${tweaks.activeTweakTab === 'items' ? 'active' : ''}`} style={{ color: tweaks.activeTweakTab === 'items' ? '#cdd6f4' : 'var(--text-muted)', borderLeftColor: tweaks.activeTweakTab === 'items' ? '#f5c2e7' : 'transparent' }}>Ajuste de Items</button>
              <button onClick={() => tweaks.setActiveTweakTab('entities')} className={`tweak-nav-item ${tweaks.activeTweakTab === 'entities' ? 'active' : ''}`} style={{ color: tweaks.activeTweakTab === 'entities' ? '#cdd6f4' : 'var(--text-muted)', borderLeftColor: tweaks.activeTweakTab === 'entities' ? '#a6e3a1' : 'transparent' }}>Mutador Genetico</button>
              <button onClick={() => tweaks.setActiveTweakTab('spawn')} className={`tweak-nav-item ${tweaks.activeTweakTab === 'spawn' ? 'active' : ''}`} style={{ color: tweaks.activeTweakTab === 'spawn' ? '#cdd6f4' : 'var(--text-muted)', borderLeftColor: tweaks.activeTweakTab === 'spawn' ? '#8ef29a' : 'transparent' }}>Control de Spawns</button>
              <button onClick={() => tweaks.setActiveTweakTab('optimizer')} className={`tweak-nav-item ${tweaks.activeTweakTab === 'optimizer' ? 'active' : ''}`} style={{ color: tweaks.activeTweakTab === 'optimizer' ? '#cdd6f4' : 'var(--text-muted)', borderLeftColor: tweaks.activeTweakTab === 'optimizer' ? '#f38ba8' : 'transparent' }}>Optimizador</button>
            </div>
            <div style={{ flex: 1, padding: 'var(--space-10)', overflowY: 'auto' }}>
              {tweaks.activeTweakTab === 'items' && (
                <div style={{ maxWidth: '600px' }}>
                  <h2 style={{ color: 'var(--text-primary)', marginTop: 0 }}>Modificador de Armas y Armaduras</h2>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-8)' }}>Inyecta código KubeJS para sobrescribir las estadísticas base de cualquier objeto en el juego.</p>
                  <p style={{ color: 'var(--accent-success)', fontSize: 'var(--text-sm)', marginTop: 'calc(var(--space-5) * -1)', marginBottom: 'var(--space-5)' }}>Base de datos activa: {modpack.availableIds.length} objetos detectados.</p>
                  <div style={{ background: 'var(--bg-surface)', padding: 'var(--space-6)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                    <div className="form-group">
                      <label className="form-label">ID del Objeto (mod:item)</label>
                      <AutocompleteInput placeholder="Ej: minecraft:diamond_chestplate" value={tweaks.itemTweakData.itemId} availableIds={modpack.availableIds} colorClass="var(--accent-success)" onChange={(val) => tweaks.setItemTweakData({ ...tweaks.itemTweakData, itemId: val })} />
                    </div>
                    <div className="form-row">
                      <div className="form-group">
                        <label className="form-label">Daño de Ataque</label>
                        <input type="number" step="0.5" placeholder="Ej: 12.5" value={tweaks.itemTweakData.damage} onChange={e => tweaks.setItemTweakData({ ...tweaks.itemTweakData, damage: e.target.value })} className="input" style={{ color: 'var(--accent-error)' }} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Puntos de Armadura</label>
                        <input type="number" placeholder="Ej: 8" value={tweaks.itemTweakData.armor} onChange={e => tweaks.setItemTweakData({ ...tweaks.itemTweakData, armor: e.target.value })} className="input" style={{ color: '#89b4fa' }} />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Dureza (Toughness)</label>
                        <input type="number" placeholder="Ej: 3" value={tweaks.itemTweakData.toughness} onChange={e => tweaks.setItemTweakData({ ...tweaks.itemTweakData, toughness: e.target.value })} className="input" style={{ color: 'var(--accent-warning)' }} />
                      </div>
                    </div>
                    <button onClick={tweaks.handleItemTweak} className="btn btn-secondary" style={{ background: '#f5c2e7', color: '#11111b', marginTop: 'var(--space-2)' }}>Inyectar Código de Balance</button>
                  </div>
                </div>
              )}
              {tweaks.activeTweakTab === 'entities' && (
                <div style={{ maxWidth: '600px' }}>
                  <h2 style={{ color: '#cdd6f4', marginTop: 0 }}>Mutador Genético</h2>
                  <p style={{ color: '#a6adc8', marginBottom: '30px' }}>Altera la genética de cualquier monstruo o jefe.</p>
                  <p style={{ color: '#a6e3a1', fontSize: '13px', marginTop: '-20px', marginBottom: '20px' }}>Base de datos activa: {modpack.availableIds.length} objetos detectados.</p>
                  <div style={{ background: '#181825', padding: '25px', borderRadius: '12px', border: '1px solid #313244', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div>
                      <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>ID de la Entidad (mod:mob)</label>
                      <AutocompleteInput placeholder="Ej: minecraft:zombie" value={tweaks.entityTweakData.entityId} availableIds={modpack.availableIds} colorClass="#a6e3a1" onChange={(val) => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, entityId: val })} />
                    </div>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Vida Máxima (HP)</label>
                        <input type="number" placeholder="Ej: 100" value={tweaks.entityTweakData.health} onChange={e => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, health: e.target.value })} style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #313244', background: '#11111b', color: '#a6e3a1', outline: 'none' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Daño de Ataque</label>
                        <input type="number" placeholder="Ej: 15" value={tweaks.entityTweakData.damage} onChange={e => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, damage: e.target.value })} style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #313244', background: '#11111b', color: '#f38ba8', outline: 'none' }} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={{ color: '#cdd6f4', fontSize: '13px', fontWeight: 'bold' }}>Velocidad (Base 0.2)</label>
                        <input type="number" step="0.05" placeholder="Ej: 0.35" value={tweaks.entityTweakData.speed} onChange={e => tweaks.setEntityTweakData({ ...tweaks.entityTweakData, speed: e.target.value })} style={{ width: '100%', padding: '12px', marginTop: '8px', borderRadius: '8px', border: '1px solid #313244', background: '#11111b', color: '#89dceb', outline: 'none' }} />
                      </div>
                    </div>
                    <button onClick={tweaks.handleEntityTweak} style={{ background: '#a6e3a1', color: '#11111b', border: 'none', padding: '15px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>Inyectar Mutación Genética</button>
                  </div>
                </div>
              )}
              {tweaks.activeTweakTab === 'spawn' && (
                <div style={{ maxWidth: '600px' }}>
                  <h2 style={{ color: '#cdd6f4', marginTop: 0 }}>Control de Spawns</h2>
                  <p style={{ color: '#a6adc8', marginBottom: '30px' }}>Inyecta reglas para alterar las estadísticas de los mobs.</p>
                  <p style={{ color: '#a6e3a1', fontSize: '13px', marginTop: '-20px', marginBottom: '20px' }}>Base de datos activa: {modpack.availableIds.length} objetos detectados.</p>
                  <div style={{ background: '#181825', padding: '25px', borderRadius: '12px', border: '1px solid #313244', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Entidad (mod:mob)</label>
                        <AutocompleteInput placeholder="Ej: minecraft:zombie" value={tweaks.spawnCenter.entityId} availableIds={modpack.availableIds} colorClass="#cdd6f4" onChange={(val) => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, entityId: val })} />
                      </div>
                      <div>
                        <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Vida Máxima (HP)</label>
                        <input placeholder="Ej: 20" type="number" value={tweaks.spawnCenter.health} onChange={e => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, health: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      <div>
                        <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Daño de Ataque</label>
                        <input placeholder="Ej: 5" type="number" value={tweaks.spawnCenter.damage} onChange={e => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, damage: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#f38ba8', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Velocidad (Base 0.2)</label>
                        <input placeholder="Ej: 0.2" type="number" step="0.01" value={tweaks.spawnCenter.speed} onChange={e => tweaks.setSpawnCenter({ ...tweaks.spawnCenter, speed: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#89dceb', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                    <button onClick={tweaks.handleSpawnControl} style={{ marginTop: '6px', padding: '14px', borderRadius: 8, border: 'none', background: '#8ef29a', fontWeight: 'bold', cursor: 'pointer' }}>Inyectar Mutación de Spawn</button>
                  </div>
                </div>
              )}
              {tweaks.activeTweakTab === 'loot' && (
                <div style={{ maxWidth: '600px' }}>
                  <h2 style={{ color: '#cdd6f4', marginTop: 0 }}>Editor de Loot</h2>
                  <p style={{ color: '#a6adc8', marginBottom: '30px' }}>Aplica parches JSON para modificar las tablas de botín.</p>
                  <p style={{ color: '#a6e3a1', fontSize: '13px', marginTop: '-20px', marginBottom: '20px' }}>Base de datos activa: {modpack.availableIds.length} objetos detectados.</p>
                  <div style={{ background: '#181825', padding: '25px', borderRadius: '12px', border: '1px solid #313244', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div>
                      <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Ruta relativa (ej: data/minecraft/loot_tables/entities/zombie.json)</label>
                      <input placeholder="Ruta del loot..." value={tweaks.lootCenter.lootPath} onChange={e => tweaks.setLootCenter({ ...tweaks.lootCenter, lootPath: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ color: '#cdd6f4', fontSize: '12px' }}>Parche en formato JSON</label>
                      <textarea placeholder='{"pools": [{"rolls": 1, "entries": [{"type": "item", "name": "diamond"}]}]}' rows={8} value={tweaks.lootCenter.patch} onChange={e => tweaks.setLootCenter({ ...tweaks.lootCenter, patch: e.target.value })} style={{ width: '100%', padding: '12px', borderRadius: '6px', border: '1px solid #313244', background: '#11111b', color: '#cdd6f4', resize: 'vertical', fontFamily: 'monospace', boxSizing: 'border-box' }} />
                    </div>
                    <button onClick={tweaks.handleLootPatch} style={{ marginTop: '6px', padding: '14px', borderRadius: 8, border: 'none', background: '#8bdc8a', fontWeight: 'bold', cursor: 'pointer' }}>Aplicar Loot Patch</button>
                  </div>
                </div>
              )}
              {tweaks.activeTweakTab === 'optimizer' && (
                <div style={{ maxWidth: '700px' }}>
                  <h2 style={{ color: '#f38ba8', marginTop: 0 }}>[OPT] Optimizador Inteligente</h2>
                  <p style={{ color: '#a6adc8', marginBottom: '30px' }}>Analiza y optimiza los archivos de configuración de tu modpack.</p>
                  {optimization.optimizerStep === 'idle' && (
                    <div style={{ background: '#181825', padding: '40px', borderRadius: '12px', border: '1px solid #313244', textAlign: 'center' }}>
                      <div style={{ fontSize: '48px', marginBottom: '20px' }}>[OPT]</div>
                      <h3 style={{ color: '#cdd6f4', margin: '0 0 10px 0' }}>¿Deseas optimizar el modpack actual?</h3>
                      <p style={{ color: '#6c7086', marginBottom: '30px' }}>Se ajustarán configuraciones clave para reducir el consumo de VRAM y CPU.</p>
                      <button onClick={optimization.handleOptimizationStart} style={{ background: '#f38ba8', color: '#11111b', border: 'none', padding: '16px 40px', borderRadius: '10px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer', boxShadow: '0 0 20px rgba(243, 139, 168, 0.4)' }}>Optimizar Ecosistema</button>
                    </div>
                  )}
                  {optimization.optimizerStep === 'running' && (
                    <div style={{ background: '#181825', padding: '40px', borderRadius: '12px', border: '1px solid #313244', textAlign: 'center' }}>
                      <div style={{ fontSize: '40px', marginBottom: '20px' }}>[...]</div>
                      <h3 style={{ color: '#cdd6f4', margin: '0 0 10px 0' }}>Optimizando...</h3>
                      <p style={{ color: '#6c7086' }}>{optimization.optimizerMessage}</p>
                    </div>
                  )}
                  {optimization.optimizerStep === 'done' && optimization.hasBackup && (
                    <div>
                      <div style={{ background: '#181825', padding: '30px', borderRadius: '12px', border: '1px solid #a6e3a1', marginBottom: '20px' }}>
                        <div style={{ fontSize: '36px', marginBottom: '15px' }}>[OK]</div>
                        <h3 style={{ color: '#a6e3a1', margin: '0 0 15px 0' }}>Optimización Completada</h3>
                        <p style={{ color: '#a6adc8' }}>{optimization.optimizerMessage}</p>
                      </div>
                      <div style={{ background: '#181825', padding: '20px', borderRadius: '12px', border: '1px solid #313244', marginBottom: '20px' }}>
                        <h4 style={{ color: '#cdd6f4', margin: '0 0 15px 0' }}>Archivos Modificados</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {optimization.optimizerResults.map((r, i) => (
                            <div key={i} style={{ padding: '12px 16px', borderRadius: '8px', background: '#11111b', borderLeft: '4px solid #a6e3a1', display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <span style={{ color: '#a6e3a1', fontSize: '18px' }}>[OK]</span>
                              <span style={{ color: '#cdd6f4', fontFamily: 'monospace', fontSize: '13px' }}>{r.file}</span>
                              <span style={{ color: '#a6adc8', fontSize: '12px', marginLeft: 'auto' }}>Ajustes de rendimiento aplicados</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <button onClick={optimization.handleOptimizationRollback} style={{ background: '#f9e2af', color: '#11111b', border: 'none', padding: '14px 30px', borderRadius: '8px', fontWeight: 'bold', fontSize: '15px', cursor: 'pointer', width: '100%', boxShadow: '0 0 15px rgba(249, 226, 175, 0.4)' }}>Deshacer Cambios / Restaurar a la Normalidad</button>
                    </div>
                  )}
                  {optimization.optimizerStep === 'done' && !optimization.hasBackup && (
                    <div style={{ background: '#181825', padding: '30px', borderRadius: '12px', border: '1px solid #f9e2af', textAlign: 'center' }}>
                      <h3 style={{ color: '#f9e2af', margin: '0 0 10px 0' }}>No se encontraron archivos optimizables</h3>
                      <p style={{ color: '#6c7086' }}>Tu modpack ya parece estar en una configuración eficiente.</p>
                      <button onClick={() => { optimization.setOptimizerStep('idle'); optimization.setOptimizerResults([]); }} style={{ background: '#313244', color: '#cdd6f4', border: 'none', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer', marginTop: '15px' }}>Volver</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* PESTAÑA 5: RENDIMIENTO */}
        {activeTab === 'performance' && (
          <div className="tab-content" style={{ padding: 'var(--space-10)', maxWidth: '900px', margin: '0 auto', paddingBottom: '100px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
              <div>
                <h2 style={{ color: '#fab387', margin: 0, fontSize: '28px' }}>Monitor de Rendimiento</h2>
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {performance.modsOrdenados.map((mod, i) => {
                const { hasImpact, isOpt, color, barWidth } = performance.modImpactStyles[i] || {};
                return (
                  <div key={i} style={{ background: 'var(--bg-surface)', padding: 'var(--space-4) var(--space-5)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 'var(--space-5)' }}>
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
                  </div>
                );
              })}
              {performance.modsOrdenados.length === 0 && (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 'var(--space-10)' }}>No hay mods cargados en el ecosistema.</div>
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
          background: toast.type === 'success' ? 'linear-gradient(135deg, #a6e3a1 0%, #40a02b 100%)' :
            toast.type === 'loading' ? 'linear-gradient(135deg, #89b4fa 0%, #1e66f5 100%)' :
              'linear-gradient(135deg, #f38ba8 0%, #d20f39 100%)',
          color: '#11111b', padding: '18px 24px', borderRadius: '14px',
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