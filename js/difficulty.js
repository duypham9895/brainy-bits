// ======================= BRAINY BITS — SHARED DIFFICULTY ENGINE (window.BBD) =======================
// Classic script for the browser, and loadable in Node (node:vm, or module.exports when CommonJS).
// No dependency on BB at load time. Every function is pure except register() and the Elo storage helpers,
// which take the storage object as an argument (localStorage in the browser, a Map-like stub in Node).
// Spec: docs/difficulty/MERGED-SPEC.md §4.1 (curve), §4.5 (runtime). Rule: docs/DIFFICULTY-RULES.md.
(function (root, factory) {
  const BBD = factory();
  root.BBD = BBD;
  if (typeof module === 'object' && module && module.exports) module.exports = BBD;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
'use strict';

// ---------- Owner decisions (gates/01-spec/DIFFICULTY-DECISIONS.md). One line each = one answer. ----------
const CONFIG = {
  E1: 'A',                 // L30 peak median pass: 'A' ≈ 0.69 (default) | 'B' ≈ 0.58. Presets in E1_PRESETS.
  E2_WORD_LEVELS: 49,      // Đoán Cụm Từ: keep all 49 (default) or cut to 30.
  // E3 lifted by Duy 2026-11-21: a table plays its `levels` rows (L1..n, retuned to the template) and keeps
  // `legacyLevels` as reference data for parity tests and progress migration. true = play legacy rows again,
  // but it is NOT a valid rollback: knob max/start/relief were retuned for the 30 `levels` rows, so after the
  // 10–13 legacy rows the generated levels get easier (train L12–30, koi L11, mem L14, rain L11). Roll back by
  // reverting the commit instead. Kept only so parity tests can replay the v1 rows.
  E3_FREEZE_LEGACY: false,
  E4: { maxStars: 1, unlocksNext: true, slowTempo: 0.85 },  // win on "lighter": star cap, unlock L+1, slow tempo (null = off)
  E5_KNOBS_ONLY: true,     // true = knobs only; knobs flagged rule:true (new mechanics) stay off.

  // Curve constants (MERGED-SPEC §4.1). Not owner decisions; change only with a calibration run.
  REF_L: 30,               // D(REF_L) = 1
  PERIOD: 5,               // peak at 5k, breather at 5k+1, both only from SAW_FROM_PERIODS·PERIOD on (first peak L15, first breather L16)
  BREATHER_EASY_OK: true,  // Duy 2026-11-22 (rain, A): a breather may be as easy as needed. B fails it only when too hard; G3 drops 'easier than L−4'. G4 stays.
  B_EASY_OK_BEFORE_SAW: true, // Duy 2026-11-22 (Gen Z players): on L1..sawStart-1 gate B fails only when median < p* − BAND (too hard). false = two-sided.
  SAW_FROM_PERIODS: 3,     // Duy 2026-11-22 (B, all games): first peak L15. Was 2 (L10) from 2026-11-21 (1); 1 = old L5 peak.
  // Early ramp, Duy 2026-11-22 (B): p* falls in a straight line 0.97 (L1) → 0.90 (EARLY_KNEE_L), then 0.90 → the L30
  // step value, then the √ curve below from L31 on (continuous at L30). Research: docs/difficulty/research-early.html.
  EARLY_TOP: 0.97,
  EARLY_KNEE_L: 15,
  EARLY_KNEE_P: 0.90,
  P_TOP: 0.92,             // √-curve top, used from L31 on (it meets the early ramp at L30), R:dda
  PEAK_DIP: 0.06,          // peak levels: p* − 0.06 (A)
  BREATHER_OFFSET: 0,      // A-1 fix: breathers get no p* bonus (applies from the first breather, L11)
  LIGHTER: { maxRelief: 0.15, failsInRow: 2, pBelow: 0.5, suggestPrevAfter: 3 },  // §4.5, R:dda, Hunicke
  ELO: { uSlope: 0.05, key: 'bbd_theta' },                                         // Pelánek U(n)=1/(1+0.05n)
};
// E1 presets. l30Peak = median pass at the L30 peak; floor = lowest p* for L31+; skilledL30 = gate G5.
const E1_PRESETS = {
  A: { l30Peak: 0.69, floor: 0.65, skilledL30: 0.50 },
  B: { l30Peak: 0.58, floor: 0.45, skilledL30: 0.80 },
};
const e1 = () => E1_PRESETS[CONFIG.E1] || E1_PRESETS.A;

// ---------- curve ----------
const RESERVED = new Set(['L', 'kind', 'legacy', 'authored', 'id', 'D', 'pStar', 'exhausted', 'assist']);
function D(L) { return Math.sqrt(Math.max(0, L - 1) / (CONFIG.REF_L - 1)); }          // A, R:dda (abagames, MIT)
// Sawtooth: peak at L % PERIOD === 0, breather right after it, but only from L = SAW_FROM_PERIODS·PERIOD on.
// Default (PERIOD 5, from 3): L1–14 steps, L15 peak, L16 breather, L20 peak, L21 breather, …
function sawStart() { return CONFIG.PERIOD * CONFIG.SAW_FROM_PERIODS; }
function kind(L) {
  const P = CONFIG.PERIOD, S = sawStart();
  if (L >= S && L % P === 0) return 'peak';
  if (L > S && L % P === 1) return 'breather';
  return 'step';
}
// Step value of p* before the peak dip / breather offset.
function pBase(L) {
  const pBottom = e1().l30Peak + CONFIG.PEAK_DIP;                  // A: 0.75 ⇒ L30 peak 0.69
  const { EARLY_TOP: top, EARLY_KNEE_L: kL, EARLY_KNEE_P: kP, REF_L: ref } = CONFIG;
  if (L <= kL) return top - (top - kP) * (Math.max(1, L) - 1) / (kL - 1);
  if (L <= ref) return kP - (kP - pBottom) * (L - kL) / (ref - kL);
  return CONFIG.P_TOP - (CONFIG.P_TOP - pBottom) * D(L);          // = pBottom at L30, so the seam is continuous
}
function pStar(L) {
  const k = kind(L);
  const p = pBase(L) - (k === 'peak' ? CONFIG.PEAK_DIP : 0) + (k === 'breather' ? CONFIG.BREATHER_OFFSET : 0);
  return Math.max(e1().floor, p);
}

// ---------- registry ----------
const specs = new Map();
const isInt = n => Number.isInteger(n) && n >= 1;
// Gates a table may waive, each with a written reason (Duy 2026-11-21 (3): word waives B). Every other gate stays binding.
// G9 added Duy 2026-11-22 (rain only, A): the weak/median gap in human.mjs makes G9 and B exclusive at rain's L15.
const WAIVABLE_GATES = Object.freeze(['B', 'G9']);
function checkWaivers(g, w) {
  if (w == null) return Object.freeze({});
  if (typeof w !== 'object' || Array.isArray(w)) throw new Error(`BBD.register(${g}): gateWaivers must be an object { gateId: reason }`);
  Object.keys(w).forEach(id => {
    if (!WAIVABLE_GATES.includes(id)) throw new Error(`BBD.register(${g}): gate "${id}" cannot be waived (only ${WAIVABLE_GATES.join(', ')})`);
    if (typeof w[id] !== 'string' || !w[id].trim()) throw new Error(`BBD.register(${g}): waiver for gate ${id} needs a reason string`);
  });
  return Object.freeze({ ...w });
}

function register(gameKey, spec) {
  if (typeof gameKey !== 'string' || !gameKey) throw new TypeError('BBD.register: gameKey must be a string');
  if (!spec || typeof spec !== 'object') throw new TypeError(`BBD.register(${gameKey}): spec missing`);
  const legacy = (spec.legacyLevels || []).map(r => Object.freeze({ ...r }));
  const authored = (spec.levels || []).map(r => ({ ...r }));
  const version = spec.version === undefined ? 1 : spec.version;
  if (!isInt(version)) throw new Error(`BBD.register(${gameKey}): version must be an integer ≥ 1`);
  if (spec.migrate != null && typeof spec.migrate !== 'function') throw new Error(`BBD.register(${gameKey}): migrate must be a function`);
  const knobs = (spec.knobs || []).map(k => normKnob(gameKey, k, authored.length ? authored : legacy));
  checkLevels(gameKey, authored, knobs);
  const names = new Set(knobs.map(k => k.name));
  const priority = (spec.priority || knobs.map(k => k.name)).slice();
  priority.forEach(n => { if (!names.has(n)) throw new Error(`BBD.register(${gameKey}): priority names unknown knob "${n}"`); });
  const fx = list => (list || []).map(r => {
    if (!names.has(r.knob)) throw new Error(`BBD.register(${gameKey}): relief/peak names unknown knob "${r.knob}"`);
    return Object.freeze({ knob: r.knob, by: r.by });
  });
  const s = Object.freeze({
    key: gameKey, version, migrate: spec.migrate || null,
    legacy: Object.freeze(legacy), levels: Object.freeze(authored.map(r => Object.freeze(r))), knobs: Object.freeze(knobs), priority: Object.freeze(priority),
    relief: Object.freeze(fx(spec.relief)), peak: Object.freeze(fx(spec.peak)),
    lighterKnobs: Object.freeze((spec.lighterKnobs || priority).slice()),
    derive: typeof spec.derive === 'function' ? spec.derive : null,
    maxLevel: spec.maxLevel, strictPeaks: !!spec.strictPeaks, overrides: Object.freeze({ ...(spec.overrides || {}) }),
    meta: Object.freeze({ ...(spec.meta || {}) }),
    gateWaivers: checkWaivers(gameKey, spec.gateWaivers),
  });
  specs.set(gameKey, s);
  return s;
}
function normKnob(g, k, legacy) {
  if (!k || typeof k.name !== 'string') throw new Error(`BBD.register(${g}): knob needs a name`);
  if (RESERVED.has(k.name)) throw new Error(`BBD.register(${g}): knob name "${k.name}" is reserved`);
  if (typeof k.hardCap !== 'number') throw new Error(`BBD.register(${g}): knob "${k.name}" needs a numeric hardCap`);
  const last = legacy.length ? legacy[legacy.length - 1][k.name] : undefined;
  const min = typeof k.min === 'number' ? k.min : last;
  if (typeof min !== 'number') throw new Error(`BBD.register(${g}): knob "${k.name}" needs min (or a legacy value)`);
  // `start` is written for one table length: the row count it steps back from. Appending rows moves the anchor,
  // so `start` stops applying there instead of pulling L(n+1) back to an old value (review 2026-11-22).
  if (typeof k.start === 'number' && !isInt(k.startAt)) throw new Error(`BBD.register(${g}): knob "${k.name}" has start but no startAt (the levels count it was written for)`);
  const dir = Math.sign(k.hardCap - min) || Math.sign((k.max ?? k.hardCap) - min) || (k.dir || 1);
  const step = k.int ? Math.max(1, k.step || 1) : (k.step || 0);
  return Object.freeze({
    name: k.name, min, max: typeof k.max === 'number' ? k.max : null, hardCap: k.hardCap,
    start: typeof k.start === 'number' ? k.start : null,
    startAt: k.startAt === undefined ? null : k.startAt,
    off: typeof k.off === 'number' ? k.off : min, curve: k.curve || 'sqrt', unlockAt: k.unlockAt || 0,
    step, notch: k.notch || step, int: !!k.int, dir, rule: !!k.rule, reserve: !!k.reserve, changeOn: k.changeOn || 'any',
    source: k.source || '',
  });
}
// `levels` rows are authored L1..n: every live knob must be there (rule knobs default to off), and an `id`,
// when given, is a stable star key: a non-numeric string, unique, so it never collides with level-number keys.
function checkLevels(g, rows, knobs) {
  const ids = new Set();
  rows.forEach((r, i) => {
    knobs.forEach(k => {
      if (typeof r[k.name] === 'number') return;
      if (k.rule) { r[k.name] = k.off; return; }
      throw new Error(`BBD.register(${g}): levels[${i}] (L${i + 1}) misses knob "${k.name}"`);
    });
    if (r.id === undefined) return;
    if (typeof r.id !== 'string' || !r.id || /^\d+$/.test(r.id)) throw new Error(`BBD.register(${g}): L${i + 1} id must be a non-numeric string`);
    if (ids.has(r.id)) throw new Error(`BBD.register(${g}): duplicate level id "${r.id}"`);
    ids.add(r.id);
  });
}
function get(gameKey) {
  const s = specs.get(gameKey);
  if (!s) throw new Error(`BBD: unknown game "${gameKey}". Load js/levels/${gameKey}.js after js/difficulty.js.`);
  return s;
}

// ---------- knob arithmetic ----------
const harder = (k, a, b) => (k.dir > 0 ? Math.max(a, b) : Math.min(a, b));   // the harder of two values
const capped = (k, v) => (k.dir > 0 ? Math.min(v, k.hardCap) : Math.max(v, k.hardCap));
const atCap = (k, v) => (k.dir > 0 ? v >= k.hardCap - 1e-9 : v <= k.hardCap + 1e-9);
function quant(k, v) {
  if (k.step > 0) v = Math.round(v / k.step) * k.step;
  v = +v.toFixed(6);
  return capped(k, v);
}
function curveOf(name, u) {
  if (u <= 0) return 0;
  if (name === 'linear') return u;
  if (name === 'quad') return u * u;
  return Math.sqrt(u);                                   // 'sqrt' (default): steep early, flat late
}
// Rows played as written before the formula takes over: `levels` (E3 lifted), else `legacyLevels`.
// A table without `levels` keeps playing its legacy rows, gated like any other level, until its owner retunes it.
const seedOf = s => (CONFIG.E3_FREEZE_LEGACY || !s.levels.length ? s.legacy : s.levels);
const legacyN = s => seedOf(s).length;

// Where a knob starts moving: [anchorL, anchorV]. Reserve knobs wait for the previous knob in
// `priority` to reach its hardCap, then start at the next breather (spec §4.6 step 3).
function anchor(s, k) {
  const seed = seedOf(s), n = seed.length;
  const fromLegacy = n && typeof seed[n - 1][k.name] === 'number';
  let aL = fromLegacy ? n : 1, aV = fromLegacy ? seed[n - 1][k.name] : k.min;
  // First generated level jumps to `start`, but only while the table still ends where `start` was written for.
  if (k.start !== null && fromLegacy && n === k.startAt) aV = k.start;
  if (k.unlockAt && k.unlockAt - 1 > aL) { aL = k.unlockAt - 1; aV = k.off; }
  if (k.reserve) {
    const i = s.priority.indexOf(k.name);
    const prev = i > 0 ? s.knobs.find(x => x.name === s.priority[i - 1]) : null;
    if (prev) {
      let L = Math.max(aL + 1, n + 1);
      while (L < 2000 && !atCap(prev, raw(s, prev, L - 1))) L++;
      while (L < 2000 && kind(L) !== 'breather') L++;
      if (L - 1 > aL) { aL = L - 1; aV = k.off; }
    }
  }
  return [aL, aV];
}
// Knob value from the formula alone (no peak/breather shaping).
function raw(s, k, L) {
  if (k.rule && CONFIG.E5_KNOBS_ONLY) return k.off;
  const seed = seedOf(s), n = seed.length;
  if (L <= n && typeof seed[L - 1][k.name] === 'number') return seed[L - 1][k.name];
  const [aL, aV] = anchor(s, k);
  if (L <= aL) return aV;
  let Le = L;
  if (k.changeOn === 'breather') {                       // hold the value between breathers
    while (Le > aL + 1 && kind(Le) !== 'breather') Le--;
    if (kind(Le) !== 'breather') return aV;
  }
  let v;
  if (k.max === null) {
    let units = Le - aL;                                  // stepping knob: one step per level…
    if (k.changeOn === 'breather') { units = 0; for (let x = aL + 1; x <= Le; x++) if (kind(x) === 'breather') units++; }  // …or per breather
    v = aV + k.dir * (k.step || 1) * units;
  } else {
    const den = D(CONFIG.REF_L) - D(aL);
    const u = den > 1e-9 ? (D(Le) - D(aL)) / den : (Le - aL) / 10;
    v = aV + (k.max - aV) * curveOf(k.curve, u);
  }
  v = quant(k, v);
  if (k.unlockAt && L >= k.unlockAt && aV === k.off && v === k.off && k.step) v = quant(k, k.off + k.dir * k.step);
  return v;
}

// ---------- level ----------
function compute(s, L) {
  const seed = seedOf(s), n = seed.length;
  if (L <= n && seed === s.legacy) return { ...s.legacy[L - 1], L, kind: kind(L), legacy: true };   // bit-exact
  if (L <= n) {
    const row = { ...seed[L - 1], ...(s.overrides[L] || {}) };
    const derived = s.derive ? s.derive({ ...row }, L) : null;
    return { ...row, ...(derived || {}), L, kind: kind(L), legacy: false, authored: true };
  }
  if (!s.knobs.length) throw new RangeError(`BBD.level(${s.key}, ${L}): content-only game ends at L${n}; add content rows first`);
  const row = {};
  s.knobs.forEach(k => { row[k.name] = raw(s, k, L); });
  const kd = kind(L);
  if (kd === 'peak') s.peak.forEach(p => {
    const k = s.knobs.find(x => x.name === p.knob);
    row[k.name] = quant(k, row[k.name] + k.dir * (p.by ?? k.step));
  });
  if (kd === 'breather') s.relief.forEach(r => {
    const k = s.knobs.find(x => x.name === r.knob);
    const relieved = quant(k, row[k.name] - k.dir * (r.by ?? k.step));
    // Breathers stay monotone among themselves: never easier than the previous breather, authored or generated
    // (so L31 is never easier than a written L26). Whether a breather sits between its peak and L−4 is a
    // pass-rate question: gate G3 in the simulator.
    const prevL = L - CONFIG.PERIOD;
    const prevB = prevL >= 1 && kind(prevL) === 'breather' ? levelRow(s, prevL)[k.name] : undefined;
    row[k.name] = typeof prevB === 'number' ? harder(k, relieved, prevB) : relieved;
  });
  Object.assign(row, s.overrides[L] || {});              // authored exceptions, e.g. a hand-set L30
  const derived = s.derive ? s.derive({ ...row }, L) : null;
  return { ...row, ...(derived || {}), L, kind: kd, legacy: false };
}
const cache = new Map();                                  // key: game|L|configStamp
const stamp = () => JSON.stringify([CONFIG.E1, CONFIG.E3_FREEZE_LEGACY, CONFIG.E5_KNOBS_ONLY, CONFIG.REF_L, CONFIG.PERIOD, CONFIG.SAW_FROM_PERIODS]);
function levelRow(s, L) {
  const key = `${s.key}|${L}|${stamp()}`;
  let r = cache.get(key);
  if (!r) { r = Object.freeze(compute(s, L)); cache.set(key, r); }
  return r;
}
function level(gameKey, L) {
  if (!isInt(L)) throw new RangeError(`BBD.level(${gameKey}, ${L}): L must be an integer ≥ 1`);
  return levelRow(get(gameKey), L);
}
function maxLevel(gameKey) {
  const s = get(gameKey);
  if (typeof s.maxLevel === 'function') return s.maxLevel(CONFIG, legacyN(s));
  if (typeof s.maxLevel === 'number') return s.maxLevel;
  return s.knobs.length ? Math.max(CONFIG.REF_L, legacyN(s)) : legacyN(s);
}
// Stable star key for level L: the row's `id` when the table gives one (word: phrase id), else L itself,
// so data saved before ids existed (stars[L]) keeps reading the same way.
function levelId(gameKey, L) {
  const r = level(gameKey, L);
  return r.id !== undefined ? r.id : L;
}
const version = gameKey => get(gameKey).version;
// Number of levels read from a written table (levels or legacyLevels) before the formula takes over.
const authoredCount = gameKey => legacyN(get(gameKey));
// True when every non-rule knob sits at its hardCap: the "+10 levels" rule must STOP and ask Duy.
// A table with `strictPeaks: true` is also exhausted from the first generated peak that is not strictly harder
// than both the level before it and the previous peak (no knob easier, at least one harder): a flat peak.
const liveKnobs = s => s.knobs.filter(k => !(k.rule && CONFIG.E5_KNOBS_ONLY));
function strictlyHarder(s, a, b) {
  let more = false;
  for (const k of liveKnobs(s)) {
    const d = k.dir * (a[k.name] - b[k.name]);
    if (d < -1e-9) return false;
    if (d > 1e-9) more = true;
  }
  return more;
}
function firstFlatPeak(s, L) {
  for (let P = legacyN(s) + 1; P <= L; P++) {
    if (kind(P) !== 'peak') continue;
    const row = levelRow(s, P), prevPeak = P - CONFIG.PERIOD;
    if (!strictlyHarder(s, row, levelRow(s, P - 1))) return P;
    if (prevPeak >= 1 && kind(prevPeak) === 'peak' && !strictlyHarder(s, row, levelRow(s, prevPeak))) return P;
  }
  return 0;
}
function exhausted(gameKey, L) {
  const s = get(gameKey);
  const live = liveKnobs(s);
  if (live.length > 0 && live.every(k => atCap(k, raw(s, k, L)))) return true;
  return s.strictPeaks && isInt(L) && firstFlatPeak(s, L) > 0;
}

// ---------- lighter variant (E4, §4.5): one notch easier on the first knob that can move ≤ 15% ----------
function lighter(gameKey, L) {
  const s = get(gameKey), base = level(gameKey, L);
  const meta = { assist: true, maxStars: CONFIG.E4.maxStars, unlocksNext: CONFIG.E4.unlocksNext, slowTempo: CONFIG.E4.slowTempo };
  for (const name of s.lighterKnobs) {
    const k = s.knobs.find(x => x.name === name);
    const v = base[name];
    if (!k || typeof v !== 'number') continue;
    const maxDelta = Math.abs(v) * CONFIG.LIGHTER.maxRelief;
    let delta = k.notch || maxDelta;
    if (delta > maxDelta + 1e-9) {
      if (k.int) continue;                                // a whole step would exceed −15%: try the next knob
      delta = maxDelta;
    }
    if (delta <= 0) continue;
    let nv = v - k.dir * delta;
    nv = k.int ? Math.round(nv) : +nv.toFixed(6);
    if (nv === v) continue;
    const row = { ...base, [name]: nv };
    const derived = s.derive ? s.derive({ ...row }, L) : null;
    return Object.freeze({ ...row, ...(derived || {}), ...meta, lighterKnob: name, from: v });
  }
  return Object.freeze({ ...base, ...meta, lighterKnob: null, noChange: true });
}

// ---------- runtime rating (§4.5): Elo/Rasch, Pelánek 2016. Pure; storage is injected. ----------
const sigmoid = x => 1 / (1 + Math.exp(-x));
const elo = {
  P: (theta, b, a = 1) => sigmoid(a * (theta - b)),
  U: n => 1 / (1 + CONFIG.ELO.uSlope * n),
  bFromP: p => Math.log((1 - p) / p),                  // b_L for θ_median = 0, a = 1 (until 2PL fit lands)
  bOf: (gameKey, L) => elo.bFromP(pStar(L)),
  update(state, { b, won, assist }) {
    const st = { theta: (state && state.theta) || 0, n: (state && state.n) || 0 };
    if (assist) return Object.freeze(st);               // lighter/slow wins never move θ
    const theta = st.theta + elo.U(st.n) * ((won ? 1 : 0) - elo.P(st.theta, b));
    return Object.freeze({ theta: +theta.toFixed(6), n: st.n + 1 });
  },
  replay(log, gameKey, bOf = L => elo.bOf(gameKey, L)) {   // recompute θ from bb_log rows {g, lv, won, assist}
    return (log || []).filter(r => r && r.g === gameKey && isInt(r.lv))
      .reduce((st, r) => elo.update(st, { b: bOf(r.lv), won: r.won, assist: r.assist }), { theta: 0, n: 0 });
  },
  load(storage, gameKey) {
    try { const all = JSON.parse(storage.getItem(CONFIG.ELO.key) || '{}'); return all[gameKey] || { theta: 0, n: 0 }; }
    catch (e) { return { theta: 0, n: 0 }; }
  },
  save(storage, gameKey, state) {
    try {
      const all = JSON.parse(storage.getItem(CONFIG.ELO.key) || '{}');
      all[gameKey] = { theta: state.theta, n: state.n };
      storage.setItem(CONFIG.ELO.key, JSON.stringify(all));
      return true;
    } catch (e) { return false; }
  },
  offerLighter: ({ failsInRow, theta = 0, b }) =>
    failsInRow >= CONFIG.LIGHTER.failsInRow && elo.P(theta, b) < CONFIG.LIGHTER.pBelow,
  suggestPrev: failsInRow => failsInRow >= CONFIG.LIGHTER.suggestPrevAfter,
};

// ---------- progress migration when a table changes version (storage injected, pure otherwise) ----------
// bb_stats[g] = { best, stars } is written by BB.record in js/core.js. When a game ships a new table
// (spec.version + 1) it calls BB.migrateProgress(g) once at load; that runs progress.run() below.
// Contract: idempotent (marker bb_tablev_<g>), never lowers `best` (levels passed), never throws on corrupt data.
const isObj = x => Object.prototype.toString.call(x) === '[object Object]';
const LEVEL_KEY = /^[1-9]\d*$/;
const progress = {
  STATS_KEY: 'bb_stats',
  markerKey: g => `bb_tablev_${g}`,
  // Sanitised copy of one game's stats: best = whole number ≥ 0, stars = { key: 1..3 } (0, junk and NaN dropped).
  clean(entry) {
    const e = isObj(entry) ? entry : {};
    const b = Math.floor(Number(e.best));
    const stars = {};
    if (isObj(e.stars)) Object.keys(e.stars).forEach(k => {
      const v = Math.floor(Number(e.stars[k]));
      if (Number.isFinite(v) && v > 0) stars[k] = Math.min(3, v);
    });
    return { best: Number.isFinite(b) && b > 0 ? b : 0, stars };
  },
  // Move level-number keys ("7") to new keys with mapL(7); other keys (stable ids) pass through untouched,
  // so running the same remap twice changes nothing. Two keys landing on one keep the higher star count.
  remapLevels(stars, mapL) {
    const out = {};
    const put = (k, v) => { out[k] = Math.max(out[k] || 0, v); };
    Object.keys(stars || {}).forEach(k => {
      const v = stars[k];
      if (!LEVEL_KEY.test(k)) { put(k, v); return; }
      const nk = mapL(Number(k));
      put(nk === undefined || nk === null || nk === '' ? k : String(nk), v);   // no mapping: keep, never drop a star
    });
    return out;
  },
  // Stored table version: integer ≥ 1, or null when the marker is missing or corrupt.
  readVersion(storage, g) {
    let raw = null;
    try { raw = storage.getItem(progress.markerKey(g)); } catch (e) { return null; }
    return typeof raw === 'string' && LEVEL_KEY.test(raw) ? Number(raw) : null;
  },
  // Pure step: old entry → new entry. A missing mapper keeps the data as is (same level numbers, new content).
  apply(entry, from, to, mapper, g) {
    const before = progress.clean(entry);
    const mapped = mapper ? mapper({ game: g, from, to, best: before.best, stars: { ...before.stars }, remapLevels: progress.remapLevels }) : before;
    const after = progress.clean(mapped);
    after.best = Math.max(before.best, after.best);                  // levels passed never go down
    return { before, after };
  },
  // Read bb_stats + marker, migrate one game, write both. Returns what happened; never throws.
  //   opts.version: target version (default BBD.version(g)); opts.mapper: default spec.migrate, else identity.
  // No marker = data from version 1 (every table before versions existed). A corrupt marker is treated the same:
  // the mapper only moves stars and `best` can only rise, so re-running from 1 cannot cost a level.
  run(storage, g, opts = {}) {
    let s = null;
    try { s = get(g); } catch (e) { /* game not registered: opts must carry the version */ }
    const to = opts.version !== undefined ? opts.version : s ? s.version : undefined;
    if (!isInt(to)) return { ran: false, reason: 'no-version', game: g };
    const mapper = opts.mapper || (s && s.migrate) || null;
    const stored = progress.readVersion(storage, g);
    const from = stored || 1;
    const mark = () => { try { storage.setItem(progress.markerKey(g), String(to)); return true; } catch (e) { return false; } };
    if (from > to) return { ran: false, reason: 'newer', game: g, from, to };   // older build after a newer one: leave data alone
    if (from === to) { if (stored !== to) mark(); return { ran: false, reason: 'current', game: g, from, to }; }
    let all = {};
    try { const v = JSON.parse(storage.getItem(progress.STATS_KEY)); if (isObj(v)) all = v; } catch (e) { /* corrupt → start clean */ }
    let res;
    try { res = progress.apply(all[g], from, to, mapper, g); }
    catch (e) { return { ran: false, reason: 'mapper-error', game: g, from, to, error: String(e && e.message || e) }; }
    all[g] = { ...(isObj(all[g]) ? all[g] : {}), best: res.after.best, stars: res.after.stars };
    try { storage.setItem(progress.STATS_KEY, JSON.stringify(all)); }
    catch (e) { return { ran: false, reason: 'storage-error', game: g, from, to }; }
    mark();
    return { ran: true, reason: 'migrated', game: g, from, to, before: res.before, after: res.after };
  },
};

return Object.freeze({
  CONFIG, E1_PRESETS, e1, D, kind, pStar, register, WAIVABLE_GATES, level, maxLevel, exhausted, lighter, elo,
  levelId, version, authoredCount, progress, strictlyHarder: (g, a, b) => strictlyHarder(get(g), a, b),
  games: () => [...specs.keys()],
  spec: gameKey => get(gameKey),
  clearCache: () => cache.clear(),
});
});
