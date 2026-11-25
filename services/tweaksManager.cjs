// services/tweaksManager.cjs
// Motor centralizado de ajustes de balance (Tweaks) para Modpack Assist.
// Mantiene un registro persistente en kubejs/.modpack_assist_tweaks.json y
// regenera scripts KubeJS limpios, validados y sin bloques duplicados.

const fs = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const sec = require('./security.cjs');

const REGISTRY_REL_PATH = 'kubejs/.modpack_assist_tweaks.json';
const ITEM_SCRIPT_REL = 'kubejs/startup_scripts/1_item_tweaks.js';
const ENTITY_SCRIPT_REL = 'kubejs/server_scripts/2_entity_tweaks.js';
const SPAWN_SCRIPT_REL = 'kubejs/server_scripts/3_spawn_tweaks.js';
const LOOT_SCRIPT_REL = 'kubejs/server_scripts/4_loot_tweaks.js';

const DEFAULT_STATE = () => ({
  version: 1,
  items: {},    // { [itemId]: { itemId, damage, attackSpeed, armor, toughness, knockbackResistance, maxDamage, maxStackSize, fireResistant, updatedAt } }
  entities: {}, // { [entityId]: { entityId, mode, health, damage, speed, armor, knockbackResistance, followRange, updatedAt } }
  spawns: {},   // { [ruleId]: { id, entityId, action, chance, replaceWith, dimension, minY, maxY, onlyBaby, updatedAt } }
  loots: {},    // { [ruleId]: { id, targetType, targetId, mode, drops, lootFilePath, updatedAt } }
});

// Parsea un numero opcional. Devuelve null si esta vacio, o lanza Error si no es finito.
function parseOptionalNumber(val, fieldName, { min = -Infinity, max = Infinity, integer = false } = {}) {
  if (val === undefined || val === null || String(val).trim() === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num)) {
    throw new Error(`Valor numerico invalido en ${fieldName}.`);
  }
  if (integer && !Number.isInteger(num)) {
    throw new Error(`${fieldName} debe ser un numero entero.`);
  }
  if (num < min || num > max) {
    throw new Error(`${fieldName} debe estar entre ${min} y ${max}.`);
  }
  return num;
}

function validatePackPath(packPath) {
  if (!packPath || typeof packPath !== 'string' || packPath.includes('..') || packPath.includes('~')) {
    throw new Error('Ruta del modpack invalida.');
  }
  if (!path.isAbsolute(packPath)) {
    throw new Error('La ruta del modpack debe ser absoluta.');
  }
}

function isMc121OrNewer(gameVersion) {
  if (!gameVersion || typeof gameVersion !== 'string') return false;
  const m = gameVersion.trim().match(/^(\d+)\.(\d+)/);
  if (!m) return false;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  return major > 1 || (major === 1 && minor >= 21);
}

async function loadState(packPath) {
  validatePackPath(packPath);
  const regPath = sec.sanitizePath(REGISTRY_REL_PATH, packPath);
  if (!regPath) throw new Error('Ruta de registro invalida.');
  try {
    const raw = await fs.readFile(regPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      version: 1,
      items: parsed.items && typeof parsed.items === 'object' ? parsed.items : {},
      entities: parsed.entities && typeof parsed.entities === 'object' ? parsed.entities : {},
      spawns: parsed.spawns && typeof parsed.spawns === 'object' ? parsed.spawns : {},
      loots: parsed.loots && typeof parsed.loots === 'object' ? parsed.loots : {},
    };
  } catch {
    return DEFAULT_STATE();
  }
}

async function saveState(packPath, state) {
  const regPath = sec.sanitizePath(REGISTRY_REL_PATH, packPath);
  if (!regPath) throw new Error('Ruta de registro invalida.');
  await fs.mkdir(path.dirname(regPath), { recursive: true });
  await fs.writeFile(regPath, JSON.stringify(state, null, 2), 'utf-8');
}

async function writeOrCleanupScript(packPath, relPath, content, hasRules) {
  const fullPath = sec.sanitizePath(relPath, packPath);
  if (!fullPath) throw new Error('Ruta de script invalida.');
  if (!hasRules) {
    await fs.unlink(fullPath).catch(() => {});
    return;
  }
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf-8');
}

