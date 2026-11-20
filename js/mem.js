// ======================= GAME Ô SÁNG GHI NHỚ =======================
(() => {
const $ = id => document.getElementById(id);
const ROUNDS = 3, LV_MAX = 13;
let level = 1, round = 0, perfect = 0, totalOk = 0;
let phase = 'idle';            // idle | show | input | wait | paused
let targets = new Set(), found = 0, n = 3;
let timers = [], pausedPhase = null, chosen = 1, passed = false;
let actx = null;
function beep(f, d, type='sine', v=0.06, delay=0){
  try{ if(!actx) actx = new (window.AudioContext||window.webkitAudioContext)();
    const t0 = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + d + 0.02);
  }catch(e){}
}
const getLv = () => { try { return Math.max(1, +localStorage.getItem('mem_lv') || 1); } catch(e){ return 1; } };
const setLv = v => { try { localStorage.setItem('mem_lv', v); } catch(e){} };

// level 1 = 3 ô sáng, mỗi level thêm 1 ô
function spec(L){
  const t = 2 + L;
  const size = t <= 4 ? 3 : t <= 7 ? 4 : t <= 11 ? 5 : 6;
  return { t, size, show: 1.0 + 0.3*t };
}

// hẹn giờ có thể tạm dừng (chạy theo requestAnimationFrame)
let last = 0;
function after(sec, fn){ timers.push({ left: sec, fn }); }
function tick(ts){
  const dt = Math.min(0.05, (ts - last)/1000 || 0); last = ts;
  if (window.APP && window.APP.active === 'mem' && phase !== 'paused') {
    const due = [];
    timers.forEach(t => { t.left -= dt; if (t.left <= 0) due.push(t); });
    timers = timers.filter(t => t.left > 0);
    due.forEach(t => t.fn());
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function buildGrid(){
  const g = $('mGrid');
  g.innerHTML = '';
  g.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  for (let i=0;i<n*n;i++){
    const b = document.createElement('button');
    b.className = 'mtile'; b.dataset.i = i;
    b.addEventListener('pointerdown', e => { e.preventDefault(); tap(i, b); });
    g.appendChild(b);
  }
}
const tiles = () => [...$('mGrid').children];

function hud(){
  const s = spec(level);
  $('mLevel').textContent = `Level ${level} · ${s.t} ô`;
  $('mRound').textContent = `Lượt ${Math.min(round+1, ROUNDS)}/${ROUNDS}`;
  $('mScore').textContent = `✓ ${perfect}`;
}

function startLevel(L){
  level = L; round = 0; perfect = 0; timers = [];
  const s = spec(level); n = s.size;
  ['mmenu','mresult','mpaused'].forEach(id => $(id).classList.add('hidden'));
  buildGrid(); hud();
  $('mHint').textContent = 'Chuẩn bị…';
  phase = 'wait';
  after(0.8, nextRound);
}

function nextRound(){
  const s = spec(level);
  tiles().forEach(t => t.className = 'mtile');
  targets = new Set();
  while (targets.size < s.t) targets.add(Math.random()*n*n|0);
  found = 0;
  phase = 'show';
  hud();
  $('mHint').textContent = `Ghi nhớ ${s.t} ô sáng`;
  targets.forEach(i => tiles()[i].classList.add('lit'));
  beep(520, 0.1, 'triangle', 0.05);
  after(s.show, () => {
    tiles().forEach(t => t.classList.remove('lit'));
    phase = 'input';
    $('mHint').textContent = `Chạm lại các ô vừa sáng (0/${s.t})`;
  });
}

function tap(i, el){
  if (phase !== 'input' || el.classList.contains('ok')) return;
  const s = spec(level);
  if (targets.has(i)) {
    el.classList.add('ok'); found++;
    beep(600 + found*40, 0.07, 'sine', 0.05);
    $('mHint').textContent = `Chạm lại các ô vừa sáng (${found}/${s.t})`;
    if (found === s.t) {
      perfect++; totalOk++; phase = 'wait';
      $('mHint').textContent = 'Chính xác! 🎉';
      beep(880, 0.1, 'sine', 0.06); beep(1320, 0.14, 'sine', 0.05, 0.08);
      hud();
      after(1.0, endRound);
    }
  } else {
    el.classList.add('bad'); phase = 'wait';
    targets.forEach(k => { if (!tiles()[k].classList.contains('ok')) tiles()[k].classList.add('miss'); });
    $('mHint').textContent = 'Sai ô rồi, đây là các ô đúng';
    beep(160, 0.25, 'sawtooth', 0.05);
    after(1.6, endRound);
  }
}

function endRound(){
  round++;
  if (round < ROUNDS) { hud(); nextRound(); return; }
  phase = 'idle';
  passed = perfect >= 2;
  if (passed && level + 1 > getLv()) setLv(level + 1);
  $('mrTitle').textContent = passed ? `Qua Level ${level}! 🎉` : `Chưa qua Level ${level} 😅`;
  $('mrBig').textContent = `${perfect}/${ROUNDS}`;
  $('mrDetail').textContent = passed
    ? `Nhớ đúng hoàn toàn ${perfect}/${ROUNDS} lượt. Level ${level+1} có ${spec(level+1).t} ô sáng.`
    : `Nhớ đúng hoàn toàn ${perfect}/${ROUNDS} lượt. Cần đúng ít nhất 2 lượt để qua level.`;
  $('mrNext').textContent = passed ? `Level ${level+1} →` : `Chơi lại Level ${level}`;
  $('mresult').classList.remove('hidden');
  passed ? (beep(660,0.12,'triangle',0.06), beep(990,0.18,'triangle',0.06,0.1)) : beep(440,0.2,'triangle',0.05);
}

function renderLevels(){
  const done = getLv() - 1, grid = $('mlvgrid');
  grid.innerHTML = '';
  for (let L=1; L<=LV_MAX; L++){
    const el = document.createElement('button');
    el.className = 'lv' + (L <= done ? ' done' : '') + (L === chosen ? ' on' : '');
    el.innerHTML = `${L}<small>${spec(L).t} ô</small>`;
    el.onclick = () => { chosen = L; renderLevels(); beep(700, 0.04, 'square', 0.03); };
    grid.appendChild(el);
  }
  const s = spec(chosen);
  $('mLvTxt').textContent = `Lưới ${s.size}×${s.size} · ${s.t} ô sáng · nhìn ${s.show.toFixed(1).replace('.', ',')} giây`;
  $('mStart').textContent = `Chơi Level ${chosen} · ${s.t} ô`;
}

function toMenu(){
  phase = 'idle'; timers = [];
  chosen = Math.min(getLv(), LV_MAX);
  renderLevels();
  const done = getLv() - 1;
  $('mBestTxt').textContent = done ? `Đã qua tới Level ${done}` : '';
  ['mresult','mpaused'].forEach(id => $(id).classList.add('hidden'));
  $('mmenu').classList.remove('hidden');
  n = spec(chosen).size; buildGrid(); hud();
  $('mHint').textContent = '';
}

$('mStart').onclick = () => startLevel(chosen);
$('mrNext').onclick = () => startLevel(passed ? level + 1 : level);
$('mrMenu').onclick = toMenu;
$('mPause').onclick = () => { if (phase === 'idle' || phase === 'paused') return; pausedPhase = phase; phase = 'paused'; $('mpaused').classList.remove('hidden'); };
$('mResume').onclick = () => { $('mpaused').classList.add('hidden'); if (phase === 'paused') phase = pausedPhase; };
$('mQuit').onclick = toMenu;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && window.APP && window.APP.active === 'mem' && phase !== 'idle' && phase !== 'paused') { pausedPhase = phase; phase = 'paused'; $('mpaused').classList.remove('hidden'); }
});
window.memEnter = toMenu;
window.memBest = () => getLv() - 1;
})();

