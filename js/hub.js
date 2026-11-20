// ======================= TRANG CHỦ / CHUYỂN GAME =======================
(() => {
const $ = id => document.getElementById(id);
const APP = window.APP;
const GAMES = {
  tau: { app: 'trainApp', key: 'train', enter: () => window.trainEnter() },
  koi: { app: 'koiApp',   key: 'koi',   enter: () => window.koiEnter() },
  nho: { app: 'memApp',   key: 'mem',   enter: () => window.memEnter() },
  mua: { app: 'rainApp',  key: 'rain',  enter: () => window.rainEnter() },
  chu: { app: 'wordApp',  key: 'word',  enter: () => window.wordEnter() },
};
function route(){
  const h = location.hash.replace('#','');
  Object.entries(GAMES).forEach(([name, g]) => $(g.app).style.display = h === name ? 'block' : 'none');
  const game = GAMES[h];
  $('hub').classList.toggle('hidden', !!game);
  if (game) { APP.active = game.key; game.enter(); return; }
  APP.active = 'home';
  const tb = window.trainBest ? window.trainBest() : 0;
  $('hubTrain').textContent = tb ? `Đã qua tới Level ${tb}` : '';
  const kb = window.koiBest ? window.koiBest() : null;
  $('hubKoi').textContent = kb && kb.lv > 1 ? `Đã qua tới Level ${kb.lv - 1}` : '';
  const mb = window.memBest ? window.memBest() : 0;
  $('hubMem').textContent = mb ? `Đã qua tới Level ${mb}` : '';
  const rb = window.rainBest ? window.rainBest() : 0;
  $('hubRain').textContent = rb ? `Đã qua tới Level ${rb}` : '';
  const wb = window.wordBest ? window.wordBest() : 0;
  $('hubWord').textContent = wb ? `Đã qua tới Level ${wb}` : '';
}
function go(name){ if (location.hash.replace('#','') === name) route(); else location.hash = name; }
$('openTrain').onclick = () => go('tau');
$('openKoi').onclick = () => go('koi');
$('openMem').onclick = () => go('nho');
$('openRain').onclick = () => go('mua');
$('openWord').onclick = () => go('chu');
document.querySelectorAll('[data-home]').forEach(b => b.onclick = () => {
  if (location.hash) { try { history.replaceState(null, '', location.pathname + location.search); } catch(e){ location.hash = ''; } }
  route();
});
window.addEventListener('hashchange', route);
route();
})();
