// Mưa Phép Tính: regression tests for RAIN-1..4, the missed items and the reward layer.
import { test, expect } from '@playwright/test';

async function openRain(page, setup) {
  if (setup) await page.addInitScript(setup);
  await page.goto('/#mua');
  await expect(page.locator('#rmenu')).toBeVisible();
}
const dbg = page => page.evaluate(() => window.__rainDebug());

async function startAt(page, L) {
  await page.locator('#rlvgrid .lv').nth(L - 1).click();
  await page.click('#rStart');
  await expect(page.locator('#rmenu')).toBeHidden();
}

test('RAIN-1: shrinking the canvas keeps drops on their path, no lives lost', async ({ page }) => {
  await openRain(page);
  await startAt(page, 1);
  await page.evaluate(() => { window.__rainTest.spawnDrop(77, 0.8); window.__rainTest.spawnDrop(88, 0.85); });
  const before = await dbg(page);
  await page.setViewportSize({ width: 412, height: 420 });
  await page.waitForTimeout(300);
  const after = await dbg(page);
  expect(after.misses).toBe(0);
  const d = after.drops.find(x => x.ans === 77);
  expect(d).toBeTruthy();
  expect(d.p).toBeGreaterThanOrEqual(0.8);
  expect(after.H).toBeLessThan(before.H);
});

test('RAIN-1: rotating to landscape mid-round pauses the game', async ({ page }) => {
  await openRain(page);
  await startAt(page, 1);
  await page.setViewportSize({ width: 900, height: 420 });
  await expect(page.locator('#rpaused')).toBeVisible();
  expect((await dbg(page)).state).toBe('paused');
});

test('RAIN-2: a typed answer pops even when a longer answer shares its first digit', async ({ page }) => {
  await openRain(page);
  await startAt(page, 2);
  await page.evaluate(() => { window.__rainTest.spawnDrop(1, 0.2); window.__rainTest.spawnDrop(12, 0.1); });
  await page.keyboard.press('1');
  await page.waitForTimeout(900);
  const s = await dbg(page);
  expect(s.solved).toBe(1);
  expect(s.drops.some(d => d.ans === 1)).toBe(false);
  expect(s.input).toBe('');
});

test('RAIN-2: typing "1" then "2" quickly pops 12, not 1', async ({ page }) => {
  await openRain(page);
  await startAt(page, 2);
  await page.evaluate(() => { window.__rainTest.spawnDrop(1, 0.2); window.__rainTest.spawnDrop(12, 0.1); });
  await page.keyboard.press('1');
  await page.keyboard.press('2');
  const s = await dbg(page);
  expect(s.drops.some(d => d.ans === 12)).toBe(false);
  expect(s.drops.some(d => d.ans === 1)).toBe(true);
});

test('RAIN-2: a digit that matches nothing clears the input instead of piling up', async ({ page }) => {
  await openRain(page);
  await startAt(page, 1);
  await page.evaluate(() => window.__rainTest.spawnDrop(7, 0.2));
  await page.keyboard.press('9');
  expect((await dbg(page)).input).toBe('');
  await page.keyboard.press('7');
  expect((await dbg(page)).solved).toBe(1);
});

test('RAIN-4 + missed L10: levels ramp monotonically and match LVINFO', async ({ page }) => {
  await openRain(page);
  const r = await page.evaluate(() => {
    const t = window.__rainTest, out = {};
    for (let L = 1; L <= 10; L++) {
      const ops = new Set(); let max = 0;
      for (let i = 0; i < 600; i++) {
        const [eq, ans] = t.makeEq(L);
        ops.add(eq.match(/[+−×÷]/)[0]); max = Math.max(max, ans);
      }
      out[L] = { ops: [...ops].sort().join(''), max, fall: t.spec(L).fall, every: t.spec(L).every, name: t.LVINFO[L].name };
    }
    return out;
  });
  expect(r[1].ops).toBe('+');
  for (const L of [2, 3, 4, 5]) expect(r[L].ops).toBe('+−');
  for (const L of [6, 7]) expect(r[L].ops).toBe('×');
  expect(r[8].ops).toBe('×÷');
  expect(r[9].ops.length).toBe(4);
  expect(r[10].ops.length).toBe(4);
  // phạm vi cộng/trừ mở rộng dần: 10, 10, 20, 50, 100
  expect(r[3].max).toBeLessThanOrEqual(20);
  expect(r[4].max).toBeGreaterThan(20);
  expect(r[5].max).toBeGreaterThan(50);
  // L10 "số lớn hơn": thương phép chia vượt 9
  const big = await page.evaluate(() => {
    for (let i = 0; i < 4000; i++) { const [eq, a] = window.__rainTest.makeEq(10); if (eq.includes('÷') && a > 9) return true; }
    return false;
  });
  expect(big).toBe(true);
  for (let L = 2; L <= 10; L++) {
    expect(r[L].fall).toBeLessThanOrEqual(r[L - 1].fall);
    expect(r[L].every).toBeLessThanOrEqual(r[L - 1].every);
  }
});

