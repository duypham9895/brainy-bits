VERDICT: BLOCK

Cross-vendor review of PR #2 (`origin/main...HEAD`, commit `0b1b781`, 37 files changed) by Gemini (Orchestrator Neon).

Checks run:
- `npm run parity` → PASS (`reference/original.html` unchanged, sha256 `13170a583cd2`, `git diff origin/main...HEAD -- reference/original.html` = 0 lines).
- `PW_PORT=8899 npx playwright test --reporter=line` → 121 passed (2.6m).
- Full static read of all modified/added HTML, CSS, JS, SW, manifest, workflow, vendor, and licence files.
- Targeted live Playwright probes in Chromium against local HTTP servers (including simulated GitHub Pages `Cache-Control: max-age=600` + `ETag`, legacy `localStorage` keys, audio/rAF instrumentation on leave, keyboard focus, extra viewports `568x320` / `740x360` / `375x667` / `390x844` / `768x768`, and 326 Vietnamese syllables in `validSyllable`).

## Blocking Findings

1. **[BLOCKER] `BB.LV_MAX.word` is hardcoded to `12` instead of `49`, truncating returning players' `word_lv` progress and breaking Hub, Daily Challenge, and Share for Đoán Cụm Từ**
   - **Location**: `js/core.js:203`, `js/hub.js:18-46`, `js/word.js:22`, `tests/shell.spec.js:112`
   - **Evidence**:
     - `js/word.js:8-22` defines 49 phrases (`const LV_MAX = PHRASES.length;`), matching `reference/original.html:2298-2312`, while `js/core.js:203` defines `const LV_MAX = { train: 11, koi: 10, mem: 13, rain: 10, word: 12 };`.
     - Live Playwright run with `localStorage.word_lv = '25'` (24 passed levels): `hub.js` `legacyBest('word')` clamped `24` to `12`, `seedFromLegacy()` persisted `bb_stats.word.best = 12`, `#hubWord` displayed `"Xong cả 12 level"`, and `BB.shareText()` output `"Đoán Cụm Từ: Lv 12 ☆☆☆"`. Opening `#openWord` contradicted the hub by showing `"Đã qua tới Level 24/49"`, 49 level buttons, 24 `.done`, and `"Chơi Level 25 · 7 chữ cái"`.
     - Setting 3 stars on Word levels 1–15 made `#hubWord` display `"Xong cả 12 level · ★ 45/36"` (earned stars exceed denominator `12 * 3`).
     - `BB.daily()` (`js/core.js:257`) caps daily challenges for `word` at Level 12 for any player past level 12.
     - `tests/shell.spec.js:112` asserts `'12 level, chưa chơi'`, masking the mismatch.
   - **Exact fix**:
     - In `js/core.js:203`, change `word: 12` to `word: 49`.
     - In `js/hub.js:30-42`, allow legacy re-seeding whenever `legacyBest(k) > (s.best || 0)` (or bump `bb_seeded_v1` to `bb_seeded_v2`) so players previously clamped at 12 recover their true `word_lv` progress.
     - Update `tests/shell.spec.js:112` to `'49 level, chưa chơi'` and add a test with `word_lv = '25'` verifying `#hubWord` reads `'Đã qua 24/49 level'`.

