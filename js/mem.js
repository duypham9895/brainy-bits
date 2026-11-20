// ======================= GAME Ô SÁNG GHI NHỚ =======================
(() => {
const $ = id => document.getElementById(id);
const BB = window.BB;
const ROUNDS = 3, NEED = 2, LV_MAX = BB.LV_MAX.mem;   // 13
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
// One-time seed of BB stats from the old key, so the hub, streaks and daily level see old progress.
if (!BB.store.get('bb_seed_mem')) {
  const done = legacyLv() - 1;
  const all = BB.store.json('bb_stats', {});
  const s = all.mem || (all.mem = { best: 0, stars: {} });
  s.stars = s.stars || {};
  if (done > (s.best || 0)) s.best = done;
  BB.store.setJson('bb_stats', all);
  BB.store.set('bb_seed_mem', '1');
}

// level 1 = 3 ô sáng, mỗi level thêm 1 ô. Never more targets than cells - 1 (MEM-1 guard).
function spec(L){
  const t0 = 2 + L;
  const size = t0 <= 4 ? 3 : t0 <= 7 ? 4 : t0 <= 11 ? 5 : 6;
  const t = Math.min(t0, size * size - 1);
  return { t, size, show: 1.0 + 0.3*t };
}
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

function pickTargets(t){
  // Partial Fisher-Yates over the cell list: always terminates, no duplicates.
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
  targets = pickTargets(s.t);
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
    ? `Nhớ đúng hoàn toàn ${perfect}/${round} lượt. Cần đúng ít nhất ${NEED} lượt để qua level.`
    : last
      ? `Nhớ đúng hoàn toàn ${perfect}/${round} lượt. ${stars < 3 ? 'Chơi lại để gom đủ 3 sao.' : 'Level cuối, đủ 3 sao.'}`
      : `Nhớ đúng hoàn toàn ${perfect}/${round} lượt. Level ${level+1} có ${spec(level+1).t} ô sáng.`;
  $('mrNext').textContent = passed && !last ? `Level ${level+1} →` : `Chơi lại Level ${level}`;
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
  const done = getLv() - 1, grid = $('mlvgrid'), st = BB.gameStats('mem').stars;
  grid.innerHTML = '';
  for (let L=1; L<=LV_MAX; L++){
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'lv' + (L <= done ? ' done' : '') + (L === chosen ? ' on' : '');
    el.innerHTML = `${L}<small>${spec(L).t} ô</small>`;
    const k = st[L] || 0;
    if (L <= done && k) el.dataset.st = '★'.repeat(k);
    el.setAttribute('aria-label', `Level ${L}, ${spec(L).t} ô${L <= done ? ', đã qua' : ''}${k ? `, ${k} sao` : ''}`);
    el.setAttribute('aria-pressed', L === chosen ? 'true' : 'false');
    el.onclick = () => { chosen = L; previewLevel(); renderLevels(); BB.sfx('tap'); grid.children[L-1].focus({ preventScroll: true }); };
    grid.appendChild(el);
  }
  const s = spec(chosen);
  $('mLvTxt').textContent = `Lưới ${s.size}×${s.size} · ${s.t} ô sáng · nhìn ${s.show.toFixed(1).replace('.', ',')} giây`;
  $('mStart').textContent = `Chơi Level ${chosen} · ${s.t} ô`;
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

BB.onLeave('mem', () => {
  phase = 'idle'; timers = []; replayShow = false; clearStars();
  $('mGrid').classList.remove('hush');
});

window.memEnter = () => {
  toMenu();
  const req = BB.takeRequest('mem');
  if (req != null) { chosen = Math.min(LV_MAX, Math.max(1, req | 0)); startLevel(chosen); }
};
window.memBest = () => Math.min(getLv() - 1, LV_MAX);
// Test hook: read-only view of state for Playwright.
if (navigator.webdriver) window.__mem = { spec, get phase(){ return phase; }, get level(){ return level; }, get round(){ return round; },
  get targets(){ return [...targets]; }, starsFor: () => starsFor(), LV_MAX };
})();
