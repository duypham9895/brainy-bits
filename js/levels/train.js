// Đường Ray Tư Duy — difficulty table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "train".
// Legacy L1..11 = js/train-map.js stationsFor(L) and the old js/train.js nextSpawnDelay() base m, as the very
// same float expression (no rounding), so js/train.js plays them exactly as before. Frozen (E3).
// base = m; the real mean gap is ≈ 1.14·base because of the burst/rest mix (MERGED-SPEC A-2).
(function (root) {
  'use strict';
  const BBD = root.BBD;
  const legacyLevels = [];
  for (let L = 1; L <= 11; L++) {
    legacyLevels.push({
      stations: Math.min(4 + L, 15),
      base: Math.max(1.8, 2.6 - 0.075 * (L - 1)) * (0.75 / 0.45),
      speedF: 0.45, burstP: 0.15, twoTone: 0,
    });
  }
  if (BBD && BBD.register) BBD.register('train', {
    legacyLevels,
    knobs: [
      { name: 'stations', int: true, max: 15, hardCap: 15, source: 'code: train-map.js MAX_STATIONS' },
      { name: 'base', start: 2.78, max: 2.58, hardCap: 2.30, step: 0.01, notch: 0.22, curve: 'linear', source: 'A, cap is a guess; start/max from calibrate.mjs' },
      // Held at the legacy 0.45 through L30: in the simulator faster trains clear switches sooner, so fewer plans
      // are held at once and the round gets EASIER, not harder (calibration 2026-11-21). Reserve for L31+, recheck there.
      { name: 'speedF', unlockAt: 31, max: 0.58, hardCap: 0.58, step: 0.05, changeOn: 'breather', source: 'A, cap is a guess; held by calibrate.mjs' },
      { name: 'burstP', max: 0.28, hardCap: 0.30, step: 0.01, changeOn: 'breather', curve: 'quad', source: 'A, cap is a guess' },
      // [E5] two-colour stations (st.two already exists in train.js). Stays off while E5_KNOBS_ONLY.
      { name: 'twoTone', off: 0, min: 0, rule: true, unlockAt: 31, max: 0.45, hardCap: 0.45, step: 0.05, source: 'B, [E5]' },
    ],
    priority: ['base', 'speedF', 'burstP'],
    lighterKnobs: ['base'],
    relief: [{ knob: 'base', by: 0.22 }],
    peak: [{ knob: 'base', by: 0.16 }],
    // Overrides, each with its reason (L17 had one until 2026-11-21; removing it changed no gate):
    //  12 step    2.88: smoothing only, no gate needs it. Formula 2.78 drops the median 91 → 82 at the legacy seam
    //     and L13 (83) is then easier than L12; with 2.88 it runs 91 → 86 → 83 (N=1200, 2026-11-21).
    //  16 breather 2.80, 21 breather 2.78, 26 breather 2.84: formula relief leaves weak < 60% (G4) or median far
    //     above p* (gate B); these values keep weak ≥ 60%.
    //  22 step    2.78 = same as L21, i.e. a FLAT step (no knob changes). Not a design choice: without it G3 fails
    //     with "L26 0.828 easier than L22 0.771", because L26 has to stay easy enough for G4. G3 at L26 then
    //     passes only inside the tolerance (0.828 vs 0.820). Open question for Duy, together with gate B at L26.
    overrides: { 12: { base: 2.88 }, 16: { base: 2.8 }, 21: { base: 2.78 }, 22: { base: 2.78 }, 26: { base: 2.84 } },
    // Calibrated 2026-11-21 with scripts/sim/adapters/train.mjs, N = 1200 (docs/difficulty/calibration-train.json).
    // Known misses: gate B at L26 (median 0.83 vs p* 0.76) and G3 at legacy L11 (frozen, E3). Under this simulator, weak ≥ 60% (G4) costs a median
    // ≥ ~0.81 on a 15-station breather; L26's band ends at 0.81, so the table keeps G4 and reports B.
    meta: { table: 'js/levels/train.js', game: 'js/train.js + js/train-map.js',
      touch: 'tap target = nearest switch within max(32, TR+16) px, clipped by the nearest switch ≥ √2 cells away: ≥ 54 px at 320 px; drawn disc ≥ 44 px (A-5, js/train.js DISC_MIN_R)' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
