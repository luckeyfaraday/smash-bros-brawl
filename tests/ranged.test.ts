import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';import {Poses} from '../src/pose';import {ScriptVM} from '../src/script';
import {neutralInput,type Input} from '../src/types';import {RangedProjectile,RANGED_RULES} from '../src/ranged';import {STAGE_PLANES} from '../src/stage-contact';import {cpuInput} from '../src/cpu';
const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),mario=load('mario'),link=load('link');
function make(id:'mario'|'link',local=false){const pack=id==='mario'?mario:link,s=new Simulation(pack.data,pack.poses,{mode:local?'battle':'training',opponent:'local',fighters:[id,'mario']},mario);if(local)step(s,180);s.player.x=-45;s.dummy.x=5;return s;}
function step(s:Simulation,n=1,input:Partial<Input>={},other:Partial<Input>={}){for(let i=0;i<n;i++){s.step({...neutralInput(),...input},{...neutralInput(),...other});assert.equal(s.error,null);}}

test('fireball source phases and bow visibility events decode without replacing the original scripts',()=>{
 assert.equal(mario.poses.motion.clips.SpecialN.count,49);assert.equal(link.poses.motion.clips.SpecialNStart.count,60);assert.equal(link.poses.motion.clips.SpecialNLoop.count,21);assert.equal(link.poses.motion.clips.SpecialNEnd.count,30);
 const vm=new ScriptVM(mario.data.ranged.commands);
 for(const [age,radius,growth,base] of [[0,2.4,25,30],[5,2.2,20,22],[30,2,15,11]]){vm.advance(age);const h=vm.hitboxes.get(0)!;assert.equal(vm.error,null);assert.equal(h.damage,5);assert.equal(h.radius,radius);assert.equal(h.growth,growth);assert.equal(h.base,base);}
 const s=make('link');step(s,4,{neutral:true});assert.equal(s.actors[0].ranged?.bow,true);assert.equal(s.actors[0].ranged?.arrow,false);
 step(s,2,{neutral:true});assert.equal(s.actors[0].ranged?.arrow,true);assert.equal(s.actors[0].ranged?.swordBack,true);assert.equal(s.actors[0].ranged?.shieldBack,true);assert.equal(s.projectiles.length,0);
});

test('Mario creates one fireball at source age thirteen, and it hits independently after he turns',()=>{
 const s=make('mario');s.player.x=-70;step(s,1,{neutral:true});step(s,12);assert.equal(s.projectiles.length,0);step(s);
 assert.equal(s.projectiles.length,1);assert.equal(s.projectiles[0].age,0);assert.equal(s.player.age,13);
 step(s,31);assert.equal(s.actors[0].ranged,null);step(s,1,{axis:-1});assert.equal(s.player.facing,-1);assert.equal(s.projectiles[0].facing,1);
 for(let n=0;n<75&&!s.lastHit;n++)step(s);assert.equal(s.lastHit?.move,'Fireball');assert.equal(s.lastHit?.damage,5);assert.equal(s.player.hitlag,0);assert.ok(s.dummy.hitlag>0);
 step(s,80,{neutral:true});assert.equal(s.hits,1,'turning away makes the next fireball miss the original target');
});

test('Link waits for his draw window, holds a full bow indefinitely, and fires one arrow when released',()=>{
 const quick=make('link');step(quick,1,{neutral:true});step(quick,17);assert.equal(quick.projectiles.length,0);step(quick);assert.equal(quick.player.clip,'SpecialNEnd');assert.ok(quick.projectiles[0] instanceof RangedProjectile);assert.equal(quick.projectiles[0].charge,0);assert.equal(quick.projectiles[0].vx,3);assert.equal(quick.projectiles[0].script.hitboxes.get(0)?.damage,5);
 const full=make('link');step(full,220,{neutral:true,axis:1,jump:false});assert.equal(full.projectiles.length,0);assert.equal(full.actors[0].ranged?.phase,'hold');assert.equal(full.actors[0].ranged?.charge,43);
 step(full);assert.equal(full.projectiles.length,1);assert.equal(full.projectiles[0].vx,10);assert.equal(full.projectiles[0].script.hitboxes.get(0)?.damage,12);
 step(full,31);assert.equal(full.actors[0].ranged,null);assert.equal(full.hits,1);assert.equal(full.dummy.damage,12);
});

test('a landing switches neutral variants while preserving the firing clock and a single projectile',()=>{
 for(const id of ['mario','link'] as const){
  const s=make(id);Object.assign(s.player,{y:16,vy:0,grounded:false,state:'air',clip:'Fall'});step(s,1,{neutral:true});assert.ok(s.player.clip.startsWith('SpecialAirN'));
  const ids=new Set<number>();let ground=false,lastAge=s.player.age;
  for(let n=0;n<75;n++){step(s);if(s.player.state==='ranged'&&s.player.grounded)ground=true;if(s.player.state==='ranged'&&s.player.clip.endsWith('Start'))assert.ok(s.player.age>=lastAge);lastAge=s.player.age;for(const p of s.projectiles)ids.add(p.id);}
  assert.equal(ground,true);assert.equal(ids.size,1);assert.equal(s.hits,1);assert.equal(s.actors[0].ranged,null);
 }
});

