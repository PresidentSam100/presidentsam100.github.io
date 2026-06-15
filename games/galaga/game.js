/* ======================= js/utils.js ======================= */
/* ===========================================================================
 * utils.js — global constants, math helpers, and the spline Path system.
 * Plain script (no modules) so everything here is global by design.
 * =========================================================================*/

const WIDTH = 448;
const HEIGHT = 576;

// Formation geometry (a single source of truth for slot positions).
const COLS = 10;
const COL_SPACING = 32;
const ROW_SPACING = 28;
const FORM_WIDTH = (COLS - 1) * COL_SPACING;
const FORM_ORIGIN_X = (WIDTH - FORM_WIDTH) / 2; // x of column 0
const FORM_ORIGIN_Y = 96;                       // y of row 0

const PLAYER_Y = HEIGHT - 56;
// lowest y a challenging-stage flyby enemy may reach, so it stays clear of the
// player's movement band at the bottom of the screen
const BONUS_FLOOR = PLAYER_Y - 70;
// how far ABOVE a boss its captured fighter rides (behind it, away from you)
const CAPTURE_OFFSET = 24;

// Enemy type ids
const T_BEE = 'bee';
const T_BUTTERFLY = 'butterfly';
const T_BOSS = 'boss';
// transformed enemies (appear in normal stages as a group of 3)
const T_OGAWAMUSHI = 'ogawamushi';
const T_EI = 'ei';
const T_GALBOSS = 'galboss';
// challenging-stage-only enemies
const T_TONBO = 'tonbo';
const T_MOMIJI = 'momiji';
const T_ENTERPRISE = 'enterprise';

// Shared animation clock (frame index for wing flapping etc.)
// Reduced Flash follows this game's reduce-motion setting (motion-toggle.js): set at load,
// and updated live when the player flips the top-right Motion toggle. The pause-menu
// "Reduced Flash" option still works as a manual override.
const ANIM = { flap: 0, time: 0, reducedFlash: !!(window.RM_ON && window.RM_ON()) };
window.addEventListener("reducemotionchange", function (e) { ANIM.reducedFlash = e.detail.on; });

// ---- math helpers ---------------------------------------------------------
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const choice = (arr) => arr[(Math.random() * arr.length) | 0];
const TAU = Math.PI * 2;

// Axis-aligned bounding-box overlap. Each box: {x,y,w,h} centred on (x,y).
function aabb(a, b) {
  return (
    Math.abs(a.x - b.x) * 2 < a.w + b.w &&
    Math.abs(a.y - b.y) * 2 < a.h + b.h
  );
}

// ---- Catmull-Rom spline through waypoints ---------------------------------
// A Path turns a small list of waypoints into a smooth, constant-speed curve.
// pointAt(distance) returns {x, y, angle} so entities can move at a fixed
// pixels/second rate regardless of how the control points are spaced.
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

class Path {
  constructor(waypoints, samplesPerSeg = 20) {
    this.pts = [];
    const p = waypoints;
    const n = p.length;
    if (n < 2) {
      this.pts = waypoints.slice();
    } else {
      for (let i = 0; i < n - 1; i++) {
        const p0 = p[i - 1] || p[i];
        const p1 = p[i];
        const p2 = p[i + 1];
        const p3 = p[i + 2] || p[i + 1];
        for (let s = 0; s < samplesPerSeg; s++) {
          this.pts.push(catmull(p0, p1, p2, p3, s / samplesPerSeg));
        }
      }
      this.pts.push(p[n - 1]);
    }
    // cumulative arc length
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) {
      this.cum.push(this.cum[i - 1] + dist(this.pts[i - 1], this.pts[i]));
    }
    this.length = this.cum[this.cum.length - 1] || 0;
  }

  pointAt(d) {
    const pts = this.pts;
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, angle: 0 };
    if (d <= 0) {
      const a = pts[0], b = pts[1];
      return { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    if (d >= this.length) {
      const i = pts.length - 1;
      const a = pts[i - 1], b = pts[i];
      return { x: b.x, y: b.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
    // binary search for the segment containing arc-length d
    let lo = 1, hi = this.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] < d) lo = mid + 1;
      else hi = mid;
    }
    const i = lo;
    const segLen = this.cum[i] - this.cum[i - 1];
    const f = segLen > 0 ? (d - this.cum[i - 1]) / segLen : 0;
    const a = pts[i - 1], b = pts[i];
    return {
      x: lerp(a.x, b.x, f),
      y: lerp(a.y, b.y, f),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    };
  }
}

// Per-stage formation movement parameters (set by Game.nextStage). Defaults
// match the original feel; stages tweak amplitude/speed/drift for variety.
const FORMATION = {
  swayAmp: 11, swaySpeed: 1.4,
  breatheAmp: 0.05,
  driftAmp: 0, driftSpeed: 0.5,   // slow whole-formation horizontal drift
  bobAmp: 0, bobSpeed: 0.9,       // gentle vertical bob
};

// World position of a formation slot, including the formation's sway/breathe.
// `time` is the running game clock in seconds.
function slotPosition(col, row, time) {
  const F = FORMATION;
  const sway = Math.sin(time * F.swaySpeed) * F.swayAmp;
  const drift = Math.sin(time * F.driftSpeed) * F.driftAmp;
  const breathe = 1 + Math.sin(time * F.swaySpeed + 1) * F.breatheAmp;
  const cx = WIDTH / 2;
  let x = FORM_ORIGIN_X + col * COL_SPACING;
  x = cx + (x - cx) * breathe + sway + drift;
  const y = FORM_ORIGIN_Y + row * ROW_SPACING + Math.sin(time * F.bobSpeed) * F.bobAmp;
  return { x, y };
}

/* ======================= js/audio.js ======================= */
/* ===========================================================================
 * audio.js — tiny procedural sound effects via the Web Audio API.
 * No asset files needed; everything is synthesised on the fly.
 * =========================================================================*/

const Sound = {
  ctx: null,
  muted: false,
  master: null,

  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
    } catch (e) {
      this.ctx = null; // audio unavailable; game still runs silently
    }
  },

  // resume() must be called from a user gesture (key press) in modern browsers
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  toggleMute() {
    this.muted = !this.muted;
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.35;
    return this.muted;
  },

  // Core voice: a tone that sweeps from f0 to f1 over `dur` seconds.
  tone(f0, f1, dur, type = 'square', vol = 0.5) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  },

  noise(dur, vol = 0.5, hp = 400) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const n = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = 'highpass';
    filt.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filt).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + dur);
  },

  fire() { this.tone(880, 220, 0.12, 'square', 0.25); },
  shieldBlock() { this.tone(300, 900, 0.25, 'sine', 0.4); },
  enemyHit() { this.noise(0.18, 0.5, 600); this.tone(300, 90, 0.18, 'sawtooth', 0.2); },
  playerDie() { this.tone(440, 40, 0.7, 'sawtooth', 0.5); this.noise(0.6, 0.4, 200); },
  dive() { this.tone(180, 520, 0.25, 'triangle', 0.18); },
  beam() { this.tone(120, 700, 1.0, 'sine', 0.25); },
  capture() { this.tone(200, 1200, 0.8, 'sine', 0.4); },
  rescue() { this.tone(400, 1600, 0.5, 'triangle', 0.4); },
  coin() { this.tone(988, 1319, 0.12, 'square', 0.3); },
  stage() { this.tone(523, 784, 0.15, 'square', 0.3); setTimeout(() => this.tone(784, 1047, 0.2, 'square', 0.3), 140); },
  bonusTick() { this.tone(1200, 1600, 0.05, 'square', 0.2); },
};

/* ======================= js/sprites.js ======================= */
/* ===========================================================================
 * sprites.js — pixel-art sprites rendered once to offscreen canvases.
 * Each sprite is a grid of single-char cells mapped to colours by a palette.
 * Drawing later with imageSmoothingEnabled=false gives crisp upscaling.
 * =========================================================================*/

