// Cá Koi: lỗi đã sửa theo audit 2026-11-20 (KOI-01..07, OPS-4, OPS-6) và phần thưởng (sao, kỷ lục).
// window.__koi chỉ tồn tại khi init script đặt window.__BB_TEST__.
import { test, expect } from './fixtures.js';
import { tapFish, skipCooldown } from './koi-helpers.js';

async function openKoi(page, storage = {}) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
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
  await page.locator('#klvgrid .lv').nth(lv - 1).click();
  await page.click('#kStartBtn');
  await expect(page.locator('#kmenu')).toBeHidden();
}

// tapFish / skipCooldown: tests/koi-helpers.js (one shared helper, aims via the game's own fishAt()).

test('KOI-02: double-tap on a grey fish counts one mistake, then the dial locks', async ({ page }) => {
  const errors = await openKoi(page);
  await start(page, 15);                               // bảng v2 (2026-11-22): cá xám có từ L15 (đỉnh đầu), L15 = 12 koi + 2 cá xám
  expect(await tapFish(page, 'decoy')).toBe(true);
  expect(await tapFish(page, 'decoy')).toBe(true);
  await expect(page.locator('#kLevel')).toHaveText('Nhầm 1/1');
  expect(await page.evaluate(() => window.__koi.cooldown)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('missed: second finger and right click are ignored', async ({ page }) => {
  await openKoi(page);
  await start(page, 15);
  await tapFish(page, 'decoy', { isPrimary: false });
  await tapFish(page, 'decoy', { button: 2, pointerType: 'mouse' });
  await expect(page.locator('#kLevel')).toHaveText('Nhầm 0/1');
});

test('KOI-03: a second mistake ends the pond early with pellets left', async ({ page }) => {
  await openKoi(page);
  await start(page, 15);
  await tapFish(page, 'decoy');
  await skipCooldown(page);
  await tapFish(page, 'decoy');
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  expect(await page.evaluate(() => window.__koi.pellets)).toBeGreaterThan(0);
  await expect(page.locator('#krTitle')).toContainText('Chưa qua Level 15');
  await expect(page.locator('#krDetail')).toContainText('dừng sớm');
  await expect(page.locator('#krStars')).toBeHidden();
});

test('KOI-06: pause works during the end-of-pond delay', async ({ page }) => {
  await openKoi(page);
  await start(page, 15);
  await tapFish(page, 'decoy');
  await skipCooldown(page);
  await tapFish(page, 'decoy');
  expect(await page.evaluate(() => window.__koi.state)).toBe('pondEnd');
  await page.click('#kPauseBtn');
  await expect(page.locator('#kpaused')).toBeVisible();
  await page.waitForTimeout(1300);
  await expect(page.locator('#kresult')).toBeHidden();
  await page.click('#kResumeBtn');
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
});

test('KOI-06: leaving mid-pond keeps the pond paused instead of wiping it', async ({ page }) => {
  await openKoi(page);
  await start(page, 1);
  await tapFish(page, 'fresh');
  await page.evaluate(() => { BB.leave('koi'); location.hash = ''; });
  await expect(page.locator('#hub')).toBeVisible();
  await page.click('#openKoi');
  await expect(page.locator('#kpaused')).toBeVisible();
  await expect(page.locator('#kScore')).toHaveText('✓ 1/10');
});

test('perfect level 1: 3 stars shown, recorded, koi_best written (OPS-4)', async ({ page }) => {
  await openKoi(page);
  await start(page, 1);
  for (let i = 0; i < 10; i++) { await skipCooldown(page); expect(await tapFish(page, 'fresh')).toBe(true); }
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krTitle')).toContainText('Qua Level 1');
  await expect(page.locator('#krStars .s.on')).toHaveCount(3, { timeout: 3000 });
  await expect(page.locator('#krStars')).toHaveAttribute('aria-label', '3 trên 3 sao');
  const r = await page.evaluate(() => ({ st: BB.gameStats('koi'), kb: localStorage.getItem('koi_best'), lv: localStorage.getItem('koi_lv2') }));
  expect(r.st.best).toBe(1); expect(r.st.stars['1']).toBe(3);
  expect(r.kb).toBe('1'); expect(r.lv).toBe('2');
  await expect(page.locator('#krNext')).toHaveText('Level 2 · 10 cá →');
});

test('tapping during cooldown costs the third star, not a mistake', async ({ page }) => {
  await openKoi(page);
  await start(page, 1);
  await tapFish(page, 'fresh');
  await page.waitForTimeout(350);                      // quá ngưỡng chạm đúp 300ms
  await tapFish(page, 'fresh');                        // vòng chưa đầy
  await expect(page.locator('#kLevel')).toHaveText('Nhầm 0/1');
  for (let i = 0; i < 9; i++) { await skipCooldown(page); await tapFish(page, 'fresh'); }   // 10 cá ở L1, chạm vội không cho ăn
  await expect(page.locator('#krStars .s.on')).toHaveCount(2, { timeout: 3000 });
  await expect(page.locator('#krRule')).toHaveText('Chờ vòng đầy rồi mới chạm là được 3 sao.');
});

test('OPS-6/KOI-04: passing level 10 (old last level) now leads on to Level 11; L30 end is covered in koi-levels.spec', async ({ page }) => {
  const errors = await openKoi(page, { koi_lv2: '10' });
  await start(page, 10);
  for (let i = 0; i < 13; i++) { await skipCooldown(page); expect(await tapFish(page, 'fresh')).toBe(true); }
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krNext')).toHaveText(/^Level 11 · \d+ cá →$/);
  expect(await page.evaluate(() => localStorage.getItem('koi_lv2'))).toBe('11');
  expect(await page.evaluate(() => BB.gameStats('koi').best)).toBe(10);
  expect(errors).toEqual([]);
});

test('legacy progress: over-cap key is clamped, BB stats seeded, daily hand-off capped', async ({ page }) => {
  await openKoi(page, { koi_lv2: '14' });
  const r = await page.evaluate(() => ({ lv: localStorage.getItem('koi_lv2'), best: BB.gameStats('koi').best, kb: koiBest() }));
  expect(r).toEqual({ lv: '11', best: 10, kb: { best: 10, lv: 11 } });
  await expect(page.locator('#klvgrid .lv')).toHaveCount(33);
  await page.evaluate(() => { BB.request('koi', 99); window.koiEnter(); });
  await expect(page.locator('#kmenu')).toBeHidden();
  await expect(page.locator('#kPond')).toHaveText(/^Level 33 · \d+ cá$/);
});

test('HUD and pause button meet size and copy rules', async ({ page }) => {
  await openKoi(page);
  await start(page, 1);
  const box = await page.locator('#kPauseBtn').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
  await expect(page.locator('#kPond')).toHaveText('Level 1 · 10 cá');
});

test('review: accidental double-tap on a koi does not cost the third star, a later early tap does', async ({ page }) => {
  await openKoi(page);
  await start(page, 1);
  await skipCooldown(page);
  await tapFish(page, 'fresh');
  await tapFish(page, 'fed');                          // cùng con, ~ngay lập tức
  expect(await page.evaluate(() => window.__koi.earlyTaps)).toBe(0);
  await page.waitForTimeout(350);
  expect(await page.evaluate(() => window.__koi.cooldown)).toBeGreaterThan(0);
  await tapFish(page, 'fed');
  expect(await page.evaluate(() => window.__koi.earlyTaps)).toBe(1);
  await expect(page.locator('#kLevel')).toHaveText('Nhầm 0/1');
});

test('review: tap ellipse leans toward the head, not the tail', async ({ page }) => {
  await openKoi(page);
  await start(page, 1);
  await skipCooldown(page);
  const r = await page.evaluate(() => {
    const K = window.__koi, fs = K.fish, cv = document.getElementById('kcv'), rc = cv.getBoundingClientRect();
    const f = fs.find(g => !g.decoy);
    fs.forEach(g => { if (g !== f) { g.x = -1000; g.y = -1000; } });     // no neighbour can win the tap (tests/koi-helpers.js)
    const tap = k => cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, isPrimary: true,
      button: 0, pointerType: 'touch', clientX: rc.left + f.x + Math.cos(f.ang) * k * f.L, clientY: rc.top + f.y + Math.sin(f.ang) * k * f.L }));
    const big = f.L * 0.52 > 20;                       // trần 20px chỉ áp khi cá nhỏ
    tap(-0.53); const tail = f.fed;
    K.cooldown = 0; tap(0.53); const head = f.fed;
    return { big, tail, head };
  });
  if (r.big) expect(r).toEqual({ big: true, tail: false, head: true });
});

