# GALAGA — JavaScript Edition

A from-scratch clone of the 1981 Namco arcade classic, built with vanilla
HTML5 Canvas + JavaScript. **Everything lives in a single self-contained
`index.html`** (inline CSS + JS) — no build step, no dependencies, no asset
files. Just open it in a browser (double-click works; it runs from `file://`)
or drop it on any static host.

```
galaga/
├── index.html        the entire game — markup, styles, and all logic inline
└── README.md
```

The inline script is organised in sections you can search for:
`utils` (constants, math, Catmull-Rom flight paths) · `audio` (Web Audio SFX) ·
`sprites` (pixel-art) · `entities` (Player, Enemy AI, projectiles, FX) ·
`game` (loop, spawning, scoring, collisions, HUD, stage flow).

## Controls

| Key | Action |
|-----|--------|
| ← → or A / D | Move (in game) · pick start stage (title screen) |
| Space | Fire (max 2 shots on screen, 4 when dual) |
| ↑ ↓ | Select life mode (title screen) |
| Enter | Start / restart |
| E | Open the **enemy guide** (title screen) |
| P | **Pause menu** (Resume / Restart / Reduced Flash / Quit) |
| F | Toggle **reduced-flash** mode |
| M | Mute |

## Accessibility

- **Pause menu** (P): a real menu — **Resume**, **Restart** the run, toggle
  **Reduced Flash**, or **Quit to Title** (↑↓ to select, Enter to confirm).
- **Reduced-flash mode** (F, or via the pause menu; **remembered** across
  sessions). With it **off** (default) the game has punchy juice: brief
  **full-screen colour flashes** on death (red), downing a diving Boss (white),
  grabbing a power-up (its colour), capture (blue), stage clear (cyan) and a
  PERFECT bonus (gold), plus bright explosion pops and the usual blinking/pulsing
  UI. Turning it **on** suppresses **all** of that — no screen flashes, no
  explosion flash, steady HUD/prompts, no rapid spawn flicker, and steady
  power-up/shield/carrier glows and bombs — gentle for photosensitive players.
  (The screen flashes are one-shot fades, not strobes, so the default stays
  comfortable too.)
- **Screen-reader support**: an ARIA live region announces key events (stage
  start, captures, rescues/dual fighter, bonus results, game over, completion)
  for assistive tech.

## Guide (enemies & power-ups)

Press **E** on the title screen for an in-game **encyclopedia** with two tabs —
**← / →** browses entries, **↑ / ↓** switches tab, **E / Esc** returns:

- **Enemies** — every type with an animated sprite, name, point values, and a
  short lore blurb (Zako, Goei, Boss Galaga, Captured Fighter, the transformed
  trios Ogawamushi / Ei / Galboss, the challenging-stage specials Tonbo / Momiji
  / Spaceship, and our custom Raider).
- **Power-ups** — each of the six (Spread, Pierce, Rapid, Shield, Speed, Hunter)
  with its capsule icon, what it does, and that buffs are 12 s, stack, and are
  lost on death.

## Game modes

On the title screen pick a **life mode** with ↑ / ↓ and a **starting stage
(1–255)** with ← / → (hold to scroll fast), then Enter:

- **3 Lives** — the classic arcade default.
- **1 Life** — one fighter, no reserves. Sudden death.
- **Infinite** — unlimited fighters (HUD shows ×∞); play forever to chase score
  and stage count.

The **start-stage picker** lets you jump straight into any level to practice a
specific stage (including the challenging stages at 3, 7, 11, …).

There are **255 stages** (as in the original), and **every one plays
differently**. A deterministic per-stage *profile* varies how the swarm enters,
which dive flight-paths the enemies use, attack cadence and burst size, bomb
behaviour, capture frequency, escorts, dive speed, and how the formation
sways/drifts — all ramping in difficulty as you climb. (All 255 profiles are
verified to have a unique entrance + dive-style signature, so no two stages feel
the same.) Clear all 255 for a completion screen. A challenging/bonus stage
falls on **stage 3 and every fourth stage after** (3, 7, 11, 15, …), as in the
arcade. In **Infinite** mode difficulty saturates near the top so you can keep
chasing score.

## Features implemented

**Player**
- Movement, twin-limited firing, 3 fighters, spawn invulnerability flash.
- **Dual fighter**: rescue a captured ship to fly two fighters at once
  (wider hitbox, double shots).
- **Power-ups**: each combat stage seeds 1–2 **flashing carrier enemies** that
  drop a falling capsule when destroyed. Catch one for a 12-second buff:
  - **Spread (S)** — 3-way shot
  - **Pierce (P)** — shots punch through enemies
  - **Rapid (R)** — fire rate ×2
  - **Shield (+)** — absorbs one hit and blocks the tractor beam
  - **Speed (F)** — ~1.7× movement speed
  - **Hunter (H)** — shots home in on the nearest enemy

  Buffs **stack** (each with its own HUD timer bar) and are lost on death.

**Enemies** (authentic 40-strong formation: 4 Bosses, 16 Butterflies, 20 Bees)
- Curved **entrance flights** that stream in along spline paths, then settle
  into a swaying, breathing formation.
- **Canonical, type-specific attack runs:**
  - **Zako (Bee)** — veers to your position and plunges, then turns at the
    bottom and comes **back up to ambush you from behind** before exiting the top.
  - **Goei (Butterfly)** — dives in a **zig-zag** toward you; when escorting a
    Boss it flies like the Boss instead.
  - **Boss Galaga** — alternates **(1) loop-then-dive** (sometimes leading 1–2
    Goei escorts) and **(2)** flying to a random spot to deploy its **tractor
    beam**. Uses only the dive while a fighter is captured / you're dual / the
    formation is broken. Downing a Boss mid-dive makes every enemy **hold fire
    briefly**.
- **Tractor beam capture & rescue**: get caught for a lost fighter; shoot that
  Boss **while it dives** to free the pilot and dock into a **dual fighter**.
  Shoot it **in formation** and the captive breaks loose as a hostile enemy.
  The captured ship rides behind the Boss — shoot it (500/1000) and it's gone.
- **Transformed enemies** (stages 4+): a Zako morphs into a **trio** of
  **Ogawamushi / Ei / Galboss** (rotating) that dive together for a group bonus
  (1000/2000/3000); die with a trio on screen and one member reverts to formation.
- **End-of-stage assault**: when the swarm is nearly gone, the survivors stop
  returning to formation and attack relentlessly — Zakos **circle the fighter**.
- Bosses take 2 hits (turn blue when damaged). Scoring matches the arcade:
  Bee 50/100, Butterfly 80/160, Boss 150 / 400 / 800 / 1600 (with 0/1/2 escorts),
  Captured Fighter 500/1000, transformed enemies 160 each.
- **Extra attackers** (our additions): orange **side raiders** that sweep in one
  at a time from the edges, and in-convoy **chargers** that peel off mid-entrance.

**Challenging / bonus stages** (stages 3, 7, 11, 15, …)
- Each is **one rotating enemy line-up** (Zako, Goei, Tonbo, Ogawamushi, Momiji,
  Ei, Galboss, Enterprise) **plus four Boss Galagas**, in 5 waves of 8 — flying
  through in patterns, never attacking.
- **Clear a whole wave** for a bonus (1000–3000). Per-hit scoring, and a
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
