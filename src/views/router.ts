// Hash router: works on any static host, including GitHub Pages subpaths.

import type { Cleanup } from '../exercises/common';

export type View = (root: HTMLElement, ...params: string[]) => Cleanup | void;

const routes: [RegExp, View][] = [];
let current: Cleanup | void;
let outlet: HTMLElement;

/** Register a view for a path regex; capture groups become view params. */
export function route(pattern: RegExp, view: View) {
  routes.push([pattern, view]);
}

export function navigate(path: string) {
  location.hash = '#' + path;
}

function resolve() {
  const path = location.hash.replace(/^#/, '') || '/';
  if (typeof current === 'function') current();
  current = undefined;
  outlet.replaceChildren();
  for (const [re, view] of routes) {
    const m = re.exec(path);
    if (m) {
      current = view(outlet, ...m.slice(1).filter((x) => x !== undefined));
      document.dispatchEvent(new CustomEvent('routechange', { detail: path }));
      return;
    }
  }
  navigate('/');
}

export function startRouter(el: HTMLElement) {
  outlet = el;
  window.addEventListener('hashchange', resolve);
  resolve();
}
