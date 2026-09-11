import type {Input,FighterData} from './types';

export const SMASH_ATTACKS=['AttackS4S','AttackS4Hi','AttackS4Lw','AttackS4S2','AttackHi4','AttackLw4'] as const;
export type SmashAttack=typeof SMASH_ATTACKS[number];
export const SMASH_STAGES=['AttackS4Start','AttackS4Hold','AttackHi4Start','AttackHi4Hold','AttackLw4Start','AttackLw4Hold'] as const;
export const isSmashAttack=(clip:string):clip is SmashAttack=>SMASH_ATTACKS.some(name=>name===clip);
export const SMASH_LABELS:Record<SmashAttack,string>={AttackS4S:'FORWARD SMASH',AttackS4Hi:'FORWARD SMASH · HIGH',AttackS4Lw:'FORWARD SMASH · LOW',AttackS4S2:'SMASH FOLLOW-UP',AttackHi4:'UP SMASH',AttackLw4:'DOWN SMASH'};
// Reconstructed common charge rules. Source holds contain 61 samples; their
// original common-state scaling and exact transition ordering need comparison.
export const SMASH_RULES={maximum:60,damageBonus:.4};
export type SmashState={phase:'start'|'hold'|'release';move:SmashAttack;charge:number};
export const smashMultiplier=(charge:number)=>1+Math.min(SMASH_RULES.maximum,Math.max(0,charge))/SMASH_RULES.maximum*SMASH_RULES.damageBonus;
export const smashStage=(move:SmashAttack,phase:'Start'|'Hold')=>`${move.startsWith('AttackS4')?'AttackS4':move}${phase}` as typeof SMASH_STAGES[number];
export function smashAttack(input:Input,moves:FighterData['moves']):SmashAttack {
 const x=Math.abs(input.axis)>.3?input.axis:0,y=Math.abs(input.vertical)>.3?input.vertical:input.down?-1:0;
 if(y&&(!x||Math.abs(y)>Math.abs(x)))return y>0?'AttackHi4':'AttackLw4';
 const angle=y>0?'AttackS4Hi':y<0?'AttackS4Lw':'AttackS4S';return moves[angle]?angle:'AttackS4S';
}
