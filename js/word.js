// ======================= GAME ĐOÁN CỤM TỪ =======================
(() => {
const $ = id => document.getElementById(id);
const MAX_TRIES = 6;
// cụm 2 từ thông dụng + gợi ý chủ đề; được xếp theo tổng số chữ cái (ngắn → dài)
const PHRASES = [
  ['bà nội','Gia đình'], ['cà phê','Đồ uống'], ['áo dài','Trang phục'], ['phở bò','Món ăn'], ['ước mơ','Cảm xúc, khái niệm'],
  ['xe đạp','Phương tiện'], ['bánh mì','Món ăn'], ['trà sữa','Đồ uống'], ['mùa thu','Thời tiết, mùa'], ['con mèo','Động vật'],
  ['bún chả','Món ăn'], ['sân bay','Địa điểm'], ['núi lửa','Thiên nhiên'], ['nụ cười','Cảm xúc, khái niệm'], ['bóng đá','Thể thao'],
  ['đồng hồ','Đồ vật'], ['du lịch','Hoạt động'], ['âm nhạc','Nghệ thuật'], ['khiêu vũ','Hoạt động'], ['hoa hồng','Thiên nhiên'],
  ['bãi biển','Địa điểm'], ['gia đình','Gia đình'], ['học sinh','Con người'], ['bầu trời','Thiên nhiên'], ['mặt trời','Thiên nhiên'],
  ['máy tính','Đồ vật'], ['thư viện','Địa điểm'], ['bạn thân','Con người'], ['đại dương','Thiên nhiên'], ['cầu vồng','Thiên nhiên'],
  ['mưa phùn','Thời tiết, mùa'], ['nhà hàng','Địa điểm'], ['trái tim','Cảm xúc, khái niệm'], ['tình yêu','Cảm xúc, khái niệm'], ['kính râm','Đồ vật'],
  ['thành phố','Địa điểm'], ['pháo hoa','Sự kiện'], ['bệnh viện','Địa điểm'], ['hạnh phúc','Cảm xúc, khái niệm'], ['nông thôn','Địa điểm'],
  ['sinh nhật','Sự kiện'], ['trường học','Địa điểm'], ['ánh trăng','Thiên nhiên'], ['điện thoại','Đồ vật'], ['bánh chưng','Món ăn'],
  ['giáng sinh','Sự kiện'], ['thanh xuân','Cảm xúc, khái niệm'], ['nghệ thuật','Nghệ thuật'], ['chiêm nghiệm','Cảm xúc, khái niệm'],
].map(([p, cat]) => ({ words: p.normalize('NFC').split(' ').map(w => [...w]), cat }))
 .map((x, i) => ({ ...x, i, n: x.words[0].length + x.words[1].length }))
 .sort((a, b) => a.n - b.n || a.i - b.i);
const LV_MAX = PHRASES.length;

// ---------- xử lý dấu tiếng Việt ----------
const TONES = ['́', '̀', '̉', '̃', '̣'];   // sắc, huyền, hỏi, ngã, nặng
const VOWELS = new Set([...'aăâeêioôơuưy']);
function split(ch){
  const d = ch.normalize('NFD');
  let tone = '', rest = '';
  for (const c of d) { if (TONES.includes(c)) tone = c; else rest += c; }
  return { base: rest.normalize('NFC'), tone };
}
const compose = (base, tone) => (base.normalize('NFD') + tone).normalize('NFC');
const isVowel = ch => VOWELS.has(split(ch).base);
const noTone = ch => split(ch).base;

// ---------- trạng thái ----------
let level = 1, chosen = 1, puzzle = null, rows = [], cur = [], state = 'menu', passed = false, hintShown = false;
const keyState = {};
let actx = null;
function beep(f, d, type='sine', v=0.05, delay=0){
  try{ if(!actx) actx = new (window.AudioContext||window.webkitAudioContext)();
    const t0 = actx.currentTime + delay, o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0); g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + d + 0.02);
  }catch(e){}
}
const getLv = () => { try { return Math.max(1, +localStorage.getItem('word_lv') || 1); } catch(e){ return 1; } };
const setLv = v => { try { localStorage.setItem('word_lv', v); } catch(e){} };

const L1 = () => puzzle.words[0].length, L2 = () => puzzle.words[1].length, N = () => L1() + L2();
const target = () => puzzle.words[0].concat(puzzle.words[1]);

