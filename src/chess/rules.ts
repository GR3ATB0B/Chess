// Rules-based position facts: attacks, defenders, loose and hanging pieces,
// pins, and forks. Pure functions over a raw board so they work on positions
// that are not legal games (the sandbox) as well as on lesson positions.
//
// These functions are the single source of truth for "loose", "hanging",
// "threat" and "fork". The build-time verifier and the app both call them,
// so a lesson tag can never disagree with what the learner is shown.

export type Color = 'w' | 'b';
export type Role = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export interface Piece {
  color: Color;
  role: Role;
}
export type Square = string; // "a1".."h8"
export type Board = Map<Square, Piece>;

export const FILES = 'abcdefgh';
export const RANKS = '12345678';
export const ALL_SQUARES: Square[] = [];
for (const r of RANKS) for (const f of FILES) ALL_SQUARES.push(f + r);

// Classical values. The king has no trade value; SEE uses a large number so a
// king only ever captures last.
export const VALUE: Record<Role, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

export const ROLE_NAME: Record<Role, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

export const opposite = (c: Color): Color => (c === 'w' ? 'b' : 'w');

export function isSquare(s: string): boolean {
  return /^[a-h][1-8]$/.test(s);
}

function fr(sq: Square): [number, number] {
  return [sq.charCodeAt(0) - 97, sq.charCodeAt(1) - 49];
}
function sqAt(f: number, r: number): Square | undefined {
  if (f < 0 || f > 7 || r < 0 || r > 7) return undefined;
  return FILES[f] + RANKS[r];
}

/** Parse the piece-placement part of a FEN (the rest is ignored). */
export function boardFromFen(fen: string): Board {
  const board: Board = new Map();
  const placement = fen.trim().split(/\s+/)[0];
  const rows = placement.split('/');
  if (rows.length !== 8) throw new Error(`bad FEN placement: ${fen}`);
  rows.forEach((row, i) => {
    const r = 7 - i;
    let f = 0;
    for (const ch of row) {
      if (/[1-8]/.test(ch)) {
        f += Number(ch);
      } else {
        const lower = ch.toLowerCase() as Role;
        if (!'pnbrqk'.includes(lower)) throw new Error(`bad FEN piece ${ch}`);
        const sq = sqAt(f, r);
        if (!sq) throw new Error(`bad FEN row ${row}`);
        board.set(sq, { color: ch === lower ? 'b' : 'w', role: lower });
        f++;
      }
    }
    if (f !== 8) throw new Error(`bad FEN row ${row}`);
  });
  return board;
}

