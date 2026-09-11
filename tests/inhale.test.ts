import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';import {Poses} from '../src/pose';import {ScriptVM} from '../src/script';
import {neutralInput,type Input,type FighterData} from '../src/types';import {INHALE_RULES} from '../src/inhale';import {cpuInput} from '../src/cpu';import {RangedProjectile} from '../src/ranged';
const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),k=load('kirby'),m=load('mario');
function step(s:Simulation,n=1,input:Partial<Input>={},second:Partial<Input>={}){for(let i=0;i<n;i++){s.step({...neutralInput(),...input},{...neutralInput(),...second});assert.equal(s.error,null);}}
function make(local=false){const s=new Simulation(k.data,k.poses,{mode:local?'battle':'training',opponent:'local',fighters:['kirby','mario']},m);if(local){step(s,180);s.player.x=-12;s.dummy.x=5;}return s;}
function held(s=make()){step(s,55,{neutral:true});assert.equal(s.capture?.phase,'held');assert.equal(s.actors[0].inhale?.phase,'hold');return s;}

test('native inhale volumes start at seventeen, distinguish air targets and spit once at seven',()=>{
 for(const prefix of ['SpecialN','SpecialAirN']){
  const start=new ScriptVM(k.data.moves[prefix+'Start'].commands);start.advance(16);assert.equal(start.grabs.size,0);start.advance(17);assert.equal(start.grabs.get(0)?.radius,5.5);
  const loop=new ScriptVM(k.data.moves[prefix+'Loop'].commands);loop.advance(0);assert.equal(loop.grabs.get(0)?.targetMask,2);assert.equal(loop.grabs.get(1)?.targetMask,3);assert.equal(loop.wind?.radius,7);assert.equal(loop.hitboxes.size,0);assert.equal(loop.error,null);
  const spit=new ScriptVM(k.data.moves[prefix+'Spit'].commands);spit.advance(6);assert.equal(spit.throwEvents.length,0);spit.advance(7);assert.deepEqual(spit.throwEvents,[{id:0,bone:459}]);assert.equal(spit.throws.get(0)?.damage,10);assert.deepEqual(spit.generatedArticles,[2]);spit.advance(31);assert.equal(spit.throwEvents.length,1);assert.equal(spit.error,null);
 }
});

test('hold pulls and captures the passive training opponent; releasing without a capture ends the move',()=>{
 const s=make(),x=s.dummy.x;step(s,23,{neutral:true});assert.equal(s.snapshot().capture,null);assert.ok(s.dummy.x<x);step(s,8,{neutral:true});assert.equal(s.capture?.phase,'pull');assert.equal(s.dummy.state,'captured');step(s,24,{neutral:true});assert.equal(s.capture?.phase,'held');assert.equal(s.dummy.damage,0);assert.equal(s.actors[0].inhale?.phase,'hold');
 const far=make();far.dummy.x=60;step(far,1,{neutral:true});step(far,42);assert.equal(far.actors[0].inhale,null);assert.equal(far.player.state,'idle');assert.equal(far.capture,null);
 const behind=make();behind.dummy.x=-25;step(behind,80,{neutral:true});assert.equal(behind.capture,null);assert.equal(behind.dummy.x,-25);
});

test('inhale grabs through a nearby shield while the outer wind respects the shield',()=>{
 const near=make(true);near.dummy.x=-2;step(near,55,{neutral:true},{shield:true});assert.equal(near.capture?.phase,'held');assert.equal(near.dummy.damage,0);
 const far=make(true),x=far.dummy.x;step(far,60,{neutral:true},{shield:true});assert.equal(far.capture,null);assert.equal(far.dummy.x,x);
});

test('holding U does not spit; carrying can turn, walk and hop before a fresh press spits left',()=>{
 const s=held();step(s,5,{axis:-1,neutral:true});assert.equal(s.player.facing,-1);assert.ok(s.player.x<-12);assert.equal(s.capture?.phase,'held');
 step(s,1,{jump:true});step(s,3);assert.ok(s.player.y>0);assert.equal(s.player.clip,'EatJump1');assert.equal(s.capture?.phase,'held');
 step(s,7,{neutral:true});assert.equal(s.capture?.phase,'held');step(s,1,{neutral:true});assert.equal(s.capture?.phase,'star');assert.equal(s.dummy.damage,10);assert.ok(s.dummy.vx<0);assert.equal(s.lastHit?.move,'InhaleSpit');
 step(s,INHALE_RULES.starLife,{neutral:true});assert.equal(s.capture,null);assert.equal(s.dummy.damage,10);assert.equal(s.dummy.state,'air');assert.equal(s.dummy.clip,'CaptureCut');assert.equal(s.hits,1);
});

