// ======================= GAME ĐOÁN CỤM TỪ =======================
(() => {
const $ = id => document.getElementById(id);
const BB = window.BB;
const MAX_TRIES = 6;
// ---------- @pure-begin: không DOM, không BB. scripts/sim/adapters/word.mjs đọc nguyên khối này để bot dùng đúng luật game ----------
// cụm 2 từ thông dụng + gợi ý chủ đề; được xếp theo tổng số chữ cái (ngắn → dài). Đây chỉ là thứ tự dự phòng
// khi thiếu BBD; thứ tự chơi thật nằm ở js/levels/word.js (xếp theo độ khó đo được).
// Gợi ý không được chứa từ nào của đáp án, cũng không được trùng một đáp án khác (kiểm trong tests/word.spec.js).
const RAW_PHRASES = [
  ['bà nội','Người thân'], ['cà phê','Đồ uống'], ['áo dài','Trang phục'], ['phở bò','Món ăn'], ['ước mơ','Cảm xúc, khái niệm'],
  ['xe đạp','Phương tiện'], ['bánh mì','Món ăn'], ['trà sữa','Đồ uống'], ['mùa thu','Thời gian'], ['con mèo','Động vật'],
  ['bún chả','Món ăn'], ['sân bay','Địa điểm'], ['núi lửa','Thiên nhiên'], ['nụ cười','Biểu cảm'], ['bóng đá','Thể thao'],
  ['đồng hồ','Đồ vật'], ['du lịch','Hoạt động'], ['âm nhạc','Giải trí'], ['khiêu vũ','Hoạt động'], ['hoa hồng','Thiên nhiên'],
  ['bãi biển','Địa điểm'], ['gia đình','Mối quan hệ'], ['học sinh','Con người'], ['bầu trời','Thiên nhiên'], ['mặt trời','Thiên nhiên'],
  ['máy tính','Đồ vật'], ['thư viện','Địa điểm'], ['bạn thân','Con người'], ['đại dương','Thiên nhiên'], ['cầu vồng','Thiên nhiên'],
  ['mưa phùn','Thời tiết'], ['nhà hàng','Địa điểm'], ['trái tim','Cơ thể'], ['tình yêu','Cảm xúc, khái niệm'], ['kính râm','Đồ vật'],
  ['thành phố','Địa điểm'], ['pháo hoa','Lễ hội'], ['bệnh viện','Địa điểm'], ['hạnh phúc','Cảm xúc, khái niệm'], ['nông thôn','Địa điểm'],
  ['sinh nhật','Sự kiện'], ['trường học','Địa điểm'], ['ánh trăng','Thiên nhiên'], ['điện thoại','Đồ vật'], ['bánh chưng','Món ăn'],
  ['giáng sinh','Sự kiện'], ['thanh xuân','Cảm xúc, khái niệm'], ['nghệ thuật','Văn hoá'], ['truyền thống','Văn hoá'],
  ['nước mía','Đồ uống'],
];
// ---------- chữ tiếng Việt ----------
const TONES = ['́', '̀', '̉', '̃', '̣'];   // sắc, huyền, hỏi, ngã, nặng
const TONE_NAME = ['Dấu sắc', 'Dấu huyền', 'Dấu hỏi', 'Dấu ngã', 'Dấu nặng'];
const VOWELS = new Set([...'aăâeêioôơuưy']);
const LETTERS = new Set([...'abcdđeghiklmnopqrstuvxy', ...'ăâêôơư']);
function split(ch){
  const d = ch.normalize('NFD');
  let tone = '', rest = '';
  for (const c of d) { if (TONES.includes(c)) tone = c; else rest += c; }
  return { base: rest.normalize('NFC'), tone };
}
const compose = (base, tone) => (base.normalize('NFD') + tone).normalize('NFC');
const noTone = ch => split(ch).base;
const isVowel = ch => VOWELS.has(noTone(ch));
// Họ nguyên âm: bỏ cả dấu thanh lẫn mũ/trăng/móc (ô, ơ → o). đ giữ nguyên.
const fam = ch => ch === 'đ' ? 'đ' : ch.normalize('NFD')[0];

// Vị trí nhận dấu thanh trong một âm tiết (mảng chữ đã bỏ thanh), theo quy tắc chính tả kiểu cũ
// (hòa, thủy, mùa, thoại, nội, cười, khiêu, truyền). Trả -1 khi chưa có nguyên âm.
function tonePos(w){
  let v0 = w.findIndex(c => VOWELS.has(c));
  if (v0 < 0) return -1;
  if ((w[0] === 'q' && w[1] === 'u' || w[0] === 'g' && w[1] === 'i') && VOWELS.has(w[2])) v0 = 2;
  let v1 = v0; while (v1 + 1 < w.length && VOWELS.has(w[v1 + 1])) v1++;
  const cl = []; for (let i = v0; i <= v1; i++) cl.push(i);
  const horn = cl.find(i => w[i] === 'ơ');
  if (horn !== undefined) return horn;
  const hat = cl.find(i => 'ăâêôư'.includes(w[i]));
  if (hat !== undefined) return hat;
  if (v1 + 1 < w.length) return v1;            // có phụ âm cuối: dấu vào nguyên âm cuối (hoàn, thuật)
  if (cl.length === 3) return cl[1];            // oai, uya, oeo
  return v0;                                    // 1–2 nguyên âm mở: nguyên âm đầu (mùa, tài, núi)
}
// Chuẩn hoá một âm tiết về vị trí đặt dấu thanh thống nhất (kiểu cũ) để hoà/hòa, thuỷ/thủy chấm khớp nhau.
function normalizeSyllable(letters){
  let tone = '';
  const bases = letters.map(ch => { const s = split(String(ch).normalize('NFC').toLowerCase()); if (s.tone) tone = s.tone; return s.base; });
  const p = tonePos(bases);
  if (p >= 0 && tone) bases[p] = compose(bases[p], tone);
  return bases;
}
const PHRASES = RAW_PHRASES
 .map(([p, cat]) => ({ words: p.normalize('NFC').split(' ').map(w => normalizeSyllable([...w])), cat }))
 .map((x, i) => ({ ...x, i, n: x.words[0].length + x.words[1].length }))
 .sort((a, b) => a.n - b.n || a.i - b.i);

// Âm tiết hợp lệ: thanh điệu đúng vị trí (kiểu cũ hoặc mở oa/oe/uy kiểu mới), chính tả (c/k, g/gh, ng/ngh),
// tổ hợp âm-vần (chặn 63 vần giả), và đối chiếu kho từ thật BBWordDict (Leipzig Corpora Collection CC BY 4.0) khi có.
const INITIALS = ['ngh','ch','gh','gi','kh','ng','nh','ph','qu','th','tr','b','c','d','đ','g','h','k','l','m','n','p','r','s','t','v','x',''];
const OPEN = 'a ai ao au ay âu ây e eo ê êu i ia iu iêu o oa oai oao oay oe oeo oi ô ôi ơ ơi u ua uay uây ui uê uơ uôi uy uya uyu ư ưa ưi ưu ươi ươu y ya yêu';
const CLOSED_BY_NUC = {
  a: ['c','ch','m','n','ng','nh','p','t'], 'ă': ['c','m','n','ng','p','t'], 'â': ['c','m','n','ng','p','t'],
  e: ['c','m','n','ng','p','t'], 'ê': ['ch','m','n','nh','p','t'], i: ['ch','m','n','nh','p','t'],
  o: ['c','m','n','ng','p','t'], 'ô': ['c','m','n','ng','p','t'], 'ơ': ['m','n','p','t'],
  u: ['c','m','n','ng','p','t'], 'ư': ['c','m','n','ng','t'], y: ['ch','m','n','nh','p','t'],
  oa: ['c','ch','m','n','ng','nh','p','t'], 'oă': ['c','m','n','ng','p','t'], oe: ['c','m','n','ng','p','t'],
  oo: ['c','ng'], 'ôô': ['c','ng'], 'uâ': ['n','ng','t'], 'uê': ['ch','n','nh','t'],
  uy: ['ch','n','nh','p','t'], 'iê': ['c','m','n','ng','p','t'], 'yê': ['c','m','n','ng','p','t'],
  'uô': ['c','m','n','ng','p','t'], 'ươ': ['c','m','n','ng','p','t'], 'uyê': ['n','t'],
};
const RHYMES = new Set(OPEN.split(' '));
Object.entries(CLOSED_BY_NUC).forEach(([nuc, cs]) => cs.forEach(cd => RHYMES.add(nuc + cd)));
const LABIAL_RHYME = /^(oa|oă|oe|uâ|uê|uy|uơ)/;
const ORTH_EXCEPT = new Set([
  'quốc','buýt','voan','boong','coóc','tuýp','týp','típ','tít','gôn',
  'pin','pô','pa','pê','pi','pơ','pát','pít','píp','pốp','pắc','pác',
  'síp','súp','cúp','líp','rúp','bíp','bốp','lốp','bốt','vốt',
]);
function orthographyOK(ini, r, full){
  if (ORTH_EXCEPT.has(full)) return true;
  const f = r[0];
  if (ini === 'p') return false;
  if (ini === 'k' || ini === 'gh' || ini === 'ngh') {
    if (!'ieêy'.includes(f)) return false;
    if ((ini === 'gh' || ini === 'ngh') && f === 'y') return false;
  }
  if (ini === 'c' || ini === 'g' || ini === 'ng') { if ('ieêy'.includes(f)) return false; }
  if (ini === 'gi' && (f === 'i' || f === 'y')) return false;
  if (ini === 'qu' && 'uưoô'.includes(f)) return false;
  if (r.startsWith('iê') && ini === '') return false;
  if (r.startsWith('yê') && ini !== '' && ini !== 'qu') return false;
  if (/(ych|ym|yn|ynh|yp|yt)$/.test(r) && !r.startsWith('uy') && ini !== 'qu' && !(ini === '' && r === 'yt')) return false;
  if ((ini === 'b' || ini === 'm' || ini === 'ph' || ini === 'v') && LABIAL_RHYME.test(r)) return false;
  if ((ini === 'c' || ini === 'g') && /^(oe|uê|uy)/.test(r)) return false;
  return true;
}
function isNewStylePair(bases){
  const n = bases.length;
  if (n < 2) return false;
  const pair = bases[n - 2] + bases[n - 1];
  if (pair !== 'oa' && pair !== 'oe' && pair !== 'uy') return false;
  if (n >= 3 && (bases[n - 3] === 'q' || VOWELS.has(bases[n - 3]))) return false;
  return true;
}
function validSyllable(letters){
  if (!letters || !letters.length || letters.length > 7) return false;
  let tone = '', toneCount = 0, toneAt = -1;
  const bases = [];
  for (let i = 0; i < letters.length; i++) {
    const s = split(String(letters[i]).normalize('NFC').toLowerCase());
    if (!LETTERS.has(s.base)) return false;
    if (s.tone) { tone = s.tone; toneCount++; toneAt = i; }
    bases.push(s.base);
  }
  if (toneCount > 1) return false;
  const p0 = tonePos(bases);
  if (tone) {
    if (p0 < 0 || !isVowel(bases[toneAt])) return false;
    if (toneAt !== p0 && !(isNewStylePair(bases) && toneAt === p0 + 1)) return false;
  }
  const w = bases.join('');
  const tIdx = tone ? TONES.indexOf(tone) + 1 : 0;
  const D = typeof globalThis !== 'undefined' && globalThis.BBWordDict;
  if (D && typeof D.has === 'function') return D.has(w, tIdx);
  const full = bases.map((b, i) => i === toneAt ? compose(b, tone) : b).join('');
  const checkedOk = r => !/(c|ch|p|t)$/.test(r) || tone === TONES[0] || tone === TONES[4];
  if (w.startsWith('gi')) {
    const r = 'i' + w.slice(2);
    if (RHYMES.has(r) && checkedOk(r)) return true;
  }
  for (const ini of INITIALS) {
    if (!w.startsWith(ini)) continue;
    const r = w.slice(ini.length);
    if (!RHYMES.has(r) || !orthographyOK(ini, r, full) || !checkedOk(r)) continue;
    return true;
  }
  return false;
}

// Chấm một lượt đoán với đáp án T (mảng chữ). Xem chú thích ở evaluate() bên dưới.
function evaluateAgainst(T, guess){
  const res = new Array(T.length).fill('gray'), free = new Array(T.length).fill(true);
  T.forEach((t, i) => { if (guess[i] === t) { res[i] = 'green'; free[i] = false; } });
  guess.forEach((g, i) => {
    if (res[i] !== 'gray') return;
    const j = T.findIndex((t, k) => free[k] && t === g);
    if (j >= 0) { res[i] = 'yellow'; free[j] = false; }
  });
  const blueAt = (i, j) => { res[i] = 'blue'; free[j] = false; };
  guess.forEach((g, i) => { if (res[i] === 'gray' && isVowel(g) && free[i] && fam(T[i]) === fam(g)) blueAt(i, i); });
  guess.forEach((g, i) => {
    if (res[i] !== 'gray' || !isVowel(g)) return;
    const j = T.findIndex((t, k) => free[k] && isVowel(t) && fam(t) === fam(g));
    if (j >= 0) blueAt(i, j);
  });
  return res;
}
// ---------- @pure-end ----------

// ---------- level ----------
// Level L = cụm BBD.level('word', L).phrase (chỉ số trong danh sách gốc ở trên). Bảng js/levels/word.js (version 2)
// xếp lại 49 cụm theo độ khó đo bằng bot; sao lưu theo mã cụm "p<chỉ số>" (BB.starsAt), nên đổi thứ tự không làm
// sao chạy sang cụm khác. Chưa nạp BBD thì dùng thứ tự cũ (xếp theo số chữ), sao theo số level như trước.
const BBD = window.BBD && window.BBD.games && window.BBD.games().includes('word') ? window.BBD : null;
const LV_MAX = BBD ? Math.min(BBD.maxLevel('word'), PHRASES.length) : PHRASES.length;
// Một dòng BBD trỏ sai cụm thì bỏ cả bảng, quay về thứ tự cũ: sao lưu theo số level không được gắn nhầm cụm.
const rowsBBD = BBD ? Array.from({ length: LV_MAX }, (_, k) => PHRASES.find(p => p.i === BBD.level('word', k + 1).phrase)) : null;
const LEVELS = rowsBBD && rowsBBD.every(Boolean) ? rowsBBD : PHRASES.slice(0, LV_MAX);
if (rowsBBD && !rowsBBD.every(Boolean)) console.warn('word: BBD table mismatch, using legacy order');
// Màn thử thách chỉ có nghĩa khi đang chạy bảng BBD; thứ tự cũ (xếp theo số chữ) không có đỉnh.
const isPeakW = L => LEVELS === rowsBBD && BB.isPeak(L, 'word');
// Số level thật nằm ở đây, không phải hằng số trong core.js: đăng ký trước khi hub.js đọc
// (word.js nạp trước hub.js), để hub, thử thách ngày và chia sẻ cùng đếm đúng số cụm.
if (BB.setLvMax) BB.setLvMax('word', LV_MAX); else if (BB.LV_MAX) BB.LV_MAX.word = LV_MAX;
// Bảng đổi phiên bản (thứ tự cụm mới) → dời sao cũ sang đúng cụm đã chơi, một lần, trước khi đọc gameStats.
if (BB.migrateProgress) BB.migrateProgress('word');

// ---------- trạng thái ----------
// state: menu | play | reveal (đang lật ô, khoá nhập) | result
let level = 1, chosen = 1, puzzle = null, rows = [], cur = [], word1Done = false, state = 'menu', passed = false, hintShown = false;
let inGame = false, flipRow = -1, popAt = -1, revealT = 0, startedAt = 0, starT = [], tickT = [], lastShareText = '', lastShareMsg = '', shareStatusT = 0;
const keyState = {}, EMOJI = { green: '🟩', yellow: '🟨', blue: '🟦', gray: '⬜' };
function buildShareGrid(snap){
  const w1 = snap.puzzle.words[0].length;
  const head = [`Brainy Bits · Đoán Cụm Từ Lv ${snap.level} (${snap.tries}/${MAX_TRIES})`];
  if (!snap.hintShown) head.push('Đoán ra không cần gợi ý');
  return head.concat(snap.rows.map(r => r.slice(0, w1).map(c => EMOJI[c]).join('') + (snap.puzzle.words.length > 1 ? ' ' + r.slice(w1).map(c => EMOJI[c]).join('') : ''))).join('\n');
}

// Tiến độ cũ: word_lv = "level cao nhất + 1" theo thứ tự cũ. Chỉ đọc, không ghi nữa; ✓ mới lấy từ sao trong BB.
// Không seed vào bb_stats ở đây: hub.js seed một lần (cờ bb_seeded_v2), còn game đọc thẳng word_lv.
// k level cũ đã qua = k cụm đầu của thứ tự cũ (legacyLevels), nên ✓ đi theo cụm sang vị trí mới.
const LEGACY_KEYS = BBD ? BBD.spec('word').legacy.map((r, k) => r.id || k + 1) : PHRASES.map((_, k) => k + 1);
// Chặn theo số cụm của thứ tự cũ, không theo LV_MAX: nếu bảng mới ngắn hơn, ✓ của cụm cũ vẫn không mất.
const legacyDone = () => BB.store.num('word_lv', 1, 1, LEGACY_KEYS.length + 1) - 1;
const keyOf = L => (BB.levelKey ? BB.levelKey('word', L) : L);
const starsOf = L => (BB.starsAt ? BB.starsAt('word', L) : BB.gameStats('word').stars[L] || 0);
const isDone = L => starsOf(L) > 0 || LEGACY_KEYS.slice(0, legacyDone()).includes(keyOf(L));
const doneCount = () => { let n = 0; for (let L = 1; L <= LV_MAX; L++) if (isDone(L)) n++; return n; };
const bestLv = () => Math.min(LV_MAX, Math.max(BB.gameStats('word').best, legacyDone()));
const nextOpen = () => { let L = 1; while (L < LV_MAX && isDone(L)) L++; return L; };
const topDone = () => { let L = LV_MAX; while (L > 0 && !isDone(L)) L--; return L; };
// Hub, thử thách ngày và thẻ chia sẻ đọc tiến độ theo màn đã qua, không theo best (thứ tự đã đổi).
// best = màn cao nhất đã qua theo thứ tự hiện tại: thẻ chia sẻ lấy sao của đúng cụm ở màn đó.
if (BB.setProgress) BB.setProgress('word', () => ({ done: doneCount(), next: nextOpen(), best: topDone() }));
const starsFor = tries => tries <= 3 ? 3 : tries <= 5 ? 2 : 1;
const STAR_RULE = '3 sao: tối đa 3 lượt · 2 sao: 4–5 lượt · 1 sao: 6 lượt';

const L1 = () => puzzle.words[0].length, L2 = () => puzzle.words[1].length, N = () => L1() + L2();
const target = () => puzzle.words[0].concat(puzzle.words[1]);
const answer = p => p.words.map(w => w.join('')).join(' ');

// ---------- chấm điểm một lượt đoán ----------
// green: đúng chữ đúng chỗ · yellow: có đúng chữ đó ở chỗ khác · blue: có nguyên âm cùng họ (o/ô/ơ...) nhưng
// khác dấu, ưu tiên đúng chỗ trước · gray: không còn. Mỗi chữ của đáp án chỉ được dùng cho một ô.
function evaluate(guess){ return evaluateAgainst(target(), guess); }

// ---------- vẽ bảng ----------
// Ô lớn nhất vừa chỗ trống của .wstage. Bố cục do CSS quyết (css/word.css): dọc thì gợi ý và chú giải
// nằm trên/dưới bảng, ngang (điện thoại xoay ngang) thì nằm hai bên bảng.
function cellSize(){
  const n = N(), stage = document.querySelector('#wordApp .wstage');
  const hint = $('wHint'), lg = document.querySelector('#wordApp .wlegend');
  let availW = Math.min(window.innerWidth, 900) - 24, availH = 6 * 50 + 25;
  if (stage && stage.clientHeight) {
    const cs = getComputedStyle(stage), gapS = parseFloat(cs.columnGap) || 0;
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const side = [hint, lg].filter(e => e && e.offsetParent);
    if (cs.flexDirection === 'row') {
      availW = stage.clientWidth - padX - side.reduce((a, e) => a + e.offsetWidth + gapS, 0);
      availH = stage.clientHeight - padY;
    } else {
      availW = Math.min(stage.clientWidth - padX, 900);
      availH = stage.clientHeight - padY - side.reduce((a, e) => a + e.offsetHeight + (parseFloat(cs.rowGap) || 0), 0);
    }
  }
  const gap = (availW < 330 && n >= 10) || availH < 220 ? 3 : availH > 420 ? 6 : 5;
  const byW = Math.floor((availW - n * gap) / (n + 0.55));
  const byH = Math.floor((availH - (MAX_TRIES - 1) * gap) / MAX_TRIES);
  return { sz: Math.max(16, Math.min(76, byW, byH)), gap };
}
const RES_TXT = { green: 'đúng chỗ', yellow: 'sai chỗ', blue: 'khác dấu', gray: 'không có' };
function renderBoard(){
  const b = $('wBoard'); b.innerHTML = '';
  const { sz, gap } = cellSize();
  b.style.setProperty('--cs', sz + 'px'); b.style.setProperty('--wg', gap + 'px');
  for (let r = 0; r < MAX_TRIES; r++){
    const row = document.createElement('div'); row.className = 'wrow';
    row.setAttribute('role', 'group'); row.setAttribute('aria-label', `Lượt ${r + 1}`);
    const data = rows[r] || (r === rows.length ? { letters: cur, res: null } : { letters: [], res: null });
    for (let i = 0; i < N(); i++){
      if (i === L1()) { const g = document.createElement('div'); g.className = 'wgap'; row.appendChild(g); }
      const c = document.createElement('div');
      const ch = data.letters[i] || '';
      c.className = 'wcell' + (data.res ? ' ' + data.res[i] : (ch ? ' filled' : ''));
      if (data.res && r === flipRow && !BB.motion.reduced) { c.classList.add('flip'); c.style.setProperty('--i', i); }
      if (r === rows.length && i === data.letters.length && state === 'play') c.classList.add('caret');
      c.textContent = ch.toUpperCase();
      if (data.res) { c.setAttribute('role', 'img'); c.setAttribute('aria-label', `${ch.toUpperCase()}, ${RES_TXT[data.res[i]]}`); }
      row.appendChild(c);
    }
    b.appendChild(row);
  }
  flipRow = -1;
  if (popAt >= 0) { BB.pop(b.children[rows.length]?.querySelectorAll('.wcell')[popAt], 1.1); popAt = -1; }
}
const RANK = { green: 4, yellow: 3, blue: 2, gray: 1 };
function renderKeys(){
  document.querySelectorAll('#wKeys button[data-k]').forEach(k => {
    const s = keyState[k.dataset.k];
    k.classList.remove('green', 'yellow', 'blue', 'gray');
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
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), 1600);
}
function nope(msg){
  toast(msg); BB.sfx('wrong'); BB.haptic('error');
  BB.shake($('wBoard').children[rows.length], 7);
}

// ---------- nhập liệu ----------
// Từ đang gõ: từ 1 cho tới khi bấm Space sang từ 2 hoặc gõ sang chữ đầu của từ 2.
const wordRange = (n = cur.length) => (n > L1() || (n === L1() && word1Done)) ? [L1(), cur.length] : [0, Math.min(cur.length, L1())];
const wordLimit = a => a >= L1() ? N() : L1();
const wordOf = idx => idx >= L1() ? [L1(), cur.length] : [0, Math.min(cur.length, L1())];
function wordTone(a, b){ for (let i = a; i < b; i++) { const t = split(cur[i]).tone; if (t) return t; } return ''; }
// Gỡ dấu thanh khỏi cả từ rồi đặt lại vào đúng nguyên âm. Trả vị trí nhận dấu (-1 nếu chưa có nguyên âm).
function placeTone(a, b, tone = wordTone(a, b)){
  for (let i = a; i < b; i++) cur[i] = noTone(cur[i]);
  const p = tonePos(cur.slice(a, b));
  if (p >= 0 && tone) cur[a + p] = compose(cur[a + p], tone);
  return p < 0 ? -1 : a + p;
}
const MOD = {
  mu:    { a: 'â', ă: 'â', â: 'a', e: 'ê', ê: 'e', o: 'ô', ơ: 'ô', ô: 'o' },
  trang: { a: 'ă', â: 'ă', ă: 'a' },
  moc:   { o: 'ơ', ô: 'ơ', ơ: 'o', u: 'ư', ư: 'u' },
};
const MOD_HELP = { mu: 'Dấu mũ dùng cho a, e, o', trang: 'Dấu trăng dùng cho a', moc: 'Dấu móc dùng cho o, u' };
// Mũ/trăng/móc đổi nguyên âm đúng cặp vần: uu → ưu (cứu/lưu), uo → ươ/uơ (thuở ngay lần 1 khi hết chỗ vần),
// oo ↔ ôô (xoong), nươi + mu → nuôi; tránh sửa lẻ từng chữ trong cụm đôi.
function modify(k, opts = {}){
  const [a, b] = wordRange(), base = cur.map(noTone);
  const silent = !!opts.silent;
  if (k === 'moc') {
    for (let j = b - 2; j >= a; j--) {
      if (fam(base[j]) !== 'u' || fam(base[j + 1]) !== 'u' || (j > a && base[j - 1] === 'q')) continue;
      const nextU = base[j] === 'ư' ? 'u' : 'ư';
      const tone = wordTone(a, b);
      cur[j] = nextU; cur[j + 1] = 'u';
      return placeTone(a, b, tone);
    }
    for (let j = b - 2; j >= a; j--) {
      if (fam(base[j]) !== 'u' || fam(base[j + 1]) !== 'o' || (j > a && base[j - 1] === 'q')) continue;
      const pair = base[j] + base[j + 1];
      const next = (b === wordLimit(a) && j + 1 === b - 1)
        ? (pair === 'uơ' ? ['u', 'o'] : ['u', 'ơ'])
        : (pair === 'ươ' ? ['u', 'ơ'] : pair === 'uơ' ? ['u', 'o'] : ['ư', 'ơ']);
      const tone = wordTone(a, b);
      cur[j] = next[0]; cur[j + 1] = next[1];
      return placeTone(a, b, tone);
    }
  }
  for (let i = b - 1; i >= a; i--) {
    if (k === 'mu' && 'oô'.includes(base[i]) && i > a && 'oô'.includes(base[i - 1])) {
      const nextO = base[i] === 'ô' ? 'o' : 'ô';
      const tone = wordTone(a, b);
      cur[i - 1] = nextO; cur[i] = nextO;
      return placeTone(a, b, tone);
    }
    if (k === 'moc' && 'oôơ'.includes(base[i]) && ((i > a && 'oôơ'.includes(base[i - 1])) || (i + 1 < b && 'oôơ'.includes(base[i + 1])))) continue;
    if (k === 'moc' && fam(base[i]) === 'u' && i > a && base[i - 1] === 'q') continue;
    const to = MOD[k][base[i]];
    if (!to) continue;
    const tone = wordTone(a, b);
    cur[i] = to;
    if (k === 'mu' && (to === 'ô' || to === 'o') && i > a && base[i - 1] === 'ư') cur[i - 1] = 'u';
    return placeTone(a, b, tone);
  }
  if (!silent) toast(MOD_HELP[k]);
  return -2;
}
function setTone(k, toggle = true, silent = false){
  const [a, b] = wordRange();
  const t0 = wordTone(a, b);
  const p = placeTone(a, b, toggle && t0 === k ? '' : k);
  if (p < 0) { placeTone(a, b, t0); if (!silent) toast('Gõ nguyên âm trước rồi mới thêm dấu'); return -2; }
  return p;
}
function typeLetter(ch){
  const { base, tone } = split(ch.normalize('NFC').toLowerCase());
  if (!LETTERS.has(base)) return -2;
  if (cur.length >= N()) return -2;
  const idx = cur.length;
  cur.push(base);
  const [a, b] = wordOf(idx);
  if (idx >= a + 2 && 'cmnptiu'.includes(base) && noTone(cur[idx - 2]) === 'u' && noTone(cur[idx - 1]) === 'ơ'
    && !(idx - 2 > a && noTone(cur[idx - 3]) === 'q')) {
    cur[idx - 2] = 'ư';
  }
  placeTone(a, b, tone || wordTone(a, b));
  return idx;
}
function toggleD(){
  const [a, b] = wordRange();
  for (let i = b - 1; i >= a; i--) if (cur[i] === 'd' || cur[i] === 'đ') { cur[i] = cur[i] === 'd' ? 'đ' : 'd'; return i; }
  toast('Gõ d trước rồi bấm 9'); return -2;
}

function key(k){
  if (state !== 'play') return;
  let changed = -1;
  if (k === 'del') { if (!cur.length) return; cur.pop(); if (cur.length <= L1()) word1Done = false; const [a, b] = wordRange(); placeTone(a, b); }
  else if (k === 'enter') { submit(); return; }
  else if (MOD[k]) { if (!cur.length) { toast(MOD_HELP[k]); return; } changed = modify(k); }
  else if (TONES.includes(k)) changed = setTone(k);
  else if (k === 'notone') { const [a, b] = wordRange(); placeTone(a, b, ''); }
  else if (k === 'dd') changed = toggleD();
  else { changed = typeLetter(k); if (changed === -2 && cur.length >= N()) { toast('Đủ chữ rồi, bấm ĐOÁN'); return; } }
  if (changed === -2) return;
  BB.sfx('key');
  if (changed >= 0) popAt = changed;
  renderBoard();
}

function submit(){
  if (cur.length < N()) { nope(`Cần đủ ${N()} chữ cái`); return; }
  const w1 = cur.slice(0, L1()), w2 = cur.slice(L1());
  const bad = [w1, w2].find(w => !validSyllable(w));
  if (bad) { nope(`“${bad.join('')}” chưa phải tiếng Việt`); return; }
  const norm = normalizeSyllable(w1).concat(normalizeSyllable(w2));
  const res = evaluate(norm);
  rows.push({ letters: norm, res });
  norm.forEach((ch, i) => {
    const k = fam(ch), s = res[i];
    if (!keyState[k] || RANK[s] > RANK[keyState[k]]) keyState[k] = s;
  });
  cur = []; word1Done = false;
  const win = res.every(r => r === 'green');
  const lose = !win && rows.length >= MAX_TRIES;
  const snap = { level, puzzle, tries: rows.length, ms: performance.now() - startedAt, hintShown, rows: rows.map(r => r.res.slice()) };
  state = 'reveal'; lockMenu(true);
  flipRow = rows.length - 1;
  renderBoard(); hud();
  const reduced = BB.motion.reduced;
  const step = 90, flipMs = 480, total = reduced ? 250 : (N() - 1) * step + flipMs;
  // Hẹn giờ tiếng tick ở đây (không dùng delay của BB.sfx) để rời game là huỷ được ngay, kể cả khi core không dọn.
  if (!reduced) res.forEach((r, i) => tickT.push(setTimeout(() => {
    if (window.APP && window.APP.active === 'word') BB.sfx('tick', { combo: r === 'green' ? i : 0 });
  }, i * step + flipMs / 2)));
  revealT = setTimeout(() => afterReveal(win, lose, snap), total);
}
// Tóm tắt lượt vừa chấm cho trình đọc màn hình (vùng ẩn, không đổi giao diện).
function announce(r){
  const el = $('wLive'); if (!el || !r) return;
  const word = r.letters.join('').toUpperCase(), c = k => r.res.filter(x => x === k).length;
  el.textContent = `${word}: ${c('green')} đúng chỗ, ${c('yellow')} sai chỗ, ${c('blue')} khác dấu, ${c('gray')} không có.`;
}
function afterReveal(win, lose, snap){
  revealT = 0;
  renderKeys(); announce(rows[snap.tries - 1]);
  if (win) {
    BB.sfx('correct'); BB.haptic('success');
    const cells = $('wBoard').children[snap.tries - 1]?.querySelectorAll('.wcell') || [];
    if (!BB.motion.reduced) cells.forEach((c, i) => c.animate && c.animate(
      [{ transform: 'translateY(0)' }, { transform: 'translateY(-30%)' }, { transform: 'translateY(0)' }],
      { duration: 380, delay: i * 70, easing: BB.EASE }));
    revealT = setTimeout(() => finish(true, snap), BB.motion.reduced ? 200 : 380 + cells.length * 70);
  } else if (lose) {
    BB.sfx('fail'); BB.haptic('error');
    revealT = setTimeout(() => finish(false, snap), 450);
  } else {
    if (state === 'reveal') state = 'play';
    lockMenu(false); renderBoard();
  }
}
function lockMenu(on){ const m = $('wMenuBtn'); m.disabled = on; m.setAttribute('aria-disabled', on ? 'true' : 'false'); }

// ---------- luồng chơi ----------
function clearTimers(){ clearTimeout(revealT); revealT = 0; starT.forEach(clearTimeout); starT = []; tickT.forEach(clearTimeout); tickT = []; }
function startLevel(L){
  clearTimers();
  level = Math.min(LV_MAX, Math.max(1, Math.floor(L) || 1)); puzzle = LEVELS[level - 1];
  rows = []; cur = []; word1Done = false; hintShown = false; inGame = true; startedAt = performance.now();
  Object.keys(keyState).forEach(k => delete keyState[k]);
  ['wmenu', 'wresult'].forEach(id => $(id).classList.add('hidden'));
  state = 'play'; lockMenu(false);
  // The start button keeps focus after its overlay hides; on a laptop that swallowed the first Enter.
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  focusIme();
  renderBoard(); renderKeys(); hud();
}
// quiet: người chơi đã rời game (onLeave) → chỉ ghi kết quả, không mở màn kết quả, không pháo giấy, không tiếng.
function finish(win, snap, quiet = false){
  clearTimers();
  lockMenu(false);
  state = 'result'; passed = win; inGame = false;
  level = snap.level; puzzle = snap.puzzle;               // luôn chấm đúng cụm đã chơi
  const stars = win ? starsFor(snap.tries) : 0;
  const rec = BB.record({ game: 'word', level, won: win, stars, score: win ? MAX_TRIES + 1 - snap.tries : 0, ms: snap.ms });
  if (quiet) { BB.clearLoss('word'); return; }   // rời game giữa chừng: không còn là chuỗi thua liền nhau
  const last = level >= LV_MAX;
  const ans = answer(puzzle).toUpperCase();
  $('wrTitle').textContent = win ? (last ? 'Phá đảo! 🏆' : 'Chính xác! 🎉') : 'Hết lượt rồi 😅';
  $('wrBig').textContent = win ? ans : '? ? ?';
  $('wrDetail').textContent = win
    ? (last ? `Đoán ra sau ${snap.tries}/${MAX_TRIES} lượt. Bạn đã qua hết ${LV_MAX} cụm từ.` : `Đoán ra sau ${snap.tries}/${MAX_TRIES} lượt.`)
    : `${BB.softLoss(level) ? `Hết ${MAX_TRIES} lượt. ` : ''}Chơi lại cụm từ này, hoặc xem đáp án.`;
  BB.lossAid($('wrNext'), { game: 'word', level, won: win, maxLevel: LV_MAX,
    tip: 'Lượt đầu, chọn từ có nhiều nguyên âm khác nhau để biết nhanh cụm này có vần nào. Kẹt thì bấm <b>Xem gợi ý chủ đề</b>.',
    onSkip: L => startLevel(L) });
  const cue = BB.peakCue($('wrNext'), { game: 'word', level, won: win, last, maxLevel: LV_MAX, peak: isPeakW });
  $('wrNext').textContent = win ? (last ? 'Chơi lại từ Level 1' : `Level ${level + 1}${cue ? ' · thử thách' : ''} →`) : `Chơi lại Level ${level}`;
  $('wrReveal').classList.toggle('hidden', win);
  $('wrNoHint').classList.toggle('hidden', !(win && !snap.hintShown));
  lastShareText = win && snap.rows ? buildShareGrid(snap) : '';
  $('wrShare').classList.toggle('hidden', !win);
  showStars(win ? stars : -1);
  $('wresult').classList.remove('hidden');
  if (win) {
    BB.sfx('levelUp'); BB.celebrate({ particleCount: 60 + stars * 20 });
    if (rec.dailyDone) BB.toast('Xong thử thách hôm nay');
    else if (rec.newBest && level > 1) BB.toast(`Kỷ lục mới: Level ${level}`);
  }
}
function showStars(n){
  const el = starsEl(), rule = $('wrRule');
  el.classList.toggle('hidden', n < 0); rule.classList.toggle('hidden', n < 0);
  if (n < 0) return;
  el.setAttribute('aria-label', `${n}/3 sao`);
  el.innerHTML = [0, 1, 2].map(i => `<span class="${i < n ? 'on' : ''}" aria-hidden="true">★</span>`).join('');
  rule.textContent = STAR_RULE;
  [...el.children].forEach((s, i) => {
    if (i >= n) return;
    starT.push(setTimeout(() => { if (state === 'result' && window.APP && window.APP.active === 'word') BB.sfx('star', { combo: i * 2 }); }, 350 + i * 180));
    if (!BB.motion.reduced && s.animate) s.animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1.25)', opacity: 1 }, { transform: 'scale(1)', opacity: 1 }],
      { duration: 420, delay: 350 + i * 180, easing: BB.EASE, fill: 'backwards' });
  });
}
function starsEl(){
  let el = $('wrStars');
  if (!el) {
    el = document.createElement('div'); el.id = 'wrStars'; el.className = 'wstars'; el.setAttribute('role', 'img');
    $('wrBig').after(el);
    const r = document.createElement('p'); r.id = 'wrRule'; r.className = 'wrule';
    $('wrDetail').after(r);
  }
  return el;
}
function renderLevels(resetOpen = false){
  const grid = $('wlvgrid');
  const buildTile = L => {
    const el = document.createElement('button'), st = starsOf(L);
    el.className = 'lv' + (isDone(L) ? ' done' : '') + (L === chosen ? ' on' : '');
    el.innerHTML = `${L}<small>${LEVELS[L-1].n} chữ</small>` + (st ? `<i class="wlvst" aria-hidden="true">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</i>` : '') + (isPeakW(L) ? BB.PEAK_TAG : '');
    el.setAttribute('aria-label', `Level ${L}, ${LEVELS[L-1].n} chữ` + (st ? `, ${st} sao` : isDone(L) ? ', đã qua' : '') + (isPeakW(L) ? ', màn thử thách' : ''));
    el.setAttribute('aria-pressed', L === chosen ? 'true' : 'false');
    el.onclick = () => { chosen = L; renderLevels(false); BB.sfx('tap'); grid.querySelector('.lv.on')?.focus({ preventScroll: true }); };
    return el;
  };
  BB.renderLevelChapters(grid, { maxLevel: LV_MAX, chosen, isDone, buildTile, resetOpen });
  $('wStart').textContent = `Chơi Level ${chosen} · ${isPeakW(chosen) ? 'thử thách' : `${LEVELS[chosen-1].n} chữ cái`}`;
}
function resumeBtn(){
  let b = $('wResume');
  if (!b) {
    b = document.createElement('button'); b.id = 'wResume'; b.className = 'btn';
    $('wStart').before(b);
    b.onclick = () => { $('wmenu').classList.add('hidden'); state = 'play'; focusIme(); renderBoard(); hud(); };
  }
  return b;
}
function toMenu(){
  if (state === 'reveal') return;                       // đang lật ô: khoá ☰
  clearTimers();
  state = 'menu';
  // Gợi ý level đầu tiên chưa qua: sau khi xếp lại, các cụm đã qua không còn nằm liền nhau từ Level 1.
  const next = nextOpen();
  chosen = inGame ? level : next;
  renderLevels(true);
  const done = doneCount();
  $('wBestTxt').textContent = done ? (done >= LV_MAX ? `Đã qua hết ${LV_MAX} level` : `Đã qua ${done}/${LV_MAX} level`) : '';
  const rb = resumeBtn();
  rb.classList.toggle('hidden', !inGame);
  rb.textContent = `Chơi tiếp Level ${level} (lượt ${rows.length + 1}/${MAX_TRIES})`;
  $('wStart').classList.toggle('alt', inGame);
  $('wresult').classList.add('hidden'); $('wmenu').classList.remove('hidden');
  if (!inGame) { puzzle = LEVELS[chosen-1]; level = chosen; rows = []; cur = []; word1Done = false; hintShown = false; }
  renderBoard(); renderKeys(); hud();
}
// Vào game từ hub: thử thách ngày → mở thẳng level đó; ván dở → giữ nguyên bàn và mở menu có nút chơi tiếp.
// Có ván dở mà bấm thử thách ngày: không xoá ván, mở menu chọn sẵn level thử thách, vẫn còn nút chơi tiếp.
function enter(){
  const req = BB.takeRequest('word');
  if (req == null) { toMenu(); return; }
  if (!(inGame && rows.length)) { startLevel(req); return; }
  toMenu();
  chosen = Math.min(LV_MAX, Math.max(1, Math.floor(req) || 1)); renderLevels();
  toast(`Thử thách hôm nay: Level ${chosen}`);
}
// Rời game giữa lúc lật ô: chốt luôn kết quả để không mất tiến độ.
// Mọi hẹn giờ (lật ô, tiếng tick, tiếng sao) bị huỷ ở mọi trạng thái, không chỉ lúc đang lật.
BB.onLeave('word', () => {
  clearTimers();
  if (state !== 'reveal') return;
  const last = rows[rows.length - 1];
  renderKeys();
  const snap = { level, puzzle, tries: rows.length, ms: performance.now() - startedAt, hintShown, rows: rows.map(r => r.res.slice()) };
  if (last && last.res.every(r => r === 'green')) finish(true, snap, true);
  else if (rows.length >= MAX_TRIES) finish(false, snap, true);
  else { state = 'play'; lockMenu(false); }
});

