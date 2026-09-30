// Author's helper: probe many positions from a JSON file of {name, fen} entries.
//   npx tsx scripts/probe-batch.ts candidates.json
import { readFileSync } from 'node:fs';
import { Chess, validateFen } from 'chess.js';
import { boardFromFen, hangingPieces, loosePieces } from '../src/chess/rules';
import { isLegal, sanOf } from '../src/content/queries';
import { Engine, fmtScore } from './engine';

const items = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { name: string; fen: string; moves?: string[] }[];
const e = await Engine.start('single');
for (const it of items) {
  console.log(`\n== ${it.name}  ${it.fen}`);
  const v = validateFen(it.fen);
  if (!v.ok) {
    console.log('  INVALID', v.error);
    continue;
  }
  const b = boardFromFen(it.fen);
  console.log(`  loose w[${loosePieces(b, 'w')}] b[${loosePieces(b, 'b')}]  hanging w[${hangingPieces(b, 'w')}] b[${hangingPieces(b, 'b')}]`);
  const lines = await e.analyse(it.fen, { depth: Number(process.env.DEPTH ?? 16), multipv: 3 });
  for (const l of lines) {
    const c = new Chess(it.fen);
    const sans = l.pv.slice(0, 6).map((m) => c.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] }).san);
    console.log(`  ${fmtScore(l.score).padStart(7)} ${sanOf(it.fen, l.move).padEnd(6)} ${l.move}  ${sans.join(' ')}`);
  }
  for (const m of it.moves ?? []) {
    if (!isLegal(it.fen, m)) {
      console.log(`  try ${m}: ILLEGAL`);
      continue;
    }
    const [l] = await e.analyse(it.fen, { depth: Number(process.env.DEPTH ?? 16), searchmoves: [m] });
    console.log(`  try ${sanOf(it.fen, m)} ${m}: ${fmtScore(l.score)}  ${l.pv.slice(0, 6).join(' ')}`);
  }
}
e.quit();
process.exit(0);
