import type {FighterData,Hitbox,Input,CopyAbility} from './types';
import {neutralInput} from './types';
import {Poses,sphereCapsule,sweptSphereCapsule} from './pose';
import {FighterController,fighter,shielding,type Fighter} from './fighter';
import {STAGE,STAGE_SOURCE} from './stage';
import {cpuInput} from './cpu';
import {MarioCpu} from './cpu-mario';
import type {FighterAssets,FighterId} from './roster';
import knockbackDirections from './data/knockback-directions.json' with {type:'json'};
import {CutterWave} from './final-cutter';
import {RangedProjectile} from './ranged';
import {ThunderJolt,JOLT_RULES} from './thunder-jolt';
import {INHALE_RULES,struggle,type CaptureState} from './inhale';
import {moveAgainstStage,stageBody} from './stage-contact';
import {GRAB_RULES,tetherTip,type HoldState} from './grab';
import {Boomerang,SIDE_RULES} from './side-special';
import {Bomb,DownProjectile,DOWN_RULES} from './down-special';
import {LINK_RESPONSE} from './link-response';
import {pronePhase} from './knockdown';
export {STAGE} from './stage';
export {LEDGE_RULES,onLedge,SHIELD_RULES,shielding,type Fighter} from './fighter';

export type GameOptions={mode:'training'|'battle';opponent:'cpu'|'local';stocks?:number;seconds?:number;fighters?:[FighterId,FighterId]};
export const DEFAULT_OPTIONS:GameOptions={mode:'training',opponent:'cpu',stocks:3,seconds:180};
type Projectile=RangedProjectile|ThunderJolt;
type Contact={attacker:number;victim?:number;hitbox:Hitbox;blocked:boolean;move:string;wave?:CutterWave|Projectile|Boomerang|DownProjectile|Bomb;throwing?:boolean;facing?:number;passiveShield?:{x:number;y:number;z:number}};
export class Simulation {
  frame=0;
  readonly actors:[FighterController,FighterController];
  readonly a:Record<string,number>;
  readonly options:GameOptions;
  readonly cpu:MarioCpu|null;
  stocks:[number,number];
  status:'countdown'|'playing'|'finished';
  countdown=180;
  remaining:number;
  winner:number|null=null;
  hits=0;
  lastHit:{frame:number;move:string;damage:number;knockback:number;hitbox:number;attacker:number;blocked:boolean}|null=null;
  lastKO:{frame:number;players:number[]}|null=null;
  waves:CutterWave[]=[];
  projectiles:Projectile[]=[];
  boomerangs:Boomerang[]=[];
  downProjectiles:DownProjectile[]=[];
  bombs:Bomb[]=[];
  capture:CaptureState|null=null;
  hold:HoldState|null=null;
  private nextProjectile=0;
  private nextWave=0;
  constructor(readonly data:FighterData,readonly poses:Poses,options:Partial<GameOptions>={},opponent:FighterAssets={data,poses}) {
    this.options={...DEFAULT_OPTIONS,...options};
    this.cpu=this.options.mode==='battle'&&this.options.opponent==='cpu'&&(opponent.data.id??'mario')==='mario'?new MarioCpu():null;
    if(this.options.fighters?.some((id,i)=>id!==([data,opponent.data][i].id??'mario')))
      throw new Error('Selected fighters do not match the loaded fighter assets');
    this.a=data.attributes;
    const battle=this.options.mode==='battle';
    this.actors=[new FighterController(fighter(battle?-60:-12,1),data,poses),new FighterController(fighter(battle?60:5,-1),opponent.data,opponent.poses)];
    this.actors.forEach((actor,owner)=>actor.articleAvailable=id=>id===0&&this.projectiles.filter(p=>p.owner===owner&&p.kind==='jolt'&&!p.spent).length<JOLT_RULES.capacity);
    this.actors.forEach((actor,owner)=>actor.boomerangAvailable=()=>!this.boomerangs.some(p=>p.owner===owner&&!p.spent));
    this.actors.forEach((actor,owner)=>{
      actor.heldBomb=()=>this.bombs.some(b=>b.heldBy===owner&&!b.spent);
      actor.bombAvailable=()=>this.bombs.filter(b=>b.owner===owner&&!b.spent).length<DOWN_RULES.bombCapacity;
      actor.nearbyBomb=()=>this.bombs.find(b=>!b.spent&&b.phase==='fall'&&Math.abs(b.x-actor.f.x)<12&&Math.abs(b.y-actor.f.y)<12)?.id??null;
    });
    this.stocks=[this.options.stocks!,this.options.stocks!];
    this.status=battle?'countdown':'playing';this.countdown=battle?180:0;
    this.remaining=this.options.seconds!*60;
  }
  get player(){return this.actors[0].f;}
  get dummy(){return this.actors[1].f;}
  get previous(){return this.actors[0].previous;}
  get script(){return this.actors[0].script;}
  get comboQueued(){return this.actors[0].comboQueued;}
  get hasHit(){return this.actors[0].hasHit;}
  get error(){return this.cpu?.fault??this.actors.find(c=>c.script?.error||c.downArticle?.error)?.script?.error??this.actors.find(c=>c.downArticle?.error)?.downArticle?.error??[...this.waves,...this.projectiles,...this.boomerangs,...this.downProjectiles,...this.bombs].find(w=>w.script.error)?.script.error??null;}
  landingDuration(f:Fighter){return this.actors.find(c=>c.f===f)!.landingDuration(f);}
  private contact(index:number):Contact|null {
    const attack=this.actors[index],defense=this.actors[1-index],p=attack.f,d=defense.f;
    if(attack.hasHit||(attack.linkBounce?.cooldown??0)>0||!attack.script||attack.script.error||d.invincible||defense.script?.hurtState||['ko','respawn','captured','spitStar'].includes(d.state))return null;
    for(const sourceHit of [...attack.script.hitboxes.values()].sort((a,b)=>a.id-b.id)) {
      if(sourceHit.specialFlags!==undefined&&!(sourceHit.specialFlags&0x40))continue;
      if((sourceHit.specialFlags??0)&0x08000000)continue; // Applied only to the held opponent below.
      if(!((sourceHit.targetMask??3)&(d.grounded?1:2)))continue;
      const hit={...sourceHit,damage:sourceHit.damage*attack.damageMultiplier()};
      const center=attack.poses.point(p.clip,p.poseFrame,hit.bone,hit.offset,p.facing,p.x,p.y);
      const sweep=attack.attackSweep;
      const from=sweep?{x:center.x+sweep.from.x-sweep.to.x,y:center.y+sweep.from.y-sweep.to.y,z:center.z}:center;
      const overlaps=(a:{x:number;y:number;z:number},b:{x:number;y:number;z:number},radius:number)=>
        sweep?sweptSphereCapsule(from,center,hit.radius,a,b,radius):sphereCapsule(center,hit.radius,a,b,radius);
      if(shielding(d)) {
        const radius=defense.shieldRadius()+hit.radius;
        const shield={x:d.x,y:d.y+7,z:0};
        if(sweep?overlaps(shield,shield,defense.shieldRadius()):(center.x-d.x)**2+(center.y-d.y-7)**2+center.z**2<=radius**2)return {attacker:index,hitbox:hit,blocked:true,move:p.clip};
      }
      if(defense.data.hurtboxes.some(h=>h.enabled&&defense.hurtboxEnabled(h.bone)&&overlaps(
        defense.poses.point(d.clip,d.poseFrame,h.bone,h.offset,d.facing,d.x,d.y),
        defense.poses.point(d.clip,d.poseFrame,h.bone,h.stretch,d.facing,d.x,d.y),h.radius)))
        return {attacker:index,hitbox:hit,blocked:false,move:p.clip};
    }
    return null;
  }
  private hit(contact:Contact) {
    const {attacker:index,hitbox:h,blocked,move,wave}=contact;
    const victim=contact.victim??1-index,attack=this.actors[index],defense=this.actors[victim],p=attack.f,d=defense.f;
    const consume=()=>{if(wave instanceof Boomerang)wave.struck=true;else if(wave instanceof DownProjectile||wave instanceof Bomb)wave.struck.add(victim);else if(wave)wave.spent=true;else attack.hasHit=true;};
    if(contact.passiveShield){
      consume();defense.hylianFlash={ticks:LINK_RESPONSE.flashFrames,point:{...contact.passiveShield}};
      this.lastHit={frame:this.frame,move:'HylianShield',damage:0,knockback:0,hitbox:h.id,attacker:index,blocked:true};return;
    }
    if(!blocked&&!contact.throwing&&defense.stoneFormed()&&defense.downSpecial!.armor>=h.damage){
      defense.downSpecial!.armor-=h.damage;consume();if(!wave)attack.rebound();return;
    }
    const freeze=contact.throwing?0:Math.max(1,Math.floor((h.damage/3+3)*h.hitlag));
    if(!wave)p.hitlag=Math.max(p.hitlag,freeze);
    d.hitlag=Math.max(d.hitlag,freeze);
    // Ordinary source hitboxes orient knockback away from the attacker's
    // position. Special profiles in this build use facing/movement direction.
    const facing=contact.facing??wave?.facing??(h.specialFlags?p.facing:Math.sign(d.x-p.x)||p.facing);
    let kb=0;
    if(blocked) {
      d.shield=Math.max(0,d.shield-h.damage*1.1-2);
      d.shieldStun=Math.max(1,Math.floor(h.damage*.6)+3);
      d.vx=facing*(h.damage*.025+.12);
      d.clip='GuardDamage';d.poseFrame=0;
      if(d.shield===0)defense.breakShield();
    } else if(h.reverse){
      d.damage+=h.damage;d.facing=-d.facing;d.vx=-d.vx;this.hits++;
    } else {
      d.damage+=h.damage;
      // Provisional Smash-style response, shared by both fighters.
      const weight=defense.a.Weight;
      kb=h.fixed?((1+h.fixed/2)*200/(weight+100)*1.4+18)*h.growth/100+h.base:
        ((d.damage/10+d.damage*h.damage/20)*200/(weight+100)*1.4+18)*h.growth/100+h.base;
      const degrees=h.angle===361?(d.grounded?(kb<60?0:44):45):h.angle;
      // Fixed degree vectors keep recorded launches identical in browser and Node.
      // Their Math.sin implementations can differ by one bit (notably Link's 48°).
      if(degrees===365) {
        // Autolink follows the attacker's actual (stage-clipped) movement and
        // adds half its momentum. Common knockback magnitude remains provisional.
        const speed=Math.sqrt(p.vx*p.vx+p.vy*p.vy);
        d.vx=(speed?p.vx/speed:0)*kb*.03+p.vx*.5;
        d.vy=(speed?p.vy/speed:1)*kb*.03+p.vy*.5;
      } else {
        const direction=knockbackDirections[((degrees%360)+360)%360];
        if(!direction||degrees>361)throw new Error(`Unsupported knockback angle ${degrees}`);
        d.vx=direction[0]*kb*.03*facing;d.vy=direction[1]*kb*.03;
      }
      d.grounded=d.grounded&&d.vy<=0;d.hitstun=Math.max(1,Math.floor(kb*.4));
      if(d.ledgeSide){const root=defense.poses.root(d.clip,d.poseFrame,d.facing);d.x+=root.x;d.y+=root.y;d.ledgeSide=0;}
      defense.receiveHit(kb);
      this.hits++;
    }
    consume();
    if(!wave&&!contact.throwing)attack.rebound();
    this.lastHit={frame:this.frame,move,damage:blocked?0:h.damage,knockback:kb,hitbox:h.id,attacker:index,blocked};
  }
  private waveContact(wave:CutterWave|Projectile|Boomerang):Contact|null {
    if(wave instanceof Boomerang&&wave.struck)return null;
    const defense=this.actors[1-wave.owner],f=defense.f;
    if(wave.spent&&!(wave instanceof RangedProjectile&&wave.endedByStage)||wave.script.error||f.invincible||defense.script?.hurtState||['ko','respawn','captured','spitStar'].includes(f.state))return null;
    for(const source of wave.script.hitboxes.values()) {
      const hit={...source,damage:source.damage*('damageScale' in wave?wave.damageScale:1)};
      if(!((hit.targetMask??3)&(f.grounded?1:2)))continue;
      const a=wave.point(hit,true),b=wave.point(hit);
      const contact=(blocked:boolean):Contact=>({attacker:wave.owner,hitbox:hit,move:wave instanceof CutterWave?'FinalCutterRegular':wave.kind==='boomerang'?'GaleBoomerang':wave.kind==='fireball'?'Fireball':wave.kind==='jolt'?'ThunderJolt':'BowArrow',blocked,wave});
      const passive=defense.passiveShield();
      if(passive&&(a.x-f.x)*f.facing>0&&(b.x-a.x)*f.facing<0&&sweptSphereCapsule(a,b,hit.radius,passive.a,passive.b,passive.radius))
        return {...contact(true),passiveShield:{x:(passive.a.x+passive.b.x)/2,y:(passive.a.y+passive.b.y)/2,z:(passive.a.z+passive.b.z)/2}};
      if(shielding(f)) {
        const shield={x:f.x,y:f.y+7,z:0};
        if(sweptSphereCapsule(a,b,hit.radius,shield,shield,defense.shieldRadius()))return contact(true);
      }
      if(defense.data.hurtboxes.some(h=>h.enabled&&defense.hurtboxEnabled(h.bone)&&sweptSphereCapsule(a,b,hit.radius,
        defense.poses.point(f.clip,f.poseFrame,h.bone,h.offset,f.facing,f.x,f.y),
        defense.poses.point(f.clip,f.poseFrame,h.bone,h.stretch,f.facing,f.x,f.y),h.radius)))return contact(false);
    }
    return null;
  }
  private reflectProjectiles(){
    for(const projectile of [...this.projectiles,...this.boomerangs,...this.downProjectiles]){
      if(projectile.spent)continue;
      const owner=1-projectile.owner,actor=this.actors[owner],f=actor.f;
      if(!actor.script?.reflector)continue;
      const center={x:f.x+f.facing*8,y:f.y+6,z:0};
      const volumes=[...projectile.script.hitboxes.values(),...(projectile.script.wind?[projectile.script.wind]:[])];
      if(volumes.some(h=>((h.specialFlags??0)&0x800000)&&sweptSphereCapsule(projectile.point(h,true),projectile.point(h),h.radius,center,center,SIDE_RULES.reflectRadius)))projectile.reflect(owner);
    }
  }
  private boomerangWind(){
    for(const b of this.boomerangs){
      const h=b.script.wind,actor=this.actors[1-b.owner],f=actor.f;
      if(!h||b.spent||b.phaseAge%6||shielding(f)||f.invincible||actor.script?.hurtState||['ko','respawn','captured','spitStar'].includes(f.state))continue;
      if(!actor.data.hurtboxes.some(box=>box.enabled&&actor.hurtboxEnabled(box.bone)&&sphereCapsule(b.point(h),h.radius,actor.poses.point(f.clip,f.poseFrame,box.bone,box.offset,f.facing,f.x,f.y),actor.poses.point(f.clip,f.poseFrame,box.bone,box.stretch,f.facing,f.x,f.y),box.radius)))continue;
      const speed=Math.sqrt(b.vx*b.vx+b.vy*b.vy)||1,dx=b.vx/speed*3,dy=b.vy/speed*3;
      const result=moveAgainstStage({x:f.x,y:f.y},{x:f.x+dx,y:f.y+dy},stageBody(actor.data,actor.poses,f.clip,f.poseFrame,f.facing));
      f.x=result.position.x;f.y=result.position.y;
      if(f.grounded&&f.y>STAGE.floor+.01){f.grounded=false;f.jumps=Math.max(1,f.jumps);if(f.state==='idle')f.state='air';}
    }
  }
  private articleTouches(actor:FighterController,from:{x:number;y:number;z:number},to:{x:number;y:number;z:number},radius:number){
    const f=actor.f;
    return actor.data.hurtboxes.some(h=>h.enabled&&actor.hurtboxEnabled(h.bone)&&sweptSphereCapsule(from,to,radius,
      actor.poses.point(f.clip,f.poseFrame,h.bone,h.offset,f.facing,f.x,f.y),
      actor.poses.point(f.clip,f.poseFrame,h.bone,h.stretch,f.facing,f.x,f.y),h.radius));
  }
  private downContact(wave:DownProjectile|Bomb,victim:number):Contact|null{
    const actor=this.actors[victim],f=actor.f;
    if(wave.spent||wave.struck.has(victim)||f.invincible||actor.script?.hurtState||['ko','respawn','captured','spitStar'].includes(f.state))return null;
    for(const source of wave.script.hitboxes.values()){
      if(source.specialFlags!==undefined&&!(source.specialFlags&0x40)||!((source.targetMask??3)&(f.grounded?1:2)))continue;
      const from=wave.point(source,true),to=wave.point(source),shield={x:f.x,y:f.y+7,z:0};
      const blocked=shielding(f)&&sweptSphereCapsule(from,to,source.radius,shield,shield,actor.shieldRadius());
      if(blocked||this.articleTouches(actor,from,to,source.radius))return {attacker:wave.owner,victim,hitbox:{...source,damage:source.damage*(wave instanceof DownProjectile?wave.damageScale:1)},blocked,move:wave.kind==='bomb'?'BombExplosion':'Thunder',wave,facing:wave.kind==='bomb'?Math.sign(f.x-wave.x)||wave.facing:wave.facing};
    }
    return null;
  }
  private handPosition(owner:number){
    const actor=this.actors[owner],f=actor.f,bone=actor.poses.motion.bones.find(b=>b.name===(actor.data.id==='pikachu'?'HaveN':'RHaveN'))!;
    return actor.poses.point(f.clip,f.poseFrame,bone.index,[0,0,0],f.facing,f.x,f.y);
  }
  private advanceDown(){
    for(const [owner,actor] of this.actors.entries()){
      const s=actor.downSpecial,f=actor.f;
      if(s?.emit){
        const count=s.emit;s.emit=0;
        if(s.kind==='bomb'&&!actor.heldBomb()&&actor.bombAvailable()){
          const point=this.handPosition(owner);this.bombs.push(new Bomb(this.nextProjectile++,owner,owner,point.x,point.y,actor.data.downSpecial!.bomb!.commands));
        }else if(s.kind==='thunder')this.downProjectiles.push(new DownProjectile(this.nextProjectile++,owner,'thunder',f.x,f.y+DOWN_RULES.thunderHeight,f.facing,0,0,actor.data.downSpecial!.thunder!.commands.Regular));
        else if(s.kind==='flood'){
          const track=actor.data.downSpecial!.nozzle![s.charge>=DOWN_RULES.floodCharge?'Heavy':'Light'];
          const local=track[Math.min(f.poseFrame,track.length-1)],bone=actor.poses.motion.bones.find(b=>b.name==='WaistNb')!;
          const point=actor.poses.point(f.clip,f.poseFrame,bone.index,local,f.facing,f.x,f.y);
          for(let n=0;n<count;n++)this.downProjectiles.push(new DownProjectile(this.nextProjectile++,owner,'water',point.x,point.y,f.facing,s.charge,s.aim,actor.data.downSpecial!.water!.commands.Regular));
        }
      }
      if(actor.script?.itemPickup){
        actor.script.itemPickup=false;
        const b=this.bombs.find(b=>b.id===actor.itemPickup&&b.phase==='fall'&&!b.spent);
        if(b&&!actor.heldBomb()&&Math.abs(b.x-f.x)<14&&Math.abs(b.y-f.y)<14){b.heldBy=owner;b.owner=owner;b.phase='held';b.phaseAge=0;b.vx=b.vy=0;}
      }
      const b=this.bombs.find(b=>b.heldBy===owner&&!b.spent);
      if(!b)continue;
      const hand=this.handPosition(owner);b.x=hand.x;b.y=hand.y;b.previousX=b.x;b.previousY=b.y;b.facing=f.facing;
      const item=actor.itemThrow;
      if(item?.release){
        item.release=false;
        // The source throw event provides the release offset. Common item
        // velocity variables are reconstructed until their module is decoded.
        if(item.offset){b.x=f.x+item.offset[0]*f.facing;b.y=f.y+item.offset[1];}
        const speed=item.strong?4.8:3.2;
        const vx=item.direction==='Drop'?f.vx:item.direction==='Hi'?f.vx*.3:item.direction==='Lw'?f.facing*.5:f.facing*speed;
        const vy=item.direction==='Hi'?speed*1.5:item.direction==='Lw'?-speed:item.direction==='Drop'?0:1.25;
        b.release(vx,vy,owner,item.direction==='Drop');
      }else if(actor.knockdown||['hitstun','captured','grabbed','spitStar','ko','respawn'].includes(f.state)||actor.stoneFormed())b.release(f.vx*.4,1,owner,true);
    }
    for(const p of this.downProjectiles){
      if(p.spent)continue;
      if(p.kind==='thunder'){
        const actor=this.actors[p.owner],h=[...p.script.hitboxes.values()][0];
        if(!p.reflections&&actor.downSpecial?.kind==='thunder'&&actor.downSpecial.phase==='call'&&h&&this.articleTouches(actor,p.point(h,true),p.point(h),h.radius)){
          actor.thunderHit();p.burstAge=0;p.script.hitboxes.clear();p.x=actor.f.x;p.y=actor.f.y+10.24;p.vx=p.vy=0;
        }
        continue;
      }
      const victim=1-p.owner,actor=this.actors[victim],f=actor.f,h=p.script.wind;
      if(!h||p.struck.has(victim)||shielding(f)||f.invincible||actor.script?.hurtState||actor.stoneFormed()||['ko','respawn','captured','spitStar'].includes(f.state))continue;
      if(!this.articleTouches(actor,p.point(h,true),p.point(h),h.radius))continue;
      p.struck.add(victim);
      const pressure=2+3*p.charge/DOWN_RULES.floodCharge,dx=p.facing*pressure,dy=Math.max(.3,pressure*.45+p.vy*.3);
      const result=moveAgainstStage({x:f.x,y:f.y},{x:f.x+dx,y:f.y+dy},stageBody(actor.data,actor.poses,f.clip,f.poseFrame,f.facing));
      f.x=result.position.x;f.y=result.position.y;
      if(f.grounded&&f.y>STAGE.floor+.01){f.grounded=false;f.jumps=Math.max(1,f.jumps);if(['idle','walk','run'].includes(f.state))f.state='air';}
    }
    for(const b of this.bombs){
      if(b.spent||b.phase==='explode')continue;
      if(b.phase==='throw'&&this.articleTouches(this.actors[1-b.owner],{x:b.previousX,y:b.previousY,z:0},{x:b.x,y:b.y,z:0},2.3)){b.explode();continue;}
      for(const [index,actor] of this.actors.entries()){
        if(b.heldBy===index||actor.f.hitlag)continue;
        if([...actor.script?.hitboxes.values()??[]].some(h=>{
          if(h.specialFlags!==undefined&&!(h.specialFlags&0x4000))return false;
          const c=actor.poses.point(actor.f.clip,actor.f.poseFrame,h.bone,h.offset,actor.f.facing,actor.f.x,actor.f.y);
          return sphereCapsule(c,h.radius,{x:b.x,y:b.y,z:0},{x:b.x,y:b.y,z:0},2.3);
        })){b.explode();break;}
      }
      if(['explode'].includes(b.phase))continue;
      for(const p of [...this.projectiles,...this.boomerangs,...this.waves,...this.downProjectiles]){
        if(p.spent||b.heldBy===p.owner)continue;
        if([...p.script.hitboxes.values()].some(h=>(h.specialFlags===undefined||!!(h.specialFlags&0x4000))&&sweptSphereCapsule(p.point(h,true),p.point(h),h.radius,{x:b.x,y:b.y,z:0},{x:b.x,y:b.y,z:0},2.3))){b.explode();if(!(p instanceof DownProjectile))p.spent=true;break;}
      }
    }
  }
  private releaseHold(){
    const c=this.hold;if(!c)return;this.hold=null;
    const owner=this.actors[c.owner],victim=this.actors[c.victim],f=victim.f;
    if(owner.grab)owner.grabPhase('release','CatchCut');
    victim.clearAttack();Object.assign(f,{state:'air',clip:'CaptureCut',age:0,poseFrame:0,grounded:false,vx:owner.f.facing*.8,vy:1.2,hitlag:0,hitstun:0,fastfall:false,invincible:GRAB_RULES.escapeInvincibility});
    f.x=owner.f.x+owner.f.facing*12;f.y=Math.max(STAGE.floor,owner.f.y)+2;
  }
  private advanceHold(inputs:Input[],frozen:boolean[]){
    const c=this.hold;if(!c)return;
    const owner=this.actors[c.owner],victim=this.actors[c.victim],g=owner.grab,f=victim.f,p=owner.f,vm=owner.script;
    if(!g||!vm||!['hold','pummel','throw'].includes(g.phase)){this.releaseHold();return;}
    if(frozen[c.owner]){c.previous={...inputs[c.victim]};return;}
    c.age++;c.damageAge++;
    const isThrow=g.phase==='throw',thrower=(owner.data.id??'mario'),title=thrower[0].toUpperCase()+thrower.slice(1);
    const clip=isThrow?`Thrown${title}${p.clip.slice(5)}`:c.damageAge<victim.poses.motion.clips.CaptureDamageHi.count?'CaptureDamageHi':c.age<GRAB_RULES.pull?'CapturePulledHi':'CaptureWaitHi';
    f.clip=clip;f.poseFrame=isThrow?p.poseFrame:clip==='CaptureWaitHi'?c.age%victim.poses.motion.clips[clip].count:clip==='CaptureDamageHi'?c.damageAge:c.age;
    f.facing=isThrow?p.facing:-p.facing;
    const bone=owner.poses.motion.bones.find(b=>b.name==='ThrowN')!.index;
    const anchor=owner.poses.point(p.clip,p.poseFrame,bone,[0,0,0],p.facing,p.x,p.y);
    const hip=victim.poses.motion.bones.find(b=>b.name==='HipN')!.index;
    const local=victim.poses.point(f.clip,f.poseFrame,hip,[0,0,0],f.facing,0,0);
    const amount=isThrow?1:Math.min(1,c.age/GRAB_RULES.pull);
    f.x=c.from.x+(anchor.x-local.x-c.from.x)*amount;f.y=c.from.y+(Math.max(isThrow?-100:0,anchor.y-local.y)-c.from.y)*amount;
    const heldHit=[...vm.hitboxes.values()].sort((a,b)=>a.id-b.id).find(h=>(h.specialFlags??0)&0x08000000);
    if(heldHit&&!owner.hasHit){
      // These source profiles retain the grabbed target; they add damage
      // without running the ordinary launch / clear-capture response.
      f.damage+=heldHit.damage;owner.hasHit=true;c.damageAge=0;this.hits++;
      const freeze=(heldHit.specialFlags??0)&0x20000000?0:Math.max(1,Math.floor((heldHit.damage/3+3)*heldHit.hitlag));p.hitlag=freeze;f.hitlag=freeze;
      this.lastHit={frame:this.frame,move:p.clip,damage:heldHit.damage,knockback:0,hitbox:heldHit.id,attacker:c.owner,blocked:false};
    }
    const events=vm.throwEvents.splice(0);
    if(events.length){
      if(events.length!==1||!isThrow)throw new Error('Unexpected ordinary throw event');
      const hit=vm.throws.get(events[0].id);if(!hit)throw new Error('Missing ordinary throw damage');
      this.hold=null;
      // Maintain the grabbed hip's world position when switching to damage.
      const damageHip=victim.poses.point('DamageN1',0,hip,[0,0,0],f.facing,0,0);
      f.x=anchor.x-damageHip.x;f.y=Math.max(STAGE.floor,anchor.y-damageHip.y);f.grounded=f.y===STAGE.floor;
      this.hit({attacker:c.owner,hitbox:hit,blocked:false,move:p.clip,throwing:true,facing:p.facing*(vm.reverseDirection?-1:1)});f.invincible=8;return;
    }
    if(!isThrow){
      c.remaining-=1+(struggle(inputs[c.victim],c.previous)?GRAB_RULES.mash:0);
      if(c.remaining<=0){this.releaseHold();return;}
    }
    c.previous={...inputs[c.victim]};
  }
  private resolveGrabs(inputs:Input[]){
    if(this.hold){if(!this.actors[this.hold.owner].grab)this.releaseHold();return;}
    if(this.capture)return;
    const candidates:number[]=[];
    for(const [index,owner] of this.actors.entries()){
      const victim=this.actors[1-index],p=owner.f,d=victim.f;
      if(owner.grab?.phase!=='reach'||!owner.script||p.hitlag||d.invincible||victim.script?.hurtState||['ko','respawn','captured','spitStar'].includes(d.state))continue;
      for(const box of owner.script.grabs.values()){
        if(!(box.targetMask&(d.grounded?1:2)))continue;
        const center=owner.data.id==='link'&&box.bone===79?tetherTip(owner):owner.poses.point(p.clip,p.poseFrame,box.bone,box.offset,p.facing,p.x,p.y);
        if(moveAgainstStage({x:p.x,y:p.y+8},{x:center.x,y:center.y},[{x:0,y:-.1},{x:.1,y:0},{x:0,y:.1},{x:-.1,y:0}]).contacts.length)continue;
        if(victim.data.hurtboxes.some(h=>h.enabled&&victim.hurtboxEnabled(h.bone)&&sphereCapsule(center,box.radius,
          victim.poses.point(d.clip,d.poseFrame,h.bone,h.offset,d.facing,d.x,d.y),victim.poses.point(d.clip,d.poseFrame,h.bone,h.stretch,d.facing,d.x,d.y),h.radius))){candidates.push(index);break;}
      }
    }
    if(candidates.length===2){for(const actor of this.actors)actor.grabPhase('release','CatchCut');return;}
    if(candidates.length===1){
      const index=candidates[0],owner=this.actors[index],victim=this.actors[1-index],f=victim.f;
      const maximum=Math.min(GRAB_RULES.maximumHold,GRAB_RULES.minimumHold+f.damage*GRAB_RULES.damageScale);
      this.hold={owner:index,victim:1-index,age:0,remaining:maximum,maximum,previous:{...inputs[1-index]},from:{x:f.x,y:f.y},damageAge:1000};
      if(owner.f.clip==='CatchTurn')owner.f.facing=-owner.f.facing;
      owner.grabPhase('hold','CatchWait');victim.clearAttack();victim.tech={window:0,lockout:0};
      Object.assign(f,{state:'captured',clip:'CapturePulledHi',age:0,poseFrame:0,grounded:false,vx:0,vy:0,hitlag:0,hitstun:0,fastfall:false,ledgeSide:0,shieldStun:0});
    }
  }