// --- GENERADORES DE SCRIPTS KUBEJS ---

function generateItemScript(itemsMap) {
  const entries = Object.values(itemsMap);
  if (entries.length === 0) return '';

  const lines = [
    '// Generado automaticamente por Modpack Assist - Ajuste de Items',
    '// Requiere reiniciar el juego o ejecutar /kubejs reload startup_scripts',
    'ItemEvents.modification(event => {',
  ];

  for (const item of entries) {
    const safeId = sec.sanitizeForScript(item.itemId);
    lines.push(`  event.modify('${safeId}', item => {`);
    if (item.damage !== null && item.damage !== undefined) {
      lines.push(`    item.attackDamage = ${item.damage};`);
    }
    if (item.attackSpeed !== null && item.attackSpeed !== undefined) {
      lines.push(`    item.attackSpeed = ${item.attackSpeed};`);
    }
    if (item.armor !== null && item.armor !== undefined) {
      lines.push(`    item.armorProtection = ${item.armor};`);
    }
    if (item.toughness !== null && item.toughness !== undefined) {
      lines.push(`    item.armorToughness = ${item.toughness};`);
    }
    if (item.knockbackResistance !== null && item.knockbackResistance !== undefined) {
      lines.push(`    item.armorKnockbackResistance = ${item.knockbackResistance};`);
    }
    if (item.maxDamage !== null && item.maxDamage !== undefined) {
      lines.push(`    item.maxDamage = ${item.maxDamage};`);
    }
    if (item.maxStackSize !== null && item.maxStackSize !== undefined) {
      lines.push(`    item.maxStackSize = ${item.maxStackSize};`);
    }
    if (item.fireResistant === true) {
      lines.push('    item.fireResistant = true;');
    }
    lines.push('  });');
  }

  lines.push('});', '');
  return lines.join('\n');
}

function generateEntityScript(entitiesMap) {
  const entries = Object.values(entitiesMap);
  if (entries.length === 0) return '';

  const rulesJson = {};
  for (const e of entries) {
    const safeId = sec.sanitizeForScript(e.entityId);
    rulesJson[safeId] = {
      mode: e.mode === 'multiply' ? 'multiply' : 'set',
      health: e.health ?? null,
      damage: e.damage ?? null,
      speed: e.speed ?? null,
      armor: e.armor ?? null,
      knockbackResistance: e.knockbackResistance ?? null,
      followRange: e.followRange ?? null,
    };
  }

  // Helper compatible con Minecraft 1.18-1.20 ('minecraft:generic.x') y 1.21+ ('minecraft:x')
  return [
    '// Generado automaticamente por Modpack Assist - Mutador Genetico',
    '// Se puede recargar en partida con /reload',
    `const MA_ENTITY_RULES = ${JSON.stringify(rulesJson, null, 2)};`,
    '',
    'function maApplyAttr(entity, legacyId, modernId, value, isMultiply) {',
    '  let applied = false;',
    '  for (const attrId of [legacyId, modernId]) {',
    '    try {',
    '      const base = isMultiply ? entity.getAttributeBaseValue(attrId) : 0;',
    '      if (isMultiply && !(base > 0)) continue;',
    '      const finalVal = isMultiply ? base * value : value;',
    '      entity.setAttributeBaseValue(attrId, finalVal);',
    '      applied = true;',
    '      break;',
    '    } catch (e) {}',
    '  }',
    '  return applied;',
    '}',
    '',
    'EntityEvents.spawned(event => {',
    '  if (event.level.clientSide) return;',
    '  const entity = event.entity;',
    '  if (!entity || !entity.isLiving || !entity.isLiving()) return;',
    '  const rule = MA_ENTITY_RULES[String(entity.type)];',
    '  if (!rule) return;',
    '  if (entity.persistentData && entity.persistentData.contains("ma_mutated")) return;',
    '  if (entity.persistentData) entity.persistentData.putBoolean("ma_mutated", true);',
    '  const mult = rule.mode === "multiply";',
    '  if (rule.health !== null) {',
    '    const ok = maApplyAttr(entity, "minecraft:generic.max_health", "minecraft:max_health", rule.health, mult);',
    '    if (ok) {',
    '      try { entity.setHealth(entity.getMaxHealth()); } catch (e) {}',
    '    }',
    '  }',
    '  if (rule.damage !== null) {',
    '    maApplyAttr(entity, "minecraft:generic.attack_damage", "minecraft:attack_damage", rule.damage, mult);',
    '  }',
    '  if (rule.speed !== null) {',
    '    maApplyAttr(entity, "minecraft:generic.movement_speed", "minecraft:movement_speed", rule.speed, mult);',
    '  }',
    '  if (rule.armor !== null) {',
    '    maApplyAttr(entity, "minecraft:generic.armor", "minecraft:armor", rule.armor, mult);',
    '  }',
    '  if (rule.knockbackResistance !== null) {',
    '    maApplyAttr(entity, "minecraft:generic.knockback_resistance", "minecraft:knockback_resistance", rule.knockbackResistance, mult);',
    '  }',
    '  if (rule.followRange !== null) {',
    '    maApplyAttr(entity, "minecraft:generic.follow_range", "minecraft:follow_range", rule.followRange, mult);',
    '  }',
    '});',
    '',
  ].join('\n');
}

