// Cá Koi — difficulty table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "koi".
// Table v2 (E3 lifted, Duy 2026-11-21): L1..30 written to the shared sawtooth. legacyLevels = the old
// js/koi.js params(d) curve (table v1), kept for parity tests and progress migration.
// Template: steps add a koi or speed/turn the fish up, a peak adds grey fish or a koi, a breather plays
// 12 koi (L31+: also −0.1 speed); grey fish change only on peaks and breathers.
// Same level numbers, so stars and koi_lv2 keep their keys: no mapper needed (identity), only the version marker moves.
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
  // docs/difficulty/calibration-koi.json. Retuned 2026-11-22 for Duy's B (early ramp, first peak L15,
  // docs/difficulty/RESEARCH-EARLY-LEVELS.md). L1–14 are steps; besides the cooldown (cd) that grows a little every level, one knob moves per level: a koi is added on a level
  // that holds the pace (L3, L5, L9, L12), the next level speeds the fish up 0.05 or turns them more (L7, L13).
  // 10 koi at L1 (big fish: the pond shrinks fish only above 11), 14 by L12. L15, the first peak, brings the
  // first grey fish (2) on a shorter pond (12 koi) at the L14 pace: mild, shorter rather than denser.
  // Breathers (L16, L21) slow the fish and stop the extra turning. L20 adds a grey fish and turning; L25–30 are
  // the rows from before 2026-11-22, unchanged, so the engine still continues from L30 for L31+.
  // Early grey decoy (2026-11-24, M-KISHO-KOI-EARLY-DECOY): introduces 1 grey decoy at L7 (capped at 1 through L14)
  // while keeping L1–6 pure koi and easing L9–14 koi/pace one notch so G1 & B hold at N=2000. L15 still steps up to 2 decoys.
  const ROWS = [
    [10, 0, 1, 1, 1.45], [10, 0, 1.05, 1, 1.6], [11, 0, 1.05, 1, 1.75], [11, 0, 1.1, 1, 1.9], [12, 0, 1.1, 1, 2.05],
    [12, 0, 1.15, 1, 2.2], [12, 1, 1.15, 1, 2.35], [12, 1, 1.15, 1.05, 2.5], [12, 1, 1.2, 1.05, 2.65], [12, 1, 1.2, 1.1, 2.8],
    [12, 1, 1.25, 1.1, 2.9], [12, 1, 1.25, 1.15, 2.95], [12, 1, 1.3, 1.15, 3], [12, 1, 1.35, 1.15, 3], [12, 2, 1.35, 1.15, 3],
    [12, 2, 1.1, 1, 3.05], [12, 2, 1.2, 1, 3.05], [13, 2, 1.2, 1, 3.05], [13, 2, 1.25, 1, 3.1], [13, 3, 1.25, 1.1, 3.1],
    [12, 4, 1.15, 1, 3.1], [12, 4, 1.2, 1, 3.15], [13, 4, 1.2, 1, 3.15], [13, 4, 1.25, 1, 3.15], [13, 5, 1.35, 1.1, 3.15],  // L21 breather adds the 4th grey fish so L24→L25 is no cliff (review)
    [12, 5, 1.3, 1.1, 3.15], [12, 5, 1.35, 1.1, 3.2], [12, 5, 1.35, 1.2, 3.2], [12, 5, 1.4, 1.2, 3.2], [13, 5, 1.4, 1.3, 3.2],
  ];
  const levels = ROWS.map(([koi, decoys, spdMul, turnMul, cd]) => ({ koi, decoys, cd, spdMul, turnMul }));
  if (BBD && BBD.register) BBD.register('koi', {
    version: 2,
    maxLevel: 33,
    legacyLevels,
    levels,
    knobs: [
      // L31+ (engine, not shipped): it anchors to row 30, a peak, so `start` puts the steps back on the L29 step
      // values (12 koi, turning ×1.2); startAt: 30 = written for this 30-row table (append rows and it stops
      // applying). `max` is where a knob stands at L40, past it the knob climbs to hardCap.
      // 12.15 (was 12.3, daily 2026-11-24): leaves L1–42 bit-exact unchanged and avoids jumping koi (12→13) on the
      // same level L43 where spdMul steps to 1.45 (which failed B at L43: median 0.661 vs p* 0.715).
      { name: 'koi', int: true, start: 12, startAt: 30, max: 12.15, hardCap: 15, curve: 'quad', source: 'code: koi.js params()' },
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
