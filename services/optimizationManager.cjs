const toml = require('@iarna/toml');

const OPTIMIZATION_MODS = ['sodium', 'lithium', 'phosphor', 'ferritecore', 'entityculling', 'modernfix', 'immediatelyfast', 'enhancedblockentities', 'starlight', 'canary', 'krypton', 'hydrogen', 'lazydfu', 'smoothboot', 'fastload', 'memoryleakfix', 'betterfpsdist', 'particleculling', 'connectivity', 'farsight', 'oculus'];

const HEAVY_MODS = ['create', 'mekanism', 'biomesoplenty', 'ad_astra', 'adastra', 'tectonic', 'terralith', 'alexsmobs', 'alexs_mobs', 'enderio', 'ender_io', 'thermal', 'draconicevolution', 'draconic_evolution', 'arsnouveau', 'ars_nouveau', 'botania', 'thaumcraft', 'twilightforest', 'iceandfire', 'ice_and_fire', 'minecolonies', 'appliedenergistics', 'refinedstorage', 'gregtech', 'gregtechceu', 'oculus', 'iris'];

const getModNameFromJar = (zip, fileName) => {
  try {
    const fabricJson = zip.getEntry('fabric.mod.json');
    if (fabricJson) {
      const data = JSON.parse(zip.readAsText(fabricJson));
      return (data.name || fileName).toLowerCase().replace(/[\s_-]/g, '');
    }
    const forgeToml = zip.getEntry('META-INF/mods.toml');
    if (forgeToml) {
      const data = toml.parse(zip.readAsText(forgeToml));
      if (data.mods && data.mods[0]) return (data.mods[0].modId || fileName).toLowerCase().replace(/[\s_-]/g, '');
    }
  } catch (e) {
    console.warn('[optimizationManager] Error parsing mod name:', e.message);
  }
  return fileName.toLowerCase().replace(/[\s_-]/g, '');
};

const OPTIMIZATION_CATEGORIES = {
  gpu_vram: {
    'sodium-options.json': { 'quality.graphics_quality': 'FANCY', 'quality.smooth_lighting': 'OFF', 'performance.fog': 'FAST' },
    'embeddium-options.json': { 'quality.graphics_quality': 'FANCY', 'quality.smooth_lighting': 'OFF', 'performance.fog': 'FAST' },
    'oculus.properties': { 'shaderPack': '', 'internalShaders': false, 'fog': false },
    'iris.properties': { 'shaderPack': '', 'internalShaders': false, 'fog': false }
  },
  cpu_maps: {
    'xaerominimap.toml': { 'enable_update_chunks': false, 'update_frequency': 0, 'enable_entity_icons': false, 'max_entities': 32 },
    'xaeroworldmap.toml': { 'enable_cave_mapping': false, 'max_zoom_level': 2 },
    'journeymap.core.config': { 'renderDistance': 2, 'surfaceMapping': false }
  },
  cpu_entities: {
    'entityculling.toml': { 'cull_blocks': true, 'cull_entities': true, 'cull_distance': 64 },
    'alexsmobs.toml': { 'limit_spawns': true, 'spawn_weight_multiplier': 0.5 },
    'iceandfire.toml': { 'dragon_spawn_distance': 1000, 'dragon_griefing': 0 },
    'physicsmod.json': { 'mobPhysics': false, 'blockPhysics': false, 'vinePhysics': false, 'itemPhysics': false }
  },
  engine_system: {
    'betterfpsdist.toml': { 'reduced_view_distance': 32, 'fast_render': true },
    'particleculling.properties': { 'cull_particles': true, 'max_particles': 200 },
    'connectivity.properties': { 'timeout': 10000, 'retry_attempts': 1 },
    'farsight.toml': { 'fake_chunks': false, 'max_chunks': 256 },
    'forge-client.toml': { 'alwaysSetupTerrainOffThread': true }
  }
};

const OPTIMIZATION_RULES = {};
for (const cat of Object.values(OPTIMIZATION_CATEGORIES)) {
  for (const [file, rules] of Object.entries(cat)) {
    if (!OPTIMIZATION_RULES[file]) OPTIMIZATION_RULES[file] = {};
    Object.assign(OPTIMIZATION_RULES[file], rules);
  }
}

const parseConfigValue = (raw, key) => {
  const ruleKey = Object.keys(OPTIMIZATION_RULES).find(r => key.endsWith(r)) || key;
  const rules = OPTIMIZATION_RULES[ruleKey];
  if (!rules) return null;
  const val = rules[key];
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return String(val);
  return val;
};

module.exports = {
  OPTIMIZATION_MODS,
  HEAVY_MODS,
  getModNameFromJar,
  OPTIMIZATION_CATEGORIES,
  OPTIMIZATION_RULES,
  parseConfigValue,
};
