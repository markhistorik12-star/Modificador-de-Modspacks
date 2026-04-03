// src/components/nodes/ModNode.jsx
import { Handle, Position } from 'reactflow';
import { Box } from 'lucide-react';

export default function ModNode({ data }) {
  return (
    <div 
      style={{ 
        background: '#1e1e2e', // Fondo oscuro
        color: 'white', 
        padding: '12px 20px', 
        borderRadius: '10px', 
        border: '2px solid #cba6f7', // Borde morado estilo "hacker/modder"
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        minWidth: '180px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
      }}
    >
      {/* Punto de conexión superior (Entrada/Target) */}
      <Handle type="target" position={Position.Top} style={{ background: '#cba6f7' }} />
      
      <Box size={28} color="#cba6f7" />
      
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: 'bold', fontSize: '16px', fontFamily: 'sans-serif' }}>
          {data.label}
        </span>
        <span style={{ fontSize: '12px', color: '#a6adc8', fontFamily: 'monospace' }}>
          {data.version}
        </span>
      </div>

      {/* Punto de conexión inferior (Salida/Source) */}
      <Handle type="source" position={Position.Bottom} style={{ background: '#cba6f7' }} />
    </div>
  );
}