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
    red: { fill: "#ff4d4d", glow: "#ffb0a8", dark: "#b8232a", text: "#1a1a1a", speed: 70, pts: 1 },
    blue: { fill: "#3f7bff", glow: "#a8c4ff", dark: "#1f4fc4", text: "#1a1a1a", speed: 95, pts: 2 },
    green: { fill: "#36c759", glow: "#a8f5b8", dark: "#1f8f3a", text: "#1a1a1a", speed: 125, pts: 3 },
    yellow: { fill: "#ffd23f", glow: "#fff4b8", dark: "#d99a00", text: "#1a1a1a", speed: 160, pts: 4 },
    pink: { fill: "#ff5fa2", glow: "#ffc4de", dark: "#d93a7d", text: "#1a1a1a", speed: 205, pts: 5 },
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
  var endedAt = 0;     // when the last game ended (see the start keys below)
  // The dart storm (Space): the monkey throws a dart at each of the
  // POWER_SHOTS bloons nearest the exit, one at a time, stopping early if
  // none are left; then it recharges for POWER_RECHARGE seconds.
  var POWER_SHOTS = 5, POWER_GAP = 0.16, POWER_RECHARGE = 45;
  var power = { left: 0, timer: 0, cd: 0 };
  var powerBtn = document.getElementById("power-btn");
  var powerNum = document.getElementById("power-num");
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
  function playPower() {
    // a rising whoosh of darts
    [523, 659, 784, 1047].forEach(function (f, i) { tone(f, f * 1.3, 0.12, "triangle", 0.18, i * 0.05); });
  }
  function playPowerReady() {
    tone(880, 880, 0.1, "sine", 0.16);
    tone(1320, 1320, 0.16, "sine", 0.16, 0.09);
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
    darts = [];
    power = { left: 0, timer: 0, cd: 0 };   // ready from the start
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
    b.pop = -DART_TIME / 0.18;   // negative while the monkey's dart is in the air
    darts.push({ x0: MONKEY.x, y0: MONKEY.y, x1: b.x, y1: b.y, t: 0 });
    monkey.angle = Math.atan2(b.y - MONKEY.y, b.x - MONKEY.x);
    monkey.throwT = 1;
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
      // the dart storm: a throw every POWER_GAP s at the bloon nearest the exit
      if (power.left > 0) {
        power.timer -= dt;
        if (power.timer <= 0) {
          var aim = null;
          for (var q = 0; q < bloons.length; q++) {
            if (!bloons[q].popping && (!aim || bloons[q].dist > aim.dist)) aim = bloons[q];
          }
          if (aim) { popBloon(aim); power.left--; power.timer = POWER_GAP; }
          else power.left = 0;                       // nothing left to hit
        }
      } else if (power.cd > 0) {
        power.cd = Math.max(0, power.cd - dt);       // recharge once the storm is over
        if (power.cd === 0) playPowerReady();
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

    var lead = null;
    for (var j = 0; j < bloons.length; j++) {
      if (!bloons[j].popping && (!lead || bloons[j].dist > lead.dist)) lead = bloons[j];
    }
    if (lead && !monkey.throwT) {
      var want = Math.atan2(lead.y - MONKEY.y, lead.x - MONKEY.x);
      var diff = Math.atan2(Math.sin(want - monkey.angle), Math.cos(want - monkey.angle));
      monkey.angle += diff * Math.min(1, dt * 7);
    }
    monkey.throwT = Math.max(0, monkey.throwT - dt * 5);
    for (var k = darts.length - 1; k >= 0; k--) {
      darts[k].t += dt / DART_TIME;
      if (darts[k].t >= 1) darts.splice(k, 1);
    }
  }

  // --- the carnival map ---
  // Painted once onto an offscreen canvas (at the screen's pixel density) and
  // stamped every frame: a grassy fairground seen from above, the track as a
  // wooden boardwalk, big-top tents, umbrella tables, trees, hay, a popcorn
  // cart, bunting along the top, and START / EXIT signs.
  var OUT = "#2a1a12";            // outline colour for everything on the map
  var UI_FONT = '"Titan One", "Nunito", system-ui, sans-serif';
  var MONKEY = { x: 450, y: 275 };  // the dart monkey's platform, between two lanes

  // small seeded random, so the fairground is laid out the same every time
  function seeded(seed) {
    return function () {
      seed = (seed + 0x6d2b79f5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); }
  function shadow(g, x, y, rx, ry) {
    g.fillStyle = "rgba(20,40,10,0.22)";
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill();
  }
  // A big-top tent seen from above: striped wedges, a pole and a pennant
  function tent(g, x, y, r, c1, c2) {
    shadow(g, x + 5, y + 7, r, r * 0.9);
    var n = 12;
    for (var i = 0; i < n; i++) {
      g.beginPath();
      g.moveTo(x, y);
      g.arc(x, y, r, (i / n) * Math.PI * 2, ((i + 1) / n) * Math.PI * 2);
      g.closePath();
      g.fillStyle = i % 2 ? c2 : c1;
      g.fill();
    }
    var sh = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    sh.addColorStop(0, "rgba(255,255,255,0.25)");
    sh.addColorStop(1, "rgba(0,0,0,0.18)");
    circle(g, x, y, r); g.fillStyle = sh; g.fill();
    g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
    // scalloped trim
    for (var k = 0; k < n; k++) {
      var a = ((k + 0.5) / n) * Math.PI * 2;
      circle(g, x + Math.cos(a) * r, y + Math.sin(a) * r, 3.2);
      g.fillStyle = "#ffd23f"; g.fill(); g.lineWidth = 1.5; g.stroke();
    }
    circle(g, x, y, 5); g.fillStyle = "#ffd23f"; g.fill(); g.lineWidth = 2; g.stroke();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 14, y - 5); g.lineTo(x, y - 10); g.closePath();
    g.fillStyle = c1 === "#ffffff" ? c2 : c1; g.fill(); g.lineWidth = 1.5; g.stroke();
  }
  function umbrella(g, x, y, r, c1, c2) {
    shadow(g, x + 3, y + 5, r, r * 0.85);
    for (var i = 0; i < 8; i++) {
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, (i / 8) * Math.PI * 2, ((i + 1) / 8) * Math.PI * 2); g.closePath();
      g.fillStyle = i % 2 ? c2 : c1; g.fill();
    }
    circle(g, x, y, r); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    circle(g, x, y, 2.5); g.fillStyle = OUT; g.fill();
  }
  function tree(g, x, y, r) {
    shadow(g, x + 5, y + 7, r * 1.1, r * 0.9);
    var parts = [[0, 0, 1], [-0.55, 0.25, 0.7], [0.55, 0.2, 0.72], [0.05, -0.5, 0.7]];
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      circle(g, x + p[0] * r, y + p[1] * r, p[2] * r + 3); g.fillStyle = "#1f5a14"; g.fill();
    }
    for (var j = 0; j < parts.length; j++) {
      var q = parts[j], cx = x + q[0] * r, cy = y + q[1] * r, cr = q[2] * r;
      var gr = g.createRadialGradient(cx - cr * 0.35, cy - cr * 0.4, cr * 0.1, cx, cy, cr);
      gr.addColorStop(0, "#8ee35a"); gr.addColorStop(1, "#3a9a2a");
      circle(g, cx, cy, cr); g.fillStyle = gr; g.fill();
    }
  }
  function hay(g, x, y) {
    shadow(g, x + 3, y + 5, 20, 12);
    g.beginPath(); g.roundRect ? g.roundRect(x - 20, y - 12, 40, 24, 7) : g.rect(x - 20, y - 12, 40, 24);
    g.fillStyle = "#f2c94c"; g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    g.strokeStyle = "rgba(150,100,20,0.6)"; g.lineWidth = 1.5;
    for (var i = -12; i <= 12; i += 8) { g.beginPath(); g.moveTo(x + i, y - 10); g.lineTo(x + i, y + 10); g.stroke(); }
    g.strokeStyle = "#b5462c"; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x - 20, y); g.lineTo(x + 20, y); g.stroke();
  }
  // A stall seen from above: a striped awning
  function stall(g, x, y, w, h, c1, c2, label) {
    shadow(g, x + 4, y + 6, w * 0.55, h * 0.55);
    var n = 6, sw = w / n;
    for (var i = 0; i < n; i++) {
      g.fillStyle = i % 2 ? c2 : c1;
      g.fillRect(x - w / 2 + i * sw, y - h / 2, sw, h);
    }
    g.lineWidth = 3; g.strokeStyle = OUT; g.strokeRect(x - w / 2, y - h / 2, w, h);
    if (label) {
      g.font = "13px " + UI_FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.lineWidth = 4; g.lineJoin = "round"; g.strokeStyle = OUT; g.strokeText(label, x, y + h / 2 + 11);
      g.fillStyle = "#ffffff"; g.fillText(label, x, y + h / 2 + 11);
    }
  }
  function sign(g, x, y, text, color) {
    g.fillStyle = "#6b4423"; g.fillRect(x - 2, y, 4, 16);
    g.font = "14px " + UI_FONT;
    var w = g.measureText(text).width + 18;
    g.beginPath(); g.roundRect ? g.roundRect(x - w / 2, y - 22, w, 24, 6) : g.rect(x - w / 2, y - 22, w, 24);
    g.fillStyle = color; g.fill(); g.lineWidth = 2.5; g.strokeStyle = OUT; g.stroke();
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#ffffff";
    g.lineWidth = 3; g.lineJoin = "round"; g.strokeText(text, x, y - 9); g.fillText(text, x, y - 9);
  }
  function bunting(g) {
    var colors = ["#e8413a", "#ffd23f", "#3f7bff", "#36c759", "#ff5fa2"];
    var swags = [[-20, 460], [440, 920]];
    for (var s = 0; s < swags.length; s++) {
      var x0 = swags[s][0], x1 = swags[s][1], sag = 22, top = 8;
      var yAt = function (t) { return top + Math.sin(t * Math.PI) * sag; };
      g.strokeStyle = OUT; g.lineWidth = 2;
      g.beginPath();
      for (var t = 0; t <= 1.0001; t += 0.05) {
        var px = x0 + (x1 - x0) * t;
        if (t === 0) g.moveTo(px, yAt(t)); else g.lineTo(px, yAt(t));
      }
      g.stroke();
      var n = 13;
      for (var i = 0; i < n; i++) {
        var ta = (i + 0.25) / n, tb = (i + 0.75) / n;
        var ax = x0 + (x1 - x0) * ta, bx = x0 + (x1 - x0) * tb, ay = yAt(ta), by = yAt(tb);
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.lineTo((ax + bx) / 2, (ay + by) / 2 + 17); g.closePath();
        g.fillStyle = colors[(i + s * 2) % colors.length]; g.fill();
        g.lineWidth = 1.5; g.strokeStyle = OUT; g.stroke();
      }
    }
  }

  function buildMap() {
    var c = document.createElement("canvas");
    c.width = W * dpr; c.height = H * dpr;
    var g = c.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var rnd = seeded(7);

    // grass, with lighter and darker patches, tufts and flowers
    g.fillStyle = "#74c43c";
    g.fillRect(0, 0, W, H);
    for (var i = 0; i < 26; i++) {
      var px = rnd() * W, py = rnd() * H, pr = 40 + rnd() * 90, light = rnd() < 0.6;
      var pg = g.createRadialGradient(px, py, 0, px, py, pr);
      pg.addColorStop(0, light ? "rgba(170,230,110,0.45)" : "rgba(60,140,40,0.35)");
      pg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = pg; g.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    }
    g.strokeStyle = "rgba(40,110,30,0.55)"; g.lineWidth = 1.6; g.lineCap = "round";
    for (var k = 0; k < 170; k++) {
      var tx = rnd() * W, ty = rnd() * H;
      g.beginPath(); g.moveTo(tx - 3, ty - 4); g.lineTo(tx, ty + 2); g.lineTo(tx + 3, ty - 5); g.stroke();
    }
    for (var f = 0; f < 60; f++) {
      circle(g, rnd() * W, rnd() * H, 2.2);
      g.fillStyle = rnd() < 0.5 ? "#ffffff" : "#ffe45c"; g.fill();
    }

    // the boardwalk: a dark rim along the whole path, then plank runs
    var HALF = 23;
    g.lineJoin = "miter"; g.lineCap = "square";
    g.strokeStyle = "rgba(30,20,10,0.25)"; g.lineWidth = HALF * 2 + 10;
    g.save(); g.translate(0, 5); strokeWp(g); g.restore();
    g.strokeStyle = "#5a3a1c"; g.lineWidth = HALF * 2 + 6; strokeWp(g);
    for (var s = 0; s < segs.length; s++) {
      var a = segs[s].a, b = segs[s].b, horiz = a.y === b.y;
      var x0 = Math.min(a.x, b.x) - HALF, x1 = Math.max(a.x, b.x) + HALF;
      var y0 = Math.min(a.y, b.y) - HALF, y1 = Math.max(a.y, b.y) + HALF;
      g.fillStyle = "#cf9a5f"; g.fillRect(x0, y0, x1 - x0, y1 - y0);
      var step = 13, n = 0;
      if (horiz) {
        for (var x = x0; x < x1; x += step, n++) {
          if (n % 2) { g.fillStyle = "#c28a4f"; g.fillRect(x, y0, step, y1 - y0); }
          g.fillStyle = "rgba(90,50,20,0.55)"; g.fillRect(x, y0, 1.5, y1 - y0);
        }
      } else {
        for (var y = y0; y < y1; y += step, n++) {
          if (n % 2) { g.fillStyle = "#c28a4f"; g.fillRect(x0, y, x1 - x0, step); }
          g.fillStyle = "rgba(90,50,20,0.55)"; g.fillRect(x0, y, x1 - x0, 1.5);
        }
      }
      // rails along both long edges
      g.fillStyle = "#8a5a2e";
      if (horiz) { g.fillRect(x0, y0, x1 - x0, 4); g.fillRect(x0, y1 - 4, x1 - x0, 4); }
      else { g.fillRect(x0, y0, 4, y1 - y0); g.fillRect(x1 - 4, y0, 4, y1 - y0); }
    }
    g.lineCap = "round"; g.lineJoin = "round";

    // the fairground (kept clear of the track lanes)
    bunting(g);
    tent(g, 250, 155, 31, "#e8413a", "#ffffff");
    umbrella(g, 385, 152, 17, "#3f7bff", "#ffffff");
    tent(g, 530, 156, 30, "#3f7bff", "#ffd23f");
    umbrella(g, 660, 158, 16, "#ff5fa2", "#ffffff");
    tree(g, 60, 158, 22);
    stall(g, 857, 150, 58, 34, "#e8413a", "#ffffff", "POPCORN");
    stall(g, 225, 272, 60, 34, "#36c759", "#ffffff", "TICKETS");
    tent(g, 690, 276, 32, "#ffd23f", "#e8413a");
    tree(g, 860, 275, 21);
    tent(g, 215, 396, 31, "#ff5fa2", "#ffffff");
    umbrella(g, 360, 394, 17, "#ffd23f", "#e8413a");
    umbrella(g, 560, 390, 16, "#36c759", "#ffffff");
    tree(g, 690, 396, 22);
    tree(g, 860, 396, 20);
    hay(g, 250, 505); hay(g, 560, 505); hay(g, 700, 507);
    tree(g, 45, 300, 21); tree(g, 42, 432, 20); tree(g, 45, 565, 16);
    sign(g, 56, 60, "START", "#36c759");
    sign(g, 848, 520, "EXIT", "#e8413a");

    // the dart monkey's round wooden platform
    shadow(g, MONKEY.x + 4, MONKEY.y + 7, 31, 27);
    circle(g, MONKEY.x, MONKEY.y, 30);
    var pg2 = g.createRadialGradient(MONKEY.x - 8, MONKEY.y - 10, 4, MONKEY.x, MONKEY.y, 30);
    pg2.addColorStop(0, "#e2b27a"); pg2.addColorStop(1, "#b07a44");
    g.fillStyle = pg2; g.fill(); g.lineWidth = 3; g.strokeStyle = OUT; g.stroke();
    circle(g, MONKEY.x, MONKEY.y, 22); g.lineWidth = 1.5; g.strokeStyle = "rgba(90,50,20,0.5)"; g.stroke();
    return c;
  }
  function strokeWp(g) {
    g.beginPath();
    g.moveTo(wp[0].x, wp[0].y);
    for (var i = 1; i < wp.length; i++) g.lineTo(wp[i].x, wp[i].y);
    g.stroke();
  }
  var mapCanvas = null;
  function map() {
    if (!mapCanvas) mapCanvas = buildMap();
    return mapCanvas;
  }
  // Repaint the map once the sign font has loaded (it's used on the signs)
  if (document.fonts && document.fonts.load) {
    document.fonts.load('14px "Titan One"').then(function () { mapCanvas = null; });
  }

  // --- the dart monkey ---
  // Sits on its platform, turns to follow the bloon furthest along (like
  // "first" targeting), and throws a dart at each one you pop.
  var monkey = { angle: -Math.PI / 2, throwT: 0 };
  var darts = [];     // { x0, y0, x1, y1, t } — t runs 0..1 over DART_TIME
  var DART_TIME = 0.09;

  function drawMonkey() {
    var x = MONKEY.x, y = MONKEY.y;
    var bob = Math.sin(gameTime * 4) * 0.6;
    if (power.left > 0) {
      var glow = ctx.createRadialGradient(x, y, 20, x, y, 46);
      glow.addColorStop(0, "rgba(255,210,63,0.9)");
      glow.addColorStop(1, "rgba(255,210,63,0)");
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, 46, 0, Math.PI * 2); ctx.fill();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(monkey.angle);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    var brown = "#8b5a2b", tan = "#f1cf9b";
    // tail, curling behind
    ctx.strokeStyle = OUT; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-14, 4); ctx.quadraticCurveTo(-30, 14, -24, 24); ctx.stroke();
    ctx.strokeStyle = brown; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-14, 4); ctx.quadraticCurveTo(-30, 14, -24, 24); ctx.stroke();
    // body
    ctx.beginPath(); ctx.ellipse(-6, 0, 13 + bob, 15, 0, 0, Math.PI * 2);
    ctx.fillStyle = brown; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
    // throwing arm, drawn back a little just after a throw
    var reach = monkey.throwT > 0 ? 6 * monkey.throwT : 0;
    ctx.strokeStyle = OUT; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-2, 10); ctx.lineTo(14 + reach, 14); ctx.stroke();
    ctx.strokeStyle = brown; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-2, 10); ctx.lineTo(14 + reach, 14); ctx.stroke();
    // the dart in hand (not while one is in the air)
    if (!darts.length) drawDart(ctx, 18 + reach, 14, 0, 1);
    ctx.beginPath(); ctx.arc(15 + reach, 14, 4, 0, Math.PI * 2);
    ctx.fillStyle = tan; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = OUT; ctx.stroke();
    // head: ears, crown, face, eyes
    for (var s = -1; s <= 1; s += 2) {
      ctx.beginPath(); ctx.arc(3, s * 14, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = brown; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = OUT; ctx.stroke();
      ctx.beginPath(); ctx.arc(3, s * 14, 3.5, 0, Math.PI * 2); ctx.fillStyle = tan; ctx.fill();
    }
    ctx.beginPath(); ctx.arc(4, 0, 13, 0, Math.PI * 2);
    ctx.fillStyle = brown; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = OUT; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(10, 0, 7, 10, 0, 0, Math.PI * 2);
    ctx.fillStyle = tan; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = OUT;
    ctx.beginPath(); ctx.arc(12, -4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(12, 4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // A dart pointing along +x, at (x, y), rotated by `a`, drawn at `alpha`
  // and `size` (the one in flight is drawn bigger so it reads at speed)
  function drawDart(c, x, y, a, alpha, size) {
    c.save();
    c.globalAlpha = alpha;
    c.translate(x, y);
    c.rotate(a);
    if (size) c.scale(size, size);
    c.lineCap = "round";
    c.strokeStyle = "#5b6470"; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(-10, 0); c.lineTo(8, 0); c.stroke();
    c.fillStyle = OUT;
    c.beginPath(); c.moveTo(8, -2.5); c.lineTo(14, 0); c.lineTo(8, 2.5); c.closePath(); c.fill();
    c.fillStyle = "#e8413a";
    c.beginPath(); c.moveTo(-10, 0); c.lineTo(-15, -5); c.lineTo(-6, 0); c.lineTo(-15, 5); c.closePath(); c.fill();
    c.restore();
  }
  function drawDarts() {
    for (var i = 0; i < darts.length; i++) {
      var d = darts[i];
      var a = Math.atan2(d.y1 - d.y0, d.x1 - d.x0);
      var x = d.x0 + (d.x1 - d.x0) * d.t, y = d.y0 + (d.y1 - d.y0) * d.t;
      // a short streak behind it
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 3; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(x - Math.cos(a) * 34, y - Math.sin(a) * 34); ctx.lineTo(x, y); ctx.stroke();
      drawDart(ctx, x, y, a, 1, 1.5);
    }
  }

  // --- bloons ---
  // BTD-style: glossy, egg-shaped, outlined, with a knot and a bit of string.
  // The problem rides on a white sticker so it stays easy to read. Every
  // bloon and sticker is the same size whatever the problem: a long one
  // gets smaller type (squeezed only past a point), never a bigger bloon.
  var BR = 31, BH = 36;             // bloon half-width and half-height
  var STICKER_W = 64, STICKER_H = 22, TEXT_FIT = STICKER_W - 10;

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
  }
  function eggPath(c, rx, ry) {
    c.beginPath();
    c.moveTo(0, -ry);
    c.bezierCurveTo(rx * 1.05, -ry, rx * 1.05, ry * 0.55, 0, ry);
    c.bezierCurveTo(-rx * 1.05, ry * 0.55, -rx * 1.05, -ry, 0, -ry);
    c.closePath();
  }

  function drawBloon(b) {
    var c = COLORS[b.color];
    ctx.save();
    ctx.translate(b.x, b.y);
    // popped: the dart lands first (pop < 0 while it's in the air), then it bursts
    if (b.popping && b.pop >= 0) { drawPop(c, b.pop); ctx.restore(); return; }
    ctx.lineJoin = "round";

    // string and knot
    ctx.strokeStyle = "rgba(42,26,18,0.7)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, BH + 4);
    ctx.quadraticCurveTo(-6, BH + 12, 0, BH + 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-5, BH + 5);
    ctx.lineTo(5, BH + 5);
    ctx.lineTo(0, BH - 2);
    ctx.closePath();
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUT;
    ctx.stroke();

    // body
    eggPath(ctx, BR, BH);
    var grad = ctx.createRadialGradient(-BR * 0.35, -BH * 0.4, 3, 0, 0, BH * 1.1);
    grad.addColorStop(0, c.glow);
    grad.addColorStop(0.55, c.fill);
    grad.addColorStop(1, c.dark);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = OUT;
    ctx.stroke();

    // shine
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.ellipse(-BR * 0.42, -BH * 0.42, 5, 9, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.beginPath();
    ctx.arc(-BR * 0.16, -BH * 0.68, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // the problem, on a sticker
    roundRectPath(ctx, -STICKER_W / 2, -STICKER_H / 2 + 3, STICKER_W, STICKER_H, 11);
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.font = "800 15px Nunito, sans-serif";
    var size = Math.max(10, Math.min(15, 15 * TEXT_FIT / ctx.measureText(b.text).width));
    ctx.font = "800 " + size.toFixed(1) + "px Nunito, sans-serif";
    var tw = ctx.measureText(b.text).width;
    ctx.fillStyle = "#1a1410";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.translate(0, 4);
    if (tw > TEXT_FIT) ctx.scale(TEXT_FIT / tw, 1);
    ctx.fillText(b.text, 0, 0);
    ctx.restore();
  }

  // The pop: a jagged starburst saying POP, rubber scraps flying out
  function drawPop(c, e) {
    ctx.globalAlpha = 1 - e;
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * Math.PI * 2 + 0.4, d = 10 + e * 46;
      ctx.save();
      ctx.translate(Math.cos(a) * d, Math.sin(a) * d);
      ctx.rotate(a + e * 4);
      ctx.beginPath();
      ctx.moveTo(-5, -3);
      ctx.lineTo(6, -1);
      ctx.lineTo(-2, 4);
      ctx.closePath();
      ctx.fillStyle = c.fill;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = OUT;
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    var s = 0.7 + e * 0.8;
    ctx.scale(s, s);
    ctx.beginPath();
    for (var k = 0; k < 20; k++) {
      var r = k % 2 ? 16 : 30, ang = (k / 20) * Math.PI * 2;
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.closePath();
    ctx.fillStyle = "#fff6c8";
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.font = "15px " + UI_FONT;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = c.dark;
    ctx.fillText("POP", 0, 1);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(map(), 0, 0, W, H);
    drawMonkey();
    // draw furthest-along last so urgent balloons sit on top
    var sorted = bloons.slice().sort(function (a, b) { return a.dist - b.dist; });
    for (var i = 0; i < sorted.length; i++) drawBloon(sorted[i]);
    drawDarts();
    if (leakFlash > 0) {
      if (window.RM_ON && window.RM_ON()) {
        // Visual FX off: a red frame round the edge instead of a full-screen flash
        var bw = 14;
        ctx.fillStyle = "rgba(255,60,72," + (leakFlash * 0.7) + ")";
        ctx.fillRect(0, 0, W, bw); ctx.fillRect(0, H - bw, W, bw);
        ctx.fillRect(0, bw, bw, H - 2 * bw); ctx.fillRect(W - bw, bw, bw, H - 2 * bw);
      } else {
        ctx.fillStyle = "rgba(255,60,72," + (leakFlash * 0.35) + ")";
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  function powerReady() { return power.left === 0 && power.cd === 0; }
  function usePower() {
    if (state !== "playing" || PAUSE.isPaused()) return;
    if (!powerReady()) {
      playWrong();
      powerBtn.classList.remove("nope");
      void powerBtn.offsetWidth;
      powerBtn.classList.add("nope");
      return;
    }
    power.left = POWER_SHOTS;
    power.timer = 0;
    power.cd = POWER_RECHARGE;
    playPower();
  }
  // The button shows a dark sweep while it recharges, and the shots left or
  // seconds to go; it glows when it's ready.
  function renderPower() {
    var charging = power.left === 0 && power.cd > 0;
    powerBtn.style.setProperty("--cd", charging ? (power.cd / POWER_RECHARGE).toFixed(3) : "0");
    powerBtn.classList.toggle("ready", state === "playing" && powerReady());
    powerBtn.classList.toggle("firing", power.left > 0);
    powerBtn.classList.toggle("idle", state !== "playing");
    var txt = power.left > 0 ? "×" + power.left : charging ? Math.ceil(power.cd) + "s" : "×" + POWER_SHOTS;
    if (powerNum.textContent !== txt) powerNum.textContent = txt;
  }

  // Pause on Esc or a tab-switch. NOT "P" — answers are typed, and the
  // timer running down behind a switched tab was the whole complaint.
  // The answer box is off while paused, so stray typing can't sneak in.
  var PAUSE = window.GameShell
    ? GameShell.pausable({
        canPause: function () { return state === "playing"; },
        keys: ["Escape"],
        onChange: function (paused) {
          input.disabled = paused || state !== "playing";
          if (!paused && state === "playing") input.focus();
        }
      })
    : { isPaused: function () { return false; } };

  var lastTs = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    if (!lastTs) lastTs = ts;
    var dt = (ts - lastTs) / 1000;
    lastTs = ts;
    if (dt > 0.1) dt = 0.1; // clamp after tab switch
    renderPower();
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
    endedAt = performance.now();
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
    darts = [];
    power = { left: 0, timer: 0, cd: 0 };
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
      // Space is also the storm key: a held key, or one pressed as the last
      // life slips away, mustn't skip straight past the game-over card
      if (e.repeat || (state === "over" && performance.now() - endedAt < 700)) return;
      startGame();
      return;
    }
    if (state === "playing") {
      if (PAUSE.isPaused()) return;           // no answering (or storms) while paused
      // keep focus on the answer box no matter what
      if (document.activeElement !== input) input.focus();
      if (e.key === " ") {
        e.preventDefault();
        if (!e.repeat) usePower();
        return;
      }
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
  // the power button: a click never takes focus from the answer box
  powerBtn.addEventListener("mousedown", function (e) { e.preventDefault(); });
  powerBtn.addEventListener("click", usePower);
  canvas.addEventListener("pointerdown", function () {
    if (state === "playing") input.focus();
  });

  try { best = parseInt(localStorage.getItem(BEST_KEY) || "0", 10) || 0; } catch (e) {}
  loadConfig();
  input.disabled = true; // enabled only once a game starts
  updateHud();
})();
