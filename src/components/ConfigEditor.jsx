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
      background: 'rgba(17, 17, 27, 0.8)', backdropFilter: 'blur(5px)',
      zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center'
    }}>
      <div style={{
        background: '#1e1e2e', border: '2px solid #cba6f7', borderRadius: '12px',
        width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 10px 30px rgba(0,0,0,0.8)'
      }}>
        {/* Cabecera */}
        <div style={{ padding: '15px 20px', borderBottom: '1px solid #313244', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, color: '#cba6f7' }}>⚙️ Editando: {fileName}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#f38ba8', fontSize: '20px', cursor: 'pointer' }}>✖</button>
        </div>

        {/* Cuerpo del Editor */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {lines.map((line) => {
            if (line.type === 'text') {
              if (line.original.trim() === '') return <div key={line.id} style={{ height: '10px' }} />;
              return <div key={line.id} style={{ color: '#6c7086', fontSize: '12px', fontStyle: 'italic' }}>{line.original}</div>;
            }

            return (
              <div key={line.id} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#11111b', padding: '10px 15px', borderRadius: '8px', border: '1px solid #313244'
              }}>
                <span style={{ color: '#cdd6f4', fontSize: '14px', fontFamily: 'monospace' }}>{line.key}</span>

                {line.isBool ? (
                  <button
                    onClick={() => handleChange(line.id, line.value === 'true' ? 'false' : 'true')}
                    style={{
                      background: line.value === 'true' ? '#a6e3a1' : '#f38ba8',
                      color: '#11111b', border: 'none', padding: '5px 15px', borderRadius: '20px',
                      fontWeight: 'bold', cursor: 'pointer', width: '70px'
                    }}>
                    {line.value.toUpperCase()}
                  </button>
                ) : (
                  <input
                    type="text"
                    value={line.value}
                    onChange={(e) => handleChange(line.id, e.target.value)}
                    style={{
                      background: '#181825', border: '1px solid #45475a', color: '#89b4fa',
                      padding: '5px 10px', borderRadius: '4px', textAlign: 'right', outline: 'none'
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer (Guardar) */}
        <div style={{ padding: '15px 20px', borderTop: '1px solid #313244', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>

          {/* --- NUEVO BOTÓN PARA VS CODE --- */}
          <button
            onClick={onOpenExternal}
            style={{
              background: '#89b4fa', color: '#11111b', border: 'none',
              padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold',
              cursor: 'pointer'
            }}
          >
            💻 Abrir en Editor Externo
          </button>

          <button onClick={onClose} style={{ background: '#313244', color: '#cdd6f4', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>

          <button onClick={handleSave} style={{ background: '#a6e3a1', color: '#11111b', border: 'none', padding: '10px 20px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}>💾 Guardar Cambios</button>

        </div>
      </div>
    </div>
  );
}