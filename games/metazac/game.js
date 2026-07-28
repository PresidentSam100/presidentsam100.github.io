(function () {
  var W = 900, H = 600;
  var BEST_KEY = "metazac_best";

  var canvas = document.getElementById("game");
  var ctx = canvas.getContext("2d");
  var input = document.getElementById("answer");
  var scoreEl = document.getElementById("score-val");
  var bestEl = document.getElementById("best-val");
  var livesEl = document.getElementById("lives-val");
  var overlayStart = document.getElementById("overlay-start");
  var overlayOver = document.getElementById("overlay-over");
  var overMsg = document.getElementById("over-msg");

  // High-DPI crispness.
  var dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // --- track (winding polyline) ---
  var wp = [
    { x: -60, y: 95 },
    { x: 790, y: 95 },
    { x: 790, y: 215 },
    { x: 110, y: 215 },
    { x: 110, y: 335 },
    { x: 790, y: 335 },
    { x: 790, y: 455 },
    { x: 110, y: 455 },
    { x: 110, y: 555 },
    { x: 980, y: 555 }, // exit (off-screen right)
  ];
  var segs = [];
  var TOTAL = 0;
  for (var i = 0; i < wp.length - 1; i++) {
    var dx = wp[i + 1].x - wp[i].x;
    var dy = wp[i + 1].y - wp[i].y;
    var len = Math.hypot(dx, dy);
    segs.push({ a: wp[i], b: wp[i + 1], len: len, acc: TOTAL });
    TOTAL += len;
  }
  function posAt(d) {
    if (d <= 0) return { x: wp[0].x, y: wp[0].y };
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      if (d <= s.acc + s.len) {
        var t = (d - s.acc) / s.len;
        return { x: s.a.x + (s.b.x - s.a.x) * t, y: s.a.y + (s.b.y - s.a.y) * t };
      }
    }
    return { x: wp[wp.length - 1].x, y: wp[wp.length - 1].y };
  }

  // --- colors / balloons ---
  var COLORS = {
    red: { fill: "#ff4d4d", glow: "#ff8a8a", text: "#1a1a1a", speed: 70, pts: 1 },
    blue: { fill: "#3f7bff", glow: "#8fb0ff", text: "#1a1a1a", speed: 95, pts: 2 },
    green: { fill: "#36c759", glow: "#8af0a3", text: "#1a1a1a", speed: 125, pts: 3 },
    yellow: { fill: "#ffd23f", glow: "#fff0a8", text: "#1a1a1a", speed: 160, pts: 4 },
    pink: { fill: "#ff5fa2", glow: "#ffb3d4", text: "#1a1a1a", speed: 205, pts: 5 },
  };

  var bloons = [];
  // Zetamac-style ranges. Subtraction reuses addition's ranges (in
  // reverse); division reuses multiplication's (in reverse).
  var config = {
    add: { on: true, min1: 2, max1: 100, min2: 2, max2: 100 },
    sub: { on: true },
    mul: { on: true, min1: 2, max1: 12, min2: 2, max2: 100 },
    div: { on: true },
  };
  var state = "start"; // start | playing | over
  var score = 0, best = 0, lives = 3;
  var gameTime = 0, spawnTimer = 0, leakFlash = 0;

  function randInt(a, b) {
    return a + Math.floor(Math.random() * (b - a + 1));
  }

  // --- sound (Web Audio, generated; no asset files) ---
  var actx = null;
  function ensureAudio() {
    if (!actx) {
      try { actx = new (window.AudioContext || window.webkitAudioContext)(); }
      catch (e) { actx = null; }
    }
    if (actx && actx.state === "suspended") actx.resume();
  }
  function tone(f0, f1, dur, type, vol, delay) {
    if (!actx) return;
    var t = actx.currentTime + (delay || 0);
    var osc = actx.createOscillator();
    var g = actx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(actx.destination);
    osc.start(t); osc.stop(t + dur);
  }
  function playPop() {
    if (!actx) return;
    tone(660, 1050, 0.09, "triangle", 0.22); // bright blip
    // short noise burst for the "pop"
    var dur = 0.055, t = actx.currentTime;
    var buf = actx.createBuffer(1, Math.floor(actx.sampleRate * dur), actx.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    var src = actx.createBufferSource(); src.buffer = buf;
    var g = actx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(g); g.connect(actx.destination); src.start(t);
  }
  function playLeak() {
    tone(320, 80, 0.38, "sawtooth", 0.25); // descending buzz = lost life
  }
  function playWrong() {
    tone(200, 150, 0.13, "square", 0.18); // short low blip = wrong answer
  }
  function playGameOver() {
    // descending G–E–C–G jingle, last note held = distinct "game over"
    tone(392, 392, 0.18, "triangle", 0.26, 0.0);
    tone(330, 330, 0.18, "triangle", 0.26, 0.15);
    tone(262, 262, 0.18, "triangle", 0.26, 0.3);
    tone(196, 196, 0.6, "triangle", 0.28, 0.46);
  }

  // Build a problem from the configured ranges (Zetamac rules).
  function makeProblem() {
    var ops = [];
    if (config.add.on) ops.push("add");
    if (config.sub.on) ops.push("sub");
    if (config.mul.on) ops.push("mul");
    if (config.div.on) ops.push("div");
    if (!ops.length) ops.push("add");
    var op = ops[randInt(0, ops.length - 1)];
    var a, b, ans, text, sum, prod;
    if (op === "add") {
      a = randInt(config.add.min1, config.add.max1);
      b = randInt(config.add.min2, config.add.max2);
      ans = a + b; text = a + " + " + b;
    } else if (op === "sub") {
      a = randInt(config.add.min1, config.add.max1);
      b = randInt(config.add.min2, config.add.max2);
      sum = a + b; // show the sum minus one operand → other operand
      if (Math.random() < 0.5) { ans = b; text = sum + " − " + a; }
      else { ans = a; text = sum + " − " + b; }
    } else if (op === "mul") {
      a = randInt(config.mul.min1, config.mul.max1);
      b = randInt(config.mul.min2, config.mul.max2);
      ans = a * b; text = a + " × " + b;
    } else {
      a = randInt(config.mul.min1, config.mul.max1);
      b = randInt(config.mul.min2, config.mul.max2);
      prod = a * b; // show the product divided by one operand → other
      if (Math.random() < 0.5) { ans = b; text = prod + " / " + a; }
      else { ans = a; text = prod + " / " + b; }
    }
    return { ans: ans, text: text };
  }

  // Read the settings form into `config` (with validation), persist it,
  // and write normalized values back to the inputs.
  function readConfig() {
    function num(id, dflt) {
      var v = parseInt(document.getElementById(id).value, 10);
      if (isNaN(v) || v < 0) v = dflt;
      return v;
    }
    function range(id1, id2, d1, d2) {
      var mn = num(id1, d1), mx = num(id2, d2);
      if (mx < mn) { var t = mn; mn = mx; mx = t; }
      document.getElementById(id1).value = mn;
      document.getElementById(id2).value = mx;
      return [mn, mx];
    }
    var a1 = range("add-min1", "add-max1", 2, 100);
    var a2 = range("add-min2", "add-max2", 2, 100);
    var m1 = range("mul-min1", "mul-max1", 2, 12);
    var m2 = range("mul-min2", "mul-max2", 2, 100);
    config = {
      add: { on: document.getElementById("add-on").checked, min1: a1[0], max1: a1[1], min2: a2[0], max2: a2[1] },
      sub: { on: document.getElementById("sub-on").checked },
      mul: { on: document.getElementById("mul-on").checked, min1: m1[0], max1: m1[1], min2: m2[0], max2: m2[1] },
      div: { on: document.getElementById("div-on").checked },
    };
    if (!config.add.on && !config.sub.on && !config.mul.on && !config.div.on) {
      config.add.on = true;
      document.getElementById("add-on").checked = true;
    }
    try { localStorage.setItem("metazac_config", JSON.stringify(config)); } catch (e) {}
  }

  // Restore a saved settings form, if any.
  function loadConfig() {
    var saved;
    try { saved = JSON.parse(localStorage.getItem("metazac_config") || "null"); } catch (e) {}
    if (!saved) return;
    function set(id, v) { var el = document.getElementById(id); if (el != null) el.value = v; }
    function chk(id, v) { var el = document.getElementById(id); if (el != null) el.checked = !!v; }
    if (saved.add) {
      chk("add-on", saved.add.on);
      set("add-min1", saved.add.min1); set("add-max1", saved.add.max1);
      set("add-min2", saved.add.min2); set("add-max2", saved.add.max2);
    }
    if (saved.sub) chk("sub-on", saved.sub.on);
    if (saved.mul) {
      chk("mul-on", saved.mul.on);
      set("mul-min1", saved.mul.min1); set("mul-max1", saved.mul.max1);
      set("mul-min2", saved.mul.min2); set("mul-max2", saved.mul.max2);
    }
    if (saved.div) chk("div-on", saved.div.on);
  }

  function pickColor() {
    var pool = ["red", "blue"];
    if (gameTime > 16) pool.push("green");
    if (gameTime > 38) pool.push("yellow");
    if (gameTime > 66) pool.push("pink");
    return pool[randInt(0, pool.length - 1)];
  }

  function spawnBloon() {
    var color = pickColor();
    // Keep answers unique among balloons currently on screen, so a typed
    // answer is never ambiguous. Popping balloons no longer count.
    var used = {};
    for (var i = 0; i < bloons.length; i++) {
      if (!bloons[i].popping) used[bloons[i].ans] = true;
    }
    var prob = makeProblem();
    var tries = 0;
    while (used[prob.ans] && tries < 40) { prob = makeProblem(); tries++; }
    bloons.push({
      dist: 0,
      color: color,
      speed: COLORS[color].speed,
      ans: prob.ans,
      text: prob.text,
      popping: false,
      pop: 0,
      x: wp[0].x,
      y: wp[0].y,
    });
  }

  function reset() {
    bloons = [];
    score = 0;
    lives = 3;
    gameTime = 0;
    spawnTimer = 0.6;
    leakFlash = 0;
    updateHud();
  }

  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
    livesEl.textContent = lives > 0 ? "♥".repeat(lives) : "—";
  }

  function popBloon(b) {
    b.popping = true;
    b.pop = 0;
    playPop();
    score += COLORS[b.color].pts;
    if (score > best) {
      best = score;
      try { localStorage.setItem(BEST_KEY, String(best)); } catch (e) {}
    }
    updateHud();
  }

  function checkAnswer() {
    var raw = input.value.trim();
    if (raw === "") return false;
    var num = parseInt(raw, 10);
    if (isNaN(num)) return false;
    var target = null;
    for (var i = 0; i < bloons.length; i++) {
      var b = bloons[i];
      if (b.popping || b.ans !== num) continue;
      if (!target || b.dist > target.dist) target = b; // furthest along = most urgent
    }
    if (target) {
      popBloon(target);
      input.value = "";
      return true;
    }
    return false;
  }

  function flashWrong() {
    input.classList.remove("wrong");
    void input.offsetWidth; // restart animation
    input.classList.add("wrong");
  }

  // --- loop ---
  function update(dt) {
    if (state === "playing") {
      gameTime += dt;
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnBloon();
        spawnTimer = Math.max(1.0, 3.2 - gameTime / 45);
      }
    }

    var speedMul = 1 + gameTime / 110; // gradual ramp
    for (var i = bloons.length - 1; i >= 0; i--) {
      var b = bloons[i];
      if (b.popping) {
        b.pop += dt / 0.18;
        if (b.pop >= 1) bloons.splice(i, 1);
        continue;
      }
      b.dist += b.speed * speedMul * dt;
      var p = posAt(b.dist);
      b.x = p.x; b.y = p.y;
      if (b.dist >= TOTAL) {
        bloons.splice(i, 1);
        if (state === "playing") {
          lives--;
          leakFlash = 1;
          updateHud();
          if (lives <= 0) endGame(); // plays its own game-over sound
          else playLeak();
        }
        // already game over: balloon just drifts off, no penalty
      }
    }
    if (leakFlash > 0) leakFlash = Math.max(0, leakFlash - dt * 2.2);
  }

  function drawTrack() {
    // base track
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#262b36";
    ctx.lineWidth = 40;
    strokePath();
    ctx.strokeStyle = "#1b1f28";
    ctx.lineWidth = 30;
    strokePath();
    // dashed center
    ctx.setLineDash([10, 14]);
    ctx.strokeStyle = "#3a4150";
    ctx.lineWidth = 3;
    strokePath();
    ctx.setLineDash([]);

    // start portal
    var s = wp[0];
    drawMarker(80, 95, "#36c759", "START");
    // exit / danger
    var lastInBounds = { x: 900, y: 555 };
    drawMarker(lastInBounds.x - 36, lastInBounds.y, "#ff4d4d", "EXIT");
  }
  function strokePath() {
    ctx.beginPath();
    ctx.moveTo(wp[0].x, wp[0].y);
    for (var i = 1; i < wp.length; i++) ctx.lineTo(wp[i].x, wp[i].y);
    ctx.stroke();
  }
  function drawMarker(x, y, color, label) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath();
    ctx.arc(x, y, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "700 11px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label, x, y - 14);
    ctx.restore();
  }

  function drawBloon(b) {
    var c = COLORS[b.color];
    ctx.font = "800 15px Inter, sans-serif";
    var tw = ctx.measureText(b.text).width;
    var rx = Math.max(30, tw / 2 + 15); // widen to fit the equation
    var ry = 30;
    var rmax = Math.max(rx, ry);
    ctx.save();
    ctx.translate(b.x, b.y);
    if (b.popping) {
      // burst: expanding fading ring + shrinking balloon
      var e = b.pop;
      ctx.globalAlpha = 1 - e;
      ctx.strokeStyle = c.glow;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, rmax + e * 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = (1 - e) * 0.8;
      ctx.scale(1 - e * 0.6, 1 - e * 0.6);
    }
    // knot
    ctx.fillStyle = c.fill;
    ctx.beginPath();
    ctx.moveTo(-5, ry * 0.86);
    ctx.lineTo(5, ry * 0.86);
    ctx.lineTo(0, ry * 1.12);
    ctx.closePath();
    ctx.fill();
    // body
    var grad = ctx.createRadialGradient(-8, -10, 4, 0, 0, rmax + 6);
    grad.addColorStop(0, c.glow);
    grad.addColorStop(1, c.fill);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    // shine
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.ellipse(-rx * 0.32, -11, 5, 8, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // equation — outlined so digits/operators stay legible over the
    // balloon's light gradient center
    if (!b.popping || b.pop < 0.5) {
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(255,255,255,0.95)"; // white outline for the dark text
      ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = c.text;
      ctx.fillText(b.text, 0, 0);
    }
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    drawTrack();
    // draw furthest-along last so urgent balloons sit on top
    var sorted = bloons.slice().sort(function (a, b) { return a.dist - b.dist; });
    for (var i = 0; i < sorted.length; i++) drawBloon(sorted[i]);
    if (leakFlash > 0) {
      ctx.fillStyle = "rgba(255,60,72," + (leakFlash * 0.35) + ")";
      ctx.fillRect(0, 0, W, H);
    }
  }

  // Pause on Esc or a tab-switch. NOT "P" — answers are typed, and the
  // timer running down behind a switched tab was the whole complaint.
  var PAUSE = window.GameShell
    ? GameShell.pausable({ canPause: function () { return state === "playing"; }, keys: ["Escape"] })
    : { isPaused: function () { return false; } };

  var lastTs = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.1) dt = 0.1; // clamp after tab switch
    if (PAUSE.isPaused()) { draw(); return; }
    if (state === "playing" || state === "over") update(dt);
    draw();
  }
  requestAnimationFrame(frame);

  // --- state transitions ---
  function startGame() {
    ensureAudio(); // first user gesture — unlock/resume audio
    readConfig();
    reset();
    state = "playing";
    overlayStart.classList.add("hidden");
    overlayOver.classList.add("hidden");
    input.value = "";
    input.disabled = false; // typing only allowed while playing
    input.focus();
  }
  function endGame() {
    state = "over";
    playGameOver();
    overMsg.textContent = "Final score: " + score + "  ·  best: " + best;
    overlayOver.classList.remove("hidden"); // show immediately
    input.value = "";
    input.disabled = true; // no typing/answering until a new game
    input.blur();
  }

  // Return to the start screen (where the settings live).
  function goToMenu() {
    state = "start";
    bloons = [];
    score = 0;
    lives = 3;
    updateHud();
    input.value = "";
    input.disabled = true;
    overlayOver.classList.add("hidden");
    overlayStart.classList.remove("hidden");
  }

  // --- input ---
  input.addEventListener("input", function () {
    // sanitize only; answers are submitted with Enter (so a partial
    // answer like "20" never auto-pops a "205" balloon)
    input.value = input.value.replace(/[^0-9]/g, "");
    input.classList.remove("wrong"); // typing again clears the red flash
  });
  // also clear the red once the shake animation finishes
  input.addEventListener("animationend", function () {
    input.classList.remove("wrong");
  });
  document.addEventListener("keydown", function (e) {
    if ((state === "start" || state === "over") && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      startGame();
      return;
    }
    if (state === "playing") {
      // keep focus on the answer box no matter what
      if (document.activeElement !== input) input.focus();
      if (e.key === "Enter") {
        if (!checkAnswer()) {
          if (input.value !== "") { flashWrong(); playWrong(); }
          input.value = "";
        }
      }
    }
  });

  document.getElementById("start-btn").addEventListener("click", startGame);
  document.getElementById("retry-btn").addEventListener("click", startGame);
  document.getElementById("menu-btn").addEventListener("click", goToMenu);
  canvas.addEventListener("pointerdown", function () {
    if (state === "playing") input.focus();
  });

  try { best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) {}
  loadConfig();
  input.disabled = true; // enabled only once a game starts
  updateHud();
})();
