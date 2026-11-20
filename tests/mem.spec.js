// Ô Sáng Ghi Nhớ: regression tests for MEM-1..MEM-4, the missed-list items and the reward layer.
// Uses Playwright's fake clock so the multi-second "show" phases run instantly.
import { test, expect } from '@playwright/test';

async function open(page, { lv } = {}) {
  await page.clock.install();
  await page.goto('/');
  if (lv) await page.evaluate(v => { localStorage.clear(); localStorage.setItem('mem_lv', v); }, String(lv));
  else await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.click('#openMem');
  await expect(page.locator('#mmenu')).toBeVisible();
}
const phase = page => page.evaluate(() => window.__mem.phase);
async function untilPhase(page, want) {
  for (let i = 0; i < 200; i++) {
    if ((await phase(page)) === want) return;
    await page.clock.runFor(100);
  }
  throw new Error(`phase never became ${want}, is ${await phase(page)}`);
}
async function winRound(page) {
  await untilPhase(page, 'input');
  const ts = await page.evaluate(() => window.__mem.targets);
  for (const i of ts) await page.locator(`#mGrid .mtile >> nth=${i}`).click();
  await page.clock.runFor(1100);
}
async function loseRound(page) {
  await untilPhase(page, 'input');
  const ts = await page.evaluate(() => window.__mem.targets);
  const n = await page.locator('#mGrid .mtile').count();
  let wrong = 0; while (ts.includes(wrong)) wrong++;
  expect(wrong).toBeLessThan(n);
  await page.locator(`#mGrid .mtile >> nth=${wrong}`).click();
  await page.clock.runFor(1700);
}
async function pickLevel(page, L) {
  await page.locator('#mlvgrid .lv').nth(L - 1).click();
  await page.click('#mStart');
}

test('MEM-1: targets never fill the grid, at any level', async ({ page }) => {
  await open(page);
  const bad = await page.evaluate(() => {
    const out = [];
    for (let L = 1; L <= 60; L++) { const s = window.__mem.spec(L); if (s.t >= s.size * s.size) out.push(L); }
    return out;
  });
  expect(bad).toEqual([]);
});

test('MEM-1: legacy progress kept, level 13 is the end and shows a finished state', async ({ page }) => {
  await open(page, { lv: 99 });                       // corrupted / over-cap legacy value
  await expect(page.locator('#mlvgrid .lv')).toHaveCount(13);
  await expect(page.locator('#mBestTxt')).toHaveText('Đã qua hết 13 level');
  expect(await page.evaluate(() => [window.memBest(), BB.gameStats('mem').best])).toEqual([13, 13]);
  await pickLevel(page, 13);
  await winRound(page); await winRound(page);
  await expect(page.locator('#mresult')).toBeVisible();
  await expect(page.locator('#mrTitle')).toContainText('Qua Level 13, level cuối');
  await expect(page.locator('#mrDetail')).toContainText('Level cuối, đủ 3 sao.');
  await expect(page.locator('#mrDetail')).not.toContainText('gom đủ');
  await expect(page.locator('#mrNext')).toHaveText('Chơi lại Level 13');
  await page.click('#mrNext');
  expect(await page.evaluate(() => window.__mem.level)).toBe(13);
  expect(await page.evaluate(() => [window.memBest(), BB.gameStats('mem').best])).toEqual([13, 13]);
});

test('MEM-3: level ends as soon as the result is decided', async ({ page }) => {
  await open(page);
  await pickLevel(page, 1);
  await loseRound(page); await loseRound(page);
  await expect(page.locator('#mresult')).toBeVisible();
  await expect(page.locator('#mrBig')).toHaveText('0/2');
  await expect(page.locator('#mrStars .s.on')).toHaveCount(0);
});

test('stars: two clean rounds = 3 stars, recorded in BB stats', async ({ page }) => {
  await open(page);
  await pickLevel(page, 1);
  await winRound(page); await winRound(page);
  await expect(page.locator('#mresult')).toBeVisible();
  await expect(page.locator('#mrBig')).toHaveText('2/2');
  await page.clock.runFor(1500);
  await expect(page.locator('#mrStars .s.on')).toHaveCount(3);
  await expect(page.locator('#mrStarRule')).toContainText('3 sao');
  expect(await page.evaluate(() => BB.gameStats('mem'))).toEqual({ best: 1, stars: { 1: 3 } });
  await expect(page.locator('#mrNext')).toHaveText('Level 2 →');
});

