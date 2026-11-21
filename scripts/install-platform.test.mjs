// Tests for js/install-platform.js. Loads the file into a fresh node:vm context as a classic
// script, the same way scripts/sim/load-bbd.mjs loads js/difficulty.js, so the browser build and
// the tested code are the same bytes. Run: node --test scripts/install-platform.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'js/install-platform.js';

function load() {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  vm.runInContext(readFileSync(join(ROOT, FILE), 'utf8'), ctx, { filename: FILE });
  return ctx.BBInstallPlatform;
}

const P = load();
const get = (ua, touch = 0, standalone = false) => P.getInstallPlatform(ua, touch, standalone);

const UA = {
  iphone18: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  iphone26: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1',
  iosChrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/139.0.7258.76 Mobile/15E148 Safari/604.1',
  iosEdge: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 EdgiOS/139.0.3405.86 Mobile/15E148 Safari/605.1.15',
  iosFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/142.0 Mobile/15E148 Safari/605.1.15',
  iosGoogleApp: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/385.0.789123456 Mobile/15E148 Safari/604.1',
  ipadAsMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  ipadLegacy: 'Mozilla/5.0 (iPad; CPU OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1',
  macChrome: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  zaloIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/25.07.01',
  zaloAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.179 Mobile Safari/537.36 Zalo android/12100587 ZaloTheme/light ZaloLanguage/vn',
  fbIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/22G86 [FBAN/FBIOS;FBAV/524.0.0.40.104;FBBV/779123456;FBDV/iPhone16,2;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBID/phone;FBLC/vi_VN;FBOP/5;FBRV/781234567]',
  fbAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.179 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/524.0.0.53.109;]',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 393.0.0.29.81 (iPhone16,2; iOS 18_6; vi_VN; vi; scale=3.00; 1179x2556; 781234567)',
  messengerIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 LightSpeed [FBAN/MessengerLiteForiOS;FBAV/524.0.0.18.111;FBBV/779000000;FBDV/iPhone16,2;FBMD/iPhone;FBSN/iOS;FBSV/18.6;FBSS/3;FBCR/;FBID/phone;FBLC/vi_VN;FBOP/0]',
  messengerAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.179 Mobile Safari/537.36 [FB_IAB/Orca-Android;FBAV/480.0.0.40.109;]',
  lineIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/15.12.0',
  tiktokAndroid: 'Mozilla/5.0 (Linux; Android 14; SM-A546E Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.179 Mobile Safari/537.36 trill_410203 BytedanceWebview/d8a21c6',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/28.0 Chrome/130.0.0.0 Mobile Safari/537.36',
  winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
  winFirefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0',
  androidGoogleApp: 'Mozilla/5.0 (Linux; Android 14; Pixel 7 Build/AP2A.240805.005; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.7204.179 Mobile Safari/537.36 GSA/15.33.38.29.arm64',
  iosWebView: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  linuxFirefox: 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0',
  lineIosUpper: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 LINE/15.12.0',
  tiktokIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari/604.1 TikTok 41.2.0',
  tiktokByteDance: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.179 Mobile Safari/537.36 ByteDanceWebview/d8a21c6',
  zaloAndroidNoSpace: 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.7204.179 Mobile Safari/537.36 ZaloAndroid/12100587',
  macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:142.0) Gecko/20100101 Firefox/142.0',
  macEdge: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.3405.86',
};

test('exposes the API on window.BBInstallPlatform', () => {
  assert.equal(typeof P, 'object');
  assert.equal(typeof P.getInstallPlatform, 'function');
  assert.equal(typeof P.isStandaloneNow, 'function');
});

test('iOS Safari on iPhone (iOS 18 and iOS 26 UA) -> ios-safari', () => {
  assert.equal(get(UA.iphone18, 5), 'ios-safari');
  assert.equal(get(UA.iphone26, 5), 'ios-safari');
});

test('legacy iPad UA -> ios-safari', () => {
  assert.equal(get(UA.ipadLegacy, 5), 'ios-safari');
});

test('third-party iOS browsers -> ios-other', () => {
  assert.equal(get(UA.iosChrome, 5), 'ios-other');
  assert.equal(get(UA.iosEdge, 5), 'ios-other');
  assert.equal(get(UA.iosFirefox, 5), 'ios-other');
});

test('Google app on iOS (GSA/) is a web view, not a browser -> in-app, same as on Android', () => {
  assert.equal(get(UA.iosGoogleApp, 5), 'in-app');
  assert.equal(get(UA.androidGoogleApp, 5), 'in-app');
});

test('iPadOS reporting a Mac UA with touch points -> ios-safari', () => {
  assert.equal(get(UA.ipadAsMac, 5), 'ios-safari');
});

test('real Mac (no touch) -> desktop', () => {
  assert.equal(get(UA.ipadAsMac, 0), 'desktop');
  assert.equal(get(UA.macChrome, 0), 'desktop');
});

test('Mac Chrome, Firefox and Edge with touch points (touch screen, DevTools emulation) -> desktop', () => {
  assert.equal(get(UA.macChrome, 5), 'desktop');
  assert.equal(get(UA.macFirefox, 5), 'desktop');
  assert.equal(get(UA.macEdge, 5), 'desktop');
  assert.equal(get(UA.ipadAsMac, 5), 'ios-safari');      // iPadOS Safari still counts as iOS
});

test('maxTouchPoints of exactly 1 on a Mac UA stays desktop', () => {
  assert.equal(get(UA.ipadAsMac, 1), 'desktop');
});

test('Zalo in-app browser on iOS and on Android -> in-app', () => {
  assert.equal(get(UA.zaloIos, 5), 'in-app');
  assert.equal(get(UA.zaloAndroid, 5), 'in-app');
});

