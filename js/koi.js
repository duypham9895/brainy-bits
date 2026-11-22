// ======================= GAME CÁ KOI =======================
(() => {
const $ = id => document.getElementById(id);
const cv = $('kcv'), ctx = cv.getContext('2d');
const bg = document.createElement('canvas');
let W = 0, H = 0, dpr = 1;
const BB = window.BB;
// Tham số level lấy từ engine độ khó chung (js/difficulty.js + js/levels/koi.js, bảng v2): L1..30 viết tay
// theo đường răng cưa chung, L31+ do engine sinh, cả 30 màn đã calibrate bằng bot. Trang chưa nạp BBD
// thì game quay về 10 level cũ (bảng v1), không bao giờ hỏng.
const BBD = window.BBD && window.BBD.games().includes('koi') ? window.BBD : null;
const LV_MAX = BBD ? BB.setLvMax('koi', BBD.maxLevel('koi')) : BB.LV_MAX.koi;   // 30 | 10; qua level cuối là xong game
let state = 'menu';            // menu | play | pondEnd | result | done | paused
let resumeTo = 'play';         // state trước khi tạm dừng (play hoặc pondEnd)
let diff = 1, streak = 0;
let fish = [], pellets = 0, pelletsMax = 0, cooldown = 0, cdMax = 1, turnMul = 1;
let pondCorrect = 0, pondMistakes = 0, pondKoi = 0, endTimer = 0;
let lastFeedAt = 0;   // lúc khoá vòng gần nhất: chạm đúp vô tình trong 300ms không tính là chạm sớm
let earlyTaps = 0, playMs = 0; // chạm cá khi vòng chưa đầy (mất sao thứ 3) · thời gian chơi thật
let fx = [], ripples = [], drops = [], dialShake = 0, dialPulse = 0, lastT = 0;
let seed = 1, running = false, timers = [];
const shakeCam = BB.trauma(7);

// koi_lv2 = level kế tiếp chưa qua (giữ key cũ để không ai mất tiến độ), kẹp 1..LV_MAX+1.
function getLv(){ return BB.store.num('koi_lv2', 1, 1, LV_MAX + 1); }
function setLv(v){ BB.store.set('koi_lv2', Math.min(LV_MAX + 1, Math.max(1, v))); }
// koi_best = level cao nhất đã qua (OPS-4: trước đây key này không bao giờ được ghi).
function getBest(){ return Math.max(BB.store.num('koi_best', 0, 0, LV_MAX), getLv() - 1); }
function setBest(v){ if (v > BB.store.num('koi_best', 0, 0, LV_MAX)) BB.store.set('koi_best', Math.min(LV_MAX, v)); }

// Một lần lúc tải: kẹp key cũ đã vượt trần (11, 12...) và đồng bộ hai chiều với bb_stats.
(function migrate(){
  // Bảng màn đổi phiên bản (v1 → v2): engine ghi cờ bb_tablev_koi, giữ nguyên best và sao theo số level.
  // Chạy trước mọi lần đọc gameStats; chạy lại không đổi gì, dữ liệu hỏng không làm sập game.
  BB.migrateProgress('koi');
  // Bản 10 level cũ từng ghi koi_lv2 = 12, 13... do lỗi (OPS-4). Từ khi có level 11+, mỗi lần qua level
  // đều ghi bb_stats.best, nên key vượt 11 mà không có best tương ứng là key lỗi: kẹp như bản cũ.
  const top = (BBD ? BBD.spec('koi').legacy.length : LV_MAX) + 1;   // 11
  const stored = BB.store.num('koi_lv2', 1), best = BB.gameStats('koi').best;
  if (stored > top && stored > best + 1) BB.store.set('koi_lv2', Math.max(top, Math.min(LV_MAX + 1, best + 1)));
  if (BB.store.num('koi_lv2', 1) > LV_MAX + 1) BB.store.set('koi_lv2', LV_MAX + 1);
  const legacy = getLv() - 1, s = BB.gameStats('koi');
  if (legacy > s.best) {
    const all = BB.stats(); all.koi = all.koi || { best: 0, stars: {} };
    all.koi.best = legacy; BB.store.setJson('bb_stats', all);
  } else if (s.best > legacy) setLv(s.best + 1);
  setBest(Math.max(legacy, s.best));
})();

const beep = BB.tone;          // cùng chữ ký beep() cũ, dùng chung một AudioContext (KOI-05)
const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const wrapAng = a => { while (a > Math.PI) a -= Math.PI*2; while (a < -Math.PI) a += Math.PI*2; return a; };

// độ khó theo cấp. Công thức cũ chỉ còn dùng khi trang không có BBD (bằng BBD.level ở L1..10).
function legacyParams(d){
  return {
    koi: Math.min(5 + d, 15),            // bảng v1: cấp 1 = 6 con, cấp 10 = 15 con
    cd: Math.min(1.3 + 0.15*d, 3.2),     // thời gian chờ giữa 2 lần cho ăn
    decoys: d >= 3 ? Math.min(1 + ((d-3)/2|0), 4) : 0,
    spdMul: 1, turnMul: 1, legacy: true,
  };
}
// spdMul nhân tốc độ bơi, turnMul làm cá đổi hướng thường hơn (chỉ có ở level mới).
function params(d){
  if (!BBD) return legacyParams(d);
  const r = BBD.level('koi', Math.max(1, d | 0));
  return { koi: r.koi, cd: r.cd, decoys: r.decoys, spdMul: r.spdMul || 1, turnMul: r.turnMul || 1, legacy: r.legacy };
}

// Canvas kéo tới đáy màn hình: trên iPhone, vòng hẹn giờ và hàng hạt phải nằm trên thanh Home.
let SB = 0;
function safeBottom(){
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;visibility:hidden;padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(p);
  const v = parseFloat(getComputedStyle(p).paddingBottom) || 0;
  p.remove();
  return v;
}

// vùng cá bơi (chừa chỗ cho vòng hẹn giờ ở dưới)
const area = () => ({ x0: 8, y0: 8, x1: W - 8, y1: H - 96 - SB });
const fishLen = () => Math.max(34, Math.min(60, Math.min(W, H) * 0.13)) * (fish.length > 11 || params(diff).koi > 11 ? 0.85 : 1);

// ---------- tạo hồ ----------
function setupPond(){
  const p = params(diff);
  seed = (Math.random()*1e9)|0;
  fish = []; fx = []; ripples = []; drops = [];
  const L = fishLen(), A = area();
  const mk = (decoy) => ({
    x: A.x0 + L + Math.random()*(A.x1 - A.x0 - 2*L),
    y: A.y0 + L + Math.random()*(A.y1 - A.y0 - 2*L),
    ang: Math.random()*Math.PI*2, turn: 0, turnTarget: 0, turnT: 0,
    spd: ((decoy ? 24 : 30) + Math.random()*12) * p.spdMul, boost: 0,
    phase: Math.random()*10, decoy, fed: false, L: decoy ? L*1.05 : L,
  });
  for (let i=0;i<p.decoys;i++) fish.push(mk(true));
  for (let i=0;i<p.koi;i++) fish.push(mk(false));
  pondKoi = p.koi; pellets = pelletsMax = p.koi;
  cdMax = p.cd; cooldown = 0; turnMul = p.turnMul;
  pondCorrect = 0; pondMistakes = 0; endTimer = 0;
  earlyTaps = 0; playMs = 0; streak = 0; dialPulse = 0; shakeCam.reset();
  buildStatic();
  updateHud();
}

// ---------- nền hồ ----------
function buildStatic(){
  if (!W) return;
  bg.width = cv.width; bg.height = cv.height;
  const g = bg.getContext('2d');
  g.setTransform(dpr,0,0,dpr,0,0);
  const rnd = mulberry32(seed);
  const grd = g.createRadialGradient(W/2, H*0.42, 30, W/2, H*0.45, Math.max(W,H)*0.8);
  grd.addColorStop(0, '#16655d'); grd.addColorStop(1, '#093431');
  g.fillStyle = grd; g.fillRect(0,0,W,H);
  // đốm sáng nhẹ dưới nước
  for (let i=0;i<W*H/2500;i++){
    g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,.025)' : 'rgba(0,0,0,.05)';
    g.beginPath(); g.arc(rnd()*W, rnd()*H, 2 + rnd()*10, 0, Math.PI*2); g.fill();
  }
  // lá sen ở góc
  const pads = [[-10, 30, 70],[W+10, H*0.45, 64],[20, H-150, 54],[W-30, 40, 42]];
  pads.forEach(([x,y,r], i) => {
    r *= Math.min(1.2, W/390);
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.arc(x+4, y+6, r, 0, Math.PI*2); g.fill();
    const a0 = rnd()*Math.PI*2;
    g.fillStyle = i % 2 ? '#1f9e7f' : '#26b58f';
    g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a0 + 0.35, a0 + Math.PI*2 - 0.35); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(0,60,40,.35)'; g.lineWidth = 1.5;
    for (let k=1;k<7;k++){ const a = a0 + 0.35 + k*(Math.PI*2-0.7)/7; g.beginPath(); g.moveTo(x,y); g.lineTo(x+Math.cos(a)*r*0.9, y+Math.sin(a)*r*0.9); g.stroke(); }
  });
  // bông sen nhỏ
  const fl = [W*0.12, H-170];
  for (let k=0;k<6;k++){
    const a = k*Math.PI/3;
    g.fillStyle = k%2 ? '#ffd1dc' : '#ffb3c6';
    g.beginPath(); g.ellipse(fl[0]+Math.cos(a)*8, fl[1]+Math.sin(a)*8, 9, 5, a, 0, Math.PI*2); g.fill();
  }
  g.fillStyle = '#ffe680'; g.beginPath(); g.arc(fl[0], fl[1], 4, 0, Math.PI*2); g.fill();
  // cỏ nước ở mép
  g.fillStyle = 'rgba(8,60,50,.85)';
  for (let i=0;i<9;i++){
    const x = rnd() < 0.5 ? rnd()*40 : W - rnd()*40, y = 60 + rnd()*(H-220), s = 10 + rnd()*12;
    for (let k=0;k<4;k++){ g.beginPath(); g.ellipse(x + (k-1.5)*s*0.5, y - k*s*0.3, s*0.35, s*0.9, (k-1.5)*0.3, 0, Math.PI*2); g.fill(); }
  }
  // khay thức ăn phía dưới
  const by = H - 92 - SB;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, by, W, 92 + SB);
  g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(0, by, W, 1);
}

