import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation} from '../src/simulation';import {Poses} from '../src/pose';import {ScriptVM,LANDING_LAG_FLAG} from '../src/script';
import {neutralInput,type Input} from '../src/types';import {RangedProjectile} from '../src/ranged';import {LINK_RESPONSE} from '../src/link-response';
const ids=['mario','link','kirby','pikachu'] as const;
const assets=Object.fromEntries(ids.map(id=>[id,{data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}]));
const make=(id='link',other='mario')=>{const a=assets[id],s=new Simulation(a.data,a.poses,{mode:'battle',opponent:'local'},assets[other]);s.status='playing';s.countdown=0;s.player.x=0;s.dummy.x=60;return s;};
function step(s:Simulation,n=1,i:Partial<Input>={},o:Partial<Input>={}){for(let frame=0;frame<n;frame++){s.step({...neutralInput(),...i},{...neutralInput(),...o});assert.equal(s.error,null);}}
const crouch={down:true,vertical:-1};
function arrow(s:Simulation,x:number,y:number,facing:number,slot=0){const shot=new RangedProjectile(99,1-slot,'arrow',x,y,facing,43,assets.link.data.ranged.commands);s.projectiles.push(shot);return shot;}
function thrust(s:Simulation,age=13){const c=s.actors[0];Object.assign(s.player,{state:'aerial',clip:'AttackAirLw',age,poseFrame:age,y:75,grounded:false,jumps:1,vy:-2,fastfall:true});c.script=new ScriptVM(c.data.moves.AttackAirLw.commands);c.script.advance(age);return c;}
function strike(s:Simulation,blocked=false){const c=s.actors[0],h={...c.script!.hitboxes.values().next().value!};(s as any).hit({attacker:0,hitbox:h,blocked,move:'AttackAirLw'});}

test('all four crouch, hold their original pose, rise, and cancel into movement, attacks, jumps and dodges in both slots',()=>{
 for(const id of ids)for(const slot of [0,1]){
  const s=make(id,id),c=s.actors[slot],input=(i:Partial<Input>,n=1)=>step(s,n,slot===0?i:{},slot===1?i:{});
  input(crouch,20);assert.equal(c.f.state,'crouch');assert.equal(c.f.clip,'SquatWait');input({},20);assert.equal(c.f.state,'idle');
  for(const [i,state] of [[{axis:1},'walk'],[{jump:true},'jumpSquat'],[{...crouch,attack:true},'tilt'],[{...crouch,shield:true},'evade']] as [Partial<Input>,string][]){
   const fresh=make(id,id);step(fresh,20,slot===0?crouch:{},slot===1?crouch:{});step(fresh,1,slot===0?i:{},slot===1?i:{});assert.equal(fresh.actors[slot].f.state,state,`${id} ${slot}`);
  }
 }
});

test('passive shield follows standing/crouching poses and is lowered for items, walking, attacks and air',()=>{
 const s=make(),c=s.actors[0],standing=c.passiveShield()!;assert.ok(standing);step(s,20,crouch);const low=c.passiveShield()!;assert.ok(low.a.y<standing.a.y-3);
 c.heldBomb=()=>true;assert.equal(c.passiveShield(),null);c.heldBomb=()=>false;
 for(const state of ['walk','crouchStart','crouchEnd','jab','shield','evade','hitstun']){s.player.state=state;assert.equal(c.passiveShield(),null,state);}
 s.player.state='idle';s.player.clip='Wait1';s.player.grounded=false;assert.equal(c.passiveShield(),null);
 for(const id of ['mario','kirby','pikachu'])assert.equal(make(id).actors[0].passiveShield(),null);
});

test('real swept arrows hit the physical shield in either facing and slot without damage or guard drain',()=>{
 for(const facing of [-1,1])for(const slot of [0,1])for(const low of [false,true]){
  const s=make('link','link'),c=s.actors[slot];c.f.x=0;s.actors[1-slot].f.x=-60*facing;c.f.facing=facing;
  step(s,20,slot===0&&low?crouch:{},slot===1&&low?crouch:{});const guard=c.passiveShield()!,y=(guard.a.y+guard.b.y)/2;
  arrow(s,facing*20,y,-facing,slot);step(s,3,slot===0&&low?crouch:{},slot===1&&low?crouch:{});
  assert.equal(s.lastHit?.move,'HylianShield',`${slot} ${facing} ${low}`);assert.equal(c.f.damage,0);assert.equal(c.f.shield,60);assert.equal(c.f.shieldStun,0);assert.equal(c.f.hitlag,0);assert.ok(c.hylianFlash);assert.equal(s.projectiles.length,0);
 }
});

