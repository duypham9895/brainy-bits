// Mưa Phép Tính — difficulty table + pure equation generator. Load after js/difficulty.js, before js/rain.js.
// Spec: MERGED-SPEC §4.2 "rain". Table version 2 = `levels` below; legacyLevels = the old js/rain.js spec(L).
// ops = equation tier: 1..9 = the old makeEq `case L`, 10 = its default branch, 11..14 = O11..O14 below.
// The generator is shared by the game (rng = Math.random) and the simulator (seeded rng): window.BBRain.
(function (root) {
  'use strict';

  // ---------- equations: makeEq(tier, rng) -> [text, answer, meta] ----------
  // Tiers 1..10 keep the operation mix and draw count of the old js/rain.js makeEq; add(m) and sub(m)
  // sample uniformly over valid (a, b) pairs instead of drawing `a` first and squeezing `b` into [1..m−a],
  // which previously gave 9 + 1 12.3x more often than 1 + 9 and 21.9% zero answers on sub(10).
  // meta describes the problem for the simulator's cost model only.
  function makeEq(tier, rng) {
    const ri = (a, b) => a + (rng() * (b - a + 1) | 0);
    const pair = m => {
      const k = (rng() * ((m - 1) * m / 2)) | 0;
      const r = Math.floor((Math.sqrt(8 * k + 1) - 1) / 2);
      return [r, k - r * (r + 1) / 2 + 1];
    };
    const add = m => { const [r, a] = pair(m), b = r + 2 - a; return [`${a} + ${b}`, a + b, { op: 'add', a, b }]; };
    const sub = m => { const [r, b] = pair(m), a = r + 2; return [`${a} − ${b}`, a - b, { op: 'sub', a, b }]; };
    const mul = (x0, x1, y1) => {
      const a = ri(x0, x1), b = ri(1, y1);
      return rng() < 0.5 ? [`${a} × ${b}`, a * b, { op: 'mul', a, b }] : [`${b} × ${a}`, a * b, { op: 'mul', a, b }];
    };
    const div = (x1, c0, c1) => { const b = ri(2, x1), c = ri(c0, c1); return [`${b * c} ÷ ${b}`, c, { op: 'div', a: b * c, b }]; };
    const pick = arr => arr[rng() * arr.length | 0]();
    const o10 = () => pick([() => add(200), () => sub(200), () => mul(2, 12, 12), () => div(12, 2, 12)]);
    switch (tier) {
      case 1: return add(10);
      case 2: return pick([() => add(10), () => sub(10)]);
      case 3: return pick([() => add(20), () => sub(20)]);
      case 4: return pick([() => add(50), () => sub(50)]);
      case 5: return pick([() => add(100), () => sub(100)]);
      case 6: return mul(2, 5, 10);
      case 7: return mul(2, 9, 9);
      case 8: return pick([() => mul(2, 9, 9), () => div(9, 1, 9)]);
      case 9: return pick([() => add(100), () => sub(100), () => mul(2, 9, 9), () => div(9, 1, 9)]);
      case 10: return o10();
    }
    // Tier ≥ 11: the new operations together take 30% of drops (MERGED-SPEC, A); the newest one gets half
    // of that share once there are older ones, so it stays visible. The other 70% stay on the O10 mix.
    // Answers stay in 0..999 (3-digit input, rain.js press()).
    const fresh = NEW_OPS.slice(0, Math.min(tier, 14) - 10);
    const r = rng();
    if (r >= NEW_SHARE) return o10();
    const n = fresh.length;
    if (n === 1 || r < NEW_SHARE / 2) return fresh[n - 1](ri, rng);
    return fresh[((r - NEW_SHARE / 2) / (NEW_SHARE / 2) * (n - 1)) | 0](ri, rng);
  }

  const NEW_SHARE = 0.3;
  // O11..O14 (MERGED-SPEC §4.2 rain tiers). Rejection loops are bounded and only consume rng.
  const NEW_OPS = [
    // O11 carry / borrow in the units column, two-digit operands (B carryBias, R:cognitive).
    (ri, rng) => {
      if (rng() < 0.5) {
        let a = 0, b = 0;
        for (let k = 0; k < 40; k++) { a = ri(12, 98); b = ri(12, 98); if (a % 10 + b % 10 >= 10) break; }
        return [`${a} + ${b}`, a + b, { op: 'add', a, b }];
      }
      let a = 0, b = 0;
      for (let k = 0; k < 40; k++) { a = ri(31, 199); b = ri(12, Math.min(99, a - 2)); if (a % 10 < b % 10) break; }
      return [`${a} − ${b}`, a - b, { op: 'sub', a, b }];
    },
    // O12 missing number: ? + b = c (c ≤ 100) or ? × b = c (tables 2–9) (A = B).
    (ri, rng) => {
      if (rng() < 0.5) { const a = ri(2, 60), b = ri(2, 40); return [`? + ${b} = ${a + b}`, a, { op: 'miss+', a, b }]; }
      const a = ri(2, 9), b = ri(2, 9);
      return [`? × ${b} = ${a * b}`, a, { op: 'miss×', a, b }];
    },
    // O13 two steps: a × b ± c, a and b 2–9, c ≤ 20, never negative (B; A had a + b − c).
    (ri, rng) => {
      const a = ri(2, 9), b = ri(2, 9), c = ri(1, 20);
      const minus = rng() < 0.5 && c < a * b;
      return minus ? [`${a} × ${b} − ${c}`, a * b - c, { op: 'two-', a, b, c }] : [`${a} × ${b} + ${c}`, a * b + c, { op: 'two+', a, b, c }];
    },
    // O14 two-digit × one-digit: 11–25 × 2–9, answer ≤ 225 (A).
    (ri, rng) => {
      const a = ri(11, 25), b = ri(2, 9);
      return rng() < 0.5 ? [`${a} × ${b}`, a * b, { op: 'mul21', a, b }] : [`${b} × ${a}`, a * b, { op: 'mul21', a, b }];
    },
  ];

  // Bounded shared Sun drop & Twin multi-clear helpers (Track 2: M-OPT-RISK-RAIN-SUN + M-KISHO-RAIN-MULTICLEAR).
  // Kept here so js/rain.js and scripts/sim/adapters/rain.mjs run the exact same rules.
  const SUN_P = 0.15, TWIN_P = 0.15;
  const sunCap = (ops, target) => (ops >= 6 ? (target >= 22 ? 2 : 1) : 0);
  function makeTwinEq(ops, targetAns, avoidEq, rng) {
    const ri = (a, b) => a + (rng() * (b - a + 1) | 0);
    const cands = [];
    const addC = (eq, meta) => { if (eq !== avoidEq && !cands.some(x => x[0] === eq)) cands.push([eq, targetAns, meta]); };
    if (ops === 6 || ops === 7 || ops === 8) {
      const aMax = ops === 6 ? 5 : 9, bMax = ops === 6 ? 10 : 9;
      for (let a = 2; a <= aMax; a++) {
        if (targetAns % a !== 0) continue;
        const b = targetAns / a;
        if (b >= 1 && b <= bMax) {
          addC(`${a} × ${b}`, { op: 'mul', a, b });
          addC(`${b} × ${a}`, { op: 'mul', a, b });
        }
      }
      if (ops === 8 && targetAns >= 1 && targetAns <= 9) {
        for (let b = 2; b <= 9; b++) addC(`${b * targetAns} ÷ ${b}`, { op: 'div', a: b * targetAns, b });
      }
    } else if (ops >= 9) {
      const maxSum = ops === 9 ? 100 : 200;
      if (targetAns >= 4 && targetAns <= maxSum) {
        const lo = targetAns > 20 ? 11 : 2, hi = targetAns - lo;
        if (hi >= lo) { const a = ri(lo, hi), b = targetAns - a; addC(`${a} + ${b}`, { op: 'add', a, b }); }
      }
      if (targetAns >= 2 && targetAns <= maxSum - 12) {
        const b = ri(11, Math.min(maxSum - targetAns, 95)), a = targetAns + b;
        addC(`${a} − ${b}`, { op: 'sub', a, b });
      }
      const mMax = ops === 9 ? 9 : 12;
      for (let a = 2; a <= mMax; a++) {
        if (targetAns % a !== 0) continue;
        const b = targetAns / a;
        if (b >= 2 && b <= mMax) { addC(`${a} × ${b}`, { op: 'mul', a, b }); break; }
      }
      if (targetAns >= 2 && targetAns <= mMax) {
        const b = ri(2, mMax);
        addC(`${b * targetAns} ÷ ${b}`, { op: 'div', a: b * targetAns, b });
      }
    }
    return cands.length ? cands[(rng() * cands.length) | 0] : null;
  }

  // Menu / result copy per tier. 1..10 are the old LVINFO names, unchanged.
  const TIER_NAME = [null,
    'Cộng trong phạm vi 10', 'Cộng, trừ trong phạm vi 10', 'Cộng, trừ trong phạm vi 20',
    'Cộng, trừ trong phạm vi 50', 'Cộng, trừ trong phạm vi 100', 'Bảng nhân 2–5', 'Bảng nhân 2–9',
    'Nhân, chia (bảng 2–9)', 'Đủ 4 phép tính', 'Đủ 4 phép tính, số lớn hơn',
    'Thêm cộng, trừ có nhớ', 'Thêm tìm số còn thiếu', 'Thêm phép tính hai bước', 'Thêm nhân số có hai chữ số'];

  // Legacy rows (table version 1, shipped before 2026-11-21): the exact old formulas, no rounding.
  // Kept as reference data for parity tests; the game plays `levels` below (E3 lifted 2026-11-21).
  const legacyLevels = [];
  for (let L = 1; L <= 10; L++) {
    legacyLevels.push({
      ops: L,
      fall: Math.max(8, 13 - 0.55 * (L - 1)),
      every: Math.max(2.7, 4.6 - 0.2 * (L - 1)),
      target: 10 + L,
    });
  }
  // HISTORY, superseded by the 2026-11-22 easy-opening block below (first peak L15, breathers 16/21/26):
  // Table version 2 (2026-11-21): one sawtooth (L1–9 steps, first peak L10, first breather L11), calibrated with
  // scripts/sim/calibrate.mjs rain --n 1200.
  // L1..6 = the old rows. L7..9 keep tiers 7–9 (Duy 2026-11-21, decision 2: content back at L7–9) and, as the same
  // decision says for B red on the easy side, are pulled toward the band with speed only: every and fall shrink
  // step by step from L7 to L10 (2.6/8.0 → 2.45/7.55 → 2.4/7.3 → 2.4/7.25), so the weak curve goes 100 → 96 → 53 →
  // 13% over L7–10 instead of 87 → 13% in one step (review 2026-11-22). B stays red at L1–9: tiers 6–8 keep a 100%
  // median even at every hardCap (fall 6.8, every 2.2, 25 drops, 3 lives) and tier 9 bottoms at ~95%; under
  // human.mjs no legal knob mix gives weak ≥ 85% (G1) with median ≤ p* + 5 on L1–5. From L10 on, a median at p*
  // leaves weak at 10–20%: that plateau is the human.mjs weak/median gap, not a table row (decision for Duy).
  // L10..30: the climb is carried by speed, the equation tier and the chain length. Breathers (11, 16, 21, 26)
  // open a new tier with the E4 safety net as knobs: a short chain (10 drops), one extra life (4) and slower rain,
  // so weak players pass ≥ 60% (gate G4). That makes them easier than p* (gate B) and than L−4 (gate G3): in rain
  // no breather can hold weak ≥ 60% with median ≤ p* + 5. Columns: ops, every (s), fall (s), target, lives.
  // Early ramp, Duy 2026-11-22 (B): steps L1–14, first peak L15, breathers 16/21/26. Rows L7–25 re-tuned:
  //  · L7–10 hold the L6 chain (16 drops, fall 10.25 s) and one slower spawn gap (3.8 s); only the math tier
  //    changes, so the weak bot stays ≥ 82% (G1) as tiers 7–10 arrive. Was 2.60/8.00 → 2.40/7.25 with a 20-drop chain.
  //  · L11 (tier 11, new) holds L10's pace; L12–14 tighten one knob a level (every 3.4 → 3.0, then fall 9.0).
  //  · L15, the first peak, is short (8 drops) rather than long: median ≈ p* 0.84. Under human.mjs no legal knob mix
  //    reaches weak ≥ 70% (G9) with median ≤ p* + 5 at tier 11 (best ≈ 40%, 5 drops at every hardCap).
  //  · L16 breather falls slower (8.60 → 9.20 s) so it stays slower than the L15 peak in both speed knobs.
  //  · L17–25 only ease `every` 0.05–0.2 s so the median sits on the new p* (B).
  //  · L17–19 climb back from the L16 breather one step at a time (chain 18 → 20 → 22, fall 8.20 → 7.85) instead of
  //    jumping from 10 to 22 drops in one level (review 2026-11-22).
  //  · Uniform add/sub pair sampling (2026-11-24): minor ease (+0.03..+0.10 s) on L20, L24, L27–29 to keep median on p*.
  //  · Sun drop + twin multi-clear (2026-11-24): retuned L15..30 & L31+ cadence slightly faster so median stays on p*.
  const TABLE = {
    7: [7, 3.80, 10.25, 16, 3], 8: [8, 3.80, 10.25, 16, 3], 9: [9, 3.80, 10.25, 16, 3],
    10: [10, 3.80, 10.25, 16, 3],
    11: [11, 3.80, 10.25, 16, 3], 12: [11, 3.40, 10.25, 16, 3], 13: [11, 3.00, 10.25, 16, 3], 14: [11, 3.00, 9.00, 16, 3], 15: [11, 2.20, 7.60, 12, 3],
    16: [12, 3.20, 9.20, 10, 4], 17: [12, 2.70, 7.80, 18, 3], 18: [12, 2.65, 7.55, 20, 3], 19: [12, 2.60, 7.45, 22, 3], 20: [12, 2.44, 7.15, 24, 3],
    21: [13, 3.20, 8.60, 10, 4], 22: [13, 2.58, 7.50, 24, 3], 23: [13, 2.56, 7.40, 25, 3], 24: [13, 2.54, 7.35, 25, 3], 25: [13, 2.42, 7.10, 25, 3],
    26: [14, 3.30, 8.80, 10, 4], 27: [14, 2.50, 7.50, 25, 3], 28: [14, 2.48, 7.40, 25, 3], 29: [14, 2.46, 7.35, 25, 3], 30: [14, 2.32, 7.02, 25, 3],
  };
  const LIVES = 3;                                           // old game: 3 misses lose on every level
  const levels = legacyLevels.slice(0, 6).map(r => ({ ...r, lives: LIVES }));
  for (let L = 7; L <= 30; L++) { const [ops, every, fall, target, lives] = TABLE[L]; levels.push({ ops, fall, every, target, lives }); }
  // register(BBD) is idempotent and exported: js/rain.js calls it again when this file ran before
  // difficulty.js, or when a second copy of difficulty.js replaced window.BBD and dropped the table.
  function register(BBD) {
    if (!BBD || typeof BBD.register !== 'function' || BBD.games().includes('rain')) return false;
    BBD.register('rain', {
      version: 2,
      maxLevel: 35,
      // Duy 2026-11-22 (A): rain waives G9 only. Reported WAIVED, never PASS; every other gate still binds.
      gateWaivers: { G9: 'Duy 2026-11-22 (A): under human.mjs the weak bot computes ~1.4x slower than the median bot, '
        + 'so at the L15 peak weak tops out near 0.65 (tier 10) while the median is already 0.97 and fails B; '
        + 'no table row holds G9 and B together. Revisit with real-player data (G7).' },
      legacyLevels,
      levels,
      // Same level numbers, same order of play: stars and rain_lv stay where they are (no mapper).
      knobs: [
        { name: 'ops', int: true, hardCap: 14, changeOn: 'breather', source: 'A+B tiers O11–O14' },
        // fall and every move as a pair: their ratio is the number of drops on screen (rain is exempt from 1-knob rule).
        // L31+ (engine, not shipped): steps start at the L29 step value (startAt: 30 = written for a 30-row table;
        // append rows and it stops applying) and `max` is the step value at L40, so steps
        // follow the slow fall of p* (~0.03 per 10 levels); `peak` below adds most of the L29 → L30 gap on top.
        { name: 'fall', start: 7.34, startAt: 30, max: 7.24, hardCap: 6.8, step: 0.01, notch: 0.5, curve: 'linear', source: 'A, cap is a guess; calibrated' },
        // 0.01 s grid on both: 0.05 s of every moves the median ~2.5 points, too coarse to follow p* level by level.
        // every reaches hardCap at L120, so BBD.exhausted(rain, 120) stops the +10 rule there.
        { name: 'every', start: 2.45, startAt: 30, max: 2.40, hardCap: 2.2, step: 0.01, notch: 0.2, curve: 'linear', source: 'A, cap is a guess; calibrated' },
        { name: 'target', int: true, max: 25, hardCap: 25, source: 'A' },
        // Misses allowed before losing. Fewer = harder (dir −1). Steps and peaks keep 3; breathers get +1 (E4 net).
        { name: 'lives', int: true, min: LIVES, max: LIVES, hardCap: LIVES, dir: -1, source: 'E4 safety net, 2026-11-21' },
        { name: 'storm', off: 0, min: 0, rule: true, unlockAt: 31, max: 0.25, hardCap: 0.25, step: 0.05, source: 'B, [E5]' },
      ],
      priority: ['every', 'fall', 'target', 'ops'],
      lighterKnobs: ['every', 'fall'],
      // Peak = every −0.13 s, fall −0.30 s on top of the step: keeps median on the p* peak dip (L35, L40, L45).
      peak: [{ knob: 'every', by: 0.13 }, { knob: 'fall', by: 0.30 }],
      // Breather = the E4 safety net, as at L16/21/26: short chain (25 → 10 drops), one extra life, slower rain.
      relief: [{ knob: 'target', by: 15 }, { knob: 'lives', by: 1 }, { knob: 'fall', by: 0.95 }, { knob: 'every', by: 0.6 }],
      meta: { table: 'js/levels/rain.js', game: 'js/rain.js', maxDrops: 5, maxAnswer: 999 },
    });
    return true;
  }

  // Bounded wave spawn gap (mean ≈ 1.02·every, CV ≈ 0.23 vs old 0.115 metronome):
  // mild burst (0.62..0.76×) never fires twice in a row and increases chance of a breather (1.35..1.68×).
  function spawnGap(every, lastBurst, rng) {
    const r = rng();
    if (r < 0.15 && !lastBurst) return { gap: every * (0.62 + rng() * 0.14), burst: true };
    if (r < (lastBurst ? 0.44 : 0.22)) return { gap: every * (1.35 + rng() * 0.33), burst: false };
    return { gap: every * (0.80 + rng() * 0.40), burst: false };
  }
  // Per-drop fall duration jitter (±8%, mean = fall) so drops drift at varied speeds.
  function dropFall(fall, rng) { return fall * (0.92 + rng() * 0.16); }

  root.BBRain = Object.freeze({ makeEq, makeTwinEq, sunCap, SUN_P, TWIN_P, spawnGap, dropFall, TIER_NAME: Object.freeze(TIER_NAME), register });
  register(root.BBD);                                        // no BBD yet: the generator alone still works
})(typeof globalThis !== 'undefined' ? globalThis : this);
