# Spacer: JavaScript Edition

A from-scratch homage to the 1981 Namco arcade classic, built with vanilla
HTML5 Canvas + JavaScript: no build step, no asset files (the sprites are
drawn in code, the sound is Web Audio). It is one of the games on this site,
so it also loads the site's shared scripts from `games/` (`motion-toggle.js`,
`mute-toggle.js`, `game-shell.js`: the Visual FX, sound and pause buttons and
the "Leave this game?" box) and its Oxanium font from Google Fonts. To run it
locally, serve the whole site (for example `python -m http.server 8000` from
the repository root) and open `/games/spacer/`.

```
spacer/
├── index.html        the page: cabinet, canvas, key legend, touch buttons
├── styles.css        the arcade cabinet look
├── game.js           all of the game's logic
└── README.md
```

`game.js` is organised in sections you can search for:
`utils` (constants, math, Catmull-Rom flight paths) · `audio` (Web Audio SFX) ·
`sprites` (pixel-art) · `entities` (Player, Enemy AI, projectiles, FX) ·
`game` (loop, spawning, scoring, collisions, HUD, stage flow).

## Controls

| Key | Action |
|-----|--------|
| ← → or A / D | Move (in game) · pick start stage (title screen) |
| Space | Fire (max 2 shots on screen, 4 when dual; more with Rapid and Spread) |
| ↑ ↓ or 1 2 3 | Select life mode (title screen) |
| Space / Enter | Start / restart (on the end screens Space waits a moment, as it fires in play) |
| Backspace | Back to the title (game over / complete screens) |
| E | Open the **guide** (title and game over screens) |
| P | **Pause menu** (Resume / Restart / Visual FX / Quit), also the ⏸ button |
| V (or F) | Toggle **Visual FX** (the site-wide switch, also the ✨ button) |
| M | Mute (also the speaker button) |
| Esc | Leave for the games page (asking first while a run is going) |

On a touch screen the ◀ ● ▶ buttons move and fire. On the title screen ◀ ▶
pick the start stage, ● steps through the life modes and a tap on the screen
starts; on the end screens ● goes back to the title. While paused, tap a menu
item to choose it.

## Accessibility

- **Pause menu** (P or the ⏸ button): a real menu with **Resume**, **Restart**
  the run, toggle **Visual FX**, or **Quit to Title** (↑↓ to select, Enter to
  confirm; Restart and Quit ask first).
- **Visual FX** (V or F, the ✨ button, or the pause menu; **remembered** across
  sessions, and the same switch every game on the site has). With it **on**
  (default) the game has punchy juice: brief
  **full-screen colour flashes** on death (red), downing a diving Boss (white),
  grabbing a power-up (its colour), capture (blue), stage clear (cyan) and a
  PERFECT bonus (gold), plus bright explosion pops and the usual blinking/pulsing
  UI. Turning it **off** suppresses **all** of that: no screen flashes, no
  explosion flash, steady HUD/prompts, no rapid spawn flicker (a protected
  ship holds at half opacity instead), and steady
  power-up/shield/carrier glows and bombs: gentle for photosensitive players.
  (The screen flashes are one-shot fades, not strobes, so the default stays
  comfortable too.)
- **Screen-reader support**: an ARIA live region announces key events (stage
  start, captures, rescues/dual fighter, bonus results, game over, completion)
  for assistive tech.

## Guide (enemies & power-ups)

Press **E** on the title screen for an in-game **encyclopedia** with two tabs:
**← / →** browses entries, **↑ / ↓** switches tab, **E**, **Enter**, **Esc** or
**Backspace** returns:

- **Enemies**: every type with an animated sprite, name, point values, and a
  short lore blurb (Zako, Goei, Flagships, Captured Fighter, the transformed
  trios Ogawamushi / Ei / Galboss, the challenging-stage specials Tonbo / Momiji
  / Spaceship, and our custom Raider).
- **Power-ups**: each of the eight (Spread, Pierce, Rapid, Shield, Speed,
  Hunter, Slow-mo, Double) with its capsule icon, what it does, and that buffs
  are 12 s, stack, and are lost on death.

## Game modes

On the title screen pick a **life mode** with ↑ / ↓ (or 1, 2, 3) and a **starting stage
(1 to 255)** with ← / → (hold to scroll fast), then Enter:

- **3 Lives**: the classic arcade default.
- **1 Life**: one fighter, no reserves. Sudden death.
- **Infinite**: unlimited fighters (HUD shows ×∞) and no last stage, so play on
  past 255, forever, to chase score and stage count.

The **start-stage picker** lets you jump straight into any level to practice a
specific stage (including the challenging stages at 3, 7, 11, …).

