// Adapter: Đoán Cụm Từ (js/word.js). Measures the 49 frozen phrases; it does not generate levels (E2, E3).
// Game rules are NOT re-implemented here: the block between "@pure-begin" and "@pure-end" in js/word.js
// (PHRASES, Vietnamese letter helpers, validSyllable, evaluateAgainst) is read from disk and run in a vm,
// so the bot is scored by the same function as the player.
//
// Interface: see adapters/mem.mjs. simulate(levelSpec, profile, rng, opts) -> { pass, accuracy, ms, margin, detail }.
// levelSpec = BBD.level('word', L) = { phrase (index in PHRASES before the sort), letters, maxTries }.
//
// Human model (every constant below is [NEW]: a prior picked for this build, no source; fit from playtest):
//  · knows   — the phrase is in the player's vocabulary with chance profile.vocab (B prior in human.mjs).
//  · explore — until the phrase is recognised, each guess is a valid syllable pair (built from the game's own
//              INITIALS × RHYMES, accepted by validSyllable) picked as the best of a bounded random sample:
//              keep green letters, avoid gray ones, try unseen letters (Wordle-like letter coverage).
//  · recognise — after each feedback row the bot counts the answers still possible: every valid toneless
//              syllable of the right length (same INITIALS × RHYMES pool) that agrees with the board so far
//              (green letters fixed, yellow letters not at that spot, gray letters absent). With
//              pairs = |word 1 candidates| × |word 2 candidates| and bits = log2(1 + pairs·2^−(LEX_BITS+HINT_BITS))
//              (real phrases left, the answer included), P = sigmoid(SLOPE·(c50 − bits)).
//              A known phrase is recognised with more candidates left (higher c50) than an unknown one.
//              The candidate space is what makes a phrase easy or hard, not the share of letters pinned, so
//              length is not rewarded by construction (review 2026-11-21, MUST 1).
//  · recall  — a recognised phrase is typed with a slip chance of profile.toneSlip per marked letter (tone mark,
//              â ă ê ô ơ ư, đ). The slip shows up as blue/gray and is fixed on the next row. A slip that is not
//              a valid syllable is rejected by the game without using a row, so it is retyped.
//  · lapse   — human.mjs lapse: a row where the player does not use what is on the board.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT } from '../load-bbd.mjs';
import { samplePlayer, lapses, exGauss } from '../human.mjs';

export const game = 'word';
export const SLOPE = 1.5;                    // recognition steepness, per bit [NEW]
// Real phrases still possible ≈ 1 (the answer) + pairs × 2^−(LEX_BITS + HINT_BITS):
export const LEX_BITS = 7;                   // ~2^21 valid syllable pairs vs ~2^14 everyday 2-syllable words [NEW]
export const HINT_BITS = 4;                  // 17 categories in PHRASES ≈ 2^4; the hint is free, read from row 2 [NEW]
export const C50_KNOWN = vocab => C50_BASE + C50_VOCAB * vocab;   // bits left at 50% recognition [NEW]
export const C50_BASE = 0, C50_VOCAB = 2.5;  // weak 1.8 · median 2.25 · skilled 2.45 bits [NEW]
export const UNKNOWN_BITS = 2.0;             // an unknown phrase needs ~4× fewer candidates left [NEW]
export const SAMPLE = { weak: 10, median: 25, skilled: 50 };   // candidates weighed per exploring row [NEW]
export const TYPE_SEC_PER_LETTER = 0.45;     // keyboard incl. tone keys [NEW]

// ---------- the game's own pure code ----------
export function loadWordCore(src = readFileSync(join(ROOT, 'js', 'word.js'), 'utf8')) {
  const a = src.indexOf('@pure-begin'), b = src.indexOf('@pure-end');
  if (a < 0 || b < a) throw new Error('adapter word: @pure-begin/@pure-end markers missing in js/word.js');
  const body = src.slice(src.indexOf('\n', a) + 1, src.lastIndexOf('\n', b));
  const ctx = vm.createContext({});
  return vm.runInContext(`(() => { ${body}\n return { PHRASES, TONES, split, compose, noTone, isVowel, fam, validSyllable, evaluateAgainst, INITIALS, RHYMES }; })()`,
    ctx, { filename: 'js/word.js#pure' });
}
export const W = loadWordCore();
const MARKED = new Set([...'ăâêôơưđ']);
const SORTED = [...W.PHRASES].sort((x, y) => x.n - y.n || x.i - y.i);   // word.js order before BBD: the E3 baseline
export const phraseOf = levelSpec => W.PHRASES.find(p => p.i === levelSpec.phrase);
export const legacyOrder = () => SORTED.map(p => p.i);

