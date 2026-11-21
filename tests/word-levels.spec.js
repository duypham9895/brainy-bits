// Đoán Cụm Từ đọc level từ BBD (js/difficulty.js + js/levels/word.js): 49 cụm giữ nguyên thứ tự (E2, E3),
// tiến độ cũ (word_lv, sao theo số level) vẫn đúng, màn 30 chơi được và đi tiếp được, màn cuối là phá đảo.
// index.html do bước tích hợp thêm thẻ <script>; trước lúc đó test tự chèn hai file vào trang (không sửa index.html).
import { test, expect } from '@playwright/test';

async function withBBD(page) {
  await page.route(u => u.pathname === '/' || u.pathname === '/index.html', async route => {
    const res = await route.fetch();
    let html = await res.text();
    if (!html.includes('js/difficulty.js')) {
      html = html.replace('<script src="js/core.js"></script>',
        '<script src="js/difficulty.js"></script><script src="js/levels/word.js"></script><script src="js/core.js"></script>');
    }
    await route.fulfill({ response: res, body: html });
  });
}
async function open(page, { lv } = {}) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await withBBD(page);
  if (lv) await page.addInitScript(v => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('word_lv', v); sessionStorage.setItem('seeded', '1'); } }, lv);
  await page.goto('/');
  await page.click('#openWord');
  await expect(page.locator('#wmenu')).toBeVisible();
}
const pick = (page, L) => page.locator('#wlvgrid .lv').nth(L - 1).click();
const vni = async (page, s) => { for (const ch of s) await page.keyboard.press(ch); };
const st = page => page.evaluate(() => window.__word.state());

test('word đọc level từ BBD: 49 cụm, đúng thứ tự cũ, hub và game cùng số', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await open(page);
  const r = await page.evaluate(() => {
    const W = window.__word, B = window.BBD;
    return {
      viaBBD: W.viaBBD, game: W.LV_MAX, core: window.BB.LV_MAX.word, bbd: B.maxLevel('word'),
      // old rule: level L = PHRASES[L-1] after the sort by letter count
      sameOrder: W.LEVELS.every((p, k) => p === W.PHRASES[k]),
      rowsMatch: W.LEVELS.every((p, k) => B.level('word', k + 1).phrase === p.i && B.level('word', k + 1).letters === p.n),
    };
  });
  expect(errors).toEqual([]);
  expect(r).toEqual({ viaBBD: true, game: 49, core: 49, bbd: 49, sameOrder: true, rowsMatch: true });
  await expect(page.locator('#wlvgrid .lv')).toHaveCount(49);
  await expect(page.locator('#wlvgrid .lv').nth(29)).toContainText('30');
  await expect(page.locator('#hubWord')).toHaveCount(1);
});

test('Level 30 chơi được, thắng thì sang Level 31', async ({ page }) => {
  await open(page);
  await pick(page, 30);
  await expect(page.locator('#wStart')).toContainText('Level 30');
  await page.click('#wStart');
  expect(await st(page)).toMatchObject({ state: 'play', level: 30, puzzle: 'mưa phùn' });
  await vni(page, 'mu7aphu2n');
  expect((await st(page)).cur).toBe('mưaphùn');
  await page.keyboard.press('Enter');
  await expect(page.locator('#wresult')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#wrTitle')).toContainText('Chính xác');
  await expect(page.locator('#wrNext')).toHaveText('Level 31 →');
  await page.click('#wrNext');
  expect(await st(page)).toMatchObject({ state: 'play', level: 31 });
});

test('tiến độ cũ: word_lv = 31 vẫn tính qua 30 màn, sao lưu theo số level giữ nguyên', async ({ page }) => {
  await open(page, { lv: '31' });
  await expect(page.locator('#wlvgrid .lv.done')).toHaveCount(30);
  await expect(page.locator('#wBestTxt')).toHaveText('Đã qua tới Level 30/49');
  await expect(page.locator('#wStart')).toContainText('Level 31');
  // Thắng Level 30 trong 1 lượt (3 sao), tải lại trang: sao vẫn nằm ở ô 30.
  await pick(page, 30); await page.click('#wStart');
  await vni(page, 'mu7aphu2n'); await page.keyboard.press('Enter');
  await expect(page.locator('#wresult')).toBeVisible({ timeout: 5000 });
  await page.reload();
  // Tải lại có thể mở thẳng vào game (app nhớ màn đang mở); vào menu level bằng đường nào cũng được.
  await page.waitForFunction(() => window.__word && window.APP);
  if (await page.locator('#openWord').isVisible()) await page.click('#openWord');
  else if (!(await page.locator('#wmenu').isVisible())) await page.click('#wMenuBtn');
  await expect(page.locator('#wmenu')).toBeVisible();
  await expect(page.locator('#wlvgrid .lv').nth(29)).toHaveAttribute('aria-label', /Level 30, 7 chữ, 3 sao/);
  await expect(page.locator('#wlvgrid .lv.done')).toHaveCount(30);
});

test('màn cuối (49): phá đảo, không có Level 50', async ({ page }) => {
  await open(page);
  await pick(page, 49); await page.click('#wStart');
  await vni(page, 'truye6n2tho6ng1'); await page.keyboard.press('Enter');
  await expect(page.locator('#wresult')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#wrTitle')).toContainText('Phá đảo');
  await expect(page.locator('#wrNext')).toHaveText('Chơi lại từ Level 1');
});

// G7 parity (MERGED-SPEC §4.4): the bot's own rows at L1/L15/L30, 3 seeds each, replayed through the real
// keyboard handler. The game must accept each row, colour it like the bot, and end won/lost like the bot.
// This checks the bot plays the same game; it says nothing about how close the bot is to real people.
import { loadBBD } from '../scripts/sim/load-bbd.mjs';
import { PROFILES, rngFor } from '../scripts/sim/human.mjs';
import { simulate } from '../scripts/sim/adapters/word.mjs';

for (const L of [1, 15, 30]) {
  test(`G7 parity L${L}: bot rows = game rows (3 seeds)`, async ({ page }) => {
    const B = loadBBD();
    await open(page);
    for (let seed = 0; seed < 3; seed++) {
      const log = [];
      const sim = simulate(B.level('word', L), PROFILES.median, rngFor('parity', L, 'median', seed), { log });
      if (seed > 0) await page.click('#wrMenu');      // from the result screen of the previous seed
      await expect(page.locator('#wmenu')).toBeVisible();
      await pick(page, L); await page.click('#wStart');
      expect(await st(page)).toMatchObject({ state: 'play', level: L, rows: 0 });
      for (const [r, row] of log.entries()) {
        await page.evaluate(g => { for (const ch of g) document.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true, cancelable: true })); }, row.guess);
        expect((await st(page)).cur, `seed ${seed} row ${r + 1} typed`).toBe(row.guess);
        await page.keyboard.press('Enter');
        await page.waitForFunction(n => window.__word.state().rows === n && window.__word.state().state !== 'reveal', r + 1);
        const cls = await page.locator('#wBoard .wrow').nth(r).locator('.wcell').evaluateAll(cs => cs.map(c => ['green', 'yellow', 'blue', 'gray'].find(k => c.classList.contains(k))));
        expect(cls, `seed ${seed} row ${r + 1} "${row.guess}"`).toEqual(row.res);
      }
      await expect(page.locator('#wresult')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#wrTitle')).toContainText(sim.pass ? 'Chính xác' : 'Hết lượt');
    }
  });
}
