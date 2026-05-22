import { Handle, Position } from 'reactflow';
import { Box } from 'lucide-react';

export default function ModNode({ data }) {
  return (
    <div 
      style={{ 
        background: '#1e1e2e', 
        color: 'white', 
        padding: '12px 15px', 
        borderRadius: '10px', 
        border: '2px solid #cba6f7', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        minWidth: '220px',
        maxWidth: '280px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
      }}
    >
      {/* Punto de conexión superior (Entrada/Target) */}
      <Handle type="target" position={Position.Top} style={{ background: '#cba6f7', border: 'none' }} />
      
      {/* --- RENDERIZADO DINÁMICO DEL ICONO --- */}
      <div style={{
        width: '42px',
        height: '42px',
        borderRadius: '8px',
        background: '#11111b', // Fondo más oscuro para resaltar el icono
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        border: '1px solid #313244'
      }}>
        {data.icon ? (
          <img 
            src={data.icon} 
            alt={`${data.label} icon`} 
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
          />
        ) : (
          /* Fallback: Si no hay icono oficial, usamos tu Box de lucide-react */
          <Box size={24} color="#cba6f7" />
        )}
      </div>
      
      {/* Información del Mod */}
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <span style={{ 
          fontWeight: 'bold', 
          fontSize: '15px', 
          fontFamily: 'sans-serif',
          whiteSpace: 'nowrap', 
          overflow: 'hidden', 
          textOverflow: 'ellipsis' 
        }}>
          {data.label}
        </span>
        <span style={{ fontSize: '11px', color: '#a6adc8', fontFamily: 'monospace' }}>
          v: {data.version}
        </span>
        
        {/* Indicador visual si el mod tiene archivos de configuración modificables */}
        {data.hasConfigs && (
          <span style={{ fontSize: '10px', color: '#a6e3a1', marginTop: '4px', fontWeight: 'bold' }}>
            ⚙️ Configs detectadas
          </span>
        )}
      </div>

      {/* Punto de conexión inferior (Salida/Source) */}
      <Handle type="source" position={Position.Bottom} style={{ background: '#cba6f7', border: 'none' }} />
    </div>
  );
}