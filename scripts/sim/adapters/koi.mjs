// Adapter: Cá Koi (js/koi.js). Interface as in adapters/mem.mjs (simulate + geometry).
// Mirrors the real rules of js/koi.js:
//   · one pond per level: `koi` identical fish + `decoys` grey fish; pellets = koi (setupPond);
//   · a tap on a koi spends a pellet; an unfed koi is a correct feed, a fed koi is a mistake;
//   · a tap on a grey fish is a mistake, spends no pellet, but locks the dial (KOI-02);
//   · after every feed the dial locks for `cd` seconds; taps while locked cost nothing but time;
//   · the pond ends when pellets run out or on the 2nd mistake (KOI-03); pass = mistakes ≤ 1.
//   · fish swim at (30 + U·12)·spdMul px/s, grey fish (24 + U·12)·spdMul (koi.js mk); turnMul makes
//     them change heading more often (koi.js updateFish), which makes paths harder to follow.
// Human side (scripts/sim/human.mjs) is a multiple-object-tracking model:
//   · the player keeps a set S of fed fish in view, |S| ≤ capacity. Capacity = K_trial / (1 + KAPPA·(m − 1)),
//     m = spdMul·(1 + TURN_W·(turnMul − 1)): faster, less predictable fish lower how many can be tracked
//     (direction from [MOT] Alvarez & Franconeri 2007: 1 fast … 8 slow targets; the slope is [NEW]);
//   · identical koi that pass close to a tracked fish can swap identity: losses per second
//     = crossing rate (kinetic estimate: density · relative speed · 2·confusion radius) · PSWAP [NEW];
//     grey fish look different, so they only distract (DECOY_W of a koi crossing) [NEW];
//   · a fed fish that is not in S is uncertain. Picking among uncertain fish errs with probability
//     (uncertain fed / uncertain all)·(1 − RHO), where RHO = rough spatial memory of "where I fed" [NEW].
//     RHO is anchored so the shipped L1–10 curve sits near p*, the same anchoring move as GAMMA in mem.mjs;
//   · a grey fish gets tapped by mistake with probability decoys·DELTA·m·(motorSigma/40) per feed [NEW];
//   · neighbour slip: another fish whose hit ellipse overlaps the target can take the tap, because
//     koi.js fishAt() gives the tap to the nearest centre. Tap error σ = FINGER_PX + fish speed × motor
//     timing error. P(a neighbour overlaps) from density, P(the tap lands nearer it) from σ and a uniform
//     separation. A grey neighbour is a mistake; a koi neighbour is a mistake only if it was already fed [NEW];
//   · a lapse (human.mjs) spends one wrong tap at a random point of the pond after the first feed.
import { samplePlayer, lapses, exGauss, normal } from '../human.mjs';

export const game = 'koi';
export const LEGACY_N = 10;
export const MISTAKES_ALLOWED = 1;                      // koi.js pondResult: kPassed = pondMistakes <= 1

// koi.js params(d), the shipped formula for L1..10 (kept here so tests can compare it with BBD).
export function legacyParams(d) {
  return {
    koi: Math.min(5 + d, 15),
    cd: Math.min(1.3 + 0.15 * d, 3.2),
    decoys: d >= 3 ? Math.min(1 + ((d - 3) / 2 | 0), 4) : 0,
  };
}

// koi.js geometry. area(): x 8..W−8, y 8..H−96. fishLen(): shrinks 0.85× when the pond has > 11 koi.
export const pondArea = (W, H) => Math.max(1, (W - 16) * (H - 104));
export const fishLen = (W, H, koi) => Math.max(34, Math.min(60, Math.min(W, H) * 0.13)) * (koi > 11 ? 0.85 : 1);
// koi.js fishAt(): hit ellipse semi-axes, with the floor a ≥ 24, b ≥ 22 (MERGED-SPEC §4.2, fix F2) so the
// smaller diameter is ≥ 44 px on every level. Target size is never a difficulty axis.
export const HIT_FLOOR = { a: 24, b: 22 };
export const hitAxes = len => ({ a: Math.max(len * 0.52, HIT_FLOOR.a), b: Math.max(len * 0.32, HIT_FLOOR.b) });

export const SPEED = { koi: 36, decoy: 30 };            // px/s, mean of 30 + U·12 and 24 + U·12 (koi.js mk)
export const REF = { W: 390, H: 640 };                  // canvas of a 390 × ~760 phone after the HUD [NEW: typical, not measured]

// Model constants, all [NEW]. Override from the CLI: node scripts/sim/calibrate.mjs koi --rho 0.7 --no-write
export const MODEL = Object.freeze({
  KAPPA: 0.9,     // capacity loss per unit of extra motion
  TURN_W: 0.6,    // how much more often turning counts as extra motion
  PSWAP: 0.12,    // chance a close pass between two identical koi loses the tracked one, at m = 1
  CONF_R: 0.6,    // confusion radius, × fish length
  DECOY_W: 0.25,  // a grey fish passing by distracts this much compared with a koi
  RHO: 0.90,      // rough spatial memory for untracked fed fish (anchor; re-anchored from 0.86 after the neighbour slip)
  DELTA: 0.004,   // grey-fish mis-tap per feed, per grey fish, at m = 1 and motorSigma 40 ms
  FINGER_PX: 5,   // spatial scatter of a finger tap on a phone, px (sd) — a guess, not measured
});