// ---------- vẽ cá ----------
function drawFish(f){
  const L = f.L, wid = L*0.34;
  const wig = Math.sin(f.phase) * 0.32;
  ctx.save();
  ctx.translate(f.x, f.y); ctx.rotate(f.ang);
  // bóng
  ctx.fillStyle = 'rgba(0,0,0,.22)';
  ctx.beginPath(); ctx.ellipse(-L*0.02 + 5, 7, L*0.5, wid*0.55, 0, 0, Math.PI*2); ctx.fill();
  const body = f.decoy ? '#2f4a46' : '#fff2e6';
  const accent = f.decoy ? '#22383a' : '#ff6a3d';
  const fin = f.decoy ? 'rgba(40,70,66,.85)' : 'rgba(255,170,120,.85)';
  // đuôi
  ctx.save(); ctx.translate(-L*0.38, 0); ctx.rotate(wig);
  ctx.fillStyle = fin;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-L*0.22, -wid*0.9, -L*0.34, -wid*0.75);
  ctx.quadraticCurveTo(-L*0.24, 0, -L*0.34, wid*0.75);
  ctx.quadraticCurveTo(-L*0.22, wid*0.9, 0, 0);
  ctx.fill();
  ctx.restore();
  // vây ngực
  const flap = Math.sin(f.phase*0.8) * 0.25;
  ctx.fillStyle = fin;
  [-1, 1].forEach(sd => {
    ctx.save(); ctx.translate(L*0.12, sd*wid*0.38); ctx.rotate(sd*(0.9 + flap));
    ctx.beginPath(); ctx.ellipse(-L*0.06, 0, L*0.13, wid*0.22, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  });
  // thân (hơi cong theo nhịp đuôi)
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(L*0.46, 0);
  ctx.bezierCurveTo(L*0.42, -wid*0.62, L*0.05, -wid*0.62, -L*0.18, -wid*0.38 + wig*wid*0.4);
  ctx.quadraticCurveTo(-L*0.36, -wid*0.18 + wig*wid*0.6, -L*0.42, wig*wid*0.7);
  ctx.quadraticCurveTo(-L*0.36, wid*0.18 + wig*wid*0.6, -L*0.18, wid*0.38 + wig*wid*0.4);
  ctx.bezierCurveTo(L*0.05, wid*0.62, L*0.42, wid*0.62, L*0.46, 0);
  ctx.closePath();
  ctx.fill();
  // đốm koi (giống hệt nhau ở mọi con)
  ctx.save(); ctx.clip();
  ctx.fillStyle = accent;
  if (f.decoy) {
    ctx.fillRect(-L*0.5, -wid*0.12, L, wid*0.24);
  } else {
    ctx.beginPath(); ctx.ellipse(L*0.3, 0, L*0.14, wid*0.36, 0, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(L*0.02, -wid*0.18, L*0.15, wid*0.3, 0.3, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-L*0.2, wid*0.15, L*0.1, wid*0.24, -0.4, 0, Math.PI*2); ctx.fill();
  }
  ctx.restore();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.stroke();
  // mắt
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(L*0.36, -wid*0.2, 1.9, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(L*0.36, wid*0.2, 1.9, 0, Math.PI*2); ctx.fill();
  if (f.decoy) { // râu cá xám
    ctx.strokeStyle = 'rgba(30,50,48,.9)'; ctx.lineWidth = 1.3;
    [-1,1].forEach(sd => { ctx.beginPath(); ctx.moveTo(L*0.44, sd*wid*0.12); ctx.quadraticCurveTo(L*0.58, sd*wid*0.3, L*0.6, sd*wid*0.65); ctx.stroke(); });
  }
  ctx.restore();
}

// ---------- vòng hẹn giờ + hạt thức ăn ----------
function drawDial(){
  const sx = dialShake > 0 && !BB.motion.reduced ? Math.sin(dialShake*60) * 6 * dialShake/0.3 : 0;
  // vòng vừa đầy: nảy nhẹ (giảm chuyển động thì chỉ sáng viền, không đổi kích thước)
  const pk = dialPulse > 0 ? dialPulse/0.3 : 0;
  const cx = W/2 + sx, cy = H - 56 - SB, R = 24 * (BB.motion.reduced ? 1 : 1 + 0.12*Math.sin(pk*Math.PI));
  ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(cx, cy+2, R+6, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = '#e9f5f0'; ctx.beginPath(); ctx.arc(cx, cy, R+4, 0, Math.PI*2); ctx.fill();
  if (cooldown > 0) {
    const k = 1 - cooldown/cdMax;
    ctx.fillStyle = '#ffd9bf'; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, -Math.PI/2, -Math.PI/2 + k*Math.PI*2); ctx.closePath(); ctx.fill();
  } else {
    const g = ctx.createRadialGradient(cx-6, cy-6, 2, cx, cy, R);
    g.addColorStop(0, '#ffc46b'); g.addColorStop(1, '#ff7a2e');
    ctx.fillStyle = pellets > 0 ? g : '#9fb5ad';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI*2); ctx.fill();
    if (pk > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.8*pk})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(cx, cy, R + 4, 0, Math.PI*2); ctx.stroke();
    }
  }
  // hàng chấm = số hạt còn lại
  const n = pelletsMax, gap = Math.min(16, (W-40)/Math.max(1,n));
  const x0 = W/2 - gap*(n-1)/2;
  for (let i=0;i<n;i++){
    ctx.fillStyle = i < pellets ? '#ffffff' : 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.arc(x0 + i*gap, H - 16 - SB, 4.5, 0, Math.PI*2); ctx.fill();
  }
}

