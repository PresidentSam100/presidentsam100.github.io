# Tile Maze

A turn-based puzzle: step through a grid of coloured tiles to reach the goal.
Some tiles are ice (you keep sliding), some change your "flavour" (orange,
purple), some throw you back (yellow, and blue water when it's live), some are
walls. Levels live in `levels.js`.

There is no game loop: moves are discrete, and `anim.js` only animates the
transition between them. The one thing that runs is each level's clock (from
the first move to the win, for the per-level best time). It holds while the
pause card is up (P or the ⏸ button; the card's Restart starts the level
again, as R does), while "Leave this game?" is up, and while the tab is hidden
or the window is away.

## Runtime files (loaded by the browser)

| File | Role |
|---|---|
| `index.html` | the game page |
| `game.js` | input, level flow, save/restore (`tileMaze.v1`) |
| `engine.js` | pure move resolution: shared with the dev tools below |
| `levels.js` | level data |
| `anim.js` | move/slide animation |
| `audio.js` | sound (muting is global, via `../mute-toggle.js`) |
| `editor.html` / `editor.js` / `editor.css` | level editor, linked from the game page |
| `styles.css` | game styles |

## Dev tools: Node only, in `_dev/tools` (which the site doesn't publish)

Command-line scripts, run from the repo's root:

```sh
node _dev/tools/tile-maze-verify.js      # BFS every level to prove it's solvable: run after editing levels.js
node _dev/tools/tile-maze-sortlevels.js  # reorder levels.js by ascending difficulty (first 8 keep their tutorial order)
node _dev/tools/tile-maze-gen.js         # generate themed candidate levels (BFS-checked) and print the grids to paste in
```

`tile-maze-analyze.js` scores each level's DIFFICULTY (not just solution
length) for the other two. `tile-maze-sortlevels.js` **rewrites `levels.js` in
place**: commit first.

Each level has an `id` and a `name`. A player's progress (levels solved, best
times) is saved under the `id`, so a level can be renamed, or the list
re-sorted, without anyone losing theirs. Never change an `id`; a new level
needs one of its own (its first name will do), and `tile-maze-verify.js` says so if one
is missing or used twice.

They all run on `engine.js` (directly, or through `tile-maze-analyze.js`), so the
difficulty scores reflect the same move rules the game actually plays by.
