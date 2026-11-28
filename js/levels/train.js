// Đường Ray Tư Duy — difficulty table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "train".
// Version 2 (2026-11-21, E3 lifted): L1..30 are written out in `levels` on the shared sawtooth (L1–14 steps,
// then peak at 5k and breather at 5k+1 from L15; Duy 2026-11-22 (B): first peak L15, easier opening). `legacyLevels` = the v1 game (js/train-map.js stationsFor + js/train.js nextSpawnDelay,
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
  // Retuned 2026-11-22 for Duy's B (docs/difficulty/research-early.html): he played L1–10 and found them too hard.
  //  · L1–14 (steps, p* 0.97 → 0.90). Gates: weak ≥ 0.90 on L1–5, ≥ 0.82 on L6–10, median ≥ p* − 0.05.
  //    In the simulator the weak bot tops out near 0.93–0.95 (5% lapse per train), so the opening sits on the
  //    plateau: base 4.60 → 4.30 (the old L1–5 were 3.27–3.49, L6–9 2.81–2.93; mean gap ≈ 1.185·base).
  //    The tension comes from new stations, not from losing. One knob per level: a level that adds a station
  //    keeps the base of the level before it, and base drops 0.10 only on levels that add no station
  //    (L2, L5, L8). L4 (7 ga, 7 columns) and L11 (12 ga, 8 columns) hold base: smaller cells are the new thing.
  //    From L9 to L14 the map grows one station per level at base 4.30; L14 brings the 15th station.
  //    No station drops any more (the old L5 drop to 5 ga is gone).
  //  · L15 = first peak, mild: same 15 stations as L14, only the gap tightens (4.30 → 4.10): weak 0.75 (G9
  //    asks ≥ 0.70), median 0.85 vs p* 0.84. 4.00 gave weak 0.72, too close to the floor.
  //  · L16–22 retuned to the new p* (0.89 → 0.83, higher than the old √ curve). L23–30 and the generated L31+
  //    are unchanged: their p* barely moved (L30 = 0.75 in both curves) and every gate still passes there.
  //  · speedF 0.28 (v1: 0.45) on every level. In the simulator a faster train is easier (it clears its switches
  //    sooner); that is unverified for people, so speed stays put and the opening is eased with base only.
  //    Cost: a train needs ≈ 26 s to cross a 15-station map (max ≈ 41 s, v1 ≈ 17/26 s).
  //  · burstP 0 (v1: 0.15): "dồn dập" bursts hit weak players hardest (−9 weak points at the same median).
  //    Bursts are the reserve knob for L31+.
  //  · Rule, tested: on the same station count a non-breather never raises base over the level before it, nor
  //    over the step before it (L2 once read "tàu ra thưa hơn" after L1, review 2026-11-22).
  //  · base from L16: peak = step − ~0.30, breather = step + ~0.15 (sparser trains, fewer plans held at once).
  // Retuned 2026-11-24 (PR 3): wave pacing restored from L5+ (`burstP` 0.08 → 0.20, derived `speedVar` ±8–14%),
  // slightly livelier base `speedF` 0.32 (compensated by `base` so all v2 calibration gates remain green at N=1200).
  const STATIONS = [
    5, 5, 6, 7, 7,  8, 9, 9, 10, 11,  12, 13, 14, 15, 15,   // L1–15
  ];
  const BASE = [
    4.60, 4.50, 4.50, 4.50, 4.40,     // L1–5
    4.40, 4.40, 4.30, 4.30, 4.30,     // L6–10
    4.30, 4.30, 4.30, 4.30, 3.68,     // L11–15 (L15 = first peak)
    3.98, 3.82, 3.74, 3.66, 3.30,     // L16–20 (L16 breather, L20 peak)
    3.62, 3.46, 3.40, 3.35, 3.11,     // L21–25 (L21 breather, L25 peak)
    3.48, 3.34, 3.28, 3.24, 3.22,     // L26–30 (L26 breather, L30 step trend 3.22; played peak in overrides)
  ];
  const BURST = [
    0,    0,    0,    0,    0.08,     // L1–5 (calm L1–4 intro; wave bursts start L5)
    0.08, 0.08, 0.12, 0.12, 0.12,     // L6–10
    0.12, 0.14, 0.14, 0.14, 0.16,     // L11–15
    0.14, 0.16, 0.16, 0.16, 0.18,     // L16–20
    0.16, 0.18, 0.18, 0.18, 0.18,     // L21–25
    0.16, 0.18, 0.18, 0.18, 0.18,     // L26–30 (L30 override = 0.20)
  ];
  const stationsAt = L => (L <= STATIONS.length ? STATIONS[L - 1] : 15);
  const levels = BASE.map((base, i) => ({ stations: stationsAt(i + 1), base, speedF: 0.32, burstP: BURST[i] }));

  if (BBD && BBD.register) BBD.register('train', {
    version: 2,          // v1 = legacy 11 levels + generated 12..30. Level numbers keep their meaning, so the
                         // default migration (keep best and stars as they are) is the right one: no `migrate`.
    maxLevel: 37,
    legacyLevels,
    levels,
    knobs: [
      { name: 'stations', int: true, max: 15, hardCap: 15, source: 'code: train-map.js MAX_STATIONS' },
      { name: 'base', max: 3.12, hardCap: 2.32, step: 0.01, notch: 0.22, curve: 'linear', source: 'A, cap is a guess; v2 rows from calibrate.mjs' },
      { name: 'speedF', dir: -1, hardCap: 0.32, source: 'held; calibrate.mjs 2026-11-24' },
      { name: 'burstP', max: 0.20, hardCap: 0.30, step: 0.01, changeOn: 'breather', curve: 'linear', source: 'A, cap is a guess; wave pacing from L5+' },
      // [E5] two-colour stations (st.two already exists in train.js). Stays off while E5_KNOBS_ONLY.
      { name: 'twoTone', off: 0, min: 0, rule: true, unlockAt: 31, max: 0.45, hardCap: 0.45, step: 0.05, source: 'B, [E5]' },
    ],
    priority: ['base', 'burstP'],
    lighterKnobs: ['base'],
    relief: [{ knob: 'base', by: 0.35 }],
    // 0.14 (was 0.20, daily 2026-11-26): L35 is the first generated peak, so L1–34 stay bit-exact unchanged;
    // keeps L35 right on p* (0.676 vs 0.676) and keeps CI peak L45 inside gate B (0.611 vs p* 0.651).
    peak: [{ knob: 'base', by: 0.14 }],
    // L30 is a peak: played at 2.98 / burstP 0.20, while its `levels` row keeps the step trend 3.22 so L31+
    // continues from the trend, not from a peak (a peak anchor would make L32 harder than L30).
    overrides: { 30: { base: 2.98, burstP: 0.20 } },
    derive: r => ({ speedVar: r.legacy ? 0 : (r.burstP > 0 ? +(Math.min(0.14, 0.06 + r.burstP * 0.4)).toFixed(2) : 0) }),
    // Full N (1200), 2026-11-28: every gate green on L1–37 and on generated L38–47; G7 SKIP. No gate waivers.
    meta: { table: 'js/levels/train.js', game: 'js/train.js + js/train-map.js',
      touch: 'tap target = nearest switch within max(32, TR+16) px, clipped by the nearest switch ≥ √2 cells away: ≥ 54 px at 320 px; drawn disc ≥ 44 px (A-5, js/train.js DISC_MIN_R)' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
