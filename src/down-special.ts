import type {Command,Hitbox} from './types';
import {ScriptVM} from './script';
import {moveAgainstStage} from './stage-contact';
import {SIDE_RULES} from './side-special';
import {STAGE} from './stage';

export type DownState={kind:'flood'|'bomb'|'stone'|'thunder';phase:'start'|'charge'|'fire'|'form'|'hold'|'fall'|'land'|'exit'|'call'|'hit'|'pull';air:boolean;charge:number;emit:number;issued:boolean;aim:number;form:number;armor:number;rootY:number;elapsed:number};
export type ItemThrowState={direction:'F'|'B'|'Hi'|'Lw'|'Drop'|'Dash';strong:boolean;release:boolean;offset:number[]|null;facing:number};
// Common parameters remain reconstructed; hitboxes and event timing are original.
export const DOWN_RULES={floodCharge:90,waterSpeed:3.5,waterLife:40,waterGravity:.035,stoneArmor:30,stoneFall:5.5,stoneHold:300,stoneCancel:12,thunderHeight:65,thunderSpeed:12,thunderLife:35,bombFuse:180,bombGravity:.09,bombLife:6,bombCapacity:2};
export const DOWN_LABELS={flood:'F.L.U.D.D.',bomb:'BOMBS',stone:'STONE',thunder:'THUNDER'};
export const STONE_FORMS=['stone-rock','stone-weight','stone-thwomp','stone-kirby','stone-block'] as const;
const body=(r:number)=>[{x:0,y:-r},{x:r,y:0},{x:0,y:r},{x:-r,y:0}];

export class DownProjectile {
  burstAge:number|null=null;
  age=0;spent=false;previousX:number;previousY:number;vx:number;vy:number;damageScale=1;speedScale=1;reflections=0;struck=new Set<number>();script:ScriptVM;endedByStage=false;
  constructor(readonly id:number,public owner:number,readonly kind:'water'|'thunder',public x:number,public y:number,public facing:number,readonly charge:number,aim:number,commands:Command[],readonly sourceY=y){
    this.previousX=x;this.previousY=y;const speed=DOWN_RULES.waterSpeed*(.7+.3*charge/DOWN_RULES.floodCharge)/Math.sqrt(1+aim*aim);
    this.vx=kind==='water'?facing*speed:0;this.vy=kind==='water'?aim*speed:-DOWN_RULES.thunderSpeed;this.script=new ScriptVM(commands);this.script.advance(0);
  }
  reflect(owner:number){this.owner=owner;this.facing=-this.facing;this.vx*=-SIDE_RULES.reflectSpeed;this.vy*=-SIDE_RULES.reflectSpeed;this.damageScale*=SIDE_RULES.reflectDamage;this.speedScale*=SIDE_RULES.reflectSpeed;this.reflections++;this.struck.clear();this.previousX=this.x;this.previousY=this.y;}
  step(){
    this.previousX=this.x;this.previousY=this.y;this.age++;
    if(this.burstAge!==null){if(++this.burstAge>=3)this.spent=true;return;}
    if(this.kind==='water')this.vy-=DOWN_RULES.waterGravity;
    const result=moveAgainstStage({x:this.x,y:this.y},{x:this.x+this.vx,y:this.y+this.vy},body(this.kind==='water'?1:.2));
    this.x=result.position.x;this.y=result.position.y;this.endedByStage=!!result.contacts.length;
    this.script.advance(this.age);
    if(this.age>=(this.kind==='water'?DOWN_RULES.waterLife:DOWN_RULES.thunderLife)||Math.abs(this.x)>STAGE.blastX||this.y<STAGE.blastBottom||this.y>STAGE.blastTop)this.spent=true;
  }
  point(h:Hitbox,previous=false){return {x:(previous?this.previousX:this.x)+h.offset[2]*this.facing,y:(previous?this.previousY:this.y)+h.offset[1],z:-h.offset[0]*this.facing};}
  snapshot(){return {id:this.id,owner:this.owner,kind:this.kind,x:this.x,y:this.y,previousX:this.previousX,previousY:this.previousY,vx:this.vx,vy:this.vy,facing:this.facing,charge:this.charge,sourceY:this.sourceY,age:this.age,burstAge:this.burstAge,spent:this.spent,endedByStage:this.endedByStage,damageScale:this.damageScale,speedScale:this.speedScale,reflections:this.reflections,struck:[...this.struck],script:this.script.snapshot()};}
}

export class Bomb {
  readonly kind='bomb';phase:'held'|'fall'|'throw'|'explode'='held';age=0;phaseAge=0;spent=false;vx=0;vy=0;facing=1;previousX:number;previousY:number;struck=new Set<number>();script:ScriptVM;
  constructor(readonly id:number,public owner:number,public heldBy:number|null,public x:number,public y:number,readonly commands:Command[]){this.previousX=x;this.previousY=y;this.script=new ScriptVM([]);}
  explode(){if(this.phase==='explode')return;this.heldBy=null;this.phase='explode';this.phaseAge=0;this.vx=0;this.vy=0;this.script=new ScriptVM(this.commands);this.script.advance(0);}
  release(vx:number,vy:number,owner:number,drop=false){this.heldBy=null;this.owner=owner;this.phase=drop?'fall':'throw';this.vx=vx;this.vy=vy;this.facing=Math.sign(vx)||1;this.phaseAge=0;this.previousX=this.x;this.previousY=this.y;}
  step(){
    this.previousX=this.x;this.previousY=this.y;this.age++;this.phaseAge++;
    if(this.phase==='explode'){if(this.phaseAge>=DOWN_RULES.bombLife)this.spent=true;return;}
    if(this.age>=DOWN_RULES.bombFuse){this.explode();return;}
    if(this.heldBy!==null)return;
    this.vy-=DOWN_RULES.bombGravity;
    const r=2.3,result=moveAgainstStage({x:this.x,y:this.y},{x:this.x+this.vx,y:this.y+this.vy},body(r));this.x=result.position.x;this.y=result.position.y;
    if(result.contacts.length){
      if(this.phase==='throw'&&Math.sqrt(this.vx*this.vx+this.vy*this.vy)>1.4){this.explode();return;}
      for(const hit of result.contacts){const dot=this.vx*hit.normal.x+this.vy*hit.normal.y;if(dot<0){this.vx-=dot*hit.normal.x*1.35;this.vy-=dot*hit.normal.y*1.35;}}
      this.vx*=.65;if(Math.abs(this.vy)<.3)this.vy=0;
    }
    if(Math.abs(this.x)>STAGE.blastX||this.y<STAGE.blastBottom)this.spent=true;
  }
  point(h:Hitbox,previous=false){return {x:(previous?this.previousX:this.x)+h.offset[2]*this.facing,y:(previous?this.previousY:this.y)+h.offset[1],z:0};}
  snapshot(){return {id:this.id,owner:this.owner,heldBy:this.heldBy,kind:this.kind,phase:this.phase,age:this.age,phaseAge:this.phaseAge,spent:this.spent,x:this.x,y:this.y,previousX:this.previousX,previousY:this.previousY,vx:this.vx,vy:this.vy,facing:this.facing,struck:[...this.struck],script:this.script.snapshot()};}
}
