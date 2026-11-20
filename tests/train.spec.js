// Đường Ray Tư Duy: regression tests for audit findings RTD-01..12, OPS-6, OPS-10, SHELL-08/17
// and the package C reward flow. Uses window.__rtd (read-only test hook in js/train.js).
import { test, expect } from '@playwright/test';

async function openTrain(page, init) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  if (init) await page.addInitScript(init);
  await page.goto('/');
  await page.click('#openTrain');
  await expect(page.locator('#menu')).toBeVisible();
  await page.waitForFunction(() => window.__rtd && window.__rtd.map);
  return errors;
}

test('RTD-01 / SHELL-17: HUD and overlays use "Level" and real defaults', async ({ page }) => {
  const errors = await openTrain(page);
  await expect(page.locator('#hLevel')).toHaveText(/^Level 1 · 5 ga$/);
  await expect(page.locator('#hTime')).toHaveText('90s');
  await expect(page.locator('#rNext')).not.toContainText('Màn');
  await expect(page.locator('#restartBtn')).toHaveText('Chơi lại level này');
  await page.locator('#lvgrid .lv').nth(6).click();
  await expect(page.locator('#hLevel')).toHaveText('Level 7 · 11 ga');
  expect(errors).toEqual([]);
});

test('RTD-06: Pause works during the countdown and resumes it', async ({ page }) => {
  await openTrain(page);
  await page.click('#startBtn');
  await page.click('#pauseBtn');
  await expect(page.locator('#paused')).toBeVisible();
  expect(await page.evaluate(() => __rtd.state)).toBe('paused');
  await page.click('#resumeBtn');
  expect(await page.evaluate(() => __rtd.state)).toBe('countdown');
});

test('double tap on Start generates one round only', async ({ page }) => {
  await openTrain(page);
  const calls = await page.evaluate(() => {
    let n = 0; const g = RTD_MAP.generate;
    RTD_MAP.generate = (...a) => { n++; return g(...a); };
    const b = document.getElementById('startBtn'); b.click(); b.click();
    RTD_MAP.generate = g;
    return n;
  });
  expect(calls).toBe(1);
  expect(await page.evaluate(() => __rtd.state)).toBe('countdown');
});

test('RTD-03: no two switches closer than 2 cells', async ({ page }) => {
  await openTrain(page);
  const dists = await page.evaluate(() => {
    const out = [];
    for (const [w, h] of [[320, 600], [800, 300], [390, 782]])
      for (let i = 0; i < 2; i++) out.push(RTD_MAP.minSwitchDist(RTD_MAP.generate(15, w, h)));
    return out;
  });
  for (const d of dists) expect(d).toBeGreaterThanOrEqual(2);
});

test('RTD-04 / OPS-6: passing Level 11 shows a finished state, never Level 12', async ({ page }) => {
  await openTrain(page);
  await page.click('#startBtn');
  await page.evaluate(() => __rtd.endWith(11, 20, 20));
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#rNext')).toHaveText('Chọn level khác');
  await expect(page.locator('#rTitle')).toContainText('Xong cả 11 level');
  await page.click('#rNext');
  await expect(page.locator('#menu')).toBeVisible();
  const best = await page.evaluate(() => [trainBest(), BB.gameStats('train').best, +localStorage.getItem('rtd_best3')]);
  expect(best).toEqual([11, 11, 11]);
  await expect(page.locator('#startBtn')).toHaveText('Chơi Level 11 · 15 ga');
});

test('RTD-09 + C: stars follow the rule, animate in, persist and show on the level tile', async ({ page }) => {
  await openTrain(page);
  await page.click('#startBtn');
  await page.evaluate(() => __rtd.endWith(3, 9, 10));     // 90% -> 2 stars
  await expect(page.locator('#rRule')).toContainText('90%: 2 sao');
  await expect(page.locator('#rStars .s.on')).toHaveCount(2, { timeout: 3000 });
  await expect(page.locator('#rPct')).toHaveText('90%', { timeout: 3000 });
  await expect(page.locator('#rNext')).toHaveText('Level 4 →');
  expect(await page.evaluate(() => BB.gameStats('train').stars[3])).toBe(2);
  await page.click('#rMenu');
  const tile = page.locator('#lvgrid .lv').nth(2);
  await expect(tile).toHaveClass(/done/);
  await expect(tile.locator('.lvst')).toHaveText('★★☆');
  // levels 1-2 were never played, so they are not marked done
  await expect(page.locator('#lvgrid .lv').nth(0)).not.toHaveClass(/done/);
});

test('legacy rtd_best3 is kept and capped at LV_MAX', async ({ page }) => {
  await openTrain(page, () => { try { localStorage.setItem('rtd_best3', '14'); } catch (e) {} });
  expect(await page.evaluate(() => trainBest())).toBe(11);
  await expect(page.locator('#bestTxt')).toHaveText('Đã qua cả 11 level');
});

