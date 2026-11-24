// G7 parity: verifies the Playwright browser games read BBD tables cleanly, consume identical
// PRNG logic as scripts/sim/adapters/*.mjs across 3 seeds at L1/L15/L30, and enforce exact pass/fail/star rules.
// (word G7 parity already lives in tests/word-levels.spec.js.)
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { test, expect, pickLevel } from './fixtures.js';
import { feedAll, skipCooldown, tapFish } from './koi-helpers.js';
import { loadBBD, ROOT } from '../scripts/sim/load-bbd.mjs';
import { rngFor } from '../scripts/sim/human.mjs';
import * as memAd from '../scripts/sim/adapters/mem.mjs';
import * as rainAd from '../scripts/sim/adapters/rain.mjs';
import * as trainAd from '../scripts/sim/adapters/train.mjs';
import * as koiAd from '../scripts/sim/adapters/koi.mjs';

const PRNG_SRC = `
function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
`;

function loadTrainMap(rng) {
  const ctx = vm.createContext({ window: {}, __rng: rng });
  vm.runInContext('Math.random = () => __rng();', ctx);
  vm.runInContext(readFileSync(join(ROOT, 'js', 'train-map.js'), 'utf8'), ctx, { filename: 'js/train-map.js' });
  return ctx.window.RTD_MAP;
}

test('G7 parity mem: 3 seeds at L1/L15/L30 pickTargets + pass/clutch/fail match adapter rules', async ({ page }) => {
  const B = loadBBD();
  await page.clock.install();
  await page.goto('/#nho');
  await expect(page.locator('#mmenu')).toBeVisible();

  for (const L of [1, 15, 30]) {
    const spec = B.level('mem', L);
    const gameSpec = await page.evaluate(lv => window.__mem.spec(lv), L);
    expect(gameSpec).toEqual({ size: spec.size, t: spec.t, show: spec.show, disp: spec.disp });
    for (let seed = 0; seed < 3; seed++) {
      const want = memAd.pickTargets(spec.size, spec.t, spec.disp, rngFor('g7', 'mem', L, seed));
      const got = await page.evaluate(([prng, s, seedIdx, L]) => {
        eval(prng);
        const r = mulberry32(cyrb53(['camp', 'g7', 'mem', L, seedIdx].join('|')) >>> 0);
        return window.BBD.spec('mem').meta.gen.pickTargets(s.size, s.t, s.disp, r);
      }, [PRNG_SRC, spec, seed, L]);
      expect(got, `mem L${L} seed ${seed}`).toEqual(want);
    }
  }

  const untilInput = async () => {
    for (let i = 0; i < 200; i++) {
      if ((await page.evaluate(() => window.__mem.phase)) === 'input') return;
      await page.clock.runFor(100);
    }
    throw new Error('mem never reached input phase');
  };
  const playRound = async win => {
    await untilInput();
    const ts = await page.evaluate(() => window.__mem.targets);
    if (win) {
      for (const idx of ts) await page.locator('#mGrid .mtile').nth(idx).click();
      await page.clock.runFor(1100);
    } else {
      let bad = 0; while (ts.includes(bad)) bad++;
      await page.locator('#mGrid .mtile').nth(bad).click();
      await page.clock.runFor(1700);
    }
  };

  // L1 2-1 clutch win (round 3 = pass), L15 2-0 sweep (round 2 = pass), L1 0-2 fail.
  await pickLevel(page, '#mlvgrid', 1); await page.click('#mStart');
  await playRound(false); await playRound(true); await playRound(true);
  await expect(page.locator('#mresult')).toBeVisible();
  await expect(page.locator('#mrBig')).toHaveText('2/3');
  await page.click('#mrMenu');

  await pickLevel(page, '#mlvgrid', 15); await page.click('#mStart');
  await playRound(true); await playRound(true);
  await expect(page.locator('#mrBig')).toHaveText('2/2');
  expect(await page.evaluate(() => window.__mem.starsFor())).toBe(3);
  await page.click('#mrMenu');

  await pickLevel(page, '#mlvgrid', 1); await page.click('#mStart');
  await playRound(false); await playRound(false);
  await expect(page.locator('#mrBig')).toHaveText('0/2');
  expect(await page.evaluate(() => window.__mem.starsFor())).toBe(0);
});

