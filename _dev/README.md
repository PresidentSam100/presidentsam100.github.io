# _dev — tests and tools for the games

Not part of the site: Jekyll skips folders that start with `_`, so nothing here
is published.

## Browser tests

Headless Chromium (Playwright) against the games, served from this repo by a
small built-in server — nothing else needs to be running.

```sh
cd _dev
npm run setup        # once: installs Playwright and its Chromium
npm test             # every suite
npm test -- passport typing   # just some suites
VERBOSE=1 npm test   # print passing checks too
JOBS=1 npm test      # one suite at a time (the default runs 3 at once)
RETRY=0 npm test     # don't re-run a failed suite on its own
```

Suites run side by side, longest first, with only one of the long
page-sweeping ones (`shortcuts`, `leave`, `guard`, `fx`, …) going at a time;
each suite's lines print together when it finishes. A suite that fails is run
once more on its own at the end. If it passes then, the summary lists it as
"passed only when run on their own": a check that's sensitive to load, worth
making sturdier, but not a bug in the game.

| Suite | Covers |
|---|---|
| `shortcuts` | Every game page: sound / Visual FX keys (M / V, and `[` / `]` everywhere), keycap labels, corner buttons not overlapping on desktop or phone, no page errors |
| `typing` | Typing games keep their letters; `[` / `]` still work, also from the game's own typing box |
| `pause` | Esc / P pause consistently; Esc backs out on end screens; paused games ignore play input; the shared pause only claims keys when it pauses something; Demolition Row's menu after quitting |
| `passport` | Passport's keys: S to share, M / V, Esc back, typed mode |
| `modifiers` | Ctrl / Cmd / Alt shortcuts reach the browser instead of the game |
| `touch` | Keycaps on games' own buttons hide on touch-only devices; hint text and canvas hints (`.gs-keys` / `.gs-touch`, `GameShell.touchOnly()`, drawKeys' `touch`) swap keys for touch wording |
| `steamfitter` | All levels solvable and scrambled; Puzzle boards; tee / junction / crossover water paths; the editor's tools |
| `<game>` (`chess`, `slither`, `tile-maze`, …) | One suite per game for its own bugs once fixed: each check failed on the old code, so it guards that fix |

Some suites add test hooks by serving a game's script with a few lines
appended (`lib.injectScript`), so the shipped files carry no test-only code.

## Tools

- `tools/steamfitter-junction-levels.js` — generates Steamfitter's junction
  levels (31–36). Seeded, so it reprints the same six levels; see the comment
  at its top.
