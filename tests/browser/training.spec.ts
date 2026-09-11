import { test, expect, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { Simulation } from '../../src/simulation';
import { Poses } from '../../src/pose';

const snapshot=(page:Page)=>page.evaluate(()=> (window as any).brawlLab.snapshot());
async function step(page:Page, count=1) {
  for(let i=0;i<count;i++)await page.keyboard.press('KeyN');
}
async function load(page:Page) {
  await page.goto('/lab.html');
  await page.waitForFunction(()=> (window as any).brawlLab?.ready,undefined,{timeout:90000});
  await page.getByRole('button',{name:'Pause',exact:false}).click();
  await page.getByRole('button',{name:'Reset training',exact:true}).click();
}
test('the browser loads original assets, steps movement and connects a jab',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'||m.type()==='warning'&&m.text().startsWith('THREE.'))errors.push(m.text());});
  await load(page);
  await expect(page.locator('canvas')).toBeVisible();
  const stage=await page.evaluate(()=> (window as any).brawlLab.stage);
  expect(stage).toMatchObject({name:'Final Destination',modelLoaded:true,left:-86.876,right:86.876});
  const initial=await snapshot(page);expect(initial.frame).toBe(0);
  await page.keyboard.down('KeyD');await step(page,10);await page.keyboard.up('KeyD');
  const moved=await snapshot(page);expect(moved.player.x).toBeGreaterThan(initial.player.x);
  await page.keyboard.down('KeyJ');await step(page,1);await page.keyboard.up('KeyJ');await step(page,1);
  const hit=await snapshot(page);expect(hit.hits).toBe(1);expect(hit.dummy.damage).toBe(3);expect(hit.player.hitlag).toBeGreaterThan(0);
  await page.getByLabel('Collision volumes').check();
  await mkdir('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/training-hitboxes.png',fullPage:true});
  await page.getByLabel('Skeleton', {exact:false}).check();
  await step(page,18);expect((await snapshot(page)).dummy.damage).toBe(3);
  expect(errors).toEqual([]);
});
test('jumping, pause and reset work through keyboard controls',async({page})=>{
  await load(page);
  await page.keyboard.down('Space');await step(page,6);await page.keyboard.up('Space');
  expect((await snapshot(page)).player.y).toBeGreaterThan(0);
  await step(page,1);await page.keyboard.down('Space');await step(page,1);await page.keyboard.up('Space');
  expect((await snapshot(page)).player.jumps).toBe(2);
  await page.keyboard.press('KeyR');expect((await snapshot(page)).frame).toBe(0);
  const frame=(await snapshot(page)).frame;
  await page.waitForTimeout(100);expect((await snapshot(page)).frame).toBe(frame);
  await page.keyboard.press('KeyP');await expect.poll(async()=> (await snapshot(page)).frame).toBeGreaterThan(frame);
});

