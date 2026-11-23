// Brainy Bits core: one shared place for sound, haptics, motion, storage and progress.
// Every game talks to window.BB instead of rolling its own AudioContext or localStorage keys.
// Loaded after vendor/zzfx-micro.js (defines zzfx, zzfxX) and vendor/confetti.js (defines confetti).
(() => {
'use strict';

// ---------- storage (survives private mode / blocked site data) ----------
const mem = new Map();
const store = {
  get(k, def = null) {
    try { const v = localStorage.getItem(k); return v === null ? def : v; }
    catch (e) { return mem.has(k) ? mem.get(k) : def; }
  },
  set(k, v) { const s = String(v); try { localStorage.setItem(k, s); } catch (e) { mem.set(k, s); } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} mem.delete(k); },
  // Integer read with clamping, so a corrupted "2.5" or "-3" never reaches level arrays.
  num(k, def, min = -Infinity, max = Infinity) {
    const n = Math.floor(Number(store.get(k, def)));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
  },
  json(k, def) { try { return JSON.parse(store.get(k)) ?? def; } catch (e) { return def; } },
  setJson(k, v) { store.set(k, JSON.stringify(v)); },
};

// ---------- settings ----------
const settings = {
  get sound() { return store.get('bb_sound', '1') === '1'; },
  set sound(on) { store.set('bb_sound', on ? '1' : '0'); },
  get haptics() { return store.get('bb_haptic', '1') === '1'; },
  set haptics(on) { store.set('bb_haptic', on ? '1' : '0'); },
};

// ---------- reduced motion ----------
const mq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const motion = { get reduced() { return !!(mq && mq.matches); } };

// ---------- audio: ONE context for the whole app (zzfxX from ZzFXMicro) ----------
// iOS Safari suspends or "interrupts" a context when the tab is hidden or a call comes in;
// it only resumes inside a user gesture, so every pointerdown nudges it.
const ctx = () => (typeof zzfxX !== 'undefined' ? zzfxX : null);
function unlock() {
  const c = ctx();
  if (c && c.state !== 'running' && c.state !== 'closed') c.resume().catch(() => {});
}
['pointerdown', 'keydown', 'touchend'].forEach(t => addEventListener(t, unlock, { capture: true, passive: true }));
document.addEventListener('visibilitychange', () => {
  const c = ctx(); if (!c) return;
  if (document.hidden) c.suspend().catch(() => {}); else unlock();
});

// Plain oscillator tone, signature-compatible with the old per-game beep(f, dur, type, vol, delay).
function tone(freq, dur = 0.1, type = 'sine', vol = 0.06, delay = 0) {
  if (!settings.sound) return;
  const c = ctx(); if (!c || c.state === 'closed') return;
  try {
    const t0 = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(vol, 0.0002), t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.03);
  } catch (e) {}
}

// ZzFX presets. Index 2 is the base frequency, which `combo` raises one semitone per step.
const SFX = {
  tap:     [.6, 0, 520, 0, .01, .03, 1, 1.6, 0, 0, 0, 0, 0, 0, 0, 0, 0, .6],
  key:     [.4, 0, 700, 0, .005, .02, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, .5],
  correct: [.9, 0, 660, 0, .02, .12, 1, 1.4, 0, 0, 220, .04, 0, 0, 0, 0, 0, .7],
  wrong:   [.8, 0, 150, 0, .03, .18, 3, 1.8, 0, -4, 0, 0, 0, .4, 0, 0, 0, .6],
  pop:     [.8, 0, 900, 0, .01, .06, 0, 1.2, -18, 0, 0, 0, 0, 0, 0, 0, 0, .5],
  tick:    [.35, 0, 1200, 0, .003, .015, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, .4],
  levelUp: [1, 0, 523, 0, .05, .35, 1, 1.5, 0, 0, 262, .08, .08, 0, 0, 0, 0, .7, .05],
  fail:    [.9, 0, 220, 0, .05, .4, 2, 1.4, -2, 0, -55, .12, 0, 0, 0, 0, 0, .6],
  star:    [.7, 0, 1046, 0, .02, .1, 1, 1.6, 0, 0, 523, .03, 0, 0, 0, 0, 0, .6],
};
function sfx(name, { combo = 0, delay = 0 } = {}) {
  if (!settings.sound || typeof zzfx !== 'function') return;
  const p = SFX[name]; if (!p) return;
  const q = p.slice();
  q[2] *= Math.pow(2, Math.min(Math.max(combo, 0), 12) / 12);
  const play = () => { try { zzfx(...q); } catch (e) {} };
  if (!(delay > 0)) { play(); return; }
  // Delayed sounds are tracked so BB.leave() can cancel them: no ticks or stars after leaving a game.
  const id = setTimeout(() => { sfxTimers.delete(id); play(); }, delay * 1000);
  sfxTimers.add(id);
}
const sfxTimers = new Set();
function cancelSfx() { sfxTimers.forEach(clearTimeout); sfxTimers.clear(); }

