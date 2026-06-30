const { getOptimizationLoader } = require('./optimizationConfigLoader.cjs');

const HARDWARE_TIERS = {
  cpu: {
    low: { maxCores: 4, maxThreads: 8 },
    mid: { maxCores: 8, maxThreads: 16 },
    high: { maxCores: 16, maxThreads: 32 },
    extreme: { maxCores: Infinity, maxThreads: Infinity }
  },
  ram: {
    low: { maxGB: 8 },
    mid: { maxGB: 16 },
    high: { maxGB: 32 },
    extreme: { maxGB: Infinity }
  },
  gpu: {
    low: { maxVRAM: 2 },
    mid: { maxVRAM: 6 },
    high: { maxVRAM: 12 },
    extreme: { maxVRAM: Infinity }
  }
};

function classifyTier(value, tiers) {
  for (const [tier, limits] of Object.entries(tiers)) {
    if (value <= limits.maxCores || value <= limits.maxThreads || value <= limits.maxGB || value <= limits.maxVRAM) {
      return tier;
    }
  }
  return 'extreme';
}

function getCPUTier(cpu) {
  const threads = cpu.logicalCores || cpu.cores || 4;
  if (threads <= 4) return 'low';
  if (threads <= 8) return 'mid';
  if (threads <= 16) return 'high';
  return 'extreme';
}

function getRAMTier(ram) {
  const gb = ram.totalGB || 8;
  if (gb <= 8) return 'low';
  if (gb <= 16) return 'mid';
  if (gb <= 32) return 'high';
  return 'extreme';
}

function getGPUTier(gpu) {
  if (!gpu || !gpu.vramGB) return 'low';
  const vram = gpu.vramGB;
  if (vram <= 2) return 'low';
  if (vram <= 6) return 'mid';
  if (vram <= 12) return 'high';
  return 'extreme';
}

function getOverallTier(cpuTier, ramTier, gpuTier) {
  const tierOrder = { low: 0, mid: 1, high: 2, extreme: 3 };
  const maxTier = Math.max(
    tierOrder[cpuTier] || 0,
    tierOrder[ramTier] || 0,
    tierOrder[gpuTier] || 0
  );
  return Object.keys(tierOrder).find(k => tierOrder[k] === maxTier) || 'mid';
}

const RECOMMENDATION_RULES = {
  low: {
    profile: 'heavy-modpack',
    reason: 'Hardware limitado - se requieren optimizaciones agresivas',
    categories: ['gpu_vram', 'cpu_maps', 'cpu_entities', 'engine_system', 'memory'],
    priority: 'critical',
    warnings: [
      'Se recomienda cerrar otras aplicaciones mientras juegas',
      'Considera asignar más RAM a Java (-Xmx4G mínimo)'
    ]
  },
  mid: {
    profile: 'heavy-modpack',
    reason: 'Hardware medio - optimizaciones balanceadas',
    categories: ['gpu_vram', 'cpu_maps', 'cpu_entities', 'engine_system'],
    priority: 'recommended',
    warnings: [
      'Buen equilibrio entre calidad y rendimiento'
    ]
  },
  high: {
    profile: 'default',
    reason: 'Hardware potente - optimizaciones ligeras',
    categories: ['gpu_vram', 'cpu_entities', 'engine_system'],
    priority: 'optional',
    warnings: [
      'Puedes permitirte calidad gráfica alta',
      'Las optimizaciones son opcionales'
    ]
  },
  extreme: {
    profile: 'default',
    reason: 'Hardware de alta gama - optimizaciones mínimas',
    categories: ['engine_system'],
    priority: 'optional',
    warnings: [
      'Hardware sobrado para cualquier modpack',
      'Enfócate en calidad visual sobre rendimiento'
    ]
  }
};

function generateRecommendation(hardware) {
  const cpuTier = getCPUTier(hardware.cpu);
  const ramTier = getRAMTier(hardware.ram);
  const gpuTier = getGPUTier(hardware.gpu);
  const overallTier = getOverallTier(cpuTier, ramTier, gpuTier);

  const recommendation = RECOMMENDATION_RULES[overallTier];

  return {
    tier: overallTier,
    cpuTier,
    ramTier,
    gpuTier,
    profile: recommendation.profile,
    reason: recommendation.reason,
    categories: recommendation.categories,
    priority: recommendation.priority,
    warnings: recommendation.warnings,
    hardware: {
      cpu: `${hardware.cpu.manufacturer} ${hardware.cpu.brand} (${hardware.cpu.logicalCores} hilos)`,
      ram: `${hardware.ram.totalGB} GB`,
      gpu: hardware.gpu ? `${hardware.gpu.vendor} ${hardware.gpu.model} (${hardware.gpu.vramGB} GB VRAM)` : 'No detectada'
    }
  };
}

async function getHardwareOptimizationProfile(hardware) {
  const recommendation = generateRecommendation(hardware);
  const loader = getOptimizationLoader();
  await loader.loadConfigs();
  
  const profile = loader.getConfig(recommendation.profile);
  const availableCategories = Object.keys(loader.getCategories());

  return {
    recommendation,
    availableProfiles: Array.from(loader.configs.keys()),
    availableCategories,
    activeCategories: recommendation.categories
  };
}

function getCategoryDescriptions() {
  return {
    gpu_vram: 'Reduce uso de VRAM (texturas, shaders, fog, mipmaps)',
    cpu_maps: 'Optimiza minimapas y mapas (actualización chunks, entidades)',
    cpu_entities: 'Reduce carga de entidades (culling, límites de spawn)',
    engine_system: 'Optimiza motor del juego (partículas, red, chunks)',
    memory: 'Gestión de memoria (GC, modernfix, smoothboot)',
    server_performance: 'Rendimiento servidor (TPS, entity activation)',
    server_entities: 'Entidades en servidor (view distance, mob caps)',
    server_network: 'Red servidor (compresión, keepalive)'
  };
}

module.exports = {
  generateRecommendation,
  getHardwareOptimizationProfile,
  getCategoryDescriptions,
  HARDWARE_TIERS,
  RECOMMENDATION_RULES
};