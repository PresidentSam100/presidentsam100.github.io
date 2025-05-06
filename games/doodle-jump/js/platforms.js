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

    const cols = {
      [PT.GREEN]:  ["#5fcf52", "#3da832"],
      [PT.BLUE]:   ["#52a7ef", "#2f78c4"],
      [PT.GRAY]:   ["#b9c0c9", "#8a939e"],
      [PT.WHITE]:  ["#ffffff", "#d4dde6"],
      [PT.YELLOW]: ["#ffd84d", "#e6b800"],
      [PT.BROWN]:  ["#b07a45", "#8a5a2d"],
    }[this.type];

    // body
    const grad = ctx.createLinearGradient(0, sy, 0, sy + this.h);
    grad.addColorStop(0, cols[0]);
    grad.addColorStop(1, cols[1]);
    ctx.fillStyle = grad;
    roundRect(ctx, this.x, sy, this.w, this.h, 7);
    ctx.fill();
    // subtle top highlight
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    roundRect(ctx, this.x + 4, sy + 3, this.w - 8, 4, 2);
    ctx.fill();

    // reddening overlay as a yellow platform is about to explode
    if (fade > 0) {
      ctx.fillStyle = `rgba(225,40,25,${0.9 * fade})`;
      roundRect(ctx, this.x, sy, this.w, this.h, 7);
      ctx.fill();
    }

    if (this.type === PT.BROWN) {
      // crack lines to hint it's fake
      ctx.strokeStyle = "rgba(60,30,10,0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(this.x + this.w * 0.35, sy + 2);
      ctx.lineTo(this.x + this.w * 0.45, sy + this.h - 2);
      ctx.moveTo(this.x + this.w * 0.7, sy + 2);
      ctx.lineTo(this.x + this.w * 0.6, sy + this.h - 2);
      ctx.stroke();
    }

    ctx.restore();

    if (this.booster) this.booster.render(ctx, cameraY);
    if (this.powerup && !this.powerup.dead) this.powerup.render(ctx, cameraY);
  }

  _renderBroken(ctx, sy) {
    const t = this.breakT / 0.5;
    ctx.globalAlpha = clamp(1 - t, 0, 1);
    const col = this.type === PT.BROWN ? "#8a5a2d" : "#d4dde6";
    ctx.fillStyle = col;
    const drop = t * 90;
    const split = t * 26;
    // left half tilts/falls left, right half right
    roundRect(ctx, this.x - split, sy + drop, this.w / 2 - 2, this.h, 5);
    ctx.fill();
    roundRect(ctx, this.x + this.w / 2 + 2 + split, sy + drop, this.w / 2 - 2, this.h, 5);
    ctx.fill();
  }
}