// ---------- chấm điểm một lượt đoán ----------
function evaluate(guess){
  const T = target(), res = new Array(T.length).fill('gray');
  const left = {}, leftBase = {};
  T.forEach((t, i) => { if (guess[i] === t) res[i] = 'green'; else left[t] = (left[t] || 0) + 1; });
  guess.forEach((g, i) => { if (res[i] === 'green') return; if (left[g] > 0) { res[i] = 'yellow'; left[g]--; } });
  Object.entries(left).forEach(([t, c]) => { if (c > 0 && isVowel(t)) leftBase[noTone(t)] = (leftBase[noTone(t)] || 0) + c; });
  guess.forEach((g, i) => {
    if (res[i] !== 'gray' || !isVowel(g)) return;
    const b = noTone(g);
    if (leftBase[b] > 0) { res[i] = 'blue'; leftBase[b]--; }
  });
  return res;
}

// ---------- vẽ bảng ----------
function cellSize(){
  const slots = N() + 1;
  const w = Math.min(window.innerWidth, 520) - 24;
  return Math.max(24, Math.min(50, Math.floor((w - (slots-1)*5) / slots)));
}
function renderBoard(){
  const b = $('wBoard'); b.innerHTML = '';
  const sz = cellSize();
  b.style.setProperty('--cs', sz + 'px');
  for (let r = 0; r < MAX_TRIES; r++){
    const row = document.createElement('div'); row.className = 'wrow';
    const data = rows[r] || (r === rows.length ? { letters: cur, res: null } : { letters: [], res: null });
    for (let i = 0; i < N(); i++){
      if (i === L1()) { const gap = document.createElement('div'); gap.className = 'wgap'; row.appendChild(gap); }
      const c = document.createElement('div');
      c.className = 'wcell' + (data.res ? ' ' + data.res[i] : (data.letters[i] ? ' filled' : ''));
      if (r === rows.length && i === data.letters.length && state === 'play') c.classList.add('caret');
      c.textContent = (data.letters[i] || '').toUpperCase();
      row.appendChild(c);
    }
    b.appendChild(row);
  }
}
function renderKeys(){
  document.querySelectorAll('#wKeys button[data-k]').forEach(k => {
    const s = keyState[k.dataset.k];
    k.classList.remove('green','yellow','gray');
    if (s) k.classList.add(s);
  });
}
function hud(){
  $('wLevel').textContent = `Level ${level} · ${L1()}+${L2()} chữ`;
  $('wTries').textContent = `Lượt ${Math.min(rows.length + 1, MAX_TRIES)}/${MAX_TRIES}`;
  $('wHint').textContent = hintShown ? `💡 Chủ đề: ${puzzle.cat}` : '💡 Xem gợi ý chủ đề';
  $('wHint').classList.toggle('shown', hintShown);
}
function toast(msg){
  const t = $('wToast'); t.textContent = msg; t.classList.add('on');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1400);
}

// ---------- nhập liệu ----------
function lastVowelIndex(){
  // dấu thanh gắn vào nguyên âm gõ gần nhất trong từ đang gõ
  const start = cur.length > L1() ? L1() : 0;
  for (let i = cur.length - 1; i >= start; i--) if (isVowel(cur[i])) return i;
  return -1;
}
function key(k){
  if (state !== 'play') return;
  if (k === 'del') { cur.pop(); }
  else if (k === 'enter') { submit(); return; }
  else if (k === 'mu' || k === 'trang' || k === 'moc') {
    if (!cur.length) return;
    const i = cur.length - 1, { base, tone } = split(cur[i]);
    const map = {
      mu:    { a:'â', â:'a', e:'ê', ê:'e', o:'ô', ô:'o' },
      trang: { a:'ă', ă:'a' },
      moc:   { o:'ơ', ơ:'o', u:'ư', ư:'u' },
    }[k];
    if (!map[base]) { toast(k === 'mu' ? 'Dấu mũ dùng cho a, e, o' : k === 'trang' ? 'Dấu trăng dùng cho a' : 'Dấu móc dùng cho o, u'); return; }
    cur[i] = compose(map[base], tone);
  }
  else if (TONES.includes(k)) {
    const i = lastVowelIndex();
    if (i < 0) { toast('Gõ nguyên âm trước rồi mới thêm dấu'); return; }
    const { base, tone } = split(cur[i]);
    cur[i] = compose(base, tone === k ? '' : k);
  }
  else if (cur.length < N()) cur.push(k);
  renderBoard();
}
function submit(){
  if (cur.length < N()) { toast(`Cần đủ ${N()} chữ cái`); beep(200, 0.1, 'square', 0.03); return; }
  const res = evaluate(cur);
  rows.push({ letters: cur.slice(), res });
  cur.forEach((ch, i) => {
    const b = noTone(ch), plain = b === 'đ' ? 'đ' : b.normalize('NFD')[0];
    if (isVowel(ch)) return;      // chỉ tô màu phím phụ âm cho rõ ràng
    const rank = { green: 3, yellow: 2, blue: 1, gray: 0 };
    const s = res[i] === 'blue' ? 'gray' : res[i];
    if (!keyState[plain] || rank[s] > rank[keyState[plain]]) keyState[plain] = s;
  });
  cur = [];
  const win = res.every(r => r === 'green');
  renderBoard(); renderKeys(); hud();
  if (win) { beep(880,0.1,'sine',0.06); beep(1320,0.14,'sine',0.05,0.08); setTimeout(() => finish(true), 700); }
  else if (rows.length >= MAX_TRIES) { beep(200,0.25,'triangle',0.05); setTimeout(() => finish(false), 700); }
  else beep(520, 0.06, 'triangle', 0.04);
}

