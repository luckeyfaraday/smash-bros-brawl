import './lab.css';
import { ArenaRenderer } from './render';
import { Poses } from './pose';
import { Simulation, onLedge, type GameOptions } from './simulation';
import { isJab, isAttack, isAerial, isNeutralSpecial, aerialAttack, aerialFromLanding, aerialLandingLag, AERIAL_LABELS, isDirectionalAttack, DIRECTIONAL_LABELS, groundAttack, JABS, ATTACKS, attackTimeline, type Attack } from './moves';
import { JAB_FLAGS, LANDING_LAG_FLAG } from './script';
import { neutralInput, SIMULATION_ID, type FighterData, type Input, type FrameInput } from './types';
import {fetchJSON,fetchMotion} from './assets';
import { STAGE } from './stage';
import { ROSTER, fighterIds, type FighterId, type LoadedRoster } from './roster';
import {QUICK_ATTACK_RULES} from './quick-attack';
import {RANGED_RULES} from './ranged';
import {SIDE_LABELS,SIDE_RULES} from './side-special';
import {DOWN_LABELS,DOWN_RULES} from './down-special';
import {SMASH_LABELS,SMASH_RULES,isSmashAttack,smashMultiplier} from './smash';
import {tumblePhase} from './knockdown';

const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const text=(id:string,value:string)=>{el(id).textContent=value;};
const keys=new Set<string>();
let paused=false, ready=false, speed=1, recording=false, replaying=false;
let tape:FrameInput[]=[], expectedHash='', replayIndex=0;
let options:GameOptions={mode:'training',opponent:'cpu',stocks:3,seconds:180,fighters:['mario','mario']};
let roster:LoadedRoster;
let sim:Simulation, renderer:ArenaRenderer;
let resetSimulation:()=>void;
let accumulator=0;
let timelines: Record<Attack, ReturnType<typeof attackTimeline>>;
let shownMove: Attack | null = null;
const tracked=['KeyA','KeyD','KeyW','ArrowUp','ArrowLeft','ArrowRight','KeyS','ArrowDown','Space','KeyJ','KeyK','KeyL','KeyI','KeyU','KeyF','KeyO','KeyG','Backslash','BracketLeft','BracketRight','Quote','ShiftLeft','ShiftRight','Enter','Slash','Period','Comma','Semicolon'];

