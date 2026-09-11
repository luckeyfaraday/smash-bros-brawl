import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation} from '../src/simulation';
import {Poses} from '../src/pose';
import {neutralInput,type Input,type Hitbox} from '../src/types';
import {ScriptVM} from '../src/script';
import {STAGE} from '../src/stage';
import {cpuInput} from '../src/cpu';
import {KNOCKDOWN_RULES} from '../src/knockdown';

const ids=['mario','link','kirby','pikachu'] as const;
const assets=Object.fromEntries(ids.map(id=>[id,{data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}]));
function make(id='mario',slot=0){const s=new Simulation(assets[id].data,assets[id].poses,{mode:'battle',opponent:'local'},assets[id]);s.status='playing';s.countdown=0;s.actors[slot].f.x=0;s.actors[1-slot].f.x=-70;return s;}
function step(s:Simulation,n=1,i:Partial<Input>={},slot=0){for(let f=0;f<n;f++){s.step(slot===0?{...neutralInput(),...i}:neutralInput(),slot===1?{...neutralInput(),...i}:neutralInput());assert.equal(s.error,null);}}
const hit:Hitbox={id:0,bone:0,damage:10,angle:90,growth:0,base:90,fixed:0,radius:5,offset:[0,0,0],hitlag:1};
function launch(s:Simulation,slot=0,patch:Partial<Hitbox>={}){(s as any).hit({attacker:1-slot,victim:slot,hitbox:{...hit,...patch},blocked:false,move:'test launch'});}
function falling(s:Simulation,slot=0,y=1){launch(s,slot);const f=s.actors[slot].f;Object.assign(f,{hitlag:0,y,vy:-2,vx:0,hitstun:30});s.actors[1-slot].f.hitlag=0;}
function until(s:Simulation,predicate:()=>boolean,slot=0,max=400){for(let n=0;n<max&&!predicate();n++)step(s,1,{},slot);assert.ok(predicate(),'expected state was not reached');}

test('all four fighters in both slots tumble, miss a tech, lie down and stand through original clips',()=>{
 for(const id of ids)for(const slot of [0,1]){
  const s=make(id,slot),c=s.actors[slot];launch(s,slot);assert.equal(c.f.state,'hitstun');assert.equal(c.f.clip,'DamageFlyTop');
  until(s,()=>c.f.state==='knockdown',slot);assert.equal(c.f.hitstun,0);assert.equal(c.f.grounded,true);assert.match(c.f.clip,/^DownBound[UD]$/);
  until(s,()=>c.f.state==='downWait',slot);const x=c.f.x;step(s,5,{},slot);assert.equal(c.f.x,x);
  step(s,1,{jump:true},slot);assert.equal(c.f.state,'getup');assert.match(c.f.clip,/^DownStand[UD]$/);assert.equal(c.script!.hurtState,2);
  step(s,21,{},slot);assert.equal(c.script!.hurtState,2);step(s,1,{},slot);assert.equal(c.script!.hurtState,0);
  until(s,()=>c.f.state==='idle',slot);assert.equal(c.script,null);assert.equal(c.knockdown,null);
 }
});

test('low knockback preserves ordinary hitstun; grounded downward strong hits knock down immediately',()=>{
 const weak=make();launch(weak,0,{base:79});assert.equal(weak.actors[0].knockdown,null);assert.equal(weak.player.clip,'DamageN1');
 const down=make();launch(down,0,{angle:270});assert.equal(down.player.state,'knockdown');assert.equal(down.player.y,STAGE.floor);
});

test('floor techs accept a fresh shield press and select neutral/forward/backward by contact direction in either facing and slot',()=>{
 for(const id of ids)for(const slot of [0,1])for(const facing of [-1,1])for(const axis of [-1,0,1]){
  const s=make(id,slot),c=s.actors[slot];falling(s,slot);c.f.facing=facing;step(s,1,{shield:true,axis},slot);
  assert.equal(c.f.state,'tech',`${id} ${slot} ${facing} ${axis}`);assert.equal(c.f.clip,axis===0?'Passive':axis*facing>0?'PassiveStandF':'PassiveStandB');
  assert.equal(c.script!.hurtState,2);assert.equal(c.f.hitstun,0);assert.equal(c.tech.window,0);
  const start=c.f.x,clip=c.f.clip;step(s,19,{},slot);assert.equal(c.script!.hurtState,2);step(s,1,{},slot);assert.equal(c.script!.hurtState,0);
  until(s,()=>c.f.state==='idle',slot);const travel=c.f.x-start;
  if(axis)assert.ok(travel*axis>20,`${id} ${clip}: roll transfers original travel`);else assert.equal(travel,0);
 }
});

