// components/nodes/GroupNode.jsx
import { memo } from 'react';
import { NodeResizer } from 'reactflow';

export default memo(({ data, selected }) => {
  return (
    <>
      {/* Herramienta para que el usuario pueda redimensionar el grupo manualmente si lo desea */}
      <NodeResizer 
        color="#cba6f7" 
        isVisible={selected} 
        minWidth={300} 
        minHeight={150} 
      />
      <div style={{
        padding: '10px 15px',
        borderBottom: '2px solid #313244',
        background: '#11111b',
        borderRadius: '8px 8px 0 0',
        color: '#a6e3a1',
        fontWeight: 'bold',
        fontSize: '14px',
        fontFamily: 'sans-serif',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0
      }}>
        📦 Grupo: {data.label}
      </div>
      <div style={{
        border: '3px solid #313244',
        background: 'rgba(24, 24, 37, 0.4)',
        borderRadius: '8px',
        width: '100%',
        height: '100%',
        boxSizing: 'border-box',
        pointerEvents: 'none', // Permite que el usuario haga clic en los nodos de dentro
        paddingTop: '45px' // Espacio para el título
      }} />
    </>
  );
});