test('G7 parity rain: 3 seeds at L1/L15/L30 BBRain streams + lives/pass boundary match adapter', async ({ page }) => {
  const B = loadBBD();
  await page.goto('/#mua');
  await expect(page.locator('#rmenu')).toBeVisible();

  for (const L of [1, 15, 30]) {
    const spec = B.level('rain', L);
    expect(await page.evaluate(lv => window.__rainTest.spec(lv), L)).toMatchObject({
      ops: spec.ops, fall: spec.fall, every: spec.every, target: spec.target, lives: spec.lives,
    });
    for (let seed = 0; seed < 3; seed++) {
      const nr = rngFor('g7', 'rain', L, seed);
      const want = Array.from({ length: 8 }, (_, k) => ({
        eq: rainAd.makeEq(spec.ops, nr).slice(0, 2),
        fall: rainAd.dropFall(spec.fall, nr),
        gap: rainAd.spawnGap(spec.every, k % 2 === 1, nr),
      }));
      const got = await page.evaluate(([prng, s, seedIdx, L]) => {
        eval(prng);
        const r = mulberry32(cyrb53(['camp', 'g7', 'rain', L, seedIdx].join('|')) >>> 0);
        return Array.from({ length: 8 }, (_, k) => ({
          eq: window.BBRain.makeEq(s.ops, r).slice(0, 2),
          fall: window.BBRain.dropFall(s.fall, r),
          gap: window.BBRain.spawnGap(s.every, k % 2 === 1, r),
        }));
      }, [PRNG_SRC, spec, seed, L]);
      expect(got, `rain L${L} seed ${seed}`).toEqual(want);
    }
  }

  // Sun drop cap + makeTwinEq parity across 3 seeds at L6/L15/L30.
  for (const L of [6, 15, 30]) {
    const spec = B.level('rain', L);
    expect(await page.evaluate(([ops, tgt]) => window.BBRain.sunCap(ops, tgt), [spec.ops, spec.target])).toBe(rainAd.sunCap(spec.ops, spec.target));
    for (let seed = 0; seed < 3; seed++) {
      const nr = rngFor('g7-twin', L, seed);
      const base = rainAd.makeEq(spec.ops, nr);
      const wantTwin = rainAd.makeTwinEq(spec.ops, base[1], base[0], nr);
      const gotTwin = await page.evaluate(([prng, ops, seedIdx, L]) => {
        eval(prng);
        const r = mulberry32(cyrb53(['camp', 'g7-twin', L, seedIdx].join('|')) >>> 0);
        const b = window.BBRain.makeEq(ops, r);
        return window.BBRain.makeTwinEq(ops, b[1], b[0], r);
      }, [PRNG_SRC, spec.ops, seed, L]);
      expect(gotTwin, `rain twin L${L} seed ${seed}`).toEqual(wantTwin);
    }
  }

  // L15 has 3 lives (3rd miss loses), L16 breather has 4 lives (3rd miss survives, 4th loses).
  await pickLevel(page, '#rlvgrid', 15);
  await page.click('#rStart');
  await page.evaluate(() => { for (const a of [991, 992, 993]) window.__rainTest.spawnDrop(a, 0.99); });
  await expect(page.locator('#rresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#rrTitle')).toContainText('Chưa qua');
});