// ---------- cập nhật ----------
function updateFish(dt){
  const A = area(), cx = (A.x0+A.x1)/2, cy = (A.y0+A.y1)/2;
  fish.forEach(f => {
    f.turnT -= dt;
    if (f.turnT <= 0) { f.turnTarget = (Math.random()-0.5)*1.6; f.turnT = (1 + Math.random()*2) / turnMul; }
    f.turn += (f.turnTarget - f.turn) * Math.min(1, dt*1.5);
    const m = f.L * 0.9;
    if (f.x < A.x0+m || f.x > A.x1-m || f.y < A.y0+m || f.y > A.y1-m) {
      const want = Math.atan2(cy - f.y, cx - f.x);
      f.turn = wrapAng(want - f.ang) * 2.2;
    }
    f.ang = wrapAng(f.ang + f.turn*dt);
    const sp = f.spd + f.boost;
    f.boost = Math.max(0, f.boost - dt*60);
    f.x += Math.cos(f.ang)*sp*dt; f.y += Math.sin(f.ang)*sp*dt;
    f.x = Math.max(A.x0, Math.min(A.x1, f.x)); f.y = Math.max(A.y0, Math.min(A.y1, f.y));
    f.phase += dt*(5 + sp*0.06);
  });
}

function update(dt){
  if (BB.frozen()) return;
  updateFish(dt);
  if (state === 'play') playMs += dt*1000;
  if (cooldown > 0) {
    cooldown = Math.max(0, cooldown - dt);
    // vòng vừa đầy lại: tiếng tích nhỏ báo "cho ăn được rồi"
    if (cooldown === 0 && state === 'play' && pellets > 0) { BB.sfx('tick'); dialPulse = 0.3; }
  }
  if (dialShake > 0) dialShake = Math.max(0, dialShake - dt);
  if (dialPulse > 0) dialPulse = Math.max(0, dialPulse - dt);
  fx.forEach(e => e.t += dt); fx = fx.filter(e => e.t < 0.8);
  ripples.forEach(r => r.t += dt); ripples = ripples.filter(r => r.t < (r.soft ? 0.45 : 0.7));
  drops.forEach(p => { p.t += dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vx *= 1 - dt*3; p.vy *= 1 - dt*3; });
  drops = drops.filter(p => p.t < p.life);
  if (state === 'pondEnd') { endTimer -= dt; if (endTimer <= 0) pondResult(); }
}

