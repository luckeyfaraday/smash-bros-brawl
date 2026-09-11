import './style.css';
import {ArenaRenderer} from './render';
import {Simulation,type GameOptions} from './simulation';
import {Poses} from './pose';
import {type FighterData} from './types';
import {fetchJSON,fetchMotion} from './assets';
import {ROSTER,fighterIds,validFighter,type FighterId,type LoadedRoster} from './roster';
import {GameInput,GAME_KEYS} from './game-input';
import {GameAudio} from './game-audio';

type Screen='home'|'setup'|'match'|'paused'|'results';
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T;
const text=(id:string,value:string)=>{const node=el(id);if(node.textContent!==value)node.textContent=value;};
const all=<T extends HTMLElement=HTMLElement>(selector:string)=>[...document.querySelectorAll<T>(selector)];
const input=new GameInput(),audio=new GameAudio();
let screen:Screen='home',ready=false,activePlayer=0,roster:LoadedRoster,sim:Simulation|null=null,renderer:ArenaRenderer;
let fighters:[FighterId,FighterId]=['mario','mario'],opponent:'cpu'|'local'='cpu',stocks=3,seconds=180;
let accumulator=0,lastTime=performance.now(),lastRender='',lastCountdown='',previousHits=0,previousKO=-1,previousPads=0;
let padButtons=new Set<number>(),lastNavigation=0,lastPadConnected=-1,menuNeedsNeutral=true;
const help=el<HTMLDialogElement>('help-dialog');

