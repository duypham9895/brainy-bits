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
  E3_FREEZE_LEGACY: true,  // true = existing levels keep their exact values; bot only measures them.
  E4: { maxStars: 1, unlocksNext: true, slowTempo: 0.85 },  // win on "lighter": star cap, unlock L+1, slow tempo (null = off)
  E5_KNOBS_ONLY: true,     // true = knobs only; knobs flagged rule:true (new mechanics) stay off.

  // Curve constants (MERGED-SPEC §4.1). Not owner decisions; change only with a calibration run.
  REF_L: 30,               // D(REF_L) = 1
  PERIOD: 5,               // peak at 5k, breather at 5k+1
  P_TOP: 0.92,             // p*(1), R:dda
  PEAK_DIP: 0.06,          // peak levels: p* − 0.06 (A)
  BREATHER_OFFSET: 0,      // A-1 fix: breathers get no p* bonus
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
const RESERVED = new Set(['L', 'kind', 'legacy', 'D', 'pStar', 'exhausted', 'assist']);
function D(L) { return Math.sqrt(Math.max(0, L - 1) / (CONFIG.REF_L - 1)); }          // A, R:dda (abagames, MIT)
function kind(L) {
  const P = CONFIG.PERIOD;
  if (L >= P && L % P === 0) return 'peak';
  if (L > P && L % P === 1) return 'breather';
  return 'step';
}
function pStar(L) {
  const { l30Peak, floor } = e1();
  const pBottom = l30Peak + CONFIG.PEAK_DIP;                       // A: 0.75 ⇒ L30 peak 0.69
  const k = kind(L);
  const p = CONFIG.P_TOP - (CONFIG.P_TOP - pBottom) * D(L)
    - (k === 'peak' ? CONFIG.PEAK_DIP : 0) + (k === 'breather' ? CONFIG.BREATHER_OFFSET : 0);
  return Math.max(floor, p);
}

// ---------- registry ----------
const specs = new Map();
const isInt = n => Number.isInteger(n) && n >= 1;

function register(gameKey, spec) {
  if (typeof gameKey !== 'string' || !gameKey) throw new TypeError('BBD.register: gameKey must be a string');
  if (!spec || typeof spec !== 'object') throw new TypeError(`BBD.register(${gameKey}): spec missing`);
  const legacy = (spec.legacyLevels || []).map(r => Object.freeze({ ...r }));
  const knobs = (spec.knobs || []).map(k => normKnob(gameKey, k, legacy));
  const names = new Set(knobs.map(k => k.name));
  const priority = (spec.priority || knobs.map(k => k.name)).slice();
  priority.forEach(n => { if (!names.has(n)) throw new Error(`BBD.register(${gameKey}): priority names unknown knob "${n}"`); });
  const fx = list => (list || []).map(r => {
    if (!names.has(r.knob)) throw new Error(`BBD.register(${gameKey}): relief/peak names unknown knob "${r.knob}"`);
    return Object.freeze({ knob: r.knob, by: r.by });
  });
  const s = Object.freeze({
    key: gameKey, legacy: Object.freeze(legacy), knobs: Object.freeze(knobs), priority: Object.freeze(priority),
    relief: Object.freeze(fx(spec.relief)), peak: Object.freeze(fx(spec.peak)),
    lighterKnobs: Object.freeze((spec.lighterKnobs || priority).slice()),
    derive: typeof spec.derive === 'function' ? spec.derive : null,
    maxLevel: spec.maxLevel, overrides: Object.freeze({ ...(spec.overrides || {}) }),
    meta: Object.freeze({ ...(spec.meta || {}) }),
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
  const dir = Math.sign(k.hardCap - min) || Math.sign((k.max ?? k.hardCap) - min) || (k.dir || 1);
  const step = k.int ? Math.max(1, k.step || 1) : (k.step || 0);
  return Object.freeze({
    name: k.name, min, max: typeof k.max === 'number' ? k.max : null, hardCap: k.hardCap,
    start: typeof k.start === 'number' ? k.start : null,
    off: typeof k.off === 'number' ? k.off : min, curve: k.curve || 'sqrt', unlockAt: k.unlockAt || 0,
    step, notch: k.notch || step, int: !!k.int, dir, rule: !!k.rule, reserve: !!k.reserve, changeOn: k.changeOn || 'any',
    source: k.source || '',
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
const legacyN = s => (CONFIG.E3_FREEZE_LEGACY ? s.legacy.length : 0);

// Where a knob starts moving: [anchorL, anchorV]. Reserve knobs wait for the previous knob in
// `priority` to reach its hardCap, then start at the next breather (spec §4.6 step 3).
function anchor(s, k) {
  const n = legacyN(s);
  const fromLegacy = n && typeof s.legacy[n - 1][k.name] === 'number';
  let aL = fromLegacy ? n : 1, aV = fromLegacy ? s.legacy[n - 1][k.name] : k.min;
  if (typeof k.start === 'number' && fromLegacy) aV = k.start;   // first generated level jumps here (harder side only)
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
  const n = legacyN(s);
  if (L <= n && typeof s.legacy[L - 1][k.name] === 'number') return s.legacy[L - 1][k.name];
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
  const n = legacyN(s);
  if (L <= n) return { ...s.legacy[L - 1], L, kind: kind(L), legacy: true };
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
    // Breathers stay monotone among themselves: never easier than the previous generated breather.
    // Whether a breather sits between its peak and L−4 is a pass-rate question: gate G3 in the simulator.
    const prevB = L - CONFIG.PERIOD > n ? levelRow(s, L - CONFIG.PERIOD)[k.name] : undefined;
    row[k.name] = typeof prevB === 'number' ? harder(k, relieved, prevB) : relieved;
  });
  Object.assign(row, s.overrides[L] || {});              // authored exceptions, e.g. a hand-set L30
  const derived = s.derive ? s.derive({ ...row }, L) : null;
  return { ...row, ...(derived || {}), L, kind: kd, legacy: false };
}
const cache = new Map();                                  // key: game|L|configStamp
const stamp = () => JSON.stringify([CONFIG.E1, CONFIG.E3_FREEZE_LEGACY, CONFIG.E5_KNOBS_ONLY, CONFIG.REF_L, CONFIG.PERIOD]);
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
  if (typeof s.maxLevel === 'function') return s.maxLevel(CONFIG);
  if (typeof s.maxLevel === 'number') return s.maxLevel;
  return s.knobs.length ? Math.max(CONFIG.REF_L, s.legacy.length) : s.legacy.length;
}
// True when every non-rule knob sits at its hardCap: the "+10 levels" rule must STOP and ask Duy.
function exhausted(gameKey, L) {
  const s = get(gameKey);
  const live = s.knobs.filter(k => !(k.rule && CONFIG.E5_KNOBS_ONLY));
  return live.length > 0 && live.every(k => atCap(k, raw(s, k, L)));
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

return Object.freeze({
  CONFIG, E1_PRESETS, e1, D, kind, pStar, register, level, maxLevel, exhausted, lighter, elo,
  games: () => [...specs.keys()],
  spec: gameKey => get(gameKey),
  clearCache: () => cache.clear(),
});
});
