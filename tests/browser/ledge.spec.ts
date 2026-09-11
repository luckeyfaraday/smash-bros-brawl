import {test,expect,type Page} from '@playwright/test';

const state=(page:Page)=>page.evaluate(()=> (window as any).brawlLab.snapshot());
const step=async(page:Page,count=1)=>{for(let i=0;i<count;i++)await page.keyboard.press('KeyN');};
async function load(page:Page) {
  await page.goto('/lab.html');await page.waitForFunction(()=> (window as any).brawlLab?.ready);
  await page.locator('#pause').click();await page.locator('#reset').click();
}
async function grabRightEdge(page:Page) {
  await page.keyboard.down('KeyD');await page.keyboard.down('ShiftLeft');await step(page,76);
  await page.keyboard.up('KeyD');await page.keyboard.up('ShiftLeft');await step(page,40);
  expect((await state(page)).player.state).toBe('ledgeHang');
  await expect(page.locator('#ledge-title')).toHaveText('Ready to return');
  await expect(page.locator('#timeline')).toBeHidden();
}

test('run off, catch, hang, climb and replay the complete recovery through the game controls',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await load(page);
  await page.locator('#record').click();await page.locator('#pause').click();
  await grabRightEdge(page);
  const hanging=await state(page);expect(hanging.player.x).toBe(86.876);expect(hanging.player.invincible).toBe(0);
  await page.screenshot({path:'artifacts/ledge-browser-hang.png',fullPage:true});
  await page.keyboard.down('KeyA');await step(page);await page.keyboard.up('KeyA');await step(page,18);
  expect((await state(page)).player.clip).toBe('CliffClimbQuick');
  await expect(page.locator('#ledge-title')).toHaveText('Climbing onto the stage');
  await page.screenshot({path:'artifacts/ledge-browser-climb.png',fullPage:true});
  await step(page,17);const recovered=await state(page);
  expect(recovered.player.grounded).toBe(true);expect(recovered.player.x).toBeLessThan(hanging.player.x);
  await expect(page.locator('#ledge-panel')).toBeHidden();await expect(page.locator('#timeline')).toBeVisible();
  await page.locator('#record').click();const hash=await page.evaluate(()=> (window as any).brawlLab.hash());
  await page.locator('#replay').click();await expect(page.locator('#replay-status')).toContainText('Replay verified');
  expect(await page.evaluate(()=> (window as any).brawlLab.hash())).toBe(hash);
  expect(errors).toEqual([]);
});

test('ledge jump preserves an air jump and drop clears the ledge without an immediate regrab',async({page})=>{
  await load(page);await grabRightEdge(page);
  await page.keyboard.down('Space');await step(page);await page.keyboard.up('Space');
  expect((await state(page)).player.clip).toBe('CliffJumpQuick1');
  await step(page,16);const jumped=await state(page);
  expect(jumped.player.clip).toBe('CliffJumpQuick2');expect(jumped.player.vy).toBeGreaterThan(0);
  expect(jumped.player.jumps).toBe(1);
  await page.keyboard.down('Space');await step(page);await page.keyboard.up('Space');
  expect((await state(page)).player.jumps).toBe(2);
  await page.keyboard.press('KeyR');await grabRightEdge(page);
  await page.setViewportSize({width:390,height:844});
  await expect(page.locator('#ledge-panel')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
  await page.screenshot({path:'artifacts/ledge-browser-phone.png',fullPage:true});
  await page.keyboard.down('KeyS');await step(page);await page.keyboard.up('KeyS');await step(page);
  const dropped=await state(page);
  expect(dropped.player.state).toBe('air');expect(dropped.player.y).toBeLessThan(-10);
  expect(dropped.player.ledgeSide).toBe(0);expect(dropped.player.ledgeCooldown).toBeGreaterThan(0);
  await expect(page.locator('#ledge-panel')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
});
