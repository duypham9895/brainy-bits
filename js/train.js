// Đường Ray Tư Duy, part 2 of 2: game state, input, rendering and round flow.
// Part 1 (js/train-map.js: generator, geometry, static art) must load first and sets window.RTD_MAP.
(() => {
'use strict';

function boot(){
const M = window.RTD_MAP;
const { DIRS, mulberry32, shuffle, shade, rr, stationsFor, pointAt, strokeEdge, strokeRails } = M;
const BB = window.BB;
// Level parameters come from the shared difficulty table (js/difficulty.js + js/levels/train.js).
// The reference is kept, so a later reload of difficulty.js by another script cannot drop train's table.
// Table v2 (2026-11-21) retunes L1..30 on the shared sawtooth. If the table failed to load (e.g. an old
// offline cache), the game falls back to the v1 formulas and its old 11 levels.
const BBD = window.BBD && window.BBD.games().includes('train') ? window.BBD : null;
const legacySpec = lv => ({ stations: stationsFor(lv), base: Math.max(1.8, 2.6 - 0.075*(lv-1)) * (0.75 / 0.45),
  speedF: 0.45, burstP: 0.15 });
const specFor = lv => BBD ? BBD.level('train', lv) : legacySpec(lv);
const LV_MAX = BBD ? BB.setLvMax('train', BBD.maxLevel('train')) : BB.LV_MAX.train;   // 30 (11 without the table)
// Once per table version, before anything reads gameStats: moves stored stars to the current table.
// v1 → v2 keeps level numbers, so the data stays as it is and only the marker bb_tablev_train is written.
if (BBD && BB.migrateProgress) BB.migrateProgress('train');
const gaOf = lv => specFor(lv).stations;
const LEVEL_TIME = 90;               // 90 giây ra tàu + đếm ngược + chờ tàu cuối ≈ 1p50–2p mỗi round

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const bg = document.createElement('canvas');
const $ = id => document.getElementById(id);

let W = 0, H = 0, dpr = 1;
let level = 1, state = 'menu', seed = 1, pausedFrom = 'play';
let map = null;            // {C, R, tunnel, switches, stations, edges, land}
let cell = 50, ox = 0, oy = 0, TR = 20; // kích thước ô lưới, bán kính ô rẽ
// Drawn switch disc ≥ 44 px wide even on a 320 px phone (MERGED-SPEC A-5). Drawing only: TR still sets the
// rail curves, tileLen and the tap radius, so every level plays exactly as before.
const DISC_MIN_R = 22;
const discR = () => Math.max(TR + 1, DISC_MIN_R);
let trains = [], particles = [], popups = [], rings = [];
let timeLeft = 0, spawnTimer = 0, correct = 0, total = 0, streak = 0, bestStreak = 0, playS = 0;
let speed = 60, lastT = 0, cdT = 0, shakeLeft = 0;
let spec = specFor(1);     // tham số của level đang chơi: stations, base, speedF, burstP
let colorBag = [], lastKey = null, lastBurst = false;
const shake = BB.trauma(7);
const reduced = () => BB.motion.reduced;

// ================== TIẾN ĐỘ ==================
// rtd_best3 is the pre-BB key: keep writing it and read it, so nobody loses unlocked levels.
// Copying it into bb_stats once is hub.js seedFromLegacy()'s job.
const getBest = () => Math.min(LV_MAX, Math.max(BB.gameStats('train').best, BB.store.num('rtd_best3', 0, 0, LV_MAX)));
function setBest(v){ v = Math.min(v, LV_MAX); if (v > BB.store.num('rtd_best3', 0, 0)) BB.store.set('rtd_best3', v); }
// Pre-BB players only have rtd_best3, and the old menu showed levels 1..best as done. Keep that
// for them (Neon #14), frozen at the first boot of this version: anyone with stars already plays
// here, so new wins never mark skipped levels (RTD-09). A reset deletes rtd_best3, and this with it.
const legacyDone = (() => {
  const raw = BB.store.num('rtd_best3', 0, 0, LV_MAX);
  if (!raw) { BB.store.del('rtd_legacy_done'); return 0; }
  let v = BB.store.get('rtd_legacy_done');
  if (v == null) {
    v = Object.keys(BB.gameStats('train').stars).length ? 0 : raw;
    BB.store.set('rtd_legacy_done', v);
  }
  return Math.min(Number(v) || 0, raw);
})();
// 0..3 stars from accuracy; shown on the result screen (#rRule) and saved by BB.record.
const starsFor = pct => pct >= 100 ? 3 : pct >= 90 ? 2 : pct >= 80 ? 1 : 0;

// 15 màu đơn sắc, xếp theo thứ tự dễ phân biệt nhất trước. Mỗi màu đi kèm một hình (M.GLYPHS)
// cùng chỉ số, nên người mù màu vẫn ghép được tàu với ga. Hai màu tối cũ (#15803d, #1e1b4b)
// gần như lẫn vào nền xanh đậm, đã thay bằng #22c55e và #818cf8.
const SOLID15 = ['#ef4444','#2563eb','#facc15','#f8fafc','#a855f7','#f97316','#84cc16','#ec4899',
                 '#38bdf8','#8b5a2b','#14b8a6','#9ca3af','#22c55e','#f9a8d4','#818cf8'];
function assignColors(stations){
  const idx = shuffle(stations.map((_, i) => i));
  stations.forEach((st, i) => { st.key = i; st.ci = idx[i]; st.a = st.b = SOLID15[idx[i]]; st.two = false; });
}

function setupLevel(){
  seed = (Math.random()*1e9)|0;
  spec = specFor(level);
  map = M.generate(spec.stations, W || 390, H || 700);
  map.land = W > H;
  assignColors(map.stations);
  trains = []; particles = []; popups = []; rings = [];
  colorBag = []; lastKey = null; lastBurst = false;
  timeLeft = LEVEL_TIME; correct = 0; total = 0; streak = 0; bestStreak = 0; playS = 0;
  spawnTimer = 1.0;
  shake.reset();
  layout();
}

// ================== BỐ CỤC ĐIỂM ẢNH ==================
function toPx(g){ return { x: ox + g.c*cell, y: oy + g.r*cell }; }

function layout(){
  if (!map) return;
  const {C, R} = map;
  cell = Math.min(W / (C - 1 + 1.3), H / (R - 1 + 1.3), 72);
  ox = (W - (C-1)*cell) / 2;
  oy = (H - (R-1)*cell) / 2;
  TR = cell * 0.48;
  speed = cell * 2.6 * spec.speedF;   // bảng v2: 0.28 ở mọi level (v1: 0.45)
  map.switches.forEach(s => s.px = toPx(s.g));
  map.stations.forEach(s => s.px = toPx(s.g));
  const T = map.tunnel; T.px = toPx(T.g);
  const td = DIRS[T.dir];
  const k = Math.min(1.15, cell / 50);
  T.front = { x: T.px.x + td.dc*cell*0.12, y: T.px.y + td.dr*cell*0.12 };
  T.origin = { x: T.front.x - td.dc*20*k, y: T.front.y - td.dr*20*k };
  T.k = k;

  map.edges.forEach(e => {
    const oldLen = e.len;
    let p = e.g.map(toPx);
    if (e.from.type === 'switch') {
      const S = p[0], d = DIRS[e.from.din];
      p.unshift({ x: S.x - d.dc*TR, y: S.y - d.dr*TR });
    } else {
      const S = p[0], d = DIRS[e.from.dir];
      p.unshift({ x: S.x - d.dc*cell*0.45, y: S.y - d.dr*cell*0.45 });
    }
    if (e.to.type === 'switch') {
      const S = p[p.length-1], d = DIRS[e.to.din];
      p[p.length-1] = { x: S.x - d.dc*TR, y: S.y - d.dr*TR };
    }
    M.setPts(e, M.roundPath(M.simplify(p), TR));
    e.tileLen = 0;
    if (e.from.type === 'switch') {
      const S = e.from.px;
      for (let d=0; d<=e.len; d+=1) { const q = pointAt(e, d); if (Math.hypot(q.x-S.x, q.y-S.y) >= TR + 1) { e.tileLen = d; break; } }
    }
    if (oldLen) trains.forEach(t => { if (t.edge === e) t.d *= e.len/oldLen; });
  });
  buildStatic();
}

// ================== LỚP NỀN TĨNH ==================
function buildStatic(){
  bg.width = cv.width; bg.height = cv.height;
  const g = bg.getContext('2d');
  g.setTransform(dpr,0,0,dpr,0,0);
  const rnd = mulberry32(seed);

  const grd = g.createRadialGradient(W/2, H*0.45, 40, W/2, H*0.45, Math.max(W,H)*0.8);
  grd.addColorStop(0, '#1d3526'); grd.addColorStop(1, '#0a150e');
  g.fillStyle = grd; g.fillRect(0,0,W,H);
  g.lineWidth = 1.3; g.lineCap = 'round';
  for (let i=0; i<W*H/700; i++){
    const x = rnd()*W, y = rnd()*H;
    g.strokeStyle = rnd()<0.5 ? 'rgba(140,200,130,.07)' : 'rgba(0,0,0,.18)';
    g.beginPath(); g.moveTo(x-2.5,y); g.lineTo(x-0.5,y-4.5); g.moveTo(x+0.5,y); g.lineTo(x+2,y-4); g.stroke();
  }

  const edges = map.edges;
  const samples = [];
  edges.forEach(e => { for (let s=0; s<=e.len; s+=7) samples.push(pointAt(e, s)); });
  const T = map.tunnel;

  // trang trí
  const decos = [];
  const tries = Math.round(W*H/1100);
  for (let i=0; i<tries; i++){
    const x = 6 + rnd()*(W-12), y = 6 + rnd()*(H-12);
    const kind = rnd();
    if (kind >= 0.93) continue;
    const size = (kind < 0.35 ? 8 + rnd()*6 : kind < 0.65 ? 5 + rnd()*3 : 3.5 + rnd()*2) * Math.min(1.1, cell/50);
    const clear = size + cell*0.28;
    if (Math.hypot(x-T.origin.x, y-T.origin.y) < 75*T.k) continue;
    if (samples.some(p => Math.abs(p.x-x) < clear && Math.abs(p.y-y) < clear)) continue;
    if (map.stations.some(s => Math.abs(s.px.x-x) < cell*0.45+size && Math.abs(s.px.y-y) < cell*0.45+size)) continue;
    if (decos.some(d => Math.hypot(d.x-x, d.y-y) < d.size + size + 3)) continue;
    decos.push({x, y, size, kind, r: rnd()});
  }
  decos.sort((a,b) => a.y - b.y).forEach(d => M.drawDeco(g, d));

  // ballast + tà vẹt + ray
  g.lineCap = 'round'; g.lineJoin = 'round';
  const bw = cell * 0.38;
  g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = bw + 5; edges.forEach(e => strokeEdge(g, e));
  g.strokeStyle = '#3e3b34'; g.lineWidth = bw; edges.forEach(e => strokeEdge(g, e));
  g.strokeStyle = '#47443c'; g.lineWidth = bw*0.68; edges.forEach(e => strokeEdge(g, e));
  edges.forEach(e => {
    for (let s = 4; s < e.len; s += Math.max(7, cell*0.17)){
      const p = pointAt(e, s);
      g.save(); g.translate(p.x, p.y); g.rotate(p.ang);
      const th = cell*0.17;
      g.fillStyle = '#3d2817'; g.fillRect(-2, -th, 4, th*2);
      g.fillStyle = '#5a3c22'; g.fillRect(-2, -th, 4, 1.8);
      g.restore();
    }
  });
  edges.forEach(e => strokeRails(g, e, undefined, '#22272a', '#9aa4ab', 3.2, 1.5, cell));

  // ô ngã rẽ: to, sáng màu, nổi bật trên nền tối
  map.switches.forEach(sw => {
    const {x, y} = sw.px, Rp = discR();
    g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(x + 2, y + 4, Rp + 2, 0, Math.PI*2); g.fill();
    g.fillStyle = '#0f2416'; g.beginPath(); g.arc(x, y, Rp + 3, 0, Math.PI*2); g.fill();
    const pg = g.createRadialGradient(x - Rp*0.35, y - Rp*0.4, 2, x, y, Rp);
    pg.addColorStop(0, '#a6ec9c'); pg.addColorStop(1, '#5cb766');
    g.fillStyle = pg; g.beginPath(); g.arc(x, y, Rp, 0, Math.PI*2); g.fill();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.45)';
    g.beginPath(); g.arc(x, y, Rp - 2.5, Math.PI*1.05, Math.PI*1.7); g.stroke();
  });

  map.stations.forEach(st => drawStation(g, st));

  // viền tối
  const vg = g.createRadialGradient(W/2, H/2, Math.min(W,H)*0.35, W/2, H/2, Math.max(W,H)*0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.4)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
}

function drawStation(g, st){
  const w = cell*0.8, h = w*0.8;
  const x = st.px.x, y = st.px.y - h*0.55;
  const roof = st.two ? st.b : shade(st.a, -0.42);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.ellipse(x+2, y+h+3, w*0.62, 4.5, 0, 0, Math.PI*2); g.fill();
  g.fillStyle = '#7d857d'; rr(g, x - w/2 - 2, y + h - 4, w + 4, 6, 2); g.fill();
  const bodyTop = y + h*0.34;
  const grd = g.createLinearGradient(0, bodyTop, 0, y+h);
  grd.addColorStop(0, shade(st.a, 0.15)); grd.addColorStop(1, shade(st.a, -0.12));
  g.fillStyle = grd; rr(g, x - w/2 + 1, bodyTop, w - 2, h*0.66 - 3, 3); g.fill();
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(0,0,0,.5)'; g.stroke();
  g.beginPath();
  g.moveTo(x - w/2 - 2, bodyTop + 2);
  g.lineTo(x - w/2 + w*0.16, y);
  g.lineTo(x + w/2 - w*0.16, y);
  g.lineTo(x + w/2 + 2, bodyTop + 2);
  g.closePath();
  g.fillStyle = roof; g.fill(); g.stroke();
  g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(x - w/2 + w*0.18, y + 1.5, w*0.64, 2);
  if (w > 26) {
    g.fillStyle = 'rgba(255,248,214,.9)';
    rr(g, x - w*0.38, y + h*0.52, w*0.15, h*0.16, 1.5); g.fill();
    rr(g, x + w*0.23, y + h*0.52, w*0.15, h*0.16, 1.5); g.fill();
  }
  // ký hiệu hình của ga thay chỗ cửa ra vào (RTD-08)
  M.drawGlyph(g, st.ci, x, y + h*0.64, Math.max(4.5, w*0.17));
}

// ================== KÍCH THƯỚC ==================
function resize(){
  const rect = cv.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (rect.width === W && rect.height === H && cv.width === Math.round(W*dpr)) return false;
  W = rect.width; H = rect.height;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  layout();
  return true;
}

// Map shape is chosen for the screen's aspect at generation time; after a rotation the old
// C×R grid shrinks to ~1/3 (RTD-02). Before play: draw a new map. During play: pause and say why.
const rotHint = document.createElement('p');
rotHint.className = 'note hidden'; rotHint.id = 'rtdRotate';
rotHint.textContent = 'Máy vừa xoay nên bản đồ bị thu nhỏ. Xoay lại để chơi tiếp, hoặc chơi lại level này để có bản đồ vừa màn hình.';
function onResize(){
  if (!resize() || !map) { kick(); return; }
  const turned = (W > H) !== map.land;
  // paused during the countdown: no train is out yet, so a fresh map costs nothing
  if (turned && state === 'paused' && pausedFrom === 'countdown') {
    setupLevel(); cdT = 3.6; rotHint.classList.add('hidden'); draw(0); return;
  }
  rotHint.classList.toggle('hidden', !(turned && state === 'paused'));
  if (!turned) { kick(); return; }
  if (state === 'menu') setupLevel();
  else if (state === 'countdown') { setupLevel(); cdT = 3.6; }
  else if (state === 'play') { pause(); rotHint.classList.remove('hidden'); }
  kick();
}
// ResizeObserver also catches the HUD changing height without a window resize (RTD-11).
if (window.ResizeObserver) new ResizeObserver(onResize).observe(cv);
else window.addEventListener('resize', onResize);

// ================== ĐIỀU KHIỂN ==================
cv.setAttribute('role', 'img');
cv.setAttribute('aria-label', 'Bản đồ đường ray. Chạm ô tròn ở ngã rẽ để đổi hướng tàu.');
cv.addEventListener('pointerdown', ev => {
  if (state !== 'play' && state !== 'countdown') return;
  ev.preventDefault();
  const rect = cv.getBoundingClientRect();
  const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  let best = null, bd = Infinity;
  map.switches.forEach(s => { const d = Math.hypot(s.px.x-x, s.px.y-y); if (d < bd) { bd = d; best = s; } });
  if (best && bd < Math.max(32, TR + 16)) {
    best.sel ^= 1; best.pulse = 1;
    // tàu vừa vào ô tròn (chưa ra khỏi ô) thì vẫn cho đổi hướng kịp
    const grace = cell * 0.2;
    trains.forEach(t => {
      if (t.prev && t.prev.to === best && t.edge.from === best && t.d <= t.edge.tileLen + grace) {
        const ne = best.childEdges[best.sel];
        if (ne !== t.edge) { t.d = Math.min(t.d, ne.tileLen); t.edge = ne; }
      }
    });
    BB.sfx('tap'); BB.haptic('tap');
  }
});

// ================== TÀU ==================
// ~5s/tàu ở level 1, ~3,5s ở level 11 (18→25 tàu mỗi round); công thức trộn nằm ở RTD_MAP.spawnGap
function nextSpawnDelay(){
  const g = M.spawnGap(spec.base, spec.burstP, lastBurst, Math.random);
  lastBurst = g.burst;
  return g.gap;
}

function spawn(){
  const e = map.tunnel.edge;
  if (trains.some(t => t.edge === e && t.d < Math.max(56, cell*1.15))) { spawnTimer = 0.12; return; }
  // "túi màu": mỗi lượt đủ tất cả các màu ga rồi mới lặp lại
  if (!colorBag.length) {
    colorBag = shuffle(map.stations.slice());
    if (lastKey !== null && colorBag.length > 1 && colorBag[colorBag.length-1].key === lastKey) colorBag.unshift(colorBag.pop());
  }
  const st = colorBag.pop();
  lastKey = st.key;
  trains.push({ edge: e, prev: null, d: 0, key: st.key, ci: st.ci, a: st.a, b: st.b });
  spawnTimer = nextSpawnDelay();
}

function update(dt){
  playS += dt;
  if (timeLeft > 0) {
    timeLeft -= dt;
    spawnTimer -= dt;
    if (spawnTimer <= 0 && timeLeft > 1.5) spawn();
  }
  for (let i=trains.length-1;i>=0;i--){
    const t = trains[i];
    t.d += speed * dt;
    while (t.d >= t.edge.len) {
      const node = t.edge.to;
      if (node.type === 'station') { arrive(t, node); trains.splice(i,1); break; }
      const over = t.d - t.edge.len;
      t.prev = t.edge;
      t.edge = node.childEdges[node.sel];
      t.d = over;
    }
  }
  updateFx(dt);
  updateHud();
  if (timeLeft <= 0 && trains.length === 0) endLevel();
}

function arrive(t, st){
  const ok = st.key === t.key;
  total++;
  const cx = st.px.x, cy = st.px.y;
  if (ok) {
    correct++; streak++; bestStreak = Math.max(bestStreak, streak);
    BB.sfx('correct', { combo: streak - 1 });   // mỗi tàu đúng liên tiếp cao thêm nửa cung
    BB.haptic('tap');
    BB.hitStop(60);
    if (!reduced()) {
      for (let k=0;k<16;k++){
        const a = Math.random()*Math.PI*2, v = 60 + Math.random()*120;
        particles.push({x:cx, y:cy, vx:Math.cos(a)*v, vy:Math.sin(a)*v - 60, life:0.7+Math.random()*0.4, t:0,
          color: k%3===0 ? '#fff7c2' : (k%2 ? t.a : t.b), r: 2 + Math.random()*2.5});
      }
      rings.push({x:cx, y:cy, t:0, color:t.a});
    }
    popups.push({x:cx, y:cy - cell*0.6, text:'✓', color:'#b9ff7a', t:0});
    if (streak >= 3) BB.pop($('hStreak'), 1.18);
  } else {
    streak = 0;
    shake.add(0.6); shakeLeft = 0.7;
    BB.sfx('wrong'); BB.haptic('error');
    popups.push({x:cx, y:cy - cell*0.6, text:'✗', color:'#ff5d6c', t:0});
    if (!reduced()) rings.push({x:cx, y:cy, t:0, color:'#ff3d5a'});
  }
}

function updateFx(dt){
  particles.forEach(p => { p.t += dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 260*dt; p.vx *= 0.98; });
  particles = particles.filter(p => p.t < p.life);
  popups.forEach(p => p.t += dt); popups = popups.filter(p => p.t < 0.9);
  rings.forEach(r => r.t += dt); rings = rings.filter(r => r.t < 0.5);
  if (map) map.switches.forEach(s => { if (s.pulse) s.pulse = Math.max(0, s.pulse - dt*3.5); });
  if (shakeLeft > 0) shakeLeft = Math.max(0, shakeLeft - dt);
}

const narrowHud = matchMedia('(max-width:430px)');
function setHud(lv, n, time){
  $('hLevel').textContent = `Level ${lv} · ${n} ga`;
  $('hTime').textContent = time;
}
function updateHud(){
  const tl = Math.max(0, timeLeft);
  // hết giờ nhưng tàu còn chạy: nói rõ đang chờ, đừng để "0s" như treo máy (RTD-07)
  const wait = tl <= 0 && trains.length;
  setHud(level, map ? map.stations.length : gaOf(level), wait ? `Chờ ${trains.length} tàu` : Math.ceil(tl) + 's');
  // narrow phones: "⏳ 3" keeps the HUD on one row; the full words stay for screen readers (Neon #5)
  if (wait && narrowHud.matches) $('hTime').innerHTML =
    `<span aria-hidden="true">⏳ ${trains.length}</span><span class="rtd-sr">Chờ ${trains.length} tàu</span>`;
  $('hScore').textContent = `✓ ${correct}/${total}`;
  const tf = $('timefill');
  tf.style.width = (tl / LEVEL_TIME * 100) + '%';
  tf.classList.toggle('low', tl <= 10);
  const st = $('hStreak');
  st.classList.toggle('hidden', streak < 3);
  st.textContent = '🔥 ' + streak;
}
function menuHud(lv){
  setHud(lv, gaOf(lv), LEVEL_TIME + 's');
  $('hScore').textContent = '✓ 0/0';
  $('hStreak').classList.add('hidden');
  const tf = $('timefill'); tf.style.width = '100%'; tf.classList.remove('low');
}

// ================== VÒNG LẶP ==================
// The loop only runs while this game is on screen and something moves. It stops itself on the
// hub, in another game, on a paused or finished round, and kick() restarts it (perf finding).
let running = false;
const onScreen = () => !window.APP || window.APP.active === 'train';
function busy(){
  return state === 'play' || state === 'countdown' || particles.length || popups.length || rings.length
    || shakeLeft > 0 || (map && map.switches.some(s => s.pulse));
}
function kick(){
  if (running || !onScreen()) return;
  running = true; lastT = 0; requestAnimationFrame(loop);
}
function loop(ts){
  if (!onScreen()) { running = false; return; }
  const dt = lastT ? Math.min(0.05, (ts - lastT)/1000) : 0;
  lastT = ts;
  if (state === 'play') { if (!BB.frozen()) update(dt); }
  else if (state === 'countdown') {
    const before = Math.ceil(cdT - 0.6);
    cdT -= dt; updateFx(dt);
    const after = Math.ceil(cdT - 0.6);
    if (after !== before) after >= 1 ? BB.tone(520, 0.12, 'triangle', 0.06) : BB.tone(880, 0.25, 'triangle', 0.07);
    if (cdT <= 0) state = 'play';
  }
  else if (state !== 'paused') updateFx(dt);
  draw(dt);
  if (busy() && state !== 'paused') requestAnimationFrame(loop);
  else running = false;
}

// ================== VẼ KHUNG HÌNH ==================
function draw(dt){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  if (!map || !map.tunnel.edge.pts) return;
  const o = shake.offset(dt);
  if (o.x || o.y) ctx.translate(o.x, o.y);
  ctx.drawImage(bg, 0, 0, W, H);

  map.switches.forEach(drawSwitch);

  rings.forEach(r => {
    const k = r.t/0.5;
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = r.color; ctx.lineWidth = 4*(1-k) + 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, 10 + k*cell*0.6, 0, Math.PI*2); ctx.stroke();
  });
  ctx.globalAlpha = 1;

  trains.forEach(drawTrain);
  M.drawTunnel(ctx, map.tunnel);

  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, 1 - p.t/p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;
  const rise = reduced() ? 0 : 26;
  popups.forEach(p => {
    const k = p.t/0.9;
    ctx.globalAlpha = 1 - k*k;
    ctx.font = `800 ${reduced() ? 28 : 24 + (1-k)*6}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(p.text, p.x, p.y - k*rise);
    ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y - k*rise);
  });
  ctx.globalAlpha = 1;

  // đếm ngược đầu màn
  if (state === 'countdown' || (state === 'paused' && pausedFrom === 'countdown')) {
    const n = Math.ceil(cdT - 0.6);
    const frac = (cdT - 0.6) - Math.floor(cdT - 0.6);
    const text = n >= 1 ? String(n) : 'Xuất phát!';
    const sc = n >= 1 && !reduced() ? 0.8 + frac*0.5 : 1;
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, 0, W, H);
    ctx.save(); ctx.translate(W/2, H/2); ctx.scale(sc, sc);
    ctx.font = `800 ${n >= 1 ? 96 : 54}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.strokeText(text, 0, 0);
    const tg = ctx.createLinearGradient(0, -50, 0, 50);
    tg.addColorStop(0, '#ffe066'); tg.addColorStop(1, '#ff8a3d');
    ctx.fillStyle = tg; ctx.fillText(text, 0, 0);
    ctx.restore();
    ctx.font = '600 16px "Baloo 2", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    ctx.textAlign = 'center';
    ctx.fillText('Quan sát bản đồ và chỉnh ngã rẽ trước nhé', W/2, H/2 + 80);
  }
}

function trainScale(){ return Math.max(0.72, Math.min(1.1, cell/52)); }

// trên ô rẽ chỉ vẽ rõ đoạn ray đang chọn; nhánh kia chỉ là vệt mờ gợi ý
function drawSwitch(s){
  const {x, y} = s.px;
  const on = s.childEdges[s.sel], off = s.childEdges[1-s.sel];
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, discR(), 0, Math.PI*2); ctx.clip();
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,70,35,.28)'; ctx.lineWidth = cell*0.16; strokeEdge(ctx, off, off.tileLen + 6);
  ctx.strokeStyle = '#2b2e2a'; ctx.lineWidth = cell*0.32; strokeEdge(ctx, on, on.tileLen + 6);
  strokeRails(ctx, on, on.tileLen + 6, '#0d1012', '#eef3f5', 3.6, 2, cell);
  ctx.restore();
}

