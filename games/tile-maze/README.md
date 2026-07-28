# Tile Maze

A turn-based puzzle: slide through a grid of coloured tiles to reach the goal.
Some tiles are ice (you keep sliding), some are water/poison (they change your
"flavour"), some are walls. Levels live in `levels.js`.

There is no timer and no game loop — moves are discrete, and `anim.js` only
animates the transition between them. That's why the game has no pause: there
is nothing running to pause.

## Runtime files (loaded by the browser)

| File | Role |
|---|---|
| `index.html` | the game page |
| `game.js` | input, level flow, save/restore (`tileMaze.v1`) |
| `engine.js` | pure move resolution — shared with the dev tools below |
| `levels.js` | level data |
| `gen.js` | procedural level generation |
| `anim.js` | move/slide animation |
| `audio.js` | sound (muting is global, via `../mute-toggle.js`) |
| `editor.html` / `editor.js` / `editor.css` | level editor, linked from the game page |
| `styles.css` | game styles |

## Dev tools — Node only, NOT loaded by any page

These are command-line scripts. They `require()` Node built-ins and would throw
in a browser; nothing links to them, so they ship as inert files.

```sh
node verify.js      # BFS every level to prove it's solvable — run after editing levels.js
node analyze.js     # score each level's DIFFICULTY (not just solution length)
node sortlevels.js  # reorder levels.js by ascending difficulty (first 8 keep their tutorial order)
```

`sortlevels.js` **rewrites `levels.js` in place** — commit or stash first.

All three import `engine.js`, so the difficulty scores reflect the same move
rules the game actually plays by.
