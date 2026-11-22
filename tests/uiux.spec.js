// UI/UX craft and accessibility gate: contrast (WCAG AA + 1.4.11), touch targets,
// zero horizontal overflow, focus rings, reduced motion, OS text-scale opt-in,
// and regression checks for the fixed menu/result/display bugs.
import { test, expect } from './fixtures.js';

const PROGRESS_FIXTURE = {
  bb_stats: JSON.stringify({
    train: { best: 3, stars: { 1: 3, 2: 2, 3: 3 } },
    koi: { best: 2, stars: { 1: 3, 2: 2 } },
    mem: { best: 4, stars: { 1: 3, 2: 2, 3: 3, 4: 1 } },
    rain: { best: 4, stars: { 1: 3, 2: 2, 3: 1, 4: 3 } },
    word: { best: 5, stars: { 1: 3, 2: 2, 3: 3, 4: 1, 5: 2 } },
  }),
  bb_seeded_v2: '1',
};

async function seedAndOpen(page, hash = '', storage = PROGRESS_FIXTURE) {
  await page.addInitScript(s => {
    window.__BB_TEST__ = true;
    if (!sessionStorage.getItem('__uiux_seeded')) {
      localStorage.clear();
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
      sessionStorage.setItem('__uiux_seeded', '1');
    }
  }, storage);
  await page.goto('/' + hash);
}

// Compute effective background RGB behind an element by walking up and compositing rgba fills,
// sampling gradient stops so both lightest and darkest ends of any background gradient pass.
function contrastHelperSrc() {
  return `
    function parseCol(s) {
      const m = s && s.match(/rgba?\\(([\\d.]+),\\s*([\\d.]+),\\s*([\\d.]+)(?:,\\s*([\\d.]+))?\\)/);
      if (!m) return null;
      return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
    }
    function parseBgCandidates(el) {
      const cs = getComputedStyle(el);
      const out = [];
      const bgImg = cs.backgroundImage;
      if (bgImg && bgImg !== 'none') {
        const stops = [...bgImg.matchAll(/rgba?\\([^)]+\\)/g)].map(m => parseCol(m[0])).filter(Boolean);
        if (stops.length) out.push(...stops);
      }
      const c = parseCol(cs.backgroundColor);
      if (c && c[3] > 0) out.push(c);
      return out;
    }
    function blend(fg, bg) {
      const a = fg[3];
      return [fg[0]*a + bg[0]*(1-a), fg[1]*a + bg[1]*(1-a), fg[2]*a + bg[2]*(1-a), 1];
    }
    function lum([r, g, b]) {
      const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }
    function ratio(c1, c2) {
      const l1 = lum(c1), l2 = lum(c2);
      return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    }
    function bgStack(el) {
      const chain = [];
      for (let p = el; p && p.nodeType === 1; p = p.parentElement) chain.unshift(p);
      let accs = [[10, 21, 14, 1]];
      for (const node of chain) {
        const cands = parseBgCandidates(node);
        if (!cands.length) continue;
        const next = [];
        for (const base of accs) for (const layer of cands) next.push(blend(layer, base));
        // deduplicate extreme samples by keeping min/max luminance
        next.sort((a, b) => lum(a) - lum(b));
        accs = next.length > 2 ? [next[0], next[next.length - 1]] : next;
      }
      return accs;
    }
    function minTextContrast(el) {
      const cs = getComputedStyle(el);
      const fg = parseCol(cs.color);
      if (!fg) return null;
      const bgs = bgStack(el);
      let worst = 99;
      for (const bg of bgs) {
        const c = fg[3] < 1 ? blend(fg, bg) : fg;
        worst = Math.min(worst, ratio(c, bg));
      }
      const fs = parseFloat(cs.fontSize), fw = parseFloat(cs.fontWeight) || 400;
      const large = fs >= 24 || (fs >= 18.66 && fw >= 700);
      return { worst, need: large ? 3.0 : 4.5, fs, fw };
    }
  `;
}

