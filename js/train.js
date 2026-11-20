(() => {
// ================== CẤU HÌNH ==================
const PALETTE = ['#ef4444','#f97316','#facc15','#84cc16','#38bdf8','#3b5bdb','#a855f7','#ec4899','#f1f5f9','#8b5a2b'];
const LEVEL_TIME = 90;   // 90 giây chơi + đếm ngược + chờ tàu cuối ≈ 1p40–1p50 mỗi round
const MAX_STATIONS = 15;
const DIRS = [{dc:1,dr:0},{dc:0,dr:1},{dc:-1,dr:0},{dc:0,dr:-1}]; // Đông, Nam, Tây, Bắc
const turnL = d => (d+3)%4, turnR = d => (d+1)%4;

const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const bg = document.createElement('canvas');
const $ = id => document.getElementById(id);

let W = 0, H = 0, dpr = 1;
let level = 1, state = 'menu', seed = 1;
let map = null;            // {C, R, tunnel, switches, stations, edges}
let cell = 50, ox = 0, oy = 0, TR = 20; // kích thước ô lưới, bán kính ô rẽ
let trains = [], particles = [], popups = [], rings = [];
let timeLeft = 0, spawnTimer = 0, correct = 0, total = 0, streak = 0, bestStreak = 0;
let speed = 60, shakeT = 0, lastT = 0;
const speedFactor = 0.45;  // tốc độ chậm cố định
let cdT = 0, fireflies = [], smoke = [];
let colorBag = [], lastKey = null;

// ================== TIỆN ÍCH ==================
function getBest(){ try { return +localStorage.getItem('rtd_best3') || 0; } catch(e){ return 0; } }
function setBest(v){ try { if (v > getBest()) localStorage.setItem('rtd_best3', v); } catch(e){} }

let actx = null;
function beep(freq, dur, type='sine', vol=0.07, delay=0){
  try{
    if(!actx) actx = new (window.AudioContext||window.webkitAudioContext)();
    const t0 = actx.currentTime + delay;
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(actx.destination);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }catch(e){}
}
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]];} return a; }
function shade(hex, amt){
  const n = parseInt(hex.slice(1), 16);
  const r = n>>16, g = (n>>8)&255, b = n&255;
  const f = v => Math.round(amt < 0 ? v*(1+amt) : v + (255-v)*amt);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
function rr(c,x,y,w,h,r){
  r = Math.min(r, w/2, h/2);
  c.beginPath();
  c.moveTo(x+r,y); c.arcTo(x+w,y,x+w,y+h,r); c.arcTo(x+w,y+h,x,y+h,r);
  c.arcTo(x,y+h,x,y,r); c.arcTo(x,y,x+w,y,r); c.closePath();
}
const stationsFor = lv => Math.min(4 + lv, MAX_STATIONS);  // màn 1 = 5 ga, mỗi màn +1 ga

// ================== SINH BẢN ĐỒ LƯỚI ==================
function gridSize(n){
  const base = n <= 6 ? 6 : n <= 11 ? 7 : 8;   // ít cột hơn → ô to, dễ nhìn
  const a = (H || 700) / (W || 390);
  if (a >= 1) return { C: base, R: Math.max(base, Math.min(base*2, Math.round(base * a))) };
  return { R: base, C: Math.max(base, Math.min(base*2, Math.round(base / a))) };
}

function tryGen(n, C, R){
  const occ = new Set();
  const K = (c,r) => c*1000 + r;
  const inside = (c,r) => c>=0 && r>=0 && c<C && r<R;
  const free = (c,r) => inside(c,r) && !occ.has(K(c,r));

  // vị trí đường hầm: cạnh trên, trái hoặc phải
  let c0, r0, d0;
  // hầm luôn ở cạnh trên, gần chính giữa → bản đồ cân hai bên
  c0 = Math.round((C-1)/2) + (Math.random()*3|0) - 1; r0 = 0; d0 = 1;
  const tunnel = { type:'tunnel', g:{c:c0, r:r0}, dir:d0 };
  occ.add(K(c0,r0));
  [turnL(d0), turnR(d0)].forEach(d => { const c=c0+DIRS[d].dc, r=r0+DIRS[d].dr; if (inside(c,r)) occ.add(K(c,r)); });
  const back = (d0+2)%4; { const c=c0+DIRS[back].dc, r=r0+DIRS[back].dr; if (inside(c,r)) occ.add(K(c,r)); }

  const edges = [], switches = [], stations = [];
  const heads = [{ g:[{c:c0, r:r0}], dir:d0, from:tunnel, since:0, slot:0 }];
  let splits = 0, steps = 0;

  const finish = (h, to) => {
    const e = { from:h.from, to, g:h.g };
    edges.push(e);
    if (h.from.type === 'tunnel') h.from.edge = e; else h.from.childEdges[h.slot] = e;
    to.inEdge = e;
  };
  const terminate = (hi) => {
    const h = heads[hi], cur = h.g[h.g.length-1];
    const st = { type:'station', g:cur };
    finish(h, st); stations.push(st); heads.splice(hi, 1);
  };

  while (heads.length && steps++ < 4000) {
    const hi = Math.random()*heads.length|0, h = heads[hi];
    const cur = h.g[h.g.length-1];
    const minSince = h.from.type === 'tunnel' ? 5 : 2;   // từ hầm tới ngã rẽ đầu tiên dài ít nhất 5 ô

    if (splits >= n-1 && h.since >= 1) {
      if (Math.random() < (h.since >= 2 ? 0.6 : 0.25)) { terminate(hi); continue; }
    }
    if (splits < n-1 && h.since >= minSince && Math.random() < 0.3 + 0.15*(h.since - minSince)) {
      const opts = [h.dir, turnL(h.dir), turnR(h.dir)].filter(d => free(cur.c+DIRS[d].dc, cur.r+DIRS[d].dr));
      if (opts.length >= 2) {
        shuffle(opts);
        const ex = opts.slice(0, 2);
        const sw = { type:'switch', g:cur, din:h.dir, exits:ex, childEdges:[null,null], sel: Math.random()<0.5 ? 0 : 1 };
        finish(h, sw); switches.push(sw); heads.splice(hi, 1);
        ex.forEach((d,i) => {
          const np = { c:cur.c+DIRS[d].dc, r:cur.r+DIRS[d].dr };
          occ.add(K(np.c, np.r));
          heads.push({ g:[cur, np], dir:d, from:sw, since:1, slot:i, sinceTurn:1 });
        });
        splits++;
        continue;
      }
    }
    // đi tiếp 1 ô
    const cands = [];
    const canTurn = (h.sinceTurn || 0) >= 2;   // sau mỗi khúc rẽ phải đi thẳng ít nhất 2 ô
    [[h.dir,0.86],[turnL(h.dir),0.07],[turnR(h.dir),0.07]].forEach(([d,w]) => {
      if (d !== h.dir && !canTurn && free(cur.c+DIRS[h.dir].dc, cur.r+DIRS[h.dir].dr)) return;
      const c = cur.c+DIRS[d].dc, r = cur.r+DIRS[d].dr;
      if (!free(c,r)) return;
      let room = 0;
      for (let k=0;k<4;k++) if (free(c+DIRS[k].dc, r+DIRS[k].dr)) room++;
      cands.push({ d, w: w * (room > 0 ? 1 : 0.08) });
    });
    if (!cands.length) { if (h.since >= 1) terminate(hi); else return null; continue; }
    let x = Math.random() * cands.reduce((s,c) => s + c.w, 0), pick = cands[0];
    for (const c of cands) { x -= c.w; if (x <= 0) { pick = c; break; } }
    const np = { c:cur.c+DIRS[pick.d].dc, r:cur.r+DIRS[pick.d].dr };
    occ.add(K(np.c, np.r));
    h.sinceTurn = pick.d === h.dir ? (h.sinceTurn || 0) + 1 : 1;
    h.g.push(np); h.dir = pick.d; h.since++;
  }
  if (heads.length) return null;
  return { C, R, tunnel, switches, stations, edges };
}

// điểm "rối": càng nhiều khúc quanh, đường càng dài, khung lệch tỉ lệ màn hình thì càng cao
// điểm "rối" của bản đồ (càng thấp càng gọn, càng đều):
// - nhiều khúc quanh / cua chữ U / đoạn ray quá dài → rối
// - ga và ngã rẽ dồn vào một góc, để trống vùng khác → không đều
// - nhiều ga đứng sát nhau → khó nhìn
function messScore(m){
  let turns = 0, hairpins = 0, len = 0, longEdges = 0;
  m.edges.forEach(e => {
    let prev = null, lastTurnAt = -9, eTurns = 0;
    for (let i=1;i<e.g.length;i++){
      const d = (e.g[i].c - e.g[i-1].c) + ',' + (e.g[i].r - e.g[i-1].r);
      if (prev && d !== prev) { turns++; eTurns++; if (i - lastTurnAt <= 2) hairpins++; lastTurnAt = i; }
      prev = d; len++;
    }
    const L = e.g.length - 1;
    if (L > 6) longEdges += L - 6;
    if (eTurns >= 3) longEdges += (eTurns - 2) * 3;
  });
  // phân bố đều: chia khung thành lưới 3x3, đếm ga + ngã rẽ mỗi vùng
  const cells = new Array(9).fill(0);
  const put = g => {
    const cx = Math.min(2, Math.floor(g.c / Math.max(1, m.C) * 3));
    const cy = Math.min(2, Math.floor(g.r / Math.max(1, m.R) * 3));
    cells[cy*3 + cx]++;
  };
  m.stations.forEach(s => put(s.g)); m.switches.forEach(s => put(s.g));
  const mean = cells.reduce((a,b) => a+b, 0) / 9;
  const variance = cells.reduce((a,b) => a + (b-mean)**2, 0) / 9;
  const empty = cells.filter(c => c === 0).length;
  // ga đứng sát nhau
  let crowd = 0;
  for (let a=0;a<m.stations.length;a++) for (let b=a+1;b<m.stations.length;b++){
    const p = m.stations[a].g, q = m.stations[b].g;
    const dd = Math.abs(p.c-q.c) + Math.abs(p.r-q.r);
    if (dd <= 2) crowd += 3 - dd;          // ga cách nhau ít nhất 3 ô mới thoáng
  }
  // ngã rẽ đứng sát nhau (cụm ô tròn) → rối mắt
  let swCrowd = 0;
  for (let a=0;a<m.switches.length;a++) for (let b=a+1;b<m.switches.length;b++){
    const p = m.switches[a].g, q = m.switches[b].g;
    const d = Math.abs(p.c-q.c) + Math.abs(p.r-q.r);
    if (d <= 3) swCrowd += 4 - d;          // ngã rẽ cách nhau ít nhất 4 ô mới thoáng
  }
  // độ phủ: phần diện tích khung thật sự có ray
  const used = new Set(); m.edges.forEach(e => e.g.forEach(g => used.add(g.c*1000+g.r)));
  const fill = used.size / (m.C * m.R);
  const ar = (m.C / m.R) / ((W || 390) / (H || 700));
  return turns*6 + hairpins*15 + len*0.5 + longEdges*4
       + variance*5 + empty*12 + crowd*6 + swCrowd*5 + (fill < 0.35 ? (0.35 - fill)*80 : 0)
       + Math.abs(Math.log(ar))*12 + balance(m) + styleScore(m);
}

// độ lệch: trọng tâm ga + ngã rẽ phải gần giữa khung, hai nửa trái/phải và trên/dưới cân nhau,
// hầm nằm gần giữa cạnh trên
function balance(m){
  const pts = m.stations.map(s => s.g).concat(m.switches.map(s => s.g));
  const cx = (m.C-1)/2, cy = (m.R-1)/2;
  let mx = 0, my = 0, L = 0, Rt = 0, T = 0, B = 0;
  pts.forEach(g => { mx += g.c; my += g.r;
    if (g.c < cx) L++; else if (g.c > cx) Rt++;
    if (g.r < cy) T++; else if (g.r > cy) B++; });
  mx /= pts.length; my /= pts.length;
  return Math.abs(mx - cx) / m.C * 60 + Math.abs(my - cy) / m.R * 40
       + Math.abs(L - Rt) * 3 + Math.abs(T - B) * 2
       + Math.abs(m.tunnel.g.c - cx) * 4;
}

// học theo map mẫu người chơi khen:
// - trục chính từ hầm thẳng xuống ~40% chiều cao mới gặp ngã rẽ đầu tiên
// - khúc cua chỉ nên nằm ngay sau ngã rẽ hoặc ngay trước ga, không cua giữa đường
function styleScore(m){
  let sc = 0;
  const lead = m.tunnel.edge.g.length - 1, target = Math.max(5, Math.round(m.R * 0.4));
  if (lead < target) sc += (target - lead) * 4;
  m.edges.forEach(e => {
    const g = e.g, n = g.length;
    for (let i=1;i<n-1;i++){
      const d1 = (g[i].c-g[i-1].c)+','+(g[i].r-g[i-1].r), d2 = (g[i+1].c-g[i].c)+','+(g[i+1].r-g[i].r);
      if (d1 !== d2 && i > 1 && i < n-2) sc += 5;   // cua giữa đường
    }
  });
  return sc;
}

function generate(n){
  const {C, R} = gridSize(n);
  let best = null, bestScore = Infinity, partial = null, found = 0;
  for (let i=0; i<15000 && found < 300; i++){
    const m = tryGen(n, C, R);
    if (!m) continue;
    if (m.stations.length === n) {
      crop(m); found++;
      const sc = messScore(m);
      if (sc < bestScore) { best = m; bestScore = sc; }
    } else if (!partial || m.stations.length > partial.stations.length) partial = m;
  }
  return best || (partial && crop(partial));
}

// cắt lưới vừa khít phần đã dùng để bản đồ phủ kín màn hình
function crop(m){
  const pts = [m.tunnel.g];
  m.edges.forEach(e => pts.push(...e.g));
  let c0 = Infinity, c1 = -Infinity, r0 = Infinity, r1 = -Infinity;
  pts.forEach(p => { c0 = Math.min(c0, p.c); c1 = Math.max(c1, p.c); r0 = Math.min(r0, p.r); r1 = Math.max(r1, p.r); });
  const seen = new Set();
  pts.concat(m.switches.map(s => s.g), m.stations.map(s => s.g)).forEach(p => {
    if (seen.has(p)) return; seen.add(p); p.c -= c0; p.r -= r0;
  });
  m.C = c1 - c0 + 1; m.R = r1 - r0 + 1;
  return m;
}

// 15 màu đơn sắc, xếp theo thứ tự dễ phân biệt nhất trước:
// màn ít ga chỉ dùng những màu đầu danh sách (khác nhau rõ nhất)
const SOLID15 = ['#ef4444','#2563eb','#facc15','#f8fafc','#a855f7','#f97316','#84cc16','#ec4899',
                 '#38bdf8','#8b5a2b','#14b8a6','#9ca3af','#15803d','#f9a8d4','#1e1b4b'];
function assignColors(stations){
  const cols = shuffle(SOLID15.slice(0, stations.length));
  stations.forEach((st,i) => { st.key = i; st.a = cols[i]; st.b = cols[i]; st.two = false; });
}

function setupLevel(){
  const n = stationsFor(level);
  seed = (Math.random()*1e9)|0;
  map = generate(n);
  assignColors(map.stations);
  trains = []; particles = []; popups = []; rings = []; smoke = [];
  colorBag = []; lastKey = null;
  timeLeft = LEVEL_TIME; correct = 0; total = 0; streak = 0; bestStreak = 0;
  spawnTimer = 1.0;
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
  speed = cell * 2.6 * speedFactor;   // tốc độ cố định mọi màn
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
    setPts(e, roundPath(simplify(p), TR));
    e.tileLen = 0;
    if (e.from.type === 'switch') {
      const S = e.from.px;
      for (let d=0; d<=e.len; d+=1) { const q = pointAt(e, d); if (Math.hypot(q.x-S.x, q.y-S.y) >= TR + 1) { e.tileLen = d; break; } }
    }
    if (oldLen) trains.forEach(t => { if (t.edge === e) t.d *= e.len/oldLen; });
  });
  buildStatic();
}

