import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseReferencePatch, applyReferencePatch, sha256, workerFile } from '../tools/reference_patch.mjs';

const original = Buffer.from('before\r\nconst surface = old();\r\nafter\r\n');
function specification(overrides = {}) {
  return Buffer.from(JSON.stringify({ name: 'Test patch', file: workerFile,
    baseSha256: sha256(original),
    replacements: [{ before: 'old()', after: 'new()' }], ...overrides }));
}

test('patch preserves unrelated bytes and identifies the exact source, specification and result', () => {
  const bytes = specification();
  const { body, metadata } = applyReferencePatch(original, parseReferencePatch(bytes));
  assert.equal(body.toString(), 'before\r\nconst surface = new();\r\nafter\r\n');
  assert.equal(metadata.baseSha256, sha256(original));
  assert.equal(metadata.specificationSha256, sha256(bytes));
  assert.equal(metadata.resultSha256, sha256(body));
  assert.equal(original.toString(), 'before\r\nconst surface = old();\r\nafter\r\n');
});

test('replacement strings remain literal, including dollar substitution syntax', () => {
  const after = "'$& $$ $`'";
  const patch = parseReferencePatch(specification({ replacements: [{ before: 'old()', after }] }));
  assert.equal(applyReferencePatch(original, patch).body.toString(), `before\r\nconst surface = ${after};\r\nafter\r\n`);
});

test('changed source and repeated application are rejected', () => {
  const patch = parseReferencePatch(specification());
  assert.throws(() => applyReferencePatch(Buffer.concat([original, Buffer.from(' ')]), patch), /base hash mismatch/);
  assert.throws(() => applyReferencePatch(applyReferencePatch(original, patch).body, patch), /base hash mismatch/);
});

test('missing or ambiguous replacement targets are rejected even with a matching source hash', () => {
  for (const before of ['absent()', '\r\n']) {
    const patch = parseReferencePatch(specification({ replacements: [{ before, after: '' }] }));
    assert.throws(() => applyReferencePatch(original, patch), /exactly once/);
  }
});

test('invalid specs cannot target another file or silently apply no changes', () => {
  for (const override of [{ file: '../outside.js' }, { file: 'index.html' }, { baseSha256: 'bad' },
    { replacements: [] }, { replacements: [null] },
    { replacements: [{ before: '', after: '' }] }, { name: '' }]) {
    assert.throws(() => parseReferencePatch(specification(override)));
  }
});