try{
  const saved=JSON.parse(localStorage.getItem('brawl-game-settings')??'null');
  if(saved){
    if(Array.isArray(saved.fighters)&&saved.fighters.length===2&&saved.fighters.every(validFighter))fighters=[...saved.fighters] as typeof fighters;
    if(saved.opponent==='cpu'||saved.opponent==='local')opponent=saved.opponent;
    if([1,3,5].includes(saved.stocks))stocks=saved.stocks;
    if([60,180,300].includes(saved.seconds))seconds=saved.seconds;
    if(typeof saved.sound==='boolean')audio.enabled=saved.sound;
  }
}catch{/* Storage may be unavailable or belong to an older build. */}
function save(){try{localStorage.setItem('brawl-game-settings',JSON.stringify({fighters,opponent,stocks,seconds,sound:audio.enabled}));}catch{/* The match works without storage. */}}
function sound(){el('sound-toggle').setAttribute('aria-pressed',String(audio.enabled));text('sound-value',audio.enabled?'ON':'OFF');}
function clearInput(){input.clear();all('.touch-controls .held').forEach(n=>n.classList.remove('held'));accumulator=0;}
function show(next:Screen,focus=true){
  screen=next;document.body.dataset.screen=next;clearInput();lastRender='';menuNeedsNeutral=true;
  const battle=['match','paused','results'].includes(next);
  el('home-screen').hidden=next!=='home';el('setup-screen').hidden=next!=='setup';el('match-screen').hidden=!battle;
  el('menu-header').hidden=battle;el('menu-footer').hidden=battle;
  el('pause-overlay').hidden=next!=='paused';el('results-overlay').hidden=next!=='results';
  el('battle-hud').inert=next!=='match';el('touch-controls').inert=next!=='match';
  if(battle)renderer?.resize();
  if(focus){
    const target=next==='home'?'start-game':next==='setup'?'setup-title':next==='paused'?'resume-game':next==='results'?'rematch':'viewport';
    el(target).setAttribute('tabindex',el(target).tagName==='BUTTON'?'0':'-1');el(target).focus({preventScroll:true});
    if(!battle)window.scrollTo({top:0,behavior:'instant'});
  }
}
function setup(){activePlayer=0;updateSelection();show('setup');}
function updateSelection(){
  const label=opponent==='cpu'?'CPU':'P2';
  document.body.dataset.opponent=opponent;
  for(const [i,id] of fighters.entries()){
    el<HTMLImageElement>(`selected-p${i+1}-image`).src=`/assets/ui/${id}.png`;
    el<HTMLImageElement>(`selected-p${i+1}-wordmark`).src=`/assets/ui/name-${id}-mask.png`;
  }
  text('selected-p1-name',ROSTER[fighters[0]].name);text('selected-p2-name',ROSTER[fighters[1]].name);
  text('preview-p1',ROSTER[fighters[0]].name.toUpperCase());text('preview-p2',ROSTER[fighters[1]].name.toUpperCase());
  text('selection-p2-badge',label);text('selection-p2-label',opponent==='cpu'?'Computer':'Player 2');text('p2-card-type',label);
  text('selection-instruction',`Pick a fighter for ${activePlayer===0?'Player 1':opponent==='cpu'?'the CPU':'Player 2'}.`);
  el('select-p1').setAttribute('aria-pressed',String(activePlayer===0));el('select-p2').setAttribute('aria-pressed',String(activePlayer===1));
  for(const button of all<HTMLButtonElement>('[data-fighter]')){
    const id=button.dataset.fighter!;
    button.setAttribute('aria-pressed',String(fighters[activePlayer]===id));
    button.setAttribute('aria-label',`Choose ${ROSTER[id as FighterId].name} for ${activePlayer===0?'Player 1':label}`);
    button.querySelector('.fighter-tokens')!.innerHTML=`${fighters[0]===id?'<i>P1</i>':''}${fighters[1]===id?`<i class="cpu-token">${label}</i>`:''}`;
  }
  for(const button of all('[data-opponent]'))button.setAttribute('aria-pressed',String(button.dataset.opponent===opponent));
  text('opponent-description',opponent==='cpu'?'Computer opponent':'Player 2: keyboard or gamepad');
  el<HTMLSelectElement>('stocks').value=String(stocks);el<HTMLSelectElement>('match-time').value=String(seconds);save();
}
el('fighter-grid').innerHTML=fighterIds.map(id=>`<button class="fighter-option" data-fighter="${id}" aria-pressed="false"><img src="/assets/ui/${id}.png" alt="" /><span class="fighter-tokens"></span><span class="fighter-name">${ROSTER[id].name.toUpperCase()}</span></button>`).join('');
for(const button of all('[data-fighter]'))button.onclick=()=>{fighters[activePlayer]=button.dataset.fighter as FighterId;audio.play('select');updateSelection();};
for(const [index,id] of ['select-p1','select-p2'].entries())el(id).onclick=()=>{activePlayer=index;audio.play('select');updateSelection();};
for(const button of all('[data-opponent]'))button.onclick=()=>{opponent=button.dataset.opponent as typeof opponent;audio.play('select');updateSelection();};
el<HTMLSelectElement>('stocks').onchange=()=>{stocks=Number(el<HTMLSelectElement>('stocks').value);save();};
el<HTMLSelectElement>('match-time').onchange=()=>{seconds=Number(el<HTMLSelectElement>('match-time').value);save();};

