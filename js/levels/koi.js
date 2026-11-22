// Cá Koi — difficulty table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "koi".
// Table v2 (E3 lifted, Duy 2026-11-21): L1..30 written to the shared sawtooth. legacyLevels = the old
// js/koi.js params(d) curve (table v1), kept for parity tests and progress migration.
// Template: steps add a koi or speed/turn the fish up, a peak adds grey fish or a koi, a breather plays
// 12 koi (L31+: also −0.1 speed); grey fish change on peaks and breathers (L19 is the
// one old exception). Same level numbers, so stars and koi_lv2 keep their keys: no mapper needed (identity), only the version marker moves.
(function (root) {
  'use strict';
  const BBD = root.BBD;
  const legacyLevels = [];
  for (let d = 1; d <= 10; d++) {
    legacyLevels.push({
      koi: Math.min(5 + d, 15),
      cd: +Math.min(1.3 + 0.15 * d, 3.2).toFixed(2),
      decoys: d >= 3 ? Math.min(1 + ((d - 3) / 2 | 0), 4) : 0,
      spdMul: 1, turnMul: 1,
    });
  }
  // L1..30 as written rows: [koi, decoys, spdMul, turnMul, cd]. Pass rates vs p* (calibrate koi --n 2000):
  // docs/difficulty/calibration-koi.json. L1–9 are steps (Duy 2026-11-21 (1)=A): L1–4 add a koi, L5–8 speed
  // the fish up (≤ ×1.25 with a full pond), L9 turns them more. No grey fish before the first peak (L10),
  // so weak stays ≥ 85% on L1–5 (G1). L11–30 = the rows the engine plus `overrides` produced before
  // 2026-11-21, unchanged, now written out so the engine continues from L30 for L31+ (as mem and rain do).
  const ROWS = [
    [12, 0, 1, 1, 1.45], [13, 0, 1, 1, 1.6], [14, 0, 1, 1, 1.75], [15, 0, 1, 1, 1.9], [15, 0, 1.05, 1, 2.05],
    [15, 0, 1.15, 1, 2.2], [15, 0, 1.2, 1, 2.35], [15, 0, 1.25, 1, 2.5], [15, 0, 1.25, 1.1, 2.65], [15, 2, 1.25, 1.1, 2.8],
    [12, 4, 1, 1, 2.9], [12, 4, 1.05, 1, 2.95], [13, 4, 1.05, 1, 3], [13, 4, 1.1, 1, 3], [15, 4, 1.1, 1, 3],
    [12, 4, 1.15, 1, 3.05], [12, 4, 1.2, 1, 3.05], [13, 4, 1.2, 1, 3.05], [13, 5, 1.2, 1, 3.1], [14, 5, 1.2, 1, 3.1],
    [12, 5, 1.25, 1, 3.1], [12, 5, 1.3, 1, 3.15], [12, 5, 1.3, 1.1, 3.15], [12, 5, 1.35, 1.1, 3.15], [13, 5, 1.35, 1.1, 3.15],
    [12, 5, 1.3, 1.1, 3.15], [12, 5, 1.35, 1.1, 3.2], [12, 5, 1.35, 1.2, 3.2], [12, 5, 1.4, 1.2, 3.2], [13, 5, 1.4, 1.3, 3.2],
  ];
  const levels = ROWS.map(([koi, decoys, spdMul, turnMul, cd]) => ({ koi, decoys, cd, spdMul, turnMul }));
  if (BBD && BBD.register) BBD.register('koi', {
    version: 2,
    legacyLevels,
    levels,
    knobs: [
      // L31+ (engine, not shipped): it anchors to row 30, a peak, so `start` puts the steps back on the L29 step
      // values (12 koi, turning ×1.2); startAt: 30 = written for this 30-row table (append rows and it stops
      // applying). `max` is where a knob stands at L40, past it the knob climbs to hardCap.
      { name: 'koi', int: true, start: 12, startAt: 30, max: 12.3, hardCap: 15, curve: 'quad', source: 'code: koi.js params()' },
      { name: 'cd', max: 3.2, hardCap: 3.2, step: 0.05, source: 'code: koi.js:48 cap' },
      { name: 'decoys', int: true, max: 5.4, hardCap: 6, curve: 'linear', changeOn: 'breather', source: 'A, cap is a guess' },
      // Speed trades against target count (R:cognitive, Alvarez & Franconeri 2007).
      { name: 'spdMul', max: 1.42, hardCap: 1.5, step: 0.05, curve: 'linear', source: 'A, cap is a guess' },
      // +0.05 at every breather from L31 (1.25 on L31–35, 1.3 on L36–40, …, cap 1.6 at L66), so each 5-level block
      // turns the fish a little more than the one before and every peak (+0.1 on top) beats the previous one.
      // Turning barely moves the simulated pass rate (±1 point per 0.1), so it is the cheap knob for "harder".
      { name: 'turnMul', off: 1, min: 1, start: 1.2, startAt: 30, hardCap: 1.6, step: 0.05, changeOn: 'breather', source: 'A, cap is a guess' },
      { name: 'scatter', off: 0, min: 0, rule: true, unlockAt: 31, max: 0.3, hardCap: 0.3, step: 0.1, source: 'B, [E5]' },
    ],
    priority: ['cd', 'decoys', 'spdMul', 'turnMul'],
    lighterKnobs: ['spdMul', 'decoys'],
    // Generated levels: a peak adds one koi and turns the fish 0.1 more (as L30 does over L29), a breather slows
    // the fish one notch pair (−0.1, as L26 does) and keeps 12 koi. Tuned with calibrate.mjs koi --n 2000 --to 40.
    peak: [{ knob: 'koi', by: 1 }, { knob: 'turnMul', by: 0.1 }],
    relief: [{ knob: 'spdMul', by: 0.1 }],
    // Fast fish (×1.25 and up) never come with a full pond: at most 14 koi then (the L1–40 tracking limit).
    derive: r => (r.spdMul > 1.25 && r.koi > 14 ? { koi: 14 } : null),
    // Every generated peak must beat the level before it and the previous peak; the first one that cannot
    // makes BBD.exhausted('koi', L) true, so the "+10 levels" rule stops before a flat peak ships.
    strictPeaks: true,
    meta: { table: 'js/levels/koi.js', game: 'js/koi.js', hitFloor: 'a ≥ 24, b ≥ 22 px on every level (koi.js fishAt, MERGED-SPEC §4.2)' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
