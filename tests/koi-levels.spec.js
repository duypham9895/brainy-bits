// Cá Koi 30 màn: the game reads its levels from BBD (js/difficulty.js + js/levels/koi.js).
// index.html gets those script tags from the integrator; until then this file adds them to the
// served page (before core.js) so the test runs against the integrated game either way.
// window.__koi exists only when the init script sets window.__BB_TEST__.
import { test, expect } from '@playwright/test';

async function withEngine(page) {
  await page.route(url => url.pathname === '/' || url.pathname === '/index.html', async route => {
    const res = await route.fetch();
    let html = await res.text();
    const core = '<script src="js/core.js"></script>';
    const add = [];
    if (!html.includes('js/difficulty.js')) add.push('<script src="js/difficulty.js"></script>');
    if (!html.includes('js/levels/koi.js')) add.push('<script src="js/levels/koi.js"></script>');
    if (add.length) html = html.replace(core, add.join('') + core);
    await route.fulfill({ response: res, body: html });
  });
}

async function openKoi(page, storage = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await withEngine(page);
  await page.addInitScript(s => {
    window.__BB_TEST__ = true;
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear();
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
      sessionStorage.setItem('seeded', '1');
    }
  }, storage);
  await page.goto('/');
  await page.click('#openKoi');
  await expect(page.locator('#kmenu')).toBeVisible();
  return errors;
}

async function start(page, lv) {
  await page.locator('#klvgrid .lv').nth(lv - 1).click();
  await page.click('#kStartBtn');
  await expect(page.locator('#kmenu')).toBeHidden();
}

// Feed every unfed koi, most isolated first, skipping the dial wait. Returns how many were fed.
async function feedAll(page) {
  let n = 0;
  for (let i = 0; i < 20; i++) {
    const ok = await page.evaluate(() => {
      const K = window.__koi, fs = K.fish;
      if (K.state !== 'play') return false;
      K.cooldown = 0;
      const iso = f => Math.min(...fs.filter(g => g !== f).map(g => Math.hypot(g.x - f.x, g.y - f.y)));
      const c = fs.filter(f => !f.decoy && !f.fed).sort((a, b) => iso(b) - iso(a))[0];
      if (!c) return false;
      const cv = document.getElementById('kcv'), r = cv.getBoundingClientRect();
      cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, isPrimary: true,
        button: 0, pointerType: 'touch', clientX: r.left + c.x, clientY: r.top + c.y }));
      return true;
    });
    if (!ok) break;
    n++;
  }
  return n;
}

test('engine wired: LV_MAX = 30 for game, hub and daily; legacy L1..10 = old formula', async ({ page }) => {
  const errors = await openKoi(page);
  const r = await page.evaluate(() => {
    const K = window.__koi;
    const old = d => ({ koi: Math.min(5 + d, 15), cd: Math.min(1.3 + 0.15 * d, 3.2),
      decoys: d >= 3 ? Math.min(1 + ((d - 3) / 2 | 0), 4) : 0, spdMul: 1, turnMul: 1 });   // koi.js params() before BBD
    const legacyDiff = [];
    for (let d = 1; d <= 10; d++) {
      const a = K.params(d), b = old(d);
      for (const k of Object.keys(b)) if (Math.abs(a[k] - b[k]) > 1e-9) legacyDiff.push(`L${d} ${k} ${a[k]} vs ${b[k]}`);
    }
    const newDiff = [];
    for (let L = 11; L <= 30; L++) {
      const a = K.params(L), b = window.BBD.level('koi', L);
      for (const k of ['koi', 'cd', 'decoys', 'spdMul', 'turnMul']) if (a[k] !== b[k]) newDiff.push(`L${L} ${k}`);
    }
    return { engine: K.engine, lvMax: K.LV_MAX, bb: BB.LV_MAX.koi, legacyDiff, newDiff };
  });
  expect(r).toEqual({ engine: true, lvMax: 30, bb: 30, legacyDiff: [], newDiff: [] });
  expect(errors).toEqual([]);
});