function generateSpawnScript(spawnsMap) {
  const entries = Object.values(spawnsMap);
  if (entries.length === 0) return '';

  const cleanEntries = entries.map(r => ({
    entityId: sec.sanitizeForScript(r.entityId),
    action: r.action || 'block',
    chance: r.chance ?? 100,
    replaceWith: r.replaceWith ? sec.sanitizeForScript(r.replaceWith) : null,
    dimension: r.dimension && r.dimension !== 'all' ? sec.sanitizeForScript(r.dimension) : null,
    minY: r.minY ?? null,
    maxY: r.maxY ?? null,
    onlyBaby: Boolean(r.onlyBaby),
  }));

  return [
    '// Generado automaticamente por Modpack Assist - Control de Spawns',
    '// Se puede recargar en partida con /reload',
    `const MA_SPAWN_RULES = ${JSON.stringify(cleanEntries, null, 2)};`,
    '',
    'EntityEvents.spawned(event => {',
    '  if (event.level.clientSide) return;',
    '  const entity = event.entity;',
    '  if (!entity) return;',
    '  if (entity.persistentData && entity.persistentData.contains("ma_spawn_checked")) return;',
    '  if (entity.persistentData) entity.persistentData.putBoolean("ma_spawn_checked", true);',
    '  const mobId = String(entity.type);',
    '  const dimId = String(event.level.dimension);',
    '  const y = entity.y;',
    '',
    '  for (const rule of MA_SPAWN_RULES) {',
    '    if (rule.entityId !== mobId) continue;',
    '    if (rule.dimension && rule.dimension !== dimId) continue;',
    '    if (rule.minY !== null && y < rule.minY) continue;',
    '    if (rule.maxY !== null && y > rule.maxY) continue;',
    '    if (rule.onlyBaby && (!entity.isBaby || !entity.isBaby())) continue;',
    '',
    '    if (rule.action === "block") {',
    '      event.cancel();',
    '      return;',
    '    }',
    '    if (rule.action === "chance") {',
    '      if (Math.random() * 100 > rule.chance) {',
    '        event.cancel();',
    '        return;',
    '      }',
    '    }',
    '    if (rule.action === "replace" && rule.replaceWith) {',
    '      if (Math.random() * 100 <= rule.chance) {',
    '        try {',
    '          const replacement = event.level.createEntity(rule.replaceWith);',
    '          if (replacement) {',
    '            replacement.setPosition(entity.x, entity.y, entity.z);',
    '            if (replacement.persistentData) replacement.persistentData.putBoolean("ma_spawn_checked", true);',
    '            replacement.spawn();',
    '            event.cancel();',
    '            return;',
    '          }',
    '        } catch (e) {}',
    '      }',
    '    }',
    '  }',
    '});',
    '',
  ].join('\n');
}

