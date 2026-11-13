// Proves every Buzz Wire level can be played: node _dev/tools/buzz-wire-check.js [level numbers]
//
// For each circuit (games/buzz-wire/course.js and levels.js, the game's own
// sums) it checks that:
// - the channel stays on the board, and never runs close enough to itself
//   for a ring to slip from one part of the circuit to another (the wires
//   between two passes are always apart);
// - every ticket sits inside the channel with room for the ring;
// - no obstacle ever reaches the ring waiting on the post;
// - the circuit can be closed: a search over (where the ring is in the
//   channel, the beat, the tickets taken so far) finds a way from the post
//   all the way round, forwards, taking every ticket in turn, back across
//   the post, with the pointer never faster than VMAX units a second and
//   PAD units of room kept clear of every wire and obstacle all the while.
//   The obstacles run on the beat (a cycle of the level's longest pattern,
//   in steps of 1/SPB of a beat), and the ring may wait anywhere it's safe.
// Prints a line a level (the fastest close it found, at VMAX) and exits 1
// if any level fails.
"use strict";
const path = require("path");
const ROOT = path.join(__dirname, "..", "..");
const C = require(path.join(ROOT, "games/buzz-wire/course.js"));
const LV = require(path.join(ROOT, "games/buzz-wire/levels.js"));

const VMAX = 400;          // units a second (a board 600 px wide: 240 px a second)
const PAD = 3;             // room kept clear all round, on top of the ring
const SPB = 24;            // steps a beat
const DS = 6, DN = 6;      // the search grid: along the circuit, and across it
const TICKET = 14;         // a ticket's radius (game.js: taken within RING + TICKET)
const R = C.RING;

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function lcm(a, b) { return a / gcd(a, b) * b; }
function periodOf(o) {
  const every = o.every || 1;
  if (o.k === "spark") return every * 2 * ((o.n || 4) - 1);
  if (o.k === "weight") return 2 * every;
  if (o.k === "live" || o.k === "gate") return o.period || 4;
  if (o.k === "arm") { const full = o.both ? 180 : 360, t = Math.abs(o.turn || 90); return every * full / gcd(t, full); }
  return 1;
}
function segSegDist(a, b) {
  // (the distance between two straight pieces of the centre line)
  function pd(px, py, s) { const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy; let u = l2 ? ((px - s.ax) * dx + (py - s.ay) * dy) / l2 : 0; u = Math.max(0, Math.min(1, u)); return Math.hypot(s.ax + dx * u - px, s.ay + dy * u - py); }
  return Math.min(pd(a.ax, a.ay, b), pd(a.bx, a.by, b), pd(b.ax, b.ay, a), pd(b.bx, b.by, a));
}

