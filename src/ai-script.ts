/** Brawl AI bytecode, separate from the fighter's PSA attack VM.
 * Control flow follows the vanilla sora_melee.rel dispatcher; see the native
 * probe and docs/cpu-ai-validation.md. World queries/native actions are supplied
 * by the host and are explicitly outside this interpreter's fidelity claim.
 */
export type AiInstruction={offset:number;opcode:number;args:number[]};
export type AiScript={id:number;offset:number;constants:number[];instructions:AiInstruction[]};
export type AiHost={
  value:(id:number,component:number)=>number;
  requirement:(id:number,args:number[],value:(operand:number)=>number)=>boolean;
  chooseAttack:(slot:number)=>number;
  attackRange:(base:number,routine:number)=>number;
  point:(kind:'return'|'cliff'|'stage')=>[number,number];
  shieldRemaining:()=>number;
};
export type AiState={script:number;pc:number;resume:number;frames:number;timeout:number;
  variables:number[];nextScript:number;random:number;finished:boolean;error:string|null};
export type AiOutput={x:number;y:number;buttons:number;call:number|null;offsets:number[]};
const f32=Math.fround;

export class AiScriptVM {
  readonly state:AiState;
  constructor(readonly script:AiScript,seed=0x6d2b79f5) {
    this.state={script:script.id,pc:0,resume:0,frames:0,timeout:0,variables:Array(24).fill(0),
      nextScript:0,random:seed>>>0||1,finished:false,error:null};
  }
  random(){
    // Browser seed, not Brawl's global RNG. Included in snapshots/replays.
    let x=this.state.random;x^=x<<13;x^=x>>>17;x^=x<<5;
    this.state.random=x>>>0;return this.state.random/0x100000000;
  }
  private readVariable(index:number) {
    if(!Number.isInteger(index)||index<0||index>=24)throw new Error(`AI variable ${index} out of range`);
    return this.state.variables[index];
  }
  private write(index:number,value:number) {
    this.readVariable(index);
    const rounded=f32(value);
    if(!Number.isFinite(rounded))throw new Error('Non-finite AI arithmetic');
    this.state.variables[index]=rounded;
  }
  /** Vanilla skip helper 0x8091e458: Else + If is a single else-if level. */
  private skip(pc:number) {
    const code=this.script.instructions,fromElse=code[pc].opcode===8;
    let depth=fromElse?1:0,previous=-1;
    for(let i=pc;i<code.length;i++){
      const op=code[i].opcode;
      if((op===6||op===7)&&previous!==8)depth++;
      if(!fromElse&&op===8&&depth===1)return i+1;
      if(op===9&&--depth<=0)return i+1;
      previous=op;
    }
    throw new Error('Unterminated AI condition');
  }
  step(host:AiHost):AiOutput {
    const out:AiOutput={x:0,y:0,buttons:0,call:null,offsets:[]},s=this.state,code=this.script.instructions;
    if(s.finished)return out;
    const value=(operand:number,component=0):number=>{
      if(!Number.isInteger(operand)||operand<0||operand>=0x3000)throw new Error(`Unsupported AI operand ${operand}`);
      if(operand<0x1000)return this.readVariable(operand+component);
      if(operand>=0x2000){const v=this.script.constants[operand-0x2000];if(v===undefined)throw new Error('AI constant out of range');return v;}
      if(operand===0x1009)return 0;
      if(operand===0x100a)return 1;
      if(operand===0x100e)return this.random();
      if(operand===0x1007)return s.frames;
      const result=host.value(operand-0x1000,component);
      if(!Number.isFinite(result))throw new Error(`Invalid AI function ${operand.toString(16)}`);
      return result;
    };
    const condition=(ins:AiInstruction)=>{
      const [req,...args]=ins.args;
      let result:boolean;
      if(req>=0x1007&&req<=0x100a){
        const a=value(args[0]),b=value(args[1]);
        result=req===0x1007?a>b:req===0x1008?a<b:req===0x1009?a>=b:a<=b;
      }else if(req===0x1002)result=s.frames>=value(args[0]);
      else if(req===0x1011)result=s.nextScript===args[0];
      else if(req===0x100c)result=(s.script&0x7fff)===args[0];
      else result=host.requirement(req,args,a=>value(a));
      return [7,23,25].includes(ins.opcode)?!result:result;
    };
    let pc=s.pc,returnTo:number|null=null,budget=512;
    try {
      while(pc<code.length&&!s.finished){
        if(--budget<0)throw new Error('AI instruction budget exceeded');
        const ins=code[pc],a=ins.args,op=ins.opcode;
        out.offsets.push(ins.offset);
        switch(op){
          case 0:s.finished=true;break;
          case 1:this.write(a[0],value(a[1]));break;
          case 2:this.write(a[0],value(a[1]));this.write(a[0]+1,value(a[1],1));break;
          case 3:s.resume=pc+1;s.pc=s.resume;break;
          case 4:
            if(returnTo!==null){pc=returnTo;returnTo=null;continue;}
            pc=code.length;continue;
          case 5:case 28:{
            const label=a.length?code.findIndex(i=>i.opcode===3&&i.args[0]===a[0]):code.findIndex((i,n)=>n>pc&&i.opcode===3);
            if(label<0)throw new Error(`Missing AI label ${a[0]??'next'}`);
            if(op===28){
              if(returnTo!==null)throw new Error('Nested Goto exceeds vanilla return slot');
              returnTo=pc+1;pc=label+1;continue;
            }
            s.resume=label+1;s.pc=s.resume;s.frames=-1;break;
          }
          case 6:case 7:{
            let test=condition(ins),next=pc+1;
            while(next<code.length&&code[next].opcode>=22&&code[next].opcode<=25){
              const other=condition(code[next]); // Native evaluates even when the first condition decides the result.
              test=code[next].opcode<=23?test||other:test&&other;out.offsets.push(code[next].offset);next++;
            }
            pc=test?next:this.skip(pc);continue;
          }
          case 8:pc=this.skip(pc);continue;
          case 9:break;
          case 10:case 31:
            // The native handlers ADD to this frame's stick; they do not replace it.
            out.x=f32(out.x+f32(value(a[0])*(op===10?host.value(2,0):1)));
            if(a.length>1)out.y=f32(out.y+value(a[1]));break;
          case 11:out.buttons|=a[0];break;
          case 12:case 13:case 14:case 15:case 16:case 17:case 18:case 19:
            for(const operand of a.slice(1))for(let component=0;component<(op>=16?2:1);component++){
              const old=this.readVariable(a[0]+component),v=value(operand,component),kind=op>=16?op-4:op;
              this.write(a[0]+component,kind===12?old+v:kind===13?old-v:kind===14?old*v:old/v);
            }
            break;
          case 20:s.frames++;pc=s.resume;continue;
          case 21:
            if(![1,3].includes(a.length))throw new Error('Unsupported extended AI Random');
            this.write(a[0],a.length===1?this.random():value(a[1])+this.random()*value(a[2]));break;
          case 22:case 23:case 24:case 25:break;
          case 26:s.frames=Math.trunc(value(a[0]));break;
          case 27:out.call=a[0]??s.nextScript;s.finished=true;break;
          case 29:case 39:case 49:{
            const point=host.point(op===29?'return':op===39?'stage':'cliff');
            this.write(a[0],point[0]);this.write(a[0]+1,point[1]);break;
          }
          case 30:for(const index of a)this.write(index,Math.abs(this.readVariable(index)));break;
          case 32:case 33:
            if(host.requirement(0x1005,[],value)||op===33&&!host.requirement(0x1003,[],value)){
              s.pc=pc;pc=code.length;continue;
            }
            s.pc=pc+1;break;
          case 34:s.timeout=Math.trunc(value(a[0]));break;
          case 38:this.write(a[0],host.shieldRemaining());break;
          case 40:case 41:{
            const component=op===40?0:1;
            this.write(a[0],host.value(5,component)+host.value(0x16,component)*value(a[1]));break;
          }
          case 42:s.nextScript=host.chooseAttack(a[0]);break;
          case 43:break;
          case 44:this.write(a[0],Math.hypot(value(a[1]),value(a[2])));break;
          case 45:this.write(a[0],value(a[1])*value(a[3])+value(a[2])*value(a[4]));break;
          case 47:this.write(a[0],host.attackRange(value(a[1]),s.nextScript));break;
          case 48:break; // Native attack-correction request; handled by the host's range gate.
          case 50:
            if(a.length===0||a[0]===0)out.x=0;
            if(a.length===0||a[0]!==0)out.y=0;
            break;
          default:throw new Error(`Unsupported AI opcode 0x${op.toString(16)} at 0x${ins.offset.toString(16)}`);
        }
        pc++;
      }
      s.frames++;
      if(s.timeout>0&&--s.timeout===0)s.finished=true;
    }catch(error){
      s.error=error instanceof Error?error.message:String(error);s.finished=true;
      out.x=out.y=out.buttons=0;out.call=null;
    }
    return out;
  }
  snapshot():AiState{return {...this.state,variables:[...this.state.variables]};}
}
