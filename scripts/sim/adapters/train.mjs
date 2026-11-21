// TODO adapter: Đường Ray Tư Duy (js/train.js, js/train-map.js). Implement after the parallel PR that touches js/train.js lands.
// Interface (same as adapters/mem.mjs, the reference implementation):
//   export const game = 'train';
//   export function simulate(levelSpec, profile, rng, opts = {}) -> { pass, accuracy, ms, margin?, detail? }
//      levelSpec = BBD.level('train', L), frozen. Knobs: stations, base, speedF, burstP (twoTone is [E5], off)
//      profile = PROFILES[name] from ../human.mjs; rng = seeded () => [0,1). Never call Math.random.
//      Use opts.player when given (calibrate.mjs passes one player across 3 retries for gate G8),
//      else samplePlayer(profile, rng, opts).
//   export function geometry(levelSpec, viewportW) -> { minTargetPx }   (optional; gate G6 checks ≥ 44 px)
// What to model (MERGED-SPEC §4.3 "Bot từng game"):
//   · pure map gen + spawn schedule with the injected rng; dt = 1/60 fixed step.
//   · spawn gaps = the real mix in train.js nextSpawnDelay (burst ~15%, rest ~18%, normal), NOT base alone (A-2).
//   · each train needs one switch decision: choiceRT(player, rng, { choices }) then a timing check
//     hitsWindow(player, rng, windowMs) against the time the train needs to reach the switch.
//   · pass = accuracy ≥ 80% at LEVEL_TIME 90 s (unchanged); margin = pct − 80.
export const game = 'train';
export const TODO = true;

export function simulate(/* levelSpec, profile, rng, opts = {} */) {
  throw new Error('adapter train: not implemented yet (TODO stub). See scripts/sim/adapters/mem.mjs and docs/DIFFICULTY-RULES.md §3.');
}
