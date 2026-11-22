// Đoán Cụm Từ: các lỗi đã sửa (W1–W13, SHELL-04, SHELL-07) và phần thưởng mới.
import { test, expect } from '@playwright/test';

async function open(page, { lv, reduced = true } = {}) {
  if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  if (lv) await page.evaluate(v => localStorage.setItem('word_lv', v), lv);
  if (lv) await page.reload();
  await page.click('#openWord');
  await expect(page.locator('#wmenu')).toBeVisible();
}
const pick = (page, L) => page.locator('#wlvgrid .lv').nth(L - 1).click();
// Bảng v2 xếp cụm theo độ khó, nên test chọn level theo cụm (đáp án), không theo số level cố định.
const levelOf = (page, ans) => page.evaluate(a => window.__word.LEVELS.findIndex(p => p.words.map(w => w.join('')).join(' ') === a) + 1, ans);
const pickPhrase = async (page, ans) => { const L = await levelOf(page, ans); expect(L, ans).toBeGreaterThan(0); await pick(page, L); return L; };
// Gõ bằng bàn phím vật lý kiểu VNI.
const vni = async (page, s) => { for (const ch of s) await page.keyboard.press(ch === ' ' ? 'Space' : ch); };
const st = page => page.evaluate(() => window.__word.state());

test('W1: dấu thanh rơi đúng chữ theo chính tả', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const t = w => { const a = [...w]; const p = window.__word.tonePos(a); return a.map((c, i) => i === p ? c.toUpperCase() : c).join(''); };
    return ['noi', 'nôi', 'mua', 'cươi', 'thoai', 'khiêu', 'truyên', 'thuât', 'gi', 'qua', 'giưa', 'hoan', 'uy'].map(t);
  });
  expect(r).toEqual(['nOi', 'nÔi', 'mUa', 'cưƠi', 'thoAi', 'khiÊu', 'truyÊn', 'thuÂt', 'gI', 'quA', 'giƯa', 'hoAn', 'Uy']);
  await pickPhrase(page, 'bà nội'); await page.click('#wStart');
  await vni(page, 'ba2noi65');                                      // gõ hết rồi mới bỏ dấu
  expect((await st(page)).cur).toBe('bànội');
});

test('W5: VNI trên bàn phím máy tính, bỏ qua Ctrl/Cmd', async ({ page }) => {
  await open(page);
  await pickPhrase(page, 'truyền thống'); await page.click('#wStart');   // 6+5 chữ
  await vni(page, 'truo77');                                        // uo + 7 → ươ, 7 lần nữa → uơ
  expect((await st(page)).cur).toBe('truơ');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace');
  await vni(page, 'truye6n2tho6ng1');
  expect((await st(page)).cur).toBe('truyềnthống');
  await page.keyboard.press('Control+c');
  expect((await st(page)).cur).toBe('truyềnthống');
  await page.keyboard.press('Backspace');
  await vni(page, 'd9');                                            // d9 → đ
  expect((await st(page)).cur).toBe('truyềnthốnđ');
});

test('W7: phím mũ/trăng/móc đi được giữa các nhóm', async ({ page }) => {
  await open(page);
  await pick(page, 1); await page.click('#wStart');
  const tap = sel => page.locator(sel).dispatchEvent('pointerdown');
  await tap('#wKeys [data-k="o"]'); await tap('#wKeys [data-a="mu"]');
  expect((await st(page)).cur).toBe('ô');
  await tap('#wKeys [data-a="moc"]');
  expect((await st(page)).cur).toBe('ơ');
  await tap('#wKeys [data-k="d"]');
  await tap('#wKeys [data-a="mu"]');                                // áp lên nguyên âm gần nhất, không phải chữ cuối
  expect((await st(page)).cur).toBe('ôd');
});