2. **[BLOCKER] Service worker serves stale files and version-skewed HTML+JS after a deploy under GitHub Pages `Cache-Control: max-age=600`**
   - **Location**: `sw.js:28-39` (specifically `sw.js:31`)
   - **Evidence**:
     - `sw.js:31` executes `const res = await fetch(req);` with default HTTP cache rules and writes the response back into Cache Storage (`sw.js:32`).
     - Verified live in Playwright against a local server returning GitHub Pages' headers (`Cache-Control: max-age=600`, `ETag`): after loading v1 (`title: 'Brainy Bits v1'`, `js/hub.js` `__DEPLOY_VER = 1`) and switching the server to v2 with `sw.js` unchanged:
       - Normal navigation to `/` (simulating reopening a bookmark or installed PWA): SW sent 0 network requests (`navReqs: []`) and returned stale v1 (`{ title: 'Brainy Bits v1', ver: 1 }`).
       - Standard `page.reload()`: browser revalidated `/` only (`If-None-Match` on `/`), so SW returned **v2 `index.html` paired with stale v1 `js/hub.js`** (`{ title: 'Brainy Bits v2', ver: 1 }`), creating a mixed-version bundle that also gets written to Cache Storage.
     - Re-tested in the same harness with `cache: 'no-cache'`: both normal navigation and reload returned `{ title: 'Brainy Bits v2', ver: 2 }` immediately after deploy while sending `If-None-Match` (`304 Not Modified`) when unchanged.
   - **Exact fix**:
     - In `sw.js:31`, replace `const res = await fetch(req);` with:
       ```js
       const res = await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' });
       ```
       (Using `req.url` avoids Fetch-spec errors on `mode: 'navigate'` requests in Safari/WebKit, revalidates via `ETag` on every online load so new deploys appear immediately, and keeps the `catch` fallback to `caches.open(VERSION)` offline.)

3. **[BLOCKER] Vendored MIT and ISC libraries omit their required licence permission notices**
   - **Location**: `vendor/zzfx-micro.js:1-2`, `vendor/confetti.js:1-2`, `.github/workflows/pages.yml:24`
   - **Evidence**:
     - `vendor/zzfx-micro.js:1-2` contains only `/*! ZzFXMicro v1.4.0 by Frank Force. MIT License, Copyright (c) 2019 Frank Force.` — it omits the MIT permission notice and disclaimer, which the MIT License requires in all copies or substantial portions of the Software.
     - `vendor/confetti.js:1-2` (and `:800-888`) contains only `/*! canvas-confetti v1.9.4. ISC License, Copyright (c) 2020 Kiril Vatev.` — it omits the ISC permission notice and disclaimer, which the ISC License requires in all copies.
     - `.github/workflows/pages.yml:24` copies `index.html manifest.webmanifest sw.js css js vendor icons` to `_site/`, excluding `legal/`, so no licence text is shipped on the deployed site either.
   - **Exact fix**:
     - Embed the full verbatim MIT licence text (including `Copyright (c) 2019 Frank Force`) in the header comment of `vendor/zzfx-micro.js`.
     - Embed the full verbatim ISC licence text (including `Copyright (c) 2020 Kiril Vatev`) in the header comment of `vendor/confetti.js`.

4. **[BLOCKER] Delayed sound timers and confetti animation loop continue running after leaving a game**
   - **Location**: `js/word.js:290, 431-440`, `js/rain.js:351-355, 463`, `js/core.js:85, 154-165, 320`
   - **Evidence**:
     - `js/word.js:290` schedules up to `N()` (11 on Level 49) delayed `BB.sfx('tick', { delay })` calls via untracked `setTimeout`s in `js/core.js:85` (up to 1140 ms). `BB.onLeave('word')` (`js/word.js:431-440`) cannot cancel `core.js:85` timers, and line 432 returns early when `state !== 'reveal'` without clearing `starT`.
     - `js/rain.js:351-355` schedules up to 3 untracked `setTimeout`s (380/600/820 ms) guarded only by `if (state !== 'result') return;`. `BB.onLeave('rain', pause)` (`js/rain.js:463`) is a no-op when `state === 'result'`, leaving `state === 'result'` after navigating back to the Hub.
     - `js/core.js:154-165, 320`: `BB.celebrate()` runs `canvas-confetti`'s `requestAnimationFrame` loop on a fixed `z-index: 50` canvas (`ticks: 160`); `BB.leave()` never calls `confettiFn.reset()`.
     - Live Playwright instrumentation (`AudioContext.prototype.createBufferSource` + `window.requestAnimationFrame`):
       - Submitting Level 49 (`truyền thống`) in Word and immediately calling `history.back()` fired **11 `AudioBufferSourceNode.start()` calls while `APP.active === 'home'`** up to 1140 ms after leaving.
       - Winning a Rain level and immediately calling `history.back()` fired **3 `BB.sfx('star')` / `AudioBufferSourceNode.start()` calls while `APP.active === 'home'`** and left `confettiCanvasCount: 1` running **24 `requestAnimationFrame` callbacks in 400 ms on the Hub**.
   - **Exact fix**:
     - In `js/core.js`: track `sfx` `setTimeout` IDs in a `Set` (deleting each ID when it runs), and inside `BB.leave(key)` clear every pending `sfx` timer and call `if (confettiFn) confettiFn.reset()`.
     - In `js/rain.js`: track `showStars()` timer IDs in a `starTimers` array, clear them in `startLevel()`, `toMenu()`, and `BB.onLeave('rain', () => { pause(); clearStarTimers(); })`, and guard the timeout callback with `state === 'result' && window.APP.active === 'rain'`.
     - In `js/word.js:431-440`: call `clearTimers()` unconditionally at the top of `BB.onLeave('word', ...)` before `if (state !== 'reveal') return;`.

