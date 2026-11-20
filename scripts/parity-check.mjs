// Reference gate: reference/original.html is the untouched export of Duy's claude.ai artifact
// (2026-11-20). The live game diverged on purpose (approved package A+B+C, 2026-11-20), so the
// gate now pins the reference itself: any edit to it fails CI.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PINNED = '13170a583cd2e899db0503e6511a1ccb40239f19a70494c62ad2151dfb70100a';
const got = createHash('sha256').update(readFileSync(new URL('../reference/original.html', import.meta.url))).digest('hex');
if (got !== PINNED) { console.error('FAIL reference/original.html changed: ' + got); process.exit(1); }
console.log('PASS reference/original.html unchanged (' + PINNED.slice(0, 12) + ')');
