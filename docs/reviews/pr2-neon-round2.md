VERDICT: BLOCK

Round 2 cross-vendor check of PR #2 (`0b1b781..2d77ebe`, commits `0f0e6bc`, `1f8f1d2`, `63bb0c0`, `5636288`, `77c3927`, `2d77ebe`) by Gemini (Orchestrator Neon).

Checks run:
- `npm run parity` → PASS (`reference/original.html` unchanged, `13170a583cd2`).
- `PW_PORT=8899 npx playwright test --reporter=line` → 170 passed (2.6m).
- Full diff read of `0b1b781..HEAD` across all non-test files and new regression tests.
- Live Chromium Playwright repros for all 5 round-1 blockers, all round-2 fix surfaces (pause/quit/restart across games, Word landscape floating HUD, wide fallback font Train HUD), and remaining SHOULD/NIT items.

All 5 round-1 blockers are **FIXED**, but commit `77c3927` introduced **1 NEW BLOCKER** in Rain (`js/rain.js`).

## Round-1 Blockers Re-Check

1. **`BB.LV_MAX.word` hardcoded to `12` instead of `49`** — **FIXED**
   - **Fix verified**: `js/core.js:211-216` sets `word: 49` and adds `BB.setLvMax()`; `js/word.js:25` registers `LV_MAX`; `js/hub.js:32-45` bumps `SEED_FLAG` to `bb_seeded_v2` so previously clamped players recover `word_lv`.
   - **Live repro evidence**:
     - Fresh storage: `BB.LV_MAX.word === 49`, `#hubWord` reads `"49 level, chưa chơi"`.
     - Legacy `word_lv = '25'`: `#hubWord` reads `"Đã qua 24/49 level"`, `BB.gameStats('word').best === 24`, `BB.shareText()` includes `"Đoán Cụm Từ: Lv 24"`, and `#openWord` matches (`"Đã qua tới Level 24/49"`, 49 buttons, 24 `.done`, `"Chơi Level 25 · 7 chữ cái"`).
     - Previously clamped state (`bb_seeded_v1 = '1'`, `bb_stats.word.best = 12`, `word_lv = '25'`): re-seeds to `best: 24`, `#hubWord` reads `"Đã qua 24/49 level"`, and `BB.daily('2026-11-26')` (a `word` day) returns `level: 25`.
     - 3 stars on levels 1–15: `#hubWord` reads `"Đã qua 24/49 level · ★ 45/147"`.

2. **Service worker serves stale / version-skewed files under `Cache-Control: max-age=600`** — **FIXED**
   - **Fix verified**: `sw.js:3, 34-38` bumps `VERSION` to `'bb-v3'`, revalidates same-origin requests with `fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })`, and sets `Cache-Control: no-cache` on basic responses returned to the page.
   - **Live repro evidence** (local HTTP server sending `Cache-Control: max-age=600` + `ETag`, `sw.js` unchanged across deploys):
     - Controlled at v1 (`{ title: 'Brainy Bits v1', ver: 1 }`), switch server to v2, normal `page.goto('/')`: SW sent `If-None-Match` (`"index-v1"`, `"hub-v1"`), received `200`, and rendered `{ title: 'Brainy Bits v2', ver: 2 }`.
     - Switch server to v3, `page.reload()`: both `/` and `/js/hub.js` revalidated and rendered `{ title: 'Brainy Bits v3', ver: 3 }` (no mixed HTML/JS).
     - Unchanged reload at v3: both `/` and `/js/hub.js` sent `If-None-Match` and received `304`.
     - Offline `page.goto('/')`: served cached `{ title: 'Brainy Bits v3', ver: 3 }`.

3. **Vendored MIT and ISC libraries omit required licence notices** — **FIXED**
   - **Evidence**: `vendor/zzfx-micro.js:1-27` embeds the full verbatim MIT License text (`Copyright (c) 2019 Frank Force`, permission notice, and warranty disclaimer); `vendor/confetti.js:1-21` embeds the full verbatim ISC License text (`Copyright (c) 2020, Kiril Vatev`, permission notice, and warranty disclaimer). `.github/workflows/pages.yml:24` copies `vendor/` into `_site/`.

