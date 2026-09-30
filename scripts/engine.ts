// Minimal UCI driver for Stockfish.js under Node, used by the verifier.
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export interface Line {
  move: string;
  /** Centipawns from the side to move. Mate in n becomes ±(100000 - n). */
  score: number;
  mate: number | null;
  pv: string[];
}

interface SfEngine {
  listener?: (line: string) => void;
  sendCommand(cmd: string): void;
}

export const MATE = 100000;

export class Engine {
  private sf!: SfEngine;
  private waiter: ((line: string) => void) | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  static async start(flavor = 'single'): Promise<Engine> {
    const init = require('stockfish') as (flavor: string) => Promise<SfEngine>;
    const e = new Engine();
    e.sf = await init(flavor);
    e.sf.listener = (line) => e.waiter?.(line);
    await e.cmdUntil('uci', (l) => l === 'uciok');
    await e.cmdUntil('isready', (l) => l === 'readyok');
    return e;
  }

  private cmdUntil(cmd: string, done: (line: string) => boolean, onLine?: (l: string) => void) {
    return new Promise<void>((resolve) => {
      this.waiter = (line) => {
        onLine?.(line);
        if (done(line)) {
          this.waiter = null;
          resolve();
        }
      };
      this.sf.sendCommand(cmd);
    });
  }

  /**
   * Fixed-depth search from a fresh hash so results are reproducible.
   * Returns MultiPV lines sorted best first.
   */
  analyse(fen: string, opts: { depth: number; multipv?: number; searchmoves?: string[] }): Promise<Line[]> {
    const run = async () => {
      const multipv = opts.multipv ?? 1;
      this.sf.sendCommand('ucinewgame');
      this.sf.sendCommand(`setoption name MultiPV value ${multipv}`);
      await this.cmdUntil('isready', (l) => l === 'readyok');
      this.sf.sendCommand(`position fen ${fen}`);
      const lines = new Map<number, Line>();
      const sm = opts.searchmoves?.length ? ` searchmoves ${opts.searchmoves.join(' ')}` : '';
      await this.cmdUntil(
        `go depth ${opts.depth}${sm}`,
        (l) => l.startsWith('bestmove'),
        (l) => {
          if (!l.startsWith('info') || !l.includes(' pv ') || l.includes('bound')) return;
          const m = /multipv (\d+).*score (cp|mate) (-?\d+).* pv (.+)$/.exec(l);
          if (!m) return;
          const n = Number(m[2] === 'mate' ? m[3] : 0);
          const score = m[2] === 'cp' ? Number(m[3]) : n > 0 ? MATE - n : -MATE - n;
          const pv = m[4].trim().split(/\s+/);
          lines.set(Number(m[1]), { move: pv[0], score, mate: m[2] === 'mate' ? n : null, pv });
        },
      );
      return [...lines.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => undefined);
    return p;
  }

  /** Score of one move from the mover's point of view. */
  async moveScore(fen: string, move: string, depth: number): Promise<number> {
    const [line] = await this.analyse(fen, { depth, searchmoves: [move] });
    if (!line) throw new Error(`no engine line for ${move} in ${fen}`);
    return line.score;
  }

  quit() {
    this.sf.sendCommand('quit');
  }
}

export function fmtScore(s: number): string {
  if (s >= MATE - 1000) return `#${MATE - s}`;
  if (s <= -MATE + 1000) return `#-${MATE + s}`;
  return (s > 0 ? '+' : '') + (s / 100).toFixed(2);
}
