import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';import {Poses} from '../src/pose';import {ScriptVM} from '../src/script';import {cpuInput} from '../src/cpu';
import {neutralInput,type Input,type CopyAbility,type FighterData} from '../src/types';
const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')) as FighterData,poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),k=load('kirby');
function step(s:Simulation,n=1,input:Partial<Input>={},second:Partial<Input>={}){for(let i=0;i<n;i++){s.step({...neutralInput(),...input},{...neutralInput(),...second});assert.equal(s.error,null);}}
function make(id:CopyAbility='mario',local=false){const s=new Simulation(k.data,k.poses,{mode:local?'battle':'training',opponent:'local',fighters:['kirby',id]},load(id));if(local){step(s,180);s.player.x=-12;s.dummy.x=5;}return s;}
function copy(id:CopyAbility='mario',local=false){const s=make(id,local);step(s,55,{neutral:true});step(s,8,{down:true,vertical:-1});assert.equal(s.actors[0].copied,id);step(s,25);return s;}

test('native swallow commits once at age seven, grants the selected copy, and preserves the entire closing animation',()=>{
 for(const id of ['mario','link','pikachu'] as const){
  const s=make(id);step(s,55,{neutral:true});step(s,7,{down:true,vertical:-1});assert.equal(s.actors[0].copied,null);assert.equal(s.dummy.damage,0);assert.ok(s.capture);
  step(s,1,{down:true,vertical:-1});assert.equal(s.actors[0].copied,id);assert.equal(s.dummy.damage,6);assert.equal(s.capture,null);assert.equal(s.dummy.clip,'CaptureCut');assert.equal(s.player.clip,'SpecialNDrink');assert.equal(s.player.age,7);
  step(s,23,{neutral:true});assert.equal(s.player.clip,'SpecialNDrink');assert.equal(s.player.age,30);step(s);assert.equal(s.player.state,'idle');assert.equal(s.hits,1);assert.equal(s.dummy.damage,6);
 }
});

test('copied scripts retain Kirby firing ages and use Kirby poses and native article damage',()=>{
 assert.equal(Object.keys(k.poses.motion.clips).length,184);
 for(const [id,age,count,damage] of [['mario',13,49,5],['pikachu',18,59,9]] as const){
  const prefix=k.data.copies![id].prefix;
  for(const suffix of ['SpecialN','SpecialAirN']){assert.equal(k.poses.motion.clips[prefix+suffix].count,count);const vm=new ScriptVM(k.data.moves[prefix+suffix].commands);vm.advance(age-1);assert.equal(vm.generatedArticles.length,0);vm.advance(age);assert.deepEqual(vm.generatedArticles,[13]);assert.equal(vm.error,null);}
  const vm=new ScriptVM(k.data.copies![id].ranged.commands);vm.advance(0);assert.equal(vm.hitboxes.get(0)?.damage,damage);
 }
});

test('all three copied neutral specials connect after a real swallow and keep Final Cutter available',()=>{
 for(const [id,damage,move] of [['mario',11,'Fireball'],['link',18,'BowArrow'],['pikachu',12,'ThunderJolt']] as const){
  const s=copy(id);step(s,1,{axis:-1});step(s,id==='link'?61:19,{neutral:true});
  assert.ok(s.player.clip.startsWith(k.data.copies![id].prefix));if(id==='link'){assert.equal(s.projectiles.length,0);assert.equal(s.actors[0].ranged?.charge,43);}
  step(s,60);assert.equal(s.dummy.damage,damage);assert.equal(s.lastHit?.move,move);assert.equal(s.actors[0].copied,id);step(s,1,{special:true});assert.equal(s.player.clip,'SpecialHi');
 }
});

test('copied air throws continue across landing with one projectile; retained copies survive ordinary actions',()=>{
 for(const id of ['mario','link','pikachu'] as const){
  const s=copy(id);s.dummy.x=80;Object.assign(s.player,{y:8,vy:0,grounded:false,state:'air',clip:'Fall'});step(s,1,{neutral:true});assert.ok(s.player.clip.includes('SpecialAirN'));
  const shots=new Set<number>();let landed=false;for(let n=0;n<85;n++){step(s,1,{neutral:n<25});for(const p of s.projectiles)shots.add(p.id);landed||=s.player.grounded&&s.player.state==='ranged';}
  assert.equal(landed,true);assert.equal(shots.size,1);assert.equal(s.actors[0].copied,id);step(s,1,{attack:true});assert.equal(s.player.clip,'Attack11');
 }
});

test('shield plus a fresh U discards a copy without firing; the next U restores inhale, and a KO removes the hat',()=>{
 const s=copy('mario',true);step(s,1,{shield:true});assert.equal(s.player.state,'shield');step(s,1,{shield:true,neutral:true});assert.equal(s.actors[0].copied,null);assert.equal(s.projectiles.length,0);assert.equal(s.actors[0].inhale,null);
 step(s);step(s,1,{neutral:true});assert.equal(s.player.clip,'SpecialNStart');
 const ko=copy('pikachu',true);ko.player.x=STAGE.blastX+10;step(ko);assert.equal(ko.actors[0].copied,null);assert.equal(ko.player.state,'ko');step(ko,50);assert.equal(ko.actors[0].copied,null);
});

test('a second Kirby slot can copy; a plain Kirby target grants no copied neutral; CPU chooses and uses copies',()=>{
 const m=load('mario'),p2=new Simulation(m.data,m.poses,{mode:'battle',opponent:'local',fighters:['mario','kirby']},k);step(p2,180);p2.player.x=-5;p2.dummy.x=5;step(p2,55,{}, {neutral:true});step(p2,8,{}, {vertical:-1,down:true});assert.equal(p2.actors[1].copied,'mario');assert.equal(p2.player.damage,6);assert.equal(p2.actors[0].copied,null);
 const mirror=new Simulation(k.data,k.poses,{fighters:['kirby','kirby']},k);step(mirror,55,{neutral:true});step(mirror,8,{down:true,vertical:-1});assert.equal(mirror.capture,null);assert.equal(mirror.actors[0].copied,null);assert.equal(mirror.dummy.damage,6);
 const cpu=make();for(let n=180;n<280;n++){step(cpu,1,cpuInput(cpu.actors[0],cpu.actors[1],n));if(cpu.actors[0].copied&&cpu.player.state==='idle')break;}assert.equal(cpu.actors[0].copied,'mario');step(cpu,40);cpu.player.x=-12;cpu.dummy.x=50;assert.equal(cpu.dummy.grounded,true);let fired=false;for(let n=360;n<400;n++){step(cpu,1,cpuInput(cpu.actors[0],cpu.actors[1],n));fired||=cpu.projectiles.some(p=>p.kind==='fireball');}assert.equal(fired,true);
});