// ---------- chạm ----------
// Vùng chạm bám theo thân cá (KOI-07): ellipse lệch về phía đầu, nhỏ hơn bản cũ (0.62L × 0.4L)
// nhưng không dưới 48 × 44 px cho ngón tay (sàn a ≥ 24, b ≥ 22: cá co 0.85× ở màn 12+ cá vẫn chạm được
// ở màn hình 320 px). Nhiều con chồng nhau thì con có tâm gần nhất thắng.
function fishAt(x, y){
  let hit = null, best = Infinity;
  for (let i = fish.length-1; i >= 0; i--){
    const f = fish[i];
    const dx = x - f.x, dy = y - f.y;
    const lx = dx*Math.cos(-f.ang) - dy*Math.sin(-f.ang), ly = dx*Math.sin(-f.ang) + dy*Math.cos(-f.ang);
    const a = Math.max(f.L*0.52, 24), b = Math.max(f.L*0.32, 22);
    const d = ((lx - f.L*0.04)/a)**2 + (ly/b)**2;
    if (d <= 1 && d < best) { best = d; hit = f; }
  }
  return hit;
}

function splash(f){
  ripples.push({ x: f.x, y: f.y, t: 0 });
  if (BB.motion.reduced) return;
  ripples.push({ x: f.x, y: f.y, t: -0.12 });
  for (let i = 0; i < 10; i++){
    const a = Math.random()*Math.PI*2, s = 50 + Math.random()*70;
    drops.push({ x: f.x, y: f.y, vx: Math.cos(a)*s, vy: Math.sin(a)*s, t: 0, life: 0.35 + Math.random()*0.25, r: 1.5 + Math.random()*2 });
  }
}

