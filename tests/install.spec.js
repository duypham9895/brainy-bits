// "Add to Home Screen" guide: banner rule, settings row, guide dialog, Android install prompt,
// in-app browsers, keyboard, theme contrast, layout. INSTALL_SHOTS=1 also saves review screenshots,
// into INSTALL_SHOTS_DIR when it is set, else into each test's output folder.
import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const UA = {
  iosSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1',
  zalo: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/25.07.01',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
};
const SHOTS = process.env.INSTALL_SHOTS === '1';
const SHOTS_DIR = process.env.INSTALL_SHOTS_DIR || null;
if (SHOTS && SHOTS_DIR) mkdirSync(SHOTS_DIR, { recursive: true });

// The head gate counts one visit per tab session. Seeding visits=1 makes this load visit #2.
async function seed(page, { visits = 1, theme = null, standalone = false } = {}) {
  await page.addInitScript(([v, th, sa]) => {
    try {
      if (v && !localStorage.getItem('bb_install')) localStorage.setItem('bb_install', JSON.stringify({ visits: v }));
      if (th) localStorage.setItem('bb_theme', th);
    } catch (e) {}
    if (sa) {
      const orig = window.matchMedia.bind(window);
      window.matchMedia = q => /display-mode:\s*standalone/.test(q)
        ? { matches: true, media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return false; } }
        : orig(q);
    }
  }, [visits, theme, standalone]);
}
const banner = page => page.locator('#installBanner');
// What a sighted reader sees: the text without the screen-reader-only spans.
const seen = loc => loc.evaluate(el => { const c = el.cloneNode(true); c.querySelectorAll('.bbi-sr').forEach(n => n.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); });
const dialog = page => page.locator('#installDialog');
async function openSettings(page) {
  await page.locator('#hubSettings').click();
  await expect(page.locator('#settings')).toBeVisible();
}
async function shot(page, name) {
  if (!SHOTS) return;
  await page.waitForTimeout(400);                     // let the sheet finish sliding in
  const file = `${name}.png`;
  await page.screenshot({ path: SHOTS_DIR ? join(SHOTS_DIR, file) : test.info().outputPath(file) });
}
const fireInstallPrompt = page => page.evaluate(() => {
  const e = new Event('beforeinstallprompt', { cancelable: true });
  e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; return Promise.resolve(); };
  e.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
  window.dispatchEvent(e);
  return e.defaultPrevented;
});
// Wait for finite transitions (tab fills, sheets) so colours are read at rest, not mid-fade.
const settle = page => page.evaluate(() => Promise.all(document.getAnimations()
  .filter(a => a.effect && a.effect.getComputedTiming().endTime !== Infinity).map(a => a.finished.catch(() => {}))));
// WCAG AA text contrast for everything visible under `sel`, from computed styles.
const contrastProblems = async (page, sel) => { await settle(page); return page.evaluate(sel => {
  const rgb = s => s.match(/[\d.]+/g).slice(0, 3).map(Number);
  const lum = c => { const [r, g, b] = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const bgOf = el => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return rgb(c); } return [255, 255, 255]; };
  const out = [];
  document.querySelectorAll(`${sel} :is(.bbi-hl, .bbi-vi, .bbi-en, .bbi-num, .bbi-tab, h2, h3, p, small, button, .bbi-status span, #setInstallTitle)`).forEach(el => {
    if (!el.getClientRects().length || !el.textContent.trim()) return;
    const r = ratio(rgb(getComputedStyle(el).color), bgOf(el));
    if (r < 4.5) out.push(`${sel} ${el.className || el.tagName} "${el.textContent.trim().slice(0, 20)}" ${r.toFixed(2)}`);
  });
  return out;
}, sel); };

