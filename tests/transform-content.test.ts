import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeTap, checkRuleClaim, forkSquares } from '../src/content/queries';
import { allowedTransforms, transformStep } from '../src/content/present';
import type { Choice, Claim, Lesson, Step } from '../src/content/types';

const lessons: Lesson[] = readdirSync('content/lessons').map((f) => JSON.parse(readFileSync(`content/lessons/${f}`, 'utf8')));

function claimFen(s: Step): string | undefined {
  if (s.kind === 'near-miss') return s.works === 'a' ? s.b : s.a;
  return 'fen' in s ? s.fen : undefined;
}

function ruleOk(fen: string, c: Claim) {
  const r = checkRuleClaim(fen, c);
  return r === null ? true : r;
}

describe('lesson facts survive colour flip and mirror', () => {
  for (const l of lessons) {
    for (const s0 of l.steps) {
      for (const t of allowedTransforms(s0).slice(1)) {
        it(`${s0.id} ${JSON.stringify(t)}`, () => {
          const s = transformStep(s0, t);
          const fen = claimFen(s);
          if (s.kind === 'tap') expect(computeTap(s.fen, s.find).sort()).toEqual([...s.answer].sort());
          if (s.kind === 'make-it-work') expect(forkSquares(s.fen, s.place)).toContain(s.example);
          const choices: Choice[] =
            s.kind === 'choice' || s.kind === 'near-miss' ? s.choices : s.kind === 'puzzle' ? (s.reasons?.choices ?? []) : [];
          const cf = s.kind === 'near-miss' ? fen! : 'fen' in s ? (s.fen as string) : '';
          for (const ch of choices) {
            if (ch.correct) for (const c of ch.claims) expect(ruleOk(cf, c), JSON.stringify(c)).toBe(true);
          }
          if (fen && s.kind !== 'near-miss') for (const c of s.claims ?? []) expect(ruleOk(fen, c), JSON.stringify(c)).toBe(true);
        });
      }
    }
  }
});
