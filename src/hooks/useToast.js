import { useState, useCallback, useRef } from 'react';

export function useToast() {
  const [toast, setToast] = useState({ show: false, title: '', message: '', type: 'success' });

  const showToast = useCallback((title, message, type = 'success') => {
    setToast({ show: true, title, message, type });
    setTimeout(() => setToast({ show: false, title: '', message: '', type: 'success' }), 4000);
  }, []);

  return { toast, showToast };
}

let toastIdCounter = 0;

// Variante con cola y barra de progreso usada por ScriptEditor + ToastContainer
export function useToastList() {
  const [toasts, setToasts] = useState([]);
  const timersRef = useRef({});
  const progressRef = useRef({});

  const removeToast = useCallback((id) => {
    clearTimeout(timersRef.current[id]);
    clearInterval(progressRef.current[id]);
    delete timersRef.current[id];
    delete progressRef.current[id];
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback((title, message, type = 'success', duration = 4000) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, title, message, type, progress: 100 }]);

    const startTime = Date.now();
    progressRef.current[id] = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.max(0, 100 - (elapsed / duration) * 100);
      setToasts(prev => prev.map(t => t.id === id ? { ...t, progress } : t));
    }, 50);

    timersRef.current[id] = setTimeout(() => removeToast(id), duration);
    return id;
  }, [removeToast]);

  return { toasts, showToast, removeToast };
}
