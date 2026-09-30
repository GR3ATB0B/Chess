// Progress lives only on this device, in localStorage. Every access is
// wrapped so a blocked or full store never breaks the app; in that case
// progress is kept in memory for the session.

import type { Concept } from '../content/types';

export interface ConceptStat {
  attempts: number;
  /** 0..1, a moving average of recent outcomes. */
  score: number;
  /** Step ids solved at least once, to require breadth before "understood". */
  solved: string[];
  lastAt: number;
}

export interface StepRecord {
  at: number;
  tries: number;
  hints: number;
  ok: boolean;
}

export interface Settings {
  coordinates: boolean;
  /** Show the blunder-check routine above the board in puzzles. */
  routine: boolean;
  /** 'auto' fades reasoning scaffolds as a concept is mastered. */
  scaffolds: 'auto' | 'always' | 'never';
}

export interface Progress {
  app: 'trivium-chess';
  version: 1;
  concepts: Partial<Record<Concept, ConceptStat>>;
  steps: Record<string, StepRecord>;
  lessons: Record<string, { done: boolean; at: number; step: number }>;
  games: Record<string, { done: boolean; at: number; matched: number; total: number }>;
  settings: Settings;
}

const KEY = 'trivium-chess:v1';

const DEFAULT_SETTINGS: Settings = { coordinates: true, routine: true, scaffolds: 'auto' };

function empty(): Progress {
  return {
    app: 'trivium-chess',
    version: 1,
    concepts: {},
    steps: {},
    lessons: {},
    games: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

let state: Progress = load();
const listeners = new Set<() => void>();

function load(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return normalise(JSON.parse(raw));
  } catch {
    return empty();
  }
}

function normalise(p: Partial<Progress>): Progress {
  const e = empty();
  return {
    ...e,
    ...p,
    app: 'trivium-chess',
    version: 1,
    settings: { ...e.settings, ...(p.settings ?? {}) },
  };
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage unavailable (private mode, quota). Keep going in memory.
  }
  listeners.forEach((f) => f());
}

export function progress(): Readonly<Progress> {
  return state;
}

export function settings(): Readonly<Settings> {
  return state.settings;
}

export function updateSettings(patch: Partial<Settings>) {
  state.settings = { ...state.settings, ...patch };
  save();
}

export function onProgress(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

// ---- mastery ----

/** Outcome of one attempt: 1 clean, lower with hints or retries. */
export function outcome(tries: number, hints: number): number {
  if (tries <= 1 && hints === 0) return 1;
  if (tries <= 2 && hints <= 1) return 0.6;
  return 0.3;
}

export const UNDERSTOOD_SCORE = 0.75;
export const UNDERSTOOD_BREADTH = 3;

export function recordAttempt(stepId: string, concepts: Concept[], tries: number, hints: number) {
  const o = outcome(tries, hints);
  const now = Date.now();
  state.steps[stepId] = { at: now, tries, hints, ok: true };
  for (const c of concepts) {
    const s = state.concepts[c] ?? { attempts: 0, score: 0, solved: [], lastAt: 0 };
    s.attempts += 1;
    s.score = s.attempts === 1 ? o * 0.7 : s.score * 0.6 + o * 0.4;
    if (!s.solved.includes(stepId)) s.solved.push(stepId);
    s.lastAt = now;
    state.concepts[c] = s;
  }
  save();
}

export type ConceptStatus = 'new' | 'practising' | 'understood';

export function conceptStatus(c: Concept): ConceptStatus {
  const s = state.concepts[c];
  if (!s || s.attempts === 0) return 'new';
  return s.score >= UNDERSTOOD_SCORE && s.solved.length >= UNDERSTOOD_BREADTH ? 'understood' : 'practising';
}

export function conceptScore(c: Concept): number {
  return state.concepts[c]?.score ?? 0;
}

export function markLesson(id: string, step: number, done: boolean) {
  const prev = state.lessons[id];
  state.lessons[id] = { done: done || !!prev?.done, at: Date.now(), step };
  save();
}

export function markGame(id: string, matched: number, total: number) {
  state.games[id] = { done: true, at: Date.now(), matched, total };
  save();
}

// ---- export / import ----

export function exportJson(): string {
  return JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2);
}

export function importJson(text: string): { ok: true } | { ok: false; error: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'That file is not valid JSON.' };
  }
  const d = data as Partial<Progress>;
  if (!d || d.app !== 'trivium-chess' || d.version !== 1) {
    return { ok: false, error: 'That file is not a Trivium Chess progress export.' };
  }
  state = normalise(d);
  save();
  return { ok: true };
}

export function resetProgress() {
  const keep = state.settings;
  state = empty();
  state.settings = keep;
  save();
}
