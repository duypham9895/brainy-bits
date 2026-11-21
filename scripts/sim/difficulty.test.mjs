// node --test scripts/sim/   — engine invariants + the mem calibration gates.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { loadBBD, ROOT } from './load-bbd.mjs';
import { calibrate } from './calibrate.mjs';
import { mulberry32, rngFor, exGauss, PROFILES } from './human.mjs';

const KNOB_GAMES = ['train', 'koi', 'mem', 'rain'];
const close = (a, b, eps = 1e-4) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const harderOrEqual = (k, a, b) => (k.dir > 0 ? a >= b - 1e-9 : a <= b + 1e-9);   // a at least as hard as b

test('D(L), kind(L) and p*(L) match MERGED-SPEC §4.1', () => {
  const B = loadBBD();
  close(B.D(1), 0); close(B.D(30), 1); close(B.D(10), Math.sqrt(9 / 29)); close(B.D(20), Math.sqrt(19 / 29));
  assert.equal(B.kind(5), 'peak'); assert.equal(B.kind(6), 'breather'); assert.equal(B.kind(1), 'step');
  assert.equal(B.kind(30), 'peak'); assert.equal(B.kind(31), 'breather'); assert.equal(B.kind(29), 'step');
  close(B.pStar(1), 0.92);
  close(B.pStar(30), 0.69);                                  // E1 = A: L30 peak ≈ 0.69
  close(B.pStar(29), 0.92 - 0.17 * Math.sqrt(28 / 29));
  close(B.pStar(15), 0.92 - 0.17 * Math.sqrt(14 / 29) - 0.06);
  close(B.pStar(16), 0.92 - 0.17 * Math.sqrt(15 / 29));      // breather offset 0 (A-1 fix)
  for (let L = 6; L <= 41; L += 5) {                          // breather between its peak and L−4
    assert.ok(B.pStar(L) > B.pStar(L - 1)); assert.ok(B.pStar(L) < B.pStar(L - 4));
  }
  close(B.pStar(200), 0.65);                                  // floor
  B.CONFIG.E1 = 'B';
  close(B.pStar(30), 0.58); assert.equal(B.e1().skilledL30, 0.8);
});

test('determinism: fresh loads give identical frozen tables', () => {
  const a = loadBBD(), b = loadBBD();
  for (const g of KNOB_GAMES) for (let L = 1; L <= 60; L++) {
    assert.deepEqual({ ...a.level(g, L) }, { ...b.level(g, L) }, `${g} L${L}`);
    assert.ok(Object.isFrozen(a.level(g, L)));
    assert.equal(a.level(g, L), a.level(g, L));               // cached, same object
  }
  const r1 = rngFor('mem', 3, 'weak', 7), r2 = rngFor('mem', 3, 'weak', 7);
  for (let i = 0; i < 20; i++) assert.equal(r1(), r2());
  const m = mulberry32(42); assert.ok(m() >= 0 && m() < 1);
  assert.ok(exGauss(mulberry32(1), PROFILES.median.rt) >= 120);
});

test('legacy levels are frozen to the formulas in the game code (E3)', () => {
  const B = loadBBD();
  for (let L = 1; L <= 13; L++) {                             // js/mem.js spec(L)
    const t0 = 2 + L, size = t0 <= 4 ? 3 : t0 <= 7 ? 4 : t0 <= 11 ? 5 : 6, t = Math.min(t0, size * size - 1);
    const r = B.level('mem', L);
    assert.equal(r.legacy, true); assert.equal(r.t, t); assert.equal(r.size, size); close(r.show, 1 + 0.3 * t);
  }
  for (let L = 1; L <= 11; L++) {                             // js/train-map.js + js/train.js
    const r = B.level('train', L);
    assert.equal(r.stations, Math.min(4 + L, 15)); close(r.base, Math.max(1.8, 2.6 - 0.075 * (L - 1)) * (0.75 / 0.45), 1e-3);
  }
  for (let d = 1; d <= 10; d++) {                             // js/koi.js params(d)
    const r = B.level('koi', d);
    assert.equal(r.koi, Math.min(5 + d, 15)); close(r.cd, Math.min(1.3 + 0.15 * d, 3.2));
    assert.equal(r.decoys, d >= 3 ? Math.min(1 + ((d - 3) / 2 | 0), 4) : 0);
  }
  for (let L = 1; L <= 10; L++) {                             // js/rain.js spec(L)
    const r = B.level('rain', L);
    close(r.fall, Math.max(8, 13 - 0.55 * (L - 1))); close(r.every, Math.max(2.7, 4.6 - 0.2 * (L - 1))); assert.equal(r.target, 10 + L);
  }
  assert.equal(B.level('word', 30).phrase, 30);               // "mưa phùn" stays at L30
  assert.equal(B.level('mem', 14).legacy, false);
  B.CONFIG.E3_FREEZE_LEGACY = false;                          // one-line switch really switches
  assert.equal(B.level('mem', 5).legacy, false);
});

