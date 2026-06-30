const path = require('path');
const fs = require('fs/promises');

const MAX_READ_SIZE = 10 * 1024 * 1024;
const MAX_DOWNLOAD_SIZE = 200 * 1024 * 1024;
const MAX_ZIP_SIZE = 500 * 1024 * 1024;

const sanitizePath = (userPath, basePath) => {
  if (!userPath || typeof userPath !== 'string') return null;
  if (userPath.includes('..') || userPath.includes('~')) return null;
  if (path.isAbsolute(userPath)) return null;
  const resolved = path.resolve(basePath, userPath);
  const baseResolved = path.resolve(basePath);
  if (!resolved.startsWith(baseResolved + path.sep) && resolved !== baseResolved) return null;
  return resolved;
};

const validateItemId = (id) => /^[a-z0-9_.-]+:[a-z0-9_.\/-]+$/i.test(id);

const sanitizeForScript = (id) => {
  if (!/^[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.\/-]+$/.test(id)) {
    throw new Error('ID inválido para script');
  }
  return id;
};

const validateGameVersion = (v) => /^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9]+)?$/.test(v);

const validateFileSize = async (filePath, maxSize) => {
  const { size } = await fs.stat(filePath);
  if (size > maxSize) throw new Error('Archivo excede el límite de tamaño.');
  return size;
};

module.exports = {
  sanitizePath,
  validateItemId,
  sanitizeForScript,
  validateGameVersion,
  validateFileSize,
  MAX_READ_SIZE,
  MAX_DOWNLOAD_SIZE,
  MAX_ZIP_SIZE,
};
