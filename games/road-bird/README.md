# Road Bird

A [Crossy Road](https://en.wikipedia.org/wiki/Crossy_Road)-style game: `index.html` (the page), `styles.css` and `game.js` (the whole game, drawn on a canvas). No build step. It is one of the games on this site and loads the site's shared scripts from `games/` (`motion-toggle.js`, `mute-toggle.js`, `game-shell.js`: the Visual FX, sound and pause buttons, the pause card and the "Leave this game?" box) and its Grandstander font from Google Fonts.

## Play

Serve the whole site, not just this folder, so the shared scripts load: `python -m http.server 8000` from the repository root, then open `http://localhost:8000/games/road-bird/`.

## Game modes

Pick a mode from the main menu:

- **Classic**: roads, railways and rivers all mixed together.
- **Cars & Trucks**: roads only.
- **Trains**: railways only.
- **River**: water only.

Under the modes, **Normal** or **Insane** (`N` / `I`, remembered). Insane is hazards only: after the grass you start on there is no grass to rest on, and its rivers are all logs (no lily pads). Every mode keeps its **own high score** for Normal and for Insane.

On the menu use `↑ ↓` (or `1` to `4`) to choose a mode, `C` to change your **skin**, and `Space` or `Enter` / tap to play. On the game-over screen, **Play Again** (`Space` or `Enter`) restarts the same mode, **Main Menu** (`Backspace`) returns to mode select.

## Controls

| Action | Keys | Touch |
| --- | --- | --- |
| Hop forward | `↑` / `W` | swipe up / tap |
| Hop back | `↓` / `S` | swipe down |
| Hop left/right | `← →` / `A` `D` | swipe left/right |
| Pause / resume | `P` or the ⏸ button | the ⏸ button, tap (while paused) |
| Mute / unmute | `M` or the speaker button | the speaker button |
| Menu: select / Normal or Insane / change skin / play | `↑ ↓` or `1` to `4` / `N` `I` / `C` / `Space` or `Enter` | tap a button |
| Leave for the games page | `Esc` (asks first once a run has scored) | ← Games |

While paused, the card also has Restart (`R`) and Menu (`Backspace`). The game **auto-pauses** when the tab or window loses focus.

## Hazards

- **Roads**: dodge cars, trucks, and the occasional **police car or fire truck** chase (the lane clears, a siren wails, then it speeds through).
- **Railways**: a red signal light blinks as a warning, then a **fast train** sweeps the whole track.
- **Rivers**: water is deadly. Ride the **moving logs** and rest on stationary **lily pads** (Normal only); if a log carries you into the edge you're swept away.
- **Terrain**: grassy lanes dotted with **trees** that block your path (hop around them).
- **The eagle**: the screen slowly scrolls forward. Stall too long and the bottom **border** catches you, and an eagle swoops in to carry the chicken away.

## Scoring & unlocks

- **Score** = rows crossed + **coins** collected. Coins sit on risky cells (mid-road, over water): grab them for extra points.
- Each mode keeps its **own high score**, one for Normal and one for Insane (saved in `localStorage`, gracefully ignored if storage is unavailable).
- **Skins** unlock as your best score climbs (Chick → Robin → Bluebird → Duck → Phoenix); cycle unlocked skins with `C` on the menu.

## Tuning

Gameplay knobs live as constants/functions in `game.js`:
`scrollSpeed()` (border pressure), `difficulty()` (traffic/river speed ramp, keeps climbing past score 108),
`TRUCK_CHANCE`, `TRAIN_SPEED`, `COLS`, `TILE`, `PAD` (margin width), the spawn weights in `pickSection()`,
the coin rate in `maybeAddCoin()`, and the unlock thresholds in the `SKINS` array.