5. **[BLOCKER] Train HUD pills clip and overlap on common phone portrait widths (320 px, 375 px, 390 px) in late levels**
   - **Location**: `css/app.css:182-191`, `css/train.css:12-15`, `js/train.js:358-374`
   - **Evidence**:
     - `css/app.css:183` applies compact pill padding/font (`13px`, `4px 7px`) only up to `max-width: 374px`. At 375 px (iPhone SE 2/3, 8, X/12 mini/13 mini) and 390 px (iPhone 14/15/16), `#hud .pill` reverts to `15px` / `4px 12px`; because `.pill` has `white-space: nowrap` without `overflow: hidden` and shrinks via `flex: 0 1 auto; min-width: 0`, text spills into neighbouring pills.
     - Verified live in Playwright on Train Level 11 with streak and end-of-round drain (`Level 11 · 15 ga`, `✓ 12/15`, `🔥 12`, `Chờ 3 tàu`):
       - **320 px**: `#hScore` overflows by 6 px (`sw: 50 > cw: 44`), `#hStreak` by 2 px (`37 > 35`), `#hTime` by 10 px (`62 > 52`) and **`#hTime` text (`right=269`) overlaps `#pauseBtn` (`left=266`) by 3 px**.
       - **375 px**: `#hLevel` overflows by 18 px (`105 > 87`) and **overlaps `#hScore` by 8 px**; `#hScore` overflows by 3 px; `#hTime` overflows by 8 px.
       - **390 px**: `#hLevel` overflows by 12 px (`105 > 93`) and **overlaps `#hScore` by 2 px**; `#hTime` overflows by 4 px.
       - Existing tests missed this: `tests/shell.spec.js:38` left `#hTime` as `"90s"` (not `"Chờ 3 tàu"`), and `tests/train.spec.js:150` did not assert `scrollWidth <= clientWidth` on pills.
   - **Exact fix**:
     - Raise the compact `#trainApp #hud` breakpoint in `css/app.css` / `css/train.css` to `@media (max-width: 410px)` (`gap: 5px`, `font-size: 13px`, `padding: 4px 7px`), tighten `max-width: 359px` to `font-size: 12px; padding: 4px 6px`, shorten the drain pill text on narrow screens (e.g. `⏳ ${trains.length}` with `aria-label="Chờ ${trains.length} tàu"`), and add `overflow: hidden; text-overflow: ellipsis` on `.pill`.
     - Add pill `scrollWidth <= clientWidth` assertions to `tests/train.spec.js:150` at 320 px, 375 px, and 390 px.

## Non-Blocking Improvements

