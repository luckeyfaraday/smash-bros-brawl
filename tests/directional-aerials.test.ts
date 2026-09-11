import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation} from '../src/simulation';import {Poses} from '../src/pose';import {ScriptVM,LANDING_LAG_FLAG} from '../src/script';
import {aerialAttack,aerialLandingLag,AERIALS} from '../src/moves';import {cpuInput} from '../src/cpu';import {neutralInput,type Input} from '../src/types';import type {FighterId} from '../src/roster';
import routes from './fixtures/aerial-hit-routes.json' with {type:'json'};
const ids:FighterId[]=['mario','link','kirby','pikachu'];
const assets=Object.fromEntries(ids.map(id=>[id,{data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}]));
const make=(id:FighterId,battle=false)=>new Simulation(assets[id].data,assets[id].poses,{fighters:[id,'mario'],mode:battle?'battle':'training',opponent:'local'},assets.mario);
function step(s:Simulation,n=1,i:Partial<Input>={},o:Partial<Input>={}){for(let j=0;j<n;j++){s.step({...neutralInput(),...i},{...neutralInput(),...o});assert.equal(s.error,null);}}
function air(s:Simulation,side=1){Object.assign(s.player,{x:0,y:120,grounded:false,vy:0,state:'air',clip:'Fall',facing:side,jumps:1});s.dummy.x=-75;}
const direction=(suffix:string,facing=1):Partial<Input>=>suffix==='N'?{}:suffix==='F'?{axis:facing}:suffix==='B'?{axis:-facing}:{vertical:suffix==='Hi'?1:-1};

test('all aerial directions work in either facing without turning or restarting during drift',()=>{
 for(const id of ids)for(const facing of [-1,1])for(const move of AERIALS){
  const s=make(id);air(s,facing);const d=direction(move.slice(9),facing);
  assert.equal(aerialAttack({...neutralInput(),...d},facing),move);
  step(s,1,{...d,attack:true});assert.equal(s.player.clip,move);assert.equal(s.player.facing,facing);
  step(s,2,{axis:-facing,jump:true,attack:true,vertical:-1});assert.equal(s.player.clip,move);assert.equal(s.player.age,2);assert.equal(s.player.facing,facing);assert.equal(s.player.jumps,1);
  assert.equal(s.player.state,'aerial');
 }
 assert.equal(aerialAttack({...neutralInput(),axis:1,vertical:1},1),'AttackAirHi');
 assert.equal(aerialAttack({...neutralInput(),axis:.2,vertical:.2},-1),'AttackAirN');
});

test('original repeated aerial pulses and finishers use the shared script clock',()=>{
 for(const [id,move,starts] of [
  ['mario','AttackAirLw',[4,6,8,10,12,24]],['link','AttackAirF',[13,25]],['link','AttackAirB',[5,17]],
  ['kirby','AttackAirF',[9,16,24]],['kirby','AttackAirLw',[17,20,23,26,29,32]],
  ['pikachu','AttackAirF',[9,13,17,21,25]],['pikachu','AttackAirB',[3,7,11,15,19,23,27,31]],
 ] as const){
  const vm=new ScriptVM(assets[id].data.moves[move].commands),actual:number[]=[];let active=false;
  for(let age=0;age<assets[id].poses.motion.clips[move].count;age++){
   vm.advance(age);assert.equal(vm.error,null);if(vm.hitboxes.size&&!active)actual.push(age);active=vm.hitboxes.size>0;
  }
  assert.deepEqual(actual,starts,`${id} ${move}`);
 }
 const vm=new ScriptVM(assets.link.data.moves.AttackAirHi.commands);vm.advance(10);const initial=[...vm.hitboxes.values()];vm.advance(13);
 assert.deepEqual([...vm.hitboxes.values()],initial.map(h=>({...h,damage:13})));assert.equal(vm.hitboxEpoch,0);assert.equal(vm.error,null);
});

test('all sixteen directional aerials connect through complete keyboard routes and replay deterministically',()=>{
 assert.equal(routes.length,16);
 for(const route of routes){
  const id=route.id as FighterId,a=assets[id],s=new Simulation(a.data,a.poses,(route as any).options??{fighters:[id,'mario']},assets.mario),copy=new Simulation(a.data,a.poses,s.options,assets.mario);
  for(const part of route.steps){
   const keys=part.keys,i={...neutralInput(),axis:Number(keys.includes('KeyD'))-Number(keys.includes('KeyA')),vertical:Number(keys.includes('KeyW'))-Number(keys.includes('KeyS')),down:keys.includes('KeyS'),attack:keys.includes('KeyJ'),jump:keys.includes('Space')};
   const o={...neutralInput(),axis:keys.includes('ArrowLeft')?-1:0,jump:keys.includes('Enter')};
   for(let n=0;n<part.frames;n++){s.step(i,o);copy.step(i,o);assert.equal(s.error,null);assert.equal(s.hash(),copy.hash());}
  }
  assert.equal(s.lastHit?.move,'AttackAir'+route.suffix);assert.equal(s.dummy.damage,route.damage);assert.equal(s.frame,route.frame);
  const expected:Record<string,number[]>= {'marioLw':[1,1,1,1,1,7],'linkB':[4,7],'kirbyF':[4,3,5],'kirbyLw':[2,2,2,2,2,2,2],'pikachuF':[2,2,2],'pikachuB':[1,1,1,1,1,1,1,4]};
  if(expected[id+route.suffix]){
   const hits:number[]=[];for(let n=0;n<160;n++){if(s.lastHit?.frame===s.frame)hits.push(s.lastHit.damage);step(s);}
   assert.deepEqual(hits,expected[id+route.suffix],`${id} ${route.suffix} repeated contacts`);
  }
 }
});

