// Browser check for the shared difficulty engine: js/difficulty.js must load as a classic <script>
// with no BB on the page, and give the same numbers the Node simulator sees.
// Engine invariants and the mem calibration gates live in scripts/sim/difficulty.test.mjs (node --test).
import { test, expect } from './fixtures.js';

test('BBD loads as a classic script without BB and matches the Node tables', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/js/');                                    // plain directory listing: no app, no BB
  await page.addScriptTag({ url: '/js/difficulty.js' });
  for (const g of ['train', 'koi', 'mem', 'rain', 'word']) await page.addScriptTag({ url: `/js/levels/${g}.js` });
  const r = await page.evaluate(() => ({
    hasBB: typeof window.BB !== 'undefined',
    games: window.BBD.games(),
    max: Object.fromEntries(window.BBD.games().map(g => [g, window.BBD.maxLevel(g)])),
    mem30: { ...window.BBD.level('mem', 30) },
    mem13: { ...window.BBD.spec('mem').legacy[12] },           // table v1 row, kept as legacyLevels
    p30: window.BBD.pStar(30),
    lighter: { ...window.BBD.lighter('mem', 30) },
  }));
  expect(errors).toEqual([]);
  expect(r.hasBB).toBe(false);
  expect(r.games.sort()).toEqual(['koi', 'mem', 'rain', 'train', 'word']);
  expect(r.max).toEqual({ train: 30, koi: 30, mem: 30, rain: 30, word: 49 });
  expect(r.mem13).toMatchObject({ t: 15, size: 6, show: 5.5 });
  expect(r.mem30).toMatchObject({ t: 7, size: 6, kind: 'peak', legacy: false, authored: true });   // mem table v2
  expect(r.p30).toBeCloseTo(0.69, 6);
  expect(r.lighter).toMatchObject({ assist: true, maxStars: 1, unlocksNext: true, slowTempo: 0.85, t: 6 });
});
