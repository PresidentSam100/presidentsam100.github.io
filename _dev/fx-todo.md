# Visual FX — what's still open

The ✨ Visual FX switch (`games/motion-toggle.js`; `RM_ON()` is true when it's
off) is about **motion, not detail**. FX on is the best version: extra motion
such as trails, richer animation, particles and juice. FX off keeps the same
art and static detail, with calmer motion: brief simple motion or none, no
loops, no shake or flashing. Every game-state cue shows in both modes.

Done: phase 1 (one shared switch, `html.fx-on` / `html.fx-off`), 2a (strobes
and flashes with FX off) and 2b (cues that vanished with FX off; covered by
`tests/cues.js`).

These items come from reading the code on 2026-10-03, and many games have
changed since. Check each in the game before fixing it, and add a check to
`tests/fx.js` or `tests/cues.js`.

## 2c — FX off still removes art, or leaves loops running

The bug sweep (2b487ff) made FX off stop some of this looping motion. It covers
at least Slither's rainbow, which now holds still with FX off, Lanterns'
faraway lanterns, which now only drift with FX on, and some of Typetwo's
motion. Check each item below against it.

Art that disappears with FX off:
- Abyss: the glow around cells, and the snow, jellyfish and fish (`art.js`)
- Fish-a-Fish: the water shimmer (`art.js`)
- Ping: the static phosphor glow
- Steamfitter: the water glow
- Klondike: the snow
- Lights Out: the dials' second hand (`setHands` hides it)
- Hash: the hover shadow

Loops that keep running with FX off:
- Corner Pocket: the ball-in-hand ring and the called pocket's wobble
- Typetwo: star drift, rune pulses, robe sway, orb flicker, per-key sparks,
  and the typed text's scale snap
- Klondike: the sky ignores a change of the switch until reload
- Fish-a-Fish: splashes and bobbing
- Sunset Slice: the menu bob, the koban shine and the fuse sparks
- Pop the Lock: full bursts
- Poodle Jump: everything (it never reads the switch)

## 3 — more motion with FX on (pick games; keep each change small)

Done (checked in `tests/fx.js`):
- Passport. The postcard drops in, a denial jolts it and the wrong answer,
  the stamp spreads ink, its copy inks onto the page, the count bumps, and
  the cards rise in.
- Poodle Jump. Each landing squashes the poodle and kicks up pencil dust, the
  platform gives under it, it stretches with its speed, and a launch faster
  than a normal jump trails speed lines.
- 2048. The keys ease into place and land with a squash along their slide, a
  merge squashes the same way before it pops and flashes a lit ring, and the
  points float up off the score.

Thin today: Chess and its 3-player board (piece slides, captures to the tray,
check pulse), LogicGate (signal flowing gate by gate), Road Bird (hop trail,
coin sparkle), Tic-Tac-Toe (chalk dust), Stopwatch (perfect-stop ring),
Steamfitter (eased quarter-turn), Yi (deal fan), Hash (deal flip), Minesweeper
(win wave), Speedle (staggered flip), Abyss (hard-drop trail), Corner Pocket (ball trails), Crazy
Ohio (hit bursts), Jam Jar (landing squash), Klondike (card arcs), Flappy World
(medal shine), Spacer (shockwave), Typetwo (bolt trails).

Already good models: Reaction, Lanterns, Slither, the Sudoku stamp.
