// Đoán Cụm Từ — level table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "word".
// Content-only game: level L = the L-th phrase of js/word.js PHRASES after its stable sort by letter count.
// Stars are stored by level index (word.js:88), so this order is frozen (E3). New phrases (50+) are
// appended and sorted by D_word. E2 decides whether players see 49 or 30 levels.
(function (root) {
  'use strict';
  const BBD = root.BBD;
  // [source index in PHRASES, letters] in play order; generated from js/word.js on 2026-11-21.
  const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
    26, 27, 29, 30, 31, 32, 33, 34, 36, 28, 35, 37, 38, 39, 40, 42, 41, 43, 44, 45, 46, 47, 48];
  const LETTERS = [5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 11];
  BBD.register('word', {
    legacyLevels: ORDER.map((src, i) => ({ phrase: src, letters: LETTERS[i], maxTries: 6 })),
    knobs: [],
    maxLevel: cfg => Math.min(cfg.E2_WORD_LEVELS, ORDER.length),
    meta: { table: 'js/levels/word.js', game: 'js/word.js (PHRASES)' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
