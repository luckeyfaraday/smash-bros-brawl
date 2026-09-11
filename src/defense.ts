import type {Command} from './types';

// Common-state kinetics remain reconstructed; clips, root travel, protection
// windows and interrupt commands come from each fighter's original moveset.
export const DEFENSE_RULES={airControl:.35,landingLag:10};
export type EvadeState={kind:'roll'|'spot'|'air';facing:number;scriptEnd:boolean};
export const hasDefenseInterrupt=(commands:Command[]):boolean=>commands.some(c=>c.id==='6400'||!!c.children&&hasDefenseInterrupt(c.children));
