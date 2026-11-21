// ======================= GAME MƯA PHÉP TÍNH =======================
(() => {
const $ = id => document.getElementById(id);
const BB = window.BB;
const cv = $('rcv'), ctx = cv.getContext('2d');
const LV_MAX = BB.LV_MAX.rain, LIVES = 3;
const AUTO_WAIT = 0.6;         // giây chờ khi đáp án đã gõ còn là đầu của một đáp án dài hơn
let W = 0, H = 0, dpr = 1, landscape = null, cvLand = null;
let state = 'menu';            // menu | play | paused | result
let level = 1, chosen = 1, passed = false;
let drops = [], fx = [], parts = [], solved = 0, target = 10, misses = 0, spawnT = 0, input = '', pendT = 0;
let combo = 0, playMs = 0, lastT = 0;
const cam = BB.trauma(7);

// Tiến độ cũ: rain_lv = level kế tiếp chưa qua. Giữ nguyên key để không ai mất level đã mở.
// Đọc cả bb_stats: hub và thử thách ngày ghi tiến độ vào đó, nên hai nguồn phải cùng một con số.
// Việc gieo bb_stats từ rain_lv cũ do hub.js seedFromLegacy() lo, ở đây không gieo lại.
const getLv = () => Math.min(LV_MAX + 1, Math.max(BB.store.num('rain_lv', 1, 1, LV_MAX + 1), BB.gameStats('rain').best + 1));
const setLv = v => BB.store.set('rain_lv', Math.min(LV_MAX + 1, v));
const ri = (a, b) => a + (Math.random()*(b - a + 1)|0);

// Mỗi level hoặc mở rộng phạm vi số, hoặc thêm một phép tính mới. Không level nào lùi lại.
const LVINFO = [
  null,
  { name: 'Cộng trong phạm vi 10' },
  { name: 'Cộng, trừ trong phạm vi 10' },
  { name: 'Cộng, trừ trong phạm vi 20' },
  { name: 'Cộng, trừ trong phạm vi 50' },
  { name: 'Cộng, trừ trong phạm vi 100' },
  { name: 'Bảng nhân 2–5' },
  { name: 'Bảng nhân 2–9' },
  { name: 'Nhân, chia (bảng 2–9)' },
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
  const div = (x1, c0, c1) => { const b = ri(2, x1), c = ri(c0, c1); return [`${b*c} ÷ ${b}`, c]; };
  const pick = arr => arr[Math.random()*arr.length|0]();
  switch (L) {
    case 1: return add(10);
    case 2: return pick([() => add(10), () => sub(10)]);
    case 3: return pick([() => add(20), () => sub(20)]);
    case 4: return pick([() => add(50), () => sub(50)]);
    case 5: return pick([() => add(100), () => sub(100)]);
    case 6: return mul(2, 5, 10);
    case 7: return mul(2, 9, 9);
    case 8: return pick([() => mul(2, 9, 9), () => div(9, 1, 9)]);
    case 9: return pick([() => add(100), () => sub(100), () => mul(2, 9, 9), () => div(9, 1, 9)]);
    default: return pick([() => add(200), () => sub(200), () => mul(2, 12, 12), () => div(12, 2, 12)]);
  }
}
// Sao: không để giọt nào rơi = 3, rơi 1 giọt = 2, rơi 2 giọt = 1, thua = 0.
const starsFor = (win, m) => win ? Math.max(1, LIVES - m) : 0;

const waterY = () => H - 26 - misses*8;
const DROP_FONT = '800 16px "Baloo 2", system-ui, sans-serif';

// Giọt lưu tiến độ p (0..1) trên quãng rơi, không lưu y tuyệt đối: đổi kích thước màn hình hay
// mặt nước dâng lên thì thời gian còn lại của giọt vẫn giữ nguyên.
const dropY = d => -30 + d.p*(waterY() + 30);

function spawn(){
  if (drops.length >= 5) { spawnT = 0.5; return; }
  const [eq, ans] = makeEq(level);
  // không cho 2 giọt cùng đáp án rơi cùng lúc
  if (drops.some(d => d.ans === ans)) { spawnT = 0.1; return; }
  ctx.font = DROP_FONT;
  const w = Math.max(78, Math.ceil(ctx.measureText(eq).width) + 26);
  const margin = 8, dw = w + 2;
  let bestX = W/2, bestD = -1;
  for (let k=0;k<10;k++){
    const x = margin + dw/2 + Math.random()*Math.max(0, W - 2*margin - dw);
    const dmin = drops.filter(d => dropY(d) < H*0.4).reduce((m, d) => Math.min(m, Math.abs(d.x - x)), 1e9);
    if (dmin > bestD) { bestD = dmin; bestX = x; }
  }
  const s = spec(level);
  drops.push({ x: bestX, p: 0, fall: s.fall, eq, ans, w });
  spawnT = s.every * (0.8 + Math.random()*0.4);
}

// ---------- particles (bỏ hẳn khi người dùng chọn giảm chuyển động) ----------
function burst(x, y, n, opts){
  if (BB.motion.reduced) return;
  for (let i=0;i<n;i++){
    const a = opts.up ? -Math.PI/2 + (Math.random()-0.5)*1.6 : Math.random()*Math.PI*2;
    const v = opts.v0 + Math.random()*opts.v1;
    parts.push({ x, y, vx: Math.cos(a)*v, vy: Math.sin(a)*v, t: 0, life: 0.45 + Math.random()*0.3,
      r: 2 + Math.random()*2.5, c: opts.colors[i % opts.colors.length], g: opts.g });
  }
}

function hit(d){
  const y = dropY(d);
  drops.splice(drops.indexOf(d), 1);
  solved++; combo++;
  fx.push({ x: d.x, y, t: 0, ok: true, combo });
  burst(d.x, y, 14, { v0: 90, v1: 140, g: 260, colors: ['#8fd0ff', '#b9ff7a', '#ffffff'] });
  BB.hitStop(55);
  BB.sfx('correct', { combo: Math.min(combo - 1, 12) });
  BB.haptic('tap');
  input = ''; pendT = 0; renderInput();
  hud();
  if (solved >= target) finish(true);
}

function wrongInput(){
  combo = 0; pendT = 0;
  BB.shake($('rDisp')); BB.sfx('wrong'); BB.haptic('error');
  input = ''; renderInput();
}

// Nút OK: so theo giá trị số, nên '05' vẫn khớp đáp án 5.
function submit(){
  if (state !== 'play' || !input) return;
  const v = +input;
  const d = drops.filter(x => x.ans === v).sort((a, b) => b.p - a.p)[0];
  d ? hit(d) : wrongInput();
}

// Gõ đúng là giọt tự vỡ. Nếu còn đáp án dài hơn bắt đầu bằng số vừa gõ thì đợi AUTO_WAIT giây
// cho chữ số tiếp theo rồi mới vỡ. Số không còn là đầu của đáp án nào thì xoá ngay.
function evalInput(typed){
  if (!input) { pendT = 0; return; }
  const exact = drops.find(d => String(d.ans) === input);
  const longer = drops.some(d => { const s = String(d.ans); return s.length > input.length && s.startsWith(input); });
  if (exact && !longer) hit(exact);
  else if (exact) pendT = AUTO_WAIT;
  else if (!longer) {
    // Đáp án trước đang chờ AUTO_WAIT mà người chơi đã gõ tiếp số đầu của phép kế:
    // vỡ giọt đúng trước, rồi tính chữ số vừa gõ như một lần gõ mới. Không phạt người gõ nhanh.
    const prev = input.slice(0, -1), digit = input.slice(-1);
    const done = typed && pendT > 0 && prev ? drops.find(d => String(d.ans) === prev) : null;
    if (done) { hit(done); if (state !== 'play') return; input = digit; renderInput(); evalInput(true); }
    else if (typed) wrongInput(); else { input = ''; pendT = 0; renderInput(); }
  }
  else pendT = 0;
}

function press(k){
  if (state !== 'play') return;
  if (k === 'ok') { submit(); return; }
  if (k === 'del') { input = input.slice(0, -1); renderInput(); evalInput(false); BB.sfx('key'); return; }
  if (input.length >= 3) return;
  input += k; renderInput();
  BB.sfx('key');
  evalInput(true);
}
function renderInput(){ $('rDisp').textContent = input || ' '; $('rDisp').classList.toggle('empty', !input); }

function update(dt){
  playMs += dt*1000;
  spawnT -= dt;
  if (spawnT <= 0 && solved + drops.length < target + 2) spawn();
  if (pendT > 0) {
    pendT -= dt;
    if (pendT <= 0) { const d = drops.find(x => String(x.ans) === input); if (d) { hit(d); if (state !== 'play') return; } else evalInput(false); }
  }
  const wy = waterY();
  let recheck = false;
  for (let i=drops.length-1;i>=0;i--){
    if (state !== 'play') return;
    const d = drops[i];
    d.p += dt/d.fall;
    if (dropY(d) >= wy - 12) {
      drops.splice(i, 1); misses++; combo = 0;
      fx.push({ x: d.x, y: wy - 4, t: 0, ok: false });
      burst(d.x, wy - 2, 12, { up: true, v0: 120, v1: 170, g: 620, colors: ['#8fd0ff', '#2a8fd6', '#ffffff'] });
      cam.add(0.6);
      BB.sfx('wrong'); BB.haptic('error');
      hud(true);
      if (misses >= LIVES) { finish(false); return; }
      recheck = true;
    }
  }
  // Kiểm lại ô nhập sau vòng lặp: hit() bên trong vòng lặp sẽ splice mảng đang duyệt.
  if (recheck && state === 'play' && input) evalInput(false);
  fx.forEach(f => f.t += dt); fx = fx.filter(f => f.t < 0.8);
  parts.forEach(p => { p.t += dt; p.vy += p.g*dt; p.x += p.vx*dt; p.y += p.vy*dt; });
  parts = parts.filter(p => p.t < p.life);
}

function drawDrop(d){
  const w = d.w, h = 38, x = d.x, y = dropY(d);
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.25)';
  ctx.beginPath(); ctx.ellipse(x + 2, y + 4, w/2, h/2, 0, 0, Math.PI*2); ctx.fill();
  // Chóp giọt còn sáng, phần thân chứa chữ đậm dần: chữ trắng đạt ≥ 5.5:1 trên mọi điểm của thân.
  const g = ctx.createLinearGradient(0, y - h/2 - 13, 0, y + h/2);
  g.addColorStop(0, '#8fd0ff'); g.addColorStop(0.4, '#1b69b8'); g.addColorStop(1, '#0f4482');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(x, y, w/2, h/2, 0, 0, Math.PI*2); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x - 15, y - h/2 + 5);
  ctx.quadraticCurveTo(x - 3, y - h/2 - 1, x, y - h/2 - 13);
  ctx.quadraticCurveTo(x + 3, y - h/2 - 1, x + 15, y - h/2 + 5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.35)';
  // Đốm sáng nằm trên dải chữ để không làm nhạt nền ngay sau chữ số.
  ctx.beginPath(); ctx.ellipse(x - w*0.3, y - h*0.32, 5, 3, -0.5, 0, Math.PI*2); ctx.fill();
  ctx.font = DROP_FONT;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(7,22,42,.85)';
  ctx.strokeText(d.eq, x, y + 2);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(d.eq, x, y + 2);
  ctx.restore();
}

