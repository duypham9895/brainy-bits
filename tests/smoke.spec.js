// Smoke test: every game opens from the hub, starts, and returns home without a page error.
// It proves the export runs outside claude.ai; it does not judge gameplay.
import { test, expect } from '@playwright/test';

const GAMES = [
  { open: '#openTrain', menu: '#menu', start: '#startBtn', wait: 4500, pause: '#pauseBtn', quit: '#quitBtn' },
  { open: '#openKoi', menu: '#kmenu', start: '#kStartBtn', pause: '#kPauseBtn', quit: '#kQuitBtn' },
  { open: '#openMem', menu: '#mmenu', start: '#mStart', pause: '#mPause', quit: '#mQuit' },
  { open: '#openRain', menu: '#rmenu', start: '#rStart', pause: '#rPause', quit: '#rQuit' },
  { open: '#openWord', menu: '#wmenu', start: '#wStart' },
];

for (const g of GAMES) {
  test(`${g.open} opens, starts and goes back to its menu`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto('/');
    await expect(page.locator('#hub')).toBeVisible();
    await page.click(g.open);
    await expect(page.locator(g.menu)).toBeVisible();
    await page.click(g.start);
    await expect(page.locator(g.menu)).toBeHidden();
    // Train ignores Pause during its 3.6 s countdown (original.html:1369, 1422), so wait past it.
    await page.waitForTimeout(g.wait ?? 1500);
    if (g.pause) {
      await page.click(g.pause);
      await page.click(g.quit);
      await expect(page.locator(g.menu)).toBeVisible();
    }
    expect(errors).toEqual([]);
  });
}

test('hub has no horizontal overflow at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto('/');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(over).toBeLessThanOrEqual(0);
});
