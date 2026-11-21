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
  if (BBD && BBD.register) BBD.register('koi', {
    legacyLevels,
    knobs: [
      { name: 'koi', int: true, max: 15, hardCap: 15, source: 'code: koi.js params()' },
      { name: 'cd', max: 3.2, hardCap: 3.2, step: 0.05, source: 'code: koi.js:48 cap' },
      { name: 'decoys', int: true, max: 5, hardCap: 6, curve: 'linear', changeOn: 'breather', source: 'A, cap is a guess' },
      // Speed trades against target count (R:cognitive, Alvarez & Franconeri 2007), so breathers drop 3 fish.
      { name: 'spdMul', max: 1.4, hardCap: 1.5, step: 0.05, curve: 'linear', source: 'A, cap is a guess' },
      { name: 'turnMul', off: 1, min: 1, unlockAt: 26, max: 1.3, hardCap: 1.6, step: 0.1, curve: 'linear', source: 'A, cap is a guess' },
      { name: 'scatter', off: 0, min: 0, rule: true, unlockAt: 31, max: 0.3, hardCap: 0.3, step: 0.1, source: 'B, [E5]' },
    ],
    priority: ['cd', 'decoys', 'spdMul', 'turnMul'],
    lighterKnobs: ['spdMul', 'decoys'],
    relief: [{ knob: 'koi', by: 3 }],
    // Every new step changes something the player can see on the menu and in the pond: fish count ±1,
    // fish speed +0.05 or heading changes (review 2026-11-21: a +0.05 s wait alone is not felt).
    // Breathers take the relief rule above (15 − 3 = 12). Speed rises, so fish count climbs back slowly
    // (MERGED-SPEC §4.2 koi table). Values tuned with scripts/sim/calibrate.mjs koi --n 2000.
    overrides: {
      11: { spdMul: 1 }, 12: { koi: 12, spdMul: 1.05 }, 13: { koi: 13, spdMul: 1.05 }, 14: { koi: 13, spdMul: 1.1 }, 15: { koi: 15, spdMul: 1.1 },
      16: { spdMul: 1.15 }, 17: { koi: 12, spdMul: 1.2 }, 18: { koi: 13, spdMul: 1.2 }, 19: { koi: 13, spdMul: 1.2, decoys: 5 }, 20: { koi: 14, spdMul: 1.2, decoys: 5 },
      21: { spdMul: 1.25 }, 22: { koi: 12, spdMul: 1.3 }, 23: { koi: 12, spdMul: 1.3, turnMul: 1.1 }, 24: { koi: 12, spdMul: 1.35, turnMul: 1.1 }, 25: { koi: 13, spdMul: 1.35, turnMul: 1.1 },
      26: { spdMul: 1.3, turnMul: 1.1 }, 27: { koi: 12, spdMul: 1.35, turnMul: 1.1 }, 28: { koi: 12, spdMul: 1.35, turnMul: 1.2 }, 29: { koi: 12, spdMul: 1.4, turnMul: 1.2 },
      30: { koi: 13, spdMul: 1.4, turnMul: 1.3 },
    },
    meta: { table: 'js/levels/koi.js', game: 'js/koi.js', hitFloor: 'a ≥ 24, b ≥ 22 px on every level (koi.js fishAt, MERGED-SPEC §4.2)' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
