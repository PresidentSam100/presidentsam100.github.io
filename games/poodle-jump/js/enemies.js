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

  // A crayon-purple scribble monster: ink outline, hatch shading, zigzag teeth.
  _renderMonster(ctx, sy) {
    ctx.lineJoin = "round";
    // horns first, so the body outline overlaps their base
    ctx.fillStyle = "#8f4fd6";
    ctx.strokeStyle = "#2f3550";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(this.x + 10, sy + 3); ctx.lineTo(this.x + 4, sy - 8); ctx.lineTo(this.x + 18, sy + 3);
    ctx.moveTo(this.x + this.w - 10, sy + 3); ctx.lineTo(this.x + this.w - 4, sy - 8); ctx.lineTo(this.x + this.w - 18, sy + 3);
    ctx.fill();
    ctx.stroke();
    // body
    ctx.fillStyle = "#a86ef0";
    roundRect(ctx, this.x, sy, this.w, this.h, 12);
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.stroke();
    // hatch shading down the left side
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    for (let k = 0; k < 3; k++) {
      ctx.moveTo(this.x + 5 + k * 5, sy + this.h - 6);
      ctx.lineTo(this.x + 10 + k * 5, sy + 8);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    // eyes
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(this.x + 17, sy + 17, 7, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.arc(this.x + this.w - 17, sy + 17, 7, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#111";
    ctx.beginPath();
    ctx.arc(this.x + 18, sy + 18, 3, 0, Math.PI * 2);
    ctx.arc(this.x + this.w - 16, sy + 18, 3, 0, Math.PI * 2);
    ctx.fill();
    // a zigzag mouth full of doodle teeth
    ctx.fillStyle = "#fff";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    const mx = this.x + 12, mw = this.w - 24, my = sy + 29;
    ctx.moveTo(mx, my);
    for (let k = 0; k < 4; k++) {
      ctx.lineTo(mx + mw * (k + 0.5) / 4, my + 7);
      ctx.lineTo(mx + mw * (k + 1) / 4, my);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // A doodled saucer: ink outlines, and a beam sketched as a green wash with
  // dashed pencil edges.
  _renderUfo(ctx, sy) {
    const b = this.beam;
    ctx.lineJoin = "round";
    const grad = ctx.createLinearGradient(0, sy + this.h, 0, sy + this.h + b.h);
    grad.addColorStop(0, "rgba(120,220,120,0.4)");
    grad.addColorStop(1, "rgba(120,220,120,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(this.cx - b.w / 2, sy + this.h);
    ctx.lineTo(this.cx + b.w / 2, sy + this.h);
    ctx.lineTo(this.cx + b.w / 2 + 12, sy + this.h + b.h);
    ctx.lineTo(this.cx - b.w / 2 - 12, sy + this.h + b.h);
    ctx.closePath();
    ctx.fill();
    // dashed pencil edges on the beam
    ctx.strokeStyle = "rgba(60,140,70,0.55)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(this.cx - b.w / 2, sy + this.h);
    ctx.lineTo(this.cx - b.w / 2 - 12, sy + this.h + b.h);
    ctx.moveTo(this.cx + b.w / 2, sy + this.h);
    ctx.lineTo(this.cx + b.w / 2 + 12, sy + this.h + b.h);
    ctx.stroke();
    ctx.setLineDash([]);
    // dome behind the hull
    ctx.fillStyle = "#a5e0f7";
    ctx.strokeStyle = "#2f3550";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(this.cx, sy + this.h * 0.5, this.w * 0.3, this.h * 0.5, 0, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    // saucer hull
    ctx.fillStyle = "#c3cad2";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.ellipse(this.cx, sy + this.h * 0.62, this.w / 2, this.h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // lights
    ctx.fillStyle = "#ffe14d";
    ctx.lineWidth = 1.4;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(this.cx + i * 12, sy + this.h * 0.78, 2.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  // The hole in the page: a scribbled-out ink blot with a turning spiral and
  // a dashed pencil warning ring.
  _renderBlackHole(ctx, sy) {
    const r = this.w / 2;
    const cx = this.cx, cy = sy + this.h / 2;
    const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, r);
    grad.addColorStop(0, "#12141f");
    grad.addColorStop(0.62, "#2c3350");
    grad.addColorStop(1, "rgba(47,53,80,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    // With Visual FX off the spiral and ring are drawn as they are, not turning
    const turn = window.RM_ON && window.RM_ON() ? 0 : this.t;
    // turning spiral, in pale ink
    ctx.strokeStyle = "rgba(170,180,214,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let a = 0; a < Math.PI * 4; a += 0.2) {
      const rr = (a / (Math.PI * 4)) * r * 0.8;
      const px = cx + Math.cos(a + turn * 3) * rr;
      const py = cy + Math.sin(a + turn * 3) * rr;
      if (a === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    // dashed pencil ring, slowly turning the other way
    ctx.strokeStyle = "rgba(47,53,80,0.6)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([7, 6]);
    ctx.lineDashOffset = -turn * 14;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
}
