/* =====================================================================
   Orbits: a comet, one push, and the suns' pull. Drag an arrow out from
   the comet (or turn it and set its strength on the keys), launch, and
   the comet flies under the suns' gravity; a chart is charted when it
   passes through every gold gate before it falls into a sun, touches a
   moon or a dust cloud, leaves the chart or burns out. Thirty charts on
   six plates, each plate bringing in one new thing.

   The physics is physics.js's (the level checker runs it too): a flight
   is worked out whole at the launch and played back here, so frame rate
   and Visual FX never change where the comet goes or how fast.

   The dotted line shows only the push's first stretch: 360 units of path,
   or less where the comet first swings past a sun, stopping well short of
   any gate (see physics.js), so what happens round a sun and after it is
   found by launching. Every launch counts, and a chart's
   count runs on until it is charted, across visits: the push and the last
   flight's trace are kept with it. The count it took is the chart's for
   good (orbits_best); a chart flown again keeps no record.
   ===================================================================== */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };
  var Phys = window.OrbitsPhysics, CHARTS = window.OrbitsLevels.charts, PLATES = window.OrbitsLevels.plates;
  var HZ = Phys.HZ, S_MIN = Phys.S_MIN, S_MAX = Phys.S_MAX;
  var ARROW = 6;          // the arrow's length on the chart: units for each unit of strength
  var GS = window.GameShell || null;
  function fx() { return !(window.RM_ON && window.RM_ON()); }
  var store = GS ? GS.store : {
    get: function (k, f) { try { var v = localStorage.getItem(k); return v == null ? f : v; } catch (e) { return f; } },
    set: function (k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  };
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function count(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // ---- records ------------------------------------------------------------------
  // orbits_best: { chart: the launches it took to chart it }
  // orbits_go: { chart: { t: launches so far, a, s: the push, la, ls: the push
  //   last launched } }, for a chart not charted yet
  function readJSON(k) { try { var v = JSON.parse(store.get(k, "{}")); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; } }
  var bests = readJSON("orbits_best"), gos = readJSON("orbits_go");
  function charted(n) { return bests[n] != null; }
  function isOpen(n) { return n === 0 || charted(n) || charted(n - 1); }
  function total() { var t = 0; for (var k in bests) t += Number(bests[k]) || 0; return t; }
  function chartedCount() { var c = 0; for (var n = 0; n < CHARTS.length; n++) if (charted(n)) c++; return c; }
  // the chart chosen last, if it's open; else the first open one not charted
  var kept = store.get("orbits_chart", null);
  var chart = kept == null ? -1 : clamp(Number(kept) || 0, 0, CHARTS.length - 1);
  if (chart < 0 || !isOpen(chart)) for (chart = 0; chart < CHARTS.length - 1 && isOpen(chart + 1) && charted(chart); chart++);

  // ---- the state ------------------------------------------------------------------
  var state = "menu";          // menu | aim | fly | done
  var L = null;                // the chart being flown
  var pa = 0, ps = 200;        // the push: bearing and strength, in tenths
  var tries = 0;               // launches on this chart (its go so far)
  var again = false;           // a chart already charted, flown again: no record
  var lastA = null, lastS = null, trace = null;   // the push last launched, and its flight
  var prev = null;             // the dotted line for the push as it stands
  var flight = null;           // in the air: { f, t (steps played), shown (gates lit so far), won }
  var cardAt = 0, doneAt = 0, DONE_WAIT = 700;
  var burst = [];              // gates just lit: { g, at } (a ring that spreads, Visual FX on)

  function nameOf(n) { return "Chart " + (n + 1) + " · " + CHARTS[n].name; }
  function plateOf(n) { return PLATES[CHARTS[n].plate]; }
  function firstOfPlate(n) { return n === 0 || CHARTS[n - 1].plate !== CHARTS[n].plate; }

  // ---- sound --------------------------------------------------------------------------
  var actx = null;
  function audio() {
    if (!actx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) try { actx = new AC(); } catch (e) {} }
    if (actx && actx.state === "suspended") actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, delay, slide) {
    var ac = audio(); if (!ac) return;
    var t0 = ac.currentTime + (delay || 0), o = ac.createOscillator(), gn = ac.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(vol || 0.05, t0 + 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(gn); gn.connect(ac.destination); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  function hiss(dur, freq, vol) {
    var ac = audio(); if (!ac) return;
    var len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / len);
    var src = ac.createBufferSource(), bp = ac.createBiquadFilter(), gn = ac.createGain();
    src.buffer = buf; bp.type = "bandpass"; bp.frequency.value = freq; bp.Q.value = 0.7; gn.gain.value = vol;
    src.connect(bp); bp.connect(gn); gn.connect(ac.destination); src.start();
  }
  function sfxLaunch() { hiss(0.35, 1400, 0.22); tone(330, 0.3, "sine", 0.03, 0, 520); }
  function sfxGate(k) { var f = [659, 784, 988, 1175, 1319][Math.min(4, k)]; tone(f, 0.5, "sine", 0.05); tone(f * 2, 0.35, "sine", 0.015, 0.02); }
  function sfxHalf() { tone(523, 0.3, "triangle", 0.035); }
  function sfxEnd(kind) {
    if (kind === "sun") { hiss(0.5, 300, 0.3); tone(140, 0.45, "sine", 0.06, 0, 70); }
    else if (kind === "dust") hiss(0.6, 2400, 0.18);
    else if (kind === "moon") tone(220, 0.3, "triangle", 0.06, 0, 110);
    else tone(392, 0.5, "sine", 0.035, 0, 196);
  }
  function sfxCharted() { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.55, "sine", 0.05, i * 0.11); }); }

  // ---- the chart on the canvas --------------------------------------------------------
  var cv = $("sky"), g = cv.getContext("2d");
  var dpr = 1, SIDE = 300, M = 10, K = 0.28;      // canvas side (CSS px), its margin, px per unit
  function sx(x) { return M + x * K; }
  function sy(y) { return M + y * K; }
  function toWorld(cx, cy) { var r = cv.getBoundingClientRect(); return [(cx - r.left - M) / K, (cy - r.top - M) / K]; }

  // Wide screens: the chart in the middle at the screen's full height, the
  // log to its left and the helm to its right, both below the corner
  // buttons (which the chart keeps clear of). Tall ones: the log over the
  // chart and the helm under it, the chart as wide as the screen allows.
  var wide = false;
  function layout() {
    var vw = window.innerWidth, vh = window.innerHeight, ch = $("chart"), log = $("log"), helm = $("helm");
    dpr = Math.min(2, window.devicePixelRatio || 1);
    wide = vw >= vh * 1.2 && vw >= 560;
    document.body.classList.toggle("wide", wide);
    document.body.classList.toggle("tall", !wide);
    var back = document.querySelector(".nav-back-games"), br = back ? back.getBoundingClientRect() : { right: 110, bottom: 46, left: 16 };
    var rightmost = vw;
    document.querySelectorAll(".gs-corner, .mute-toggle, .motion-toggle, .gs-pause-btn").forEach(function (el) {
      var r = el.getBoundingClientRect(); if (r.width && r.top < 70) rightmost = Math.min(rightmost, r.left);
    });
    var side, x0, y0;
    if (wide) {
      // (the log's column only has to clear "← Games"; the helm's, the
      // buttons in the other corner; what's left over is shared out)
      var left = Math.max(br.right + 12, Math.min(200, vw * 0.2)), right = Math.max(vw - rightmost + 12, Math.min(270, vw * 0.3));
      side = Math.floor(Math.min(vh - 16, vw - left - right - 16));
      side = Math.max(180, side);
      x0 = Math.round(left + Math.max(0, vw - left - right - side) / 2); y0 = Math.round((vh - side) / 2);
      var top = Math.max(br.bottom, 40) + 18;
      log.style.cssText = "left:12px;top:" + top + "px;width:" + Math.max(110, x0 - 26) + "px";
      helm.style.cssText = "left:" + (x0 + side + 14) + "px;top:" + top + "px;width:" + Math.max(150, vw - x0 - side - 26) + "px";
    } else {
      var top2 = Math.max(br.bottom, 40) + 8, w = Math.min(vw - 16, 560);
      log.style.cssText = "left:8px;right:8px;top:" + top2 + "px";
      helm.style.cssText = "width:" + w + "px;left:" + Math.round((vw - w) / 2) + "px;top:0px";
      var lh = log.hidden ? 0 : log.offsetHeight, hh = helm.hidden ? 0 : helm.offsetHeight;
      side = Math.floor(Math.min(vw - 16, vh - top2 - lh - hh - 22));
      side = Math.max(160, side);
      x0 = Math.round((vw - side) / 2); y0 = top2 + lh + 6;
      helm.style.top = (y0 + side + 8) + "px";
    }
    ch.style.left = x0 + "px"; ch.style.top = y0 + "px"; ch.style.width = side + "px"; ch.style.height = side + "px";
    SIDE = side;
    cv.width = Math.round(side * dpr); cv.height = Math.round(side * dpr);
    cv.style.width = side + "px"; cv.style.height = side + "px";
    M = Math.max(9, Math.round(side * 0.03));
    K = (side - 2 * M) / Phys.W;
  }

  // a seeded scatter (field stars, dust): the same for a chart every time
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
  var starCache = {}, dustCache = {};
  function fieldStars(n) {
    if (starCache[n]) return starCache[n];
    var r = rng(9173 + n * 7919), out = [];
    for (var i = 0; i < 70; i++) out.push([r() * 1000, r() * 1000, r()]);
    return (starCache[n] = out);
  }
  function dustDots(n, k, d) {
    var key = n + ":" + k;
    if (dustCache[key]) return dustCache[key];
    var r = rng(4243 + n * 131 + k * 17), out = [], many = Math.round(d[2] * d[2] / 40);
    for (var i = 0; i < many; i++) { var a = r() * Math.PI * 2, q = Math.sqrt(r()) * d[2] * 0.97; out.push([Math.cos(a) * q, Math.sin(a) * q, r()]); }
    return (dustCache[key] = out);
  }

  var clock = 0;          // seconds of decoration time (sun rays, gates breathing): Visual FX on only
  var drawn = null;       // what the last frame drew, for the tests
  function draw() {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, SIDE, SIDE);
    if (!L || state === "menu") return;
    var on = fx(), n = chart, P = Phys;
    drawn = { fx: on, suns: [], gates: [], dust: 0, moons: [], comet: null, tail: 0, preview: 0, trace: 0, arrow: false, rays: 0, breath: 0 };
    // the chart's ground: a cooler wash inside a ruled border, ticked every
    // 50 units (longer every 100)
    var x0 = sx(0), y0 = sy(0), x1 = sx(P.W), y1 = sy(P.H);
    g.fillStyle = "rgba(226, 230, 222, 0.45)"; g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.strokeStyle = "#1f2a44"; g.lineWidth = 1.5; g.strokeRect(x0, y0, x1 - x0, y1 - y0);
    g.lineWidth = 0.75; g.strokeRect(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
    g.beginPath();
    for (var t = 50; t < 1000; t += 50) {
      var long = t % 100 === 0 ? 5 : 2.5;
      g.moveTo(sx(t), y0); g.lineTo(sx(t), y0 + long); g.moveTo(sx(t), y1); g.lineTo(sx(t), y1 - long);
      g.moveTo(x0, sy(t)); g.lineTo(x0 + long, sy(t)); g.moveTo(x1, sy(t)); g.lineTo(x1 - long, sy(t));
    }
    g.stroke();
    // field stars, faint, of three sizes
    fieldStars(n).forEach(function (s) {
      var x = sx(s[0]), y = sy(s[1]), m = s[2];
      g.fillStyle = "rgba(31, 42, 68, " + (0.18 + m * 0.3) + ")";
      if (m > 0.85) {
        var r = 1.2 + m;
        g.beginPath(); g.moveTo(x, y - r * 2); g.lineTo(x + r * 0.5, y - r * 0.5); g.lineTo(x + r * 2, y); g.lineTo(x + r * 0.5, y + r * 0.5);
        g.lineTo(x, y + r * 2); g.lineTo(x - r * 0.5, y + r * 0.5); g.lineTo(x - r * 2, y); g.lineTo(x - r * 0.5, y - r * 0.5); g.closePath(); g.fill();
      } else { g.beginPath(); g.arc(x, y, 0.6 + m * 0.9, 0, 6.3); g.fill(); }
    });
    // each sun's pull, as dotted rings round it
    g.setLineDash([1.5, 4]); g.strokeStyle = "rgba(31, 42, 68, 0.22)"; g.lineWidth = 1;
    L.suns.forEach(function (s) { var R = P.SUNS[s[2] || 2].r; [2.6, 4.6].forEach(function (f) { g.beginPath(); g.arc(sx(s[0]), sy(s[1]), R * f * K, 0, 6.3); g.stroke(); }); });
    g.setLineDash([]);
    // dust clouds: stippled sepia, their edge dotted (with Visual FX on the
    // stipple turns slowly in place; the cloud itself never moves)
    (L.dust || []).forEach(function (d, k) {
      var spin = on ? clock * 0.06 * (k % 2 ? -1 : 1) : 0, c = Math.cos(spin), si = Math.sin(spin);
      g.fillStyle = "rgba(196, 170, 120, 0.22)"; g.beginPath(); g.arc(sx(d[0]), sy(d[1]), d[2] * K, 0, 6.3); g.fill();
      g.fillStyle = "rgba(108, 78, 40, 0.55)";
      dustDots(n, k, d).forEach(function (p) { var px = p[0] * c - p[1] * si, py = p[0] * si + p[1] * c, rr = 0.5 + p[2] * 0.8; g.fillRect(sx(d[0] + px) - rr / 2, sy(d[1] + py) - rr / 2, rr, rr); });
      g.setLineDash([2, 3]); g.strokeStyle = "rgba(108, 78, 40, 0.7)"; g.lineWidth = 1;
      g.beginPath(); g.arc(sx(d[0]), sy(d[1]), d[2] * K, 0, 6.3); g.stroke(); g.setLineDash([]);
      drawn.dust++;
    });
    // the last flight's trace, faint ink, and where it ended
    if (trace && state !== "fly") { drawTrace(trace); drawn.trace = trace.n; }
    // moons: their orbits dotted, an arrow for the way round, the moon
    // where it is (at its start while a push is aimed)
    var step = state === "fly" && flight ? flight.t : 0;
    (L.moons || []).forEach(function (m, k) {
      var s = L.suns[m.sun], cx = sx(s[0]), cy = sy(s[1]), R = m.r * K;
      g.setLineDash([2, 4]); g.strokeStyle = "rgba(31, 42, 68, 0.4)"; g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, R, 0, 6.3); g.stroke(); g.setLineDash([]);
      var pm = Phys.prepared(L).moons[k], at = Phys.moonAt(pm, step, [0, 0]);
      // the arrow a little ahead of the start, the way it goes
      var dir = m.dir < 0 ? -1 : 1, ph = (m.phase + dir * 28) * Math.PI / 180, ax = cx + Math.sin(ph) * R, ay = cy - Math.cos(ph) * R;
      var tx = Math.cos(ph) * dir, ty = Math.sin(ph) * dir;
      g.fillStyle = "rgba(31, 42, 68, 0.6)"; g.beginPath(); g.moveTo(ax + tx * 6, ay + ty * 6); g.lineTo(ax - tx * 3 - ty * 4, ay - ty * 3 + tx * 4); g.lineTo(ax - tx * 3 + ty * 4, ay - ty * 3 - tx * 4); g.closePath(); g.fill();
      drawMoon(sx(at[0]), sy(at[1]), P.MOON.r * K);
      drawn.moons.push([Math.round(at[0]), Math.round(at[1])]);
    });
    // suns: gold leaf with engraved rays (turning slowly with Visual FX on)
    L.suns.forEach(function (s) { var R = P.SUNS[s[2] || 2].r * K; drawSun(sx(s[0]), sy(s[1]), R, on ? clock * 0.08 : 0); drawn.suns.push([s[0], s[1], R]); });
    drawn.rays = on ? clock * 0.08 : 0;
    // gates: gold rings, lit as the comet passes (a ring marked II takes two
    // passes); numbered on a chart whose gates go in order
    var counts = litCounts();
    var breath = on && state !== "done" ? Math.sin(clock * 2.2) : 0;
    drawn.breath = breath;
    L.gates.forEach(function (q, i) {
      var times = q[2] || 1, c = counts[i] || 0;
      drawGate(sx(q[0]), sy(q[1]), P.GATE_R * K, c >= times, times === 2 && c === 1, times, L.ordered ? i + 1 : 0, c >= times ? 0 : breath);
      drawn.gates.push([q[0], q[1], c]);
    });
    // a gate just lit sends a ring of light out (Visual FX on)
    var now = performance.now();
    burst = burst.filter(function (b) { return now - b.at < 600; });
    if (on) burst.forEach(function (b) {
      var q = L.gates[b.g], u = (now - b.at) / 600;
      g.strokeStyle = "rgba(201, 154, 46, " + (1 - u) + ")"; g.lineWidth = 2;
      g.beginPath(); g.arc(sx(q[0]), sy(q[1]), P.GATE_R * K * (1 + u * 1.4), 0, 6.3); g.stroke();
    });
    // the start mark
    var st = L.start, smx = sx(st[0]), smy = sy(st[1]);
    g.strokeStyle = "rgba(31, 42, 68, 0.75)"; g.lineWidth = 1;
    g.beginPath(); g.arc(smx, smy, 9, 0, 6.3); g.moveTo(smx - 13, smy); g.lineTo(smx - 5, smy); g.moveTo(smx + 5, smy); g.lineTo(smx + 13, smy);
    g.moveTo(smx, smy - 13); g.lineTo(smx, smy - 5); g.moveTo(smx, smy + 5); g.lineTo(smx, smy + 13); g.stroke();
    if (state === "aim" || state === "menu") {
      if (prev) { drawPreview(prev); drawn.preview = Math.round(prev.preview); }
      drawArrow();
      drawn.arrow = true;
      drawComet(smx, smy, null, on);
      drawn.comet = [st[0], st[1]];
    } else if (flight) {
      var pos = Phys.at(flight.f, flight.t, [0, 0]);
      drawn.tail = drawComet(sx(pos[0]), sy(pos[1]), flight, on);
      drawn.comet = [pos[0], pos[1]];
    }
  }
  function drawTrace(f) {
    g.strokeStyle = "rgba(31, 42, 68, 0.38)"; g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(sx(f.xs[0]), sy(f.ys[0]));
    for (var i = 2; i < f.n; i += 2) g.lineTo(sx(f.xs[i]), sy(f.ys[i]));
    g.lineTo(sx(f.xs[f.n - 1]), sy(f.ys[f.n - 1])); g.stroke();
    var ex = sx(f.xs[f.n - 1]), ey = sy(f.ys[f.n - 1]);
    g.strokeStyle = "rgba(184, 64, 43, 0.85)"; g.lineWidth = 1.6;
    if (f.end.kind === "time" || f.end.kind === "charted") { g.beginPath(); g.arc(ex, ey, 4, 0, 6.3); g.stroke(); }
    else { g.beginPath(); g.moveTo(ex - 4, ey - 4); g.lineTo(ex + 4, ey + 4); g.moveTo(ex + 4, ey - 4); g.lineTo(ex - 4, ey + 4); g.stroke(); }
  }
  function drawPreview(p) {
    var end = Math.floor(p.preview);
    g.fillStyle = "#b8402b";
    for (var i = 6; i <= end; i += 6) { g.beginPath(); g.arc(sx(p.xs[i]), sy(p.ys[i]), 1.7, 0, 6.3); g.fill(); }
    var e = Phys.at(p, p.preview, [0, 0]);
    g.strokeStyle = "#b8402b"; g.lineWidth = 1.4; g.beginPath(); g.arc(sx(e[0]), sy(e[1]), 3.2, 0, 6.3); g.stroke();
  }
  function tipOf(a, s) { var c = Phys.sinCosTenths(a), len = s / 10 * ARROW; return [L.start[0] + c[0] * len, L.start[1] - c[1] * len]; }
  function drawArrow() {
    var t = tipOf(pa, ps), x0 = sx(L.start[0]), y0 = sy(L.start[1]), x1 = sx(t[0]), y1 = sy(t[1]);
    var dx = x1 - x0, dy = y1 - y0, d = Math.sqrt(dx * dx + dy * dy) || 1, ux = dx / d, uy = dy / d;
    g.strokeStyle = "#b8402b"; g.fillStyle = "#b8402b"; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0 + ux * 8, y0 + uy * 8); g.lineTo(x1 - ux * 6, y1 - uy * 6); g.stroke();
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x1 - ux * 10 - uy * 5, y1 - uy * 10 + ux * 5); g.lineTo(x1 - ux * 10 + uy * 5, y1 - uy * 10 - ux * 5); g.closePath(); g.fill();
    // the handle at its tip, to take hold of
    g.lineWidth = 1.2; g.beginPath(); g.arc(x1, y1, 9, 0, 6.3); g.stroke();
  }
  function drawSun(x, y, R, turn) {
    // rays, straight and wavy by turns, engraved in ink
    g.strokeStyle = "rgba(141, 102, 20, 0.85)"; g.lineWidth = 1.1;
    for (var i = 0; i < 16; i++) {
      var a = turn + i * Math.PI / 8, c = Math.cos(a), s = Math.sin(a), r0 = R * 1.12, r1 = R * (i % 2 ? 1.5 : 1.75);
      g.beginPath();
      if (i % 2) { g.moveTo(x + c * r0, y + s * r0); g.lineTo(x + c * r1, y + s * r1); }
      else {
        for (var k = 0; k <= 8; k++) {
          var q = r0 + (r1 - r0) * k / 8, w = Math.sin(k * 1.6) * R * 0.07, px = x + c * q - s * w, py = y + s * q + c * w;
          if (k) g.lineTo(px, py); else g.moveTo(px, py);
        }
      }
      g.stroke();
    }
    var gr = g.createRadialGradient(x - R * 0.35, y - R * 0.35, R * 0.1, x, y, R);
    gr.addColorStop(0, "#fbecb5"); gr.addColorStop(0.55, "#e0b64e"); gr.addColorStop(1, "#a97c1f");
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, 6.3); g.fill();
    g.strokeStyle = "#1f2a44"; g.lineWidth = 1.2; g.stroke();
    g.strokeStyle = "rgba(141, 102, 20, 0.6)"; g.lineWidth = 0.8; g.beginPath(); g.arc(x, y, R * 0.62, 0, 6.3); g.stroke();
  }
  function drawMoon(x, y, R) {
    var gr = g.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R);
    gr.addColorStop(0, "#f2f4f7"); gr.addColorStop(1, "#9aa3b5");
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, 6.3); g.fill();
    g.fillStyle = "rgba(31, 42, 68, 0.25)"; g.beginPath(); g.arc(x, y, R, -1.2, 1.9); g.arc(x - R * 0.35, y, R * 0.85, 1.9, -1.2, true); g.fill();
    g.strokeStyle = "#1f2a44"; g.lineWidth = 1; g.beginPath(); g.arc(x, y, R, 0, 6.3); g.stroke();
  }
  function drawGate(x, y, R, lit, half, times, num, breath) {
    var r = R * (1 + breath * 0.05);
    if (lit) {
      var gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(246, 227, 160, 0.95)"); gr.addColorStop(1, "rgba(201, 154, 46, 0.55)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
      // a star in it
      g.fillStyle = "#8d6614"; var q = r * 0.55;
      g.beginPath(); g.moveTo(x, y - q); g.lineTo(x + q * 0.22, y - q * 0.22); g.lineTo(x + q, y); g.lineTo(x + q * 0.22, y + q * 0.22);
      g.lineTo(x, y + q); g.lineTo(x - q * 0.22, y + q * 0.22); g.lineTo(x - q, y); g.lineTo(x - q * 0.22, y - q * 0.22); g.closePath(); g.fill();
    }
    g.strokeStyle = "rgba(201, 154, 46, " + (0.85 + breath * 0.15) + ")"; g.lineWidth = 3;
    g.beginPath(); g.arc(x, y, r, 0, 6.3); g.stroke();
    g.strokeStyle = "#1f2a44"; g.lineWidth = 0.9;
    g.beginPath(); g.arc(x, y, r + 1.8, 0, 6.3); g.stroke();
    // four ticks, as on a sighting ring
    g.beginPath();
    for (var k = 0; k < 4; k++) { var c = Math.cos(k * Math.PI / 2), s = Math.sin(k * Math.PI / 2); g.moveTo(x + c * (r + 1.8), y + s * (r + 1.8)); g.lineTo(x + c * (r + 5), y + s * (r + 5)); }
    g.stroke();
    if (times === 2) {
      // a ring inside it: gilded once the first pass is made
      g.strokeStyle = half || lit ? "rgba(201, 154, 46, 0.95)" : "rgba(31, 42, 68, 0.6)"; g.lineWidth = half || lit ? 2.2 : 1;
      g.beginPath(); g.arc(x, y, r * 0.62, 0, 6.3); g.stroke();
      tag(x - r * 0.95, y - r * 0.95, "II");
    }
    if (num) tag(x + r * 0.95, y - r * 0.95, String(num));
  }
  // a gate's mark: a numeral in a small inked circle
  function tag(x, y, text) {
    var r = Math.max(7, Math.min(10, SIDE / 60));
    g.fillStyle = "#f8f3e6"; g.strokeStyle = "#1f2a44"; g.lineWidth = 1;
    g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill(); g.stroke();
    g.fillStyle = "#1f2a44"; g.font = "700 " + Math.round(r * 1.15) + "px 'Martian Mono', ui-monospace, monospace";
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, x, y + 0.5);
  }
  // The comet: a bright head ringed in ink and a tail of fine engraved lines
  // trailing along the way it came (at its start mark, a short tail behind
  // the push). With Visual FX on the tail streams: sparks shed from it and
  // fade. Returns how many steps of tail were drawn.
  var sparks = [];
  function drawComet(x, y, fl, on) {
    var steps = 0;
    if (fl) {
      var f = fl.f, t = fl.t, back = 90, p = [0, 0];
      g.lineCap = "round";
      for (var line = 0; line < 3; line++) {
        var off = (line - 1) * 1.4;
        g.beginPath();
        for (var k = 0; k <= 18; k++) {
          var tt = t - back * k / 18; if (tt < 0) break;
          Phys.at(f, tt, p);
          var px = sx(p[0]), py = sy(p[1]);
          if (k === 0) g.moveTo(px + off, py + off); else g.lineTo(px + off * (1 + k / 6), py + off * (1 + k / 6));
          steps = Math.round(t - tt);
        }
        g.strokeStyle = "rgba(31, 42, 68, " + (line === 1 ? 0.55 : 0.3) + ")"; g.lineWidth = line === 1 ? 2 : 1;
        g.stroke();
      }
      g.lineCap = "butt";
      if (on && !P_paused()) {
        if (Math.random() < 0.8) { Phys.at(f, Math.max(0, t - 6), p); sparks.push({ x: p[0] + (Math.random() - 0.5) * 8, y: p[1] + (Math.random() - 0.5) * 8, life: 1 }); }
      }
    } else {
      var c = Phys.sinCosTenths(pa);
      g.strokeStyle = "rgba(31, 42, 68, 0.45)"; g.lineWidth = 1;
      for (var j = -1; j <= 1; j++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x - c[0] * 22 + c[1] * j * 4, y + c[1] * 22 + c[0] * j * 4); g.stroke(); }
    }
    if (on) {
      sparks = sparks.filter(function (s) { return s.life > 0; });
      sparks.forEach(function (s) {
        g.fillStyle = "rgba(201, 154, 46, " + s.life * 0.8 + ")"; g.beginPath(); g.arc(sx(s.x), sy(s.y), 1.3, 0, 6.3); g.fill();
        if (!P_paused()) s.life -= 0.035;
      });
    } else sparks = [];
    var gr = g.createRadialGradient(x, y, 0, x, y, 7);
    gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.6, "#fbe6a6"); gr.addColorStop(1, "rgba(224, 182, 78, 0)");
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, 7, 0, 6.3); g.fill();
    g.strokeStyle = "#1f2a44"; g.lineWidth = 1.2; g.beginPath(); g.arc(x, y, 3.6, 0, 6.3); g.stroke();
    return steps;
  }
  // gates lit in the flight so far (none while a push is aimed)
  function litCounts() {
    var c = [];
    if (!flight) return c;
    for (var i = 0; i < flight.shown; i++) { var e = flight.f.lit[i]; c[e.gate] = e.count; }
    return c;
  }

  // ---- the log and the helm -------------------------------------------------------------
  function hud() {
    if (!L) return;
    $("log-name").textContent = nameOf(chart);
    $("log-tries").textContent = tries;
    var b = $("log-best");
    if (again) { b.textContent = "charted in " + count(bests[chart], "launch", "launches") + "; flown again for the view"; b.className = "log-row log-best won"; }
    else if (flight && flight.won) { b.textContent = "charted in " + count(tries, "launch", "launches"); b.className = "log-row log-best won"; }
    else { b.textContent = "not charted yet"; b.className = "log-row log-best"; }
    // (Launch turns to Skip in flight: both words are in the button, one
    // shown, so it keeps its width)
    var go = $("btn-launch");
    go.classList.toggle("flying", state === "fly");
    go.setAttribute("aria-label", state === "fly" ? "Skip" : "Launch");
    $("btn-reset").disabled = state !== "aim";
    ["n-ccw", "n-cw", "n-less", "n-more"].forEach(function (id) { $(id).disabled = state !== "aim"; });
    dials();
  }
  function dials() {
    var a = pa / 10, s = ps / 10;
    $("dial-a").textContent = ("00" + a.toFixed(1)).slice(-5) + "°";
    $("dial-s").textContent = s.toFixed(1);
  }
  function say(text, cls) { var el = $("status"); el.textContent = text; el.className = "status" + (cls ? " " + cls : ""); }
  function plateHint() { return plateOf(chart).hint; }

  // ---- a chart --------------------------------------------------------------------------
  // n: the chart to fly (null: the one chosen). A chart not charted yet
  // picks up its go where it was left: the count, the push and the last
  // flight's trace; otherwise it starts from its opening push.
  function startChart(n) {
    if (n != null) chart = n;
    store.set("orbits_chart", String(chart));
    audio();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    L = CHARTS[chart];
    again = charted(chart);
    var go = !again && gos[chart];
    if (go && go.t > 0) { tries = go.t | 0; pa = go.a | 0; ps = go.s | 0; lastA = go.la; lastS = go.ls; }
    else { tries = 0; pa = L.push[0]; ps = L.push[1]; lastA = null; lastS = null; }
    trace = lastA != null ? Phys.fly(L, lastA, lastS) : null;
    flight = null; burst = []; sparks = [];
    state = "aim";
    $("menu").hidden = true; $("done").hidden = true; $("log").hidden = false; $("helm").hidden = false;
    say(tries ? "Launches so far: " + tries + ". Adjust the push and launch again." : plateHint(), "");
    prev = Phys.preview(L, pa, ps);
    hud(); layout();
  }
  // Start over (the pause card's Restart): the opening push and no trace;
  // the launches already made still count
  function restartChart() {
    if (!L) return;
    flight = null; burst = []; sparks = [];
    pa = L.push[0]; ps = L.push[1]; trace = null; lastA = null; lastS = null;
    if (again) tries = 0; else if (gos[chart]) { gos[chart].a = pa; gos[chart].s = ps; gos[chart].la = null; gos[chart].ls = null; saveGos(); }
    state = "aim";
    prev = Phys.preview(L, pa, ps);
    say(plateHint(), "");
    hud();
  }
  function saveGos() { store.set("orbits_go", JSON.stringify(gos)); }
  // (only for a chart not yet charted: once charted its count is its record)
  function keepGo() { if (L && !again && !charted(chart) && tries > 0) { gos[chart] = { t: tries, a: pa, s: ps, la: lastA, ls: lastS }; saveGos(); } }

  function setPush(a, s) {
    if (state !== "aim") return;
    a = ((Math.round(a) % 3600) + 3600) % 3600; s = clamp(Math.round(s), S_MIN, S_MAX);
    if (a === pa && s === ps) return;
    pa = a; ps = s;
    prev = Phys.preview(L, pa, ps);
    dials();
  }
  // the arrow's tip put at p (chart units): its bearing and length are the push
  function tipTo(p) {
    var dx = p[0] - L.start[0], dy = p[1] - L.start[1], d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1) return;
    var a = Math.atan2(dx, -dy) * 1800 / Math.PI;
    setPush(a, d / ARROW * 10);
  }

  // Launch: the flight is worked out whole now, and counted now (a chart's
  // count is stored at once, so leaving can't take a launch back)
  function launch() {
    if (state !== "aim" || paused()) return;
    if (trace && pa === lastA && ps === lastS) { say("That push has just flown. Turn it or change its strength first.", "bad"); return; }
    tries++;
    lastA = pa; lastS = ps;
    keepGo();
    flight = { f: Phys.fly(L, pa, ps), t: 0, shown: 0, won: false, born: performance.now() };
    state = "fly";
    sparks = [];
    sfxLaunch();
    say("", "");
    hud();
  }
  // the flight played on by dt steps; gates light as the comet reaches them
  function advance(steps) {
    var fl = flight;
    if (!fl || state !== "fly") return;
    fl.t = Math.min(fl.t + steps, fl.f.n - 1);
    while (fl.shown < fl.f.lit.length && fl.f.lit[fl.shown].at <= fl.t) {
      var e = fl.f.lit[fl.shown]; fl.shown++;
      if (e.done) { burst.push({ g: e.gate, at: performance.now() }); sfxGate(fl.shown - 1); } else sfxHalf();
    }
    if (!fl.won && fl.f.charted !== null && fl.t >= fl.f.charted) won();
    if (fl.t >= fl.f.n - 1) landed();
  }
  // Skip: the rest of the flight at once, its trace drawn whole
  function skip() { if (state === "fly" && !paused()) advance(Phys.STEPS + Phys.HZ * 2); }
  // the last gate lit: the chart is charted, its count kept there and then
  function won() {
    flight.won = true;
    if (!again) {
      bests[chart] = tries;
      store.set("orbits_best", JSON.stringify(bests));
      delete gos[chart]; saveGos();
    }
    sfxCharted();
    say("Charted!", "good");
    hud();
  }
  // the flight is over: the card if it charted, else back to the push with
  // the flight's trace and why it ended
  function landed() {
    var fl = flight;
    if (fl.won) { state = "done"; cardAt = performance.now() + 450; hud(); return; }
    sfxEnd(fl.f.end.kind);
    trace = fl.f;
    var lit = 0; litCounts().forEach(function (c, i) { if (c >= (L.gates[i][2] || 1)) lit++; });
    var why = { sun: "Into the sun.", moon: "It struck the moon.", dust: "Lost in the dust.", edge: "Off the edge of the chart.", time: "It burned out." }[fl.f.end.kind] || "";
    flight = null;
    state = "aim";
    say(why + " " + lit + " of " + count(L.gates.length, "gate", "gates") + " lit. Adjust the push and launch again.", "bad");
    hud();
  }
  function showDone() {
    $("done").hidden = false;
    doneAt = performance.now();
    var last = chart + 1 >= CHARTS.length;
    $("done-title").textContent = last && !again ? "The atlas is charted" : "Charted!";
    $("done-msg").textContent = "in " + count(tries, "launch", "launches");
    var line = document.createElement("span"), pills = document.createElement("span");
    line.textContent = nameOf(chart);
    var pill = function (text, gold) { var s = document.createElement("span"); s.className = "best" + (gold ? " record" : ""); s.textContent = text; pills.appendChild(s); };
    if (again) pill("flown again: its count stays " + bests[chart], false);
    else pill(tries === 1 ? "charted at the first launch" : "kept as this chart's count", true);
    var all = document.createElement("span");
    all.textContent = chartedCount() + " of " + CHARTS.length + " charted · " + count(total(), "launch", "launches") + " in all";
    $("done-stats").replaceChildren(line, pills, all);
    $("next").hidden = last;
  }
  function toMenu() {
    keepGo();
    state = "menu"; flight = null;
    $("done").hidden = true; $("log").hidden = true; $("helm").hidden = true; $("menu").hidden = false;
    paintMenu();
  }

  // ---- the loop, pause and the way out -------------------------------------------------
  var P = GS ? GS.pausable({
    canPause: function () { return state === "aim" || state === "fly"; },
    restart: { go: restartChart, title: "Start this chart over?", text: function () { return again ? "The push goes back to where it began." : "The push goes back to where it began; the launches made so far still count."; }, ok: "Start over" },
    menu: toMenu
  }) : { isPaused: function () { return false; } };
  function paused() { return P.isPaused(); }
  function P_paused() { return P.isPaused(); }
  if (GS && GS.guardLeave) GS.guardLeave({
    // (a comet in the air: leaving loses its flight, though the launch counts)
    active: function () { return state === "fly" && !!flight && !flight.won; },
    pausable: P
  });
  window.addEventListener("pagehide", keepGo);
  document.addEventListener("visibilitychange", function () { if (document.hidden) keepGo(); });
  var last = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    if (!paused()) {
      if (fx()) clock += dt;
      // (a flight's first frame counts only from its launch)
      if (state === "fly") advance(Math.max(0, Math.min(dt, (now - flight.born) / 1000)) * HZ);
    }
    if (state === "done" && $("done").hidden && now >= cardAt) showDone();
    draw();
  }

  // ---- input: dragging the arrow -----------------------------------------------------------
  // A mouse puts the arrow's tip where it points; a finger takes hold of the
  // tip wherever it lands and moves it by as much as it moves, so it never
  // hides the arrow.
  var drag = null;
  cv.addEventListener("pointerdown", function (e) {
    if (state !== "aim" || paused()) return;
    var w = toWorld(e.clientX, e.clientY), tip = tipOf(pa, ps);
    drag = { id: e.pointerId, off: e.pointerType === "mouse" ? [0, 0] : [tip[0] - w[0], tip[1] - w[1]] };
    if (e.pointerType === "mouse") tipTo(w);
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  cv.addEventListener("pointermove", function (e) {
    if (!drag || e.pointerId !== drag.id || state !== "aim" || paused()) return;
    var w = toWorld(e.clientX, e.clientY);
    tipTo([w[0] + drag.off[0], w[1] + drag.off[1]]);
  });
  function endDrag(e) { if (drag && e.pointerId === drag.id) drag = null; }
  cv.addEventListener("pointerup", endDrag);
  cv.addEventListener("pointercancel", endDrag);

  // ---- input: turn and strength ---------------------------------------------------------------
  // ← → turn the push half a degree, ↑ ↓ change its strength by half a unit,
  // a tenth with Shift; held, they run on. The four buttons do the same (a
  // tap on a touch screen a tenth, running on faster when held).
  function nudge(kind, fine) {
    var st = fine ? 1 : 5;
    if (kind === "ccw") setPush(pa - st, ps); else if (kind === "cw") setPush(pa + st, ps);
    else if (kind === "less") setPush(pa, ps - st); else setPush(pa, ps + st);
  }
  var KEYS = { ArrowLeft: "ccw", ArrowRight: "cw", ArrowDown: "less", ArrowUp: "more" };
  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var k = KEYS[e.key];
    if (!k || state !== "aim" || paused() || document.querySelector(".gs-dialog")) return;
    e.preventDefault();
    nudge(k, e.shiftKey);
  });
  [["n-ccw", "ccw"], ["n-cw", "cw"], ["n-less", "less"], ["n-more", "more"]].forEach(function (b) {
    var el = $(b[0]), timer = 0, ticks = 0;
    function stop() { clearTimeout(timer); timer = 0; }
    el.addEventListener("pointerdown", function (e) {
      if (state !== "aim" || paused()) return;
      e.preventDefault();
      var touch = e.pointerType !== "mouse", fine = touch || e.shiftKey;
      nudge(b[1], fine); ticks = 0;
      stop();
      var run = function () { ticks++; nudge(b[1], touch ? ticks < 10 : e.shiftKey); timer = setTimeout(run, touch && ticks >= 10 ? 60 : 70); };
      timer = setTimeout(run, 380);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach(function (ev) { el.addEventListener(ev, stop); });
    // (from the keyboard's Enter or Space on the button itself)
    el.addEventListener("click", function (e) { if (e.detail === 0) nudge(b[1], false); });
    el.addEventListener("mousedown", function (e) { e.preventDefault(); });
  });
  $("btn-launch").addEventListener("click", function () { if (state === "aim") launch(); else if (state === "fly") skip(); });
  $("btn-reset").addEventListener("click", function () {
    if (state !== "aim" || paused()) return;
    setPush(L.push[0], L.push[1]);
    say("The push is back where it began.", "");
  });
  $("btn-charts").addEventListener("click", function () {
    if (state === "done") return;
    if (GS && GS.askQuit && state === "fly" && flight && !flight.won) GS.askQuit({ title: "Leave this flight for the charts?", text: "The launch still counts.", ok: "Charts" }, toMenu); else toMenu();
  });
  ["btn-launch", "btn-reset", "btn-charts"].forEach(function (id) { $(id).addEventListener("mousedown", function (e) { e.preventDefault(); }); });

  // ---- the charts: the list, the chosen one and the card ------------------------------------
  // Every chart is a tile, a plate to a row; a chart opens once the one
  // before it is charted. A tile goes straight in; the chosen chart (the one
  // flown last, or the next to chart) is shown in small above Fly this chart,
  // and the arrows walk the list (the ring choosing as it goes), Enter
  // going into the ringed one.
  var grid = $("grid"), lockNote = $("lock-note"), noteT = 0;
  function paintMenu() {
    paintGrid();
    paintChosen();
    var c = chartedCount();
    // (beside the heading Charts: "3 of 30 · 23 launches")
    $("tally").textContent = c ? c + " of " + CHARTS.length + " · " + count(total(), "launch", "launches") : "";
  }
  function paintGrid() {
    grid.replaceChildren();
    PLATES.forEach(function (pl, p) {
      var k = document.createElement("span");
      k.className = "plate-k";
      k.innerHTML = pl.numeral + "<small></small>";
      k.lastChild.textContent = pl.name;
      grid.appendChild(k);
      CHARTS.forEach(function (C, i) {
        if (C.plate !== p) return;
        var b = document.createElement("button"), open = isOpen(i);
        b.type = "button";
        b.className = "lv" + (open ? "" : " locked") + (charted(i) ? " charted" : "") + (i === chart ? " current" : "");
        b.textContent = i + 1;
        b.setAttribute("aria-label", "Chart " + (i + 1) + ", " + (open ? C.name + (charted(i) ? ", charted in " + count(bests[i], "launch", "launches") : "") : "locked"));
        b.addEventListener("click", function () { if (isOpen(i)) startChart(i); else sayLocked(i, b); });
        grid.appendChild(b);
      });
    });
  }
  function sayLocked(i, b) {
    lockNote.textContent = "Chart " + (i + 1) + " is locked. " + (isOpen(i - 1) ? "Chart " + i + " opens it." : "Chart the ones before it first.");
    // (the tile shakes its head; with Visual FX off the line alone says it)
    if (b) { b.classList.remove("nope"); void b.offsetWidth; b.classList.add("nope"); }
    clearTimeout(noteT);
    noteT = setTimeout(function () { lockNote.textContent = ""; if (b) b.classList.remove("nope"); }, 2600);
  }
  function choose(n) {
    chart = n;
    store.set("orbits_chart", String(chart));
    Array.prototype.forEach.call(grid.querySelectorAll(".lv"), function (t, i) { t.classList.toggle("current", i === chart); });
    paintChosen();
  }
  function paintChosen() {
    var C = CHARTS[chart], go = gos[chart];
    $("pick-name").textContent = C.name;
    $("pick-note").textContent = "chart " + (chart + 1) + " · plate " + plateOf(chart).numeral;
    $("pick-best").textContent = charted(chart) ? "charted in " + count(bests[chart], "launch", "launches") : go && go.t > 0 ? count(go.t, "launch", "launches") + " so far" : "not charted yet";
    $("play").firstChild.textContent = charted(chart) ? "Fly it again" : "Fly this chart";
    paintMini($("pick-pic"), C);
  }
  // a chart in small: its border, dust, suns, gates and the start mark
  function paintMini(c, C) {
    var r = c.getBoundingClientRect(), s = Math.max(40, Math.round(r.width || 76)), d = 2;
    c.width = s * d; c.height = s * d;
    var m = c.getContext("2d"), k = (s - 6) / 1000, X = function (x) { return 3 + x * k; };
    m.setTransform(d, 0, 0, d, 0, 0); m.clearRect(0, 0, s, s);
    m.fillStyle = "rgba(226, 230, 222, 0.7)"; m.fillRect(3, 3, s - 6, s - 6);
    m.strokeStyle = "#1f2a44"; m.lineWidth = 1; m.strokeRect(3, 3, s - 6, s - 6);
    (C.dust || []).forEach(function (q) { m.fillStyle = "rgba(108, 78, 40, 0.4)"; m.beginPath(); m.arc(X(q[0]), X(q[1]), q[2] * k, 0, 6.3); m.fill(); });
    (C.moons || []).forEach(function (q) { var su = C.suns[q.sun]; m.strokeStyle = "rgba(31, 42, 68, 0.4)"; m.setLineDash([1, 2]); m.beginPath(); m.arc(X(su[0]), X(su[1]), q.r * k, 0, 6.3); m.stroke(); m.setLineDash([]); });
    C.suns.forEach(function (q) { m.fillStyle = "#d9ae45"; m.beginPath(); m.arc(X(q[0]), X(q[1]), Math.max(2.5, Phys.SUNS[q[2] || 2].r * k * 1.2), 0, 6.3); m.fill(); m.strokeStyle = "#1f2a44"; m.lineWidth = 0.7; m.stroke(); });
    C.gates.forEach(function (q) { m.strokeStyle = "#b38726"; m.lineWidth = 1.4; m.beginPath(); m.arc(X(q[0]), X(q[1]), Math.max(2.5, Phys.GATE_R * k * 1.3), 0, 6.3); m.stroke(); });
    m.fillStyle = "#b8402b"; m.beginPath(); m.arc(X(C.start[0]), X(C.start[1]), 2, 0, 6.3); m.fill();
  }
  // the ring on an open chart chooses it; on a locked one the line says why
  new MutationObserver(function () {
    var t = grid.querySelector(".lv[data-gs-pick]"), i = Array.prototype.indexOf.call(grid.querySelectorAll(".lv"), t);
    if (i < 0) return;
    if (isOpen(i)) { if (i !== chart) choose(i); } else sayLocked(i, null);
  }).observe(grid, { subtree: true, attributes: true, attributeFilter: ["data-gs-pick"] });
  $("play").addEventListener("click", function () { startChart(chart); });
  $("next").addEventListener("click", function () { startChart(Math.min(CHARTS.length - 1, chart + 1)); });
  $("again").addEventListener("click", function () { startChart(chart); });
  $("to-charts").addEventListener("click", toMenu);

  // the turn and strength buttons: a drawn arrow each (no lent glyphs)
  var ICON = {
    "n-ccw": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 13a7 7 0 1 1-2.1-5"/><path d="M17.5 2.8v5h-5"/></svg>',
    "n-cw": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13a7 7 0 1 0 2.1-5"/><path d="M6.5 2.8v5h5"/></svg>',
    "n-less": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
    "n-more": '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>'
  };
  Object.keys(ICON).forEach(function (id) { $(id).innerHTML = ICON[id]; });

  if (GS && GS.gridKeys) {
    GS.gridKeys({ active: function () { return state === "menu"; }, sel: "#grid .lv",
      first: function () { return grid.querySelector(".lv.current"); } });
    $("charts-k").insertAdjacentHTML("beforeend", GS.gridKeys.hint());
  }
  if (GS && GS.menuKeys) {
    // the chosen chart: Space or Enter flies it
    GS.menuKeys({ active: function () { return state === "menu"; }, groups: [], start: "#play", space: true });
    // flying: Space or Enter launches (or skips the rest of a flight), R the
    // opening push, Backspace the charts (asking with a comet in the air);
    // the arrows wear their keys on the four buttons
    GS.menuKeys({ active: function () { return (state === "aim" || state === "fly") && !paused(); },
      groups: [{ sel: "#btn-reset", keys: ["r"] }, { sel: "#btn-charts", keys: ["backspace"] }], start: "#btn-launch", space: true });
    // charted: Space or Enter the next chart (not in its first moment), R again, Backspace the charts
    GS.menuKeys({ active: function () { return state === "done" && !$("done").hidden && performance.now() - doneAt > DONE_WAIT; },
      groups: [{ sel: "#again", keys: ["r"] }, { sel: "#to-charts", keys: ["backspace"] }], start: "#next", space: true });
  }
  [["n-ccw", "←"], ["n-cw", "→"], ["n-less", "↓"], ["n-more", "↑"]].forEach(function (b) { $(b[0]).setAttribute("data-gs-key", b[1]); });

  window.addEventListener("resize", function () { layout(); if (state === "menu") paintChosen(); });
  // (on a tall screen the chart takes the room the log and helm leave: when
  // a line of theirs grows or shrinks, it is laid out again)
  if (window.ResizeObserver) {
    var seen = {}, ro = new ResizeObserver(function (es) {
      var moved = false;
      es.forEach(function (e) { var h = Math.round(e.target.offsetHeight); if (seen[e.target.id] !== h) { seen[e.target.id] = h; moved = true; } });
      if (moved && !wide && state !== "menu") layout();
    });
    ro.observe($("log")); ro.observe($("helm"));
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { layout(); if (state === "menu") paintChosen(); });
  toMenu();
  layout();
  requestAnimationFrame(function (t) { last = t; requestAnimationFrame(loop); });

  // test hooks: the Playwright harness drives the charts through these
  window.Orbits = {
    count: CHARTS.length,
    state: function () { return state; },
    chart: function () { return chart; },
    level: function (n) { return CHARTS[n == null ? chart : n]; },
    isOpen: isOpen,
    start: startChart,
    toMenu: toMenu,
    restart: restartChart,
    push: function () { return [pa, ps]; },
    setPush: setPush,
    tipTo: tipTo,
    launch: launch,
    skip: skip,
    tries: function () { return tries; },
    again: function () { return again; },
    best: function (n) { var v = bests[n == null ? chart : n]; return v == null ? null : v; },
    go: function (n) { return gos[n == null ? chart : n] || null; },
    // a flight through the page's physics, summed up
    fly: function (n, a, s) { var f = Phys.fly(CHARTS[n], a, s); return { hash: Phys.hash(f), end: f.end.kind, charted: f.charted, preview: f.preview, why: f.previewWhy, n: f.n, lit: f.lit.length, first: f.lit.length ? f.lit[0].at : null }; },
    // where a point of the chart is on the screen (client px)
    screen: function (x, y) { var r = cv.getBoundingClientRect(); return [r.left + sx(x), r.top + sy(y)]; },
    flight: function () { return flight ? { t: flight.t, n: flight.f.n, shown: flight.shown, won: flight.won, end: flight.f.end.kind, charted: flight.f.charted, hash: Phys.hash(flight.f) } : null; },
    trace: function () { return trace ? { n: trace.n, end: trace.end.kind, hash: Phys.hash(trace) } : null; },
    preview: function () { return prev ? { end: prev.preview, n: prev.n } : null; },
    pause: function (on) { if (on) P.pause(); else P.resume(); },
    drawn: function () { return drawn; }
  };
})();
