// Đoán Cụm Từ — level table. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "word".
// Content-only game (no knobs): level L = one phrase of js/word.js PHRASES, by source index.
// Version 2 (2026-11-21, E3 lifted): the 49 phrases are reordered by measured difficulty, and every row has a
// stable id "p<source index>", so stars follow the phrase, not the level number. Version 1 (legacyLevels) was the
// order by letter count; `migrate` moves old stars (keyed by level number) to the phrase they were earned on.
// New phrases (50+) get a new id and go where calibrate.mjs puts them; never reuse an id. E2 decides 49 or 30.
(function (root) {
  'use strict';
  const BBD = root.BBD;
  // Version 1 play order: [source index in PHRASES] after word.js's stable sort by letter count.
  const ORDER = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
    26, 27, 29, 30, 31, 32, 33, 34, 36, 28, 35, 37, 38, 39, 40, 42, 41, 43, 44, 45, 46, 47, 48];
  const LETTERS = [5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7,
    7, 7, 7, 7, 8, 8, 8, 8, 8, 8, 8, 9, 9, 9, 9, 9, 9, 11];
  const EXTRA_LETTERS = { 49: 7 };
  const lettersOf = src => { const i = ORDER.indexOf(src); return i >= 0 ? LETTERS[i] : EXTRA_LETTERS[src]; };
  // Version 2 play order. Bot estimate per phrase (scripts/sim/adapters/word.mjs, 4000 players per profile,
  // seeds independent of the slot), then rank-matched to p*(L): the easiest phrase goes to the highest p*,
  // so peaks get a harder phrase than the breather after them. L1–5 need weak ≥ 85% (G1) and
  // breathers weak ≥ 60% (G4). Gate results: docs/difficulty/calibration-word.json.
  // 2026-11-21, Duy (1): no peak at L5, first peak L10, first breather L11. L5 and L6 swapped phrases (32 ↔ 40)
  // so the old L5→L6 peak-to-breather drop does not read as a rising step (G2). v2 never shipped, so no new
  // table version: stars are keyed by phrase id and the v1 → v2 migration is unchanged.
  // 2026-11-22, Duy B: first peak moved to L15 and G1 became weak ≥ 90% on L1–5, ≥ 82% on L6–10. Two swaps, no
  // phrase added or dropped: L5 ↔ L11 (32 ↔ 36; only 18, 46, 48, 45, 36 clear weak 90% at L5) and L10 ↔ L14
  // (6 ↔ 11; the old L10 peak phrase now sits on the last step before the first peak). Stars follow the phrase id,
  // so no table version bump; `best` stays a level number, so nobody loses an unlocked level.
  const PLAY = [18, 46, 48, 45, 36, 40, 20, 37, 41, 11, 32, 43, 42, 6, 19, 27, 17, 47, 44, 25, 39, 16, 31, 34, 26,
    5, 2, 3, 21, 0, 24, 22, 35, 15, 33, 14, 13, 23, 7, 10, 38, 1, 4, 8, 29, 28, 30, 12, 9, 49];
  const row = src => ({ id: 'p' + src, phrase: src, letters: lettersOf(src), maxTries: 6 });
  if (BBD && BBD.register) BBD.register('word', {
    version: 2,
    legacyLevels: ORDER.map(row),             // ids here too, so E3_FREEZE_LEGACY = true keeps stars on their phrase
    levels: PLAY.map(row),
    knobs: [],
    // Duy 2026-11-21 (3), gates/01-spec/DIFFICULTY-DECISIONS.md: B reported WAIVED, never PASS. G1–G6, G8 still bind.
    gateWaivers: { B: 'Duy 2026-11-21 (3): content-only game, no knob; with 6 tries and the hint open at once the bot '
      + 'median sits 7–22 points above p* on every level, and those bot parameters are not yet checked against real '
      + 'players (G7 SKIP). Rules stay as they are; revisit when G7 data exists.' },
    // v1 → v2: old star key L (level number) = phrase ORDER[L − 1]. Keys past 49 or already ids stay as they are.
    migrate: ({ best, stars, remapLevels }) => ({ best, stars: remapLevels(stars, L => (L <= ORDER.length ? 'p' + ORDER[L - 1] : null)) }),
    // E2_WORD_LEVELS === 49 is the "keep all" default in js/difficulty.js; any other cap (e.g. 30, 40) still clamps.
    maxLevel: cfg => (cfg.E2_WORD_LEVELS === 49 ? PLAY.length : Math.min(cfg.E2_WORD_LEVELS, PLAY.length)),
    meta: { table: 'js/levels/word.js', game: 'js/word.js (PHRASES)' },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
