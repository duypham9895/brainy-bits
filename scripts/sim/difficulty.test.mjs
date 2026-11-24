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
  // Duy 2026-11-22 (B): first peak L15, first breather L16, L1–14 steps (kind of L1..31: difficulty.sawtooth.test.mjs).
  assert.equal(B.kind(5), 'step'); assert.equal(B.kind(10), 'step'); assert.equal(B.kind(1), 'step');
  assert.equal(B.kind(15), 'peak'); assert.equal(B.kind(16), 'breather');
  assert.equal(B.kind(30), 'peak'); assert.equal(B.kind(31), 'breather'); assert.equal(B.kind(29), 'step');
  close(B.pStar(1), 0.97);                                   // early ramp 0.97 → 0.90 over L1–15
  close(B.pStar(30), 0.69);                                  // E1 = A: L30 peak ≈ 0.69
  close(B.pStar(29), 0.90 - 0.15 * 14 / 15);                 // 0.90 (L15) → 0.75 (L30) in a straight line
  close(B.pStar(15), 0.90 - 0.06);
  close(B.pStar(16), 0.90 - 0.15 / 15);                      // breather offset 0 (A-1 fix)
  close(B.pStar(5), 0.97 - 0.07 * 4 / 14);
  close(B.pStar(31), 0.92 - 0.17 * Math.sqrt(30 / 29));      // √ curve from L31
  for (let L = 16; L <= 41; L += 5) {                         // breather between its peak and L−4
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

// E3 lifted 2026-11-21: legacyLevels stay in every table as reference data (parity, progress migration).
// Checked on spec.legacy, not on level(), so a game owner retuning `levels` does not break this test.
test('legacyLevels keep the old game formulas; E3 = true plays them again', () => {
  const B = loadBBD();
  assert.equal(B.CONFIG.E3_FREEZE_LEGACY, false);
  const leg = g => B.spec(g).legacy;
  assert.equal(leg('mem').length, 13);
  leg('mem').forEach((r, i) => {                              // js/mem.js spec(L)
    const L = i + 1, t0 = 2 + L, size = t0 <= 4 ? 3 : t0 <= 7 ? 4 : t0 <= 11 ? 5 : 6, t = Math.min(t0, size * size - 1);
    assert.equal(r.t, t); assert.equal(r.size, size); close(r.show, 1 + 0.3 * t);
  });
  leg('train').forEach((r, i) => {                            // js/train-map.js + js/train.js
    const L = i + 1;
    assert.equal(r.stations, Math.min(4 + L, 15)); close(r.base, Math.max(1.8, 2.6 - 0.075 * (L - 1)) * (0.75 / 0.45), 1e-3);
  });
  leg('koi').forEach((r, i) => {                              // js/koi.js params(d)
    const d = i + 1;
    assert.equal(r.koi, Math.min(5 + d, 15)); close(r.cd, Math.min(1.3 + 0.15 * d, 3.2));
    assert.equal(r.decoys, d >= 3 ? Math.min(1 + ((d - 3) / 2 | 0), 4) : 0);
  });
  leg('rain').forEach((r, i) => {                             // js/rain.js spec(L)
    const L = i + 1;
    close(r.fall, Math.max(8, 13 - 0.55 * (L - 1))); close(r.every, Math.max(2.7, 4.6 - 0.2 * (L - 1))); assert.equal(r.target, 10 + L);
  });
  assert.equal(leg('word')[29].phrase, 30);                   // old L30 = "mưa phùn": reference for star migration
  B.CONFIG.E3_FREEZE_LEGACY = true;                           // one-line switch really switches back
  for (const g of [...KNOB_GAMES, 'word']) {
    const n = leg(g).length;
    assert.equal(B.authoredCount(g), n);
    for (let L = 1; L <= n; L++) {
      const r = B.level(g, L);
      assert.equal(r.legacy, true, `${g} L${L}`);
      for (const [k, v] of Object.entries(leg(g)[L - 1])) assert.equal(r[k], v, `${g} L${L} ${k}`);
    }
  }
});

test('levels: authored L1..n play as written (no legacy flag), formula continues from row n', () => {
  const B = loadBBD({ games: [] });
  const k = { name: 'a', int: true, max: 20, hardCap: 25 };
  B.register('toy', { legacyLevels: [{ a: 1 }, { a: 2 }], levels: [{ a: 3 }, { a: 4 }, { a: 6 }], knobs: [k],
    overrides: { 2: { a: 5 } }, derive: r => ({ twice: r.a * 2 }) });
  assert.equal(B.authoredCount('toy'), 3);
  const l1 = B.level('toy', 1);
  assert.deepEqual([l1.a, l1.legacy, l1.authored, l1.twice], [3, false, true, 6]);
  assert.equal(B.level('toy', 2).a, 5);                       // overrides still apply to authored rows
  assert.equal(B.level('toy', 4).authored, undefined);
  assert.ok(B.level('toy', 4).a >= 6 && B.level('toy', 30).a === 20);
  B.CONFIG.E3_FREEZE_LEGACY = true;
  assert.equal(B.level('toy', 1).a, 1); assert.equal(B.level('toy', 1).legacy, true);
  // without `levels` a table keeps playing legacyLevels even with E3 lifted (gated like any level)
  B.CONFIG.E3_FREEZE_LEGACY = false;
  B.register('old', { legacyLevels: [{ a: 1 }, { a: 2 }], knobs: [k] });
  assert.equal(B.level('old', 2).legacy, true); assert.equal(B.authoredCount('old'), 2);
  // validation: every live knob present, rule knobs default to off, ids non-numeric and unique
  assert.throws(() => B.register('bad', { levels: [{ b: 1 }], knobs: [{ ...k, min: 1 }] }), /misses knob "a"/);
  B.register('rule', { levels: [{ a: 1 }], knobs: [k, { name: 'r', rule: true, off: 0, min: 0, max: 1, hardCap: 1 }] });
  assert.equal(B.level('rule', 1).r, 0);
  assert.throws(() => B.register('bad', { levels: [{ id: '7' }], knobs: [] }), /non-numeric/);
  assert.throws(() => B.register('bad', { levels: [{ id: 'p1' }, { id: 'p1' }], knobs: [] }), /duplicate/);
  assert.throws(() => B.register('bad', { levels: [], knobs: [{ name: 'id', min: 1, hardCap: 2 }] }), /reserved/);
});

test('stable level ids: levelId = row id when the table sets one, else L; reorder keeps the id with its content', () => {
  const B = loadBBD({ games: [] });
  B.register('cw', { version: 2, levels: [{ id: 'p4', phrase: 4 }, { id: 'p0', phrase: 0 }, { id: 'p9', phrase: 9 }], knobs: [] });
  assert.equal(B.levelId('cw', 1), 'p4'); assert.equal(B.levelId('cw', 3), 'p9');
  assert.equal(B.maxLevel('cw'), 3); assert.equal(B.version('cw'), 2);
  B.register('cw2', { version: 3, levels: [{ id: 'p0', phrase: 0 }, { id: 'p4', phrase: 4 }, { id: 'p7', phrase: 7 }, { id: 'p9', phrase: 9 }], knobs: [] });
  assert.equal(B.levelId('cw2', 2), 'p4');                    // phrase 4 moved L1 → L2, its star key did not
  const real = loadBBD();
  // Tables move to version 2 as their owners retune them (mem 2026-11-21): any integer ≥ 1 is valid.
  for (const g of [...KNOB_GAMES, 'word']) assert.ok(Number.isInteger(real.version(g)) && real.version(g) >= 1, g);
  for (const g of KNOB_GAMES) assert.equal(real.levelId(g, 3), 3, g);       // knob tables keep level-number keys
  assert.match(String(real.levelId('word', 3)), /^p\d+$/);                   // word v2 keys stars by phrase id
  assert.throws(() => B.register('v', { version: 0, knobs: [] }), /version/);
  assert.throws(() => B.register('v', { version: 1.5, knobs: [] }), /version/);
});

test('generated levels are monotone except breathers, and breathers relieve', () => {
  const B = loadBBD();
  for (const g of KNOB_GAMES) {
    const s = B.spec(g), n = B.authoredCount(g);
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
    for (let L = B.authoredCount(g) + 1; L <= 120; L++) {
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

// ---------- progress migration (BBD.progress, called by BB.migrateProgress in js/core.js) ----------
const memStorage = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
};
const J = x => JSON.parse(JSON.stringify(x));                 // vm-realm objects → plain, for deepEqual
const statsOf = st => JSON.parse(st.getItem('bb_stats'));

test('progress.run: version bump maps stars, never lowers best, writes marker bb_tablev_<g>', () => {
  const B = loadBBD({ games: [] });
  // old table: level L = phrase OLD[L-1]; new table: ids 'p<phrase>' in a new order
  const OLD = [4, 0, 9];
  B.register('cw', { version: 2, knobs: [], levels: [{ id: 'p0' }, { id: 'p4' }, { id: 'p9' }],
    migrate: ({ from, stars, best, remapLevels }) => ({ best, stars: from < 2 ? remapLevels(stars, L => `p${OLD[L - 1]}`) : stars }) });
  const st = memStorage({ bb_stats: JSON.stringify({ cw: { best: 2, stars: { 1: 3, 2: 1 } }, koi: { best: 7, stars: { 3: 2 } } }) });
  const r = B.progress.run(st, 'cw');
  assert.deepEqual([r.ran, r.from, r.to, r.reason], [true, 1, 2, 'migrated']);
  assert.deepEqual(statsOf(st).cw, { best: 2, stars: { p4: 3, p0: 1 } });
  assert.deepEqual(statsOf(st).koi, { best: 7, stars: { 3: 2 } });   // other games untouched
  assert.equal(st.getItem('bb_tablev_cw'), '2');
  // idempotent: second run is a no-op, data identical
  const snap = st.getItem('bb_stats');
  assert.equal(B.progress.run(st, 'cw').reason, 'current');
  assert.equal(st.getItem('bb_stats'), snap);
  // even if the marker write had been lost, remapLevels only moves numeric keys: a re-run changes nothing
  st.m.delete('bb_tablev_cw');
  assert.equal(B.progress.run(st, 'cw').ran, true);
  assert.equal(st.getItem('bb_stats'), snap);
  // a mapper that tries to lower best cannot
  B.register('low', { version: 2, knobs: [], migrate: () => ({ best: 1, stars: {} }) });
  const s2 = memStorage({ bb_stats: JSON.stringify({ low: { best: 9, stars: { 9: 3 } } }) });
  B.progress.run(s2, 'low');
  assert.equal(statsOf(s2).low.best, 9);
  // default mapper (none) = keep data as is, same level numbers
  B.register('same', { version: 3, knobs: [] });
  const s3 = memStorage({ bb_stats: JSON.stringify({ same: { best: 4, stars: { 1: 2, 4: 3 } } }), bb_tablev_same: '2' });
  const r3 = B.progress.run(s3, 'same');
  assert.deepEqual([r3.from, r3.to], [2, 3]); assert.deepEqual(statsOf(s3).same, { best: 4, stars: { 1: 2, 4: 3 } });
});

test('progress.run: corrupt or odd data never throws and never loses levels passed', () => {
  const B = loadBBD({ games: [] });
  B.register('g', { version: 2, knobs: [] });
  const cases = [
    {}, { bb_stats: '{bad json' }, { bb_stats: '[]' }, { bb_stats: '5' }, { bb_stats: 'null' },
    { bb_stats: JSON.stringify({ g: 'x' }) }, { bb_stats: JSON.stringify({ g: { best: 'NaN', stars: [3, 2] } }) },
    { bb_stats: JSON.stringify({ g: { best: -4, stars: { 1: 'abc', 2: 9, 3: 0, 4: 2.7 } } }) },
    { bb_stats: JSON.stringify({ g: { best: 6.9 } }), bb_tablev_g: 'zz' },
    { bb_stats: JSON.stringify({ g: { best: 3 } }), bb_tablev_g: '-1' },
  ];
  const out = cases.map(c => { const st = memStorage(c); const r = B.progress.run(st, 'g'); return [r, statsOf(st).g, st.getItem('bb_tablev_g')]; });
  out.forEach(([r, g, mark], i) => { assert.equal(r.ran, true, `case ${i}`); assert.equal(mark, '2', `case ${i}`); });
  assert.deepEqual(out[6][1], { best: 0, stars: {} });
  assert.deepEqual(out[7][1], { best: 0, stars: { 2: 3, 4: 2 } });  // stars clamped to 1..3, junk dropped
  assert.equal(out[8][1].best, 6);                            // corrupt marker = from version 1, best kept
  assert.equal(out[9][1].best, 3);
  // a newer marker (older build loaded after a newer one) leaves everything alone
  const nw = memStorage({ bb_stats: JSON.stringify({ g: { best: 5, stars: { 5: 3 } } }), bb_tablev_g: '7' });
  assert.equal(B.progress.run(nw, 'g').reason, 'newer'); assert.equal(nw.getItem('bb_tablev_g'), '7');
  // mapper throws: data and marker untouched, next load retries
  B.register('boom', { version: 2, knobs: [], migrate: () => { throw new Error('x'); } });
  const bm = memStorage({ bb_stats: JSON.stringify({ boom: { best: 2 } }) });
  assert.equal(B.progress.run(bm, 'boom').reason, 'mapper-error'); assert.equal(bm.getItem('bb_tablev_boom'), null);
  // storage throws on write: no marker, no crash
  const ro = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(B.progress.run(ro, 'g').reason, 'storage-error');
  assert.equal(B.progress.run({ getItem: () => { throw new Error('denied'); }, setItem: () => {} }, 'g').ran, true);
  // unknown game without a version: refused, not thrown; with opts.version: runs
  assert.equal(B.progress.run(memStorage(), 'nope').reason, 'no-version');
  assert.equal(B.progress.run(memStorage(), 'nope', { version: 2 }).ran, true);
  // fresh install: version 1 tables just write the marker
  B.register('one', { knobs: [] });
  const f = memStorage();
  assert.equal(B.progress.run(f, 'one').reason, 'current'); assert.equal(f.getItem('bb_tablev_one'), '1');
});

test('progress.remapLevels: numeric keys move, ids pass through, collisions keep the higher star', () => {
  const { progress } = loadBBD({ games: [] });
  const once = progress.remapLevels({ 1: 2, 2: 3, p7: 1, 3: 1 }, L => (L === 3 ? null : `p${L === 1 ? 7 : 8}`));
  assert.deepEqual(J(once), { p7: 2, p8: 3, 3: 1 });              // L3 unmapped: kept, never dropped
  assert.deepEqual(J(progress.remapLevels(once, L => `q${L}`)), { p7: 2, p8: 3, q3: 1 });
  const ids = progress.remapLevels({ p7: 2, p8: 3 }, () => 'zz');
  assert.deepEqual(J(ids), { p7: 2, p8: 3 });
});

// js/core.js in a vm with a fake browser: record/gameStats keep working on old data, ids and migration wire through.
function loadCore({ init = {}, withBBD = true, games } = {}) {
  const ls = new Map(Object.entries(init));
  const localStorage = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k),
    key: i => [...ls.keys()][i] ?? null, get length() { return ls.size; } };
  const noop = () => {};
  const document = { readyState: 'complete', addEventListener: noop, querySelectorAll: () => [], getElementById: () => null, hidden: false };
  const ctx = vm.createContext({ console, localStorage, document, addEventListener: noop, setTimeout, clearTimeout,
    navigator: {}, performance: { now: () => 0 }, location: { origin: 'x', pathname: '/' } });
  ctx.window = ctx;
  if (withBBD) {
    vm.runInContext(readFileSync(join(ROOT, 'js/difficulty.js'), 'utf8'), ctx);
    (games || ['train', 'koi', 'mem', 'rain', 'word']).forEach(g => vm.runInContext(readFileSync(join(ROOT, `js/levels/${g}.js`), 'utf8'), ctx));
  }
  vm.runInContext(readFileSync(join(ROOT, 'js/core.js'), 'utf8'), ctx);
  return { BB: ctx.BB, BBD: ctx.BBD, ls };
}

test('core: BB.record / gameStats keep old data; stable ids; corrupt bb_stats does not crash', () => {
  const old = { bb_stats: JSON.stringify({ mem: { best: 5, stars: { 1: 3, 5: 2 } } }) };
  const { BB, BBD, ls } = loadCore({ init: old });
  assert.deepEqual(J(BB.gameStats('mem')), { best: 5, stars: { 1: 3, 5: 2 } });
  assert.equal(BB.starsAt('mem', 5), 2);
  const r = BB.record({ game: 'mem', level: 6, won: true, stars: 1 });
  assert.equal(r.newBest, true); assert.equal(BB.gameStats('mem').stars[6], 1);
  assert.equal(JSON.parse(ls.get('bb_log')).at(-1).id, undefined);   // default id = level, not repeated in the log
  // explicit id (word will pass phrase ids): star goes under the id, best still counts levels
  BB.record({ game: 'word', level: 3, won: true, stars: 3, id: 'p17' });
  assert.deepEqual(J(BB.gameStats('word')), { best: 3, stars: { p17: 3 } });
  assert.equal(JSON.parse(ls.get('bb_log')).at(-1).id, 'p17');
  // a table that sets ids: record and starsAt resolve them without the game passing id
  BBD.register('idg', { levels: [{ id: 'a1' }, { id: 'b2' }], knobs: [] });
  assert.equal(BB.levelKey('idg', 2), 'b2');
  for (const bad of ['[]', '5', '"str"', '{x', JSON.stringify({ mem: 'x' }), JSON.stringify({ mem: { stars: [1] } })]) {
    const c = loadCore({ init: { bb_stats: bad } });
    assert.deepEqual(J(c.BB.gameStats('mem')), { best: 0, stars: {} }, bad);
    const rr = c.BB.record({ game: 'mem', level: 1, won: true, stars: 2 });
    assert.equal(rr.newBest, true, bad); assert.equal(c.BB.starsAt('mem', 1), 2, bad);
  }
});

test('core: BB.migrateProgress runs once per table version, keeps levels passed, works without BBD', () => {
  const { BB, BBD, ls } = loadCore({ init: { bb_stats: JSON.stringify({ mem: { best: 13, stars: { 13: 3 } } }) } });
  // mem ships table v2 (same level numbers, identity mapper): data without a marker is v1 and moves once.
  assert.deepEqual(J(BB.migrateProgress('mem')), { ran: true, reason: 'migrated', game: 'mem', from: 1, to: 2,
    before: { best: 13, stars: { 13: 3 } }, after: { best: 13, stars: { 13: 3 } } });
  assert.equal(ls.get('bb_tablev_mem'), '2');
  assert.equal(BB.migrateProgress('mem').reason, 'current');
  assert.deepEqual(J(BB.gameStats('mem')), { best: 13, stars: { 13: 3 } });
  // a game whose new table (version 2) reorders content and sets ids
  ls.set('bb_stats', JSON.stringify({ ...JSON.parse(ls.get('bb_stats')), cw: { best: 2, stars: { 1: 3, 2: 2 } } }));
  BBD.register('cw', { version: 2, knobs: [], levels: [{ id: 'p1' }, { id: 'p0' }, { id: 'p2' }],
    migrate: ({ stars, best, remapLevels }) => ({ best, stars: remapLevels(stars, L => `p${L - 1}`) }) });
  const r = BB.migrateProgress('cw');
  assert.deepEqual([r.ran, r.from, r.to], [true, 1, 2]);
  assert.deepEqual(J(BB.gameStats('cw')), { best: 2, stars: { p0: 3, p1: 2 } });
  assert.equal(BB.starsAt('cw', 1), 2); assert.equal(BB.starsAt('cw', 2), 3);   // stars follow content, not position
  assert.equal(BB.migrateProgress('cw').reason, 'current');
  assert.deepEqual(J(BB.gameStats('mem')), { best: 13, stars: { 13: 3 } });
  assert.equal(loadCore({ withBBD: false }).BB.migrateProgress('mem').reason, 'no-engine');
});

// Review 2026-11-22 (#4): word reorders phrases (table v2) while bb_stats.word.best keeps v1 level numbers. A game
// registers its own count (BB.setProgress); hub, daily and share read BB.progressOf; the rest fall back to best.
test('core: progress registry drives daily level and share stars; unregistered games keep best', () => {
  // v1 word player: passed L1–5 with 3 stars, train L3 with 2 stars. Migration moves word stars to phrase ids.
  const v1 = { bb_stats: JSON.stringify({ word: { best: 5, stars: { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 } }, train: { best: 3, stars: { 3: 2 } } }) };
  const { BB } = loadCore({ init: v1 });
  BB.migrateProgress('word');
  assert.deepEqual(J(BB.progressOf('word')), { done: 5, next: 6, best: 5, registered: false });   // fallback = best
  assert.equal(BB.starsAt('word', 5), 0, 'v2 L5 is another phrase: the bug the registry fixes');
  // The counter word.js registers: a level is done when its phrase has stars (same shape as js/word.js).
  const max = BB.LV_MAX.word, done = L => BB.starsAt('word', L) > 0;
  assert.equal(BB.setProgress('word', () => {
    let n = 0, next = 1, top = 0;
    for (let L = 1; L <= max; L++) if (done(L)) { n++; top = L; }
    while (next < max && done(next)) next++;
    return { done: n, next, best: top };
  }), true);
  const p = BB.progressOf('word');
  assert.equal(p.registered, true); assert.equal(p.done, 5);
  assert.equal(BB.starsAt('word', p.best), 3, 'share names a level whose phrase was really played');
  assert.equal(p.next, Array.from({ length: max }, (_, i) => i + 1).find(L => !done(L)));
  const share = BB.shareText();
  assert.match(share, new RegExp(`Đoán Cụm Từ: Lv ${p.best} \\(3/3 ★\\)`));
  assert.match(share, /Đường Ray: Lv 3 \(2\/3 ★\)/);                       // train: unregistered, best as before
  // Daily challenge: on a Word day the level is the registered next level, not best + 1.
  let date = null;
  for (let i = 0; i < 400 && !date; i++) { const k = BB.dayKey(new Date(2027, 0, 1 + i)); BB.store.del('bb_daily_pin'); if (BB.daily(k).game === 'word') date = k; }
  assert.ok(date); BB.store.del('bb_daily_pin');
  assert.equal(BB.daily(date).level, p.next);
  // Bad registrations never break the hub: unknown game refused, a throwing or junk counter falls back to best.
  assert.equal(BB.setProgress('nope', () => ({})), false);
  BB.setProgress('word', () => { throw new Error('x'); });
  assert.equal(BB.progressOf('word').registered, false);
  BB.setProgress('word', () => ({ done: 'x', next: 2 }));
  assert.equal(BB.progressOf('word').registered, false);
  BB.setProgress('word', () => ({ done: 999, next: -4 }));
  assert.deepEqual(J(BB.progressOf('word')), { done: max, next: 1, best: max, registered: true });   // clamped
});

test('core: resetAll also removes table-version markers (bb_tablev_*) and seed flags', () => {
  const { BB, ls } = loadCore({ init: { bb_stats: '{}', bb_tablev_word: '3', bb_tablev_koi: '2', bb_seed_mem: '1', bb_sound: '0' } });
  BB.resetAll();
  assert.deepEqual([...ls.keys()].filter(k => /^bb_(tablev|seed|stats)/.test(k)), []);
  assert.equal(ls.get('bb_sound'), '0', 'settings stay');
});

// Review 2026-11-22 (#7): `start` hard-codes the value of the last step row of a table of `startAt` rows. Appending
// rows must not pull the next generated level back to it.
test('anchor: knob start applies only while levels has startAt rows; start without startAt is refused', () => {
  const B = loadBBD({ games: [] });
  const rows = n => Array.from({ length: n }, (_, i) => ({ a: 10 + i }));
  const k = { name: 'a', int: true, start: 5, startAt: 30, step: 1, hardCap: 200 };
  B.register('s30', { levels: rows(30), knobs: [k] });
  assert.equal(B.level('s30', 31).a, 6, 'written for 30 rows: L31 steps on from start');
  B.register('s35', { levels: rows(35), knobs: [k] });
  assert.equal(B.level('s35', 36).a, 45, 'rows appended: L36 continues from row 35 (44), not from start');
  assert.throws(() => B.register('bad', { levels: rows(30), knobs: [{ ...k, startAt: undefined }] }), /startAt/);
  for (const g of ['koi', 'mem', 'rain']) {
    const real = loadBBD();
    real.spec(g).knobs.filter(x => x.start !== null).forEach(x => assert.equal(x.startAt, real.authoredCount(g), `${g}.${x.name}`));
  }
});

test('maxLevel follows E2 and content-only games refuse to invent levels', () => {
  const B = loadBBD();
  assert.equal(B.maxLevel('word'), 50);
  B.CONFIG.E2_WORD_LEVELS = 30; assert.equal(B.maxLevel('word'), 30);
  B.CONFIG.E2_WORD_LEVELS = 40; assert.equal(B.maxLevel('word'), 40);
  const MAX = { train: 33, koi: 33, mem: 33, rain: 33 };
  for (const g of KNOB_GAMES) assert.equal(B.maxLevel(g), MAX[g], g);
  assert.throws(() => B.level('word', 51), /content-only/);   // vm realm: match by message
  assert.throws(() => B.level('mem', 0), /integer ≥ 1/);
  assert.throws(() => B.level('nope', 1), /unknown game/);
});

test('lighter(): one notch easier, ≤ 15%, carries the E4 config', () => {
  const B = loadBBD();
  const base = B.level('mem', 30), lt = B.lighter('mem', 30);   // t = 7: one tile is 14% ≤ 15% (table v2)
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

// Failed gates → the level numbers they name, e.g. { B: [1, 2], G3: [11] }.
const failsByGate = r => Object.fromEntries(r.gates.filter(g => g.pass === false)
  .map(g => [g.id, [...new Set(g.fails.map(f => +/^L(\d+)/.exec(f)[1]))]]));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test('calibrate gates every level now (E3 lifted): B and G6 read legacy rows too', async () => {
  const r = await calibrate('mem', { n: 60, to: 6, write: false, quiet: true });
  const B = r.gates.find(g => g.id === 'B');
  assert.match(B.name, /every level/); assert.doesNotMatch(B.name, /legacy/);
  // mem plays authored `levels` (table v2) since 2026-11-21; B judges these rows like generated ones.
  assert.ok(r.levels.every(l => l.legacy === false && typeof l.knobs.t === 'number'));
  assert.deepEqual(r.levels.map(l => l.L), range(1, 6));
  assert.equal(r.gates.find(g => g.id === 'G7').pass, null);  // parity is reported as skipped, not passed
  assert.equal(r.config.tableVersion, 2);
});

// mem table v2 at full N=1200. Duy 2026-11-22 (B): B is one-sided before the first peak (L15), weak floors
// 0.90 on L1–5 and 0.82 on L6–10 (G1), weak ≥ 0.70 at L15 (G9). Every gate passes with zero waivers.
test('mem v2: zero failed gates, zero waivers, weak ≥ 0.90 on L1–5 at N=1200', async () => {
  const r = await calibrate('mem', { n: 1200, write: false, quiet: true });
  assert.deepEqual(failsByGate(r), {});
  assert.deepEqual(r.waived, []);
  assert.ok(r.levels.filter(l => l.L <= 5).every(l => l.profiles.weak.p >= 0.90));
});

// "+10 levels from the rule alone": generated L31–40 (engine knobs, no authored rows) pass every gate.
// Run from L26 so G2/G3 also judge the L30 → L31 seam against the authored rows.
test('mem L31–43 generated from the engine: zero failed gates, zero waivers at N=1200', async () => {
  const r = await calibrate('mem', { n: 1200, from: 26, to: 43, write: false, quiet: true });
  assert.deepEqual(failsByGate(r), {});
  assert.deepEqual(r.waived, []);
  assert.equal(r.gates.find(g => g.id === 'G1').status, 'SKIP', 'L1–10 not in this run');
  assert.equal(r.gates.find(g => g.id === 'G5').status, 'PASS', 'L30 is');
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
describe('mem: table v2 (one sawtooth template L1..30), v1 kept as legacyLevels', () => {
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

  test('legacyLevels = table v1 = the old spec bit-for-bit; E3 = true plays them again', () => {
    const B = loadBBD();
    assert.equal(B.spec('mem').legacy.length, 13);
    const check = r => (L) => {
      const o = oldSpec(L);
      assert.equal(r(L).t, o.t, `L${L} t`); assert.equal(r(L).size, o.size, `L${L} size`);
      assert.equal(r(L).show, o.show, `L${L} show`); assert.equal(r(L).disp, 0, `L${L} disp`);
    };
    for (let L = 1; L <= 13; L++) check(L => B.spec('mem').legacy[L - 1])(L);
    B.CONFIG.E3_FREEZE_LEGACY = true; B.clearCache();
    for (let L = 1; L <= 13; L++) { assert.equal(B.level('mem', L).legacy, true); check(L => B.level('mem', L))(L); }
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

  // Template v2: a step spreads the tiles more (disp) or adds a tile, a peak adds a tile, a breather has fewer
  // tiles or gathers them again. At t ≤ 7 disp is a real step in the sim (s6 t4: median 87% at disp 0 → 82%
  // at 0.35); the 2026-11-21 review that disp is "not a step" measured t = 15, where tiles chunk anyway.
  const harder = (a, b) => a.t > b.t || (a.t === b.t && (a.size > b.size || a.disp > b.disp + 1e-9));
  test('v2: L1..30 authored, max 33, version 2, show = 1 + 0.3·t, tiles fit, size ≤ 6', () => {
    const B = loadBBD();
    assert.equal(B.maxLevel('mem'), 33); assert.equal(B.version('mem'), 2); assert.equal(B.authoredCount('mem'), 30);
    for (let L = 1; L <= 30; L++) {
      const r = B.level('mem', L);
      assert.equal(r.legacy, false, `L${L}`); assert.equal(r.authored, true, `L${L}`);
      assert.ok(r.t < r.size * r.size && r.size <= 6 && r.t >= 3, `L${L}`);
      close(r.show, 1 + 0.3 * r.t, 1e-9); assert.equal(B.levelId('mem', L), L);   // no ids: stars stay keyed by L
    }
  });
  // A step that brings a bigger grid (L6 5×5, L9 6×6) may drop to 3 gathered tiles at the same time (Duy 2026-11-22, B:
  // the new element comes with the other knobs eased). So a step is harder when the grid grows, or on the same grid when
  // it adds a tile, or keeps the tiles and spreads them more.
  const stepHarder = (a, b) => a.size > b.size || (a.size === b.size && (a.t > b.t || (a.t === b.t && a.disp > b.disp + 1e-9)));
  test('v2 follows the sawtooth: steps and peaks harder than the level before, breathers lighter than their peak', () => {
    const B = loadBBD();
    for (let L = 2; L <= 30; L++) {
      const r = B.level('mem', L), p = B.level('mem', L - 1);
      if (r.kind === 'peak') assert.equal(r.t, p.t + 1, `L${L} peak adds one tile`);
      else if (r.kind === 'breather') assert.ok(harder(p, r), `L${L} breather lighter than peak L${L - 1}`);
      else assert.ok(stepHarder(r, p), `L${L} step harder than L${L - 1}`);
    }
    // No peak or breather before L15 (Duy 2026-11-22, B, all games).
    assert.ok(range(1, 14).every(L => B.level('mem', L).kind === 'step'));
    assert.equal(B.level('mem', 15).kind, 'peak'); assert.equal(B.level('mem', 16).kind, 'breather');
    // L1–5: 4×4 grid, 3 tiles then 4 from L3 (G1 weak ≥ 0.90). 5×5 at L6 (4 tiles L8–10), 6×6 from L11. L15 peak: 4 tiles gathered.
    assert.deepEqual(range(1, 5).map(L => B.level('mem', L).t), [3, 3, 4, 4, 4]);
    assert.deepEqual(range(6, 14).map(L => B.level('mem', L).t), [3, 3, 4, 4, 4, 3, 3, 3, 3]);
    assert.deepEqual(range(1, 10).map(L => B.level('mem', L).size), [4, 4, 4, 4, 4, 5, 5, 5, 5, 5]);
    assert.deepEqual(range(11, 14).map(L => B.level('mem', L).size), [6, 6, 6, 6]);
    assert.deepEqual([B.level('mem', 15).t, B.level('mem', 15).disp], [4, 0]);
    assert.ok(range(1, 30).every(L => B.level('mem', L).disp <= 0.5), 'disp within hardCap');
  });
  // L31+ follows the table template, anchored at the last step row (L29), not at the L30 peak.
  // Pinned rows = the ones calibrated green at N=1200 (calibrate mem --from 26 --to 45, 2026-11-22: disp start 0.1).
  test('L31–45: same template as the table (t 6 steps, peak +1 tile, breather −1 tile and gathered)', () => {
    const B = loadBBD();
    const got = []; for (let L = 31; L <= 45; L++) { const r = B.level('mem', L); got.push([r.t, r.disp]); }
    assert.deepEqual(got, [[5, 0.05], [6, 0.1], [6, 0.1], [6, 0.1], [7, 0.1], [5, 0.05], [6, 0.1], [6, 0.1], [6, 0.1], [7, 0.15],
      [5, 0.1], [6, 0.15], [6, 0.15], [6, 0.15], [7, 0.15]]);
    for (let L = 31; L <= 45; L++) {
      const r = B.level('mem', L), p = B.level('mem', L - 1);
      assert.equal(r.authored, undefined); assert.equal(r.size, 6); assert.ok(r.k >= 0.29, `L${L} k`);
      if (r.kind === 'peak') assert.equal(r.t, p.t + 1, `L${L} peak adds one tile`);
      if (r.kind === 'breather') assert.ok(harder(p, r), `L${L} breather lighter than peak`);
    }
  });
  // Review 2026-11-22: disp start 0.05 and a breather guard that skipped authored rows let L31 (disp 0) and L32–33
  // (disp 0.05) fall below the written L26 breather / L29 step. Every knob, every generated level up to L120.
  test('generated steps are never easier than the L29 step, breathers never easier than the L26 breather', () => {
    const B = loadBBD(), knobs = B.spec('mem').knobs;
    const notEasier = (a, b, what) => knobs.forEach(k => assert.ok(harderOrEqual(k, a[k.name], b[k.name]), `${what}: ${k.name} ${a[k.name]} vs ${b[k.name]}`));
    const l29 = B.level('mem', 29), l26 = B.level('mem', 26);
    let lastB = l26;
    for (let L = 31; L <= 120; L++) {
      const r = B.level('mem', L);
      if (r.kind === 'step') notEasier(r, l29, `L${L} step vs L29`);
      if (r.kind === 'breather') { notEasier(r, lastB, `L${L} breather vs L${lastB.L}`); lastB = r; }
    }
  });
  test('L46..120 stays within hardCaps and reaches them by L120 (the +10 rule ends)', () => {
    const B = loadBBD();
    for (let L = 46; L <= 120; L++) {
      const r = B.level('mem', L);
      assert.ok(r.t >= 5 && r.t <= 15 && r.size === 6 && r.k >= 0.18 && r.disp <= 0.5, `L${L}`);
    }
    assert.ok(B.exhausted('mem', 120));
  });
  // Migration v1 → v2, seeded with keys real players have (mem_lv, bb_stats, bb_log, hub seed flag).
  test('migration v1 → v2 keeps levels passed and stars, runs once, leaves old keys alone', () => {
    const old = { mem_lv: '14', bb_seeded_v1: '1', bb_stats: JSON.stringify({ mem: { best: 13, stars: { 13: 2, 5: 3, 1: 1 } }, koi: { best: 4, stars: { 4: 3 } } }),
      bb_log: JSON.stringify([{ g: 'mem', lv: 13, won: true, stars: 2, score: 2, d: '2026-11-20', ms: 9000 }]) };
    const { BB, ls } = loadCore({ init: old });
    const r = BB.migrateProgress('mem');
    assert.deepEqual([r.ran, r.reason, r.from, r.to], [true, 'migrated', 1, 2]);
    assert.deepEqual(J(BB.gameStats('mem')), { best: 13, stars: { 1: 1, 5: 3, 13: 2 } });
    assert.equal(BB.starsAt('mem', 5), 3); assert.equal(BB.starsAt('mem', 13), 2);
    assert.equal(ls.get('bb_tablev_mem'), '2');
    const after = ls.get('bb_stats');
    assert.equal(BB.migrateProgress('mem').reason, 'current'); assert.equal(ls.get('bb_stats'), after);   // second load: no-op
    for (const k of ['mem_lv', 'bb_log', 'bb_seeded_v1']) assert.equal(ls.get(k), old[k], k);
    assert.deepEqual(J(BB.gameStats('koi')), { best: 4, stars: { 4: 3 } });
  });
  test('migration survives corrupt or odd data: bad JSON, junk stars, bad marker, newer marker', () => {
    const run = init => { const c = loadCore({ init }); return { r: c.BB.migrateProgress('mem'), st: J(c.BB.gameStats('mem')), ls: c.ls }; };
    let x = run({ bb_stats: '{bad', bb_tablev_mem: 'zz' });
    assert.equal(x.r.reason, 'migrated'); assert.deepEqual(x.st, { best: 0, stars: {} }); assert.equal(x.ls.get('bb_tablev_mem'), '2');
    x = run({ bb_stats: JSON.stringify({ mem: { best: '7', stars: { 1: 'abc', 2: 9, 3: 0, 4: 2.7 } } }) });
    assert.deepEqual(x.st, { best: 7, stars: { 2: 3, 4: 2 } });
    x = run({ bb_stats: JSON.stringify({ mem: { best: 9, stars: { 9: 3 } } }), bb_tablev_mem: '3' });   // a newer build ran first
    assert.equal(x.r.reason, 'newer'); assert.deepEqual(x.st, { best: 9, stars: { 9: 3 } }); assert.equal(x.ls.get('bb_tablev_mem'), '3');
    x = run({ mem_lv: '6' });                                     // only the v1 key, no stats yet
    assert.equal(x.r.reason, 'migrated'); assert.equal(x.ls.get('mem_lv'), '6');
  });
});

// ---------- engine: sawtooth from L15 (Duy 2026-11-22 B; L10 from 2026-11-21 (1)), gate waivers. Tests in difficulty.sawtooth.test.mjs. ----------
(await import('./difficulty.sawtooth.test.mjs')).registerSawtooth();

// ---------- koi (owner: koi levels branch). Table v2: L1..30 authored on the sawtooth, L31+ from the engine (2026-11-21). ----------
// Tests live in difficulty.koi.test.mjs (file-size rule); registered here so test:sim keeps one entry point.
(await import('./difficulty.koi.test.mjs')).registerKoi({ loadCore, J, failsByGate });

// ---------- word (owner: word levels branch). js/word.js reads BBD.level('word', L).phrase. ----------
// Tests live in difficulty.word.test.mjs (file-size rule); registered here so test:sim keeps one entry point.
(await import('./difficulty.word.test.mjs')).registerWord({ loadCore, J, failsByGate });

// ---------- rain (owner: rain). js/rain.js reads BBD.level('rain', L) and BBRain.makeEq (js/levels/rain.js). ----------
// Tests live in difficulty.rain.test.mjs (file-size rule); registered here so test:sim keeps one entry point.
(await import('./difficulty.rain.test.mjs')).registerRain({ loadCore, J, failsByGate });

// ---------- train (owner: train). Table v2: L1..30 retuned to the sawtooth (E3 lifted 2026-11-21). ----------
// js/train.js reads BBD.level('train', L) and RTD_MAP.spawnGap (js/train-map.js).
describe('train: table v2, one template for every level', () => {
  // Verbatim copies of js/train-map.js stationsFor and js/train.js nextSpawnDelay before the BBD integration
  // (main @ a124c2d), with Math.random replaced by an injected rng so both sides read the same stream.
  const oldStations = lv => Math.min(4 + lv, 15);
  const speedFactor = 0.45;
  const oldBase = L => Math.max(1.8, 2.6 - 0.075 * (L - 1)) * (0.75 / speedFactor);
  const oldDelay = (level, st, rnd) => {
    const m = oldBase(level);
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

  test('train legacyLevels (v1) = old formulas bit-exact; E3 = true still plays them, same spawn gaps', () => {
    const B = loadBBD(), M = loadMap(), leg = B.spec('train').legacy;
    assert.equal(leg.length, 11);
    B.CONFIG.E3_FREEZE_LEGACY = true;
    try {
      for (let L = 1; L <= 11; L++) {
        const r = B.level('train', L);
        assert.equal(r.legacy, true, `L${L}`);
        assert.equal(r.stations, oldStations(L), `L${L} stations`);
        assert.equal(r.base, oldBase(L), `L${L} base`);   // strict, no epsilon
        assert.equal(r.speedF, speedFactor); assert.equal(r.burstP, 0.15);
        const a = mulberry32(1000 + L), b = mulberry32(1000 + L), st = { lastBurst: false };
        let last = false;
        for (let i = 0; i < 2000; i++) {
          const g = M.spawnGap(r.base, r.burstP, last, a);
          last = g.burst;
          assert.equal(g.gap, oldDelay(L, st, b), `L${L} draw ${i}`);
          assert.equal(g.burst, st.lastBurst);
        }
      }
    } finally { B.CONFIG.E3_FREEZE_LEGACY = false; B.clearCache(); }
  });

  test('train v2: L1..30 authored, keyed by level number, on the sawtooth; touch targets ≥ 44 px', async () => {
    const B = loadBBD(), A = await import(new URL('./adapters/train.mjs', import.meta.url).href);
    assert.equal(B.version('train'), 2);
    assert.equal(B.maxLevel('train'), 33);
    assert.equal(B.authoredCount('train'), 30);
    assert.equal(B.level('train', 1).stations, 5);
    for (let L = 1; L <= 30; L++) {
      const r = B.level('train', L);
      assert.equal(r.authored, true, `L${L}`); assert.equal(r.legacy, false, `L${L}`);
      assert.equal(B.levelId('train', L), L, 'stars stay keyed by level number');
      assert.ok(r.stations >= 5 && r.stations <= 15, `L${L} stations ${r.stations}`);
      if (L >= 15) assert.equal(r.stations, 15, `L${L}`);
      assert.ok(r.base >= 2.30, `L${L} base ${r.base} inside hardCap`);
      assert.equal(r.speedF, 0.32);
      assert.equal(r.burstP > 0, L >= 5, `L${L} burstP ${r.burstP}`);
      const wantSv = r.burstP > 0 ? +(Math.min(0.14, 0.06 + r.burstP * 0.4)).toFixed(2) : 0;
      assert.equal(r.speedVar, wantSv, `L${L} speedVar`);
      for (const w of [320, 390]) assert.ok(A.geometry(r, w).minTargetPx >= 44, `L${L} at ${w}px`);
      if (L === 1) continue;
      const p = B.level('train', L - 1);
      assert.ok(r.stations - p.stations <= 1, `L${L}: +1 station at most`);
      // Retune 2026-11-22 (Duy B): the old L5 drop to 5 stations is gone; the map never shrinks.
      assert.ok(r.stations >= p.stations, `L${L}: stations never drop`);
      // L1–14 (no peak yet): one knob per level, a new station keeps the base of the level before it.
      if (L <= 14) assert.ok(r.stations === p.stations || r.base === p.base, `L${L}: stations and base change at once`);
      if (r.kind === 'breather') assert.ok(r.base > p.base, `L${L}: a breather sends trains further apart than the peak before it`);
      if (r.kind === 'peak') assert.ok(r.base < p.base || r.stations > p.stations, `L${L}: a peak adds a station or sends trains closer`);
    }
    assert.equal(B.level('train', 30).base, 2.98); assert.equal(B.level('train', 30).burstP, 0.20);
  });

  test('train randomness: 2-bag allows natural doubles (0 triples), speedVar varies, bursts occur, Top-K maps vary', () => {
    const M = loadMap(), rng = mulberry32(42);
    for (const n of [5, 11, 15]) {
      const bag = [], seq = [];
      let last = -1, prev = -1, same = 0, triples = 0;
      for (let i = 0; i < 2000; i++) {
        const k = M.drawStationIdx(bag, n, last, prev, rng);
        if (k === last) same++;
        if (k === last && k === prev) triples++;
        seq.push(k); prev = last; last = k;
      }
      assert.equal(triples, 0, `n=${n} triples`);
      assert.ok(same / 1999 >= 0.09 && same / 1999 <= 0.25, `n=${n} adjSame=${same / 1999}`);
    }
    let sSum = 0;
    for (let i = 0; i < 1000; i++) {
      const sm = M.trainSpeedMul(0.12, rng);
      assert.ok(sm >= 0.88 - 1e-9 && sm <= 1.12 + 1e-9); sSum += sm;
    }
    assert.ok(Math.abs(sSum / 1000 - 1) < 0.02);
    let bursts = 0, lb = false;
    for (let i = 0; i < 1000; i++) {
      const g = M.spawnGap(3.68, 0.16, lb, rng);
      assert.ok(!(lb && g.burst), 'never two bursts in a row');
      if (g.burst) { bursts++; assert.ok(g.gap <= 2.7); }
      lb = g.burst;
    }
    assert.ok(bursts >= 50, `bursts=${bursts}`);
    const cols = new Set();
    for (let i = 0; i < 12; i++) {
      const m = M.generate(11, 390, 700);
      assert.ok(M.minSwitchDist(m) >= 2);
      cols.add(m.tunnel.g.c);
    }
    assert.ok(cols.size >= 3, `expected varied tunnel cols, got ${[...cols]}`);
  });
  // Review 2026-11-22: L2 (5 stations, base 3.46) was easier than L1 (5 stations, 3.41) and the result screen
  // said "tàu ra thưa hơn". On the same station count a non-breather never raises base over the level before
  // it, nor a step over the previous step (L1..40, so the generated L31+ are held to it too).
  test('train: no step is easier than the step before (same stations: base never rises)', () => {
    const B = loadBBD();
    let prevStep = B.level('train', 1);
    for (let L = 2; L <= 40; L++) {
      const r = B.level('train', L), p = B.level('train', L - 1);
      if (r.kind !== 'breather' && r.stations === p.stations) assert.ok(r.base <= p.base + 1e-9, `L${L} base ${r.base} > L${L - 1} ${p.base}`);
      if (r.kind === 'step' && r.stations === prevStep.stations)
        assert.ok(r.base <= prevStep.base + 1e-9, `L${L} base ${r.base} > step L${prevStep.L} ${prevStep.base}`);
      if (r.kind === 'step') prevStep = r;
    }
    assert.ok(B.level('train', 2).base < B.level('train', 1).base, 'L2 sends trains closer than L1');
  });

  test('train progress: real old keys (v1, no marker) → v2 keep best, stars and rtd_*; corrupt data does not crash', () => {
    // A finished v1 player: 11 legacy levels via rtd_best3, then L12..14 on the shared engine.
    const stars = { 1: 3, 2: 3, 5: 2, 11: 1, 12: 2, 14: 1 };
    const v1 = { bb_stats: JSON.stringify({ train: { best: 14, stars }, koi: { best: 2, stars: { 1: 1 } } }),
      rtd_best3: '14', rtd_legacy_done: '0' };
    const { BB, ls } = loadCore({ init: v1 });
    const r = BB.migrateProgress('train');
    assert.deepEqual([r.ran, r.reason, r.from, r.to], [true, 'migrated', 1, 2]);
    assert.deepEqual(J(BB.gameStats('train')), { best: 14, stars });   // level numbers keep their meaning
    assert.equal(BB.starsAt('train', 12), 2);
    assert.equal(ls.get('bb_tablev_train'), '2');
    assert.deepEqual([ls.get('rtd_best3'), ls.get('rtd_legacy_done')], ['14', '0']);   // game keys are not the engine's
    assert.deepEqual(JSON.parse(ls.get('bb_stats')).koi, { best: 2, stars: { 1: 1 } });
    const snap = ls.get('bb_stats');
    assert.equal(BB.migrateProgress('train').reason, 'current');           // once per table version
    assert.equal(ls.get('bb_stats'), snap);
    // pre-BB player: only rtd_best3, no bb_stats at all
    const o = loadCore({ init: { rtd_best3: '11' } });
    assert.equal(o.BB.migrateProgress('train').ran, true);
    assert.equal(o.ls.get('rtd_best3'), '11');
    // junk stars and a corrupt marker: cleaned, best kept, no throw
    const c = loadCore({ init: { bb_stats: JSON.stringify({ train: { best: '9', stars: { 3: '2', 4: 0, 5: 'x', 6: 7 } } }), bb_tablev_train: '-1' } });
    assert.equal(c.BB.migrateProgress('train').reason, 'migrated');
    assert.deepEqual(J(c.BB.gameStats('train')), { best: 9, stars: { 3: 2, 6: 3 } });
    for (const bad of ['{bad', '[]', '5']) assert.equal(loadCore({ init: { bb_stats: bad, rtd_best3: '4' } }).BB.migrateProgress('train').ran, true, bad);
    // a newer marker (rolled-back build) leaves data alone
    const n = loadCore({ init: { bb_stats: JSON.stringify({ train: { best: 3, stars: { 1: 3 } } }), bb_tablev_train: '3' } });
    assert.equal(n.BB.migrateProgress('train').reason, 'newer');
    assert.equal(n.ls.get('bb_tablev_train'), '3');
  });

  // Zero failures and zero waivers at full N on the authored L1..30 and the generated L31..43 ("+10 levels" from
  // the rule alone). One run so G2/G3 also see the L30 → L31 seam. G7 stays SKIP (pass: null).
  test('train: every gate green at N=1200 on L1..43, no waivers', async () => {
    const r = await calibrate('train', { n: 1200, to: 43, write: false, quiet: true });
    assert.deepEqual(failsByGate(r), {});
    assert.deepEqual(r.waived, []);
    assert.equal(r.ok, true);
    assert.deepEqual(r.gates.map(g => [g.id, g.status]),
      [['B', 'PASS'], ['G1', 'PASS'], ['G2', 'PASS'], ['G3', 'PASS'], ['G4', 'PASS'], ['G5', 'PASS'], ['G6', 'PASS'], ['G9', 'PASS'], ['G7', 'SKIP'], ['G8', 'PASS']]);
    assert.equal(r.gates.find(g => g.id === 'G7').pass, null);
  });
});
