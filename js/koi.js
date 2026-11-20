// ======================= GAME CÁ KOI =======================
(() => {
const $ = id => document.getElementById(id);
const cv = $('kcv'), ctx = cv.getContext('2d');
const bg = document.createElement('canvas');
let W = 0, H = 0, dpr = 1;
const PONDS = 5;
let state = 'menu';            // menu | play | pondEnd | result | done | paused
let diff = 1, startDiff = 1, maxDiff = 1, pondIdx = 0;
let score = 0, sessCorrect = 0, sessTaps = 0, streak = 0;
let fish = [], pellets = 0, pelletsMax = 0, cooldown = 0, cdMax = 1;
let pondCorrect = 0, pondMistakes = 0, pondKoi = 0, endTimer = 0;
let fx = [], ripples = [], dialShake = 0, lastT = 0;
let seed = 1;

function getLv(){ try { return Math.max(1, +localStorage.getItem('koi_lv2') || 1); } catch(e){ return 1; } }
function setLv(v){ try { localStorage.setItem('koi_lv2', v); } catch(e){} }
function getBest(){ try { return +localStorage.getItem('koi_best') || 0; } catch(e){ return 0; } }
function setBest(v){ try { if (v > getBest()) localStorage.setItem('koi_best', v); } catch(e){} }

let actx = null;
function beep(freq, dur, type='sine', vol=0.06, delay=0){
  try{
    if(!actx) actx = new (window.AudioContext||window.webkitAudioContext)();
    const t0 = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + dur + 0.02);
  }catch(e){}
}
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
const wrapAng = a => { while (a > Math.PI) a -= Math.PI*2; while (a < -Math.PI) a += Math.PI*2; return a; };

// độ khó theo cấp
function params(d){
  return {
    koi: Math.min(5 + d, 15),            // cấp 1 = 6 con, cấp 10 = 15 con
    cd: Math.min(1.3 + 0.15*d, 3.2),     // thời gian chờ giữa 2 lần cho ăn
    decoys: d >= 3 ? Math.min(1 + ((d-3)/2|0), 4) : 0,
  };
}

// vùng cá bơi (chừa chỗ cho vòng hẹn giờ ở dưới)
const area = () => ({ x0: 8, y0: 8, x1: W - 8, y1: H - 96 });
const fishLen = () => Math.max(34, Math.min(60, Math.min(W, H) * 0.13)) * (fish.length > 11 || params(diff).koi > 11 ? 0.85 : 1);

// ---------- tạo hồ ----------
function setupPond(){
  const p = params(diff);
  seed = (Math.random()*1e9)|0;
  fish = []; fx = []; ripples = [];
  const L = fishLen(), A = area();
  const mk = (decoy) => ({
    x: A.x0 + L + Math.random()*(A.x1 - A.x0 - 2*L),
    y: A.y0 + L + Math.random()*(A.y1 - A.y0 - 2*L),
    ang: Math.random()*Math.PI*2, turn: 0, turnTarget: 0, turnT: 0,
    spd: (decoy ? 24 : 30) + Math.random()*12, boost: 0,
    phase: Math.random()*10, decoy, fed: false, L: decoy ? L*1.05 : L,
  });
  for (let i=0;i<p.decoys;i++) fish.push(mk(true));
  for (let i=0;i<p.koi;i++) fish.push(mk(false));
  pondKoi = p.koi; pellets = pelletsMax = p.koi;
  cdMax = p.cd; cooldown = 0;
  pondCorrect = 0; pondMistakes = 0; endTimer = 0;
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
  const by = H - 92;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, by, W, 92);
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
  const sx = dialShake > 0 ? Math.sin(dialShake*60) * 6 * dialShake/0.3 : 0;
  const cx = W/2 + sx, cy = H - 56, R = 24;
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
  }
  // hàng chấm = số hạt còn lại
  const n = pelletsMax, gap = Math.min(16, (W-40)/Math.max(1,n));
  const x0 = W/2 - gap*(n-1)/2;
  for (let i=0;i<n;i++){
    ctx.fillStyle = i < pellets ? '#ffffff' : 'rgba(255,255,255,.18)';
    ctx.beginPath(); ctx.arc(x0 + i*gap, H - 16, 4.5, 0, Math.PI*2); ctx.fill();
  }
}