test.describe('iPhone Safari', () => {
  test.use({ userAgent: UA.iosSafari });

  test('first visit: no banner', async ({ page }) => {
    await seed(page, { visits: 0 });
    await page.goto('/');
    await expect(page.locator('#hubShelf')).toBeVisible();
    await expect(banner(page)).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bb_install')).visits)).toBe(1);
  });

  test('first visit after a finished game: banner shows', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('bb_log', JSON.stringify([{ g: 'mem', lv: 1, won: true, d: '2026-11-21' }])));
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
  });

  test('visit #2: banner opens the guide on the iPhone tab with 3 steps in VI and EN', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    await expect(banner(page)).toContainText('Cài Brainy Bits ra màn hình chính để mở nhanh như app');
    const cta = page.locator('#installBannerCta');
    await cta.click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    expect(await d.evaluate(el => el.open && el.matches(':modal'))).toBe(true);
    await expect(d).toHaveAttribute('aria-labelledby', 'installTitle');
    await expect(page.locator('#installTitle')).toHaveText('Thêm Brainy Bits ra màn hình chính');
    await expect(d.getByRole('tab', { name: 'iPhone' })).toHaveAttribute('aria-selected', 'true');
    const panel = page.locator('#installPanel-ios');
    await expect(panel).toBeVisible();
    await expect(page.locator('#installPanel-android')).toBeHidden();
    await expect(panel.locator('.bbi-step')).toHaveCount(3);
    expect(await seen(panel.locator('.bbi-step').nth(0))).toContain('Bấm nút ••• ở góc dưới bên phải');
    expect(await seen(panel.locator('.bbi-step').nth(0))).toContain('Tap the ••• button at the bottom right');
    // Screen readers hear words, not the glyphs
    const glyph = panel.locator('.bbi-step').nth(0).locator('.bbi-vi .bbi-hl');
    await expect(glyph.locator('[aria-hidden="true"]')).toHaveText('•••');
    await expect(glyph.locator('.bbi-sr')).toHaveText('ba chấm');
    await expect(panel.locator('.bbi-step').nth(0).locator('.bbi-en .bbi-hl .bbi-sr')).toHaveText('three dots');
    await expect(panel.locator('.bbi-step').nth(1)).toContainText('Chọn Chia sẻ (Share)');
    await expect(panel.locator('.bbi-step').nth(2)).toContainText('Kéo xuống, chọn Thêm vào MH chính (Add to Home Screen), rồi bấm Thêm');
    await expect(panel).toContainText('Trên iPhone đời cũ');
    await expect(panel).not.toContainText('Nếu không thấy, hãy mở link này bằng Safari');
    await expect(page.locator('#installInApp')).toBeHidden();
    // Big, readable instruction text
    const fs = await panel.locator('.bbi-vi').first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(fs).toBeGreaterThanOrEqual(17);
    // Esc closes and focus returns to the trigger
    await page.keyboard.press('Escape');
    await expect(d).toBeHidden();
    await expect(cta).toBeFocused();
  });

  test('backdrop click and the Got it button close; focus returns', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    const cta = page.locator('#installBannerCta');
    await cta.click();
    await expect(dialog(page)).toBeVisible();
    await page.mouse.click(195, 20);                  // above the bottom sheet = backdrop
    await expect(dialog(page)).toBeHidden();
    await expect(cta).toBeFocused();
    await cta.click();
    await page.locator('#installDoneBtn').click();
    await expect(dialog(page)).toBeHidden();
    await expect(cta).toBeFocused();
  });

  test('tabs switch with arrow keys, Home and End', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await page.locator('#installBannerCta').click();
    const ios = page.locator('#installTab-ios'), and = page.locator('#installTab-android');
    await expect(page.getByRole('tablist')).toHaveAttribute('aria-label', 'Chọn loại điện thoại');
    await ios.focus();
    await page.keyboard.press('ArrowRight');
    await expect(and).toBeFocused();
    await expect(and).toHaveAttribute('aria-selected', 'true');
    await expect(ios).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('#installPanel-android')).toBeVisible();
    await expect(page.locator('#installPanel-ios')).toBeHidden();
    await page.keyboard.press('ArrowRight');           // wraps
    await expect(ios).toBeFocused();
    await page.keyboard.press('End');
    await expect(and).toBeFocused();
    await page.keyboard.press('Home');
    await expect(ios).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Alt+ArrowRight');       // a browser shortcut, not a tab switch
    await expect(ios).toHaveAttribute('aria-selected', 'true');
    await and.click();
    await expect(page.locator('#installPanel-android .bbi-step')).toHaveCount(3);
    await expect(page.locator('#installPanel-android')).toContainText('Hình minh hoạ giao diện Chrome');
  });

  test('dismiss hides the banner for good; settings row still opens the guide', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    await page.locator('#installBannerClose').click();
    await expect(banner(page)).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bb_install')).dismissed)).toBe(true);
    await page.evaluate(() => sessionStorage.clear());  // next visit
    await page.reload();
    await expect(page.locator('#hubShelf')).toBeVisible();
    await expect(banner(page)).toBeHidden();
    await openSettings(page);
    const row = page.locator('#setInstallBtn');
    await expect(page.locator('#setInstallTitle')).toHaveText('Cài ra màn hình chính');
    await row.click();
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator('#settings')).toBeVisible();   // Esc closed the guide only
    await expect(row).toBeFocused();
  });

});