function generateAdditiveEntityLootScript(lootsMap) {
  const entries = Object.values(lootsMap).filter(
    l => l.targetType === 'entity' && l.mode === 'add' && Array.isArray(l.drops) && l.drops.length > 0
  );
  if (entries.length === 0) return '';

  const cleanRules = entries.map(l => ({
    entityId: sec.sanitizeForScript(l.targetId),
    drops: l.drops.map(d => ({
      itemId: sec.sanitizeForScript(d.itemId),
      min: d.min,
      max: d.max,
      chance: d.chance,
    })),
  }));

  return [
    '// Generado automaticamente por Modpack Assist - Botin Adicional de Entidades',
    '// Conserva el botin original del mob y anade drops personalizados al morir.',
    `const MA_ENTITY_DROPS = ${JSON.stringify(cleanRules, null, 2)};`,
    '',
    'EntityEvents.death(event => {',
    '  if (event.level.clientSide) return;',
    '  const entity = event.entity;',
    '  if (!entity || !entity.block) return;',
    '  const mobId = String(entity.type);',
    '  for (const rule of MA_ENTITY_DROPS) {',
    '    if (rule.entityId !== mobId) continue;',
    '    for (const drop of rule.drops) {',
    '      if (Math.random() * 100 <= drop.chance) {',
    '        const span = Math.max(0, drop.max - drop.min);',
    '        const count = drop.min + Math.floor(Math.random() * (span + 1));',
    '        if (count > 0) {',
    '          try { entity.block.popItem(`${count}x ${drop.itemId}`); } catch (e) {}',
    '        }',
    '      }',
    '    }',
    '  }',
    '});',
    '',
  ].join('\n');
}

function buildLootPoolsFromDrops(drops) {
  return drops.map(d => {
    const entry = {
      type: 'minecraft:item',
      name: sec.sanitizeForScript(d.itemId),
    };
    if (d.min !== 1 || d.max !== 1) {
      entry.functions = [
        {
          function: 'minecraft:set_count',
          count: d.min === d.max ? d.min : { type: 'minecraft:uniform', min: d.min, max: d.max },
        },
      ];
    }
    const pool = {
      rolls: 1,
      entries: [entry],
    };
    if (d.chance < 100) {
      pool.conditions = [
        {
          condition: 'minecraft:random_chance',
          chance: Number((d.chance / 100).toFixed(4)),
        },
      ];
    }
    return pool;
  });
}

// Normaliza una ruta o ID a kubejs/data/<ns>/loot_tables(o loot_table)/...
function resolveKubejsLootRelPath(inputPathOrId, targetType = 'custom', gameVersion = '') {
  const folderName = isMc121OrNewer(gameVersion) ? 'loot_table' : 'loot_tables';
  const raw = String(inputPathOrId || '').trim().replace(/\\/g, '/');
  if (!raw) throw new Error('Debes indicar una entidad, cofre o ruta de loot.');

  if (targetType === 'entity' || (raw.includes(':') && !raw.endsWith('.json'))) {
    if (!sec.validateItemId(raw)) throw new Error('ID invalido (usa formato mod:nombre).');
    const [ns, rest] = raw.split(':');
    const subPath = rest.includes('/') ? rest : (targetType === 'chest' ? `chests/${rest}` : `entities/${rest}`);
    return `kubejs/data/${ns}/${folderName}/${subPath}.json`;
  }

  let cleaned = raw.replace(/^\/+/, '');
  if (cleaned.startsWith('data/')) {
    cleaned = `kubejs/${cleaned}`;
  } else if (!cleaned.startsWith('kubejs/data/')) {
    cleaned = `kubejs/data/${cleaned}`;
  }
  if (!cleaned.endsWith('.json')) cleaned += '.json';
  return cleaned;
}

// Busca una tabla de loot base dentro de los .jar de mods/ si no existe en disco
async function findBaseLootTableInJars(packPath, kubejsRelPath) {
  const internalRel = kubejsRelPath.replace(/^kubejs\//, '');
  const altInternalRel = internalRel.includes('/loot_tables/')
    ? internalRel.replace('/loot_tables/', '/loot_table/')
    : internalRel.replace('/loot_table/', '/loot_tables/');
  const modsDir = sec.sanitizePath('mods', packPath);
  if (!modsDir) return null;
  try {
    const files = await fs.readdir(modsDir);
    for (const file of files) {
      if (!file.endsWith('.jar')) continue;
      try {
        const jarPath = path.join(modsDir, file);
        await sec.validateFileSize(jarPath, sec.MAX_ZIP_SIZE);
        const zip = new AdmZip(jarPath);
        const entry = zip.getEntry(internalRel) || zip.getEntry(altInternalRel);
        if (entry) {
          return JSON.parse(zip.readAsText(entry));
        }
      } catch {
        // continuar con el siguiente jar
      }
    }
  } catch {
    return null;
  }
  return null;
}

function deepMergeObjects(dst, src) {
  for (const k of Object.keys(src)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      if (!dst[k] || typeof dst[k] !== 'object' || Array.isArray(dst[k])) dst[k] = {};
      deepMergeObjects(dst[k], src[k]);
    } else {
      dst[k] = src[k];
    }
  }
  return dst;
}