export function placementFromBoard(board: Board): string {
  const rows: string[] = [];
  for (let r = 7; r >= 0; r--) {
    let row = '';
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = board.get(sqAt(f, r)!);
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += p.color === 'w' ? p.role.toUpperCase() : p.role;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  return rows.join('/');
}

export function turnOf(fen: string): Color {
  return (fen.split(/\s+/)[1] ?? 'w') === 'b' ? 'b' : 'w';
}

const KNIGHT_D = [
  [1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2],
];
const KING_D = [
  [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1],
];
const ROOK_D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const BISHOP_D = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function rays(role: Role): number[][] {
  if (role === 'r') return ROOK_D;
  if (role === 'b') return BISHOP_D;
  if (role === 'q') return [...ROOK_D, ...BISHOP_D];
  return [];
}

/**
 * Squares a piece standing on `from` attacks (controls). Sliders stop at the
 * first piece of either colour, and that square is included. Pawns attack
 * diagonally forward only.
 */
export function attacksFrom(board: Board, from: Square, piece = board.get(from)): Square[] {
  if (!piece) return [];
  const [f, r] = fr(from);
  const out: Square[] = [];
  const step = (d: number[][]) => {
    for (const [df, dr] of d) {
      const s = sqAt(f + df, r + dr);
      if (s) out.push(s);
    }
  };
  switch (piece.role) {
    case 'p': {
      const dir = piece.color === 'w' ? 1 : -1;
      step([[1, dir], [-1, dir]]);
      break;
    }
    case 'n':
      step(KNIGHT_D);
      break;
    case 'k':
      step(KING_D);
      break;
    default:
      for (const [df, dr] of rays(piece.role)) {
        let s = sqAt(f + df, r + dr);
        let k = 1;
        while (s) {
          out.push(s);
          if (board.has(s)) break;
          k++;
          s = sqAt(f + df * k, r + dr * k);
        }
      }
  }
  return out;
}

/** Squares of `by`-coloured pieces that attack `target`. */
export function attackersOf(board: Board, target: Square, by: Color): Square[] {
  const out: Square[] = [];
  for (const [sq, p] of board) {
    if (p.color !== by || sq === target) continue;
    if (attacksFrom(board, sq, p).includes(target)) out.push(sq);
  }
  return out.sort();
}

/** Own pieces that protect the piece on `sq`. Empty if the square is empty. */
export function defendersOf(board: Board, sq: Square): Square[] {
  const p = board.get(sq);
  if (!p) return [];
  return attackersOf(board, sq, p.color);
}

/**
 * Loose: a piece (not the king) that no piece of its own side protects.
 * Whether it is attacked right now does not matter. Loose pieces are the raw
 * material of almost every tactic.
 */
export function loosePieces(board: Board, color?: Color): Square[] {
  const out: Square[] = [];
  for (const [sq, p] of board) {
    if (p.role === 'k') continue;
    if (color && p.color !== color) continue;
    if (defendersOf(board, sq).length === 0) out.push(sq);
  }
  return out.sort();
}

/**
 * Static exchange evaluation: material (in pawns) that side `by` gains by
 * starting a capture sequence on `sq`, with both sides always recapturing
 * with their least valuable attacker and free to stop when continuing loses.
 * Returns 0 when `by` cannot or should not capture. Geometric only: pins
 * and checks are ignored, which is the usual convention for counting.
 */
export function see(board: Board, sq: Square, by: Color): number {
  const target = board.get(sq);
  if (!target || target.color === by) return 0;
  const b: Board = new Map(board);
  const gains: number[] = [];
  let side = by;
  let onSquare = VALUE[target.role];
  let depth = 0;
  for (;;) {
    const attackers = attackersOf(b, sq, side);
    if (attackers.length === 0) break;
    attackers.sort((x, y) => VALUE[b.get(x)!.role] - VALUE[b.get(y)!.role]);
    const from = attackers[0];
    const mover = b.get(from)!;
    // A king may not capture into a square the other side still attacks.
    // Kings sort last, so this only happens when nothing else can capture.
    if (mover.role === 'k' && attackersOf(b, sq, opposite(side)).length > 0) break;
    gains[depth] = onSquare - (depth > 0 ? gains[depth - 1] : 0);
    onSquare = VALUE[mover.role];
    b.delete(from);
    b.set(sq, mover);
    side = opposite(side);
    depth++;
  }
  // Negamax the gain list back so each side may decline to continue.
  for (let d = depth - 1; d > 0; d--) {
    gains[d - 1] = -Math.max(-gains[d - 1], gains[d]);
  }
  return depth === 0 ? 0 : Math.max(0, gains[0]);
}

/**
 * Hanging: a piece of `color` that the other side can win material from by
 * capturing, counted with SEE. These are the opponent's threats against
 * `color` if the opponent were to move now.
 */
export function hangingPieces(board: Board, color: Color): Square[] {
  const out: Square[] = [];
  for (const [sq, p] of board) {
    if (p.color !== color || p.role === 'k') continue;
    if (see(board, sq, opposite(color)) > 0) out.push(sq);
  }
  return out.sort();
}

export function kingSquare(board: Board, color: Color): Square | undefined {
  for (const [sq, p] of board) if (p.color === color && p.role === 'k') return sq;
  return undefined;
}

export interface Pin {
  pinner: Square;
  pinned: Square;
  behind: Square;
  absolute: boolean; // true when the piece behind is the king
}

/**
 * Pins by sliders of `by` against the other side: the first enemy piece on a
 * ray is pinned when the next piece behind it is the enemy king (absolute) or
 * a more valuable enemy piece (relative).
 */
export function pinsBy(board: Board, by: Color): Pin[] {
  const out: Pin[] = [];
  for (const [sq, p] of board) {
    if (p.color !== by) continue;
    const [f, r] = fr(sq);
    for (const [df, dr] of rays(p.role)) {
      let first: Square | undefined;
      for (let k = 1; ; k++) {
        const s = sqAt(f + df * k, r + dr * k);
        if (!s) break;
        const q = board.get(s);
        if (!q) continue;
        if (q.color === by) break;
        if (!first) {
          if (q.role === 'k') break;
          first = s;
          continue;
        }
        const pinned = board.get(first)!;
        if (q.role === 'k' || VALUE[q.role] > VALUE[pinned.role]) {
          out.push({ pinner: sq, pinned: first, behind: s, absolute: q.role === 'k' });
        }
        break;
      }
    }
  }
  return out;
}

/**
 * Targets a piece on `sq` really threatens: the enemy king, any enemy piece
 * worth more than the attacker, and any enemy piece it could win by capturing
 * (checked with SEE on a board where the capture is the first move).
 */
export function forkTargets(board: Board, sq: Square): Square[] {
  const p = board.get(sq);
  if (!p) return [];
  const out: Square[] = [];
  for (const t of attacksFrom(board, sq, p)) {
    const q = board.get(t);
    if (!q || q.color === p.color) continue;
    if (q.role === 'k' || VALUE[q.role] > VALUE[p.role]) {
      out.push(t);
      continue;
    }
    if (captureGain(board, sq, t) > 0) out.push(t);
  }
  return out.sort();
}

/** Material gained by capturing from `from` onto `to`, then letting SEE run. */
export function captureGain(board: Board, from: Square, to: Square): number {
  const p = board.get(from);
  const q = board.get(to);
  if (!p || !q || p.color === q.color) return 0;
  const b: Board = new Map(board);
  b.delete(from);
  b.set(to, p);
  return VALUE[q.role] - see(b, to, opposite(p.color));
}

/**
 * A fork: the piece on `sq` threatens two or more targets at once, and the
 * forking piece itself cannot simply be taken for a profit.
 */
export function isFork(board: Board, sq: Square): boolean {
  const p = board.get(sq);
  if (!p) return false;
  if (forkTargets(board, sq).length < 2) return false;
  return see(board, sq, opposite(p.color)) <= 0;
}

/** Total material per side, in pawns (kings excluded). */
export function material(board: Board): Record<Color, number> {
  const m = { w: 0, b: 0 };
  for (const p of board.values()) if (p.role !== 'k') m[p.color] += VALUE[p.role];
  return m;
}
