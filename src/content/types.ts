// Lesson data format. Content lives in content/*.json and is checked by
// scripts/verify-content.ts before every build. See CONTENT.md.

import type { Color, Role, Square } from '../chess/rules';

export type Concept =
  | 'piece-value'
  | 'loose'
  | 'defended'
  | 'counting'
  | 'trades'
  | 'threats'
  | 'fork';

export const CONCEPT_LABEL: Record<Concept, string> = {
  'piece-value': 'Piece values',
  loose: 'Loose pieces',
  defended: 'Defended pieces',
  counting: 'Attackers and defenders',
  trades: 'Good and bad trades',
  threats: 'Seeing threats',
  fork: 'Forks',
};

/** A move in UCI form, e.g. "e2e4", "e7e8q". */
export type Uci = string;

/**
 * A machine-checkable statement about a position. Every factual sentence a
 * lesson makes about a board should be backed by one of these. The verifier
 * evaluates each claim in the step's position, after playing `after` moves.
 */
export type Claim = { after?: Uci[] } & (
  | { is: 'loose'; sq: Square }
  | { is: 'not-loose'; sq: Square }
  | { is: 'hanging'; sq: Square }
  | { is: 'not-hanging'; sq: Square }
  | { is: 'defenders'; sq: Square; n: number }
  | { is: 'attackers'; sq: Square; by: Color; n: number }
  | { is: 'attacks'; from: Square; to: Square[] }
  | { is: 'not-attacks'; from: Square; to: Square[] }
  | { is: 'fork'; sq: Square }
  | { is: 'not-fork'; sq: Square }
  | { is: 'see'; sq: Square; by: Color; gain: number }
  | { is: 'check'; move: Uci }
  | { is: 'legal'; move: Uci }
  | { is: 'illegal'; move: Uci }
  | { is: 'value'; role: Role; n: number }
  // Engine claims. Scores are centipawns from the mover's point of view.
  | { is: 'wins'; move: Uci; cp: number }
  | { is: 'not-wins'; move: Uci; cp: number }
  | { is: 'best'; move: Uci }
  | { is: 'not-best'; move: Uci }
  | { is: 'mate'; move: Uci }
);

export interface Choice {
  text: string;
  correct: boolean;
  /** Must all hold for a correct choice; at least one must fail for a wrong one. */
  claims: Claim[];
  /** Shown after the learner picks this choice. */
  reply?: string;
}

/** Questions whose answers are computed from the rules module, never typed in. */
export type TapQuery =
  | { what: 'loose'; color: Color }
  | { what: 'hanging'; color: Color }
  | { what: 'attacks'; from: Square }
  | { what: 'attackers'; sq: Square; color: Color }
  | { what: 'defenders'; sq: Square }
  | { what: 'fork-targets'; sq: Square };

interface StepBase {
  id: string;
  concepts: Concept[];
  /** Claims backing statements made in this step's prose. */
  claims?: Claim[];
  /** False for steps whose text can't follow a colour flip (default true). */
  transformable?: boolean;
}

export interface ReadStep extends StepBase {
  kind: 'read';
  title?: string;
  text: string;
  fen?: string;
  arrows?: [Square, Square][];
  marks?: Square[];
  /** Socratic prompt: shown first, answer revealed on request. */
  ask?: { question: string; answer: string };
}

export interface SandboxStep extends StepBase {
  kind: 'sandbox';
  prompt: string;
  fen: string;
  text?: string;
  palette?: boolean;
}

export interface TapStep extends StepBase {
  kind: 'tap';
  prompt: string;
  fen: string;
  find: TapQuery;
  /** Hand-written answer; the verifier fails the build if the rules disagree. */
  answer: Square[];
  explain: string;
}

export interface NearMissStep extends StepBase {
  kind: 'near-miss';
  prompt: string;
  a: string;
  b: string;
  move: Uci;
  works: 'a' | 'b';
  /** Squares that differ between the two boards (verified). */
  diff: Square[];
  question: string;
  choices: Choice[];
  explain: string;
}

export interface MakeItWorkStep extends StepBase {
  kind: 'make-it-work';
  prompt: string;
  fen: string;
  goal: 'fork';
  place: { color: Color; role: Role };
  /** One square that works (verified); the app accepts any square that does. */
  example: Square;
  explain: string;
}

export interface PuzzleStep extends StepBase {
  kind: 'puzzle';
  prompt: string;
  fen: string;
  /** Learner moves at even indices, replies at odd indices. */
  line: Uci[];
  /** 'win' requires a clear advantage; 'save' only requires the move be clearly best. */
  goal: 'win' | 'save';
  /** Optional reasoning steps before moving. Answers come from the rules. */
  scaffold?: { prompt: string; find: TapQuery }[];
  tempting?: { move: Uci; refutation: Uci[]; explain: string };
  reasons?: { question: string; choices: Choice[] };
  hints: string[];
  explain: string;
}

export interface ChoiceStep extends StepBase {
  kind: 'choice';
  prompt: string;
  fen: string;
  arrow?: [Square, Square];
  question: string;
  choices: Choice[];
  explain: string;
}

export type Step =
  | ReadStep
  | SandboxStep
  | TapStep
  | NearMissStep
  | MakeItWorkStep
  | PuzzleStep
  | ChoiceStep;

export type Stage = 'grammar' | 'logic' | 'rhetoric';

export interface Lesson {
  id: string;
  unit: number;
  stage: Stage;
  title: string;
  summary: string;
  steps: Step[];
}

export interface MasterGame {
  id: string;
  title: string;
  white: string;
  black: string;
  event: string;
  year: number;
  result: string;
  /** Source of the move record (public domain game score). */
  source: string;
  intro: string;
  /** Moves in SAN from the initial position. */
  moves: string[];
  /** The learner plays this side when guessing. */
  side: Color;
  /** First ply (0-based) the learner is asked to guess. */
  guessFrom: number;
  /** Original notes for this project, keyed by ply index (0-based). */
  notes: Record<string, string>;
  /** Short prompt shown before the learner guesses a ply. */
  prompts?: Record<string, string>;
  /** Claims checked in the position before the given ply. */
  claims?: (Claim & { ply: number })[];
  outro: string;
}

export interface Unit {
  id: number;
  title: string;
  summary: string;
  lessons: string[];
  game?: string;
}
