"use strict";

// A projectile fired by the player. Travels in a fixed direction (always with
// an upward component) and is culled once it leaves the top of the view.
class Bullet {
  constructor(x, y, dirX, dirY) {
    this.x = x;
    this.y = y;
    this.r = 5;
    const len = Math.hypot(dirX, dirY) || 1;
    this.vx = (dirX / len) * CONFIG.BULLET_V;
    this.vy = (dirY / len) * CONFIG.BULLET_V;
    this.dead = false;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  render(ctx, cameraY) {
    const sy = this.y - cameraY;
    ctx.fillStyle = "#2c2c3a";
    ctx.beginPath();
    ctx.arc(this.x, sy, this.r + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff45a";
    ctx.beginPath();
    ctx.arc(this.x, sy, this.r, 0, Math.PI * 2);
    ctx.fill();
  }
}
