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
  const [contextMenu, setContextMenu] = useState(null);

  const [isBotOpen, setIsBotOpen] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState([
    { role: 'bot', text: '¡Hola! Soy tu Modpack Assist. Conozco todos los archivos y mods que tienes cargados. ¿En qué te ayudo?' }
  ]);

  const onNodeContextMenu = useCallback((event, node) => {
    event.preventDefault(); // Evita que salga el menú normal de Chrome/Windows
    // Guardamos la posición del ratón y la info del mod tocado
    setContextMenu({ x: event.clientX, y: event.clientY, node });
  }, []);

  const onPaneClick = useCallback(() => {
    // Si hacemos clic en cualquier parte vacía del mapa, se cierra el menú
    setContextMenu(null);
  }, []);

  const handleAskBotAboutMod = () => {
    if (!contextMenu?.node) return;

    // 1. Extraemos el nombre del mod que tocamos
    const modName = contextMenu.node.data.label;

    // 2. Preparamos el "Prompt Inyectado"
    const query = `Actúa como experto en la 1.12.2, ¿para qué sirve el mod '${modName}' y qué configuraciones críticas debería revisar?`;

    // 3. Cerramos el menú, abrimos el bot y llenamos el input
    setContextMenu(null);
    setIsBotOpen(true);
    setChatInput(query);
    // Opcional: Podríamos auto-enviarlo, pero dejarlo en el input te deja editarlo antes de darle Enter.
  };

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

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    // 1. Mensaje del usuario a la UI y mostrar que el bot está pensando
    const newMessages = [...messages, { role: 'user', text: chatInput }];
    setMessages([...newMessages, { role: 'bot', text: 'Analizando sistema...' }]); // Loading state
    setChatInput('');

    // 2. CONSTRUIMOS EL CONTEXTO
    const contextData = {
      packName: packInfo?.name || 'Desconocido',
      mcVersion: packInfo?.gameVersion || 'Desconocida',
      // Juntamos todos los archivos de la raíz
      rootFilesList: rootFiles.join(', '),
      // Juntamos los nombres de todos los mods en un solo texto
      modNames: nodes.filter(n => n.type === 'mod').map(n => n.data.label).join(', '),
      // Buscamos todas las configs satélites y las juntamos
      configFiles: nodes.filter(n => n.id.startsWith('cfg-')).map(n => n.data.label.replace('⚙️ ', '')).join(', ')
    };

    try {
      if (window.electronAPI && window.electronAPI.askBot) {
        let response = await window.electronAPI.askBot(contextData, chatInput);

        // INTERCEPTOR 1: ABRIR ARCHIVOS
        const openMatch = response.match(/\[ACCION:\s*ABRIR\s*\|\s*(.*?)\]/i);
        if (openMatch) {
          const fileName = openMatch[1].trim();
          window.electronAPI.openFile(fileName, packInfo.path);
          response = response.replace(openMatch[0], '').trim();
        }

        // INTERCEPTOR 2: BÚSQUEDA PROFUNDA
        const searchMatch = response.match(/\[ACCION:\s*BUSCAR_TEXTO\s*\|\s*(.*?)\]/i);
        if (searchMatch) {
          const searchTerm = searchMatch[1].trim();

          // Le avisamos al usuario que estamos escaneando el disco
          setMessages(prev => [...prev.slice(0, -1), { role: 'bot', text: `Escaneando archivos por la variable "${searchTerm}"... 🔍` }]);

          // Node.js busca en los archivos
          const searchResults = await window.electronAPI.searchConfigs(searchTerm, packInfo.path);

          // Enviamos los resultados de vuelta a la IA para que los resuma
          const followUpPrompt = `Aquí están los resultados de tu búsqueda en los archivos para "${searchTerm}":\n${searchResults}\n\nPor favor, responde la duda original del usuario basándote EXCLUSIVAMENTE en estos resultados. Si es necesario, dile qué archivo debe abrir. No uses etiquetas de ACCION en esta respuesta.`;

          response = await window.electronAPI.askBot(contextData, followUpPrompt);
        }

        // --- NUEVO: INTERCEPTOR 3: AUTO-FIXER (ESCRITURA) ---
        const editMatch = response.match(/\[ACCION:\s*EDITAR\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*(.*?)\]/i);
        if (editMatch) {
          const fileName = editMatch[1].trim();
          const oldText = editMatch[2].trim();
          const newText = editMatch[3].trim();

          // Cambiamos el mensaje para que el usuario sepa qué está pasando
          setMessages(prev => [...prev.slice(0, -1), { role: 'bot', text: `Aplicando cambios en ${fileName}...\nBorrando: \`${oldText}\`\nEscribiendo: \`${newText}\` ⚙️` }]);

          // Mandamos la orden de escritura a Node.js
          const editResult = await window.electronAPI.editFile(fileName, packInfo.path, oldText, newText);

          // Le informamos a la IA del resultado y le pedimos que le avise al usuario
          const followUpPrompt = `Intento de edición en ${fileName}. Resultado del sistema operativo: "${editResult.message}". Por favor, infórmale al usuario de este resultado de manera natural. No uses más etiquetas de ACCION.`;

          response = await window.electronAPI.askBot(contextData, followUpPrompt);
        }

        // 4. ACTUALIZAMOS LA UI CON LA RESPUESTA FINAL
        // Usamos prev para asegurarnos de reemplazar el mensaje de "Analizando..." o "Escaneando..."
        setMessages(prev => [...prev.slice(0, -1), { role: 'bot', text: response }]);

      } else {
        setMessages(prev => [...prev.slice(0, -1), { role: 'bot', text: 'Error: El puente de comunicación no está conectado.' }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev.slice(0, -1), { role: 'bot', text: 'Error fatal al contactar al cerebro de IA.' }]);
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
    <div style={{ width: '100vw', height: '100vh', background: '#11111b', color: '#cdd6f4', fontFamily: 'sans-serif', overflow: 'hidden' }}>
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

        {/* --- NUEVO: BOTÓN DEL ASISTENTE Y TÍTULO --- */}
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

      {/* --- NUEVO: PANEL LATERAL DEL CHAT (DRAWER) --- */}
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
            <p style={{ margin: '5px 0 0 0', fontSize: '12px', color: '#a6adc8' }}>Conectado al contexto local</p>
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
              {msg.text}
            </div>
          ))}
        </div>

        {/* Input de Texto */}
        <div style={{ padding: '20px', borderTop: '1px solid #313244', display: 'flex', gap: '10px', background: '#181825' }}>
          <input
            type="text"
            placeholder="Pregunta sobre mods o errores..."
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

      {/* --- CONTENIDO PRINCIPAL (MAPA O LISTA) --- */}
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
              onPaneClick={onPaneClick}>
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

