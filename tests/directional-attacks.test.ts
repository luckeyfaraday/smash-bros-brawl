import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';
import {Poses} from '../src/pose';
import {ScriptVM} from '../src/script';
import {groundAttack,DIRECTIONAL_ATTACKS} from '../src/moves';
import {cpuInput} from '../src/cpu';
import {neutralInput,type Input,type FighterData,type MotionData} from '../src/types';
import type {FighterId} from '../src/roster';
const ids:FighterId[]=['mario','link','kirby','pikachu'];
const assets=Object.fromEntries(ids.map(id=>[id,{data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')) as MotionData)}]));
const make=(id:FighterId,battle=false)=>new Simulation(assets[id].data,assets[id].poses,{fighters:[id,'mario'],mode:battle?'battle':'training',opponent:'local'},assets.mario);
const input=(i:Partial<Input>={})=>({...neutralInput(),...i});
function step(s:Simulation,n=1,i:Partial<Input>={},opponent:Partial<Input>={}){for(let j=0;j<n;j++){s.step(input(i),input(opponent));assert.equal(s.error,null);}}

test('directions select distinct tilts in either facing, with angled variants and Link fallback',()=>{
 for(const id of ids){const moves=assets[id].data.moves;
  assert.equal(groundAttack(input({axis:.2,vertical:.2}),false,moves),'Attack11');
  assert.equal(groundAttack(input({vertical:1}),false,moves),'AttackHi3');
  assert.equal(groundAttack(input({down:true}),false,moves),'AttackLw3');
  for(const side of [-1,1]){
   assert.equal(groundAttack(input({axis:side}),false,moves),'AttackS3S');
   for(const [y,name] of [[1,'AttackS3Hi'],[-1,'AttackS3Lw']] as const)assert.equal(groundAttack(input({axis:side,vertical:y}),false,moves),id==='link'?'AttackS3S':name);
   assert.equal(groundAttack(input({axis:side*.5,vertical:.8}),false,moves),'AttackHi3');
   const s=make(id);step(s,1,{axis:side,attack:true});assert.equal(s.player.clip,'AttackS3S');assert.equal(s.player.facing,side);
   const dash=make(id);step(dash,1,{axis:side,run:true});step(dash,1,{axis:side,run:true,attack:true});assert.equal(dash.player.clip,'AttackDash');
   const idle=make(id);step(idle,1,{axis:side,run:true,attack:true});assert.equal(idle.player.clip,'AttackS3S');
  }
 }
});

test('source active ages, damage phases and interrupts are retained for all sixteen basic ground attacks',()=>{
 const expected:Record<string,[number,number,number,number][]>={
  mario:[[4,6,8,24],[4,10,7,29],[4,6,7,34],[5,24,9,37]],
  link:[[14,17,13,39],[7,11,9,35],[12,13,12,31],[7,10,12,39]],
  kirby:[[4,7,8,27],[3,9,7,20],[3,5,6,20],[11,36,4,49]],
  pikachu:[[4,9,9,29],[6,12,7,23],[6,8,7,18],[4,15,7,49]],
 };
 for(const id of ids){
  for(const [index,move] of ['AttackS3S','AttackHi3','AttackLw3','AttackDash'].entries()){
   const {data,poses}=assets[id],vm=new ScriptVM(data.moves[move].commands),active:number[]=[],damage:number[]=[];let interrupt=-1;
   for(let age=0;age<poses.motion.clips[move].count;age++){
    vm.advance(age);assert.equal(vm.error,null);
    if(vm.hitboxes.size){active.push(age);damage.push(...[...vm.hitboxes.values()].map(h=>h.damage));}
    if(vm.interruptible&&interrupt<0)interrupt=age;
    for(const h of vm.hitboxes.values())assert.ok(Object.values(poses.point(move,age,h.bone,h.offset,1,0,0)).every(Number.isFinite));
   }
   assert.deepEqual([active[0],active.at(-1),Math.max(...damage),interrupt],expected[id][index],`${id} ${move}`);
  }
  if(id!=='link')for(const move of ['AttackS3Hi','AttackS3Lw']){const vm=new ScriptVM(assets[id].data.moves[move].commands);vm.advance(4);assert.equal(vm.error,null);assert.equal(vm.hitboxes.get(0)!.damage,id==='pikachu'?(move==='AttackS3Hi'?10:8):8);}
 }
});

test('ground attacks transfer source travel once, mirror it, freeze during hits and lock until the source interrupt',()=>{
 for(const id of ids)for(const side of [-1,1])for(const move of DIRECTIONAL_ATTACKS.filter(m=>assets[id].data.moves[m])){
  const s=make(id);s.player.x=0;s.player.facing=side;s.dummy.x=-75;
  if(move==='AttackDash')step(s,1,{axis:side,run:true});
  const start=s.player.x;
  const direction=move==='AttackHi3'?{vertical:1}:move==='AttackLw3'?{vertical:-1}:{axis:side,run:move==='AttackDash',vertical:move==='AttackS3Hi'?1:move==='AttackS3Lw'?-1:0};
  step(s,1,{...direction,attack:true});assert.equal(s.player.clip,move);
  const root=assets[id].poses.motion.clips[move].rootMotion!;
  let ended=false;
  for(let n=0;n<65;n++){
   assert.ok(Math.abs(s.player.x-start-side*(root[s.player.age][2]-root[0][2]))<1e-8,`${id} ${move} root`);
   const before=s.snapshot();s.player.hitlag=2;step(s,2,{axis:-side,jump:true,attack:true});assert.equal(s.player.x,before.player.x);assert.equal(s.player.age,before.player.age);
   const interrupt=s.script!.interruptible;
   step(s,1,{axis:-side,jump:n%2===0,attack:false});
   if(interrupt){ended=true;assert.equal(s.script,null);break;}
   assert.equal(s.player.clip,move);assert.equal(s.player.facing,side);
  }
  assert.equal(ended,true,`${id} ${move} never released`);
 }
});

test('dash attacks fall at either platform edge and clear active collisions; airborne J remains neutral aerial',()=>{
 for(const id of ids)for(const side of [-1,1]){
  const s=make(id);s.player.x=side*(STAGE.right-2);s.dummy.x=0;
  step(s,1,{axis:side,run:true});step(s,1,{axis:side,run:true,attack:true});
  for(let n=0;n<60&&s.player.grounded;n++)step(s);
  assert.equal(s.player.state,'air');assert.equal(s.script,null);assert.equal(s.actors[0].attackSweep,null);
  step(s,1,{attack:true});assert.equal(s.player.clip,'AttackAirN');
 }
});

test('Kirby dash shared calls produce five separate pulses and a finisher, with actual repeated contact',()=>{
 const vm=new ScriptVM(assets.kirby.data.moves.AttackDash.commands),phases:number[]=[];
 for(let age=0;age<50;age++){
  vm.advance(age);assert.equal(vm.error,null);
  if(vm.hitboxes.size)phases.push(age);
  if([11,14,18,23,29].includes(age))assert.equal(vm.hitboxes.get(0)!.damage,2);
  if(age===34)assert.equal(vm.hitboxes.get(0)!.damage,4);
 }
 assert.deepEqual(phases,[11,14,18,23,29,34,35,36]);
 const s=make('kirby');step(s,1,{axis:1,run:true});step(s,1,{axis:1,run:true,attack:true});
 const hits:number[]=[];for(let n=0;n<100;n++){step(s);if(s.lastHit?.frame===s.frame)hits.push(s.player.age);}
 assert.deepEqual(hits,[11,14,18,23]);assert.equal(s.dummy.damage,8);
 // A separated target catches the final hit, independently of the early pulses.
 const finish=make('kirby');finish.dummy.x=-75;step(finish,1,{axis:1,run:true});step(finish,1,{axis:1,run:true,attack:true});step(finish,33);
 finish.dummy.x=finish.player.x+12;step(finish);assert.equal(finish.lastHit?.damage,4);assert.equal(finish.player.age,34);
});

test('Kirby up tilt disables only his two feet, then restores them on reset and interruption',()=>{
 const s=make('kirby');s.dummy.x=-75;step(s,1,{vertical:1,attack:true});step(s,3);
 const k=s.actors[0];assert.deepEqual([...s.script!.boneStates],[[455,2],[457,2]]);
 assert.equal(k.hurtboxEnabled(455),false);assert.equal(k.hurtboxEnabled(55),false);assert.equal(k.hurtboxEnabled(409),true);
 // Probe a real animated foot capsule through the combat contact path.
 const foot=k.data.hurtboxes.find(h=>h.bone===455)!;
 const point=k.poses.point(k.f.clip,k.f.poseFrame,foot.bone,foot.offset,k.f.facing,k.f.x,k.f.y);
 const attacker=s.actors[1];attacker.script=new ScriptVM([]);
 attacker.script.hitboxes.set(0,{id:0,bone:0,damage:1,angle:0,growth:0,fixed:0,base:0,radius:.001,offset:[0,0,0],hitlag:1});
 const originalPoint=attacker.poses.point;attacker.poses.point=()=>point;
 const originalHurtboxes=k.data.hurtboxes;k.data.hurtboxes=[foot];
 try{assert.equal((s as any).contact(1),null);s.script!.boneStates.clear();assert.equal((s as any).contact(1)?.hitbox.damage,1);}
 finally{attacker.poses.point=originalPoint;k.data.hurtboxes=originalHurtboxes;}
 s.script!.boneStates.set(455,2);step(s,7);assert.equal(k.hurtboxEnabled(455),true);assert.equal(s.script!.boneStates.size,0);
 s.script!.boneStates.set(455,2);k.clearAttack();assert.equal(k.hurtboxEnabled(455),true);
});

test('tilts and dash attacks can be shielded and lower hitbox IDs win overlapping contact',()=>{
 for(const id of ids)for(const dash of [false,true]){
  const s=make(id,true);step(s,180);s.player.x=-12;s.dummy.x=5;
  if(dash)step(s,1,{axis:1,run:true},{shield:true});
  step(s,1,{axis:1,run:dash,attack:true},{shield:true});
  for(let n=0;n<50&&!s.lastHit;n++)step(s,1,{}, {shield:true});
  assert.equal(s.lastHit?.blocked,true,`${id} ${dash}`);assert.equal(s.dummy.damage,0);assert.ok(s.dummy.shield<60);
 }
 const s=make('link');step(s,1,{axis:1,run:true});step(s,1,{axis:1,run:true,attack:true});s.dummy.x=-75;step(s,7);
 assert.deepEqual([...s.script!.hitboxes.keys()],[3,0,1,2]);
 const point=s.actors[1].poses.point('Wait1',0,s.actors[1].data.hurtboxes[0].bone,s.actors[1].data.hurtboxes[0].offset,-1,s.dummy.x,0);
 const old=s.poses.point;s.poses.point=()=>point;s.actors[0].attackSweep=null;
 try{assert.equal((s as any).contact(0)?.hitbox.id,0);}finally{s.poses.point=old;}
});

test('the CPU selects ground attacks and avoids a dash path past the edge',()=>{
 for(const id of ids){
  const s=make(id),a=s.actors[0],b=s.actors[1];s.player.x=0;s.dummy.x=10;
  assert.equal(groundAttack(cpuInput(a,b,15),false,a.data.moves),'AttackLw3');
  assert.equal(groundAttack(cpuInput(a,b,30),false,a.data.moves),'AttackS3S');
  s.dummy.y=12;assert.equal(groundAttack(cpuInput(a,b,30),false,a.data.moves),'AttackHi3');
  s.dummy.y=0;s.dummy.x=28;s.player.state='run';assert.equal(cpuInput(a,b,30).attack,true);
  s.player.x=65;s.dummy.x=85;assert.notEqual(groundAttack(cpuInput(a,b,30),true,a.data.moves),'AttackDash');
 }
});
