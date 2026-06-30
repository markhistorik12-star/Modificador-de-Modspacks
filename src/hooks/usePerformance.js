import { useState, useCallback, useEffect, useMemo } from 'react';

export function usePerformance(nodes) {
  const [hardwareSpecs, setHardwareSpecs] = useState(null);
  const [isCalculatingImpact, setIsCalculatingImpact] = useState(false);
  const [packInfo, setPackInfo] = useState(null);

  const modsOrdenados = useMemo(() => {
    return nodes
      .filter(n => n.type === 'mod')
      .map(n => ({
        id: n.id,
        label: n.data.label,
        impact: n.data.impactScore !== undefined ? n.data.impactScore : null
      }))
      .sort((a, b) => {
        if (a.impact === null || b.impact === null) return a.label.localeCompare(b.label);
        return b.impact - a.impact;
      });
  }, [nodes]);

  const modImpactStyles = useMemo(() => {
    return modsOrdenados.map(mod => {
      const hasImpact = mod.impact !== null;
      const isOpt = hasImpact && mod.impact < 0;
      const color = !hasImpact ? '#313244' : (isOpt ? '#a6e3a1' : (mod.impact > 60 ? '#f38ba8' : (mod.impact > 30 ? '#f9e2af' : '#89dceb')));
      const barWidth = !hasImpact ? 0 : (isOpt ? 100 : Math.min(mod.impact, 100));
      return { hasImpact, isOpt, color, barWidth };
    });
  }, [modsOrdenados]);

  const handleCalculateImpact = useCallback(async (packPath) => {
    if (!window.electronAPI || !packPath) return;
    setIsCalculatingImpact(true);
    const result = await window.electronAPI.calculateAllImpacts(packPath);
    if (result?.success) {
      return result.scores;
    }
    setIsCalculatingImpact(false);
    return null;
  }, []);

  useEffect(() => {
    const fetchHardware = async () => {
      if (window.electronAPI?.getSystemSpecs) {
        const specs = await window.electronAPI.getSystemSpecs();
        if (specs.success) setHardwareSpecs(specs.data);
      }
    };
    fetchHardware();
  }, []);

  return {
    hardwareSpecs, setHardwareSpecs,
    isCalculatingImpact, setIsCalculatingImpact,
    modsOrdenados, modImpactStyles,
    handleCalculateImpact,
    packInfo, setPackInfo,
  };
}