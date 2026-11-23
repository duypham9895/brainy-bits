// One shared way to tap a koi in tests (2026-11-23).
// Root cause of the CI flake in koi.spec.js "perfect level 1: 3 stars": the old helpers tapped the fish
// centre (x, y), but the game resolves a tap with fishAt(): a head-shifted ellipse where the nearest
// centre wins. When fish swim over each other, the centre of the target can belong to a neighbour,
// so 1–2% of rounds fed an already-fed fish (a mistake, 1 star). Two hand-rolled copies of the helper
// drifted apart (koi-levels.spec.js was patched, koi.spec.js was not).
// Fix: ask the game's own fishAt() (window.__koi.fishAt) which fish a point hits, tap only a point that
// resolves to the target, and wait a frame when every candidate is covered. Never guess the hit area here.

// kind: 'fresh' (koi not fed yet) | 'fed' | 'decoy' (grey fish). o: extra PointerEvent fields.
// Returns true when it tapped, false when the round is over or no fish of that kind is left.
export async function tapFish(page, kind, o = {}, tries = 80) {
  if (!['fresh', 'fed', 'decoy'].includes(kind)) throw new Error(`tapFish: unknown kind ${kind}`);
  let inCd = null;                         // cooldown state on the first try: a wait must not cross it
  for (let t = 0; t < tries; t++) {
    const r = await page.evaluate(([kind, o, inCd]) => {
      const K = window.__koi;
      if (K.state !== 'play') return { r: 'done' };
      const cd = K.cooldown > 0;
      if (inCd !== null && cd !== inCd) return { r: 'cooldown-changed' };
      const want = f => kind === 'decoy' ? f.decoy : !f.decoy && (kind === 'fed' ? f.fed : !f.fed);
      const cands = K.fish.filter(want);
      if (!cands.length) return { r: 'none', cd };
      const cv = document.getElementById('kcv'), rc = cv.getBoundingClientRect();
      for (const c of cands) {
        // points along the body, head first (the hit ellipse sits 0.04 L towards the head)
        for (const k of [0.04, 0.2, -0.12, 0.32]) {
          const ev = new PointerEvent('pointerdown', Object.assign({ bubbles: true, cancelable: true, isPrimary: true,
            button: 0, pointerType: 'touch', clientX: rc.left + c.x + Math.cos(c.ang) * c.L * k,
            clientY: rc.top + c.y + Math.sin(c.ang) * c.L * k }, o));
          // check the coordinates the game will read (an engine may round clientX/Y), not the float we asked for
          if (K.fishAt(ev.clientX - rc.left, ev.clientY - rc.top) !== c) continue;
          cv.dispatchEvent(ev);
          return { r: 'tapped' };
        }
      }
      return { r: 'wait', cd };            // every candidate is under another fish this frame
    }, [kind, o, inCd]);
    if (r.r === 'tapped') return true;
    if (r.r === 'cooldown-changed') throw new Error(`tapFish(${kind}): the dial changed while waiting for a clear fish; the tap would test the wrong thing`);
    if (r.r !== 'wait') return false;
    if (inCd === null) inCd = r.cd;
    await page.waitForTimeout(25);
  }
  throw new Error(`tapFish(${kind}): no point resolved to a ${kind} fish in ${tries} frames`);
}

export const skipCooldown = page => page.evaluate(() => { window.__koi.cooldown = 0; });

// Feed every unfed koi, skipping the dial wait. Returns how many were fed.
export async function feedAll(page) {
  let n = 0;
  for (let i = 0; i < 20; i++) {
    await skipCooldown(page);
    if (!(await tapFish(page, 'fresh'))) break;
    n++;
  }
  return n;
}
