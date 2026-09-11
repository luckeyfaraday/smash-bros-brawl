import source from './data/cpu-ai.json' with {type:'json'};
import {AiScriptVM,type AiScript,type AiHost} from './ai-script';
import type {FighterController} from './fighter';
import {STAGE} from './stage';
import {neutralInput,type Input} from './types';

type Attack={subaction:number;name:string|null;start:number;end:number;xmin:number;xmax:number;ymin:number;ymax:number};
type Archive={scripts:Record<string,AiScript>;attacks:Attack[];
  parameters:{definitions:{farDistance:number;middleDistance:number}[];slots:{entries:{command:number}[]}[]}};
const archives=source.archives as unknown as Record<string,Archive>;
const clipForCommand:Record<number,string>={1:'Attack11',2:'AttackS3S',3:'AttackHi3',4:'AttackLw3',
  5:'AttackS4S',6:'AttackHi4',7:'AttackLw4',8:'SpecialN',9:'SpecialS',10:'SpecialHi',11:'SpecialLw',12:'Catch',
  14:'AttackAirN',15:'AttackAirF',16:'AttackAirB',17:'AttackAirHi',18:'AttackAirLw',19:'SpecialAirN',
  20:'SpecialAirS',21:'SpecialAirHi',22:'SpecialAirLw'};
export const commandRoutine=(command:number)=>command<=12?0x6030+command:command>=14&&command<=22?0x6041+command-14:0;
const routineCommand=(routine:number)=>routine>=0x6031&&routine<=0x603c?routine-0x6030:
  routine>=0x6041&&routine<=0x6049?routine-0x6041+14:0;
export function attackSlot(slot:number){return slot>=0x6011&&slot<=0x602d?slot-(slot>=0x6021?0x6016:0x6011):-1;}
export function aiAttack(fighter:string,clip:string){return archives[fighter]?.attacks.find(a=>a.name===clip);}
export function aiScript(fighter:string,id:number):AiScript|undefined {
  return Object.values(archives[fighter]?.scripts??{}).find(s=>(s.id&0x7fff)===id)
    ??Object.values(archives.common.scripts).find(s=>(s.id&0x7fff)===id);
}

type Mode='wait'|'approach'|'attack'|'defend'|'recover'|'air'|'existing-action';
type Trace={frame:number;mode:Mode;script:number|null;offsets:number[];call:number|null;input:Input;error:string|null};
const attacking=(c:FighterController)=>['jab','tilt','smash','dashAttack','aerial','rapid','rapidStart'].includes(c.f.state);
const clamp=(v:number)=>Math.max(-1,Math.min(1,v));

/** Original bytecode + AIPD attack membership + ATKD ranges, with a reconstructed
 * mode selector/world adapter. This is NOT a port of Brawl's native aiInput.
 * Existing controller inputs retain responsibility for all fighter transitions.
 */
export class MarioCpu {
  private vm:AiScriptVM|null=null;
  private mode:Mode='wait';
  private random=0x6d2b79f5;
  private pending=0;
  private pendingAge=0;
  private defendUntil=0;
  private lastRoutine=0;
  private error:string|null=null;
  private frames:Trace[]=[];

