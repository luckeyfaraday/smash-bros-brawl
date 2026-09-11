import {neutralInput,type Input} from './types';

export const GAME_KEYS=new Set(['KeyA','KeyD','KeyW','KeyS','ArrowUp','ArrowLeft','ArrowRight','ArrowDown','Space','KeyJ','KeyK','KeyL','KeyI','KeyU','KeyF','KeyO','KeyG','Backslash','BracketLeft','BracketRight','Quote','ShiftLeft','ShiftRight','Enter','Slash','Period','Comma','Semicolon']);

/** Keyboard, touch and standard gamepads feed the same fighter inputs. */
export class GameInput {
  readonly keys=new Set<string>();
  readonly touch=new Map<number,string>();
  private presses=new Set<string>();
  private taps=new Set<string>();
  private waitForButtons=false;
  pressKey(code:string){if(!this.keys.has(code))this.presses.add(code);this.keys.add(code);}
  pressTouch(pointer:number,control:string){this.touch.set(pointer,control);this.taps.add(control);}
  // A quick press/release between display frames still reaches both players'
  // input reads for one simulation tick. Pausing discards any queued presses.
  endFrame(){this.presses.clear();this.taps.clear();}
  clear(){this.keys.clear();this.touch.clear();this.endFrame();this.waitForButtons=true;}
  pads(){return [...navigator.getGamepads()].filter((pad):pad is Gamepad=>!!pad&&pad.mapping==='standard');}
  read(player:number,local:boolean):Input {
    const input=neutralInput(),keys=new Set([...this.keys,...this.presses]);
    if(player===0){
      input.axis=Number(keys.has('KeyD')||!local&&keys.has('ArrowRight'))-Number(keys.has('KeyA')||!local&&keys.has('ArrowLeft'));
      input.jump=keys.has('Space');input.attack=keys.has('KeyJ');input.shield=keys.has('KeyK');input.smash=keys.has('KeyL');
      input.special=keys.has('KeyI');input.neutral=keys.has('KeyU');input.grab=keys.has('KeyF');input.side=keys.has('KeyO');input.downSpecial=keys.has('KeyG');
      input.run=keys.has('ShiftLeft')||!local&&keys.has('ShiftRight');input.down=keys.has('KeyS')||!local&&keys.has('ArrowDown');
      input.vertical=Number(keys.has('KeyW')||!local&&keys.has('ArrowUp'))-Number(input.down);
      const touch=new Set([...this.touch.values(),...this.taps]);
      if(touch.has('left')||touch.has('right')){input.axis=Number(touch.has('right'))-Number(touch.has('left'));input.run=true;}
      if(touch.has('up')||touch.has('down'))input.vertical=Number(touch.has('up'))-Number(touch.has('down'));
      input.down||=touch.has('down');
      for(const key of ['jump','attack','shield','smash','special','neutral'] as const)input[key]||=touch.has(key);
    }else{
      input.axis=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
      input.jump=keys.has('Enter');input.attack=keys.has('Slash');input.smash=keys.has('Period');input.shield=keys.has('Comma');
      input.special=keys.has('Semicolon');input.neutral=keys.has('Quote');input.grab=keys.has('BracketRight');input.side=keys.has('BracketLeft');input.downSpecial=keys.has('Backslash');
      input.run=keys.has('ShiftRight');input.down=keys.has('ArrowDown');input.vertical=Number(keys.has('ArrowUp'))-Number(input.down);
    }
    const pads=this.pads();
    // With one gamepad, a local match uses keyboard P1 and gamepad P2.
    const pad=local&&pads.length===1?(player===1?pads[0]:undefined):pads[player];
    if(this.waitForButtons){if(pads.every(p=>p.buttons.every(b=>!b.pressed)))this.waitForButtons=false;}
    if(pad){
      const axis=pad.axes[0]??0,vertical=-(pad.axes[1]??0);
      if(Math.abs(axis)>.18)input.axis=axis;
      if(Math.abs(vertical)>.18)input.vertical=vertical;
      input.run||=Math.abs(axis)>.8;input.down||=vertical<-.65;
      if(!this.waitForButtons){
        input.jump||=!!pad.buttons[0]?.pressed;input.attack||=!!pad.buttons[2]?.pressed;input.smash||=!!pad.buttons[3]?.pressed;
        input.shield||=!!pad.buttons[6]?.pressed||!!pad.buttons[7]?.pressed;
        input.special||=!!pad.buttons[1]?.pressed;input.neutral||=!!pad.buttons[5]?.pressed;input.grab||=!!pad.buttons[4]?.pressed;
        if(pad.buttons[14]?.pressed||pad.buttons[15]?.pressed){input.side=true;input.axis=pad.buttons[14]?.pressed?-1:1;}
        input.downSpecial||=!!pad.buttons[13]?.pressed;
      }
    }
    return input;
  }
}
