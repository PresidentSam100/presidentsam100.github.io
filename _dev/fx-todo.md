# Visual FX — what's still open

The ✨ Visual FX switch (`games/motion-toggle.js`; `RM_ON()` is true when it's
off) is about **motion, not detail**. FX on is the best version: extra motion
such as trails, richer animation, particles and juice. FX off keeps the same
art and static detail, with calmer motion: brief simple motion or none, no
loops, no shake or flashing. Every game-state cue shows in both modes.

Done: phase 1 (one shared switch, `html.fx-on` / `html.fx-off`), 2a (strobes
and flashes with FX off), 2b (cues that vanished with FX off; covered by
`tests/cues.js`) and 2c (art that vanished with FX off, and loops that kept
running; covered by `tests/fx-more.js`). With FX off, Abyss keeps its block
glow and its sea, Fish-a-Fish its shimmer, Ping and Steamfitter their glow,
Klondike its snow, Lights Out its second hand and Hash its hover shadow, all
held still. Klondike's sky follows the switch the moment it flips. Typetwo's
keystroke sparks and jump, Sunset Slice's menu, Pop the Lock's bursts and
Fish-a-Fish's spray all stop; a miss in Pop the Lock is marked by a still ring.
The rest of the 2c list was already fixed (the bug sweep, 2b487ff, and the
Poodle Jump round).

Add a check for any new FX work to `tests/fx.js`, `tests/fx-more.js` or
`tests/cues.js`.

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
- Road Bird. A hop leaves a short motion-blur trail, a collected coin bursts
  into sparkles, and a crash shakes the screen. (Its hop squash, landing dust,
  crash feathers and "+1"s were already there, in both modes; left as they were.)

Done (checked in `tests/fx-more.js`):
- Corner Pocket. The cue drives through the ball on a shot, a hard hit throws
  sparks, and the rolling balls leave short trails.
- Chess, with its 4-player and 3-player boards. A move slides its piece across
  from the square it left, a capture flies off to its tray (with four or three
  players it shrinks away where it fell), and a king in check pulses.

Thin today: LogicGate (signal flowing gate by gate), Tic-Tac-Toe (chalk
dust), Stopwatch (perfect-stop ring),
Steamfitter (eased quarter-turn), Yi (deal fan), Hash (deal flip), Minesweeper
(win wave), Speedle (staggered flip), Abyss (hard-drop trail), Crazy
Ohio (hit bursts), Jam Jar (landing squash), Klondike (card arcs), Flappy World
(medal shine), Spacer (shockwave), Typetwo (bolt trails).

Already good models: Reaction, Lanterns, Slither, the Sudoku stamp.
