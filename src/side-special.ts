import type {FighterData,Hitbox} from './types';
import {ScriptVM} from './script';
import {moveAgainstStage} from './stage-contact';

export type SideState={kind:'cape'|'boomerang'|'hammer'|'skull';phase:'swing'|'throw'|'catch'|'start'|'hold'|'ready'|'burst'|'end';air:boolean;charge:number;article:boolean;fire:boolean;aim:number;trail?:{x:number;y:number}[]};
export const SIDE_LABELS={cape:'CAPE',boomerang:'GALE BOOMERANG',hammer:'HAMMER',skull:'SKULL BASH'};
// Original hit scripts and poses; common-state movement and charge are reconstructed.
export const SIDE_RULES={charge:120,skullSpeed:2.5,skullMaximumSpeed:6,skullMaximumDamage:25,reflectDamage:1.5,reflectSpeed:1.2,reflectRadius:8.5,boomerangSpeed:3.2,returnSpeed:3.8,turn:28,life:150};
export class Boomerang {
  readonly kind='boomerang';age=0;phaseAge=0;phase:'fly'|'turn'='fly';spent=false;struck=false;caught=false;
  previousX:number;previousY:number;vx:number;vy:number;script:ScriptVM;damageScale=1;reflections=0;
  constructor(readonly id:number,public owner:number,public x:number,public y:number,public facing:number,aim:number,readonly data:NonNullable<NonNullable<FighterData['side']>['boomerang']>){
    this.previousX=x;this.previousY=y;const scale=SIDE_RULES.boomerangSpeed/Math.sqrt(1+aim*aim);
    this.vx=facing*scale;this.vy=aim*scale;this.script=new ScriptVM(data.fly);this.script.advance(0);
  }
  reflect(owner:number){this.owner=owner;this.facing=-this.facing;this.vx*=-SIDE_RULES.reflectSpeed;this.vy*=-SIDE_RULES.reflectSpeed;this.damageScale*=SIDE_RULES.reflectDamage;this.reflections++;this.struck=false;this.previousX=this.x;this.previousY=this.y;}
  private turn(){this.phase='turn';this.phaseAge=0;this.script=new ScriptVM(this.data.turn);this.script.advance(0);}
  step(target:{x:number;y:number}){
    this.previousX=this.x;this.previousY=this.y;this.age++;this.phaseAge++;
    if(this.phase==='fly'&&this.phaseAge>=SIDE_RULES.turn)this.turn();
    if(this.phase==='turn'){
      const dx=target.x-this.x,dy=target.y-this.y,length=Math.sqrt(dx*dx+dy*dy);
      if(length<6){this.caught=true;this.spent=true;return;}
      this.vx=dx/length*SIDE_RULES.returnSpeed;this.vy=dy/length*SIDE_RULES.returnSpeed;this.facing=Math.sign(this.vx)||this.facing;
    }
    const resolved=moveAgainstStage({x:this.x,y:this.y},{x:this.x+this.vx,y:this.y+this.vy},[{x:0,y:-1},{x:1,y:0},{x:0,y:1},{x:-1,y:0}]);
    this.x=resolved.position.x;this.y=resolved.position.y;
    if(resolved.contacts.length){if(this.phase==='fly')this.turn();else this.spent=true;}
    this.script.advance(this.phaseAge);if(this.age>=SIDE_RULES.life)this.spent=true;
  }
  point(h:Hitbox,previous=false){return {x:(previous?this.previousX:this.x)+h.offset[2]*this.facing,y:(previous?this.previousY:this.y)+h.offset[1],z:-h.offset[0]*this.facing};}
  snapshot(){return {id:this.id,kind:this.kind,owner:this.owner,x:this.x,y:this.y,previousX:this.previousX,previousY:this.previousY,vx:this.vx,vy:this.vy,facing:this.facing,age:this.age,phaseAge:this.phaseAge,phase:this.phase,spent:this.spent,struck:this.struck,caught:this.caught,damageScale:this.damageScale,reflections:this.reflections,script:this.script.snapshot()};}
}