6. **[SHOULD] Accessibility: `wireOverlays()` does not move focus into Train/Koi/Rain menus on first open, and `aria-modal` dialogs do not trap keyboard focus**
   - **Location**: `js/core.js:293-313`, `index.html:51, 163, 290`
   - **Evidence**:
     - `js/core.js:311` observes `class`/`style` only on `.overlay` itself, not on parent `#*App` containers toggled in `js/hub.js:83`. Because `#menu`, `#kmenu`, `#rmenu` lack `.hidden` in HTML, opening Train, Koi, or Rain triggers no mutation on the overlay.
     - Verified live in Playwright: after clicking `#openTrain`, `#openKoi`, or `#openRain`, `document.activeElement` was `BODY` (`focusInsideMenu: false`, `menuOpenFlag: undefined`).
     - Verified live on `#settings`: pressing `Tab` 4 times escaped the modal onto `#hubSettings`, `#hubDaily`, `#openTrain`, `#openKoi` underneath.
   - **Exact fix**: Start all game menu overlays with `.hidden` (or invoke a `BB.syncOverlays()` check from `hub.js:route()`), and trap `Tab`/`Shift+Tab` (or apply `inert` to background siblings) while any `.overlay` dialog is open.

7. **[SHOULD] `#settings` stays open above a game after browser Forward or hash navigation**
   - **Location**: `js/hub.js:77-88, 139`
   - **Evidence**:
     - `route()` hides `#hub` and displays the target game without calling `closeSettings()`, while `#settings` has `z-index: 25` (`css/app.css:226`) above game overlays (`z-index: 5`).
     - Verified live in Playwright: `#openTrain` → `goBack()` → `#hubSettings` → `goForward()` resulted in `APP.active === 'train'` with `#settings` still visible and intercepting all pointer events to `#startBtn`.
   - **Exact fix**: Call `closeSettings()` at the start of `route()` in `js/hub.js:77`.

8. **[SHOULD] `manifest.webmanifest` forces `"orientation": "portrait"`, conflicting with phone/tablet landscape support**
   - **Location**: `manifest.webmanifest:10`
   - **Evidence**: `manifest.webmanifest:10` sets `"orientation": "portrait"`, whereas this PR specifically implements landscape layouts (`css/rain.css:59`, `css/word.css:69`, `css/mem.css:28`, `css/app.css:254-275`, `tests/responsive.spec.js:11-16`). Browsers that enforce manifest orientation on installed PWAs lock tablet and phone users out of landscape.
   - **Exact fix**: Change `"orientation": "portrait"` to `"orientation": "any"` (or remove the key).

9. **[SHOULD] Accessibility: Rain falling-drop equations fail WCAG AA text contrast**
   - **Location**: `js/rain.js:202-216`
   - **Evidence**: `#ffffff` 16 px text is painted over a gradient from `#8fd0ff` (top) to `#2f7fd6` (bottom) with no stroke or shadow. Measured contrast ratios: **1.66:1** at top (`#8fd0ff`), **2.53:1** at center (`#60a8ea`), **4.10:1** at bottom (`#2f7fd6`) — all below WCAG AA 4.5:1.
   - **Exact fix**: Darken the drop gradient (e.g. `#1b69b8` to `#0f4482`) and/or stroke text with `rgba(7,22,42,.85)` so contrast is ≥ 4.5:1 across the glyph height.

10. **[SHOULD] `RTD_MAP.generate(15, w, h)` drops below 15 stations and `minSwitchDist < 2` on square/near-square viewports**
    - **Location**: `js/train-map.js:28-33, 210-226`
    - **Evidence**: On ~1:1 canvases, `gridSize(15)` uses `8×8 = 64` cells while reserving a 5-cell initial lead (`js/train-map.js:69`). Live Playwright runs: `generate(15, 768, 768)` and `(15, 800, 800)` fell back to partial maps (`< 15` stations) in **5/5 runs each**, with `minSwitchDist < 2` in 3/5 and 1/5 runs; `(15, 768, 704)` dropped to 14 stations with `minSwitchDist < 2` in 1/5 runs (~300 ms avg).
    - **Exact fix**: In `js/train-map.js:28-33`, guarantee a minimum grid area for high station counts (e.g. if `n >= 12 && C * R < 80`, bump to `9×9`).

