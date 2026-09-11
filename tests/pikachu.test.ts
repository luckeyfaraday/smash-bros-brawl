import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';
import {Poses} from '../src/pose';
import {ScriptVM} from '../src/script';
import {attackTimeline,type Attack} from '../src/moves';
import {neutralInput,type FighterData,type MotionData} from '../src/types';
const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,
  poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')) as MotionData)});
const pika=load('pikachu'),mario=load('mario');
const make=()=>new Simulation(pika.data,pika.poses,{fighters:['pikachu','mario']},mario);

test('Pikachu native attacks and hurtboxes resolve across all enabled animations',()=>{
  assert.equal(pika.poses.motion.bones.length,48);assert.equal(Object.keys(pika.poses.motion.clips).length,153);
  assert.equal(pika.data.hurtboxes.length,13);
  for(const name of Object.keys(pika.data.moves)){
    const vm=new ScriptVM(pika.data.moves[name].commands,{articleAvailable:()=>false});
    for(const frame of attackTimeline(pika.data,pika.poses.motion,name as Attack)){
      vm.advance(frame.frame);assert.equal(vm.error,null);
      for(const h of [...vm.hitboxes.values(),...pika.data.hurtboxes])for(const facing of [-1,1])
        assert.ok(Object.values(pika.poses.point(name,frame.frame,h.bone,h.offset,facing,0,0)).every(Number.isFinite));
    }
  }
});

test('Pikachu repeats his single headbutt on held or queued attack and recovers on release',()=>{
  const sim=make(),clips=new Set<string>();
  for(let i=0;i<100;i++){sim.step({...neutralInput(),attack:true});clips.add(sim.player.clip);assert.equal(sim.error,null);}
  assert.ok(sim.hits>=2);assert.ok(!clips.has('Attack12')&&!clips.has('Attack100'));
  for(let i=0;i<25;i++)sim.step(neutralInput());assert.equal(sim.player.state,'idle');
  const tap=make();tap.step({...neutralInput(),attack:true});for(let i=0;i<60;i++)tap.step(neutralInput());
  assert.equal(tap.hits,1);assert.equal(tap.dummy.damage,2);
  const whiff=make();whiff.dummy.x=70;
  whiff.step({...neutralInput(),attack:true});whiff.step(neutralInput());whiff.step({...neutralInput(),attack:true});
  for(let i=0;i<4;i++)whiff.step(neutralInput());
  assert.equal(whiff.player.age,0);assert.equal(whiff.player.clip,'Attack11');
});

test('Pikachu smash plays its separate wind-up before early, middle and late hit phases',()=>{
  const timeline=attackTimeline(pika.data,pika.poses.motion,'AttackS4S');
  assert.deepEqual([timeline[1].damage,timeline[4].damage,timeline[7].damage],[20,17,14]);
  assert.equal(timeline[9].active,false);
  const sim=make();sim.dummy.x=-3;
  for(let i=0;i<14;i++){sim.step({...neutralInput(),smash:i===0});assert.equal(sim.player.clip,'AttackS4Start');assert.equal(sim.hits,0);}
  sim.step(neutralInput());assert.equal(sim.player.clip,'AttackS4S');assert.equal(sim.hits,0);
  sim.step(neutralInput());assert.equal(sim.lastHit?.damage,20);
  for(let i=0;i<65;i++)sim.step(neutralInput());assert.equal(sim.player.state,'idle');
});

test('Pikachu double jump and neutral aerial use their own movement, damage and landing values',()=>{
  const sim=make();for(let i=0;i<5;i++)sim.step({...neutralInput(),jump:true});
  assert.equal(sim.player.jumps,1);assert.equal(sim.player.vy,2.48-.087);
  sim.step(neutralInput());sim.step({...neutralInput(),jump:true});assert.equal(sim.player.jumps,2);
  assert.equal(sim.player.clip,'JumpAerialF');sim.step(neutralInput());sim.step({...neutralInput(),jump:true});assert.equal(sim.player.jumps,2);
  const air=attackTimeline(pika.data,pika.poses.motion,'AttackAirN');
  assert.equal(air[2].damage,12);assert.equal(air[5].damage,6);assert.equal(air[25].active,false);assert.equal(air[34].landingLag,false);
  Object.assign(sim.player,{x:0,y:1,vy:-.1,state:'air',clip:'Fall'});sim.step({...neutralInput(),attack:true});
  for(let i=0;i<10&&!sim.player.grounded;i++)sim.step(neutralInput());
  assert.equal(sim.player.clip,'LandingAirN');assert.equal(sim.landingDuration(sim.player),25);
});

test('Pikachu catches and climbs either ledge and can shield an incoming smash',()=>{
  for(const side of [-1,1]){
    const sim=make();Object.assign(sim.player,{x:side*(STAGE.right+2),y:-6,vy:-.1,grounded:false,state:'air',clip:'Fall',jumps:2});
    sim.step(neutralInput());assert.equal(sim.player.state,'ledgeCatch');
    for(let i=0;i<12;i++)sim.step(neutralInput());assert.equal(sim.player.state,'ledgeHang');
    sim.step({...neutralInput(),axis:-side});for(let i=0;i<34;i++)sim.step(neutralInput());
    assert.equal(sim.player.grounded,true);assert.equal(sim.player.ledgeSide,0);assert.ok(Math.abs(sim.player.x)<STAGE.right);
  }
  const sim=new Simulation(pika.data,pika.poses,{mode:'battle',opponent:'local'},mario);
  for(let i=0;i<180;i++)sim.step(neutralInput());
  sim.player.x=-4;sim.dummy.x=5;
  for(let i=0;i<30;i++)sim.step({...neutralInput(),shield:true},{...neutralInput(),smash:i===0});
  assert.ok(sim.lastHit?.blocked);assert.equal(sim.player.damage,0);assert.ok(sim.player.shield<55);
});

test('Pikachu CPU battles finish against each of the other three fighters deterministically',()=>{
  for(const id of ['mario','link','kirby']){
    const other=load(id),run=()=>{
      const sim=new Simulation(other.data,other.poses,{mode:'battle',opponent:'cpu'},pika);
      while(sim.status!=='finished'&&sim.frame<11000){sim.step(neutralInput());assert.equal(sim.error,null);}
      assert.equal(sim.status,'finished');assert.ok(sim.hits>0);return sim.hash();
    };
    assert.equal(run(),run());
  }
});
