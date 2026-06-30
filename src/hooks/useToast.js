import { useState, useCallback } from 'react';

export function useToast() {
  const [toast, setToast] = useState({ show: false, title: '', message: '', type: 'success' });

  const showToast = useCallback((title, message, type = 'success') => {
    setToast({ show: true, title, message, type });
    setTimeout(() => setToast({ show: false, title: '', message: '', type: 'success' }), 4000);
  }, []);

  return { toast, showToast };
}