test('Facebook in-app: FBAN/FBAV on iOS, FB_IAB on Android -> in-app', () => {
  assert.equal(get(UA.fbIos, 5), 'in-app');
  assert.equal(get(UA.fbAndroid, 5), 'in-app');
});

test('Instagram and Messenger -> in-app', () => {
  assert.equal(get(UA.instagram, 5), 'in-app');
  assert.equal(get(UA.messengerIos, 5), 'in-app');
  assert.equal(get(UA.messengerAndroid, 5), 'in-app');
});

test('LINE and TikTok in-app -> in-app', () => {
  assert.equal(get(UA.lineIos, 5), 'in-app');
  assert.equal(get(UA.tiktokAndroid, 5), 'in-app');
});

test('in-app tokens match in any case and without a word break', () => {
  assert.equal(get(UA.lineIosUpper, 5), 'in-app');       // "LINE/" plus "Safari/604.1"
  assert.equal(get(UA.tiktokIos, 5), 'in-app');
  assert.equal(get(UA.tiktokByteDance, 5), 'in-app');
  assert.equal(get(UA.zaloAndroidNoSpace, 5), 'in-app');
});

test('generic Android WebView (; wv)), e.g. the Google app -> in-app', () => {
  assert.equal(get(UA.androidGoogleApp, 5), 'in-app');
});

test('iOS WebView with no Safari/ token -> in-app', () => {
  assert.equal(get(UA.iosWebView, 5), 'in-app');
});

test('Android Chrome and Samsung Internet -> android', () => {
  assert.equal(get(UA.androidChrome, 5), 'android');
  assert.equal(get(UA.samsung, 5), 'android');
});

test('desktop Chrome, Firefox on Windows and Linux -> desktop', () => {
  assert.equal(get(UA.winChrome, 0), 'desktop');
  assert.equal(get(UA.winFirefox, 0), 'desktop');
  assert.equal(get(UA.linuxFirefox, 0), 'desktop');
});

test('standalone wins over every UA, including in-app and desktop', () => {
  for (const ua of Object.values(UA)) assert.equal(get(ua, 5, true), 'installed', ua);
  assert.equal(get('', 0, true), 'installed');
  assert.equal(get(undefined, undefined, true), 'installed');
});

test('empty, undefined or non-string UA -> desktop, never throws', () => {
  assert.equal(get('', 0, false), 'desktop');
  assert.equal(get(undefined, undefined, undefined), 'desktop');
  assert.equal(get(null, null, null), 'desktop');
  assert.equal(get(42, NaN, false), 'desktop');
  assert.equal(P.getInstallPlatform(), 'desktop');
});

test('only a strict true counts as standalone', () => {
  assert.equal(get(UA.iphone18, 5, 'true'), 'ios-safari');
  assert.equal(get(UA.iphone18, 5, 1), 'ios-safari');
});

test('isStandaloneNow: display-mode standalone media query -> true', () => {
  const win = { matchMedia: q => ({ matches: q === '(display-mode: standalone)' }), navigator: {} };
  assert.equal(P.isStandaloneNow(win), true);
});

test('isStandaloneNow: iOS navigator.standalone -> true', () => {
  const win = { matchMedia: () => ({ matches: false }), navigator: { standalone: true } };
  assert.equal(P.isStandaloneNow(win), true);
});

test('isStandaloneNow: normal tab -> false', () => {
  const win = { matchMedia: () => ({ matches: false }), navigator: { standalone: false } };
  assert.equal(P.isStandaloneNow(win), false);
});

test('isStandaloneNow: missing or throwing APIs -> false, never throws', () => {
  assert.equal(P.isStandaloneNow(undefined), false);
  assert.equal(P.isStandaloneNow({}), false);
  assert.equal(P.isStandaloneNow({ matchMedia: () => { throw new Error('x'); } }), false);
  const trap = {};
  Object.defineProperty(trap, 'navigator', { get() { throw new Error('blocked'); } });
  trap.matchMedia = () => ({ matches: false });
  assert.equal(P.isStandaloneNow(trap), false);
});

test('loading the file touches no DOM (runs in a bare context)', () => {
  const ctx = vm.createContext({});
  ctx.window = ctx;
  assert.doesNotThrow(() => vm.runInContext(readFileSync(join(ROOT, FILE), 'utf8'), ctx, { filename: FILE }));
});

test('API object is frozen', () => {
  assert.equal(Object.isFrozen(P), true);
});

// ---------- shouldShowBanner: the home banner rule ----------
const base = { platform: 'ios-safari', visits: 2, played: false, dismissed: false, installed: false };
const show = o => P.shouldShowBanner({ ...base, ...o });

test('banner: second visit on a phone -> shown', () => {
  for (const platform of ['ios-safari', 'ios-other', 'android', 'in-app']) assert.equal(show({ platform }), true, platform);
});

test('banner: first visit without a finished game -> hidden; with one -> shown', () => {
  assert.equal(show({ visits: 1 }), false);
  assert.equal(show({ visits: 1, played: true }), true);
  assert.equal(show({ visits: 0, played: true }), true);
});

test('banner: desktop and installed never show it', () => {
  assert.equal(show({ platform: 'desktop', visits: 9, played: true }), false);
  assert.equal(show({ platform: 'installed', visits: 9, played: true }), false);
});

test('banner: dismissed or marked installed hides it for good', () => {
  assert.equal(show({ dismissed: true, visits: 9, played: true }), false);
  assert.equal(show({ installed: true, visits: 9, played: true }), false);
});

test('banner: junk input never throws and stays hidden', () => {
  assert.equal(P.shouldShowBanner(undefined), false);
  assert.equal(P.shouldShowBanner(null), false);
  assert.equal(show({ visits: 'abc' }), false);
  assert.equal(show({ visits: '2' }), true);
});
