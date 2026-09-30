import { BoardView } from '../board/board';
import { boardFromFen, type Square } from '../chess/rules';
import { analyse, describeScore } from '../engine/client';
import { san } from '../content/present';
import { computeTap, playLine } from '../content/queries';
import type { PuzzleStep } from '../content/types';
import { settings } from '../progress/store';
import { h } from '../ui/dom';
import { line, prose } from '../ui/text';
import { choices, layout, sideToMove, toMoveLabel, type Mount } from './common';
import { whyNot } from './tap';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mountPuzzle: Mount<PuzzleStep> = (root, step, ctx) => {
  const L = layout(root);
  const learner = sideToMove(step.fen);
  let fen = step.fen;
  let ply = 0;
  let tries = 0;
  let hints = 0;
  let busy = false;
  let alive = true;
  let tapPicked = new Set<Square>();
  let tapStage = -1;

  const board = new BoardView({
    fen,
    orientation: learner,
    mode: 'view',
    onMove: (uci) => void onMove(uci),
    onTap: (sq) => onTap(sq),
  });
  L.boardSlot.appendChild(board.el);

  const head = h('div', null, /to move/i.test(step.prompt) ? null : h('p', { class: 'muted small' }, toMoveLabel(step.fen, ctx.t)), h('p', { class: 'lead' }, line(step.prompt, ctx.t)));
  L.prompt.appendChild(head);
  if (settings().routine) {
    L.prompt.appendChild(
      h('p', { class: 'routine' }, 'Before you move: what did they threaten? What is loose? Checks, captures, threats. Then blunder-check your move.'),
    );
  }

  const stageBox = h('div', { class: 'stage' });
  L.body.appendChild(stageBox);

  // ---- hints (no skip button: perseverance) ----
  const hintBox = h('div', { class: 'hints' });
  const hintBtn = h('button', { class: 'btn', type: 'button' }) as HTMLButtonElement;
  const updateHintBtn = () => {
    const left = step.hints.length - hints;
    hintBtn.textContent = left > 0 ? `Hint (${left} left)` : 'No more hints. You can do this.';
    hintBtn.disabled = left <= 0;
  };
  hintBtn.addEventListener('click', () => {
    if (hints >= step.hints.length) return;
    hintBox.appendChild(h('p', { class: 'hint' }, line(step.hints[hints], ctx.t)));
    hints++;
    updateHintBtn();
  });
  updateHintBtn();

  // ---- scaffold: reason before moving ----
  const scaffold = ctx.scaffolds ? [...(step.scaffold ?? [])] : [];

  function startScaffold(i: number) {
    tapStage = i;
    tapPicked = new Set();
    const sc = scaffold[i];
    board.setMode('tap', fen);
    board.clearAnnotations();
    stageBox.replaceChildren(
      h('p', { class: 'eyebrow' }, `Reason first · ${i + 1} of ${scaffold.length}`),
      h('p', { class: 'question' }, line(sc.prompt, ctx.t)),
    );
    const check = h('button', { class: 'btn btn-primary', type: 'button' }, 'Check') as HTMLButtonElement;
    const skip = h('button', { class: 'btn btn-quiet', type: 'button' }, 'Skip the reasoning steps') as HTMLButtonElement;
    check.addEventListener('click', () => {
      const ans = computeTap(fen, sc.find);
      const wrong = [...tapPicked].filter((s) => !ans.includes(s));
      const missing = ans.filter((s) => !tapPicked.has(s));
      if (!wrong.length && !missing.length) {
        board.setMarks(ans, 'mark-good');
        L.feedback.replaceChildren();
        setTimeout(() => (i + 1 < scaffold.length ? startScaffold(i + 1) : startMoving()), 700);
        return;
      }
      const b = boardFromFen(fen);
      const msg = [
        ...wrong.map((s) => whyNot(b, sc.find, s)),
        missing.length ? (missing.length === 1 ? 'There is one more.' : `There are ${missing.length} more.`) : '',
      ].join(' ');
      wrong.forEach((s) => tapPicked.delete(s));
      paintTaps(new Map(wrong.map((s) => [s, 'mark-bad'])));
      L.feedback.replaceChildren(h('div', { class: 'note note-bad' }, prose(msg)));
    });
    skip.addEventListener('click', () => startMoving());
    L.actions.replaceChildren(check, skip);
  }

  function paintTaps(extra?: Map<Square, string>) {
    const m = new Map<Square, string>([...tapPicked].map((s) => [s, 'mark-tap']));
    extra?.forEach((v, k) => m.set(k, v));
    board.setMarks(m);
  }

  function onTap(sq: Square) {
    if (tapStage < 0) return;
    board.unselect();
    if (tapPicked.has(sq)) tapPicked.delete(sq);
    else tapPicked.add(sq);
    paintTaps();
  }

  function startMoving() {
    tapStage = -1;
    board.clearAnnotations();
    board.setMode('move', fen);
    L.feedback.replaceChildren();
    stageBox.replaceChildren(h('p', { class: 'question' }, 'Your move.'), hintBox);
    L.actions.replaceChildren(hintBtn);
  }

  async function onMove(uci: string) {
    if (busy) return;
    busy = true;
    board.setMode('view', fen);
    const expected = step.line[ply];
    const same = uci.slice(0, 4) === expected.slice(0, 4);
    if (same) {
      const moveSan = san(fen, expected);
      fen = playLine(fen, [expected]);
      board.setPosition(fen, [expected.slice(0, 2), expected.slice(2, 4)]);
      ply++;
      if (ply >= step.line.length) {
        busy = false;
        return solved(moveSan);
      }
      L.feedback.replaceChildren(h('div', { class: 'note note-good' }, h('p', null, `${moveSan}. Good. Keep going.`)));
      await sleep(600);
      if (!alive) return;
      const reply = step.line[ply];
      const replySan = san(fen, reply);
      fen = playLine(fen, [reply]);
      board.playMove(reply, fen);
      ply++;
      L.feedback.replaceChildren(h('div', { class: 'note' }, h('p', null, `They reply ${replySan}. Your move.`)));
      board.setMode('move', fen);
      busy = false;
      return;
    }
    tries++;
    const before = fen;
    const tried = san(before, uci);
    const after = playLine(before, [uci]);
    board.setPosition(after, [uci.slice(0, 2), uci.slice(2, 4)]);
    if (ply === 0 && step.tempting && uci.slice(0, 4) === step.tempting.move.slice(0, 4)) {
      // The tempting move: show the verified refutation plainly (humility).
      let f = after;
      const sans: string[] = [];
      for (const m of step.tempting.refutation) {
        await sleep(650);
        if (!alive) return;
        sans.push(san(f, m));
        f = playLine(f, [m]);
        board.playMove(m, f);
      }
      L.feedback.replaceChildren(
        h(
          'div',
          { class: 'note note-bad' },
          h('p', null, h('strong', null, `${tried} is tempting. `), `The answer: ${sans.join(' ')}.`),
          prose(step.tempting.explain, ctx.t),
        ),
      );
    } else {
      // Any other move: ask the engine for the best reply and show it.
      L.feedback.replaceChildren(h('div', { class: 'note' }, h('p', null, `${tried}… let's see how they answer.`)));
      try {
        const r = await analyse(after, { movetime: 700 });
        if (!alive) return;
        if (r.move && r.move !== '(none)') {
          const rs = san(after, r.move);
          const f = playLine(after, [r.move]);
          board.playMove(r.move, f);
          const verdict = describeScore(-r.score);
          L.feedback.replaceChildren(
            h('div', { class: 'note note-bad' }, h('p', null, `After ${tried}, they answer ${rs}, and your move ${verdict}. There is something stronger.`)),
          );
        }
      } catch {
        L.feedback.replaceChildren(h('div', { class: 'note note-bad' }, h('p', null, `${tried} isn't it. There is something stronger.`)));
      }
    }
    const back = h('button', { class: 'btn btn-primary', type: 'button' }, 'Take it back and try again') as HTMLButtonElement;
    back.addEventListener('click', () => {
      board.setPosition(before);
      board.setMode('move', before);
      board.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      L.actions.replaceChildren(hintBtn);
      busy = false;
    });
    L.actions.replaceChildren(back, hintBtn);
  }

  function solved(lastSan: string) {
    board.setMode('view', fen);
    L.actions.replaceChildren();
    L.feedback.replaceChildren(h('div', { class: 'note note-good' }, h('p', null, `${lastSan}. That's it.`)));
    const finish = (extraTries: number) => {
      stageBox.appendChild(h('div', { class: 'note note-good' }, prose(step.explain, ctx.t)));
      ctx.done({ tries: tries + 1 + extraTries, hints });
    };
    if (step.reasons) {
      stageBox.replaceChildren();
      choices(stageBox, step.reasons.question, step.reasons.choices, step.fen, ctx.t, (t) => finish(t > 1 ? 1 : 0));
    } else {
      stageBox.replaceChildren();
      finish(0);
    }
  }

  if (scaffold.length) {
    startScaffold(0);
  } else {
    startMoving();
    if (step.scaffold?.length) {
      const show = h('button', { class: 'btn btn-quiet', type: 'button' }, 'Walk me through the reasoning') as HTMLButtonElement;
      show.addEventListener('click', () => {
        show.remove();
        scaffold.push(...(step.scaffold ?? []));
        startScaffold(0);
      });
      L.actions.appendChild(show);
    }
  }
  return () => {
    alive = false;
    board.destroy();
  };
};