function mistake(f){
  pondMistakes++; streak = 0;
  fx.push({ f, ok: false, t: 0 });
  BB.sfx('wrong'); BB.haptic('error');
  shakeCam.add(0.55); BB.shake($('kLevel'));
  if (pondMistakes > 1 && state === 'play') { state = 'pondEnd'; endTimer = 0.9; } // đã chắc trượt (KOI-03)
}

cv.addEventListener('pointerdown', ev => {
  if (state !== 'play') return;
  if (!ev.isPrimary || ev.button > 0) return;      // bỏ ngón thứ hai và chuột phải
  ev.preventDefault();
  const rect = cv.getBoundingClientRect();
  const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  const hit = fishAt(x, y);
  if (!hit) { ripples.push({ x, y, t: 0, soft: true }); return; }  // chạm trượt: gợn nước mờ
  if (cooldown > 0) { if (performance.now() - lastFeedAt > 300) earlyTaps++; dialShake = 0.3; beep(200, 0.08, 'square', 0.03); return; }
  cooldown = cdMax; lastFeedAt = performance.now(); // cá xám cũng khoá vòng như một lần cho ăn (KOI-02)
  if (hit.decoy) {
    hit.boost = 50;
    mistake(hit);
    updateHud();
    return;
  }
  pellets--;
  if (!hit.fed) {
    splash(hit);
    hit.fed = true; pondCorrect++; streak++;
    fx.push({ f: hit, ok: true, t: 0 });
    hit.boost = 45;
    BB.sfx('pop', { combo: streak - 1 });            // cho ăn đúng liên tiếp: cao dần một nửa cung
    BB.haptic('tap'); BB.pop($('kScore'));
  } else {
    ripples.push({ x: hit.x, y: hit.y, t: 0 });     // nhầm: chỉ một gợn, không bắn nước như lúc cho ăn
    mistake(hit);
  }
  updateHud();
  if (pellets <= 0 && state === 'play') { state = 'pondEnd'; endTimer = 0.9; }
});