// ---------- haptics (Android/Chrome; iOS Safari ignores navigator.vibrate) ----------
const HAPTIC = { tap: 8, success: [12, 40, 18], error: [30, 40, 30, 40, 30], levelUp: [20, 60, 20, 60, 40] };
function haptic(name) {
  if (!settings.haptics || !navigator.vibrate) return;
  try { navigator.vibrate(HAPTIC[name] ?? 0); } catch (e) {}
}

// ---------- motion helpers ----------
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const easeOut = t => 1 - Math.pow(1 - t, 4);

// Number that counts up. Reduced motion: jump straight to the final value.
function countUp(el, from, to, { dur = 700, fmt = v => String(v) } = {}) {
  if (!el) return;
  if (motion.reduced || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now();
  const step = now => {
    const t = Math.min(1, (now - t0) / dur);
    el.textContent = fmt(Math.round(from + (to - from) * easeOut(t)));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

// Short horizontal shake for a DOM element. Reduced motion: a colour flash via a class instead.
function shake(el, px = 6) {
  if (!el) return;
  if (motion.reduced || !el.animate) {
    el.classList.remove('bb-flash'); void el.offsetWidth; el.classList.add('bb-flash');
    return;
  }
  el.animate([
    { transform: 'translateX(0)' }, { transform: `translateX(${-px}px)` }, { transform: `translateX(${px}px)` },
    { transform: `translateX(${-px / 2}px)` }, { transform: 'translateX(0)' },
  ], { duration: 280, easing: EASE });
}

// Small pop for a DOM element (correct answer, new star).
function pop(el, scale = 1.12) {
  if (!el || motion.reduced || !el.animate) return;
  el.animate([{ transform: 'scale(1)' }, { transform: `scale(${scale})` }, { transform: 'scale(1)' }],
    { duration: 260, easing: EASE });
}

// Canvas screen shake driven by "trauma" (0..1, decays): offset = max * trauma^2 * noise.
function trauma(maxPx = 7, decay = 1.6) {
  let t = 0, time = 0;
  return {
    add(x) { if (!motion.reduced) t = Math.min(1, t + x); },
    offset(dt) {
      time += dt; t = Math.max(0, t - decay * dt);
      if (!t) return { x: 0, y: 0 };
      const k = maxPx * t * t;
      return { x: k * Math.sin(time * 71.3), y: k * Math.sin(time * 53.9 + 1.7) };
    },
    reset() { t = 0; },
  };
}

// Hit-stop: freeze game updates for a few frames on impact. Games check BB.frozen() in update.
let frozenUntil = 0;
const hitStop = (ms = 60) => { frozenUntil = performance.now() + ms; };
const frozen = () => performance.now() < frozenUntil;

// Confetti on its own fixed canvas so it never touches a game's render loop.
let confettiFn = null;
function celebrate(opts = {}) {
  if (motion.reduced || typeof confetti !== 'function') return;
  if (!confettiFn) {
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:50';
    document.body.appendChild(cv);
    confettiFn = confetti.create(cv, { resize: true, useWorker: false, disableForReducedMotion: true });
  }
  confettiFn(Object.assign({ particleCount: 80, spread: 70, startVelocity: 38, origin: { y: 0.65 }, ticks: 160,
    colors: ['#ffd54a', '#ffb02e', '#ff6a3d', '#7ee081', '#5cc8ff'] }, opts));
}

// Toast for records and badges. One at a time, queued.
const toastQ = []; let toastBusy = false;
function toast(text) {
  toastQ.push(text); if (!toastBusy) nextToast();
}
function nextToast() {
  const text = toastQ.shift(); if (!text) { toastBusy = false; return; }
  toastBusy = true;
  let el = document.getElementById('bbToast');
  if (!el) {
    el = document.createElement('div'); el.id = 'bbToast';
    el.setAttribute('role', 'status'); el.setAttribute('aria-live', 'polite');
    document.body.appendChild(el);
  }
  el.textContent = text;
  if (typeof el.showPopover === 'function') {
    try { el.popover = 'manual'; if (!el.matches(':popover-open')) el.showPopover(); } catch (e) { el.removeAttribute('popover'); }
  }
  el.classList.add('on');
  setTimeout(() => {
    el.classList.remove('on');
    setTimeout(() => {
      if (typeof el.hidePopover === 'function') {
        try { if (el.matches(':popover-open')) el.hidePopover(); } catch (e) {}
      }
      nextToast();
    }, 250);
  }, 2200);
}

// ---------- dates (local calendar day, not UTC) ----------
const pad = n => String(n).padStart(2, '0');
const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayNum = key => { const [y, m, d] = key.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const dayKeyFromNum = n => { const d = new Date(n * 864e5); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const EPOCH = dayNum('2026-11-20');                         // Brainy Bits #1

function mulberry32(a) {
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}

// ---------- progress ----------
// Source of truth = an append-only log of finished levels; everything else is derived or cached.
// bb_log: [{g, lv, won, stars, score, d, ms}]   g = train|koi|mem|rain|word, d = YYYY-MM-DD
// bb_stats: { [g]: { best: highest level passed, stars: { [id]: 0..3 } } }   id = level number, or the
//   table's stable id when it gives one (BBD.levelId; word: "p<phrase>"), so a reorder never moves a star.
// bb_tablev_<g>: level-table version the stored stars belong to (BB.migrateProgress).
const GAMES = ['train', 'koi', 'mem', 'rain', 'word'];
const GAME_NAME = { train: 'Đường Ray', koi: 'Cá Koi', mem: 'Ô Sáng', rain: 'Mưa Phép Tính', word: 'Đoán Cụm Từ' };
// Level count per game. These are defaults so the hub can render before any game script runs;
// each game should call BB.setLvMax(key, n) with its real count (e.g. word: PHRASES.length).
// The object stays the same reference, so BB.LV_MAX[key] always reads the registered value.
const LV_MAX = { train: 11, koi: 10, mem: 13, rain: 10, word: 49 };
function setLvMax(key, n) {
  n = Math.floor(Number(n));
  if (GAMES.includes(key) && Number.isFinite(n) && n > 0) LV_MAX[key] = n;
  return LV_MAX[key];
}
const LOG_MAX = 1000;

const isObj = x => Object.prototype.toString.call(x) === '[object Object]';
// Corrupt bb_stats ("[]", "5", a string) reads as empty instead of crashing record() in strict mode.
function stats() { const v = store.json('bb_stats', {}); return isObj(v) ? v : {}; }
function gameStats(g) {
  const s = isObj(stats()[g]) ? stats()[g] : {};
  return { best: Number(s.best) > 0 ? Math.floor(s.best) : 0, stars: isObj(s.stars) ? s.stars : {} };
}
// Star key for a level: the table's stable id when BBD has one, else the level number.
function levelKey(game, level) {
  try { const B = window.BBD; if (B && B.levelId && B.games().includes(game)) return B.levelId(game, level); } catch (e) {}
  return level;
}
const starsAt = (game, level) => gameStats(game).stars[levelKey(game, level)] || 0;
// Run once at game load, after js/levels/<g>.js: moves stored progress to the current table version.
// Idempotent (marker bb_tablev_<g>), never lowers levels passed, never throws. Logic: BBD.progress.run.
const bbStorage = { getItem: k => store.get(k, null), setItem: (k, v) => store.set(k, v) };
function migrateProgress(game, opts = {}) {
  const B = window.BBD;
  if (!B || !B.progress) return { ran: false, reason: 'no-engine', game };
  try { return B.progress.run(bbStorage, game, opts); } catch (e) { return { ran: false, reason: 'error', game }; }
}

// record() returns what changed, so a result screen can celebrate only real news.
// id: stable star key (default BBD.levelId(game, level), which is the level number unless the table sets ids).
function record({ game, level, won, stars = 0, score = 0, ms = 0, id }) {
  const key = (typeof id === 'string' && id) || (Number.isInteger(id) && id > 0) ? id : levelKey(game, level);
  const d = dayKey();
  const dl = daily(d);                                       // read before stats change: today's target is fixed
  const log = store.json('bb_log', []);
  const row = { g: game, lv: level, won: !!won, stars, score, d, ms: Math.round(ms) };
  if (key !== level) row.id = key;
  log.push(row);
  if (log.length > LOG_MAX) log.splice(0, log.length - LOG_MAX);
  store.setJson('bb_log', log);

  const all = stats(); const s = isObj(all[game]) ? all[game] : (all[game] = { best: 0, stars: {} });
  if (!isObj(s.stars)) s.stars = {};
  const prevStars = s.stars[key] || 0, prevBest = s.best || 0;
  if (won && stars > prevStars) s.stars[key] = stars;
  if (won && level > prevBest) s.best = level;
  store.setJson('bb_stats', all);

  const prevStreak = store.num('bb_streak_cache', 0);
  const streak = dayStreak();
  store.set('bb_streak_cache', streak);

  let dailyDone = false;
  if (won && dl.game === game && level >= dl.level && !dl.done) { store.set('bb_daily_done', d); dailyDone = true; }
  return { newBest: won && level > prevBest, newStars: won && stars > prevStars, streak,
    streakUp: streak > prevStreak, dailyDone };
}

// Days in a row (ending today or yesterday) on which at least one level was finished.
function dayStreak() {
  const days = new Set(store.json('bb_log', []).map(r => r.d));
  let n = dayNum(dayKey());
  if (!days.has(dayKeyFromNum(n))) n -= 1;                  // today not played yet: streak still alive
  let c = 0;
  while (days.has(dayKeyFromNum(n))) { c++; n--; }
  return c;
}

function totalStars() {
  return Object.values(stats()).reduce((a, s) => a + Object.values(s.stars || {}).reduce((x, y) => x + y, 0), 0);
}

// Progress registry. bb_stats[g].best is the highest level NUMBER won; that counts levels passed only while the
// level order never changes. A game whose order changed (word, table v2: phrases reordered) registers how it
// counts: fn() → { done: levels passed, next: next level to play, best: highest level passed in today's order }.
// Hub, daily challenge and share text read progressOf(); unregistered games fall back to `best` as before.
const progressFns = new Map();
function setProgress(game, fn) {
  if (!GAMES.includes(game) || typeof fn !== 'function') return false;
  progressFns.set(game, fn);
  return true;
}
const wholeIn = (v, lo, hi) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
function progressOf(game) {
  const max = LV_MAX[game], fn = progressFns.get(game);
  if (fn) {
    try {
      const p = fn() || {};
      const done = wholeIn(p.done, 0, max), next = wholeIn(p.next, 1, max), best = wholeIn(p.best, 0, max);
      if (done !== null && next !== null) return { done, next, best: best === null ? done : best, registered: true };
    } catch (e) { /* a broken counter must not break the hub: fall back to best */ }
  }
  const best = gameStats(game).best;
  return { done: Math.min(max, best), next: Math.min(max, Math.max(1, best + 1)), best, registered: false };
}

// Daily challenge: same game for everyone on the same local day. The level is one step past the
// player's own best (bounded), frozen for the day the first time it is read so it cannot drift.
function daily(date = dayKey()) {
  const idx = dayNum(date) - EPOCH + 1;
  const rnd = mulberry32(dayNum(date) * 2654435761);
  const game = GAMES[Math.floor(rnd() * GAMES.length)];
  let pin = store.json('bb_daily_pin', null);
  if (!pin || pin.date !== date) {
    pin = { date, level: progressOf(game).next };
    store.setJson('bb_daily_pin', pin);
  }
  return { date, idx, game, level: pin.level, done: store.get('bb_daily_done') === date };
}

// Plain-text share card: no image, no server, works in Zalo/Messenger.
function shareText() {
  const dl = daily();
  const lines = [`Brainy Bits #${dl.idx}`, `Chuỗi ${dayStreak()} ngày · ${totalStars()} sao`];
  for (const g of GAMES) {
    const lv = progressOf(g).best; if (!lv) continue;
    const st = starsAt(g, lv);                                // stars of the level named, by its stable key
    lines.push(`${GAME_NAME[g]}: Lv ${lv} (${st}/3 ★)`);
  }
  if (dl.done) lines.push('Đã xong thử thách hôm nay');
  lines.push(location.origin + location.pathname);
  return lines.join('\n');
}
async function share() {
  const text = shareText();
  try { if (navigator.share) { await navigator.share({ text }); return 'shared'; } }
  catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  try { await navigator.clipboard.writeText(text); toast('Đã chép kết quả vào khay nhớ tạm'); return 'copied'; } catch (e) {}
  return 'failed';
}

// Wipe every Brainy Bits key, the old per-game ones included.
const LEGACY_KEYS = ['rtd_best3', 'koi_lv2', 'koi_best', 'mem_lv', 'rain_lv', 'word_lv'];
// One-time seed flags (bb_seeded_v1 in hub.js, bb_seed_mem / bb_seed_rain in the games, any later
// version): all start with "bb_seed", so they are found by prefix instead of a list that can go stale.
// Table-version markers (bb_tablev_<g>, BBD.progress) go too: a marker left over an empty bb_stats, e.g. a newer
// one after a downgrade, would skip the migration of whatever is stored next.
const SEED_PREFIX = 'bb_seed', TABLEV_PREFIX = 'bb_tablev_';
function prefixKeys(prefix) {
  const ks = new Set([...mem.keys()].filter(k => k.startsWith(prefix)));
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith(prefix)) ks.add(k); } } catch (e) {}
  return [...ks];
}
function resetAll() {
  ['bb_log', 'bb_stats', 'bb_streak_cache', 'bb_daily_done', 'bb_daily_pin', ...LEGACY_KEYS,
    ...prefixKeys(SEED_PREFIX), ...prefixKeys(TABLEV_PREFIX)].forEach(store.del);
}

// ---------- accessible overlays ----------
// Overlays stay plain divs toggled with .hidden (the games rely on that); core adds dialog
// semantics, moves focus into a card when it opens and back to the trigger when it closes.
function wireOverlays() {
  document.querySelectorAll('.overlay').forEach(ov => {
    if (ov.dataset.bbWired) return; ov.dataset.bbWired = '1';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    const h = ov.querySelector('h1, h2');
    if (h) { if (!h.id) h.id = ov.id + 'Title'; ov.setAttribute('aria-labelledby', h.id); }
    let opener = null;
    const check = () => {
      const open = !ov.classList.contains('hidden') && ov.getClientRects().length > 0;
      if (open && !ov.dataset.bbOpen) {
        ov.dataset.bbOpen = '1'; opener = document.activeElement;
        const first = ov.querySelector('button:not([disabled]):not(.hidden)');
        if (first) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) {} }, 30);
      } else if (!open && ov.dataset.bbOpen) {
        delete ov.dataset.bbOpen;
        if (opener && document.contains(opener) && opener.getClientRects().length) { try { opener.focus({ preventScroll: true }); } catch (e) {} }
      }
    };
    new MutationObserver(check).observe(ov, { attributes: true, attributeFilter: ['class', 'style'] });
  });
}

