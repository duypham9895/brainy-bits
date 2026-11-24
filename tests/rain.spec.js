// Mưa Phép Tính: regression tests for RAIN-1..4, the missed items and the reward layer.
import { test, expect, muteAudio, pickLevel } from './fixtures.js';

async function openRain(page, setup) {
  if (setup) await page.addInitScript(setup);
  await page.goto('/#mua');
  await expect(page.locator('#rmenu')).toBeVisible();
}
const dbg = page => page.evaluate(() => window.__rainDebug());

async function startAt(page, L) {
  await pickLevel(page, '#rlvgrid', L);
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

// Was "L1..10 ramp monotonically, level L = tier L". Table v2 (2026-11-21): level L = tier L on L1..10 again
// (decision 2), but L10 and the breathers retune speed, so the per-tier checks read tiers 1..10 straight from the generator, and the ramp check is
// "rain never slows down while the tier stays the same" (a new tier may come with slower rain).
test('RAIN-4 + missed L10: tiers 1..10 keep their operations; rain never slows inside a tier', async ({ page }) => {
  await openRain(page);
  const r = await page.evaluate(() => {
    const t = window.__rainTest, out = {};
    for (let L = 1; L <= 10; L++) {
      const ops = new Set(); let max = 0;
      for (let i = 0; i < 600; i++) {
        const [eq, ans] = window.BBRain.makeEq(L, Math.random);
        ops.add(eq.match(/[+−×÷]/)[0]); max = Math.max(max, ans);
      }
      out[L] = { ops: [...ops].sort().join(''), max };
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
    for (let i = 0; i < 4000; i++) { const [eq, a] = window.__rainTest.makeEq(10); if (eq.includes('÷') && a > 9) return true; }   // L10 plays tier 10
    return false;
  });
  expect(big).toBe(true);
  const sp = await page.evaluate(() => Array.from({ length: 31 }, (_, L) => (L ? window.__rainTest.spec(L) : null)));
  expect(sp.slice(1, 11).map(x => x.ops)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (let L = 2; L <= 30; L++) {
    if (sp[L].ops !== sp[L - 1].ops || sp[L].kind === 'breather' || sp[L - 1].kind === 'breather') continue;
    expect(sp[L].fall, `L${L}`).toBeLessThanOrEqual(sp[L - 1].fall);
    expect(sp[L].every, `L${L}`).toBeLessThanOrEqual(sp[L - 1].every);
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

test('passing the last level (L33) shows a finished state, records stars, never offers Level 34', async ({ page }) => {
  await openRain(page, () => { localStorage.setItem('rain_lv', '33'); });
  await startAt(page, 33);
  // giải nhanh mọi giọt: cài thẳng đáp án vào ô nhập
  for (let i = 0; i < 160; i++) {
    const s = await dbg(page);
    if (s.state === 'result') break;
    await page.evaluate(() => window.__rainTest.spawnDrop(900 + Math.floor(Math.random() * 99), 0.1));
    const d = (await dbg(page)).drops[0];
    for (const ch of String(d.ans)) await page.keyboard.press(ch);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#rresult')).toBeVisible();
  await expect(page.locator('#rrTitle')).toContainText('Xong cả 33 level');
  await expect(page.locator('#rrNext')).toHaveText('Chơi lại Level 33');
  await expect(page.locator('#rrStars')).toHaveAttribute('aria-label', '3 trên 3 sao');
  const st = await page.evaluate(() => ({ lv: localStorage.getItem('rain_lv'), g: window.BB.gameStats('rain') }));
  expect(st.lv).toBe('34');
  expect(st.g.best).toBe(33);
  expect(st.g.stars['33']).toBe(3);
  await page.click('#rrNext');
  expect((await dbg(page)).level).toBe(33);
});

test('legacy rain_lv seeds BB stats and stays readable; corrupt values are clamped', async ({ page }) => {
  await openRain(page, () => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.setItem('rain_lv', '6'); } });
  const g = await page.evaluate(() => window.BB.gameStats('rain'));
  expect(g.best).toBe(5);
  await expect(page.locator('#rBestTxt')).toHaveText('Đã qua tới Level 5');
  await page.evaluate(() => localStorage.setItem('rain_lv', '99'));
  await page.evaluate(() => window.rainEnter());
  await expect(page.locator('#rBestTxt')).toHaveText('Đã qua cả 33 level');
  await expect(page.locator('#rlvgrid .lv')).toHaveCount(33);
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

// RESP: điện thoại xoay ngang — canvas bên trái, bàn phím bên phải, giọt dùng đúng khung canvas mới.
for (const vp of [{ width: 667, height: 375 }, { width: 844, height: 390 }]) {
  test(`RESP: phone landscape ${vp.width}x${vp.height} puts canvas left, pad right, drops inside`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true });
    await ctx.addInitScript(muteAudio);
    const page = await ctx.newPage();
    await openRain(page);
    await startAt(page, 1);
    const box = await page.evaluate(() => {
      const r = s => document.querySelector(s).getBoundingClientRect();
      const keys = [...document.querySelectorAll('#rPad button')].map(b => b.getBoundingClientRect().height);
      return { cv: r('#rcv'), pad: r('#rPad'), minKey: Math.min(...keys) };
    });
    expect(box.cv.height).toBeGreaterThanOrEqual(240);
    expect(box.pad.left).toBeGreaterThanOrEqual(box.cv.right - 1);
    expect(box.pad.bottom).toBeLessThanOrEqual(vp.height + 1);
    expect(box.minKey).toBeGreaterThanOrEqual(44);
    await page.waitForTimeout(1200);            // để spawn() thật đặt giọt theo bề ngang canvas mới
    const s = await dbg(page);
    expect(s.drops.length).toBeGreaterThan(0);
    expect(Math.abs(s.W - box.cv.width)).toBeLessThan(1);
    expect(Math.abs(s.H - box.cv.height)).toBeLessThan(1);
    for (const d of s.drops) { expect(d.x).toBeGreaterThanOrEqual(d.w / 2); expect(d.x).toBeLessThanOrEqual(s.W - d.w / 2); }
    await ctx.close();
  });
}

test('RESP: laptop 1920 caps the play column at 600 px', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await ctx.addInitScript(muteAudio);
  const page = await ctx.newPage();
  await openRain(page);
  await startAt(page, 1);
  const w = await page.evaluate(() => ['#rcv', '#rPad'].map(s => document.querySelector(s).getBoundingClientRect()));
  for (const r of w) { expect(r.width).toBeLessThanOrEqual(600.5); expect(Math.abs(r.left + r.width / 2 - 960)).toBeLessThan(2); }
  expect((await dbg(page)).H).toBeGreaterThanOrEqual(400);
  // HUD: pill đầu và nút pause thẳng mép cột chơi, không dạt ra góc màn hình
  const hud = await page.evaluate(() => ({ lv: document.querySelector('#rLevel').getBoundingClientRect().left,
    pause: document.querySelector('#rPause').getBoundingClientRect().right }));
  expect(hud.lv).toBeGreaterThanOrEqual(660 - 1);
  expect(hud.pause).toBeLessThanOrEqual(1260 + 1);
  await ctx.close();
});

test('RAIN-1: rotating a 320 phone to landscape pauses even though the canvas was already wider than tall', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true, isMobile: true });
  await ctx.addInitScript(muteAudio);
  const page = await ctx.newPage();
  await openRain(page);
  await startAt(page, 1);
  await page.setViewportSize({ width: 667, height: 375 });
  await expect(page.locator('#rpaused')).toBeVisible();
  expect((await dbg(page)).state).toBe('paused');
  await ctx.close();
});

