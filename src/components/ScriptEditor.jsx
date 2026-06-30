import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { useToast } from './Toast.jsx';
import ToastContainer from './Toast.jsx';

export default function ScriptEditor({ packPath }) {
  const { toasts, showToast, removeToast } = useToast();
  const [fileTree, setFileTree] = useState({ kubejs: [], scripts: [] });
  const [activeFile, setActiveFile] = useState(null);
  const [code, setCode] = useState('// Selecciona un script del panel izquierdo para comenzar a editar');
  const [isSaving, setIsSaving] = useState(false);

  // 1. Cargar el árbol de archivos al iniciar el componente
  useEffect(() => {
    const loadTree = async () => {
      // packPath es la ruta del modpack actual que pasamos como prop
      const response = await window.electronAPI.getScriptsTree(packPath);
      if (response.success) {
        setFileTree(response.data);
      } else {
        console.error("Error al cargar scripts:", response.message);
      }
    };
    
    if (packPath) loadTree();
  }, [packPath]);

  // 2. Función para abrir un archivo al hacerle clic
  const handleFileClick = async (filePath) => {
    const response = await window.electronAPI.readScript(filePath, packPath);
    if (response.success) {
      setCode(response.data);
      setActiveFile(filePath);
    } else {
      showToast("Error", "No se pudo leer el archivo", "error");
    }
  };

  // 3. Función para guardar los cambios en el disco duro
  const handleSave = async () => {
    if (!activeFile) return;
    setIsSaving(true);
    
    const response = await window.electronAPI.saveScript(activeFile, code, packPath);
    if (response.success) {
      // Aquí puedes agregar un "toast" o notificación visual más bonita después
      console.log("¡Guardado exitoso!");
    } else {
      showToast("Error al guardar", response.message, "error");
    }
    
    setIsSaving(false);
  };

  // Función recursiva básica para renderizar el árbol visualmente
  const renderTree = (nodes) => {
    return nodes.map((node, index) => (
      <div key={index} style={{ marginLeft: node.type === 'folder' ? '0px' : '15px' }}>
        {node.type === 'folder' ? (
          <div style={{ fontWeight: 'bold', marginTop: '5px', color: '#f8f9fa' }}>
            [DIR] {node.name}
            {/* Si es carpeta, renderizamos sus hijos recursivamente */}
            {node.children && renderTree(node.children)} 
          </div>
        ) : (
          <div 
            onClick={() => handleFileClick(node.path)}
            style={{ 
              cursor: 'pointer', 
              padding: '4px 8px',
              color: activeFile === node.path ? '#00e5ff' : '#9ca3af',
              backgroundColor: activeFile === node.path ? '#262b33' : 'transparent',
              borderRadius: '4px', transition: 'all 0.15s ease'
            }} onMouseEnter={e => activeFile !== node.path && (e.target.style.backgroundColor = '#1a1d24')} onMouseLeave={e => activeFile !== node.path && (e.target.style.backgroundColor = 'transparent')}>
            [FILE] {node.name}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#0d0f12', color: 'white' }}>
      
      {/* PANEL IZQUIERDO: Explorador de Archivos */}
      <div style={{ width: '250px', borderRight: '1px solid #2a2e36', padding: '10px', overflowY: 'auto' }}>
        <h3 style={{ fontSize: '14px', color: '#9ca3af', textTransform: 'uppercase' }}>KubeJS Scripts</h3>
        {renderTree(fileTree.kubejs)}

        <h3 style={{ fontSize: '14px', color: '#9ca3af', textTransform: 'uppercase', marginTop: '20px' }}>CraftTweaker</h3>
        {renderTree(fileTree.scripts)}
      </div>

      {/* PANEL DERECHO: Monaco Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Barra superior del editor (Pestaña y botón guardar) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', backgroundColor: '#1a1d24', borderBottom: '1px solid #2a2e36' }}>
          <span style={{ fontFamily: 'monospace' }}>
            {activeFile ? activeFile.split('\\').pop() : 'Sin archivo abierto'}
          </span>
          <button 
            onClick={handleSave} 
            disabled={!activeFile || isSaving}
            style={{ backgroundColor: '#00e5ff', color: 'white', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: activeFile ? 'pointer' : 'not-allowed', fontWeight: 'bold', transition: 'all 0.15s ease', boxShadow: activeFile && !isSaving ? '0 2px 8px rgba(0, 229, 255, 0.3)' : 'none' }} onMouseEnter={e => activeFile && !isSaving && (e.target.style.transform = 'translateY(-1px)', e.target.style.boxShadow = '0 4px 16px rgba(0, 229, 255, 0.4)')} onMouseLeave={e => activeFile && !isSaving && (e.target.style.transform = '', e.target.style.boxShadow = '0 2px 8px rgba(0, 229, 255, 0.3)')}>
            {isSaving ? <span> <span className="spin" style={{display:'inline-block',width:14,height:14,border:'2px solid white',borderRightColor:'transparent',borderRadius:'50%',marginRight:6}} /> Guardando... </span> : 'Guardar'}
          </button>
        </div>

        {/* El Editor de Código */}
        <Editor
          height="100%"
          theme="vs-dark"
          // Mapeo simple: si termina en .zs lo forzamos a js por ahora para tener colores
          language={activeFile?.endsWith('.zs') ? 'javascript' : 'javascript'}
          value={code}
          onChange={(newValue) => setCode(newValue)}
          options={{
            minimap: { enabled: false }, // Apagamos el minimapa para ahorrar espacio
            fontSize: 14,
            wordWrap: 'on'
          }}
        />
      </div>
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </div>
  );
}