// ---------- cập nhật ----------
function updateFish(dt){
  const A = area(), cx = (A.x0+A.x1)/2, cy = (A.y0+A.y1)/2;
  fish.forEach(f => {
    f.turnT -= dt;
    if (f.turnT <= 0) { f.turnTarget = (Math.random()-0.5)*1.6; f.turnT = 1 + Math.random()*2; }
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
  updateFish(dt);
  if (cooldown > 0) cooldown = Math.max(0, cooldown - dt);
  if (dialShake > 0) dialShake = Math.max(0, dialShake - dt);
  fx.forEach(e => e.t += dt); fx = fx.filter(e => e.t < 0.8);
  ripples.forEach(r => r.t += dt); ripples = ripples.filter(r => r.t < 0.7);
  if (state === 'pondEnd') { endTimer -= dt; if (endTimer <= 0) pondResult(); }
}

// ---------- chạm ----------
cv.addEventListener('pointerdown', ev => {
  if (state !== 'play') return;
  ev.preventDefault();
  const rect = cv.getBoundingClientRect();
  const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  // tìm cá bị chạm (con vẽ sau = nằm trên)
  let hit = null, best = Infinity;
  for (let i = fish.length-1; i >= 0; i--){
    const f = fish[i];
    const dx = x - f.x, dy = y - f.y;
    const lx = dx*Math.cos(-f.ang) - dy*Math.sin(-f.ang), ly = dx*Math.sin(-f.ang) + dy*Math.cos(-f.ang);
    const d = (lx/(f.L*0.62))**2 + (ly/(f.L*0.4))**2;
    if (d <= 1 && d < best - 0.25) { best = d; hit = f; }
  }
  if (!hit) return;
  if (cooldown > 0) { dialShake = 0.3; beep(200, 0.08, 'square', 0.03); return; }
  if (hit.decoy) {
    pondMistakes++; streak = 0; sessTaps++;
    fx.push({ f: hit, ok: false, t: 0 });
    hit.boost = 50;
    beep(160, 0.22, 'sawtooth', 0.05);
    updateHud();
    return;
  }
  pellets--; sessTaps++;
  cooldown = cdMax;
  ripples.push({ x: hit.x, y: hit.y, t: 0 });
  if (!hit.fed) {
    hit.fed = true; pondCorrect++; sessCorrect++; streak++;
    score += 100 + Math.min(streak, 10)*10 + diff*10;
    fx.push({ f: hit, ok: true, t: 0 });
    hit.boost = 45;
    beep(760, 0.08, 'sine', 0.06); beep(1140, 0.1, 'sine', 0.05, 0.06);
  } else {
    pondMistakes++; streak = 0;
    fx.push({ f: hit, ok: false, t: 0 });
    beep(160, 0.22, 'sawtooth', 0.05);
  }
  updateHud();
  if (pellets <= 0) { state = 'pondEnd'; endTimer = 0.9; }
});

// ---------- vẽ ----------
function draw(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if (!W) return;
  ctx.drawImage(bg, 0, 0, W, H);
  ripples.forEach(r => {
    const k = r.t/0.7;
    ctx.strokeStyle = `rgba(255,255,255,${0.5*(1-k)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(r.x, r.y, 6 + k*34, 0, Math.PI*2); ctx.stroke();
    if (k < 0.4) { ctx.fillStyle = `rgba(255,190,110,${1-k/0.4})`; ctx.beginPath(); ctx.arc(r.x, r.y, 4, 0, Math.PI*2); ctx.fill(); }
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
  drawDial();
}

function loop(ts){
  const dt = Math.min(0.05, (ts - lastT)/1000 || 0);
  lastT = ts;
  if (window.APP && window.APP.active === 'koi') {
    if (state === 'play' || state === 'pondEnd') update(dt);
    else if (state !== 'paused') updateFish(dt);
    draw();
  }
  requestAnimationFrame(loop);
}

// ---------- kích thước ----------
function resize(){
  const rect = cv.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = rect.width; H = rect.height;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  buildStatic();
  const A = area();
  fish.forEach(f => { f.x = Math.max(A.x0, Math.min(A.x1, f.x)); f.y = Math.max(A.y0, Math.min(A.y1, f.y)); });
}
window.addEventListener('resize', resize);

// ---------- luồng chơi ----------
function show(id, on){ $(id).classList.toggle('hidden', !on); }
function updateHud(){
  $('kPond').textContent = `Level ${diff} · ${pondKoi || params(diff).koi} cá`;
  $('kScore').textContent = `✓ ${pondCorrect}/${pondKoi || params(diff).koi}`;
  $('kLevel').textContent = `Nhầm ${pondMistakes}`;
}

const KLV_COUNT = 10;          // level 1..10 = 6..15 cá
let chosenK = 1, kPassed = false;
function renderKLevels(){
  const b = getLv() - 1, grid = $('klvgrid');   // koi_level lưu level kế tiếp chưa qua
  grid.innerHTML = '';
  for (let lv = 1; lv <= KLV_COUNT; lv++){
    const el = document.createElement('button');
    el.className = 'lv' + (lv <= b ? ' done' : '') + (lv === chosenK ? ' on' : '');
    el.innerHTML = `${lv}<small>${params(lv).koi} cá</small>`;
    el.onclick = () => { chosenK = lv; renderKLevels(); beep(700, 0.04, 'square', 0.03); };
    grid.appendChild(el);
  }
  const p = params(chosenK);
  $('kLevelTxt').textContent = `${p.koi} cá koi${p.decoys ? ` + ${p.decoys} cá xám` : ''} · chờ ${p.cd.toFixed(1).replace('.', ',')} giây giữa 2 lần cho ăn`;
  $('kStartBtn').textContent = `Chơi Level ${chosenK} · ${p.koi} cá`;
}

function startKoiLevel(lv){
  diff = lv;
  ['kmenu','kresult','kdone','kpaused'].forEach(id => show(id, false));
  setupPond();
  state = 'play';
  updateHud();
}

function pondResult(){
  state = 'result';
  kPassed = pondMistakes <= 1;
  if (kPassed && diff + 1 > getLv()) setLv(diff + 1);
  const p1 = params(diff + 1);
  $('krTitle').textContent = kPassed ? `Qua Level ${diff}! 🎉` : `Chưa qua Level ${diff} 😅`;
  $('krBig').textContent = `${pondCorrect}/${pondKoi}`;
  const parts = [`Cho ăn đúng ${pondCorrect}/${pondKoi} con cá koi.`];
  parts.push(pondMistakes ? `Nhầm ${pondMistakes} lần.` : 'Không nhầm lần nào!');
  if (!kPassed) parts.push('Cần nhầm tối đa 1 lần để qua level.');
  $('krDetail').textContent = parts.join(' ');
  $('krNext').textContent = kPassed ? `Level ${diff+1} · ${p1.koi} cá →` : `Chơi lại Level ${diff}`;
  show('kresult', true);
  updateHud();
  kPassed ? (beep(660,0.12,'triangle',0.06), beep(990,0.18,'triangle',0.06,0.1)) : beep(440,0.2,'triangle',0.05);
}

function toMenu(){
  state = 'menu';
  chosenK = Math.min(getLv(), KLV_COUNT);
  diff = chosenK;
  renderKLevels();
  const b = getLv() - 1;
  $('kBestTxt').textContent = b ? `Đã qua tới Level ${b}` : '';
  ['kresult','kdone','kpaused'].forEach(id => show(id, false));
  show('kmenu', true);
  if (!fish.length) setupPond();
  pondCorrect = 0; pondMistakes = 0;
  updateHud();
}

$('kStartBtn').onclick = () => startKoiLevel(chosenK);
$('krNext').onclick = () => startKoiLevel(kPassed ? diff + 1 : diff);
$('krMenu').onclick = toMenu;
$('kPauseBtn').onclick = () => { if (state === 'play') { state = 'paused'; show('kpaused', true); } };
$('kResumeBtn').onclick = () => { show('kpaused', false); state = 'play'; };
$('kQuitBtn').onclick = toMenu;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play' && window.APP && window.APP.active === 'koi') { state = 'paused'; show('kpaused', true); }
});

window.koiEnter = () => { resize(); toMenu(); };
window.koiBest = () => ({ best: getBest(), lv: getLv() });
requestAnimationFrame(loop);
})();

