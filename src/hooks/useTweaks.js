import { useState, useCallback, useEffect } from 'react';

const INITIAL_ITEM = {
  itemId: '',
  damage: '',
  attackSpeed: '',
  armor: '',
  toughness: '',
  knockbackResistance: '',
  maxDamage: '',
  maxStackSize: '',
  fireResistant: false,
};

const INITIAL_ENTITY = {
  entityId: '',
  mode: 'set',
  health: '',
  damage: '',
  speed: '',
  armor: '',
  knockbackResistance: '',
  followRange: '',
};

const INITIAL_SPAWN = {
  entityId: '',
  action: 'block',
  chance: 30,
  replaceWith: '',
  dimension: 'all',
  customDimension: '',
  minY: '',
  maxY: '',
  onlyBaby: false,
};

const INITIAL_LOOT_BUILDER = {
  editorMode: 'builder', // 'builder' | 'raw'
  targetType: 'entity',  // 'entity' | 'chest' | 'custom'
  targetId: 'minecraft:zombie',
  mode: 'add',           // 'add' | 'replace'
  drops: [{ itemId: 'minecraft:diamond', min: 1, max: 1, chance: 25 }],
  lootPath: 'data/minecraft/loot_tables/entities/zombie.json',
  patch: '{\n  "type": "minecraft:entity",\n  "pools": []\n}',
};

