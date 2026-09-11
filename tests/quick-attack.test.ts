import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';import {Poses,sphereCapsule,sweptSphereCapsule} from '../src/pose';
import {neutralInput,type FighterData,type MotionData,type Input} from '../src/types';import {ScriptVM} from '../src/script';
import {QUICK_ATTACK_RULES,quickDirection,canRedirect} from '../src/quick-attack';import {cpuInput} from '../src/cpu';
const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')) as MotionData)});
const pika=load('pikachu'),mario=load('mario');const make=()=>new Simulation(pika.data,pika.poses,{fighters:['pikachu','mario']},mario);
function steps(s:Simulation,n:number,input:Partial<Input>={}){for(let i=0;i<n;i++){s.step({...neutralInput(),...input});assert.equal(s.error,null);}}
function midair(s:Simulation,x=0,y=80){Object.assign(s.player,{x,y,vy:-1,grounded:false,state:'air',clip:'Fall',jumps:2});s.dummy.x=-100;}

test('Quick Attack preserves the original action hit branches and end counter timing',()=>{
 assert.equal(pika.data.quickAttack!.bursts.length,2);
 for(const [n,burst] of pika.data.quickAttack!.bursts.entries()){
  const vm=new ScriptVM(burst.commands);vm.advance(0);assert.equal(vm.error,null);
  const h=vm.hitboxes.get(0)!;assert.equal(h.damage,n===0?3:2);assert.equal(h.bone,32);assert.equal(h.radius,1.6);assert.equal(h.angle,0);assert.equal(h.growth,40);assert.equal(h.base,8);
 }
 for(const name of ['SpecialHiEnd','SpecialAirHiEnd']){
  const vm=new ScriptVM(pika.data.moves[name].commands);vm.advance(8);assert.equal(vm.integers.has(QUICK_ATTACK_RULES.endCounter),false);
  vm.advance(9);assert.equal(vm.integers.get(QUICK_ATTACK_RULES.endCounter),1);vm.advance(40);assert.equal(vm.integers.get(QUICK_ATTACK_RULES.endCounter),1);assert.equal(vm.error,null);
 }
});

test('all eight keyboard directions and analogue angles travel equal distances, with neutral defaulting up',()=>{
 for(const [axis,vertical] of [[0,1],[1,1],[1,0],[1,-1],[0,-1],[-1,-1],[-1,0],[-1,1],[.3,.9],[0,0]]){
  const s=make();midair(s);const input={axis,vertical};steps(s,1,{...input,special:true});steps(s,24,input);
  const direction=quickDirection({...neutralInput(),...input},true)!;
  assert.ok(Math.abs(s.player.x-direction.x*40)<1e-10);assert.ok(Math.abs(s.player.y-80-direction.y*40)<1e-10);
  assert.equal(s.actors[0].quickAttack?.phase,'burst');assert.equal(s.actors[0].quickAttack?.burst,1);
 }
 assert.equal(quickDirection(neutralInput()),null);assert.equal(canRedirect({x:0,y:1},{x:0,y:1}),false);
 assert.equal(canRedirect({x:0,y:1},{x:.1,y:.995}),false);assert.equal(canRedirect({x:0,y:1},{x:1,y:0}),true);
});

test('a new direction selects the second burst at the source counter; repeated or neutral input ends after one',()=>{
 for(const redirect of [true,false,'neutral'] as const){
  const s=make();midair(s);steps(s,1,{special:true,vertical:1});steps(s,24,{vertical:1});
  steps(s,9,{axis:redirect===true?1:0,vertical:redirect===false?1:0});assert.equal(s.actors[0].quickAttack?.phase,'turn');
  steps(s,1,{axis:redirect===true?1:0,vertical:redirect===false?1:0});
  assert.equal(s.actors[0].quickAttack?.burst,redirect===true?2:1);
  assert.equal(s.actors[0].quickAttack?.phase,redirect===true?'burst':'end');
  if(redirect===true){assert.equal(s.script!.hitboxes.get(0)!.damage,2);steps(s,9,{axis:-1,vertical:-1,special:true});assert.equal(s.player.x,40);assert.equal(s.player.y,120);}
 }
});

