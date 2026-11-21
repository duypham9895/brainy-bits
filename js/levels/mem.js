// Ô Sáng Ghi Nhớ — difficulty table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "mem".
// Legacy L1..13 = js/mem.js spec(L) exactly (t = 2+L, size by t, show = 1 + 0.3t). Frozen (E3).
(function (root) {
  'use strict';
  const BBD = root.BBD;
  const legacyLevels = [];
  for (let L = 1; L <= 13; L++) {
    const t0 = 2 + L;
    const size = t0 <= 4 ? 3 : t0 <= 7 ? 4 : t0 <= 11 ? 5 : 6;
    const t = Math.min(t0, size * size - 1);
    legacyLevels.push({ size, t, k: 0.3, disp: 0, show: +(1.0 + 0.3 * t).toFixed(2) });
  }
  BBD.register('mem', {
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
    // Authored breathers: more viewing time so the weak profile stays ≥ 60% (G4), which a fixed
    // relief step cannot give once k is low. Breathers past L30 fall back to the relief rule above.
    overrides: { 16: { t: 13, k: 0.32 }, 21: { t: 13, k: 0.32 }, 26: { t: 12, k: 0.35 } },
    derive: r => ({ show: +(1.0 + r.k * r.t).toFixed(2) }),
    meta: { rounds: 3, need: 2, staggerMs: 25, table: 'js/levels/mem.js', game: 'js/mem.js' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
