import type { FighterData } from './types';
import type { Poses } from './pose';

export const ROSTER = {
  mario: { name:'Mario', color:'#ce655e', description:'Cape reversal · bouncing fireball · Super Jump Punch', markerHeight:22 },
  link: { name:'Link', color:'#80af83', description:'Gale Boomerang · drawn bow · Spin Attack', markerHeight:28 },
  kirby: { name:'Kirby', color:'#d99ab8', description:'Hammer swings · inhale and copy · Final Cutter', markerHeight:19 },
  pikachu: { name:'Pikachu', color:'#e2c15d', description:'Charge Skull Bash · Thunder Jolt · Quick Attack', markerHeight:20 },
} as const;
export type FighterId = keyof typeof ROSTER;
export type FighterAssets = { data:FighterData; poses:Poses };
export type LoadedRoster = Record<FighterId,FighterAssets>;
export const fighterIds = Object.keys(ROSTER) as FighterId[];
export function validFighter(id:unknown):id is FighterId { return typeof id==='string'&&Object.hasOwn(ROSTER,id); }
