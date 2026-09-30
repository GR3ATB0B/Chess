import { BoardView } from '../board/board';
import { mapColor } from '../chess/transform';
import type { ReadStep } from '../content/types';
import { h } from '../ui/dom';
import { line, prose } from '../ui/text';
import { layout, type Mount } from './common';

export const mountRead: Mount<ReadStep> = (root, step, ctx) => {
  const L = layout(root, !!step.fen);
  let board: BoardView | null = null;
  if (step.fen) {
    board = new BoardView({ fen: step.fen, orientation: mapColor('w', ctx.t) });
    L.boardSlot.appendChild(board.el);
    if (step.marks) board.setMarks(step.marks, 'mark-note');
    if (step.arrows) board.setArrows(step.arrows.map(([a, b]) => ({ from: a, to: b, brush: 'blue' })));
  }
  if (step.title) L.prompt.appendChild(h('h2', null, step.title));
  L.body.appendChild(prose(step.text, ctx.t));
  if (step.ask) {
    const ask = step.ask;
    const reveal = h('button', { class: 'btn', type: 'button' }, 'Think first, then show the answer');
    reveal.addEventListener('click', () => {
      reveal.replaceWith(h('div', { class: 'answer' }, prose(ask.answer, ctx.t)));
      ctx.done({ tries: 1, hints: 0 });
    });
    L.body.appendChild(h('div', { class: 'ask' }, h('p', { class: 'question' }, h('strong', null, 'Question. '), ...line(ask.question, ctx.t)), reveal));
  } else {
    ctx.done({ tries: 1, hints: 0 });
  }
  return () => board?.destroy();
};
