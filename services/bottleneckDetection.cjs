const fs = require('fs').promises;
const path = require('path');
const AdmZip = require('adm-zip');
const opt = require('./optimizationManager.cjs');
const toml = require('@iarna/toml');

const BOTTLENECK_INDICATORS = {
  gpu: {
    keywords: ['shader', 'render', 'texture', 'model', 'iris', 'oculus', 'sodium', 'embeddium', 'canvas', 'rubidium'],
    configFiles: ['sodium-options.json', 'embeddium-options.json', 'oculus.properties', 'iris.properties', 'rubidium.properties'],
    heavyMods: ['create', 'mekanism', 'allthemodium', 'ars_nouveau', 'botania', 'enderio', 'thermal', 'draconic_evolution']
  },
  cpu: {
    keywords: ['entity', 'tick', 'logic', 'pathfinding', 'spawn', 'ai', 'physics'],
    configFiles: ['entityculling.toml', 'alexsmobs.toml', 'iceandfire.toml', 'physicsmod.json', 'betterfpsdist.toml', 'particleculling.properties', 'connectivity.properties', 'farsight.toml'],
    heavyMods: ['create', 'minecolonies', 'alexsmobs', 'alexs_mobs', 'iceandfire', 'ice_and_fire', 'enderio', 'thermal', 'mekanism']
  },
  ram: {
    keywords: ['memory', 'leak', 'cache', 'chunk', 'region', 'storage'],
    configFiles: ['ferritecore.toml', 'lazydfu.toml', 'smoothboot.toml', 'fastload.toml', 'memoryleakfix.toml'],
    heavyMods: ['appliedenergistics', 'refinedstorage', 'mekanism', 'create', 'gregtech', 'gregtechceu']
  },
  disk: {
    keywords: ['log', 'dump', 'world', 'save', 'backup'],
    configFiles: ['log4j2.xml', 'log4j2.properties'],
    heavyMods: []
  }
};

const parseConfigFile = async (filePath, content) => {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === '.json') return JSON.parse(content);
    if (ext === '.toml') return toml.parse(content);
    if (ext === '.properties') {
      const obj = {};
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#') && !trimmed.startsWith('!')) {
          const idx = trimmed.indexOf('=');
          if (idx > 0) {
            const key = trimmed.slice(0, idx).trim();
            const val = trimmed.slice(idx + 1).trim();
            obj[key] = val;
          }
        }
      }
      return obj;
    }
  } catch (e) {
    console.warn('[bottleneckDetection] Error parsing config file:', e.message);
  }
  return null;
};

const extractModIdFromJar = async (jarPath) => {
  try {
    const zip = new AdmZip(jarPath);
    return opt.getModNameFromJar(zip, path.basename(jarPath));
  } catch {
    return path.basename(jarPath, '.jar').toLowerCase().replace(/[\s_-]/g, '');
  }
};

const analyzeMods = async (modsPath) => {
  const files = await fs.readdir(modsPath);
  const jarFiles = files.filter(f => f.endsWith('.jar'));
  
  const mods = [];
  for (const file of jarFiles) {
    const modId = await extractModIdFromJar(path.join(modsPath, file));
    const stats = await fs.stat(path.join(modsPath, file));
    mods.push({
      id: modId,
      file,
      size: stats.size,
      isOptimization: opt.OPTIMIZATION_MODS.some(k => modId.includes(k)),
      isHeavy: opt.HEAVY_MODS.some(k => modId.includes(k))
    });
  }
  return mods;
};

const scanConfigFiles = async (configPath) => {
  const configs = [];
  try {
    const files = await fs.readdir(configPath);
    for (const file of files) {
      const fullPath = path.join(configPath, file);
      const stat = await fs.stat(fullPath);
      if (stat.isFile()) {
        const content = await fs.readFile(fullPath, 'utf-8');
        if (Buffer.byteLength(content, 'utf-8') > 10 * 1024 * 1024) {
          console.warn(`[bottleneckDetection] File too large, skipping: ${fullPath}`);
          continue;
        }
        const parsed = await parseConfigFile(fullPath, content);
        if (parsed) {
          configs.push({ file, content: parsed });
        }
      }
    }
  } catch (e) {
    console.warn('[bottleneckDetection] Error scanning config files:', e.message);
  }
  return configs;
};