// ---------- PR #2 review round 1 (Neon) ----------

// Neon #4: thắng rồi rời game ngay thì 3 tiếng sao hẹn giờ không được kêu ở hub.
test('neon #4: star sounds scheduled on the result card never play after leaving to the hub', async ({ page }) => {
  await openRain(page);
  await startAt(page, 1);
  await page.evaluate(() => {
    window.__stars = [];
    const orig = window.BB.sfx;
    window.BB.sfx = (name, o) => { if (name === 'star') window.__stars.push(window.APP.active); return orig(name, o); };
  });
  for (let i = 0; i < 40; i++) {
    if ((await dbg(page)).state === 'result') break;
    await page.evaluate(() => window.__rainTest.spawnDrop(900 + Math.floor(Math.random() * 99), 0.1));
    const d = (await dbg(page)).drops[0];
    for (const ch of String(d.ans)) await page.keyboard.press(ch);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#rresult')).toBeVisible();
  await page.evaluate(() => { location.hash = ''; });
  await expect(page.locator('#hub')).toBeVisible();
  expect(await page.evaluate(() => window.__rainTest.starTimers())).toBe(0);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.__stars.filter(a => a !== 'rain'))).toEqual([]);
});

// Neon #4: bấm "Level kế" hoặc về menu trước khi sao hiện hết thì hẹn giờ cũng bị huỷ.
test('neon #4: starting the next level or going to the menu clears pending star timers', async ({ page }) => {
  await openRain(page);
  await startAt(page, 1);
  for (let i = 0; i < 40; i++) {
    if ((await dbg(page)).state === 'result') break;
    await page.evaluate(() => window.__rainTest.spawnDrop(900 + Math.floor(Math.random() * 99), 0.1));
    const d = (await dbg(page)).drops[0];
    for (const ch of String(d.ans)) await page.keyboard.press(ch);
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#rresult')).toBeVisible();
  expect(await page.evaluate(() => window.__rainTest.starTimers())).toBeGreaterThan(0);
  await page.click('#rrNext');
  expect(await page.evaluate(() => window.__rainTest.starTimers())).toBe(0);
});

// Neon #9: nền ngay sau chữ trên giọt phải đủ tối cho chữ trắng đạt WCAG AA 4.5:1.
test('neon #9: white drop text has >= 4.5:1 contrast across the whole glyph band', async ({ page }) => {
  await openRain(page);
  await startAt(page, 10);
  const r = await page.evaluate(async () => {
    // giọt rỗng chữ, rộng như phép dài nhất, để đo đúng phần nền nằm sau chữ
    const c = document.createElement('canvas').getContext('2d');
    c.font = '800 16px "Baloo 2", system-ui, sans-serif';
    const tw = Math.ceil(c.measureText('198 − 175').width);
    window.__rainTest.spawnDrop(999, 0.45, '', tw + 26);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));   // dừng: khung đứng yên
    await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
    const s = window.__rainDebug(), d = s.drops.find(x => x.ans === 999);
    const cv = document.getElementById('rcv'), k = cv.width / s.W;
    const g = cv.getContext('2d');
    const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    let worst = 99;
    // dải chữ: baseline giữa ở y+2, chữ số 16px cao ~12px; quét rộng hơn một chút cho chắc
    for (let y = d.y + 2 - 8; y <= d.y + 2 + 8; y += 1) {
      for (let x = d.x - tw / 2; x <= d.x + tw / 2; x += 2) {
        const p = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
        const L = 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]);
        worst = Math.min(worst, 1.05 / (L + 0.05));
      }
    }
    return { worst };
  });
  expect(r.worst).toBeGreaterThanOrEqual(4.5);
});

