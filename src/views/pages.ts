import { BoardView } from '../board/board';
import { renderText, IDENTITY } from '../chess/transform';
import { allGradedSteps, canTransformStep, games, lessonOrder, lessons, units } from '../content/index';
import { allowedTransforms, san, transformStep } from '../content/present';
import { playLine } from '../content/queries';
import { CONCEPT_LABEL, type Concept } from '../content/types';
import type { Cleanup } from '../exercises/common';
import { mountStep } from '../exercises/index';
import { mountSandboxBoard } from '../exercises/sandbox';
import {
  conceptScore,
  conceptStatus,
  exportJson,
  importJson,
  progress,
  recordAttempt,
  resetProgress,
  settings,
  updateSettings,
  type Settings,
} from '../progress/store';
import { h } from '../ui/dom';
import { prose } from '../ui/text';
import { wantScaffolds } from './lesson';

const STAGE = { grammar: 'Grammar', logic: 'Logic', rhetoric: 'Rhetoric' } as const;

function nextLesson() {
  const p = progress();
  return lessonOrder().find((l) => !p.lessons[l.id]?.done);
}

// ---------------- home ----------------

export function homeView(root: HTMLElement): Cleanup {
  const p = progress();
  const started = Object.keys(p.lessons).length > 0;
  const fen = '2r3k1/pp1b1ppp/2n5/4p3/8/2N2N2/PPP2PPP/3R2K1 w - - 0 1';
  const answer = 'd1d7';
  const feedback = h('div', { class: 'ex-feedback', 'aria-live': 'polite' });
  const board = new BoardView({
    fen,
    orientation: 'w',
    mode: 'move',
    onMove: (uci) => {
      if (uci === answer) {
        board.setPosition(playLine(fen, [uci]), ['d1', 'd7']);
        board.setMode('view');
        feedback.replaceChildren(
          h(
            'div',
            { class: 'note note-good' },
            h('p', null, 'Yes. Rxd7 wins a bishop, because nothing defends it.'),
            h('p', null, 'That question, “what is loose?”, is where this course begins. Everything else is built on questions like it.'),
          ),
        );
      } else {
        const s = san(fen, uci);
        board.setPosition(fen);
        board.setMode('move', fen);
        feedback.replaceChildren(
          h('div', { class: 'note' }, h('p', null, `${s} is possible, but it doesn't win anything. Look for a black piece that nothing defends.`)),
        );
      }
    },
  });
  const cont = nextLesson();
  const hero = h(
    'section',
    { class: 'hero exercise' },
    h('div', { class: 'ex-board' }, board.el),
    h(
      'div',
      { class: 'ex-panel' },
      h('p', { class: 'eyebrow' }, 'White to move'),
      h('h1', { class: 'hero-q' }, 'Is anything free here?'),
      h('p', { class: 'muted' }, 'Move a piece to answer. No account, no timer.'),
      feedback,
      h(
        'div',
        { class: 'ex-actions' },
        cont
          ? h('a', { class: 'btn btn-primary', href: `#/lesson/${cont.id}` }, started ? `Continue: ${cont.title}` : 'Start the first lesson')
          : h('a', { class: 'btn btn-primary', href: '#/practice' }, 'Practise'),
      ),
    ),
  );
  root.append(hero, unitsList());
  return () => board.destroy();
}

function unitsList() {
  const p = progress();
  return h(
    'section',
    { class: 'units' },
    h('h2', null, 'The course'),
    units.map((u) => {
      const done = u.lessons.filter((id) => p.lessons[id]?.done).length;
      return h(
        'a',
        { class: 'unit-card', href: `#/unit/${u.id}` },
        h('span', { class: 'eyebrow' }, `Unit ${u.id}`),
        h('strong', null, u.title),
        h('span', { class: 'muted small' }, u.summary),
        h('span', { class: 'muted small' }, `${done} of ${u.lessons.length} lessons${u.game ? ' · 1 master game' : ''}`),
      );
    }),
    h('p', { class: 'muted small' }, 'Later units (checkmate patterns, openings, strategy, endgames, and a thinking routine) are planned.'),
  );
}

