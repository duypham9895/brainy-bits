// Mưa Phép Tính, 30 levels: the game reads BBD.level('rain', L), legacy L1..10 are unchanged (E3),
// old progress keys still count, and the next-level flow runs to a finished state after L30.
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

test('legacy L1..10 parameters are exactly the old formula; L1..30 match the Node tables', async ({ page }) => {
  await openRain(page);
  const r = await page.evaluate(() => Array.from({ length: 30 }, (_, i) => ({ ...window.__rainTest.spec(i + 1) })));
  for (let L = 1; L <= 10; L++) {                   // old js/rain.js spec(L), verbatim
    const old = { fall: Math.max(8, 13 - 0.55 * (L - 1)), every: Math.max(2.7, 4.6 - 0.2 * (L - 1)), target: 10 + L };
    expect(r[L - 1]).toMatchObject({ ...old, ops: L, legacy: true });
  }
  const B = loadBBD();
  for (let L = 1; L <= 30; L++) expect(r[L - 1]).toEqual({ ...B.level('rain', L) });
});

test('level names: L1..10 keep the old text, new tiers named at their breathers', async ({ page }) => {
  await openRain(page);
  const n = await page.evaluate(() => window.__rainTest.LVINFO.map(x => x && x.name));
  expect(n.slice(1, 11)).toEqual(['Cộng trong phạm vi 10', 'Cộng, trừ trong phạm vi 10', 'Cộng, trừ trong phạm vi 20',
    'Cộng, trừ trong phạm vi 50', 'Cộng, trừ trong phạm vi 100', 'Bảng nhân 2–5', 'Bảng nhân 2–9',
    'Nhân, chia (bảng 2–9)', 'Đủ 4 phép tính', 'Đủ 4 phép tính, số lớn hơn']);
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
  await expect(page.locator('#rrDetail')).toHaveText('Level 11: thêm cộng, trừ có nhớ.');
  await expect(page.locator('#rrNext')).toHaveText('Level 11 →');
  await page.click('#rrNext');
  expect(await dbg(page)).toMatchObject({ state: 'play', level: 11, target: 20 });

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
  await expect(page.locator('#rlvgrid .lv')).toHaveCount(10, { timeout: 8000 });
  const r = await page.evaluate(() => window.__rainTest.spec(10));
  expect(r).toMatchObject({ ops: 10, fall: 8.05, every: 2.8, target: 20 });
  await startAt(page, 10);
  expect(await dbg(page)).toMatchObject({ state: 'play', level: 10, target: 20 });
});