test('W4/W10: xanh dương gộp o/ô/ơ, phím nguyên âm có màu', async ({ page }) => {
  await open(page);
  const r = await page.evaluate(() => {
    const W = window.__word, p = W.PHRASES.find(x => x.words.map(w => w.join('')).join(' ') === 'cà phê');
    return W.evaluateFor(p, [...'caphe']);
  });
  expect(r).toEqual(['green', 'blue', 'green', 'green', 'blue']);
  await pickPhrase(page, 'cà phê'); await page.click('#wStart');
  await vni(page, 'caphe'); await page.keyboard.press('Enter');
  await expect(page.locator('#wKeys [data-k="e"]')).toHaveClass(/blue/);
  await expect(page.locator('#wKeys [data-k="c"]')).toHaveClass(/green/);
});

test('W6: lượt đoán vô nghĩa bị từ chối, không mất lượt; mọi đáp án hợp lệ', async ({ page }) => {
  await open(page);
  const bad = await page.evaluate(() => window.__word.PHRASES.filter(p => !p.words.every(w => window.__word.validSyllable(w))).length);
  expect(bad).toBe(0);
  await pickPhrase(page, 'bà nội'); await page.click('#wStart');   // 5 ô: 'aaaaaa' gõ đủ ô nhưng không phải tiếng Việt
  await vni(page, 'aaaaaa'); await page.keyboard.press('Enter');
  const s = await st(page);
  expect(s.rows).toBe(0);
  await expect(page.locator('#wToast')).toContainText('chưa phải tiếng Việt');
});

test('W3: gợi ý không lộ đáp án', async ({ page }) => {
  await open(page);
  const leaks = await page.evaluate(() => {
    const P = window.__word.PHRASES, ans = P.map(p => p.words.map(w => w.join('')).join(' '));
    return P.filter(p => {
      const cat = p.cat.toLowerCase().normalize('NFC'), words = p.words.map(w => w.join(''));
      return ans.includes(cat) || words.some(w => cat.split(/[ ,]+/).includes(w));
    }).map(p => p.cat);
  });
  expect(leaks).toEqual([]);
});

test('W2/SHELL-07: trong lúc lật ô thì khoá nhập và ☰, kết quả đúng cụm đã chơi', async ({ page }) => {
  await open(page, { lv: '10', reduced: false });
  await pickPhrase(page, 'cà phê'); await page.click('#wStart');
  await vni(page, 'ca2phe6'); await page.keyboard.press('Enter');
  await expect(page.locator('#wMenuBtn')).toBeDisabled();
  await page.locator('#wMenuBtn').click({ force: true });
  await vni(page, 'ca2phe6'); await page.keyboard.press('Enter');
  await expect(page.locator('#wresult')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#wmenu')).toBeHidden();
  await expect(page.locator('#wrBig')).toHaveText('CÀ PHÊ');
  await expect(page.locator('#wrDetail')).toContainText('1/6');
  await expect(page.locator('#wrStars')).toHaveAttribute('aria-label', '3/3 sao');
  const stats = await page.evaluate(() => window.BB.gameStats('word'));
  expect(stats.stars).toEqual({ p1: 3 });                         // sao nằm ở mã cụm cà phê, không ở cụm nào khác
});

test('W11: ☰ giữa ván không xoá bàn, có nút chơi tiếp', async ({ page }) => {
  await open(page);
  await pickPhrase(page, 'bà nội'); await page.click('#wStart');
  await vni(page, 'ca2phe6'); await page.keyboard.press('Enter');
  await expect.poll(async () => (await st(page)).state).toBe('play');
  await vni(page, 'ba');
  await page.click('#wMenuBtn');
  await expect(page.locator('#wResume')).toBeVisible();
  await page.click('#wResume');
  const s = await st(page);
  expect([s.rows, s.cur, s.state]).toEqual([1, 'ba', 'play']);
});

test('W13 + tiến độ cũ: word_lv hỏng không làm sập, word_lv cũ vẫn giữ', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await open(page, { lv: '2.5' });
  await expect(page.locator('#wlvgrid .lv.done')).toHaveCount(1);
  await expect(page.locator('#wStart')).toContainText('Level 1');   // cụm cũ L1 (bà nội) đã sang level khác
  await open(page, { lv: '6' });
  await expect(page.locator('#wlvgrid .lv.done')).toHaveCount(5);
  await expect(page.locator('#wBestTxt')).toHaveText('Đã qua 5/50 level');
  expect(errors).toEqual([]);
});

