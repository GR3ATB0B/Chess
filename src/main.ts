import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.cburnett.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { h } from './ui/dom';
import { gameView } from './views/game';
import { lessonView } from './views/lesson';
import { aboutView, homeView, practiceView, progressView, sandboxView, settingsView, unitView } from './views/pages';
import { route, startRouter } from './views/router';

route(/^\/$/, homeView);
route(/^\/unit\/(\d+)$/, unitView);
route(/^\/lesson\/([\w-]+)(?:\/(\d+))?$/, lessonView);
route(/^\/game\/([\w-]+)$/, gameView);
route(/^\/practice$/, practiceView);
route(/^\/sandbox$/, sandboxView);
route(/^\/progress$/, progressView);
route(/^\/settings$/, settingsView);
route(/^\/about$/, aboutView);

const links: [string, string][] = [
  ['#/', 'Learn'],
  ['#/practice', 'Practice'],
  ['#/sandbox', 'Sandbox'],
  ['#/progress', 'Progress'],
];

const nav = h(
  'nav',
  { class: 'topnav', 'aria-label': 'Main' },
  links.map(([href, label]) => h('a', { href }, label)),
);
const header = h(
  'header',
  { class: 'site' },
  h('a', { class: 'brand', href: '#/' }, h('span', { class: 'brand-mark', 'aria-hidden': 'true' }, '♞'), 'Trivium Chess'),
  nav,
);
const main = h('main', { id: 'main' });
const footer = h('footer', { class: 'site' }, h('a', { href: '#/about' }, 'About'), ' · ', h('a', { href: '#/settings' }, 'Settings'), ' · ', 'Free and open source · Runs on your device');
document.getElementById('app')!.append(header, main, footer);

document.addEventListener('routechange', (e) => {
  const path = (e as CustomEvent<string>).detail;
  nav.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href')!.slice(1);
    const active = href === '/' ? path === '/' || /^\/(unit|lesson|game)/.test(path) : path.startsWith(href);
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
});

startRouter(main);
registerSW({ immediate: true });
