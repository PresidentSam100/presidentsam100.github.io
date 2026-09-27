# Slither

Grid snake in a temple-ruins style, with three modes:

- **Classic**: endless, with optional portals and obstacles.
- **2-Player**: local, last snake alive.
- **Labyrinth**: a campaign inspired by *Ziggy's Labyrinth* (Lankyware, 2024).

## The Labyrinth

The campaign is 44 levels across five zones, which play the role of Ziggy's
packs: Garden (Easy), Ruins (Advanced), Citadel and Foundry (Expert), and
Astral (Master). In each level you eat every red apple to unlock the exit,
then reach it before the clock runs out. A crash restarts the level at once.

Along the way you meet:

- portals, one-way teleport pads, ice, dream blocks, storm tiles and darkness
- colour doors, with round and click switches
- spikes on a beat, and spike studs
- the cutter, the Infinity machine and the cloner
- blink, ghost and fast apples, and watermelons
- a dozen kinds of enemy snake
- the Serpent King boss (Foundry and Astral finales)

The Labyrinth menu also offers:

- **Pack runs (Ziggy rules)**: play a whole zone on 9 lives. 1-ups (`+`)
  win a life back, and so does every 50 apples on the counter. Golden apples
  (`$`) add 5 to the counter, and clearing a level adds a time bonus of one
  apple per 5 s left. Crashing, restarting or quitting mid-level costs a
  life. 1-ups and golden apples only appear on runs.
- **Stages (Classic rules)**: endless apples on hand-built boards. You speed
  up as you eat. There's no exit, and a best score is kept per stage.
- **Arena**: last snake standing against rival bots. Play alone or with a
  friend on the same device (P1 on WASD, P2 on the arrow keys, or the second
  d-pad). First to 3 rounds wins. Ziggy's online Arena is not included: it
  would need a server.
- **Level editor** (`editor.html`): paint levels, have the checker prove
  they can be finished, then save them to "My levels" or share them as a link
  (`#play=...`).

Controls:

- **Steer**: arrows or WASD, swipe, the d-pads, or a gamepad.
- **Sprint**: hold a direction for a moment or tap it twice. Shift and ⚡
  also sprint.
- **Ghost**: G, right-click, or 👻.
- **Blink**: click or tap a cell.
- **Click switches**: 1, 2 and 3.
- **Other keys**: R retries, M toggles the music, and Space pauses.

## Runtime files (loaded by the browser)

| File | Role |
|---|---|
| `index.html` | the page: menu, HUD, overlays, touch controls |
| `game.js` | page shell (menus, overlays, input routing, sound, gamepads) and Classic / 2-Player |
| `temple-art.js` | the temple look shared by every mode: stone serpents, floors, walls, traps, items, the boss |
| `labyrinth.js` | Labyrinth mode: level select, pack runs, stages, arena, HUD, input, drawing, saved progress |
| `labyrinth-engine.js` | Labyrinth rules. It is pure (no DOM); the tile legend (`LEGEND`) is at the top |
| `levels.js` | the 44 campaign levels |
| `stages.js` | the Stages boards (`mode: "stage"`) |
| `arenas.js` | the Arena maps (`mode: "arena"`) |
| `music.js` | one generated tune per zone |
| `levelcode.js` | share codes for levels (`#play=` / `#edit=` links) |
| `editor.html`, `editor.css`, `editor.js` | the level editor |
| `solver.js`, `solver-worker.js` | the level checker, used by the editor (in a Web Worker) and by `verify.js` |
| `styles.css` | page styles: torch-lit temple wall, sandstone tablets, stone controls |

Saved data:

- `snake_best`: the Classic best (the key predates the rename).
- `slither_labyrinth`: best clear time per level id, warps taken, the pack
  run in progress and the best run per zone, and the best score per stage.
- `slither_custom` and `slither_editor_draft`: the editor's levels.
- `slither_music`: the music on/off choice.

`snake_best` and `slither_labyrinth` are listed in the hub's "reset all high
scores" block in `games/index.html`.

## Dev tool (Node only, NOT loaded by any page)

```sh
node verify.js            # prove every level can be finished; check time limits
node verify.js 7 --route  # one level, and print the route it found
node verify.js --bot      # also let a bot play the enemy levels (slow)
```

Run it after editing `levels.js`. It searches for a route while modelling the
rules, then replays that route through `labyrinth-engine.js` itself, so a
level passes only if the real rules accept the route. The rules it models are:

- no reversing
- ice, portals and teleport pads
- doors, switches and click switches
- blink charges and the ghost meter
- the cutter and the Infinity machine
- spike timing and spike studs
- dream blocks and storm tiles
- the snake's own body

Some levels can't be judged that way, and are marked `unproven: "<reason>"`
instead of passing:

- levels that need enemies or a twin to finish
- boss fights
- stages and arenas

An unproven level can carry a hand-checked `proof` route that `verify.js`
replays with the enemies in play. With `--bot`, a bot also plays each level
that has enemies, as a difficulty hint.