// ---------- chữ trên màn hình (markup thuộc index.html, chỉnh lại cho khớp luật mới) ----------
function syncCopy(){
  const lg = document.querySelector('#wordApp .wlegend');
  // Nhãn đầy đủ và nhãn ngắn (cùng chữ với RES_TXT); css/word.css chọn cái nào hiện theo bề ngang.
  if (lg) lg.innerHTML = [['green', 'Đúng chữ, đúng chỗ', 'Đúng chỗ'], ['yellow', 'Đúng chữ, sai chỗ', 'Sai chỗ'], ['blue', 'Có nguyên âm, khác dấu', 'Khác dấu'], ['gray', 'Không có', 'Không có']]
    .map(([c, t, s]) => `<span><i class="sw ${c}" aria-hidden="true"></i><span class="wl-l">${t}</span><span class="wl-s">${s}</span></span>`).join('');
  const labels = { del: 'Xoá', enter: 'Đoán', mu: 'Dấu mũ: â ê ô', trang: 'Dấu trăng: ă', moc: 'Dấu móc: ơ ư' };
  document.querySelectorAll('#wKeys button').forEach(b => {
    const a = b.dataset.a;
    if (labels[a]) b.setAttribute('aria-label', labels[a]);
    else if (TONES.includes(a)) b.setAttribute('aria-label', TONE_NAME[TONES.indexOf(a)]);
  });
  $('wBoard').setAttribute('role', 'group'); $('wBoard').setAttribute('aria-label', 'Bảng đoán');
  $('wToast').setAttribute('role', 'status'); $('wToast').setAttribute('aria-live', 'polite');
  if (!$('wLive')) {
    const lv = document.createElement('div'); lv.id = 'wLive'; lv.className = 'wsr';
    lv.setAttribute('aria-live', 'polite'); lv.setAttribute('role', 'status');
    $('wBoard').after(lv);
  }
}
syncCopy();

