// Ô Sáng Ghi Nhớ — difficulty table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "mem".
// Legacy L1..13 = js/mem.js spec(L) exactly (t = 2+L, size by t, show = 1 + 0.3t). Frozen (E3).
(function (root) {
  'use strict';
  const BBD = root.BBD;

  // Pure tile picker shared by js/mem.js and scripts/sim/adapters/mem.mjs (no DOM; rnd is injected).
  // disp = 0 is the legacy partial Fisher–Yates of js/mem.js, call for call: same rnd() sequence, same tiles.
  // disp > 0: with chance disp the next tile comes only from cells touching no lit tile yet (B, blocks chunking).
  const adjacent = (a, b, size) =>
    a !== b && Math.abs(((a / size) | 0) - ((b / size) | 0)) <= 1 && Math.abs((a % size) - (b % size)) <= 1;
  function pickTargets(size, t, disp, rnd) {
    const cells = Array.from({ length: size * size }, (_, i) => i);
    for (let k = 0; k < t; k++) {
      let j = -1;
      if (disp > 0 && rnd() < disp) {
        const apart = [];
        for (let x = k; x < cells.length; x++) if (!cells.slice(0, k).some(c => adjacent(cells[x], c, size))) apart.push(x);
        if (apart.length) j = apart[Math.floor(rnd() * apart.length)];
      }
      if (j < 0) j = k + Math.floor(rnd() * (cells.length - k));
      [cells[k], cells[j]] = [cells[j], cells[k]];
    }
    return cells.slice(0, t);
  }
  const legacyLevels = [];
  for (let L = 1; L <= 13; L++) {
    const t0 = 2 + L;
    const size = t0 <= 4 ? 3 : t0 <= 7 ? 4 : t0 <= 11 ? 5 : 6;
    const t = Math.min(t0, size * size - 1);
    // show unrounded, bit-for-bit the old js/mem.js value (toFixed(2) gave 3.7 instead of 3.6999… at L7).
    legacyLevels.push({ size, t, k: 0.3, disp: 0, show: 1.0 + 0.3 * t });
  }
  if (BBD && BBD.register) BBD.register('mem', {
    legacyLevels,
    knobs: [
      // t stays at the legacy L13 value (R:cognitive advises ≤10–12; legacy already sits at 15). Breathers drop 2.
      { name: 't', int: true, max: 15, hardCap: 15, source: 'MERGED-SPEC §4.2 mem; R:cognitive (Luck & Vogel 1997, Cowan 2001)' },
      { name: 'size', int: true, max: 6, hardCap: 6, source: 'A=B: size ≤ 6 keeps tiles ≥ 44 px at 320 px (css/mem.css)' },
      // k = seconds of viewing per tile; show = 1 + k·t. Floor 0.18 is a guess (A), to be fit from playtest.
      // start 0.25: above ~0.25 s/tile viewing time stops limiting the median player (calibration 2026-11-21).
      { name: 'k', start: 0.25, max: 0.23, hardCap: 0.18, step: 0.005, notch: 0.02, curve: 'linear', source: 'A, floor unsourced; values from calibrate.mjs' },
      // disp = chance a lit tile is forced non-adjacent to the others (blocks chunking). Unlocks on breather 16 (B).
      { name: 'disp', off: 0, min: 0, unlockAt: 16, max: 0.30, hardCap: 0.50, step: 0.05, curve: 'linear', source: 'B, R:simulation chunking' },
    ],
    priority: ['t', 'k', 'disp'],
    lighterKnobs: ['t', 'k'],
    relief: [{ knob: 't', by: 2 }],
    peak: [{ knob: 'k', by: 0.02 }],
    // Step overrides (14, 18, 19, 24, 29): every step level gets less viewing time. L14 at 0.26 splits the
    // L13→L14 drop (5.5 → 4.9 s); disp alone barely changes chunk load in the sim (2.73 → 2.74 at t=15), so a
    // disp-only step is not a real step.
    // Authored breathers: more viewing time so the weak profile stays ≥ 60% (G4), which a fixed
    // relief step cannot give once k is low. Breathers past L30 fall back to the relief rule above.
    overrides: { 14: { k: 0.26 }, 16: { t: 13, k: 0.32 }, 18: { k: 0.24 }, 19: { k: 0.235 }, 21: { t: 13, k: 0.32 },
      24: { k: 0.23 }, 26: { t: 12, k: 0.35 }, 29: { k: 0.225 } },
    derive: r => ({ show: +(1.0 + r.k * r.t).toFixed(2) }),
    meta: { rounds: 3, need: 2, staggerMs: 25, table: 'js/levels/mem.js', game: 'js/mem.js',
      gen: Object.freeze({ pickTargets, adjacent }) },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
