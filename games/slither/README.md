# Slither

Grid snake with three modes: **Classic** (endless, optional portals and
obstacles), **2-Player** (local, last snake alive), and the **Labyrinth** — a
20-level campaign inspired by *Ziggy's Labyrinth* (Lankyware, 2024): eat every
red apple to unlock the exit, reach it before the clock runs out, and deal with
portals, ice, doors, spikes, darkness, teleport and ghost powers, and enemy
snakes along the way. A crash restarts the level instantly; there are no lives.

## Runtime files (loaded by the browser)

| File | Role |
|---|---|
| `index.html` | the page: menu, HUD, overlays, touch controls |
| `game.js` | page shell (menus, overlays, input routing, sound) and Classic / 2-Player |
| `temple-art.js` | the temple-ruins look, shared by both modes: stone serpents, floors, walls, traps, doorway |
| `labyrinth.js` | Labyrinth mode: level select, HUD, input, drawing, saved progress |
| `labyrinth-engine.js` | Labyrinth rules — pure, no DOM; the tile legend is at the top |
| `levels.js` | the 20 levels |
| `styles.css` | page styles: torch-lit temple wall, sandstone tablets, stone controls |

Saved data: `snake_best` (Classic best — the key predates the rename) and
`slither_labyrinth` (best clear time per level id). Both are listed in the
hub's "reset all high scores" block in `games/index.html`.

## Dev tool — Node only, NOT loaded by any page

```sh
node verify.js            # prove every level can be finished; check time limits
node verify.js 7 --route  # one level, and print the route it found
node verify.js --bot      # also let a bot play the enemy levels (slow)
```

Run it after editing `levels.js`. It searches for a route while modelling the
rules (no reversing, ice, portals, doors, blink charges, the ghost meter, the
cutter, spike timing, the snake's own body), then replays that route through
`labyrinth-engine.js` itself, so a level only passes if the real rules accept
the route.
