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
| `pause` | P pauses consistently and Esc never does (it's the way out, asking first mid-game), except in the few games that still pause on Esc (the typing games, Fish-a-Fish, Demolition Row, 24); paused games ignore play input; the shared pause only claims its key when it pauses something; Demolition Row's menu after quitting |
| `passport` | Passport's keys: S to share, M / V, Esc back, typed mode |
| `modifiers` | Ctrl / Cmd / Alt shortcuts reach the browser instead of the game |
| `touch` | Keycaps on games' own buttons hide on touch-only devices; hint text and canvas hints (`.gs-keys` / `.gs-touch`, `GameShell.touchOnly()`, drawKeys' `touch`) swap keys for touch wording |
| `steamfitter` | All levels solvable and scrambled; Puzzle boards; tee / junction / crossover water paths; the editor's tools |
| `<game>` (`chess`, `slither`, `tile-maze`, …) | One suite per game for its own bugs once fixed: each check failed on the old code, so it guards that fix |

Some suites add test hooks by serving a game's script with a few lines
appended (`lib.injectScript`), so the shipped files carry no test-only code.

Checks have to hold up on a busy machine, where frames come late and a few
round trips can outlast a short cue. Don't read a cue after a fixed wait.
Instead, poll for it (`waitForFunction`), catch it as it happens (a
MutationObserver or an `animationstart` listener set up before the action), or
wait on the page's own clock (`setTimeout` inside `p.evaluate`, which ends after
the game's earlier, shorter timers). Count frames rather than milliseconds. Use
`lib.leftBy(p, n)` for a trip to the games page. Do steps that must land inside
a short window in one `p.evaluate`. To try a suite under load, use
`tools/run-slowed.js` (below).

## Tools

- `tools/run-slowed.js` — runs suites with each page's CPU slowed (4x by
  default; `RATE=6`, `OUT=results.json`), one at a time, to find checks that
  only pass on an idle machine: `node tools/run-slowed.js` for all, or name some.
- `tools/steamfitter-junction-levels.js` — generates Steamfitter's junction
  levels (31–36). Seeded, so it reprints the same six levels; see the comment
  at its top.
