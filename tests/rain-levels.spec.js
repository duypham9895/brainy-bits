// Mưa Phép Tính, 30 levels: the game reads BBD.level('rain', L) from table version 2 (E3 lifted 2026-11-21:
// L1..9 keep the old rows (decision 2, 2026-11-21: tiers 7–9 back at L7–9), L10..30 retuned, breathers carry the E4 safety net), old progress keys still count
// and migrate once, and the next-level flow runs to a finished state after L30.
// Run: PW_PORT=8964 npx playwright test tests/rain-levels.spec.js
import { test, expect } from '@playwright/test';
import { loadBBD } from '../scripts/sim/load-bbd.mjs';
import { CANVAS_H } from '../scripts/sim/adapters/rain.mjs';

async function openRain(page, setup) {
  if (setup) await page.addInitScript(setup);
  await page.goto('/#mua');
  await expect(page.locator('#rmenu')).toBeVisible();
  await expect(page.locator('#rlvgrid .lv')).toHaveCount(30);
}
const dbg = page => page.evaluate(() => window.__rainDebug());

async function startAt(page, L) {
  const b = page.locator('#rlvgrid .lv').nth(L - 1);
  await b.scrollIntoViewIfNeeded();
  await b.click();
  await page.click('#rStart');
  await expect(page.locator('#rmenu')).toBeHidden();
}
// Win the current round: drop a fresh unique answer, type whatever is lowest, repeat.
async function winRound(page) {
  for (let i = 0; i < 60; i++) {
    if ((await dbg(page)).state === 'result') return;
    await page.evaluate(i => window.__rainTest.spawnDrop(900 + i, 0.1), i);
    const d = (await dbg(page)).drops.find(x => x.ans >= 900) || (await dbg(page)).drops[0];
    for (const ch of String(d.ans)) await page.keyboard.press(ch);
    // A right answer pops by itself. Enter only for a pending prefix; on the result screen it would press #rrNext.
    const s = await dbg(page);
    if (s.state === 'play' && s.input) await page.keyboard.press('Enter');
  }
}

test('grid shows 30 levels; hub and daily agree on 30', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await openRain(page);
  const r = await page.evaluate(() => ({ core: window.BB.LV_MAX.rain, bbd: window.BBD.maxLevel('rain'), t: window.__rainTest.lvMax() }));
  expect(r).toEqual({ core: 30, bbd: 30, t: 30 });
  await expect(page.locator('#rlvgrid .lv').nth(29)).toContainText('25 phép');
  expect(errors).toEqual([]);
});

// Was "legacy L1..10 = old formula, legacy: true". v2 truth: L1..6 still play the old formula (authored rows,
// 3 lives); L7..9 keep tiers 7..9 (decision 2, 2026-11-21) with faster rain, L10 is retuned (speed ramp over L7..10,
// review 2026-11-22); the old rows survive as legacyLevels; every row matches the Node table.
test('v2: L1..6 play the old formula with 3 lives, L7..10 keep their tier at faster rain, legacyLevels keep L1..10; L1..30 match the Node tables', async ({ page }) => {
  await openRain(page);
  const r = await page.evaluate(() => Array.from({ length: 30 }, (_, i) => ({ ...window.__rainTest.spec(i + 1) })));
  const leg = await page.evaluate(() => window.BBD.spec('rain').legacy.map(x => ({ ...x })));
  expect(await page.evaluate(() => window.BBD.version('rain'))).toBe(2);
  for (let L = 1; L <= 10; L++) {                   // old js/rain.js spec(L), verbatim
    const old = { fall: Math.max(8, 13 - 0.55 * (L - 1)), every: Math.max(2.7, 4.6 - 0.2 * (L - 1)), target: 10 + L };
    expect(leg[L - 1]).toEqual({ ...old, ops: L });
    if (L <= 6) expect(r[L - 1]).toMatchObject({ ...old, ops: L, lives: 3, legacy: false, authored: true });
    else {                                          // L7..10: same tier and chain, faster rain (speed ramp)
      expect(r[L - 1]).toMatchObject({ ops: L, target: old.target, lives: 3, legacy: false, authored: true });
      expect(r[L - 1].every < old.every && r[L - 1].fall < old.fall).toBe(true);
    }
  }
  const B = loadBBD();
  for (let L = 1; L <= 30; L++) expect(r[L - 1]).toEqual({ ...B.level('rain', L) });
});

