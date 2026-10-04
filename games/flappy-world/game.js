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
// ART — a cartoon Mario-world look. Scenery is painted once onto
// offscreen canvases and stamped each frame; the same pictures also
// dress the page around the canvas, so wide screens show more world
// instead of black bars.
// ============================================================
const FONT = '"Luckiest Guy", "Arial Black", Impact, sans-serif';
// key hints with each [KEY] drawn as a keycap (GameShell.drawKeys, the canvas
// twin of the page's <kbd> keycaps); plain text if the shell isn't loaded
function keyHint(ctx, str, x, y, opts) {
  if (window.GameShell && GameShell.drawKeys) GameShell.drawKeys(ctx, str, x, y, opts);
  else ctx.fillText(str.replace(/[[\]]/g, ''), x, y);
}
const INK = '#20124d';            // outline colour for text and UI
const GROUND_Y = CANVAS_H - 80;   // top of the ground strip

function offscreen(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
// Rounded-rectangle path (falls back to a plain rectangle on old browsers)
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
// Cartoon text: a thick dark outline under the fill, plus an optional drop
function outlined(ctx, text, x, y, size, fill, opts = {}) {
  const line = opts.line ?? Math.max(3, size * 0.16);
  ctx.font = size + 'px ' + FONT;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  if (opts.drop !== 0) {
    ctx.fillStyle = opts.dropColor || 'rgba(20,10,60,0.35)';
    ctx.strokeStyle = opts.dropColor || 'rgba(20,10,60,0.35)';
    ctx.lineWidth = line;
    const d = opts.drop ?? Math.max(2, size * 0.07);
    ctx.strokeText(text, x, y + d);
    ctx.fillText(text, x, y + d);
  }
  ctx.strokeStyle = opts.outline || INK;
  ctx.lineWidth = line;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
// A white card with a dark outline and a hard drop shadow
function card(ctx, x, y, w, h, fill = '#fffdf6') {
  rrect(ctx, x + 6, y + 8, w, h, 22);
  ctx.fillStyle = 'rgba(20,10,60,0.28)';
  ctx.fill();
  rrect(ctx, x, y, w, h, 22);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = INK;
  ctx.stroke();
}
// A chunky 3D button: a darker slab under the face
function button(ctx, b, face, under, text, textColor, size = 22) {
  rrect(ctx, b.x, b.y + 5, b.w, b.h, 14);
  ctx.fillStyle = under;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
  rrect(ctx, b.x, b.y, b.w, b.h, 14);
  ctx.fillStyle = face;
  ctx.fill();
  ctx.stroke();
  ctx.font = size + 'px ' + FONT;
  ctx.fillStyle = textColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, b.x + b.w / 2, b.y + b.h / 2 + 2);
}
function heart(ctx, cx, cy, s, fill) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.4, cy, cx - s * 0.9, cy - s * 1.1, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 1.1, cx + s * 1.4, cy, cx, cy + s * 0.9);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = INK;
  ctx.stroke();
}

// Shapes made of overlapping circles (clouds, bushes): outline circles
// first, then the fill on top, so only the outer edge shows a line.
function blob(g, circles, fill, edge, edgeW) {
  g.fillStyle = edge;
  for (const [x, y, r] of circles) { g.beginPath(); g.arc(x, y, r + edgeW, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = fill;
  for (const [x, y, r] of circles) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
}

const CLOUD_SHAPES = [
  [[38, 60, 24], [66, 44, 30], [100, 42, 26], [126, 58, 22], [62, 66, 22], [96, 66, 22]],
  [[34, 58, 20], [60, 48, 26], [88, 38, 28], [116, 50, 24], [138, 62, 16], [74, 66, 20], [108, 68, 18]],
  [[42, 58, 22], [72, 46, 26], [102, 54, 22], [70, 66, 20]],
];
function makeCloud(shape) {
  const c = offscreen(170, 96), g = c.getContext('2d');
  blob(g, shape, '#ffffff', 'rgba(70,120,200,0.45)', 3);
  // a soft blue shade along the underside
  g.globalCompositeOperation = 'source-atop';
  const sh = g.createLinearGradient(0, 40, 0, 92);
  sh.addColorStop(0, 'rgba(200,228,255,0)');
  sh.addColorStop(1, 'rgba(170,210,250,0.9)');
  g.fillStyle = sh;
  g.fillRect(0, 0, 170, 96);
  return c;
}

// Rolling hills, two rows, tiling across a 960px strip
function makeHills() {
  const W = 960, H = 230, c = offscreen(W, H), g = c.getContext('2d');
  const rows = [
    { top: '#cdf0b8', bot: '#9fdc86', edge: '#5fae4f', hills: [[90, 330, 160], [430, 380, 120], [770, 300, 175]] },
    { top: '#9be27c', bot: '#62c248', edge: '#2f8a2a', hills: [[250, 280, 200], [600, 240, 145], [905, 250, 180]] },
  ];
  for (const row of rows) {
    for (const [cx0, w, h] of row.hills) {
      for (const dx of [-W, 0, W]) {
        const cx = cx0 + dx;
        g.beginPath();
        g.ellipse(cx, H, w / 2, h, 0, Math.PI, Math.PI * 2);
        const grad = g.createLinearGradient(0, H - h, 0, H);
        grad.addColorStop(0, row.top);
        grad.addColorStop(1, row.bot);
        g.fillStyle = grad;
        g.fill();
        g.lineWidth = 4;
        g.strokeStyle = row.edge;
        g.stroke();
        // a highlight near the crest, and a few darker spots
        g.save();
        g.clip();
        g.fillStyle = 'rgba(255,255,255,0.28)';
        g.beginPath();
        g.ellipse(cx - w * 0.14, H - h * 0.78, w * 0.13, h * 0.09, -0.35, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(40,110,40,0.22)';
        for (const [fx, fy, fr] of [[0.18, 0.45, 0.05], [-0.12, 0.3, 0.035], [0.05, 0.62, 0.04]]) {
          g.beginPath();
          g.ellipse(cx + w * fx, H - h * fy, w * fr, w * fr * 0.7, 0, 0, Math.PI * 2);
          g.fill();
        }
        g.restore();
      }
    }
  }
  return c;
}

// A row of bushes along the ground, tiling across a 960px strip
function makeBushes() {
  const W = 960, H = 80, c = offscreen(W, H), g = c.getContext('2d');
  const bushes = [[70, 1], [300, 0.8], [520, 1.15], [760, 0.9]];
  for (const [bx0, s] of bushes) {
    for (const dx of [-W, 0, W]) {
      const bx = bx0 + dx;
      const circles = [[bx - 34 * s, H - 14, 18 * s], [bx - 10 * s, H - 24 * s, 24 * s], [bx + 18 * s, H - 20 * s, 21 * s], [bx + 40 * s, H - 12, 15 * s]];
      blob(g, circles, '#47b83a', '#1f6a1c', 3);
      g.fillStyle = 'rgba(160,240,120,0.55)';
      for (const [x, y, r] of circles) { g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.28, 0, Math.PI * 2); g.fill(); }
    }
  }
  return c;
}

// One ground tile (64 x 80): a grassy lip over two rows of bricks, staggered
function makeGroundTile() {
  const W = 64, H = 80, c = offscreen(W, H), g = c.getContext('2d');
  const top = 16;
  // bricks
  const brick = (x, y, w, h) => {
    g.fillStyle = '#d9883a'; g.fillRect(x, y, w, h);
    g.fillStyle = '#f5b56c'; g.fillRect(x, y, w, 3); g.fillRect(x, y, 3, h);
    g.fillStyle = '#a7581c'; g.fillRect(x, y + h - 3, w, 3); g.fillRect(x + w - 3, y, 3, h);
    g.strokeStyle = '#5a2e0e'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  };
  brick(0, top, 32, 32); brick(32, top, 32, 32);
  brick(-16, top + 32, 32, 32); brick(16, top + 32, 32, 32); brick(48, top + 32, 32, 32);
  // grass lip with a scalloped edge hanging over the bricks
  const grad = g.createLinearGradient(0, 0, 0, top + 6);
  grad.addColorStop(0, '#8ae866');
  grad.addColorStop(1, '#3faa2e');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, top);
  for (let x = 4; x < W; x += 8) { g.beginPath(); g.arc(x, top, 4, 0, Math.PI); g.fill(); }
  g.strokeStyle = '#1f5a14'; g.lineWidth = 2;
  g.beginPath();
  for (let x = 4; x < W; x += 8) { g.moveTo(x - 4, top); g.arc(x, top, 4, Math.PI, 0, true); }
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 2, W, 3);
  g.strokeStyle = '#1f5a14'; g.beginPath(); g.moveTo(0, 1); g.lineTo(W, 1); g.stroke();
  return c;
}

