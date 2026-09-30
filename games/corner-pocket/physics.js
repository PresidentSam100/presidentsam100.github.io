/* Corner Pocket — the table and its ball physics.
   Pure and deterministic (no DOM, no Math.random): the CPU looks ahead by
   running this exact code on a copy of the table, so what it sees is what the
   live table will do. Loads in the page and in node.

   Units are metres and seconds on a 7-ft bar-box table. x runs from the head
   rail (x = 0, where you break from) to the foot rail; y runs top to bottom,
   so screen space and table space agree in the landscape view. z points down
   into the cloth. */
(function (root) {
  "use strict";

  var L = 1.9812, W = 0.9906;         // playing surface, cushion nose to cushion nose
  var R = 0.028575;                   // ball radius (2 1/4" balls)
  var HEAD_X = L / 4, FOOT_X = L * 3 / 4;

  var G = 9.81;
  var MU_SLIDE = 0.2;     // ball skidding on cloth
  var MU_ROLL = 0.013;    // rolling resistance
  var SPIN_DECEL = 36;    // rad/s² of side spin lost to the cloth
  var E_BALL = 0.94;
  var E_CUSH = 0.78;
  var MU_CUSH = 0.16;     // cushion grip: turns side spin into a changed rebound
  var ROLL_KEEP = 0.35;   // share of the roll into a cushion that survives, reversed
  var DT = 1 / 240;
  var VMAX = 8;           // cue ball speed at full power
  var TIP_MAX = 0.5;      // furthest cue-tip offset from centre, as a fraction of R

  // pocket mouths: corners measured along each rail from the corner,
  // sides as a half-width either side of the middle of the long rail
  var CM = 0.086, SM = 0.066;
  var CJ = 0.06, SJ = 0.05;           // jaw lengths

  // ---- geometry ----------------------------------------------------------------
  var pockets = [], segs = [], points = [];
  function seg(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, len = Math.sqrt(dx * dx + dy * dy);
    segs.push({ ax: ax, ay: ay, bx: bx, by: by, dx: dx / len, dy: dy / len, len: len, nx: -dy / len, ny: dx / len });
  }
  function pt(x, y) { points.push({ x: x, y: y }); }
  function corner(cx, cy) {
    var sx = cx ? 1 : -1, sy = cy ? 1 : -1;
    var ox = sx * Math.SQRT1_2, oy = sy * Math.SQRT1_2;   // the pocket's axis, pointing off the table
    var hx = cx - sx * CM, hy = cy;                       // where the long cushion ends
    var vx = cx, vy = cy - sy * CM;                       // where the short cushion ends
    seg(hx, hy, hx + ox * CJ, hy + oy * CJ);
    seg(vx, vy, vx + ox * CJ, vy + oy * CJ);
    pt(hx, hy); pt(vx, vy);
    pt(hx + ox * CJ, hy + oy * CJ); pt(vx + ox * CJ, vy + oy * CJ);
    pockets.push({ x: cx + ox * 0.014, y: cy + oy * 0.014, r: 0.062,
                   mx: (hx + vx) / 2, my: (hy + vy) / 2, ox: ox, oy: oy, side: false,
                   jaw: [[hx, hy], [vx, vy]] });
  }
  function side(cy) {
    var sy = cy ? 1 : -1, x0 = L / 2;
    seg(x0 - SM, cy, x0 - SM + 0.008, cy + sy * SJ);
    seg(x0 + SM, cy, x0 + SM - 0.008, cy + sy * SJ);
    pt(x0 - SM, cy); pt(x0 + SM, cy);
    pt(x0 - SM + 0.008, cy + sy * SJ); pt(x0 + SM - 0.008, cy + sy * SJ);
    pockets.push({ x: x0, y: cy + sy * 0.068, r: 0.064,
                   mx: x0, my: cy, ox: 0, oy: sy, side: true,
                   jaw: [[x0 - SM, cy], [x0 + SM, cy]] });
  }
  // pockets in order: 0 top-left, 1 top-middle, 2 top-right, 3 bottom-left, 4 bottom-middle, 5 bottom-right
  corner(0, 0); side(0); corner(L, 0); corner(0, W); side(W); corner(L, W);
  // the cushions themselves
  seg(CM, 0, L / 2 - SM, 0); seg(L / 2 + SM, 0, L - CM, 0);
  seg(CM, W, L / 2 - SM, W); seg(L / 2 + SM, W, L - CM, W);
  seg(0, CM, 0, W - CM); seg(L, CM, L, W - CM);

  // ---- balls -------------------------------------------------------------------
  function makeBall(id, x, y) {
    return { id: id, x: x, y: y, vx: 0, vy: 0, wx: 0, wy: 0, sz: 0, on: true, pocket: -1, q: [1, 0, 0, 0] };
  }
  function cloneBalls(balls) {
    var out = new Array(balls.length);
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      out[i] = { id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, wx: b.wx, wy: b.wy, sz: b.sz,
                 on: b.on, pocket: b.pocket, q: [b.q[0], b.q[1], b.q[2], b.q[3]] };
    }
    return out;
  }
  function groupOf(id) { return id === 0 ? "cue" : id === 8 ? "eight" : id < 8 ? "solid" : "stripe"; }

  // A standard 8-ball rack: the 8 in the middle of the third row, a solid and
  // a stripe in the two back corners, everything else shuffled. Frozen tight
  // (a gapped rack kills the break, just like on a real table) with a touch of
  // jitter so no two breaks play out identically.
  function rack(rng) {
    var solids = [1, 2, 3, 4, 5, 6, 7], stripes = [9, 10, 11, 12, 13, 14, 15];
    shuffle(solids, rng); shuffle(stripes, rng);
    var cornerA = solids.pop(), cornerB = stripes.pop();
    if (rng() < 0.5) { var t = cornerA; cornerA = cornerB; cornerB = t; }
    var rest = solids.concat(stripes);
    shuffle(rest, rng);
    var slots = new Array(15);
    slots[4] = 8; slots[10] = cornerA; slots[14] = cornerB;
    for (var s = 0; s < 15; s++) if (slots[s] === undefined) slots[s] = rest.pop();

    var balls = [makeBall(0, HEAD_X, W / 2)];
    var byId = [];
    var d = 2 * R, k = 0, j = 0;
    for (var i = 0; i < 15; i++) {
      var x = FOOT_X + k * d * Math.sqrt(3) / 2;
      var y = W / 2 + (j - k / 2) * d;
      x += (rng() - 0.5) * 0.00004;
      y += (rng() - 0.5) * 0.00004;
      byId[slots[i]] = makeBall(slots[i], x, y);
      if (++j > k) { k++; j = 0; }
    }
    for (var id = 1; id <= 15; id++) {
      var b = byId[id];
      // start every ball with a random turn so the numbers don't all face up
      var a = rng() * Math.PI * 2, ax = rng() - 0.5, ay = rng() - 0.5, az = rng() - 0.5;
      var m = Math.sqrt(ax * ax + ay * ay + az * az) || 1, sa = Math.sin(a / 2);
      b.q = [Math.cos(a / 2), ax / m * sa, ay / m * sa, az / m * sa];
      balls.push(b);
    }
    return balls;
  }
  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1)), t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---- a world: balls plus what happened during the current shot --------------
  function freshEvents() { return { firstHit: -1, railAfter: false, pocketed: [], rails: 0 }; }
  function makeWorld(balls, live) {
    return { balls: balls, t: 0, live: !!live, ev: freshEvents(), sfx: [] };
  }

  // Strike the cue ball. tipX/tipY is where the cue meets it, inside the unit
  // disk: +x right of centre (right english), +y above centre (follow).
  function strike(w, angle, power, tipX, tipY) {
    var cue = w.balls[0];
    tipX = tipX || 0; tipY = tipY || 0;
    var tm = Math.sqrt(tipX * tipX + tipY * tipY);
    if (tm > 1) { tipX /= tm; tipY /= tm; }
    var v = VMAX * Math.max(0, Math.min(1, power));
    var dx = Math.cos(angle), dy = Math.sin(angle);
    cue.vx = v * dx; cue.vy = v * dy;
    var s = 2.5 * TIP_MAX * tipY;           // 1 = the natural roll
    cue.wx = s * cue.vx; cue.wy = s * cue.vy;
    cue.sz = -2.5 * TIP_MAX * tipX * v / R;
    w.ev = freshEvents();
    w.t = 0;
  }

  // ---- friction ---------------------------------------------------------------
  // v is the ball's velocity; w is the velocity its roll would carry it at
  // (the horizontal spin, scaled by R). While v != w the ball skids and the
  // cloth drags the two together; once they agree the ball just rolls.
  function friction(b, dt) {
    var ux = b.vx - b.wx, uy = b.vy - b.wy;
    var u = Math.sqrt(ux * ux + uy * uy);
    if (u > 1e-4) {
      var d = MU_SLIDE * G * dt;
      if (u <= 3.5 * d) {
        b.vx -= ux / 3.5; b.vy -= uy / 3.5;
        b.wx = b.vx; b.wy = b.vy;
      } else {
        ux /= u; uy /= u;
        b.vx -= d * ux; b.vy -= d * uy;
        b.wx += 2.5 * d * ux; b.wy += 2.5 * d * uy;
      }
    } else {
      var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy), dr = MU_ROLL * G * dt;
      if (sp <= dr) { b.vx = b.vy = b.wx = b.wy = 0; }
      else {
        var k = (sp - dr) / sp;
        b.vx *= k; b.vy *= k; b.wx = b.vx; b.wy = b.vy;
      }
    }
    if (b.sz) {
      var ds = SPIN_DECEL * dt;
      b.sz = Math.abs(b.sz) <= ds ? 0 : b.sz - (b.sz > 0 ? ds : -ds);
    }
    if (!b.vx && !b.vy && !b.wx && !b.wy) b.sz = 0;
  }

  // ---- collisions ---------------------------------------------------------------
  // Everything moves in straight lines within a step; the step is split at each
  // contact, found by exact time of impact, so contact points (and therefore the
  // aiming line) are exact. Only approaching contacts count, so balls resting
  // against each other never re-collide.
  var FOUR_R2 = 4 * R * R, R2 = R * R;
  var evKind = 0, evA = null, evB = null, evNx = 0, evNy = 0, evPx = 0, evPy = 0;

  function findEvent(balls, limit) {
    var best = limit, found = false, n = balls.length, i, j, a, b, t;
    for (i = 0; i < n; i++) {
      a = balls[i];
      if (!a.on) continue;
      var am = a.vx !== 0 || a.vy !== 0;
      for (j = i + 1; j < n; j++) {
        b = balls[j];
        if (!b.on) continue;
        if (!am && b.vx === 0 && b.vy === 0) continue;
        var dx = b.x - a.x, dy = b.y - a.y, dvx = b.vx - a.vx, dvy = b.vy - a.vy;
        var ap = dx * dvx + dy * dvy;
        if (ap >= 0) continue;
        var c = dx * dx + dy * dy - FOUR_R2;
        if (c <= 0) t = 0;
        else {
          var A = dvx * dvx + dvy * dvy, disc = ap * ap - A * c;
          if (disc < 0) continue;
          t = (-ap - Math.sqrt(disc)) / A;
        }
        if (t < best) { best = t; found = true; evKind = 0; evA = a; evB = b; }
      }
      if (!am) continue;
      for (j = 0; j < segs.length; j++) {
        var s = segs[j];
        var d0 = (a.x - s.ax) * s.nx + (a.y - s.ay) * s.ny;
        var vn = a.vx * s.nx + a.vy * s.ny;
        var sg = d0 >= 0 ? 1 : -1;
        d0 *= sg; vn *= sg;
        if (vn >= 0) continue;
        t = (d0 - R) / -vn;
        if (t < 0) { if (d0 < R * 0.5) continue; t = 0; }
        if (t >= best) continue;
        var px = a.x + a.vx * t - s.ax, py = a.y + a.vy * t - s.ay;
        var pr = px * s.dx + py * s.dy;
        if (pr < 0 || pr > s.len) continue;
        best = t; found = true; evKind = 1; evA = a; evNx = s.nx * sg; evNy = s.ny * sg;
      }
      for (j = 0; j < points.length; j++) {
        var p = points[j];
        var ex = a.x - p.x, ey = a.y - p.y;
        var ap2 = ex * a.vx + ey * a.vy;
        if (ap2 >= 0) continue;
        var c2 = ex * ex + ey * ey - R2;
        if (c2 <= 0) t = 0;
        else {
          var A2 = a.vx * a.vx + a.vy * a.vy, disc2 = ap2 * ap2 - A2 * c2;
          if (disc2 < 0) continue;
          t = (-ap2 - Math.sqrt(disc2)) / A2;
        }
        if (t < best) { best = t; found = true; evKind = 2; evA = a; evPx = p.x; evPy = p.y; }
      }
    }
    return found ? best : -1;
  }

  function advance(w, t) {
    if (t <= 0) return;
    var balls = w.balls;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.on) continue;
      if (b.vx !== 0 || b.vy !== 0) { b.x += b.vx * t; b.y += b.vy * t; }
      if (w.live && (b.wx !== 0 || b.wy !== 0 || b.sz !== 0)) turn(b, t);
    }
  }

  // rotate a ball's orientation by its spin over t seconds (for drawing only)
  function turn(b, t) {
    var ox = b.wy / R, oy = -b.wx / R, oz = b.sz;
    var m = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (m < 1e-9) return;
    var h = m * t * 0.5, s = Math.sin(h) / m;
    var dw = Math.cos(h), dx = ox * s, dy = oy * s, dz = oz * s;
    var q = b.q, w1 = q[0], x1 = q[1], y1 = q[2], z1 = q[3];
    var nw = dw * w1 - dx * x1 - dy * y1 - dz * z1;
    var nx = dw * x1 + dx * w1 + dy * z1 - dz * y1;
    var ny = dw * y1 - dx * z1 + dy * w1 + dz * x1;
    var nz = dw * z1 + dx * y1 - dy * x1 + dz * w1;
    var nm = 1 / Math.sqrt(nw * nw + nx * nx + ny * ny + nz * nz);
    q[0] = nw * nm; q[1] = nx * nm; q[2] = ny * nm; q[3] = nz * nm;
  }

  function resolve(w) {
    var a = evA, nx, ny;
    if (evKind === 0) {
      var b = evB;
      nx = b.x - a.x; ny = b.y - a.y;
      var d = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= d; ny /= d;
      var rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel <= 0) return;
      var j = (1 + E_BALL) / 2 * rel;
      a.vx -= j * nx; a.vy -= j * ny;
      b.vx += j * nx; b.vy += j * ny;
      if (w.ev.firstHit < 0) {
        if (a.id === 0) w.ev.firstHit = b.id;
        else if (b.id === 0) w.ev.firstHit = a.id;
      }
      if (w.live) w.sfx.push({ k: "ball", v: rel, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
      return;
    }
    if (evKind === 1) { nx = evNx; ny = evNy; }
    else {
      nx = a.x - evPx; ny = a.y - evPy;
      var dd = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= dd; ny /= dd;
    }
    var vn = a.vx * nx + a.vy * ny;
    if (vn >= 0) return;
    a.vx -= (1 + E_CUSH) * vn * nx;
    a.vy -= (1 + E_CUSH) * vn * ny;
    // side spin grips the cushion and bends the rebound
    var tx = -ny, ty = nx;
    var slip = a.vx * tx + a.vy * ty - R * a.sz;
    var lim = MU_CUSH * (1 + E_CUSH) * -vn;
    var jt = -slip / 3.5;
    if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
    a.vx += jt * tx; a.vy += jt * ty;
    a.sz -= 2.5 * jt / R;
    // the roll carried into the cushion mostly dies there
    var wn = a.wx * nx + a.wy * ny;
    if (wn < 0) { a.wx -= (1 + ROLL_KEEP) * wn * nx; a.wy -= (1 + ROLL_KEEP) * wn * ny; }
    w.ev.rails++;
    if (w.ev.firstHit >= 0) w.ev.railAfter = true;
    if (w.live) w.sfx.push({ k: "rail", v: -vn, x: a.x, y: a.y });
  }

  function pocketCheck(w) {
    var balls = w.balls;
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.on) continue;
      var hit = -1;
      for (var k = 0; k < 6; k++) {
        var p = pockets[k], dx = b.x - p.x, dy = b.y - p.y;
        if (dx * dx + dy * dy < p.r * p.r) { hit = k; break; }
      }
      // safety net: off the cloth but not in a pocket's throat means it got
      // out some other way — it drops into the nearest pocket
      if (hit < 0 && (b.x < -R || b.x > L + R || b.y < -R || b.y > W + R)) {
        var bd = Infinity, near = 0;
        for (k = 0; k < 6; k++) {
          var q = pockets[k], e = (b.x - q.x) * (b.x - q.x) + (b.y - q.y) * (b.y - q.y);
          if (e < bd) { bd = e; near = k; }
        }
        if (bd > 0.15 * 0.15) hit = near;
      }
      if (hit >= 0) {
        b.on = false; b.pocket = hit;
        var sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
        b.vx = b.vy = b.wx = b.wy = b.sz = 0;
        w.ev.pocketed.push({ id: b.id, pocket: hit, t: w.t });
        if (w.live) w.sfx.push({ k: "pocket", v: sp, x: b.x, y: b.y, id: b.id, pocket: hit });
      }
    }
  }

  function separate(balls) {
    for (var it = 0; it < 4; it++) {
      for (var i = 0; i < balls.length; i++) {
        var a = balls[i];
        if (!a.on) continue;
        for (var j = i + 1; j < balls.length; j++) {
          var b = balls[j];
          if (!b.on) continue;
          var dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 >= FOUR_R2) continue;
          var d = Math.sqrt(d2) || 1e-6, push = (2 * R - d) / 2 + 1e-7;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
        }
      }
    }
  }

  function step(w, dt) {
    dt = dt || DT;
    var balls = w.balls, i;
    for (i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.on && (b.vx || b.vy || b.wx || b.wy || b.sz)) friction(b, dt);
    }
    var rem = dt, guard = 0;
    while (rem > 0) {
      var t = findEvent(balls, rem);
      if (t < 0) { advance(w, rem); break; }
      advance(w, t);
      rem -= t;
      resolve(w);
      if (++guard > 400) { advance(w, rem); separate(balls); break; }
    }
    pocketCheck(w);
    w.t += dt;
  }

  function atRest(balls) {
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.on && (b.vx || b.vy || b.wx || b.wy)) return false;
    }
    return true;
  }

  // Play a shot out on a copy of the table.
  function simulate(balls, shot, maxT) {
    var w = makeWorld(cloneBalls(balls), false);
    strike(w, shot.angle, shot.power, shot.tipX, shot.tipY);
    maxT = maxT || 45;
    while (w.t < maxT) {
      step(w, DT);
      if (atRest(w.balls)) break;
    }
    if (!atRest(w.balls)) halt(w.balls);
    return w;
  }
  function halt(balls) {
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      b.vx = b.vy = b.wx = b.wy = b.sz = 0;
    }
  }

  // ---- aiming -------------------------------------------------------------------
  // The first thing a ball travelling from (x, y) along the unit (dx, dy) would
  // touch: another ball, a cushion, a jaw, or the mouth of a pocket.
  function cast(balls, x, y, dx, dy, skipId, maxT) {
    var best = maxT || 10, hit = null, i, t;
    for (i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (!b.on || b.id === skipId) continue;
      var ex = b.x - x, ey = b.y - y, pr = ex * dx + ey * dy;
      if (pr <= 0) continue;
      var pp = ex * ex + ey * ey - pr * pr;
      if (pp >= FOUR_R2) continue;
      t = pr - Math.sqrt(FOUR_R2 - pp);
      if (t < 0) t = 0;
      if (t < best) { best = t; hit = { kind: "ball", id: b.id, t: t }; }
    }
    for (i = 0; i < segs.length; i++) {
      var s = segs[i];
      var d0 = (x - s.ax) * s.nx + (y - s.ay) * s.ny, vn = dx * s.nx + dy * s.ny;
      var sg = d0 >= 0 ? 1 : -1;
      d0 *= sg; vn *= sg;
      if (vn >= 0) continue;
      t = (d0 - R) / -vn;
      if (t < 0 || t >= best) continue;
      var px = x + dx * t - s.ax, py = y + dy * t - s.ay, prj = px * s.dx + py * s.dy;
      if (prj < 0 || prj > s.len) continue;
      best = t; hit = { kind: "rail", t: t, nx: s.nx * sg, ny: s.ny * sg };
    }
    for (i = 0; i < points.length; i++) {
      var p = points[i];
      var qx = x - p.x, qy = y - p.y, ap = qx * dx + qy * dy;
      if (ap >= 0) continue;
      var c = qx * qx + qy * qy - R2, disc = ap * ap - c;
      if (disc < 0) continue;
      t = -ap - Math.sqrt(disc);
      if (t < 0 || t >= best) continue;
      var nx = x + dx * t - p.x, ny = y + dy * t - p.y, nm = Math.sqrt(nx * nx + ny * ny) || 1;
      best = t; hit = { kind: "rail", t: t, nx: nx / nm, ny: ny / nm };
    }
    for (i = 0; i < 6; i++) {
      var k = pockets[i];
      var fx = x - k.x, fy = y - k.y, a2 = fx * dx + fy * dy;
      var c2 = fx * fx + fy * fy - k.r * k.r;
      if (c2 <= 0) { t = 0; }
      else {
        if (a2 >= 0) continue;
        var disc2 = a2 * a2 - c2;
        if (disc2 < 0) continue;
        t = -a2 - Math.sqrt(disc2);
      }
      if (t < best) { best = t; hit = { kind: "pocket", t: t, pocket: i }; }
    }
    if (hit) { hit.x = x + dx * hit.t; hit.y = y + dy * hit.t; }
    return hit;
  }

  // What the aiming line shows: where the cue ball first makes contact, and
  // the lines the two balls leave on (ignoring spin, which only bends the cue
  // ball's line afterwards).
  function predict(balls, angle) {
    var cue = balls[0];
    if (!cue.on) return null;
    var dx = Math.cos(angle), dy = Math.sin(angle);
    var h = cast(balls, cue.x, cue.y, dx, dy, 0);
    if (!h) return null;
    var out = { kind: h.kind, gx: h.x, gy: h.y, dx: dx, dy: dy };
    if (h.kind === "ball") {
      var ob = byIdIn(balls, h.id);
      var nx = ob.x - h.x, ny = ob.y - h.y, nm = Math.sqrt(nx * nx + ny * ny) || 1;
      nx /= nm; ny /= nm;
      var along = dx * nx + dy * ny;
      var cx = dx - along * nx, cy = dy - along * ny, cm = Math.sqrt(cx * cx + cy * cy);
      out.id = h.id; out.ox = ob.x; out.oy = ob.y; out.onx = nx; out.ony = ny;
      out.cut = Math.acos(Math.max(-1, Math.min(1, along)));
      out.cdx = cm > 1e-6 ? cx / cm : 0; out.cdy = cm > 1e-6 ? cy / cm : 0;
    } else if (h.kind === "rail") {
      var dn = dx * h.nx + dy * h.ny;
      out.rdx = dx - 2 * dn * h.nx; out.rdy = dy - 2 * dn * h.ny;
    } else out.pocket = h.pocket;
    return out;
  }
  function byIdIn(balls, id) {
    if (balls[id] && balls[id].id === id) return balls[id];
    for (var i = 0; i < balls.length; i++) if (balls[i].id === id) return balls[i];
    return null;
  }

  // ---- ball in hand ---------------------------------------------------------------
  function placeOk(balls, x, y, kitchen) {
    if (x < R || x > L - R || y < R || y > W - R) return false;
    if (kitchen && x > HEAD_X) return false;
    for (var i = 1; i < balls.length; i++) {
      var b = balls[i];
      if (!b.on) continue;
      var dx = b.x - x, dy = b.y - y;
      if (dx * dx + dy * dy < FOUR_R2 * 1.0004) return false;
    }
    return true;
  }
  // the nearest legal spot to (x, y), searching outward in rings
  function nearestFree(balls, x, y, kitchen) {
    x = Math.max(R, Math.min((kitchen ? HEAD_X : L - R), x));
    y = Math.max(R, Math.min(W - R, y));
    if (placeOk(balls, x, y, kitchen)) return { x: x, y: y };
    for (var ring = 1; ring < 80; ring++) {
      var rad = ring * R * 0.5, steps = 12 + ring * 4;
      for (var s = 0; s < steps; s++) {
        var a = s / steps * Math.PI * 2, px = x + Math.cos(a) * rad, py = y + Math.sin(a) * rad;
        if (placeOk(balls, px, py, kitchen)) return { x: px, y: py };
      }
    }
    return { x: HEAD_X / 2, y: W / 2 };
  }
  // the 8 potted on the break comes back to the foot spot, or as near behind it as fits
  function spotBall(balls, id) {
    var b = byIdIn(balls, id);
    var x = FOOT_X;
    for (var tries = 0; tries < 60; tries++) {
      var ok = true;
      for (var i = 0; i < balls.length; i++) {
        var o = balls[i];
        if (!o.on || o.id === id) continue;
        var dx = o.x - x, dy = o.y - W / 2;
        if (dx * dx + dy * dy < FOUR_R2 * 1.0004) { ok = false; break; }
      }
      if (ok && x <= L - R) break;
      x += R * 0.25;
      if (x > L - R) x = FOOT_X - (x - (L - R));
    }
    b.x = x; b.y = W / 2; b.on = true; b.pocket = -1;
    b.vx = b.vy = b.wx = b.wy = b.sz = 0;
  }

  // mulberry32 — the seeded generator the rack and the CPU use
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var api = {
    L: L, W: W, R: R, HEAD_X: HEAD_X, FOOT_X: FOOT_X, DT: DT, VMAX: VMAX,
    pockets: pockets, segs: segs, points: points,
    makeBall: makeBall, cloneBalls: cloneBalls, groupOf: groupOf, rack: rack,
    makeWorld: makeWorld, strike: strike, step: step, atRest: atRest, halt: halt,
    simulate: simulate, cast: cast, predict: predict, byId: byIdIn,
    placeOk: placeOk, nearestFree: nearestFree, spotBall: spotBall, rng: rng
  };
  root.PoolPhysics = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
