import type {Input} from './types';
export type InhaleState={phase:'start'|'loop'|'swallow'|'hold'|'spit'|'drink'|'end'};
export type CaptureState={owner:number;victim:number;phase:'pull'|'held'|'star';age:number;remaining:number;maximum:number;from:{x:number;y:number};previous:Input;facing:number};
// Original clips, capture/pull volumes and spit damage/timing are retained.
// Common transitions, struggle escape, carried movement and star kinetics
// are a browser reconstruction, pending comparison with original common code.
export const INHALE_RULES={pullFrames:10,pullSpeed:.45,holdFrames:120,damageHoldScale:.5,maximumHold:220,mash:12,carrySpeed:.45,carryAirSpeed:.4,carryJump:.7,starSpeed:4,starDrag:.04,starLife:30,escapeInvincibility:20};
export function struggle(input:Input,previous:Input){
  return ['jump','attack','shield','smash','special','neutral','grab','side','downSpecial'].some(key=>input[key as keyof Input]&&!previous[key as keyof Input])||
    Math.abs(input.axis)>.5&&Math.sign(input.axis)!==Math.sign(previous.axis)||Math.abs(input.vertical)>.5&&Math.sign(input.vertical)!==Math.sign(previous.vertical);
}
