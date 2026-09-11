import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';import {Poses} from '../src/pose';import {ScriptVM} from '../src/script';import {neutralInput,type Input} from '../src/types';import {cpuInput} from '../src/cpu';
const ids=['mario','link','kirby','pikachu'] as const;
const assets=Object.fromEntries(ids.map(id=>[id,{data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}]));
function make(id='mario',target='mario',battle=false){const a=assets[id],s=new Simulation(a.data,a.poses,{mode:battle?'battle':'training',opponent:'local',fighters:[id as any,target as any]},assets[target]);if(battle)step(s,180);s.player.x=-5;s.dummy.x=5;return s;}
function step(s:Simulation,n=1,input:Partial<Input>={},second:Partial<Input>={}){for(let i=0;i<n;i++){s.step({...neutralInput(),...input},{...neutralInput(),...second});assert.equal(s.error,null);}}
function hold(id='mario',target='mario',battle=false){const s=make(id,target,battle);step(s,20,{grab:true});assert.equal(s.hold?.owner,0);return s;}

test('standing grabs activate at the source age, expire on time, and a whiff cannot restart while held',()=>{
 for(const id of ids){const a=assets[id],start=id==='link'?11:5,end=id==='link'?19:7,vm=new ScriptVM(a.data.moves.Catch.commands);
  vm.advance(start-1);assert.equal(vm.grabs.size,0);vm.advance(start);assert.ok(vm.grabs.size);vm.advance(end);assert.equal(vm.grabs.size,0);assert.equal(vm.error,null);
  const s=make(id);s.dummy.x=80;step(s,110,{grab:true});assert.equal(s.hold,null);assert.equal(s.player.state,'idle');
 }
});
test('each fighter grabs through shields in either slot, while invincibility and distance still protect the target',()=>{
 for(const id of ids){const s=make(id,'mario',true);step(s,20,{grab:true},{shield:true});assert.equal(s.hold?.owner,0);assert.equal(s.dummy.damage,0);assert.equal(s.dummy.shieldStun,0);
  const inv=make(id);inv.dummy.invincible=50;step(inv,20,{grab:true});assert.equal(inv.hold,null);
  const p2=make('mario',id,true);step(p2,20,{shield:true},{grab:true});assert.equal(p2.hold?.owner,1);
 }
});
test('shield attack, dash grab and pivot grab select separate original animations and face the caught opponent',()=>{
 for(const id of ids){const s=make(id);step(s,1,{shield:true});step(s,1,{shield:true,attack:true});assert.equal(s.player.clip,'Catch');
  const dash=make(id);dash.player.x=-35;step(dash,8,{axis:1,run:true});step(dash,1,{axis:1,run:true,grab:true});assert.equal(dash.player.clip,'CatchDash');
  const pivot=make(id);pivot.player.x=10;pivot.dummy.x=0;step(pivot,1,{axis:1,run:true});step(pivot,1,{axis:-1,run:true,grab:true});assert.equal(pivot.player.clip,'CatchTurn');step(pivot,20);assert.equal(pivot.hold?.owner,0);assert.equal(pivot.player.facing,-1);
 }
});
test('Clawshot reaches a distant grounded target but its long volume does not catch an airborne target',()=>{
 const s=make('link');s.player.x=-30;s.dummy.x=5;step(s,20,{grab:true});assert.ok(s.hold);
 const air=make('link');air.player.x=-30;Object.assign(air.dummy,{y:6,vy:1,grounded:false,state:'air',clip:'Fall'});step(air,20,{grab:true});assert.equal(air.hold,null);
 const far=make('mario');far.player.x=-30;step(far,20,{grab:true});assert.equal(far.hold,null);
});
test('pummels use each fighter’s damage, retain the victim, and a held attack contributes only one pummel',()=>{
 for(const [id,damage] of [['mario',3],['link',2],['kirby',1],['pikachu',2]] as const){const s=hold(id);step(s,50,{attack:true});assert.equal(s.dummy.damage,damage);assert.equal(s.hold?.owner,0);assert.equal(s.player.clip,'CatchWait');assert.equal(s.hits,1);}
});
test('all sixteen throws work against every victim model, including their repeated hits and signed launches',()=>{
 const totals={mario:[9,12,8,6],link:[7,7,7,7],kirby:[8,8,10,12],pikachu:[10,9,10,10]};
 for(const id of ids)for(const victim of ids)for(const [n,dir] of ['F','B','Hi','Lw'].entries()){
  const s=hold(id,victim);step(s,1,dir==='F'?{axis:1}:dir==='B'?{axis:-1}:dir==='Hi'?{vertical:1}:{vertical:-1,down:true});
  assert.equal(s.player.clip,`Throw${dir}`);let released=false;
  for(let i=0;i<150;i++){step(s);if(id==='kirby'&&dir==='Lw'&&s.lastHit?.frame===s.frame&&s.player.age<55){assert.equal(s.player.hitlag,0,'the repeated stomp profile disables hitlag');assert.equal(s.dummy.hitlag,0);}if(!s.hold){released=true;break;}}
  assert.equal(released,true,`${id} ${dir}`);assert.equal(s.dummy.damage,totals[id][n],`${id} ${dir} vs ${victim}`);assert.equal(s.lastHit?.move,`Throw${dir}`);
  if(dir==='F')assert.ok(s.dummy.vx>0);if(dir==='B')assert.ok(s.dummy.vx<0);if(dir==='Hi')assert.ok(s.dummy.vy>0);
  const damage=s.dummy.damage;step(s,25);assert.equal(s.dummy.damage,damage);assert.notEqual(s.dummy.state,'captured');
 }
});
test('struggle presses escape sooner than a held button and thrown victims cannot mash out mid-throw',()=>{
 const held=hold(),mash=hold();let heldFrames=0,mashFrames=0;
 while(held.hold){step(held,1,{}, {attack:true});heldFrames++;assert.ok(heldFrames<150);}
 while(mash.hold){step(mash,1,{}, {attack:mashFrames%2===0});mashFrames++;assert.ok(mashFrames<150);}
 assert.ok(mashFrames<heldFrames/2);assert.equal(mash.dummy.clip,'CaptureCut');assert.ok(mash.dummy.invincible);
 const thrown=hold('kirby');step(thrown,1,{vertical:1});for(let i=0;i<40;i++)step(thrown,1,{}, {attack:i%2===0,axis:i%2?1:-1});assert.ok(thrown.hold);step(thrown,15);assert.equal(thrown.lastHit?.move,'ThrowHi');
});
test('simultaneous grabs release both fighters, and attacks or KOs interrupt an existing hold',()=>{
 const clash=make('mario','mario',true);step(clash,8,{grab:true},{grab:true});assert.equal(clash.hold,null);assert.equal(clash.player.clip,'CatchCut');assert.equal(clash.dummy.clip,'CatchCut');
 const s=hold();s.actors[0].clearAttack();s.player.state='hitstun';s.player.hitstun=10;step(s);assert.equal(s.hold,null);assert.equal(s.player.state,'hitstun');assert.equal(s.dummy.clip,'CaptureCut');
 const ko=hold('mario','mario',true);ko.player.x=STAGE.blastX+5;step(ko);assert.equal(ko.hold,null);assert.equal(ko.player.state,'ko');assert.notEqual(ko.dummy.state,'captured');
});
test('Kirby’s original up throw crosses the upper boundary and returns before the throw launches its victim',()=>{
 const s=hold('kirby','mario',true);step(s,1,{vertical:1});let peak=0;for(let i=0;i<130;i++){step(s);peak=Math.max(peak,s.player.y);assert.deepEqual(s.stocks,[3,3]);}
 assert.ok(peak>STAGE.blastTop);assert.equal(s.player.grounded,true);assert.equal(s.player.state,'idle');assert.equal(s.dummy.damage,10);
});
test('CPU takes a grab opportunity against a shield and follows with a throw using ordinary inputs',()=>{
 const s=make('mario','mario',true);let grabbed=false,thrown=false;
 for(let f=0;f<140;f++){step(s,1,cpuInput(s.actors[0],s.actors[1],f),{shield:true});grabbed||=!!s.hold;thrown||=!!s.lastHit?.move.startsWith('Throw');}
 assert.equal(grabbed,true);assert.equal(thrown,true);
});