function clearInput(){keys.clear();}
function readInput(player=0):Input {
  const input=neutralInput();
  const local=options.mode==='battle'&&options.opponent==='local';
  if(player===0) {
    input.axis=Number(keys.has('KeyD')||!local&&keys.has('ArrowRight'))-Number(keys.has('KeyA')||!local&&keys.has('ArrowLeft'));
    input.jump=keys.has('Space');input.attack=keys.has('KeyJ');input.shield=keys.has('KeyK');input.smash=keys.has('KeyL');
    input.special=keys.has('KeyI');input.neutral=keys.has('KeyU');input.grab=keys.has('KeyF');input.side=keys.has('KeyO');
    input.downSpecial=keys.has('KeyG');
    input.run=keys.has('ShiftLeft')||!local&&keys.has('ShiftRight');input.down=keys.has('KeyS')||!local&&keys.has('ArrowDown');
    input.vertical=Number(keys.has('KeyW')||!local&&keys.has('ArrowUp'))-Number(input.down);
  } else {
    input.axis=Number(keys.has('ArrowRight'))-Number(keys.has('ArrowLeft'));
    input.jump=keys.has('Enter');input.attack=keys.has('Slash');input.smash=keys.has('Period');input.shield=keys.has('Comma');
    input.special=keys.has('Semicolon');input.neutral=keys.has('Quote');input.grab=keys.has('BracketRight');input.side=keys.has('BracketLeft');
    input.downSpecial=keys.has('Backslash');
    input.run=keys.has('ShiftRight');input.down=keys.has('ArrowDown');
    input.vertical=Number(keys.has('ArrowUp'))-Number(input.down);
  }
  const pads=[...navigator.getGamepads()].filter(p=>p?.mapping==='standard');
  const pad=local&&pads.length===1?(player===1?pads[0]:undefined):pads[player];
  if(pad){const axis=pad.axes[0]??0;if(Math.abs(axis)>.18)input.axis=axis;
    const vertical=-(pad.axes[1]??0);if(Math.abs(vertical)>.18)input.vertical=vertical;
    input.jump||=pad.buttons[0]?.pressed;input.attack||=pad.buttons[2]?.pressed;
    input.run||=Math.abs(axis)>.8;input.down||=(pad.axes[1]??0)>.65;
    input.shield||=pad.buttons[6]?.pressed||pad.buttons[7]?.pressed;input.smash||=pad.buttons[3]?.pressed;
    input.special||=pad.buttons[1]?.pressed;input.neutral||=pad.buttons[5]?.pressed;input.grab||=!!pad.buttons[4]?.pressed;
    if(pad.buttons[14]?.pressed||pad.buttons[15]?.pressed){input.side=true;input.axis=pad.buttons[14]?.pressed?-1:1;}
    input.downSpecial||=!!pad.buttons[13]?.pressed;
  }
  return input;
}
function syncButtons(){
  text('pause',paused?'▶ Resume':'Ⅱ Pause');
  const finished=ready&&sim.status==='finished';
  text('run-state',finished?'FINISHED':paused?'PAUSED':replaying?'REPLAY':'LIVE');
  el<HTMLButtonElement>('pause').disabled=finished;el<HTMLButtonElement>('step').disabled=finished;
  text('record',recording?'■ Stop recording':'● Record');
  el('record').classList.toggle('recording',recording);
  (el<HTMLButtonElement>('replay')).disabled=recording||tape.length===0||replaying;
  (el<HTMLButtonElement>('export')).disabled=recording||tape.length===0||replaying;
  el<HTMLSelectElement>('mode').disabled=recording||replaying;
  for(const id of ['fighter-one','fighter-two'])el<HTMLSelectElement>(id).disabled=!ready||recording||replaying;
}
function stopRecording(){
  if(recording){recording=false;expectedHash=sim.hash();text('replay-status',`${tape.length} input frames recorded`);}
}
function togglePause(){if(!ready)return;paused=!paused;accumulator=0;syncButtons();}
function reset(){
  if(!ready)return;
  stopRecording();replaying=false;resetSimulation();clearInput();accumulator=0;
  text('status',options.mode==='battle'?'New match · three stocks':'Training reset');syncButtons();
}
function tick(){
  if(!ready)return;
  if(replaying && replayIndex>=tape.length)return;
  const input:FrameInput=replaying?tape[replayIndex++]:{...readInput(),...(options.mode==='battle'&&options.opponent==='local'?{opponent:readInput(1)}:{})};
  if(recording)tape.push(structuredClone(input));
  sim.step(input,input.opponent);
  if(sim.error){paused=true;text('status',sim.error);syncButtons();}
  if(sim.status==='finished'&&!replaying){stopRecording();paused=true;syncButtons();}
  if(replaying && replayIndex===tape.length){
    replaying=false;paused=true;
    const match=sim.hash()===expectedHash;
    text('replay-status',match?`Replay verified · ${tape.length} frames · ${expectedHash}`:'Replay mismatch — inspect the state');
    text('status',match?'Input replay matches the recorded state':'Replay verification failed');syncButtons();
  }
}
function updateUI(){
  text('frame',String(sim.frame).padStart(6,'0'));text('fighter-state',sim.player.state);
  text('position',`${sim.player.x.toFixed(2)} / ${sim.player.y.toFixed(2)}`);
  text('velocity',`${sim.player.vx.toFixed(2)} / ${sim.player.vy.toFixed(2)}`);
  text('hits',String(sim.hits));
  text('air-jumps',String(Math.max(0,sim.a.Jumps-Math.max(1,sim.player.jumps))));
  for(const [i,id] of ['player-jumps','dummy-jumps'].entries()){
    const c=sim.actors[i],node=el(id),remaining=Math.max(0,c.a.Jumps-Math.max(1,c.f.jumps));
    node.hidden=!c.data.airJumps;node.setAttribute('aria-label',`${remaining} air jumps remaining`);
    node.innerHTML=Array.from({length:c.a.Jumps-1},(_,n)=>`<i class="${n<remaining?'available':''}"></i>`).join('');
  }text('state-hash',sim.hash());
  el('dummy-damage').innerHTML=`${sim.dummy.damage.toFixed(0)}<span>%</span>`;
  el('player-damage').innerHTML=`${sim.player.damage.toFixed(0)}<span>%</span>`;
  text('last-hit',sim.lastHit?`${sim.lastHit.move==='HylianShield'?'Hylian Shield':sim.lastHit.blocked?'Blocked':sim.lastHit.move} · ${Number(sim.lastHit.damage.toFixed(2))}% · frame ${sim.lastHit.frame}`:'Land your first jab.');
  const battle=options.mode==='battle';
  el('match-hud').hidden=!battle;
  text('player-stocks',battle?'●'.repeat(Math.max(0,sim.stocks[0])):'');text('dummy-stocks',battle?'●'.repeat(Math.max(0,sim.stocks[1])):'');
  const seconds=Math.ceil(sim.remaining/60);text('match-timer',`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`);
  el('match-overlay').hidden=!battle||sim.status==='playing';
  el('result-actions').hidden=sim.status!=='finished';
  text('match-title',sim.status==='countdown'?String(Math.ceil(sim.countdown/60)):sim.winner===-1?'DRAW':sim.winner===0?'PLAYER 1 WINS':options.opponent==='cpu'?'CPU WINS':'PLAYER 2 WINS');
  text('match-subtitle',sim.status==='countdown'?'Three stocks · Final Destination':'Play again or return to training');
  if(battle&&sim.status==='finished')text('run-state','FINISHED');
  const recovering=sim.actors.find(c=>c.knockdown);
  el('knockdown-panel').hidden=!recovering;
  if(recovering){
    const k=recovering.knockdown!,slot=sim.actors.indexOf(recovering),p2=slot===1;
    const shield=p2?'comma':'K',attack=p2?'slash':'J',direction=p2?'Left / Right':'A / D',stand=p2?'Up / Enter':'W / Space';
    const titles:Record<string,string>={fly:'Launched',fall:'Tumbling',bound:'Missed the tech',wait:'Choose your get-up',damage:'Hit on the ground',stand:'Getting up',attack:'Get-up attack',roll:'Get-up roll',tech:recovering.f.clip==='Passive'?'Floor tech':'Rolling tech'};
    text('knockdown-player',`${p2&&options.mode==='training'?'DUMMY':p2&&options.opponent==='cpu'?'CPU':`P${slot+1}`} · ${ROSTER[recovering.data.id!].name}`);
    text('knockdown-title',titles[k.phase]);
    text('knockdown-phase',recovering.script?.hurtState?'PROTECTED':k.phase==='wait'?'READY TO GET UP':tumblePhase(k.phase)?recovering.tech.window?'TECH BUFFERED':'APPROACHING THE FLOOR':'VULNERABLE');
    const instructions=tumblePhase(k.phase)?`Tap ${shield} just before touching the floor to tech. Hold ${direction} as you land to roll. Holding shield does not repeat the attempt.`:k.phase==='wait'?`${attack} attacks · ${direction} rolls · ${stand} or ${shield} stands up.`:k.phase==='bound'||k.phase==='damage'?'Wait for the impact to settle, then choose a get-up action.':`Let the recovery finish before your next action. ${recovering.script?.hurtState?'Protected during this part of the move.':'The protection window has ended.'}`;
    text('knockdown-instruction',options.mode==='training'&&p2?'The training dummy takes the hit and gets up automatically. Choose Two players to practise its tech and get-up controls.':instructions);
    el('knockdown-panel').classList.toggle('protected',!!recovering.script?.hurtState);
  }
  for(const [id,f] of [['player-shield',sim.player],['dummy-shield',sim.dummy]] as const) {
    el(id).style.width=`${Math.max(0,f.shield/60*100)}%`;
    el(id).parentElement!.setAttribute('aria-valuenow',String(Math.round(f.shield)));
  }
  const ledge=onLedge(sim.player),quick=sim.actors[0].quickAttack,cutter=sim.actors[0].cutter,smash=sim.actors[0].smashCharge,ranged=sim.actors[0].ranged,inhale=sim.actors[0].inhale,capture=sim.capture,caught=capture?.victim===0;
  el('defense-panel').hidden=!sim.actors[0].evade;
  const link=sim.actors[0],thrust=sim.player.clip==='AttackAirLw'&&sim.player.state==='aerial',hylian=link.passiveShield();
  el('link-panel').hidden=sim.data.id!=='link'||!(hylian||thrust||sim.player.state.startsWith('crouch')&&!link.heldBomb()||link.hylianFlash);
  if(!el('link-panel').hidden){
    text('link-title',thrust?'Downward thrust':'Hylian Shield');
    const recovering=thrust&&sim.player.age>=64;
    text('link-phase',thrust?(recovering?'RECOVERY':link.linkBounce?`REBOUND · ${link.linkBounce.count}`:'SWORD DOWN'):link.hylianFlash?'PROJECTILE BLOCKED':hylian?'SHIELD READY':sim.player.state==='crouchEnd'?'STANDING UP':'LOWERING INTO CROUCH');
    text('link-instruction',thrust?(recovering?'The sword hit has ended. Finish recovering before another action.':link.linkBounce?'The hit lifts Link. Further contact during this move deals 8%. Steer with A / D.':'A downward sword hit rebounds off an opponent or their shield. Watch your landing.'):hylian?'Face an incoming shot and stand still. Hold S to cover lower shots. Melee attacks and shots from behind can still hit.':'The physical shield becomes ready once Link settles into his stance.');
  }
  if(sim.actors[0].evade){
    const e=sim.actors[0].evade!,protectedNow=sim.script?.hurtState===2;
    text('defense-title',e.kind==='air'?'Air dodge':e.kind==='spot'?'Spot dodge':sim.player.clip==='EscapeF'?'Forward roll':'Backward roll');
    text('defense-phase',protectedNow?'DODGING':sim.player.age<3?'STARTUP':'RECOVERY · VULNERABLE');
    el('defense-panel').classList.toggle('protected',protectedNow);
    text('defense-instruction',e.kind==='air'?'Keep drifting with A / D. Landing ends the dodge with a brief recovery.':e.kind==='spot'?'Stay in place and let the attack pass. Release and press again for another dodge.':'Roll through an opponent to change sides. The end of the roll can be punished.');
  }
  el('ledge-panel').hidden=!ledge;el('timeline').hidden=ledge||!!sim.actors[0].evade||!!quick||!!cutter||!!ranged||!!inhale||caught||smash?.phase==='hold';el('quick-panel').hidden=!quick;el('cutter-panel').hidden=!cutter;
  el('smash-panel').hidden=!smash;
  el('ranged-panel').hidden=!ranged;
  const side=sim.actors[0].side;
  const actor=sim.actors[0],down=actor.downSpecial,bomb=sim.bombs.find(b=>b.heldBy===0),tank=actor.floodCharge;
  el('down-panel').hidden=!down&&!bomb&&!tank&&!actor.itemThrow&&!actor.itemPickup;
  text('down-preview',sim.data.downSpecial?DOWN_LABELS[sim.data.downSpecial.kind]:'Down special');
  if(!el('down-panel').hidden){
    el('timeline').hidden=true;
    text('down-title',bomb||actor.itemThrow||actor.itemPickup?'HELD ITEMS':down?DOWN_LABELS[down.kind]:'F.L.U.D.D.');
    text('down-phase',bomb?`BOMB · ${(Math.max(0,DOWN_RULES.bombFuse-bomb.age)/60).toFixed(1)}s`:down?down.phase.toUpperCase():actor.itemThrow?'THROW':actor.itemPickup?'PICK UP':'CHARGE STORED');
    const fill=bomb?100*(1-bomb.age/DOWN_RULES.bombFuse):100*(down?.charge??tank)/DOWN_RULES.floodCharge;
    el('down-meter').hidden=!bomb&&down?.kind!=='flood'&&!tank;el('down-meter-fill').style.width=`${fill}%`;
    text('down-instruction',bomb||actor.itemThrow||actor.itemPickup?'Direction + J throws. L throws harder; F drops. J picks up a nearby fallen bomb. Its fuse keeps burning while held.':down?.kind==='stone'?'Stone drops straight down and resists attacks. After settling, tap G to change back. Grabs can still catch you.':down?.kind==='thunder'?'Thunder falls from above. Let it strike Pikachu to unleash the electric burst.':down?.kind==='bomb'?'Pull a bomb, then choose when and where to throw it.':down?.phase==='fire'?'The water pushes opponents without damage. W / S aims the stream when you fire.':'Tap G to start charging, then G again to spray. K stores your charge. A full tank stores automatically.');
  }
  el('side-panel').hidden=!side;
  text('side-preview',sim.data.side?SIDE_LABELS[sim.data.side.kind]:'Side special');
  if(side){
    el('timeline').hidden=true;text('side-title',SIDE_LABELS[side.kind]);
    const charge=Math.round(side.charge/SIDE_RULES.charge*100);
    text('side-phase',side.kind==='skull'&&side.phase==='hold'?`CHARGING · ${charge}%`:side.phase.toUpperCase());
    text('side-instruction',side.kind==='cape'?'Turn opponents around and reflect incoming projectiles. Time the sweep as a shot approaches.':side.kind==='boomerang'?'The outgoing blade hits; the returning wind pulls. W / S angles your next throw. One boomerang at a time.':side.kind==='hammer'?'A powerful ground swing, or two swings in the air. Let the animation finish before acting again.':side.phase==='hold'?'Keep holding O to charge. Release to launch sideways, or wait for full charge.':'Aim left or right before starting. Skull Bash travels farther with more charge.');
    el('side-meter').hidden=side.kind!=='skull';el('side-meter-fill').style.width=`${charge}%`;
  }
  const grab=sim.actors[0].grab,held=sim.hold,grabbed=held?.victim===0;
  el('grab-panel').hidden=!grab&&!grabbed;
  if(grab||grabbed){
    el('timeline').hidden=true;
    const titles:Record<string,string>={ThrowF:'FORWARD THROW',ThrowB:'BACK THROW',ThrowHi:'UP THROW',ThrowLw:'DOWN THROW'};
    text('grab-title',grabbed?'GRABBED':grab?.phase==='hold'?'CHOOSE YOUR THROW':grab?.phase==='pummel'?'PUMMEL':grab?.phase==='throw'?titles[sim.player.clip]:grab?.phase==='release'?'GRIP RELEASED':sim.data.id==='link'?'CLAWSHOT':'GRAB');
    text('grab-instruction',grabbed?'Tap buttons or change directions to struggle free. Holding one button does not keep adding escape progress.':grab?.phase==='hold'?'Tap J to pummel, or tap W / A / S / D to throw. Forward and back follow your facing.':grab?.phase==='pummel'?'Wait for the hit, then choose another pummel or a direction.':grab?.phase==='throw'?'The throw is committed. Follow up after the animation finishes.':grab?.phase==='release'?'Your opponent escaped. Finish releasing before acting again.':'F grabs through a shield. Run + F for a dash grab; reverse direction + F while running for a pivot grab.');
    const escape=held?Math.max(0,Math.min(100,(1-held.remaining/held.maximum)*100)):0;
    el('grab-meter').hidden=!held;el('grab-meter-fill').style.width=`${escape}%`;el('grab-meter').setAttribute('aria-valuenow',String(Math.round(escape)));
  }
  const copied=sim.actors[0].copied,neutral=sim.actors[0].rangedData;
  const abilityName=neutral?.kind==='fireball'?'Fireball':neutral?.kind==='arrow'?'Bow':neutral?.kind==='jolt'?'Thunder Jolt':'';
  text('neutral-preview',copied?`Kirby’s copied ${abilityName}`:neutral?.kind==='fireball'?'Mario’s fireball':neutral?.kind==='arrow'?'Link’s bow · hold to draw':neutral?.kind==='jolt'?'Pikachu’s Thunder Jolt':sim.data.inhale?'Kirby’s inhale · hold U':'Neutral special coming next');
  el('copy-panel').hidden=!copied;
  if(copied){text('copy-title',`${abilityName.toUpperCase()} COPIED`);text('copy-instruction',`${copied==='link'?'Hold U to draw, release to fire.':'Press U to use the copied move.'} K + U discards the ability and restores inhale. I still uses Final Cutter.`);}
  for(const [id,actor] of [['player-copy',sim.actors[0]],['dummy-copy',sim.actors[1]]] as const){el(id).hidden=!actor.copied;text(id,actor.copied?`${ROSTER[actor.copied].name} copy`:'');}
  el('inhale-panel').hidden=!inhale&&!caught;
  if(inhale||caught){
    const phase=inhale?.phase;
    text('inhale-title',caught?(capture?.phase==='star'?'SPAT OUT':'KIRBY HAS YOU'):phase==='hold'?'OPPONENT IN MOUTH':phase==='swallow'?'CAUGHT THEM':phase==='spit'?'SPIT THEM OUT':phase==='drink'?'SWALLOW AND COPY':phase==='end'?'FINISHING INHALE':'INHALING');
    text('inhale-instruction',caught?(capture?.phase==='star'?'You will regain control when the star ends. Use Space and I to recover.':'Tap J, Space or change directions to struggle free. Holding a button does not keep adding escape progress.'):phase==='hold'?'Tap S / Down to swallow and copy, or U / J to spit. You can still walk, turn or hop.':phase==='swallow'?'Pulling your opponent into Kirby’s mouth. Choose Down to copy or U / J to spit once they are held.':phase==='spit'?'The spit deals 10% and sends the captured fighter forward as a star.':phase==='drink'?'Swallowing deals 6% and copies Mario, Link or Pikachu. Wait for the animation to finish, then use U.':phase==='end'?'Finish closing Kirby’s mouth before the next action.':'Hold U to inhale a nearby opponent. Release U to stop. Inhale also works in the air.');
    const escape=capture&&capture.phase!=='star'?Math.max(0,Math.min(100,(1-capture.remaining/capture.maximum)*100)):0;
    el('inhale-meter').hidden=!capture||capture.phase==='star';el('inhale-meter-fill').style.width=`${escape}%`;el('inhale-meter').setAttribute('aria-valuenow',String(Math.round(escape)));
    text('inhale-detail',capture&&capture.phase!=='star'?'Escape progress · captured fighters can struggle free':'U to inhale · U / J to spit · I still uses Final Cutter');
  }
  if(ranged){
    const bow=ranged.kind==='arrow',jolt=ranged.kind==='jolt';
    text('ranged-title',bow?(ranged.phase==='release'?'ARROW RELEASED':ranged.charge===RANGED_RULES.bowCharge?'BOW FULLY DRAWN':'DRAW THE BOW'):jolt?'THUNDER JOLT':'FIREBALL');
    text('ranged-instruction',bow?(ranged.phase==='release'?'The arrow travels on its own. Finish the release before your next action.':'Hold U for a stronger, faster arrow. Release U to fire; a full draw stays held.'):jolt?'Send a bolt downward. When it reaches the stage, it hops along the floor and around its edges.':'The fireball bounces along the stage and disappears on contact. Jump first to throw from the air.');
    el('ranged-meter').hidden=!bow;el('ranged-meter-fill').style.width=`${ranged.charge/RANGED_RULES.bowCharge*100}%`;
    el('ranged-meter').setAttribute('aria-valuenow',String(ranged.charge));
    text('ranged-power',bow?`${(5+7*ranged.charge/RANGED_RULES.bowCharge).toFixed(1)}%`:jolt?'ϟ':'5%');
    text('ranged-detail',copied?'Copied neutral special · I still uses Final Cutter':bow?'More draw → more damage and range':jolt?'U to fire · jump first to send it from above · I for Quick Attack':'U to throw · I still recovers');
  }
  if(smash){
    text('smash-title',`${SMASH_LABELS[smash.move]} · ${smash.phase==='start'?'WIND-UP':smash.phase==='hold'?'CHARGING':'RELEASED'}`);
    text('smash-instruction',smash.phase==='start'?'Keep holding L to charge after the wind-up.':smash.phase==='hold'?'Release L to attack. Direction stays locked while charging.':smash.move==='AttackS4S'&&sim.data.moves.AttackS4S2?'Tap L again during the first slash to queue the second.':'Finish the swing before your next action.');
    text('smash-power',`${smashMultiplier(smash.charge).toFixed(2)}×`);
    text('smash-charge-frames',`${smash.charge} / ${SMASH_RULES.maximum} charge frames · damage multiplier`);
    el('smash-meter-fill').style.width=`${smash.charge/SMASH_RULES.maximum*100}%`;
    el('smash-meter').setAttribute('aria-valuenow',String(smash.charge));
  }
  if(cutter){
    const phase=cutter.phase,rising=phase==='arc'&&sim.player.vy>0;
    text('cutter-title',phase==='start'?'Draw the blade':phase==='land'?'Send the wave':rising?'Rising slash':'Downward strike');
    text('cutter-instruction',phase==='start'?'The slash lifts Kirby upward. Aim toward the stage with A / D as he rises.':phase==='land'?'The wave travels forward and can be shielded. Let the landing animation finish before your next move.':rising?'Steer with A / D. Get above the stage or catch its edge before the downward strike.':'Steer toward the platform. Landing sends a wave; a ledge catch restores your ledge options.');
    text('cutter-direction',phase==='start'?'✦':phase==='land'?(sim.player.facing>0?'→':'←'):rising?'↑':'↓');
    const length=sim.actors[0].poses.motion.clips[sim.player.clip].count;
    text('cutter-frame',phase==='fall'?'DESCENDING · LAND OR CATCH A LEDGE':`${sim.player.age} / ${length}${sim.player.hitlag?' · HITLAG':''}`);
    el('cutter-meter').style.width=`${phase==='fall'?100:Math.min(100,(sim.player.age+1)/length*100)}%`;
  }
  if(quick){
    text('quick-title',quick.phase==='start'?'Aim your first burst':quick.phase==='burst'?`Burst ${quick.burst} / 2`:quick.phase==='turn'?'Change direction for burst two':'Catch a ledge or prepare to land');
    text('quick-instruction',quick.phase==='turn'?'Choose a different direction with W / A / S / D or the stick. Keeping the same direction ends the move.':quick.phase==='start'?'Hold a direction as startup ends. Neutral input goes up. You can turn once after the first burst.':quick.phase==='burst'?(quick.burst===1?'The burst direction is locked. Aim your next direction now.':'Second burst. Catch a ledge or land before using another move.'):'Recovery is spent. Steering is available as Pikachu falls.');
    const dir=quick.direction;
    text('quick-direction',Math.abs(dir.x)<.3?(dir.y>0?'↑':'↓'):Math.abs(dir.y)<.3?(dir.x>0?'→':'←'):dir.x>0?(dir.y>0?'↗':'↘'):(dir.y>0?'↖':'↙'));
    const length=quick.phase==='burst'?QUICK_ATTACK_RULES.burstFrames:quick.phase==='turn'?9:sim.actors[0].poses.motion.clips[sim.player.clip].count;
    text('quick-frame',`${sim.player.age} / ${length}${sim.player.hitlag?' · HITLAG':''}`);
    el('quick-meter').style.width=`${Math.min(100,(sim.player.age+1)/length*100)}%`;
  }
  if(ledge) {
    const titles:Record<string,string>={ledgeCatch:'Caught the edge',ledgeHang:'Ready to return',ledgeClimb:'Climbing onto the stage',ledgeJump:'Jumping from the ledge',ledgeAttack:'Attacking from the ledge',ledgeRoll:'Rolling onto the stage'};
    text('ledge-title',titles[sim.player.state]);
    text('ledge-instruction',sim.player.state==='ledgeHang'?'J to attack · K to roll · toward stage to climb · Space to jump · S or away to drop':['ledgeAttack','ledgeRoll'].includes(sim.player.state)?`${sim.player.clip.includes('Slow')?'Slow return at 100%+':'Quick return'} · ${sim.script?.hurtState===2?'protected':'vulnerable'} · finish the move before your next action.`:'Let the animation finish, then choose your next action.');
  }
  const attacking=['jab','aerial','smash','tilt','dashAttack','rapid','rapidStart','special','ranged','side','downSpecial','itemThrow','itemPickup'].includes(sim.player.state);
  const move=isAttack(sim.player.clip)?sim.player.clip:sim.player.state==='fallSpecial'||sim.player.clip==='LandingFallSpecial'?(sim.data.quickAttack?'SpecialAirHiEnd':'SpecialAirHi'):aerialFromLanding(sim.player.clip)??(!sim.player.grounded?'AttackAirN':'Attack11');
  if(shownMove!==move){
    shownMove=move;
    const timeline=timelines[move], active=timeline.filter(f=>f.active);
    const interrupt=timeline.find(f=>f.interruptible)?.frame;
    text('move-label',isNeutralSpecial(move)?(sim.data.ranged?.kind==='fireball'?'FIREBALL':sim.data.ranged?.kind==='jolt'?'THUNDER JOLT':'HERO’S BOW'):isSmashAttack(move)?SMASH_LABELS[move]:move.startsWith('Attack')&&move.endsWith('Hold')?'SMASH CHARGE':move.startsWith('Attack')&&move.endsWith('Start')&&move.includes('4')?'SMASH WIND-UP':isAerial(move)?AERIAL_LABELS[move]:isDirectionalAttack(move)?DIRECTIONAL_LABELS[move]:sim.data.quickAttack&&move.startsWith('Special')?'QUICK ATTACK':move==='SpecialHiStart'?'SPIN WIND-UP':move.startsWith('Special')?(sim.data.id==='mario'?'SUPER JUMP PUNCH':sim.data.finalCutter?'FINAL CUTTER':'SPIN ATTACK'):isJab(move)&&sim.data.jabRepeat?'REPEATING HEADBUTT':isJab(move)?`JAB ${JABS.indexOf(move)+1} / ${JABS.filter(name=>sim.data.moves[name]).length}`:move==='Attack100Start'?'RAPID JAB START':move==='Attack100'?'RAPID JAB':'NEUTRAL AERIAL');text('move-name',move);
    const damages=[...new Set(active.map(f=>f.damage))].map(damage=>`${Number((damage*sim.actors[0].damageMultiplier()).toFixed(2))}%`).join(' → ');
    text('move-summary',active.length?`${damages} damage · active ${active[0].frame}–${active.at(-1)!.frame} · ${move==='Attack100'?'cycle length':interrupt===undefined?'ends at':'interrupt at'} ${interrupt??timeline.length}`:`${move.endsWith('End')?'Recovery animation':'Startup'} · ${timeline.length} frames`);
    const track=el('frame-track');
    track.style.gridTemplateColumns=`repeat(${Math.min(16,timeline.length)},minmax(0,1fr))`;
    track.innerHTML=timeline.map(f=>`<span class="frame-cell ${f.active?'active':f.frame>(active[0]?.frame??Infinity)?'recovery':''} ${f.combo?'combo-open':''} ${isAerial(move)&&!f.landingLag?'autocancel':''}" title="Animation frame ${f.frame}${f.active?` · ${Number((f.damage*sim.actors[0].damageMultiplier()).toFixed(2))}%`:''}${f.combo?' · follow-up enabled':''}${isAerial(move)?f.landingLag?' · aerial landing recovery':' · auto-cancel':''}">${String(f.frame).padStart(2,'0')}</span>`).join('');
  }
  text('move-frame',attacking?`FRAME ${sim.player.age}${sim.player.hitlag?' · HITLAG':''}`:sim.player.state==='landing'?`LANDING ${sim.player.age} / ${sim.landingDuration(sim.player)}`:sim.player.state==='fallSpecial'?'RECOVERY SPENT':'READY');
  text('combo-status',bomb||actor.itemThrow?'Direction + J throws · F drops':down?'G for down special · I for recovery':side?'O for side special · I for recovery':ranged?'U for the neutral special · I for recovery':sim.player.state==='special'?(sim.player.grounded?(sim.data.id==='mario'?'Super Jump Punch · preparing to rise':'Spin attack · wait for the move to finish'):'Recovery special · A / D to steer toward the ledge'):
    (sim.player.state==='tilt'||sim.player.state==='dashAttack')?`${DIRECTIONAL_LABELS[sim.player.clip as keyof typeof DIRECTIONAL_LABELS]} · finish the move before another action`:
    sim.player.state==='fallSpecial'?'Recovery spent · steer to a ledge or land before attacking again':
    sim.player.state==='aerial'?(sim.script?.variables.has(LANDING_LAG_FLAG)?`Landing now: ${aerialLandingLag(sim.data,sim.player.clip)} frames recovery · S / ↓ to fast fall`:'Auto-cancel window · normal landing recovery'):
    sim.player.state==='landing'?`Landing recovery · ${Math.max(0,sim.landingDuration(sim.player)-sim.player.age)} frames left`:
    !sim.player.grounded?((sim.data.moves.SpecialAirHi||sim.data.quickAttack)?'Direction + J for an aerial · I to recover · A / D to steer':'Direction + J for an aerial · steer with A / D'):
    sim.player.state==='rapid'||sim.player.state==='rapidStart'?'Hold J for rapid punches · release to finish this cycle':
    sim.player.state==='smash'?(sim.data.moves.AttackS4S2&&sim.player.clip==='AttackS4S'?(sim.comboQueued?'Second slash queued':'Tap L again for the second slash'):'Smash attack · recovery before the next action'):sim.player.state==='shield'?'Shield up · A / D to roll · S to spot dodge · Space to jump':
    sim.player.state==='shieldBreak'?'Shield broken · vulnerable until recovery':
    sim.player.state.startsWith('crouch')?'Crouching · S + J to down tilt · Space to jump · release S to stand':
    sim.player.state!=='jab'?'J to jab · direction + J to tilt · run, then J to dash attack':sim.player.clip==='Attack13'?'Finisher · release J before starting again':
    sim.data.jabRepeat?'Hold J to repeat the headbutt · release to recover':sim.data.moves.Attack100&&sim.player.clip==='Attack12'?(sim.comboQueued?'Rapid punches queued':'Tap J again or hold on contact for rapid punches'):sim.comboQueued?'Next jab queued':sim.script?.variables.has(JAB_FLAGS.combo)?'Follow-up open · tap J':'Tap J to queue the next jab');
  document.querySelectorAll('.frame-cell').forEach((node,index)=>node.classList.toggle('current',attacking && sim.player.age===index));
  const preview=groundAttack(readInput(),sim.player.state==='run',sim.data.moves);
  text('attack-preview',attacking?'ATTACK IN PROGRESS':sim.player.state==='landing'?'LANDING RECOVERY':!sim.player.grounded?`J → ${AERIAL_LABELS[aerialAttack(readInput(),sim.player.facing)]}`:isDirectionalAttack(preview)?`J → ${DIRECTIONAL_LABELS[preview]}`:'J → JAB');
  const knocked=sim.actors[0].knockdown;
  if(knocked){
    const tumbling=tumblePhase(knocked.phase);
    text('attack-preview',tumbling?'TUMBLING':knocked.phase==='wait'?'J → GET-UP ATTACK':'FLOOR RECOVERY');
    text('move-frame',`${sim.player.state.toUpperCase()} · ${sim.player.age}${sim.player.hitlag?' · HITLAG':''}`);
    text('combo-status',tumbling?'Tap K just before floor impact · hold A / D to tech roll':knocked.phase==='wait'?'J attacks · A / D rolls · W, Space or K stands up':'Finish the floor recovery before choosing your next action');
  }
  text('air-facing',sim.player.facing>0?'FACING RIGHT →':'← FACING LEFT');
  text('air-forward-key',sim.player.facing>0?'D + J':'A + J');
  text('air-back-key',sim.player.facing>0?'A + J':'D + J');
  if(recording)text('replay-status',`Recording · ${tape.length} input frames`);
  else if(replaying)text('replay-status',`Replaying · ${replayIndex} / ${tape.length}`);
}
document.addEventListener('keydown',event=>{
  if(event.target instanceof HTMLInputElement && event.target.type!=='checkbox'||event.target instanceof HTMLSelectElement||event.metaKey||event.ctrlKey||event.altKey)return;
  if(event.code==='Space' && event.target instanceof HTMLInputElement)return;
  if(tracked.includes(event.code)){event.preventDefault();keys.add(event.code);}
  if(event.repeat)return;
  if(event.code==='KeyP'){event.preventDefault();togglePause();}
  if(event.code==='KeyN'){event.preventDefault();if(ready){paused=true;accumulator=0;tick();syncButtons();}}
  if(event.code==='KeyR'){event.preventDefault();reset();}
  if(event.code==='KeyH'){event.preventDefault();el<HTMLInputElement>('hitboxes').checked=!el<HTMLInputElement>('hitboxes').checked;}
});
document.addEventListener('keyup',event=>keys.delete(event.code));
window.addEventListener('blur',()=>{clearInput();if(ready){paused=true;accumulator=0;syncButtons();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();paused=true;accumulator=0;syncButtons();}});
el('pause').onclick=togglePause;
el('step').onclick=()=>{if(!ready)return;paused=true;accumulator=0;tick();syncButtons();};
el('reset').onclick=reset;
function changeMode(){
  const mode=el<HTMLSelectElement>('mode').value;
  options={...options,mode:mode==='training'?'training':'battle',opponent:mode==='local'?'local':'cpu'};
  tape=[];expectedHash='';reset();paused=false;
  text('opponent-label',mode==='training'?'TRAINING DUMMY':mode==='local'?'PLAYER 2':'CPU OPPONENT');
  text('opponent-badge',mode==='local'?'P2':'CPU');
  text('arena-mode-label',mode==='training'?'FINAL DESTINATION / TRAINING':'FINAL DESTINATION / STOCK BATTLE');
  el('second-controls').hidden=mode!=='local';syncButtons();
}
el<HTMLSelectElement>('mode').onchange=changeMode;
for(const id of ['fighter-one','fighter-two'])el<HTMLSelectElement>(id).onchange=()=>{
  options={...options,fighters:[el<HTMLSelectElement>('fighter-one').value as FighterId,el<HTMLSelectElement>('fighter-two').value as FighterId]};
  tape=[];expectedHash='';text('replay-status','New matchup · ready to play');reset();paused=false;syncButtons();
};
el('rematch').onclick=()=>{reset();paused=false;syncButtons();};
el('return-training').onclick=()=>{el<HTMLSelectElement>('mode').value='training';changeMode();};
el<HTMLSelectElement>('speed').onchange=event=>{speed=Number((event.target as HTMLSelectElement).value);accumulator=0;};
el('record').onclick=()=>{
  if(!ready)return;
  if(recording)stopRecording();
  else{replaying=false;resetSimulation();clearInput();tape=[];expectedHash='';recording=true;paused=false;accumulator=0;text('status','Recording from the initial training state');}
  syncButtons();
};
el('replay').onclick=()=>{
  if(!ready||!tape.length)return;
  stopRecording();resetSimulation();clearInput();replayIndex=0;replaying=true;paused=false;accumulator=0;syncButtons();
};
el('export').onclick=()=>{
  const payload={version:1,simulation:SIMULATION_ID,source:sim.data.source,sources:sim.actors.map(c=>c.data.source),initialState:'default',options,frames:tape,expectedHash};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='brawl-training-replay.json';link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};