// ---------- game lifecycle ----------
// The hub calls BB.leave(key) when the player leaves a game (Back, home button, hash change).
// Each game registers what leaving means for it: pause the round, cancel timers, stop sounds.
const leaveFns = {};
const onLeave = (key, fn) => { leaveFns[key] = fn; };
// Core also stops what it owns: delayed sounds and the confetti animation loop.
const leave = key => {
  try { leaveFns[key] && leaveFns[key](); } catch (e) { console.error(e); }
  cancelSfx();
  try { if (confettiFn) confettiFn.reset(); } catch (e) {}
};

// Hub -> game hand-off: "open game X straight at level N" (daily challenge). The game's enter()
// calls BB.takeRequest(key) and, if it gets a level, starts that level instead of showing its menu.
let pending = null;
const request = (key, level) => { pending = { key, level }; };
const takeRequest = key => { if (pending && pending.key === key) { const l = pending.level; pending = null; return l; } return null; };

// ---------- thua nhẹ tay + báo trước màn thử thách (gates/01-spec/DIFFICULTY-DECISIONS.md, 2026-11-23, Duy chọn B) ----------
// Không đổi luật chơi: chỉ thêm chữ vào màn kết quả và nhãn trên lưới level, nên sim và gate không đổi.
const SOFT_LOSS_TO = 5;                 // màn thua có mẹo ở Level 1..5
const lossRun = {};                     // game -> { L, n }: thua n lần liền nhau ở level L (trong phiên này)
const softLoss = L => L >= 1 && L <= SOFT_LOSS_TO;
// game: chỉ tính đỉnh khi bảng level của game đó đã nạp vào BBD (thiếu bảng thì game chạy thứ tự cũ, không có đỉnh).
const isPeak = (L, game) => {
  try { const B = window.BBD; return !!(B && (!game || B.games().includes(game)) && B.kind(L) === 'peak'); } catch (e) { return false; }
};
const clearLoss = game => { delete lossRun[game]; };
const SVG = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
const ICON_TIP = SVG('<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>');
const ICON_PEAK = SVG('<path d="M3 20l6.5-11 4 6.5 2.5-4L21 20z"/><path d="M9.5 9V4l3 1.5-3 1.5"/>');
// Gọi mỗi lần hiện màn kết quả, kể cả khi thắng (để xoá phần cũ và đếm lại chuỗi thua).
// next = nút chính của màn kết quả. tip là chữ cố định của game (có thể có <b>), không bao giờ là dữ liệu người dùng.
const lossAid = (next, o) => {
  const card = next.parentElement;
  card.querySelectorAll('.bb-aid').forEach(n => n.remove());
  if (o.won) { delete lossRun[o.game]; return false; }
  const run = lossRun[o.game] && lossRun[o.game].L === o.level ? lossRun[o.game] : { L: o.level, n: 0 };
  run.n += 1; lossRun[o.game] = run;
  if (!softLoss(o.level)) return false;
  const tip = document.createElement('div');
  tip.className = 'tip bb-aid';
  tip.innerHTML = `${ICON_TIP}<span>${o.tip}</span>`;
  card.insertBefore(tip, next);
  if (run.n >= 2 && o.level < o.maxLevel && o.onSkip) {
    const skip = document.createElement('button');
    skip.type = 'button'; skip.className = 'btn alt bb-aid';
    skip.textContent = `Sang Level ${o.level + 1} trước`;
    skip.onclick = () => { delete lossRun[o.game]; o.onSkip(o.level + 1); };
    const note = document.createElement('p');
    note.className = 'muted bb-aid';
    note.textContent = `Level ${o.level} vẫn mở, quay lại lúc nào cũng được.`;
    next.after(skip, note);
  }
  return true;
};
// Thắng ở level ngay trước một đỉnh: báo trước màn sau là màn thử thách. Trả true nếu đã báo.
const peakCue = (next, o) => {
  const card = next.parentElement;
  card.querySelectorAll('.bb-cue').forEach(n => n.remove());
  const L = o.level + 1;
  // maxLevel: đỉnh là level cuối (vd. word L50) thì không hứa "Level 51 nhẹ lại"; kind() không biết số level của game.
  if (!o.won || o.last || L > o.maxLevel || !(o.peak ? o.peak(L) : isPeak(L, o.game))) return false;
  let after = '';
  try { if (L < o.maxLevel && window.BBD.kind(L + 1) === 'breather') after = ` Qua được thì Level ${L + 1} nhẹ lại.`; } catch (e) {}
  const cue = document.createElement('div');
  cue.className = 'cue bb-cue';
  cue.innerHTML = `${ICON_PEAK}<span><b>Level ${L} là màn thử thách.</b>${after}</span>`;
  card.insertBefore(cue, next);
  return true;
};
const PEAK_TAG = '<span class="peaktag" aria-hidden="true">thử thách</span>';

window.BB = {
  store, settings, motion, EASE, tone, sfx, haptic, countUp, shake, pop, trauma, hitStop, frozen,
  celebrate, toast, record, gameStats, stats, starsAt, levelKey, migrateProgress, setProgress, progressOf, totalStars, dayStreak, daily, shareText, share, resetAll,
  dayKey, mulberry32, onLeave, leave, request, takeRequest, LV_MAX, setLvMax, GAME_NAME, GAMES, wireOverlays,
  softLoss, isPeak, lossAid, clearLoss, peakCue, PEAK_TAG,
  get pendingSfx() { return sfxTimers.size; },
};
document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', wireOverlays) : wireOverlays();
})();
