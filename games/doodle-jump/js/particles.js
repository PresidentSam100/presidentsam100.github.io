"use strict";

// Lightweight particle system for breaks / kills / pickups. World coordinates.
class Particles {
  constructor() { this.list = []; }

  burst(x, y, color, count, spread) {
    count = count || 10;
    spread = spread || 260;
    for (let i = 0; i < count; i++) {
      this.list.push({
        x, y,
        vx: rand(-spread, spread),
        vy: rand(-spread, spread / 2),
        life: rand(0.3, 0.7),
        maxLife: 0.7,
        size: rand(2, 5),
        color,
      });
    }
  }

  update(dt) {
    for (const p of this.list) {
      p.vy += 900 * dt;          // gravity
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }

  render(ctx, cameraY) {
    for (const p of this.list) {
      ctx.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - cameraY - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }
}
