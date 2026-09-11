import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';import {Poses} from '../src/pose';import {ScriptVM} from '../src/script';import {neutralInput,type Input} from '../src/types';
const ids=['mario','link','kirby','pikachu'] as const;
const assets=Object.fromEntries(ids.map(id=>[id,{data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}]));
function make(id='mario',battle=false){const a=assets[id],s=new Simulation(a.data,a.poses,{mode:battle?'battle':'training',opponent:'local'},assets.mario);if(battle)step(s,180);return s;}
function step(s:Simulation,n=1,input:Partial<Input>={},second:Partial<Input>={}){for(let i=0;i<n;i++){s.step({...neutralInput(),...input},{...neutralInput(),...second});assert.equal(s.error,null);}}
function hang(id:string,side:number,damage=0){const s=make(id);Object.assign(s.player,{x:side*(STAGE.right+3),y:-5,vy:-.2,grounded:false,state:'air',clip:'Fall',jumps:2,damage});step(s,1);step(s,assets[id].poses.motion.clips.CliffCatch.count);assert.equal(s.player.state,'ledgeHang');return s;}

test('all 32 defense scripts execute, preserving original protection and hit windows',()=>{
 const quick=[20,25,18,20],slow=[44,54,47,59],rollQuick=[30,25,32,24],rollSlow=[54,63,50,60];
 for(const [i,id] of ids.entries())for(const name of ['EscapeN','EscapeF','EscapeB','EscapeAir','CliffAttackQuick','CliffAttackSlow','CliffEscapeQuick','CliffEscapeSlow']){
  assert.ok(assets[id].poses.motion.clips[name]);const vm=new ScriptVM(assets[id].data.moves[name].commands);
  const start=name==='EscapeN'?1:name.startsWith('Escape')?3:0;
  const end=name==='EscapeN'?20:name==='EscapeAir'?29:name==='CliffAttackQuick'?quick[i]:name==='CliffAttackSlow'?slow[i]:name==='CliffEscapeQuick'?rollQuick[i]:name==='CliffEscapeSlow'?rollSlow[i]:id==='kirby'?20:19;
  for(let frame=0;frame<90;frame++){vm.advance(frame);assert.equal(vm.error,null,`${id} ${name}`);assert.equal(vm.hurtState,frame>=start&&frame<end?2:0,`${id} ${name} ${frame}`);}
  assert.equal(vm.hitboxes.size,0);if(name==='EscapeAir')assert.equal(vm.airGroundMode,0);
 }
 const vm=new ScriptVM([{id:'0E00',name:'unknown',offset:0,params:[{type:0,raw:17,value:17}]}]);vm.advance(0);assert.match(vm.error!,/Unsupported air\/ground/);
});

test('forward and backward rolls transfer original travel once, turn only at completion and can immediately attack',()=>{
 for(const id of ids)for(const facing of [-1,1])for(const forward of [false,true]){
  const s=make(id),end={mario:32,link:37,kirby:31,pikachu:32}[id];s.player.x=0;s.player.facing=facing;s.dummy.x=90;
  step(s,1,{shield:true,axis:facing*(forward?1:-1)});const clip=s.player.clip;assert.equal(clip,forward?'EscapeF':'EscapeB');
  step(s,end-1);assert.equal(s.player.state,'evade');assert.equal(s.player.facing,facing);
  const root=assets[id].poses.motion.clips[clip].rootMotion!;assert.ok(Math.abs(s.player.x-root[end-1][2]*facing)<1e-5,`${id} ${clip}: ${s.player.x}`);
  step(s,1,{attack:true});assert.equal(s.player.state,'jab');assert.equal(s.player.facing,forward?-facing:facing);assert.equal(s.actors[0].evade,null);
 }
});

test('rolls cross opponents in either player slot and stop at both stage edges',()=>{
 for(const id of ids)for(const slot of [0,1]){
  const s=make(id,true);s.player.x=-8;s.dummy.x=8;const f=s.actors[slot].f,other=s.actors[1-slot].f,start=other.x;
  step(s,20,slot===0?{shield:true,axis:1}:{},slot===1?{shield:true,axis:-1}:{});assert.ok(slot===0?f.x>start:f.x<start);assert.equal(other.x,start);
 }
 for(const id of ids)for(const side of [-1,1]){const s=make(id);s.player.x=side*(STAGE.right-1);s.player.facing=side;s.dummy.x=0;step(s,45,{shield:true,axis:side});assert.equal(s.player.x,side*STAGE.right);assert.equal(s.player.grounded,true);assert.equal(s.player.ledgeSide,0);}
});

test('spot dodge is stationary, ends at the source interrupt even beyond Link’s clip, and holding shield cannot repeat it',()=>{
 for(const id of ids){const s=make(id),end=id==='pikachu'?23:25,x=s.player.x;step(s,1,{shield:true,down:true,vertical:-1});step(s,end-1,{shield:true,down:true,vertical:-1});assert.equal(s.player.state,'evade');assert.equal(s.player.x,x);step(s,60,{shield:true,down:true,vertical:-1});assert.equal(s.player.state,'shield');assert.equal(s.actors[0].evade,null);step(s,1,{shield:true});step(s,1,{shield:true,down:true,vertical:-1});assert.equal(s.player.clip,'EscapeN');}
});

