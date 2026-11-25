// High-level sizing & crowding stress gate (S-CROWD): tests dense late levels (L15 & maxLevel,
// plus word's 11-letter "truyền thống") on narrow portrait (320x568) and short landscape (667x375)
// touch viewports using deterministic seeded PRNG and read-only game debug hooks.
import { test, expect, pickLevel } from './fixtures.js';

const VIEWPORTS = [
  { name: 'phone-320', width: 320, height: 568 },
  { name: 'phone-land-667', width: 667, height: 375 },
];

const SEED_INIT = () => {
  window.__BB_TEST__ = true;
  let a = 0x517cc1b7 | 0;
  Math.random = () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
};

async function checkCanvasAndViewport(page, cvId, hudSel) {
  return page.evaluate(([cvId, hudSel]) => {
    const out = [], vw = innerWidth, vh = innerHeight;
    if (document.documentElement.scrollWidth > vw + 1) out.push(`overflow ${document.documentElement.scrollWidth} > ${vw}`);
    if (cvId) {
      const cv = document.getElementById(cvId), r = cv.getBoundingClientRect();
      if (r.height < 120) out.push(`canvas #${cvId} short: ${Math.round(r.height)}px`);
      if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < -1) out.push(`canvas #${cvId} out of bounds`);
      if (cv.width > 0 && cv.height > 0 && r.width > 0 && r.height > 0) {
        const diff = Math.abs((cv.width / cv.height) - (r.width / r.height));
        if (diff > 0.03) out.push(`canvas #${cvId} aspect diff ${diff.toFixed(3)}`);
      }
      if (hudSel) {
        const hud = document.querySelector(hudSel);
        if (hud) {
          const hr = hud.getBoundingClientRect();
          if (hr.bottom > r.top + 1 && hr.right > r.left + 1 && hr.left < r.right - 1) out.push(`HUD ${hudSel} overlaps canvas #${cvId}`);
        }
      }
    }
    return out;
  }, [cvId, hudSel]);
}

