// Đường Ray Tư Duy — difficulty table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "train".
// Legacy L1..11 = js/train-map.js stationsFor(L) and js/train.js nextSpawnDelay() base m. Frozen (E3).
// base = m; the real mean gap is ≈ 1.14·base because of the burst/rest mix (MERGED-SPEC A-2).
(function (root) {
  'use strict';
  const BBD = root.BBD;
  const legacyLevels = [];
  for (let L = 1; L <= 11; L++) {
    legacyLevels.push({
      stations: Math.min(4 + L, 15),
      base: +(Math.max(1.8, 2.6 - 0.075 * (L - 1)) * (0.75 / 0.45)).toFixed(4),
      speedF: 0.45, burstP: 0.15, twoTone: 0,
    });
  }
  BBD.register('train', {
    legacyLevels,
    knobs: [
      { name: 'stations', int: true, max: 15, hardCap: 15, source: 'code: train-map.js MAX_STATIONS' },
      { name: 'base', max: 2.48, hardCap: 2.30, step: 0.01, notch: 0.22, curve: 'linear', source: 'A, cap is a guess' },
      { name: 'speedF', max: 0.55, hardCap: 0.58, step: 0.05, changeOn: 'breather', source: 'A, cap is a guess' },
      { name: 'burstP', max: 0.28, hardCap: 0.30, step: 0.01, changeOn: 'breather', curve: 'quad', source: 'A, cap is a guess' },
      // [E5] two-colour stations (st.two already exists in train.js). Stays off while E5_KNOBS_ONLY.
      { name: 'twoTone', off: 0, min: 0, rule: true, unlockAt: 31, max: 0.45, hardCap: 0.45, step: 0.05, source: 'B, [E5]' },
    ],
    priority: ['base', 'speedF', 'burstP'],
    lighterKnobs: ['base'],
    relief: [{ knob: 'base', by: 0.22 }],
    meta: { table: 'js/levels/train.js', game: 'js/train.js + js/train-map.js', warn: 'cells < 44 px at 320 px for 8 columns (A-5)' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
