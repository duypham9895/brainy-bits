// Parity gate: index.html must equal reference/original.html (the claude.ai artifact export)
// except for the lines listed in ALLOWED. Any other drift fails CI, so "exact copy" stays
// a checked fact instead of a claim. When an approved enhancement lands, add its line here
// with the date and the reason.
import { readFileSync } from 'node:fs';

const ALLOWED = [
  // 2026-11-20: artifact export carried the "(Copy)" suffix from claude.ai, not part of the game.
  { from: '<title>Brainy Bits (Copy)</title>', to: '<title>Brainy Bits</title>' },
];

const a = readFileSync(new URL('../reference/original.html', import.meta.url), 'utf8').split('\n');
const b = readFileSync(new URL('../index.html', import.meta.url), 'utf8').split('\n');

let bad = 0;
if (a.length !== b.length) {
  console.error(`FAIL line count differs: original=${a.length} index=${b.length}`);
  bad++;
}
for (let i = 0; i < Math.max(a.length, b.length); i++) {
  if (a[i] === b[i]) continue;
  const ok = ALLOWED.some(r => a[i]?.trim() === r.from && b[i]?.trim() === r.to);
  if (!ok) {
    console.error(`FAIL line ${i + 1}\n  original: ${a[i]}\n  index:    ${b[i]}`);
    if (++bad > 20) break;
  }
}
if (bad) process.exit(1);
console.log(`PASS parity: ${b.length} lines, ${ALLOWED.length} allowed difference(s)`);
