// Author's helper: print rules facts and engine lines for a position.
//   npx tsx scripts/probe.ts "<fen>" [move ...]
import { Chess } from 'chess.js';
import { boardFromFen, hangingPieces, loosePieces, pinsBy } from '../src/chess/rules';
import { forkSquares, playLine, sanOf } from '../src/content/queries';
import { Engine, fmtScore } from './engine';

const [fen0, ...moves] = process.argv.slice(2);
const fen = moves.length ? playLine(fen0, moves) : fen0;
const c = new Chess(fen);
console.log(c.ascii());
console.log('fen', fen);
const b = boardFromFen(fen);
console.log('loose  w', loosePieces(b, 'w').join(' '), '| b', loosePieces(b, 'b').join(' '));
console.log('hanging w', hangingPieces(b, 'w').join(' '), '| b', hangingPieces(b, 'b').join(' '));
console.log('pins by w', JSON.stringify(pinsBy(b, 'w')), 'by b', JSON.stringify(pinsBy(b, 'b')));
const side = c.turn();
console.log('knight fork squares for side to move:', forkSquares(fen, { color: side, role: 'n' }).join(' '));
const e = await Engine.start('single');
const lines = await e.analyse(fen, { depth: Number(process.env.DEPTH ?? 18), multipv: 4 });
for (const l of lines) console.log(fmtScore(l.score).padStart(7), sanOf(fen, l.move).padEnd(7), l.pv.slice(0, 8).join(' '));
e.quit();
process.exit(0);
