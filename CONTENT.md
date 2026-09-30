# Writing lesson content

Lessons are JSON files in `content/lessons/`, master games in `content/games/`, and the unit list in `content/units.json`. Types are in `src/content/types.ts`.

Nothing in these files is trusted. `npm run verify` checks every position with chess.js, the rules module (`src/chess/rules.ts`) and Stockfish 19, and fails the build on any problem. CI runs it on every push.

## Rules the verifier enforces

- Every FEN is valid and the game is not already over (sandbox and diagram FENs only need a valid board).
- **Tap** answers equal what the rules module computes, and stay equal under colour flip and mirror.
- **Make it work**: the example square creates a fork (two real targets, forking piece not capturable for profit), and at most four squares work, so the exercise is selective.
- **Near-miss**: the two boards differ on the listed squares only (1 to 3 squares); the move is legal in both; it is the engine's best move and wins in one, and fails in the other.
- **Puzzle**: every move is legal; each learner move is the engine's first choice and beats the second-best move by the margin below; each scripted reply is a real defence; the tempting move is clearly worse and its refutation is best play; every puzzle has at least one hint.
- **Choices**: exactly one is correct; every choice carries at least one machine-checked claim; all claims on the correct choice hold; at least one claim on each wrong choice fails.
- **Claims** on any step (the `claims` field) must hold. Use them to back every factual sentence in the prose.
- **Master games**: every move is legal, the result matches a final mate, and note keys point at real plies.

## Evaluation margins

Defined in `scripts/verify-content.ts`. Scores are centipawns from the mover's side at fixed depth 18, from a fresh hash.

| Constant | Value | Meaning |
|---|---|---|
| `CLEAR_BEST` | 150 | A solution move must beat the second-best move by this much. Two mates of equal status fail. |
| `WINNING` | 150 | A `win` puzzle's first move, and a near-miss move in the working position, must score at least this. |
| `NOT_WINNING` | 50 | The near-miss move in the failing position must score at most this. |
| `NEAR_MISS_GAP` | 200 | Minimum difference between the two near-miss outcomes. |
| `DEFENSE_TOLERANCE` | 50 | A scripted reply may be at most this much worse than the engine's best reply. |
| `TEMPTING_GAP` | 150 | A tempting move must score at least this much below the best move. |
| `NOT_BEST_GAP` | 100 | A `not-best` claim needs the move this much below the best move. |

## Claims

`loose`, `not-loose`, `hanging`, `not-hanging`, `defenders`, `attackers`, `attacks`, `not-attacks`, `fork`, `not-fork`, `see`, `check`, `legal`, `illegal`, `value` are computed by the rules module. `wins`, `not-wins`, `best`, `not-best`, `mate` use Stockfish. Any claim can take `after: [uci...]` to be checked after some moves.

The app reuses rule claims to tell a learner *why* a wrong choice is wrong, so a good wrong choice carries the specific claim that fails.

## Definitions (rules module)

- **Loose**: a non-king piece that no piece of its own side defends. Attacked or not.
- **Hanging**: the other side wins material by capturing it (static exchange evaluation; pins are ignored).
- **Fork target**: the enemy king, an enemy piece worth more than the attacker, or one it could win by capturing.
- **Fork**: two or more targets, and the forking piece can't be taken for profit.

## Text

- Write squares as `@e5` and sides as `@W`/`@B` (or `@w`/`@b` in lowercase) so the words follow the board when practice mode flips or mirrors it. Write moves as `Nx@e5`, pawn pushes as `@e4`.
- Avoid pawn captures like `dxe5` and file names like "the e-file" in prose; a step that contains them is shown only in its original orientation.
- `**bold**`, `*italic*`, blank lines between paragraphs, and `1.` numbered lines are supported.
- Teaching text is written by hand. Don't state a chess fact that isn't backed by a claim or by the exercise's own verified data.
- Master game notes are original to this project. Take moves from public game records only; do not copy published annotations.

## Helpers

    npx tsx scripts/probe.ts "<fen>" [uci moves...]     # rules facts + top engine lines
    npx tsx scripts/probe-batch.ts candidates.json      # many positions at once
    VERIFY_DEPTH=12 VERIFY_CACHE=1 npm run verify       # quick local pass