function simplify(p){
  const out = [p[0]];
  for (let i=1;i<p.length-1;i++){
    const a = out[out.length-1], b = p[i], c = p[i+1];
    const cross = (b.x-a.x)*(c.y-b.y) - (b.y-a.y)*(c.x-b.x);
    if (Math.abs(cross) > 0.01) out.push(b);
  }
  out.push(p[p.length-1]);
  return out;
}

function roundPath(P, r){
  if (P.length < 3) return P;
  const out = [P[0]];
  for (let i=1;i<P.length-1;i++){
    const seg = roundCorner(out[out.length-1], P[i], P[i+1], r);
    out.push(...seg.slice(1, -1));
  }
  out.push(P[P.length-1]);
  return out;
}

function roundCorner(A, B, C, r){
  const d1 = Math.hypot(B.x-A.x, B.y-A.y), d2 = Math.hypot(C.x-B.x, C.y-B.y);
  const q = Math.min(r, d1/2, d2/2);
  if (q < 1) return [A, B, C];
  const u1 = {x:(B.x-A.x)/d1, y:(B.y-A.y)/d1}, u2 = {x:(C.x-B.x)/d2, y:(C.y-B.y)/d2};
  const p1 = {x:B.x-u1.x*q, y:B.y-u1.y*q}, p2 = {x:B.x+u2.x*q, y:B.y+u2.y*q};
  const pts = [A, p1];
  for (let i=1;i<10;i++){ const t=i/10, s=1-t;
    pts.push({x:s*s*p1.x+2*s*t*B.x+t*t*p2.x, y:s*s*p1.y+2*s*t*B.y+t*t*p2.y}); }
  pts.push(p2, C);
  return pts;
}