// ---------- sự kiện & nhập liệu bàn phím / Telex / OS IME ----------
const desktopPtr = window.matchMedia ? matchMedia('(hover: hover) and (pointer: fine)') : null;
const telexToggle = $('wTelexToggle'), ime = $('wIme');
const telexOn = () => BB.store.get('bb_word_telex', '1') !== '0';
function focusIme(){
  if (ime && desktopPtr && desktopPtr.matches && state === 'play') ime.focus({ preventScroll: true });
}
function syncTelexBtn(){
  if (!telexToggle) return;
  const on = telexOn();
  telexToggle.setAttribute('aria-pressed', String(on));
  telexToggle.textContent = on ? 'Telex: Bật' : 'Telex: Tắt';
}
syncTelexBtn();
if (telexToggle) {
  telexToggle.addEventListener('click', () => {
    BB.store.set('bb_word_telex', telexOn() ? '0' : '1');
    syncTelexBtn();
    BB.sfx('tap');
    if (state === 'play' && desktopPtr && desktopPtr.matches) focusIme();
    else telexToggle.blur();
  });
}
if (desktopPtr && desktopPtr.addEventListener) desktopPtr.addEventListener('change', () => { if (state === 'play' && desktopPtr.matches) focusIme(); });
$('wBoard').addEventListener('pointerdown', () => { if (state === 'play') focusIme(); });