test('breather safety net: L11 has 10 drops and 4 lives in menu, HUD and play; 4th miss loses, 3 misses do not', async ({ page }) => {
  await openRain(page, () => { localStorage.setItem('rain_lv', '12'); });
  const b = page.locator('#rlvgrid .lv').nth(10);
  await b.scrollIntoViewIfNeeded(); await b.click();
  await expect(page.locator('#rLvTxt')).toHaveText('Thêm cộng, trừ có nhớ · giải 10 phép · 4 mạng');
  await page.locator('#rlvgrid .lv').nth(11).click();
  await expect(page.locator('#rLvTxt')).toContainText('· 3 mạng');
  await page.locator('#rlvgrid .lv').nth(10).click();
  await page.click('#rStart');
  expect(await dbg(page)).toMatchObject({ state: 'play', level: 11, target: 10, lives: 4 });
  await expect(page.locator('#rLives')).toHaveAttribute('aria-label', 'Còn 4 mạng');
  await expect(page.locator('#rLives')).toHaveText('💧💧💧💧');
  await page.evaluate(() => { for (const a of [991, 992, 993]) window.__rainTest.spawnDrop(a, 0.99); });
  await page.waitForFunction(() => window.__rainDebug().misses === 3);
  expect((await dbg(page)).state).toBe('play');
  await expect(page.locator('#rLives')).toHaveAttribute('aria-label', 'Còn 1 mạng');
  await expect(page.locator('#rLives')).toHaveText('💧···');
  await page.evaluate(() => window.__rainTest.spawnDrop(994, 0.99));
  await expect(page.locator('#rresult')).toBeVisible();
  await expect(page.locator('#rrDetail')).toHaveText('Để rơi xuống nước 4 giọt. Giải đủ 10 phép trước khi hết 4 mạng nhé.');
  await expect(page.locator('#rrStars')).toHaveAttribute('aria-label', '0 trên 3 sao');
  // the lives pill fits the HUD row at 320 px (4 drops is the widest it gets)
  await page.setViewportSize({ width: 320, height: 640 });
  const fit = await page.evaluate(() => { const r = document.getElementById('rLives').getBoundingClientRect(); return r.right <= innerWidth && document.documentElement.scrollWidth <= innerWidth; });
  expect(fit).toBe(true);
});

test('breather stars: winning L11 with 2 misses still gives 1 star; L12 is back to 3 lives', async ({ page }) => {
  await openRain(page, () => { localStorage.setItem('rain_lv', '12'); });
  await startAt(page, 11);
  await page.evaluate(() => { for (const a of [991, 992]) window.__rainTest.spawnDrop(a, 0.99); });
  await page.waitForFunction(() => window.__rainDebug().misses === 2);
  await winRound(page);
  await expect(page.locator('#rrTitle')).toContainText('Qua Level 11');
  await expect(page.locator('#rrStars')).toHaveAttribute('aria-label', '1 trên 3 sao');
  await page.click('#rrNext');
  expect(await dbg(page)).toMatchObject({ state: 'play', level: 12, target: 20, lives: 3 });
  await expect(page.locator('#rLives')).toHaveAttribute('aria-label', 'Còn 3 mạng');
});

// Real v1 keys as the shipped game left them (no bb_tablev_rain): the page migrates once on load.
test('old keys (v1, no marker) → v2 on load: marker written once, best, stars and rain_lv kept', async ({ page }) => {
  await openRain(page, () => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('rain_lv', '14');
    localStorage.setItem('bb_stats', JSON.stringify({ rain: { best: 13, stars: { 1: 3, 11: 2, 13: 1 } }, koi: { best: 4, stars: { 2: 3 } } }));
  });
  const st = await page.evaluate(() => ({ v: localStorage.getItem('bb_tablev_rain'), lv: localStorage.getItem('rain_lv'), s: JSON.parse(localStorage.getItem('bb_stats')) }));
  expect([st.v, st.lv]).toEqual(['2', '14']);
  expect(st.s.rain).toEqual({ best: 13, stars: { 1: 3, 11: 2, 13: 1 } });   // same level numbers in v2: nothing moves
  expect(st.s.koi).toEqual({ best: 4, stars: { 2: 3 } });                   // other games' entries untouched
  await expect(page.locator('#rlvgrid .lv.done')).toHaveCount(13);
  await expect(page.locator('#rStart')).toHaveText('Chơi Level 14');
  await expect(page.locator('#rlvgrid .lv').nth(10)).toHaveAttribute('aria-label', /2 sao/);
  const snap = await page.evaluate(() => localStorage.getItem('bb_stats'));
  await page.reload();
  await expect(page.locator('#rmenu')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('bb_stats'))).toBe(snap);
});

test('corrupt saved data does not break the menu: junk bb_stats and marker, rain_lv still opens its level', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await openRain(page, () => {
    localStorage.setItem('bb_stats', '{bad');
    localStorage.setItem('bb_tablev_rain', 'zz');
    localStorage.setItem('rain_lv', '9');
  });
  await expect(page.locator('#rStart')).toHaveText('Chơi Level 9');
  await expect(page.locator('#rlvgrid .lv.done')).toHaveCount(8);
  expect(await page.evaluate(() => localStorage.getItem('bb_tablev_rain'))).toBe('2');
  expect(errors).toEqual([]);
});