// ---------------- unit ----------------

export function unitView(root: HTMLElement, idStr: string): Cleanup {
  const u = units.find((x) => String(x.id) === idStr);
  if (!u) {
    root.appendChild(h('p', null, 'No such unit.'));
    return () => {};
  }
  const p = progress();
  root.append(
    h('header', { class: 'lesson-head' }, h('p', { class: 'eyebrow' }, `Unit ${u.id}`), h('h1', null, u.title), h('p', null, u.summary)),
    h(
      'ol',
      { class: 'lesson-list' },
      u.lessons.map((id) => {
        const l = lessons[id];
        const st = p.lessons[id];
        return h(
          'li',
          null,
          h(
            'a',
            { href: `#/lesson/${id}`, class: 'lesson-link' },
            h('span', { class: 'eyebrow' }, STAGE[l.stage]),
            h('strong', null, l.title),
            h('span', { class: 'muted small' }, l.summary),
            h('span', { class: `status ${st?.done ? 'is-done' : st ? 'is-started' : ''}` }, st?.done ? 'Done' : st ? 'Started' : ''),
          ),
        );
      }),
      u.game
        ? h(
            'li',
            null,
            h(
              'a',
              { href: `#/game/${u.game}`, class: 'lesson-link' },
              h('span', { class: 'eyebrow' }, 'Master game'),
              h('strong', null, games[u.game]?.title ?? u.game),
              h('span', { class: 'muted small' }, `${games[u.game]?.white} – ${games[u.game]?.black}, ${games[u.game]?.year}`),
              h('span', { class: `status ${p.games[u.game]?.done ? 'is-done' : ''}` }, p.games[u.game]?.done ? 'Done' : ''),
            ),
          )
        : null,
    ),
  );
  return () => {};
}

// ---------------- practice ----------------

/**
 * Picks the weakest concept among those the learner has met, then a graded
 * step for it that was seen least recently, shown with a random colour
 * flip or mirror where the step allows it.
 */
export function practiceView(root: HTMLElement): Cleanup {
  let cleanup: Cleanup = () => {};
  const host = h('div');
  root.append(h('header', { class: 'lesson-head' }, h('p', { class: 'eyebrow' }, 'Practice'), h('h1', null, 'Work on what is weakest')), host);
  let lastId = '';

  function pick() {
    const p = progress();
    const pool = allGradedSteps().filter(({ lesson }) => p.lessons[lesson.id]);
    if (!pool.length) return null;
    const concepts = [...new Set(pool.flatMap(({ step }) => step.concepts))] as Concept[];
    concepts.sort((a, b) => conceptScore(a) - conceptScore(b));
    const weakest = concepts.slice(0, 2);
    const cands = pool.filter(({ step }) => step.id !== lastId && step.concepts.some((c) => weakest.includes(c)));
    const list = cands.length ? cands : pool.filter(({ step }) => step.id !== lastId);
    list.sort((a, b) => (p.steps[a.step.id]?.at ?? 0) - (p.steps[b.step.id]?.at ?? 0));
    const choice = list[Math.floor(Math.random() * Math.min(3, list.length))] ?? pool[0];
    const concept = weakest.find((c) => choice.step.concepts.includes(c)) ?? choice.step.concepts[0];
    return { ...choice, concept };
  }

  function render() {
    cleanup();
    host.replaceChildren();
    const next = pick();
    if (!next) {
      host.appendChild(h('p', null, 'Practice draws on lessons you have started. Begin with the first lesson.'));
      host.appendChild(h('a', { class: 'btn btn-primary', href: `#/lesson/${lessonOrder()[0].id}` }, 'Start'));
      return;
    }
    lastId = next.step.id;
    const ts = canTransformStep(next.step) ? allowedTransforms(next.step) : [IDENTITY];
    const t = ts[Math.floor(Math.random() * ts.length)];
    const step = transformStep(next.step, t);
    host.appendChild(h('p', { class: 'muted small' }, `Concept: ${CONCEPT_LABEL[next.concept]} · from “${next.lesson.title}”${t.flip || t.mirror ? ' · shown from a new angle' : ''}`));
    const stepHost = h('div');
    const nav = h('div', { class: 'lesson-nav' });
    host.append(stepHost, nav);
    const btn = h('button', { class: 'btn btn-primary', type: 'button', disabled: true }, 'Next exercise') as HTMLButtonElement;
    btn.addEventListener('click', () => {
      render();
      window.scrollTo({ top: 0 });
    });
    nav.appendChild(btn);
    cleanup = mountStep(stepHost, step, {
      t,
      scaffolds: step.kind === 'puzzle' && wantScaffolds(step),
      done: (r) => {
        recordAttempt(next.step.id, next.step.concepts, r.tries, r.hints);
        btn.disabled = false;
      },
    });
  }
  render();
  return () => cleanup();
}