test('MEM-2: pausing while tiles are lit hides them and replays the round', async ({ page }) => {
  await open(page);
  await pickLevel(page, 1);
  await untilPhase(page, 'show');
  await page.click('#mPause');
  await expect(page.locator('#mGrid .mtile.lit')).toHaveCount(0);
  await expect(page.locator('#mGrid')).toHaveCSS('visibility', 'hidden');
  await page.clock.runFor(5000);                     // time does not run out while paused
  await page.click('#mResume');
  await untilPhase(page, 'show');
  await expect(page.locator('#mGrid .mtile.lit')).toHaveCount(3);
  expect(await page.evaluate(() => window.__mem.round)).toBe(0);
});

test('MEM-4: tiles have labels and work with Enter/Space; Escape pauses', async ({ page }) => {
  await open(page);
  await pickLevel(page, 1);
  await untilPhase(page, 'input');
  await expect(page.locator('#mGrid .mtile').first()).toHaveAttribute('aria-label', 'Ô hàng 1, cột 1');
  const ts = await page.evaluate(() => window.__mem.targets);
  await page.locator('#mGrid .mtile').nth(ts[0]).focus();
  await page.keyboard.press('Enter');
  await page.locator('#mGrid .mtile').nth(ts[1]).focus();
  await page.keyboard.press(' ');
  await expect(page.locator('#mGrid .mtile.ok')).toHaveCount(2);
  await expect(page.locator('#mGrid .mtile').nth(ts[0])).toHaveAttribute('aria-label', /đúng$/);
  await page.keyboard.press('Escape');
  await expect(page.locator('#mpaused')).toBeVisible();
});

test('pointer tap counts once (no double fire from pointerdown + click)', async ({ page }) => {
  await open(page);
  await pickLevel(page, 1);
  await untilPhase(page, 'input');
  const ts = await page.evaluate(() => window.__mem.targets);
  await page.locator('#mGrid .mtile').nth(ts[0]).click();
  await expect(page.locator('#mHint')).toHaveText('Chạm lại các ô vừa sáng (1/3)');
});

test('HUD level pill follows the level chosen in the menu', async ({ page }) => {
  await open(page);
  await page.locator('#mlvgrid .lv').nth(4).click();
  await expect(page.locator('#mLevel')).toHaveText('Level 5 · 7 ô');
});

test('daily challenge hand-off starts the requested level directly', async ({ page }) => {
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(() => { BB.request('mem', 4); location.hash = 'nho'; });
  await expect(page.locator('#mmenu')).toBeHidden();
  expect(await page.evaluate(() => window.__mem.level)).toBe(4);
});

test('tiles stay >= 44px on a 320px screen at the 6x6 grid', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await open(page);
  await page.locator('#mlvgrid .lv').nth(12).click();
  const w = await page.locator('#mGrid .mtile').first().evaluate(e => e.getBoundingClientRect().width);
  expect(w).toBeGreaterThanOrEqual(44);
});

test('review: pause then quit to menu does not leave the next grid hidden', async ({ page }) => {
  await open(page);
  await pickLevel(page, 1);
  await untilPhase(page, 'show');
  await page.click('#mPause');
  await expect(page.locator('#mGrid')).toHaveCSS('visibility', 'hidden');
  await page.click('#mQuit');
  await page.click('#mStart');
  await untilPhase(page, 'input');
  await expect(page.locator('#mGrid')).toHaveCSS('visibility', 'visible');
  const ts = await page.evaluate(() => window.__mem.targets);
  const tile = page.locator(`#mGrid .mtile >> nth=${ts[0]}`);
  await tile.click({ timeout: 3000 });
  await expect(tile).toHaveClass(/ok/);
});

test('review: resume after a paused show says the round replays with new tiles', async ({ page }) => {
  await open(page);
  await pickLevel(page, 1);
  await untilPhase(page, 'show');
  await page.click('#mPause');
  await page.click('#mResume');
  await expect(page.locator('#mHint')).toHaveText('Lượt này chơi lại với ô mới…');
});

test('review: 6x6 tiles stay >= 44px in phone landscape (844x390) and the grid fits the screen', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await open(page, { lv: 14 });
  await pickLevel(page, 13);
  const r = await page.evaluate(() => {
    const t = document.querySelector('#mGrid .mtile').getBoundingClientRect();
    const g = document.querySelector('#mGrid').getBoundingClientRect();
    return { w: t.width, n: document.querySelectorAll('#mGrid .mtile').length, bottom: g.bottom, right: g.right };
  });
  expect(r.n).toBe(36);
  expect(r.w).toBeGreaterThanOrEqual(44);
  expect(r.bottom).toBeLessThanOrEqual(390);
  expect(r.right).toBeLessThanOrEqual(844);
});
