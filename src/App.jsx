import { useState, useCallback } from 'react';
import ReactFlow, { Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges } from 'reactflow';
import 'reactflow/dist/style.css';
import ModNode from './components/nodes/ModNode';

const nodeTypes = { mod: ModNode };

export default function App() {
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [packInfo, setPackInfo] = useState(null); // Nuevo: Estado para el ADN del pack

  const onNodesChange = useCallback((chs) => setNodes((nds) => applyNodeChanges(chs, nds)), []);
  const onEdgesChange = useCallback((chs) => setEdges((eds) => applyEdgeChanges(chs, eds)), []);
  const [rootFiles, setRootFiles] = useState([]);
  const [activeTab, setActiveTab] = useState('mods');

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

        // 2. Creamos el Nodo del Mod
        newNodes.push({
          id: modId,
          type: 'mod',
          position: { x: posX, y: posY },
          data: {
            label: mod.name,
            version: mod.version,
            // Guardamos la cuenta para mostrarla en el nodo si quieres
            hasConfigs: mod.configs.length > 0
          }
        });

        // 3. Si tiene configuraciones, las creamos como satélites
        mod.configs.forEach((cfg, cIndex) => {
          const cfgId = `cfg-${index}-${cIndex}`;

          // Posicionamos los archivos de config debajo del mod
          newNodes.push({
            id: cfgId,
            // Estilo simplificado: más pequeño y color turquesa
            style: {
              background: '#94e2d5',
              color: '#11111b',
              fontSize: '10px',
              width: 150,
              borderRadius: '4px',
              padding: '4px',
              border: '1px solid #11111b'
            },
            position: { x: posX + 20, y: posY + 80 + (cIndex * 35) },
            data: { label: `⚙️ ${cfg}` }
          });

          // 4. CREAMOS LA CONEXIÓN (La línea que los une)
          newEdges.push({
            id: `edge-${modId}-${cfgId}`,
            source: modId,
            target: cfgId,
            animated: true, // Esto le da movimiento a la línea
            style: { stroke: '#94e2d5', strokeWidth: 2 },
          });
        });
      });

      setNodes(newNodes);
      setEdges(newEdges);
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

              {/* SELECTOR DE VISTAS (TABS) */}
              <div style={{ display: 'flex', gap: '10px', marginLeft: '30px', background: '#11111b', padding: '5px', borderRadius: '8px' }}>
                <button
                  onClick={() => setActiveTab('mods')}
                  style={{
                    background: activeTab === 'mods' ? '#313244' : 'transparent',
                    color: activeTab === 'mods' ? '#cba6f7' : '#a6adc8',
                    border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'
                  }}
                >
                  🧩 Ecosistema de Mods
                </button>
                <button
                  onClick={() => setActiveTab('global')}
                  style={{
                    background: activeTab === 'global' ? '#313244' : 'transparent',
                    color: activeTab === 'global' ? '#cba6f7' : '#a6adc8',
                    border: 'none', padding: '8px 15px', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold'
                  }}
                >
                  ⚙️ Config. General
                </button>
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: 'right' }}>
          <b style={{ color: '#cba6f7' }}>Modpack Assist</b> v1.0
        </div>
      </div>

      {/* CONTENIDO DINÁMICO SEGÚN LA PESTAÑA */}
      <div style={{ width: '100%', height: '100%', paddingTop: '70px', overflowY: 'auto' }}>
        {activeTab === 'mods' ? (
          /* VISTA A: MAPA DE NODOS */
          <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} fitView>
            <Background color="#313244" variant="dots" gap={25} size={1} />
            <Controls />
            <MiniMap nodeColor="#cba6f7" maskColor="rgba(30, 30, 46, 0.7)" style={{ background: '#11111b' }} />
          </ReactFlow>
        ) : (
          /* VISTA B: CONFIGURACIÓN GENERAL (DINÁMICA) */
          <div style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
            <h2>Configuraciones Globales</h2>
            <p style={{ color: '#a6adc8' }}>Archivos detectados en la raíz de {packInfo?.name}</p>
            
            <div style={{ background: '#181825', padding: '20px', borderRadius: '12px', border: '1px solid #313244' }}>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {rootFiles.length > 0 ? (
                  rootFiles.map((file, i) => (
                    <li key={i} style={{ 
                      marginBottom: '10px', padding: '10px', background: '#11111b', 
                      borderRadius: '6px', display: 'flex', justifyContent: 'space-between',
                      border: '1px solid #313244'
                    }}>
                      <span>{file.includes('.') ? '📄' : '📁'} {file}</span>
                      <span style={{ color: '#94e2d5', fontSize: '12px' }}>Detectado ✓</span>
                    </li>
                  ))
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