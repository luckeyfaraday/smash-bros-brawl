import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {Simulation} from '../../src/simulation';
import {Poses} from '../../src/pose';
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(p:Page,frames:number,keys:string[]=[]){await p.evaluate(({frames,keys})=>{
 for(const code of ['KeyA','KeyD','KeyW','KeyS','KeyJ','ShiftLeft','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Slash','ShiftRight'])document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));
 for(let n=0;n<frames;n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));
},{frames,keys});}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);}
async function reset(p:Page){if(!await p.evaluate(()=>(window as any).brawlLab.paused))await p.locator('#pause').click();await p.locator('#reset').click();}

test('all four fighters select and connect forward, up, down and dash attacks through keyboard controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);
 for(const id of ['mario','link','kirby','pikachu']){
  await page.selectOption('#fighter-one',id);
  for(const [keys,clip,label] of [[['KeyD','KeyJ'],'AttackS3S','FORWARD TILT'],[['KeyW','KeyJ'],'AttackHi3','UP TILT'],[['KeyS','KeyJ'],'AttackLw3','DOWN TILT'],[['KeyD','ShiftLeft','KeyJ'],'AttackDash','DASH ATTACK']] as const){
   await reset(page);
   if(clip==='AttackDash')await play(page,1,['KeyD','ShiftLeft']);
   await play(page,1,[...keys]);expect((await state(page)).player.clip).toBe(clip);await expect(page.locator('#move-label')).toHaveText(label);
   await play(page,85);const s=await state(page);expect(s.lastHit.move).toBe(clip);expect(s.dummy.damage).toBeGreaterThan(0);expect(s.player.state).toBe('idle');expect(s.script).toBeNull();
  }
 }
 expect(errors).toEqual([]);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await expect(page.getByRole('region',{name:'Ground attack controls'})).toBeVisible();
});

test('Pikachu angled tilts preserve high and low damage, and a ground-attack recording replays in and outside the browser',async({page})=>{
 await ready(page);await page.selectOption('#fighter-one','pikachu');
 for(const [keys,clip,damage] of [[['KeyD','KeyW','KeyJ'],'AttackS3Hi',10],[['KeyD','KeyJ'],'AttackS3S',9],[['KeyD','KeyS','KeyJ'],'AttackS3Lw',8]] as const){
  await reset(page);await play(page,1,[...keys]);await play(page,4);const s=await state(page);expect(s.player.clip).toBe(clip);expect(s.script.hitboxes[0].damage).toBe(damage);
 }
 await reset(page);await page.locator('#record').click();await page.locator('#pause').click();
 await play(page,1,['KeyD','KeyW','KeyJ']);await play(page,55);await play(page,1,['KeyS','KeyJ']);await play(page,35);await play(page,1,['KeyD','ShiftLeft']);await play(page,1,['KeyD','ShiftLeft','KeyJ']);await play(page,85);
 await page.locator('#record').click();const download=page.waitForEvent('download');await page.locator('#export').click();const recording=JSON.parse(readFileSync((await (await download).path())!,'utf8'));
 const assets=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),pika=assets('pikachu'),mario=assets('mario');
 const sim=new Simulation(pika.data,pika.poses,recording.options,mario);for(const input of recording.frames)sim.step(input);expect(sim.hash()).toBe(recording.expectedHash);
 await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
});

test('P2 arrows and gamepad stick select tilts and dash attacks without controlling P1',async({page})=>{
 await ready(page);await page.selectOption('#fighter-two','link');await page.selectOption('#mode','local');await reset(page);await play(page,180);
 await play(page,1,['ArrowUp','Slash']);expect((await state(page)).dummy.clip).toBe('AttackHi3');expect((await state(page)).player.state).toBe('idle');
 await reset(page);await play(page,180);await play(page,1,['ArrowLeft','ShiftRight']);await play(page,1,['ArrowLeft','ShiftRight','Slash']);expect((await state(page)).dummy.clip).toBe('AttackDash');
 async function pad(axis:number,y:number,attack:boolean){await page.evaluate(({axis,y,attack})=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[axis,y],buttons:Array.from({length:17},(_,i)=>({pressed:i===2&&attack,value:i===2&&attack?1:0}))}]}),{axis,y,attack});}
 await reset(page);await play(page,180);await pad(-.6,0,true);await play(page,1);expect((await state(page)).dummy.clip).toBe('AttackS3S');
 await pad(0,0,false);await reset(page);await play(page,180);await pad(-1,0,false);await play(page,1);await pad(-1,0,true);await play(page,1);expect((await state(page)).dummy.clip).toBe('AttackDash');expect((await state(page)).player.state).toBe('idle');
});
