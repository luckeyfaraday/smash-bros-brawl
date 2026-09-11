import type {Command,Hitbox} from './types';
import {ScriptVM} from './script';
import {moveAgainstStage,STAGE_PLANES} from './stage-contact';
import {STAGE} from './stage';
import {SIDE_RULES} from './side-special';

export type RangedState={kind:'fireball'|'arrow'|'jolt';phase:'throw'|'draw'|'hold'|'release';charge:number;bow:boolean;arrow:boolean;swordBack:boolean;shieldBack:boolean;fire:boolean};
export const BOW_READY=0x22000013;
// Source clips and hit scripts are used directly. Kinetic field mappings,
// charge interpolation and common transitions still require comparison.
export const RANGED_RULES={fireball:{speed:1.4,initialVy:-.25,gravity:.036,bounce:.75,life:75},arrow:{minimumSpeed:3,maximumSpeed:10,maximumDamage:12,gravity:.053,life:80,stickLife:20},bowCharge:43,airControl:.5};
export class RangedProjectile {
  age=0;spent=false;stuck=0;bounces=0;endedByStage=false;
  damageScale=1;reflections=0;
  previousX:number;previousY:number;vx:number;vy:number;readonly script:ScriptVM;
  constructor(readonly id:number,public owner:number,readonly kind:'fireball'|'arrow',public x:number,public y:number,public facing:number,readonly charge:number,commands:Command[]){
    this.previousX=x;this.previousY=y;
    const r=RANGED_RULES;
    this.vx=facing*(kind==='fireball'?r.fireball.speed:r.arrow.minimumSpeed+(r.arrow.maximumSpeed-r.arrow.minimumSpeed)*charge/r.bowCharge);
    this.vy=kind==='fireball'?r.fireball.initialVy:0;
    this.script=new ScriptVM(commands);this.script.advance(0);
    if(kind==='arrow')for(const [id,h] of this.script.hitboxes)this.script.hitboxes.set(id,{...h,damage:h.damage+(r.arrow.maximumDamage-h.damage)*charge/r.bowCharge});
  }
  reflect(owner:number){this.owner=owner;this.facing=-this.facing;this.vx*=-SIDE_RULES.reflectSpeed;this.vy*=-SIDE_RULES.reflectSpeed;this.damageScale*=SIDE_RULES.reflectDamage;this.reflections++;this.previousX=this.x;this.previousY=this.y;}
  step(){
    this.previousX=this.x;this.previousY=this.y;this.age++;
    if(this.stuck){this.script.hitboxes.clear();if(++this.stuck>RANGED_RULES.arrow.stickLife)this.spent=true;return;}
    const r=RANGED_RULES[this.kind];this.vy-=r.gravity;
    const radius=Math.max(0,...[...this.script.hitboxes.values()].map(h=>h.radius));
    const body=[{x:-radius,y:0},{x:0,y:radius},{x:radius,y:0},{x:0,y:-radius}];
    const resolved=moveAgainstStage({x:this.x,y:this.y},{x:this.x+this.vx,y:this.y+this.vy},body,STAGE_PLANES);
    this.x=resolved.position.x;this.y=resolved.position.y;
    if(resolved.contacts.length){
      if(this.kind==='fireball'&&resolved.contacts.every(c=>c.plane.type==='Floor')&&this.vy<0){this.vy=RANGED_RULES.fireball.bounce;this.bounces++;}
      else if(this.kind==='arrow')this.stuck=1;
      else {this.spent=true;this.endedByStage=true;}
    }
    if(!this.stuck)this.script.advance(this.age);
    if(this.age>=r.life||Math.abs(this.x)>STAGE.blastX||this.y<STAGE.blastBottom||this.y>STAGE.blastTop)this.spent=true;
  }
  point(hit:Hitbox,previous=false){return {x:(previous?this.previousX:this.x)+hit.offset[2]*this.facing,y:(previous?this.previousY:this.y)+hit.offset[1],z:-hit.offset[0]*this.facing};}
  snapshot(){return {reflection:{damage:this.damageScale,count:this.reflections},id:this.id,owner:this.owner,kind:this.kind,x:this.x,y:this.y,previousX:this.previousX,previousY:this.previousY,vx:this.vx,vy:this.vy,facing:this.facing,charge:this.charge,age:this.age,spent:this.spent,stuck:this.stuck,bounces:this.bounces,endedByStage:this.endedByStage,script:this.script.snapshot()};}
}
