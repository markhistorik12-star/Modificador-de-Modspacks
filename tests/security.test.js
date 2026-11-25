import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import sec from '../services/security.cjs';

const base = path.join(os.tmpdir(), 'modpack-test');

describe('sanitizePath', () => {
  it('acepta rutas relativas dentro del modpack', () => {
    expect(sec.sanitizePath('config/sodium-options.json', base))
      .toBe(path.resolve(base, 'config/sodium-options.json'));
  });
  it('rechaza path traversal', () => {
    expect(sec.sanitizePath('../secreto.txt', base)).toBeNull();
    expect(sec.sanitizePath('config/../../x', base)).toBeNull();
  });
  it('rechaza rutas absolutas y home', () => {
    expect(sec.sanitizePath(path.resolve('/etc/passwd'), base)).toBeNull();
    expect(sec.sanitizePath('~/x', base)).toBeNull();
  });
  it('rechaza valores no string', () => {
    expect(sec.sanitizePath(null, base)).toBeNull();
    expect(sec.sanitizePath(42, base)).toBeNull();
    expect(sec.sanitizePath('', base)).toBeNull();
  });
});

describe('validateItemId / sanitizeForScript', () => {
  it('valida IDs mod:item', () => {
    expect(sec.validateItemId('minecraft:diamond_sword')).toBe(true);
    expect(sec.validateItemId('alexsmobs:entity/crow')).toBe(true);
    expect(sec.validateItemId('diamond_sword')).toBe(false);
    expect(sec.validateItemId("minecraft:x');evil()")).toBe(false);
  });
  it('sanitizeForScript lanza con IDs peligrosos', () => {
    expect(sec.sanitizeForScript('minecraft:zombie')).toBe('minecraft:zombie');
    expect(() => sec.sanitizeForScript("a:b'+require('fs')")).toThrow();
  });
});

describe('validateGameVersion', () => {
  it('acepta versiones de Minecraft', () => {
    for (const v of ['1.20', '1.20.1', '1.21-pre1']) expect(sec.validateGameVersion(v)).toBe(true);
  });
  it('rechaza formatos invalidos', () => {
    for (const v of ['latest', '1', '1.20.1; rm', '']) expect(sec.validateGameVersion(v)).toBe(false);
  });
});

describe('validateDownloadUrl', () => {
  it('acepta CDNs oficiales por HTTPS', () => {
    expect(sec.validateDownloadUrl('https://cdn.modrinth.com/data/AANobbMI/versions/x/sodium.jar')).toBe(true);
    expect(sec.validateDownloadUrl('https://edge.forgecdn.net/files/1234/567/mod.jar')).toBe(true);
  });
  it('rechaza HTTP, credenciales en URL y dominios externos', () => {
    expect(sec.validateDownloadUrl('http://cdn.modrinth.com/mod.jar')).toBe(false);
    expect(sec.validateDownloadUrl('https://user:pass@cdn.modrinth.com/mod.jar')).toBe(false);
    expect(sec.validateDownloadUrl('https://evil.example.com/cdn.modrinth.com/mod.jar')).toBe(false);
  });
});

describe('isSafeForExternalEditor', () => {
  it('permite archivos de configuracion y texto y bloquea ejecutables/scripts del SO', () => {
    expect(sec.isSafeForExternalEditor('sodium-options.json')).toBe(true);
    expect(sec.isSafeForExternalEditor('forge-client.toml')).toBe(true);
    expect(sec.isSafeForExternalEditor('payload.exe')).toBe(false);
    expect(sec.isSafeForExternalEditor('script.bat')).toBe(false);
    expect(sec.isSafeForExternalEditor('script.ps1')).toBe(false);
    expect(sec.isSafeForExternalEditor('mod.jar')).toBe(false);
  });
});

describe('authorizePackPath / looksLikeModpackRoot', () => {
  it('rechaza raiz del disco y directorio home, y autoriza carpetas de modpack reales', async () => {
    const rootDrive = path.parse(process.cwd()).root;
    expect(sec.authorizePackPath(rootDrive)).toBe(false);
    expect(sec.authorizePackPath(os.homedir())).toBe(false);

    const tmpPack = await fs.mkdtemp(path.join(os.tmpdir(), 'sec-pack-'));
    try {
      expect(await sec.looksLikeModpackRoot(tmpPack)).toBe(false);
      await fs.mkdir(path.join(tmpPack, 'mods'));
      expect(await sec.looksLikeModpackRoot(tmpPack)).toBe(true);
      expect(sec.authorizePackPath(tmpPack)).toBe(true);
      expect(sec.isAuthorizedPackPath(tmpPack)).toBe(true);
    } finally {
      await fs.rm(tmpPack, { recursive: true, force: true });
    }
  });
});