function setPts(e, pts){
  e.pts = pts; e.cum = [0];
  for (let i=1;i<pts.length;i++) e.cum.push(e.cum[i-1] + Math.hypot(pts[i].x-pts[i-1].x, pts[i].y-pts[i-1].y));
  e.len = e.cum[e.cum.length-1];
}

function pointAt(e, d){
  d = Math.max(0, Math.min(e.len, d));
  let lo = 1, hi = e.cum.length-1;
  while (lo < hi) { const m = (lo+hi)>>1; if (e.cum[m] < d) lo = m+1; else hi = m; }
  const i = lo;
  const seg = e.cum[i]-e.cum[i-1] || 1, t = (d - e.cum[i-1]) / seg;
  const a = e.pts[i-1], b = e.pts[i];
  return { x: a.x + (b.x-a.x)*t, y: a.y + (b.y-a.y)*t, ang: Math.atan2(b.y-a.y, b.x-a.x) };
}

function strokeEdge(c, e, maxLen){
  c.beginPath();
  c.moveTo(e.pts[0].x, e.pts[0].y);
  for (let i=1;i<e.pts.length;i++){
    if (maxLen !== undefined && e.cum[i] > maxLen) { const p = pointAt(e, maxLen); c.lineTo(p.x, p.y); break; }
    c.lineTo(e.pts[i].x, e.pts[i].y);
  }
  c.stroke();
}