// Upper-tail normal probability, via the Abramowitz–Stegun 7.1.26 erf approximation (error < 1.5e-7).
const qNorm = x => {
  const z = Math.abs(x) / Math.SQRT2, t = 1 / (1 + 0.3275911 * z);
  const erfc = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-z * z);
  return x >= 0 ? erfc / 2 : 1 - erfc / 2;
};
// Chance a tap aimed at a fish lands nearer one overlapping neighbour: separation d uniform in the
// disc of radius r (overlap distance), wrong when the tap error along d exceeds d/2.
export function slipChance(r, sigma) {
  let s = 0; const n = 32;
  for (let i = 0; i < n; i++) { const d = (i + 0.5) / n * r; s += qNorm(d / (2 * sigma)) * 2 * d / (r * r) * (r / n); }
  return s;
}

const binom = (n, p, rng) => { let c = 0; for (let i = 0; i < n; i++) if (rng() < p) c++; return c; };

export function simulate(levelSpec, profile, rng, opts = {}) {
  const M = { ...MODEL };
  for (const k of Object.keys(MODEL)) if (typeof opts[k.toLowerCase()] === 'number') M[k] = opts[k.toLowerCase()];
  const N = levelSpec.koi, D = levelSpec.decoys || 0, cd = levelSpec.cd;
  const spdMul = levelSpec.spdMul || 1, turnMul = levelSpec.turnMul || 1;
  const player = opts.player || samplePlayer(profile, rng, opts);
  const W = opts.W || REF.W, H = opts.H || REF.H;

  const m = spdMul * (1 + M.TURN_W * (turnMul - 1));
  const kTrial = Math.max(1, player.K + 0.5 * normal(rng));
  const capF = kTrial / (1 + M.KAPPA * (m - 1));
  const len = fishLen(W, H, N), area = pondArea(W, H);
  const vrel = (4 / Math.PI) * SPEED.koi * spdMul;
  // Crossings per second for one tracked fish, weighted: other koi swap, grey fish only distract.
  const crossRate = n => (n / area) * vrel * 2 * M.CONF_R * len;
  const pswap = Math.min(0.95, M.PSWAP * m * m);
  const lossRate = (crossRate(N - 1) + M.DECOY_W * crossRate(D)) * pswap;
  const pDecoyTap = Math.min(0.5, D * M.DELTA * m * (player.motorSigma / 40));
  const lapseAt = lapses(player, rng) && N > 1 ? 1 + ((rng() * (N - 1)) | 0) : -1;   // step 0 has nothing fed yet
  // Neighbour slip (see header): overlap distance a + b, probability some neighbour is that close.
  const { a: ha, b: hb } = hitAxes(len), rOv = ha + hb;
  const sigma = M.FINGER_PX + SPEED.koi * m * (player.motorSigma / 1000);
  const slip = slipChance(rOv, sigma);
  const near = n => 1 - Math.exp(-(n / area) * Math.PI * rOv * rOv);
  const pSlipDecoy = near(D) * slip, pSlipKoi = near(N - 1) * slip;

  let fed = 0, tracked = 0, pellets = N, mistakes = 0, taps = 0, good = 0, step = 0, ms = 0;
  while (pellets > 0 && mistakes <= MISTAKES_ALLOWED) {
    const rt = exGauss(rng, player.rt) / 1000;
    const dt = (step ? cd : 0) + rt;                     // wait for the dial, then find and tap a fish
    ms += dt * 1000;
    if (tracked > 0) tracked -= binom(tracked, 1 - Math.exp(-lossRate * dt), rng);
    taps++;
    if (D > 0 && (rng() < pDecoyTap || rng() < pSlipDecoy)) { mistakes++; step++; continue; }   // grey fish: no pellet, dial locks
    const cap = Math.floor(capF + rng());                // fractional capacity, rounded at random
    const unknownFed = fed - tracked, pool = N - tracked;
    const pErr = pool > 0 ? (unknownFed / pool) * (1 - M.RHO) : 0;
    pellets--;
    const slipFed = N > 1 && rng() < pSlipKoi * (fed / (N - 1));   // the tap went to a fed neighbour
    if (step === lapseAt || slipFed || (unknownFed > 0 && rng() < pErr)) {
      mistakes++;                                         // fed fish fed again: the player now knows it
      if (unknownFed > 0 && tracked < cap) tracked++;
    } else {
      fed++; good++;
      if (tracked < cap) tracked++;
    }
    step++;
  }
  ms += 900;                                              // koi.js pondEnd delay 0.9 s
  const pass = mistakes <= MISTAKES_ALLOWED;
  return { pass, accuracy: taps ? good / taps : 0, ms: Math.round(ms), margin: MISTAKES_ALLOWED - mistakes,
    detail: { fed, mistakes, cap: +capF.toFixed(2), lossRate: +lossRate.toFixed(3), slip: +slip.toFixed(4) } };
}

// Gate G6: the smaller hit-ellipse diameter at this viewport, plus crowding & overlap density.
export function geometry(levelSpec, viewportW, viewportH = 700) {
  const H = Math.max(200, viewportH - 60);               // HUD above the canvas [NEW: approximate]
  const area = pondArea(viewportW, H);
  const len = fishLen(viewportW, H, levelSpec.koi);
  const { a, b } = hitAxes(len);
  const total = levelSpec.koi + (levelSpec.decoys || 0);
  const rOv = a + b;
  const pOverlapNeighbor = +(1 - Math.exp(-(Math.max(0, total - 1) / area) * Math.PI * rOv * rOv)).toFixed(4);
  const hitAreaFill = +((total * Math.PI * a * b) / area).toFixed(4);
  return { minTargetPx: 2 * Math.min(a, b), pOverlapNeighbor, hitAreaFill };
}

