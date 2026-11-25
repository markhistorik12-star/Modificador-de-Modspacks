const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CACHE_DIR = path.join(os.tmpdir(), 'modpack-assist-cache', 'search');
const DEFAULT_TTL_MS = 1000 * 60 * 30; // 30 minutes
const MAX_CACHE_SIZE_MB = 50;
const MAX_ENTRIES = 1000;

class SearchCache {
  constructor(options = {}) {
    this.cacheDir = options.cacheDir || CACHE_DIR;
    this.ttlMs = options.ttlMs || DEFAULT_TTL_MS;
    this.maxSizeBytes = (options.maxSizeMB || MAX_CACHE_SIZE_MB) * 1024 * 1024;
    this.maxEntries = options.maxEntries || MAX_ENTRIES;
    this.memoryCache = new Map();
    this.initialized = false;
    this._initPromise = null;
  }

  async init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = (async () => {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await this.loadIndex();
      this.initialized = true;
    })();
    return this._initPromise;
  }

  async loadIndex() {
    const indexPath = path.join(this.cacheDir, 'index.json');
    try {
      const content = await fs.readFile(indexPath, 'utf-8');
      if (Buffer.byteLength(content, 'utf-8') > 10 * 1024 * 1024) throw new Error('Index cache demasiado grande.');
      const index = JSON.parse(content);
      for (const [key, entry] of Object.entries(index)) {
        if (this.isValidEntry(entry)) {
          this.memoryCache.set(key, entry);
        }
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[SearchCache] Failed to load index:', err.message);
      }
    }
  }

  async saveIndex() {
    const indexPath = path.join(this.cacheDir, 'index.json');
    const index = Object.fromEntries(this.memoryCache);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), 'utf-8');
  }

  generateKey(query, gameVersion, loader, sortBy, category) {
    const raw = `${query}|${gameVersion}|${loader}|${sortBy}|${category}`;
    return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
  }

  isValidEntry(entry) {
    if (!entry || !entry.timestamp || !entry.key) return false;
    const age = Date.now() - entry.timestamp;
    return age < this.ttlMs;
  }

  async get(query, gameVersion, loader, sortBy, category) {
    await this.init();
    const key = this.generateKey(query, gameVersion, loader, sortBy, category);
    const entry = this.memoryCache.get(key);

    if (!entry || !this.isValidEntry(entry)) {
      if (entry) {
        this.memoryCache.delete(key);
        await this.deleteCacheFile(key);
      }
      return null;
    }

    try {
      const filePath = path.join(this.cacheDir, `${key}.json`);
      const content = await fs.readFile(filePath, 'utf-8');
      if (Buffer.byteLength(content, 'utf-8') > 10 * 1024 * 1024) throw new Error('Cached file demasiado grande.');
      const data = JSON.parse(content);
      entry.lastAccessed = Date.now();
      await this.saveIndex();
      return data;
    } catch {
      this.memoryCache.delete(key);
      await this.deleteCacheFile(key);
      return null;
    }
  }

  async set(query, gameVersion, loader, sortBy, category, data) {
    await this.init();
    const key = this.generateKey(query, gameVersion, loader, sortBy, category);
    const timestamp = Date.now();

    const entry = {
      key,
      query,
      gameVersion,
      loader,
      sortBy,
      category,
      timestamp,
      lastAccessed: timestamp,
      resultCount: data?.results?.length || 0
    };

    try {
      const filePath = path.join(this.cacheDir, `${key}.json`);
      await fs.writeFile(filePath, JSON.stringify(data), 'utf-8');

      this.memoryCache.set(key, entry);
      await this.enforceLimits();
      await this.saveIndex();

      return true;
    } catch (err) {
      console.error('[SearchCache] Failed to write cache:', err.message);
      return false;
    }
  }

  async deleteCacheFile(key) {
    if (!/^[a-f0-9]{32}$/.test(key)) return;
    const filePath = path.join(this.cacheDir, `${key}.json`);
    try {
      await fs.unlink(filePath);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[SearchCache] Failed to delete cache file:', err.message);
      }
    }
  }

  async enforceLimits() {
    let totalSize = 0;
    const entries = Array.from(this.memoryCache.entries());

    for (const [key] of entries) {
      try {
        const filePath = path.join(this.cacheDir, `${key}.json`);
        const stats = await fs.stat(filePath);
        totalSize += stats.size;
      } catch {
        this.memoryCache.delete(key);
      }
    }

    if (totalSize > this.maxSizeBytes || entries.length > this.maxEntries) {
      entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);

      const toRemove = entries.length - Math.min(this.maxEntries, Math.floor(this.maxSizeBytes / (totalSize / entries.length || 1)));
      const limit = Math.min(entries.length, Math.ceil(Math.max(toRemove, entries.length * 0.2)));
      for (let i = 0; i < limit; i++) {
        const [key] = entries[i];
        this.memoryCache.delete(key);
        await this.deleteCacheFile(key);
      }

      await this.saveIndex();
    }
  }

  async clear() {
    this.memoryCache.clear();
    try {
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        await fs.unlink(path.join(this.cacheDir, file)).catch(() => {});
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('[SearchCache] Failed to clear:', err.message);
      }
    }
  }

  async getStats() {
    await this.init();
    let totalSize = 0;
    const timestamps = [];
    for (const [key, entry] of this.memoryCache) {
      if (entry?.timestamp) timestamps.push(entry.timestamp);
      try {
        const stats = await fs.stat(path.join(this.cacheDir, `${key}.json`));
        totalSize += stats.size;
      } catch {
        // Archivo expirado o eliminado externamente
      }
    }
    return {
      entries: this.memoryCache.size,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      oldestEntry: timestamps.length > 0 ? Math.min(...timestamps) : null,
      newestEntry: timestamps.length > 0 ? Math.max(...timestamps) : null,
    };
  }

  async invalidate(query) {
    await this.init();
    const prefix = String(query || '').toLowerCase();
    const keysToDelete = [];

    for (const [key, entry] of this.memoryCache) {
      if (String(entry.query || '').toLowerCase().includes(prefix)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.memoryCache.delete(key);
      await this.deleteCacheFile(key);
    }

    if (keysToDelete.length > 0) {
      await this.saveIndex();
    }

    return keysToDelete.length;
  }
}

let globalCache = null;

function getSearchCache(options = {}) {
  if (!globalCache) {
    globalCache = new SearchCache(options);
  } else {
    if (options.ttlMs) globalCache.ttlMs = options.ttlMs;
    if (options.cacheDir) globalCache.cacheDir = options.cacheDir;
    if (options.maxSizeMB) globalCache.maxSizeBytes = options.maxSizeMB * 1024 * 1024;
    if (options.maxEntries) globalCache.maxEntries = options.maxEntries;
  }
  return globalCache;
}

module.exports = {
  SearchCache,
  getSearchCache,
  CACHE_DIR
};
