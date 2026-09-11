import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation,STAGE,LEDGE_RULES} from '../src/simulation';
import {Poses} from '../src/pose';
import {neutralInput} from '../src/types';

const data=JSON.parse(readFileSync('public/assets/mario/data.json','utf8'));
const motion=JSON.parse(readFileSync('public/assets/mario/motion.json','utf8'));
const poses=new Poses(motion);
const idle=(sim:Simulation,n:number)=>{for(let i=0;i<n;i++)sim.step(neutralInput());};
function approachEdge(side=1) {
  const sim=new Simulation(data,poses);
  Object.assign(sim.player,{x:side*(STAGE.right+3),y:-5,vy:-.2,grounded:false,state:'air',clip:'Fall',jumps:2});
  return sim;
}
function hang(side=1) {
  const sim=approachEdge(side);sim.step(neutralInput());idle(sim,motion.clips.CliffCatch.count);
  assert.equal(sim.player.state,'ledgeHang');return sim;
}

test('both original ledges catch a descending fighter and play the original catch and hang',()=>{
  for(const side of [-1,1]) {
    const sim=approachEdge(side);sim.step(neutralInput());
    assert.equal(sim.player.state,'ledgeCatch');assert.equal(sim.player.clip,'CliffCatch');
    assert.equal(sim.player.facing,-side);assert.equal(sim.player.ledgeSide,side);
    assert.equal(sim.player.x,side*STAGE.right);assert.equal(sim.player.y,STAGE.floor);
    assert.equal(sim.player.jumps,0);assert.equal(sim.player.poseFrame,0);
    idle(sim,motion.clips.CliffCatch.count);assert.equal(sim.player.clip,'CliffWait');
    const x=sim.player.x;idle(sim,120);assert.equal(sim.player.x,x);assert.equal(sim.player.y,0);
    assert.equal(sim.player.invincible,0,'hanging cannot grant permanent invincibility');
  }
});

test('rising, attacking away, down input, hitstun, occupied edges and out-of-reach fighters cannot grab',()=>{
  for(const variant of ['rising','away','down','hitstun','occupied','far','low','inside']) {
    const sim=approachEdge(),input=neutralInput();
    if(variant==='rising')sim.player.vy=1;
    if(variant==='away')input.axis=1;
    if(variant==='down')input.down=true;
    if(variant==='hitstun')sim.player.hitstun=5;
    if(variant==='occupied')sim.dummy.ledgeSide=1;
    if(variant==='far')sim.player.x=STAGE.right+LEDGE_RULES.reach+2;
    if(variant==='low')sim.player.y=LEDGE_RULES.bottom-2;
    if(variant==='inside')sim.player.x=STAGE.right-2;
    sim.step(input);assert.equal(sim.player.ledgeSide,0,variant);
  }
});

test('catching during an aerial clears hitboxes and catch startup rejects action presses',()=>{
  const sim=approachEdge();sim.step({...neutralInput(),attack:true});
  assert.equal(sim.player.state,'ledgeCatch');assert.equal(sim.script,null);
  sim.step({...neutralInput(),jump:true,axis:-1});
  assert.equal(sim.player.state,'ledgeCatch');assert.equal(sim.player.jumps,0);
});

test('quick and slow climbs finish at the original animation root on either edge',()=>{
  for(const side of [-1,1])for(const damage of [0,100]) {
    const sim=hang(side);sim.player.damage=damage;
    sim.step({...neutralInput(),axis:-side});
    const clip=damage>=100?'CliffClimbSlow':'CliffClimbQuick';
    assert.equal(sim.player.clip,clip);
    idle(sim,motion.clips[clip].count-1);assert.equal(sim.player.state,'ledgeClimb');
    sim.step(neutralInput());
    assert.equal(sim.player.state,'idle');assert.equal(sim.player.grounded,true);
    assert.equal(sim.player.x,side*STAGE.right+poses.root(clip,motion.clips[clip].count-1,-side).x);
    assert.equal(sim.player.y,0);assert.equal(sim.player.damage,damage);assert.equal(sim.player.ledgeSide,0);
  }
});

test('ledge jumps play both original phases and leave one air jump available',()=>{
  for(const side of [-1,1])for(const damage of [0,100]) {
    const sim=hang(side);sim.player.damage=damage;
    sim.step({...neutralInput(),jump:true});
    const name=damage>=100?'CliffJumpSlow':'CliffJumpQuick';
    assert.equal(sim.player.clip,name+'1');
    idle(sim,motion.clips[name+'1'].count);
    assert.equal(sim.player.clip,name+'2');assert.equal(sim.player.grounded,false);
    assert.ok(sim.player.vy>0);assert.ok(sim.player.vx*-side>0);assert.equal(sim.player.jumps,1);
    sim.step({...neutralInput(),jump:true});assert.equal(sim.player.jumps,2);assert.equal(sim.player.clip,'JumpAerialF');
  }
});

test('dropping transfers the hanging root and prevents an immediate invincible regrab',()=>{
  for(const side of [-1,1]) {
    const sim=hang(side),root=poses.root(sim.player.clip,sim.player.poseFrame,-side);
    sim.step({...neutralInput(),down:true});
    assert.equal(sim.player.state,'air');assert.equal(sim.player.clip,'Fall');
    assert.equal(sim.player.x,side*STAGE.right+root.x);assert.equal(sim.player.y,root.y);
    assert.equal(sim.player.invincible,0);assert.equal(sim.player.ledgeCooldown,LEDGE_RULES.regrabDelay);
    sim.step(neutralInput());assert.equal(sim.player.ledgeSide,0);assert.equal(sim.player.jumps,1);
    sim.step({...neutralInput(),jump:true,axis:-side});assert.equal(sim.player.jumps,2);
  }
});

test('a fresh away press drops; held input from the catch does not trigger an accidental climb',()=>{
  const sim=approachEdge();sim.step({...neutralInput(),axis:-1});
  for(let i=0;i<35;i++)sim.step({...neutralInput(),axis:-1});
  assert.equal(sim.player.state,'ledgeHang');
  sim.step({...neutralInput(),axis:1});assert.equal(sim.player.state,'air');
  assert.equal(sim.player.ledgeSide,0);
});

test('hanging expires and a blast reset discards ledge cooldown and invincibility',()=>{
  const sim=hang();idle(sim,LEDGE_RULES.hangLimit);
  assert.equal(sim.player.state,'air');assert.equal(sim.player.ledgeSide,0);
  sim.player.x=STAGE.blastX+1;sim.step(neutralInput());
  assert.equal(sim.player.ledgeCooldown,0);assert.equal(sim.player.invincible,0);
  assert.equal(sim.player.x,-12);
});
