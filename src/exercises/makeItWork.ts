import { BoardView } from '../board/board';
import { boardFromFen, forkTargets, isFork, attackersOf, opposite, ROLE_NAME, type Square } from '../chess/rules';
import { listSquares } from '../content/present';
import { forkSquares } from '../content/queries';
import type { MakeItWorkStep } from '../content/types';
import { h } from '../ui/dom';
import { line } from '../ui/text';
import { layout, say, sideToMove, type Mount } from './common';

export const mountMakeItWork: Mount<MakeItWorkStep> = (root, step, ctx) => {
  const L = layout(root);
  // Every square that works, computed from the rules; the lesson's example is just one of them.
  const valid = forkSquares(step.fen, step.place);
  let tries = 0;
  let placed: Square | null = null;
  let solved = false;
  const base = boardFromFen(step.fen);
  const board = new BoardView({
    fen: step.fen,
    orientation: step.place.color === 'w' ? 'w' : 'b',
    mode: 'tap',
    onTap: (sq) => {
      board.unselect();
      if (solved) return;
      if (base.has(sq)) {
        sayMsg(`${sq} is occupied. Choose an empty square.`, 'info');
        return;
      }
      if (placed) board.setPiece(placed, null);
      placed = sq;
      board.setPiece(sq, step.place);
      tries++;
      judge(sq);
    },
  });
  void sideToMove;
  L.boardSlot.appendChild(board.el);
  L.prompt.appendChild(h('p', { class: 'lead' }, line(step.prompt, ctx.t)));
  L.body.appendChild(h('p', { class: 'muted small' }, `Tap an empty square to place the ${ROLE_NAME[step.place.role]}. You can try as many squares as you like.`));

  function sayMsg(text: string, tone: 'good' | 'bad' | 'info') {
    L.feedback.replaceChildren(h('div', { class: `note note-${tone}` }, h('p', null, text)));
  }

  function judge(sq: Square) {
    const b = new Map(base);
    b.set(sq, { ...step.place });
    const targets = forkTargets(b, sq);
    board.setArrows(targets.map((t) => ({ from: sq, to: t, brush: isFork(b, sq) ? 'green' : 'yellow' })));
    if (valid.includes(sq)) {
      solved = true;
      board.setMarks([sq], 'mark-good');
      say(L.feedback, step.explain, ctx.t, 'good');
      ctx.done({ tries, hints: 0 });
      return;
    }
    const name = ROLE_NAME[step.place.role];
    if (targets.length < 2) {
      const what = targets.length === 1 ? `only one real target, ${listSquares(b, targets)}` : 'no real targets';
      sayMsg(`From ${sq} the ${name} has ${what}. A fork needs two.`, 'bad');
    } else {
      const takers = attackersOf(b, sq, opposite(step.place.color));
      sayMsg(`From ${sq} the ${name} hits ${listSquares(b, targets)}, but ${listSquares(b, takers)} can take it. A fork has to be safe.`, 'bad');
    }
    board.setMarks([sq], 'mark-bad');
    if (tries >= 4) board.setArrows([], valid.map((v) => ({ sq: v, brush: 'paleGreen' })));
  }
  return () => board.destroy();
};