test('the neutral aerial throw leaves recovery available after its animation ends',()=>{
 const s=make('mario');Object.assign(s.player,{x:0,y:100,vy:0,grounded:false,jumps:1,state:'air',clip:'Fall'});
 step(s,1,{neutral:true});step(s,20,{special:true,jump:true,neutral:true});assert.equal(s.player.clip,'SpecialAirN');assert.equal(s.player.jumps,1);
 step(s,24);assert.equal(s.player.state,'air');step(s,1,{special:true});assert.equal(s.player.clip,'SpecialAirHi');
});

test('fireballs bounce, arrows stop at the original stage, and both projectile types expire',()=>{
 const fire=new RangedProjectile(0,0,'fireball',0,5,1,0,mario.data.ranged.commands);let bounce=false;
 for(let i=0;i<74;i++){fire.step();bounce ||= fire.bounces>0;assert.ok(fire.y>=1.999,'the fireball must remain above the original floor');}assert.equal(bounce,true);assert.equal(fire.spent,false);fire.step();assert.equal(fire.spent,true);
 const arrow=new RangedProjectile(1,0,'arrow',0,4,1,0,link.data.ranged.commands);
 for(let i=0;i<80&&!arrow.stuck;i++)arrow.step();assert.ok(arrow.stuck);const position={x:arrow.x,y:arrow.y};arrow.step();assert.equal(arrow.script.hitboxes.size,0);for(let i=0;i<20;i++)arrow.step();assert.deepEqual({x:arrow.x,y:arrow.y},position);assert.equal(arrow.spent,true);
 const wall=STAGE_PLANES.find(p=>!['Floor','Ceiling'].includes(p.type))!;
 const start={x:(wall.a.x+wall.b.x)/2+wall.normal.x*20,y:(wall.a.y+wall.b.y)/2+wall.normal.y*20};
 const shot=new RangedProjectile(2,0,'arrow',start.x,start.y,1,43,link.data.ranged.commands);shot.vx=-wall.normal.x*60;shot.vy=-wall.normal.y*60;shot.step();assert.ok(shot.stuck);assert.ok((shot.x-(wall.a.x+wall.b.x)/2)*wall.normal.x+(shot.y-(wall.a.y+wall.b.y)/2)*wall.normal.y>0);
});

test('a shield absorbs either ranged attack without giving its owner hitlag',()=>{
 for(const id of ['mario','link'] as const){
  const s=make(id,true);step(s,id==='mario'?14:65,{neutral:true},{shield:true});
  for(let n=0;n<100&&!s.lastHit;n++)step(s,1,{}, {shield:true});
  assert.equal(s.lastHit?.blocked,true);assert.equal(s.dummy.damage,0);assert.equal(s.player.hitlag,0);assert.equal(s.projectiles.length,0);assert.ok(s.dummy.shield<50);
 }
});

test('interrupting a drawn bow restores equipment, while an already thrown fireball survives its owner being hit',()=>{
 const bow=make('link',true);bow.player.x=-4;bow.dummy.x=6;step(bow,20,{neutral:true});step(bow,2,{neutral:true},{attack:true});assert.ok(bow.player.hitstun>0);assert.equal(bow.actors[0].ranged,null);assert.equal(bow.projectiles.length,0);
 const s=make('mario',true);s.dummy.x=STAGE.right-10;step(s,14,{neutral:true});const shot=s.projectiles[0],x=shot.x;step(s,31);
 s.dummy.x=s.player.x+11;step(s,2,{}, {attack:true});assert.ok(s.player.hitstun>0);assert.ok(s.projectiles.includes(shot));assert.ok(shot.x>x);
 const before=shot.x;step(s);assert.ok(shot.x>before,'a projectile continues while its owner is frozen');
 s.player.x=STAGE.blastX+1;step(s);assert.equal(s.projectiles.length,0);
});

test('simultaneous player fireballs can trade and each consumes its own projectile',()=>{
 const s=make('mario',true);s.player.x=-15;s.dummy.x=15;step(s,1,{neutral:true},{neutral:true});
 for(let i=0;i<80;i++)step(s);assert.equal(s.player.damage,5);assert.equal(s.dummy.damage,5);assert.equal(s.hits,2);assert.equal(s.projectiles.length,0);
});

test('CPU can choose both ranged attacks and release a drawn arrow without an infinite hold',()=>{
 for(const id of ['mario','link'] as const){
  const s=make(id),clips=new Set<string>();
  for(let frame=360;frame<490;frame++){s.step(cpuInput(s.actors[0],s.actors[1],frame));clips.add(s.player.clip);assert.equal(s.error,null);}
  assert.ok(clips.has(id==='mario'?'SpecialN':'SpecialNEnd'));assert.ok(s.hits>0);
 }
});
