import { IDENTITY } from '../chess/transform';
import { lessonOrder, lessons, isGraded, unitOf, units } from '../content/index';
import type { Lesson, Step } from '../content/types';
import { mountStep } from '../exercises/index';
import type { Cleanup } from '../exercises/common';
import { conceptScore, markLesson, progress, recordAttempt, settings } from '../progress/store';
import { h } from '../ui/dom';

const STAGE_LABEL = { grammar: 'Grammar', logic: 'Logic', rhetoric: 'Rhetoric' } as const;

/** Show reasoning scaffolds while the concepts involved are still weak. */
export function wantScaffolds(step: Step): boolean {
  const mode = settings().scaffolds;
  if (mode !== 'auto') return mode === 'always';
  return Math.min(...step.concepts.map(conceptScore)) < 0.6;
}

export function lessonView(root: HTMLElement, id: string, stepParam?: string): Cleanup {
  const lesson = lessons[id];
  if (!lesson) {
    root.appendChild(h('p', null, 'That lesson does not exist.'));
    return () => {};
  }
  let index = Math.max(0, Math.min(lesson.steps.length - 1, Number(stepParam ?? progress().lessons[id]?.step ?? 0) || 0));
  if (progress().lessons[id]?.done && stepParam === undefined) index = 0;
  let cleanup: Cleanup = () => {};

  const unit = unitOf(id);
  const header = h('header', { class: 'lesson-head' });
  const stepHost = h('div', { class: 'step-host' });
  const nav = h('div', { class: 'lesson-nav' });
  root.append(header, stepHost, nav);

  function render() {
    cleanup();
    stepHost.replaceChildren();
    nav.replaceChildren();
    const step = lesson.steps[index];
    markLesson(id, index, false);
    header.replaceChildren(
      h('p', { class: 'eyebrow' }, `Unit ${unit?.id ?? ''} · ${STAGE_LABEL[lesson.stage]}`),
      h('h1', null, lesson.title),
      dots(lesson, index),
    );
    const next = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, index + 1 < lesson.steps.length ? 'Continue' : 'Finish lesson') as HTMLButtonElement;
    next.addEventListener('click', () => {
      if (index + 1 < lesson.steps.length) {
        index++;
        render();
        window.scrollTo({ top: 0 });
      } else {
        markLesson(id, 0, true);
        finish();
      }
    });
    const back = h('button', { class: 'btn btn-quiet', type: 'button', disabled: index === 0 }, 'Back') as HTMLButtonElement;
    back.addEventListener('click', () => {
      index--;
      render();
    });
    nav.append(back, next);
    cleanup = mountStep(stepHost, step, {
      t: IDENTITY,
      scaffolds: step.kind === 'puzzle' && wantScaffolds(step),
      done: (r) => {
        if (isGraded(step)) recordAttempt(step.id, step.concepts, r.tries, r.hints);
        next.disabled = false;
        next.focus({ preventScroll: true });
      },
    });
  }

  function finish() {
    cleanup();
    cleanup = () => {};
    const order = lessonOrder();
    const i = order.findIndex((l) => l.id === id);
    const nextLesson = order[i + 1];
    const u = unit ? units.find((x) => x.id === unit.id) : undefined;
    const lastInUnit = u && u.lessons[u.lessons.length - 1] === id;
    stepHost.replaceChildren(
      h(
        'div',
        { class: 'finish' },
        h('h2', null, 'Lesson complete'),
        h('p', null, lesson.summary),
        lastInUnit && u?.game
          ? h('p', null, 'That finishes the lessons in this unit. Next, see these ideas in a real game.')
          : null,
      ),
    );
    nav.replaceChildren();
    if (lastInUnit && u?.game) {
      nav.appendChild(h('a', { class: 'btn btn-primary', href: `#/game/${u.game}` }, 'Play through the master game'));
    } else if (nextLesson) {
      nav.appendChild(h('a', { class: 'btn btn-primary', href: `#/lesson/${nextLesson.id}` }, `Next: ${nextLesson.title}`));
    }
    nav.appendChild(h('a', { class: 'btn btn-quiet', href: `#/unit/${unit?.id ?? 1}` }, 'Back to the unit'));
  }

  render();
  return () => cleanup();
}

function dots(lesson: Lesson, index: number) {
  return h(
    'ol',
    { class: 'dots', 'aria-label': `Step ${index + 1} of ${lesson.steps.length}` },
    lesson.steps.map((_, i) => h('li', { class: i < index ? 'done' : i === index ? 'current' : '' })),
  );
}