test('level grid shows 30 levels; L11+ say how many fish and how fast', async ({ page }) => {
  await openKoi(page, { koi_lv2: '11' });
  const lv = page.locator('#klvgrid .lv');
  await expect(lv).toHaveCount(30);
  await expect(lv.nth(10)).toHaveClass(/\bon\b/);                       // next unpassed level is chosen
  await expect(lv.nth(10).locator('small')).toHaveText('12 cá');         // L11 breather drops to 12 fish
  await expect(lv.nth(29).locator('small')).toHaveText('13 cá');
  await lv.nth(29).click();
  await expect(page.locator('#kLevelTxt')).toHaveText('13 cá koi + 5 cá xám · chờ 3,2 giây giữa 2 lần cho ăn · cá bơi nhanh ×1,4, đổi hướng ×1,3');
  await expect(page.locator('#kStartBtn')).toHaveText('Chơi Level 30 · 13 cá');
  await lv.nth(4).click();                                               // legacy text has no speed note
  await expect(page.locator('#kLevelTxt')).toHaveText('10 cá koi + 2 cá xám · chờ 2,0 giây giữa 2 lần cho ăn');
  const same = [];                                                       // every new level reads differently from the one before
  let prev = null;
  for (let L = 10; L <= 30; L++) {
    await lv.nth(L - 1).click();
    const t = await page.locator('#kLevelTxt').textContent();
    if (prev !== null && t === prev) same.push(`L${L}`);
    prev = t;
  }
  expect(same).toEqual([]);
});

test('level 30 starts with its own pond: fish count, decoys, speed and turning', async ({ page }) => {
  const errors = await openKoi(page, { koi_lv2: '30', bb_stats: JSON.stringify({ koi: { best: 29, stars: {} } }) });
  await start(page, 30);
  await expect(page.locator('#kPond')).toHaveText('Level 30 · 13 cá');
  const r = await page.evaluate(() => {
    const fs = window.__koi.fish;
    const koi = fs.filter(f => !f.decoy), grey = fs.filter(f => f.decoy);
    return { koi: koi.length, grey: grey.length, pellets: window.__koi.pellets, turnMul: window.__koi.turnMul,
      koiFast: koi.every(f => f.spd >= 30 * 1.4 - 1e-9 && f.spd <= 42 * 1.4 + 1e-9),
      greyFast: grey.every(f => f.spd >= 24 * 1.4 - 1e-9 && f.spd <= 36 * 1.4 + 1e-9) };
  });
  expect(r).toEqual({ koi: 13, grey: 5, pellets: 13, turnMul: 1.3, koiFast: true, greyFast: true });
  expect(errors).toEqual([]);
});

test('legacy progress: a player who finished the old 10 levels keeps stars and gets L11', async ({ page }) => {
  const stars = { 1: 3, 5: 2, 10: 3 };
  await openKoi(page, { koi_lv2: '11', koi_best: '10', bb_stats: JSON.stringify({ koi: { best: 10, stars } }) });
  const r = await page.evaluate(() => ({ lv: localStorage.getItem('koi_lv2'), st: BB.gameStats('koi'), kb: koiBest() }));
  expect(r).toEqual({ lv: '11', st: { best: 10, stars: { 1: 3, 5: 2, 10: 3 } }, kb: { best: 10, lv: 11 } });
  const lv = page.locator('#klvgrid .lv');
  await expect(lv.nth(9)).toHaveClass(/\bdone\b/);
  await expect(lv.nth(9).locator('.kst')).toHaveText('★★★');
  await expect(lv.nth(10)).not.toHaveClass(/\bdone\b/);
  await expect(page.locator('#kBestTxt')).toHaveText('Đã qua tới Level 10');
  expect(await page.evaluate(() => BB.daily().level)).toBeLessThanOrEqual(30);
});

