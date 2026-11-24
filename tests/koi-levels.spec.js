// Cá Koi 30 màn: the game reads its levels from BBD (js/difficulty.js + js/levels/koi.js).
// index.html gets those script tags from the integrator; until then this file adds them to the
// served page (before core.js) so the test runs against the integrated game either way.
// window.__koi exists only when the init script sets window.__BB_TEST__.
import { test, expect, pickLevel } from './fixtures.js';
import { feedAll } from './koi-helpers.js';

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
  await pickLevel(page, '#klvgrid', lv);
  await page.click('#kStartBtn');
  await expect(page.locator('#kmenu')).toBeHidden();
}

// feedAll: tests/koi-helpers.js (one shared helper, aims via the game's own fishAt()).

test('engine wired: LV_MAX = 33 for game, hub and daily; table v2 plays BBD rows, v1 kept as legacyLevels', async ({ page }) => {
  const errors = await openKoi(page);
  const r = await page.evaluate(() => {
    const K = window.__koi;
    const old = d => ({ koi: Math.min(5 + d, 15), cd: Math.min(1.3 + 0.15 * d, 3.2),
      decoys: d >= 3 ? Math.min(1 + ((d - 3) / 2 | 0), 4) : 0 });                 // koi.js params() before BBD (table v1)
    const legacyDiff = [], leg = window.BBD.spec('koi').legacy;
    for (let d = 1; d <= 10; d++) {
      const a = leg[d - 1], b = old(d);
      for (const k of Object.keys(b)) if (Math.abs(a[k] - b[k]) > 1e-9) legacyDiff.push(`L${d} ${k} ${a[k]} vs ${b[k]}`);
    }
    const newDiff = [];
    for (let L = 1; L <= 33; L++) {
      const a = K.params(L), b = window.BBD.level('koi', L);
      for (const k of ['koi', 'cd', 'decoys', 'spdMul', 'turnMul']) if (a[k] !== b[k]) newDiff.push(`L${L} ${k}`);
    }
    return { engine: K.engine, lvMax: K.LV_MAX, bb: BB.LV_MAX.koi, version: window.BBD.version('koi'), l1: K.params(1).koi, legacyDiff, newDiff };
  });
  expect(r).toEqual({ engine: true, lvMax: 33, bb: 33, version: 2, l1: 10, legacyDiff: [], newDiff: [] });
  expect(errors).toEqual([]);
});

