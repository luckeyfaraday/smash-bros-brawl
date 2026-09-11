import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';import {Poses} from '../src/pose';import {ScriptVM} from '../src/script';
import {CUTTER_RULES,CutterWave} from '../src/final-cutter';import {cpuInput} from '../src/cpu';
import {neutralInput,type FighterData,type MotionData,type Input} from '../src/types';
import route from './fixtures/cutter-route.json' with {type:'json'};
const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')) as MotionData)});
const k=load('kirby'),m=load('mario');const make=(battle=false)=>new Simulation(k.data,k.poses,{fighters:['kirby','mario'],mode:battle?'battle':'training',opponent:'local'},m);
function step(s:Simulation,n=1,input:Partial<Input>={},opponent:Partial<Input>={}){for(let i=0;i<n;i++){s.step({...neutralInput(),...input},{...neutralInput(),...opponent});assert.equal(s.error,null);}}
function air(s:Simulation,x=0,y=50){Object.assign(s.player,{x,y,vy:-1,grounded:false,state:'air',clip:'Fall',jumps:6});s.dummy.x=-75;}

test('Final Cutter preserves all source clips, arc hit phases, article event and wave hit phases',()=>{
 assert.equal(Object.keys(k.poses.motion.clips).length,184);
 for(const prefix of ['SpecialHi','SpecialAirHi']){
  assert.deepEqual(['',2,3,4].map(n=>k.poses.motion.clips[`${prefix}${n}`].count),[23,36,6,35]);
  const vm=new ScriptVM(k.data.moves[prefix+'2'].commands);vm.advance(0);assert.equal(vm.hitboxes.size,4);assert.equal(vm.hitboxes.get(0)!.damage,8);assert.equal(vm.hitboxes.get(0)!.fixed,117);
  vm.advance(2);assert.equal(vm.hitboxes.size,0);vm.advance(18);assert.equal(vm.hitboxes.get(0)!.damage,2);assert.equal(vm.hitboxes.get(0)!.angle,275);assert.equal(vm.hitboxes.get(0)!.radius,7);
  vm.advance(26);assert.equal(vm.hitboxes.get(0)!.radius,6);assert.equal(vm.error,null);
  const land=new ScriptVM(k.data.moves[prefix+'4'].commands);land.advance(0);land.advance(34);assert.deepEqual(land.generatedArticles,[1]);
 }
 const wave=new ScriptVM(k.data.finalCutter!.commands);wave.advance(0);assert.equal(wave.hitboxes.get(0)!.damage,5);assert.equal(wave.hitboxes.get(0)!.fixed,120);wave.advance(2);assert.equal(wave.hitboxes.get(0)!.damage,6);assert.equal(wave.hitboxes.get(0)!.base,60);assert.equal(wave.error,null);
});

test('the original rising root track is transferred once, with mirrored steering and hitlag freezing it',()=>{
 for(const facing of [-1,1]){
  const s=make();air(s);step(s,1,{special:true,axis:facing});let peak=s.player.y;
  for(let n=0;n<42;n++){
   step(s,1,{axis:facing});const f=s.player;
   const root=k.poses.motion.clips[f.clip].rootMotion![f.poseFrame][1];assert.ok(Math.abs(f.y-(50+root))<1e-9);
   peak=Math.max(peak,f.y);
   assert.ok(f.x*facing>=0);
  }
  const frozen=s.snapshot();s.player.hitlag=3;step(s,3,{axis:-facing,jump:true,special:true,attack:true});assert.equal(s.player.y,frozen.player.y);assert.equal(s.player.age,frozen.player.age);
  assert.ok(peak>109);assert.equal(s.actors[0].cutter?.phase,'arc');
 }
});

test('ground use lands, emits one wave, locks the complete landing animation and restores normal actions',()=>{
 const s=make();s.player.x=-35;s.dummy.x=-75;step(s,1,{special:true});let landed=0,spawned=0,previousId=-1;
 for(let n=0;n<110;n++){
  step(s,1,{special:true,attack:n%2===0,jump:n%2===0});
  if(s.actors[0].cutter?.phase==='land')landed++;
  for(const w of s.waves)if(w.id!==previousId){previousId=w.id;spawned++;}
  if(s.actors[0].cutter)assert.equal(s.player.state,'special');
  else break;
 }
 assert.equal(landed,35);assert.equal(spawned,1);assert.equal(s.player.grounded,true);assert.equal(s.player.state,'idle');assert.equal(s.actors[0].cutter,null);
 step(s,1);step(s,1,{jump:true});assert.equal(s.player.state,'jumpSquat');
});

