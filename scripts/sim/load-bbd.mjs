// Loads js/difficulty.js and js/levels/*.js into a fresh node:vm context, exactly as the browser
// runs them (classic scripts, shared global). Each call returns an isolated BBD instance.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const GAMES = ['train', 'koi', 'mem', 'rain', 'word'];

export function loadBBD({ games = GAMES } = {}) {
  const ctx = vm.createContext({ console });
  const run = rel => vm.runInContext(readFileSync(join(ROOT, rel), 'utf8'), ctx, { filename: rel });
  run('js/difficulty.js');
  games.forEach(g => run(`js/levels/${g}.js`));
  return ctx.BBD;
}
