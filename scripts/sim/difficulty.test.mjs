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

test('mem calibration passes its gates (N=400, seeded)', async () => {
  const r = await calibrate('mem', { n: 400, write: false, quiet: true });
  const failed = r.gates.filter(g => g.pass === false).map(g => `${g.id}: ${g.fails.join('; ')}`);
  assert.deepEqual(failed, []);
  assert.equal(r.gates.find(g => g.id === 'G7').pass, null);  // parity is reported as skipped, not passed
});

test('TODO adapters fail loudly instead of passing', async () => {
  for (const g of ['train', 'koi', 'rain', 'word']) await assert.rejects(calibrate(g, { n: 1, write: false, quiet: true }), /TODO stub/);
});
