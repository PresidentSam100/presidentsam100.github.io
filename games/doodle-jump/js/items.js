"use strict";

const BOOST_ANIM = 0.3; // seconds for the spring/trampoline bounce animation

// A bounce booster that sits on top of a platform: a spring (high) or a
// trampoline (even higher). Landing on its footprint launches the player.
class Booster {
  constructor(platform, kind) {
    this.kind = kind; // "spring" | "trampoline"
    if (kind === "trampoline") { this.w = 30; this.h = 12; }
    else { this.w = 18; this.h = 14; }
    this.offset = clamp(rand(4, platform.w - this.w - 4), 0, platform.w - this.w);
    this.x = platform.x + this.offset;
    this.y = platform.y - this.h;
    this.anim = 0; // >0 while the bounce animation plays
  }

  get velocity() { return this.kind === "trampoline" ? CONFIG.TRAMPOLINE_V : CONFIG.SPRING_V; }

  // Trigger the squash/stretch when the player bounces on it.
  bounce() { this.anim = BOOST_ANIM; }

  update(dt) { if (this.anim > 0) this.anim -= dt; }

  followPlatform(p) {
    this.x = p.x + this.offset;
    this.y = p.y - this.h;
  }

  // Does the player's footprint overlap the booster?
  hitsPlayer(player) {
    return player.x + player.w > this.x && player.x < this.x + this.w;
  }

  render(ctx, cameraY) {
    const sy = this.y - cameraY;
    // 0 -> 1 -> 0 over the animation, so it eases out and back to rest
    const k = this.anim > 0 ? Math.sin((1 - this.anim / BOOST_ANIM) * Math.PI) : 0;

    if (this.kind === "trampoline") {
      const bow = k * 6; // the mat flexes downward as it launches you
      ctx.fillStyle = "#333";
      ctx.fillRect(this.x + 2, sy + 5, 4, this.h - 2);
      ctx.fillRect(this.x + this.w - 6, sy + 5, 4, this.h - 2);
      ctx.fillStyle = "#e0457b";
      ctx.beginPath();
      ctx.moveTo(this.x - 2, sy + 1);
      ctx.quadraticCurveTo(this.x + this.w / 2, sy + 1 + bow, this.x + this.w + 2, sy + 1);
      ctx.lineTo(this.x + this.w + 2, sy + 6);
      ctx.quadraticCurveTo(this.x + this.w / 2, sy + 6 + bow, this.x - 2, sy + 6);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x, sy + 2.5);
      ctx.quadraticCurveTo(this.x + this.w / 2, sy + 2.5 + bow, this.x + this.w, sy + 2.5);
      ctx.stroke();
    } else {
      // coil spring that stretches upward when sprung
      const extra = k * 12;
      const baseY = sy + this.h;        // bottom (sits on the platform top)
      const topPlate = sy - extra;      // top rises as it extends
      const totalH = this.h + extra;
      ctx.strokeStyle = "#555";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const coils = 3;
      for (let i = 0; i <= coils; i++) {
        const yy = baseY - (i / coils) * totalH;
        ctx.moveTo(this.x, yy);
        ctx.lineTo(this.x + this.w, yy - 3);
      }
      ctx.stroke();
      ctx.fillStyle = "#666";
      roundRect(ctx, this.x - 2, topPlate - 3, this.w + 4, 5, 2);
      ctx.fill();
    }
  }
}