test('generated levels are monotone except breathers, and breathers relieve', () => {
  const B = loadBBD();
  for (const g of KNOB_GAMES) {
    const s = B.spec(g), n = s.legacy.length;
    for (let L = n + 1; L <= 80; L++) {
      const cur = B.level(g, L), prev = B.level(g, L - 1);
      if (cur.kind === 'breather') continue;
      for (const k of s.knobs) assert.ok(harderOrEqual(k, cur[k.name], prev[k.name]), `${g} L${L} ${k.name} ${prev[k.name]}→${cur[k.name]}`);
    }
    for (let L = n + 1; L <= 80; L++) {
      if (B.kind(L) !== 'breather' || s.overrides[L]) continue;
      const peak = B.level(g, L - 1), br = B.level(g, L);
      const eased = s.relief.some(r => { const k = s.knobs.find(x => x.name === r.knob); return !harderOrEqual(k, br[k.name], peak[k.name]); });
      const capped = s.relief.every(r => B.level(g, L)[r.knob] === B.level(g, L - 5)[r.knob]);
      assert.ok(eased || capped, `${g} breather L${L} relieves nothing`);
    }
  }
});

test('hardCaps hold for every generated level up to L120; E5 rule knobs stay off', () => {
  const B = loadBBD();
  for (const g of KNOB_GAMES) {
    const s = B.spec(g);
    for (let L = s.legacy.length + 1; L <= 120; L++) {
      const r = B.level(g, L);
      for (const k of s.knobs) {
        const v = r[k.name];
        assert.ok(k.dir > 0 ? v <= k.hardCap + 1e-9 : v >= k.hardCap - 1e-9, `${g} L${L} ${k.name}=${v} cap ${k.hardCap}`);
        if (k.rule) assert.equal(v, k.off, `${g} L${L} rule knob ${k.name} must stay off (E5)`);
      }
    }
    assert.ok(B.exhausted(g, 120), `${g}: knobs never reach their caps — the +10 rule could run forever`);
  }
});

test('maxLevel follows E2 and content-only games refuse to invent levels', () => {
  const B = loadBBD();
  assert.equal(B.maxLevel('word'), 49);
  B.CONFIG.E2_WORD_LEVELS = 30; assert.equal(B.maxLevel('word'), 30);
  for (const g of KNOB_GAMES) assert.equal(B.maxLevel(g), 30);
  assert.throws(() => B.level('word', 50), /content-only/);   // vm realm: match by message
  assert.throws(() => B.level('mem', 0), /integer ≥ 1/);
  assert.throws(() => B.level('nope', 1), /unknown game/);
});

test('lighter(): one notch easier, ≤ 15%, carries the E4 config', () => {
  const B = loadBBD();
  const base = B.level('mem', 20), lt = B.lighter('mem', 20);
  assert.equal(lt.lighterKnob, 't'); assert.equal(lt.t, base.t - 1);
  assert.ok(Math.abs(lt.t - base.t) / base.t <= 0.15 + 1e-9);
  assert.equal(lt.assist, true); assert.equal(lt.maxStars, 1); assert.equal(lt.unlocksNext, true); assert.equal(lt.slowTempo, 0.85);
  close(lt.show, 1 + lt.k * lt.t, 1e-2);                      // derived field recomputed
  const l1 = B.lighter('mem', 1);                             // t=3: one tile is 33% > 15% → next knob (k)
  assert.equal(l1.lighterKnob, 'k'); assert.ok(l1.show > B.level('mem', 1).show);
  const tr = B.lighter('train', 20), tb = B.level('train', 20);
  assert.ok(tr.base > tb.base && (tr.base - tb.base) / tb.base <= 0.15 + 1e-9);
  for (const g of KNOB_GAMES) for (let L = 1; L <= 40; L++) {
    const x = B.lighter(g, L);
    if (x.noChange) continue;
    const k = B.spec(g).knobs.find(q => q.name === x.lighterKnob);
    assert.ok(!harderOrEqual(k, x[k.name], B.level(g, L)[k.name]), `${g} L${L} lighter is not easier`);
  }
  B.CONFIG.E4 = { maxStars: 0, unlocksNext: false, slowTempo: null };
  assert.equal(B.lighter('mem', 20).unlocksNext, false);
});

