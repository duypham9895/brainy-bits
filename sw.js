// Brainy Bits offline cache. Same-origin requests go to the network first, so stale files are
// never served while online. Bump VERSION when the precache list changes; activate deletes old caches. Pattern after mdn/pwa-examples (CC0-1.0), own code.
const VERSION = 'bb-v8';
const FONT_CACHE = 'bb-fonts-v2';   // v2: the stylesheet is now a CORS request; v1 held opaque copies
const PRECACHE = [
  './', 'index.html', 'manifest.webmanifest', 'favicon.ico',
  'css/app.css', 'css/train.css', 'css/koi.css', 'css/mem.css', 'css/rain.css', 'css/word.css', 'css/install.css',
  'vendor/zzfx-micro.js', 'vendor/confetti.js',
  'js/core.js', 'js/qr.js', 'js/difficulty.js',
  'js/install-platform.js', 'js/install-copy.js', 'js/install-art.js', 'js/install.js',
  'js/levels/train.js', 'js/levels/koi.js', 'js/levels/mem.js', 'js/levels/rain.js', 'js/levels/word.js',
  'js/train.js', 'js/train-map.js', 'js/koi.js', 'js/mem.js', 'js/rain.js', 'js/word.js', 'js/hub.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', e => {
  // One missing file must not block the whole install, so each one is cached on its own.
  // cache: 'no-cache' revalidates with the server (304 when the page just loaded the same file)
  // instead of 'reload', which downloaded the whole app a second time right after the first visit.
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: 'no-cache' })).catch(() => {}))))
    .then(() => self.skipWaiting()));
});

// A file the install could not fetch (a 500, a dropped connection) is copied from the previous
// cache before that cache is deleted, so one bad request never leaves a game broken offline.
async function fillGaps(keys) {
  const c = await caches.open(VERSION);
  const old = keys.filter(k => k !== VERSION && k !== FONT_CACHE);
  const appOld = old.filter(k => !k.startsWith('bb-fonts')).reverse();   // newest cache first
  for (const u of PRECACHE) {
    if (await c.match(u)) continue;
    for (const k of appOld) {
      const hit = await (await caches.open(k)).match(u);
      if (hit) { await c.put(u, hit).catch(() => {}); break; }
    }
  }
  return old;
}

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(fillGaps)
    .then(old => Promise.all(old.map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Same-origin files: network first so a new deploy (or a local edit during preview) shows up on
// the next load without anyone bumping VERSION; the cache is only the offline fallback.
// cache: 'no-cache' makes every online fetch revalidate with the server (ETag -> 304 when unchanged),
// so GitHub Pages' max-age=600 cannot hand back a stale file or pair new HTML with old JS.
// Fetching by req.url (not the Request) avoids WebKit rejecting a mode:'navigate' request in init.
async function sameOrigin(req) {
  const c = await caches.open(VERSION);
  try {
    const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
    // A full disk must not turn a good network answer into a failed load.
    if (res.ok && res.type === 'basic') c.put(req, res.clone()).catch(() => {});
    if (res.type !== 'basic') return res;
    const h = new Headers(res.headers); h.set('Cache-Control', 'no-cache');
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
  } catch (err) {
    const hit = await c.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    throw err;
  }
}

async function networkFirst(req, cacheName) {
  const c = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    // The <link> has crossorigin, so the CSS is a CORS response (opaque ones are padded to
    // megabytes in storage quotas, and a CORS request cannot use them offline).
    if (res.ok) c.put(req, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    const hit = await c.match(req);
    if (hit) return hit;
    throw err;
  }
}

async function fontFile(req) {
  const c = await caches.open(FONT_CACHE);
  const hit = await c.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') c.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    // The page itself: network first, falling back to the cached index for any in-scope navigation.
    if (req.mode === 'navigate') {
      e.respondWith(sameOrigin(req).catch(() => caches.match('index.html')));
      return;
    }
    e.respondWith(sameOrigin(req));
  } else if (url.hostname === 'fonts.googleapis.com') {
    e.respondWith(networkFirst(req, FONT_CACHE));      // the CSS can change; use the last copy offline
  } else if (url.hostname === 'fonts.gstatic.com') {
    e.respondWith(fontFile(req));                      // font files are immutable by URL
  }
});
