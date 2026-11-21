// Mưa Phép Tính — difficulty table + pure equation generator. Load after js/difficulty.js, before js/rain.js.
// Spec: MERGED-SPEC §4.2 "rain". Legacy L1..10 = the old js/rain.js spec(L), unrounded, frozen (E3).
// ops = equation tier: 1..9 = the old makeEq `case L`, 10 = its default branch, 11..14 = O11..O14 below.
// The generator is shared by the game (rng = Math.random) and the simulator (seeded rng): window.BBRain.
(function (root) {
  'use strict';

  // ---------- equations: makeEq(tier, rng) -> [text, answer, meta] ----------
  // Tiers 1..10 keep the exact draw order of the old js/rain.js makeEq, so the game sees the same
  // distribution as before. meta describes the problem for the simulator's cost model only.
  function makeEq(tier, rng) {
    const ri = (a, b) => a + (rng() * (b - a + 1) | 0);
    const add = m => { const a = ri(1, m - 1), b = ri(1, m - a); return [`${a} + ${b}`, a + b, { op: 'add', a, b }]; };
    const sub = m => { const a = ri(2, m), b = ri(1, a); return [`${a} − ${b}`, a - b, { op: 'sub', a, b }]; };
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

  // Menu / result copy per tier. 1..10 are the old LVINFO names, unchanged.
  const TIER_NAME = [null,
    'Cộng trong phạm vi 10', 'Cộng, trừ trong phạm vi 10', 'Cộng, trừ trong phạm vi 20',
    'Cộng, trừ trong phạm vi 50', 'Cộng, trừ trong phạm vi 100', 'Bảng nhân 2–5', 'Bảng nhân 2–9',
    'Nhân, chia (bảng 2–9)', 'Đủ 4 phép tính', 'Đủ 4 phép tính, số lớn hơn',
    'Thêm cộng, trừ có nhớ', 'Thêm tìm số còn thiếu', 'Thêm phép tính hai bước', 'Thêm nhân số có hai chữ số'];

  // Legacy rows: the exact old formulas (no rounding), so BBD.level('rain', L) === old spec(L) bit for bit.
  const legacyLevels = [];
  for (let L = 1; L <= 10; L++) {
    legacyLevels.push({
      ops: L,
      fall: Math.max(8, 13 - 0.55 * (L - 1)),
      every: Math.max(2.7, 4.6 - 0.2 * (L - 1)),
      target: 10 + L,
    });
  }
  // L11..L30, calibrated with scripts/sim/calibrate.mjs rain (2026-11-21, adapter rain.mjs).
  // The O11..O14 tiers carry most of the climb, so the rain itself speeds up only a little: the old L10
  // already runs at 2.8 s per drop, and the simulated median player has little speed left past it.
  // Each block = breather (new tier, slower rain) → 3 steps → peak. Columns: every (s), fall (s), target.
  const TABLE = {
    11: [2.95, 8.50, 20], 12: [2.80, 8.10, 21], 13: [2.80, 8.05, 21], 14: [2.75, 8.05, 22], 15: [2.65, 7.85, 22],
    16: [2.70, 8.00, 22], 17: [2.65, 7.85, 23], 18: [2.60, 7.85, 23], 19: [2.60, 7.80, 23], 20: [2.55, 7.60, 24],
    21: [2.70, 8.10, 24], 22: [2.65, 8.05, 25], 23: [2.65, 8.00, 25], 24: [2.65, 7.95, 25], 25: [2.55, 7.70, 25],
    26: [2.65, 8.15, 25], 27: [2.60, 8.05, 25], 28: [2.60, 8.00, 25], 29: [2.60, 7.95, 25], 30: [2.55, 7.90, 25],
  };
  const overrides = {};
  Object.keys(TABLE).forEach(L => { const [every, fall, target] = TABLE[L]; overrides[L] = { every, fall, target }; });
  const L30 = TABLE[30];
  // register(BBD) is idempotent and exported: js/rain.js calls it again when this file ran before
  // difficulty.js, or when a second copy of difficulty.js replaced window.BBD and dropped the table.
  function register(BBD) {
    if (!BBD || typeof BBD.register !== 'function' || BBD.games().includes('rain')) return false;
    BBD.register('rain', {
      legacyLevels,
      overrides,
      knobs: [
        { name: 'ops', int: true, hardCap: 14, changeOn: 'breather', source: 'A+B tiers O11–O14' },
        // fall and every move as a pair: their ratio is the number of drops on screen (rain is exempt from 1-knob rule).
        // max = the calibrated L30 value, so L31+ (engine, not shipped) continues from L30 and reaches hardCap by L120.
        // fall `start` only shapes that continuation: every shipped level 11..30 comes from TABLE.
        { name: 'fall', start: 8.6, max: L30[1], hardCap: 6.8, step: 0.05, notch: 0.5, curve: 'linear', source: 'A, cap is a guess; calibrated' },
        { name: 'every', max: L30[0], hardCap: 2.2, step: 0.05, notch: 0.2, curve: 'linear', source: 'A, cap is a guess; calibrated' },
        { name: 'target', int: true, max: 25, hardCap: 25, source: 'A' },
        { name: 'storm', off: 0, min: 0, rule: true, unlockAt: 31, max: 0.25, hardCap: 0.25, step: 0.05, source: 'B, [E5]' },
      ],
      priority: ['every', 'fall', 'target', 'ops'],
      lighterKnobs: ['every', 'fall'],
      relief: [{ knob: 'fall', by: 0.5 }, { knob: 'every', by: 0.2 }],
      meta: { table: 'js/levels/rain.js', game: 'js/rain.js', maxDrops: 5, maxAnswer: 999 },
    });
    return true;
  }

  root.BBRain = Object.freeze({ makeEq, TIER_NAME: Object.freeze(TIER_NAME), register });
  register(root.BBD);                                        // no BBD yet: the generator alone still works
})(typeof globalThis !== 'undefined' ? globalThis : this);