function trainPose(t, back){
  const d = t.d - back;
  if (d >= 0) return pointAt(t.edge, d);
  if (t.prev) return pointAt(t.prev, t.prev.len + d);
  return null;
}

function drawCar(p, color, engine, k){
  if (!p) return;
  ctx.save();
  ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.scale(k, k);
  const L = engine ? 25 : 20, Wd = 14;
  ctx.fillStyle = 'rgba(0,0,0,.35)'; rr(ctx, -L/2 + 1.5, -Wd/2 + 3, L, Wd, 4); ctx.fill();
  ctx.fillStyle = color; rr(ctx, -L/2, -Wd/2, L, Wd, 4); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.28)'; rr(ctx, -L/2 + 2, -Wd/2 + 1.5, L - 4, 3, 1.5); ctx.fill();
  if (engine) {
    ctx.fillStyle = shade(color, -0.35); rr(ctx, -L/2, -Wd/2 + 1, 9, Wd - 2, 3); ctx.fill();
    ctx.fillStyle = 'rgba(255,250,220,.9)'; rr(ctx, -L/2 + 2.5, -3, 4, 6, 1.2); ctx.fill();
    ctx.fillStyle = '#1b1f22'; ctx.beginPath(); ctx.arc(4, 0, 3, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = '#ffe9a8'; rr(ctx, L/2 - 3, -4.5, 3, 9, 1.5); ctx.fill();
  }
  ctx.restore();
}

