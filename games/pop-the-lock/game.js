/* =====================================================================
   POP THE LOCK: a vanilla-JS arcade remake
   Tap / click / Space when the sweeping dial is over the glowing notch.
   Reverse, relocate, repeat. One miss ends the run.
   ===================================================================== */
(() => {
  "use strict";

  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const rand = (lo, hi) => lo + Math.random() * (hi - lo);

  // ---- DOM ----
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const bestEl = document.getElementById("best");
  const overlay = document.getElementById("overlay");
  const overlayMsg = document.getElementById("overlay-msg");
  const playBtn = document.getElementById("play");
  const stage = document.querySelector(".stage");

  // ---- Persistent best ----
  // (GameShell.store, so blocked storage can't stop the game loading)
  const store = window.GameShell ? GameShell.store : { get: (k, f) => f, set: () => {} };
  const BEST_KEY = "popthelock.best";
  let best = parseInt(store.get(BEST_KEY, "0"), 10) || 0;
  bestEl.textContent = best;

  // ---- Background themes (player-selectable, persisted) ----
  // `ring` is the darker lock-band shade drawn on the canvas to match each bg.
  const THEMES = {
    teal:   { bg: "#2f8f7e", ring: "#237063" },
    indigo: { bg: "#3b4a7a", ring: "#2c3a63" },
    plum:   { bg: "#5a4a82", ring: "#44386b" },
    coral:  { bg: "#d96a5e", ring: "#b84f45" },
    moss:   { bg: "#4a7a3c", ring: "#3a6230" },
  };
  const THEME_KEY = "popthelock.theme";
  const themesEl = document.getElementById("themes");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  let themeName = THEMES[store.get(THEME_KEY, "")] ? store.get(THEME_KEY, "") : "teal";
  let ringColor = THEMES[themeName].ring;

  function applyTheme(name) {
    if (!THEMES[name]) name = "teal";
    themeName = name;
    const t = THEMES[name];
    ringColor = t.ring;
    document.documentElement.style.background = t.bg;
    document.body.style.background = t.bg;
    if (themeMeta) themeMeta.setAttribute("content", t.bg);
    store.set(THEME_KEY, name);
    themesEl.querySelectorAll(".swatch").forEach((s) =>
      s.classList.toggle("active", s.dataset.theme === name)
    );
  }
  themesEl.addEventListener("click", (e) => {
    const sw = e.target.closest(".swatch");
    if (sw) applyTheme(sw.dataset.theme);
  });
  // a mouse click on a colour doesn't take focus (Tab still reaches it): left
  // focused, the Space or Enter that should start would pick the colour again
  themesEl.addEventListener("mousedown", (e) => { if (e.target.closest(".swatch")) e.preventDefault(); });
  applyTheme(themeName);

  // ---- Audio (WebAudio, no assets) ----
  let muted = false; // muting is handled globally by the shared toggle (mute-toggle.js)
  let audioCtx = null;

  function beep(freq, dur = 0.08, type = "sine", gain = 0.18) {
    if (muted) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur);
  }
  const sndPop = () => { beep(660, 0.07, "triangle", 0.22); beep(990, 0.09, "sine", 0.12); };
  const sndLevel = () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.12, "triangle", 0.2), i * 70)); };
  const sndFail = () => { beep(180, 0.3, "sawtooth", 0.25); beep(90, 0.4, "sine", 0.2); };

  // ---- Backdrop ----
  // Something going on behind the lock, a scene to each colour: rings
  // spreading over the teal's water, a night sky wheeling over the indigo,
  // clockwork turning in the plum, a sunburst sweeping round the coral, old
  // keys drifting up through the moss. Each keeps clear of the lock's own
  // face, and a pop sends a ring out across it.
  // With Visual FX off the same scene is there, held still (and a pop sends
  // no ring: the lock's own flash still marks it).
  const bg = document.getElementById("bg");
  const bctx = bg.getContext("2d");
  let BW = 0, BH = 0, lx = 0, ly = 0;   // the window, and the lock's centre in it
  let bgT = 0;                          // the backdrop's clock (ms): it stands still with Visual FX off, or paused
  let bgSeen = "";                      // what the still backdrop was last drawn for
  let rings = [];                       // the rings pops have sent out: { r, life, color }
  // a fixed scatter of points (the same on every visit, so the still sky is always the same sky)
  const SCATTER = (() => {
    let s = 20240229;
    const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
    return Array.from({ length: 150 }, () => ({ u: next(), v: next(), a: next(), b: next() }));
  })();
  // the plum's wheels: where in the window (as fractions of it), how big
  // (against its shorter side), how many teeth, and the turn each starts at
  const GEARS = [
    { u: 0.09, v: 0.17, r: 0.17, n: 12, a: 0.0 },
    { u: 0.94, v: 0.25, r: 0.13, n: 10, a: 0.3 },
    { u: 0.87, v: 0.91, r: 0.2, n: 14, a: 0.1 },
    { u: 0.07, v: 0.83, r: 0.14, n: 10, a: 0.5 },
    { u: 0.48, v: 1.05, r: 0.11, n: 9, a: 0.2 },
    { u: 0.55, v: -0.04, r: 0.1, n: 8, a: 0.7 },
  ];
  // the moss's keys: across the window (u), how far up their climb (v), how
  // big (s), the angle each lies at (a) and its sway's phase (p); seeded, so
  // the still scene is always the same
  const KEYS = (() => {
    let s = 71993;
    const next = () => (s = (s * 16807) % 2147483647) / 2147483647;
    return Array.from({ length: 16 }, (_, i) => ({ u: (i + 0.15 + next() * 0.7) / 16, v: next(), s: next(), a: (next() - 0.5) * 1.6, p: next() }));
  })();
  const farCorner = () => Math.hypot(Math.max(lx, BW - lx), Math.max(ly, BH - ly));

  // an old key, `s` long, lying at angle `a`: a ring for its bow, a shaft,
  // and two teeth on its bit
  function oldKey(x, y, s, a) {
    bctx.save();
    bctx.translate(x, y);
    bctx.rotate(a);
    bctx.lineWidth = Math.max(1.5, s * 0.08);
    bctx.beginPath();
    bctx.arc(-s * 0.32, 0, s * 0.18, 0, TAU);              // the bow
    bctx.moveTo(-s * 0.14, 0); bctx.lineTo(s * 0.5, 0);     // the shaft
    bctx.moveTo(s * 0.5, 0); bctx.lineTo(s * 0.5, s * 0.17); bctx.lineTo(s * 0.41, s * 0.17);   // the end tooth
    bctx.moveTo(s * 0.32, 0); bctx.lineTo(s * 0.32, s * 0.12);                                   // and the one before it
    bctx.stroke();
    bctx.beginPath();
    bctx.arc(-s * 0.32, 0, s * 0.07, 0, TAU);              // the bow's hole
    bctx.stroke();
    bctx.restore();
  }

  function gearWheel(x, y, r, n, a) {
    const tooth = r * 0.2, w = TAU / n, inner = r - tooth;
    bctx.beginPath();
    for (let i = 0; i < n; i++) {
      const b = a + i * w;
      bctx.arc(x, y, inner, b, b + w * 0.3);            // the gap before the tooth
      bctx.arc(x, y, r, b + w * 0.42, b + w * 0.88);    // the tooth's top
    }
    bctx.closePath();
    bctx.fillStyle = "rgba(255,255,255,0.05)";
    bctx.fill();
    bctx.strokeStyle = "rgba(255,255,255,0.17)";
    bctx.lineWidth = 2.5;
    bctx.stroke();
    // the hub, and four spokes out to the rim
    bctx.beginPath();
    bctx.arc(x, y, r * 0.2, 0, TAU);
    for (let i = 0; i < 4; i++) {
      const b = a + i * (TAU / 4);
      bctx.moveTo(x + Math.cos(b) * r * 0.2, y + Math.sin(b) * r * 0.2);
      bctx.lineTo(x + Math.cos(b) * inner * 0.94, y + Math.sin(b) * inner * 0.94);
    }
    bctx.stroke();
  }

  const SCENES = {
    // teal: rings spreading over still water, out from the lock
    teal(t) {
      const from = R * 1.3, gap = Math.max(44, R * 0.46), end = farCorner();
      for (let r = from + (t * 0.011) % gap; r < end; r += gap) {
        const k = (r - from) / (end - from);              // 0 at the lock, 1 at the farthest corner
        const born = Math.min(1, (r - from) / (gap * 0.6)); // a new ring comes up out of nothing
        bctx.strokeStyle = `rgba(255,255,255,${(0.2 * (1 - k) + 0.03) * born})`;
        bctx.lineWidth = 1.5 + 3 * (1 - k);
        bctx.beginPath();
        bctx.arc(lx, ly, r, 0, TAU);
        bctx.stroke();
      }
    },
    // indigo: a night sky wheeling slowly about the lock, its stars twinkling
    indigo(t) {
      const from = R * 1.25, end = farCorner(), turn = t * 0.000012;
      bctx.fillStyle = "#fff";
      SCATTER.forEach((p, i) => {
        const d = from + Math.sqrt(p.u) * (end - from), a = p.v * TAU + turn;
        const x = lx + Math.cos(a) * d, y = ly + Math.sin(a) * d;
        if (x < -6 || x > BW + 6 || y < -6 || y > BH + 6) return;
        const twinkle = 0.5 + 0.5 * Math.sin(t * 0.0011 * (0.6 + p.a) + p.b * TAU);
        bctx.globalAlpha = 0.3 + 0.6 * twinkle * (0.45 + 0.55 * p.b);
        const size = 1.1 + p.a * 2;
        bctx.beginPath();
        if (i % 6 === 0) {
          // one in six is a four-pointed sparkle
          const s = size * 3.2, n = size * 0.7;
          bctx.moveTo(x, y - s); bctx.lineTo(x + n, y - n); bctx.lineTo(x + s, y); bctx.lineTo(x + n, y + n);
          bctx.lineTo(x, y + s); bctx.lineTo(x - n, y + n); bctx.lineTo(x - s, y); bctx.lineTo(x - n, y - n);
          bctx.closePath();
        } else {
          bctx.arc(x, y, size, 0, TAU);
        }
        bctx.fill();
      });
      bctx.globalAlpha = 1;
    },
    // plum: clockwork, each wheel turning against the next, the small ones faster
    plum(t) {
      const m = Math.min(BW, BH);
      GEARS.forEach((g, i) => gearWheel(g.u * BW, g.v * BH, g.r * m, g.n, g.a + (i % 2 ? -1 : 1) * t * 0.000026 / g.r));
    },
    // coral: a sunburst sweeping slowly round the lock
    coral(t) {
      const n = 14, w = TAU / n, turn = t * 0.00005, from = R * 1.3, end = farCorner();
      bctx.fillStyle = "rgba(255,255,255,0.09)";
      for (let i = 0; i < n; i++) {
        const a = turn + i * w;
        bctx.beginPath();
        bctx.arc(lx, ly, from, a, a + w * 0.5);
        bctx.arc(lx, ly, end, a + w * 0.5, a, true);
        bctx.closePath();
        bctx.fill();
      }
    },
    // moss: old keys drifting up past the lock, each swaying a little as it
    // climbs, fading out where it would cross the lock's face
    moss(t) {
      const m = Math.min(BW, BH), keep = R * 1.25;
      bctx.strokeStyle = "#fff";
      bctx.lineCap = "round";
      bctx.lineJoin = "round";
      KEYS.forEach((k) => {
        const size = m * (0.08 + k.s * 0.07), climb = BH + size * 2;
        const y = BH + size - ((k.v * climb + t * 0.018 * (0.7 + k.s * 0.6)) % climb);
        const x = k.u * BW + Math.sin(t * 0.0006 + k.p * TAU) * size * 0.3;
        const near = Math.hypot(x - lx, y - ly) - keep;
        if (near <= 0) return;
        bctx.globalAlpha = 0.22 * Math.min(1, near / (size * 0.8));
        oldKey(x, y, size, k.a + Math.sin(t * 0.0008 + k.p * 6) * 0.25);
      });
      bctx.globalAlpha = 1;
      bctx.lineCap = "butt";
    },
  };

  // a pop (or a miss) sends a ring out from the lock across the backdrop
  function sendRing(color) {
    if (!reducedMotion()) rings.push({ r: R * 1.08, life: 1, color });
  }

  function drawBg(dt) {
    const fxOff = reducedMotion();
    if (fxOff && rings.length) { rings = []; bgSeen = ""; }
    if (!fxOff && !PAUSE.isPaused()) {
      bgT += dt;
      bgSeen = "";
    } else {
      // held still: nothing to draw again until the colour, the window or the lock's place changes
      const seen = [themeName, BW, BH, lx, ly, R, bgT].join();
      if (seen === bgSeen) return;
      bgSeen = seen;
    }
    bctx.clearRect(0, 0, BW, BH);
    SCENES[themeName](bgT);
    for (let i = rings.length - 1; i >= 0; i--) {
      const g = rings[i];
      g.r += dt * 0.45;
      g.life -= dt / 1100;
      if (g.life <= 0) { rings.splice(i, 1); continue; }
      bctx.globalAlpha = g.life * 0.4;
      bctx.strokeStyle = g.color;
      bctx.lineWidth = 2 + 6 * g.life;
      bctx.beginPath();
      bctx.arc(lx, ly, g.r, 0, TAU);
      bctx.stroke();
    }
    bctx.globalAlpha = 1;
  }

  // ---- Responsive / HiDPI canvas ----
  let W = 0, H = 0, cx = 0, cy = 0, R = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = canvas.clientWidth;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = size; H = size;
    cx = W / 2; cy = H / 2;
    R = Math.min(W, H) * 0.36;
    // the backdrop fills the window (a little softer than the lock: it is big, and behind)
    const bdpr = Math.min(window.devicePixelRatio || 1, 1.5);
    BW = window.innerWidth; BH = window.innerHeight;
    bg.width = Math.round(BW * bdpr);
    bg.height = Math.round(BH * bdpr);
    bctx.setTransform(bdpr, 0, 0, bdpr, 0, 0);
    const box = canvas.getBoundingClientRect();
    lx = box.left + box.width / 2; ly = box.top + box.height / 2;
    bgSeen = "";
    // the start / game-over panel is centred on the lock as well: its overlay
    // covers the whole window, so it is told how far down the stage starts
    overlay.style.setProperty("--stage-top", Math.round(stage.getBoundingClientRect().top) + "px");
  }
  window.addEventListener("resize", resize);

  // ---- Game state ----
  const State = { MENU: "menu", PLAY: "play", OVER: "over" };
  let state = State.MENU;

  let dial = 0;            // current dial angle (rad)
  let dir = 1;             // sweep direction (+1 / -1)
  let speed = 0;           // rad per ms
  let target = 0;          // notch center angle (rad)
  let tol = 0;             // notch half-width (rad)
  let traveled = 0;        // angle swept since the notch was placed (rad)
  let exitTravel = 0;      // travel at which the dial's centre reaches the notch's far end (rad)

  // The notch is the window: a tap pops while the ball's centre is on it.
  // Its yellow is drawn to end just there, round ends and all (they used to
  // reach half the notch's thickness further, past the window). And the
  // ball is only too late once it has wholly left the yellow, a few pixels
  // clear: it used to be called the moment the centre left, with the ball
  // still lying half over the yellow's end.
  const ballR = () => Math.max(9, R * 0.075);                   // the ball's radius (px)
  const notchW = () => Math.max(12, R * 0.12);                  // the notch's thickness (px)
  const CLEAR = 4;                                              // px between the ball and the yellow as it's called late
  const pastArc = () => Math.asin(Math.min(1, ballR() / R)) + CLEAR / R;   // past the window's end, round the ring (rad)

  let score = 0;
  let level = 1;
  let popsNeeded = 1;
  let popsDone = 0;

  let particles = [];
  let canRestart = false;  // gates tap-to-restart until the game-over panel is up
  // Reduce-motion state for this game (live): set by the top-right toggle / OS setting.
  const reducedMotion = () => !!(window.RM_ON && window.RM_ON());
  let shakeTime = 0;
  let flash = 0;           // success ring flash 0..1
  let missAt = null;       // where a miss happened (an angle), marked still with Visual FX off
  let lastTs = 0;

  // ---- Difficulty curve ----
  function baseSpeed(lvl) {
    // rad per ms: starts gentle, ramps up, soft cap
    return 0.0024 + Math.min(lvl, 30) * 0.00018;
  }
  function tolerance(lvl) {
    // radians of half-width; shrinks with level, floored
    return Math.max(0.18, 0.42 - lvl * 0.011);
  }

  // ---- Round flow ----
  function start() {
    state = State.PLAY;
    score = 0; level = 1; popsNeeded = 1; popsDone = 0;
    dir = Math.random() < 0.5 ? 1 : -1;  // equal chance CW / CCW
    dial = rand(0, TAU);                 // start anywhere on the ring
    speed = baseSpeed(level);
    tol = tolerance(level);
    placeTarget();
    particles = [];
    flash = 0;
    missAt = null;
    overlay.classList.add("hidden");
    updateHud();
  }

  // Place a fresh notch ahead of the dial so there's reaction time.
  function placeTarget() {
    const lead = rand(Math.PI * 0.55, Math.PI * 1.25); // how far ahead, along travel
    target = (dial + dir * lead) % TAU;
    if (target < 0) target += TAU;
    traveled = 0;
    exitTravel = lead + tol; // the centre is past the window once it sweeps this far (and the ball wholly past the yellow pastArc() later)
  }

  function pop() {
    score++;
    popsDone++;
    flash = 1;
    sndPop();
    spawnBurst(target, "#ffd23f");
    sendRing("#ffffff");
    dir *= -1;                       // reverse sweep: the signature feel
    speed = baseSpeed(level) * (1 + popsDone * 0.015);
    if (popsDone >= popsNeeded) {
      levelUp();
    } else {
      placeTarget();
    }
    updateHud();
    if (score > best) { best = score; store.set(BEST_KEY, best); bestEl.textContent = best; }
  }

  function levelUp() {
    level++;
    popsDone = 0;
    popsNeeded = 1 + Math.floor((level - 1) / 1); // +1 required pop per level
    speed = baseSpeed(level);
    tol = tolerance(level);
    flash = 1;
    sndLevel();
    spawnBurst(target, "#ffffff", 26);
    sendRing("#ffd23f");
    placeTarget();
  }

  function fail(missedByPass = false) {
    state = State.OVER;
    canRestart = false;      // lock input so a stray tap can't skip the screen
    shakeTime = 320;
    stage.classList.add("shake");
    setTimeout(() => stage.classList.remove("shake"), 340);
    sndFail();
    missAt = missedByPass ? target : dial;
    spawnBurst(missAt, "#ff5d73", 30);
    sendRing("#ff5d73");
    const reason = missedByPass ? "Too slow: the dial slipped past!" : "Missed the mark!";
    overlayMsg.innerHTML = `${reason}<br>You reached <b>${score}</b> &nbsp;•&nbsp; Level <b>${level}</b>`;
    playBtn.textContent = "RETRY";
    // Only reveal the panel if we're still game-over: a quick restart tap
    // during this delay must not pop the overlay back over a live game.
    setTimeout(() => {
      if (state !== State.OVER) return;
      overlay.classList.remove("hidden");
      canRestart = true;     // now the panel is up: let the player retry
    }, 600);
  }

  // ---- Input ----
  function onTap() {
    if (PAUSE.isPaused()) return;   // the dial is frozen: a tap mustn't pop or miss
    if (state === State.MENU) { start(); return; }
    if (state === State.OVER) {
      if (canRestart) start();  // ignored during the post-loss buffer
      return;
    }
    if (state !== State.PLAY) return;
    let d = Math.abs(((dial - target + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (d <= tol) pop();
    else fail();
  }

  canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); onTap(); });
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
    if (e.code !== "Space" && e.code !== "Enter") return;
    // On the start and game-over panel, Space or Enter on a focused button is
    // that button's own press (Tab to a colour, Enter: it picks the colour).
    // Starting here as well would do both. Mid-run the two keys always tap,
    // and on PLAY itself they go through onTap like any tap, so a key mashed
    // just after a miss still can't skip the game-over panel.
    const own = e.target && e.target.closest && e.target.closest("button");
    if (state !== State.PLAY && own && own !== playBtn && !own.disabled) return;
    e.preventDefault();
    if (!e.repeat) onTap();
  });
  playBtn.addEventListener("click", (e) => { e.stopPropagation(); start(); });
  // Back to the start panel as it first read (from the pause card), where the
  // colour can be picked again
  const START_MSG = overlayMsg.innerHTML;
  function toMenu() {
    state = State.MENU;
    overlayMsg.innerHTML = START_MSG;
    playBtn.textContent = "PLAY";
    overlay.classList.remove("hidden");
  }
  // 1 to 5 pick the colour while the start / game-over panel is up (each key
  // is shown under its swatch)
  if (window.GameShell) GameShell.menuKeys({ active: () => !overlay.classList.contains("hidden"), groups: [".swatch"] });

  // ---- Particles ----
  // (Visual FX off: no burst; the success ring's flash still marks the pop)
  function spawnBurst(angle, color, n = 16) {
    if (reducedMotion()) return;
    const ox = cx + Math.cos(angle) * R;
    const oy = cy + Math.sin(angle) * R;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(0.04, 0.22);
      particles.push({
        x: ox, y: oy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 1, color, size: rand(2, 5),
      });
    }
  }

  function updateHud() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
  }

  // ---- Render ----
  function draw(dt) {
    let sx = 0, sy = 0;
    if (shakeTime > 0) {
      shakeTime -= dt;
      const m = reducedMotion() ? 0 : (shakeTime / 320) * 8;
      sx = rand(-m, m); sy = rand(-m, m);
    }

    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(sx, sy);

    // Track ring
    ctx.lineWidth = Math.max(10, R * 0.085);
    ctx.strokeStyle = ringColor;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.stroke();

    // Success flash ring
    if (flash > 0) {
      flash = Math.max(0, flash - dt / 280);
      ctx.strokeStyle = `rgba(255,255,255,${flash * 0.85})`;
      ctx.lineWidth = Math.max(10, R * 0.085) + 8 * flash;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, TAU);
      ctx.stroke();
    }

    // Target notch (active play only): its round ends' tips at the window's
    // ends, target - tol and target + tol
    if (state === State.PLAY) {
      const capArc = Math.min(tol, notchW() / 2 / R);
      ctx.strokeStyle = "#ffd23f";
      ctx.lineCap = "round";
      ctx.lineWidth = notchW();
      ctx.shadowColor = "#ffd23f";
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(cx, cy, R, target - tol + capArc, target + tol - capArc);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineCap = "butt";
    }

    // The dial (sweeping ball)
    if (state !== State.MENU) {
      const dx = cx + Math.cos(dial) * R;
      const dy = cy + Math.sin(dial) * R;
      const rr = ballR();
      ctx.fillStyle = "#e8ecf5";
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(dx, dy, rr, 0, TAU);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Center readout
    ctx.fillStyle = "#e8ecf5";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (state === State.PLAY) {
      ctx.font = `800 ${R * 0.5}px "Segoe UI", system-ui, sans-serif`;
      ctx.fillText(score, cx, cy - R * 0.04);
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = `700 ${R * 0.13}px "Segoe UI", system-ui, sans-serif`;
      const remain = popsNeeded - popsDone;
      ctx.fillText(`${remain} TO UNLOCK`, cx, cy + R * 0.34);
    }

    // Visual FX off: no red burst at a miss, so a still red ring marks the spot
    if (missAt !== null && state === State.OVER && reducedMotion()) {
      ctx.strokeStyle = "#ff5d73";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(missAt) * R, cy + Math.sin(missAt) * R, Math.max(14, R * 0.12), 0, TAU);
      ctx.stroke();
    }

    // Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.97; p.vy *= 0.97;
      p.life -= dt / 700;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = clamp(p.life, 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---- Main loop ----
  // Pause (P / tab-switch). The dial freezes; draw() keeps running so
  // the lock stays on screen behind the overlay.
  const PAUSE = window.GameShell
    ? GameShell.pausable({ canPause: () => state === State.PLAY, restart: start, menu: toMenu })   // on the card: from 0 again, or back to the start panel and its colours
    : { isPaused: () => false };
  // Leaving asks first once a run has a pop to lose (paused or not); the best
  // is already saved on every pop
  if (window.GameShell) GameShell.guardLeave({ active: () => (PAUSE.isPaused() || state === State.PLAY) && score > 0, pausable: PAUSE });

  function loop(ts) {
    const dt = Math.min(48, ts - lastTs || 16);
    lastTs = ts;

    if (PAUSE.isPaused()) { drawBg(0); draw(0); requestAnimationFrame(loop); return; }
    if (state === State.PLAY) {
      dial += dir * speed * dt;
      dial = ((dial % TAU) + TAU) % TAU;
      traveled += speed * dt;
      if (traveled > exitTravel + pastArc()) fail(true); // swept wholly past without a tap
    }
    drawBg(dt);
    draw(dt);
    requestAnimationFrame(loop);
  }

  // ---- Boot ----
  resize();
  updateHud();
  requestAnimationFrame((t) => { lastTs = t; loop(t); });
})();