function strokeRails(c, e, maxLen, under, top, wUnder, wTop){
  const end = maxLen === undefined ? e.len : Math.min(maxLen, e.len);
  const L = [], Rr = [];
  for (let s = 0; s <= end + 0.01; s += 3){
    const p = pointAt(e, Math.min(s, end));
    const nx = -Math.sin(p.ang), ny = Math.cos(p.ang), o = cell*0.09;
    L.push([p.x + nx*o, p.y + ny*o]); Rr.push([p.x - nx*o, p.y - ny*o]);
  }
  [L, Rr].forEach(rail => {
    c.beginPath(); rail.forEach((q,i) => i ? c.lineTo(q[0],q[1]) : c.moveTo(q[0],q[1]));
    if (under) { c.strokeStyle = under; c.lineWidth = wUnder; c.stroke(); }
    c.strokeStyle = top; c.lineWidth = wTop; c.stroke();
  });
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
  decos.sort((a,b) => a.y - b.y).forEach(d => drawDeco(g, d));

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
  edges.forEach(e => strokeRails(g, e, undefined, '#22272a', '#9aa4ab', 3.2, 1.5));

  // ô ngã rẽ: to, sáng màu, nổi bật trên nền tối
  map.switches.forEach(sw => {
    const {x, y} = sw.px, Rp = TR + 1;
    g.fillStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(x + 2, y + 4, Rp + 2, 0, Math.PI*2); g.fill();
    g.fillStyle = '#0f2416'; g.beginPath(); g.arc(x, y, Rp + 3, 0, Math.PI*2); g.fill();
    const pg = g.createRadialGradient(x - Rp*0.35, y - Rp*0.4, 2, x, y, Rp);
    pg.addColorStop(0, '#a6ec9c'); pg.addColorStop(1, '#5cb766');
    g.fillStyle = pg; g.beginPath(); g.arc(x, y, Rp, 0, Math.PI*2); g.fill();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,.45)';
    g.beginPath(); g.arc(x, y, Rp - 2.5, Math.PI*1.05, Math.PI*1.7); g.stroke();
  });

  // nhà ga
  map.stations.forEach(st => drawStation(g, st));

  // viền tối
  const vg = g.createRadialGradient(W/2, H/2, Math.min(W,H)*0.35, W/2, H/2, Math.max(W,H)*0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.4)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
}

