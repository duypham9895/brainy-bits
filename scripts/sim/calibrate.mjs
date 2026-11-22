#!/usr/bin/env node
// Monte Carlo calibration for one game (MERGED-SPEC §4.4).
//   node scripts/sim/calibrate.mjs <game> [--n 400] [--from 1] [--to <maxLevel>] [--no-write] [--quiet] [--<adapterOpt> <num>]
// For each level and each profile (weak/median/skilled) it runs N seeded attempts through
// scripts/sim/adapters/<game>.mjs, checks the gates, prints a table and writes
// docs/difficulty/calibration-<game>.json. Exit 0 = all gates pass, 1 = a gate failed, 2 = usage/adapter error.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadBBD, ROOT } from './load-bbd.mjs';
import { PROFILES, PROFILE_NAMES, rngFor, samplePlayer } from './human.mjs';

export const BAND = 0.05;        // §4.4 step 4: |p_median − p*| ≤ 5 points, every level (E3 lifted 2026-11-21)
// Weak-player floors for the opening (Duy 2026-11-22, B: research docs/difficulty/research-early.html).
// Early levels hold the weakest players the game will see (Roohi 2020), so the weak bot, not the median, sets the floor.
export const G1_TIERS = Object.freeze([{ from: 1, to: 5, min: 0.90 }, { from: 6, to: 10, min: 0.82 }]);
export const G1_WEAK = G1_TIERS[0].min;   // kept for callers that read the L1–5 floor
export const G9_FIRST_PEAK_WEAK = 0.70;   // weak ≥ 70% at the first peak (L15): mild, not a wall
export const G4_WEAK = 0.60;     // weak ≥ 60% on every breather (A, R:simulation proposal)
export const TOUCH_PX = 44;      // Parhi 2006 ≈ 9.2–9.6 mm

// Wilson 95% interval (R:simulation, Wilson 1927).
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n;
  const c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [+((c - h) / d).toFixed(4), +((c + h) / d).toFixed(4)];
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const tolFor = (p1, p2, n) => Math.max(0.02, 2 * Math.sqrt(p1 * (1 - p1) / n + p2 * (1 - p2) / n));

// Gate waivers a table declares (`gateWaivers: { B: '<reason>' }` in js/levels/<game>.js). Only B or G9 (Duy 2026-11-22,
// rain), only with a
// reason. A waived gate is reported as WAIVED (pass: null, its misses kept for reading) and never as PASS.
export const WAIVABLE = ['B', 'G9'];
export function validateWaivers(waivers, game = '?') {
  if (waivers == null) return {};
  if (typeof waivers !== 'object' || Array.isArray(waivers)) throw new Error(`calibrate ${game}: gateWaivers must be an object { gateId: reason }`);
  for (const [id, reason] of Object.entries(waivers)) {
    if (!WAIVABLE.includes(id)) throw new Error(`calibrate ${game}: gate "${id}" cannot be waived (only ${WAIVABLE.join(', ')})`);
    if (typeof reason !== 'string' || !reason.trim()) throw new Error(`calibrate ${game}: waiver for gate ${id} needs a reason string`);
  }
  return { ...waivers };
}
export function applyWaivers(gates, waivers, game) {
  const w = validateWaivers(waivers, game);
  return gates.map(g => (w[g.id] === undefined ? g
    : { ...g, pass: null, waived: true, waiver: w[g.id], measuredPass: g.pass, note: `WAIVED: ${w[g.id]}` }));
}
// Gate B misses. Duy 2026-11-22: before the first peak (L < PERIOD·SAW_FROM_PERIODS) a level that is easier than p*
// is not a miss, only one that is harder (median < p* − BAND). From the first peak on, B is two-sided again.
export const bOneSidedBelow = BBD => BBD.CONFIG.PERIOD * BBD.CONFIG.SAW_FROM_PERIODS;
export function bMiss(r, BBD) {
  const d = r.profiles.median.p - r.pStar;
  if (BBD.CONFIG.B_EASY_OK_BEFORE_SAW && r.L < bOneSidedBelow(BBD)) return d < -BAND;
  if (BBD.CONFIG.BREATHER_EASY_OK && r.kind === 'breather') return d < -BAND;   // Duy 2026-11-22: breathers may be easy
  return Math.abs(d) > BAND;
}
export const gateStatus = g => (g.waived ? 'WAIVED' : g.pass === null ? 'SKIP' : g.pass ? 'PASS' : 'FAIL');