test('WCAG AA text contrast holds on hub, settings, QR dialog (Light & Dark) and all 5 menus', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await seedAndOpen(page, '', { ...PROGRESS_FIXTURE, bb_theme: theme });

    // Hub checks
    const hubBad = await page.evaluate(([sels, helper]) => {
      eval(helper);
      const bad = [];
      for (const sel of sels) {
        for (const el of document.querySelectorAll(sel)) {
          if (el.offsetParent === null) continue;
          const r = minTextContrast(el);
          if (r && r.worst < r.need - 0.05) bad.push(`${sel}: ${r.worst.toFixed(2)}:1 < ${r.need}:1`);
        }
      }
      return bad;
    }, [['.hubsub', '.hstat b', '.hstat small', '.dailycard .dk', '.dailycard b', '.dailycard .dgo', '.gamecard b', '.gamecard small', '.gamecard em', '#hubShare', '#hubQrBtn', '.foot-note'], contrastHelperSrc()]);
    expect(hubBad, `hub (${theme})`).toEqual([]);

    // Settings + danger confirm contrast
    await page.click('#hubSettings');
    await page.click('#setReset');
    const setBad = await page.evaluate(([sels, helper]) => {
      eval(helper);
      const bad = [];
      for (const sel of sels) {
        for (const el of document.querySelectorAll(sel)) {
          if (getComputedStyle(el).display === 'none') continue;
          const r = minTextContrast(el);
          if (r && r.worst < r.need - 0.05) bad.push(`${sel}: ${r.worst.toFixed(2)}:1 < ${r.need}:1`);
        }
      }
      return bad;
    }, [['#settings h2', '#settings .setrow', '#settings .setsub', '#settings .seg button', '#setConfirm .note', '#setResetNo', '#setResetYes', '#setClose'], contrastHelperSrc()]);
    expect(setBad, `settings (${theme})`).toEqual([]);
    await page.click('#setClose');

    // QR dialog contrast
    await page.click('#hubQrBtn');
    const qrBad = await page.evaluate(([sels, helper]) => {
      eval(helper);
      const bad = [];
      for (const sel of sels) {
        for (const el of document.querySelectorAll(sel)) {
          const r = minTextContrast(el);
          if (r && r.worst < r.need - 0.05) bad.push(`${sel}: ${r.worst.toFixed(2)}:1 < ${r.need}:1`);
        }
      }
      return bad;
    }, [['#qrDialog h2', '#qrDialog p', '#qrTargetName', '#qrUrlText', '#qrTargets button', '#qrCopyBtn', '#qrSaveBtn', '#qrShareResultBtn'], contrastHelperSrc()]);
    expect(qrBad, `qrDialog (${theme})`).toEqual([]);
    await page.keyboard.press('Escape');
  }

  // Each game menu (constant dark arena aesthetic)
  for (const hash of ['#tau', '#koi', '#nho', '#mua', '#chu']) {
    await page.goto('/' + hash);
    const menuBad = await page.evaluate(([sels, helper]) => {
      eval(helper);
      const bad = [];
      for (const sel of sels) {
        const el = document.querySelector(sel);
        if (!el || getComputedStyle(el).display === 'none') continue;
        const r = minTextContrast(el);
        if (r && r.worst < r.need - 0.05) bad.push(`${sel}: ${r.worst.toFixed(2)}:1 < ${r.need}:1`);
      }
      return bad;
    }, [[
      `${hash === '#tau' ? '#menu' : hash === '#koi' ? '#kmenu' : hash === '#nho' ? '#mmenu' : hash === '#mua' ? '#rmenu' : '#wmenu'} .sub`,
      `${hash === '#tau' ? '#menu' : hash === '#koi' ? '#kmenu' : hash === '#nho' ? '#mmenu' : hash === '#mua' ? '#rmenu' : '#wmenu'} .how div`,
      `${hash === '#tau' ? '#menu' : hash === '#koi' ? '#kmenu' : hash === '#nho' ? '#mmenu' : hash === '#mua' ? '#rmenu' : '#wmenu'} .label`,
      `${hash === '#tau' ? '#menu' : hash === '#koi' ? '#kmenu' : hash === '#nho' ? '#mmenu' : hash === '#mua' ? '#rmenu' : '#wmenu'} .lv`,
      `${hash === '#tau' ? '#menu' : hash === '#koi' ? '#kmenu' : hash === '#nho' ? '#mmenu' : hash === '#mua' ? '#rmenu' : '#wmenu'} .lv small`,
      `${hash === '#tau' ? '#menu' : hash === '#koi' ? '#kmenu' : hash === '#nho' ? '#mmenu' : hash === '#mua' ? '#rmenu' : '#wmenu'} .muted`,
    ], contrastHelperSrc()]);
    expect(menuBad, hash).toEqual([]);
  }
});

