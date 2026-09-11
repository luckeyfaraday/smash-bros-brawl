import {test,expect,type Page} from '@playwright/test';import {readFileSync} from 'node:fs';
import {Simulation} from '../../src/simulation';import {Poses} from '../../src/pose';
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(p:Page,frames:number,keys:string[]=[]){await p.evaluate(({frames,keys})=>{
 for(const code of ['KeyA','KeyD','KeyU','KeyJ','Space','Quote','ArrowLeft','ArrowRight','Slash'])document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));
 for(let i=0;i<frames;i++){
  document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));const lab=(window as any).brawlLab;
  ((window as any).__inhaleHashes??=new Map()).set(lab.snapshot().frame,lab.hash());
 }
},{frames,keys});}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);await p.selectOption('#fighter-one','kirby');}
async function reset(p:Page){if(!await p.evaluate(()=>(window as any).brawlLab.paused))await p.locator('#pause').click();await p.locator('#reset').click();}

test('Kirby inhales, carries, hops and spits through the controls; the recording replays in Node and the browser',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
 await ready(page);await page.locator('#record').click();await page.locator('#pause').click();
 await play(page,55,['KeyU']);expect((await state(page)).capture).toMatchObject({owner:0,victim:1,phase:'held'});await expect(page.locator('#inhale-title')).toHaveText('OPPONENT IN MOUTH');await expect(page.locator('#neutral-preview')).toHaveText('Kirby’s inhale · hold U');
 await play(page,5,['KeyA']);expect((await state(page)).player.facing).toBe(-1);await play(page,4,['Space']);expect((await state(page)).player.y).toBeGreaterThan(0);
 await play(page,8,['KeyU']);expect((await state(page)).capture.phase).toBe('star');await expect(page.locator('#dummy-damage')).toHaveText('10%');await expect(page.locator('#inhale-title')).toHaveText('SPIT THEM OUT');
 await play(page,31);expect((await state(page)).capture).toBeNull();expect((await state(page)).dummy.state).not.toBe('spitStar');
 await page.locator('#record').click();const download=page.waitForEvent('download');await page.locator('#export').click();const tape=JSON.parse(readFileSync((await (await download).path())!,'utf8'));
 const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),k=load('kirby'),m=load('mario'),sim=new Simulation(k.data,k.poses,tape.options,m);
 const hashes=new Map<number,string>(await page.evaluate(()=>[...(window as any).__inhaleHashes]));expect(hashes.size).toBeGreaterThan(95);
 for(const input of tape.frames){sim.step(input);if(hashes.has(sim.frame))expect(sim.hash(),`Frame ${sim.frame}`).toBe(hashes.get(sim.frame));}expect(sim.hash()).toBe(tape.expectedHash);
 await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
 await reset(page);await play(page,55,['KeyU']);await page.setViewportSize({width:390,height:844});await expect(page.locator('#inhale-panel')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);expect(errors).toEqual([]);
});

test('player two can capture with apostrophe and player one can struggle free, then reset the match',async({page})=>{
 await ready(page);await page.selectOption('#fighter-one','mario');await page.selectOption('#fighter-two','kirby');await page.selectOption('#mode','local');await reset(page);await play(page,180);
 for(let n=0;n<30;n++){const s=await state(page);if(s.dummy.x-s.player.x<15)break;await play(page,5,['ArrowLeft']);}
 await play(page,55,['Quote']);expect((await state(page)).capture).toMatchObject({owner:1,victim:0,phase:'held'});await expect(page.locator('#inhale-title')).toHaveText('KIRBY HAS YOU');
 for(let n=0;n<20&&(await state(page)).capture;n++)await play(page,1,n%2?['KeyA']:['KeyD','KeyJ']);
 const escaped=await state(page);expect(escaped.capture).toBeNull();expect(escaped.player.damage).toBe(0);expect(escaped.player.clip).toBe('CaptureCut');expect(escaped.player.invincible).toBeGreaterThan(0);
 await reset(page);expect((await state(page)).capture).toBeNull();expect((await state(page)).player.state).toBe('idle');
});