// Was "L1..10 keep the old text" (level L = tier L). v2 after decision 2 (2026-11-21): level L = tier L again
// on L1..10, so L1..10 show the old names.
test('level names: tiers 1..10 keep the old text, v2 levels show their tier, new tiers named at their breathers', async ({ page }) => {
  await openRain(page);
  const n = await page.evaluate(() => window.__rainTest.LVINFO.map(x => x && x.name));
  const old = ['Cộng trong phạm vi 10', 'Cộng, trừ trong phạm vi 10', 'Cộng, trừ trong phạm vi 20',
    'Cộng, trừ trong phạm vi 50', 'Cộng, trừ trong phạm vi 100', 'Bảng nhân 2–5', 'Bảng nhân 2–9',
    'Nhân, chia (bảng 2–9)', 'Đủ 4 phép tính', 'Đủ 4 phép tính, số lớn hơn'];
  expect(await page.evaluate(() => window.BBRain.TIER_NAME.slice(1, 11))).toEqual(old);
  expect(n.slice(1, 11)).toEqual(old);
  expect([n[11], n[16], n[21], n[26]]).toEqual(['Thêm cộng, trừ có nhớ', 'Thêm tìm số còn thiếu',
    'Thêm phép tính hai bước', 'Thêm nhân số có hai chữ số']);
});

test('level 30 starts, spawns valid equations and an answer pops a drop', async ({ page }) => {
  await openRain(page);
  await startAt(page, 30);
  let s = await dbg(page);
  expect(s).toMatchObject({ state: 'play', level: 30, target: 25 });
  // adapter constant CANVAS_H: the simulated water line must sit where the phone puts it (±15%)
  expect(Math.abs(s.H - CANVAS_H) / CANVAS_H).toBeLessThan(0.15);
  await page.waitForFunction(() => window.__rainDebug().drops.length > 0, null, { timeout: 5000 });
  const d = (await dbg(page)).drops[0];
  expect(d.ans).toBeGreaterThanOrEqual(0); expect(d.ans).toBeLessThanOrEqual(999);
  for (const ch of String(d.ans)) await page.keyboard.press(ch);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => window.__rainDebug().solved >= 1, null, { timeout: 3000 });
  // tier 14 really produces its new operations and keeps answers on a 3-digit numpad
  const mix = await page.evaluate(() => {
    const seen = { miss: 0, two: 0, big: 0 }; let max = 0;
    for (let i = 0; i < 3000; i++) {
      const [eq, a] = window.__rainTest.makeEq(30);
      if (eq.startsWith('?')) seen.miss++;
      if ((eq.match(/[+−×÷]/g) || []).length === 2) seen.two++;
      if (/^\d+ × \d+$/.test(eq) && a > 144) seen.big++;      // only 2-digit × 1-digit goes past 12 × 12
      max = Math.max(max, a);
    }
    return { seen, max };
  });
  expect(mix.seen.miss).toBeGreaterThan(0); expect(mix.seen.two).toBeGreaterThan(0); expect(mix.seen.big).toBeGreaterThan(0);
  expect(mix.max).toBeLessThanOrEqual(999);
});

test('old progress: rain_lv = 11 (finished the old 10) opens L11; stars from bb_stats stay', async ({ page }) => {
  await openRain(page, () => {
    localStorage.setItem('rain_lv', '11');
    localStorage.setItem('bb_stats', JSON.stringify({ rain: { best: 10, stars: { 5: 3, 10: 2 } } }));
  });
  await expect(page.locator('#rlvgrid .lv.done')).toHaveCount(10);
  await expect(page.locator('#rBestTxt')).toHaveText('Đã qua tới Level 10');
  await expect(page.locator('#rStart')).toHaveText('Chơi Level 11');
  await expect(page.locator('#rlvgrid .lv').nth(4)).toHaveAttribute('aria-label', /3 sao/);
  await expect(page.locator('#rlvgrid .lv').nth(9)).toHaveAttribute('aria-label', /2 sao/);
  const g = await page.evaluate(() => window.BB.gameStats('rain'));
  expect(g).toEqual({ best: 10, stars: { 5: 3, 10: 2 } });
});