function drawDeco(g, d){
  const {x, y, size:s, kind, r} = d;
  if (kind < 0.35) {
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.ellipse(x+3, y+s*0.55, s*0.95, s*0.55, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = r < 0.5 ? '#12321a' : '#163a1a';
    g.beginPath(); g.arc(x, y, s, 0, Math.PI*2); g.fill();
    g.fillStyle = r < 0.5 ? '#1c4626' : '#215023';
    g.beginPath(); g.arc(x - s*0.22, y - s*0.22, s*0.72, 0, Math.PI*2); g.fill();
    g.fillStyle = 'rgba(160,220,130,.12)';
    g.beginPath(); g.arc(x - s*0.38, y - s*0.42, s*0.3, 0, Math.PI*2); g.fill();
  } else if (kind < 0.65) {
    g.fillStyle = 'rgba(0,0,0,.2)';
    g.beginPath(); g.ellipse(x+2, y+s*0.5, s*1.3, s*0.5, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = '#1d4826';
    [[-0.6,0.1,0.7],[0.55,0.1,0.7],[0,-0.25,0.85]].forEach(([dx,dy,k]) => { g.beginPath(); g.arc(x+dx*s, y+dy*s, s*k, 0, Math.PI*2); g.fill(); });
    if (r < 0.4) { g.fillStyle = 'rgba(255,143,177,.6)'; [[-0.3,-0.3],[0.4,0],[0,0.2]].forEach(([dx,dy]) => { g.beginPath(); g.arc(x+dx*s, y+dy*s, 1.5, 0, Math.PI*2); g.fill(); }); }
  } else if (kind < 0.82) {
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.ellipse(x+1.5, y+s*0.5, s*1.1, s*0.5, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = '#4a4f48'; g.beginPath(); g.ellipse(x, y, s*1.1, s*0.75, 0, 0, Math.PI*2); g.fill();
    g.fillStyle = '#62675e'; g.beginPath(); g.ellipse(x - s*0.25, y - s*0.25, s*0.55, s*0.32, 0, 0, Math.PI*2); g.fill();
  } else if (kind >= 0.93) { // đèn đường
    const hgt = s*3.2;
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x+2, y+1, 4, 2, 0, 0, Math.PI*2); g.fill();
    g.strokeStyle = '#1b1f1d'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - hgt); g.stroke();
    g.fillStyle = '#2a2f2c'; rr(g, x - 3.5, y - hgt - 5, 7, 7, 1.5); g.fill();
    g.fillStyle = '#ffe2a0'; rr(g, x - 2.2, y - hgt - 3.8, 4.4, 4.6, 1); g.fill();
  } else {
    const cols = ['rgba(255,224,102,.55)','rgba(255,255,255,.45)','rgba(255,158,196,.55)','rgba(183,155,255,.55)'];
    for (let k=0;k<3;k++){
      g.fillStyle = cols[((r*4|0)+k)%4];
      g.beginPath(); g.arc(x + (k-1)*4, y + (k%2)*3, 1.7, 0, Math.PI*2); g.fill();
    }
  }
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
  g.fillStyle = '#141b17'; rr(g, x - w*0.12, y + h*0.56, w*0.24, h*0.44 - 4, 2.5); g.fill();
  if (w > 26) {
    g.fillStyle = 'rgba(255,248,214,.9)';
    rr(g, x - w*0.38, y + h*0.52, w*0.15, h*0.16, 1.5); g.fill();
    rr(g, x + w*0.23, y + h*0.52, w*0.15, h*0.16, 1.5); g.fill();
  }
}

// ================== KÍCH THƯỚC ==================
function resize(){
  const rect = cv.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  W = rect.width; H = rect.height;
  cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  initFireflies();
  layout();
}
window.addEventListener('resize', resize);

// ================== ĐIỀU KHIỂN ==================
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
    beep(560, 0.05, 'square', 0.035);
  }
});

