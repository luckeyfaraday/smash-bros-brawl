import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {Simulation} from '../../src/simulation';
import {Poses} from '../../src/pose';
const routes=JSON.parse(readFileSync('tests/fixtures/knockdown-routes.json','utf8'));
const codes=['KeyA','KeyD','KeyW','KeyS','KeyK','KeyJ','KeyL','KeyI','Space','ShiftLeft','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Slash','Comma','Period','ShiftRight','Enter'];
const state=(page:Page)=>page.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(page:Page,frames:number,keys:string[]=[]){await page.evaluate(({frames,keys,codes})=>{for(const code of codes)document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));for(let n=0;n<frames;n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));},{frames,keys,codes});const s=await state(page);expect(s.script?.error??s.opponent.script?.error??null).toBe(null);return s;}
async function reset(page:Page,route:any){await play(page,0);await page.selectOption('#fighter-one',route.fighter);await page.selectOption('#fighter-two',route.opponent);await page.selectOption('#mode','local');if(!await page.evaluate(()=>(window as any).brawlLab.paused))await page.locator('#pause').click();await page.locator('#reset').click();}
async function route(page:Page,r:any,which='approach'){await reset(page,r);for(const step of r[which])await play(page,step.frames,step.keys);return state(page);}
async function load(page:Page){await page.goto('/lab.html');await page.waitForFunction(()=>(window as any).brawlLab?.ready);}

test('all four fighters tumble, miss a tech and use every get-up option through keyboard play',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await load(page);
 for(const r of routes.filter((r:any)=>r.slot===0))for(const [key,prefix] of [['KeyJ','DownAttack'],['KeyD','DownForward'],['KeyA','DownBack'],['Space','DownStand']]){
  const wait=await route(page,r,'wait');expect(wait.player.state).toBe('downWait');await expect(page.locator('#knockdown-title')).toHaveText('Choose your get-up');
  let s=await play(page,1,[key]);expect(s.player.clip).toBe(prefix+r.posture);await expect(page.locator('#knockdown-phase')).toHaveText('PROTECTED');
  s=await play(page,70);expect(s.knockdown[0].state).toBe(null);expect(s.player.grounded).toBe(true);expect(s.player.state).toBe('idle');
 }
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);expect(errors).toEqual([]);
});

test('each fighter and player slot can time a floor tech or directional tech roll and regain control',async({page})=>{
 await load(page);
 for(const r of routes)for(const roll of [false,true]){
  const before=await route(page,r);const target=r.slot===0?'player':'dummy';expect(before[target].state).toBe('tumble');
  const keys=[r.slot===0?'KeyK':'Comma',...(roll?[r.slot===0?'KeyD':'ArrowLeft']:[])];let s=await play(page,4,keys);
  expect(s[target].state).toBe('tech');expect(s[target].clip).toBe(roll?'PassiveStandF':'Passive');expect(s.knockdown[1-r.slot].state).toBe(null);
  await expect(page.locator('#knockdown-title')).toHaveText(roll?'Rolling tech':'Floor tech');await expect(page.locator('#knockdown-phase')).toHaveText('PROTECTED');
  s=await play(page,50);expect(s[target].state).toBe('idle');expect(s.knockdown[r.slot].state).toBe(null);
 }
});

test('a gamepad controls P2 tech rolls and get-up attacks; a held early shield misses the tech window',async({page})=>{
 await load(page);const r=routes.find((r:any)=>r.id==='link'&&r.slot===1);
 await route(page,r);await page.evaluate(()=>{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[-1,0,0,0],buttons:Array.from({length:17},(_,n)=>({pressed:n===6,touched:n===6,value:n===6?1:0}))}]});});
 let s=await play(page,4);expect(s.dummy.clip).toBe('PassiveStandF');expect(s.player.state).toBe('idle');
 await page.evaluate(()=>{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]});});await route(page,r,'wait');
 await page.evaluate(()=>{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},(_,n)=>({pressed:n===2,touched:n===2,value:n===2?1:0}))}]});});s=await play(page,1);expect(s.dummy.clip).toBe('DownAttackD');
 await page.evaluate(()=>{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]});});
 await reset(page,r);const early=r.launched.frame+2;let remaining=early;
 for(const p of r.approach){const frames=Math.min(remaining,p.frames);if(!frames)break;await play(page,frames,p.keys);remaining-=frames;}
 const waitFrame=r.wait.reduce((n:number,p:any)=>n+p.frames,0);
 s=await play(page,waitFrame-early+1,['Comma']);expect(s.dummy.state).toBe('downWait');expect(s.knockdown[1].tech.window).toBe(0);
 await expect(page.locator('#knockdown-instruction')).toContainText('slash attacks');
});

test('recorded launches and floor techs replay identically in Chromium and Node',async({page})=>{
 await load(page);const r=routes.find((r:any)=>r.id==='mario'&&r.slot===0);await reset(page,r);
 await page.locator('#record').click();if(!await page.evaluate(()=>(window as any).brawlLab.paused))await page.locator('#pause').click();
 for(const step of r.approach)await play(page,step.frames,step.keys);await play(page,4,['KeyK','KeyD']);await play(page,50);
 await page.locator('#record').click();const hash=await page.evaluate(()=>(window as any).brawlLab.hash());
 const downloaded=page.waitForEvent('download');await page.locator('#export').click();const download=await downloaded;const file=await download.path();const tape=JSON.parse(readFileSync(file!,'utf8'));
 expect(tape.simulation).toBe('brawl-lab-027');const a={data:JSON.parse(readFileSync('public/assets/mario/data.json','utf8')),poses:new Poses(JSON.parse(readFileSync('public/assets/mario/motion.json','utf8')))};
 const sim=new Simulation(a.data,a.poses,tape.options,a);for(const input of tape.frames)sim.step(input,input.opponent);expect(sim.hash()).toBe(hash);
 await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');expect(await page.evaluate(()=>(window as any).brawlLab.hash())).toBe(hash);
});
