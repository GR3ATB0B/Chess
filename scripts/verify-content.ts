// Build-time content verifier. Fails (exit 1) if any shipped position,
// solution, tag or explanation claim is wrong. See CONTENT.md for the rules
// and the evaluation margins below.
//
//   npm run verify                 full check (Stockfish depth 18)
//   VERIFY_DEPTH=12 npm run verify quicker local pass
//   VERIFY_CACHE=1 npm run verify  reuse engine results between runs

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Chess, validateFen } from 'chess.js';
import { boardFromFen, ALL_SQUARES } from '../src/chess/rules';
import { canMirror, mapFen, mapSquare, type Transform } from '../src/chess/transform';
import {
  checkRuleClaim,
  computeTap,
  isLegal,
  playLine,
  sameSet,
  sanOf,
  ENGINE_CLAIMS,
  forkSquares,
} from '../src/content/queries';
import type { Choice, Claim, Lesson, MasterGame, Step, TapQuery, Unit } from '../src/content/types';
import { Engine, fmtScore, MATE, type Line } from './engine';

// ---- Evaluation margins (centipawns, from the mover's point of view) ----
/** A stated solution move must beat the second-best move by at least this. */
export const CLEAR_BEST = 150;
/** A 'win' puzzle's first move, and a near-miss "works" move, must score at least this. */
export const WINNING = 150;
/** In the near-miss "fails" position the same move must score at most this. */
export const NOT_WINNING = 50;
/** Minimum difference between the two near-miss outcomes. */
export const NEAR_MISS_GAP = 200;
/** A scripted defensive reply may be at most this much worse than the engine's best. */
export const DEFENSE_TOLERANCE = 50;
/** A tempting wrong move must score at least this much below the best move. */
export const TEMPTING_GAP = 150;
/** 'not-best' claims: the move scores at least this much below the best. */
export const NOT_BEST_GAP = 100;

const DEPTH = Number(process.env.VERIFY_DEPTH ?? 18);
const USE_CACHE = process.env.VERIFY_CACHE === '1';
const CACHE_FILE = '.verify-cache.json';

const errors: string[] = [];
const warnings: string[] = [];
let checks = 0;

function fail(where: string, msg: string) {
  errors.push(`${where}: ${msg}`);
}
function ok(cond: boolean, where: string, msg: string) {
  checks++;
  if (!cond) fail(where, msg);
  return cond;
}

// ---------- engine with cache ----------
let engine: Engine;
const cache: Record<string, Line[]> =
  USE_CACHE && existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};

async function analyse(fen: string, multipv = 1, searchmoves?: string[]): Promise<Line[]> {
  const key = `${fen}|${DEPTH}|${multipv}|${searchmoves?.join(',') ?? ''}`;
  if (cache[key]) return cache[key];
  const r = await engine.analyse(fen, { depth: DEPTH, multipv, searchmoves });
  cache[key] = r;
  return r;
}
async function scoreOf(fen: string, move: string): Promise<number> {
  const [l] = await analyse(fen, 1, [move]);
  if (!l) throw new Error(`no line for ${move}`);
  return l.score;
}
async function bestTwo(fen: string): Promise<Line[]> {
  return analyse(fen, 2);
}

// ---------- helpers ----------
function checkFen(where: string, fen: string): boolean {
  const v = validateFen(fen);
  if (!ok(v.ok, where, `invalid FEN "${fen}": ${v.error ?? ''}`)) return false;
  const c = new Chess(fen);
  ok(!c.isGameOver(), where, `position is already over: ${fen}`);
  return true;
}

function describe(fen: string, m: string) {
  try {
    return `${sanOf(fen, m)} (${m})`;
  } catch {
    return m;
  }
}

async function checkClaim(where: string, fen: string, c: Claim): Promise<boolean> {
  let at = fen;
  if (c.after?.length) {
    try {
      at = playLine(fen, c.after);
    } catch (e) {
      fail(where, `claim ${c.is}: ${(e as Error).message}`);
      return false;
    }
  }
  if (!ENGINE_CLAIMS.has(c.is)) {
    const r = checkRuleClaim(fen, c);
    return r === true;
  }
  const move = (c as { move: string }).move;
  if (!isLegal(at, move)) return false;
  switch (c.is) {
    case 'wins':
      return (await scoreOf(at, move)) >= c.cp;
    case 'not-wins':
      return (await scoreOf(at, move)) < c.cp;
    case 'mate':
      return (await scoreOf(at, move)) >= MATE - 1000;
    case 'best': {
      const [best] = await bestTwo(at);
      return best.move === move;
    }
    case 'not-best': {
      const [best] = await bestTwo(at);
      return (await scoreOf(at, move)) <= best.score - NOT_BEST_GAP;
    }
  }
  return false;
}