// ================== TÀU ==================
function nextSpawnDelay(){
  const m = Math.max(1.8, 2.6 - 0.075*(level-1)) * (0.75 / speedFactor);   // ~5s/tàu ở level 1, ~3,5s ở level 11 (18→25 tàu mỗi round)
  const r = Math.random();
  // không cho 2 lần "dồn dập" liền nhau → tối đa 2 tàu sát nhau, không có chuỗi 3 tàu
  if (r < 0.15 && !lastBurst) { lastBurst = true; return Math.max(2.0, m * (0.55 + Math.random()*0.15)); }  // dồn dập
  lastBurst = false;
  if (r < 0.33) return m * (1.5 + Math.random()*0.6);    // nghỉ
  return m * (0.75 + Math.random()*0.6);                 // bình thường
}
let lastBurst = false;

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
  trains.push({ edge: e, prev: null, d: 0, key: st.key, a: st.a, b: st.b });
  spawnTimer = nextSpawnDelay();
}

function update(dt){
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
    for (let k=0;k<16;k++){
      const a = Math.random()*Math.PI*2, v = 60 + Math.random()*120;
      particles.push({x:cx, y:cy, vx:Math.cos(a)*v, vy:Math.sin(a)*v - 60, life:0.7+Math.random()*0.4, t:0,
        color: k%3===0 ? '#fff7c2' : (k%2 ? t.a : t.b), r: 2 + Math.random()*2.5});
    }
    rings.push({x:cx, y:cy, t:0, color:t.a});
    popups.push({x:cx, y:cy - cell*0.6, text:'✓', color:'#b9ff7a', t:0});
    beep(880, 0.08, 'sine', 0.06); beep(1320, 0.12, 'sine', 0.05, 0.07);
    if (streak >= 3) { const el = $('hStreak'); el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 150); }
  } else {
    streak = 0; shakeT = 0.3;
    popups.push({x:cx, y:cy - cell*0.6, text:'✗', color:'#ff5d6c', t:0});
    rings.push({x:cx, y:cy, t:0, color:'#ff3d5a'});
    beep(160, 0.25, 'sawtooth', 0.05);
  }
}

function updateFx(dt){
  particles.forEach(p => { p.t += dt; p.x += p.vx*dt; p.y += p.vy*dt; p.vy += 260*dt; p.vx *= 0.98; });
  particles = particles.filter(p => p.t < p.life);
  popups.forEach(p => p.t += dt); popups = popups.filter(p => p.t < 0.9);
  rings.forEach(r => r.t += dt); rings = rings.filter(r => r.t < 0.5);
  if (map) map.switches.forEach(s => { if (s.pulse) s.pulse = Math.max(0, s.pulse - dt*3.5); });
  if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
  smoke.forEach(m => { m.t += dt; m.x += m.vx*dt; m.y += m.vy*dt; });
  smoke = smoke.filter(m => m.t < m.life);
  fireflies.forEach(f => {
    f.a += (Math.random()-0.5)*dt*2;
    f.x += Math.cos(f.a)*f.v*dt; f.y += Math.sin(f.a)*f.v*dt;
    if (f.x < -10) f.x = W+10; if (f.x > W+10) f.x = -10;
    if (f.y < -10) f.y = H+10; if (f.y > H+10) f.y = -10;
  });
}

function updateHud(){
  $('hLevel').textContent = `Level ${level} · ${map ? map.stations.length : stationsFor(level)} ga`;
  $('hScore').textContent = `✓ ${correct}/${total}`;
  const tl = Math.max(0, timeLeft);
  $('hTime').textContent = Math.ceil(tl) + 's';
  const tf = $('timefill');
  tf.style.width = (tl / LEVEL_TIME * 100) + '%';
  tf.classList.toggle('low', tl <= 10);
  const st = $('hStreak');
  st.classList.toggle('hidden', streak < 3);
  st.textContent = '🔥 ' + streak;
}

