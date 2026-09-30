// Loads the verified lesson data bundled at build time.

import unitsJson from '../../content/units.json';
import type { Concept, Lesson, MasterGame, Step, Unit } from './types';

const lessonModules = import.meta.glob<Lesson>('../../content/lessons/*.json', { eager: true, import: 'default' });
const gameModules = import.meta.glob<MasterGame>('../../content/games/*.json', { eager: true, import: 'default' });

export const units: Unit[] = unitsJson as Unit[];
export const lessons: Record<string, Lesson> = Object.fromEntries(Object.values(lessonModules).map((l) => [l.id, l]));
export const games: Record<string, MasterGame> = Object.fromEntries(Object.values(gameModules).map((g) => [g.id, g]));

export function lessonOrder(): Lesson[] {
  return units.flatMap((u) => u.lessons.map((id) => lessons[id]).filter(Boolean));
}

export function unitOf(lessonId: string): Unit | undefined {
  return units.find((u) => u.lessons.includes(lessonId));
}

export const GRADED: Step['kind'][] = ['tap', 'near-miss', 'make-it-work', 'puzzle', 'choice'];

export function isGraded(s: Step): boolean {
  return GRADED.includes(s.kind);
}

/** Every graded step, with the lesson it belongs to. */
export function allGradedSteps(): { lesson: Lesson; step: Step }[] {
  return lessonOrder().flatMap((lesson) => lesson.steps.filter(isGraded).map((step) => ({ lesson, step })));
}

const NON_TEXT_KEYS = new Set([
  'id', 'kind', 'concepts', 'fen', 'a', 'b', 'move', 'line', 'refutation', 'answer', 'diff', 'example',
  'arrows', 'arrow', 'marks', 'claims', 'find', 'place', 'goal', 'works',
]);

function texts(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => texts(x, out));
  else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) if (!NON_TEXT_KEYS.has(k)) texts(x, out);
  }
  return out;
}

/**
 * A step can be shown colour-flipped or mirrored only if its prose names
 * squares through @tokens. Any bare square (usually inside a move like
 * "Nxe5") would be wrong after the transform.
 */
export function canTransformStep(s: Step): boolean {
  if (s.transformable === false) return false;
  return !texts(s).some((t) => /[a-h]x@[a-h][1-8]|\b[a-h]-file\b/.test(t) || /[a-h][1-8]/.test(t.replace(/@[a-h][1-8]/g, '')));
}

export function conceptsIntroduced(): Concept[] {
  const seen = new Set<Concept>();
  for (const l of lessonOrder()) for (const s of l.steps) s.concepts.forEach((c) => seen.add(c));
  return [...seen];
}
