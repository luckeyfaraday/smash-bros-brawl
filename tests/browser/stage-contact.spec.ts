import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import route from '../fixtures/kirby-stage-route.json' with {type:'json'};
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function keys(p:Page,steps:typeof route.steps){await p.evaluate(steps=>{
  const tracked=['KeyA','KeyD','ShiftLeft','KeyS','Space'];
  for(const step of steps){
    for(const code of tracked)document.dispatchEvent(new KeyboardEvent(step.keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));
    for(let i=0;i<step.frames;i++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));
  }
  for(const code of tracked)document.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
},steps);}

test('Kirby hits the underside, clears the stage, returns by the ledge and replays the complete route',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
  await page.goto('/lab.html');await page.waitForFunction(()=>(window as any).brawlLab?.ready);
  await page.selectOption('#fighter-one','kirby');await page.locator('#record').click();await page.locator('#pause').click();
  await keys(page,route.steps.slice(0,4));
  const blocked=await state(page),contacts=await page.evaluate(()=>(window as any).brawlLab.stageContacts[0]);
  expect(contacts.map((c:any)=>c.type)).toEqual(['RightWall','Ceiling']);
  expect(blocked.player.y).toBeLessThan(-40);expect(blocked.player.grounded).toBe(false);expect(blocked.player.vy).toBe(0);
  expect(blocked.player.jumps).toBe(2);await expect(page.locator('#player-jumps i.available')).toHaveCount(4);
  await page.screenshot({path:'artifacts/stage-contact-browser.png',fullPage:true});
  await page.locator('#stage-outline').check();await page.screenshot({path:'artifacts/stage-boundaries-browser.png',fullPage:true});await page.locator('#stage-outline').uncheck();
  await keys(page,route.steps.slice(4));const returned=await state(page);
  expect(returned.player.grounded).toBe(true);expect(returned.player.x).toBeLessThan(86.876);expect(returned.player.x).toBeGreaterThan(75);
  expect(returned.player.ledgeSide).toBe(0);await expect(page.locator('#player-jumps i.available')).toHaveCount(5);
  await page.screenshot({path:'artifacts/stage-return-browser.png',fullPage:true});
  await page.locator('#record').click();const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();
  const download=await downloadPromise,payload=readFileSync((await download.path())!,'utf8');
  const folder=mkdtempSync(join(tmpdir(),'brawl-stage-replay-')),input=join(folder,'input.json'),output=join(folder,'trace.json');
  writeFileSync(input,payload);execFileSync(process.execPath,['--import','tsx','tools/trace_replay.ts',input,output]);
  expect(JSON.parse(readFileSync(output,'utf8')).matches).toBe(true);
  await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
  await page.setViewportSize({width:390,height:844});await page.locator('#stage-outline').check();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'artifacts/stage-boundaries-phone.png',fullPage:true});expect(errors).toEqual([]);
});
