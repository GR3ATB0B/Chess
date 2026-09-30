// Stockfish (lite, single-threaded WASM) in a Web Worker. Loaded lazily the
// first time a lesson needs it, served from our own origin, and cached by the
// service worker for offline use.

export interface EngineLine {
  move: string;
  /** Centipawns from the side to move; mate in n is ±(100000 - n). */
  score: number;
  pv: string[];
}

const MATE = 100000;
let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let queue: Promise<unknown> = Promise.resolve();
let onLine: ((l: string) => void) | null = null;

function start(): Promise<void> {
  if (ready) return ready;
  ready = new Promise((resolve, reject) => {
    try {
      worker = new Worker(`${import.meta.env.BASE_URL}engine/stockfish-19-lite-single.js`);
    } catch (e) {
      reject(e);
      return;
    }
    worker.onmessage = (e: MessageEvent) => onLine?.(String(e.data));
    worker.onerror = (e) => reject(e);
    onLine = (l) => {
      if (l === 'uciok') worker!.postMessage('isready');
      if (l === 'readyok') {
        onLine = null;
        resolve();
      }
    };
    worker.postMessage('uci');
  });
  return ready;
}

/** Search a position. Requests are queued so only one search runs at a time. */
export function analyse(fen: string, opts: { movetime?: number; depth?: number; searchmoves?: string[] } = {}): Promise<EngineLine> {
  const run = async (): Promise<EngineLine> => {
    await start();
    return new Promise((resolve) => {
      let last: EngineLine | null = null;
      onLine = (l) => {
        if (l.startsWith('info') && l.includes(' pv ') && !l.includes('bound')) {
          const m = /score (cp|mate) (-?\d+).* pv (.+)$/.exec(l);
          if (m) {
            const n = Number(m[2]);
            const score = m[1] === 'cp' ? n : n > 0 ? MATE - n : -MATE - n;
            const pv = m[3].trim().split(/\s+/);
            last = { move: pv[0], score, pv };
          }
        } else if (l.startsWith('bestmove')) {
          onLine = null;
          const best = l.split(/\s+/)[1];
          resolve(last ?? { move: best, score: 0, pv: [best] });
        }
      };
      worker!.postMessage('ucinewgame');
      worker!.postMessage(`position fen ${fen}`);
      const sm = opts.searchmoves?.length ? ` searchmoves ${opts.searchmoves.join(' ')}` : '';
      const limit = opts.depth ? `depth ${opts.depth}` : `movetime ${opts.movetime ?? 800}`;
      worker!.postMessage(`go ${limit}${sm}`);
    });
  };
  const p = queue.then(run, run);
  queue = p.catch(() => undefined);
  return p;
}

export function isMate(score: number) {
  return Math.abs(score) > MATE - 1000;
}

/** Plain-language description of an evaluation for the side that just moved. */
export function describeScore(scoreForMover: number): string {
  if (isMate(scoreForMover)) return scoreForMover > 0 ? 'leads to a forced mate' : 'allows a forced mate';
  const p = scoreForMover / 100;
  if (p >= 2) return 'wins material';
  if (p >= 0.7) return 'keeps a clear advantage';
  if (p > -0.7) return 'keeps the game roughly level';
  if (p > -2) return 'gives up a clear advantage';
  return 'loses material';
}
