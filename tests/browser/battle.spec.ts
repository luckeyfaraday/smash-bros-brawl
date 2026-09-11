import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {Simulation} from '../../src/simulation';
import {Poses} from '../../src/pose';
const state=(p:Page)=>p.evaluate(()=> (window as any).brawlLab.snapshot());
// Exercise the game's N/Step keyboard handler for long match sequences.
async function advance(page:Page,count=1) {
  await page.evaluate(n=>{for(let i=0;i<n;i++) {
    document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',key:'n',bubbles:true}));
    document.dispatchEvent(new KeyboardEvent('keyup',{code:'KeyN',key:'n',bubbles:true}));
  }},count);
}
async function load(page:Page,mode:string) {
  await page.goto('/lab.html');await page.waitForFunction(()=> (window as any).brawlLab?.ready);
  await page.selectOption('#mode',mode);await page.locator('#pause').click();await page.locator('#reset').click();
}
test('CPU grabs a held shield, stocks end the match, and rematch/training controls work',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await load(page,'cpu');await expect(page.locator('#match-title')).toHaveText('3');
  await advance(page,180);await expect(page.locator('#match-overlay')).toBeHidden();
  await page.keyboard.down('KeyK');
  for(let i=0;i<60;i++){await advance(page,5);if((await state(page)).hold?.owner===1)break;}
  const blocked=await state(page);expect(blocked.hold?.owner).toBe(1);expect(blocked.player.state).toBe("captured");expect(blocked.player.damage).toBe(0);
  expect(blocked.player.shield).toBeLessThan(60);
  await page.screenshot({path:'artifacts/battle-cpu-grab.png',fullPage:true});
  await page.keyboard.up('KeyK');await page.locator('#reset').click();await advance(page,3000);
  const result=await state(page);expect(result.match.status).toBe('finished');expect(result.match.winner).toBe(1);
  expect(result.match.stocks[0]).toBe(0);expect(result.hits).toBeGreaterThan(10);
  await expect(page.locator('#match-title')).toHaveText('CPU WINS');
  await page.screenshot({path:'artifacts/battle-results.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'artifacts/battle-results-phone.png',fullPage:true});
  await page.locator('#rematch').click();expect((await state(page)).match.stocks).toEqual([3,3]);
  await page.selectOption('#mode','training');await expect(page.locator('#opponent-label')).toHaveText('TRAINING DUMMY');
  await expect(page.locator('#match-hud')).toBeHidden();expect(errors).toEqual([]);
});

test('local keyboard controls drive both fighters and exported replay reproduces both inputs',async({page})=>{
  await load(page,'local');await expect(page.locator('#second-controls')).toBeVisible();
  await page.locator('#record').click();await page.locator('#pause').click();
  await advance(page,180);
  await page.keyboard.down('KeyD');await page.keyboard.down('ShiftLeft');
  await page.keyboard.down('ArrowLeft');await page.keyboard.down('ShiftRight');await advance(page,44);
  for(const key of ['KeyD','ShiftLeft','ArrowLeft','ShiftRight'])await page.keyboard.up(key);
  const moved=await state(page);expect(moved.player.x).toBeGreaterThan(-60);expect(moved.dummy.x).toBeLessThan(60);
  await page.keyboard.down('KeyK');await page.keyboard.down('Slash');await advance(page,2);
  await page.keyboard.up('Slash');expect((await state(page)).lastHit.blocked).toBe(true);
  await page.keyboard.up('KeyK');await advance(page,45);
  await page.keyboard.down('Period');await advance(page);await page.keyboard.up('Period');
  expect((await state(page)).dummy.clip).toBe('AttackS4Start');
  await advance(page,12);await page.screenshot({path:'artifacts/local-battle-smash.png',fullPage:true});
  await page.locator('#record').click();
  const downloadEvent=page.waitForEvent('download');await page.locator('#export').click();
  const download=await downloadEvent,tape=JSON.parse(readFileSync((await download.path())!,'utf8'));
  expect(tape.options).toMatchObject({mode:'battle',opponent:'local'});
  expect(tape.frames.some((f:any)=>f.opponent?.smash)).toBe(true);
  const data=JSON.parse(readFileSync('public/assets/mario/data.json','utf8'));
  const poses=new Poses(JSON.parse(readFileSync('public/assets/mario/motion.json','utf8')));
  const sim=new Simulation(data,poses,tape.options);for(const f of tape.frames)sim.step(f,f.opponent);
  expect(sim.hash()).toBe(tape.expectedHash);
  await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
});

test('forward smash is available in training and shows its own original timeline',async({page})=>{
  await load(page,'training');await page.keyboard.down('KeyD');await advance(page,10);await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyL');await advance(page,1);await page.keyboard.up('KeyL');await advance(page,15);
  expect((await state(page)).dummy.damage).toBeGreaterThanOrEqual(14);
  await expect(page.locator('#move-label')).toHaveText('FORWARD SMASH');
  await expect(page.locator('.frame-cell.active')).toHaveCount(3);
  await expect(page.locator('#move-summary')).toContainText('active 9–11');
});

test('one connected gamepad controls P2 alongside P1 keyboard input in local play',async({page})=>{
  await page.addInitScript(()=>{
    const pad={mapping:'standard',axes:[-1,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
    (window as any).testPad=pad;
    Object.defineProperty(navigator,'getGamepads',{value:()=>[pad]});
  });
  await load(page,'local');await advance(page,190);
  const moved=await state(page);expect(moved.player.x).toBe(-60);expect(moved.dummy.x).toBeLessThan(60);
  await page.evaluate(()=>{(window as any).testPad.buttons[0].pressed=true;});await advance(page,6);
  expect((await state(page)).dummy.jumps).toBe(1);expect((await state(page)).player.jumps).toBe(0);
});
