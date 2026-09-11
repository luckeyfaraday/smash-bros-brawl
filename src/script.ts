import type { Command, Hitbox, Grabbox } from './types';

// Random-access boolean addresses decoded from the moveset's type-5 operands.
// Names follow brawllib_rs/src/script_ast/variable_ast.rs.
export const JAB_FLAGS = { combo: 0x22000010, auto: 0x22000016, rapid:0x22000014, rapidContinue:0x22000019 } as const;
export const LANDING_LAG_FLAG = 0x2200001e;

/** Small, fail-closed VM for the enabled fighter attacks.
 * Timing comes from raw timers. Unknown gameplay commands stop execution.
 */
export class ScriptVM {
  private stack: { commands: Command[]; pc: number; loops:{start:number;remaining:number}[] }[];
  private wake = 0;
  hitboxes = new Map<number, Hitbox>();
  grabs=new Map<number,Grabbox>();
  throws=new Map<number,Hitbox>();
  throwEvents:{id:number;bone:number}[]=[];
  wind:Hitbox|null=null;
  variables = new Set<number>();
  integers = new Map<number,number>();
  generatedArticles:number[]=[];
  articleVisibility=new Map<number,boolean>();
  modelVisibility=new Map<number,number>();
  boneStates=new Map<number,number>();
  interruptible = false;
  error: string | null = null;
  hitboxEpoch=0;
  hurtState=0;
  ledgeGrab=0;
  reverseDirection=false;
  airGroundMode:number|null=null;
  reflector=false;
  sideEvents:{action:'shoot'|'end';id:number}[]=[];
  itemThrows:{offset:number[]|null}[]=[];
  itemPickup=false;
  itemVisible=true;
  tether:{visible:boolean;returning:boolean;hand:number}|null=null;
  constructor(commands: Command[],private context?:{articleAvailable:(id:number)=>boolean}) { this.stack = [{ commands, pc: 0, loops:[] }]; }

