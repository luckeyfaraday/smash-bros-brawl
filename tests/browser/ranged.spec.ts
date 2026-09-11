import {test,expect,type Page} from '@playwright/test';import {readFileSync} from 'node:fs';
import {Simulation} from '../../src/simulation';import {Poses} from '../../src/pose';
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(p:Page,frames:number,keys:string[]=[]){await p.evaluate(({frames,keys})=>{
 for(const code of ['KeyA','KeyD','KeyU','Space','Quote'])document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));
 for(let n=0;n<frames;n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));
},{frames,keys});}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);}
async function reset(p:Page){if(!await p.evaluate(()=>(window as any).brawlLab.paused))await p.locator('#pause').click();await p.locator('#reset').click();}

test('Mario throws one animated fireball from U, it bounces and hits, and his aerial throw retains its clock when landing',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});await ready(page);await reset(page);
 await play(page,45,['KeyA']);await play(page,1,['KeyD']);await play(page,1,['KeyU']);await play(page,12);expect((await state(page)).projectiles).toHaveLength(0);
 await play(page,1);expect((await state(page)).projectiles[0]).toMatchObject({kind:'fireball',age:0});await expect(page.locator('#ranged-title')).toHaveText('FIREBALL');await expect(page.locator('#neutral-preview')).toHaveText('Mario’s fireball');
 let bounce=false;for(let i=0;i<100;i++){const s=await state(page);bounce ||= s.projectiles.some((p:any)=>p.bounces>0);if(s.lastHit)break;await play(page,1);}
 let s=await state(page);expect(bounce).toBe(true);expect(s.lastHit.move).toBe('Fireball');expect(s.dummy.damage).toBe(5);expect(s.player.hitlag).toBe(0);expect(s.projectiles).toHaveLength(0);
 await reset(page);await play(page,45,['KeyA']);await play(page,1,['KeyD']);await play(page,6,['Space']);await play(page,1,['KeyU']);await play(page,13);s=await state(page);expect(s.player.clip).toBe('SpecialAirN');expect(s.projectiles).toHaveLength(1);expect(s.projectiles[0].y).toBeGreaterThan(15);
 await play(page,65);expect((await state(page)).nextProjectile).toBe(1);expect(errors).toEqual([]);
});

test('Link draws and holds the original bow, fires a charged arrow, and exports a reproducible ranged recording',async({page})=>{
 await ready(page);await page.selectOption('#fighter-one','link');await page.locator('#record').click();await page.locator('#pause').click();
 await play(page,45,['KeyA']);await play(page,1,['KeyD']);await play(page,75,['KeyU']);
 let s=await state(page);expect(s.ranged).toMatchObject({phase:'hold',charge:43,bow:true,arrow:true,swordBack:true,shieldBack:true});expect(s.projectiles).toHaveLength(0);
 await expect(page.locator('#ranged-title')).toHaveText('BOW FULLY DRAWN');await expect(page.locator('#ranged-power')).toHaveText('12.0%');await expect(page.locator('#ranged-meter')).toHaveAttribute('aria-valuenow','43');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:'artifacts/bow-charge-browser-phone.png',fullPage:true});
 await play(page,1);expect((await state(page)).projectiles[0]).toMatchObject({kind:'arrow',charge:43,vx:10});await expect(page.locator('#ranged-title')).toHaveText('ARROW RELEASED');
 for(let i=0;i<20&&!((await state(page)).lastHit);i++)await play(page,1);s=await state(page);expect(s.lastHit.move).toBe('BowArrow');expect(s.dummy.damage).toBe(12);
 await page.locator('#record').click();const downloaded=page.waitForEvent('download');await page.locator('#export').click();const tape=JSON.parse(readFileSync((await (await downloaded).path())!,'utf8'));
 expect(tape.frames.some((f:any)=>f.neutral)).toBe(true);
 const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),l=load('link'),m=load('mario'),sim=new Simulation(l.data,l.poses,tape.options,m);
 for(const input of tape.frames)sim.step(input);expect(sim.hash()).toBe(tape.expectedHash);
 await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
 await page.selectOption('#fighter-one','kirby');await expect(page.locator('#neutral-preview')).toHaveText('Kirby’s inhale · hold U');
});

test('P2 apostrophe and gamepad right bumper fire independently of player one, and reset removes active projectiles',async({page})=>{
 await ready(page);await page.selectOption('#fighter-two','link');await page.selectOption('#mode','local');await reset(page);await play(page,180);await play(page,65,['Quote']);
 expect((await state(page)).opponent.ranged).toMatchObject({kind:'arrow',phase:'hold',charge:43});expect((await state(page)).player.state).toBe('idle');await play(page,1);expect((await state(page)).projectiles[0]).toMatchObject({kind:'arrow',owner:1,facing:-1});
 await reset(page);expect((await state(page)).projectiles).toHaveLength(0);expect((await state(page)).opponent.ranged).toBe(null);
 await page.selectOption('#fighter-two','mario');await reset(page);await play(page,180);
 await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:i===5,value:i===5?1:0}))}]}));
 await play(page,14);const s=await state(page);expect(s.projectiles[0]).toMatchObject({kind:'fireball',owner:1});expect(s.player.state).toBe('idle');expect(s.dummy.clip).toBe('SpecialN');
});
