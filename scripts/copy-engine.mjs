// Copies the lite single-threaded Stockfish build into public/engine so the
// browser can load it as a same-origin Web Worker (no special headers needed).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const src = 'node_modules/stockfish/bin';
const dest = 'public/engine';
if (!existsSync(src)) process.exit(0);
mkdirSync(dest, { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(`${src}/${f}`, `${dest}/${f}`);
}
copyFileSync('node_modules/stockfish/Copying.txt', `${dest}/COPYING.txt`);
