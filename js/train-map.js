// Đường Ray Tư Duy, part 1 of 2: map generator, path geometry and static art.
// Pure functions with no game state; js/train.js reads them from window.RTD_MAP.
// Must load BEFORE js/train.js:  <script src="js/train-map.js"></script>
(() => {
'use strict';
const MAX_STATIONS = 15;
const DIRS = [{dc:1,dr:0},{dc:0,dr:1},{dc:-1,dr:0},{dc:0,dr:-1}]; // Đông, Nam, Tây, Bắc
const turnL = d => (d+3)%4, turnR = d => (d+1)%4;
let W = 390, H = 700;      // viewport the current map is generated for (gridSize, messScore read it)

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
  const g = a >= 1 ? { C: base, R: Math.max(base, Math.min(base*2, Math.round(base * a))) }
                   : { R: base, C: Math.max(base, Math.min(base*2, Math.round(base / a))) };
  // Square screens (tablet, desktop window) give base×base: 8×8 cannot fit 15 stations plus the
  // 5-cell lead from the tunnel, so generate() fell back to a partial map. Keep ≥ 6 cells per station.
  while (g.C * g.R < 6 * n) { if (g.C <= g.R) g.C++; else g.R++; }
  return g;
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


// Manhattan distance between the two closest switches. Two discs one cell apart overlap and
// a slightly-off tap flips the wrong one (RTD-03), so generate() refuses maps under 2.
function minSwitchDist(m){
  let best = Infinity;
  for (let a=0;a<m.switches.length;a++) for (let b=a+1;b<m.switches.length;b++){
    const p = m.switches[a].g, q = m.switches[b].g;
    best = Math.min(best, Math.abs(p.c-q.c) + Math.abs(p.r-q.r));
  }
  return best;
}
const MIN_SW_DIST = 2;

function generate(n, vw, vh){
  if (vw && vh) { W = vw; H = vh; }
  const {C, R} = gridSize(n);
  let best = null, bestScore = Infinity, partial = null, found = 0, loose = null, looseScore = Infinity;
  for (let i=0; i<15000 && found < 300; i++){
    const m = tryGen(n, C, R);
    if (!m) continue;
    if (m.stations.length === n) {
      crop(m);
      const sc = messScore(m);
      if (minSwitchDist(m) < MIN_SW_DIST) { if (sc < looseScore) { loose = m; looseScore = sc; } continue; }
      found++;
      if (sc < bestScore) { best = m; bestScore = sc; }
    } else if (!partial || m.stations.length > partial.stations.length) partial = m;
  }
  return best || loose || (partial && crop(partial));
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

function strokeRails(c, e, maxLen, under, top, wUnder, wTop, cell){
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

function drawTunnel(ctx, T){
  const d = DIRS[T.dir], k = T.k;
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

// Second cue next to colour (RTD-08): every station colour has its own shape, drawn white with a
// dark outline on the station wall and on the rear train car, upright so it reads at any heading.
// Index = position in SOLID15, so a colour always keeps the same shape across levels.
const GLYPHS = ['circle','square','triangle','plus','star','diamond','cross','triDown','ring','bar',
                'heart','hexagon','dots','halfDisc','pentagon'];
function poly(c, x, y, r, n, rot){
  c.beginPath();
  for (let i=0;i<n;i++){ const a = rot + i*Math.PI*2/n; i ? c.lineTo(x+Math.cos(a)*r, y+Math.sin(a)*r) : c.moveTo(x+Math.cos(a)*r, y+Math.sin(a)*r); }
  c.closePath();
}
function glyphPath(c, kind, x, y, r){
  const up = -Math.PI/2;
  switch (kind) {
    case 'circle': c.beginPath(); c.arc(x, y, r*0.85, 0, Math.PI*2); break;
    case 'square': c.beginPath(); c.rect(x-r*0.75, y-r*0.75, r*1.5, r*1.5); break;
    case 'triangle': poly(c, x, y+r*0.12, r*1.05, 3, up); break;
    case 'triDown': poly(c, x, y-r*0.12, r*1.05, 3, -up); break;
    case 'diamond': poly(c, x, y, r*1.05, 4, up); break;
    case 'hexagon': poly(c, x, y, r*0.95, 6, 0); break;
    case 'pentagon': poly(c, x, y, r*0.95, 5, up); break;
    case 'star': c.beginPath();
      for (let i=0;i<10;i++){ const a = up + i*Math.PI/5, q = i%2 ? r*0.45 : r*1.05; i ? c.lineTo(x+Math.cos(a)*q, y+Math.sin(a)*q) : c.moveTo(x+Math.cos(a)*q, y+Math.sin(a)*q); }
      c.closePath(); break;
    case 'plus': { const t = r*0.36; c.beginPath();
      c.moveTo(x-t, y-r); c.lineTo(x+t, y-r); c.lineTo(x+t, y-t); c.lineTo(x+r, y-t); c.lineTo(x+r, y+t); c.lineTo(x+t, y+t);
      c.lineTo(x+t, y+r); c.lineTo(x-t, y+r); c.lineTo(x-t, y+t); c.lineTo(x-r, y+t); c.lineTo(x-r, y-t); c.lineTo(x-t, y-t); c.closePath(); break; }
    case 'cross': c.save(); c.translate(x, y); c.rotate(Math.PI/4); glyphPath(c, 'plus', 0, 0, r*1.05); c.restore(); break;
    case 'ring': c.beginPath(); c.arc(x, y, r*0.9, 0, Math.PI*2); c.moveTo(x+r*0.42, y); c.arc(x, y, r*0.42, 0, Math.PI*2, true); break;
    case 'bar': c.beginPath(); c.rect(x-r, y-r*0.38, r*2, r*0.76); break;
    case 'heart': c.beginPath(); c.moveTo(x, y+r*0.95);
      c.bezierCurveTo(x-r*1.25, y+r*0.05, x-r*0.7, y-r*1.05, x, y-r*0.35);
      c.bezierCurveTo(x+r*0.7, y-r*1.05, x+r*1.25, y+r*0.05, x, y+r*0.95); c.closePath(); break;
    case 'dots': c.beginPath(); c.arc(x-r*0.5, y, r*0.48, 0, Math.PI*2); c.moveTo(x+r*0.98, y); c.arc(x+r*0.5, y, r*0.48, 0, Math.PI*2); break;
    case 'halfDisc': c.beginPath(); c.arc(x, y+r*0.3, r, Math.PI, 0); c.closePath(); break;
  }
}
function drawGlyph(c, idx, x, y, r){
  const kind = GLYPHS[idx % GLYPHS.length];
  c.save();
  c.lineJoin = 'round';
  glyphPath(c, kind, x, y, r);
  c.lineWidth = Math.max(1.4, r*0.42); c.strokeStyle = 'rgba(10,14,12,.9)'; c.stroke();
  c.fillStyle = '#fff'; c.fill('evenodd');
  c.restore();
}

window.RTD_MAP = { MAX_STATIONS, DIRS, mulberry32, shuffle, shade, rr, stationsFor, generate, minSwitchDist,
  simplify, roundPath, setPts, pointAt, strokeEdge, strokeRails, drawDeco, drawTunnel, drawGlyph, GLYPHS };
})();