test('G7 parity train: 3 seeds at L1/L15/L30 map + spawn/speed/bag streams & 80% pass rule match adapter', async ({ page }) => {
  const B = loadBBD();
  await page.goto('/#tau');
  await expect(page.locator('#menu')).toBeVisible();
  await page.waitForFunction(() => window.__rtd && window.__rtd.map);

  for (const L of [1, 15, 30]) {
    const spec = B.level('train', L);
    expect(await page.evaluate(lv => ({ ...window.__rtd.specFor(lv) }), L)).toEqual({ ...spec });
    for (let seed = 0; seed < 3; seed++) {
      const nr = rngFor('g7', 'train', L, seed);
      const M = loadTrainMap(nr);
      const nMap = M.generate(spec.stations, 390, 700);
      const nBag = []; let nLast = -1, nPrev = -1, nLb = false;
      const nStream = Array.from({ length: 12 }, () => {
        const g = M.spawnGap(spec.base, spec.burstP, nLb, nr); nLb = g.burst;
        const st = M.drawStationIdx(nBag, spec.stations, nLast, nPrev, nr); nPrev = nLast; nLast = st;
        const sm = M.trainSpeedMul(spec.speedVar || 0, nr);
        return { gap: g.gap, burst: g.burst, st, sm };
      });
      const got = await page.evaluate(([prng, s, seedIdx, L]) => {
        eval(prng);
        const orig = Math.random;
        const r = mulberry32(cyrb53(['camp', 'g7', 'train', L, seedIdx].join('|')) >>> 0);
        Math.random = r;
        try {
          const bMap = window.RTD_MAP.generate(s.stations, 390, 700);
          const bag = []; let last = -1, prev = -1, lb = false;
          const stream = Array.from({ length: 12 }, () => {
            const g = window.RTD_MAP.spawnGap(s.base, s.burstP, lb, r); lb = g.burst;
            const st = window.RTD_MAP.drawStationIdx(bag, s.stations, last, prev, r); prev = last; last = st;
            const sm = window.RTD_MAP.trainSpeedMul(s.speedVar || 0, r);
            return { gap: g.gap, burst: g.burst, st, sm };
          });
          return {
            summary: { stations: bMap.stations.length, switches: bMap.switches.length, tunnelC: bMap.tunnel.g.c, edges: bMap.edges.length },
            stream,
          };
        } finally {
          Math.random = orig;
        }
      }, [PRNG_SRC, spec, seed, L]);
      expect(got.summary, `train map L${L} seed ${seed}`).toEqual({
        stations: nMap.stations.length, switches: nMap.switches.length, tunnelC: nMap.tunnel.g.c, edges: nMap.edges.length,
      });
      expect(got.stream, `train stream L${L} seed ${seed}`).toEqual(nStream);
    }
  }

  // Pass boundary: 15/19 (79%) fails, 16/20 (80%) passes matching PASS_PCT = 80.
  await page.click('#startBtn');
  await page.evaluate(() => window.__rtd.endWith(15, 15, 19));
  await expect(page.locator('#result')).toBeVisible();
  expect(await page.evaluate(() => window.__rtd.passed)).toBe(false);
  await page.click('#rNext');
  await page.evaluate(() => window.__rtd.endWith(15, 16, 20));
  expect(await page.evaluate(() => window.__rtd.passed)).toBe(true);
});

test('G7 parity koi: fishLen parity, 3 seeds at L1/L15/L30, KOI-02 decoy rule & MISTAKES_ALLOWED=1', async ({ page }) => {
  const B = loadBBD();
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript(() => { window.__BB_TEST__ = true; });
  await page.goto('/#koi');
  await expect(page.locator('#kmenu')).toBeVisible();

  for (const L of [1, 7, 15, 30]) {
    const spec = B.level('koi', L);
    expect(await page.evaluate(lv => window.__koi.params(lv), L)).toMatchObject({
      koi: spec.koi, decoys: spec.decoys, cd: spec.cd, spdMul: spec.spdMul, turnMul: spec.turnMul,
    });
    await pickLevel(page, '#klvgrid', L);
    await page.click('#kStartBtn');
    const geom = await page.evaluate(() => {
      const r = document.getElementById('kcv').getBoundingClientRect();
      return { w: r.width, h: r.height, len: window.__koi.fishLen(), fishCount: window.__koi.fish.length };
    });
    expect(geom.fishCount).toBe(spec.koi + spec.decoys);
    expect(Math.abs(geom.len - koiAd.fishLen(geom.w, geom.h, spec.koi))).toBeLessThan(0.5);
    await page.click('#kPauseBtn'); await page.click('#kQuitBtn');
  }

  // L15: 1 grey decoy mistake costs 0 pellets & locks cd, 2nd mistake fails; 1 mistake + all koi passes.
  await pickLevel(page, '#klvgrid', 15);
  await page.click('#kStartBtn');
  await skipCooldown(page);
  expect(await tapFish(page, 'decoy')).toBe(true);
  expect(await page.evaluate(() => window.__koi.pellets)).toBe(12);
  expect(await page.evaluate(() => window.__koi.cooldown)).toBeGreaterThan(2.5);
  await skipCooldown(page);
  expect(await tapFish(page, 'decoy')).toBe(true);
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krStars')).toHaveAttribute('aria-label', '0 trên 3 sao');

  await page.click('#krNext');
  await skipCooldown(page);
  expect(await tapFish(page, 'decoy')).toBe(true);
  expect(await feedAll(page)).toBe(12);
  await expect(page.locator('#kresult')).toBeVisible({ timeout: 3000 });
  await expect(page.locator('#krTitle')).toContainText('Qua Level 15');
});
