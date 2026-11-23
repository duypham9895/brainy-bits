// ======================= GAME Ô SÁNG GHI NHỚ =======================
(() => {
const $ = id => document.getElementById(id);
const BB = window.BB;
// Level parameters come from the shared difficulty engine (js/difficulty.js + js/levels/mem.js, table v2):
// L1..30 follow one sawtooth template and are calibrated offline (docs/difficulty/calibration-mem.json).
// Without BBD on the page the game falls back to the 13 levels of table v1, so it never breaks.
const BBD = window.BBD && window.BBD.games().includes('mem') ? window.BBD : null;
const ROUNDS = 3, NEED = 2, LV_MAX = BBD ? BB.setLvMax('mem', BBD.maxLevel('mem')) : BB.LV_MAX.mem;   // 30 | 13
// Table v1 → v2 keeps level numbers, so stars and mem_lv keep their keys: the engine only moves the marker
// bb_tablev_mem (identity mapper, best never drops). Runs before any gameStats read; a rerun is a no-op.
if (BB.migrateProgress) BB.migrateProgress('mem');
let level = 1, round = 0, perfect = 0, totalOk = 0;
let phase = 'idle';            // idle | show | input | wait | paused
let targets = new Set(), found = 0, n = 3;
let timers = [], pausedPhase = null, chosen = 1, passed = false;
let replayShow = false;        // paused while tiles were lit: replay the round with new tiles
let bestMiss = 0;              // tiles found before the wrong tap in a failed round (for stars)
let t0 = 0, pausedAt = 0, pausedMs = 0, starTimers = [];
const RM = () => BB.motion.reduced;

// ---------- progress: legacy key mem_lv = "next level to play" (done = mem_lv - 1) ----------
const legacyLv = () => BB.store.num('mem_lv', 1, 1, LV_MAX + 1);
const getLv = () => Math.min(LV_MAX + 1, Math.max(legacyLv(), BB.gameStats('mem').best + 1));
const setLv = v => BB.store.set('mem_lv', Math.min(LV_MAX + 1, v));
// BB stats are seeded from mem_lv once by hub.js (seedFromLegacy, flag bb_seeded_v1); getLv() reads both.

// Table v1 (fallback without BBD): level 1 = 3 ô sáng, mỗi level thêm 1 ô tới 15 ô ở L13.
// Never more targets than cells - 1 (MEM-1 guard).
function legacySpec(L){
  const t0 = 2 + L;
  const size = t0 <= 4 ? 3 : t0 <= 7 ? 4 : t0 <= 11 ? 5 : 6;
  const t = Math.min(t0, size * size - 1);
  return { t, size, show: 1.0 + 0.3*t, disp: 0 };
}
function spec(L){
  if (!BBD) return legacySpec(L);
  const r = BBD.level('mem', Math.max(1, L | 0));
  return { t: Math.min(r.t, r.size * r.size - 1), size: r.size, show: r.show, disp: r.disp || 0 };
}
const secTxt = s => s.toFixed(1).replace('.', ',');
// Stars: fail = 0. Pass with no wrong round = 3. Pass with one wrong round = 2 if that round
// still had at least half the tiles found before the slip, else 1.
function starsFor(){
  if (!passed) return 0;
  if (perfect === round) return 3;
  return bestMiss * 2 >= spec(level).t ? 2 : 1;
}
const STAR_RULE = '3 sao: không sai lượt nào. 2 sao: lượt sai vẫn chạm đúng nửa số ô. 1 sao: qua level.';

// ---------- pausable timers on requestAnimationFrame; the loop only runs while it has work ----------
let last = 0, looping = false;
function after(sec, fn){ timers.push({ left: sec, fn }); loop(); }
function loop(){
  if (looping) return;
  looping = true; last = performance.now();
  requestAnimationFrame(tick);
}
function tick(ts){
  const dt = Math.min(0.05, Math.max(0, (ts - last)/1000)); last = ts;
  const live = window.APP && window.APP.active === 'mem' && phase !== 'paused';
  if (live) {
    const due = [];
    timers.forEach(t => { t.left -= dt; if (t.left <= 0) due.push(t); });
    timers = timers.filter(t => t.left > 0);
    due.forEach(t => t.fn());
  }
  if (live && timers.length) requestAnimationFrame(tick); else looping = false;
}

// ---------- grid ----------
let lastPtr = { i: -1, at: 0 };
function buildGrid(){
  const g = $('mGrid');
  g.innerHTML = '';
  g.setAttribute('role', 'group');
  g.setAttribute('aria-label', 'Lưới ô sáng');
  g.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  g.classList.toggle('dense', n >= 6);
  for (let i=0;i<n*n;i++){
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mtile'; b.dataset.i = i;
    label(b, '');
    b.addEventListener('pointerdown', e => { e.preventDefault(); lastPtr = { i, at: performance.now() }; tap(i, b); });
    // Enter/Space (and screen-reader activation) fire click without a pointerdown first.
    b.addEventListener('click', () => {
      if (lastPtr.i === i && performance.now() - lastPtr.at < 700) return;
      tap(i, b);
    });
    g.appendChild(b);
  }
}
const tiles = () => [...$('mGrid').children];
function label(b, state){
  const i = +b.dataset.i, r = Math.floor(i / n) + 1, c = i % n + 1;
  b.setAttribute('aria-label', `Ô hàng ${r}, cột ${c}${state ? ', ' + state : ''}`);
}
function setTile(b, cls, state){ b.className = cls ? 'mtile ' + cls : 'mtile'; label(b, state); }

function hud(){
  const s = spec(level);
  $('mLevel').textContent = `Level ${level} · ${s.t} ô`;
  $('mRound').textContent = `Lượt ${Math.min(round+1, ROUNDS)}/${ROUNDS}`;
  $('mScore').textContent = `✓ ${perfect}`;
  $('mScore').setAttribute('aria-label', `Đúng ${perfect} lượt`);
}
function hint(text){ $('mHint').textContent = text; }

function startLevel(L){
  level = Math.min(LV_MAX, Math.max(1, L | 0));
  round = 0; perfect = 0; bestMiss = 0; timers = []; replayShow = false;
  t0 = performance.now(); pausedMs = 0;
  clearStars();
  const s = spec(level); n = s.size;
  ['mmenu','mresult','mpaused'].forEach(id => $(id).classList.add('hidden'));
  $('mGrid').classList.remove('hush');
  buildGrid(); hud();
  hint('Chuẩn bị…');
  phase = 'wait';
  after(0.8, nextRound);
}

function pickTargets(t, disp){
  // Shared pure picker (js/levels/mem.js), also used by the simulator. disp = 0 is the legacy
  // partial Fisher-Yates over the cell list: always terminates, no duplicates.
  if (BBD) return new Set(BBD.spec('mem').meta.gen.pickTargets(n, t, disp, Math.random));
  const cells = Array.from({ length: n*n }, (_, i) => i);
  for (let k = 0; k < t; k++) {
    const j = k + Math.floor(Math.random() * (cells.length - k));
    [cells[k], cells[j]] = [cells[j], cells[k]];
  }
  return new Set(cells.slice(0, t));
}

function nextRound(){
  const s = spec(level);
  tiles().forEach(t => setTile(t, '', ''));
  targets = pickTargets(s.t, s.disp);
  found = 0;
  phase = 'show';
  hud();
  hint(`Ghi nhớ ${s.t} ô sáng`);
  const all = tiles(), step = RM() ? 0 : 25;
  [...targets].forEach((i, k) => {
    all[i].style.setProperty('--d', `${k * step}ms`);
    setTile(all[i], 'lit', 'đang sáng');
  });
  BB.sfx('pop');
  // The flip-in stagger is added to the viewing time so the last tile gets the full duration.
  after(s.show + (s.t * step) / 1000, () => {
    tiles().forEach(t => { if (t.classList.contains('lit')) setTile(t, '', ''); });
    phase = 'input';
    hint(`Chạm lại các ô vừa sáng (0/${s.t})`);
  });
}

function tap(i, el){
  if (phase !== 'input' || el.classList.contains('ok')) return;
  const s = spec(level);
  if (targets.has(i)) {
    found++;
    setTile(el, 'ok', 'đúng');
    BB.sfx('correct', { combo: found - 1 });
    BB.haptic('tap');
    hint(`Chạm lại các ô vừa sáng (${found}/${s.t})`);
    if (found === s.t) {
      perfect++; totalOk++; phase = 'wait';
      hint('Chính xác! 🎉');
      // Perfect-round flourish: the found tiles pop again in a wave.
      [...targets].forEach((k, j) => {
        const b = tiles()[k];
        b.style.setProperty('--d', `${RM() ? 0 : j * 35}ms`);
        b.classList.add('wave');
      });
      BB.sfx('star', { delay: 0.12 });
      BB.haptic('success');
      hud();
      after(1.0, endRound);
    }
  } else {
    setTile(el, 'bad', 'sai');
    phase = 'wait';
    bestMiss = Math.max(bestMiss, found);
    targets.forEach(k => { const b = tiles()[k]; if (!b.classList.contains('ok')) setTile(b, 'miss', 'ô đúng'); });
    hint('Sai ô rồi, đây là các ô đúng');
    BB.sfx('wrong');
    BB.haptic('error');
    BB.shake($('mGrid'));
    after(1.6, endRound);
  }
}

function endRound(){
  round++;
  // MEM-3: stop as soon as the outcome is decided (2 perfect, or 2 perfect no longer reachable).
  const decided = perfect >= NEED || perfect + (ROUNDS - round) < NEED;
  if (round < ROUNDS && !decided) { hud(); nextRound(); return; }
  finish();
}

function finish(){
  phase = 'idle';
  passed = perfect >= NEED;
  const last = level >= LV_MAX;
  if (passed && level + 1 > getLv()) setLv(level + 1);
  const stars = starsFor();
  const ms = performance.now() - t0 - pausedMs;
  const rec = BB.record({ game: 'mem', level, won: passed, stars, score: perfect, ms });

  $('mrTitle').textContent = passed
    ? (last ? `Qua Level ${LV_MAX}, level cuối! 🎉` : `Qua Level ${level}! 🎉`)
    : `Chưa qua Level ${level} 😅`;
  $('mrBig').textContent = `${perfect}/${round}`;
  $('mrDetail').textContent = !passed
    ? (BB.softLoss(level) ? `Đúng ${perfect}/${round} lượt, cần ${NEED}.` : `Nhớ đúng hoàn toàn ${perfect}/${round} lượt. Cần đúng ít nhất ${NEED} lượt để qua level.`)
    : last
      ? `Nhớ đúng hoàn toàn ${perfect}/${round} lượt. ${stars < 3 ? 'Chơi lại để gom đủ 3 sao.' : 'Level cuối, đủ 3 sao.'}`
      : `Nhớ đúng hoàn toàn ${perfect}/${round} lượt. ${nextTxt()}`;
  BB.lossAid($('mrNext'), { game: 'mem', level, won: passed, maxLevel: LV_MAX,
    tip: 'Nhìn cả cụm ô sáng như <b>một hình</b>, ví dụ chữ L hay đường chéo, đừng nhớ từng ô.',
    onSkip: L => startLevel(L) });
  const cue = BB.peakCue($('mrNext'), { game: 'mem', level, won: passed, last, maxLevel: LV_MAX });
  $('mrNext').textContent = passed && !last ? `Level ${level+1}${cue ? ' · thử thách' : ''} →` : `Chơi lại Level ${level}`;
  showStars(stars);
  $('mresult').classList.remove('hidden');

  if (passed) {
    BB.sfx('levelUp'); BB.haptic('levelUp');
    BB.celebrate(stars === 3 ? { particleCount: 130, spread: 90 } : {});
  } else {
    BB.sfx('fail'); BB.haptic('error');
  }
  if (rec.newBest) BB.toast(`Kỷ lục mới: qua Level ${level}`);
  else if (rec.newStars) BB.toast(`Level ${level} giờ có ${stars} sao`);
  if (rec.dailyDone) BB.toast('Xong thử thách hôm nay');
  if (rec.streakUp && rec.streak > 1) BB.toast(`Chuỗi ${rec.streak} ngày liền`);
}

// disp below this is not visible to the eye (adjacent pairs at t=15: 18.3 → 16.3 at 0.2), so the menu stays quiet.
const DISP_SHOWN = 0.2;
// What changes on the next level, in one short line (feedforward).
function nextTxt(){
  const a = spec(level), b = spec(level + 1);
  // A bigger grid is the new thing even when the tile count drops with it (L6: 4×4 → 5×5, 4 → 3 tiles).
  if (b.size > a.size) return b.t !== a.t ? `Level ${level+1}: lưới ${b.size}×${b.size}, ${b.t} ô sáng.` : `Level ${level+1} vẫn ${b.t} ô, trên lưới ${b.size}×${b.size}.`;
  if (b.t !== a.t) return `Level ${level+1} có ${b.t} ô sáng.`;
  if (b.show < a.show) return `Level ${level+1} vẫn ${b.t} ô, chỉ được nhìn ${secTxt(b.show)} giây.`;
  if (b.disp > a.disp && b.disp >= DISP_SHOWN) return `Level ${level+1} vẫn ${b.t} ô, nằm rải xa nhau hơn.`;
  return `Level ${level+1} có ${b.t} ô sáng.`;
}

// ---------- result stars (built here so index.html needs no change) ----------
function starsBox(){
  let box = $('mrStars');
  if (!box) {
    box = document.createElement('div');
    box.id = 'mrStars'; box.className = 'stars';
    box.innerHTML = '<span class="s" aria-hidden="true">★</span><span class="s" aria-hidden="true">★</span><span class="s" aria-hidden="true">★</span>';
    $('mrTitle').after(box);
    const rule = document.createElement('p');
    rule.id = 'mrStarRule'; rule.className = 'muted'; rule.textContent = STAR_RULE;
    $('mrDetail').after(rule);
  }
  return box;
}
function clearStars(){ starTimers.forEach(clearTimeout); starTimers = []; }
function showStars(k){
  clearStars();
  const box = starsBox(), ss = [...box.children];
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', `${k} trên 3 sao`);
  ss.forEach(s => s.classList.remove('on'));
  ss.slice(0, k).forEach((s, j) => {
    const on = () => { s.classList.add('on'); BB.pop(s, 1.35); BB.sfx('star', { combo: j * 4 }); };
    if (RM()) s.classList.add('on'); else starTimers.push(setTimeout(on, 380 + j * 260));
  });
}

// ---------- menu ----------
function renderLevels(){
  const done = getLv() - 1, grid = $('mlvgrid');
  grid.innerHTML = '';
  for (let L=1; L<=LV_MAX; L++){
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'lv' + (L <= done ? ' done' : '') + (L === chosen ? ' on' : '');
    el.innerHTML = `${L}<small>${spec(L).t} ô</small>` + (BB.isPeak(L, 'mem') ? BB.PEAK_TAG : '');
    const k = BB.starsAt('mem', L);
    if (L <= done && k) el.dataset.st = '★'.repeat(k);
    el.setAttribute('aria-label', `Level ${L}, ${spec(L).t} ô${L <= done ? ', đã qua' : ''}${k ? `, ${k} sao` : ''}${BB.isPeak(L, 'mem') ? ', màn thử thách' : ''}`);
    el.setAttribute('aria-pressed', L === chosen ? 'true' : 'false');
    el.onclick = () => { chosen = L; previewLevel(); renderLevels(); BB.sfx('tap'); grid.children[L-1].focus({ preventScroll: true }); };
    grid.appendChild(el);
  }
  const s = spec(chosen);
  $('mLvTxt').textContent = `Lưới ${s.size}×${s.size} · ${s.t} ô sáng · nhìn ${secTxt(s.show)} giây${s.disp >= DISP_SHOWN ? ' · ô rải xa' : ''}`;
  $('mStart').textContent = `Chơi Level ${chosen} · ${BB.isPeak(chosen, 'mem') ? 'thử thách' : `${s.t} ô`}`;
}
// The HUD and grid behind the menu follow the chosen level (fixes the stale level pill).
function previewLevel(){ level = chosen; round = 0; perfect = 0; n = spec(level).size; buildGrid(); hud(); }

function toMenu(){
  phase = 'idle'; timers = []; replayShow = false; clearStars();
  chosen = Math.min(getLv(), LV_MAX);
  renderLevels();
  const done = Math.min(getLv() - 1, LV_MAX);
  $('mBestTxt').textContent = done >= LV_MAX ? `Đã qua hết ${LV_MAX} level` : done ? `Đã qua tới Level ${done}` : '';
  ['mresult','mpaused'].forEach(id => $(id).classList.add('hidden'));
  $('mGrid').classList.remove('hush');
  $('mmenu').classList.remove('hidden');
  previewLevel();
  hint('');
}

// ---------- pause (MEM-2: never leave lit tiles visible behind the pause card) ----------
function pause(){
  if (phase === 'idle' || phase === 'paused') return;
  pausedPhase = phase; phase = 'paused'; pausedAt = performance.now();
  if (pausedPhase === 'show') {
    replayShow = true; timers = [];
    tiles().forEach(t => setTile(t, '', ''));
    hint('');
  }
  $('mGrid').classList.add('hush');
  $('mpaused').classList.remove('hidden');
}
function resume(){
  $('mpaused').classList.add('hidden');
  $('mGrid').classList.remove('hush');
  if (phase !== 'paused') return;
  pausedMs += performance.now() - pausedAt;
  if (replayShow) {
    replayShow = false; phase = 'wait';
    hint('Lượt này chơi lại với ô mới…');
    after(0.6, nextRound);                 // same round number, new tiles, full viewing time
    return;
  }
  phase = pausedPhase;
  loop();
}

// index.html states the v1 rule ("mỗi level thêm 1 ô"). Table v2 does not add a tile every level, so the
// menu line is rewritten to a rule that holds for every table.
if (BBD) {
  const rule = $('mmenu').querySelector('.how > div:last-child > span:last-child');
  if (rule && /mỗi level thêm 1 ô/.test(rule.textContent)) {
    rule.innerHTML = 'Mỗi level 3 lượt, đúng hoàn toàn <b>ít nhất 2 lượt</b> là qua. Level sau thường nhiều ô hơn hoặc ô nằm xa nhau hơn.';
  }
}
$('mStart').onclick = () => startLevel(chosen);
$('mrNext').onclick = () => startLevel(passed && level < LV_MAX ? level + 1 : level);
$('mrMenu').onclick = toMenu;
$('mPause').onclick = pause;
$('mResume').onclick = resume;
$('mQuit').onclick = toMenu;
$('mHint').setAttribute('aria-live', 'polite');
document.addEventListener('visibilitychange', () => {
  if (document.hidden && window.APP && window.APP.active === 'mem') pause();
});
document.addEventListener('keydown', e => {
  if (!window.APP || window.APP.active !== 'mem' || e.repeat) return;
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (phase === 'paused') { e.preventDefault(); resume(); }
    else if (phase !== 'idle') { e.preventDefault(); pause(); }
  }
});

// Leaving the game (Back, home button, hash change) pauses the round instead of wiping it,
// like Train, Koi, Rain and Word. The rAF timers stop on their own while phase is 'paused'.
BB.onLeave('mem', () => { pause(); clearStars(); });

window.memEnter = () => {
  const req = BB.takeRequest('mem');                 // daily challenge: straight into that level
  if (req != null) { toMenu(); chosen = Math.min(LV_MAX, Math.max(1, req | 0)); startLevel(chosen); return; }
  if (phase === 'paused') {                          // a round is still in progress: show the pause card
    $('mmenu').classList.add('hidden'); $('mresult').classList.add('hidden');
    $('mGrid').classList.add('hush'); $('mpaused').classList.remove('hidden');
    return;
  }
  toMenu();
};
window.memBest = () => Math.min(getLv() - 1, LV_MAX);
// Test hook: read-only view of state for Playwright.
if (navigator.webdriver) window.__mem = { spec, get phase(){ return phase; }, get level(){ return level; }, get round(){ return round; },
  get targets(){ return [...targets]; }, starsFor: () => starsFor(), LV_MAX, legacySpec, usesBBD: !!BBD };
})();
