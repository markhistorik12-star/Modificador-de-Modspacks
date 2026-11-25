// Calculo heuristico del "peso" de un modpack (score 1-10).
// Extraido de main.cjs para poder testearlo de forma aislada.
const constants = require('../constants.cjs');

const calculateModpackWeight = (totalMods, totalSizeMB, optimizationCount, heavyCount) => {
  const W = constants.MODPACK_WEIGHT;
  let score = 5;
  if (totalMods > W.MODS_MEDIUM) score += 1;
  if (totalMods > W.MODS_LARGE) score += 1;
  if (totalSizeMB > W.SIZE_MEDIUM) score += 1;
  if (totalSizeMB > W.SIZE_LARGE) score += 1;
  if (totalSizeMB > W.SIZE_VERY_LARGE) score += 1;
  if (heavyCount >= 3) score += 1;
  if (heavyCount >= 5) score += 1;
  if (optimizationCount === 0) score += 1; // penalizacion: sin mods de optimizacion
  if (optimizationCount >= 2) score -= 1;  // bonus: optimizado
  if (totalMods < W.MODS_SMALL) score -= 1;
  if (totalSizeMB < W.SIZE_SMALL) score -= 1;
  score = Math.max(1, Math.min(10, score));
  return { score, totalMods, totalSizeMB, optimizationCount, heavyCount };
};

module.exports = { calculateModpackWeight };
