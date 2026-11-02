/* =====================================================================
   Orbits: chart checker. Node only, NOT loaded by any page.

     node _dev/tools/orbits-check.js          every chart: find its best push
     node _dev/tools/orbits-check.js 7        chart 7 only (1-based)
     node _dev/tools/orbits-check.js --check  test the pushes stored in
                                              _dev/tests/orbits.js instead

   Flies each chart through the game's own physics.js. A sweep over the
   pushes (every half degree of bearing and half unit of strength, the keys'
   step) finds those that chart it; the one kept is the push with the widest
   margin: how far, in tenths, bearing and strength can both be off and the
   chart still be charted. 3 or more is needed: a patch 0.6 wide each way
   always holds a point of the keys' half steps, wherever they start (and a
   tenth, on Shift or a tap on a phone, reaches any push at all). It also
   prints the share of all pushes that chart it (how hard the chart is to
   find), and checks that the opening push doesn't chart it and that the
   dotted line for the kept push stops before its first gate, by its own
   length or at the first swing past a sun (a push whose line is cut short
   near a gate is passed over: that line would point at the gate). The last
   line is a SOLUTIONS array for the test file.
   ===================================================================== */
"use strict";
var fs = require("fs"), path = require("path");
var P = require("../../games/orbits/physics.js");
var LV = require("../../games/orbits/levels.js");

var args = process.argv.slice(2);
var only = args[0] && /^\d+$/.test(args[0]) ? Number(args[0]) : 0;
var checkMode = args.indexOf("--check") !== -1;

function wrap(a) { return ((a % 3600) + 3600) % 3600; }
function charts(L, a, s) { return s >= P.S_MIN && s <= P.S_MAX && P.fly(L, wrap(a), s).charted !== null; }
// the widest m (tenths, up to cap) with every push within m of (a, s) charting
function margin(L, a, s, cap) {
  if (!charts(L, a, s)) return -1;
  for (var m = 1; m <= cap; m++) {
    for (var d = -m; d <= m; d++) {
      if (!charts(L, a + d, s - m) || !charts(L, a + d, s + m) || !charts(L, a - m, s + d) || !charts(L, a + m, s + d)) return m - 1;
    }
  }
  return cap;
}
function report(n, L, a, s) {
  var f = P.fly(L, a, s), open = P.fly(L, L.push[0], L.push[1]);
  var m = margin(L, a, s, 12), before = f.lit.length > 0 && f.preview < f.lit[0].at && f.previewWhy !== "gate";
  var ok = f.charted !== null && m >= 3 && open.charted === null && before;
  return { ok: ok, line: String(n + 1).padStart(2) + " " + L.name.padEnd(18) + " " + (a + "/" + s).padEnd(9) + " margin " + m + "  line ends: " + f.previewWhy.padEnd(6) + (open.charted !== null ? "  OPENING PUSH CHARTS IT" : "") + (before ? "" : "  DOTTED LINE RUNS UP TO A GATE") + (ok ? "" : "  FAIL") };
}

var bad = 0, sols = [];
if (checkMode) {
  var src = fs.readFileSync(path.join(__dirname, "..", "tests", "orbits.js"), "utf8");
  var stored = JSON.parse(/const SOLUTIONS = (\[[\s\S]*?\]);/.exec(src)[1]);
  LV.charts.forEach(function (L, n) {
    if (only && n + 1 !== only) return;
    var r = stored[n] ? report(n, L, stored[n][0], stored[n][1]) : { ok: false, line: String(n + 1).padStart(2) + " " + L.name + "  NO STORED PUSH" };
    if (!r.ok) bad++;
    console.log(r.line);
  });
} else {
  LV.charts.forEach(function (L, n) {
    if (only && n + 1 !== only) return;
    var t0 = Date.now(), hit = {}, list = [], total = 0;
    for (var a = 0; a < 3600; a += 5) for (var s = P.S_MIN; s <= P.S_MAX; s += 5) {
      total++;
      var f = P.fly(L, a, s);
      if (f.charted !== null) { hit[a + "," + s] = true; if (f.previewWhy !== "gate") list.push([a, s]); }
    }
    // each hit scored by how many pushes round it chart too (read off the
    // sweep, no more flights); the margins measured for the best forty, and
    // further down the list while none has reached 4
    var on = function (a, s) { return !!hit[wrap(a) + "," + s]; };
    list.forEach(function (h) {
      var sc = 0;
      for (var da = -15; da <= 15; da += 5) for (var ds = -15; ds <= 15; ds += 5) if (on(h[0] + da, h[1] + ds)) sc++;
      h.push(sc);
    });
    list.sort(function (p, q) { return q[2] - p[2]; });
    var top = null;
    for (var i = 0; i < list.length && (i < 40 || (top.m < 4 && i < 600)); i++) {
      var m = margin(L, list[i][0], list[i][1], 12);
      if (!top || m > top.m) top = { a: list[i][0], s: list[i][1], m: m };
    }
    if (!top || top.m < 0) { console.log(String(n + 1).padStart(2) + " " + L.name + "  NO PUSH CHARTS IT"); bad++; sols.push(null); return; }
    var r = report(n, L, top.a, top.s);
    if (!r.ok) bad++;
    console.log(r.line + "  share " + (1000 * Object.keys(hit).length / total).toFixed(2) + " per mille  [" + (Date.now() - t0) + "ms]");
    sols.push([top.a, top.s]);
  });
  if (!only) console.log("const SOLUTIONS = " + JSON.stringify(sols) + ";");
}
if (bad) { console.log(bad + " chart(s) failed"); process.exitCode = 1; } else console.log("all charts ok");
