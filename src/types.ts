export interface Param { type: number; raw: number; value: number | boolean }
export interface Command {
  id: string; name: string; offset: number; params: Param[];
  children?: Command[]; external?: string; recursive_reference?: boolean;
}
export interface Hurtbox {
  bone: number; offset: number[]; stretch: number[]; radius: number; enabled: boolean;
}
export interface FighterData {
  id?: 'mario'|'link'|'kirby'|'pikachu';
  jabRepeat?:boolean;
  airJumps?:number[];
  side?:{kind:'cape'|'boomerang'|'hammer'|'skull';boomerang?:{fly:Command[];turn:Command[];rawParameters:number[]}};
  downSpecial?:{kind:'flood'|'bomb'|'stone'|'thunder';pump?:ArticleData;water?:ArticleData;nozzle?:Record<string,number[][]>;thunder?:ArticleData;stone?:{ground:Command[];air:Command[]};bomb?:{commands:Command[];originalCommands:Command[];source:{file:string;sha256:string}}};
  quickAttack?:{bursts:{commands:Command[]}[]};
  finalCutter?:{commands:Command[];rawParameters:number[]};
  inhale?:{sourceSubactions:number[];spitDamage:number};
  copies?:Record<CopyAbility,{prefix:string;ranged:NonNullable<FighterData['ranged']>}>;
  ranged?:{kind:'fireball'|'arrow'|'jolt';commands:Command[];rawParameters:number[];jolt?:JoltData};
  environment: {bones:number[];minHeight:number;minWidth:number;unknown:number}[];
  schemaVersion: number; source: { file: string; sha256: string };
  attributes: Record<string, number>; hurtboxes: Hurtbox[];
  moves: Record<string, { commands: Command[] }>; limitations: string[];
}
export interface MotionData {
  scriptBoneOffset?:number;
  bones: { name: string; index: number; parent: number; billboard?:string }[];
  clips: Record<string, { count: number; loop: boolean; frames: number[][]; rootMotion?:number[][]|null }>;
}
export interface Input { axis: number; jump: boolean; attack: boolean; run: boolean; down: boolean; shield:boolean; smash:boolean; special:boolean; neutral:boolean; vertical:number; grab?:boolean; side?:boolean; downSpecial?:boolean }
export interface FrameInput extends Input { opponent?:Input }
export type CopyAbility='mario'|'link'|'pikachu';
export const SIMULATION_ID = 'brawl-lab-027';
export const neutralInput = (): Input => ({ axis: 0, jump: false, attack: false, run: false, down: false, shield:false, smash:false, special:false,neutral:false,vertical:0,grab:false,side:false,downSpecial:false });
export interface Hitbox {
  reverse?:boolean;
  targetMask?:number;
  specialFlags?:number;
  id: number; bone: number; damage: number; angle: number; growth: number;
  base: number; fixed: number; radius: number; offset: number[]; hitlag: number;
}
export type JoltData={air:{commands:Command[]};ground:{commands:Command[];hitTrack:number[][]}};
export type Grabbox={id:number;bone:number;radius:number;offset:number[];targetMask:number};
export type ArticleData={articleOffset:number;commands:Record<string,Command[]>;rawParameters:number[]};
