import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation,STAGE,SHIELD_RULES} from '../src/simulation';
import {Poses} from '../src/pose';
import {neutralInput} from '../src/types';
import {attackTimeline} from '../src/moves';
const data=JSON.parse(readFileSync('public/assets/mario/data.json','utf8'));
const motion=JSON.parse(readFileSync('public/assets/mario/motion.json','utf8')),poses=new Poses(motion);
const idle=(s:Simulation,n:number)=>{for(let i=0;i<n;i++)s.step(neutralInput());};
function battle(opponent:'local'|'cpu'='local',stocks=3,seconds=180){const s=new Simulation(data,poses,{mode:'battle',opponent,stocks,seconds});idle(s,180);return s;}

test('countdown holds both fighters, then starts the three-stock timer',()=>{
  const s=new Simulation(data,poses,{mode:'battle'});
  for(let i=0;i<179;i++)s.step({...neutralInput(),axis:1,attack:true});
  assert.equal(s.player.x,-60);assert.equal(s.dummy.x,60);assert.equal(s.hits,0);assert.equal(s.remaining,10800);
  assert.equal(s.status,'countdown');s.step(neutralInput());assert.equal(s.status,'playing');
  s.step(neutralInput());assert.equal(s.remaining,10799);assert.deepEqual(s.stocks,[3,3]);
});

test('player two has independent movement, attack VM and damage delivery',()=>{
  const s=battle();s.player.x=-6;s.dummy.x=5;
  s.step(neutralInput(),{...neutralInput(),attack:true});s.step(neutralInput());
  assert.equal(s.player.damage,3);assert.equal(s.dummy.damage,0);
  assert.equal(s.lastHit?.attacker,1);assert.equal(s.actors[1].hasHit,true);
  assert.equal(s.script,null);assert.equal(s.player.state,'hitstun');
  const x=s.player.x;s.step({...neutralInput(),axis:1,jump:true,smash:true});
  assert.equal(s.player.x,x,'hitlag freezes the struck fighter');assert.equal(s.player.jumps,0);
});

test('simultaneous jabs trade instead of favoring player one',()=>{
  const s=battle();s.player.x=-6;s.dummy.x=5;
  s.step({...neutralInput(),attack:true},{...neutralInput(),attack:true});s.step(neutralInput());
  assert.equal(s.player.damage,3);assert.equal(s.dummy.damage,3);assert.equal(s.hits,2);
  assert.equal(s.player.state,'hitstun');assert.equal(s.dummy.state,'hitstun');
});

test('a shield absorbs an incoming jab, loses health, and locks release through shieldstun',()=>{
  const s=battle();s.player.x=-6;s.dummy.x=5;
  s.step({...neutralInput(),shield:true},{...neutralInput(),attack:true});
  s.step({...neutralInput(),shield:true});
  assert.equal(s.player.damage,0);assert.ok(s.player.shield<60);assert.equal(s.lastHit?.blocked,true);
  assert.ok(s.player.shieldStun>0);assert.equal(s.player.clip,'GuardDamage');
  s.step(neutralInput());assert.equal(s.player.state,'shield');
  idle(s,30);assert.equal(s.player.state,'idle');
});

test('holding a shield drains it, break prevents action, and recovery restores shield health',()=>{
  const s=new Simulation(data,poses);s.player.shield=.2;
  s.step({...neutralInput(),shield:true});s.step({...neutralInput(),shield:true});s.step({...neutralInput(),shield:true});
  assert.equal(s.player.state,'shieldBreak');assert.equal(s.player.shield,0);
  for(let i=0;i<SHIELD_RULES.breakStun-1;i++)s.step({...neutralInput(),attack:true,jump:true,axis:1});
  assert.equal(s.player.state,'shieldBreak');assert.equal(s.player.grounded,true);assert.equal(s.script,null);
  s.step(neutralInput());assert.equal(s.player.state,'idle');assert.equal(s.player.shield,30);
  idle(s,60);assert.ok(s.player.shield>30);
});

test('jumping out of shield enters normal jump startup and preserves jump limits',()=>{
  const s=new Simulation(data,poses);s.step({...neutralInput(),shield:true});
  s.step({...neutralInput(),shield:true,jump:true});assert.equal(s.player.state,'jumpSquat');
  for(let i=0;i<5;i++)s.step({...neutralInput(),jump:true});
  assert.equal(s.player.grounded,false);assert.equal(s.player.jumps,1);
});