function drawTrain(t){
  const k = trainScale();
  const back = trainPose(t, 24*k), head = trainPose(t, 0);
  drawCar(back, t.b, false, k);   // toa sau = màu mái
  drawCar(head, t.a, true, k);    // đầu tàu = màu thân nhà
  // toa sau mang ký hiệu hình của ga đích, luôn đứng thẳng để dễ đọc (RTD-08)
  if (back) M.drawGlyph(ctx, t.ci, back.x, back.y, 5.4*k);
}

// ================== LUỒNG MÀN CHƠI ==================
function show(id, on){ $(id).classList.toggle('hidden', !on); }
let resTimers = [];
const clearResTimers = () => { resTimers.forEach(clearTimeout); resTimers = []; };

function startLevel(){
  clearResTimers();
  show('menu', false); show('result', false); show('paused', false);
  rotHint.classList.add('hidden');
  setupLevel();
  state = 'countdown'; cdT = 3.6;
  BB.tone(520, 0.12, 'triangle', 0.06);
  updateHud();
  kick();
}

function pause(){
  if (state !== 'play' && state !== 'countdown') return;
  pausedFrom = state; state = 'paused';
  show('paused', true);
  draw(0);
}
function resume(){
  if (state !== 'paused') return;
  rotHint.classList.add('hidden');
  show('paused', false);
  state = pausedFrom;
  kick();
}

