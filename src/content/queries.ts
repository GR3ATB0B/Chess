// Evaluates tap queries and rules-based claims. Shared by the app (to check a
// learner's taps live) and the verifier (to check hand-written answers).

import { Chess } from 'chess.js';
import {
  attackersOf,
  attacksFrom,
  boardFromFen,
  defendersOf,
  forkTargets,
  hangingPieces,
  isFork,
  loosePieces,
  see,
  VALUE,
  ALL_SQUARES,
  type Board,
  type Color,
  type Role,
  type Square,
} from '../chess/rules';
import type { Claim, TapQuery, Uci } from './types';

export function computeTap(fen: string, q: TapQuery): Square[] {
  const board = boardFromFen(fen);
  return tapOnBoard(board, q);
}

export function tapOnBoard(board: Board, q: TapQuery): Square[] {
  switch (q.what) {
    case 'loose':
      return loosePieces(board, q.color);
    case 'hanging':
      return hangingPieces(board, q.color);
    case 'attacks':
      return attacksFrom(board, q.from).sort();
    case 'attackers':
      return attackersOf(board, q.sq, q.color);
    case 'defenders':
      return defendersOf(board, q.sq);
    case 'fork-targets':
      return forkTargets(board, q.sq);
  }
}

export function sameSet(a: string[], b: string[]): boolean {
  const x = [...new Set(a)].sort();
  const y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

export function uciToMove(uci: Uci) {
  return { from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] };
}

/** Plays UCI moves from `fen`; throws on an illegal move. */
export function playLine(fen: string, moves: Uci[]): string {
  const c = new Chess(fen);
  for (const m of moves) {
    try {
      c.move(uciToMove(m));
    } catch {
      throw new Error(`illegal move ${m} in ${c.fen()}`);
    }
  }
  return c.fen();
}

export function isLegal(fen: string, uci: Uci): boolean {
  try {
    new Chess(fen).move(uciToMove(uci));
    return true;
  } catch {
    return false;
  }
}

export function sanOf(fen: string, uci: Uci): string {
  return new Chess(fen).move(uciToMove(uci)).san;
}

export const ENGINE_CLAIMS = new Set(['wins', 'not-wins', 'best', 'not-best', 'mate']);

/**
 * Checks a rules-based claim. Returns null for engine claims, which only the
 * build-time verifier can evaluate.
 */
export function checkRuleClaim(fen: string, claim: Claim): boolean | null {
  if (ENGINE_CLAIMS.has(claim.is)) return null;
  const at = claim.after?.length ? playLine(fen, claim.after) : fen;
  const board = boardFromFen(at);
  switch (claim.is) {
    case 'loose':
      return board.has(claim.sq) && loosePieces(board).includes(claim.sq);
    case 'not-loose':
      return board.has(claim.sq) && !loosePieces(board).includes(claim.sq);
    case 'hanging': {
      const p = board.get(claim.sq);
      return !!p && hangingPieces(board, p.color).includes(claim.sq);
    }
    case 'not-hanging': {
      const p = board.get(claim.sq);
      return !!p && !hangingPieces(board, p.color).includes(claim.sq);
    }
    case 'defenders':
      return defendersOf(board, claim.sq).length === claim.n;
    case 'attackers':
      return attackersOf(board, claim.sq, claim.by).length === claim.n;
    case 'attacks': {
      const a = attacksFrom(board, claim.from);
      return board.has(claim.from) && claim.to.every((s) => a.includes(s));
    }
    case 'not-attacks': {
      const a = attacksFrom(board, claim.from);
      return board.has(claim.from) && claim.to.every((s) => !a.includes(s));
    }
    case 'fork':
      return isFork(board, claim.sq);
    case 'not-fork':
      return !isFork(board, claim.sq);
    case 'see':
      return see(board, claim.sq, claim.by) === claim.gain;
    case 'check': {
      if (!isLegal(at, claim.move)) return false;
      return new Chess(playLine(at, [claim.move])).inCheck();
    }
    case 'legal':
      return isLegal(at, claim.move);
    case 'illegal':
      return !isLegal(at, claim.move);
    case 'value':
      return VALUE[claim.role] === claim.n;
    default:
      return null;
  }
}

/** Empty squares where placing `place` creates a fork (see rules.isFork). */
export function forkSquares(fen: string, place: { color: Color; role: Role }): Square[] {
  const board = boardFromFen(fen);
  const out: Square[] = [];
  for (const sq of ALL_SQUARES) {
    if (board.has(sq)) continue;
    const b = new Map(board);
    b.set(sq, { ...place });
    if (isFork(b, sq)) out.push(sq);
  }
  return out;
}
