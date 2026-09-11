import type { MotionData } from './types';

export type Point = { x: number; y: number; z: number };
export class Poses {
  constructor(readonly motion: MotionData) {}
  frame(clip: string, frame: number, loop = false) {
    const animation = this.motion.clips[clip] ?? this.motion.clips.Wait1;
    const index = Math.max(0, Math.floor(frame));
    return animation.frames[loop ? index % animation.count : Math.min(index, animation.count - 1)];
  }
  point(clip: string, frame: number, bone: number, offset: number[], facing: number, x: number, y: number): Point {
    const scriptOffset=this.motion.scriptBoneOffset??0;
    if(scriptOffset && bone>=scriptOffset)bone-=scriptOffset;
    const index = this.motion.bones.findIndex(b => b.index === bone);
    if (index < 0) throw new Error(`Missing bone ${bone}`);
    const matrices = this.frame(clip, frame, ['Wait1', 'WaitItem', 'SquatWait', 'SquatWaitItem', 'Run', 'WalkMiddle', 'Fall', 'FallSpecial', 'FallAerial', 'CliffWait', 'FuraFura'].includes(clip));
    const i = index * 16;
    const [a,b,c] = offset;
    const px = matrices[i]*a + matrices[i+4]*b + matrices[i+8]*c + matrices[i+12];
    const py = matrices[i+1]*a + matrices[i+5]*b + matrices[i+9]*c + matrices[i+13];
    const pz = matrices[i+2]*a + matrices[i+6]*b + matrices[i+10]*c + matrices[i+14];
    // Original fighter faces +Z. Rotate +/-90 degrees about Y into the fight plane.
    return { x: x + facing*pz, y: y + py, z: -facing*px };
  }
  root(clip: string, frame: number, facing: number) {
    const bone=this.motion.bones.find(b=>b.name==='TransN');
    if(!bone)throw new Error('Missing fighter translation bone');
    return this.point(clip,frame,bone.index,[0,0,0],facing,0,0);
  }
}

export function sphereCapsule(center: Point, radius: number, a: Point, b: Point, capsuleRadius: number) {
  const dx=b.x-a.x, dy=b.y-a.y, dz=b.z-a.z;
  const length=dx*dx+dy*dy+dz*dz;
  const t=length ? Math.max(0,Math.min(1,((center.x-a.x)*dx+(center.y-a.y)*dy+(center.z-a.z)*dz)/length)) : 0;
  const distance=(center.x-a.x-t*dx)**2+(center.y-a.y-t*dy)**2+(center.z-a.z-t*dz)**2;
  return distance <= (radius+capsuleRadius)**2;
}

/** Closest points between a swept sphere's path and a hurtbox capsule axis. */
export function sweptSphereCapsule(from:Point,to:Point,radius:number,a:Point,b:Point,capsuleRadius:number) {
  const u={x:to.x-from.x,y:to.y-from.y,z:to.z-from.z},v={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},w={x:from.x-a.x,y:from.y-a.y,z:from.z-a.z};
  const dot=(a:Point,b:Point)=>a.x*b.x+a.y*b.y+a.z*b.z,clamp=(n:number)=>Math.max(0,Math.min(1,n));
  const aa=dot(u,u),bb=dot(u,v),cc=dot(v,v),dd=dot(u,w),ee=dot(v,w);
  let s=0,t=0;
  if(aa<1e-12)t=cc<1e-12?0:clamp(ee/cc);
  else if(cc<1e-12)s=clamp(-dd/aa);
  else {
    const denominator=aa*cc-bb*bb;
    s=denominator>1e-12?clamp((bb*ee-cc*dd)/denominator):0;t=(bb*s+ee)/cc;
    if(t<0){t=0;s=clamp(-dd/aa);}else if(t>1){t=1;s=clamp((bb-dd)/aa);}
  }
  return (w.x+u.x*s-v.x*t)**2+(w.y+u.y*s-v.y*t)**2+(w.z+u.z*s-v.z*t)**2<=(radius+capsuleRadius)**2;
}
