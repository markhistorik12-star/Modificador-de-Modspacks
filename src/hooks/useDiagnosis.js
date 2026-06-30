import { useState, useCallback } from 'react';

export function useDiagnosis() {
  const [diagnosticReport, setDiagnosticReport] = useState(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);

  const handleDiagnosePack = useCallback(async (packPath) => {
    if (!window.electronAPI || !packPath) return null;
    setIsDiagnosing(true);
    const result = await window.electronAPI.diagnoseModpack(packPath);
    setIsDiagnosing(false);
    return result;
  }, []);

  return { diagnosticReport, setDiagnosticReport, isDiagnosing, setIsDiagnosing, handleDiagnosePack };
}