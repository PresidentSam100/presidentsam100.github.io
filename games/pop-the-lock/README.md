# Pop the Lock

A small arcade game remake for the web, built with vanilla HTML5 Canvas +
JavaScript. No build step, no assets. It is one of the games on this site and
loads the site's shared scripts from `games/` (`motion-toggle.js`,
`mute-toggle.js`, `game-shell.js`: the Visual FX, sound and pause buttons, the
pause card and the "Leave this game?" box).

A dial sweeps around the lock. **Tap when it crosses the glowing notch.**
Each hit reverses the sweep, relocates the notch, and speeds things up.
Clear enough notches to open the lock and climb levels. One miss ends the run.

## Controls

| Action | Input |
| ------ | ----- |
| Pop the lock | Click • Tap • `Space` / `Enter` |
| Start / Retry | The **PLAY** button, any tap, `Space` or `Enter` |
| Pick a colour | Its swatch, or `1` to `5` |
| Pause / resume | `P` or the ⏸ button (the card has Restart and Menu) |
| Mute / unmute | `M` or the 🔊 button (top right) |
| Leave for the games page | `Esc` (asks first mid-run) or ← Games |

## Run it

Serve the whole site, not just this folder, so the shared scripts load:

```
# from the repository root
python -m http.server 8000
# then visit http://localhost:8000/games/pop-the-lock/
```

## Files

- `index.html`: markup, HUD, and start/game-over overlay
- `style.css`: theme, layout, responsive sizing, animations
- `game.js`: game loop, input, audio (WebAudio), particles, difficulty curve

## Features

- Responsive & HiDPI-aware canvas (scales to phone or desktop)
- Pointer, touch, and keyboard input
- Procedural sound effects via WebAudio (no audio files)
- Particle bursts, screen shake, success-ring flash
- A moving backdrop to each colour (rings on water, a night sky, clockwork,
  a sunburst, old keys drifting up), held still when Visual FX is off
- The notch is the window: a tap pops while the ball's centre is on the
  yellow, and "too slow" comes once the ball has wholly left it
- Local high-score persistence (`localStorage`)
- Rising difficulty: faster sweeps, tighter notches, more pops per level