11. **[SHOULD] Short phone landscape (`568×320`, `740×360`): Mem 6×6 tiles drop under 44 px and Word L49 cells hit 16 px**
    - **Location**: `css/mem.css:28-32`, `css/word.css:69-85`, `js/word.js:141`
    - **Evidence**: Live Playwright measurements on max levels:
      - `mem` Level 13 (6×6): tiles are `43×43 px` at `740×360` and `37×37 px` at `568×320` (below 44 px touch target) because `#memApp .ghud` keeps 10 px vertical padding (`64px` tall).
      - `word` Level 49 (`truyền thống`) at `568×320`: `.wcell` shrinks to `16×16 px` (`font-size: 8px`), making stacked Vietnamese diacritics hard to read.
    - **Exact fix**: In `css/mem.css:28-32`, add `#memApp .ghud{padding-top:calc(4px + env(safe-area-inset-top));padding-bottom:4px}` and widen `.mgrid` height budget to `calc(100dvh - 68px)` (restoring ≥ 44 px tiles at `740×360`); in `css/word.css:69-85`, compact `#wKeys` padding/gap below `max-height: 350px`.

12. **[SHOULD] Progress/lifecycle inconsistencies across games (`rain.js` ignores `bb_stats`, duplicate seed flags survive reset, `mem.js` drops round on leave)**
    - **Location**: `js/rain.js:16, 474`, `js/mem.js:20-28, 337-340`, `js/rain.js:21-29`, `js/core.js:285-288`
    - **Evidence**:
      - Live Playwright check with `bb_stats.rain.best = 4` and no `rain_lv`: `#hubRain` showed `Đã qua 4/10 level`, while `#mua` showed `rBestTxt: ''`, `doneCount: 0`, `rStart: 'Chơi Level 1'`, `rainBest() === 0`.
      - `bb_seed_mem` (`js/mem.js:20`) and `bb_seed_rain` (`js/rain.js:22`) are never removed by `BB.resetAll()` (`js/core.js:286-288`) and duplicate `hub.js:seedFromLegacy()`.
      - `BB.onLeave('mem')` (`js/mem.js:337-340`) wipes the in-progress round (`phase = 'idle'`), whereas Train, Koi, Rain, and Word preserve in-progress rounds.
    - **Exact fix**: Read `Math.max(BB.store.num('rain_lv', 1, 1, LV_MAX + 1), BB.gameStats('rain').best + 1)` in `js/rain.js:16`; remove redundant `bb_seed_mem`/`bb_seed_rain` blocks (or delete them in `resetAll()`); optionally pause Mem on `BB.onLeave('mem')`.

13. **[NIT] Minor Vietnamese copy and screen-reader wording fixes**
    - **Location**: `js/koi.js:486`, `js/koi.js:454`, `index.html:114`, `js/koi.js:508-512`
    - **Evidence**:
      - `js/koi.js:486`: `'Cần nhầm tối đa 1 lần để qua level.'` sounds unnatural ("cần nhầm" reads like needing to make a mistake; `index.html:173` says `Nhầm tối đa 1 lần là qua`).
      - `js/koi.js:454`: for legacy passed levels without stars (`done === true, n === 0`), `aria-label` reads `"Level 1, 6 cá, đã qua, 0 sao"` (whereas `mem.js:267` and `rain.js:398` omit stars when `0`).
      - `index.html:114`: Hub card for Train says `"đưa tàu về đúng ga cùng màu"`, omitting `"cùng hình"` added in `index.html:55`.
      - `js/koi.js:508-512` (and `index.html:75-76`): `<b>10</b>level đã qua` has no whitespace between number and label in DOM text (`"10level đã qua"`).
    - **Exact fix**:
      - Change `js/koi.js:486` to `'Chỉ được nhầm tối đa 1 lần để qua level.'`.
      - Change `js/koi.js:454` to `${done ? ', đã qua' : ''}${n ? `, ${n} sao` : ''}`.
      - Update `index.html:114` to `'Đổi ngã rẽ, đưa tàu về đúng ga cùng màu, cùng hình'`.
      - Prefix `' '` to the label text node in `statCell()` (`js/koi.js:511`) and `index.html:75-76`.

