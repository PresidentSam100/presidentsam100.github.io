# Doodle Jump Clone

A web-ready Doodle Jump clone built with HTML5 Canvas and plain JavaScript — no
build step, no dependencies, no asset files (everything is drawn with code and
the sound effects are synthesized with the Web Audio API).

## Run it

Just open `index.html` in any modern browser (double-click works — the scripts
are classic `<script>` tags, so it runs straight from `file://`).

To serve it instead (recommended for mobile testing / deployment):

```bash
# from this folder
python -m http.server 8000
# then visit http://localhost:8000
```

Deploy by uploading the whole folder to any static host (GitHub Pages, Netlify,
S3, …).

## Controls

| Action | Keyboard | Mouse | Touch |
|--------|----------|-------|-------|
| Move   | ← → or A / D | — | ◀ ▶ on-screen buttons |
| Shoot  | Space / ↑ / W (straight up) | click to aim | tap the play area |
| Pause / resume | P / Esc | — | — |
| Start / restart | Space / Enter | click | tap |

The game also auto-pauses when the window or tab loses focus.

## Features

**Player** — moves left/right with momentum, wraps around the screen edges,
auto-bounces on platforms, and shoots bullets upward (click/tap to aim).

**Platforms**
- 🟢 **Green** — stationary.
- 🔵 **Blue** — slide left/right, bouncing off the walls.
- ⬜ **Gray** — drift up/down.
- ⬜ **White** — shatter after a single bounce.
- 🟡 **Yellow** — give exactly one jump, then fade away the moment you rise
  above them (whether or not you landed on them).
- 🟤 **Brown** — fakes: they break when you try to land, giving no bounce. Each
  fake spawns with a dependable companion platform on the same row so it's a
  real choice, not a guaranteed death.

**Items** (all ride *on top of* dependable platforms and move with them)
- **Spring** — landing on it launches you much higher than a normal bounce.
- **Trampoline** — launches you higher still (the biggest bounce).
- **Propeller** — carries you up for a while (the weaker lift).
- **Jetpack** — carries you up higher and longer than the propeller, and sits on
  the doodle's back. Both grant invincibility until they run out, and you can't
  stack them — a new one is ignored until your current one is exhausted.
- **Spring shoes** — worn on the feet; the next 5 plain platform bounces each
  launch as high as a spring. They are *not* flight: you stay vulnerable and can
  still shoot. Landing on a real spring/trampoline takes priority and doesn't
  spend a charge, and the count is preserved (and frozen) if you grab a
  jetpack/propeller mid-run — the shoes resume once the flight ends.

**Enemies**
- **Monsters** & **UFOs** — shoot them, or stomp them once for an extra boost.
  Touching their sides is fatal.
- **UFO abduction beam** — the beam beneath a UFO is fatal to touch.
- **Black holes** — cannot be shot; any contact is fatal (but you fly safely
  over them while a power-up is active).

**Death animations** — instead of vanishing, the doodle dies in character:
- *Fall* — miss every platform and the camera follows you down through empty sky.
- *Bump* — hit a monster/UFO side and you go dizzy (X_X eyes), then plummet.
- *Abduction* — caught in a UFO beam, you're sucked up into the saucer.
- *Black hole* — you spiral inward and shrink into it.

Difficulty ramps up with height: gaps widen and the deadlier platform/enemy mix
becomes more common. High score is saved to `localStorage`.

## Project layout

```
index.html        markup + script includes
styles.css        layout, scaling, touch controls
js/
  utils.js        config constants + math/draw helpers
  sound.js        Web Audio sound effects
  input.js        keyboard / mouse / touch handling
  particles.js    particle bursts
  platforms.js    the six platform types
  items.js        spring/trampoline + jetpack/propeller/spring-shoes power-ups
  enemies.js      monster / ufo / black hole
  bullet.js       projectiles
  player.js       the doodle character
  game.js         world, camera, spawning, collisions, scoring, UI
  main.js         bootstrap + game loop
test/
  smoke.js        headless logic tests (node test/smoke.js)
```

## Tests

```bash
node test/smoke.js
```

Runs the game logic in a stubbed DOM and verifies bounces, each platform type,
springs, stomps, fatal contacts, the UFO beam, bullets, power-ups, and 1500
frames of loop stability.
