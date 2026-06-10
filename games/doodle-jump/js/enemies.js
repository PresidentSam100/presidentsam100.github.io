"use strict";

// Base for things that can hurt the player.
//   type: "monster" | "ufo" | "blackhole"
//   shootable: bullets destroy monsters & ufos, but NOT black holes.
// Monsters and ufos can be stomped (jumped on from above) exactly once for a
// boosted bounce; touching them from the side/below is fatal. The ufo also has
// an abduction beam beneath it that is fatal to touch.
class Enemy {
  constructor(x, y, type) {
    this.type = type;
    this.x = x;
    this.y = y;
    this.dead = false;
    this.dying = 0;       // >0 while playing death shrink
    this.t = 0;           // animation clock

    if (type === "monster") {
      this.w = 50; this.h = 42;
      this.shootable = true;
      this.baseX = x;
      this.vx = rand(20, 55) * (chance(0.5) ? 1 : -1);
      this.driftRange = rand(20, 60);
    } else if (type === "ufo") {
      this.w = 64; this.h = 30;
      this.shootable = true;
      this.bob = rand(0, Math.PI * 2);
      this.baseY = y;
    } else { // blackhole
      this.w = 56; this.h = 56;
      this.shootable = false;
    }
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }

  // UFO abduction beam: fatal trapezoid/rect beneath the saucer.
  get beam() {
    const bw = this.w * 0.7;
    return {
      x: this.cx - bw / 2,
      y: this.y + this.h,
      w: bw,
      h: 80,
    };
  }

  update(dt) {
    this.t += dt;
    if (this.dying > 0) { this.dying -= dt; if (this.dying <= 0) this.dead = true; return; }

    if (this.type === "monster") {
      this.x += this.vx * dt;
      if (this.x < this.baseX - this.driftRange) { this.x = this.baseX - this.driftRange; this.vx *= -1; }
      if (this.x > this.baseX + this.driftRange) { this.x = this.baseX + this.driftRange; this.vx *= -1; }
    } else if (this.type === "ufo") {
      this.y = this.baseY + Math.sin(this.t * 1.6 + this.bob) * 10;
    }
  }

  kill() {
    if (this.dying > 0 || this.dead) return;
    this.dying = 0.18;
  }

  // Player feet crossing the top of the body while falling -> a stomp.
  isStomp(player, prevBottom) {
    if (this.type === "blackhole") return false;
    if (player.vy <= 0) return false;
    const bottom = player.y + player.h;
    const horiz = player.x + player.w > this.x + 4 && player.x < this.x + this.w - 4;
    return horiz && prevBottom <= this.y + this.h * 0.5 && bottom >= this.y;
  }

  // Player's swept bounding box over this frame's vertical travel. The player
  // can move very fast vertically (springs, jetpack, stomps) and on high-refresh
  // displays could otherwise tunnel through a hazard between two frames, so we
  // test the whole path from prevY to y. Horizontal speed is small relative to
  // the body width, so the current x is fine.
  _sweptRect(player) {
    const top = Math.min(player.prevY, player.y);
    const h = Math.abs(player.y - player.prevY) + player.h;
    return { x: player.x, y: top, w: player.w, h };
  }

  // Swept overlap of the player against the solid body.
  bodyHitSwept(player) {
    if (this.dying > 0 || this.dead) return false;
    const s = this._sweptRect(player);
    return aabb(s.x, s.y, s.w, s.h, this.x, this.y, this.w, this.h);
  }

  // Swept overlap of the player against the UFO abduction beam.
  beamHitSwept(player) {
    if (this.type !== "ufo" || this.dying > 0 || this.dead) return false;
    const s = this._sweptRect(player);
    const b = this.beam;
    return aabb(s.x, s.y, s.w, s.h, b.x, b.y, b.w, b.h);
  }

  // Fatal contact (assuming it was not a stomp and player not invincible).
  isLethalTouch(player) {
    if (this.dying > 0 || this.dead) return false;
    if (this.type === "blackhole") {
      // Swept: distance from the path of the player's centre to the hole centre.
      const cx = player.x + player.w / 2;
      const r = this.w / 2 + 6;
      const d2 = distToSegment2(
        this.cx, this.cy,
        cx, player.prevY + player.h / 2,
        cx, player.y + player.h / 2,
      );
      return d2 < r * r;
    }
    if (this.bodyHitSwept(player)) return true;   // body
    if (this.beamHitSwept(player)) return true;   // ufo beam
    return false;
  }

