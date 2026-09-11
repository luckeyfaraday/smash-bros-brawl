import type { FighterData, Input, CopyAbility } from './types';
import { neutralInput } from './types';
import { Poses } from './pose';
import { JAB_FLAGS, LANDING_LAG_FLAG, ScriptVM } from './script';
import { isJab, nextJab, isDirectionalAttack, groundAttack, isAerial, aerialAttack, aerialFromLanding, aerialLandingLag, type Attack } from './moves';
import { STAGE, LEDGES } from './stage';
import {stageBody,moveAgainstStage,clipStageVelocity,STAGE_PLANES,type StageContact} from './stage-contact';
import {quickDirection,canRedirect,QUICK_ATTACK_RULES,type QuickAttackState,type Direction} from './quick-attack';
import {CUTTER_RULES,type CutterState} from './final-cutter';
import {smashAttack,smashStage,smashMultiplier,SMASH_RULES,type SmashState} from './smash';
import {BOW_READY,RANGED_RULES,type RangedState} from './ranged';
import {INHALE_RULES,type InhaleState} from './inhale';
import {throwDirection,type GrabState} from './grab';
import {SIDE_RULES,type SideState} from './side-special';
import {DOWN_RULES,type DownState,type ItemThrowState} from './down-special';
import {DEFENSE_RULES,hasDefenseInterrupt,type EvadeState} from './defense';
import {HYLIAN_SHIELD,LINK_SHIELD_FLAG,LINK_REBOUND_FLAG,LINK_RESPONSE,type LinkBounce,type ShieldFlash} from './link-response';
import {KNOCKDOWN_RULES,launchClip,pronePhase,tumblePhase,type KnockdownState,type FloorPosture,type KnockdownPhase} from './knockdown';
export { STAGE } from './stage';

export type Fighter = {
  x: number; y: number; vx: number; vy: number; facing: number;
  grounded: boolean; jumps: number; state: string; age: number; clip: string;
  poseFrame: number; damage: number; hitlag: number; hitstun: number;
  fastfall: boolean; shortHop: boolean;
  ledgeSide: number; ledgeCooldown: number; invincible: number;
  shield:number; shieldStun:number;
};
export function fighter(x: number, facing: number): Fighter {
  return { x, y: 0, vx: 0, vy: 0, facing, grounded: true, jumps: 0, state: 'idle', age: 0,
    clip: 'Wait1', poseFrame: 0, damage: 0, hitlag: 0, hitstun: 0, fastfall: false, shortHop: false,
    ledgeSide:0, ledgeCooldown:0, invincible:0, shield:60, shieldStun:0 };
}
const approach = (value: number, target: number, amount: number) =>
  value < target ? Math.min(target, value+amount) : Math.max(target,value-amount);

// Provisional common-state rules; geometry and pose motion come from original data.
export const LEDGE_RULES={reach:8,top:-2,bottom:-16,regrabDelay:30,invincibility:30,hangLimit:600};
export const onLedge=(f:Fighter)=>f.state.startsWith('ledge');

export const SHIELD_RULES={maximum:60,drain:.15,regen:.09,breakStun:120};
export const shielding=(f:Fighter)=>f.state==='shield';

// Common recovery rules are provisional. Mario's lift is in his CHR0 root
// track; Link's zero-translation spin needs a reconstructed kinetic launch.
export const RECOVERY_RULES={linkLift:2.5,airControl:.8,marioSteering:.25,landing:30};

export class FighterController {
  previous=neutralInput();
  script:ScriptVM|null=null;
  comboQueued=false;
  hasHit=false;
  stageContacts:StageContact[]=[];
  quickAttack:QuickAttackState|null=null;
  cutter:CutterState|null=null;
  smashCharge:SmashState|null=null;
  ranged:RangedState|null=null;
  inhale:InhaleState|null=null;
  copied:CopyAbility|null=null;
  grab:GrabState|null=null;
  side:SideState|null=null;
  capeLiftUsed=false;
  evade:EvadeState|null=null;
  evadeLanding:number|null=null;
  linkBounce:LinkBounce|null=null;
  hylianFlash:ShieldFlash|null=null;
  knockdown:KnockdownState|null=null;
  tech={window:0,lockout:0};
  boomerangAvailable:()=>boolean=()=>true;
  downSpecial:DownState|null=null;
  downArticle:ScriptVM|null=null;
  floodCharge=0;stoneUses=0;
  itemThrow:ItemThrowState|null=null;
  itemPickup:number|null=null;
  heldBomb:()=>boolean=()=>false;
  bombAvailable:()=>boolean=()=>true;
  nearbyBomb:()=>number|null=()=>null;
  articleAvailable:(id:number)=>boolean=()=>false;
  attackSweep:{from:Direction;to:Direction}|null=null;
  readonly a:Record<string,number>;
  other!:Fighter;
  constructor(public f:Fighter,readonly data:FighterData,readonly poses:Poses){this.a=data.attributes;}
  get rangedData(){return this.copied?this.data.copies?.[this.copied].ranged:this.data.ranged;}
  clearAttack(){this.script=null;this.comboQueued=false;this.quickAttack=null;this.cutter=null;this.smashCharge=null;this.ranged=null;this.inhale=null;this.grab=null;this.side=null;this.downSpecial=null;this.downArticle=null;this.itemThrow=null;this.itemPickup=null;this.attackSweep=null;this.evade=null;this.evadeLanding=null;this.linkBounce=null;this.knockdown=null;}

  receiveHit(knockback:number){
    const f=this.f,prone=pronePhase(this.knockdown?.phase),posture=this.knockdown?.posture??'U';
    this.clearAttack();f.shieldStun=0;f.fastfall=false;
    if(prone&&f.grounded&&knockback<KNOCKDOWN_RULES.tumbleKnockback){
      this.beginFloor('damage',posture);return;
    }
    if(knockback>=KNOCKDOWN_RULES.tumbleKnockback){
      if(f.grounded){this.beginFloor('bound',posture);return;}
      this.knockdown={phase:'fly',posture,facing:f.facing};
      f.state='hitstun';f.age=0;f.clip=launchClip(f.vx,f.vy);f.poseFrame=0;
      this.script=new ScriptVM(this.data.moves[f.clip].commands);this.script.advance(0);
      return;
    }
    if(f.state!=='hitstun')f.age=0;
    f.state='hitstun';f.clip='DamageN1';f.poseFrame=0;
  }

  private floorPosture():FloorPosture {
    // Infer front-up/front-down from the animated hip's forward axis. Exact
    // native posture selection remains undecoded.
    const f=this.f,bone=this.poses.motion.bones.find(b=>b.name==='HipN')!;
    const origin=this.poses.point(f.clip,f.poseFrame,bone.index,[0,0,0],f.facing,0,0);
    const front=this.poses.point(f.clip,f.poseFrame,bone.index,[0,0,1],f.facing,0,0);
    return front.y>=origin.y?'U':'D';
  }

  private beginFloor(phase:KnockdownPhase,posture:FloorPosture,clip?:string){
    const f=this.f;
    this.clearAttack();this.knockdown={phase,posture,facing:f.facing};
    f.state=phase==='tech'?'tech':phase==='bound'?'knockdown':phase==='wait'?'downWait':phase==='damage'?'downDamage':'getup';
    const prefix=phase==='bound'?'DownBound':phase==='wait'?'DownWait':phase==='damage'?'DownDamage':phase==='attack'?'DownAttack':'DownStand';
    f.clip=clip??prefix+posture;f.age=0;f.poseFrame=0;
    f.hitstun=0;f.vx=0;f.vy=0;f.fastfall=false;f.shortHop=false;f.grounded=true;f.jumps=0;
    this.tech.window=0;this.hasHit=false;
    this.script=new ScriptVM(this.data.moves[f.clip].commands);this.script.advance(0);
  }

