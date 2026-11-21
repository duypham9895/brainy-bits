// Core (js/core.js), service worker and vendored licences. One test per review finding from
// docs/reviews/pr2-neon-round1.md that lands in a core-owned file (1, 2, 3, 4, 12, 14).
import { test, expect } from '@playwright/test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// ---------- finding 1: level counts ----------
test('BB.LV_MAX.word equals the real phrase count and games can register their own max (finding 1)', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    const before = BB.LV_MAX.word;
    const real = window.__word ? window.__word.LV_MAX : null;
    const same = BB.LV_MAX;                          // the object must stay the same reference
    const set = BB.setLvMax('word', real ?? before);
    const bad = [BB.setLvMax('word', 0), BB.setLvMax('word', 'x'), BB.setLvMax('nope', 5)];
    return { before, real, set, bad, sameRef: same === BB.LV_MAX, word: BB.LV_MAX.word };
  });
  expect(r.real).toBe(49);
  expect(r.before).toBe(r.real);
  expect(r.set).toBe(49);
  expect(r.bad).toEqual([49, 49, undefined]);       // invalid values never change the table
  expect(r.sameRef).toBe(true);
  expect(r.word).toBe(49);
});

test('daily challenge for Word is not capped at 12 for a player past level 12 (finding 1)', async ({ page }) => {
  await page.goto('/');
  const r = await page.evaluate(() => {
    // Find a day whose daily game is Word, then ask for it with best = 30.
    let date = null;
    for (let i = 0; i < 400 && !date; i++) {
      const d = new Date(2027, 0, 1 + i);
      const k = BB.dayKey(d);
      BB.store.del('bb_daily_pin');
      if (BB.daily(k).game === 'word') date = k;
    }
    BB.store.setJson('bb_stats', { word: { best: 30, stars: {} } });
    BB.store.del('bb_daily_pin');
    return { date, level: BB.daily(date).level };
  });
  expect(r.date).not.toBeNull();
  expect(r.level).toBe(31);
});

// ---------- finding 4: nothing from a game keeps running after BB.leave ----------
test('BB.leave cancels delayed sounds and stops the confetti loop (finding 4)', async ({ page }) => {
  await page.addInitScript(() => {
    window.__starts = 0; window.__raf = 0;
    const csb = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () { window.__starts++; return csb.apply(this, arguments); };
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = cb => { window.__raf++; return raf(cb); };
  });
  await page.goto('/');
  await page.evaluate(() => { BB.settings.sound = true; });

  // Delayed ticks: queued, then cancelled by leave before any of them plays.
  const queued = await page.evaluate(() => {
    for (let i = 1; i <= 5; i++) BB.sfx('tick', { delay: 0.2 + i * 0.1 });
    return BB.pendingSfx;
  });
  expect(queued).toBe(5);
  const after = await page.evaluate(async () => {
    const s0 = window.__starts;
    BB.leave('word');
    const pending = BB.pendingSfx;
    await new Promise(r => setTimeout(r, 900));
    return { pending, played: window.__starts - s0 };
  });
  expect(after).toEqual({ pending: 0, played: 0 });

  // Control: without leave the same delayed sound does play, so the zero above means something.
  const control = await page.evaluate(async () => {
    const s0 = window.__starts;
    BB.sfx('tick', { delay: 0.1 });
    await new Promise(r => setTimeout(r, 400));
    return { played: window.__starts - s0, pending: BB.pendingSfx };
  });
  expect(control).toEqual({ played: 1, pending: 0 });

  // Confetti: animating before leave, no animation frames after it.
  const conf = await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    BB.celebrate();
    await wait(50);
    let r0 = window.__raf; await wait(200);
    const during = window.__raf - r0;
    BB.leave('rain');
    await wait(80);
    r0 = window.__raf; await wait(300);
    return { during, afterLeave: window.__raf - r0 };
  });
  expect(conf.during).toBeGreaterThan(3);
  expect(conf.afterLeave).toBeLessThanOrEqual(1);
});

