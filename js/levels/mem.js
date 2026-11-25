// Ô Sáng Ghi Nhớ — difficulty table v2. Load after js/difficulty.js. Spec: MERGED-SPEC §4.2 "mem".
// legacyLevels = table v1 (js/mem.js legacySpec: t = 2+L, grid by t, show = 1 + 0.3t), kept for parity tests
// and progress migration. Since E3 was lifted (Duy 2026-11-21) the game plays `levels` below.
(function (root) {
  'use strict';
  const BBD = root.BBD;

  // Pure tile picker shared by js/mem.js and scripts/sim/adapters/mem.mjs (no DOM; rnd is injected).
  // disp = 0 is the legacy partial Fisher–Yates of js/mem.js, call for call: same rnd() sequence, same tiles.
  // disp > 0: with chance disp the next tile comes only from cells touching no lit tile yet (B, blocks chunking).
  const adjacent = (a, b, size) =>
    a !== b && Math.abs(((a / size) | 0) - ((b / size) | 0)) <= 1 && Math.abs((a % size) - (b % size)) <= 1;
  function pickTargets(size, t, disp, rnd) {
    const cells = Array.from({ length: size * size }, (_, i) => i);
    for (let k = 0; k < t; k++) {
      let j = -1;
      if (disp > 0 && rnd() < disp) {
        const apart = [];
        for (let x = k; x < cells.length; x++) if (!cells.slice(0, k).some(c => adjacent(cells[x], c, size))) apart.push(x);
        if (apart.length) j = apart[Math.floor(rnd() * apart.length)];
      }
      if (j < 0) j = k + Math.floor(rnd() * (cells.length - k));
      [cells[k], cells[j]] = [cells[j], cells[k]];
    }
    return cells.slice(0, t);
  }
  const legacyLevels = [];
  for (let L = 1; L <= 13; L++) {              // table v1: what players had before 2026-11-21
    const t0 = 2 + L;
    const size = t0 <= 4 ? 3 : t0 <= 7 ? 4 : t0 <= 11 ? 5 : 6;
    const t = Math.min(t0, size * size - 1);
    // show unrounded, bit-for-bit the old js/mem.js value (toFixed(2) gave 3.7 instead of 3.6999… at L7).
    legacyLevels.push({ size, t, k: 0.3, disp: 0, show: 1.0 + 0.3 * t });
  }
  // Table v2, one template for L1..30 (Duy 2026-11-22, B, all games: L1–14 are steps, first peak L15, then
  // peak at 5k, breather at 5k+1, step otherwise). research: docs/difficulty/research-early.html.
  //   L1–14 open easy: a new element (4th tile L3, 5×5 grid L6, 4 tiles L8, 6×6 grid L11) comes with the tiles gathered
  //         (disp 0 or 0.15); the next steps spread them a little (disp +0.05..+0.1). One knob per level, disp ≤ hardCap 0.5.
  //   L15+  6×6. A step spreads the tiles a little more (disp +0.05), a peak adds one tile,
  //         a breather drops one tile or eases disp. L15 is a mild peak (4 tiles, gathered).
  // In the sim, tile count and grid size move the pass rate; disp moves it only ~1 point per 0.1 at 3 tiles,
  // so L11–14 sit at median ~0.91–0.93 (B is one-sided before L15: easier than p* is not a miss).
  // Viewing time keeps the v1 rule (k = 0.3 s per tile): below ~7 tiles time never binds in the sim, so
  // shrinking it would only change the label, not the difficulty. Rows were fit with
  // `calibrate.mjs mem --n 1200 --to 41` (2026-11-22, L6–14 de-flattened 2026-11-24, all gates green). L26–30 unchanged since 2026-11-21. Same level numbers as v1:
  // stars and mem_lv keep their keys, so the table version stays 2.
  // [size, t, disp]
  const V2 = [
    [4, 3, 0], [4, 3, 0.2], [4, 4, 0], [4, 4, 0.1], [4, 4, 0.2],            // L1–5 steps: 4×4, 4th tile at L3
    [5, 3, 0], [5, 3, 0.2], [5, 4, 0], [5, 4, 0.05], [5, 4, 0.1],           // L6–10 steps: 5×5 at L6, 4th tile at L8 (breaks 3-tile plateau)
    [6, 3, 0.15], [6, 3, 0.25], [6, 3, 0.35], [6, 3, 0.45], [6, 4, 0],      // L11–14 steps (6×6 at L11), L15 first peak (+1 tile)
    [6, 3, 0.3], [6, 3, 0.4], [6, 3, 0.5], [6, 4, 0.05], [6, 5, 0],         // L16 breather … L20 peak; L17–18 stay at 3 tiles so the wall is L15, not L17 (review)
    [6, 4, 0.1], [6, 4, 0.2], [6, 4, 0.25], [6, 4, 0.3], [6, 5, 0.15],      // L21 breather … L25 peak
    [6, 5, 0.05], [6, 6, 0], [6, 6, 0.05], [6, 6, 0.1], [6, 7, 0.1],       // L26 … L30
  ];
  const levels = V2.map(([size, t, disp]) => ({ size, t, k: 0.3, disp }));
  if (BBD && BBD.register) BBD.register('mem', {
    version: 2,
    maxLevel: 34,
    legacyLevels,
    levels,
    // Knobs below drive L31+ only and follow the same template as rows 6–30: steps hold 6 tiles and spread
    // them slowly (disp), a peak adds a tile, a breather drops a tile and gathers them (relief).
    // `start` anchors t and disp at the last STEP row (L29: 6 tiles, disp 0.1), not at the L30 peak (engine anchors
    // to row 30). startAt: 30 = written for this 30-row table; append rows and `start` stops applying.
    // So generated steps are never easier than L29, and the L31 breather (6−1 tiles, disp 0.1−0.05) equals L26.
    // t and k move on a slow 'quad' curve: p* falls only ~0.3 points a level past L30 and +1 tile costs the
    // median ~4 points, so t holds 6 until ~L51, then climbs to its cap by ~L110 (BBD.exhausted by L120).
    // Calibrated green at N=1200 for L31–45. Run calibrate before raising maxLevel past 45 (DIFFICULTY-RULES §2).
    knobs: [
      { name: 't', int: true, start: 6, startAt: 30, max: 6.12, hardCap: 15, curve: 'quad', source: 'MERGED-SPEC §4.2 mem; R:cognitive (Luck & Vogel 1997, Cowan 2001)' },
      { name: 'size', int: true, max: 6, hardCap: 6, source: 'A=B: size ≤ 6 keeps tiles ≥ 44 px at 320 px (css/mem.css)' },
      // k = seconds of viewing per tile; show = 1 + k·t. Stays 0.3 through L41: time never binds at ≤ 7 tiles
      // in the sim. Floor 0.18 is a guess (A), to be fit from playtest.
      { name: 'k', max: 0.298, hardCap: 0.18, step: 0.005, notch: 0.02, curve: 'quad', source: 'A, floor unsourced; values from calibrate.mjs' },
      // disp = chance a lit tile is forced non-adjacent to the others (blocks chunking) (B, R:simulation chunking).
      { name: 'disp', off: 0, min: 0, start: 0.1, startAt: 30, max: 0.13, hardCap: 0.50, step: 0.05, curve: 'quad', source: 'B, R:simulation chunking' },
    ],
    priority: ['t', 'disp', 'k'],
    lighterKnobs: ['t', 'k'],
    relief: [{ knob: 't', by: 1 }, { knob: 'disp', by: 0.05 }],
    peak: [{ knob: 't', by: 1 }],
    derive: r => ({ show: +(1.0 + r.k * r.t).toFixed(2) }),
    meta: { rounds: 3, need: 2, staggerMs: 25, table: 'js/levels/mem.js', game: 'js/mem.js',
      gen: Object.freeze({ pickTargets, adjacent }) },
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