// Neon #12: tiến độ ghi trong bb_stats (hub, thử thách ngày) cũng mở level trong menu Mưa.
test('neon #12: rain menu reads bb_stats best even without rain_lv, and writes no bb_seed_rain', async ({ page }) => {
  await openRain(page, () => {
    if (sessionStorage.getItem('x')) return; sessionStorage.setItem('x', '1');
    localStorage.clear();
    localStorage.setItem('bb_stats', JSON.stringify({ rain: { best: 4, stars: { 1: 3, 2: 3, 3: 2, 4: 1 } } }));
  });
  await expect(page.locator('#rBestTxt')).toHaveText('Đã qua tới Level 4');
  await expect(page.locator('#rStart')).toHaveText('Chơi Level 5');
  await expect(page.locator('#rlvgrid .lv.done')).toHaveCount(4);
  expect(await page.evaluate(() => window.rainBest())).toBe(4);
  expect(await page.evaluate(() => localStorage.getItem('bb_seed_rain'))).toBeNull();
});

// Neon #14: tạm dừng thì vòng rAF dừng hẳn; tiếp tục thì chạy lại; đổi cỡ lúc dừng vẫn vẽ lại canvas.
test('neon #14: rAF stops while paused, restarts on resume, canvas redrawn on resize while paused', async ({ page }) => {
  await openRain(page);
  await startAt(page, 1);
  await page.evaluate(() => window.__rainTest.spawnDrop(55, 0.3));
  await page.keyboard.press('Escape');
  await expect(page.locator('#rpaused')).toBeVisible();
  await page.waitForTimeout(100);                     // để khung đã hẹn trước lúc dừng chạy xong
  await page.evaluate(() => {
    window.__raf = 0; const o = window.requestAnimationFrame;
    window.requestAnimationFrame = f => { window.__raf++; return o.call(window, f); };
  });
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__raf)).toBe(0);
  const p0 = (await dbg(page)).drops.find(d => d.ans === 55).p;
  // đổi cỡ (không đổi chiều xoay) lúc dừng: canvas bị xoá khi đổi kích thước, phải được vẽ lại
  const vp = page.viewportSize();
  await page.setViewportSize({ width: vp.width, height: vp.height - 40 });
  await page.waitForTimeout(150);
  const painted = await page.evaluate(() => {
    const cv = document.getElementById('rcv');
    return cv.getContext('2d').getImageData(Math.floor(cv.width / 2), 4, 1, 1).data[3];
  });
  expect(painted).toBe(255);
  await page.click('#rResume');
  await page.waitForFunction(p => window.__rainDebug().drops.some(d => d.ans === 55 && d.p > p), p0, { timeout: 3000 });
  expect(await page.evaluate(() => window.__raf)).toBeGreaterThan(0);
});

