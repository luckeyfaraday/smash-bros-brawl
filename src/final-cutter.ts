import type {Command,Hitbox} from './types';
import {ScriptVM} from './script';
import {STAGE} from './stage';

export type CutterState={phase:'start'|'arc'|'fall'|'land';air:boolean;rootY:number;ceiling:boolean};
// The vertical arc is original CHR0 motion. Common transitions and these
// kinetic rules remain reconstructed; raw article parameters are preserved.
export const CUTTER_RULES={steering:.8,fallSpeed:3.5,waveSpeed:6,waveGravity:.31,waveLife:25};
export class CutterWave {
  age=0;y=STAGE.floor;vy=0;previousX:number;previousY:number=STAGE.floor;spent=false;
  readonly script:ScriptVM;
  constructor(readonly id:number,readonly owner:number,public x:number,readonly facing:number,commands:Command[]) {
    this.previousX=x;this.script=new ScriptVM(commands);this.script.advance(0);
  }
  step(){
    this.previousX=this.x;this.previousY=this.y;this.age++;
    this.x+=this.facing*CUTTER_RULES.waveSpeed;
    if(this.x<STAGE.left||this.x>STAGE.right||this.y<STAGE.floor){this.vy-=CUTTER_RULES.waveGravity;this.y+=this.vy;}
    this.script.advance(this.age);
    if(this.age>=CUTTER_RULES.waveLife)this.spent=true;
  }
  point(hit:Hitbox,previous=false){return {x:(previous?this.previousX:this.x)+hit.offset[2]*this.facing,y:(previous?this.previousY:this.y)+hit.offset[1],z:-hit.offset[0]*this.facing};}
  snapshot(){return {id:this.id,owner:this.owner,x:this.x,y:this.y,previousX:this.previousX,previousY:this.previousY,vy:this.vy,facing:this.facing,age:this.age,spent:this.spent,script:this.script.snapshot()};}
}
