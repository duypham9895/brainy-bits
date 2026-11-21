// Simulated human players for Brainy Bits calibration (MERGED-SPEC §4.3).
// Pure ES module: no DOM, no Math.random. Every random draw comes from an injected seeded rng.
//
// Source key (all entries live in docs/difficulty/research-kept.json):
//  [EXG]   ExGUtils, arXiv 1707.05759 — https://arxiv.org/abs/1707.05759
//          ex-Gaussian sampling x = mu + sigma·N(0,1), y = −tau·ln(U); go/no-go, young 451/47/147 ms, older 526/93/305 ms
//  [ISK]   Isaksen & Nealen, AIIDE — https://ojs.aaai.org/index.php/AIIDE/article/view/12846
//          timing error sigma swept 20..60 ms; learning T = A + B(n+E)^−R (power law of practice, Lane 1987)
//  [LV97]  Luck & Vogel 1997 — https://doi.org/10.1038/36846           visual WM ≈ 4 objects
//  [COW]   Cowan 2001 — https://pubmed.ncbi.nlm.nih.gov/11515286/        ≈ 4 chunks; K ~ N(4,1) cut to [2,7]
//  [CORSI] Kessels 2000 via PsyToolkit — https://www.psytoolkit.org/library/corsi.html   span 6.2 ± 1.3
//  [HICK]  Hick 1952 — https://doi.org/10.1080/17470215208416600         RT = a + b·log2(n+1); b must be fit (not sourced)
//  [ADD]   Barrouillet & Thevenot 2013 — https://access.archive-ouverte.unige.ch/access/metadata/2c3ad80b-2334-48ee-8cc9-1521d7816171/download
//          small additions 0.64–0.83 s
//  [PSE]   Prado et al. 2013 — https://www.frontiersin.org/journals/human-neuroscience/articles/10.3389/fnhum.2013.00189/full
//          multiplication problem-size effect 144 ms (US) / 52 ms (CN)
//  [MOT]   Alvarez & Franconeri 2007 via cognitive angle — https://dash.harvard.edu/entities/publication/c5600f24-cfc6-4d53-aca2-d244ec64059f
//          trackable targets 1 (fast) … 8 (slow)
//  [OSS]   bryc/code PRNGs — https://github.com/bryc/code/blob/master/jshash/PRNGs.md   mulberry32 + cyrb53, public domain
//  [NEW]   no source: a prior chosen for this build (MERGED-SPEC "MỚI"). Fit from playtest before trusting it.

