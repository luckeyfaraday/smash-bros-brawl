import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function advance(p:Page,n=1){await p.evaluate(n=>{for(let i=0;i<n;i++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));},n);}
async function tap(p:Page,key:string){await p.keyboard.down(key);await advance(p);await p.keyboard.up(key);}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);}

test('Pikachu selection, repeating jab, smash wind-up, aerial and exported replay work in the main game',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);await page.selectOption('#fighter-one','pikachu');await page.locator('#pause').click();await page.locator('#reset').click();
  await expect(page.locator('#player-name')).toHaveText('PIKACHU');await expect(page.locator('#move-label')).toHaveText('REPEATING HEADBUTT');
  await expect(page.locator('#player-jumps')).toBeHidden();
  await page.keyboard.down('KeyJ');await advance(page,75);await page.keyboard.up('KeyJ');
  expect((await state(page)).hits).toBeGreaterThanOrEqual(2);await advance(page,30);expect((await state(page)).player.state).toBe('idle');
  await page.locator('#record').click();await page.locator('#pause').click();
  await tap(page,'KeyL');await advance(page,13);expect((await state(page)).hits).toBe(0);
  await expect(page.locator('#move-label')).toHaveText('SMASH WIND-UP');
  await advance(page,6);expect((await state(page)).lastHit.damage).toBe(20);
  await expect(page.locator('#move-label')).toHaveText('FORWARD SMASH');
  await page.screenshot({path:'artifacts/pikachu-smash-browser.png',fullPage:true});
  await advance(page,90);await page.keyboard.down('Space');await advance(page,5);await page.keyboard.up('Space');
  await advance(page);await tap(page,'Space');expect((await state(page)).player.jumps).toBe(2);await expect(page.locator('#air-jumps')).toHaveText('0');
  await advance(page);await tap(page,'KeyJ');await advance(page,2);expect((await state(page)).player.clip).toBe('AttackAirN');
  await page.screenshot({path:'artifacts/pikachu-aerial-browser.png',fullPage:true});await advance(page,120);
  await page.locator('#record').click();const downloadPromise=page.waitForEvent('download');await page.locator('#export').click();
  const download=await downloadPromise,payload=readFileSync((await download.path())!,'utf8'),tape=JSON.parse(payload);
  expect(tape.options.fighters).toEqual(['pikachu','mario']);
  const folder=mkdtempSync(join(tmpdir(),'brawl-pikachu-replay-')),input=join(folder,'input.json'),output=join(folder,'trace.json');
  writeFileSync(input,payload);execFileSync(process.execPath,['--import','tsx','tools/trace_replay.ts',input,output]);
  expect(JSON.parse(readFileSync(output,'utf8')).matches).toBe(true);
  await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');expect(errors).toEqual([]);
});

test('Pikachu can be P2 or CPU, uses an alternate costume in mirrors and stays selectable on phone',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
  await ready(page);await page.selectOption('#fighter-one','pikachu');await page.selectOption('#fighter-two','pikachu');await page.selectOption('#mode','local');
  await page.locator('#pause').click();await page.locator('#reset').click();await advance(page,180);
  await page.screenshot({path:'artifacts/pikachu-mirror-browser.png',fullPage:true});
  await page.keyboard.down('ArrowLeft');await page.keyboard.down('ShiftRight');await advance(page,60);await page.keyboard.up('ArrowLeft');await page.keyboard.up('ShiftRight');
  await page.keyboard.down('Slash');await advance(page,40);await page.keyboard.up('Slash');
  expect((await state(page)).player.damage).toBeGreaterThan(0);expect((await state(page)).lastHit.attacker).toBe(1);
  await advance(page,30);await page.keyboard.down('Enter');await advance(page,5);await page.keyboard.up('Enter');await advance(page);await tap(page,'Enter');
  expect((await state(page)).dummy.jumps).toBe(2);
  await page.locator('#hitboxes').check();await page.locator('#skeleton').check();await advance(page);
  await page.screenshot({path:'artifacts/pikachu-bones-browser.png',fullPage:true});
  await page.locator('#hitboxes').uncheck();await page.locator('#skeleton').uncheck();
  await page.selectOption('#fighter-one','kirby');await page.selectOption('#mode','cpu');
  await page.locator('#pause').click();await page.locator('#reset').click();await advance(page,11000);
  expect((await state(page)).match.status).toBe('finished');await expect(page.locator('#rematch')).toBeVisible();
  await page.locator('#rematch').click();expect((await state(page)).match.options.fighters).toEqual(['kirby','pikachu']);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.selectOption('#fighter-one','pikachu');await expect(page.locator('#player-name')).toHaveText('PIKACHU');
  await page.screenshot({path:'artifacts/pikachu-selection-phone.png',fullPage:true});expect(errors).toEqual([]);
});