  // Bullets only register against the solid body (not the beam, not black holes).
  hitByBullet(b) {
    if (!this.shootable || this.dying > 0 || this.dead) return false;
    return aabb(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2, this.x, this.y, this.w, this.h);
  }

  render(ctx, cameraY) {
    const sy = this.y - cameraY;
    ctx.save();
    if (this.dying > 0) {
      const s = clamp(this.dying / 0.18, 0, 1);
      ctx.globalAlpha = s;
      ctx.translate(this.cx, sy + this.h / 2);
      ctx.scale(s, s);
      ctx.translate(-this.cx, -(sy + this.h / 2));
    }
    if (this.type === "monster") this._renderMonster(ctx, sy);
    else if (this.type === "ufo") this._renderUfo(ctx, sy);
    else this._renderBlackHole(ctx, sy);
    ctx.restore();
  }

  _renderMonster(ctx, sy) {
    ctx.fillStyle = "#9b3df0";
    roundRect(ctx, this.x, sy, this.w, this.h, 12);
    ctx.fill();
    // horns
    ctx.fillStyle = "#7a25c4";
    ctx.beginPath();
    ctx.moveTo(this.x + 10, sy + 2); ctx.lineTo(this.x + 4, sy - 8); ctx.lineTo(this.x + 18, sy + 2);
    ctx.moveTo(this.x + this.w - 10, sy + 2); ctx.lineTo(this.x + this.w - 4, sy - 8); ctx.lineTo(this.x + this.w - 18, sy + 2);
    ctx.fill();
    // eyes
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(this.x + 17, sy + 18, 7, 0, Math.PI * 2);
    ctx.arc(this.x + this.w - 17, sy + 18, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(this.x + 18, sy + 19, 3, 0, Math.PI * 2);
    ctx.arc(this.x + this.w - 16, sy + 19, 3, 0, Math.PI * 2);
    ctx.fill();
    // mouth
    ctx.fillStyle = "#3a0d63";
    roundRect(ctx, this.x + 14, sy + 28, this.w - 28, 8, 3);
    ctx.fill();
  }

  _renderUfo(ctx, sy) {
    // beam (drawn in screen space relative to sy)
    const b = this.beam;
    const grad = ctx.createLinearGradient(0, sy + this.h, 0, sy + this.h + b.h);
    grad.addColorStop(0, "rgba(120,230,120,0.5)");
    grad.addColorStop(1, "rgba(120,230,120,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(this.cx - b.w / 2, sy + this.h);
    ctx.lineTo(this.cx + b.w / 2, sy + this.h);
    ctx.lineTo(this.cx + b.w / 2 + 12, sy + this.h + b.h);
    ctx.lineTo(this.cx - b.w / 2 - 12, sy + this.h + b.h);
    ctx.closePath();
    ctx.fill();
    // saucer body
    ctx.fillStyle = "#9aa3ad";
    ctx.beginPath();
    ctx.ellipse(this.cx, sy + this.h * 0.62, this.w / 2, this.h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    // dome
    ctx.fillStyle = "#7fd8ff";
    ctx.beginPath();
    ctx.ellipse(this.cx, sy + this.h * 0.5, this.w * 0.3, this.h * 0.5, 0, Math.PI, 0);
    ctx.fill();
    // lights
    ctx.fillStyle = "#ffe14d";
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(this.cx + i * 12, sy + this.h * 0.78, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  _renderBlackHole(ctx, sy) {
    const r = this.w / 2;
    const cx = this.cx, cy = sy + this.h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    grad.addColorStop(0, "#000");
    grad.addColorStop(0.6, "#3a1a5a");
    grad.addColorStop(1, "rgba(90,40,140,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // swirl
    ctx.strokeStyle = "rgba(180,120,240,0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.2) {
      const rr = (a / (Math.PI * 4)) * r * 0.85;
      const px = cx + Math.cos(a + this.t * 3) * rr;
      const py = cy + Math.sin(a + this.t * 3) * rr;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
}