export async function loadAdapter(game) {
  const mod = await import(pathToFileURL(join(ROOT, 'scripts', 'sim', 'adapters', `${game}.mjs`)).href);
  if (mod.TODO) throw new Error(`adapter ${game} is a TODO stub; implement scripts/sim/adapters/${game}.mjs first`);
  if (typeof mod.simulate !== 'function') throw new Error(`adapter ${game}: missing simulate()`);
  return mod;
}

// One (game, L, profile) cell: first-attempt rate over n players, plus pass within ≤ 3 attempts (G8),
// where the same sampled player retries with learning on.
export function measure(adapter, BBD, game, L, profileName, n, aopts = {}) {
  const spec = BBD.level(game, L), profile = PROFILES[profileName];
  let pass = 0, pass3 = 0, acc = 0; const ms = [];
  for (let i = 0; i < n; i++) {
    const r = adapter.simulate(spec, profile, rngFor(game, L, profileName, i), aopts);
    if (r.pass) pass++;
    acc += r.accuracy; ms.push(r.ms);
    for (let a = 0; a < 3; a++) {
      const player = samplePlayer(profile, rngFor(game, L, profileName, i, 'player'), { attempt: a, learning: true });
      if (adapter.simulate(spec, profile, rngFor(game, L, profileName, i, 'retry', a), { ...aopts, player }).pass) { pass3++; break; }
    }
  }
  return { p: +(pass / n).toFixed(4), ci: wilson(pass, n), acc: +(acc / n).toFixed(4), msMedian: Math.round(median(ms)), p3: +(pass3 / n).toFixed(4) };
}

