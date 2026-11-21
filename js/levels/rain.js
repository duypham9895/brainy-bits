// Mưa Phép Tính — difficulty table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "rain".
// Legacy L1..10 = js/rain.js spec(L); ops = makeEq tier (1..9 = case L, 10 = default branch). Frozen (E3).
// Tiers 11..14 = O11..O14 in MERGED-SPEC (carry, missing number, two-step, 2-digit × 1-digit); 30% of drops.
(function (root) {
  'use strict';
  const BBD = root.BBD;
  const legacyLevels = [];
  for (let L = 1; L <= 10; L++) {
    legacyLevels.push({
      ops: L,
      fall: +Math.max(8, 13 - 0.55 * (L - 1)).toFixed(2),
      every: +Math.max(2.7, 4.6 - 0.2 * (L - 1)).toFixed(2),
      target: 10 + L,
    });
  }
  BBD.register('rain', {
    legacyLevels,
    knobs: [
      { name: 'ops', int: true, hardCap: 14, changeOn: 'breather', source: 'A+B tiers O11–O14' },
      // fall and every move as a pair: their ratio is the number of drops on screen (rain is exempt from 1-knob rule).
      { name: 'fall', max: 6.8, hardCap: 6.8, step: 0.05, notch: 0.5, source: 'A, cap is a guess' },
      { name: 'every', max: 2.2, hardCap: 2.2, step: 0.05, notch: 0.2, source: 'A, cap is a guess' },
      { name: 'target', int: true, max: 25, hardCap: 25, source: 'A' },
      { name: 'storm', off: 0, min: 0, rule: true, unlockAt: 31, max: 0.25, hardCap: 0.25, step: 0.05, source: 'B, [E5]' },
    ],
    priority: ['every', 'fall', 'target', 'ops'],
    lighterKnobs: ['every', 'fall'],
    relief: [{ knob: 'fall', by: 0.5 }, { knob: 'every', by: 0.2 }],
    meta: { table: 'js/levels/rain.js', game: 'js/rain.js', maxDrops: 5, maxAnswer: 999 },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
