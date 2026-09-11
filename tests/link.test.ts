import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';
import {Poses} from '../src/pose';
import {neutralInput,type FighterData,type MotionData} from '../src/types';
import {attackTimeline,type Attack} from '../src/moves';
const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,
  poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')) as MotionData)});
const link=load('link'),mario=load('mario');
const make=()=>new Simulation(link.data,link.poses,{fighters:['link','mario']},mario);

test('Link uses his own skeleton, movement, landing attributes and all six raw attack scripts',()=>{
  const sim=make();assert.equal(sim.actors[0].a.Weight,104);assert.equal(sim.actors[1].a.Weight,98);
  assert.equal(sim.actors[0].a['Nair Landing Lag?'],9);assert.equal(link.poses.motion.bones.length,80);
  const original={Attack11:[6,7],Attack12:[5,6],Attack13:[5,6,7,8,9],AttackS4S:[5,6,7],AttackS4S2:[11,12,13]};
  for(const [name,frames] of Object.entries(original))assert.deepEqual(attackTimeline(link.data,link.poses.motion,name as Attack).filter(f=>f.active).map(f=>f.frame),frames);
  for(const name of Object.keys(link.data.moves)) {
    const timeline=attackTimeline(link.data,link.poses.motion,name as Attack);
    for(const sample of timeline)for(const h of link.data.hurtboxes) {
      const point=link.poses.point(name,sample.frame,h.bone,h.offset,1,0,0);
      assert.ok(Object.values(point).every(Number.isFinite));
    }
  }
  const marioJump=new Simulation(mario.data,mario.poses);
  for(let i=0;i<6;i++){sim.step({...neutralInput(),jump:true});marioJump.step({...neutralInput(),jump:true});}
  assert.equal(sim.player.grounded,true);assert.equal(marioJump.player.grounded,false);
  sim.step({...neutralInput(),jump:true});sim.step({...neutralInput(),jump:true});assert.equal(sim.player.grounded,false);
});

test('Link sword combo hits Mario for 4, 3 and 5 percent through independently animated hurtboxes',()=>{
  const sim=make(),damage:number[]=[];
  for(let i=0;i<45;i++){
    sim.step({...neutralInput(),attack:[0,2,18].includes(i)});
    if(sim.lastHit?.frame===sim.frame)damage.push(sim.lastHit.damage);
  }
  assert.equal(sim.error,null);assert.deepEqual(damage,[4,3,5]);assert.equal(sim.dummy.damage,12);
});

test('a fresh smash press queues Link second slash, held input and late presses do not',()=>{
  for(const mode of ['tap','hold','late']) {
    const sim=make(),clips=new Set<string>(),hits:string[]=[];
    for(let i=0;i<80;i++){
      const smash=mode==='tap'?[0,12].includes(i):mode==='hold'?i<40:[0,65].includes(i);
      sim.step({...neutralInput(),smash});clips.add(sim.player.clip);
      if(sim.lastHit?.frame===sim.frame)hits.push(sim.lastHit.move);
    }
    assert.equal(sim.error,null);assert.equal(clips.has('AttackS4S2'),mode==='tap');
    if(mode==='tap')assert.deepEqual(hits,['AttackS4S','AttackS4S2']);
  }
  // Both slash animations keep their root out of the skeletal pose.
  for(const name of ['AttackS4S','AttackS4S2'])for(const facing of [-1,1]) {
    const root=link.poses.root(name,12,facing);assert.ok(Math.abs(root.x)<.00001);
  }
});

test('Link can catch either original ledge and climb using his own clip duration and root track',()=>{
  for(const side of [-1,1]) {
    const sim=make();Object.assign(sim.player,{x:side*(STAGE.right+2),y:-6,vy:-.1,grounded:false,state:'air',clip:'Fall'});
    sim.step(neutralInput());assert.equal(sim.player.state,'ledgeCatch');
    for(let i=0;i<30;i++)sim.step(neutralInput());assert.equal(sim.player.state,'ledgeHang');
    sim.step({...neutralInput(),axis:-side});assert.equal(sim.player.state,'ledgeClimb');
    for(let i=0;i<link.poses.motion.clips.CliffClimbQuick.count;i++)sim.step(neutralInput());
    assert.equal(sim.player.state,'idle');assert.equal(sim.player.grounded,true);assert.ok(Math.abs(sim.player.x)<STAGE.right);
  }
});

test('a Link CPU uses directional smashes and finishes a deterministic mixed-fighter stock match',()=>{
  function match(){
    const sim=new Simulation(mario.data,mario.poses,{mode:'battle',opponent:'cpu',fighters:['mario','link']},link);
    const smashes=new Set<string>();while(sim.status!=='finished'&&sim.frame<11000){sim.step(neutralInput());if(sim.dummy.state==='smash')smashes.add(sim.dummy.clip);assert.equal(sim.error,null);}
    assert.equal(sim.status,'finished');assert.equal(sim.winner,1);assert.ok(smashes.has('AttackHi4')&&smashes.has('AttackLw4'));assert.equal(sim.stocks[0],0);return sim.hash();
  }
  assert.equal(match(),match());
  assert.throws(()=>new Simulation(mario.data,mario.poses,{fighters:['mario','link']}),/Selected fighters/);
});
