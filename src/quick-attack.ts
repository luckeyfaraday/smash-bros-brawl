import type {Input} from './types';

export type Direction={x:number;y:number};
export type QuickAttackState={phase:'start'|'burst'|'turn'|'end';burst:1|2;direction:Direction;trail:Direction[];stopped:boolean};
// Reconstructed common/kinetic rules, not decoded special-attribute labels.
// Source startup/end motion, hit branches and the end counter remain separate.
export const QUICK_ATTACK_RULES={speed:4,burstFrames:10,minimumTurnCos:Math.SQRT1_2,landing:24,endCounter:0x20000004};

export function quickDirection(input:Input,defaultUp=false):Direction|null {
  const x=Math.abs(input.axis)>.18?input.axis:0,y=Math.abs(input.vertical)>.18?input.vertical:0;
  const length=Math.sqrt(x*x+y*y);
  return length?{x:x/length,y:y/length}:defaultUp?{x:0,y:1}:null;
}
export function canRedirect(first:Direction,next:Direction|null):next is Direction {
  return !!next&&first.x*next.x+first.y*next.y<=QUICK_ATTACK_RULES.minimumTurnCos+1e-12;
}
