// Đường Ray Tư Duy — difficulty table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "train".
// Version 2 (2026-11-21, E3 lifted): L1..30 are written out in `levels` on the shared sawtooth (peak at 5k,
// breather at 5k+1). `legacyLevels` = the v1 game (js/train-map.js stationsFor + js/train.js nextSpawnDelay,
// same float expression), kept as reference data for tests and E3_FREEZE_LEGACY = true.
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

  // v2 rows. Calibrated with scripts/sim/adapters/train.mjs at N = 1200 (docs/difficulty/calibration-train.json).
  //  · stations: 5,5,6,6,6,6 then +1 per level from L7 to 15 at L15. Only one breather adds a station (L11,
  //    11 ga), and it pays for it with a much wider train gap (base 3.12 vs 2.63 at the L10 peak).
  //    L1–6 stay small because gate G1 asks weak ≥ 85% on L1–5 with the median ≤ p* + 0.05: the weak/median
  //    gap is narrowest on 5–6 stations (7–10 stations widen it by 5–10 points in the simulator).
  //    L3–4 sit at both edges at once (median 0.92/0.91 vs cap 0.925/0.915, weak 0.86/0.85): +0.03 base on L4
  //    breaks B (median 0.917), so only L2 got the extra margin (3.38 → 3.46, weak 0.87 → 0.90).
  //  · speedF 0.28 (v1: 0.45) on every level. In the simulator slower trains narrow the weak/median gap at the
  //    same median pass rate (more time per train, so the slow-RT tail costs less): at 0.45, G1 fails on
  //    L2–4 and G4 (weak ≥ 60% on breathers) on L16/21/26; at 0.28 both pass. Cost: a train needs ≈ 26 s
  //    to cross a 15-station map (max ≈ 41 s, v1 ≈ 17/26 s), so the wait after the 90 s timer is longer.
  //  · burstP 0 (v1: 0.15): "dồn dập" bursts hit weak players hardest (−9 weak points at the same median).
  //    Bursts are the reserve knob for L31+.
  //  · base: the difficulty knob. Peak = step − ~0.23, breather = step + ~0.12 (the breather cuts the chain:
  //    sparser trains, fewer plans held at once). Steps on 15 stations barely move (3.60 → 3.51) because
  //    p* itself only falls 79% → 75% between L17 and L29.
  const STATIONS = L => (L <= 2 ? 5 : L <= 6 ? 6 : Math.min(L, 15));
  const BASE = [
    3.41, 3.46, 3.49, 3.43, 2.85,     // L1–5   (L5 peak)
    2.91, 2.93, 2.88, 2.81, 2.63,     // L6–10  (L6 breather, L10 peak)
    3.12, 3.30, 3.26, 3.40, 3.49,     // L11–15
    3.70, 3.60, 3.59, 3.58, 3.36,     // L16–20
    3.67, 3.56, 3.55, 3.54, 3.31,     // L21–25
    3.63, 3.53, 3.52, 3.51, 3.50,     // L26–30 (L30 row = step trend; the played peak is in `overrides`)
  ];
  const levels = BASE.map((base, i) => ({ stations: STATIONS(i + 1), base, speedF: 0.28, burstP: 0 }));

  if (BBD && BBD.register) BBD.register('train', {
    version: 2,          // v1 = legacy 11 levels + generated 12..30. Level numbers keep their meaning, so the
                         // default migration (keep best and stars as they are) is the right one: no `migrate`.
    legacyLevels,
    levels,
    knobs: [
      { name: 'stations', int: true, max: 15, hardCap: 15, source: 'code: train-map.js MAX_STATIONS' },
      // L31+: from the L30 trend (3.50) down 0.20 by L40 (0.02 per level), reaching hardCap 2.30 at L90, so the
      // table runs out of knobs by L120 and the "+10 levels" rule stops there; cap is a guess.
      { name: 'base', max: 3.30, hardCap: 2.30, step: 0.01, notch: 0.22, curve: 'linear', source: 'A, cap is a guess; v2 rows from calibrate.mjs' },
      // Held at 0.28. In the simulator a FASTER train is easier (it clears its switches sooner), so speed is
      // not a "harder" knob here; recheck in playtest before moving it.
      { name: 'speedF', dir: -1, hardCap: 0.28, source: 'held; calibrate.mjs 2026-11-21' },
      { name: 'burstP', max: 0.10, hardCap: 0.30, step: 0.01, changeOn: 'breather', curve: 'quad', source: 'A, cap is a guess; reserve for L31+' },
      // [E5] two-colour stations (st.two already exists in train.js). Stays off while E5_KNOBS_ONLY.
      { name: 'twoTone', off: 0, min: 0, rule: true, unlockAt: 31, max: 0.45, hardCap: 0.45, step: 0.05, source: 'B, [E5]' },
    ],
    priority: ['base', 'burstP'],
    lighterKnobs: ['base'],
    relief: [{ knob: 'base', by: 0.10 }],
    peak: [{ knob: 'base', by: 0.20 }],
    // L30 is a peak: played at 3.27, while its `levels` row keeps the step trend 3.50 so the formula for L31+
    // continues from the trend, not from a peak (a peak anchor would make L32 harder than L30).
    overrides: { 30: { base: 3.27 } },
    // Known miss at full N: G1 at L5 (weak < 85%). p*(5) = 0.797 caps the median at 0.847 (gate B) while G1
    // asks weak ≥ 0.85, and weak never beats median. Same as every game; waiting for Duy (options a/b/c).
    meta: { table: 'js/levels/train.js', game: 'js/train.js + js/train-map.js',
      touch: 'tap target = nearest switch within max(32, TR+16) px, clipped by the nearest switch ≥ √2 cells away: ≥ 54 px at 320 px; drawn disc ≥ 44 px (A-5, js/train.js DISC_MIN_R)' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