async function start(){
  roster=Object.fromEntries(await Promise.all(fighterIds.map(async id=>{
    const [data,motion]=await Promise.all([fetchJSON<FighterData>(`/assets/${id}/data.json`),fetchMotion(`/assets/${id}/motion.json`)]);
    return [id,{data,poses:new Poses(motion)}];
  }))) as LoadedRoster;
  resetSimulation=()=>{
    const [first,second]=options.fighters!,{data,poses}=roster[first];
    sim=new Simulation(data,poses,options,roster[second]);shownMove=null;
    timelines=Object.fromEntries(ATTACKS.filter(name=>data.moves[name]).map(name=>[name,attackTimeline(data,poses.motion,name)])) as typeof timelines;
    text('player-name',ROSTER[first].name.toUpperCase());text('dummy-name',ROSTER[second].name.toUpperCase());
    text('matchup-label',`/ ${ROSTER[first].name} vs ${ROSTER[second].name}`);
    text('fighter-description',`${ROSTER[first].name}: ${ROSTER[first].description}`);
    if(renderer)renderer.revision++;
  };resetSimulation();
  renderer=new ArenaRenderer(el('viewport'));await renderer.load();
  // Apply the latest mode if it changed while model textures were loading.
  resetSimulation();
  el('loading').remove();ready=true;paused=false;
  text('status','Local assets loaded · Mario, Link, Kirby and Pikachu ready');syncButtons();
  // Read-only inspection hooks for reproducible browser verification.
  Object.defineProperty(window,'brawlLab',{value:{get ready(){return ready;},get paused(){return paused;},
    get stage(){return {...STAGE,modelLoaded:!!renderer.scene.getObjectByName('final-destination')};},
    get stageContacts(){return sim.actors.map(c=>c.stageContacts.map(hit=>({index:hit.plane.index,type:hit.plane.type})));},
    snapshot:()=>sim.snapshot(),cpuTrace:()=>sim.cpu?.trace()??[],hash:()=>sim.hash(),get tapeLength(){return tape.length;},get replaying(){return replaying;}}});
  let last=performance.now();
  let lastVisualKey='';
  function animate(now:number){
    const delta=Math.min((now-last)/1000,.1);last=now;
    if(!paused){accumulator+=delta*speed;while(accumulator>=1/60&&!paused){tick();accumulator-=1/60;}}
    else accumulator=0;
    const collision=el<HTMLInputElement>('hitboxes').checked;
    const skeleton=el<HTMLInputElement>('skeleton').checked;
    const stageGeometry=el<HTMLInputElement>('stage-outline').checked;
    const viewport=el('viewport');
    const visualKey=`${sim.frame}:${collision}:${skeleton}:${stageGeometry}:${viewport.clientWidth}:${viewport.clientHeight}:${renderer.revision}`;
    // A paused training room has no animation changes. Avoid submitting the same
    // skeleton and dozens of collision meshes to the GPU on every display refresh.
    if(visualKey!==lastVisualKey){
      renderer.draw(sim,collision,skeleton,stageGeometry);updateUI();lastVisualKey=visualKey;
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}
start().catch(error=>{
  text('status','Training room could not start');
  const loading=el('loading');loading.replaceChildren();
  const title=document.createElement('strong');title.textContent='Unable to load the training room';
  const message=document.createElement('span');message.textContent=String(error);loading.append(title,message);
  console.error(error);
});
