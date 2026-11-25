import { memo } from 'react';
import { Check, X, Info, AlertTriangle } from 'lucide-react';

const TYPE_STYLES = {
  success: { gradient: 'linear-gradient(135deg, #00e67a 0%, #00b359 100%)', icon: <Check size={18} /> },
  error: { gradient: 'linear-gradient(135deg, #ff4d6a 0%, #cc0033 100%)', icon: <X size={18} /> },
  info: { gradient: 'linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%)', icon: <Info size={18} /> },
  warning: { gradient: 'linear-gradient(135deg, #ffb347 0%, #ff8c00 100%)', icon: <AlertTriangle size={18} /> },
};

const ToastContainer = memo(function ToastContainer({ toasts, onClose }) {
  if (!toasts || toasts.length === 0) return null;

  return (
    <div style={{
      position: 'fixed', bottom: '30px', right: '30px', zIndex: 9999,
      display: 'flex', flexDirection: 'column', gap: '10px', pointerEvents: 'none'
    }}>
      {toasts.map(t => {
        const style = TYPE_STYLES[t.type] || TYPE_STYLES.info;
        return (
          <div key={t.id} style={{
            background: style.gradient, color: '#0d0f12', padding: '14px 18px',
            borderRadius: '14px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
            display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '280px',
            maxWidth: '420px', animation: 'fadeSlideUp 0.2s ease-out',
            position: 'relative', pointerEvents: 'auto'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{
                fontSize: '18px', fontWeight: '900', width: '28px', height: '28px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.15)', borderRadius: '50%', flexShrink: 0
              }}>{style.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: '900', letterSpacing: '0.3px' }}>{t.title}</div>
                {t.message && <div style={{ fontSize: '12px', fontWeight: '600', opacity: 0.9, marginTop: '2px', wordBreak: 'break-word' }}>{t.message}</div>}
              </div>
              <button onClick={() => onClose(t.id)} style={{
                background: 'none', border: 'none', color: '#0d0f12', cursor: 'pointer',
                fontSize: '16px', opacity: 0.6, padding: '4px', lineHeight: '1',
                flexShrink: 0
              }}>x</button>
            </div>
            <div style={{
              height: '3px', background: 'rgba(0,0,0,0.2)', borderRadius: '2px',
              overflow: 'hidden', marginTop: '4px'
            }}>
              <div style={{
                width: `${t.progress || 0}%`, height: '100%', background: 'rgba(0,0,0,0.4)',
                borderRadius: '2px', transition: 'width 0.05s linear'
              }} />
            </div>
          </div>
        );
      })}
    </div>
  );
});

export default ToastContainer;
