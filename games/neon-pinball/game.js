/* =====================================================================
   NEON PINBALL — physics pinball with three selectable tables.
   Shared cabinet "shell" (plunger lane, funnels, drain, main flippers)
   guarantees launch/drain always work; each table layers its own
   interior: bumpers, target banks, lanes, scoops/locks, extra flippers,
   a mini upper playfield, and theming. Web-Audio SFX, no assets.
   ===================================================================== */
(() => {
  "use strict";

  const canvas = document.getElementById("pf");
  const ctx = canvas.getContext("2d");
  const W = 440, H = 760;
  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  fit(); window.addEventListener("resize", fit);
  const reduced = () => !!(window.RM_ON && window.RM_ON());

  // ---------- audio ----------
  let actx = null, master = null;
  function AC() {
    if (!actx) { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = 0.9; master.connect(actx.destination); }
    if (actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, slideTo) {
    try {
      const a = AC(), t = a.currentTime, o = a.createOscillator(), g = a.createGain();
      o.type = type || "sine"; o.frequency.setValueAtTime(f, t);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) {}
  }
  function noise(dur, vol, freq, q) {
    try {
      const a = AC(), t = a.currentTime, len = (a.sampleRate * dur) | 0;
      const buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = a.createBufferSource(); src.buffer = buf;
      const bp = a.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq || 1200; bp.Q.value = q || 1;
      const g = a.createGain(); g.gain.value = vol;
      src.connect(bp); bp.connect(g); g.connect(master); src.start(t);
    } catch (e) {}
  }
  const SFX = {
    flip: () => tone(180, 0.05, "square", 0.12, 90),
    bump: () => { tone(280, 0.12, "sine", 0.3, 150); noise(0.06, 0.12, 800, 1); },
    sling: () => tone(520, 0.07, "triangle", 0.22, 300),
    target: () => tone(740, 0.09, "square", 0.18, 880),
    lane: () => tone(990, 0.07, "triangle", 0.16, 1200),
    spin: () => tone(420 + Math.random() * 120, 0.04, "sawtooth", 0.08),
    scoop: () => { tone(300, 0.18, "sine", 0.24, 760); noise(0.1, 0.1, 500, 0.8); },
    kick: () => tone(160, 0.18, "square", 0.26, 540),
    bankDone: () => [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.14, "triangle", 0.22), i * 70)),
    launch: () => { tone(180, 0.3, "sawtooth", 0.18, 700); noise(0.25, 0.08, 600, 0.8); },
    drain: () => tone(300, 0.5, "sine", 0.22, 70),
    multiball: () => [392, 523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.2, "square", 0.22), i * 90)),
    jackpot: () => [880, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.16, "triangle", 0.26), i * 60)),
    tilt: () => { tone(110, 0.4, "sawtooth", 0.3, 70); noise(0.4, 0.18, 200, 0.6); },
    bonus: () => tone(660, 0.05, "triangle", 0.14),
    extra: () => [659, 988, 1319].forEach((f, i) => setTimeout(() => tone(f, 0.18, "sine", 0.24), i * 80)),
  };

  // ---------- math / collision ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  function closest(px, py, ax, ay, bx, by) {
    const abx = bx - ax, aby = by - ay;
    const t = clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby || 1), 0, 1);
    return { x: ax + abx * t, y: ay + aby * t };
  }
  function collideSeg(b, ax, ay, bx, by, segR, rest, surf, oneway) {
    const p = closest(b.x, b.y, ax, ay, bx, by);
    let dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
    const minD = b.r + segR;
    if (d >= minD) return null;
    if (oneway && b.vy <= 0) return null;
    if (d < 1e-6) { dx = 0; dy = -1; d = 1; }
    const nx = dx / d, ny = dy / d;
    b.x = p.x + nx * minD; b.y = p.y + ny * minD;
    const sx = surf ? surf.x : 0, sy = surf ? surf.y : 0;
    const vn = (b.vx - sx) * nx + (b.vy - sy) * ny;
    if (vn < 0) { const j = -(1 + rest) * vn; b.vx += j * nx; b.vy += j * ny; }
    return { nx, ny };
  }
  function collideCircle(b, cx, cy, cr, rest, kick) {
    let dx = b.x - cx, dy = b.y - cy, d = Math.hypot(dx, dy);
    const minD = b.r + cr;
    if (d >= minD) return null;
    if (d < 1e-6) { dx = 0; dy = -1; d = 1; }
    const nx = dx / d, ny = dy / d;
    b.x = cx + nx * minD; b.y = cy + ny * minD;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { const j = -(1 + rest) * vn; b.vx += j * nx; b.vy += j * ny; }
    if (kick) { b.vx += nx * kick; b.vy += ny * kick; }
    return { nx, ny };
  }

  // ---------- shared cabinet shell ----------
  function instFlip(s) {
    const rest = s.rest != null ? s.rest : (s.side === "L" ? 0.40 : Math.PI - 0.40);
    const act = s.act != null ? s.act : (s.side === "L" ? -0.52 : Math.PI + 0.52);
    return { px: s.px, py: s.py, len: s.len || 62, r: s.r || 9, side: s.side, key: s.key || s.side,
             theta: rest, prev: rest, rest, act, target: rest, omega: 0, up: false };
  }
  function shellWalls() {
    return [
      // top arc
      [30,150,40,90],[40,90,92,52],[92,52,180,38],[180,38,300,38],[300,38,372,56],[372,56,408,104],[408,104,414,150],
      // sides + funnels
      [30,150,30,520],[30,520,44,562],[44,562,138,690],
      [388,150,388,520],[388,520,374,562],[374,562,302,690],
      // plunger lane
      [388,520,388,760],[414,150,414,760],
    ];
  }
  function shellExtras() {
    return {
      gate: [388,150,414,150],
      slings: [
        { ax:104, ay:598, bx:138, by:652, apex:{x:148,y:592}, lit:0 },
        { ax:336, ay:598, bx:302, by:652, apex:{x:292,y:592}, lit:0 },
      ],
      posts: [{ x:112, y:656, r:6 }, { x:328, y:656, r:6 }],
      mainFlippers: [{ px:138, py:694, side:"L", key:"L", len:64 }, { px:302, py:694, side:"R", key:"R", len:64 }],
      ballStart: { x:401, y:720 },
    };
  }

  // ---------- table builders ----------
  function baseTable(extraWalls, parts) {
    const ex = shellExtras();
    const t = {
      walls: shellWalls().concat(extraWalls || []),
      gate: ex.gate, slings: ex.slings, posts: ex.posts.concat(parts.posts || []), ballStart: ex.ballStart,
      bumpers: parts.bumpers || [],
      targets: parts.targets || [],
      lanes: parts.lanes || [],
      spinners: parts.spinners || [],
      scoops: parts.scoops || [],
      flipperSpecs: ex.mainFlippers.concat(parts.extraFlippers || []),
      theme: parts.theme,
      gravity: parts.gravity || 1500,
      launch: parts.launch || 720,
      lockGoal: parts.lockGoal || 2,
      label: parts.label,
    };
    return t;
  }

  // helper: vertical target bank
  function vbank(x, ys, h, bank) { return ys.map((y) => ({ ax: x, ay: y - h, bx: x, by: y + h, down: false, lit: 0, bank, resetAt: 0 })); }
  function hbank(y, xs, hw, bank) { return xs.map((x) => ({ ax: x - hw, ay: y, bx: x + hw, by: y, down: false, lit: 0, bank, resetAt: 0 })); }

  // 1) CLASSIC FAN -----------------------------------------------------
  function tableClassic() {
    const theme = { bg1:"#1a1140", bg2:"#0a0618", wall:"#3aa9ff", glow:"rgba(54,245,255,0.6)",
      bumper1:"#ffd23f", bumper2:"#a06a00", ring:"#ff7df0", target:"#ff3df0", scoop:"#36f5ff", lane:"#ffd23f", flip:"#36f5ff" };
    const interior = [
      // clean fan guide rails along the upper sides (open channels, no traps)
      [70,150,70,238],[70,238,102,280],
      [348,150,348,238],[348,238,318,280],
    ];
    return baseTable(interior, {
      theme, label:"CLASSIC FAN", gravity:1430, launch:1480,
      bumpers: [{ x:165, y:235, r:24, lit:0 }, { x:275, y:235, r:24, lit:0 }, { x:220, y:182, r:24, lit:0 }],
      targets: vbank(58, [302, 344, 386], 16, "L").concat(vbank(360, [302, 344, 386], 16, "R")),
      lanes: [{ cx:168, y:92, hw:16, h:46, lit:false }, { cx:220, y:92, hw:16, h:46, lit:false }, { cx:272, y:92, hw:16, h:46, lit:false }],
      spinners: [{ x0:78, x1:104, y0:300, y1:372 }],
      scoops: [{ x:220, y:330, r:15, kind:"lock", value:1500, eject:-Math.PI/2, power:560, lit:0, coolUntil:0 }],
      posts: [{ x:130, y:500, r:7 }, { x:310, y:500, r:7 }],
      lockGoal: 2,
    });
  }

  // 2) SYNTHWAVE SPEEDWAY ---------------------------------------------
  function tableSpeedway() {
    const theme = { bg1:"#2a0a40", bg2:"#0a0418", wall:"#b06bff", glow:"rgba(176,107,255,0.6)",
      bumper1:"#ff3df0", bumper2:"#80127a", ring:"#ffd23f", target:"#c060ff", scoop:"#b06bff", lane:"#ff3df0", flip:"#c060ff" };
    const interior = [
      // long left orbit lane (inner wall) — a fast outer channel
      [56,160,56,470],[56,470,82,520],
      // a short guide rail on the right
      [360,150,360,300],
    ];
    return baseTable(interior, {
      theme, label:"SPEEDWAY",
      gravity: 1560, launch: 1650,
      bumpers: [{ x:250, y:208, r:22, lit:0 }, { x:304, y:262, r:22, lit:0 }],
      targets: vbank(376, [372, 410, 448], 16, "R"),
      lanes: [{ cx:200, y:88, hw:16, h:44, lit:false }, { cx:252, y:88, hw:16, h:44, lit:false }],
      spinners: [{ x0:32, x1:56, y0:200, y1:430 }],   // the left orbit reads as a spinner lane
      scoops: [{ x:96, y:300, r:16, kind:"lock", value:2500, eject:-Math.PI/2.3, power:640, lit:0, coolUntil:0, label:"MEGA" }],
      posts: [{ x:298, y:360, r:7 }],
      extraFlippers: [{ px:330, py:430, side:"R", key:"R", len:52, rest:Math.PI-0.32, act:Math.PI+0.48 }],
      lockGoal: 2,
    });
  }

  // 3) CYBER-NOIR TACTICAL --------------------------------------------
  function tableTactical() {
    const theme = { bg1:"#08291a", bg2:"#03140c", wall:"#39e6a0", glow:"rgba(57,230,160,0.6)",
      bumper1:"#9bf5c0", bumper2:"#0d6e46", ring:"#ffd23f", target:"#46e6a0", scoop:"#39e6a0", lane:"#9bf5c0", flip:"#46e6a0" };
    const interior = [
      // open guide rails near the upper sides
      [60,150,60,240],[380,150,380,240],
    ];
    return baseTable(interior, {
      theme, label:"TACTICAL", gravity:1430, launch:1500,
      bumpers: [{ x:250, y:250, r:20, lit:0 }, { x:304, y:206, r:20, lit:0 }],
      targets: hbank(424, [150, 186, 222], 15, "A").concat(vbank(364, [286, 322, 358], 15, "B")),
      lanes: [{ cx:236, y:70, hw:15, h:40, lit:false }, { cx:286, y:70, hw:15, h:40, lit:false }],
      spinners: [],
      posts: [{ x:128, y:480, r:7 }, { x:312, y:480, r:7 }],
      scoops: [
        { x:208, y:330, r:15, kind:"score", value:750, eject:-Math.PI/2, power:540, lit:0, coolUntil:0 },
        { x:300, y:330, r:15, kind:"lock", value:1200, eject:-Math.PI/2, power:560, lit:0, coolUntil:0 },
        { x:330, y:470, r:14, kind:"score", value:600, eject:-Math.PI/1.7, power:560, lit:0, coolUntil:0 },
      ],
      lockGoal: 2,
    });
  }
  // tactical pocket bumper added after build (needs to live with bumpers array)
  const TABLES = {
    classic: tableClassic,
    speedway: tableSpeedway,
    tactical: tableTactical,
  };

  // ---------- game state ----------
  let T = null, currentMode = "classic";
  let balls = [], flippers = [];
  let score = 0, best = 0, ballNum = 1, mult = 1, bonus = 0;
  let state = "start";
  let locks = 0, multiball = false, jackpotLit = false;
  let saveUntil = 0, saveUsed = false, tiltMeter = 0, tilted = false;
  let shake = 0, flash = 0, flashColor = "255,61,240";
  let bankReset = false;
  const MAX_BALLS = 3;
  const $ = (id) => document.getElementById(id);
  best = parseInt(localStorage.getItem("pinball_best") || "0", 10) || 0;

  function ticker(msg, color) {
    const el = $("ticker"); el.textContent = msg; if (color) el.style.color = color;
    el.classList.remove("show"); void el.offsetWidth; el.classList.add("show");
    clearTimeout(ticker._t); ticker._t = setTimeout(() => el.classList.remove("show"), 1100);
  }
  const addScore = (n) => { score += Math.round(n * mult); };
  const addBonus = (n) => { bonus += n; };
  const flashPulse = (v, c) => { if (!reduced()) { flash = Math.max(flash, v); if (c) flashColor = c; } };
  const addShake = (v) => { if (!reduced()) shake = Math.max(shake, v); };

  // ---------- ball lifecycle ----------
  function newBall() { return { x: T.ballStart.x, y: T.ballStart.y, vx: 0, vy: 0, r: 9, inLane: true, lane: {}, spin: {}, captured: null, captureT: 0, trail: [], stuckT: 0 }; }
  function startBall() {
    balls = [newBall()];
    plunger.charge = 0; mult = 1; bonus = 0; tiltMeter = 0; tilted = false;
    saveUntil = performance.now() + 7000; saveUsed = false; multiball = false; jackpotLit = false;
    T.lanes.forEach((l) => (l.lit = false));
    $("lampTilt").classList.remove("on"); $("lampMb").classList.remove("on");
    state = "ready"; updateHUD(); flipHint();
  }
  const plunger = { charge: 0, pulling: false };
  function launch() {
    if (state !== "ready") return;
    const b = balls[0];
    const power = T.launch * (0.6 + 0.45 * plunger.charge);
    b.vy = -power; b.vx = (Math.random() - 0.5) * 20; b.inLane = false;
    plunger.charge = 0; plunger.pulling = false; state = "play";
    SFX.launch(); $("launchBtn").classList.remove("show"); $("flipHint").textContent = "";
  }
  function drainBall(b) {
    const i = balls.indexOf(b); if (i >= 0) balls.splice(i, 1);
    if (balls.length > 0) {
      if (multiball && balls.length === 1) { multiball = false; jackpotLit = false; $("lampMb").classList.remove("on"); ticker("MULTIBALL OVER", "#9b8ec9"); }
      return;
    }
    if (!multiball && !tilted && !saveUsed && performance.now() < saveUntil) {
      saveUsed = true; ticker("BALL SAVED", "#46e6a0"); SFX.extra();
      balls = [newBall()]; state = "ready"; plunger.charge = 0; flipHint(); updateHUD(); return;
    }
    SFX.drain(); state = "drain"; endOfBall();
  }
  function endOfBall() {
    let b = bonus;
    const tick = () => {
      if (b <= 0) { afterBonus(); return; }
      const take = Math.min(Math.max(50, Math.round(b / 12)), b); b -= take;
      score += take * mult; SFX.bonus(); updateHUD(); setTimeout(tick, 45);
    };
    if (b > 0) { ticker("BONUS x" + mult, "#ffd23f"); setTimeout(tick, 500); } else setTimeout(afterBonus, 300);
  }
  function afterBonus() {
    if (score > best) { best = score; localStorage.setItem("pinball_best", best); }
    ballNum++; if (ballNum > MAX_BALLS) { gameOver(); return; } startBall();
  }
  function gameOver() {
    state = "over";
    $("finalScore").textContent = score.toLocaleString();
    $("overBest").textContent = "BEST  " + best.toLocaleString();
    $("overScreen").classList.remove("hidden"); updateHUD();
  }

  // ---------- features ----------
  function bumperHit(bm) {
    bm.lit = 1; addScore(100); addBonus(50); SFX.bump(); flashPulse(0.22, "255,61,240");
    if (multiball && jackpotLit) { addScore(1500); ticker("JACKPOT", "#36f5ff"); SFX.jackpot(); }
  }
  function slingHit(s) { s.lit = 1; addScore(50); addBonus(20); SFX.sling(); }
  function targetHit(t) {
    if (t.down) return;
    t.down = true; t.lit = 1; addScore(250); addBonus(60); SFX.target();
    const bankT = T.targets.filter((x) => x.bank === t.bank);
    if (bankT.every((x) => x.down)) { addScore(2000); addBonus(300); SFX.bankDone(); onLock("BANK"); bankT.forEach((x) => (x.resetAt = performance.now() + 1300)); }
  }
  function laneEnter(l) {
    if (l.lit) return;
    l.lit = true; addScore(120); addBonus(40); SFX.lane();
    if (T.lanes.every((x) => x.lit)) { T.lanes.forEach((x) => (x.lit = false)); if (mult < 6) { mult++; ticker("MULTIPLIER x" + mult, "#ffd23f"); } addScore(1000); SFX.extra(); updateHUD(); }
  }
  function spinnerPass(sp, speed) {
    const n = Math.max(1, Math.round(speed / 130));
    sp.spin = 14; addScore(30 * n); addBonus(10 * n); SFX.spin();
  }
  function captureBall(b, sc) {
    b.captured = sc; b.captureT = performance.now() + 650; b.vx = b.vy = 0;
    addScore(sc.value); addBonus(120); sc.lit = 1; SFX.scoop();
    if (sc.kind === "lock") onLock(sc.label || "LOCK");
  }
  function ejectBall(b) {
    const sc = b.captured; b.captured = null; sc.coolUntil = performance.now() + 500;
    const ang = sc.eject != null ? sc.eject : -Math.PI / 2, pw = sc.power || 540;
    b.x = sc.x; b.y = sc.y - 4; b.vx = Math.cos(ang) * pw; b.vy = Math.sin(ang) * pw; SFX.kick();
  }
  function onLock(label) {
    if (multiball) { addScore(1500); return; }
    locks++;
    if (locks >= T.lockGoal) { startMultiball(); }
    else { ticker((label || "LOCK") + " " + locks + "/" + T.lockGoal, "#ff3df0"); }
  }
  function startMultiball() {
    multiball = true; jackpotLit = true; locks = 0; $("lampMb").classList.add("on");
    ticker("MULTIBALL!", "#ff3df0"); SFX.multiball(); flashPulse(0.6, "255,61,240");
    for (let i = 0; i < 2; i++) { const nb = newBall(); nb.inLane = false; nb.x = 200 + i * 40; nb.y = 220; nb.vx = (Math.random() - 0.5) * 120; nb.vy = -60; balls.push(nb); }
  }
  function nudge(dir) {
    if (tilted || state !== "play") return;
    balls.forEach((b) => { if (!b.captured) { b.vx += dir * 90; b.vy -= 40; } });
    tiltMeter += 0.34; addShake(3);
    if (tiltMeter >= 1) { tilted = true; $("lampTilt").classList.add("on"); ticker("TILT", "#ff5d6c"); SFX.tilt(); addShake(8); flippers.forEach((f) => { f.target = f.rest; f.up = false; }); }
  }

  // ---------- physics ----------
  const MAXV = 1750, SUB = 7;
  function flipTip(f) { return { x: f.px + f.len * Math.cos(f.theta), y: f.py + f.len * Math.sin(f.theta) }; }
  function updateFlip(f, dt) {
    f.prev = f.theta;
    const sp = 40, dir = Math.sign(f.target - f.theta), step = sp * dt;
    if (Math.abs(f.target - f.theta) <= step) f.theta = f.target; else f.theta += dir * step;
    f.omega = (f.theta - f.prev) / dt;
  }
  function physics(dt) {
    flippers.forEach((f) => updateFlip(f, dt));
    // reset completed banks after their timer
    T.targets.forEach((t) => { if (t.resetAt && performance.now() > t.resetAt) { t.down = false; t.resetAt = 0; } });

    const sub = dt / SUB;
    for (let s = 0; s < SUB; s++) {
      for (let bi = balls.length - 1; bi >= 0; bi--) {
        const b = balls[bi];
        if (b.captured) { b.x = b.captured.x; b.y = b.captured.y; if (performance.now() >= b.captureT) ejectBall(b); continue; }
        if (b.inLane) { b.x = T.ballStart.x; b.vx = 0; b.vy += T.gravity * sub * 0.2; b.y += b.vy * sub; if (b.y > 724) { b.y = 724; b.vy = 0; } continue; }

        b.vy += T.gravity * sub;
        const spd = Math.hypot(b.vx, b.vy); if (spd > MAXV) { b.vx *= MAXV / spd; b.vy *= MAXV / spd; }
        b.x += b.vx * sub; b.y += b.vy * sub;

        for (const w of T.walls) collideSeg(b, w[0], w[1], w[2], w[3], 4, 0.42);
        collideSeg(b, T.gate[0], T.gate[1], T.gate[2], T.gate[3], 4, 0.2, null, true);
        for (const p of T.posts) collideCircle(b, p.x, p.y, p.r, 0.5);
        for (const bm of T.bumpers) { if (collideCircle(b, bm.x, bm.y, bm.r, 0.55, 360)) bumperHit(bm); }
        for (const sl of T.slings) { const h = collideSeg(b, sl.ax, sl.ay, sl.bx, sl.by, 6, 0.4); if (h) { b.vx += h.nx * 300; b.vy += h.ny * 300; slingHit(sl); } }
        for (const t of T.targets) { if (!t.down && collideSeg(b, t.ax, t.ay, t.bx, t.by, 5, 0.3)) targetHit(t); }
        for (const f of flippers) {
          const tip = flipTip(f), p = closest(b.x, b.y, f.px, f.py, tip.x, tip.y);
          const rx = p.x - f.px, ry = p.y - f.py, surf = { x: -f.omega * ry, y: f.omega * rx };
          const h = collideSeg(b, f.px, f.py, tip.x, tip.y, f.r, 0.32, surf);
          if (h && f.omega !== 0) { b.vx += surf.x * 0.42; b.vy += surf.y * 0.42; }
        }
        // scoops (capture)
        for (const sc of T.scoops) { if (performance.now() > sc.coolUntil && Math.hypot(b.x - sc.x, b.y - sc.y) < sc.r) { captureBall(b, sc); break; } }

        if (b.y > H + 30) { drainBall(b); continue; }
      }
    }

    // per-frame triggers
    for (const b of balls) {
      if (b.inLane || b.captured) continue;
      T.lanes.forEach((l, li) => {
        const inside = Math.abs(b.x - l.cx) < l.hw && b.y > l.y - l.h / 2 && b.y < l.y + l.h / 2;
        if (inside && !b.lane[li]) { b.lane[li] = true; laneEnter(l); } else if (!inside) b.lane[li] = false;
      });
      T.spinners.forEach((sp, si) => {
        const inside = b.x > sp.x0 && b.x < sp.x1 && b.y > sp.y0 && b.y < sp.y1;
        if (inside && !b.spin[si]) { b.spin[si] = true; spinnerPass(sp, Math.abs(b.vy) + Math.abs(b.vx)); } else if (!inside) b.spin[si] = false;
      });
    }

    // anti-stuck "ball search": free any ball wedged motionless in the playfield
    for (const b of balls) {
      if (b.inLane || b.captured) { b.stuckT = 0; continue; }
      if (Math.hypot(b.vx, b.vy) < 55 && b.y < 660) b.stuckT += dt; else b.stuckT = 0;
      if (b.stuckT > 1.3) {
        const ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.7;
        b.vx += Math.cos(ang) * 320; b.vy += Math.sin(ang) * 320;
        b.stuckT = 0; addShake(2); SFX.spin();
      }
    }

    T.bumpers.forEach((bm) => (bm.lit *= 0.86));
    T.slings.forEach((s) => (s.lit *= 0.8));
    T.targets.forEach((t) => (t.lit *= 0.9));
    T.scoops.forEach((sc) => (sc.lit *= 0.9));
    T.spinners.forEach((sp) => { if (sp.spin > 0) sp.spin -= 1; });
    if (!tilted) tiltMeter = Math.max(0, tiltMeter - dt * 0.5);
    flash *= 0.88; shake *= 0.85;
    updateHUD();
  }

  // ---------- HUD ----------
  let hudCache = "";
  function updateHUD() {
    $("lampSave").classList.toggle("on", state !== "over" && state !== "start" && !saveUsed && performance.now() < saveUntil && !multiball);
    const sig = score + "|" + ballNum + "|" + mult + "|" + best; if (sig === hudCache) return; hudCache = sig;
    $("score").textContent = score.toLocaleString(); $("balls").textContent = ballNum;
    $("mult").textContent = "x" + mult; $("best").textContent = best.toLocaleString();
  }
  function flipHint() {
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (state === "ready") { $("flipHint").textContent = coarse ? "" : "Hold SPACE, release to launch"; if (coarse) $("launchBtn").classList.add("show"); }
  }

  // ---------- render ----------
  function draw() {
    const th = T ? T.theme : { bg1:"#1a1140", bg2:"#0a0618", wall:"#3aa9ff", glow:"rgba(54,245,255,.6)" };
    let ox = 0, oy = 0;
    if (shake > 0.3) { ox = (Math.random() - 0.5) * shake; oy = (Math.random() - 0.5) * shake; }
    ctx.save(); ctx.clearRect(0, 0, W, H); ctx.translate(ox, oy);

    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, th.bg1); bg.addColorStop(0.55, "#0c0720"); bg.addColorStop(1, th.bg2);
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = th.glow.replace("0.6", "0.05"); ctx.lineWidth = 1;
    for (let gx = 40; gx < W; gx += 36) { ctx.beginPath(); ctx.moveTo(gx, 30); ctx.lineTo(gx, H - 20); ctx.stroke(); }
    for (let gy = 60; gy < H; gy += 40) { ctx.beginPath(); ctx.moveTo(24, gy); ctx.lineTo(W - 24, gy); ctx.stroke(); }

    if (!T) { ctx.restore(); return; }

    // faint table wordmark + fan arcs behind the play
    ctx.save();
    ctx.font = "900 60px Orbitron, system-ui, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = th.glow.replace("0.6", "0.06");
    ctx.fillText((T.label || "").split(" ")[0], 220, 400);
    ctx.strokeStyle = th.glow.replace("0.6", "0.12"); ctx.lineWidth = 2;
    for (let r = 70; r <= 150; r += 26) { ctx.beginPath(); ctx.arc(220, 58, r, 0.16 * Math.PI, 0.84 * Math.PI); ctx.stroke(); }
    ctx.restore();

    // lanes
    T.lanes.forEach((l) => {
      ctx.fillStyle = l.lit ? "rgba(255,210,63,0.22)" : "rgba(255,255,255,0.04)";
      ctx.fillRect(l.cx - l.hw, l.y - l.h / 2, l.hw * 2, l.h);
      ctx.fillStyle = l.lit ? th.lane : "#534a73"; ctx.beginPath(); ctx.arc(l.cx, l.y - l.h / 2 + 6, 3.5, 0, 7); ctx.fill();
    });
    // spinners
    T.spinners.forEach((sp) => {
      ctx.strokeStyle = th.glow.replace("0.6", String(0.25 + (sp.spin / 14) * 0.6)); ctx.lineWidth = sp.spin > 0 ? 4 : 2;
      const cx = (sp.x0 + sp.x1) / 2;
      for (let y = sp.y0 + 10; y < sp.y1; y += 18) { ctx.beginPath(); ctx.moveTo(cx - 9, y); ctx.lineTo(cx + 9, y + (sp.spin > 0 ? 6 : 0)); ctx.stroke(); }
    });

    // walls — neon tube (wide glow + bright core)
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.shadowColor = th.glow; ctx.shadowBlur = 16; ctx.strokeStyle = th.wall; ctx.lineWidth = 6;
    T.walls.forEach((w) => { ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]); ctx.stroke(); });
    ctx.shadowBlur = 0; ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 1.5;
    T.walls.forEach((w) => { ctx.beginPath(); ctx.moveTo(w[0], w[1]); ctx.lineTo(w[2], w[3]); ctx.stroke(); });

    // posts
    T.posts.forEach((p) => { ctx.fillStyle = th.wall; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); });

    // scoops (glowing holes / up-kickers)
    T.scoops.forEach((sc) => {
      ctx.shadowColor = th.glow; ctx.shadowBlur = 10 + sc.lit * 22;
      ctx.fillStyle = "#05140d"; ctx.beginPath(); ctx.arc(sc.x, sc.y, sc.r, 0, 7); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = sc.lit > 0.2 ? "#fff" : (sc.kind === "lock" ? th.ring : th.scoop);
      ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sc.x, sc.y, sc.r, 0, 7); ctx.stroke();
      if (sc.kind === "lock") { ctx.fillStyle = sc.lit > 0.2 ? "#fff" : th.ring; ctx.beginPath(); ctx.arc(sc.x, sc.y, 3, 0, 7); ctx.fill(); }
    });

    // targets
    T.targets.forEach((t) => {
      ctx.lineCap = "round";
      if (t.down) { ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 5; }
      else { ctx.strokeStyle = t.lit > 0.1 ? "#fff" : th.target; ctx.lineWidth = 9; ctx.shadowColor = th.glow; ctx.shadowBlur = 8; }
      ctx.beginPath(); ctx.moveTo(t.ax, t.ay); ctx.lineTo(t.bx, t.by); ctx.stroke(); ctx.shadowBlur = 0;
    });

    // slingshots
    T.slings.forEach((s) => {
      ctx.beginPath(); ctx.moveTo(s.ax, s.ay); ctx.lineTo(s.bx, s.by); ctx.lineTo(s.apex.x, s.apex.y); ctx.closePath();
      ctx.fillStyle = s.lit > 0.1 ? "#fff" : th.glow.replace("0.6", "0.22"); ctx.fill();
      ctx.strokeStyle = th.wall; ctx.lineWidth = 2; ctx.stroke();
    });

    // bumpers
    T.bumpers.forEach((bm) => {
      ctx.shadowColor = th.glow; ctx.shadowBlur = 12 + bm.lit * 24;
      const g = ctx.createRadialGradient(bm.x - 6, bm.y - 6, 3, bm.x, bm.y, bm.r);
      g.addColorStop(0, bm.lit > 0.2 ? "#fff" : th.bumper1); g.addColorStop(1, th.bumper2);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bm.x, bm.y, bm.r, 0, 7); ctx.fill();
      ctx.shadowBlur = 0; ctx.strokeStyle = th.ring; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bm.x, bm.y, Math.max(2, bm.r - 5), 0, 7); ctx.stroke();
    });

    // flippers
    flippers.forEach((f) => {
      const tip = flipTip(f);
      ctx.shadowColor = th.glow; ctx.shadowBlur = 10;
      ctx.strokeStyle = th.flip; ctx.lineWidth = f.r * 2; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(f.px, f.py); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = th.bg2; ctx.beginPath(); ctx.arc(f.px, f.py, Math.max(2, f.r - 3), 0, 7); ctx.fill();
    });

    // plunger charge
    if (state === "ready") {
      const h = 60 * plunger.charge; ctx.fillStyle = "rgba(255,210,63,0.7)"; ctx.fillRect(396, 752 - h, 10, h);
      ctx.strokeStyle = "#534a73"; ctx.strokeRect(396, 692, 10, 60);
    }

    // balls (with motion trail)
    balls.forEach((b) => {
      if (!b.captured && !b.inLane) { b.trail.push({ x: b.x, y: b.y }); if (b.trail.length > 7) b.trail.shift(); }
      else b.trail.length = 0;
      if (!reduced()) {
        for (let i = 0; i < b.trail.length; i++) {
          const p = b.trail[i];
          ctx.fillStyle = "rgba(255,255,255," + (i / b.trail.length) * 0.35 + ")";
          ctx.beginPath(); ctx.arc(p.x, p.y, b.r * (0.4 + 0.5 * i / b.trail.length), 0, 7); ctx.fill();
        }
      }
      ctx.shadowColor = "rgba(255,255,255,0.6)"; ctx.shadowBlur = 10;
      const g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, b.r);
      g.addColorStop(0, "#fff"); g.addColorStop(0.5, "#cfd6e6"); g.addColorStop(1, "#6b7490");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    });

    if (state === "play" && tiltMeter > 0.02) {
      ctx.fillStyle = tilted ? "#ff5d6c" : "rgba(255,210,63," + (0.4 + tiltMeter * 0.6) + ")";
      ctx.fillRect(34, 742, 60 * Math.min(1, tiltMeter), 5); ctx.strokeStyle = "#534a73"; ctx.strokeRect(34, 742, 60, 5);
    }
    // vignette for depth
    const vg = ctx.createRadialGradient(220, 360, 210, 220, 360, 500);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(0,0,0,0.42)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    ctx.restore();

    if (flash > 0.02) { ctx.save(); ctx.fillStyle = "rgba(" + flashColor + "," + (flash * 0.35) + ")"; ctx.fillRect(0, 0, W, H); ctx.restore(); }
  }

  // ---------- loop ----------
  let last = 0;
  function loop(ts) {
    const dt = Math.min(0.033, (ts - last) / 1000 || 0.016); last = ts;
    if (state === "play" || state === "ready") {
      if (state === "ready" && plunger.pulling) plunger.charge = Math.min(1, plunger.charge + dt * 1.1);
      physics(dt);
    }
    draw(); requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- input ----------
  function setFlip(ctrl, up) {
    if (tilted) return;
    flippers.forEach((f) => { if (f.key === ctrl) { f.up = up; f.target = up ? f.act : f.rest; } });
    if (up) SFX.flip();
  }
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(k)) e.preventDefault();
    if (e.repeat) return;
    if (state === "start" || state === "over") return;
    if (k === "arrowleft" || k === "a") setFlip("L", true);
    else if (k === "arrowright" || k === "l") setFlip("R", true);
    else if (k === " " || k === "arrowdown") { if (state === "ready") plunger.pulling = true; }
    else if (k === "z") nudge(-1);
    else if (k === "m" || k === "x") nudge(1);
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === "arrowleft" || k === "a") setFlip("L", false);
    else if (k === "arrowright" || k === "l") setFlip("R", false);
    else if (k === " " || k === "arrowdown") { if (state === "ready" && plunger.pulling) launch(); }
  });

  const activeTouch = {};
  function touchSide(e, down) {
    for (const t of e.changedTouches) {
      const rect = canvas.getBoundingClientRect(), left = (t.clientX - rect.left) < rect.width / 2;
      if (down) { activeTouch[t.identifier] = left ? "L" : "R"; setFlip(activeTouch[t.identifier], true); }
      else if (activeTouch[t.identifier]) { setFlip(activeTouch[t.identifier], false); delete activeTouch[t.identifier]; }
    }
    e.preventDefault();
  }
  canvas.addEventListener("touchstart", (e) => touchSide(e, true), { passive: false });
  canvas.addEventListener("touchend", (e) => touchSide(e, false), { passive: false });
  canvas.addEventListener("touchcancel", (e) => touchSide(e, false), { passive: false });
  const lb = $("launchBtn");
  lb.addEventListener("touchstart", (e) => { e.preventDefault(); e.stopPropagation(); if (state === "ready") plunger.pulling = true; }, { passive: false });
  lb.addEventListener("touchend", (e) => { e.preventDefault(); e.stopPropagation(); if (state === "ready" && plunger.pulling) launch(); }, { passive: false });
  lb.addEventListener("click", () => { if (state === "ready") { plunger.charge = 0.85; launch(); } });

  // ---------- start ----------
  function startGame(mode) {
    AC(); currentMode = mode || currentMode;
    T = TABLES[currentMode]();
    flippers = T.flipperSpecs.map(instFlip);
    score = 0; ballNum = 1; locks = 0; hudCache = "";
    $("startScreen").classList.add("hidden"); $("overScreen").classList.add("hidden");
    startBall();
  }
  document.querySelectorAll(".mode-card").forEach((c) => c.addEventListener("click", () => startGame(c.dataset.mode)));
  $("againBtn").addEventListener("click", () => startGame(currentMode));
  $("modesBtn").addEventListener("click", () => { $("overScreen").classList.add("hidden"); $("startScreen").classList.remove("hidden"); });
  $("startBest").textContent = best > 0 ? "BEST  " + best.toLocaleString() : "";
  updateHUD();

  // deep-link: #classic / #speedway / #tactical auto-starts that table
  const hashMode = location.hash.replace("#", "");
  if (TABLES[hashMode]) startGame(hashMode);
})();
