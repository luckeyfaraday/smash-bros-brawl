import {test,expect,type Page} from '@playwright/test';import {readFileSync} from 'node:fs';
import {Simulation} from '../../src/simulation';import {Poses} from '../../src/pose';
import routes from '../fixtures/aerial-hit-routes.json' with {type:'json'};
const snapshot=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(p:Page,frames:number,keys:string[]=[]){await p.evaluate(({frames,keys})=>{
 for(const code of ['KeyA','KeyD','KeyW','KeyS','KeyJ','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','Slash'])document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));
 for(let n=0;n<frames;n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));
},{frames,keys});}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);}
async function reset(p:Page){if(!await p.evaluate(()=>(window as any).brawlLab.paused))await p.locator('#pause').click();await p.locator('#reset').click();}

test('every fighter connects all four directional aerials through keyboard input and updates the move guide',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
 for(const route of routes){
  await page.selectOption('#mode',(route as any).options?'local':'training');await page.selectOption('#fighter-one',route.id);await reset(page);
  for(const part of route.steps)await play(page,part.frames,part.keys);
  const s=await snapshot(page);expect(s.lastHit.move).toBe('AttackAir'+route.suffix);expect(s.dummy.damage).toBe(route.damage);expect(s.player.state).toBe('aerial');
  await expect(page.locator('#move-label')).toHaveText(({F:'FORWARD AERIAL',B:'BACK AERIAL',Hi:'UP AERIAL',Lw:'DOWN AERIAL'} as Record<string,string>)[route.suffix]);
  await expect(page.locator('#air-forward-key')).toHaveText(s.player.facing===1?'D + J':'A + J');await expect(page.locator('#air-back-key')).toHaveText(s.player.facing===1?'A + J':'D + J');
 }
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:'artifacts/aerial-controls-browser-phone.png',fullPage:true});
 expect(errors).toEqual([]);
});

test('Kirby drill connects six air hits and a landing hit, respects landing recovery and replays the exported inputs',async({page})=>{
 await ready(page);await page.selectOption('#fighter-one','kirby');await page.locator('#record').click();await page.locator('#pause').click();
 const route=routes.find(r=>r.id==='kirby'&&r.suffix==='Lw')!;for(const part of route.steps)await play(page,part.frames,part.keys);await play(page,40);
 const hit=await snapshot(page);expect(hit.player.clip).toBe('LandingAirLw');expect(hit.player.age).toBe(0);expect(hit.hits).toBe(7);expect(hit.dummy.damage).toBe(14);expect(hit.lastHit.move).toBe('LandingAirLw');
 await expect(page.locator('#move-label')).toHaveText('DOWN AERIAL');await expect(page.locator('#move-frame')).toHaveText('LANDING 0 / 15');
 await play(page,hit.player.hitlag+14);expect((await snapshot(page)).player.state).toBe('landing');await play(page,1);expect((await snapshot(page)).player.state).toBe('idle');
 await page.locator('#record').click();const download=page.waitForEvent('download');await page.locator('#export').click();const tape=JSON.parse(readFileSync((await (await download).path())!,'utf8'));
 const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),k=load('kirby'),m=load('mario'),s=new Simulation(k.data,k.poses,tape.options,m);
 for(const input of tape.frames)s.step(input);expect(s.hash()).toBe(tape.expectedHash);expect(s.hits).toBe(7);
 await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
});

test('P2 and gamepad directional aerials keep facing while selecting back and up attacks independently of P1',async({page})=>{
 await ready(page);await page.selectOption('#fighter-two','pikachu');await page.selectOption('#mode','local');await reset(page);await play(page,180);await play(page,8,['Enter']);await play(page,1,['ArrowRight','Slash']);
 expect((await snapshot(page)).dummy.clip).toBe('AttackAirB');expect((await snapshot(page)).dummy.facing).toBe(-1);expect((await snapshot(page)).player.state).toBe('idle');
 async function pad(x:number,y:number,button=-1){await page.evaluate(({x,y,button})=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[x,y],buttons:Array.from({length:17},(_,i)=>({pressed:i===button,value:i===button?1:0}))}]}),{x,y,button});}
 for(const [x,y,move] of [[.6,0,'AttackAirB'],[0,-1,'AttackAirHi']] as const){
  await pad(0,0);await reset(page);await play(page,180);await pad(0,0,0);await play(page,8);await pad(x,y,2);await play(page,1);const s=await snapshot(page);expect(s.dummy.clip).toBe(move);expect(s.dummy.facing).toBe(-1);expect(s.player.state).toBe('idle');
 }
});
