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
export const G1_WEAK = 0.85;     // weak ≥ 85% on L1–5 (Roohi 2020 churn lesson)
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

  gate('B', 'every level: |p_median − p*| ≤ 0.05',
    rows.filter(r => Math.abs(r.profiles.median.p - r.pStar) > BAND)
      .map(r => `L${r.L} median ${r.profiles.median.p} vs p* ${r.pStar.toFixed(3)}`));
  gate('G1', 'weak ≥ 85% on L1–5',
    rows.filter(r => r.L <= 5 && r.profiles.weak.p < G1_WEAK).map(r => `L${r.L} weak ${r.profiles.weak.p}`));
  gate('G2', 'median pass rate does not rise between consecutive step levels (tolerance = 2·SE)',
    rows.filter(r => r.kind !== 'breather' && byL.has(r.L - 1)).filter(r => {
      const a = P(r.L - 1, 'median'), b = r.profiles.median.p;
      return b > a + tolFor(a, b, n);
    }).map(r => `L${r.L - 1}→L${r.L}: ${P(r.L - 1, 'median')} → ${r.profiles.median.p}`));
  gate('G3', 'breather easier than the peak before it and harder than L−4',
    rows.filter(r => r.kind === 'breather').flatMap(r => {
      const f = [], b = r.profiles.median.p, pk = P(r.L - 1, 'median'), l4 = P(r.L - 4, 'median');
      if (pk !== undefined && b < pk - tolFor(b, pk, n)) f.push(`L${r.L} ${b} harder than peak L${r.L - 1} ${pk}`);
      if (l4 !== undefined && b > l4 + tolFor(b, l4, n)) f.push(`L${r.L} ${b} easier than L${r.L - 4} ${l4}`);
      return f;
    }));
  gate('G4', 'weak ≥ 60% on every breather',
    rows.filter(r => r.kind === 'breather' && r.profiles.weak.p < G4_WEAK).map(r => `L${r.L} weak ${r.profiles.weak.p}`));
  const r30 = byL.get(30), skilledMin = BBD.e1().skilledL30;
  gate('G5', `skilled ≥ ${skilledMin * 100}% at L30 (E1 = ${BBD.CONFIG.E1})`,
    r30 ? (r30.profiles.skilled.p < skilledMin ? [`L30 skilled ${r30.profiles.skilled.p}`] : []) : [],
    r30 ? '' : 'L30 not in range');
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
  out.push({ id: 'G7', name: 'Playwright parity, 3 seeds at L1/L15/L30', pass: null, fails: [],
    note: 'SKIPPED: needs the game to read BBD.level() (per-game integration step)' });
  gate('G8', 'first-attempt and ≤3-attempt pass reported; ≤3 never below first attempt',
    rows.flatMap(r => PROFILE_NAMES.filter(pn => r.profiles[pn].p3 + 0.02 < r.profiles[pn].p).map(pn => `L${r.L} ${pn} p3 ${r.profiles[pn].p3} < p ${r.profiles[pn].p}`)));
  return out;
}

export async function calibrate(game, { n = 400, from = 1, to, write = true, quiet = false, adapterOpts = {} } = {}) {
  const BBD = loadBBD();
  const adapter = await loadAdapter(game);
  to = to || BBD.maxLevel(game);
  const rows = [];
  for (let L = from; L <= to; L++) {
    const spec = BBD.level(game, L);
    const knobs = Object.fromEntries(Object.entries(spec).filter(([k]) => !['L', 'kind', 'legacy', 'authored'].includes(k)));
    const profiles = Object.fromEntries(PROFILE_NAMES.map(pn => [pn, measure(adapter, BBD, game, L, pn, n, adapterOpts)]));
    rows.push({ L, kind: spec.kind, legacy: spec.legacy, pStar: +BBD.pStar(L).toFixed(4), D: +BBD.D(L).toFixed(4),
      bL: +BBD.elo.bFromP(Math.min(0.999, Math.max(0.001, profiles.median.p))).toFixed(3), knobs, profiles });
  }
  const gates = checkGates(rows, BBD, game, adapter, n);
  const ok = gates.every(g => g.pass !== false);
  const report = {
    game, n, from, to, simVersion: 1, generatedOn: new Date().toISOString().slice(0, 10),
    config: { E1: BBD.CONFIG.E1, E3: BBD.CONFIG.E3_FREEZE_LEGACY, E5: BBD.CONFIG.E5_KNOBS_ONLY, tableVersion: BBD.version(game), ...BBD.e1() },
    seed: 'mulberry32(cyrb53("camp|game|L|profile|i"))', note: 'bL = logit(1 − p_median) with θ_median = 0, a = 1; 2PL fit not run yet',
    adapterOpts, ok, gates, levels: rows,
  };
  if (write) writeFileSync(join(ROOT, 'docs', 'difficulty', `calibration-${game}.json`), JSON.stringify(report, null, 1) + '\n');
  if (!quiet) print(report);
  return report;
}

function print({ game, n, levels, gates, ok }) {
  const pct = x => (x * 100).toFixed(0).padStart(3);
  console.log(`\n${game} · N=${n} per profile · first-attempt pass % (≤3 attempts in brackets)`);
  console.log('  L kind  leg   p*  | weak       median     skilled    | Δmed');
  for (const r of levels) {
    const c = pn => `${pct(r.profiles[pn].p)} [${pct(r.profiles[pn].p3)}]`;
    const d = r.profiles.median.p - r.pStar;
    console.log(`${String(r.L).padStart(3)} ${r.kind.padEnd(8).slice(0, 5)} ${r.legacy ? 'L' : ' '}  ${pct(r.pStar)} | ${c('weak')}  ${c('median')}  ${c('skilled')}  | ${(d >= 0 ? '+' : '') + (d * 100).toFixed(0)}${Math.abs(d) > BAND ? ' ✗' : ''}`);
  }
  console.log('\nGates:');
  for (const g of gates) {
    const tag = g.pass === null ? 'SKIP' : g.pass ? 'PASS' : 'FAIL';
    console.log(`  ${tag.padEnd(4)} ${g.id.padEnd(3)} ${g.name}${g.note ? ` — ${g.note}` : ''}`);
    g.fails.slice(0, 6).forEach(f => console.log(`         · ${f}`));
    if (g.fails.length > 6) console.log(`         · … ${g.fails.length - 6} more`);
  }
  console.log(ok ? '\nRESULT: all gates pass (G7 skipped)' : '\nRESULT: FAIL');
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
  return a;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const a = parseArgs(process.argv.slice(2));
  const game = a._[0];
  if (!game) { console.error('usage: node scripts/sim/calibrate.mjs <train|koi|mem|rain|word> [--n 400] [--from 1] [--to 30] [--no-write]'); process.exit(2); }
  const { _, n, from, to, write, quiet, ...adapterOpts } = a;   // any other --flag number goes to the adapter (e.g. --gamma 0.25)
  calibrate(game, { n: n || 400, from: from || 1, to, write: write !== false, quiet, adapterOpts })
    .then(r => process.exit(r.ok ? 0 : 1))
    .catch(e => { console.error(`calibrate ${game}: ${e.message}`); process.exit(2); });
}
