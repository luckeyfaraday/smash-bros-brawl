import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {Simulation} from '../../src/simulation';
import {Poses} from '../../src/pose';
import {SIMULATION_ID} from '../../src/types';

const state=(page:Page)=>page.evaluate(()=>(window as any).brawlLab.snapshot());
async function advance(page:Page,frames:number){
  await page.evaluate(n=>{for(let i=0;i<n;i++){
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyN',bubbles:true}));
  }},frames);
}
async function pauseAndReset(page:Page){
  if(!await page.evaluate(()=>(window as any).brawlLab.paused))await page.locator('#pause').click();
  await page.locator('#reset').click();
}

test('Mario CPU uses source scripts and its downloaded recording replays in Node and Chromium',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/lab.html');await page.waitForFunction(()=>(window as any).brawlLab?.ready);
  await page.selectOption('#mode','cpu');await pauseAndReset(page);
  await page.locator('#record').click();await page.locator('#pause').click();
  await advance(page,600);
  let current=await state(page);
  expect(current.cpu.engine).toBe('brawl-script-mario-v1');expect(current.cpu.error).toBe(null);
  expect(current.hits).toBeGreaterThan(0);
  const trace=await page.evaluate(()=>(window as any).brawlLab.cpuTrace());
  expect(trace.some((f:any)=>f.script!==null&&f.offsets.length>0)).toBe(true);
  await page.screenshot({path:'artifacts/build027-cpu-battle.png',fullPage:true});
  await page.locator('#record').click();
  const event=page.waitForEvent('download');await page.locator('#export').click();
  const download=await event,tape=JSON.parse(readFileSync((await download.path())!,'utf8'));
  expect(tape.simulation).toBe(SIMULATION_ID);expect(tape.options).toMatchObject({mode:'battle',opponent:'cpu'});
  const data=JSON.parse(readFileSync('public/assets/mario/data.json','utf8'));
  const poses=new Poses(JSON.parse(readFileSync('public/assets/mario/motion.json','utf8')));
  const replay=new Simulation(data,poses,tape.options);
  for(const input of tape.frames)replay.step(input,input.opponent);
  expect(replay.error).toBe(null);expect(replay.hash()).toBe(tape.expectedHash);
  await page.locator('#replay').click();await advance(page,tape.frames.length);
  await expect(page.locator('#replay-status')).toContainText('Replay verified');
  current=await state(page);expect(current.cpu).toEqual(replay.cpu!.snapshot());expect(errors).toEqual([]);
});

test('changing fighters and modes starts the appropriate CPU with fresh state on mobile',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/lab.html');await page.waitForFunction(()=>(window as any).brawlLab?.ready);
  expect((await state(page)).cpu).toBeUndefined();
  await page.selectOption('#mode','cpu');await pauseAndReset(page);await advance(page,400);
  expect((await state(page)).cpu).toMatchObject({engine:'brawl-script-mario-v1',error:null});
  expect(await page.evaluate(()=>(window as any).brawlLab.cpuTrace().some((f:any)=>f.offsets.length>0))).toBe(true);
  await page.selectOption('#fighter-two','link');await pauseAndReset(page);
  expect((await state(page)).cpu).toBeUndefined();
  await page.selectOption('#fighter-two','mario');await pauseAndReset(page);
  const fresh=await state(page);expect(fresh.cpu.vm).toBeNull();expect(fresh.cpu.pending).toBe(0);
  expect(fresh.match.stocks).toEqual([3,3]);
  await advance(page,420);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'artifacts/build027-cpu-phone.png',fullPage:true});
  await page.selectOption('#mode','training');await pauseAndReset(page);await advance(page,120);
  const training=await state(page);expect(training.cpu).toBeUndefined();expect(training.hits).toBe(0);
  await expect(page.locator('#opponent-label')).toHaveText('TRAINING DUMMY');
});
