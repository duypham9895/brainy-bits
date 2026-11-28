// Shell and hub: zoom, HUD buttons, router lifecycle, Back navigation, hub progress, daily
// challenge, settings, reduced motion, focus, PWA. Each test stays well under 20 s.
import { test, expect } from './fixtures.js';

const today = () => {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

test('page zoom is allowed and only game surfaces block gestures (SHELL-02, OPS-13)', async ({ page }) => {
  await page.goto('/');
  const vp = await page.getAttribute('meta[name=viewport]', 'content');
  expect(vp).not.toMatch(/user-scalable\s*=\s*no|maximum-scale/);
  const ta = await page.evaluate(() => ({
    html: getComputedStyle(document.documentElement).touchAction,
    body: getComputedStyle(document.body).touchAction,
    cv: getComputedStyle(document.getElementById('cv')).touchAction,
  }));
  expect(ta.html).not.toBe('none');
  expect(ta.body).not.toBe('none');
  expect(ta.cv).toBe('none');
});

test('head has description, Open Graph, JSON-LD, color-scheme, theme-color, icons and gstatic preconnect (OPS-1/2/12, SHELL-16/18)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Brainy Bits — Trò ngắn luyện nhớ, tính nhẩm và chữ Việt');
  for (const sel of ['meta[name=description]', 'meta[name="color-scheme"]', 'meta[name=theme-color]',
    'meta[property="og:title"]', 'meta[property="og:url"]', 'meta[property="og:image"]',
    'meta[property="og:image:type"]', 'meta[property="og:image:alt"]', 'meta[name="twitter:image"]',
    'link[rel=canonical]', 'link[rel=manifest]', 'link[rel=icon][href="favicon.ico"]',
    'link[rel=apple-touch-icon]', 'link[rel=preconnect][href="https://fonts.gstatic.com"][crossorigin]',
    'script[type="application/ld+json"]']) {
    await expect(page.locator(sel), sel).toHaveCount(1);
  }
  await expect(page.locator('meta[property="og:url"]')).toHaveAttribute('content', 'https://brainybits.thucanhtrantonnu.com/');
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://brainybits.thucanhtrantonnu.com/icons/og.png');
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href', 'https://brainybits.thucanhtrantonnu.com/');
  const ld = JSON.parse(await page.locator('script[type="application/ld+json"]').textContent());
  expect(ld['@type']).toBe('WebApplication');
  expect(ld.inLanguage).toBe('vi');
  expect(ld.isAccessibleForFree).toBe(true);
  expect((await page.request.get('/favicon.ico')).ok()).toBe(true);
  expect((await page.request.get('/icons/og.png')).ok()).toBe(true);
  const m = await (await page.request.get('/manifest.webmanifest')).json();
  const countPat = /\b(5|năm)\s+trò\b/i;
  for (const val of [
    await page.title(),
    await page.locator('meta[name=description]').getAttribute('content'),
    await page.locator('meta[property="og:title"]').getAttribute('content'),
    await page.locator('meta[property="og:description"]').getAttribute('content'),
    await page.locator('meta[property="og:image:alt"]').getAttribute('content'),
    ld.alternateName,
    ld.description,
    await page.locator('#hubIntro').textContent(),
    m.name,
    m.description,
  ]) {
    expect(val).not.toMatch(countPat);
  }
  expect(m.display).toBe('standalone');
  expect(m.orientation ?? 'any').toBe('any');            // landscape layouts exist; do not lock installed PWAs (review #8)
  expect(m.icons.some(i => i.purpose === 'maskable')).toBe(true);
  for (const i of m.icons) expect((await page.request.get('/' + i.src)).ok()).toBe(true);
});