// ---------- seeded randomness [OSS] ----------
export function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export function cyrb53(str, seed = 0) {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
// Campaign stream (MERGED-SPEC §4.1): camp|game|L|attempt, plus the profile so personas never share draws.
export const rngFor = (...parts) => mulberry32(cyrb53(['camp', ...parts].join('|')) >>> 0);

export function normal(rng) {                                 // Box–Muller
  let u = 0; while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
export function truncNormal(rng, mean, sd, lo, hi) {
  for (let i = 0; i < 64; i++) { const x = mean + sd * normal(rng); if (x >= lo && x <= hi) return x; }
  return Math.min(hi, Math.max(lo, mean));
}
// ex-Gaussian RT in ms [EXG]: Normal(mu, sigma) + Exponential(mean tau).
export function exGauss(rng, { mu, sigma, tau }) {
  let u = 0; while (u === 0) u = rng();
  return Math.max(120, mu + sigma * normal(rng) - tau * Math.log(u));
}

// ---------- profiles ----------
// weak = "novice" in MERGED-SPEC. Numbers per §4.3 table; the tag after each value names its source.
export const PROFILES = Object.freeze({
  weak: Object.freeze({
    name: 'weak',
    rt: { mu: 526, sigma: 93, tau: 305 },          // [EXG] older adults, go/no-go (not a game task)
    motorSigma: 60,                                // ms, [ISK] upper end of 20..60
    K: { mean: 3.5, sd: 1, lo: 2, hi: 7 },         // [LV97][COW] N(4,1) cut [2,7], shifted −0.5 (A, [NEW] shift)
    corsiSpan: 5.1,                                // [CORSI] 6.2 − ~0.8 SD (B, [NEW] placement)
    lapse: 0.05,                                   // per trial, [NEW] (A; R:staircase mentions 2–5%, unchecked)
    tapSlip: 0.004,                                // per tap mis-touch on a ≥ 44 px target, [NEW]
    encodeSec: 0.33,                               // s of viewing per lit tile, [NEW]
    vocab: 0.72, toneSlip: 0.14,                   // word priors, B, [NEW]
  }),
  median: Object.freeze({
    name: 'median',
    rt: { mu: 451, sigma: 47, tau: 147 },          // [EXG] young adults, go/no-go
    motorSigma: 40,                                // [ISK]
    K: { mean: 4, sd: 1, lo: 2, hi: 7 },           // [LV97][COW]
    corsiSpan: 6.2,                                // [CORSI]
    lapse: 0.03,                                   // [NEW]
    tapSlip: 0.002,                                // [NEW]
    encodeSec: 0.26,                               // [NEW]
    vocab: 0.90, toneSlip: 0.07,                   // B, [NEW]
  }),
  skilled: Object.freeze({
    name: 'skilled',
    rt: { mu: 360, sigma: 50, tau: 120 },          // A, [NEW] guess (no source for skilled RT)
    motorSigma: 20,                                // [ISK] lower end
    K: { mean: 4.5, sd: 1, lo: 2, hi: 7 },         // [LV97][COW] shifted +0.5, [NEW] shift
    corsiSpan: 7.4,                                // [CORSI] 6.2 + ~1 SD, [NEW] placement
    lapse: 0.015,                                  // [NEW]
    tapSlip: 0.001,                                // [NEW]
    encodeSec: 0.22,                               // [NEW]
    vocab: 0.98, toneSlip: 0.025,                  // B, [NEW]
  }),
});
export const PROFILE_NAMES = Object.keys(PROFILES);

// Arithmetic costs for the rain adapter. First two rows sourced, the rest are B's priors.
export const ARITH = Object.freeze({
  addSmallSec: [0.64, 0.83],                     // [ADD]
  mulPseSec: { us: 0.144, cn: 0.052 },           // [PSE]; which applies to Vietnamese players is unmeasured
  carrySec: 0.22, missingSec: 0.36, twoStepSec: 0.45, typeSecPerDigit: 0.22,   // B, [NEW]
});

// ---------- learning [ISK] ----------
// T = A + B(n+E)^−R, normalised so attempt n = 0 returns 1. Parameters are placeholders until playtest:
// with learning off (the default), every simulated attempt is a first attempt.
export const LEARNING = Object.freeze({ A: 0.6, B: 0.4, E: 1, R: 0.5 });   // [NEW] shape only
export function learnFactor(n, p = LEARNING) {
  const T = k => p.A + p.B * Math.pow(k + p.E, -p.R);
  return T(n) / T(0);
}

// ---------- a sampled player ----------
// One simulated attempt = one player drawn from the profile population (so pass rate is a population rate).
export function samplePlayer(profile, rng, { attempt = 0, learning = false } = {}) {
  const f = learning ? learnFactor(attempt) : 1;
  return {
    profile: profile.name,
    K: truncNormal(rng, profile.K.mean, profile.K.sd, profile.K.lo, profile.K.hi),
    rt: { mu: profile.rt.mu, sigma: profile.rt.sigma, tau: profile.rt.tau * f },
    motorSigma: profile.motorSigma * f,
    lapse: profile.lapse * f,
    tapSlip: profile.tapSlip,
    encodeSec: profile.encodeSec,
    corsiSpan: profile.corsiSpan,
    vocab: profile.vocab, toneSlip: profile.toneSlip,
  };
}

// Choice RT with a Hick term [HICK]. hickB defaults to 0 because no measured slope exists for this device.
export function choiceRT(player, rng, { choices = 1, hickB = 0 } = {}) {
  return exGauss(rng, player.rt) + hickB * Math.log2(choices + 1);
}
// Timing error for action games [ISK]: |N(0, sigma)| ms against a window of ±windowMs.
export function hitsWindow(player, rng, windowMs) {
  return Math.abs(player.motorSigma * normal(rng)) <= windowMs;
}
export const lapses = (player, rng) => rng() < player.lapse;

// Working memory for a pattern [LV97][COW] plus a viewing-time limit [NEW]:
//  · capacity this trial = K + N(0, 0.5) trial-to-trial noise [NEW]; the pattern must fit: load ≤ capacity
//  · each lit tile needs encodeSec of viewing, with log-normal trial noise exp(0.2·N) [NEW]: tiles·enc ≤ showSec
// `load` is in chunks (the adapter decides how tiles group). Returns true when the whole pattern is held.
export function holdsPattern(player, rng, { load, tiles, showSec }) {
  const kTrial = player.K + 0.5 * normal(rng);
  const enc = player.encodeSec * Math.exp(0.2 * normal(rng));
  return load <= kTrial && tiles * enc <= showSec;
}
