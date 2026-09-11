import {test,expect,type Page} from '@playwright/test';import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import route from '../fixtures/cutter-route.json' with {type:'json'};
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(p:Page,frames:number,keys:string[]=[]){await p.evaluate(({frames,keys})=>{for(const code of ['KeyI','KeyA','KeyD','KeyS','ShiftLeft'])document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));for(let n=0;n<frames;n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));}, {frames,keys});}
async function until(p:Page,phase:string,age=0){await p.evaluate(({phase,age})=>{for(let n=0;n<180;n++){const s=(window as any).brawlLab.snapshot();if(s.cutter?.phase===phase&&s.player.age>=age)return;document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));}throw Error(`Did not reach Cutter ${phase}`);},{phase,age});}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);}
async function verifyExport(p:Page){await p.locator('#record').click();const download=p.waitForEvent('download');await p.locator('#export').click();const result=await download,payload=readFileSync((await result.path())!,'utf8');const folder=mkdtempSync(join(tmpdir(),'brawl-cutter-')),input=join(folder,'input.json'),output=join(folder,'trace.json');writeFileSync(input,payload);execFileSync(process.execPath,['--import','tsx','tools/trace_replay.ts',input,output]);expect(JSON.parse(readFileSync(output,'utf8')).matches).toBe(true);await p.locator('#replay').click();await expect(p.locator('#replay-status')).toContainText('Replay verified');}

test('Kirby Final Cutter rises, lands, sends its original wave and replays projectile hits',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
 await ready(page);await page.selectOption('#fighter-one','kirby');await page.locator('#record').click();await page.locator('#pause').click();
 await play(page,40,['KeyA']);await play(page,1,['KeyD']);await play(page,1,['KeyI']);await expect(page.locator('#cutter-title')).toHaveText('Draw the blade');
 await play(page,1);await until(page,'arc',6);await expect(page.locator('#cutter-title')).toHaveText('Rising slash');expect((await state(page)).player.y).toBeGreaterThan(45);
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:'artifacts/cutter-panel-phone.png',fullPage:true});await page.setViewportSize({width:1440,height:1100});
 await until(page,'arc',27);await expect(page.locator('#cutter-title')).toHaveText('Downward strike');await until(page,'land');expect((await state(page)).waves).toHaveLength(1);await expect(page.locator('#cutter-title')).toHaveText('Send the wave');await play(page,3);await page.screenshot({path:'artifacts/cutter-wave-browser.png',fullPage:true});
 await play(page,45);const end=await state(page);expect(end.lastHit.move).toBe('FinalCutterRegular');expect(end.dummy.damage).toBe(6);expect(end.waves).toHaveLength(0);expect(end.cutter).toBeNull();expect(end.player.state).toBe('idle');await expect(page.locator('#cutter-panel')).toBeHidden();
 await verifyExport(page);expect(errors).toEqual([]);
});

test('Kirby recovers from below Final Destination, catches and climbs the ledge through keyboard input',async({page})=>{
 await ready(page);await page.selectOption('#fighter-one','kirby');await page.locator('#record').click();await page.locator('#pause').click();
 await play(page,route.steps[0].frames,route.steps[0].keys);expect((await state(page)).player.y).toBeLessThan(-25);
 for(const part of route.steps.slice(1,3))await play(page,part.frames,part.keys);
 const caught=await state(page);expect(caught.player.state).toBe('ledgeCatch');expect(caught.cutter).toBeNull();expect(caught.waves).toHaveLength(0);await expect(page.locator('#ledge-title')).toHaveText('Caught the edge');
 for(const part of route.steps.slice(3))await play(page,part.frames,part.keys);
 const end=await state(page);expect(end.player.grounded).toBe(true);expect(end.player.ledgeSide).toBe(0);expect(end.player.jumps).toBe(0);await verifyExport(page);
});

test('P2 semicolon and gamepad B start Final Cutter independently of P1',async({page})=>{
 await ready(page);await page.selectOption('#fighter-two','kirby');await page.selectOption('#mode','local');await page.locator('#pause').click();await page.locator('#reset').click();await play(page,180);
 await page.keyboard.down('Semicolon');await play(page,1);await page.keyboard.up('Semicolon');expect((await state(page)).opponent.cutter.phase).toBe('start');expect((await state(page)).cutter).toBeNull();
 await page.keyboard.down('ArrowLeft');await play(page,29);await page.keyboard.up('ArrowLeft');const arc=await state(page);expect(arc.opponent.cutter.phase).toBe('arc');expect(arc.dummy.y).toBeGreaterThan(45);expect(arc.dummy.x).toBeLessThan(60);expect(arc.player.state).toBe('idle');
 await page.locator('#reset').click();await play(page,180);await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[-1,0],buttons:Array.from({length:17},(_,i)=>({pressed:i===1,value:i===1?1:0}))}]}));
 await play(page,30);const pad=await state(page);expect(pad.opponent.cutter.phase).toBe('arc');expect(pad.dummy.y).toBeGreaterThan(45);expect(pad.dummy.facing).toBe(-1);expect(pad.cutter).toBeNull();
});
