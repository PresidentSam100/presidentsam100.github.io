(function () {
  "use strict";

  var LANES = 5;
  var BEST_DAY = "rushhour_best_day";
  var BEST_NIGHT = "rushhour_best_night";

  var $ = function (id) { return document.getElementById(id); };
  var stage = $("stage"), cv = $("cv"), ctx = cv.getContext("2d");
  var ov = $("overlay"), card = $("card");
  var elDist = $("value-dist"), elSpeed = $("value-speed"), elBest = $("value-best");

  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function save(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) {} }
  function bestKey() { return mode === "night" ? BEST_NIGHT : BEST_DAY; }

  // ----- sound --------------------------------------------------------
  var AC = window.AudioContext || window.webkitAudioContext;
  var actx = null;
  function ac() { if (!actx && AC) { try { actx = new AC(); } catch (e) { actx = null; } } return actx; }
  function beep(f, dur, vol, type) {
    var c = ac(); if (!c) return;
    var t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type || "sine"; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol || 0.18, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.12));
    o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + (dur || 0.12) + 0.02);
  }
  function crashSound() {
    var c = ac(); if (!c) return;
    var t = c.currentTime, len = 0.5, n = c.sampleRate * len;
    var buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    var src = c.createBufferSource(); src.buffer = buf;
    var g = c.createGain(); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    var lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1100;
    src.connect(lp); lp.connect(g); g.connect(c.destination); src.start(t); src.stop(t + len);
    var o = c.createOscillator(), og = c.createGain();
    o.type = "sawtooth"; o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.4);
    og.gain.setValueAtTime(0.25, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(og); og.connect(c.destination); o.start(t); o.stop(t + 0.46);
  }
  var SND = {
    lane: function () { beep(420, 0.05, 0.09, "square"); },
    tick: function () { beep(760, 0.05, 0.07, "square"); }
  };

  // ----- vehicles (procedural, soft-shaded top-down) -----------------
  // Realistic car colours, matching the reference art.
  var CAR_COLORS = ["#b5392f", "#2f6fb0", "#26456e", "#e7e8e2", "#bcc0c6", "#868a91", "#2a2e35"];
  var PLAYER_BASE = "#39b6ff";
  var TRUCK_PROB = 0.1;
  var TRUCK_LEN = 1.8;   // truck height as a multiple of a car (kept short enough to stay fair)
  var MERGE_PROB = 0.2;  // chance a car will signal and change lanes on the way down

  function shade(hex, amt) { // amt<0 → darker, amt>0 → lighter
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    var t = amt < 0 ? 0 : 255, a = Math.abs(amt);
    r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath(); ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function bodyGradient(x, w, base) {
    var g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, shade(base, -0.3)); g.addColorStop(0.5, shade(base, 0.16)); g.addColorStop(1, shade(base, -0.3));
    return g;
  }
  // Cars face UP (front = top). Headlights at the front, taillights at the rear.
  function drawVehicleAt(cx, cy, w, h, type, base, signalDir) {
    var x = Math.round(cx - w / 2), y = Math.round(cy - h / 2);
    ctx.fillStyle = "rgba(0,0,0,0.30)"; // drop shadow, down-right
    rr(x + Math.round(w * 0.09), y + Math.round(h * 0.05), w, h, w * 0.28); ctx.fill();
    if (type === "truck") return drawTruck(x, y, w, h, base);
    ctx.fillStyle = bodyGradient(x, w, base); rr(x, y, w, h, w * 0.28); ctx.fill();
    ctx.lineWidth = Math.max(1, w * 0.05); ctx.strokeStyle = shade(base, -0.5); rr(x, y, w, h, w * 0.28); ctx.stroke();
    // side mirrors
    ctx.fillStyle = shade(base, -0.12);
    ctx.fillRect(x - Math.round(w * 0.05), y + Math.round(h * 0.3), Math.round(w * 0.07), Math.round(h * 0.045));
    ctx.fillRect(x + w - Math.round(w * 0.02), y + Math.round(h * 0.3), Math.round(w * 0.07), Math.round(h * 0.045));
    // roof highlight (centre band)
    ctx.fillStyle = shade(base, 0.24); rr(x + w * 0.2, y + h * 0.37, w * 0.6, h * 0.26, w * 0.12); ctx.fill();
    // glass: windshield + rear window
    ctx.fillStyle = "#0f1320";
    rr(x + w * 0.17, y + h * 0.16, w * 0.66, h * 0.16, w * 0.09); ctx.fill();
    rr(x + w * 0.17, y + h * 0.67, w * 0.66, h * 0.14, w * 0.09); ctx.fill();
    // headlights (front) + taillights (rear)
    ctx.fillStyle = "#fff6cf";
    rr(x + w * 0.15, y + h * 0.035, w * 0.2, h * 0.045, 2); ctx.fill();
    rr(x + w * 0.65, y + h * 0.035, w * 0.2, h * 0.045, 2); ctx.fill();
    ctx.fillStyle = "#ff3b3b";
    rr(x + w * 0.15, y + h * 0.92, w * 0.2, h * 0.045, 2); ctx.fill();
    rr(x + w * 0.65, y + h * 0.92, w * 0.2, h * 0.045, 2); ctx.fill();
    // flashing turn signal (amber) on the side the car is merging toward
    if (signalDir && blinkOn) {
      ctx.fillStyle = "#ffb12e";
      var sx = signalDir < 0 ? x + w * 0.14 : x + w * 0.66;
      rr(sx, y + h * 0.02, w * 0.2, h * 0.06, 2); ctx.fill();
      rr(sx, y + h * 0.89, w * 0.2, h * 0.06, 2); ctx.fill();
    }
  }
  function drawTruck(x, y, w, h, base) {
    var cabH = h * 0.28, trY = y + h * 0.33, trH = h * 0.67;
    // trailer
    ctx.fillStyle = "#d7d8d2"; rr(x + w * 0.05, trY, w * 0.9, trH, w * 0.14); ctx.fill();
    ctx.lineWidth = Math.max(1, w * 0.045); ctx.strokeStyle = shade("#d7d8d2", -0.45); rr(x + w * 0.05, trY, w * 0.9, trH, w * 0.14); ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.16)"; ctx.lineWidth = 1;
    for (var i = 1; i < 8; i++) { var ly = Math.round(trY + trH * i / 8); ctx.beginPath(); ctx.moveTo(x + w * 0.08, ly); ctx.lineTo(x + w * 0.92, ly); ctx.stroke(); }
    ctx.fillStyle = "#ff3b3b"; rr(x + w * 0.12, y + h * 0.965, w * 0.18, h * 0.025, 2); ctx.fill(); rr(x + w * 0.7, y + h * 0.965, w * 0.18, h * 0.025, 2); ctx.fill();
    // cab
    ctx.fillStyle = bodyGradient(x + w * 0.06, w * 0.88, base); rr(x + w * 0.06, y, w * 0.88, cabH, w * 0.22); ctx.fill();
    ctx.lineWidth = Math.max(1, w * 0.05); ctx.strokeStyle = shade(base, -0.5); rr(x + w * 0.06, y, w * 0.88, cabH, w * 0.22); ctx.stroke();
    ctx.fillStyle = "#0f1320"; rr(x + w * 0.18, y + cabH * 0.52, w * 0.64, cabH * 0.36, w * 0.06); ctx.fill();
    ctx.fillStyle = "#fff6cf"; rr(x + w * 0.16, y + h * 0.008, w * 0.16, h * 0.022, 2); ctx.fill(); rr(x + w * 0.68, y + h * 0.008, w * 0.16, h * 0.022, 2); ctx.fill();
  }

  function glow(x, y, r, color) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }

  // Visual FX = the inverse of the shared "reduce motion" toggle. When ON we add
  // speed streaks + per-car motion blur; when OFF the scene is the crisp static one.
  function fxOn() { return !(window.RM_ON && window.RM_ON()); }
  // 0 at base speed → 1 at top speed; scales how strong the motion FX read.
  function speedFx() { return Math.max(0, Math.min(1, (speed - BASE_SPEED) / 420)); }
  function drawGhostBody(cx, cy, w, h, base, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = base;
    rr(Math.round(cx - w / 2), Math.round(cy - h / 2), w, h, w * 0.28); ctx.fill();
    ctx.restore();
  }
  // sideways motion-blur trail from a short position history — visible during AND
  // just after a lane change (a merging car, or your car moving left/right).
  // Stays empty/quiet when the car is just driving straight.
  function drawTrail(trail, w, h, base, active) {
    var n = trail.length;
    if (n < 2) return;
    var minx = Infinity, maxx = -Infinity;
    for (var i = 0; i < n; i++) { var x = trail[i].x; if (x < minx) minx = x; if (x > maxx) maxx = x; }
    // While the car is actively merging / changing lanes, always show the blur
    // (the eased start & end barely move, so a spread threshold would hide it).
    // Once the move ends, keep lingering only while the recent path still spans width.
    if (!active && maxx - minx < 2) return;
    var cy = trail[n - 1].y; // horizontal smear at the car's current height
    for (var j = 0; j < n - 1; j++) drawGhostBody(trail[j].x, cy, w, h, base, 0.34 * (j + 1) / n);
  }

  // ----- layout / sizing ---------------------------------------------
  var W = 0, H = 0, DPR = 1;
  var road = { x: 0, w: 0 };
  var laneW = 0, carW = 0, carH = 0, playerY = 0;

  function resize() {
    var maxW = stage.clientWidth || 400;
    var availH = Math.max(360, window.innerHeight - stage.getBoundingClientRect().top - 70);
    var h = Math.min(availH, maxW * 1.55);
    stage.style.height = h + "px";
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = maxW; H = h;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + "px"; cv.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.imageSmoothingEnabled = false;
    var shoulder = Math.max(10, W * 0.07);
    road.x = shoulder; road.w = W - shoulder * 2;
    laneW = road.w / LANES;
    carW = laneW * 0.62; carH = Math.min(carW * 1.9, H * 0.17);
    playerY = H - carH * 0.7 - 14;
    buildGrass(); buildStreaks();
    if (player) player.x = laneX(player.lane);
  }
  function laneX(i) { return road.x + laneW * (i + 0.5); }

  // ----- game state ---------------------------------------------------
  var mode = "day";
  var blinkOn = false; // shared turn-signal blink phase
  var player = { lane: 2, x: 0, trail: [] };
  var obstacles = [];               // {lane, y, w, h, type, color}
  var speed = 0, score = 0, scroll = 0, running = false, lastMilestone = 0;
  var corridorLane = 2, waveAcc = 0;

  var BASE_SPEED = 320;
  var F = 0.6;                       // every car falls at this fraction of your speed → you blow past them
  var JIT = 0;                       // vertical scatter within a wave (set from carH in reset)
  function curSpeed() { return BASE_SPEED + Math.min(score * 0.32, 420); } // gentler difficulty ramp
  function waveGap() { return carH * 3.2; }                              // base vertical spacing between waves
  function fillProb() { return Math.min(0.62, 0.46 + score * 0.0002); }  // chance each non-corridor lane gets a car

  function reset() {
    obstacles = []; speed = BASE_SPEED; score = 0; scroll = 0; lastMilestone = 0;
    player.lane = 2; player.x = laneX(2); player.trail = [];
    // start on an EMPTY road in the middle; traffic streams in from the top.
    // waveAcc primed so the first wave appears immediately at the top edge.
    corridorLane = 2; waveAcc = waveGap(); JIT = carH * 0.65;
  }

  // ----- traffic generation ------------------------------------------
  // Cars are generated in WAVES descending from the top, all at the SAME speed —
  // so same-lane cars keep their spacing and never rear-end, and the pattern
  // stays coherent as it scrolls. Each wave keeps one "corridor" lane open, and
  // the corridor only steps by ≤1 lane between waves, so the open lanes form a
  // continuous drivable diagonal: NO dead ends. The corridor random-walks across
  // ALL five lanes (no middle bias); each non-corridor lane fills only with some
  // probability and every car gets a little vertical scatter, so the traffic
  // looks natural instead of a robotic row of three abreast.
  // A committed merge reserves BOTH its current lane and its target lane (mergeTo),
  // so spacing/clearance checks treat it as occupying both for its whole descent.
  function laneTopEdge(l) { // top edge of the highest vehicle that occupies lane l
    var t = Infinity;
    for (var i = 0; i < obstacles.length; i++) { var o = obstacles[i]; if (o.lane === l || o.mergeTo === l) t = Math.min(t, o.y - o.h / 2); }
    return t;
  }
  function laneClearAround(self, l) { // is lane l free of other vehicles near self's y?
    for (var i = 0; i < obstacles.length; i++) {
      var p = obstacles[i]; if (p === self) continue;
      if ((p.lane === l || p.mergeTo === l) && Math.abs(p.y - self.y) < (self.h + p.h) / 2 + carH * 0.5) return false;
    }
    return true;
  }
  function makeVehicle(l) {
    var truck = Math.random() < TRUCK_PROB;
    var h = truck ? carH * TRUCK_LEN : carH;
    var w = truck ? carW * 0.98 : carW;
    var yNew = -h / 2 - Math.random() * JIT; // enters from the top, with vertical scatter
    // height-aware room check: never overlap the vehicle ahead in this lane
    if (laneTopEdge(l) - (yNew + h / 2) < carH * 0.5) return null;
    var o = { lane: l, y: yNew, w: w, h: h, type: truck ? "truck" : "car",
              color: CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0],
              cx: laneX(l), trail: [], pending: false, merging: false, mergeDir: 0, mergeTo: -1, mergeStartY: 0, wc: corridorLane };
    obstacles.push(o);
    return o;
  }
  // Commit a merge ONLY if the target lane is a non-corridor lane and is clear
  // right now. Because all cars share one speed, "clear now" stays clear, and we
  // reserve the target via mergeTo so nothing spawns into it — so a committed
  // merge ALWAYS executes. The signal is only ever lit for such a valid merge.
  function tryAssignMerge(o) {
    var dirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];
    for (var k = 0; k < 2; k++) {
      var dir = dirs[k], tl = o.lane + dir;
      if (tl < 0 || tl >= LANES || tl === o.wc) continue;     // never into the corridor lane
      if (!laneClearAround(o, tl)) continue;                  // target spot must be open
      o.mergeTo = tl; o.mergeDir = dir; o.pending = true;     // committed → will merge
      return;
    }
  }
  function spawnWave() {
    var pf = fillProb(), start = obstacles.length;
    for (var l = 0; l < LANES; l++) { if (l === corridorLane) continue; if (Math.random() > pf) continue; makeVehicle(l); }
    // after the whole wave exists, let some cars commit to a (validated) merge
    for (var i = start; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (o.type === "car" && Math.random() < MERGE_PROB) tryAssignMerge(o);
    }
  }
  function roamCorridor() {
    corridorLane = Math.max(0, Math.min(LANES - 1, corridorLane + ((Math.random() * 3) | 0) - 1));
  }
  function newWave() { roamCorridor(); spawnWave(); }

  // ----- input --------------------------------------------------------
  function move(dir) {
    if (!running) return;
    var n = Math.max(0, Math.min(LANES - 1, player.lane + dir));
    if (n !== player.lane) { player.lane = n; SND.lane(); }
  }
  document.addEventListener("keydown", function (e) {
    if (ov.classList.contains("show")) {
      if (e.key === "Enter" || e.key === " ") { var b = card.querySelector(".btn"); if (b) { e.preventDefault(); b.click(); } }
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); move(-1); }
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); move(1); }
  });
  cv.addEventListener("pointerdown", function (e) {
    if (!running) return;
    var r = cv.getBoundingClientRect();
    move(e.clientX - r.left < r.width / 2 ? -1 : 1);
  });

  // ----- collision ----------------------------------------------------
  function hit(o) {
    return Math.abs(player.x - o.cx) < (carW + o.w) / 2 - carW * 0.16 &&
           Math.abs(playerY - o.y) < (carH + o.h) / 2 - carH * 0.14;
  }

  // ----- loop ---------------------------------------------------------
  var lastT = 0, raf = 0;
  // Pause (P / Esc / tab-switch). lastT is reset on resume so the clamped
  // dt doesn't teleport the car forward by the paused duration.
  var PAUSE = window.GameShell
    ? GameShell.pausable({
        canPause: function () { return !!running; },
        onChange: function (paused) { if (!paused) lastT = 0; }
      })
    : { isPaused: function () { return false; } };
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!running) { return; }
    if (PAUSE.isPaused()) { lastT = now; return; }
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;

    speed = curSpeed();
    score += speed * dt * 0.05;
    scroll = (scroll + speed * dt) % 5800; // 5800 = 100·58 = 29·200 → seamless dashes & grass

    var tx = laneX(player.lane);
    player.x += (tx - player.x) * Math.min(1, dt * 20); // snappy lane changes
    player.trail.push({ x: player.x, y: playerY }); if (player.trail.length > 7) player.trail.shift();

    // generate a new wave every fixed vertical interval
    waveAcc += speed * F * dt;
    if (waveAcc >= waveGap()) { waveAcc -= waveGap(); newWave(); }

    var mStart = H * 0.42, mSpan = H * 0.2; // merge starts ~42% down, completes ~62% (≈2/3) — time to react
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var o = obstacles[i];
      o.y += speed * F * dt; // uniform descent (< player) → you overtake everyone
      if (o.y - o.h / 2 > H) { obstacles.splice(i, 1); continue; }
      // committed merge: glide from the current lane into the (reserved) target,
      // completing ~2/3 down. It was pre-validated, so it always executes safely.
      if (o.mergeTo >= 0 && !o.merging && o.y >= mStart) { o.merging = true; o.mergeStartY = o.y; }
      if (o.merging) {
        var t = Math.min(1, (o.y - o.mergeStartY) / mSpan);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease in-out
        o.cx = laneX(o.lane) + (laneX(o.mergeTo) - laneX(o.lane)) * e;
        if (t >= 1) { o.lane = o.mergeTo; o.mergeTo = -1; o.merging = false; o.pending = false; o.cx = laneX(o.lane); }
      } else {
        o.cx = laneX(o.lane);
      }
      o.trail.push({ x: o.cx, y: o.y }); if (o.trail.length > 7) o.trail.shift();
      if (hit(o)) { gameOver(); break; }
    }

    if (Math.floor(score / 500) > lastMilestone) { lastMilestone = Math.floor(score / 500); SND.tick(); }

    render();
    elDist.textContent = Math.floor(score);
    elSpeed.textContent = Math.round(speed / 3.4);
  }

  // ----- render -------------------------------------------------------
  var grassSpeck = null, GRASS_PERIOD = 200;
  function buildGrass() {
    grassSpeck = [];
    for (var i = 0; i < 64; i++) grassSpeck.push({ side: Math.random() < 0.5 ? 0 : 1, x: Math.random(), y: Math.random() * GRASS_PERIOD, s: Math.random() < 0.5 ? 0 : 1, sz: 3 + (Math.random() * 4 | 0) });
  }
  var streaks = null, STREAK_PERIOD = 300;
  function buildStreaks() {
    streaks = [];
    for (var i = 0; i < 26; i++) streaks.push({ x: road.x + Math.random() * road.w, len: 36 + Math.random() * 70, a: 0.5 + Math.random() * 0.5, ph: Math.random() * STREAK_PERIOD });
  }
  function drawSpeedStreaks() { // thin vertical streaks rushing past → sense of speed (Visual FX on)
    if (!streaks) buildStreaks();
    var sf = speedFx(), off = (scroll * 1.6) % STREAK_PERIOD, night = mode === "night";
    for (var i = 0; i < streaks.length; i++) {
      var s = streaks[i], len = s.len * (0.6 + 0.9 * sf), al = (0.04 + 0.09 * sf) * s.a * (night ? 0.7 : 1);
      ctx.fillStyle = "rgba(255,255,255," + al.toFixed(3) + ")";
      for (var y = (s.ph + off) % STREAK_PERIOD - STREAK_PERIOD; y < H; y += STREAK_PERIOD) ctx.fillRect(Math.round(s.x), Math.round(y), 2, len);
    }
  }
  function drawRoad() {
    var night = mode === "night", rightW = W - (road.x + road.w);
    // grass shoulders
    ctx.fillStyle = night ? "#1b2a16" : "#5f8f3e";
    ctx.fillRect(0, 0, road.x, H); ctx.fillRect(road.x + road.w, 0, rightW, H);
    if (!grassSpeck) buildGrass();
    var off = scroll % GRASS_PERIOD;
    for (var i = 0; i < grassSpeck.length; i++) {
      var sp = grassSpeck[i];
      var gx = sp.side === 0 ? Math.round(sp.x * (road.x - sp.sz)) : Math.round(road.x + road.w + sp.x * (rightW - sp.sz));
      ctx.fillStyle = night ? (sp.s ? "#14210f" : "#223018") : (sp.s ? "#4e7c31" : "#6fa148");
      for (var yy = (sp.y + off) % GRASS_PERIOD - GRASS_PERIOD; yy < H; yy += GRASS_PERIOD) ctx.fillRect(gx, Math.round(yy), sp.sz, sp.sz);
    }
    // road: subtle per-lane shading
    for (var l = 0; l < LANES; l++) {
      ctx.fillStyle = night ? (l % 2 ? "#14151b" : "#181922") : (l % 2 ? "#8b8d94" : "#92949b");
      ctx.fillRect(Math.round(road.x + laneW * l), 0, Math.ceil(laneW) + 1, H);
    }
    // solid white edge lines
    ctx.fillStyle = night ? "#3a3a30" : "#eceadc";
    ctx.fillRect(road.x - 4, 0, 4, H); ctx.fillRect(road.x + road.w, 0, 4, H);
    // dashed lane dividers (scrolling)
    ctx.fillStyle = night ? "#34343f" : "#eceadc";
    var dashH = 30, period = 58;
    for (var l2 = 1; l2 < LANES; l2++) {
      var lx = Math.round(road.x + laneW * l2 - 3);
      for (var y = (scroll % period) - period; y < H; y += period) ctx.fillRect(lx, Math.round(y), 5, dashH);
    }
  }
  function render() {
    blinkOn = (Math.floor(performance.now() / 270) % 2) === 0;
    drawRoad();
    var fx = fxOn();
    if (fx) drawSpeedStreaks();
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      if (fx) drawTrail(o.trail, o.w, o.h, o.color, o.merging); // blur through the whole merge
      drawVehicleAt(o.cx, o.y, o.w, o.h, o.type, o.color, (o.pending && o.y >= H * 0.12) ? o.mergeDir : 0);
    }
    if (fx) drawTrail(player.trail, carW, carH, PLAYER_BASE, Math.abs(player.x - laneX(player.lane)) > 0.5); // blur through the lane change
    drawVehicleAt(player.x, playerY, carW, carH, "car", PLAYER_BASE, 0);

    if (mode === "night") {
      // darkness with a headlight wash in front of the player
      var bx = player.x, by = playerY - carH * 0.8;
      ctx.save();
      ctx.translate(bx, by); ctx.scale(1.15, 2.0);
      var R = Math.max(W, H) * 0.42;
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, "rgba(5,5,12,0)");
      g.addColorStop(0.5, "rgba(5,5,12,0.32)");
      g.addColorStop(0.8, "rgba(5,5,12,0.86)");
      g.addColorStop(1, "rgba(5,5,12,0.97)");
      ctx.fillStyle = g; ctx.fillRect(-W * 2, -H * 2, W * 4, H * 4);
      ctx.restore();

      // lights punch through the dark (other vehicles visible only by their lamps)
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (var j = 0; j < obstacles.length; j++) {
        var v = obstacles[j], ox = v.cx, oy = v.y, hw = v.w * 0.28, hh = v.h * 0.42;
        glow(ox - hw, oy + hh, v.w * 0.62, "rgba(255,70,70,0.85)");
        glow(ox + hw, oy + hh, v.w * 0.62, "rgba(255,70,70,0.85)");
        glow(ox - hw, oy - hh, v.w * 0.42, "rgba(255,240,200,0.45)");
        glow(ox + hw, oy - hh, v.w * 0.42, "rgba(255,240,200,0.45)");
        if (v.pending && v.y >= H * 0.12 && blinkOn) { var sgx = ox + v.mergeDir * hw; glow(sgx, oy - hh, v.w * 0.5, "rgba(255,175,45,0.95)"); glow(sgx, oy + hh, v.w * 0.5, "rgba(255,175,45,0.95)"); }
      }
      glow(player.x - carW * 0.28, playerY - carH * 0.46, carW * 0.95, "rgba(255,245,210,0.95)");
      glow(player.x + carW * 0.28, playerY - carH * 0.46, carW * 0.95, "rgba(255,245,210,0.95)");
      glow(player.x - carW * 0.28, playerY + carH * 0.42, carW * 0.5, "rgba(255,70,70,0.8)");
      glow(player.x + carW * 0.28, playerY + carH * 0.42, carW * 0.5, "rgba(255,70,70,0.8)");
      ctx.restore();
    }
  }

  // ----- flow ---------------------------------------------------------
  function renderBest() { elBest.textContent = String(parseInt(load(bestKey()), 10) || 0); }

  function start(m) {
    mode = m;
    ac();
    reset();
    running = true;
    ov.classList.remove("show");
    elDist.textContent = "0"; elSpeed.textContent = "0";
    renderBest();
    lastT = performance.now();
  }

  function gameOver() {
    running = false;
    crashSound();
    var d = Math.floor(score);
    var best = parseInt(load(bestKey()), 10) || 0;
    var record = d > best;
    if (record) { best = d; save(bestKey(), best); }
    renderBest();
    render();
    card.innerHTML =
      '<h2>CRASH!</h2>' +
      '<div class="big">' + d + '<small> M</small></div>' +
      '<p style="font-weight:800;color:' + (record ? 'var(--good)' : 'var(--muted)') + ';margin-top:0;">' +
        (record ? '★ NEW BEST!' : 'best ' + best + ' m') + '</p>' +
      '<p style="font-size:0.8rem;">' + (mode === "night" ? '🌙 night' : '☀️ day') + ' run</p>' +
      '<button class="btn" id="btn-again">Drive again</button>' +
      '<br><button class="btn ghost" id="btn-menu">Change mode</button>';
    ov.classList.add("show");
    $("btn-again").addEventListener("click", function () { start(mode); });
    $("btn-menu").addEventListener("click", showMenu);
  }

  function showMenu() {
    running = false;
    var bd = parseInt(load(BEST_DAY), 10) || 0;
    var bn = parseInt(load(BEST_NIGHT), 10) || 0;
    mode = "day"; render(); // draw a lit preview behind the card
    card.innerHTML =
      '<h2>RUSH HOUR</h2>' +
      '<p>You\'re the fast one. Slice through ' + LANES + ' lanes of slower traffic and rack up distance.</p>' +
      '<ul class="rules">' +
        '<li>← → or <b>A / D</b> to change lanes (tap left/right on mobile).</li>' +
        '<li>Traffic moves at highway speed — you overtake it. The further you go, the faster it gets.</li>' +
        '<li>One crash ends the run. Distance is your score.</li>' +
      '</ul>' +
      '<div class="modes">' +
        '<button class="mode-btn" id="m-day"><span class="ic">☀️</span><span class="t">DAY</span><div class="b">' + (bd ? 'best ' + bd : '') + '</div></button>' +
        '<button class="mode-btn" id="m-night"><span class="ic">🌙</span><span class="t">NIGHT</span><div class="b">' + (bn ? 'best ' + bn : '') + '</div></button>' +
      '</div>' +
      '<p style="font-size:0.78rem;margin-top:0.7rem;">night = only your headlights light the road 🔦</p>';
    ov.classList.add("show");
    $("m-day").addEventListener("click", function () { start("day"); });
    $("m-night").addEventListener("click", function () { start("night"); });
  }

  // ----- boot ---------------------------------------------------------
  window.addEventListener("resize", function () { resize(); if (!running) render(); });
  resize();
  raf = requestAnimationFrame(frame);
  showMenu();
})();
