import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

window.onerror = (msg, url, line, col, error) => {
  console.error('[GLOBAL]', msg, { url, line, col, error });
};

window.addEventListener('unhandledrejection', (event) => {
  console.error('[UNHANDLED_REJECTION]', event.reason);
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
