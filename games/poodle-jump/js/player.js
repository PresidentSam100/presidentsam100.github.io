"use strict";

// Visual FX on (fxOn, utils.js): the bounce gets juice. Each landing squashes
// the poodle and kicks up pencil dust, it stretches with its speed, and a
// launch faster than a normal jump trails speed lines. With FX off it's drawn
// exactly as always, just without that motion. Render-only: the hitbox never
// changes.
const SQUASH_TIME = 0.16;

// The poodle character. Moves left/right, bounces automatically, shoots, and
// can be carried by a power-up (which grants temporary invincibility).
class Player {
  constructor() {
    this.w = 44;
    this.h = 48;
    this.reset();
  }

  reset() {
    this.x = CONFIG.W / 2 - this.w / 2;
    this.y = CONFIG.H - 160;
    this.prevY = this.y;
    this.vx = 0;
    this.vy = 1;            // tiny downward nudge so the first landing triggers
    this.facing = 1;        // -1 left, 1 right (for the eyes)
    this.powerup = null;    // { kind, timer, speed } (jetpack/propeller flight)
    this.springy = 0;       // remaining spring-shoe bounces (0 = not wearing)
    this.springyDropPending = false; // last bounce spent; shoes drop near its apex
    this.grace = 0;         // seconds of immunity remaining after a power-up ends
    this.droppedGear = null; // set to a kind for one frame when a power-up ends
    this.shootTimer = 0;    // brief "nose up/aim" pose after firing
    this.aim = { x: 0, y: -1 };

    // Death-animation render state (driven by Game during the "dying" state)
    this.renderMode = "normal"; // "normal" | "dizzy" | "shrink"
    this.spin = 0;              // body rotation (radians)
    this.scale = 1;            // body scale (for being sucked in)

    // Trampoline front-flip
    this.flipping = false;
    this.flipT = 0;
    this.flipDir = 1;

    // Visual FX on only: landing squash and dust puffs (world coordinates)
    this.squashT = 0;
    this.dust = [];
  }

  // Kick off a single 360° front flip (used by the trampoline).
  startFlip() {
    this.flipping = true;
    this.flipT = 0;
    this.flipDir = this.facing >= 0 ? 1 : -1; // roll forward in the facing direction
  }

  get invincible() { return this.powerup !== null; }

  // Protected from enemies: either flying with a power-up, or in the short
  // grace window right after one ends (so an enemy overhead can't kill you the
  // instant the gear drops — you get a beat to steer or shoot clear).
  get shielded() { return this.powerup !== null || this.grace > 0; }

  startPowerUp(kind, speed, duration) {
    this.powerup = { kind, timer: duration, speed };
    Sfx.powerup();
  }

  // Put on (or refresh) spring shoes: the next CONFIG.SPRINGY_BOUNCES plain
  // platform bounces each launch as high as a spring. This is independent of
  // `powerup` (jetpack/propeller), so the two can be worn at once and the shoe
  // count is preserved — and not spent — during a flight (handleLanding, which
  // is where charges are spent, is skipped while flying).
  giveSpringyShoes() {
    this.springy = CONFIG.SPRINGY_BOUNCES;
    this.springyDropPending = false; // a fresh pair cancels any pending drop
    Sfx.powerup();
  }

