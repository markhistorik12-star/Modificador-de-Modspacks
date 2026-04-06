import { useState, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import 'reactflow/dist/style.css';
import ModNode from './components/nodes/ModNode';

const nodeTypes = { mod: ModNode };

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
  
  // --- ESTADOS DE LOS BUSCADORES ---
  const [searchTerm, setSearchTerm] = useState('');
  const [searchMods, setSearchMods] = useState('');
  const [rfInstance, setRfInstance] = useState(null);

  const handleScanFolder = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.scanMods();
      if (!result) return;
      
      const { mods, info, rootFiles: filesFromRoot } = result;
      setPackInfo(info);
      setRootFiles(filesFromRoot || []);
      
      const newNodes = [];
      const newEdges = [];

      mods.forEach((mod, index) => {
        const posX = (index % 4) * 450 + 100;
        const posY = Math.floor(index / 4) * 300 + 100;
        const modId = `mod-${index}`;
        
        newNodes.push({
          id: modId,
          type: 'mod',
          position: { x: posX, y: posY },
          data: {
            label: mod.name,
            version: mod.version,
            hasConfigs: mod.configs.length > 0
          }
        });
        
        mod.configs.forEach((cfg, cIndex) => {
          const cfgId = `cfg-${index}-${cIndex}`;
          newNodes.push({
            id: cfgId,
            style: {
              background: '#94e2d5', color: '#11111b', fontSize: '10px',
              width: 150, borderRadius: '4px', padding: '4px', border: '1px solid #11111b'
            },
            position: { x: posX + 20, y: posY + 80 + (cIndex * 35) },
            data: { label: `⚙️ ${cfg}` }
          });
          newEdges.push({
            id: `edge-${modId}-${cfgId}`,
            source: modId, target: cfgId, animated: true,
            style: { stroke: '#94e2d5', strokeWidth: 2 },
          });
        });
      });
      setNodes(newNodes);
      setEdges(newEdges);
    }
  };

  // --- FILTRO PARA LA VISTA GLOBAL ---
  const filteredFiles = rootFiles.filter(file => {
    if (!searchTerm) return true; 
    
    const lowerFile = file.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();
    const description = analyzeFilePurpose(file).toLowerCase();
    
    return lowerFile.includes(lowerSearch) || description.includes(lowerSearch);
  });

  // --- LÓGICA DE OPACIDAD PARA EL ECOSISTEMA DE MODS ---
  const displayNodes = nodes.map(node => {
    // Si no hay búsqueda, mostramos todo normal
    if (!searchMods) return { ...node, style: { ...node?.style, opacity: 1, pointerEvents: 'all' } };

    const lowerSearch = searchMods.toLowerCase();
    const isMatch = 
      (node.data.label && node.data.label.toLowerCase().includes(lowerSearch)) ||
      (node.data.version && node.data.version.toLowerCase().includes(lowerSearch));

    return {
      ...node,
      style: {
        ...node.style,
        opacity: isMatch ? 1 : 0.15, // Atenúa los que no coinciden
        transition: 'opacity 0.3s ease',
        pointerEvents: isMatch ? 'all' : 'none' 
      }
    };
  });

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && searchMods && rfInstance) {
      // 1. Buscamos coincidencias (solo en nodos tipo 'mod')
      const matches = nodes.filter(n => n.type === 'mod' && 
        n.data.label.toLowerCase().includes(searchMods.toLowerCase())
      );

      if (matches.length > 0) {
        // 2. Prioridad: ¿Hay uno que sea exactamente igual?
        const exactMatch = matches.find(n => 
          n.data.label.toLowerCase() === searchMods.toLowerCase()
        );
        
        // Usamos el exacto, o el primero de la lista de parecidos
        const targetNode = exactMatch || matches[0];

        // 3. Zoom al nodo (centrar cámara)
        rfInstance.setCenter(targetNode.position.x + 75, targetNode.position.y + 25, {
          zoom: 1.2, 
          duration: 800 // Milisegundos de animación
        });
      }
    }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#11111b', color: '#cdd6f4', fontFamily: 'sans-serif' }}>
      
      {/* BARRA SUPERIOR PROFESIONAL */}
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
              </div>
            </>
          )}
        </div>
        <div style={{ textAlign: 'right' }}><b style={{ color: '#cba6f7' }}>Modpack Assist</b> v1.0</div>
      </div>

      <div style={{ width: '100%', height: '100%', paddingTop: '70px', overflowY: 'auto' }}>
        {activeTab === 'mods' ? (
          /* VISTA A: MAPA DE NODOS CON BUSCADOR FLOTANTE */
          <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            
            {nodes.length > 0 && (
              <div style={{ 
                position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)', 
                zIndex: 10, width: '400px' 
              }}>
                <input
                  type="text"
                  placeholder="🔍 Escribe y presiona Enter para ir al mod..."
                  value={searchMods}
                  onChange={(e) => setSearchMods(e.target.value)}
                  onKeyDown={handleSearchKeyDown} // <--- NUEVO: Detectar el Enter
                  style={{
                    width: '100%', padding: '12px 20px', borderRadius: '30px',
                    border: '1px solid #cba6f7', background: 'rgba(24, 24, 37, 0.8)',
                    color: '#cdd6f4', outline: 'none', fontSize: '14px',
                    boxShadow: '0 4px 15px rgba(0,0,0,0.5)', backdropFilter: 'blur(5px)'
                  }}
                />
              </div>
            )}

            <ReactFlow nodes={displayNodes} edges={edges} onNodesChange={onNodesChange} onInit={setRfInstance} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} fitView>
              <Background color="#313244" variant="dots" gap={25} size={1} />
              <Controls />
              <MiniMap nodeColor="#cba6f7" maskColor="rgba(30, 30, 46, 0.7)" style={{ background: '#11111b' }} />
            </ReactFlow>
          </div>
        ) : (
          /* VISTA B: CONFIGURACIÓN GENERAL (DINÁMICA) */
          <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
            <h2>Configuraciones Globales</h2>
            <p style={{ color: '#a6adc8', marginBottom: '20px' }}>Descripción automática de archivos en {packInfo?.name}</p>
            
            {rootFiles.length > 0 && (
              <input 
                type="text" 
                placeholder="🔍 Buscar por nombre (ej. txt) o función (ej. recetas)..." 
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
                          <span style={{ color: '#94e2d5', fontSize: '11px' }}>Detectado ✓</span>
                        </div>
                        <p style={{ margin: 0, color: '#a6adc8', fontSize: '13px', fontStyle: 'italic' }}>
                          {analyzeFilePurpose(file)}
                        </p>
                      </li>
                    ))
                  ) : (
                    <li style={{ color: '#f38ba8', textAlign: 'center', padding: '20px' }}>
                      No se encontraron archivos que coincidan con "{searchTerm}".
                    </li>
                  )
                ) : (
                  <li style={{ color: '#f38ba8', textAlign: 'center', padding: '20px' }}>
                    No se encontraron archivos en la raíz.
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}