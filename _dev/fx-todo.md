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
Klondike its snow, Lights Out its chaser lights and Hash its hover shadow, all
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
- LogicGate. On Check the signal travels gate by gate, each wire lighting in
  turn, and the bulb lights only when it arrives; with FX off the verdict is
  immediate and the board ends up the same.

Done (checked in `tests/fx-more.js`):
- Corner Pocket. The cue drives through the ball on a shot, a hard hit throws
  sparks, and the rolling balls leave short trails.
- Chess, with its 4-player and 3-player boards. A move slides its piece across
  from the square it left, a capture flies off to its tray (with four or three
  players it shrinks away where it fell), and a king in check pulses.
- Tic-Tac-Toe. Chalk dust puffs off each stroke of a mark as it's drawn and
  drifts down (still falling while the computer replies), and off the strike
  through a winning line.
- Yi. A new hand is dealt round the table from the deck a card at a time:
  yours fan in, twisting straight as they land; each CPU's shrink into its row.
  The first turn waits for the last card.
- Minesweeper. A win sends a wave across the board, out from the cell that
  finished it, once that move's own reveal has rippled open.
- Speedle. A guess's tiles flip one after another. Every colour still lands at
  once, and the last flip ends before a solved word's next word comes up, so
  nothing waits on it (Race times are the same either way).
- Abyss. A hard drop leaves a trail of fading copies of the piece down the rows
  it fell through. (Its cells now draw at the alpha they're given, so a
  clearing row fades as a whole, not just its glow.)
- Crazy Ohio. A hit bursts where the tile was, a ring and sparks in the lane's
  colour; a PERFECT throws more, and further.
- Jam Jar. A dropped fruit squashes as it lands, by how hard it hit, and springs
  back, its bottom staying put.
- Flappy World. The medal pops onto the game-over card, then a glint sweeps
  across its face every couple of seconds.
- Spacer. An explosion sends a shockwave ring racing out: a big gold one for a
  boss or your ship, a small one for the rest.
- Typetwo. A spell bolt flies with a long glowing trail and sheds motes.
- Stopwatch. A perfect stop (within 0.05s) sends a gold ring out from the watch
  and a scatter of glints; a merely good stop doesn't.
- Steamfitter. A turned pipe eases its quarter-turn into place with a touch of
  overshoot (the board has already turned it: the eased turn is only drawn).
- Hash. The deal turns each card face up from edge-on, one after another, 20ms
  apart; every face is readable within a few tenths of a second, so the clock
  loses nothing to it.
- Klondike. A card that travels a pile or more arcs there, lifted on a curve,
  a little larger mid-flight and above the rest; nearer shifts still glide.
- Lanterns (its ink-wash look). Mist drifts over the valleys and three birds
  ride it; with FX off both lie still. Dusk closes in a shade with each
  lantern lost and falls with the third, over a moment or at once. (Its sway,
  sparks and faraway lanterns were already there.)
- Lights Out (its marquee look). A gap runs round the chaser lights, a bulb
  takes a moment to warm up and longer to cool, and the name, the letterboard
  and the chaser fade out when the last bulb goes. FX off: the same sign, the
  chaser all lit and still, everything switching at once.

Every game on the "thin" list from the 2026-10-03 read is done. A new idea for a
game goes here, with a check in `tests/fx-more.js`.

## Round 2 (ideas from 2026-10-09; Sam picks which, one at a time)

Done:
- Link Many. A dropped disc squashes at each touchdown of its bounce (about its
  bottom edge), and a win draws a glowing line through the four, end to end,
  each disc popping as the line reaches it. (Its drop bounce and the win's
  white pulsing ring were already there.)

Ideas, not started. Check each game first: some may already have part of it.
- Dots and Boxes: each line draws in from dot to dot; a claimed box fills with a
  ripple and its mark pops in.
- Tall Order: a trimmed tier's offcut breaks into crumbs that tumble off.
- Demolition Row: cleared blocks burst into debris; a chain pops "×2", "×3".
- Meteor Menace: rocks crack into tumbling chunks, comic-panel impact bursts.
- Neon Pinball: a glowing ball trail; rings off bumpers and slingshots.
- Science Fair: a paper planet swings on its string as it plays its note.
- 24: cards slide together as they combine; a solved 24 pops on the phone screen.
- Click Tap: a ripple off the pad on each tap; the taps-per-second number bumps.

Already good models: Reaction, Lanterns, Slither, the Sudoku stamp.
