// TODO adapter: Đoán Cụm Từ (js/word.js). Implement after the parallel PR that touches js/word.js lands.
// Interface (same as adapters/mem.mjs, the reference implementation):
//   export const game = 'word';
//   export function simulate(levelSpec, profile, rng, opts = {}) -> { pass, accuracy, ms, margin?, detail? }
//      levelSpec = BBD.level('word', L), frozen. Knobs: content-only: phrase index, letters, maxTries 6
//      profile = PROFILES[name] from ../human.mjs; rng = seeded () => [0,1). Never call Math.random.
//      Use opts.player when given (calibrate.mjs passes one player across 3 retries for gate G8),
//      else samplePlayer(profile, rng, opts).
//   export function geometry(levelSpec, viewportW) -> { minTargetPx }   (optional; gate G6 checks ≥ 44 px)
// What to model (MERGED-SPEC §4.3 "Bot từng game"):
//   · Wordle-like solver with a vocabulary prior: profile.vocab = chance the player knows the phrase,
//     profile.toneSlip = chance a guess has a wrong tone mark (B priors, unsourced).
//   · D_word predictors from R:cognitive (DiSilvio 2023, CC BY 4.0): letters, repeated letters, tones, entropy.
//   · pass = solved within MAX_TRIES = 6. Order of the 49 phrases is frozen (stars are stored by index).
export const game = 'word';
export const TODO = true;

export function simulate(/* levelSpec, profile, rng, opts = {} */) {
  throw new Error('adapter word: not implemented yet (TODO stub). See scripts/sim/adapters/mem.mjs and docs/DIFFICULTY-RULES.md §3.');
}
