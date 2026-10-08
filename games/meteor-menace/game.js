/* Meteor Menace! — classic rock-blasting, drawn as a pulp sci-fi comic.
   Chrome rocket with ink outlines, craggy inked boulders, halftone-dot space,
   and every big kill goes off as a KRAK!/BLAM! starburst panel. */
(function () {
  "use strict";

  var canvas = document.getElementById("screen");
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;   // the logical size everything is drawn in
  // Hi-DPI: the backing store (and the backdrop's) is W×H times the device
  // pixel ratio, up to 2; render() draws through the matching transform.
  // A ratio change (browser zoom, another screen) refits it.
  var dpr = 1;
  function fitCanvas() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  }
  fitCanvas();

  var INK = "#1a1430";
  var PAPER = "#fff8e7";
  var YELLOW = "#ffcf3f";
  var RED = "#e23b46";
  var FONT = '"Bangers", "Segoe UI", sans-serif';

  function fx() { return !(window.RM_ON && window.RM_ON()); }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  if (document.fonts && document.fonts.load) {
    document.fonts.load('40px "Bangers"');
  }

  // ---- sound ---------------------------------------------------------------
  var actx = null, noiseB = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  ["pointerdown", "touchend", "keydown", "click"].forEach(function (t) {
    document.addEventListener(t, function () { audio(); }, true);
  });
  function noiseBuf(ac) {
    if (!noiseB) {
      noiseB = ac.createBuffer(1, Math.floor(ac.sampleRate * 1.2), ac.sampleRate);
      var d = noiseB.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    return noiseB;
  }
  function pew() {
    var ac = audio(); if (!ac) return;
    var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = "square";
    o.frequency.setValueAtTime(640, t);
    o.frequency.exponentialRampToValueAtTime(170, t + 0.12);
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + 0.14);
  }
  function boom(big) {
    var ac = audio(); if (!ac) return;
    var t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    var dur = big ? 0.6 : 0.32;
    s.buffer = noiseBuf(ac);
    f.type = "lowpass";
    f.frequency.setValueAtTime(big ? 900 : 1400, t);
    f.frequency.exponentialRampToValueAtTime(90, t + dur);
    g.gain.setValueAtTime(big ? 0.5 : 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(ac.destination);
    s.start(t); s.stop(t + dur + 0.05);
  }
  var thrustNode = null;
  function thrustSnd(on) {
    var ac = audio(); if (!ac) return;
    if (on && !thrustNode) {
      var s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf(ac); s.loop = true;
      f.type = "bandpass"; f.frequency.value = 170; f.Q.value = 0.8;
      g.gain.value = 0.08;
      s.connect(f); f.connect(g); g.connect(ac.destination);
      s.start();
      thrustNode = { s: s, g: g };
    } else if (!on && thrustNode) {
      try { thrustNode.g.gain.setTargetAtTime(0.0001, ac.currentTime, 0.04); thrustNode.s.stop(ac.currentTime + 0.2); } catch (e) {}
      thrustNode = null;
    }
  }
  function saucerBlip(hi) {
    var ac = audio(); if (!ac) return;
    var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = "triangle"; o.frequency.value = hi ? 660 : 520;
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + 0.18);
  }
  function jingle() {
    var ac = audio(); if (!ac) return;
    [523, 659, 784].forEach(function (f, i) {
      var t = ac.currentTime + i * 0.09, o = ac.createOscillator(), g = ac.createGain();
      o.type = "square"; o.frequency.value = f;
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + 0.14);
    });
  }

  // ---- the comic backdrop (drawn once, and again if the pixel ratio changes)
  // Deep-space panel: flat indigo, a halftone dot screen, ink-sparkle stars,
  // a ringed planet in one corner and a comet in the other.
  var bg = document.createElement("canvas");
  // the stars are scattered once, so a repaint keeps the same sky
  var STARS = [];
  for (var si = 0; si < 46; si++) STARS.push({ x: Math.random() * W, y: Math.random() * H, s: rand(1.4, 4.2), a: rand(0.35, 0.9).toFixed(2) });
  function paintBg() {
    bg.width = Math.round(W * dpr); bg.height = Math.round(H * dpr);
    var b = bg.getContext("2d");
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    b.fillStyle = "#232a55";
    b.fillRect(0, 0, W, H);
    // halftone dots, larger toward the lower-left like a printed gradient
    b.fillStyle = "#2c3568";
    for (var y = 0; y < H + 12; y += 13) {
      for (var x = ((y / 13) % 2) * 6.5; x < W + 12; x += 13) {
        var k = Math.max(0, 1 - Math.hypot(x, H - y) / (W * 1.05));
        var r = 1 + 2.4 * (1 - k);
        b.beginPath(); b.arc(x, y, r, 0, Math.PI * 2); b.fill();
      }
    }
    // ink-sparkle stars (4-point crosses)
    for (var i = 0; i < STARS.length; i++) {
      var sx = STARS[i].x, sy = STARS[i].y, s = STARS[i].s;
      b.strokeStyle = "rgba(246,240,220," + STARS[i].a + ")";
      b.lineWidth = 1.4;
      b.beginPath();
      b.moveTo(sx - s, sy); b.lineTo(sx + s, sy);
      b.moveTo(sx, sy - s); b.lineTo(sx, sy + s);
      b.stroke();
    }
    // ringed planet, top-right
    var px = W - 86, py = 84;
    b.save();
    b.lineWidth = 3; b.strokeStyle = INK;
    b.fillStyle = "#e2a23b";
    b.beginPath(); b.arc(px, py, 40, 0, Math.PI * 2); b.fill(); b.stroke();
    b.fillStyle = "#c97f2c";
    b.beginPath(); b.ellipse(px - 6, py + 12, 30, 8, -0.2, 0, Math.PI * 2); b.fill();
    b.beginPath(); b.ellipse(px + 10, py - 14, 18, 5, -0.2, 0, Math.PI * 2); b.fill();
    b.beginPath(); b.arc(px, py, 40, 0, Math.PI * 2); b.stroke();
    b.fillStyle = "rgba(244,208,111,0.85)";
    b.beginPath(); b.ellipse(px, py, 66, 15, -0.28, 0, Math.PI * 2);
    b.ellipse(px, py, 48, 9, -0.28, 0, Math.PI * 2, true);
    b.fill("evenodd");
    b.beginPath(); b.ellipse(px, py, 66, 15, -0.28, 0, Math.PI * 2); b.stroke();
    b.beginPath(); b.ellipse(px, py, 48, 9, -0.28, 0, Math.PI * 2); b.stroke();
    b.restore();
    // a comet streaking across the far left
    b.strokeStyle = "rgba(246,240,220,0.7)";
    b.lineWidth = 2.4;
    b.beginPath(); b.moveTo(30, 190); b.lineTo(86, 158); b.stroke();
    b.lineWidth = 1.4;
    b.beginPath(); b.moveTo(34, 200); b.lineTo(78, 174); b.stroke();
    b.fillStyle = "#f6f0dc";
    b.beginPath(); b.arc(90, 156, 5, 0, Math.PI * 2); b.fill();
    b.strokeStyle = INK; b.lineWidth = 2;
    b.beginPath(); b.arc(90, 156, 5, 0, Math.PI * 2); b.stroke();
  }
  paintBg();
  window.addEventListener("resize", function () {
    if (Math.min(2, window.devicePixelRatio || 1) === dpr) return;
    fitCanvas();
    paintBg();
  });

  // ---- input -----------------------------------------------------------------
  var input = { left: false, right: false, thrust: false, fire: false };
  var KEYMAP = {
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right",
    ArrowUp: "thrust", w: "thrust", W: "thrust",
    " ": "fire"
  };
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
    var k = KEYMAP[e.key];
    if (k) { input[k] = true; e.preventDefault(); }
    if (e.key === "Enter" && state !== "play") { start(); e.preventDefault(); }
  });
  document.addEventListener("keyup", function (e) {
    var k = KEYMAP[e.key];
    if (k) input[k] = false;
  });
  // A key let go in another window sends this page no keyup, so losing focus
  // (or pausing) lets go of everything: the ship mustn't come back still
  // thrusting. A key really still held repeats, which presses it again.
  function releaseAll() { input.left = input.right = input.thrust = input.fire = false; }
  window.addEventListener("blur", releaseAll);
  // touch buttons hold their flag while pressed
  [["t-left", "left"], ["t-right", "right"], ["t-thrust", "thrust"], ["t-fire", "fire"]].forEach(function (pair) {
    var el = document.getElementById(pair[0]);
    if (!el) return;
    var press = function (e) { e.preventDefault(); input[pair[1]] = true; };
    var release = function (e) { e.preventDefault(); input[pair[1]] = false; };
    el.addEventListener("touchstart", press, { passive: false });
    el.addEventListener("touchend", release, { passive: false });
    el.addEventListener("touchcancel", release, { passive: false });
    el.addEventListener("mousedown", press);
    el.addEventListener("mouseup", release);
    el.addEventListener("mouseleave", release);
  });
  canvas.addEventListener("pointerdown", function () {
    if (state !== "play") start();
  });

  // ---- game state ------------------------------------------------------------
  var best = window.GameShell ? GameShell.best("asteroids_best", { higher: true }) : { get: function () { return 0; }, submit: function () {} };
  var state = "menu";      // menu | play | over
  var score = 0, lives = 3, wave = 0, extraAt = 10000;
  var savedBest = 0;       // the stored best this run has caught up to (see update)
  var ship = null, respawnT = 0;
  var rocks = [], bullets = [], ebullets = [], booms = [], words = [];
  var saucer = null, saucerT = 14, saucerBlipT = 0;
  var nextWaveT = 0, waveMsgT = 0, shake = 0, time = 0;

  function newShip() {
    return { x: W / 2, y: H / 2, vx: 0, vy: 0, a: -Math.PI / 2, grace: 2.5, cool: 0, r: 12 };
  }

  var ROCK_COLS = [
    ["#ad9a84", "#77644e"],   // warm boulder
    ["#9d90a8", "#645671"]    // cool boulder
  ];
  function makeRock(x, y, size) {
    var r = size === 3 ? 44 : size === 2 ? 26 : 14;
    var n = 9 + ((Math.random() * 4) | 0);
    var pts = [];
    for (var i = 0; i < n; i++) pts.push(rand(0.72, 1.08));
    var sp = (size === 3 ? 42 : size === 2 ? 72 : 112) * rand(0.7, 1.4) * (1 + wave * 0.05);
    var ang = rand(0, Math.PI * 2);
    var craters = [];
    var nc = size === 3 ? 3 : size === 2 ? 2 : 1;
    for (var c = 0; c < nc; c++) {
      var ca = rand(0, Math.PI * 2), cd = rand(0.15, 0.55) * r;
      craters.push({ dx: Math.cos(ca) * cd, dy: Math.sin(ca) * cd, r: rand(0.14, 0.24) * r });
    }
    return {
      x: x, y: y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      size: size, r: r, pts: pts,
      rot: rand(0, Math.PI * 2), spin: rand(-1.1, 1.1),
      col: pick(ROCK_COLS), craters: craters
    };
  }
  function spawnWave() {
    var count = Math.min(3 + wave, 8);
    for (var i = 0; i < count; i++) {
      var x, y, tries = 0;
      do {
        // along the panel's edges, never on top of the ship
        if (Math.random() < 0.5) { x = Math.random() < 0.5 ? rand(0, 60) : rand(W - 60, W); y = rand(0, H); }
        else { y = Math.random() < 0.5 ? rand(0, 60) : rand(H - 60, H); x = rand(0, W); }
        tries++;
      } while (ship && Math.hypot(x - ship.x, y - ship.y) < 170 && tries < 20);
      rocks.push(makeRock(x, y, 3));
    }
    waveMsgT = 1.9;
  }

  function menuScene() {
    rocks = [];
    for (var i = 0; i < 4; i++) rocks.push(makeRock(rand(0, W), rand(0, H * 0.4), pick([3, 3, 2])));
  }
  menuScene();

  function start() {
    score = 0; lives = 3; wave = 1; extraAt = 10000;
    savedBest = best.get();
    rocks = []; bullets = []; ebullets = []; booms = []; words = [];
    saucer = null; saucerT = rand(14, 22);
    ship = newShip(); respawnT = 0; shake = 0;
    state = "play";
    spawnWave();
  }

  function gameOver() {
    best.submit(score);
    state = "over";
    thrustSnd(false);
  }

  // ---- effects ---------------------------------------------------------------
  var WORDS = ["BLAM!", "POW!", "KRAK!", "BOOM!", "WHAM!"];
  function addBoom(x, y, big) {
    booms.push({ x: x, y: y, t: 0, dur: big ? 0.55 : 0.38, rmax: big ? 64 : 34, rot: rand(0, Math.PI) });
    boom(big);
  }
  function addWord(x, y, text) {
    words.push({
      x: Math.min(Math.max(x, 70), W - 70), y: Math.min(Math.max(y, 60), H - 40),
      text: text, t: 0, rot: rand(-0.16, 0.16)
    });
  }

  // ---- update -----------------------------------------------------------------
  function wrap(o, r) {
    if (o.x < -r) o.x += W + r * 2;
    if (o.x > W + r) o.x -= W + r * 2;
    if (o.y < -r) o.y += H + r * 2;
    if (o.y > H + r) o.y -= H + r * 2;
  }

  function splitRock(rk, idx) {
    rocks.splice(idx, 1);
    score += rk.size === 3 ? 20 : rk.size === 2 ? 50 : 100;
    if (rk.size > 1) {
      rocks.push(makeRock(rk.x, rk.y, rk.size - 1));
      rocks.push(makeRock(rk.x, rk.y, rk.size - 1));
    }
    addBoom(rk.x, rk.y, rk.size === 3);
    if (rk.size === 3) addWord(rk.x, rk.y, pick(WORDS));
  }

  function killShip() {
    addBoom(ship.x, ship.y, true);
    addWord(ship.x, ship.y, "KRA-KOOM!");
    if (fx()) shake = 0.4;
    thrustSnd(false);
    ship = null;
    lives--;
    if (lives < 0) { gameOver(); return; }
    respawnT = 1.6;
  }

  function update(dt) {
    time += dt;
    if (shake > 0) shake = Math.max(0, shake - dt);

    // rocks drift in every state (the menu shows them too)
    for (var i = 0; i < rocks.length; i++) {
      var rk = rocks[i];
      rk.x += rk.vx * dt; rk.y += rk.vy * dt;
      rk.rot += rk.spin * dt;
      wrap(rk, rk.r);
    }
    // effect timers run everywhere
    for (i = booms.length - 1; i >= 0; i--) { booms[i].t += dt; if (booms[i].t > booms[i].dur) booms.splice(i, 1); }
    for (i = words.length - 1; i >= 0; i--) { words[i].t += dt; if (words[i].t > 0.9) words.splice(i, 1); }

    if (state !== "play") return;
    if (waveMsgT > 0) waveMsgT -= dt;

    // ---- ship
    if (ship) {
      if (input.left) ship.a -= 3.9 * dt;
      if (input.right) ship.a += 3.9 * dt;
      ship.thrusting = !!input.thrust;
      thrustSnd(ship.thrusting);
      if (ship.thrusting) {
        ship.vx += Math.cos(ship.a) * 300 * dt;
        ship.vy += Math.sin(ship.a) * 300 * dt;
      }
      var damp = Math.exp(-0.55 * dt);
      ship.vx *= damp; ship.vy *= damp;
      var spd = Math.hypot(ship.vx, ship.vy);
      if (spd > 430) { ship.vx *= 430 / spd; ship.vy *= 430 / spd; }
      ship.x += ship.vx * dt; ship.y += ship.vy * dt;
      wrap(ship, 16);
      if (ship.grace > 0) ship.grace -= dt;
      ship.cool -= dt;
      if (input.fire && ship.cool <= 0 && bullets.length < 5) {
        var nx = ship.x + Math.cos(ship.a) * 17, ny = ship.y + Math.sin(ship.a) * 17;
        bullets.push({
          x: nx, y: ny,
          vx: ship.vx * 0.35 + Math.cos(ship.a) * 540,
          vy: ship.vy * 0.35 + Math.sin(ship.a) * 540,
          life: 0.95
        });
        ship.cool = 0.19;
        pew();
      }
    } else if (lives >= 0) {
      thrustSnd(false);
      respawnT -= dt;
      if (respawnT <= 0) {
        // wait for the centre of the panel to clear
        var clear = true;
        for (i = 0; i < rocks.length; i++) {
          if (Math.hypot(rocks[i].x - W / 2, rocks[i].y - H / 2) < 130 + rocks[i].r) { clear = false; break; }
        }
        if (clear) ship = newShip();
      }
    }

    // ---- bullets
    for (i = bullets.length - 1; i >= 0; i--) {
      var bl = bullets[i];
      bl.x += bl.vx * dt; bl.y += bl.vy * dt;
      bl.life -= dt;
      wrap(bl, 4);
      if (bl.life <= 0) { bullets.splice(i, 1); continue; }
      var hit = false;
      for (var j = rocks.length - 1; j >= 0; j--) {
        if (Math.hypot(bl.x - rocks[j].x, bl.y - rocks[j].y) < rocks[j].r) {
          splitRock(rocks[j], j);
          bullets.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (hit) continue;
      if (saucer && Math.hypot(bl.x - saucer.x, bl.y - saucer.y) < 22) {
        score += saucer.small ? 1000 : 200;
        addBoom(saucer.x, saucer.y, true);
        addWord(saucer.x, saucer.y, "ZAP!");
        saucer = null;
        saucerT = rand(14, 24);
        bullets.splice(i, 1);
      }
    }

    // ---- saucer
    if (!saucer && wave >= 2) {
      saucerT -= dt;
      if (saucerT <= 0) {
        var fromLeft = Math.random() < 0.5;
        saucer = {
          x: fromLeft ? -30 : W + 30,
          y: rand(70, H - 120),
          dir: fromLeft ? 1 : -1,
          small: score >= 8000 || Math.random() < 0.3,
          shotT: 1.1, bobT: rand(0, 9)
        };
      }
    }
    if (saucer) {
      saucer.bobT += dt;
      saucer.x += saucer.dir * (saucer.small ? 150 : 105) * dt;
      saucer.y += Math.sin(saucer.bobT * 1.7) * 34 * dt;
      saucerBlipT -= dt;
      if (saucerBlipT <= 0) { saucerBlip(saucer.small); saucerBlipT = 0.34; }
      saucer.shotT -= dt;
      if (saucer.shotT <= 0 && ship) {
        var aim = Math.atan2(ship.y - saucer.y, ship.x - saucer.x);
        if (!saucer.small) aim += rand(-0.6, 0.6);
        else aim += rand(-0.09, 0.09);
        ebullets.push({ x: saucer.x, y: saucer.y + 6, vx: Math.cos(aim) * 290, vy: Math.sin(aim) * 290, life: 2.4 });
        saucer.shotT = saucer.small ? 1.15 : 1.5;
      }
      if ((saucer.dir > 0 && saucer.x > W + 32) || (saucer.dir < 0 && saucer.x < -32)) {
        saucer = null;
        saucerT = rand(12, 22);
      }
    }
    for (i = ebullets.length - 1; i >= 0; i--) {
      var eb = ebullets[i];
      eb.x += eb.vx * dt; eb.y += eb.vy * dt; eb.life -= dt;
      wrap(eb, 4);
      if (eb.life <= 0) ebullets.splice(i, 1);
    }

    // ---- ship collisions
    if (ship && ship.grace <= 0) {
      var dead = false;
      for (i = 0; i < rocks.length && !dead; i++) {
        if (Math.hypot(ship.x - rocks[i].x, ship.y - rocks[i].y) < rocks[i].r + ship.r - 3) dead = true;
      }
      if (!dead && saucer && Math.hypot(ship.x - saucer.x, ship.y - saucer.y) < 24 + ship.r - 3) dead = true;
      if (!dead) {
        for (i = 0; i < ebullets.length; i++) {
          if (Math.hypot(ship.x - ebullets[i].x, ship.y - ebullets[i].y) < ship.r) { ebullets.splice(i, 1); dead = true; break; }
        }
      }
      if (dead) killShip();
    }

    // ---- a new best is saved the moment the score passes it, not only when
    // the run ends (savedBest keeps the other frames to a number compare)
    if (state === "play" && score > savedBest) {
      savedBest = score;
      best.submit(score);
    }

    // ---- extra life + next wave
    if (score >= extraAt) {
      lives++;
      extraAt += 10000;
      jingle();
      if (ship) addWord(ship.x, ship.y - 40, "1-UP!");
    }
    if (rocks.length === 0 && state === "play") {
      nextWaveT -= dt;
      if (nextWaveT <= 0) {
        wave++;
        spawnWave();
        nextWaveT = 1.2;
      }
    } else {
      nextWaveT = 1.2;
    }
  }

  // ---- drawing helpers ---------------------------------------------------------
  // each [KEY] in text is drawn as a keycap (GameShell.drawKeys), which is
  // wider than its letters: the box grows to fit. opts.touch is what the box
  // says instead on a touch-only device, where there are no keys to press.
  function capBox(x, y, text, opts) {
    opts = opts || {};
    if (opts.touch != null && window.GameShell && GameShell.touchOnly && GameShell.touchOnly()) text = opts.touch;
    ctx.font = (opts.size || 21) + "px " + FONT;
    var keys = window.GameShell ? (text.match(/\[[^\]]+\]/g) || []).length : 0;
    var plain = text.replace(/[[\]]/g, "");
    var w = ctx.measureText(plain).width + keys * (opts.size || 21) * 0.92 + 20;
    var h = (opts.size || 21) + 13;
    ctx.save();
    ctx.translate(x + (opts.center ? 0 : w / 2), y + h / 2);
    ctx.rotate(opts.rot || 0);
    ctx.fillStyle = INK;
    ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w, h);
    ctx.fillStyle = opts.fill || YELLOW;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.fillStyle = opts.color || INK;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    if (keys) GameShell.drawKeys(ctx, text, 0, 2);
    else ctx.fillText(plain, 0, 2);
    ctx.restore();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    return w;
  }

  function drawShipAt(x, y, a, opts) {
    opts = opts || {};
    var s = opts.scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.scale(s, s);
    ctx.lineJoin = "round";
    // flame first, so the hull outline overlaps it
    if (opts.thrust) {
      var fl = fx() ? 1 + 0.35 * Math.sin(time * 40) : 1;   // steady flame with Visual FX off
      ctx.fillStyle = "#ff8c1a";
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-13, -5);
      ctx.lineTo(-20 - 9 * fl, -2);
      ctx.lineTo(-17 - 4 * fl, 0);
      ctx.lineTo(-20 - 9 * fl, 2);
      ctx.lineTo(-13, 5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = YELLOW;
      ctx.beginPath();
      ctx.moveTo(-13, -2.5);
      ctx.lineTo(-18 - 4 * fl, 0);
      ctx.lineTo(-13, 2.5);
      ctx.closePath();
      ctx.fill();
    }
    // fins
    ctx.fillStyle = RED;
    ctx.strokeStyle = INK; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-4, -7); ctx.lineTo(-16, -13); ctx.lineTo(-12, -3);
    ctx.moveTo(-4, 7); ctx.lineTo(-16, 13); ctx.lineTo(-12, 3);
    ctx.fill(); ctx.stroke();
    // hull: chrome capsule with a red nose cone
    ctx.fillStyle = "#dfe4ea";
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.quadraticCurveTo(8, -9, -6, -8);
    ctx.quadraticCurveTo(-13, -7, -13, 0);
    ctx.quadraticCurveTo(-13, 7, -6, 8);
    ctx.quadraticCurveTo(8, 9, 18, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = RED;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.quadraticCurveTo(12, -6.6, 7, -7.4);
    ctx.quadraticCurveTo(9, -2, 9, 0);
    ctx.quadraticCurveTo(9, 2, 7, 7.4);
    ctx.quadraticCurveTo(12, 6.6, 18, 0);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // porthole
    ctx.fillStyle = "#a5e0f7";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-1, 0, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  function drawRock(rk) {
    ctx.save();
    ctx.translate(rk.x, rk.y);
    ctx.rotate(rk.rot);
    ctx.lineJoin = "round";
    ctx.fillStyle = rk.col[0];
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    var n = rk.pts.length;
    for (var i = 0; i <= n; i++) {
      var a = (i % n) / n * Math.PI * 2;
      var rr = rk.r * rk.pts[i % n];
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // craters
    ctx.fillStyle = rk.col[1];
    ctx.lineWidth = 1.8;
    for (i = 0; i < rk.craters.length; i++) {
      var c = rk.craters[i];
      ctx.beginPath(); ctx.ellipse(c.dx, c.dy, c.r, c.r * 0.72, 0.4, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
    // hatch shading, lower-left
    ctx.strokeStyle = "rgba(26,20,48,0.4)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (i = 0; i < 3; i++) {
      var hx = -rk.r * 0.7 + i * rk.r * 0.2;
      ctx.moveTo(hx, rk.r * 0.55);
      ctx.lineTo(hx + rk.r * 0.3, rk.r * 0.15);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawSaucer(sc) {
    ctx.save();
    ctx.translate(sc.x, sc.y);
    if (sc.small) ctx.scale(0.72, 0.72);
    ctx.lineJoin = "round";
    // motion dashes behind
    ctx.strokeStyle = "rgba(246,240,220,0.6)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-sc.dir * 30, -4); ctx.lineTo(-sc.dir * 44, -4);
    ctx.moveTo(-sc.dir * 32, 4); ctx.lineTo(-sc.dir * 48, 4);
    ctx.stroke();
    ctx.strokeStyle = INK;
    // dome
    ctx.fillStyle = "#a5e0f7";
    ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(0, -7, 10, 8, 0, Math.PI, 0); ctx.fill(); ctx.stroke();
    // hull
    ctx.fillStyle = "#dfe4ea";
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(0, 0, 24, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // lights
    ctx.fillStyle = sc.small ? RED : YELLOW;
    ctx.lineWidth = 1.6;
    for (var i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.arc(i * 12, 3, 2.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoom(bm) {
    var k = bm.t / bm.dur;
    var r = bm.rmax * (0.35 + 0.65 * k);
    ctx.save();
    ctx.translate(bm.x, bm.y);
    ctx.rotate(bm.rot);
    ctx.globalAlpha = 1 - k * k;
    ctx.lineJoin = "round";
    // two-layer comic starburst
    for (var layer = 0; layer < 2; layer++) {
      var rr = layer ? r * 0.62 : r;
      var pts = 10;
      ctx.beginPath();
      for (var i = 0; i <= pts * 2; i++) {
        var a = i / (pts * 2) * Math.PI * 2;
        var rad = i % 2 ? rr * 0.45 : rr;
        if (i === 0) ctx.moveTo(Math.cos(a) * rad, Math.sin(a) * rad);
        else ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
      }
      ctx.closePath();
      ctx.fillStyle = layer ? YELLOW : "#ff6b3d";
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.lineWidth = layer ? 2 : 3;
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function drawWord(wd) {
    var k = wd.t / 0.9;
    var s = k < 0.18 ? 0.5 + k / 0.18 * 0.5 : 1;
    ctx.save();
    ctx.translate(wd.x, wd.y - k * 18);
    ctx.rotate(wd.rot);
    ctx.scale(s, s);
    ctx.globalAlpha = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    ctx.font = "34px " + FONT;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = INK; ctx.lineWidth = 6;
    ctx.strokeText(wd.text, 0, 0);
    ctx.fillStyle = PAPER;
    ctx.fillText(wd.text, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  }

  // ---- render --------------------------------------------------------------
  function render() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // logical units, at the screen's pixel ratio
    ctx.clearRect(0, 0, W, H);
    if (shake > 0 && fx()) {
      ctx.translate(rand(-1, 1) * shake * 14, rand(-1, 1) * shake * 14);
    }
    ctx.drawImage(bg, 0, 0, W, H);

    for (var i = 0; i < rocks.length; i++) drawRock(rocks[i]);
    if (saucer) drawSaucer(saucer);

    // bullets
    for (i = 0; i < bullets.length; i++) {
      var bl = bullets[i];
      ctx.strokeStyle = "rgba(255,207,63,0.55)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bl.x - bl.vx * 0.016, bl.y - bl.vy * 0.016);
      ctx.lineTo(bl.x - bl.vx * 0.03, bl.y - bl.vy * 0.03);
      ctx.stroke();
      ctx.fillStyle = YELLOW;
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(bl.x, bl.y, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
    for (i = 0; i < ebullets.length; i++) {
      var eb = ebullets[i];
      ctx.fillStyle = RED;
      ctx.strokeStyle = INK; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(eb.x, eb.y, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }

    // ship (blinks while under grace)
    if (ship && state === "play") {
      // blinks under grace with Visual FX on; off, it stays steady (the dashed ring marks grace)
      var blink = fx() && ship.grace > 0 && Math.floor(ship.grace * 8) % 2 === 0;
      if (!blink) drawShipAt(ship.x, ship.y, ship.a, { thrust: ship.thrusting });
      if (ship.grace > 0) {
        ctx.strokeStyle = "rgba(246,240,220,0.55)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.arc(ship.x, ship.y, 26, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    for (i = 0; i < booms.length; i++) drawBoom(booms[i]);
    for (i = 0; i < words.length; i++) drawWord(words[i]);

    // ---- HUD
    if (state === "play") {
      capBox(12, 10, "SCORE " + score, {});
      capBox(12, 46, "BEST " + Math.max(best.get(), score), { size: 14, fill: PAPER });
      var wc = capBox(W - 132, 10, "CHAP. " + wave, { fill: PAPER });
      // lives as mini rockets under the score
      for (i = 0; i < lives; i++) drawShipAt(30 + i * 30, 92, -Math.PI / 2, { scale: 0.62 });
      if (waveMsgT > 0) {
        capBox(W / 2, 120, "CHAPTER " + wave + ": METEOR STORM!", { center: true, size: 27, rot: -0.02 });
      }
    } else if (state === "menu") {
      title("METEOR MENACE!", "PRESS [ENTER] TO BLAST OFF!", "TAP TO BLAST OFF!");
      // the rocket drifts with Visual FX on; off, it holds one pose, flame lit
      var mt = fx() ? time : 0;
      drawShipAt(W / 2 + Math.cos(mt * 0.7) * 30, H * 0.68 + Math.sin(mt * 1.1) * 10, -0.5 + Math.sin(mt * 0.5) * 0.2, { thrust: true, scale: 1.6 });
    } else if (state === "over") {
      title("THE END...?", "PRESS [ENTER] FOR THE NEXT ISSUE", "TAP FOR THE NEXT ISSUE");
      capBox(W / 2, H * 0.62, "SCORE " + score + "  ·  BEST " + best.get(), { center: true, size: 24 });
    }
  }

  // `subTouch`: the line under the title on a touch-only device (a tap on the
  // panel is what starts there)
  function title(big, sub, subTouch) {
    ctx.save();
    // burst behind the title
    ctx.translate(W / 2, H * 0.36);
    ctx.rotate(-0.03);
    ctx.beginPath();
    var pts = 14, R = 200, r2 = 132;
    for (var i = 0; i <= pts * 2; i++) {
      var a = i / (pts * 2) * Math.PI * 2;
      var rad = (i % 2 ? r2 : R) * (1 + 0.02 * Math.sin(i * 3.7));
      if (i === 0) ctx.moveTo(Math.cos(a) * rad * 1.35, Math.sin(a) * rad * 0.55);
      else ctx.lineTo(Math.cos(a) * rad * 1.35, Math.sin(a) * rad * 0.55);
    }
    ctx.closePath();
    ctx.fillStyle = YELLOW;
    ctx.fill();
    ctx.strokeStyle = INK; ctx.lineWidth = 4; ctx.lineJoin = "round";
    ctx.stroke();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "84px " + FONT;
    ctx.strokeStyle = INK; ctx.lineWidth = 10;
    ctx.strokeText(big, 0, -12);
    ctx.fillStyle = RED;
    ctx.fillText(big, 0, -12);
    ctx.restore();
    ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    var pulse = !fx() || Math.floor(time * 1.6) % 2 === 0;   // steady with Visual FX off
    capBox(W / 2, H * 0.36 + 64, sub, { center: true, size: 22, fill: pulse ? PAPER : YELLOW, rot: 0.015, touch: subTouch });
  }

  // ---- pause + loop -----------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    onChange: function (p) { if (p) { thrustSnd(false); releaseAll(); } }
  }) : { isPaused: function () { return false; } };

  var last = performance.now();
  function loop(now) {
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (!P.isPaused()) update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // test hook
  window.__game = {
    get state() { return state; },
    get score() { return score; },
    get lives() { return lives; },
    get wave() { return wave; },
    get rocks() { return rocks; },
    get ship() { return ship; },
    get saucer() { return saucer; },
    set saucer(v) { saucer = v; },
    forceSaucer: function (small) {
      saucer = { x: -30, y: 160, dir: 1, small: !!small, shotT: 1.1, bobT: 0 };
    },
    addScore: function (n) { score += n; },
    start: start
  };
})();
