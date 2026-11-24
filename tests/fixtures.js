// Every spec imports test/expect from here so test runs are silent (Duy, 2026-11-22).
// Sound logic still runs (core.spec counts delayed sounds); only the speaker output is muted:
// each AudioContext hands out a zero-gain node as its destination.
import { test as base, expect } from '@playwright/test';

export function muteAudio() {
  for (const C of new Set([window.AudioContext, window.webkitAudioContext])) {
    if (!C) continue;
    const real = Object.getOwnPropertyDescriptor(C.prototype, 'destination')
      || Object.getOwnPropertyDescriptor(BaseAudioContext.prototype, 'destination');
    if (!real) continue;
    Object.defineProperty(C.prototype, 'destination', {
      configurable: true,
      get() {
        if (!this.__bbMute) { this.__bbMute = this.createGain(); this.__bbMute.gain.value = 0; this.__bbMute.connect(real.get.call(this)); }
        return this.__bbMute;
      },
    });
  }
  HTMLMediaElement.prototype.play = function () { this.muted = true; return Promise.resolve(); };
}

export const test = base.extend({
  context: async ({ context }, use) => { await context.addInitScript(muteAudio); await use(context); },
});

export async function pickLevel(page, gridSel, L) {
  const det = page.locator(`${gridSel} details.lvchap`).nth(Math.floor((L - 1) / 5));
  if (await det.count()) {
    if (!(await det.evaluate(d => d.open))) {
      await det.locator('> summary.lvchap-sum').scrollIntoViewIfNeeded();
      await det.locator('> summary.lvchap-sum').click();
    }
  }
  const btn = page.locator(`${gridSel} .lv`).nth(L - 1);
  await btn.scrollIntoViewIfNeeded();
  await btn.click();
}
export { expect };