test('review: HUD behind the menu shows the chosen level, not the last pond', async ({ page }) => {
  await openKoi(page, { koi_lv2: '11' });
  await start(page, 10);
  await page.click('#kPauseBtn');
  await page.click('#kQuitBtn');
  await expect(page.locator('#kmenu')).toBeVisible();
  await page.locator('#klvgrid .lv').nth(2).click();
  await expect(page.locator('#kPond')).toHaveText('Level 3 · 11 cá');
  await expect(page.locator('#kScore')).toHaveText('✓ 0/11');
});

// Neon review #13: câu báo trượt khi hết thức ăn, nhãn đọc màn hình không có "0 sao".
test('neon-13: failing on the last pellet says "Chỉ được nhầm tối đa 1 lần"', async ({ page }) => {
  const errors = await openKoi(page);
  await start(page, 1);                                // bảng v2 (2026-11-22): 10 cá, 10 viên thức ăn
  for (let i = 0; i < 8; i++) { await skipCooldown(page); expect(await tapFish(page, 'fresh')).toBe(true); }
  for (let i = 0; i < 2; i++) { await skipCooldown(page); expect(await tapFish(page, 'fed')).toBe(true); }
  expect(await page.evaluate(() => window.__koi.pellets)).toBe(0);
  await expect(page.locator('#kresult')).toBeVisible();
  // L1–5 thua nhẹ tay (DIFFICULTY-DECISIONS 2026-11-23): câu ngắn + mẹo thay cho câu luật dài.
  await expect(page.locator('#krDetail')).toHaveText('Cho ăn đúng 8/10 con cá koi. Nhầm 2 lần, được phép 1.');
  await expect(page.locator('#kresult .tip')).toContainText('Cho ăn theo một vòng quanh hồ');
  await expect(page.locator('#krDetail')).not.toContainText('Cần nhầm');
  expect(errors).toEqual([]);
});

