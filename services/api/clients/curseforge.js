const BASE_URL = 'https://api.curseforge.com/v1';

const createHeaders = (apiKey) => ({
  'x-api-key': apiKey,
  'Accept': 'application/json'
});

const toSearchParams = (params) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      searchParams.set(key, String(value));
    }
  });
  return searchParams;
};

export const searchMods = ({ apiKey, query, gameVersion, modloaderId, sortField, pageSize = 50 }) => {
  const params = toSearchParams({
    gameId: 432,
    classId: 6,
    searchFilter: encodeURIComponent(query),
    modLoaderType: modloaderId,
    gameVersion,
    sortField,
    sortOrder: 'desc',
    pageSize
  });

  return fetch(`${BASE_URL}/mods/search?${params.toString()}`, {
    headers: createHeaders(apiKey)
  });
};

export const getModFiles = ({ apiKey, projectId, gameVersion, modloaderId }) => {
  const params = toSearchParams({
    gameVersion,
    modLoaderType: modloaderId
  });

  return fetch(`${BASE_URL}/mods/${projectId}/files?${params.toString()}`, {
    headers: createHeaders(apiKey)
  });
};

export const getDownloadUrl = ({ apiKey, projectId, fileId }) => {
  return fetch(`${BASE_URL}/mods/${projectId}/files/${fileId}/download-url`, {
    headers: createHeaders(apiKey)
  });
};
