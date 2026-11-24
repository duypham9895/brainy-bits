// Adapter: Đường Ray Tư Duy (js/train.js + js/train-map.js). Interface: see adapters/mem.mjs.
//
// Real code reused (loaded into node:vm with Math.random swapped for a seeded rng, nothing rewritten):
//   · RTD_MAP.generate(n, W, H)  — the shipped map generator (tunnel at the top, tree of 2-way switches)
//   · RTD_MAP.spawnGap(...)      — the shipped spawn mix (burst / rest / normal), moved there from train.js
// Rules mirrored from js/train.js: LEVEL_TIME 90 s, first train 1.0 s after "Xuất phát", no spawn in the last
// 1.5 s, colour bag (every station once per bag, no immediate repeat), speed = 2.6·speedF cells/s,
// a tap may still re-route a train until it is 0.2 cell past the switch disc (grace), pass = ≥ 80% correct.
//
// Human side (event-driven, one attention channel, earliest-deadline-first):
//   identify(train) = choiceRT + SEARCH_MS·stations + TRACE_MS·switches on its path      [EXG] + [NEW] slopes
//                     (first time a station is the target this round; later: choiceRT + RECALL_MS, the map is static)
//   flip(switch)    = MOVE_MS + |N(0, motorSigma)| when planned right after identifying; a full ex-Gaussian RT
//                     when the player sat waiting for the previous train (other side) to clear the switch.
//                     It must land after that train clears and before this train clears.
//   lapse per train = the player sends it to a wrong station.                              [NEW] (human.mjs)
//   working memory  = at most floor(K) trains with planned-but-not-done flips [LV97][COW]; a plan that does
//                     not fit is dropped and the train is looked at again (recall cost) once a slot frees. [NEW]
// A train is correct when every switch on its path shows its side at the moment it clears that switch.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { ROOT } from '../load-bbd.mjs';
import { samplePlayer, exGauss, lapses, normal, mulberry32, cyrb53 } from '../human.mjs';

export const game = 'train';
export const LEVEL_TIME = 90, FIRST_SPAWN = 1.0, SPAWN_STOP = 1.5, PASS_PCT = 80;
export const SEARCH_MS = 40;   // [NEW] visual search per station for the train's colour+glyph (conjunction search range)
export const TRACE_MS = 150;   // [NEW] tracing the route through one switch
export const RECALL_MS = 200;  // [NEW] a station already sent to this round: route recalled, no search or trace
export const MOVE_MS = 250;    // [NEW] a planned tap on a switch already chosen (Fitts movement, no new stimulus)
export const GRACE_CELLS = 1.16;   // train.js: tileLen ≈ 2·TR = 0.96 cell, + grace 0.2 cell
export const VIEW = { W: 390, H: 700 };   // train-map.js default viewport; the map pool is generated at this size
export const POOL = 16;        // maps per station count

// ---------- real game code in a vm ----------
let RTD = null, rngBox = { r: Math.random };
function loadMap() {
  if (RTD) return RTD;
  const ctx = vm.createContext({ window: {}, __rng: () => rngBox.r() });
  vm.runInContext('Math.random = () => __rng();', ctx);
  vm.runInContext(readFileSync(join(ROOT, 'js', 'train-map.js'), 'utf8'), ctx, { filename: 'js/train-map.js' });
  RTD = ctx.window.RTD_MAP;
  return RTD;
}

// Routes from the tunnel to every station: [{ station, steps: [{ sw, side, at }] , len }], distances in cells.
// Grid-step lengths; the pixel path adds +0.45 cell before the tunnel and −0.48 cell (TR) into each switch.
function routes(map) {
  const out = [];
  const walk = (edge, dist, steps) => {
    const d = dist + edge.g.length - 1;
    const to = edge.to;
    if (to.type === 'station') { out.push({ station: to, steps, len: d }); return; }
    to.childEdges.forEach((ce, side) => walk(ce, d, steps.concat([{ sw: to, side, at: d + 0.45 - 0.48 }])));
  };
  walk(map.tunnel.edge, 0, []);
  return out;
}