test('tech window includes its final tick, expires, cannot be refreshed by holding or mashing, and accepts a later fresh press',()=>{
 for(const delay of [19,20]){
  const s=make(),c=s.actors[0];falling(s,0,100);c.f.hitstun=100;step(s,1,{shield:true});step(s,delay-1);c.f.y=1;c.f.vy=-2;step(s);
  assert.equal(c.f.state,delay===19?'tech':'knockdown');
 }
 const s=make(),c=s.actors[0];falling(s,0,100);c.f.hitstun=150;step(s,1,{shield:true});const lock=c.tech.lockout;step(s,1);step(s,1,{shield:true});assert.equal(c.tech.lockout,lock-2);assert.equal(c.tech.window,18);
 c.f.y=100;step(s,20,{shield:true});assert.equal(c.tech.window,0);c.f.y=1;step(s,1,{shield:true});assert.equal(c.f.state,'knockdown');
 const fresh=make(),actor=fresh.actors[0];falling(fresh,0,150);actor.f.hitstun=150;step(fresh,1,{shield:true});step(fresh,40);actor.f.y=1;step(fresh,1,{shield:true});assert.equal(actor.f.state,'tech');
});

test('a tech pressed in hitlag stays buffered while motion and its timers are frozen',()=>{
 const s=make(),c=s.actors[0];falling(s);c.f.hitlag=4;step(s,1,{shield:true});const saved={...c.tech};step(s,3);assert.deepEqual(c.tech,saved);assert.equal(c.f.y,1);step(s);assert.equal(c.f.state,'tech');
});

test('all face-up/down get-up options use source travel, protection and attacks without early ordinary input cancellation',()=>{
 for(const id of ids)for(const posture of ['U','D'])for(const action of ['stand','attack','forward','back']){
  const s=make(id),c=s.actors[0];(c as any).beginFloor('wait',posture);const axis=action==='forward'?1:action==='back'?-1:0;
  step(s,1,action==='stand'?{vertical:1}:action==='attack'?{attack:true}:{axis});
  assert.equal(c.f.clip,`${action==='stand'?'DownStand':action==='attack'?'DownAttack':action==='forward'?'DownForward':'DownBack'}${posture}`);
  const clip=c.f.clip;let active=0;for(let frame=0;frame<10;frame++){step(s,1,{jump:true,neutral:true,special:true});assert.equal(c.f.clip,clip);}
  while(c.knockdown){if(c.script?.hitboxes.size){active++;assert.ok([...c.script.hitboxes.values()].every(h=>h.damage===6));}step(s);}
  if(action==='attack')assert.ok(active>=4,`${id} ${posture}: both source hit windows execute`);
  if(axis)assert.ok(c.f.x*axis>20);assert.equal(c.script,null);
 }
});

test('get-up attacks collide with a real opponent and respect its shield',()=>{
 for(const blocked of [false,true]){
  const s=make('mario'),c=s.actors[0];s.dummy.x=10;(c as any).beginFloor('wait','D');step(s,1,{attack:true});
  for(let n=0;n<60;n++){s.step(neutralInput(),{...neutralInput(),shield:blocked});assert.equal(s.error,null);}
  assert.equal(s.lastHit?.move,'DownAttackD');assert.equal(s.lastHit?.blocked,blocked);assert.equal(s.lastHit?.damage,blocked?0:6);
 }
});

