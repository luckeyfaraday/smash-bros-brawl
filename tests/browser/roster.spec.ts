import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function advance(page:Page,count=1){await page.evaluate(n=>{for(let i=0;i<n;i++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));},count);}
async function load(page:Page){await page.goto('/lab.html');await page.waitForFunction(()=>(window as any).brawlLab?.ready);}
async function tap(page:Page,key:string){await page.keyboard.down(key);await advance(page);await page.keyboard.up(key);}

test('Link selection changes the playable fighter, sword combo, follow-up slash and exported mixed-fighter replay',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await load(page);await page.selectOption('#fighter-one','link');
  await page.locator('#pause').click();await page.locator('#reset').click();
  await expect(page.locator('#player-name')).toHaveText('LINK');await expect(page.locator('#dummy-name')).toHaveText('MARIO');
  await expect(page.locator('#move-summary')).toContainText('4% damage · active 6–7');
  await tap(page,'KeyJ');await advance(page);await tap(page,'KeyJ');await advance(page,15);await tap(page,'KeyJ');await advance(page,26);
  expect((await state(page)).dummy.damage).toBe(12);
  await page.locator('#record').click();await page.locator('#pause').click();
  await expect(page.locator('#fighter-one')).toBeDisabled();await expect(page.locator('#fighter-two')).toBeDisabled();
  await tap(page,'KeyL');await advance(page,11);await tap(page,'KeyL');await advance(page,29);
  const hit=await state(page);expect(hit.lastHit.move).toBe('AttackS4S2');expect(hit.dummy.damage).toBe(32);
  await expect(page.locator('#move-label')).toHaveText('SMASH FOLLOW-UP');
  await page.screenshot({path:'artifacts/link-followup-browser.png',fullPage:true});
  await page.locator('#record').click();const done=page.waitForEvent('download');await page.locator('#export').click();
  const download=await done,payload=readFileSync((await download.path())!,'utf8'),tape=JSON.parse(payload);
  expect(tape.options.fighters).toEqual(['link','mario']);expect(tape.sources[0].sha256).not.toBe(tape.sources[1].sha256);
  const folder=mkdtempSync(join(tmpdir(),'brawl-link-replay-')),input=join(folder,'inputs.json'),output=join(folder,'trace.json');
  writeFileSync(input,payload);execFileSync(process.execPath,['--import','tsx','tools/trace_replay.ts',input,output]);
  expect(JSON.parse(readFileSync(output,'utf8')).matches).toBe(true);
  await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
  expect((await state(page)).match.options.fighters).toEqual(['link','mario']);
  await page.selectOption('#fighter-one','mario');await expect(page.locator('#player-name')).toHaveText('MARIO');
  await expect(page.locator('#move-summary')).toContainText('3% damage');await expect(page.locator('#replay')).toBeDisabled();
  expect(errors).toEqual([]);
});

test('Link works in player two, mirror costumes, CPU results, rematches and the phone layout',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await load(page);await page.selectOption('#fighter-two','link');await page.selectOption('#mode','local');
  await page.locator('#pause').click();await page.locator('#reset').click();await advance(page,180);
  await expect(page.locator('#dummy-name')).toHaveText('LINK');await tap(page,'Period');await advance(page,11);await tap(page,'Period');await advance(page,12);
  expect((await state(page)).dummy.clip).toBe('AttackS4S2');
  await page.selectOption('#fighter-one','link');await page.locator('#pause').click();await page.locator('#reset').click();
  await advance(page,180);await page.screenshot({path:'artifacts/link-mirror.png',fullPage:true});
  await page.locator('#hitboxes').check();await page.locator('#skeleton').check();await advance(page);
  await page.screenshot({path:'artifacts/link-mirror-collision.png',fullPage:true});
  await page.locator('#hitboxes').uncheck();await page.locator('#skeleton').uncheck();
  await page.selectOption('#fighter-one','mario');await page.selectOption('#mode','cpu');
  await page.locator('#pause').click();await page.locator('#reset').click();await advance(page,3000);
  expect((await state(page)).match.winner).toBe(1);await expect(page.locator('#match-title')).toHaveText('CPU WINS');
  await page.locator('#rematch').click();expect((await state(page)).match.options.fighters).toEqual(['mario','link']);
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'artifacts/link-selection-phone.png',fullPage:true});
  await page.selectOption('#fighter-one','link');await expect(page.locator('#player-name')).toHaveText('LINK');
  expect(errors).toEqual([]);
});
