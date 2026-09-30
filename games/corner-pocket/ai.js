/* Corner Pocket — the CPU player. It lines up every pot the geometry allows
   (ghost ball, cut angle, clear paths), then plays the promising ones out on
   a copy of the table with the real physics and judges each result with the
   real rules: keep the turn, get position for the next ball, never scratch,
   never sink the 8 early. With nothing to pot it plays safe. The levels
   differ in how many shots they consider, how much they care about
   position, and how steady their cue arm is.

   The search is time-sliced: call step(ms) once a frame until it's done. */
(function (root) {
  "use strict";
  var P = root.PoolPhysics, Ru = root.PoolRules;
  var R = P.R, L = P.L, W = P.W;

  var LEVELS = [
    { name: "Easy", cands: 4, places: 3, powers: [0.24, 0.42], spins: [[0, 0]],
      aim: 0.017, pow: 0.12, safety: false, position: false, pick: 3, robust: false },
    { name: "Medium", cands: 7, places: 5, powers: [0.18, 0.3, 0.48], spins: [[0, 0], [0, 0.55], [0, -0.6]],
      aim: 0.0065, pow: 0.05, safety: true, position: true, pick: 1, robust: false },
    { name: "Hard", cands: 10, places: 8, powers: [0.16, 0.26, 0.4, 0.62], spins: [[0, 0], [0, 0.6], [0, -0.7], [0.45, 0.2]],
      aim: 0.0016, pow: 0.02, safety: true, position: true, pick: 1, robust: true }
  ];

  var now = (typeof performance !== "undefined" && performance.now) ? function () { return performance.now(); } : Date.now;

  function gauss(rng) {
    var u = Math.max(1e-9, rng()), v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  // Is the straight path from (x1,y1) to (x2,y2) clear for a ball's centre?
  function clear(balls, x1, y1, x2, y2, skipA, skipB) {
    var dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy, lim = 4 * R * R * 0.998;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.on || b.id === skipA || b.id === skipB) continue;
      var t = len2 ? ((b.x - x1) * dx + (b.y - y1) * dy) / len2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      var ex = x1 + dx * t - b.x, ey = y1 + dy * t - b.y;
      if (ex * ex + ey * ey < lim) return false;
    }
    return true;
  }

  // Can ball ob run into pocket k at all? The line it must take, and the
  // ghost-ball spot the cue ball has to reach to send it there.
  function potLine(balls, ob, k) {
    var pk = P.pockets[k];
    var ax = pk.mx + pk.ox * 0.02, ay = pk.my + pk.oy * 0.02;
    var ux = ax - ob.x, uy = ay - ob.y, d2 = Math.sqrt(ux * ux + uy * uy);
    if (d2 < 1e-6) return null;
    ux /= d2; uy /= d2;
    if (ux * pk.ox + uy * pk.oy < (pk.side ? 0.55 : 0.45)) return null;   // can't get into the pocket from that angle
    var gx = ob.x - ux * 2 * R, gy = ob.y - uy * 2 * R;
    if (gx < R * 0.9 || gx > L - R * 0.9 || gy < R * 0.9 || gy > W - R * 0.9) return null;
    if (!clear(balls, ob.x, ob.y, ax, ay, 0, ob.id)) return null;
    return { ux: ux, uy: uy, gx: gx, gy: gy, d2: d2, side: pk.side };
  }

  // A pot as the geometry sees it from the cue ball at (cx, cy): the aim, and
  // how easy it looks.
  function shotGeom(balls, cx, cy, ob, k) {
    var pl = potLine(balls, ob, k);
    if (!pl) return null;
    var dx = pl.gx - cx, dy = pl.gy - cy, d1 = Math.sqrt(dx * dx + dy * dy);
    if (d1 < 1e-6) return null;
    dx /= d1; dy /= d1;
    var cosCut = dx * pl.ux + dy * pl.uy;
    if (cosCut < 0.26) return null;                                        // thinner than ~75°
    if (!clear(balls, cx, cy, pl.gx, pl.gy, 0, ob.id)) return null;
    var ease = cosCut * cosCut / (1 + d1 * 0.7) / (1 + pl.d2 * 0.9) * (pl.side ? 0.8 : 1);
    return { id: ob.id, k: k, angle: Math.atan2(dy, dx), ease: ease, cut: Math.acos(Math.min(1, cosCut)) };
  }

  function candidates(balls, st, cx, cy) {
    var out = [], ts = Ru.targets(st, balls);
    for (var i = 0; i < ts.length; i++) {
      var ob = P.byId(balls, ts[i]);
      for (var k = 0; k < 6; k++) {
        var g = shotGeom(balls, cx, cy, ob, k);
        if (g) out.push(g);
      }
    }
    out.sort(function (a, b) { return b.ease - a.ease; });
    return out;
  }

  // how good a table is for `player` shooting next from where the cue ball lies
  function outlook(balls, st, player) {
    var cue = balls[0];
    if (!cue.on) return { best: 0.6, count: 3 };   // ball in hand: roughly a good shot
    var s2 = Ru.copy(st);
    s2.turn = player;
    var c = candidates(balls, s2, cue.x, cue.y);
    return { best: c.length ? c[0].ease : 0, count: c.length };
  }

  function scoreOutcome(st, balls0, w, call, lv) {
    var r = Ru.resolve(st, balls0, w.ev, call), me = st.turn;
    if (r.out.winner === me) return 1e5;
    if (r.out.winner >= 0) return -1e5;
    if (r.out.foul) return -2000;
    if (r.out.cont) {
      if (!lv.position) return 1000;
      var o = outlook(w.balls, r.st, me);
      return 1000 + 600 * o.best + 20 * Math.min(o.count, 5);
    }
    var opp = outlook(w.balls, r.st, 1 - me);
    return -600 * opp.best - 10 * Math.min(opp.count, 5);
  }

  function breakShot(balls, level, rng) {
    var y = W / 2 + (rng() - 0.5) * 0.3;
    var place = { x: P.HEAD_X - 0.03, y: y };
    var apex = null, bd = Infinity;
    for (var i = 1; i < balls.length; i++) {
      var d = Math.abs(balls[i].x - P.FOOT_X) + Math.abs(balls[i].y - W / 2);
      if (d < bd) { bd = d; apex = balls[i]; }
    }
    return { place: place, angle: Math.atan2(apex.y - y, apex.x - place.x) + gauss(rng) * 0.002,
             power: level === 0 ? 0.85 : 0.97, tipX: 0, tipY: -0.15, call: -1 };
  }

  function plan(balls, st, level, rng) {
    var lv = LEVELS[level] || LEVELS[1];
    var needCall = Ru.needsCall(st, balls);
    var tasks = [], results = [], phase = 0, result = null;

    if (st.isBreak) {
      result = breakShot(balls, level, rng);
      return { step: function () { return true; }, get result() { return result; } };
    }

    function evalTask(base, place, cand, power, spin) {
      return function () {
        var shot = { angle: cand.angle, power: power, tipX: spin[0], tipY: spin[1], place: place,
                     call: needCall ? cand.k : -1, target: cand.id, pocket: cand.k, base: base };
        var w = P.simulate(base, shot);
        shot.score = scoreOutcome(st, base, w, shot.call, lv);
        results.push(shot);
      };
    }
    function queueCand(base, place, cand) {
      for (var p = 0; p < lv.powers.length; p++)
        for (var s = 0; s < lv.spins.length; s++)
          tasks.push(evalTask(base, place, cand, lv.powers[p], lv.spins[s]));
    }

    function withCueAt(x, y) {
      var b = P.cloneBalls(balls);
      var cue = b[0];
      cue.on = true; cue.pocket = -1; cue.x = x; cue.y = y;
      cue.vx = cue.vy = cue.wx = cue.wy = cue.sz = 0;
      return b;
    }

    // `home` is the table the safety search and the last-resort shot use:
    // the live table, or with ball in hand, the cue ball at its best spot.
    var home = balls, homePlace = null;
    if (st.inHand === "any") {
      // Ball in hand: set the cue ball up behind a pot, then search from there.
      var spots = [], ts = Ru.targets(st, balls);
      for (var i = 0; i < ts.length; i++) {
        var ob = P.byId(balls, ts[i]);
        for (var k = 0; k < 6; k++) {
          var pl = potLine(balls, ob, k);
          if (!pl) continue;
          var angs = [0, 0.35, -0.35], dists = [0.2, 0.38];
          for (var a = 0; a < angs.length; a++) for (var d = 0; d < dists.length; d++) {
            var ca = Math.cos(angs[a]), sa = Math.sin(angs[a]);
            var dx = pl.ux * ca - pl.uy * sa, dy = pl.ux * sa + pl.uy * ca;
            var cx = pl.gx - dx * dists[d], cy = pl.gy - dy * dists[d];
            if (!P.placeOk(balls, cx, cy, false)) continue;
            var g = shotGeom(balls, cx, cy, ob, k);
            if (g) spots.push({ x: cx, y: cy, g: g });
          }
        }
      }
      spots.sort(function (p, q) { return q.g.ease - p.g.ease; });
      var used = 0;
      for (var s = 0; s < spots.length && used < lv.places; s++) {
        var dupe = false;
        for (var t = 0; t < s; t++) if (spots[t].g.id === spots[s].g.id && spots[t].g.k === spots[s].g.k && Math.abs(spots[t].x - spots[s].x) + Math.abs(spots[t].y - spots[s].y) < 0.15) dupe = true;
        if (dupe) continue;
        used++;
        queueCand(withCueAt(spots[s].x, spots[s].y), { x: spots[s].x, y: spots[s].y }, spots[s].g);
      }
      // nothing lines up: put it somewhere sensible and look for a safety from there
      var hs = spots.length ? spots[0] : P.nearestFree(balls, P.HEAD_X, W / 2, false);
      homePlace = { x: hs.x, y: hs.y };
      home = withCueAt(hs.x, hs.y);
    } else {
      var cands = candidates(balls, st, balls[0].x, balls[0].y).slice(0, lv.cands);
      for (var c = 0; c < cands.length; c++) queueCand(balls, null, cands[c]);
    }

    function queueSafeties() {
      var cue = home[0], ts2 = Ru.targets(st, home), dirs = [];
      for (var i = 0; i < ts2.length; i++) {
        var ob = P.byId(home, ts2[i]);
        var base = Math.atan2(ob.y - cue.y, ob.x - cue.x);
        var half = Math.asin(Math.min(1, 2 * R / Math.max(2 * R, Math.hypot(ob.x - cue.x, ob.y - cue.y))));
        dirs.push(base, base + half * 0.6, base - half * 0.6);
      }
      for (var a = 0; a < 24; a++) dirs.push(a / 24 * Math.PI * 2);
      var powers = [0.14, 0.28];
      dirs.forEach(function (ang) {
        powers.forEach(function (pw) {
          tasks.push(function () {
            var shot = { angle: ang, power: pw, tipX: 0, tipY: 0, place: homePlace, call: -1, base: home, safety: true };
            var w = P.simulate(home, shot);
            shot.score = scoreOutcome(st, home, w, -1, lv);
            results.push(shot);
          });
        });
      });
    }

    // before trusting a pot, make sure a hair of aiming error doesn't ruin it
    function queueRobust() {
      var top = results.filter(function (r) { return r.score >= 1000 && r.score < 1e5; })
                       .sort(function (a, b) { return b.score - a.score; }).slice(0, 4);
      top.forEach(function (shot) {
        [-0.004, 0.004].forEach(function (off) {
          tasks.push(function () {
            var w = P.simulate(shot.base, { angle: shot.angle + off, power: shot.power, tipX: shot.tipX, tipY: shot.tipY });
            var sc = scoreOutcome(st, shot.base, w, shot.call, lv);
            if (sc < 1000) shot.score -= 700;
          });
        });
      });
    }

    function topScore() {
      var m = -Infinity;
      for (var i = 0; i < results.length; i++) if (results[i].score > m) m = results[i].score;
      return m;
    }

    function best() {
      var pool = results.slice().sort(function (a, b) { return b.score - a.score; });
      if (!pool.length) return null;
      if (lv.pick > 1 && pool[0].score >= 1000 && pool[0].score < 1e5) {
        var good = pool.filter(function (r) { return r.score >= 1000; }).slice(0, lv.pick);
        return good[Math.floor(rng() * good.length)];
      }
      return pool[0];
    }

    function finish() {
      var pick = best();
      var cue = home[0];
      if (!pick) {
        // truly nothing: roll softly at the nearest legal ball
        var ts3 = Ru.targets(st, home), nb = null, nd = Infinity;
        for (var i = 0; i < ts3.length; i++) {
          var ob = P.byId(home, ts3[i]), d = Math.hypot(ob.x - cue.x, ob.y - cue.y);
          if (d < nd) { nd = d; nb = ob; }
        }
        pick = { angle: nb ? Math.atan2(nb.y - cue.y, nb.x - cue.x) : 0, power: 0.3, tipX: 0, tipY: 0,
                 place: homePlace, call: needCall ? 0 : -1 };
      }
      var shot = { place: pick.place || homePlace, angle: pick.angle + gauss(rng) * lv.aim,
                   power: Math.max(0.05, Math.min(1, pick.power * (1 + gauss(rng) * lv.pow))),
                   tipX: pick.tipX, tipY: pick.tipY, call: pick.call, target: pick.target, pocket: pick.pocket,
                   score: pick.score, safety: !!pick.safety };
      if (needCall && shot.call < 0) {
        // playing safe on the 8 still has to name a pocket: the one it's least likely to find
        shot.call = 0;
      }
      return shot;
    }

    return {
      step: function (budget) {
        if (result) return true;
        var t0 = now();
        for (;;) {
          while (tasks.length) {
            tasks.shift()();
            if (now() - t0 > budget) return false;
          }
          if (phase === 0) {
            phase = 1;
            var b0 = topScore();
            if (lv.robust && b0 >= 1000 && b0 < 1e5) { queueRobust(); continue; }
          }
          if (phase === 1) {
            phase = 2;
            // Easy only plays safe to dodge a certain foul; the others whenever nothing drops
            var b1 = topScore();
            if (b1 < 1000 && (lv.safety || b1 <= -2000 || !results.length)) { queueSafeties(); continue; }
          }
          result = finish();
          return true;
        }
      },
      get result() { return result; }
    };
  }

  var api = { LEVELS: LEVELS, plan: plan, candidates: candidates, shotGeom: shotGeom, potLine: potLine, clear: clear };
  root.PoolAI = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
