import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function advance(p:Page,n=1){await p.evaluate(n=>{for(let i=0;i<n;i++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));},n);}
async function tap(p:Page,key:string){await p.keyboard.down(key);await advance(p);await p.keyboard.up(key);}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);}

test('Kirby five air jumps, rapid punches, release and exported replay work through the game controls',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);await page.selectOption('#fighter-one','kirby');
  await page.locator('#record').click();await page.locator('#pause').click();
  await expect(page.locator('#player-name')).toHaveText('KIRBY');await expect(page.locator('#move-label')).toHaveText('JAB 1 / 2');
  await expect(page.locator('#player-jumps i.available')).toHaveCount(5);
  await page.keyboard.down('Space');await advance(page,5);await page.keyboard.up('Space');
  for(let i=0;i<5;i++){await advance(page);await tap(page,'Space');await expect(page.locator('#player-jumps i.available')).toHaveCount(4-i);}
  expect((await state(page)).player.clip).toBe('JumpAerialF5');await expect(page.locator('#air-jumps')).toHaveText('0');
  await page.screenshot({path:'artifacts/kirby-five-jumps.png',fullPage:true});
  await advance(page);await tap(page,'Space');expect((await state(page)).player.jumps).toBe(6);
  await advance(page,150);expect((await state(page)).player.grounded).toBe(true);await expect(page.locator('#player-jumps i.available')).toHaveCount(5);
  await page.keyboard.down('KeyJ');await advance(page,60);
  expect((await state(page)).player.state).toBe('rapid');expect((await state(page)).dummy.damage).toBeGreaterThan(5);
  await expect(page.locator('#move-label')).toHaveText('RAPID JAB');
  await page.screenshot({path:'artifacts/kirby-rapid-browser.png',fullPage:true});
  await page.keyboard.up('KeyJ');await advance(page,35);expect((await state(page)).player.state).toBe('idle');
  await page.locator('#record').click();const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();
  const download=await downloadPromise,payload=readFileSync((await download.path())!,'utf8'),tape=JSON.parse(payload);
  expect(tape.options.fighters).toEqual(['kirby','mario']);
  const folder=mkdtempSync(join(tmpdir(),'brawl-kirby-replay-')),input=join(folder,'input.json'),output=join(folder,'trace.json');
  writeFileSync(input,payload);execFileSync(process.execPath,['--import','tsx','tools/trace_replay.ts',input,output]);
  expect(JSON.parse(readFileSync(output,'utf8')).matches).toBe(true);
  await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
  expect(errors).toEqual([]);
});

test('Kirby is playable in P2, mirrors and CPU matches, with selection and jumps visible on phone',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
  await ready(page);await page.selectOption('#fighter-one','kirby');await page.selectOption('#fighter-two','kirby');await page.selectOption('#mode','local');
  await page.locator('#pause').click();await page.locator('#reset').click();await advance(page,180);
  await page.screenshot({path:'artifacts/kirby-mirror-browser.png',fullPage:true});
  await page.keyboard.down('Enter');await advance(page,5);await page.keyboard.up('Enter');await advance(page);await tap(page,'Enter');
  expect((await state(page)).dummy.clip).toBe('JumpAerialF');await expect(page.locator('#dummy-jumps i.available')).toHaveCount(4);
  await page.locator('#hitboxes').check();await page.locator('#skeleton').check();await advance(page);
  await page.screenshot({path:'artifacts/kirby-bones-browser.png',fullPage:true});
  await page.locator('#hitboxes').uncheck();await page.locator('#skeleton').uncheck();
  await page.selectOption('#fighter-one','link');await page.selectOption('#mode','cpu');
  await page.locator('#pause').click();await page.locator('#reset').click();await advance(page,11000);
  expect((await state(page)).match.status).toBe('finished');await expect(page.locator('#rematch')).toBeVisible();
  await page.locator('#rematch').click();expect((await state(page)).match.options.fighters).toEqual(['link','kirby']);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'artifacts/kirby-selection-phone.png',fullPage:true});
  await page.selectOption('#fighter-one','kirby');await expect(page.locator('#player-name')).toHaveText('KIRBY');
  expect(errors).toEqual([]);
});