// ---------- luồng chơi ----------
function startLevel(L){
  level = L; puzzle = PHRASES[L-1]; rows = []; cur = []; hintShown = false;
  Object.keys(keyState).forEach(k => delete keyState[k]);
  ['wmenu','wresult'].forEach(id => $(id).classList.add('hidden'));
  state = 'play';
  renderBoard(); renderKeys(); hud();
}
function finish(win){
  state = 'result'; passed = win;
  if (win && level + 1 > getLv()) setLv(level + 1);
  const ans = puzzle.words.map(w => w.join('')).join(' ').toUpperCase();
  $('wrTitle').textContent = win ? `Chính xác! 🎉` : `Hết lượt rồi 😅`;
  $('wrBig').textContent = win ? ans : '? ? ?';
  $('wrDetail').textContent = win ? `Bạn đoán ra sau ${rows.length}/${MAX_TRIES} lượt.` : 'Bạn có thể chơi lại cụm từ này, hoặc xem đáp án.';
  $('wrNext').textContent = win ? (level < LV_MAX ? `Level ${level+1} →` : 'Chơi lại từ Level 1') : `Chơi lại Level ${level}`;
  $('wrReveal').classList.toggle('hidden', win);
  $('wresult').classList.remove('hidden');
}
function renderLevels(){
  const done = getLv() - 1, grid = $('wlvgrid'); grid.innerHTML = '';
  for (let L = 1; L <= LV_MAX; L++){
    const el = document.createElement('button');
    el.className = 'lv' + (L <= done ? ' done' : '') + (L === chosen ? ' on' : '');
    el.innerHTML = `${L}<small>${PHRASES[L-1].n} chữ</small>`;
    el.onclick = () => { chosen = L; renderLevels(); beep(700, 0.04, 'square', 0.03); };
    grid.appendChild(el);
  }
  $('wStart').textContent = `Chơi Level ${chosen} · ${PHRASES[chosen-1].n} chữ cái`;
}
function toMenu(){
  state = 'menu';
  chosen = Math.min(getLv(), LV_MAX);
  renderLevels();
  const done = getLv() - 1;
  $('wBestTxt').textContent = done ? `Đã qua tới Level ${done}/${LV_MAX}` : '';
  $('wresult').classList.add('hidden'); $('wmenu').classList.remove('hidden');
  puzzle = PHRASES[chosen-1]; level = chosen; rows = []; cur = [];
  renderBoard(); renderKeys(); hud();
}

document.querySelectorAll('#wKeys button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); key(b.dataset.k || b.dataset.a); }));
document.addEventListener('keydown', e => {
  if (!window.APP || window.APP.active !== 'word' || state !== 'play') return;
  if (e.key === 'Backspace') key('del');
  else if (e.key === 'Enter') key('enter');
  else if (/^[a-zđ]$/i.test(e.key)) key(e.key.toLowerCase());
});
$('wHint').onclick = () => { if (state === 'play') { hintShown = true; hud(); } };
$('wStart').onclick = () => startLevel(chosen);
$('wrNext').onclick = () => startLevel(passed ? (level < LV_MAX ? level + 1 : 1) : level);
$('wrReveal').onclick = () => {
  $('wrBig').textContent = puzzle.words.map(w => w.join('')).join(' ').toUpperCase();
  $('wrDetail').textContent = 'Lần sau sẽ đoán ra thôi!';
  $('wrReveal').classList.add('hidden');
  $('wrNext').textContent = level < LV_MAX ? `Level ${level+1} →` : 'Về Level 1';
  passed = true;   // cho phép đi tiếp, nhưng không đánh dấu ✓ level này
};
$('wrMenu').onclick = toMenu;
$('wMenuBtn').onclick = toMenu;
window.addEventListener('resize', () => { if (window.APP && window.APP.active === 'word' && puzzle) renderBoard(); });
window.wordEnter = toMenu;
window.wordBest = () => getLv() - 1;
})();