// ---------------- progress ----------------

export function progressView(root: HTMLElement): Cleanup {
  const p = progress();
  const concepts = Object.keys(CONCEPT_LABEL) as Concept[];
  const statusText = { new: 'Not started', practising: 'Practising', understood: 'Understood' } as const;
  const understood = concepts.filter((c) => conceptStatus(c) === 'understood').length;
  const gamesDone = Object.values(p.games).filter((g) => g.done).length;
  const msg = h('div', { 'aria-live': 'polite' });

  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'visually-hidden', id: 'import-file' }) as HTMLInputElement;
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    if (!confirm('Replace the progress on this device with the imported file?')) return;
    const r = importJson(await f.text());
    msg.replaceChildren(h('div', { class: `note ${r.ok ? 'note-good' : 'note-bad'}` }, h('p', null, r.ok ? 'Progress imported.' : r.error)));
    if (r.ok) setTimeout(() => location.reload(), 600);
  });

  root.append(
    h('header', { class: 'lesson-head' }, h('p', { class: 'eyebrow' }, 'Progress'), h('h1', null, 'What you understand')),
    h('p', { class: 'lead' }, `${understood} of ${concepts.length} concepts understood · ${gamesDone} master game${gamesDone === 1 ? '' : 's'} completed`),
    h(
      'ul',
      { class: 'concepts' },
      concepts.map((c) => {
        const st = conceptStatus(c);
        return h(
          'li',
          { class: `concept is-${st}` },
          h('span', null, CONCEPT_LABEL[c]),
          h('span', { class: 'muted small' }, statusText[st]),
        );
      }),
    ),
    h('p', { class: 'muted small' }, 'A concept counts as understood after you have solved several different exercises on it cleanly, recently. There are no streaks and nothing expires.'),
    h('h2', null, 'Your data'),
    h('p', null, 'Everything is stored only in this browser. Export a copy to keep it safe or move it to another device.'),
    h(
      'div',
      { class: 'ex-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => void exportProgress(msg) }, 'Export progress'),
      h('label', { class: 'btn', for: 'import-file' }, 'Import progress'),
      fileInput,
      h(
        'button',
        {
          class: 'btn btn-quiet',
          type: 'button',
          onclick: () => {
            if (confirm('Erase all progress on this device? This cannot be undone unless you exported it.')) {
              resetProgress();
              location.reload();
            }
          },
        },
        'Reset',
      ),
    ),
    msg,
  );
  return () => {};
}

