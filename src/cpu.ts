import type {FighterController} from './fighter';
import {STAGE} from './stage';
import {neutralInput} from './types';
import {tumblePhase} from './knockdown';

/** A deterministic beginner opponent using the same inputs as a human. */
export function cpuInput(self:FighterController,target:FighterController,frame:number) {
  const input=neutralInput(),f=self.f,t=target.f;
  if(f.state==='captured'){input.attack=frame%12===0;input.axis=frame%24<12?-1:1;return input;}
  if(f.state==='spitStar')return input;
  if(self.knockdown){
    const phase=self.knockdown.phase;
    if(tumblePhase(phase)){
      const onStage=f.x>=STAGE.left&&f.x<=STAGE.right;
      if(f.hitstun===0)input.axis=Math.abs(f.x)>STAGE.right-15?-Math.sign(f.x):0;
      // Read the same visible trajectory as a player; the beginner CPU can
      // miss techs and always obeys the shared press window and lockout.
      if(onStage&&f.vy<0&&f.y< -f.vy*5&&self.tech.lockout===0&&frame%4!==0){
        input.shield=true;input.axis=Math.abs(t.x-f.x)<28?-Math.sign(t.x-f.x):0;
        if(Math.abs(f.x)>STAGE.right-25)input.axis=-Math.sign(f.x);
      }else if(!onStage&&!f.hitstun){
        input.axis=-Math.sign(f.x);input.jump=f.y<8&&f.jumps<self.a.Jumps;
        input.special=!input.jump&&f.y< -8;
      }
    }else if(phase==='wait'&&f.age>=12){
      if(Math.abs(f.x)>STAGE.right-35)input.axis=-Math.sign(f.x);
      else if(Math.abs(t.x-f.x)<22)input.attack=true;
      else if(frame%120<60)input.axis=-Math.sign(t.x-f.x);
      else input.jump=true;
    }
    return input;
  }
  if(self.grab){
    if(self.grab.phase==='hold'&&f.age>=5){
      if(f.age<7&&frame%180<60)input.attack=true;
      else if(frame%180>=120)input.vertical=1;
      else input.axis=Math.abs(f.x)>65?Math.sign(f.x):f.facing;
    }
    return input;
  }
  if(['ko','respawn','shieldBreak'].includes(f.state)||f.hitstun)return input;
  if(f.state==='ledgeHang'){
    if(f.age>8){
      if(Math.abs(t.x-f.x)<24&&t.grounded)input.attack=true;
      else if(Math.abs(t.x-f.x)<48)input.shield=true;
      else input.axis=f.facing;
    }
    return input;
  }
  if(f.ledgeSide)return input;
  if(self.evade)return input;
  if(self.quickAttack){
    if(self.quickAttack.phase==='start'){input.vertical=1;}
    else {input.axis=-Math.sign(f.x);input.vertical=f.y<-8?1:0;}
    return input;
  }
  if(self.ranged){input.neutral=self.ranged.kind==='arrow'&&self.ranged.phase!=='release'&&Math.abs(t.x-f.x)>25&&self.ranged.charge<32;return input;}
  if(self.side){input.side=self.side.kind==='skull'&&['start','hold'].includes(self.side.phase)&&self.side.charge<45&&Math.abs(t.x-f.x)>24;return input;}
  if(self.downSpecial){
    const s=self.downSpecial;
    input.downSpecial=s.kind==='flood'&&s.phase==='charge'&&s.charge>=45||s.kind==='stone'&&['hold','fall'].includes(s.phase)&&s.elapsed>35;
    return input;
  }
  if(self.heldBomb()&&['idle','walk','run','air'].includes(f.state)){input.axis=Math.sign(t.x-f.x);input.attack=true;input.vertical=t.y-f.y>20?1:0;return input;}
  if(self.inhale){
    if(self.inhale.phase==='hold'&&f.age>=6&&f.age<8&&frame%240>=120&&target.data.id!=='kirby'){input.down=true;input.vertical=-1;return input;}
    input.neutral=['start','loop'].includes(self.inhale.phase)?Math.abs(t.x-f.x)<30:self.inhale.phase==='hold'&&f.age>=6&&f.age<8;
    return input;
  }
  if(f.state==='tilt'||f.state==='dashAttack')return input;
  if(self.smashCharge){
    if(self.smashCharge.phase!=='release')input.smash=(Math.abs(t.x-f.x)>16||t.state==='shield'||t.hitstun>12)&&self.smashCharge.charge<24;
    else if(f.clip==='AttackS4S'&&self.data.moves.AttackS4S2)input.smash=f.age>=12&&f.age<14;
    return input;
  }
  const targetX=Math.max(STAGE.left+12,Math.min(STAGE.right-12,t.x));
  const distance=targetX-f.x,dir=Math.sign(distance),close=Math.abs(t.x-f.x);
  if(!f.grounded) {
    input.axis=Math.abs(f.x)>STAGE.right-8?-Math.sign(f.x):Math.abs(distance)>5?dir:0;
    input.jump=f.y<2&&f.vy<-.2&&f.jumps<self.a.Jumps;
    input.special=!!(self.data.moves.SpecialAirHi||self.data.quickAttack)&&Math.abs(f.x)>STAGE.right&&f.y<-12&&f.vy<0&&f.jumps>=self.a.Jumps;
    if(input.special&&self.data.quickAttack){input.axis=0;input.vertical=1;input.attack=false;input.jump=false;return input;}
    input.attack=close<22&&Math.abs(t.y-f.y)<24;
    if(f.state==='air'&&!input.jump&&!input.special&&input.attack&&target.script?.hitboxes.size&&frame%60===30){input.attack=false;input.shield=true;return input;}
    if(input.attack){
      if(t.y-f.y>10)input.vertical=1;
      else if(t.y-f.y< -7)input.vertical=-1;
      else input.axis=Math.sign(t.x-f.x);
    }
    return input;
  }
  if(t.state==='ko'||t.state==='respawn')return input;
  if(self.data.downSpecial&&['idle','walk','run'].includes(f.state)&&frame%240===120&&frame%180!==0){
    const kind=self.data.downSpecial.kind,close=Math.abs(t.x-f.x);
    if(kind==='bomb'&&self.bombAvailable()||kind==='flood'&&close>25||kind==='stone'&&close<18||kind==='thunder'&&close<20){input.axis=Math.sign(t.x-f.x);input.downSpecial=true;return input;}
  }
  const phase=frame%120;
  if(['idle','walk','run','shield'].includes(f.state)&&close<(self.data.id==='link'?38:14)&&Math.abs(t.y-f.y)<10&&(t.state==='shield'||phase===60)){
    input.axis=dir;input.grab=true;return input;
  }
  if(self.data.inhale&&!self.copied&&close<25&&Math.abs(t.y-f.y)<12&&frame%90===0){input.axis=dir;input.neutral=true;return input;}
  if(self.data.side&&['idle','walk','run'].includes(f.state)&&Math.abs(t.y-f.y)<12){
    const kind=self.data.side.kind;
    if(kind==='cape'&&target.ranged&&close<45||kind==='boomerang'&&self.boomerangAvailable()&&close>30&&frame%150===0||kind==='hammer'&&close<18&&frame%120===48||kind==='skull'&&close>35&&close<70&&Math.abs(f.x)<55&&frame%180===90){input.axis=dir;input.side=true;return input;}
  }
  if(self.rangedData&&close>35&&close<90&&Math.abs(t.y-f.y)<15&&frame%180===0){input.axis=dir;input.neutral=true;return input;}
  if(close<20&&['jab','smash','tilt','dashAttack','aerial','rapid','rapidStart'].includes(t.state)&&phase<28){
    input.shield=true;
    if(phase===12&&Math.abs(f.x)<STAGE.right-38)input.axis=dir||f.facing;
    else if(phase===20){input.down=true;input.vertical=-1;}
    return input;
  }
  if(Math.abs(distance)>12){
    input.axis=dir;input.run=Math.abs(distance)>25;
    const path=self.poses.motion.clips.AttackDash?.rootMotion;
    const end=f.x+dir*(path?path.at(-1)![2]-path[0][2]:0);
    if(f.state==='run'&&close<30&&phase>=28&&phase<80&&path&&end>STAGE.left+3&&end<STAGE.right-3){input.run=true;input.attack=true;}
  }
  else if(f.facing!==Math.sign(t.x-f.x)&&close>1)input.axis=Math.sign(t.x-f.x);
  else {
    input.smash=phase>=55&&phase<57;
    if(input.smash)input.vertical=t.y-f.y>7?1:frame%240<120?-1:0;
    input.attack=phase<45;
    if(input.attack&&self.data.moves.AttackHi3&&t.y-f.y>8)input.vertical=1;
    else if(input.attack&&phase>=12&&phase<25&&self.data.moves.AttackLw3){input.vertical=-1;input.down=true;}
    else if(input.attack&&phase>=25&&self.data.moves.AttackS3S)input.axis=dir||f.facing;
    input.jump=t.y>8&&phase>95;
  }
  return input;
}
