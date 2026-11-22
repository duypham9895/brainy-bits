// Adapter: Mưa Phép Tính (js/rain.js). Interface: see adapters/mem.mjs.
// Game side is the real code: equations come from window.BBRain.makeEq in js/levels/rain.js (the same
// function js/rain.js calls), and the event loop below mirrors js/rain.js update()/spawn():
//   · spawnT starts at 0.6 s; a spawn needs solved + drops < target + 2; 5 drops on screen → retry in 0.5 s;
//     an answer already falling → retry in 0.1 s; otherwise next spawn after every·(0.8 + U·0.4) s;
//   · a drop keeps its progress p = t/fall and hits the water when −30 + p·(wy + 30) ≥ wy − 12,
//     wy = H − 26 − 8·misses (the water rises after each miss, the drop's p does not change);
//   · `lives` misses lose (level knob, 3 when a row has none: E4 safety net, table v2), `target` solved drops win;
//     stars = 3 − misses, at least 1 on a win.
// Human side (event-driven, MERGED-SPEC §4.3 "rain: event-driven như B"): the player works on the lowest
// drop, one at a time. Solve time = perceive/decide (ex-Gaussian [EXG], scaled to small-addition RT [ADD])
// + arithmetic extras by operation and operand size (ARITH in ../human.mjs) + typing per digit.
// Every number tagged [NEW] has no source: a prior chosen for this build, to be fit from playtest.
// Not modelled, both small and opposite in sign: the 0.6 s AUTO_WAIT when the typed answer is also the start
// of a longer answer on screen (js/rain.js evalInput, costs the player time), and BB.hitStop(55) freezing the
// drops for 55 ms on each pop (gives the player time).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT } from '../load-bbd.mjs';
import { samplePlayer, exGauss, normal, lapses, ARITH } from '../human.mjs';

export const game = 'rain';
export const LIVES = 3, MAX_DROPS = 5, SPAWN0 = 0.6;
// Canvas height on a phone in portrait. Measured in tests/rain-levels.spec.js on Pixel 7 (Playwright).
export const CANVAS_H = 430;

// The generator, loaded exactly as the browser loads it (classic script, no DOM needed).
const ctx = vm.createContext({});
vm.runInContext(readFileSync(join(ROOT, 'js/levels/rain.js'), 'utf8'), ctx, { filename: 'js/levels/rain.js' });
export const { makeEq } = ctx.BBRain;

// ---------- cost model (seconds, for the median player before the per-player speed factor) ----------
const MEAN_RT = 0.451 + 0.147;                  // median ex-Gaussian mean [EXG]
const ADD_MID = (ARITH.addSmallSec[0] + ARITH.addSmallSec[1]) / 2;   // 0.735 s [ADD]
export const COST = Object.freeze({
  columnSec: 0.7,      // each extra digit column in add/sub [NEW]
  subSec: 0.15,        // subtraction over addition [NEW]
  bigTableSec: 0.6,    // 11× and 12× tables, rarely drilled [NEW]
  divSec: 0.3,         // division as inverse multiplication [NEW]
  readSec: 0.15,       // extra tokens to read (missing number, two-step) [NEW]
  lapseSec: [1.5, 3],  // a lapse = attention away for U(1.5, 3) s [NEW]
  speedSd: 0.25,       // per-player log-normal spread of arithmetic speed [NEW]
  trialSd: 0.2,        // per-problem log-normal noise [NEW]
  errBase: 0.02, errCarry: 0.03, errColumn: 0.015, errTwo: 0.04, errMul21: 0.04,   // slip rates [NEW]
  errMul: { weak: 1.5, median: 1, skilled: 0.6 },                                  // [NEW]
});
const digits = n => String(n).length;
const carries = (a, b) => { let c = 0, k = 0; while (a || b) { if ((a % 10) + (b % 10) + k >= 10) { c++; k = 1; } else k = 0; a = (a / 10) | 0; b = (b / 10) | 0; } return c; };
const borrows = (a, b) => { let c = 0, k = 0; while (a || b) { if ((a % 10) - k < (b % 10)) { c++; k = 1; } else k = 0; a = (a / 10) | 0; b = (b / 10) | 0; } return c; };

// Extra seconds and slip probability over a small addition, by operation and operand size.
export function extra(meta) {
  const { op, a, b, c } = meta;
  const addX = (x, y) => ({ s: COST.columnSec * (Math.max(digits(x), digits(y), digits(x + y)) - 1) + ARITH.carrySec * carries(x, y),
    e: COST.errCarry * carries(x, y) + COST.errColumn * (Math.max(digits(x), digits(y)) - 1) });
  const subX = (x, y) => ({ s: COST.subSec + COST.columnSec * (Math.max(digits(x), digits(y)) - 1) + ARITH.carrySec * borrows(x, y),
    e: COST.errCarry * borrows(x, y) + COST.errColumn * (Math.max(digits(x), digits(y)) - 1) });
  const mulX = (x, y) => {
    if (x <= 1 || y <= 1 || x === 10 || y === 10) return { s: 0, e: 0 };
    const big = (x > 5 && y > 5) || x * y > 25;                            // problem-size effect [PSE]
    return { s: (big ? ARITH.mulPseSec.us : 0) + (x > 10 || y > 10 ? COST.bigTableSec : 0), e: big ? 0.01 : 0 };
  };
  const sum = (...xs) => xs.reduce((m, x) => ({ s: m.s + x.s, e: m.e + x.e }), { s: 0, e: 0 });
  switch (op) {
    case 'add': return addX(a, b);
    case 'sub': return subX(a, b);
    case 'mul': return mulX(a, b);
    case 'div': return sum(mulX(a / b, b), { s: COST.divSec, e: 0 });
    case 'miss+': return sum(subX(a + b, b), { s: ARITH.missingSec + COST.readSec, e: 0 });
    case 'miss×': return sum(mulX(a, b), { s: COST.divSec + ARITH.missingSec + COST.readSec, e: 0 });
    case 'two+': return sum(mulX(a, b), addX(a * b, c), { s: ARITH.twoStepSec + COST.readSec, e: COST.errTwo });
    case 'two-': return sum(mulX(a, b), subX(a * b, c), { s: ARITH.twoStepSec + COST.readSec, e: COST.errTwo });
    case 'mul21': {                                                         // (10 + u)·b = 10b + u·b
      const u = a % 10, t = a - u;
      return sum(mulX(u, b), mulX(t / 10, b), { s: 0.3, e: COST.errMul21 }, addX(t * b, u * b));
    }
    default: throw new Error(`rain adapter: unknown op ${op}`);
  }
}

