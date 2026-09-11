import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { sha256 } from './reference_patch.mjs';

const effectiveWorker = r => r.patch?.resultSha256 || r.worker?.servedSha256;
const at = sample => sample.elapsedSeconds ?? sample.elapsed;

export function compareRuns(runs, { warmup = 10, vary = ['wasmjit', 'jitwarmup'] } = {}) {
  if (runs.length < 2) throw new Error('Compare at least two runs');
  const first = runs[0];
  const settings = r => [...new URL(r.url).searchParams.entries()].filter(([key]) => !vary.includes(key)).sort();
  for (const run of runs) {
    assert.ok(run.completedAt, 'Incomplete run');
    assert.deepEqual(run.errors, [], 'Probe errors');
    assert.equal(run.unplannedKeyboardEvents, 0, 'Unplanned input');
    assert.deepEqual(run.inputs, [], 'This comparator requires passive runs');
    assert.ok(!run.cpuProfiles, 'CPU-sampled runs must not be used as throughput comparisons');
    assert.ok(first.restored?.checkpoint?.sha256, 'Missing checkpoint identity');
    assert.equal(run.restored?.checkpoint?.sha256, first.restored.checkpoint.sha256, 'Different checkpoint');
    assert.equal(run.coreId, first.coreId, 'Different core');
    assert.equal(run.disc.sha256, first.disc.sha256, 'Different disc');
    assert.ok(effectiveWorker(first), 'Missing worker identity');
    assert.equal(effectiveWorker(run), effectiveWorker(first), 'Different worker');
    assert.equal(run.browser, first.browser, 'Different browser');
    assert.equal(run.headed, first.headed, 'Different browser mode');
    assert.deepEqual(run.machine, first.machine, 'Different hardware');
    assert.deepEqual(settings(run), settings(first), 'Unexpected setting difference');
    const samples = run.samples;
    assert.ok(samples.length >= 2, 'Insufficient samples');
    for (let i=0; i<samples.length; i++) {
      assert.ok(Number.isFinite(at(samples[i])) && Number.isFinite(samples[i].coreTicks), 'Missing clock sample');
      if (i) {
        assert.ok(at(samples[i]) > at(samples[i-1]), 'Nonmonotonic elapsed time');
        assert.ok(samples[i].coreTicks >= samples[i-1].coreTicks, 'Core clock reset');
      }
    }
  }
  const commonEnd = Math.min(...runs.map(r => at(r.samples.at(-1))));
  const results = runs.map(run => {
    const samples = run.samples.filter(s => at(s) >= warmup && at(s) <= commonEnd);
    assert.ok(samples.length >= 2, 'Insufficient common measurement window');
    const a = samples[0], b = samples.at(-1), seconds = at(b)-at(a);
    assert.ok(seconds >= 10, 'Measurement window shorter than 10 seconds');
    const tickRate = a.coreTicksPerSecond;
    assert.ok(Number.isFinite(tickRate) && tickRate > 0 && samples.every(s => s.coreTicksPerSecond === tickRate), 'Invalid tick frequency');
    const gameSeconds = (b.coreTicks-a.coreTicks)/tickRate;
    return { url:run.url, startSeconds:at(a), endSeconds:at(b), wallSeconds:seconds,
      clockPrecision:samples.every(s => s.elapsedSeconds !== undefined) ? 'monotonic seconds' : 'rounded wall-clock seconds',
      coreFrames:b.coreFrame-a.coreFrame, coreFramesPerSecond:(b.coreFrame-a.coreFrame)/seconds,
      emulatedSeconds:gameSeconds, emulationSpeed:gameSeconds/seconds,
      jit:b.jit || { state:b.helpers?.match(/\bjit:(off|warmup|on|disabled)\b/)?.[1] },
      rendererHealth:run.rendererHealth, screenshotStart:a.screenshot, screenshotEnd:b.screenshot };
  });
  return { qualification:'Exploratory passive-run measurements; inspect scenes and repeat trials before any speed or fidelity claim',
    coreId:first.coreId, workerSha256:effectiveWorker(first), checkpointSha256:first.restored.checkpoint.sha256,
    variedSettings:vary, requestedWarmupSeconds:warmup, commonEndSeconds:commonEnd, results };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values: args, positionals } = parseArgs({ allowPositionals:true, options:{
    output:{type:'string'}, warmup:{type:'string',default:'10'}, vary:{type:'string',default:'wasmjit,jitwarmup'} } });
  const warmup = Number(args.warmup);
  assert.ok(args.output && positionals.length >= 2 && Number.isFinite(warmup) && warmup >= 0,
    'Usage: node tools/compare_reference_runs.mjs --output NEW_FILE [--warmup 10] [--vary key,key] REPORT.json REPORT.json');
  const inputs = await Promise.all(positionals.map(async path => {
    const bytes = await readFile(path);
    return { path:resolve(path), sha256:sha256(bytes), run:JSON.parse(bytes) };
  }));
  const result = compareRuns(inputs.map(input=>input.run), { warmup, vary:args.vary.split(',') });
  result.sourceReports = inputs.map(({path,sha256})=>({path,sha256}));
  await writeFile(args.output, JSON.stringify(result,null,2), { flag:'wx' });
  console.log(JSON.stringify(result.results.map(r => ({url:r.url, coreFps:r.coreFramesPerSecond, speed:r.emulationSpeed})),null,2));
}