// Gemini Neon round 2: Pause -> Quit -> Start froze the round (loop stopped while paused, never restarted).
test('pause, quit to the menu and start again: drops keep falling', async ({ page }) => {
  await page.goto('/');
  await page.click('#openRain');
  await page.click('#rStart');
  await page.waitForTimeout(900);
  await page.click('#rPause');
  await page.waitForTimeout(200);
  await page.click('#rQuit');
  await expect(page.locator('#rmenu')).toBeVisible();
  await page.click('#rStart');
  const frames = await page.evaluate(() => new Promise(res => {
    let n = 0; const t0 = performance.now();
    const orig = window.requestAnimationFrame;
    window.requestAnimationFrame = cb => orig(ts => { n++; cb(ts); });
    setTimeout(() => { window.requestAnimationFrame = orig; res(n); }, 1500);
  }));
  expect(frames, 'game loop runs after Pause -> Quit -> Start').toBeGreaterThan(20);
});

test('QA: a short portrait window pauses the round and keeps a usable canvas (WebKit 390x664 -> 412x420)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await openRain(page);
  await startAt(page, 1);
  await page.evaluate(() => window.__rainTest.spawnDrop(77, 0.8));
  await page.setViewportSize({ width: 412, height: 420 });
  await expect(page.locator('#rpaused')).toBeVisible();
  const s = await dbg(page);
  expect(s.misses).toBe(0);
  expect(s.H).toBeGreaterThan(90);            // compact keypad: was 52px, drops hit the water at once
  await page.click('#rResume');
  await page.waitForTimeout(100);
  expect((await dbg(page)).misses).toBe(0);
});

test('QA: a browser toolbar appearing (390x745 -> 390x664) does not pause the round', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 745 });
  await openRain(page);
  await startAt(page, 1);
  await page.setViewportSize({ width: 390, height: 664 });
  await page.waitForTimeout(200);
  expect((await dbg(page)).state).toBe('play');
});

test('QA: shrinking the window step by step still pauses once the canvas gets too small', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await openRain(page);
  await startAt(page, 1);
  for (let h = 649; h >= 420; h -= 15) await page.setViewportSize({ width: 390, height: h });
  await expect(page.locator('#rpaused')).toBeVisible();
});

test('QA: a drop close to the water survives a sharp shrink and the resume after it', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await openRain(page);
  await startAt(page, 1);
  await page.evaluate(() => window.__rainTest.spawnDrop(77, 0.92));
  await page.setViewportSize({ width: 412, height: 420 });
  await expect(page.locator('#rpaused')).toBeVisible();
  await page.click('#rResume');
  await page.waitForTimeout(100);
  const s = await dbg(page);
  expect(s.misses).toBe(0);
  expect(s.drops.some(d => d.ans === 77)).toBe(true);
});