test.describe('iPhone Safari, first paint', () => {
  test.use({ userAgent: UA.iosSafari });
  test('banner is in before install.js runs; no layout shift (360 and 430 wide)', async ({ page }) => {
    await page.addInitScript(() => {
      try { sessionStorage.clear(); localStorage.setItem('bb_install', JSON.stringify({ visits: 1 })); } catch (e) {}   // every load = visit #2
      window.__cls = 0;
      try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; })
        .observe({ type: 'layout-shift', buffered: true }); } catch (e) {}
      document.addEventListener('DOMContentLoaded', () => {
        window.__shelfTop = document.getElementById('hubShelf').getBoundingClientRect().top;
      });
      // install-art.js runs right before install.js. Read the banner at that moment: only the
      // <head> gate can have shown it.
      let art;
      Object.defineProperty(window, 'BB_INSTALL_ART', { configurable: true, get: () => art, set: v => {
        art = v; window.__bannerBeforeJs = getComputedStyle(document.getElementById('installBanner')).display;
      } });
    });
    for (const width of [360, 430]) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/');                              // the new width can land after the first layout of this load
      await page.reload();                               // so measure the next one
      await expect(banner(page)).toBeVisible();
      await page.waitForTimeout(1200);
      const r = await page.evaluate(() => ({ dcl: window.__shelfTop, now: document.getElementById('hubShelf').getBoundingClientRect().top,
        cls: window.__cls, before: window.__bannerBeforeJs, sw: document.documentElement.scrollWidth, vw: innerWidth }));
      expect(r.before).toBe('grid');
      expect(Math.abs(r.now - r.dcl), JSON.stringify({ width, ...r })).toBeLessThan(0.5);
      expect(r.cls).toBeLessThan(0.001);
      expect(r.sw).toBeLessThanOrEqual(r.vw);
    }
  });

});

test.describe('iPhone Safari, more', () => {
  // Mouse, not touch emulation: the drag test needs a real press-move-release.
  test.use({ userAgent: UA.iosSafari, isMobile: false, hasTouch: false, viewport: { width: 390, height: 844 } });
  test('no closedby support: a backdrop click closes, a drag that starts inside the sheet does not', async ({ page }) => {
    await page.addInitScript(() => { delete HTMLDialogElement.prototype.closedBy; });
    await seed(page);
    await page.goto('/');
    // Chromium still honours the attribute natively; drop it so only the script fallback acts.
    await page.evaluate(() => document.getElementById('installDialog').removeAttribute('closedby'));
    await page.locator('#installBannerCta').click();
    const d = dialog(page);
    await expect(d).toBeVisible();
    const t = await page.locator('#installTitle').boundingBox();
    await page.mouse.move(t.x + 8, t.y + 8);
    await page.mouse.down();
    await page.mouse.move(195, 20, { steps: 6 });
    await page.mouse.up();
    await page.waitForTimeout(100);
    expect(await d.evaluate(el => el.open)).toBe(true);   // not toBeVisible: a closing sheet is still visible while it fades
    await page.mouse.click(195, 20);
    await expect(d).toBeHidden();
  });

  test('reopening on a short landscape screen starts at the top again', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await seed(page);
    await page.goto('/');
    await page.evaluate(() => window.BBInstall.open());
    const sheet = page.locator('#installDialog .bbi-sheet');
    await expect(dialog(page)).toBeVisible();
    const scrolled = await sheet.evaluate(el => { el.scrollTop = el.scrollHeight; return el.scrollTop; });
    expect(scrolled).toBeGreaterThan(0);                // the sheet is the scroller below 420 px tall
    await page.keyboard.press('Escape');
    await expect(dialog(page)).toBeHidden();
    await page.evaluate(() => window.BBInstall.open());
    await expect(dialog(page)).toBeVisible();
    expect(await sheet.evaluate(el => el.scrollTop)).toBe(0);
  });

  test('corrupt bb_log does not hide a best score in bb_stats: first-visit banner still shows', async ({ page }) => {
    await page.addInitScript(() => { localStorage.setItem('bb_log', '{not json'); localStorage.setItem('bb_stats', JSON.stringify({ mem: { best: 3 } })); });
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
  });
});

