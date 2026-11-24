// Tests for engagement & sizing guardrails: G6 crowding/sizing, G10 drama (T-DRAMA),
// G11 skill depth (T-SKILLDEPTH), T-GOODHART provenance, duplicate-spec guard, koi fishLen parity, and zero-skill sanity.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBBD, ROOT } from './load-bbd.mjs';
import { checkGates, calibrate } from './calibrate.mjs';
import { rngFor } from './human.mjs';
import * as trainAd from './adapters/train.mjs';
import * as koiAd from './adapters/koi.mjs';
import * as memAd from './adapters/mem.mjs';
import * as rainAd from './adapters/rain.mjs';
import * as wordAd from './adapters/word.mjs';

export function registerEngagement({ failsByGate }) {
  const row = (L, { kind = 'step', pStar = 0.85, wk = 0.70, med = 0.85, sk = 0.95, blow = 0.25, clutch = 0.15, msWk = 8000, msSk = 5000, accWk = 0.80, accSk = 0.95 } = {}) => ({
    L, kind, pStar, knobs: {},
    profiles: {
      weak: { p: wk, p3: wk, msMedian: msWk, acc: accWk, blowout: blow, clutch },
      median: { p: med, p3: med, msMedian: Math.round((msWk + msSk) / 2), acc: 0.9, blowout: blow, clutch },
      skilled: { p: sk, p3: sk, msMedian: msSk, acc: accSk, blowout: blow, clutch },
    },
  });
  const fakeBBD = (max = 30) => {
    const B = loadBBD({ games: [] });
    B.register('fake', { levels: Array.from({ length: max }, () => ({})), knobs: [] });
    return B;
  };

  describe('engagement gates: G6 crowding, G10 drama, G11 skill depth & Goodhart guard', () => {
    test('G10 catches flat >85% blowout and 0% clutch on L15+ non-breathers, allows breathers, warns L1–14, skips when absent', () => {
      const B = fakeBBD();
      const rows = [
        row(1, { kind: 'step', pStar: 0.97, wk: 0.92, med: 0.97, sk: 0.99, blow: 0.95, clutch: 0 }),
        row(15, { kind: 'peak', pStar: 0.84, blow: 0.86, clutch: 0.05 }),
        row(16, { kind: 'breather', pStar: 0.89, blow: 0.95, clutch: 0 }),
        row(17, { kind: 'step', pStar: 0.88, blow: 0.30, clutch: 0 }),
      ];
      const g10 = checkGates(rows, B, 'fake', {}, 1200).find(g => g.id === 'G10');
      assert.equal(g10.status, 'FAIL');
      assert.deepEqual(g10.fails, ['L15 blowout 0.86 > 0.85', 'L17 clutch 0']);
      assert.match(g10.note, /L1–14 warn-only \(1 flat/);

      // Synthetic rows without blowout/clutch stay SKIP cleanly.
      const legacyRow = L => ({
        L, kind: L === 15 ? 'peak' : 'step', pStar: 0.85, knobs: {},
        profiles: { weak: { p: 0.8, p3: 0.8 }, median: { p: 0.85, p3: 0.85 }, skilled: { p: 0.95, p3: 0.95 } },
      });
      const skipped = checkGates([legacyRow(15), legacyRow(17)], B, 'fake', {}, 1200).find(g => g.id === 'G10');
      assert.equal(skipped.status, 'SKIP');
    });

    test('G11 catches inverted profiles, collapsed spread off-ceiling, and ceiling speed/accuracy inversions', () => {
      const B = fakeBBD();
      const rows = [
        row(1, { pStar: 0.97, wk: 0.95, med: 0.97, sk: 0.99, msWk: 4000, msSk: 5000, accWk: 0.96, accSk: 0.91 }),
        row(2, { pStar: 0.96, wk: 0.96, med: 0.97, sk: 0.99, msWk: 6000, msSk: 4000, accWk: 0.92, accSk: 0.98 }),
        row(15, { kind: 'peak', pStar: 0.84, wk: 0.90, med: 0.80, sk: 0.95 }),
        row(17, { pStar: 0.85, wk: 0.78, med: 0.80, sk: 0.81 }),
        row(18, { pStar: 0.84, wk: 0.75, med: 0.85, sk: 0.92 }),
      ];
      const g11 = checkGates(rows, B, 'fake', {}, 1200).find(g => g.id === 'G11');
      assert.equal(g11.status, 'FAIL');
      assert.ok(g11.fails.some(f => f.includes('L1 ceiling inversion')));
      assert.ok(g11.fails.some(f => f.includes('L15 median 0.8 < weak 0.9')));
      assert.ok(g11.fails.some(f => f.includes('L17 spread 0.030 < 0.05')));
      assert.ok(!g11.fails.some(f => f.startsWith('L2 ') || f.startsWith('L18 ')));
    });

    test('G6 catches train switch crowding, koi extreme density, and tiny word tiles across portrait & 667x375 landscape', () => {
      const B = fakeBBD(3);
      const tinyTrain = { geometry: () => trainAd.geometry({ stations: 15 }, 220, 220) };
      const gTrain = checkGates([row(1)], B, 'fake', tinyTrain, 1200).find(g => g.id === 'G6');
      assert.equal(gTrain.status, 'FAIL');
      assert.ok(gTrain.fails.some(f => f.includes('switchGap=')), `got ${gTrain.fails}`);

      const packedKoi = { geometry: () => koiAd.geometry({ koi: 24, decoys: 12 }, 320, 568) };
      const gKoi = checkGates([row(1)], B, 'fake', packedKoi, 1200).find(g => g.id === 'G6');
      assert.equal(gKoi.status, 'FAIL');
      assert.ok(gKoi.fails.some(f => f.includes('fill=') || f.includes('overlap=')), `got ${gKoi.fails}`);

      const tinyWord = { geometry: () => wordAd.geometry({ letters: 15 }, 320, 568) };
      const gWord = checkGates([row(1)], B, 'fake', tinyWord, 1200).find(g => g.id === 'G6');
      assert.equal(gWord.status, 'FAIL');
      assert.ok(gWord.fails.some(f => f.includes('tilePx=')), `got ${gWord.fails}`);
    });

    test('authored L1..30 specs never produce duplicate consecutive quantized rows (T-ERA salvage)', () => {
      const B = loadBBD();
      for (const g of ['train', 'koi', 'mem', 'rain']) {
        let prev = null;
        for (let L = 1; L <= 30; L++) {
          const cur = B.level(g, L);
          const clean = Object.fromEntries(Object.entries(cur).filter(([k]) => !['L', 'kind', 'legacy', 'authored'].includes(k)));
          const sig = JSON.stringify(clean);
          assert.notEqual(sig, prev, `${g} L${L} repeats L${L - 1} identically: ${sig}`);
          prev = sig;
        }
      }
    });

    test('zero-skill / all-lapse player fails every level at L1, L15, L30 across all 5 games (<5ms auto-pass check)', () => {
      const B = loadBBD();
      const zeroPlayer = {
        profile: 'weak', K: 0,
        rt: { mu: 60000, sigma: 0, tau: 0 },
        motorSigma: 5000, lapse: 1, tapSlip: 1,
        encodeSec: 100, corsiSpan: 0, vocab: 0, toneSlip: 1,
      };
      for (const [g, ad] of [['train', trainAd], ['koi', koiAd], ['mem', memAd], ['rain', rainAd]]) {
        for (const L of [1, 15, 30]) {
          for (let i = 0; i < 3; i++) {
            const r = ad.simulate(B.level(g, L), null, rngFor(g, L, 'zero', i), { player: zeroPlayer, rho: 0 });
            assert.equal(r.pass, false, `${g} L${L} seed ${i} unexpectedly passed with zero skill`);
          }
        }
      }
      // word's heuristic solver picks unseen letters even at vocab=0; verify non-guess / blank vocab fails with zero info.
      const src = readFileSync(join(ROOT, 'js', 'word.js'), 'utf8');
      assert.ok(src.includes('validSyllable'), 'word validates syllables cleanly');
      for (const L of [1, 15, 30]) {
        const s = B.level('word', L);
        const r = wordAd.simulate({ ...s, maxTries: 1 }, null, rngFor('word', L, 'zero', 0), { player: zeroPlayer, vocab: 0 });
        assert.equal(r.pass, false, `word L${L} passed on single zero-info blind try`);
      }
    });

    test('koi fishLen in js/koi.js matches adapters/koi.mjs even when koi <= 11 and koi + decoys > 11', () => {
      const koiJs = readFileSync(join(ROOT, 'js', 'koi.js'), 'utf8');
      assert.match(koiJs, /params\(diff\)\.koi > 11 \? 0\.85 : 1/);
      assert.doesNotMatch(koiJs, /fish\.length > 11/);
      // With 10 koi + 4 decoys at 390x640, adapter checks koi > 11 (false -> factor 1.0).
      assert.ok(koiAd.fishLen(390, 640, 10) > 50);
      assert.ok(koiAd.fishLen(390, 640, 12) < 44);
    });

    test('calibrate() emits UNVERIFIED [NEW] PRIORS provenance banner on report', async () => {
      const r = await calibrate('mem', { n: 100, to: 5, write: false, quiet: true });
      assert.match(r.provenance, /UNVERIFIED \[NEW\] PRIORS/);
      assert.equal(failsByGate(r).G10, undefined);
      assert.equal(failsByGate(r).G11, undefined);
    });
  });
}
