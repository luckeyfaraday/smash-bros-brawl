import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation, STAGE } from '../src/simulation';
import { Poses, sphereCapsule } from '../src/pose';
import { ScriptVM } from '../src/script';
import { neutralInput, type FighterData, type MotionData, type Command } from '../src/types';

const data:FighterData=JSON.parse(readFileSync('public/assets/mario/data.json','utf8'));
const motion:MotionData=JSON.parse(readFileSync('public/assets/mario/motion.json','utf8'));
const make=()=>new Simulation(data,new Poses(motion));

test('the raw Mario jab script spawns three hitboxes at 1, clears at 3, and allows interruption at 15',()=>{
  const vm=new ScriptVM(data.moves.Attack11.commands);
  vm.advance(0);assert.equal(vm.hitboxes.size,0);
  vm.advance(1);assert.equal(vm.hitboxes.size,3);
  assert.equal(vm.hitboxes.get(0)?.damage,3);
  vm.advance(2);assert.equal(vm.hitboxes.size,3);
  vm.advance(3);assert.equal(vm.hitboxes.size,0);
  vm.advance(14);assert.equal(vm.interruptible,false);
  vm.advance(15);assert.equal(vm.interruptible,true);assert.equal(vm.error,null);
});
test('unsupported gameplay commands fail closed',()=>{
  const vm=new ScriptVM([{id:'DEAD',name:'unknown',offset:8,params:[]}]);
  vm.advance(0);assert.match(vm.error!,/Unsupported command/);assert.equal(vm.hitboxes.size,0);
});
test('subroutines share the calling clock and can execute more than once',()=>{
  const timer=(id:string,n:number):Command=>({id,name:'timer',offset:0,params:[{type:1,value:n,raw:n*60000}]});
  const commands:Command[]=[timer('0002',5),{id:'0007',name:'call',offset:0,params:[],children:[timer('0001',2)]},
    {id:'6400',name:'interrupt',offset:0,params:[]}];
  const vm=new ScriptVM(commands);vm.advance(6);assert.equal(vm.interruptible,false);
  vm.advance(7);assert.equal(vm.interruptible,true);
});
test('jump squat, short hop, double jump limit, gravity and landing behave consistently',()=>{
  const full=make();full.step({...neutralInput(),jump:true});
  for(let i=0;i<4;i++)full.step({...neutralInput(),jump:true});
  assert.equal(full.player.grounded,true);
  full.step({...neutralInput(),jump:true});assert.equal(full.player.grounded,false);
  const short=make();short.step({...neutralInput(),jump:true});for(let i=0;i<5;i++)short.step(neutralInput());
  assert.ok(short.player.vy<full.player.vy);
  full.step(neutralInput());full.step({...neutralInput(),jump:true});assert.equal(full.player.jumps,2);
  full.step(neutralInput());const before=full.player.vy;
  full.step({...neutralInput(),jump:true});assert.equal(full.player.jumps,2);assert.ok(full.player.vy<before);
  for(let i=0;i<120;i++)full.step(neutralInput());
  assert.equal(full.player.grounded,true);assert.equal(full.player.y,0);assert.equal(full.player.jumps,0);
});
test('a connected jab damages once, freezes both fighters, then clears its hitboxes',()=>{
  const sim=make();sim.player.x=-6;
  sim.step({...neutralInput(),attack:true});
  sim.step(neutralInput());
  assert.equal(sim.hits,1);assert.equal(sim.dummy.damage,3);
  assert.ok(sim.player.hitlag>0);assert.equal(sim.player.hitlag,sim.dummy.hitlag);
  const pose=sim.player.poseFrame;
  sim.step(neutralInput());assert.equal(sim.player.poseFrame,pose);
  for(let i=0;i<25;i++)sim.step(neutralInput());
  assert.equal(sim.dummy.damage,3);assert.equal(sim.hits,1);
  assert.ok(!sim.script || sim.script.hitboxes.size===0);
});
test('out-of-range jab misses',()=>{
  const sim=make();sim.player.x=-40;sim.step({...neutralInput(),attack:true});
  for(let i=0;i<25;i++)sim.step(neutralInput());assert.equal(sim.hits,0);
});
test('leaving the platform cancels the ground jab without leaving stale hitboxes',()=>{
  const sim=make();sim.player.x=STAGE.right-1;sim.player.vx=.5;
  sim.step({...neutralInput(),attack:true});sim.step(neutralInput());
  for(let i=0;i<8;i++)sim.step(neutralInput());
  assert.equal(sim.player.grounded,false);assert.equal(sim.script,null);
});
test('recorded inputs produce the same state at every frame',()=>{
  const a=make(),b=make();
  const tape=Array.from({length:600},(_,i)=>({...neutralInput(),axis:i<5?1:i>220&&i<245?-1:0,
    jump:i>=70&&i<85||i===100,attack:i===10||i===190||i===330,run:i<5,down:i===135}));
  for(const input of tape){a.step(input);b.step(JSON.parse(JSON.stringify(input)));assert.equal(a.hash(),b.hash());}
  assert.equal(a.frame,600);
});
test('all enabled hurtboxes and jab hitboxes resolve to finite animated bone positions',()=>{
  const poses=new Poses(motion);
  for(const h of data.hurtboxes)for(const frame of [0,1,2,15]) {
    const p=poses.point('Attack11',frame,h.bone,h.offset,1,0,0);
    assert.ok(Object.values(p).every(Number.isFinite));assert.ok(h.radius>0);
  }
  assert.equal(data.hurtboxes.length,10);
});
test('locomotion clips stay in place so animation does not double simulation movement',()=>{
  const root=motion.bones.findIndex(b=>b.name==='TransN')*16;
  for(const name of ['Run','WalkSlow','WalkMiddle','WalkFast','Dash'])
    for(const frame of motion.clips[name].frames)
      assert.deepEqual(frame.slice(root+12,root+15),[0,0,0]);
});
test('sphere-capsule collision respects depth and capsule endpoints',()=>{
  const a={x:0,y:0,z:0},b={x:0,y:5,z:0};
  assert.equal(sphereCapsule({x:1,y:6,z:0},1,a,b,1),true);
  assert.equal(sphereCapsule({x:0,y:2,z:5},1,a,b,1),false);
});