test('each directional aerial lands with its own source lag and original landing pose, then restores control',()=>{
 for(const id of ids)for(const suffix of ['F','B','Hi','Lw']){
  const s=make(id);air(s);step(s,1,{...direction(suffix),attack:true});
  while(!s.script!.variables.has(LANDING_LAG_FLAG))step(s);
  s.player.y=.001;s.player.vy=-1;step(s);
  assert.equal(s.player.clip,'LandingAir'+suffix);assert.equal(s.player.age,0);assert.equal(s.player.poseFrame,0);
  const duration=aerialLandingLag(s.data,s.player.clip);assert.equal(s.landingDuration(s.player),duration);
  step(s,duration-1,{jump:true,attack:true});assert.equal(s.player.state,'landing');
  assert.equal(s.player.poseFrame,s.poses.motion.clips[s.player.clip].count-1);
  step(s);assert.equal(s.player.state,'idle');assert.equal(s.script,null);
  step(s,1,{jump:true});assert.equal(s.player.state,'jumpSquat');
 }
});

test('auto-cancel windows use normal landing recovery and do not create landing hitboxes',()=>{
 for(const id of ids)for(const suffix of ['F','B','Hi','Lw']){
  const s=make(id);air(s);const vm=new ScriptVM(s.data.moves['AttackAir'+suffix].commands);let first=-1;
  for(let age=0;age<s.poses.motion.clips['AttackAir'+suffix].count;age++){vm.advance(age);if(!vm.variables.has(LANDING_LAG_FLAG)){first=age;break;}}
  step(s,1,{...direction(suffix),attack:true});
  if(first>0){s.player.y=170;step(s,first-1);}s.player.y=.001;s.player.vy=-1;
  if(first===0){s.actors[0].clearAttack();s.player.state='air';s.actors[0].previous=neutralInput();step(s,1,{...direction(suffix),attack:true});}else step(s);
  assert.equal(s.player.state,'landing');assert.equal(s.player.clip,'Wait1');assert.equal(s.script,null);assert.equal(s.landingDuration(s.player),s.a['Normal Landing Lag']);
 }
});

test('down-air and Pikachu back-air landing hits start a separate collision group, hit once and can be shielded',()=>{
 for(const [id,suffix,damage] of [['mario','Lw',2],['kirby','Lw',2],['pikachu','Lw',4],['pikachu','B',4]] as const)for(const shield of [false,true]){
  const s=make(id,true);step(s,180);air(s);step(s,1,{...direction(suffix),attack:true});
  while(!s.script!.variables.has(LANDING_LAG_FLAG))step(s);
  s.player.y=.001;s.player.vy=-1;s.dummy.x=s.player.x+2;s.actors[0].hasHit=true;
  step(s,1,{}, {shield});assert.equal(s.player.clip,'LandingAir'+suffix);assert.equal(s.lastHit?.move,s.player.clip);assert.equal(s.lastHit?.blocked,shield);assert.equal(s.lastHit?.damage,shield?0:damage);
  assert.equal(s.dummy.damage,shield?0:damage);
  const before={x:s.player.x,age:s.player.age,pose:s.player.poseFrame},freeze=s.player.hitlag;
  step(s,freeze,{}, {shield});assert.equal(s.player.x,before.x);assert.equal(s.player.age,before.age);assert.equal(s.player.poseFrame,before.pose);
  step(s,4,{}, {shield});assert.equal(s.script!.hitboxes.size,0);assert.equal(s.dummy.damage,shield?0:damage);
 }
});

test('back aerial launches a target behind the fighter in the correct direction',()=>{
 for(const facing of [-1,1]){
  const s=make('mario');air(s,facing);s.dummy.x=-12*facing;s.dummy.y=113;s.dummy.grounded=false;
  step(s,1,{axis:-facing,attack:true});for(let n=0;n<14&&!s.lastHit;n++)step(s);
  assert.equal(s.lastHit?.move,'AttackAirB');assert.ok(s.dummy.vx*facing<0);assert.equal(s.player.facing,facing);
 }
});

test('CPU aerial input uses relative target height and can choose a backward attack',()=>{
 const s=make('link');air(s);const a=s.actors[0],b=s.actors[1];s.dummy.x=-12;s.dummy.y=120;
 assert.equal(aerialAttack(cpuInput(a,b,60),1),'AttackAirB');s.dummy.y=134;assert.equal(aerialAttack(cpuInput(a,b,60),1),'AttackAirHi');
 s.dummy.y=110;assert.equal(aerialAttack(cpuInput(a,b,60),1),'AttackAirLw');
});
