import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {Simulation} from '../../src/simulation';
import {Poses} from '../../src/pose';
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(p:Page,frames:number,keys:string[]=[]){await p.evaluate(({frames,keys})=>{
 for(const code of ['KeyA','KeyD','KeyW','KeyS','KeyL','ArrowUp','ArrowDown','Period'])document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));
 for(let n=0;n<frames;n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));
},{frames,keys});}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);}
async function reset(p:Page){if(!await p.evaluate(()=>(window as any).brawlLab.paused))await p.locator('#pause').click();await p.locator('#reset').click();}

test('all four fighters charge upward and downward smashes and land the selected attack from keyboard controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
 for(const [id,up,down] of [['mario',7,3],['link',6,5],['kirby',9,5],['pikachu',5,5]] as const)for(const [key,start,move,label] of [['KeyW',up,'AttackHi4','UP SMASH'],['KeyS',down,'AttackLw4','DOWN SMASH']] as const){
  await play(page,0);await page.selectOption('#fighter-one',id);await reset(page);await play(page,10,['KeyD']);await play(page,start+30,[key,'KeyL']);
  expect((await state(page)).smash).toEqual({phase:'hold',move,charge:30});await expect(page.locator('#smash-power')).toHaveText('1.20×');await expect(page.locator('#smash-meter')).toHaveAttribute('aria-valuenow','30');
  await expect(page.locator('#smash-title')).toHaveText(`${label} · CHARGING`);await expect(page.locator('#timeline')).toBeHidden();
  for(let i=0;i<35;i++){await play(page,1);if((await state(page)).lastHit)break;}
  const s=await state(page);expect(s.lastHit.move).toBe(move);expect(s.lastHit.damage).toBeGreaterThan(0);expect(s.smash.charge).toBe(30);await expect(page.locator('#move-label')).toHaveText(label);
 }
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);expect(errors).toEqual([]);
});

test('a charged Pikachu spin delivers seven hits and its exported recording reproduces the charge and damage',async({page})=>{
 await ready(page);await page.selectOption('#fighter-one','pikachu');await page.locator('#record').click();await page.locator('#pause').click();
 await play(page,10,['KeyD']);await play(page,35,['KeyS','KeyL']);await play(page,65);
 const s=await state(page);expect(s.hits).toBe(7);expect(s.dummy.damage).toBeCloseTo(18);expect(s.lastHit.damage).toBeCloseTo(3.6);
 await page.locator('#record').click();const downloaded=page.waitForEvent('download');await page.locator('#export').click();const tape=JSON.parse(readFileSync((await (await downloaded).path())!,'utf8'));
 const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),p=load('pikachu'),m=load('mario'),sim=new Simulation(p.data,p.poses,tape.options,m);
 for(const input of tape.frames)sim.step(input);expect(sim.hash()).toBe(tape.expectedHash);expect(sim.hits).toBe(7);
 await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
});

test('P2 keyboard and gamepad smashes charge independently, auto-release at maximum, and reset cleanly',async({page})=>{
 await ready(page);await page.selectOption('#fighter-two','link');await page.selectOption('#mode','local');await reset(page);await play(page,180);
 await play(page,66,['ArrowUp','Period']);let s=await state(page);expect(s.opponent.smash).toEqual({phase:'hold',move:'AttackHi4',charge:60});expect(s.player.state).toBe('idle');
 await play(page,1,['Period']);s=await state(page);expect(s.dummy.clip).toBe('AttackHi4');expect(s.opponent.smash.phase).toBe('release');
 await reset(page);await play(page,180);expect((await state(page)).opponent.smash).toBe(null);
 await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[0,1],buttons:Array.from({length:17},(_,i)=>({pressed:i===3,value:i===3?1:0}))}]}));
 await play(page,35);s=await state(page);expect(s.opponent.smash).toEqual({phase:'hold',move:'AttackLw4',charge:30});expect(s.player.state).toBe('idle');
 await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]}));await play(page,1);expect((await state(page)).dummy.clip).toBe('AttackLw4');
});