async function checkClaims(where: string, fen: string, claims: Claim[] | undefined) {
  for (const c of claims ?? []) {
    checks++;
    if (!(await checkClaim(where, fen, c))) fail(where, `claim does not hold: ${JSON.stringify(c)}`);
  }
}

async function checkChoices(where: string, fen: string, choices: Choice[]) {
  ok(choices.filter((c) => c.correct).length === 1, where, 'exactly one choice must be correct');
  ok(choices.length >= 2, where, 'need at least two choices');
  for (const [i, ch] of choices.entries()) {
    const w = `${where} choice ${i + 1}`;
    if (!ok(ch.claims.length > 0, w, 'every choice needs at least one machine-checked claim')) continue;
    const results = await Promise.all(ch.claims.map((c) => checkClaim(w, fen, c)));
    if (ch.correct) {
      results.forEach((r, j) => ok(r, w, `correct choice has a false claim: ${JSON.stringify(ch.claims[j])}`));
    } else {
      ok(results.some((r) => !r), w, `wrong choice "${ch.text}" has only true claims, so it is not actually wrong`);
    }
  }
}

function checkTapQuery(where: string, fen: string, q: TapQuery) {
  const board = boardFromFen(fen);
  const need = 'from' in q ? q.from : 'sq' in q ? q.sq : null;
  if (need) ok(board.has(need), where, `query square ${need} is empty`);
}

/** Tap answers must survive colour flip and mirror unchanged in meaning. */
function checkTapTransforms(where: string, fen: string, q: TapQuery, answer: string[]) {
  const ts: Transform[] = [{ flip: true, mirror: false }];
  if (canMirror(fen)) ts.push({ flip: false, mirror: true }, { flip: true, mirror: true });
  for (const t of ts) {
    const tq = mapQuery(q, t);
    const got = computeTap(mapFen(fen, t), tq);
    ok(
      sameSet(got, answer.map((s) => mapSquare(s, t))),
      where,
      `transform ${JSON.stringify(t)} changes the answer (rules module is not symmetric?)`,
    );
  }
}

function mapQuery(q: TapQuery, t: Transform): TapQuery {
  const flipC = (c: 'w' | 'b') => (t.flip ? (c === 'w' ? 'b' : 'w') : c);
  switch (q.what) {
    case 'loose':
    case 'hanging':
      return { ...q, color: flipC(q.color) };
    case 'attacks':
      return { ...q, from: mapSquare(q.from, t) };
    case 'attackers':
      return { ...q, sq: mapSquare(q.sq, t), color: flipC(q.color) };
    case 'defenders':
    case 'fork-targets':
      return { ...q, sq: mapSquare(q.sq, t) };
  }
}

// ---------- step checks ----------
async function verifyStep(where: string, s: Step) {
  const fens: string[] = [];
  switch (s.kind) {
    case 'read':
      if (s.fen && checkFenLoose(where, s.fen)) fens.push(s.fen);
      if (s.claims?.length) ok(!!s.fen, where, 'claims need a fen');
      break;
    case 'sandbox':
      checkFenLoose(where, s.fen);
      break;
    case 'tap': {
      if (!checkFen(where, s.fen)) return;
      fens.push(s.fen);
      checkTapQuery(where, s.fen, s.find);
      const got = computeTap(s.fen, s.find);
      ok(got.length > 0, where, 'tap question has no answer squares');
      ok(
        sameSet(got, s.answer),
        where,
        `answer ${JSON.stringify(s.answer.sort())} but rules say ${JSON.stringify(got)}`,
      );
      checkTapTransforms(where, s.fen, s.find, got);
      break;
    }
    case 'make-it-work': {
      if (!checkFen(where, s.fen)) return;
      fens.push(s.fen);
      const valid = forkSquares(s.fen, s.place);
      ok(valid.length > 0, where, 'no square makes the idea work');
      ok(valid.includes(s.example), where, `example ${s.example} does not work; valid: ${valid.join(',')}`);
      ok(valid.length <= 4, where, `too many working squares (${valid.join(',')}); the exercise is not selective`);
      break;
    }
    case 'near-miss':
      await verifyNearMiss(where, s);
      fens.push(s.works === 'a' ? s.a : s.b);
      break;
    case 'puzzle':
      if (!checkFen(where, s.fen)) return;
      fens.push(s.fen);
      await verifyPuzzle(where, s);
      break;
    case 'choice':
      if (!checkFen(where, s.fen)) return;
      fens.push(s.fen);
      if (s.arrow) ok(boardFromFen(s.fen).has(s.arrow[0]), where, 'arrow starts on an empty square');
      await checkChoices(where, s.fen, s.choices);
      break;
  }
  if (s.claims?.length && fens[0]) await checkClaims(where, fens[0], s.claims);
}

