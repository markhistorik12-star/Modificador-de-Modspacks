import { useState, useEffect } from 'react';


export default function ConfigEditor({ fileName, initialContent, onClose, onSave, onOpenExternal }) {
  const [lines, setLines] = useState([]);

  useEffect(() => {
    // PARSER: Convierte el texto plano en una estructura interactiva
    const parsedLines = initialContent.split('\n').map((line, index) => {
      if (line.trim().startsWith('#') || !line.includes('=')) {
        return { id: index, type: 'text', original: line };
      }

      const [key, ...rest] = line.split('=');
      const val = rest.join('=');
      const isBool = val.trim() === 'true' || val.trim() === 'false';

      return {
        id: index, type: 'setting', key: key, value: val.trim(), isBool, original: line
      };
    });
    setLines(parsedLines);
  }, [initialContent]);

  const handleChange = (id, newValue) => {
    setLines(lines.map(l => l.id === id ? { ...l, value: newValue } : l));
  };

  const handleSave = () => {
    // RECONSTRUCTOR: Vuelve a unir todo preservando los comentarios originales
    const newContent = lines.map(l =>
      l.type === 'text' ? l.original : `${l.key}=${l.value}`
    ).join('\n');
    onSave(newContent);
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(13, 15, 18, 0.8)', backdropFilter: 'blur(5px)',
      zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center'
    }}>
      <div style={{
        background: '#1a1d24', border: '2px solid #00e5ff', borderRadius: '12px',
        width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 10px 30px rgba(0,0,0,0.8)'
      }}>
        {/* Cabecera */}
        <div style={{ padding: '15px 20px', borderBottom: '1px solid #2a2e36', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#00e5ff' }}>Config: {fileName}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#ff4d6a', fontSize: '20px', cursor: 'pointer', transition: 'all 0.15s ease', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onMouseEnter={e => { e.target.style.background = '#ff4d6a'; e.target.style.color = '#0d0f12'; }} onMouseLeave={e => { e.target.style.background = ''; e.target.style.color = '#ff4d6a'; }}>x</button>
        </div>

        {/* Cuerpo del Editor */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {lines.map((line) => {
            if (line.type === 'text') {
              if (line.original.trim() === '') return <div key={line.id} style={{ height: '10px' }} />;
              return <div key={line.id} style={{ color: '#9ca3af', fontSize: '12px', fontStyle: 'italic' }}>{line.original}</div>;
            }

            return (
              <div key={line.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#0d0f12', padding: '10px 15px', borderRadius: '8px', border: '1px solid #2a2e36'
              }}>
                <span style={{ color: '#f8f9fa', fontSize: '14px', fontFamily: 'monospace' }}>{line.key}</span>

                {line.isBool ? (
                  <button
                    onClick={() => handleChange(line.id, line.value === 'true' ? 'false' : 'true')}
                    style={{
                      background: line.value === 'true' ? '#00e67a' : '#ff4d6a',
                      color: '#0d0f12', border: 'none', padding: '5px 15px', borderRadius: '20px',
                      fontWeight: 'bold', cursor: 'pointer', width: '70px', transition: 'all 0.15s ease'
                    }} onMouseEnter={e => e.target.style.transform = 'scale(1.05)'} onMouseLeave={e => e.target.style.transform = ''}>
                    {line.value.toUpperCase()}
                  </button>
                ) : (
                  <input
                    type="text"
                    value={line.value}
                    onChange={(e) => handleChange(line.id, e.target.value)}
                    style={{
                      background: '#1a1d24', border: '1px solid #2a2e36', color: '#00e5ff',
                      padding: '5px 10px', borderRadius: '4px', textAlign: 'right', outline: 'none',
                      transition: 'all 0.15s ease'
                    }}
                    onFocus={e => { e.target.style.borderColor = '#00e5ff'; e.target.style.boxShadow = '0 0 0 2px rgba(0, 229, 255, 0.2)'; }}
                    onBlur={e => { e.target.style.borderColor = '#2a2e36'; e.target.style.boxShadow = ''; }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer (Guardar) */}
        <div style={{ padding: '15px 20px', borderTop: '1px solid #2a2e36', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>

          {/* --- Abrir en editor externo --- */}
          <button
            onClick={onOpenExternal}
            style={{
              background: '#00e5ff', color: '#0d0f12', border: 'none',
              padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold',
              cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: '0 2px 8px rgba(0, 229, 255, 0.3)'
            }} onMouseEnter={e => { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 4px 16px rgba(0, 229, 255, 0.4)'; }} onMouseLeave={e => { e.target.style.transform = ''; e.target.style.boxShadow = '0 2px 8px rgba(0, 229, 255, 0.3)'; }}>
            Abrir en Editor Externo
          </button>

          <button onClick={onClose} style={{ background: '#2a2e36', color: '#f8f9fa', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.15s ease' }} onMouseEnter={e => { e.target.style.background = '#3a3e46'; }} onMouseLeave={e => { e.target.style.background = '#2a2e36'; }}>Cancelar</button>

          <button onClick={handleSave} style={{ background: '#00e67a', color: '#0d0f12', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.15s ease', boxShadow: '0 2px 8px rgba(0, 230, 122, 0.3)' }} onMouseEnter={e => { e.target.style.transform = 'translateY(-1px)'; e.target.style.boxShadow = '0 4px 16px rgba(0, 230, 122, 0.4)'; }} onMouseLeave={e => { e.target.style.transform = ''; e.target.style.boxShadow = '0 2px 8px rgba(0, 230, 122, 0.3)'; }}>Guardar Cambios</button>

        </div>
      </div>
    </div>
  );
}