export function checkGates(rows, BBD, game, adapter, n) {
  const byL = new Map(rows.map(r => [r.L, r]));
  const P = (L, prof) => byL.get(L) && byL.get(L).profiles[prof].p;
  const out = [];
  const gate = (id, name, fails, note = '') => out.push({ id, name, pass: fails.length === 0, fails, note });

  gate('B', `every level: |p_median − p*| ≤ 0.05${BBD.CONFIG.BREATHER_EASY_OK ? ' (breathers: only too hard fails)' : ''}${BBD.CONFIG.B_EASY_OK_BEFORE_SAW ? ` (L1–${bOneSidedBelow(BBD) - 1}: only p_median < p* − 0.05 fails)` : ''}`,
    rows.filter(r => bMiss(r, BBD))
      .map(r => `L${r.L} median ${r.profiles.median.p} vs p* ${r.pStar.toFixed(3)}`));
  // A gate whose levels are not in the run is SKIP (pass: null), never PASS: a partial run proves nothing about them.
  const skip = (id, name, note) => out.push({ id, name, pass: null, fails: [], note });
  const tierOf = L => G1_TIERS.find(t => L >= t.from && L <= t.to);
  const g1Name = `weak floor: ${G1_TIERS.map(t => `≥ ${t.min * 100}% on L${t.from}–${t.to}`).join(', ')}`;
  const g1Rows = rows.filter(r => tierOf(r.L));
  const g1Last = G1_TIERS[G1_TIERS.length - 1].to;
  if (!g1Rows.length) skip('G1', g1Name, `L1–${g1Last} not in range`);
  else gate('G1', g1Name,
    g1Rows.filter(r => r.profiles.weak.p < tierOf(r.L).min).map(r => `L${r.L} weak ${r.profiles.weak.p} < ${tierOf(r.L).min}`),
    g1Rows.length < g1Last ? `only L${g1Rows[0].L}–${g1Rows[g1Rows.length - 1].L} in range` : '');
  gate('G2', 'median pass rate does not rise between consecutive step levels (tolerance = 2·SE)',
    rows.filter(r => r.kind !== 'breather' && byL.has(r.L - 1)).filter(r => {
      const a = P(r.L - 1, 'median'), b = r.profiles.median.p;
      return b > a + tolFor(a, b, n);
    }).map(r => `L${r.L - 1}→L${r.L}: ${P(r.L - 1, 'median')} → ${r.profiles.median.p}`));
  gate('G3', `breather easier than the peak before it${BBD.CONFIG.BREATHER_EASY_OK ? '' : ' and harder than L−4'}`,
    rows.filter(r => r.kind === 'breather').flatMap(r => {
      const f = [], b = r.profiles.median.p, pk = P(r.L - 1, 'median'), l4 = P(r.L - 4, 'median');
      if (pk !== undefined && b < pk - tolFor(b, pk, n)) f.push(`L${r.L} ${b} harder than peak L${r.L - 1} ${pk}`);
      if (!BBD.CONFIG.BREATHER_EASY_OK && l4 !== undefined && b > l4 + tolFor(b, l4, n)) f.push(`L${r.L} ${b} easier than L${r.L - 4} ${l4}`);
      return f;
    }));
  gate('G4', 'weak ≥ 60% on every breather',
    rows.filter(r => r.kind === 'breather' && r.profiles.weak.p < G4_WEAK).map(r => `L${r.L} weak ${r.profiles.weak.p}`));
  const r30 = byL.get(30), skilledMin = BBD.e1().skilledL30;
  const g5Name = `skilled ≥ ${skilledMin * 100}% at L30 (E1 = ${BBD.CONFIG.E1})`;
  if (!r30) skip('G5', g5Name, 'L30 not in range');
  else gate('G5', g5Name, r30.profiles.skilled.p < skilledMin ? [`L30 skilled ${r30.profiles.skilled.p}`] : []);
  const spec = BBD.spec(game);
  gate('G6', `knobs within hardCap; targets ≥ ${TOUCH_PX} px at 320 and 390 px`,
    rows.flatMap(r => {
      const f = [];
      spec.knobs.forEach(k => {
        const v = r.knobs[k.name];
        if (typeof v === 'number' && (k.dir > 0 ? v > k.hardCap + 1e-9 : v < k.hardCap - 1e-9)) f.push(`L${r.L} ${k.name}=${v} past cap ${k.hardCap}`);
      });
      if (adapter.geometry) [320, 390].forEach(w => {
        const px = adapter.geometry(BBD.level(game, r.L), w).minTargetPx;
        if (px < TOUCH_PX) f.push(`L${r.L} ${px.toFixed(1)} px at ${w}`);
      });
      return f;
    }), adapter.geometry ? '' : 'adapter has no geometry(): px part not checked');
  const firstPeak = bOneSidedBelow(BBD), rPk = byL.get(firstPeak);
  const g9Name = `weak ≥ ${G9_FIRST_PEAK_WEAK * 100}% at the first peak (L${firstPeak})`;
  if (!rPk) skip('G9', g9Name, `L${firstPeak} not in range`);
  else gate('G9', g9Name, rPk.profiles.weak.p < G9_FIRST_PEAK_WEAK ? [`L${firstPeak} weak ${rPk.profiles.weak.p}`] : []);
  out.push({ id: 'G7', name: 'Playwright parity, 3 seeds at L1/L15/L30', pass: null, fails: [],
    note: 'SKIPPED: needs the game to read BBD.level() (per-game integration step)' });
  gate('G8', 'first-attempt and ≤3-attempt pass reported; ≤3 never below first attempt',
    rows.flatMap(r => PROFILE_NAMES.filter(pn => r.profiles[pn].p3 + 0.02 < r.profiles[pn].p).map(pn => `L${r.L} ${pn} p3 ${r.profiles[pn].p3} < p ${r.profiles[pn].p}`)));
  return applyWaivers(out, spec.gateWaivers, game).map(g => ({ ...g, status: gateStatus(g) }));
}

export class UsageError extends Error {}

export async function calibrate(game, { n = 400, from = 1, to, write = true, quiet = false, adapterOpts = {} } = {}) {
  const BBD = loadBBD();
  const adapter = await loadAdapter(game);
  to = to || BBD.maxLevel(game);
  // An empty range checks nothing, so every gate would read PASS: refuse it (CLI exit 2, usage error).
  if (!(Number.isInteger(from) && from >= 1 && Number.isInteger(to) && from <= to)) {
    throw new UsageError(`empty level range: --from ${from} > --to ${to} (--to defaults to maxLevel ${BBD.maxLevel(game)})`);
  }
  const rows = [];
  for (let L = from; L <= to; L++) {
    const spec = BBD.level(game, L);
    const knobs = Object.fromEntries(Object.entries(spec).filter(([k]) => !['L', 'kind', 'legacy', 'authored'].includes(k)));
    const profiles = Object.fromEntries(PROFILE_NAMES.map(pn => [pn, measure(adapter, BBD, game, L, pn, n, adapterOpts)]));
    rows.push({ L, kind: spec.kind, legacy: spec.legacy, pStar: +BBD.pStar(L).toFixed(4), D: +BBD.D(L).toFixed(4),
      bL: +BBD.elo.bFromP(Math.min(0.999, Math.max(0.001, profiles.median.p))).toFixed(3), knobs, profiles });
  }
  const gates = checkGates(rows, BBD, game, adapter, n);
  const ok = gates.every(g => g.pass !== false);            // WAIVED and SKIP carry pass: null, so they never fail or pass
  const waived = gates.filter(g => g.waived).map(g => g.id);
  const report = {
    game, n, from, to, simVersion: 1, generatedOn: new Date().toISOString().slice(0, 10),
    config: { E1: BBD.CONFIG.E1, breatherEasyOk: !!BBD.CONFIG.BREATHER_EASY_OK, bEasyOkBelow: BBD.CONFIG.B_EASY_OK_BEFORE_SAW ? bOneSidedBelow(BBD) : null, E3: BBD.CONFIG.E3_FREEZE_LEGACY, E5: BBD.CONFIG.E5_KNOBS_ONLY, tableVersion: BBD.version(game), ...BBD.e1() },
    seed: 'mulberry32(cyrb53("camp|game|L|profile|i"))', note: 'bL = logit(1 − p_median) with θ_median = 0, a = 1; 2PL fit not run yet',
    adapterOpts, ok, waived, gates, levels: rows,
  };
  if (write) writeFileSync(join(ROOT, 'docs', 'difficulty', `calibration-${game}.json`), JSON.stringify(report, null, 1) + '\n');
  if (!quiet) print(report, BBD);
  return report;
}