// --- OPERACIONES PUBLICAS ---

async function upsertItemTweak(tweakData, packPath) {
  validatePackPath(packPath);
  if (!tweakData || !sec.validateItemId(tweakData.itemId)) {
    return { success: false, message: 'ID de objeto invalido (usa formato mod:item).' };
  }

  let parsed;
  try {
    parsed = {
      itemId: tweakData.itemId.trim().toLowerCase(),
      damage: parseOptionalNumber(tweakData.damage, 'Dano de ataque', { min: 0, max: 100000 }),
      attackSpeed: parseOptionalNumber(tweakData.attackSpeed, 'Velocidad de ataque', { min: -10, max: 100 }),
      armor: parseOptionalNumber(tweakData.armor, 'Armadura', { min: 0, max: 1000 }),
      toughness: parseOptionalNumber(tweakData.toughness, 'Dureza', { min: 0, max: 1000 }),
      knockbackResistance: parseOptionalNumber(tweakData.knockbackResistance, 'Resistencia al empuje', { min: 0, max: 10 }),
      maxDamage: parseOptionalNumber(tweakData.maxDamage, 'Durabilidad maxima', { min: 1, max: 10000000, integer: true }),
      maxStackSize: parseOptionalNumber(tweakData.maxStackSize, 'Tamano de stack', { min: 1, max: 64, integer: true }),
      fireResistant: Boolean(tweakData.fireResistant),
      updatedAt: Date.now(),
    };
  } catch (err) {
    return { success: false, message: err.message };
  }

  const hasAnyStat = [
    parsed.damage,
    parsed.attackSpeed,
    parsed.armor,
    parsed.toughness,
    parsed.knockbackResistance,
    parsed.maxDamage,
    parsed.maxStackSize,
  ].some(v => v !== null) || parsed.fireResistant;

  if (!hasAnyStat) {
    return { success: false, message: 'Ingresa al menos una estadistica para modificar.' };
  }

  const state = await loadState(packPath);
  const isUpdate = Boolean(state.items[parsed.itemId]);
  state.items[parsed.itemId] = parsed;
  await saveState(packPath, state);

  const script = generateItemScript(state.items);
  await writeOrCleanupScript(packPath, ITEM_SCRIPT_REL, script, Object.keys(state.items).length > 0);

  return {
    success: true,
    message: isUpdate
      ? `Balance actualizado para ${parsed.itemId} en ${ITEM_SCRIPT_REL}`
      : `Balance aplicado a ${parsed.itemId} en ${ITEM_SCRIPT_REL}`,
    state,
  };
}

