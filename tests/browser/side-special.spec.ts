import {test,expect,type Page} from '@playwright/test';import {readFileSync} from 'node:fs';import {Simulation} from '../../src/simulation';import {Poses} from '../../src/pose';
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
const codes=['KeyA','KeyD','KeyW','KeyS','KeyO','KeyU','KeyK','Space','ArrowLeft','ArrowRight','BracketLeft','Quote','Comma'];
async function play(p:Page,frames:number,keys:string[]=[]){await p.evaluate(({frames,keys,codes})=>{
 for(const code of codes)document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));
 for(let i=0;i<frames;i++){document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));const lab=(window as any).brawlLab;((window as any).__sideHashes??=new Map()).set(lab.snapshot().frame,lab.hash());}
},{frames,keys,codes});}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);}
async function reset(p:Page){if(!await p.evaluate(()=>(window as any).brawlLab.paused))await p.locator('#pause').click();await p.locator('#reset').click();await p.evaluate(()=>(window as any).__sideHashes=new Map());}

test('the main keyboard controls play all four side specials with visible guidance, including air Hammer and full Skull Bash charge',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});await ready(page);
 for(const [id,name,damage] of [['mario','CAPE',8],['link','GALE BOOMERANG',5],['kirby','HAMMER',23],['pikachu','SKULL BASH',25]] as const){
  await page.selectOption('#fighter-one',id);await reset(page);await play(page,id==='pikachu'?134:id==='link'?36:30,['KeyO']);await expect(page.locator('#side-title')).toHaveText(name);await expect(page.locator('#side-panel')).toBeVisible();
  if(id==='pikachu')await play(page,23);expect((await state(page)).dummy.damage).toBeCloseTo(damage);
  if(id==='link'){await play(page,70);expect((await state(page)).boomerangs).toHaveLength(0);}
  if(id==='kirby'){await reset(page);await play(page,14,['Space']);await play(page,34,['KeyO']);expect((await state(page)).player.clip).toBe('SpecialAirS');}
  await reset(page);expect((await state(page)).side).toBeNull();await expect(page.locator('#side-panel')).toBeHidden();
 }
 expect(errors).toEqual([]);
});
test('Mario reflects an opponent’s fireball through actual controls; P2 keyboard and D-pad select side specials',async({page})=>{
 await ready(page);await page.selectOption('#mode','local');await reset(page);await play(page,180);await play(page,25,['KeyD','ArrowLeft']);await play(page,18,['Quote']);
 for(let n=0;n<60;n++){const s=await state(page),p=s.projectiles[0];if(p&&p.x-s.player.x<27)break;await play(page,1);}
 await play(page,18,['KeyO']);let s=await state(page);expect(s.projectiles.some((p:any)=>p.owner===0&&p.reflection.count===1)||s.dummy.damage>0).toBe(true);expect(s.player.damage).toBe(0);await play(page,55);expect((await state(page)).dummy.damage).toBeGreaterThan(0);
 await page.selectOption('#fighter-two','link');await reset(page);await play(page,180);await play(page,1,['BracketLeft']);expect((await state(page)).opponent.side.kind).toBe('boomerang');
 await reset(page);await play(page,180);await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:i===14,value:i===14?1:0}))}]}));await play(page,27);s=await state(page);expect(s.opponent.side.kind).toBe('boomerang');expect(s.dummy.facing).toBe(-1);expect(s.boomerangs[0].owner).toBe(1);
});
test('side-special recordings match every observed browser and Node frame for all four fighters',async({page})=>{
 await ready(page);const load=(id:string)=>({data:JSON.parse(readFileSync(`public/assets/${id}/data.json`,'utf8')),poses:new Poses(JSON.parse(readFileSync(`public/assets/${id}/motion.json`,'utf8')))}),m=load('mario');
 for(const id of ['mario','link','kirby','pikachu']){
  await page.selectOption('#fighter-one',id);await reset(page);await page.locator('#record').click();if(!await page.evaluate(()=>(window as any).brawlLab.paused))await page.locator('#pause').click();await play(page,id==='pikachu'?80:35,['KeyO']);await play(page,150);
  await page.locator('#record').click();const download=page.waitForEvent('download');await page.locator('#export').click();const tape=JSON.parse(readFileSync((await (await download).path())!,'utf8')),a=load(id),sim=new Simulation(a.data,a.poses,tape.options,m),hashes=new Map<number,string>(await page.evaluate(()=>[...(window as any).__sideHashes]));
  for(const input of tape.frames){sim.step(input);if(hashes.has(sim.frame))expect(sim.hash(),`${id} frame ${sim.frame}`).toBe(hashes.get(sim.frame));}expect(sim.hash()).toBe(tape.expectedHash);
  await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
 }
 await reset(page);await play(page,70,['KeyO']);await page.setViewportSize({width:390,height:844});await expect(page.locator('#side-panel')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
