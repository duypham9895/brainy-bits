// Ô Sáng 30 màn: the game reads its levels from BBD (js/difficulty.js + js/levels/mem.js).
// index.html gets those two script tags from the integrator; until then this file adds them to the
// served page (before core.js) so the test runs against the integrated game either way.
import { test, expect } from '@playwright/test';

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
  await page.locator('#mlvgrid .lv').nth(L - 1).click();
  await page.click('#mStart');
}

test('engine wired: BBD drives the game, LV_MAX = 30 everywhere, in-page fallback matches BBD on L1..13 (HEAD parity: difficulty.test.mjs)', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const m = window.__mem, out = [];
    for (let L = 1; L <= 13; L++) out.push([m.spec(L), m.legacySpec(L)]);
    return { uses: m.usesBBD, max: m.LV_MAX, bbMax: BB.LV_MAX.mem, bbd: BBD.maxLevel('mem'), pairs: out };
  });
  expect(r.uses).toBe(true);
  expect([r.max, r.bbMax, r.bbd]).toEqual([30, 30, 30]);
  for (const [now, old] of r.pairs) expect(now).toEqual(old);
});

test('level grid shows 30 levels; L30 is startable and plays with its BBD parameters', async ({ page }) => {
  await open(page, { mem_lv: '30' });
  await expect(page.locator('#mlvgrid .lv')).toHaveCount(30);
  await page.locator('#mlvgrid .lv').nth(29).click();
  await expect(page.locator('#mLvTxt')).toHaveText('Lưới 6×6 · 15 ô sáng · nhìn 4,2 giây · ô rải xa');
  await page.click('#mStart');
  await untilPhase(page, 'input');
  const s = await page.evaluate(() => ({ level: window.__mem.level, n: document.querySelectorAll('#mGrid .mtile').length,
    lit: window.__mem.targets.length, w: document.querySelector('#mGrid .mtile').getBoundingClientRect().width }));
  expect(s).toMatchObject({ level: 30, n: 36, lit: 15 });
  expect(s.w).toBeGreaterThanOrEqual(44);
});

test('legacy progress: mem_lv = 14 (finished all 13 old levels) unlocks L14, not the finished state', async ({ page }) => {
  await open(page, { mem_lv: '14', bb_stats: JSON.stringify({ mem: { best: 13, stars: { 13: 2, 5: 3 } } }) });
  await expect(page.locator('#mlvgrid .lv.done')).toHaveCount(13);
  await expect(page.locator('#mBestTxt')).toHaveText('Đã qua tới Level 13');
  await expect(page.locator('#mStart')).toHaveText('Chơi Level 14 · 15 ô');
  await expect(page.locator('#mlvgrid .lv').nth(12)).toHaveAttribute('data-st', '★★');
  expect(await page.evaluate(() => [window.memBest(), BB.gameStats('mem').stars[5]])).toEqual([13, 3]);
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
  await expect(page.locator('#mrDetail')).toContainText('Level 15 vẫn 15 ô, chỉ được nhìn 4,4 giây.');
  expect(await page.evaluate(() => localStorage.getItem('mem_lv'))).toBe('15');
});

test('finished state after L30: last-level copy, replay button, "Đã qua hết 30 level"', async ({ page }) => {
  await open(page, { mem_lv: '30' });
  await pickLevel(page, 30);
  await winRound(page); await winRound(page);
  await expect(page.locator('#mrTitle')).toContainText('Qua Level 30, level cuối');
  await expect(page.locator('#mrNext')).toHaveText('Chơi lại Level 30');
  await page.click('#mrMenu');
  await expect(page.locator('#mBestTxt')).toHaveText('Đã qua hết 30 level');
  expect(await page.evaluate(() => [window.memBest(), BB.gameStats('mem').best, localStorage.getItem('mem_lv')])).toEqual([30, 30, '31']);
});
