/* =====================================================================
   POP THE LOCK — a vanilla-JS arcade remake
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
  const BEST_KEY = "popthelock.best";
  let best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0;
  bestEl.textContent = best;

  // ---- Background themes (player-selectable, persisted) ----
  // `ring` is the darker lock-band shade drawn on the canvas to match each bg.
  const THEMES = {
    teal:   { bg: "#2f8f7e", ring: "#237063" },
    indigo: { bg: "#3b4a7a", ring: "#2c3a63" },
    plum:   { bg: "#5a4a82", ring: "#44386b" },
    coral:  { bg: "#d96a5e", ring: "#b84f45" },
  };
  const THEME_KEY = "popthelock.theme";
  const themesEl = document.getElementById("themes");
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  let themeName = THEMES[localStorage.getItem(THEME_KEY)] ? localStorage.getItem(THEME_KEY) : "teal";
  let ringColor = THEMES[themeName].ring;

  function applyTheme(name) {
    if (!THEMES[name]) name = "teal";
    themeName = name;
    const t = THEMES[name];
    ringColor = t.ring;
    document.documentElement.style.background = t.bg;
    document.body.style.background = t.bg;
    if (themeMeta) themeMeta.setAttribute("content", t.bg);
    localStorage.setItem(THEME_KEY, name);
    themesEl.querySelectorAll(".swatch").forEach((s) =>
      s.classList.toggle("active", s.dataset.theme === name)
    );
  }
  themesEl.addEventListener("click", (e) => {
    const sw = e.target.closest(".swatch");
    if (sw) applyTheme(sw.dataset.theme);
  });
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
  let exitTravel = 0;      // travel at which the dial clears the far edge (rad)

  let score = 0;
  let level = 1;
  let popsNeeded = 1;
  let popsDone = 0;

  let particles = [];
  let canRestart = false;  // gates tap-to-restart until the game-over panel is up
  // Reduce-motion state for this game (live) — set by the top-right toggle / OS setting.
  const reducedMotion = () => !!(window.RM_ON && window.RM_ON());
  let shakeTime = 0;
  let flash = 0;           // success ring flash 0..1
  let lastTs = 0;

  // ---- Difficulty curve ----
  function baseSpeed(lvl) {
    // rad per ms — starts gentle, ramps up, soft cap
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
    overlay.classList.add("hidden");
    updateHud();
  }

  // Place a fresh notch ahead of the dial so there's reaction time.
  function placeTarget() {
    const lead = rand(Math.PI * 0.55, Math.PI * 1.25); // how far ahead, along travel
    target = (dial + dir * lead) % TAU;
    if (target < 0) target += TAU;
    traveled = 0;
    exitTravel = lead + tol; // dial slips past the notch once it sweeps this far
  }

  function pop() {
    score++;
    popsDone++;
    flash = 1;
    sndPop();
    spawnBurst(target, "#ffd23f");
    dir *= -1;                       // reverse sweep — the signature feel
    speed = baseSpeed(level) * (1 + popsDone * 0.015);
    if (popsDone >= popsNeeded) {
      levelUp();
    } else {
      placeTarget();
    }
    updateHud();
    if (score > best) { best = score; localStorage.setItem(BEST_KEY, best); bestEl.textContent = best; }
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
    placeTarget();
  }

  function fail(missedByPass = false) {
    state = State.OVER;
    canRestart = false;      // lock input so a stray tap can't skip the screen
    shakeTime = 320;
    stage.classList.add("shake");
    setTimeout(() => stage.classList.remove("shake"), 340);
    sndFail();
    spawnBurst(missedByPass ? target : dial, "#ff5d73", 30);
    const reason = missedByPass ? "Too slow — the dial slipped past!" : "Missed the mark!";
    overlayMsg.innerHTML = `${reason}<br>You reached <b>${score}</b> &nbsp;•&nbsp; Level <b>${level}</b>`;
    playBtn.textContent = "RETRY";
    // Only reveal the panel if we're still game-over — a quick restart tap
    // during this delay must not pop the overlay back over a live game.
    setTimeout(() => {
      if (state !== State.OVER) return;
      overlay.classList.remove("hidden");
      canRestart = true;     // now the panel is up — let the player retry
    }, 600);
  }

  // ---- Input ----
  function onTap() {
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
    if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); onTap(); }
  });
  playBtn.addEventListener("click", (e) => { e.stopPropagation(); start(); });

  // ---- Particles ----
  function spawnBurst(angle, color, n = 16) {
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

    // Target notch (active play only)
    if (state === State.PLAY) {
      ctx.strokeStyle = "#ffd23f";
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(12, R * 0.12);
      ctx.shadowColor = "#ffd23f";
      ctx.shadowBlur = 22;
      ctx.beginPath();
      ctx.arc(cx, cy, R, target - tol, target + tol);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineCap = "butt";
    }

    // The dial (sweeping ball)
    if (state !== State.MENU) {
      const dx = cx + Math.cos(dial) * R;
      const dy = cy + Math.sin(dial) * R;
      const rr = Math.max(9, R * 0.075);
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
  function loop(ts) {
    const dt = Math.min(48, ts - lastTs || 16);
    lastTs = ts;

    if (state === State.PLAY) {
      dial += dir * speed * dt;
      dial = ((dial % TAU) + TAU) % TAU;
      traveled += speed * dt;
      if (traveled > exitTravel) fail(true); // swept past without a tap
    }
    draw(dt);
    requestAnimationFrame(loop);
  }

  // ---- Boot ----
  resize();
  updateHud();
  requestAnimationFrame((t) => { lastTs = t; loop(t); });
})();
