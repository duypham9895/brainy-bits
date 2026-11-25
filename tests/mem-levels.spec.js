// Ô Sáng 30 màn: the game reads its levels from BBD (js/difficulty.js + js/levels/mem.js).
// index.html gets those two script tags from the integrator; until then this file adds them to the
// served page (before core.js) so the test runs against the integrated game either way.
import { test, expect, pickLevel as pickTile } from './fixtures.js';

async function withEngine(page) {
  await page.route(url => url.pathname === '/' || url.pathname === '/index.html', async route => {
    const res = await route.fetch();
    let html = await res.text();
    if (!html.includes('js/difficulty.js')) {
      html = html.replace('<script src="js/core.js"></script>',
        '<script src="js/difficulty.js"></script><script src="js/levels/mem.js"></script><script src="js/core.js"></script>');
    } else if (!html.includes('js/levels/mem.js')) {
      html = html.replace('<script src="js/core.js"></script>', '<script src="js/levels/mem.js"></script><script src="js/core.js"></script>');
    }
    await route.fulfill({ response: res, body: html });
  });
}
async function open(page, seed = {}) {
  await withEngine(page);
  await page.clock.install();
  await page.goto('/');
  await page.evaluate(kv => { localStorage.clear(); for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, v); }, seed);
  await page.reload();
  await page.click('#openMem');
  await expect(page.locator('#mmenu')).toBeVisible();
}
const phase = page => page.evaluate(() => window.__mem.phase);
async function untilPhase(page, want) {
  for (let i = 0; i < 300; i++) {
    if ((await phase(page)) === want) return;
    await page.clock.runFor(100);
  }
  throw new Error(`phase never became ${want}, is ${await phase(page)}`);
}
async function winRound(page) {
  await untilPhase(page, 'input');
  const ts = await page.evaluate(() => window.__mem.targets);
  for (const i of ts) await page.locator('#mGrid .mtile').nth(i).click();
  await page.clock.runFor(1100);
}
async function pickLevel(page, L) {
  await pickTile(page, '#mlvgrid', L);
  await page.click('#mStart');
}

test('engine wired: game plays table v2 from BBD, LV_MAX = 34, in-page fallback = table v1 (legacyLevels)', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const m = window.__mem, now = [], v1 = [];
    for (let L = 1; L <= 34; L++) { const b = BBD.level('mem', L); now.push([m.spec(L), { t: b.t, size: b.size, show: b.show, disp: b.disp }]); }
    for (let L = 1; L <= 13; L++) { const o = BBD.spec('mem').legacy[L - 1]; v1.push([m.legacySpec(L), { t: o.t, size: o.size, show: o.show, disp: o.disp }]); }
    return { uses: m.usesBBD, max: m.LV_MAX, bbMax: BB.LV_MAX.mem, bbd: BBD.maxLevel('mem'), ver: BBD.version('mem'), now, v1 };
  });
  expect(r.uses).toBe(true);
  expect([r.max, r.bbMax, r.bbd, r.ver]).toEqual([34, 34, 34, 2]);
  for (const [game, bbd] of r.now) expect(game).toEqual(bbd);
  for (const [fallback, v1] of r.v1) expect(fallback).toEqual(v1);
});

test('menu copy states a rule that holds for table v2 (no "mỗi level thêm 1 ô")', async ({ page }) => {
  await open(page);
  const how = page.locator('#mmenu .how');
  await expect(how).toContainText('Level sau thường nhiều ô hơn hoặc ô nằm xa nhau hơn.');
  await expect(how).not.toContainText('mỗi level thêm 1 ô');
  await expect(page.locator('#mLvTxt')).toHaveText('Lưới 4×4 · 3 ô sáng · nhìn 1,9 giây');
});