test('buffered taps play the three-hit chain and display the current move timing',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await load(page);
  await page.keyboard.down('KeyD');await step(page,10);await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyJ');await step(page);await page.keyboard.up('KeyJ');await step(page,2);
  await page.keyboard.down('KeyJ');await step(page);await page.keyboard.up('KeyJ');
  await expect(page.locator('#combo-status')).toHaveText('Next jab queued');
  expect((await snapshot(page)).player.hitlag).toBeGreaterThan(0);
  await step(page,8);
  await expect(page.locator('#move-name')).toHaveText('Attack12');
  await expect(page.locator('#move-label')).toHaveText('JAB 2 / 3');
  expect((await snapshot(page)).comboQueued).toBe(false);
  await step(page);expect((await snapshot(page)).dummy.damage).toBe(5);
  await page.keyboard.down('KeyJ');await step(page);await page.keyboard.up('KeyJ');await step(page,7);
  await expect(page.locator('#move-name')).toHaveText('Attack13');
  await expect(page.locator('#move-label')).toHaveText('JAB 3 / 3');
  await expect(page.locator('.frame-cell.active')).toHaveCount(4);
  await expect(page.locator('#move-summary')).toContainText('4% damage · active 6–9 · interrupt at 29');
  await step(page,6);
  const kick=await snapshot(page);
  expect(kick.hits).toBe(3);expect(kick.dummy.damage).toBe(9);expect(kick.lastHit.move).toBe('Attack13');
  await page.getByLabel('Collision volumes').check();
  await expect(page.locator('#dummy-damage')).toHaveText('9%');
  await page.screenshot({path:'artifacts/training-combo.png',fullPage:true});
  await step(page,6);
  expect((await snapshot(page)).script.hitboxes[0].radius).toBe(3.6);
  await expect(page.locator('.frame-cell.current')).toHaveText('08');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'artifacts/training-combo-mobile.png',fullPage:true});
  await page.keyboard.press('KeyR');
  expect((await snapshot(page)).comboQueued).toBe(false);
  await expect(page.locator('#move-name')).toHaveText('Attack11');
  await expect(page.locator('.frame-cell')).toHaveCount(16);
  expect(errors).toEqual([]);
});
test('recording can replay the same result and export its inputs',async({page})=>{
  await load(page);
  await page.getByRole('button',{name:'Record',exact:false}).click();
  await page.getByRole('button',{name:'Pause',exact:false}).click();
  await page.keyboard.down('KeyD');await step(page,10);await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyJ');await step(page,38);await page.keyboard.up('KeyJ');await step(page,30);
  expect((await snapshot(page)).dummy.damage).toBe(9);
  expect((await snapshot(page)).hits).toBe(3);
  await page.keyboard.down('Space');await step(page,6);await page.keyboard.up('Space');
  await page.keyboard.down('KeyJ');await step(page);await page.keyboard.up('KeyJ');await step(page,10);
  expect((await snapshot(page)).player.clip).toBe('AttackAirN');
  await step(page,80);
  await page.getByRole('button',{name:'Stop recording',exact:false}).click();
  const recorded=await page.evaluate(()=> (window as any).brawlLab.hash());
  await page.getByRole('button',{name:'Replay',exact:false}).click();
  await expect(page.locator('#replay-status')).toContainText('Replay verified');
  expect(await page.evaluate(()=> (window as any).brawlLab.hash())).toBe(recorded);
  const downloadEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export',exact:false}).click();
  const download=await downloadEvent;
  expect(download.suggestedFilename()).toBe('brawl-training-replay.json');
  const path=await download.path();expect(path).toBeTruthy();
  const recording=JSON.parse(readFileSync(path!,'utf8'));
  expect(recording.simulation).toBe('brawl-lab-027');expect(recording.expectedHash).toBe(recorded);
  // Replay the downloaded inputs outside the browser to verify the actual file,
  // including buffered/held combo state, rather than only its download name.
  const data=JSON.parse(readFileSync('public/assets/mario/data.json','utf8'));
  const motion=JSON.parse(readFileSync('public/assets/mario/motion.json','utf8'));
  expect(recording.source.sha256).toBe(data.source.sha256);
  const sim=new Simulation(data,new Poses(motion),recording.options);
  for(const input of recording.frames)sim.step(input);
  expect(sim.hash()).toBe(recording.expectedHash);expect(sim.dummy.damage).toBe(9);
});

