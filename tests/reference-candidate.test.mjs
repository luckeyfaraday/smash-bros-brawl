import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { loadReferenceCandidate, verifyReferenceCheckpoint } from '../tools/reference_candidate.mjs';
import { sha256 } from '../tools/reference_patch.mjs';

async function fixture(t) {
  const parent = await realpath(tmpdir());
  const dir = await mkdtemp(join(parent, 'brawl-candidate-test-'));
  t.after(async () => {
    const target = await realpath(dir);
    if (dirname(target) !== parent || !basename(target).startsWith('brawl-candidate-test-'))
      throw new Error('Unexpected test cleanup path');
    await rm(target, { recursive: true });
  });
  const files = { 'dolphin-core-upstream.js': Buffer.from('fixture JavaScript'),
    'dolphin-core-upstream.wasm': Buffer.from('fixture WASM') };
  const metadata = { completedAt: '2026-09-08T00:00:00Z',
    coreId: 'sha256:' + sha256(files['dolphin-core-upstream.wasm']),
    artifacts: Object.fromEntries(Object.entries(files).map(([name, bytes]) =>
      [name, { size: bytes.length, sha256: sha256(bytes) }])) };
  for (const [name, bytes] of Object.entries(files)) await writeFile(join(dir, name), bytes);
  await writeFile(join(dir, 'dolphin-core-upstream.build.json'), JSON.stringify(metadata));
  return { dir, metadata };
}

test('candidate serves only identified artifacts and keeps an immutable copy of verified bytes', async t => {
  const { dir, metadata } = await fixture(t);
  const candidate = await loadReferenceCandidate(dir);
  assert.equal(candidate.prefix, `/build/core-candidates/${metadata.coreId.slice(7)}/`);
  assert.equal(candidate.files.size, 3);
  assert.equal(candidate.files.get('../outside'), undefined);
  const expected = await readFile(join(dir, 'dolphin-core-upstream.js'));
  await writeFile(join(dir, 'dolphin-core-upstream.js'), 'changed after load');
  assert.deepEqual(candidate.files.get('dolphin-core-upstream.js'), expected);
  await assert.rejects(loadReferenceCandidate(dir), /does not match build evidence/);
});

test('unfinished and contradictory build identities are rejected', async t => {
  const { dir, metadata } = await fixture(t);
  const path = join(dir, 'dolphin-core-upstream.build.json');
  await writeFile(path, JSON.stringify({ ...metadata, completedAt: null }));
  await assert.rejects(loadReferenceCandidate(dir), /completed build evidence/);
  await writeFile(path, JSON.stringify({ ...metadata, coreId: 'sha256:' + 'a'.repeat(64) }));
  await assert.rejects(loadReferenceCandidate(dir), /identity does not match/);
});

test('explicit checkpoint migration preserves source identity and cannot bypass byte or disc checks', () => {
  const bytes = Buffer.from('state fixture');
  const source = 'sha256:' + 'a'.repeat(64);
  const target = 'sha256:' + 'b'.repeat(64);
  const disc = 'c'.repeat(64);
  const metadata = { size: bytes.length, sha256: sha256(bytes), coreId: source, discSha256: disc };
  assert.equal(verifyReferenceCheckpoint(metadata, bytes, source, disc).migrating, false);
  assert.throws(() => verifyReferenceCheckpoint(metadata, bytes, target, disc), /explicitly enabled/);
  assert.deepEqual(verifyReferenceCheckpoint(metadata, bytes, target, disc, true),
    { migrating: true, sourceCoreId: source, targetCoreId: target });
  assert.throws(() => verifyReferenceCheckpoint(metadata, Buffer.from('corrupt'), target, disc, true), /bytes or disc/);
  assert.throws(() => verifyReferenceCheckpoint(metadata, bytes, target, 'd'.repeat(64), true), /bytes or disc/);
});