test.describe('iPhone Chrome', () => {
  test.use({ userAgent: UA.iosChrome });
  test('guide shows the "open in Safari" note on the iPhone tab', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await page.locator('#installBannerCta').click();
    const panel = page.locator('#installPanel-ios');
    await expect(panel.locator('.bbi-note.is-warn')).toContainText('Nếu không thấy, hãy mở link này bằng Safari');
    await expect(panel.locator('.bbi-note.is-warn')).toContainText("If you can't find it, open this link in Safari");
  });
});

test.describe('in-app browser (Zalo)', () => {
  test.use({ userAgent: UA.zalo, permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  test('open-in-browser panel and Copy link', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    await page.locator('#installBannerCta').click();
    const box = page.locator('#installInApp');
    await expect(box).toBeVisible();
    await expect(box).toContainText('Mở bằng trình duyệt trước');
    await expect(box).toContainText('Mở bằng Safari/Chrome');
    await expect(box.locator('.bbi-hl')).not.toContainText(["'"]);
    await expect(page.locator('#installTab-ios')).toHaveAttribute('aria-selected', 'true');
    await page.locator('#installCopyBtn').click();
    const status = page.locator('#installCopyStatus');
    await expect(status).toHaveAttribute('aria-live', 'polite');
    await expect(status).toContainText('Đã sao chép');     // clipboard is granted; the blocked case has its own test
    const expected = await page.evaluate(() => location.origin + location.pathname);
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected);
    await expect(page.locator('#installLinkField')).toBeHidden();
    await expect(page.locator('#installDoneBtn')).toHaveClass(/is-tonal/);   // one primary action in this panel
    await shot(page, 'in-app-panel');
  });

  test('clipboard blocked: readonly link field is selected', async ({ page }) => {
    await seed(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) } });
    });
    await page.goto('/');
    await page.locator('#installBannerCta').click();
    await page.locator('#installCopyBtn').click();
    const field = page.locator('#installLinkField');
    await expect(field).toBeVisible();
    await expect(field).toBeFocused();
    expect(await field.evaluate(el => el.selectionEnd - el.selectionStart)).toBe(await field.evaluate(el => el.value.length));
    // app.css turns selection off on html,body; a long press on the field must still select the link
    expect(await field.evaluate(el => getComputedStyle(el).userSelect)).toBe('text');
    await expect(page.locator('#installCopyStatus')).toContainText('Đã chọn sẵn link');
    await page.locator('#installCopyBtn').click();      // a repeat click fills the status again
    await expect(page.locator('#installCopyStatus')).toContainText('Đã chọn sẵn link');
  });

  test('the art keeps padding around "Open in Safari/Chrome" inside its highlight box', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await page.locator('#installBannerCta').click();
    const gap = await page.locator('#installInApp .bbi-art').evaluate(svg => {
      const t = [...svg.querySelectorAll('text')].find(n => n.textContent === 'Open in Safari/Chrome');
      const box = [...svg.querySelectorAll('rect.a-hl')].find(r => { const b = r.getBBox(), tb = t.getBBox(); return b.y <= tb.y && b.y + b.height >= tb.y + tb.height; });
      const b = box.getBBox(), tb = t.getBBox();
      return { left: tb.x - b.x, right: b.x + b.width - (tb.x + tb.width) };
    });
    expect(gap.right).toBeGreaterThanOrEqual(10);
    expect(gap.left).toBeGreaterThanOrEqual(10);
  });
});

