import type { Color } from '../chess/rules';
import { renderText, type Transform } from '../chess/transform';
import { whyWrong } from '../content/present';
import type { Choice, Step } from '../content/types';
import { h } from '../ui/dom';
import { line, prose } from '../ui/text';

export interface Result {
  tries: number;
  hints: number;
}

export interface ExerciseCtx {
  /** Transform applied to this step (text tokens are rendered with it). */
  t: Transform;
  /** Called once when the learner completes the step. */
  done(result: Result): void;
  /** Reasoning scaffolds on or off for this attempt (puzzles). */
  scaffolds: boolean;
}

export type Cleanup = () => void;
export type Mount<S extends Step = Step> = (root: HTMLElement, step: S, ctx: ExerciseCtx) => Cleanup;

export interface Layout {
  root: HTMLElement;
  boardSlot: HTMLElement;
  panel: HTMLElement;
  prompt: HTMLElement;
  body: HTMLElement;
  feedback: HTMLElement;
  actions: HTMLElement;
}

export function layout(root: HTMLElement, withBoard = true): Layout {
  const boardSlot = h('div', { class: 'ex-board' });
  const prompt = h('div', { class: 'ex-prompt' });
  const body = h('div', { class: 'ex-body' });
  const feedback = h('div', { class: 'ex-feedback', 'aria-live': 'polite' });
  const actions = h('div', { class: 'ex-actions' });
  const panel = h('div', { class: 'ex-panel' }, prompt, body, feedback, actions);
  const wrap = h('div', { class: `exercise ${withBoard ? '' : 'no-board'}` }, withBoard ? boardSlot : null, panel);
  root.appendChild(wrap);
  return { root: wrap, boardSlot, panel, prompt, body, feedback, actions };
}

export function sideToMove(fen: string): Color {
  return (fen.split(' ')[1] ?? 'w') as Color;
}

export function toMoveLabel(fen: string, t: Transform): string {
  void t;
  return sideToMove(fen) === 'w' ? 'White to move' : 'Black to move';
}

export function say(el: HTMLElement, text: string, t: Transform, tone: 'good' | 'bad' | 'info' = 'info') {
  el.replaceChildren(h('div', { class: `note note-${tone}` }, prose(text, t)));
}

export function sayNodes(el: HTMLElement, nodes: (Node | string)[], tone: 'good' | 'bad' | 'info' = 'info') {
  el.replaceChildren(h('div', { class: `note note-${tone}` }, h('p', null, nodes)));
}

/**
 * Multiple-choice block. Wrong picks stay visible, disabled, with the reason
 * computed from their claims. Resolves when the correct choice is picked.
 */
export function choices(
  host: HTMLElement,
  question: string,
  list: Choice[],
  claimFen: string,
  t: Transform,
  onCorrect: (tries: number) => void,
) {
  let tries = 0;
  const q = h('p', { class: 'question' }, line(question, t));
  const ul = h('div', { class: 'choices', role: 'group' });
  const why = h('div', { class: 'choice-why', 'aria-live': 'polite' });
  list.forEach((c) => {
    const btn = h('button', { class: 'choice', type: 'button' }, line(c.text, t)) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      tries++;
      if (c.correct) {
        btn.classList.add('is-right');
        ul.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
        why.replaceChildren(...(c.reply ? [h('p', null, line(c.reply, t))] : []));
        onCorrect(tries);
      } else {
        btn.classList.add('is-wrong');
        btn.disabled = true;
        const reason = c.reply ? renderText(c.reply, t) : whyWrong(claimFen, c);
        why.replaceChildren(h('div', { class: 'note note-bad' }, h('p', null, `Not quite. ${reason}`)));
      }
    });
    ul.appendChild(btn);
  });
  host.append(q, ul, why);
}

export function continueButton(actions: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { class: 'btn btn-primary', type: 'button' }, label) as HTMLButtonElement;
  b.addEventListener('click', onClick);
  actions.appendChild(b);
  return b;
}
