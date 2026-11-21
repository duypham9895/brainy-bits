// Reference adapter: Ô Sáng Ghi Nhớ (js/mem.js). Mirrors the real rules:
//   ROUNDS = 3, NEED = 2 perfect rounds, early stop once decided (mem.js endRound, MEM-3);
//   a round is perfect only if every lit tile is tapped with no wrong tap;
//   tiles flip in with a 25 ms stagger that is ADDED to the viewing time (mem.js nextRound).
// Human side: scripts/sim/human.mjs (working memory, lapses, tap slips, ex-Gaussian tap RT).
//
// ADAPTER INTERFACE (every game adapter exports exactly these):
//   export const game = '<gameKey>';
//   export function simulate(levelSpec, profile, rng, opts?) -> { pass, accuracy, ms, margin?, detail? }
//      levelSpec = BBD.level(game, L) (frozen); profile = PROFILES[name]; rng = seeded () => [0,1)
//      pass: boolean (the game's own pass rule) · accuracy: 0..1 per-action accuracy · ms: attempt duration
//      margin: how far past the pass line (Kristensen 2021, B) — optional, reported only
//   export function geometry(levelSpec, viewportW) -> { minTargetPx }   (gate G6: ≥ 44 px at 320 and 390)
import { samplePlayer, holdsPattern, lapses, exGauss } from '../human.mjs';
import { loadBBD } from '../load-bbd.mjs';

export const game = 'mem';
export const ROUNDS = 3, NEED = 2, STAGGER_S = 0.025;

// Chunk cost per extra tile [NEW]. 0 = a chunk of any size costs one slot; 1 = no chunking at all.
// 0.1 was picked so the shipped L1–13 curve stays near p* (an anchoring assumption, see DIFFICULTY-RULES).
export const GAMMA = 0.1;

// Tile picker = the game's own code: js/levels/mem.js exports it (meta.gen) and js/mem.js calls it with
// Math.random. disp = 0 is the legacy partial Fisher–Yates; disp > 0 draws a tile from cells touching no
// lit tile yet with chance disp (B). Loaded through node:vm exactly like the browser runs it.
const GEN = loadBBD({ games: ['mem'] }).spec('mem').meta.gen;
export const pickTargets = (size, t, disp, rng) => GEN.pickTargets(size, t, disp, rng);
export const adjacent = GEN.adjacent;

// Chunking (R:simulation: "gom các ô liền kề hoặc thẳng hàng thành một chunk"):
//  1. tiles that touch (8-neighbour) form a cluster;
//  2. clusters merge when some tile of one lies in the same row or column as a tile of the other with
//     at most ALIGN_GAP empty cells between them ("thẳng hàng") [NEW threshold].
// A chunk of n tiles costs 1 + gamma·(n − 1) memory units [NEW]: big chunks are cheaper than their tiles, not free.
export const ALIGN_GAP = 1;
export function chunkLoad(cells, size, gamma = GAMMA) {
  const parent = cells.map((_, i) => i);
  const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const rc = c => [(c / size) | 0, c % size];
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [r1, c1] = rc(cells[i]), [r2, c2] = rc(cells[j]);
    const touch = Math.abs(r1 - r2) <= 1 && Math.abs(c1 - c2) <= 1;
    const aligned = (r1 === r2 && Math.abs(c1 - c2) <= ALIGN_GAP + 1) || (c1 === c2 && Math.abs(r1 - r2) <= ALIGN_GAP + 1);
    if (touch || aligned) parent[find(i)] = find(j);
  }
  const sizes = new Map();
  cells.forEach((_, i) => { const r = find(i); sizes.set(r, (sizes.get(r) || 0) + 1); });
  let load = 0;
  sizes.forEach(n => { load += 1 + gamma * (n - 1); });
  return load;
}

export function simulate(levelSpec, profile, rng, opts = {}) {
  const { size, t, show } = levelSpec;
  const disp = levelSpec.disp || 0;
  const player = opts.player || samplePlayer(profile, rng, opts);            // calibrate passes one player for G8
  let perfect = 0, round = 0, tapsOk = 0, tapsAll = 0, ms = 800;              // 0.8 s "Chuẩn bị…"
  while (round < ROUNDS) {
    const cells = pickTargets(size, t, disp, rng);
    // mem.js nextRound: step = RM() ? 0 : 25 ms, so reduced-motion players get no stagger bonus.
    const showSec = show + t * (opts.reducedMotion ? 0 : STAGGER_S);
    ms += showSec * 1000;
    const held = !lapses(player, rng) && holdsPattern(player, rng, { load: chunkLoad(cells, size, opts.gamma), tiles: t, showSec });
    // Taps: a held pattern can still fail on a mis-touch; a lost one fails at a uniformly random tap.
    const failAt = held ? -1 : (rng() * t) | 0;
    let ok = true;
    for (let i = 0; i < t; i++) {
      tapsAll++; ms += exGauss(rng, player.rt);
      if (i === failAt || rng() < player.tapSlip) { ok = false; break; }
      tapsOk++;
    }
    ms += ok ? 1000 : 1600;                                                    // mem.js after(1.0 | 1.6)
    if (ok) perfect++;
    round++;
    if (perfect >= NEED || perfect + (ROUNDS - round) < NEED) break;
  }
  const pass = perfect >= NEED;
  return { pass, accuracy: tapsAll ? tapsOk / tapsAll : 0, ms: Math.round(ms), margin: perfect - NEED, detail: { perfect, round } };
}

// css/app.css:101 .mgrid width = min(92vw, 62vh, 520px); css/mem.css gap 4 px when n ≥ 6, else 8 px.
export function geometry(levelSpec, viewportW, viewportH = 700) {
  const n = levelSpec.size;
  const w = Math.min(0.92 * viewportW, 0.62 * viewportH, 520);
  const gap = n >= 6 ? 4 : 8;
  return { minTargetPx: (w - gap * (n - 1)) / n };
}
