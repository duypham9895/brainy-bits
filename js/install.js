// ===================== BRAINY BITS — "ADD TO HOME SCREEN" GUIDE =====================
// Wires the home banner, the settings row and the guide <dialog id="installDialog">.
// Needs: BB (core.js), BBInstallPlatform (head), BB_INSTALL_COPY, BB_INSTALL_ART.
// Whether the banner shows is decided in <head> (data-bb-install-banner on <html>), before the
// first paint, so nothing here ever makes it appear late. This file can only hide it.
(() => {
'use strict';
const BB = window.BB, P = window.BBInstallPlatform, C = window.BB_INSTALL_COPY, ART = window.BB_INSTALL_ART;
const $ = id => document.getElementById(id);
const dlg = $('installDialog');
// If anything here is missing or throws, the <head> may already have shown the banner: take it and
// the settings row away, so no dead button stays on screen.
function fail() {
  document.documentElement.removeAttribute('data-bb-install-banner');
  const row = $('setInstallRow'); if (row) row.hidden = true;
}
if (!BB || !P || !C || !ART || !dlg) { fail(); return; }
try {

// ---------- state (localStorage bb_install through BB.store, which survives blocked storage) ----------
const KEY = 'bb_install';
const readState = () => { const s = BB.store.json(KEY, {}); return s && typeof s === 'object' && !Array.isArray(s) ? s : {}; };
const writeState = patch => BB.store.setJson(KEY, Object.assign(readState(), patch));

const ua = navigator.userAgent || '';
const touch = navigator.maxTouchPoints || 0;
const platform = P.getInstallPlatform(ua, touch, P.isStandaloneNow(window));
const browser = P.getInstallPlatform(ua, touch, false);        // what the browser is, installed or not
const startTab = browser === 'android' || (browser === 'in-app' && /Android/.test(ua)) ? 'android' : 'ios';
// Kept in memory too: when localStorage.setItem throws but getItem still returns the old value,
// BB.store would keep reading the stale flag back.
// A captured beforeinstallprompt proves the app is not installed, whatever a stale flag says.
let installed = platform === 'installed' || (!window.BB_INSTALL_PROMPT && readState().installed === true);
const isInstalled = () => installed;

// ---------- small DOM helpers ----------
function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function en(text, tag = 'p', cls = 'bbi-en') { const e = el(tag, cls, text); e.lang = 'en'; return e; }
// Rich line: [{t}, {t, hl:true}] -> text nodes and <b class="bbi-hl">. textContent only.
// A highlighted ••• or ⋮ is hidden from screen readers and spoken as words (C.dialog.glyphNames).
function hl(t, lang) {
  const b = el('b', 'bbi-hl');
  const name = C.dialog.glyphNames[t];
  if (!name) { b.textContent = t; return b; }
  const g = el('span', '', t); g.setAttribute('aria-hidden', 'true');
  b.append(g, el('span', 'bbi-sr', name[lang]));
  return b;
}
function rich(tag, cls, segs, lang = 'vi') {
  const e = el(tag, cls);
  segs.forEach(s => e.appendChild(s.hl ? hl(s.t, lang) : document.createTextNode(s.t)));
  return e;
}
function art(html) { const w = el('div', 'bbi-artwrap'); w.innerHTML = html; return w; }   // our own SVG strings
const ICON = {
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  info: '<svg class="bbi-note-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.6v.1"/></svg>',
};
function note(copy, extraCls) {
  const n = el('div', 'bbi-note' + (extraCls ? ' ' + extraCls : ''));
  n.insertAdjacentHTML('afterbegin', ICON.info);
  const t = el('div');
  t.append(el('p', 'bbi-note-vi', copy.vi), en(copy.en));
  n.appendChild(t);
  return n;
}

// ---------- build the dialog once ----------
function steps(list, arts) {
  const ol = el('ol', 'bbi-steps');
  list.forEach((s, i) => {
    const li = el('li', 'bbi-step');
    const num = el('span', 'bbi-num', String(i + 1)); num.setAttribute('aria-hidden', 'true');
    const txt = el('div', 'bbi-txt');
    const vi = rich('p', 'bbi-vi', s.vi);
    vi.prepend(el('span', 'bbi-sr', C.dialog.stepLabel.vi + ' ' + (i + 1) + ': '));
    const e = rich('p', 'bbi-en', s.en, 'en'); e.lang = 'en';
    txt.append(vi, e);
    li.append(num, txt, art(arts[i]()));
    ol.appendChild(li);
  });
  return ol;
}

const sheet = el('div', 'bbi-sheet');
const head = el('header', 'bbi-head');
const headTxt = el('div');
const title = el('h2', '', C.dialog.title.vi); title.id = 'installTitle';
headTxt.append(title, en(C.dialog.title.en));
const closeBtn = el('button', 'qr-close bbi-close'); closeBtn.type = 'button';
closeBtn.setAttribute('aria-label', C.dialog.closeLabel.vi); closeBtn.innerHTML = ICON.close;
head.append(headTxt, closeBtn);

const body = el('div', 'bbi-body');

// In-app browsers (Zalo, Facebook...) cannot add to the Home Screen: open a real browser first.
const inApp = el('section', 'bbi-inapp'); inApp.id = 'installInApp';
inApp.setAttribute('aria-labelledby', 'installInAppTitle');
const inTitle = el('h3', '', C.inApp.title.vi); inTitle.id = 'installInAppTitle';
const inBodyEn = rich('p', 'bbi-en', C.inApp.body.en, 'en'); inBodyEn.lang = 'en';
const copyBtn = el('button', 'bbi-primary'); copyBtn.type = 'button'; copyBtn.id = 'installCopyBtn';
copyBtn.append(el('span', '', C.inApp.copyLink.vi), en(C.inApp.copyLink.en, 'span', 'bbi-btn-en'));
const linkField = el('input', 'bbi-link'); linkField.id = 'installLinkField';
linkField.type = 'text'; linkField.readOnly = true; linkField.hidden = true;
linkField.setAttribute('aria-label', C.inApp.linkFieldLabel.vi);
const copyStatus = el('p', 'bbi-status'); copyStatus.id = 'installCopyStatus';
copyStatus.setAttribute('role', 'status'); copyStatus.setAttribute('aria-live', 'polite');
inApp.append(el('div', 'bbi-inapp-head'), rich('p', 'bbi-vi', C.inApp.body.vi), inBodyEn, art(ART.inApp()), copyBtn, linkField, copyStatus);
inApp.firstChild.append(inTitle, en(C.inApp.title.en));
inApp.hidden = browser !== 'in-app';

// Tabs: iPhone | Android (WAI-ARIA tabs, automatic activation, arrow keys + Home/End).
const tablist = el('div', 'bbi-tabs'); tablist.setAttribute('role', 'tablist');
tablist.setAttribute('aria-label', C.dialog.tablistLabel.vi);
const TABS = ['ios', 'android'];
const tabs = {}, panels = {};
TABS.forEach(k => {
  const t = el('button', 'bbi-tab', C.dialog.tabs[k].vi); t.type = 'button';
  t.id = 'installTab-' + k; t.setAttribute('role', 'tab'); t.setAttribute('aria-controls', 'installPanel-' + k);
  const p = el('div', 'bbi-panel'); p.id = 'installPanel-' + k;
  p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', t.id); p.tabIndex = 0;
  tabs[k] = t; panels[k] = p; tablist.appendChild(t);
});

if (browser === 'ios-other') panels.ios.appendChild(note(C.ios.otherBrowserNote, 'is-warn'));
panels.ios.append(steps(C.ios.steps, ART.ios), note(C.ios.note));

// Android: a real install button when Chrome handed us beforeinstallprompt; manual steps always.
const installBox = el('div', 'bbi-installnow'); installBox.hidden = true;
const installBtn = el('button', 'bbi-primary'); installBtn.type = 'button'; installBtn.id = 'installNowBtn';
installBtn.append(el('span', '', C.android.installNow.vi), en(C.android.installNow.en, 'span', 'bbi-btn-en'));
installBox.appendChild(installBtn);
panels.android.append(installBox, steps(C.android.steps, ART.android), note(C.android.note));
panels.android.appendChild(el('p', 'bbi-artnote', C.android.artNote.vi));
panels.android.appendChild(en(C.android.artNote.en, 'p', 'bbi-artnote bbi-en'));

const footNote = el('div', 'bbi-footnote');
footNote.append(el('p', 'bbi-note-vi', C.dialog.footer.vi), en(C.dialog.footer.en));
body.append(inApp, tablist, panels.ios, panels.android, footNote);

const foot = el('footer', 'bbi-foot');
// In an in-app browser "Sao chép link" is the main action, so "Đã hiểu" steps back to a tonal button.
const doneBtn = el('button', 'bbi-primary bbi-done' + (browser === 'in-app' ? ' is-tonal' : ''));
doneBtn.type = 'button'; doneBtn.id = 'installDoneBtn';
doneBtn.append(el('span', '', C.dialog.done.vi), en(C.dialog.done.en, 'span', 'bbi-btn-en'));
foot.appendChild(doneBtn);

sheet.append(head, body, foot);
dlg.appendChild(sheet);

let currentTab = null;
function selectTab(k, focus) {
  currentTab = k;
  TABS.forEach(t => {
    const on = t === k;
    tabs[t].setAttribute('aria-selected', String(on));
    tabs[t].tabIndex = on ? 0 : -1;
    panels[t].hidden = !on;
  });
  if (focus) tabs[k].focus();
}
TABS.forEach(k => tabs[k].addEventListener('click', () => { if (currentTab !== k) { selectTab(k); BB.sfx('tap'); } }));
tablist.addEventListener('keydown', e => {
  if (e.altKey || e.ctrlKey || e.metaKey) return;       // leave browser shortcuts (Alt+Left = back) alone
  const i = TABS.indexOf(currentTab);
  const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key];
  if (next === undefined) return;
  e.preventDefault();
  selectTab(TABS[(next + TABS.length) % TABS.length], true);
});

// ---------- open / close ----------
let opener = null;
function openGuide(from) {
  if (!dlg.open) opener = from || document.activeElement;
  selectTab(startTab);
  copyStatus.textContent = ''; linkField.hidden = true;
  syncInstallNow();
  if (!dlg.open) dlg.showModal();
  // After showModal: a closed dialog has no box, so earlier resets are lost and the old offset comes back.
  // On very short screens the sheet scrolls, not the body.
  sheet.scrollTop = 0; body.scrollTop = 0;
  BB.sfx('tap'); BB.haptic('tap');
}
function closeGuide() { if (dlg.open) dlg.close(); }
dlg.addEventListener('close', () => {
  const o = opener; opener = null;
  if (document.hidden) return;
  // The opener can be gone (an accepted install hides the banner): fall back to the first game.
  const target = o && o.isConnected && o.getClientRects().length ? o : $('openTrain');
  if (target) { try { target.focus({ preventScroll: true }); } catch (e) {} }
});
closeBtn.addEventListener('click', closeGuide);
doneBtn.addEventListener('click', closeGuide);
// Browsers without closedby="any": a click on the backdrop closes too (same rule as #qrDialog).
// Both the press and the release must land on the backdrop: a drag that starts inside the sheet
// (selecting the link, for one) and ends outside does not close it.
if (!('closedBy' in HTMLDialogElement.prototype)) {
  const onBackdrop = e => {
    if (e.target !== dlg) return false;
    const r = dlg.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedBackdrop = false;
  dlg.addEventListener('pointerdown', e => { pressedBackdrop = onBackdrop(e); });
  dlg.addEventListener('click', e => {
    const ok = pressedBackdrop && onBackdrop(e);
    pressedBackdrop = false;
    if (ok) closeGuide();
  });
}
// hub.js listens for Esc (closes the settings sheet) and traps Tab inside open sheets. While this
// modal is on top, those keys belong to it: stop them before they reach hub.js. No preventDefault,
// so the dialog's own Esc-to-close still runs.
window.addEventListener('keydown', e => {
  if (dlg.open && (e.key === 'Escape' || e.key === 'Tab')) e.stopPropagation();
}, true);
window.addEventListener('hashchange', closeGuide);

// ---------- in-app: copy the link ----------
function setStatus(c) { copyStatus.replaceChildren(el('span', '', c.vi), en(c.en, 'span', 'bbi-en')); }
// Fill the live region a frame after clearing it, so a repeat click is announced again.
const announce = c => requestAnimationFrame(() => setStatus(c));
copyBtn.addEventListener('click', async () => {
  const url = location.origin + location.pathname;
  copyStatus.textContent = '';
  try {
    await navigator.clipboard.writeText(url);
    linkField.hidden = true;
    announce(C.inApp.copied);
    BB.sfx('tap');
  } catch (e) {
    linkField.value = url; linkField.hidden = false;
    linkField.focus(); linkField.select();
    try { linkField.setSelectionRange(0, url.length); } catch (err) {}   // iOS WebKit ignores select() alone
    announce(C.inApp.copyFallback);
  }
});

// ---------- Android: beforeinstallprompt ----------
// The <head> gate already calls preventDefault, keeps the event in window.BB_INSTALL_PROMPT and,
// since Chrome only fires it when the app is not installed, clears a stale installed flag.
// Desktop has no in-page install button: Chrome keeps its own install UI there.
window.addEventListener('beforeinstallprompt', e => {
  if (platform === 'installed') return;
  if (platform !== 'desktop') { e.preventDefault(); window.BB_INSTALL_PROMPT = e; }
  installed = false;
  if (readState().installed === true) writeState({ installed: false });
  syncInstallNow(); renderRow();
});
function syncInstallNow() {
  const hide = !window.BB_INSTALL_PROMPT || isInstalled();
  if (hide && installBox.contains(document.activeElement)) tabs.android.focus();   // keep focus in the dialog
  installBox.hidden = hide;
}
installBtn.addEventListener('click', async () => {
  const p = window.BB_INSTALL_PROMPT; if (!p) return;
  window.BB_INSTALL_PROMPT = null;                     // prompt() works once per event
  syncInstallNow();
  try {
    await p.prompt();
    const choice = await p.userChoice;
    if (choice && choice.outcome === 'accepted') { markInstalled(); closeGuide(); }
  } catch (e) { /* the browser refused; the manual steps stay on screen */ }
});
window.addEventListener('appinstalled', markInstalled);

// ---------- home banner ----------
const banner = $('installBanner');
const root = document.documentElement;
function hideBanner() { root.removeAttribute('data-bb-install-banner'); }
if (banner) {
  $('installBannerText').textContent = C.banner.text.vi;
  $('installBannerCta').textContent = C.banner.cta.vi;
  $('installBannerClose').setAttribute('aria-label', C.banner.closeLabel.vi);
  banner.setAttribute('aria-label', C.banner.regionLabel.vi);
  $('installBannerCta').addEventListener('click', e => openGuide(e.currentTarget));
  $('installBannerClose').addEventListener('click', () => {
    const hadFocus = banner.contains(document.activeElement);
    writeState({ dismissed: true });
    hideBanner();
    BB.sfx('tap');
    if (hadFocus && $('openTrain')) $('openTrain').focus({ preventScroll: true });
  });
}

// ---------- settings row ----------
const rowBtn = $('setInstallBtn');
function renderRow() {
  if (!rowBtn) return;
  // 'installed' = running from the Home Screen icon; 'added' = installed during this browser visit.
  const mode = platform === 'installed' ? 'installed' : isInstalled() ? 'added'
    : platform === 'desktop' ? 'desktop' : 'mobile';
  const c = C.settings[mode];
  $('setInstallTitle').textContent = c.title.vi;
  $('setInstallSub').textContent = c.sub.vi;
  rowBtn.textContent = c.button.vi;
  rowBtn.dataset.mode = mode;
  rowBtn.setAttribute('aria-controls', mode === 'desktop' ? 'qrDialog' : 'installDialog');
  const done = mode === 'installed' || mode === 'added';
  $('setInstallCheck').toggleAttribute('hidden', !done);   // SVG has no .hidden property
  const row = $('setInstallRow');
  row.classList.toggle('is-installed', done);
  row.hidden = false;                                     // hidden in the HTML until this file runs
}
if (rowBtn) rowBtn.addEventListener('click', e => {
  if (rowBtn.dataset.mode === 'desktop') {
    // Reuse the QR dialog. hub.js closes the settings sheet and returns focus to whatever had it,
    // so hand it the settings button, which stays on screen.
    const gear = $('hubSettings'), qr = $('hubQrBtn');
    if (gear) gear.focus({ preventScroll: true });
    if (qr) qr.click();
    return;
  }
  openGuide(e.currentTarget);
});

function markInstalled() {
  installed = true;
  window.BB_INSTALL_PROMPT = null;                        // an old event must not offer a second install
  writeState({ installed: true });
  hideBanner();
  syncInstallNow();
  renderRow();
}

renderRow();
window.BBInstall = Object.freeze({ open: openGuide, close: closeGuide, platform, browser });
} catch (err) { fail(); }
})();