  private stepKnockdown(input:Input,passive:boolean):boolean {
    const f=this.f,k=this.knockdown!;
    if(!tumblePhase(k.phase)&&(!f.grounded||f.x<STAGE.left||f.x>STAGE.right)){
      const posture=k.posture;this.clearAttack();
      this.knockdown={phase:'fall',posture,facing:f.facing};
      this.state(f,'tumble','DamageFall');f.grounded=false;f.jumps=Math.max(1,f.jumps);
      this.script=new ScriptVM(this.data.moves.DamageFall.commands);
      return this.stepKnockdown(input,passive);
    }
    if(tumblePhase(k.phase)){
      if(f.hitstun>0)f.hitstun--;
      if(!f.hitstun){
        if(k.phase==='fly'){
          k.phase='fall';f.state='tumble';f.clip='DamageFall';f.age=0;f.poseFrame=0;
          this.script=new ScriptVM(this.data.moves.DamageFall.commands);
        }
        // Once hitstun ends, a fresh action can cancel tumble. Direction alone
        // preserves it so a player can steer and still attempt a floor tech.
        const jump=input.jump&&!this.previous.jump&&Math.max(1,f.jumps)<this.a.Jumps;
        const action=input.attack&&!this.previous.attack||input.shield&&!this.previous.shield||input.special&&!this.previous.special||input.neutral&&!this.previous.neutral||input.side&&!this.previous.side||input.downSpecial&&!this.previous.downSpecial;
        // A shield press in tumble is reserved for a tech while near the floor.
        const floorSoon=f.vy<0&&f.x>=STAGE.left&&f.x<=STAGE.right&&f.y<=-f.vy*KNOCKDOWN_RULES.techWindow;
        if(!passive&&(jump||action&&!(input.shield&&floorSoon))){
          this.clearAttack();this.state(f,'air','Fall');return false;
        }
        if(!passive)f.vx=approach(f.vx,input.axis*this.a['Maximum H Air Velocity'],this.a[input.axis?'Air Mobility':'Air Stopping Mobility']*KNOCKDOWN_RULES.airControl);
      }
      f.poseFrame=k.phase==='fall'?f.age%this.poses.motion.clips.DamageFall.count:Math.min(f.age,this.poses.motion.clips[f.clip].count-1);
      this.script!.advance(f.age);this.integrate(f,true,input);
      if(tumblePhase(this.knockdown?.phase)&&!f.hitstun){
        this.tryLedge(f,input);
        if(onLedge(f))this.clearAttack();
      }
      return true;
    }
    const clip=this.poses.motion.clips[f.clip];
    if(k.phase==='wait'){
      const side=Math.abs(input.axis)>.3&&(Math.abs(this.previous.axis)<=.3||input.axis*this.previous.axis<0);
      if(!passive&&input.attack&&!this.previous.attack)this.beginFloor('attack',k.posture);
      else if(!passive&&side)this.beginFloor('roll',k.posture,`Down${input.axis*k.facing>0?'Forward':'Back'}${k.posture}`);
      else if(f.age>=KNOCKDOWN_RULES.waitLimit||!passive&&(input.jump&&!this.previous.jump||input.shield&&!this.previous.shield||input.vertical>.3&&this.previous.vertical<=.3))this.beginFloor('stand',k.posture);
      else {f.poseFrame=f.age%clip.count;return true;}
    }else if(f.age>=clip.count){
      if(k.phase==='bound'||k.phase==='damage')this.beginFloor('wait',k.posture);
      else {this.clearAttack();this.state(f,'idle','Wait1');return false;}
    }
    const current=this.poses.motion.clips[f.clip],vm=this.script!,epoch=vm.hitboxEpoch;
    f.poseFrame=Math.min(f.age,current.count-1);vm.advance(f.age);
    if(vm.error)return true;
    if(vm.hitboxEpoch!==epoch)this.hasHit=false;
    const root=current.rootMotion!,frame=f.poseFrame,previous=Math.max(0,frame-1);
    const delta=(root[frame][2]-root[previous][2])*this.knockdown!.facing;
    // Ground recovery rolls stop at the platform edge, like existing dodges.
    f.vx=Math.max(STAGE.left+1e-6,Math.min(STAGE.right-1e-6,f.x+delta))-f.x;f.vy=0;
    const from={x:f.x,y:f.y};this.integrate(f);
    this.attackSweep={from,to:{x:f.x,y:f.y}};
    return true;
  }
  passiveShield(){
    const f=this.f;
    if(this.data.id!=='link'||!f.grounded||!['idle','crouch'].includes(f.state)||this.heldBomb())return null;
    const enabled=this.data.moves[f.clip]?.commands.some(c=>c.id==='120A'&&c.params[0]?.raw===LINK_SHIELD_FLAG);
    if(!enabled)return null;
    const point=(offset:number[])=>this.poses.point(f.clip,f.poseFrame,HYLIAN_SHIELD.bone,offset,f.facing,f.x,f.y);
    return {a:point(HYLIAN_SHIELD.a),b:point(HYLIAN_SHIELD.b),radius:HYLIAN_SHIELD.radius};
  }
  rebound(){
    const f=this.f;
    if(this.data.id!=='link'||f.grounded||f.state!=='aerial'||f.clip!=='AttackAirLw'||!this.script?.variables.has(LINK_REBOUND_FLAG))return;
    this.linkBounce={count:(this.linkBounce?.count??0)+1,cooldown:LINK_RESPONSE.rehitDelay};
    f.fastfall=false;f.vy=LINK_RESPONSE.lift;
    for(const h of this.script.hitboxes.values())h.damage=LINK_RESPONSE.followupDamage;
  }
  damageMultiplier(){return this.side?.kind==='skull'&&this.side.phase==='burst'?1+(SIDE_RULES.skullMaximumDamage/7-1)*this.side.charge/SIDE_RULES.charge:this.smashCharge?.phase==='release'?smashMultiplier(this.smashCharge.charge):1;}
  breakShield(){this.clearAttack();this.f.shield=0;this.f.shieldStun=0;this.state(this.f,'shieldBreak','FuraFura');}
  shieldRadius(){return this.a['Shield Size']*(.4+.6*this.f.shield/SHIELD_RULES.maximum);}
  hurtboxEnabled(bone:number){const offset=this.poses.motion.scriptBoneOffset??0;return !this.script?.boneStates.get(bone>=offset?bone:bone+offset);}
  private state(f: Fighter, state: string, clip: string) {
    if (f.state !== state) { f.state = state; f.age = 0; }
    if (f.clip !== clip) { f.clip = clip; f.poseFrame = 0; }
  }
  private beginAttack(move: Attack = 'Attack11') {
    this.state(this.f, isJab(move)?'jab':move==='AttackDash'?'dashAttack':isDirectionalAttack(move)?'tilt':isAerial(move)?'aerial':move==='Attack100Start'?'rapidStart':move==='Attack100'?'rapid':'smash', move);
    this.f.age = 0; this.f.poseFrame = 0;
    this.script = new ScriptVM(this.data.moves[move].commands);
    this.hasHit = false; this.comboQueued = false;
  }

  private stepDirectional(input:Input) {
    const f=this.f,vm=this.script!,epoch=vm.hitboxEpoch;
    f.poseFrame=f.age;vm.advance(f.age);
    if(vm.error)return;
    if(vm.hitboxEpoch!==epoch)this.hasHit=false;
    const root=this.poses.motion.clips[f.clip].rootMotion!;
    const frame=Math.min(f.age,root.length-1),before=Math.max(0,frame-1);
    // The source root supplies the travel. Feed it through stage collision,
    // so the animation cannot teleport the fighter past the platform edge.
    f.vx=(root[frame][2]-root[before][2])*f.facing;f.vy=0;
    const from={x:f.x,y:f.y};this.integrate(f);this.tryLedge(f,input);
    if(f.state==='tilt'||f.state==='dashAttack')this.attackSweep={from,to:{x:f.x,y:f.y}};
    else this.clearAttack();
  }

  private beginSmash(input:Input) {
    const move=smashAttack(input,this.data.moves);
    if(Math.abs(input.axis)>.3)this.f.facing=Math.sign(input.axis);
    this.smashCharge={phase:'start',move,charge:0};
    this.beginAttack(smashStage(move,'Start'));
  }

  private stepSmash(input:Input) {
    const f=this.f,s=this.smashCharge!;
    if(s.phase==='start'&&f.age>=this.poses.motion.clips[f.clip].count){
      s.phase=input.smash?'hold':'release';this.beginAttack(s.phase==='hold'?smashStage(s.move,'Hold'):s.move);
    }
    if(s.phase==='hold'){
      if(!input.smash||s.charge>=SMASH_RULES.maximum){s.phase='release';this.beginAttack(s.move);}
      else s.charge++;
    }
    if(s.phase==='release'){
      if(f.clip==='AttackS4S'&&this.data.moves.AttackS4S2&&this.script?.variables.has(JAB_FLAGS.combo)&&this.comboQueued){s.move='AttackS4S2';this.beginAttack(s.move);}
      else if(this.script?.interruptible||f.age>=this.poses.motion.clips[f.clip].count){
        this.clearAttack();f.vx=0;this.state(f,'idle','Wait1');return;
      }
    }
    f.poseFrame=s.phase==='hold'?Math.min(s.charge-1,this.poses.motion.clips[f.clip].count-1):f.age;
    const vm=this.script!,epoch=vm.hitboxEpoch,active=vm.hitboxes.size;vm.advance(s.phase==='hold'?0:f.age);
    if(vm.error)return;
    if(vm.hitboxes.size&&(!active||vm.hitboxEpoch!==epoch))this.hasHit=false;
    const root=this.poses.motion.clips[f.clip].rootMotion!,frame=Math.min(f.poseFrame,root.length-1),previous=Math.max(0,frame-1);
    f.vx=s.phase==='hold'?0:(root[frame][2]-root[previous][2])*f.facing;f.vy=0;
    const from={x:f.x,y:f.y};this.integrate(f);this.tryLedge(f,input);
    if(f.state==='smash')this.attackSweep={from,to:{x:f.x,y:f.y}};else this.clearAttack();
  }

  private beginRecovery(input:Input) {
    const f=this.f;
    if(input.axis)f.facing=Math.sign(input.axis);
    const quick=!!this.data.quickAttack;
    const move=quick?(f.grounded?'SpecialHiStart':'SpecialAirHiStart'):f.grounded?(this.data.moves.SpecialHiStart?'SpecialHiStart':'SpecialHi'):'SpecialAirHi';
    this.state(f,'special',move);f.age=0;f.poseFrame=0;
    f.fastfall=false;f.shortHop=false;f.vx=0;
    f.vy=this.data.id==='link'&&!f.grounded?RECOVERY_RULES.linkLift:0;
    this.script=new ScriptVM(this.data.moves[move].commands);this.hasHit=false;this.comboQueued=false;
    this.quickAttack=quick?{phase:'start',burst:1,direction:quickDirection(input,true)!,trail:[],stopped:false}:null;
    this.cutter=this.data.finalCutter?{phase:'start',air:!f.grounded,rootY:0,ceiling:false}:null;
  }