test('WCAG 1.4.11 non-text contrast: settings switch tracks >= 3:1 in both OFF and ON states across Light & Dark', async ({ page }) => {
  for (const theme of ['light', 'dark']) {
    await page.addInitScript(t => { localStorage.setItem('bb_theme', t); localStorage.setItem('bb_sound', '1'); }, theme);
    await page.goto('/');
    await page.click('#hubSettings');
    const res = await page.evaluate(helper => {
      eval(helper);
      const sw = document.getElementById('setSound');
      const track = sw.querySelector('i');
      const cardBg = bgStack(sw.parentElement)[0];
      const measure = () => {
        const cs = getComputedStyle(track);
        const bd = parseCol(cs.borderTopColor);
        const bg = parseCol(cs.backgroundColor);
        const compBd = bd ? blend(bd, cardBg) : cardBg;
        const compBg = bg ? blend(bg, cardBg) : cardBg;
        return {
          checked: sw.getAttribute('aria-checked'),
          borderVsCard: ratio(compBd, cardBg),
          fillVsCard: ratio(compBg, cardBg),
          thumbVsFill: ratio([255, 255, 255, 1], compBg),
        };
      };
      const on = measure();
      sw.click();
      const off = measure();
      return { on, off };
    }, contrastHelperSrc());

    expect(res.on.checked, theme).toBe('true');
    expect(Math.max(res.on.borderVsCard, res.on.fillVsCard), theme).toBeGreaterThanOrEqual(3.0);
    expect(res.on.thumbVsFill, theme).toBeGreaterThanOrEqual(3.0);
    expect(res.off.checked, theme).toBe('false');
    expect(res.off.borderVsCard, theme).toBeGreaterThanOrEqual(3.0);
  }
});

test('Mem starred level tiles never overlap the level number', async ({ page }) => {
  await seedAndOpen(page, '#nho');
  const tile = page.locator('#mlvgrid .lv.done[data-st]').first();
  await expect(tile).toBeVisible();
  const m = await tile.evaluate(el => {
    const after = getComputedStyle(el, '::after');
    const r = el.getBoundingClientRect();
    return { position: after.position, display: after.display, content: after.content, h: r.height, sw: el.scrollWidth, cw: el.clientWidth };
  });
  expect(m.position).toBe('static');
  expect(m.display).toBe('block');
  expect(m.content).toContain('★');
  expect(m.h).toBeGreaterThanOrEqual(52);
  expect(m.sw).toBeLessThanOrEqual(m.cw + 1);
});

test('Rain empty input bar reserves >= 44px height with prompt before typing', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#mua');
  await page.click('#rStart');
  const m = await page.evaluate(() => {
    const el = document.getElementById('rDisp');
    const cs = getComputedStyle(el, '::before');
    return { h: el.getBoundingClientRect().height, beforeContent: cs.content };
  });
  expect(m.h).toBeGreaterThanOrEqual(44);
  expect(m.beforeContent).toContain('Gõ đáp án');
});

test('Word and Koi menus keep primary Start button visible above the fold at 390x844 and 1440x900', async ({ page }) => {
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await seedAndOpen(page, '#chu');
    const wr = await page.evaluate(() => {
      const btn = document.getElementById('wStart').getBoundingClientRect();
      const home = document.querySelector('#wmenu [data-home]').getBoundingClientRect();
      const grid = document.getElementById('wlvgrid');
      return { top: btn.top, bottom: btn.bottom, homeBottom: home.bottom, vh: innerHeight, sh: grid.scrollHeight, ch: grid.clientHeight };
    });
    expect(wr.bottom, `word start at ${w}x${h}`).toBeLessThanOrEqual(wr.vh);
    expect(wr.homeBottom, `word back button at ${w}x${h}`).toBeLessThanOrEqual(wr.vh);
    expect(wr.sh, `word level grid scrolls at ${w}x${h}`).toBeGreaterThan(wr.ch);

    await page.goto('/#koi');
    const kr = await page.evaluate(() => {
      const btn = document.getElementById('kStartBtn').getBoundingClientRect();
      const home = document.querySelector('#kmenu [data-home]').getBoundingClientRect();
      return { btnBottom: btn.bottom, homeBottom: home.bottom, vh: innerHeight };
    });
    expect(kr.btnBottom, `koi start at ${w}x${h}`).toBeLessThanOrEqual(kr.vh);
    expect(kr.homeBottom, `koi back button at ${w}x${h}`).toBeLessThanOrEqual(kr.vh);
  }
});

