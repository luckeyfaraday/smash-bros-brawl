import { createHash } from 'node:crypto';

export const workerFile = 'src/upstream-discio-worker.js';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

export function parseReferencePatch(bytes) {
  const patch = JSON.parse(bytes.toString('utf8'));
  if (!patch || patch.file !== workerFile || typeof patch.name !== 'string' || !patch.name.trim() ||
      !/^[a-f0-9]{64}$/.test(patch.baseSha256) ||
      !Array.isArray(patch.replacements) || !patch.replacements.length)
    throw new Error('Patch requires a name, worker target, SHA-256 base and replacements');
  for (const replacement of patch.replacements) {
    if (!replacement || typeof replacement.before !== 'string' || !replacement.before ||
        typeof replacement.after !== 'string')
      throw new Error('Patch replacements require nonempty before and string after');
  }
  return { ...patch, specificationSha256: sha256(bytes) };
}

export function applyReferencePatch(original, patch) {
  const baseSha256 = sha256(original);
  if (baseSha256 !== patch.baseSha256) throw new Error('Worker patch base hash mismatch');
  let body = original.toString('utf8');
  for (const { before, after } of patch.replacements) {
    if (body.split(before).length !== 2)
      throw new Error('Each worker replacement must match exactly once');
    body = body.replace(before, () => after);
  }
  body = Buffer.from(body, 'utf8');
  return { body, metadata: { name: patch.name, file: patch.file,
    specificationSha256: patch.specificationSha256, baseSha256, resultSha256: sha256(body) } };
}
