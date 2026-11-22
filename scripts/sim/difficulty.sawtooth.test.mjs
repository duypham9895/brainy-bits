// Duy's 2026-11-21 decisions on the engine: (1) the sawtooth starts at L10, (3) a table may waive gate B with a
// reason, and a waived gate is never reported as passed. Registered from difficulty.test.mjs so `npm run test:sim` runs it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBBD } from './load-bbd.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkGates, applyWaivers, validateWaivers, gateStatus, calibrate, UsageError } from './calibrate.mjs';

export function registerSawtooth() {
describe('engine: sawtooth from L15 and gate waivers', () => {
// Duy 2026-11-22 (B, all games): first peak moved from L10 to L15, the opening L1–14 is steps only.
test('kind(L1..31): steps L1–14, first peak L15, first breather L16, then every 5', () => {
  const B = loadBBD({ games: [] });
  const want = L => (L >= 15 && L % 5 === 0 ? 'peak' : L > 15 && L % 5 === 1 ? 'breather' : 'step');
  const got = Array.from({ length: 31 }, (_, i) => B.kind(i + 1));
  assert.deepEqual(got, Array.from({ length: 31 }, (_, i) => want(i + 1)));
  assert.deepEqual(got.slice(0, 14), Array(14).fill('step'));
  assert.deepEqual([15, 20, 25, 30].map(B.kind), Array(4).fill('peak'));
  assert.deepEqual([16, 21, 26, 31].map(B.kind), Array(4).fill('breather'));
});

test('p* opens at 0.97, falls 0.005 a level to 0.90 at L15 (peak 0.84), meets the √ curve at L30', () => {
  const B = loadBBD({ games: [] });
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);
  for (let L = 2; L <= 14; L++) assert.ok(B.pStar(L) < B.pStar(L - 1), `p*(${L}) < p*(${L - 1})`);
  close(B.pStar(1), 0.97); close(B.pStar(5), 0.95); close(B.pStar(10), 0.925); close(B.pStar(14), 0.905);
  close(B.pStar(15), 0.84); close(B.pStar(16), 0.89); close(B.pStar(30), 0.69);
  for (let L = 2; L <= 14; L++) assert.ok(B.pStar(L - 1) - B.pStar(L) < 0.0051, `no cliff before L${L}`);
  close(B.pStar(31), 0.92 - 0.17 * Math.sqrt(30 / 29));            // √ curve from L31, continuous at the L30 step value
  for (let L = 16; L <= 46; L += 5) assert.ok(B.pStar(L) > B.pStar(L - 1) && B.pStar(L) < B.pStar(L - 4), `L${L}`);
});

test('SAW_FROM_PERIODS = 1 brings back the old L5 peak (the decision is one constant)', () => {
  const B = loadBBD({ games: [] });
  B.CONFIG.SAW_FROM_PERIODS = 1;
  assert.equal(B.kind(5), 'peak'); assert.equal(B.kind(6), 'breather'); assert.equal(B.kind(4), 'step');
});

test('generated levels follow the kinds: L5–L14 plain steps, L15 peak, L16 breather lighter than it', () => {
  // A table with 4 authored rows, so L5–L16 come from the formula.
  const B = loadBBD({ games: [] });
  B.register('t', {
    levels: Array.from({ length: 4 }, (_, i) => ({ n: 3 + i })),
    knobs: [{ name: 'n', min: 3, max: 30, hardCap: 40, step: 1, int: true, curve: 'linear' }],
    peak: [{ knob: 'n', by: 1 }], relief: [{ knob: 'n', by: 2 }],
  });
  const n = L => B.level('t', L).n;
  for (let L = 5; L <= 14; L++) { assert.equal(B.level('t', L).kind, 'step'); assert.ok(n(L) >= n(L - 1), `L${L}`); }
  assert.equal(B.level('t', 15).kind, 'peak'); assert.equal(B.level('t', 16).kind, 'breather');
  assert.ok(n(16) < n(15), 'L16 breather lighter than the L15 peak');
  assert.ok(n(21) >= n(16), 'breathers stay monotone among themselves');
});

// ---------- gate waivers ----------
const row = (L, med, weak = 0.95) => ({
  L, kind: 'step', pStar: 0.9, knobs: {},
  profiles: { weak: { p: weak, p3: weak }, median: { p: med, p3: med }, skilled: { p: 0.99, p3: 0.99 } },
});
const fakeBBD = waivers => {
  const B = loadBBD({ games: [] });
  B.register('fake', { levels: [{}, {}, {}], knobs: [], gateWaivers: waivers });
  return B;
};

test('waiver accepted: B is WAIVED (never PASS), its misses kept, verdict not failed by it', () => {
  const B = fakeBBD({ B: 'content game; bot not checked against people (G7 SKIP)' });
  const gates = checkGates([row(22, 0.99), row(23, 0.99), row(24, 0.99)], B, 'fake', {}, 1200);
  const b = gates.find(g => g.id === 'B');
  assert.equal(b.status, 'WAIVED'); assert.equal(gateStatus(b), 'WAIVED');
  assert.equal(b.pass, null); assert.notEqual(b.pass, true);
  assert.equal(b.measuredPass, false); assert.equal(b.fails.length, 3);
  assert.match(b.note, /WAIVED: content game/);
  assert.ok(gates.every(g => g.pass !== false));                     // the run's ok verdict
  assert.equal(gates.filter(g => g.status === 'PASS').some(g => g.id === 'B'), false);
});

test('a waived gate that would have passed still reports WAIVED, not PASS', () => {
  const B = fakeBBD({ B: 'reason' });
  const b = checkGates([row(1, 0.9)], B, 'fake', {}, 1200).find(g => g.id === 'B');
  assert.equal(b.status, 'WAIVED'); assert.equal(b.pass, null); assert.equal(b.measuredPass, true);
});

test('without a waiver B fails as before, and other gates are never touched by a B waiver', () => {
  const plain = checkGates([row(1, 0.99, 0.5), row(22, 0.99)], fakeBBD(undefined), 'fake', {}, 1200);
  assert.equal(plain.find(g => g.id === 'B').status, 'FAIL');
  const waived = checkGates([row(1, 0.99, 0.5), row(22, 0.99)], fakeBBD({ B: 'reason' }), 'fake', {}, 1200);
  assert.equal(waived.find(g => g.id === 'G1').status, 'FAIL');      // G1 still binding
  assert.ok(waived.some(g => g.pass === false));
});

// Duy 2026-11-22 (A): before the first peak B only fails a level that is too hard; from the first peak (L15 since
// decision B the same day) it is two-sided.
test('gate B is one-sided on L1–14 (easier than p* is not a miss), two-sided from L15, and the flag turns it off', () => {
  const B = fakeBBD(undefined);
  const bOf = rows => checkGates(rows, B, 'fake', {}, 1200).find(g => g.id === 'B');
  assert.equal(bOf([row(1, 0.99), row(14, 0.99)]).status, 'PASS');        // easy before L15: fine
  assert.deepEqual(bOf([row(14, 0.80)]).fails.length, 1);                 // too hard before L15: miss
  assert.deepEqual(bOf([row(15, 0.99), row(17, 0.99)]).fails.length, 2);  // easy from L15: miss
  B.CONFIG.B_EASY_OK_BEFORE_SAW = false;
  assert.equal(bOf([row(1, 0.99)]).status, 'FAIL');                       // false = the old two-sided band
});

// Duy 2026-11-22 (rain, A): a breather may be as easy as needed; B fails it only when too hard, G3 keeps only
// "easier than the peak before it", G4 stays.
test('breathers: easy is not a B or G3 miss, too hard still is, G4 stays, and the flag turns it off', () => {
  const B = fakeBBD(undefined);
  const br = (L, med, weak = 0.95) => ({ ...row(L, med, weak), kind: 'breather' });
  const rows = [row(12, 0.9), { ...row(15, 0.88), kind: 'peak' }, br(16, 0.99, 0.5)];
  const g = id => checkGates(rows, B, 'fake', {}, 1200).find(x => x.id === id);
  assert.equal(g('B').status, 'PASS'); assert.equal(g('G3').status, 'PASS'); assert.equal(g('G4').status, 'FAIL');
  rows[2] = br(16, 0.6); assert.equal(g('B').status, 'FAIL'); assert.equal(g('G3').status, 'FAIL');   // too hard
  B.CONFIG.BREATHER_EASY_OK = false; rows[2] = br(16, 0.99);
  assert.equal(g('B').status, 'FAIL'); assert.equal(g('G3').status, 'FAIL');                         // old rule
});

// Duy 2026-11-22 (B): weak-bot floor 0.90 on L1–5 and 0.82 on L6–10 (G1); weak ≥ 0.70 at the first peak L15 (G9).
test('G1 has two tiers (L1–5 ≥ 0.90, L6–10 ≥ 0.82) and G9 checks the weak bot at the first peak', () => {
  const B = fakeBBD(undefined);
  const g = (rows, id) => checkGates(rows, B, 'fake', {}, 1200).find(x => x.id === id);
  assert.equal(g([row(1, 0.97, 0.90), row(6, 0.95, 0.82)], 'G1').status, 'PASS');
  assert.deepEqual(g([row(1, 0.97, 0.89), row(6, 0.95, 0.81), row(11, 0.95, 0.10)], 'G1').fails.length, 2);   // L11 has no floor
  assert.equal(g([row(20, 0.8)], 'G1').status, 'SKIP');
  assert.equal(g([{ ...row(15, 0.84, 0.70), kind: 'peak' }], 'G9').status, 'PASS');
  assert.equal(g([{ ...row(15, 0.84, 0.69), kind: 'peak' }], 'G9').status, 'FAIL');
  assert.equal(g([row(14, 0.9)], 'G9').status, 'SKIP');
});

test('waiver rejected: any gate other than B, or no reason string, throws (table load and calibrate)', () => {
  for (const bad of [{ G1: 'r' }, { G3: 'r' }, { G7: 'r' }, { B: '' }, { B: '   ' }, { B: true }, { B: 1 }, ['B'], 'B']) {
    assert.throws(() => fakeBBD(bad), /gateWaivers|cannot be waived|reason/, JSON.stringify(bad));
    assert.throws(() => validateWaivers(bad, 'x'), /gateWaivers|cannot be waived|reason/, JSON.stringify(bad));
    assert.throws(() => applyWaivers([], bad, 'x'));
  }
  assert.deepEqual(validateWaivers(undefined), {});
  assert.deepEqual(validateWaivers({ B: 'r' }), { B: 'r' });
});

// Review 2026-11-22 (#1): an inverted range simulated zero levels, every gate read PASS and calibrate exited 0.
test('calibrate: --from > --to (also --from past maxLevel with --to left out) is a usage error, exit 2', async () => {
  const cli = fileURLToPath(new URL('./calibrate.mjs', import.meta.url));
  const run = args => spawnSync(process.execPath, [cli, ...args, '--no-write', '--quiet'], { encoding: 'utf8' });
  for (const args of [['rain', '--from', '35', '--to', '30'], ['rain', '--from', '35'], ['mem', '--from', '2', '--to', '1']]) {
    const r = run(args);
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, /empty level range/);
  }
  await assert.rejects(calibrate('rain', { n: 5, from: 35, write: false, quiet: true }), UsageError);
  assert.equal(run(['rain', '--from', '30', '--to', '30', '--n', '5']).status === 2, false, 'a one-level range is fine');
});

// Review 2026-11-22 (#9): a gate whose levels are not in the run reports SKIP, never PASS.
test('calibrate: G1 skips without L1–10 and G5 skips without L30; a partial L1–10 range still judges G1', async () => {
  const st = (r, id) => r.gates.find(g => g.id === id);
  const late = await calibrate('rain', { n: 5, from: 31, to: 32, write: false, quiet: true });
  for (const id of ['G1', 'G5']) assert.deepEqual([st(late, id).status, st(late, id).pass], ['SKIP', null], id);
  const early = await calibrate('mem', { n: 5, from: 4, to: 6, write: false, quiet: true });
  assert.notEqual(st(early, 'G1').status, 'SKIP');
  assert.match(st(early, 'G1').note, /only L4–6/);
  assert.equal(st(early, 'G5').status, 'SKIP');
});
});
}