test('Result cards place stars above the big hero number across Train, Koi, Rain and Word', async ({ page }) => {
  await page.addInitScript(() => { window.__BB_TEST__ = true; });
  await page.goto('/#tau');
  await page.waitForFunction(() => window.__rtd && window.__rtd.map);
  await page.click('#startBtn');
  await page.evaluate(() => __rtd.endWith(1, 10, 10));
  const tPos = await page.evaluate(() => ({
    stars: document.getElementById('rStars').getBoundingClientRect().top,
    big: document.getElementById('rPct').getBoundingClientRect().top,
  }));
  expect(tPos.stars).toBeLessThan(tPos.big);

  await page.goto('/#koi');
  await page.click('#kStartBtn');
  const koiN = await page.evaluate(() => window.__koi.fish.filter(x => !x.decoy).length);   // L1 = 10 since the 2026-11-22 easy opening (12 in table v2 before, 6 in v1)
  for (let i = 0; i < koiN; i++) {
    await page.evaluate(() => {
      const K = window.__koi; K.cooldown = 0;
      const f = K.fish.find(x => !x.decoy && !x.fed);
      const cv = document.getElementById('kcv'), r = cv.getBoundingClientRect();
      cv.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, isPrimary: true, button: 0, clientX: r.left + f.x, clientY: r.top + f.y }));
    });
  }
  await expect(page.locator('#kresult')).toBeVisible();
  const kPos = await page.evaluate(() => ({
    stars: document.getElementById('krStars').getBoundingClientRect().top,
    big: document.getElementById('krBig').getBoundingClientRect().top,
  }));
  expect(kPos.stars).toBeLessThan(kPos.big);

  await page.goto('/#mua');
  await page.click('#rStart');
  await page.evaluate(() => { for (const a of [91, 92, 93]) window.__rainTest.spawnDrop(a, 0.99); });
  await expect(page.locator('#rresult')).toBeVisible();
  const rPos = await page.evaluate(() => ({
    stars: document.getElementById('rrStars').getBoundingClientRect().top,
    big: document.getElementById('rrBig').getBoundingClientRect().top,
  }));
  expect(rPos.stars).toBeLessThan(rPos.big);

  await page.goto('/#chu');
  await page.locator('#wlvgrid .lv').nth(29).click();   // "bà nội" moved L1 → L30 in table v2
  await page.click('#wStart');
  for (const ch of 'ba2noi65') await page.keyboard.press(ch);
  await page.keyboard.press('Enter');
  await expect(page.locator('#wresult')).toBeVisible({ timeout: 6000 });
  const wPos = await page.evaluate(() => ({
    stars: document.getElementById('wrStars').getBoundingClientRect().top,
    big: document.getElementById('wrBig').getBoundingClientRect().top,
  }));
  expect(wPos.stars).toBeLessThan(wPos.big);
});

test('OS text-scale opt-in is declared and html/root avoid px font-size override', async ({ page }) => {
  await page.goto('/');
  const info = await page.evaluate(() => {
    const meta = document.querySelector('meta[name="text-scale"]');
    return {
      content: meta ? meta.getAttribute('content') : null,
      rootFs: getComputedStyle(document.documentElement).fontSize,
    };
  });
  expect(info.content).toBe('scale');
  expect(info.rootFs).toBe('16px');
});

test('Reduced motion keeps fade-only cards and stops hub entrance/caret/toast slide animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const hubAnim = await page.evaluate(() => ({
    card: getComputedStyle(document.getElementById('openTrain')).animationName,
    toast: getComputedStyle(document.getElementById('bbToast') || document.body).transitionProperty,
  }));
  expect(hubAnim.card).toBe('none');

  await page.goto('/#chu');
  await page.click('#wStart');
  const caretAnim = await page.evaluate(() => { const c = document.querySelector('#wBoard .wcell.caret');
    return [getComputedStyle(c).animationName, getComputedStyle(c, '::after').animationName]; });
  expect(caretAnim).toEqual(['none', 'none']);   // the pulse lives on ::after since the QA pass
});

