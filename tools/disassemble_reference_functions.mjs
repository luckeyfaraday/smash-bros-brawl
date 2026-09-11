// Read-only disassembly of selected function indices from the pinned core.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { sha256 } from './reference_patch.mjs';

const { values: args } = parseArgs({ options: { indices:{type:'string'}, output:{type:'string'} } });
if (!args.indices || !args.output) throw new Error('Usage: node tools/disassemble_reference_functions.mjs --indices N,N --output NEW_FILE');
const indices = args.indices.split(',').map(Number);
if (indices.some(n=>!Number.isSafeInteger(n)||n<0)) throw new Error('Invalid function index');
const root = fileURLToPath(new URL('../',import.meta.url));
const bytes = await readFile(resolve(root,'.tools/reference-runtime/cores/dolphin/dolphin-core-upstream.wasm'));
const snapshot = JSON.parse(await readFile(resolve(root,'.tools/reference-runtime/snapshot.json')));
if (`sha256:${sha256(bytes)}` !== snapshot.coreId) throw new Error('Core identity mismatch');
const { default: factory } = await import('../.tools/wasm-analysis/node_modules/wabt/index.js');
const wabt = await factory();
const module = wabt.readWasm(bytes,{readDebugNames:false,threads:true,simd:true,bulk_memory:true,reference_types:true});
try {
  const wat = module.toText({foldExprs:false,inlineExport:false});
  const functions = indices.map(index=>{
    const start = wat.indexOf(`  (func (;${index};)`);
    if (start < 0) throw new Error(`Function ${index} not found`);
    const next = wat.indexOf('\n  (',start+1);
    const text = wat.slice(start,next<0?wat.length:next);
    return {index,text};
  });
  const version = JSON.parse(await readFile(resolve(root,'.tools/wasm-analysis/node_modules/wabt/package.json'))).version;
  await writeFile(args.output,JSON.stringify({coreId:snapshot.coreId,wabtVersion:version,functions},null,2),{flag:'wx'});
  console.log(`Disassembled ${functions.length} functions from ${snapshot.coreId}; core unchanged.`);
} finally { module.destroy(); }