let passed = false, finished = false, lastStars = 0;
function endLevel(){
  state = 'result';
  const pct = total ? Math.round(correct/total*100) : 0;
  passed = total > 0 && pct >= 80;
  finished = passed && level >= LV_MAX;
  const stars = passed ? starsFor(pct) : 0;
  lastStars = stars;
  if (passed) setBest(level);
  const rec = BB.record({ game: 'train', level, won: passed, stars, score: pct, ms: playS*1000 });

  $('rTitle').textContent = finished ? `Xong cả ${LV_MAX} level! 🏆`
    : passed ? `Qua Level ${level}! 🎉` : `Chưa qua Level ${level} 😅`;
  BB.countUp($('rPct'), 0, pct, { fmt: v => v + '%' });
  $('rCorrect').textContent = `${correct}/${total}`;
  $('rStreak').textContent = bestStreak;
  $('rDetail').textContent = finished ? 'Đây là level cuối. Quay lại lấy đủ 3 sao ở từng level nhé.'
    : passed ? nextHint(level)
    : BB.softLoss(level) && total > 0 ? `Cần 80% để qua. Thiếu ${Math.max(1, Math.ceil(total * 0.795 - 1e-9) - correct)} tàu nữa.`
    : 'Cần đúng ít nhất 80% để qua level.';
  BB.lossAid($('rNext'), { game: 'train', level, won: passed, maxLevel: LV_MAX,
    tip: 'Đổi ray <b>sau khi</b> tàu phía trước đã qua ngã rẽ. Đổi sớm là tàu đó chạy nhầm ga.',
    onSkip: L => { if (state !== 'result') return; level = L; startLevel(); } });
  const cue = BB.peakCue($('rNext'), { game: 'train', level, won: passed, last: finished, maxLevel: LV_MAX });
  $('rNext').textContent = finished ? 'Chọn level khác' : passed ? `Level ${level+1}${cue ? ' · thử thách' : ''} →` : `Chơi lại Level ${level}`;

  const starEls = [...$('rStars').children];
  $('rRule').classList.toggle('hidden', !passed);   // luật sao chỉ hiện khi qua, như koi và word
  starEls.forEach(s => s.classList.remove('on'));
  $('rStars').setAttribute('aria-label', `${stars} trên 3 sao`);
  show('result', true);

  if (passed) { BB.sfx('levelUp'); BB.haptic('levelUp'); } else { BB.sfx('fail'); BB.haptic('error'); }
  const gap = reduced() ? 120 : 260;
  starEls.forEach((el, i) => {
    if (i >= stars) return;
    resTimers.push(setTimeout(() => { el.classList.add('on'); BB.pop(el, 1.35); BB.sfx('star', { combo: i * 2 }); }, 450 + i*gap));
  });
  const after = 450 + stars*gap;
  resTimers.push(setTimeout(() => {
    if (rec.newBest || rec.dailyDone) BB.celebrate();
    if (rec.dailyDone) BB.toast('Xong thử thách hôm nay');
    if (rec.newBest) BB.toast(finished ? `Kỷ lục mới: qua cả ${LV_MAX} level` : `Kỷ lục mới: qua Level ${level}`);
    else if (rec.newStars) BB.toast(`Level ${level}: lên ${stars} sao`);
    if (rec.streakUp && rec.streak > 1) BB.toast(`Chuỗi ${rec.streak} ngày liền`);
  }, after));
  kick();
}

