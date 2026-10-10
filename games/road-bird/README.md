# Road Bird

A self-contained [Crossy Road](https://en.wikipedia.org/wiki/Crossy_Road)-style game in a single HTML file. No build step, no dependencies, no server required.

## Play

Just open `index.html` in any modern browser (double-click it), or host the file anywhere static (GitHub Pages, Netlify, S3, `python -m http.server`, etc.).

## Game modes

Pick a mode from the main menu (each keeps its **own high score**):

- **Classic** — roads, railways and rivers all mixed together.
- **Cars & Trucks** — roads only.
- **Trains** — railways only.
- **River** — water only.

On the menu use `↑ ↓` to choose a mode, `C` to change your **skin**, and `Space` / tap to play. On the game-over screen, **Play Again** (`Space`) restarts the same mode, **Main Menu** (`Backspace`) returns to mode select.

## Controls

| Action | Keys | Touch |
| --- | --- | --- |
| Hop forward | `↑` / `W` | swipe up / tap |
| Hop back | `↓` / `S` | swipe down |
| Hop left/right | `← →` / `A` `D` | swipe left/right |
| Pause / resume | `P` | tap (while paused) |
| Mute / unmute | `M` | — |
| Menu: select / change skin / play | `↑ ↓` / `C` / `Space` | tap a button |

The game **auto-pauses** when the tab or window loses focus.

## Hazards

- **Roads** — dodge cars, trucks, and the occasional **police car or fire truck** chase (the lane clears, a siren wails, then it speeds through).
- **Railways** — a red signal light blinks as a warning, then a **fast train** sweeps the whole track.
- **Rivers** — water is deadly. Ride the **moving logs** and rest on stationary **lily pads**; if a log carries you into the edge you're swept away.
- **Terrain** — grassy lanes dotted with **trees** that block your path (hop around them).
- **The eagle** — the screen slowly scrolls forward. Stall too long and the bottom **border** catches you, and an eagle swoops in to carry the chicken away.

## Scoring & unlocks

- **Score** = rows crossed + **coins** collected. Coins sit on risky cells (mid-road, over water) — grab them for extra points.
- Each mode keeps its **own high score** (saved in `localStorage`, gracefully ignored if storage is unavailable).
- **Skins** unlock as your best score climbs (Chick → Robin → Bluebird → Duck → Phoenix); cycle unlocked skins with `C` on the menu.

## Tuning

Gameplay knobs live as constants/functions near the top of the `<script>` in `index.html`:
`scrollSpeed()` (border pressure), `difficulty()` (traffic/river speed ramp, keeps climbing past score 108),
`TRUCK_CHANCE`, `TRAIN_SPEED`, `COLS`, `TILE`, `PAD` (margin width), the spawn weights in `pickSection()`,
the coin rate in `maybeAddCoin()`, and the unlock thresholds in the `SKINS` array.
