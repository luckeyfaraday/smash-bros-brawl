import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { sha256, parseReferencePatch, applyReferencePatch } from './reference_patch.mjs';

const { values: args } = parseArgs({ options: { records: { type: 'string' }, output: { type: 'string' } } });
if (!args.records || !args.output) throw new Error('Usage: node tools/verify_texture_gpu.mjs --records RECORDS.json --output NEW_DIRECTORY');
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(args.output);
const recordsFile = resolve(args.records);
const recordsBytes = await readFile(recordsFile);
const producer = JSON.parse(await readFile(join(dirname(recordsFile), 'report.json')));
assert.equal(sha256(recordsBytes), producer.recordsSha256);
assert.equal(producer.source.localPatchSha256, sha256(await readFile(join(root, 'patches/dolphin/0001-texture-mip-count.patch'))));
const original = await readFile(join(root, '.tools/reference-runtime/src/upstream-discio-worker.js'));
const patch = parseReferencePatch(await readFile(join(root, 'tools/reference-patches/hardware-mip-count.json')));
const candidate = applyReferencePatch(original, patch);
function extract(worker) {
  const text = worker.toString();
  const formats = text.match(/const WGPU_TEX_FORMAT = \[[\s\S]*?\];/)?.[0];
  const start = text.indexOf('        case WGPU_CMD_OP_CREATE_TEXTURE: {');
  const end = text.indexOf('        case WGPU_CMD_OP_UPLOAD_TEXTURE:', start);
  assert.ok(formats && start > 0 && end > start);
  const colorView = text.match(/colorView = (ct\.tex\.createView\([^;]*\));/)?.[1];
  const depthView = text.match(/view: (dt\.tex\.createView\([^\n]*\)),/)?.[1];
  assert.ok(colorView && depthView);
  return { create: `${formats}\nconst recWord=0, WGPU_CMD_OP_CREATE_TEXTURE=7;\nswitch(u32[0]) {\n${text.slice(start,end)}\n}`,
    colorView, depthView };
}
await mkdir(output, { recursive: false });
const report = { scope: 'Native C++ command records replayed by isolated worker handlers on WebGPU; not Brawl integration',
  producer, patch: candidate.metadata, errors: [] };
