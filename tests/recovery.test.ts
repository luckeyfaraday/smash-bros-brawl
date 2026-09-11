import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';
import {Poses} from '../src/pose';
import {ScriptVM} from '../src/script';
import {RECOVERY_RULES} from '../src/fighter';
import {neutralInput,type FighterData,type MotionData,type Command} from '../src/types';
import {attackTimeline} from '../src/moves';
const assets=Object.fromEntries(['mario','link','kirby','pikachu'].map(id=>[id,{data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')) as MotionData)}]));
const make=(id='mario',battle=false)=>new Simulation(assets[id].data,assets[id].poses,battle?{mode:'battle',opponent:'local'}:{});
const idle=(s:Simulation,n:number)=>{for(let i=0;i<n;i++)s.step(neutralInput());};
const air=(s:Simulation,x=0,y=70)=>Object.assign(s.player,{x,y,vx:0,vy:-1,grounded:false,state:'air',clip:'Fall',jumps:2});
const special=()=>({...neutralInput(),special:true});
const command=(id:string,value?:number):Command=>({id,name:id,offset:0,params:value===undefined?[]:[{type:0,raw:value,value}]});

test('Mario source pulses, intangibility and ledge modes survive finite loops and resolved air goto',()=>{
 for(const name of ['SpecialHi','SpecialAirHi']){
  const vm=new ScriptVM(assets.mario.data.moves[name].commands),pulses:number[]=[];let previous=-1;
  for(let frame=0;frame<38;frame++){
   vm.advance(frame);assert.equal(vm.error,null);
   if(vm.hitboxes.size&&vm.hitboxEpoch!==previous){pulses.push(frame);previous=vm.hitboxEpoch;}
   assert.equal(vm.hurtState,frame>=2&&frame<6?2:0);
   assert.equal(vm.ledgeGrab,frame<9?0:frame<15?1:2);
  }
  assert.deepEqual(pulses,[2,7,8,9,11,13]);assert.equal(vm.hitboxes.size,0);
 }
 const raw=(assets.mario.data.moves.SpecialHi as any).originalCommands as Command[];
 assert.ok(raw.some(c=>c.id==='0900'));
 const unadapted=new ScriptVM(raw);unadapted.advance(2);assert.match(unadapted.error!,/Unsupported command 0900/);
 const changed=new ScriptVM([command('DEAD')]);changed.advance(0);assert.ok(changed.error);
});

test('finite nested loops retain their clock and reject malformed or unbounded control flow',()=>{
 const vm=new ScriptVM([command('0004',2),command('0004',3),command('0001',1),command('0005'),command('0005'),command('6400')]);
 vm.advance(5);assert.equal(vm.interruptible,false);const before=vm.snapshot();
 vm.advance(6);assert.equal(vm.interruptible,true);assert.equal(vm.error,null);assert.notDeepEqual(before,vm.snapshot());
 for(const commands of [[command('0004',-1)],[command('0004',0)],[command('0004',2)],[command('0005')]]){
  const bad=new ScriptVM(commands);bad.advance(100);assert.ok(bad.error);assert.equal(bad.hitboxes.size,0);
 }
});

test('Mario aerial recovery transfers the source path once, mirrored in both directions',()=>{
 for(const facing of [-1,1]){
  const s=make();air(s);s.dummy.x=-70;s.player.facing=facing;
  const root=assets.mario.poses.motion.clips.SpecialAirHi.rootMotion!;
  for(let age=0;age<38;age++){
   s.step({...neutralInput(),special:age===0});
   assert.equal(s.player.clip,'SpecialAirHi');assert.ok(Math.abs(s.player.y-(70+root[age][1]))<1e-10);
   assert.ok(Math.abs(s.player.x-root[age][2]*facing)<1e-10);
   assert.deepEqual(assets.mario.poses.root('SpecialAirHi',age,facing),{x:0,y:0,z:facing===1?-0:0});
  }
  s.step(neutralInput());assert.equal(s.player.state,'fallSpecial');assert.equal(s.player.clip,'FallSpecial');assert.equal(s.script,null);
 }
});

test('Mario carries a nearby opponent through separate pulses and a finisher while hitlag freezes the path',()=>{
 for(const side of [-1,1]){
  const s=make();s.player.x=-7*side;s.dummy.x=5*side;s.player.facing=side;const hits:number[]=[];
  for(let i=0;i<80;i++){
   const before=s.hits,old={x:s.player.x,y:s.player.y,age:s.player.age},frozen=s.player.hitlag>0;
   s.step({...neutralInput(),special:i===0});
   if(frozen)assert.deepEqual({x:s.player.x,y:s.player.y,age:s.player.age},old);
   if(s.hits>before)hits.push(s.lastHit!.damage);
  }
  assert.deepEqual(hits,[5,1,1,1,1,3]);assert.equal(s.dummy.damage,12);
  assert.equal(s.error,null);
 }
});

test('Link plays the ground wind-up and an uncharged spin, while aerial spin has five source hit phases',()=>{
 const s=make('link');s.step(special());assert.equal(s.player.clip,'SpecialHiStart');
 idle(s,7);assert.equal(s.player.clip,'SpecialHiStart');assert.equal(s.hits,0);
 idle(s,4);assert.equal(s.player.clip,'SpecialHi');assert.equal(s.lastHit?.damage,12);assert.equal(s.player.grounded,true);
 idle(s,110);assert.equal(s.player.state,'idle');assert.equal(s.hits,1);
 const timeline=attackTimeline(assets.link.data,assets.link.poses.motion,'SpecialAirHi');
 assert.deepEqual(timeline.filter(f=>f.active).map(f=>f.frame),[7,8,9,15,16,17,21,22,23,30,31,32,46,47,48,49,50]);
});

test('recovery blocks repeated specials, air jumps and attacks until landing recovery ends',()=>{
 for(const id of ['mario','link']){
  const s=make(id);air(s,0,100);s.dummy.x=-70;s.player.jumps=1;
  s.step(special());let falls=0,landing=0,maxAge=0;
  for(let n=0;n<200&&s.player.state!=='idle';n++){
   const before=s.player.state;
   s.step({...neutralInput(),special:n%2===0,jump:n%2===0,attack:n%2===0,smash:n%2===0});
   if(s.player.state==='fallSpecial'){falls++;assert.equal(s.player.clip,'FallSpecial');assert.equal(s.player.jumps,1);}
   if(s.player.state==='landing'){landing++;maxAge=Math.max(maxAge,s.player.age);assert.equal(s.player.clip,'LandingFallSpecial');}
   if(before==='fallSpecial')assert.notEqual(s.player.state,'special');
  }
  assert.ok(falls>0);assert.equal(landing,RECOVERY_RULES.landing);assert.equal(maxAge,RECOVERY_RULES.landing-1);
  assert.equal(s.player.grounded,true);assert.equal(s.player.jumps,0);assert.equal(s.error,null);
  s.step(neutralInput());s.step(special());assert.equal(s.player.state,'special');
 }
});

test('both fighters can recover from below the ledge and their rising moves stop at the underside',()=>{
 for(const id of ['mario','link'])for(const side of [-1,1]){
  const s=make(id);air(s,(STAGE.right+13)*side,-29);s.player.facing=-side;s.dummy.x=-60*side;
  let returned=false;
  for(let n=0;n<150;n++){s.step({...neutralInput(),special:n===0,axis:-side});returned||=s.player.grounded||s.player.ledgeSide!==0;assert.equal(s.error,null);}
  assert.equal(returned,true,`${id} ${side} must return`);
  const blocked=make(id);air(blocked,55*side,-70);blocked.dummy.x=-60*side;blocked.player.facing=side;
  let contacts=0;
  for(let n=0;n<30;n++){
   blocked.step({...neutralInput(),special:n===0});contacts+=blocked.actors[0].stageContacts.filter(c=>c.plane.type==='Ceiling').length;
   assert.equal(blocked.player.grounded,false);assert.ok(blocked.player.y<0);assert.equal(blocked.player.jumps,2);
  }
  assert.ok(contacts>0,`${id} must encounter the solid underside`);
 }
});

test('source ledge flags gate rising catches and facing before allowing either side',()=>{
 for(const [id,age] of [['mario',9],['link',18]] as const){
  const s=make(id);air(s,STAGE.right+4,-10);s.player.facing=1;s.dummy.x=-70;
  s.step(special());assert.equal(s.player.state,'special');assert.equal(s.player.ledgeSide,0);
  // Place at the catch region to isolate the original script's flag and facing.
  Object.assign(s.player,{x:STAGE.right+4,y:-10,age:age-1,vy:.5});s.step(neutralInput());assert.equal(s.player.ledgeSide,0);
  Object.assign(s.player,{x:STAGE.right+4,y:-10,age:age-1,vy:.5,facing:-1});s.step(neutralInput());
  assert.equal(s.player.state,'ledgeCatch');assert.equal(s.player.jumps,0);assert.equal(s.script,null);
 }
});

test('Mario is intangible only during the source opening window and can be hit during helpless fall',()=>{
 const s=make('mario',true);idle(s,180);s.player.x=0;s.dummy.x=10;s.dummy.facing=-1;
 s.step(special());s.step(neutralInput(),{...neutralInput(),attack:true});s.step(neutralInput());
 assert.equal(s.script?.hurtState,2);assert.equal(s.player.damage,0);assert.equal(s.dummy.damage,5);
 // The same simultaneous attacks trade when only the source intangible event
 // is disabled, proving this checks a real overlapping attack.
 const normal=structuredClone(assets.mario.data);
 normal.moves.SpecialHi.commands=normal.moves.SpecialHi.commands.filter(c=>c.id!=='0605');
 const control=new Simulation(normal,assets.mario.poses,{mode:'battle',opponent:'local'});idle(control,180);
 control.player.x=0;control.dummy.x=10;control.dummy.facing=-1;
 control.step(special());control.step(neutralInput(),{...neutralInput(),attack:true});control.step(neutralInput());
 assert.equal(control.player.damage,3);assert.equal(control.dummy.damage,5);
 const vulnerable=make('mario',true);idle(vulnerable,180);
 Object.assign(vulnerable.player,{x:0,y:1,grounded:false,state:'fallSpecial',clip:'FallSpecial'});vulnerable.dummy.x=10;vulnerable.dummy.facing=-1;
 vulnerable.step(neutralInput(),{...neutralInput(),attack:true});vulnerable.step(neutralInput());assert.ok(vulnerable.player.damage>0);
});