  private beginRanged(input:Input){
    const f=this.f,kind=this.rangedData!.kind;
    this.clearAttack();if(Math.abs(input.axis)>.3)f.facing=Math.sign(input.axis);
    this.ranged={kind,phase:kind==='arrow'?'draw':'throw',charge:0,bow:false,arrow:false,swordBack:false,shieldBack:false,fire:false};
    this.state(f,'ranged','');f.vx=f.grounded?0:f.vx;f.age=0;
    this.rangedClip(true);
  }

  private rangedClip(resetScript=false){
    const f=this.f,r=this.ranged!;
    const prefix=this.copied?this.data.copies![this.copied].prefix:'';
    const clip=`${prefix}Special${f.grounded?'':'Air'}N${r.phase==='throw'?'':r.phase==='draw'?'Start':r.phase==='hold'?'Loop':'End'}`;
    f.clip=clip;
    if(resetScript)this.script=new ScriptVM(this.data.moves[clip].commands,{articleAvailable:id=>this.articleAvailable(id)});
  }

  private stepRanged(input:Input){
    const f=this.f,r=this.ranged!;
    if(r.kind==='arrow'){
      if((r.phase==='draw'&&this.script?.variables.has(BOW_READY)||r.phase==='hold')&&!input.neutral){
        r.phase='release';r.arrow=false;r.fire=true;f.age=0;this.rangedClip(true);
      }else if(r.phase==='draw'){
        if(this.script?.variables.has(BOW_READY))r.charge=Math.min(RANGED_RULES.bowCharge,r.charge+1);
        if(f.age>=this.poses.motion.clips[f.clip].count){r.phase='hold';f.age=0;this.rangedClip(true);}
      }else if(r.phase==='hold')r.charge=RANGED_RULES.bowCharge;
    }
    if((r.phase==='throw'||r.phase==='release')&&(this.script?.interruptible||f.age>=this.poses.motion.clips[f.clip].count)){
      this.clearAttack();this.state(f,f.grounded?'idle':'air',f.grounded?'Wait1':'Fall');return;
    }
    this.rangedClip();const length=this.poses.motion.clips[f.clip].count;
    f.poseFrame=r.phase==='hold'?f.age%length:f.age;
    this.script!.advance(r.phase==='hold'?0:f.age);
    for(const [id,visible] of this.script!.articleVisibility){if(id===0||id===13)r.bow=visible;else if(r.phase!=='release')r.arrow=visible;}
    for(const [id,value] of this.script!.modelVisibility){if(id===1)r.swordBack=!!value;else r.shieldBack=!!value;}
    if(this.script!.error)return;
    if(f.grounded)f.vx=0;
    else {
      f.vx=approach(f.vx,input.axis*this.a['Maximum H Air Velocity']*RANGED_RULES.airControl,this.a['Air Mobility']);
      if(input.down&&!this.previous.down&&f.vy<0)f.fastfall=true;
    }
    const age=f.age;this.integrate(f);this.tryLedge(f,input);
    if(f.state==='landing'||f.state==='air'){
      // Ground/air neutral variants continue the same source clock. Touching
      // the floor must not create a second projectile or restart the throw.
      f.state='ranged';f.age=age;this.rangedClip();f.poseFrame=r.phase==='hold'?age%this.poses.motion.clips[f.clip].count:age;
    }else if(f.state!=='ranged')this.clearAttack();
  }

  private beginSide(input:Input){
    const f=this.f,kind=this.data.side!.kind;
    if(kind==='boomerang'&&!this.boomerangAvailable())return;
    this.clearAttack();if(Math.abs(input.axis)>.3)f.facing=Math.sign(input.axis);
    this.side={kind,phase:kind==='skull'?'start':kind==='boomerang'?'throw':'swing',air:!f.grounded,charge:0,article:false,fire:false,aim:input.vertical*.5};
    f.fastfall=false;f.shortHop=false;this.sidePhase(this.side.phase);
  }
  private sidePhase(phase:SideState['phase']){
    const s=this.side!,f=this.f;s.phase=phase;f.state='side';f.age=0;f.poseFrame=0;
    const prefix=`Special${s.air?'Air':''}S`;
    f.clip=s.kind==='skull'?(phase==='burst'?'SpecialS':prefix+({start:'Start',hold:'Hold',ready:'Ready',end:'End'} as Record<string,string>)[phase]):s.kind==='boomerang'?prefix+(phase==='catch'?'2':'1'):prefix;
    this.script=new ScriptVM(this.data.moves[f.clip].commands);this.hasHit=false;
    if(phase==='burst'){s.trail=[{x:f.x,y:f.y}];if(!f.grounded)f.vy=.6;}
    if(phase==='end'){f.vx*=.25;s.air=!f.grounded;f.clip=`Special${s.air?'Air':''}SEnd`;this.script=new ScriptVM(this.data.moves[f.clip].commands);}
  }
  catchBoomerang(){
    if(!['idle','walk','run','crouchStart','crouch','crouchEnd','air'].includes(this.f.state))return;
    this.clearAttack();this.side={kind:'boomerang',phase:'catch',air:!this.f.grounded,charge:0,article:true,fire:false,aim:0};this.sidePhase('catch');
  }
  private stepSide(input:Input){
    const s=this.side!,f=this.f;
    if(s.kind==='skull'){
      if(s.phase==='start'&&f.age>=this.poses.motion.clips[f.clip].count)this.sidePhase(input.side?'hold':'ready');
      if(s.phase==='hold'){if(!input.side||s.charge>=SIDE_RULES.charge)this.sidePhase('ready');else s.charge++;}
      else if(s.phase==='ready'&&f.age>=this.poses.motion.clips[f.clip].count)this.sidePhase('burst');
      else if(s.phase==='burst'&&f.age>=40)this.sidePhase('end');
    }
    if(!['start','hold','ready','burst'].includes(s.phase)&&(this.script?.interruptible||f.age>=this.poses.motion.clips[f.clip].count)){
      this.clearAttack();this.state(f,f.grounded?'idle':'air',f.grounded?'Wait1':'Fall');return;
    }
    const vm=this.script!,epoch=vm.hitboxEpoch;f.poseFrame=s.phase==='hold'?f.age%this.poses.motion.clips[f.clip].count:f.age;vm.advance(s.phase==='hold'?0:f.age);
    if(vm.error)return;if(vm.hitboxEpoch!==epoch)this.hasHit=false;
    for(const event of vm.sideEvents.splice(0)){if(event.action==='shoot'){s.fire=true;s.article=false;}else s.article=false;}
    if(s.kind==='cape'&&s.air&&!f.grounded&&f.age===10&&!this.capeLiftUsed){f.vy=.7;this.capeLiftUsed=true;}
    if(s.kind==='skull'&&s.phase==='burst')f.vx=f.age>=4?f.facing*(SIDE_RULES.skullSpeed+(SIDE_RULES.skullMaximumSpeed-SIDE_RULES.skullSpeed)*s.charge/SIDE_RULES.charge):0;
    else if(f.grounded)f.vx=0;
    else f.vx=approach(f.vx,input.axis*this.a['Maximum H Air Velocity']*.25,this.a['Air Mobility']);
    const from={x:f.x,y:f.y},age=f.age,clip=f.clip;this.integrate(f);
    if(f.state==='landing'||f.state==='air'){f.state='side';f.age=age;f.clip=clip;}
    this.tryLedge(f,input);
    if(f.state!=='side'){this.clearAttack();return;}
    if(s.kind==='skull'&&s.phase==='burst'){
      this.attackSweep={from,to:{x:f.x,y:f.y}};
      s.trail!.push({x:f.x,y:f.y});if(s.trail!.length>8)s.trail!.shift();
      if(this.stageContacts.some(c=>Math.abs(c.normal.x)>.7))this.sidePhase('end');
    }
  }