test('neon-13: level buttons never announce "0 sao" for legacy passes', async ({ page }) => {
  await openKoi(page, { koi_lv2: '4', bb_stats: JSON.stringify({ koi: { best: 3, stars: { 2: 2 } } }) });
  const lv = page.locator('#klvgrid .lv');
  await expect(lv.nth(0)).toHaveAttribute('aria-label', 'Level 1, 10 cá, đã qua');
  await expect(lv.nth(1)).toHaveAttribute('aria-label', 'Level 2, 10 cá, đã qua, 2 sao');
  await expect(lv.nth(3)).toHaveAttribute('aria-label', 'Level 4, 11 cá');
  for (let i = 0; i < 10; i++) expect(await lv.nth(i).getAttribute('aria-label')).not.toContain('0 sao');
});

// Neon review #14: hồ tạm dừng không chạy rAF 60 fps; chơi tiếp thì chạy lại.
test('neon-14: paused pond stops requestAnimationFrame and resume restarts it', async ({ page }) => {
  await page.addInitScript(() => {
    window.__raf = 0; const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => { window.__raf++; return raf(cb); };
  });
  const errors = await openKoi(page);
  await start(page, 2);
  await page.click('#kPauseBtn');
  await expect(page.locator('#kpaused')).toBeVisible();
  await page.waitForTimeout(100);                      // khung cuối đã vẽ
  const a = await page.evaluate(() => window.__raf);
  await page.waitForTimeout(400);
  const b = await page.evaluate(() => window.__raf);
  expect(b - a).toBeLessThanOrEqual(1);
  // Đổi cỡ màn hình lúc tạm dừng: canvas vẫn có hình, không trắng trơn.
  await page.setViewportSize({ width: 700, height: 400 });
  await page.waitForTimeout(100);
  const painted = await page.evaluate(() => {
    const c = document.getElementById('kcv'), d = c.getContext('2d').getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
    return d[3] > 0;
  });
  expect(painted).toBe(true);
  await page.click('#kResumeBtn');
  expect(await page.evaluate(() => window.__koi.state)).toBe('play');
  const c = await page.evaluate(() => window.__raf);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__raf) - c).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});

test('neon-14: quitting from pause to the menu restarts the swimming loop', async ({ page }) => {
  await page.addInitScript(() => {
    window.__raf = 0; const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => { window.__raf++; return raf(cb); };
  });
  await openKoi(page);
  await start(page, 1);
  await page.click('#kPauseBtn');
  await page.waitForTimeout(100);
  await page.click('#kQuitBtn');
  await expect(page.locator('#kmenu')).toBeVisible();
  const c = await page.evaluate(() => window.__raf);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__raf) - c).toBeGreaterThan(5);
});

test('review 2026-11-21: menu copy matches the level table (fish at L1, first grey-fish level), no stale v1 rule', async ({ page }) => {
  const errors = await openKoi(page);
  const want = await page.evaluate(() => {
    const K = window.__koi; let grey = 0;
    for (let lv = 1; lv <= K.LV_MAX && !grey; lv++) if (K.params(lv).decoys) grey = lv;
    return { koi1: K.params(1).koi, grey };
  });
  const how = page.locator('#kmenu .how');
  await expect(how).toContainText(`Level 1 có ${want.koi1} cá koi.`);
  await expect(how).toContainText(`Từ level ${want.grey} có cá xám`);
  // First peak is L15 since 2026-11-22 (Duy B; L10 from 2026-11-21 before that): the copy names it instead of "every 5 levels" from L1.
  await expect(how).toContainText('Từ level 15, cứ 5 level có một màn khó, ngay sau là một màn nhẹ.');
  await expect(how).not.toContainText('mỗi level tăng thêm 1 con');
  expect(want).toEqual({ koi1: 10, grey: 15 });
  expect(errors).toEqual([]);
});