for (const vp of VIEWPORTS) {
  test.describe(`sizing stress @ ${vp.name} (${vp.width}x${vp.height})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });

    test('train L15 & L34 (15 stations): switch discs inside canvas, ≥44px apart, no HUD overlap', async ({ page }) => {
      await page.addInitScript(SEED_INIT);
      await page.goto('/#tau');
      await expect(page.locator('#menu')).toBeVisible();
      for (const L of [15, 34]) {
        await pickLevel(page, '#lvgrid', L);
        await page.click('#startBtn');
        await page.waitForFunction(() => window.__rtd && window.__rtd.map && window.__rtd.map.switches.length >= 2);
        expect(await checkCanvasAndViewport(page, 'cv', '#hud')).toEqual([]);
        const r = await page.evaluate(() => {
          const R = window.__rtd, dR = R.discR(), sws = R.map.switches;
          const issues = [];
          if (2 * dR < 44) issues.push(`disc dia ${(2 * dR).toFixed(1)} < 44`);
          for (let i = 0; i < sws.length; i++) {
            const p = sws[i].px;
            if (p.x < dR - 1 || p.x > R.W - dR + 1 || p.y < dR - 1 || p.y > R.H - dR + 1) issues.push(`sw${i} clipped (${Math.round(p.x)},${Math.round(p.y)})`);
            for (let j = i + 1; j < sws.length; j++) {
              const d = Math.hypot(p.x - sws[j].px.x, p.y - sws[j].px.y);
              if (d < 44) issues.push(`sw${i}-sw${j} dist ${d.toFixed(1)} < 44`);
            }
          }
          return issues;
        });
        expect(r, `train L${L}`).toEqual([]);
        await page.click('#pauseBtn'); await page.click('#quitBtn');
      }
    });

    test('koi L15 & L34: fish inside pond, ≥48x44 hit ellipse, bounded average crowding', async ({ page }) => {
      await page.addInitScript(SEED_INIT);
      await page.goto('/#koi');
      await expect(page.locator('#kmenu')).toBeVisible();
      for (const L of [15, 34]) {
        await pickLevel(page, '#klvgrid', L);
        await page.click('#kStartBtn');
        expect(await checkCanvasAndViewport(page, 'kcv', '#khud')).toEqual([]);
        let ovSum = 0;
        for (let f = 0; f < 6; f++) {
          const r = await page.evaluate(() => {
            const K = window.__koi, A = K.area(), fs = K.fish, bad = [];
            let ov = 0;
            const axes = g => ({ a: Math.max(g.L * 0.52, 24), b: Math.max(g.L * 0.32, 22) });
            for (let i = 0; i < fs.length; i++) {
              const g = fs[i], ax = axes(g);
              if (2 * Math.min(ax.a, ax.b) < 44) bad.push(`small hit ${2 * Math.min(ax.a, ax.b)}`);
              if (g.x < A.x0 - 1 || g.x > A.x1 + 1 || g.y < A.y0 - 1 || g.y > A.y1 + 1) bad.push(`out of area (${Math.round(g.x)},${Math.round(g.y)})`);
              let hitOv = false;
              for (let j = 0; j < fs.length; j++) {
                if (i === j) continue;
                const ax2 = axes(fs[j]);
                if (Math.hypot(g.x - fs[j].x, g.y - fs[j].y) < Math.min(ax.a, ax.b) + Math.min(ax2.a, ax2.b)) { hitOv = true; break; }
              }
              if (hitOv) ov++;
            }
            return { bad, frac: fs.length ? ov / fs.length : 0 };
          });
          expect(r.bad, `koi L${L} frame ${f}`).toEqual([]);
          ovSum += r.frac;
          await page.waitForTimeout(150);
        }
        expect(ovSum / 6, `koi L${L} avg hit overlap`).toBeLessThanOrEqual(0.80);
        await page.click('#kPauseBtn'); await page.click('#kQuitBtn');
      }
    });

    test('mem L15 & L33 (6x6): 36 tiles ≥44px, zero pairwise AABB overlap, no HUD occlusion', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.addInitScript(SEED_INIT);
      await page.goto('/#nho');
      await expect(page.locator('#mmenu')).toBeVisible();
      for (const L of [15, 33]) {
        await pickLevel(page, '#mlvgrid', L);
        await page.click('#mStart');
        await expect(page.locator('#mGrid .mtile')).toHaveCount(36);
        await page.waitForTimeout(100);
        const bad = await page.evaluate(() => {
          const out = [], vw = innerWidth, vh = innerHeight;
          const hud = document.querySelector('#memApp .ghud').getBoundingClientRect();
          const rects = [...document.querySelectorAll('#mGrid .mtile')].map(el => el.getBoundingClientRect());
          if (rects.length !== 36) out.push(`tile count ${rects.length}`);
          for (let i = 0; i < rects.length; i++) {
            const r = rects[i];
            if (Math.min(r.width, r.height) < 43.5) out.push(`tile${i} small ${Math.round(r.width)}x${Math.round(r.height)}`);
            if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1 || r.top < hud.bottom - 1) out.push(`tile${i} bounds/hud`);
            for (let j = i + 1; j < rects.length; j++) {
              const b = rects[j];
              const ox = Math.min(r.right, b.right) - Math.max(r.left, b.left);
              const oy = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
              if (ox > 0.5 && oy > 0.5) out.push(`tile${i}-${j} overlap ${ox.toFixed(1)}x${oy.toFixed(1)}`);
            }
          }
          return out;
        });
        expect(bad, `mem L${L}`).toEqual([]);
        await page.click('#mPause'); await page.click('#mQuit');
      }
    });

    test('rain L15 & L33: natural spawns stay inside canvas, pad keys ≥28x44 with zero overlap', async ({ page }) => {
      await page.clock.install();
      await page.addInitScript(SEED_INIT);
      await page.goto('/#mua');
      await expect(page.locator('#rmenu')).toBeVisible();
      for (const L of [15, 33]) {
        await pickLevel(page, '#rlvgrid', L);
        await page.click('#rStart');
        await page.clock.runFor(6500);
        expect(await checkCanvasAndViewport(page, 'rcv', '#rainApp .ghud')).toEqual([]);
        const r = await page.evaluate(() => {
          const out = [], dbg = window.__rainDebug(), vw = innerWidth, vh = innerHeight;
          if (!dbg.drops.length) out.push('no drops spawned');
          for (const d of dbg.drops) {
            if (d.x - d.w / 2 < -1 || d.x + d.w / 2 > dbg.W + 1) out.push(`drop "${d.eq}" clipped x=${d.x} w=${d.w} W=${dbg.W}`);
          }
          const keys = [...document.querySelectorAll('#rainApp .rpad button')].map(el => el.getBoundingClientRect());
          for (let i = 0; i < keys.length; i++) {
            const k = keys[i];
            if (k.width < 27.5 || k.height < 43.5) out.push(`pad key${i} small ${Math.round(k.width)}x${Math.round(k.height)}`);
            if (k.right > vw + 1 || k.bottom > vh + 1 || k.left < -1) out.push(`pad key${i} offscreen`);
            for (let j = i + 1; j < keys.length; j++) {
              const b = keys[j];
              if (Math.min(k.right, b.right) - Math.max(k.left, b.left) > 0.5 && Math.min(k.bottom, b.bottom) - Math.max(k.top, b.top) > 0.5) out.push(`pad ${i}-${j} overlap`);
            }
          }
          return out;
        });
        expect(r, `rain L${L}`).toEqual([]);
        await page.click('#rPause'); await page.click('#rQuit');
      }
    });

    test('word L15, L50 & longest 11-letter phrase: tiles ≥20px, zero board/keyboard occlusion, keys ≥28x44', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/#chu');
      await expect(page.locator('#wmenu')).toBeVisible();
      const longLv = await page.evaluate(() => window.__word.LEVELS.findIndex(p => p.words.map(w => w.join('')).join(' ') === 'truyền thống') + 1);
      expect(longLv).toBeGreaterThan(0);

      for (const L of [15, 50, longLv]) {
        await pickLevel(page, '#wlvgrid', L);
        await page.click('#wStart');
        await page.waitForTimeout(120);
        const bad = await page.evaluate(() => {
          const out = [], vw = innerWidth, vh = innerHeight;
          const b = document.getElementById('wBoard').getBoundingClientRect();
          const k = document.getElementById('wKeys').getBoundingClientRect();
          const lg = document.querySelector('#wordApp .wlegend').getBoundingClientRect();
          const hud = document.querySelector('#wordApp .ghud').getBoundingClientRect();
          if (b.bottom > k.top + 1) out.push(`board overlaps keys by ${Math.round(b.bottom - k.top)}`);
          if (b.top < 0 || b.right > vw + 1 || b.left < -1) out.push(`board bounds`);
          if (lg.bottom > k.top + 1) out.push('legend overlaps keys');
          if (hud.right > vw + 1 || hud.bottom > k.top + 1) out.push('hud out of bounds');
          const cells = [...document.querySelectorAll('#wBoard .wcell')];
          if (!cells.length) out.push('no wcells');
          for (const c of cells.slice(0, 12)) {
            const cr = c.getBoundingClientRect();
            if (cr.width < 19.5 || cr.height < 19.5) { out.push(`wcell too small ${cr.width.toFixed(1)}x${cr.height.toFixed(1)}`); break; }
          }
          const keys = [...document.querySelectorAll('#wKeys button')].filter(el => el.offsetParent !== null).map(el => el.getBoundingClientRect());
          for (let i = 0; i < keys.length; i++) {
            const r = keys[i];
            if (r.width < 27.5 || r.height < 43.5) { out.push(`wkey small ${Math.round(r.width)}x${Math.round(r.height)}`); break; }
            if (r.right > vw + 1 || r.bottom > vh + 1 || r.left < -1) { out.push(`wkey offscreen`); break; }
          }
          return out;
        });
        expect(bad, `word L${L}`).toEqual([]);
        await page.click('#wMenuBtn');
      }
    });
  });
}