test('physical keyboard: Digit0-9 code fallback handles macOS Vietnamese layout and ignores Shift+Digit', async ({ page }) => {
  await openRain(page);
  await startAt(page, 2);
  await page.evaluate(() => { window.__rainTest.spawnDrop(12, 0.2); window.__rainTest.spawnDrop(10, 0.2); });
  const key = (k, code, extra = {}) => page.evaluate(([key, code, extra]) => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true, cancelable: true, ...extra }));
  }, [k, code, extra]);
  await key('ă', 'Digit1');
  await key('â', 'Digit2');
  let s = await dbg(page);
  expect(s.solved).toBe(1);
  expect(s.drops.some(d => d.ans === 12)).toBe(false);
  await key('!', 'Digit1', { shiftKey: true });
  expect((await dbg(page)).input).toBe('');
  await key('ă', 'Digit1');
  await key('đ', 'Digit0');
  s = await dbg(page);
  expect(s.solved).toBe(2);
  expect(s.drops.some(d => d.ans === 10)).toBe(false);
});

test('physical keyboard: starting via focused #rStart blurs button so Enter immediately submits pending AUTO_WAIT answer', async ({ page }) => {
  await openRain(page);
  await page.locator('#rStart').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#rmenu')).toBeHidden();
  expect(await page.evaluate(() => document.activeElement?.id || '')).not.toBe('rStart');
  await page.evaluate(() => { window.__rainTest.spawnDrop(1, 0.2); window.__rainTest.spawnDrop(12, 0.1); });
  await page.keyboard.press('1');
  expect((await dbg(page)).input).toBe('1');
  await page.keyboard.press('Enter');
  const s = await dbg(page);
  expect(s.solved).toBe(1);
  expect(s.drops.some(d => d.ans === 1)).toBe(false);
  expect(s.drops.some(d => d.ans === 12)).toBe(true);
});

test('physical keyboard: IME-safe Enter guard ignores isComposing and Safari keyCode 229', async ({ page }) => {
  await openRain(page);
  await startAt(page, 2);
  await page.evaluate(() => { window.__rainTest.spawnDrop(1, 0.2); window.__rainTest.spawnDrop(12, 0.1); });
  await page.keyboard.press('1');
  await page.evaluate(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true, cancelable: true }));
  });
  const s = await dbg(page);
  expect(s.solved).toBe(0);
  expect(s.input).toBe('1');
});

test('desktop: #rPadToggle hides virtual pad mid-round without pausing, expands canvas, persists; mobile hides toggle', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false });
  await ctx.addInitScript(muteAudio);
  const page = await ctx.newPage();
  await openRain(page);
  await startAt(page, 1);
  await expect(page.locator('#rPadToggle')).toBeVisible();
  await expect(page.locator('#rPadToggle')).toHaveAttribute('aria-pressed', 'false');
  const hBefore = await page.evaluate(() => document.getElementById('rcv').getBoundingClientRect().height);
  await page.click('#rPadToggle');
  await expect(page.locator('#rPad')).toBeHidden();
  await expect(page.locator('#rPadToggle')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#rPadToggle')).toHaveText('Hiện phím ảo');
  expect((await dbg(page)).state).toBe('play');
  const hAfter = await page.evaluate(() => document.getElementById('rcv').getBoundingClientRect().height);
  expect(hAfter).toBeGreaterThan(hBefore + 150);
  await page.evaluate(() => window.__rainTest.spawnDrop(42, 0.2));
  await page.keyboard.press('4');
  await page.keyboard.press('2');
  expect((await dbg(page)).solved).toBe(1);
  await page.reload();
  await expect(page.locator('#rmenu')).toBeVisible();
  await page.click('#rStart');
  await expect(page.locator('#rPad')).toBeHidden();
  await ctx.close();

  const mCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await mCtx.addInitScript(muteAudio);
  const mPage = await mCtx.newPage();
  await openRain(mPage);
  await startAt(mPage, 1);
  await expect(mPage.locator('#rPadToggle')).toBeHidden();
  await expect(mPage.locator('#rPad')).toBeVisible();
  await mCtx.close();
});
