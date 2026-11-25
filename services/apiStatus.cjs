const API_TIMEOUT = 5000;
const CACHE_TTL = 30000;

let statusCache = {
  curseforge: { status: 'unknown', latency: null, lastCheck: 0, error: null },
  modrinth: { status: 'unknown', latency: null, lastCheck: 0, error: null }
};

const checkApi = async (name, checkFn) => {
  const now = Date.now();
  const cached = statusCache[name];

  if (cached.status !== 'unknown' && (now - cached.lastCheck) < CACHE_TTL) {
    return cached;
  }

  const start = Date.now();
  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), API_TIMEOUT);

    await checkFn(controller.signal);
    clearTimeout(timeout);

    const latency = Date.now() - start;
    const result = { status: 'connected', latency, lastCheck: now, error: null };
    statusCache[name] = result;
    return result;
  } catch (err) {
    clearTimeout(timeout);
    const latency = Date.now() - start;
    const result = {
      status: err.name === 'AbortError' ? 'timeout' : 'error',
      latency: err.name === 'AbortError' ? API_TIMEOUT : latency,
      lastCheck: now,
      error: err.message
    };
    statusCache[name] = result;
    return result;
  }
};

const checkCurseForge = async (signal) => {
  const apiKey = process.env.CURSEFORGE_API_KEY;
  if (!apiKey) throw new Error('No API key configured');

  const params = new URLSearchParams({
    gameId: '432',
    classId: '6',
    pageSize: '1'
  });

  const res = await fetch(`https://api.curseforge.com/v1/mods/search?${params.toString()}`, {
    headers: { 'x-api-key': apiKey, 'Accept': 'application/json' },
    signal
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

const checkModrinth = async (signal) => {
  const res = await fetch('https://api.modrinth.com/v2/tag/game_version', { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
};

const getStatus = async () => {
  const [curseforgeStatus, modrinthStatus] = await Promise.all([
    checkApi('curseforge', checkCurseForge),
    checkApi('modrinth', checkModrinth)
  ]);

  return {
    curseforge: curseforgeStatus,
    modrinth: modrinthStatus,
    overall: curseforgeStatus.status === 'connected' && modrinthStatus.status === 'connected' ? 'healthy' :
             curseforgeStatus.status === 'connected' || modrinthStatus.status === 'connected' ? 'degraded' : 'down'
  };
};

const forceRefresh = async () => {
  statusCache = {
    curseforge: { status: 'unknown', latency: null, lastCheck: 0, error: null },
    modrinth: { status: 'unknown', latency: null, lastCheck: 0, error: null }
  };
  return getStatus();
};

module.exports = {
  getStatus,
  forceRefresh,
  getCachedStatus: () => statusCache
};