function loop(ts){
  const dt = Math.min(0.05, (ts - lastT)/1000 || 0);
  lastT = ts;
  if (window.APP && window.APP.active !== 'train') { requestAnimationFrame(loop); return; }
  if (state === 'play') update(dt);
  else if (state === 'countdown') {
    const before = Math.ceil(cdT - 0.6);
    cdT -= dt; updateFx(dt);
    const after = Math.ceil(cdT - 0.6);
    if (after !== before) after >= 1 ? beep(520, 0.12, 'triangle', 0.06) : beep(880, 0.25, 'triangle', 0.07);
    if (cdT <= 0) state = 'play';
  }
  else if (state !== 'paused') updateFx(dt);
  draw(ts/1000);
  requestAnimationFrame(loop);
}

// ================== VẼ KHUNG HÌNH ==================
function draw(time){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  if (!map || !map.tunnel.edge.pts) return;
  if (shakeT > 0) { const k = shakeT*14; ctx.translate((Math.random()-0.5)*k, (Math.random()-0.5)*k); }
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
  drawTunnel();

  particles.forEach(p => {
    ctx.globalAlpha = Math.max(0, 1 - p.t/p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha = 1;
  popups.forEach(p => {
    const k = p.t/0.9;
    ctx.globalAlpha = 1 - k*k;
    ctx.font = `800 ${24 + (1-k)*6}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.strokeText(p.text, p.x, p.y - k*26);
    ctx.fillStyle = p.color; ctx.fillText(p.text, p.x, p.y - k*26);
  });
  ctx.globalAlpha = 1;

  // đếm ngược đầu màn
  if (state === 'countdown') {
    const n = Math.ceil(cdT - 0.6);
    const frac = (cdT - 0.6) - Math.floor(cdT - 0.6);
    const text = n >= 1 ? String(n) : 'Xuất phát!';
    const sc = n >= 1 ? 0.8 + frac*0.5 : 1;
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

function initFireflies(){
  fireflies = [];
  for (let i=0;i<16;i++) fireflies.push({ x: Math.random()*W, y: Math.random()*H, a: Math.random()*Math.PI*2, v: 8 + Math.random()*10 });
}

// trên ô rẽ chỉ vẽ rõ đoạn ray đang chọn; nhánh kia chỉ là vệt mờ gợi ý
function drawSwitch(s){
  const {x, y} = s.px;
  const on = s.childEdges[s.sel], off = s.childEdges[1-s.sel];
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, TR + 1, 0, Math.PI*2); ctx.clip();
  ctx.lineCap = 'butt'; ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(20,70,35,.28)'; ctx.lineWidth = cell*0.16; strokeEdge(ctx, off, off.tileLen + 6);
  ctx.strokeStyle = '#2b2e2a'; ctx.lineWidth = cell*0.32; strokeEdge(ctx, on, on.tileLen + 6);
  strokeRails(ctx, on, on.tileLen + 6, '#0d1012', '#eef3f5', 3.6, 2);
  ctx.restore();
}

// vòng màu quanh ô rẽ mà tàu gần nhất sắp chạy tới
function drawApproach(){
  const near = new Map();
  trains.forEach(t => {
    const to = t.edge.to;
    if (to.type !== 'switch') return;
    const rem = t.edge.len - t.d;
    if (rem > cell*4.5) return;
    const cur = near.get(to);
    if (!cur || rem < cur.rem) near.set(to, { rem, t });
  });
  near.forEach(({t}, s) => {
    const {x, y} = s.px;
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.beginPath(); ctx.arc(x, y, TR + 6, 0, Math.PI*2); ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = t.a;
    ctx.beginPath(); ctx.arc(x, y, TR + 6, 0, Math.PI*2); ctx.stroke();
    if (t.b !== t.a) {
      ctx.strokeStyle = t.b;
      ctx.beginPath(); ctx.arc(x, y, TR + 6, 0, Math.PI); ctx.stroke();
    }
  });
}

function drawTunnel(){
  const T = map.tunnel, d = DIRS[T.dir], k = T.k;
  ctx.save();
  ctx.translate(T.origin.x, T.origin.y);
  ctx.rotate(Math.atan2(d.dr, d.dc) - Math.PI/2);
  ctx.scale(k, k);
  const base = 20;
  ctx.fillStyle = 'rgba(0,0,0,.3)';
  ctx.beginPath(); ctx.ellipse(3, base+2, 66, 10, 0, 0, Math.PI*2); ctx.fill();
  const mg = ctx.createLinearGradient(0, -40, 0, base);
  mg.addColorStop(0, '#4b5649'); mg.addColorStop(1, '#2b3329');
  ctx.fillStyle = mg;
  ctx.beginPath();
  ctx.moveTo(-66, base);
  ctx.quadraticCurveTo(-52, -14, -24, -26);
  ctx.quadraticCurveTo(-6, -44, 14, -30);
  ctx.quadraticCurveTo(48, -18, 66, base);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  ctx.beginPath(); ctx.moveTo(-40, -12); ctx.quadraticCurveTo(-18, -34, 6, -34); ctx.quadraticCurveTo(-16, -26, -40, -12); ctx.fill();
  ctx.fillStyle = '#6b7068';
  ctx.beginPath(); ctx.moveTo(-21, base); ctx.lineTo(-21, 2); ctx.arc(0, 2, 21, Math.PI, 0); ctx.lineTo(21, base); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
  for (let i=0;i<7;i++){ const a = Math.PI + i*Math.PI/6; ctx.beginPath(); ctx.moveTo(Math.cos(a)*15, 2+Math.sin(a)*15); ctx.lineTo(Math.cos(a)*21, 2+Math.sin(a)*21); ctx.stroke(); }
  const ig = ctx.createLinearGradient(0, -14, 0, base);
  ig.addColorStop(0, '#000'); ig.addColorStop(1, '#1c211e');
  ctx.fillStyle = ig;
  ctx.beginPath(); ctx.moveTo(-15, base); ctx.lineTo(-15, 2); ctx.arc(0, 2, 15, Math.PI, 0); ctx.lineTo(15, base); ctx.closePath(); ctx.fill();
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
  } else {
    ctx.fillStyle = 'rgba(255,250,220,.85)';
    rr(ctx, -6.5, -3.5, 5, 7, 1.2); ctx.fill();
    rr(ctx, 1.5, -3.5, 5, 7, 1.2); ctx.fill();
  }
  ctx.restore();
}

function drawTrain(t){
  const k = trainScale();
  drawCar(trainPose(t, 24*k), t.b, false, k);   // toa sau = màu mái
  drawCar(trainPose(t, 0), t.a, true, k);       // đầu tàu = màu thân nhà
}

// ================== LUỒNG MÀN CHƠI ==================
function show(id, on){ $(id).classList.toggle('hidden', !on); }

function startLevel(){
  show('menu', false); show('result', false); show('paused', false);
  setupLevel();
  state = 'countdown'; cdT = 3.6;
  beep(520, 0.12, 'triangle', 0.06);
  updateHud();
}

let passed = false;
function endLevel(){
  state = 'result';
  const pct = total ? Math.round(correct/total*100) : 0;
  passed = total > 0 && pct >= 80;
  if (passed) setBest(level);
  const stars = pct >= 100 ? 3 : pct >= 90 ? 2 : pct >= 80 ? 1 : 0;
  [...$('rStars').children].forEach((s,i) => s.classList.toggle('on', i < stars));
  $('rTitle').textContent = passed ? `Qua Level ${level}! 🎉` : `Chưa qua Level ${level} 😅`;
  $('rPct').textContent = pct + '%';
  $('rCorrect').textContent = `${correct}/${total}`;
  $('rStreak').textContent = bestStreak;
  const nextN = stationsFor(level + 1);
  $('rDetail').textContent = passed
    ? (nextN > stationsFor(level) ? `Level ${level+1} có ${nextN} ga.` : `Level ${level+1}: tàu ra dày hơn.`)
    : 'Cần đúng ít nhất 80% để qua level.';
  $('rNext').textContent = passed ? `Level ${level+1} →` : `Chơi lại Level ${level}`;
  show('result', true);
  if (passed) { beep(660,0.15,'triangle',0.07); beep(880,0.15,'triangle',0.07,0.12); beep(1175,0.25,'triangle',0.07,0.24); }
  else beep(220, 0.35, 'triangle', 0.07);
}

const LV_COUNT = 11;           // level 1..11 = 5..15 ga
let chosenLv = 1;
function renderLevels(){
  const b = getBest(), grid = $('lvgrid');
  grid.innerHTML = '';
  for (let lv = 1; lv <= LV_COUNT; lv++){
    const el = document.createElement('button');
    el.className = 'lv' + (lv <= b ? ' done' : '') + (lv === chosenLv ? ' on' : '');
    el.innerHTML = `${lv}<small>${stationsFor(lv)} ga</small>`;
    el.onclick = () => { chosenLv = lv; renderLevels(); beep(700, 0.04, 'square', 0.03); };
    grid.appendChild(el);
  }
  $('startBtn').textContent = `Chơi Level ${chosenLv} · ${stationsFor(chosenLv)} ga`;
}
function toMenu(){
  state = 'menu';
  const b = getBest();
  chosenLv = Math.min(b + 1, LV_COUNT);
  $('bestTxt').textContent = b ? `Đã qua tới Level ${b}` : '';
  renderLevels();
  show('result', false); show('paused', false); show('menu', true);
}

$('startBtn').onclick = () => { level = chosenLv; startLevel(); };
$('rNext').onclick = () => { if (passed) level++; startLevel(); };
$('rMenu').onclick = toMenu;
$('pauseBtn').onclick = () => { if (state === 'play') { state = 'paused'; show('paused', true); } };
$('resumeBtn').onclick = () => { show('paused', false); state = 'play'; };
$('restartBtn').onclick = startLevel;
$('quitBtn').onclick = toMenu;
document.addEventListener('visibilitychange', () => {
  if (document.hidden && state === 'play') { state = 'paused'; show('paused', true); }
});

// mở game tàu từ trang chủ
window.trainEnter = () => {
  resize();
  if (!map) { level = 4; setupLevel(); }
  toMenu();
};
window.trainBest = () => getBest();
requestAnimationFrame(loop);
})();
