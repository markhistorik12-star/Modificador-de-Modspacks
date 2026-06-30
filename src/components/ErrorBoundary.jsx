import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReload = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#0d0f12', color: '#f8f9fa', fontFamily: 'sans-serif',
          padding: '40px', textAlign: 'center'
        }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>!</div>
          <h2 style={{ color: '#ff4d6a', margin: '0 0 8px' }}>Algo salio mal</h2>
          <p style={{ color: '#9ca3af', maxWidth: '500px', lineHeight: '1.5', margin: '0 0 24px' }}>
            La aplicacion encontro un error inesperado. Podes recargar la interfaz o revisar la consola para mas detalles.
          </p>
          <details style={{ background: '#1a1d24', borderRadius: '8px', padding: '12px', maxWidth: '600px', width: '100%', marginBottom: '24px', textAlign: 'left' }}>
            <summary style={{ cursor: 'pointer', color: '#00e5ff', fontWeight: 'bold' }}>Detalles tecnicos</summary>
            <pre style={{ marginTop: '8px', fontSize: '12px', color: '#9ca3af', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {this.state.error?.stack || this.state.error?.message || 'Sin detalles'}
            </pre>
          </details>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={this.handleReload} style={{
              background: '#00e5ff', color: '#0d0f12', border: 'none', padding: '10px 24px',
              borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px'
            }}>
              Reintentar
            </button>
            <button onClick={() => window.location.reload()} style={{
              background: 'transparent', color: '#f8f9fa', border: '1px solid #2a2e36', padding: '10px 24px',
              borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
            }}>
              Recargar todo
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
