import {test,expect,type Page} from '@playwright/test';import {readFileSync} from 'node:fs';import {Simulation} from '../../src/simulation';import {Poses} from '../../src/pose';
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
const codes=['KeyA','KeyD','KeyW','KeyS','KeyF','KeyJ','KeyK','Space','ShiftLeft','ArrowLeft','ArrowRight','ArrowDown','BracketRight','Comma','Slash'];
async function play(p:Page,frames:number,keys:string[]=[]){await p.evaluate(({frames,keys,codes})=>{
 for(const code of codes)document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));
 for(let i=0;i<frames;i++){document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));const lab=(window as any).brawlLab;((window as any).__grabHashes??=new Map()).set(lab.snapshot().frame,lab.hash());}
},{frames,keys,codes});}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);}
async function reset(p:Page){if(!await p.evaluate(()=>(window as any).brawlLab.paused))await p.locator('#pause').click();await p.locator('#reset').click();}

test('all four fighters grab, pummel and use each directional throw through the main keyboard controls',async({page})=>{
 test.setTimeout(120000);const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});await ready(page);
 for(const [id,pummel,totals] of [['mario',3,[9,12,8,6]],['link',2,[7,7,7,7]],['kirby',1,[8,8,10,12]],['pikachu',2,[10,9,10,10]]] as const){
  await page.selectOption('#fighter-one',id);
  for(const [i,key] of ['KeyD','KeyA','KeyW','KeyS'].entries()){
   await reset(page);await play(page,6,['KeyD']);await play(page,20,['KeyF']);expect((await state(page)).hold.owner).toBe(0);await expect(page.locator('#grab-title')).toHaveText('CHOOSE YOUR THROW');
   await play(page,1,['KeyJ']);await play(page,35);expect((await state(page)).dummy.damage).toBe(pummel);await play(page,1,[key]);await expect(page.locator('#grab-title')).toContainText('THROW');
   for(let n=0;n<150;n++){if(!(await state(page)).hold)break;await play(page,1);}const s=await state(page);expect(s.hold).toBeNull();expect(s.dummy.damage,`${id} throw ${i}`).toBe(pummel+totals[i]);expect(s.lastHit.move).toBe(['ThrowF','ThrowB','ThrowHi','ThrowLw'][i]);
  }
 }
 expect(errors).toEqual([]);
});

test('P2 grabs through a shield with the keyboard, pummels and back throws with a gamepad, and resets cleanly',async({page})=>{
 await ready(page);await page.selectOption('#fighter-two','pikachu');await page.selectOption('#mode','local');await reset(page);await play(page,180);
 for(let n=0;n<40;n++){const s=await state(page);if(s.dummy.x-s.player.x<11)break;await play(page,5,['ArrowLeft']);}
 await play(page,20,['KeyK','BracketRight']);expect((await state(page)).hold.owner).toBe(1);await expect(page.locator('#grab-title')).toHaveText('GRABBED');
 async function pad(buttons:number[],axes=[0,0]){await page.evaluate(({buttons,axes})=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes,buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))}]}),{buttons,axes});}
 await pad([2]);await play(page,25);expect((await state(page)).player.damage).toBe(2);await pad([], [1,0]);await play(page,1);expect((await state(page)).dummy.clip).toBe('ThrowB');await pad([]);await play(page,31);const s=await state(page);expect(s.player.damage).toBe(11);expect(s.player.vx).toBeGreaterThan(0);expect(s.hold).toBeNull();
 await reset(page);expect((await state(page)).hold).toBeNull();expect((await state(page)).opponent.grab).toBeNull();await expect(page.locator('#grab-panel')).toBeHidden();
});

test('a Kirby up-throw recording matches every observed browser and Node state and the controls fit a phone',async({page})=>{
 await ready(page);await page.selectOption('#fighter-one','kirby');await page.locator('#record').click();await page.locator('#pause').click();await play(page,6,['KeyD']);await play(page,20,['KeyF']);await play(page,1,['KeyW']);await play(page,135);
 await page.locator('#record').click();const download=page.waitForEvent('download');await page.locator('#export').click();const tape=JSON.parse(readFileSync((await (await download).path())!,'utf8'));
 const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),k=load('kirby'),m=load('mario'),sim=new Simulation(k.data,k.poses,tape.options,m),hashes=new Map<number,string>(await page.evaluate(()=>[...(window as any).__grabHashes]));
 for(const input of tape.frames){sim.step(input);if(hashes.has(sim.frame))expect(sim.hash(),`Frame ${sim.frame}`).toBe(hashes.get(sim.frame));}expect(sim.hash()).toBe(tape.expectedHash);
 await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');await reset(page);await play(page,6,['KeyD']);await play(page,20,['KeyF']);await page.setViewportSize({width:390,height:844});await expect(page.locator('#grab-panel')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