let browser;
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-unsafe-webgpu'] });
  report.browser = browser.version();
  const page = await browser.newPage();
  await page.route('http://127.0.0.1:5180/texture-contract', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Texture contract test</title>' }));
  await page.goto('http://127.0.0.1:5180/texture-contract');
  report.result = await page.evaluate(async ({ baseline, candidate, records }) => {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter');
    const dev = await adapter.requestDevice();
    const unexpected = [];
    dev.addEventListener('uncapturederror', e => unexpected.push(e.error.message));
    const objects = { textures: new Map() };
    const create = (code, record) => {
      new Function('dev', 'u32', 'webGpuObjects', code)(dev, new Uint32Array(record), objects);
      return objects.textures.get(record[1]);
    };
    const assert = (ok, message) => { if (!ok) throw new Error(message); };
    const negative = [];
    // Positive failure control: the original consumer still allocates only mip 0.
    dev.pushErrorScope('validation');
    const originalTexture = create(baseline.create, records.find(r => r.name === 'brawl-six-levels').record);
    dev.queue.writeTexture({ texture: originalTexture.tex, mipLevel: 1 }, new Uint8Array(4), {}, [1,1,1]);
    const missingMip = await dev.popErrorScope();
    assert(missingMip && /mip/i.test(missingMip.message), 'Baseline failed to reproduce missing mip error');
    negative.push({ kind: 'baseline-missing-mip', message: missingMip.message });
    originalTexture.tex.destroy(); objects.textures.clear();

    dev.pushErrorScope('validation');
    const results = [];
    for (const item of records) {
      const record = item.record;
      const t = create(candidate.create, record);
      const levels = record[7] || 1, layers = record[6] || 1;
      assert(t.tex.mipLevelCount === levels, `${item.name}: wrong allocation`);
      const expected = [];
      for (let layer=0; layer<layers; layer++) for (let level=0; level<levels; level++) {
        const width = Math.max(1, record[2] >> level), height = Math.max(1, record[3] >> level);
        const color = [17+level*19, 35+layer*53, 170, 255];
        expected.push(color);
        const data = new Uint8Array(width*height*4);
        for (let i=0; i<data.length; i+=4) data.set(color,i);
        dev.queue.writeTexture({ texture:t.tex, mipLevel:level, origin:[0,0,layer] }, data,
          { bytesPerRow:width*4, rowsPerImage:height }, [width,height,1]);
      }
      // Read each mip through a shader view containing the full mip chain.
      const bytes = levels*layers*16;
      const buffer = dev.createBuffer({ size:bytes, usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC });
      const readback = dev.createBuffer({ size:bytes, usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST });
      const module = dev.createShaderModule({ code:`
        @group(0) @binding(0) var t: texture_2d_array<f32>;
        @group(0) @binding(1) var<storage,read_write> colors: array<vec4f>;
        @compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u) {
          if(id.x < ${levels*layers}u) {
            colors[id.x] = textureLoad(t,vec2i(0),i32(id.x/${levels}u),i32(id.x%${levels}u));
          }
        }` });
      const pipeline = dev.createComputePipeline({ layout:'auto', compute:{ module, entryPoint:'main' } });
      const bg = dev.createBindGroup({ layout:pipeline.getBindGroupLayout(0), entries:[
        { binding:0, resource:t.tex.createView({dimension:'2d-array'}) }, { binding:1, resource:{buffer} }] });
      const enc = dev.createCommandEncoder(), pass = enc.beginComputePass();
      pass.setPipeline(pipeline); pass.setBindGroup(0,bg); pass.dispatchWorkgroups(Math.ceil(levels*layers/64)); pass.end();
      enc.copyBufferToBuffer(buffer,0,readback,0,bytes); dev.queue.submit([enc.finish()]);
      await readback.mapAsync(GPUMapMode.READ);
      const actual = Array.from(new Float32Array(readback.getMappedRange()));
      expected.flat().forEach((value,i) => assert(Math.abs(actual[i]-value/255)<1e-6, `${item.name}: mip/layer pixel mismatch at ${i}`));
      readback.unmap(); readback.destroy(); buffer.destroy();
      if (layers === 1) {
        const colorView = new Function('ct',`return ${candidate.colorView}`)(t);
        const enc = dev.createCommandEncoder();
        enc.beginRenderPass({ colorAttachments:[{ view:colorView, loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1] }] }).end();
        dev.queue.submit([enc.finish()]);
      }
      results.push({ name:item.name, width:t.tex.width, height:t.tex.height, levels, layers, verifiedSubresources:levels*layers });
    }
    // Legacy records retain one level; this does not pretend to repair the old core.
    const legacy = [7,100,4,4,0,23,1,0];
    assert(create(candidate.create,legacy).tex.mipLevelCount === 1, 'Legacy record changed semantics');
    const depth = dev.createTexture({ size:[4,4], mipLevelCount:3, format:'depth32float', usage:GPUTextureUsage.RENDER_ATTACHMENT });
    const depthView = new Function('dt',`return ${candidate.depthView}`)({tex:depth});
    const enc = dev.createCommandEncoder();
    enc.beginRenderPass({ colorAttachments:[], depthStencilAttachment:{view:depthView,depthClearValue:1,depthLoadOp:'clear',depthStoreOp:'store'} }).end();
    dev.queue.submit([enc.finish()]);
    await dev.queue.onSubmittedWorkDone();
    const valid = await dev.popErrorScope();
    assert(!valid, valid?.message || 'Candidate validation failed');

    // A default view of a multi-mip texture cannot be a render attachment.
    dev.pushErrorScope('validation');
    const t = objects.textures.get(records.find(r=>r.name==='brawl-six-levels').record[1]);
    const wrongView = new Function('ct',`return ${baseline.colorView}`)(t);
    const bad = dev.createCommandEncoder();
    bad.beginRenderPass({colorAttachments:[{view:wrongView,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,1]}]}).end();
    bad.finish();
    const badAttachment = await dev.popErrorScope();
    assert(badAttachment, 'Baseline attachment failed to expose multi-mip view error');
    negative.push({kind:'baseline-multi-mip-attachment',message:badAttachment.message});
    assert(!unexpected.length, unexpected.join('\n'));
    for(const t of objects.textures.values()) t.tex.destroy();
    depth.destroy(); dev.destroy();
    return { gpu:{vendor:adapter.info.vendor,architecture:adapter.info.architecture}, cases:results, negativeControls:negative, unexpectedErrors:unexpected };
  }, { baseline:extract(original), candidate:extract(candidate.body), records:JSON.parse(recordsBytes) });
  console.log(`Passed ${report.result.cases.length} C++ → WebGPU cases and ${report.result.negativeControls.length} failure controls.`);
} catch (error) {
  report.errors.push(String(error)); process.exitCode = 1; console.error(error);
} finally {
  await writeFile(join(output,'report.json'), JSON.stringify(report,null,2));
  await browser?.close();
}