  private releaseCapture(copying=false){
    const c=this.capture;if(!c)return;this.capture=null;
    const owner=this.actors[c.owner],victim=this.actors[c.victim],f=victim.f;
    if(c.phase!=='star'){
      const direction=owner.f.facing*(copying?-1:1);
      f.x=owner.f.x+direction*12;f.y=owner.f.y+5;f.vx=direction*(copying?.6:1.2);f.vy=copying?.8:1.5;
      if(owner.inhale&&!copying)owner.inhalePhase('end');
    }
    victim.clearAttack();f.state='air';f.clip='CaptureCut';f.age=0;f.poseFrame=0;f.grounded=false;f.hitlag=0;f.hitstun=0;f.fastfall=false;f.invincible=INHALE_RULES.escapeInvincibility;
  }
  private advanceCapture(inputs:Input[]){
    const c=this.capture;if(!c)return;
    const owner=this.actors[c.owner],victim=this.actors[c.victim],f=victim.f;
    if(c.phase==='star'){
      c.age++;
      const radius=2,body=[{x:0,y:-radius},{x:radius,y:0},{x:0,y:radius},{x:-radius,y:0}];
      const result=moveAgainstStage({x:f.x,y:f.y},{x:f.x+f.vx,y:f.y+f.vy},body);f.x=result.position.x;f.y=result.position.y;
      f.vx-=Math.sign(f.vx)*INHALE_RULES.starDrag;
      if(c.age>=INHALE_RULES.starLife||result.contacts.length)this.releaseCapture();return;
    }
    if(!owner.inhale||!['swallow','hold','spit','drink'].includes(owner.inhale.phase)){this.releaseCapture();return;}
    if(owner.inhale.phase==='drink'&&owner.script?.variables.has(0x22000015)){
      const hit=owner.script.throws.get(0);if(!hit||hit.damage!==6)throw new Error('Missing swallow damage');
      const ability=victim.data.id;
      owner.copied=ability&&owner.data.copies&&Object.hasOwn(owner.data.copies,ability)?ability as CopyAbility:null;
      f.damage+=hit.damage;this.hits++;this.lastHit={frame:this.frame,move:'InhaleCopy',damage:hit.damage,knockback:0,hitbox:0,attacker:c.owner,blocked:false};
      this.releaseCapture(true);return;
    }
    const thrown=owner.script?.throwEvents.splice(0)??[];
    if(thrown.length){
      if(thrown.length!==1||thrown[0].id!==0||owner.inhale.phase!=='spit')throw new Error('Unexpected inhale throw event');
      const hit=owner.script!.throws.get(0);if(!hit)throw new Error('Missing spit throw damage');
      const origin=owner.poses.point(owner.f.clip,owner.f.poseFrame,thrown[0].bone,[0,0,0],owner.f.facing,owner.f.x,owner.f.y);
      c.phase='star';c.age=0;c.facing=owner.f.facing;f.x=origin.x;f.y=origin.y;f.damage+=hit.damage;f.facing=c.facing;f.vx=c.facing*INHALE_RULES.starSpeed;f.vy=0;f.state='spitStar';f.grounded=false;
      this.hits++;this.lastHit={frame:this.frame,move:'InhaleSpit',damage:hit.damage,knockback:0,hitbox:hit.id,attacker:c.owner,blocked:false};return;
    }
    if(owner.f.hitlag)return;
    c.age++;if(c.phase==='pull'&&c.age>=INHALE_RULES.pullFrames)c.phase='held';
    const mouth=owner.poses.point(owner.f.clip,owner.f.poseFrame,412,[0,0,0],owner.f.facing,owner.f.x,owner.f.y);
    const amount=Math.min(1,c.age/INHALE_RULES.pullFrames);f.x=c.from.x+(mouth.x-c.from.x)*amount;f.y=c.from.y+(mouth.y-c.from.y)*amount;f.poseFrame=Math.min(c.age,victim.poses.motion.clips.CapturePulledHi.count-1);
    if(c.phase==='held'){
      c.remaining-=1+(struggle(inputs[c.victim],c.previous)?INHALE_RULES.mash:0);
      if(c.remaining<=0){this.releaseCapture();return;}
    }
    c.previous={...inputs[c.victim]};
  }
  private resolveInhale(inputs:Input[]){
    if(this.hold)return;
    if(this.capture){
      if(this.capture.phase!=='star'&&!this.actors[this.capture.owner].inhale)this.releaseCapture();return;
    }
    const candidates:number[]=[];
    for(const [index,actor] of this.actors.entries()){
      const phase=actor.inhale?.phase,vm=actor.script,defense=this.actors[1-index],f=actor.f,d=defense.f;
      if(!vm||!['start','loop'].includes(phase??'')||f.hitlag||d.invincible||defense.script?.hurtState||['ko','respawn','captured','spitStar'].includes(d.state)||(d.x-f.x)*f.facing<=0)continue;
      const visible=moveAgainstStage({x:f.x,y:f.y+7},{x:d.x,y:d.y+7},[{x:0,y:-.1},{x:.1,y:0},{x:0,y:.1},{x:-.1,y:0}]).contacts.length===0;
      if(!visible)continue;
      const overlaps=(volume:{bone:number;offset:number[];radius:number})=>{
        const center=actor.poses.point(f.clip,f.poseFrame,volume.bone,volume.offset,f.facing,f.x,f.y);
        return defense.data.hurtboxes.some(h=>h.enabled&&defense.hurtboxEnabled(h.bone)&&sphereCapsule(center,volume.radius,
          defense.poses.point(d.clip,d.poseFrame,h.bone,h.offset,d.facing,d.x,d.y),defense.poses.point(d.clip,d.poseFrame,h.bone,h.stretch,d.facing,d.x,d.y),h.radius));
      };
      if([...vm.grabs.values()].some(h=>(h.targetMask&(d.grounded?1:2))&&overlaps(h))){candidates.push(index);continue;}
      if(vm.wind&&!shielding(d)&&overlaps(vm.wind)){
        const result=moveAgainstStage({x:d.x,y:d.y},{x:d.x-f.facing*INHALE_RULES.pullSpeed,y:d.y},[{x:0,y:0},{x:3,y:6},{x:0,y:12},{x:-3,y:6}]);d.x=result.position.x;d.y=result.position.y;
      }
    }
    if(candidates.length===2){for(const i of candidates)this.actors[i].inhalePhase('end');return;}
    if(candidates.length===1){
      const owner=candidates[0],victim=1-owner,defense=this.actors[victim],f=defense.f;
      const maximum=Math.min(INHALE_RULES.maximumHold,INHALE_RULES.holdFrames+f.damage*INHALE_RULES.damageHoldScale);
      this.capture={owner,victim,phase:'pull',age:0,remaining:maximum,maximum,from:{x:f.x,y:f.y},previous:{...inputs[victim]},facing:this.actors[owner].f.facing};
      defense.clearAttack();defense.tech={window:0,lockout:0};Object.assign(f,{state:'captured',clip:'CapturePulledHi',age:0,poseFrame:0,grounded:false,vx:0,vy:0,hitlag:0,hitstun:0,fastfall:false,ledgeSide:0,shieldStun:0});
      this.actors[owner].inhalePhase('swallow');
    }
  }
  private outside(f:Fighter){return Math.abs(f.x)>STAGE.blastX||f.y<STAGE.blastBottom||f.y>STAGE.blastTop;}
  private resetFighter(index:number,respawn=false) {
    if(index===1)this.cpu?.reset();
    if(this.hold)this.releaseHold();
    if(this.capture&&(this.capture.owner===index||this.capture.victim===index))this.releaseCapture();
    this.waves=this.waves.filter(w=>w.owner!==index);
    this.projectiles=this.projectiles.filter(p=>p.owner!==index);
    this.boomerangs=this.boomerangs.filter(p=>p.owner!==index);
    this.downProjectiles=this.downProjectiles.filter(p=>p.owner!==index);this.bombs=this.bombs.filter(b=>b.owner!==index&&b.heldBy!==index);
    const c=this.actors[index];c.f=fighter(respawn?0:index===0?-12:5,index===0?1:-1);
    c.clearAttack();c.hylianFlash=null;c.copied=null;c.capeLiftUsed=false;c.floodCharge=0;c.stoneUses=0;c.hasHit=false;c.previous=neutralInput();
    c.tech={window:0,lockout:0};
    if(respawn)Object.assign(c.f,{y:STAGE_SOURCE.positions.Rebirth0N[1]-STAGE.sourceFloor,grounded:false,state:'respawn',invincible:180});
  }
  step(input:Input,second=neutralInput()) {
    if(this.status==='finished')return;
    input={...neutralInput(),...input,axis:Math.max(-1,Math.min(1,input.axis)),vertical:Math.max(-1,Math.min(1,input.vertical??0))};
    second={...neutralInput(),...second,axis:Math.max(-1,Math.min(1,second.axis)),vertical:Math.max(-1,Math.min(1,second.vertical??0))};
    this.frame++;
    if(this.status==='countdown'){if(--this.countdown===0)this.status='playing';return;}
    const battle=this.options.mode==='battle';
    if(battle&&this.options.opponent==='cpu'){
      const existing=()=>cpuInput(this.actors[1],this.actors[0],this.frame);
      second=this.cpu?this.cpu.step(this.actors[1],this.actors[0],this.frame,existing):existing();
    }
    const frozen=[this.actors[0].step(input,this.dummy),this.actors[1].step(second,this.player,!battle)];
    for(const wave of this.waves)wave.step();
    for(const projectile of this.projectiles)projectile.step();
    for(const p of this.downProjectiles)p.step();
    for(const b of this.bombs)b.step();
    for(const b of this.boomerangs){const actor=this.actors[b.owner];b.step({x:actor.f.x,y:actor.f.y+8});if(b.caught&&!frozen[b.owner]&&actor.data.id==='link')actor.catchBoomerang();}
    for(const [owner,actor] of this.actors.entries())for(const id of actor.script?.generatedArticles.splice(0)??[]) {
      if(actor.side&&id===(actor.side.kind==='boomerang'?2:0)){actor.side.article=true;continue;}
      if(actor.grab&&actor.data.id==='link'&&[3,4].includes(id))continue; // Rendered tether follows the same grab controller.
      if(actor.inhale&&id===2)continue; // The spit star carries the captured fighter.
      if(actor.ranged){
        if(actor.ranged.kind==='fireball'&&id===(actor.copied?13:1)||actor.ranged.kind==='jolt'&&id===(actor.copied?13:0))actor.ranged.fire=true;
        else if(actor.ranged.kind!=='arrow'||!(actor.copied?[13,14]:[0,1]).includes(id))throw new Error('Unknown ranged article');
        continue;
      }
      if(!actor.data.finalCutter||id!==1)throw new Error('Article has no browser controller');
      this.waves.push(new CutterWave(this.nextWave++,owner,actor.f.x+actor.f.facing*8,actor.f.facing,actor.data.finalCutter.commands));
    }
    for(const [owner,actor] of this.actors.entries())if(actor.ranged?.fire){
      const r=actor.ranged,f=actor.f;r.fire=false;
      const bone=actor.poses.motion.bones.find(b=>b.name===(r.kind==='jolt'?'MouthN':'RHaveN'))!;
      const origin=actor.poses.point(f.clip,f.poseFrame,bone.index,[0,0,0],f.facing,f.x,f.y);
      this.projectiles.push(r.kind==='jolt'?new ThunderJolt(this.nextProjectile++,owner,origin.x+f.facing,origin.y,f.facing,actor.rangedData!.jolt!):new RangedProjectile(this.nextProjectile++,owner,r.kind,origin.x+f.facing*2,origin.y,f.facing,r.charge,actor.rangedData!.commands));
    }
    for(const [owner,actor] of this.actors.entries())if(actor.side?.fire){
      actor.side.fire=false;
      if(actor.data.side?.boomerang&&actor.boomerangAvailable()){
        const f=actor.f,bone=actor.poses.motion.bones.find(b=>b.name==='RHaveN')!;
        const origin=actor.poses.point(f.clip,f.poseFrame,bone.index,[0,0,0],f.facing,f.x,f.y);
        this.boomerangs.push(new Boomerang(this.nextProjectile++,owner,origin.x,origin.y,f.facing,actor.side.aim,actor.data.side.boomerang));
      }
    }
    if(this.error)return;
    this.reflectProjectiles();this.boomerangWind();this.advanceDown();
    this.advanceCapture([input,second]);
    this.advanceHold([input,second],frozen);
    if(this.error)return;
    if(battle&&this.player.grounded&&this.dummy.grounded&&!frozen.some(Boolean)&&!this.actors.some(c=>c.evade?.kind==='roll'||c.knockdown&&(pronePhase(c.knockdown.phase)||['roll','tech'].includes(c.knockdown.phase)))&&
      ![this.player,this.dummy].some(f=>['ko','respawn'].includes(f.state))) {
      const gap=this.dummy.x-this.player.x;
      if(Math.abs(gap)<8) {
        const side=Math.sign(gap)||1,correction=(8-Math.abs(gap))/2;
        this.player.x-=side*correction;this.dummy.x+=side*correction;
        if(this.player.vx*side>0)this.player.vx=0;
        if(this.dummy.vx*side<0)this.dummy.vx=0;
      }
    }
    // Gather both contacts before applying either one, so simultaneous attacks trade.
    const contacts=[...this.actors.map((_,i)=>frozen[i]?null:this.contact(i)),...[...this.waves,...this.projectiles,...this.boomerangs].map(w=>this.waveContact(w)),...this.downProjectiles.map(p=>this.downContact(p,1-p.owner)),...this.bombs.flatMap(b=>[this.downContact(b,0),this.downContact(b,1)])];
    for(const contact of contacts)if(contact)this.hit(contact);
    this.resolveGrabs([input,second]);
    this.resolveInhale([input,second]);
    this.waves=this.waves.filter(w=>!w.spent);
    this.projectiles=this.projectiles.filter(p=>!p.spent);
    this.boomerangs=this.boomerangs.filter(p=>!p.spent);
    this.downProjectiles=this.downProjectiles.filter(p=>!p.spent&&!p.endedByStage);
    this.bombs=this.bombs.filter(b=>!b.spent);
    const knockedOut:number[]=[];
    this.actors.forEach((c,i)=>{
      if(c.f.state==='ko'){if(c.f.age>=45)this.resetFighter(i,true);}
      else if(this.outside(c.f)&&!(this.hold&&this.actors[this.hold.owner].data.id==='kirby'&&this.actors[this.hold.owner].f.clip==='ThrowHi'&&c.f.y>STAGE.blastTop)) {
        if(!battle)this.resetFighter(i);
        else {if(this.capture)this.releaseCapture();if(this.hold)this.releaseHold();this.stocks[i]--;knockedOut.push(i);c.clearAttack();c.tech={window:0,lockout:0};c.copied=null;c.floodCharge=0;this.waves=this.waves.filter(w=>w.owner!==i);this.projectiles=this.projectiles.filter(p=>p.owner!==i);this.boomerangs=this.boomerangs.filter(b=>b.owner!==i);this.downProjectiles=this.downProjectiles.filter(p=>p.owner!==i);this.bombs=this.bombs.filter(b=>b.owner!==i&&b.heldBy!==i);c.f.state='ko';c.f.age=0;c.f.ledgeSide=0;c.f.hitlag=0;}
      }
    });
    if(knockedOut.length)this.lastKO={frame:this.frame,players:knockedOut};
    if(battle) {
      this.remaining=Math.max(0,this.remaining-1);
      if(this.stocks[0]===0||this.stocks[1]===0) {
        this.winner=this.stocks[0]===this.stocks[1]?-1:this.stocks[0]>0?0:1;this.status='finished';
      } else if(this.remaining===0) {
        const advantage=this.stocks[0]-this.stocks[1]||this.dummy.damage-this.player.damage;
        this.winner=advantage===0?-1:advantage>0?0:1;this.status='finished';
      }
    }
  }
  snapshot() {
    const c=this.actors[1];
    const down=(actor:FighterController)=>({state:actor.downSpecial?{...actor.downSpecial}:null,article:actor.downArticle?.snapshot()??null,floodCharge:actor.floodCharge,stoneUses:actor.stoneUses,itemThrow:actor.itemThrow?{...actor.itemThrow,offset:actor.itemThrow.offset?[...actor.itemThrow.offset]:null}:null,itemPickup:actor.itemPickup});
    const side=(actor:FighterController)=>actor.side?{...actor.side,...(actor.side.trail?{trail:actor.side.trail.map(p=>({...p}))}:{})}:null;
    const quick=(actor:FighterController)=>actor.quickAttack?{...actor.quickAttack,direction:{...actor.quickAttack.direction},trail:actor.quickAttack.trail.map(p=>({...p}))}:null;
    return {knockdown:this.actors.map(a=>({state:a.knockdown?{...a.knockdown}:null,tech:{...a.tech}})),linkResponse:this.actors.map(a=>({bounce:a.linkBounce?{...a.linkBounce}:null,flash:a.hylianFlash?{ticks:a.hylianFlash.ticks,point:{...a.hylianFlash.point}}:null})),defense:this.actors.map(a=>({evade:a.evade?{...a.evade}:null,landing:a.evadeLanding})),down:down(this.actors[0]),downOpponent:down(c),downProjectiles:this.downProjectiles.map(p=>p.snapshot()),bombs:this.bombs.map(b=>b.snapshot()),side:side(this.actors[0]),capeLiftUsed:this.actors[0].capeLiftUsed,boomerangs:this.boomerangs.map(b=>b.snapshot()),frame:this.frame,player:{...this.player},dummy:{...this.dummy},previous:{...this.previous},
      grab:this.actors[0].grab?{...this.actors[0].grab}:null,hold:this.hold?{...this.hold,from:{...this.hold.from},previous:{...this.hold.previous}}:null,
      quickAttack:quick(this.actors[0]),
      smash:this.actors[0].smashCharge?{...this.actors[0].smashCharge}:null,ranged:this.actors[0].ranged?{...this.actors[0].ranged}:null,
      projectiles:this.projectiles.map(p=>p.snapshot()),nextProjectile:this.nextProjectile,
      inhale:this.actors[0].inhale?{...this.actors[0].inhale}:null,copied:this.actors[0].copied,capture:this.capture?{...this.capture,from:{...this.capture.from},previous:{...this.capture.previous}}:null,
      cutter:this.actors[0].cutter?{...this.actors[0].cutter}:null,waves:this.waves.map(w=>w.snapshot()),nextWave:this.nextWave,
      script:this.script?.snapshot()??null,comboQueued:this.comboQueued,hasHit:this.hasHit,hits:this.hits,lastHit:this.lastHit?{...this.lastHit}:null,
      opponent:{side:side(c),capeLiftUsed:c.capeLiftUsed,previous:{...c.previous},script:c.script?.snapshot()??null,comboQueued:c.comboQueued,hasHit:c.hasHit,quickAttack:quick(c),cutter:c.cutter?{...c.cutter}:null,smash:c.smashCharge?{...c.smashCharge}:null,ranged:c.ranged?{...c.ranged}:null,inhale:c.inhale?{...c.inhale}:null,copied:c.copied,grab:c.grab?{...c.grab}:null},
      ...(this.cpu?{cpu:this.cpu.snapshot()}:{}),
      match:{options:{...this.options},stocks:[...this.stocks],status:this.status,countdown:this.countdown,remaining:this.remaining,winner:this.winner,lastKO:this.lastKO}};
  }
  hash(){let hash=2166136261;for(const char of JSON.stringify(this.snapshot()))hash=Math.imul(hash^char.charCodeAt(0),16777619);return (hash>>>0).toString(16).padStart(8,'0');}
}
