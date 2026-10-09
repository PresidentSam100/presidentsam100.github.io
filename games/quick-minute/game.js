(function () {
  "use strict";

  var LANES = 5;
  var BEST_DAY = "rushhour_best_day";
  var BEST_NIGHT = "rushhour_best_night";

  var $ = function (id) { return document.getElementById(id); };
  var stage = $("stage"), cv = $("cv"), ctx = cv.getContext("2d");
  var ov = $("overlay"), card = $("card");
  var elDist = $("value-dist"), elSpeed = $("value-speed"), elBest = $("value-best");
  var elMile = $("milestone");

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

  // ----- palette helpers -----------------------------------------------
  var CAR_COLORS = ["#b5392f", "#2f6fb0", "#26456e", "#e7e8e2", "#bcc0c6", "#868a91", "#2a2e35"];
  var PLAYER_BASE = "#39b6ff";
  var TRUCK_PROB = 0.1;
  var TRUCK_LEN = 1.8;   // truck length as a multiple of a car (kept short enough to stay fair)
  var MERGE_PROB = 0.2;  // chance a car will signal and change lanes on the way down

  var rgbCache = {};
  function rgbOf(col) { // "#rrggbb" or "rgb(r,g,b)" — shade/mix results chain
    var c = rgbCache[col];
    if (!c) {
      if (col.charAt(0) === "#") {
        var n = parseInt(col.slice(1), 16);
        c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      } else {
        var m = /rgb\((\d+),(\d+),(\d+)\)/.exec(col);
        c = m ? [+m[1], +m[2], +m[3]] : [0, 0, 0];
      }
      rgbCache[col] = c;
    }
    return c;
  }
  function shade(hex, amt) { // amt<0 → darker, amt>0 → lighter
    var c = rgbOf(hex), t = amt < 0 ? 0 : 255, a = Math.abs(amt);
    return "rgb(" + Math.round(c[0] + (t - c[0]) * a) + "," + Math.round(c[1] + (t - c[1]) * a) + "," + Math.round(c[2] + (t - c[2]) * a) + ")";
  }
  function mix(hexA, hexB, t) { // blend two hex colours
    var a = rgbOf(hexA), b = rgbOf(hexB);
    return "rgb(" + Math.round(a[0] + (b[0] - a[0]) * t) + "," + Math.round(a[1] + (b[1] - a[1]) * t) + "," + Math.round(a[2] + (b[2] - a[2]) * t) + ")";
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // Visual FX = the inverse of the shared "reduce motion" toggle. When ON the
  // camera lives: banking, angle changes, the menu orbit, speed sway. When OFF
  // it stays locked to the plain chase view.
  function fxOn() { return !(window.RM_ON && window.RM_ON()); }
  function speedFx() { return Math.max(0, Math.min(1, (speed - BASE_SPEED) / 420)); }

  // ----- gameplay space --------------------------------------------------
  // Gameplay runs in a FIXED virtual top-down space (identical on every
  // screen); only the camera projection below touches the real canvas.
  var VW = 420, VH = 640;
  var road = { x: 30, w: 360 };
  var laneW = road.w / LANES;              // 72
  var carW = laneW * 0.62;                 // ~44.6
  var carH = carW * 1.9;                   // ~84.8
  var playerY = VH - carH * 0.7 - 14;      // ~566
  var K = 0.05;                            // metres per virtual pixel
  function laneX(i) { return road.x + laneW * (i + 0.5); }
  function wx(vx) { return (vx - VW / 2) * K; }         // virtual x → world metres
  function wz(vy) { return (playerY - vy) * K; }        // virtual y → metres ahead
  var LANE_M = laneW * K;                  // 3.6 m
  var ROAD_HALF = (road.w / 2) * K;        // 9 m
  var CAR_WM = carW * K, CAR_LM = carH * K;

  // ----- canvas sizing ---------------------------------------------------
  var W = 0, H = 0, DPR = 1, CX = 0, CY = 0, FOCAL = 0;
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
    CX = W / 2; CY = H * 0.46;
    FOCAL = Math.max(W * 0.95, H * 0.62);
  }

  // ----- game state ---------------------------------------------------
  var mode = "day";
  var blinkOn = false; // shared turn-signal blink phase
  var player = { lane: 2, x: 0 };
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
    player.lane = 2; player.x = laneX(2);
    corridorLane = 2; waveAcc = waveGap(); JIT = carH * 0.65;
    camPresetIdx = 0; camFrom = null; camT = 1; shakeT = 0;
  }

  // ----- traffic generation (unchanged rules, virtual space) ------------
  // Cars are generated in WAVES descending from the top, all at the SAME speed —
  // so same-lane cars keep their spacing and never rear-end. Each wave keeps one
  // "corridor" lane open and the corridor only steps by ≤1 lane between waves,
  // so the open lanes form a continuous drivable diagonal: NO dead ends.
  function laneTopEdge(l) {
    var t = Infinity;
    for (var i = 0; i < obstacles.length; i++) { var o = obstacles[i]; if (o.lane === l || o.mergeTo === l) t = Math.min(t, o.y - o.h / 2); }
    return t;
  }
  function laneClearAround(self, l) {
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
    var yNew = -h / 2 - Math.random() * JIT;
    if (laneTopEdge(l) - (yNew + h / 2) < carH * 0.5) return null;
    var o = { lane: l, y: yNew, w: w, h: h, type: truck ? "truck" : "car",
              color: CAR_COLORS[(Math.random() * CAR_COLORS.length) | 0],
              cx: laneX(l), pending: false, merging: false, mergeDir: 0, mergeTo: -1, mergeStartY: 0, wc: corridorLane };
    obstacles.push(o);
    return o;
  }
  function tryAssignMerge(o) {
    var dirs = Math.random() < 0.5 ? [-1, 1] : [1, -1];
    for (var k = 0; k < 2; k++) {
      var dir = dirs[k], tl = o.lane + dir;
      if (tl < 0 || tl >= LANES || tl === o.wc) continue;
      if (!laneClearAround(o, tl)) continue;
      o.mergeTo = tl; o.mergeDir = dir; o.pending = true;
      return;
    }
  }
  function spawnWave() {
    var pf = fillProb(), start = obstacles.length;
    for (var l = 0; l < LANES; l++) { if (l === corridorLane) continue; if (Math.random() > pf) continue; makeVehicle(l); }
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
    if (!running || PAUSE.isPaused()) return;   // paused: the traffic's frozen, so no picking a lane against it
    var n = Math.max(0, Math.min(LANES - 1, player.lane + dir));
    if (n !== player.lane) { player.lane = n; SND.lane(); }
  }
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;   // browser shortcuts (Ctrl+P, Ctrl+S, Alt+←…) aren't game keys
    if (ov.classList.contains("show")) {
      if (e.key === "Enter" || e.key === " ") { var b = card.querySelector(".btn"); if (b) { e.preventDefault(); b.click(); } }
      // the crash card: Backspace goes back to the modes (Change mode); Esc
      // isn't claimed, so it leaves for the games page
      else if (e.key === "Backspace" && !e.repeat) { var m = $("btn-menu"); if (m) { e.preventDefault(); m.click(); } }
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") { e.preventDefault(); if (!e.repeat) move(-1); }
    else if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") { e.preventDefault(); if (!e.repeat) move(1); }
  });
  cv.addEventListener("pointerdown", function (e) {
    if (!running) return;
    var r = cv.getBoundingClientRect();
    move(e.clientX - r.left < r.width / 2 ? -1 : 1);
  });

  // ----- collision ------------------------------------------------------
  function hit(o) {
    return Math.abs(player.x - o.cx) < (carW + o.w) / 2 - carW * 0.16 &&
           Math.abs(playerY - o.y) < (carH + o.h) / 2 - carH * 0.14;
  }

  // ============================ 3D CAMERA ================================
  // A tiny pipeline: world (metres; x lateral, y up, z ahead of the player)
  // → camera space (yaw → pitch → roll) → near-plane clip → perspective.
  var cam = { ex: 0, ey: 4.6, ez: -7.5, yaw: 0, pitch: 0.34, roll: 0 };
  var NEAR = 0.28;
  var cyw = 1, syw = 0, cpt = 1, spt = 0, crl = 1, srl = 0;
  function camReady() {
    cyw = Math.cos(cam.yaw); syw = Math.sin(cam.yaw);
    cpt = Math.cos(cam.pitch); spt = Math.sin(cam.pitch);
    crl = Math.cos(cam.roll); srl = Math.sin(cam.roll);
  }
  function camSpace(x, y, z) {
    var dx = x - cam.ex, dy = y - cam.ey, dz = z - cam.ez;
    var x1 = dx * cyw - dz * syw, z1 = dx * syw + dz * cyw;   // yaw
    var y2 = dy * cpt + z1 * spt, z2 = -dy * spt + z1 * cpt;  // pitch (＋ looks down)
    return { x: x1 * crl - y2 * srl, y: x1 * srl + y2 * crl, z: z2 };
  }
  function toScreen(p) { return { x: CX + FOCAL * p.x / p.z, y: CY - FOCAL * p.y / p.z }; }
  // Sutherland–Hodgman against the z=NEAR plane, in camera space.
  function clipNear(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var ain = a.z >= NEAR, bin = b.z >= NEAR;
      if (ain) out.push(a);
      if (ain !== bin) {
        var t = (NEAR - a.z) / (b.z - a.z);
        out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: NEAR });
      }
    }
    return out;
  }
  // Fill a world-space polygon. pts = flat array [x,y,z, x,y,z, ...]
  function poly(pts, fill) {
    var cs = [];
    for (var i = 0; i < pts.length; i += 3) cs.push(camSpace(pts[i], pts[i + 1], pts[i + 2]));
    cs = clipNear(cs);
    if (cs.length < 3) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    var s0 = toScreen(cs[0]);
    ctx.moveTo(s0.x, s0.y);
    for (var j = 1; j < cs.length; j++) { var s = toScreen(cs[j]); ctx.lineTo(s.x, s.y); }
    ctx.closePath();
    ctx.fill();
  }
  // Distance haze toward the horizon colour — it also hides traffic spawning in.
  function fogAt(z) { return clamp01((z - 15) / 13); }
  function fogged(hex, z) { var f = fogAt(z); return f <= 0 ? hex : mix(hex, HAZE, f); }

  // An axis-aligned box: draws only the faces the eye can see, sun-shaded.
  // faceCols may override {top, front, back, left, right}.
  function box(x0, x1, y0, y1, z0, z1, base, faceCols) {
    var zc = (z0 + z1) / 2, fc = faceCols || {};
    function col(name, amt) { return fogged(fc[name] || shade(base, amt), zc); }
    if (cam.ey > y1) poly([x0, y1, z0, x1, y1, z0, x1, y1, z1, x0, y1, z1], col("top", NIGHT ? 0.06 : 0.2));
    if (cam.ez < z0) poly([x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0], col("front", NIGHT ? -0.5 : -0.26));
    if (cam.ez > z1) poly([x0, y0, z1, x1, y0, z1, x1, y1, z1, x0, y1, z1], col("back", NIGHT ? -0.4 : -0.06));
    if (cam.ex < x0) poly([x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0], col("left", NIGHT ? -0.46 : -0.16));
    if (cam.ex > x1) poly([x1, y0, z0, x1, y0, z1, x1, y1, z1, x1, y1, z0], col("right", NIGHT ? -0.52 : -0.4));
  }

  function glow(sx, sy, r, color) {
    var g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
    g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, r, 0, 6.2832); ctx.fill();
  }
  // project a world point; null when behind the near plane
  function pt(x, y, z) {
    var c = camSpace(x, y, z);
    if (c.z < NEAR) return null;
    var s = toScreen(c); s.z = c.z;
    return s;
  }
  // a far-away anchor for sun / moon / stars: eye + direction * 500
  function skyPt(dx, dy, dz) { return pt(cam.ex + dx * 500, cam.ey + dy * 500, cam.ez + dz * 500); }

  // ----- camera presets ---------------------------------------------------
  // Offsets are relative to an anchor that partially follows the player's
  // lateral position, so lane changes read as real sideways motion.
  var PRESETS = [
    { eye: [0, 4.6, -7.5], tgt: [0, 1.0, 7] },      // chase
    { eye: [4.6, 5.2, -6.8], tgt: [-0.6, 0.8, 7] }, // quarter right
    { eye: [0, 9.5, -10.5], tgt: [0, 0, 8] },       // high crane
    { eye: [-4.6, 5.2, -6.8], tgt: [0.6, 0.8, 7] }  // quarter left
  ];
  var camPresetIdx = 0, camFrom = null, camT = 1;
  var bank = 0, shakeT = 0, prevPX = 0;
  function smooth(t) { return t * t * (3 - 2 * t); }
  function lookAt(ex, ey, ez, tx, ty, tz) {
    cam.ex = ex; cam.ey = ey; cam.ez = ez;
    var dx = tx - ex, dy = ty - ey, dz = tz - ez;
    cam.yaw = Math.atan2(dx, dz);
    cam.pitch = Math.atan2(-dy, Math.hypot(dx, dz));
  }
  function setPreset(i) {
    if (i === camPresetIdx) return;
    camFrom = PRESETS[camPresetIdx];
    camPresetIdx = i;
    camT = 0;
  }
  function updateCamera(now, dt) {
    var px = wx(player.x);
    var anchor = px * 0.8;
    if (!running && fxOn()) {
      // cinematic orbit around the (possibly crashed) car on menu screens
      var th = now * 0.00021;
      lookAt(px + Math.sin(th) * 10.5, 4.4 + Math.sin(th * 0.6) * 1.4, -Math.cos(th) * 10.5,
             px, 0.9, 2.5);
      cam.roll = 0;
      camReady();
      return;
    }
    var p = fxOn() ? PRESETS[camPresetIdx] : PRESETS[0];
    var e = p.eye, t = p.tgt;
    if (fxOn() && camFrom && camT < 1) {
      camT = Math.min(1, camT + dt / 1.6);
      var s = smooth(camT), f0 = camFrom;
      e = [f0.eye[0] + (e[0] - f0.eye[0]) * s, f0.eye[1] + (e[1] - f0.eye[1]) * s, f0.eye[2] + (e[2] - f0.eye[2]) * s];
      t = [f0.tgt[0] + (t[0] - f0.tgt[0]) * s, f0.tgt[1] + (t[1] - f0.tgt[1]) * s, f0.tgt[2] + (t[2] - f0.tgt[2]) * s];
    }
    // speed sway + crash shake (Visual FX only)
    var swx = 0, swy = 0;
    if (fxOn() && running) {
      var sf = speedFx();
      swx = Math.sin(now * 0.0137) * 0.05 * sf;
      swy = Math.sin(now * 0.0171) * 0.04 * sf;
    }
    if (shakeT > 0) {
      shakeT = Math.max(0, shakeT - dt);
      if (fxOn()) { swx += (Math.random() - 0.5) * shakeT * 1.6; swy += (Math.random() - 0.5) * shakeT * 1.2; }
    }
    lookAt(anchor + e[0] + swx, e[1] + swy, e[2], anchor + t[0], t[1], t[2]);
    // banking: roll into the lane change, then settle
    var vx = dt > 0 ? (px - prevPX) / dt : 0;
    prevPX = px;
    var targetBank = fxOn() ? Math.max(-0.075, Math.min(0.075, vx * 0.012)) : 0;
    bank += (targetBank - bank) * Math.min(1, dt * 6);
    cam.roll = bank;
    camReady();
  }

  // ----- scenery ----------------------------------------------------------
  var NIGHT = false, HAZE = "#c7d2c3";
  // Night lighting: the scene below the horizon is buried under a heavy
  // darkness layer, and light sources punch soft holes through it — your
  // headlight corridor, the street-lamp pools, the glow around your own car.
  // Lamp glows and taillights are queued during drawing and rendered ON TOP
  // of the darkness, so lights are the only things that read at distance.
  var horizonY = 0, GLOWS = [], HOLES = [];
  var darkCv = null, darkCtx = null;
  function addGlow(x, y, r, c) { GLOWS.push({ x: x, y: y, r: r, c: c }); }
  function nightDarkness(pxw) {
    if (!darkCv) { darkCv = document.createElement("canvas"); darkCtx = darkCv.getContext("2d"); }
    if (darkCv.width !== cv.width || darkCv.height !== cv.height) { darkCv.width = cv.width; darkCv.height = cv.height; }
    var d = darkCtx;
    d.setTransform(DPR, 0, 0, DPR, 0, 0);
    d.globalCompositeOperation = "source-over";
    d.clearRect(0, 0, W, H);
    var top = Math.max(0, horizonY - 1);
    d.fillStyle = "rgba(3,4,11,0.86)";
    d.fillRect(0, top, W, H - top);
    d.globalCompositeOperation = "destination-out";
    function hole(x, y, r, a) {
      if (!(r > 1)) return;
      var g = d.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(0,0,0," + a + ")");
      g.addColorStop(0.55, "rgba(0,0,0," + (a * 0.7).toFixed(2) + ")");
      g.addColorStop(1, "rgba(0,0,0,0)");
      d.fillStyle = g;
      d.beginPath(); d.arc(x, y, r, 0, 6.2832); d.fill();
    }
    // the headlight corridor: pools of light marching up the beam
    var steps = [[2.6, 2.1, 0.98], [5.5, 2.7, 0.94], [9, 3.3, 0.82], [13, 3.9, 0.6], [17.5, 4.5, 0.36]];
    for (var i = 0; i < steps.length; i++) {
      var s = steps[i], p = pt(pxw, 0.04, s[0]);
      if (p) hole(p.x, p.y, FOCAL / p.z * s[1], s[2]);
    }
    // your own car stays readable (dash and lamp spill)
    var pc = pt(pxw, 0.7, 0);
    if (pc) hole(pc.x, pc.y, FOCAL / pc.z * 2.7, 0.82);
    for (i = 0; i < HOLES.length; i++) hole(HOLES[i].x, HOLES[i].y, HOLES[i].r, HOLES[i].a);
    d.globalCompositeOperation = "source-over";
    ctx.drawImage(darkCv, 0, 0, W, H);
  }
  var hills = [];
  (function buildHills() {
    for (var layer = 0; layer < 2; layer++) {
      var z = layer ? 40 : 46, seg = [];
      for (var x = -70; x <= 70; x += 10) {
        seg.push({ x: x, h: 3 + Math.abs(Math.sin(x * 0.11 + layer * 2.3)) * (layer ? 6 : 11) + Math.sin(x * 0.31 + layer) * 1.5 });
      }
      hills.push({ z: z, seg: seg });
    }
  })();
  var stars = [];
  (function buildStars() {
    for (var i = 0; i < 90; i++) {
      var a = Math.random() * Math.PI * 2, y = 0.08 + Math.random() * 0.85;
      var r = Math.sqrt(Math.max(0, 1 - y * y));
      stars.push({ x: Math.sin(a) * r, y: y, z: Math.cos(a) * r, s: Math.random() < 0.3 ? 2 : 1, a: 0.4 + Math.random() * 0.6 });
    }
  })();

  function drawSky() {
    var hz = pt(cam.ex + Math.sin(cam.yaw) * 400, 0, cam.ez + Math.cos(cam.yaw) * 400);
    var hy = hz ? Math.max(0, Math.min(H, hz.y)) : H * 0.4;
    horizonY = hy;
    var g = ctx.createLinearGradient(0, 0, 0, Math.max(hy, 1));
    if (NIGHT) { g.addColorStop(0, "#04050d"); g.addColorStop(1, "#111a31"); }
    else { g.addColorStop(0, "#7fbde4"); g.addColorStop(1, "#e6f0d2"); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, hy + 1);
    ctx.fillStyle = HAZE;
    ctx.fillRect(0, hy, W, H - hy);
    if (NIGHT) {
      for (var i = 0; i < stars.length; i++) {
        var st = stars[i], s = skyPt(st.x, st.y, st.z);
        if (!s || s.y > hy) continue;
        ctx.fillStyle = "rgba(230,236,255," + st.a + ")";
        ctx.fillRect(s.x, s.y, st.s, st.s);
      }
      var m = skyPt(-0.42, 0.5, 0.75);
      if (m) {
        glow(m.x, m.y, 46, "rgba(190,205,255,0.25)");
        ctx.fillStyle = "#e8ecf7"; ctx.beginPath(); ctx.arc(m.x, m.y, 15, 0, 6.2832); ctx.fill();
        ctx.fillStyle = "#c9d2e6"; ctx.beginPath(); ctx.arc(m.x - 4, m.y + 3, 3, 0, 6.2832);
        ctx.arc(m.x + 5, m.y - 4, 2.2, 0, 6.2832); ctx.fill();
      }
    } else {
      var s2 = skyPt(0.5, 0.42, 0.75);
      if (s2) {
        glow(s2.x, s2.y, 70, "rgba(255,244,190,0.55)");
        ctx.fillStyle = "#fff3c2"; ctx.beginPath(); ctx.arc(s2.x, s2.y, 20, 0, 6.2832); ctx.fill();
      }
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      var clouds = [[-0.55, 0.3, 0.7, 44], [0.2, 0.36, 0.8, 60], [0.75, 0.26, 0.55, 36]];
      for (var c = 0; c < clouds.length; c++) {
        var cd = clouds[c], cp = skyPt(cd[0], cd[1], cd[2]);
        if (!cp || cp.y > hy) continue;
        ctx.beginPath();
        ctx.ellipse(cp.x, cp.y, cd[3], cd[3] * 0.32, 0, 0, 6.2832);
        ctx.ellipse(cp.x - cd[3] * 0.55, cp.y + cd[3] * 0.1, cd[3] * 0.5, cd[3] * 0.2, 0, 0, 6.2832);
        ctx.ellipse(cp.x + cd[3] * 0.5, cp.y + cd[3] * 0.08, cd[3] * 0.55, cd[3] * 0.22, 0, 0, 6.2832);
        ctx.fill();
      }
    }
    // hills, mostly hazed
    for (var l = 0; l < hills.length; l++) {
      var hl = hills[l], base = NIGHT ? (l ? "#0d1424" : "#0a101d") : (l ? "#9dba8c" : "#b4c9a4");
      var fill = mix(base, HAZE, l ? 0.45 : 0.68);
      var pts = [];
      for (var k = 0; k < hl.seg.length; k++) pts.push(hl.seg[k].x, hl.seg[k].h, hl.z);
      pts.push(hl.seg[hl.seg.length - 1].x, 0, hl.z);
      pts.push(hl.seg[0].x, 0, hl.z);
      poly(pts, fill);
    }
  }

  function drawGround() {
    var ws = scroll * K;   // total metres scrolled
    var gA = NIGHT ? "#141f10" : "#5f8f3e", gB = NIGHT ? "#121c0e" : "#5a883a";
    var rA = NIGHT ? "#15161d" : "#8d8f96", rB = NIGHT ? "#16171f" : "#91939a";
    // ground + road in scroll-locked 2 m strips (banding = visible speed)
    var s0 = -16 - (ws % 2), z, idx, zf;
    // all grass first, then all road, so the strip overlaps never cross layers
    for (z = s0; z < 34; z += 2) {
      idx = Math.round((z + ws) / 2) & 1;
      zf = z + 2.07; // slight overlap so no seams show between strips
      poly([-70, 0, z, 70, 0, z, 70, 0, zf, -70, 0, zf], fogged(idx ? gA : gB, z + 1));
    }
    for (z = s0; z < 34; z += 2) {
      idx = Math.round((z + ws) / 2) & 1;
      zf = z + 2.07;
      poly([-ROAD_HALF, 0.01, z, ROAD_HALF, 0.01, z, ROAD_HALF, 0.01, zf, -ROAD_HALF, 0.01, zf], fogged(idx ? rA : rB, z + 1));
    }
    // solid edge lines
    var edge = NIGHT ? "#4a4a3e" : "#eceadc";
    for (z = s0; z < 34; z += 2) {
      var zf2 = z + 2.07, fe = fogged(edge, z + 1);
      poly([-ROAD_HALF, 0.02, z, -ROAD_HALF + 0.22, 0.02, z, -ROAD_HALF + 0.22, 0.02, zf2, -ROAD_HALF, 0.02, zf2], fe);
      poly([ROAD_HALF - 0.22, 0.02, z, ROAD_HALF, 0.02, z, ROAD_HALF, 0.02, zf2, ROAD_HALF - 0.22, 0.02, zf2], fe);
    }
    // dashed lane dividers
    var dash = NIGHT ? "#3f4034" : "#e8e6d8";
    var period = 58 * K, dlen = 30 * K;             // same rhythm as the old top-down road
    var d0 = -14 - (ws % period);
    for (var l = 1; l < LANES; l++) {
      var x = -ROAD_HALF + LANE_M * l;
      for (var dz = d0; dz < 34; dz += period) {
        poly([x - 0.07, 0.02, dz, x + 0.07, 0.02, dz, x + 0.07, 0.02, dz + dlen, x - 0.07, 0.02, dz + dlen], fogged(dash, dz));
      }
    }
  }

  function drawRoadside() {
    var ws = scroll * K;
    // trees on both shoulders (billboards on a real trunk position)
    var GAP = 8.5;
    var t0 = -12 - (ws % GAP);
    for (var z = t0; z < 32; z += GAP) {
      var idx = Math.round((z + ws) / GAP);
      for (var side = -1; side <= 1; side += 2) {
        if (((idx + (side > 0 ? 1 : 0)) & 1) === 0) continue;   // stagger the two sides
        var tx = side * (11.5 + ((idx * 7919) % 5));
        var s = pt(tx, 0, z);
        if (!s) continue;
        var sc = FOCAL / s.z, f = fogAt(z);
        var trunkH = 0.9 * sc, canopyR = (1.3 + ((idx * 31) % 3) * 0.25) * sc;
        ctx.fillStyle = mix(NIGHT ? "#191410" : "#6d4b2a", HAZE, f);
        ctx.fillRect(s.x - 0.09 * sc, s.y - trunkH, 0.18 * sc, trunkH);
        ctx.fillStyle = mix(NIGHT ? "#0d1a10" : "#3f7a33", HAZE, f);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y - trunkH - canopyR * 1.9);
        ctx.lineTo(s.x + canopyR, s.y - trunkH * 0.6);
        ctx.lineTo(s.x - canopyR, s.y - trunkH * 0.6);
        ctx.closePath();
        ctx.fill();
      }
    }
    if (NIGHT) {
      // street lamps along the road edge, with pools of light
      var LGAP = 13, l0 = -13 - (ws % LGAP);
      for (var lz = l0; lz < 30; lz += LGAP) {
        var lidx = Math.round((lz + ws) / LGAP);
        var side2 = (lidx & 1) ? -1 : 1;
        var lx = side2 * (ROAD_HALF + 0.7);
        poly([lx + side2 * 1.2, 0.03, lz - 2.6, lx - side2 * 3.2, 0.03, lz - 2.6, lx - side2 * 3.2, 0.03, lz + 2.6, lx + side2 * 1.2, 0.03, lz + 2.6],
             "rgba(255,214,140," + (0.22 * (1 - fogAt(lz))).toFixed(3) + ")");
        var base2 = pt(lx, 0, lz), head = pt(lx - side2 * 0.9, 4.4, lz);
        if (!base2 || !head) continue;
        ctx.strokeStyle = mix("#2a2d36", HAZE, fogAt(lz));
        ctx.lineWidth = Math.max(1, FOCAL / base2.z * 0.1);
        ctx.beginPath();
        ctx.moveTo(base2.x, base2.y);
        ctx.lineTo(base2.x, head.y - 6);
        ctx.lineTo(head.x, head.y);
        ctx.stroke();
        addGlow(head.x, head.y, Math.max(6, FOCAL / head.z * 0.9), "rgba(255,214,140,0.8)");
        // the lamp's pool of light punches through the darkness
        var pool = pt(lx - side2 * 1.1, 0.03, lz);
        if (pool) HOLES.push({ x: pool.x, y: pool.y, r: Math.max(8, FOCAL / pool.z * 3.4), a: 0.85 * (1 - fogAt(lz)) });
      }
    }
  }

  // ----- vehicles as 3D boxes ---------------------------------------------
  var GLASS = "#10141f";
  function drawCar3D(wxc, z, base, halfW, halfL, isTruck, signalDir, litT) {
    var body = base;
    // litT 1 = fully lit (your own car, or right inside your beam); 0 = darkness
    if (NIGHT) body = litT >= 1 ? mix(base, "#0a0f1c", 0.12) : mix(mix(base, "#070910", 0.72), base, clamp01(litT) * 0.75);
    var x0 = wxc - halfW, x1 = wxc + halfW, z0 = z - halfL, z1 = z + halfL;
    // dark under-skirt / wheels
    box(x0 + 0.06, x1 - 0.06, 0, 0.22, z0 + 0.12, z1 - 0.12, NIGHT ? "#05060a" : "#181a20");
    if (isTruck) {
      var cabZ0 = z1 - 1.7;
      box(x0, x1, 0.22, 1.55, cabZ0, z1, body);                                  // cab
      var trl = NIGHT ? mix("#d7d8d2", "#0a0c13", 0.6 - clamp01(litT) * 0.4) : "#d7d8d2";
      box(x0 + 0.04, x1 - 0.04, 0.22, 2.45, z0, cabZ0 - 0.25, trl);              // trailer
    } else {
      box(x0, x1, 0.22, 0.92, z0, z1, body);                                     // body
      box(x0 + 0.2, x1 - 0.2, 0.92, 1.42, z0 + halfL * 0.55, z1 - halfL * 0.62,  // cabin
          body, { front: GLASS, back: GLASS, left: shade(GLASS, 0.12), right: shade(GLASS, 0.12), top: foggedRoof(body, z) });
    }
    // taillights face the camera (everyone drives away from you)
    var ty = isTruck ? 0.8 : 0.6, tz = z0 - 0.02;
    var tc = fogged(NIGHT ? "#ff5a4a" : "#c22a22", z);
    poly([x0 + 0.16, ty - 0.1, tz, x0 + 0.55, ty - 0.1, tz, x0 + 0.55, ty + 0.1, tz, x0 + 0.16, ty + 0.1, tz], tc);
    poly([x1 - 0.55, ty - 0.1, tz, x1 - 0.16, ty - 0.1, tz, x1 - 0.16, ty + 0.1, tz, x1 - 0.55, ty + 0.1, tz], tc);
    // amber turn signal on the merging side, front + rear
    if (signalDir && blinkOn) {
      var sx0 = signalDir < 0 ? x0 - 0.02 : x1 - 0.24, sx1 = signalDir < 0 ? x0 + 0.24 : x1 + 0.02;
      var amber = "#ffb12e";
      poly([sx0, ty - 0.08, tz, sx1, ty - 0.08, tz, sx1, ty + 0.14, tz, sx0, ty + 0.14, tz], amber);
      poly([sx0, ty - 0.08, z1 + 0.02, sx1, ty - 0.08, z1 + 0.02, sx1, ty + 0.14, z1 + 0.02, sx0, ty + 0.14, z1 + 0.02], amber);
      if (NIGHT) { var sp2 = pt(signalDir < 0 ? x0 : x1, ty, z0); if (sp2) addGlow(sp2.x, sp2.y, Math.max(5, FOCAL / sp2.z * 0.5), "rgba(255,177,46,0.9)"); }
    }
  }
  function foggedRoof(body, z) { return fogged(shade(body, NIGHT ? 0.02 : 0.14), z); }

  function drawPlayer3D() {
    var pxw = wx(player.x);
    drawCar3D(pxw, 0, PLAYER_BASE, CAR_WM / 2, CAR_LM / 2, false, 0, 1);
    if (NIGHT) {
      // headlight beam on the tarmac ahead
      poly([pxw - 0.7, 0.03, CAR_LM / 2, pxw + 0.7, 0.03, CAR_LM / 2, pxw + 2.8, 0.03, 17, pxw - 2.8, 0.03, 17], "rgba(255,243,196,0.16)");
      poly([pxw - 0.5, 0.04, CAR_LM / 2, pxw + 0.5, 0.04, CAR_LM / 2, pxw + 1.6, 0.04, 12, pxw - 1.6, 0.04, 12], "rgba(255,243,196,0.20)");
      var h1 = pt(pxw - 0.6, 0.55, CAR_LM / 2), h2 = pt(pxw + 0.6, 0.55, CAR_LM / 2);
      if (h1) addGlow(h1.x, h1.y, Math.max(8, FOCAL / h1.z * 0.5), "rgba(255,246,205,0.9)");
      if (h2) addGlow(h2.x, h2.y, Math.max(8, FOCAL / h2.z * 0.5), "rgba(255,246,205,0.9)");
    }
  }

  // ----- render -------------------------------------------------------
  function render(now) {
    NIGHT = mode === "night";
    HAZE = NIGHT ? "#0b101c" : "#c7d2c3";
    // turn signals blink with Visual FX on; with it off they stay lit, steady
    blinkOn = !fxOn() || (Math.floor(now / 270) % 2) === 0;
    GLOWS = []; HOLES = [];
    ctx.clearRect(0, 0, W, H);
    drawSky();
    drawGround();
    drawRoadside();

    // painter's order: everything far → near, the player among them
    var list = [];
    for (var i = 0; i < obstacles.length; i++) {
      var o = obstacles[i];
      list.push({ z: wz(o.y), o: o });
    }
    list.push({ z: 0, player: true });
    list.sort(function (a, b) { return b.z - a.z; });
    var pxw = wx(player.x);
    for (var j = 0; j < list.length; j++) {
      var it = list[j];
      if (it.player) { drawPlayer3D(); continue; }
      var v = it.o, vwx = wx(v.cx);
      // at night your beam lights the cars just ahead of you
      var lit = NIGHT ? clamp01(1 - it.z / 19) * (Math.abs(vwx - pxw) < 3.4 ? 1 : 0.15) : 1;
      drawCar3D(vwx, it.z, v.color, (v.w * K) / 2, (v.h * K) / 2, v.type === "truck",
                (v.pending && v.y >= VH * 0.12) ? v.mergeDir : 0, lit);
      if (NIGHT) {
        var tl = pt(vwx - v.w * K * 0.3, 0.6, it.z - v.h * K / 2);
        var tr = pt(vwx + v.w * K * 0.3, 0.6, it.z - v.h * K / 2);
        var gr = 1 - fogAt(it.z);
        if (tl && gr > 0) addGlow(tl.x, tl.y, Math.max(4, FOCAL / tl.z * 0.42), "rgba(255,74,64," + (0.8 * gr).toFixed(2) + ")");
        if (tr && gr > 0) addGlow(tr.x, tr.y, Math.max(4, FOCAL / tr.z * 0.42), "rgba(255,74,64," + (0.8 * gr).toFixed(2) + ")");
      }
    }

    if (NIGHT) {
      nightDarkness(pxw);
      for (var g = 0; g < GLOWS.length; g++) glow(GLOWS[g].x, GLOWS[g].y, GLOWS[g].r, GLOWS[g].c);
    }
  }

  // ----- loop ---------------------------------------------------------
  var lastT = 0, raf = 0;
  var PAUSE = window.GameShell
    ? GameShell.pausable({
        canPause: function () { return !!running; },
        onChange: function (paused) { if (!paused) lastT = 0; }
      })
    : { isPaused: function () { return false; } };

  // The best is saved while the run passes it (at most four times a second),
  // not only at the crash, so closing the tab mid-run still keeps it.
  // runBest is the best as the run started, for "NEW BEST!"
  var runBest = 0, liveBest = 0, liveSavedAt = -1e9;
  function update(dt) {
    speed = curSpeed();
    score += speed * dt * 0.05;
    var whole = Math.floor(score), nowMs = performance.now();
    if (whole > liveBest && nowMs - liveSavedAt >= 250) { liveBest = whole; liveSavedAt = nowMs; save(bestKey(), whole); }
    scroll = (scroll + speed * dt) % 116000; // 116000·K = 5800 m → seamless for every scenery period

    var tx = laneX(player.lane);
    player.x += (tx - player.x) * Math.min(1, dt * 20); // snappy lane changes

    waveAcc += speed * F * dt;
    if (waveAcc >= waveGap()) { waveAcc -= waveGap(); newWave(); }

    var mStart = VH * 0.42, mSpan = VH * 0.2; // merge starts ~42% down, completes ~62% — time to react
    for (var i = obstacles.length - 1; i >= 0; i--) {
      var o = obstacles[i];
      o.y += speed * F * dt;
      if (o.y - o.h / 2 > VH + 170) { obstacles.splice(i, 1); continue; } // well behind every camera angle
      if (o.mergeTo >= 0 && !o.merging && o.y >= mStart) { o.merging = true; o.mergeStartY = o.y; }
      if (o.merging) {
        var t = Math.min(1, (o.y - o.mergeStartY) / mSpan);
        var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        o.cx = laneX(o.lane) + (laneX(o.mergeTo) - laneX(o.lane)) * e;
        if (t >= 1) { o.lane = o.mergeTo; o.mergeTo = -1; o.merging = false; o.pending = false; o.cx = laneX(o.lane); }
      } else {
        o.cx = laneX(o.lane);
      }
      if (hit(o)) { gameOver(); break; }
    }

    if (Math.floor(score / 500) > lastMilestone) {
      lastMilestone = Math.floor(score / 500);
      SND.tick();
      showMilestone(lastMilestone);
      // a new camera angle for every 500 m milestone (Visual FX on)
      if (fxOn()) setPreset(lastMilestone % PRESETS.length);
    }

    elDist.textContent = Math.floor(score);
    elSpeed.textContent = Math.round(speed / 3.4);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (PAUSE.isPaused()) { lastT = now; return; } // freeze the scene behind the pause veil
    var dt = Math.min(0.05, (now - lastT) / 1000 || 0); lastT = now;
    if (running) update(dt);
    updateCamera(now, dt);
    render(now);
  }

  // ----- flow ---------------------------------------------------------
  function renderBest() { elBest.textContent = String(parseInt(load(bestKey()), 10) || 0); }

  // Event cues that hold still in both modes, cleared by timers (not
  // animationend, which never fires with Visual FX off): a banner for each
  // 500 m milestone, and a red rim on the road for a moment after a crash.
  var mileTimer = 0, crashTimer = 0;
  function showMilestone(n) {
    elMile.textContent = (n * 500) + " M";
    elMile.classList.add("show");
    clearTimeout(mileTimer);
    mileTimer = setTimeout(function () { elMile.classList.remove("show"); }, 1200);
  }
  function clearCues() {
    clearTimeout(mileTimer); clearTimeout(crashTimer);
    elMile.classList.remove("show"); stage.classList.remove("crash");
  }

  function start(m) {
    mode = m;
    ac();
    reset();
    clearCues();
    running = true;
    ov.classList.remove("show");
    elDist.textContent = "0"; elSpeed.textContent = "0";
    renderBest();
    runBest = liveBest = parseInt(load(bestKey()), 10) || 0; liveSavedAt = -1e9;
    lastT = 0;
  }

  function gameOver() {
    running = false;
    shakeT = 0.55;
    stage.classList.add("crash");
    clearTimeout(crashTimer);
    crashTimer = setTimeout(function () { stage.classList.remove("crash"); }, 600);
    crashSound();
    var d = Math.floor(score);
    var best = parseInt(load(bestKey()), 10) || 0;
    var record = d > runBest;   // the stored best may already be this run's
    if (d > best) { best = d; save(bestKey(), best); }
    renderBest();
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
    mode = "day"; // a lit orbiting preview behind the card
    card.innerHTML =
      '<h2>QUICK MINUTE</h2>' +
      '<p>You\'re the fast one. Slice through ' + LANES + ' lanes of slower traffic and rack up distance.</p>' +
      '<ul class="rules">' +
        // (the keys with a keyboard, the tap on a touch-only device)
        '<li><span class="gs-keys"><kbd class="gs-kbd">←</kbd><kbd class="gs-kbd">→</kbd> or <kbd class="gs-kbd">A</kbd> / <kbd class="gs-kbd">D</kbd> to change lanes (tap left/right on mobile)</span>' +
          '<span class="gs-touch">Tap left or right to change lanes</span>.</li>' +
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
  window.addEventListener("resize", resize);
  resize();
  player.x = laneX(2);
  prevPX = wx(player.x);
  camReady();
  raf = requestAnimationFrame(frame);
  showMenu();

  // test hook
  window.__game = {
    get running() { return running; },
    get score() { return score; },
    get mode() { return mode; },
    get obstacles() { return obstacles; },
    get player() { return player; },
    get cam() { return cam; },
    get preset() { return camPresetIdx; },
    setPreset: setPreset,
    addScore: function (n) { score += n; },
    start: start
  };
})();
