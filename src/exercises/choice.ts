import { BoardView } from '../board/board';
import type { ChoiceStep } from '../content/types';
import { h } from '../ui/dom';
import { line } from '../ui/text';
import { choices, layout, say, sideToMove, toMoveLabel, type Mount } from './common';

export const mountChoice: Mount<ChoiceStep> = (root, step, ctx) => {
  const L = layout(root);
  const board = new BoardView({ fen: step.fen, orientation: sideToMove(step.fen) });
  L.boardSlot.appendChild(board.el);
  if (step.arrow) board.setArrows([{ from: step.arrow[0], to: step.arrow[1], brush: 'blue' }]);
  L.prompt.appendChild(h('div', null, /to move/i.test(step.prompt) ? null : h('p', { class: 'muted small' }, toMoveLabel(step.fen, ctx.t)), h('p', { class: 'lead' }, line(step.prompt, ctx.t))));
  choices(L.body, step.question, step.choices, step.fen, ctx.t, (tries) => {
    say(L.feedback, step.explain, ctx.t, 'good');
    ctx.done({ tries, hints: 0 });
  });
  return () => board.destroy();
};