test('legacy progress: a stale over-cap key from the old bug is still clamped to L11', async ({ page }) => {
  await openKoi(page, { koi_lv2: '14' });
  const r = await page.evaluate(() => ({ lv: localStorage.getItem('koi_lv2'), best: BB.gameStats('koi').best }));
  expect(r).toEqual({ lv: '11', best: 10 });
});

test('real progress past L11 is kept (best recorded by BB.record)', async ({ page }) => {
  await openKoi(page, { koi_lv2: '18', bb_stats: JSON.stringify({ koi: { best: 17, stars: { 17: 2 } } }) });
  const r = await page.evaluate(() => ({ lv: localStorage.getItem('koi_lv2'), kb: koiBest() }));
  expect(r).toEqual({ lv: '18', kb: { best: 17, lv: 18 } });
  await expect(page.locator('#klvgrid .lv').nth(17)).toHaveClass(/\bon\b/);
});

test('next-level flow: pass L10 → L11, pass L29 → L30, pass L30 → finished screen', async ({ page }) => {
  const errors = await openKoi(page, { koi_lv2: '10' });
  await start(page, 10);
  expect(await feedAll(page)).toBe(15);
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krNext')).toHaveText('Level 11 · 12 cá →');   // old game ended here
  await page.click('#krNext');
  await expect(page.locator('#kPond')).toHaveText('Level 11 · 12 cá');
  expect(await page.evaluate(() => localStorage.getItem('koi_lv2'))).toBe('11');

  await page.click('#kPauseBtn');
  await page.click('#kQuitBtn');
  await page.evaluate(() => { localStorage.setItem('koi_lv2', '29'); const s = BB.stats(); s.koi.best = 28; BB.store.setJson('bb_stats', s); });
  await expect(page.locator('#kmenu')).toBeVisible();
  await start(page, 29);
  expect(await feedAll(page)).toBe(12);
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krNext')).toHaveText('Level 30 · 13 cá →');
  await page.click('#krNext');
  await expect(page.locator('#kPond')).toHaveText('Level 30 · 13 cá');
  expect(await feedAll(page)).toBe(13);
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krTitle')).toContainText('Qua Level 30');
  await expect(page.locator('#krNext')).toHaveText('Xem tổng kết →');
  await page.click('#krNext');
  await expect(page.locator('#kdone h2')).toHaveText('Xong cả 30 level! 🎉');
  expect(await page.locator('#kdLevel').evaluate(b => b.parentNode.textContent)).toBe('30 level đã qua');
  expect(await page.evaluate(() => ({ lv: localStorage.getItem('koi_lv2'), best: BB.gameStats('koi').best })))
    .toEqual({ lv: '31', best: 30 });
  await page.click('#kdAgain');
  await expect(page.locator('#kBestTxt')).toHaveText('Đã qua cả 30 level');
  expect(errors).toEqual([]);
});

test('hit area: at 320 px the smallest fish still gets a ≥ 48 × 44 px tap ellipse', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openKoi(page, { koi_lv2: '15', bb_stats: JSON.stringify({ koi: { best: 14, stars: {} } }) });
  await start(page, 15);                                                 // 15 fish: fish shrink 0.85×
  const r = await page.evaluate(() => {
    const K = window.__koi, fs = K.fish;
    K.cooldown = 0;
    const f = fs.find(g => !g.decoy);
    fs.forEach(g => { if (g !== f) { g.x = -1000; g.y = -1000; } });     // no neighbour can win the tap
    const cv = document.getElementById('kcv'), rc = cv.getBoundingClientRect();
    // 21 px sideways from the body axis: inside b = 22 even though 0.32·L is only ~11 px here.
    const nx = -Math.sin(f.ang), ny = Math.cos(f.ang);
    cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, isPrimary: true, button: 0,
      pointerType: 'touch', clientX: rc.left + f.x + nx * 21 + Math.cos(f.ang) * f.L * 0.04, clientY: rc.top + f.y + ny * 21 + Math.sin(f.ang) * f.L * 0.04 }));
    return { small: f.L * 0.32 < 21, fed: f.fed };
  });
  expect(r).toEqual({ small: true, fed: true });
});
