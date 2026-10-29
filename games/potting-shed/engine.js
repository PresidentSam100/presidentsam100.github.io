/* =====================================================================
   Potting Shed: the rules, shared by the game (game.js) and the shed
   editor (editor.js), so a shed built there plays the same here.

   A shed is rows of characters: # a bench, space the floor, . a patch of
   sun, $ a pot, * a pot in the sun, @ the gardener, + the gardener in the
   sun. parse() reads one; move() is one step (a pot goes one cell where
   it's pushed, never into a bench or another pot, and nothing pulls);
   problems() says what stops a shed being played; solver() finds the
   fewest pushes that put every pot in the sun, a slice at a time so a
   page never freezes; encode() and decode() carry a shed in a link
   ("#play=s1.<base64 of its JSON>"), the prefix letting the format change
   without breaking old links.
   ===================================================================== */
(function (root, factory) {
  var mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.PottingShedEngine = mod;
})(this, function () {
  "use strict";

  // a shed of your own: 5 to 16 cells across, 5 to 12 down
  var MIN_W = 5, MAX_W = 16, MIN_H = 5, MAX_H = 12;

  function parse(rows) {
    var h = rows.length, w = 0, i;
    for (i = 0; i < h; i++) w = Math.max(w, rows[i].length);
    var L = { w: w, h: h, wall: [], sun: [], pots: [], me: 0 };
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var c = rows[y][x] || " ", k = y * w + x;
      L.wall[k] = c === "#";
      L.sun[k] = c === "." || c === "*" || c === "+";
      if (c === "$" || c === "*") L.pots.push(k);
      if (c === "@" || c === "+") L.me = k;
    }
    // the floor outside the walls is no floor at all: flood from the gardener
    L.inside = []; var q = [L.me]; L.inside[L.me] = true;
    while (q.length) { var at = q.pop(); [1, -1, w, -w].forEach(function (d) { var n2 = at + d; if (n2 >= 0 && n2 < w * h && !L.wall[n2] && !L.inside[n2]) { L.inside[n2] = true; q.push(n2); } }); }
    return L;
  }

  // One step (dx, dy as -1 / 0 / 1): null where a bench, or a pot that can't
  // go, stops it; else where the gardener and the pots are now, and which
  // pot was pushed (-1 for none) from where to where
  function move(L, me, pots, dx, dy) {
    var d = dx + dy * L.w, to = me + d;
    if (L.wall[to]) return null;
    var p = pots.indexOf(to);
    if (p < 0) return { me: to, pots: pots, pushed: -1 };
    var beyond = to + d;
    if (L.wall[beyond] || pots.indexOf(beyond) >= 0) return null;
    var np = pots.slice(); np[p] = beyond;
    return { me: to, pots: np, pushed: p, from: to, to: beyond };
  }

  // the cells the gardener can get to from `from` (benches stop him, pots
  // too unless `through`), by a flood that stays on the grid
  function reach(L, from, pots, through) {
    var seen = new Uint8Array(L.w * L.h), q = [from], blocked = {};
    if (!through) pots.forEach(function (k) { blocked[k] = 1; });
    seen[from] = 1;
    while (q.length) {
      var at = q.pop(), x = at % L.w, y = (at - x) / L.w;
      var next = [x > 0 ? at - 1 : -1, x < L.w - 1 ? at + 1 : -1, y > 0 ? at - L.w : -1, y < L.h - 1 ? at + L.w : -1];
      for (var i = 0; i < 4; i++) {
        var n = next[i];
        if (n < 0 || seen[n] || L.wall[n] || blocked[n]) continue;
        seen[n] = 1; q.push(n);
      }
    }
    return seen;
  }

  // What stops a shed being played, in words (none: it can be played). The
  // room has to be closed (no floor the gardener can reach on its edge) and
  // every pot and patch of sun within his reach, pots counted as movable.
  function problems(rows) {
    var errs = [];
    if (!Array.isArray(rows) || !rows.length) return ["the shed is empty"];
    var h = rows.length, w = 0, x, y, at = function (x, y) { return rows[y][x] || " "; };
    rows.forEach(function (r) { w = Math.max(w, r.length); });
    if (w < MIN_W || w > MAX_W || h < MIN_H || h > MAX_H) errs.push("a shed is " + MIN_W + " to " + MAX_W + " cells across and " + MIN_H + " to " + MAX_H + " down");
    var me = 0, pots = 0, suns = 0, out = 0;
    for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
      var c = at(x, y);
      if (c === "@" || c === "+") me++;
      if (c === "$" || c === "*") pots++;
      if (c === "." || c === "*" || c === "+") suns++;
      if (c === "$") out++;
    }
    if (me === 0) errs.push("put the gardener in the shed");
    else if (me > 1) errs.push("there are " + me + " gardeners: paint over all but one");
    if (pots === 0) errs.push("put at least one pot in the shed");
    else if (pots !== suns) errs.push(count(pots, "pot", "pots") + " but " + count(suns, "patch", "patches") + " of sun: they have to match");
    else if (out === 0) errs.push("every pot is in the sun already: move one out");
    if (errs.length) return errs;
    var L = parse(rows), seen = reach(L, L.me, L.pots, true), where = function (k) { return "row " + (Math.floor(k / w) + 1) + ", column " + (k % w + 1); };
    for (var k = 0; k < w * h; k++) {
      if (!seen[k]) continue;
      x = k % w; y = (k - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { errs.push("the shed isn't closed: the gardener could walk out at " + where(k) + " (put a bench there)"); break; }
    }
    L.pots.forEach(function (k) { if (!seen[k]) errs.push("the pot at " + where(k) + " is shut away where the gardener can't get to it"); });
    for (k = 0; k < w * h; k++) if (L.sun[k] && !seen[k]) errs.push("the patch of sun at " + where(k) + " is shut away where no pot can get to it");
    return errs;
  }
  function count(n, one, many) { return n + " " + (n === 1 ? one : many); }

  // ---- the solver ---------------------------------------------------------------------------
  // A search, breadth first, over the pots' places and the part of the shed
  // the gardener can get to, so the first answer found is in the fewest
  // pushes (and the walks between them are the shortest for those pushes'
  // order). Pots are never pushed onto a cell no pot can get from to the sun
  // (a corner, a bench edge without sun), nor into a block of four with a
  // pot out of the sun. It runs `run(ms)` a slice at a time; it gives up
  // after opts.most positions (200,000 by default) or opts.seconds of
  // searching (30 by default).
  //   s = solver(L); s.run(12) -> { done, found, pushes, moves, path, given, nodes }
  function solver(L, opts) {
    opts = opts || {};
    var most = opts.most || 200000, limit = (opts.seconds || 30) * 1000, spent = 0, w = L.w, n = L.w * L.h, D = [1, -1, w, -w];
    var goals = []; for (var k = 0; k < n; k++) if (L.sun[k]) goals.push(k);
    // live: a cell a pot can be pulled to from a patch of sun (any other is dead)
    var live = new Uint8Array(n), q = goals.slice();
    goals.forEach(function (g) { live[g] = 1; });
    while (q.length) {
      var at = q.pop();
      for (var i = 0; i < 4; i++) {
        var p = at + D[i], b = p + D[i];   // a pot at p, pulled back to `at` by a gardener standing on b
        if (p < 0 || p >= n || b < 0 || b >= n || live[p] || L.wall[p] || L.wall[b] || !L.inside[p] || !L.inside[b]) continue;
        if (Math.abs((p % w) - (at % w)) > 1 || Math.abs((b % w) - (p % w)) > 1) continue;
        live[p] = 1; q.push(p);
      }
    }
    function solvedBy(ps) { for (var i = 0; i < ps.length; i++) if (!L.sun[ps[i]]) return false; return true; }
    // a block of four cells, each a bench or a pot, with a pot out of the sun: none can move again
    function stuck(ps, c) {
      var set = {}; ps.forEach(function (k) { set[k] = 1; });
      var full = function (k) { return k >= 0 && k < n && (L.wall[k] || set[k]); };
      var cx = c % w;
      for (var oy = -1; oy <= 0; oy++) for (var ox = -1; ox <= 0; ox++) {
        if (cx + ox < 0 || cx + ox + 1 >= w) continue;
        var tl = c + ox + oy * w, cells = [tl, tl + 1, tl + w, tl + w + 1], all = true, loose = false;
        for (var j = 0; j < 4; j++) { if (!full(cells[j])) { all = false; break; } if (set[cells[j]] && !L.sun[cells[j]]) loose = true; }
        if (all && loose) return true;
      }
      return false;
    }
    var mark = new Int32Array(n), gen = 0;
    // the gardener's reach (pots stop him): marks it, returns its smallest cell
    function region(me, set) {
      gen++;
      var st = [me], low = me;
      mark[me] = gen;
      while (st.length) {
        var at = st.pop(), x = at % w;
        for (var i = 0; i < 4; i++) {
          var m = at + D[i];
          if (m < 0 || m >= n || (i < 2 && Math.abs((m % w) - x) !== 1) || mark[m] === gen || L.wall[m] || set[m]) continue;
          mark[m] = gen; st.push(m); if (m < low) low = m;
        }
      }
      return low;
    }
    var start = L.pots.slice().sort(function (a, b) { return a - b; });
    var nodes = [{ pots: start, me: L.me, up: -1, push: null }], head = 0, seen = new Set(), result = null, expanded = 0;
    if (solvedBy(start)) result = { done: true, found: true, pushes: 0, moves: 0, path: "" };
    function finish(i) {
      // the pushes back to the start, then the walks between them
      var pushes = [];
      for (var j = i; nodes[j].up >= 0; j = nodes[j].up) pushes.unshift(nodes[j].push);
      var me = L.me, ps = L.pots.slice(), path = "", LET = {}; LET[1] = "R"; LET[-1] = "L"; LET[w] = "D"; LET[-w] = "U";
      pushes.forEach(function (pu) {
        path += walk(me, pu.c - pu.d, ps);
        path += LET[pu.d];
        ps[ps.indexOf(pu.c)] = pu.c + pu.d; me = pu.c;
      });
      return { done: true, found: true, pushes: pushes.length, moves: path.length, path: path, nodes: expanded };
    }
    // the shortest walk from a to b, round the pots, as L R U D
    function walk(a, b, ps) {
      if (a === b) return "";
      var set = {}; ps.forEach(function (k) { set[k] = 1; });
      var prev = new Int32Array(n).fill(-2), qq = [a], LET = {}; LET[1] = "R"; LET[-1] = "L"; LET[w] = "D"; LET[-w] = "U";
      prev[a] = -1;
      for (var qi = 0; qi < qq.length; qi++) {
        var at = qq[qi], x = at % w;
        for (var i = 0; i < 4; i++) {
          var m = at + D[i];
          if (m < 0 || m >= n || (i < 2 && Math.abs((m % w) - x) !== 1) || prev[m] !== -2 || L.wall[m] || set[m]) continue;
          prev[m] = at; qq.push(m);
          if (m === b) { var out = ""; for (var c = b; prev[c] !== -1; c = prev[c]) out = LET[c - prev[c]] + out; return out; }
        }
      }
      return "";
    }
    function run(ms) {
      if (result) return result;
      var t0 = Date.now();
      while (head < nodes.length) {
        if (expanded >= most || spent + Date.now() - t0 >= limit) { result = { done: true, found: false, given: true, nodes: expanded }; return result; }
        var nd = nodes[head], i = head++, set = {};
        nd.pots.forEach(function (k) { set[k] = 1; });
        var low = region(nd.me, set), key = nd.pots.join(",") + "|" + low;
        if (seen.has(key)) continue;
        seen.add(key); expanded++;
        for (var pi = 0; pi < nd.pots.length; pi++) {
          var c = nd.pots[pi], cx = c % w;
          for (var di = 0; di < 4; di++) {
            var d = D[di], from = c - d, to = c + d;
            if (from < 0 || from >= n || to < 0 || to >= n) continue;
            if (di < 2 && (Math.abs((from % w) - cx) !== 1 || Math.abs((to % w) - cx) !== 1)) continue;
            if (mark[from] !== gen || L.wall[to] || set[to] || !live[to]) continue;
            var ps = nd.pots.slice(); ps[pi] = to; ps.sort(function (a, b) { return a - b; });
            if (stuck(ps, to)) continue;
            nodes.push({ pots: ps, me: c, up: i, push: { c: c, d: d } });
            if (solvedBy(ps)) { result = finish(nodes.length - 1); return result; }
          }
        }
        if (Date.now() - t0 >= ms) { spent += Date.now() - t0; return { done: false, nodes: expanded }; }
      }
      result = { done: true, found: false, nodes: expanded };
      return result;
    }
    return { run: run, nodes: function () { return expanded; } };
  }

  // ---- share codes --------------------------------------------------------------------------
  // Only the name and the map survive, the map held to the shed's limits and
  // the characters a shed knows, so a pasted code can't smuggle anything in.
  function clean(shed) {
    if (!shed || typeof shed !== "object" || !Array.isArray(shed.map)) throw new Error("not a shed (no map)");
    if (shed.map.length < MIN_H || shed.map.length > MAX_H) throw new Error("a shed is " + MIN_H + " to " + MAX_H + " rows");
    var w = 0, map = shed.map.map(function (r) { r = String(r).replace(/[^# .$*@+]/g, " "); w = Math.max(w, r.length); return r; });
    if (w < MIN_W || w > MAX_W) throw new Error("a shed is " + MIN_W + " to " + MAX_W + " cells across");
    map = map.map(function (r) { while (r.length < w) r += " "; return r; });
    var name = typeof shed.name === "string" ? shed.name.trim().slice(0, 40) : "";
    return { name: name || "A shed of your own", map: map };
  }
  function toB64(str) {
    if (typeof Buffer !== "undefined") return Buffer.from(str, "utf8").toString("base64");
    return btoa(unescape(encodeURIComponent(str)));
  }
  function fromB64(b64) {
    if (typeof Buffer !== "undefined") return Buffer.from(b64, "base64").toString("utf8");
    return decodeURIComponent(escape(atob(b64)));
  }
  function encode(shed) {
    return "s1." + toB64(JSON.stringify(clean(shed))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  // a bare code, or any text (a whole link) holding "play=<code>"
  function decode(text) {
    var m = /(?:play=)?(s1\.[A-Za-z0-9_-]+)/.exec(String(text || "").trim());
    if (!m) throw new Error("not a Potting Shed code");
    var b64 = m[1].slice(3).replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var json;
    try { json = JSON.parse(fromB64(b64)); } catch (e) { throw new Error("that shed's code is damaged"); }
    return clean(json);
  }

  return { parse: parse, move: move, reach: reach, problems: problems, solver: solver, clean: clean, encode: encode, decode: decode,
    MIN_W: MIN_W, MAX_W: MAX_W, MIN_H: MIN_H, MAX_H: MAX_H };
});