// One line about what the next level changes (feedforward, MERGED-SPEC §4.1).
function nextHint(lv){
  const a = specFor(lv), b = specFor(lv + 1);
  if (b.kind === 'breather' && b.base > a.base + 1e-9)
    return b.stations !== a.stations ? `Level ${lv+1} là màn nghỉ: ${b.stations} ga, tàu ra thưa hơn.` : `Level ${lv+1} là màn nghỉ: tàu ra thưa hơn.`;
  if (b.stations !== a.stations) return `Level ${lv+1} có ${b.stations} ga.`;
  if (b.base > a.base + 1e-9) return `Level ${lv+1}: tàu ra thưa hơn.`;
  if (b.base < a.base - 1e-9 || b.burstP > a.burstP + 1e-9) return `Level ${lv+1}: tàu ra dày hơn.`;
  return `Level ${lv+1} có ${b.stations} ga.`;
}

let chosenLv = 1;
function renderLevels(){
  const grid = $('lvgrid'), st = BB.gameStats('train').stars;
  grid.innerHTML = '';
  for (let lv = 1; lv <= LV_MAX; lv++){
    const n = (BB.starsAt ? BB.starsAt('train', lv) : st[lv]) || 0, done = n > 0 || lv <= legacyDone;
    const el = document.createElement('button');
    el.type = 'button';
    // "done" chỉ cho level đã thật sự qua, không suy từ level cao nhất (RTD-09); dữ liệu cũ thì giữ như bản cũ
    el.className = 'lv' + (done ? ' done' : '') + (lv === chosenLv ? ' on' : '');
    el.setAttribute('aria-pressed', lv === chosenLv ? 'true' : 'false');
    el.setAttribute('aria-label', `Level ${lv}, ${gaOf(lv)} ga` + (n ? `, ${n} sao` : done ? ', đã qua' : ''));
    el.innerHTML = `${lv}<small>${gaOf(lv)} ga</small>` +
      (n ? `<span class="lvst" aria-hidden="true">${'★'.repeat(n)}${'☆'.repeat(3 - n)}</span>` : '') +
      (BB.isPeak(lv, 'train') ? BB.PEAK_TAG : '');
    if (BB.isPeak(lv, 'train')) el.setAttribute('aria-label', el.getAttribute('aria-label') + ', màn thử thách');
    el.onclick = () => { chosenLv = lv; renderLevels(); menuHud(lv); BB.sfx('key'); };
    grid.appendChild(el);
  }
  $('startBtn').textContent = `Chơi Level ${chosenLv} · ${BB.isPeak(chosenLv, 'train') ? 'thử thách' : `${gaOf(chosenLv)} ga`}`;
}
function toMenu(){
  clearResTimers();
  state = 'menu';
  rotHint.classList.add('hidden');
  const b = getBest();
  chosenLv = Math.min(b + 1, LV_MAX);
  $('bestTxt').textContent = b >= LV_MAX ? `Đã qua cả ${LV_MAX} level` : b ? `Đã qua tới Level ${b}` : '';
  renderLevels();
  menuHud(chosenLv);
  show('result', false); show('paused', false); show('menu', true);
  kick();
}

