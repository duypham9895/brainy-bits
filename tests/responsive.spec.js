// Responsive gate: every screen of every game on phone, tablet and laptop sizes.
// Fails on horizontal overflow, controls pushed off-screen, touch targets under 44 px on touch
// devices (24 px with a mouse), and clipped text in controls. Screenshots go to the test output
// folder (RESP_SHOTS=1) so a person can look at the layout, not only the numbers.
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'phone-320', width: 320, height: 568, touch: true },
  { name: 'phone-360', width: 360, height: 740, touch: true },
  { name: 'phone-390', width: 390, height: 844, touch: true },
  { name: 'phone-land-667', width: 667, height: 375, touch: true },
  { name: 'phone-land-844', width: 844, height: 390, touch: true },
  { name: 'tablet-768', width: 768, height: 1024, touch: true },
  { name: 'tablet-820', width: 820, height: 1180, touch: true },
  { name: 'tablet-land-1024', width: 1024, height: 768, touch: true },
  { name: 'tablet-land-1180', width: 1180, height: 820, touch: true },
  { name: 'laptop-1280', width: 1280, height: 800, touch: false },
  { name: 'laptop-1440', width: 1440, height: 900, touch: false },
  { name: 'laptop-1920', width: 1920, height: 1080, touch: false },
];

const GAMES = [
  { key: 'train', open: '#openTrain', menu: '#menu', start: '#startBtn', wait: 4200 },
  { key: 'koi', open: '#openKoi', menu: '#kmenu', start: '#kStartBtn', wait: 1500 },
  { key: 'mem', open: '#openMem', menu: '#mmenu', start: '#mStart', wait: 800 },
  { key: 'rain', open: '#openRain', menu: '#rmenu', start: '#rStart', wait: 1500 },
  { key: 'word', open: '#openWord', menu: '#wmenu', start: '#wStart', wait: 600 },
];

// Runs in the page: list layout problems for what is currently on screen.
function audit(touch) {
  const vw = innerWidth, vh = innerHeight, out = [];
  const shown = el => {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity > 0.05;
  };
  const name = el => el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : '') +
    (el.textContent ? ` "${el.textContent.trim().slice(0, 18)}"` : '');
  if (document.documentElement.scrollWidth > vw + 1) out.push(`page overflows horizontally: scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
  const min = touch ? 44 : 24;
  const controls = [...document.querySelectorAll('button, [role="button"], a[href], input, select')].filter(shown);
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    const inScroller = el.closest('.overlay');            // overlays scroll vertically by design
    if (r.right > vw + 1 || r.left < -1) out.push(`off-screen horizontally: ${name(el)} [${Math.round(r.left)}..${Math.round(r.right)}] vw=${vw}`);
    if (!inScroller && (r.bottom > vh + 1 || r.top < -1)) out.push(`off-screen vertically: ${name(el)} [${Math.round(r.top)}..${Math.round(r.bottom)}] vh=${vh}`);
    // Letter and number pads: a 9-key row cannot be 44 px wide on a 320 px phone (system keyboards are
    // ~32 px too), so keys need full 44 px height and >= 28 px width (above WCAG 2.5.8's 24 px).
    const keyGrid = el.closest('#wKeys, .rpad');
    if (keyGrid && touch) { if (r.height < 43.5 || r.width < 27.5) out.push(`small key ${Math.round(r.width)}x${Math.round(r.height)} (need 28x44): ${name(el)}`); }
    else if (Math.min(r.width, r.height) < min - 0.5) out.push(`small target ${Math.round(r.width)}x${Math.round(r.height)} < ${min}: ${name(el)}`);
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') out.push(`clipped text: ${name(el)} (${el.scrollWidth} > ${el.clientWidth})`);
  }
  for (const el of [...document.querySelectorAll('.pill, .lv, h1, h2, .gamecard b, .gamecard small')].filter(shown)) {
    if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') out.push(`clipped text: ${name(el)} (${el.scrollWidth} > ${el.clientWidth})`);
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.push(`text off-screen: ${name(el)} [${Math.round(r.left)}..${Math.round(r.right)}]`);
  }
  for (const cv of [...document.querySelectorAll('canvas')].filter(shown)) {
    const r = cv.getBoundingClientRect();
    if (r.height < 120 && !cv.closest('[aria-hidden="true"]') && cv.id) out.push(`canvas too short: #${cv.id} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }
  // A playing surface hidden under its own keyboard is unplayable even when nothing overflows.
  const board = document.getElementById('wBoard'), keys = document.getElementById('wKeys');
  if (board && keys && shown(board) && shown(keys)) {
    const b = board.getBoundingClientRect(), k = keys.getBoundingClientRect();
    if (b.bottom > k.top + 1) out.push(`word board overlaps keyboard by ${Math.round(b.bottom - k.top)} px`);
    if (b.top < 0) out.push(`word board starts above the screen (${Math.round(b.top)} px)`);
  }
  const legend = document.querySelector('.wlegend');
  if (legend && keys && shown(legend) && shown(keys) && legend.getBoundingClientRect().bottom > keys.getBoundingClientRect().top + 1) out.push('word legend overlaps keyboard');
  // Keyboards and pads must not stretch across a laptop screen.
  for (const sel of ['#wKeys', '.rpad']) {
    const el = document.querySelector(sel);
    if (el && shown(el) && el.getBoundingClientRect().width > 640) out.push(`${sel} stretches to ${Math.round(el.getBoundingClientRect().width)} px (max 640)`);
  }
  return out;
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test.use({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.touch, isMobile: vp.touch, deviceScaleFactor: 2 });

    test('hub + every game menu and round', async ({ page }, info) => {
      test.setTimeout(90_000);
      const problems = [];
      const shot = async label => { if (process.env.RESP_SHOTS) await page.screenshot({ path: info.outputPath(`${vp.name}-${label}.png`) }); };
      const check = async label => { for (const p of await page.evaluate(audit, vp.touch)) problems.push(`${label}: ${p}`); await shot(label); };

      await page.goto('/');
      await expect(page.locator('#hub')).toBeVisible();
      await page.waitForTimeout(400);
      await check('hub');

      for (const g of GAMES) {
        await page.goto('/');
        await page.click(g.open);
        await expect(page.locator(g.menu)).toBeVisible();
        await page.waitForTimeout(350);
        await check(`${g.key}-menu`);
        await page.click(g.start);
        await expect(page.locator(g.menu)).toBeHidden();
        await page.waitForTimeout(g.wait);
        await check(`${g.key}-play`);
      }
      expect(problems, problems.join('\n')).toEqual([]);
    });
  });
}