function begin(){
  if(!ready)return;
  const options:GameOptions={mode:'battle',opponent,stocks,seconds,fighters:[...fighters]};
  const first=roster[fighters[0]];sim=new Simulation(first.data,first.poses,options,roster[fighters[1]]);
  previousHits=0;previousKO=-1;lastCountdown='';audio.play('start');
  for(const [i,id] of fighters.entries()){
    text(`hud-p${i+1}-name`,ROSTER[id].name.toUpperCase());el<HTMLImageElement>(`hud-p${i+1}-image`).src=`/assets/ui/${id}.png`;
    el(`hud-p${i+1}-stocks`).style.setProperty('--stock-image',`url("/assets/ui/${id}.png")`);
  }
  text('hud-p2-label',opponent==='cpu'?'CPU':'P2');text('battle-rule',`${stocks} STOCK${stocks===1?'':'S'} · ${opponent==='cpu'?'VS CPU':'LOCAL VERSUS'}`);
  show('match');updateBattle();
}
function pause(){if(screen==='match'&&sim?.status!=='finished'){audio.play('select');show('paused');}}
function resume(){if(screen==='paused'){audio.play('select');show('match');}}
function results(){
  if(!sim)return;
  const winner=sim.winner,draw=winner===-1,winnerId=fighters[winner===1?1:0];
  text('result-title',draw?'IT’S A DRAW!':`${ROSTER[winnerId].name.toUpperCase()} WINS!`);
  text('result-kicker',draw?'NO CONTEST':'GAME!');
  text('result-description',draw?'Draw':`${winner===0?'Player 1':opponent==='cpu'?'CPU':'Player 2'}`);
  el('results-overlay').classList.toggle('is-draw',draw);
  el<HTMLImageElement>('winner-image').src=`/assets/ui/${winnerId}.png`;el('winner-image').hidden=draw;
  const elapsed=Math.max(0,seconds-Math.ceil(sim.remaining/60));
  el('result-score').innerHTML=`<span>PLAYER 1<b>${sim.stocks[0]} STOCK${sim.stocks[0]===1?'':'S'}</b></span><span>MATCH TIME<b>${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}</b></span><span>${opponent==='cpu'?'CPU':'PLAYER 2'}<b>${sim.stocks[1]} STOCK${sim.stocks[1]===1?'':'S'}</b></span>`;
  audio.play('win');show('results');
}
function updateBattle(){
  if(!sim)return;
  const time=Math.ceil(sim.remaining/60);text('battle-timer',`${Math.floor(time/60)}:${String(time%60).padStart(2,'0')}`);
  for(const [i,actor] of sim.actors.entries()){
    const damage=el(`hud-p${i+1}-damage`),value=String(Math.floor(actor.f.damage));
    if(damage.dataset.damage!==value){damage.innerHTML=`${value}<small>%</small>`;damage.dataset.damage=value;}
    damage.classList.toggle('hurt',actor.f.damage>=50&&actor.f.damage<100);damage.classList.toggle('danger',actor.f.damage>=100);
    const pips=el(`hud-p${i+1}-stocks`),count=sim.stocks[i];
    if(pips.dataset.count!==`${count}/${stocks}`){pips.innerHTML=Array.from({length:stocks},(_,n)=>`<i${n>=count?' class="lost"':''}></i>`).join('');pips.dataset.count=`${count}/${stocks}`;pips.setAttribute('aria-label',`${count} stocks remaining`);}
  }
  const countdown=sim.status==='countdown'?String(Math.ceil(sim.countdown/60)):sim.frame<220?'GO!':'';
  el('countdown').hidden=!countdown;
  if(countdown!==lastCountdown){
    lastCountdown=countdown;text('countdown-number',countdown);el('countdown').classList.remove('pulse');
    void el('countdown').offsetWidth;el('countdown').classList.add('pulse');
    if(countdown)audio.play(countdown==='GO!'?'start':'count');
  }
  el('match-hint').hidden=sim.frame>540||opponent==='local';
}
function tick(){
  if(!sim)return;
  const local=opponent==='local';sim.step(input.read(0,local),local?input.read(1,true):undefined);
  input.endFrame();
  if(sim.hits>previousHits){audio.play('hit');previousHits=sim.hits;}
  if(sim.lastKO&&sim.lastKO.frame!==previousKO){previousKO=sim.lastKO.frame;audio.play('ko');}
  if(sim.error){show('paused');showError('The match stopped unexpectedly. Reload the game to try again.');console.error(sim.error);}
  else if(sim.status==='finished')results();
}
function showError(message:string){text('error-message',message);el('game-error').hidden=false;}

el('start-game').onclick=setup;el('setup-back').onclick=()=>show('home');el('brand-home').onclick=()=>show('home');
el('fight').onclick=begin;el('pause-game').onclick=pause;el('resume-game').onclick=resume;
el('restart-game').onclick=begin;el('rematch').onclick=begin;
el('pause-select').onclick=setup;el('results-select').onclick=setup;
el('pause-home').onclick=()=>show('home');el('results-home').onclick=()=>show('home');
el('sound-toggle').onclick=()=>{audio.enabled=!audio.enabled;audio.unlock();audio.play('select');sound();save();};
el('retry-load').onclick=()=>location.reload();
document.addEventListener('pointerdown',()=>audio.unlock(),{passive:true});