test('missed: rising water does not change how long a drop has left', async ({ page }) => {
  await openRain(page);
  await startAt(page, 1);
  await page.click('#rPause');
  const before = await page.evaluate(() => {
    window.__rainTest.spawnDrop(55, 0.5);
    window.__rainTest.spawnDrop(66, 0.995);   // rơi xuống nước ở frame kế tiếp
    return window.__rainDebug();
  });
  await page.click('#rResume');
  await page.waitForFunction(() => window.__rainDebug().misses === 1, null, { timeout: 3000 });
  await page.click('#rPause');
  const after = await dbg(page);
  const a0 = before.drops.find(d => d.ans === 55), a1 = after.drops.find(d => d.ans === 55);
  expect(a1).toBeTruthy();
  // p chỉ tăng theo thời gian đã trôi (vài frame), không nhảy vì mặt nước dâng 8px
  expect(a1.p).toBeGreaterThanOrEqual(0.5);
  expect(a1.p).toBeLessThan(0.53);
  // y tính lại theo mặt nước mới: -30 + p*(waterY+30), waterY = H - 26 - misses*8
  const wy = after.H - 26 - 8;
  expect(Math.abs(a1.y - (-30 + a1.p * (wy + 30)))).toBeLessThan(0.01);
  expect(a1.y).toBeLessThan(a0.y + 0.03 * (wy + 30));
  // số giây còn lại (1-p)*fall gần như không đổi so với lúc trước
  const fall = 13;
  expect((1 - a0.p) * fall - (1 - a1.p) * fall).toBeLessThan(0.4);
});

test('review #1: a pending answer still pops when the next digit starts a new answer', async ({ page }) => {
  await openRain(page);
  await startAt(page, 2);
  await page.evaluate(() => { for (const a of [1, 12, 5]) window.__rainTest.spawnDrop(a, 0.2); });
  await page.keyboard.press('1');
  await page.keyboard.press('5');
  const s = await dbg(page);
  expect(s.solved).toBe(2);
  expect(s.combo).toBe(2);
  expect(s.drops.some(d => d.ans === 1 || d.ans === 5)).toBe(false);
  expect(s.drops.some(d => d.ans === 12)).toBe(true);
});

test('review #3: Enter on a focused number key types that digit, not submit', async ({ page }) => {
  await openRain(page);
  await startAt(page, 3);
  await page.evaluate(() => window.__rainTest.spawnDrop(57, 0.1));
  await page.locator('#rPad [data-k="5"]').focus();
  await page.keyboard.press('Enter');
  const s = await dbg(page);
  expect(s.input).toBe('5');
  expect(s.combo).toBe(0);
  await page.locator('#rPause').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rpaused')).toBeVisible();
});

test('review #4/#8: lives pill and input have roles; rAF stops on the hub and restarts on return', async ({ page }) => {
  await openRain(page);
  await expect(page.locator('#rLives')).toHaveAttribute('role', 'img');
  await expect(page.locator('#rDisp')).toHaveAttribute('role', 'status');
  await startAt(page, 1);
  await page.evaluate(() => { location.hash = ''; });
  await expect(page.locator('#hub')).toBeVisible();
  // ở hub: không frame nào của Mưa chạy, nên p của giọt đứng yên
  await page.evaluate(() => window.__rainTest.spawnDrop(44, 0.3));
  await page.waitForTimeout(400);
  expect((await dbg(page)).drops.find(d => d.ans === 44).p).toBe(0.3);
  await page.evaluate(() => { location.hash = 'mua'; });
  await expect(page.locator('#rpaused')).toBeVisible();
  await page.click('#rResume');
  await page.waitForFunction(() => window.__rainDebug().drops.some(d => d.ans === 44 && d.p > 0.3), null, { timeout: 3000 });
});

test('numpad keys have labels, lives pill says how many lives are left', async ({ page }) => {
  await openRain(page);
  await expect(page.locator('#rPad [data-k="del"]')).toHaveAttribute('aria-label', /Xoá/);
  await expect(page.locator('#rPad [data-k="ok"]')).toHaveAttribute('aria-label', /Nộp/);
  await expect(page.locator('#rLives')).toHaveAttribute('aria-label', 'Còn 3 mạng');
});