test('next-level flow: L10 leads to L11; passing L30 shows the finished state', async ({ page }) => {
  await openRain(page, () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('rain_lv', '10'); } });
  await startAt(page, 10);
  await winRound(page);
  await expect(page.locator('#rrTitle')).toContainText('Qua Level 10');
  await expect(page.locator('#rrDetail')).toHaveText('Level 11: thêm cộng, trừ có nhớ, 4 mạng.');
  await expect(page.locator('#rrNext')).toHaveText('Level 11 →');
  // the "next level" line names every change: tier, faster rain, chain, lives (review NIT 9)
  const info = await page.evaluate(() => [6, 11, 12, 29].map(L => window.__rainTest.nextInfo(L)));
  expect(info).toEqual(['bảng nhân 2–9, mưa nhanh hơn, giải 17 phép', 'mưa nhanh hơn, giải 20 phép, còn 3 mạng', 'giải 21 phép', 'mưa nhanh hơn']);
  await page.click('#rrNext');
  expect(await dbg(page)).toMatchObject({ state: 'play', level: 11, target: 10, lives: 4 });   // v2 breather

  await page.click('#rPause'); await page.click('#rQuit');
  await startAt(page, 30);
  await winRound(page);
  await expect(page.locator('#rrTitle')).toContainText('Xong cả 30 level');
  await expect(page.locator('#rrNext')).toHaveText('Chơi lại Level 30');
  const st = await page.evaluate(() => ({ lv: localStorage.getItem('rain_lv'), g: window.BB.gameStats('rain') }));
  expect(st.lv).toBe('31');
  expect(st.g.best).toBe(30);
  await page.click('#rrNext');
  expect((await dbg(page)).level).toBe(30);
  await page.click('#rPause'); await page.click('#rQuit');
  await expect(page.locator('#rBestTxt')).toHaveText('Đã qua cả 30 level');
});

test('with the integrator\'s script tags: no double load, hub tile says 30 level', async ({ page }) => {
  // Simulates index.html after integration: difficulty.js + levels/rain.js before js/train-map.js, so
  // train.js finds BBD and does not load its own copy (a second difficulty.js resets window.BBD).
  await page.route(/\/(index\.html)?(#.*)?$/, async route => {
    const res = await route.fetch(); let html = await res.text();
    if (!html.includes('js/levels/rain.js')) {
      const tags = (html.includes('js/difficulty.js') ? '' : '<script src="js/difficulty.js"></script>') + '<script src="js/levels/rain.js"></script>';
      html = html.replace('<script src="js/train-map.js"></script>', `${tags}<script src="js/train-map.js"></script>`);
    }
    await route.fulfill({ response: res, body: html });
  });
  const loads = [];
  page.on('request', r => { if (/js\/(difficulty|levels\/rain)\.js$/.test(r.url())) loads.push(r.url()); });
  await page.goto('/');
  await expect(page.locator('#hubRain')).toHaveText('30 level, chưa chơi');
  await page.evaluate(() => { location.hash = 'mua'; });
  await expect(page.locator('#rlvgrid .lv')).toHaveCount(30);
  expect(loads.filter(u => u.endsWith('levels/rain.js'))).toHaveLength(1);
  expect(loads.filter(u => u.endsWith('difficulty.js')).length).toBeLessThanOrEqual(1);
});

test('slow difficulty.js (another game already inserted it): levels/rain.js waits, grid still shows 30', async ({ page }) => {
  await page.route(/\/js\/difficulty\.js$/, async route => {
    const res = await route.fetch(); await new Promise(r => setTimeout(r, 800)); await route.fulfill({ response: res });
  });
  await openRain(page);
  expect(await page.evaluate(() => window.BBD.games().includes('rain'))).toBe(true);
  await startAt(page, 30);
  expect(await dbg(page)).toMatchObject({ state: 'play', level: 30 });
});

test('a second difficulty.js wipes the table: rain registers again instead of an empty grid', async ({ page }) => {
  await openRain(page);
  await page.evaluate(() => new Promise((ok, bad) => {
    const s = document.createElement('script'); s.src = 'js/difficulty.js?again'; s.onload = ok; s.onerror = bad; document.head.appendChild(s);
  }));
  expect(await page.evaluate(() => window.BBD.games().includes('rain'))).toBe(false);
  await page.evaluate(() => { location.hash = ''; });
  await page.evaluate(() => { location.hash = 'mua'; });
  await expect(page.locator('#rlvgrid .lv')).toHaveCount(30);
  expect(await page.evaluate(() => window.__rainTest.spec(20).target)).toBe(24);
});

test('difficulty.js fails to load: falls back to the 10 legacy levels, still playable', async ({ page }) => {
  await page.route(/\/js\/difficulty\.js$/, route => route.abort());
  await page.goto('/#mua');
  await expect(page.locator('#rlvgrid .lv')).toHaveCount(10, { timeout: 1500 });   // no 4 s hang on the dead static tag
  const r = await page.evaluate(() => window.__rainTest.spec(10));
  expect(r).toMatchObject({ ops: 10, fall: 8.05, every: 2.8, target: 20, lives: 3 });
  await startAt(page, 10);
  expect(await dbg(page)).toMatchObject({ state: 'play', level: 10, target: 20 });
});
