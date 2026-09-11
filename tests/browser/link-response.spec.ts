import {test,expect,type Page} from '@playwright/test';
const codes=['KeyA','KeyD','KeyS','KeyK','KeyJ','Space','ShiftLeft','Comma','ArrowLeft','ArrowRight','ArrowDown','Enter','Slash','KeyG'];
const state=(page:Page)=>page.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(page:Page,frames:number,keys:string[]=[]){await page.evaluate(({frames,keys,codes})=>{for(const code of codes)document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));for(let n=0;n<frames;n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));},{frames,keys,codes});const s=await state(page);expect(s.script?.error??s.opponent.script?.error??null).toBe(null);}
async function reset(page:Page,id:string,mode='training'){await page.selectOption('#fighter-one',id);await page.selectOption('#fighter-two','mario');await page.selectOption('#mode',mode);if(!await page.evaluate(()=>(window as any).brawlLab.paused))await page.locator('#pause').click();await page.locator('#reset').click();if(mode==='local')await play(page,180);}
async function load(page:Page){await page.goto('/lab.html');await page.waitForFunction(()=>(window as any).brawlLab?.ready);}
async function edge(page:Page){for(let n=0;n<150;n++){if(!(await state(page)).player.grounded)break;await play(page,1,['KeyD']);}for(let n=0;n<20&&!(await state(page)).player.ledgeSide;n++)await play(page,1,['KeyA']);await play(page,45);expect((await state(page)).player.state).toBe('ledgeHang');}

test('crouching with a held bomb keeps the item pose and lowers Link’s passive shield guidance',async({page})=>{
 await load(page);await reset(page,'link');await play(page,42,['KeyG']);await play(page,24,['KeyS']);const s=await state(page);
 expect(s.player.clip).toBe('SquatWaitItem');expect(s.bombs[0].heldBy).toBe(0);await expect(page.locator('#link-panel')).toBeHidden();await expect(page.locator('#down-panel')).toBeVisible();
});

test('Link’s weaker down-air contact and rebound appear through keyboard play and replay',async({page})=>{
 await load(page);await reset(page,'link');await page.locator('#record').click();if(!await page.evaluate(()=>(window as any).brawlLab.paused))await page.locator('#pause').click();
 await play(page,10,['KeyD']);await play(page,1,['Space']);await play(page,7);await play(page,1,['KeyS','KeyJ']);await play(page,13);let s=await state(page);expect(s.dummy.damage).toBe(22);expect(s.player.vy).toBeGreaterThan(0);
 await play(page,28,['KeyA']);s=await state(page);expect(s.lastHit.damage).toBe(8);expect(s.dummy.damage).toBe(30);expect(s.linkResponse[0].bounce.count).toBe(2);await expect(page.locator('#link-phase')).toHaveText('REBOUND · 2');
 await page.locator('#record').click();const hash=await page.evaluate(()=>(window as any).brawlLab.hash());await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');expect(await page.evaluate(()=>(window as any).brawlLab.hash())).toBe(hash);
});

test('a gamepad crouches P2 independently, then cancels into the down tilt',async({page})=>{
 await load(page);await reset(page,'link','local');await page.selectOption('#fighter-two','link');await page.locator('#reset').click();await play(page,180);
 await page.evaluate(()=>{(window as any).pressAttack=false;Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[0,1,0,0],buttons:Array.from({length:17},(_,n)=>({pressed:n===2&&(window as any).pressAttack,touched:false,value:0}))}]});});
 await play(page,24);expect((await state(page)).dummy.clip).toBe('SquatWait');expect((await state(page)).player.clip).toBe('Wait1');await page.evaluate(()=>{(window as any).pressAttack=true;});await play(page,1);expect((await state(page)).dummy.clip).toBe('AttackLw3');
});
