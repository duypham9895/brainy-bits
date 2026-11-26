// Rain block of scripts/sim/difficulty.test.mjs, split out to keep that file under 800 lines (review 2026-11-21).
// Registered from difficulty.test.mjs, which hands over its shared helpers, so `npm run test:sim` still runs it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBBD } from './load-bbd.mjs';
import { calibrate } from './calibrate.mjs';
import { mulberry32 } from './human.mjs';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function registerRain({ loadCore, J, failsByGate }) {
// ---------- rain (owner: rain). js/rain.js reads BBD.level('rain', L) and BBRain.makeEq (js/levels/rain.js). ----------
describe('rain: game reads BBD, legacy unchanged, gates', () => {
  // Verbatim copy of the legacy mul/div generator (tiers 6..8) with injected rng,
  // kept to verify those tiers stay bit-exact while add/sub were changed to uniform pair sampling.
  const oldSpec = L => ({ fall: Math.max(8, 13 - 0.55 * (L - 1)), every: Math.max(2.7, 4.6 - 0.2 * (L - 1)), target: 10 + L });
  const oldMulDiv = (L, rnd) => {
    const ri = (a, b) => a + (rnd() * (b - a + 1) | 0);
    const mul = (x0, x1, y1) => { const a = ri(x0, x1), b = ri(1, y1); return rnd() < 0.5 ? [`${a} × ${b}`, a * b] : [`${b} × ${a}`, a * b]; };
    const div = (x1, c0, c1) => { const b = ri(2, x1), c = ri(c0, c1); return [`${b * c} ÷ ${b}`, c]; };
    const pick = arr => arr[rnd() * arr.length | 0]();
    if (L === 6) return mul(2, 5, 10);
    if (L === 7) return mul(2, 9, 9);
    return pick([() => mul(2, 9, 9), () => div(9, 1, 9)]);
  };
  // Answer check for every equation shape the generator writes.
  const solve = eq => {
    const m = /^\? ([+×]) (\d+) = (\d+)$/.exec(eq);
    if (m) return m[1] === '+' ? +m[3] - +m[2] : +m[3] / +m[2];
    return Function(`return ${eq.replace(/×/g, '*').replace(/−/g, '-').replace(/÷/g, '/')}`)();
  };

  // Table version 2 (E3 lifted 2026-11-21): the old rows stay as `legacyLevels` reference data; the game plays `levels`.
  test('legacy rows = the old spec (===); v2 plays them unchanged on L1..6, L7..10 keep tier and hold one pace (early ramp B)', () => {
    const B = loadBBD(), leg = B.spec('rain').legacy;
    assert.equal(B.version('rain'), 2);
    assert.equal(leg.length, 10);
    for (let L = 1; L <= 10; L++) {
      const r = leg[L - 1], o = oldSpec(L);
      assert.equal(r.ops, L, `L${L} ops`);
      assert.equal(r.fall, o.fall, `L${L} fall`); assert.equal(r.every, o.every, `L${L} every`); assert.equal(r.target, o.target, `L${L} target`);
    }
    for (let L = 1; L <= 30; L++) {
      const r = B.level('rain', L);
      assert.equal(r.legacy, false, `L${L}`); assert.equal(r.authored, true, `L${L}`);
      if (L <= 6) for (const k of ['ops', 'fall', 'every', 'target']) assert.equal(r[k], leg[L - 1][k], `L${L} ${k}`);
      // L7..10: content stays (decision 2); early ramp (Duy 2026-11-22, B): they hold the L6 chain and fall and one
      // spawn gap, so only the math tier changes level to level (weak ≥ 82%, G1)
      else if (L <= 10) {
        assert.equal(r.ops, leg[L - 1].ops, `L${L} ops`);
        assert.deepEqual([r.every, r.fall, r.target, r.lives], [3.8, leg[5].fall, leg[5].target, 3], `L${L} held pace`);
      }
    }
    assert.equal(B.authoredCount('rain'), 30);
  });

  test('shared generator: mul/div tiers 6..8 keep exact rng stream; add(m) and sub(m) sample uniformly without bias', async () => {
    const { makeEq } = await import('./adapters/rain.mjs');
    for (let L = 6; L <= 8; L++) for (let seed = 1; seed <= 40; seed++) {
      const a = mulberry32(seed), b = mulberry32(seed);
      for (let i = 0; i < 25; i++) assert.deepEqual([...makeEq(L, a)].slice(0, 2), oldMulDiv(L, b), `L${L} seed ${seed} draw ${i}`);
      assert.equal(a(), b(), `L${L} seed ${seed}: rng streams drifted`);
    }
    const rnd1 = mulberry32(101);
    const addCounts = new Map();
    for (let i = 0; i < 9000; i++) {
      const [eq, ans] = makeEq(1, rnd1);
      assert.ok(ans >= 2 && ans <= 10, `add(10): ${eq} = ${ans}`);
      addCounts.set(eq, (addCounts.get(eq) || 0) + 1);
    }
    assert.equal(addCounts.size, 45, 'all 45 valid a+b<=10 pairs appear');
    const counts = [...addCounts.values()];
    assert.ok((addCounts.get('9 + 1') || 0) / 9000 < 0.04, `9 + 1 share should be ~2.2%, got ${(addCounts.get('9 + 1') || 0) / 9000}`);
    assert.ok(Math.max(...counts) / Math.min(...counts) < 2.2, 'max/min pair ratio must stay bounded');

    const rnd2 = mulberry32(202);
    let subTotal = 0, subZero = 0;
    const subAns = new Set();
    for (let i = 0; i < 9000; i++) {
      const [eq, ans, meta] = makeEq(2, rnd2);
      if (meta.op === 'sub') {
        subTotal++;
        if (ans === 0) subZero++;
        subAns.add(ans);
      }
    }
    assert.equal(subZero, 0, `sub(10) should not repeat a−a=0 (${subZero}/${subTotal})`);
    assert.equal(subAns.size, 9, 'sub(10) covers all answers 1..9');
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

  // Was "L11..30 … steps never get easier" with tiers 1..10 on L1..10. Decision 2 (Duy 2026-11-21): tiers 7..9
  // are back at L7..9 (level L = tier L up to L10); since the 2026-11-22 easy opening (B) L7..11 hold the L6 pace while the tier changes; inside a
  // block the steps never get easier; breathers open the next tier with the E4 safety net as knobs:
  // a 10-drop chain, 4 lives instead of 3, slower rain than the peak before.
  test('L1..30 (v2): tiers per block, breathers = 10 drops + 4 lives + slower rain, steps never get easier, caps hold', () => {
    const B = loadBBD();
    assert.equal(B.maxLevel('rain'), 35);
    const ops = Array.from({ length: 30 }, (_, i) => B.level('rain', i + 1).ops);
    assert.deepEqual(ops, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 11, 11, 11, 11, 12, 12, 12, 12, 12, 13, 13, 13, 13, 13, 14, 14, 14, 14, 14]);
    for (let L = 7; L <= 30; L++) {
      const r = B.level('rain', L), p = B.level('rain', L - 1);
      if (r.kind === 'breather') {
        assert.equal(r.target, 10, `L${L} breather chain`);
        assert.equal(r.lives, 4, `L${L} breather extra life`);
        assert.ok(r.ops > p.ops, `L${L} breather opens a new tier`);
        assert.ok(r.every > p.every && r.fall > p.fall, `L${L} breather rains slower than peak L${L - 1}`);
      } else if (r.L === 15) {
        // first peak (early ramp B): shorter, not longer — a denser rain over a short chain
        assert.ok(r.every < p.every && r.fall <= p.fall && r.target < p.target, `L15 peak: shorter chain, denser rain than L14`);
      } else if (p.kind !== 'breather' && r.ops === p.ops) {
        assert.ok(r.every <= p.every && r.fall <= p.fall && r.target >= p.target, `L${L} easier than L${L - 1}`);
        assert.ok(r.every < p.every || r.fall < p.fall || r.target > p.target, `L${L} identical to L${L - 1}`);
      }
      if (r.kind !== 'breather') assert.equal(r.lives, 3, `L${L} lives`);
      assert.ok(r.every >= 2.2 && r.fall >= 6.8 && r.target <= 25, `L${L} past a hardCap`);
    }
    for (let L = 1; L <= 9; L++) assert.equal(B.level('rain', L).lives, 3, `L${L} old rows keep 3 lives`);
    // L7..11: one new tier per level and no pace change (early ramp B: hold the pace knobs on a level that adds content)
    for (let L = 8; L <= 11; L++) {
      const r = B.level('rain', L), p = B.level('rain', L - 1);
      assert.deepEqual([r.every, r.fall, r.target], [p.every, p.fall, p.target], `L${L} pace held from L${L - 1}`);
    }
    // L31+ (engine continuation, not shipped): breathers keep the safety net, every knob stays inside its cap
    for (let L = 31; L <= 60; L++) {
      const r = B.level('rain', L);
      if (r.kind === 'breather') assert.deepEqual([r.target, r.lives], [10, 4], `L${L}`);
      else assert.equal(r.lives, 3, `L${L}`);
      assert.ok(r.every >= 2.2 && r.fall >= 6.8 && r.target <= 25 && r.ops <= 14, `L${L} past a hardCap`);
    }
  });

  // The adapter loses at `lives` misses like js/rain.js (misses >= lives), 3 when a row has none.
  test('adapter: the lives knob decides when a round is lost; no lives field = 3', async () => {
    const A = await import('./adapters/rain.mjs');
    const { PROFILES, rngFor } = await import('./human.mjs');
    const spec = { ops: 14, every: 2.3, fall: 6.9, target: 25 };
    const run = lives => Array.from({ length: 300 }, (_, i) => A.simulate({ ...spec, lives }, PROFILES.weak, rngFor('rain-lives', i)));
    const none = run(undefined), three = run(3), five = run(5), one = run(1);
    assert.deepEqual(none.map(r => r.pass), three.map(r => r.pass));
    for (const [rs, n] of [[one, 1], [three, 3], [five, 5]]) rs.forEach(r => {
      assert.ok(r.detail.misses <= n, `lives ${n}: ${r.detail.misses} misses`);
      if (!r.pass) assert.ok(r.detail.misses === n || r.detail.solved < spec.target, `lives ${n}`);
    });
    const rate = rs => rs.filter(r => r.pass).length;
    assert.ok(rate(one) <= rate(three) && rate(three) < rate(five), `${rate(one)} ${rate(three)} ${rate(five)}`);
  });

  // Real v1 keys as the shipped game left them: rain_lv (next level to play) + bb_stats stars by level number.
  test('rain progress: v1 keys → v2 keep levels passed, stars and rain_lv; once per version; corrupt data does not crash', () => {
    const v1 = { rain_lv: '11', bb_stats: JSON.stringify({ rain: { best: 10, stars: { 1: 3, 5: 3, 10: 2 } }, koi: { best: 2, stars: { 1: 1 } } }),
      bb_log: JSON.stringify([{ g: 'rain', lv: 10, won: true, stars: 2, score: 20, d: '2026-11-20', ms: 61000 }]) };
    const { BB, ls } = loadCore({ init: v1 });
    const r = BB.migrateProgress('rain');
    assert.deepEqual([r.ran, r.reason, r.from, r.to], [true, 'migrated', 1, 2]);
    assert.deepEqual(J(BB.gameStats('rain')), { best: 10, stars: { 1: 3, 5: 3, 10: 2 } });   // same level numbers in v2
    assert.equal(BB.starsAt('rain', 10), 2);
    assert.equal(ls.get('bb_tablev_rain'), '2');
    assert.equal(ls.get('rain_lv'), '11');                                    // game key untouched: L11 stays open
    assert.deepEqual(JSON.parse(ls.get('bb_stats')).koi, { best: 2, stars: { 1: 1 } });
    assert.equal(ls.get('bb_log'), v1.bb_log);
    const snap = ls.get('bb_stats');
    assert.equal(BB.migrateProgress('rain').reason, 'current');
    assert.equal(ls.get('bb_stats'), snap);
    // a player who finished all 30 before this table: still 30
    const all = loadCore({ init: { rain_lv: '31', bb_stats: JSON.stringify({ rain: { best: 30, stars: { 30: 1 } } }) } });
    all.BB.migrateProgress('rain');
    assert.deepEqual(J(all.BB.gameStats('rain')), { best: 30, stars: { 30: 1 } });
    // rain_lv only (played before bb_stats existed): nothing to move, marker written, rain_lv untouched
    const only = loadCore({ init: { rain_lv: '6' } });
    assert.equal(only.BB.migrateProgress('rain').reason, 'migrated');
    assert.deepEqual([only.ls.get('rain_lv'), only.ls.get('bb_tablev_rain')], ['6', '2']);
    // junk stars and a corrupt marker: cleaned, best kept, no throw
    const c = loadCore({ init: { bb_stats: JSON.stringify({ rain: { best: '7', stars: { 2: '3', 3: 0, 4: 'x', 6: 9 } } }), bb_tablev_rain: '-1' } });
    assert.equal(c.BB.migrateProgress('rain').reason, 'migrated');
    assert.deepEqual(J(c.BB.gameStats('rain')), { best: 7, stars: { 2: 3, 6: 3 } });
    for (const bad of ['{bad', '[]', '5', JSON.stringify({ rain: 'x' })]) assert.equal(loadCore({ init: { bb_stats: bad } }).BB.migrateProgress('rain').ran, true, bad);
    // a newer marker (an older build opened after a newer one) leaves data alone
    const n = loadCore({ init: { bb_stats: JSON.stringify({ rain: { best: 3, stars: { 1: 3 } } }), bb_tablev_rain: '3' } });
    assert.equal(n.BB.migrateProgress('rain').reason, 'newer');
    assert.equal(n.ls.get('bb_tablev_rain'), '3');
  });

  // Full N (≈5 s). Duy 2026-11-22 cleared the two rain blocks: (A) B is one-sided before the first peak (L1–14 since B; every miss there was
  // easy side) and (A) breathers may be as easy as needed, B only fails them when too hard, G3 keeps "easier than
  // the peak" only, G4 (weak ≥ 60%) stays. Every gate passes; G9 is the one waiver (Duy 2026-11-22, A).
  test('rain v2: zero failed gates at N=1200, only G9 waived (Duy 2026-11-22, A) and never counted as PASS', async () => {
    const r = await calibrate('rain', { n: 1200, write: false, quiet: true });
    assert.deepEqual(failsByGate(r), {});
    assert.equal(r.gates.find(g => g.id === 'G7').pass, null);
    assert.deepEqual(r.waived, ['G9']);                                     // the only waiver rain declares
    const g9 = r.gates.find(g => g.id === 'G9');
    assert.equal(g9.status, 'WAIVED'); assert.equal(g9.pass, null);
    assert.equal(r.config.tableVersion, 2);
  });

  // Review MUST 1 (2026-11-21): "thêm 10 màn" must work from the rule. L31+ come from the engine: steps follow p*
  // (every −0.005 s and fall −0.0105 s per level, 0.01 s grid), peaks add every −0.08 s and fall −0.30 s,
  // breathers keep the E4 net. Only the breather gap (Duy's open decision) and seed noise may fail.
  // Checked to L45: from L50 the p* floor (0.65, E1 = A) flattens peak targets and peaks fall ~5 points below p*.
  test('L31..45 from the engine: peaks harder than the step before, steps inside B, breathers keep the net', async () => {
    const B = loadBBD();
    for (let L = 31; L <= 45; L++) {
      const r = B.level('rain', L), p = B.level('rain', L - 1);
      assert.equal(r.authored, undefined, `L${L} generated`);
      if (r.kind === 'peak') assert.ok(r.every < p.every && r.fall < p.fall, `L${L} peak harder than step L${L - 1}`);
      if (r.kind === 'peak') {
        const q = B.level('rain', L - 5);
        assert.ok(r.every <= q.every && r.fall <= q.fall && (r.every < q.every || r.fall < q.fall), `L${L} peak harder than peak L${L - 5}`);
      }
      if (r.kind === 'step' && p.kind === 'step') {
        assert.ok(r.every <= p.every && r.fall <= p.fall, `L${L} easier than L${L - 1}`);
        assert.ok(r.every < p.every || r.fall < p.fall, `L${L} identical to L${L - 1}`);
      }
    }
    // N=4000: at N=1200 G2 L37→L38 flips on seed (the same spec measures 69.6% on the L37 seeds and 75.1% on the
    // L38 seeds). A bigger N narrows the G2 tolerance, so this is stricter. CI runs the same N.
    const r = await calibrate('rain', { n: 4000, from: 31, to: 45, write: false, quiet: true });
    assert.deepEqual(failsByGate(r), {});
    for (const id of ['G4', 'G6', 'G8']) assert.equal(r.gates.find(g => g.id === id).pass, true, id);
    // L1–10, L15 and L30 are not in this run: G1, G9 and G5 report SKIP (pass: null), never PASS or WAIVED (review 2026-11-22).
    for (const id of ['G1', 'G5', 'G9']) assert.deepEqual([r.gates.find(g => g.id === id).status, r.gates.find(g => g.id === id).pass], ['SKIP', null], id);
    r.levels.filter(l => l.kind !== 'breather').forEach(l =>
      assert.ok(Math.abs(l.profiles.median.p - l.pStar) <= 0.05, `L${l.L} median ${l.profiles.median.p} vs p* ${l.pStar}`));
  });

  test('wave pacing helpers: spawnGap breaks metronome without consecutive bursts; dropFall stays within ±8%', async () => {
    const { spawnGap, dropFall } = await import('./adapters/rain.mjs');
    const rng = mulberry32(99);
    const gaps = [];
    let lb = false;
    for (let i = 0; i < 2000; i++) {
      const g = spawnGap(3.0, lb, rng);
      assert.ok(!(lb && g.burst), 'never two bursts in a row');
      lb = g.burst;
      gaps.push(g.gap);
    }
    const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
    const sd = Math.sqrt(gaps.reduce((a, b) => a + (b - mean) ** 2, 0) / gaps.length);
    const cv = sd / mean;
    assert.ok(mean >= 3.0 * 0.97 && mean <= 3.0 * 1.06, `mean=${mean}`);
    assert.ok(cv > 0.18, `CV=${cv} should exceed old 0.115 metronome`);
    let fSum = 0;
    for (let i = 0; i < 1000; i++) {
      const f = dropFall(10, rng);
      assert.ok(f >= 9.2 - 1e-9 && f <= 10.8 + 1e-9);
      fSum += f;
    }
    assert.ok(Math.abs(fSum / 1000 - 10) < 0.2);
  });
});
}
