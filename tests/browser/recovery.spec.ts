import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import routes from '../fixtures/recovery-routes.json' with {type:'json'};
const state=(p:Page)=>p.evaluate(()=>(window as any).brawlLab.snapshot());
async function advance(p:Page,n=1){await p.evaluate(n=>{for(let i=0;i<n;i++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));},n);}
async function play(p:Page,steps:{frames:number;keys:string[]}[]){await p.evaluate(steps=>{
 const codes=['KeyD','KeyA','KeyI','KeyS','ShiftLeft','KeyJ','Space'];
 for(const step of steps){for(const code of codes)document.dispatchEvent(new KeyboardEvent(step.keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));for(let n=0;n<step.frames;n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));}
 for(const code of codes)document.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
},steps);}
async function ready(p:Page){await p.goto('/lab.html');await p.waitForFunction(()=>(window as any).brawlLab?.ready);}
async function replay(p:Page){
 await p.locator('#record').click();const downloadPromise=p.waitForEvent('download');await p.locator('#export').click();
 const download=await downloadPromise,payload=readFileSync((await download.path())!,'utf8'),tape=JSON.parse(payload);
 expect(tape.frames.some((i:any)=>i.special)).toBe(true);
 const folder=mkdtempSync(join(tmpdir(),'brawl-recovery-')),input=join(folder,'input.json'),output=join(folder,'trace.json');
 writeFileSync(input,payload);execFileSync(process.execPath,['--import','tsx','tools/trace_replay.ts',input,output]);
 expect(JSON.parse(readFileSync(output,'utf8')).matches).toBe(true);
 await p.locator('#replay').click();await expect(p.locator('#replay-status')).toContainText('Replay verified');
}

test('Mario Super Jump Punch is playable from I, hits through the rise and replays through helpless fall',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await ready(page);await page.locator('#record').click();await page.locator('#pause').click();
 await play(page,[{frames:8,keys:['KeyD']},{frames:1,keys:['KeyI']},{frames:25,keys:[]}]);
 const rising=await state(page);expect(rising.player.state).toBe('special');expect(rising.hits).toBeGreaterThan(1);expect(rising.player.y).toBeGreaterThan(20);
 await expect(page.locator('#move-label')).toHaveText('SUPER JUMP PUNCH');await page.screenshot({path:'artifacts/recovery-punch-browser.png',fullPage:true});
 // Each connected pulse adds hitlag. Advance until the animation actually ends,
 // with a bounded deadline, instead of assuming elapsed ticks equal move age.
 await page.evaluate(()=>{for(let n=0;n<60&&(window as any).brawlLab.snapshot().player.state==='special';n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));});
 expect((await state(page)).player.state).toBe('fallSpecial');
 await play(page,[{frames:1,keys:['KeyI','KeyJ','Space']},{frames:1,keys:[]},{frames:1,keys:['KeyI','KeyJ','Space']}]);
 expect((await state(page)).player.state).toBe('fallSpecial');await expect(page.locator('#combo-status')).toContainText('Recovery spent');
 await replay(page);expect(errors).toEqual([]);
});

for(const id of ['mario','link'] as const)test(`${id} rises from below Final Destination and returns using the main controls`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(r.url());});
 await ready(page);await page.selectOption('#fighter-one',id);await page.locator('#record').click();await page.locator('#pause').click();
 const route=routes.fighters[id];await play(page,route.steps.slice(0,1));const below=await state(page);
 expect(below.player.x).toBeGreaterThan(100);expect(below.player.y).toBeLessThan(-29);
 await play(page,[route.steps[1],{frames:15,keys:['KeyA']}]);const rising=await state(page);
 expect(rising.player.clip).toBe('SpecialAirHi');expect(rising.player.y).toBeGreaterThan(below.player.y+20);
 await expect(page.locator('#move-label')).toHaveText(id==='mario'?'SUPER JUMP PUNCH':'SPIN ATTACK');
 await page.screenshot({path:`artifacts/${id}-recovery-browser.png`,fullPage:true});
 await play(page,[{frames:route.steps[2].frames-15,keys:route.steps[2].keys}]);
 if(id==='link'){expect((await state(page)).player.state).toBe('ledgeCatch');await expect(page.locator('#ledge-title')).toHaveText('Caught the edge');}
 await play(page,route.steps.slice(3));const returned=await state(page);
 expect(returned.player.grounded).toBe(true);expect(returned.player.x).toBeLessThan(86.876);expect(returned.player.x).toBeGreaterThan(70);
 await replay(page);expect(errors).toEqual([]);
});

test('P2 uses semicolon or gamepad B for Link spin, and the recovery UI fits a phone',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await ready(page);await page.selectOption('#fighter-two','link');await page.selectOption('#mode','local');
 await page.locator('#pause').click();await page.locator('#reset').click();await advance(page,180);
 await page.keyboard.down('Semicolon');await advance(page);await page.keyboard.up('Semicolon');
 expect((await state(page)).dummy.clip).toBe('SpecialHiStart');expect((await state(page)).player.state).toBe('idle');
 await advance(page,10);expect((await state(page)).dummy.clip).toBe('SpecialHi');
 await page.locator('#reset').click();await advance(page,180);
 await page.keyboard.down('Enter');await advance(page,8);await page.keyboard.up('Enter');
 expect((await state(page)).dummy.grounded).toBe(false);
 await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[0,0],buttons:Array.from({length:17},(_,i)=>({pressed:i===1,value:i===1?1:0}))}]}));
 await advance(page);expect((await state(page)).dummy.clip).toBe('SpecialAirHi');expect((await state(page)).player.state).toBe('idle');
 await page.evaluate(()=>Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]}));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/recovery-input-phone.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await expect(page.locator('.key-row').filter({hasText:'Up special'}).locator('kbd')).toHaveText('I');expect(errors).toEqual([]);
});
