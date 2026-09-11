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
const kirby=load('kirby'),mario=load('mario'),link=load('link');
const make=()=>new Simulation(kirby.data,kirby.poses,{fighters:['kirby','mario']},mario);

test('Kirby bone aliases resolve the original hurtboxes and special jab hitboxes',()=>{
  assert.equal(kirby.poses.motion.bones.length,61);assert.equal(kirby.data.hurtboxes.length,7);
  assert.deepEqual(kirby.poses.point('Wait1',0,409,[0,0,0],1,0,0),kirby.poses.point('Wait1',0,9,[0,0,0],1,0,0));
  for(const name of Object.keys(kirby.data.moves)){
    const vm=new ScriptVM(kirby.data.moves[name].commands);
    for(const frame of attackTimeline(kirby.data,kirby.poses.motion,name as Attack)){
      vm.advance(frame.frame);assert.equal(vm.error,null);
      for(const h of [...vm.hitboxes.values(),...kirby.data.hurtboxes])for(const facing of [-1,1])
        assert.ok(Object.values(kirby.poses.point(name,frame.frame,h.bone,h.offset,facing,0,0)).every(Number.isFinite));
    }
  }
  const bad=structuredClone(kirby.data.moves.Attack11.commands);
  bad.find(c=>c.id==='0615')!.params[13].raw=5;
  const vm=new ScriptVM(bad);vm.advance(2);assert.match(vm.error!,/Unsupported special hitbox/);
});

test('five air jumps use their native velocities and poses; held jump cannot consume the next one',()=>{
  const sim=make();for(let i=0;i<5;i++)sim.step({...neutralInput(),jump:true});assert.equal(sim.player.jumps,1);
  for(let i=0;i<5;i++){
    sim.step(neutralInput());sim.step({...neutralInput(),jump:true});
    assert.equal(sim.player.jumps,i+2);assert.equal(sim.player.vy,kirby.data.airJumps![i]-sim.a.Gravity);
    assert.equal(sim.player.clip,i===0?'JumpAerialF':`JumpAerialF${i+1}`);
    sim.step({...neutralInput(),jump:true});assert.equal(sim.player.jumps,i+2);
  }
  const before=sim.player.vy;sim.step(neutralInput());sim.step({...neutralInput(),jump:true});
  assert.equal(sim.player.jumps,6);assert.ok(sim.player.vy<before);
  for(let i=0;i<180&&!sim.player.grounded;i++)sim.step(neutralInput());
  assert.equal(sim.player.grounded,true);assert.equal(sim.player.jumps,0);
});

test('being launched from the ground does not grant an extra air jump',()=>{
  for(const asset of [kirby,mario]){
    const sim=new Simulation(asset.data,asset.poses);Object.assign(sim.player,{grounded:false,y:10,state:'air',clip:'Fall',jumps:0});
    for(let i=0;i<asset.data.attributes.Jumps+1;i++){
      sim.step({...neutralInput(),jump:true});sim.step(neutralInput());
    }
    assert.equal(sim.player.jumps,asset.data.attributes.Jumps);
  }
});

test('two jabs lead into repeating rapid punches, then release leaves a usable fighter',()=>{
  const sim=make(),clips=new Set<string>(),hits:{move:string;damage:number}[]=[];
  for(let i=0;i<140;i++){
    sim.step({...neutralInput(),attack:i<110});clips.add(sim.player.clip);assert.equal(sim.error,null);
    if(sim.lastHit?.frame===sim.frame)hits.push({move:sim.lastHit.move,damage:sim.lastHit.damage});
  }
  assert.deepEqual(hits.slice(0,2),[{move:'Attack11',damage:2},{move:'Attack12',damage:3}]);
  assert.ok(clips.has('Attack100Start')&&clips.has('Attack100'));assert.ok(!clips.has('Attack13'));
  assert.ok(hits.filter(h=>h.move==='Attack100').length>=5);assert.equal(sim.player.state,'idle');
  sim.step({...neutralInput(),jump:true});assert.equal(sim.player.state,'jumpSquat');
});

test('Kirby smash and neutral aerial retain their original early and late hit phases',()=>{
  const smash=attackTimeline(kirby.data,kirby.poses.motion,'AttackS4S');
  assert.equal(smash[7].damage,15);assert.equal(smash[12].damage,13);assert.equal(smash[17].active,false);
  const air=attackTimeline(kirby.data,kirby.poses.motion,'AttackAirN');
  assert.deepEqual([air[9].damage,air[11].damage,air[15].damage,air[20].damage],[12,10,8,6]);
  assert.equal(air[34].active,false);assert.equal(air[55].landingLag,false);
  const sim=make();sim.step({...neutralInput(),smash:true});for(let i=0;i<kirby.poses.motion.clips.AttackS4Start.count+8;i++)sim.step(neutralInput());
  assert.ok(sim.player.x>-12);assert.equal(sim.lastHit?.damage,15);assert.ok(Math.abs(kirby.poses.root('AttackS4S',7,1).x)<.0001);
});

test('Kirby can return from either ledge with his remaining air jumps',()=>{
  for(const side of [-1,1]){
    const sim=make();Object.assign(sim.player,{x:side*(STAGE.right+2),y:-6,vy:-.1,grounded:false,state:'air',clip:'Fall',jumps:6});
    sim.step(neutralInput());assert.equal(sim.player.state,'ledgeCatch');
    for(let i=0;i<25;i++)sim.step(neutralInput());assert.equal(sim.player.state,'ledgeHang');
    sim.step({...neutralInput(),jump:true});for(let i=0;i<18;i++)sim.step(neutralInput());
    assert.equal(sim.player.state,'air');assert.equal(sim.player.jumps,1);
    sim.step({...neutralInput(),jump:true});assert.equal(sim.player.jumps,2);assert.equal(sim.player.clip,'JumpAerialF');
  }
});

test('Kirby CPU matches finish against Mario and Link without invalid states',()=>{
  for(const target of [mario,link]){
    const run=()=>{
      const sim=new Simulation(target.data,target.poses,{mode:'battle',opponent:'cpu'},kirby);
      while(sim.status!=='finished'&&sim.frame<11000){sim.step(neutralInput());assert.equal(sim.error,null);}
      assert.equal(sim.status,'finished');assert.ok(sim.hits>0);return sim.hash();
    };
    assert.equal(run(),run());
  }
});
