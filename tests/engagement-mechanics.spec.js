import { test, expect, pickLevel } from './fixtures.js';
import { feedAll, tapFish } from './koi-helpers.js';

function siblingOverlaps(rects) {
  const out = [];
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      const a = rects[i], b = rects[j];
      const ox = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
      const oy = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
      if (ox > 0.5 && oy > 0.5) out.push({ i, j, ox, oy });
    }
  }
  return out;
}

test.describe('Track 2 Core & Meta Engagement Mechanics', () => {
  test('M-OPT-RISK-RAIN-SUN: sunCap bounds, 0-miss evaporate, clears screen with +1 solved, and >=12:1 contrast', async ({ page }) => {
    await page.clock.install();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/#mua');
    await expect(page.locator('#rmenu')).toBeVisible();

    const caps = await page.evaluate(() => ({
      ops3: window.BBRain.sunCap(3, 25),
      ops5: window.BBRain.sunCap(5, 25),
      ops6Low: window.BBRain.sunCap(6, 16),
      ops6High: window.BBRain.sunCap(6, 22),
      ops8High: window.BBRain.sunCap(8, 30),
    }));
    expect(caps).toEqual({ ops3: 0, ops5: 0, ops6Low: 1, ops6High: 2, ops8High: 2 });

    await page.click('#rStart');
    await page.clock.runFor(64);

    // 1. Solve one normal drop -> combo = 1, then let Sun drop cross waterline -> 0 miss & combo intact.
    await page.evaluate(() => window.__rainTest.spawnDrop(991, 0.45, '990 + 1', 84));
    await page.keyboard.type('991');
    await page.clock.runFor(32);
    let st = await page.evaluate(() => window.__rainDebug());
    expect(st.solved).toBe(1);
    expect(st.combo).toBe(1);

    await page.evaluate(() => window.__rainTest.spawnDrop(992, 0.995, '990 + 2', 84, { sun: true }));
    await page.clock.runFor(64);
    st = await page.evaluate(() => window.__rainDebug());
    expect(st.drops.some(d => d.sun)).toBe(false);
    expect(st.misses).toBe(0);
    expect(st.combo).toBe(1);

    // 2. Render Sun drop at center, measure rendered canvas ink-on-gold contrast >= 12:1.
    await page.evaluate(() => {
      window.__rainTest.spawnDrop(993, 0.4, '10 + 4', 96);
      window.__rainTest.spawnDrop(994, 0.52, '20 + 5', 96);
      window.__rainTest.spawnDrop(777, 0.5, '3 + 4', 86, { sun: true });
    });
    await page.clock.runFor(32);

    const contrast = await page.evaluate(() => {
      const cv = document.getElementById('rcv');
      const ctx = cv.getContext('2d');
      const dpr = cv.width / (cv.clientWidth || window.innerWidth);
      const sun = window.__rainDebug().drops.find(d => d.sun);
      const sx = Math.max(0, Math.round((sun.x - sun.w * 0.35) * dpr));
      const sy = Math.max(0, Math.round((sun.y - 12) * dpr));
      const sw = Math.min(cv.width - sx, Math.round(sun.w * 0.7 * dpr));
      const sh = Math.min(cv.height - sy, Math.round(24 * dpr));
      const data = ctx.getImageData(sx, sy, sw, sh).data;
      const lin = c => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      const lum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      let darkL = 1, warmL = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const l = lum(r, g, b);
        if (r < 45 && g < 45 && b < 70 && l < darkL) darkL = l;
        if (r > 235 && g > 195 && b < 200 && l > warmL) warmL = l;
      }
      return { ratio: (warmL + 0.05) / (darkL + 0.05), darkL, warmL };
    });
    expect(contrast.warmL).toBeGreaterThan(0.6);
    expect(contrast.ratio).toBeGreaterThanOrEqual(12);

    // 3. Solving Sun drop clears all drops, gives strictly +1 solved & +1 sun fx.
    await page.keyboard.type('777');
    await page.clock.runFor(32);
    st = await page.evaluate(() => window.__rainDebug());
    expect(st.drops.length).toBe(0);
    expect(st.solved).toBe(2);
    expect(st.combo).toBe(2);
    expect(st.lastFx).toBe('+1 ☀');
  });

  test('M-KISHO-RAIN-MULTICLEAR & M-FORGIVE: twin multi-clear +2 and AUTO_WAIT waterline clutch save', async ({ page }) => {
    await page.clock.install();
    await page.goto('/#mua');
    await page.click('#rStart');
    await page.clock.runFor(64);

    // Twin non-Sun drops sharing answer 995 with distinct equations pop together cleanly.
    await page.evaluate(() => {
      window.__rainTest.spawnDrop(995, 0.35, '990 + 5', 86);
      window.__rainTest.spawnDrop(995, 0.55, '998 - 3', 86);
    });
    await page.keyboard.type('995');
    await page.clock.runFor(32);
    let st = await page.evaluate(() => window.__rainDebug());
    expect(st.drops.filter(d => d.ans === 995).length).toBe(0);
    expect(st.solved).toBe(2);
    expect(st.combo).toBe(2);
    expect(st.lastFx).toContain('+2');

    // AUTO_WAIT waterline save: drop 771 waits for prefix 7712 while crossing waterline -> clutch save, 0 miss.
    await page.evaluate(() => {
      const dbg = window.__rainDebug();
      const wy = dbg.H - 26 - dbg.misses * 8;
      const pWater = (wy - 12 + 30) / (wy + 30);
      window.__rainTest.spawnDrop(7712, 0.12, '7710 + 2', 92);
      window.__rainTest.spawnDrop(771, pWater - 0.025, '770 + 1', 88);
    });
    await page.keyboard.type('771');
    await page.clock.runFor(16);
    st = await page.evaluate(() => window.__rainDebug());
    expect(st.input).toBe('771');
    expect(st.pendT).toBeGreaterThan(0.2);

    for (let i = 0; i < 20; i++) {
      await page.clock.runFor(25);
      st = await page.evaluate(() => window.__rainDebug());
      if (st.clutchCount > 0) break;
    }
    expect(st.misses).toBe(0);
    expect(st.clutchCount).toBeGreaterThanOrEqual(1);
    expect(st.solved).toBe(3);
    expect(st.lastFx).toBe('Kịp lúc!');
  });

  test('M-KISHO-KOI-EARLY-DECOY & M-FORGIVE: L7 grey decoy cue/note and 140ms cooldown grace', async ({ page }) => {
    await page.addInitScript(() => {
      window.__BB_TEST__ = true;
      for (let L = 1; L <= 5; L++) {
        localStorage.setItem('koi_lv2', '6');
        localStorage.setItem('koi_best', '5');
      }
    });
    await page.goto('/#koi');
    await expect(page.locator('#kmenu')).toBeVisible();

    const decoyMeta = await page.evaluate(() => ({
      l6: window.__koi.params(6).decoys,
      l7: window.__koi.params(7).decoys,
      lvMax: window.__koi.LV_MAX,
    }));
    expect(decoyMeta.l6).toBe(0);
    expect(decoyMeta.l7).toBe(1);

    // Beat L6 -> result card displays upcoming Level 7 grey-fish cue.
    await pickLevel(page, '#klvgrid', 6);
    await page.click('#kStartBtn');
    await page.waitForFunction(() => window.__koi && window.__koi.state === 'play');
    await feedAll(page);
    await expect(page.locator('#kresult')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#kresult .bb-koi-cue')).toBeVisible();
    await expect(page.locator('#kresult .bb-koi-cue')).toContainText('Level 7');

    // Menu selects L7 -> #kDecoyNote visible; selecting L6 hides it.
    await page.click('#krMenu');
    await expect(page.locator('#kmenu')).toBeVisible();
    await expect(page.locator('#kDecoyNote')).toBeVisible();
    await expect(page.locator('#kDecoyNote')).toContainText('Từ Level 7 có cá xám');
    await pickLevel(page, '#klvgrid', 6);
    await expect(page.locator('#kDecoyNote')).toBeHidden();

    // Return to L1 and test 140ms cooldown grace (cooldown = 0.11s feeds cleanly + 3 stars).
    await pickLevel(page, '#klvgrid', 1);
    await page.click('#kStartBtn');
    await page.waitForFunction(() => window.__koi && window.__koi.state === 'play');

    await page.waitForFunction(() => {
      const K = window.__koi;
      return K.fish.some(f => !f.decoy && !f.fed && K.fishAt(f.x, f.y) === f);
    });
    await page.evaluate(() => { window.__koi.cooldown = 0.11; });
    expect(await tapFish(page, 'fresh')).toBe(true);
    expect(await page.evaluate(() => window.__koi.earlyTaps)).toBe(0);
    await feedAll(page);
    await expect(page.locator('#kresult')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#krStars')).toHaveAttribute('aria-label', '3 trên 3 sao');

    // Beyond 140ms grace (cooldown = 0.25s after >300ms delay) still blocks & counts early tap.
    await page.click('#krMenu');
    await pickLevel(page, '#klvgrid', 1);
    await page.click('#kStartBtn');
    await page.waitForFunction(() => window.__koi && window.__koi.state === 'play');
    await page.waitForTimeout(350);
    await page.waitForFunction(() => {
      const K = window.__koi;
      return K.fish.some(f => !f.decoy && !f.fed && K.fishAt(f.x, f.y) === f);
    });
    await page.evaluate(() => { window.__koi.cooldown = 0.25; });
    await tapFish(page, 'fresh');
    expect(await page.evaluate(() => window.__koi.earlyTaps)).toBe(1);
  });

  test('M-FORGIVE (train): calm 0.6s tunnel glow (static under reduced motion) and grace-window switch flip', async ({ page }) => {
    // 1. Reduced-motion burst tunnel glow stays steady at 0.75.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.clock.install();
    await page.goto('/#tau');
    await page.click('#startBtn');
    await page.clock.runFor(4000);
    await page.evaluate(() => window.__rtd.setBurstWait(0.3));
    expect(await page.evaluate(() => window.__rtd.tunnelGlow)).toBe(0.75);

    // 2. Default-motion tunnel glow scales with spawnTimer + deterministic grace-flip save.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.goto('/#tau');
    await expect(page.locator('#menu')).toBeVisible();
    await page.click('#startBtn');
    await page.clock.runFor(4000);
    await page.evaluate(() => window.__rtd.setBurstWait(0.3));
    const midGlow = await page.evaluate(() => window.__rtd.tunnelGlow);
    expect(midGlow).toBeGreaterThan(0);
    expect(midGlow).toBeLessThan(1);

    // 3. Honest vs dishonest 2-hop switch chains (leadsTo follows live .sel all the way to station).
    const startWithFirstTrain = async () => {
      for (let tries = 0; tries < 6; tries++) {
        await page.goto('/');
        await page.goto('/#tau');
        await page.click('#startBtn');
        for (let i = 0; i < 65; i++) {
          await page.clock.runFor(100);
          const count = await page.evaluate(() => window.__rtd.trains.length);
          if (count >= 1) break;
        }
        const info = await page.evaluate(() => {
          const r = window.__rtd, tr = r.trains[0], cv = document.getElementById('cv').getBoundingClientRect();
          const walk = (e, acc) => {
            if (e.to.type === 'station') return e.to.key === tr.key ? acc : null;
            const sw = e.to;
            for (let sel = 0; sel < sw.childEdges.length; sel++) {
              const hit = walk(sw.childEdges[sel], acc.concat([{
                idx: r.map.switches.indexOf(sw), wantSel: sel, curSel: sw.sel,
                x: cv.left + sw.px.x, y: cv.top + sw.px.y,
              }]));
              if (hit) return hit;
            }
            return null;
          };
          return { key: tr.key, chain: walk(r.map.tunnel.edge, []) || [] };
        });
        if (info.chain.length >= 2) return info;
      }
      throw new Error('train did not spawn a 2-hop route within 6 tries');
    };

    // Negative check: flipping switches[0] onto a subtree whose downstream switch points wrong gives 0 clutchCount.
    const neg = await startWithFirstTrain();
    if (neg.chain[1].curSel === neg.chain[1].wantSel) await page.mouse.click(neg.chain[1].x, neg.chain[1].y);
    if (neg.chain[0].curSel === neg.chain[0].wantSel) await page.mouse.click(neg.chain[0].x, neg.chain[0].y);

    let crossedNeg = null;
    for (let i = 0; i < 260; i++) {
      await page.clock.runFor(50);
      crossedNeg = await page.evaluate(idx => window.__rtd.trains.find(t => t.swId === idx), neg.chain[0].idx);
      if (crossedNeg) break;
    }
    expect(crossedNeg).toBeTruthy();
    expect(crossedNeg.wrong).toBe(true);

    await page.mouse.click(neg.chain[0].x, neg.chain[0].y);
    await page.clock.runFor(32);
    expect(await page.evaluate(() => ({ clutch: window.__rtd.clutchCount, wrong: window.__rtd.trains[0].wrong })))
      .toEqual({ clutch: 0, wrong: true });

    // Positive check: when downstream switches point right, grace-flipping switch 0 completes live route & earns "Kịp lúc!".
    const pos = await startWithFirstTrain();
    for (const s of pos.chain.slice(1)) {
      if (s.curSel !== s.wantSel) await page.mouse.click(s.x, s.y);
    }
    if (pos.chain[0].curSel === pos.chain[0].wantSel) await page.mouse.click(pos.chain[0].x, pos.chain[0].y);

    let crossedPos = null;
    for (let i = 0; i < 260; i++) {
      await page.clock.runFor(50);
      crossedPos = await page.evaluate(idx => window.__rtd.trains.find(t => t.swId === idx), pos.chain[0].idx);
      if (crossedPos) break;
    }
    expect(crossedPos).toBeTruthy();
    expect(crossedPos.wrong).toBe(true);

    await page.mouse.click(pos.chain[0].x, pos.chain[0].y);
    await page.clock.runFor(32);
    expect(await page.evaluate(() => ({ clutch: window.__rtd.clutchCount, wrong: window.__rtd.trains[0].wrong })))
      .toEqual({ clutch: 1, wrong: false });
  });

  test('M-FORGIVE (mem): 1-1 deciding round shows calm badge, aria-label, and zero overlap at 320x568', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 });
    await page.clock.install();
    await page.goto('/#nho');
    await page.click('#mStart');

    const waitPhase = async want => {
      for (let i = 0; i < 50; i++) {
        await page.clock.runFor(100);
        if (await page.evaluate(() => window.__mem.phase) === want) return;
      }
      throw new Error(`mem never reached phase ${want}`);
    };

    // Round 1 (perfect): click all target tiles.
    await waitPhase('input');
    const r1Targets = await page.evaluate(() => window.__mem.targets);
    for (const idx of r1Targets) await page.locator('#mGrid button').nth(idx).click();
    await page.clock.runFor(1000);

    // Round 2 (fail): click a non-target tile.
    await waitPhase('input');
    const badIdx = await page.evaluate(() => {
      const ts = new Set(window.__mem.targets);
      const count = document.querySelectorAll('#mGrid button').length;
      for (let i = 0; i < count; i++) if (!ts.has(i)) return i;
      return -1;
    });
    await page.locator('#mGrid button').nth(badIdx).click();
    await page.clock.runFor(1400);

    // Round 3 at 1-1 enters deciding state.
    await waitPhase('show');
    const layout = await page.evaluate(() => {
      const pill = document.getElementById('mRound');
      const hint = document.getElementById('mHint');
      const hud = [...document.querySelectorAll('#memApp .top > *')].map(el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
      });
      return {
        round: window.__mem.round,
        hasDecide: pill.classList.contains('decide'),
        pillLabel: pill.getAttribute('aria-label') || '',
        hintText: hint.textContent || '',
        overflow: document.documentElement.scrollWidth - window.innerWidth,
        hud,
      };
    });
    expect(layout.round).toBe(2);
    expect(layout.hasDecide).toBe(true);
    expect(layout.pillLabel).toContain('Lượt quyết định');
    expect(layout.hintText).toContain('Lượt quyết định (3/3)');
    expect(layout.overflow).toBeLessThanOrEqual(0);
    expect(siblingOverlaps(layout.hud)).toEqual([]);
  });

  test('M-KISHO-WORD-HINT-TOGGLE & M-META-SHARE: hint-free badge, full-star free hint, and spoiler-free repeat share', async ({ page }) => {
    await page.addInitScript(() => {
      window.__copiedTexts = [];
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async txt => { window.__copiedTexts.push(String(txt)); },
        },
      });
    });

    await page.goto('/#chu');
    await expect(page.locator('#wmenu')).toBeVisible();

    // Pick Level 35 ("cà phê") without tapping #wHint.
    await pickLevel(page, '#wlvgrid', 35);
    await page.click('#wStart');
    for (const ch of 'ca2phe6') await page.keyboard.press(ch);
    await page.keyboard.press('Enter');
    await expect(page.locator('#wresult')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#wrNoHint')).toBeVisible();
    await expect(page.locator('#wrNoHint')).toHaveText('Đoán ra không cần gợi ý');
    await expect(page.locator('#wrShare')).toBeVisible();

    await page.click('#wrShare');
    await page.waitForFunction(() => (document.getElementById('wrShareStatus')?.textContent || '').length > 0);
    const firstMsg = await page.locator('#wrShareStatus').textContent();
    expect(firstMsg).toContain('Đã chép lưới lượt đoán');

    const shareNoHint = await page.evaluate(() => window.__copiedTexts[0] || '');
    expect(shareNoHint).toContain('Lv 35 (1/6)');
    expect(shareNoHint).toContain('Đoán ra không cần gợi ý');
    expect(shareNoHint).toContain('🟩🟩 🟩🟩🟩');
    expect(shareNoHint.toLowerCase()).not.toContain('cà');
    expect(shareNoHint.toLowerCase()).not.toContain('phê');

    // Second click keeps #wrShare enabled and toggles NBSP so live region re-announces.
    await page.click('#wrShare');
    await expect(page.locator('#wrShare')).toBeEnabled();
    await page.waitForFunction(prev => {
      const now = document.getElementById('wrShareStatus')?.textContent || '';
      return now.length > 0 && now !== prev;
    }, firstMsg);
    const secondMsg = await page.locator('#wrShareStatus').textContent();
    expect(secondMsg).toBe(`${firstMsg}\u00A0`);

    // Replay L35 using Turn-1 hint: full 3 stars kept, #wrNoHint hidden, share omits no-hint line.
    await page.click('#wrMenu');
    await pickLevel(page, '#wlvgrid', 35);
    await page.click('#wStart');
    await page.click('#wHint');
    for (const ch of 'ca2phe6') await page.keyboard.press(ch);
    await page.keyboard.press('Enter');
    await expect(page.locator('#wresult')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('#wrNoHint')).toBeHidden();
    await expect(page.locator('#wrStars')).toHaveAttribute('aria-label', '3/3 sao');

    await page.click('#wrShare');
    const shareWithHint = await page.evaluate(() => window.__copiedTexts.at(-1) || '');
    expect(shareWithHint).toContain('Lv 35 (1/6)');
    expect(shareWithHint).not.toContain('Đoán ra không cần gợi ý');
    expect(shareWithHint).toContain('🟩🟩 🟩🟩🟩');
    expect(shareWithHint.toLowerCase()).not.toContain('cà');
    expect(shareWithHint.toLowerCase()).not.toContain('phê');
  });

  for (const vp of [{ width: 320, height: 568 }, { width: 667, height: 375 }]) {
    test(`M-META-ZEIGARNIK: 5-level chapters, >=44px summaries, stars preserved, and zero overlap at ${vp.width}x${vp.height}`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto('/');
      await page.evaluate(() => {
        for (const g of ['train', 'koi', 'mem', 'rain', 'word']) {
          for (let L = 1; L <= 5; L++) window.BB.record({ game: g, level: L, won: true, stars: 3, score: 10, ms: 2000 });
        }
        localStorage.setItem('rtd_best3', '5');
        localStorage.setItem('koi_lv2', '6');
        localStorage.setItem('koi_best', '5');
        localStorage.setItem('rain_lv', '6');
      });

      const menus = [
        { hash: '#tau', grid: '#lvgrid', menu: '#menu' },
        { hash: '#koi', grid: '#klvgrid', menu: '#kmenu' },
        { hash: '#nho', grid: '#mlvgrid', menu: '#mmenu' },
        { hash: '#mua', grid: '#rlvgrid', menu: '#rmenu' },
        { hash: '#chu', grid: '#wlvgrid', menu: '#wmenu' },
      ];

      for (const m of menus) {
        await page.goto(`/${m.hash}`);
        await expect(page.locator(m.menu)).toBeVisible();
        await page.waitForFunction(sel => {
          const card = document.querySelector(`${sel} .card`);
          return card && card.getAnimations().every(a => a.playState === 'finished');
        }, m.menu);

        const audit = await page.evaluate(sel => {
          const grid = document.querySelector(sel);
          const chaps = [...grid.querySelectorAll(':scope > details.lvchap')];
          const sums = chaps.map(d => {
            const s = d.querySelector(':scope > summary.lvchap-sum');
            const sr = s.getBoundingClientRect();
            const hasHeading = !!s.querySelector('h1, h2, h3, h4, h5, h6');
            return {
              h: sr.height, hasHeading, open: d.open, count: d.querySelectorAll('.lv').length,
              title: s.querySelector('.lvchap-title')?.textContent?.trim() || '',
              aria: s.getAttribute('aria-label') || '',
            };
          });
          const chapRects = chaps.map(d => {
            const r = d.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          });
          const openTiles = [...grid.querySelectorAll('details.lvchap[open] .lv')].map(el => {
            const r = el.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          });
          return {
            sums,
            chapRects,
            openTiles,
            overflow: document.documentElement.scrollWidth - window.innerWidth,
            openCount: chaps.filter(d => d.open).length,
            activeChapterOpen: chaps[1]?.open === true,
          };
        }, m.grid);

        expect(audit.overflow, `${m.hash} overflow`).toBeLessThanOrEqual(0);
        expect(audit.openCount, `${m.hash} only 1 open chapter on entry`).toBe(1);
        expect(audit.activeChapterOpen, `${m.hash} Chapter 2 (L6) open on entry`).toBe(true);
        for (const s of audit.sums.slice(0, -1)) expect(s.count).toBe(5);
        for (const s of audit.sums) {
          expect(s.h, `${m.hash} summary >= 44px`).toBeGreaterThanOrEqual(44);
          expect(s.hasHeading, `${m.hash} no heading in summary`).toBe(false);
          if (s.count === 1) {
            expect(s.title, `${m.hash} single-level chapter has no duplicate range`).not.toMatch(/L(\d+)–\1$/);
            expect(s.aria, `${m.hash} single-level chapter aria-label has no duplicate range`).not.toMatch(/Level (\d+) đến \1/);
          }
        }
        expect(siblingOverlaps(audit.chapRects), `${m.hash} chapter overlap`).toEqual([]);
        expect(siblingOverlaps(audit.openTiles), `${m.hash} open tile overlap`).toEqual([]);

        // Expand collapsed Chapter 1 and confirm Level 1..5 tiles & 3-star progress stay intact.
        const ch1 = page.locator(`${m.grid} details.lvchap`).first();
        await expect(ch1).not.toHaveAttribute('open', '');
        await ch1.locator('summary.lvchap-sum').click();
        await expect(ch1).toHaveAttribute('open', '');
        const lv1 = ch1.locator('.lv').first();
        await expect(lv1).toBeVisible();
        const has3Stars = await lv1.evaluate(el => (el.getAttribute('aria-label') || '').includes('3 sao') || el.textContent.includes('★★★') || el.dataset.st === '★★★');
        expect(has3Stars, `${m.hash} L1 preserves 3 stars`).toBe(true);
      }
    });
  }
});