  private beginDown(input:Input){
    const f=this.f,kind=this.data.downSpecial!.kind;
    if(kind==='bomb'&&(this.heldBomb()||!this.bombAvailable()))return;
    this.clearAttack();if(Math.abs(input.axis)>.3)f.facing=Math.sign(input.axis);
    this.downSpecial={kind,phase:'start',air:!f.grounded,charge:this.floodCharge,emit:0,issued:false,aim:input.vertical*.4,form:this.stoneUses%5,armor:DOWN_RULES.stoneArmor,rootY:0,elapsed:0};
    f.fastfall=false;f.shortHop=false;
    if(kind==='stone'){this.stoneUses++;f.vy=0;}
    this.downPhase(kind==='flood'?(this.floodCharge>0?'fire':'start'):kind==='bomb'?'pull':kind==='stone'?'form':'call');
  }
  private downPhase(phase:DownState['phase']){
    const s=this.downSpecial!,f=this.f;s.phase=phase;s.elapsed=0;s.rootY=0;f.state='downSpecial';f.age=0;f.poseFrame=0;
    const prefix=`Special${s.air?'Air':''}Lw`;
    f.clip=s.kind==='flood'?prefix+(phase==='start'?'Start':phase==='charge'?'Hold':s.charge>=DOWN_RULES.floodCharge?'Heavy':'Light'):s.kind==='stone'?prefix+(phase==='exit'?'2':'1'):prefix+(phase==='hit'?'Hit':'');
    this.script=new ScriptVM(s.kind==='stone'&&['hold','land'].includes(phase)?phase==='land'?this.data.downSpecial!.stone!.ground:[]:this.data.moves[f.clip].commands);this.hasHit=false;
    if(s.kind==='flood'&&phase==='fire'){
      s.charge=this.floodCharge;this.floodCharge=0;this.downArticle=new ScriptVM(this.data.downSpecial!.pump!.commands[s.charge>=DOWN_RULES.floodCharge?'Heavy':'Light']);
    }
  }
  thunderHit(){if(this.downSpecial?.kind==='thunder'&&this.downSpecial.phase==='call'){this.downPhase('hit');this.script!.advance(0);this.f.vy=0;}}
  stoneFormed(){return this.downSpecial?.kind==='stone'&&this.downSpecial.phase!=='exit'&&this.script?.variables.has(0x22000011)||this.downSpecial?.kind==='stone'&&['hold','fall','land'].includes(this.downSpecial.phase);}
  private stepDown(input:Input){
    const s=this.downSpecial!,f=this.f;s.elapsed++;
    const pressed=input.downSpecial&&!this.previous.downSpecial;
    if(s.kind==='flood'){
      if(['start','charge'].includes(s.phase)&&input.shield){this.clearAttack();this.state(f,f.grounded?'shield':'air',f.grounded?'GuardOn':'Fall');return;}
      if(s.phase==='start'&&f.age>=20)this.downPhase('charge');
      if(s.phase==='charge'){
        this.floodCharge=Math.min(DOWN_RULES.floodCharge,this.floodCharge+1);s.charge=this.floodCharge;
        if(pressed){s.aim=input.vertical*.4;this.downPhase('fire');}
        else if(this.floodCharge===DOWN_RULES.floodCharge){this.clearAttack();this.state(f,f.grounded?'idle':'air',f.grounded?'Wait1':'Fall');return;}
      }
    }
    if(s.kind==='stone'){
      if(s.phase==='form'&&f.age>=this.poses.motion.clips[f.clip].count){s.phase=s.air?'fall':'hold';s.elapsed=0;}
      if(s.phase==='land'&&f.age>=3){s.phase='hold';s.elapsed=0;}
      if(['fall','hold'].includes(s.phase)&&((pressed&&s.elapsed>=DOWN_RULES.stoneCancel)||s.elapsed>=DOWN_RULES.stoneHold)){
        s.air=!f.grounded;this.downPhase('exit');
      }
    }
    if((s.kind!=='stone'&&!['start','charge'].includes(s.phase)||s.phase==='exit')&&(this.script?.interruptible||f.age>=this.poses.motion.clips[f.clip].count)){
      this.clearAttack();this.state(f,f.grounded?'idle':'air',f.grounded?'Wait1':'Fall');return;
    }
    const vm=this.script!,epoch=vm.hitboxEpoch;vm.advance(f.age);if(vm.error)return;if(epoch!==vm.hitboxEpoch)this.hasHit=false;
    if(s.kind==='bomb'&&!s.issued&&vm.variables.has(0x22000011)){s.emit++;s.issued=true;}
    if(s.kind==='thunder'&&!s.issued&&vm.variables.has(0x22000010)){s.emit++;s.issued=true;}
    if(s.kind==='flood'&&s.phase==='fire'){
      this.downArticle!.advance(f.age);s.emit+=this.downArticle!.generatedArticles.splice(0).length;
    }
    const clip=this.poses.motion.clips[f.clip];f.poseFrame=s.phase==='charge'?f.age%clip.count:Math.min(f.age,clip.count-1);
    if(s.kind==='stone'&&['fall','hold','land'].includes(s.phase))f.poseFrame=clip.count-1;
    const from={x:f.x,y:f.y},wasGrounded=f.grounded;let gravity=true;
    f.vx=f.grounded?0:input.axis*this.a['Maximum H Air Velocity']*.25;
    if(s.kind==='stone'){
      if(s.phase==='form'||s.phase==='exit'){
        const root=clip.rootMotion![f.poseFrame][1];f.vy=root-s.rootY;s.rootY=root;gravity=false;
        if(f.vy>0&&f.grounded){f.grounded=false;f.jumps=Math.max(1,f.jumps);}
      }else {f.vx=0;f.vy=f.grounded?0:-DOWN_RULES.stoneFall;gravity=false;}
    }
    const age=f.age,name=f.clip;this.integrate(f,gravity);
    if(f.state==='landing'||f.state==='air'){f.state='downSpecial';f.age=age;f.clip=name;}
    if(s.kind==='stone'&&!wasGrounded&&f.grounded&&s.phase==='fall'){
      s.air=false;this.downPhase('land');f.poseFrame=this.poses.motion.clips[f.clip].count-1;this.script!.advance(0);
    }
    if(s.kind==='stone'&&s.phase==='fall')this.attackSweep={from,to:{x:f.x,y:f.y}};
    if(s.kind!=='stone'||s.phase==='exit')this.tryLedge(f,input);
    if(f.state!=='downSpecial')this.clearAttack();
  }
  private beginItemThrow(input:Input){
    const f=this.f;let direction:ItemThrowState['direction']=input.grab?'Drop':input.vertical>.5?'Hi':input.vertical<-.5||input.down?'Lw':input.axis*f.facing<-.3?'B':f.state==='run'?'Dash':'F';
    if(!f.grounded&&direction==='Dash')direction='F';
    this.clearAttack();this.itemThrow={direction,strong:input.smash,release:false,offset:null,facing:f.facing};
    f.state='itemThrow';f.age=0;f.poseFrame=0;f.clip=`LightThrow${!f.grounded&&direction!=='Drop'?'Air':''}${direction}`;this.script=new ScriptVM(this.data.moves[f.clip].commands);
  }
  private beginItemPickup(id:number){
    this.clearAttack();this.itemPickup=id;this.f.state='itemPickup';this.f.age=0;this.f.poseFrame=0;this.f.clip='LightGet';this.script=new ScriptVM(this.data.moves.LightGet.commands);
  }
  private stepItem(input:Input){
    const f=this.f,vm=this.script!,reverse=vm.reverseDirection;
    if(vm.interruptible||f.age>=this.poses.motion.clips[f.clip].count){this.clearAttack();this.state(f,f.grounded?'idle':'air',f.grounded?'Wait1':'Fall');return;}
    f.poseFrame=f.age;vm.advance(f.age);if(vm.error)return;
    if(vm.reverseDirection!==reverse)f.facing=-f.facing;
    if(this.itemThrow)for(const event of vm.itemThrows.splice(0)){this.itemThrow.release=true;this.itemThrow.offset=event.offset;}
    const root=this.poses.motion.clips[f.clip].rootMotion,frame=Math.min(f.age,(root?.length??1)-1);
    f.vx=root?(root[frame][2]-root[Math.max(0,frame-1)][2])*(this.itemThrow?.facing??f.facing):f.grounded?0:f.vx;
    const age=f.age,clip=f.clip,state=f.state;this.integrate(f);this.tryLedge(f,input);
    if(f.state==='landing'||f.state==='air'){f.state=state;f.age=age;f.clip=clip;}else if(f.state!==state)this.clearAttack();
  }

  grabPhase(phase:GrabState['phase'],clip:string){
    const f=this.f;this.clearAttack();this.grab={phase,facing:f.facing};
    f.state='grab';f.clip=clip;f.age=0;f.poseFrame=0;f.vx=0;f.vy=0;
    this.script=new ScriptVM(this.data.moves[clip].commands);this.script.advance(0);this.hasHit=false;
  }
  private stepGrab(input:Input){
    const f=this.f;let g=this.grab!;
    if(g.phase==='hold'){
      const move=throwDirection(input,this.previous,f.facing);
      if(move)this.grabPhase('throw',move);
      else if(input.attack&&!this.previous.attack)this.grabPhase('pummel','CatchAttack');
    }else if(g.phase==='pummel'&&(this.script?.variables.has(JAB_FLAGS.combo)||f.age>=this.poses.motion.clips[f.clip].count))this.grabPhase('hold','CatchWait');
    else if(g.phase!=='pummel'&&(this.script?.interruptible||f.age>=this.poses.motion.clips[f.clip].count)){
      if(this.script?.reverseDirection)f.facing=-f.facing;
      this.clearAttack();this.state(f,f.grounded?'idle':'air',f.grounded?'Wait1':'Fall');return;
    }
    g=this.grab!;const vm=this.script!,epoch=vm.hitboxEpoch;f.poseFrame=g.phase==='hold'?f.age%this.poses.motion.clips[f.clip].count:f.age;
    vm.advance(f.age);if(vm.error)return;if(vm.hitboxEpoch!==epoch)this.hasHit=false;
    const root=this.poses.motion.clips[f.clip].rootMotion!,frame=Math.min(f.age,root.length-1),before=Math.max(0,frame-1);
    f.vx=g.phase==='hold'?0:(root[frame][2]-root[before][2])*f.facing;
    f.vy=g.phase==='throw'?root[frame][1]-root[before][1]:0;
    const resolved=moveAgainstStage({x:f.x,y:f.y},{x:f.x+f.vx,y:f.y+f.vy},stageBody(this.data,this.poses,f.clip,f.poseFrame,f.facing));
    f.x=resolved.position.x;f.y=resolved.position.y;this.stageContacts=resolved.contacts;
    f.grounded=Math.abs(f.y-STAGE.floor)<.01&&f.x>=STAGE.left&&f.x<=STAGE.right;
    if(!f.grounded&&g.phase!=='throw'){this.clearAttack();this.state(f,'air','Fall');}
  }

