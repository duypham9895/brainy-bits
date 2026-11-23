// Thua nhẹ tay + nhãn màn thử thách (gates/01-spec/DIFFICULTY-DECISIONS.md, 2026-11-23, Duy chọn B).
// Không đổi luật chơi: chỉ kiểm chữ trên màn kết quả và nhãn trên lưới level.
import { test, expect } from './fixtures.js';

const GAMES = [
  { hash: '/#tau', menu: '#menu',  grid: '#lvgrid',  start: '#startBtn' },
  { hash: '/#koi', menu: '#kmenu', grid: '#klvgrid', start: '#kStartBtn' },
  { hash: '/#nho', menu: '#mmenu', grid: '#mlvgrid', start: '#mStart' },
  { hash: '/#mua', menu: '#rmenu', grid: '#rlvgrid', start: '#rStart' },
  { hash: '/#chu', menu: '#wmenu', grid: '#wlvgrid', start: '#wStart' },
];

for (const g of GAMES) {
  test(`${g.hash}: Level 15 carries the challenge tag, Level 14 does not`, async ({ page }) => {
    await page.goto(g.hash);
    await expect(page.locator(g.menu)).toBeVisible();
    const tile = n => page.locator(`${g.grid} .lv`).nth(n - 1);
    await expect(tile(15).locator('.peaktag')).toHaveText('thử thách');
    await expect(tile(14).locator('.peaktag')).toHaveCount(0);
    await expect(tile(15)).toHaveAttribute('aria-label', /màn thử thách/);
    await tile(15).click();
    await expect(page.locator(g.start)).toHaveText(/Level 15 · thử thách/);
    await tile(14).click();
    await expect(page.locator(g.start)).not.toHaveText(/thử thách/);
  });
}

test('BB.lossAid: tip only on L1-5 losses, skip button from the second loss in a row, cleared on a win', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    const card = document.createElement('div'); card.className = 'card';
    const next = document.createElement('button'); card.append(next); document.body.append(card);
    const skipped = [];
    const o = (level, won) => ({ game: 'probe', level, won, maxLevel: 30, tip: 'mẹo <b>thử</b>', onSkip: L => skipped.push(L) });
    const snap = () => ({ tip: card.querySelectorAll('.tip').length, skip: [...card.querySelectorAll('button.btn.alt')].map(b => b.textContent) });
    const out = {};
    BB.lossAid(next, o(3, false)); out.first = snap();
    BB.lossAid(next, o(3, false)); out.second = snap();
    card.querySelector('button.btn.alt').click(); out.skipped = skipped.slice();
    BB.lossAid(next, o(3, true));  out.won = snap();
    BB.lossAid(next, o(6, false)); BB.lossAid(next, o(6, false)); out.l6 = snap();
    BB.lossAid(next, o(30, false)); BB.lossAid(next, o(30, false)); out.last = snap();
    out.tipHtml = (BB.lossAid(next, o(1, false)), card.querySelector('.tip span').innerHTML);
    BB.lossAid(next, o(2, false)); BB.lossAid(next, o(4, false)); BB.lossAid(next, o(2, false)); out.notInARow = snap();
    return out;
  });
  expect(r.first).toEqual({ tip: 1, skip: [] });
  expect(r.second).toEqual({ tip: 1, skip: ['Sang Level 4 trước'] });
  expect(r.skipped).toEqual([4]);
  expect(r.won).toEqual({ tip: 0, skip: [] });
  expect(r.l6).toEqual({ tip: 0, skip: [] });
  expect(r.last).toEqual({ tip: 0, skip: [] });
  expect(r.tipHtml).toBe('mẹo <b>thử</b>');
  expect(r.notInARow).toEqual({ tip: 1, skip: [] });   // thua L2, L4, L2: không liền nhau ở L2, chưa có nút sang level
});

test('BB.peakCue: only after winning the level right before a peak', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    const card = document.createElement('div');
    const next = document.createElement('button'); card.append(next); document.body.append(card);
    const cue = o => (BB.peakCue(next, o), card.querySelector('.cue')?.textContent || '');
    return {
      win14: cue({ level: 14, won: true, maxLevel: 30 }), lose14: cue({ level: 14, won: false }),
      win13: cue({ level: 13, won: true, maxLevel: 30 }), win19: cue({ level: 19, won: true, maxLevel: 30 }),
      last14: cue({ level: 14, won: true, last: true, maxLevel: 30 }),
      peakIsLast: cue({ level: 49, won: true, maxLevel: 50 }), beyond: cue({ level: 29, won: true, maxLevel: 29 }),
    };
  });
  expect(r.win14).toBe('Level 15 là màn thử thách. Qua được thì Level 16 nhẹ lại.');
  expect(r.lose14).toBe('');
  expect(r.win13).toBe('');
  expect(r.win19).toMatch(/^Level 20 là màn thử thách\./);
  expect(r.last14).toBe('');
  expect(r.peakIsLast).toBe('Level 50 là màn thử thách.');   // không hứa Level 51
  expect(r.beyond).toBe('');
});

test('Rain L3: losing twice shows the tip, the gap, then a skip to Level 4 that starts it', async ({ page }) => {
  await page.goto('/#mua');
  await expect(page.locator('#rmenu')).toBeVisible();
  await page.locator('#rlvgrid .lv').nth(2).click();
  await page.click('#rStart');
  await expect(page.locator('#rmenu')).toBeHidden();
  const loseNow = () => page.evaluate(() => { for (let i = 0; i < 3; i++) window.__rainTest.spawnDrop(900 + i, 0.995); });
  await loseNow();
  await expect(page.locator('#rresult')).toBeVisible();
  await expect(page.locator('#rrDetail')).toHaveText(/^Còn \d+ phép nữa là qua\.$/);
  await expect(page.locator('#rresult .tip')).toContainText('Giải giọt thấp nhất trước');
  await expect(page.locator('#rresult .btn.alt', { hasText: 'Sang Level 4' })).toHaveCount(0);
  await page.click('#rrNext');                         // Chơi lại Level 3
  await expect(page.locator('#rresult')).toBeHidden();
  await loseNow();
  await expect(page.locator('#rresult')).toBeVisible();
  const skip = page.locator('#rresult .btn.alt', { hasText: 'Sang Level 4 trước' });
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(page.locator('#rresult')).toBeHidden();
  expect((await page.evaluate(() => window.__rainDebug())).level).toBe(4);
});

test('Word: "Xem đáp án" after two losses removes the tip and the skip button (one way forward, not two)', async ({ page }) => {
  await page.goto('/#chu');
  await expect(page.locator('#wmenu')).toBeVisible();
  await page.locator('#wlvgrid .lv').nth(1).click();
  await page.click('#wStart');
  await expect(page.locator('#wmenu')).toBeHidden();
  await page.evaluate(() => {
    const o = { game: 'word', level: 2, won: false, maxLevel: 50, tip: 'mẹo', onSkip: () => {} };
    document.getElementById('wresult').classList.remove('hidden');
    document.getElementById('wrReveal').classList.remove('hidden');   // như finish(false) làm
    BB.lossAid(document.getElementById('wrNext'), o); BB.lossAid(document.getElementById('wrNext'), o);
  });
  await expect(page.locator('#wresult .bb-aid')).toHaveCount(3);   // mẹo + nút sang level + dòng chú thích
  await page.click('#wrReveal');
  await expect(page.locator('#wresult .bb-aid')).toHaveCount(0);
  await expect(page.locator('#wrNext')).toHaveText('Level 3 →');
});
