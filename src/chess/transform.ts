// Colour-flip and mirror transforms so a position can be shown fresh without
// changing what is true about it. Lesson text marks squares and colours with
// tokens (see renderText) so the words follow the board.

import { boardFromFen, placementFromBoard, type Board, type Square } from './rules';

export interface Transform {
  flip: boolean; // swap colours and ranks (White's idea becomes Black's)
  mirror: boolean; // swap the a-file and h-file sides
}

export const IDENTITY: Transform = { flip: false, mirror: false };

export function isIdentity(t: Transform): boolean {
  return !t.flip && !t.mirror;
}

export function mapSquare(sq: Square, t: Transform): Square {
  let f = sq.charCodeAt(0) - 97;
  let r = sq.charCodeAt(1) - 49;
  if (t.mirror) f = 7 - f;
  if (t.flip) r = 7 - r;
  return String.fromCharCode(97 + f) + String.fromCharCode(49 + r);
}

export function mapUci(uci: string, t: Transform): string {
  return mapSquare(uci.slice(0, 2), t) + mapSquare(uci.slice(2, 4), t) + uci.slice(4);
}

export function mapColor<C extends 'w' | 'b'>(c: C, t: Transform): 'w' | 'b' {
  return t.flip ? (c === 'w' ? 'b' : 'w') : c;
}

/** A position can be mirrored only when castling is off the table. */
export function canMirror(fen: string): boolean {
  const castling = fen.split(/\s+/)[2] ?? '-';
  return castling === '-';
}

export function mapFen(fen: string, t: Transform): string {
  if (isIdentity(t)) return fen;
  const parts = fen.trim().split(/\s+/);
  const board = boardFromFen(fen);
  const out: Board = new Map();
  for (const [sq, p] of board) {
    out.set(mapSquare(sq, t), { color: mapColor(p.color, t), role: p.role });
  }
  const turn = mapColor((parts[1] ?? 'w') as 'w' | 'b', t);
  let castling = parts[2] ?? '-';
  if (t.flip && castling !== '-') {
    castling = castling
      .split('')
      .map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()))
      .sort((a, b) => 'KQkq'.indexOf(a) - 'KQkq'.indexOf(b))
      .join('');
  }
  const ep = parts[3] && parts[3] !== '-' ? mapSquare(parts[3], t) : '-';
  return [placementFromBoard(out), turn, castling, ep, parts[4] ?? '0', parts[5] ?? '1'].join(' ');
}

const COLOR_WORDS: Record<string, [string, string]> = {
  W: ['White', 'Black'],
  B: ['Black', 'White'],
  w: ['white', 'black'],
  b: ['black', 'white'],
};

/**
 * Render lesson text under a transform. Tokens:
 *   @e4          a square, remapped
 *   @W @B @w @b  a side name (capitalised or not), swapped on colour flip
 * Everything else passes through unchanged.
 */
export function renderText(text: string, t: Transform): string {
  return text.replace(/@([a-h][1-8]|[WBwb](?![a-z]))/g, (_, tok: string) => {
    if (tok.length === 2) return mapSquare(tok, t);
    const [same, other] = COLOR_WORDS[tok];
    return t.flip ? other : same;
  });
}