/** FEN check that allows non-game positions (sandbox, diagrams). */
function checkFenLoose(where: string, fen: string): boolean {
  try {
    boardFromFen(fen);
    checks++;
    return true;
  } catch (e) {
    fail(where, (e as Error).message);
    return false;
  }
}

async function verifyNearMiss(where: string, s: Extract<Step, { kind: 'near-miss' }>) {
  if (!checkFen(`${where} (a)`, s.a) || !checkFen(`${where} (b)`, s.b)) return;
  const works = s.works === 'a' ? s.a : s.b;
  const fails = s.works === 'a' ? s.b : s.a;
  const ba = boardFromFen(s.a);
  const bb = boardFromFen(s.b);
  const diff = ALL_SQUARES.filter((q) => {
    const x = ba.get(q);
    const y = bb.get(q);
    return x?.color !== y?.color || x?.role !== y?.role;
  });
  ok(sameSet(diff, s.diff), where, `diff squares ${JSON.stringify(s.diff)} but boards differ on ${JSON.stringify(diff)}`);
  ok(diff.length >= 1 && diff.length <= 3, where, `boards should differ by a small change, got ${diff.length} squares`);
  ok(s.a.split(' ')[1] === s.b.split(' ')[1], where, 'both positions need the same side to move');
  if (!ok(isLegal(works, s.move) && isLegal(fails, s.move), where, `${s.move} must be legal in both positions`)) return;
  const [best] = await bestTwo(works);
  const sw = await scoreOf(works, s.move);
  const sf = await scoreOf(fails, s.move);
  ok(best.move === s.move, where, `in the working position the engine prefers ${describe(works, best.move)} over ${describe(works, s.move)}`);
  ok(sw >= WINNING, where, `${s.move} should win in the working position, scores ${fmtScore(sw)}`);
  ok(sf <= NOT_WINNING, where, `${s.move} should fail in the other position, scores ${fmtScore(sf)}`);
  ok(sw - sf >= NEAR_MISS_GAP, where, `outcomes too close: ${fmtScore(sw)} vs ${fmtScore(sf)}`);
  await checkChoices(where, fails, s.choices);
}

async function verifyPuzzle(where: string, s: Extract<Step, { kind: 'puzzle' }>) {
  ok(s.line.length % 2 === 1, where, 'line must end on a learner move');
  ok(s.hints.length >= 1, where, 'puzzles need at least one hint (there is no skip button)');
  let fen = s.fen;
  for (const [i, m] of s.line.entries()) {
    const w = `${where} ply ${i + 1}`;
    if (!ok(isLegal(fen, m), w, `illegal move ${m}`)) return;
    const two = await bestTwo(fen);
    if (i % 2 === 0) {
      const top = two[0];
      if (!ok(top.move === m, w, `engine prefers ${describe(fen, top.move)} (${fmtScore(top.score)}) over ${describe(fen, m)}`)) return;
      const second = two[1];
      if (second) {
        const bothMate = top.score >= MATE - 1000 && second.score >= MATE - 1000;
        ok(
          !bothMate && top.score - second.score >= CLEAR_BEST,
          w,
          `${describe(fen, m)} not clearly best: ${fmtScore(top.score)} vs ${describe(fen, second.move)} ${fmtScore(second.score)} (margin ${CLEAR_BEST}cp)`,
        );
      }
      if (i === 0 && s.goal === 'win') ok(top.score >= WINNING, w, `goal is 'win' but best scores only ${fmtScore(top.score)}`);
    } else {
      const sm = await scoreOf(fen, m);
      ok(two[0].score - sm <= DEFENSE_TOLERANCE, w, `reply ${describe(fen, m)} (${fmtScore(sm)}) is not a real defence; best is ${describe(fen, two[0].move)} (${fmtScore(two[0].score)})`);
    }
    fen = playLine(fen, [m]);
  }
  for (const [i, sc] of (s.scaffold ?? []).entries()) {
    checkTapQuery(`${where} scaffold ${i + 1}`, s.fen, sc.find);
    ok(computeTap(s.fen, sc.find).length > 0, `${where} scaffold ${i + 1}`, 'scaffold question has no answer');
  }
  if (s.tempting) {
    const w = `${where} tempting`;
    const t = s.tempting;
    if (!ok(isLegal(s.fen, t.move), w, `illegal tempting move ${t.move}`)) return;
    ok(t.move !== s.line[0], w, 'tempting move equals the solution');
    const [best] = await bestTwo(s.fen);
    const st = await scoreOf(s.fen, t.move);
    ok(best.score - st >= TEMPTING_GAP, w, `${describe(s.fen, t.move)} (${fmtScore(st)}) is not clearly worse than ${fmtScore(best.score)}`);
    let f = playLine(s.fen, [t.move]);
    for (const [j, m] of t.refutation.entries()) {
      if (!ok(isLegal(f, m), w, `refutation move ${j + 1} ${m} illegal`)) return;
      const [b] = await bestTwo(f);
      const sm = await scoreOf(f, m);
      ok(b.score - sm <= DEFENSE_TOLERANCE, w, `refutation move ${describe(f, m)} (${fmtScore(sm)}) is not best play; engine: ${describe(f, b.move)} (${fmtScore(b.score)})`);
      f = playLine(f, [m]);
    }
    ok(t.refutation.length >= 1, w, 'show at least one refuting move');
  }
  if (s.reasons) await checkChoices(`${where} reasons`, s.fen, s.reasons.choices);
}

