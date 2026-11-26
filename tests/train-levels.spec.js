// Đường Ray Tư Duy: 30 levels from the shared difficulty table (js/difficulty.js + js/levels/train.js).
// Table v2 (2026-11-21, E3 lifted): L1..30 are authored on the shared sawtooth; old progress keys must still count.
import { test, expect, pickLevel } from './fixtures.js';

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

test('the level grid shows 35 levels and the hub/daily cap agrees', async ({ page }) => {
  const errors = await openTrain(page);
  await expect(page.locator('#lvgrid .lv')).toHaveCount(35);
  await expect(page.locator('#lvgrid .lv').nth(34)).toHaveAttribute('aria-label', 'Level 35, 15 ga, màn thử thách');
  const r = await page.evaluate(() => ({ usesTable: __rtd.usesTable, max: __rtd.LV_MAX, bb: BB.LV_MAX.train, bbd: BBD.maxLevel('train') }));
  expect(r).toEqual({ usesTable: true, max: 35, bb: 35, bbd: 35 });
  expect(errors).toEqual([]);
});

test('the game plays table v2 for L1..30; v1 rows stay in the table as reference', async ({ page }) => {
  await openTrain(page);
  const r = await page.evaluate(() => {
    const out = [];
    for (let L = 1; L <= 30; L++) {
      const s = __rtd.specFor(L), w = BBD.level('train', L);
      out.push([s.authored === true, s.stations === w.stations, s.base === w.base, s.speedF === 0.32, s.burstP === w.burstP && (L <= 4 ? s.burstP === 0 : s.burstP > 0)]);
    }
    const leg = BBD.spec('train').legacy.map((s, i) => s.stations === Math.min(5 + i, 15)
      && s.base === Math.max(1.8, 2.6 - 0.075 * i) * (0.75 / 0.45) && s.speedF === 0.45 && s.burstP === 0.15);
    return { out, leg, v: BBD.version('train'), ga: [1, 7, 15, 30].map(L => __rtd.specFor(L).stations) };
  });
  r.out.forEach((x, i) => expect(x, `L${i + 1}`).toEqual([true, true, true, true, true]));
  expect(r.leg).toEqual(Array(11).fill(true));
  expect(r.v).toBe(2);
  expect(r.ga).toEqual([5, 9, 15, 15]);
});

test('menu copy matches the table: first and last station count, no "+1 ga mỗi level"', async ({ page }) => {
  await openTrain(page);
  const how = page.locator('#menu .how');
  const rows = page.locator('#menu .how > div');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Chạm');
  await expect(rows.nth(2)).toContainText('Level 1 có 5 ga, lên dần tới 15 ga.');
  await expect(how).not.toContainText('mỗi level thêm 1 ga');
  await expect(rows.filter({ hasText: '90 giây' })).toHaveCount(1);
});

test('first boot of v2 migrates once: marker written, old stars and keys kept', async ({ page }) => {
  await openTrain(page, () => { try { if (!sessionStorage.getItem('seeded')) {
    localStorage.clear();
    localStorage.setItem('bb_stats', JSON.stringify({ train: { best: 14, stars: { 1: 3, 11: 1, 12: 2, 14: 1 } } }));
    localStorage.setItem('rtd_best3', '14');
    sessionStorage.setItem('seeded', '1'); } } catch (e) {} });
  const s = await page.evaluate(() => ({ v: localStorage.getItem('bb_tablev_train'), st: BB.gameStats('train'),
    rtd: localStorage.getItem('rtd_best3'), again: BB.migrateProgress('train').reason }));
  expect(s).toEqual({ v: '2', st: { best: 14, stars: { 1: 3, 11: 1, 12: 2, 14: 1 } }, rtd: '14', again: 'current' });
  await expect(page.locator('#lvgrid .lv').nth(11).locator('.lvst')).toHaveText('★★☆');
  await expect(page.locator('#startBtn')).toHaveText('Chơi Level 15 · thử thách');
});

test('corrupt progress does not crash the game on boot', async ({ page }) => {
  const errors = await openTrain(page, () => { try { if (!sessionStorage.getItem('seeded')) {
    localStorage.clear();
    localStorage.setItem('bb_stats', '{bad'); localStorage.setItem('bb_tablev_train', 'zz'); localStorage.setItem('rtd_best3', '3');
    sessionStorage.setItem('seeded', '1'); } } catch (e) {} });
  await expect(page.locator('#lvgrid .lv')).toHaveCount(35);
  await expect(page.locator('#startBtn')).toHaveText('Chơi Level 4 · 7 ga');
  expect(errors).toEqual([]);
});

