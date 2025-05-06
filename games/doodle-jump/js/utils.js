"use strict";

// ---------------------------------------------------------------------------
// Global tuning constants. Coordinate system: y grows DOWNWARD (screen-style).
// "Up" / jumping is negative vy. World coords are fixed; the camera scrolls up.
// ---------------------------------------------------------------------------
const CONFIG = {
  W: 400,
  H: 600,

  GRAVITY: 2200,        // px/s^2 pulling the player down

  // Horizontal movement
  MOVE_ACCEL: 2200,
  MOVE_MAX: 470,
  FRICTION: 0.80,       // velocity retained per frame when no input (approx)

  // Vertical impulses
  JUMP_V: 820,          // normal platform bounce  -> ~152px height
  SPRING_V: 1380,       // spring bounce           -> ~433px height
  STOMP_V: 1560,        // enemy stomp bounce      -> ~553px (between spring & trampoline)
  TRAMPOLINE_V: 1760,   // trampoline bounce       -> ~704px height (highest)

  YELLOW_FADE: 0.95,    // seconds for a yellow platform to redden and explode

  // Power-ups (constant upward speed for a duration, with invincibility)
  PROPELLER_V: 560, PROPELLER_T: 3.2,
  JETPACK_V: 860, JETPACK_T: 4.0,
  SPRINGY_BOUNCES: 5,   // spring-shoes: this many plain-platform bounces, each
                        // launching as high as a spring (CONFIG.SPRING_V)
  SPRINGY_DROP_VY: -200, // on the final bounce the worn-out shoes ride along
                        // until the player's upward speed decays to this (just
                        // shy of the apex), so the drop is actually visible
  POWERUP_GRACE: 0.4,   // brief immunity after a power-up ends, so you aren't
                        // dropped straight onto an enemy you were flying through;
                        // kept short so the safe stretch can't be milked. Fresh
                        // enemies are also blocked from the blindspot for this
                        // window (see Game.enemySpawnIsFair).

  // Bullets
  BULLET_V: 940,
  SHOOT_COOLDOWN: 0.22,

  // Platforms
  PLAT_W: 68,
  PLAT_H: 16,

  CAMERA_LINE: 0.42,    // keep player around this fraction from the top
};

// Platform type identifiers
const PT = {
  GREEN: "green",   // stationary
  BLUE: "blue",     // moves left/right
  GRAY: "gray",     // moves up/down
  WHITE: "white",   // disappears after one jump
  YELLOW: "yellow", // disappears the moment you rise above it (max one jump)
  BROWN: "brown",   // fake: breaks when you try to land on it
};

// ---- Small math / random helpers -----------------------------------------
function rand(min, max) { return min + Math.random() * (max - min); }
function randInt(min, max) { return Math.floor(rand(min, max + 1)); }
function chance(p) { return Math.random() < p; }
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function lerp(a, b, t) { return a + (b - a) * t; }

// Deterministic hash -> [0, 1) from an integer seed (for stable, infinite
// procedural placement like the parallax clouds).
function hash01(n) {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
}

// Axis-aligned bounding-box overlap test
function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// Squared distance from point (px,py) to the segment (x1,y1)-(x2,y2). Used for
// swept (anti-tunneling) collision against round hazards like black holes.
function distToSegment2(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx, cy = y1 + t * dy;
  const ex = px - cx, ey = py - cy;
  return ex * ex + ey * ey;
}

// Safe localStorage wrapper: never throws (private mode / sandboxed / file://).
const Store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) { /* ignore */ }
  },
};

// Weighted pick: weights is an object { key: weight }. Returns a key.
function weightedPick(weights) {
  let total = 0;
  for (const k in weights) total += weights[k];
  let r = Math.random() * total;
  for (const k in weights) {
    r -= weights[k];
    if (r <= 0) return k;
  }
  return Object.keys(weights)[0];
}

// Rounded-rectangle path helper
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
