import {test,expect,type Page} from '@playwright/test';
const codes=['KeyA','KeyD','KeyS','KeyK','KeyJ','Space','ShiftLeft','Comma','ArrowLeft','ArrowRight','ArrowDown','Enter','Slash'];
const state=(page:Page)=>page.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(page:Page,frames:number,keys:string[]=[]){await page.evaluate(({frames,keys,codes})=>{for(const code of codes)document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));for(let n=0;n<frames;n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));},{frames,keys,codes});const s=await state(page);expect(s.script?.error??s.opponent.script?.error??null).toBe(null);}
async function reset(page:Page,id:string,mode='training'){await page.selectOption('#fighter-one',id);await page.selectOption('#fighter-two','mario');await page.selectOption('#mode',mode);if(!await page.evaluate(()=>(window as any).brawlLab.paused))await page.locator('#pause').click();await page.locator('#reset').click();if(mode==='local')await play(page,180);}
async function load(page:Page){await page.goto('/lab.html');await page.waitForFunction(()=>(window as any).brawlLab?.ready);}
async function edge(page:Page){for(let n=0;n<150;n++){if(!(await state(page)).player.grounded)break;await play(page,1,['KeyD']);}for(let n=0;n<20&&!(await state(page)).player.ledgeSide;n++)await play(page,1,['KeyA']);await play(page,45);expect((await state(page)).player.state).toBe('ledgeHang');}

test('all four fighters roll, spot dodge and air dodge through the main keyboard controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await load(page);
 for(const id of ['mario','link','kirby','pikachu']){
  await reset(page,id);await play(page,10,['KeyK','KeyD']);let s=await state(page);expect(s.player.clip).toBe('EscapeF');expect(s.script.hurtState).toBe(2);await expect(page.locator('#defense-title')).toHaveText('Forward roll');await expect(page.locator('#defense-phase')).toHaveText('DODGING');await play(page,32);expect((await state(page)).defense[0].evade).toBe(null);
  await reset(page,id);await play(page,5,['KeyK','KeyS']);expect((await state(page)).player.clip).toBe('EscapeN');await expect(page.locator('#defense-title')).toHaveText('Spot dodge');await play(page,17,['KeyK','KeyS']);await expect(page.locator('#defense-phase')).toContainText('VULNERABLE');await play(page,45,['KeyK','KeyS']);expect((await state(page)).player.state).toBe('shield');
  await reset(page,id);await play(page,13,['Space']);await play(page,8,['KeyK']);s=await state(page);expect(s.player.clip).toBe('EscapeAir');expect(s.player.grounded).toBe(false);expect(s.script.hurtState).toBe(2);await expect(page.locator('#defense-title')).toHaveText('Air dodge');
 }
 await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);expect(errors).toEqual([]);
});

test('each fighter can walk off, steer back, catch the ledge, attack or roll back onto Final Destination',async({page})=>{
 await load(page);for(const id of ['mario','link','kirby','pikachu'])for(const roll of [false,true]){
  await reset(page,id);await edge(page);await expect(page.locator('#ledge-instruction')).toContainText('J to attack');await play(page,1,[roll?'KeyK':'KeyJ']);let s=await state(page);expect(s.player.clip).toBe(roll?'CliffEscapeQuick':'CliffAttackQuick');expect(s.script.hurtState).toBe(2);await expect(page.locator('#ledge-title')).toHaveText(roll?'Rolling onto the stage':'Attacking from the ledge');await play(page,81);s=await state(page);expect(s.player.grounded).toBe(true);expect(s.player.ledgeSide).toBe(0);expect(s.script).toBe(null);await expect(page.locator('#ledge-panel')).toBeHidden();
 }
});

test('P2 and gamepad use defense controls; recording/replay preserves a roll and dodge',async({page})=>{
 await load(page);await reset(page,'mario','local');await play(page,8,['Comma','ArrowLeft']);let s=await state(page);expect(s.dummy.clip).toBe('EscapeF');expect(s.defense[1].evade.kind).toBe('roll');expect(s.defense[0].evade).toBe(null);await play(page,45);await play(page,6,['Comma','ArrowDown']);expect((await state(page)).dummy.clip).toBe('EscapeN');
 await reset(page,'mario');await page.evaluate(()=>{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[1,0,0,0],buttons:Array.from({length:17},(_,n)=>({pressed:n===6,touched:n===6,value:n===6?1:0}))}]});});await play(page,8);expect((await state(page)).player.clip).toBe('EscapeF');await page.evaluate(()=>{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]});});
 await reset(page,'mario');await page.locator('#record').click();if(!await page.evaluate(()=>(window as any).brawlLab.paused))await page.locator('#pause').click();await play(page,35,['KeyK','KeyD']);await play(page,15);await play(page,28,['KeyK','KeyS']);await play(page,12);await page.locator('#record').click();const hash=await page.evaluate(()=>(window as any).brawlLab.hash());await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');expect(await page.evaluate(()=>(window as any).brawlLab.hash())).toBe(hash);
});