  inhalePhase(phase:InhaleState['phase']){
    this.inhale={phase};this.state(this.f,'inhale','');this.f.age=0;this.f.poseFrame=0;this.inhaleClip(true);
  }
  private inhaleClip(reset=false){
    const f=this.f,phase=this.inhale!.phase;
    const clip=phase==='drink'?'SpecialNDrink':phase==='hold'?(f.grounded?'EatWait':'EatJump2'):`Special${f.grounded?'':'Air'}N${phase[0].toUpperCase()+phase.slice(1)}`;
    f.clip=clip;if(reset){this.script=new ScriptVM(this.data.moves[clip].commands);this.script.advance(0);}
  }
  private stepInhale(input:Input){
    const f=this.f;let phase=this.inhale!.phase;
    if(phase==='start'&&f.age>=this.poses.motion.clips[f.clip].count)this.inhalePhase(input.neutral?'loop':'end');
    else if(phase==='loop'&&!input.neutral)this.inhalePhase('end');
    else if(phase==='swallow'&&f.age>=this.poses.motion.clips[f.clip].count)this.inhalePhase('hold');
    else if((phase==='spit'||phase==='drink'||phase==='end')&&f.age>=this.poses.motion.clips[f.clip].count){this.clearAttack();this.state(f,f.grounded?'idle':'air',f.grounded?'Wait1':'Fall');return;}
    phase=this.inhale!.phase;
    if(phase==='hold'&&(input.down&&!this.previous.down||input.vertical<-.5&&this.previous.vertical>=-.5)){this.inhalePhase('drink');phase='drink';}
    else if(phase==='hold'&&(input.neutral&&!this.previous.neutral||input.attack&&!this.previous.attack)){this.inhalePhase('spit');phase='spit';}
    if(phase==='hold'){
      if(Math.abs(input.axis)>.3)f.facing=Math.sign(input.axis);
      f.vx=approach(f.vx,input.axis*(f.grounded?this.a['Walk Maximum Velocity']*INHALE_RULES.carrySpeed:this.a['Maximum H Air Velocity']*INHALE_RULES.carryAirSpeed),this.a['Walk Acceleration']);
      if(f.grounded&&input.jump&&!this.previous.jump){f.grounded=false;f.jumps=Math.max(1,f.jumps);f.vy=this.a['Jump V Initial Velocity']*INHALE_RULES.carryJump;f.age=0;}
      f.clip=f.grounded?(Math.abs(f.vx)>.05?'EatWalkMiddle':'EatWait'):f.vy>0?'EatJump1':'EatJump2';
    }else{this.inhaleClip();f.vx=f.grounded?0:approach(f.vx,input.axis*this.a['Maximum H Air Velocity']*.3,this.a['Air Mobility']);}
    f.poseFrame=phase==='loop'||phase==='hold'?f.age%this.poses.motion.clips[f.clip].count:f.age;
    this.script!.advance(f.age);if(this.script!.error)return;
    const age=f.age;this.integrate(f);
    if(phase!=='hold'&&phase!=='swallow'&&phase!=='drink')this.tryLedge(f,input);
    if(f.state==='landing'||f.state==='air'){
      f.state='inhale';f.age=age;this.inhaleClip();f.poseFrame=phase==='loop'||phase==='hold'?age%this.poses.motion.clips[f.clip].count:age;
    }else if(f.state!=='inhale')this.clearAttack();
  }

  private cutterPhase(phase:'arc'|'fall'|'land') {
    const f=this.f,c=this.cutter!;
    c.phase=phase;f.age=0;f.poseFrame=0;
    f.state='special';f.clip=`Special${c.air?'Air':''}Hi${phase==='arc'?2:phase==='fall'?3:4}`;
    // Hi3 holds the descending blade. Keep the active Hi2 collision instead
    // of losing it when switching to the empty hold-animation script.
    if(phase!=='fall'){
      this.script=new ScriptVM(this.data.moves[f.clip].commands);this.hasHit=false;
    }
    if(phase==='land'){f.vx=0;f.vy=0;this.attackSweep=null;}
    else this.script!.ledgeGrab=2;
  }

  private stepCutter(input:Input) {
    const f=this.f,c=this.cutter!;
    if(c.phase==='start'&&f.age>=this.poses.motion.clips[f.clip].count)this.cutterPhase('arc');
    else if(c.phase==='arc'&&f.age>=this.poses.motion.clips[f.clip].count)this.cutterPhase('fall');
    else if(c.phase==='land'&&f.age>=this.poses.motion.clips[f.clip].count){this.finishRecovery();return;}
    const vm=this.script!,epoch=vm.hitboxEpoch;
    if(c.phase!=='fall')vm.advance(f.age);
    if(vm.error)return;
    if(vm.hitboxEpoch!==epoch)this.hasHit=false;
    f.poseFrame=Math.min(f.age,this.poses.motion.clips[f.clip].count-1);
    f.vx=c.phase==='land'?0:input.axis*this.a['Maximum H Air Velocity']*CUTTER_RULES.steering;
    if(c.phase==='start')f.vx=0;
    if(c.phase==='start'||c.phase==='arc'){
      const root=this.poses.motion.clips[f.clip].rootMotion![f.poseFrame][1];
      f.vy=root-c.rootY;c.rootY=root;
      if(c.ceiling)f.vy=Math.min(0,f.vy);
      if(f.vy>0&&f.grounded){f.grounded=false;f.jumps=Math.max(1,f.jumps);}
    } else f.vy=c.phase==='fall'?-CUTTER_RULES.fallSpeed:0;
    const from={x:f.x,y:f.y},wasAir=!f.grounded;
    this.integrate(f,false);
    if(!this.cutter)return;
    if(this.stageContacts.some(hit=>hit.plane.type==='Ceiling'))c.ceiling=true;
    if(wasAir&&f.grounded&&c.phase!=='land'){
      this.cutterPhase('land');this.script!.advance(0);return;
    }
    // Sweep the fast original rise through hurtboxes as well as the stage.
    if(c.phase==='arc'||c.phase==='fall')this.attackSweep={from,to:{x:f.x,y:f.y}};
    this.tryLedge(f,input);
    if(f.state!=='special')this.clearAttack();
  }

  private beginQuickBurst(direction:Direction) {
    const f=this.f,q=this.quickAttack!;
    q.phase='burst';q.direction=direction;if(q.burst===1)q.trail=[{x:f.x,y:f.y}];q.stopped=false;
    f.age=0;f.fastfall=false;
    if(direction.x)f.facing=Math.sign(direction.x);
    if(direction.y!==0){f.grounded=false;f.jumps=Math.max(1,f.jumps);}
    f.clip=f.grounded?'SpecialHiStart':'SpecialAirHiStart';
    f.poseFrame=this.poses.motion.clips[f.clip].count-1;
    this.script=new ScriptVM(this.data.quickAttack!.bursts[q.burst-1].commands);
    this.script.ledgeGrab=2;this.hasHit=false;
  }

  private endQuickBurst() {
    const f=this.f,q=this.quickAttack!;
    q.phase=q.burst===1?'turn':'end';f.age=0;f.vx=0;f.vy=0;
    f.clip=f.grounded?'SpecialHiEnd':'SpecialAirHiEnd';f.poseFrame=0;
    this.script=new ScriptVM(this.data.moves[f.clip].commands);this.script.ledgeGrab=2;
    this.hasHit=false;
  }

  private stepQuickAttack(input:Input) {
    const f=this.f,q=this.quickAttack!;
    if(q.phase==='start') {
      q.direction=quickDirection(input,true)!;
      if(f.age>=this.poses.motion.clips[f.clip].count)this.beginQuickBurst(q.direction);
    } else if(q.phase==='burst'&&(q.stopped||f.age>=QUICK_ATTACK_RULES.burstFrames))this.endQuickBurst();
    if(q.phase==='turn'||q.phase==='end') {
      this.script!.advance(f.age);
      if(q.phase==='turn'&&this.script!.integers.has(QUICK_ATTACK_RULES.endCounter)) {
        const direction=quickDirection(input);
        if(canRedirect(q.direction,direction)){q.burst=2;this.beginQuickBurst(direction);}
        else q.phase='end';
      }
      if(q.phase==='end'&&f.age>=this.poses.motion.clips[f.clip].count){
        this.finishRecovery();this.integrate(f);this.tryLedge(f,input);return;
      }
    }
    this.script!.advance(f.age);if(this.script!.error)return;
    if(q.phase==='burst') {
      f.vx=q.direction.x*QUICK_ATTACK_RULES.speed;f.vy=q.direction.y*QUICK_ATTACK_RULES.speed;
      const from={x:f.x,y:f.y};this.integrate(f,false);
      // The stage solver supplies the actual endpoint: a burst cannot hit or
      // draw a trail beyond the wall that stopped it.
      if(this.quickAttack) {
        this.attackSweep={from,to:{x:f.x,y:f.y}};
        q.trail.push({x:f.x,y:f.y});if(q.trail.length>8)q.trail.shift();
      }
      this.tryLedge(f,input);
      if(f.state!=='special'){this.clearAttack();return;}
      if(this.stageContacts.length)q.stopped=true;
    } else {
      f.poseFrame=Math.min(f.age,this.poses.motion.clips[f.clip].count-1);
      if(q.phase==='start'||q.phase==='turn'){f.vx=0;f.vy=0;this.integrate(f,false);}
      else {
        f.vx=approach(f.vx,input.axis*this.a['Maximum H Air Velocity']*RECOVERY_RULES.airControl,this.a['Air Mobility']);
        this.integrate(f);
      }
      this.tryLedge(f,input);
      if(f.state!=='special')this.clearAttack();
    }
  }

  private finishRecovery() {
    this.clearAttack();
    this.state(this.f,this.f.grounded?'idle':'fallSpecial',this.f.grounded?'Wait1':'FallSpecial');
    this.f.poseFrame=0;
  }