export function useTweaks(packInfo, _availableIds, showToast) {
  const [activeTweakTab, setActiveTweakTab] = useState('items');
  const [itemTweakData, setItemTweakData] = useState(INITIAL_ITEM);
  const [entityTweakData, setEntityTweakData] = useState(INITIAL_ENTITY);
  const [spawnCenter, setSpawnCenter] = useState(INITIAL_SPAWN);
  const [lootCenter, setLootCenter] = useState(INITIAL_LOOT_BUILDER);
  const [savedTweaks, setSavedTweaks] = useState({ items: {}, entities: {}, spawns: {}, loots: {} });

  const loadSavedTweaks = useCallback(async (targetPath) => {
    const p = targetPath || packInfo?.path;
    if (!p || !window.electronAPI?.tweaksList) return;
    const res = await window.electronAPI.tweaksList(p);
    if (res?.success && res.state) {
      setSavedTweaks(res.state);
    }
  }, [packInfo]);

  useEffect(() => {
    if (!packInfo?.path || !window.electronAPI?.tweaksList) return;
    let cancelled = false;
    window.electronAPI.tweaksList(packInfo.path).then(res => {
      if (!cancelled && res?.success && res.state) {
        setSavedTweaks(res.state);
      }
    });
    return () => { cancelled = true; };
  }, [packInfo?.path]);

  const handleItemTweak = useCallback(async () => {
    if (!packInfo?.path) return showToast('Error', 'Carga un modpack primero.', 'error');
    if (!itemTweakData.itemId.includes(':')) return showToast('Error', 'El ID debe tener formato mod:item', 'error');
    const res = await window.electronAPI.injectItemTweak(itemTweakData, packInfo.path);
    showToast('Ajuste de Item', res.message, res.success ? 'success' : 'error');
    if (res.success) {
      if (res.state) setSavedTweaks(res.state);
      setItemTweakData(INITIAL_ITEM);
    }
  }, [itemTweakData, packInfo, showToast]);

  const handleEditItemTweak = useCallback((entry) => {
    setItemTweakData({
      itemId: entry.itemId || '',
      damage: entry.damage ?? '',
      attackSpeed: entry.attackSpeed ?? '',
      armor: entry.armor ?? '',
      toughness: entry.toughness ?? '',
      knockbackResistance: entry.knockbackResistance ?? '',
      maxDamage: entry.maxDamage ?? '',
      maxStackSize: entry.maxStackSize ?? '',
      fireResistant: Boolean(entry.fireResistant),
    });
    setActiveTweakTab('items');
  }, []);

  const handleEntityTweak = useCallback(async () => {
    if (!packInfo?.path) return showToast('Error', 'Carga un modpack primero.', 'error');
    if (!entityTweakData.entityId.includes(':')) return showToast('Error', 'El ID debe tener formato mod:entidad', 'error');
    const res = await window.electronAPI.injectEntityTweak(entityTweakData, packInfo.path);
    showToast('Mutador Genetico', res.message, res.success ? 'success' : 'error');
    if (res.success) {
      if (res.state) setSavedTweaks(res.state);
      setEntityTweakData(INITIAL_ENTITY);
    }
  }, [entityTweakData, packInfo, showToast]);

  const handleEditEntityTweak = useCallback((entry) => {
    setEntityTweakData({
      entityId: entry.entityId || '',
      mode: entry.mode || 'set',
      health: entry.health ?? '',
      damage: entry.damage ?? '',
      speed: entry.speed ?? '',
      armor: entry.armor ?? '',
      knockbackResistance: entry.knockbackResistance ?? '',
      followRange: entry.followRange ?? '',
    });
    setActiveTweakTab('entities');
  }, []);

  const handleSpawnControl = useCallback(async () => {
    if (!packInfo?.path) return showToast('Error', 'Carga un modpack primero.', 'error');
    if (!spawnCenter.entityId.includes(':')) return showToast('Error', 'El ID debe tener formato mod:entidad', 'error');
    const effectiveDimension = spawnCenter.dimension === 'custom'
      ? spawnCenter.customDimension.trim()
      : spawnCenter.dimension;
    const payload = {
      ...spawnCenter,
      dimension: effectiveDimension || 'all',
    };
    const res = await window.electronAPI.injectSpawnControl(payload, packInfo.path);
    if (!res || !res.success) {
      showToast('Error de Spawn', res?.message || 'No se pudo guardar la regla', 'error');
      return;
    }
    if (res.state) setSavedTweaks(res.state);
    showToast('Control de Spawns', res.message, 'success');
    setSpawnCenter(INITIAL_SPAWN);
  }, [spawnCenter, packInfo, showToast]);

  const handleEditSpawnRule = useCallback((rule) => {
    const presetDims = ['all', 'minecraft:overworld', 'minecraft:the_nether', 'minecraft:the_end'];
    const dim = rule.dimension || 'all';
    const isPreset = presetDims.includes(dim);
    setSpawnCenter({
      entityId: rule.entityId || '',
      action: rule.action || 'block',
      chance: rule.chance ?? 30,
      replaceWith: rule.replaceWith || '',
      dimension: isPreset ? dim : 'custom',
      customDimension: isPreset ? '' : dim,
      minY: rule.minY ?? '',
      maxY: rule.maxY ?? '',
      onlyBaby: Boolean(rule.onlyBaby),
    });
    setActiveTweakTab('spawn');
  }, []);

  const handleLootPatch = useCallback(async () => {
    if (!packInfo?.path) return showToast('Error', 'Carga un modpack primero.', 'error');
    const gameVersion = packInfo?.gameVersion || '';

    if (lootCenter.editorMode === 'builder') {
      const payload = {
        targetType: lootCenter.targetType,
        targetId: lootCenter.targetId,
        mode: lootCenter.mode,
        drops: lootCenter.drops,
      };
      const res = await window.electronAPI.lootEditorApply(packInfo.path, payload, null, gameVersion);
      showToast('Editor de Loot', res?.message || 'Loot actualizado', res?.success ? 'success' : 'error');
      if (res?.success && res.state) setSavedTweaks(res.state);
      return;
    }

    try {
      const patchObj = JSON.parse(lootCenter.patch || '{}');
      const res = await window.electronAPI.lootEditorApply(packInfo.path, lootCenter.lootPath, patchObj, gameVersion);
      showToast('Editor de Loot', res?.message || 'Loot aplicado con exito', res?.success ? 'success' : 'error');
      if (res?.success && res.state) setSavedTweaks(res.state);
    } catch {
      showToast('Error de Formato', 'JSON invalido. Revisa la sintaxis.', 'error');
    }
  }, [lootCenter, packInfo, showToast]);

  const handleDeleteTweak = useCallback(async (category, id) => {
    if (!packInfo?.path || !window.electronAPI?.tweaksDelete) return;
    const res = await window.electronAPI.tweaksDelete(packInfo.path, category, id);
    showToast('Ajuste Eliminado', res?.message || '', res?.success ? 'info' : 'error');
    if (res?.success && res.state) {
      setSavedTweaks(res.state);
    }
  }, [packInfo, showToast]);

  return {
    activeTweakTab, setActiveTweakTab,
    itemTweakData, setItemTweakData, handleItemTweak, handleEditItemTweak,
    entityTweakData, setEntityTweakData, handleEntityTweak, handleEditEntityTweak,
    spawnCenter, setSpawnCenter, handleSpawnControl, handleEditSpawnRule,
    lootCenter, setLootCenter, handleLootPatch,
    savedTweaks, loadSavedTweaks, handleDeleteTweak,
  };
}
