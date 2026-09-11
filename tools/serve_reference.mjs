import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { parseReferencePatch, applyReferencePatch } from './reference_patch.mjs';
import { loadReferenceCandidate } from './reference_candidate.mjs';

const root = fileURLToPath(new URL('../.tools/reference-runtime/', import.meta.url));
const { values: args, positionals } = parseArgs({ allowPositionals: true,
  options: { patch: { type: 'string' }, candidate: { type: 'string' } } });
const port = Number(positionals[0] || 5180);
if (positionals.length > 1 || !Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('Usage: npm run reference:serve -- [PORT] [--patch PATCH.json] [--candidate DIRECTORY]');
const candidate = args.candidate ? await loadReferenceCandidate(resolve(args.candidate)) : null;
let variant;
if (args.patch) {
  const patch = parseReferencePatch(await readFile(resolve(args.patch)));
  variant = { ...applyReferencePatch(await readFile(join(root, patch.file)), patch),
    target: resolve(root, patch.file) };
  console.log(`Runtime patch: ${variant.metadata.name} (${variant.metadata.resultSha256})`);
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.svg': 'image/svg+xml' };
const headers = { 'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp', 'Cache-Control': 'no-store' };
const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405, headers); response.end(); return; }
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (candidate && pathname.startsWith(candidate.prefix)) {
      const name = pathname.slice(candidate.prefix.length);
      const bytes = candidate.files.get(name);
      if (!bytes) throw new Error('Unknown candidate artifact');
      response.writeHead(200, { ...headers, 'Content-Type': types[extname(name)] || 'application/octet-stream',
        'Content-Length': bytes.length, 'X-Brawl-Build-Sha256': candidate.evidenceSha256 });
      response.end(request.method === 'HEAD' ? undefined : bytes);
      return;
    }
    let target = resolve(root, '.' + pathname);
    const rel = relative(root, target);
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('Outside runtime');
    if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
    const info = await stat(target);
    if (!info.isFile()) throw new Error('Not a file');
    if (variant && target === variant.target) {
      response.writeHead(200, { ...headers, 'Content-Type': types['.js'],
        'Content-Length': variant.body.length,
        'X-Brawl-Patch-Sha256': variant.metadata.specificationSha256 });
      response.end(request.method === 'HEAD' ? undefined : variant.body);
      return;
    }
    response.writeHead(200, { ...headers, 'Content-Type': types[extname(target)] || 'application/octet-stream',
      'Content-Length': info.size });
    if (request.method === 'HEAD') response.end();
    else createReadStream(target).on('error', () => response.destroy()).pipe(response);
  } catch {
    response.writeHead(404, { ...headers, 'Content-Type': 'text/plain' }); response.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Brawl reference runtime: http://127.0.0.1:${port}/` +
  (candidate ? `?core=upstream&video=wgpu&cpu=single&wasmjit=0&disable=meleeloop,meleecall,osinterrupt&coreid=${candidate.metadata.coreId.slice(7)}` : '')));
