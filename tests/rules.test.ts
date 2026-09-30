import { describe, expect, it } from 'vitest';
import {
  attacksFrom,
  boardFromFen,
  hangingPieces,
  isFork,
  loosePieces,
  pinsBy,
  placementFromBoard,
  see,
} from '../src/chess/rules';
import { mapFen, mapSquare, renderText } from '../src/chess/transform';
import { checkRuleClaim, forkSquares } from '../src/content/queries';

describe('rules', () => {
  it('round-trips FEN placement', () => {
    const fen = 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR w KQkq - 2 3';
    expect(placementFromBoard(boardFromFen(fen))).toBe(fen.split(' ')[0]);
  });

  it('computes slider attacks stopping at blockers', () => {
    const b = boardFromFen('8/8/8/3p4/8/1B6/8/4K2k w - - 0 1');
    expect(attacksFrom(b, 'b3').sort()).toEqual(['a2', 'a4', 'c2', 'c4', 'd1', 'd5'].sort());
  });

  it('finds loose pieces (king excluded)', () => {
    const b = boardFromFen('4k3/8/8/3n4/4P3/8/8/R3K3 w - - 0 1');
    expect(loosePieces(b, 'w')).toEqual(['a1', 'e4']);
    expect(loosePieces(b, 'b')).toEqual(['d5']);
  });

  it('counts exchanges with SEE', () => {
    // Pawn takes defended knight: wins 3 - 1 = 2.
    expect(see(boardFromFen('4k3/4p3/3n4/4P3/8/8/8/4K3 w - - 0 1'), 'd6', 'w')).toBe(2);
    // Rook takes pawn defended by pawn: not worth it.
    expect(see(boardFromFen('4k3/8/2p5/3p4/8/8/8/3RK3 w - - 0 1'), 'd5', 'w')).toBe(0);
    // Two knights against a knight defended by a pawn: NxN pxN NxP nets one pawn.
    expect(see(boardFromFen('4k3/8/2p5/3n4/8/2N1N3/8/4K3 w - - 0 1'), 'd5', 'w')).toBe(1);
    expect(hangingPieces(boardFromFen('4k3/8/8/3n4/4P3/8/8/4K3 w - - 0 1'), 'b')).toEqual(['d5']);
  });

  it('detects a knight fork of king and rook', () => {
    const b = boardFromFen('r3k3/8/2N5/8/8/8/8/4K3 b - - 0 1');
    expect(isFork(b, 'c6')).toBe(false); // c6 attacks neither a8 nor e8
    const b2 = boardFromFen('r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1');
    expect(isFork(b2, 'c7')).toBe(true);
  });

  it('a fork on a square the enemy can take for free does not count', () => {
    const b = boardFromFen('rb2k3/2N5/8/8/8/8/8/4K3 b - - 0 1');
    expect(isFork(b, 'c7')).toBe(false);
  });

  it('finds absolute pins', () => {
    expect(pinsBy(boardFromFen('4k3/8/8/1b6/8/3N4/8/5K2 w - - 0 1'), 'b')).toEqual([
      { pinner: 'b5', pinned: 'd3', behind: 'f1', absolute: true },
    ]);
    expect(pinsBy(boardFromFen('4k3/8/8/1b6/8/8/3N4/5K2 w - - 0 1'), 'b')).toEqual([]);
  });

  it('lists fork squares for placement', () => {
    expect(forkSquares('r3k3/8/8/8/8/8/8/4K3 w - - 0 1', { color: 'w', role: 'n' })).toEqual(['c7']);
  });
});

describe('transforms', () => {
  it('flips and mirrors squares and FEN', () => {
    expect(mapSquare('a1', { flip: true, mirror: false })).toBe('a8');
    expect(mapSquare('a1', { flip: false, mirror: true })).toBe('h1');
    const fen = 'r3k3/2N5/8/8/8/8/8/4K3 w - - 0 1';
    expect(mapFen(fen, { flip: true, mirror: false })).toBe('4k3/8/8/8/8/8/2n5/R3K3 b - - 0 1');
  });

  it('renders square and colour tokens', () => {
    expect(renderText('@W knight on @c7 forks the @b king', { flip: true, mirror: true })).toBe(
      'Black knight on f2 forks the white king',
    );
  });

  it('checks rule claims', () => {
    const fen = 'r3k3/2N5/8/8/8/8/8/4K3 b - - 0 1';
    expect(checkRuleClaim(fen, { is: 'fork', sq: 'c7' })).toBe(true);
    expect(checkRuleClaim(fen, { is: 'attacks', from: 'c7', to: ['a8', 'e8'] })).toBe(true);
    expect(checkRuleClaim(fen, { is: 'loose', sq: 'c7' })).toBe(true);
  });
});
