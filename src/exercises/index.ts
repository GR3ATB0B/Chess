import type { Step } from '../content/types';
import { mountChoice } from './choice';
import type { Cleanup, ExerciseCtx } from './common';
import { mountMakeItWork } from './makeItWork';
import { mountNearMiss } from './nearMiss';
import { mountPuzzle } from './puzzle';
import { mountRead } from './read';
import { mountSandbox } from './sandbox';
import { mountTap } from './tap';

export function mountStep(root: HTMLElement, step: Step, ctx: ExerciseCtx): Cleanup {
  switch (step.kind) {
    case 'read':
      return mountRead(root, step, ctx);
    case 'sandbox':
      return mountSandbox(root, step, ctx);
    case 'tap':
      return mountTap(root, step, ctx);
    case 'choice':
      return mountChoice(root, step, ctx);
    case 'near-miss':
      return mountNearMiss(root, step, ctx);
    case 'make-it-work':
      return mountMakeItWork(root, step, ctx);
    case 'puzzle':
      return mountPuzzle(root, step, ctx);
  }
}
