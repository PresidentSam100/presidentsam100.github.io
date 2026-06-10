# Pop the Lock

A small, self-contained arcade game remake for the web — built with vanilla
HTML5 Canvas + JavaScript. No build step, no dependencies, no assets.

A dial sweeps around the lock. **Tap when it crosses the glowing notch.**
Each hit reverses the sweep, relocates the notch, and speeds things up.
Clear enough notches to open the lock and climb levels. One miss ends the run.

## Controls

| Action | Input |
| ------ | ----- |
| Pop the lock | Click • Tap • `Space` / `Enter` |
| Start / Retry | The **PLAY** button or any tap |
| Mute / unmute | 🔊 button (bottom-right) |

## Run it

It's a static site — just open it:

```
# Option A: double-click index.html
# Option B: serve it locally (recommended for mobile testing)
python -m http.server 8000
# then visit http://localhost:8000
```

## Deploy

Drop the folder onto any static host — GitHub Pages, Netlify, Vercel,
Cloudflare Pages, S3, itch.io. No configuration required.

## Files

- `index.html` — markup, HUD, and start/game-over overlay
- `style.css` — theme, layout, responsive sizing, animations
- `game.js` — game loop, input, audio (WebAudio), particles, difficulty curve

## Features

- Responsive & HiDPI-aware canvas (scales to phone or desktop)
- Pointer, touch, and keyboard input
- Procedural sound effects via WebAudio (no audio files)
- Particle bursts, screen shake, success-ring flash
- Local high-score persistence (`localStorage`)
- Rising difficulty: faster sweeps, tighter notches, more pops per level