function modKindForW(base, a, b){
  for (let j = b - 2; j >= a; j--) {
    if (fam(base[j]) === 'u' && (fam(base[j + 1]) === 'o' || fam(base[j + 1]) === 'u') && !(j > a && base[j - 1] === 'q')) return 'moc';
  }
  for (let i = b - 1; i >= a; i--) {
    if ('aăâ'.includes(base[i])) return 'trang';
    if ('oôơuư'.includes(base[i]) && !(base[i] === 'u' && i > a && base[i - 1] === 'q')
      && !('oôơ'.includes(base[i]) && ((i > a && 'oôơ'.includes(base[i - 1])) || (i + 1 < b && 'oôơ'.includes(base[i + 1]))))) return 'moc';
  }
  return null;
}
function dictAllowsSlice(slice){
  const D = typeof globalThis !== 'undefined' && globalThis.BBWordDict;
  if (!D || typeof D.maskOf !== 'function') return true;
  let t = '';
  const bs = slice.map(ch => { const s = split(ch); if (s.tone) t = s.tone; return s.base; }).join('');
  return t ? D.has(bs, TONES.indexOf(t) + 1) : D.maskOf(bs) > 0;
}
function tryTelex(ch){
  const [a, b] = wordRange();
  const atBoundary = cur.length === L1() && !word1Done;
  const hasV = cur.slice(a, b).some(isVowel);
  if (ch === 'f') return setTone(TONES[1], true, true);
  if (ch === 'j') return setTone(TONES[4], true, true);
  if (ch === 'z') { const t0 = wordTone(a, b); return t0 ? placeTone(a, b, '') : -2; }
  if (ch === 'w') {
    const base = cur.map(noTone);
    const mk = b > a ? modKindForW(base, a, b) : null;
    if (mk) {
      if (atBoundary) {
        const snap = cur.slice();
        const r = modify(mk, { silent: true });
        if (r >= -1 && dictAllowsSlice(cur.slice(0, L1()))) return r;
        cur = snap;
        if (cur.length < N()) { word1Done = true; return typeLetter('ư'); }
        return -2;
      }
      return modify(mk, { silent: true });
    }
    if (cur.length < N()) { if (atBoundary) word1Done = true; return typeLetter('ư'); }
    return -2;
  }
  const DUAL_TONE = { s: TONES[0], r: TONES[2], x: TONES[3] };
  if (DUAL_TONE[ch]) {
    if (!hasV) return null;
    if (atBoundary) {
      if (wordTone(0, L1())) return null;
      const tone = DUAL_TONE[ch];
      const w1 = cur.slice(0, L1()).map(noTone);
      const p = tonePos(w1);
      if (p < 0) return null;
      w1[p] = compose(w1[p], tone);
      return validSyllable(w1) ? setTone(tone, false, true) : null;
    }
    return setTone(DUAL_TONE[ch], false, true);
  }
  if (ch === 'd') {
    if (!atBoundary && b > a && cur[a] === 'd') { cur[a] = 'đ'; return a; }
    return null;
  }
  const CIRC = { a: 'â', e: 'ê', o: 'ô' };
  if (CIRC[ch]) {
    if (ch === 'o' && b > a && 'ea'.includes(noTone(cur[b - 1]))) return null;
    if (!atBoundary && ch === 'o' && b > a && noTone(cur[b - 1]) === 'ô' && cur.length < wordLimit(a)) {
      const tone = wordTone(a, b);
      cur[b - 1] = 'o';
      placeTone(a, b, tone);
      return typeLetter('o');
    }
    let idx = -1;
    for (let i = b - 1; i >= a; i--) if (noTone(cur[i]) === ch) { idx = i; break; }
    if (idx < 0) return null;
    if (atBoundary) {
      if (wordTone(0, L1())) return null;
      const cand = cur.slice(0, L1()).map((c, i) => i === idx ? CIRC[ch] : noTone(c));
      if (!dictAllowsSlice(cand)) return null;
    }
    const tone = wordTone(a, b);
    cur[idx] = CIRC[ch];
    return placeTone(a, b, tone);
  }
  return null;
}
function commitIme(str){
  if (state !== 'play' || !str) return;
  let moved = false, last = -1;
  for (const ch of str.normalize('NFC').toLowerCase()) {
    if (ch === ' ') { if (cur.length === L1() && !word1Done) { word1Done = true; moved = true; } continue; }
    if (!LETTERS.has(split(ch).base)) continue;
    const p = typeLetter(ch);
    if (p >= 0) { moved = true; last = p; }
  }
  if (!moved) return;
  BB.sfx('key');
  if (last >= 0) popAt = last;
  renderBoard();
}
let imeComp = false;
if (ime) {
  ime.addEventListener('compositionstart', () => { imeComp = true; });
  ime.addEventListener('compositionend', () => { imeComp = false; commitIme(ime.value); ime.value = ''; });
  ime.addEventListener('input', () => { if (!imeComp && ime.value) { commitIme(ime.value); ime.value = ''; } });
}

