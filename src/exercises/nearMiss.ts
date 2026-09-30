import { BoardView } from '../board/board';
import { san } from '../content/present';
import type { NearMissStep } from '../content/types';
import { h } from '../ui/dom';
import { line } from '../ui/text';
import { choices, layout, say, sideToMove, type Mount } from './common';

export const mountNearMiss: Mount<NearMissStep> = (root, step, ctx) => {
  const L = layout(root);
  let tries = 0;
  const orientation = sideToMove(step.a);
  const fails = step.works === 'a' ? step.b : step.a;
  const move = san(step.a, step.move);
  let stage: 'pick' | 'diff' | 'why' | 'done' = 'pick';

  const mk = (fen: string, label: string, key: 'a' | 'b') => {
    const bv = new BoardView({
      fen,
      orientation,
      small: true,
      mode: 'tap',
      onTap: (sq) => {
        bv.unselect();
        if (stage === 'pick') pick(key);
        else if (stage === 'diff') tapDiff(sq);
      },
    });
    const fig = h('figure', { class: 'pair-board' }, bv.el, h('figcaption', null, label));
    return { bv, fig };
  };
  const A = mk(step.a, 'A', 'a');
  const B = mk(step.b, 'B', 'b');
  L.boardSlot.appendChild(h('div', { class: 'pair' }, A.fig, B.fig));
  L.prompt.appendChild(h('p', { class: 'lead' }, line(step.prompt, ctx.t)));

  const q1 = h('div', null, h('p', { class: 'question' }, `In which position does ${move} work?`));
  const btns = h('div', { class: 'choices choices-inline' });
  for (const k of ['a', 'b'] as const) {
    const b = h('button', { class: 'choice', type: 'button' }, `Position ${k.toUpperCase()}`);
    b.addEventListener('click', () => pick(k));
    btns.appendChild(b);
  }
  q1.appendChild(btns);
  L.body.appendChild(q1);

  function pick(k: 'a' | 'b') {
    if (stage !== 'pick') return;
    tries++;
    const btn = btns.children[k === 'a' ? 0 : 1] as HTMLButtonElement;
    if (k !== step.works) {
      btn.classList.add('is-wrong');
      btn.disabled = true;
      L.feedback.replaceChildren(
        h('div', { class: 'note note-bad' }, h('p', null, `Not in ${k.toUpperCase()}. Before capturing, ask what takes back, and what attacks what.`)),
      );
      return;
    }
    btn.classList.add('is-right');
    btns.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
    const w = step.works === 'a' ? A : B;
    w.bv.setArrows([{ from: step.move.slice(0, 2), to: step.move.slice(2, 4), brush: 'green' }]);
    stage = 'diff';
    L.feedback.replaceChildren();
    L.body.appendChild(h('p', { class: 'question' }, 'Now find the difference. Tap a square where the two boards differ.'));
  }

  function tapDiff(sq: string) {
    if (!step.diff.includes(sq)) {
      L.feedback.replaceChildren(h('div', { class: 'note note-bad' }, h('p', null, `${sq} is the same on both boards. Compare them square by square.`)));
      return;
    }
    A.bv.setMarks(step.diff, 'mark-note');
    B.bv.setMarks(step.diff, 'mark-note');
    L.feedback.replaceChildren();
    stage = 'why';
    choices(L.body, step.question, step.choices, fails, ctx.t, (t) => {
      stage = 'done';
      say(L.feedback, step.explain, ctx.t, 'good');
      ctx.done({ tries: tries + t - 1, hints: 0 });
    });
  }

  return () => {
    A.bv.destroy();
    B.bv.destroy();
  };
};
