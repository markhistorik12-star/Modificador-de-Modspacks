import { Handle, Position } from 'reactflow';
import { Box } from 'lucide-react';

export default function ModNode({ data }) {
  const tooltip = [
    data.label,
    `Versión: ${data.version || 'Desconocida'}`,
    data.impactScore !== undefined ? `Impacto: ${data.impactScore} pts` : null,
    data.hasConfigs ? 'Tiene archivos de configuración' : null,
    data.source ? `Fuente: ${data.source}` : null,
  ].filter(Boolean).join('\n');

  return (
    <div
      data-tooltip={tooltip}
      style={{ 
        background: '#1a1d24', 
        color: 'white', 
        padding: '12px 15px', 
        borderRadius: '10px', 
        border: '2px solid #00e5ff', 
        display: 'flex', 
        alignItems: 'center', 
        gap: '12px', 
        minWidth: '220px',
        maxWidth: '280px',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.3)'
      }}
    >
      {/* Punto de conexión superior (Entrada/Target) */}
      <Handle type="target" position={Position.Top} style={{ background: '#00e5ff', border: 'none' }} />
      
      {/* --- RENDERIZADO DINÁMICO DEL ICONO --- */}
      <div style={{
        width: '42px',
        height: '42px',
        borderRadius: '8px',
        background: '#0d0f12', // Fondo más oscuro para resaltar el icono
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        flexShrink: 0,
        border: '1px solid #2a2e36'
      }}>
        {data.icon ? (
          <img 
            src={data.icon} 
            alt={`${data.label} icon`} 
            style={{ width: '100%', height: '100%', objectFit: 'contain' }} 
          />
        ) : (
          /* Fallback: Si no hay icono oficial, usamos tu Box de lucide-react */
          <Box size={24} color="#00e5ff" />
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
        <span style={{ fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' }}>
          v: {data.version}
        </span>
        
        {/* Indicador visual si el mod tiene archivos de configuración modificables */}
        {data.hasConfigs && (
          <span style={{ fontSize: '10px', color: '#00e67a', marginTop: '4px', fontWeight: 'bold' }}>
            Configs detectadas
          </span>
        )}
      </div>

      {/* Punto de conexión inferior (Salida/Source) */}
      <Handle type="source" position={Position.Bottom} style={{ background: '#00e5ff', border: 'none' }} />
    </div>
  );
}