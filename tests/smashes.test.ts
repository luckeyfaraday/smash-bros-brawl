import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';
import {Poses} from '../src/pose';
import {neutralInput,type FighterData,type MotionData,type Input} from '../src/types';
import {smashAttack} from '../src/smash';
import {cpuInput} from '../src/cpu';
const ids=['mario','link','kirby','pikachu'] as const;
const assets=Object.fromEntries(ids.map(id=>[id,{data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')) as MotionData)}]));
const make=(id:typeof ids[number])=>new Simulation(assets[id].data,assets[id].poses,{fighters:[id,'mario']},assets.mario);
function step(s:Simulation,n=1,input:Partial<Input>={}){for(let i=0;i<n;i++){s.step({...neutralInput(),...input});assert.equal(s.error,null);}}
function charge(s:Simulation,vertical:number,amount:number){
 step(s,1,{smash:true,vertical});
 const start=s.actors[0].poses.motion.clips[s.player.clip].count;
 step(s,start-1,{smash:true});step(s,amount,{smash:true});
}

test('all twelve smashes keep their source wind-up before an uncharged release',()=>{
 for(const id of ids)for(const [vertical,move] of [[0,'AttackS4S'],[1,'AttackHi4'],[-1,'AttackLw4']] as const){
  const s=make(id);s.dummy.x=100;
  step(s,1,{smash:true,vertical});const clip=s.player.clip,count=assets[id].poses.motion.clips[clip].count;
  assert.equal(s.actors[0].smashCharge?.phase,'start');assert.equal(s.hits,0);
  step(s,count-1);assert.equal(s.player.clip,clip);assert.equal(s.player.age,count-1);
  step(s);assert.equal(s.player.clip,move);assert.deepEqual(s.actors[0].smashCharge,{phase:'release',move,charge:0});
  step(s,130);assert.equal(s.player.state,'idle');assert.equal(s.actors[0].smashCharge,null);
 }
});

test('charging locks direction and facing, stops movement, and releases automatically after sixty hold ticks',()=>{
 for(const id of ids){
  const s=make(id);s.dummy.x=100;
  step(s,1,{smash:true,axis:-1,vertical:1});const selected=s.actors[0].smashCharge!.move;
  step(s,assets[id].poses.motion.clips[s.player.clip].count-1,{smash:true});
  const x=s.player.x;step(s,60,{smash:true,axis:1,vertical:-1,jump:true,attack:true,shield:true});
  assert.equal(s.player.facing,-1);assert.equal(s.player.x,x);assert.equal(s.player.grounded,true);
  assert.deepEqual(s.actors[0].smashCharge,{phase:'hold',move:selected,charge:60});assert.equal(s.script?.hitboxes.size,0);
  step(s,1,{smash:true});assert.equal(s.player.clip,selected);assert.equal(s.actors[0].damageMultiplier(),1.4);
  step(s,140,{smash:true});assert.equal(s.player.state,'idle','held input must not start another attack');
 }
});

test('diagonal forward smashes use Mario and Kirby source angles and fall back for Link and Pikachu',()=>{
 for(const id of ids)for(const sign of [-1,1]){
  const move=smashAttack({...neutralInput(),axis:sign,vertical:sign},assets[id].data.moves);
  assert.equal(move,id==='mario'||id==='kirby'?sign>0?'AttackS4Hi':'AttackS4Lw':'AttackS4S');
  assert.equal(smashAttack({...neutralInput(),axis:.4,vertical:.9},assets[id].data.moves),'AttackHi4');
  assert.equal(smashAttack({...neutralInput(),vertical:.2,down:true},assets[id].data.moves),'AttackLw4');
 }
});

test('partial charge scales every connected hit once across all twelve attacks',()=>{
 for(const id of ids)for(const vertical of [0,1,-1]){
  const results:number[][]=[];
  for(const amount of [0,30]){
   const s=make(id);s.player.x=0;s.dummy.x=10;charge(s,vertical,amount);
   const hits:number[]=[];for(let i=0;i<160;i++){step(s);if(s.lastHit?.frame===s.frame)hits.push(s.lastHit.damage);}
   assert.ok(hits.length,`${id} ${vertical} must actually connect`);results.push(hits);
  }
  assert.equal(results[1].length,results[0].length);
  results[0].forEach((damage,i)=>assert.ok(Math.abs(results[1][i]-damage*1.2)<1e-9));
 }
});

test('Link upward slashes and Pikachu down-smash pulses keep their distinct charged hit groups',()=>{
 for(const [id,vertical,ages,damages] of [['link',1,[4,20,36],[5.6,4.2,14]],['pikachu',-1,[1,4,7,10,13,16,19],[2.8,2.8,2.8,2.8,2.8,2.8,4.2]]] as const){
  const s=make(id);s.player.x=0;s.dummy.x=10;charge(s,vertical,60);const hits:any[]=[];
  for(let i=0;i<160;i++){
   step(s);if(s.lastHit?.frame===s.frame)hits.push({age:s.player.age,damage:s.lastHit.damage});
   if(s.player.hitlag&&s.actors[0].smashCharge){
    const age=s.player.age,amount=s.actors[0].smashCharge.charge;step(s);assert.equal(s.player.age,age);assert.equal(s.actors[0].smashCharge?.charge,amount);
   }
  }
  assert.deepEqual(hits.map(h=>h.age),ages);hits.forEach((h,i)=>assert.ok(Math.abs(h.damage-damages[i])<1e-9));
 }
});

test('charge scales shield contact and cannot survive an interruption or a fall from the edge',()=>{
 const s=make('mario');s.options.mode='battle';s.options.opponent='local';s.status='playing';s.player.x=0;s.dummy.x=10;
 charge(s,-1,30);for(let i=0;i<10&&!s.lastHit;i++)s.step(neutralInput(),{...neutralInput(),shield:true});
 assert.equal(s.lastHit?.blocked,true);assert.equal(s.lastHit?.damage,0);assert.equal(s.dummy.damage,0);assert.equal(s.dummy.shieldStun,13);assert.ok(s.dummy.shield<39);
 const hit=make('mario');hit.options.mode='battle';hit.options.opponent='local';hit.status='playing';hit.player.x=0;hit.dummy.x=10;charge(hit,0,30);
 for(let i=0;i<8&&!hit.player.hitstun;i++)hit.step({...neutralInput(),smash:true},{...neutralInput(),attack:i===0});
 assert.ok(hit.player.hitstun>0);assert.equal(hit.actors[0].smashCharge,null);assert.equal(hit.actors[0].damageMultiplier(),1);
 const edge=make('kirby');edge.player.x=STAGE.right-1;edge.dummy.x=0;step(edge,1,{smash:true});step(edge,30);
 assert.equal(edge.actors[0].smashCharge,null);assert.equal(edge.player.grounded,false);assert.equal(edge.script,null);
});

test('source head and foot intangibility ends with the smash script window',()=>{
 for(const [id,vertical,bone,first,end] of [['mario',1,39,2,8],['kirby',1,455,5,16],['kirby',-1,446,0,10]] as const){
  const s=make(id);s.dummy.x=100;charge(s,vertical,0);step(s,first+1);assert.equal(s.actors[0].hurtboxEnabled(bone),false);
  step(s,end-first);assert.equal(s.actors[0].hurtboxEnabled(bone),true);
 }
});

test('Link carries a charge into a freshly queued follow-up and CPU can perform the two-slash sequence',()=>{
 const s=make('link');charge(s,0,30);step(s);step(s,1,{smash:true});const hits:any[]=[];
 for(let i=0;i<110;i++){step(s);if(s.lastHit?.frame===s.frame)hits.push({move:s.lastHit.move,damage:s.lastHit.damage});}
 assert.deepEqual(hits.map(h=>h.move),['AttackS4S','AttackS4S2']);assert.ok(Math.abs(hits[0].damage-18)<1e-9);assert.ok(Math.abs(hits[1].damage-20.4)<1e-9);
 const cpu=make('link');cpu.player.x=0;cpu.dummy.x=12;const clips=new Set<string>();
 for(let frame=175;frame<290;frame++){cpu.step(cpuInput(cpu.actors[0],cpu.actors[1],frame));clips.add(cpu.player.clip);}
 assert.ok(clips.has('AttackS4S2'));
});