const controls={
  p1:[['Move / run','A D / hold Shift'],['Jump / air jump','Space'],['Attack / aerial','J + direction'],['Smash attack','L + direction'],['Shield / dodge / tech','K + direction'],['Grab / throw','F / direction'],['Neutral / side special','U / O'],['Up / down special','I / G'],['Crouch / fast fall','S'],['Pause','Esc or P']],
  p2:[['Move / run','← → / right Shift'],['Jump / air jump','Enter'],['Attack / aerial','/ + direction'],['Smash attack','. + direction'],['Shield / dodge / tech',', + direction'],['Grab / throw','] / direction'],['Neutral / side special',"' / ["],['Up / down special','; / \\'],['Crouch / fast fall','↓'],['Pause','Esc or P']],
  pad:[['Move / run','Left stick'],['Jump / air jump','A'],['Attack / aerial','X + stick'],['Smash attack','Y + stick'],['Shield / dodge / tech','LT or RT + stick'],['Grab / throw','LB / stick'],['Neutral / side special','RB / D-pad ← →'],['Up / down special','B / D-pad ↓'],['Crouch / fast fall','Stick down'],['Pause','Start']],
};
function showControls(scheme:keyof typeof controls){
  el('controls-list').replaceChildren(...controls[scheme].flatMap(([action,key])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=action;dd.textContent=key;return[dt,dd];}));
  for(const button of all('[data-scheme]'))button.setAttribute('aria-pressed',String(button.dataset.scheme===scheme));
  text('controls-note',scheme==='pad'?'Standard gamepads use Xbox-style button names. In local versus, one gamepad controls P2; two gamepads control P1 and P2. Use the D-pad or stick and A to navigate menus.':scheme==='p2'?'Player 2 uses these keys in local versus. One connected gamepad also controls Player 2.': 'Jump, then use I to recover if you fall off the stage. Hold L to charge a smash. Direction + J selects different attacks; J after a grab pummels.');
}
for(const button of all('[data-help]'))button.onclick=()=>{pause();clearInput();showControls('p1');help.showModal();audio.play('select');};
for(const button of all('[data-scheme]'))button.onclick=()=>showControls(button.dataset.scheme as keyof typeof controls);
el('close-help').onclick=()=>help.close();el('help-done').onclick=()=>help.close();
help.addEventListener('close',()=>clearInput());

document.addEventListener('keydown',event=>{
  if(event.metaKey||event.ctrlKey||event.altKey||help.open)return;
  audio.unlock();
  if(event.code==='Escape'||event.code==='KeyP'){
    event.preventDefault();if(event.repeat)return;
    if(screen==='match')pause();else if(screen==='paused')resume();else if(screen==='setup')show('home');return;
  }
  const titleKeyTarget=!(event.target instanceof HTMLButtonElement)||event.target.id==='start-game';
  if(screen==='home'&&!event.repeat&&!['Tab','ShiftLeft','ShiftRight'].includes(event.code)&&titleKeyTarget){
    event.preventDefault();if(!event.repeat)setup();return;
  }
  if(screen==='match'&&GAME_KEYS.has(event.code)){event.preventDefault();input.pressKey(event.code);}
});
document.addEventListener('keyup',event=>input.keys.delete(event.code));
window.addEventListener('blur',()=>{clearInput();pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();pause();}});
for(const button of all<HTMLButtonElement>('[data-control]')){
  button.addEventListener('pointerdown',event=>{
    event.preventDefault();if(screen!=='match')return;
    button.setPointerCapture(event.pointerId);input.pressTouch(event.pointerId,button.dataset.control!);button.classList.add('held');
  });
  const release=(event:PointerEvent)=>{input.touch.delete(event.pointerId);button.classList.toggle('held',[...input.touch.values()].includes(button.dataset.control!));};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}

