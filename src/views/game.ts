import { Chess } from 'chess.js';
import { BoardView } from '../board/board';
import { games } from '../content/index';
import type { MasterGame } from '../content/types';
import { analyse, describeScore } from '../engine/client';
import type { Cleanup } from '../exercises/common';
import { markGame, progress } from '../progress/store';
import { h } from '../ui/dom';
import { prose } from '../ui/text';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Ply {
  san: string;
  uci: string;
  before: string;
  after: string;
}

function plies(g: MasterGame): Ply[] {
  const c = new Chess();
  return g.moves.map((san) => {
    const before = c.fen();
    const m = c.move(san);
    return { san: m.san, uci: m.from + m.to + (m.promotion ?? ''), before, after: c.fen() };
  });
}

function moveNo(i: number) {
  return `${Math.floor(i / 2) + 1}${i % 2 === 0 ? '.' : '…'}`;
}

export function gameView(root: HTMLElement, id: string): Cleanup {
  const g = games[id];
  if (!g) {
    root.appendChild(h('p', null, 'That game does not exist.'));
    return () => {};
  }
  const P = plies(g);
  let alive = true;
  let i = 0;
  let matched = 0;
  let asked = 0;

  const board = new BoardView({ fen: new Chess().fen(), orientation: g.side, mode: 'view', onMove: (u) => void guess(u) });
  const movesEl = h('ol', { class: 'movelist' });
  const noteEl = h('div', { class: 'game-note', 'aria-live': 'polite' });
  const actions = h('div', { class: 'ex-actions' });
  const score = h('p', { class: 'muted small' });
  const panel = h('div', { class: 'ex-panel' }, noteEl, actions, score, movesEl);
  const layoutEl = h('div', { class: 'exercise' }, h('div', { class: 'ex-board' }, board.el), panel);

  root.append(
    h('header', { class: 'lesson-head' }, h('p', { class: 'eyebrow' }, `Master game · ${g.event} ${g.year}`), h('h1', null, g.title), h('p', { class: 'muted' }, `${g.white} – ${g.black}`)),
    layoutEl,
  );

  const intro = () => {
    noteEl.replaceChildren(prose(g.intro), h('p', { class: 'muted small' }, g.source));
    const start = h('button', { class: 'btn btn-primary', type: 'button' }, 'Begin');
    start.addEventListener('click', () => advance());
    const prev = progress().games[id];
    actions.replaceChildren(start);
    if (prev?.done) score.textContent = `Last time you matched ${prev.matched} of ${prev.total} of ${g.white.split(' ').pop()}'s moves.`;
  };

  function renderMoves() {
    movesEl.replaceChildren(
      ...P.slice(0, i).map((p, k) => h('li', { class: k === i - 1 ? 'current' : '' }, `${moveNo(k)} ${p.san}`)),
    );
    movesEl.lastElementChild?.scrollIntoView({ block: 'nearest' });
  }

  function isLearnerPly(k: number) {
    return k >= g.guessFrom && (k % 2 === 0) === (g.side === 'w');
  }

  function show(k: number) {
    const p = P[k];
    board.playMove(p.uci, p.after);
    i = k + 1;
    renderMoves();
    const note = g.notes[String(k)];
    return note;
  }

  async function advance() {
    if (!alive) return;
    if (i >= P.length) return finish();
    if (isLearnerPly(i)) return askGuess();
    const note = show(i);
    noteEl.replaceChildren(h('p', { class: 'move-played' }, `${moveNo(i - 1)} ${P[i - 1].san}`), ...(note ? [prose(note)] : []));
    const auto = i > g.guessFrom; // opponent replies play by themselves once guessing starts
    if (auto) {
      await sleep(700);
      return advance();
    }
    const next = h('button', { class: 'btn btn-primary', type: 'button' }, i < g.guessFrom ? 'Next move' : 'Continue');
    next.addEventListener('click', () => void advance());
    const jump = h('button', { class: 'btn btn-quiet', type: 'button' }, 'Skip to the first guess');
    jump.addEventListener('click', () => {
      while (i < g.guessFrom) show(i);
      void advance();
    });
    actions.replaceChildren(next, ...(i < g.guessFrom - 1 ? [jump] : []));
  }

  function askGuess() {
    const prompt = g.prompts?.[String(i)];
    noteEl.replaceChildren(
      h('p', { class: 'eyebrow' }, `Your guess · move ${moveNo(i)}`),
      prompt ? prose(prompt) : h('p', null, `What would you play here?`),
    );
    board.setMode('move', P[i].before);
    const reveal = h('button', { class: 'btn btn-quiet', type: 'button' }, 'Not sure. Show the move');
    reveal.addEventListener('click', () => void guess(null));
    actions.replaceChildren(reveal);
    score.textContent = asked ? `Matched ${matched} of ${asked} so far.` : '';
  }

  async function guess(uci: string | null) {
    const p = P[i];
    board.setMode('view', p.before);
    asked++;
    const same = uci && uci.slice(0, 4) === p.uci.slice(0, 4);
    const master = g.white.split(' ').pop();
    actions.replaceChildren();
    if (same) {
      matched++;
      const note = show(i);
      noteEl.replaceChildren(h('div', { class: 'note note-good' }, h('p', null, `${p.san}. Same as ${master}.`)), ...(note ? [prose(note)] : []));
    } else {
      let compare = '';
      if (uci) {
        const mine = new Chess(p.before).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: 'q' }).san;
        board.setPosition(p.before);
        noteEl.replaceChildren(h('p', null, `You chose ${mine}. ${master} played ${p.san}. Asking the engine to compare…`));
        try {
          const [a, b] = [await analyse(p.before, { movetime: 600, searchmoves: [uci] }), await analyse(p.before, { movetime: 600, searchmoves: [p.uci] })];
          if (!alive) return;
          compare = `The engine says your ${mine} ${describeScore(a.score)}, and ${p.san} ${describeScore(b.score)}.`;
          if (Math.abs(a.score - b.score) < 40) compare += ' Your move is about as good.';
        } catch {
          compare = '';
        }
        compare = `You chose ${mine}. ${master} played ${p.san}. ${compare}`;
      } else {
        compare = `${master} played ${p.san}.`;
      }
      board.setArrows([{ from: p.uci.slice(0, 2), to: p.uci.slice(2, 4), brush: 'green' }]);
      await sleep(500);
      if (!alive) return;
      board.setArrows([]);
      const note = show(i);
      noteEl.replaceChildren(h('div', { class: 'note' }, h('p', null, compare)), ...(note ? [prose(note)] : []));
    }
    score.textContent = `Matched ${matched} of ${asked} so far.`;
    const next = h('button', { class: 'btn btn-primary', type: 'button' }, 'Continue');
    next.addEventListener('click', () => void advance());
    actions.replaceChildren(next);
  }

  function finish() {
    markGame(id, matched, asked);
    noteEl.replaceChildren(
      h('h2', null, g.result === '1-0' ? 'White wins' : g.result === '0-1' ? 'Black wins' : 'Drawn'),
      prose(g.outro),
      h('p', null, `You matched ${matched} of ${asked} moves. The number matters less than whether you can now explain each of them.`),
    );
    actions.replaceChildren(
      h('a', { class: 'btn btn-primary', href: '#/' }, 'Home'),
      h('a', { class: 'btn btn-quiet', href: '#/practice' }, 'Practise'),
    );
  }

  intro();
  return () => {
    alive = false;
    board.destroy();
  };
}