test('Level cuối: không có Level N+1', async ({ page }) => {
  await open(page);
  const n = await page.evaluate(() => window.__word.LV_MAX);
  expect(await levelOf(page, 'nước mía')).toBe(n);                  // bảng v2: cụm cuối là nước mía
  await pick(page, n); await page.click('#wStart');
  await vni(page, 'nuo7c1mia1'); await page.keyboard.press('Enter');
  await expect(page.locator('#wresult')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#wrNext')).not.toContainText(`Level ${n + 1}`);
  await expect(page.locator('#wrTitle')).toContainText('Phá đảo');
});

test('W8: hàng dài nhất không tràn ở 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await open(page);
  await pickPhrase(page, 'truyền thống'); await page.click('#wStart');   // 11 ô, hàng dài nhất
  const over = await page.evaluate(() => {
    const rows = [...document.querySelectorAll('#wBoard .wrow')];
    return Math.max(...rows.map(r => r.getBoundingClientRect().right)) - innerWidth;
  });
  expect(over).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
});

test('Thử thách ngày: takeRequest mở thẳng level', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.evaluate(() => { window.BB.request('word', 3); location.hash = 'chu'; });
  await expect(page.locator('#wmenu')).toBeHidden();
  expect((await st(page)).level).toBe(3);
});

test('Review #2: rời game giữa lúc lật ô thắng → ghi kết quả, không pháo giấy/màn kết quả trên hub', async ({ page }) => {
  await open(page, { reduced: false });
  await pickPhrase(page, 'cà phê'); await page.click('#wStart');
  await vni(page, 'ca2phe6'); await page.keyboard.press('Enter');
  expect((await st(page)).state).toBe('reveal');
  await page.evaluate(() => history.back());
  await expect.poll(() => page.evaluate(() => window.APP.active)).not.toBe('word');
  await page.waitForTimeout(1500);
  expect(await page.locator('body > canvas').count()).toBe(0);
  await expect(page.locator('#wresult')).toBeHidden();
  const stats = await page.evaluate(() => window.BB.gameStats('word'));
  expect(stats.stars.p1).toBe(3);
});

test('Review #3: bảng có role, ô đã chấm là img, có vùng đọc tóm tắt lượt', async ({ page }) => {
  await open(page);
  await pickPhrase(page, 'cà phê'); await page.click('#wStart');
  await vni(page, 'caphe'); await page.keyboard.press('Enter');
  await expect(page.locator('#wLive')).toContainText('CAPHE: 3 đúng chỗ, 0 sai chỗ, 2 khác dấu, 0 không có.');
  await expect(page.locator('#wBoard')).toHaveAttribute('role', 'group');
  await expect(page.locator('#wBoard .wrow').first()).toHaveAttribute('aria-label', 'Lượt 1');
  const cell = page.locator('#wBoard .wrow').first().locator('.wcell').first();
  await expect(cell).toHaveAttribute('role', 'img');
  const snap = await page.locator('#wBoard').ariaSnapshot();
  expect(snap).toContain('C, đúng chỗ');
});

test('Review #4: thử thách ngày không xoá ván dở', async ({ page }) => {
  await open(page);
  const L = await pickPhrase(page, 'bà nội'); await page.click('#wStart');
  await vni(page, 'ca2phe6'); await page.keyboard.press('Enter');
  await expect.poll(async () => (await st(page)).state).toBe('play');
  await page.evaluate(() => history.back());
  await expect.poll(() => page.evaluate(() => window.APP.active)).not.toBe('word');
  await page.evaluate(() => { window.BB.request('word', 5); location.hash = 'chu'; });
  await expect(page.locator('#wmenu')).toBeVisible();
  await expect(page.locator('#wResume')).toBeVisible();
  await expect(page.locator('#wStart')).toContainText('Level 5');
  await page.click('#wResume');
  const s = await st(page);
  expect([s.level, s.rows]).toEqual([L, 1]);
});

