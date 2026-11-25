// services/modIdScanner.cjs
// Escanea IDs de items, entidades y tablas de cofres desde los .jar del modpack
// e incluye un catalogo base de Minecraft vanilla + deteccion de KubeJS instalado.

const fs = require('fs/promises');
const path = require('path');
const AdmZip = require('adm-zip');
const sec = require('./security.cjs');

const VANILLA_ITEMS = [
  'minecraft:wooden_sword', 'minecraft:stone_sword', 'minecraft:iron_sword',
  'minecraft:golden_sword', 'minecraft:diamond_sword', 'minecraft:netherite_sword',
  'minecraft:wooden_axe', 'minecraft:stone_axe', 'minecraft:iron_axe',
  'minecraft:golden_axe', 'minecraft:diamond_axe', 'minecraft:netherite_axe',
  'minecraft:iron_pickaxe', 'minecraft:diamond_pickaxe', 'minecraft:netherite_pickaxe',
  'minecraft:iron_shovel', 'minecraft:diamond_shovel', 'minecraft:netherite_shovel',
  'minecraft:iron_hoe', 'minecraft:diamond_hoe', 'minecraft:netherite_hoe',
  'minecraft:trident', 'minecraft:mace', 'minecraft:bow', 'minecraft:crossbow', 'minecraft:shield',
  'minecraft:leather_helmet', 'minecraft:leather_chestplate', 'minecraft:leather_leggings', 'minecraft:leather_boots',
  'minecraft:chainmail_helmet', 'minecraft:chainmail_chestplate', 'minecraft:chainmail_leggings', 'minecraft:chainmail_boots',
  'minecraft:iron_helmet', 'minecraft:iron_chestplate', 'minecraft:iron_leggings', 'minecraft:iron_boots',
  'minecraft:golden_helmet', 'minecraft:golden_chestplate', 'minecraft:golden_leggings', 'minecraft:golden_boots',
  'minecraft:diamond_helmet', 'minecraft:diamond_chestplate', 'minecraft:diamond_leggings', 'minecraft:diamond_boots',
  'minecraft:netherite_helmet', 'minecraft:netherite_chestplate', 'minecraft:netherite_leggings', 'minecraft:netherite_boots',
  'minecraft:turtle_helmet', 'minecraft:elytra',
  'minecraft:apple', 'minecraft:golden_apple', 'minecraft:enchanted_golden_apple', 'minecraft:golden_carrot',
  'minecraft:cooked_beef', 'minecraft:cooked_porkchop', 'minecraft:bread',
  'minecraft:coal', 'minecraft:iron_ingot', 'minecraft:copper_ingot', 'minecraft:gold_ingot',
  'minecraft:diamond', 'minecraft:emerald', 'minecraft:netherite_scrap', 'minecraft:netherite_ingot',
  'minecraft:amethyst_shard', 'minecraft:quartz', 'minecraft:lapis_lazuli', 'minecraft:redstone',
  'minecraft:ender_pearl', 'minecraft:ender_eye', 'minecraft:blaze_rod', 'minecraft:breeze_rod',
  'minecraft:ghast_tear', 'minecraft:nether_star', 'minecraft:totem_of_undying', 'minecraft:shulker_shell',
  'minecraft:phantom_membrane', 'minecraft:gunpowder', 'minecraft:bone', 'minecraft:rotten_flesh',
  'minecraft:string', 'minecraft:slime_ball', 'minecraft:echo_shard', 'minecraft:heart_of_the_sea',
  'minecraft:experience_bottle', 'minecraft:saddle', 'minecraft:name_tag',
];

const VANILLA_ENTITIES = [
  'minecraft:zombie', 'minecraft:zombie_villager', 'minecraft:husk', 'minecraft:drowned',
  'minecraft:skeleton', 'minecraft:stray', 'minecraft:bogged', 'minecraft:wither_skeleton',
  'minecraft:creeper', 'minecraft:spider', 'minecraft:cave_spider', 'minecraft:enderman',
  'minecraft:endermite', 'minecraft:silverfish', 'minecraft:slime', 'minecraft:magma_cube',
  'minecraft:witch', 'minecraft:phantom', 'minecraft:blaze', 'minecraft:breeze',
  'minecraft:ghast', 'minecraft:shulker', 'minecraft:guardian', 'minecraft:elder_guardian',
  'minecraft:pillager', 'minecraft:vindicator', 'minecraft:evoker', 'minecraft:illusioner',
  'minecraft:ravager', 'minecraft:vex', 'minecraft:piglin', 'minecraft:piglin_brute',
  'minecraft:zombified_piglin', 'minecraft:hoglin', 'minecraft:zoglin',
  'minecraft:warden', 'minecraft:wither', 'minecraft:ender_dragon',
  'minecraft:iron_golem', 'minecraft:snow_golem', 'minecraft:villager', 'minecraft:wandering_trader',
  'minecraft:wolf', 'minecraft:polar_bear', 'minecraft:panda', 'minecraft:bee',
  'minecraft:cow', 'minecraft:pig', 'minecraft:sheep', 'minecraft:chicken', 'minecraft:horse',
];

