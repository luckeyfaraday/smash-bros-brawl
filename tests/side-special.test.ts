import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';import {Poses} from '../src/pose';import {ScriptVM} from '../src/script';import {neutralInput,type Input} from '../src/types';import {Boomerang,SIDE_RULES} from '../src/side-special';import {RangedProjectile} from '../src/ranged';import {ThunderJolt} from '../src/thunder-jolt';
const ids=['mario','link','kirby','pikachu'] as const;
const assets=Object.fromEntries(ids.map(id=>[id,{data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}]));
function make(id='mario',target='mario',battle=false){const a=assets[id],s=new Simulation(a.data,a.poses,{mode:battle?'battle':'training',opponent:'local',fighters:[id as any,target as any]},assets[target]);if(battle)step(s,180);s.player.x=-5;s.dummy.x=5;return s;}
function step(s:Simulation,n=1,input:Partial<Input>={},second:Partial<Input>={}){for(let i=0;i<n;i++){s.step({...neutralInput(),...input},{...neutralInput(),...second});assert.equal(s.error,null);}}

test('every enabled side-special script executes and has its original exported pose',()=>{
 for(const id of ids)for(const [name,move] of Object.entries(assets[id].data.moves) as [string,any][]){if(!/^Special(Air)?S/.test(name))continue;assert.ok(assets[id].poses.motion.clips[name],`${id} ${name}`);const vm=new ScriptVM(move.commands);for(let n=0;n<80;n++)vm.advance(n);assert.equal(vm.error,null,`${id} ${name}`);}
});
test('Cape activates reflection at source age 5 and ends at 30 grounded or 33 airborne; reversal is an 8/6% hit',()=>{
 for(const air of [false,true]){const vm=new ScriptVM(assets.mario.data.moves[air?'SpecialAirS':'SpecialS'].commands);vm.advance(4);assert.equal(vm.reflector,false);vm.advance(5);assert.equal(vm.reflector,true);vm.advance(11);assert.equal(vm.hitboxes.get(0)?.damage,air?6:8);assert.equal(vm.hitboxes.get(0)?.reverse,true);vm.advance(14);assert.equal(vm.hitboxes.size,0);vm.advance(air?32:29);assert.equal(vm.reflector,true);vm.advance(air?33:30);assert.equal(vm.reflector,false);}
 const s=make();const facing=s.dummy.facing;step(s,20,{side:true});assert.equal(s.dummy.damage,8);assert.equal(s.dummy.facing,-facing);assert.equal(s.dummy.grounded,true);assert.equal(s.dummy.hitstun,0);assert.equal(s.hits,1);
});
test('Cape reverses fireballs, arrows, air and surface Jolts and boomerangs with ownership and increased power',()=>{
 for(const kind of ['fireball','arrow','air-jolt','ground-jolt','boomerang']){
  const s=make();s.dummy.x=80;step(s,6,{side:true});let projectile:any;
  if(kind==='boomerang'){projectile=new Boomerang(0,1,7,7,-1,0,assets.link.data.side.boomerang);s.boomerangs.push(projectile);}
  else if(kind.includes('jolt')){projectile=new ThunderJolt(0,1,7,kind==='air-jolt'?8:3,-1,assets.pikachu.data.ranged.jolt);if(kind==='ground-jolt'){for(let n=0;n<4&&projectile.phase!=='ground';n++)projectile.step();assert.equal(projectile.phase,'ground');}s.projectiles.push(projectile);}
  else {projectile=new RangedProjectile(0,1,kind as any,7,7,-1,0,assets[kind==='arrow'?'link':'mario'].data.ranged.commands);s.projectiles.push(projectile);}
  step(s);assert.equal(projectile.owner,0,kind);assert.equal(projectile.reflections,1,kind);assert.equal(projectile.damageScale,1.5);assert.ok(projectile.vx>0,kind);step(s,2);assert.equal(projectile.reflections,1,'cannot reflect its new owner’s shot');
 }
});
test('an expired Cape does not reflect, and reflected damage survives the fireball’s later hit profile',()=>{
 const s=make();s.dummy.x=80;step(s,31,{side:true});const shot=new RangedProjectile(0,1,'fireball',7,7,-1,0,assets.mario.data.ranged.commands);s.projectiles.push(shot);step(s);assert.equal(shot.reflections,0);
 const p=new RangedProjectile(2,1,'fireball',0,35,-1,0,assets.mario.data.ranged.commands);p.reflect(0);for(let i=0;i<40;i++)p.step();assert.equal(p.damageScale,1.5);assert.equal(p.script.error,null);
});
test('Cape gives only one aerial lift before landing',()=>{
 const s=make();s.dummy.x=90;Object.assign(s.player,{y:90,grounded:false,state:'air',clip:'Fall',jumps:1});step(s,11,{side:true});assert.equal(s.actors[0].capeLiftUsed,true);assert.ok(s.player.vy>0);step(s,26);assert.equal(s.actors[0].side,null);step(s,11,{side:true});assert.ok(s.player.vy<0);assert.equal(s.actors[0].capeLiftUsed,true);
});
test('Gale Boomerang uses 7% then 5%, turns into non-damaging wind, and catches without generating duplicates',()=>{
 const b=new Boomerang(0,0,0,12,1,0,assets.link.data.side.boomerang);assert.equal(b.script.hitboxes.get(0)?.damage,7);for(let n=0;n<4;n++)b.step({x:0,y:12});assert.equal(b.script.hitboxes.get(0)?.damage,5);for(let n=4;n<28;n++)b.step({x:0,y:12});assert.equal(b.phase,'turn');assert.equal(b.script.hitboxes.size,0);assert.equal(b.script.wind?.radius,9);
 const s=make('link');s.dummy.x=100;step(s,47,{side:true});assert.equal(s.boomerangs.length,1);step(s);step(s,1,{side:true});assert.equal(s.boomerangs.length,1);let caught=false;for(let i=0;i<100;i++){step(s);caught||=s.player.clip==='SpecialS2';}assert.ok(caught);assert.equal(s.boomerangs.length,0);assert.equal(s.player.state,'idle');
});
test('boomerang hits once while travelling and wind pulls without damage or hitstun; shields stop the pull',()=>{
 const s=make('link');step(s,46,{side:true});assert.equal(s.hits,1);assert.equal(s.dummy.damage,7);assert.equal(s.boomerangs.length,1);
 for(const shield of [false,true]){const s=make('link','mario',shield);s.player.x=-40;s.dummy.x=20;const b=new Boomerang(1,0,-60,7,1,0,assets.link.data.side.boomerang);for(let n=0;n<33;n++)b.step({x:-80,y:7});b.x=25;b.y=7;s.boomerangs.push(b);const x=s.dummy.x;step(s,1,{}, {shield});assert.equal(s.dummy.damage,0);assert.equal(s.dummy.hitstun,0);assert.ok(shield?s.dummy.x===x:s.dummy.x<x);}
});
test('Hammer retains both separate airborne hit groups and landing does not turn them into the ground sweetspot',()=>{
 const vm=new ScriptVM(assets.kirby.data.moves.SpecialAirS.commands);vm.advance(16);assert.equal(vm.hitboxes.get(0)?.damage,17);vm.advance(18);assert.equal(vm.hitboxes.size,0);vm.advance(33);assert.equal(vm.hitboxes.get(0)?.damage,15);assert.equal(vm.hitboxes.get(0)?.angle,20);vm.advance(35);assert.equal(vm.hitboxes.size,0);
 const s=make('kirby');s.dummy.x=80;Object.assign(s.player,{y:1,vy:-1,grounded:false,state:'air',clip:'Fall'});step(s,24,{side:true});assert.equal(s.player.grounded,true);assert.equal(s.player.clip,'SpecialAirS');assert.equal(s.player.age,23);step(s,30);assert.equal(s.actors[0].side,null);
 const ground=make('kirby');step(ground,30,{side:true});assert.equal(ground.dummy.damage,23);
});
test('Skull Bash releases through the original ready animation and charge increases damage and speed',()=>{
 for(const charge of [0,60,120]){const s=make('pikachu');s.dummy.x=90;step(s,14+charge,{side:true});step(s,1);assert.equal(s.actors[0].side?.phase,'ready');step(s,17);assert.equal(s.actors[0].side?.phase,'burst');step(s,4);assert.ok(Math.abs(s.player.vx-(2.5+3.5*charge/120))<1e-9);assert.ok(Math.abs(s.script!.hitboxes.get(0)!.damage*s.actors[0].damageMultiplier()-(7+18*charge/120))<1e-9);}
 const full=make('pikachu');full.dummy.x=-80;step(full,170,{side:true});assert.notEqual(full.actors[0].side?.phase,'hold');
});
test('Skull Bash sweeps a fast launch through a target and still leaves the platform into an aerial ending',()=>{
 const s=make('pikachu');step(s,134,{side:true});step(s,22);assert.ok(Math.abs(s.dummy.damage-25)<1e-9);assert.equal(s.hits,1);step(s,65);assert.ok(!s.player.grounded);assert.ok(['SpecialAirSEnd','Fall'].includes(s.player.clip));assert.ok(s.player.x>STAGE.right);
});
test('side specials work in the second slot and are interrupted by damage',()=>{
 for(const id of ids){const s=make('mario',id,true);s.player.x=-80;step(s,1,{}, {side:true});assert.ok(s.actors[1].side,id);assert.equal(s.actors[0].side,null);}
 const s=make('mario','pikachu',true);step(s,1,{}, {side:true});step(s,9,{attack:true});assert.equal(s.actors[1].side,null);assert.ok(s.dummy.damage>0);
});
