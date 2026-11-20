// ======================= GAME MƯA PHÉP TÍNH =======================
(() => {
const $ = id => document.getElementById(id);
const cv = $('rcv'), ctx = cv.getContext('2d');
const LV_MAX = 10, LIVES = 3;
let W = 0, H = 0, dpr = 1;
let state = 'menu';            // menu | play | paused | result
let level = 1, chosen = 1, passed = false;
let drops = [], fx = [], solved = 0, target = 10, misses = 0, spawnT = 0, input = '', shakeT = 0, lastT = 0;
let actx = null;
function beep(f, d, type='sine', v=0.06, delay=0){
  try{ if(!actx) actx = new (window.AudioContext||window.webkitAudioContext)();
    const t0 = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + d + 0.02);
  }catch(e){}
}
const getLv = () => { try { return Math.max(1, +localStorage.getItem('rain_lv') || 1); } catch(e){ return 1; } };
const setLv = v => { try { localStorage.setItem('rain_lv', v); } catch(e){} };
const ri = (a, b) => a + (Math.random()*(b - a + 1)|0);

// mỗi level: loại phép tính, tốc độ rơi, nhịp ra giọt, số phép cần giải
const LVINFO = [
  null,
  { name: 'Cộng trong phạm vi 10' },
  { name: 'Cộng, trừ trong phạm vi 10' },
  { name: 'Cộng, trừ trong phạm vi 20' },
  { name: 'Bảng nhân 2–5' },
  { name: 'Cộng, trừ trong phạm vi 50' },
  { name: 'Bảng nhân 2–9' },
  { name: 'Chia hết (bảng 2–9)' },
  { name: 'Cộng, trừ trong phạm vi 100' },
  { name: 'Đủ 4 phép tính' },
  { name: 'Đủ 4 phép tính, số lớn hơn' },
];
function spec(L){
  return { fall: Math.max(8, 13 - 0.55*(L-1)), every: Math.max(2.7, 4.6 - 0.2*(L-1)), target: 10 + L };
}
function makeEq(L){
  const add = m => { const a = ri(1, m-1), b = ri(1, m - a); return [`${a} + ${b}`, a + b]; };
  const sub = m => { const a = ri(2, m), b = ri(1, a); return [`${a} − ${b}`, a - b]; };
  const mul = (x0, x1, y1) => { const a = ri(x0, x1), b = ri(1, y1); return Math.random()<0.5 ? [`${a} × ${b}`, a*b] : [`${b} × ${a}`, a*b]; };
  const div = (x1) => { const b = ri(2, x1), c = ri(1, 9); return [`${b*c} ÷ ${b}`, c]; };
  const pick = arr => arr[Math.random()*arr.length|0]();
  switch (L) {
    case 1: return add(10);
    case 2: return pick([() => add(10), () => sub(10)]);
    case 3: return pick([() => add(20), () => sub(20)]);
    case 4: return mul(2, 5, 10);
    case 5: return pick([() => add(50), () => sub(50)]);
    case 6: return mul(2, 9, 9);
    case 7: return div(9);
    case 8: return pick([() => add(100), () => sub(100)]);
    case 9: return pick([() => add(100), () => sub(100), () => mul(2, 9, 9), () => div(9)]);
    default: return pick([() => add(200), () => sub(200), () => mul(2, 12, 12), () => div(12)]);
  }
}

const waterY = () => H - 26 - misses*8;

function spawn(){
  if (drops.length >= 5) { spawnT = 0.5; return; }
  const [eq, ans] = makeEq(level);
  // không cho 2 giọt cùng đáp án rơi cùng lúc
  if (drops.some(d => d.ans === ans)) { spawnT = 0.1; return; }
  const dw = 80, margin = 8;
  let bestX = W/2, bestD = -1;
  for (let k=0;k<10;k++){
    const x = margin + dw/2 + Math.random()*(W - 2*margin - dw);
    const dmin = drops.filter(d => d.y < H*0.4).reduce((m, d) => Math.min(m, Math.abs(d.x - x)), 1e9);
    if (dmin > bestD) { bestD = dmin; bestX = x; }
  }
  const s = spec(level);
  drops.push({ x: bestX, y: -30, eq, ans, spd: (waterY() + 30) / s.fall });
  spawnT = s.every * (0.8 + Math.random()*0.4);
}

function submit(auto){
  if (state !== 'play' || !input) return;
  const v = +input;
  const hit = drops.filter(d => d.ans === v).sort((a,b) => b.y - a.y)[0];
  if (hit) {
    drops.splice(drops.indexOf(hit), 1);
    solved++;
    fx.push({ x: hit.x, y: hit.y, t: 0, ok: true });
    beep(760, 0.07, 'sine', 0.06); beep(1140, 0.1, 'sine', 0.05, 0.06);
    input = ''; renderInput();
    hud();
    if (solved >= target) finish(true);
  } else if (!auto) {
    shakeT = 0.35; beep(200, 0.12, 'square', 0.04);
    input = ''; renderInput();
  }
}

function press(k){
  if (state !== 'play') return;
  if (k === 'del') input = input.slice(0, -1);
  else if (k === 'ok') { submit(false); return; }
  else if (input.length < 3) input += k;
  renderInput();
  // tự nhận khi gõ đúng đáp án và không còn đáp án nào dài hơn bắt đầu bằng các số này
  const v = +input;
  if (input && drops.some(d => d.ans === v) && !drops.some(d => String(d.ans).length > input.length && String(d.ans).startsWith(input))) submit(true);
}
function renderInput(){ $('rDisp').textContent = input || ' '; $('rDisp').classList.toggle('empty', !input); }

function update(dt){
  spawnT -= dt;
  if (spawnT <= 0 && solved + drops.length < target + 2) spawn();
  const wy = waterY();
  for (let i=drops.length-1;i>=0;i--){
    const d = drops[i];
    d.y += d.spd*dt;
    if (d.y >= wy - 12) {
      drops.splice(i, 1); misses++;
      fx.push({ x: d.x, y: wy - 4, t: 0, ok: false });
      beep(160, 0.25, 'sawtooth', 0.05);
      hud();
      if (misses >= LIVES) { finish(false); return; }
    }
  }
  fx.forEach(f => f.t += dt); fx = fx.filter(f => f.t < 0.8);
  if (shakeT > 0) { shakeT = Math.max(0, shakeT - dt); $('rDisp').style.transform = `translateX(${Math.sin(shakeT*60)*6*(shakeT/0.35)}px)`; }
  else $('rDisp').style.transform = '';
}

function drawDrop(d){
  const w = 78, h = 38, x = d.x, y = d.y;   // giọt nhỏ gọn hơn
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(x + 2, y + 4, w/2, h/2, 0, 0, Math.PI*2); ctx.fill();
  const g = ctx.createLinearGradient(0, y - h/2 - 13, 0, y + h/2);
  g.addColorStop(0, '#8fd0ff'); g.addColorStop(1, '#2f7fd6');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, w/2, h/2, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 15, y - h/2 + 5);
  ctx.quadraticCurveTo(x - 3, y - h/2 - 1, x, y - h/2 - 13);
  ctx.quadraticCurveTo(x + 3, y - h/2 - 1, x + 15, y - h/2 + 5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  ctx.beginPath(); ctx.ellipse(x - w*0.3, y - h*0.18, 5, 3.5, -0.5, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 16px "Baloo 2", system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(d.eq, x, y + 2);
  ctx.restore();
}

function draw(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d1b2e'); g.addColorStop(1, '#122b40');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // mây mờ phía trên
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  [[W*0.2, 18, 60], [W*0.55, 8, 80], [W*0.85, 22, 55]].forEach(([x,y,r]) => { ctx.beginPath(); ctx.ellipse(x, y, r, r*0.35, 0, 0, Math.PI*2); ctx.fill(); });
  drops.forEach(drawDrop);
  // mặt nước
  const wy = waterY();
  const wg = ctx.createLinearGradient(0, wy, 0, H);
  wg.addColorStop(0, '#2a8fd6'); wg.addColorStop(1, '#174e7a');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.moveTo(0, wy);
  const tt = performance.now()/600;
  for (let x=0; x<=W; x+=12) ctx.lineTo(x, wy + Math.sin(x/28 + tt)*2.5);
  ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.fill();
  fx.forEach(f => {
    const k = f.t/0.8;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = f.ok ? '#b9ff7a' : '#ff6b6b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(f.x, f.y, 14 + k*36, 0, Math.PI*2); ctx.stroke();
    ctx.font = '800 22px "Baloo 2", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = f.ok ? '#b9ff7a' : '#ff6b6b';
    ctx.fillText(f.ok ? '✓' : '✗', f.x, f.y - 20 - k*24);
    ctx.globalAlpha = 1;
  });
}

function loop(ts){
  const dt = Math.min(0.05, (ts - lastT)/1000 || 0); lastT = ts;
  if (window.APP && window.APP.active === 'rain') {
    if (state === 'play') update(dt);
    if (W) draw();
  }
  requestAnimationFrame(loop);
}

function resize(){
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = r.width; H = r.height;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  drops.forEach(d => d.x = Math.max(46, Math.min(W - 46, d.x)));
}
window.addEventListener('resize', resize);

function hud(){
  $('rLevel').textContent = `Level ${level}`;
  $('rScore').textContent = `✓ ${solved}/${target}`;
  $('rLives').textContent = '💧'.repeat(Math.max(0, LIVES - misses)) + '·'.repeat(Math.min(LIVES, misses));
}

function startLevel(L){
  level = L; drops = []; fx = []; solved = 0; misses = 0; input = ''; renderInput();
  target = spec(L).target; spawnT = 0.6;
  ['rmenu','rresult','rpaused'].forEach(id => $(id).classList.add('hidden'));
  resize(); hud();
  state = 'play';
}

function finish(win){
  state = 'result'; passed = win;
  if (win && level + 1 > getLv()) setLv(level + 1);
  $('rrTitle').textContent = win ? `Qua Level ${level}! 🎉` : `Chưa qua Level ${level} 😅`;
  $('rrBig').textContent = `${solved}/${target}`;
  $('rrDetail').textContent = win
    ? (level < LV_MAX ? `Level ${level+1}: ${LVINFO[level+1].name.toLowerCase()}.` : 'Bạn đã qua level cao nhất!')
    : `Để rơi xuống nước ${misses} giọt. Giải đủ ${target} phép trước khi mất hết 3 giọt nước nhé.`;
  $('rrNext').textContent = win ? (level < LV_MAX ? `Level ${level+1} →` : `Chơi lại Level ${level}`) : `Chơi lại Level ${level}`;
  $('rresult').classList.remove('hidden');
  win ? (beep(660,0.12,'triangle',0.06), beep(990,0.18,'triangle',0.06,0.1)) : beep(440,0.2,'triangle',0.05);
}

function renderLevels(){
  const done = getLv() - 1, grid = $('rlvgrid');
  grid.innerHTML = '';
  for (let L=1; L<=LV_MAX; L++){
    const el = document.createElement('button');
    el.className = 'lv' + (L <= done ? ' done' : '') + (L === chosen ? ' on' : '');
    el.innerHTML = `${L}<small>${spec(L).target} phép</small>`;
    el.onclick = () => { chosen = L; renderLevels(); beep(700, 0.04, 'square', 0.03); };
    grid.appendChild(el);
  }
  $('rLvTxt').textContent = `${LVINFO[chosen].name} · giải ${spec(chosen).target} phép`;
  $('rStart').textContent = `Chơi Level ${chosen}`;
}

function toMenu(){
  state = 'menu'; drops = []; fx = [];
  chosen = Math.min(getLv(), LV_MAX);
  renderLevels();
  const done = getLv() - 1;
  $('rBestTxt').textContent = done ? `Đã qua tới Level ${done}` : '';
  ['rresult','rpaused'].forEach(id => $(id).classList.add('hidden'));
  $('rmenu').classList.remove('hidden');
  resize(); level = chosen; misses = 0; solved = 0; target = spec(chosen).target; hud();
}

document.querySelectorAll('#rPad button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); press(b.dataset.k); }));
document.addEventListener('keydown', e => {
  if (!window.APP || window.APP.active !== 'rain' || state !== 'play') return;
  if (/^[0-9]$/.test(e.key)) press(e.key);
  else if (e.key === 'Backspace') press('del');
  else if (e.key === 'Enter') press('ok');
});
$('rStart').onclick = () => startLevel(chosen);
$('rrNext').onclick = () => startLevel(passed && level < LV_MAX ? level + 1 : level);
$('rrMenu').onclick = toMenu;
$('rPause').onclick = () => { if (state === 'play') { state = 'paused'; $('rpaused').classList.remove('hidden'); } };
$('rResume').onclick = () => { $('rpaused').classList.add('hidden'); state = 'play'; };
$('rQuit').onclick = toMenu;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play' && window.APP && window.APP.active === 'rain') { state = 'paused'; $('rpaused').classList.remove('hidden'); }
});
window.rainEnter = () => { resize(); toMenu(); };
window.rainBest = () => getLv() - 1;
requestAnimationFrame(loop);
})();

