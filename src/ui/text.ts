// Renders lesson prose: paragraphs, numbered lists, **bold**, *italic*, and
// the @square / @W colour tokens (see chess/transform.ts).

import { renderText, type Transform, IDENTITY } from '../chess/transform';
import { h } from './dom';

function inline(text: string): (Node | string)[] {
  const out: (Node | string)[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? h('strong', null, m[1]) : h('em', null, m[2]));
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Prose block: blank lines split paragraphs, "1. " lines form a list. */
export function prose(text: string, t: Transform = IDENTITY): HTMLElement {
  const wrap = h('div', { class: 'prose' });
  for (const para of renderText(text, t).split(/\n\s*\n/)) {
    const lines = para.split('\n');
    if (lines.every((l) => /^\d+\.\s/.test(l))) {
      wrap.appendChild(h('ol', null, lines.map((l) => h('li', null, inline(l.replace(/^\d+\.\s/, ''))))));
    } else {
      wrap.appendChild(h('p', null, inline(para)));
    }
  }
  return wrap;
}

/** One line of text with tokens and inline emphasis. */
export function line(text: string, t: Transform = IDENTITY): (Node | string)[] {
  return inline(renderText(text, t));
}