test('dodge protection rejects source melee contacts; startup and recovery remain vulnerable',()=>{
 for(const age of [0,1,19,20,24]){const s=make();s.player.x=0;step(s,age+1,{shield:true,down:true});const attack=s.actors[1];attack.f.x=0;attack.f.clip='Attack11';attack.f.poseFrame=2;attack.script=new ScriptVM(assets.mario.data.moves.Attack11.commands);attack.script.advance(2);
  // Keep a real source hit but enlarge only its reach to isolate protection
  // from Mario's ducking pose and body-to-body spacing.
  for(const h of attack.script.hitboxes.values())h.radius=100;
  const contact=(s as any).contact(1);assert.equal(!!contact,age===0||age>=20,`age ${age}`);
 }
});

test('air dodge keeps motion, restores ordinary drift, can be reused in air and never turns the air/ground event into a landing',()=>{
 for(const id of ids){const s=make(id);s.player.x=-65;s.dummy.x=90;Object.assign(s.player,{grounded:false,state:'air',clip:'Fall',y:120,vx:.7,vy:1,jumps:1});step(s,1,{shield:true,axis:1});assert.equal(s.player.clip,'EscapeAir');assert.ok(s.player.vx>0);assert.ok(s.player.y>120);step(s,29);assert.equal(s.player.grounded,false);assert.equal(s.script?.airGroundMode,0);assert.equal(s.script?.hurtState,0);step(s,21);assert.equal(s.player.state,'air');step(s,1,{shield:true});assert.equal(s.player.clip,'EscapeAir');}
 const s=make();Object.assign(s.player,{grounded:false,state:'air',clip:'Fall',y:2,vy:-1});step(s,1,{shield:true});for(let n=0;n<8&&s.player.state!=='landing';n++)step(s);assert.equal(s.player.state,'landing');assert.equal(s.script,null);assert.equal(s.landingDuration(s.player),10);step(s,9,{attack:true});assert.equal(s.player.state,'landing');step(s);assert.equal(s.player.state,'idle');assert.equal(s.actors[0].evadeLanding,null);
});

test('held shield after jumping does not trigger an air dodge; shield grabs and jump out of shield keep priority',()=>{
 const s=make();step(s,1,{shield:true});step(s,12,{shield:true,jump:true});assert.equal(s.player.state,'air');assert.equal(s.actors[0].evade,null);step(s);step(s,1,{shield:true});assert.equal(s.player.clip,'EscapeAir');
 const g=make();step(g,1,{shield:true,attack:true,axis:1});assert.equal(g.player.state,'grab');
});

test('all four quick/slow ledge attacks and rolls use original roots on both edges, then return to play',()=>{
 for(const id of ids)for(const side of [-1,1])for(const damage of [0,100])for(const attack of [false,true]){
  const s=hang(id,side,damage);s.dummy.x=0;step(s,1,attack?{attack:true}:{shield:true});const name=`${attack?'CliffAttack':'CliffEscape'}${damage>=100?'Slow':'Quick'}`,length=assets[id].poses.motion.clips[name].count;assert.equal(s.player.clip,name);assert.equal(s.player.invincible,0);assert.equal(s.script?.hurtState,2);
  step(s,length-1);assert.equal(s.player.x,side*STAGE.right);assert.ok(s.player.ledgeSide);step(s);assert.equal(s.player.state,'idle');assert.equal(s.player.grounded,true);assert.equal(s.player.ledgeSide,0);assert.equal(s.script,null);
  const x=side*STAGE.right+assets[id].poses.root(name,length-1,-side).x;assert.equal(s.player.x,x);step(s);assert.equal(s.player.x,x);
 }
});

test('ledge attacks connect their original hitboxes and interrupted recovery transfers the animated position only once',()=>{
 for(const id of ids)for(const damage of [0,100]){
  const s=hang(id,1,damage);step(s,1,{attack:true});const name=s.player.clip,vm=new ScriptVM(assets[id].data.moves[name].commands);let frame=0;while(!vm.hitboxes.size&&frame<80)vm.advance(++frame);assert.ok(vm.hitboxes.size);
  step(s,frame-1);const h=[...vm.hitboxes.values()][0],center=s.poses.point(name,frame,h.bone,h.offset,s.player.facing,s.player.x,s.player.y);s.dummy.x=center.x;s.dummy.y=center.y-6;s.dummy.grounded=false;step(s);assert.ok(s.dummy.damage>0,`${id} ${name}`);assert.ok([6,8,10].includes(s.dummy.damage));
 }
 const s=hang('mario',1);step(s,1,{shield:true});step(s,35);const before=s.player.x,root=s.poses.root(s.player.clip,s.player.poseFrame,s.player.facing);(s as any).hit({attacker:1,blocked:false,move:'Attack11',hitbox:{id:0,bone:0,damage:3,angle:45,growth:100,fixed:0,base:10,radius:3,offset:[0,0,0],hitlag:1}});assert.equal(s.player.x,before+root.x);assert.equal(s.player.ledgeSide,0);assert.equal(s.script,null);assert.equal(s.player.state,'hitstun');
});
