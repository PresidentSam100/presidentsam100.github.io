/* =====================================================================
   Lanterns — pinyin typing at the festival.

   Paper lanterns rise with hanzi on them. Your first letter locks the
   most urgent lantern whose pinyin starts that way (ZType-style); each
   right letter climbs the word, a full match lights the lantern and it
   soars, and a wrong letter thuds and breaks your streak without being
   consumed. Backspace steps back (and lets go at zero). Type v for ü —
   u is accepted too. Three lanterns lost to the dark end the night.

   Modes: festival (toneless pinyin) and tone (type the tone numbers,
   5 for neutral). Each keeps its own best score.
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
  var score = 0, cleared = 0, escaped = 0, streak = 0;
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
    if (state !== "play") return;
    ch = ch.toLowerCase();
    var legal = mode === "tone" ? /^[a-z1-5]$/ : /^[a-z]$/;
    if (!legal.test(ch)) return;
    // every letter narrows the field: feichang and fanguan both glow on
    // 'f', and the second letter decides between them
    var nb = buffer + ch;
    var matches = lanterns.filter(function (l) {
      return l.state === "up" && l.keys.some(function (k) { return k.indexOf(nb) === 0; });
    });
    if (!matches.length) { miss(); return; }   // not consumed
    buffer = nb;
    tick();
    var full = matches.filter(function (l) { return l.keys.some(function (k) { return k === nb; }); });
    if (full.length) {
      var pick = full[0];
      full.forEach(function (l) { if (l.y < pick.y) pick = l; });
      light(pick);
    }
    echo();
  }
  function miss() {
    thud();
    streak = 0;
    hud();
    var e = $("echo");
    e.style.borderColor = "rgba(239,106,90,0.8)";
    setTimeout(function () { e.style.borderColor = ""; }, 220);
  }
  function light(l) {
    l.state = "lit"; l.litT = 0;
    streak++; cleared++;
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
    hud(); echo();
  }
  function unlockBack() {
    if (buffer.length > 0) buffer = buffer.slice(0, -1);
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
    lanterns = []; buffer = "";
    score = 0; cleared = 0; escaped = 0; streak = 0;
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
    var isBest = b ? !isFinite(runBest) || score > runBest : false;
    $("over-title").textContent = cleared >= 40 ? "A sky full of light" : "The sky went dark";
    $("over-msg").innerHTML = score.toLocaleString() + "<small> · " + cleared + " lanterns lit</small>";
    $("over-stats").textContent =
      (mode === "tone" ? "tone master" : "festival") + " · best streak counted ×" + (1 + Math.min(10, Math.max(0, streak - 1)) * 0.1).toFixed(1) + "\n" +
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
    floats.forEach(function (f) { f.t += dt; });
    floats = floats.filter(function (f) { return f.t < 1.6; });
    sparks.forEach(function (s) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 60 * dt; s.t -= dt; });
    sparks = sparks.filter(function (s) { return s.t > 0; });
  }

  // ---- painting -----------------------------------------------------------------------
  var cv = $("stage"), g = cv.getContext("2d");
  var W = 0, H = 0, stars = [];
  function resize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = [];
    for (var i = 0; i < 90; i++) stars.push([Math.random() * W, Math.random() * H * 0.7, 0.5 + Math.random() * 1.2, Math.random() * 6.28]);
    bgDrifters = [];
    for (var d = 0; d < 7; d++) bgDrifters.push({ x: Math.random() * W, y: Math.random() * H, v: 6 + Math.random() * 8, s: 5 + Math.random() * 7 });
  }
  window.addEventListener("resize", resize);

  function drawLantern(l, t) {
    var s = l.size, x = l.x, y = l.y;
    var chn = l.hanzi.length;
    // longer words ride wider lanterns so the hanzi never crowd
    var bw = s * (0.92 + (chn - 1) * 0.5), bh = s * 1.12;
    var isCand = buffer && l.state === "up" &&
      l.keys.some(function (k) { return k.indexOf(buffer) === 0; });
    var lit = l.state === "lit" || isCand;
    var warm = l.state === "lit" ? 1 : isCand ? 0.78 : 0.55;
    // glow
    var R = Math.max(bw, bh) * 0.6;
    var glow = g.createRadialGradient(x, y, R * 0.15, x, y, R * (lit ? 2.3 : 1.6));
    glow.addColorStop(0, "rgba(255,170,70," + 0.5 * warm + ")");
    glow.addColorStop(1, "rgba(255,170,70,0)");
    g.fillStyle = glow;
    g.fillRect(x - R * 2.5, y - R * 2.5, R * 5, R * 5);
    // paper body
    var body = g.createLinearGradient(x - bw / 2, 0, x + bw / 2, 0);
    body.addColorStop(0, "rgba(230,110,40," + (0.75 + 0.25 * warm) + ")");
    body.addColorStop(0.5, "rgba(255,190,90," + (0.8 + 0.2 * warm) + ")");
    body.addColorStop(1, "rgba(230,110,40," + (0.75 + 0.25 * warm) + ")");
    g.fillStyle = body;
    g.beginPath();
    g.moveTo(x - bw * 0.34, y - bh / 2);
    g.quadraticCurveTo(x - bw * 0.62, y, x - bw * 0.3, y + bh / 2);
    g.lineTo(x + bw * 0.3, y + bh / 2);
    g.quadraticCurveTo(x + bw * 0.62, y, x + bw * 0.34, y - bh / 2);
    g.closePath();
    g.fill();
    // ribs
    g.strokeStyle = "rgba(160,60,20,0.35)";
    g.lineWidth = 1;
    for (var r = -1; r <= 1; r++) {
      g.beginPath();
      g.moveTo(x - bw * (0.44 + r * 0.05), y + r * bh * 0.22);
      g.quadraticCurveTo(x, y + r * bh * 0.22 + 4, x + bw * (0.44 + r * 0.05), y + r * bh * 0.22);
      g.stroke();
    }
    // caps
    g.fillStyle = "#8a2f1d";
    g.fillRect(x - bw * 0.3, y - bh / 2 - 5, bw * 0.6, 6);
    g.fillRect(x - bw * 0.26, y + bh / 2 - 1, bw * 0.52, 6);
    // flame dot
    g.fillStyle = "rgba(255,240,180," + (0.5 + 0.5 * warm) + ")";
    g.beginPath(); g.arc(x, y + bh / 2 + 9, 3, 0, 7); g.fill();
    // hanzi
    g.fillStyle = lit ? "#5a1408" : "rgba(90,20,8,0.9)";
    g.font = "600 " + Math.round(s * (chn >= 4 ? 0.4 : chn === 3 ? 0.44 : 0.5)) + "px 'Ma Shan Zheng', 'KaiTi', 'SimSun', serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(l.hanzi, x, y + 1);
    // only what has been typed so far - never the rest of the answer
    if (isCand) {
      g.font = "800 15px Nunito, monospace";
      g.textAlign = "center";
      g.fillStyle = "#ffd23f";
      g.fillText(buffer, x, y + bh / 2 + 24);
    }
  }

  function draw(t) {
    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#090a24");
    sky.addColorStop(0.6, "#151038");
    sky.addColorStop(1, "#33184a");
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    // stars + moon
    stars.forEach(function (st) {
      var a = 0.35 + (fx() ? 0.45 * Math.abs(Math.sin(t * 0.0005 + st[3])) : 0.3);
      g.fillStyle = "rgba(235,240,255," + a + ")";
      g.fillRect(st[0], st[1], st[2], st[2]);
    });
    g.fillStyle = "rgba(255,244,214,0.9)";
    g.beginPath(); g.arc(W * 0.84, H * 0.14, 26, 0, 7); g.fill();
    g.fillStyle = "rgba(9,10,36,1)";
    g.beginPath(); g.arc(W * 0.84 - 11, H * 0.14 - 5, 22, 0, 7); g.fill();
    // faraway lanterns already released
    if (fx()) {
      bgDrifters.forEach(function (d) {
        d.y -= d.v * (1 / 60);
        if (d.y < -20) { d.y = H + 20; d.x = Math.random() * W; }
        g.fillStyle = "rgba(255,160,70,0.35)";
        g.beginPath(); g.arc(d.x, d.y, d.s * 0.5, 0, 7); g.fill();
      });
    }
    // rooftop silhouettes with a pagoda
    g.fillStyle = "#07061a";
    var base = H - 46;
    g.fillRect(0, base, W, 46);
    for (var rx = 0; rx < W; rx += 130) {
      g.beginPath();
      g.moveTo(rx, base);
      g.quadraticCurveTo(rx + 28, base - 26, rx + 65, base - 22);
      g.quadraticCurveTo(rx + 102, base - 26, rx + 130, base);
      g.closePath(); g.fill();
    }
    // pagoda at the side
    var px = W * 0.08;
    for (var lv = 0; lv < 3; lv++) {
      var pw = 84 - lv * 20, py = base - 18 - lv * 30;
      g.beginPath();
      g.moveTo(px - pw / 2 - 12, py);
      g.quadraticCurveTo(px, py - 20, px + pw / 2 + 12, py);
      g.lineTo(px + pw / 2 - 8, py - 14);
      g.lineTo(px - pw / 2 + 8, py - 14);
      g.closePath(); g.fill();
      g.fillRect(px - pw / 2 + 8, py - 30, pw - 16, 18);
    }
    // crowd glow
    var cg = g.createLinearGradient(0, base - 10, 0, H);
    cg.addColorStop(0, "rgba(255,140,60,0.14)");
    cg.addColorStop(1, "rgba(255,140,60,0)");
    g.fillStyle = cg;
    g.fillRect(0, base - 10, W, 56);

    lanterns.forEach(function (l) { drawLantern(l, t); });

    // sparks + floating glosses
    sparks.forEach(function (s) {
      g.fillStyle = "rgba(255,214,120," + Math.max(0, s.t) + ")";
      g.beginPath(); g.arc(s.x, s.y, 2, 0, 7); g.fill();
    });
    g.textAlign = "center";
    floats.forEach(function (f) {
      g.globalAlpha = Math.max(0, 1 - f.t / 1.6);
      g.font = "800 19px Nunito, sans-serif";
      g.fillStyle = "#ffe9cf";
      g.fillText(f.text, f.x, f.y - f.t * 34);
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
    draw(now);
  }

  // ---- input --------------------------------------------------------------------------------
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (P.isPaused()) return;
    if (state === "play") {
      if (e.key === "Backspace") { e.preventDefault(); unlockBack(); return; }
      if (e.key.length === 1) { e.preventDefault(); handleChar(e.key); }
      return;
    }
    if (e.repeat) return;
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
    for (var i = 0; i < v.length; i++) handleChar(v[i]);
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
