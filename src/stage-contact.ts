import {STAGE,STAGE_SOURCE} from './stage';
import type {FighterData} from './types';
import type {Poses} from './pose';

export type Vec2={x:number;y:number};
export type StagePlane={index:number;type:string;a:Vec2;b:Vec2;normal:Vec2};
const dot=(a:Vec2,b:Vec2)=>a.x*b.x+a.y*b.y;
const sub=(a:Vec2,b:Vec2):Vec2=>({x:a.x-b.x,y:a.y-b.y});
const add=(a:Vec2,b:Vec2):Vec2=>({x:a.x+b.x,y:a.y+b.y});
const mul=(a:Vec2,t:number):Vec2=>({x:a.x*t,y:a.y*t});
const cross=(a:Vec2,b:Vec2)=>a.x*b.y-a.y*b.x;
const EPS=1e-8,SEPARATION=1e-7;

export const STAGE_PLANES:StagePlane[]=STAGE_SOURCE.planes.filter(p=>p.characters).map((p,index)=>{
  const a={x:p.left[0],y:p.left[1]-STAGE.sourceFloor},b={x:p.right[0],y:p.right[1]-STAGE.sourceFloor};
  const edge=sub(b,a),length=Math.sqrt(edge.x*edge.x+edge.y*edge.y);
  if(!length)throw new Error('Stage has a zero-length boundary');
  return {index,type:p.type,a,b,normal:{x:-edge.y/length,y:edge.x/length}};
});

/** Original ECB bone extents with the common floor anchor kept at TransN.
 * Exact airborne bottom-lock timing remains provisional.
 */
export function stageBody(data:FighterData,poses:Poses,clip:string,frame:number,facing:number):Vec2[] {
  const definition=data.environment[0];
  if(data.environment.length!==1||!definition)throw new Error('Expected one environment collision definition');
  const bones=definition.bones.map(b=>poses.point(clip,frame,b,[0,0,0],facing,0,0));
  const root=poses.root(clip,frame,facing);
  const left=Math.min(-definition.minWidth/2,...bones.map(p=>p.x));
  const right=Math.max(definition.minWidth/2,...bones.map(p=>p.x));
  const nativeBottom=Math.min(...bones.map(p=>p.y)),nativeTop=Math.max(...bones.map(p=>p.y));
  const middle=(nativeBottom+nativeTop)/2;
  const bottom=Math.max(root.y,Math.min(nativeBottom,middle-definition.minHeight/2));
  const top=Math.max(root.y+definition.minHeight,nativeTop,middle+definition.minHeight/2);
  const sideY=Math.max(0,(bottom+top)/2);
  return [{x:0,y:0},{x:right,y:sideY},{x:root.x,y:top},{x:left,y:sideY}];
}

function hull(points:Vec2[]) {
  const sorted=[...points].sort((a,b)=>a.x-b.x||a.y-b.y),lower:Vec2[]=[],upper:Vec2[]=[];
  for(const p of sorted){while(lower.length>=2&&cross(sub(lower.at(-1)!,lower.at(-2)!),sub(p,lower.at(-1)!))<=EPS)lower.pop();lower.push(p);}
  for(const p of [...sorted].reverse()){while(upper.length>=2&&cross(sub(upper.at(-1)!,upper.at(-2)!),sub(p,upper.at(-1)!))<=EPS)upper.pop();upper.push(p);}
  return [...lower.slice(0,-1),...upper.slice(0,-1)];
}
type Boundary={plane:StagePlane;edges:{point:Vec2;normal:Vec2}[];support:number};
function boundaries(body:Vec2[],planes:StagePlane[]):Boundary[] {
  return planes.map(plane=>{
    // Expand a finite segment by the fighter diamond. This also catches a stage
    // corner crossing the body between its four points, including fast launches.
    const polygon=hull(body.flatMap(p=>[sub(plane.a,p),sub(plane.b,p)]));
    return {plane,support:Math.min(...body.map(p=>dot(p,plane.normal))),edges:polygon.map((p,i)=>{
      const edge=sub(polygon[(i+1)%polygon.length],p),length=Math.sqrt(edge.x*edge.x+edge.y*edge.y);
      return {point:p,normal:{x:edge.y/length,y:-edge.x/length}};
    })};
  });
}
type Impact={time:number;normal:Vec2;plane:StagePlane;push:number};
function sweep(start:Vec2,delta:Vec2,b:Boundary,center:Vec2):Impact|null {
  // Flat floor pieces share endpoints. Tangential movement across a seam must
  // not hit the expanded end cap and turn ordinary running into an upward hop.
  if(b.plane.type==='Floor'&&delta.y>=-EPS)return null;
  // A boundary can be approached only from the exterior of the solid stage.
  const reference=b.plane.type==='Floor'?start:add(start,center);
  if(dot(sub(reference,b.plane.a),b.plane.normal)<-EPS)return null;
  let enter=0,leave=1,normal:Vec2|null=null,inside=true;
  for(const edge of b.edges) {
    const distance=dot(sub(start,edge.point),edge.normal),speed=dot(delta,edge.normal);
    if(distance>EPS)inside=false;
    if(Math.abs(speed)<EPS){if(distance>EPS)return null;continue;}
    const time=-distance/speed;
    if(speed<0){if(time>=enter){enter=time;normal=edge.normal;}}
    else leave=Math.min(leave,time);
    if(enter-leave>EPS)return null;
  }
  if(inside) {
    const depth=-(dot(sub(start,b.plane.a),b.plane.normal)+b.support);
    if(depth<=EPS&&dot(delta,b.plane.normal)>=-EPS)return null;
    return {time:0,normal:b.plane.normal,plane:b.plane,push:Math.max(0,depth)};
  }
  if(!normal||enter<0||enter>1||dot(delta,normal)>=-EPS)return null;
  return {time:enter,normal,plane:b.plane,push:0};
}