function check(idx) {
  const level = LV.levels[idx], c = C.build(level), L = c.L, problems = [];
  // the board's edge
  c.pts.forEach((p) => { if (p.x - p.w - C.WIRE < 8 || p.x + p.w + C.WIRE > 992 || p.y - p.w - C.WIRE < 8 || p.y + p.w + C.WIRE > 992) problems.push("off the board at " + p.x.toFixed(0) + "," + p.y.toFixed(0)); });
  // the circuit apart from itself
  let closest = 1e9;
  for (let i = 0; i < c.segs.length; i++) for (let j = i + 1; j < c.segs.length; j++) {
    const a = c.segs[i], b = c.segs[j], along = Math.min(Math.abs(a.s0 - b.s0), L - Math.abs(a.s0 - b.s0));
    if (along < (a.w + b.w) * 2.2 + 40) continue;
    const gap = segSegDist(a, b) - a.w - b.w - 2 * C.WIRE;
    if (gap < closest) closest = gap;
  }
  if (closest < 8) problems.push("the circuit runs within " + closest.toFixed(1) + " of itself");
  // tickets in the channel
  c.tickets.forEach((t, i) => { if (C.depth(c, t.x, t.y) < R + 4) problems.push("ticket " + (i + 1) + " too near a wire"); });

  // the cells: points of the channel the ring fits at, PAD to spare
  const NS = Math.ceil(L / DS), cx = [], cy = [], cs = [];
  for (let i = 0; i < NS; i++) {
    const s = i * L / NS, p = C.posAt(c, s), room = p.w - R - PAD;
    for (let n = -Math.floor(room / DN) * DN; n <= room + 1e-9; n += DN) {
      const x = p.x + p.nx * n, y = p.y + p.ny * n;
      if (C.depth(c, x, y) < R + PAD) continue;
      // (on an inner bend a point across may belong to another arc: kept once, at its own)
      const pr = C.project(c, x, y, s, 40);
      if (Math.abs(C.wrap(c, pr.s - s + L / 2) - L / 2) > DS * 1.5) continue;
      cx.push(x); cy.push(y); cs.push(s);
    }
  }
  const NC = cx.length;
  // the post's cell: the one nearest the post
  let start = 0, sd = 1e9;
  for (let i = 0; i < NC; i++) { const d = Math.hypot(cx[i] - c.post.x, cy[i] - c.post.y); if (d < sd) { sd = d; start = i; } }

  // time: the obstacles' longest cycle, in steps
  const obs = level.obs || [];
  const H = obs.reduce((h, o) => lcm(h, periodOf(o)), 1), P = H * SPB;
  const dt = 60 / (level.bpm * SPB), reach = VMAX * dt;
  // where each obstacle is at each step: blocked[phase] a byte a cell
  const blocked = [];
  for (let ph = 0; ph < (obs.length ? P : 1); ph++) {
    const b = ph / SPB, shapes = C.obstacles(c, b), row = new Uint8Array(NC);
    if (shapes.length) for (let i = 0; i < NC; i++) if (C.hit(c, cx[i], cy[i], b, cs[i], PAD, shapes)) row[i] = 1;
    blocked.push(row);
  }
  // the post, waited on, is never struck
  for (let ph = 0; ph < blocked.length; ph++) {
    const b = ph / SPB;
    if (C.hit(c, c.post.x, c.post.y, b, 0, 0)) { problems.push("an obstacle reaches the post at beat " + b.toFixed(2)); break; }
  }

  // neighbours: the cells a ring can move to in one step (by a spatial hash)
  const G = Math.max(reach, DS) + 0.01, hash = new Map();
  const key = (gx, gy) => gx * 4096 + gy;
  for (let i = 0; i < NC; i++) { const k = key(Math.floor(cx[i] / G), Math.floor(cy[i] / G)); if (!hash.has(k)) hash.set(k, []); hash.get(k).push(i); }
  const nb = new Array(NC);
  for (let i = 0; i < NC; i++) {
    const gx = Math.floor(cx[i] / G), gy = Math.floor(cy[i] / G), out = [];
    for (let ax = -1; ax <= 1; ax++) for (let ay = -1; ay <= 1; ay++) {
      const l = hash.get(key(gx + ax, gy + ay)); if (!l) continue;
      for (const j of l) if (Math.hypot(cx[j] - cx[i], cy[j] - cy[i]) <= reach) {
        // (no crossing back over the post: the circuit goes round forwards)
        if (cs[i] < L / 4 && cs[j] > L * 3 / 4) continue;
        out.push(j);
      }
    }
    nb[i] = Int32Array.from(out);
  }
  // tickets in their order round the circuit, and the cells that take each
  const tk = c.tickets.map((t, i) => ({ t, i })).sort((a, b) => a.t.s - b.t.s);
  const T = tk.length, takes = tk.map(({ t }) => { const m = new Uint8Array(NC); for (let i = 0; i < NC; i++) if (Math.hypot(cx[i] - t.x, cy[i] - t.y) <= R + TICKET - 2) m[i] = 1; return m; });

  // the search, a layer a step
  const PH = blocked.length, seen = new Uint8Array(NC * PH * (T + 1));
  let front = [[start, 0]], steps = 0, won = -1;
  const MAX = 60 * 120 / dt;   // (two minutes of steps)
  seen[start] = 1;
  while (front.length && won < 0 && steps < MAX) {
    const ph = steps % PH, nph = (steps + 1) % PH, next = [];
    for (const [i, k] of front) {
      for (const j of nb[i]) {
        if (blocked[nph][j] || blocked[ph][j]) continue;
        let k2 = k;
        if (k2 < T && takes[k2][j]) k2++;
        // across the post forwards: closed, if every ticket's in
        if (cs[i] > L * 3 / 4 && cs[j] < L / 4) { if (k2 === T) { won = steps + 1; break; } continue; }
        const id = (nph * (T + 1) + k2) * NC + j;
        if (seen[id]) continue;
        seen[id] = 1; next.push([j, k2]);
      }
      if (won >= 0) break;
    }
    front = next; steps++;
  }
  if (won < 0) problems.push("no way round found (" + (front.length ? "gave up after two minutes" : "every way blocked") + ")");
  return { idx, name: level.name, L, cells: NC, beats: H, closest, time: won >= 0 ? won * dt : null, problems };
}

const want = process.argv.slice(2).map(Number).filter((n) => n >= 1);
const list = want.length ? want.map((n) => n - 1) : LV.levels.map((_, i) => i);
let bad = 0;
for (const i of list) {
  const t0 = Date.now(), r = check(i);
  const head = String(i + 1).padStart(2) + " " + r.name.padEnd(16) + " " + Math.round(r.L) + " units, " + r.cells + " cells, cycle " + r.beats + " beats, wires apart >= " + r.closest.toFixed(0);
  console.log(head + (r.time != null ? ", closed in " + r.time.toFixed(1) + " s" : "") + " (" + ((Date.now() - t0) / 1000).toFixed(1) + " s)" + (r.problems.length ? "\n   FAIL: " + r.problems.join("; ") : ""));
  if (r.problems.length) bad++;
}
console.log(bad ? bad + " level(s) FAIL" : "ALL " + list.length + " LEVELS PASS");
process.exit(bad ? 1 : 0);