document.querySelectorAll('#wKeys button').forEach(b => {
  b.addEventListener('pointerdown', e => { e.preventDefault(); BB.haptic('tap'); key(b.dataset.k || b.dataset.a); });
  b.addEventListener('click', e => { if (e.detail === 0) key(b.dataset.k || b.dataset.a); });   // Enter/Space khi phím đang focus
});
const VNI = { 1: TONES[0], 2: TONES[1], 3: TONES[2], 4: TONES[3], 5: TONES[4], 6: 'mu', 7: 'moc', 8: 'trang', 9: 'dd', 0: 'notone' };
document.addEventListener('keydown', e => {
  if (!window.APP || window.APP.active !== 'word' || state !== 'play') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const isEnter = e.key === 'Enter' || e.code === 'NumpadEnter';
  const btn = e.target && e.target.closest && e.target.closest('#wordApp button');
  const onBtn = btn && btn.getClientRects().length > 0;     // a hidden, still-focused button must not eat Enter
  if (isEnter) {
    if (onBtn) return;
    if (e.isComposing || e.keyCode === 229) return;        // IME-safe Enter (Safari WebKit bug 165004)
    e.preventDefault(); key('enter'); return;
  }
  if (e.isComposing || e.keyCode === 229) return;
  if (e.key === 'Backspace') { e.preventDefault(); key('del'); return; }
  if (e.key === ' ') {
    if (onBtn) return;
    e.preventDefault();
    if (cur.length === L1() && !word1Done) { word1Done = true; BB.sfx('key'); renderBoard(); }
    return;
  }
  if (/^[0-9]$/.test(e.key)) {
    e.preventDefault();
    const [a, b] = wordRange();
    if (b > a) key(VNI[e.key]);
    return;
  }
  if (e.key.length <= 2 && [...e.key.normalize('NFC')].length === 1) {
    const ch = e.key.normalize('NFC').toLowerCase();
    if (telexOn() && /^[a-z]$/.test(ch)) {
      const tr = tryTelex(ch);
      if (tr !== null) {
        e.preventDefault();
        if (tr >= -1) { BB.sfx('key'); if (tr >= 0) popAt = tr; renderBoard(); }
        return;
      }
    }
    if (!LETTERS.has(split(ch).base)) return;
    e.preventDefault(); key(ch);
  }
});
$('wHint').onclick = () => { if (state === 'play' || state === 'reveal') { hintShown = true; hud(); BB.sfx('pop'); } $('wHint').blur(); focusIme(); };
$('wStart').onclick = () => startLevel(chosen);
$('wrNext').onclick = () => startLevel(passed ? (level < LV_MAX ? level + 1 : 1) : level);
$('wrReveal').onclick = () => {
  $('wrBig').textContent = answer(puzzle).toUpperCase();
  $('wrDetail').textContent = 'Lần sau sẽ đoán ra thôi!';
  $('wrReveal').classList.add('hidden');
  BB.lossAid($('wrNext'), { game: 'word', level, won: true });   // bỏ mẹo + nút sang level: nút chính giờ đã đi tiếp
  $('wrNext').textContent = level < LV_MAX ? `Level ${level+1} →` : 'Về Level 1';
  passed = true;   // cho đi tiếp, nhưng level này không có sao nên không có ✓
};
$('wrShare').onclick = async () => {
  const ok = await BB.copyText(lastShareText), live = $('wrShareStatus');
  let msg = ok ? 'Đã chép lưới lượt đoán' : 'Không chép được kết quả';
  if (msg === lastShareMsg) msg += '\u00A0';
  lastShareMsg = msg;
  clearTimeout(shareStatusT); live.textContent = '';
  requestAnimationFrame(() => { live.textContent = msg; });
  shareStatusT = setTimeout(() => { live.textContent = ''; }, 2000);
  BB.toast(ok ? 'Đã chép lưới lượt đoán' : 'Không chép được kết quả');
};
$('wrMenu').onclick = toMenu;
$('wMenuBtn').onclick = toMenu;
let rz = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(() => { if (window.APP && window.APP.active === 'word' && puzzle) renderBoard(); }); });
window.wordEnter = enter;
window.wordBest = bestLv;
// Cho test: đọc đáp án và chạy các hàm thuần, không đụng tới trạng thái ván.
// Chỉ mở cho trình duyệt tự động hoặc URL ?test, giống bốn game kia: người chơi thường không đọc được đáp án.
if (navigator.webdriver || /[?&]test\b/.test(location.search)) window.__word = { PHRASES, LEVELS, LV_MAX, viaBBD: LEVELS === rowsBBD, tonePos, normalizeSyllable, validSyllable, evaluateFor: (p, g) => { const s = puzzle; puzzle = p; const r = evaluate(g); puzzle = s; return r; },
  shareText: () => lastShareText,
  state: () => ({ state, level, rows: rows.length, cur: cur.join(''), puzzle: answer(puzzle), inGame, word1Done, hintShown }) };
})();