async function verifyGame(where: string, g: MasterGame) {
  const c = new Chess();
  const fens: string[] = [];
  for (const [i, san] of g.moves.entries()) {
    fens.push(c.fen());
    try {
      c.move(san);
    } catch {
      fail(where, `illegal move ${i + 1}: ${san} in ${c.fen()}`);
      return;
    }
    checks++;
  }
  ok(g.guessFrom >= 0 && g.guessFrom < g.moves.length, where, 'guessFrom out of range');
  ok((g.guessFrom % 2 === 0) === (g.side === 'w'), where, 'guessFrom must be a move by the learner side');
  for (const k of [...Object.keys(g.notes), ...Object.keys(g.prompts ?? {})]) {
    ok(Number(k) >= 0 && Number(k) < g.moves.length, where, `note/prompt key ${k} out of range`);
  }
  const resultOk = c.isCheckmate() ? (c.turn() === 'w' ? '0-1' : '1-0') === g.result : true;
  ok(resultOk, where, `result ${g.result} does not match the final position`);
  for (const cl of g.claims ?? []) {
    checks++;
    if (!(await checkClaim(`${where} ply ${cl.ply}`, fens[cl.ply], cl))) fail(`${where} ply ${cl.ply}`, `claim does not hold: ${JSON.stringify(cl)}`);
  }
}

// ---------- main ----------
function readJson<T>(p: string): T {
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

async function main() {
  const t0 = Date.now();
  engine = await Engine.start('single');
  const units = readJson<Unit[]>('content/units.json');
  const lessonFiles = readdirSync('content/lessons').filter((f) => f.endsWith('.json'));
  const lessons = lessonFiles.map((f) => readJson<Lesson>(join('content/lessons', f)));
  const games = readdirSync('content/games')
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson<MasterGame>(join('content/games', f)));

  const ids = new Set<string>();
  const lessonIds = new Set(lessons.map((l) => l.id));
  for (const u of units) {
    for (const l of u.lessons) ok(lessonIds.has(l), `unit ${u.id}`, `missing lesson ${l}`);
    if (u.game) ok(games.some((g) => g.id === u.game), `unit ${u.id}`, `missing game ${u.game}`);
  }
  for (const l of lessons) {
    for (const s of l.steps) {
      const where = `${l.id}/${s.id}`;
      ok(!ids.has(s.id), where, 'duplicate step id');
      ids.add(s.id);
      try {
        await verifyStep(where, s);
      } catch (e) {
        fail(where, `crashed: ${(e as Error).stack}`);
      }
    }
  }
  for (const g of games) await verifyGame(`game ${g.id}`, g);

  engine.quit();
  if (USE_CACHE) writeFileSync(CACHE_FILE, JSON.stringify(cache));
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  for (const w of warnings) console.warn(`warn  ${w}`);
  if (errors.length) {
    for (const e of errors) console.error(`FAIL  ${e}`);
    console.error(`\n${errors.length} problem(s) in ${checks} checks (depth ${DEPTH}, ${secs}s).`);
    process.exit(1);
  }
  console.log(`Content verified: ${lessons.length} lessons, ${ids.size} steps, ${games.length} game(s), ${checks} checks at depth ${DEPTH} in ${secs}s.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
