import { BoardView } from '../board/board';
import { attacksFrom, forkTargets, isFork, loosePieces, pinsBy, type Color, type Role, type Square } from '../chess/rules';
import type { SandboxStep } from '../content/types';
import { h } from '../ui/dom';
import { line, prose } from '../ui/text';
import { layout, type Mount } from './common';

const TRAY: Role[] = ['k', 'q', 'r', 'b', 'n', 'p'];
const GLYPH: Record<Color, Record<Role, string>> = {
  w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};

/** Free board: move or drop pieces, see attacks, loose pieces, pins and forks. */
export function mountSandboxBoard(L: { boardSlot: HTMLElement; body: HTMLElement }, fen: string, palette: boolean) {
  let tool: { color: Color; role: Role } | 'erase' | null = null;
  let focus: Square | null = null;
  const opts = { loose: true, pins: true };
  const readout = h('p', { class: 'readout', 'aria-live': 'polite' });

  const board = new BoardView({
    fen,
    mode: 'free',
    onChange: () => setTimeout(paint, 0),
    // Tapping a square places the tray piece, erases, or focuses a piece.
    onTap: (sq) =>
      setTimeout(() => {
        if (tool === 'erase') {
          board.setPiece(sq, null);
          board.unselect();
        } else if (tool) {
          board.setPiece(sq, tool);
          board.unselect();
        }
        focus = sq;
        paint();
      }, 0),
  });
  L.boardSlot.appendChild(board.el);

  function paint() {
    const b = board.pieces();
    const marks = new Map<Square, string>();
    if (opts.loose) loosePieces(b).forEach((s) => marks.set(s, 'mark-loose'));
    const arrows: { from: Square; to: Square; brush?: 'green' | 'red' | 'blue' | 'yellow' | 'paleGrey' }[] = [];
    const circles: { sq: Square; brush?: string }[] = [];
    if (opts.pins) {
      for (const c of ['w', 'b'] as Color[]) {
        for (const p of pinsBy(b, c)) arrows.push({ from: p.pinner, to: p.behind, brush: p.absolute ? 'red' : 'yellow' });
      }
    }
    const f = focus && b.has(focus) ? focus : null;
    const parts: string[] = [];
    if (f) {
      const p = b.get(f)!;
      const att = attacksFrom(b, f);
      att.forEach((s) => circles.push({ sq: s, brush: 'paleBlue' }));
      const targets = forkTargets(b, f);
      targets.forEach((s) => circles.push({ sq: s, brush: 'red' }));
      parts.push(`The piece on ${f} attacks ${att.length} square${att.length === 1 ? '' : 's'}.`);
      if (targets.length) parts.push(`Real targets: ${targets.join(', ')}.`);
      if (p.role !== 'k' && isFork(b, f)) parts.push('That is a fork.');
    }
    const loose = loosePieces(b);
    parts.push(loose.length ? `Loose: ${loose.join(', ')}.` : 'Nothing is loose.');
    readout.textContent = parts.join(' ');
    board.setMarks(marks);
    board.setArrows(arrows, circles);
  }

  const toggles = h(
    'div',
    { class: 'toggles' },
    toggle('Ring loose pieces', opts.loose, (v) => ((opts.loose = v), paint())),
    toggle('Show pins', opts.pins, (v) => ((opts.pins = v), paint())),
  );
  L.body.append(readout, toggles);

  if (palette) {
    const trayEl = h('div', { class: 'tray', role: 'toolbar', 'aria-label': 'Pieces to place' });
    const buttons: HTMLButtonElement[] = [];
    const select = (btn: HTMLButtonElement, t: typeof tool) => {
      const same = btn.classList.contains('active');
      buttons.forEach((b) => b.classList.remove('active'));
      tool = same ? null : t;
      if (!same) btn.classList.add('active');
    };
    for (const c of ['w', 'b'] as Color[]) {
      for (const r of TRAY) {
        const btn = h('button', { class: 'tray-piece', type: 'button', 'aria-label': `${c === 'w' ? 'White' : 'Black'} ${r}` }, GLYPH[c][r]) as HTMLButtonElement;
        btn.addEventListener('click', () => select(btn, { color: c, role: r }));
        btn.addEventListener('pointerdown', (e) => {
          if (e.pointerType === 'mouse') board.dragNew({ color: c, role: r }, e);
        });
        buttons.push(btn);
        trayEl.appendChild(btn);
      }
    }
    const eraser = h('button', { class: 'tray-piece', type: 'button', 'aria-label': 'Remove a piece' }, '✕') as HTMLButtonElement;
    eraser.addEventListener('click', () => select(eraser, 'erase'));
    buttons.push(eraser);
    trayEl.appendChild(eraser);
    L.body.append(
      h('p', { class: 'muted small' }, 'Pick a piece, then tap a square to place it. Drag a piece off the board to remove it.'),
      trayEl,
    );
  }
  const reset = h('button', { class: 'btn btn-quiet', type: 'button' }, 'Reset board');
  reset.addEventListener('click', () => {
    board.setPosition(fen);
    focus = null;
    paint();
  });
  L.body.appendChild(reset);
  paint();
  return board;
}

function toggle(label: string, on: boolean, change: (v: boolean) => void) {
  const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
  input.checked = on;
  input.addEventListener('change', () => change(input.checked));
  return h('label', { class: 'toggle' }, input, ' ', label);
}

export const mountSandbox: Mount<SandboxStep> = (root, step, ctx) => {
  const L = layout(root);
  L.prompt.appendChild(h('p', { class: 'lead' }, line(step.prompt, ctx.t)));
  if (step.text) L.prompt.appendChild(prose(step.text, ctx.t));
  const board = mountSandboxBoard(L, step.fen, !!step.palette);
  ctx.done({ tries: 1, hints: 0 });
  return () => board.destroy();
};