function makeSprite(rows, palette) {
  const h = rows.length;
  const w = rows[0].length;
  // enforce left-right symmetry: mirror the left half onto the right half, so
  // every sprite is perfectly symmetric about its vertical centre line
  const half = (w / 2) | 0;
  rows = rows.map((r) => {
    const L = r.slice(0, half);
    return L + L.split('').reverse().join('');
  });
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const ch = rows[y][x];
      const col = palette[ch];
      if (col) {
        g.fillStyle = col;
        g.fillRect(x, y, 1, 1);
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  // content centre (cell coords) so the guide can centre artwork in its panel
  c.cx = x1 >= 0 ? (x0 + x1 + 1) / 2 : w / 2;
  c.cy = y1 >= 0 ? (y0 + y1 + 1) / 2 : h / 2;
  return c;
}

// Recolour an existing palette-based sprite (used for the damaged boss).
function remap(rows, palette) {
  return makeSprite(rows, palette);
}

const Sprites = {};

(function buildSprites() {
  // ----- Player fighter --------------------------------------------------
  const playerRows = [
    '.......WW.......',
    '.......WW.......',
    '......WCCW......',
    '......WCCW......',
    '......WCCW......',
    '.....WCCCCW.....',
    '....WWCRRCWW....',
    '....WWCRRCWW....',
    '...WWWCRRCWWW...',
    '..RW.WCCCCW.WR..',
    '.RRW.WWCCWW.WRR.',
    '.RRW..WWWW..WRR.',
    '.RW....WW....WR.',
    '.......WW.......',
    '................',
    '................',
  ];
  const playerPal = { W: '#e8eefc', C: '#18e0ff', R: '#ff3b5c' };
  Sprites.player = makeSprite(playerRows, playerPal);

  // dimmed/blue version drawn when the fighter has been captured
  Sprites.playerCaptured = makeSprite(playerRows, {
    W: '#7da7ff', C: '#2a5bd0', R: '#6b2a55',
  });

  // ----- Bee (Zako) two wing frames -------------------------------------
  const beeDown = [
    '................',
    '......B....B....',
    '.......B..B.....',
    '.......YYYY.....',
    '......YYYYYY....',
    '.....BYYYYYYB...',
    '....BBYYYYYYBB..',
    '....BBYWYYWYBB..',
    '....BBYYYYYYBB..',
    '....BB.YYYY.BB..',
    '.......YYYY.....',
    '......Y.YY.Y....',
    '.....Y......Y...',
    '................',
    '................',
    '................',
  ];
  const beeUp = [
    '................',
    '....BB....BB....',
    '....BB....BB....',
    '....BBYYYYBB....',
    '....BYYYYYYB....',
    '.....YYYYYY.....',
    '.....YYYYYY.....',
    '.....YWYYWY.....',
    '......YYYY......',
    '......YYYY......',
    '.....Y.YY.Y.....',
    '....Y......Y....',
    '................',
    '................',
    '................',
    '................',
  ];
  const beePal = { Y: '#ffd23f', B: '#2f6bff', W: '#ffffff' };
  Sprites.bee = [makeSprite(beeDown, beePal), makeSprite(beeUp, beePal)];

  // ----- Butterfly (Goei) two frames ------------------------------------
  const flyDown = [
    '................',
    '......R....R....',
    '.......R..R.....',
    '..B....RRRR....B',
    '.BB...RRWWRR...B',
    '.BBB.RRWWWWRR.BB',
    '.BBBBRRWWWWRRBBB',
    '..BBBRRWWWWRRBB.',
    '...BBRRWWWWRRB..',
    '....RRRWWWWRRR..',
    '.....RR.WW.RR...',
    '....RR......RR..',
    '...R..........R.',
    '................',
    '................',
    '................',
  ];
  const flyUp = [
    '.BB..........BB.',
    '.BBB..R..R..BBB.',
    '..BBB.RRRR.BBB..',
    '...BBRRWWRRBB...',
    '....RRWWWWRR....',
    '...RRRWWWWRRR...',
    '...RRRWWWWRRR...',
    '....RRWWWWRR....',
    '.....RRWWRR.....',
    '.....RR..RR.....',
    '....RR....RR....',
    '...R........R...',
    '................',
    '................',
    '................',
    '................',
  ];
  const flyPal = { R: '#ff3b3b', W: '#ffffff', B: '#2f6bff' };
  Sprites.butterfly = [makeSprite(flyDown, flyPal), makeSprite(flyUp, flyPal)];

  // ----- Boss Galaga two frames (green = full health) -------------------
  const bossDown = [
    '......G..G......',
    '.....GGGGGG.....',
    '....GGGGGGGG....',
    '...GGGPPPPGGG...',
    '..BGGPYYYYPGGB..',
    '.BBGGPYWWYPGGBB.',
    '.BBGGGPWWPGGGBB.',
    '.BBGGGGGGGGGGBB.',
    '..BGGGGGGGGGGB..',
    '...GGG.GG.GGG...',
    '..GG..G..G..GG..',
    '.G....G..G....G.',
    '................',
    '................',
    '................',
    '................',
  ];
  const bossUp = [
    'B......G..G....B',
    'BB...GGGGGG...BB',
    '.BB.GGGGGGGG.BB.',
    '..GGGGPPPPGGGG..',
    '..GGGPYYYYPGGG..',
    '...GGPYWWYPGG...',
    '...GGGPWWPGGG...',
    '....GGGGGGGG....',
    '.....GGGGGG.....',
    '....GG.GG.GG....',
    '...G..G..G..G...',
    '................',
    '................',
    '................',
    '................',
    '................',
  ];
  const bossPalGreen = { G: '#2fc84f', P: '#1d8a36', Y: '#ffd23f', W: '#ffffff', B: '#2f6bff' };
  // damaged boss: green hull recoloured to blue/purple
  const bossPalBlue = { G: '#7a5bff', P: '#4a2fb0', Y: '#ffd23f', W: '#ffffff', B: '#2f6bff' };
  Sprites.boss = [makeSprite(bossDown, bossPalGreen), makeSprite(bossUp, bossPalGreen)];
  Sprites.bossHit = [makeSprite(bossDown, bossPalBlue), makeSprite(bossUp, bossPalBlue)];

  // ----- Raider (side-attacker) two frames: an angular orange/purple hornet --
  const raiderDown = [
    '................',
    '.....O....O.....',
    '......O..O......',
    '......MWWM......',
    '.....MWWWWM.....',
    'P...OOOOOOOO...P',
    'PP.OOOOOOOOOO.PP',
    'PPPOOOOOOOOOOPPP',
    '.PP.OOOOOOOO.PP.',
    '....OOOOOOOO....',
    '.....OOOOOO.....',
    '......OOOO......',
    '.......MM.......',
    '.......MM.......',
    '................',
    '................',
  ];
  const raiderUp = [
    '..P..........P..',
    '..PP.O....O.PP..',
    '...PP.O..O.PP...',
    '......MWWM......',
    '.....MWWWWM.....',
    '....OOOOOOOO....',
    '...OOOOOOOOOO...',
    '...OOOOOOOOOO...',
    '....OOOOOOOO....',
    '....OOOOOOOO....',
    '.....OOOOOO.....',
    '......OOOO......',
    '.......MM.......',
    '.......MM.......',
    '................',
    '................',
  ];
  const raiderPal = { O: '#ff7a18', P: '#9b2fff', M: '#ff3b9c', W: '#ffffff' };
  Sprites.raider = [makeSprite(raiderDown, raiderPal), makeSprite(raiderUp, raiderPal)];

  // ----- Transformed & challenging-stage special enemies (two frames each) ----
  const anim = (rowsA, rowsB, pal) => [makeSprite(rowsA, pal), makeSprite(rowsB, pal)];

  // Tonbo (dragonfly) -- wings flap
  Sprites.tonbo = anim([
    '.......AA.......', '......AWWA......', '.......AA.......',
    '.B.....AA.....B.', 'BBB...AAAA...BBB', 'BBBB.AAAAAA.BBBB',
    '.BBB..AAAA..BBB.', '..B....AA....B..', '.......AA.......',
    '.......AA.......', '.......AA.......', '.......AA.......',
    '.......A........', '................', '................', '................',
  ], [
    '.......AA.......', '......AWWA......', '.......AA.......',
    '..B....AA....B..', '.BBB..AAAA..BBB.', 'BBBB.AAAAAA.BBBB',
    'BBB...AAAA...BBB', '.B.....AA.....B.', '.......AA.......',
    '.......AA.......', '.......AA.......', '.......AA.......',
    '.......A........', '................', '................', '................',
  ], { A: '#18e0ff', W: '#ffffff', B: '#7fd4ff' });

  // Ogawamushi / Sasori (segmented crawler) -- segments & legs crawl
  Sprites.ogawamushi = anim([
    '................', '..K..........K..', '...OOOOOOOOOO...',
    '..OOKOOKKOOKOO..', '..OOOOOOOOOOOO..', '..OOKOOKKOOKOO..',
    '...OOOOOOOOOO...', '..O.O.O..O.O.O..', '................',
    '................', '................', '................',
    '................', '................', '................', '................',
  ], [
    '................', '...K........K...', '...OOOOOOOOOO...',
    '..OOOOOOOOOOOO..', '..OOKOOKKOOKOO..', '..OOOOOOOOOOOO..',
    '...OOOOOOOOOO...', '..O..OO..OO..O..', '................',
    '................', '................', '................',
    '................', '................', '................', '................',
  ], { O: '#ff7a18', K: '#6b2a00' });

  // Momiji (maple leaf) -- symmetric flutter (side points & width shift)
  Sprites.momiji = anim([
    '.......RR.......', '......RRRR......', '..RR..RRRR..RR..',
    '..RRRRRRRRRRRR..', '...RRRRRRRRRR...', '.RRRRRRRRRRRRRR.',
    '..RRRRRRRRRRRR..', '...RRRRRRRRRR...', '....RRRRRRRR....',
    '.....RRRRRR.....', '......RRRR......', '.......RR.......',
    '.......RR.......', '................', '................', '................',
  ], [
    '.......RR.......', '......RRRR......', '.RR...RRRR...RR.',
    '..RRR.RRRR.RRR..', '...RRRRRRRRRR...', '..RRRRRRRRRRRR..',
    '...RRRRRRRRRR...', '....RRRRRRRR....', '....RRRRRRRR....',
    '.....RRRRRR.....', '......RRRR......', '.......RR.......',
    '.......RR.......', '................', '................', '................',
  ], { R: '#ff5a2a' });

  // Ei / Midori (green manta ray) -- wings/tail undulate
  Sprites.ei = anim([
    '.......GG.......', '......GGGG......', '.....GGGGGG.....',
    '....GGGGGGGG....', '...GGWGGGGWGG...', '..GGGGGGGGGGGG..',
    '.GGGGGGGGGGGGGG.', 'GGGGGGGGGGGGGGGG', 'GGGGG.GGGG.GGGGG',
    'GGG....GG....GGG', '.G.....GG.....G.', '.......GG.......',
    '......G..G......', '................', '................', '................',
  ], [
    '.......GG.......', '......GGGG......', '.....GGGGGG.....',
    '....GGGGGGGG....', '...GGWGGGGWGG...', '..GGGGGGGGGGGG..',
    '.GGGGGGGGGGGGGG.', 'GGGGGGGGGGGGGGGG', '.GGGGGGGGGGGGGG.',
    '..GG..GGGG..GG..', '.GG....GG....GG.', '.......GG.......',
    '......GGGG......', '.....GG..GG.....', '................', '................',
  ], { G: '#2fc84f', W: '#ffffff' });

  // Galboss (Galaxian flagship) -- wings flap
  Sprites.galboss = anim([
    '......YYYY......', '.....YBBBBY.....', '....RRRRRRRR....',
    '...RRRRRRRRRR...', '..RRRWRRRRWRR...', '..RRRRRRRRRRRR..',
    '.BB.RRRRRRRR.BB.', 'BBB.RRRRRRRR.BBB', 'BB...RRRRRR...BB',
    '.....RR..RR.....', '....RR....RR....', '................',
    '................', '................', '................', '................',
  ], [
    '......YYYY......', '.BB..YBBBBY..BB.', 'BBB.RRRRRRRR.BBB',
    '.BB.RRRRRRRR.BB.', '..RRRWRRRRWRR...', '..RRRRRRRRRRRR..',
    '...RRRRRRRRRR...', '....RRRRRRRR....', '.....RRRRRR.....',
    '.....RR..RR.....', '....RR....RR....', '................',
    '................', '................', '................', '................',
  ], { R: '#ff3b3b', B: '#2f6bff', Y: '#ffd23f', W: '#ffffff' });

  // Enterprise (starship) -- nacelle/exhaust glow blinks
  Sprites.enterprise = anim([
    '....WWWWWWWW....', '...WWWWWWWWWW...', '....WWWWWWWW....',
    '.......WW.......', '......GGGG......', '.....GGGGGG.....',
    '.....GGGGGG.....', '..CCCC....CCCC..', '.CCCCCC..CCCCCC.',
    '.CC..........CC.', '................', '................',
    '................', '................', '................', '................',
  ], [
    '....WWWWWWWW....', '...WWWWWWWWWW...', '....WWWWWWWW....',
    '.......WW.......', '......GGGG......', '.....GGGGGG.....',
    '.....GGGGGG.....', '..CWCC....CCWC..', '.CCCCCC..CCCCCC.',
    '.WC..........CW.', '................', '................',
    '................', '................', '................', '................',
  ], { W: '#e8eefc', G: '#9aa6c0', C: '#18e0ff' });

  // ----- Stage flag badges (bottom-right level counter) -----------------
  const flag = (rows, pal) => makeSprite(rows, pal);
  const baseFlag = [
    '.FFFFFF.',
    'FFNNNNFF',
    'FFNNNNFF',
    'FFFFFFFF',
    '...SS...',
    '...SS...',
  ];
  Sprites.flags = {
    1: flag(baseFlag, { F: '#2fc84f', N: '#ffffff', S: '#888' }),  // green  = 1
    5: flag(baseFlag, { F: '#ff3b3b', N: '#ffd23f', S: '#888' }),  // red    = 5
    10: flag(baseFlag, { F: '#2f6bff', N: '#ffffff', S: '#888' }), // blue   = 10
    20: flag(baseFlag, { F: '#ffd23f', N: '#ff3b3b', S: '#888' }), // yellow = 20
    30: flag(baseFlag, { F: '#18e0ff', N: '#1140aa', S: '#888' }), // cyan   = 30
    50: flag(baseFlag, { F: '#ff8a18', N: '#ffffff', S: '#888' }), // orange = 50
  };
})();

// Convenience: get the current animation frame (0/1) for flapping sprites.
function spriteFrame(set) {
  return set[ANIM.flap % set.length];
}

/* ======================= js/entities.js ======================= */
/* ===========================================================================
 * entities.js — Player, Enemy, projectiles, explosions, starfield.
 * The Enemy class contains the main behaviour state machine:
 *   enter -> toSlot -> formation -> (dive | beam) -> return -> formation
 * =========================================================================*/

// ---- scrolling starfield --------------------------------------------------
class Starfield {
  constructor(n = 80) {
    this.stars = [];
    for (let i = 0; i < n; i++) {
      this.stars.push({
        x: Math.random() * WIDTH,
        y: Math.random() * HEIGHT,
        s: rand(8, 40),               // fall speed
        r: Math.random() < 0.2 ? 1.6 : 1,
        c: choice(['#ffffff', '#9fd0ff', '#ffd6e0', '#bdfcff', '#fff2a8']),
        tw: rand(0, TAU),
      });
    }
  }
  update(dt) {
    for (const st of this.stars) {
      st.y += st.s * dt;
      st.tw += dt * 6;
      if (st.y > HEIGHT) {
        st.y = 0;
        st.x = Math.random() * WIDTH;
      }
    }
  }
  draw(ctx) {
    for (const st of this.stars) {
      const a = ANIM.reducedFlash ? 0.85 : 0.5 + 0.5 * Math.sin(st.tw);
      ctx.globalAlpha = a;
      ctx.fillStyle = st.c;
      ctx.fillRect(st.x, st.y, st.r, st.r);
    }
    ctx.globalAlpha = 1;
  }
}

// ---- projectiles ----------------------------------------------------------
// ---- power-up definitions -------------------------------------------------
const POWER_TYPES = ['spread', 'pierce', 'rapid', 'shield', 'speed', 'hunter', 'slow', 'double'];
const POWER_COLORS = { spread: '#18e0ff', pierce: '#ff5cf0', rapid: '#ffd23f', shield: '#3cff8a', speed: '#ffa030', hunter: '#b46bff', slow: '#5ad1c0', double: '#ff5cae' };
const POWER_NAMES = { spread: 'SPREAD', pierce: 'PIERCE', rapid: 'RAPID', shield: 'SHIELD', speed: 'SPEED', hunter: 'HUNTER', slow: 'SLOW-MO', double: 'DOUBLE' };
const POWER_LETTER = { spread: 'S', pierce: 'P', rapid: 'R', shield: '+', speed: 'F', hunter: 'H', slow: 'T', double: '2' };
const POWER_DURATION = 12;

class Bullet {
  constructor(x, y, vx = 0) {
    this.x = x;
    this.y = y;
    this.w = 3;
    this.h = 12;
    this.vx = vx;
    this.vy = -560;
    this.dead = false;
    this.pierce = false;
    this.hunter = false;  // homes toward the nearest enemy
    this.hits = null;     // enemies already struck (for piercing shots)
  }
  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // off-screen on any side (homing shots can curve off the bottom)
    if (this.y < -16 || this.y > HEIGHT + 16 || this.x < -16 || this.x > WIDTH + 16) this.dead = true;
  }
  draw(ctx) {
    if (this.hunter) {
      const ang = Math.atan2(this.vy, this.vx);
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(ang + Math.PI / 2); // point along travel
      ctx.fillStyle = '#b46bff';
      ctx.fillRect(-1.5, -7, 3, 14);
      ctx.fillStyle = '#fff';
      ctx.fillRect(-1.5, -7, 3, 4);
      ctx.restore();
    } else if (this.pierce) {
      ctx.fillStyle = '#ff5cf0';
      ctx.fillRect(this.x - 1.5, this.y - 7, 3, 14);
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x - 1.5, this.y - 7, 3, 4);
    } else {
      ctx.fillStyle = '#fff';
      ctx.fillRect(this.x - 1, this.y - 6, 2, 12);
      ctx.fillStyle = '#18e0ff';
      ctx.fillRect(this.x - 1, this.y - 6, 2, 4);
    }
  }
}

// falling capsule dropped by a destroyed carrier enemy
class PowerUp {
  constructor(x, y, type) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.vy = 75;
    this.w = 18;
    this.h = 18;
    this.t = 0;
    this.phase = Math.random() * TAU; // per-capsule pulse offset
    this.dead = false;
  }
  update(dt) {
    this.t += dt;
    this.y += this.vy * dt;
    this.x += Math.sin(this.t * 4) * 0.6;
    if (this.y > HEIGHT + 20) this.dead = true;
  }
  draw(ctx) {
    const col = POWER_COLORS[this.type];
    const pulse = ANIM.reducedFlash ? 1 : 0.55 + 0.45 * Math.sin(ANIM.time * 10 + this.phase);
    ctx.save();
    ctx.globalAlpha = pulse;
    ctx.fillStyle = col;
    ctx.fillRect(this.x - 9, this.y - 9, 18, 18);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.x - 9, this.y - 9, 18, 18);
    ctx.fillStyle = '#001018';
    ctx.font = 'bold 13px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(POWER_LETTER[this.type], this.x, this.y + 1);
    ctx.restore();
  }
}

class Bomb {
  constructor(x, y, vx, vy) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.w = 6;
    this.h = 6;
    this.dead = false;
    this.t = 0;
    this.phase = Math.random() * TAU; // per-bomb flicker offset
  }
  update(dt) {
    this.t += dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y > HEIGHT + 10 || this.x < -10 || this.x > WIDTH + 10)
      this.dead = true;
  }
  draw(ctx) {
    const tri = (col) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(this.x, this.y - 4);
      ctx.lineTo(this.x + 3, this.y + 3);
      ctx.lineTo(this.x - 3, this.y + 3);
      ctx.closePath();
      ctx.fill();
    };
    if (ANIM.reducedFlash) {
      tri('#ff5cf0'); // steady solid pink (no strobe)
    } else {
      // classic pink/blue flicker, driven by the global clock so it keeps
      // flashing even while the game is paused
      tri(Math.sin(ANIM.time * 26 + this.phase) > 0 ? '#ff5cf0' : '#18e0ff');
    }
  }
}