// Valid toneless syllables by length, as exploring guesses. Checked rhymes (-c -ch -p -t) take a sắc tone,
// since the game rejects them toneless.
const BY_LEN = new Map();
for (const ini of W.INITIALS) for (const r of W.RHYMES) {
  let s = [...(ini + r)];
  if (/(c|ch|p|t)$/.test(r)) {
    const v = s.map((c, i) => (W.isVowel(c) ? i : -1)).filter(i => i >= 0).pop();
    s = s.map((c, i) => (i === v ? W.compose(c, W.TONES[0]) : c));
  }
  if (!W.validSyllable(s)) continue;
  if (!BY_LEN.has(s.length)) BY_LEN.set(s.length, []);
  const list = BY_LEN.get(s.length);
  if (!list.some(x => x.join('') === s.join(''))) list.push(s);
}

// Same pool as toneless bases, packed for fast counting: per length the letter codes, a letter bitmask per
// syllable, and the index of each base string.
const CODE = new Map();
const codeOf = ch => { if (!CODE.has(ch)) CODE.set(ch, CODE.size); return CODE.get(ch); };
export const POOL = new Map([...BY_LEN].map(([len, list]) => {
  const strs = list.map(s => s.map(W.noTone).join(''));
  const codes = new Uint8Array(len * strs.length), mask = new Float64Array(strs.length);
  strs.forEach((st, k) => { let m = 0; [...st].forEach((ch, i) => { const c = codeOf(ch); codes[k * len + i] = c; m |= 2 ** c; }); mask[k] = m; });
  return [len, { strs, codes, mask, index: new Map(strs.map((st, k) => [st, k])) }];
}));
W.PHRASES.forEach(p => p.words.flat().forEach(ch => codeOf(W.noTone(ch))));
if (CODE.size > 31) throw new Error(`adapter word: ${CODE.size} letter codes do not fit a 32-bit mask`);
// Keep the candidate indices of one word that agree with one feedback row (bases only; tones ignored).
function narrow(pool, len, cands, g, res, absentMask) {
  const want = [], ban = [];
  for (let i = 0; i < len; i++) {
    const c = codeOf(W.noTone(g[i]));
    if (res[i] === 'green') want.push(i, c); else if (res[i] === 'yellow') ban.push(i, c);
  }
  const out = [];
  outer: for (const k of cands) {
    if (absentMask && (pool.mask[k] & absentMask) !== 0) continue;   // bitwise on ≤ 31 letter codes
    const o = k * len;
    for (let j = 0; j < want.length; j += 2) if (pool.codes[o + want[j]] !== want[j + 1]) continue outer;
    for (let j = 0; j < ban.length; j += 2) if (pool.codes[o + ban[j]] === ban[j + 1]) continue outer;
    out.push(k);
  }
  return out;
}
// Difficulty predictors per phrase (R:cognitive, DiSilvio 2023): letters, marked letters, repeats.
// Not used by simulate(): kept for ordering new phrases (50+) by D_word, MERGED-SPEC §4.2. None exist yet.
export function features(p) {
  const all = p.words.flat();
  const tones = all.filter(c => W.split(c).tone).length;
  const marks = all.filter(c => MARKED.has(W.noTone(c))).length;
  const bases = all.map(W.noTone);
  const repeats = bases.length - new Set(bases).size;
  return { letters: all.length, split: `${p.words[0].length}+${p.words[1].length}`, tones, marks, repeats };
}

function explore(p, know, rng, sample) {
  return p.words.map((w, wi) => {
    const pool = BY_LEN.get(w.length) || [w.map(W.noTone)];
    let best = null, bestScore = -Infinity;
    for (let k = 0; k < sample; k++) {
      const c = pool[(rng() * pool.length) | 0];
      const seen = new Set();
      let sc = rng() * 0.5;
      c.forEach((ch, i) => {
        const b = W.noTone(ch), pos = wi === 0 ? i : p.words[0].length + i;
        if (know.green[pos] && know.green[pos] === b) sc += 2;
        if (know.absent.has(b)) sc -= 3;
        else if (!seen.has(b) && !know.tried.has(b)) sc += 1;
        else if (know.present.has(W.fam(ch)) && !know.green[pos]) sc += 0.5;
        seen.add(b);
      });
      if (sc > bestScore) { bestScore = sc; best = c; }
    }
    return best;
  });
}
// The answer, with each still-unconfirmed marked letter slipping at toneSlip. Invalid slips are retyped.
function recall(p, player, rng, okWord) {
  return p.words.map((w, wi) => {
    if (okWord[wi]) return w;
    let out = w.slice();
    w.forEach((ch, i) => {
      const { base, tone } = W.split(ch);
      const marked = tone || MARKED.has(base);
      if (!marked || rng() >= player.toneSlip) return;
      for (let t = 0; t < 6; t++) {
        const alt = tone && rng() < 0.6
          ? W.compose(base, [...W.TONES, ''].filter(x => x !== tone)[(rng() * 5) | 0])
          : W.compose(base === 'đ' ? 'd' : W.fam(base), tone);
        const tryW = out.slice(); tryW[i] = alt;
        if (alt !== ch && W.validSyllable(tryW)) { out = tryW; break; }
      }
    });
    return out;
  });
}