// ---------- vẽ ----------
function draw(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if (!W) return;
  ctx.drawImage(bg, 0, 0, W, H);
  // rung khi nhầm: chỉ lớp nước + cá, nền và khay giữ yên (camX/camY = 0 khi giảm chuyển động)
  ctx.setTransform(dpr,0,0,dpr,camX*dpr,camY*dpr);
  ripples.forEach(r => {
    if (r.t < 0) return;
    if (r.soft) {                                    // chạm trượt: gợn mờ, nhỏ
      const k = r.t/0.45;
      ctx.strokeStyle = `rgba(255,255,255,${0.28*(1-k)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(r.x, r.y, BB.motion.reduced ? 14 : 5 + k*16, 0, Math.PI*2); ctx.stroke();
      return;
    }
    const k = r.t/0.7;
    ctx.strokeStyle = `rgba(255,255,255,${0.5*(1-k)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, BB.motion.reduced ? 22 : 6 + k*34, 0, Math.PI*2); ctx.stroke();
    if (k < 0.4) { ctx.fillStyle = `rgba(255,190,110,${1-k/0.4})`; ctx.beginPath(); ctx.arc(r.x, r.y, 4, 0, Math.PI*2); ctx.fill(); }
  });
  drops.forEach(p => {
    ctx.fillStyle = `rgba(220,250,245,${0.85*(1 - p.t/p.life)})`;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
  });
  fish.filter(f => f.decoy).forEach(drawFish);
  fish.filter(f => !f.decoy).forEach(drawFish);
  // bong bóng ✓ / ✗ đi theo cá
  fx.forEach(e => {
    const k = e.t/0.8, x = e.f.x, y = e.f.y - e.f.L*0.6 - 14;
    ctx.globalAlpha = k < 0.75 ? 1 : 1 - (k-0.75)/0.25;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(x+1.5, y+2.5, 15, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x-5, y+12); ctx.lineTo(x, y+20); ctx.lineTo(x+5, y+12); ctx.fill();
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = e.ok ? '#2fb85a' : '#e5484d';
    ctx.beginPath();
    if (e.ok) { ctx.moveTo(x-6, y); ctx.lineTo(x-1.5, y+5); ctx.lineTo(x+7, y-5); }
    else { ctx.moveTo(x-5, y-5); ctx.lineTo(x+5, y+5); ctx.moveTo(x+5, y-5); ctx.lineTo(x-5, y+5); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  });
  ctx.setTransform(dpr,0,0,dpr,0,0);
  drawDial();
}

function loop(ts){
  const dt = Math.min(0.05, (ts - lastT)/1000 || 0);
  lastT = ts;
  // Chỉ chạy khi đang ở game Koi; koiEnter() khởi động lại vòng lặp.
  if (!(window.APP && window.APP.active === 'koi')) { running = false; return; }
  if (state === 'play' || state === 'pondEnd') update(dt);
  else if (state !== 'paused') updateFish(dt);
  const o = state === 'paused' ? { x: 0, y: 0 } : shakeCam.offset(dt);
  camX = o.x; camY = o.y;
  draw();
  // Tạm dừng: vẽ xong khung đứng yên này rồi tắt vòng lặp; nút Chơi tiếp / Về menu bật lại.
  if (state === 'paused') { running = false; return; }
  requestAnimationFrame(loop);
}
let camX = 0, camY = 0;
function startLoop(){ if (running) return; running = true; lastT = performance.now(); requestAnimationFrame(loop); }

// ---------- kích thước ----------
function resize(){
  const rect = cv.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = rect.width; H = rect.height;
  SB = safeBottom();
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  buildStatic();
  const A = area();
  fish.forEach(f => { f.x = Math.max(A.x0, Math.min(A.x1, f.x)); f.y = Math.max(A.y0, Math.min(A.y1, f.y)); });
  if (!running) draw();          // đang tạm dừng (vòng lặp tắt): đổi cỡ canvas xoá hình, vẽ lại một khung
}
window.addEventListener('resize', () => { if (window.APP && window.APP.active === 'koi') resize(); });

// ---------- luồng chơi ----------
function show(id, on){ $(id).classList.toggle('hidden', !on); }
function updateHud(){
  $('kPond').textContent = `Level ${diff} · ${pondKoi || params(diff).koi} cá`;
  $('kScore').textContent = `✓ ${pondCorrect}/${pondKoi || params(diff).koi}`;
  $('kLevel').textContent = `Nhầm ${pondMistakes}/1`;
}

// Sao 0..3, một luật cho mọi level:
//   0 = chưa qua (nhầm từ 2 lần) · 1 = qua, nhầm 1 lần · 2 = không nhầm
//   3 = không nhầm và không chạm cá lúc vòng hẹn giờ chưa đầy
function starsFor(passed){ return !passed ? 0 : pondMistakes ? 1 : earlyTaps ? 2 : 3; }
const STAR_HINT = [
  '',
  'Không nhầm lần nào sẽ được 2 sao.',
  'Chờ vòng đầy rồi mới chạm là được 3 sao.',
  'Đủ 3 sao: không nhầm, không chạm vội.',
];
const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);

// Thêm hàng sao và dòng luật sao vào thẻ kết quả (markup thuộc index.html, tạo bằng JS).
const krStars = document.createElement('div');
krStars.className = 'stars'; krStars.id = 'krStars';
krStars.innerHTML = '<span class="s">★</span><span class="s">★</span><span class="s">★</span>';
$('krTitle').after(krStars);
const krRule = document.createElement('p');
krRule.className = 'muted'; krRule.id = 'krRule';
$('krDetail').after(krRule);
cv.setAttribute('role', 'img');
cv.setAttribute('aria-label', 'Hồ cá koi. Chạm vào cá koi chưa ăn để cho ăn.');

function paintStars(box, n, animate){
  const ss = box.querySelectorAll('.s');
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', `${n} trên 3 sao`);
  ss.forEach(s => s.classList.remove('on'));
  ss.forEach((s, i) => {
    if (i >= n) return;
    if (!animate || BB.motion.reduced) { s.classList.add('on'); return; }
    later(() => { s.classList.add('on'); BB.pop(s, 1.35); BB.sfx('star', { combo: i * 2 }); }, 260 + i * 220);
  });
}

const KLV_COUNT = LV_MAX;      // level thường thêm cá hoặc tăng tốc, màn khó thêm cá xám, màn thở bớt cá
// Sao của cả game: đọc bb_stats một lần rồi tra theo khoá level (thay vì BB.starsAt parse lại mỗi ô).
function koiStars(){ const s = BB.gameStats('koi').stars; return lv => s[BB.levelKey('koi', lv)] || 0; }
// Hướng dẫn ở menu đọc từ bảng level, nên đổi bảng thì chữ vẫn đúng. Không có engine (bảng v1) thì giữ chữ trong HTML.
function renderKHow(){
  if (!BBD) return;
  const rows = document.querySelectorAll('#kmenu .how > div > span:last-child');
  if (rows.length < 3) return;
  let grey = 0;
  for (let lv = 1; lv <= LV_MAX && !grey; lv++) if (params(lv).decoys) grey = lv;
  rows[1].innerHTML = 'Chờ <b>vòng hẹn giờ</b> ở dưới đầy lại mới chạm tiếp.' +
    (grey ? ` Từ level ${grey} có <b>cá xám</b> bơi lẫn, đừng chạm vào.` : '');
  let peak = 0;                                    // màn khó đầu tiên (L10 từ 2026-11-21, không còn ở L5)
  for (let lv = 1; lv <= LV_MAX && !peak; lv++) if (BBD.level('koi', lv).kind === 'peak') peak = lv;
  rows[2].innerHTML = `Nhầm <b>tối đa 1 lần</b> là qua hồ. Level 1 có ${params(1).koi} cá koi. Cá đông dần rồi bơi nhanh dần.` +
    (peak ? ` Từ level ${peak}, cứ 5 level có một màn khó, ngay sau là một màn nhẹ.` : '');
}
let chosenK = 1, kPassed = false;
function renderKLevels(){
  const b = getLv() - 1, grid = $('klvgrid');   // koi_lv2 lưu level kế tiếp chưa qua
  grid.innerHTML = '';
  const starsOf = koiStars();
  for (let lv = 1; lv <= KLV_COUNT; lv++){
    const el = document.createElement('button');
    const n = starsOf(lv), done = lv <= b;
    el.className = 'lv' + (done ? ' done' : '') + (lv === chosenK ? ' on' : '');
    el.setAttribute('aria-pressed', lv === chosenK ? 'true' : 'false');
    el.setAttribute('aria-label', `Level ${lv}, ${params(lv).koi} cá${done ? ', đã qua' : ''}${n ? `, ${n} sao` : ''}`);
    el.innerHTML = `${lv}<small>${params(lv).koi} cá</small>` + (n ? `<span class="kst" aria-hidden="true">${starStr(n)}</span>` : '');
    el.onclick = () => { chosenK = lv; if (state === 'menu') { diff = lv; updateHud(); } renderKLevels(); BB.sfx('key'); };
    grid.appendChild(el);
  }
  const p = params(chosenK);
  $('kLevelTxt').textContent = `${p.koi} cá koi${p.decoys ? ` + ${p.decoys} cá xám` : ''} · chờ ${cdTxt(p)} giây giữa 2 lần cho ăn${moveTxt(p)}`;
  $('kStartBtn').textContent = `Chơi Level ${chosenK} · ${p.koi} cá`;
}

// Level mới: nói cá bơi nhanh / đổi hướng thế nào, ngắn gọn. Level cũ (×1) không thêm chữ.
const mulTxt = v => `×${String(+v.toFixed(2)).replace('.', ',')}`;
// Bảng engine in đủ 2 chữ số để 2,05 / 2,95 không bị làm tròn. Bản dự phòng không có BBD giữ chữ cũ (1 chữ số).
const cdTxt = p => (!p.legacy ? String(+p.cd.toFixed(2)) : p.cd.toFixed(1)).replace('.', ',');
function moveTxt(p){
  const parts = [];
  if (p.spdMul > 1) parts.push(`cá bơi nhanh ${mulTxt(p.spdMul)}`);
  if (p.turnMul > 1) parts.push(`đổi hướng ${mulTxt(p.turnMul)}`);
  return parts.length ? ' · ' + parts.join(', ') : '';
}

function startKoiLevel(lv){
  clearTimers();
  diff = Math.min(LV_MAX, Math.max(1, lv | 0));
  ['kmenu','kresult','kdone','kpaused'].forEach(id => show(id, false));
  setupPond();
  state = 'play';
  updateHud();
  if (window.APP && window.APP.active === 'koi') startLoop();
}

function pondResult(){
  state = 'result';
  kPassed = pondMistakes <= 1;
  const stars = starsFor(kPassed);
  const last = diff >= LV_MAX;
  if (kPassed && diff + 1 > getLv()) setLv(diff + 1);
  if (kPassed) setBest(diff);
  const rec = BB.record({ game: 'koi', level: diff, won: kPassed, stars, score: pondCorrect, ms: playMs });

  $('krTitle').textContent = kPassed ? `Qua Level ${diff}! 🎉` : `Chưa qua Level ${diff} 😅`;
  BB.countUp($('krBig'), 0, pondCorrect, { dur: 600, fmt: v => `${v}/${pondKoi}` });
  const parts = [`Cho ăn đúng ${pondCorrect}/${pondKoi} con cá koi.`];
  parts.push(pondMistakes ? `Nhầm ${pondMistakes} lần.` : 'Không nhầm lần nào!');
  if (!kPassed) parts.push(pellets > 0 ? 'Nhầm 2 lần nên hồ dừng sớm. Chỉ được nhầm 1 lần.' : 'Chỉ được nhầm tối đa 1 lần để qua level.');
  $('krDetail').textContent = parts.join(' ');
  krStars.classList.toggle('hidden', !kPassed);
  paintStars(krStars, stars, true);
  krRule.textContent = kPassed ? STAR_HINT[stars] : '';
  krRule.classList.toggle('hidden', !kPassed);
  if (kPassed && last) $('krNext').textContent = 'Xem tổng kết →';
  else $('krNext').textContent = kPassed ? `Level ${diff+1} · ${params(diff+1).koi} cá →` : `Chơi lại Level ${diff}`;
  show('kresult', true);
  updateHud();

  if (kPassed) {
    BB.sfx('levelUp'); BB.haptic('success');
    if (stars === 3 || rec.newBest || rec.dailyDone) later(() => BB.celebrate(), 300);
  } else { BB.sfx('fail'); BB.haptic('error'); }
  if (rec.newBest) BB.toast(`Kỷ lục mới: qua Level ${diff}`);
  else if (rec.newStars && stars > 1) BB.toast(`Level ${diff} giờ có ${stars} sao`);
  if (rec.dailyDone) BB.toast('Xong thử thách hôm nay');
  if (rec.streakUp && rec.streak > 1) BB.toast(`Chuỗi ${rec.streak} ngày liền`);
}

// Ghi số + nhãn cho một ô thống kê, không dựa vào nextSibling (markup có thể có khoảng trắng hoặc <span>).
// Nhãn có dấu cách đầu để textContent đọc "10 level đã qua", không dính "10level" (<b> là block nên mắt không thấy).
function statCell(id, val, label){
  const b = $(id), cell = b.parentNode;
  b.textContent = val;
  cell.replaceChildren(b, document.createTextNode(' ' + label));
}

// Màn xong game: dùng lại #kdone (trước là "Hoàn thành 5 hồ", không bao giờ hiện).
function showDone(){
  state = 'done';
  clearTimers();
  let total = 0, full = 0;
  const starsOf = koiStars();
  for (let lv = 1; lv <= LV_MAX; lv++) { const n = starsOf(lv); total += n; if (n === 3) full++; }
  $('kdone').querySelector('h2').textContent = `Xong cả ${LV_MAX} level! 🎉`;
  paintStars($('kdStars'), Math.round(total / LV_MAX), false);
  $('kdStars').setAttribute('aria-label', `${total} trên ${LV_MAX * 3} sao`);
  $('kdScore').textContent = `${total}/${LV_MAX * 3}`;
  statCell('kdAcc', full, 'level đủ 3 sao');
  statCell('kdLevel', LV_MAX, 'level đã qua');
  $('kdNote').textContent = total < LV_MAX * 3
    ? 'Level nào chưa đủ 3 sao thì chơi lại để gom tiếp.'
    : `Đủ ${LV_MAX * 3} sao, level nào cũng 3 sao.`;
  $('kdAgain').textContent = 'Chọn level';
  show('kresult', false);
  show('kdone', true);
  BB.sfx('levelUp'); BB.haptic('levelUp');
  later(() => BB.celebrate({ particleCount: 140, spread: 100 }), 200);
}

function toMenu(){
  clearTimers();
  state = 'menu';
  chosenK = Math.min(getLv(), KLV_COUNT);
  diff = chosenK;
  renderKLevels();
  const b = getLv() - 1;
  $('kBestTxt').textContent = b >= LV_MAX ? `Đã qua cả ${LV_MAX} level` : b ? `Đã qua tới Level ${b}` : '';
  ['kresult','kdone','kpaused'].forEach(id => show(id, false));
  show('kmenu', true);
  if (!fish.length) setupPond();
  if (window.APP && window.APP.active === 'koi') startLoop();   // Về menu từ màn tạm dừng: cá bơi lại sau menu
  pondCorrect = 0; pondMistakes = 0; pondKoi = 0;   // HUD sau lớp menu không giữ số cá của hồ trước
  updateHud();
}

function pause(){
  if (state !== 'play' && state !== 'pondEnd') return;
  resumeTo = state; state = 'paused'; show('kpaused', true);
}

$('kStartBtn').onclick = () => startKoiLevel(chosenK);
$('krNext').onclick = () => {
  if (kPassed && diff >= LV_MAX) showDone();
  else startKoiLevel(kPassed ? diff + 1 : diff);
};
$('krMenu').onclick = toMenu;
$('kdAgain').onclick = toMenu;
$('kPauseBtn').onclick = pause;
$('kResumeBtn').onclick = () => { if (state !== 'paused') return; show('kpaused', false); state = resumeTo; lastT = performance.now(); startLoop(); };
$('kQuitBtn').onclick = toMenu;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && window.APP && window.APP.active === 'koi') pause();
});
// Rời game (Back, nút home): tạm dừng hồ đang chơi thay vì để nó bị xoá lúc vào lại.
BB.onLeave('koi', () => { pause(); clearTimers(); });

window.koiEnter = () => {
  resize();
  startLoop();
  const req = BB.takeRequest('koi');                 // thử thách hôm nay: vào thẳng level đó
  if (req != null) { chosenK = Math.min(LV_MAX, Math.max(1, req)); startKoiLevel(chosenK); return; }
  if (state === 'paused') { show('kpaused', true); updateHud(); return; }  // còn hồ đang dở
  toMenu();
};
renderKHow();
window.koiBest = () => ({ best: getBest(), lv: getLv() });
// Cửa sổ chỉ cho Playwright: có khi trang đặt window.__BB_TEST__ trước lúc tải, bản thật không có.
if (window.__BB_TEST__) window.__koi = {
  get state(){ return state; }, get fish(){ return fish; }, get pellets(){ return pellets; },
  get earlyTaps(){ return earlyTaps; }, set cooldown(v){ cooldown = v; }, get cooldown(){ return cooldown; },
  get diff(){ return diff; }, get turnMul(){ return turnMul; }, params: d => params(d), LV_MAX, engine: !!BBD,
};
updateHud();
})();
