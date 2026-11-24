// Builds js/word-dict.js from two Leipzig Corpora Collection Vietnamese corpora (CC BY 4.0)
// filtered by strict Vietnamese phonology and orthography rules. Streams in memory — leaves no
// archive files behind in the repo.
//
// Usage: node scripts/build-word-dict.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TONES = ['\u0301', '\u0300', '\u0309', '\u0303', '\u0323']; // sắc, huyền, hỏi, ngã, nặng

function split(ch) {
  const d = ch.normalize('NFD');
  let tone = '', rest = '';
  for (const c of d) { if (TONES.includes(c)) tone = c; else rest += c; }
  return { base: rest.normalize('NFC'), tone };
}

const INITIALS = ['ngh','ch','gh','gi','kh','ng','nh','ph','qu','th','tr','b','c','d','đ','g','h','k','l','m','n','p','r','s','t','v','x',''];
const OPEN = 'a ai ao au ay âu ây e eo ê êu i ia iu iêu o oa oai oao oay oe oeo oi ô ôi ơ ơi u ua uay uây ui uê uơ uôi uy uya uyu ư ưa ưi ưu ươi ươu y ya yêu'.split(' ');
const CLOSED_BY_NUC = {
  a:  ['c','ch','m','n','ng','nh','p','t'],
  'ă': ['c','m','n','ng','p','t'],
  'â': ['c','m','n','ng','p','t'],
  e:  ['c','m','n','ng','p','t'],
  'ê': ['ch','m','n','nh','p','t'],
  i:  ['ch','m','n','nh','p','t'],
  o:  ['c','m','n','ng','p','t'],
  'ô': ['c','m','n','ng','p','t'],
  'ơ': ['m','n','p','t'],
  u:  ['c','m','n','ng','p','t'],
  'ư': ['c','m','n','ng','t'],
  y:  ['ch','m','n','nh','p','t'],
  oa: ['c','ch','m','n','ng','nh','p','t'],
  'oă': ['c','m','n','ng','p','t'],
  oe: ['c','m','n','ng','p','t'],
  oo: ['c','ng'],
  'ôô': ['c','ng'],
  'uâ': ['n','ng','t'],
  'uê': ['ch','n','nh','t'],
  uy: ['ch','n','nh','p','t'],
  'iê': ['c','m','n','ng','p','t'],
  'yê': ['c','m','n','ng','p','t'],
  'uô': ['c','m','n','ng','p','t'],
  'ươ': ['c','m','n','ng','p','t'],
  'uyê': ['n','t'],
};
const RHYMES = new Set(OPEN);
for (const [nuc, codas] of Object.entries(CLOSED_BY_NUC)) for (const cd of codas) RHYMES.add(nuc + cd);

const LABIAL_RHYME = /^(oa|oă|oe|uâ|uê|uy|uơ)/;
const ORTH_EXCEPT = new Set([
  'quốc','buýt','voan','boong','coóc','tuýp','týp','típ','tít','gôn',
  'pin','pô','pa','pê','pi','pơ','pát','pít','píp','pốp','pắc','pác',
  'síp','súp','cúp','líp','rúp','bíp','bốp','lốp','bốt','vốt',
]);

function orthographyOK(ini, r, fullWord) {
  if (ORTH_EXCEPT.has(fullWord)) return true;
  const f = r[0];
  if (ini === 'p') return false;
  if (ini === 'k' || ini === 'gh' || ini === 'ngh') {
    if (!'ieêy'.includes(f)) return false;
    if ((ini === 'gh' || ini === 'ngh') && f === 'y') return false;
  }
  if (ini === 'c' || ini === 'g' || ini === 'ng') {
    if ('ieêy'.includes(f)) return false;
  }
  if (ini === 'gi' && (f === 'i' || f === 'y')) return false;
  if (ini === 'qu' && 'uưoô'.includes(f)) return false;
  if (r.startsWith('iê') && ini === '') return false;
  if (r.startsWith('yê') && ini !== '' && ini !== 'qu') return false;
  if (/(ych|ym|yn|ynh|yp|yt)$/.test(r) && !r.startsWith('uy') && ini !== 'qu' && !(ini === '' && r === 'yt')) return false;
  if ((ini === 'b' || ini === 'm' || ini === 'ph' || ini === 'v') && LABIAL_RHYME.test(r)) return false;
  if ((ini === 'c' || ini === 'g') && /^(oe|uê|uy)/.test(r)) return false;
  return true;
}

function parseSyllable(raw) {
  const s = raw.normalize('NFC').toLowerCase();
  if (!/^[a-zàáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ]+$/.test(s)) return null;
  if (s.length < 1 || s.length > 7) return null;
  let tone = '', tc = 0;
  const bases = [...s].map(ch => {
    const sp = split(ch);
    if (sp.tone) { tone = sp.tone; tc++; }
    return sp.base;
  });
  if (tc > 1) return null;
  const w = bases.join('');
  const checkedOk = r => !/(c|ch|p|t)$/.test(r) || tone === TONES[0] || tone === TONES[4];
  let ok = false;
  if (w.startsWith('gi')) {
    const r = 'i' + w.slice(2);
    if (RHYMES.has(r) && checkedOk(r)) ok = true;
  }
  if (!ok) {
    for (const ini of INITIALS) {
      if (!w.startsWith(ini)) continue;
      const r = w.slice(ini.length);
      if (!RHYMES.has(r) || !orthographyOK(ini, r, s) || !checkedOk(r)) continue;
      ok = true;
      break;
    }
  }
  if (!ok) return null;
  return { base: w, tIdx: tone ? TONES.indexOf(tone) + 1 : 0 };
}

