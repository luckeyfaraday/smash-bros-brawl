// Reconstructed common-state rules, pending original-engine frame comparison.
// Motion, get-up hitboxes and protection windows come from the fighter scripts.
export const KNOCKDOWN_RULES={tumbleKnockback:80,techWindow:20,techLockout:40,waitLimit:180,airControl:.35};
export type FloorPosture='U'|'D';
export type KnockdownPhase='fly'|'fall'|'bound'|'wait'|'damage'|'stand'|'attack'|'roll'|'tech';
export type KnockdownState={phase:KnockdownPhase;posture:FloorPosture;facing:number};
export const pronePhase=(phase?:KnockdownPhase)=>phase==='bound'||phase==='wait'||phase==='damage';
export const tumblePhase=(phase?:KnockdownPhase)=>phase==='fly'||phase==='fall';

export function launchClip(vx:number,vy:number) {
  if(vy>Math.abs(vx)*2)return 'DamageFlyTop';
  if(vy>Math.abs(vx)*.5)return 'DamageFlyHi';
  if(vy< -Math.abs(vx)*.5)return 'DamageFlyLw';
  return 'DamageFlyN';
}
