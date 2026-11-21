// Minimal standalone ISO/IEC 18004 QR Code SVG encoder (Versions 1-6, Byte mode, ECC Level M).
// Own implementation (no external dependencies); keeps QR sharing working offline.
(() => {
  const EXP = new Uint8Array(512);
  const LOG = new Uint8Array(256);
  for (let i = 0, x = 1; i < 255; i++) {
    EXP[i] = EXP[i + 255] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11D;
  }
  const mul = (a, b) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

  const rsEc = (data, ecLen) => {
    let g = [1];
    for (let i = 0; i < ecLen; i++) {
      const next = new Array(g.length + 1).fill(0);
      for (let j = 0; j < g.length; j++) {
        next[j] ^= g[j];
        next[j + 1] ^= mul(g[j], EXP[i]);
      }
      g = next;
    }
    const rem = new Uint8Array(data.length + ecLen);
    rem.set(data);
    for (let i = 0; i < data.length; i++) {
      const c = rem[i];
      if (!c) continue;
      for (let j = 0; j < g.length; j++) rem[i + j] ^= mul(g[j], c);
    }
    return rem.slice(data.length);
  };

  // [version, numBlocks, dataCodewordsPerBlock, ecCodewordsPerBlock, alignCenters]
  const SPECS = [
    [1, 1, 16, 10, []],
    [2, 1, 28, 16, [6, 18]],
    [3, 1, 44, 26, [6, 22]],
    [4, 2, 32, 18, [6, 26]],
    [5, 2, 43, 24, [6, 30]],
    [6, 4, 27, 16, [6, 34]],
  ];

  const MASK_FN = [
    (r, c) => ((r + c) & 1) === 0,
    (r, c) => (r & 1) === 0,
    (r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => ((r >> 1) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) & 1) + ((r * c) % 3)) % 2 === 0,
  ];

  const penalty = (m, n) => {
    let score = 0;
    let dark = 0;
    const p1 = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0];
    const p2 = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1];
    for (let r = 0; r < n; r++) {
      let rr = 0, rp = -1, cr = 0, cp = -1;
      for (let c = 0; c < n; c++) {
        const rv = m[r][c];
        const cv = m[c][r];
        dark += rv;
        if (rv === rp) { rr++; if (rr === 5) score += 3; else if (rr > 5) score += 1; } else { rp = rv; rr = 1; }
        if (cv === cp) { cr++; if (cr === 5) score += 3; else if (cr > 5) score += 1; } else { cp = cv; cr = 1; }
        if (r < n - 1 && c < n - 1 && rv === m[r][c + 1] && rv === m[r + 1][c] && rv === m[r + 1][c + 1]) score += 3;
        if (c <= n - 11) {
          let mr1 = true, mr2 = true, mc1 = true, mc2 = true;
          for (let k = 0; k < 11; k++) {
            if (m[r][c + k] !== p1[k]) mr1 = false;
            if (m[r][c + k] !== p2[k]) mr2 = false;
            if (m[c + k][r] !== p1[k]) mc1 = false;
            if (m[c + k][r] !== p2[k]) mc2 = false;
          }
          if (mr1 || mr2) score += 40;
          if (mc1 || mc2) score += 40;
        }
      }
    }
    return score + Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  };

  function encode(text) {
    const bytes = new TextEncoder().encode(text);
    const spec = SPECS.find(s => bytes.length <= s[1] * s[2] - 2);
    if (!spec) throw new RangeError('QR payload exceeds Version 6 ECC M limit');
    const [ver, numBlocks, dpb, epb, aligns] = spec;
    const totalData = numBlocks * dpb;
    const bits = [];
    const push = (v, l) => { for (let i = l - 1; i >= 0; i--) bits.push((v >> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, 8);
    for (const b of bytes) push(b, 8);
    for (let i = 0, t = Math.min(4, totalData * 8 - bits.length); i < t; i++) bits.push(0);
    while (bits.length % 8) bits.push(0);

    const code = [];
    for (let i = 0; i < bits.length; i += 8) {
      let v = 0;
      for (let j = 0; j < 8; j++) v = (v << 1) | bits[i + j];
      code.push(v);
    }
    for (let i = 0; code.length < totalData; i++) code.push(i & 1 ? 0x11 : 0xEC);

    const blocks = [];
    for (let b = 0; b < numBlocks; b++) {
      const d = code.slice(b * dpb, (b + 1) * dpb);
      blocks.push({ d, ec: rsEc(d, epb) });
    }
    const stream = [];
    for (let i = 0; i < dpb; i++) for (const b of blocks) stream.push(b.d[i]);
    for (let i = 0; i < epb; i++) for (const b of blocks) stream.push(b.ec[i]);
    const allBits = [];
    for (const byte of stream) for (let i = 7; i >= 0; i--) allBits.push((byte >> i) & 1);

    const n = 17 + 4 * ver;
    const base = Array.from({ length: n }, () => new Uint8Array(n));
    const func = Array.from({ length: n }, () => new Uint8Array(n));
    const setF = (r, c, v) => {
      if (r >= 0 && r < n && c >= 0 && c < n) {
        base[r][c] = v ? 1 : 0;
        func[r][c] = 1;
      }
    };
    const finder = (r0, c0) => {
      for (let dr = -1; dr <= 7; dr++) {
        for (let dc = -1; dc <= 7; dc++) {
          const inF = dr >= 0 && dr <= 6 && dc >= 0 && dc <= 6;
          setF(r0 + dr, c0 + dc, inF && (dr === 0 || dr === 6 || dc === 0 || dc === 6 || (dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4)));
        }
      }
    };
    finder(0, 0);
    finder(0, n - 7);
    finder(n - 7, 0);
    for (let i = 8; i < n - 8; i++) { setF(6, i, (i & 1) === 0); setF(i, 6, (i & 1) === 0); }
    for (const ar of aligns) {
      for (const ac of aligns) {
        if (func[ar][ac]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) setF(ar + dr, ac + dc, Math.abs(dr) === 2 || Math.abs(dc) === 2 || (!dr && !dc));
        }
      }
    }
    setF(4 * ver + 9, 8, 1);
    for (let i = 0; i < 9; i++) { func[8][i] = 1; func[i][8] = 1; }
    for (let i = 0; i < 8; i++) { func[8][n - 1 - i] = 1; if (i < 7) func[n - 1 - i][8] = 1; }

    let bitIdx = 0;
    let upward = true;
    for (let right = n - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let step = 0; step < n; step++) {
        const r = upward ? n - 1 - step : step;
        for (let dc = 0; dc < 2; dc++) {
          const c = right - dc;
          if (!func[r][c]) base[r][c] = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
        }
      }
      upward = !upward;
    }

    const c1 = [[0,8],[1,8],[2,8],[3,8],[4,8],[5,8],[7,8],[8,8],[8,7],[8,5],[8,4],[8,3],[8,2],[8,1],[8,0]];
    const c2 = [[8,n-1],[8,n-2],[8,n-3],[8,n-4],[8,n-5],[8,n-6],[8,n-7],[8,n-8],[n-7,8],[n-6,8],[n-5,8],[n-4,8],[n-3,8],[n-2,8],[n-1,8]];
    let bestScore = Infinity;
    let bestMat = null;
    for (let mask = 0; mask < 8; mask++) {
      const m = base.map(row => row.slice());
      const fn = MASK_FN[mask];
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!func[r][c] && fn(r, c)) m[r][c] ^= 1;
      let rem = mask << 10;
      for (let i = 4; i >= 0; i--) if (rem & (1 << (i + 10))) rem ^= 0x537 << i;
      const fmt = ((mask << 10) | rem) ^ 0x5412;
      for (let i = 0; i < 15; i++) {
        const b = (fmt >> i) & 1;
        m[c1[i][0]][c1[i][1]] = b;
        m[c2[i][0]][c2[i][1]] = b;
      }
      const sc = penalty(m, n);
      if (sc < bestScore) { bestScore = sc; bestMat = m; }
    }
    return { size: n, mat: bestMat };
  }

  const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  function svg(text, opts = {}) {
    const fg = opts.fg || '#102218';
    const bg = opts.bg || '#faf5ea';
    const qz = Number.isInteger(opts.qz) ? opts.qz : 4;
    const label = opts.label || ('Mã QR mở ' + text);
    const { size, mat } = encode(text);
    const total = size + qz * 2;
    let d = '';
    for (let r = 0; r < size; r++) {
      let c = 0;
      while (c < size) {
        if (!mat[r][c]) { c++; continue; }
        let run = 1;
        while (c + run < size && mat[r][c + run]) run++;
        d += `M${c + qz},${r + qz}h${run}v1h-${run}z`;
        c += run;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" shape-rendering="crispEdges" role="img" aria-label="${esc(label)}"><rect width="${total}" height="${total}" fill="${esc(bg)}"/><path fill="${esc(fg)}" d="${d}"/></svg>`;
  }

  window.BBQR = { svg, encode };
})();
