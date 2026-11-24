// ======================= GAME MƯA PHÉP TÍNH =======================
(() => {
const $ = id => document.getElementById(id);
const BB = window.BB;
const cv = $('rcv'), ctx = cv.getContext('2d');
const LIVES = 3;                // số mạng mặc định (bảng cũ, dòng không có knob lives)
const AUTO_WAIT = 0.6;         // giây chờ khi đáp án đã gõ còn là đầu của một đáp án dài hơn
let W = 0, H = 0, dpr = 1, landscape = null, cvLand = null;
let state = 'menu';            // menu | play | paused | result
let level = 1, chosen = 1, passed = false;
let drops = [], fx = [], parts = [], solved = 0, target = 10, misses = 0, spawnT = 0, lastBurst = false, input = '', pendT = 0;
let combo = 0, playMs = 0, lastT = 0, lives = LIVES;
const cam = BB.trauma(7);

// Thông số level đọc từ engine chung: BBD.level('rain', L) (js/difficulty.js + js/levels/rain.js).
// Bảng phiên bản 2 (E3 đã gỡ 2026-11-21); phép tính sinh bằng BBRain.makeEq, chung với bộ mô phỏng.
// table(): BBD có bảng rain thì trả BBD. Nếu levels/rain.js chạy trước difficulty.js, hoặc một bản
// difficulty.js nạp sau đã thay window.BBD và mất bảng, thì đăng ký lại (BBRain.register không trùng).
function table(){
  const D = window.BBD, R = window.BBRain;
  if (!D || typeof D.games !== 'function') return null;
  if (!D.games().includes('rain') && R && R.register) R.register(D);
  return D.games().includes('rain') ? D : null;
}
// loadDone: đã thử nạp xong (được hay lỗi). Không có bảng thì chơi 10 level cũ: thông số theo công thức
// cũ, phép tính vẫn từ BBRain. Thiếu cả BBRain (levels/rain.js không tải được) thì chưa chơi được.
let loadDone = false;
const ready = () => !!window.BBRain && (loadDone || !!table());
const legacySpec = L => ({ ops: L, fall: Math.max(8, 13 - 0.55*(L - 1)), every: Math.max(2.7, 4.6 - 0.2*(L - 1)), target: 10 + L, lives: LIVES, legacy: true });
// Số level: theo BBD.maxLevel, báo cho core để hub và thử thách ngày cùng một con số.
let maxSynced = 0, pendingStart = null;
function lvMax(){
  const D = table();
  if (!D) return BB.LV_MAX.rain;
  const n = D.maxLevel('rain');
  if (n !== maxSynced) { BB.setLvMax('rain', n); maxSynced = n; }
  return n;
}
// index.html nạp hai file kia trước file này. Bản index.html chưa có thẻ script: tự nạp theo thứ tự,
// chờ thẻ đã có (file khác có thể đang nạp difficulty.js) chứ không chèn thêm, vì nạp lại difficulty.js
// sẽ xoá bảng của game khác. levels/rain.js chỉ nạp sau khi difficulty.js xong. Lỗi hay chậm quá 4 s
// thì đi tiếp, rồi vẽ lại menu.
const NEED = [['js/difficulty.js', () => !!window.BBD], ['js/levels/rain.js', () => !!window.BBRain]];
function loadStep(i, done){
  if (i >= NEED.length) { done(); return; }
  const [src, ok] = NEED[i];
  if (ok()) { loadStep(i + 1, done); return; }
  let el = document.querySelector(`script[src$="${src}"]`), fired = false;
  const next = () => { if (!fired) { fired = true; loadStep(i + 1, done); } };
  // Thẻ tĩnh trong index.html đã chạy xong (hoặc lỗi) trước file này: load/error đã bắn rồi, chờ nữa là treo 4 s.
  // Chỉ thẻ chèn lúc chạy (data-bb-dyn) mới còn đang nạp.
  if (el && !el.dataset.bbDyn) { next(); return; }
  if (!el) { el = document.createElement('script'); el.src = src; el.dataset.bbDyn = '1'; document.head.appendChild(el); }
  el.addEventListener('load', next); el.addEventListener('error', next);
  setTimeout(next, 4000);
}
// Đổi bảng level (version mới) thì dời tiến độ đã lưu sang bảng mới, một lần, trước khi đọc gameStats.
// Rain giữ nguyên số màn nên không cần mapper: chỉ ghi cờ bb_tablev_rain. Không bao giờ hạ số màn đã qua.
let migrated = false;
function migrate(){
  if (migrated || !table() || typeof BB.migrateProgress !== 'function') return;
  migrated = true;
  BB.migrateProgress('rain');
}
function ensureLevels(){
  if (table() && window.BBRain) { loadDone = true; migrate(); lvMax(); return; }
  loadStep(0, () => {
    loadDone = true; migrate(); lvMax();
    if (!(window.APP && window.APP.active === 'rain')) return;
    if (pendingStart != null && ready()) { const L = pendingStart; pendingStart = null; startLevel(L); }
    else if (state === 'menu') toMenu();
  });
}

// Tiến độ cũ: rain_lv = level kế tiếp chưa qua. Giữ nguyên key để không ai mất level đã mở.
// Đọc cả bb_stats: hub và thử thách ngày ghi tiến độ vào đó, nên hai nguồn phải cùng một con số.
// Việc gieo bb_stats từ rain_lv cũ do hub.js seedFromLegacy() lo, ở đây không gieo lại.
const getLv = () => Math.min(lvMax() + 1, Math.max(BB.store.num('rain_lv', 1, 1, lvMax() + 1), BB.gameStats('rain').best + 1));
const setLv = v => BB.store.set('rain_lv', Math.min(lvMax() + 1, v));

const spec = L => { const D = table(); return D ? D.level('rain', L) : legacySpec(L); };
// Mỗi tầng phép tính có một tên; L1..10 là đúng tên cũ.
const levelName = L => window.BBRain.TIER_NAME[spec(L).ops];
const makeEq = L => window.BBRain.makeEq(spec(L).ops, Math.random);
// Số giọt được để rơi trước khi thua. Bảng v2: màn thở (16, 21, 26, từ 2026-11-22) cho 4, còn lại 3 (lưới đỡ E4).
const livesOf = L => { const n = spec(L).lives; return Number.isInteger(n) && n > 0 ? n : LIVES; };
// Dòng "level kế tiếp" ở màn kết quả: tên tầng khi đổi phép tính, rồi cái gì đổi (mưa, số phép, số mạng).
function nextInfo(L){
  const a = spec(L), b = spec(L + 1), out = [];
  if (b.ops !== a.ops) out.push(levelName(L + 1).toLowerCase());
  if (b.every < a.every || b.fall < a.fall) out.push('mưa nhanh hơn');
  if (b.target > a.target) out.push(`giải ${b.target} phép`);
  const la = livesOf(L), lb = livesOf(L + 1);
  if (lb !== la) out.push(lb < la ? `còn ${lb} mạng` : `${lb} mạng`);
  return out.length ? out.join(', ') : `giải ${b.target} phép`;
}
// Sao: không để giọt nào rơi = 3, rơi 1 giọt = 2, rơi từ 2 giọt = 1, thua = 0. Màn có thêm mạng vẫn chấm như vậy.
const starsFor = (win, m) => win ? Math.max(1, 3 - m) : 0;

const waterY = () => H - 26 - misses*8;
const DROP_FONT = '800 16px "Baloo 2", system-ui, sans-serif';

// Giọt lưu tiến độ p (0..1) trên quãng rơi, không lưu y tuyệt đối: đổi kích thước màn hình hay
// mặt nước dâng lên thì thời gian còn lại của giọt vẫn giữ nguyên.
const dropY = d => -30 + d.p*(waterY() + 30);

function spawn(){
  if (drops.length >= 5) { spawnT = 0.5; return; }
  if (!ready()) { spawnT = 0.1; return; }
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
  const fall = window.BBRain && window.BBRain.dropFall ? window.BBRain.dropFall(s.fall, Math.random) : s.fall;
  drops.push({ x: bestX, p: 0, fall, eq, ans, w });
  if (window.BBRain && window.BBRain.spawnGap) {
    const g = window.BBRain.spawnGap(s.every, lastBurst, Math.random);
    lastBurst = g.burst; spawnT = g.gap;
  } else {
    spawnT = s.every * (0.8 + Math.random()*0.4);
  }
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
      if (misses >= lives) { finish(false); return; }
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

const MIN_PLAY_H = 160;
const blurActive = () => { if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur(); };
const setPlayingClass = on => $('rainApp').classList.toggle('playing', !!on);
const desktopPtr = window.matchMedia ? matchMedia('(hover: hover) and (pointer: fine)') : null;
const padToggle = $('rPadToggle');
function syncPadPref(){
  const hidden = !!(desktopPtr && desktopPtr.matches && BB.store.get('bb_rain_pad', '1') === '0');
  $('rainApp').classList.toggle('pad-off', hidden);
  if (padToggle) {
    padToggle.setAttribute('aria-pressed', String(hidden));
    padToggle.textContent = hidden ? 'Hiện phím ảo' : 'Ẩn phím ảo';
  }
}
function resize(opts = {}){
  const r = cv.getBoundingClientRect();
  if (!r.width || !r.height) return;
  const oldW = W, oldH = H;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = r.width; H = r.height;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  // y tự co giãn theo p; x giữ đúng tỉ lệ ngang rồi kẹp trong màn hình
  // Khung thấp đi thì mặt nước nâng lên: giọt nào giờ đã chạm vạch trượt thì lùi lại ngay trên vạch,
  // để đổi cỡ cửa sổ không bao giờ tự làm mất mạng.
  const pLine = (waterY() - 12 + 30) / (waterY() + 30) - 0.05;
  drops.forEach(d => {
    if (H < oldH && d.p > pLine) d.p = Math.max(0, pLine);
    if (oldW > 0) d.x *= W/oldW;
    const half = d.w/2 + 8;
    d.x = W > 2*half ? Math.max(half, Math.min(W - half, d.x)) : W/2;
  });
  parts = [];
  // Xoay máy hoặc khung chơi đổi dáng giữa ván: tạm dừng để người chơi định thần lại.
  // Xét cả viewport lẫn canvas: ở 320px dọc canvas đã W > H, nên xoay máy không làm canvas đổi dáng.
  // Thêm: canvas vừa tụt xuống dưới MIN_PLAY_H (cửa sổ chia đôi, kéo nhỏ dần) cũng tạm dừng. Đo theo
  // ngưỡng tuyệt đối, không theo tỉ lệ: thanh công cụ Safari/Chrome hiện ra (~60-80 px) không làm dừng ván.
  const land = innerWidth > innerHeight, cl = W > H, shrunk = oldH >= MIN_PLAY_H && H < MIN_PLAY_H;
  if (!opts.keepPlaying && landscape !== null && (land !== landscape || cl !== cvLand || shrunk) && state === 'play') pause();
  landscape = land; cvLand = cl;
  // Đổi cỡ canvas xoá trắng nó; khi vòng lặp đang dừng (tạm dừng) thì tự vẽ lại một khung.
  if (!running && W && window.APP && window.APP.active === 'rain') draw(0);
}
window.addEventListener('resize', () => resize());

function hud(lost){
  const left = Math.max(0, lives - misses);
  $('rLevel').textContent = `Level ${level}`;
  $('rScore').textContent = `✓ ${solved}/${target}`;
  const lv = $('rLives');
  lv.textContent = '💧'.repeat(left) + '·'.repeat(Math.min(lives, misses));
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
  if (!ready()) { pendingStart = L; return; }      // bảng level chưa nạp xong (xem ensureLevels)
  level = Math.max(1, Math.min(lvMax(), L|0 || 1));
  drops = []; fx = []; parts = []; solved = 0; misses = 0; combo = 0; playMs = 0; lastBurst = false;
  input = ''; pendT = 0; renderInput(); cam.reset();
  target = spec(level).target; lives = livesOf(level); spawnT = 0.6;
  syncPadPref();
  showOnly(null);
  blurActive();
  resize(); hud();
  state = 'play';
  setPlayingClass(true);
  // The loop stops itself while paused; a round started from the menu after a pause must restart it.
  if (window.APP && window.APP.active === 'rain') startLoop();
}

function pause(){
  if (state !== 'play') return;
  state = 'paused'; setPlayingClass(false); showOnly('rpaused');
}
function resume(){
  if (state !== 'paused') return;
  showOnly(null); blurActive(); state = 'play'; setPlayingClass(true);
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
  // Màn thở có 4 mạng: rơi 3 giọt vẫn qua, nên "từ 2 giọt" chứ không phải "2 giọt".
  rule.textContent = 'Không để rơi giọt nào: 3 sao. Rơi 1 giọt: 2 sao. Rơi từ 2 giọt mà vẫn qua: 1 sao.';
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
  state = 'result'; passed = win; setPlayingClass(false);
  const stars = starsFor(win, misses);
  const last = win && level >= lvMax();
  if (win && level + 1 > getLv()) setLv(level + 1);
  const rec = BB.record({ game: 'rain', level, won: win, stars, score: solved, ms: playMs });

  ensureResultExtras();
  $('rrTitle').textContent = last ? `Xong cả ${lvMax()} level! 🎉` : win ? `Qua Level ${level}! 🎉` : `Chưa qua Level ${level} 😅`;
  BB.countUp($('rrBig'), 0, solved, { fmt: v => `${v}/${target}` });
  $('rrDetail').textContent = last
    ? (stars < 3 ? 'Bạn đã qua level khó nhất. Chơi lại để lấy đủ 3 sao nhé.' : 'Bạn đã qua level khó nhất với đủ 3 sao.')
    : win ? `Level ${level+1}: ${nextInfo(level)}.`
    : BB.softLoss(level) ? `Còn ${Math.max(1, target - solved)} phép nữa là qua.`
    : `Để rơi xuống nước ${misses} giọt. Giải đủ ${target} phép trước khi hết ${lives} mạng nhé.`;
  BB.lossAid($('rrNext'), { game: 'rain', level, won: win, maxLevel: lvMax(),
    tip: 'Giải giọt <b>thấp nhất</b> trước, giọt đó sắp chạm nước.',
    onSkip: L => startLevel(L) });
  const cue = BB.peakCue($('rrNext'), { game: 'rain', level, won: win, last, maxLevel: lvMax() });
  $('rrNext').textContent = win && !last ? `Level ${level+1}${cue ? ' · thử thách' : ''} →` : `Chơi lại Level ${level}`;
  showOnly('rresult');
  showStars(stars, win);
  $('rrRule').classList.toggle('hidden', !win);   // luật sao chỉ hiện khi qua, như koi và word

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
  // Sao theo khoá ổn định của level (BB.levelKey), như bốn game kia: hôm nay là số level, mai có thể là id.
  const starsAt = L => stars[BB.levelKey ? BB.levelKey('rain', L) : L] || 0;
  grid.innerHTML = '';
  if (!ready()) { if (loadDone) $('rLvTxt').textContent = 'Chưa tải được level. Kiểm tra mạng rồi mở lại.'; return; }
  for (let L=1; L<=lvMax(); L++){
    const el = document.createElement('button');
    const st = starsAt(L), isDone = L <= done;
    el.className = 'lv' + (isDone ? ' done' : '') + (L === chosen ? ' on' : '');
    el.innerHTML = `${L}<small>${spec(L).target} phép</small>` +
      (st ? `<span class="lvst" aria-hidden="true">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>` : '') +
      (BB.isPeak(L, 'rain') ? BB.PEAK_TAG : '');
    el.setAttribute('aria-label', `Level ${L}, ${spec(L).target} phép` + (isDone ? ', đã qua' : '') + (st ? `, ${st} sao` : '') + (BB.isPeak(L, 'rain') ? ', màn thử thách' : ''));
    el.setAttribute('aria-pressed', L === chosen ? 'true' : 'false');
    el.onclick = () => { chosen = L; renderLevels(); BB.sfx('tap'); grid.children[L-1].focus({ preventScroll: true }); };
    grid.appendChild(el);
  }
  $('rLvTxt').textContent = `${levelName(chosen)} · giải ${spec(chosen).target} phép · ${livesOf(chosen)} mạng`;
  $('rStart').textContent = `Chơi Level ${chosen}${BB.isPeak(chosen, 'rain') ? ' · thử thách' : ''}`;
}

function toMenu(){
  pendingStart = null;                                   // về menu là huỷ ván đang chờ bảng level
  clearStarTimers();
  state = 'menu'; setPlayingClass(false); drops = []; fx = []; parts = []; input = ''; pendT = 0; renderInput();
  syncPadPref();
  chosen = Math.min(getLv(), lvMax());
  renderLevels();
  const done = getLv() - 1;
  $('rBestTxt').textContent = done >= lvMax() ? `Đã qua cả ${lvMax()} level` : done ? `Đã qua tới Level ${done}` : '';
  showOnly('rmenu');
  resize(); level = chosen; misses = 0; solved = 0; target = ready() ? spec(chosen).target : 0; lives = ready() ? livesOf(chosen) : LIVES; hud();
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
let kbFlashT = 0;
function flashKey(k){
  const disp = $('rDisp');
  if (disp) { disp.classList.add('kb'); clearTimeout(kbFlashT); kbFlashT = setTimeout(() => disp.classList.remove('kb'), 160); }
  const b = pad.querySelector(`[data-k="${k}"]`); if (!b) return;
  b.classList.add('on'); setTimeout(() => b.classList.remove('on'), 110);
}
if (padToggle) {
  padToggle.addEventListener('click', () => {
    const next = BB.store.get('bb_rain_pad', '1') === '0' ? '1' : '0';
    BB.store.set('bb_rain_pad', next);
    syncPadPref();
    blurActive();
    BB.sfx('tap');
    resize({ keepPlaying: true });
  });
}
if (desktopPtr && desktopPtr.addEventListener) desktopPtr.addEventListener('change', () => { syncPadPref(); resize({ keepPlaying: true }); });
$('rDisp').addEventListener('pointerdown', () => { if (state === 'play') blurActive(); });
syncPadPref();

document.addEventListener('keydown', e => {
  if (!window.APP || window.APP.active !== 'rain' || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (e.isComposing) return;
    if (state === 'play') { e.preventDefault(); pause(); }
    else if (state === 'paused') { e.preventDefault(); resume(); }
    return;
  }
  if (state !== 'play') return;
  const isEnter = e.key === 'Enter' || e.code === 'NumpadEnter';
  if (isEnter) {
    // Enter trên một nút đang hiện và focus (phím số, nút tạm dừng, nút ẩn phím) để nút đó tự xử lý qua click.
    const btn = e.target && e.target.closest && e.target.closest('#rainApp button');
    if (btn && btn.getClientRects().length > 0) return;
    if (e.isComposing || e.keyCode === 229) return;
  }
  if (e.isComposing) return;
  const mNum = /^Numpad(\d)$/.exec(e.code);
  const mDig = !e.shiftKey ? /^Digit(\d)$/.exec(e.code) : null;
  const k = /^[0-9]$/.test(e.key) ? e.key : mNum ? mNum[1] : mDig ? mDig[1]
    : (e.key === 'Backspace' || e.key === 'Delete') ? 'del'
    : isEnter ? 'ok' : null;
  if (!k) return;
  e.preventDefault();
  if (e.repeat && k !== 'del') return;
  flashKey(k); press(k);
});
$('rStart').onclick = () => startLevel(chosen);
$('rrNext').onclick = () => startLevel(passed && level < lvMax() ? level + 1 : level);
$('rrMenu').onclick = toMenu;
$('rPause').onclick = pause;
$('rResume').onclick = resume;
$('rQuit').onclick = toMenu;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && window.APP && window.APP.active === 'rain') pause();
});
BB.onLeave('rain', () => { pendingStart = null; pause(); clearStarTimers(); });

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
window.__rainDebug = () => ({ state, level, misses, lives, solved, target, input, combo, pendT, W, H,
  drops: drops.map(d => ({ ans: d.ans, eq: d.eq, x: d.x, y: dropY(d), p: d.p, w: d.w })) });
window.__rainTest = { makeEq: L => makeEq(L).slice(0, 2), spec, nextInfo, starsFor, livesOf, lvMax,
  get LVINFO(){ return Array.from({ length: lvMax() + 1 }, (_, L) => (L ? { name: levelName(L) } : null)); },
  spawnDrop: (ans, p = 0.5, eq = `? = ${ans}`, w = 78) => {
  drops.push({ x: W/2, p, fall: spec(level).fall, eq, ans, w }); }, starTimers: () => starTimers.length };
}
ensureLevels();
if (window.APP && window.APP.active === 'rain') startLoop();
})();
