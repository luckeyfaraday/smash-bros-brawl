import {test,expect,type Page} from '@playwright/test';
const codes=['KeyA','KeyD','KeyW','KeyS','KeyG','KeyO','KeyK','KeyJ','KeyF','KeyL','Space','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Backslash','Slash','ShiftRight'];
const state=(page:Page)=>page.evaluate(()=>(window as any).brawlLab.snapshot());
async function play(page:Page,frames:number,keys:string[]=[]){await page.evaluate(({frames,keys,codes})=>{for(const code of codes)document.dispatchEvent(new KeyboardEvent(keys.includes(code)?'keydown':'keyup',{code,bubbles:true}));for(let n=0;n<frames;n++)document.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyN',bubbles:true}));},{frames,keys,codes});expect((await state(page)).script?.error??null).toBe(null);}
async function reset(page:Page,id:string,target='mario',mode='training'){await page.selectOption('#fighter-one',id);await page.selectOption('#fighter-two',target);await page.selectOption('#mode',mode);if(!await page.evaluate(()=>(window as any).brawlLab.paused))await page.locator('#pause').click();await page.locator('#reset').click();if(mode==='local')await play(page,180);}
async function load(page:Page){await page.goto('/lab.html');await page.waitForFunction(()=>(window as any).brawlLab?.ready);}

test('G uses F.L.U.D.D. with stored charge, Stone with a return, and Thunder with a 17% burst in the main page',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)});await load(page);
 await reset(page,'mario');await play(page,65,['KeyG']);expect((await state(page)).down.floodCharge).toBe(45);await expect(page.locator('#down-panel')).toBeVisible();await play(page,1,['KeyK']);await play(page,18);expect((await state(page)).down.floodCharge).toBe(45);await play(page,1,['KeyG']);await play(page,36);let s=await state(page);expect(s.dummy.x).toBeGreaterThan(5);expect(s.dummy.damage).toBe(0);expect(s.downProjectiles.length).toBeGreaterThan(0);
 await reset(page,'kirby');await play(page,20,['Space']);await play(page,45,['KeyG']);s=await state(page);expect(s.down.state.phase).toBe('hold');expect(s.player.y).toBe(0);await play(page,14);await play(page,1,['KeyG']);expect((await state(page)).down.state.phase).toBe('exit');await play(page,65);expect((await state(page)).down.state).toBe(null);
 await reset(page,'pikachu');await play(page,17,['KeyG']);expect((await state(page)).downProjectiles[0].kind).toBe('thunder');await play(page,1);s=await state(page);expect(s.down.state.phase).toBe('hit');expect(s.dummy.damage).toBe(17);expect(s.player.damage).toBe(0);expect(errors).toEqual([]);
});
test('Link pulls and throws a live bomb; each of the four opponents can pick one up and throw it through P2 controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await load(page);
 await reset(page,'link');await play(page,42,['KeyG']);expect((await state(page)).bombs[0].heldBy).toBe(0);await play(page,7,['KeyJ']);let s=await state(page);expect(s.dummy.damage).toBe(5);expect(s.bombs[0].phase).toBe('explode');
 for(const id of ['mario','link','kirby','pikachu']){
  await reset(page,'link',id,'local');for(let n=0;n<150;n++){s=await state(page);if(s.dummy.x-s.player.x<9)break;await play(page,1,['ArrowLeft','ShiftRight']);}
  await play(page,42,['KeyG']);await play(page,6,['KeyF']);await play(page,25);s=await state(page);expect(s.bombs[0].phase).toBe('fall');const age=s.bombs[0].age;
  await play(page,2,['Slash']);s=await state(page);expect(s.bombs[0].heldBy,id).toBe(1);expect(s.bombs[0].age).toBeGreaterThan(age);expect(s.dummy.clip).toBe('LightGet');await play(page,30);await play(page,20,['Slash','ArrowUp']);s=await state(page);expect(s.bombs[0].heldBy).toBe(null);expect(s.bombs[0].vy).toBeGreaterThan(0);
 }
 expect(errors).toEqual([]);
});
test('P2 backslash and gamepad D-pad down select down specials independently of fast fall',async({page})=>{
 await load(page);await reset(page,'mario','pikachu','local');await play(page,18,['Backslash']);let s=await state(page);expect(s.downOpponent.state.phase).toBe('hit');expect(s.down.state).toBe(null);
 await reset(page,'pikachu');await page.evaluate(()=>{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[{mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},(_,n)=>({pressed:n===13,touched:n===13,value:n===13?1:0}))}]});});await play(page,18);s=await state(page);expect(s.down.state.phase).toBe('hit');expect(s.dummy.damage).toBe(17);expect(s.previous.down).toBe(false);
});