function navigatePad(now:number){
  const pads=input.pads();
  if(pads.length!==lastPadConnected){
    lastPadConnected=pads.length;text('controller-status',pads.length?`${pads.length} GAMEPAD${pads.length===1?'':'S'} CONNECTED`:'KEYBOARD READY');
    if(previousPads>pads.length&&screen==='match')pause();previousPads=pads.length;
  }
  const pressed=new Set<number>();for(const pad of pads)for(const [i,button] of pad.buttons.entries())if(button.pressed)pressed.add(i);
  const fresh=(index:number)=>pressed.has(index)&&!padButtons.has(index);
  if(screen==='home'&&!help.open&&[0,1,2,3,9].some(fresh)){
    audio.unlock();setup();padButtons=pressed;return;
  }
  if(fresh(9)&&!help.open){audio.unlock();if(screen==='match')pause();else if(screen==='paused')resume();else if(screen==='home')setup();}
  if(screen!=='match'){
    if(fresh(1)){if(help.open)help.close();else if(screen==='paused')resume();else if(screen==='setup')show('home');}
    const scope=help.open?help:screen==='home'?el('home-screen'):screen==='setup'?el('setup-screen'):screen==='paused'?el('pause-overlay'):el('results-overlay');
    const candidates=[...scope.querySelectorAll<HTMLButtonElement|HTMLSelectElement>('button,select')].filter(n=>!n.disabled&&n.getClientRects().length>0);
    const axis=pads[0]?.axes??[];
    const direction=pressed.has(13)||pressed.has(15)||(axis[1]??0)>.6||(axis[0]??0)>.6?1:pressed.has(12)||pressed.has(14)||(axis[1]??0)<-.6||(axis[0]??0)<-.6?-1:0;
    if(!direction)menuNeedsNeutral=false;
    if(direction&&!menuNeedsNeutral&&now-lastNavigation>220&&candidates.length){
      const active=document.activeElement,index=candidates.indexOf(active as HTMLButtonElement);
      if(active instanceof HTMLSelectElement&&scope.contains(active)){
        const horizontal=pressed.has(14)||pressed.has(15)||Math.abs(axis[0]??0)>.6;
        if(horizontal){active.selectedIndex=(active.selectedIndex+direction+active.options.length)%active.options.length;active.dispatchEvent(new Event('change'));}
        else candidates[(index+direction+candidates.length)%candidates.length].focus();
      }else candidates[(index+direction+candidates.length)%candidates.length].focus();
      audio.play('select');lastNavigation=now;
    }else if(!direction)lastNavigation=now-220;
    if(fresh(0)){
      audio.unlock();const active=document.activeElement;
      if(active instanceof HTMLButtonElement&&scope.contains(active))active.click();
      else if(screen==='home'&&!help.open)setup();else candidates[0]?.focus();
    }
  }
  padButtons=pressed;
}
async function load(){
  roster=Object.fromEntries(await Promise.all(fighterIds.map(async id=>{
    const [data,motion]=await Promise.all([fetchJSON<FighterData>(`/assets/${id}/data.json`),fetchMotion(`/assets/${id}/motion.json`)]);
    return[id,{data,poses:new Poses(motion)}];
  }))) as LoadedRoster;
  renderer=new ArenaRenderer(el('viewport'));
  await Promise.all([renderer.load(),...fighterIds.map(id=>{
    const image=new Image();image.src=`/assets/ui/name-${id}-mask.png`;return image.decode();
  })]);
  ready=true;el<HTMLButtonElement>('fight').disabled=false;text('asset-status','Ready');
}
function animate(now:number){
  const delta=Math.min((now-lastTime)/1000,.1);lastTime=now;navigatePad(now);
  if(ready&&screen==='match'&&!help.open){accumulator+=delta;while(accumulator>=1/60&&screen==='match'){accumulator-=1/60;tick();}}
  else accumulator=0;
  if(ready&&sim&&['match','paused','results'].includes(screen)){
    const key=`${sim.frame}:${renderer.revision}:${screen}`;
    if(key!==lastRender){renderer.draw(sim,false,false,false);updateBattle();lastRender=key;}
  }
  requestAnimationFrame(animate);
}
// Read-only inspection remains available to automated game-flow checks.
Object.defineProperty(window,'brawlGame',{value:{get ready(){return ready;},get screen(){return screen;},snapshot:()=>sim?.snapshot()??null,cpuTrace:()=>sim?.cpu?.trace()??[]}});
sound();updateSelection();showControls('p1');
requestAnimationFrame(animate);
void load().catch(error=>{console.error(error);text('asset-status','The arena could not load.');showError('Some game files could not load. Reload the page to try again.');});