// #rStars carries an aria-label ("2 trên 3 sao"); without a role screen readers skip it.
$('rStars').setAttribute('role', 'img');
$('paused').querySelector('.card h2').after(rotHint);
const rule = document.createElement('p');
rule.className = 'note rtd-rule'; rule.id = 'rRule';
rule.textContent = '80%: 1 sao · 90%: 2 sao · 100%: 3 sao';
$('rStars').after(rule);
// The menu line in index.html said "mỗi level thêm 1 ga"; table v2 holds the count on some levels, so say
// only what stays true (first and last count come from the table).
const howGa = document.querySelector('#menu .how > div:last-child > span:last-child');
if (howGa) howGa.innerHTML = `90 giây ra tàu, đúng <b>≥ 80%</b> để qua. Level 1 có ${gaOf(1)} ga, lên dần tới ${gaOf(LV_MAX)} ga.`;

// Every button ignores taps that arrive in the wrong state, so a double tap cannot start
// two rounds or skip a level.
$('startBtn').onclick = () => { if (state !== 'menu') return; level = chosenLv; startLevel(); };
$('rNext').onclick = () => {
  if (state !== 'result') return;
  if (finished) { toMenu(); return; }
  if (passed) level = Math.min(level + 1, LV_MAX);
  startLevel();
};
$('rMenu').onclick = () => { if (state === 'result') toMenu(); };
$('pauseBtn').onclick = pause;
$('resumeBtn').onclick = resume;
$('restartBtn').onclick = () => { if (state === 'paused') startLevel(); };
$('quitBtn').onclick = () => { if (state === 'paused') toMenu(); };
document.addEventListener('visibilitychange', () => {
  if (document.hidden && onScreen()) pause();
});
// Leaving from the result screen: stop the queued stars/toasts/confetti and show the final stars.
BB.onLeave('train', () => {
  if (state === 'result') {
    clearResTimers();
    [...$('rStars').children].forEach((el, i) => el.classList.toggle('on', i < lastStars));
  }
  pause();
});

