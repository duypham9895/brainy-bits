// Shell and hub: zoom, HUD buttons, router lifecycle, Back navigation, hub progress, daily
// challenge, settings, reduced motion, focus, PWA. Each test stays well under 20 s.
import { test, expect } from '@playwright/test';

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

test('head has description, Open Graph, theme colour, icons and gstatic preconnect (OPS-1/2/12, SHELL-16/18)', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Brainy Bits');
  for (const sel of ['meta[name=description]', 'meta[property="og:title"]', 'meta[property="og:image"]',
    'meta[name=theme-color]', 'link[rel=manifest]', 'link[rel=apple-touch-icon]',
    'link[rel=preconnect][href="https://fonts.gstatic.com"][crossorigin]']) {
    await expect(page.locator(sel)).toHaveCount(1);
  }
  const m = await (await page.request.get('/manifest.webmanifest')).json();
  expect(m.display).toBe('standalone');
  expect(m.icons.some(i => i.purpose === 'maskable')).toBe(true);
  for (const i of m.icons) expect((await page.request.get('/' + i.src)).ok()).toBe(true);
});

for (const w of [320, 362, 390]) {
  test(`round HUD buttons stay 44px and on screen at ${w}px (SHELL-01, SHELL-06)`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 700 });
    await page.goto('/#tau');
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
    localStorage.setItem('koi_lv2', '99');    // corrupt / beyond the cap -> clamped to LV_MAX
    localStorage.setItem('bb_stats', JSON.stringify({ rain: { best: 2, stars: { 1: 3, 2: 2 } } }));
  });
  await page.goto('/');
  await expect(page.locator('#hubTrain')).toHaveText('Đã qua 3/11 level');
  await expect(page.locator('#hubMem')).toHaveText('Đã qua 4/13 level');
  await expect(page.locator('#hubKoi')).toHaveText('Xong cả 10 level');
  await expect(page.locator('#hubRain')).toHaveText('Đã qua 2/10 level · ★ 5/30');
  await expect(page.locator('#hubWord')).toHaveText('12 level, chưa chơi');
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
    localStorage.setItem('bb_seeded_v1', '1');
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
