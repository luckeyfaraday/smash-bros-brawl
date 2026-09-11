import {test,expect,type Page} from '@playwright/test';import {readFileSync} from 'node:fs';
import {Simulation} from '../../src/simulation';import {Poses} from '../../src/pose';
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(p:Page,frames:number,keys:string[]=[]){await p.evaluate(({frames,keys})=>{
 for(const code of ['KeyA','KeyD','KeyU','Space','Quote'])document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));
 for(let i=0;i<frames;i++){
  document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));
  const lab=(window as any).brawlLab;((window as any).__joltHashes??=new Map()).set(lab.snapshot().frame,lab.hash());
 }
},{frames,keys});}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);await p.selectOption('#fighter-one','pikachu');}
async function reset(p:Page){if(!await p.evaluate(()=>(window as any).brawlLab.paused))await p.locator('#pause').click();await p.locator('#reset').click();}

test('Pikachu fires ground and aerial jolts from U and the visible game reports their distinct damage',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await ready(page);await reset(page);await play(page,40,['KeyA']);await play(page,1,['KeyD']);await play(page,18,['KeyU']);expect((await state(page)).projectiles).toHaveLength(0);
 await play(page,1,['KeyU']);expect((await state(page)).projectiles[0]).toMatchObject({kind:'jolt',phase:'air',age:0});await expect(page.locator('#ranged-title')).toHaveText('THUNDER JOLT');await expect(page.locator('#neutral-preview')).toHaveText('Pikachu’s Thunder Jolt');
 await play(page,7);expect((await state(page)).projectiles[0].phase).toBe('ground');
 for(let i=0;i<80&&!(await state(page)).lastHit;i++)await play(page,1);expect((await state(page)).dummy.damage).toBe(6);await expect(page.locator('#dummy-damage')).toHaveText('6%');
 await reset(page);await play(page,6,['Space']);await play(page,19,['KeyU']);expect((await state(page)).player.clip).toBe('SpecialAirN');expect((await state(page)).projectiles[0].phase).toBe('air');
 for(let i=0;i<70&&!(await state(page)).lastHit;i++)await play(page,1);const s=await state(page);expect(s.lastHit.move).toBe('ThunderJolt');expect(s.dummy.damage).toBe(9);expect(s.player.hitlag).toBe(0);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);expect(errors).toEqual([]);
});

test('a recorded jolt follows the original edge and underside, replays in Node, and player two can fire it independently',async({page})=>{
 await ready(page);await page.locator('#record').click();await page.locator('#pause').click();await play(page,38,['KeyA']);await play(page,19,['KeyU']);let wall=false,under=false;
 for(let i=0;i<100;i++){const s=await state(page);wall ||= s.projectiles.some((p:any)=>p.surface&&[1,5,6].includes(p.surface.plane));under ||= s.projectiles.some((p:any)=>p.surface&&[7,8,9,10].includes(p.surface.plane));await play(page,1);}
 expect(wall).toBe(true);expect(under).toBe(true);expect((await state(page)).projectiles).toHaveLength(0);
 await page.locator('#record').click();const download=page.waitForEvent('download');await page.locator('#export').click();const tape=JSON.parse(readFileSync((await (await download).path())!,'utf8'));
 const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),p=load('pikachu'),m=load('mario'),sim=new Simulation(p.data,p.poses,tape.options,m);
 const observed=new Map<number,string>(await page.evaluate(()=>[...(window as any).__joltHashes]));expect(observed.size).toBeGreaterThan(140);let compared=0;
 for(const input of tape.frames){sim.step(input);if(observed.has(sim.frame)){expect(sim.hash(),`Frame ${sim.frame}`).toBe(observed.get(sim.frame));compared++;}}expect(compared).toBe(observed.size);expect(sim.hash()).toBe(tape.expectedHash);
 await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
 await page.selectOption('#fighter-one','mario');await page.selectOption('#fighter-two','pikachu');await page.selectOption('#mode','local');await reset(page);await play(page,180);await play(page,19,['Quote']);expect((await state(page)).projectiles[0]).toMatchObject({kind:'jolt',owner:1});expect((await state(page)).player.state).toBe('idle');await reset(page);expect((await state(page)).projectiles).toHaveLength(0);
});