test('missing the platform continues the downward blade past its hold clip without restoring air jumps',()=>{
 const s=make();air(s,155,-20);step(s,1,{special:true});step(s,73,{jump:true,attack:true,special:true});
 assert.equal(s.actors[0].cutter?.phase,'fall');assert.ok(s.player.age>6);assert.equal(s.player.poseFrame,5);assert.equal(s.player.jumps,6);assert.equal(s.script?.hitboxes.get(0)?.damage,2);assert.equal(s.waves.length,0);
 step(s,60);assert.equal(s.actors[0].cutter,null);assert.equal(s.waves.length,0);
});

test('the solid underside stops the rise on both sides without creating a landing wave',()=>{
 for(const side of [-1,1]){
  const s=make(true);step(s,180);air(s,55*side,-60);step(s,1,{special:true});let ceiling=false;
  for(let n=0;n<64;n++){step(s);ceiling ||= s.actors[0].stageContacts.some(c=>c.plane.type==='Ceiling');assert.ok(s.player.y<0);assert.equal(s.player.grounded,false);assert.equal(s.waves.length,0);}
  assert.equal(ceiling,true);
 }
});

test('the real keyboard recovery route catches and climbs either ledge',()=>{
 for(const side of [-1,1]){
  const s=make();s.player.x=-12*side;s.dummy.x=5*side;let caught=false;
  for(const part of route.steps){const keys=part.keys;for(let i=0;i<part.frames;i++){
   step(s,1,{axis:(keys.includes('KeyD')?1:keys.includes('KeyA')?-1:0)*side,run:keys.includes('ShiftLeft'),down:keys.includes('KeyS'),vertical:keys.includes('KeyS')?-1:0,special:keys.includes('KeyI')});caught ||= !!s.player.ledgeSide;
  }}
  assert.equal(caught,true);assert.equal(s.player.grounded,true);assert.equal(s.player.ledgeSide,0);assert.equal(s.player.jumps,0);assert.equal(s.waves.length,0);assert.ok(Math.abs(s.player.x)<STAGE.right);
 }
});

test('the travelling wave hits once and can be shielded without applying hitlag to its owner',()=>{
 for(const blocked of [false,true]){
  const s=make(blocked);if(blocked)step(s,180);s.player.x=-35;s.dummy.x=40;
  step(s,1,{special:true},{shield:blocked});for(let n=0;n<100&&!s.lastHit;n++)step(s,1,{}, {shield:blocked});
  assert.equal(s.lastHit?.move,'FinalCutterRegular');assert.equal(s.lastHit?.blocked,blocked);assert.equal(s.dummy.damage,blocked?0:6);assert.equal(s.waves.length,0);assert.equal(s.player.hitlag,0);assert.equal(s.hasHit,false);
  const age=s.player.age;step(s,1,{}, {shield:blocked});assert.equal(s.player.age,age+1);assert.ok(s.dummy.hitlag>0);
  step(s,40);assert.equal(s.hits,blocked?0:1);
 }
});

test('wave launch direction is independent of its owner, and early contact uses the 5 percent phase',()=>{
 const s=make();s.player.facing=-1;s.waves.push(new CutterWave(0,0,0,1,k.data.finalCutter!.commands));step(s);
 assert.equal(s.dummy.damage,5);assert.ok(s.dummy.vx>0);assert.equal(s.player.hitlag,0);assert.equal(s.waves.length,0);
 const wave=new CutterWave(1,0,STAGE.right-5,1,k.data.finalCutter!.commands);const old=wave.snapshot();
 for(let n=0;n<CUTTER_RULES.waveLife;n++)wave.step();
 assert.equal(wave.spent,true);assert.ok(wave.y<0);assert.equal(old.age,0);assert.equal(old.x,STAGE.right-5);
});

test('CPU spends Final Cutter after its last air jump and returns to the stage',()=>{
 const s=make();air(s,116,-30);const self=s.actors[0],target=s.actors[1];assert.equal(cpuInput(self,target,0).special,true);
 for(let n=0;n<150;n++){s.step(cpuInput(self,target,n));assert.equal(s.error,null);}
 assert.ok(s.player.grounded||s.player.ledgeSide);assert.equal(s.actors[0].cutter,null);
});
