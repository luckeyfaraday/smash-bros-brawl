import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sha256 } from './reference_patch.mjs';

export async function loadReferenceCandidate(directory) {
  const metadataBytes = await readFile(join(directory, 'dolphin-core-upstream.build.json'));
  const metadata = JSON.parse(metadataBytes);
  if (!/^sha256:[a-f0-9]{64}$/.test(metadata.coreId) || !metadata.completedAt || !metadata.artifacts)
    throw new Error('Candidate requires completed build evidence and a SHA-256 core identity');
  const files = new Map();
  for (const name of ['dolphin-core-upstream.js', 'dolphin-core-upstream.wasm']) {
    const bytes = await readFile(join(directory, name));
    const expected = metadata.artifacts[name];
    if (!expected || expected.size !== bytes.length || expected.sha256 !== sha256(bytes))
      throw new Error(`Candidate artifact does not match build evidence: ${name}`);
    files.set(name, bytes);
  }
  if (metadata.coreId !== 'sha256:' + sha256(files.get('dolphin-core-upstream.wasm')))
    throw new Error('Candidate core identity does not match its WASM');
  files.set('dolphin-core-upstream.build.json', metadataBytes);
  return { metadata, files, evidenceSha256: sha256(metadataBytes),
    prefix: `/build/core-candidates/${metadata.coreId.slice(7)}/` };
}

export function verifyReferenceCheckpoint(metadata, bytes, coreId, discSha256, allowMigration = false) {
  if (!/^sha256:[a-f0-9]{64}$/.test(metadata.coreId) || metadata.discSha256 !== discSha256 ||
      metadata.size !== bytes.length || metadata.sha256 !== sha256(bytes))
    throw new Error('Checkpoint bytes or disc identity mismatch');
  const migrating = metadata.coreId !== coreId;
  if (migrating && !allowMigration) throw new Error('Checkpoint core mismatch; migration must be explicitly enabled');
  return { migrating, sourceCoreId: metadata.coreId, targetCoreId: coreId };
}
