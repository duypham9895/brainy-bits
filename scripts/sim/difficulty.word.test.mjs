// Word block of scripts/sim/difficulty.test.mjs, split out to keep that file under 800 lines (review 2026-11-21).
// Registered from difficulty.test.mjs, which hands over its shared helpers, so `npm run test:sim` still runs it.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { loadBBD } from './load-bbd.mjs';
import { calibrate } from './calibrate.mjs';
import { rngFor, PROFILES } from './human.mjs';

const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

export function registerWord({ loadCore, J, failsByGate }) {
// ---------- word (owner: word levels branch). js/word.js reads BBD.level('word', L).phrase. ----------
describe('word: 50 phrases ordered by measured difficulty, stars keyed by phrase id (table v2)', () => {
  test('word legacyLevels (v1) = old word.js order (sort by letter count, then source index)', async () => {
    const B = loadBBD();
    const { W, legacyOrder } = await import('./adapters/word.mjs');
    const old = legacyOrder().filter(i => i < 49);            // the 49 v1 phrases before 50+ were added
    assert.equal(old.length, 49);
    const leg = B.spec('word').legacy;
    assert.equal(leg.length, 49);
    for (let L = 1; L <= 49; L++) {
      const r = leg[L - 1], p = W.PHRASES.find(x => x.i === old[L - 1]);
      assert.equal(r.phrase, old[L - 1], `L${L} phrase`);
      assert.equal(r.letters, p.n, `L${L} letters`);
      assert.equal(r.maxTries, 6, `L${L} tries`);
      assert.equal(r.id, `p${old[L - 1]}`, `L${L} id`);
    }
  });
  test('word levels (v2): 50 phrases, v2 order + L50 appended, id = "p" + phrase, letters true, 6 tries', async () => {
    const B = loadBBD();
    const { W } = await import('./adapters/word.mjs');
    assert.equal(B.version('word'), 2);
    assert.equal(B.maxLevel('word'), 50); assert.equal(B.authoredCount('word'), 50);
    const rows = Array.from({ length: 50 }, (_, k) => B.level('word', k + 1));
    assert.deepEqual(rows.map(r => r.phrase).sort((a, b) => a - b), range(0, 49));
    for (const r of rows) {
      assert.equal(r.authored, true); assert.equal(r.legacy, false);
      assert.equal(r.id, `p${r.phrase}`); assert.equal(B.levelId('word', r.L), r.id);
      assert.equal(r.letters, W.PHRASES.find(x => x.i === r.phrase).n, `L${r.L} letters`);
      assert.equal(r.maxTries, 6);
    }
    assert.notDeepEqual(rows.slice(0, 49).map(r => r.phrase), B.spec('word').legacy.map(r => r.phrase));
    B.CONFIG.E3_FREEZE_LEGACY = true;                         // rollback switch: legacy order, stars still keyed by phrase
    assert.equal(B.level('word', 30).phrase, 30); assert.equal(B.levelId('word', 30), 'p30');
  });
  // Real keys from the v1 build: bb_stats.word.stars keyed by old level number, word_lv = next level to play.
  // Old L1 = "bà nội" (p0), old L2 = "cà phê" (p1), old L30 = "mưa phùn" (p30), old L49 = "truyền thống" (p48).
  test('word migration v1 → v2: stars move to the phrase they were earned on, levels passed never drop', () => {
    const v1 = { bb_stats: JSON.stringify({ word: { best: 30, stars: { 1: 3, 2: 2, 30: 1, 49: 3 } }, mem: { best: 4, stars: { 4: 2 } } }), word_lv: '31' };
    const { BB, BBD, ls } = loadCore({ init: v1 });
    const r = BB.migrateProgress('word');
    assert.deepEqual([r.ran, r.reason, r.from, r.to], [true, 'migrated', 1, 2]);
    assert.deepEqual(J(BB.gameStats('word')), { best: 30, stars: { p0: 3, p1: 2, p30: 1, p48: 3 } });
    assert.equal(ls.get('bb_tablev_word'), '2');
    assert.equal(ls.get('word_lv'), '31');                    // legacy key untouched
    assert.deepEqual(J(BB.gameStats('mem')), { best: 4, stars: { 4: 2 } });   // other games untouched
    const newL = ph => Array.from({ length: 50 }, (_, k) => k + 1).find(L => BBD.level('word', L).phrase === ph);
    assert.equal(BB.starsAt('word', newL(30)), 1); assert.equal(BB.starsAt('word', newL(0)), 3);
    const total = s => Object.values(s.stars).reduce((a, b) => a + b, 0);
    assert.equal(total(BB.gameStats('word')), 9);             // hub star total unchanged
    const snap = ls.get('bb_stats');
    assert.equal(BB.migrateProgress('word').reason, 'current'); assert.equal(ls.get('bb_stats'), snap);   // once only
    // a new win after migration is keyed by phrase id
    BB.record({ game: 'word', level: newL(5), won: true, stars: 2 });
    assert.equal(BB.gameStats('word').stars.p5, 2);
  });
  test('word migration on odd data: marker lost or corrupt, keys past 49, junk, newer marker, corrupt bb_stats', () => {
    // marker lost after a migration: the id keys pass through, a stray old key still moves; nothing is lost
    let c = loadCore({ init: { bb_stats: JSON.stringify({ word: { best: 12, stars: { p0: 3, 7: 2, 60: 1, 3: 'x', 4: 0 } } }), bb_tablev_word: 'zz' } });
    assert.equal(c.BB.migrateProgress('word').reason, 'migrated');
    assert.deepEqual(J(c.BB.gameStats('word')), { best: 12, stars: { p0: 3, p6: 2, 60: 1 } });
    // two old keys landing on one phrase keep the higher star count
    c = loadCore({ init: { bb_stats: JSON.stringify({ word: { best: 2, stars: { 1: 1, p0: 3 } } }) } });
    c.BB.migrateProgress('word'); assert.equal(c.BB.gameStats('word').stars.p0, 3);
    // a newer build ran first (marker 3): this build leaves the data alone
    c = loadCore({ init: { bb_stats: JSON.stringify({ word: { best: 5, stars: { 5: 2 } } }), bb_tablev_word: '3' } });
    assert.equal(c.BB.migrateProgress('word').reason, 'newer');
    assert.deepEqual(J(c.BB.gameStats('word')), { best: 5, stars: { 5: 2 } });
    for (const bad of ['{bad', '[]', '5', JSON.stringify({ word: 'x' }), JSON.stringify({ word: { best: 'abc', stars: [3] } })]) {
      c = loadCore({ init: { bb_stats: bad, word_lv: '9' } });
      assert.equal(c.BB.migrateProgress('word').reason, 'migrated', bad);
      assert.deepEqual(J(c.BB.gameStats('word')), { best: 0, stars: {} }, bad);
      assert.equal(c.ls.get('word_lv'), '9', bad);           // word_lv still carries the 8 levels passed
    }
    // a player who only has word_lv (no bb_stats yet): nothing to move, marker set, word_lv kept
    c = loadCore({ init: { word_lv: '25' } });
    assert.equal(c.BB.migrateProgress('word').ran, true);
    assert.equal(c.ls.get('bb_tablev_word'), '2'); assert.equal(c.ls.get('word_lv'), '25');
  });
  test('word adapter scores with the game\'s own evaluate, deterministic, skill-ordered', async () => {
    const B = loadBBD();
    const { W, simulate } = await import('./adapters/word.mjs');
    const ans = [...'càphê'];
    assert.deepEqual([...W.evaluateAgainst(ans, [...'càphê'])], Array(5).fill('green'));
    assert.deepEqual([...W.evaluateAgainst(ans, [...'caphe'])], ['green', 'blue', 'green', 'green', 'blue']);
    const run = (L, pn, i) => simulate(B.level('word', L), PROFILES[pn], rngFor('word-test', L, pn, i));
    assert.deepEqual(run(10, 'median', 3), run(10, 'median', 3));
    const rate = (L, pn) => { let k = 0; for (let i = 0; i < 300; i++) k += run(L, pn, i).pass; return k / 300; };
    for (const L of [1, 30, 50]) assert.ok(rate(L, 'weak') <= rate(L, 'median') && rate(L, 'median') <= rate(L, 'skilled') + 0.02, `L${L}`);
  });
  test('word recognition counts candidates left: every answer is in the pool, the filter rarely drops it', async () => {
    const { W, POOL, simulate } = await import('./adapters/word.mjs');
    for (const p of W.PHRASES) p.words.forEach(w => assert.ok(POOL.get(w.length).index.has(w.map(W.noTone).join('')), w.join('')));
    // Measured over all 49 phrases, not four level slots: table v2 moved phrases between slots, and the slots
    // 1 and 5 now hold phrases 18 and 36, which the filter drops on 6–9% of rows. All 49: ~2%.
    let rows = 0, dropped = 0;
    for (const p of W.PHRASES) for (let i = 0; i < 40; i++) {
      const d = simulate({ phrase: p.i, letters: p.n, maxTries: 6 }, PROFILES.weak, rngFor('word-drop', p.i, i)).detail;
      rows += d.rows; dropped += d.dropped;
    }
    assert.ok(dropped / rows < 0.05, `answer dropped by the bases-only filter on ${dropped}/${rows} rows`);
  });
  test('word dict & orthography: ~6k real syllables, 50 PHRASES valid, old/new tones match, bogus syllables rejected', async () => {
    const { W } = await import('./adapters/word.mjs');
    assert.ok(W.BBWordDict.count >= 5500 && W.BBWordDict.count <= 7500, `count=${W.BBWordDict.count}`);
    for (const p of W.PHRASES) for (const w of p.words) assert.ok(W.validSyllable(w), `PHRASES invalid: ${w.join('')}`);
    for (const [oldW, newW] of [['hòa','hoà'], ['thủy','thuỷ'], ['xóa','xoá'], ['khỏe','khoẻ'], ['tòa','toà']]) {
      assert.equal(W.validSyllable([...oldW]), true, oldW);
      assert.equal(W.validSyllable([...newW]), true, newW);
      assert.equal(W.normalizeSyllable([...newW]).join(''), oldW);
    }
    for (const ok of ['quốc','cứu','lưu','thuở','xoong','gì','gìn','giêng','giềng','buýt','tuýp','mì','mỳ','ngoao','uỳnh']) {
      assert.equal(W.validSyllable([...ok]), true, `expected valid: ${ok}`);
    }
    for (const bad of ['bănh','bônh','boch','piêch','ka','ko','ku','ci','ce','ge','gha','ngha','quu','gii','cuứ','luư','thưở','nưôi','xoông','aaaaaa','ddoong','moan','kym','coe','guêt','hóà','qùy']) {
      assert.equal(W.validSyllable([...bad]), false, `expected invalid: ${bad}`);
    }
  });
  // Duy 2026-11-21 (3): word waives B (reported WAIVED, never PASS) and must pass G1–G6, G8 and G9. Duy (1) moved the
  // first peak to L10, so L5/L6 swapped phrases; Duy B (2026-11-22) moved it to L15 and raised G1 to weak ≥ 90% on
  // L1–5, so L5↔L11, L10↔L14 and then L14↔L19 swapped. L1–5 phrases sit at weak 0.90–0.94 (L5 at 0.9025, the first
  // to fail if human.mjs or the adapter change), too close to 0.90 for N=150 noise:
  // the run uses the CI N (1200), the same seeds `node scripts/sim/calibrate.mjs word --n 1200` uses.
  test('word (table v2): zero failed gates, only B waived and never counted as PASS', async () => {
    const B = loadBBD();
    assert.deepEqual(Object.keys(B.spec('word').gateWaivers), ['B']);
    assert.match(B.spec('word').gateWaivers.B, /\S/);
    const r = await calibrate('word', { n: 1200, write: false, quiet: true });
    assert.equal(r.levels.length, 50);
    assert.ok(r.levels.every(l => !l.legacy));
    assert.deepEqual(failsByGate(r), {});
    assert.deepEqual(r.waived, ['B']);
    const g = id => r.gates.find(x => x.id === id);
    assert.deepEqual([g('B').status, g('B').pass, g('B').waived], ['WAIVED', null, true]);
    for (const id of ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G8', 'G9']) assert.equal(g(id).status, 'PASS', id);
    assert.equal(g('G7').status, 'SKIP');
    assert.equal(r.ok, true);
  });
});
}