for (const w of [320, 362, 390]) {
  for (const wideFont of [false, true])
  test(`round HUD buttons stay 44px and on screen at ${w}px${wideFont ? ' with a wide fallback font' : ''} (SHELL-01, SHELL-06)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 700 });
    await page.goto('/#tau');
    // CI (Linux) and Android render wider than the dev Mac, and Baloo 2 may still be loading:
    // force a wide fallback so clipped pills show up locally too.
    if (wideFont) await page.addStyleTag({ content: '*{font-family:Verdana,"DejaVu Sans",sans-serif !important}' });
    const r = await page.evaluate(() => {
      document.getElementById('hLevel').textContent = 'Level 11 · 15 ga';
      const s = document.getElementById('hStreak'); s.textContent = '🔥 12'; s.classList.remove('hidden');
      const out = {};
      for (const [app, id] of [['trainApp', 'pauseBtn'], ['koiApp', 'kPauseBtn'], ['memApp', 'mPause'], ['rainApp', 'rPause'], ['wordApp', 'wMenuBtn']]) {
        document.querySelectorAll('[id$="App"]').forEach(a => a.style.display = a.id === app ? 'block' : 'none');
        const b = document.getElementById(id).getBoundingClientRect();
        out[id] = { w: b.width, h: b.height, right: b.right, iw: innerWidth };
      }
      document.getElementById('hScore').textContent = '✓ 12/15';
      document.querySelectorAll('[id$="App"]').forEach(a => a.style.display = a.id === 'trainApp' ? 'block' : 'none');
      out.pills = [...document.querySelectorAll('#hud .pill')].filter(p => p.offsetParent)
        .map(p => ({ id: p.id, sw: p.scrollWidth, cw: p.clientWidth }));
      return out;
    });
    for (const p of r.pills) expect(p.sw, `pill ${p.id} text fits`).toBeLessThanOrEqual(p.cw);
    delete r.pills;
    for (const [id, b] of Object.entries(r)) {
      expect(b.w, id).toBeGreaterThanOrEqual(44);
      expect(b.h, id).toBeGreaterThanOrEqual(44);
      expect(b.right, id).toBeLessThanOrEqual(b.iw);
    }
  });
}

test('router calls BB.leave for the game being left (SHELL-09, OPS-10)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { window.__left = []; ['koi', 'mem'].forEach(k => BB.onLeave(k, () => window.__left.push(k))); });
  await page.click('#openKoi');
  await expect(page.locator('#kmenu')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#hub')).toBeVisible();
  await page.click('#openMem');
  await expect(page.locator('#mmenu')).toBeVisible();
  await page.locator('#mmenu [data-home]').click();
  await expect(page.locator('#hub')).toBeVisible();
  expect(await page.evaluate(() => window.__left)).toEqual(['koi', 'mem']);
});

test('home button steps back instead of leaving a dead Back entry (SHELL-10)', async ({ page }) => {
  await page.goto('/');
  await page.click('#openRain');
  await expect(page.locator('#rmenu')).toBeVisible();
  await page.locator('#rmenu [data-home]').click();
  await expect(page.locator('#hub')).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('');
  // The game entry is still ahead in history, so Forward reopens it: Back was a real step.
  await page.goForward();
  await expect(page.locator('#rmenu')).toBeVisible();
  // A deep link has no hub entry behind it: home replaces the entry and shows the hub.
  await page.goto('/#chu');
  await expect(page.locator('#wmenu')).toBeVisible();
  await page.locator('#wmenu [data-home]').click();
  await expect(page.locator('#hub')).toBeVisible();
});

test('hub reads legacy keys, seeds BB stats once and shows level/LV_MAX and stars (OPS-5/7/11)', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('rtd_best3', '3');   // train: highest level passed
    localStorage.setItem('mem_lv', '5');      // mem: next level to play -> passed 4
    localStorage.setItem('koi_lv2', '99');    // corrupt / beyond the old cap -> clamped to the legacy top (11), i.e. passed 10
    localStorage.setItem('bb_stats', JSON.stringify({ rain: { best: 2, stars: { 1: 3, 2: 2 } } }));
  });
  await page.goto('/');
  await expect(page.locator('#hubTrain')).toHaveText('Đã qua 3/37 level');
  await expect(page.locator('#hubMem')).toHaveText('Đã qua 4/36 level');
  await expect(page.locator('#hubKoi')).toHaveText('Đã qua 10/37 level');
  await expect(page.locator('#hubRain')).toHaveText('Đã qua 2/36 level · ★ 5/108');
  await expect(page.locator('#hubWord')).toHaveText('50 level, chưa chơi');
  await expect(page.locator('#hubStars')).toHaveText('5');
  const s = await page.evaluate(() => BB.gameStats('mem').best);
  expect(s).toBe(4);
});

test('daily card opens the day\'s game at the pinned level and shows done (C daily)', async ({ page }) => {
  await page.goto('/');
  const d = await page.evaluate(() => { const d = BB.daily(); window.__req = null;
    const orig = BB.request; BB.request = (g, l) => { window.__req = [g, l]; orig(g, l); }; return d; });
  await expect(page.locator('#hubDailyGame')).toContainText(`Level ${d.level}`);
  await expect(page.locator('#hubDailyState')).toHaveText('Chơi');
  await page.click('#hubDaily');
  await expect(page.locator('#hub')).toBeHidden();
  expect(await page.evaluate(() => window.__req)).toEqual([d.game, d.level]);
  const app = { train: 'trainApp', koi: 'koiApp', mem: 'memApp', rain: 'rainApp', word: 'wordApp' }[d.game];
  // App wrappers hold only fixed-position children, so check the router's display flag.
  await expect(page.locator('#' + app)).toHaveCSS('display', 'block');

  await page.evaluate(t => localStorage.setItem('bb_daily_done', t), today());
  await page.goto('/');
  await expect(page.locator('#hubDailyState')).toHaveText('✓ Đã xong');
});

test('streak and total stars strip reflect BB data', async ({ page }) => {
  await page.addInitScript(t => {
    localStorage.setItem('bb_log', JSON.stringify([{ g: 'mem', lv: 1, won: true, stars: 3, score: 0, d: t, ms: 0 }]));
    localStorage.setItem('bb_stats', JSON.stringify({ mem: { best: 1, stars: { 1: 3 } } }));
    localStorage.setItem('bb_seeded_v2', '1');
  }, today());
  await page.goto('/');
  await expect(page.locator('#hubStreak')).toHaveText('1');
  await expect(page.locator('#hubStars')).toHaveText('3');
});

test('settings: sound switch persists, Esc closes, reset needs a confirm step (OPS-8)', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { localStorage.setItem('mem_lv', '4'); localStorage.setItem('bb_stats', '{"mem":{"best":3,"stars":{}}}'); });
  await page.click('#hubSettings');
  await expect(page.locator('#settings')).toBeVisible();
  await expect(page.locator('#setSound')).toHaveAttribute('aria-checked', 'true');
  await page.click('#setSound');
  await expect(page.locator('#setSound')).toHaveAttribute('aria-checked', 'false');
  expect(await page.evaluate(() => localStorage.getItem('bb_sound'))).toBe('0');
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings')).toBeHidden();

  await page.click('#hubSettings');
  await page.click('#setReset');
  await expect(page.locator('#setConfirm')).toBeVisible();
  await page.click('#setResetNo');
  expect(await page.evaluate(() => localStorage.getItem('mem_lv'))).toBe('4');
  await page.click('#setReset');
  await Promise.all([page.waitForEvent('load'), page.click('#setResetYes')]);
  const left = await page.evaluate(() => [localStorage.getItem('mem_lv'), BB.gameStats('mem').best, localStorage.getItem('bb_sound')]);
  expect(left).toEqual([null, 0, '0']);                 // progress gone, preference kept
});

test('keyboard focus is visible on hub controls (SHELL-11)', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const o = await page.evaluate(() => { const s = getComputedStyle(document.activeElement); return [document.activeElement.tagName, s.outlineStyle, parseFloat(s.outlineWidth)]; });
  expect(o[0]).toBe('BUTTON');
  expect(o[1]).toBe('solid');
  expect(o[2]).toBeGreaterThanOrEqual(2);
});

test('reduced motion: cards fade without scaling (SHELL-14)', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#nho');
  const name = await page.evaluate(() => getComputedStyle(document.querySelector('#mmenu .card')).animationName);
  expect(name).toBe('bbFade');
});

test('decorative icons are hidden from screen readers and icon buttons have labels (SHELL-12/13)', async ({ page }) => {
  await page.goto('/');
  const bad = await page.evaluate(() => [...document.querySelectorAll('.logo, .gi, .how .i')].filter(e => e.getAttribute('aria-hidden') !== 'true').length);
  expect(bad).toBe(0);
  const unlabeled = await page.evaluate(() => [...document.querySelectorAll('.roundbtn, .iconbtn, .k-del')].filter(b => !b.getAttribute('aria-label')).map(b => b.id));
  expect(unlabeled).toEqual([]);
});

test('service worker caches the shell and the hub loads offline (OPS-2)', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  // waitForFunction does not await an async predicate (a Promise is truthy), so poll explicitly.
  await expect.poll(() => page.evaluate(async () => !!(await caches.match('js/hub.js'))), { timeout: 10000 }).toBe(true);
  await page.reload();                                   // now controlled by the worker
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  // Network first while online: a stale cached copy must not be served (review MUST #1).
  const body = await page.evaluate(async () => {
    const name = (await caches.keys()).find(k => k.startsWith('bb-v'));
    await (await caches.open(name)).put(new Request(new URL('js/hub.js', location.href)), new Response('STALE'));
    return (await fetch('js/hub.js')).text();
  });
  expect(body).not.toBe('STALE');
  expect(body).toContain('renderHub');
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator('#openTrain')).toBeVisible();
  await page.click('#openKoi');
  await expect(page.locator('#kmenu')).toBeVisible();
  await context.setOffline(false);
});

test.describe('hub layout uses the screen width', () => {
  const layout = () => {
    const r = id => document.getElementById(id).getBoundingClientRect();
    const cards = ['openTrain', 'openKoi', 'openMem', 'openRain', 'openWord'].map(r);
    return {
      cols: cards.filter(c => Math.round(c.top) === Math.round(cards[0].top)).length,
      wrap: document.querySelector('.hubwrap').getBoundingClientRect().width,
      headerRow: Math.abs(r('hubStreak').top - r('hubSettings').top) < 40,
      stripGap: document.querySelector('.top-actions').getBoundingClientRect().left - document.querySelector('.hubstrip').getBoundingClientRect().right,
    };
  };
  for (const [w, h, cols, header] of [[390, 844, 1, false], [768, 1024, 2, false], [1280, 800, 3, true], [1920, 1080, 3, true]]) {
    test(`${w}x${h}: ${cols} column(s)${header ? ', header row' : ''}`, async ({ page }) => {
      await page.addInitScript(t => {
        localStorage.setItem('bb_log', JSON.stringify([{ g: 'mem', lv: 1, won: true, stars: 3, score: 0, d: t, ms: 0 }]));
        localStorage.setItem('bb_stats', JSON.stringify({ mem: { best: 1, stars: { 1: 3 } } }));
        localStorage.setItem('bb_seeded_v2', '1');
      }, today());
      await page.setViewportSize({ width: w, height: h });
      await page.goto('/');
      await expect(page.locator('#hub')).toBeVisible();
      await expect(page.locator('#hubStrip')).toBeVisible();
      // Cards slide in with a staggered entrance; measure once it settles (slow CI caught them mid-slide).
      await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
      const l = await page.evaluate(layout);
      expect(l.cols).toBe(cols);
      expect(l.headerRow).toBe(header);
      expect(l.wrap).toBeLessThanOrEqual(1100);
      if (header) expect(l.stripGap).toBeLessThanOrEqual(24);   // stats sit next to top-actions, no empty column
      if (cols === 3) {                                   // two cards on the second row, centred as a pair
        const mid = await page.evaluate(() => {
          const a = document.getElementById('openRain').getBoundingClientRect(), b = document.getElementById('openWord').getBoundingClientRect();
          return (a.left + b.right) / 2 - innerWidth / 2;
        });
        expect(Math.abs(mid)).toBeLessThan(2);
      }
    });
  }
});

// ---------- PR #2 cross-vendor review (Neon round 1) ----------

test('re-seeds a word best clamped to 12 by an older build (review #1)', async ({ page }) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
    localStorage.clear();
    localStorage.setItem('word_lv', '25');             // next level to play -> passed 24
    localStorage.setItem('bb_stats', JSON.stringify({ word: { best: 12, stars: {} } }));
    localStorage.setItem('bb_seeded_v1', '1');         // the old build already seeded (and clamped)
  });
  await page.goto('/');
  await expect(page.locator('#hubWord')).toHaveText('Đã qua 24/50 level');
  expect(await page.evaluate(() => [BB.gameStats('word').best, localStorage.getItem('bb_seeded_v2')])).toEqual([24, '1']);
  // Seeding only raises: a stored best above legacy stays. The hub counts phrases actually passed (word registers
  // BB.setProgress since table v2 reordered them), so a bare best of 30 with no stars still shows the 24 from word_lv.
  await page.evaluate(() => { localStorage.setItem('bb_stats', JSON.stringify({ word: { best: 30, stars: {} } })); localStorage.removeItem('bb_seeded_v2'); });
  await page.reload();
  expect(await page.evaluate(() => BB.gameStats('word').best)).toBe(30);
  await expect(page.locator('#hubWord')).toHaveText('Đã qua 24/50 level');
});

for (const [btn, menu] of [['openTrain', 'menu'], ['openKoi', 'kmenu'], ['openMem', 'mmenu'], ['openRain', 'rmenu'], ['openWord', 'wmenu']]) {
  test(`opening a game moves focus into its menu (${menu}, review #6)`, async ({ page }) => {
    await page.goto('/');
    await page.click('#' + btn);
    await expect(page.locator('#' + menu)).toBeVisible();
    await expect.poll(() => page.evaluate(m => document.getElementById(m).contains(document.activeElement), menu)).toBe(true);
  });
}