// mở game tàu từ trang chủ
window.trainEnter = () => {
  resize();
  const req = BB.takeRequest('train');
  if (req) { level = Math.min(Math.max(1, req), LV_MAX); state = 'menu'; startLevel(); return; }
  // left mid-round (Back button) without the hub pausing us: keep the round, show Pause
  if (state === 'play' || state === 'countdown') pause();
  if (state === 'paused') { show('menu', false); show('result', false); show('paused', true); kick(); return; }
  if (!map) { level = Math.min(getBest() + 1, LV_MAX); setupLevel(); }
  toMenu();
};
window.trainBest = getBest;
// test hook for tests/train.spec.js. endWith() writes a real BB.record, so it is only exposed
// to automation (navigator.webdriver) or a ?test URL, never to a normal player's console.
if (navigator.webdriver || /[?&]test\b/.test(location.search)) window.__rtd = {
  get state(){ return state; }, get level(){ return level; }, get running(){ return running; },
  get map(){ return map; }, get cell(){ return cell; }, get W(){ return W; }, get H(){ return H; },
  get passed(){ return passed; }, get finished(){ return finished; },
  get spec(){ return spec; }, specFor, LV_MAX, usesTable: !!BBD, discR,
  // jump to the result screen with a given score, for the finished-state test
  // render the HUD as if `n` trains were still out after time ran out (drain pill), then restore
  hudDrain(n){ const t = timeLeft, tr = trains; timeLeft = 0; trains = Array(n).fill(null); updateHud(); timeLeft = t; trains = tr; },
  endWith(lv, ok, tot){ level = lv; correct = ok; total = tot; trains = []; timeLeft = 0; endLevel(); },
};
}