test.describe('Android Chrome', () => {
  test.use({ userAgent: UA.android });

  test('beforeinstallprompt: Install now calls prompt(); accepted hides the banner', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true });
      e.prompt = () => { window.__prompted = (window.__prompted || 0) + 1; return Promise.resolve(); };
      e.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' });
      window.dispatchEvent(e);
    });
    await expect(banner(page)).toBeVisible();          // the event never moves the banner
    await page.locator('#installBannerCta').click();
    await expect(page.locator('#installTab-android')).toHaveAttribute('aria-selected', 'true');
    const btn = page.locator('#installNowBtn');
    await expect(btn).toBeVisible();
    await expect(btn).toContainText('Cài đặt ngay');
    await expect(page.locator('#installPanel-android .bbi-step')).toHaveCount(3);   // manual steps still there
    await btn.click();
    await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(1);
    await expect(dialog(page)).toBeHidden();
    await expect(banner(page)).toBeHidden();
    await expect(page.locator('#openTrain')).toBeFocused();   // the banner CTA is gone, focus lands on the first game
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bb_install')).installed)).toBe(true);
    await openSettings(page);
    await expect(page.locator('#setInstallTitle')).toHaveText('Đã cài ra màn hình chính');
    // Still in the browser tab: the sub line must not claim it was opened from the icon
    await expect(page.locator('#setInstallSub')).toHaveText('Bấm biểu tượng trên màn hình chính để mở');
    await expect(page.locator('#setInstallCheck')).toBeVisible();
  });

  test('beforeinstallprompt caught in <head> before install.js loads; it clears a stale installed flag', async ({ page }) => {
    await page.addInitScript(() => { try { if (!localStorage.getItem('bb_install')) localStorage.setItem('bb_install', JSON.stringify({ visits: 1, installed: true })); } catch (e) {} });
    // Fire the event from the top of install.js, before its own listener exists: only the head gate can catch it.
    await page.route('**/js/install.js', async route => {
      const res = await route.fetch();
      const pre = "(()=>{const e=new Event('beforeinstallprompt',{cancelable:true});e.prompt=()=>{window.__prompted=(window.__prompted||0)+1;return Promise.resolve()};" +
        "e.userChoice=Promise.resolve({outcome:'dismissed',platform:'web'});window.dispatchEvent(e);window.__bipPrevented=e.defaultPrevented})();\n";
      await route.fulfill({ response: res, body: pre + await res.text() });
    });
    await page.goto('/');
    await expect(page.locator('#hubShelf')).toBeVisible();
    expect(await page.evaluate(() => window.__bipPrevented)).toBe(true);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bb_install')).installed)).toBe(false);
    await openSettings(page);
    await expect(page.locator('#setInstallTitle')).toHaveText('Cài ra màn hình chính');
    await page.locator('#setInstallBtn').click();
    const btn = page.locator('#installNowBtn');
    await expect(btn).toBeVisible();
    await btn.click();
    await expect.poll(() => page.evaluate(() => window.__prompted)).toBe(1);
    await expect(btn).toBeHidden();                       // prompt() works once per event
    await expect(dialog(page)).toBeVisible();             // dismissed: the manual steps stay
    await expect(page.locator('#installTab-android')).toBeFocused();   // focus stays in the dialog
  });

  test('no install event: manual steps only, no install button', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await page.locator('#installBannerCta').click();
    await expect(page.locator('#installPanel-android')).toBeVisible();
    await expect(page.locator('#installNowBtn')).toBeHidden();
    const steps = page.locator('#installPanel-android .bbi-step');
    await expect(steps).toHaveCount(3);
    expect(await seen(steps.nth(0))).toContain('Bấm nút ⋮ ở góc trên bên phải');
    await expect(steps.nth(0).locator('.bbi-vi .bbi-hl .bbi-sr')).toHaveText('ba chấm dọc');
    await expect(steps.nth(1)).toContainText('Chọn Thêm vào màn hình chính (Add to Home screen)');
    await expect(steps.nth(2)).toContainText('Bấm Thêm (Add) để xác nhận');
    await expect(page.locator('#installPanel-android')).toContainText('Nếu không thấy mục này, tìm Cài đặt ứng dụng (Install app)');
  });

  test('appinstalled: banner gone, flag stored, settings row flips, Install now disappears', async ({ page }) => {
    await seed(page);
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    expect(await fireInstallPrompt(page)).toBe(true);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect(banner(page)).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bb_install')).installed)).toBe(true);
    expect(await page.evaluate(() => window.BB_INSTALL_PROMPT)).toBeNull();
    await openSettings(page);
    await expect(page.locator('#setInstallTitle')).toHaveText('Đã cài ra màn hình chính');
    await expect(page.locator('#setInstallCheck')).toBeVisible();
    await page.locator('#setInstallBtn').click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('#installNowBtn')).toBeHidden();
  });

  test('localStorage.setItem throws (quota): appinstalled still flips the row and hides Install now', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await seed(page);
    await page.goto('/');
    await page.evaluate(() => { Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); }; });
    await fireInstallPrompt(page);
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await openSettings(page);
    await expect(page.locator('#setInstallTitle')).toHaveText('Đã cài ra màn hình chính');
    await page.locator('#setInstallBtn').click();
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator('#installNowBtn')).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test.describe('failure paths', () => {
  test.use({ userAgent: UA.iosSafari });

  test('install.js blocked: no banner and no settings row, games still open', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await seed(page);
    await page.route('**/js/install.js', route => route.abort());
    await page.goto('/');
    await page.waitForLoadState('load');
    await expect(banner(page)).toBeHidden();
    await openSettings(page);
    await expect(page.locator('#setInstallRow')).toBeHidden();
    await page.keyboard.press('Escape');
    await page.locator('#openTrain').click();
    await expect(page).toHaveURL(/#tau/);
    expect(errors).toEqual([]);
  });

  test('install-platform.js and install.js both blocked: no banner, no settings row, no errors', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await seed(page);
    await page.route(/\/js\/install(-platform)?\.js$/, route => route.abort());
    await page.goto('/');
    await page.waitForLoadState('load');
    await expect(banner(page)).toBeHidden();
    await openSettings(page);
    await expect(page.locator('#setInstallRow')).toBeHidden();
    expect(errors).toEqual([]);
  });

  test('install.css blocked: the banner stays out and nothing overflows', async ({ page }) => {
    await seed(page);
    await page.route('**/css/install.css', route => route.abort());
    await page.goto('/');
    await page.waitForLoadState('load');
    await expect(page.locator('#hubShelf')).toBeVisible();
    await expect(banner(page)).toBeHidden();
    const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth,
      ico: document.querySelector('#installBanner svg').getAttribute('width') }));
    expect(r.sw).toBeLessThanOrEqual(r.vw);
    expect(r.ico).toBe('24');
  });

  test('sessionStorage throws, localStorage works: running installed is still saved', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('blocked', 'SecurityError'); }, configurable: true });
    });
    await seed(page, { visits: 3, standalone: true });
    await page.goto('/');
    await expect(page.locator('#hubShelf')).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('bb_install')).installed)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('localStorage and sessionStorage both throw: no banner, no errors, the guide still opens', async ({ page }) => {
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => {
      const boom = () => { throw new DOMException('blocked', 'SecurityError'); };
      Object.defineProperty(window, 'localStorage', { get: boom, configurable: true });
      Object.defineProperty(window, 'sessionStorage', { get: boom, configurable: true });
    });
    await page.goto('/');
    await expect(page.locator('#hubShelf')).toBeVisible();
    await expect(banner(page)).toBeHidden();
    await openSettings(page);
    await page.locator('#setInstallBtn').click();
    await expect(dialog(page)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('installed (standalone)', () => {
  test.use({ userAgent: UA.iosSafari });
  test('no banner; settings shows the installed state with an SVG check', async ({ page }) => {
    await seed(page, { visits: 5, standalone: true });
    await page.goto('/');
    await expect(page.locator('#hubShelf')).toBeVisible();
    await expect(banner(page)).toBeHidden();
    await openSettings(page);
    await expect(page.locator('#setInstallTitle')).toHaveText('Đã cài ra màn hình chính');
    await expect(page.locator('#setInstallCheck')).toBeVisible();
    expect(await page.locator('#setInstallRow').textContent()).not.toMatch(/[\u2713\u2714\u2715\u2716]/);
    await page.locator('#setInstallBtn').click();      // the guide stays available
    await expect(dialog(page)).toBeVisible();
  });
});

test.describe('desktop', () => {
  test.use({ userAgent: UA.desktop, isMobile: false, hasTouch: false, viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  test('no banner; settings row opens the QR dialog', async ({ page }) => {
    await seed(page, { visits: 5 });
    await page.goto('/');
    await expect(page.locator('#hubShelf')).toBeVisible();
    await expect(banner(page)).toBeHidden();
    await openSettings(page);
    await expect(page.locator('#setInstallTitle')).toHaveText('Mở trang này trên điện thoại để cài ra màn hình chính');
    await page.locator('#setInstallBtn').click();
    await expect(page.locator('#qrDialog')).toBeVisible();
    await expect(dialog(page)).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(page.locator('#qrDialog')).toBeHidden();
    await expect(page.locator('#hubSettings')).toBeFocused();
  });

  test('beforeinstallprompt is left to Chrome: no preventDefault, nothing stored', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#hubShelf')).toBeVisible();
    expect(await fireInstallPrompt(page)).toBe(false);
    expect(await page.evaluate(() => window.BB_INSTALL_PROMPT ?? null)).toBeNull();
  });
});

test.describe('forced colors', () => {
  test.use({ userAgent: UA.iosSafari });
  test('close buttons get a border; the selected tab is a fill, not an outline', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await seed(page);
    await page.goto('/');
    await expect(banner(page)).toBeVisible();
    expect(await page.locator('#installBannerClose').evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('solid');
    await page.locator('#installBannerCta').click();
    await expect(dialog(page)).toBeVisible();
    expect(await page.locator('#installDialog .bbi-close').evaluate(el => getComputedStyle(el).borderTopStyle)).toBe('solid');
    const tab = page.locator('#installTab-ios');
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expect(tab).not.toBeFocused();
    expect(await tab.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('none');
  });
});

// Contrast of the coral highlight and the step text, in both themes, measured from computed styles:
// banner, both tabs, the settings row, and the in-app panel.
for (const theme of ['light', 'dark']) {
  test.describe(`theme ${theme}`, () => {
    test.use({ userAgent: UA.iosSafari, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    test(`guide text meets WCAG AA, no overflow (${theme})`, async ({ page }) => {
      await seed(page, { theme });
      await page.goto('/');
      await expect(banner(page)).toBeVisible();
      await shot(page, `banner-${theme}`);
      const bad = await contrastProblems(page, '#installBanner');
      await page.locator('#installBannerCta').click();
      await expect(dialog(page)).toBeVisible();
      await shot(page, `iphone-${theme}`);
      bad.push(...await contrastProblems(page, '#installDialog'));
      bad.push(...await page.evaluate(() => {
        const out = [];
        if (document.documentElement.scrollWidth > innerWidth) out.push('page overflow');
        const d = document.getElementById('installDialog');
        if (d.scrollWidth > d.clientWidth + 1) out.push('dialog overflows horizontally');
        return out;
      }));
      await page.locator('#installTab-android').click();
      await shot(page, `android-${theme}`);
      bad.push(...await contrastProblems(page, '#installDialog'));
      await page.keyboard.press('Escape');
      await expect(dialog(page)).toBeHidden();
      await openSettings(page);
      bad.push(...await contrastProblems(page, '#setInstallRow'));
      expect(bad).toEqual([]);
    });
  });
  test.describe(`in-app theme ${theme}`, () => {
    test.use({ userAgent: UA.zalo, viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    test(`in-app panel meets WCAG AA (${theme})`, async ({ page }) => {
      await seed(page, { theme });
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('blocked')) } });
      });
      await page.goto('/');
      await page.locator('#installBannerCta').click();
      await page.locator('#installCopyBtn').click();      // shows the link field and the status line too
      await expect(page.locator('#installCopyStatus')).toContainText('Đã chọn sẵn link');
      expect(await contrastProblems(page, '#installInApp')).toEqual([]);
      expect(await contrastProblems(page, '#installDialog .bbi-foot')).toEqual([]);
    });
  });
}