test('OPS-10 / SHELL-08 + perf: leaving mid-round keeps the round and stops the loop', async ({ page }) => {
  await openTrain(page);
  await page.click('#startBtn');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => __rtd.running)).toBe(true);
  await page.goBack();                                    // browser Back to the hub
  await expect(page.locator('#hub')).toBeVisible();
  await page.waitForTimeout(250);
  expect(await page.evaluate(() => __rtd.running)).toBe(false);
  // hiding the tab while the hub is shown must not touch the train overlay
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
    delete document.hidden;
  });
  await page.click('#openTrain');
  await expect(page.locator('#paused')).toBeVisible();
  await expect(page.locator('#menu')).toBeHidden();
  await page.click('#resumeBtn');
  expect(await page.evaluate(() => ['countdown', 'play'].includes(__rtd.state))).toBe(true);
});

test('loop idles on the menu once nothing moves', async ({ page }) => {
  await openTrain(page);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => __rtd.running)).toBe(false);
});

test('RTD-02: rotating during play pauses with a hint; rotating in the menu redraws the map', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openTrain(page);
  await page.setViewportSize({ width: 780, height: 390 });
  await page.waitForFunction(() => __rtd.map.land === true);
  await page.setViewportSize({ width: 390, height: 780 });
  await page.waitForFunction(() => __rtd.map.land === false);
  await page.click('#startBtn');
  await page.waitForFunction(() => __rtd.state === 'play', null, { timeout: 6000 });
  await page.setViewportSize({ width: 780, height: 390 });
  await expect(page.locator('#paused')).toBeVisible();
  await expect(page.locator('#rtdRotate')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 780 });
  await expect(page.locator('#rtdRotate')).toBeHidden();
});

test('daily hand-off: BB.request starts the requested level directly', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { BB.request('train', 5); location.hash = 'tau'; });
  await page.waitForFunction(() => window.__rtd && __rtd.state === 'countdown');
  expect(await page.evaluate(() => __rtd.level)).toBe(5);
  await expect(page.locator('#menu')).toBeHidden();
});

test('RTD-12: full HUD fits at 320px and Pause is a 44px target', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openTrain(page);
  await page.locator('#lvgrid .lv').nth(10).click();
  await page.click('#startBtn');
  await page.click('#pauseBtn');
  const m = await page.evaluate(() => {
    document.getElementById('hScore').textContent = '✓ 12/15';
    const s = document.getElementById('hStreak'); s.textContent = '🔥 12'; s.classList.remove('hidden');
    document.getElementById('hTime').textContent = 'Chờ 3 tàu';
    const r = document.getElementById('pauseBtn').getBoundingClientRect();
    return { right: r.right, w: r.width, h: r.height, vw: innerWidth, sw: document.documentElement.scrollWidth };
  });
  expect(m.right).toBeLessThanOrEqual(m.vw);
  expect(m.sw).toBeLessThanOrEqual(m.vw);
  expect(m.w).toBeGreaterThanOrEqual(44);
  expect(m.h).toBeGreaterThanOrEqual(44);
});

test('RTD-08: 15 colours have 15 distinct shapes', async ({ page }) => {
  await openTrain(page);
  const g = await page.evaluate(() => RTD_MAP.GLYPHS);
  expect(new Set(g).size).toBe(15);
  const keys = await page.evaluate(() => __rtd.map.stations.map(s => s.ci));
  expect(new Set(keys).size).toBe(keys.length);
});

test('review #1: leaving from the result screen cancels queued stars, toasts and confetti', async ({ page }) => {
  await openTrain(page);
  await page.evaluate(() => {
    window.__calls = [];
    const t = BB.toast, c = BB.celebrate;
    BB.toast = s => { __calls.push('toast:' + s); return t(s); };
    BB.celebrate = o => { __calls.push('celebrate'); return c(o); };
  });
  await page.click('#startBtn');
  await page.evaluate(() => __rtd.endWith(1, 10, 10));
  await page.goBack();
  await expect(page.locator('#menu')).toBeHidden();
  // stars jump to their final value instead of animating on the hidden screen
  await expect(page.locator('#rStars .s.on')).toHaveCount(3);
  await page.waitForTimeout(1800);
  expect(await page.evaluate(() => __calls)).toEqual([]);
});

test('review #2: rotating while paused in the countdown draws a map for the new shape', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await openTrain(page);
  await page.click('#startBtn');
  await page.click('#pauseBtn');
  await page.setViewportSize({ width: 780, height: 390 });
  await page.waitForFunction(() => __rtd.map.land === true);
  await expect(page.locator('#rtdRotate')).toBeHidden();
  await page.click('#resumeBtn');
  expect(await page.evaluate(() => __rtd.state)).toBe('countdown');
});

test('review #3: result stars have role=img', async ({ page }) => {
  await openTrain(page);
  await expect(page.locator('#rStars')).toHaveAttribute('role', 'img');
});

test('review #7: write-capable test hook is absent for a normal player', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.goto('/');
  await page.waitForFunction(() => typeof window.trainEnter === 'function' && window.RTD_MAP);
  expect(await page.evaluate(() => typeof window.__rtd)).toBe('undefined');
  await page.goto('/?test');
  await page.waitForFunction(() => window.RTD_MAP);
  expect(await page.evaluate(() => typeof window.__rtd)).toBe('object');
});