const analyzeBottlenecks = (mods, configs, hardware) => {
  const bottlenecks = {
    gpu: { score: 0, evidence: [], severity: 'low' },
    cpu: { score: 0, evidence: [], severity: 'low' },
    ram: { score: 0, evidence: [], severity: 'low' },
    disk: { score: 0, evidence: [], severity: 'low' }
  };

  const heavyModCount = mods.filter(m => m.isHeavy).length;
  const optimizationModCount = mods.filter(m => m.isOptimization).length;

  if (heavyModCount > 5) {
    bottlenecks.gpu.score += 2;
    bottlenecks.gpu.evidence.push(`${heavyModCount} mods pesados detectados (Create, Mekanism, etc.)`);
    bottlenecks.cpu.score += 2;
    bottlenecks.cpu.evidence.push(`${heavyModCount} mods con lógica pesada`);
  }

  if (optimizationModCount === 0) {
    bottlenecks.gpu.score += 1;
    bottlenecks.gpu.evidence.push('Sin mods de optimización instalados (Sodium, Lithium, etc.)');
    bottlenecks.cpu.score += 1;
    bottlenecks.cpu.evidence.push('Sin mods de optimización instalados');
  }

  for (const [type, indicators] of Object.entries(BOTTLENECK_INDICATORS)) {
    for (const config of configs) {
      const fileLower = config.file.toLowerCase();
      if (indicators.configFiles.some(c => fileLower.includes(c.toLowerCase()))) {
        bottlenecks[type].score += 1;
        bottlenecks[type].evidence.push(`Config detectada: ${config.file}`);
      }
    }
  }

  if (hardware.gpu) {
    if (hardware.gpu.vramGB < 4) {
      bottlenecks.gpu.score += 3;
      bottlenecks.gpu.evidence.push(`VRAM baja: ${hardware.gpu.vramGB}GB`);
    } else if (hardware.gpu.vramGB < 8) {
      bottlenecks.gpu.score += 1;
      bottlenecks.gpu.evidence.push(`VRAM moderada: ${hardware.gpu.vramGB}GB`);
    }
  } else {
    bottlenecks.gpu.score += 1;
    bottlenecks.gpu.evidence.push('GPU dedicada no detectada (gráficos integrados?)');
  }

  if (hardware.cpu.physicalCores < 4) {
    bottlenecks.cpu.score += 3;
    bottlenecks.cpu.evidence.push(`CPU con pocos núcleos: ${hardware.cpu.physicalCores}`);
  } else if (hardware.cpu.physicalCores < 6) {
    bottlenecks.cpu.score += 1;
    bottlenecks.cpu.evidence.push(`CPU con ${hardware.cpu.physicalCores} núcleos físicos`);
  }

  if (hardware.ram.totalGB < 8) {
    bottlenecks.ram.score += 3;
    bottlenecks.ram.evidence.push(`RAM total baja: ${hardware.ram.totalGB}GB`);
  } else if (hardware.ram.totalGB < 16) {
    bottlenecks.ram.score += 1;
    bottlenecks.ram.evidence.push(`RAM moderada: ${hardware.ram.totalGB}GB`);
  }

  for (const [type, b] of Object.entries(bottlenecks)) {
    if (b.score >= 5) b.severity = 'critical';
    else if (b.score >= 3) b.severity = 'high';
    else if (b.score >= 2) b.severity = 'medium';
  }

  return bottlenecks;
};

