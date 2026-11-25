import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import tweaksManager from '../services/tweaksManager.cjs';
import { scanModIds } from '../services/modIdScanner.cjs';

let tmpDir;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'modpack-tweaks-test-'));
});

afterEach(async () => {
  if (tmpDir) {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
});

describe('tweaksManager - Items', () => {
  it('rechaza ajustes vacios o con estadisticas no numericas', async () => {
    const emptyRes = await tweaksManager.upsertItemTweak({ itemId: 'minecraft:diamond_sword' }, tmpDir);
    expect(emptyRes.success).toBe(false);

    const nanRes = await tweaksManager.upsertItemTweak({ itemId: 'minecraft:diamond_sword', damage: 'abc' }, tmpDir);
    expect(nanRes.success).toBe(false);
  });

  it('crea y actualiza sin duplicar bloques en 1_item_tweaks.js y permite valor 0', async () => {
    const r1 = await tweaksManager.upsertItemTweak({
      itemId: 'minecraft:diamond_sword',
      damage: '12',
      armor: '0',
      maxDamage: '2500',
      fireResistant: true,
    }, tmpDir);
    expect(r1.success).toBe(true);

    // Reajustar el mismo item actualiza el valor en lugar de duplicar el bloque
    const r2 = await tweaksManager.upsertItemTweak({
      itemId: 'minecraft:diamond_sword',
      damage: '16.5',
      attackSpeed: '-2.2',
    }, tmpDir);
    expect(r2.success).toBe(true);

    const scriptPath = path.join(tmpDir, 'kubejs/startup_scripts/1_item_tweaks.js');
    const content = await fs.readFile(scriptPath, 'utf-8');
    const matches = content.match(/minecraft:diamond_sword/g) || [];
    expect(matches.length).toBe(1);
    expect(content).toContain('item.attackDamage = 16.5;');
    expect(content).toContain('item.attackSpeed = -2.2;');

    // Al eliminar el unico tweak se limpia el script
    const del = await tweaksManager.deleteTweak(tmpDir, 'items', 'minecraft:diamond_sword');
    expect(del.success).toBe(true);
    await expect(fs.access(scriptPath)).rejects.toThrow();
  });
});

describe('tweaksManager - Entidades y Spawns', () => {
  it('genera script de entidades con proteccion clientSide, persistentData y soporte 1.20/1.21', async () => {
    const res = await tweaksManager.upsertEntityTweak({
      entityId: 'minecraft:warden',
      mode: 'multiply',
      health: '1.5',
      damage: '1.25',
    }, tmpDir);
    expect(res.success).toBe(true);

    const script = await fs.readFile(path.join(tmpDir, 'kubejs/server_scripts/2_entity_tweaks.js'), 'utf-8');
    expect(script).toContain('event.level.clientSide');
    expect(script).toContain('ma_mutated');
    expect(script).toContain('minecraft:generic.max_health');
    expect(script).toContain('minecraft:max_health');
  });

  it('genera reglas reales de control de spawns (bloqueo, probabilidad y reemplazo)', async () => {
    const res = await tweaksManager.upsertSpawnRule({
      entityId: 'minecraft:phantom',
      action: 'chance',
      chance: '20',
      dimension: 'minecraft:overworld',
      minY: '60',
    }, tmpDir);
    expect(res.success).toBe(true);

    const script = await fs.readFile(path.join(tmpDir, 'kubejs/server_scripts/3_spawn_tweaks.js'), 'utf-8');
    expect(script).toContain('event.cancel()');
    expect(script).toContain('minecraft:phantom');
    expect(script).toContain('minecraft:overworld');
  });
});

describe('tweaksManager - Loot Tables y Drops', () => {
  it('modo add en entidad escribe script aditivo sin sobrescribir drops vanilla', async () => {
    const res = await tweaksManager.applyLootTweak(tmpDir, {
      targetType: 'entity',
      targetId: 'minecraft:zombie',
      mode: 'add',
      drops: [{ itemId: 'minecraft:emerald', min: 1, max: 3, chance: 35 }],
    }, '1.20.1');
    expect(res.success).toBe(true);

    const script = await fs.readFile(path.join(tmpDir, 'kubejs/server_scripts/4_loot_tweaks.js'), 'utf-8');
    expect(script).toContain('EntityEvents.death');
    expect(script).toContain('minecraft:emerald');
  });

  it('modo replace y parche JSON crean carpetas padre en kubejs/data y usan loot_table en 1.21+', async () => {
    const res120 = await tweaksManager.applyLootTweak(tmpDir, {
      targetType: 'entity',
      targetId: 'minecraft:zombie',
      mode: 'replace',
      drops: [{ itemId: 'minecraft:diamond', min: 1, max: 2, chance: 50 }],
    }, '1.20.1');
    expect(res120.success).toBe(true);
    const p120 = path.join(tmpDir, 'kubejs/data/minecraft/loot_tables/entities/zombie.json');
    const json120 = JSON.parse(await fs.readFile(p120, 'utf-8'));
    expect(json120.type).toBe('minecraft:entity');
    expect(json120.pools.length).toBe(1);

    const res121 = await tweaksManager.applyRawLootPatch(
      tmpDir,
      'data/minecraft/loot_table/chests/simple_dungeon.json',
      { type: 'minecraft:chest', pools: [] },
      '1.21.1'
    );
    expect(res121.success).toBe(true);
    const p121 = path.join(tmpDir, 'kubejs/data/minecraft/loot_table/chests/simple_dungeon.json');
    const json121 = JSON.parse(await fs.readFile(p121, 'utf-8'));
    expect(json121.type).toBe('minecraft:chest');
  });
});

describe('modIdScanner', () => {
  it('incluye items, entidades y cofres vanilla aunque no exista carpeta mods/', async () => {
    const catalog = await scanModIds(path.join(tmpDir, 'mods'));
    expect(catalog.items).toContain('minecraft:diamond_sword');
    expect(catalog.entities).toContain('minecraft:zombie');
    expect(catalog.chests).toContain('minecraft:chests/simple_dungeon');
    expect(catalog.hasKubeJS).toBe(false);
  });
});