async function upsertEntityTweak(tweakData, packPath) {
  validatePackPath(packPath);
  if (!tweakData || !sec.validateItemId(tweakData.entityId)) {
    return { success: false, message: 'ID de entidad invalido (usa formato mod:entidad).' };
  }

  const mode = tweakData.mode === 'multiply' ? 'multiply' : 'set';
  const minVal = mode === 'multiply' ? 0.01 : 0;

  let parsed;
  try {
    parsed = {
      entityId: tweakData.entityId.trim().toLowerCase(),
      mode,
      health: parseOptionalNumber(tweakData.health, 'Vida maxima', { min: mode === 'multiply' ? 0.01 : 1, max: 10000000 }),
      damage: parseOptionalNumber(tweakData.damage, 'Dano de ataque', { min: minVal, max: 1000000 }),
      speed: parseOptionalNumber(tweakData.speed, 'Velocidad', { min: minVal, max: 20 }),
      armor: parseOptionalNumber(tweakData.armor, 'Armadura', { min: minVal, max: 1000 }),
      knockbackResistance: parseOptionalNumber(tweakData.knockbackResistance, 'Resistencia al empuje', { min: minVal, max: 10 }),
      followRange: parseOptionalNumber(tweakData.followRange, 'Rango de deteccion', { min: minVal, max: 2048 }),
      updatedAt: Date.now(),
    };
  } catch (err) {
    return { success: false, message: err.message };
  }

  const hasAnyStat = [
    parsed.health,
    parsed.damage,
    parsed.speed,
    parsed.armor,
    parsed.knockbackResistance,
    parsed.followRange,
  ].some(v => v !== null);

  if (!hasAnyStat) {
    return { success: false, message: 'Ingresa al menos un atributo para la entidad.' };
  }

  const state = await loadState(packPath);
  const isUpdate = Boolean(state.entities[parsed.entityId]);
  state.entities[parsed.entityId] = parsed;
  await saveState(packPath, state);

  const script = generateEntityScript(state.entities);
  await writeOrCleanupScript(packPath, ENTITY_SCRIPT_REL, script, Object.keys(state.entities).length > 0);

  return {
    success: true,
    message: isUpdate
      ? `Atributos actualizados para ${parsed.entityId}`
      : `Mutacion aplicada a ${parsed.entityId}`,
    state,
  };
}

async function upsertSpawnRule(tweakData, packPath) {
  validatePackPath(packPath);
  if (!tweakData || !sec.validateItemId(tweakData.entityId)) {
    return { success: false, message: 'ID de entidad invalido (usa formato mod:entidad).' };
  }

  // Retrocompatibilidad: si llaman con { entityId, health, damage, speed } sin 'action', redirigir a mutador de entidad
  const hasLegacyStatsOnly = !tweakData.action && (
    tweakData.health !== undefined || tweakData.damage !== undefined || tweakData.speed !== undefined
  );
  if (hasLegacyStatsOnly) {
    return upsertEntityTweak(tweakData, packPath);
  }

  const action = ['block', 'chance', 'replace'].includes(tweakData.action) ? tweakData.action : 'block';
  const dimension = tweakData.dimension && tweakData.dimension !== 'all' ? String(tweakData.dimension).trim().toLowerCase() : 'all';
  if (dimension !== 'all' && !sec.validateItemId(dimension)) {
    return { success: false, message: 'Dimension invalida (ej: minecraft:overworld).' };
  }

  let replaceWith = null;
  if (action === 'replace') {
    if (!tweakData.replaceWith || !sec.validateItemId(tweakData.replaceWith)) {
      return { success: false, message: 'Indica una entidad de reemplazo valida (mod:entidad).' };
    }
    replaceWith = tweakData.replaceWith.trim().toLowerCase();
  }

  let chance = 100;
  let minY;
  let maxY;
  try {
    if (action === 'chance' || action === 'replace') {
      const parsedChance = parseOptionalNumber(tweakData.chance, 'Probabilidad (%)', { min: 0, max: 100 });
      if (parsedChance === null) return { success: false, message: 'Indica un porcentaje entre 0 y 100.' };
      chance = parsedChance;
    }
    minY = parseOptionalNumber(tweakData.minY, 'Altura Y minima', { min: -2048, max: 2048, integer: true });
    maxY = parseOptionalNumber(tweakData.maxY, 'Altura Y maxima', { min: -2048, max: 2048, integer: true });
    if (minY !== null && maxY !== null && minY > maxY) {
      return { success: false, message: 'La altura Y minima no puede ser mayor que la maxima.' };
    }
  } catch (err) {
    return { success: false, message: err.message };
  }

  const entityId = tweakData.entityId.trim().toLowerCase();
  const ruleId = `${entityId}@${dimension}`;
  const rule = {
    id: ruleId,
    entityId,
    action,
    chance,
    replaceWith,
    dimension,
    minY,
    maxY,
    onlyBaby: Boolean(tweakData.onlyBaby),
    updatedAt: Date.now(),
  };

  const state = await loadState(packPath);
  state.spawns[ruleId] = rule;
  await saveState(packPath, state);

  const script = generateSpawnScript(state.spawns);
  await writeOrCleanupScript(packPath, SPAWN_SCRIPT_REL, script, Object.keys(state.spawns).length > 0);

  return {
    success: true,
    message: `Regla de spawn guardada para ${entityId} (${dimension === 'all' ? 'todas las dimensiones' : dimension})`,
    state,
  };
}