test('level grid shows 33 levels; L11+ say how many fish and how fast', async ({ page }) => {
  await openKoi(page, { koi_lv2: '11' });
  const lv = page.locator('#klvgrid .lv');
  await expect(lv).toHaveCount(33);
  await expect(lv.nth(10)).toHaveClass(/\bon\b/);                       // next unpassed level is chosen
  await expect(lv.nth(10).locator('small')).toHaveText('12 cá');         // L11 holds 12 koi with 1 early grey decoy
  await expect(lv.nth(15).locator('small')).toHaveText('12 cá');         // L16 breather drops to 12 fish
  await expect(lv.nth(29).locator('small')).toHaveText('13 cá');
  await expect(lv.nth(30).locator('small')).toHaveText('12 cá');
  await expect(lv.nth(31).locator('small')).toHaveText('12 cá');
  await expect(lv.nth(32).locator('small')).toHaveText('12 cá');
  await expect(lv.nth(32)).toHaveAttribute('aria-label', 'Level 33, 12 cá');
  await pickLevel(page, '#klvgrid', 30);
  await expect(page.locator('#kLevelTxt')).toHaveText('13 cá koi + 5 cá xám · chờ 3,2 giây giữa 2 lần cho ăn · cá bơi nhanh ×1,4, đổi hướng ×1,3');
  await expect(page.locator('#kStartBtn')).toHaveText('Chơi Level 30 · thử thách');
  await pickLevel(page, '#klvgrid', 31);
  await expect(lv.nth(30)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#kLevelTxt')).toHaveText('12 cá koi + 5 cá xám · chờ 3,2 giây giữa 2 lần cho ăn · cá bơi nhanh ×1,3, đổi hướng ×1,25');
  await expect(page.locator('#kStartBtn')).toHaveText('Chơi Level 31 · 12 cá');
  await pickLevel(page, '#klvgrid', 32);
  await expect(lv.nth(31)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#kLevelTxt')).toHaveText('12 cá koi + 5 cá xám · chờ 3,2 giây giữa 2 lần cho ăn · cá bơi nhanh ×1,4, đổi hướng ×1,25');
  await expect(page.locator('#kStartBtn')).toHaveText('Chơi Level 32 · 12 cá');
  await pickLevel(page, '#klvgrid', 33);
  await expect(lv.nth(32)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#kLevelTxt')).toHaveText('12 cá koi + 5 cá xám · chờ 3,2 giây giữa 2 lần cho ăn · cá bơi nhanh ×1,4, đổi hướng ×1,25');
  await expect(page.locator('#kStartBtn')).toHaveText('Chơi Level 33 · 12 cá');
  await pickLevel(page, '#klvgrid', 1);                                   // spdMul 1: no speed note
  await expect(page.locator('#kLevelTxt')).toHaveText('10 cá koi · chờ 1,45 giây giữa 2 lần cho ăn');
  await pickLevel(page, '#klvgrid', 5);                                   // L5 is a step: adds the 12th koi, holds the L4 pace
  await expect(page.locator('#kLevelTxt')).toHaveText('12 cá koi · chờ 2,05 giây giữa 2 lần cho ăn · cá bơi nhanh ×1,1');
  await pickLevel(page, '#klvgrid', 15);                                  // L15, first peak (Duy 2026-11-22 B): 2nd grey fish, faster
  await expect(page.locator('#kLevelTxt')).toHaveText('12 cá koi + 2 cá xám · chờ 3 giây giữa 2 lần cho ăn · cá bơi nhanh ×1,35, đổi hướng ×1,15');
  await expect(lv.nth(0).locator('small')).toHaveText('10 cá');
  // L1–30 (authored) + L31–32 all differ from the level before; generated L33+ steps may share quantized knobs
  // because p* falls only ~0.003/level (matches scripts/sim/difficulty.koi.test.mjs).
  const same = [];
  let prev = null;
  for (let L = 1; L <= 32; L++) {
    await pickLevel(page, '#klvgrid', L);
    const t = await page.locator('#kLevelTxt').textContent();
    if (prev !== null && t === prev) same.push(`L${L}`);
    prev = t;
  }
  expect(same).toEqual([]);
});

test('level 33 (step) starts with its own pond: fish count, decoys, speed and turning', async ({ page }) => {
  const errors = await openKoi(page, { koi_lv2: '33', bb_stats: JSON.stringify({ koi: { best: 32, stars: {} } }) });
  await start(page, 33);
  await expect(page.locator('#kPond')).toHaveText('Level 33 · 12 cá');
  const r = await page.evaluate(() => {
    const fs = window.__koi.fish;
    const koi = fs.filter(f => !f.decoy), grey = fs.filter(f => f.decoy);
    return { koi: koi.length, grey: grey.length, pellets: window.__koi.pellets, turnMul: window.__koi.turnMul,
      koiFast: koi.every(f => f.spd >= 30 * 1.4 - 1e-9 && f.spd <= 42 * 1.4 + 1e-9),
      greyFast: grey.every(f => f.spd >= 24 * 1.4 - 1e-9 && f.spd <= 36 * 1.4 + 1e-9) };
  });
  expect(r).toEqual({ koi: 12, grey: 5, pellets: 12, turnMul: 1.25, koiFast: true, greyFast: true });
  expect(errors).toEqual([]);
});

// Table v1 → v2 (E3 lifted): real old keys, no bb_tablev_koi marker. Same level numbers, so nothing moves.
test('table v2 migration: old v1 progress keeps levels passed, stars and koi_lv2; marker written once', async ({ page }) => {
  const stats = { koi: { best: 6, stars: { 1: 3, 2: 2, 6: 1 } }, mem: { best: 4, stars: { 4: 2 } } };
  const errors = await openKoi(page, { koi_lv2: '7', koi_best: '6', bb_stats: JSON.stringify(stats) });
  const r = await page.evaluate(() => ({ v: localStorage.getItem('bb_tablev_koi'), lv: localStorage.getItem('koi_lv2'),
    st: BB.gameStats('koi'), mem: BB.gameStats('mem'), again: BB.migrateProgress('koi').reason }));
  expect(r).toEqual({ v: '2', lv: '7', st: stats.koi, mem: stats.mem, again: 'current' });
  const lv = page.locator('#klvgrid .lv');
  await expect(lv.nth(0).locator('.kst')).toHaveText('★★★');
  await expect(lv.nth(5)).toHaveAttribute('aria-label', 'Level 6, 12 cá, đã qua, 1 sao');
  await expect(lv.nth(6)).toHaveClass(/\bon\b/);                         // next unpassed level stays L7
  await expect(page.locator('#kBestTxt')).toHaveText('Đã qua tới Level 6');
  expect(errors).toEqual([]);
});

test('table v2 migration: corrupt bb_stats or marker does not crash the game', async ({ page }) => {
  const errors = await openKoi(page, { koi_lv2: '3', bb_stats: '{bad', bb_tablev_koi: 'zz' });
  expect(await page.evaluate(() => ({ v: localStorage.getItem('bb_tablev_koi'), best: BB.gameStats('koi').best })))
    .toEqual({ v: '2', best: 2 });                                         // koi_lv2 still seeds best = 2
  await expect(page.locator('#klvgrid .lv')).toHaveCount(33);
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
  expect(await page.evaluate(() => BB.daily().level)).toBeLessThanOrEqual(33);
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

test('next-level flow: pass L10 → L11, pass L30 → L31 → L32 → L33, pass L33 → finished screen', async ({ page }) => {
  const errors = await openKoi(page, { koi_lv2: '10' });
  await start(page, 10);
  expect(await feedAll(page)).toBe(12);
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krNext')).toHaveText('Level 11 · 12 cá →');   // old game ended here
  await page.click('#krNext');
  await expect(page.locator('#kPond')).toHaveText('Level 11 · 12 cá');
  expect(await page.evaluate(() => localStorage.getItem('koi_lv2'))).toBe('11');

  await page.click('#kPauseBtn');
  await page.click('#kQuitBtn');
  await page.evaluate(() => { localStorage.setItem('koi_lv2', '30'); const s = BB.stats(); s.koi.best = 29; BB.store.setJson('bb_stats', s); });
  await expect(page.locator('#kmenu')).toBeVisible();
  await start(page, 30);
  expect(await feedAll(page)).toBe(13);
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krNext')).toHaveText('Level 31 · 12 cá →');
  await page.click('#krNext');
  await expect(page.locator('#kPond')).toHaveText('Level 31 · 12 cá');
  expect(await feedAll(page)).toBe(12);
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krTitle')).toContainText('Qua Level 31');
  await expect(page.locator('#krNext')).toHaveText('Level 32 · 12 cá →');
  await page.click('#krNext');
  await expect(page.locator('#kPond')).toHaveText('Level 32 · 12 cá');
  expect(await feedAll(page)).toBe(12);
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krTitle')).toContainText('Qua Level 32');
  await expect(page.locator('#krNext')).toHaveText('Level 33 · 12 cá →');
  await page.click('#krNext');
  await expect(page.locator('#kPond')).toHaveText('Level 33 · 12 cá');
  expect(await feedAll(page)).toBe(12);
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krTitle')).toContainText('Qua Level 33');
  await expect(page.locator('#krNext')).toHaveText('Xem tổng kết →');
  await page.click('#krNext');
  await expect(page.locator('#kdone h2')).toHaveText('Xong cả 33 level! 🎉');
  // tổng sao của cả game (33 level × 3), không phải sao riêng L33; ô độ chính xác là số thật
  await expect(page.locator('#kdStars')).toHaveAttribute('aria-label', /^\d+ trên 99 sao$/);
  await expect(page.locator('#kdAcc')).toHaveText(/^\d+$/);
  expect(await page.locator('#kdAcc').evaluate(b => b.parentNode.textContent.slice(b.textContent.length))).toBe(' level đủ 3 sao');
  expect(await page.locator('#kdLevel').evaluate(b => b.parentNode.textContent)).toBe('33 level đã qua');
  expect(await page.evaluate(() => ({ lv: localStorage.getItem('koi_lv2'), best: BB.gameStats('koi').best, st33: BB.gameStats('koi').stars[33] })))
    .toEqual({ lv: '34', best: 33, st33: 3 });
  await page.click('#kdAgain');
  await expect(page.locator('#kBestTxt')).toHaveText('Đã qua cả 33 level');
  expect(errors).toEqual([]);
});

test('hit area: at 320 px the smallest fish still gets a ≥ 48 × 44 px tap ellipse', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await openKoi(page, { koi_lv2: '15', bb_stats: JSON.stringify({ koi: { best: 14, stars: {} } }) });
  await start(page, 15);                                                 // 12 koi + 2 grey (> 11 koi): fish shrink 0.85×
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
