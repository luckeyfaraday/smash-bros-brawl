import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';
import {Poses} from '../src/pose';
import {neutralInput,type FighterData,type MotionData} from '../src/types';
import {stageBody,moveAgainstStage,clipStageVelocity,STAGE_PLANES,type Vec2,type StagePlane} from '../src/stage-contact';
const assets=['mario','link','kirby','pikachu'].map(id=>({id,data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,
  poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')) as MotionData)}));
const dot=(a:Vec2,b:Vec2)=>a.x*b.x+a.y*b.y;
const smallBody=[{x:0,y:0},{x:2,y:3},{x:0,y:6},{x:-2,y:3}];

test('all four stage bodies use their own native bone lists and follow their animations',()=>{
  assert.deepEqual(assets.map(a=>a.data.environment[0].bones.length),[7,6,5,6]);
  for(const {data,poses} of assets){
    assert.equal(data.environment.length,1);
    for(const clip of Object.keys(poses.motion.clips))for(const facing of [-1,1]){
      const body=stageBody(data,poses,clip,Math.floor(poses.motion.clips[clip].count/2),facing);
      assert.ok(body.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));assert.deepEqual(body[0],{x:0,y:0});
      assert.ok(body[1].x-body[3].x>=data.environment[0].minWidth);
    }
    assert.notDeepEqual(stageBody(data,poses,'Wait1',0,1),stageBody(data,poses,'AttackAirN',12,1));
  }
});

test('each original floor, wall and ceiling blocks a fast approach from its solid-facing exterior',()=>{
  assert.equal(STAGE_PLANES.length,17);
  for(const plane of STAGE_PLANES){
    const mid={x:(plane.a.x+plane.b.x)/2,y:(plane.a.y+plane.b.y)/2-3};
    const start={x:mid.x+plane.normal.x*80,y:mid.y+plane.normal.y*80};
    const desired={x:mid.x-plane.normal.x*80,y:mid.y-plane.normal.y*80};
    const r=moveAgainstStage(start,desired,smallBody,[plane]);
    assert.ok(r.contacts.length>0,`missed ${plane.index} ${plane.type}`);
    const clearance=Math.min(...smallBody.map(p=>dot({x:r.position.x+p.x-plane.a.x,y:r.position.y+p.y-plane.a.y},plane.normal)));
    assert.ok(clearance>=-1e-6,`${plane.index}: penetrated by ${clearance}`);
  }
});

test('a short stage segment hits the diamond edge even when every body-point path misses it',()=>{
  const plane:StagePlane={index:99,type:'LeftWall',a:{x:0,y:1},b:{x:0,y:2},normal:{x:-1,y:0}};
  const body=[{x:0,y:0},{x:3,y:5},{x:0,y:10},{x:-3,y:5}];
  const r=moveAgainstStage({x:-10,y:0},{x:1,y:0},body,[plane]);
  assert.ok(r.contacts.length>0);assert.ok(r.position.x<1||r.position.y<0);
});

test('fast motion cannot cross the full stage and a jump into the center seam does not launch sideways',()=>{
  for(const {data,poses} of assets){
    const body=stageBody(data,poses,'Fall',0,1);
    const below=moveAgainstStage({x:0,y:-90},{x:0,y:30},body);
    assert.ok(below.contacts.some(c=>c.plane.type==='Ceiling'));assert.ok(below.position.y<-30);
    assert.ok(Math.abs(below.position.x)<.00001);assert.deepEqual(clipStageVelocity({x:0,y:120},below.contacts),{x:0,y:0});
    for(const side of [-1,1]){
      const r=moveAgainstStage({x:side*150,y:-22},{x:side*40,y:-22},body);
      assert.ok(r.contacts.length>0);assert.ok(r.position.y<-25||Math.abs(r.position.x)>70);
    }
  }
});

test('air jumps beneath Final Destination stop at the underside without restoring spent jumps',()=>{
  for(const {data,poses} of assets){
    const sim=new Simulation(data,poses);Object.assign(sim.player,{x:0,y:-50,vy:2,grounded:false,state:'air',clip:'Fall',jumps:1});
    let hit=false;
    for(let i=0;i<30;i++){
      sim.step({...neutralInput(),jump:i===0});
      if(sim.actors[0].stageContacts.some(c=>c.plane.type==='Ceiling')){hit=true;assert.ok(sim.player.vy<=0);assert.equal(sim.player.grounded,false);break;}
    }
    assert.equal(hit,true,data.id??'fighter');assert.equal(sim.player.jumps,2);assert.ok(sim.player.y<-30);
    sim.step(neutralInput());assert.ok(sim.player.vy<0);
  }
});

test('touching the platform from below never teleports a fighter onto the floor',()=>{
  const {data,poses}=assets[1];
  for(const side of [-1,1]){
    const sim=new Simulation(data,poses);Object.assign(sim.player,{x:side*(STAGE.right+2),y:-6,vy:-.1,grounded:false,state:'air',clip:'Fall'});
    sim.step({...neutralInput(),down:true});assert.equal(sim.player.grounded,false);assert.ok(sim.player.y<0);
    assert.ok(Math.abs(sim.player.x)>STAGE.right);assert.equal(sim.player.ledgeSide,0);
  }
});

test('sliding contacts remove inward velocity but leave outward motion and free air movement available',()=>{
  const wall=STAGE_PLANES.find(p=>p.type==='RightWall')!;
  const contact=[{plane:wall,normal:wall.normal}];
  assert.deepEqual(clipStageVelocity({x:-4,y:2},contact),{x:0,y:2});
  assert.deepEqual(clipStageVelocity({x:4,y:2},contact),{x:4,y:2});
  const desired={x:180.15,y:24.7};assert.deepEqual(moveAgainstStage({x:160,y:30},desired,smallBody).position,desired);
});

test('running across the three floor pieces stays level until walking off either edge',()=>{
  for(const {data,poses} of assets)for(const side of [-1,1]){
    const sim=new Simulation(data,poses);sim.player.x=0;
    let fell=false;
    for(let i=0;i<200;i++){
      sim.step({...neutralInput(),axis:side,run:true,down:true});
      if(!sim.player.grounded){assert.ok(Math.abs(sim.player.x)>STAGE.right);assert.ok(sim.player.y<0);fell=true;break;}
      assert.equal(sim.player.y,0);assert.equal(sim.player.vy,0);
    }
    assert.equal(fell,true);
  }
});
