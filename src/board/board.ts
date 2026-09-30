// Thin wrapper over chessground: tap, move, and free-edit modes, square
// marks, and arrows. Rules live elsewhere; this only draws and reports input.

import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { DrawShape } from 'chessground/draw';
import type { Key, Piece as CgPiece } from 'chessground/types';
import { Chess, SQUARES } from 'chess.js';
import type { Board, Color, Square } from '../chess/rules';
import { h, prefersReducedMotion } from '../ui/dom';
import { settings } from '../progress/store';

export type Mode = 'view' | 'move' | 'tap' | 'free';

export interface BoardOptions {
  fen: string;
  orientation?: Color;
  mode?: Mode;
  onMove?: (uci: string) => void;
  onTap?: (sq: Square) => void;
  onChange?: () => void;
  small?: boolean;
}

export type Arrow = { from: Square; to: Square; brush?: 'green' | 'red' | 'blue' | 'yellow' | 'paleGrey' };

const toColor = (c: Color) => (c === 'w' ? 'white' : 'black');

export function legalDests(fen: string): Map<Key, Key[]> {
  const c = new Chess(fen);
  const dests = new Map<Key, Key[]>();
  for (const s of SQUARES) {
    const ms = c.moves({ square: s, verbose: true });
    if (ms.length) dests.set(s as Key, ms.map((m) => m.to as Key));
  }
  return dests;
}

export class BoardView {
  readonly el: HTMLElement;
  private cg: Api;
  private opts: BoardOptions;
  private marks = new Map<Key, string>();
  private arrows: DrawShape[] = [];

  constructor(opts: BoardOptions) {
    this.opts = opts;
    const inner = h('div', { class: 'cg-host' });
    this.el = h('div', { class: `board ${opts.small ? 'board-small' : ''}` }, inner);
    this.cg = Chessground(inner, {
      fen: opts.fen,
      orientation: toColor(opts.orientation ?? 'w'),
      coordinates: settings().coordinates && !opts.small,
      animation: { enabled: !prefersReducedMotion(), duration: 180 },
      highlight: { lastMove: true, check: true },
      premovable: { enabled: false },
      drawable: { enabled: false, visible: true },
      blockTouchScroll: false,
      events: {
        select: (key) => {
          if (this.opts.mode === 'tap' || this.opts.mode === 'free') this.opts.onTap?.(key);
        },
        change: () => this.opts.onChange?.(),
      },
    });
    this.setMode(opts.mode ?? 'view', opts.fen);
  }

  setMode(mode: Mode, fen = this.opts.fen) {
    this.opts.mode = mode;
    this.opts.fen = fen;
    const turn = (fen.split(' ')[1] ?? 'w') as Color;
    if (mode === 'move') {
      this.cg.set({
        turnColor: toColor(turn),
        viewOnly: false,
        selectable: { enabled: true },
        draggable: { enabled: true, showGhost: true, deleteOnDropOff: false },
        movable: {
          free: false,
          color: toColor(turn),
          dests: legalDests(fen),
          showDests: true,
          events: { after: (o, d) => this.opts.onMove?.(o + d + this.promo(o, d)) },
        },
      });
    } else if (mode === 'free') {
      this.cg.set({
        viewOnly: false,
        selectable: { enabled: true },
        draggable: { enabled: true, deleteOnDropOff: true },
        movable: { free: true, color: 'both', dests: undefined, showDests: false, events: { after: undefined } },
      });
    } else {
      // 'tap' and 'view': no moving. Tap mode reports selections.
      this.cg.set({
        viewOnly: false,
        selectable: { enabled: mode === 'tap' },
        draggable: { enabled: false },
        movable: { free: false, color: undefined, dests: new Map(), events: { after: undefined } },
      });
    }
  }

  private promo(orig: Key, dest: Key): string {
    const p = this.cg.state.pieces.get(dest);
    if (p?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1')) {
      // Auto-queen for v1; underpromotion never matters in these lessons.
      void orig;
      return 'q';
    }
    return '';
  }

  setPosition(fen: string, lastMove?: [Square, Square]) {
    const turn = (fen.split(' ')[1] ?? 'w') as Color;
    this.opts.fen = fen;
    this.cg.set({
      fen,
      turnColor: toColor(turn),
      lastMove: lastMove as Key[] | undefined,
      check: new Chess(fen).inCheck() ? toColor(turn) : false,
    });
    if (this.opts.mode === 'move') this.setMode('move', fen);
  }

  /** Animate a move already known to be legal, then settle on `fenAfter`. */
  playMove(uci: string, fenAfter: string) {
    this.cg.move(uci.slice(0, 2) as Key, uci.slice(2, 4) as Key);
    this.setPosition(fenAfter, [uci.slice(0, 2), uci.slice(2, 4)]);
  }

  setOrientation(c: Color) {
    this.cg.set({ orientation: toColor(c) });
  }

  /** Square classes: 'mark-good', 'mark-bad', 'mark-tap', 'mark-loose', 'mark-hint', ... */
  setMarks(marks: Map<Square, string> | Square[], cls = 'mark-tap') {
    this.marks = Array.isArray(marks) ? new Map(marks.map((s) => [s as Key, cls])) : (marks as Map<Key, string>);
    this.cg.set({ highlight: { custom: this.marks } });
    this.cg.redrawAll();
  }

  setArrows(arrows: Arrow[], circles: { sq: Square; brush?: string }[] = []) {
    this.arrows = [
      ...arrows.map((a) => ({ orig: a.from as Key, dest: a.to as Key, brush: a.brush ?? 'green' })),
      ...circles.map((c) => ({ orig: c.sq as Key, brush: c.brush ?? 'green' })),
    ];
    // Defer one frame so the board has real dimensions before SVG is drawn.
    const shapes = this.arrows;
    requestAnimationFrame(() => {
      if (this.arrows === shapes) this.cg.setAutoShapes(shapes);
    });
  }

  clearAnnotations() {
    this.setMarks([]);
    this.setArrows([]);
  }

  /** Current pieces as a rules board (for the sandbox). */
  pieces(): Board {
    const out: Board = new Map();
    for (const [k, p] of this.cg.state.pieces) {
      out.set(k, { color: p.color === 'white' ? 'w' : 'b', role: roleCode(p.role) });
    }
    return out;
  }

  selected(): Square | undefined {
    return this.cg.state.selected;
  }

  setPiece(sq: Square, piece: { color: Color; role: string } | null) {
    const diff = new Map<Key, CgPiece | undefined>();
    diff.set(sq as Key, piece ? { color: toColor(piece.color), role: roleName(piece.role) } : undefined);
    this.cg.setPieces(diff);
  }

  dragNew(piece: { color: Color; role: string }, e: PointerEvent | MouseEvent | TouchEvent) {
    this.cg.dragNewPiece({ color: toColor(piece.color), role: roleName(piece.role) }, e as never, true);
  }

  unselect() {
    this.cg.selectSquare(null);
  }

  destroy() {
    this.cg.destroy();
  }
}

const ROLE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as const;
function roleName(r: string) {
  return ROLE_NAMES[r as keyof typeof ROLE_NAMES];
}
function roleCode(r: string): 'p' | 'n' | 'b' | 'r' | 'q' | 'k' {
  const e = Object.entries(ROLE_NAMES).find(([, v]) => v === r);
  return (e?.[0] ?? 'p') as 'p';
}