const pools = new Map();
export function mapPool(n) {
  if (pools.has(n)) return pools.get(n);
  const M = loadMap(), list = [];
  for (let i = 0; i < POOL; i++) {
    rngBox.r = mulberry32(cyrb53(`trainmap|${n}|${i}|${VIEW.W}x${VIEW.H}`) >>> 0);
    const m = M.generate(n, VIEW.W, VIEW.H);
    m.switches.forEach((s, k) => { s.id = k; });
    list.push({ map: m, routes: routes(m), sel0: m.switches.map(s => s.sel) });
  }
  rngBox.r = Math.random;
  pools.set(n, list);
  return list;
}

// Spawn schedule with the shipped mix, 2-bag station draw and per-train speed variance. Returns [{ t, route, sm }].
function schedule(spec, entry, rng) {
  const M = loadMap();
  const out = [];
  const speedVar = spec.speedVar || 0;
  let t = FIRST_SPAWN, lastBurst = false, bag = [], lastKey = -1, prevKey = -1;
  const T = spec.time || LEVEL_TIME;
  while (T - t > SPAWN_STOP) {
    const k = M.drawStationIdx(bag, entry.routes.length, lastKey, prevKey, rng);
    prevKey = lastKey; lastKey = k;
    out.push({ t, route: entry.routes[k], sm: M.trainSpeedMul(speedVar, rng) });
    const g = M.spawnGap(spec.base, spec.burstP, lastBurst, rng);
    lastBurst = g.burst; t += g.gap;
  }
  return out;
}

