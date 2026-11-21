// Koi block of scripts/sim/difficulty.test.mjs, split out to keep that file under 800 lines (review 2026-11-21).
// Registered from difficulty.test.mjs, which hands over its shared helpers, so `npm run test:sim` still runs it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBBD } from './load-bbd.mjs';
import { calibrate } from './calibrate.mjs';

export function registerKoi({ loadCore, J, failsByGate }) {
// ---------- koi (owner: koi levels branch). Table v2: L1..10 retuned to the sawtooth (E3 lifted 2026-11-21). ----------
describe('koi: table v2, one template for every level', () => {
  test('koi legacyLevels (v1) = old js/koi.js params(d); E3 = true still plays them bit-exact', async () => {
    const B = loadBBD();
    const { legacyParams, LEGACY_N } = await import('./adapters/koi.mjs');
    const leg = B.spec('koi').legacy;
    assert.equal(leg.length, LEGACY_N);
    for (let d = 1; d <= LEGACY_N; d++) {
      const old = legacyParams(d), r = leg[d - 1];
      assert.equal(r.koi, old.koi, `L${d} koi`); assert.equal(r.decoys, old.decoys, `L${d} decoys`);
      assert.ok(Math.abs(r.cd - old.cd) < 1e-9, `L${d} cd ${r.cd} vs ${old.cd}`);
    }
    B.CONFIG.E3_FREEZE_LEGACY = true;
    try { assert.equal(B.level('koi', 1).koi, 6); assert.equal(B.level('koi', 1).legacy, true); }
    finally { B.CONFIG.E3_FREEZE_LEGACY = false; B.clearCache(); }
  });
  test('koi v2: L1..10 authored, same level numbers (no ids), L10 = v1 L10 so generated L11+ keep their anchors', () => {
    const B = loadBBD();
    assert.equal(B.version('koi'), 2);
    assert.equal(B.authoredCount('koi'), 10);
    for (let L = 1; L <= 10; L++) {
      const r = B.level('koi', L);
      assert.equal(r.authored, true); assert.equal(r.legacy, false);
      assert.equal(B.levelId('koi', L), L, 'stars stay keyed by level number');
      assert.ok(Math.abs(r.cd - (1.3 + 0.15 * L)) < 1e-9, `L${L} cd keeps the v1 wait`);
    }
    const l10 = B.level('koi', 10), v1 = B.spec('koi').legacy[9];
    for (const k of ['koi', 'cd', 'decoys']) assert.equal(l10[k], v1[k], `L10 ${k}`);
  });
  test('koi: 30 levels follow one template and stay inside the tracking limits', () => {
    const B = loadBBD();
    assert.equal(B.maxLevel('koi'), 30);
    for (let L = 1; L <= 30; L++) {
      const r = B.level('koi', L);
      assert.ok(r.koi >= 12 && r.koi <= 15, `L${L} koi ${r.koi}`);
      if (r.kind === 'breather') assert.equal(r.koi, 12, `L${L} breather drops to 12 fish`);
      assert.ok(r.spdMul <= 1.4 && r.turnMul <= 1.5 && r.decoys <= 6, `L${L} ${JSON.stringify(r)}`);
      if (r.spdMul > 1.25) assert.ok(r.koi <= 14, `L${L}: fast fish never come with a full pond`);
      if (L === 1) continue;
      const p = B.level('koi', L - 1);
      // A step must change something the player sees (count, grey fish, speed, turning); a +0.05 s wait alone is not felt.
      if (r.kind !== 'breather') assert.ok(['koi', 'decoys', 'spdMul', 'turnMul'].some(k => r[k] !== p[k]), `koi L${L}: no visible change from L${L - 1}`);
      // Grey fish never drop, and in L1..10 they only change on peaks and breathers.
      assert.ok(r.decoys >= p.decoys, `L${L} decoys ${p.decoys} → ${r.decoys}`);
      if (L <= 10 && r.kind === 'step') assert.equal(r.decoys, p.decoys, `L${L}: a step adds a koi, not grey fish`);
    }
  });
  test('koi progress: old keys (v1, no marker) → v2 keeps best, stars and koi_lv2; corrupt data does not crash', () => {
    const v1 = { bb_stats: JSON.stringify({ koi: { best: 7, stars: { 1: 3, 2: 2, 7: 1 } }, mem: { best: 2, stars: { 1: 1 } } }), koi_lv2: '8', koi_best: '7' };
    const { BB, ls } = loadCore({ init: v1 });
    const r = BB.migrateProgress('koi');
    assert.deepEqual([r.ran, r.reason, r.from, r.to], [true, 'migrated', 1, 2]);
    assert.deepEqual(J(BB.gameStats('koi')), { best: 7, stars: { 1: 3, 2: 2, 7: 1 } });
    assert.equal(BB.starsAt('koi', 7), 1);
    assert.equal(ls.get('bb_tablev_koi'), '2');
    assert.deepEqual([ls.get('koi_lv2'), ls.get('koi_best')], ['8', '7']);   // game keys are not the engine's
    assert.deepEqual(JSON.parse(ls.get('bb_stats')).mem, { best: 2, stars: { 1: 1 } });
    const snap = ls.get('bb_stats');
    assert.equal(BB.migrateProgress('koi').reason, 'current');               // once per table version
    assert.equal(ls.get('bb_stats'), snap);
    // junk stars and a corrupt marker: cleaned, best kept, no throw
    const c = loadCore({ init: { bb_stats: JSON.stringify({ koi: { best: '9', stars: { 3: '2', 4: 0, 5: 'x', 6: 7 } } }), bb_tablev_koi: 'zz' } });
    assert.equal(c.BB.migrateProgress('koi').reason, 'migrated');
    assert.deepEqual(J(c.BB.gameStats('koi')), { best: 9, stars: { 3: 2, 6: 3 } });
    for (const bad of ['{bad', '[]', '5']) assert.equal(loadCore({ init: { bb_stats: bad } }).BB.migrateProgress('koi').ran, true, bad);
    // a newer marker (rolled-back build) leaves data alone
    const n = loadCore({ init: { bb_stats: JSON.stringify({ koi: { best: 3, stars: { 1: 3 } } }), bb_tablev_koi: '3' } });
    assert.equal(n.BB.migrateProgress('koi').reason, 'newer');
    assert.equal(n.ls.get('bb_tablev_koi'), '3');
  });
  // N=2000 (≈2 s): at N=400 the sampling error (±2 points) is close to the B band, so a pass there can be luck.
  // KNOWN-FAIL G1 L5 only: p*(5) = 0.797 caps the median at 0.847 (gate B) while G1 asks weak ≥ 0.85, and weak
  // never beats median. No table can pass both; the engine owner sent it to Duy as options (a)/(b)/(c).
  test('KNOWN-FAIL koi (G1 L5 vs B, waiting for Duy): calibrate at N=2000', async () => {
    const r = await calibrate('koi', { n: 2000, write: false, quiet: true });
    assert.deepEqual(failsByGate(r), { G1: [5] });
  });
});
}
