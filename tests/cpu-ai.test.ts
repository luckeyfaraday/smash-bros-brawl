import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AiScriptVM,type AiHost,type AiScript} from '../src/ai-script';
import {aiAttack,aiScript,attackSlot} from '../src/cpu-mario';
import {Simulation,STAGE} from '../src/simulation';
import {Poses} from '../src/pose';
import {neutralInput} from '../src/types';

const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),
  poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))});
const mario=load('mario');
function battle(){const s=new Simulation(mario.data,mario.poses,{mode:'battle',opponent:'cpu'});for(let n=0;n<180;n++)s.step(neutralInput());return s;}
const host:AiHost={value:(id)=>id===2?-1:id===3?-1:0,requirement:()=>false,chooseAttack:()=>0,
  attackRange:n=>n,point:()=>[0,0],shieldRemaining:()=>400};
const bytecode=(instructions:[number,number[]][],constants:number[]=[]):AiScript=>({id:1,offset:0,constants,
  instructions:instructions.map(([opcode,args],index)=>({offset:16+index*4,opcode,args}))});

test('original archives supply shared routines, character overrides and named Mario attack ranges',()=>{
  assert.equal(aiScript('mario',0x40)?.offset,0x29f0);
  assert.equal(aiScript('mario',0x10a0)?.offset,0x20,'Mario overrides shared edgeguard script');
  assert.equal(aiScript('mario',0x50)?.id,0x8050,'high-bit script IDs resolve by native true ID');
  assert.deepEqual([aiAttack('mario','Attack11')?.start,aiAttack('mario','Attack11')?.end,aiAttack('mario','Attack11')?.xmax],[1,3,16]);
  assert.equal(attackSlot(0x6021),11);assert.equal(attackSlot(0x602b),21);assert.equal(attackSlot(0x6030),-1);
});

test('vanilla WalkUp executes source offsets and carries variables across Return/Seek frames',()=>{
  const vm=new AiScriptVM(aiScript('mario',0x40)!,123);
  const a=vm.step(host),snapshot=vm.snapshot();
  assert.equal(a.x,Math.fround(-.7));assert.ok(a.offsets.includes(0x6c));
  assert.equal(snapshot.frames,0,'Seek resets NumFrames to -1 before the end-of-frame increment');
  assert.equal(vm.step(host).offsets[0],0x7c,'next frame resumes after the sought label');
  snapshot.variables[0]=99;assert.equal(vm.state.variables[0],Math.fround(.7));
  for(let i=0;i<12;i++)vm.step(host);
  assert.equal(vm.state.finished,true);assert.equal(vm.state.error,null);
});

test('native stick commands accumulate until ClearStick; Goto has one return slot',()=>{
  const vm=new AiScriptVM(bytecode([[3,[]],[31,[0x2000]],[10,[0x2000]],[31,[0x2001,0x2000]],
    [50,[1]],[28,[7]],[4,[]],[3,[7]],[31,[0x2000]],[4,[]]],[.5,.25]));
  const result=vm.step(host);
  assert.equal(result.x,.75);assert.equal(result.y,0);assert.equal(vm.state.error,null);
  assert.equal(vm.step(host).x,.75,'Goto does not replace the frame resume label');
});

test('native else-if nesting and non-short-circuit compound tests preserve RNG consumption',()=>{
  let reads=0;
  const h={...host,requirement:(id:number)=>{reads++;return id===2;}};
  const vm=new AiScriptVM(bytecode([[6,[1]],[31,[0x2000]],[8,[]],[6,[2]],[22,[3]],
    [31,[0x2001]],[8,[]],[31,[0x2002]],[9,[]],[0,[]]],[1,.5,-1]));
  assert.equal(vm.step(h).x,.5);assert.equal(reads,3);assert.equal(vm.state.error,null);
});

test('malformed and unsupported bytecode stops with a diagnostic instead of spinning or emitting input',()=>{
  for(const script of [bytecode([[31,[0x2fff]]]),bytecode([[0xff,[]]]),bytecode([[3,[0]],[5,[0]],[20,[]]])]){
    const vm=new AiScriptVM(script),output=vm.step(host);
    assert.ok(vm.state.error);assert.equal(vm.state.finished,true);
    assert.deepEqual([output.x,output.y,output.buttons,output.call],[0,0,0,null]);
  }
});

test('Mario approaches and attacks through original bytecode in an actual CPU match',()=>{
  const s=battle(),scripts=new Set<number>(),calls=new Set<number>();
  for(let n=0;n<600;n++){
    s.step(neutralInput());const last=s.cpu!.trace().at(-1)!;
    if(last.script!==null)scripts.add(last.script);if(last.call!==null)calls.add(last.call);
    assert.equal(s.error,null);
  }
  assert.ok(scripts.has(0x60));assert.ok(scripts.has(0x1010));assert.ok(calls.has(0x6031));
  assert.ok(s.hits>0);assert.ok(s.player.damage>0||s.stocks[0]<3);
});

test('Mario grabs a shielding opponent and blocks an incoming attack with the source shield script',()=>{
  const grab=battle();grab.player.x=0;grab.dummy.x=10;
  let held=false;
  for(let n=0;n<100;n++){grab.step({...neutralInput(),shield:true});held||=grab.hold?.owner===1;assert.equal(grab.error,null);}
  assert.ok(held);
  const defend=battle();defend.player.x=-8;defend.dummy.x=8;
  defend.actors[0].f.facing=1;defend.actors[1].f.facing=-1;
  let shieldScript=false,blocked=false;
  for(let n=0;n<100;n++){
    defend.step({...neutralInput(),smash:n===0});
    shieldScript||=defend.cpu!.trace().at(-1)?.script===0x3020;
    blocked||=defend.lastHit?.blocked===true;assert.equal(defend.error,null);
  }
  assert.ok(shieldScript);assert.ok(blocked);assert.equal(defend.dummy.damage,0);
});

test('source recovery aims Mario back to both ledges after spending his last jump',()=>{
  for(const side of [-1,1]){
    const s=battle();s.player.x=0;
    Object.assign(s.dummy,{x:side*(STAGE.right+16),y:-30,vy:-.5,vx:0,grounded:false,jumps:2,state:'air',clip:'Fall',facing:-side});
    let script=false,special=false,saved=false;
    for(let n=0;n<160;n++){
      s.step(neutralInput());script||=s.cpu!.trace().at(-1)?.script===0x2040;
      special||=s.dummy.state==='special';saved||=s.dummy.grounded||!!s.dummy.ledgeSide;
      assert.equal(s.error,null);
    }
    assert.ok(script,`${side}: recovery script`);assert.ok(special,`${side}: up special`);
    assert.ok(saved,`${side}: regained stage/ledge`);assert.equal(s.stocks[1],3);
  }
});

test('CPU state replays deterministically and resets with a fresh simulation',()=>{
  const a=battle(),b=battle();
  for(let n=0;n<1400;n++){
    const input={...neutralInput(),axis:n%240<120?-1:1,run:true,attack:n%17===0,shield:n%180<20,jump:n%130===0};
    a.step(input);b.step(input);assert.equal(a.error,null);assert.equal(b.error,null);
  }
  assert.equal(a.hash(),b.hash());
  const snap=a.cpu!.snapshot();if(snap.vm)snap.vm.variables[0]=12345;
  assert.equal(a.hash(),b.hash());
  const fresh=battle();assert.equal(fresh.cpu!.snapshot().vm,null);assert.equal(fresh.cpu!.snapshot().pending,0);
  assert.equal(new Simulation(mario.data,mario.poses).cpu,null,'training remains passive');
});