// ---- explosions -----------------------------------------------------------
class Explosion {
  constructor(x, y, big = false) {
    this.x = x;
    this.y = y;
    this.t = 0;
    this.dur = big ? 0.8 : 0.45;
    this.big = big;
    this.dead = false;
    this.parts = [];
    const n = big ? 14 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rand(-0.2, 0.2);
      const sp = rand(big ? 40 : 30, big ? 150 : 110);
      this.parts.push({
        x: 0, y: 0,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        c: choice(big ? ['#fff', '#ffd23f', '#ff8a18', '#18e0ff'] : ['#fff', '#ffd23f', '#ff5cf0', '#18e0ff']),
        r: rand(1.5, 3),
      });
    }
  }
  update(dt) {
    this.t += dt;
    for (const p of this.parts) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
    }
    if (this.t >= this.dur) this.dead = true;
  }
  draw(ctx) {
    const k = this.t / this.dur;
    ctx.globalAlpha = 1 - k;
    for (const p of this.parts) {
      ctx.fillStyle = p.c;
      const r = p.r * (1 - k * 0.5);
      ctx.fillRect(this.x + p.x - r, this.y + p.y - r, r * 2, r * 2);
    }
    // central flash (skipped in reduced-flash mode)
    if (k < 0.55 && !ANIM.reducedFlash) {
      ctx.globalAlpha = (0.55 - k) * 1.9;
      ctx.fillStyle = '#fff';
      const fr = (this.big ? 28 : 16) * (0.4 + k);
      ctx.beginPath();
      ctx.arc(this.x, this.y, fr, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// ---- player fighter -------------------------------------------------------
class Player {
  constructor() {
    this.x = WIDTH / 2;
    this.y = PLAYER_Y;
    this.w = 26;
    this.h = 22;
    this.speed = 200;
    this.dual = false;          // captured-ship rescued -> twin fighters
    this.fireCd = 0;
    this.state = 'spawning';    // spawning | alive | dying | captured | gone
    this.t = 0;
    this.invuln = 1.0;          // brief spawn protection
    this.captureBoss = null;    // boss pulling this ship up (capture anim)
    this.spin = 0;
    this.powers = {};           // active power-ups -> remaining seconds (stackable)
  }

  // current hitboxes (one box, or two when dual)
  boxes() {
    if (this.dual) {
      return [
        { x: this.x - 13, y: this.y, w: this.w, h: this.h },
        { x: this.x + 13, y: this.y, w: this.w, h: this.h },
      ];
    }
    return [{ x: this.x, y: this.y, w: this.w, h: this.h }];
  }

  update(dt, input) {
    this.t += dt;
    if (this.invuln > 0) this.invuln -= dt;

    if (this.state === 'spawning') {
      if (this.t > 0.6) this.state = 'alive';
    }

    if (this.state === 'alive' || this.state === 'spawning') {
      let dx = 0;
      if (input.left) dx -= 1;
      if (input.right) dx += 1;
      const spd = this.speed * (this.hasPower('speed') ? 1.7 : 1); // Speed power-up
      this.x += dx * spd * dt;
      const margin = this.dual ? 28 : 16;
      this.x = clamp(this.x, margin, WIDTH - margin);
      if (this.fireCd > 0) this.fireCd -= dt;
    } else if (this.state === 'captured') {
      // spiral up into the capturing boss
      this.spin += dt * 10;
      if (this.captureBoss) {
        this.x = lerp(this.x, this.captureBoss.x, dt * 5);
        this.y = lerp(this.y, this.captureBoss.y + 22, dt * 5);
      }
    }
  }

  canFire() {
    return (this.state === 'alive') && this.fireCd <= 0;
  }

  hasPower(type) {
    return (this.powers[type] || 0) > 0;
  }

  // drain active power timers (called only while actually playing, so the
  // timers pause during stage-clear/ready banners)
  tickPowers(dt) {
    for (const k in this.powers) {
      this.powers[k] -= dt;
      if (this.powers[k] <= 0) delete this.powers[k];
    }
  }

  draw(ctx) {
    if (this.state === 'gone') return;

    // shield bubble (drawn even through the invuln flicker)
    if (this.hasPower('shield') && (this.state === 'alive' || this.state === 'spawning')) {
      const pulse = ANIM.reducedFlash ? 1 : 0.6 + 0.4 * Math.sin(ANIM.time * 8);
      ctx.save();
      ctx.globalAlpha = 0.45 * pulse;
      ctx.strokeStyle = POWER_COLORS.shield;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.dual ? 27 : 18, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // flicker while invulnerable
    if (this.invuln > 0 && !ANIM.reducedFlash && Math.floor(this.t * 16) % 2 === 0 && this.state !== 'captured')
      return;

    const sprite = this.state === 'captured' ? Sprites.playerCaptured : Sprites.player;
    const dw = 28, dh = 28;
    if (this.state === 'captured') {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.spin);
      ctx.drawImage(sprite, -dw / 2, -dh / 2, dw, dh);
      ctx.restore();
      return;
    }
    if (this.dual) {
      ctx.drawImage(Sprites.player, this.x - 13 - dw / 2, this.y - dh / 2, dw, dh);
      ctx.drawImage(Sprites.player, this.x + 13 - dw / 2, this.y - dh / 2, dw, dh);
    } else {
      ctx.drawImage(Sprites.player, this.x - dw / 2, this.y - dh / 2, dw, dh);
    }
  }
}

// ---- enemy ----------------------------------------------------------------
const ENEMY_DATA = {
  [T_BEE]:        { hp: 1, formPts: 50,  divePts: 100, size: 26, sprite: 'bee' },
  [T_BUTTERFLY]:  { hp: 1, formPts: 80,  divePts: 160, size: 26, sprite: 'butterfly' },
  [T_BOSS]:       { hp: 2, formPts: 150, divePts: 400, size: 30, sprite: 'boss' },
  // transformed & special enemies: flat 160, always "attacking"
  [T_OGAWAMUSHI]: { hp: 1, formPts: 160, divePts: 160, size: 24, sprite: 'ogawamushi' },
  [T_EI]:         { hp: 1, formPts: 160, divePts: 160, size: 28, sprite: 'ei' },
  [T_GALBOSS]:    { hp: 1, formPts: 160, divePts: 160, size: 28, sprite: 'galboss' },
  [T_TONBO]:      { hp: 1, formPts: 160, divePts: 160, size: 26, sprite: 'tonbo' },
  [T_MOMIJI]:     { hp: 1, formPts: 160, divePts: 160, size: 26, sprite: 'momiji' },
  [T_ENTERPRISE]: { hp: 1, formPts: 160, divePts: 160, size: 28, sprite: 'enterprise' },
};

class Enemy {
  constructor(type, col, row) {
    const d = ENEMY_DATA[type];
    this.type = type;
    this.col = col;
    this.row = row;
    this.hp = d.hp;
    this.size = d.size;
    this.data = d;
    this.x = WIDTH / 2;
    this.y = -40;
    this.w = d.size - 6;
    this.h = d.size - 6;
    this.state = 'enter';
    this.path = null;
    this.pathDist = 0;
    this.speed = 150;
    this.lerpT = 0;
    this.fromX = 0;
    this.fromY = 0;
    this.angle = 0;
    this.prevX = this.x;
    this.bank = 0;
    this.bombTimer = rand(0.3, 0.8);
    this.bombsLeft = 0;
    this.dead = false;          // remove from list (no kill credit)
    this.killed = false;        // destroyed by player
    // boss capture state
    this.hasCaptured = false;
    this.wantsBeam = false;     // boss alternates loop-dive <-> tractor beam
    this.beamPhase = null;
    this.beamTimer = 0;
    this.beamOpen = 0;
    this.escorts = [];          // butterflies diving with this boss
    this.isEscort = false;
    this.bonus = false;         // challenging-stage flyby (never attacks)
    this.spawnDelay = 0;        // staggered entrance
    this.carrier = false;       // flashing enemy that drops a power-up
    this.power = null;          // which power-up it carries
    this.earlyCharge = false;   // peels off to attack at the END of the entrance
    this.raider = false;        // extra attacker that never joins the formation
    this.sideRaider = false;    // a side-entry raider (uses its own sprite)
    this.convoyCharge = false;  // rides in with a wave, peels off MID-entrance
    this.chargeFrac = 0.5;      // fraction of the path travelled before peeling off
    this.captive = false;       // a freed/broken-loose captured fighter acting as an enemy
    this.transformGroup = null; // id of the transform trio this belongs to
    this.diveCount = 0;         // dives performed (used by the end-of-stage assault)
  }

  points(diving) {
    return diving ? this.data.divePts : this.data.formPts;
  }

  startEnter(path, speed, delay) {
    this.state = 'enter';
    this.path = path;
    this.pathDist = 0;
    this.speed = speed;
    this.spawnDelay = delay;
    const p = path.pointAt(0);
    this.x = p.x;
    this.y = p.y;
  }

  startDive(game, withBombs = true) {
    const px = game.player ? game.player.x : WIDTH / 2;
    const side = this.x < WIDTH / 2 ? 1 : -1;
    const prof = game.profile || DEFAULT_PROFILE;
    // canonical: dive shape follows the enemy type; an escorting Goei flies
    // like the Boss Galaga it protects
    const kind = this.isEscort ? T_BOSS : this.type;
    let style = TYPE_DIVE[kind] || 'swoop';
    if (game.finalAttack && kind === T_BEE) style = 'circle'; // end-of-stage Zako circling
    const gen = DIVE_STYLES[style] || DIVE_STYLES.swoop;
    this.diveStyle = style;
    this.path = new Path(gen(this, px, side));
    this.pathDist = 0;
    this.speed = rand(165, 205) * (prof.diveSpeedMul || 1);
    this.state = 'dive';
    this.bombsLeft = withBombs ? randInt(prof.bombsMin, prof.bombsMax) : 0;
    this.bombTimer = rand(0.25, 0.6);
    Sound.dive();
  }

  // Boss behaviour 2: fly diagonally to a random spot, stop, deploy the beam.
  startBeam(game) {
    this.state = 'beam';
    this.beamPhase = 'descend';
    this.beamTimer = 0;
    this.beamOpen = 0;
    this.beamTargetX = rand(70, WIDTH - 70);
    this.beamTargetY = rand(HEIGHT * 0.42, HEIGHT * 0.56);
    Sound.dive();
  }

  // bonus stage: fly a full path across the screen then leave
  startFlyby(path, speed, delay) {
    this.bonus = true;
    this.state = 'enter';
    this.flyby = true;
    this.path = path;
    this.pathDist = 0;
    this.speed = speed;
    this.spawnDelay = delay;
    const p = path.pointAt(0);
    this.x = p.x;
    this.y = p.y;
  }

  // a transformed enemy's run: descend toward one side, straight down, then exit
  // the opposite side. Members stagger (single file / diagonal / delayed pop-out).
  startTransformDive(game, ttype, idx, side, ox, oy) {
    let startX = ox, delay = 0;
    if (ttype === T_OGAWAMUSHI) delay = idx * 0.2;                 // single file
    else if (ttype === T_EI) { startX = ox + side * idx * 14; delay = idx * 0.14; } // diagonal
    else if (ttype === T_GALBOSS) { delay = idx === 0 ? 0 : 0.55; startX = ox + (idx - 1) * 22; } // 1 then 2
    const wp = [
      { x: startX, y: oy },
      { x: clamp(startX + side * 70, 24, WIDTH - 24), y: oy + 90 },
      { x: clamp(startX + side * 70, 24, WIDTH - 24), y: HEIGHT - 130 }, // straight down
      { x: clamp(startX - side * 150, 10, WIDTH - 10), y: HEIGHT + 40 }, // leave opposite
    ];
    this.path = new Path(wp);
    this.pathDist = 0;
    this.state = 'dive';
    this.speed = rand(150, 185) * ((game.profile && game.profile.diveSpeedMul) || 1);
    this.bombsLeft = 0;          // transformed enemies don't fire
    this.spawnDelay = delay;     // hidden until they emerge (draw skips spawnDelay>0)
    this.x = startX; this.y = oy;
  }

  // a diver that exited off the bottom re-enters from the top of the screen
  beginReturnFromTop(game) {
    const slot = slotPosition(this.col, this.row, game.time);
    this.state = 'return';
    this.lerpT = 0;
    this.fromX = clamp(slot.x + rand(-30, 30), 20, WIDTH - 20);
    this.fromY = -30;
    this.x = this.fromX;
    this.y = this.fromY;
  }

  // fly back to the formation slot from wherever we are now (no teleport) --
  // used by the tractor-beam boss, which is mid-screen when it heads home
  returnToSlot() {
    this.state = 'return';
    this.lerpT = 0;
    this.fromX = this.x;
    this.fromY = this.y;
  }

  update(dt, game) {
    if (this.spawnDelay > 0) {
      this.spawnDelay -= dt;
      return;
    }
    this.prevX = this.x;

    switch (this.state) {
      case 'enter': {
        this.pathDist += this.speed * dt;
        const p = this.path.pointAt(this.pathDist);
        this.x = p.x;
        this.y = p.y;
        this.angle = p.angle;
        // convoy chargers peel off partway through to dive at the player
        if (this.convoyCharge && this.pathDist >= this.path.length * this.chargeFrac) {
          this.convoyCharge = false;
          this.raider = true;       // they leave afterwards, never join formation
          this.startDive(game, true);
          break;
        }
        if (this.pathDist >= this.path.length) {
          if (this.flyby) {
            this.dead = true;       // left the screen, no penalty
          } else if (this.earlyCharge) {
            this.earlyCharge = false; // peel off and dive at the player first
            this.startDive(game, true);
          } else {
            this.state = 'toSlot';
            this.lerpT = 0;
            this.fromX = this.x;
            this.fromY = this.y;
          }
        }
        break;
      }
      case 'toSlot':
      case 'return': {
        this.lerpT += dt / 0.6;
        const t = clamp(this.lerpT, 0, 1);
        const e = t * t * (3 - 2 * t); // smoothstep
        const slot = slotPosition(this.col, this.row, game.time);
        this.x = lerp(this.fromX, slot.x, e);
        this.y = lerp(this.fromY, slot.y, e);
        this.angle = 0;
        if (t >= 1) this.state = 'formation';
        break;
      }
      case 'formation': {
        const slot = slotPosition(this.col, this.row, game.time);
        this.x = slot.x;
        this.y = slot.y;
        this.angle = 0;
        break;
      }
      case 'dive': {
        this.pathDist += this.speed * dt;
        const p = this.path.pointAt(this.pathDist);
        this.x = p.x;
        this.y = p.y;
        this.angle = p.angle;
        // drop bombs while descending through mid-screen
        if (this.bombsLeft > 0 && this.y > 90 && this.y < HEIGHT - 90) {
          this.bombTimer -= dt;
          if (this.bombTimer <= 0) {
            this.bombTimer = rand(0.35, 0.7);
            this.bombsLeft--;
            game.spawnBomb(this);
          }
        }
        if (this.pathDist >= this.path.length) {
          if (this.raider) this.dead = true;        // extra attacker exits for good
          else if (game.finalAttack) {
            // end of stage: the survivors keep diving relentlessly (re-entering
            // from the top) until you shoot them down -- they never just leave
            this.diveCount++;
            this.x = clamp(rand(40, WIDTH - 40), 20, WIDTH - 20);
            this.y = -30;
            this.startDive(game, true);
          } else this.beginReturnFromTop(game);
        }
        break;
      }
      case 'beam':
        this.updateBeam(dt, game);
        break;
    }

    // banking tilt from horizontal motion (visual flourish)
    const targetBank = clamp((this.x - this.prevX) * 0.05, -0.5, 0.5);
    this.bank += (targetBank - this.bank) * Math.min(1, dt * 10);
  }

  updateBeam(dt, game) {
    switch (this.beamPhase) {
      case 'descend': {
        // glide diagonally toward the chosen spot, then stop and open the beam
        const sp = 150 * dt;
        const dx = this.beamTargetX - this.x, dy = this.beamTargetY - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.x += (dx / d) * Math.min(sp, d);
        this.y += (dy / d) * Math.min(sp, d);
        if (d < 4) {
          this.beamPhase = 'open';
          this.beamTimer = 0;
          Sound.beam();
        }
        break;
      }
      case 'open': {
        this.beamTimer += dt;
        this.beamOpen = clamp(this.beamTimer / 0.5, 0, 1);
        if (this.beamTimer >= 0.5) {
          this.beamPhase = 'hold';
          this.beamTimer = 0;
        }
        break;
      }
      case 'hold': {
        this.beamTimer += dt;
        // capture check: is the player inside the widening cone?
        const pl = game.player;
        // a shielded fighter cannot be captured by the tractor beam
        if (pl && pl.state === 'alive' && !pl.dual && !pl.hasPower('shield') && !game.captureActive) {
          const halfAt = lerp(8, 52, this.beamOpen);
          if (pl.y > this.y && Math.abs(pl.x - this.x) < halfAt) {
            // pull begins; capture only completes once the pilot reaches the boss
            game.capturePlayer(this);
          }
        }
        if (this.beamTimer >= 1.3) {
          this.beamPhase = 'close';
          this.beamTimer = 0;
        }
        break;
      }
      case 'capturing': {
        // frozen here holding the open beam while the pilot is pulled up;
        // the Game finalizes the capture and then switches us to 'close'.
        this.beamOpen = 1;
        break;
      }
      case 'close': {
        this.beamTimer += dt;
        this.beamOpen = clamp(1 - this.beamTimer / 0.3, 0, 1);
        if (this.beamTimer >= 0.3) {
          this.beamOpen = 0;
          this.returnToSlot(); // glide back up from mid-screen, no teleport
        }
        break;
      }
    }
  }

  // beam cone geometry for rendering / nothing else
  drawBeam(ctx) {
    if (this.state !== 'beam' || this.beamOpen <= 0) return;
    const topY = this.y + 12;
    const botY = HEIGHT - 30;
    const halfTop = 6 * this.beamOpen;
    const halfBot = 52 * this.beamOpen;
    const grad = ctx.createLinearGradient(0, topY, 0, botY);
    grad.addColorStop(0, 'rgba(120,200,255,0.55)');
    grad.addColorStop(1, 'rgba(60,120,255,0.05)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(this.x - halfTop, topY);
    ctx.lineTo(this.x + halfTop, topY);
    ctx.lineTo(this.x + halfBot, botY);
    ctx.lineTo(this.x - halfBot, botY);
    ctx.closePath();
    ctx.fill();
    // scan lines
    ctx.strokeStyle = 'rgba(200,230,255,0.4)';
    ctx.lineWidth = 1;
    const t = (ANIM.time * 90) % 26;
    for (let yy = topY + t; yy < botY; yy += 26) {
      const f = (yy - topY) / (botY - topY);
      const hw = lerp(halfTop, halfBot, f);
      ctx.beginPath();
      ctx.moveTo(this.x - hw, yy);
      ctx.lineTo(this.x + hw, yy);
      ctx.stroke();
    }
  }

  draw(ctx) {
    if (this.spawnDelay > 0) return;

    // power-up carriers pulse a coloured halo so they stand out
    if (this.carrier) {
      const pulse = ANIM.reducedFlash ? 1 : 0.5 + 0.5 * Math.sin(ANIM.time * 9);
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.55 * pulse;
      ctx.strokeStyle = POWER_COLORS[this.power] || '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 0.62, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    let set;
    if (this.captive) set = [Sprites.playerCaptured, Sprites.playerCaptured]; // freed-and-hostile fighter
    else if (this.sideRaider) set = Sprites.raider;     // distinct side-attacker look
    else if (this.type === T_BOSS) set = this.hp <= 1 ? Sprites.bossHit : Sprites.boss;
    else set = Sprites[this.data.sprite];
    const sprite = spriteFrame(set);
    const s = this.size;

    ctx.save();
    ctx.translate(this.x, this.y);
    if (Math.abs(this.bank) > 0.01) ctx.rotate(this.bank);
    ctx.drawImage(sprite, -s / 2, -s / 2, s, s);
    ctx.restore();

    // captured fighter rides behind (above) the boss, drawn upside-down
    if (this.hasCaptured) {
      ctx.save();
      ctx.translate(this.x, this.y - CAPTURE_OFFSET);
      ctx.rotate(Math.PI);
      ctx.drawImage(Sprites.playerCaptured, -13, -13, 26, 26);
      ctx.restore();
    }
  }

  // hitbox of the captured fighter, so the player can (tragically) shoot it
  capturedBox() {
    return { x: this.x, y: this.y - CAPTURE_OFFSET, w: 20, h: 20 };
  }
}

/* ======================= js/game.js ======================= */
/* ===========================================================================
 * game.js — the Game controller: state machine, spawning, AI scheduling,
 * capture/rescue, bonus stages, scoring, collisions, HUD and the main loop.
 * =========================================================================*/

// ---- entrance / flyby path templates (waypoints in canvas space) ----------
const mirrorWp = (wp) => wp.map((p) => ({ x: WIDTH - p.x, y: p.y }));

const ENTRANCE = {
  leftLoop: () => [
    { x: -40, y: 560 }, { x: 70, y: 500 }, { x: 160, y: 430 },
    { x: 205, y: 345 }, { x: 145, y: 300 }, { x: 75, y: 310 },
    { x: 120, y: 225 }, { x: 210, y: 180 },
  ],
  topLeft: () => [
    { x: 130, y: -40 }, { x: 185, y: 110 }, { x: 218, y: 235 },
    { x: 165, y: 320 }, { x: 85, y: 300 }, { x: 55, y: 205 },
    { x: 135, y: 150 }, { x: 215, y: 175 },
  ],
  // dive from the very top straight down the middle, split into a loop
  topDive: () => [
    { x: 224, y: -40 }, { x: 224, y: 130 }, { x: 224, y: 250 },
    { x: 150, y: 300 }, { x: 110, y: 230 }, { x: 170, y: 175 },
  ],
  // big sweeping S from the bottom-left
  sweepLeft: () => [
    { x: -40, y: 360 }, { x: 90, y: 300 }, { x: 200, y: 360 },
    { x: 260, y: 260 }, { x: 180, y: 200 }, { x: 100, y: 230 },
    { x: 150, y: 165 }, { x: 230, y: 175 },
  ],
  // tight spiral entering from the left
  spiralLeft: () => [
    { x: -40, y: 240 }, { x: 120, y: 210 }, { x: 200, y: 260 },
    { x: 200, y: 330 }, { x: 120, y: 340 }, { x: 90, y: 270 },
    { x: 150, y: 210 }, { x: 220, y: 180 },
  ],
};
ENTRANCE.rightLoop = () => mirrorWp(ENTRANCE.leftLoop());
ENTRANCE.topRight = () => mirrorWp(ENTRANCE.topLeft());
ENTRANCE.topDiveR = () => mirrorWp(ENTRANCE.topDive());
ENTRANCE.sweepRight = () => mirrorWp(ENTRANCE.sweepLeft());
ENTRANCE.spiralRight = () => mirrorWp(ENTRANCE.spiralLeft());
const ENTRANCE_NAMES = Object.keys(ENTRANCE);

// ---- dive flight-path styles. Each returns waypoints from the diver's
// current spot, usually exiting off the bottom (a couple peel off the top).
const DIVE_STYLES = {
  swoop(e, px, side) {
    return [
      { x: e.x, y: e.y }, { x: e.x + side * 38, y: e.y - 14 },
      { x: e.x - side * 30, y: e.y + 70 },
      { x: clamp(px + rand(-50, 50), 30, WIDTH - 30), y: e.y + 180 },
      { x: clamp(px + rand(-70, 70), 20, WIDTH - 20), y: HEIGHT - 120 },
      { x: clamp(px + rand(-90, 90), 10, WIDTH - 10), y: HEIGHT + 70 },
    ];
  },
  direct(e, px) { // fast, aggressive plunge straight at the player
    return [
      { x: e.x, y: e.y }, { x: lerp(e.x, px, 0.45), y: e.y + 100 },
      { x: px, y: HEIGHT * 0.62 }, { x: clamp(px + rand(-26, 26), 10, WIDTH - 10), y: HEIGHT + 60 },
    ];
  },
  zigzag(e, px, side) {
    const wp = [{ x: e.x, y: e.y }];
    let x = e.x;
    for (let i = 1; i <= 4; i++) {
      x = clamp(x + side * (i % 2 ? 78 : -78), 24, WIDTH - 24);
      wp.push({ x, y: e.y + i * 66 });
    }
    wp.push({ x: clamp(px, 10, WIDTH - 10), y: HEIGHT + 60 });
    return wp;
  },
  loop(e, px, side) {
    return [
      { x: e.x, y: e.y }, { x: e.x + side * 52, y: e.y - 30 },
      { x: e.x + side * 72, y: e.y + 32 }, { x: e.x, y: e.y + 56 },
      { x: e.x - side * 62, y: e.y + 12 }, { x: e.x - side * 8, y: e.y + 124 },
      { x: clamp(px + rand(-40, 40), 20, WIDTH - 20), y: HEIGHT - 110 },
      { x: clamp(px + rand(-60, 60), 10, WIDTH - 10), y: HEIGHT + 60 },
    ];
  },
  wideArc(e, px, side) {
    const far = side > 0 ? WIDTH - 30 : 30;
    return [
      { x: e.x, y: e.y }, { x: lerp(e.x, far, 0.5), y: e.y + 60 },
      { x: far, y: HEIGHT * 0.4 }, { x: lerp(far, px, 0.5), y: HEIGHT * 0.62 },
      { x: clamp(px + rand(-40, 40), 10, WIDTH - 10), y: HEIGHT + 60 },
    ];
  },
  strafe(e, px, side) { // drop, then run horizontally across the lower screen
    const y0 = HEIGHT * 0.5;
    return [
      { x: e.x, y: e.y }, { x: e.x, y: y0 - 40 },
      { x: side > 0 ? 30 : WIDTH - 30, y: y0 },
      { x: side > 0 ? WIDTH - 30 : 30, y: y0 + 26 },
      { x: clamp(px, 20, WIDTH - 20), y: y0 + 64 },
      { x: clamp(px, 10, WIDTH - 10), y: HEIGHT + 60 },
    ];
  },
  boomerang(e, px, side) { // dive in, hook across, peel back up off the top
    return [
      { x: e.x, y: e.y }, { x: clamp(px + side * 40, 20, WIDTH - 20), y: HEIGHT * 0.45 },
      { x: clamp(px - side * 60, 20, WIDTH - 20), y: HEIGHT * 0.6 },
      { x: clamp(px - side * 120, 10, WIDTH - 10), y: HEIGHT * 0.38 },
      { x: e.x - side * 40, y: 120 }, { x: e.x, y: -40 },
    ];
  },
  cross(e, px, side) { // cut diagonally to the opposite side
    return [
      { x: e.x, y: e.y }, { x: clamp(px, 20, WIDTH - 20), y: HEIGHT * 0.5 },
      { x: side > 0 ? WIDTH - 20 : 20, y: HEIGHT * 0.72 },
      { x: side > 0 ? 30 : WIDTH - 30, y: HEIGHT + 60 },
    ];
  },
  // end-of-stage: a Zako circles around the player before leaving
  circle(e, px, side) {
    const py = HEIGHT - 78;
    return [
      { x: e.x, y: e.y }, { x: clamp(px, 30, WIDTH - 30), y: py - 70 },
      { x: clamp(px + 64, 30, WIDTH - 30), y: py },
      { x: clamp(px, 30, WIDTH - 30), y: py + 48 },
      { x: clamp(px - 64, 30, WIDTH - 30), y: py },
      { x: clamp(px, 30, WIDTH - 30), y: py - 50 },
      { x: clamp(px, 10, WIDTH - 10), y: HEIGHT + 50 },
    ];
  },
  // Zako (bee): veer to the player and plunge, then turn at the bottom and come
  // back up to ambush "from behind", exiting off the top.
  beeDive(e, px, side) {
    return [
      { x: e.x, y: e.y }, { x: lerp(e.x, px, 0.5), y: e.y + 55 },
      { x: clamp(px, 24, WIDTH - 24), y: HEIGHT * 0.55 },
      { x: clamp(px, 24, WIDTH - 24), y: HEIGHT - 26 },          // dip past the player
      { x: clamp(px - side * 55, 24, WIDTH - 24), y: HEIGHT - 62 }, // turn around
      { x: clamp(px - side * 95, 20, WIDTH - 20), y: HEIGHT * 0.4 }, // rise back up
      { x: clamp(e.x, 20, WIDTH - 20), y: -40 },                 // exit the top
    ];
  },
};

// Canonical dive behaviour by enemy type: Zako -> bee ambush dive,
// Goei -> zig-zag, Boss Galaga -> loop then dive. Escorting Goeis fly like a boss.
const TYPE_DIVE = { [T_BEE]: 'beeDive', [T_BUTTERFLY]: 'zigzag', [T_BOSS]: 'loop' };

// transformed-enemy group bonus (for downing all three) and the per-stage rotation
const TRANSFORM_BONUS = { [T_OGAWAMUSHI]: 1000, [T_EI]: 2000, [T_GALBOSS]: 3000 };
function transformTypeForStage(stage) {
  // transform type advances after each challenging stage: 4-6 Ogawa, 8-10 Ei, 12-14 Galboss, …
  return [T_OGAWAMUSHI, T_EI, T_GALBOSS][Math.max(0, Math.floor((stage - 3) / 4)) % 3];
}

// the 8 challenging-stage line-ups (one enemy type each) + per-wave clear bonus
const CHALLENGE_TYPES = [
  { type: T_BEE, bonus: 1000 }, { type: T_BUTTERFLY, bonus: 1000 },
  { type: T_TONBO, bonus: 1500 }, { type: T_OGAWAMUSHI, bonus: 1500 },
  { type: T_MOMIJI, bonus: 2000 }, { type: T_EI, bonus: 2000 },
  { type: T_GALBOSS, bonus: 3000 }, { type: T_ENTERPRISE, bonus: 3000 },
];

// deterministic per-stage RNG so a given stage always plays the same way
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = (rng() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Builds a distinct behaviour profile for any stage (1..255 and beyond).
// Difficulty scalars ramp then saturate; style selection cycles for variety.
function stageProfile(stage) {
  const rng = mulberry32(stage * 2654435761 + 12345);
  const ds = Math.min(stage, 255);          // difficulty stage (saturates at 255)
  const d = clamp((ds - 1) / 160, 0, 1);    // 0..1 ramp, spread over ~160 stages

  // dive styles unlock as stages progress, then we pick a 2-3 style subset
  const pool = ['swoop'];
  if (ds >= 3) pool.push('loop');
  if (ds >= 6) pool.push('zigzag');
  if (ds >= 10) pool.push('wideArc');
  if (ds >= 16) pool.push('strafe');
  if (ds >= 24) pool.push('cross');
  if (ds >= 34) pool.push('direct');
  if (ds >= 44) pool.push('boomerang');
  const k = Math.min(pool.length, 2 + ((stage % 3 === 0) ? 1 : 0));
  const diveStyles = shuffled(pool, rng).slice(0, k);

  // entrance templates: a rotating set of 3-4 patterns per stage
  const entrances = shuffled(ENTRANCE_NAMES, rng).slice(0, 3 + (ds >= 12 ? 1 : 0));

  // extra enemies that ride in WITH a wave then peel off mid-entrance to dive
  const convoyMax = 1 + Math.floor(ds / 90); // 1..3, ramps slowly
  const convoyChargersPerWave = [];
  for (let w = 0; w < 5; w++) convoyChargersPerWave.push(Math.floor(rng() * (convoyMax + 1)));

  // formation movement flavour (varies which way the swarm "breathes"/drifts)
  const sway = {
    swayAmp: 8 + rng() * 9,
    swaySpeed: 1.1 + rng() * 0.8,
    breatheAmp: 0.03 + rng() * 0.05,
    driftAmp: ds >= 8 ? rng() * (4 + d * 14) : 0,
    driftSpeed: 0.3 + rng() * 0.5,
    bobAmp: ds >= 20 ? rng() * (2 + d * 5) : 0,
    bobSpeed: 0.7 + rng() * 0.5,
  };

  return {
    stage,
    diveStyles,
    entrances,
    sway,
    // difficulty scalars -- gentle, gradual ramp so mid-game stays fair
    enterSpeed: 150 + Math.min(ds, 120) * 1.1,
    diveSpeedMul: 1 + d * 0.5,                  // up to ~1.5x at very late stages
    bombsMin: ds < 24 ? 1 : 2,
    bombsMax: 2 + Math.round(d * 2),            // up to 4
    bombSpeedMul: 1 + d * 0.4,                  // up to 1.4x
    bombSpread: 0.14 + d * 0.14,                // up to ~0.28
    volley: ds >= 70 && rng() < 0.3,           // 3-bomb volleys only late, and rare
    attackInterval: clamp(2.4 - 0.03 * ds, 0.85, 2.4), // never frantically fast
    maxDivers: Math.min(1 + Math.floor(ds / 22), 5),   // +1 attacker every 22 stages
    captureChance: clamp(0.3 + d * 0.3, 0, 0.6),
    captureCooldown: clamp(13 - ds * 0.06, 7, 13),
    escortMax: ds < 12 ? 0 : ds < 36 ? 1 : ds < 90 ? 2 : 3,
    bonusPattern: stage % 3,                   // which challenging-stage layout
    convoyChargersPerWave,
    earlyChargers: Math.min(1 + Math.floor(ds / 24), 4), // side raiders, spawned 1 at a time
  };
}

const DEFAULT_PROFILE = stageProfile(1);

// The 5-row formation layout: 4 bosses, 16 butterflies, 20 bees = 40 enemies.
// The canonical Galaga formation as rows, each a single type, so every entrance
// wave is one uniform type: 4 Boss Galagas, 16 Butterflies, 20 Bees = 40.
//   row 0: 4 bosses (centre)   rows 1-2: 8 butterflies each   rows 3-4: 10 bees each
function formationRows() {
  const rows = [];
  rows.push([3, 4, 5, 6].map((c) => ({ type: T_BOSS, col: c, row: 0 })));
  for (let r = 1; r <= 2; r++) {
    const row = [];
    for (let c = 1; c <= 8; c++) row.push({ type: T_BUTTERFLY, col: c, row: r });
    rows.push(row);
  }
  for (let r = 3; r <= 4; r++) {
    const row = [];
    for (let c = 0; c <= 9; c++) row.push({ type: T_BEE, col: c, row: r });
    rows.push(row);
  }
  return rows;
}

// greedily express a stage number as flag badges
function stageBadges(stage) {
  const denom = [50, 30, 20, 10, 5, 1];
  const out = [];
  let n = stage;
  for (const d of denom) {
    while (n >= d) { out.push(d); n -= d; }
  }
  return out;
}

// selectable life modes shown on the title screen
const LIFE_MODES = [
  { name: '3 LIVES', lives: 3, infinite: false },
  { name: '1 LIFE', lives: 1, infinite: false },
  { name: 'INFINITE', lives: Infinity, infinite: true },
];

// title-screen enemy guide: sprite, name, point values, and a little lore
const ENCYCLOPEDIA = [
  { sprite: 'bee', name: 'ZAKO (BEE)', pts: '50 / 100', desc: [
    'The rank-and-file of the swarm; 20',
    'fill the bottom rows. They veer to',
    'your position and plunge, then turn',
    'at the bottom to ambush from behind.'] },
  { sprite: 'butterfly', name: 'GOEI (BUTTERFLY)', pts: '80 / 160', desc: [
    'Sixteen form the middle rows. They',
    'dive in a zig-zag toward you, and',
    'escort a Boss Galaga, flying like it',
    'while on guard duty.'] },
  { sprite: 'boss', name: 'BOSS GALAGA', pts: '150 / 400 / 800 / 1600', desc: [
    'Four command the top row. Takes two',
    'hits (turns blue). Alternates a',
    'loop-dive with escorts and a tractor',
    'beam that captures your fighter.'] },
  { sprite: 'playerCaptured', name: 'CAPTURED FIGHTER', pts: '500 / 1000', desc: [
    'Your abducted ship. Free it by',
    'downing its Boss mid-dive for a Dual',
    'Fighter -- or shoot it down (for',
    'points) and lose it for good.'] },
  { sprite: 'ogawamushi', name: 'OGAWAMUSHI', pts: '160  /  1000 (trio)', desc: [
    'A transformed trio (stages 4-6).',
    'Flies in single file, dropping to',
    'one side then straight down, leaving',
    'the opposite way.'] },
  { sprite: 'ei', name: 'EI (MIDORI)', pts: '160  /  2000 (trio)', desc: [
    'A transformed trio (stages 8-10).',
    'Forms a diagonal line that fans out',
    'as it turns, making the group harder',
    'to shoot down.'] },
  { sprite: 'galboss', name: 'GALBOSS', pts: '160  /  3000 (trio)', desc: [
    'A transformed trio (stages 12-14).',
    'One emerges first, then two more pop',
    'out at a sharper angle. A veteran',
    'from Galaxian.'] },
  { sprite: 'tonbo', name: 'TONBO', pts: '160', desc: [
    'A dragonfly seen only in the 3rd',
    'challenging stage. Never attacks --',
    'just a target in the shooting',
    'gallery.'] },
  { sprite: 'momiji', name: 'MOMIJI', pts: '160', desc: [
    'A maple leaf from the 5th',
    'challenging stage. Drifts across the',
    'screen for points and never fires',
    'back.'] },
  { sprite: 'enterprise', name: 'SPACESHIP', pts: '160', desc: [
    'A starship cameo in the 8th',
    'challenging stage. A rare bonus',
    'target -- shoot it before it leaves',
    'the screen.'] },
  { sprite: 'raider', name: 'RAIDER  (custom)', pts: '100 / 160', desc: [
    'Our own addition: lone hornets that',
    'sweep in from the edges to harass',
    'you, then peel off. They are never',
    'part of the formation.'] },
];

// title-screen power-up guide (second tab of the gallery)
const POWER_GUIDE = [
  { type: 'spread', name: 'SPREAD', desc: [
    'Fires a 3-way spread shot: one',
    'straight ahead plus two angled',
    'outward, for much wider coverage.'] },
  { type: 'pierce', name: 'PIERCE', desc: [
    'Shots punch straight through',
    'enemies instead of stopping --',
    'great against columns and waves.'] },
  { type: 'rapid', name: 'RAPID', desc: [
    'Doubles your fire rate and the',
    'on-screen shot limit for a',
    'relentless stream of bullets.'] },
  { type: 'shield', name: 'SHIELD', desc: [
    'A bubble that absorbs one hit',
    'and blocks the tractor beam',
    'while it is active.'] },
  { type: 'speed', name: 'SPEED', desc: [
    'Boosts your movement speed by',
    'about 1.7x for sharper dodging',
    'and repositioning.'] },
  { type: 'hunter', name: 'HUNTER', desc: [
    'Your shots home in on the',
    'nearest enemy, curving to',
    'track and strike it.'] },
  { type: 'slow', name: 'SLOW-MO', desc: [
    'Slows the WHOLE game down -- you,',
    'enemies, bombs and all -- giving',
    'far more time to read and react.'] },
  { type: 'double', name: 'DOUBLE', desc: [
    'All points you score are worth',
    'double while it is active --',
    'rack up the high score fast.'] },
];

// ===========================================================================
class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.ctx.imageSmoothingEnabled = false;

    this.stars = new Starfield(90);
    this.high = parseInt(localStorage.getItem('galaga_high') || '0', 10) || 0;

    this.input = { left: false, right: false, fire: false };
    this.time = 0;
    this.menuIndex = 0;        // selected life mode on the title screen
    this.startStage = 1;       // chosen starting stage (1-255)
    this.galleryIndex = 0;     // selected entry in the guide
    this.galleryTab = 0;       // 0 = enemies, 1 = power-ups
    this.pauseIndex = 0;       // selected item in the pause menu
    this.infinite = false;

    // accessibility: reduced-flash mode (persisted) + screen-reader live region
    this.reducedFlash = localStorage.getItem('galaga_reducedflash') === '1';
    ANIM.reducedFlash = this.reducedFlash;
    this.srEl = document.getElementById('sr');
    this.lastAnnounce = '';
    this.flash = { a: 0, color: '#fff' }; // full-screen flash juice (skipped in reduced-flash)
    this.timeScale = 1; // eased slow-mo factor (Slow power ramps this toward 0.5)

    this.resetToAttract();
    this.bindInput();

    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  resetToAttract() {
    this.mode = 'attract';
    this.modeTimer = 0;
    this.score = 0;
    this.lives = 0;
    this.stage = 0;
    this.player = null;
    this.enemies = [];
    this.bullets = [];
    this.bombs = [];
    this.explosions = [];
    this.popups = [];
    this.powerups = [];
    this.freed = null;
    this.pendingDual = false;
    this.captureActive = false;
    this.capturingBoss = null;
    this.respawnTimer = 0;
    this.isBonus = false;
    this.fireFreeze = 0;
    this.transformGroups = {};
    this.transformsLeft = 0;
    this.finalAttack = false;
  }

  // ---- input ------------------------------------------------------------
  bindInput() {
    const down = (e) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' '].includes(k))
        e.preventDefault();
      Sound.init();
      Sound.resume();
      // guide (gallery) captures input while open: ←→ browse, ↑↓ switch tab
      if (this.mode === 'gallery') {
        if (k === 'arrowleft' || k === 'a') this.galleryNav(-1);
        else if (k === 'arrowright' || k === 'd') this.galleryNav(1);
        else if (k === 'arrowup' || k === 'arrowdown') this.galleryTabSwitch();
        else if (k === 'e' || k === 'enter' || k === 'escape' || k === 'backspace') this.mode = 'attract';
        return;
      }
      if (k === 'e' && (this.mode === 'attract' || this.mode === 'gameover')) {
        this.mode = 'gallery'; this.galleryIndex = 0; this.galleryTab = 0; Sound.coin(); return;
      }
      // pause menu captures input while paused
      if (this.mode === 'paused') {
        if (k === 'p') this.togglePause();
        else this.pauseMenuKey(k);
        return;
      }
      if (k === 'f') { this.setReducedFlash(!this.reducedFlash); return; } // quick toggle
      if (k === 'arrowleft' || k === 'a') { this.input.left = true; this.onStageKey(-1); }
      if (k === 'arrowright' || k === 'd') { this.input.right = true; this.onStageKey(1); }
      if (k === ' ') this.input.fire = true;
      if (k === 'arrowup' || k === 'arrowdown') this.onMenuKey(k);
      if (k === 'enter') this.onStartKey();
      if (k === 'p') this.togglePause();
    };
    const up = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') this.input.left = false;
      if (k === 'arrowright' || k === 'd') this.input.right = false;
      if (k === ' ') this.input.fire = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
  }

  onMenuKey(k) {
    if (this.mode !== 'attract' && this.mode !== 'gameover') return;
    const dir = k === 'arrowup' ? -1 : 1;
    this.menuIndex = (this.menuIndex + dir + LIFE_MODES.length) % LIFE_MODES.length;
    Sound.bonusTick();
  }

  // pick the starting stage on the title screen (held arrows repeat)
  onStageKey(dir) {
    if (this.mode !== 'attract' && this.mode !== 'gameover') return;
    const next = clamp(this.startStage + dir, 1, 255);
    if (next === this.startStage) return; // already at the limit -> no tick
    this.startStage = next;
    Sound.bonusTick();
  }

  // the entry list for the current guide tab
  galleryList() { return this.galleryTab === 1 ? POWER_GUIDE : ENCYCLOPEDIA; }

  // browse within the current tab
  galleryNav(dir) {
    const n = this.galleryList().length;
    this.galleryIndex = (this.galleryIndex + dir + n) % n;
    Sound.bonusTick();
  }

  // switch between Enemies and Power-Ups
  galleryTabSwitch() {
    this.galleryTab = this.galleryTab === 0 ? 1 : 0;
    this.galleryIndex = 0;
    Sound.coin();
  }

  onStartKey() {
    if (this.mode === 'attract' || this.mode === 'gameover' || this.mode === 'complete')
      this.startGame();
  }

  togglePause() {
    if (this.mode === 'playing') {
      this.prevMode = this.mode; this.mode = 'paused'; this.pauseIndex = 0;
      this.announce('Paused. Resume, Restart, Reduced flash, or Quit.');
    } else if (this.mode === 'paused') {
      this.mode = this.prevMode || 'playing';
      this.announce('Resumed.');
    }
  }

  // pause-menu items; some toggle in place, others act
  pauseItems() {
    return ['RESUME', 'RESTART', 'REDUCED FLASH: ' + (this.reducedFlash ? 'ON' : 'OFF'), 'QUIT TO TITLE'];
  }

  pauseMenuKey(k) {
    if (k === 'arrowup' || k === 'arrowdown') {
      const n = 4;
      this.pauseIndex = (this.pauseIndex + (k === 'arrowup' ? -1 : 1) + n) % n;
      Sound.bonusTick();
    } else if (k === 'enter') {
      if (this.pauseIndex === 0) this.togglePause();              // resume
      else if (this.pauseIndex === 1) { this.startGame(); }       // restart run
      else if (this.pauseIndex === 2) this.setReducedFlash(!this.reducedFlash);
      else { this.resetToAttract(); this.announce('Quit to title.'); } // quit
    }
  }

  setReducedFlash(on) {
    this.reducedFlash = on;
    ANIM.reducedFlash = on;
    localStorage.setItem('galaga_reducedflash', on ? '1' : '0');
    this.flashMute = 'REDUCED FLASH ' + (on ? 'ON' : 'OFF'); // brief on-screen toast
    this.flashMuteT = 1.4;
    this.announce('Reduced flash ' + (on ? 'on' : 'off') + '.');
  }

  // one-shot full-screen colour flash (a brief fade, not a strobe). Reduced-flash
  // mode skips these, so the setting makes a clear, visible difference.
  triggerFlash(color, a = 0.45) {
    if (this.reducedFlash) return;
    this.flash.color = color;
    this.flash.a = Math.max(this.flash.a, a);
  }

  // true when blinking should be shown "lit" this frame (steady if reduced-flash)
  blinkOn() {
    return this.reducedFlash || Math.floor(this.time * 2) % 2 === 0;
  }

  // post a short message to the screen-reader live region
  announce(msg) {
    if (this.srEl && msg !== this.lastAnnounce) { this.srEl.textContent = msg; this.lastAnnounce = msg; }
  }

  // ---- game / stage setup ----------------------------------------------
  startGame() {
    const mode = LIFE_MODES[this.menuIndex];
    this.infinite = mode.infinite;
    this.score = 0;
    this.lives = mode.lives;
    this.stage = clamp(this.startStage, 1, 255) - 1; // nextStage() bumps to the chosen stage
    this.enemies = [];
    this.bullets = [];
    this.bombs = [];
    this.explosions = [];
    this.popups = [];
    this.powerups = [];
    this.freed = null;
    this.pendingDual = false;
    this.captureActive = false;
    this.player = new Player();
    this.nextStage();
    Sound.coin();
  }

  nextStage() {
    this.stage++;
    if (this.stage > 255) { this.gameComplete(); return; } // Galaga tops out at 255
    this.profile = stageProfile(this.stage);
    Object.assign(FORMATION, this.profile.sway); // per-stage swarm movement
    this.enemies = [];
    this.bombs = [];
    this.bullets = [];
    // note: this.powerups is intentionally NOT cleared -- a capsule from the
    // previous stage keeps falling and stays collectible into this one
    this.playTime = 0;
    this.attackTimer = 2.5;
    this.captureCd = this.profile.captureCooldown;
    this.isBonus = this.stage >= 3 && (this.stage - 3) % 4 === 0; // 3, 7, 11, 15, …
    this.raidersLeft = this.isBonus ? 0 : this.profile.earlyChargers; // side raiders to spawn
    this.raiderTimer = 3.0;   // first one ~3s in, then spread out
    this.raiderIndex = 0;
    // transformed-enemy events (stages 4+, normal stages only)
    this.transformGroups = {};
    this.transformGroupSeq = 0;
    this.transformsLeft = (!this.isBonus && this.stage >= 4) ? randInt(1, 2) : 0;
    this.transformTimer = rand(6, 9);
    this.finalAttack = false;   // end-of-stage all-out assault

    if (!this.player) this.player = new Player();
    else { this.player.state = 'spawning'; this.player.t = 0; this.player.invuln = 1.0; }

    // a rescue still owed when the stage ended carries over as a dual fighter
    if (this.pendingDual && this.player) {
      this.player.dual = true;
      this.pendingDual = false;
      this.freed = null;
    }

    if (this.isBonus) {
      this.buildBonus();
      this.bonusHits = 0;
      this.mode = 'ready';
      this.modeTimer = 2.2;
      this.bannerMain = 'CHALLENGING STAGE';
      this.bannerSub2 = this.bonusName; // the enemy line-up for this stage
      this.announce('Challenging stage ' + this.stage + ', ' + this.bonusName + '.');
    } else {
      this.buildFormation();
      this.mode = 'ready';
      this.modeTimer = 2.0;
      this.bannerMain = 'STAGE ' + this.stage;
      this.announce('Stage ' + this.stage + '. Lives ' + (this.infinite ? 'infinite' : this.lives) + '.');
    }
    Sound.stage();
  }

  // Build one entrance line along `path`: the formation enemies for `specs`
  // plus `nChargers` extra convoy chargers, shuffled together and evenly spaced
  // so the chargers look like ordinary members until they peel off mid-path.
  // Charger types are drawn from this wave's own enemies (any type, incl. bosses)
  // so they blend in. Formation enemies are added to `formed` (carrier pool).
  addWaveLine(path, specs, nChargers, startDelay, formed) {
    const prof = this.profile;
    const members = specs.map((spec) => ({ spec, charger: false }));
    const pool = specs.map((s) => s.type); // a uniform line -> chargers match it
    for (let c = 0; c < nChargers; c++) {
      members.push({ spec: { type: choice(pool), col: 0, row: 0 }, charger: true });
    }
    const order = shuffled(members, Math.random); // intersperse the chargers
    order.forEach((m, k) => {
      const e = new Enemy(m.spec.type, m.spec.col, m.spec.row);
      if (m.charger) { e.convoyCharge = true; e.chargeFrac = rand(0.45, 0.6); }
      e.startEnter(path, prof.enterSpeed, startDelay + k * 0.18); // evenly spaced
      this.enemies.push(e);
      if (!m.charger) formed.push(e);
    });
  }

  buildFormation() {
    const rows = formationRows();
    const prof = this.profile;
    const ents = prof.entrances;
    const formed = []; // the 40 formation enemies (carriers come from these)

    // Each entrance wave is a single formation row (one uniform type).
    let w = 0;
    for (let r = 0; r < rows.length; r++, w++) {
      const baseWp = ENTRANCE[ents[w % ents.length]]();
      const pathA = new Path(baseWp);
      const startDelay = w * 1.5;
      // chargers ride in WITH the wave then peel off mid-entrance
      const cBase = prof.convoyChargersPerWave[w % prof.convoyChargersPerWave.length] || 0;
      this.addWaveLine(pathA, rows[r], cBase, startDelay, formed);
    }

    // 1-2 flashing carriers (from the formation only), always distinct powers
    const carriers = shuffled(formed, Math.random).slice(0, randInt(1, 2));
    const bag = shuffled(POWER_TYPES, Math.random);
    carriers.forEach((c, i) => { c.carrier = true; c.power = bag[i % bag.length]; });
  }

  // A single side raider sweeps in from one edge, dives, and peels off for good.
  // Spawned one at a time on a timer (see update), so they spread through the
  // stage instead of arriving as a clump.
  spawnSideRaider() {
    const fromLeft = this.raiderIndex % 2 === 0;     // alternate entry sides
    const fromX = fromLeft ? rand(55, 150) : WIDTH - rand(55, 150);
    const dir = fromX < WIDTH / 2 ? 1 : -1;
    const path = new Path([
      { x: fromX, y: -40 },
      { x: clamp(fromX + dir * 50, 20, WIDTH - 20), y: 110 },
      { x: clamp(fromX - dir * 30, 20, WIDTH - 20), y: 250 },
    ]);
    const e = new Enemy(choice([T_BEE, T_BUTTERFLY]), 0, 0);
    e.raider = true;
    e.sideRaider = true;     // distinct raider sprite
    e.earlyCharge = true;    // dive at the end of this short entrance
    e.startEnter(path, this.profile.enterSpeed * 1.15, 0);
    this.enemies.push(e);
    this.raiderIndex++;
  }

  // one of three challenging-stage flyby layouts, chosen per stage
  bonusPath(w) {
    const p = this.profile.bonusPattern;
    if (p === 1) {
      // serpentine columns that dive from the top down to the floor and back up
      const cx = 60 + (w % 5) * 80;
      const wp = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const y = lerp(-40, BONUS_FLOOR, Math.sin(t * Math.PI)); // arch: top -> floor -> top
        wp.push({ x: cx + Math.sin(t * Math.PI * 3 + w) * 70, y });
      }
      return new Path(wp);
    }
    if (p === 2) {
      // diagonal arch from one top corner down to the floor and out the other
      const fromLeft = w % 2 === 0;
      return new Path([
        { x: fromLeft ? -40 : WIDTH + 40, y: -30 },
        { x: fromLeft ? 150 : WIDTH - 150, y: 200 },
        { x: WIDTH / 2, y: BONUS_FLOOR },
        { x: fromLeft ? WIDTH - 150 : 150, y: 200 },
        { x: fromLeft ? WIDTH + 40 : -40, y: -30 },
      ]);
    }
    // pattern 0: horizontal sine sweeps from alternating sides
    const fromLeft = w % 2 === 0;
    const y0 = 120 + (w % 4) * 70;
    const wp = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      const x = fromLeft ? lerp(-50, WIDTH + 50, t) : lerp(WIDTH + 50, -50, t);
      wp.push({ x, y: y0 + Math.sin(t * Math.PI * 2 + w) * 60 });
    }
    return new Path(wp);
  }

  buildBonus() {
    // A challenging stage: one enemy type (rotating through 8 line-ups) plus
    // four Boss Galagas, in 5 waves of 8. They fly through and never attack.
    // challenging stages run 3, 7, 11, … so this is the (n-1)th one, cycling 0..7
    const ci = (Math.floor((this.stage - 3) / 4) % CHALLENGE_TYPES.length + CHALLENGE_TYPES.length) % CHALLENGE_TYPES.length;
    const spec = CHALLENGE_TYPES[ci];
    this.bonusType = spec.type;
    this.bonusWaveBonus = spec.bonus;
    this.bonusWaveShot = [0, 0, 0, 0, 0];   // enemies the player has downed per wave
    this.bonusName = spec.type.toUpperCase();
    const speed = 135 + Math.min(this.stage, 80) * 2;
    for (let w = 0; w < 5; w++) {
      const path = this.bonusPath(w);
      for (let i = 0; i < 8; i++) {
        const isBoss = i === 0 && w < 4; // one Boss in each of the first four waves
        const e = new Enemy(isBoss ? T_BOSS : spec.type, 0, 0);
        e.bonusWave = w;
        e.startFlyby(path, speed, w * 1.1 + i * 0.22);
        this.enemies.push(e);
      }
    }
  }

  // ---- spawning helpers -------------------------------------------------
  spawnBomb(enemy) {
    if (!this.player || this.player.state !== 'alive') return;
    if (this.fireFreeze > 0) return; // enemies are holding fire (boss just downed)
    const prof = this.profile || DEFAULT_PROFILE;
    const sp = (190 + Math.min(this.stage, 80) * 3) * (prof.bombSpeedMul || 1);
    const fire = (extra) => {
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      const len = Math.hypot(dx, dy) || 1;
      const spread = rand(-prof.bombSpread, prof.bombSpread) + extra;
      const ca = Math.cos(spread), sa = Math.sin(spread);
      const vx = (dx / len) * sp, vy = (dy / len) * sp;
      this.bombs.push(new Bomb(enemy.x, enemy.y + 8, vx * ca - vy * sa, Math.max(80, vx * sa + vy * ca)));
    };
    if (prof.volley) { fire(-0.3); fire(0); fire(0.3); } // 3-bomb spray
    else fire(0);
  }

  // ---- attack scheduling ------------------------------------------------
  formationEnemies() {
    return this.enemies.filter((e) => e.state === 'formation');
  }

  launchAttack() {
    const form = this.formationEnemies();
    if (form.length === 0) return;
    const prof = this.profile;

    // Boss Galagas alternate two behaviours: (1) loop-dive (with optional Goei
    // escorts) and (2) the tractor beam. They use ONLY behaviour 1 while a
    // fighter is captured, you have a Dual Fighter, or the formation has broken
    // up (most of the swarm destroyed).
    const swarmLeft = this.enemies.filter((e) => !e.raider && !e.convoyCharge).length;
    const formationBroken = swarmLeft < 10;
    const beamAllowed = this.captureCd <= 0 && this.player &&
      this.player.state === 'alive' && !this.player.dual &&
      !this.captureActive && !formationBroken;

    // send a burst of divers; the burst size grows with the stage
    const n = randInt(1, prof.maxDivers);
    const chosen = shuffled(form, Math.random).slice(0, n);
    let beamedThisWave = false;
    for (const attacker of chosen) {
      if (attacker.state !== 'formation') continue; // may already be diving as an escort
      if (attacker.type === T_BOSS) {
        // alternate beam <-> loop-dive (one beam per attack wave)
        if (attacker.wantsBeam && beamAllowed && !beamedThisWave) {
          attacker.wantsBeam = false;
          attacker.startBeam(this);
          this.captureCd = prof.captureCooldown;
          beamedThisWave = true;
        } else {
          attacker.wantsBeam = true; // next time this boss attacks, try the beam
          attacker.escorts = [];
          const pool = form.filter(
            (e) => e.type === T_BUTTERFLY && e.state === 'formation' &&
              Math.abs(e.col - attacker.col) <= 2 && !chosen.includes(e)
          );
          const nE = Math.min(pool.length, prof.escortMax);
          for (let i = 0; i < nE; i++) {
            const esc = pool.splice((Math.random() * pool.length) | 0, 1)[0];
            esc.isEscort = true;
            esc.startDive(this, true); // escorts fly like the boss (see startDive)
            attacker.escorts.push(esc);
          }
          attacker.startDive(this, true);
        }
      } else {
        attacker.startDive(this, true); // Zako/Goei use their own dive shapes
      }
    }
  }

  // ---- capture / rescue -------------------------------------------------
  capturePlayer(boss) {
    if (this.captureActive) return;
    this.captureActive = true;
    this.capturingBoss = boss;
    this.player.state = 'captured';
    this.player.captureBoss = boss;
    this.captureFinalized = false;
    this.captureTimer = 0;
    boss.beamPhase = 'capturing'; // freeze the boss so the pilot can dock
    boss.beamOpen = 1;
    this.triggerFlash('#9fd0ff', 0.5); // capture flash
    this.announce('Fighter captured! Shoot that boss when it dives to rescue it.');
    Sound.capture();
  }

  finalizeCapture() {
    this.captureFinalized = true;
    const boss = this.capturingBoss;
    if (boss) {
      boss.hasCaptured = true;
      boss.beamPhase = 'close';   // resume: close beam, fly back carrying the ship
      boss.beamTimer = 0;
    }
    this.player.state = 'gone';
    this.player = null;
    this.lives--;
    if (this.lives <= 0) {
      this.gameOver();
    } else {
      this.respawnTimer = 1.6;
    }
  }

  releaseCapturedShip(boss) {
    this.captureActive = false;
    this.capturingBoss = null;
    boss.hasCaptured = false;
    this.freed = { x: boss.x, y: boss.y - CAPTURE_OFFSET, vy: 90 };
    this.pendingDual = true; // rescue is owed; survives death & stage changes
    this.addPopup(boss.x, boss.y, 'FIGHTER FREED');
    Sound.rescue();
  }

  // friendly fire: the player shot their own abducted ship -> gone for good
  destroyCapturedShip(boss) {
    boss.hasCaptured = false;
    this.captureActive = false;   // the held fighter is destroyed, not rescuable
    this.capturingBoss = null;
    this.pendingDual = false;
    this.freed = null;
    // it still yields points (500 in formation, 1000 if the boss was diving)
    const diving = ['dive', 'beam', 'return'].includes(boss.state);
    this.addScore(diving ? 1000 : 500);
    this.explosions.push(new Explosion(boss.x, boss.y - CAPTURE_OFFSET, false));
    this.addPopup(boss.x, boss.y - CAPTURE_OFFSET, 'LOST! ' + (diving ? 1000 : 500), '#ff3b5c');
    Sound.playerDie();
  }

  // Move a freed fighter toward the player; it waits if the player is gone so
  // a rescue is never lost to a death or a stage change mid-flight.
  updateFreed(dt) {
    if (!this.freed) return;
    const p = this.player;
    const dockable = p && (p.state === 'alive' || p.state === 'spawning');
    if (dockable) {
      this.freed.x = lerp(this.freed.x, p.x, dt * 4);
      if (this.freed.y < p.y - 4) this.freed.y += this.freed.vy * dt;
      if (this.freed.y >= p.y - 4) {
        p.dual = true;
        p.invuln = Math.max(p.invuln, 0.6);
        this.addScore(1000);
        this.addPopup(p.x, p.y - 20, '1000', '#ffd23f');
        this.freed = null;
        this.pendingDual = false;
        this.announce('Dual fighter! Two ships now.');
      }
    } else {
      // no fighter to dock with yet (dead/respawning): glide to a hover and wait
      const hoverY = PLAYER_Y - 24;
      if (this.freed.y < hoverY) this.freed.y += this.freed.vy * dt;
    }
  }

  // Falling power-up capsules: keep dropping and get collected on touch. Called
  // during play AND the stage-clear / ready banners, so a capsule from the last
  // enemy keeps falling and stays collectible across the stage change.
  updatePowerups(dt) {
    for (const pu of this.powerups) pu.update(dt);
    const p = this.player;
    if (p && (p.state === 'alive' || p.state === 'spawning')) {
      for (const pu of this.powerups) {
        if (pu.dead) continue;
        for (const box of p.boxes()) {
          if (aabb(pu, box)) { pu.dead = true; this.applyPower(pu.type); break; }
        }
      }
    }
    this.powerups = this.powerups.filter((pu) => !pu.dead);
  }

  // ---- score / popups ---------------------------------------------------
  addScore(n) {
    if (this.player && this.player.hasPower('double')) n *= 2; // Double power-up
    this.score += n;
    if (this.score > this.high) this.high = this.score;
  }
  addPopup(x, y, text, color = '#18e0ff') {
    this.popups.push({ x, y, text, color, t: 0, dur: 1.1 });
  }

  // ---- enemy destruction ------------------------------------------------
  killEnemy(e) {
    e.killed = true;

    // shot the capturing boss before the pull finished -> save the pilot
    if (e === this.capturingBoss && this.captureActive && !e.hasCaptured) {
      if (this.player && this.player.state === 'captured') {
        this.player.state = 'alive';
        this.player.captureBoss = null;
        this.player.invuln = 0.8;
      }
      this.captureActive = false;
      this.capturingBoss = null;
    }

    this.explosions.push(new Explosion(e.x, e.y, e.type === T_BOSS));
    Sound.enemyHit();

    const diving = ['dive', 'beam', 'return'].includes(e.state) || e.isEscort;
    let pts, popupCol = e.type === T_BOSS ? '#ffd23f' : '#fff';
    if (e.captive) {
      pts = diving ? 1000 : 500;                          // shot your own freed fighter
      popupCol = '#18e0ff';
    } else if (e.transformGroup) {
      pts = 160;                                          // transformed enemies are flat 160
    } else if (e.type === T_BOSS && diving) {
      const aliveEscorts = (e.escorts || []).filter(
        (x) => !x.killed && !x.dead && (x.state === 'dive' || x.isEscort)
      ).length;
      pts = 400 * Math.pow(2, Math.min(2, aliveEscorts)); // 400 / 800 / 1600
    } else {
      pts = e.points(diving);
    }
    this.addScore(pts);
    // show the points, plus an x2 tag (in the Double colour) when it's active
    if (this.player && this.player.hasPower('double'))
      this.addPopup(e.x, e.y, pts + ' x2', POWER_COLORS.double);
    else
      this.addPopup(e.x, e.y, '' + pts, popupCol);

    // canonical: downing a Boss Galaga mid-dive makes all enemies hold fire briefly
    if (e.type === T_BOSS && diving) { this.fireFreeze = 3.0; this.triggerFlash('#ffffff', 0.5); }

    // shot the capturing boss: mid-dive -> rescue; in formation -> the captive
    // breaks loose and turns hostile
    if (e.hasCaptured) {
      if (diving) this.releaseCapturedShip(e);
      else this.detachCaptive(e);
    }

    // transformed trio: award the group bonus once all three are gone
    if (e.transformGroup) this.onTransformKilled(e);

    // a flashing carrier drops its power-up capsule
    if (e.carrier && e.power) this.powerups.push(new PowerUp(e.x, e.y, e.power));

    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
  }

  // boss shot while still holding the captive in formation -> it turns hostile
  detachCaptive(boss) {
    boss.hasCaptured = false;
    this.captureActive = false;
    this.capturingBoss = null;
    const e = new Enemy(T_BEE, 0, 0);
    e.captive = true;
    e.raider = true;          // it never rejoins a formation slot
    e.x = boss.x;
    e.y = boss.y - CAPTURE_OFFSET;
    e.state = 'formation';
    e.startDive(this, true);
    this.enemies.push(e);
  }

  // ---- transformed enemies (stages 4+) ----------------------------------
  // A formation Zako (or Goei if few Zakos remain) morphs into a trio that
  // dives together for a group bonus.
  triggerTransform() {
    const form = this.enemies.filter(
      (e) => e.state === 'formation' && !e.raider && !e.convoyCharge && !e.captive && !e.transformGroup
    );
    if (form.length < 6) return; // need a reasonably intact formation
    const bees = form.filter((e) => e.type === T_BEE);
    const origin = (bees.length > 3 ? choice(bees) : choice(form));
    const ttype = transformTypeForStage(this.stage);
    const gid = ++this.transformGroupSeq;
    const ox = origin.x, oy = origin.y;
    const side = ox < WIDTH / 2 ? 1 : -1;
    const info = { col: origin.col, row: origin.row, type: origin.type };
    const oi = this.enemies.indexOf(origin);
    if (oi >= 0) this.enemies.splice(oi, 1); // the Zako/Goei becomes the trio
    const members = [];
    for (let i = 0; i < 3; i++) {
      const e = new Enemy(ttype, 0, 0);
      e.transformGroup = gid;
      e.raider = true; // leaves after its run, never joins a slot
      e.startTransformDive(this, ttype, i, side, ox, oy);
      this.enemies.push(e);
      members.push(e);
    }
    this.transformGroups[gid] = { members, origin: info, alive: 3, bonus: TRANSFORM_BONUS[ttype], done: false };
    Sound.dive();
  }

  onTransformKilled(e) {
    const g = this.transformGroups[e.transformGroup];
    if (!g) return;
    g.alive--;
    if (g.alive <= 0 && !g.done) {
      g.done = true;
      this.addScore(g.bonus); // bonus for downing all three
      this.addPopup(e.x, e.y, '' + g.bonus, '#ffd23f');
    }
  }

  // on player death, one member of an active trio reverts to its formation slot
  // apply a collected power-up to the player; powers stack and each keeps its
  // own timer (grabbing the same type again refreshes that timer)
  applyPower(type) {
    if (!this.player) return;
    this.player.powers[type] = POWER_DURATION;
    this.addPopup(this.player.x, this.player.y - 22, POWER_NAMES[type], POWER_COLORS[type]);
    this.triggerFlash(POWER_COLORS[type], 0.35); // pickup pop in the power's colour
    Sound.coin();
  }

  // build and fire the player's volley, shaped by every active power-up
  firePlayer() {
    const p = this.player;
    const rapid = p.hasPower('rapid');
    const spread = p.hasPower('spread');
    const pierce = p.hasPower('pierce');
    const hunter = p.hasPower('hunter');
    p.fireCd = rapid ? 0.10 : 0.22;
    const cap = (p.dual ? 4 : 2) * (rapid ? 2 : 1) * (spread ? 3 : 1);
    const muzzles = p.dual ? [p.x - 13, p.x + 13] : [p.x];
    const volley = [];
    for (const mx of muzzles) {
      if (spread) {
        volley.push(new Bullet(mx, p.y - 14, 0));
        volley.push(new Bullet(mx, p.y - 14, -170));
        volley.push(new Bullet(mx, p.y - 14, 170));
      } else {
        volley.push(new Bullet(mx, p.y - 14, 0));
      }
    }
    for (const b of volley) { if (pierce) b.pierce = true; if (hunter) b.hunter = true; }
    if (this.bullets.length + volley.length <= cap) {
      for (const b of volley) this.bullets.push(b);
      Sound.fire();
    }
  }

  // Hunter power: gently steer homing bullets toward the nearest live enemy
  steerBullets(dt) {
    for (const b of this.bullets) {
      if (!b.hunter) continue;
      let best = null, bd = Infinity;
      for (const e of this.enemies) {
        if (e.dead || e.spawnDelay > 0) continue;
        const d = (e.x - b.x) ** 2 + (e.y - b.y) ** 2;
        if (d < bd) { bd = d; best = e; }
      }
      if (!best) continue;
      const sp = Math.hypot(b.vx, b.vy) || 560;
      const dx = best.x - b.x, dy = best.y - b.y, dl = Math.hypot(dx, dy) || 1;
      const cl = Math.hypot(b.vx, b.vy) || 1;
      let cx = b.vx / cl, cy = b.vy / cl;
      const turn = Math.min(1, dt * 7);
      cx += (dx / dl - cx) * turn;
      cy += (dy / dl - cy) * turn;
      const nl = Math.hypot(cx, cy) || 1;
      b.vx = (cx / nl) * sp;
      b.vy = (cy / nl) * sp;
    }
  }

  // ---- player damage ----------------------------------------------------
  playerHit() {
    const p = this.player;
    if (!p || p.state !== 'alive' || p.invuln > 0) return;
    // an active shield absorbs the hit and is consumed
    if (p.hasPower('shield')) {
      delete p.powers.shield;
      p.invuln = 0.8;
      this.explosions.push(new Explosion(p.x, p.y, false));
      this.addPopup(p.x, p.y - 20, 'BLOCKED', POWER_COLORS.shield);
      Sound.shieldBlock();
      return;
    }
    if (p.dual) {
      // lose one of the twin fighters, keep flying as a single
      p.dual = false;
      p.invuln = 1.4;
      this.explosions.push(new Explosion(p.x + 13, p.y, false));
      this.triggerFlash('#ff3b5c', 0.4);
      Sound.playerDie();
      return;
    }
    this.explosions.push(new Explosion(p.x, p.y, true));
    this.triggerFlash('#ff3b5c', 0.6); // red death flash
    Sound.playerDie();
    p.state = 'gone';
    this.player = null;
    this.lives--;
    if (this.lives <= 0) this.gameOver();
    else { this.respawnTimer = 1.5; this.mode = 'playing'; }
  }

  gameOver() {
    this.mode = 'gameover';
    this.modeTimer = 0;
    if (this.score > this.high) this.high = this.score;
    localStorage.setItem('galaga_high', '' + this.high);
    this.announce('Game over. Score ' + this.score + ', stage ' + this.stage + '. Press enter to restart.');
  }

  // cleared all 255 stages
  gameComplete() {
    this.mode = 'complete';
    this.modeTimer = 0;
    this.enemies = [];
    this.bombs = [];
    if (this.score > this.high) this.high = this.score;
    localStorage.setItem('galaga_high', '' + this.high);
    this.announce('Congratulations! All 255 stages cleared. Final score ' + this.score + '.');
    Sound.rescue();
  }

  // ======================================================================
  // UPDATE
  // ======================================================================
  update(dt) {
    this.time += dt;
    ANIM.time = this.time;
    ANIM.flap = Math.floor(this.time * 5) % 2;
    this.stars.update(dt);

    if (this.flashMuteT > 0) this.flashMuteT -= dt;
    if (this.flash.a > 0) this.flash.a = Math.max(0, this.flash.a - dt * 2.6); // flash fades

    if (this.mode === 'paused') return;

    // banners / transitions
    if (this.mode === 'ready') {
      this.modeTimer -= dt;
      if (this.player) this.player.update(dt, this.input);
      this.updatePowerups(dt); // a leftover capsule keeps falling & is grabbable
      if (this.modeTimer <= 0) this.mode = 'playing';
      return;
    }
    if (this.mode === 'cleared') {
      this.modeTimer -= dt;
      this.updateEffects(dt);
      if (this.player) this.player.update(dt, this.input);
      this.updateFreed(dt); // let an in-flight rescue finish during the banner
      this.updatePowerups(dt);
      if (this.modeTimer <= 0) this.nextStage();
      return;
    }
    if (this.mode === 'bonusResult') {
      this.modeTimer -= dt;
      this.updateEffects(dt);
      if (this.player) this.player.update(dt, this.input);
      this.updateFreed(dt);
      this.updatePowerups(dt);
      if (this.modeTimer <= 0) this.nextStage();
      return;
    }
    if (this.mode === 'gameover') {
      this.updateEffects(dt);
      return;
    }
    if (this.mode !== 'playing') return;

    // -------- PLAYING --------
    // Slow-mo power scales the WHOLE simulation (player, enemies, bombs, falling
    // capsules, attacks -- everything), so the player gets more real time to
    // react. The factor eases in/out smoothly instead of snapping. Buff timers
    // still run in real time so the power lasts ~12s.
    const realDt = dt;
    const tsTarget = (this.player && this.player.hasPower('slow')) ? 0.5 : 1;
    this.timeScale += (tsTarget - this.timeScale) * clamp(realDt * 6, 0, 1);
    if (Math.abs(this.timeScale - tsTarget) < 0.01) this.timeScale = tsTarget;
    dt *= this.timeScale;

    this.playTime += dt;
    this.captureCd -= dt;
    if (this.fireFreeze > 0) this.fireFreeze -= dt;

    // respawn after death
    if (!this.player && this.respawnTimer > 0) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) this.player = new Player();
    }

    // player + firing
    if (this.player) {
      this.player.update(dt, this.input);
      this.player.tickPowers(realDt); // buff durations run in real time

      // capture completes once the pilot docks with the boss (or times out)
      if (this.player.state === 'captured' && !this.captureFinalized) {
        this.captureTimer += dt;
        const boss = this.player.captureBoss;
        const docked = boss &&
          Math.abs(this.player.y - (boss.y + 22)) < 8 &&
          Math.abs(this.player.x - boss.x) < 8;
        if (docked || this.captureTimer > 1.8) this.finalizeCapture();
      }

      // note: finalizeCapture above may have cleared this.player this frame
      if (this.player && this.input.fire && this.player.canFire()) this.firePlayer();
    }

    // enemies
    for (const e of this.enemies) e.update(dt, this);

    // freed fighter docking (rescue)
    this.updateFreed(dt);

    // power-up capsules: fall and get collected on touch
    this.updatePowerups(dt);

    // attack scheduling (skip during bonus)
    if (!this.isBonus && this.playTime > 2.5) {
      this.attackTimer -= dt;
      if (this.attackTimer <= 0) {
        this.launchAttack();
        const remaining = this.enemies.length;
        const base = this.profile.attackInterval;
        const urgency = remaining < 10 ? 0.55 : 1; // fewer enemies left -> attack harder
        this.attackTimer = rand(base * 0.6, base * 1.2) * urgency;
      }
    }

    // side raiders: one at a time, spread through the stage. The gap shrinks as
    // the formation thins out, so the remaining raiders still all show up even
    // on a quick clear -- and we stop once the formation is gone (a late raider
    // shouldn't stall the stage clear).
    if (this.raidersLeft > 0) {
      const formationNow = this.enemies.filter((e) => !e.raider && !e.convoyCharge).length;
      if (formationNow > 0) {
        this.raiderTimer -= dt;
        if (this.raiderTimer <= 0) {
          this.spawnSideRaider();
          this.raidersLeft--;
          this.raiderTimer = clamp(rand(4.5, 6.5) * (formationNow / 40), 0.9, 6.5);
        }
      }
    }

    // transformed-enemy events
    if (this.transformsLeft > 0 && this.playTime > 4) {
      this.transformTimer -= dt;
      if (this.transformTimer <= 0) {
        this.triggerTransform();
        this.transformsLeft--;
        this.transformTimer = rand(7, 11);
      }
    }

    // end-of-stage assault: once the swarm is nearly gone, the survivors stop
    // returning to formation and attack relentlessly (Zakos circle the fighter)
    if (!this.isBonus && !this.finalAttack && this.playTime > 3) {
      const swarm = this.enemies.filter((e) => !e.raider && !e.convoyCharge && !e.transformGroup && !e.captive);
      if (swarm.length > 0 && swarm.length <= 5) {
        this.finalAttack = true;
        for (const e of swarm) { e.escorts = []; e.diveCount = 0; e.startDive(this, true); }
      }
    }

    this.steerBullets(dt); // hunter homing before bullets move
    this.updateEffects(dt);
    this.collisions();

    // ---- stage end conditions ----
    // Clear as soon as every enemy is dead. Any falling capsule keeps dropping
    // and stays collectible through the banner / into the next stage.
    if (this.isBonus) {
      if (this.enemies.length === 0 && this.playTime > 3.5) this.finishBonus();
    } else {
      if (this.enemies.length === 0 && this.mode === 'playing') {
        this.mode = 'cleared';
        this.modeTimer = 2.2;
        this.bannerMain = 'STAGE CLEAR';
        this.bombs = []; // clear leftover enemy fire so nothing harmless lingers
        this.triggerFlash('#18e0ff', 0.45); // stage-clear flash
        this.announce('Stage ' + this.stage + ' clear.');
      }
    }
  }

  updateEffects(dt) {
    for (const b of this.bullets) b.update(dt);
    for (const b of this.bombs) b.update(dt);
    for (const ex of this.explosions) ex.update(dt);
    for (const p of this.popups) p.t += dt;
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.bombs = this.bombs.filter((b) => !b.dead);
    this.explosions = this.explosions.filter((e) => !e.dead);
    this.popups = this.popups.filter((p) => p.t < p.dur);
    // purge enemies that flew away (bonus) or otherwise flagged
    this.enemies = this.enemies.filter((e) => !e.dead);
  }

  finishBonus() {
    let bonus;
    if (this.bonusHits >= 40) { bonus = 10000; this.bannerSub = 'PERFECT!!  SPECIAL BONUS 10000'; this.triggerFlash('#ffd23f', 0.6); }
    else { bonus = this.bonusHits * 100; this.bannerSub = 'BONUS  ' + bonus; }
    this.addScore(bonus);
    this.bannerMain = 'NUMBER OF HITS  ' + this.bonusHits;
    this.mode = 'bonusResult';
    this.modeTimer = 3.0;
    this.announce(this.bonusHits + ' hits. ' + (this.bonusHits >= 40 ? 'Perfect! 10000 bonus.' : 'Bonus ' + bonus + '.'));
    Sound.coin();
  }

  // apply one bullet's worth of damage to an enemy (bonus & normal handling)
  damageEnemy(e) {
    if (e.bonus) {
      // bonus enemies still honour hit points: a boss takes 2 shots
      e.hp--;
      if (e.hp > 0) { Sound.enemyHit(); return; } // boss survives, turns blue
      this.bonusHits++;
      this.addScore(100);
      this.explosions.push(new Explosion(e.x, e.y, e.type === T_BOSS));
      if (this.player && this.player.hasPower('double'))
        this.addPopup(e.x, e.y, '100 x2', POWER_COLORS.double);
      else
        this.addPopup(e.x, e.y, '100', '#fff');
      Sound.bonusTick();
      e.dead = true;
      // per-wave clear bonus: award once all 8 in a wave have been shot down
      if (e.bonusWave !== undefined && this.bonusWaveShot) {
        if (++this.bonusWaveShot[e.bonusWave] === 8) {
          this.addScore(this.bonusWaveBonus);
          this.addPopup(WIDTH / 2, 90, 'WAVE CLEAR  ' + this.bonusWaveBonus, '#ffd23f');
          Sound.coin();
        }
      }
    } else {
      e.hp--;
      if (e.hp <= 0) this.killEnemy(e);
      else Sound.enemyHit(); // boss took a hit, turned blue
    }
  }

  // ---- collisions -------------------------------------------------------
  collisions() {
    // player bullets vs enemies (snapshot per bullet so piercing kills don't
    // disturb the iteration)
    for (const bullet of this.bullets) {
      if (bullet.dead) continue;
      for (const e of this.enemies.slice()) {
        if (e.dead || e.killed || e.spawnDelay > 0) continue;
        // friendly fire: a shot that reaches your abducted ship (riding behind
        // the boss) destroys it. The boss shields it head-on, so this only
        // happens once the boss has dived past and left the ship exposed.
        if (e.hasCaptured && aabb(bullet, e.capturedBox())) {
          bullet.dead = true;
          this.destroyCapturedShip(e);
          break;
        }
        if (!aabb(bullet, e)) continue;
        if (bullet.pierce) {
          // piercing shots hit each enemy once and keep travelling
          if (!bullet.hits) bullet.hits = new Set();
          if (bullet.hits.has(e)) continue;
          bullet.hits.add(e);
          this.damageEnemy(e);
        } else {
          bullet.dead = true;
          this.damageEnemy(e);
          break;
        }
      }
    }

    if (!this.player || this.player.state !== 'alive') return;
    const boxes = this.player.boxes();

    // diving enemies vs player (body collision) -- a crash kills only the
    // player; the enemy flies on unharmed
    for (const e of this.enemies) {
      if (e.dead || e.spawnDelay > 0 || e.bonus) continue; // flyby enemies are harmless
      if (e.state === 'formation' || e.state === 'toSlot') continue;
      for (const box of boxes) {
        if (aabb(e, box)) {
          this.playerHit();
          return;
        }
      }
    }

    // bombs vs player
    for (const bomb of this.bombs) {
      if (bomb.dead) continue;
      for (const box of boxes) {
        if (aabb(bomb, box)) { bomb.dead = true; this.playerHit(); return; }
      }
    }
  }

  // ======================================================================
  // RENDER
  // ======================================================================
  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    this.stars.draw(ctx);

    if (this.mode === 'attract') { this.drawAttract(ctx); this.drawHUD(ctx); return; }
    if (this.mode === 'gallery') { this.drawGallery(ctx); return; }

    // tractor beams behind enemies
    for (const e of this.enemies) if (e.state === 'beam') e.drawBeam(ctx);
    // enemies
    for (const e of this.enemies) e.draw(ctx);
    // projectiles
    for (const b of this.bombs) b.draw(ctx);
    for (const b of this.bullets) b.draw(ctx);
    // power-up capsules
    for (const pu of this.powerups) pu.draw(ctx);
    // freed fighter descending to dock
    if (this.freed) ctx.drawImage(Sprites.player, this.freed.x - 14, this.freed.y - 14, 28, 28);
    // player
    if (this.player) this.player.draw(ctx);
    // explosions on top
    for (const ex of this.explosions) ex.draw(ctx);
    // score popups
    for (const p of this.popups) {
      ctx.globalAlpha = 1 - p.t / p.dur;
      this.text(ctx, p.text, p.x, p.y - p.t * 18, 11, p.color, 'center');
      ctx.globalAlpha = 1;
    }

    this.drawBanners(ctx);
    this.drawHUD(ctx);

    // full-screen flash overlay (juice; suppressed by reduced-flash mode)
    if (this.flash.a > 0 && !this.reducedFlash) {
      ctx.globalAlpha = this.flash.a;
      ctx.fillStyle = this.flash.color;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      ctx.globalAlpha = 1;
    }
  }

  drawBanners(ctx) {
    if (this.mode === 'ready') {
      const c = this.isBonus ? '#18e0ff' : '#18e0ff';
      this.text(ctx, this.bannerMain, WIDTH / 2, HEIGHT / 2 - 6, 22, c, 'center');
      if (!this.isBonus)
        this.text(ctx, 'READY', WIDTH / 2, HEIGHT / 2 + 26, 16, '#ff3b5c', 'center');
      else if (this.bannerSub2)
        this.text(ctx, this.bannerSub2, WIDTH / 2, HEIGHT / 2 + 24, 14, '#ffd23f', 'center');
    } else if (this.mode === 'cleared') {
      this.text(ctx, this.bannerMain, WIDTH / 2, HEIGHT / 2, 20, '#ffd23f', 'center');
    } else if (this.mode === 'bonusResult') {
      this.text(ctx, this.bannerMain, WIDTH / 2, HEIGHT / 2 - 10, 16, '#fff', 'center');
      this.text(ctx, this.bannerSub, WIDTH / 2, HEIGHT / 2 + 18, 16,
        this.bonusHits >= 40 ? '#ffd23f' : '#18e0ff', 'center');
    } else if (this.mode === 'paused') {
      // dim the frozen game behind the menu
      ctx.fillStyle = 'rgba(2, 4, 14, 0.72)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      this.text(ctx, 'PAUSED', WIDTH / 2, HEIGHT / 2 - 70, 26, '#fff', 'center');
      this.pauseItems().forEach((item, i) => {
        const sel = i === this.pauseIndex;
        const yy = HEIGHT / 2 - 28 + i * 30;
        this.menuItem(ctx, item, WIDTH / 2, yy, sel ? 16 : 14, sel ? '#ffd23f' : '#8fa0d8', sel);
      });
      this.text(ctx, '↑↓ SELECT   ENTER OK   P RESUME', WIDTH / 2, HEIGHT / 2 + 100, 11, '#6677aa', 'center');
    } else if (this.mode === 'complete') {
      this.text(ctx, 'CONGRATULATIONS', WIDTH / 2, HEIGHT / 2 - 40, 20, '#ffd23f', 'center');
      this.text(ctx, 'ALL 255 STAGES CLEARED!', WIDTH / 2, HEIGHT / 2 - 10, 14, '#18e0ff', 'center');
      this.text(ctx, 'FINAL SCORE  ' + this.score, WIDTH / 2, HEIGHT / 2 + 18, 13, '#fff', 'center');
      if (this.blinkOn())
        this.text(ctx, 'PRESS ENTER', WIDTH / 2, HEIGHT / 2 + 48, 14, '#fff', 'center');
    } else if (this.mode === 'gameover') {
      this.text(ctx, 'GAME OVER', WIDTH / 2, HEIGHT / 2 - 10, 24, '#ff3b5c', 'center');
      if (this.blinkOn())
        this.text(ctx, 'PRESS ENTER', WIDTH / 2, HEIGHT / 2 + 28, 14, '#fff', 'center');
    }

    if (this.flashMuteT > 0)
      this.text(ctx, this.flashMute, WIDTH / 2, 80, 12, '#8fa0d8', 'center');
  }

  drawHUD(ctx) {
    // top score readouts
    const blink = this.blinkOn();
    this.text(ctx, '1UP', 30, 16, 12, blink ? '#ff3b5c' : '#000', 'center');
    this.text(ctx, ('' + this.score).padStart(6, '0'), 64, 32, 14, '#fff', 'left');
    this.text(ctx, 'HIGH SCORE', WIDTH - 96, 16, 12, '#ff3b5c', 'center');
    this.text(ctx, ('' + this.high).padStart(6, '0'), WIDTH - 130, 32, 14, '#fff', 'left');

    if (this.mode === 'attract' || this.mode === 'gameover') return;

    // bottom-left: reserve fighters (or an infinity marker)
    if (this.infinite) {
      ctx.drawImage(Sprites.player, 6, HEIGHT - 26, 22, 22);
      this.text(ctx, '×∞', 30, HEIGHT - 14, 16, '#18e0ff', 'left');
    } else {
      const reserves = Math.max(0, this.lives - 1);
      for (let i = 0; i < Math.min(reserves, 6); i++)
        ctx.drawImage(Sprites.player, 6 + i * 24, HEIGHT - 26, 22, 22);
    }

    // bottom-right: stage badges
    const badges = stageBadges(this.stage);
    let bx = WIDTH - 12;
    for (const d of badges) {
      const spr = Sprites.flags[d];
      const w = 16, h = 12;
      bx -= w + 1;
      if (bx < 40) break;
      ctx.drawImage(spr, bx, HEIGHT - 22, w, h);
    }

    // active power-ups (bottom centre): one labelled timer bar each, stacked
    if (this.player) {
      const active = POWER_TYPES.filter((t) => this.player.hasPower(t));
      const bw = 92, bh = 4, rowH = 17, cx = WIDTH / 2;
      let y = HEIGHT - 14 - (active.length - 1) * rowH;
      for (const type of active) {
        const frac = clamp(this.player.powers[type] / POWER_DURATION, 0, 1);
        this.text(ctx, POWER_NAMES[type], cx, y - 4, 10, POWER_COLORS[type], 'center');
        ctx.fillStyle = '#22304a';
        ctx.fillRect(cx - bw / 2, y + 4, bw, bh);
        ctx.fillStyle = POWER_COLORS[type];
        ctx.fillRect(cx - bw / 2, y + 4, bw * frac, bh);
        y += rowH;
      }
    }
  }

  drawGallery(ctx) {
    const power = this.galleryTab === 1;
    const list = this.galleryList();
    const e = list[this.galleryIndex];

    this.text(ctx, power ? 'POWER-UP GUIDE' : 'ENEMY GUIDE', WIDTH / 2, 60, 24, '#ff3b5c', 'center');
    // tab switcher (↑↓)
    this.text(ctx, 'ENEMIES', WIDTH / 2 - 62, 86, 11, power ? '#556688' : '#ffd23f', 'center');
    this.text(ctx, '↕', WIDTH / 2, 86, 11, '#8fa0d8', 'center');
    this.text(ctx, 'POWER-UPS', WIDTH / 2 + 62, 86, 11, power ? '#ffd23f' : '#556688', 'center');
    this.text(ctx, (this.galleryIndex + 1) + ' / ' + list.length, WIDTH / 2, 108, 11, '#8fa0d8', 'center');

    // framed panel with the sprite (enemies) or a capsule icon (power-ups)
    const px = WIDTH / 2, py = 176;
    ctx.strokeStyle = '#2b2170';
    ctx.lineWidth = 2;
    ctx.strokeRect(px - 52, py - 52, 104, 104);
    if (power) {
      const col = POWER_COLORS[e.type];
      ctx.fillStyle = col;
      ctx.fillRect(px - 28, py - 28, 56, 56);
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(px - 28, py - 28, 56, 56);
      ctx.fillStyle = '#001018';
      ctx.font = 'bold 40px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(POWER_LETTER[e.type], px, py + 2);
    } else {
      const sp = Sprites[e.sprite];
      const frame = Array.isArray(sp) ? spriteFrame(sp) : sp;
      // centre by the artwork's content box (sprites can be top/side-heavy)
      const scale = 72 / frame.width;
      ctx.drawImage(frame, px - frame.cx * scale, py - frame.cy * scale,
        frame.width * scale, frame.height * scale);
    }

    // arrow hints flanking the panel
    if (this.blinkOn()) {
      this.text(ctx, '◀', px - 78, py, 22, '#6677aa', 'center');
      this.text(ctx, '▶', px + 78, py, 22, '#6677aa', 'center');
    }

    this.text(ctx, e.name, WIDTH / 2, 262, 18, '#ffd23f', 'center');
    if (power) this.text(ctx, '12 SEC  ·  STACKS  ·  LOST ON DEATH', WIDTH / 2, 286, 11, POWER_COLORS[e.type], 'center');
    else this.text(ctx, e.pts + ' PTS', WIDTH / 2, 286, 13, '#18e0ff', 'center');

    let y = 324;
    for (const line of e.desc) {
      this.text(ctx, line, WIDTH / 2, y, 12, '#cdd6f4', 'center');
      y += 22;
    }

    this.text(ctx, '←→ BROWSE    ↑↓ ENEMIES/POWER-UPS    E/ESC BACK', WIDTH / 2, HEIGHT - 34, 10, '#fff', 'center');
  }

  drawAttract(ctx) {
    this.text(ctx, 'GALAGA', WIDTH / 2, 128, 48, '#ff3b5c', 'center');
    this.text(ctx, 'JAVASCRIPT EDITION', WIDTH / 2, 164, 12, '#18e0ff', 'center');

    // high score (the enemy line-up lives in the E guide now)
    this.text(ctx, 'HIGH SCORE', WIDTH / 2, 214, 12, '#18e0ff', 'center');
    this.text(ctx, ('' + this.high).padStart(5, '0'), WIDTH / 2, 240, 22, '#ffd23f', 'center');

    // ---- life-mode selector ----
    this.text(ctx, '- MODE -', WIDTH / 2, 298, 12, '#18e0ff', 'center');
    LIFE_MODES.forEach((m, i) => {
      const sel = i === this.menuIndex;
      const yy = 324 + i * 22;
      this.menuItem(ctx, m.name, WIDTH / 2, yy, sel ? 15 : 12, sel ? '#ffd23f' : '#6677aa', sel);
    });

    // ---- start-stage selector ----
    this.text(ctx, '◀  START STAGE  ' + this.startStage + '  ▶', WIDTH / 2, 418, 14, '#18e0ff', 'center');
    this.text(ctx, 'CAPTURE & RESCUE FOR DUAL FIGHTER!', WIDTH / 2, 452, 10, '#8fa0d8', 'center');

    if (this.blinkOn())
      this.text(ctx, '↑↓ MODE    ←→ STAGE    ENTER START', WIDTH / 2, HEIGHT - 52, 12, '#fff', 'center');
    this.text(ctx, 'E   ENEMY & POWER-UP GUIDE', WIDTH / 2, HEIGHT - 32, 10, '#8fa0d8', 'center');
    this.text(ctx, 'F   REDUCED FLASH: ' + (this.reducedFlash ? 'ON' : 'OFF'), WIDTH / 2, HEIGHT - 16, 10, '#8fa0d8', 'center');
  }

  text(ctx, str, x, y, size, color, align = 'left') {
    ctx.font = 'bold ' + size + 'px "Courier New", monospace';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  // a centred menu item; when selected, ▶ ◀ flank it without shifting the label
  menuItem(ctx, str, x, y, size, color, selected) {
    this.text(ctx, str, x, y, size, color, 'center');
    if (selected) {
      ctx.font = 'bold ' + size + 'px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = color;
      const w = ctx.measureText(str).width;
      ctx.fillText('▶', x - w / 2 - 14, y);
      ctx.fillText('◀', x + w / 2 + 14, y);
    }
  }

  // ---- main loop --------------------------------------------------------
  loop(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.05) dt = 0.05; // clamp big frame gaps (tab switches)
    this.update(dt);
    this.draw();
    requestAnimationFrame((t) => this.loop(t));
  }
}

