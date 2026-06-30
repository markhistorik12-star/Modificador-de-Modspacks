const { parentPort, workerData } = require('worker_threads');
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const MAX_ZIP_SIZE = 500 * 1024 * 1024;

async function validateFileSize(filePath, maxSize) {
  const { size } = await fs.stat(filePath);
  if (size > maxSize) throw new Error('Archivo excede el límite de tamaño.');
  return size;
}

async function calculateModImpact(filePath) {
  let score = 0;
  try {
    const stats = await fs.stat(filePath);
    const sizeMB = stats.size / (1024 * 1024);
    score += Math.min(sizeMB * 1.5, 45);

    await validateFileSize(filePath, MAX_ZIP_SIZE);
    const zip = new AdmZip(filePath);
    const zipEntries = zip.getEntries();

    let mixinCount = 0;
    let hasHeavyAssets = false;
    let isOptimization = false;

    for (const entry of zipEntries) {
      const name = entry.entryName.toLowerCase();
      if (name.includes('mixins.') && name.endsWith('.json')) mixinCount++;
      if (name.startsWith('assets/') && (name.endsWith('.png') || name.endsWith('.obj') || name.endsWith('.json'))) hasHeavyAssets = true;
      if (name.includes('sodium') || name.includes('lithium') || name.includes('embeddium')) isOptimization = true;
    }

    score += (mixinCount * 5);
    if (hasHeavyAssets) score += 15;

    const fileName = path.basename(filePath).toLowerCase();
    if (isOptimization || fileName.includes('ferritecore') || fileName.includes('rubidium') || fileName.includes('sodium')) {
      score -= 60;
    }

    return Math.round(score);
  } catch (error) {
    return 20;
  }
}

async function computeFileHashes(modsPath, jarFiles) {
  const fileHashes = {};
  for (const file of jarFiles) {
    const filePathForHash = path.join(modsPath, file);
    await validateFileSize(filePathForHash, MAX_ZIP_SIZE);
    const buffer = await fs.readFile(filePathForHash);
    const hash = crypto.createHash('sha1').update(buffer).digest('hex');
    fileHashes[hash] = file;
  }
  return fileHashes;
}

async function main() {
  const { task, modsPath, jarFiles } = workerData;

  if (task === 'calculate-impacts') {
    const scores = {};
    for (const file of jarFiles) {
      const filePath = path.join(modsPath, file);
      scores[file] = await calculateModImpact(filePath);
      parentPort.postMessage({ type: 'progress', processed: Object.keys(scores).length, total: jarFiles.length });
    }
    parentPort.postMessage({ type: 'result', scores });
  } else if (task === 'compute-hashes') {
    const fileHashes = await computeFileHashes(modsPath, jarFiles);
    parentPort.postMessage({ type: 'result', fileHashes });
  }
}

main().catch(err => parentPort.postMessage({ type: 'error', message: err.message }));