// Painted once and shared: init() makes a new Background every game.
let ART = null;
function art() {
  if (!ART) ART = {
    clouds: CLOUD_SHAPES.map(makeCloud),
    hills: makeHills(),
    bushes: makeBushes(),
    ground: makeGroundTile(),
  };
  return ART;
}
// Dress the page around the canvas with the same scenery, sized so it
// lines up with the canvas when the canvas fills the window's height.
function dressPage() {
  const a = art();
  const strip = offscreen(960, 280), g = strip.getContext('2d');
  [[40, 40, 190], [300, 120, 150], [560, 30, 210], [800, 140, 160]].forEach(([x, y, w], i) =>
    g.drawImage(a.clouds[i % a.clouds.length], x, y, w, w * 96 / 170));
  const vh = n => (n / CANVAS_H * 100).toFixed(2) + 'vh';
  document.body.style.background = [
    `url(${a.ground.toDataURL()}) 0 100% / auto ${vh(80)} repeat-x`,
    `url(${a.bushes.toDataURL()}) 0 calc(100% - ${vh(80)}) / auto ${vh(80)} repeat-x`,
    `url(${a.hills.toDataURL()}) 0 calc(100% - ${vh(80)}) / auto ${vh(230)} repeat-x`,
    `url(${strip.toDataURL()}) 0 3vh / auto ${vh(280)} repeat-x`,
    'linear-gradient(180deg, #3f9df5 0%, #8fd0ff 55%, #d4f1ff 80%, #e9f9ff 100%)',
  ].join(', ');
}

