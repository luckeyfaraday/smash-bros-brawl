import {test,expect,type Page} from '@playwright/test';import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import route from '../fixtures/quick-attack-route.json' with {type:'json'};
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function advance(p:Page,n=1){await p.evaluate(n=>{for(let i=0;i<n;i++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));},n);}
async function play(p:Page,steps:typeof route.steps){await p.evaluate(steps=>{const codes=['KeyW','KeyA','KeyS','KeyD','KeyI','ShiftLeft'];for(const step of steps){for(const code of codes)document.dispatchEvent(new KeyboardEvent(step.keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));for(let n=0;n<step.frames;n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));}for(const code of codes)document.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));},steps);}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);}

test('Pikachu aims two Quick Attack bursts, returns from offstage and replays the vertical inputs',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
 await ready(page);await page.selectOption('#fighter-one','pikachu');await page.locator('#record').click();await page.locator('#pause').click();
 await play(page,route.steps.slice(0,1));expect((await state(page)).player.y).toBeLessThan(-30);
 await play(page,route.steps.slice(1,3));const first=await state(page);expect(first.quickAttack.burst).toBe(1);expect(first.quickAttack.direction).toEqual({x:0,y:1});expect(first.player.y).toBeGreaterThan(8);
 await expect(page.locator('#quick-title')).toHaveText('Burst 1 / 2');await expect(page.locator('#quick-direction')).toHaveText('↑');
 await play(page,route.steps.slice(3,4));await expect(page.locator('#quick-title')).toHaveText('Change direction for burst two');
 await page.screenshot({path:'artifacts/quick-window-browser.png',fullPage:true});
 await play(page,route.steps.slice(4,5));const second=await state(page);expect(second.quickAttack.burst).toBe(2);expect(second.quickAttack.direction).toEqual({x:-1,y:0});
 await expect(page.locator('#quick-title')).toHaveText('Burst 2 / 2');await expect(page.locator('#quick-direction')).toHaveText('←');
 await page.screenshot({path:'artifacts/quick-second-browser.png',fullPage:true});
 await play(page,route.steps.slice(5));const returned=await state(page);expect(returned.player.grounded).toBe(true);expect(returned.player.x).toBeLessThan(86.876);expect(returned.quickAttack).toBeNull();await expect(page.locator('#quick-panel')).toBeHidden();
 await page.locator('#record').click();const pending=page.waitForEvent('download');await page.locator('#export').click();const file=await pending,payload=readFileSync((await file.path())!,'utf8'),tape=JSON.parse(payload);
 expect(tape.frames.some((i:any)=>i.vertical===1)).toBe(true);expect(tape.frames.some((i:any)=>i.vertical===-1)).toBe(true);
 const folder=mkdtempSync(join(tmpdir(),'brawl-quick-')),input=join(folder,'input.json'),output=join(folder,'trace.json');writeFileSync(input,payload);execFileSync(process.execPath,['--import','tsx','tools/trace_replay.ts',input,output]);expect(JSON.parse(readFileSync(output,'utf8')).matches).toBe(true);
 await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');expect(errors).toEqual([]);
});

test('holding the same direction ends after one burst and the aiming panel fits a phone',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await ready(page);await page.selectOption('#fighter-one','pikachu');await page.locator('#pause').click();await page.locator('#reset').click();
 await play(page,[{frames:1,keys:['KeyI','KeyW']},{frames:34,keys:['KeyW']}]);const end=await state(page);
 expect(end.quickAttack.phase).toBe('end');expect(end.quickAttack.burst).toBe(1);await expect(page.locator('#quick-title')).toHaveText('Catch a ledge or prepare to land');
 await advance(page,80);expect((await state(page)).player.grounded).toBe(true);expect((await state(page)).quickAttack).toBeNull();
 await page.locator('#reset').click();await play(page,[{frames:1,keys:['KeyI','KeyW','KeyD']},{frames:15,keys:['KeyW','KeyD']}]);
 expect((await state(page)).quickAttack.direction.x).toBeCloseTo(Math.SQRT1_2);await expect(page.locator('#quick-direction')).toHaveText('↗');
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);await page.screenshot({path:'artifacts/quick-panel-phone.png',fullPage:true});expect(errors).toEqual([]);
});

test('P2 arrow aiming and analogue gamepad B control the two bursts independently of P1',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await ready(page);await page.selectOption('#fighter-two','pikachu');await page.selectOption('#mode','local');await page.locator('#pause').click();await page.locator('#reset').click();await advance(page,180);
 await page.keyboard.down('ArrowLeft');await page.keyboard.down('Semicolon');await advance(page,16);await page.keyboard.up('Semicolon');await page.keyboard.up('ArrowLeft');
 let snap=await state(page);expect(snap.opponent.quickAttack.direction).toEqual({x:-1,y:0});expect(snap.quickAttack).toBeNull();expect(snap.player.state).toBe('idle');
 await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[.4,-.8],buttons:Array.from({length:17},(_,i)=>({pressed:i===1,value:i===1?1:0}))}]}));
 await advance(page,19);snap=await state(page);expect(snap.opponent.quickAttack.burst).toBe(2);expect(snap.opponent.quickAttack.direction.x).toBeCloseTo(.4/Math.sqrt(.8));expect(snap.opponent.quickAttack.direction.y).toBeCloseTo(.8/Math.sqrt(.8));expect(snap.quickAttack).toBeNull();
 await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]}));
 await page.locator('#reset').click();await advance(page,180);
 await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[0,-1],buttons:Array.from({length:17},(_,i)=>({pressed:i===1,value:i===1?1:0}))}]}));
 await advance(page,16);expect((await state(page)).opponent.quickAttack.direction).toEqual({x:0,y:1});expect(errors).toEqual([]);
});