There are **255 stages** (as in the original), and **every one plays
differently**. A deterministic per-stage *profile* varies how the swarm enters,
which dive flight-paths the enemies use, attack cadence and burst size, bomb
behaviour, capture frequency, escorts, dive speed, and how the formation
sways/drifts: all ramping in difficulty as you climb. (All 255 profiles are
verified to have a unique entrance + dive-style signature, so no two stages feel
the same.) In 3 Lives and 1 Life, clear all 255 for a completion screen. A
challenging/bonus stage falls on **stage 3 and every fourth stage after** (3, 7,
11, 15, …), as in the arcade. In **Infinite** mode difficulty saturates near the
top, and past stage 255 the stages carry on (256, 257, …): their patterns come
round again (256 flies stage 1's, 257 stage 2's) at stage 255's difficulty, the
READY banner says so as you pass 255, and the HUD shows the stage as a number
beside one flag instead of a row of badges (as it does for any stage whose
badges would run under the power-up bars).

## Features implemented

**Player**
- Movement, twin-limited firing, fighters by life mode (3, 1 or endless),
  spawn invulnerability flash.
- **Dual fighter**: rescue a captured ship to fly two fighters at once
  (wider hitbox, double shots).
- **Power-ups**: each combat stage seeds 1 or 2 **flashing carrier enemies** that
  drop a falling capsule when destroyed. Catch one for a 12-second buff:
  - **Spread (S)**: 3-way shot
  - **Pierce (P)**: shots punch through enemies
  - **Rapid (R)**: fire rate ×2
  - **Shield (+)**: absorbs one hit and blocks the tractor beam
  - **Speed (F)**: ~1.7× movement speed
  - **Hunter (H)**: shots home in on the nearest enemy
  - **Slow-mo (T)**: slows the whole game down, you, enemies and bombs alike
  - **Double (2)**: every point you score counts twice

  Buffs **stack** (each with its own HUD timer bar) and are lost on death.

**Enemies** (authentic 40-strong formation: 4 Bosses, 16 Butterflies, 20 Bees)
- Curved **entrance flights** that stream in along spline paths, then settle
  into a swaying, breathing formation.
- **Canonical, type-specific attack runs:**
  - **Zako (Bee)**: veers to your position and plunges, then turns at the
    bottom and comes **back up to ambush you from behind** before exiting the top.
  - **Goei (Butterfly)**: dives in a **zig-zag** toward you; when escorting a
    Boss it flies like the Boss instead.
  - **Flagships**: alternates **(1) loop-then-dive** (sometimes leading 1 or 2
    Goei escorts) and **(2)** flying to a random spot to deploy its **tractor
    beam**. Uses only the dive while a fighter is captured / you're dual / the
    formation is broken. Downing a Boss mid-dive makes every enemy **hold fire
    briefly**.
- **Tractor beam capture & rescue**: get caught for a lost fighter; shoot that
  Boss **while it dives** to free the pilot and dock into a **dual fighter**.
  Shoot it **in formation** and the captive breaks loose as a hostile enemy.
  The captured ship rides behind the Boss: shoot it (500/1000) and it's gone.
- **Transformed enemies** (stages 4+): a Zako morphs into a **trio** of
  **Ogawamushi / Ei / Galboss** (rotating) that dive together for a group bonus
  (1000/2000/3000); die with a trio on screen and one member reverts to formation.
- **End-of-stage assault**: when the swarm is nearly gone, the survivors stop
  returning to formation and attack relentlessly: Zakos **circle the fighter**.
- Bosses take 2 hits (turn blue when damaged). Scoring matches the arcade:
  Bee 50/100, Butterfly 80/160, Boss 150 / 400 / 800 / 1600 (with 0/1/2 escorts),
  Captured Fighter 500/1000, transformed enemies 160 each.
- **Extra attackers** (our additions): orange **side raiders** that sweep in one
  at a time from the edges, and in-convoy **chargers** that peel off mid-entrance.

**Challenging / bonus stages** (stages 3, 7, 11, 15, …)
- Each is **one rotating enemy line-up** (Zako, Goei, Tonbo, Ogawamushi, Momiji,
  Ei, Galboss, Spaceship) **plus four Flagships**, in 5 waves of 8: flying
  through in patterns, never attacking.
- **Clear a whole wave** for a bonus (1000 to 3000). Per-hit scoring, and a
  **PERFECT 10,000** for shooting all 40.

**Scoring** (matches the arcade table)
- Bee 50 / 100 · Butterfly 80 / 160 · Boss 150 in formation,
  400 diving alone, **800 / 1600** with 1 / 2 surviving escorts.
- Rescued-fighter bonus, floating score popups, persistent high score
  (saved to `localStorage`).

**Presentation**
- Twinkling parallax starfield, particle explosions, stage banners,
  bottom-right **stage flag badges**, blinking 1UP / HIGH SCORE HUD.

## Notes

Flight paths are generated from Catmull-Rom splines over a handful of
waypoints, so entrances and dives are smooth and constant-speed. This is a
faithful homage rather than a pixel-exact reproduction of the original ROM.