// ---------- finding 12: reset clears every seed flag ----------
test('BB.resetAll deletes every bb_seed* flag and leaves unrelated keys alone (finding 12)', async ({ page }) => {
  await page.goto('/');
  const left = await page.evaluate(() => {
    ['bb_seeded_v1', 'bb_seeded_v2', 'bb_seed_mem', 'bb_seed_rain', 'bb_seed_word'].forEach(k => localStorage.setItem(k, '1'));
    localStorage.setItem('bb_sound', '0');
    localStorage.setItem('word_lv', '25');
    BB.resetAll();
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    return keys.sort();
  });
  expect(left.filter(k => k.startsWith('bb_seed'))).toEqual([]);
  expect(left).not.toContain('word_lv');
  expect(left).toContain('bb_sound');                // settings are not progress
});

// ---------- finding 2: service worker revalidates and old caches go ----------
// A small server that behaves like GitHub Pages (Cache-Control: max-age=600 + ETag) and can swap
// one file's content, so a "deploy" can be simulated without touching the repo.
async function pagesLikeServer(overrides) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain' };
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    let body = overrides.get(p);
    if (body === undefined) {
      const f = path.join(root, p);
      if (!f.startsWith(root) || !fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
      body = fs.readFileSync(f);
    }
    const etag = '"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
    const h = { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'max-age=600', ETag: etag };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, h); res.end(); return; }
    res.writeHead(200, h); res.end(body);
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  return { srv, base: `http://127.0.0.1:${srv.address().port}` };
}

test('service worker shows a new deploy despite max-age=600, drops old caches and works offline (finding 2)', async ({ page, context }) => {
  const overrides = new Map([['/probe.txt', 'v1']]);
  const { srv, base } = await pagesLikeServer(overrides);
  try {
    await page.goto(base + '/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    const probe = () => page.evaluate(() => fetch('probe.txt').then(r => r.text()));
    expect(await probe()).toBe('v1');
    overrides.set('/probe.txt', 'v2');               // "deploy": same URL, new content, still inside max-age
    expect(await probe()).toBe('v2');                // old sw.js (plain fetch(req)) returned 'v1' here

    // An older cache left by the previous VERSION is deleted when the new worker activates.
    await page.evaluate(async () => {
      await (await caches.open('bb-v3')).put('/old', new Response('old'));
      await (await navigator.serviceWorker.getRegistration()).unregister();
    });
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('bb-v3');
    expect(await page.evaluate(() => caches.keys())).toContain('bb-v4');

    // Offline: the cached app shell still opens.
    if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('#hub')).toBeVisible();
    await context.setOffline(false);
  } finally {
    srv.close();
  }
});

// ---------- finding 3: full licence text ships inside each vendored file ----------
const MIT_ZZFX = `MIT License

Copyright (c) 2019 Frank Force

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

const ISC_CONFETTI = `ISC License

Copyright (c) 2020, Kiril Vatev

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.`;

test('vendored ZzFX and canvas-confetti carry their full licence text in the served file (finding 3)', async ({ request }) => {
  const head = async p => {
    const t = (await (await request.get(p)).text()).replace(/\r\n/g, '\n');
    return t.slice(0, t.indexOf('*/'));            // only the header comment counts
  };
  expect(await head('/vendor/zzfx-micro.js')).toContain(MIT_ZZFX);
  expect(await head('/vendor/confetti.js')).toContain(ISC_CONFETTI);
});

// ---------- finding 14: licences.json has no contradictory icons entry ----------
test('licences.json lists emoji symbols and the icon files without contradicting itself (finding 14)', async ({ request }) => {
  const j = await (await request.get('/legal/licences.json')).json();
  const names = j.assets.map(a => a.name);
  expect(names).not.toContain('Icons');
  const emoji = j.assets.find(a => /emoji/i.test(a.name));
  expect(emoji.licence).toMatch(/icons\//);
  expect(j.assets.find(a => a.source === 'icons/')).toBeTruthy();
});
