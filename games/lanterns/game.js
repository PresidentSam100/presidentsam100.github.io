/* =====================================================================
   Lanterns — pinyin typing at the festival.

   Paper lanterns rise with hanzi on them. Every letter narrows the field
   to the lanterns whose pinyin starts that way; a full match lights the
   most urgent one and it soars, and a wrong letter thuds and breaks your
   streak without being consumed. A full match that's also the start of a
   longer word up there (ni, with nian rising) waits a moment for the next
   letter; Space lights it at once. Backspace steps back. Type v for ü —
   u is accepted too. Three lanterns lost to the dark end the night.

   Modes: festival (toneless pinyin) and tone (type the tone numbers,
   5 for neutral, 0 accepted too). Each keeps its own best score.
   ===================================================================== */
(function () {
  "use strict";

  var W0RDS = window.LanternWords;
  function $(id) { return document.getElementById(id); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }

  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  var bests = {
    festival: window.GameShell ? GameShell.best("lanterns_best_festival", { higher: true }) : null,
    tone: window.GameShell ? GameShell.best("lanterns_best_tone", { higher: true }) : null
  };

  // ---- pinyin helpers -----------------------------------------------------
  function keyOf(pinyin, toneMode) {
    var s = pinyin.replace(/\s/g, "");
    return toneMode ? s : s.replace(/[0-9]/g, "");
  }
  var MARKS = {
    a: "āáǎà", e: "ēéěè", i: "īíǐì", o: "ōóǒò", u: "ūúǔù", v: "ǖǘǚǜ"
  };
  function marked(pinyin) {                    // "ni3 hao3" -> "nǐ hǎo"
    return pinyin.split(" ").map(function (syl) {
      var m = syl.match(/^([a-zv]+)([1-5])$/);
      if (!m) return syl;
      var body = m[1], tone = +m[2];
      var out = body.replace(/v/g, "ü");
      if (tone === 5) return out;
      var pick = -1;
      if (body.indexOf("a") !== -1) pick = body.indexOf("a");
      else if (body.indexOf("e") !== -1) pick = body.indexOf("e");
      else if (body.indexOf("ou") !== -1) pick = body.indexOf("o");
      else { for (var i = body.length - 1; i >= 0; i--) if ("iouv".indexOf(body[i]) !== -1) { pick = i; break; } }
      if (pick === -1) return out;
      var ch = body[pick] === "v" ? "v" : body[pick];
      var rep = MARKS[ch][tone - 1];
      return out.slice(0, pick) + rep + out.slice(pick + 1);
    }).join(" ");
  }

  // ---- sound ----------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function pluck(f, vol, delay) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = "triangle"; o.frequency.value = f;
    g.gain.setValueAtTime(vol || 0.1, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + 0.55);
  }
  function tick() { pluck(1180, 0.045); }
  function thud() {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = "sine"; o.frequency.setValueAtTime(150, t0);
    o.frequency.exponentialRampToValueAtTime(80, t0 + 0.09);
    g.gain.setValueAtTime(0.14, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
    o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + 0.14);
  }
  function clearChime() { [660, 784, 990].forEach(function (f, i) { pluck(f, 0.09, i * 0.06); }); }
  function gong(big) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime;
    [1, 1.5, 2.76].forEach(function (h, i) {
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = (big ? 98 : 147) * h;
      g.gain.setValueAtTime((big ? 0.16 : 0.11) / (i + 1), t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (big ? 2.2 : 1.2));
      o.connect(g); g.connect(ac.destination);
      o.start(t0); o.stop(t0 + 2.4);
    });
  }

  // ---- state --------------------------------------------------------------------
  var state = "menu";                  // menu | play | over
  var endedAt = 0;                     // when the last night ended (see the keys)
  var mode = store.get("lanterns_mode", "festival");
  if (mode !== "festival" && mode !== "tone") mode = "festival";
  var script = store.get("lanterns_script", "simp");   // simp | trad
  if (script !== "simp" && script !== "trad") script = "simp";
  var lanterns = [], buffer = "";
  var waiting = null, waitT = 0;       // a full match held while a longer word still fits (handleChar)
  var WAIT = 0.5;                      // how long it waits for the next letter, in seconds of play
  var score = 0, cleared = 0, escaped = 0, streak = 0, bestStreak = 0;
  var runBest = NaN;                   // the mode's best as the night began (NaN: none yet)
  var spawnT = 0, elapsed = 0;
  var riseMul = 1, spawnOff = false;         // test hooks
  var floats = [], sparks = [], bgDrifters = [];

  // every rising lantern whose pinyin still starts with the buffer
  function candidates() {
    if (!buffer) return [];
    return lanterns.filter(function (l) {
      return l.state === "up" && l.keys.some(function (k) { return k.indexOf(buffer) === 0; });
    });
  }

  // a rising lantern whose pinyin goes on past the buffer (年 while "ni" is typed)
  function longerFits() {
    return candidates().some(function (l) {
      return l.keys.some(function (k) { return k.length > buffer.length && k.indexOf(buffer) === 0; });
    });
  }

  function makeLantern(wi, xFrac) {
    var w = W0RDS[wi];
    var toneMode = mode === "tone";
    var k = keyOf(w[1], toneMode);
    var keys = [k];
    if (k.indexOf("v") !== -1) keys.push(k.replace(/v/g, "u"));
    var size = 48 + w[0].length * 7;
    var bwEst = size * (0.92 + (w[0].length - 1) * 0.5);
    var xr = (xFrac != null ? xFrac : 0.12 + Math.random() * 0.76) * W;
    xr = Math.max(bwEst / 2 + 8, Math.min(W - bwEst / 2 - 8, xr));
    return {
      wi: wi, hanzi: (script === "trad" && w[4]) ? w[4] : w[0],
      gloss: w[2], pin: w[1], keys: keys,
      x: xr,
      y: H + size,
      vy: (H * 0.036 + Math.min(H * 0.065, cleared * 1.6)) * riseMul,
      sway: Math.random() * 6.28,
      size: size,
      state: "up", litT: 0
    };
  }
  function tierCap() { return cleared < 8 ? 1 : cleared < 20 ? 2 : 3; }
  function spawn(forceHanzi) {
    var pool = [];
    var activeW = {};
    lanterns.forEach(function (l) { activeW[l.wi] = true; });
    W0RDS.forEach(function (w, i) {
      if (forceHanzi ? (w[0] === forceHanzi || w[4] === forceHanzi)
                     : (w[3] <= tierCap() && !activeW[i])) pool.push(i);
    });
    if (!pool.length) return null;
    var wi = pool[Math.floor(Math.random() * pool.length)];
    var l = makeLantern(wi);
    lanterns.push(l);
    return l;
  }

  // ---- typing ----------------------------------------------------------------------
  function handleChar(ch) {
    // paused, a letter still lands in the hidden #kbd box (it keeps focus,
    // and the keydown handler leaves it alone), so it's refused here
    if (state !== "play" || P.isPaused()) return;
    ch = ch.toLowerCase();
    // the neutral tone is 5 (的 = de5); 0 means the same, as some pinyin
    // keyboards and textbooks write it
    if (mode === "tone" && ch === "0") ch = "5";
    var legal = mode === "tone" ? /^[a-z1-5]$/ : /^[a-z]$/;
    if (!legal.test(ch)) return;
    // every letter narrows the field: feichang and fanguan both glow on
    // 'f', and the second letter decides between them
    var nb = buffer + ch;
    var matches = lanterns.filter(function (l) {
      return l.state === "up" && l.keys.some(function (k) { return k.indexOf(nb) === 0; });
    });
    if (!matches.length) {
      // a word left waiting (below) is what was meant: it lights, and this
      // letter starts the next word
      if (waiting) { light(waiting); handleChar(ch); return; }
      miss(); return;                            // not consumed
    }
    buffer = nb;
    tick();
    waiting = null;
    var full = matches.filter(function (l) { return l.keys.some(function (k) { return k === nb; }); });
    if (full.length) {
      var pick = full[0];
      full.forEach(function (l) { if (l.y < pick.y) pick = l; });
      // "ni" is all of 你 but only the start of 年 (nian): while a longer word
      // up there still fits, the short one waits a moment for the next
      // letter rather than lighting and leaving 年 untypeable. A letter that
      // goes on to the longer word takes it; anything else, Space, or a
      // moment's pause lights the short one.
      if (longerFits()) { waiting = pick; waitT = 0; }
      else light(pick);
    }
    echo();
  }
  // Space or Enter: light the word that's waiting, now
  function lightWaiting() {
    if (state === "play" && !P.isPaused() && waiting) light(waiting);
  }
  function miss() {
    thud();
    streak = 0;
    hud();
    var e = $("echo");
    e.style.borderColor = "rgba(198,48,28,0.95)";
    setTimeout(function () { e.style.borderColor = ""; }, 220);
  }
  function light(l) {
    l.state = "lit"; l.litT = 0;
    streak++; cleared++;
    if (streak > bestStreak) bestStreak = streak;
    var gain = Math.round(10 * l.keys[0].length * (1 + Math.min(10, streak - 1) * 0.1));
    score += gain;
    // a new best is saved the moment it's earned, not only when the sky goes dark
    if (bests[mode]) bests[mode].submit(score);
    clearChime();
    var fy = l.y - l.size * 0.8;
    floats.forEach(function (f) {                 // don't stack two glosses
      var fyNow = f.y - f.t * 34;
      if (Math.abs(f.x - l.x) < 150 && Math.abs(fyNow - fy) < 30) fy = fyNow - 30;
    });
    floats.push({ x: l.x, y: fy, t: 0, text: marked(l.pin) + "  ·  " + l.gloss });
    if (fx()) {
      for (var i = 0; i < 14; i++) {
        sparks.push({ x: l.x, y: l.y, vx: (Math.random() - 0.5) * 120,
          vy: -30 - Math.random() * 90, t: 0.8 + Math.random() * 0.5 });
      }
    }
    buffer = "";
    waiting = null;
    hud(); echo();
  }
  function unlockBack() {
    if (buffer.length > 0) buffer = buffer.slice(0, -1);
    waiting = null;
    echo();
  }
  function echo() {
    var e = $("echo");
    e.textContent = buffer;
  }

  // ---- run --------------------------------------------------------------------------
  function startRun(m) {
    if (m) mode = m;
    store.set("lanterns_mode", mode);
    audio(); gong(false);
    lanterns = []; buffer = ""; waiting = null;
    score = 0; cleared = 0; escaped = 0; streak = 0; bestStreak = 0;
    runBest = bests[mode] ? GameShell.store.getNum(bests[mode].key, NaN) : NaN;
    spawnT = 0.35; elapsed = 0; floats = []; sparks = [];
    riseMul = 1; spawnOff = false;
    $("menu").hidden = true; $("over").hidden = true;
    $("hud").hidden = false; $("echo").hidden = false;
    state = "play";
    hud(); echo();
    setTimeout(function () { $("kbd").focus({ preventScroll: true }); }, 0);
  }
  function hud() {
    $("hud-score").textContent = score.toLocaleString();
    $("hud-combo").textContent = streak > 1 ? "×" + (1 + Math.min(10, streak - 1) * 0.1).toFixed(1) : "";
    $("hud-wishes").textContent = "🏮".repeat(Math.max(0, 3 - escaped)) + "✖".repeat(escaped);
  }
  function gameOver() {
    state = "over";
    endedAt = performance.now();
    // let go of the typing box, so Backspace here means "back to the modes"
    // (startRun focuses it again)
    $("kbd").blur();
    gong(true);
    var b = bests[mode];
    if (b) b.submit(score);
    // a record against the best as the night began (the stored one kept pace with light())
    // (a first night counts only if it lit something)
    var isBest = b ? score > 0 && (!isFinite(runBest) || score > runBest) : false;
    $("over-title").textContent = cleared >= 40 ? "A sky full of light" : "The sky went dark";
    $("over-msg").innerHTML = score.toLocaleString() + "<small> · " + cleared + " lanterns lit</small>";
    $("over-stats").textContent =
      (mode === "tone" ? "tone master" : "festival") + " · best streak counted ×" + (1 + Math.min(10, Math.max(0, bestStreak - 1)) * 0.1).toFixed(1) + "\n" +
      (isBest ? "a new record night! 🏮" : "best: " + (b ? b.get().toLocaleString() : score));
    $("hud").hidden = true; $("echo").hidden = true;
    $("over").hidden = false;
  }

  // ---- update -------------------------------------------------------------------------
  function update(dt) {
    if (state !== "play") return;
    elapsed += dt;
    if (!spawnOff) {
      spawnT -= dt;
      var interval = Math.max(0.85, 1.9 - cleared * 0.05);
      var cap = Math.min(7, 3 + Math.floor(cleared / 8));
      if (spawnT <= 0 && lanterns.filter(function (l) { return l.state === "up"; }).length < cap) {
        spawn();
        spawnT = interval;
      }
    }
    lanterns.forEach(function (l) {
      if (l.state === "up") {
        l.y -= l.vy * dt;
        if (fx()) l.x += Math.sin(elapsed * 1.3 + l.sway) * 8 * dt;
        if (l.y < -l.size) {
          l.state = "gone";
          if (buffer && candidates().length === 0) { buffer = ""; echo(); }
          escaped++;
          gong(false);
          hud();
          if (escaped >= 3) gameOver();
        }
      } else if (l.state === "lit") {
        l.litT += dt;
        l.y -= (l.vy + 220 * l.litT) * dt;
        if (l.y < -l.size * 2) l.state = "gone";
      }
    });
    lanterns = lanterns.filter(function (l) { return l.state !== "gone"; });
    // a waiting word lights when its moment is up, or as soon as no longer
    // word it could be is still up there; one that slipped away is let go
    if (waiting && state === "play") {
      waitT += dt;
      if (waiting.state !== "up") waiting = null;
      else if (waitT >= WAIT || !longerFits()) light(waiting);
    }
    floats.forEach(function (f) { f.t += dt; });
    floats = floats.filter(function (f) { return f.t < 1.6; });
    sparks.forEach(function (s) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt; s.t -= dt; });
    sparks = sparks.filter(function (s) { return s.t > 0; });
  }

  // ---- painting -----------------------------------------------------------------------
  // An ink-wash scroll. The painting itself (rice paper, an evening wash with
  // the moon left bare, ranges of peaks standing out of mist, pines, a pagoda
  // and the town's roofs) is brushed once per window size into `scroll` and
  // copied each frame; only the mist, the birds, the seal, the falling dusk
  // and the lanterns are drawn afresh.
  var cv = $("stage"), g = cv.getContext("2d");
  var W = 0, H = 0;
  var scroll = document.createElement("canvas");
  var mistT = 0;                       // how far the mist has drifted, in seconds of Visual FX
  var dusk = 0;                        // how far the evening has closed in (draw)
  var PAPER = "241,232,212", INK = "29,24,20", SEAL = "198,48,28";

  // a seeded generator, so a resize brushes the same painting again
  function seeded(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // One range of peaks: steep-sided and close-set, no two the same height,
  // dark at the summits and washed out to bare paper at the foot, where the
  // mist lies. Sizes go by the window's height, so a phone held upright gets
  // fewer peaks, not thinner ones. `pines` stands a few trees on the shoulders.
  function range(s, seed, foot, tall, alpha, tint, pines) {
    var r = seeded(seed), peaks = [], x = -0.1 * H, k;
    while (x < W + 0.12 * H) {
      peaks.push({ x: x, w: (0.07 + r() * 0.09) * H, h: (0.35 + r() * 0.65) * tall, p: 1.5 + r() * 1.3 });
      x += (0.1 + r() * 0.16) * H;
    }
    function top(px) {
      var best = 0;
      for (var i = 0; i < peaks.length; i++) {
        var d = Math.abs(px - peaks[i].x) / peaks[i].w;
        if (d < 1) best = Math.max(best, peaks[i].h * Math.pow(1 - Math.pow(d, peaks[i].p), 0.9));
      }
      // a little unevenness in the rock, the same at any window width
      return foot - best - (best > 2 ? Math.sin(px * 0.31 + seed) * Math.sin(px * 0.073 + 1.7) * tall * 0.014 : 0);
    }
    var wash = s.createLinearGradient(0, foot - tall, 0, foot);
    wash.addColorStop(0, "rgba(" + tint + "," + alpha + ")");
    wash.addColorStop(0.55, "rgba(" + tint + "," + (alpha * 0.6).toFixed(3) + ")");
    wash.addColorStop(1, "rgba(" + tint + ",0)");
    s.fillStyle = wash;
    s.beginPath(); s.moveTo(-10, foot);
    for (var px = -10; px <= W + 10; px += 3) s.lineTo(px, top(px));
    s.lineTo(W + 10, foot); s.closePath(); s.fill();
    // a darker line along each summit, and a few dry strokes down its face
    s.strokeStyle = "rgba(" + tint + "," + (alpha * 0.7).toFixed(3) + ")";
    s.lineWidth = 1.2; s.lineCap = "round"; s.lineJoin = "round";
    s.beginPath();
    var pen = false;
    for (px = -10; px <= W + 10; px += 3) {
      var ty = top(px);
      if (ty < foot - tall * 0.3) { if (pen) s.lineTo(px, ty); else s.moveTo(px, ty); pen = true; } else pen = false;
    }
    s.stroke();
    s.strokeStyle = "rgba(" + tint + "," + (alpha * 0.45).toFixed(3) + ")";
    for (k = 0; k < peaks.length; k++) {
      var pk = peaks[k], rs = seeded(seed * 1000 + k);
      if (pk.h < tall * 0.5) continue;
      for (var j = 0; j < 4; j++) {
        var sx = pk.x + (rs() - 0.5) * pk.w * 0.9, sy = top(sx) + 4 + rs() * pk.h * 0.12, len = pk.h * (0.14 + rs() * 0.24);
        s.lineWidth = 0.9 + rs() * 0.9;
        s.beginPath(); s.moveTo(sx, sy);
        s.quadraticCurveTo(sx + (rs() - 0.5) * 8, sy + len * 0.5, sx + (rs() - 0.5) * 10, sy + len);
        s.stroke();
      }
    }
    if (pines) {
      for (k = 0; k < peaks.length; k++) {
        if (k % 3 !== 1) continue;
        var side = k % 2 ? 1 : -1, tx = peaks[k].x + side * peaks[k].w * 0.42;
        pine(s, tx, top(tx) + 3, H * 0.062, side);
        pine(s, tx + side * H * 0.03, top(tx + side * H * 0.03) + 3, H * 0.044, side);
      }
    }
  }
  // a pine: a leaning trunk and three flat pads of needles
  function pine(s, x, y, size, lean) {
    s.strokeStyle = "rgba(" + INK + ",0.85)"; s.lineCap = "round";
    s.lineWidth = Math.max(1.2, size * 0.075);
    s.beginPath(); s.moveTo(x, y);
    s.quadraticCurveTo(x + lean * size * 0.26, y - size * 0.5, x + lean * size * 0.16, y - size);
    s.stroke();
    s.fillStyle = "rgba(" + INK + ",0.74)";
    for (var i = 0; i < 3; i++) {
      var py = y - size * (0.5 + i * 0.22), pw = size * (0.46 - i * 0.1);
      s.beginPath();
      s.ellipse(x + lean * size * (0.22 - i * 0.03) + (i % 2 ? -1 : 1) * size * 0.1, py, pw, size * 0.075, lean * -0.14, 0, 6.3);
      s.fill();
    }
  }
  // a band of mist: bare paper laid back over the foot of a range
  function mistBand(s, y, depth, a) {
    var m = s.createLinearGradient(0, y - depth, 0, y + depth);
    m.addColorStop(0, "rgba(" + PAPER + ",0)");
    m.addColorStop(0.5, "rgba(" + PAPER + "," + a + ")");
    m.addColorStop(1, "rgba(" + PAPER + ",0)");
    s.fillStyle = m; s.fillRect(0, y - depth, W, depth * 2);
  }
  // a roof in silhouette over a building x0..x1: the slope sags from the ridge
  // (at r) down to the eaves (at e), which flick up at the corners
  function roof(s, x0, x1, e, r, over) {
    var in0 = x0 + (x1 - x0) * 0.24, in1 = x1 - (x1 - x0) * 0.24;
    s.beginPath();
    s.moveTo(x0 - over, e - over * 0.7);
    s.quadraticCurveTo(x0 + over * 0.6, e - 1, in0, r);
    s.lineTo(in1, r);
    s.quadraticCurveTo(x1 - over * 0.6, e - 1, x1 + over, e - over * 0.7);
    s.quadraticCurveTo((x0 + x1) / 2, e + over * 0.55, x0 - over, e - over * 0.7);
    s.closePath(); s.fill();
  }
  // where the moon is left bare (the wash round it is what shows it)
  function moonAt() { return { x: W * 0.2, y: H * 0.17, r: Math.max(20, Math.min(44, Math.min(W, H) * 0.055)) }; }

  function paintScroll() {
    scroll.width = cv.width; scroll.height = cv.height;
    if (!W || !H) return;
    var s = scroll.getContext("2d");
    s.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
    // rice paper
    var paper = s.createLinearGradient(0, 0, 0, H);
    paper.addColorStop(0, "#ebe1cb"); paper.addColorStop(0.5, "#f2e9d6"); paper.addColorStop(1, "#ebe0c8");
    s.fillStyle = paper; s.fillRect(0, 0, W, H);
    // the evening: a pale ink wash from the top, deeper round the moon
    var sky = s.createLinearGradient(0, 0, 0, H * 0.56);
    sky.addColorStop(0, "rgba(88,102,112,0.36)"); sky.addColorStop(1, "rgba(88,102,112,0)");
    s.fillStyle = sky; s.fillRect(0, 0, W, H * 0.56);
    var m = moonAt();
    var halo = s.createRadialGradient(m.x, m.y, m.r, m.x, m.y, m.r * 2.8);
    halo.addColorStop(0, "rgba(80,94,104,0.26)"); halo.addColorStop(1, "rgba(80,94,104,0)");
    s.fillStyle = halo; s.fillRect(m.x - m.r * 3, m.y - m.r * 3, m.r * 6, m.r * 6);
    s.fillStyle = "#f8f2e3";
    s.beginPath(); s.arc(m.x, m.y, m.r, 0, 7); s.fill();
    s.strokeStyle = "rgba(" + INK + ",0.14)"; s.lineWidth = 1;
    s.beginPath(); s.arc(m.x, m.y, m.r, 0, 7); s.stroke();
    // three ranges, each nearer one darker, with mist lying between them
    range(s, 11, H * 0.67, H * 0.36, 0.3, "84,98,108");
    mistBand(s, H * 0.65, H * 0.075, 0.8);
    range(s, 23, H * 0.81, H * 0.37, 0.5, "56,64,70");
    mistBand(s, H * 0.8, H * 0.065, 0.75);
    range(s, 37, H * 0.97, H * 0.25, 0.8, "34,34,34", true);
    // lamplight from the streets, low over the roofs
    var base = H - 46;
    var lamp = s.createLinearGradient(0, base - 90, 0, H);
    lamp.addColorStop(0, "rgba(220,96,40,0)"); lamp.addColorStop(1, "rgba(220,96,40,0.26)");
    s.fillStyle = lamp; s.fillRect(0, base - 90, W, 136);
    // the town along the foot of the painting, a lantern hung at every eave
    var ink = "rgba(" + INK + ",0.93)";
    s.fillStyle = ink;
    s.fillRect(0, base, W, 46);
    var rt = seeded(53), hung = [], tx = -30;
    while (tx < W + 30) {
      var tw = 62 + rt() * 56, te = base - 6 - rt() * 16;
      roof(s, tx, tx + tw, te, te - 13 - rt() * 7, 11);
      s.fillRect(tx + 5, te - 1, tw - 10, base - te + 2);
      hung.push(tx - 9, te - 1, tx + tw + 9, te - 1);
      tx += tw + 20 + rt() * 26;
    }
    // the pagoda at the side: three storeys, each under its own roof
    var px = W * 0.08;
    for (var lv = 0; lv < 3; lv++) {
      var half = 32 - lv * 8, yb = base - lv * 30;
      s.fillRect(px - half, yb - 21, half * 2, 22);
      roof(s, px - half, px + half, yb - 20, yb - 30, 12 - lv * 2);
    }
    s.fillRect(px - 1.5, base - 106, 3, 18);                    // its finial
    s.beginPath(); s.arc(px, base - 107, 3, 0, 7); s.fill();
    s.fillStyle = "rgba(" + SEAL + ",0.95)";
    for (var hi = 0; hi < hung.length; hi += 2) { s.beginPath(); s.arc(hung[hi], hung[hi + 1], 2.6, 0, 7); s.fill(); }
    // the paper's grain: flecks and fibres, then the edges gone a little brown
    var rg = seeded(5);
    for (var i = Math.round(W * H / 620); i > 0; i--) {
      s.fillStyle = "rgba(112,92,60," + (0.03 + rg() * 0.05).toFixed(3) + ")";
      s.fillRect(rg() * W, rg() * H, 1, 1);
    }
    s.strokeStyle = "rgba(140,118,84,0.07)"; s.lineWidth = 0.8;
    for (i = Math.round(W * H / 8000); i > 0; i--) {
      var fx0 = rg() * W, fy0 = rg() * H, fa = rg() * 6.28, fl = 6 + rg() * 14;
      s.beginPath(); s.moveTo(fx0, fy0); s.lineTo(fx0 + Math.cos(fa) * fl, fy0 + Math.sin(fa) * fl); s.stroke();
    }
    var edge = s.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    edge.addColorStop(0, "rgba(128,100,60,0)"); edge.addColorStop(1, "rgba(128,100,60,0.22)");
    s.fillStyle = edge; s.fillRect(0, 0, W, H);
  }

  function resize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintScroll();
    bgDrifters = [];
    for (var d = 0; d < 7; d++) bgDrifters.push({ x: Math.random() * W, y: Math.random() * H, v: 6 + Math.random() * 8, s: 5 + Math.random() * 7 });
    // a narrower window (a phone turned upright) brings the lanterns in with
    // it, or one left off the edge would slip away unseen and cost a wish
    lanterns.forEach(function (l) {
      var half = l.size * (0.92 + (l.hanzi.length - 1) * 0.5) / 2 + 8;
      l.x = Math.max(half, Math.min(W - half, l.x));
    });
    // the loop doesn't paint while paused, and resizing just cleared the canvas
    if (P.isPaused()) draw(performance.now(), 0);
  }
  window.addEventListener("resize", resize);

  function drawLantern(l, t) {
    var s = l.size, x = l.x, y = l.y;
    var chn = l.hanzi.length;
    // longer words ride wider lanterns so the hanzi never crowd
    var bw = s * (0.92 + (chn - 1) * 0.5), bh = s * 1.12;
    var isCand = buffer && l.state === "up" &&
      l.keys.some(function (k) { return k.indexOf(buffer) === 0; });
    var lit = l.state === "lit";
    // its light on the paper: a warm bloom, wider once it's lit
    var R = Math.max(bw, bh) * 0.6;
    var glow = g.createRadialGradient(x, y, R * 0.15, x, y, R * (lit ? 2.3 : 1.6));
    glow.addColorStop(0, "rgba(238,124,44," + (lit ? 0.5 : isCand ? 0.34 : 0.2) + ")");
    glow.addColorStop(1, "rgba(238,124,44,0)");
    g.fillStyle = glow;
    g.fillRect(x - R * 2.5, y - R * 2.5, R * 5, R * 5);
    // the tassel under it
    var tl = Math.min(18, s * 0.3);
    g.strokeStyle = "rgba(" + SEAL + ",0.95)"; g.lineWidth = 1.2; g.lineCap = "round";
    g.beginPath();
    for (var k = -2; k <= 2; k++) { g.moveTo(x, y + bh / 2 + 7); g.lineTo(x + k * 2.2, y + bh / 2 + 7 + tl); }
    g.stroke();
    g.fillStyle = "#a3271a";
    g.beginPath(); g.arc(x, y + bh / 2 + 7, 2.6, 0, 7); g.fill();
    // paper body: vermilion at the sides, brightest at the heart, and brighter
    // still for a word the typing fits, or one that's lit
    var body = g.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
    var side = lit ? "#ea6a2e" : "#d24a2a", heart = lit ? "#fff0b4" : isCand ? "#ffd27e" : "#f7ae5e";
    body.addColorStop(0, side); body.addColorStop(0.5, heart); body.addColorStop(1, side);
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(x - bw * 0.34, y - bh / 2);
    g.quadraticCurveTo(x - bw * 0.62, y, x - bw * 0.3, y + bh / 2);
    g.lineTo(x + bw * 0.3, y + bh / 2);
    g.quadraticCurveTo(x + bw * 0.62, y, x + bw * 0.34, y - bh / 2);
    g.closePath();
    g.fill();
    // ribs
    g.strokeStyle = "rgba(150,48,22,0.4)";
    g.lineWidth = 1;
    for (var r = -1; r <= 1; r++) {
      g.beginPath();
      g.moveTo(x - bw * (0.44 + r * 0.05), y + r * bh * 0.22);
      g.quadraticCurveTo(x, y + r * bh * 0.22 + 4, x + bw * (0.44 + r * 0.05), y + r * bh * 0.22);
      g.stroke();
    }
    // caps: dark wood with a gilt line
    g.fillStyle = "#33190f";
    g.fillRect(x - bw * 0.3, y - bh / 2 - 5, bw * 0.6, 6);
    g.fillRect(x - bw * 0.26, y + bh / 2 - 1, bw * 0.52, 6);
    g.fillStyle = "#c9a45a";
    g.fillRect(x - bw * 0.3, y - bh / 2 - 0.5, bw * 0.6, 1.2);
    g.fillRect(x - bw * 0.26, y + bh / 2 - 1, bw * 0.52, 1.2);
    // hanzi, in ink
    g.fillStyle = "#1f130c";
    g.font = "600 " + Math.round(s * (chn >= 4 ? 0.4 : chn === 3 ? 0.44 : 0.5)) + "px 'Ma Shan Zheng', 'KaiTi', 'SimSun', serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(l.hanzi, x, y + 1);
    // A word the typing still fits is ringed with one turn of the red brush,
    // and under it only what has been typed so far - never the rest of the answer
    if (isCand) {
      g.strokeStyle = "rgba(" + SEAL + ",0.92)"; g.lineCap = "round";
      g.lineWidth = 3.2;
      g.beginPath(); g.ellipse(x, y + 1, bw * 0.5 + 11, bh * 0.5 + 13, 0, -1.25, 4.5); g.stroke();
      g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(x, y + 1, bw * 0.5 + 11, bh * 0.5 + 13, 0, 4.5, 4.82); g.stroke();
      g.font = "700 16px 'Gentium Book Plus', Georgia, serif";
      g.textAlign = "center"; g.lineJoin = "round";
      g.strokeStyle = "rgba(" + PAPER + ",0.95)"; g.lineWidth = 4;
      g.strokeText(buffer, x, y + bh / 2 + tl + 24);
      g.fillStyle = "rgb(" + INK + ")";
      g.fillText(buffer, x, y + bh / 2 + tl + 24);
    }
  }

  function draw(t, dt) {
    if (scroll.width && scroll.height) g.drawImage(scroll, 0, 0, W, H);
    // mist over the valleys: it drifts with Visual FX on, and lies still with it off
    if (fx()) mistT += dt || 0;
    [[0.16, 0.6, 0.34, 5], [0.66, 0.72, 0.42, 8], [0.38, 0.84, 0.3, 6]].forEach(function (b) {
      var half = b[2] * W, ry = H * 0.045;
      var mx = ((b[0] * W + mistT * b[3] + half) % (W + half * 2)) - half;
      g.save();
      g.translate(mx, b[1] * H); g.scale(half / ry, 1);
      var mg = g.createRadialGradient(0, 0, 0, 0, 0, ry);
      mg.addColorStop(0, "rgba(" + PAPER + ",0.8)"); mg.addColorStop(1, "rgba(" + PAPER + ",0)");
      g.fillStyle = mg; g.fillRect(-ry, -ry, ry * 2, ry * 2);
      g.restore();
    });
    // three birds going home, on the same slow wind
    g.strokeStyle = "rgba(" + INK + ",0.62)"; g.lineWidth = 1.3; g.lineCap = "round";
    var bx = ((W * 0.56 + mistT * 7 + 40) % (W + 80)) - 40, by = H * 0.19;
    [[0, 0, 9], [20, -9, 7], [34, 5, 6]].forEach(function (b) {
      g.beginPath();
      g.moveTo(bx + b[0] - b[2], by + b[1] - b[2] * 0.3);
      g.quadraticCurveTo(bx + b[0] - b[2] * 0.4, by + b[1] - b[2] * 0.5, bx + b[0], by + b[1]);
      g.quadraticCurveTo(bx + b[0] + b[2] * 0.4, by + b[1] - b[2] * 0.5, bx + b[0] + b[2], by + b[1] - b[2] * 0.3);
      g.stroke();
    });
    // faraway lanterns already released: they drift up with Visual FX on,
    // and hang still with it off
    bgDrifters.forEach(function (d) {
      if (fx()) {
        d.y -= d.v * (dt || 0);
        if (d.y < -20) { d.y = H + 20; d.x = Math.random() * W; }
      }
      // each a small lantern: an upright oval under a dark cap
      var rw = d.s * 0.4, rh = d.s * 0.55;
      g.fillStyle = "rgba(212,78,38,0.62)";
      g.beginPath(); g.ellipse(d.x, d.y, rw, rh, 0, 0, 7); g.fill();
      g.fillStyle = "rgba(" + INK + ",0.5)";
      g.fillRect(d.x - rw * 0.6, d.y - rh - 1.2, rw * 1.2, 1.6);
    });
    // the painter's seal, cut with the game's own character in the script picked
    var sz = W < 520 ? 30 : 38, sx = W - sz - (W < 520 ? 14 : 28), sy = Math.max(78, H * 0.17);
    g.fillStyle = "rgba(" + SEAL + ",0.92)";
    g.fillRect(sx, sy, sz, sz);
    g.strokeStyle = "rgba(" + PAPER + ",0.85)"; g.lineWidth = 1;
    g.strokeRect(sx + 3.5, sy + 3.5, sz - 7, sz - 7);
    g.fillStyle = "rgb(" + PAPER + ")";
    g.font = Math.round(sz * 0.64) + "px 'Ma Shan Zheng', 'KaiTi', 'SimSun', serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(script === "trad" ? "燈" : "灯", sx + sz / 2, sy + sz / 2 + 1);
    // Dusk closes in with each lantern lost to it, and falls when the third
    // goes (unless the night lit forty: then the sky stays full of light). It
    // deepens over a moment with Visual FX on, and at once with it off.
    var want = state === "play" ? escaped * 0.07 : state === "over" && cleared < 40 ? 0.36 : 0;
    dusk = fx() ? dusk + (want - dusk) * Math.min(1, (dt || 0) * 2.5) : want;
    if (dusk > 0.004) {
      g.fillStyle = "rgba(38,42,52," + dusk.toFixed(3) + ")";
      g.fillRect(0, 0, W, H);
    }

    lanterns.forEach(function (l) { drawLantern(l, t); });

    // sparks + floating glosses
    sparks.forEach(function (s, i) {
      g.fillStyle = "rgba(" + (i % 2 ? "206,146,44" : SEAL) + "," + Math.max(0, s.t) + ")";
      g.beginPath(); g.arc(s.x, s.y, 2, 0, 7); g.fill();
    });
    g.textAlign = "center"; g.lineJoin = "round";
    floats.forEach(function (f) {
      g.globalAlpha = Math.max(0, 1 - f.t / 1.6);
      // the pinyin and meaning are the point of lighting it, so they stay on
      // screen: smaller if they're wider than it, and kept off its edges.
      // Ink, on a rim of bare paper so it reads over a peak or another lantern
      var px = 20;
      g.font = "700 " + px + "px 'Gentium Book Plus', Georgia, serif";
      var tw = g.measureText(f.text).width;
      if (tw > W - 16) { px = Math.max(11, Math.floor(px * (W - 16) / tw)); g.font = "700 " + px + "px 'Gentium Book Plus', Georgia, serif"; tw = g.measureText(f.text).width; }
      var fx0 = Math.max(tw / 2 + 8, Math.min(W - tw / 2 - 8, f.x));
      g.strokeStyle = "rgba(" + PAPER + ",0.92)"; g.lineWidth = 5;
      g.strokeText(f.text, fx0, f.y - f.t * 34);
      g.fillStyle = "rgb(" + INK + ")";
      g.fillText(f.text, fx0, f.y - f.t * 34);
      g.globalAlpha = 1;
    });
  }

  // ---- loop ------------------------------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    keys: ["Escape"]                    // every letter belongs to the pinyin
  }) : { isPaused: function () { return false; } };

  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (P.isPaused()) return;
    update(dt);
    draw(now, dt);
  }

  // ---- input --------------------------------------------------------------------------------
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (P.isPaused()) return;
    if (state === "play") {
      if (e.key === "Backspace") { e.preventDefault(); unlockBack(); return; }
      if (e.key === " " || e.key === "Enter") { e.preventDefault(); lightWaiting(); return; }
      if (e.key.length === 1) { e.preventDefault(); handleChar(e.key); }
      return;
    }
    if (e.repeat) return;
    // Enter on a focused button is that button's click (Tone Master, Modes…);
    // starting a run here as well would run both
    if (e.key === "Enter" && e.target && e.target.closest && e.target.closest("button")) return;
    if (state === "menu") {
      if (e.key === "1" || e.key === "2") {
        mode = e.key === "1" ? "festival" : "tone";
        store.set("lanterns_mode", mode);
        paintMenu();
      } else if (e.key === "3" || e.key === "4") {
        script = e.key === "3" ? "simp" : "trad";
        store.set("lanterns_script", script);
        paintMenu();
      } else if (e.key === "Enter") startRun(mode);
      return;
    }
    if (state === "over") {
      if (e.key === "Enter") startRun(mode);
      // Backspace goes back to the modes (Esc is left to ../motion-toggle.js,
      // which takes it to the games page). Never from a text field, and not
      // in the first moments: in play Backspace lets go of a lantern, so one
      // pressed as the last lantern slips away mustn't skip the results.
      else if (e.key === "Backspace" && !typingIn(e.target) && performance.now() - endedAt >= 700) { e.preventDefault(); toMenu(); }
    }
  });
  // a text field the player could be typing in (a disabled one doesn't count)
  function typingIn(t) { return !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || !!t.isContentEditable) && !t.disabled; }
  // mobile keyboards deliver text through the hidden input instead
  $("kbd").addEventListener("input", function () {
    var v = this.value;
    this.value = "";
    if (state !== "play") return;
    for (var i = 0; i < v.length; i++) {
      if (v[i] === " ") lightWaiting(); else handleChar(v[i]);
    }
  });
  cv.addEventListener("pointerdown", function () {
    if (state === "play") $("kbd").focus({ preventScroll: true });
  });

  // ---- menu ------------------------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === mode);
    });
    document.querySelectorAll("#pick-script button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-s") === script);
    });
    document.querySelector("#menu h1").textContent = (script === "trad" ? "燈" : "灯") + " Lanterns";
    var parts = [];
    if (bests.festival && bests.festival.get()) parts.push("Festival " + bests.festival.get().toLocaleString());
    if (bests.tone && bests.tone.get()) parts.push("Tone Master " + bests.tone.get().toLocaleString());
    $("bests").textContent = parts.length ? "brightest nights: " + parts.join(" · ") : "no lanterns lit yet";
  }
  function toMenu() {
    state = "menu";
    $("over").hidden = true; $("hud").hidden = true; $("echo").hidden = true;
    $("menu").hidden = false;
    paintMenu();
  }
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () {
      mode = b.getAttribute("data-v");
      store.set("lanterns_mode", mode);
      paintMenu();
    });
  });
  document.querySelectorAll("#pick-script button").forEach(function (b) {
    b.addEventListener("click", function () {
      script = b.getAttribute("data-s");
      store.set("lanterns_script", script);
      paintMenu();
    });
  });
  // a mouse click doesn't take focus (Tab still reaches them): left focused,
  // the Enter that should start the night would press the pick again
  document.querySelectorAll("#pick-mode button, #pick-script button").forEach(function (b) {
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("play").addEventListener("click", function () { startRun(mode); });
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);

  // ---- go ----------------------------------------------------------------------------------------
  resize();
  toMenu();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks — the Playwright harness drives runs through these
  window.Lanterns = {
    state: function () { return state; },
    score: function () { return score; },
    clearedCount: function () { return cleared; },
    escapedCount: function () { return escaped; },
    streakNow: function () { return streak; },
    bufferNow: function () { return buffer; },
    lockedHanzi: function () {
      var cs = candidates();
      if (!cs.length) return null;
      var pick = cs[0];
      cs.forEach(function (l) { if (l.y < pick.y) pick = l; });
      return pick.hanzi;
    },
    candidateCount: function () { return candidates().length; },
    active: function () {
      return lanterns.filter(function (l) { return l.state === "up"; })
        .map(function (l) { return { hanzi: l.hanzi, key: l.keys[0], y: l.y }; });
    },
    spawnWord: function (h, xFrac, y) {
      var l = spawn(h);
      if (l && xFrac != null) l.x = xFrac * W;
      if (l && y != null) l.y = y;
      return !!l;
    },
    type: function (s) { for (var i = 0; i < s.length; i++) handleChar(s[i]); },
    noSpawn: function (v) { spawnOff = v !== false; },
    setRise: function (v) { riseMul = v; lanterns.forEach(function (l) { l.vy = 20 * v; }); },
    marked: marked,
    setScript: function (sc) { script = sc; store.set("lanterns_script", sc); },
    scriptNow: function () { return script; },
    start: startRun,
    toMenu: toMenu
  };
})();