function loadLeipzig(name) {
  const url = `https://downloads.wortschatz-leipzig.de/corpora/${name}.tar.gz`;
  const r = spawnSync('sh', ['-c', `curl -fsSL "${url}" | tar -xzO "${name}/${name}-words.txt"`], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`Failed loading ${name}: ${r.stderr}`);
  return r.stdout;
}

const f2014 = new Map();
const f2022 = new Map();
for (const [name, map] of [['vie_mixed_2014_300K', f2014], ['vie_news_2022_300K', f2022]]) {
  console.log(`Downloading ${name}...`);
  const txt = loadLeipzig(name);
  for (const line of txt.split(/\r?\n/)) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const freq = parseInt(parts[2], 10);
    if (!freq) continue;
    const parsed = parseSyllable(parts[1]);
    if (!parsed) continue;
    const k = `${parsed.base}:${parsed.tIdx}`;
    map.set(k, (map.get(k) || 0) + freq);
  }
}

const byBase = new Map();
const addKey = (b, ti) => {
  if (!byBase.has(b)) byBase.set(b, new Set());
  byBase.get(b).add(ti);
};

const allKeys = new Set([...f2014.keys(), ...f2022.keys()]);
for (const k of allKeys) {
  const a = f2014.get(k) || 0, b = f2022.get(k) || 0;
  if ((a >= 1 && b >= 1) || (a + b >= 4)) {
    const [base, ti] = k.split(':');
    addKey(base, Number(ti));
  }
}

// Curated everyday colloquialisms, onomatopoeia, i/y variants, and rare real syllables
const SUPPLEMENT = [
  'ngoao', 'nguây', 'loắt', 'choắt', 'roẹt', 'uỳnh', 'xeng', 'reng', 'keng', 'leng', 'beng', 'cheng',
  'éc', 'kéc', 'xéc', 'oéc', 'huơ', 'thuở', 'nhoẻn', 'khuỷu', 'xoong', 'boong', 'coóc', 'buýt', 'tuýt',
  'gìn', 'quơ', 'khiêu', 'vồng', 'phùn', 'mỳ', 'kĩ', 'lí', 'mĩ', 'hươu', 'rườm', 'bướu',
  'quýt', 'quỳnh', 'giêng', 'giềng', 'giếc', 'rợp', 'týp', 'típ', 'lốp', 'bốt', 'súp', 'cúp',
];
for (const w of SUPPLEMENT) {
  const parsed = parseSyllable(w);
  if (!parsed) throw new Error(`Supplement word failed phonotactics: ${w}`);
  addKey(parsed.base, parsed.tIdx);
}

// Verify all 50 game PHRASES pass
const wjs = readFileSync(join(ROOT, 'js', 'word.js'), 'utf8');
const m = wjs.match(/const PHRASES = \[[\s\S]*?\]\.map/);
const phrases = [...m[0].matchAll(/'([^']+)','/g)].map(x => x[1]);
for (const ph of phrases) {
  for (const w of ph.normalize('NFC').split(' ')) {
    const p = parseSyllable(w);
    if (!p || !byBase.get(p.base)?.has(p.tIdx)) throw new Error(`PHRASES syllable missing: ${w} (${ph})`);
  }
}

// Verify denylist of fake/bogus syllables stays excluded
const BOGUS = [
  'bănh', 'bônh', 'boch', 'piêch', 'ka', 'ko', 'ku', 'ci', 'ce', 'ge', 'gha', 'ngha',
  'quu', 'gii', 'cuứ', 'luư', 'thưở', 'nưôi', 'xoông', 'aaaaaa', 'ddoong', 'moan', 'kym', 'coe', 'guêt', 'pam', 'poi', 'pong',
];
for (const w of BOGUS) {
  const p = parseSyllable(w);
  if (p && byBase.get(p.base)?.has(p.tIdx)) throw new Error(`Bogus syllable leaked: ${w}`);
}

const entries = [...byBase.entries()]
  .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  .map(([b, s]) => `${b}:${[...s].sort().join('')}`);
const DATA = entries.join(' ');
const totalCount = entries.reduce((acc, e) => acc + e.split(':')[1].length, 0);

const out = `// Vietnamese real-syllable dictionary for Đoán Cụm Từ (table validation & word solver).
// Generated by scripts/build-word-dict.mjs from Leipzig Corpora Collection datasets
// (vie_mixed_2014_300K, vie_news_2022_300K) — Creative Commons Attribution 4.0 (CC BY 4.0).
// Citation: D. Goldhahn, T. Eckart & U. Quasthoff (LREC 2012), "Building Large Monolingual
// Dictionaries at the Leipzig Corpora Collection: From 100 to 200 Languages".
// Filtered by Vietnamese phonotactics & orthography (c/k, g/gh, ng/ngh, checked-coda tones).
(function (root) {
  'use strict';
  const DATA = ${JSON.stringify(DATA)};
  const MAP = Object.create(null);
  let count = 0;
  for (const entry of DATA.split(' ')) {
    const sep = entry.indexOf(':');
    const base = entry.slice(0, sep);
    const ts = entry.slice(sep + 1);
    let mask = 0;
    for (let i = 0; i < ts.length; i++) { mask |= 1 << Number(ts[i]); count++; }
    MAP[base] = mask;
  }
  const api = {
    DATA,
    MAP,
    count,
    has: (base, toneIdx) => !!((MAP[base] || 0) & (1 << (toneIdx | 0))),
    maskOf: base => MAP[base] || 0,
    bases: () => Object.keys(MAP),
  };
  root.BBWordDict = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;

const outPath = join(ROOT, 'js', 'word-dict.js');
writeFileSync(outPath, out, 'utf8');
const gz = gzipSync(out).length;
console.log(`Wrote js/word-dict.js: ${totalCount} syllables across ${entries.length} bases (${Buffer.byteLength(out)} B raw, ${gz} B gzip).`);
