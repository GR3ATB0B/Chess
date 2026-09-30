// Presentation helpers: apply a transform to step data, name pieces in plain
// words, and explain why a claim is false using the same rules the verifier
// uses. Nothing here invents chess facts; it only reports rule computations.

import { Chess } from 'chess.js';
import {
  attackersOf,
  attacksFrom,
  boardFromFen,
  defendersOf,
  forkTargets,
  ROLE_NAME,
  see,
  VALUE,
  type Board,
  type Color,
  type Square,
} from '../chess/rules';
import { canMirror, mapColor, mapFen, mapSquare, mapUci, type Transform } from '../chess/transform';
import { checkRuleClaim, playLine, uciToMove } from './queries';
import type { Choice, Claim, Step, TapQuery } from './types';

export const colorName = (c: Color) => (c === 'w' ? 'White' : 'Black');

export function pieceAt(board: Board, sq: Square): string {
  const p = board.get(sq);
  return p ? `the ${ROLE_NAME[p.role]} on ${sq}` : `${sq}`;
}

export function listSquares(board: Board, sqs: Square[]): string {
  const names = sqs.map((s) => pieceAt(board, s));
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function san(fen: string, uci: string): string {
  try {
    return new Chess(fen).move(uciToMove(uci)).san;
  } catch {
    return uci;
  }
}

// ---- transforms over step data ----

function mapQuery(q: TapQuery, t: Transform): TapQuery {
  switch (q.what) {
    case 'loose':
    case 'hanging':
      return { ...q, color: mapColor(q.color, t) };
    case 'attacks':
      return { ...q, from: mapSquare(q.from, t) };
    case 'attackers':
      return { ...q, sq: mapSquare(q.sq, t), color: mapColor(q.color, t) };
    case 'defenders':
    case 'fork-targets':
      return { ...q, sq: mapSquare(q.sq, t) };
  }
}

function mapClaim(c: Claim, t: Transform): Claim {
  const out: Record<string, unknown> = { ...c };
  if (c.after) out.after = c.after.map((m) => mapUci(m, t));
  for (const k of ['sq', 'from'] as const) if (k in c) out[k] = mapSquare(out[k] as string, t);
  if ('to' in c) out.to = c.to.map((s) => mapSquare(s, t));
  if ('move' in c) out.move = mapUci(c.move, t);
  if ('by' in c) out.by = mapColor(c.by, t);
  return out as Claim;
}

function mapChoices(cs: Choice[], t: Transform): Choice[] {
  return cs.map((c) => ({ ...c, claims: c.claims.map((x) => mapClaim(x, t)) }));
}

/** Returns a copy of the step with every board fact remapped. Text is left for renderText. */
export function transformStep<S extends Step>(step: S, t: Transform): S {
  if (!t.flip && !t.mirror) return step;
  const s = structuredClone(step) as Step;
  const sq = (x: Square) => mapSquare(x, t);
  if (s.claims) s.claims = s.claims.map((c) => mapClaim(c, t));
  switch (s.kind) {
    case 'read':
      if (s.fen) s.fen = mapFen(s.fen, t);
      s.marks = s.marks?.map(sq);
      s.arrows = s.arrows?.map(([a, b]) => [sq(a), sq(b)]);
      break;
    case 'sandbox':
      s.fen = mapFen(s.fen, t);
      break;
    case 'tap':
      s.fen = mapFen(s.fen, t);
      s.find = mapQuery(s.find, t);
      s.answer = s.answer.map(sq);
      break;
    case 'make-it-work':
      s.fen = mapFen(s.fen, t);
      s.place = { ...s.place, color: mapColor(s.place.color, t) };
      s.example = sq(s.example);
      break;
    case 'near-miss':
      s.a = mapFen(s.a, t);
      s.b = mapFen(s.b, t);
      s.move = mapUci(s.move, t);
      s.diff = s.diff.map(sq);
      s.choices = mapChoices(s.choices, t);
      break;
    case 'puzzle':
      s.fen = mapFen(s.fen, t);
      s.line = s.line.map((m) => mapUci(m, t));
      s.scaffold = s.scaffold?.map((x) => ({ ...x, find: mapQuery(x.find, t) }));
      if (s.tempting) {
        s.tempting = { ...s.tempting, move: mapUci(s.tempting.move, t), refutation: s.tempting.refutation.map((m) => mapUci(m, t)) };
      }
      if (s.reasons) s.reasons = { ...s.reasons, choices: mapChoices(s.reasons.choices, t) };
      break;
    case 'choice':
      s.fen = mapFen(s.fen, t);
      if (s.arrow) s.arrow = [sq(s.arrow[0]), sq(s.arrow[1])];
      s.choices = mapChoices(s.choices, t);
      break;
  }
  return s as S;
}

export function allowedTransforms(step: Step): Transform[] {
  const fens: string[] = [];
  if ('fen' in step && step.fen) fens.push(step.fen);
  if (step.kind === 'near-miss') fens.push(step.a, step.b);
  const mirrorOk = fens.every(canMirror);
  const ts: Transform[] = [
    { flip: false, mirror: false },
    { flip: true, mirror: false },
  ];
  if (mirrorOk) ts.push({ flip: false, mirror: true }, { flip: true, mirror: true });
  return ts;
}

// ---- explaining false claims ----

/**
 * One sentence saying what is actually true, for a claim that does not hold.
 * Rule claims are recomputed here; engine claims were settled at build time,
 * so for those we can only restate their negation.
 */
export function explainFalse(fen: string, c: Claim): string | null {
  const truth = checkRuleClaim(fen, c);
  if (truth === true) return null;
  const at = c.after?.length ? playLine(fen, c.after) : fen;
  const b = boardFromFen(at);
  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  switch (c.is) {
    case 'loose': {
      const d = defendersOf(b, c.sq);
      return `${cap(pieceAt(b, c.sq))} is defended by ${listSquares(b, d)}.`;
    }
    case 'not-loose':
      return `Nothing defends ${pieceAt(b, c.sq)}.`;
    case 'hanging':
      return `${cap(pieceAt(b, c.sq))} can't be won by capturing it.`;
    case 'not-hanging': {
      const p = b.get(c.sq);
      const gain = p ? see(b, c.sq, p.color === 'w' ? 'b' : 'w') : 0;
      return `${cap(pieceAt(b, c.sq))} can be won: capturing it gains ${gain} point${gain === 1 ? '' : 's'}.`;
    }
    case 'defenders': {
      const d = defendersOf(b, c.sq);
      return d.length ? `${cap(pieceAt(b, c.sq))} has ${d.length} defender${d.length === 1 ? '' : 's'}: ${listSquares(b, d)}.` : `Nothing defends ${pieceAt(b, c.sq)}.`;
    }
    case 'attackers': {
      const a = attackersOf(b, c.sq, c.by);
      return a.length
        ? `${colorName(c.by)} has ${a.length} piece${a.length === 1 ? '' : 's'} bearing on ${c.sq}: ${listSquares(b, a)}.`
        : `No ${colorName(c.by).toLowerCase()} piece can reach ${c.sq}.`;
    }
    case 'attacks': {
      const a = attacksFrom(b, c.from);
      const miss = c.to.filter((s) => !a.includes(s));
      return `${cap(pieceAt(b, c.from))} doesn't reach ${miss.join(' or ')}.`;
    }
    case 'not-attacks': {
      const a = attacksFrom(b, c.from);
      const hit = c.to.filter((s) => a.includes(s));
      return `${cap(pieceAt(b, c.from))} does reach ${hit.join(' and ')}.`;
    }
    case 'fork': {
      const tg = forkTargets(b, c.sq);
      return tg.length < 2
        ? `${cap(pieceAt(b, c.sq))} has only ${tg.length === 1 ? 'one real target' : 'no real targets'}.`
        : `${cap(pieceAt(b, c.sq))} can simply be taken.`;
    }
    case 'not-fork':
      return `${cap(pieceAt(b, c.sq))} really does fork ${listSquares(b, forkTargets(b, c.sq))}.`;
    case 'check':
      return `${san(at, c.move)} is not check.`;
    case 'legal':
      return `${c.move.slice(0, 2)}–${c.move.slice(2, 4)} is not a legal move.`;
    case 'illegal':
      return `${san(at, c.move)} is a legal move.`;
    case 'value':
      return `A ${ROLE_NAME[c.role]} is worth ${VALUE[c.role]}, not ${c.n}.`;
    case 'see':
      return `Counting the exchange on ${c.sq}, ${colorName(c.by)} comes out ${see(b, c.sq, c.by)} ahead.`;
    // Engine claims: verified at build time to be false for wrong choices.
    case 'wins':
      return `${san(at, c.move)} doesn't win material here.`;
    case 'not-wins':
      return `${san(at, c.move)} does win material here.`;
    case 'best':
      return `${san(at, c.move)} isn't the best move here.`;
    case 'not-best':
      return `${san(at, c.move)} is the best move here.`;
    case 'mate':
      return `${san(at, c.move)} doesn't lead to mate.`;
  }
}

/** Why a wrong choice is wrong, from its claims. */
export function whyWrong(fen: string, choice: Choice): string {
  for (const c of choice.claims) {
    const r = checkRuleClaim(fen, c);
    if (r === false) return explainFalse(fen, c) ?? '';
  }
  const engine = choice.claims.filter((c) => checkRuleClaim(fen, c) === null);
  if (engine.length === 1) return explainFalse(fen, engine[0]) ?? '';
  return 'That doesn’t hold up on the board.';
}