test('rear shots and low shots bypass the standing shield; crouching catches the low shot',()=>{
 const rear=make();arrow(rear,-20,10,1);step(rear,4);assert.ok(rear.player.damage>0);assert.notEqual(rear.lastHit?.move,'HylianShield');
 const low=make();arrow(low,20,3,-1);step(low,4);assert.ok(low.player.damage>0);
 const duck=make();step(duck,20,crouch);arrow(duck,20,3,-1);step(duck,4,crouch);assert.equal(duck.player.damage,0);assert.equal(duck.lastHit?.move,'HylianShield');
});

test('down-air contact and guard contact rebound once, freeze during hitlag, and rearm only weaker source hitboxes',()=>{
 for(const blocked of [false,true]){
  const s=make(),c=thrust(s);strike(s,blocked);assert.equal(s.lastHit?.damage,blocked?0:22);assert.equal(s.player.vy,LINK_RESPONSE.lift);assert.equal(s.player.fastfall,false);assert.equal(s.player.jumps,1);
  const y=s.player.y,cooldown=c.linkBounce!.cooldown;step(s,s.player.hitlag);assert.equal(s.player.y,y);assert.equal(c.linkBounce?.cooldown,cooldown);
  step(s,5);assert.equal(c.linkBounce?.cooldown,1);assert.equal((s as any).contact(0),null);step(s);assert.equal(c.linkBounce?.cooldown,0);assert.equal(c.hasHit,false);
  assert.ok([...c.script!.hitboxes.values()].every(h=>h.damage===8));assert.ok(s.player.y>y);
  strike(s,blocked);assert.equal(s.lastHit?.damage,blocked?0:8);assert.equal(c.linkBounce?.count,2);
 }
});

test('down-air rebound keeps the landing window and clears when landing, interrupted, or resetting',()=>{
 const s=make(),c=thrust(s);strike(s);s.player.hitlag=0;assert.ok(c.script?.variables.has(LANDING_LAG_FLAG));s.player.y=.001;s.player.vy=-1;step(s);
 assert.equal(s.player.clip,'LandingAirLw');assert.equal(c.linkBounce,null);assert.equal(s.landingDuration(s.player),50);
 const interrupted=make(),a=thrust(interrupted);strike(interrupted);(interrupted as any).hit({attacker:1,hitbox:{...a.script!.hitboxes.values().next().value!,damage:3},blocked:false,move:'Attack11'});assert.equal(a.linkBounce,null);assert.equal(interrupted.player.state,'hitstun');
 const reset=make();reset.actors[0].hylianFlash={ticks:12,point:{x:1,y:1,z:0}};(reset as any).resetFighter(0);assert.equal(reset.actors[0].hylianFlash,null);
});

test('contact with Stone rebounds Link even when Kirby absorbs the damage',()=>{
 const s=make('link','kirby');step(s,40,{}, {downSpecial:true});const c=thrust(s);assert.ok(s.actors[1].stoneFormed());strike(s);
 assert.equal(s.dummy.damage,0);assert.equal(s.actors[1].downSpecial?.armor,8);assert.equal(c.linkBounce?.count,1);assert.equal(s.player.vy,LINK_RESPONSE.lift);
});

test('passive shield and rebound state participate in deterministic replay hashes',()=>{
 const a=make(),b=make();for(const s of [a,b]){step(s,20,crouch);arrow(s,20,3,-1);}step(a,3,crouch);step(b,3,crouch);assert.equal(a.hash(),b.hash());
 const saved=a.snapshot();a.actors[0].hylianFlash!.ticks--;assert.notEqual(a.hash(),b.hash());assert.equal(saved.linkResponse[0].flash!.ticks,b.actors[0].hylianFlash!.ticks);
});
