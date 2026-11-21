// TODO adapter: Cá Koi (js/koi.js). Implement after the parallel PR that touches js/koi.js lands.
// Interface (same as adapters/mem.mjs, the reference implementation):
//   export const game = 'koi';
//   export function simulate(levelSpec, profile, rng, opts = {}) -> { pass, accuracy, ms, margin?, detail? }
//      levelSpec = BBD.level('koi', L), frozen. Knobs: koi, cd, decoys, spdMul, turnMul (scatter is [E5], off)
//      profile = PROFILES[name] from ../human.mjs; rng = seeded () => [0,1). Never call Math.random.
//      Use opts.player when given (calibrate.mjs passes one player across 3 retries for gate G8),
//      else samplePlayer(profile, rng, opts).
//   export function geometry(levelSpec, viewportW) -> { minTargetPx }   (optional; gate G6 checks ≥ 44 px)
// What to model (MERGED-SPEC §4.3 "Bot từng game"):
//   · multiple-object tracking: capacity falls with speed (R:cognitive, Alvarez & Franconeri 2007, 1 fast … 8 slow).
//   · fish speed = (30 + U·12)·spdMul px/s (koi.js:67); decoys 24 + U·12; cooldown cd between feeds.
//   · a feed is right when the tapped fish is unfed and not a decoy; model losing track of fed fish
//     when tracked > capacity(speed), plus lapses and hitsWindow for moving targets.
//   · geometry: hit area a ≥ 24, b ≥ 22 after the koi.js:270 fix; fish shrink 0.85× when koi > 11.
export const game = 'koi';
export const TODO = true;

export function simulate(/* levelSpec, profile, rng, opts = {} */) {
  throw new Error('adapter koi: not implemented yet (TODO stub). See scripts/sim/adapters/mem.mjs and docs/DIFFICULTY-RULES.md §3.');
}
