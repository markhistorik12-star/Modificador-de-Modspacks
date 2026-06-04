import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';

export default function ScriptEditor({ packPath }) {
  // Estados para manejar los datos
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
      alert("No se pudo leer el archivo");
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
      alert("Error al guardar: " + response.message);
    }
    
    setIsSaving(false);
  };

  // Función recursiva básica para renderizar el árbol visualmente
  const renderTree = (nodes) => {
    return nodes.map((node, index) => (
      <div key={index} style={{ marginLeft: node.type === 'folder' ? '0px' : '15px' }}>
        {node.type === 'folder' ? (
          <div style={{ fontWeight: 'bold', marginTop: '5px', color: '#e0e0e0' }}>
            📁 {node.name}
            {/* Si es carpeta, renderizamos sus hijos recursivamente */}
            {node.children && renderTree(node.children)} 
          </div>
        ) : (
          <div 
            onClick={() => handleFileClick(node.path)}
            style={{ 
              cursor: 'pointer', 
              padding: '4px',
              color: activeFile === node.path ? '#61dafb' : '#abb2bf',
              backgroundColor: activeFile === node.path ? '#2c313a' : 'transparent',
              borderRadius: '4px'
            }}
          >
            📄 {node.name}
          </div>
        )}
      </div>
    ));
  };

  return (
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#1e1e1e', color: 'white' }}>
      
      {/* PANEL IZQUIERDO: Explorador de Archivos */}
      <div style={{ width: '250px', borderRight: '1px solid #333', padding: '10px', overflowY: 'auto' }}>
        <h3 style={{ fontSize: '14px', color: '#858585', textTransform: 'uppercase' }}>KubeJS Scripts</h3>
        {renderTree(fileTree.kubejs)}

        <h3 style={{ fontSize: '14px', color: '#858585', textTransform: 'uppercase', marginTop: '20px' }}>CraftTweaker</h3>
        {renderTree(fileTree.scripts)}
      </div>

      {/* PANEL DERECHO: Monaco Editor */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        
        {/* Barra superior del editor (Pestaña y botón guardar) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', backgroundColor: '#252526', borderBottom: '1px solid #333' }}>
          <span style={{ fontFamily: 'monospace' }}>
            {activeFile ? activeFile.split('\\').pop() : 'Sin archivo abierto'}
          </span>
          <button 
            onClick={handleSave} 
            disabled={!activeFile || isSaving}
            style={{ backgroundColor: '#0e639c', color: 'white', border: 'none', padding: '5px 15px', borderRadius: '3px', cursor: activeFile ? 'pointer' : 'not-allowed' }}
          >
            {isSaving ? 'Guardando...' : '💾 Guardar Cambios'}
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
    </div>
  );
}