async function applyLootTweak(packPath, lootPayload, gameVersion = '') {
  validatePackPath(packPath);

  // Modo 1 (estructurado): { targetType: 'entity'|'chest'|'custom', targetId, mode: 'add'|'replace', drops: [...] }
  if (lootPayload && typeof lootPayload === 'object' && Array.isArray(lootPayload.drops)) {
    const targetType = ['entity', 'chest', 'custom'].includes(lootPayload.targetType) ? lootPayload.targetType : 'entity';
    const mode = lootPayload.mode === 'replace' ? 'replace' : 'add';
    const targetId = String(lootPayload.targetId || '').trim().toLowerCase();
    if (!targetId) return { success: false, message: 'Indica la entidad, cofre o ruta objetivo.' };
    if ((targetType === 'entity' || targetType === 'chest') && !sec.validateItemId(targetId)) {
      return { success: false, message: 'El objetivo debe tener formato mod:nombre (ej: minecraft:zombie).' };
    }
    if (lootPayload.drops.length === 0) {
      return { success: false, message: 'Agrega al menos un objeto de botin.' };
    }

    const validatedDrops = [];
    try {
      for (const d of lootPayload.drops) {
        if (!d || !sec.validateItemId(d.itemId)) {
          return { success: false, message: `ID de objeto invalido en el botin: ${d?.itemId || '(vacio)'}` };
        }
        const min = parseOptionalNumber(d.min ?? 1, 'Cantidad minima', { min: 1, max: 640, integer: true });
        const max = parseOptionalNumber(d.max ?? min, 'Cantidad maxima', { min: 1, max: 640, integer: true });
        const chance = parseOptionalNumber(d.chance ?? 100, 'Probabilidad (%)', { min: 0.01, max: 100 });
        if (min > max) return { success: false, message: 'La cantidad minima no puede superar la maxima.' };
        validatedDrops.push({
          itemId: d.itemId.trim().toLowerCase(),
          min,
          max,
          chance,
        });
      }
    } catch (err) {
      return { success: false, message: err.message };
    }

    const state = await loadState(packPath);
    const ruleId = `${targetType}:${targetId}:${mode}`;

    // Para entidades en modo 'add': usar EntityEvents.death en KubeJS para conservar el botin original vanilla/modded
    if (targetType === 'entity' && mode === 'add') {
      state.loots[ruleId] = {
        id: ruleId,
        targetType,
        targetId,
        mode,
        drops: validatedDrops,
        lootFilePath: LOOT_SCRIPT_REL,
        updatedAt: Date.now(),
      };
      await saveState(packPath, state);
      const script = generateAdditiveEntityLootScript(state.loots);
      await writeOrCleanupScript(packPath, LOOT_SCRIPT_REL, script, Boolean(script));
      return {
        success: true,
        message: `Botin adicional inyectado para ${targetId} (conservando drops originales).`,
        state,
      };
    }

    // Para 'replace' o cofres/rutas custom: escribir JSON valido en kubejs/data/...
    let relPath;
    try {
      relPath = resolveKubejsLootRelPath(targetId, targetType, gameVersion);
    } catch (err) {
      return { success: false, message: err.message };
    }
    const fullPath = sec.sanitizePath(relPath, packPath);
    if (!fullPath) return { success: false, message: 'Ruta de loot invalida.' };

    const tableType = targetType === 'entity'
      ? 'minecraft:entity'
      : targetType === 'chest'
        ? 'minecraft:chest'
        : 'minecraft:generic';
    const newPools = buildLootPoolsFromDrops(validatedDrops);

    let finalJson = { type: tableType, pools: newPools };
    if (mode === 'add') {
      // Intentar cargar tabla existente en disco o desde el .jar del mod
      let base;
      try {
        const raw = await fs.readFile(fullPath, 'utf-8');
        base = JSON.parse(raw);
      } catch {
        base = await findBaseLootTableInJars(packPath, relPath);
      }
      if (base && Array.isArray(base.pools)) {
        finalJson = { ...base, pools: [...base.pools, ...newPools] };
      }
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, JSON.stringify(finalJson, null, 2), 'utf-8');

    state.loots[ruleId] = {
      id: ruleId,
      targetType,
      targetId,
      mode,
      drops: validatedDrops,
      lootFilePath: relPath,
      updatedAt: Date.now(),
    };
    await saveState(packPath, state);

    return {
      success: true,
      message: `Tabla de loot escrita en ${relPath}`,
      state,
    };
  }

  // Modo 2 (JSON directo / retrocompatible): applyLootPatch(packPath, lootPath, patchObj, gameVersion)
  return { success: false, message: 'Formato de ajuste de loot no reconocido.' };
}