  private stepRecovery(input:Input) {
    if(this.quickAttack){this.stepQuickAttack(input);return;}
    if(this.cutter){this.stepCutter(input);return;}
    const f=this.f;
    if(f.age>=this.poses.motion.clips[f.clip].count) {
      if(f.clip==='SpecialHiStart') {
        this.state(f,'special','SpecialHi');f.age=0;f.poseFrame=0;
        this.script=new ScriptVM(this.data.moves.SpecialHi.commands);this.hasHit=false;
      } else {this.finishRecovery();this.integrate(f);this.tryLedge(f,input);return;}
    }
    f.poseFrame=f.age;
    const vm=this.script!,epoch=vm.hitboxEpoch;vm.advance(f.age);
    if(vm.error)return;
    if(vm.hitboxEpoch!==epoch)this.hasHit=false;
    const root=this.poses.motion.clips[f.clip].rootMotion;
    const nativeLift=this.data.id==='mario'&&root;
    if(nativeLift) {
      const frame=Math.min(f.age,root.length-1),before=Math.max(0,frame-1);
      f.vx=(root[frame][2]-root[before][2])*f.facing+(f.grounded?0:input.axis*RECOVERY_RULES.marioSteering);
      f.vy=root[frame][1]-root[before][1];
      if(f.vy>0&&f.grounded){f.grounded=false;f.jumps=Math.max(1,f.jumps);}
      if(f.grounded)f.vy=0;
    } else if(!f.grounded) {
      f.vx=approach(f.vx,input.axis*this.a['Maximum H Air Velocity']*RECOVERY_RULES.airControl,this.a['Air Mobility']);
    }
    this.integrate(f,!nativeLift);
    this.tryLedge(f,input);
    if(f.state!=='special')this.clearAttack();
    else if(nativeLift&&this.stageContacts.some(c=>c.plane.type==='Ceiling'))this.finishRecovery();
  }

  landingDuration(f: Fighter) {
    if(this.evadeLanding!==null)return this.evadeLanding;
    if(f.clip==='LandingFallSpecial')return this.data.quickAttack?QUICK_ATTACK_RULES.landing:RECOVERY_RULES.landing;
    return aerialFromLanding(f.clip)?aerialLandingLag(this.data,f.clip):this.a['Normal Landing Lag'];
  }

  private tryLedge(f:Fighter,input:Input) {
    const recovery=f.state==='special'||f.state==='side'&&this.side?.kind==='skull',mode=recovery?this.script?.ledgeGrab??0:2;
    if(f.grounded || (f.vy>0&&!recovery) || (recovery&&mode===0) || f.hitstun>0 || f.ledgeCooldown>0 || input.down || onLedge(f))return;
    const edge=LEDGES.find(edge=>{
      const outside=(f.x-edge.x)*edge.side;
      const other=this.other;
      return (mode!==1||f.facing===edge.inward) && outside>=0 && outside<=LEDGE_RULES.reach && f.y>=edge.y+LEDGE_RULES.bottom &&
        f.y<=edge.y+LEDGE_RULES.top && input.axis*edge.inward>=0 && other.ledgeSide!==edge.side;
    });
    if(!edge)return;
    f.x=edge.x;f.y=edge.y;f.facing=edge.inward;f.vx=0;f.vy=0;
    f.ledgeSide=edge.side;f.jumps=0;f.fastfall=false;f.shortHop=false;
    f.invincible=LEDGE_RULES.invincibility;
    this.state(f,'ledgeCatch','CliffCatch');f.poseFrame=0;
    if(f===this.f){this.script=null;this.comboQueued=false;}
  }

  private releaseLedge(f:Fighter,jump:boolean) {
    // Ledge clips use the edge as their origin. Transfer the final translation
    // into simulation position when returning to a normal airborne pose.
    const root=this.poses.root(f.clip,f.poseFrame,f.facing);
    f.x+=root.x;f.y+=root.y;
    const slow=f.clip.includes('Slow');
    f.ledgeSide=0;f.ledgeCooldown=LEDGE_RULES.regrabDelay;f.invincible=0;
    f.fastfall=false;f.grounded=false;f.jumps=1;
    f.vx=jump?f.facing*this.a['Maximum H Air Velocity']:-f.facing*.35;
    f.vy=jump?this.a['Jump V Initial Velocity']:-.2;
    const clip=jump?(slow?'CliffJumpSlow2':'CliffJumpQuick2'):'Fall';
    this.state(f,'air',clip);f.poseFrame=0;
  }

  private stepLedge(f:Fighter,input:Input,previous:Input) {
    if(!onLedge(f))return false;
    f.vx=0;f.vy=0;
    if(f.state==='ledgeCatch' && f.age>=this.poses.motion.clips.CliffCatch.count) {
      this.state(f,'ledgeHang','CliffWait');f.poseFrame=0;
    } else if(f.state==='ledgeHang') {
      const inward=input.axis*f.facing,previousInward=previous.axis*f.facing;
      if((input.down && !previous.down) || (inward<-.3 && previousInward>=-.3) || f.age>=LEDGE_RULES.hangLimit) {
        this.releaseLedge(f,false);
      } else if(input.jump && !previous.jump) {
        this.state(f,'ledgeJump',f.damage>=100?'CliffJumpSlow1':'CliffJumpQuick1');
      } else if(input.attack&&!previous.attack||input.shield&&!previous.shield) {
        const attack=input.attack&&!previous.attack;
        this.clearAttack();f.invincible=0;
        this.state(f,attack?'ledgeAttack':'ledgeRoll',`${attack?'CliffAttack':'CliffEscape'}${f.damage>=100?'Slow':'Quick'}`);
        this.script=new ScriptVM(this.data.moves[f.clip].commands);this.script.advance(0);this.hasHit=false;
      } else if(inward>.3 && previousInward<=.3) {
        this.state(f,'ledgeClimb',f.damage>=100?'CliffClimbSlow':'CliffClimbQuick');
      } else f.poseFrame++;
    } else if(['ledgeAttack','ledgeRoll'].includes(f.state)) {
      const length=this.poses.motion.clips[f.clip].count;
      if(f.age>=length){
        const root=this.poses.root(f.clip,length-1,f.facing);
        f.x+=root.x;f.y=STAGE.floor;f.grounded=true;f.jumps=0;f.ledgeSide=0;
        f.ledgeCooldown=LEDGE_RULES.regrabDelay;f.invincible=0;
        this.clearAttack();this.state(f,'idle','Wait1');
      }else{
        f.poseFrame=f.age;const epoch=this.script!.hitboxEpoch;this.script!.advance(f.age);
        if(this.script!.hitboxEpoch!==epoch)this.hasHit=false;
      }
    } else if(f.state==='ledgeClimb' && f.age>=this.poses.motion.clips[f.clip].count) {
      const root=this.poses.root(f.clip,this.poses.motion.clips[f.clip].count-1,f.facing);
      f.x+=root.x;f.y=STAGE.floor;f.grounded=true;f.jumps=0;f.ledgeSide=0;
      this.state(f,'idle','Wait1');
    } else if(f.state==='ledgeJump' && f.age>=this.poses.motion.clips[f.clip].count) {
      this.releaseLedge(f,true);
    } else f.poseFrame=f.age;
    return true;
  }

  private beginEvade(input:Input){
    const f=this.f,kind=!f.grounded?'air':input.down||input.vertical<-.3?'spot':'roll';
    const clip=kind==='air'?'EscapeAir':kind==='spot'?'EscapeN':input.axis*f.facing>0?'EscapeF':'EscapeB';
    this.clearAttack();const commands=this.data.moves[clip].commands;
    this.evade={kind,facing:f.facing,scriptEnd:hasDefenseInterrupt(commands)};
    this.state(f,'evade',clip);f.age=0;f.poseFrame=0;f.fastfall=false;f.shortHop=false;
    if(f.grounded){f.vx=0;f.vy=0;}
    this.script=new ScriptVM(commands);
  }

  private stepEvade(input:Input){
    const f=this.f,e=this.evade!,vm=this.script!,clip=this.poses.motion.clips[f.clip];
    vm.advance(f.age);f.poseFrame=Math.min(f.age,clip.count-1);
    if(vm.error)return true;
    if(vm.interruptible||!e.scriptEnd&&f.age>=clip.count){
      if(vm.reverseDirection)f.facing=-e.facing;
      if(f.grounded)f.vx=0;
      this.clearAttack();this.state(f,f.grounded?'idle':'air',f.grounded?'Wait1':'Fall');
      return false;
    }
    if(e.kind==='air'){
      const control=vm.airGroundMode===0?1:DEFENSE_RULES.airControl;
      f.vx=approach(f.vx,input.axis*this.a['Maximum H Air Velocity'],this.a[input.axis?'Air Mobility':'Air Stopping Mobility']*control);
      this.integrate(f);this.tryLedge(f,input);
      if(f.state!=='evade'){
        const landed=f.state==='landing';this.clearAttack();
        if(landed)this.evadeLanding=DEFENSE_RULES.landingLag;
      }
    }else{
      const root=clip.rootMotion!,frame=Math.min(f.age,root.length-1);
      const delta=e.kind==='roll'?(root[frame][2]-(f.age?root[Math.max(0,frame-1)][2]:0))*e.facing:0;
      f.vx=Math.max(STAGE.left,Math.min(STAGE.right,f.x+delta))-f.x;f.vy=0;
      this.integrate(f);
    }
    return true;
  }

