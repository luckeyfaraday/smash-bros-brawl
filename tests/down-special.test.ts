import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {Simulation,STAGE} from '../src/simulation';import {Poses} from '../src/pose';import {ScriptVM} from '../src/script';import {neutralInput,type Input} from '../src/types';import {Bomb,DownProjectile,DOWN_RULES} from '../src/down-special';import {cpuInput} from '../src/cpu';
const ids=['mario','link','kirby','pikachu'] as const;
const assets=Object.fromEntries(ids.map(id=>[id,{data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}]));
function make(id='mario',target='mario',battle=false){const a=assets[id],s=new Simulation(a.data,a.poses,{mode:battle?'battle':'training',opponent:'local',fighters:[id as any,target as any]},assets[target]);if(battle)step(s,180);return s;}
function step(s:Simulation,n=1,input:Partial<Input>={},second:Partial<Input>={}){for(let i=0;i<n;i++){s.step({...neutralInput(),...input},{...neutralInput(),...second});assert.equal(s.error,null);}}
function held(s:Simulation,owner=0){const f=s.actors[owner].f,b=new Bomb(500,owner,owner,f.x,f.y,assets.link.data.downSpecial.bomb.commands);s.bombs.push(b);return b;}

test('all four original down and light-item scripts execute with exported clips; Stone keeps enemy and fighter profiles separate',()=>{
 for(const id of ids)for(const [name,move] of Object.entries(assets[id].data.moves) as [string,any][]){if(!/^Special(Air)?Lw|^Light/.test(name))continue;assert.ok(assets[id].poses.motion.clips[name]);const vm=new ScriptVM(move.commands);vm.advance(400);assert.equal(vm.error,null,`${id} ${name}`);}
 const vm=new ScriptVM(assets.kirby.data.moves.SpecialLw1.commands);vm.advance(13);assert.equal(vm.hitboxes.get(0)!.specialFlags!&0x40,0);assert.ok(vm.hitboxes.get(2)!.specialFlags!&0x40);
});
test('F.L.U.D.D. charges, stores with shield, fires once per source pump event and does no damage or hitstun',()=>{
 const s=make();step(s,65,{downSpecial:true});assert.equal(s.actors[0].floodCharge,45);step(s,1,{shield:true});assert.equal(s.actors[0].downSpecial,null);assert.equal(s.actors[0].floodCharge,45);step(s,18);const start=s.dummy.x;
 step(s,1,{downSpecial:true});assert.equal(s.player.clip,'SpecialLwLight');assert.equal(s.downProjectiles.length,1);assert.equal(s.actors[0].floodCharge,0);step(s,48);assert.equal(s.snapshot().nextProjectile,12);assert.ok(s.dummy.x>start);assert.equal(s.dummy.damage,0);assert.equal(s.dummy.hitlag,0);assert.equal(s.dummy.hitstun,0);
 const full=make();step(full,110,{downSpecial:true});assert.equal(full.actors[0].floodCharge,90);assert.equal(full.player.state,'idle');step(full);step(full,1,{downSpecial:true});assert.equal(full.player.clip,'SpecialLwHeavy');
});
test('F.L.U.D.D. wind respects shields, Stone and the stage; Cape reflects water ownership and direction',()=>{
 for(const shield of [false,true]){const s=make('mario','mario',true);s.player.x=-50;s.dummy.x=5;const p=new DownProjectile(0,0,'water',0,7,1,90,0,assets.mario.data.downSpecial.water.commands.Regular);s.downProjectiles.push(p);step(s,1,{}, {shield});assert.equal(s.dummy.damage,0);assert.equal(s.dummy.hitstun,0);assert.equal(s.dummy.hitlag,0);assert.equal(s.dummy.x===5,shield);}
 const s=make();s.dummy.x=80;step(s,6,{side:true});const p=new DownProjectile(0,1,'water',0,7,-1,90,0,assets.mario.data.downSpecial.water.commands.Regular);s.downProjectiles.push(p);step(s);assert.equal(p.owner,0);assert.equal(p.reflections,1);assert.ok(p.vx>0);
 const floor=new DownProjectile(2,0,'water',0,2,1,90,-2,assets.mario.data.downSpecial.water.commands.Regular);floor.step();assert.ok(floor.endedByStage);assert.ok(floor.y>=1);
});
test('Link pulls one bomb at original age 16, carries it after the move and cannot pull another while holding it',()=>{
 const s=make('link');step(s,16,{downSpecial:true});assert.equal(s.bombs.length,0);step(s);assert.equal(s.bombs.length,1);assert.equal(s.bombs[0].heldBy,0);step(s,26);assert.equal(s.player.clip,'WaitItem');step(s,1,{downSpecial:true});assert.equal(s.bombs.length,1);assert.equal(s.actors[0].downSpecial,null);
});
test('all four fighters release directional ground/air throws at their own source event, reverse backward throws and keep the fuse',()=>{
 for(const id of ids)for(const air of [false,true])for(const direction of ['F','B','Hi','Lw','Drop']){
  const s=make(id);s.player.x=-60;s.dummy.x=90;if(air)Object.assign(s.player,{y:65,grounded:false,state:'air',clip:'Fall'});const b=held(s);b.age=40;
  const name=`LightThrow${air&&direction!=='Drop'?'Air':''}${direction}`,vm=new ScriptVM(assets[id].data.moves[name].commands);let release=0;for(;release<60;release++){vm.advance(release);if(vm.itemThrows.length)break;}assert.ok(release<60,name);
  const input={attack:direction!=='Drop',grab:direction==='Drop',axis:direction==='B'?-1:0,vertical:direction==='Hi'?1:direction==='Lw'?-1:0};
  step(s,release,input);assert.equal(b.heldBy,0,`${id} ${name} early`);step(s,1,input);assert.equal(b.heldBy,null,`${id} ${name}`);assert.equal(b.age,41+release);assert.equal(s.player.clip,name);
  if(direction==='B'){assert.equal(s.player.facing,-1);assert.ok(b.vx<0);}if(direction==='Hi')assert.ok(b.vy>0);if(direction==='Lw')assert.ok(b.vy<0);if(direction==='Drop')assert.equal(b.phase,'fall');
 }
});
test('a strong item throw travels faster; a dropped bomb can be picked up by every fighter without resetting its fuse',()=>{
 const speeds=[];for(const strong of [false,true]){const s=make('link');s.player.x=-60;s.dummy.x=90;const b=held(s);step(s,7,{attack:!strong,smash:strong});speeds.push(b.vx);}assert.ok(speeds[1]>speeds[0]);
 for(const id of ids){const s=make(id),b=held(s,1);b.release(0,0,1,true);b.x=s.player.x+3;b.y=3;b.age=80;step(s,2,{attack:true});assert.equal(b.heldBy,0,id);assert.equal(b.owner,0);assert.equal(b.age,82);assert.equal(s.player.clip,'LightGet');}
});
test('the original bomb blast hits both fighters once for 5%, including its holder; shielding blocks it',()=>{
 const s=make('link');s.player.x=-5;s.dummy.x=5;const b=held(s);b.age=DOWN_RULES.bombFuse-1;step(s);assert.equal(b.phase,'explode');assert.equal(s.player.damage,5);assert.equal(s.dummy.damage,5);step(s,6);assert.equal(s.player.damage,5);assert.equal(s.dummy.damage,5);assert.equal(s.bombs.length,0);
 const shield=make('link','mario',true);shield.player.x=-5;shield.dummy.x=5;const blast=held(shield);blast.x=0;blast.y=7;blast.explode();step(shield,1,{}, {shield:true});assert.equal(shield.dummy.damage,0);assert.ok(shield.dummy.shield<60);
});
test('ordinary fighter attacks detonate loose bombs',()=>{
 const s=make();s.dummy.x=80;step(s,1,{attack:true});const b=held(s,1);b.release(0,0,1,true);b.x=s.player.x+8;b.y=6;step(s,2,{attack:true});assert.equal(b.phase,'explode');
});
test('Stone retains original root movement, forms, holds and changes back; all five forms are reachable',()=>{
 const s=make('kirby');s.dummy.x=90;const forms=[];
 for(let n=0;n<5;n++){step(s,1,{downSpecial:true});forms.push(s.actors[0].downSpecial!.form);step(s,8);assert.ok(s.player.y>0);assert.ok(s.actors[0].stoneFormed());step(s,30);assert.equal(s.actors[0].downSpecial?.phase,'hold');assert.equal(s.player.y,0);step(s,1,{downSpecial:true});assert.equal(s.actors[0].downSpecial?.phase,'exit');assert.ok(!s.actors[0].stoneFormed());step(s,65);assert.equal(s.actors[0].downSpecial,null);}
 assert.deepEqual(forms,[0,1,2,3,4]);
});
test('Stone hits fighters with the 14% ground profile and 18% falling profile, then runs its ground landing script',()=>{
 const ground=make('kirby');step(ground,25,{downSpecial:true});assert.equal(ground.dummy.damage,14);assert.equal(ground.lastHit!.hitbox,2);
 const air=make('kirby');Object.assign(air.player,{x:5,y:85,grounded:false,state:'air',clip:'Fall'});Object.assign(air.dummy,{y:80,grounded:false,state:'air',clip:'Fall'});step(air,40,{downSpecial:true});assert.equal(air.dummy.damage,18);assert.equal(air.lastHit!.hitbox,1);
 const land=make('kirby');land.dummy.x=90;step(land,20,{jump:true});step(land,1,{downSpecial:true});let landed=false;for(let n=0;n<70;n++){step(land);if(!landed&&land.actors[0].downSpecial?.phase==='land'){landed=true;assert.equal(land.script!.hitboxes.get(2)?.damage,14);}}assert.ok(landed);assert.equal(land.player.y,0);
});
test('Stone absorbs ordinary attacks with finite armor but remains grabbable',()=>{
 const s=make('mario','kirby',true);s.player.x=-60;s.dummy.x=5;step(s,40,{}, {downSpecial:true});s.player.x=-4;const armor=s.actors[1].downSpecial!.armor;step(s,5,{attack:true});assert.equal(s.dummy.damage,0);assert.ok(s.actors[1].downSpecial!.armor<armor);
 const grab=make('mario','kirby',true);grab.player.x=-60;grab.dummy.x=5;step(grab,40,{}, {downSpecial:true});grab.player.x=-4;step(grab,12,{grab:true});assert.equal(grab.hold?.victim,1);assert.equal(grab.actors[1].downSpecial,null);
});
test('Thunder calls at original age 13; self-contact triggers the 17% burst and the source invulnerability window',()=>{
 const s=make('pikachu');step(s,13,{downSpecial:true});assert.equal(s.downProjectiles.length,0);step(s);assert.equal(s.downProjectiles.length,1);step(s,4);assert.equal(s.actors[0].downSpecial?.phase,'hit');assert.equal(s.dummy.damage,17);assert.equal(s.player.damage,0);assert.equal(s.script!.hurtState,2);step(s,20);assert.equal(s.script!.hurtState,0);assert.equal(s.hits,1);
});
test('the falling bolt deals 10% once to an airborne opponent; reflected Thunder does not trigger its original caller',()=>{
 const s=make('pikachu');s.player.x=0;Object.assign(s.dummy,{x:0,y:50,grounded:false,state:'air',clip:'Fall'});step(s,18,{downSpecial:true});assert.equal(s.dummy.damage,10);assert.equal(s.player.damage,0);
 const reflect=make('mario','pikachu',true);reflect.player.x=0;reflect.dummy.x=60;step(reflect,6,{side:true});const p=new DownProjectile(0,1,'thunder',8,18,-1,0,0,assets.pikachu.data.downSpecial.thunder.commands.Regular);reflect.downProjectiles.push(p);step(reflect);assert.equal(p.owner,0);assert.equal(p.reflections,1);assert.ok(p.vy>0);
});
test('down specials work in both slots, interrupt cleanly on damage, and clear articles and charge on KO',()=>{
 for(const id of ids){const s=make('mario',id,true);step(s,1,{}, {downSpecial:true});assert.equal(s.actors[1].downSpecial?.kind,assets[id].data.downSpecial.kind);}
 const s=make('mario','pikachu',true);s.player.x=-4;s.dummy.x=5;step(s,1,{}, {downSpecial:true});step(s,5,{attack:true});assert.equal(s.actors[1].downSpecial,null);
 const bomb=make('link');step(bomb,20,{downSpecial:true});bomb.player.y=STAGE.blastBottom-1;step(bomb);assert.equal(bomb.bombs.length,0);assert.equal(bomb.actors[0].downSpecial,null);
 const charge=make();step(charge,60,{downSpecial:true});charge.player.x=STAGE.blastX+1;step(charge);assert.equal(charge.actors[0].floodCharge,0);
});
test('CPU uses the new down specials and throws held bombs through normal inputs',()=>{
 for(const id of ids){const s=make(id);s.player.x=id==='mario'?-40:-5;assert.equal(cpuInput(s.actors[0],s.actors[1],120).downSpecial,true,id);}
 const s=make('link');held(s);assert.equal(cpuInput(s.actors[0],s.actors[1],1).attack,true);
});
