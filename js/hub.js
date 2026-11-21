// ======================= TRANG CHỦ / CHUYỂN GAME =======================
(() => {
const $ = id => document.getElementById(id);
const APP = window.APP;
const BB = window.BB;
const GAMES = {
  tau: { app: 'trainApp', key: 'train', hub: 'hubTrain', enter: () => window.trainEnter() },
  koi: { app: 'koiApp',   key: 'koi',   hub: 'hubKoi',   enter: () => window.koiEnter() },
  nho: { app: 'memApp',   key: 'mem',   hub: 'hubMem',   enter: () => window.memEnter() },
  mua: { app: 'rainApp',  key: 'rain',  hub: 'hubRain',  enter: () => window.rainEnter() },
  chu: { app: 'wordApp',  key: 'word',  hub: 'hubWord',  enter: () => window.wordEnter() },
};
const HASH_OF = Object.fromEntries(Object.entries(GAMES).map(([h, g]) => [g.key, h]));

// ---------- legacy progress ----------
// Old builds stored the highest level passed (train) or the next level to play (the other four).
// Read them so nobody loses unlocked levels, and seed BB stats from them once per seed version.
// v2: builds with word capped at 12 seeded bb_stats.word.best = 12; re-seeding lifts it back to the
// real legacy value. Seeding only ever raises best, so running it again is safe.
function legacyBest(key) {
  const s = BB.store, max = BB.LV_MAX[key];
  const next = k => Math.max(0, s.num(k, 1, 1, 9999) - 1);
  const raw = {
    train: () => s.num('rtd_best3', 0, 0, 9999),
    koi:   () => next('koi_lv2'),
    mem:   () => next('mem_lv'),
    rain:  () => next('rain_lv'),
    word:  () => next('word_lv'),
  }[key]();
  return Math.min(max, raw);
}
const SEED_FLAG = 'bb_seeded_v2';
function seedFromLegacy() {
  if (BB.store.get(SEED_FLAG)) return;
  const all = BB.stats();
  BB.GAMES.forEach(k => {
    const old = legacyBest(k);
    if (!old) return;
    const s = all[k] || (all[k] = { best: 0, stars: {} });
    s.stars = s.stars || {};
    if (old > (s.best || 0)) s.best = old;
  });
  BB.store.setJson('bb_stats', all);
  BB.store.set(SEED_FLAG, '1');
}

function bestOf(key) {
  return Math.min(BB.LV_MAX[key], Math.max(BB.gameStats(key).best, legacyBest(key)));
}
function starsOf(key) {
  return Object.values(BB.gameStats(key).stars).reduce((a, b) => a + (b || 0), 0);
}

// ---------- hub render ----------
let shownStars = 0, shownStreak = 0;
function renderHub() {
  Object.values(GAMES).forEach(g => {
    const max = BB.LV_MAX[g.key], best = bestOf(g.key), st = starsOf(g.key);
    const star = st ? ` · ★ ${st}/${max * 3}` : '';
    $(g.hub).textContent = best >= max ? `Xong cả ${max} level${star}`
      : best ? `Đã qua ${best}/${max} level${star}` : `${max} level, chưa chơi`;
    $(g.hub).classList.toggle('fresh', !best);
  });
  const stars = BB.totalStars(), streak = BB.dayStreak();
  BB.countUp($('hubStars'), shownStars, stars);
  BB.countUp($('hubStreak'), shownStreak, streak);
  shownStars = stars; shownStreak = streak;

  const d = BB.daily();
  $('hubDailyNo').textContent = `#${d.idx}`;
  $('hubDailyGame').textContent = `${BB.GAME_NAME[d.game]} · Level ${d.level}`;
  $('hubDailyState').textContent = d.done ? '✓ Đã xong' : 'Chơi';
  $('hubDaily').classList.toggle('done', d.done);
  $('hubDaily').setAttribute('aria-label',
    `Thử thách hôm nay: ${BB.GAME_NAME[d.game]}, Level ${d.level}. ${d.done ? 'Đã xong' : 'Chơi ngay'}`);
}

// ---------- dialog focus ----------
// Game menus are visible from page load, so core's overlay observer never sees them "open":
// after the router shows a game, move focus into its open dialog. Tab / Shift+Tab then stay inside
// the top open dialog (no inert on siblings: games keep their own key handlers untouched).
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
const isShown = el => !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0;
function openDialog() {
  if (isShown(sheet)) return sheet;
  const app = current && $(Object.values(GAMES).find(g => g.key === current).app);
  if (!app) return null;
  const ovs = [...app.querySelectorAll('.overlay[aria-modal="true"]')].filter(isShown);
  return ovs[ovs.length - 1] || null;
}
const focusables = ov => [...ov.querySelectorAll(FOCUSABLE)].filter(el => !el.disabled && el.getClientRects().length > 0);
function focusDialog() {
  if (typeof BB.syncOverlays === 'function') { try { BB.syncOverlays(); } catch (e) {} }
  // After core's own 30 ms focus move, and after enter() may have swapped the menu for a level.
  setTimeout(() => {
    const ov = openDialog();
    if (!ov || ov.contains(document.activeElement)) return;
    const first = focusables(ov)[0];
    if (first) { try { first.focus({ preventScroll: true }); } catch (e) {} }
  }, 40);
}
window.addEventListener('keydown', e => {
  if (e.key !== 'Tab' || e.defaultPrevented) return;
  const ov = openDialog(); if (!ov) return;
  const els = focusables(ov); if (!els.length) return;
  const first = els[0], last = els[els.length - 1], a = document.activeElement;
  const inside = ov.contains(a);
  if (!inside || (e.shiftKey && a === first) || (!e.shiftKey && a === last)) {
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  }
});

// ---------- router ----------
let current = null;                                  // game key on screen, or null for the hub
function route() {
  closeSettings();                                   // Forward / hash change must not leave the sheet over a game
  const h = location.hash.replace('#', '');
  const game = GAMES[h] || null;
  const next = game ? game.key : null;
  if (current && current !== next) BB.leave(current); // let the game pause before it is hidden
  current = next;
  Object.entries(GAMES).forEach(([name, g]) => { $(g.app).style.display = h === name ? 'block' : 'none'; });
  $('hub').classList.toggle('hidden', !!game);
  if (game) { APP.active = game.key; game.enter(); focusDialog(); return; }
  APP.active = 'home';
  renderHub();
}
// Open a game as a new history entry tagged as "came from the hub", so the home button can step
// back instead of replacing the entry (SHELL-10: Back would otherwise do nothing once).
function go(name) {
  if (location.hash.replace('#', '') === name) { route(); return; }
  try { history.pushState({ bbFromHub: true }, '', '#' + name); route(); }
  catch (e) { location.hash = name; }
}
function goHome() {
  if (!location.hash) { route(); return; }
  if (history.state && history.state.bbFromHub) { history.back(); return; }   // hashchange -> route
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
  route();
}

$('openTrain').onclick = () => go('tau');
$('openKoi').onclick = () => go('koi');
$('openMem').onclick = () => go('nho');
$('openRain').onclick = () => go('mua');
$('openWord').onclick = () => go('chu');
document.querySelectorAll('[data-home]').forEach(b => b.onclick = goHome);
// Back/forward fires popstate and hashchange together; route once per real change.
const onNav = () => { if (location.hash.replace('#', '') !== (current ? HASH_OF[current] : '')) route(); };
window.addEventListener('hashchange', onNav);
window.addEventListener('popstate', onNav);

// ---------- daily challenge ----------
$('hubDaily').onclick = () => {
  const d = BB.daily();
  BB.sfx('tap'); BB.haptic('tap');
  if (!d.done) BB.request(d.game, d.level);          // done: just open the game at its menu
  go(HASH_OF[d.game]);
};

// ---------- share ----------
$('hubShare').onclick = async () => {
  const r = await BB.share();
  if (r === 'failed') BB.toast('Chưa chia sẻ được, thử lại sau nhé');
};

// ---------- settings sheet ----------
const sheet = $('settings');
function syncSwitches() {
  $('setSound').setAttribute('aria-checked', String(BB.settings.sound));
  $('setHaptic').setAttribute('aria-checked', String(BB.settings.haptics));
}
function openSettings() {
  syncSwitches();
  $('setConfirm').classList.add('hidden'); $('setReset').classList.remove('hidden');
  sheet.classList.remove('hidden');
}
function closeSettings() { sheet.classList.add('hidden'); }
if (!('vibrate' in navigator)) $('setHapticRow').classList.add('hidden');   // iPhone Safari cannot vibrate
$('hubSettings').onclick = openSettings;
$('setClose').onclick = closeSettings;
sheet.addEventListener('click', e => { if (e.target === sheet) closeSettings(); });
$('setSound').onclick = () => { BB.settings.sound = !BB.settings.sound; syncSwitches(); BB.sfx('tap'); };
$('setHaptic').onclick = () => { BB.settings.haptics = !BB.settings.haptics; syncSwitches(); BB.haptic('tap'); };
$('setReset').onclick = () => {
  $('setReset').classList.add('hidden'); $('setConfirm').classList.remove('hidden');
  $('setResetNo').focus();
};
$('setResetNo').onclick = () => {
  $('setConfirm').classList.add('hidden'); $('setReset').classList.remove('hidden'); $('setReset').focus();
};
$('setResetYes').onclick = () => {
  BB.resetAll();
  BB.store.del('bb_seeded_v1'); BB.store.del(SEED_FLAG);
  // Games keep their level in memory, so a reload is the only way every screen starts clean.
  location.reload();
};

// ---------- keyboard ----------
// Esc closes the settings sheet, or pauses / resumes the open game. A game that handles Esc
// itself calls e.preventDefault() and this handler stays out of the way.
const PAUSE = { train: ['pauseBtn', 'paused', 'resumeBtn'], koi: ['kPauseBtn', 'kpaused', 'kResumeBtn'],
  mem: ['mPause', 'mpaused', 'mResume'], rain: ['rPause', 'rpaused', 'rResume'] };
const visible = el => el && !el.classList.contains('hidden') && el.getClientRects().length > 0;
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (visible(sheet)) { closeSettings(); e.preventDefault(); return; }
  const p = current && PAUSE[current]; if (!p) return;
  const [btn, ov, resume] = p.map(id => $(id));
  if (visible(ov)) { resume && resume.click(); e.preventDefault(); }
  else if (visible(btn)) { btn.click(); e.preventDefault(); }
});

seedFromLegacy();
route();
})();