export type StageContact={plane:StagePlane;normal:Vec2};
export function moveAgainstStage(start:Vec2,desired:Vec2,body:Vec2[],planes=STAGE_PLANES) {
  const minX=Math.min(...body.map(p=>p.x)),maxX=Math.max(...body.map(p=>p.x)),minY=Math.min(...body.map(p=>p.y)),maxY=Math.max(...body.map(p=>p.y));
  const nearby=(from:Vec2,to:Vec2)=>planes.filter(p=>
    Math.min(p.a.x,p.b.x)<=Math.max(from.x,to.x)+maxX+EPS&&Math.max(p.a.x,p.b.x)>=Math.min(from.x,to.x)+minX-EPS&&
    Math.min(p.a.y,p.b.y)<=Math.max(from.y,to.y)+maxY+EPS&&Math.max(p.a.y,p.b.y)>=Math.min(from.y,to.y)+minY-EPS);
  const cache=new Map<StagePlane,Boundary>(),center={x:0,y:(body[0].y+body[2].y)/2};
  let position={...start},remaining=sub(desired,start);
  const contacts:StageContact[]=[];
  for(let iteration=0;iteration<8;iteration++) {
    let first:Impact|null=null;
    const impacts:Impact[]=[];
    for(const plane of nearby(position,add(position,remaining))) {
      let boundary=cache.get(plane);
      if(!boundary){boundary=boundaries(body,[plane])[0];cache.set(plane,boundary);}
      const hit=sweep(position,remaining,boundary,center);
      if(hit)impacts.push(hit);
      if(hit&&(!first||hit.time<first.time-EPS||Math.abs(hit.time-first.time)<=EPS&&hit.push>first.push))first=hit;
    }
    if(!first)return {position:contacts.length?add(position,remaining):desired,contacts};
    const simultaneous=impacts.filter(hit=>Math.abs(hit.time-first!.time)<=EPS);
    position=add(position,mul(remaining,first.time));
    remaining=mul(remaining,1-first.time);
    for(const impact of simultaneous) {
      // Shared stage vertices belong to both surfaces. Using one segment's
      // diamond end cap alone would kick a straight jump sideways at a seam.
      const normal=simultaneous.length>1?impact.plane.normal:impact.normal;
      position=add(position,mul(normal,impact.push+SEPARATION));
      contacts.push({plane:impact.plane,normal});
    }
    remaining=clipStageVelocity(remaining,contacts);
  }
  // A trapped corner stops the residual movement; never tunnel after the budget.
  return {position,contacts};
}

export function clipStageVelocity(velocity:Vec2,contacts:StageContact[]) {
  const allowed=(v:Vec2)=>contacts.every(c=>dot(v,c.normal)>=-EPS);
  if(allowed(velocity))return velocity;
  // Closest motion satisfying all active surfaces: a tangent to one boundary
  // or a stop at a corner. Sequential projection can re-enter an earlier wall.
  let result={x:0,y:0},distance=dot(velocity,velocity);
  for(const {normal} of contacts) {
    const candidate=sub(velocity,mul(normal,dot(velocity,normal)));
    const change=sub(candidate,velocity),cost=dot(change,change);
    if(cost<distance&&allowed(candidate)){result=candidate;distance=cost;}
  }
  return result;
}