test('short-hop aerial hits, changes damage phase, fast falls and recovers on landing',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await load(page);
  await page.keyboard.down('KeyD');await step(page,10);await page.keyboard.up('KeyD');
  await page.keyboard.down('Space');await step(page);await page.keyboard.up('Space');await step(page,5);
  await expect(page.locator('#move-label')).toHaveText('NEUTRAL AERIAL');
  await page.keyboard.down('KeyJ');await step(page);await page.keyboard.up('KeyJ');await step(page,2);
  const early=await snapshot(page);
  expect(early.frame).toBe(19);expect(early.player.state).toBe('aerial');expect(early.player.age).toBe(2);
  expect(early.player.hitlag).toBe(6);expect(early.dummy.damage).toBe(10);expect(early.lastHit.move).toBe('AttackAirN');
  await expect(page.locator('#move-summary')).toHaveText('10% → 5% damage · active 2–28 · ends at 46');
  await expect(page.locator('.frame-cell.active')).toHaveCount(27);
  await expect(page.locator('.frame-cell.autocancel')).toHaveCount(15);
  await page.getByLabel('Collision volumes').check();
  await page.screenshot({path:'artifacts/training-aerial.png',fullPage:true});
  await step(page,9);
  const late=await snapshot(page);
  expect(late.player.age).toBe(5);expect(late.script.hitboxes[0].damage).toBe(5);expect(late.dummy.damage).toBe(10);
  await expect(page.locator('.frame-cell.current')).toHaveText('05');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'artifacts/training-aerial-mobile.png',fullPage:true});
  await page.setViewportSize({width:1440,height:1100});
  await step(page,14);
  await page.keyboard.down('KeyS');await step(page);await page.keyboard.up('KeyS');
  expect((await snapshot(page)).player.fastfall).toBe(true);
  expect((await snapshot(page)).player.clip).toBe('AttackAirN');
  await step(page,8);
  const landed=await snapshot(page);
  expect(landed.frame).toBe(51);expect(landed.player.clip).toBe('LandingAirN');expect(landed.player.age).toBe(0);
  expect(landed.script).toBeNull();expect(landed.player.grounded).toBe(true);
  await expect(page.locator('#combo-status')).toHaveText('Landing recovery · 10 frames left');
  await expect(page.locator('#move-frame')).toHaveText('LANDING 0 / 10');
  await step(page,9);expect((await snapshot(page)).player.clip).toBe('LandingAirN');
  await step(page);expect((await snapshot(page)).player.state).toBe('idle');
  await expect(page.locator('#move-name')).toHaveText('Attack11');
  expect(errors).toEqual([]);
});

test('progress links show the actual game capture and the four-fighter scope on desktop and phone',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
  await load(page);
  await page.getByRole('link',{name:'View progress'}).click();
  await expect(page).toHaveURL(/visual-progress\.html$/);
  const capture=page.locator('.hero img');
  await expect.poll(()=>capture.evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
  for(const shot of await page.locator('.shots img').all()) {
    await shot.scrollIntoViewIfNeeded();
    await expect.poll(()=>shot.evaluate((img:HTMLImageElement)=>img.complete && img.naturalWidth>0)).toBe(true);
  }
  await expect(page.locator('.fighter h3')).toHaveText(['Mario','Link','Kirby','Pikachu']);
  await expect(page.locator('.fighter .state')).toHaveText(['IN PROGRESS','IN PROGRESS','IN PROGRESS','IN PROGRESS']);
  for(const width of [1440,390]) {
    await page.setViewportSize({width,height:1000});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
    const ratio=await capture.evaluate((img:HTMLImageElement)=>({display:img.width/img.height,source:img.naturalWidth/img.naturalHeight}));
    expect(ratio.display).toBeCloseTo(ratio.source,1);
    await page.screenshot({path:`artifacts/visual-progress-${width}.png`,fullPage:true});
  }
  await page.getByRole('link',{name:'Open the game'}).click();
  await page.waitForFunction(()=> (window as any).brawlGame?.ready);
  await expect(page.locator('#start-game')).toBeVisible();
  expect(errors).toEqual([]);
});
test('desktop and phone layouts fit their viewport',async({page})=>{
  const externalRequests:string[]=[];
  await page.route('**/*',route=>{
    if(!new URL(route.request().url()).hostname.match(/^(127\.0\.0\.1|localhost)$/)){
      externalRequests.push(route.request().url());return route.abort();
    }
    return route.continue();
  });
  await load(page);
  // Check real rendered pixels after the paused frame has been composited, not
  // merely the presence of a canvas. This catches cleared WebGL drawing buffers.
  await page.waitForTimeout(150);
  const distinctColors=await page.locator('canvas').evaluate(canvas=>{
    const copy=document.createElement('canvas');copy.width=160;copy.height=90;
    const context=copy.getContext('2d')!;
    context.drawImage(canvas as HTMLCanvasElement,0,0,160,90);
    const pixels=context.getImageData(0,0,160,90).data;
    const colors=new Set<number>();
    for(let i=0;i<pixels.length;i+=4)colors.add((pixels[i]<<16)|(pixels[i+1]<<8)|pixels[i+2]);
    return colors.size;
  });
  expect(distinctColors).toBeGreaterThan(100);
  await page.screenshot({path:'artifacts/training-room.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'artifacts/training-mobile.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  expect(externalRequests).toEqual([]);
  await expect(page.getByRole('button',{name:'Resume',exact:false})).toBeVisible();
});