// Responsive: xoay ngang thì bảng nằm trọn trên bàn phím và nút 💡 trong màn hình; laptop thì bàn phím không kéo dài.
for (const [w, h] of [[667, 375], [844, 390], [320, 568], [1920, 1080]]) {
  test(`R1: bảng dài nhất vừa màn ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    await pickPhrase(page, 'truyền thống'); await page.click('#wStart');
    const r = await page.evaluate(() => {
      const R = s => document.querySelector(s).getBoundingClientRect();
      return { b: R('#wBoard'), k: R('#wKeys'), hint: R('#wHint'), lg: R('#wordApp .wlegend'), vw: innerWidth, vh: innerHeight,
        hudKids: ['#wLevel', '#wTries', '#wMenuBtn'].map(R),
        row: getComputedStyle(document.querySelector('#wordApp .wstage')).flexDirection === 'row' };
    });
    expect(r.b.bottom).toBeLessThanOrEqual(r.k.top + 1);
    expect(r.b.top).toBeGreaterThanOrEqual(0);
    // Màn ngang thấp: HUD nổi lên hai cột bên, nên kiểm từng pill/nút thay vì cả thanh HUD.
    const hit = (a, c) => a.left < c.right - 1 && c.left < a.right - 1 && a.top < c.bottom - 1 && c.top < a.bottom - 1;
    for (const h of r.hudKids) for (const o of [r.b, r.hint, r.lg]) expect(hit(h, o)).toBe(false);
    if (r.row) {
      expect(r.hint.right).toBeLessThanOrEqual(r.b.left + 1);
      expect(r.lg.left).toBeGreaterThanOrEqual(r.b.right - 1);
    }
    expect(r.lg.bottom).toBeLessThanOrEqual(r.k.top + 1);
    expect(r.hint.top).toBeGreaterThanOrEqual(0);
    expect(r.hint.bottom).toBeLessThanOrEqual(r.vh);
    expect(r.k.width).toBeLessThanOrEqual(640);
    expect(r.k.bottom).toBeLessThanOrEqual(r.vh + 1);
  });
}

// ---------- Review PR #2 (Neon round 1) ----------
test('Neon #1: core/hub/chia sẻ đếm đúng 50 level của Đoán Cụm Từ', async ({ page }) => {
  // Người chơi cũ đã qua 24 level, có word_lv từ trước khi hub seed lần đầu (trước khi trang chạy).
  await page.addInitScript(() => localStorage.setItem('word_lv', '25'));
  await page.goto('/');
  const r = await page.evaluate(() => ({ core: window.BB.LV_MAX.word, game: window.__word.LV_MAX, phrases: window.__word.PHRASES.length,
    best: window.wordBest(), share: window.BB.shareText(), p: window.BB.progressOf('word'),
    topStars: window.BB.starsAt('word', window.BB.progressOf('word').best) }));
  expect(r).toMatchObject({ core: 50, game: 50, phrases: 50, best: 24 });
  // Share names the highest level passed in today's (v2) order and the stars of that level's own phrase.
  expect(r.p).toMatchObject({ done: 24, registered: true });
  expect(r.share).toContain(`Đoán Cụm Từ: Lv ${r.p.best} (${r.topStars}/3 ★)`);
  await expect(page.locator('#hubWord')).toContainText('24/50');
  await page.click('#openWord');
  await expect(page.locator('#wBestTxt')).toHaveText('Đã qua 24/50 level');
  await expect(page.locator('#wlvgrid .lv')).toHaveCount(50);
});

test('Neon #4: rời game ngay sau khi đoán cụm dài nhất → không còn tiếng tick nào kêu trên hub', async ({ page }) => {
  await page.addInitScript(() => {
    window.__audioAfterLeave = 0;
    const orig = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...a) {
      if (window.APP && window.APP.active !== 'word') window.__audioAfterLeave++;
      return orig.apply(this, a);
    };
  });
  await open(page, { reduced: false });
  await pickPhrase(page, 'truyền thống'); await page.click('#wStart');   // 11 ô → 11 tiếng tick
  // word.js tự hẹn giờ tiếng tick, không nhờ delay của BB.sfx: không phụ thuộc core dọn hẹn giờ lúc rời game.
  await page.evaluate(() => { const o = window.BB.sfx; window.__delayed = 0;
    window.BB.sfx = (n, opt = {}) => { if (opt.delay > 0) window.__delayed++; return o(n, opt); }; });
  await vni(page, 'truye6n2tho6ng1'); await page.keyboard.press('Enter');
  expect((await st(page)).state).toBe('reveal');
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__delayed)).toBe(0);
  await page.evaluate(() => history.back());
  await expect.poll(() => page.evaluate(() => window.APP.active)).not.toBe('word');
  await page.waitForTimeout(1600);                                  // lâu hơn cả chuỗi tick (≤ 1140 ms) lẫn tiếng sao
  expect(await page.evaluate(() => window.__delayed)).toBe(0);
  expect(await page.evaluate(() => window.__audioAfterLeave)).toBe(0);
  expect((await page.evaluate(() => window.BB.gameStats('word'))).stars.p48).toBe(3);
});

test('Neon #4: rời game ở màn kết quả → tiếng sao hẹn giờ cũng bị huỷ', async ({ page }) => {
  await page.addInitScript(() => {
    window.__audioAfterLeave = 0;
    const orig = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (...a) {
      if (window.APP && window.APP.active !== 'word') window.__audioAfterLeave++;
      return orig.apply(this, a);
    };
  });
  await open(page);
  await pickPhrase(page, 'bà nội'); await page.click('#wStart');
  await vni(page, 'ba2noi65'); await page.keyboard.press('Enter');
  await expect(page.locator('#wresult')).toBeVisible();
  await page.evaluate(() => history.back());
  await expect.poll(() => page.evaluate(() => window.APP.active)).not.toBe('word');
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => window.__audioAfterLeave)).toBe(0);
});

for (const [w, h] of [[568, 320], [740, 360]]) {
  test(`Neon #11: ô chữ cụm dài nhất đọc được ở ${w}x${h} (≥ 22px), HUD không đè bảng`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    await open(page);
    await pickPhrase(page, 'truyền thống'); await page.click('#wStart');
    await page.click('#wHint');
    const r = await page.evaluate(() => {
      const c = document.querySelector('#wBoard .wcell'), R = s => document.querySelector(s).getBoundingClientRect();
      const m = R('#wMenuBtn'), top = document.elementFromPoint(m.left + m.width / 2, m.top + m.height / 2);
      return { w: c.getBoundingClientRect().width, h: c.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(c).fontSize),
        menuOnTop: !!top && top.closest('#wMenuBtn') !== null, over: document.documentElement.scrollWidth - innerWidth,
        rows: document.querySelectorAll('#wBoard .wrow').length, b: R('#wBoard'), k: R('#wKeys') };
    });
    expect(r.w).toBeGreaterThanOrEqual(22);
    expect(r.h).toBeGreaterThanOrEqual(22);
    expect(r.fs).toBeGreaterThanOrEqual(11);
    expect(r.rows).toBe(6);
    expect(r.b.bottom).toBeLessThanOrEqual(r.k.top + 1);
    expect(r.menuOnTop).toBe(true);                                 // nút ☰ vẫn bấm được, không bị .wstage che
    expect(r.over).toBeLessThanOrEqual(0);
    await page.click('#wMenuBtn');
    await expect(page.locator('#wmenu')).toBeVisible();
  });
}

test('Neon #14: window.__word chỉ mở cho trình duyệt tự động hoặc ?test', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'webdriver', { get: () => false }));
  await page.goto('/');
  expect(await page.evaluate(() => typeof window.__word)).toBe('undefined');
  expect(await page.evaluate(() => window.BB.LV_MAX.word)).toBe(50);   // số level vẫn đúng khi không có cửa test
  await page.goto('/?test');
  expect(await page.evaluate(() => typeof window.__word)).toBe('object');
});

test('Neon #14: nút level có aria-pressed theo level đang chọn', async ({ page }) => {
  await open(page);
  const pressed = () => page.locator('#wlvgrid .lv[aria-pressed="true"]');
  await expect(pressed()).toHaveCount(1);
  await expect(page.locator('#wlvgrid .lv[aria-pressed="false"]')).toHaveCount(49);
  await pick(page, 7);
  await expect(pressed()).toHaveCount(1);
  await expect(page.locator('#wlvgrid .lv').nth(6)).toHaveAttribute('aria-pressed', 'true');
});
