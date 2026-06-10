"use strict";

// The doodle character. Moves left/right, bounces automatically, shoots, and
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

  bounce(v) { this.vy = -v; }

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

    // Body (lime doodle blob)
    ctx.fillStyle = this.invincible ? "#9be36a" : "#7ed957";
    roundRect(ctx, this.x + 6, sy + 8, this.w - 12, this.h - 12, 14);
    ctx.fill();
    // little legs
    ctx.fillStyle = "#5fb53e";
    ctx.fillRect(this.x + 12, sy + this.h - 8, 7, 8);
    ctx.fillRect(this.x + this.w - 19, sy + this.h - 8, 7, 8);
    // Spring shoes strapped to the feet while charges remain — and through the
    // final rise until they drop near its apex (springyDropPending).
    if (this.springy > 0 || this.springyDropPending) {
      GearArt.springShoe(ctx, this.x + 15, sy + this.h - 1);
      GearArt.springShoe(ctx, this.x + this.w - 15, sy + this.h - 1);
    }
    // snout (points toward facing)
    ctx.fillStyle = "#7ed957";
    const snoutDir = this.facing;
    ctx.beginPath();
    ctx.ellipse(cx + snoutDir * 12, sy + 26, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(cx - 6, sy + 16, 6, 0, Math.PI * 2);
    ctx.arc(cx + 8, sy + 16, 6, 0, Math.PI * 2);
    ctx.fill();
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
    const graceBlink = !this.invincible && this.grace > 0 && Math.floor(this.grace * 20) % 2 === 0;
    if (this.invincible || graceBlink) {
      ctx.strokeStyle = this.invincible ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, sy + this.h / 2, this.w / 2 + 4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Remaining spring-shoe bounces, shown as a small badge under the feet.
    if (this.springy > 0) {
      ctx.font = "bold 12px Segoe UI, Arial";
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

  _renderPowerup(ctx, sy) {
    const cx = this.x + this.w / 2;
    const spin = performance.now() * 0.02;
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