// Shared gear sprites, so the item on a platform, the version worn by the
// player, and the version that falls off all look the same.
const GearArt = {
  // Twin-thruster jetpack: two orange tanks with their own nozzles; `flame`
  // adds twin exhaust plumes. (x, y) is the top-left of a 16x28 footprint.
  jetpack(ctx, x, y, flame) {
    // two tanks side by side
    ctx.fillStyle = "#ff8c1a";
    roundRect(ctx, x, y, 7, 24, 3); ctx.fill();
    roundRect(ctx, x + 9, y, 7, 24, 3); ctx.fill();
    // highlights
    ctx.fillStyle = "#ffd27f";
    roundRect(ctx, x + 1.5, y + 3, 2.5, 12, 1); ctx.fill();
    roundRect(ctx, x + 10.5, y + 3, 2.5, 12, 1); ctx.fill();
    // twin nozzles
    ctx.fillStyle = "#333";
    ctx.fillRect(x + 1, y + 24, 5, 4);
    ctx.fillRect(x + 10, y + 24, 5, 4);
    // twin flames
    if (flame) {
      ctx.fillStyle = "#ffe04d";
      for (const nx of [x + 3.5, x + 12.5]) {
        ctx.beginPath();
        ctx.moveTo(nx - 3, y + 28);
        ctx.lineTo(nx, y + 28 + rand(7, 15));
        ctx.lineTo(nx + 3, y + 28);
        ctx.fill();
      }
    }
  },

  // Propeller "beanie": a little cap with a short mast and two spinning blades.
  // (cx, cy) is the base of the cap.
  propeller(ctx, cx, cy, spin) {
    // cap dome + brim
    ctx.fillStyle = "#8a5cff";
    ctx.beginPath();
    ctx.arc(cx, cy, 10, Math.PI, Math.PI * 2); // top half
    ctx.fill();
    ctx.fillStyle = "#6a3fd6";
    roundRect(ctx, cx - 12, cy - 2, 24, 4, 2); ctx.fill();
    // mast
    ctx.strokeStyle = "#444"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cx, cy - 9); ctx.lineTo(cx, cy - 15); ctx.stroke();
    // two blades spinning around the hub at the top of the mast
    const hy = cy - 16;
    ctx.save();
    ctx.translate(cx, hy);
    ctx.rotate(spin);
    ctx.fillStyle = "#e0457b";
    ctx.beginPath(); ctx.ellipse(9, 0, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(-9, 0, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#333";
    ctx.beginPath(); ctx.arc(cx, hy, 2.5, 0, Math.PI * 2); ctx.fill();
  },

  // A single spring shoe: an orange strap over a pink sole plate riding a short
  // steel coil. (x, y) is where it meets the foot (top-centre of the shoe); the
  // coil + sole extend ~13px below y.
  springShoe(ctx, x, y) {
    // steel coil zig-zagging down to the sole
    ctx.strokeStyle = "#9aa3ad";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x - 4, y + 1);
    ctx.lineTo(x + 4, y + 4);
    ctx.lineTo(x - 4, y + 7);
    ctx.lineTo(x + 4, y + 10);
    ctx.stroke();
    // springy sole plate
    ctx.fillStyle = "#e0457b";
    roundRect(ctx, x - 6, y + 10, 12, 4, 2); ctx.fill();
    // orange strap gripping the foot
    ctx.fillStyle = "#ff8c1a";
    roundRect(ctx, x - 5, y - 2, 10, 4, 1.5); ctx.fill();
  },

  // A side-by-side pair of spring shoes, centred at cx with the soles resting on
  // the line `baseY`. Used for the platform pickup and the worn-out drop.
  springShoes(ctx, cx, baseY) {
    const y = baseY - 14;
    this.springShoe(ctx, cx - 7, y);
    this.springShoe(ctx, cx + 7, y);
  },
};

// A power-up that sits on top of a platform (like a booster). Flying with it
// grants temporary invincibility. Jetpack lifts faster/longer than propeller.
class PowerUp {
  constructor(platform, kind) {
    this.kind = kind;           // "jetpack" | "propeller" | "springy"
    if (kind === "springy") { this.w = 28; this.h = 18; }
    else { this.w = 26; this.h = 30; }
    this.offset = clamp(rand(2, platform.w - this.w - 2), 0, platform.w - this.w);
    this.x = platform.x + this.offset;
    this.y = platform.y - this.h;
    this.dead = false;
    this.spin = 0;
  }

  get speed() { return this.kind === "jetpack" ? CONFIG.JETPACK_V : CONFIG.PROPELLER_V; }
  get duration() { return this.kind === "jetpack" ? CONFIG.JETPACK_T : CONFIG.PROPELLER_T; }

  followPlatform(p) {
    this.x = p.x + this.offset;
    this.y = p.y - this.h;
  }

  update(dt) { this.spin += dt * 18; }

  hits(player) {
    return aabb(player.x, player.y, player.w, player.h, this.x, this.y, this.w, this.h);
  }

  render(ctx, cameraY) {
    const sy = this.y - cameraY;
    ctx.save();
    if (this.kind === "jetpack") {
      GearArt.jetpack(ctx, this.x + (this.w - 16) / 2, sy + 2, false);
    } else if (this.kind === "springy") {
      GearArt.springShoes(ctx, this.x + this.w / 2, sy + this.h);
    } else {
      GearArt.propeller(ctx, this.x + this.w / 2, sy + this.h - 2, this.spin);
    }
    ctx.restore();
  }
}

// A jetpack/propeller that has fallen off the player: it keeps the player's
// momentum, then drops under gravity while tumbling. Cosmetic only.
class DiscardedGear {
  constructor(kind, x, y, vx, vy) {
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.angle = 0;
    this.angVel = rand(-7, 7); // small tumble
    this.spin = 0;             // residual blade spin
    this.dead = false;
  }

  update(dt) {
    this.vy += CONFIG.GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle += this.angVel * dt;
    this.spin += dt * 8;
  }

  render(ctx, cameraY) {
    const sy = this.y - cameraY;
    ctx.save();
    ctx.translate(this.x, sy);
    ctx.rotate(this.angle);
    if (this.kind === "jetpack") GearArt.jetpack(ctx, -8, -13, false);
    else if (this.kind === "shoes") GearArt.springShoes(ctx, 0, 7);
    else GearArt.propeller(ctx, 0, 6, this.spin);
    ctx.restore();
  }
}
