"use strict";

// A platform. Behaviour is driven by `type` (see PT in utils.js).
//   green  -> stationary
//   blue   -> moves horizontally, bounces off the screen edges
//   gray   -> moves vertically around a base point
//   white  -> shatters right after a single bounce
//   yellow -> starts vanishing the instant the player rises above it
//   brown  -> a fake: breaks when the player tries to land, giving no bounce
class Platform {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.w = CONFIG.PLAT_W;
    this.h = CONFIG.PLAT_H;
    this.type = type;

    this.prevY = y;           // y at the start of the previous frame (for landing)
    this.dead = false;        // flagged for removal
    this.broken = false;      // brown/white break animation playing
    this.breakT = 0;
    this.disappearing = false; // yellow: reddening then exploding
    this.disappearT = 0;
    this.used = false;         // yellow: has been jumped on once already
    this.justExploded = false; // signals the Game to spawn an explosion burst

    this.booster = null;      // optional Booster (spring/trampoline) on top
    this.powerup = null;      // optional PowerUp (jetpack/propeller) on top

    // A stable per-platform wobble seed, so the hand-drawn outline doesn't
    // shimmer as frames redraw.
    this.seed = ((x * 13 + y * 7) % 97 + 97) % 97;

    // Movement setup
    if (type === PT.BLUE) {
      this.vx = rand(60, 110) * (chance(0.5) ? 1 : -1);
    } else if (type === PT.GRAY) {
      this.baseY = y;
      this.range = rand(38, 70);
      this.vy = rand(45, 80) * (chance(0.5) ? 1 : -1);
    }
  }

  // Is this platform currently a valid landing surface? A disappearing yellow
  // platform stays landable while it reddens — only once it has fully exploded
  // (dead) is it gone.
  get solid() {
    return !this.broken && !this.dead;
  }

  // Height of whatever gadget is riding on top (booster or active power-up).
  // Gadgets sit ABOVE the platform, so they leave the bottom of the screen
  // slightly later than the platform itself.
  get gadgetHeight() {
    if (this.booster) return this.booster.h;
    if (this.powerup && !this.powerup.dead) return this.powerup.h;
    return 0;
  }

  // Topmost on-screen point of the platform AND anything riding on it, using
  // current positions. Culling/pruning uses this so a platform isn't removed
  // while its booster/power-up is still visible.
  get topWithGadget() {
    let top = this.y;
    if (this.booster) top = Math.min(top, this.booster.y);
    if (this.powerup && !this.powerup.dead) top = Math.min(top, this.powerup.y);
    return top;
  }

  update(dt) {
    this.prevY = this.y; // remember where the top was before this frame's move
    if (this.type === PT.BLUE) {
      this.x += this.vx * dt;
      if (this.x <= 0) { this.x = 0; this.vx *= -1; }
      if (this.x + this.w >= CONFIG.W) { this.x = CONFIG.W - this.w; this.vx *= -1; }
    } else if (this.type === PT.GRAY) {
      this.y += this.vy * dt;
      if (this.y < this.baseY - this.range) { this.y = this.baseY - this.range; this.vy *= -1; }
      if (this.y > this.baseY + this.range) { this.y = this.baseY + this.range; this.vy *= -1; }
    }

    if (this.booster) { this.booster.followPlatform(this); this.booster.update(dt); }
    if (this.powerup && !this.powerup.dead) { this.powerup.followPlatform(this); this.powerup.update(dt); }

    if (this.broken) {
      this.breakT += dt;
      if (this.breakT > 0.5) this.dead = true;
    }
    if (this.disappearing) {
      this.disappearT += dt;
      if (this.disappearT >= CONFIG.YELLOW_FADE) { this.justExploded = true; this.dead = true; }
    }
  }

  // Called when the player lands. Returns the launch velocity (positive number),
  // or 0 if the platform gives no bounce (a fake breaking).
  onLand(player) {
    switch (this.type) {
      case PT.BROWN:
        this.broken = true;
        Sfx.break_();
        return 0;                       // fall straight through
      case PT.WHITE:
        this.broken = true;             // one bounce, then shatter
        Sfx.jump();
        return CONFIG.JUMP_V;
      case PT.YELLOW:
        // A normal bounce — NOT a white-style instant vanish. It only begins
        // reddening/exploding once the player has risen above it (handled by
        // the Game). `used` ensures it can never give a second jump.
        this.used = true;
        Sfx.jump();
        return CONFIG.JUMP_V;
      default:
        Sfx.jump();
        return CONFIG.JUMP_V;
    }
  }

  render(ctx, cameraY) {
    const sy = this.y - cameraY;
    ctx.save();

    if (this.broken) {
      this._renderBroken(ctx, sy);
      ctx.restore();
      return;
    }

    // A disappearing yellow platform reddens over its lifetime, then briefly
    // flashes out just before it explodes.
    let fade = 0;
    if (this.type === PT.YELLOW && this.disappearing) {
      fade = clamp(this.disappearT / CONFIG.YELLOW_FADE, 0, 1);
      ctx.globalAlpha = fade > 0.78 ? clamp(1 - (fade - 0.78) / 0.22, 0, 1) : 1;
    }

    // Doodled sketches: a flat crayon fill inside a wobbly ink outline, with a
    // couple of hatch strokes. Colors keep their meanings.
    const cols = {
      [PT.GREEN]:  ["#6fd45e", "#2e7d27"],
      [PT.BLUE]:   ["#5fb0f2", "#2a629e"],
      [PT.GRAY]:   ["#c3cad2", "#5d6773"],
      [PT.WHITE]:  ["#ffffff", "#8a97a8"],
      [PT.YELLOW]: ["#ffd84d", "#a67f00"],
      [PT.BROWN]:  ["#b07a45", "#5e3c1c"],
    }[this.type];

    this._sketchBody(ctx, this.x, sy, cols[0], cols[1]);

    // reddening overlay as a yellow platform is about to explode
    if (fade > 0) {
      ctx.fillStyle = `rgba(225,40,25,${0.9 * fade})`;
      roundRect(ctx, this.x, sy, this.w, this.h, 8);
      ctx.fill();
    }

    if (this.type === PT.BROWN) {
      // a jagged crack to hint it's fake
      ctx.strokeStyle = "rgba(50,25,8,0.75)";
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(this.x + this.w * 0.32, sy + 1);
      ctx.lineTo(this.x + this.w * 0.44, sy + this.h * 0.55);
      ctx.lineTo(this.x + this.w * 0.38, sy + this.h - 1);
      ctx.moveTo(this.x + this.w * 0.44, sy + this.h * 0.55);
      ctx.lineTo(this.x + this.w * 0.62, sy + this.h * 0.4);
      ctx.stroke();
    }

    ctx.restore();

    if (this.booster) this.booster.render(ctx, cameraY);
    if (this.powerup && !this.powerup.dead) this.powerup.render(ctx, cameraY);
  }

  _renderBroken(ctx, sy) {
    const t = this.breakT / 0.5;
    ctx.globalAlpha = clamp(1 - t, 0, 1);
    const cols = this.type === PT.BROWN ? ["#8a5a2d", "#5e3c1c"] : ["#e8eef4", "#8a97a8"];
    ctx.fillStyle = cols[0];
    ctx.strokeStyle = cols[1];
    ctx.lineWidth = 1.8;
    const drop = t * 90;
    const split = t * 26;
    // left half tilts/falls left, right half right
    roundRect(ctx, this.x - split, sy + drop, this.w / 2 - 2, this.h, 5);
    ctx.fill();
    ctx.stroke();
    roundRect(ctx, this.x + this.w / 2 + 2 + split, sy + drop, this.w / 2 - 2, this.h, 5);
    ctx.fill();
    ctx.stroke();
  }

  // The doodled body: fill, a wobbly two-pass ink outline whose bumps come
  // from the platform's seed, hatch strokes on the left, a chalk highlight.
  _sketchBody(ctx, x, sy, fill, ink) {
    const w = this.w, h = this.h, sd = this.seed;
    ctx.fillStyle = fill;
    roundRect(ctx, x, sy, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = ink;
    ctx.lineCap = "round";
    for (let pass = 0; pass < 2; pass++) {
      const j = (k) => (((sd * (k + 3) * (pass + 2)) % 7) - 3) * 0.35;
      ctx.lineWidth = pass ? 1.1 : 1.8;
      ctx.globalAlpha = pass ? 0.55 : 0.9;
      ctx.beginPath();
      ctx.moveTo(x + 6 + j(1), sy + j(2));
      ctx.quadraticCurveTo(x + w * 0.5 + j(3), sy - 1.4 + j(4), x + w - 6 + j(5), sy + j(6));
      ctx.quadraticCurveTo(x + w + 1.4 + j(7), sy + h * 0.5, x + w - 6 + j(8), sy + h + j(9));
      ctx.quadraticCurveTo(x + w * 0.5 + j(10), sy + h + 1.4 + j(11), x + 6 + j(12), sy + h + j(13));
      ctx.quadraticCurveTo(x - 1.4 + j(14), sy + h * 0.5, x + 6 + j(1), sy + j(2));
      ctx.stroke();
    }
    // hatch strokes
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      const hx = x + 8 + k * 6 + ((sd + k) % 3);
      ctx.moveTo(hx, sy + h - 3);
      ctx.lineTo(hx + 5, sy + 3);
    }
    ctx.stroke();
    // chalk highlight
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + 10, sy + 4.5);
    ctx.quadraticCurveTo(x + w * 0.45, sy + 2.5, x + w - 14, sy + 4);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}