export function simulate(levelSpec, profile, rng, opts = {}) {
  const spec = levelSpec;
  const pool = mapPool(spec.stations);
  const entry = pool[(rng() * pool.length) | 0];
  const v = 2.6 * spec.speedF;                                   // cells per second (train.js layout: cell·2.6·speedF px/s)
  const player = opts.player || samplePlayer(profile, rng, opts);
  const trains = schedule(spec, entry, rng);
  const nSw = entry.map.switches.length, n = spec.stations;
  const searchMs = opts.searchMs ?? SEARCH_MS, traceMs = opts.traceMs ?? TRACE_MS, recallMs = opts.recallMs ?? RECALL_MS;
  // capacity this attempt = K + 0.5·N(0,1), the same trial noise holdsPattern() uses (human.mjs)
  const seen = new Set(), cap = Math.max(1, Math.floor(player.K + 0.5 * normal(rng)));

  // per train: when it clears each switch on its path (seconds), obeying bumper headway floor
  const lastSwClear = new Array(nSw).fill(-1e9), headwayS = 0.95 / v;
  trains.forEach((tr, i) => {
    tr.i = i;
    tr.clear = tr.route.steps.map(s => {
      const raw = tr.t + (s.at + GRACE_CELLS) / (v * tr.sm);
      const cl = Math.max(raw, lastSwClear[s.sw.id] + headwayS);
      lastSwClear[s.sw.id] = cl;
      return cl;
    });
    tr.lapse = lapses(player, rng);
  });
  // per switch: trains passing it in time order (same speed + shared prefix ⇒ spawn order)
  const bySw = Array.from({ length: nSw }, () => []);
  trains.forEach(tr => tr.route.steps.forEach((s, k) => bySw[s.sw.id].push({ tr, k, side: s.side })));
  const flips = Array.from({ length: nSw }, () => []);         // flip times per switch
  const sideAt = (id, t) => { let s = entry.sel0[id]; for (const f of flips[id]) if (f <= t) s ^= 1; return s; };

  // EDF over released tasks. identify tasks release at spawn; flip tasks once identified (and after the
  // previous train needing the other side has cleared). Late flips are dropped: the train is already gone.
  const tasks = trains.map(tr => ({ kind: 'id', tr, rel: tr.t, due: tr.clear[0] ?? tr.t + 99 }));
  let now = 0, ms = 0, waited = false;
  while (tasks.length) {
    let best = -1, nextRel = Infinity;
    for (let j = 0; j < tasks.length; j++) {
      const q = tasks[j];
      if (q.rel <= now) { if (best < 0 || q.due < tasks[best].due) best = j; }
      else nextRel = Math.min(nextRel, q.rel);
    }
    if (best < 0) { now = nextRel; waited = true; continue; }
    const reactive = waited; waited = false;
    const q = tasks.splice(best, 1)[0];
    if (q.kind === 'id') {
      const tr = q.tr;
      const known = q.again || seen.has(tr.route.station); seen.add(tr.route.station);
      now += (exGauss(rng, player.rt) + (known ? recallMs : searchMs * n + traceMs * tr.route.steps.length)) / 1000;
      if (tr.lapse) continue;                                    // sent the wrong way: no useful flips
      const pend = tasks.filter(x => x.kind === 'flip'), held = new Set(pend.map(x => x.tr));
      if (held.size >= cap) {                                    // no slot: look again when the next plan is done
        const last = tr.clear[tr.clear.length - 1] ?? now;
        if (now < last) tasks.push({ kind: 'id', tr, rel: Math.max(now, Math.min(...pend.map(x => x.due))), due: q.due, again: true });
        continue;
      }
      tr.route.steps.forEach((s, k) => {
        const list = bySw[s.sw.id], pos = list.findIndex(x => x.tr === tr && x.k === k);
        let rel = now;
        for (let p = pos - 1; p >= 0; p--) {                     // latest earlier train that needs the other side
          const prev = list[p];
          if (prev.side !== s.side) { rel = Math.max(rel, prev.tr.clear[prev.k]); break; }
        }
        tasks.push({ kind: 'flip', tr, k, sw: s.sw.id, side: s.side, rel, due: tr.clear[k] });
      });
    } else {
      if (now > q.due) continue;                                 // too late, drop
      if (sideAt(q.sw, now) === q.side) continue;                // already right: a glance, no tap
      const t = now + (reactive ? exGauss(rng, player.rt) : MOVE_MS + Math.abs(player.motorSigma * normal(rng))) / 1000;
      if (t > q.due) { now = q.due; continue; }                  // reached for it, the train got there first
      now = t;
      if (rng() < player.tapSlip) continue;                      // mis-touch: no flip
      flips[q.sw].push(now);
    }
  }
  let correct = 0;
  trains.forEach(tr => {
    const ok = !tr.lapse && tr.route.steps.every((s, k) => sideAt(s.sw.id, tr.clear[k]) === s.side);
    if (ok) correct++;
    ms = Math.max(ms, (tr.t + (tr.route.len + 0.45) / (v * tr.sm)) * 1000);
  });
  const total = trains.length, pct = total ? Math.round(correct / total * 100) : 0;
  return { pass: total > 0 && pct >= PASS_PCT, accuracy: total ? correct / total : 0, ms: Math.round(ms + 3600),
    margin: pct - PASS_PCT, detail: { correct, total } };
}

// Touch target (gate G6). train.js pointerdown: the nearest switch within max(32, TR + 16) px flips, so the
// target is that hit circle, clipped by the half-way line to the next switch (Manhattan ≥ MIN_SW_DIST = 2, so ≥ √2 cells Euclid).
// cell = min(W/(C−1+1.3), H/(R−1+1.3), 72) with the widest grid gridSize() gives (C = 6/7/8 by stations),
// H = 1.6·W (portrait phone canvas under the HUD) [assumption]. visualDiscPx = the drawn green disc (js/train.js DISC_MIN_R), reported only.
export function geometry(levelSpec, viewportW, viewportH = Math.round(viewportW * 1.6)) {
  const n = levelSpec.stations;
  const C = n <= 6 ? 6 : n <= 11 ? 7 : 8;
  const R = Math.max(C, Math.min(C * 2, Math.round(C * viewportH / viewportW)));
  const cell = Math.min(viewportW / (C - 1 + 1.3), viewportH / (R - 1 + 1.3), 72);
  const TR = cell * 0.48;
  // MIN_SW_DIST is Manhattan (2), so two switches can sit diagonally, √2 cells apart (Euclid).
  const hit = 2 * Math.max(32, TR + 16), spacing = Math.SQRT2 * cell;
  return { minTargetPx: Math.min(hit, spacing), cell, visualDiscPx: 2 * Math.max(TR + 1, 22) };
}