test('fresh struggle inputs shorten a hold; holding a button does not repeatedly count and damage extends it',()=>{
 const heldButton=held(),mashed=held(),damaged=make();damaged.dummy.damage=100;held(damaged);assert.ok(damaged.capture!.remaining>heldButton.capture!.remaining);
 let escaped=0;for(let n=0;n<30;n++){step(mashed,1,{}, {attack:n%2===0,axis:n%2===0?1:-1});step(heldButton,1,{}, {attack:true,axis:1});if(!mashed.capture){escaped=n+1;break;}}
 assert.ok(escaped>0&&escaped<20);assert.equal(mashed.dummy.damage,0);assert.equal(mashed.dummy.clip,'CaptureCut');assert.ok(mashed.dummy.invincible>0);assert.ok(heldButton.capture);step(heldButton,220,{}, {attack:true,axis:1});assert.equal(heldButton.capture,null);assert.equal(heldButton.dummy.damage,0);
});

test('air inhale continues its startup clock on landing and can return to Final Cutter',()=>{
 const s=make();s.dummy.x=70;Object.assign(s.player,{y:8,vy:-.2,grounded:false,state:'air',clip:'Fall'});step(s,1,{neutral:true});assert.equal(s.player.clip,'SpecialAirNStart');
 let landed=false;for(let n=0;n<23;n++){const age=s.player.age;step(s,1,{neutral:true});if(s.player.grounded&&!landed){landed=true;assert.equal(s.player.clip,'SpecialNStart');assert.equal(s.player.age,age+1);}}
 assert.equal(landed,true);step(s,22);assert.equal(s.actors[0].inhale,null);step(s,1,{special:true});assert.equal(s.player.clip,'SpecialHi');
});

test('a previously fired projectile interrupts Kirby and restores the captured opponent',()=>{
 const s=held();s.projectiles.push(new RangedProjectile(0,1,'fireball',s.player.x-2,s.player.y+6,1,0,m.data.ranged!.commands));step(s);
 assert.equal(s.capture,null);assert.ok(s.player.hitstun>0);assert.equal(s.actors[0].inhale,null);assert.equal(s.dummy.state,'air');assert.equal(s.dummy.damage,0);
});

test('owner KO releases a held opponent; a spit star releases on stage contact',()=>{
 const s=held(make(true));s.player.x=STAGE.blastX+10;step(s);assert.equal(s.capture,null);assert.equal(s.player.state,'ko');assert.notEqual(s.dummy.state,'captured');
 const star=held();step(star);step(star,8,{attack:true});assert.equal(star.capture?.phase,'star');Object.assign(star.dummy,{x:0,y:3,vx:0,vy:-5});step(star);assert.equal(star.capture,null);assert.equal(star.dummy.state,'air');assert.ok(star.dummy.y>=2);
});

test('both Kirby slots have equal capture priority, and P2 and the CPU can inhale and spit',()=>{
 const mirror=new Simulation(k.data,k.poses,{mode:'battle',opponent:'local',fighters:['kirby','kirby']},k);step(mirror,180);mirror.player.x=-5;mirror.dummy.x=5;step(mirror,18,{neutral:true},{neutral:true});assert.equal(mirror.capture,null);assert.equal(mirror.actors[0].inhale?.phase,'end');assert.equal(mirror.actors[1].inhale?.phase,'end');
 const p2=new Simulation(m.data,m.poses,{mode:'battle',opponent:'local',fighters:['mario','kirby']},k);step(p2,180);p2.player.x=-5;p2.dummy.x=5;step(p2,55,{}, {neutral:true});assert.equal(p2.capture?.owner,1);step(p2);step(p2,8,{}, {attack:true});assert.equal(p2.player.damage,10);assert.equal(p2.lastHit?.attacker,1);
 const cpu=make();for(let n=0;n<100&&!cpu.lastHit;n++)step(cpu,1,cpuInput(cpu.actors[0],cpu.actors[1],n));assert.equal(cpu.lastHit?.move,'InhaleSpit');
 const caught=held();for(let n=0;n<100&&caught.capture;n++)step(caught,1,{},cpuInput(caught.actors[1],caught.actors[0],n));assert.equal(caught.capture,null);assert.equal(caught.dummy.damage,0);
});