4. **Delayed sound timers and confetti animation loop continue running after leaving a game** — **FIXED**
   - **Fix verified**: `js/core.js:85-91, 342-346` tracks delayed `sfx` timers in `sfxTimers`, cancels them inside `BB.leave()`, and calls `confettiFn.reset()`. `js/rain.js:310-311, 314, 356-360, 413, 469` tracks/clears `starTimers` on start/menu/leave and guards callbacks on `APP.active === 'rain'`. `js/word.js:85, 294-296, 326, 439-441` tracks `tickT` and calls `clearTimers()` unconditionally at the start of `BB.onLeave('word')`.
   - **Live repro evidence** (instrumented `AudioContext.prototype.createBufferSource` and `requestAnimationFrame` callback sources):
     - Word Level 49 (`truyền thống`) submit + immediate `history.back()`: `audioOnHome: 0`, `BB.pendingSfx: 0`, and `BB.gameStats('word').best === 49`.
     - Word Level 1 result screen + immediate `history.back()`: `audioOnHome: 0`, `BB.pendingSfx: 0`.
     - Rain Level 1 win + immediate `history.back()`: `audioOnHome: 0`, `rainStarTimers: 0`, `BB.pendingSfx: 0`. Confetti canvas existed before leave (`1280x720`), zero confetti rAF frames fired after `history.back()` (only `BB.countUp` ran during 0–850 ms; 0 total rAF callbacks in 850–1300 ms).
     - Train `endWith(1, 10, 10)` + immediate `history.back()`: `audioOnHome: 0`, `BB.pendingSfx: 0`.

5. **Train HUD pills clip and overlap on narrow phone portrait widths (320 / 375 / 390 px)** — **FIXED**
   - **Fix verified**: `css/app.css:184-185` prevents pill shrinking (`flex: none; min-width: auto`) and wraps crowded HUDs (`flex-wrap: wrap`); `css/train.css:15-23` compacts `#trainApp #hud` at `<= 430px` and `<= 359px`; `js/train.js:371, 382-383` shortens the drain pill on `<= 430px` to `⏳ N` with `.rtd-sr` keeping `"Chờ N tàu"` for screen readers.
   - **Live repro evidence** (Train Level 11, `✓ 12/15`, `🔥 12`, `__rtd.hudDrain(3)`):
     - Normal font at 320, 360, 375, 390, 414, 430 px: 1 row (`hudH: 68 px`), 0 pill overflows (`scrollWidth <= clientWidth`), 0 overlaps, `#pauseBtn` on-screen.
     - Wide fallback font (`Arial` / Google Fonts blocked): 1 row (`hudH: 68 px`) at 360–430 px, clean 2-row wrap at 320 px (`hudH: 99 px`) and 431 px (`hudH: 105 px`, full `"Chờ 3 tàu"`), 0 overflows, 0 overlaps, `#pauseBtn` on-screen across all widths tested.

## New Blocker Introduced by Round-2 Fixes

