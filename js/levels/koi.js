// Cá Koi — difficulty table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "koi".
// Legacy L1..10 = js/koi.js params(d) with d = level. Frozen (E3).
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
  BBD.register('koi', {
    legacyLevels,
    knobs: [
      { name: 'koi', int: true, max: 15, hardCap: 15, source: 'code: koi.js params()' },
      { name: 'cd', max: 3.2, hardCap: 3.2, step: 0.05, source: 'code: koi.js:48 cap' },
      { name: 'decoys', int: true, max: 6, hardCap: 6, curve: 'linear', source: 'A, cap is a guess' },
      // Speed trades against target count (R:cognitive, Alvarez & Franconeri 2007), so breathers drop 3 fish.
      { name: 'spdMul', max: 1.40, hardCap: 1.5, step: 0.05, curve: 'linear', source: 'A, cap is a guess' },
      { name: 'turnMul', off: 1, min: 1, unlockAt: 26, max: 1.5, hardCap: 1.6, step: 0.1, curve: 'linear', source: 'A, cap is a guess' },
      { name: 'scatter', off: 0, min: 0, rule: true, unlockAt: 31, max: 0.3, hardCap: 0.3, step: 0.1, source: 'B, [E5]' },
    ],
    priority: ['cd', 'decoys', 'spdMul', 'turnMul'],
    lighterKnobs: ['spdMul', 'decoys'],
    relief: [{ knob: 'koi', by: 3 }],
    meta: { table: 'js/levels/koi.js', game: 'js/koi.js', warn: 'raise hit area to a ≥ 24, b ≥ 22 before L11+ (koi.js:270)' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