function draw(dt){
  const o = cam.offset(dt);
  ctx.setTransform(dpr, 0, 0, dpr, o.x*dpr, o.y*dpr);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0d1b2e'); g.addColorStop(1, '#122b40');
  ctx.fillStyle = g; ctx.fillRect(-12, -12, W + 24, H + 24);
  // mây mờ phía trên
  ctx.fillStyle = 'rgba(255,255,255,.05)';
  [[W*0.2, 18, 60], [W*0.55, 8, 80], [W*0.85, 22, 55]].forEach(([x,y,r]) => { ctx.beginPath(); ctx.ellipse(x, y, r, r*0.35, 0, 0, Math.PI*2); ctx.fill(); });
  drops.forEach(drawDrop);
  // mặt nước
  const wy = waterY();
  const wg = ctx.createLinearGradient(0, wy, 0, H);
  wg.addColorStop(0, '#2a8fd6'); wg.addColorStop(1, '#174e7a');
  ctx.fillStyle = wg;
  ctx.beginPath(); ctx.moveTo(-12, wy);
  const tt = BB.motion.reduced ? 0 : performance.now()/600;
  const amp = BB.motion.reduced ? 0 : 2.5;
  for (let x=-12; x<=W+12; x+=12) ctx.lineTo(x, wy + Math.sin(x/28 + tt)*amp);
  ctx.lineTo(W + 12, H + 12); ctx.lineTo(-12, H + 12); ctx.closePath(); ctx.fill();
  parts.forEach(p => {
    ctx.globalAlpha = Math.max(0, 1 - p.t/p.life);
    ctx.fillStyle = p.c;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;
  const still = BB.motion.reduced;
  fx.forEach(f => {
    const k = f.t/0.8;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = f.ok ? '#b9ff7a' : '#ff6b6b'; ctx.lineWidth = 3;
    if (!still) { ctx.beginPath(); ctx.arc(f.x, f.y, 14 + k*36, 0, Math.PI*2); ctx.stroke(); }
    ctx.font = '800 22px "Baloo 2", system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = f.ok ? '#b9ff7a' : '#ff6b6b';
    const label = f.ok ? (f.combo >= 3 ? `✓ ×${f.combo}` : '✓') : '✗';
    ctx.fillText(label, f.x, f.y - 20 - (still ? 0 : k*24));
    ctx.globalAlpha = 1;
  });
}

// Chỉ chạy rAF khi đang ở màn Mưa và không tạm dừng; ra hub hay tạm dừng thì vòng lặp dừng
// sau khi vẽ khung cuối, rainEnter/resume khởi động lại.
let running = false;
function loop(ts){
  if (!(window.APP && window.APP.active === 'rain')) { running = false; return; }
  const dt = lastT ? Math.min(0.05, (ts - lastT)/1000 || 0) : 0; lastT = ts;
  if (state === 'play' && !BB.frozen()) update(dt);
  if (W) draw(dt);
  if (state === 'paused') { running = false; return; }
  requestAnimationFrame(loop);
}
function startLoop(){ if (running) return; running = true; lastT = 0; requestAnimationFrame(loop); }

function resize(){
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const oldW = W;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = r.width; H = r.height;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  // y tự co giãn theo p; x giữ đúng tỉ lệ ngang rồi kẹp trong màn hình
  drops.forEach(d => {
    if (oldW > 0) d.x *= W/oldW;
    const half = d.w/2 + 8;
    d.x = W > 2*half ? Math.max(half, Math.min(W - half, d.x)) : W/2;
  });
  parts = [];
  // Xoay máy hoặc khung chơi đổi dáng giữa ván: tạm dừng để người chơi định thần lại.
  // Xét cả viewport lẫn canvas: ở 320px dọc canvas đã W > H, nên xoay máy không làm canvas đổi dáng.
  const land = innerWidth > innerHeight, cl = W > H;
  if (landscape !== null && (land !== landscape || cl !== cvLand) && state === 'play') pause();
  landscape = land; cvLand = cl;
  // Đổi cỡ canvas xoá trắng nó; khi vòng lặp đang dừng (tạm dừng) thì tự vẽ lại một khung.
  if (!running && W && window.APP && window.APP.active === 'rain') draw(0);
}
window.addEventListener('resize', resize);

function hud(lost){
  const left = Math.max(0, LIVES - misses);
  $('rLevel').textContent = `Level ${level}`;
  $('rScore').textContent = `✓ ${solved}/${target}`;
  const lv = $('rLives');
  lv.textContent = '💧'.repeat(left) + '·'.repeat(Math.min(LIVES, misses));
  lv.setAttribute('aria-label', `Còn ${left} mạng`);
  if (lost) {
    if (BB.motion.reduced) { lv.classList.remove('bb-flash'); void lv.offsetWidth; lv.classList.add('bb-flash'); }
    else BB.pop(lv, 1.3);
  }
}

function showOnly(id){
  ['rmenu','rresult','rpaused'].forEach(x => $(x).classList.toggle('hidden', x !== id));
}

// Hẹn giờ hiện sao ở màn kết quả: giữ id để huỷ khi chơi tiếp, về menu hay rời game.
let starTimers = [];
function clearStarTimers(){ starTimers.forEach(clearTimeout); starTimers = []; }

function startLevel(L){
  clearStarTimers();
  level = Math.max(1, Math.min(LV_MAX, L|0 || 1));
  drops = []; fx = []; parts = []; solved = 0; misses = 0; combo = 0; playMs = 0;
  input = ''; pendT = 0; renderInput(); cam.reset();
  target = spec(level).target; spawnT = 0.6;
  showOnly(null);
  resize(); hud();
  state = 'play';
  // The loop stops itself while paused; a round started from the menu after a pause must restart it.
  if (window.APP && window.APP.active === 'rain') startLoop();
}

function pause(){
  if (state !== 'play') return;
  state = 'paused'; showOnly('rpaused');
}
function resume(){
  if (state !== 'paused') return;
  showOnly(null); state = 'play';
  startLoop();
}

// ---------- result ----------
function ensureResultExtras(){
  if ($('rrStars')) return;
  const big = $('rrBig');
  const st = document.createElement('div');
  st.id = 'rrStars'; st.className = 'rstars'; st.setAttribute('role', 'img');
  st.innerHTML = '<span>★</span><span>★</span><span>★</span>';
  const rule = document.createElement('p');
  rule.id = 'rrRule'; rule.className = 'muted rrule';
  rule.textContent = 'Không để rơi giọt nào: 3 sao. Rơi 1 giọt: 2 sao. Rơi 2 giọt: 1 sao.';
  big.after(st, rule);
}

function showStars(n, win){
  const st = $('rrStars');
  st.setAttribute('aria-label', `${n} trên 3 sao`);
  st.classList.toggle('lost', !win);
  [...st.children].forEach((s, i) => {
    s.setAttribute('aria-hidden', 'true');
    s.className = '';
    if (i >= n) return;
    if (BB.motion.reduced) { s.className = 'on'; return; }
    starTimers.push(setTimeout(() => {
      if (state !== 'result' || !(window.APP && window.APP.active === 'rain')) return;
      s.className = 'on pop';
      BB.sfx('star', { combo: i*2 });
    }, 380 + i*220));
  });
}

function finish(win){
  state = 'result'; passed = win;
  const stars = starsFor(win, misses);
  const last = win && level >= LV_MAX;
  if (win && level + 1 > getLv()) setLv(level + 1);
  const rec = BB.record({ game: 'rain', level, won: win, stars, score: solved, ms: playMs });

  ensureResultExtras();
  $('rrTitle').textContent = last ? `Xong cả ${LV_MAX} level! 🎉` : win ? `Qua Level ${level}! 🎉` : `Chưa qua Level ${level} 😅`;
  BB.countUp($('rrBig'), 0, solved, { fmt: v => `${v}/${target}` });
  $('rrDetail').textContent = last
    ? (stars < 3 ? 'Bạn đã qua level khó nhất. Chơi lại để lấy đủ 3 sao nhé.' : 'Bạn đã qua level khó nhất với đủ 3 sao.')
    : win ? `Level ${level+1}: ${LVINFO[level+1].name.toLowerCase()}.`
    : `Để rơi xuống nước ${misses} giọt. Giải đủ ${target} phép trước khi mất hết 3 giọt nước nhé.`;
  $('rrNext').textContent = win && !last ? `Level ${level+1} →` : `Chơi lại Level ${level}`;
  showOnly('rresult');
  showStars(stars, win);

  if (win) {
    BB.sfx('levelUp'); BB.haptic('levelUp');
    BB.celebrate(stars === 3 || last || rec.newBest ? { particleCount: 120, spread: 90 } : { particleCount: 60 });
  } else { BB.sfx('fail'); BB.haptic('error'); }

  if (rec.newBest) BB.toast(`Kỷ lục mới: qua Level ${level}`);
  else if (rec.newStars) BB.toast(`Level ${level} giờ có ${stars} sao`);
  if (rec.dailyDone) BB.toast('Xong thử thách hôm nay');
  if (rec.streakUp && rec.streak > 1) BB.toast(`Chuỗi ${rec.streak} ngày chơi liền`);
}

// ---------- menu ----------
function renderLevels(){
  const done = getLv() - 1, grid = $('rlvgrid'), stars = BB.gameStats('rain').stars;
  grid.innerHTML = '';
  for (let L=1; L<=LV_MAX; L++){
    const el = document.createElement('button');
    const st = stars[L] || 0, isDone = L <= done;
    el.className = 'lv' + (isDone ? ' done' : '') + (L === chosen ? ' on' : '');
    el.innerHTML = `${L}<small>${spec(L).target} phép</small>` +
      (st ? `<span class="lvst" aria-hidden="true">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>` : '');
    el.setAttribute('aria-label', `Level ${L}, ${spec(L).target} phép` + (isDone ? ', đã qua' : '') + (st ? `, ${st} sao` : ''));
    el.setAttribute('aria-pressed', L === chosen ? 'true' : 'false');
    el.onclick = () => { chosen = L; renderLevels(); BB.sfx('tap'); grid.children[L-1].focus({ preventScroll: true }); };
    grid.appendChild(el);
  }
  $('rLvTxt').textContent = `${LVINFO[chosen].name} · giải ${spec(chosen).target} phép`;
  $('rStart').textContent = `Chơi Level ${chosen}`;
}

function toMenu(){
  clearStarTimers();
  state = 'menu'; drops = []; fx = []; parts = []; input = ''; pendT = 0; renderInput();
  chosen = Math.min(getLv(), LV_MAX);
  renderLevels();
  const done = getLv() - 1;
  $('rBestTxt').textContent = done >= LV_MAX ? `Đã qua cả ${LV_MAX} level` : done ? `Đã qua tới Level ${done}` : '';
  showOnly('rmenu');
  resize(); level = chosen; misses = 0; solved = 0; target = spec(chosen).target; hud();
  if (window.APP && window.APP.active === 'rain') startLoop();
}

// ---------- input ----------
const pad = $('rPad');
pad.setAttribute('role', 'group');
pad.setAttribute('aria-label', 'Bàn phím số');
pad.querySelector('[data-k="del"]').setAttribute('aria-label', 'Xoá số vừa gõ');
pad.querySelector('[data-k="ok"]').setAttribute('aria-label', 'Nộp đáp án');
$('rDisp').setAttribute('role', 'status');
$('rDisp').setAttribute('aria-label', 'Số đang gõ');
$('rLives').setAttribute('role', 'img');
pad.querySelectorAll('button').forEach(b => {
  b.addEventListener('pointerdown', e => { e.preventDefault(); BB.haptic('tap'); press(b.dataset.k); });
  // Enter/Space trên nút đang focus sinh click với detail 0; chạm thì đã xử lý ở pointerdown.
  b.addEventListener('click', e => { if (e.detail === 0) press(b.dataset.k); });
});
function flashKey(k){
  const b = pad.querySelector(`[data-k="${k}"]`); if (!b) return;
  b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 110);
}
document.addEventListener('keydown', e => {
  if (!window.APP || window.APP.active !== 'rain' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (state === 'play') { e.preventDefault(); pause(); }
    else if (state === 'paused') { e.preventDefault(); resume(); }
    return;
  }
  if (state !== 'play') return;
  // Enter trên một nút đang focus (phím số, nút tạm dừng) để nút đó tự xử lý qua click.
  if (e.key === 'Enter' && e.target instanceof HTMLButtonElement && e.target.closest('#rainApp')) return;
  const m = /^Numpad(\d)$/.exec(e.code);
  const k = /^[0-9]$/.test(e.key) ? e.key : m ? m[1]
    : (e.key === 'Backspace' || e.key === 'Delete') ? 'del'
    : e.key === 'Enter' ? 'ok' : null;
  if (!k) return;
  e.preventDefault();
  if (e.repeat && k !== 'del') return;
  flashKey(k); press(k);
});
$('rStart').onclick = () => startLevel(chosen);
$('rrNext').onclick = () => startLevel(passed && level < LV_MAX ? level + 1 : level);
$('rrMenu').onclick = toMenu;
$('rPause').onclick = pause;
$('rResume').onclick = resume;
$('rQuit').onclick = toMenu;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && window.APP && window.APP.active === 'rain') pause();
});
BB.onLeave('rain', () => { pause(); clearStarTimers(); });

window.rainEnter = () => {
  startLoop();
  resize();
  const req = BB.takeRequest('rain');
  if (req != null) { startLevel(req); return; }
  // Rời giữa ván (Back, nút home) thì vào lại thấy màn Tạm dừng, không mất ván.
  if (state === 'play' || state === 'paused') { state = 'play'; pause(); hud(); return; }
  toMenu();
};
window.rainBest = () => getLv() - 1;
// Cửa cho test, chỉ gắn khi trình duyệt do máy điều khiển (Playwright) hoặc URL có ?test.
if (navigator.webdriver || /[?&]test\b/.test(location.search)) {
window.__rainDebug = () => ({ state, level, misses, solved, target, input, combo, pendT, W, H,
  drops: drops.map(d => ({ ans: d.ans, eq: d.eq, x: d.x, y: dropY(d), p: d.p, w: d.w })) });
window.__rainTest = { makeEq, LVINFO, spec, starsFor, spawnDrop: (ans, p = 0.5, eq = `? = ${ans}`, w = 78) => {
  drops.push({ x: W/2, p, fall: spec(level).fall, eq, ans, w }); }, starTimers: () => starTimers.length };
}
if (window.APP && window.APP.active === 'rain') startLoop();
})();
