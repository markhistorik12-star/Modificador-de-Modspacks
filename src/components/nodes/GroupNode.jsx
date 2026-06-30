import { memo } from 'react';
import { NodeResizer } from 'reactflow';

export default memo(({ data, selected }) => {
  return (
    <>
      {/* Herramienta para que el usuario pueda redimensionar el grupo manualmente si lo desea */}
      <NodeResizer 
        color="#00e5ff" 
        isVisible={selected} 
        minWidth={300} 
        minHeight={150} 
      />
      <div style={{
        padding: '10px 15px',
        borderBottom: '2px solid #2a2e36',
        background: '#0d0f12',
        borderRadius: '8px 8px 0 0',
        color: '#00e67a',
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
        Grupo: {data.label}
      </div>
      <div style={{
        border: '3px solid #2a2e36',
        background: 'rgba(26, 29, 36, 0.4)',
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