  step(input:Input,other:Fighter,passive=false) {
    this.stageContacts=[];
    this.attackSweep=null;
    this.other=other;
    const p=this.f;
    if(this.hylianFlash&&--this.hylianFlash.ticks<=0)this.hylianFlash=null;
    const pressedJump=input.jump&&!this.previous.jump,pressedAttack=input.attack&&!this.previous.attack;
    if(p.state==='jab'&&(nextJab(p.clip,this.data.moves)||this.data.moves.Attack100||this.data.jabRepeat)&&pressedAttack)this.comboQueued=true;
    if(p.state==='smash'&&p.clip==='AttackS4S'&&this.data.moves.AttackS4S2&&input.smash&&!this.previous.smash)this.comboQueued=true;
    const frozen=p.hitlag>0;
    if(!frozen){this.tech.window=Math.max(0,this.tech.window-1);this.tech.lockout=Math.max(0,this.tech.lockout-1);}
    if(!passive&&!p.grounded&&!p.ledgeSide&&!['ko','respawn','captured','spitStar'].includes(p.state)&&input.shield&&!this.previous.shield&&this.tech.lockout===0){
      this.tech.window=KNOCKDOWN_RULES.techWindow;this.tech.lockout=KNOCKDOWN_RULES.techLockout;
    }
    if(frozen){p.hitlag--;this.previous={...input};return true;}
    p.age++;
    if(p.grounded||onLedge(p))this.capeLiftUsed=false;
    p.ledgeCooldown=Math.max(0,p.ledgeCooldown-1);p.invincible=Math.max(0,p.invincible-1);
    if(p.state==='ko'){this.previous={...input};return false;}
    if(p.state==='respawn') {
      if(p.age>=60)this.state(p,'air','Fall');
      this.previous={...input};return false;
    }
    if(p.state==='captured'||p.state==='spitStar'){this.previous={...input};return false;}
    if(!shielding(p)&&p.state!=='shieldBreak')p.shield=Math.min(SHIELD_RULES.maximum,p.shield+SHIELD_RULES.regen);
    if(this.knockdown&&this.stepKnockdown(input,passive)){this.previous={...input};return false;}
    if(passive) {
      p.poseFrame++;
      if(p.hitstun>0)p.hitstun--;
      if(p.grounded)p.vx=approach(p.vx,0,this.a['Stopping Velocity']);
      this.integrate(p);
      if(!p.hitstun&&p.grounded)this.state(p,'idle','Wait1');
      this.previous={...input};return false;
    }
    if(this.stepLedge(p,input,this.previous)){this.previous={...input};return false;}
    if(p.hitstun>0) {
      p.hitstun--;p.poseFrame++;
      if(p.grounded)p.vx=approach(p.vx,0,this.a['Stopping Velocity']);
      this.integrate(p);
      if(!p.hitstun)this.state(p,p.grounded?'idle':'air',p.grounded?'Wait1':'Fall');
      this.previous={...input};return false;
    }
    if(this.evade&&this.stepEvade(input)){this.previous={...input};return false;}
    if(p.state==='shieldBreak') {
      this.integrate(p);p.poseFrame=p.age;
      if(p.age>=SHIELD_RULES.breakStun){p.shield=30;this.state(p,p.grounded?'idle':'air',p.grounded?'Wait1':'Fall');}
      this.previous={...input};return false;
    }
    if(p.shieldStun===0&&['idle','walk','run','crouchStart','crouch','crouchEnd','air','shield'].includes(p.state)&&this.heldBomb()&&(pressedAttack||input.smash&&!this.previous.smash||input.grab&&!this.previous.grab))this.beginItemThrow(input);
    if(p.grounded&&['idle','walk','run','crouchStart','crouch','crouchEnd'].includes(p.state)&&pressedAttack&&!this.heldBomb()){
      const item=this.nearbyBomb();if(item!==null)this.beginItemPickup(item);
    }
    if(p.state==='itemThrow'||p.state==='itemPickup'){this.stepItem(input);this.previous={...input};return false;}
    if(input.downSpecial&&!this.previous.downSpecial&&this.data.downSpecial&&['idle','walk','run','crouchStart','crouch','crouchEnd','air'].includes(p.state))this.beginDown(input);
    if(p.state==='downSpecial'){this.stepDown(input);this.previous={...input};return false;}
    if(p.grounded&&p.shieldStun===0&&['idle','walk','run','crouchStart','crouch','crouchEnd','shield'].includes(p.state)&&this.data.moves.Catch&&
       (input.grab&&!this.previous.grab||input.shield&&pressedAttack)){
      const pivot=p.state==='run'&&input.axis*p.facing<-.3;
      const clip=pivot?'CatchTurn':p.state==='run'?'CatchDash':'Catch';
      if(!pivot&&Math.abs(input.axis)>.3)p.facing=Math.sign(input.axis);
      this.grabPhase('reach',clip);
    }
    if(p.state==='grab'){this.stepGrab(input);this.previous={...input};return false;}
    if(this.copied&&input.shield&&input.neutral&&!this.previous.neutral&&p.shieldStun===0&&['idle','walk','run','crouchStart','crouch','crouchEnd','air','shield'].includes(p.state)){
      this.copied=null;this.clearAttack();this.state(p,p.grounded?'idle':'air',p.grounded?'Wait1':'Fall');this.previous={...input};return false;
    }
    if(input.neutral&&!this.previous.neutral&&this.data.inhale&&!this.copied&&['idle','walk','run','crouchStart','crouch','crouchEnd','air'].includes(p.state)){
      this.clearAttack();if(Math.abs(input.axis)>.3)p.facing=Math.sign(input.axis);this.inhalePhase('start');
    }
    if(p.state==='inhale'){this.stepInhale(input);this.previous={...input};return false;}
    if(input.side&&!this.previous.side&&this.data.side&&['idle','walk','run','crouchStart','crouch','crouchEnd','air'].includes(p.state))this.beginSide(input);
    if(p.state==='side'){this.stepSide(input);this.previous={...input};return false;}
    if(input.neutral&&!this.previous.neutral&&this.rangedData&&['idle','walk','run','crouchStart','crouch','crouchEnd','air'].includes(p.state))this.beginRanged(input);
    if(p.state==='ranged'){this.stepRanged(input);this.previous={...input};return false;}
    if(input.special&&!this.previous.special&&(this.data.moves.SpecialAirHi||this.data.quickAttack)&&
      ['idle','walk','run','crouchStart','crouch','crouchEnd','air','shield'].includes(p.state)&&p.shieldStun===0)this.beginRecovery(input);
    if(p.state==='special') {
      this.stepRecovery(input);this.previous={...input};return false;
    }
    const freshShield=input.shield&&!this.previous.shield;
    const freshSide=Math.abs(input.axis)>.3&&(Math.abs(this.previous.axis)<=.3||input.axis*this.previous.axis<0);
    const crouch=input.down||input.vertical<-.3,freshDown=crouch&&!(this.previous.down||this.previous.vertical<-.3);
    if(input.shield&&!pressedJump&&!pressedAttack&&!input.smash&&!input.grab&&p.shieldStun===0&&
       (p.grounded&&['idle','walk','run','crouchStart','crouch','crouchEnd','shield'].includes(p.state)&&(crouch&&(freshShield||freshDown)||!crouch&&Math.abs(input.axis)>.3&&(freshShield||freshSide))||!p.grounded&&p.state==='air'&&freshShield)){
      this.beginEvade(input);this.stepEvade(input);this.previous={...input};return false;
    }
    if(shielding(p)) {
      p.vx=approach(p.vx,0,this.a['Stopping Velocity']);
      if(p.shieldStun>0){p.shieldStun--;p.poseFrame++;}
      else if(pressedJump){this.state(p,'jumpSquat','JumpSquat');p.shortHop=false;}
      else if(!input.shield)this.state(p,'shieldRelease','GuardOff');
      else {p.clip='GuardOn';p.poseFrame=Math.min(p.poseFrame+1,this.poses.motion.clips.GuardOn.count-1);}
      p.shield=Math.max(0,p.shield-SHIELD_RULES.drain);
      if(p.shield===0)this.breakShield();
      this.integrate(p);
      this.previous={...input};return false;
    }
    if(p.state==='shieldRelease'&&p.age>=this.poses.motion.clips.GuardOff.count)this.state(p,'idle','Wait1');
    if(p.state==='jab') {
      const next=nextJab(p.clip,this.data.moves),canChain=this.script?.variables.has(JAB_FLAGS.combo);
      const heldFollowup=input.attack&&this.hasHit&&this.script?.variables.has(JAB_FLAGS.auto);
      if(!this.script?.error&&next&&canChain&&(this.comboQueued||heldFollowup))this.beginAttack(next);
      else if(!this.script?.error&&this.data.jabRepeat&&this.script?.variables.has(JAB_FLAGS.auto)&&
        (this.comboQueued||input.attack))this.beginAttack('Attack11');
      else if(!this.script?.error&&!next&&this.data.moves.Attack100&&this.script?.variables.has(JAB_FLAGS.rapid)&&
        (this.comboQueued||heldFollowup))this.beginAttack('Attack100Start');
      else if(!this.script?.error&&(this.script?.interruptible||p.age>=this.poses.motion.clips[p.clip].count)) {
        this.clearAttack();this.state(p,'idle','Wait1');
      }
    }
    if(p.state==='rapidStart'&&p.age>=this.poses.motion.clips.Attack100Start.count)this.beginAttack('Attack100');
    if(p.state==='rapid') {
      // Repeat/release is a reconstructed common-state transition. The original
      // pulse cycle supplies its continuation flag at 18; Flow 03 is undecoded.
      if(!input.attack&&this.script?.variables.has(JAB_FLAGS.rapidContinue)){
        this.clearAttack();this.state(p,'idle','Wait1');
      } else if(p.age>=this.poses.motion.clips.Attack100.count-1)this.beginAttack('Attack100');
    }
    if(p.state==='smash'){this.stepSmash(input);this.previous={...input};return false;}
    if(['aerial','tilt','dashAttack'].includes(p.state)&&!this.script?.error&&
      (this.script?.interruptible||p.age>=this.poses.motion.clips[p.clip].count)) {
      if(p.state==='tilt'||p.state==='dashAttack')p.vx=0;
      this.clearAttack();this.state(p,p.grounded?'idle':'air',p.grounded?'Wait1':'Fall');
    }
    if(p.state==='landing'&&p.age>=this.landingDuration(p)){this.clearAttack();this.state(p,'idle','Wait1');}
    if(p.grounded&&!['jab','smash','tilt','dashAttack','rapid','rapidStart','landing','jumpSquat','shieldRelease'].includes(p.state)) {
      if(pressedJump){this.state(p,'jumpSquat','JumpSquat');p.shortHop=false;}
      else if(input.shield){this.state(p,'shield','GuardOn');p.poseFrame=0;}
      else if(input.smash&&!this.previous.smash)this.beginSmash(input);
      else if(pressedAttack){
        const move=groundAttack(input,p.state==='run',this.data.moves);
        if(isDirectionalAttack(move)&&Math.abs(input.axis)>.3)p.facing=Math.sign(input.axis);
        this.beginAttack(move);
      }
      else if((input.down||input.vertical<-.3)&&Math.abs(input.axis)<.3){
        if(!['crouchStart','crouch'].includes(p.state))this.state(p,'crouchStart','Squat');
        if(p.state==='crouchStart'&&p.age>=this.poses.motion.clips.Squat.count)this.state(p,'crouch',this.heldBomb()?'SquatWaitItem':'SquatWait');
        if(p.state==='crouch')p.clip=this.heldBomb()?'SquatWaitItem':'SquatWait';
        p.vx=approach(p.vx,0,this.a['Stopping Velocity']);
      }
      else if(p.state.startsWith('crouch')&&!input.axis){
        if(p.state!=='crouchEnd')this.state(p,'crouchEnd','SquatRv');
        else if(p.age>=this.poses.motion.clips.SquatRv.count)this.state(p,'idle',this.heldBomb()?'WaitItem':'Wait1');
        p.vx=approach(p.vx,0,this.a['Stopping Velocity']);
      }
      else {
        const speed=input.run?this.a['Run Initial Velocity']:this.a['Walk Maximum Velocity'];
        if(input.axis){p.facing=Math.sign(input.axis);this.state(p,input.run?'run':'walk',input.run?'Run':'WalkMiddle');p.vx=approach(p.vx,input.axis*speed,this.a['Walk Acceleration']);}
        else {this.state(p,'idle',this.heldBomb()?'WaitItem':'Wait1');p.vx=approach(p.vx,0,this.a['Stopping Velocity']);}
      }
    }
    if(p.state==='tilt'||p.state==='dashAttack'){this.stepDirectional(input);this.previous={...input};return false;}
    if(p.state==='smash'){this.stepSmash(input);this.previous={...input};return false;}
    if(p.state==='jumpSquat') {
      if(!input.jump)p.shortHop=true;
      if(p.age>=this.a['Jump Startup Time']) {
        p.grounded=false;p.jumps=1;p.vy=this.a[p.shortHop?'Hop V Initial Velocity':'Jump V Initial Velocity'];this.state(p,'air','JumpF');
      }
    } else if(!p.grounded) {
      if(p.state!=='aerial'&&p.state!=='fallSpecial'&&pressedJump&&Math.max(1,p.jumps)<this.a.Jumps){
        const jumpIndex=Math.max(0,p.jumps-1);
        p.vy=this.data.airJumps?.[jumpIndex]??this.a['Jump V Initial Velocity']*this.a['Air Jump Multiplier'];
        p.jumps=Math.max(1,p.jumps)+1;p.fastfall=false;p.clip=this.data.airJumps&&jumpIndex>0?`JumpAerialF${jumpIndex+1}`:'JumpAerialF';p.poseFrame=0;
      }
      if(p.state==='air'&&pressedAttack)this.beginAttack(aerialAttack(input,p.facing));
      if(input.down&&!this.previous.down&&p.vy<0)p.fastfall=true;
      p.vx=approach(p.vx,input.axis*this.a['Maximum H Air Velocity']*(p.state==='fallSpecial'?RECOVERY_RULES.airControl:1),this.a[input.axis?'Air Mobility':'Air Stopping Mobility']);
    }
    if(p.grounded&&['jab','smash','rapid','rapidStart','jumpSquat','landing','shieldRelease','shield'].includes(p.state))p.vx=approach(p.vx,0,this.a['Stopping Velocity']);
    if(p.state==='aerial') {
      p.poseFrame=p.age;const epoch=this.script!.hitboxEpoch,active=this.script!.hitboxes.size;this.script!.advance(p.age);
      if(this.script!.hitboxes.size&&(!active||this.script!.hitboxEpoch!==epoch))this.hasHit=false;
      if(this.linkBounce){
        if(this.linkBounce.cooldown>0&&--this.linkBounce.cooldown===0)this.hasHit=false;
        for(const h of this.script!.hitboxes.values())h.damage=LINK_RESPONSE.followupDamage;
      }
      if(this.script!.error){this.previous={...input};return false;}
    }
    this.integrate(p);this.tryLedge(p,input);
    const aerialLanding=p.state==='landing'&&aerialFromLanding(p.clip);
    if(!['jab','smash','aerial','rapid','rapidStart'].includes(p.state)&&!aerialLanding&&!(p.state==='landing'&&this.evadeLanding!==null))this.clearAttack();
    const fall=this.data.airJumps&&p.jumps>1?'FallAerial':'Fall';
    if(p.state==='air'&&p.vy<=0&&p.clip!==fall){p.clip=fall;p.poseFrame=0;}
    if(['jab','smash','rapid','rapidStart'].includes(p.state)){
      p.poseFrame=p.age;const inactive=!this.script!.hitboxes.size;this.script!.advance(p.age);
      if(p.state==='rapid'&&inactive&&this.script!.hitboxes.size)this.hasHit=false;
    }
    else if(p.state==='landing'&&(aerialLanding||p.clip==='LandingFallSpecial')){
      p.poseFrame=Math.floor(p.age*(this.poses.motion.clips[p.clip].count-1)/Math.max(1,this.landingDuration(p)-1));
      if(aerialLanding&&this.script)this.script.advance(p.age);
    }
    else if(p.state==='crouch')p.poseFrame=p.age%this.poses.motion.clips[p.clip].count;
    else if(p.state==='crouchStart'||p.state==='crouchEnd')p.poseFrame=Math.min(p.age,this.poses.motion.clips[p.clip].count-1);
    else if(p.state!=='aerial'&&!onLedge(p))p.poseFrame++;
    this.previous={...input};return false;
  }
  private integrate(f: Fighter,gravity=true,input=neutralInput()) {
    const start={x:f.x,y:f.y},desired={x:f.x+f.vx,y:f.y};
    const leftFloor=f.grounded&&(desired.x<STAGE.left||desired.x>STAGE.right);
    if (leftFloor) {
      f.grounded=false; f.jumps=Math.max(1,f.jumps);
      if(f.state==='special'){if(!this.quickAttack)this.finishRecovery();}else if(!this.knockdown)this.state(f,'air','Fall');
    }
    if (!f.grounded) {
      const terminal=this.a[f.fastfall?'Fastfall Terminal Velocity':'Terminal Velocity'];
      if(gravity)f.vy=f.fastfall?-terminal:Math.max(-terminal,f.vy-this.a.Gravity);
      desired.y+=f.vy;
    }
    // A walking fighter whose foot leaves the floor begins falling this tick.
    // The surface behind it must not consume that first downward movement.
    const planes=leftFloor?STAGE_PLANES.filter(p=>p.type!=='Floor'):STAGE_PLANES;
    const resolved=moveAgainstStage(start,desired,stageBody(this.data,this.poses,f.clip,f.poseFrame,f.facing),planes);
    this.stageContacts=resolved.contacts;f.x=resolved.position.x;f.y=resolved.position.y;
    const velocity=clipStageVelocity({x:f.vx,y:f.vy},resolved.contacts);
    const floorContact=resolved.contacts.some(c=>c.plane.type==='Floor'&&c.normal.y>.7);
    if(!f.grounded&&floorContact&&f.vy<=0&&f.x>=STAGE.left&&f.x<=STAGE.right) {
        f.y=STAGE.floor; f.vy=0; f.grounded=true; f.jumps=0; f.fastfall=false;
        if(tumblePhase(this.knockdown?.phase)){
          const posture=this.floorPosture();
          if(this.tech.window>0)this.beginFloor('tech',posture,Math.abs(input.axis)>.3?`PassiveStand${input.axis*f.facing>0?'F':'B'}`:'Passive');
          else this.beginFloor('bound',posture);
          return;
        }
        const aerialLanding=f===this.f && f.state==='aerial' && this.script?.variables.has(LANDING_LAG_FLAG);
        const specialLanding=f.state==='special'||f.state==='fallSpecial';
        const landingClip=aerialLanding?f.clip.replace('AttackAir','LandingAir'):'Wait1';
        this.state(f,'landing',specialLanding?'LandingFallSpecial':landingClip);
        if(aerialLanding){
          this.clearAttack();
          const commands=this.data.moves[landingClip]?.commands;
          if(commands){this.hasHit=false;this.script=new ScriptVM(commands);this.script.advance(0);}
        }
    } else {
      f.vy=velocity.y;
      if(resolved.contacts.some(c=>c.plane.type==='Ceiling'))f.vy=Math.min(0,f.vy);
    }
    f.vx=velocity.x;
  }
}