test('burst direction stays locked, hitlag freezes movement, and recovery cannot be repeated or cancelled',()=>{
 const s=make();midair(s);steps(s,1,{special:true,vertical:1});steps(s,15,{vertical:1});
 const original=s.snapshot();s.player.hitlag=3;const frozen={x:s.player.x,y:s.player.y,age:s.player.age};
 steps(s,3,{axis:1,jump:true,attack:true,special:true});assert.deepEqual({x:s.player.x,y:s.player.y,age:s.player.age},frozen);
 steps(s,9,{axis:1,jump:true,attack:true,special:true});assert.equal(s.player.x,0);assert.equal(s.player.y,120);
 assert.notDeepEqual(s.snapshot().quickAttack!.trail,original.quickAttack!.trail);assert.equal(original.quickAttack!.trail.length,2);
 steps(s,10,{axis:1});assert.equal(s.actors[0].quickAttack?.burst,2);
 for(let n=0;n<80;n++){steps(s,1,{axis:0,vertical:n%2?1:-1,jump:n%2===0,attack:n%2===0,special:n%2===0});assert.ok(!s.actors[0].quickAttack||s.actors[0].quickAttack.burst<=2);}
 assert.equal(s.player.state,'fallSpecial');assert.equal(s.player.jumps,2);assert.equal(s.script,null);
});

test('the swept attack path detects thin capsules between endpoints, including depth and degenerate cases',()=>{
 const from={x:-10,y:5,z:0},to={x:10,y:5,z:0},a={x:0,y:2,z:0},b={x:0,y:8,z:0};
 assert.equal(sphereCapsule(from,1,a,b,1),false);assert.equal(sphereCapsule(to,1,a,b,1),false);
 assert.equal(sweptSphereCapsule(from,to,1,a,b,1),true);
 assert.equal(sweptSphereCapsule({...from,z:4},{...to,z:4},1,a,b,1),false);
 assert.equal(sweptSphereCapsule(a,a,0,a,a,0),true);
 assert.equal(sweptSphereCapsule(from,to,1,{x:0,y:5,z:0},{x:0,y:5,z:0},0),true);
 assert.equal(sweptSphereCapsule(from,to,1,{x:15,y:5,z:0},{x:20,y:5,z:0},1),false);
});

test('a moving burst hits once, can be shielded, and does not continue through the underside',()=>{
 const s=make();s.player.x=-30;s.dummy.x=-5;
 steps(s,1,{special:true,axis:1});steps(s,30,{axis:1});assert.equal(s.hits,1);assert.equal(s.dummy.damage,3);
 const blocked=new Simulation(pika.data,pika.poses,{mode:'battle',opponent:'local',fighters:['pikachu','mario']},mario);steps(blocked,180);blocked.player.x=-30;blocked.dummy.x=-5;
 for(let n=0;n<38;n++)blocked.step({...neutralInput(),special:n===0,axis:1},{...neutralInput(),shield:true});
 assert.equal(blocked.dummy.damage,0);assert.equal(blocked.lastHit?.blocked,true);assert.ok(blocked.dummy.shield<55);
 for(const side of [-1,1]){
  const roof=make();midair(roof,55*side,-60);steps(roof,1,{special:true,vertical:1});let wall=false;
  for(let n=0;n<30;n++){steps(roof,1,{vertical:1});wall||=roof.actors[0].stageContacts.some(c=>c.plane.type==='Ceiling');assert.ok(roof.player.y<0);assert.equal(roof.player.grounded,false);}
  assert.equal(wall,true);assert.equal(roof.actors[0].quickAttack?.burst,1);
 }
});

test('two aimed bursts return from offstage on either side, and landing restores actions only after recovery',()=>{
 for(const side of [-1,1]){
  const s=make();midair(s,(STAGE.right+30)*side,-30);s.dummy.x=-50*side;
  steps(s,1,{special:true,vertical:1});steps(s,24,{vertical:1});steps(s,19,{axis:-side});
  assert.equal(s.actors[0].quickAttack?.burst,2);assert.ok(Math.abs(s.player.x)<STAGE.right);assert.equal(s.player.y,10);
  let landed=0;for(let n=0;n<100;n++){steps(s,1);if(s.player.state==='landing')landed++;}
  assert.equal(s.player.grounded,true);assert.equal(s.player.jumps,0);assert.equal(s.player.state,'idle');assert.equal(landed,QUICK_ATTACK_RULES.landing);
  steps(s,1,{special:true});assert.equal(s.actors[0].quickAttack?.phase,'start');
 }
});

test('CPU aims upward then changes toward the stage using the same Quick Attack controls',()=>{
 const s=make();midair(s,120,-30);const self=s.actors[0],other=s.actors[1];
 const start=cpuInput(self,other,0);assert.equal(start.special,true);assert.equal(start.vertical,1);assert.equal(start.axis,0);
 for(let n=0;n<140;n++){s.step(cpuInput(self,other,n));assert.equal(s.error,null);}
 assert.ok(s.player.grounded||s.player.ledgeSide!==0);assert.ok(Math.abs(s.player.x)<STAGE.right+1);
});