// Warp pipes: a rounded, lit tube with a dark outline
const PIPE_GREEN = { dark: '#1d4f19', shade: '#2e8a28', base: '#47b83a', light: '#8fe36a', hi: '#d2f9b6' };
const PIPE_PURPLE = { dark: '#35105a', shade: '#6a1f9a', base: '#9040c8', light: '#c790ea', hi: '#f0dcfb' };
function pipeFill(ctx, x, w, pal) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, pal.shade);
  g.addColorStop(0.16, pal.light);
  g.addColorStop(0.28, pal.hi);
  g.addColorStop(0.42, pal.base);
  g.addColorStop(0.82, pal.shade);
  g.addColorStop(1, pal.dark);
  return g;
}
function pipeBody(ctx, x, y, w, h, pal) {
  if (h <= 0) return;
  ctx.fillStyle = pipeFill(ctx, x, w, pal);
  ctx.fillRect(x, y, w, h);
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.dark;
  ctx.strokeRect(x, y, w, h);
}
// bodyBelow: the tube continues below the cap (so the lip's shadow falls there)
function pipeCap(ctx, x, y, w, h, pal, bodyBelow) {
  // the lip's shadow on the tube
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + 4, bodyBelow ? y + h : y - 6, w - 8, 6);
  rrect(ctx, x, y, w, h, 4);
  ctx.fillStyle = pipeFill(ctx, x, w, pal);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = pal.dark;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + 3, y + 3, w - 6, 3);
}

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
    const OUT = '#0b2f6b';
    ctx.lineJoin = 'round';

    // Tail feathers
    ctx.beginPath();
    ctx.moveTo(-14, -3);
    ctx.lineTo(-25, -9);
    ctx.lineTo(-22, 0);
    ctx.lineTo(-25, 7);
    ctx.lineTo(-14, 4);
    ctx.closePath();
    ctx.fillStyle = '#1f5fc4';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUT;
    ctx.stroke();

    // Body: a lit blue ball with a pale belly
    const body = ctx.createRadialGradient(-5, -7, 2, 0, 0, 19);
    body.addColorStop(0, '#8cc9ff');
    body.addColorStop(0.55, '#3a86ec');
    body.addColorStop(1, '#1d56c2');
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
    ctx.fillStyle = body;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.beginPath();
    ctx.ellipse(4, 8, 11, 7, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#d6ecff';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 14, 0, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = OUT;
    ctx.stroke();

    // Wing, flapping
    const wingY = Math.sin(this.flapTime * 15) * 8;
    ctx.beginPath();
    ctx.ellipse(-7, 2 + wingY * 0.7, 10, 6.5, -0.35, 0, Math.PI * 2);
    ctx.fillStyle = '#a8d8ff';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eye, with a shine
    ctx.beginPath();
    ctx.arc(8, -5, 7, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(10, -4, 3.3, 0, Math.PI * 2);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(11, -5.3, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();

    // Cheek
    ctx.beginPath();
    ctx.ellipse(5, 4, 3.2, 2, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,120,160,0.55)';
    ctx.fill();

    // Beak, in two parts
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#7a3d00';
    ctx.beginPath();
    ctx.moveTo(15, -1); ctx.lineTo(25, 2.5); ctx.lineTo(15, 4.5); ctx.closePath();
    ctx.fillStyle = '#ffb81c';
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(15, 4.5); ctx.lineTo(22, 6); ctx.lineTo(15, 8.5); ctx.closePath();
    ctx.fillStyle = '#ff8a00';
    ctx.fill(); ctx.stroke();

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
    this.hillScroll = 0;         // hills and bushes drift slower, for depth
    this.bushScroll = 0;

    for (let i = 0; i < 7; i++) {
      this.clouds1.push({
        x: Math.random() * CANVAS_W,
        y: 30 + Math.random() * 200,
        w: 70 + Math.random() * 40,
        speedMult: 0.3,
        v: i % CLOUD_SHAPES.length,
      });
    }

    for (let i = 0; i < 4; i++) {
      this.clouds2.push({
        x: Math.random() * CANVAS_W,
        y: 40 + Math.random() * 220,
        w: 120 + Math.random() * 50,
        speedMult: 0.5,
        v: (i + 1) % CLOUD_SHAPES.length,
      });
    }
  }

  update(dt, speed) {
    for (const c of this.clouds1.concat(this.clouds2)) {
      c.x -= c.speedMult * speed * dt;
      if (c.x < -c.w) c.x = CANVAS_W + c.w;
    }
    // Ground scrolls at full world speed; wrap modulo its tile width (64 px)
    this.groundScroll = (this.groundScroll + speed * dt) % 64;
    this.hillScroll = (this.hillScroll + speed * dt * 0.15) % 960;
    this.bushScroll = (this.bushScroll + speed * dt * 0.45) % 960;
  }

  // Everything behind the pipes: sky, sun, clouds, hills, bushes
  drawSky(ctx) {
    const a = art();
    if (!this.sky) {
      this.sky = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
      this.sky.addColorStop(0, '#3f9df5');
      this.sky.addColorStop(0.55, '#8fd0ff');
      this.sky.addColorStop(0.8, '#d4f1ff');
      this.sky.addColorStop(1, '#e9f9ff');
      this.sun = ctx.createRadialGradient(392, 118, 0, 392, 118, 95);
      this.sun.addColorStop(0, '#fffbe0');
      this.sun.addColorStop(0.28, '#fff3b0');
      this.sun.addColorStop(0.3, 'rgba(255,240,170,0.45)');
      this.sun.addColorStop(1, 'rgba(255,240,170,0)');
    }
    ctx.fillStyle = this.sky;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = this.sun;
    ctx.fillRect(290, 16, 204, 204);

    const cloud = (c) => ctx.drawImage(a.clouds[c.v], c.x - c.w / 2, c.y - c.w * 0.28, c.w, c.w * 96 / 170);
    ctx.globalAlpha = 0.85;
    this.clouds1.forEach(cloud);
    ctx.globalAlpha = 1;
    this.clouds2.forEach(cloud);

    this.strip(ctx, a.hills, this.hillScroll, GROUND_Y - a.hills.height);
    this.strip(ctx, a.bushes, this.bushScroll, GROUND_Y - a.bushes.height);
  }

  // Repeat a tiling picture across the canvas; whole-pixel steps so the
  // seams between copies never show
  strip(ctx, img, off, y) {
    for (let x = Math.round(-off); x < CANVAS_W; x += img.width) ctx.drawImage(img, x, y);
  }

  // The brick ground, drawn in front of the pipes so they rise out of it
  drawGround(ctx) {
    this.strip(ctx, art().ground, this.groundScroll, GROUND_Y);
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
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      outlined(ctx, this.text, this.x, this.y, 24, this.color, { drop: 0, line: 5 });
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

    // Tubes (the top one starts just above the canvas so its outline doesn't show)
    pipeBody(ctx, this.x, -4, PIPE_W, topH + 4, PIPE_GREEN);
    pipeBody(ctx, this.x, botY, PIPE_W, CANVAS_H + 200 - botY, PIPE_GREEN);

    // Caps facing the gap
    pipeCap(ctx, this.x - 4, topH - 20, PIPE_W + 8, 20, PIPE_GREEN, false);
    pipeCap(ctx, this.x - 4, botY, PIPE_W + 8, 20, PIPE_GREEN, true);
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
    // Three solid sections
    pipeBody(ctx, this.x, -4, PIPE_W, 174, PIPE_PURPLE);
    pipeBody(ctx, this.x, 320, PIPE_W, 180, PIPE_PURPLE);
    pipeBody(ctx, this.x, 650, PIPE_W, CANVAS_H + 200 - 650, PIPE_PURPLE);

    // Caps facing each gap
    pipeCap(ctx, this.x - 4, 150, PIPE_W + 8, 20, PIPE_PURPLE, false);   // bottom of the top section
    pipeCap(ctx, this.x - 4, 300, PIPE_W + 8, 20, PIPE_PURPLE, true);    // top of the middle section
    pipeCap(ctx, this.x - 4, 480, PIPE_W + 8, 20, PIPE_PURPLE, false);   // bottom of the middle section
    pipeCap(ctx, this.x - 4, 630, PIPE_W + 8, 20, PIPE_PURPLE, true);    // top of the bottom section

    // x2 labels in gaps
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    outlined(ctx, 'x2', this.x + PIPE_W / 2, 245, 26, '#f0dcfb', { drop: 0, line: 5 });
    outlined(ctx, 'x2', this.x + PIPE_W / 2, 575, 26, '#f0dcfb', { drop: 0, line: 5 });
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
      // Visual FX off: a steady half-faded pipe (+ the "!") instead of a ~20Hz flicker
      const flicker = reducedMotion() ? 0.5 : Math.abs(Math.sin(this.cycleTime * 20 * Math.PI));
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

// ---- enemy drawing: outlined, shaded cartoon shapes to match the world ----
const EOUT = '#1d1633';           // the enemies' outline colour
function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}
// Fill the current path, then outline it (line 0 = no outline)
function paint(ctx, fill, line = 2.2) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (line) {
    ctx.lineWidth = line;
    ctx.strokeStyle = EOUT;
    ctx.stroke();
  }
}
// A ball lit from the upper left
function lit(ctx, x, y, r, light, dark) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, light);
  g.addColorStop(1, dark);
  return g;
}
// A cartoon eye: white, a pupil looking along (lx, ly), a shine
function eye(ctx, x, y, rx, ry, lx = -1, ly = 0) {
  ell(ctx, x, y, rx, ry);
  paint(ctx, '#ffffff', 1.8);
  const px = x + lx * rx * 0.35, py = y + ly * ry * 0.3;
  ell(ctx, px, py, rx * 0.52, ry * 0.62);
  paint(ctx, '#111111', 0);
  ell(ctx, px + rx * 0.18, py - ry * 0.25, rx * 0.2, ry * 0.2);
  paint(ctx, '#ffffff', 0);
}
function steel(ctx, y0, y1) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, '#f2f5f8');
  g.addColorStop(1, '#8a949e');
  return g;
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
    ctx.lineJoin = 'round';
    // Wooden handle with a grip
    rrect(ctx, -3.5, -14, 7, 34, 3);
    paint(ctx, '#c08445', 2);
    ctx.fillStyle = '#7a4a1e';
    ctx.fillRect(-3, 10, 6, 3);
    ctx.fillRect(-3, 15, 6, 3);
    // Steel head with a shine
    rrect(ctx, -14, -26, 28, 14, 4);
    paint(ctx, steel(ctx, -26, -12), 2.4);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-11, -23, 14, 2.5);
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
    // A helmeted Koopa with a green shell, facing the bird, swinging a hammer.
    // (The hammers it throws are drawn by EnemyManager so they outlive it.)
    const x = this.x;
    const y = this.y;
    ctx.save();
    ctx.lineJoin = 'round';

    // Shell on the back, with a pale rim
    ell(ctx, x + 9, y - 2, 13, 16);
    paint(ctx, lit(ctx, x + 9, y - 2, 16, '#8ae866', '#2f8a2a'));
    ell(ctx, x + 9, y - 2, 10.5, 13.5);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#fff4d8';
    ctx.stroke();

    // Feet
    ell(ctx, x - 8, y + 18, 9, 5);
    paint(ctx, '#e8732a');
    ell(ctx, x + 7, y + 18, 9, 5);
    paint(ctx, '#e8732a');

    // Body with a pale, ridged belly plate
    ell(ctx, x - 2, y + 2, 12, 15);
    paint(ctx, '#f5d24a');
    ell(ctx, x - 5, y + 4, 7, 11);
    paint(ctx, '#fff4c8', 1.5);
    ctx.strokeStyle = 'rgba(160,120,40,0.5)';
    ctx.lineWidth = 1.2;
    for (const ly of [y, y + 5, y + 10]) {
      ctx.beginPath();
      ctx.moveTo(x - 10, ly);
      ctx.lineTo(x, ly);
      ctx.stroke();
    }

    // Raised arm with a hammer (drawn after the head, see below)
    const arm = () => {
      ctx.save();
      ctx.translate(x + 7, y - 10);
      ctx.rotate(0.45 + Math.sin(this.time * 6) * 0.3);
      rrect(ctx, -2.5, -18, 5, 18, 2.5);
      paint(ctx, '#f5d24a', 1.8);
      rrect(ctx, -1.8, -30, 3.6, 14, 1.5);
      paint(ctx, '#c08445', 1.5);
      rrect(ctx, -7, -36, 14, 8, 2.5);
      paint(ctx, steel(ctx, -36, -28), 1.8);
      ctx.restore();
    };

    // Head, snout forward
    ell(ctx, x - 3, y - 26, 12, 12);
    paint(ctx, lit(ctx, x - 3, y - 26, 12, '#fff0a0', '#e9b92c'));
    ell(ctx, x - 13, y - 22, 7, 5.5);
    paint(ctx, '#f5d24a');
    eye(ctx, x - 7, y - 29, 3.8, 5, -1, 0.2);

    // Helmet: a grey-white dome with a rim
    ctx.beginPath();
    ctx.ellipse(x - 2, y - 33, 13, 12, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    paint(ctx, lit(ctx, x - 6, y - 40, 14, '#ffffff', '#b8c2cc'));
    ell(ctx, x - 2, y - 33, 14, 3);
    paint(ctx, '#9aa5b0', 1.8);

    // the hammer arm, raised up and back behind the helmet
    arm();
    ctx.restore();
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
    ctx.save();
    ctx.lineJoin = 'round';

    // Speed lines
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ly = y - 7 + i * 7;
      ctx.beginPath();
      ctx.moveTo(x + 28, ly);
      ctx.lineTo(x + 44 - i * 3, ly);
      ctx.stroke();
    }

    // Rear rim
    rrect(ctx, x + 12, y - 15, 10, 30, 3);
    const rim = ctx.createLinearGradient(0, y - 15, 0, y + 15);
    rim.addColorStop(0, '#d3d9de');
    rim.addColorStop(1, '#6c747c');
    paint(ctx, rim, 2.4);

    // Body: a glossy black bullet, round nose forward
    ctx.beginPath();
    ctx.moveTo(x + 13, y - 14);
    ctx.lineTo(x - 14, y - 14);
    ctx.arc(x - 14, y, 14, -Math.PI / 2, Math.PI / 2, true);
    ctx.lineTo(x + 13, y + 14);
    ctx.closePath();
    const body = ctx.createLinearGradient(0, y - 14, 0, y + 14);
    body.addColorStop(0, '#5f6570');
    body.addColorStop(0.35, '#2a2e35');
    body.addColorStop(1, '#0e0f12');
    paint(ctx, body, 2.4);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - 12, y - 9);
    ctx.lineTo(x + 8, y - 9);
    ctx.stroke();

    // An angry eye looking ahead, and a little white glove
    ell(ctx, x - 12, y - 3, 5.5, 6.5);
    paint(ctx, '#ffffff', 1.6);
    ell(ctx, x - 14, y - 2, 2.6, 3.4);
    paint(ctx, '#111111', 0);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(x - 19, y - 12);
    ctx.lineTo(x - 7, y - 8);
    ctx.stroke();
    ell(ctx, x - 1, y + 9, 5, 4);
    paint(ctx, '#ffffff', 1.6);
    ctx.restore();
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
    // A green-shelled paratroopa, facing the bird, wings flapping
    const x = this.x;
    const y = this.y;
    const wScale = Math.abs(Math.sin(this.flapTime)) * 0.7 + 0.3;

    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';

    // Wing on the shell
    ctx.save();
    ctx.translate(7, -8);
    ctx.scale(1, wScale);
    ell(ctx, 0, -8, 11, 9, -0.5);
    paint(ctx, '#ffffff', 2);
    ell(ctx, 9, -5, 8, 6, -0.2);
    paint(ctx, '#ffffff', 2);
    ctx.strokeStyle = 'rgba(29,22,51,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-4, -8);
    ctx.lineTo(4, -2);
    ctx.moveTo(1, -12);
    ctx.lineTo(8, -4);
    ctx.stroke();
    ctx.restore();

    // Feet
    ell(ctx, -4, 13, 5, 3.5);
    paint(ctx, '#e8732a', 1.8);
    ell(ctx, 8, 13, 5, 3.5);
    paint(ctx, '#e8732a', 1.8);

    // Shell with a pale rim and a scute
    ell(ctx, 4, 2, 15, 12);
    paint(ctx, lit(ctx, 4, 2, 15, '#8ae866', '#2f8a2a'));
    ell(ctx, 4, 10, 14, 3.5);
    paint(ctx, '#fff4d8', 1.8);
    ell(ctx, 5, -1, 6, 4.5);
    paint(ctx, 'rgba(210,255,180,0.55)', 0);

    // Head out front
    ell(ctx, -11, -6, 8.5, 8);
    paint(ctx, lit(ctx, -11, -6, 8, '#fff0a0', '#e9b92c'));
    ell(ctx, -18, -3, 3.8, 2.8);
    paint(ctx, '#f5d24a', 1.6);
    eye(ctx, -13, -8, 3.2, 4.2, -1, 0.1);

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
    ctx.translate(this.x, this.attachY);
    // Drawn growing upward; one hanging from a top pipe is the same, flipped
    if (this.direction === 'down') ctx.scale(1, -1);
    ctx.lineJoin = 'round';

    // Stem
    if (stemLen > 0) {
      rrect(ctx, -4, -stemLen, 8, stemLen + 2, 3);
      paint(ctx, '#3faa2e', 2);
    }
    // Two leaves at the base, unfolding as it rises
    if (this.extension > 0.5) {
      const k = (this.extension - 0.5) * 2;
      ell(ctx, -9 * k, -6, 9 * k, 4 * k, 0.5);
      paint(ctx, '#5cc84a', 1.8);
      ell(ctx, 9 * k, -6, 9 * k, 4 * k, -0.5);
      paint(ctx, '#5cc84a', 1.8);
    }

    // Head (only when sufficiently extended): a spotted red ball whose
    // mouth, lined with white lips and teeth, chomps open and shut
    if (this.extension > 0.3) {
      ctx.save();
      ctx.translate(0, -stemLen);
      ell(ctx, 0, 0, HEAD_R, HEAD_R);
      paint(ctx, lit(ctx, 0, 0, HEAD_R, '#ff7a6e', '#c62828'), 2.4);
      ctx.fillStyle = '#ffffff';
      for (const [sx, sy, sr] of [[-9, 4, 3], [9, 4, 3], [-5, 11, 2.4], [5, 11, 2.4]]) {
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
      }
      const open = 0.35 + 0.4 * (0.5 + 0.5 * Math.sin(performance.now() / 110));
      const a0 = -Math.PI / 2 - open, a1 = -Math.PI / 2 + open;
      ctx.beginPath();
      ctx.moveTo(0, 1);
      ctx.arc(0, 1, HEAD_R - 1, a0, a1);
      ctx.closePath();
      paint(ctx, '#5a0b0b', 0);
      // lips along both edges of the mouth, with a tooth on each
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      for (const a of [a0, a1]) {
        const ex = Math.cos(a) * (HEAD_R - 1), ey = 1 + Math.sin(a) * (HEAD_R - 1);
        ctx.beginPath();
        ctx.moveTo(0, 1);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        const tx = ex * 0.55, ty = 1 + (ey - 1) * 0.55, inward = a === a0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(tx - 2, ty);
        ctx.lineTo(tx + 2, ty);
        ctx.lineTo(tx + inward * 4, ty - 4);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      ctx.restore();
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
    ctx.lineJoin = 'round';

    // A little tail, then the round body over it
    ctx.beginPath();
    ctx.moveTo(12, 6);
    ctx.quadraticCurveTo(28, 8, 25, 21);
    ctx.quadraticCurveTo(18, 14, 6, 14);
    ctx.closePath();
    paint(ctx, '#e3e9f2', 2.2);
    ell(ctx, 0, -3, 20, 20);
    paint(ctx, lit(ctx, 0, -3, 22, '#ffffff', '#d4dce8'), 2.4);

    // Stubby arms
    ell(ctx, -18, 5, 6, 4, -0.5);
    paint(ctx, '#ffffff', 2);
    ell(ctx, 16, 3, 5, 3.5, 0.5);
    paint(ctx, '#ffffff', 2);

    // Tall eyes with a shine
    for (const ex of [-7, 5]) {
      ell(ctx, ex, -9, 3.5, 6);
      paint(ctx, '#111111', 0);
      ell(ctx, ex + 1.2, -12, 1.2, 1.8);
      paint(ctx, '#ffffff', 0);
    }
    // Blush
    ctx.fillStyle = 'rgba(255,120,160,0.45)';
    ell(ctx, -13, 0, 3.2, 2);
    ctx.fill();
    ell(ctx, 11, 0, 3.2, 2);
    ctx.fill();

    // An open mouth with a tongue and two fangs
    ctx.beginPath();
    ctx.moveTo(-10, 2);
    ctx.quadraticCurveTo(-1, 17, 8, 2);
    ctx.closePath();
    paint(ctx, '#7a1020', 2);
    ell(ctx, -1, 9, 4, 3);
    paint(ctx, '#ff7a9a', 0);
    ctx.fillStyle = '#ffffff';
    for (const fx of [-6, 3]) {
      ctx.beginPath();
      ctx.moveTo(fx - 2, 2.5);
      ctx.lineTo(fx, 7);
      ctx.lineTo(fx + 2, 2.5);
      ctx.closePath();
      ctx.fill();
    }

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
    ctx.save();
    ctx.lineJoin = 'round';

    // Cream spikes all round
    for (let i = 0; i < 8; i++) {
      const a = i * (Math.PI / 4) + Math.PI / 8;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * 25, y + Math.sin(a) * 25);
      ctx.lineTo(x + Math.cos(a + 0.34) * 14, y + Math.sin(a + 0.34) * 14);
      ctx.lineTo(x + Math.cos(a - 0.34) * 14, y + Math.sin(a - 0.34) * 14);
      ctx.closePath();
      paint(ctx, '#fff1d0', 2);
    }

    // Red shell
    ell(ctx, x, y, 16, 16);
    paint(ctx, lit(ctx, x, y, 16, '#ff8a7a', '#c62828'), 2.4);

    // Angry eyes
    eye(ctx, x - 5, y - 1, 3.4, 4.2, 0, 0.3);
    eye(ctx, x + 5, y - 1, 3.4, 4.2, 0, 0.3);
    ctx.strokeStyle = EOUT;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 9, y - 8);
    ctx.lineTo(x - 2, y - 5);
    ctx.moveTo(x + 9, y - 8);
    ctx.lineTo(x + 2, y - 5);
    ctx.stroke();
    ctx.restore();
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
    // Lakitu in his glasses, riding a smiling cloud.
    // (The Spinies he drops are drawn by EnemyManager so they outlive him.)
    const x = this.x;
    const y = this.y;
    ctx.save();
    ctx.lineJoin = 'round';

    // Green shell on his back
    ctx.beginPath();
    ctx.ellipse(x + 5, y - 12, 15, 14, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    paint(ctx, lit(ctx, x + 5, y - 18, 15, '#8ae866', '#2f8a2a'));

    // Head, snout forward
    ell(ctx, x - 2, y - 22, 11, 11);
    paint(ctx, lit(ctx, x - 2, y - 22, 11, '#fff0a0', '#e9b92c'));
    ell(ctx, x - 12, y - 18, 5.5, 4.5);
    paint(ctx, '#f5d24a', 1.8);

    // Round glasses
    for (const gx of [x - 8, x + 1]) {
      ell(ctx, gx, y - 25, 4.6, 4.6);
      paint(ctx, 'rgba(255,255,255,0.95)', 1.8);
      ell(ctx, gx - 1.2, y - 24.6, 1.8, 2.2);
      paint(ctx, '#111111', 0);
    }

    // The cloud he rides, in front of his lower half, with a face
    blob(ctx, [[x, y + 6, 18], [x - 19, y + 10, 13], [x + 19, y + 10, 13]], '#ffffff', 'rgba(70,120,200,0.6)', 2.5);
    ctx.fillStyle = '#1d1633';
    ell(ctx, x - 6, y + 6, 1.8, 2.6);
    ctx.fill();
    ell(ctx, x + 6, y + 6, 1.8, 2.6);
    ctx.fill();
    ctx.strokeStyle = '#1d1633';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y + 9, 5, 0.2, Math.PI - 0.2);
    ctx.stroke();
    ctx.restore();
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
    // The canvas only uses the cartoon font once it's loaded, so ask for it now
    if (document.fonts && document.fonts.load) document.fonts.load('40px "Luckiest Guy"');
    dressPage();
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
      if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (e.repeat) return; // one flap per physical press — no hold-to-hover
        this.handleInput();
      }
      if (e.repeat) return;
      // P or Esc pauses, as in the site's other games. Esc is claimed only when
      // it pauses or resumes, or closes the guide; on the menu and the game-over
      // card it's left unclaimed, so it leaves for the games page
      if (e.code === 'Escape' && (this.gameState === 'PLAYING' || this.gameState === 'PAUSED' || this.gameState === 'INFO')) e.preventDefault();
      if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
      if (this.gameState === 'MENU') {
        if (e.code === 'Digit1' || e.code === 'Numpad1') this.setLivesMode(1);
        if (e.code === 'Digit3' || e.code === 'Numpad3') this.setLivesMode(3);
        if (e.code === 'KeyI') { this.gameState = 'INFO'; this.playSound('flap'); }
      } else if ((e.code === 'KeyI' || e.code === 'Escape') && this.gameState === 'INFO') {
        this.gameState = 'MENU';
      }
      // M or Backspace: from the game-over card back to the menu
      if ((e.code === 'KeyM' || e.code === 'Backspace') && this.gameState === 'GAMEOVER') {
        if (e.code === 'Backspace') e.preventDefault();
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
      // On the menu the bird hovers in its own spot, between the title and the card
      const hoverPos = (this.gameState === 'MENU') ? { x: 240, y: 256 } : null;
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

    this.background.drawSky(ctx);
    this.pipeManager.draw(ctx);
    this.background.drawGround(ctx);
    this.enemyManager.draw(ctx);
    this.particles.draw(ctx);
    // During i-frames the bird strobes off on alternating frames; with Visual FX
    // off it's drawn steadily at half opacity instead (same cue, no strobe)
    if (this.invincibleTime > 0 && reducedMotion()) {
      ctx.globalAlpha = 0.5; this.bird.draw(ctx); ctx.globalAlpha = 1;
    } else {
      const strobe = this.invincibleTime > 0 && Math.floor(this.blinkTimer * 14) % 2 === 0;
      if (!strobe) this.bird.draw(ctx);
    }

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
    outlined(ctx, String(this.score), CANVAS_W / 2, 20, 60, '#ffffff', { line: 10 });

    if (this.worldTimer > 0) {
      outlined(ctx, this.worldText.toUpperCase(), CANVAS_W / 2, 92, 32, '#ffd23f', { line: 7 });
    }

    // Lives indicator (only shown in 3-life mode)
    if (this.maxLives > 1) {
      for (let i = 0; i < this.maxLives; i++) {
        heart(ctx, CANVAS_W - 30 - i * 34, 38, 12, i < this.lives ? '#ff4a5a' : 'rgba(255,255,255,0.5)');
      }
    }
  }

  // A word with every letter its own colour, like the Mario logo; letters bob
  // gently unless Visual FX is off
  drawTitleWord(ctx, word, y, size, shift) {
    const COLORS = ['#ffd23f', '#ff5a4a', '#4fb3ff', '#6fdc4c'];
    ctx.font = size + 'px ' + FONT;
    const letters = [...word];
    const widths = letters.map(ch => ctx.measureText(ch).width);
    const gap = 2;
    let x = CANVAS_W / 2 - (widths.reduce((s, w) => s + w, 0) + gap * (letters.length - 1)) / 2;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    letters.forEach((ch, i) => {
      const bob = reducedMotion() ? 0 : Math.sin(this.blinkTimer * 3 + i * 0.6) * 3;
      outlined(ctx, ch, x, y + bob, size, COLORS[(i + shift) % COLORS.length], { line: 9, drop: 5 });
      x += widths[i] + gap;
    });
    ctx.textAlign = 'center';
  }

  drawMenu(ctx) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    this.drawTitleWord(ctx, 'FLAPPY', 92, 70, 0);
    this.drawTitleWord(ctx, 'WORLD', 160, 70, 2);

    // Subtitle on a red ribbon
    rrect(ctx, 110, 198, 260, 34, 10);
    ctx.fillStyle = '#e8413a';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.font = '17px ' + FONT;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('MARIO OBSTACLES EDITION', CANVAS_W / 2, 217);

    // The bird hovers between the title and the card (see update)

    card(ctx, 50, 288, 380, 250);

    // High score badge — shows the active mode's best
    rrect(ctx, 95, 303, 290, 40, 20);
    ctx.fillStyle = '#fff3c4';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.font = '20px ' + FONT;
    ctx.fillStyle = '#7a5200';
    ctx.fillText('★ ' + this.livesMode + '-LIFE BEST: ' + this.hiScores[this.livesMode] + ' ★', CANVAS_W / 2, 325);

    ctx.font = '15px ' + FONT;
    ctx.fillStyle = '#6a6f86';
    ctx.fillText('CHOOSE MODE', CANVAS_W / 2, 368);

    // Mode buttons
    for (const b of this.modeButtons) {
      const selected = (this.livesMode === b.mode);
      button(ctx, b, selected ? '#ffd23f' : '#ffffff', selected ? '#d99a00' : '#b9c3d8', b.label, INK, 24);
    }

    // Guide button
    button(ctx, this.guideButton, '#dff0ff', '#8fb8e8', this.guideButton.label, '#1c5fb8', 18);

    // Blinking call-to-action
    if (reducedMotion() || Math.floor(this.blinkTimer * 1.6) % 2 === 0) {   // steady with Visual FX off
      // outlined() with a keycap: the same drop shadow, then the INK-outlined text
      const cta = 'TAP / [SPACE] TO START';
      ctx.font = '30px ' + FONT;
      ctx.fillStyle = 'rgba(20,10,60,0.35)';
      keyHint(ctx, cta, CANVAS_W / 2, 592, { outline: { width: 7, color: 'rgba(20,10,60,0.35)' } });
      ctx.fillStyle = '#ffffff';
      keyHint(ctx, cta, CANVAS_W / 2, 590, { outline: { width: 7, color: INK } });
    }

    // Controls hint
    ctx.font = '13px ' + FONT;   // (Luckiest Guy has one weight: no faux bold)
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.fillStyle = INK;
    // two lines: with keycaps the controls no longer fit across the canvas
    const hintOutline = { outline: { width: 4, color: 'rgba(255,255,255,0.9)' } };
    keyHint(ctx, '[SPACE] / CLICK / TAP to flap   ·   [P] / [Esc] pause', CANVAS_W / 2, 634, hintOutline);
    keyHint(ctx, '[1] / [3] switch mode   ·   [I] guide', CANVAS_W / 2, 658, hintOutline);
  }

  drawGameOver(ctx) {
    ctx.fillStyle = 'rgba(20,20,70,0.28)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    card(ctx, 50, 110, 380, 470);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    outlined(ctx, 'GAME OVER', CANVAS_W / 2, 165, 54, '#ff4a3d', { line: 9, drop: 5 });

    ctx.font = '16px ' + FONT;
    ctx.fillStyle = '#6a6f86';
    ctx.fillText('SCORE', CANVAS_W / 2, 212);
    outlined(ctx, String(this.score), CANVAS_W / 2, 250, 50, '#ffffff', { line: 9 });

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

    // a white rim, the medal face, a shine
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = medalFill;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx - r * 0.32, cy - r * 0.36, r * 0.28, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fill();

    ctx.font = '34px ' + FONT;
    ctx.fillStyle = labelColor;
    ctx.fillText(medalLabel, cx, cy + 2);

    // Best score
    ctx.font = '24px ' + FONT;
    ctx.fillStyle = INK;
    ctx.fillText(this.livesMode + '-LIFE BEST: ' + this.hiScores[this.livesMode], CANVAS_W / 2, 412);

    // NEW BEST indicator
    if (this.newBestThisRound && this.score === this.hiScores[this.livesMode]) {
      outlined(ctx, '★ NEW BEST! ★', CANVAS_W / 2, 455, 30, '#ffd23f', { line: 7 });
    }

    // Blinking restart prompt
    if (reducedMotion() || Math.floor(this.blinkTimer * 2) % 2 === 0) {   // steady with Visual FX off
      ctx.font = '22px ' + FONT;
      ctx.fillStyle = '#1c5fb8';
      keyHint(ctx, 'TAP / [SPACE] TO PLAY AGAIN', CANVAS_W / 2, 512);
    }
    ctx.font = '16px ' + FONT;
    ctx.fillStyle = '#6a6f86';
    keyHint(ctx, '[M] or [⌫] for menu (change mode)', CANVAS_W / 2, 550);
  }

  drawPause(ctx) {
    ctx.fillStyle = 'rgba(20,20,70,0.35)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    card(ctx, 90, CANVAS_H / 2 - 90, 300, 170);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    outlined(ctx, 'PAUSED', CANVAS_W / 2, CANVAS_H / 2 - 30, 54, '#4fb3ff', { line: 9, drop: 5 });
    ctx.font = '20px ' + FONT;
    ctx.fillStyle = '#6a6f86';
    keyHint(ctx, '[P] OR [ESC] TO RESUME', CANVAS_W / 2, CANVAS_H / 2 + 34);
  }

  drawInfo(ctx) {
    ctx.fillStyle = 'rgba(20,20,70,0.35)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    card(ctx, 12, 14, CANVAS_W - 30, CANVAS_H - 34);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    outlined(ctx, 'OBSTACLE GUIDE', CANVAS_W / 2, 56, 34, '#ffd23f', { line: 8, drop: 4 });

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
      ['#f5d24a',     'Hammer Bro',     'Bobs in place, throws arcing hammers.'],
      ['#FAFAFA',     'Lakitu',         'Rides a cloud and drops Spinies.'],
      ['#C62828',     'Spiny',          'Spiked shell that falls from Lakitu.'],
      ['#F5F5F5',     'Boo',            'Ghost that chases you — stops when close.'],
    ];

    const startY = 96;
    const rowH = 40;
    const swatchSize = 22;
    const leftPad = 30;
    const nameX = leftPad + swatchSize + 12;

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < entries.length; i++) {
      const [color, name, desc] = entries[i];
      const cy = startY + i * rowH + swatchSize / 2;

      // Swatch
      rrect(ctx, leftPad, cy - swatchSize / 2, swatchSize, swatchSize, 6);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Name
      ctx.font = '16px ' + FONT;
      ctx.fillStyle = INK;
      ctx.fillText(name, nameX, cy + 1);

      // Description, after the name (measured in the name's font); a long
      // one wraps onto a second line rather than running off the card
      const nameW = ctx.measureText(name).width;
      const descX = nameX + Math.max(112, nameW + 12);
      const maxW = CANVAS_W - 34 - descX;
      ctx.font = '13px ' + FONT;
      ctx.fillStyle = '#4a4f66';
      if (ctx.measureText(desc).width <= maxW) {
        ctx.fillText(desc, descX, cy);
      } else {
        const words = desc.split(' ');
        let line1 = '';
        while (words.length && ctx.measureText(line1 + words[0]).width <= maxW) line1 += words.shift() + ' ';
        ctx.fillText(line1.trim(), descX, cy - 8);
        ctx.fillText(words.join(' '), descX, cy + 8);
      }
    }

    // Back hint
    ctx.textAlign = 'center';
    if (reducedMotion() || Math.floor(this.blinkTimer * 1.6) % 2 === 0) {   // steady with Visual FX off
      ctx.font = '18px ' + FONT;
      ctx.fillStyle = '#1c5fb8';
      keyHint(ctx, 'TAP / [SPACE] / [I] TO RETURN', CANVAS_W / 2, CANVAS_H - 46);
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

// Tabbing away mid-flight used to end the run. Pause only — returning focus
// must not un-pause a run the player paused on purpose.
if (window.GameShell) {
  GameShell.onAutoPause(() => {
    if (game.gameState === 'PLAYING') game.togglePause();
  });
  // the shared ⏸ button beside the sound button, so it's plain the game pauses (P / Esc)
  if (GameShell.pauseButton) GameShell.pauseButton({
    keys: ['p', 'Escape'],
    canPause: () => game.gameState === 'PLAYING',
    isPaused: () => game.gameState === 'PAUSED',
    toggle: () => game.togglePause(),
  });
}