const generateRecommendations = (bottlenecks) => {
  const recs = [];
  
  const priority = ['critical', 'high', 'medium', 'low'];
  for (const sev of priority) {
    for (const [type, b] of Object.entries(bottlenecks)) {
      if (b.severity === sev && b.score > 0) {
        switch (type) {
          case 'gpu':
            recs.push({
              type: 'gpu',
              severity: sev,
              title: 'Cuello de botella GPU/VRAM',
              actions: [
                'Instalar Sodium / Embeddium / Rubidium',
                'Instalar Iris / Oculus para shaders',
                'Reducir calidad gráfica (FANCY -> FAST)',
                'Desactivar smooth lighting, clouds, fancy particles',
                'Usar FerriteCore para reducir uso de VRAM'
              ]
            });
            break;
          case 'cpu':
            recs.push({
              type: 'cpu',
              severity: sev,
              title: 'Cuello de botella CPU/Tick',
              actions: [
                'Instalar Lithium / Starlight / Krypton',
                'Instalar EntityCulling / ParticleCulling',
                'Reducir render distance en config',
                'Desactivar entity tracking innecesario (JourneyMap, Xaero)',
                'Usar Spark / TickCentral para profiling'
              ]
            });
            break;
          case 'ram':
            recs.push({
              type: 'ram',
              severity: sev,
              title: 'Presión de memoria RAM',
              actions: [
                'Instalar FerriteCore / MemoryLeakFix',
                'Aumentar -Xmx (ej: -Xmx6G)',
                'Instalar LazyDFU / SmoothBoot / FastLoad',
                'Reducir chunk cache en server.properties'
              ]
            });
            break;
          case 'disk':
            recs.push({
              type: 'disk',
              severity: sev,
              title: 'I/O de disco',
              actions: [
                'Mover mundo a SSD/NVMe',
                'Desactivar logs verbosos (log4j2.xml)',
                'Configurar auto-save interval mayor'
              ]
            });
            break;
        }
      }
    }
  }
  
  return recs;
};

const analyzeBottlenecksAsync = async (packPath, hardwareSpecs) => {
  const modsPath = path.join(packPath, 'mods');
  const configPath = path.join(packPath, 'config');

  const [mods, configs] = await Promise.all([
    analyzeMods(modsPath),
    scanConfigFiles(configPath)
  ]);

  const bottlenecks = analyzeBottlenecks(mods, configs, hardwareSpecs);
  const recommendations = generateRecommendations(bottlenecks);

  return {
    timestamp: new Date().toISOString(),
    packPath,
    hardware: hardwareSpecs,
    modSummary: {
      total: mods.length,
      heavy: mods.filter(m => m.isHeavy).length,
      optimization: mods.filter(m => m.isOptimization).length,
      mods: mods.map(m => ({ id: m.id, file: m.file, heavy: m.isHeavy, optimization: m.isOptimization }))
    },
    configsScanned: configs.map(c => c.file),
    bottlenecks,
    recommendations,
    summary: {
      overallScore: Math.round((Object.values(bottlenecks).reduce((a, b) => a + b.score, 0) / 20) * 100),
      criticalCount: Object.values(bottlenecks).filter(b => b.severity === 'critical').length,
      highCount: Object.values(bottlenecks).filter(b => b.severity === 'high').length
    }
  };
};

const quickScan = async (packPath) => {
  const modsPath = path.join(packPath, 'mods');
  const files = await fs.readdir(modsPath).catch(() => []);
  const jarFiles = files.filter(f => f.endsWith('.jar'));
  
  let heavyCount = 0, optCount = 0;
  for (const file of jarFiles) {
    const modId = await extractModIdFromJar(path.join(modsPath, file));
    if (opt.HEAVY_MODS.some(k => modId.includes(k))) heavyCount++;
    if (opt.OPTIMIZATION_MODS.some(k => modId.includes(k))) optCount++;
  }

  return {
    modsFound: jarFiles.length,
    heavyMods: heavyCount,
    optimizationMods: optCount,
    hasOptimizationMods: optCount > 0,
    riskLevel: heavyCount > 5 && optCount === 0 ? 'high' : (heavyCount > 2 ? 'medium' : 'low')
  };
};

module.exports = {
  analyzeBottlenecks: analyzeBottlenecksAsync,
  quickScan,
  BOTTLENECK_INDICATORS,
  analyzeMods,
  scanConfigFiles
};