window.addEventListener('load', () => {
  const canvas = document.getElementById('screen');
  window.game = new Game(canvas);

  // ---- on-screen touch controls (mobile) ----
  const g = window.game;
  const setInput = (prop, val) => { if (g && g.input) g.input[prop] = val; };
  function bindHold(id, prop) {
    const el = document.getElementById(id);
    if (!el) return;
    const press = (e) => { e.preventDefault(); Sound.init(); Sound.resume(); setInput(prop, true); };
    const release = (e) => { e.preventDefault(); setInput(prop, false); };
    el.addEventListener('touchstart', press, { passive: false });
    el.addEventListener('touchend', release, { passive: false });
    el.addEventListener('touchcancel', release, { passive: false });
    el.addEventListener('mousedown', press);
    el.addEventListener('mouseup', release);
    el.addEventListener('mouseleave', release);
  }
  bindHold('t-left', 'left');
  bindHold('t-right', 'right');
  bindHold('t-fire', 'fire');

  // Tap the screen to start a game from the title / game-over / complete screens.
  canvas.addEventListener('touchstart', (e) => {
    Sound.init(); Sound.resume();
    if (g && (g.mode === 'attract' || g.mode === 'gameover' || g.mode === 'complete')) {
      e.preventDefault();
      g.onStartKey();
    }
  }, { passive: false });
});
