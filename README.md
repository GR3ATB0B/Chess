# Trivium Chess

A free chess site for learning, not playing. It teaches understanding first (why a tactic works) and recognition built on that, following the classical trivium: **grammar** (the few facts you need), **logic** (why things work), **rhetoric** (explaining and defending a move). Each unit ends with a master game you replay by guessing the moves.

It runs entirely on your device: no accounts, no backend, no tracking, no third-party requests. It works offline after the first visit and installs to a phone's home screen.

## What's in v1

- Unit 1, Safety and counting: piece values, loose and defended pieces, counting attackers and defenders, seeing threats, explaining your reasoning.
- Unit 2, Forks: what a fork is, the three conditions that make one work, building and breaking forks.
- Morphy's Opera Game (Paris 1858) with guess-the-move and original notes.
- Exercise types: sandbox, tap-the-squares, near-miss pairs, make-it-work, reason-then-move puzzles with fading scaffolds, tempting wrong moves with verified refutations, pick-the-reason, guess the master's move.
- Practice mode that picks your weakest concept and shows positions colour-flipped or mirrored.
- Progress per concept, stored in the browser, with JSON export and import.

## Verified content

Every position, solution, tag and explanation claim is checked at build time by chess.js, a rules module, and Stockfish 19. The build fails if anything is wrong. See [CONTENT.md](CONTENT.md) for the rules and evaluation margins.

## Development

    npm install        # also copies the Stockfish worker into public/engine
    npm run dev        # local dev server
    npm test           # unit tests
    npm run verify     # Stockfish content check (about 90 seconds)
    npm run build      # verify + production build into dist/

Set `BASE=/repo-name/` when building for a GitHub Pages project site. The included workflow (`.github/workflows/ci.yml`) verifies, tests, builds and deploys to GitHub Pages on pushes to `main`; enable Pages with "GitHub Actions" as the source. For Cloudflare Pages use build command `npm run build` and output directory `dist`.

## License

GPL-3.0-or-later. Uses [Stockfish.js](https://github.com/nmrugg/stockfish.js) (GPLv3), [chessground](https://github.com/lichess-org/chessground) (GPLv3, with the cburnett piece set), and [chess.js](https://github.com/jhlywa/chess.js) (BSD-2-Clause).
