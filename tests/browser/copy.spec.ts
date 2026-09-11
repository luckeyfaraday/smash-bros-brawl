import {test,expect,type Page} from '@playwright/test';import {readFileSync} from 'node:fs';
import {Simulation} from '../../src/simulation';import {Poses} from '../../src/pose';
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(p:Page,frames:number,keys:string[]=[]){await p.evaluate(({frames,keys})=>{
 for(const code of ['KeyA','KeyD','KeyS','KeyU','KeyJ','KeyK','Space','Quote','ArrowLeft','ArrowDown'])document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));
 for(let i=0;i<frames;i++){document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));const lab=(window as any).brawlLab;((window as any).__copyHashes??=new Map()).set(lab.snapshot().frame,lab.hash());}
},{frames,keys});}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);await p.selectOption('#fighter-one','kirby');}
async function reset(p:Page){if(!await p.evaluate(()=>(window as any).brawlLab.paused))await p.locator('#pause').click();await p.locator('#reset').click();}

test('Kirby copies all three fighters through Down, uses their moves, and can discard the ability through shield plus U',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});await ready(page);
 for(const [id,ability,damage] of [['mario','FIREBALL',11],['link','BOW',18],['pikachu','THUNDER JOLT',12]] as const){
  await page.selectOption('#fighter-two',id);await reset(page);await play(page,55,['KeyU']);await play(page,7,['KeyS']);expect((await state(page)).copied).toBeNull();await play(page,1,['KeyS']);expect((await state(page)).copied).toBe(id);expect((await state(page)).dummy.damage).toBe(6);
  await expect(page.locator('#copy-title')).toHaveText(`${ability} COPIED`);await expect(page.locator('#player-copy')).toContainText('copy');await expect(page.locator('#inhale-title')).toHaveText('SWALLOW AND COPY');
  await play(page,25);await play(page,1,['KeyA']);await play(page,id==='link'?61:19,['KeyU']);expect((await state(page)).player.clip).toContain('Copy');await play(page,60);expect((await state(page)).dummy.damage).toBe(damage);
  await play(page,1,['KeyK','KeyU']);expect((await state(page)).copied).toBeNull();await expect(page.locator('#copy-panel')).toBeHidden();await expect(page.locator('#player-copy')).toBeHidden();await play(page,1);await play(page,1,['KeyU']);expect((await state(page)).player.clip).toBe('SpecialNStart');
 }
 expect(errors).toEqual([]);
});

test('a copied bow recording preserves the copied ability and aerial draw across browser and Node replay',async({page})=>{
 await ready(page);await page.selectOption('#fighter-two','link');await page.locator('#record').click();await page.locator('#pause').click();
 await play(page,55,['KeyU']);await play(page,8,['KeyS']);await play(page,25);await play(page,6,['Space','KeyA']);expect((await state(page)).player.state).toBe('air');await play(page,65,['KeyU']);expect((await state(page)).copied).toBe('link');expect((await state(page)).ranged.phase).toBe('hold');await play(page,45);
 await page.locator('#record').click();const download=page.waitForEvent('download');await page.locator('#export').click();const tape=JSON.parse(readFileSync((await (await download).path())!,'utf8'));
 const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),k=load('kirby'),l=load('link'),sim=new Simulation(k.data,k.poses,tape.options,l),hashes=new Map<number,string>(await page.evaluate(()=>[...(window as any).__copyHashes]));
 expect(hashes.size).toBeGreaterThan(190);for(const input of tape.frames){sim.step(input);if(hashes.has(sim.frame))expect(sim.hash(),`Frame ${sim.frame}`).toBe(hashes.get(sim.frame));}expect(sim.hash()).toBe(tape.expectedHash);
 await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');await page.setViewportSize({width:390,height:844});await expect(page.locator('#copy-panel')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});

test('P2 can copy with the keyboard and use or discard the copied move with a standard gamepad',async({page})=>{
 await ready(page);await page.selectOption('#fighter-one','mario');await page.selectOption('#fighter-two','kirby');await page.selectOption('#mode','local');await reset(page);await play(page,180);
 for(let n=0;n<30;n++){const s=await state(page);if(s.dummy.x-s.player.x<15)break;await play(page,5,['ArrowLeft']);}
 await play(page,55,['Quote']);await play(page,8,['ArrowDown']);await play(page,25);expect((await state(page)).opponent.copied).toBe('mario');expect((await state(page)).copied).toBeNull();await expect(page.locator('#dummy-copy')).toHaveText('Mario copy');
 async function pad(buttons:number[]){await page.evaluate(buttons=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:buttons.includes(i),value:buttons.includes(i)?1:0}))}]}),buttons);}
 await pad([5]);await play(page,14);expect((await state(page)).projectiles[0]).toMatchObject({owner:1,kind:'fireball'});expect((await state(page)).dummy.clip).toBe('CopyMarioSpecialN');
 await pad([]);await play(page,40);await pad([5,6]);await play(page,1);expect((await state(page)).opponent.copied).toBeNull();await expect(page.locator('#dummy-copy')).toBeHidden();
 await pad([]);await reset(page);expect((await state(page)).opponent.copied).toBeNull();
});
