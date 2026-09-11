import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Simulation, STAGE } from '../src/simulation';
import { STAGE_SOURCE } from '../src/stage';
import { Poses } from '../src/pose';
import { neutralInput } from '../src/types';

const data=JSON.parse(readFileSync('public/assets/mario/data.json','utf8'));
const poses=new Poses(JSON.parse(readFileSync('public/assets/mario/motion.json','utf8')));

test('Final Destination uses the source floor, both ledges and translated blast bounds',()=>{
  assert.equal(STAGE_SOURCE.planes.length,17);
  assert.deepEqual([STAGE.left,STAGE.right],[-86.876,86.876]);
  assert.equal(STAGE.floor,0);assert.equal(STAGE.sourceFloor,.64);
  assert.equal(STAGE.blastX,240);
  assert.equal(STAGE.blastBottom,-115.64);assert.equal(STAGE.blastTop,179.36);
  const exported=JSON.parse(readFileSync('public/assets/final-destination/stage.json','utf8'));
  assert.deepEqual(exported,STAGE_SOURCE);
});

test('fighters can stand beyond the old training box and fall off either original edge',()=>{
  for(const side of [-1,1]) {
    const sim=new Simulation(data,poses);sim.player.x=70*side;
    sim.step(neutralInput());assert.equal(sim.player.grounded,true);
    sim.player.x=(STAGE.right-.01)*side;sim.player.vx=side;
    sim.step({...neutralInput(),axis:side});
    assert.equal(sim.player.grounded,false);assert.ok(sim.player.y<0);
    assert.equal(sim.player.jumps,1);
  }
});

test('descending fighters land at the floor edge but not outside it',()=>{
  for(const side of [-1,1])for(const outside of [false,true]) {
    const sim=new Simulation(data,poses);
    Object.assign(sim.player,{x:side*(STAGE.right+(outside?1:-1)),y:.1,vy:-1,grounded:false,state:'air',clip:'Fall'});
    sim.step(neutralInput());assert.equal(sim.player.grounded,!outside);
    if(!outside)assert.equal(sim.player.y,0);
  }
});

test('all four source blast boundaries reset damage and clear the active move',()=>{
  for(const point of [{x:-241,y:10},{x:241,y:10},{x:0,y:-117},{x:0,y:181}]) {
    const sim=new Simulation(data,poses);
    Object.assign(sim.player,{...point,damage:55,grounded:false,state:'air',clip:'Fall'});
    sim.step({...neutralInput(),attack:true});
    assert.equal(sim.player.x,-12);assert.equal(sim.player.y,0);assert.equal(sim.player.damage,0);
    assert.equal(sim.script,null);assert.equal(sim.comboQueued,false);
  }
});
