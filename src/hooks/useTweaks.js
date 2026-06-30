import { useState, useCallback } from 'react';

export function useTweaks(packInfo, availableIds, showToast) {
  const [activeTweakTab, setActiveTweakTab] = useState('items');
  const [itemTweakData, setItemTweakData] = useState({ itemId: '', damage: '', armor: '', toughness: '' });
  const [entityTweakData, setEntityTweakData] = useState({ entityId: '', health: '', damage: '', speed: '' });
  const [spawnCenter, setSpawnCenter] = useState({ entityId: 'minecraft:zombie', health: 20, speed: 0.2, damage: 5 });
  const [lootCenter, setLootCenter] = useState({ lootPath: 'data/minecraft/loot_tables/entities/zombie.json', patch: '{"sample":1}' });

  const handleItemTweak = useCallback(async () => {
    if (!itemTweakData.itemId.includes(':')) return showToast("Error", "El ID debe tener formato mod:item", "error");
    const res = await window.electronAPI.injectItemTweak(itemTweakData, packInfo.path);
    showToast("Inyección KubeJS", res.message, res.success ? "success" : "error");
    if (res.success) setItemTweakData({ itemId: '', damage: '', armor: '', toughness: '' });
  }, [itemTweakData, packInfo, showToast]);

  const handleEntityTweak = useCallback(async () => {
    if (!entityTweakData.entityId.includes(':')) return showToast("Error", "El ID debe tener formato mod:entidad", "error");
    const res = await window.electronAPI.injectEntityTweak(entityTweakData, packInfo.path);
    showToast("Mutación Genética", res.message, res.success ? "success" : "error");
    if (res.success) setEntityTweakData({ entityId: '', health: '', damage: '', speed: '' });
  }, [entityTweakData, packInfo, showToast]);

  const handleSpawnControl = useCallback(async () => {
    const packPath = packInfo?.path || localStorage.getItem('lastModpackPath');
    const res = await window.electronAPI.injectSpawnControl(spawnCenter, packPath);
    showToast("Regla de Spawn", res?.message || 'Acción ejecutada', "success");
  }, [spawnCenter, packInfo, showToast]);

  const handleLootPatch = useCallback(async () => {
    try {
      const packPath = packInfo?.path || localStorage.getItem('lastModpackPath');
      const patchObj = JSON.parse(lootCenter.patch || '{}');
      const res = await window.electronAPI.lootEditorApply(packPath, lootCenter.lootPath, patchObj);
      showToast("Editor de Loot", res?.message || 'Loot aplicado con éxito', "success");
    } catch (err) {
      showToast("Error de Formato", 'JSON patch inválido. Revisa la sintaxis.', "error");
    }
  }, [lootCenter, packInfo, showToast]);

  return {
    activeTweakTab, setActiveTweakTab,
    itemTweakData, setItemTweakData, handleItemTweak,
    entityTweakData, setEntityTweakData, handleEntityTweak,
    spawnCenter, setSpawnCenter, handleSpawnControl,
    lootCenter, setLootCenter, handleLootPatch,
  };
}