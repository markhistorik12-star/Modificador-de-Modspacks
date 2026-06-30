import { useState, useCallback, useEffect } from 'react';

export function useOptimization(packInfo, showToast) {
  const [optimizerStep, setOptimizerStep] = useState('idle');
  const [optimizerResults, setOptimizerResults] = useState([]);
  const [optimizerMessage, setOptimizerMessage] = useState('');
  const [hasBackup, setHasBackup] = useState(false);

  const handleOptimizationStart = useCallback(async () => {
    if (!window.electronAPI) return;
    const packPath = packInfo?.path || localStorage.getItem('lastModpackPath');
    setOptimizerStep('running');
    setOptimizerMessage('Analizando y optimizando archivos...');
    const res = await window.electronAPI.optimizationStart(packPath);
    if (res.success) {
      setOptimizerResults(res.results);
      setOptimizerMessage(res.message);
      setOptimizerStep('done');
      setHasBackup(res.results.length > 0);
      showToast("Optimización", res.message, "success");
    } else {
      setOptimizerMessage(res.message);
      setOptimizerStep('idle');
      showToast("Error de Optimización", res.message, "error");
    }
  }, [packInfo, showToast]);

  const handleOptimizationRollback = useCallback(async () => {
    if (!window.electronAPI) return;
    const packPath = packInfo?.path || localStorage.getItem('lastModpackPath');
    const res = await window.electronAPI.optimizationRollback(packPath);
    if (res.success) {
      setOptimizerStep('idle');
      setOptimizerResults([]);
      setHasBackup(false);
      showToast("Rollback", res.message, "success");
    } else {
      showToast("Error", res.message, "error");
    }
  }, [packInfo, showToast]);

  useEffect(() => {
    if (packInfo?.path && window.electronAPI?.optimizationCheckStatus) {
      (async () => {
        const res = await window.electronAPI.optimizationCheckStatus(packInfo.path);
        if (res.success && res.hasBackup) {
          setHasBackup(true);
          setOptimizerStep('done');
        }
      })();
    }
  }, [packInfo?.path]);

  return {
    optimizerStep, setOptimizerStep,
    optimizerResults, setOptimizerResults,
    optimizerMessage, setOptimizerMessage,
    hasBackup, setHasBackup,
    handleOptimizationStart, handleOptimizationRollback,
  };
}