test('physical keyboard: Backspace, Enter on a wrong value, Escape pauses and resumes', async ({ page }) => {
  await openRain(page);
  await startAt(page, 3);
  await page.evaluate(() => window.__rainTest.spawnDrop(15, 0.1));
  await page.keyboard.press('1');
  expect((await dbg(page)).input).toBe('1');
  await page.keyboard.press('Backspace');
  expect((await dbg(page)).input).toBe('');
  await page.keyboard.press('Escape');
  await expect(page.locator('#rpaused')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#rpaused')).toBeHidden();
  expect((await dbg(page)).state).toBe('play');
});

test('leaving mid-round and coming back shows the pause card, not the menu', async ({ page }) => {
  await openRain(page);
  await startAt(page, 1);
  await page.evaluate(() => { location.hash = ''; });
  await expect(page.locator('#hub')).toBeVisible();
  await page.evaluate(() => { location.hash = 'mua'; });
  await expect(page.locator('#rpaused')).toBeVisible();
  await expect(page.locator('#rmenu')).toBeHidden();
});

test('three misses lose the round with 0 stars and the lives pill reaches 0', async ({ page }) => {
  await openRain(page);
  await startAt(page, 1);
  await page.evaluate(() => { for (const a of [91, 92, 93]) window.__rainTest.spawnDrop(a, 0.99); });
  await expect(page.locator('#rresult')).toBeVisible();
  await expect(page.locator('#rrTitle')).toContainText('Chưa qua');
  await expect(page.locator('#rrStars')).toHaveAttribute('aria-label', '0 trên 3 sao');
  await expect(page.locator('#rLives')).toHaveAttribute('aria-label', 'Còn 0 mạng');
});

test('passing L10 shows a finished state, records stars, never offers Level 11', async ({ page }) => {
  await openRain(page, () => { localStorage.setItem('rain_lv', '10'); });
  await startAt(page, 10);
  // giải nhanh mọi giọt: cài thẳng đáp án vào ô nhập
  for (let i = 0; i < 40; i++) {
    const s = await dbg(page);
    if (s.state === 'result') break;
    await page.evaluate(() => window.__rainTest.spawnDrop(900 + Math.floor(Math.random() * 99), 0.1));
    const d = (await dbg(page)).drops[0];
    for (const ch of String(d.ans)) await page.keyboard.press(ch);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#rresult')).toBeVisible();
  await expect(page.locator('#rrTitle')).toContainText('Xong cả 10 level');
  await expect(page.locator('#rrNext')).toHaveText('Chơi lại Level 10');
  await expect(page.locator('#rrStars')).toHaveAttribute('aria-label', '3 trên 3 sao');
  const st = await page.evaluate(() => ({ lv: localStorage.getItem('rain_lv'), g: window.BB.gameStats('rain') }));
  expect(st.lv).toBe('11');
  expect(st.g.best).toBe(10);
  expect(st.g.stars['10']).toBe(3);
  await page.click('#rrNext');
  expect((await dbg(page)).level).toBe(10);
});

test('legacy rain_lv seeds BB stats and stays readable; corrupt values are clamped', async ({ page }) => {
  await openRain(page, () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('rain_lv', '6'); } });
  const g = await page.evaluate(() => window.BB.gameStats('rain'));
  expect(g.best).toBe(5);
  await expect(page.locator('#rBestTxt')).toHaveText('Đã qua tới Level 5');
  await page.evaluate(() => localStorage.setItem('rain_lv', '99'));
  await page.evaluate(() => window.rainEnter());
  await expect(page.locator('#rBestTxt')).toHaveText('Đã qua cả 10 level');
  await expect(page.locator('#rlvgrid .lv')).toHaveCount(10);
});

test('daily challenge hand-off starts the requested level directly', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.BB.request('rain', 4); location.hash = 'mua'; });
  await expect(page.locator('#rmenu')).toBeHidden();
  const s = await dbg(page);
  expect(s.state).toBe('play');
  expect(s.level).toBe(4);
});

test('long equations widen the drop instead of overflowing it', async ({ page }) => {
  await openRain(page);
  await startAt(page, 10);
  await page.waitForFunction(() => window.__rainDebug().drops.length > 0, null, { timeout: 5000 });
  const r = await page.evaluate(() => {
    const d = window.__rainDebug().drops[0];
    const c = document.createElement('canvas').getContext('2d');
    c.font = '800 16px "Baloo 2", system-ui, sans-serif';
    return { w: d.w, text: c.measureText(d.eq).width, wide: c.measureText('198 − 175').width };
  });
  expect(r.w).toBeGreaterThanOrEqual(78);
  expect(r.w).toBeGreaterThanOrEqual(r.text + 20);
});
