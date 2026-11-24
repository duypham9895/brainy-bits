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
export const G6_VIEWPORTS = Object.freeze([[320, 568, '320p'], [390, 844, '390p'], [667, 375, '667l']]);
export const G6_SWITCH_GAP_MIN = 6;
export const G6_KOI_FILL_MAX = 0.30;
export const G6_KOI_OVERLAP_TIGHT = 0.65;
export const G6_KOI_OVERLAP_STD = 0.50;
export const G6_KEY_W_MIN = 28;
export const G6_TILE_MIN = 20;
export const G10_BLOWOUT_MAX = 0.85;
export const G11_SPREAD_MIN = 0.05;
export const PROVENANCE = 'UNVERIFIED [NEW] PRIORS in human.mjs — engagement/difficulty gates are one-sided structural red flags, not human-fun guarantees';

export function classifyOutcome(game, spec, r) {
  if (!r || !r.pass) return { blowout: false, clutch: false };
  if (game === 'train') return { blowout: r.accuracy >= 0.999, clutch: r.margin <= 5 };
  if (game === 'koi') return { blowout: r.detail?.mistakes === 0, clutch: r.detail?.mistakes === 1 };
  if (game === 'mem') return { blowout: r.detail?.round === 2, clutch: r.detail?.round === 3 };
  if (game === 'rain') return { blowout: r.detail?.misses === 0, clutch: r.margin === 1 };
  if (game === 'word') return { blowout: r.detail?.rows <= 2, clutch: r.detail?.rows >= (spec.maxTries || 6) - 1 };
  return { blowout: false, clutch: false };
}

// Wilson 95% interval (R:simulation, Wilson 1927).
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n;
  const c = p + z * z / (2 * n), h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [+((c - h) / d).toFixed(4), +((c + h) / d).toFixed(4)];
}
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const tolFor = (p1, p2, n) => Math.max(0.02, 2 * Math.sqrt(p1 * (1 - p1) / n + p2 * (1 - p2) / n));