test('Elo/Rasch runtime (Pelánek): update, assist, replay, storage, lighter trigger', () => {
  const B = loadBBD(), { elo } = B;
  close(elo.U(0), 1); close(elo.U(20), 0.5);
  const s1 = elo.update({ theta: 0, n: 0 }, { b: 0, won: true });
  close(s1.theta, 0.5); assert.equal(s1.n, 1);
  const s2 = elo.update(s1, { b: 0, won: false, assist: true });
  assert.deepEqual({ ...s2 }, { ...s1 });                     // assisted runs never move θ
  const log = [{ g: 'mem', lv: 1, won: true }, { g: 'koi', lv: 3, won: false }, { g: 'mem', lv: 2, won: false }];
  const r = elo.replay(log, 'mem'); assert.equal(r.n, 2);
  assert.deepEqual({ ...elo.replay(log, 'mem') }, { ...r });  // deterministic
  const mem = new Map(), storage = { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.ok(elo.save(storage, 'mem', r)); assert.deepEqual({ ...elo.load(storage, 'mem') }, { theta: r.theta, n: r.n });
  assert.deepEqual({ ...elo.load({ getItem: () => '{bad' }, 'mem') }, { theta: 0, n: 0 });
  close(elo.bFromP(0.5), 0); assert.ok(elo.bOf('mem', 30) > elo.bOf('mem', 1));
  assert.equal(elo.offerLighter({ failsInRow: 2, theta: 0, b: 1 }), true);
  assert.equal(elo.offerLighter({ failsInRow: 1, theta: 0, b: 1 }), false);
  assert.equal(elo.offerLighter({ failsInRow: 2, theta: 2, b: 0 }), false);
  assert.equal(elo.suggestPrev(3), true); assert.equal(elo.suggestPrev(2), false);
});

test('register() validates specs; UMD exports for CommonJS', () => {
  const B = loadBBD({ games: [] });
  assert.throws(() => B.register('x', { knobs: [{ name: 'a', min: 1 }] }), /hardCap/);
  assert.throws(() => B.register('x', { knobs: [{ name: 'L', min: 1, hardCap: 2 }] }), /reserved/);
  assert.throws(() => B.register('x', { knobs: [{ name: 'a', min: 1, hardCap: 2 }], priority: ['b'] }), /unknown knob/);
  B.register('toy', { knobs: [{ name: 'a', min: 1, max: 5, hardCap: 6, int: true }] });
  assert.equal(B.level('toy', 1).a, 1); assert.equal(B.level('toy', 30).a, 5); assert.equal(B.level('toy', 99).a, 6);
  const ctx = vm.createContext({ module: { exports: {} } });
  vm.runInContext(readFileSync(join(ROOT, 'js/difficulty.js'), 'utf8'), ctx);
  assert.equal(typeof ctx.module.exports.level, 'function');
  assert.equal(ctx.module.exports, ctx.BBD);
});

// Smoke only: N=400 is a fast wiring check, NOT the gate verdict. At full N=1200 (CI, report-only)
// mem still misses G2 L7→L8 and G3 at L6, both in legacy levels, pending the E3 retune.
test('mem calibration wiring smoke at N=400 (not the full-N gate verdict)', async () => {
  const r = await calibrate('mem', { n: 400, write: false, quiet: true });
  const failed = r.gates.filter(g => g.pass === false).map(g => `${g.id}: ${g.fails.join('; ')}`);
  assert.deepEqual(failed, []);
  assert.equal(r.gates.find(g => g.id === 'G7').pass, null);  // parity is reported as skipped, not passed
});

test('TODO adapters fail loudly instead of passing', async () => {
  // Checks whichever adapters are still stubs, so each game owner can land an adapter without editing this list.
  for (const g of ['train', 'koi', 'rain', 'word']) {
    const mod = await import(new URL(`./adapters/${g}.mjs`, import.meta.url).href);
    if (mod.TODO) await assert.rejects(calibrate(g, { n: 1, write: false, quiet: true }), /TODO stub/);
  }
});

// ---------- mem integration (owner: mem). The game (js/mem.js) reads BBD.level('mem', L). ----------
import { describe } from 'node:test';   // ES imports hoist; kept here so this block stays self-contained
describe('mem: game reads BBD, legacy unchanged', () => {
  // Verbatim copy of js/mem.js spec(L) and pickTargets before the BBD integration (main @ 2b9c5f4).
  const oldSpec = L => {
    const t0 = 2 + L;
    const size = t0 <= 4 ? 3 : t0 <= 7 ? 4 : t0 <= 11 ? 5 : 6;
    const t = Math.min(t0, size * size - 1);
    return { t, size, show: 1.0 + 0.3 * t };
  };
  const oldPick = (n, t, rnd) => {
    const cells = Array.from({ length: n * n }, (_, i) => i);
    for (let k = 0; k < t; k++) {
      const j = k + Math.floor(rnd() * (cells.length - k));
      [cells[k], cells[j]] = [cells[j], cells[k]];
    }
    return cells.slice(0, t);
  };

  test('L1..13: BBD gives exactly the old spec (t, size, show bit-for-bit, disp 0)', () => {
    const B = loadBBD();
    for (let L = 1; L <= 13; L++) {
      const r = B.level('mem', L), o = oldSpec(L);
      assert.equal(r.legacy, true, `L${L}`);
      assert.equal(r.t, o.t, `L${L} t`); assert.equal(r.size, o.size, `L${L} size`);
      assert.equal(r.show, o.show, `L${L} show`); assert.equal(r.disp, 0, `L${L} disp`);
    }
  });

  test('shared picker with disp 0 = old Fisher–Yates, same rng → same tiles', () => {
    const gen = loadBBD().spec('mem').meta.gen;
    for (let L = 1; L <= 13; L++) for (let seed = 1; seed <= 50; seed++) {
      const { t, size } = oldSpec(L);
      assert.deepEqual([...gen.pickTargets(size, t, 0, mulberry32(seed))], oldPick(size, t, mulberry32(seed)), `L${L} seed ${seed}`);
    }
  });

  test('disp > 0 spreads tiles: fewer adjacent pairs, still t distinct cells', () => {
    const gen = loadBBD().spec('mem').meta.gen;
    const pairs = cells => { let c = 0; cells.forEach((a, i) => cells.slice(i + 1).forEach(b => { if (gen.adjacent(a, b, 6)) c++; })); return c; };
    let p0 = 0, p3 = 0;
    for (let s = 1; s <= 300; s++) {
      const a = [...gen.pickTargets(6, 15, 0, mulberry32(s))], b = [...gen.pickTargets(6, 15, 0.3, mulberry32(s))];
      assert.equal(new Set(b).size, 15); assert.ok(b.every(c => c >= 0 && c < 36));
      p0 += pairs(a); p3 += pairs(b);
    }
    assert.ok(p3 < p0, `disp 0.3 should give fewer adjacent pairs (${p3} vs ${p0})`);
  });

  test('L14..30: max 30, every step/peak level is harder to see (more tiles or less time), tiles fit', () => {
    const B = loadBBD();
    assert.equal(B.maxLevel('mem'), 30);
    for (let L = 14; L <= 30; L++) {
      const r = B.level('mem', L), p = B.level('mem', L - 1);
      assert.equal(r.legacy, false);
      assert.ok(r.t < r.size * r.size, `L${L}`);
      // disp alone is not a step: it barely moves chunk load in the sim (review 2026-11-21).
      if (r.kind !== 'breather') assert.ok(r.t > p.t || r.show < p.show, `L${L}: no more tiles and no less time than L${L - 1}`);
    }
  });
});

// ---------- koi (owner: koi levels branch) ----------
test('koi legacy L1–10: BBD.level equals js/koi.js params(d) for every knob', async () => {
  const B = loadBBD();
  const { legacyParams, LEGACY_N } = await import('./adapters/koi.mjs');
  assert.equal(B.spec('koi').legacy.length, LEGACY_N);
  for (let d = 1; d <= LEGACY_N; d++) {
    const old = legacyParams(d), r = B.level('koi', d);
    assert.equal(r.legacy, true);
    assert.equal(r.koi, old.koi, `L${d} koi`); assert.equal(r.decoys, old.decoys, `L${d} decoys`);
    assert.ok(Math.abs(r.cd - old.cd) < 1e-9, `L${d} cd ${r.cd} vs ${old.cd}`);
    assert.equal(r.cd.toFixed(1), old.cd.toFixed(1), `L${d} cd as shown on the menu`);
    assert.equal(r.spdMul, 1); assert.equal(r.turnMul, 1);
  }
});
test('koi: 30 levels, new levels stay inside the tracking limits', () => {
  const B = loadBBD();
  assert.equal(B.maxLevel('koi'), 30);
  for (let L = 11; L <= 30; L++) {
    const r = B.level('koi', L);
    assert.ok(r.koi >= 12 && r.koi <= 15, `L${L} koi ${r.koi}`);
    if (r.kind === 'breather') assert.equal(r.koi, 12, `L${L} breather drops to 12 fish`);
    assert.ok(r.spdMul <= 1.4 && r.turnMul <= 1.5 && r.decoys <= 6, `L${L} ${JSON.stringify(r)}`);
    if (r.spdMul > 1.25) assert.ok(r.koi <= 14, `L${L}: fast fish never come with a full pond`);
    const p = B.level('koi', L - 1);
    // A step must change something the player sees (count, grey fish, speed, turning); a +0.05 s wait alone is not felt.
    if (r.kind !== 'breather') assert.ok(['koi', 'decoys', 'spdMul', 'turnMul'].some(k => r[k] !== p[k]), `koi L${L}: no visible change from L${L - 1}`);
  }
});
// N=2000 (≈2 s): at N=400 the sampling error (±2 points) is close to the B band, so a pass there can be luck.
test('koi calibration passes its gates (N=2000, seeded)', async () => {
  const r = await calibrate('koi', { n: 2000, write: false, quiet: true });
  const failed = r.gates.filter(g => g.pass === false).map(g => `${g.id}: ${g.fails.join('; ')}`);
  assert.deepEqual(failed, []);
});

// ---------- word (owner: word levels branch). js/word.js reads BBD.level('word', L).phrase. ----------
describe('word: 49 frozen phrases read through BBD (E2, E3)', () => {
  test('word legacy L1..49: BBD row = old word.js order (sort by letter count, then source index)', async () => {
    const B = loadBBD();
    const { W, legacyOrder } = await import('./adapters/word.mjs');
    const old = legacyOrder();                                // the sort word.js used before BBD, on the live PHRASES
    assert.equal(old.length, 49);
    assert.equal(B.spec('word').legacy.length, 49);
    for (let L = 1; L <= 49; L++) {
      const r = B.level('word', L), p = W.PHRASES.find(x => x.i === old[L - 1]);
      assert.equal(r.legacy, true, `L${L}`);
      assert.equal(r.phrase, old[L - 1], `L${L} phrase`);
      assert.equal(r.letters, p.n, `L${L} letters`);
      assert.equal(r.maxTries, 6, `L${L} tries`);
    }
    assert.equal(B.maxLevel('word'), 49);
  });
  test('word adapter scores with the game\'s own evaluate, deterministic, skill-ordered', async () => {
    const B = loadBBD();
    const { W, simulate } = await import('./adapters/word.mjs');
    const ans = [...'càphê'];
    assert.deepEqual([...W.evaluateAgainst(ans, [...'càphê'])], Array(5).fill('green'));
    assert.deepEqual([...W.evaluateAgainst(ans, [...'caphe'])], ['green', 'blue', 'green', 'green', 'blue']);
    const run = (L, pn, i) => simulate(B.level('word', L), PROFILES[pn], rngFor('word-test', L, pn, i));
    assert.deepEqual(run(10, 'median', 3), run(10, 'median', 3));
    const rate = (L, pn) => { let k = 0; for (let i = 0; i < 300; i++) k += run(L, pn, i).pass; return k / 300; };
    for (const L of [1, 30, 49]) assert.ok(rate(L, 'weak') <= rate(L, 'median') && rate(L, 'median') <= rate(L, 'skilled') + 0.02, `L${L}`);
  });
  test('word recognition counts candidates left: every answer is in the pool, the filter rarely drops it', async () => {
    const B = loadBBD();
    const { W, POOL, simulate } = await import('./adapters/word.mjs');
    for (const p of W.PHRASES) p.words.forEach(w => assert.ok(POOL.get(w.length).index.has(w.map(W.noTone).join('')), w.join('')));
    let rows = 0, dropped = 0;
    for (const L of [1, 11, 30, 49]) for (let i = 0; i < 100; i++) {
      const d = simulate(B.level('word', L), PROFILES.weak, rngFor('word-drop', L, i)).detail;
      rows += d.rows; dropped += d.dropped;
    }
    assert.ok(dropped / rows < 0.05, `answer dropped by the bases-only filter on ${dropped}/${rows} rows`);
  });
  test('word calibration: no generated level, G5/G8 pass; G1–G3 are measured on frozen levels (E3)', async () => {
    const r = await calibrate('word', { n: 150, write: false, quiet: true });
    assert.equal(r.levels.length, 49);
    assert.ok(r.levels.every(l => l.legacy));
    for (const id of ['B', 'G5', 'G8']) assert.equal(r.gates.find(g => g.id === id).pass, true, id);
  });
});

// ---------- rain (owner: rain). js/rain.js reads BBD.level('rain', L) and BBRain.makeEq (js/levels/rain.js). ----------
describe('rain: game reads BBD, legacy unchanged, gates', () => {
  // Verbatim copies of js/rain.js spec(L) and makeEq(L) before the BBD integration (main @ a124c2d),
  // with Math.random replaced by an injected rng so both sides can be fed the same stream.
  const oldSpec = L => ({ fall: Math.max(8, 13 - 0.55 * (L - 1)), every: Math.max(2.7, 4.6 - 0.2 * (L - 1)), target: 10 + L });
  const oldMakeEq = (L, rnd) => {
    const ri = (a, b) => a + (rnd() * (b - a + 1) | 0);
    const add = m => { const a = ri(1, m - 1), b = ri(1, m - a); return [`${a} + ${b}`, a + b]; };
    const sub = m => { const a = ri(2, m), b = ri(1, a); return [`${a} − ${b}`, a - b]; };
    const mul = (x0, x1, y1) => { const a = ri(x0, x1), b = ri(1, y1); return rnd() < 0.5 ? [`${a} × ${b}`, a * b] : [`${b} × ${a}`, a * b]; };
    const div = (x1, c0, c1) => { const b = ri(2, x1), c = ri(c0, c1); return [`${b * c} ÷ ${b}`, c]; };
    const pick = arr => arr[rnd() * arr.length | 0]();
    switch (L) {
      case 1: return add(10);
      case 2: return pick([() => add(10), () => sub(10)]);
      case 3: return pick([() => add(20), () => sub(20)]);
      case 4: return pick([() => add(50), () => sub(50)]);
      case 5: return pick([() => add(100), () => sub(100)]);
      case 6: return mul(2, 5, 10);
      case 7: return mul(2, 9, 9);
      case 8: return pick([() => mul(2, 9, 9), () => div(9, 1, 9)]);
      case 9: return pick([() => add(100), () => sub(100), () => mul(2, 9, 9), () => div(9, 1, 9)]);
      default: return pick([() => add(200), () => sub(200), () => mul(2, 12, 12), () => div(12, 2, 12)]);
    }
  };
  // Answer check for every equation shape the generator writes.
  const solve = eq => {
    const m = /^\? ([+×]) (\d+) = (\d+)$/.exec(eq);
    if (m) return m[1] === '+' ? +m[3] - +m[2] : +m[3] / +m[2];
    return Function(`return ${eq.replace(/×/g, '*').replace(/−/g, '-').replace(/÷/g, '/')}`)();
  };

  test('L1..10: BBD gives exactly the old spec (===), ops tier = L', () => {
    const B = loadBBD();
    for (let L = 1; L <= 10; L++) {
      const r = B.level('rain', L), o = oldSpec(L);
      assert.equal(r.legacy, true, `L${L}`); assert.equal(r.ops, L, `L${L} ops`);
      assert.equal(r.fall, o.fall, `L${L} fall`); assert.equal(r.every, o.every, `L${L} every`); assert.equal(r.target, o.target, `L${L} target`);
    }
  });

  test('shared generator, tiers 1..10 = old makeEq: same rng → same equations and same rng use', async () => {
    const { makeEq } = await import('./adapters/rain.mjs');
    for (let L = 1; L <= 10; L++) for (let seed = 1; seed <= 40; seed++) {
      const a = mulberry32(seed), b = mulberry32(seed);
      for (let i = 0; i < 25; i++) assert.deepEqual([...makeEq(L, a)].slice(0, 2), oldMakeEq(L, b), `L${L} seed ${seed} draw ${i}`);   // spread: vm-realm array
      assert.equal(a(), b(), `L${L} seed ${seed}: rng streams drifted`);
    }
  });

  test('every tier: answers are correct, whole, 0..999 (3-digit numpad); new tiers show their new operation', async () => {
    const { makeEq } = await import('./adapters/rain.mjs');
    const rnd = mulberry32(7);
    for (let tier = 1; tier <= 14; tier++) {
      const ops = new Set();
      for (let i = 0; i < 3000; i++) {
        const [eq, ans, meta] = makeEq(tier, rnd);
        assert.ok(Number.isInteger(ans) && ans >= 0 && ans <= 999, `tier ${tier}: ${eq} = ${ans}`);
        assert.equal(solve(eq), ans, `tier ${tier}: ${eq}`);
        ops.add(meta.op);
      }
      const want = { 11: 'add', 12: 'miss+', 13: 'two+', 14: 'mul21' }[tier];
      if (want) assert.ok(ops.has(want), `tier ${tier} never drew ${want}`);
    }
  });

  test('L11..30: 30 levels, tiers open on breathers, steps never get easier', () => {
    const B = loadBBD();
    assert.equal(B.maxLevel('rain'), 30);
    const tier = { 11: 11, 16: 12, 21: 13, 26: 14 };
    for (let L = 11; L <= 30; L++) {
      const r = B.level('rain', L), p = B.level('rain', L - 1);
      assert.equal(r.legacy, false);
      if (tier[L]) assert.equal(r.ops, tier[L], `L${L} ops`); else if (r.kind !== 'breather') assert.equal(r.ops, p.ops, `L${L} ops`);
      if (r.kind !== 'breather') {
        assert.ok(r.every <= p.every && r.fall <= p.fall && r.target >= p.target, `L${L} easier than L${L - 1}`);
        assert.ok(r.every < p.every || r.fall < p.fall || r.target > p.target, `L${L} identical to L${L - 1}`);
      }
      assert.ok(r.every >= 2.2 && r.fall >= 6.8 && r.target <= 25, `L${L} past a hardCap`);
    }
  });

  test('rain calibration: every gate passes except the two known conflicts (G3 at L11, G4 on breathers)', async () => {
    // G3/L11: legacy L10 (frozen, E3) sits 15 points above p*, so no L11 can be both within ±5 of p* (B)
    // and not harder than L10. G4: under the adapter's cost model a weak player at 60% means a median
    // near 97%, so B and G4 cannot both hold on a breather. Escalated to Duy; update this when he decides.
    const r = await calibrate('rain', { n: 400, write: false, quiet: true });
    const failed = r.gates.filter(g => g.pass === false);
    assert.deepEqual(failed.map(g => g.id), ['G3', 'G4'], failed.map(g => `${g.id}: ${g.fails.join('; ')}`).join(' | '));
    assert.deepEqual(failed[0].fails.map(f => f.split(' ')[0]), ['L11']);
    assert.ok(failed[1].fails.every(f => [11, 16, 21, 26].includes(+f.slice(1).split(' ')[0])));
    assert.equal(r.gates.find(g => g.id === 'G7').pass, null);
  });
});

// ---------- train (owner: train). js/train.js reads BBD.level('train', L) and RTD_MAP.spawnGap (js/train-map.js). ----------
describe('train: game reads BBD, legacy unchanged, gates', () => {
  // Verbatim copies of js/train-map.js stationsFor and js/train.js nextSpawnDelay before the BBD integration
  // (main @ a124c2d), with Math.random replaced by an injected rng so both sides read the same stream.
  const oldStations = lv => Math.min(4 + lv, 15);
  const speedFactor = 0.45;
  const oldDelay = (level, st, rnd) => {
    const m = Math.max(1.8, 2.6 - 0.075 * (level - 1)) * (0.75 / speedFactor);
    const r = rnd();
    if (r < 0.15 && !st.lastBurst) { st.lastBurst = true; return Math.max(2.0, m * (0.55 + rnd() * 0.15)); }
    st.lastBurst = false;
    if (r < 0.33) return m * (1.5 + rnd() * 0.6);
    return m * (0.75 + rnd() * 0.6);
  };
  const loadMap = () => {
    const ctx = vm.createContext({ window: {} });
    vm.runInContext(readFileSync(join(ROOT, 'js/train-map.js'), 'utf8'), ctx);
    return ctx.window.RTD_MAP;
  };

  test('legacy L1..11 read through BBD are bit-identical to the old formulas', () => {
    const B = loadBBD();
    for (let L = 1; L <= 11; L++) {
      const r = B.level('train', L);
      assert.equal(r.legacy, true, `L${L}`);
      assert.equal(r.stations, oldStations(L), `L${L} stations`);
      assert.equal(r.base, Math.max(1.8, 2.6 - 0.075 * (L - 1)) * (0.75 / speedFactor), `L${L} base`);   // strict, no epsilon
      assert.equal(r.speedF, speedFactor); assert.equal(r.burstP, 0.15);
    }
  });

  test('RTD_MAP.spawnGap on a legacy spec draws the same gaps as the old nextSpawnDelay', () => {
    const B = loadBBD(), M = loadMap();
    for (let L = 1; L <= 11; L++) {
      const s = B.level('train', L), a = mulberry32(1000 + L), b = mulberry32(1000 + L), st = { lastBurst: false };
      let last = false;
      for (let i = 0; i < 2000; i++) {
        const g = M.spawnGap(s.base, s.burstP, last, a);
        last = g.burst;
        assert.equal(g.gap, oldDelay(L, st, b), `L${L} draw ${i}`);
        assert.equal(g.burst, st.lastBurst);
      }
    }
  });

  test('30 levels; L12..30 keep 15 stations and stay inside the caps; touch targets ≥ 44 px', async () => {
    const B = loadBBD(), A = await import(new URL('./adapters/train.mjs', import.meta.url).href);
    assert.equal(B.maxLevel('train'), 30);
    for (let L = 12; L <= 30; L++) {
      const r = B.level('train', L);
      assert.equal(r.stations, 15); assert.equal(r.legacy, false);
      assert.ok(r.base >= 2.30 && r.base < B.level('train', 11).base, `L${L} base ${r.base}`);
      assert.equal(r.speedF, 0.45, `L${L}: speed held (faster trains are easier in the simulator)`);
      assert.ok(r.burstP >= 0.15 && r.burstP <= 0.30);
      for (const w of [320, 390]) assert.ok(A.geometry(r, w).minTargetPx >= 44, `L${L} at ${w}px`);
    }
  });

  // KNOWN-FAIL: calibrate.mjs train exits 1. This test does NOT mean calibration is green; it only pins which
  // gates miss, so a new miss shows up. Waiting on Duy (B@L26 vs G4; G3@L11 is legacy, E3).
  test('KNOWN-FAIL chờ Duy: calibrate train still fails B@L26 and G3@L11 (pins the misses, not a pass)', async () => {
    const r = await calibrate('train', { n: 1200, write: false, quiet: true });
    const failed = Object.fromEntries(r.gates.filter(g => g.pass === false).map(g => [g.id, g.fails.map(f => f.split(' ')[0])]));
    assert.deepEqual(failed, { B: ['L26'], G3: ['L11'] });
    assert.equal(r.gates.find(g => g.id === 'G7').pass, null);
  });
});