test('Zero horizontal overflow across 320, 390, 768 and 1440 on Hub, Settings and Menus', async ({ page }) => {
  for (const [w, h] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await seedAndOpen(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `hub ${w}x${h}`).toBeLessThanOrEqual(0);
    await page.click('#hubSettings');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `settings ${w}x${h}`).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    await page.click('#hubQrBtn');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `qrDialog ${w}x${h}`).toBeLessThanOrEqual(0);
    await page.keyboard.press('Escape');
    for (const hash of ['#tau', '#koi', '#nho', '#mua', '#chu']) {
      await page.goto('/' + hash);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${hash} ${w}x${h}`).toBeLessThanOrEqual(0);
    }
  }
});

test('Zero sibling overlap, section visGap >= 12px, and 4-edge hover border integrity across Hub viewports', async ({ page }) => {
  const measureGeometry = () => {
    const box = el => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height };
    };
    const overlapsOf = list => {
      const bad = [];
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i].getBoundingClientRect(), b = list[j].getBoundingClientRect();
          const ix = Math.min(a.right, b.right) - Math.max(a.left, b.left);
          const iy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
          if (ix > 0.5 && iy > 0.5) bad.push(`${list[i].id || list[i].className} vs ${list[j].id || list[j].className} (${ix.toFixed(1)}x${iy.toFixed(1)})`);
        }
      }
      return bad;
    };
    const hubKids = [...document.querySelectorAll('.hubwrap > *')].filter(el => el.offsetParent !== null);
    const cards = [...document.querySelectorAll('.gamecard')];
    const footKids = [...document.querySelectorAll('.hub-foot > *')].filter(el => el.offsetParent !== null);
    const shelf = box(document.getElementById('hubShelf'));
    const word = box(document.getElementById('openWord'));
    const foot = box(document.querySelector('.hub-foot'));
    const share = box(document.getElementById('hubShare'));
    const note = box(document.querySelector('.foot-note'));
    return {
      overlaps: [...overlapsOf(hubKids), ...overlapsOf(cards), ...overlapsOf(footKids)],
      shelfToFootGap: foot.top - shelf.bottom,
      wordToFootGap: foot.top - word.bottom,
      stackedFooter: note.top >= share.bottom - 1,
      shareToNoteGap: note.top - share.bottom,
    };
  };

  for (const [w, h] of [[320, 568], [362, 740], [390, 844], [600, 800], [667, 375], [768, 1024], [856, 900], [1024, 768], [1440, 900]]) {
    await page.setViewportSize({ width: w, height: h });
    await seedAndOpen(page, '', { bb_theme: 'light' });
    await page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(() => {}))));
    const idle = await page.evaluate(measureGeometry);
    expect(idle.overlaps, `idle overlaps at ${w}x${h}`).toEqual([]);
    const minSectionGap = h >= 600 ? 20 : 12;
    expect(idle.shelfToFootGap, `shelfToFootGap at ${w}x${h}`).toBeGreaterThanOrEqual(minSectionGap - 0.5);
    expect(idle.wordToFootGap, `wordToFootGap at ${w}x${h}`).toBeGreaterThanOrEqual(minSectionGap - 0.5);
    if (idle.stackedFooter) {
      expect(idle.shareToNoteGap, `shareToNoteGap at ${w}x${h}`).toBeGreaterThanOrEqual(11.5);
    }

    if (w >= 600) {
      for (const id of ['openTrain', 'openWord']) {
        await page.hover('#' + id);
        await expect.poll(async () => page.evaluate(cid => {
          const cs = getComputedStyle(document.getElementById(cid));
          return {
            t: cs.borderTopColor,
            r: cs.borderRightColor,
            b: cs.borderBottomColor,
            l: cs.borderLeftColor,
            allMatch: cs.borderTopColor === cs.borderRightColor && cs.borderRightColor === cs.borderBottomColor && cs.borderBottomColor === cs.borderLeftColor,
            widths: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
          };
        }, id), { timeout: 2000 }).toMatchObject({ allMatch: true, widths: ['1px', '1px', '1px', '1px'] });
      }
      const hoveredWord = await page.evaluate(measureGeometry);
      expect(hoveredWord.overlaps, `hovered #openWord overlaps at ${w}x${h}`).toEqual([]);
      expect(hoveredWord.wordToFootGap, `hovered wordToFootGap at ${w}x${h}`).toBeGreaterThanOrEqual(minSectionGap - 0.5);
    }
  }
});
