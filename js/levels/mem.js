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
  // Table v2, one template for L1..30 (sawtooth from L10: peak at 5k, breather at 5k+1, step otherwise;
  // Duy 2026-11-21: no peak at L5, L1–9 are steps):
  //   L1–5  three tiles while the grid grows (4×4 → 6×6) and the tiles spread (disp);
  //   L6+   6×6. A step spreads the tiles a little more (disp +0.05), a peak adds one tile,
  //         a breather drops one tile and gathers the tiles again.
  // One deliberate exception: L4 gathers the tiles (disp 0), so it is easier than L3, and L5 is the L3 row.
  // That keeps weak ≥ 85% (G1, Duy's promise to older/casual players) at the cost of gate B on the easy side
  // (L4 median 92.6 vs p* 86.5, L5 93.2 vs 85.7). No row meets both: 441 rows each at L4 and L5 (size 3–6,
  // t 3–10, disp 0–1 by 0.05, N=1200), lowest median with weak ≥ 0.85 was 92.6 (L4) and 92.9 (L5). The sim's
  // weak–median gap never drops below ~7 points near weak 85%, and B at L5 needs ≤ 5.7. See the KNOWN-FAIL pin.
  // Viewing time keeps the v1 rule (k = 0.3 s per tile): below ~7 tiles time never binds in the sim, so
  // shrinking it would only change the label, not the difficulty. Rows were fit with calibrate.mjs at N=1200
  // (docs/difficulty/calibration-mem.json). Same level numbers as v1: stars and mem_lv keep their keys.
  // [size, t, disp]
  const V2 = [
    [4, 3, 0.5], [5, 3, 0.5], [6, 3, 0.15], [6, 3, 0], [6, 3, 0.15],         // L1–5 steps (no peak at L5)
    [6, 4, 0], [6, 4, 0.05], [6, 4, 0.1], [6, 4, 0.15], [6, 5, 0.05],      // L6 … L9 steps, L10 first peak
    [6, 4, 0.1], [6, 4, 0.2], [6, 4, 0.25], [6, 4, 0.3], [6, 5, 0.2],      // L11 … L15
    [6, 4, 0.35], [6, 5, 0], [6, 5, 0.05], [6, 5, 0.1], [6, 6, 0.05],      // L16 … L20
    [6, 5, 0], [6, 5, 0.05], [6, 5, 0.1], [6, 5, 0.15], [6, 6, 0.1],       // L21 … L25
    [6, 5, 0.05], [6, 6, 0], [6, 6, 0.05], [6, 6, 0.1], [6, 7, 0.1],       // L26 … L30
  ];
  const levels = V2.map(([size, t, disp]) => ({ size, t, k: 0.3, disp }));
  if (BBD && BBD.register) BBD.register('mem', {
    version: 2,
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