1. **[NEW BLOCKER] Rain (`Mưa Phép Tính`) permanently freezes with no drops after Pause → Quit to level select → Start level**
   - **Location**: `js/rain.js:263, 313-322, 412-421` (introduced in commit `77c3927`)
   - **Evidence**:
     - `loop()` (`js/rain.js:263`) now stops rAF while paused: `if (state === 'paused') { running = false; return; }`. `resume()` (`js/rain.js:331`) calls `startLoop()`, but neither `toMenu()` (`js/rain.js:412-421`) nor `startLevel()` (`js/rain.js:313-322`) calls `startLoop()` (unlike `js/koi.js:474, 553`, which calls `startLoop()` in both `startKoiLevel()` and `toMenu()`).
     - Live Chromium repro 1 (Pause → Quit → Start): open Rain → `#rStart` → wait 900 ms (`drops.length === 1`) → `#rPause` → wait 200 ms (`rainRafDuringPause: 0`) → `#rQuit` → `#rStart` → wait 1500 ms. Result: `window.__rainDebug()` shows `state: "play"`, `drops: []`, and `rafDelta: 0`. No drops ever spawn and the canvas stays frozen until navigating back to the Hub and re-entering `#mua`.
     - Live Chromium repro 2 (Pause → Leave to Hub → Re-enter → Quit → Start): `#rPause` → `goBack()` → `#openRain` → `#rQuit` → `#rStart` → wait 1000 ms. Result: `state: "play"`, `drops: 0` (same permanent freeze).
     - The same bug triggers whenever Rain pauses via `Escape`, `visibilitychange`, or device rotation and the player chooses `#rQuit` to pick another level.
     - Verified Koi (`kPauseBtn` → `kQuitBtn` → `kStartBtn`, 18 rAF frames in 300 ms), Mem (`mPause` → `mQuit` → `mStart`, enters `phase: 'show'`), and Train (`pauseBtn` → `quitBtn` → `startBtn`, `running: true`) do not have this bug.
     - `tests/rain.spec.js:421-447` missed this because it only tested Pause → Resize → `#rResume`.
   - **Exact fix**:
     - Call `if (window.APP && window.APP.active === 'rain') startLoop();` in `startLevel()` (`js/rain.js:313-322`) and `toMenu()` (`js/rain.js:412-421`).
     - Add a regression test in `tests/rain.spec.js` executing `#rPause` → `#rQuit` → `#rStart` and asserting drops spawn and advance (`p` increases).

## Remaining SHOULD / NIT Items (from Round 1)

Resolved since round 1 (verified): **#6** (menu focus on open + `Tab` trap), **#7** (`#settings` closes on `route()`), **#8** (`manifest.webmanifest` `"orientation": "any"`), **#9** (Rain drop gradient `#1b69b8`–`#0f4482` + dark stroke gives 5.59:1–9.68:1 white contrast and passes pixel contrast test ≥ 4.5:1), **#10** (`RTD_MAP.generate(15, ...)` returned 15 stations and 0 `minSwitchDist < 2` across 30/30 runs at `768×768`, `800×800`, `768×704`), **#12** (`rain.js` reads `bb_stats`, `BB.resetAll()` deletes `bb_seed*`, `mem.js` pauses on leave), **#13** (Koi copy, `aria-label`, Train hub card, stat whitespace), and Word/Mem/code-hygiene fixes in **#11** and **#14** (Mem `740×360` 6×6 tiles now `46.2×46.2 px`; Word `568×320` L49 cells now `24×24 px` with 0 overlaps across `568×320`–`844×390` even with the longest hint shown; `window.__word` gated in prod; `aria-pressed` on Word level buttons; stale `index.html` comment removed; `legal/licences.json` reconciled; Train `rtd_best3` `doneCount` restored).

Still remaining (non-blocking):
- **#11 [SHOULD, partial]**: At `568×320`, Mem Level 13 (6×6) tiles measure `39.5×39.5 px` (up from `37×37 px`, still under 44 px).
- **#14 [NIT, partial]**: `vendor/zzfx-micro.js:31` still creates `new AudioContext` eagerly at script load (verbatim upstream file).
- **Minor round-2 cleanup [NIT]**: `js/hub.js:93` checks a non-existent `BB.syncOverlays`; stale comments remain in `js/mem.js:19`, `js/word.js:89` (`bb_seeded_v1`), and `css/train.css:5` (`HUD pills may shrink...`).

## What Could Not Be Checked

- Physical iOS/Android hardware, Safari/WebKit SW behaviour, real GitHub Pages deployment, and assistive-technology speech output (all live checks ran in headless Chromium on macOS).
