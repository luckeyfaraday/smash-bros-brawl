import type {Hitbox,JoltData} from './types';
import {ScriptVM} from './script';
import {moveAgainstStage,STAGE_PLANES,type StagePlane,type Vec2} from './stage-contact';
import {STAGE} from './stage';
import {SIDE_RULES} from './side-special';

// Raw source words include 2, approximately -58 degrees and integer 100.
// Their interpretation as speed, angle and lifetime, the two-article capacity
// and the semicircle repetition are provisional.
export const JOLT_RULES={speed:2,direction:{x:.5299192642332049,y:-.848048096156426},life:100,arcFrames:12,capacity:2};
const length=(p:StagePlane)=>Math.sqrt((p.b.x-p.a.x)**2+(p.b.y-p.a.y)**2);
const close=(a:Vec2,b:Vec2)=>Math.abs(a.x-b.x)<1e-6&&Math.abs(a.y-b.y)<1e-6;
export class ThunderJolt {
  readonly kind='jolt';age=0;phaseAge=0;phase:'air'|'ground'='air';spent=false;endedByStage=false;
  previousX:number;previousY:number;vx:number;vy:number;script:ScriptVM;
  surface:{plane:number;distance:number;direction:number}|null=null;
  damageScale=1;speedScale=1;reflections=0;
  constructor(readonly id:number,public owner:number,public x:number,public y:number,public launchFacing:number,readonly data:JoltData){
    this.previousX=x;this.previousY=y;this.vx=JOLT_RULES.direction.x*JOLT_RULES.speed*launchFacing;this.vy=JOLT_RULES.direction.y*JOLT_RULES.speed;
    this.script=new ScriptVM(data.air.commands);this.script.advance(0);
  }
  reflect(owner:number){this.owner=owner;this.launchFacing=-this.launchFacing;if(this.surface)this.surface.direction=-this.surface.direction;this.vx*=-SIDE_RULES.reflectSpeed;this.vy*=-SIDE_RULES.reflectSpeed;this.damageScale*=SIDE_RULES.reflectDamage;this.speedScale*=SIDE_RULES.reflectSpeed;this.reflections++;this.previousX=this.x;this.previousY=this.y;}
  get facing(){return this.surface?Math.sign(this.tangent.x)||this.launchFacing:this.launchFacing;}
  get normal():Vec2 {return this.surface?STAGE_PLANES[this.surface.plane].normal:{x:0,y:1};}
  get tangent():Vec2 {
    if(!this.surface)return {x:this.launchFacing,y:0};
    const p=STAGE_PLANES[this.surface.plane],scale=this.surface.direction/length(p);return {x:(p.b.x-p.a.x)*scale,y:(p.b.y-p.a.y)*scale};
  }
  get poseFrame(){return this.phase==='air'?this.phaseAge%15:this.phaseAge%JOLT_RULES.arcFrames;}
  get localCenter(){return this.phase==='ground'?this.data.ground.hitTrack[this.poseFrame]:[0,0,0];}
  private surfacePosition(height:number){
    const s=this.surface!,p=STAGE_PLANES[s.plane],t=s.distance/length(p);
    this.x=p.a.x+(p.b.x-p.a.x)*t+p.normal.x*height;this.y=p.a.y+(p.b.y-p.a.y)*t+p.normal.y*height;
  }
  private attach(p:StagePlane){
    const size=length(p),dx=(p.b.x-p.a.x)/size,dy=(p.b.y-p.a.y)/size;
    this.surface={plane:p.index,distance:Math.max(0,Math.min(size,(this.x-p.a.x)*dx+(this.y-p.a.y)*dy)),direction:Math.sign(this.vx*dx+this.vy*dy)||this.launchFacing};
    this.phase='ground';this.phaseAge=0;this.script=new ScriptVM(this.data.ground.commands);this.script.advance(0);this.surfacePosition(0);
  }
  private travel(distance:number){
    // Continue through the original connected floor, wall and underside segments.
    for(let crossings=0;crossings<STAGE_PLANES.length;crossings++){
      const s=this.surface!,p=STAGE_PLANES[s.plane],size=length(p),remaining=s.direction>0?size-s.distance:s.distance;
      if(distance<=remaining){s.distance+=distance*s.direction;return;}
      distance-=remaining;const end=s.direction>0?p.b:p.a;
      const next=STAGE_PLANES.find(q=>q.index!==p.index&&(close(q.a,end)||close(q.b,end)));
      if(!next){this.spent=true;return;}
      this.surface={plane:next.index,distance:close(next.a,end)?0:length(next),direction:close(next.a,end)?1:-1};
    }
    throw new Error('Thunder Jolt exceeded the stage boundary traversal limit');
  }
  step(){
    this.previousX=this.x;this.previousY=this.y;this.age++;
    if(this.phase==='air'){
      this.phaseAge++;
      const r=3,body=[{x:0,y:-r},{x:r,y:0},{x:0,y:r},{x:-r,y:0}];
      const result=moveAgainstStage({x:this.x,y:this.y},{x:this.x+this.vx,y:this.y+this.vy},body);
      this.x=result.position.x;this.y=result.position.y;if(result.contacts.length)this.attach(result.contacts[0].plane);
    }else{
      const frame=this.poseFrame,track=this.data.ground.hitTrack;
      this.travel(Math.max(0,track[frame+1][2]-track[frame][2])*this.speedScale);this.phaseAge++;
      this.surfacePosition(Math.max(0,this.localCenter[1]));
    }
    this.vx=this.x-this.previousX;this.vy=this.y-this.previousY;
    // Airborne velocity stays constant until contact; surface velocity follows
    // the animated hit bone and the boundary's outward normal.
    this.script.advance(this.phaseAge);
    if(this.age>=JOLT_RULES.life||Math.abs(this.x)>STAGE.blastX||this.y<STAGE.blastBottom||this.y>STAGE.blastTop)this.spent=true;
  }
  point(hit:Hitbox,previous=false){
    const t=this.tangent,n=this.normal;
    return {x:(previous?this.previousX:this.x)+t.x*hit.offset[2]+n.x*hit.offset[1],y:(previous?this.previousY:this.y)+t.y*hit.offset[2]+n.y*hit.offset[1],z:-this.facing*hit.offset[0]};
  }
  snapshot(){return {reflection:{damage:this.damageScale,count:this.reflections,speed:this.speedScale},id:this.id,owner:this.owner,kind:this.kind,x:this.x,y:this.y,previousX:this.previousX,previousY:this.previousY,vx:this.vx,vy:this.vy,facing:this.facing,launchFacing:this.launchFacing,age:this.age,phaseAge:this.phaseAge,phase:this.phase,surface:this.surface?{...this.surface}:null,spent:this.spent,script:this.script.snapshot()};}
}