  reset(){
    if(this.vm)this.random=this.vm.state.random;
    this.vm=null;this.mode='wait';this.pending=0;this.pendingAge=0;this.defendUntil=0;this.lastRoutine=0;this.error=null;
  }
  private stop(){if(this.vm)this.random=this.vm.state.random;this.vm=null;}
  private start(id:number,mode:Mode){
    this.stop();const script=aiScript('mario',id);
    if(!script)throw new Error(`Missing source AI script 0x${id.toString(16)}`);
    this.vm=new AiScriptVM(script,this.random);this.mode=mode;
  }
  private roll(){if(this.vm)return this.vm.random();let x=this.random;x^=x<<13;x^=x>>>17;x^=x<<5;this.random=x>>>0;return this.random/0x100000000;}
  private threatened(self:FighterController,target:FighterController){
    if(!attacking(target))return false;
    const a=aiAttack(target.data.id??'mario',target.f.clip);
    if(!a)return false;
    const x=(self.f.x-target.f.x)*target.f.facing,y=self.f.y+6-target.f.y;
    return target.f.age>=Math.max(0,a.start-4)&&target.f.age<=a.end&&
      x>=a.xmin-4&&x<=a.xmax+4&&y>=a.ymin-4&&y<=a.ymax+4;
  }
  private choose(slot:number,self:FighterController,target:FighterController){
    const entries=archives.mario.parameters.slots[attackSlot(slot)]?.entries??[];
    const f=self.f,t=target.f,dx=(t.x-f.x)*f.facing,dy=t.y-f.y;
    let winner=0,best=-Infinity;
    for(const {command} of entries){
      if(!clipForCommand[command]||!self.data.moves[clipForCommand[command]])continue;
      if(f.grounded?command>=14:command<14)continue;
      let score=0;
      // The original candidate membership is retained. Ranking is a browser
      // reconstruction; AIPD's control bytes are exported without guessed names.
      if(command===1)score=t.damage<65?100:20;
      if(command===2||command===4)score=35;
      if(command===3)score=dy>8?130:25;
      if(command===5)score=t.damage>=65?160:15;
      if(command===6)score=dy>8?155:20;
      if(command===7)score=dx<0?130:20;
      if(command===8||command===19)score=Math.abs(dx)>30?150:10;
      if(command===12)score=t.state==='shield'?220:5;
      if(command>=14&&command<=18)score=command===(dy>10?17:dy<-8?18:dx>8?15:dx<-8?16:14)?150:25;
      if(command===21&&!f.grounded)score=200;
      if(score===0)continue;
      score+=this.roll()*5;
      if(score>best){best=score;winner=commandRoutine(command);}
    }
    return winner;
  }
  private host(self:FighterController,target:FighterController):AiHost {
    const f=self.f,t=target.f,def=archives.mario.parameters.definitions[0];
    const dx=()=>t.x-f.x,offstage=()=>f.x<STAGE.left||f.x>STAGE.right;
    const point=():[number,number]=>[f.x<0?STAGE.left:STAGE.right,0];
    return {
      value:(id,component)=>{
        switch(id){
          case 0:return def.farDistance;
          case 1:return def.middleDistance;
          case 2:return f.facing;
          case 3:return Math.sign(dx())||f.facing;
          case 4:case 0x1a:return component?f.y:f.x;
          case 5:case 0x1c:return component?t.y:t.x;
          case 6:return dx()<0?f.x-STAGE.left:STAGE.right-f.x;
          case 8:return component?f.vy:f.vx;
          case 0xb:case 0x1b:return f.y;
          case 0xc:case 0x1d:return t.y;
          case 0xd:return f.vy;
          case 0xf:return f.state==='specialFall'?0:Math.max(0,self.a.Jumps-f.jumps);
          case 0x10:return f.facing>0?STAGE.right-f.x:f.x-STAGE.left;
          case 0x11:return 100;
          case 0x16:return component?t.vy:t.vx;
          case 0x17:return t.vy;
          case 0x1e:return f.damage;
          case 0x1f:return t.damage;
          case 0x25:return t.facing;
          case 0x29:return f.facing>0?f.x-STAGE.left:STAGE.right-f.x;
          case 0x2a:return STAGE.blastBottom;
          case 0x2b:return STAGE.blastTop;
          case 0x2c:return -STAGE.blastX;
          case 0x2d:return STAGE.blastX;
          default:throw new Error(`Unmapped AI world function 0x${id.toString(16)}`);
        }
      },
      requirement:(id,args,value)=>{
        switch(id){
          case 0:return true;
          case 1:return (t.x<STAGE.left||t.x>STAGE.right)&&t.y<0;
          case 0x1000:{const d=Math.abs(dx());return args.length===1?d<=value(args[0]):d>=value(args[0])&&d<=value(args[1]);}
          case 0x1001:return Math.hypot(dx(),t.y-f.y)<=value(args[0]);
          case 0x1003:return f.grounded&&['idle','walk','crouch','shield'].includes(f.state);
          case 0x1004:return f.state==='run';
          case 0x1005:return !f.grounded;
          case 0x100b:case 0x1014:return !!self.grab&&self.grab.phase==='hold';
          case 0x100d:return offstage();
          case 0x100e:return f.state==='specialFall';
          case 0x100f:return f.state==='shield'&&f.shieldStun>0;
          case 0x1010:return Math.abs(dx())<=value(args[0]);
          case 0x1012:return offstage()&&f.vy<0;
          case 0x1013:return f.invincible>0;
          case 0x1015:return f.grounded&&t.grounded;
          case 0x1017:return attacking(target);
          case 0x1018:return !(t.ledgeSide&&Math.sign(t.x)===Math.sign(f.x));
          case 0x101b:return !t.grounded;
          default:throw new Error(`Unmapped AI world requirement 0x${id.toString(16)}`);
        }
      },
      chooseAttack:slot=>this.choose(slot,self,target),
      attackRange:(base,routine)=>{
        const a=aiAttack('mario',clipForCommand[routineCommand(routine)]);
        return a?Math.min(base,Math.max(1,a.xmax-2)):base;
      },
      point:kind=>kind==='stage'?[Math.max(STAGE.left+15,Math.min(STAGE.right-15,f.x)),0]:point(),
      shieldRemaining:()=>f.shield/.15,
    };
  }
  private action(routine:number,self:FighterController,target:FighterController):Input {
    const input=neutralInput(),f=self.f,t=target.f,c=routineCommand(routine),dir=Math.sign(t.x-f.x)||f.facing;
    if(c<=12&&f.facing!==dir){input.axis=dir;return input;}
    if(c===1)input.attack=true;
    if(c===2){input.axis=dir;input.attack=true;}
    if(c===3||c===4){input.vertical=c===3?1:-1;input.attack=true;}
    if(c>=5&&c<=7){input.smash=true;input.vertical=c===6?1:c===7?-1:0;}
    if(c===8||c===19)input.neutral=true;
    if(c===9||c===20){input.side=true;input.axis=dir;}
    if(c===10||c===21){input.special=true;input.axis=-Math.sign(f.x);input.vertical=1;}
    if(c===11||c===22)input.downSpecial=true;
    if(c===12)input.grab=true;
    if(c>=14&&c<=18){
      input.attack=true;input.axis=c===15?f.facing:c===16?-f.facing:0;
      input.vertical=c===17?1:c===18?-1:0;
    }
    // Normal controllers consume button edges. Release before retrying a native
    // request that arrived during landing, hitlag or shield-release recovery.
    for(const button of ['attack','smash','neutral','special','side','downSpecial','grab'] as const)
      if(input[button]&&self.previous[button])return neutralInput();
    return input;
  }
  step(self:FighterController,target:FighterController,frame:number,existing:()=>Input):Input {
    const f=self.f,t=target.f;
    let input=neutralInput(),offsets:number[]=[],call:number|null=null,script:number|null=null;
    const record=()=>{
      this.frames.push({frame,mode:this.mode,script,offsets,call,input:{...input},error:this.error});
      if(this.frames.length>120)this.frames.shift();return input;
    };
    if(f.hitlag){input={...self.previous};return record();}
    if(f.hitstun||self.knockdown||self.grab||f.ledgeSide||self.evade||self.ranged||self.side||self.downSpecial||self.heldBomb()||
      ['captured','spitStar','ko','respawn','shieldBreak'].includes(f.state)){
      this.stop();this.pending=0;this.mode='existing-action';input=existing();return record();
    }
    if(f.state==='special'||f.state==='specialFall'){
      this.stop();this.pending=0;this.mode='recover';input.axis=-Math.sign(f.x);return record();
    }
    if(attacking(self)||self.smashCharge){
      this.stop();this.pending=0;this.mode='attack';
      if(f.state==='jab')input.attack=!self.previous.attack;
      if(!f.grounded)input.axis=Math.abs(f.x)>STAGE.right-10?-Math.sign(f.x):Math.sign(t.x-f.x);
      return record();
    }
    const outside=f.x<STAGE.left||f.x>STAGE.right;
    if(!f.grounded&&outside){
      if(this.mode!=='recover'){this.stop();this.pending=0;this.mode='recover';}
      input.axis=-Math.sign(f.x);
      // Native jump selection/world prediction is reconstructed. Once jumps
      // are spent the original 0x2040 script aims and requests the recovery B.
      if(f.jumps<self.a.Jumps&&f.vy<0&&f.y<8){input.jump=!self.previous.jump;return record();}
      if(f.vy>=0||f.y>8)return record();
      if(!this.vm||this.vm.state.finished)this.start(0x2040,'recover');
    }else{
      if(this.mode==='recover'){this.stop();this.pending=0;}
      if(['ko','respawn'].includes(t.state)){this.stop();this.pending=0;this.mode='wait';return record();}
      if(f.state==='landing'||f.state==='shieldRelease'||f.state==='jumpSquat'){
        input.jump=f.state==='jumpSquat';return record();
      }
      if(this.pending){
        if(++this.pendingAge>30){this.pending=0;this.pendingAge=0;}
        else {input=this.action(this.pending,self,target);call=this.pending;return record();}
      }
      if(f.grounded&&frame>=this.defendUntil&&this.threatened(self,target)&&this.mode!=='defend'){
        this.start(0x3020,'defend');this.defendUntil=frame+30;
      }
      if(this.vm?.state.finished){this.stop();}
      if(!this.vm){
        const dx=Math.abs(t.x-f.x),dy=t.y-f.y;
        if(!f.grounded){
          this.mode='air';input.axis=Math.abs(f.x)>STAGE.right-10?-Math.sign(f.x):Math.sign(t.x-f.x);
          if(dx<22&&Math.abs(dy)<22){call=this.choose(dy>10?0x601f:dy<-8?0x6020:0x601d,self,target);input=this.action(call,self,target);}
          return record();
        }
        if(f.state==='shield'){this.mode='wait';return record();}
        if(t.state==='shield'&&dx<=(aiAttack('mario','Catch')?.xmax??12)&&Math.abs(dy)<10){
          this.mode='attack';this.pending=0x603c;this.pendingAge=0;call=this.pending;input=this.action(this.pending,self,target);return record();
        }
        if(dy>22&&dx<35){this.mode='air';input.jump=!self.previous.jump;input.axis=Math.sign(t.x-f.x);return record();}
        const def=archives.mario.parameters.definitions[0];
        if(dx>def.farDistance)this.start(0x60,'approach');
        else if(dx>def.middleDistance)this.start(0x40,'approach');
        else if(dy>8)this.start(0x1030,'attack');
        else this.start(t.damage>=65?0x1020:0x1010,'attack');
      }
    }
    const vm=this.vm!;script=vm.script.id;
    const output=vm.step(this.host(self,target));offsets=output.offsets;call=output.call;
    input=neutralInput();input.axis=clamp(output.x);input.vertical=clamp(output.y);input.run=Math.abs(output.x)>.8;
    input.attack=!!(output.buttons&1);input.shield=!!(output.buttons&4);input.jump=!!(output.buttons&8);
    if(output.buttons&2){
      if(output.y>.3)input.special=true;
      else if(output.y<-.3)input.downSpecial=true;
      else if(Math.abs(output.x)>.3)input.side=true;
      else input.neutral=true;
    }
    if(call!==null){
      this.lastRoutine=call;
      if(call>=0x6011&&call<=0x602d)call=this.choose(call,self,target);
      if(routineCommand(call)){
        this.pending=call;this.pendingAge=0;input=this.action(call,self,target);
      }else if(call&&aiScript('mario',call)){
        // Script-to-script calls terminate this frame; the callee starts next tick.
        this.start(call,this.mode);
      }else if(call){this.error=`Unimplemented native AI routine 0x${call.toString(16)}`;}
    }
    if(vm.state.error){this.error=vm.state.error;input=neutralInput();}
    // Stage geometry is reconstructed. Never let an attack approach pursue an
    // opponent into empty space; recovery still uses the source script's stick.
    const stopX=f.x+f.vx*Math.abs(f.vx)/(2*self.a['Stopping Velocity']);
    if(f.grounded&&(Math.max(f.x,stopX)>=STAGE.right-8&&input.axis>0||Math.min(f.x,stopX)<=STAGE.left+8&&input.axis<0)){
      input.axis=0;input.run=false;
    }
    return record();
  }
  get fault(){return this.error;}
  snapshot(){return {engine:'brawl-script-mario-v1',mode:this.mode,random:this.random,pending:this.pending,
    pendingAge:this.pendingAge,defendUntil:this.defendUntil,lastRoutine:this.lastRoutine,error:this.error,vm:this.vm?.snapshot()??null};}
  trace(){return this.frames.map(f=>({...f,offsets:[...f.offsets],input:{...f.input}}));}
}
