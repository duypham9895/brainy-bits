// TODO adapter: Mưa Phép Tính (js/rain.js). Implement after the parallel PR that touches js/rain.js lands.
// Interface (same as adapters/mem.mjs, the reference implementation):
//   export const game = 'rain';
//   export function simulate(levelSpec, profile, rng, opts = {}) -> { pass, accuracy, ms, margin?, detail? }
//      levelSpec = BBD.level('rain', L), frozen. Knobs: ops (tier 1..14), fall, every, target (storm is [E5], off)
//      profile = PROFILES[name] from ../human.mjs; rng = seeded () => [0,1). Never call Math.random.
//      Use opts.player when given (calibrate.mjs passes one player across 3 retries for gate G8),
//      else samplePlayer(profile, rng, opts).
//   export function geometry(levelSpec, viewportW) -> { minTargetPx }   (optional; gate G6 checks ≥ 44 px)
// What to model (MERGED-SPEC §4.3 "Bot từng game"):
//   · event-driven: drops spawn every ·(0.8 + U·0.4) s, fall for 'fall' s, max 5 on screen, answer ≤ 999.
//   · solve time per drop = exGauss RT + ARITH costs from ../human.mjs (addSmallSec, mulPseSec, carry, missing,
//     two-step, typeSecPerDigit). Priority: lowest drop first.
//   · pass = solved 'target' before 3 drops hit the water; margin = 3 − misses.
export const game = 'rain';
export const TODO = true;

export function simulate(/* levelSpec, profile, rng, opts = {} */) {
  throw new Error('adapter rain: not implemented yet (TODO stub). See scripts/sim/adapters/mem.mjs and docs/DIFFICULTY-RULES.md §3.');
}