// Gate waivers a table declares (`gateWaivers: { B: '<reason>' }` in js/levels/<game>.js), only with a reason.
// B: any table (word uses it, Duy 2026-11-21). G9: rain only (Duy 2026-11-22, A). A waived gate is reported as WAIVED
// (pass: null, its misses kept for reading) and never as PASS. A gate the run did not reach stays SKIP, waiver or not.
export const WAIVABLE = { B: null, G9: ['rain'] };
const waivableBy = (id, game) => Object.prototype.hasOwnProperty.call(WAIVABLE, id) && (WAIVABLE[id] === null || WAIVABLE[id].includes(game));
export function validateWaivers(waivers, game = '?') {
  if (waivers == null) return {};
  if (typeof waivers !== 'object' || Array.isArray(waivers)) throw new Error(`calibrate ${game}: gateWaivers must be an object { gateId: reason }`);
  for (const [id, reason] of Object.entries(waivers)) {
    if (!waivableBy(id, game)) throw new Error(`calibrate ${game}: gate "${id}" cannot be waived by ${game} (B by any table, G9 by rain only)`);
    if (typeof reason !== 'string' || !reason.trim()) throw new Error(`calibrate ${game}: waiver for gate ${id} needs a reason string`);
  }
  return { ...waivers };
}
export function applyWaivers(gates, waivers, game) {
  const w = validateWaivers(waivers, game);
  // A SKIP (pass: null, no level in range) is not evaluated, so it stays SKIP: WAIVED would read as "checked, then waived".
  return gates.map(g => (w[g.id] === undefined || g.waived || (g.pass === null && !(g.fails || []).length) ? g
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
  let pass = 0, pass3 = 0, acc = 0, blow = 0, clutch = 0; const ms = [];
  for (let i = 0; i < n; i++) {
    const r = adapter.simulate(spec, profile, rngFor(game, L, profileName, i), aopts);
    if (r.pass) {
      pass++;
      const c = classifyOutcome(game, spec, r);
      if (c.blowout) blow++;
      if (c.clutch) clutch++;
    }
    acc += r.accuracy; ms.push(r.ms);
    for (let a = 0; a < 3; a++) {
      const player = samplePlayer(profile, rngFor(game, L, profileName, i, 'player'), { attempt: a, learning: true });
      if (adapter.simulate(spec, profile, rngFor(game, L, profileName, i, 'retry', a), { ...aopts, player }).pass) { pass3++; break; }
    }
  }
  return { p: +(pass / n).toFixed(4), ci: wilson(pass, n), acc: +(acc / n).toFixed(4), msMedian: Math.round(median(ms)), p3: +(pass3 / n).toFixed(4), blowout: +(blow / n).toFixed(4), clutch: +(clutch / n).toFixed(4) };
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
    g1Rows.length < g1Last ? [`only L${g1Rows[0].L}–${g1Rows[g1Rows.length - 1].L} in range`,
      ...G1_TIERS.filter(t => !g1Rows.some(r => r.L >= t.from && r.L <= t.to)).map(t => `tier L${t.from}–${t.to} not checked`)].join('; ') : '');
  gate('G2', 'median pass rate does not rise between consecutive step levels (tolerance = 2·SE)',
    rows.filter(r => r.kind !== 'breather' && byL.has(r.L - 1)).filter(r => {
      const a = P(r.L - 1, 'median'), b = r.profiles.median.p;
      return b > a + tolFor(a, b, n);
    }).map(r => `L${r.L - 1}→L${r.L}: ${P(r.L - 1, 'median')} → ${r.profiles.median.p}`));
  // No breather in range, or none with its peak in range: SKIP, never PASS (review 2026-11-22).
  const brRows = rows.filter(r => r.kind === 'breather');
  const g3Name = `breather easier than the peak before it${BBD.CONFIG.BREATHER_EASY_OK ? '' : ' and harder than L−4'}`;
  // A breather is blind when a level its checks compare against is not in the run: the peak before it, and also
  // L−4 while BREATHER_EASY_OK is off (round-2 review). Blind breathers are listed, never silently passed.
  const g3Need = L => (BBD.CONFIG.BREATHER_EASY_OK ? [L - 1] : [L - 1, L - 4]);
  const g3Blind = brRows.filter(r => g3Need(r.L).some(x => !byL.has(x))).map(r => `L${r.L}`);
  // Misses are computed first: a breather that fails a comparison it could make is a FAIL even if another is blind.
  const g3Fails = brRows.flatMap(r => {
    const f = [], b = r.profiles.median.p, pk = P(r.L - 1, 'median'), l4 = P(r.L - 4, 'median');
    if (pk !== undefined && b < pk - tolFor(b, pk, n)) f.push(`L${r.L} ${b} harder than peak L${r.L - 1} ${pk}`);
    if (!BBD.CONFIG.BREATHER_EASY_OK && l4 !== undefined && b > l4 + tolFor(b, l4, n)) f.push(`L${r.L} ${b} easier than L${r.L - 4} ${l4}`);
    return f;
  });
  if (!brRows.length || (!g3Fails.length && g3Blind.length === brRows.length)) skip('G3', g3Name, brRows.length ? `levels compared with ${g3Blind.join(', ')} not in range` : 'no breather in range');
  else gate('G3', g3Name, g3Fails, g3Blind.length ? `not fully checked (a compared level is not in range): ${g3Blind.join(', ')}` : '');
  if (!brRows.length) skip('G4', 'weak ≥ 60% on every breather', 'no breather in range');
  else gate('G4', 'weak ≥ 60% on every breather',
    brRows.filter(r => r.profiles.weak.p < G4_WEAK).map(r => `L${r.L} weak ${r.profiles.weak.p}`));
  const r30 = byL.get(30), skilledMin = BBD.e1().skilledL30;
  const g5Name = `skilled ≥ ${skilledMin * 100}% at L30 (E1 = ${BBD.CONFIG.E1})`;
  if (!r30) skip('G5', g5Name, 'L30 not in range');
  else gate('G5', g5Name, r30.profiles.skilled.p < skilledMin ? [`L30 skilled ${r30.profiles.skilled.p}`] : []);
  const spec = BBD.spec(game);
  const g6Diag = [];
  let maxOverlapDiag = 0, maxOverlapTag = '', cellUnderDiscCount = 0;
  gate('G6', `knobs within hardCap; targets ≥ ${TOUCH_PX} px & crowding checks (320p, 390p, 667l)`,
    rows.flatMap(r => {
      const f = [];
      spec.knobs.forEach(k => {
        const v = r.knobs[k.name];
        if (typeof v === 'number' && (k.dir > 0 ? v > k.hardCap + 1e-9 : v < k.hardCap - 1e-9)) f.push(`L${r.L} ${k.name}=${v} past cap ${k.hardCap}`);
      });
      if (adapter.geometry) {
        const lvl = BBD.level(game, r.L);
        let discSmall = false;
        for (const [w, h, tag] of G6_VIEWPORTS) {
          const g = adapter.geometry(lvl, w, h);
          if (g.minTargetPx < TOUCH_PX) f.push(`L${r.L} ${g.minTargetPx.toFixed(1)} px at ${tag}`);
          if (g.minKeyW !== undefined && g.minKeyW < G6_KEY_W_MIN) f.push(`L${r.L} minKeyW=${g.minKeyW} < ${G6_KEY_W_MIN} at ${tag}`);
          if (g.tilePx !== undefined && g.tilePx < G6_TILE_MIN) f.push(`L${r.L} tilePx=${g.tilePx} < ${G6_TILE_MIN} at ${tag}`);
          if (g.switchGapPx !== undefined && g.switchGapPx < G6_SWITCH_GAP_MIN) f.push(`L${r.L} switchGap=${g.switchGapPx} < ${G6_SWITCH_GAP_MIN} at ${tag}`);
          if (g.hitAreaFill !== undefined && g.hitAreaFill > G6_KOI_FILL_MAX) f.push(`L${r.L} fill=${g.hitAreaFill} > ${G6_KOI_FILL_MAX} at ${tag}`);
          if (g.pOverlapNeighbor !== undefined) {
            const ovCap = w <= 320 || h <= 400 ? G6_KOI_OVERLAP_TIGHT : G6_KOI_OVERLAP_STD;
            if (g.pOverlapNeighbor > ovCap) f.push(`L${r.L} overlap=${(g.pOverlapNeighbor * 100).toFixed(1)}% > ${(ovCap * 100).toFixed(0)}% at ${tag}`);
            if (g.pOverlapNeighbor > maxOverlapDiag) { maxOverlapDiag = g.pOverlapNeighbor; maxOverlapTag = `L${r.L}@${tag}`; }
          }
          if (g.cell !== undefined && g.visualDiscPx !== undefined && g.cell < g.visualDiscPx) discSmall = true;
        }
        if (discSmall) cellUnderDiscCount++;
      }
      return f;
    }), (() => {
      if (!adapter.geometry) return 'adapter has no geometry(): px part not checked';
      if (cellUnderDiscCount) g6Diag.push(`cell < disc on ${cellUnderDiscCount} levels`);
      if (maxOverlapDiag > 0) g6Diag.push(`max overlap ${(maxOverlapDiag * 100).toFixed(1)}% (${maxOverlapTag})`);
      return g6Diag.join('; ');
    })());
  const firstPeak = bOneSidedBelow(BBD), rPk = byL.get(firstPeak);
  const g9Name = `weak ≥ ${G9_FIRST_PEAK_WEAK * 100}% at the first peak (L${firstPeak})`;
  if (!rPk) skip('G9', g9Name, `L${firstPeak} not in range`);
  else gate('G9', g9Name, rPk.profiles.weak.p < G9_FIRST_PEAK_WEAK ? [`L${firstPeak} weak ${rPk.profiles.weak.p}`] : []);
  out.push({ id: 'G7', name: 'Playwright parity, 3 seeds at L1/L15/L30', pass: null, fails: [],
    note: 'SKIPPED in Node: verified by Playwright (tests/sim-parity.spec.js + tests/word-levels.spec.js)' });
  gate('G8', 'first-attempt and ≤3-attempt pass reported; ≤3 never below first attempt',
    rows.flatMap(r => PROFILE_NAMES.filter(pn => r.profiles[pn].p3 + 0.02 < r.profiles[pn].p).map(pn => `L${r.L} ${pn} p3 ${r.profiles[pn].p3} < p ${r.profiles[pn].p}`)));
  const g10Name = `post-onboarding non-breathers: median blowout ≤ ${G10_BLOWOUT_MAX * 100}% and clutch > 0`;
  const hasG10Data = rows.some(r => typeof r.profiles.median.blowout === 'number' && typeof r.profiles.median.clutch === 'number');
  const g10Rows = rows.filter(r => r.L >= 15 && r.kind !== 'breather' && typeof r.profiles.median.blowout === 'number' && typeof r.profiles.median.clutch === 'number');
  if (!hasG10Data || !g10Rows.length) {
    skip('G10', g10Name, 'no L15+ non-breather blowout telemetry in range');
  } else {
    const g10Early = rows.filter(r => r.L < 15 && typeof r.profiles.median.blowout === 'number' && (r.profiles.median.blowout > G10_BLOWOUT_MAX || r.profiles.median.clutch <= 0));
    gate('G10', g10Name,
      g10Rows.flatMap(r => {
        const f = [];
        if (r.profiles.median.blowout > G10_BLOWOUT_MAX) f.push(`L${r.L} blowout ${r.profiles.median.blowout} > ${G10_BLOWOUT_MAX}`);
        if (r.profiles.median.clutch <= 0) f.push(`L${r.L} clutch 0`);
        return f;
      }),
      g10Early.length ? `L1–14 warn-only (${g10Early.length} flat onboarding levels: ${g10Early.slice(0, 4).map(r => `L${r.L}`).join(',')}${g10Early.length > 4 ? '…' : ''})` : '');
  }
  gate('G11', `skill monotonicity + spread ≥ ${G11_SPREAD_MIN * 100}% off-ceiling (L15+, med ≤ 85%)`,
    rows.flatMap(r => {
      const f = [], wk = r.profiles.weak, med = r.profiles.median, sk = r.profiles.skilled;
      if (sk.p + tolFor(sk.p, med.p, n) < med.p) f.push(`L${r.L} skilled ${sk.p} < median ${med.p}`);
      if (med.p + tolFor(med.p, wk.p, n) < wk.p) f.push(`L${r.L} median ${med.p} < weak ${wk.p}`);
      if (r.L >= 15 && med.p <= 0.85 && sk.p - wk.p < G11_SPREAD_MIN) f.push(`L${r.L} spread ${(sk.p - wk.p).toFixed(3)} < ${G11_SPREAD_MIN}`);
      if (r.L < 15 && med.p > 0.85 && typeof sk.msMedian === 'number' && typeof wk.msMedian === 'number' && typeof sk.acc === 'number' && typeof wk.acc === 'number') {
        if (sk.msMedian > wk.msMedian && sk.acc < wk.acc - 0.01) f.push(`L${r.L} ceiling inversion: sk ms ${sk.msMedian} > wk ${wk.msMedian} and acc ${sk.acc} < ${wk.acc}`);
      }
      return f;
    }));
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
    provenance: PROVENANCE,
    adapterOpts, ok, waived, gates, levels: rows,
  };
  if (write) writeFileSync(join(ROOT, 'docs', 'difficulty', `calibration-${game}.json`), JSON.stringify(report, null, 1) + '\n');
  if (!quiet) print(report, BBD);
  return report;
}

function print({ game, n, levels, gates, ok, waived, provenance }, BBD) {
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
  if (provenance) console.log(`\n[${provenance}]`);
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