test('level 35 (peak) can be picked and started, with its table parameters', async ({ page }) => {
  const errors = await openTrain(page);
  await pickLevel(page, '#lvgrid', 35);
  await expect(page.locator('#lvgrid .lv').nth(34)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#startBtn')).toHaveText('Chơi Level 35 · thử thách');
  await expect(page.locator('#hLevel')).toHaveText('Level 35 · 15 ga');
  await page.click('#startBtn');
  const s = await page.evaluate(() => ({ state: __rtd.state, level: __rtd.level, spec: { ...__rtd.spec },
    want: { ...BBD.level('train', 35) }, ga: __rtd.map.stations.length }));
  expect(s.state).toBe('countdown');
  expect(s.level).toBe(35);
  expect(s.spec).toEqual(s.want);
  expect(s.spec.kind).toBe('peak');
  expect(s.ga).toBe(15);
  expect(errors).toEqual([]);
});

test('next-level flow: L11 leads on to L12, a peak announces the breather', async ({ page }) => {
  await openTrain(page);
  await page.click('#startBtn');
  await page.evaluate(() => __rtd.endWith(11, 20, 20));
  await expect(page.locator('#rTitle')).toHaveText('Qua Level 11! 🎉');
  await expect(page.locator('#rNext')).toHaveText('Level 12 →');
  await expect(page.locator('#rDetail')).toHaveText('Level 12 có 13 ga.');
  await page.click('#rNext');
  expect(await page.evaluate(() => [__rtd.state, __rtd.level, __rtd.spec.base === BBD.level('train', 12).base])).toEqual(['countdown', 12, true]);
  await page.evaluate(() => __rtd.endWith(15, 19, 20));
  await expect(page.locator('#rDetail')).toHaveText('Level 16 là màn nghỉ: tàu ra thưa hơn.');
  await page.click('#rNext');
  expect(await page.evaluate(() => __rtd.level)).toBe(16);
});

test('passing level 30 leads to L31 breather, L31 → L32 → L33 → L34 → L35 peak, and L35 records stars and shows the finished state', async ({ page }) => {
  await openTrain(page);
  await page.click('#startBtn');
  await page.evaluate(() => __rtd.endWith(30, 20, 20));
  await expect(page.locator('#rTitle')).toHaveText('Qua Level 30! 🎉');
  await expect(page.locator('#rDetail')).toHaveText('Level 31 là màn nghỉ: tàu ra thưa hơn.');
  await expect(page.locator('#rNext')).toHaveText('Level 31 →');
  await page.click('#rNext');
  expect(await page.evaluate(() => __rtd.level)).toBe(31);
  await page.evaluate(() => __rtd.endWith(31, 20, 20));
  await expect(page.locator('#rTitle')).toHaveText('Qua Level 31! 🎉');
  await expect(page.locator('#rDetail')).toHaveText('Level 32: tàu ra dày hơn.');
  await expect(page.locator('#rNext')).toHaveText('Level 32 →');
  await page.click('#rNext');
  expect(await page.evaluate(() => __rtd.level)).toBe(32);
  await page.evaluate(() => __rtd.endWith(32, 20, 20));
  await expect(page.locator('#rTitle')).toHaveText('Qua Level 32! 🎉');
  await expect(page.locator('#rDetail')).toHaveText('Level 33: tàu ra dày hơn.');
  await expect(page.locator('#rNext')).toHaveText('Level 33 →');
  await page.click('#rNext');
  expect(await page.evaluate(() => __rtd.level)).toBe(33);
  await page.evaluate(() => __rtd.endWith(33, 20, 20));
  await expect(page.locator('#rTitle')).toHaveText('Qua Level 33! 🎉');
  await expect(page.locator('#rDetail')).toHaveText('Level 34: tàu ra dày hơn.');
  await expect(page.locator('#rNext')).toHaveText('Level 34 →');
  await page.click('#rNext');
  expect(await page.evaluate(() => __rtd.level)).toBe(34);
  await page.evaluate(() => __rtd.endWith(34, 20, 20));
  await expect(page.locator('#rTitle')).toHaveText('Qua Level 34! 🎉');
  await expect(page.locator('#rDetail')).toHaveText('Level 35: tàu ra dày hơn.');
  await expect(page.locator('#rNext')).toHaveText('Level 35 · thử thách →');
  await page.click('#rNext');
  expect(await page.evaluate(() => __rtd.level)).toBe(35);
  await page.evaluate(() => __rtd.endWith(35, 20, 20));
  await expect(page.locator('#rTitle')).toContainText('Xong cả 35 level');
  await expect(page.locator('#rNext')).toHaveText('Chọn level khác');
  await page.click('#rNext');
  await expect(page.locator('#menu')).toBeVisible();
  expect(await page.evaluate(() => [trainBest(), BB.gameStats('train').best, +localStorage.getItem('rtd_best3'), BB.gameStats('train').stars[35]])).toEqual([35, 35, 35, 3]);
  await expect(page.locator('#bestTxt')).toHaveText('Đã qua cả 35 level');
  await expect(page.locator('#startBtn')).toHaveText('Chơi Level 35 · thử thách');
});

test('old progress keys still count: rtd_best3 only, and bb_stats stars', async ({ page }) => {
  await openTrain(page, () => { try { if (!sessionStorage.getItem('seeded')) {
    localStorage.clear(); localStorage.setItem('rtd_best3', '11'); sessionStorage.setItem('seeded', '1'); } } catch (e) {} });
  await expect(page.locator('#lvgrid .lv.done')).toHaveCount(11);
  await expect(page.locator('#bestTxt')).toHaveText('Đã qua tới Level 11');
  await expect(page.locator('#startBtn')).toHaveText('Chơi Level 12 · 13 ga');   // a finished 11-level player moves on
  await expect(page.locator('#lvgrid .lv').nth(11)).not.toHaveClass(/done/);
});

test('stars saved under the old 11-level cap keep showing', async ({ page }) => {
  await openTrain(page, () => { try { if (!sessionStorage.getItem('seeded')) {
    localStorage.clear();
    localStorage.setItem('bb_stats', JSON.stringify({ train: { best: 9, stars: { 3: 2, 9: 3 } } }));
    sessionStorage.setItem('seeded', '1'); } } catch (e) {} });
  const tiles = page.locator('#lvgrid .lv');
  await expect(tiles.nth(8).locator('.lvst')).toHaveText('★★★');
  await expect(tiles.nth(2).locator('.lvst')).toHaveText('★★☆');
  await expect(page.locator('#startBtn')).toHaveText('Chơi Level 10 · 11 ga');
});

test('without the table (script blocked) the game still boots on the old 11 levels', async ({ page }) => {
  await page.route(/js\/(difficulty|levels\/train)\.js/, r => r.abort());
  const errors = await openTrain(page);
  await expect(page.locator('#lvgrid .lv')).toHaveCount(11, { timeout: 1500 });   // no 4 s hang on the dead static tag
  expect(await page.evaluate(() => __rtd.usesTable)).toBe(false);
  await page.click('#startBtn');
  await expect(page.locator('#menu')).toBeHidden({ timeout: 1500 });
  expect(errors).toEqual([]);
});

test('320 px phone: 35 tiles fit without sideways scroll; switch tap targets stay ≥ 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openTrain(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await pickLevel(page, '#lvgrid', 35);
  await page.click('#startBtn');
  const t = await page.evaluate(() => {
    const cell = __rtd.cell, TR = cell * 0.48;
    const sw = __rtd.map.switches.map(s => s.g);
    let minG = Infinity;                    // Euclid: two switches can sit diagonally (Manhattan 2 = √2 cells)
    for (let a = 0; a < sw.length; a++) for (let b = a + 1; b < sw.length; b++)
      minG = Math.min(minG, Math.hypot(sw[a].c - sw[b].c, sw[a].r - sw[b].r));
    return { hit: 2 * Math.max(32, TR + 16), spacing: minG * cell, disc: 2 * __rtd.discR() };
  });
  expect(t.hit).toBeGreaterThanOrEqual(44);
  expect(t.spacing).toBeGreaterThanOrEqual(44);
  expect(t.disc).toBeGreaterThanOrEqual(44);   // MERGED-SPEC A-5: the drawn switch disc, not only the hit area
});