test('Tab and Shift+Tab stay inside an open dialog (review #6)', async ({ page }) => {
  await page.goto('/');
  await page.click('#hubSettings');
  await expect(page.locator('#settings')).toBeVisible();
  const inside = id => page.evaluate(i => document.getElementById(i).contains(document.activeElement), id);
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Tab'); expect(await inside('settings'), `Tab ${i + 1}`).toBe(true); }
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Shift+Tab'); expect(await inside('settings'), `Shift+Tab ${i + 1}`).toBe(true); }
  await page.keyboard.press('Escape');
  await expect(page.locator('#settings')).toBeHidden();
  // A game menu traps too, without blocking the game from starting.
  await page.click('#openKoi');
  await expect(page.locator('#kmenu')).toBeVisible();
  for (let i = 0; i < 25; i++) await page.keyboard.press('Tab');
  expect(await inside('kmenu')).toBe(true);
  await page.click('#kStartBtn');                      // the trap must not get in the way of playing
  await expect(page.locator('#kmenu')).toBeHidden();
});

test('settings sheet closes when Forward reopens a game (review #7)', async ({ page }) => {
  await page.goto('/');
  await page.click('#openTrain');
  await expect(page.locator('#menu')).toBeVisible();
  await page.goBack();
  await expect(page.locator('#hub')).toBeVisible();
  await page.click('#hubSettings');
  await expect(page.locator('#settings')).toBeVisible();
  await page.goForward();
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#settings')).toBeHidden();
  await page.click('#startBtn', { timeout: 3000 });     // nothing intercepts the pointer
});