14. **[NIT] Minor code hygiene (`window.__word` exposed in prod, missing `aria-pressed`, idle rAF on pause, stale comments & `licences.json`)**
    - **Location**: `js/word.js:385-388, 505`, `js/koi.js:372-383`, `js/rain.js:262-268`, `vendor/zzfx-micro.js:6`, `index.html:394-395`, `legal/licences.json:15-17`, `js/train.js:599-615`
    - **Evidence**:
      - `js/word.js:505` attaches `window.__word` (exposing `PHRASES` and the current answer `state().puzzle`) unconditionally, unlike the other four games which gate hooks behind `navigator.webdriver` / `__BB_TEST__` / `?test`.
      - `js/word.js:385-388` omits `aria-pressed` on `#wlvgrid .lv` buttons (Train, Koi, Mem, Rain all set it).
      - `js/koi.js:372-383` and `js/rain.js:262-268` stop rAF when leaving the game, but keep running 60 fps while paused (measured 36 rAF calls in 300 ms while Koi was paused).
      - `vendor/zzfx-micro.js:6` creates `new AudioContext` eagerly at script load (`state: 'suspended'`); `core.js:45` resumes it on first pointer/key event, though lazy creation avoids browser autoplay warnings.
      - `index.html:394-395` contains an internal orchestrator comment that contradicts line 388 (`train-map.js` loads before `train.js`).
      - `legal/licences.json:15-17` still states `"Icons": "None bundled: emoji characters..."` alongside `"App icons and share image (icons/)"` (`legal/licences.json:40-43`).
      - `js/train.js:607`: returning players with `localStorage.rtd_best3 = '5'` see `doneCount: 0` on `#lvgrid` because `bb_stats.train.stars` is empty (even Level 5 itself is unmarked, though `bestTxt` and `chosenLv = 6` still honour `rtd_best3`).
    - **Exact fix**: Gate `window.__word` behind `navigator.webdriver || /[?&]test\b/.test(location.search)`; add `aria-pressed` to `#wlvgrid .lv`; pause rAF during `state === 'paused'` in `koi.js`/`rain.js`; remove the stale comment in `index.html:394-395`; reconcile `legal/licences.json:15-17`.

## What Could Not Be Checked

- **Physical mobile devices, iOS Safari, and Android Chrome**: All live checks ran in headless Chromium on macOS (`Playwright 1.56.1`). Real iOS Safari `AudioContext` `interrupted` recovery, Android `navigator.vibrate`, native `navigator.share` into Zalo/Messenger, home-screen PWA `standalone` safe-area/notch insets and manifest orientation locking, and OS-level Vietnamese IME composition (Unikey / iOS Telex / Android Gboard) were not tested.
- **Live GitHub Pages deployment & cross-origin font caching**: Tested SW deploy caching against a local HTTP server with `Cache-Control: max-age=600` + `ETag`, not live `https://duypham9895.github.io/brainy-bits/` (so live `og.png` unfurling and cross-origin `fonts.googleapis.com`/`fonts.gstatic.com` opaque caching were not verified end-to-end).
- **Assistive technology speech output**: Verified ARIA attributes, roles, live regions, and keyboard focus programmatically in Chromium, not with VoiceOver, TalkBack, or NVDA.
- **Manual full playthrough of every intermediate level**: Verified core logic, boundary/max levels (Train L11, Koi L10, Mem L13, Rain L10, Word L49), and all 121 Playwright tests, not playing every level 1..N manually from start to finish.
