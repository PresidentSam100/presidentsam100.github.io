// ============================================================
// CONSTANTS
// ============================================================
// Reduce-motion state for this game (live) — set by the top-right toggle / OS setting.
const reducedMotion = () => !!(window.RM_ON && window.RM_ON());
const CANVAS_W = 480;
const CANVAS_H = 854;
const GRAVITY = 2000;
const FLAP_STRENGTH = -580;
const MAX_FALL = 750;
const BASE_SCROLL = 200;
const MAX_SCROLL = 480;
const PIPE_W = 70;
const PIPE_GAP = 180;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function rectRect(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function clamp(v, lo, hi) { return Math.min(Math.max(v, lo), hi); }
function lerp(a, b, t) { return a + (b - a) * t; }

// ============================================================
// BIRD CLASS
// ============================================================
class Bird {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vy = 0;
    this.rotation = 0;
    this.flapTime = 0;
  }

  flap() {
    this.vy = FLAP_STRENGTH;
    this.flapTime = 0;
  }

  // Used on the start / game-over screen — bird hovers in place with a gentle bob
  // pos: {x, y} optional override of hover position
  idle(dt, t, pos) {
    this.vy = 0;
    this.rotation = lerp(this.rotation, 0, 0.1);
    const bx = pos ? pos.x : 120;
    const by = pos ? pos.y : 400;
    this.x = bx;
    this.y = by + Math.sin(t * 3) * 14;
    this.flapTime += dt * 10;
  }

  update(dt) {
    this.vy += GRAVITY * dt;
    this.vy = clamp(this.vy, -800, MAX_FALL);
    this.y += this.vy * dt;
    const target = clamp(this.vy / MAX_FALL * 90, -30, 90);
    this.rotation = lerp(this.rotation, target, 0.18);
    const rate = (this.vy < 0) ? 18 : 5;
    this.flapTime += dt * rate;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation * Math.PI / 180);

    // Wing (drawn before body so it appears behind)
    const wingY = Math.sin(this.flapTime * 15) * 8;
    ctx.beginPath();
    ctx.ellipse(-10, wingY, 10, 6, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#42A5F5';
    ctx.fill();

    // Body - blue oval
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#1565C0';
    ctx.fill();
    ctx.strokeStyle = '#0D47A1';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eye - white
    ctx.beginPath();
    ctx.arc(8, -5, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();

    // Pupil
    ctx.beginPath();
    ctx.arc(9, -4, 3, 0, Math.PI * 2);
    ctx.fillStyle = 'black';
    ctx.fill();

    // Beak - orange triangle
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.lineTo(23, 4);
    ctx.lineTo(17, 8);
    ctx.closePath();
    ctx.fillStyle = '#FF6F00';
    ctx.fill();

    ctx.restore();
  }

  getHitbox() {
    return { x: this.x - 12, y: this.y - 10, w: 24, h: 20 };
  }
}

// ============================================================
// BACKGROUND CLASS
// ============================================================
class Background {
  constructor() {
    this.clouds1 = [];
    this.clouds2 = [];
    this.groundScroll = 0;       // pixels of ground scroll (wraps mod tile width)

    for (let i = 0; i < 18; i++) {
      this.clouds1.push({
        x: Math.random() * CANVAS_W,
        y: 30 + Math.random() * 200,
        w: 60 + Math.random() * 40,
        h: 25 + Math.random() * 20,
        speedMult: 0.3
      });
    }

    for (let i = 0; i < 12; i++) {
      this.clouds2.push({
        x: Math.random() * CANVAS_W,
        y: 40 + Math.random() * 220,
        w: 90 + Math.random() * 50,
        h: 40 + Math.random() * 25,
        speedMult: 0.5
      });
    }
  }

  update(dt, speed) {
    for (const c of this.clouds1) {
      c.x -= c.speedMult * speed * dt;
      if (c.x < -c.w) c.x = CANVAS_W + c.w;
    }
    for (const c of this.clouds2) {
      c.x -= c.speedMult * speed * dt;
      if (c.x < -c.w) c.x = CANVAS_W + c.w;
    }
    // Ground scrolls at full world speed; wrap modulo tile width (32 px)
    this.groundScroll = (this.groundScroll + speed * dt) % 32;
  }

  draw(ctx) {
    // Sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    grad.addColorStop(0, '#87CEEB');
    grad.addColorStop(0.6, '#B3E5FC');
    grad.addColorStop(0.85, '#DCEDC8');
    grad.addColorStop(1, '#A5D6A7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Cloud layer 1 (slower, background)
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'white';
    for (const c of this.clouds1) {
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Cloud layer 2 (faster, with shadows)
    for (const c of this.clouds2) {
      // Shadow
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = '#888';
      ctx.beginPath();
      ctx.ellipse(c.x + 3, c.y + 3, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      // Body
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Ground (solid base)
    ctx.fillStyle = '#558B2F';
    ctx.fillRect(0, CANVAS_H - 80, CANVAS_W, 80);
    ctx.fillStyle = '#795548';
    ctx.fillRect(0, CANVAS_H - 80, CANVAS_W, 8);

    // Scrolling texture lines — offset by groundScroll so the ground appears to move
    const off = this.groundScroll;
    ctx.strokeStyle = '#5D4037';
    ctx.lineWidth = 1.5;
    for (let i = -1; i <= Math.ceil(CANVAS_W / 32) + 1; i++) {
      const x = i * 32 - off;
      ctx.beginPath();
      ctx.moveTo(x, CANVAS_H - 72);
      ctx.lineTo(x, CANVAS_H);
      ctx.stroke();
    }

    // Lighter grass tufts on the top strip, also scrolling
    ctx.fillStyle = '#7CB342';
    for (let i = -1; i <= Math.ceil(CANVAS_W / 24) + 1; i++) {
      const x = i * 24 - (off * 0.75);
      ctx.fillRect(x, CANVAS_H - 80, 8, 4);
    }
  }
}

// ============================================================
// PARTICLE SYSTEM
// ============================================================
class Particle {
  constructor(x, y, vx, vy, color, life, text = null) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.life = life;
    this.text = text;
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vy += 200 * dt;
    this.life -= dt;
    this.vx *= 0.97;
  }

  draw(ctx) {
    ctx.globalAlpha = Math.max(0, this.life);
    if (this.text !== null) {
      ctx.font = 'bold 20px sans-serif';
      ctx.fillStyle = this.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.text, this.x, this.y);
    } else {
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  dead() { return this.life <= 0; }
}

class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  addBurst(x, y, color, count = 12) {
    for (let i = 0; i < count; i++) {
      const vx = (i / count - 0.5) * 500;
      const vy = -100 - (i * 250) / count;
      const life = 0.7 + (i / count) * 0.4;
      this.particles.push(new Particle(x, y, vx, vy, color, life));
    }
  }

  addText(x, y, text, color) {
    this.particles.push(new Particle(x, y, 0, -90, color, 1.2, text));
  }

  update(dt) {
    for (const p of this.particles) p.update(dt);
    this.particles = this.particles.filter(p => !p.dead());
  }

  draw(ctx) {
    for (const p of this.particles) p.draw(ctx);
  }
}

// ============================================================
// BASE PIPE
// ============================================================
class BasePipe {
  constructor(x, gapY, gapH) {
    this.x = x;
    this.gapY = gapY;
    this.gapH = gapH;
    this.scored = false;
  }

  draw(ctx) {
    const topH = this.gapY - this.gapH / 2;
    const botY = this.gapY + this.gapH / 2;

    // Top pipe body
    ctx.fillStyle = '#4CAF50';
    ctx.strokeStyle = '#2E7D32';
    ctx.lineWidth = 2;
    ctx.fillRect(this.x, 0, PIPE_W, topH);
    ctx.strokeRect(this.x, 0, PIPE_W, topH);

    // Bottom pipe body
    ctx.fillRect(this.x, botY, PIPE_W, CANVAS_H + 200 - botY);
    ctx.strokeRect(this.x, botY, PIPE_W, CANVAS_H + 200 - botY);

    // Top cap
    ctx.fillStyle = '#66BB6A';
    ctx.fillRect(this.x - 4, topH - 20, PIPE_W + 8, 20);
    ctx.strokeRect(this.x - 4, topH - 20, PIPE_W + 8, 20);

    // Bottom cap
    ctx.fillRect(this.x - 4, botY, PIPE_W + 8, 20);
    ctx.strokeRect(this.x - 4, botY, PIPE_W + 8, 20);
  }

  getHitboxes() {
    const topH = this.gapY - this.gapH / 2;
    const botY = this.gapY + this.gapH / 2;
    return [
      { x: this.x - 2, y: -10, w: PIPE_W + 4, h: topH + 10 },
      { x: this.x - 2, y: botY, w: PIPE_W + 4, h: CANVAS_H }
    ];
  }

  isPassed(birdX) {
    if (!this.scored && birdX > this.x + PIPE_W) {
      this.scored = true;
      return true;
    }
    return false;
  }

  isOffScreen() {
    return this.x + PIPE_W + 10 < 0;
  }

  update(dt, speed) {
    this.x -= speed * dt;
  }
}

// ============================================================
// MOVING PIPE
// ============================================================
class MovingPipe extends BasePipe {
  constructor(x, gapY, gapH) {
    super(x, gapY, gapH);
    this.phase = Math.random() * Math.PI * 2;
    this.baseGapY = gapY;
    this.time = 0;
    this.freq = 0.9 + Math.random() * 1.2;        // 0.9 - 2.1 rad/s
    // Cap the swing so it never hits a world boundary — the raw sine then
    // gives perfect ease-in / ease-out at the top and bottom of each cycle.
    const minGapY = gapH / 2 + 40;
    const maxGapY = CANVAS_H - gapH / 2 - 80;
    const safeAmp = Math.max(0, Math.min(gapY - minGapY, maxGapY - gapY));
    const desiredAmp = 90 + Math.random() * 110;  // 90 - 200 px
    this.amplitude = Math.min(desiredAmp, safeAmp);
  }

  update(dt, speed) {
    super.update(dt, speed);
    this.time += dt;
    // No clamp — amplitude is already bounded, so sin() eases naturally at extremes
    this.gapY = this.baseGapY + Math.sin(this.time * this.freq + this.phase) * this.amplitude;
  }

  draw(ctx) {
    super.draw(ctx);
    const topH = this.gapY - this.gapH / 2;
    const botY = this.gapY + this.gapH / 2;

    // Yellow accent stripes on right edge
    ctx.fillStyle = '#FFD600';
    ctx.fillRect(this.x + PIPE_W - 8, 0, 8, topH);
    ctx.fillRect(this.x + PIPE_W - 8, botY, 8, CANVAS_H + 200 - botY);

    // Arrow indicators
    ctx.fillStyle = '#FFD600';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('↑', this.x + PIPE_W / 2, topH - 30);
    ctx.fillText('↓', this.x + PIPE_W / 2, botY + 30);
  }
}

// ============================================================
// HORIZ PIPE
// ============================================================
class HorizPipe extends BasePipe {
  constructor(x, gapY, gapH) {
    super(x, gapY, gapH);
    this.phase = Math.random() * Math.PI * 2;
    this.baseX = x;
    this.totalScroll = 0;
    // Per-instance oscillation speed and travel
    this.freq = 0.010 + Math.random() * 0.012;    // 0.010 - 0.022 per px scrolled
    this.amplitude = 60 + Math.random() * 50;     // 60 - 110 px
  }

  update(dt, speed) {
    this.totalScroll += speed * dt;
    this.x = this.baseX - this.totalScroll + Math.sin(this.phase + this.totalScroll * this.freq) * this.amplitude;
  }

  draw(ctx) {
    super.draw(ctx);
    const topH = this.gapY - this.gapH / 2;
    const botY = this.gapY + this.gapH / 2;

    // Orange left-edge stripe
    ctx.fillStyle = '#FF6D00';
    ctx.fillRect(this.x, 0, 8, topH);
    ctx.fillRect(this.x, botY, 8, CANVAS_H + 200 - botY);

    // Arrow indicators
    ctx.fillStyle = '#FF6D00';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const midGapY = this.gapY;
    ctx.fillText('←', this.x + PIPE_W / 2 - 15, midGapY);
    ctx.fillText('→', this.x + PIPE_W / 2 + 15, midGapY);
  }
}

// ============================================================
// SEQ PIPE (Double-gap, purple)
// ============================================================
class SeqPipe {
  constructor(x) {
    this.x = x;
    this.scored = false;
  }

  draw(ctx) {
    ctx.fillStyle = '#7B1FA2';
    ctx.strokeStyle = '#4A148C';
    ctx.lineWidth = 2;

    // Three solid sections
    ctx.fillRect(this.x, 0, PIPE_W, 170);
    ctx.strokeRect(this.x, 0, PIPE_W, 170);
    ctx.fillRect(this.x, 320, PIPE_W, 180);
    ctx.strokeRect(this.x, 320, PIPE_W, 180);
    ctx.fillRect(this.x, 650, PIPE_W, CANVAS_H + 200 - 650);
    ctx.strokeRect(this.x, 650, PIPE_W, CANVAS_H + 200 - 650);

    // Caps (purple, slightly lighter)
    ctx.fillStyle = '#9C27B0';
    // Bottom of top solid (y=150, inner face downward)
    ctx.fillRect(this.x - 4, 150, PIPE_W + 8, 20);
    // Top of middle solid (y=320, inner face upward)
    ctx.fillRect(this.x - 4, 300, PIPE_W + 8, 20);
    // Bottom of middle solid (y=480, inner face downward)
    ctx.fillRect(this.x - 4, 480, PIPE_W + 8, 20);
    // Top of bottom solid (y=650, inner face upward)
    ctx.fillRect(this.x - 4, 630, PIPE_W + 8, 20);

    // x2 labels in gaps
    ctx.fillStyle = '#E1BEE7';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('x2', this.x + PIPE_W / 2, 245);
    ctx.fillText('x2', this.x + PIPE_W / 2, 575);
  }

  getHitboxes() {
    return [
      { x: this.x - 2, y: -10, w: PIPE_W + 4, h: 172 },
      { x: this.x - 2, y: 320, w: PIPE_W + 4, h: 182 },
      { x: this.x - 2, y: 650, w: PIPE_W + 4, h: CANVAS_H }
    ];
  }

  isPassed(birdX) {
    if (!this.scored && birdX > this.x + PIPE_W) {
      this.scored = true;
      return true;
    }
    return false;
  }

  isOffScreen() {
    return this.x + PIPE_W + 10 < 0;
  }

  update(dt, speed) {
    this.x -= speed * dt;
  }
}

// ============================================================
// BLINK PIPE
// ============================================================
class BlinkPipe extends BasePipe {
  constructor(x, gapY, gapH) {
    super(x, gapY, gapH);
    this.cycleTime = 0;
    this.cyclePhase = 'solid';
  }

  update(dt, speed) {
    super.update(dt, speed);
    this.cycleTime += dt;
    if (this.cyclePhase === 'solid' && this.cycleTime >= 2.5) {
      this.cyclePhase = 'warning';
      this.cycleTime = 0;
    } else if (this.cyclePhase === 'warning' && this.cycleTime >= 0.5) {
      this.cyclePhase = 'invisible';
      this.cycleTime = 0;
    } else if (this.cyclePhase === 'invisible' && this.cycleTime >= 0.8) {
      this.cyclePhase = 'solid';
      this.cycleTime = 0;
    }
  }

  draw(ctx) {
    if (this.cyclePhase === 'invisible') {
      ctx.globalAlpha = 0.08;
      super.draw(ctx);
      ctx.globalAlpha = 1;
    } else if (this.cyclePhase === 'warning') {
      const flicker = Math.abs(Math.sin(this.cycleTime * 20 * Math.PI));
      ctx.globalAlpha = flicker;
      super.draw(ctx);
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'yellow';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', this.x + PIPE_W / 2, this.gapY);
    } else {
      super.draw(ctx);
    }
  }

  getHitboxes() {
    if (this.cyclePhase === 'invisible') return [];
    return super.getHitboxes();
  }
}

// ============================================================
// Constants for the size-shifting pipes (Opening/Closing).
// Transition is saturated outside the bird's passage zone so the gap
// is at its "before" size before entry and "after" size after exit.
// Passage zone (with bird at x=120, pipe width 70):
//   dist = pipe.x - bird.x ∈ (-82, +12)  → centered at dist=-35, half-width 47
// ============================================================
const SHIFT_PIPE_OFFSET = 25;                // gap size delta (±25 px from 180)
const SHIFT_PIPE_CENTER = -35;               // dist value at midpoint of bird's passage
const SHIFT_PIPE_HALF_WIDTH = 47;            // dist half-width of the passage zone

function shiftPipeT(pipeX, birdX) {
  const dist = pipeX - birdX;
  return clamp((dist - SHIFT_PIPE_CENTER) / SHIFT_PIPE_HALF_WIDTH, -1, 1);
}

// ============================================================
// NARROW-ENTRY PIPE — gap is narrower when the bird approaches and wider
// after the bird has passed (transition tied to bird position).
// ============================================================
class NarrowEntryPipe extends BasePipe {
  constructor(x, gapY, gapH) {
    super(x, gapY, gapH);
    this.baseGapH = gapH;
  }

  update(dt, speed, birdX) {
    super.update(dt, speed);
    const bx = (birdX === undefined) ? 120 : birdX;
    const t = shiftPipeT(this.x, bx);
    this.gapH = this.baseGapH - SHIFT_PIPE_OFFSET * t;
  }

  draw(ctx) {
    super.draw(ctx);
    const topH = this.gapY - this.gapH / 2;
    const botY = this.gapY + this.gapH / 2;
    ctx.fillStyle = '#00BCD4';
    ctx.fillRect(this.x - 8, topH - 22, PIPE_W + 16, 4);
    ctx.fillRect(this.x - 8, botY + 18, PIPE_W + 16, 4);
    ctx.fillStyle = '#00BCD4';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▲', this.x + PIPE_W / 2, topH - 32);
    ctx.fillText('▼', this.x + PIPE_W / 2, botY + 32);
  }
}

// ============================================================
// NARROW-EXIT PIPE — gap is wider when the bird approaches and narrower
// after the bird has passed (mirror of NarrowEntryPipe).
// ============================================================
class NarrowExitPipe extends BasePipe {
  constructor(x, gapY, gapH) {
    super(x, gapY, gapH);
    this.baseGapH = gapH;
  }

  update(dt, speed, birdX) {
    super.update(dt, speed);
    const bx = (birdX === undefined) ? 120 : birdX;
    const t = shiftPipeT(this.x, bx);
    this.gapH = this.baseGapH + SHIFT_PIPE_OFFSET * t;
  }

  draw(ctx) {
    super.draw(ctx);
    const topH = this.gapY - this.gapH / 2;
    const botY = this.gapY + this.gapH / 2;
    ctx.fillStyle = '#E91E63';
    ctx.fillRect(this.x - 8, topH - 22, PIPE_W + 16, 4);
    ctx.fillRect(this.x - 8, botY + 18, PIPE_W + 16, 4);
    ctx.fillStyle = '#E91E63';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼', this.x + PIPE_W / 2, topH - 32);
    ctx.fillText('▲', this.x + PIPE_W / 2, botY + 32);
  }
}

// ============================================================
// OPEN PIPE — the pipe physically opens for the bird: top edge moves UP
// and bottom edge moves DOWN over time as the pipe crosses the screen.
// Gap grows from narrow to wide. Bird arrives mid-transition (gap ~170 px).
// ============================================================
class OpenPipe extends BasePipe {
  constructor(x, gapY, gapH) {
    super(x, gapY, gapH);
    this.startGapH = 100;
    this.endGapH = 230;
    this.spawnX = x;
    this.morphDist = 560;       // ~one screen-width of travel
    this.gapH = this.startGapH;
  }

  update(dt, speed) {
    super.update(dt, speed);
    const t = clamp((this.spawnX - this.x) / this.morphDist, 0, 1);
    this.gapH = lerp(this.startGapH, this.endGapH, t);
  }

  draw(ctx) {
    super.draw(ctx);
    const topH = this.gapY - this.gapH / 2;
    const botY = this.gapY + this.gapH / 2;
    // Teal accent — actively opening
    ctx.fillStyle = '#00897B';
    ctx.fillRect(this.x - 8, topH - 22, PIPE_W + 16, 4);
    ctx.fillRect(this.x - 8, botY + 18, PIPE_W + 16, 4);
    // Arrows showing both edges moving outward (away from gap center)
    ctx.fillStyle = '#00897B';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▲', this.x + PIPE_W / 2, topH - 14);
    ctx.fillText('▼', this.x + PIPE_W / 2, botY + 14);
  }
}

// ============================================================
// CLOSE PIPE — the pipe physically closes on the bird: top edge moves DOWN
// and bottom edge moves UP over time. Gap shrinks from wide to narrow.
// Bird arrives mid-transition (gap ~135 px).
// ============================================================
class ClosePipe extends BasePipe {
  constructor(x, gapY, gapH) {
    super(x, gapY, gapH);
    this.startGapH = 230;
    this.endGapH = 100;
    this.spawnX = x;
    this.morphDist = 560;
    this.gapH = this.startGapH;
  }

  update(dt, speed) {
    super.update(dt, speed);
    const t = clamp((this.spawnX - this.x) / this.morphDist, 0, 1);
    this.gapH = lerp(this.startGapH, this.endGapH, t);
  }

  draw(ctx) {
    super.draw(ctx);
    const topH = this.gapY - this.gapH / 2;
    const botY = this.gapY + this.gapH / 2;
    // Deep orange accent — actively closing
    ctx.fillStyle = '#E65100';
    ctx.fillRect(this.x - 8, topH - 22, PIPE_W + 16, 4);
    ctx.fillRect(this.x - 8, botY + 18, PIPE_W + 16, 4);
    // Arrows showing both edges moving inward (toward gap center)
    ctx.fillStyle = '#E65100';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▼', this.x + PIPE_W / 2, topH - 14);
    ctx.fillText('▲', this.x + PIPE_W / 2, botY + 14);
  }
}

// ============================================================
// PIPE MANAGER
// ============================================================
class PipeManager {
  constructor(game) {
    this.game = game;
    this.pipes = [];
    this.spawnTimer = 1200;
    this.spawnCount = 0;
  }

  update(dt, speed, birdX) {
    this.spawnTimer -= dt * 1000;
    if (this.spawnTimer <= 0) {
      this.spawnPipe();
      this.spawnTimer = Math.max(700, 1800 - this.game.score * 18);
    }
    for (const p of this.pipes) p.update(dt, speed, birdX);
    this.pipes = this.pipes.filter(p => !p.isOffScreen());
  }

  draw(ctx) {
    for (const p of this.pipes) p.draw(ctx);
  }

  getHitboxes() {
    return this.pipes.flatMap(p => p.getHitboxes());
  }

  checkScored(birdX) {
    let points = 0;
    for (const p of this.pipes) {
      if (p.isPassed(birdX)) points++;
    }
    return points;
  }

  reset() {
    this.pipes = [];
    this.spawnTimer = 1200;
    this.spawnCount = 0;
  }

  spawnPipe() {
    const gapH = PIPE_GAP;
    const pipeX = CANVAS_W + 10;
    const score = this.game.score;

    // Random gapY across the playable vertical range
    const minGapY = gapH / 2 + 80;
    const maxGapY = CANVAS_H - gapH / 2 - 140;
    const gapY = minGapY + Math.random() * (maxGapY - minGapY);

    // Weighted random pipe-type selection per score tier
    const r = Math.random();
    let pipe;
    if (score < 5) {
      pipe = new BasePipe(pipeX, gapY, gapH);
    } else if (score < 10) {
      // base / moving / pinch-in / pinch-out / open / close
      if (r < 0.42)      pipe = new BasePipe(pipeX, gapY, gapH);
      else if (r < 0.66) pipe = new MovingPipe(pipeX, gapY, gapH);
      else if (r < 0.74) pipe = new NarrowEntryPipe(pipeX, gapY, gapH);
      else if (r < 0.82) pipe = new NarrowExitPipe(pipeX, gapY, gapH);
      else if (r < 0.91) pipe = new OpenPipe(pipeX, gapY, gapH);
      else               pipe = new ClosePipe(pipeX, gapY, gapH);
    } else if (score < 15) {
      if (r < 0.25)      pipe = new BasePipe(pipeX, gapY, gapH);
      else if (r < 0.42) pipe = new MovingPipe(pipeX, gapY, gapH);
      else if (r < 0.58) pipe = new HorizPipe(pipeX, gapY, gapH);
      else if (r < 0.70) pipe = new NarrowEntryPipe(pipeX, gapY, gapH);
      else if (r < 0.82) pipe = new NarrowExitPipe(pipeX, gapY, gapH);
      else if (r < 0.91) pipe = new OpenPipe(pipeX, gapY, gapH);
      else               pipe = new ClosePipe(pipeX, gapY, gapH);
    } else if (score < 20) {
      if (r < 0.14)      pipe = new BasePipe(pipeX, gapY, gapH);
      else if (r < 0.28) pipe = new MovingPipe(pipeX, gapY, gapH);
      else if (r < 0.42) pipe = new HorizPipe(pipeX, gapY, gapH);
      else if (r < 0.54) pipe = new NarrowEntryPipe(pipeX, gapY, gapH);
      else if (r < 0.66) pipe = new NarrowExitPipe(pipeX, gapY, gapH);
      else if (r < 0.78) pipe = new OpenPipe(pipeX, gapY, gapH);
      else if (r < 0.90) pipe = new ClosePipe(pipeX, gapY, gapH);
      else if (r < 0.96) pipe = new SeqPipe(pipeX);
      else               pipe = new BlinkPipe(pipeX, gapY, gapH);
    } else {
      if (r < 0.10)      pipe = new BasePipe(pipeX, gapY, gapH);
      else if (r < 0.22) pipe = new MovingPipe(pipeX, gapY, gapH);
      else if (r < 0.34) pipe = new HorizPipe(pipeX, gapY, gapH);
      else if (r < 0.46) pipe = new NarrowEntryPipe(pipeX, gapY, gapH);
      else if (r < 0.58) pipe = new NarrowExitPipe(pipeX, gapY, gapH);
      else if (r < 0.70) pipe = new OpenPipe(pipeX, gapY, gapH);
      else if (r < 0.82) pipe = new ClosePipe(pipeX, gapY, gapH);
      else if (r < 0.92) pipe = new SeqPipe(pipeX);
      else               pipe = new BlinkPipe(pipeX, gapY, gapH);
    }

    // No back-to-back horizontal pipes — they oscillate left/right and would collide
    const prev = this.pipes[this.pipes.length - 1];
    if (pipe instanceof HorizPipe && prev instanceof HorizPipe) {
      pipe = new BasePipe(pipeX, gapY, gapH);
    }

    // Attach a piranha plant to ~half of pipes once unlocked.
    // Skip on pipe types whose gap size morphs — the plant would slide weirdly.
    const piranhaIneligible = pipe instanceof SeqPipe
      || pipe instanceof NarrowEntryPipe
      || pipe instanceof NarrowExitPipe
      || pipe instanceof OpenPipe
      || pipe instanceof ClosePipe;
    if (score >= 15 && !piranhaIneligible && Math.random() < 0.5) {
      this.game.enemyManager.addPiranhaPlant(pipe, gapY, gapH);
    }

    this.pipes.push(pipe);
    this.spawnCount++;
  }
}

// ============================================================
// HAMMER
// ============================================================
class Hammer {
  constructor(x, y, tx, ty) {
    this.x = x;
    this.y = y;
    const dist = Math.hypot(tx - x, ty - y) || 1;
    this.vx = 200 * (tx - x) / dist;
    this.vy = -420;
    this.rot = 0;
  }

  update(dt, speed) {
    // Own ballistic motion plus world scroll so the hammer stays in world space
    this.x += this.vx * dt - speed * dt;
    this.y += this.vy * dt;
    this.vy += GRAVITY * dt;
    this.rot += 7 * dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    // Handle
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(-4, -18, 8, 36);
    // Head
    ctx.fillStyle = '#795548';
    ctx.fillRect(-14, -24, 28, 12);
    ctx.fillRect(-14, 12, 28, 12);
    ctx.restore();
  }

  getHitbox() {
    return { x: this.x - 14, y: this.y - 28, w: 28, h: 48 };
  }

  isOffScreen() {
    // Cull at ground level (hammer head sinks slightly into ground), or off-screen sides
    return this.x < -40 || this.x > CANVAS_W + 60 || this.y > CANVAS_H - 76;
  }
}

// ============================================================
// HAMMER BRO
// ============================================================
class HammerBro {
  constructor(x, y, game) {
    this.x = x;
    this.y = y;
    this.baseY = y;
    this.time = Math.random() * Math.PI * 2;
    this.throwTimer = 1 + Math.random() * 1.5;
    this.game = game;
  }

  update(dt, speed, birdX, birdY) {
    this.x -= speed * dt;
    this.time += dt;
    this.y = this.baseY;
    this.throwTimer -= dt;
    if (this.throwTimer <= 0 && this.x > -20 && this.x < CANVAS_W + 20) {
      // Hammer lives in EnemyManager so it persists after the Bro leaves
      this.game.enemyManager.hammers.push(new Hammer(this.x, this.y - 30, birdX, birdY));
      this.game.playSound('throw');
      this.throwTimer = 1.8 + Math.random() * 1.4;
    }
  }

  draw(ctx) {
    const x = this.x;
    const y = this.y;

    // Hat
    ctx.fillStyle = '#C62828';
    ctx.fillRect(x - 14, y - 42, 28, 12);
    ctx.fillRect(x - 10, y - 54, 20, 14);

    // Face
    ctx.fillStyle = '#FFCC80';
    ctx.fillRect(x - 12, y - 30, 24, 20);

    // Eyes
    ctx.fillStyle = 'white';
    ctx.fillRect(x - 8, y - 28, 6, 6);
    ctx.fillRect(x + 2, y - 28, 6, 6);
    ctx.fillStyle = '#212121';
    ctx.fillRect(x - 6, y - 26, 3, 3);
    ctx.fillRect(x + 4, y - 26, 3, 3);

    // Overalls
    ctx.fillStyle = '#1565C0';
    ctx.fillRect(x - 14, y - 10, 28, 26);

    // Shirt
    ctx.fillStyle = '#C62828';
    ctx.fillRect(x - 12, y - 10, 10, 12);
    ctx.fillRect(x + 2, y - 10, 10, 12);

    // Shoes
    ctx.fillStyle = '#212121';
    ctx.fillRect(x - 16, y + 14, 16, 8);
    ctx.fillRect(x, y + 14, 16, 8);

    // Hammers are drawn by EnemyManager so they persist after the Bro leaves
  }

  getHitboxes() {
    // Hammers are tracked by EnemyManager — only the Bro's body hitbox here
    return [{ x: this.x - 18, y: this.y - 42, w: 36, h: 62 }];
  }

  isOffScreen() {
    return this.x < -60;
  }
}

// ============================================================
// BULLET BILL
// ============================================================
class BulletBill {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }

  update(dt) {
    this.x -= 380 * dt;
  }

  draw(ctx) {
    const x = this.x;
    const y = this.y;

    // Body
    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.roundRect(x - 28, y - 14, 50, 28, 4);
    ctx.fill();

    // Left cap (semicircle)
    ctx.beginPath();
    ctx.arc(x - 28, y, 14, Math.PI / 2, Math.PI * 3 / 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x - 6, y - 5, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 6, y - 5, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.arc(x - 5, y - 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 7, y - 5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Frown
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y + 6, 8, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // Speed lines
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const ly = y - 6 + i * 6;
      ctx.beginPath();
      ctx.moveTo(x + 22, ly);
      ctx.lineTo(x + 38, ly);
      ctx.stroke();
    }
  }

  getHitbox() {
    return { x: this.x - 28, y: this.y - 14, w: 50, h: 28 };
  }

  isOffScreen() {
    return this.x < -70;
  }
}

// ============================================================
// FLYING KOOPA
// ============================================================
class FlyingKoopa {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.baseY = y;
    this.time = Math.random() * Math.PI * 2;
    this.flapTime = Math.random() * Math.PI * 2;
  }

  update(dt, speed) {
    this.x -= (speed + 60) * dt;
    this.time += dt * 2;
    this.flapTime += dt * 5;
    this.y = this.baseY + Math.sin(this.time) * 100;
  }

  draw(ctx) {
    const x = this.x;
    const y = this.y;
    const wScale = Math.abs(Math.sin(this.flapTime)) * 0.7 + 0.3;

    ctx.save();
    ctx.translate(x, y);

    // Wings
    ctx.fillStyle = '#F5F5F5';
    ctx.save();
    ctx.scale(1, wScale);
    ctx.beginPath();
    ctx.ellipse(-22, -8, 18, 12, -0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(22, -8, 18, 12, 0.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Shell
    ctx.fillStyle = '#EF5350';
    ctx.beginPath();
    ctx.ellipse(0, 2, 18, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Body
    ctx.fillStyle = '#66BB6A';
    ctx.beginPath();
    ctx.ellipse(0, -8, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(5, -10, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.arc(6, -10, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  getHitbox() {
    return { x: this.x - 16, y: this.y - 14, w: 32, h: 28 };
  }

  isOffScreen() {
    return this.x < -70;
  }
}

// ============================================================
// PIRANHA PLANT
// ============================================================
class PiranhaPlant {
  // hostPipe = the pipe this plant rides on (so plant.x follows pipe.x even for HorizPipe)
  constructor(hostPipe, attachY, direction) {
    this.hostPipe = hostPipe;
    this.x = hostPipe.x + PIPE_W / 2;
    this.attachY = attachY;
    this.direction = direction;
    this.extension = 0;
    this.state = 'waiting';   // 'waiting' -> 'emerging' -> 'extended' -> 'retracting' -> 'done'
    this.timer = 0;
  }

  update(dt, speed, birdX) {
    // Follow the host pipe in both axes (covers HorizPipe oscillation AND MovingPipe gap drift)
    this.x = this.hostPipe.x + PIPE_W / 2;
    if (this.direction === 'down') {
      this.attachY = this.hostPipe.gapY - this.hostPipe.gapH / 2;
    } else {
      this.attachY = this.hostPipe.gapY + this.hostPipe.gapH / 2;
    }

    // Distance from bird; positive = pipe still ahead of bird
    const dist = this.x - birdX;

    if (this.state === 'waiting') {
      // Bird is approaching — start emerging once within warning range
      if (dist < 360 && dist > -20) {
        this.state = 'emerging';
        this.timer = 0;
      }
    } else if (this.state === 'emerging') {
      this.timer += dt;
      // ~0.9s slow telegraph emergence — bird sees it rise before reaching the pipe
      this.extension = Math.min(1, this.timer / 0.9);
      if (this.extension >= 1) {
        this.state = 'extended';
        this.timer = 0;
      }
    } else if (this.state === 'extended') {
      // Stay out until the pipe is well past the bird, then retract
      if (dist < -90) {
        this.state = 'retracting';
        this.timer = 0;
      }
    } else if (this.state === 'retracting') {
      this.timer += dt;
      this.extension = Math.max(0, 1 - this.timer / 0.7);
      if (this.extension <= 0) {
        this.state = 'done';
      }
    }
  }

  draw(ctx) {
    // Max stem ~30 + head radius 16 = ~46px reach into a 180px gap (~26% of gap)
    const STEM_MAX = 30;
    const HEAD_R = 16;
    const stemLen = STEM_MAX * this.extension;
    ctx.save();
    ctx.translate(this.x, 0);

    // Stem
    ctx.fillStyle = '#388E3C';
    if (this.direction === 'down') {
      ctx.fillRect(-4, this.attachY, 8, stemLen);
    } else {
      ctx.fillRect(-4, this.attachY - stemLen, 8, stemLen);
    }

    // Head (only when sufficiently extended)
    if (this.extension > 0.3) {
      const headY = (this.direction === 'down')
        ? this.attachY + stemLen
        : this.attachY - stemLen;

      ctx.fillStyle = '#E53935';
      ctx.beginPath();
      ctx.arc(0, headY, HEAD_R, 0, Math.PI * 2);
      ctx.fill();

      // Spots
      ctx.fillStyle = 'white';
      const spotPos = [[-6, -6], [6, -6], [-7, 4], [7, 4]];
      for (const [sx, sy] of spotPos) {
        ctx.beginPath();
        ctx.arc(sx, headY + sy, 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Eyes
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(-5, headY - 3, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(5, headY - 3, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#212121';
      ctx.beginPath();
      ctx.arc(-4, headY - 3, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(6, headY - 3, 1.8, 0, Math.PI * 2);
      ctx.fill();

      // Mouth
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (this.direction === 'down') {
        ctx.arc(0, headY + 3, 7, 0, Math.PI);
      } else {
        ctx.arc(0, headY - 3, 7, Math.PI, Math.PI * 2);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  getHitbox() {
    if (this.extension <= 0.4) return null;
    const stemLen = 30 * this.extension;
    // Hitbox tight to the head circle (radius 16)
    if (this.direction === 'down') {
      return { x: this.x - 14, y: this.attachY + stemLen - 14, w: 28, h: 28 };
    } else {
      return { x: this.x - 14, y: this.attachY - stemLen - 14, w: 28, h: 28 };
    }
  }

  isOffScreen() {
    return this.x < -80 || this.hostPipe.isOffScreen();
  }
}

// ============================================================
// BOO
// ============================================================
class Boo {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.alpha = 0;
    this.scale = 1;
    this.time = 0;
    this.targetAlpha = 0.75;
  }

  update(dt, birdX, birdY) {
    this.time += dt;
    this.scale = 1 + Math.sin(this.time * 3) * 0.04;
    const dist = Math.hypot(birdX - this.x, birdY - this.y);
    this.targetAlpha = (dist < 130) ? 0.08 : 0.75;
    const angle = Math.atan2(birdY - this.y, birdX - this.x);
    this.x += Math.cos(angle) * 75 * dt;
    this.y += Math.sin(angle) * 75 * dt;
    this.alpha += (this.targetAlpha - this.alpha) * 5 * dt;
  }

  draw(ctx) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, this.alpha));
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale, this.scale);

    // Body (rounded rectangle shape)
    ctx.fillStyle = '#FAFAFA';
    ctx.beginPath();
    ctx.roundRect(-20, -22, 40, 38, 12);
    ctx.fill();

    // Wavy bottom edge
    ctx.fillStyle = '#FAFAFA';
    ctx.beginPath();
    ctx.arc(-14, 16, 8, 0, Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 18, 8, 0, Math.PI);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(14, 16, 8, 0, Math.PI);
    ctx.fill();

    // Eyes
    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.ellipse(-7, -6, 5, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(7, -6, 5, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    ctx.globalAlpha = 1;
  }

  getHitbox() {
    if (this.alpha > 0.4) {
      return { x: this.x - 20, y: this.y - 22, w: 40, h: 40 };
    }
    return null;
  }

  isOffScreen() {
    return this.x < -80 || this.x > CANVAS_W + 80 || this.y < -80 || this.y > CANVAS_H + 80;
  }
}

// ============================================================
// SPINY
// ============================================================
class Spiny {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.vy = 0;          // accelerates under gravity for a more natural fall
  }

  update(dt, speed) {
    this.x -= speed * dt;
    this.vy = Math.min(this.vy + GRAVITY * 0.5 * dt, 520);
    this.y += this.vy * dt;
  }

  draw(ctx) {
    const x = this.x;
    const y = this.y;

    // Body
    ctx.fillStyle = '#E53935';
    ctx.beginPath();
    ctx.arc(x, y, 16, 0, Math.PI * 2);
    ctx.fill();

    // Spikes
    ctx.fillStyle = '#B71C1C';
    for (let i = 0; i < 8; i++) {
      const angle = i * (Math.PI * 2 / 8);
      const sx = x + Math.cos(angle) * 14;
      const sy = y + Math.sin(angle) * 14;
      const ex = x + Math.cos(angle) * 24;
      const ey = y + Math.sin(angle) * 24;
      const lx = x + Math.cos(angle + 0.3) * 16;
      const ly = y + Math.sin(angle + 0.3) * 16;
      const rx = x + Math.cos(angle - 0.3) * 16;
      const ry = y + Math.sin(angle - 0.3) * 16;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(lx, ly);
      ctx.lineTo(rx, ry);
      ctx.closePath();
      ctx.fill();
    }

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x - 5, y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 5, y - 4, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.arc(x - 4, y - 4, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 6, y - 4, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  getHitbox() {
    return { x: this.x - 14, y: this.y - 14, w: 28, h: 28 };
  }

  isOffScreen() {
    // Cull when the spike-ball reaches the ground or scrolls off the left edge
    return this.y > CANVAS_H - 90 || this.x < -40;
  }
}

// ============================================================
// LAKITU
// ============================================================
class Lakitu {
  constructor(x, y, game) {
    this.x = x;
    this.y = (y === undefined) ? 80 : y;
    this.dropTimer = 1 + Math.random() * 1.5;
    this.game = game;
  }

  update(dt, speed) {
    this.x -= speed * 0.65 * dt;
    this.dropTimer -= dt;
    if (this.dropTimer <= 0 && this.x > -20 && this.x < CANVAS_W + 20) {
      // Spiny lives in EnemyManager so it persists after the Lakitu leaves
      this.game.enemyManager.spinies.push(new Spiny(this.x, this.y + 30));
      this.game.playSound('drop');
      this.dropTimer = 2.2 + Math.random() * 1.6;
    }
  }

  draw(ctx) {
    const x = this.x;
    const y = this.y;

    // Cloud (three overlapping circles)
    ctx.fillStyle = '#F5F5F5';
    ctx.beginPath();
    ctx.arc(x, y + 10, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 18, y + 16, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 18, y + 16, 16, 0, Math.PI * 2);
    ctx.fill();

    // Shadow circles
    ctx.fillStyle = '#E0E0E0';
    ctx.beginPath();
    ctx.arc(x, y + 14, 20, 0, Math.PI);
    ctx.fill();

    // Shell on back
    ctx.fillStyle = '#795548';
    ctx.beginPath();
    ctx.arc(x + 6, y - 10, 14, Math.PI, Math.PI * 2);
    ctx.fill();

    // Body (turtle green)
    ctx.fillStyle = '#388E3C';
    ctx.fillRect(x - 14, y - 18, 28, 22);

    // Face
    ctx.fillStyle = '#FFCC80';
    ctx.beginPath();
    ctx.ellipse(x, y - 8, 12, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // Eyes
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(x - 4, y - 10, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 4, y - 10, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#212121';
    ctx.beginPath();
    ctx.arc(x - 3, y - 10, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + 5, y - 10, 1.8, 0, Math.PI * 2);
    ctx.fill();

    // Spinies are drawn by EnemyManager so they persist after the Lakitu leaves
  }

  getHitboxes() {
    return [{ x: this.x - 32, y: this.y - 38, w: 64, h: 52 }];
  }

  isOffScreen() {
    return this.x < -80;
  }
}

// ============================================================
// ENEMY MANAGER
// ============================================================
class EnemyManager {
  constructor(game) {
    this.game = game;
    this.hammerBros = [];
    this.bulletBills = [];
    this.flyingKoopas = [];
    this.piranhaPlants = [];
    this.boos = [];
    this.lakitus = [];
    // Projectiles owned by EnemyManager so they outlive their throwers
    this.hammers = [];
    this.spinies = [];

    this.billTimer = 3;
    this.koopTimer = 4;
    this.brosTimer = 7;
    this.lakiTimer = 9;
    this.booTimer = 12;

    this.billCount = 0;
    this.koopCount = 0;
    this.brosCount = 0;
    this.booCount = 0;
  }

  update(dt) {
    const s = this.game.score;
    const sp = this.game.scrollSpeed;
    const bx = this.game.bird.x;
    const by = this.game.bird.y;

    // BulletBill (score >= 5)
    if (s >= 5) {
      this.billTimer -= dt;
      if (this.billTimer <= 0) {
        const spawnY = 120 + Math.random() * (CANVAS_H - 240);
        this.bulletBills.push(new BulletBill(CANVAS_W + 30, spawnY));
        this.game.playSound('bill');
        this.billTimer = 3 + Math.random() * 2.5;
      }
    }

    // FlyingKoopa (score >= 10)
    if (s >= 10) {
      this.koopTimer -= dt;
      if (this.koopTimer <= 0) {
        const spawnY = 100 + Math.random() * (CANVAS_H - 300);
        this.flyingKoopas.push(new FlyingKoopa(CANVAS_W + 30, spawnY));
        this.koopTimer = 4 + Math.random() * 2.5;
      }
    }

    // HammerBro (score >= 15) — stands on the ground, throws hammers upward
    if (s >= 15) {
      this.brosTimer -= dt;
      if (this.brosTimer <= 0) {
        // Body center y; feet (at y+22) line up with top of ground (CANVAS_H - 80)
        const groundY = CANVAS_H - 80 - 22;
        this.hammerBros.push(new HammerBro(CANVAS_W + 50, groundY, this.game));
        this.brosTimer = 7 + Math.random() * 3;
      }
    }

    // Lakitu (score >= 20)
    if (s >= 20) {
      this.lakiTimer -= dt;
      if (this.lakiTimer <= 0) {
        this.lakitus.push(new Lakitu(CANVAS_W + 60, 80, this.game));
        this.lakiTimer = 9 + Math.random() * 3;
      }
    }

    // Boo (score >= 25)
    if (s >= 25) {
      this.booTimer -= dt;
      if (this.booTimer <= 0) {
        const spawnY = 180 + Math.random() * (CANVAS_H - 380);
        this.boos.push(new Boo(CANVAS_W + 60, spawnY));
        this.booTimer = 10 + Math.random() * 4;
      }
    }

    // Update all
    for (const e of this.hammerBros) e.update(dt, sp, bx, by);
    for (const e of this.bulletBills) e.update(dt);
    for (const e of this.flyingKoopas) e.update(dt, sp);
    for (const e of this.piranhaPlants) e.update(dt, sp, bx);
    for (const e of this.boos) e.update(dt, bx, by);
    for (const e of this.lakitus) e.update(dt, sp);
    for (const h of this.hammers) h.update(dt, sp);
    for (const sp2 of this.spinies) sp2.update(dt, sp);

    // Cull
    this.hammerBros = this.hammerBros.filter(e => !e.isOffScreen());
    this.bulletBills = this.bulletBills.filter(e => !e.isOffScreen());
    this.flyingKoopas = this.flyingKoopas.filter(e => !e.isOffScreen());
    this.piranhaPlants = this.piranhaPlants.filter(e => !e.isOffScreen());
    this.boos = this.boos.filter(e => !e.isOffScreen());
    this.lakitus = this.lakitus.filter(e => !e.isOffScreen());
    this.hammers = this.hammers.filter(e => !e.isOffScreen());
    this.spinies = this.spinies.filter(e => !e.isOffScreen());
  }

  draw(ctx) {
    for (const e of this.piranhaPlants) e.draw(ctx);
    for (const e of this.lakitus) e.draw(ctx);
    for (const e of this.hammerBros) e.draw(ctx);
    for (const e of this.flyingKoopas) e.draw(ctx);
    for (const e of this.bulletBills) e.draw(ctx);
    for (const e of this.boos) e.draw(ctx);
    // Projectiles last so they're on top
    for (const h of this.hammers) h.draw(ctx);
    for (const s of this.spinies) s.draw(ctx);
  }

  getHitboxes() {
    return [
      ...this.hammerBros.flatMap(e => e.getHitboxes()),
      ...this.bulletBills.map(e => e.getHitbox()),
      ...this.flyingKoopas.map(e => e.getHitbox()),
      ...this.piranhaPlants.map(e => e.getHitbox()),
      ...this.boos.map(e => e.getHitbox()),
      ...this.lakitus.flatMap(e => e.getHitboxes()),
      ...this.hammers.map(e => e.getHitbox()),
      ...this.spinies.map(e => e.getHitbox()),
    ].filter(h => h !== null);
  }

  reset() {
    this.hammerBros = [];
    this.bulletBills = [];
    this.flyingKoopas = [];
    this.piranhaPlants = [];
    this.boos = [];
    this.lakitus = [];
    this.hammers = [];
    this.spinies = [];

    this.billTimer = 3;
    this.koopTimer = 4;
    this.brosTimer = 7;
    this.lakiTimer = 9;
    this.booTimer = 12;

    this.billCount = 0;
    this.koopCount = 0;
    this.brosCount = 0;
    this.booCount = 0;
  }

  addPiranhaPlant(hostPipe, gapY, gapH) {
    const direction = (Math.random() < 0.5) ? 'down' : 'up';
    const attachY = (direction === 'down')
      ? gapY - gapH / 2
      : gapY + gapH / 2;
    this.piranhaPlants.push(new PiranhaPlant(hostPipe, attachY, direction));
  }
}

// ============================================================
// GAME CLASS
// ============================================================
class Game {
  constructor() {
    this.canvas = document.getElementById('gameCanvas');
    this.ctx = this.canvas.getContext('2d');
    // Per-mode high scores (legacy single-key migrated into 1-life slot)
    const legacy = parseInt(localStorage.getItem('flappyWorld_hiScore')) || 0;
    this.hiScores = {
      1: parseInt(localStorage.getItem('flappyWorld_hiScore_1')) || legacy,
      3: parseInt(localStorage.getItem('flappyWorld_hiScore_3')) || 0,
    };
    const savedMode = parseInt(localStorage.getItem('flappyWorld_livesMode'));
    this.livesMode = (savedMode === 3) ? 3 : 1;
    this.audioCtx = null;
    this.newBestThisRound = false;

    // Mode-select buttons on the menu (canvas coords)
    this.modeButtons = [
      { mode: 1, x: 70,  y: 385, w: 150, h: 60, label: '1 LIFE' },
      { mode: 3, x: 260, y: 385, w: 150, h: 60, label: '3 LIVES' },
    ];
    // Guide button on the menu
    this.guideButton = { x: 140, y: 470, w: 200, h: 48, label: 'OBSTACLE GUIDE' };

    // Bind event listeners
    window.addEventListener('resize', () => this.resize());

    const eventToCanvas = (clientX, clientY) => {
      const rect = this.canvas.getBoundingClientRect();
      return {
        x: (clientX - rect.left) * (CANVAS_W / rect.width),
        y: (clientY - rect.top) * (CANVAS_H / rect.height),
      };
    };

    this.canvas.addEventListener('click', (e) => {
      e.preventDefault();
      const p = eventToCanvas(e.clientX, e.clientY);
      this.handleInput(p.x, p.y);
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        this.handleInput();
      }
      if (e.code === 'KeyP') this.togglePause();
      if (this.gameState === 'MENU') {
        if (e.code === 'Digit1' || e.code === 'Numpad1') this.setLivesMode(1);
        if (e.code === 'Digit3' || e.code === 'Numpad3') this.setLivesMode(3);
        if (e.code === 'KeyI') { this.gameState = 'INFO'; this.playSound('flap'); }
      } else if (e.code === 'KeyI' && this.gameState === 'INFO') {
        this.gameState = 'MENU';
      }
      if (e.code === 'KeyM' && this.gameState === 'GAMEOVER') {
        this.init();
      }
    });
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (e.touches && e.touches.length > 0) {
        const t = e.touches[0];
        const p = eventToCanvas(t.clientX, t.clientY);
        this.handleInput(p.x, p.y);
      } else {
        this.handleInput();
      }
    }, { passive: false });

    this.resize();
    this.init();

    this.lastTs = 0;
    this.gameLoop = this.gameLoop.bind(this);
    requestAnimationFrame(this.gameLoop);
  }

  resize() {
    const scale = Math.min(window.innerWidth / CANVAS_W, window.innerHeight / CANVAS_H);
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.canvas.style.width = (CANVAS_W * scale) + 'px';
    this.canvas.style.height = (CANVAS_H * scale) + 'px';
  }

  init() {
    this.bird = new Bird(120, 400);
    this.background = new Background();
    // EnemyManager must be created before PipeManager (spawnPipe references it)
    this.enemyManager = new EnemyManager(this);
    this.pipeManager = new PipeManager(this);
    this.particles = new ParticleSystem();
    this.score = 0;
    this.scrollSpeed = BASE_SCROLL;
    this.shakeTime = 0;
    this.blinkTimer = 0;
    this.worldText = '';
    this.worldTimer = 0;
    this.gameState = 'MENU';
    this.newBestThisRound = false;
    this.maxLives = this.livesMode;
    this.lives = this.maxLives;
    this.invincibleTime = 0;
  }

  setLivesMode(m) {
    if (m !== 1 && m !== 3) return;
    this.livesMode = m;
    this.maxLives = m;
    this.lives = m;
    localStorage.setItem('flappyWorld_livesMode', String(m));
    this.playSound('flap');
  }

  gameLoop(ts) {
    const dt = Math.min((ts - this.lastTs) / 1000, 0.05);
    this.lastTs = ts;
    if (this.gameState !== 'GAMEOVER') this.update(dt);
    this.draw(dt);
    requestAnimationFrame(this.gameLoop);
  }

  setState(s) {
    const prev = this.gameState;
    this.gameState = s;
    if (s === 'PLAYING' && (prev === 'MENU' || prev === 'GAMEOVER')) {
      this.init();
      this.gameState = 'PLAYING';
    }
  }

  handleInput(x, y) {
    switch (this.gameState) {
      case 'MENU':
        if (x !== undefined && y !== undefined) {
          // Mode buttons
          for (const b of this.modeButtons) {
            if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
              this.setLivesMode(b.mode);
              return;
            }
          }
          // Guide button
          const g = this.guideButton;
          if (x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h) {
            this.gameState = 'INFO';
            this.playSound('flap');
            return;
          }
        }
        this.setState('PLAYING');
        break;
      case 'PLAYING':
        this.bird.flap();
        this.playSound('flap');
        break;
      case 'GAMEOVER':
        this.setState('PLAYING');
        break;
      case 'INFO':
        // Any tap/click/space exits the guide back to the menu
        this.gameState = 'MENU';
        break;
      case 'PAUSED':
        break;
    }
  }

  togglePause() {
    if (this.gameState === 'PLAYING') this.gameState = 'PAUSED';
    else if (this.gameState === 'PAUSED') this.gameState = 'PLAYING';
  }

  update(dt) {
    if (this.gameState === 'PAUSED') return;

    this.blinkTimer += dt;

    // On menu / game-over / info: bird hovers, world stays still, no obstacles spawn
    if (this.gameState === 'MENU' || this.gameState === 'GAMEOVER' || this.gameState === 'INFO') {
      // On menu we move the bird up into its own zone so it doesn't sit on top of UI buttons
      const hoverPos = (this.gameState === 'MENU') ? { x: 240, y: 218 } : null;
      this.bird.idle(dt, this.blinkTimer, hoverPos);
      this.background.update(dt, BASE_SCROLL * 0.3);
      this.particles.update(dt);
      return;
    }

    this.worldTimer -= dt;
    this.invincibleTime = Math.max(0, this.invincibleTime - dt);

    this.bird.update(dt);
    this.background.update(dt, this.scrollSpeed);
    this.pipeManager.update(dt, this.scrollSpeed, this.bird.x);
    this.enemyManager.update(dt);
    this.particles.update(dt);

    // Scoring
    const scored = this.pipeManager.checkScored(this.bird.x);
    if (scored > 0) {
      this.score += scored;
      this.playSound('score');
      this.particles.addText(this.bird.x + 30, this.bird.y - 20, '+' + scored, '#FFFF00');
      if (this.score % 10 === 0) {
        this.scrollSpeed = Math.min(this.scrollSpeed + 25, MAX_SCROLL);
        this.worldText = 'World ' + (this.score / 10);
        this.worldTimer = 2.5;
      }
    }

    // Boundary check — falling off-screen is always instant death
    if (this.bird.y < -60 || this.bird.y > CANVAS_H + 60) {
      this.die();
      return;
    }

    // Collision check — respects invincibility frames
    if (this.invincibleTime <= 0 && this.checkCollisions()) {
      this.hit();
    }
  }

  hit() {
    this.lives--;
    if (this.lives <= 0) {
      this.die();
      return;
    }
    // i-frames roughly equal to one pipe spacing — long enough not to chain-hit,
    // short enough that the player can't phase through everything.
    this.invincibleTime = Math.max(0.9, (1800 - this.score * 18) / 1000);
    this.particles.addBurst(this.bird.x, this.bird.y, '#FFB300', 10);
    this.shakeTime = 0.25;
    // Slight upward bounce so the player has a moment to react
    this.bird.vy = Math.min(this.bird.vy, -300);
    this.playSound('hurt');
  }

  checkCollisions() {
    const birdHB = this.bird.getHitbox();
    for (const rect of this.pipeManager.getHitboxes()) {
      if (rectRect(birdHB, rect)) return true;
    }
    for (const rect of this.enemyManager.getHitboxes()) {
      if (rectRect(birdHB, rect)) return true;
    }
    return false;
  }

  die() {
    if (this.score > this.hiScores[this.livesMode]) {
      this.hiScores[this.livesMode] = this.score;
      localStorage.setItem('flappyWorld_hiScore_' + this.livesMode, String(this.score));
      this.newBestThisRound = true;
    }
    this.particles.addBurst(this.bird.x, this.bird.y, '#FF5722', 12);
    this.shakeTime = 0.6;
    this.playSound('death');
    this.gameState = 'GAMEOVER';
  }

  // ---- DRAW PIPELINE ----

  draw(dt) {
    const ctx = this.ctx;
    ctx.save();

    if (this.shakeTime > 0) {
      this.shakeTime -= dt || 0;
      if (!reducedMotion()) {
        const offsetX = Math.sin(this.blinkTimer * 50) * 6;
        const offsetY = Math.cos(this.blinkTimer * 50) * 6;
        ctx.translate(offsetX, offsetY);
      }
    }

    this.background.draw(ctx);
    this.pipeManager.draw(ctx);
    this.enemyManager.draw(ctx);
    this.particles.draw(ctx);
    // During i-frames, bird strobes off on alternating frames
    const strobe = this.invincibleTime > 0 && Math.floor(this.blinkTimer * 14) % 2 === 0;
    if (!strobe) this.bird.draw(ctx);

    if (this.gameState === 'PLAYING' || this.gameState === 'PAUSED') this.drawHUD(ctx);
    if (this.gameState === 'MENU') this.drawMenu(ctx);
    if (this.gameState === 'GAMEOVER') this.drawGameOver(ctx);
    if (this.gameState === 'PAUSED') this.drawPause(ctx);
    if (this.gameState === 'INFO') this.drawInfo(ctx);

    ctx.restore();
  }

  drawHUD(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    // Shadow
    ctx.font = 'bold 52px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(this.score, CANVAS_W / 2 + 2, 22);
    // Main
    ctx.fillStyle = 'white';
    ctx.fillText(this.score, CANVAS_W / 2, 20);

    if (this.worldTimer > 0) {
      ctx.font = 'bold 28px sans-serif';
      ctx.fillStyle = '#FFD600';
      ctx.textBaseline = 'top';
      ctx.fillText(this.worldText, CANVAS_W / 2, 80);
    }

    // Lives indicator (only shown in 3-life mode)
    if (this.maxLives > 1) {
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.font = 'bold 32px sans-serif';
      for (let i = 0; i < this.maxLives; i++) {
        const filled = i < this.lives;
        ctx.fillStyle = filled ? '#E53935' : 'rgba(255,255,255,0.25)';
        ctx.fillText('♥', CANVAS_W - 16 - i * 32, 22);
      }
    }
  }

  drawMenu(ctx) {
    // Soft overlay so background still shows through
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title — sized to fit canvas width with stroke
    ctx.font = 'bold 56px sans-serif';
    ctx.strokeStyle = '#FF6D00';
    ctx.lineWidth = 4;
    ctx.strokeText('FLAPPY WORLD', CANVAS_W / 2, 110);
    ctx.fillStyle = '#FFD600';
    ctx.fillText('FLAPPY WORLD', CANVAS_W / 2, 110);

    // Subtitle
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = 'white';
    ctx.fillText('Mario Obstacles Edition', CANVAS_W / 2, 158);

    // Bird preview — gets its own zone in the upper-middle
    this.bird.draw(ctx);

    // High score badge — shows the active mode's best
    ctx.font = 'bold 22px sans-serif';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(CANVAS_W / 2 - 130, 300, 260, 46);
    ctx.fillStyle = '#FFF176';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('★ ' + this.livesMode + '-LIFE BEST: ' + this.hiScores[this.livesMode] + ' ★', CANVAS_W / 2, 323);

    // Mode label
    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = '#E0E0E0';
    ctx.fillText('CHOOSE MODE', CANVAS_W / 2, 368);

    // Mode buttons
    for (const b of this.modeButtons) {
      const selected = (this.livesMode === b.mode);
      ctx.fillStyle = selected ? '#FFD600' : 'rgba(0,0,0,0.5)';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = selected ? '#FF6D00' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = selected ? 4 : 2;
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = selected ? '#212121' : 'white';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
    }

    // Guide button
    const g = this.guideButton;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(g.x, g.y, g.w, g.h);
    ctx.strokeStyle = '#90CAF9';
    ctx.lineWidth = 2;
    ctx.strokeRect(g.x, g.y, g.w, g.h);
    ctx.fillStyle = '#90CAF9';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText(g.label, g.x + g.w / 2, g.y + g.h / 2);

    // Blinking call-to-action
    if (Math.floor(this.blinkTimer * 1.6) % 2 === 0) {
      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = 'white';
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 4;
      ctx.strokeText('PRESS SPACE TO START', CANVAS_W / 2, 590);
      ctx.fillText('PRESS SPACE TO START', CANVAS_W / 2, 590);
    }

    // Controls hint
    ctx.font = '13px sans-serif';
    ctx.fillStyle = '#E0E0E0';
    ctx.fillText('SPACE / CLICK / TAP to flap   ·   P pause   ·   1 / 3 switch mode   ·   I guide', CANVAS_W / 2, 638);
  }

  drawGameOver(ctx) {
    // Overlay
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // GAME OVER
    ctx.font = 'bold 64px sans-serif';
    ctx.fillStyle = '#D32F2F';
    ctx.fillText('GAME OVER', CANVAS_W / 2, 160);

    // Score
    ctx.font = 'bold 44px sans-serif';
    ctx.fillStyle = 'white';
    ctx.fillText(this.score, CANVAS_W / 2, 240);

    // Medal
    const cx = CANVAS_W / 2;
    const cy = 340;
    const r = 44;
    let medalFill, medalLabel, labelColor;
    if (this.score < 10) {
      medalFill = '#CD7F32';
      medalLabel = 'B';
      labelColor = '#4E342E';
    } else if (this.score < 25) {
      medalFill = '#C0C0C0';
      medalLabel = 'S';
      labelColor = '#424242';
    } else if (this.score < 50) {
      medalFill = '#FFD700';
      medalLabel = 'G';
      labelColor = '#4E342E';
    } else {
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, '#FF5252');
      rg.addColorStop(0.2, '#FF9800');
      rg.addColorStop(0.4, '#FFEB3B');
      rg.addColorStop(0.6, '#4CAF50');
      rg.addColorStop(0.8, '#2196F3');
      rg.addColorStop(1, '#9C27B0');
      medalFill = rg;
      medalLabel = '★';
      labelColor = 'white';
    }

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = medalFill;
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.font = 'bold 30px sans-serif';
    ctx.fillStyle = labelColor;
    ctx.fillText(medalLabel, cx, cy);

    // Best score
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = 'white';
    ctx.fillText(this.livesMode + '-LIFE BEST: ' + this.hiScores[this.livesMode], CANVAS_W / 2, 410);

    // NEW BEST indicator
    if (this.newBestThisRound && this.score === this.hiScores[this.livesMode]) {
      ctx.font = 'bold 30px sans-serif';
      ctx.fillStyle = '#FFD600';
      ctx.shadowColor = '#FF6D00';
      ctx.shadowBlur = 12;
      ctx.fillText('★ NEW BEST! ★', CANVAS_W / 2, 455);
      ctx.shadowBlur = 0;
    }

    // Blinking restart prompt
    if (Math.floor(this.blinkTimer * 2) % 2 === 0) {
      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = 'white';
      ctx.fillText('TAP / SPACE TO PLAY AGAIN', CANVAS_W / 2, 530);
    }
    ctx.font = '16px sans-serif';
    ctx.fillStyle = '#BDBDBD';
    ctx.fillText('M for menu (change mode)', CANVAS_W / 2, 575);
  }

  drawPause(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 60px sans-serif';
    ctx.fillStyle = 'white';
    ctx.fillText('PAUSED', CANVAS_W / 2, CANVAS_H / 2 - 30);

    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#BDBDBD';
    ctx.fillText('P TO RESUME', CANVAS_W / 2, CANVAS_H / 2 + 30);
  }

  drawInfo(ctx) {
    // Solid dark background so the world doesn't distract
    ctx.fillStyle = 'rgba(20,30,55,0.92)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#FFD600';
    ctx.fillText('OBSTACLE GUIDE', CANVAS_W / 2, 48);

    // Entries: [color swatch, name, description]
    const entries = [
      ['#4CAF50',     'Pipe',            'Standard green pipe. Fly through the gap.'],
      ['#FFD600',     'Moving Pipe',     'Gap drifts up and down — time your dive.'],
      ['#FF6D00',     'Sliding Pipe',    'Whole pipe slides left and right.'],
      ['#00BCD4',     'Narrow-Entry',    'Tight gap on entry, opens wider after.'],
      ['#E91E63',     'Narrow-Exit',     'Wide on entry, pinches tight after.'],
      ['#00897B',     'Open Pipe',       'Edges spread apart — gap opens as it crosses.'],
      ['#E65100',     'Close Pipe',      'Edges close together — gap shrinks as it crosses.'],
      ['#7B1FA2',     'Sequential',      'Two stacked gaps — pick a path.'],
      ['rgba(180,180,180,0.6)', 'Blinking', 'Fades in and out. Pass during the gaps.'],
      ['#E53935',     'Piranha Plant',  'Rises from a pipe before you arrive.'],
      ['#212121',     'Bullet Bill',    'Fast horizontal missile — no escape.'],
      ['#66BB6A',     'Flying Koopa',   'Zig-zags through the air on a sine path.'],
      ['#1565C0',     'Hammer Bro',     'Bobs in place, throws arcing hammers.'],
      ['#FAFAFA',     'Lakitu',         'Rides a cloud and drops Spinies.'],
      ['#C62828',     'Spiny',          'Spiked shell that falls from Lakitu.'],
      ['#F5F5F5',     'Boo',            'Ghost that chases you — stops when close.'],
    ];

    const startY = 90;
    const rowH = 34;
    const swatchSize = 22;
    const leftPad = 24;
    const nameX = leftPad + swatchSize + 12;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < entries.length; i++) {
      const [color, name, desc] = entries[i];
      const cy = startY + i * rowH + swatchSize / 2;

      // Swatch
      ctx.fillStyle = color;
      ctx.fillRect(leftPad, cy - swatchSize / 2, swatchSize, swatchSize);
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(leftPad, cy - swatchSize / 2, swatchSize, swatchSize);

      // Name
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#FFEB3B';
      ctx.fillText(name, nameX, cy);

      // Description
      ctx.font = '14px sans-serif';
      ctx.fillStyle = '#E0E0E0';
      const nameW = ctx.measureText(name).width;
      ctx.fillText(desc, nameX + Math.max(110, nameW + 14), cy);
    }

    // Back hint
    ctx.textAlign = 'center';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#90CAF9';
    if (Math.floor(this.blinkTimer * 1.6) % 2 === 0) {
      ctx.fillText('TAP / SPACE / I to return', CANVAS_W / 2, CANVAS_H - 36);
    }
  }

  // ---- AUDIO SYSTEM ----

  playSound(type) {
    try {
      if (!this.audioCtx) {
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = this.audioCtx;
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'flap') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(440, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'score') {
        // bright, clearly-audible coin blip (two rising tones)
        osc.type = 'square';
        osc.frequency.setValueAtTime(988, ctx.currentTime);
        osc.frequency.setValueAtTime(1319, ctx.currentTime + 0.06);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.22);
        osc.start();
        osc.stop(ctx.currentTime + 0.22);
      } else if (type === 'death') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(80, ctx.currentTime + 0.65);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.65);
        osc.start();
        osc.stop(ctx.currentTime + 0.65);
      } else if (type === 'hurt') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(260, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(120, ctx.currentTime + 0.22);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
        osc.start();
        osc.stop(ctx.currentTime + 0.25);
      } else if (type === 'bill') {
        // Low menacing whoosh — Bullet Bill entering the screen
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.32, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.55);
        osc.start();
        osc.stop(ctx.currentTime + 0.55);
      } else if (type === 'throw') {
        // Quick high swoosh — Hammer Bro throwing
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(900, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + 0.12);
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.14);
        osc.start();
        osc.stop(ctx.currentTime + 0.14);
      } else if (type === 'drop') {
        // Descending tone — Lakitu dropping a Spiny
        osc.type = 'square';
        osc.frequency.setValueAtTime(360, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(110, ctx.currentTime + 0.28);
        gain.gain.setValueAtTime(0.22, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.32);
        osc.start();
        osc.stop(ctx.currentTime + 0.32);
      }
    } catch (e) {
      // Audio may fail in some environments; silently continue
    }
  }
}

// ============================================================
// BOOT
// ============================================================
const game = new Game();
