import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation} from '../src/simulation';import {Poses} from '../src/pose';import {ScriptVM} from '../src/script';import {neutralInput,type Input,type FighterData} from '../src/types';
import {ThunderJolt,JOLT_RULES} from '../src/thunder-jolt';import {STAGE_PLANES} from '../src/stage-contact';import {STAGE} from '../src/stage';import {cpuInput} from '../src/cpu';
const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),pika=load('pikachu'),mario=load('mario'),data=pika.data.ranged!.jolt!;
const make=(local=false)=>{const s=new Simulation(pika.data,pika.poses,{mode:local?'battle':'training',opponent:'local',fighters:['pikachu','mario']},mario);if(local)step(s,180);s.player.x=-50;s.dummy.x=5;return s;};
function step(s:Simulation,n=1,input:Partial<Input>={},other:Partial<Input>={}){for(let i=0;i<n;i++){s.step({...neutralInput(),...input},{...neutralInput(),...other});assert.equal(s.error,null);}}

test('the original article availability guard fires at age eighteen only when the article is available',()=>{
 for(const name of ['SpecialN','SpecialAirN'])for(const available of [false,true]){
  assert.equal(pika.poses.motion.clips[name].count,59);let queries=0;
  const vm=new ScriptVM(pika.data.moves[name].commands,{articleAvailable:id=>{assert.equal(id,0);queries++;return available;}});
  vm.advance(17);assert.equal(queries,0);vm.advance(18);assert.equal(vm.error,null);assert.equal(queries,1);assert.deepEqual(vm.generatedArticles,available?[0]:[]);vm.advance(100);assert.equal(queries,1);
 }
 const vm=new ScriptVM(pika.data.moves.SpecialN.commands);vm.advance(18);assert.match(vm.error!,/Unsupported article availability/);
});

test('Pikachu fires one shot per press and the source ground spark lands for six percent',()=>{
 const s=make();step(s,18,{neutral:true});assert.equal(s.projectiles.length,0);step(s,1,{neutral:true});assert.ok(s.projectiles[0] instanceof ThunderJolt);assert.equal(s.projectiles[0].age,0);
 step(s,60,{neutral:true});assert.equal(s.hits,1);assert.equal(s.dummy.damage,6);assert.equal(s.lastHit?.move,'ThunderJolt');assert.equal(s.player.state,'idle');assert.equal(s.player.hitlag,0);
 step(s);step(s,19,{neutral:true});assert.ok(s.projectiles.length>0);
});

test('an airborne ball deals nine percent and its ground phase selects the source ground or air target hitbox',()=>{
 for(const [phase,air,damage,id] of [['air',false,9,0],['ground',false,6,0],['ground',true,5,1]] as const){
  const s=make(),j=new ThunderJolt(0,0,0,8,1,data);
  if(phase==='ground'){while(j.phase==='air')j.step();for(let n=0;n<4;n++)j.step();}
  Object.assign(s.dummy,{x:j.x+2,y:air?5:0,vy:0,grounded:!air,state:air?'air':'idle',clip:air?'Fall':'Wait1'});s.projectiles.push(j);step(s);
  assert.equal(s.lastHit?.damage,damage);assert.equal(s.lastHit?.hitbox,id);assert.equal(s.projectiles.length,0);assert.equal(s.player.hitlag,0);
 }
});

test('both facing directions carry the spark around the original walls and underside until its lifetime ends',()=>{
 for(const facing of [-1,1]){
  const j=new ThunderJolt(0,0,0,6,facing,data),visited=new Set<string>();
  for(let n=0;n<JOLT_RULES.life;n++){
   j.step();assert.ok(Number.isFinite(j.x)&&Number.isFinite(j.y));
   if(j.surface){const plane=STAGE_PLANES[j.surface.plane];visited.add(plane.type);const outside=(j.x-plane.a.x)*plane.normal.x+(j.y-plane.a.y)*plane.normal.y;assert.ok(outside>=-1e-6,'the spark must remain outside its supporting boundary');}
   if(n<JOLT_RULES.life-1)assert.equal(j.spent,false);
  }
  assert.deepEqual([...visited],['Floor',facing<0?'LeftWall':'RightWall','Ceiling']);assert.equal(j.spent,true);
 }
});

test('landing continues the throw clock without a duplicate shot and leaves Quick Attack available',()=>{
 const s=make();Object.assign(s.player,{y:16,grounded:false,vy:0,state:'air',clip:'Fall'});step(s,1,{neutral:true});assert.equal(s.player.clip,'SpecialAirN');
 const ids=new Set<number>();let landed=false;
 for(let n=0;n<65;n++){step(s);for(const p of s.projectiles)ids.add(p.id);if(s.player.state==='ranged'&&s.player.grounded)landed=true;}
 assert.equal(landed,true);assert.equal(ids.size,1);step(s,1,{special:true});assert.equal(s.player.clip,'SpecialHiStart');
});

test('shields stop a jolt; owner interruption preserves it and an owner KO removes it',()=>{
 const s=make(true);step(s,19,{neutral:true},{shield:true});for(let n=0;n<70&&!s.lastHit;n++)step(s,1,{}, {shield:true});assert.equal(s.lastHit?.blocked,true);assert.equal(s.dummy.damage,0);assert.equal(s.player.hitlag,0);assert.equal(s.projectiles.length,0);
 const interrupted=make(true);interrupted.dummy.x=70;step(interrupted,19,{neutral:true});const j=interrupted.projectiles[0];assert.ok(j);
 interrupted.dummy.x=interrupted.player.x-9;interrupted.dummy.facing=1;step(interrupted,9,{}, {attack:true,down:true,vertical:-1});assert.ok(interrupted.player.hitstun>0);assert.equal(interrupted.actors[0].ranged,null);assert.ok(interrupted.projectiles.includes(j));
 const x=j.x;step(interrupted);assert.notEqual(j.x,x);interrupted.player.x=STAGE.blastX+10;step(interrupted);assert.equal(interrupted.projectiles.length,0);
});

test('a second player and a CPU both use Thunder Jolt through their normal inputs',()=>{
 const s=new Simulation(mario.data,mario.poses,{mode:'battle',opponent:'local',fighters:['mario','pikachu']},pika);step(s,180);step(s,19,{}, {neutral:true});assert.equal(s.projectiles[0].owner,1);assert.equal(s.projectiles[0].kind,'jolt');assert.equal(s.player.state,'idle');
 const cpu=make();for(let frame=360;frame<490;frame++){cpu.step(cpuInput(cpu.actors[0],cpu.actors[1],frame));assert.equal(cpu.error,null);}assert.ok(cpu.hits>0);assert.equal(cpu.lastHit?.move,'ThunderJolt');
});
