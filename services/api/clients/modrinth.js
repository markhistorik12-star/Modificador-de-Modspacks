const BASE_URL = 'https://api.modrinth.com/v2';

const toSearchParams = (params) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  return searchParams;
};

export const searchMods = ({ query, facets, sortBy, limit = 200 }) => {
  const params = toSearchParams({
    query: encodeURIComponent(query),
    facets: JSON.stringify(facets),
    index: sortBy,
    limit
  });

  return fetch(`${BASE_URL}/search?${params.toString()}`);
};

export const getProjectVersions = (projectId) => {
  return fetch(`${BASE_URL}/project/${encodeURIComponent(projectId)}/version`);
};

export const getProjectVersionsByFilters = ({ projectId, loaders, gameVersions }) => {
  const params = toSearchParams({
    loaders: JSON.stringify(loaders),
    game_versions: JSON.stringify(gameVersions)
  });

  return fetch(`${BASE_URL}/project/${encodeURIComponent(projectId)}/version?${params.toString()}`);
};

export const getVersion = (versionId) => {
  return fetch(`${BASE_URL}/version/${encodeURIComponent(versionId)}`);
};

export const getVersionsByHashes = ({ hashes, algorithm = 'sha1' }) => {
  return fetch(`${BASE_URL}/version_files`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hashes, algorithm })
  });
};

export const getGameVersions = () => {
  return fetch(`${BASE_URL}/tag/game_version`);
};
