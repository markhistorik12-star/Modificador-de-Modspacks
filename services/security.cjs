const path = require('path');
const fs = require('fs/promises');
const os = require('os');

const MAX_READ_SIZE = 10 * 1024 * 1024;
const MAX_DOWNLOAD_SIZE = 200 * 1024 * 1024;
const MAX_ZIP_SIZE = 500 * 1024 * 1024;

const ALLOWED_DOWNLOAD_DOMAINS = [
  'cdn.modrinth.com',
  'files.curseforge.com',
  'edge.forgecdn.net',
  'mediafilez.forgecdn.net',
];

const SAFE_EDITOR_EXTENSIONS = new Set([
  '.toml', '.json', '.json5', '.cfg', '.conf', '.properties',
  '.txt', '.md', '.js', '.zs', '.snbt', '.yaml', '.yml', '.ini', '.log',
]);

const BLOCKED_EXECUTABLE_EXTENSIONS = new Set([
  '.exe', '.bat', '.cmd', '.ps1', '.vbs', '.vbe', '.jsxe', '.wsf', '.wsh',
  '.msi', '.msp', '.scr', '.com', '.pif', '.hta', '.cpl', '.lnk', '.reg', '.jar',
]);

// Conjunto de carpetas de modpack autorizadas en la sesion actual
const authorizedPackRoots = new Set();

const sanitizePath = (userPath, basePath) => {
  if (!userPath || typeof userPath !== 'string') return null;
  if (!basePath || typeof basePath !== 'string') return null;
  if (userPath.includes('..') || userPath.includes('~')) return null;
  if (path.isAbsolute(userPath)) return null;
  const resolved = path.resolve(basePath, userPath);
  const baseResolved = path.resolve(basePath);
  if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) return null;
  return resolved;
};

const authorizePackPath = (packPath) => {
  if (!packPath || typeof packPath !== 'string' || !path.isAbsolute(packPath)) return false;
  const normalized = path.resolve(packPath);
  const parsed = path.parse(normalized);
  // Nunca autorizar la raiz del disco ni el directorio raiz del usuario
  if (normalized === parsed.root) return false;
  if (normalized.toLowerCase() === path.resolve(os.homedir()).toLowerCase()) return false;
  authorizedPackRoots.add(normalized.toLowerCase());
  return true;
};

const isAuthorizedPackPath = (packPath) => {
  if (!packPath || typeof packPath !== 'string' || !path.isAbsolute(packPath)) return false;
  if (packPath.includes('..') || packPath.includes('~')) return false;
  const normalized = path.resolve(packPath).toLowerCase();
  return authorizedPackRoots.has(normalized);
};

// Verifica si una carpeta existente tiene estructura real de modpack (para auto-carga segura)
const looksLikeModpackRoot = async (dirPath) => {
  if (!dirPath || typeof dirPath !== 'string' || !path.isAbsolute(dirPath)) return false;
  if (dirPath.includes('..') || dirPath.includes('~')) return false;
  const normalized = path.resolve(dirPath);
  const parsed = path.parse(normalized);
  if (normalized === parsed.root) return false;
  if (normalized.toLowerCase() === path.resolve(os.homedir()).toLowerCase()) return false;
  try {
    const stat = await fs.stat(normalized);
    if (!stat.isDirectory()) return false;
    const entries = new Set(await fs.readdir(normalized));
    const markers = ['mods', 'manifest.json', 'minecraftinstance.json', 'modrinth.index.json', 'instance.cfg'];
    return markers.some(m => entries.has(m));
  } catch {
    return false;
  }
};

const validateDownloadUrl = (rawUrl) => {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.username || parsed.password) return false;
    return ALLOWED_DOWNLOAD_DOMAINS.includes(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
};

const isSafeForExternalEditor = (filePath) => {
  if (!filePath || typeof filePath !== 'string') return false;
  const ext = path.extname(filePath).toLowerCase();
  if (!ext || BLOCKED_EXECUTABLE_EXTENSIONS.has(ext)) return false;
  return SAFE_EDITOR_EXTENSIONS.has(ext);
};

const validateItemId = (id) => typeof id === 'string' && /^[a-z0-9_.-]+:[a-z0-9_./-]+$/i.test(id);

const sanitizeForScript = (id) => {
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_.-]+:[a-zA-Z0-9_./-]+$/.test(id)) {
    throw new Error('ID invalido para script');
  }
  return id;
};

const validateGameVersion = (v) => typeof v === 'string' && /^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9]+)?$/.test(v);

const validateFileSize = async (filePath, maxSize) => {
  const { size } = await fs.stat(filePath);
  if (size > maxSize) throw new Error('Archivo excede el limite de tamano.');
  return size;
};

module.exports = {
  sanitizePath,
  authorizePackPath,
  isAuthorizedPackPath,
  looksLikeModpackRoot,
  validateDownloadUrl,
  isSafeForExternalEditor,
  validateItemId,
  sanitizeForScript,
  validateGameVersion,
  validateFileSize,
  ALLOWED_DOWNLOAD_DOMAINS,
  MAX_READ_SIZE,
  MAX_DOWNLOAD_SIZE,
  MAX_ZIP_SIZE,
};