const VANILLA_CHESTS = [
  'minecraft:chests/simple_dungeon',
  'minecraft:chests/abandoned_mineshaft',
  'minecraft:chests/ancient_city',
  'minecraft:chests/bastion_treasure',
  'minecraft:chests/buried_treasure',
  'minecraft:chests/desert_pyramid',
  'minecraft:chests/end_city_treasure',
  'minecraft:chests/jungle_temple',
  'minecraft:chests/nether_bridge',
  'minecraft:chests/pillager_outpost',
  'minecraft:chests/shipwreck_treasure',
  'minecraft:chests/stronghold_corridor',
  'minecraft:chests/woodland_mansion',
];

async function scanModIds(modsPath) {
  const itemSet = new Set(VANILLA_ITEMS);
  const entitySet = new Set(VANILLA_ENTITIES);
  const chestSet = new Set(VANILLA_CHESTS);
  let hasKubeJS = false;

  if (!modsPath || typeof modsPath !== 'string' || modsPath.includes('..') || modsPath.includes('~') || !path.isAbsolute(modsPath)) {
    const items = [...itemSet].sort();
    const entities = [...entitySet].sort();
    const chests = [...chestSet].sort();
    return { items, entities, chests, all: [...new Set([...items, ...entities])].sort(), hasKubeJS: false };
  }

  try {
    const normalizedPath = path.normalize(modsPath);
    const files = await fs.readdir(normalizedPath);

    for (const file of files) {
      if (!file.toLowerCase().endsWith('.jar')) continue;
      if (file.toLowerCase().includes('kubejs')) hasKubeJS = true;

      try {
        const jarPath = path.join(normalizedPath, file);
        await sec.validateFileSize(jarPath, sec.MAX_ZIP_SIZE);
        const zip = new AdmZip(jarPath);
        const zipEntries = zip.getEntries();

        for (const entry of zipEntries) {
          const name = entry.entryName;

          // Detectar KubeJS por contenido interno si el jar fue renombrado
          if (!hasKubeJS && (name.startsWith('dev/latvian/mods/kubejs/') || name === 'kubejs.mixins.json')) {
            hasKubeJS = true;
          }

          // 1. Modelos de items (1.16 - 1.21) y definiciones de items (1.21.4+)
          const itemMatch = name.match(/^assets\/([a-z0-9_.-]+)\/(?:models\/item|items)\/([a-z0-9_./-]+)\.json$/);
          if (itemMatch) {
            const id = `${itemMatch[1]}:${itemMatch[2]}`;
            if (sec.validateItemId(id)) itemSet.add(id);
            continue;
          }

          // 2. Loot tables de entidades (1.20 loot_tables y 1.21+ loot_table)
          const entityMatch = name.match(/^data\/([a-z0-9_.-]+)\/loot_tables?\/entities\/([a-z0-9_./-]+)\.json$/);
          if (entityMatch) {
            const id = `${entityMatch[1]}:${entityMatch[2]}`;
            if (sec.validateItemId(id)) entitySet.add(id);
            continue;
          }

          // 3. Loot tables de cofres / estructuras
          const chestMatch = name.match(/^data\/([a-z0-9_.-]+)\/loot_tables?\/(chests\/[a-z0-9_./-]+)\.json$/);
          if (chestMatch) {
            const id = `${chestMatch[1]}:${chestMatch[2]}`;
            if (sec.validateItemId(id)) chestSet.add(id);
            continue;
          }

          // 4. Archivo de idioma en_us.json: captura jefes/entidades/items de mods con rutas no estandar
          if (/^assets\/[a-z0-9_.-]+\/lang\/en_us\.json$/.test(name) && entry.header.size < 2 * 1024 * 1024) {
            try {
              const langObj = JSON.parse(zip.readAsText(entry));
              for (const key of Object.keys(langObj)) {
                const em = key.match(/^entity\.([a-z0-9_.-]+)\.([a-z0-9_.-]+)$/);
                if (em) {
                  const id = `${em[1]}:${em[2]}`;
                  if (sec.validateItemId(id)) entitySet.add(id);
                  continue;
                }
                const im = key.match(/^item\.([a-z0-9_.-]+)\.([a-z0-9_.-]+)$/);
                if (im) {
                  const id = `${im[1]}:${im[2]}`;
                  if (sec.validateItemId(id)) itemSet.add(id);
                }
              }
            } catch {
              // en_us.json invalido o con comentarios
            }
          }
        }
      } catch {
        // Ignorar JARs danados
      }
    }
  } catch {
    // Si no existe carpeta mods/, se devuelven al menos los IDs vanilla
  }

  const items = [...itemSet].sort();
  const entities = [...entitySet].sort();
  const chests = [...chestSet].sort();
  const all = [...new Set([...items, ...entities])].sort();
  return { items, entities, chests, all, hasKubeJS };
}

module.exports = { scanModIds, VANILLA_ITEMS, VANILLA_ENTITIES, VANILLA_CHESTS };
