// Đường Ray Tư Duy — difficulty table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "train".
// Version 2 (2026-11-21, E3 lifted): L1..30 are written out in `levels` on the shared sawtooth (L1–9 steps,
// then peak at 5k and breather at 5k+1 from L10; Duy 2026-11-21 (1): no peak at L5). `legacyLevels` = the v1 game (js/train-map.js stationsFor + js/train.js nextSpawnDelay,
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
  //  · stations: 5,5,6,6,5,6 then +1 per level from L7 to 15 at L15. Only one breather adds a station (L11,
  //    11 ga), and it pays for it with a much wider train gap (base 3.12 vs 2.63 at the L10 peak).
  //    L1–6 stay small because gate G1 asks weak ≥ 85% on L1–5 with the median ≤ p* + 0.05: the weak/median
  //    gap is narrowest on 5–6 stations (7–10 stations widen it by 5–10 points in the simulator).
  //    Every L1–5 row sits at both edges at once (weak 0.85–0.87, median 0.90–0.92 vs cap 0.907–0.925).
  //    L5 (a step since 2026-11-21, p* 0.857, median cap 0.907) has no passing base on 6 stations: the
  //    full scan 3.28–3.45 gives weak 0.84–0.85 only with median ≥ 0.915, and speedF 0.30–0.45 is worse.
  //    On 5 stations base 3.27 gives weak 0.86, median 0.90. So L5 drops to 5 stations and pays with denser
  //    trains (3.27 vs 3.43 at L4): the only station drop in the table, and it never drops on both knobs.
  //    L3 and L4 on 5 stations have no passing base either (scanned 3.15–3.33), so they stay on 6.
  //  · speedF 0.28 (v1: 0.45) on every level. In the simulator slower trains narrow the weak/median gap at the
  //    same median pass rate (more time per train, so the slow-RT tail costs less): at 0.45, G1 fails on
  //    L2–4 and G4 (weak ≥ 60% on breathers) on L16/21/26; at 0.28 both pass. Cost: a train needs ≈ 26 s
  //    to cross a 15-station map (max ≈ 41 s, v1 ≈ 17/26 s), so the wait after the 90 s timer is longer.
  //  · burstP 0 (v1: 0.15): "dồn dập" bursts hit weak players hardest (−9 weak points at the same median).
  //    Bursts are the reserve knob for L31+.
  //  · base: the difficulty knob. Peak = step − ~0.23, breather = step + ~0.12 (the breather cuts the chain:
  //    sparser trains, fewer plans held at once). Steps on 15 stations barely move (3.60 → 3.51) because
  //    p* itself only falls 79% → 75% between L17 and L29.
  const STATIONS = L => (L <= 2 || L === 5 ? 5 : L <= 6 ? 6 : Math.min(L, 15));
  const BASE = [
    3.41, 3.46, 3.49, 3.43, 3.27,     // L1–5   (all steps since 2026-11-21; L5 on 5 stations, see above)
    2.91, 2.93, 2.88, 2.81, 2.63,     // L6–10  (L10 = first peak)
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
      // L31+: from the L30 trend (3.50) down 0.14 by L40 (0.014 per level; p* falls only 0.003 per level there),
      // reaching hardCap 2.30 at L116, so the table is exhausted before L120 and the "+10 levels" rule stops;
      // cap is a guess. max 3.30 (0.02/level) failed B at L40 (median 0.605 vs p* 0.663) in the 2026-11-21
      // L31–40 run; 3.36 passes every gate on L31–40 at N = 1200 (L40 median 0.64).
      { name: 'base', max: 3.36, hardCap: 2.30, step: 0.01, notch: 0.22, curve: 'linear', source: 'A, cap is a guess; v2 rows from calibrate.mjs' },
      // Held at 0.28. In the simulator a FASTER train is easier (it clears its switches sooner), so speed is
      // not a "harder" knob here; recheck in playtest before moving it.
      { name: 'speedF', dir: -1, hardCap: 0.28, source: 'held; calibrate.mjs 2026-11-21' },
      // From L36 (first generated breather after L31): 0.02 at L36, 0.06 at L41. max 0.10 gave 0.04 at L36 and
      // weak 0.58 there (G4); 0.05 keeps weak ≥ 0.60 on L36.
      { name: 'burstP', max: 0.05, hardCap: 0.30, step: 0.01, changeOn: 'breather', curve: 'quad', source: 'A, cap is a guess; reserve for L31+' },
      // [E5] two-colour stations (st.two already exists in train.js). Stays off while E5_KNOBS_ONLY.
      { name: 'twoTone', off: 0, min: 0, rule: true, unlockAt: 31, max: 0.45, hardCap: 0.45, step: 0.05, source: 'B, [E5]' },
    ],
    priority: ['base', 'burstP'],
    lighterKnobs: ['base'],
    // Generated breathers only (L1–30 rows are written out). With the old base slope, 0.10 made L36 too easy
    // for G3 (median 0.777 vs L32 0.734 + tolerance). 0.08 lands L36 at base 3.50 + burstP 0.02: median 0.77,
    // weak 0.61 (G4 ≥ 0.60). Thin on both sides.
    relief: [{ knob: 'base', by: 0.08 }],
    peak: [{ knob: 'base', by: 0.20 }],
    // L30 is a peak: played at 3.27, while its `levels` row keeps the step trend 3.50 so the formula for L31+
    // continues from the trend, not from a peak (a peak anchor would make L32 harder than L30).
    overrides: { 30: { base: 3.27 } },
    // Full N (1200), 2026-11-21: every gate green on L1–30 and on generated L31–40; G7 SKIP. No gate waivers.
    meta: { table: 'js/levels/train.js', game: 'js/train.js + js/train-map.js',
      touch: 'tap target = nearest switch within max(32, TR+16) px, clipped by the nearest switch ≥ √2 cells away: ≥ 54 px at 320 px; drawn disc ≥ 44 px (A-5, js/train.js DISC_MIN_R)' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
