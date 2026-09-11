import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRuns } from '../tools/compare_reference_runs.mjs';
import { summarizeCpuProfile } from '../tools/reference_cpu_profile.mjs';

function fixture() {
  return { completedAt:'2026-09-08T00:00:00Z', errors:[], unplannedKeyboardEvents:0, inputs:[],
    url:'http://127.0.0.1:5181/?video=wgpu&wasmjit=0', coreId:'core-a', disc:{sha256:'disc-a'},
    worker:{servedSha256:'worker-a'}, browser:'test', headed:true, machine:{cpu:'test'},
    restored:{checkpoint:{sha256:'state-a'}},
    samples:[0,10,20,30].map(t => ({elapsed:t, elapsedSeconds:t, coreFrame:t*6,
      coreTicks:100000+t*100, coreTicksPerSecond:1000, screenshot:`${t}.png`})) };
}

test('comparison uses clock deltas after warmup, not restored absolute time or displayed FPS', () => {
  const a=fixture(), b=fixture(); b.url=b.url.replace('wasmjit=0','wasmjit=1');
  const result=compareRuns([a,b]);
  assert.equal(result.results[0].wallSeconds,20);
  assert.equal(result.results[0].emulatedSeconds,2);
  assert.equal(result.results[0].emulationSpeed,0.1);
  assert.equal(result.results[0].coreFramesPerSecond,6);
});

test('comparison rejects changed identities, uncontrolled inputs and undeclared settings', () => {
  for(const change of [r=>r.coreId='other', r=>r.worker.servedSha256='other',
    r=>r.restored.checkpoint.sha256='other', r=>r.unplannedKeyboardEvents=1,
    r=>r.inputs.push({kind:'press'}), r=>r.url+='&cpu=dual', r=>r.errors.push('failure'),
    r=>delete r.completedAt, r=>r.machine.cpu='other', r=>r.cpuProfiles={targets:[]}]) {
    const b=fixture(); change(b);
    assert.throws(()=>compareRuns([fixture(),b]));
  }
});

test('comparison rejects clock resets and intervals too short to measure', () => {
  const reset=fixture(); reset.samples[2].coreTicks=0;
  assert.throws(()=>compareRuns([fixture(),reset]),/clock reset/);
  const badTime=fixture(); badTime.samples[2].elapsedSeconds=5;
  assert.throws(()=>compareRuns([fixture(),badTime]),/Nonmonotonic/);
  assert.throws(()=>compareRuns([fixture(),fixture()],{warmup:25}),/Insufficient/);
});

test('older rounded timestamps are explicitly identified as less precise', () => {
  const a=fixture(); a.samples.forEach(s=>delete s.elapsedSeconds);
  assert.equal(compareRuns([a,fixture()]).results[0].clockPrecision,'rounded wall-clock seconds');
});

test('CPU summary aggregates sampled leaves without double-counting parent stacks', () => {
  const callFrame = functionName => ({functionName,url:'test',lineNumber:0,columnNumber:0});
  const profile = {startTime:0,endTime:10000,
    nodes:[{id:1,callFrame:callFrame('parent'),children:[2,3]},
      {id:2,callFrame:callFrame('leaf')},{id:3,callFrame:callFrame('leaf')}],
    samples:[2,3,2],timeDeltas:[1000,2000,7000]};
  const result = summarizeCpuProfile(profile);
  assert.equal(result.observedUs,10000);
  assert.equal(result.topSelf.length,1);
  assert.equal(result.topSelf[0].functionName,'leaf');
  assert.equal(result.topSelf[0].selfUs,10000);
});
