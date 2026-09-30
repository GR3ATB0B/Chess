import { BoardView } from '../board/board';
import { boardFromFen, defendersOf, attackersOf, type Board, type Square } from '../chess/rules';
import { listSquares, pieceAt } from '../content/present';
import { computeTap } from '../content/queries';
import type { TapQuery, TapStep } from '../content/types';
import { h } from '../ui/dom';
import { line, prose } from '../ui/text';
import { layout, say, sideToMove, type Mount } from './common';

/** Why a tapped square is not part of the answer, in rules terms. */
export function whyNot(board: Board, q: TapQuery, sq: Square): string {
  const p = board.get(sq);
  const name = pieceAt(board, sq);
  const cap = name.charAt(0).toUpperCase() + name.slice(1);
  switch (q.what) {
    case 'loose': {
      if (!p || p.color !== q.color) return `${sq} doesn't hold one of the pieces asked about.`;
      if (p.role === 'k') return 'Kings are never counted as loose.';
      return `${cap} is defended by ${listSquares(board, defendersOf(board, sq))}.`;
    }
    case 'defenders':
      return p ? `${cap} doesn't reach ${q.sq}.` : `${sq} is empty.`;
    case 'attackers':
      return p ? `${cap} doesn't reach ${q.sq}.` : `${sq} is empty.`;
    case 'hanging':
      if (!p || p.color !== q.color) return `${sq} doesn't hold one of the pieces asked about.`;
      return attackersOf(board, sq, p.color === 'w' ? 'b' : 'w').length
        ? `${cap} is attacked, but taking it wouldn't win anything.`
        : `Nothing attacks ${name}.`;
    case 'attacks':
      return `${sq} is out of reach from ${q.from}.`;
    case 'fork-targets':
      return p ? `${cap} is attacked, but taking it would not win anything.` : `${sq} is empty.`;
  }
}

export const mountTap: Mount<TapStep> = (root, step, ctx) => {
  const L = layout(root);
  const board0 = boardFromFen(step.fen);
  // The answer comes from the rules module, not from the lesson file.
  const answer = computeTap(step.fen, step.find);
  const picked = new Set<Square>();
  let tries = 0;
  let solved = false;
  const board = new BoardView({
    fen: step.fen,
    orientation: sideToMove(step.fen),
    mode: 'tap',
    onTap: (sq) => {
      if (solved) return;
      if (picked.has(sq)) picked.delete(sq);
      else picked.add(sq);
      board.unselect();
      paint();
    },
  });
  L.boardSlot.appendChild(board.el);
  L.prompt.appendChild(h('p', { class: 'lead' }, line(step.prompt, ctx.t)));
  const count = h('p', { class: 'muted small' });
  L.body.appendChild(count);

  function paint(extra?: Map<Square, string>) {
    const m = new Map<Square, string>([...picked].map((s) => [s, 'mark-tap']));
    extra?.forEach((v, k) => m.set(k, v));
    board.setMarks(m);
    count.textContent = picked.size ? `${picked.size} selected. Tap again to unselect.` : 'Tap squares on the board.';
  }
  paint();

  const check = h('button', { class: 'btn btn-primary', type: 'button' }, 'Check') as HTMLButtonElement;
  check.addEventListener('click', () => {
    tries++;
    const wrong = [...picked].filter((s) => !answer.includes(s));
    const missing = answer.filter((s) => !picked.has(s));
    if (!wrong.length && !missing.length) {
      solved = true;
      board.setMarks(answer, 'mark-good');
      check.remove();
      say(L.feedback, step.explain, ctx.t, 'good');
      ctx.done({ tries, hints: 0 });
      return;
    }
    const marks = new Map<Square, string>();
    wrong.forEach((s) => marks.set(s, 'mark-bad'));
    const msgs: string[] = [];
    if (wrong.length) msgs.push(wrong.map((s) => whyNot(board0, step.find, s)).join(' '));
    if (missing.length) {
      msgs.push(missing.length === 1 ? 'There is one more.' : `There are ${missing.length} more.`);
      if (tries >= 2) {
        missing.forEach((s) => marks.set(s, 'mark-hint'));
        msgs.push('The ringed squares are the ones you missed.');
      }
    }
    wrong.forEach((s) => picked.delete(s));
    paint(marks);
    L.feedback.replaceChildren(h('div', { class: 'note note-bad' }, prose(msgs.join(' '))));
  });
  L.actions.appendChild(check);
  return () => board.destroy();
};
