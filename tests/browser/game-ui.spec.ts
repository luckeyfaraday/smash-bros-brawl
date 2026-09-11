import {test,expect,type Page} from '@playwright/test';

const state=(page:Page)=>page.evaluate(()=>(window as any).brawlGame.snapshot());
const screen=(page:Page)=>page.evaluate(()=>(window as any).brawlGame.screen);
async function load(page:Page){await page.goto('/');await page.waitForFunction(()=>(window as any).brawlGame?.ready);}
async function fight(page:Page,local=false){
  await load(page);await page.locator('#start-game').click();
  if(local)await page.locator('[data-opponent="local"]').click();
  await page.locator('#fight').click();
  await expect.poll(async()=>(await state(page)).match.status).toBe('playing');
}

test('Brawl title artwork, player cards, fighter selection and saved match rules',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`);});
  await load(page);expect(await state(page)).toBeNull();
  await expect(page).toHaveTitle('Super Smash Bros. Brawl');await expect(page.locator('#home-screen')).toBeVisible();
  await expect(page.locator('.inspector,#timeline,#record,#frame')).toHaveCount(0);
  const titleImages=page.locator('#home-screen img');
  await expect(titleImages).toHaveCount(4);
  for(const img of await titleImages.all())await img.evaluate((n:HTMLImageElement)=>n.decode());
  await page.screenshot({path:'artifacts/build029-title.png',fullPage:true,animations:'disabled'});
  await page.keyboard.press('Enter');await expect(page.locator('#setup-screen')).toBeVisible();
  for(const id of ['link','kirby','pikachu','mario']){
    await page.locator(`[data-fighter="${id}"]`).click();await expect(page.locator(`[data-fighter="${id}"]`)).toHaveAttribute('aria-pressed','true');
  }
  await page.locator('[data-fighter="link"]').click();await page.locator('#select-p2').click();await page.locator('[data-fighter="kirby"]').click();
  await page.locator('[data-opponent="local"]').click();await page.selectOption('#stocks','5');await page.selectOption('#match-time','60');
  await expect(page.locator('#preview-p1')).toHaveText('LINK');await expect(page.locator('#preview-p2')).toHaveText('KIRBY');
  await expect(page.locator('#selected-p1-image')).toHaveAttribute('src','/assets/ui/link.png');
  await expect(page.locator('#selected-p2-wordmark')).toHaveAttribute('src','/assets/ui/name-kirby-mask.png');
  for(const img of await page.locator('#setup-screen img').all())await img.evaluate((n:HTMLImageElement)=>n.decode());
  await page.screenshot({path:'artifacts/build029-select.png',fullPage:true,animations:'disabled'});
  await page.reload();await page.waitForFunction(()=>(window as any).brawlGame?.ready);await page.locator('#start-game').click();
  await expect(page.locator('#selected-p1-name')).toHaveText('Link');await expect(page.locator('#selected-p2-name')).toHaveText('Kirby');
  await expect(page.locator('#stocks')).toHaveValue('5');await expect(page.locator('#match-time')).toHaveValue('60');
  await page.locator('#fight').click();const s=await state(page);
  expect(s.match.stocks).toEqual([5,5]);expect(s.match.remaining).toBe(3600);expect(s.cpu).toBeUndefined();
  expect(errors).toEqual([]);
});

test('a real CPU match counts down, pauses for help, reaches results and rematches',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await load(page);await page.locator('#start-game').click();await page.selectOption('#stocks','1');await page.locator('#fight').click();
  await expect(page.locator('#countdown-number')).toHaveText('3');
  expect((await state(page)).cpu.engine).toBe('brawl-script-mario-v1');
  await expect.poll(async()=>(await state(page)).frame).toBeGreaterThan(220);
  await page.screenshot({path:'artifacts/build029-match.png',animations:'disabled'});
  await page.keyboard.press('Escape');await expect(page.locator('#pause-overlay')).toBeVisible();
  const pausedFrame=(await state(page)).frame;await page.waitForTimeout(300);expect((await state(page)).frame).toBe(pausedFrame);
  await page.screenshot({path:'artifacts/build029-pause.png',animations:'disabled'});
  await page.locator('#pause-overlay [data-help]').click();await expect(page.locator('#help-dialog')).toBeVisible();
  await page.locator('[data-scheme="p2"]').click();await expect(page.locator('#controls-list')).toContainText('Enter');
  await page.locator('[data-scheme="pad"]').click();await expect(page.locator('#controls-list')).toContainText('Left stick');
  await page.keyboard.press('Escape');expect(await screen(page)).toBe('paused');expect((await state(page)).frame).toBe(pausedFrame);
  await page.locator('#resume-game').click();
  await expect(page.locator('#results-overlay')).toBeVisible({timeout:45000});
  expect((await state(page)).match.status).toBe('finished');expect((await state(page)).match.stocks[0]).toBe(0);
  await expect(page.locator('#result-title')).toHaveText('MARIO WINS!');await page.screenshot({path:'artifacts/build029-results.png',animations:'disabled'});
  await page.locator('#rematch').click();expect((await state(page)).match.stocks).toEqual([1,1]);expect((await state(page)).match.status).toBe('countdown');
  await page.keyboard.press('Escape');await page.locator('#pause-select').click();expect(await screen(page)).toBe('setup');
  await page.locator('#setup-back').click();expect(await screen(page)).toBe('home');expect(errors).toEqual([]);
});

test('local play accepts both keyboards and pausing releases held controls',async({page})=>{
  await fight(page,true);const start=await state(page);
  await page.keyboard.down('KeyD');await page.keyboard.down('ArrowLeft');await page.waitForTimeout(300);
  let moved=await state(page);expect(moved.player.x).toBeGreaterThan(start.player.x);expect(moved.dummy.x).toBeLessThan(start.dummy.x);
  await page.keyboard.press('Escape');await page.keyboard.up('KeyD');await page.keyboard.up('ArrowLeft');
  await page.locator('#restart-game').click();expect((await state(page)).match.status).toBe('countdown');
  await expect.poll(async()=>(await state(page)).frame).toBeGreaterThan(230);moved=await state(page);
  expect(moved.player.x).toBe(-60);expect(moved.dummy.x).toBe(60);
  await page.keyboard.down('Enter');await page.waitForTimeout(180);await page.keyboard.up('Enter');expect((await state(page)).dummy.y).toBeGreaterThan(0);
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));expect(await screen(page)).toBe('paused');
  const paused=(await state(page)).frame;await page.waitForTimeout(150);expect((await state(page)).frame).toBe(paused);
});

test('standard gamepad navigates menus, controls local P2 and pauses on disconnect',async({page})=>{
  await page.addInitScript(()=>{
    const pad={id:'Test standard pad',index:0,connected:true,mapping:'standard',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0,touched:false}))};
    (window as any).testPad=pad;(window as any).padConnected=true;
    Object.defineProperty(navigator,'getGamepads',{value:()=>[(window as any).padConnected?pad:null]});
  });
  const button=async(index:number)=>{
    await page.evaluate(n=>{(window as any).testPad.buttons[n].pressed=true;},index);await page.waitForTimeout(90);
    await page.evaluate(n=>{(window as any).testPad.buttons[n].pressed=false;},index);await page.waitForTimeout(90);
  };
  await load(page);await button(0);expect(await screen(page)).toBe('setup');
  await button(13);expect(await page.evaluate(()=>document.activeElement?.id)).toBe('setup-back');
  await page.locator('[data-opponent="local"]').click();await page.locator('#fight').click();
  await expect.poll(async()=>(await state(page)).match.status).toBe('playing');
  await page.evaluate(()=>{(window as any).testPad.axes[0]=-1;});await page.waitForTimeout(300);
  expect((await state(page)).dummy.x).toBeLessThan(60);expect((await state(page)).player.x).toBe(-60);
  await button(9);expect(await screen(page)).toBe('paused');
  await page.evaluate(()=>{(window as any).testPad.axes[0]=0;});await button(0);expect(await screen(page)).toBe('match');
  await page.evaluate(()=>{(window as any).padConnected=false;});await expect(page.locator('#pause-overlay')).toBeVisible();
});

test('phone menus fit, touch controls move and jump, and landscape stays usable',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const page=await context.newPage();await load(page);
  const cdp=await context.newCDPSession(page);
  for(const id of ['home','setup']){
    if(id==='setup')await page.locator('#start-game').tap();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
    await page.screenshot({path:`artifacts/build029-${id==='home'?'title':'select'}-phone.png`,fullPage:true,animations:'disabled'});
    // Full-page capture in this Chromium/Playwright build clears touch emulation.
    // Restore the test device before exercising its real pointer input path.
    await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  }
  await page.locator('[data-opponent="local"]').tap();await page.locator('#fight').tap();
  await expect.poll(async()=>(await state(page)).match.status).toBe('playing');
  await expect(page.locator('#touch-controls')).toBeVisible();
  expect(await page.evaluate(()=>matchMedia('(pointer: coarse)').matches)).toBe(true);
  const right=await page.locator('[data-control="right"]').boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:right!.x+right!.width/2,y:right!.y+right!.height/2}]});await page.waitForTimeout(250);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect((await state(page)).player.x).toBeGreaterThan(-60);
  await page.locator('[data-control="jump"]').tap();await page.waitForTimeout(160);expect((await state(page)).player.y).toBeGreaterThan(0);
  await page.screenshot({path:'artifacts/build029-match-phone.png',animations:'disabled'});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await page.locator('#pause-game').tap();await page.setViewportSize({width:844,height:390});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  await page.locator('#resume-game').tap();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(844);
  await page.screenshot({path:'artifacts/build029-match-landscape.png',animations:'disabled'});
  await context.close();
});

test('asset failures keep Fight disabled and offer a visible retry',async({page})=>{
  await page.route('**/assets/mario/data.json',route=>route.fulfill({status:404,body:'missing'}));
  await page.goto('/');await expect(page.locator('#game-error')).toBeVisible();
  await page.locator('#start-game').click();await expect(page.locator('#fight')).toBeDisabled();
  await expect(page.locator('#retry-load')).toBeVisible();expect(await state(page)).toBeNull();
});