test('floor recovery rolls stay on stage at either edge and are not stopped by opponent pushboxes',()=>{
 for(const clip of ['DownForwardU','DownBackD','PassiveStandF','PassiveStandB'])for(const side of [-1,1]){
  const s=make('link'),c=s.actors[0];c.f.x=side*(STAGE.right-2);c.f.facing=(clip.includes('Back')||clip.endsWith('B')?-1:1)*side;
  (c as any).beginFloor(clip.startsWith('Passive')?'tech':'roll','U',clip);step(s,50);assert.ok(c.f.x>=STAGE.left&&c.f.x<=STAGE.right);assert.equal(c.f.grounded,true,`${clip} ${side}: ${JSON.stringify(c.f)}`);
 }
 const cross=make('link'),c=cross.actors[0];cross.dummy.x=12;(c as any).beginFloor('tech','U','PassiveStandF');step(cross,41);assert.ok(c.f.x>cross.dummy.x+20);
});

test('missed-tech waiting times out; vulnerable prone hits, relaunch, capture and KO clear obsolete recovery state',()=>{
 const s=make(),c=s.actors[0];(c as any).beginFloor('wait','U');step(s,KNOCKDOWN_RULES.waitLimit);assert.equal(c.f.state,'getup');
 (c as any).beginFloor('wait','D');launch(s,0,{base:20,angle:0});assert.equal(c.f.state,'downDamage');assert.equal(c.f.clip,'DownDamageD');c.f.hitlag=0;until(s,()=>c.f.state==='downWait');launch(s);assert.equal(c.knockdown?.phase,'fly');
 c.f.x=STAGE.blastX+1;step(s);assert.equal(c.f.state,'ko');assert.equal(c.knockdown,null);assert.deepEqual(c.tech,{window:0,lockout:0});
 const grabbed=make();const victim=grabbed.actors[0];(victim as any).beginFloor('wait','U');grabbed.dummy.x=-9;grabbed.dummy.facing=1;for(let n=0;n<15&&!grabbed.hold;n++)step(grabbed,1,{grab:true},1);assert.ok(grabbed.hold);assert.equal(victim.knockdown,null);
});

test('tumble allows an action after hitstun, keeps air-jump consumption and can catch a ledge',()=>{
 const s=make(),c=s.actors[0];falling(s,0,60);c.f.hitstun=1;c.f.jumps=1;step(s,1,{jump:true});assert.equal(c.knockdown,null);assert.equal(c.f.jumps,2);assert.equal(c.f.clip,'JumpAerialF');
 const edge=make(),actor=edge.actors[0];falling(edge,0,-5);actor.f.x=STAGE.right+2;actor.f.hitstun=1;step(edge);assert.equal(actor.f.state,'ledgeCatch');assert.equal(actor.knockdown,null);
 const wind=make(),a=wind.actors[0];(a as any).beginFloor('wait','U');a.f.x=STAGE.right+2;step(wind,2,{down:true});assert.equal(a.f.grounded,false);assert.ok(a.f.y<0);assert.equal(a.knockdown?.phase,'fall');
});

test('training dummy follows knockdown and automatic get-up; CPU attempts techs and chooses get-ups through normal inputs',()=>{
 const a=assets.mario,s=new Simulation(a.data,a.poses);falling(s,1);step(s);assert.equal(s.dummy.state,'knockdown');until(s,()=>s.dummy.state==='idle');
 const battle=make(),c=battle.actors[0];falling(battle);const i=cpuInput(c,battle.actors[1],101);assert.equal(i.shield,true);step(battle,1,i);assert.equal(c.f.state,'tech');
 for(const id of ids){const b=make(id),actor=b.actors[0];(actor as any).beginFloor('wait','U');actor.f.age=12;b.dummy.x=15;step(b,1,cpuInput(actor,b.actors[1],101));assert.match(actor.f.clip,/^DownAttack/);}
});

test('knockdown snapshots are independent copies and replay hashes cover phase and buffered tech state',()=>{
 const a=make(),b=make();falling(a);falling(b);step(a,1,{shield:true,axis:1});step(b,1,{shield:true,axis:1});assert.equal(a.hash(),b.hash());
 const saved=a.snapshot();a.actors[0].tech.lockout--;assert.notEqual(a.hash(),b.hash());assert.equal(saved.knockdown[0].tech.lockout,b.actors[0].tech.lockout);
 a.actors[0].knockdown!.posture='D';assert.equal(saved.knockdown[0].state!.posture,b.actors[0].knockdown!.posture);
 (a as any).resetFighter(0);assert.equal(a.actors[0].knockdown,null);assert.deepEqual(a.actors[0].tech,{window:0,lockout:0});
});