  advance(frame: number) {
    if (this.error) return;
    let budget = 1024;
    try {
      while (this.stack.length && frame >= this.wake) {
        if (--budget <= 0) throw new Error('Script exceeded instruction budget');
        const scope = this.stack.at(-1)!;
        if (scope.pc >= scope.commands.length) {
          if(scope.loops.length)throw new Error('Unterminated script loop');
          this.stack.pop(); continue;
        }
        const c = scope.commands[scope.pc++];
        const value = (i: number) => Number(c.params[i].value);
        const raw = (i: number) => c.params[i].raw;
        switch (c.id) {
          case '0001': this.wake += value(0); break;
          case '0002': this.wake = Math.max(this.wake, value(0)); break;
          case '0004':
            if(c.params.length!==1||c.params[0].type!==0||!Number.isInteger(value(0))||value(0)<1||value(0)>1024)
              throw new Error('Unsupported loop count');
            scope.loops.push({start:scope.pc,remaining:value(0)});break;
          case '0005': {
            const loop=scope.loops.at(-1);
            if(!loop)throw new Error('Loop end without a start');
            if(--loop.remaining>0)scope.pc=loop.start;else scope.loops.pop();
            break;
          }
          case '0007': case '0009':
            if (c.external || c.recursive_reference || !c.children) throw new Error(`Unresolved call at ${c.offset}`);
            if (c.id === '0009') this.stack.pop();
            this.stack.push({ commands: c.children, pc: 0, loops:[] }); break;
          case '0008': this.stack.pop(); break;
          case '000A': {
            // Pikachu's exact Article Available(0) / Generate(0) / EndIf guard.
            const generate=scope.commands[scope.pc],end=scope.commands[scope.pc+1];
            if(c.params.length!==2||c.params[0].type!==6||raw(0)!==28||c.params[1].type!==0||value(1)!==0||
               generate?.id!=='1000'||generate.params.length!==1||generate.params[0].type!==0||generate.params[0].value!==0||end?.id!=='000F'||end.params.length||!this.context)
              throw new Error('Unsupported article availability condition');
            scope.pc+=2;if(this.context.articleAvailable(0))this.generatedArticles.push(0);break;
          }
          case '060A':
            if(!((c.params.length===9&&value(1)===400&&value(6)===208&&value(8)===2)||(c.params.length===8&&value(6)===61))||![1,2,3].includes(value(7)))throw new Error('Unsupported capture volume');
            this.grabs.set(value(0),{id:value(0),bone:value(1),radius:value(2),offset:[value(3),value(4),value(5)],targetMask:value(7)});break;
          case '060D':
            if(c.params.length)throw new Error('Unsupported grab clear');this.grabs.clear();break;
          case '060E':
            if(c.params.length!==17||![0,1].includes(value(0))||value(1)!==0||value(2)<1||value(2)>12||value(3)<0||value(3)>361||value(13)!==3||!value(15)||![0,8].includes(value(16)))throw new Error('Unsupported throw definition');
            this.throws.set(value(0),{id:value(0),bone:0,radius:0,offset:[0,0,0],damage:value(2),angle:value(3),growth:value(4),fixed:value(5),base:value(6),hitlag:value(9)});break;
          case '060F':
            if(c.params.length!==5||value(0)!==0||!((value(1)===459&&raw(2)===0x20000006&&raw(3)===0x20000007&&raw(4)===0x20000008)||([62,79,459,47].includes(value(1))&&raw(2)===0x20000002&&raw(3)===0x20000003&&raw(4)===0x20000004)))throw new Error('Unsupported captured-target throw');
            this.throwEvents.push({id:0,bone:value(1)});break;
          case '0500':
            if(c.params.length)throw new Error('Unsupported facing reversal');this.reverseDirection=!this.reverseDirection;break;
          case '0600': case '0615': {
            if (c.params.length !== (c.id==='0615'?15:13)) throw new Error('Unsupported hitbox layout');
            // Enabled attack profiles hit once per phase. Inhale and returning
            // boomerang wind use separate non-damaging repeat rules below.
            const wind=c.id==='0615'&&value(1)===0&&((raw(14)>>>0)===0xc04fffc3&&raw(13)===20||(raw(14)>>>0)===0xc0cfffc1&&raw(13)===6||(raw(14)>>>0)===0xc0cfffc3&&raw(13)===0);
            const bomb=c.id==='0615'&&raw(14)===0x4fffc0&&raw(13)===180&&value(1)===5;
            if(c.id==='0615'&&!wind&&!bomb&&(raw(13)!==0||![0x4fffc3,0x1cfffc1,0x1cf7fc1,0xcfffc3,0xcfffc1,0x1cf7fc3,0x84fffc3,0x284fffc3,0x4f0080,0x4fff40,0x1cfffc0].includes(raw(14))))throw new Error('Unsupported special hitbox behavior');
            const hit={
              id: raw(0) & 0xffff, bone: raw(0) >>> 16, damage: value(1), angle: value(2),
              growth: raw(3) & 0xffff, fixed: raw(3) >>> 16, base: raw(4) & 0xffff,
              radius: value(5), offset: [value(6), value(7), value(8)], hitlag: value(10),
              ...(c.id==='0615'?{specialFlags:raw(14)}:{}),
              ...((raw(12)&31)===7?{reverse:true}:{}),
              ...((raw(12)>>>16&3)!==3?{targetMask:raw(12)>>>16&3}:{}),
            };if(wind){this.wind=hit;this.hitboxes.delete(hit.id);}else this.hitboxes.set(hit.id,hit);break;
          }
          case '0601': {
            if(c.params.length!==2||c.params.some(p=>p.type!==0)||!Number.isInteger(value(0))||value(0)<0||!Number.isFinite(value(1))||value(1)<0)throw new Error('Unsupported hitbox damage layout');
            const hitbox=this.hitboxes.get(value(0));
            if(hitbox)this.hitboxes.set(value(0),{...hitbox,damage:value(1)});
            break;
          }
          case '0602': {
            if (c.params.length !== 2 || c.params[0].type !== 0 || c.params[1].type !== 1 ||
                !Number.isFinite(value(1)) || value(1) < 0) throw new Error('Unsupported hitbox resize layout');
            const hitbox = this.hitboxes.get(raw(0));
            if (hitbox) this.hitboxes.set(raw(0), { ...hitbox, radius: value(1) });
            break;
          }
          case '0604': this.hitboxes.clear(); this.hitboxEpoch++; break;
          case '0605':
            if(c.params.length!==1||c.params[0].type!==0||![0,1,2,3,4].includes(value(0)))throw new Error('Unsupported body collision state');
            this.hurtState=value(0);break;
          case '0608':
            if(c.params.length!==2||c.params.some(p=>p.type!==0)||!Number.isInteger(value(0))||value(0)<0||![0,1,2].includes(value(1)))throw new Error('Unsupported bone collision state');
            if(value(1))this.boneStates.set(value(0),value(1));else this.boneStates.delete(value(0));break;
          case '0606':
            if(c.params.length!==1||c.params[0].type!==0||value(0)!==0)throw new Error('Unsupported bone collision reset');
            this.boneStates.clear();break;
          case '0C09':
            if(c.params.length!==1||c.params[0].type!==0||![0,1,2].includes(value(0)))throw new Error('Unsupported ledge grab mode');
            this.ledgeGrab=value(0);break;
          case '120A': this.variables.add(raw(0)); break;
          case '0E00':
            // EscapeAir's observed profile. Retain the raw common-state mode;
            // it must never be interpreted as a forced ground collision.
            if(c.params.length!==1||c.params[0].type!==0||value(0)!==0)throw new Error('Unsupported air/ground mode');
            this.airGroundMode=value(0);break;
          case '0617': case '0618':
            if(c.params.length!==3||c.params.some(p=>p.type!==0)||value(0)!==3||value(1)!==0||value(2)!==2)throw new Error('Unsupported reflector');
            this.reflector=c.id==='0617';break;
          case '1F09':
            if(c.params.length!==1||c.params[0].type!==3||value(0)!==0)throw new Error('Unsupported held-item visibility');
            this.itemVisible=false;break;
          case '1F00':
            if(c.params.length!==1||c.params[0].type!==0||value(0)!==0)throw new Error('Unsupported item pickup');
            this.itemPickup=true;break;
          case '1F01': case '1F0E': {
            const offset=c.id==='1F0E'?2:0;
            if(c.params.length!==offset+3||c.params.slice(0,offset).some(p=>p.type!==1)||c.params.slice(offset).some((p,i)=>p.type!==5||p.raw!==[1030,1029,1031][i]))throw new Error('Unsupported item throw event');
            this.itemThrows.push({offset:offset?[value(0),value(1)]:null});break;
          }
          case '1001': case '1002':
            if(c.params.length!==1||c.params[0].type!==0||!(c.id==='1001'?[2]:[0,2]).includes(value(0)))throw new Error('Unsupported side article event');
            this.sideEvents.push({action:c.id==='1001'?'shoot':'end',id:value(0)});break;
          case '1000':
            if(c.params.length!==1||c.params[0].type!==0||![0,1,2,3,4,13,14].includes(value(0)))throw new Error('Unsupported article generation');
            this.generatedArticles.push(value(0));break;
          case '1007': case '1008': case '1004': case '1003': {
            const remove=c.id==='1003',hand=c.id==='1004';
            if(c.params.length!==(remove?1:2)||c.params.some(p=>p.type!==0)||!(remove?[3,4].includes(value(0)):value(0)===(hand?4:3))||(!remove&&!(hand?[0,1].includes(value(1)):value(1)===(c.id==='1007'?1:3))))throw new Error('Unsupported tether article event');
            this.tether??={visible:false,returning:false,hand:0};
            if(remove)this.tether.visible=false;else if(hand)this.tether.hand=value(1);else {this.tether.visible=true;this.tether.returning=c.id==='1008';}break;
          }
          case '1005':
            if(c.params.length!==2||c.params[0].type!==0||![0,1,13,14].includes(value(0))||c.params[1].type!==3)throw new Error('Unsupported article visibility');
            this.articleVisibility.set(value(0),!!value(1));break;
          case '0B00':
            if(c.params.length!==2||c.params.some(p=>p.type!==0)||![1,2].includes(value(0))||![0,1].includes(value(1)))throw new Error('Unsupported model visibility group');
            this.modelVisibility.set(value(0),value(1));break;
          case '120B': this.variables.delete(raw(0)); break;
          case '1203':
            if(c.params.length!==1||c.params[0].type!==5||(raw(0)>>>24)!==0x20)throw new Error('Unsupported integer increment');
            this.integers.set(raw(0),(this.integers.get(raw(0))??0)+1);break;
          case '6400': this.interruptible = true; break;
          default: throw new Error(`Unsupported command ${c.id} at ${c.offset}`);
        }
      }
    } catch (error) {
      this.error = String(error);
      this.hitboxes.clear();
    }
  }

  snapshot() {
    return { airGroundMode:this.airGroundMode,itemPickup:this.itemPickup,itemVisible:this.itemVisible,itemThrows:this.itemThrows.map(e=>({offset:e.offset?[...e.offset]:null})),side:{reflector:this.reflector,events:this.sideEvents.map(e=>({...e}))},wake: this.wake, stack: this.stack.map(s => ({ pc: s.pc, offsets: s.commands.map(c => c.offset),loops:s.loops.map(l=>({...l})) })),
      hitboxes: [...this.hitboxes.values()],grabs:[...this.grabs.values()],throws:[...this.throws.values()],throwEvents:this.throwEvents.map(e=>({...e})),wind:this.wind?{...this.wind}:null, variables: [...this.variables], interruptible: this.interruptible, error: this.error,
      hitboxEpoch:this.hitboxEpoch,hurtState:this.hurtState,ledgeGrab:this.ledgeGrab,integers:[...this.integers],generatedArticles:[...this.generatedArticles],boneStates:[...this.boneStates],articleVisibility:[...this.articleVisibility],modelVisibility:[...this.modelVisibility],grapple:{reverse:this.reverseDirection,tether:this.tether?{...this.tether}:null} };
  }
}