test('level grid shows 34 levels; L34 (step) is startable and plays with its BBD parameters', async ({ page }) => {
  await open(page, { mem_lv: '34' });
  await expect(page.locator('#mlvgrid .lv')).toHaveCount(34);
  await pickTile(page, '#mlvgrid', 34);
  await expect(page.locator('#mlvgrid .lv').nth(33)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#mlvgrid .lv').nth(33)).toHaveAttribute('aria-label', 'Level 34, 6 ô');
  await expect(page.locator('#mLvTxt')).toHaveText('Lưới 6×6 · 6 ô sáng · nhìn 2,8 giây');
  await page.click('#mStart');
  await untilPhase(page, 'input');
  await expect(page.locator('#mLevel')).toContainText('Level 34');
  const s = await page.evaluate(() => ({ level: window.__mem.level, n: document.querySelectorAll('#mGrid .mtile').length,
    lit: window.__mem.targets.length, w: document.querySelector('#mGrid .mtile').getBoundingClientRect().width }));
  expect(s).toMatchObject({ level: 34, n: 36, lit: 6 });
  expect(s.w).toBeGreaterThanOrEqual(44);
});

test('v1 progress survives the v2 table: mem_lv = 14 + old stars → 13 levels passed, L14 next, stars in place, migrated once', async ({ page }) => {
  await open(page, { mem_lv: '14', bb_stats: JSON.stringify({ mem: { best: 13, stars: { 13: 2, 5: 3 } } }) });
  await expect(page.locator('#mlvgrid .lv.done')).toHaveCount(13);
  await expect(page.locator('#mBestTxt')).toHaveText('Đã qua tới Level 13');
  await expect(page.locator('#mStart')).toHaveText('Chơi Level 14 · 3 ô');
  await expect(page.locator('#mlvgrid .lv').nth(12)).toHaveAttribute('data-st', '★★');
  await expect(page.locator('#mlvgrid .lv').nth(4)).toHaveAttribute('data-st', '★★★');
  expect(await page.evaluate(() => [window.memBest(), BB.gameStats('mem').stars[5], localStorage.getItem('bb_tablev_mem'), localStorage.getItem('mem_lv')]))
    .toEqual([13, 3, '2', '14']);
  await page.reload();                                         // second load: marker current, nothing moves
  expect(await page.evaluate(() => [BB.migrateProgress('mem').reason, JSON.parse(localStorage.getItem('bb_stats')).mem]))
    .toEqual(['current', { best: 13, stars: { 13: 2, 5: 3 } }]);
});

test('corrupt bb_stats and a junk version marker do not break the menu', async ({ page }) => {
  await open(page, { mem_lv: '4', bb_stats: '{bad', bb_tablev_mem: 'zz' });
  await expect(page.locator('#mlvgrid .lv')).toHaveCount(34);
  await expect(page.locator('#mlvgrid .lv.done')).toHaveCount(3);
  expect(await page.evaluate(() => localStorage.getItem('bb_tablev_mem'))).toBe('2');
});

test('next-level flow: pass L13 → L14 → result names what changes next', async ({ page }) => {
  await open(page, { mem_lv: '14' });
  await pickLevel(page, 13);
  await winRound(page); await winRound(page);
  await expect(page.locator('#mrTitle')).toHaveText('Qua Level 13! 🎉');
  await expect(page.locator('#mrNext')).toHaveText('Level 14 →');
  await page.click('#mrNext');
  expect(await page.evaluate(() => window.__mem.level)).toBe(14);
  await winRound(page); await winRound(page);
  await expect(page.locator('#mrDetail')).toContainText('Level 15 có 4 ô sáng.');
  expect(await page.evaluate(() => localStorage.getItem('mem_lv'))).toBe('15');
});

test('finished state after L34: L30 → L31 → L32 → L33 → L34, L34 records stars and shows "Đã qua hết 34 level"', async ({ page }) => {
  await open(page, { mem_lv: '30' });
  await pickLevel(page, 30);
  await winRound(page); await winRound(page);
  await expect(page.locator('#mrTitle')).toHaveText('Qua Level 30! 🎉');
  await expect(page.locator('#mrDetail')).toContainText('Level 31 có 5 ô sáng.');
  await expect(page.locator('#mrNext')).toHaveText('Level 31 →');
  await page.click('#mrNext');
  await winRound(page); await winRound(page);
  await expect(page.locator('#mrTitle')).toHaveText('Qua Level 31! 🎉');
  await expect(page.locator('#mrDetail')).toContainText('Level 32 có 6 ô sáng.');
  await expect(page.locator('#mrNext')).toHaveText('Level 32 →');
  await page.click('#mrNext');
  await winRound(page); await winRound(page);
  await expect(page.locator('#mrTitle')).toHaveText('Qua Level 32! 🎉');
  await expect(page.locator('#mrDetail')).toContainText('Level 33 có 6 ô sáng.');
  await expect(page.locator('#mrNext')).toHaveText('Level 33 →');
  await page.click('#mrNext');
  await winRound(page); await winRound(page);
  await expect(page.locator('#mrTitle')).toHaveText('Qua Level 33! 🎉');
  await expect(page.locator('#mrDetail')).toContainText('Level 34 có 6 ô sáng.');
  await expect(page.locator('#mrNext')).toHaveText('Level 34 →');
  await page.click('#mrNext');
  await winRound(page); await winRound(page);
  await expect(page.locator('#mrTitle')).toContainText('Qua Level 34, level cuối');
  await expect(page.locator('#mrNext')).toHaveText('Chơi lại Level 34');
  await page.click('#mrMenu');
  await expect(page.locator('#mBestTxt')).toHaveText('Đã qua hết 34 level');
  expect(await page.evaluate(() => [window.memBest(), BB.gameStats('mem').best, localStorage.getItem('mem_lv'), BB.gameStats('mem').stars[34]])).toEqual([34, 34, '35', 3]);
});
