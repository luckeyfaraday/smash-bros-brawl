import { JAB_FLAGS, LANDING_LAG_FLAG, ScriptVM } from './script';
import type { FighterData, MotionData, Input } from './types';
import {SMASH_ATTACKS,SMASH_STAGES} from './smash';

export const JABS = ['Attack11', 'Attack12', 'Attack13'] as const;
export type Jab = typeof JABS[number];
export const AERIALS=['AttackAirN','AttackAirF','AttackAirB','AttackAirHi','AttackAirLw'] as const;
export type Aerial=typeof AERIALS[number];
export const isAerial=(clip:string):clip is Aerial=>AERIALS.some(name=>name===clip);
export const AERIAL_LABELS:Record<Aerial,string>={AttackAirN:'NEUTRAL AERIAL',AttackAirF:'FORWARD AERIAL',AttackAirB:'BACK AERIAL',AttackAirHi:'UP AERIAL',AttackAirLw:'DOWN AERIAL'};
const AERIAL_LAG:Record<Aerial,string>={AttackAirN:'Nair Landing Lag?',AttackAirF:'Fair Landing Lag?',AttackAirB:'Bair Landing Lag?',AttackAirHi:'Uair Landing Lag?',AttackAirLw:'Dair Landing Lag'};
export function aerialAttack(input:Input,facing:number):Aerial {
  const x=Math.abs(input.axis)>.3?input.axis:0,y=Math.abs(input.vertical)>.3?input.vertical:input.down?-1:0;
  if(y&&Math.abs(y)>=Math.abs(x))return y>0?'AttackAirHi':'AttackAirLw';
  return x?x*facing>0?'AttackAirF':'AttackAirB':'AttackAirN';
}
export const aerialFromLanding=(clip:string)=>{const attack=clip.startsWith('LandingAir')?clip.replace('LandingAir','AttackAir'):'';return isAerial(attack)?attack:null;};
export const aerialLandingLag=(data:FighterData,clip:string)=>data.attributes[AERIAL_LAG[(isAerial(clip)?clip:aerialFromLanding(clip))??'AttackAirN']];
export const DIRECTIONAL_ATTACKS=['AttackS3S','AttackS3Hi','AttackS3Lw','AttackHi3','AttackLw3','AttackDash'] as const;
export type DirectionalAttack=typeof DIRECTIONAL_ATTACKS[number];
export const isDirectionalAttack=(clip:string):clip is DirectionalAttack=>DIRECTIONAL_ATTACKS.some(name=>name===clip);
export const NEUTRAL_SPECIALS=['SpecialN','SpecialAirN','SpecialNStart','SpecialNLoop','SpecialNEnd','SpecialAirNStart','SpecialAirNLoop','SpecialAirNEnd'] as const;
export const isNeutralSpecial=(clip:string)=>NEUTRAL_SPECIALS.some(name=>name===clip);
export const ATTACKS = [...JABS, ...DIRECTIONAL_ATTACKS, ...AERIALS, ...SMASH_ATTACKS, ...SMASH_STAGES,...NEUTRAL_SPECIALS,'Attack100Start','Attack100','SpecialHiStart','SpecialHi','SpecialAirHi','SpecialAirHiStart','SpecialHiEnd','SpecialAirHiEnd','SpecialHi2','SpecialHi3','SpecialHi4','SpecialAirHi2','SpecialAirHi3','SpecialAirHi4'] as const;
export type Attack = typeof ATTACKS[number];
export const DIRECTIONAL_LABELS:Record<DirectionalAttack,string>={AttackS3S:'FORWARD TILT',AttackS3Hi:'FORWARD TILT · HIGH',AttackS3Lw:'FORWARD TILT · LOW',AttackHi3:'UP TILT',AttackLw3:'DOWN TILT',AttackDash:'DASH ATTACK'};
/** Keyboard-friendly reconstruction of common tilt/dash input selection. */
export function groundAttack(input:Input,running:boolean,moves:FighterData['moves']):Jab|DirectionalAttack {
  const x=Math.abs(input.axis)>.3?input.axis:0,y=Math.abs(input.vertical)>.3?input.vertical:input.down?-1:0;
  if(running&&input.run&&x&&moves.AttackDash)return 'AttackDash';
  if(x&&Math.abs(x)>=Math.abs(y)) {
    const name=y>Math.abs(x)*.4?'AttackS3Hi':y<-Math.abs(x)*.4?'AttackS3Lw':'AttackS3S';
    return moves[name]?name:moves.AttackS3S?'AttackS3S':'Attack11';
  }
  if(y>0&&moves.AttackHi3)return 'AttackHi3';
  if(y<0&&moves.AttackLw3)return 'AttackLw3';
  return 'Attack11';
}
export const isJab = (clip: string): clip is Jab => JABS.some(name => name === clip);
export const isAttack = (clip: string): clip is Attack => ATTACKS.some(name => name === clip);
export const nextJab = (clip: string,moves?:FighterData['moves']): Jab | undefined => {
  const next=isJab(clip)?JABS[JABS.indexOf(clip)+1]:undefined;
  return next&&(!moves||moves[next])?next:undefined;
};

/** Execute the same raw VM to describe the timeline; never use dump annotations. */
export function attackTimeline(data: FighterData, motion: MotionData, name: Attack) {
  const commands = data.moves[name]?.commands, clip = motion.clips[name];
  if (!commands || !clip) throw new Error(`Missing ${name} assets. Run tools/prepare_assets.py.`);
  const vm = new ScriptVM(commands,{articleAvailable:()=>false});
  const frames = [];
  for (let frame = 0; frame < clip.count-(name==='Attack100'?1:0); frame++) {
    vm.advance(frame);
    if (vm.error) throw new Error(`${name}: ${vm.error}`);
    frames.push({ frame, active: vm.hitboxes.size > 0, hitboxes: vm.hitboxes.size,
      damage: Math.max(0, ...[...vm.hitboxes.values()].map(h => h.damage)),
      combo: vm.variables.has(JAB_FLAGS.combo), auto: vm.variables.has(JAB_FLAGS.auto),
      landingLag: vm.variables.has(LANDING_LAG_FLAG),
      interruptible: vm.interruptible });
    if (vm.interruptible) break;
  }
  return frames;
}
