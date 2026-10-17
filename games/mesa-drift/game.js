/* =====================================================================
   Mesa Drift: a hot-air balloon over red-rock country, in the flat
   colours of an old travel poster. The burner only lifts and the vent only
   sinks: to go anywhere, find the height where the wind blows your way.
   Land gently on the ringed field at the end of each flight; eight flights
   make the tour.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- the country, in its own units (y up from the bottom of the world) ----------------
  var SKY = 600;                       // the world's height
  var LAYERS = [0, 140, 280, 420, SKY];   // the four winds' bands
  var STEP = 10;                       // the ground is known every STEP across
  var ENVELOPE = 34, BASKET_DROP = 54; // the envelope's radius; the basket's floor below its middle
  var SAFE = 32, CRASH = 56;           // the speed of a soft landing, and of one that breaks the basket
  var FLIGHTS = ["First Light", "The Narrows", "Red Mesa", "River Bend", "Two Buttes", "Long Glide", "Canyon Wind", "Sundown"];
  // each flight's colours, dawn to dusk: [sky top, sky low, sun, far rock, near rock, rock side]
  var LIGHT = [
    ["#f3c9a3", "#fbe7c9", "#fff3d6", "#d9a78f", "#c86a46", "#9b4a32"],
    ["#f6d9b2", "#fdf0d7", "#fff6e0", "#d7ae93", "#c4683f", "#93452d"],
    ["#a9d3d6", "#f2e8cc", "#fff8e6", "#c9a693", "#c1603d", "#8f412a"],
    ["#9fcbd2", "#eee6c9", "#fffaf0", "#c4a28d", "#bd5c3a", "#8a3e28"],
    ["#a5cfd2", "#f0e2c3", "#fff6e3", "#c89e88", "#c26340", "#91432c"],
    ["#f0c78f", "#f8e2bd", "#ffefcc", "#d4a083", "#c35f3b", "#8e3f27"],
    ["#e9a77a", "#f5d2a8", "#ffe2b8", "#c98d73", "#b9553a", "#843a26"],
    ["#c97a7e", "#efb48d", "#ffd59a", "#a7707a", "#9e4a3e", "#6f2f2f"]
  ];
  var MODES = { calm: { name: "Calm air", fuel: 50, wind: 1.6 }, gusty: { name: "Gusty", fuel: 42, wind: 1.9 } };

  // A flight: the lie of the land (a field to start from, mesas, a river,
  // the ringed field to land on, a ridge at the end) and the four winds.
  function buildFlight(n, gusty) {
    var rnd = mulberry(4021 + n * 977);
    var width = 1700 + n * 200;
    var h = [], water = [];
    function flat(x0, x1, y) { for (var x = x0; x <= x1; x += STEP) h[x / STEP] = y; }
    flat(0, 260, 40);
    var x = 270, base = 40;
    // (the field low enough that the air just over it is the bottom band or
    // the one above it: never the fast band, where a landing would be a lottery)
    var fieldW = 260 - n * 12, fieldY = n < 2 ? 40 : n < 5 ? 40 + rnd() * 60 : 70 + rnd() * 50;
    var fieldX0 = width - 160 - fieldW;
    while (x < fieldX0 - 40) {
      var kind = rnd();
      if (kind < 0.42) {
        // a mesa: steep sides, a flat top
        // (never so tall that the band over it, which blows toward the field, can't clear it)
        var w = 140 + rnd() * 220, top = 140 + rnd() * (110 + n * 12);
        var side = 30;
        for (var k = 0; k <= side; k += STEP) h[(x + k) / STEP | 0] = base + (top - base) * (k / side);
        for (k = side; k <= w - side; k += STEP) h[(x + k) / STEP | 0] = top;
        for (k = 0; k <= side; k += STEP) h[(x + w - side + k) / STEP | 0] = top - (top - base) * (k / side);
        x += w;
      } else if (kind < 0.62 && n >= 1) {
        // a river in a low valley
        var rw = 60 + rnd() * 70;
        flat(Math.round(x / STEP) * STEP, Math.round((x + rw) / STEP) * STEP, 14);
        water.push([x, x + rw]);
        x += rw;
      } else {
        // scrubland, rolling a little
        var sw = 100 + rnd() * 160, y0 = 30 + rnd() * 40;
        for (k = 0; k <= sw; k += STEP) h[(x + k) / STEP | 0] = y0 + Math.sin(k / 37) * 8;
        x += sw;
      }
      x = Math.round(x / STEP) * STEP;
    }
    // up to the field, the field, and the ridge beyond it
    var ramp = Math.max(0, fieldX0 - x);
    for (k = 0; k <= ramp; k += STEP) h[(x + k) / STEP | 0] = (h[x / STEP - 1] || 40) + (fieldY - (h[x / STEP - 1] || 40)) * (k / Math.max(1, ramp));
    flat(Math.round(fieldX0 / STEP) * STEP, Math.round((fieldX0 + fieldW) / STEP) * STEP, fieldY);
    for (k = 0; k <= 160; k += STEP) h[Math.round((fieldX0 + fieldW) / STEP) + k / STEP] = fieldY + (380 - fieldY) * Math.min(1, k / 60);
    for (var i = 0; i < h.length; i++) if (h[i] == null) h[i] = h[i - 1] || 40;
    // the winds: alternating, the ground's often toward the field, one aloft back the other way
    var mult = MODES[gusty ? "gusty" : "calm"].wind;
    var winds = [
      (16 + rnd() * 14) * (n % 3 === 2 ? -1 : 1),
      -(14 + rnd() * 18),
      22 + rnd() * 22 + n * 2,
      -(10 + rnd() * 20)
    ].map(function (v) { return v * mult; });
    if (n === 0) winds = [18, -14, 34, -10].map(function (v) { return v * mult; });
    return { n: n, name: FLIGHTS[n], width: width, h: h, water: water, field: [fieldX0, fieldX0 + fieldW], flag: fieldX0 + fieldW / 2, winds: winds, light: LIGHT[n] };
  }
  function groundAt(F, x) {
    var i = x / STEP, i0 = Math.max(0, Math.min(F.h.length - 1, Math.floor(i))), i1 = Math.min(F.h.length - 1, i0 + 1);
    return F.h[i0] + (F.h[i1] - F.h[i0]) * (i - i0);
  }
  function inWater(F, x) { for (var i = 0; i < F.water.length; i++) if (x >= F.water[i][0] && x <= F.water[i][1]) return true; return false; }
  function layerOf(y) { for (var i = 0; i < 4; i++) if (y < LAYERS[i + 1]) return i; return 3; }

  // ---- canvas ---------------------------------------------------------------------------
  var cv = $("stage"), g = cv.getContext("2d");
  var dpr = 1, VW = 0, VH = 0, S = 1, visW = 0, PADT = 60, PADB = 0;
  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    VW = window.innerWidth; VH = window.innerHeight;
    cv.width = Math.round(VW * dpr); cv.height = Math.round(VH * dpr);
    // the whole sky's height fits the window: under the corner buttons, and
    // on a touch screen above the burn and vent buttons
    var touch = window.matchMedia && window.matchMedia("(hover: none)").matches;
    PADB = touch ? 104 : 0;
    S = (VH - PADT - PADB) / SKY;
    visW = VW / S;
  }

  // ---- sound -----------------------------------------------------------------------------
  var actx = null, roar = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  // the burner: a soft roar while it's lit
  function burnerSound(on) {
    var ac = audio(); if (!ac) return;
    if (on && !roar) {
      var len = ac.sampleRate, buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      var src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      var lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520;
      var gn = ac.createGain(); gn.gain.setValueAtTime(0.0001, ac.currentTime); gn.gain.exponentialRampToValueAtTime(0.16, ac.currentTime + 0.08);
      src.connect(lp); lp.connect(gn); gn.connect(ac.destination); src.start();
      roar = { src: src, gn: gn };
    } else if (!on && roar) {
      var r = roar; roar = null;
      r.gn.gain.setValueAtTime(r.gn.gain.value, ac.currentTime); r.gn.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
      r.src.stop(ac.currentTime + 0.15);
    }
  }
  function tone(f, dur, type, vol, delay) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), gn = ac.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol || 0.08, t0 + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function sfxBump() { tone(110, 0.25, "triangle", 0.14); }
  function sfxCrash() { tone(90, 0.5, "sawtooth", 0.1); tone(70, 0.6, "triangle", 0.12, 0.05); }
  function sfxLand() { [392, 523, 659, 784].forEach(function (f, i) { tone(f, 0.45, "sine", 0.07, i * 0.1); }); }
  function sfxRough() { [392, 349].forEach(function (f, i) { tone(f, 0.35, "sine", 0.06, i * 0.12); }); }
  function sfxSplash() { var ac = audio(); if (!ac) return; tone(180, 0.4, "sine", 0.08); tone(140, 0.5, "triangle", 0.06, 0.08); }

  // ---- the tour -------------------------------------------------------------------------
  var mode = store.get("mesadrift_mode", "calm"); if (!MODES[mode]) mode = "calm";
  var bests = {};
  Object.keys(MODES).forEach(function (m) { bests[m] = window.GameShell ? GameShell.best("mesadrift_best_" + m, { higher: true }) : null; });

  var state = "menu";     // menu | play | over
  var F = null, flight = 0, total = 0, runBest = 0;
  var b = null;           // the balloon: x, y (its middle), vx, vy, heat, fuel, grounded, groundT, worst
  var burn = false, vent = false, keysHeld = { burn: false, vent: false }, touchHeld = { burn: false, vent: false };
  var outcome = null, outcomeT = 0, flown = [];   // after each flight: what it scored
  var cam = 0, t = 0, overAt = 0, motes = [], launched = false;
  var OVER_WAIT = 700, SETTLE = 1.2;

  function bestNow() { return bests[mode]; }
  function startRun(m) {
    if (m && MODES[m]) mode = m;
    store.set("mesadrift_mode", mode);
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    state = "play";
    total = 0; flown = []; launched = false;
    runBest = bestNow() ? bestNow().get() : 0;
    loadFlight(0);
    $("menu").hidden = true; $("over").hidden = true; $("hud").hidden = false; $("tbtns").hidden = false;
  }
  function loadFlight(n) {
    flight = n;
    F = buildFlight(n, mode === "gusty");
    b = { x: 120, y: groundAt(F, 120) + BASKET_DROP, vx: 0, vy: 0, heat: 0.42, fuel: MODES[mode].fuel, grounded: true, groundT: 0, worst: 0, bumps: 0, left: false };
    outcome = null; outcomeT = 0;
    cam = 0;
    motes = [];
    hud();
  }

  // the field's distance from the basket, in the poster's "metres"
  function toField() { return Math.round(Math.abs(F.flag - b.x)); }
  function hud() {
    $("hud-flight").textContent = "Flight " + (flight + 1) + " of 8 · " + F.name;
    $("hud-score").textContent = total;
    var fuel = Math.max(0, b.fuel / MODES[mode].fuel);
    $("hud-fuel").style.width = (fuel * 100).toFixed(1) + "%";
    $("hud-fuel").classList.toggle("low", fuel < 0.2);
  }

  function setOutcome(kind, pts, text) {
    outcome = { kind: kind, pts: pts, text: text };
    outcomeT = 0;
    burn = vent = false; burnerSound(false);
    if (kind !== "crash") {
      total += pts;
      flown.push(pts);
      if (bestNow() && total > runBest) bestNow().submit(total);
    }
    hud();
  }

  function land() {
    var onField = b.x >= F.field[0] && b.x <= F.field[1];
    if (onField) {
      var half = (F.field[1] - F.field[0]) / 2, off = Math.abs(b.x - F.flag);
      var aim = Math.round(500 * Math.max(0, 1 - off / half));
      var soft = Math.round(200 * Math.max(0, 1 - b.worst / SAFE));
      var fuel = Math.round(Math.max(0, b.fuel) * 8);
      var pts = 300 + aim + soft + fuel;
      sfxLand();
      setOutcome("landed", pts, "On the field: " + pts + " (" + (off < 12 ? "on the flag" : Math.round(off) + " from the flag") + ")");
    } else {
      sfxRough();
      setOutcome("rough", 50, "Down in the scrub: 50");
    }
  }

  // ---- the air --------------------------------------------------------------------------
  function update(dt) {
    t += dt;
    if (state !== "play") return;
    if (outcome) {
      outcomeT += dt;
      // a few moments to see where it came down, then the next flight (or the end)
      if (outcomeT > 2.4) {
        if (outcome.kind === "crash" || flight + 1 >= FLIGHTS.length) { gameOver(); return; }
        loadFlight(flight + 1);
      }
      settleMotes(dt);
      return;
    }
    var mode_ = MODES[mode];
    burn = (keysHeld.burn || touchHeld.burn) && b.fuel > 0;
    vent = keysHeld.vent || touchHeld.vent;
    burnerSound(burn);
    if (burn) { b.heat = Math.min(1, b.heat + 0.34 * dt); b.fuel = Math.max(0, b.fuel - dt); launched = true; }
    else if (vent) b.heat = Math.max(0, b.heat - 0.5 * dt);
    else b.heat = Math.max(0, b.heat - 0.035 * dt);
    // lift from the heat, against the weight and the air's drag
    // (cold, it falls at about 60 at most: fast enough to break the basket if
    // nothing is done about it before the ground, never faster)
    var ay = (b.heat - 0.5) * 110 - b.vy * 0.9;
    b.vy += ay * dt;
    // the wind of the band it's in (a gust now and then when it's gusty)
    var lay = layerOf(b.y), wind = F.winds[lay];
    if (mode === "gusty") wind *= 1 + 0.25 * Math.sin(t * 0.7 + lay * 1.7);
    if (b.grounded) b.vx *= Math.exp(-5 * dt);
    else b.vx += (wind - b.vx) * 0.9 * dt;
    var nx = Math.max(ENVELOPE, Math.min(F.width - ENVELOPE, b.x + b.vx * dt)), ny = b.y + b.vy * dt;
    if (ny > SKY - ENVELOPE) { ny = SKY - ENVELOPE; if (b.vy > 0) b.vy = 0; }
    var floor = groundAt(F, nx) + BASKET_DROP;
    if (ny <= floor) {
      // the basket meets the ground: on its top, or a mesa's side as it drifts into it
      var side = groundAt(F, nx) - groundAt(F, b.x) > 6 && b.y - BASKET_DROP < groundAt(F, nx);
      var impact = side ? Math.max(Math.abs(b.vx), -b.vy) : -b.vy;
      if (inWater(F, nx)) { b.x = nx; b.y = floor; sfxSplash(); setOutcome("crash", 0, "Into the river"); return; }
      // (only coming down too hard breaks the basket: drifting into a rock face
      // scrapes it, and the balloon is knocked back off it)
      if (impact > CRASH && !side) { b.x = nx; b.y = floor; sfxCrash(); setOutcome("crash", 0, "Down too hard: the basket broke"); return; }
      if (side) { nx = b.x; b.vx = -b.vx * 0.3; impact = Math.min(impact, SAFE + 1); }
      ny = Math.max(floor, groundAt(F, nx) + BASKET_DROP);
      if (impact > SAFE) { b.vy = impact * 0.32; b.bumps++; b.worst = Math.max(b.worst, impact); sfxBump(); b.grounded = false; }
      else {
        if (!b.grounded && launched) b.worst = Math.max(b.worst, impact);
        b.vy = Math.max(0, b.vy); b.grounded = true;
      }
    } else if (ny > floor + 1) { b.grounded = false; b.groundT = 0; }
    b.x = nx; b.y = ny;
    // down and staying down: the flight is over where it rests (not the field it took off from)
    if (b.grounded && launched && b.heat < 0.52) {
      b.groundT += dt;
      if (b.groundT > SETTLE && Math.abs(b.vx) < 10) { if (b.x > 300) land(); else b.groundT = 0; }
    }
    cam += (Math.max(0, Math.min(F.width - visW, b.x - visW * 0.42)) - cam) * Math.min(1, dt * 3);
    settleMotes(dt);
    hud();
  }
  // the dust and wisps that ride each band's wind (Visual FX on)
  function settleMotes(dt) {
    if (!fx()) { motes.length = 0; return; }
    while (motes.length < 26) motes.push({ x: cam + Math.random() * visW, y: 20 + Math.random() * (SKY - 40), a: Math.random() });
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i], w = F.winds[layerOf(m.y)] * 1.6;
      m.x += w * dt;
      if (m.x < cam - 40) m.x = cam + visW + 30; else if (m.x > cam + visW + 40) m.x = cam - 30;
    }
  }

  function gameOver() {
    state = "over";
    overAt = performance.now();
    burnerSound(false);
    var all = flown.length === FLIGHTS.length;
    var bb = bestNow(), isBest = bb && total > 0 ? (bb.submit(total) || total > runBest) : false;
    $("over-title").textContent = all ? "The tour is flown" : outcome && /river/.test(outcome.text) ? "Down in the river" : "The basket broke";
    $("over-msg").textContent = total;
    var line = document.createElement("span"), best = document.createElement("span");
    line.textContent = all ? "eight flights, " + flown.filter(function (p) { return p > 50; }).length + " on the field" :
      "on flight " + (flight + 1) + ", " + F.name + " · " + flown.length + " flown";
    best.className = "best" + (isBest ? " record" : "");
    best.textContent = isBest ? "a new " + MODES[mode].name.toLowerCase() + " record" : bb && bb.get() ? "best: " + bb.get() : "no record yet";
    $("over-stats").replaceChildren(line, best);
    $("hud").hidden = true; $("tbtns").hidden = true;
    $("over").hidden = false;
  }

  // ---- drawing ---------------------------------------------------------------------------
  function X(x) { return (x - cam) * S; }
  function Y(y) { return VH - PADB - y * S; }
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    var L = (F || buildFlight(0, false)).light, FF = F || buildFlight(0, false);
    // the sky in flat bands, poster-fashion
    var bands = 7;
    for (var i = 0; i < bands; i++) {
      g.fillStyle = mix(L[0], L[1], i / (bands - 1));
      g.fillRect(0, (VH * i) / bands, VW, VH / bands + 1);
    }
    // the sun
    g.fillStyle = L[2];
    g.beginPath(); g.arc(VW * 0.72 - cam * S * 0.05, VH * 0.3, Math.min(VW, VH) * 0.11, 0, 7); g.fill();
    // far rock, drifting slowly by
    g.fillStyle = L[3];
    g.beginPath(); g.moveTo(0, VH);
    for (var sx = 0; sx <= VW + 20; sx += 20) {
      var wx = sx / S + cam * 0.35;
      var fh = 140 + 70 * Math.sin(wx / 230) + 50 * Math.sin(wx / 97 + 1.3);
      fh = Math.round(fh / 40) * 40;   // stepped: buttes, not hills
      g.lineTo(sx, Y(fh * 0.9));
    }
    g.lineTo(VW, VH); g.closePath(); g.fill();
    // the winds: a column of chevrons at the right edge, one row a band, always shown
    drawWinds(FF);
    // the near land
    drawLand(FF, L);
    if (state !== "menu" && b) drawBalloon();
    // the dust that rides the winds
    if (motes.length) {
      g.strokeStyle = "rgba(255, 248, 232, 0.55)"; g.lineWidth = 2; g.lineCap = "round";
      for (var k = 0; k < motes.length; k++) { var m = motes[k], w = FF.winds[layerOf(m.y)]; g.beginPath(); g.moveTo(X(m.x), Y(m.y)); g.lineTo(X(m.x - w * 0.35), Y(m.y)); g.stroke(); }
    }
    if (state === "play" && b) drawWord();
  }
  function mix(a, c, k) {
    var p = function (h, i) { return parseInt(h.slice(1 + i * 2, 3 + i * 2), 16); };
    var r = Math.round(p(a, 0) + (p(c, 0) - p(a, 0)) * k), gg = Math.round(p(a, 1) + (p(c, 1) - p(a, 1)) * k), bb = Math.round(p(a, 2) + (p(c, 2) - p(a, 2)) * k);
    return "rgb(" + r + "," + gg + "," + bb + ")";
  }
  function drawLand(FF, L) {
    var x0 = Math.max(0, Math.floor(cam / STEP) - 1), x1 = Math.min(FF.h.length - 1, Math.ceil((cam + visW) / STEP) + 1);
    // rock sides darker than the tops: the strata
    g.fillStyle = L[5];
    g.beginPath(); g.moveTo(X(x0 * STEP), VH);
    for (var i = x0; i <= x1; i++) g.lineTo(X(i * STEP), Y(FF.h[i]));
    g.lineTo(X(x1 * STEP), VH); g.closePath(); g.fill();
    g.fillStyle = L[4];
    g.beginPath(); g.moveTo(X(x0 * STEP), VH);
    for (i = x0; i <= x1; i++) g.lineTo(X(i * STEP), Y(FF.h[i] - 14));
    g.lineTo(X(x1 * STEP), VH); g.closePath(); g.fill();
    // bands of strata
    g.strokeStyle = "rgba(90, 40, 28, 0.25)"; g.lineWidth = Math.max(1, 3 * S);
    for (var sy = 40; sy < 400; sy += 46) {
      g.beginPath(); var on = false;
      for (i = x0; i <= x1; i++) {
        if (FF.h[i] - 14 > sy) { if (!on) { g.moveTo(X(i * STEP), Y(sy)); on = true; } else g.lineTo(X(i * STEP), Y(sy)); }
        else on = false;
      }
      g.stroke();
    }
    // the river
    g.fillStyle = "#4f9aa8";
    FF.water.forEach(function (w) { g.fillRect(X(w[0]), Y(16), (w[1] - w[0]) * S, 16 * S); });
    g.fillStyle = "rgba(255, 255, 255, 0.45)";
    FF.water.forEach(function (w) { for (var k = w[0] + 10; k < w[1] - 14; k += 26) g.fillRect(X(k), Y(11), 12 * S, 2 * S); });
    // the start field and the ringed field to land on
    var gy = FF.h[Math.round(FF.flag / STEP)];
    g.fillStyle = "#c9b35a";
    g.fillRect(X(FF.field[0]), Y(gy) - 2, (FF.field[1] - FF.field[0]) * S, 6 * S);
    g.fillRect(X(20), Y(40) - 2, 220 * S, 6 * S);
    // the target cloth, rings laid flat (an ellipse seen from the side)
    var half = (FF.field[1] - FF.field[0]) / 2;
    [[1, "#f6ecd6"], [0.66, "#c4473a"], [0.36, "#f6ecd6"], [0.12, "#c4473a"]].forEach(function (r) {
      g.fillStyle = r[1];
      g.beginPath(); g.ellipse(X(FF.flag), Y(gy) + 1, half * r[0] * S, Math.max(2, 7 * S * r[0] + 1), 0, 0, 7); g.fill();
    });
    // the flag: it streams the ground wind's way
    var pole = 70, dir = FF.winds[0] >= 0 ? 1 : -1, flut = fx() ? Math.sin(t * 9) * 3 : 0;
    g.strokeStyle = "#4b2e3a"; g.lineWidth = Math.max(1.5, 3 * S);
    g.beginPath(); g.moveTo(X(FF.flag), Y(gy)); g.lineTo(X(FF.flag), Y(gy + pole)); g.stroke();
    g.fillStyle = "#e0a83a";
    g.beginPath(); g.moveTo(X(FF.flag), Y(gy + pole)); g.lineTo(X(FF.flag + dir * 34), Y(gy + pole - 7 + flut)); g.lineTo(X(FF.flag), Y(gy + pole - 15)); g.closePath(); g.fill();
  }
  function drawWinds(FF) {
    var colW = 46, x = VW - colW - 10;
    g.fillStyle = "rgba(246, 236, 214, 0.55)";
    g.fillRect(x, Y(SKY), colW, SKY * S);
    g.strokeStyle = "rgba(75, 46, 58, 0.5)"; g.lineWidth = 1.5; g.strokeRect(x + 0.5, Y(SKY) + 0.5, colW - 1, SKY * S - 1);
    for (var i = 0; i < 4; i++) {
      var yMid = Y((LAYERS[i] + LAYERS[i + 1]) / 2), w = FF.winds[i], n = Math.min(3, Math.max(1, Math.round(Math.abs(w) / 15)));
      var here = b && state === "play" && layerOf(b.y) === i;
      g.fillStyle = here ? "#c4473a" : "#4b2e3a";
      for (var k = 0; k < n; k++) {
        var cx = x + colW / 2 + (k - (n - 1) / 2) * 12 * (w >= 0 ? 1 : -1), s = w >= 0 ? 1 : -1;
        g.beginPath(); g.moveTo(cx - 5 * s, yMid - 8); g.lineTo(cx + 5 * s, yMid); g.lineTo(cx - 5 * s, yMid + 8); g.lineTo(cx - 1 * s, yMid); g.closePath(); g.fill();
      }
      if (i > 0) { g.strokeStyle = "rgba(75, 46, 58, 0.3)"; g.lineWidth = 1; g.beginPath(); g.moveTo(x, Y(LAYERS[i])); g.lineTo(x + colW, Y(LAYERS[i])); g.stroke(); }
    }
    // where the balloon is, on the column
    if (b && state === "play") { g.fillStyle = "#c4473a"; g.beginPath(); g.arc(x - 6, Y(b.y), 4, 0, 7); g.fill(); }
  }
  function drawBalloon() {
    var x = X(b.x), y = Y(b.y), r = ENVELOPE * S;
    // its shadow on the ground below
    var gy = Y(groundAt(F, b.x)), up = (b.y - groundAt(F, b.x)) / SKY;
    g.fillStyle = "rgba(60, 30, 26, " + (0.28 * (1 - up)).toFixed(3) + ")";
    g.beginPath(); g.ellipse(x, gy, r * (0.8 + up), r * 0.18, 0, 0, 7); g.fill();
    // ropes and basket
    var by = y + (BASKET_DROP - 12) * S;
    g.strokeStyle = "#4b2e3a"; g.lineWidth = Math.max(1, 1.6 * S);
    g.beginPath(); g.moveTo(x - r * 0.55, y + r * 0.72); g.lineTo(x - 7 * S, by); g.moveTo(x + r * 0.55, y + r * 0.72); g.lineTo(x + 7 * S, by); g.stroke();
    g.fillStyle = "#8a5a32"; g.fillRect(x - 9 * S, by, 18 * S, 12 * S);
    g.fillStyle = "#6b4325"; g.fillRect(x - 9 * S, by, 18 * S, 3 * S);
    // the burner's flame
    if (burn) {
      var fl = fx() ? 1 + Math.sin(t * 40) * 0.18 : 1;
      g.fillStyle = "#f6b13a";
      g.beginPath(); g.moveTo(x - 5 * S, by - 2 * S); g.quadraticCurveTo(x, by - 26 * S * fl, x + 5 * S, by - 2 * S); g.closePath(); g.fill();
      g.fillStyle = "#fff1c4";
      g.beginPath(); g.moveTo(x - 2.5 * S, by - 2 * S); g.quadraticCurveTo(x, by - 14 * S * fl, x + 2.5 * S, by - 2 * S); g.closePath(); g.fill();
    }
    // the envelope: gores of teal, mustard and red
    g.save();
    g.beginPath(); g.arc(x, y, r, Math.PI * 0.82, Math.PI * 2.18); g.lineTo(x + r * 0.32, y + r * 1.1); g.lineTo(x - r * 0.32, y + r * 1.1); g.closePath();
    g.clip();
    var cols = ["#2e8b8b", "#e0a83a", "#c4473a", "#e0a83a", "#2e8b8b"];
    for (var k = 0; k < 5; k++) { g.fillStyle = cols[k]; g.fillRect(x - r + k * (2 * r / 5), y - r, 2 * r / 5 + 1, r * 2.2); }
    g.fillStyle = "rgba(255, 255, 255, 0.18)"; g.fillRect(x - r, y - r, r * 0.7, r * 2.2);
    g.restore();
    g.strokeStyle = "#4b2e3a"; g.lineWidth = Math.max(1, 1.5 * S);
    g.beginPath(); g.arc(x, y, r, Math.PI * 0.82, Math.PI * 2.18); g.lineTo(x + r * 0.32, y + r * 1.1); g.lineTo(x - r * 0.32, y + r * 1.1); g.closePath(); g.stroke();
  }
  // the vario by the balloon, and the word when a flight ends
  function drawWord() {
    var x = X(b.x), y = Y(b.y);
    g.textAlign = "center"; g.textBaseline = "middle";
    if (outcome) {
      g.font = "400 " + Math.round(Math.max(22, 30 * S)) + "px \"Abril Fatface\", serif";
      g.fillStyle = outcome.kind === "landed" ? "#3d5a2a" : "#7a2a24";
      g.fillText(outcome.text, VW / 2, Math.max(110, VH * 0.24));
      return;
    }
    var down = -b.vy;
    g.font = "700 " + Math.round(Math.max(12, 14 * S)) + "px \"Josefin Sans\", sans-serif";
    g.fillStyle = down > SAFE ? "#a3271f" : "#3d5a2a";
    var label = down > 2 ? "↓ " + Math.round(down) : b.vy > 2 ? "↑ " + Math.round(b.vy) : "level";
    g.fillText(label, x + ENVELOPE * S + 26, y - 6);
    // which way the field is, when it's off the screen
    if (F.flag < cam || F.flag > cam + visW - 50) {
      var right = F.flag > b.x;
      g.fillStyle = "#4b2e3a";
      g.textAlign = "left";
      g.fillText(right ? "the field: " + toField() + " ahead ›" : "‹ the field: " + toField() + " behind", 18, PADT + (VW <= 640 ? 52 : 24));
    }
  }

  // ---- the loop, pause and way out ---------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    restart: function () { startRun(mode); },
    menu: toMenu,
    onChange: function (paused) { if (paused) { burnerSound(false); keysHeld.burn = keysHeld.vent = false; } }
  }) : { isPaused: function () { return false; } };
  // Leaving asks first once the balloon has left the ground (or a flight has been flown)
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play" && (launched || flight > 0); },
    pausable: P
  });
  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    if (!P.isPaused()) update(dt);
    draw();
  }

  // ---- input ------------------------------------------------------------------------------
  function keyRole(k) {
    if (k === " " || k === "ArrowUp" || k === "w" || k === "W") return "burn";
    if (k === "ArrowDown" || k === "s" || k === "S") return "vent";
    return null;
  }
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey || state !== "play" || P.isPaused()) return;
    var role = keyRole(e.key);
    if (!role) return;
    e.preventDefault();
    keysHeld[role] = true;
    audio();
  });
  document.addEventListener("keyup", function (e) { var role = keyRole(e.key); if (role) keysHeld[role] = false; });
  window.addEventListener("blur", function () { keysHeld.burn = keysHeld.vent = false; touchHeld.burn = touchHeld.vent = false; });
  // the touch buttons: held, they burn or vent
  ["burn", "vent"].forEach(function (role) {
    var el = $("t-" + role);
    var on = function (e) { e.preventDefault(); if (state === "play" && !P.isPaused()) { touchHeld[role] = true; el.classList.add("held"); audio(); } };
    var off = function () { touchHeld[role] = false; el.classList.remove("held"); };
    el.addEventListener("pointerdown", on);
    el.addEventListener("pointerup", off); el.addEventListener("pointercancel", off); el.addEventListener("pointerleave", off);
  });

  // ---- menu and end card ----------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (bt) { bt.classList.toggle("on", bt.dataset.v === mode); });
    var parts = [];
    Object.keys(MODES).forEach(function (m) { if (bests[m] && bests[m].get()) parts.push(MODES[m].name + " " + bests[m].get()); });
    $("bests").textContent = parts.length ? "best tours: " + parts.join(" · ") : "no tours flown yet";
  }
  function toMenu() {
    state = "menu"; burnerSound(false);
    F = buildFlight(0, false); b = null; cam = 0; motes = [];
    $("over").hidden = true; $("hud").hidden = true; $("tbtns").hidden = true; $("menu").hidden = false;
    paintMenu();
  }
  document.querySelectorAll("#pick-mode button").forEach(function (bt) {
    bt.addEventListener("click", function () { mode = bt.dataset.v; store.set("mesadrift_mode", mode); paintMenu(); });
    bt.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("play").addEventListener("click", function () { startRun(mode); });
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);
  if (window.GameShell && GameShell.menuKeys) {
    GameShell.menuKeys({ active: function () { return state === "menu"; }, groups: ["#pick-mode button"], start: "#play", space: true });
    GameShell.menuKeys({ active: function () { return state === "over" && performance.now() - overAt > OVER_WAIT; },
      groups: [{ sel: "#to-menu", keys: ["backspace"] }], start: "#again", space: true });
  }

  layout();
  window.addEventListener("resize", layout);
  toMenu();
  requestAnimationFrame(function (tt) { last = tt; requestAnimationFrame(loop); });

  // test hooks: the Playwright harness drives tours through these
  window.MesaDrift = {
    state: function () { return state; },
    mode: function () { return mode; },
    flight: function () { return flight; },
    total: function () { return total; },
    outcome: function () { return outcome; },
    balloon: function () { return b && { x: b.x, y: b.y, vx: b.vx, vy: b.vy, heat: b.heat, fuel: b.fuel, grounded: b.grounded }; },
    world: function () { return F && { width: F.width, field: F.field.slice(), flag: F.flag, winds: F.winds.slice(), water: F.water.slice(), ground: function (x) { return groundAt(F, x); } }; },
    ground: function (x) { return groundAt(F, x); },
    flights: function (gusty) { return FLIGHTS.map(function (_, n) { var f = buildFlight(n, !!gusty); return { name: f.name, width: f.width, field: f.field, flag: f.flag, winds: f.winds, water: f.water, fieldY: groundAt(f, f.flag), ridge: groundAt(f, f.width - 40), peak: Math.max.apply(null, f.h) }; }); },
    start: startRun,
    toMenu: toMenu,
    hold: function (role, on) { keysHeld[role] = !!on; },
    // put the balloon somewhere (for the tests), still
    place: function (x, y, vx, vy, heat) { b.x = x; b.y = y; b.vx = vx || 0; b.vy = vy || 0; if (heat != null) b.heat = heat; b.grounded = false; b.groundT = 0; launched = true; },
    step: function (dt) { update(dt); },
    motes: function () { return motes.length; },
    burning: function () { return burn; },
    layers: LAYERS.slice(),
    safe: SAFE, crash: CRASH, drop: BASKET_DROP
  };
})();
