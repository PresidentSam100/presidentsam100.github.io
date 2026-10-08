/* =====================================================================
   Science Fair — Simon, hung on a corkboard.

   Standard rules: the planets play a tune that grows one note per round;
   repeat it by clicking the cutouts or pressing their number keys. One
   wrong planet (or a five-second stall) ends the run.

   Modes
     classic  the four rocky planets (pads 1-4)
     grand    all nine cutouts (pads 1-9)
     daily    Field Trip: everyone gets the same seeded tune, three
              launches per day, share your best round

   Timing runs on a pause-aware clock: rAF advances `clock` only while
   unpaused, and every scheduled beat/flight/timeout is a clock event, so
   pausing freezes the whole diorama mid-note.
   ===================================================================== */
(function () {
  "use strict";

  var A = window.SciArt;
  function $(id) { return document.getElementById(id); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }

  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    getNum: function (k, f) { var v = parseFloat(this.get(k, "")); return isNaN(v) ? f : v; },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
    remove: function (k) { try { localStorage.removeItem(k); } catch (e) {} }
  };
  var bestClassic = window.GameShell ? GameShell.best("scifair_best_classic", { higher: true }) : null;
  var bestGrand = window.GameShell ? GameShell.best("scifair_best_grand", { higher: true }) : null;

  // ---- the daily field trip -------------------------------------------
  var DAY0 = Date.UTC(2026, 8, 27);            // Field Trip #1's date
  function today() {
    var d = new Date();
    var utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    var n = Math.round((utc - DAY0) / 86400000) + 1;
    var mm = ("0" + (d.getMonth() + 1)).slice(-2), dd = ("0" + d.getDate()).slice(-2);
    return { n: n, ymd: d.getFullYear() + "-" + mm + "-" + dd };
  }
  function dailySeq(n) {
    var rng = A.mulberry(((n * 2654435761) >>> 0) ^ 0x5F1E3);
    var s = [];
    for (var i = 0; i < 64; i++) s.push(Math.floor(rng() * 9));
    return s;
  }
  function readDaily() {
    var t = today();
    try {
      var d = JSON.parse(store.get("scifair_daily", "null"));
      if (d && d.ymd === t.ymd) return d;
    } catch (e) {}
    return { ymd: t.ymd, n: t.n, used: 0, best: 0 };
  }
  function writeDaily(d) { store.set("scifair_daily", JSON.stringify(d)); }

  // ---- the pause-aware clock -------------------------------------------
  var clock = 0, evts = [], turbo = false;
  function later(ms, fn) { evts.push({ t: clock + (turbo ? Math.min(ms, 25) : ms), fn: fn }); }
  function clearEvts() { evts = []; }

  // ---- sound: a pentatonic solar system ---------------------------------
  var NOTES = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99];
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(i, durMs) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime, dur = Math.max(0.09, durMs / 1000);
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = "triangle"; o.frequency.value = NOTES[i];
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function buzz() {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime;
    var o = ac.createOscillator(), g = ac.createGain();
    o.type = "square"; o.frequency.setValueAtTime(110, t0);
    o.frequency.exponentialRampToValueAtTime(62, t0 + 0.4);
    g.gain.setValueAtTime(0.12, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    o.connect(g); g.connect(ac.destination);
    o.start(t0); o.stop(t0 + 0.5);
  }
  function ding() { tone(5, 140); later(turbo ? 10 : 110, function () { tone(8, 220); });  }

  // ---- the diorama -------------------------------------------------------
  var pads = [];          // { el, btn, x, y, r } per planet, screen coords
  var roids = [];
  var boardW = 0, boardH = 0;

  function build() {
    var wrap = $("planets");
    A.PLANETS.forEach(function (p, i) {
      var box = A.planetSVG(i);
      var el = document.createElement("div");
      el.className = "hang sway";
      el.innerHTML = '<span class="knot"></span><span class="string"></span>' +
        '<button type="button" class="pad" aria-label="' + p.name + ' — key ' + (i + 1) + '">' + box.html + "</button>" +
        '<span class="tag"><kbd>' + (i + 1) + "</kbd>" + p.name +
        (i === 8 ? "<small>still a planet!!</small>" : "") + "</span>";
      wrap.appendChild(el);
      var btn = el.querySelector("button");
      btn.addEventListener("click", function () { press(i); });
      pads.push({ el: el, btn: btn, box: box, x: 0, y: 0, r: 0 });
    });
    var ro = $("asteroids");
    for (var k = 0; k < 4; k++) {
      var r = document.createElement("div");
      r.className = "roid";
      r.innerHTML = '<span class="string"></span>' + A.asteroidSVG(400 + k * 17);
      ro.appendChild(r);
      roids.push(r);
    }
    // a few pushpins in the cork
    var pinBox = document.createElement("div");
    pinBox.innerHTML =
      A.pinHTML("#d95555") + A.pinHTML("#e3bd57") + A.pinHTML("#5da24f") + A.pinHTML("#4a7fd0");
    var pins = pinBox.querySelectorAll(".pin");
    [[0.06, 0.9], [0.94, 0.86], [0.03, 0.5], [0.97, 0.42]].forEach(function (pp, i2) {
      pins[i2].style.left = (pp[0] * 100) + "%";
      pins[i2].style.top = (pp[1] * 100) + "%";
      $("board").appendChild(pins[i2]);
    });
    $("ship").innerHTML = A.rocketSVG();

    // the rest of the diorama: paper sun, glitter stars, the title banner
    var board = $("board");
    var sun = document.createElement("div");
    sun.id = "sun"; sun.innerHTML = A.sunSVG();
    board.appendChild(sun);
    for (var st = 0; st < 9; st++) {
      var star = document.createElement("div");
      star.className = "star"; star.innerHTML = A.starSVG(60 + st * 13);
      board.appendChild(star);
      stars.push(star);
    }
    var banner = document.createElement("div");
    banner.id = "banner"; banner.className = "paper-card";
    banner.innerHTML = "★ OUR SOLAR SYSTEM ★ &nbsp;·&nbsp; <b>Sam, grade 4</b>";
    board.appendChild(banner);
  }
  var stars = [];

  // Hang everything to fit the current window.
  var STRINGS = [70, 145, 42, 118, 165, 58, 138, 95, 34];   // varied, like real yarn
  function layout() {
    boardW = window.innerWidth; boardH = window.innerHeight;
    var twoRows = boardW < 820;
    $("wire").hidden = !twoRows;
    var rulerR = $("ruler").getBoundingClientRect();
    var anchor1 = rulerR.bottom;
    var anchor2 = boardH * 0.44;
    if (twoRows) $("wire").style.top = anchor2 + "px";

    var rows = twoRows ? [[0, 1, 2, 3, 4], [5, 6, 7, 8]] : [[0, 1, 2, 3, 4, 5, 6, 7, 8]];
    // side margins leave room for the masking-tape tags, which are wider
    // than the smallest cutouts
    var avail = boardW - (twoRows ? 64 : Math.max(76, boardW * 0.06));
    var gap = twoRows ? 6 : 10;
    // one scale for every cutout: the tightest row decides. A cutout's
    // footprint is its whole svg box (Saturn's ring is wider than its disc),
    // so no button ever overlaps its neighbour's.
    function halfW(i) { return Math.max(A.PLANETS[i].r, pads[i].box.w / 2); }
    var scale = 10;
    rows.forEach(function (row) {
      var sum = 0;
      row.forEach(function (i) { sum += 2 * halfW(i); });
      scale = Math.min(scale, (avail - gap * (row.length - 1)) / sum);
    });
    scale = Math.max(0.42, Math.min(scale, 1.2));
    var vroom = (twoRows ? anchor2 - anchor1 : boardH - anchor1) - 150 * scale - 120;
    var sk = Math.max(0.35, Math.min(2.2, vroom / 220));

    rows.forEach(function (row, ri) {
      var anchor = ri === 0 ? anchor1 : anchor2;
      var total = gap * (row.length - 1);
      row.forEach(function (i) { total += 2 * halfW(i) * scale; });
      var x = (boardW - total) / 2;
      row.forEach(function (i) {
        var p = pads[i], base = A.PLANETS[i];
        var dr = base.r * scale;                       // on-screen radius
        var hw = halfW(i) * scale;                     // half the footprint
        var sw = p.box.w * scale;                      // svg box width on screen
        var sl = Math.max(26, STRINGS[i] * sk * (ri === 1 ? 0.9 : 1));
        p.x = x + hw; p.y = anchor + sl + dr; p.r = dr;
        p.el.style.left = (p.x - sw / 2) + "px";
        p.el.style.top = anchor + "px";
        p.el.style.width = sw + "px";
        p.btn.style.width = sw + "px";
        // the svg box pads the paper by 8 units; tuck the button up so the
        // thread visually touches the cutout's edge
        p.btn.style.marginTop = (-(p.box.h / 2 - base.r) * scale) + "px";
        p.el.querySelector(".string").style.height = sl + "px";
        var rng = A.mulberry(900 + i);
        p.el.style.setProperty("--swaydur", (4.6 + rng() * 2.6).toFixed(2) + "s");
        p.el.style.setProperty("--swaydelay", (-rng() * 5).toFixed(2) + "s");
        p.el.style.setProperty("--swaydeg", (2.4 - Math.min(1.4, sl / 160)).toFixed(2) + "deg");
        p.el.style.setProperty("--tagtilt", ((rng() * 6) - 3).toFixed(1) + "deg");
        x += hw * 2 + gap;
      });
    });

    // foil asteroids high up between the planets
    [[0.13, 20, 40], [0.36, 34, 30], [0.63, 26, 44], [0.88, 40, 34]].forEach(function (cfg, k) {
      var r = roids[k];
      r.style.left = (boardW * cfg[0]) + "px";
      r.style.top = anchor1 + "px";
      r.style.width = cfg[2] + "px";
      r.querySelector(".string").style.height = cfg[1] + "px";
      var rng = A.mulberry(700 + k);
      r.style.setProperty("--swaydur", (5.5 + rng() * 2).toFixed(2) + "s");
      r.style.setProperty("--swaydelay", (-rng() * 4).toFixed(2) + "s");
      r.style.setProperty("--swaydeg", "2.2deg");
    });

    // the paper sun peeks in from an edge; stars fill the lower cork
    var sun = $("sun");
    var sz = twoRows ? Math.min(150, boardW * 0.4) : Math.max(170, Math.min(290, boardH * 0.33));
    sun.style.width = sz + "px";
    sun.style.left = (-sz * 0.44) + "px";
    sun.style.top = (twoRows ? boardH - sz * 0.72 : boardH * 0.56) + "px";
    var srng = A.mulberry(12);
    stars.forEach(function (star, si) {
      var sw2 = 20 + srng() * 22;
      var yBand = twoRows ? [0.82, 0.93] : [0.6, 0.88];
      star.style.width = sw2 + "px";
      star.style.left = (boardW * (0.05 + srng() * 0.88)) + "px";
      star.style.top = (boardH * (yBand[0] + srng() * (yBand[1] - yBand[0]))) + "px";
      star.style.setProperty("--tilt", ((srng() * 40) - 20).toFixed(0) + "deg");
    });

    ship.dock.x = boardW - Math.max(70, boardW * 0.08);
    ship.dock.y = boardH - 170;
    if (ship.at === "dock" && !ship.flying) shipPlace(ship.dock.x, ship.dock.y, 0);
  }

  // ---- the paper rocket ---------------------------------------------------
  var ship = { x: 0, y: 0, at: "dock", flying: false, dock: { x: 90, y: 500 },
               from: null, to: null, t0: 0, t1: 0, ang: 0 };
  function shipPlace(x, y, ang) {
    ship.x = x; ship.y = y; ship.ang = ang;
    var el = $("ship");
    el.style.transform = "translate(" + (x - 22) + "px," + (y - 48) + "px) rotate(" + ang + "deg)";
  }
  function shipTo(i) {
    var tx, ty;
    if (i === "dock") { tx = ship.dock.x; ty = ship.dock.y; }
    else { tx = pads[i].x; ty = pads[i].y + pads[i].r + 30; }
    if (!fx()) { ship.at = i; ship.flying = false; $("ship").classList.remove("flying"); shipPlace(tx, ty, 0); return; }
    var dist = Math.hypot(tx - ship.x, ty - ship.y);
    if (dist < 4) return;
    ship.from = { x: ship.x, y: ship.y };
    ship.to = { x: tx, y: ty };
    ship.t0 = clock;
    var dur = Math.max(200, Math.min(650, dist * 0.7)) / (turbo ? 10 : 1);
    ship.t1 = clock + dur;
    ship.flying = true; ship.at = i;
    $("ship").classList.add("flying");
  }
  function shipStep() {
    if (!ship.flying) return;
    var k = (clock - ship.t0) / (ship.t1 - ship.t0);
    if (k >= 1) {
      ship.flying = false; $("ship").classList.remove("flying");
      shipPlace(ship.to.x, ship.to.y, 0);
      return;
    }
    var e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // easeInOutQuad
    var x = ship.from.x + (ship.to.x - ship.from.x) * e;
    var y = ship.from.y + (ship.to.y - ship.from.y) * e;
    var ang = Math.atan2(ship.to.y - ship.from.y, ship.to.x - ship.from.x) * 180 / Math.PI + 90;
    // tilt into the flight, settle upright near the end
    shipPlace(x, y, ang * (1 - e) * 0.85);
  }

  // ---- game state ----------------------------------------------------------
  var state = "menu";        // menu | watch | input | between | dead | over
  var mode = store.get("scifair_mode", "classic");
  if (["classic", "grand", "daily"].indexOf(mode) === -1) mode = "classic";
  var seq = [], at = 0, deadline = 0, dseq = null;
  var IN_TIMEOUT = 5000;
  var NICE = ["nice!", "yes!!", "wow!!", "A+ work!", "keep going!", "stellar!"];

  function active() { return mode === "classic" ? 4 : 9; }
  function iv(len) {
    if (turbo) return 42;
    return len <= 5 ? 620 : len <= 13 ? 470 : len <= 19 ? 390 : 330;
  }
  function say(t) { $("hud-say").textContent = t; }
  function hudRound() { $("hud-round").textContent = "Round " + Math.max(1, seq.length); }

  function light(i, ms) {
    var el = pads[i].el;
    el.classList.add("lit");
    later(ms, function () { el.classList.remove("lit"); });
  }
  // clearEvts() drops any pending glow-off, so wipe the classes directly
  function clearFx() {
    pads.forEach(function (p) { p.el.classList.remove("lit", "wrong", "answer"); });
  }

  function applyDim() {
    var n = active();
    pads.forEach(function (p, i) {
      p.el.classList.toggle("dim", i >= n);
      p.btn.disabled = i >= n;
      p.btn.tabIndex = i >= n ? -1 : 0;
    });
  }
  function applyRoids() {
    var d = mode === "daily" ? readDaily() : null;
    roids.forEach(function (r, k) {
      var spent = d && k < 3 && k < d.used;
      r.classList.toggle("spent", !!spent);
      var x = r.querySelector(".x");
      if (spent && !x) { x = document.createElement("span"); x.className = "x"; x.textContent = "✕"; r.appendChild(x); }
      if (!spent && x) x.remove();
    });
  }

  // The best round is saved the moment a round is cleared, and a Field Trip
  // launch is recorded the moment it ends (before the "uh oh" beat), so
  // leaving or closing the tab can't lose either. runBest is the best as the
  // run began (NaN: none yet), for "a new best!"
  var runBest = NaN;
  function bestFor() { return mode === "classic" ? bestClassic : mode === "grand" ? bestGrand : null; }

  function startRun(m) {
    if (m) mode = m;
    store.set("scifair_mode", mode);
    audio();
    if (mode === "daily") {
      var d = readDaily();
      if (d.used >= 3) { showOver(true); return; }
      dseq = dailySeq(d.n);
    }
    var b = bestFor();
    runBest = b ? store.getNum(b.key, NaN) : NaN;
    clearEvts(); clearFx();
    seq = []; at = 0;
    applyDim(); applyRoids();
    $("menu").hidden = true; $("over").hidden = true; $("hud").hidden = false;
    hudRound(); say("watch…");
    state = "between";
    shipTo("dock");
    later(700, nextRound);
  }

  function nextRound() {
    if (mode === "daily") seq.push(dseq[seq.length % dseq.length]);
    else seq.push(Math.floor(Math.random() * active()));
    at = 0;
    hudRound();
    state = "watch"; say("watch…");
    // the rocket sits on its pad while the planets sing — it only flies
    // when the player is picking planets from memory
    shipTo("dock");
    var step = iv(seq.length);
    seq.forEach(function (idx, k) {
      later(420 + k * step, function () {
        light(idx, step * 0.55);
        tone(idx, step * 0.6);
      });
    });
    later(420 + seq.length * step + 120, function () {
      state = "input"; at = 0;
      deadline = clock + (turbo ? 1500 : IN_TIMEOUT);
      say("your turn!");
    });
  }

  function press(i) {
    if (state !== "input" || i >= active()) return;
    if (i === seq[at]) {
      var step = iv(seq.length);
      light(i, Math.min(300, step * 0.5));
      tone(i, 200);
      shipTo(i);
      at++;
      deadline = clock + (turbo ? 1500 : IN_TIMEOUT);
      if (at === seq.length) {
        state = "between";
        if (bestFor()) bestFor().submit(seq.length);   // the round just cleared
        say(NICE[Math.floor(Math.random() * NICE.length)]);
        later(340, ding);
        later(950, nextRound);
      }
    } else {
      miss(i);
    }
  }

  function miss(wrongIdx) {
    state = "dead";
    var score = seq.length ? seq.length - 1 : 0;
    if (mode === "daily") {
      var d = readDaily();
      d.used = Math.min(3, d.used + 1);
      if (score > d.best) d.best = score;
      writeDaily(d);
    } else if (bestFor()) bestFor().submit(score);
    clearEvts(); clearFx();
    buzz();
    say("uh oh…");
    if (wrongIdx != null) {
      pads[wrongIdx].el.classList.add("wrong");
      later(900, function () { pads[wrongIdx].el.classList.remove("wrong"); });
    }
    var right = pads[seq[at]];
    right.el.classList.add("answer");
    later(1100, function () { right.el.classList.remove("answer"); });
    later(1300, function () { showOver(false); });
  }

  // ---- the report card ------------------------------------------------------
  function grade(s) {
    return s >= 20 ? "A+" : s >= 15 ? "A" : s >= 11 ? "B+" : s >= 8 ? "B" : s >= 5 ? "C+" : s >= 3 ? "C" : "D";
  }
  var TITLES = ["Project review", "Judges' notes", "Grading time", "Field notes"];

  function showOver(dailyDoneEarly) {
    var score = seq.length ? seq.length - 1 : 0;
    var statLines = [], isBest = false, d = null;
    if (mode === "daily") {
      d = readDaily();
      if (!dailyDoneEarly) applyRoids();   // (the launch was recorded as it ended, in miss)
      score = dailyDoneEarly ? d.best : score;
    }
    var g = grade(mode === "daily" ? readDaily().best : score);
    // (round 0 is no best, even on a first run)
    if (bestFor()) { bestFor().submit(score); isBest = score > 0 && (isNaN(runBest) || score > runBest); }

    $("over-title").textContent = TITLES[Math.floor(Math.random() * TITLES.length)];
    $("over-msg").textContent = "Round " + score;
    var gEl = $("over-grade");
    gEl.textContent = g;
    gEl.classList.toggle("gold", g === "A+");

    if (mode === "daily") {
      d = readDaily();
      var left = 3 - d.used;
      statLines.push("Field Trip #" + d.n + " · best today: round " + d.best);
      statLines.push(left > 0 ? (left + (left === 1 ? " launch" : " launches") + " left") : "all launches used — back tomorrow!");
      $("again").hidden = left <= 0;
      $("again").innerHTML = 'Launch again <span class="gs-keys"><kbd>Enter</kbd></span>';
      $("share").hidden = false;
    } else {
      var b = mode === "classic" ? bestClassic : bestGrand;
      statLines.push(isBest ? "a new best! ⭐" : "best: round " + (b ? b.get() : 0));
      $("again").hidden = false;
      $("again").innerHTML = 'Again <span class="gs-keys"><kbd>Enter</kbd></span>';
      $("share").hidden = true;
    }
    $("over-stats").textContent = statLines.join("\n");
    $("hud").hidden = true;
    $("menu").hidden = true;
    $("over").hidden = false;
    state = "over";
    shipTo("dock");
  }

  function shareDaily() {
    var d = readDaily();
    var text = "Science Fair · Field Trip #" + d.n + " (" + d.ymd + ")\n" +
      "Round " + d.best + " 🪐 in " + d.used + (d.used === 1 ? " launch" : " launches") + "\n" +
      location.origin + location.pathname;
    function copied() { $("share").textContent = "copied!"; setTimeout(function () { $("share").textContent = "Share result"; }, 1400); }
    // (the clipboard wasn't allowed: show the result to copy, in the game's own look)
    function fallback() { if (window.GameShell) GameShell.copyBox({ title: "Copy your result", text: text }); else try { window.prompt("Copy your result:", text); } catch (e) {} }
    if (navigator.share && /Mobi|Android|iPhone|iPad/.test(navigator.userAgent)) {
      navigator.share({ text: text }).catch(function (e2) { if (!e2 || e2.name !== "AbortError") fallback(); });
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(copied, fallback);
    else fallback();
  }

  // ---- menu ------------------------------------------------------------------
  function paintMenu() {
    var segs = document.querySelectorAll("#pick-mode button");
    segs.forEach(function (b) { b.classList.toggle("on", b.getAttribute("data-v") === mode); });
    var d = readDaily(), left = 3 - d.used, key = ' <span class="gs-keys"><kbd>3</kbd></span>';
    $("daily-small").innerHTML = (d.used === 0 ? "today's tune · 3 launches" :
      left > 0 ? "today: round " + d.best + " · " + left + " left" :
      "done: round " + d.best + " ✓") + key;
    var parts = [];
    if (bestClassic && bestClassic.get()) parts.push("Classic " + bestClassic.get());
    if (bestGrand && bestGrand.get()) parts.push("Grand Tour " + bestGrand.get());
    $("bests").textContent = parts.length ? "best rounds: " + parts.join(" · ") : "no grades on file yet";
  }
  function toMenu() {
    clearEvts(); clearFx();
    state = "menu";
    $("over").hidden = true; $("hud").hidden = true; $("menu").hidden = false;
    mode = store.get("scifair_mode", mode);
    applyDim(); applyRoids(); paintMenu();
    shipTo("dock");
  }

  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () {
      mode = b.getAttribute("data-v");
      store.set("scifair_mode", mode);
      applyDim(); applyRoids(); paintMenu();
    });
  });
  $("play").addEventListener("click", function () { startRun(mode); });
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);
  $("share").addEventListener("click", shareDaily);

  // ---- pause -------------------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "watch" || state === "input" || state === "between"; },
    keys: ["Escape", "p"]
  }) : { isPaused: function () { return false; } };
  // A run is in progress (paused or not) once a round is cleared, until the
  // miss that ends it: leaving then asks first. A Field Trip launch left
  // mid-way isn't counted, but the run is still lost.
  if (window.GameShell) GameShell.guardLeave({
    active: function () {
      return (P.isPaused() || state === "watch" || state === "input" || state === "between") && (seq.length > 1 || at > 0);
    },
    pausable: P
  });

  // ---- keys ----------------------------------------------------------------------
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (P.isPaused()) return;
    var digit = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (state === "input" && digit) { e.preventDefault(); if (!e.repeat) press(+digit[1] - 1); return; }
    if (e.repeat) return;
    if (state === "menu") {
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        mode = ["classic", "grand", "daily"][+e.key - 1];
        store.set("scifair_mode", mode);
        applyDim(); applyRoids(); paintMenu();
      } else if (e.key === "Enter") startRun(mode);
      return;
    }
    // Backspace goes back to the modes (Esc is left to ../motion-toggle.js,
    // which takes it to the games page)
    if (state === "over") {
      if (e.key === "Enter" && !$("again").hidden) startRun(mode);
      else if (e.key === "Backspace") { e.preventDefault(); toMenu(); }
    }
  });

  // ---- the loop -------------------------------------------------------------------
  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(50, now - last); last = now;
    document.body.classList.toggle("fxon", fx());
    if (P.isPaused()) return;
    clock += dt;
    // run everything that has come due (a handler may schedule more)
    for (var i = 0; i < evts.length; i++) {
      if (evts[i].t <= clock) {
        var fn = evts[i].fn;
        evts.splice(i, 1); i--;
        fn();
      }
    }
    if (state === "input" && clock > deadline) miss(null);
    shipStep();
  }

  // ---- go --------------------------------------------------------------------------
  build();
  layout();
  window.addEventListener("resize", layout);
  applyDim(); applyRoids(); paintMenu();
  shipPlace(ship.dock.x, ship.dock.y, 0);
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks — the Playwright harness drives runs through these
  window.ScienceFair = {
    state: function () { return state; },
    seq: function () { return seq.slice(); },
    mode: function () { return mode; },
    start: startRun,
    press: press,
    toMenu: toMenu,
    fast: function () { turbo = true; },
    daily: readDaily,
    clockNow: function () { return clock; },
    padRect: function (i) { return pads[i].btn.getBoundingClientRect(); }
  };
})();