async function applyRawLootPatch(packPath, lootPath, patch, gameVersion = '') {
  validatePackPath(packPath);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return { success: false, message: 'El parche debe ser un objeto JSON valido.' };
  }
  let relPath;
  try {
    relPath = resolveKubejsLootRelPath(lootPath, 'custom', gameVersion);
  } catch (err) {
    return { success: false, message: err.message };
  }
  const targetPath = sec.sanitizePath(relPath, packPath);
  if (!targetPath) return { success: false, message: 'Ruta de loot invalida.' };

  let base;
  try {
    await sec.validateFileSize(targetPath, sec.MAX_READ_SIZE);
    const raw = await fs.readFile(targetPath, 'utf-8');
    base = JSON.parse(raw);
  } catch {
    base = (await findBaseLootTableInJars(packPath, relPath)) || {};
  }

  deepMergeObjects(base, patch);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, JSON.stringify(base, null, 2), 'utf-8');

  const state = await loadState(packPath);
  const ruleId = `raw:${relPath}`;
  state.loots[ruleId] = {
    id: ruleId,
    targetType: 'custom',
    targetId: relPath,
    mode: 'raw',
    drops: [],
    lootFilePath: relPath,
    updatedAt: Date.now(),
  };
  await saveState(packPath, state);

  return { success: true, message: `Tabla de loot actualizada en ${relPath}`, state };
}

async function deleteTweak(packPath, category, id) {
  validatePackPath(packPath);
  if (!['items', 'entities', 'spawns', 'loots'].includes(category) || !id) {
    return { success: false, message: 'Categoria o identificador invalido.' };
  }
  const state = await loadState(packPath);
  const target = state[category]?.[id];
  if (!target) {
    return { success: false, message: 'El ajuste ya no existe.' };
  }
  delete state[category][id];
  await saveState(packPath, state);

  if (category === 'items') {
    const script = generateItemScript(state.items);
    await writeOrCleanupScript(packPath, ITEM_SCRIPT_REL, script, Object.keys(state.items).length > 0);
  } else if (category === 'entities') {
    const script = generateEntityScript(state.entities);
    await writeOrCleanupScript(packPath, ENTITY_SCRIPT_REL, script, Object.keys(state.entities).length > 0);
  } else if (category === 'spawns') {
    const script = generateSpawnScript(state.spawns);
    await writeOrCleanupScript(packPath, SPAWN_SCRIPT_REL, script, Object.keys(state.spawns).length > 0);
  } else if (category === 'loots') {
    if (target.lootFilePath === LOOT_SCRIPT_REL) {
      const script = generateAdditiveEntityLootScript(state.loots);
      await writeOrCleanupScript(packPath, LOOT_SCRIPT_REL, script, Boolean(script));
    } else if (target.lootFilePath) {
      const fullLoot = sec.sanitizePath(target.lootFilePath, packPath);
      if (fullLoot) await fs.unlink(fullLoot).catch(() => {});
    }
  }

  return { success: true, message: `Ajuste eliminado: ${id}`, state };
}

module.exports = {
  loadState,
  upsertItemTweak,
  upsertEntityTweak,
  upsertSpawnRule,
  applyLootTweak,
  applyRawLootPatch,
  deleteTweak,
  resolveKubejsLootRelPath,
  generateItemScript,
  generateEntityScript,
  generateSpawnScript,
  generateAdditiveEntityLootScript,
};
