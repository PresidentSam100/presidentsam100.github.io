/* =====================================================================
   Tall Order: the bakery stacker.

   Classic Stack rules in 2D: a tier slides over the tower, you drop it,
   the overhang shears off as a falling chunk, and the next tier is only
   as wide as what survived. A drop within a few pixels of dead centre
   is PERFECT: the oven dings, the width is kept, and consecutive
   perfects let the cake grow back toward full size. Missing the tower
   entirely serves the cake: the camera pulls back, the topper goes on,
   and the tier count is the score.

   World space: y = 0 is the counter; the tower grows upward (negative
   y). H is the tier pitch; the camera eases to keep the action framed.
   ===================================================================== */
(function () {
  "use strict";

  var A = window.CakeArt;
  function $(id) { return document.getElementById(id); }
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  var store = window.GameShell ? GameShell.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  var bests = {
    bakery: window.GameShell ? GameShell.best("tallorder_best_bakery", { higher: true }) : null,
    rush: window.GameShell ? GameShell.best("tallorder_best_rush", { higher: true }) : null
  };

  // ---- canvas ---------------------------------------------------------------
  var cv = $("stage"), g = cv.getContext("2d");
  var W = 0, Hh = 0;
  function resize() {
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    W = window.innerWidth; Hh = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  // ---- sound ------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) actx = new AC(); }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(freq, dur, type, vol, slide) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime;
    var o = ac.createOscillator(), gn = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    gn.gain.setValueAtTime(vol || 0.12, t0);
    gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function noise(dur, freq, vol) {
    var ac = audio(); if (!ac) return;
    var len = Math.floor(ac.sampleRate * dur);
    var buf = ac.createBuffer(1, len, ac.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ac.createBufferSource(); src.buffer = buf;
    var bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 1.4;
    var gn = ac.createGain(); gn.gain.value = vol || 0.2;
    src.connect(bp); bp.connect(gn); gn.connect(ac.destination);
    src.start();
  }
  function sndPlop() { tone(190, 0.1, "sine", 0.14, 120); noise(0.05, 500, 0.1); }
  function sndSlice() { noise(0.09, 1100, 0.22); tone(320, 0.07, "triangle", 0.07, 240); }
  function sndDing() { tone(1318, 0.5, "sine", 0.12); tone(2637, 0.35, "sine", 0.05); }
  function sndGrow() { tone(660, 0.09, "triangle", 0.08); tone(880, 0.12, "triangle", 0.08); }
  function sndMiss() { tone(160, 0.5, "square", 0.1, 60); }
  function sndServe() { [523, 659, 784, 1046].forEach(function (f, i) { setTimeout(function () { tone(f, 0.28, "sine", 0.1); }, i * 110); }); }

  // ---- game state -----------------------------------------------------------------
  var state = "menu";                  // menu | play | tumble | zoom | over
  var overAt = 0;                      // when the end card came up (Space waits a moment before it bakes another)
  var mode = store.get("tallorder_mode", "bakery");
  if (mode !== "bakery" && mode !== "rush") mode = "bakery";

  var H = 44, SH = 32, W0 = 300, EPS = 7;
  var tiers = [], perfects = 0, streak = 0;
  var slider = null;                    // { x, w, dir, y (world bottom), mode: slide|fall, vy, fl, seed, decos }
  var debris = [], sprinkles = [], pops = [];
  // Every piece that has fallen this run (an offcut, the tier that missed), as
  // it left the tower: { x, w, fl, seed, y0, vx, vy }. And where each has come
  // to rest on the floor, laid out for the pull-back (layPile).
  var fallen = [], pile = [];
  var cam = 0, camTarget = 0;           // world y at screen top
  var zoomCam = 0;                      // cam as the pull-back began: it starts from the view play left
  var baseX = 0, spawnTimer = 0, phaseTimer = 0, zoomP = 0, wallTint = 338;
  var shake = 0, ovenGlow = 0, bob = 0;
  var runBest = 0;                      // the mode's best as the run began (the stored one climbs mid-run)

  function sizes() {
    H = clamp(Math.round(Hh * 0.052), 34, 50);
    SH = Math.round(H * 0.72);
    W0 = clamp(Math.round(W * 0.42), 170, 330);
    baseX = Math.round((W - W0) / 2);
  }

  function flavourFor(i) { return A.FLAVOURS[Math.floor(i / 4) % A.FLAVOURS.length]; }
  function speed() {
    var n = tiers.length;
    return mode === "rush" ? Math.min(760, 340 + n * 13) : Math.min(580, 230 + n * 8);
  }
  function towerTopY() { return -tiers.length * H; }

  function spawnSlider() {
    var top = tiers[tiers.length - 1];
    var fl = flavourFor(tiers.length);
    var dir = tiers.length % 2 === 0 ? 1 : -1;
    var span = Math.min(W * 0.92, W0 * 2.6);
    var lo = (W - span) / 2, hi = lo + span - top.w;
    slider = {
      w: top.w, x: dir === 1 ? lo : hi, lo: lo, hi: hi, dir: dir,
      y: towerTopY() - 22, mode: "slide", vy: 0,
      fl: fl, seed: 1000 + tiers.length * 17,
      decos: A.decosFor(top.w, 1000 + tiers.length * 17)
    };
    // decorations in world-x, so trims can keep the survivors
    slider.decos.forEach(function (d) { d.wx = slider.x + d.u * slider.w; });
    $("hud-flavour").textContent = fl.name;
  }

  function startRun(m) {
    if (m) mode = m;
    store.set("tallorder_mode", mode);
    audio();
    sizes();
    tiers = []; perfects = 0; streak = 0;
    debris = []; sprinkles = []; pops = [];
    fallen = []; pile = [];
    runBest = bests[mode] ? bests[mode].get() : 0;
    // the base tier, resting on the stand
    tiers.push({ x: baseX, w: W0, fl: flavourFor(0), seed: 991, decos: withWx(A.decosFor(W0, 991), baseX, W0) });
    cam = -Hh * 0.82; camTarget = towerTopY() - Hh * 0.62;
    wallTint = 338; ovenGlow = 1;
    spawnSlider();
    $("menu").hidden = true; $("over").hidden = true; $("hud").hidden = false;
    $("hud-tiers").textContent = "1";
    state = "play";
  }
  function withWx(decos, x, w) { decos.forEach(function (d) { d.wx = x + d.u * w; }); return decos; }

  // A resize (a phone turned, a window narrowed) refits the sizes and slides
  // everything over so the tower stands centred again. Left where it was, it
  // could end up off screen, past the end of every tier's slide.
  function refit() {
    if (!tiers.length) return;
    sizes();
    var dx = Math.round(W / 2 - (tiers[0].x + tiers[0].w / 2));
    tiers.forEach(function (t) { t.x += dx; t.decos.forEach(function (d) { d.wx += dx; }); });
    debris.forEach(function (d) { d.x += dx; });
    fallen.forEach(function (f) { f.x += dx; });
    if (pile.length) pile = layPile();
    sprinkles.forEach(function (s) { s.x += dx; });
    pops.forEach(function (p) { p.x += dx; });
    if (slider) {
      slider.x += dx;
      if (slider.mode === "slide") {
        // a slide across the new width, as spawnSlider lays it out
        var span = Math.min(W * 0.92, W0 * 2.6);
        slider.lo = (W - span) / 2;
        slider.hi = Math.max(slider.lo, slider.lo + span - slider.w);
        slider.x = clamp(slider.x, slider.lo, slider.hi);
        slider.y = towerTopY() - 22;
      }
      slider.decos.forEach(function (d) { d.wx = slider.x + d.u * slider.w; });
    }
    if (state === "play") camTarget = towerTopY() - Hh * 0.62;
    else if (state === "menu") cam = camTarget = -Hh * 0.82;
  }
  window.addEventListener("resize", refit);

  function drop() {
    if (state !== "play" || !slider || slider.mode !== "slide") return;
    slider.mode = "fall";
    slider.vy = 240;
  }

  function land() {
    var top = tiers[tiers.length - 1];
    var x = slider.x, w = slider.w;
    var oL = Math.max(x, top.x), oR = Math.min(x + w, top.x + top.w);
    var ow = oR - oL;

    if (ow <= 4) {                                   // clean miss: served
      fell(x, w, slider.dir * 60, 60, slider.seed, false);
      sndMiss();
      // the run is over: its result is in before the tumble (a run that placed
      // nothing on the base it was given has no tower to record)
      if (bests[mode] && tiers.length > 1) bests[mode].submit(tiers.length);
      state = "tumble"; phaseTimer = 0.8;
      slider = null;
      return;
    }

    var perfect = Math.abs(x - top.x) <= EPS && Math.abs(w - top.w) <= EPS;
    if (perfect) {
      x = top.x; w = top.w; ow = w;
      streak++; perfects++;
      sndDing();
      pop(top.x + w / 2, slider.y - SH, "perfect!");
      burst(top.x + w / 2, slider.y - SH * 0.5, 14);
      if (streak >= 2 && w < W0) {                    // the cake grows back
        var grow = Math.min(W0 - w, 8);
        x -= grow / 2; w += grow; ow = w;
        sndGrow();
        pop(x + w / 2, slider.y - SH - 20, "+grow");
      }
    } else {
      streak = 0;
      // shear the overhang off as falling cake (an offcut: with Visual FX on it
      // sheds crumbs a tier's height down, see update). It tips off the edge
      // and out, a bigger one further (more of it hangs out to lever it over).
      if (x < oL) fell(x, oL - x, -tipOf(oL - x), -40, slider.seed, true);
      if (x + w > oR) fell(oR, x + w - oR, tipOf(x + w - oR), -40, slider.seed + 5, true);
      crumbs((x < oL ? oL : oR), slider.y, slider.fl);
      x = oL; w = ow;
      sndSlice(); sndPlop();
      if (fx()) shake = 5;
    }

    var kept = slider.decos.filter(function (d) { return d.wx > x + 8 && d.wx < x + w - 8; });
    kept.forEach(function (d) { d.u = (d.wx - x) / w; });
    tiers.push({ x: x, w: w, fl: slider.fl, seed: slider.seed, decos: kept, squash: fx() ? 1 : 0 });
    slider = null;
    $("hud-tiers").textContent = "" + tiers.length;
    // a tier that takes the tower past the best saves it now, not after the
    // tumble and pull-back that end the run
    if (tiers.length > runBest && bests[mode]) bests[mode].submit(tiers.length);
    camTarget = towerTopY() - Hh * 0.62;

    if (tiers.length % 10 === 0) {                    // growth-chart milestone
      wallTint = (338 + (tiers.length / 10) * 26) % 360;
      sndServe();
      ovenGlow = 1;
    }
    spawnTimer = 0.16;
  }

  // ---- what fell -----------------------------------------------------------------
  // A piece that leaves the tower is kept, as it left (`fallen`), and falls as
  // debris (f: which one it is): it drops out of the picture during play, and
  // the pull-back shows it lying on the floor, or coming down onto it.
  var GRAV = 2200;                       // (the debris's fall, update)
  function fell(x, w, vx, vy, seed, offcut) {
    var i = fallen.push({ x: x, w: w, fl: slider.fl, seed: seed, y0: slider.y, vx: vx, vy: vy }) - 1;
    debris.push({ x: x, y: slider.y, y0: slider.y, offcut: offcut, w: w, fl: slider.fl, seed: seed, vx: vx, vy: vy, rot: 0, vr: (vx < 0 ? -1 : 1) * (offcut ? 2.2 : 2.4), f: i });
  }
  function tipOf(w) { return 55 + Math.min(w, 160) * 0.6; }
  // Where each comes down and rests, in the order they fell. It comes down
  // where its own fall takes it: the throw and the gravity it is drawn
  // falling with, from where it left the tower (so a piece from high up, or
  // a big one, lies further out). Landing on the heap, it doesn't stay
  // perched there: it slides off toward the side it was thrown while the
  // floor ahead lies lower, and then lies on what's under it, tipped by it.
  // (It used to be carried out by only half its throw and stacked where it
  // came down, so the pieces stood in three heaps: each side of the tower,
  // and the tier that missed.) `hit`: the height its foot meets the heap at,
  // where a piece still falling as the pull-back begins joins the pile;
  // `down`: lying there (from the start, for a piece no longer in the air).
  function layPile() {
    var BIN = 6, lo = -W * 2, n = Math.ceil(W * 5 / BIN), hgt = new Float32Array(n);
    var floorY = A.FLOOR + 34, thick = SH * 0.84;
    var span = function (cx, foot) { var a = clamp(Math.floor((cx - foot / 2 - lo) / BIN), 0, n - 1); return [a, clamp(Math.floor((cx + foot / 2 - lo) / BIN), a, n - 1)]; };
    var topOf = function (r) { var t = 0; for (var i = r[0]; i <= r[1]; i++) t = Math.max(t, hgt[i]); return t; };
    return fallen.map(function (f, k) {
      var drop = Math.max(0, floorY - f.y0);
      var t = (-f.vy + Math.sqrt(f.vy * f.vy + 2 * GRAV * drop)) / GRAV;
      var cx = f.x + f.w / 2 + f.vx * t;
      // a sliver thinner than it is tall doesn't stand: it lies on its side,
      // fallen over the way it was thrown
      var flat = f.w >= SH, foot = flat ? f.w : SH * 1.3, high = flat ? thick : Math.max(7, f.w);
      // (the slide: down the heap's slope, outward, as far as two of its own
      // lengths and a bit; it stops where the ground stops falling away, and
      // never climbs over a taller heap)
      var dir = f.vx < 0 ? -1 : 1, r = span(cx, foot), top = topOf(r), hit = top;
      var reach = Math.ceil((foot * 2 + 30) / BIN), at = 0;
      for (var step = 1; step <= reach && top > 0; step++) {
        var r2 = [r[0] + dir * (step - at), r[1] + dir * (step - at)];
        if (r2[0] < 0 || r2[1] > n - 1) break;
        var top2 = topOf(r2);
        if (top2 > top + 1) break;
        if (top2 < top - high * 0.5) { r = r2; top = top2; cx += dir * BIN * (step - at); at = step; }
      }
      var lean = r[1] > r[0] ? Math.atan2(hgt[r[0]] - hgt[r[1]], foot) * 0.6 : 0;   // (down toward the lower side of what's under it)
      var wob = ((f.seed * 9301 + 49297) % 233280) / 233280 - 0.5;                    // (and a little of its own, the same each time)
      for (var i = r[0]; i <= r[1]; i++) hgt[i] = top + high;
      var rot = clamp(lean + wob * 0.34, -0.6, 0.6) + (flat ? 0 : dir * Math.PI / 2);
      var falling = debris.some(function (d) { return d.f === k; });
      // (y is where the middle of its sponge sits: half its height up, or half its width when it lies on its side)
      return { x: cx - f.w / 2, y: floorY - top - (flat ? SH / 2 : Math.max(3.5, f.w / 2)), w: f.w, rot: rot, fl: f.fl, seed: f.seed,
        hit: floorY - hit, down: !falling };
    });
  }

  function serveOver() {
    var n = tiers.length;
    // (saved as each tier beat it; "record" is against the best as the run
    // began). The count includes the base the run starts on, so a run that
    // placed no tier (n is 1) is never a record.
    var b = bests[mode], isBest = b && n > 1 ? b.submit(n) || n > runBest : false;
    $("over-title").textContent = n >= 25 ? "A showstopper!" : n >= 12 ? "Order served!" : "Back to the oven";
    $("over-msg").textContent = n + (n === 1 ? " tier" : " tiers");
    $("over-stats").textContent =
      perfects + " perfect drop" + (perfects === 1 ? "" : "s") + "\n" +
      (isBest ? "a new bakery record! 🍒" : b && b.get() ? "best: " + b.get() + " tiers" : "no tower on the record board yet");
    $("hud").hidden = true;
    $("over").hidden = false;
    state = "over";
    overAt = performance.now();
  }

  // ---- garnish ---------------------------------------------------------------------
  // the words ("perfect!", "+grow") show in both modes; with Visual FX off
  // they hold still and solid for their second instead of rising and fading
  function pop(wx, wy, text) { pops.push({ x: wx, y: wy, text: text, age: 0 }); }
  function burst(wx, wy, count) {
    if (!fx()) return;
    for (var i = 0; i < count; i++) {
      sprinkles.push({
        x: wx, y: wy,
        vx: (Math.random() - 0.5) * 320, vy: -80 - Math.random() * 200,
        rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 10,
        col: A.SPRINKLE_COLS[i % A.SPRINKLE_COLS.length], age: 0
      });
    }
  }
  function crumbs(wx, wy, fl) {
    if (!fx()) return;
    for (var i = 0; i < 8; i++) {
      sprinkles.push({
        x: wx, y: wy + Math.random() * SH,
        vx: (Math.random() - 0.5) * 200, vy: -40 - Math.random() * 120,
        rot: 0, vr: 0, r: 2 + Math.random() * 2.4,
        col: fl.sponge[1], age: 0
      });
    }
  }
  // An offcut a tier's height down sheds crumbs (Visual FX on): bits of its
  // frosting and sponge, each thrown off from where it sat in the chunk,
  // tumbling as they fall, while the offcut itself falls on whole and out of
  // the picture. (It used to break up into its bits there and so vanish in
  // mid air, though the pull-back then showed it whole on the floor.) With
  // FX off the offcut falls with no crumbs.
  function crumble(d) {
    var cx = d.x + d.w / 2, cy = d.y - SH / 2;
    var cos = Math.cos(d.rot), sin = Math.sin(d.rot);
    var cols = clamp(Math.round(d.w / 12), 2, 6), rows = 2;
    var size = Math.min(6, 2.5 + d.w * 0.08);
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var lx = ((c + 0.5) / cols - 0.5) * d.w, ly = ((r + 0.5) / rows - 0.5) * SH;
        sprinkles.push({
          x: cx + lx * cos - ly * sin, y: cy + lx * sin + ly * cos,
          vx: d.vx + lx * 5 + (Math.random() - 0.5) * 130, vy: d.vy * 0.5 + ly * 5 - Math.random() * 150,
          rot: Math.random() * 6.3, vr: (Math.random() - 0.5) * 16,
          bit: size * (0.6 + Math.random() * 0.6),
          col: r === 0 ? d.fl.frost[1] : (r + c) % 3 === 0 ? d.fl.fill : d.fl.sponge[(r + c) % 2],
          edge: r === 0 ? d.fl.frostEdge : d.fl.crust, age: 0
        });
      }
    }
  }

  // ---- update -----------------------------------------------------------------------
  function update(dt) {
    bob += dt * 3;
    ovenGlow = Math.max(0, ovenGlow - dt * 0.25);
    if (shake > 0) shake = Math.max(0, shake - dt * 30);
    cam += (camTarget - cam) * Math.min(1, dt * 5);

    if (state === "play") {
      if (slider) {
        if (slider.mode === "slide") {
          slider.x += slider.dir * speed() * dt;
          if (slider.x <= slider.lo) { slider.x = slider.lo; slider.dir = 1; }
          if (slider.x >= slider.hi) { slider.x = slider.hi; slider.dir = -1; }
          slider.decos.forEach(function (d) { d.wx = slider.x + d.u * slider.w; });
        } else {                                       // falling
          slider.vy += 2600 * dt;
          slider.y += slider.vy * dt;
          var rest = towerTopY();
          if (slider.y >= rest) { slider.y = rest; land(); }
        }
      } else if (spawnTimer > 0) {
        spawnTimer -= dt;
        if (spawnTimer <= 0) spawnSlider();
      }
    } else if (state === "tumble") {
      phaseTimer -= dt;
      if (phaseTimer <= 0) { state = "zoom"; zoomP = 0; zoomCam = cam; pile = layPile(); sndServe(); }
    } else if (state === "zoom") {
      zoomP = Math.min(1, zoomP + dt * (fx() ? 0.75 : 4));
      // (a moment longer on the whole picture when there is a heap on the floor to take in)
      if (zoomP >= 1) { phaseTimer -= dt; if (phaseTimer < (pile.length ? -1.2 : -0.5)) serveOver(); }
    }

    tiers.forEach(function (t) { if (t.squash > 0) t.squash = Math.max(0, t.squash - dt * 6); });
    debris.forEach(function (d) { d.vy += GRAV * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; });
    debris = debris.filter(function (d) {
      if (d.offcut && !d.shed && d.y - d.y0 > H && fx()) { d.shed = true; crumble(d); }
      // pulling back: a piece still in the air falls on until it comes down
      // on the floor, and lies in the pile from then on
      var q = pile.length && d.f != null ? pile[d.f] : null;
      if (q) { if (d.y >= q.hit) { q.down = true; return false; } return true; }
      // in play it is done with once well below the screen (it lies on the
      // floor in the pull-back); after a miss it is kept for the pull-back
      return state !== "play" || d.y - cam < Hh + 240;
    });
    sprinkles.forEach(function (s) { s.vy += 1400 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt; s.age += dt; });
    sprinkles = sprinkles.filter(function (s) { return s.age < 2.4 && s.y - cam < Hh + 60; });
    pops.forEach(function (p) { p.age += dt; });
    pops = pops.filter(function (p) { return p.age < 1; });
  }

  // ---- draw --------------------------------------------------------------------------
  function sy(worldY) { return worldY - cam; }

  function drawTierAt(t, worldBottom, alpha, showDecos) {
    var y = sy(worldBottom) - SH;
    var squash = t.squash ? 1 - 0.12 * Math.sin(t.squash * Math.PI) : 1;
    g.save();
    if (alpha != null) g.globalAlpha = alpha;
    if (squash !== 1) {
      g.translate(t.x + t.w / 2, sy(worldBottom));
      g.scale(1 / Math.sqrt(squash), squash);
      g.translate(-(t.x + t.w / 2), -sy(worldBottom));
    }
    A.drawTier(g, t.x, y, t.w, SH, t.fl, showDecos ? t.decos : null, { seed: t.seed });
    g.restore();
  }

  function draw() {
    A.drawKitchen(g, W, Hh, cam, wallTint);
    if (state === "zoom" || state === "over") { drawServed(); return; }

    g.save();
    if (shake > 0.3 && fx()) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);

    A.drawOven(g, W, Hh, sy, ovenGlow > 0.4);
    A.drawCounter(g, W, Hh, sy, tiers.length ? tiers[0].x : baseX, tiers.length ? tiers[0].w : W0);
    for (var k = 10; k <= tiers.length; k += 10) A.drawMark(g, 26, sy(-k * H), k);

    // the tower (only what's on screen)
    for (var i = 0; i < tiers.length; i++) {
      var wb = -i * H;
      if (sy(wb) < -H * 2 || sy(wb - H) > Hh + H * 2) continue;
      drawTierAt(tiers[i], wb, null, i === tiers.length - 1);
    }
    // the sliding / falling tier
    if (slider) {
      // Its soft shadow first, so it lies under it: on the top of the tower,
      // where the tier hangs over it. (It was painted after the tier and a
      // tier's height too high, so it lay across the tier itself.)
      if (slider.mode === "slide") {
        var top = tiers[tiers.length - 1];
        var shL = Math.max(slider.x, top.x), shR = Math.min(slider.x + slider.w, top.x + top.w);
        if (shR > shL) {
          g.fillStyle = "rgba(90,40,56,0.14)";
          g.beginPath();
          g.ellipse((shL + shR) / 2, sy(towerTopY()) + (H - SH) * 0.3, (shR - shL) / 2, 4, 0, 0, 7);
          g.fill();
        }
      }
      var hov = slider.mode === "slide" && fx() ? Math.sin(bob) * 2.5 : 0;
      var st = { x: slider.x, w: slider.w, fl: slider.fl, seed: slider.seed, decos: slider.decos, squash: 0 };
      drawTierAt(st, slider.y + hov, null, true);
    }
    drawDebris(sy);
    drawGarnish(sy);
    g.restore();
  }

  // the pieces in the air (toY: a world y on the canvas, as drawn)
  function drawDebris(toY) {
    debris.forEach(function (d) {
      g.save();
      g.translate(d.x + d.w / 2, toY(d.y) - SH / 2);
      g.rotate(d.rot);
      A.drawTier(g, -d.w / 2, -SH / 2, d.w, SH, d.fl, null, { seed: d.seed });
      g.restore();
    });
  }

  function drawGarnish(toY) {
    sprinkles.forEach(function (s) {
      g.globalAlpha = clamp(2.4 - s.age, 0, 1);
      if (s.bit) {                                     // a crumb shed by an offcut
        g.save(); g.translate(s.x, toY(s.y)); g.rotate(s.rot);
        g.fillStyle = s.col; g.strokeStyle = s.edge; g.lineJoin = "round"; g.lineWidth = 1.2;
        g.fillRect(-s.bit / 2, -s.bit * 0.4, s.bit, s.bit * 0.8);
        g.strokeRect(-s.bit / 2, -s.bit * 0.4, s.bit, s.bit * 0.8);
        g.restore();
      }
      else if (s.r) { g.fillStyle = s.col; g.beginPath(); g.arc(s.x, toY(s.y), s.r, 0, 7); g.fill(); }
      else A.sprinkle(g, s.x, toY(s.y), s.rot, 5, s.col);
    });
    g.globalAlpha = 1;
    var moving = fx();
    pops.forEach(function (p) {
      g.globalAlpha = moving ? clamp(1 - p.age, 0, 1) : 1;
      g.fillStyle = "#b03a48";
      g.font = "700 22px Fredoka, sans-serif";
      g.textAlign = "center";
      g.fillText(p.text, p.x, toY(p.y) - (moving ? p.age * 40 : 0));
    });
    g.globalAlpha = 1;
  }

  // The pull-back: from the view play left off on to the whole cake on its
  // stand, topper going on, and the kitchen under it down to the floor, with
  // everything that fell lying there (or still coming down onto it).
  function drawServed() {
    var e = zoomP < 0.5 ? 2 * zoomP * zoomP : 1 - Math.pow(-2 * zoomP + 2, 2) / 2;
    var towerH = tiers.length * H + 70, below = A.FLOOR + 62;
    var fit = Math.min(1, (Hh * 0.9) / (towerH + below));
    var cx = tiers[0].x + tiers[0].w / 2;
    // Play draws the world at full size with its y = cam at the top of the
    // screen; the end view at `fit`, the cake in the middle and the stand's
    // foot near the screen's. The scale and the shift go from the one to the
    // other together, so the picture pulls back about the one point that
    // stays put, starting from exactly what play showed. (It used to start
    // from the foot of the tower at full size: on a tall cake the view jumped
    // from its top down to its stand, then pulled back.)
    var s = 1 + (fit - 1) * e;
    var tx = (W / 2 - fit * cx) * e;
    var ty = -zoomCam + (Hh * 0.96 - below * fit + zoomCam) * e;
    var bottom = (Hh - ty) / s + 40;                 // (the world's y at the foot of the screen)
    var flat = function (wy) { return wy; };

    g.save();
    g.translate(tx, ty);
    g.scale(s, s);

    A.drawOven(g, W, bottom, flat, ovenGlow > 0.4);
    A.drawCounter(g, W * 3, bottom, flat, tiers[0].x, tiers[0].w);
    // the growth chart's marks, as play had them, fading as the view pulls back
    if (e < 1) {
      g.globalAlpha = 1 - e;
      for (var m = 10; m <= tiers.length; m += 10) A.drawMark(g, 26, -m * H, m);
      g.globalAlpha = 1;
    }
    // what fell, in the order it fell (so the later pieces lie on the earlier)
    for (var k = 0; k < pile.length; k++) {
      var q = pile[k];
      if (!q.down) continue;
      g.save();
      g.translate(q.x + q.w / 2, q.y);
      g.rotate(q.rot);
      A.drawTier(g, -q.w / 2, -SH / 2, q.w, SH, q.fl, null, { seed: q.seed });
      g.restore();
    }
    for (var i = 0; i < tiers.length; i++) {
      var y = -i * H - SH;
      A.drawTier(g, tiers[i].x, y, tiers[i].w, SH, tiers[i].fl,
        i === tiers.length - 1 ? tiers[i].decos : null, { seed: tiers[i].seed });
    }
    // The topper, once we've pulled back: a cherry in the middle of the top
    // tier's frosting, and a candle each side of it for every ten tiers (up
    // to five a side), standing on the frosting and spread across the tier,
    // as many as its width has room for. (They used to hang in the air: set
    // a tier's height above the cake, and out past a narrow top tier's ends.)
    if (zoomP > 0.6) {
      var topT = tiers[tiers.length - 1];
      var px = topT.x + topT.w / 2, top = -(tiers.length - 1) * H - SH;     // (the top tier's frosted top)
      A.cherry(g, px, top - 7, 9);
      var room = topT.w / 2 - 8, near = 16;                                 // (each side: from just clear of the cherry to just inside the end)
      var nC = Math.min(5, Math.floor(tiers.length / 10), room >= near ? Math.floor((room - near) / 8) + 1 : 0);
      var gap = nC > 1 ? Math.min(22, (room - near) / (nC - 1)) : 0;
      for (var c = 0; c < nC; c++) {
        // the flames are still art, so they're lit in both modes
        A.candle(g, px - near - c * gap, top + 3, 11, true);
        A.candle(g, px + near + c * gap, top + 3, 11, true);
      }
    }
    // the pieces still coming down, and the crumbs, in the same picture
    drawDebris(flat);
    drawGarnish(flat);
    g.restore();
  }

  // ---- loop ----------------------------------------------------------------------------
  var P = window.GameShell ? GameShell.pausable({
    canPause: function () { return state === "play"; },
    // on the card: this cake again from its first tier, or back to the modes
    restart: function () { startRun(mode); },
    menu: toMenu
  }) : { isPaused: function () { return false; } };
  // Leaving asks first once a tier has been dropped onto the tower (paused or
  // not; nothing's lost before then). Not in the tumble and pull-back after a
  // miss: the run is over and its best already saved.
  if (window.GameShell && GameShell.guardLeave) GameShell.guardLeave({
    active: function () { return state === "play" && tiers.length > 1; },
    pausable: P
  });

  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (P.isPaused()) return;
    if (state !== "menu") update(dt);
    draw();
  }
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // ---- input ---------------------------------------------------------------------------
  cv.addEventListener("pointerdown", function (e) {
    if (state === "play" && !P.isPaused()) { e.preventDefault(); drop(); }
  });
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (P.isPaused()) return;
    if (state === "play") {
      if (e.code === "Space" || e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); if (!e.repeat) drop(); }
      return;
    }
    if (e.repeat) return;
    // Enter or Space on a focused button is that button's click (a mode, Modes…);
    // starting a run here as well would run both
    if ((e.key === "Enter" || e.key === " ") && e.target && e.target.closest && e.target.closest("button")) return;
    if (state === "menu") {
      if (e.key === "1" || e.key === "2") {
        mode = e.key === "1" ? "bakery" : "rush";
        store.set("tallorder_mode", mode);
        paintMenu();
      } else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startRun(mode); }
      return;
    }
    // the end card: Enter or Space bakes another, Backspace goes back to the modes;
    // Esc isn't claimed, so it leaves for the games page
    if (state === "over") {
      // (Space not in the card's first moments: in play it drops a tier, so
      // one pressed as the card comes up mustn't skip it)
      if (e.key === " " && performance.now() - overAt < 700) { e.preventDefault(); return; }
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); startRun(mode); }
      else if (e.key === "Backspace") { e.preventDefault(); toMenu(); }
    }
  });

  // ---- menu ----------------------------------------------------------------------------
  function paintMenu() {
    document.querySelectorAll("#pick-mode button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-v") === mode);
    });
    var parts = [];
    if (bests.bakery && bests.bakery.get()) parts.push("Bakery " + bests.bakery.get());
    if (bests.rush && bests.rush.get()) parts.push("Rush order " + bests.rush.get());
    $("bests").textContent = parts.length ? "tallest towers: " + parts.join(" · ") : "no towers on the record board yet";
  }
  function toMenu() {
    state = "menu";
    $("over").hidden = true; $("hud").hidden = true; $("menu").hidden = false;
    paintMenu();
  }
  document.querySelectorAll("#pick-mode button").forEach(function (b) {
    b.addEventListener("click", function () {
      mode = b.getAttribute("data-v");
      store.set("tallorder_mode", mode);
      paintMenu();
    });
    // a mouse click doesn't take focus (Tab still reaches it): left focused,
    // the Enter that should start the run would press the mode again
    b.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("play").addEventListener("click", function () { startRun(mode); });
  $("again").addEventListener("click", function () { startRun(mode); });
  $("to-menu").addEventListener("click", toMenu);

  // a pretty menu backdrop: a little tower already on the counter
  sizes();
  tiers = [
    { x: baseX, w: W0, fl: A.FLAVOURS[0], seed: 991, decos: withWx(A.decosFor(W0, 991), baseX, W0) },
    { x: baseX + 14, w: W0 - 28, fl: A.FLAVOURS[0], seed: 992, decos: withWx(A.decosFor(W0 - 28, 992), baseX + 14, W0 - 28) },
    { x: baseX + 30, w: W0 - 60, fl: A.FLAVOURS[1], seed: 993, decos: withWx(A.decosFor(W0 - 60, 993), baseX + 30, W0 - 60) }
  ];
  cam = -Hh * 0.82; camTarget = cam;
  toMenu();

  // test hooks: the Playwright harness drives runs through these
  window.TallOrder = {
    state: function () { return state; },
    tiers: function () { return tiers.length; },
    topWidth: function () { return tiers[tiers.length - 1].w; },
    sliderX: function () { return slider ? slider.x : null; },
    sliderReady: function () { return !!slider && slider.mode === "slide"; },
    topX: function () { return tiers[tiers.length - 1].x; },
    fallen: function () { return fallen.length; },
    perfects: function () { return perfects; },
    pops: function () { return pops.map(function (p) { return { text: p.text, age: p.age }; }); },
    drop: drop,
    placeAndDrop: function (offset) {
      if (!slider || slider.mode !== "slide") return false;
      slider.x = tiers[tiers.length - 1].x + (offset || 0);
      drop();
      return true;
    },
    start: startRun,
    toMenu: toMenu
  };
})();