test('forward smash executes original hitboxes and respects recovery',()=>{
  const timeline=attackTimeline(data,motion,'AttackS4S');
  assert.deepEqual(timeline.filter(f=>f.active).map(f=>f.frame),[9,10,11]);
  assert.equal(timeline[9].damage,17);assert.equal(timeline.find(f=>f.interruptible)?.frame,42);
  const s=new Simulation(data,poses);s.player.x=-8;
  s.step({...neutralInput(),smash:true});idle(s,motion.clips.AttackS4Start.count+9);
  assert.ok([14,17].includes(s.dummy.damage));assert.equal(s.hits,1);assert.equal(s.player.clip,'AttackS4S');
  s.step({...neutralInput(),jump:true,attack:true,axis:1});assert.equal(s.player.clip,'AttackS4S');
});

test('KO removes one stock, then respawns above the platform with temporary protection',()=>{
  const s=battle();s.player.x=STAGE.blastX+1;s.player.damage=80;s.step(neutralInput());
  assert.deepEqual(s.stocks,[2,3]);assert.equal(s.player.state,'ko');
  idle(s,44);assert.equal(s.player.state,'ko');idle(s,1);
  assert.equal(s.player.state,'respawn');assert.equal(s.player.damage,0);assert.ok(s.player.y>40);
  assert.ok(s.player.invincible>0);assert.equal(s.player.ledgeSide,0);
  idle(s,60);assert.equal(s.player.state,'air');assert.ok(s.player.invincible>0);
  idle(s,130);assert.equal(s.player.invincible,0);assert.equal(s.player.grounded,true);
});

test('forward smash transfers its root motion into physics and grounded fighters cannot cross',()=>{
  const s=new Simulation(data,poses);s.player.x=-40;
  s.step({...neutralInput(),smash:true});idle(s,motion.clips.AttackS4Start.count+9);
  assert.ok(Math.abs(s.player.x-(-40+motion.clips.AttackS4Start.rootMotion.at(-1)[2]-motion.clips.AttackS4Start.rootMotion[0][2]+motion.clips.AttackS4S.rootMotion[9][2]-motion.clips.AttackS4S.rootMotion[0][2]))<1e-5);
  const rootIndex=motion.bones.findIndex((b:any)=>b.name==='TransN')*16;
  assert.deepEqual(motion.clips.AttackS4S.frames[9].slice(rootIndex+12,rootIndex+15),[0,0,0]);
  const local=battle();local.player.x=-4;local.dummy.x=4;
  for(let i=0;i<20;i++) {
    local.step({...neutralInput(),axis:1,smash:i===0},{...neutralInput(),axis:-1});
    assert.ok(local.player.x<=local.dummy.x,'grounded lunge must not swap fighter positions');
  }
});

test('last-stock loss ends the match and simultaneous last-stock KOs draw',()=>{
  for(const simultaneous of [false,true]) {
    const s=battle('local',1);s.player.x=STAGE.blastX+1;
    if(simultaneous)s.dummy.x=-STAGE.blastX-1;
    s.step(neutralInput());assert.equal(s.status,'finished');assert.equal(s.winner,simultaneous?-1:1);
    const before=s.hash();idle(s,100);assert.equal(s.hash(),before);
  }
});

test('time limit ranks remaining stocks, then lower damage, and ties draw',()=>{
  for(const variant of ['stock','damage','tie']) {
    const s=battle('local',3,1);
    if(variant==='stock'){s.stocks[0]=2;s.dummy.damage=120;}
    if(variant==='damage')s.dummy.damage=25;
    idle(s,60);assert.equal(s.status,'finished');assert.equal(s.winner,variant==='stock'?1:variant==='damage'?0:-1);
  }
});

test('CPU actively attacks, takes stocks and finishes a deterministic match',()=>{
  const a=battle('cpu'),b=battle('cpu');
  for(let i=0;i<5000&&a.status!=='finished';i++){a.step(neutralInput());b.step(neutralInput());}
  assert.equal(a.status,'finished');assert.equal(a.winner,1);assert.equal(a.stocks[0],0);
  assert.ok(a.hits>10);assert.equal(a.error,null);assert.equal(a.hash(),b.hash());
});