async function exportProgress(msg: HTMLElement) {
  const text = exportJson();
  const name = `trivium-chess-progress-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([text], name, { type: 'application/json' });
  // iOS Safari: the share sheet is the reliable way to save a file.
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (/iPad|iPhone|iPod/.test(navigator.userAgent) && nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Trivium Chess progress' });
      return;
    } catch {
      /* fall through to download */
    }
  }
  const url = URL.createObjectURL(file);
  const a = h('a', { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  msg.replaceChildren(h('div', { class: 'note note-good' }, h('p', null, `Saved ${name}.`)));
}

// ---------------- settings ----------------

export function settingsView(root: HTMLElement): Cleanup {
  const s = settings();
  const check = (key: keyof Settings, label: string, help: string) => {
    const input = h('input', { type: 'checkbox' }) as HTMLInputElement;
    input.checked = Boolean(s[key]);
    input.addEventListener('change', () => updateSettings({ [key]: input.checked } as Partial<Settings>));
    return h('label', { class: 'setting' }, input, h('span', null, h('strong', null, label), h('span', { class: 'muted small' }, help)));
  };
  const sel = h('select', null, ...(['auto', 'always', 'never'] as const).map((v) => h('option', { value: v, selected: s.scaffolds === v }, v === 'auto' ? 'Fade as I improve' : v === 'always' ? 'Always show' : 'Never show'))) as HTMLSelectElement;
  sel.addEventListener('change', () => updateSettings({ scaffolds: sel.value as Settings['scaffolds'] }));
  root.append(
    h('header', { class: 'lesson-head' }, h('p', { class: 'eyebrow' }, 'Settings'), h('h1', null, 'Settings')),
    h(
      'div',
      { class: 'settings' },
      check('routine', 'Blunder-check reminder', 'Show the before-you-move routine above puzzles.'),
      check('coordinates', 'Board coordinates', 'Show file letters and rank numbers.'),
      h('label', { class: 'setting' }, h('span', null, h('strong', null, 'Reasoning steps in puzzles'), h('span', { class: 'muted small' }, 'Tap the loose pieces and threats before moving.')), sel),
    ),
    h('p', { class: 'muted small' }, 'Dark mode and reduced motion follow your device settings.'),
  );
  return () => {};
}

// ---------------- sandbox ----------------

export function sandboxView(root: HTMLElement): Cleanup {
  const boardSlot = h('div', { class: 'ex-board' });
  const body = h('div', { class: 'ex-body' });
  root.append(
    h('header', { class: 'lesson-head' }, h('p', { class: 'eyebrow' }, 'Sandbox'), h('h1', null, 'Try things')),
    h('div', { class: 'exercise' }, boardSlot, h('div', { class: 'ex-panel' }, h('p', null, 'Move pieces freely, drop new ones, and watch what becomes loose, pinned or forked. Tap a piece to see what it attacks.'), body)),
  );
  const board = mountSandboxBoard({ boardSlot, body }, 'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3', true);
  return () => board.destroy();
}

// ---------------- about ----------------

export function aboutView(root: HTMLElement): Cleanup {
  root.append(
    h('header', { class: 'lesson-head' }, h('p', { class: 'eyebrow' }, 'About'), h('h1', null, 'Trivium Chess')),
    prose(
      renderText(
        `A free place to learn chess by understanding it. It follows the old trivium: **grammar** (the few facts reasoning needs), **logic** (why things work), and **rhetoric** (explaining and defending what you see). Each unit ends with a master game.\n\nThere are no accounts, no ads, and no tracking. The app makes no network requests after it loads, and everything you do stays in this browser. It works offline once opened, and you can install it to your home screen.\n\nEvery position, solution and factual claim in the lessons is checked by Stockfish and a rules engine when the site is built. If a lesson says a piece is loose, the code has confirmed it. The teaching text was drafted for this project and reviewed against those checks.\n\nTrivium Chess is open source under the GNU GPL v3. It uses Stockfish.js (GPL v3), chessground (GPL v3), and chess.js (BSD).`,
        IDENTITY,
      ),
    ),
  );
  return () => {};
}