  bounce(v) {
    this.vy = -v;
    if (!fxOn()) return;
    this.squashT = SQUASH_TIME;
    const fx = this.x + this.w / 2, fy = this.y + this.h;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      this.dust.push({ x: fx + side * rand(4, 14), y: fy - 2, vx: side * rand(50, 130), vy: -rand(15, 70), r: rand(2.5, 5), life: rand(0.3, 0.45), max: 0.45 });
    }
  }

  update(dt, input) {
    this.prevY = this.y;

    // Horizontal movement with acceleration + friction
    let ax = 0;
    if (input.left) ax -= CONFIG.MOVE_ACCEL;
    if (input.right) ax += CONFIG.MOVE_ACCEL;
    this.vx += ax * dt;
    if (ax === 0) this.vx *= Math.pow(CONFIG.FRICTION, dt * 60);
    this.vx = clamp(this.vx, -CONFIG.MOVE_MAX, CONFIG.MOVE_MAX);
    if (Math.abs(this.vx) > 8) this.facing = this.vx > 0 ? 1 : -1;
    this.x += this.vx * dt;

    // Vertical: power-up overrides gravity with a steady climb
    if (this.powerup) {
      this.vy = -this.powerup.speed;
      this.powerup.timer -= dt;
      if (this.powerup.timer <= 0) {
        this.droppedGear = this.powerup.kind; // tell the Game to drop the gear
        this.powerup = null;
        this.grace = CONFIG.POWERUP_GRACE;    // brief immunity to react on landing
      }
    } else {
      this.vy += CONFIG.GRAVITY * dt;
      if (this.grace > 0) this.grace -= dt;
    }
    this.y += this.vy * dt;

    // Horizontal screen wrap
    if (this.x + this.w < 0) this.x = CONFIG.W;
    else if (this.x > CONFIG.W) this.x = -this.w;

    if (this.shootTimer > 0) this.shootTimer -= dt;

    if (this.squashT > 0) this.squashT -= dt;
    if (this.dust.length) {
      for (const d of this.dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= Math.pow(0.02, dt); d.vy += 120 * dt; d.life -= dt; }
      this.dust = this.dust.filter((d) => d.life > 0);
    }

    // Front-flip animation (one full rotation over the flip duration)
    if (this.flipping) {
      const dur = 0.6;
      this.flipT += dt;
      const k = this.flipT / dur;
      if (k >= 1) { this.flipping = false; this.spin = 0; }
      else this.spin = k * Math.PI * 2 * this.flipDir;
    }
  }

  // Nose-position for the current aim; used when spawning bullets.
  muzzle() {
    return { x: this.x + this.w / 2, y: this.y + 4 };
  }

  noteShot(dir) {
    this.aim = dir;
    this.shootTimer = 0.18;
  }

  render(ctx, cameraY) {
    const sy = this.y - cameraY;
    const cx = this.x + this.w / 2;

    ctx.save();

    // Visual FX on: pencil dust from the last landing, speed lines under a
    // launch faster than a normal jump, and squash and stretch about the feet.
    // (Not while dying: the death animations have their own motion.)
    if (fxOn() && this.renderMode === "normal") {
      this._renderDust(ctx, cameraY);
      const rise = -this.vy;
      if (rise > CONFIG.JUMP_V * 1.08 && !this.flipping) {
        const k = clamp((rise - CONFIG.JUMP_V) / (CONFIG.TRAMPOLINE_V - CONFIG.JUMP_V), 0.15, 1);
        ctx.strokeStyle = "#9aa7c0";
        ctx.lineCap = "round";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.25 + 0.35 * k;
        ctx.beginPath();
        for (const [dx, len] of [[-11, 1], [0, 1.35], [11, 0.9]]) {
          ctx.moveTo(cx + dx, sy + this.h + 6);
          ctx.lineTo(cx + dx, sy + this.h + 6 + 34 * k * len);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      let sxs = 1, sys = 1;
      if (this.squashT > 0) {
        const a = 0.24 * (this.squashT / SQUASH_TIME);   // flattened on touchdown, springing back
        sxs = 1 + a; sys = 1 - a;
      } else {
        const s = clamp((Math.abs(this.vy) - 450) / 4000, 0, 0.12);   // stretched by speed, round at the apex
        sxs = 1 - s * 0.6; sys = 1 + s;
      }
      if (sxs !== 1) {
        const fy = sy + this.h;
        ctx.translate(cx, fy);
        ctx.scale(sxs, sys);
        ctx.translate(-cx, -fy);
      }
    }

    // Death animations rotate/shrink the whole character about its centre
    if (this.spin !== 0 || this.scale !== 1) {
      const cyS = sy + this.h / 2;
      ctx.translate(cx, cyS);
      ctx.rotate(this.spin);
      ctx.scale(this.scale, this.scale);
      ctx.translate(-cx, -cyS);
    }

    // Power-up gear drawn behind the body
    if (this.powerup) this._renderPowerup(ctx, sy);

    // Body: a doodled poodle — cream curls, same ink outline as before
    const coat = this.invincible ? "#fff8ea" : "#f2e7d2";
    const coatDk = "#dcc9a6";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#2f3550";
    ctx.fillStyle = coat;
    roundRect(ctx, this.x + 6, sy + 8, this.w - 12, this.h - 12, 14);
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // the top-knot: scalloped curls along the crown
    ctx.beginPath();
    ctx.arc(this.x + 13, sy + 9, 5, Math.PI, 0);
    ctx.arc(this.x + 22, sy + 7, 6.5, Math.PI, 0);
    ctx.arc(this.x + 31, sy + 9, 5, Math.PI, 0);
    ctx.fillStyle = coat;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    // floppy ears hanging beside the head
    ctx.fillStyle = coatDk;
    ctx.beginPath();
    ctx.ellipse(this.x + 4.5, sy + 21, 5.5, 10, 0.25, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(this.x + this.w - 4.5, sy + 21, 5.5, 10, -0.25, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // pom tail on the trailing side
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.arc(cx - this.facing * (this.w / 2 - 1), sy + 31, 6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // legs with pom ankles
    ctx.fillStyle = coatDk;
    ctx.lineWidth = 1.6;
    ctx.fillRect(this.x + 12, sy + this.h - 8, 7, 8);
    ctx.strokeRect(this.x + 12, sy + this.h - 8, 7, 8);
    ctx.fillRect(this.x + this.w - 19, sy + this.h - 8, 7, 8);
    ctx.strokeRect(this.x + this.w - 19, sy + this.h - 8, 7, 8);
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.arc(this.x + 15.5, sy + this.h - 8, 4.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.x + this.w - 15.5, sy + this.h - 8, 4.5, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    // Spring shoes strapped to the feet while charges remain — and through the
    // final rise until they drop near its apex (springyDropPending).
    if (this.springy > 0 || this.springyDropPending) {
      GearArt.springShoe(ctx, this.x + 15, sy + this.h - 1);
      GearArt.springShoe(ctx, this.x + this.w - 15, sy + this.h - 1);
    }
    // muzzle (points toward facing) with a bean nose
    ctx.fillStyle = coat;
    const snoutDir = this.facing;
    ctx.beginPath();
    ctx.ellipse(cx + snoutDir * 12, sy + 26, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = "#2f3550";
    ctx.beginPath();
    ctx.ellipse(cx + snoutDir * 19, sy + 24, 3.2, 2.6, 0, 0, Math.PI * 2);
    ctx.fill();
    // collar with a little tag
    ctx.strokeStyle = "#e0457b";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(this.x + 9, sy + 35);
    ctx.quadraticCurveTo(cx, sy + 39, this.x + this.w - 9, sy + 35);
    ctx.stroke();
    ctx.strokeStyle = "#2f3550";
    ctx.fillStyle = "#ffd23f";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, sy + 40, 3, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2;

    // eyes
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.arc(cx - 6, sy + 16, 6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx + 8, sy + 16, 6, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    if (this.renderMode === "dizzy") {
      // X_X eyes when stunned by a monster
      ctx.strokeStyle = "#222";
      ctx.lineWidth = 2;
      const drawX = (ex, ey) => {
        ctx.beginPath();
        ctx.moveTo(ex - 3, ey - 3); ctx.lineTo(ex + 3, ey + 3);
        ctx.moveTo(ex + 3, ey - 3); ctx.lineTo(ex - 3, ey + 3);
        ctx.stroke();
      };
      drawX(cx - 6, sy + 16);
      drawX(cx + 8, sy + 16);
    } else {
      ctx.fillStyle = "#222";
      const look = this.facing * 2;
      ctx.beginPath();
      ctx.arc(cx - 6 + look, sy + 16, 2.5, 0, Math.PI * 2);
      ctx.arc(cx + 8 + look, sy + 16, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Invincibility shimmer: a solid ring while flying, and a fast blink during
    // the post-power-up grace window so the player can read that protection is
    // ending and dodge/shoot any enemy overhead before it does.
    // With Visual FX off the grace window is a steady dashed ring instead of
    // the fast (~10Hz) blink: same "protection is ending" cue, no strobe.
    const fxOff = !!(window.RM_ON && window.RM_ON());
    const graceBlink = !this.invincible && this.grace > 0 && (fxOff || Math.floor(this.grace * 20) % 2 === 0);
    if (this.invincible || graceBlink) {
      ctx.strokeStyle = this.invincible ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      if (!this.invincible && fxOff) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, sy + this.h / 2, this.w / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Remaining spring-shoe bounces, shown as a small badge under the feet.
    if (this.springy > 0) {
      ctx.font = '12px "Permanent Marker", "Segoe UI", Arial';
      ctx.textAlign = "center";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.fillStyle = "#e0457b";
      const label = "×" + this.springy;
      ctx.strokeText(label, cx, sy + this.h + 18);
      ctx.fillText(label, cx, sy + this.h + 18);
      ctx.textAlign = "left";
    }

    ctx.restore();
  }

  // Soft pencil-grey puffs, fading as they drift (Visual FX on only)
  _renderDust(ctx, cameraY) {
    if (!this.dust.length) return;
    ctx.fillStyle = "#9aa7c0";
    for (const d of this.dust) {
      const k = clamp(d.life / d.max, 0, 1);
      ctx.globalAlpha = 0.45 * k;
      ctx.beginPath();
      ctx.arc(d.x, d.y - cameraY, d.r * (1.6 - 0.6 * k), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  _renderPowerup(ctx, sy) {
    const cx = this.x + this.w / 2;
    const spin = fxOn() ? performance.now() * 0.02 : 0;   // blades held still with Visual FX off
    if (this.powerup.kind === "jetpack") {
      // Strap the jetpack to the player's back (opposite the facing side)
      const tankX = this.facing >= 0 ? this.x - 4 : this.x + this.w - 12;
      GearArt.jetpack(ctx, tankX, sy + 12, true);
    } else {
      // Propeller beanie on the head
      GearArt.propeller(ctx, cx, sy + 6, spin);
    }
  }
}
