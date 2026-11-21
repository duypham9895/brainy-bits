/* Brainy Bits install guide: illustrations.
   window.BB_INSTALL_ART = { ios: [fn, fn, fn], android: [fn, fn, fn], inApp: fn }
   Each fn returns an inline SVG string: a cropped mock of one browser control, not a whole phone.

   Accessibility: every SVG is aria-hidden + focusable="false". The step card next to it already
   says the instruction in Vietnamese and English, so a screen reader would only hear it twice.

   Labels inside the mocks stay in English because they mirror what the phone's browser shows.
   Sizes: viewBox width 260 = intended display width, so font-size 12+ stays >= 10px on screen.
   Colours come from css/install.css classes (var(--bb-art-*)), never hard-coded, except the
   Brainy Bits mark which keeps its brand colours (copied from index.html .hubmark). */
(function () {
  'use strict';

  var W = 260;

  function svg(h, body) {
    return '<svg class="bbi-art" xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + h +
      '" viewBox="0 0 ' + W + ' ' + h + '" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  function text(x, y, str, o) {
    o = o || {};
    return '<text x="' + x + '" y="' + y + '" font-size="' + (o.size || 14) + '"' +
      (o.weight ? ' font-weight="' + o.weight + '"' : '') +
      (o.anchor ? ' text-anchor="' + o.anchor + '"' : '') +
      (o.cls ? ' class="' + o.cls + '"' : '') +
      // fit: pin the width so a wider system font (Linux, some Android skins) never spills out of its box
      (o.fit ? ' textLength="' + o.fit + '" lengthAdjust="spacingAndGlyphs"' : '') + '>' + str + '</text>';
  }

  function rect(cls, x, y, w, h, rx) {
    return '<rect class="' + cls + '" x="' + x + '" y="' + y + '" width="' + w + '" height="' + h +
      '" rx="' + (rx || 0) + '"/>';
  }

  function path(d, cls) {
    return '<path class="' + (cls || 'a-ico') + '" d="' + d + '"/>';
  }

  /* Coral outline around the thing to tap, with a faint tint inside. */
  function highlight(x, y, w, h, rx) {
    return rect('a-hlfill', x, y, w, h, rx) + rect('a-hl', x, y, w, h, rx);
  }

  /* Three dots drawn as circles (the "•••" / "⋮" buttons), never as text glyphs. */
  function dots(cx, cy, vertical) {
    var out = '';
    for (var i = -1; i <= 1; i++) {
      var x = vertical ? cx : cx + i * 7;
      var y = vertical ? cy + i * 7 : cy;
      out += '<circle class="a-dot" cx="' + x + '" cy="' + y + '" r="2.4"/>';
    }
    return out;
  }

  /* Faint content bars that suggest the web page behind a menu or dialog. */
  function pageHint(x, y, rows) {
    var out = '';
    for (var i = 0; i < rows; i++) {
      out += rect('a-rulef', x, y + i * 22, i % 2 ? 120 : 168, 10, 5);
    }
    return out;
  }

  /* ---------- icons (stroke 1.75, round caps) ---------- */

  function icoShare(cx, cy) {
    return path('M' + (cx - 4) + ' ' + (cy - 3) + 'h-3a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-9' +
      'a2 2 0 0 0-2-2h-3M' + cx + ' ' + (cy - 11) + 'v13M' + (cx - 4) + ' ' + (cy - 7) + 'l4-4 4 4');
  }

  function icoBookmark(cx, cy) {
    return path('M' + (cx - 5) + ' ' + (cy - 8) + 'h10v16l-5-4-5 4z');
  }

  function icoPlus(cx, cy, r) {
    r = r || 6;
    return path('M' + (cx - r) + ' ' + cy + 'h' + (2 * r) + 'M' + cx + ' ' + (cy - r) + 'v' + (2 * r));
  }

  function icoStar(cx, cy, r) {
    var d = '';
    for (var i = 0; i < 10; i++) {
      var rad = i % 2 ? r * 0.45 : r;
      var a = -Math.PI / 2 + i * Math.PI / 5;
      d += (i ? 'L' : 'M') + (cx + rad * Math.cos(a)).toFixed(1) + ' ' + (cy + rad * Math.sin(a)).toFixed(1);
    }
    return path(d + 'Z');
  }

  function icoFind(cx, cy) {
    return path('M' + (cx + 4) + ' ' + (cy - 1) + 'v-5.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h3') +
      '<circle class="a-ico" cx="' + (cx + 3) + '" cy="' + (cy + 3) + '" r="3.2"/>' +
      path('M' + (cx + 5.4) + ' ' + (cy + 5.4) + 'l2.6 2.6');
  }

  function icoPlusSquare(cx, cy) {
    return rect('a-ico', cx - 8, cy - 8, 16, 16, 4) + icoPlus(cx, cy, 4);
  }

  function icoChevronLeft(cx, cy) {
    return path('M' + (cx + 3) + ' ' + (cy - 8) + 'l-8 8 8 8');
  }

  function icoReload(cx, cy) {
    return path('M' + (cx + 6) + ' ' + cy + 'a6 6 0 1 1-1.8-4.3M' + (cx + 5) + ' ' + (cy - 8) + 'v4h-4');
  }

  function icoHome(cx, cy) {
    return path('M' + (cx - 8) + ' ' + (cy + 1) + 'l8-7 8 7M' + (cx - 5.5) + ' ' + (cy - 1) +
      'v8h11v-8');
  }

  function icoArrow(cx, cy) {
    return path('M' + (cx - 7) + ' ' + cy + 'h14M' + (cx + 2) + ' ' + (cy - 5) + 'l5 5-5 5');
  }

  function icoDownload(cx, cy) {
    return path('M' + cx + ' ' + (cy - 7) + 'v10M' + (cx - 5) + ' ' + (cy - 2) + 'l5 5 5-5M' +
      (cx - 7) + ' ' + (cy + 7) + 'h14');
  }

  function icoInfo(cx, cy) {
    return '<circle class="a-ico" cx="' + cx + '" cy="' + cy + '" r="7.5"/>' +
      path('M' + cx + ' ' + (cy - 0.5) + 'v4.5') +
      '<circle class="a-dot" cx="' + cx + '" cy="' + (cy - 3.6) + '" r="1.1"/>';
  }

  function icoClose(cx, cy) {
    return path('M' + (cx - 6) + ' ' + (cy - 6) + 'l12 12M' + (cx + 6) + ' ' + (cy - 6) + 'l-12 12');
  }

  /* Brainy Bits mark, same paths as index.html .hubmark (viewBox 64), placed at x,y with size s. */
  function mark(x, y, s) {
    var k = s / 64;
    return '<g transform="translate(' + x + ' ' + y + ') scale(' + k + ')">' +
      '<rect x="2" y="2" width="60" height="60" rx="15" fill="#192a21" stroke="#faf5ea" stroke-opacity=".22" stroke-width="1.5"/>' +
      '<path d="M14 13h16v17H14z" fill="#faf5ea"/>' +
      '<path d="M32 13h10a9 9 0 0 1 0 18H32z" fill="#e2632e"/>' +
      '<path d="M14 33h16v18H14z" fill="#ebb038"/>' +
      '<path d="M32 33h11a9 9 0 0 1 0 18H32z" fill="#5eb477"/>' +
      '<circle cx="49" cy="18" r="4.5" fill="#5a9bd4"/></g>';
  }

  /* ---------- iPhone (Safari, iOS 26 compact bar) ---------- */

  /* 1. Bottom bar: back, URL pill, round ••• button (highlighted). */
  function ios1() {
    return svg(80,
      rect('a-bg', 0, 0, W, 80, 16) +
      '<circle class="a-surf" cx="32" cy="40" r="21"/>' + icoChevronLeft(32, 40) +
      rect('a-surf', 60, 19, 128, 42, 21) +
      text(76, 45, 'brainybits…', { size: 14 }) +
      icoReload(170, 40) +
      '<circle class="a-surf" cx="224" cy="40" r="21"/>' + dots(224, 40, false) +
      highlight(197, 13, 54, 54, 16));
  }

  /* 2. The ••• menu, Share row highlighted. */
  function ios2() {
    var row = function (cy, ico, label) {
      return ico + text(66, cy + 5, label, { size: 15 });
    };
    return svg(166,
      rect('a-bg', 0, 0, W, 166, 16) +
      rect('a-surf', 16, 12, 228, 142, 18) +
      highlight(22, 18, 216, 42, 12) +
      row(39, icoShare(42, 39), '<tspan font-weight="600">Share</tspan>') +
      row(83, icoBookmark(42, 83), 'Add to Bookmarks') +
      '<line class="a-rule" x1="32" y1="107" x2="228" y2="107"/>' +
      row(130, icoPlus(42, 130), 'New Tab'));
  }

  /* 3. Share sheet list, Add to Home Screen highlighted. */
  function ios3() {
    var row = function (cy, ico, label, strong) {
      return ico + text(66, cy + 5, label, { size: 15, weight: strong ? 600 : null });
    };
    return svg(168,
      rect('a-bg', 0, 0, W, 168, 16) +
      rect('a-surf', 16, 12, 228, 144, 18) +
      row(38, icoStar(42, 38, 8.5), 'Add to Favorites') +
      '<line class="a-rule" x1="66" y1="60" x2="232" y2="60"/>' +
      row(82, icoFind(42, 82), 'Find on Page') +
      '<line class="a-rule" x1="66" y1="104" x2="232" y2="104"/>' +
      highlight(22, 108, 216, 42, 12) +
      row(129, icoPlusSquare(42, 129), 'Add to Home Screen', true));
  }

  /* ---------- Android (Chrome) ---------- */

  /* 1. Top toolbar: home, URL pill, tab counter, ⋮ highlighted. */
  function android1() {
    return svg(64,
      rect('a-bg', 0, 0, W, 64, 16) +
      icoHome(20, 32) +
      rect('a-surf', 38, 14, 146, 36, 18) +
      text(52, 37, 'brainybits…', { size: 13 }) +
      rect('a-ico', 194, 22, 20, 20, 4) +
      text(204, 36.5, '1', { size: 12, weight: 700, anchor: 'middle' }) +
      dots(238, 32, true) +
      highlight(225, 11, 26, 42, 9));
  }

  /* 2. The ⋮ menu, anchored top right, Add to Home screen highlighted. */
  function android2() {
    var items = ['New tab', 'Bookmarks', 'Share…', 'Add to Home screen', 'Desktop site'];
    var out = rect('a-bg', 0, 0, W, 236, 16) +
      rect('a-surf', 36, 10, 214, 216, 12) +
      icoArrow(62, 34) + icoStar(102, 34, 7.5) + icoDownload(142, 34) + icoInfo(182, 34) +
      icoReload(222, 34) +
      '<line class="a-rule" x1="36" y1="56" x2="250" y2="56"/>';
    for (var i = 0; i < items.length; i++) {
      var cy = 76 + i * 32;
      var hot = i === 3;
      if (hot) out += highlight(41, cy - 15, 204, 30, 7);
      out += text(54, cy + 5, items[i], { size: 14, weight: hot ? 600 : null });
    }
    return svg(236, out);
  }

  /* 3. Add to Home screen dialog, Add highlighted. */
  function android3() {
    return svg(170,
      rect('a-bg', 0, 0, W, 170, 16) +
      rect('a-surf', 14, 14, 232, 142, 22) +
      text(32, 46, 'Add to Home screen', { size: 16, weight: 600 }) +
      mark(32, 62, 30) +
      text(74, 82, 'Brainy Bits', { size: 14 }) +
      '<line class="a-linkline" x1="32" y1="102" x2="228" y2="102"/>' +
      text(150, 136, 'Cancel', { size: 14, weight: 600, anchor: 'middle', cls: 'a-link' }) +
      highlight(186, 115, 46, 30, 15) +
      text(209, 136, 'Add', { size: 14, weight: 600, anchor: 'middle', cls: 'a-link' }));
  }

  /* ---------- In-app browser (Zalo, Facebook, Messenger...) ---------- */

  /* Generic top bar with •••, then a menu with Open in Safari/Chrome highlighted (matches the step text). */
  function inApp() {
    return svg(168,
      rect('a-bg', 0, 0, W, 168, 16) + pageHint(14, 70, 4) +
      rect('a-raise', 0, 0, W, 52, 16) + rect('a-raise', 0, 30, W, 22, 0) +
      '<line class="a-rule" x1="0" y1="52" x2="' + W + '" y2="52"/>' +
      icoClose(22, 26) +
      text(44, 31, 'brainybits…', { size: 13, weight: 600 }) +
      dots(230, 26, false) +
      highlight(211, 11, 38, 30, 10) +
      rect('a-surf', 48, 60, 202, 98, 14) +
      text(66, 89, 'Copy link', { size: 14 }) +
      '<line class="a-rule" x1="58" y1="106" x2="240" y2="106"/>' +
      highlight(54, 112, 190, 38, 10) +
      text(66, 136, 'Open in Safari/Chrome', { size: 13.5, weight: 600, fit: 164 }));
  }

  window.BB_INSTALL_ART = Object.freeze({
    ios: Object.freeze([ios1, ios2, ios3]),
    android: Object.freeze([android1, android2, android3]),
    inApp: inApp
  });
})();