// Boot needs js/train-map.js (RTD_MAP), js/difficulty.js (BBD) and js/levels/train.js, in that order.
// index.html may not list all three yet: load what is missing, then boot. A script another file is
// already loading is waited for, not loaded twice (a second difficulty.js would wipe other games' tables).
// A failed or slow load still boots, on the legacy 11 levels. Until then the hub may already call
// trainEnter/trainBest, so queue the enter and answer best from storage.
const NEED = [
  ['js/train-map.js', () => !!window.RTD_MAP],
  ['js/difficulty.js', () => !!window.BBD],
  ['js/levels/train.js', () => !!(window.BBD && window.BBD.games().includes('train')), () => !!window.BBD],
];
const ready = () => NEED.every(([, ok, can]) => ok() || (can && !can()));
function ensure(i, done){
  if (i >= NEED.length) { done(); return; }
  const [src, ok, can] = NEED[i];
  if (ok() || (can && !can())) { ensure(i + 1, done); return; }
  let s = document.querySelector(`script[src="${src}"]`), fired = false;
  const next = () => { if (!fired) { fired = true; ensure(i + 1, done); } };
  // A static tag in index.html ran (or failed) before this file: its load/error already fired, so
  // waiting on it would hang 4 s. Only tags inserted at runtime (data-bb-dyn) are still in flight.
  if (s && !s.dataset.bbDyn) { next(); return; }
  if (!s) { s = document.createElement('script'); s.src = src; s.dataset.bbDyn = '1'; document.head.appendChild(s); }
  s.addEventListener('load', next); s.addEventListener('error', next);
  setTimeout(next, 4000);
}
if (ready()) boot();
else {
  let wantEnter = false;
  window.trainEnter = () => { wantEnter = true; };
  window.trainBest = () => (window.BB ? BB.store.num('rtd_best3', 0, 0, BB.LV_MAX.train) : 0);
  ensure(0, () => {
    if (!window.RTD_MAP) return;               // no map generator, no game: the hub keeps the stub
    boot();
    if (wantEnter && (!window.APP || window.APP.active === 'train')) window.trainEnter();
  });
}
})();