// One player's arithmetic speed: profile ratio from the ex-Gaussian means [EXG], log-normal spread [NEW].
function playerMath(player, rng, sd = COST.speedSd) {
  const ratio = (player.rt.mu + player.rt.tau) / 1000 / MEAN_RT;
  return { f: ratio * Math.exp(sd * normal(rng)), err: COST.errMul[player.profile] ?? 1 };
}
// Seconds from choosing a drop to the drop popping, and whether the first answer typed was wrong.
export function solveTime(meta, ans, player, pm, rng) {
  const x = extra(meta);
  const noise = Math.exp(COST.trialSd * normal(rng));
  // ex-Gaussian shape [EXG] rescaled so the median player's mean equals the small-addition RT [ADD].
  const base = exGauss(rng, player.rt) / 1000 * (ADD_MID / MEAN_RT);
  const think = base * Math.sqrt(pm.f) + x.s * pm.f * noise;
  const type = digits(ans) * ARITH.typeSecPerDigit * Math.sqrt(pm.f);
  let t = think + type, wrong = false;
  if (rng() < Math.min(0.5, (COST.errBase + x.e) * pm.err)) {             // slip: a wrong first digit clears
    wrong = true;                                                          // at once (rain.js evalInput), redo
    t += ARITH.typeSecPerDigit + 0.6 * think;
  }
  if (lapses(player, rng)) t += COST.lapseSec[0] + rng() * (COST.lapseSec[1] - COST.lapseSec[0]);
  return { t, wrong };
}

const hitP = misses => { const wy = CANVAS_H - 26 - misses * 8; return (wy + 18) / (wy + 30); };

export function simulate(levelSpec, profile, rng, opts = {}) {
  const { fall, every, target, ops } = levelSpec;
  const lives = levelSpec.lives ?? LIVES;   // js/rain.js livesOf(): the row's lives, else 3
  const player = opts.player || samplePlayer(profile, rng, opts);
  const pm = playerMath(player, rng, opts.speedSd);
  let t = 0, spawnAt = SPAWN0, solved = 0, misses = 0, wrong = 0, attempts = 0;
  const drops = [];                       // { t0, ans, meta }
  let work = null;                        // { drop, doneAt }
  const pOf = (d, at) => (at - d.t0) / fall;
  for (let guard = 0; guard < 10000; guard++) {
    // spawn (rain.js update: spawnT ≤ 0 and solved + drops < target + 2)
    if (spawnAt <= t + 1e-9 && solved + drops.length < target + 2) {
      if (drops.length >= MAX_DROPS) spawnAt = t + 0.5;
      else {
        const [, ans, meta] = makeEq(ops, rng);
        if (drops.some(d => d.ans === ans)) spawnAt = t + 0.1;
        else { drops.push({ t0: t, ans, meta }); spawnAt = t + every * (0.8 + rng() * 0.4); }
      }
    }
    // player picks the lowest drop when idle
    if (!work && drops.length) {
      const d = drops.reduce((m, x) => (pOf(x, t) > pOf(m, t) ? x : m));
      const s = solveTime(d.meta, d.ans, player, pm, rng);
      attempts++; if (s.wrong) wrong++;
      work = { drop: d, doneAt: t + s.t };
    }
    // next event: a drop reaching the water, the player finishing, or a spawn becoming due
    const thr = hitP(misses);
    let next = Infinity, hitDrop = null;
    for (const d of drops) { const at = d.t0 + thr * fall; if (at < next) { next = at; hitDrop = d; } }
    const tw = work ? work.doneAt : Infinity;
    const canSpawn = solved + drops.length < target + 2;
    const ts = canSpawn ? Math.max(spawnAt, t) : Infinity;
    const tn = Math.min(next, tw, ts);
    if (tn === Infinity) break;
    t = tn;
    if (tw === tn && work) {                               // the answer lands first on a tie
      drops.splice(drops.indexOf(work.drop), 1); work = null; solved++;
      if (solved >= target) break;
    } else if (next === tn) {
      drops.splice(drops.indexOf(hitDrop), 1); misses++;
      if (work && work.drop === hitDrop) work = null;    // the drop the player was solving is gone
      if (misses >= lives) break;
    }
    if (spawnAt <= t && !canSpawn) spawnAt = t;            // rain.js keeps spawnT ≤ 0 until there is room
  }
  const pass = solved >= target && misses < lives;
  return { pass, accuracy: attempts ? (attempts - wrong) / attempts : 0, ms: Math.round(t * 1000), margin: lives - misses,
    detail: { solved, misses } };
}

// Touch targets are the numpad keys, which never change with the level (css/app.css .rpad: 3 columns,
// gap 8 px, side padding 12 px; css/rain.css min-height 48 px).
export function geometry(levelSpec, viewportW) {
  const w = (Math.min(viewportW, 600) - 24 - 16) / 3;
  return { minTargetPx: Math.min(48, w) };
}