function print({ game, n, levels, gates, ok, waived }, BBD) {
  const pct = x => (x * 100).toFixed(0).padStart(3);
  console.log(`\n${game} · N=${n} per profile · first-attempt pass % (≤3 attempts in brackets)`);
  console.log('  L kind  leg   p*  | weak       median     skilled    | Δmed');
  for (const r of levels) {
    const c = pn => `${pct(r.profiles[pn].p)} [${pct(r.profiles[pn].p3)}]`;
    const d = r.profiles.median.p - r.pStar;
    console.log(`${String(r.L).padStart(3)} ${r.kind.padEnd(8).slice(0, 5)} ${r.legacy ? 'L' : ' '}  ${pct(r.pStar)} | ${c('weak')}  ${c('median')}  ${c('skilled')}  | ${(d >= 0 ? '+' : '') + (d * 100).toFixed(0)}${bMiss(r, BBD) ? ' ✗' : ''}`);
  }
  console.log('\nGates:');
  for (const g of gates) {
    const tag = gateStatus(g);
    console.log(`  ${tag.padEnd(6)} ${g.id.padEnd(3)} ${g.name}${g.note ? ` — ${g.note}` : ''}`);
    g.fails.slice(0, 6).forEach(f => console.log(`         · ${f}`));
    if (g.fails.length > 6) console.log(`         · … ${g.fails.length - 6} more`);
  }
  const w = waived && waived.length ? `; WAIVED: ${waived.join(', ')} (not passed)` : '';
  console.log(ok ? `\nRESULT: no gate failed (G7 skipped${w})` : `\nRESULT: FAIL${w}`);
}

function parseArgs(argv) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const x = argv[i];
    if (x === '--no-write') a.write = false;
    else if (x === '--quiet') a.quiet = true;
    else if (x.startsWith('--')) a[x.slice(2)] = Number(argv[++i]);
    else a._.push(x);
  }
  // A flag that reads as NaN or 0 must not fall back to a default range: in CI, `--to "$(…)"` with a failed
  // substitution became Number('') = 0, and calibrate then checked only L1–maxLevel and stayed green.
  for (const [k, v] of Object.entries(a)) {
    if (k === '_' || typeof v !== 'number') continue;
    if (Number.isNaN(v)) throw new Error(`--${k} needs a number`);
    if (['n', 'from', 'to'].includes(k) && !(Number.isInteger(v) && v >= 1)) throw new Error(`--${k} must be a whole number ≥ 1, got ${v}`);
  }
  return a;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  let a;
  try { a = parseArgs(process.argv.slice(2)); } catch (e) { console.error(`calibrate: ${e.message}`); process.exit(2); }
  const game = a._[0];
  if (!game) { console.error('usage: node scripts/sim/calibrate.mjs <train|koi|mem|rain|word> [--n 400] [--from 1] [--to 30] [--no-write]'); process.exit(2); }
  const { _, n, from, to, write, quiet, ...adapterOpts } = a;   // any other --flag number goes to the adapter (e.g. --gamma 0.25)
  calibrate(game, { n: n || 400, from: from || 1, to, write: write !== false, quiet, adapterOpts })
    .then(r => process.exit(r.ok ? 0 : 1))
    .catch(e => { console.error(`calibrate ${game}: ${e.message}`); process.exit(2); });
}