test('hub copy and stat cells read naturally (review #13, #14)', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#openTrain small')).toHaveText('Đổi ngã rẽ, đưa tàu về đúng ga cùng màu, cùng hình');
  const cells = await page.evaluate(() => ['rCorrect', 'rStreak', 'kdAcc', 'kdLevel']
    .map(id => document.getElementById(id).parentElement.textContent));
  expect(cells).toEqual(['0/0 tàu về đúng ga', '0 chuỗi đúng dài nhất', '0 level đủ 3 sao', '0 level đã qua']);
  const html = await (await page.request.get('/')).text();
  expect(html).not.toContain('orchestrator');
});

test('new visitor hides zero stats and sees intro; returning player sees stats strip', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#hubIntro')).toBeVisible();
  await expect(page.locator('#hubStrip')).toBeHidden();

  await page.evaluate(() => {
    localStorage.setItem('bb_stats', JSON.stringify({ train: { best: 1, stars: { 1: 2 } } }));
    localStorage.setItem('bb_seeded_v2', '1');
  });
  await page.reload();
  await expect(page.locator('#hubStrip')).toBeVisible();
  await expect(page.locator('#hubIntro')).toBeHidden();
});

test('offline QR modal renders SVG targets, works offline, and restores focus on Escape', async ({ page, context }) => {
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();

  await context.setOffline(true);
  await page.click('#hubQrBtn');
  const dlg = page.locator('#qrDialog');
  await expect(dlg).toBeVisible();
  await expect(dlg).toHaveAttribute('open', '');
  await expect(page.locator('#qrMount svg')).toHaveCount(1);
  await expect(page.locator('#qrUrlText')).toHaveText('https://brainybits.thucanhtrantonnu.com/');

  await page.click('#qrTargets button[data-hash="#tau"]');
  await expect(page.locator('#qrTargetName')).toHaveText('Đường Ray Tư Duy');
  await expect(page.locator('#qrUrlText')).toHaveText('https://brainybits.thucanhtrantonnu.com/#tau');
  await expect(page.locator('#qrTargets button[data-hash="#tau"]')).toHaveAttribute('aria-pressed', 'true');

  await page.click('#qrTargets button[data-hash="#chu"]');
  await expect(page.locator('#qrUrlText')).toHaveText('https://brainybits.thucanhtrantonnu.com/#chu');

  await page.keyboard.press('Escape');
  await expect(dlg).toBeHidden();
  expect(await page.evaluate(() => document.activeElement && document.activeElement.id)).toBe('hubQrBtn');
  await context.setOffline(false);
});

test('3-state theme selector persists across reset and syncs color-scheme + theme-color', async ({ page }) => {
  await page.goto('/');
  await page.click('#hubSettings');
  await page.click('#themeDarkBtn');
  expect(await page.evaluate(() => [
    localStorage.getItem('bb_theme'),
    document.querySelector('meta[name="color-scheme"]').content,
    document.querySelector('meta[name="theme-color"]').content,
  ])).toEqual(['dark', 'dark', '#0e1712']);

  await page.click('#themeLightBtn');
  expect(await page.evaluate(() => [
    localStorage.getItem('bb_theme'),
    document.querySelector('meta[name="color-scheme"]').content,
    document.querySelector('meta[name="theme-color"]').content,
  ])).toEqual(['light', 'light', '#f6f0e4']);

  await page.click('#setReset');
  await Promise.all([page.waitForEvent('load'), page.click('#setResetYes')]);
  expect(await page.evaluate(() => localStorage.getItem('bb_theme'))).toBe('light');

  await page.click('#hubSettings');
  await page.click('#themeAutoBtn');
  expect(await page.evaluate(() => [
    localStorage.getItem('bb_theme'),
    document.querySelector('meta[name="color-scheme"]').content,
  ])).toEqual([null, 'light dark']);
});
