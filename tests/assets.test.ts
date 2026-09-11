import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fetchMotion} from '../src/assets';
import {splitMotion} from '../tools/pages_assets';

const motion={
  schemaVersion:1,matrixLayout:'column-major',scriptBoneOffset:400,
  bones:[{name:'TransN',index:0,parent:-1}],
  clips:Object.fromEntries(['Wait1','Jump','攻撃','Fall','Landing'].map((name,index)=>[name,{
    count:2,loop:index===0,
    frames:[Array.from({length:16},(_,n)=>n/7),Array.from({length:16},(_,n)=>n===0?0:-n/11)],
    rootMotion:index===0?null:[[0,1e-9,2],[0,3,4]],
  }])),
};

test('chunked motion loads with identical clips, numbers and metadata within a UTF-8 byte limit',async t=>{
  const {manifest,chunks}=splitMotion(motion,1400);
  assert.ok(chunks.length>1);
  for(const chunk of chunks)assert.ok(Buffer.byteLength(chunk.json)<=1400);
  const files=new Map([
    ['/assets/kirby/motion.json',JSON.stringify(manifest)],
    ...chunks.map(chunk=>[`/assets/kirby/${chunk.name}`,chunk.json] as [string,string]),
  ]);
  t.mock.method(globalThis,'fetch',async(path:RequestInfo|URL)=>{
    assert.ok(files.has(String(path)),`Unexpected asset request: ${path}`);
    return new Response(files.get(String(path)),{headers:{'Content-Type':'application/json'}});
  });
  assert.deepEqual(await fetchMotion('/assets/kirby/motion.json'),motion);
  assert.deepEqual(splitMotion(motion,1400),{manifest,chunks},'chunk names and grouping are reproducible');
});

test('motion loader still accepts complete local exports',async t=>{
  const fetch=t.mock.method(globalThis,'fetch',async()=>Response.json(motion));
  assert.deepEqual(await fetchMotion('/assets/kirby/motion.json'),motion);
  assert.equal(fetch.mock.callCount(),1);
});

test('missing chunks reject the load with the failing path and HTTP status',async t=>{
  const {manifest}=splitMotion(motion,1400);
  t.mock.method(globalThis,'fetch',async(path:RequestInfo|URL)=>String(path).endsWith('/motion.json')
    ?Response.json(manifest):new Response('missing',{status:404}));
  await assert.rejects(fetchMotion('/assets/kirby/motion.json'),/Asset load failed: \/assets\/kirby\/motion-clips-.* \(404\)/);
});

test('splitting respects an exact byte boundary and rejects a single oversized clip',()=>{
  const single={...motion,clips:{Wait1:motion.clips.Wait1}};
  const bytes=Buffer.byteLength(JSON.stringify(single.clips));
  assert.equal(Buffer.byteLength(splitMotion(single,bytes).chunks[0].json),bytes);
  assert.throws(()=>splitMotion(single,bytes-1),/Animation clip Wait1 exceeds/);
});
