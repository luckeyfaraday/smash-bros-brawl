import type {Input} from './types';
import type {FighterController} from './fighter';
export type GrabState={phase:'reach'|'hold'|'pummel'|'throw'|'release';facing:number};
export type HoldState={owner:number;victim:number;age:number;remaining:number;maximum:number;previous:Input;from:{x:number;y:number};damageAge:number};
// Original volumes, hit phases and throw motions; common capture rules are
// reconstructed. A fresh input contributes once; holding a button is not mash.
export const GRAB_RULES={pull:6,minimumHold:90,damageScale:1.7,maximumHold:360,mash:8,escapeInvincibility:20};
export function tetherTip(actor:FighterController){
 const f=actor.f,start=f.clip==='CatchDash'?13:f.clip==='CatchTurn'?14:11;
 const end=f.clip==='CatchDash'?69:f.clip==='CatchTurn'?66:54;
 const side=f.facing*(f.clip==='CatchTurn'?-1:1);
 const extension=f.age<start?0:f.age<start+4?(f.age-start+1)/4:Math.max(0,1-(f.age-start-8)/(end-start-8));
 return {x:f.x+side*(6+38*Math.min(1,extension)),y:f.y+8,z:0};
}
export function throwDirection(input:Input,previous:Input,facing:number){
 if(input.vertical>.5&&previous.vertical<=.5)return 'ThrowHi';
 if((input.vertical<-.5&&previous.vertical>=-.5)||(input.down&&!previous.down))return 'ThrowLw';
 if(Math.abs(input.axis)>.5&&Math.sign(input.axis)!==(Math.abs(previous.axis)>.5?Math.sign(previous.axis):0))return input.axis*facing>0?'ThrowF':'ThrowB';
 return null;
}
