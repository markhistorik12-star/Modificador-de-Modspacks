import { useState, useCallback, useEffect } from 'react';

const ALL_CATEGORIES = ['gpu_vram', 'cpu_maps', 'cpu_entities', 'engine_system'];

export function useOptimization(packInfo, showToast) {
  const [optimizerStep, setOptimizerStep] = useState('idle');
  const [optimizerResults, setOptimizerResults] = useState([]);
  const [optimizerMessage, setOptimizerMessage] = useState('');
  const [hasBackup, setHasBackup] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState(ALL_CATEGORIES);
  const [selectedProfile, setSelectedProfile] = useState('default');
  const [availableProfiles, setAvailableProfiles] = useState([
    { id: 'default', name: 'Estandar Equilibrado', description: 'Ajustes recomendados sin sacrificar calidad visual clave.' },
    { id: 'heavy-modpack', name: 'Modpack Pesado (+150 mods)', description: 'Prioriza FPS y reduccion agresiva de carga en CPU/VRAM.' },
    { id: 'server', name: 'Servidor / Multijugador', description: 'Enfocado en distancia de simulacion, entidades y red.' },
  ]);

  const toggleCategory = useCallback((catId) => {
    setSelectedCategories(prev =>
      prev.includes(catId) ? prev.filter(c => c !== catId) : [...prev, catId]
    );
  }, []);

  const handleOptimizationStart = useCallback(async () => {
    if (!window.electronAPI) return;
    const packPath = packInfo?.path || localStorage.getItem('lastModpackPath');
    if (!packPath) {
      showToast('Error', 'Carga un modpack primero.', 'error');
      return;
    }
    if (selectedCategories.length === 0) {
      showToast('Atencion', 'Selecciona al menos una categoria para optimizar.', 'warning');
      return;
    }
    setOptimizerStep('running');
    setOptimizerMessage('Analizando y optimizando archivos de configuracion...');
    const res = await window.electronAPI.optimizationStart(packPath, selectedCategories, selectedProfile);
    if (res.success) {
      setOptimizerResults(res.results);
      setOptimizerMessage(res.message);
      setOptimizerStep('done');
      setHasBackup(res.results.length > 0);
      showToast('Optimizacion', res.message, res.results.length > 0 ? 'success' : 'info');
    } else {
      setOptimizerMessage(res.message);
      setOptimizerStep('idle');
      showToast('Error de Optimizacion', res.message, 'error');
    }
  }, [packInfo, selectedCategories, selectedProfile, showToast]);

  const handleOptimizationRollback = useCallback(async () => {
    if (!window.electronAPI) return;
    const packPath = packInfo?.path || localStorage.getItem('lastModpackPath');
    const res = await window.electronAPI.optimizationRollback(packPath);
    if (res.success) {
      setOptimizerStep('idle');
      setOptimizerResults([]);
      setHasBackup(false);
      showToast('Rollback', res.message, 'success');
    } else {
      showToast('Error', res.message, 'error');
    }
  }, [packInfo, showToast]);

  useEffect(() => {
    if (!window.electronAPI?.optimizationConfigsList) return;
    let cancelled = false;
    window.electronAPI.optimizationConfigsList().then(res => {
      if (!cancelled && res?.success && res.configs) {
        const list = Object.values(res.configs);
        if (list.length > 0) setAvailableProfiles(list);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (packInfo?.path && window.electronAPI?.optimizationCheckStatus) {
      let cancelled = false;
      window.electronAPI.optimizationCheckStatus(packInfo.path).then(res => {
        if (!cancelled) {
          if (res.success && res.hasBackup) {
            setHasBackup(true);
            setOptimizerStep('done');
          } else {
            setHasBackup(false);
            setOptimizerStep('idle');
          }
        }
      });
      return () => { cancelled = true; };
    }
  }, [packInfo?.path]);

  return {
    optimizerStep, setOptimizerStep,
    optimizerResults, setOptimizerResults,
    optimizerMessage, setOptimizerMessage,
    hasBackup, setHasBackup,
    selectedCategories, toggleCategory,
    selectedProfile, setSelectedProfile, availableProfiles,
    handleOptimizationStart, handleOptimizationRollback,
  };
}