export function simulate(levelSpec, profile, rng, opts = {}) {
  const p = phraseOf(levelSpec);
  if (!p) throw new Error(`adapter word: no phrase ${levelSpec.phrase}`);
  const player = opts.player || samplePlayer(profile, rng, opts);
  const T = p.words[0].concat(p.words[1]), n = T.length, tries = levelSpec.maxTries || 6;
  // Sensitivity flags (calibrate.mjs passes unknown --flags here): --vocab 1 = every phrase is known,
  // --unknown 1.5 = smaller penalty (bits) for an unknown phrase, --c50 -1 = recognise one bit later,
  // --lex 6 / --hint 3 = override LEX_BITS / HINT_BITS.
  const knows = rng() < (typeof opts.vocab === 'number' ? opts.vocab : player.vocab);
  const c50 = C50_KNOWN(player.vocab) + (opts.c50 || 0) - (knows ? 0 : (typeof opts.unknown === 'number' ? opts.unknown : UNKNOWN_BITS));
  const pools = p.words.map(w => POOL.get(w.length));
  const truth = p.words.map((w, wi) => pools[wi].index.get(w.map(W.noTone).join('')));   // every answer is in the pool (tested)
  const cands = pools.map(pl => Array.from(pl.strs.keys()));
  const sample = SAMPLE[player.profile] || 25;
  const know = { green: new Array(n).fill(null), present: new Set(), absent: new Set(), tried: new Set() };
  const okWord = [false, false];
  let recognised = false, ms = 0, last = null, row = 0, slips = 0, dropped = 0;
  for (row = 1; row <= tries; row++) {
    if (!recognised && row > 1 && !lapses(player, rng)) {
      const bits = Math.log2(1 + cands[0].length * cands[1].length * 2 ** -((opts.lex ?? LEX_BITS) + (opts.hint ?? HINT_BITS)));
      if (opts.trace) opts.trace.push([row, bits]);
      recognised = rng() < 1 / (1 + Math.exp(-SLOPE * (c50 - bits)));
    }
    const words = recognised ? recall(p, player, rng, okWord) : explore(p, know, rng, sample);
    const guess = words[0].concat(words[1]);
    const res = W.evaluateAgainst(T, guess);
    if (opts.log) opts.log.push({ guess: guess.join(''), res: [...res] });   // G7 parity: tests/word-levels.spec.js replays these rows
    ms += 1000 * n * TYPE_SEC_PER_LETTER + exGauss(rng, player.rt) * (recognised ? 1 : 4);
    last = res;
    if (res.every(r => r === 'green')) break;
    if (recognised) slips++;
    guess.forEach((ch, i) => {
      const b = W.noTone(ch); know.tried.add(b);
      if (res[i] === 'green') { know.green[i] = b; know.present.add(W.fam(ch)); }
      else if (res[i] === 'gray') { if (!know.present.has(W.fam(ch))) know.absent.add(b); }
      else know.present.add(W.fam(ch));
    });
    const L1 = p.words[0].length;
    if (!recognised) {
      let absentMask = 0;
      for (const b of know.absent) if (!know.green.includes(b)) absentMask |= 2 ** codeOf(b);
      cands[0] = narrow(pools[0], L1, cands[0], guess.slice(0, L1), res.slice(0, L1), absentMask);
      cands[1] = narrow(pools[1], n - L1, cands[1], guess.slice(L1), res.slice(L1), absentMask);
      // A tone or a repeated letter can make the bases-only filter drop the real answer; never count it out.
      cands.forEach((c, wi) => { if (!c.includes(truth[wi])) { c.push(truth[wi]); dropped++; } });
    }
    okWord[0] = res.slice(0, L1).every(r => r === 'green');
    okWord[1] = res.slice(L1).every(r => r === 'green');
  }
  const pass = row <= tries;
  const greens = last ? last.filter(r => r === 'green').length : 0;
  return { pass, accuracy: greens / n, ms: Math.round(ms), margin: pass ? tries - row : -1,
    detail: { rows: Math.min(row, tries), knows, slips, dropped } };
}
// No geometry(): the tap targets are the keyboard keys, whose size does not change with the level.
