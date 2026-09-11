import {test,expect} from '@playwright/test';
import type {MotionManifest} from '../../src/assets';
import {fighterIds} from '../../src/roster';

test('Pages serves animation manifests and hashed chunks with separate cache policies',async({request})=>{
  for(const id of fighterIds){
    const base=`/assets/${id}/`;
    const response=await request.get(`${base}motion.json`);
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    expect(response.headers()['cache-control']).toBe('public, max-age=0, must-revalidate');
    const manifest:MotionManifest=await response.json();
    expect(manifest.clipFiles.length).toBeGreaterThan(0);
    for(const file of manifest.clipFiles){
      const chunk=await request.head(base+file);
      expect(chunk.status()).toBe(200);
      expect(chunk.headers()['content-type']).toContain('application/json');
      expect(chunk.headers()['cache-control']).toBe('public, max-age=31536000, immutable');
    }
  }
});

test('missing pages and animation chunks return 404 instead of game HTML with status 200',async({request})=>{
  for(const path of ['/missing-page','/assets/mario/motion-clips-missing.json']){
    const response=await request.get(path);
    expect(response.status()).toBe(404);
    expect(await response.text()).toContain('Page not found');
  }
});

test('the Pages build loads all fighters, starts a match and opens training',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('response',response=>{
    if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('/');
  await page.waitForFunction(()=>(window as any).brawlGame?.ready);
  await page.locator('#start-game').click();
  await page.locator('[data-fighter="link"]').click();
  await page.locator('#select-p2').click();
  await page.locator('[data-fighter="kirby"]').click();
  await page.locator('[data-opponent="local"]').click();
  await page.locator('#fight').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).brawlGame.snapshot().match.status)).toBe('playing');
  await page.goto('/lab.html');
  await expect(page).toHaveURL(/\/lab$/);
  await page.waitForFunction(()=>(window as any).brawlLab?.ready);
  await page.selectOption('#fighter-one','pikachu');
  await expect(page.locator('#player-name')).toHaveText('PIKACHU');
  expect(errors).toEqual([]);
});
