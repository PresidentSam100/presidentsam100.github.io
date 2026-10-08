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
```

| Suite | Covers |
|---|---|
| `shortcuts` | Every game page: sound / Visual FX keys (M / V, and `[` / `]` everywhere), keycap labels, corner buttons not overlapping on desktop or phone, no page errors |
| `typing` | Typing games keep their letters; `[` / `]` still work, also from the game's own typing box |
| `pause` | Esc / P pause consistently; Esc backs out on end screens; paused games ignore play input; the shared pause only claims keys when it pauses something; Demolition Row's menu after quitting |
| `passport` | Passport's keys: S to share, M / V, Esc back, typed mode |
| `modifiers` | Ctrl / Cmd / Alt shortcuts reach the browser instead of the game |
| `touch` | Keycaps on games' own buttons hide on touch-only devices |
| `steamfitter` | All levels solvable and scrambled; Puzzle boards; tee / junction / crossover water paths; the editor's tools |
| `<game>` (`chess`, `slither`, `tile-maze`, …) | One suite per game for its own bugs once fixed: each check failed on the old code, so it guards that fix |

Some suites add test hooks by serving a game's script with a few lines
appended (`lib.injectScript`), so the shipped files carry no test-only code.

## Tools

- `tools/steamfitter-junction-levels.js` — generates Steamfitter's junction
  levels (31–36). Seeded, so it reprints the same six levels; see the comment
  at its top.
