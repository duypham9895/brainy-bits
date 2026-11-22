// ===================== BRAINY BITS — INSTALL PLATFORM DETECTION (window.BBInstallPlatform) =====================
// Classic script. Pure: no DOM access at load time. Loadable in Node through node:vm
// (scripts/install-platform.test.mjs). Decides which "add to Home Screen" guide fits this browser.
//   getInstallPlatform(ua, maxTouchPoints, isStandalone)
//     -> 'installed' | 'in-app' | 'ios-safari' | 'ios-other' | 'android' | 'desktop'
//   isStandaloneNow(win) -> true when the page already runs as an installed app.
//   shouldShowBanner({ platform, visits, played, dismissed, installed }) -> boolean
(function (root) {
  'use strict';

  // In-app browsers cannot add to the Home Screen; the guide asks the player to open a real browser.
  // Zalo, Facebook (FBAN/FBAV on iOS, FB_IAB on Android), Messenger, Instagram, LINE, TikTok, and the
  // Google app on iOS (GSA/), which is a search app with its own web view, not a browser.
  // Case-insensitive: LINE sends both "Line/" and "LINE/", TikTok both "BytedanceWebview" and "ByteDanceWebview".
  const IN_APP = /\bZalo|FBAN\/|FBAV\/|FB_IAB\/|Messenger|Instagram|\bLine\/|musical_ly|BytedanceWebview|\btrill_|TikTok|\bGSA\//i;
  const IOS_DEVICE = /iPhone|iPad|iPod/;
  // Third-party iOS browsers. They all run WebKit, but the menu path differs from Safari.
  const IOS_OTHER = /CriOS|EdgiOS|FxiOS|OPiOS|YaBrowser/;
  // Desktop browsers on a Mac. A touch-screen Mac or DevTools touch emulation must not look like an iPad.
  const MAC_DESKTOP_BROWSER = /Chrome\/|Firefox\/|Edg\//;
  // Generic Android WebView ("; wv)"): the Google app and other app browsers with no known token.
  const ANDROID_WV = /Android.*;\s*wv\)/;

  function getInstallPlatform(ua, maxTouchPoints, isStandalone) {
    if (isStandalone === true) return 'installed';
    const s = typeof ua === 'string' ? ua : '';
    if (!s) return 'desktop';
    if (IN_APP.test(s) || ANDROID_WV.test(s)) return 'in-app';
    const touch = typeof maxTouchPoints === 'number' && maxTouchPoints > 1;
    // iPadOS 13+ Safari sends a Macintosh UA; only the touch points tell it apart from a real Mac.
    const ios = IOS_DEVICE.test(s) || (/Macintosh/.test(s) && touch && !MAC_DESKTOP_BROWSER.test(s));
    if (ios) {
      if (IOS_OTHER.test(s)) return 'ios-other';
      // Safari and every real iOS browser send "Safari/"; an app's WKWebView does not.
      return /Safari\//.test(s) ? 'ios-safari' : 'in-app';
    }
    if (/Android/.test(s)) return 'android';
    return 'desktop';
  }

  function isStandaloneNow(win) {
    if (!win) return false;
    try {
      if (typeof win.matchMedia === 'function' && win.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) { /* matchMedia unavailable */ }
    try {
      return !!(win.navigator && win.navigator.standalone === true);
    } catch (e) {
      return false;
    }
  }

  // Home banner rule. Phones only, never once dismissed or installed, and only from the second
  // visit or after the first finished game, so a first-time player sees the games first.
  const PHONE = { 'ios-safari': 1, 'ios-other': 1, android: 1, 'in-app': 1 };
  function shouldShowBanner(o) {
    if (!o || !PHONE[o.platform] || o.dismissed === true || o.installed === true) return false;
    const visits = Number(o.visits);
    return o.played === true || (Number.isFinite(visits) && visits >= 2);
  }

  root.BBInstallPlatform = Object.freeze({ getInstallPlatform, isStandaloneNow, shouldShowBanner });
})(typeof window !== 'undefined' ? window : globalThis);
