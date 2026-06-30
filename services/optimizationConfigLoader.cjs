const fs = require('fs').promises;
const path = require('path');
const toml = require('@iarna/toml');

const DEFAULT_CONFIG_DIR = 'optimization-configs';

const OPTIMIZATION_CONFIG_SCHEMA = {
  version: 'string',
  name: 'string',
  description: 'string',
  author: 'string',
  tags: 'array',
  categories: 'object',
  filePatterns: 'object',
  mergeStrategy: 'string'
};

class OptimizationConfigLoader {
  constructor(configDir = DEFAULT_CONFIG_DIR) {
    this.configDir = configDir;
    this.configs = new Map();
    this.loaded = false;
  }

  async loadConfigs(customDir = null) {
    const dir = customDir || this.configDir;
    const absoluteDir = path.resolve(process.cwd(), dir);

    try {
      await fs.mkdir(absoluteDir, { recursive: true });
      const files = await fs.readdir(absoluteDir);

      // Always register builtin default first
      const builtin = this.getBuiltinConfigs();
      for (const [id, config] of Object.entries(builtin)) {
        this.configs.set(id, config);
      }

      for (const file of files) {
        if (!this.isConfigFile(file)) continue;

        try {
          const config = await this.loadConfigFile(path.join(absoluteDir, file));
          if (this.validateConfig(config)) {
            this.configs.set(config.id || file.replace(/\.[^.]+$/, ''), config);
          }
        } catch (err) {
          console.warn(`[OptimizationConfigLoader] Failed to load ${file}:`, err.message);
        }
      }

      this.loaded = true;
      return this.getAllConfigs();
    } catch (err) {
      console.warn(`[OptimizationConfigLoader] Config directory not accessible:`, err.message);
      this.loaded = true;
      return this.getAllConfigs();
    }
  }

  isConfigFile(filename) {
    const ext = path.extname(filename).toLowerCase();
    return ['.json', '.toml', '.yaml', '.yml'].includes(ext);
  }

  async loadConfigFile(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const content = await fs.readFile(filePath, 'utf-8');
    const filename = path.basename(filePath, ext);

    let config;
    if (ext === '.json') {
      if (Buffer.byteLength(content, 'utf-8') > 10 * 1024 * 1024) throw new Error('Archivo de configuración demasiado grande.');
      config = JSON.parse(content);
    } else if (ext === '.toml') {
      config = toml.parse(content);
    } else if (ext === '.yaml' || ext === '.yml') {
      try {
        const yaml = require('js-yaml');
        config = yaml.load(content);
      } catch {
        throw new Error('js-yaml not installed, skipping YAML config');
      }
    }

    return {
      id: filename,
      sourcePath: filePath,
      ...config
    };
  }

  validateConfig(config) {
    if (!config.name || !config.categories) {
      console.warn('[OptimizationConfigLoader] Config missing required fields (name, categories)');
      return false;
    }

    if (typeof config.categories !== 'object') {
      console.warn('[OptimizationConfigLoader] Categories must be an object');
      return false;
    }

    return true;
  }

  getAllConfigs() {
    const result = {};
    for (const [id, config] of this.configs) {
      result[id] = this.sanitizeConfig(config);
    }
    return result;
  }

  getConfig(id) {
    return this.configs.get(id) || null;
  }

  sanitizeConfig(config) {
    return {
      id: config.id,
      name: config.name,
      description: config.description || '',
      author: config.author || 'Unknown',
      version: config.version || '1.0.0',
      tags: config.tags || [],
      categories: config.categories,
      filePatterns: config.filePatterns || {},
      mergeStrategy: config.mergeStrategy || 'merge',
      builtin: false
    };
  }

  getBuiltinConfigs() {
    return {
      default: {
        id: 'default',
        name: 'Default Optimizations',
        description: 'Built-in optimization rules for common mods',
        author: 'Modpack Assist',
        version: '1.0.0',
        tags: ['builtin', 'core'],
        categories: require('./optimizationManager.cjs').OPTIMIZATION_CATEGORIES,
        builtin: true
      }
    };
  }

  mergeConfigs(...configIds) {
    const mergedCategories = {};

    for (const id of configIds) {
      const config = this.configs.get(id);
      if (!config) continue;

      for (const [catName, catRules] of Object.entries(config.categories)) {
        if (!mergedCategories[catName]) {
          mergedCategories[catName] = {};
        }
        Object.assign(mergedCategories[catName], catRules);
      }
    }

    return mergedCategories;
  }

  getCategories() {
    const categories = new Map();

    for (const config of this.configs.values()) {
      for (const [catName, catRules] of Object.entries(config.categories)) {
        if (!categories.has(catName)) {
          categories.set(catName, {
            name: catName,
            rules: {},
            sources: []
          });
        }
        const cat = categories.get(catName);
        Object.assign(cat.rules, catRules);
        cat.sources.push(config.id);
      }
    }

    return Object.fromEntries(categories);
  }

  getCategoryNames() {
    return Object.keys(this.getCategories());
  }

  async createConfig(config, overwrite = false) {
    if (this.configs.has(config.id) && !overwrite) {
      throw new Error(`Config with id "${config.id}" already exists`);
    }

    if (!this.validateConfig(config)) {
      throw new Error('Invalid configuration');
    }

    // Sanitize ID to prevent path traversal
    const safeId = config.id.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
    if (safeId !== config.id) {
      throw new Error('ID contains invalid characters. Use only alphanumeric, underscore, and hyphen.');
    }

    const filePath = path.join(this.configDir, `${safeId}.json`);
    const absoluteDir = path.resolve(process.cwd(), this.configDir);
    await fs.mkdir(absoluteDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(config, null, 2), 'utf-8');

    this.configs.set(config.id, { ...config, sourcePath: filePath });
    return config;
  }

  async deleteConfig(id) {
    if (!this.configs.has(id)) return false;

    const config = this.configs.get(id);
    if (config.sourcePath) {
      try {
        await fs.unlink(config.sourcePath);
      } catch (err) {
        console.warn(`[OptimizationConfigLoader] Failed to delete ${config.sourcePath}:`, err.message);
      }
    }

    this.configs.delete(id);
    return true;
  }

  isLoaded() {
    return this.loaded;
  }
}

let globalLoader = null;

function getOptimizationLoader(configDir) {
  if (!globalLoader) {
    globalLoader = new OptimizationConfigLoader(configDir);
  }
  return globalLoader;
}

module.exports = {
  OptimizationConfigLoader,
  getOptimizationLoader,
  DEFAULT_CONFIG_DIR
};