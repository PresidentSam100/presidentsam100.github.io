// LogicGate's split levels: circuits where one signal feeds several gates.
// Writes games/logicgate/levels-split.js, 40 levels for each mode (the first
// two in each are made by hand to teach the junction dot; the rest are drawn
// from a seeded generator, so a rerun prints the same levels).
//
//   node _dev/tools/logicgate-split-levels.js        write the file
//   require(...)                                     the solvers, for tests
//
// A level is a "net": a list of nodes, each an input ("0" / "1"), an empty
// slot ("? a b") or a fixed gate ("AND a b"), a and b the indexes of earlier
// nodes, the last node the root (see fromNet in game.js). A node used by more
// than one gate is a split.
//
// Sizes climb in tiers by index (gatesTier / inputsTier), and within a tier
// the levels go from the most forgiving (the largest share of solutions) to
// the least. Every generated level is checked by brute force:
//   Place Gates: every way to fill the slots from the tray. At least one
//     lights the bulb, at most 60% of them do, and some slot that splits is
//     "tight": some of the tray's gate types never work there.
//   Set Inputs: all 2^K switch settings; from the third level on a shared
//     switch is pinned (every solution sets it the same).
// A level also has to be varied (no gate type over half the tray, and at
// least min(4, m - 1) kinds) and new (no other level with the same circuit).
//
// Hints are built from the level itself, one fact per sentence, so each is
// true: the counts, which split the level turns on (named by what feeds it),
// and in turn how many tray types never work there, how many solutions
// there are, which inputs split too, the root gate's need… The test suite
// (_dev/tests/logicgate.js) reads every sentence back and checks it.

"use strict";

const GATES = ["AND", "OR", "XOR", "NAND", "NOR", "XNOR"];
function applyGate(t, a, b) {
  switch (t) {
    case "AND": return a & b;
    case "OR": return a | b;
    case "XOR": return a ^ b;
    case "NAND": return a & b ? 0 : 1;
    case "NOR": return a | b ? 0 : 1;
    case "XNOR": return a === b ? 1 : 0;
  }
}

// ---- nets ----------------------------------------------------------------
function parse(net) {
  return net.map((s) => {
    const p = s.split(" ");
    if (p.length === 1) return { kind: "input", value: +p[0] };
    return { kind: "gate", type: p[0] === "?" ? null : p[0], a: +p[1], b: +p[2] };
  });
}
// how many gates each node feeds
function fans(nodes) {
  const f = nodes.map(() => 0);
  nodes.forEach((n) => { if (n.kind === "gate") { f[n.a]++; f[n.b]++; } });
  return f;
}
// the switch labels A, B, C… as the game gives them: inputs in the order a
// depth-first walk from the root first meets them, left before right
function labels(nodes) {
  const seen = new Set(), order = [];
  (function walk(i) {
    if (seen.has(i)) return;
    seen.add(i);
    const n = nodes[i];
    if (n.kind === "input") order.push(i);
    else { walk(n.a); walk(n.b); }
  })(nodes.length - 1);
  const lab = {};
  order.forEach((i, k) => { lab[i] = String.fromCharCode(65 + k); });
  return lab;
}
function evalNet(nodes, types, values) {
  const v = [];
  nodes.forEach((n, i) => {
    v[i] = n.kind === "input" ? (values ? values[i] : n.value) : applyGate(types ? types[i] : n.type, v[n.a], v[n.b]);
  });
  return v;
}

// ---- solvers ---------------------------------------------------------------
// Place Gates: every way to fill the slots (all gates) from the palette.
// Returns { total, sols, typesAt: { slot: [the gate types it takes in some
// solution] }, pinned: { slot: true if every solution agrees } }.
function solveGates(net, palette) {
  const nodes = parse(net), slots = [];
  nodes.forEach((n, i) => { if (n.kind === "gate") slots.push(i); });
  const left = Object.assign({}, palette), types = [], v = [];
  nodes.forEach((n, i) => { if (n.kind === "input") v[i] = n.value; });
  let total = 0, sols = 0;
  const seen = {};
  slots.forEach((s) => { seen[s] = new Set(); });
  (function fill(k) {
    if (k === slots.length) {
      total++;
      if (v[nodes.length - 1] === 1) {
        sols++;
        slots.forEach((s) => seen[s].add(types[s]));
      }
      return;
    }
    const s = slots[k], n = nodes[s];
    for (const t of GATES) {
      if (!left[t]) continue;
      left[t]--; types[s] = t; v[s] = applyGate(t, v[n.a], v[n.b]);
      fill(k + 1);
      left[t]++;
    }
  })(0);
  const typesAt = {}, pinned = {};
  slots.forEach((s) => { typesAt[s] = [...seen[s]]; pinned[s] = seen[s].size === 1; });
  return { total, sols, typesAt, pinned };
}
// A quick look before the full search: random fillings of the slots. What it
// finds is certain (a type that worked does work), so a candidate it already
// rules out needs no full search.
function sampleGates(net, palette, R, n) {
  const nodes = parse(net), slots = [];
  nodes.forEach((nd, i) => { if (nd.kind === "gate") slots.push(i); });
  const bag = [];
  Object.keys(palette).forEach((t) => { for (let k = 0; k < palette[t]; k++) bag.push(t); });
  let sols = 0;
  const seen = {};
  slots.forEach((sl) => { seen[sl] = new Set(); });
  for (let k = 0; k < n; k++) {
    const b = bag.slice(), types = [];
    slots.forEach((sl) => { types[sl] = b.splice(Math.floor(R() * b.length), 1)[0]; });
    if (evalNet(nodes, types, null)[nodes.length - 1] === 1) { sols++; slots.forEach((sl) => seen[sl].add(types[sl])); }
  }
  return { frac: sols / n, seen };
}
// Can gate type t go in slot j in some filling that lights the bulb? A
// search that stops at the first one: quick when the answer is yes, which
// it nearly always is, so a split that takes every type is caught before
// the full search.
function worksAt(net, palette, j, t) {
  if (!palette[t]) return false;
  const nodes = parse(net), slots = [j];
  nodes.forEach((n, i) => { if (n.kind === "gate" && i !== j) slots.push(i); });
  const left = Object.assign({}, palette), types = [];
  left[t]--; types[j] = t;
  return (function fill(k) {
    if (k === slots.length) return evalNet(nodes, types, null)[nodes.length - 1] === 1;
    const s = slots[k];
    for (const g of GATES) {
      if (!left[g]) continue;
      left[g]--; types[s] = g;
      const ok = fill(k + 1);
      left[g]++;
      if (ok) return true;
    }
    return false;
  })(1);
}
// Set Inputs: every setting of the switches.
function solveInputs(net) {
  const nodes = parse(net), sw = [];
  nodes.forEach((n, i) => { if (n.kind === "input") sw.push(i); });
  let sols = 0;
  const firstVal = {}, agree = {};
  for (let m = 0; m < 1 << sw.length; m++) {
    const values = [];
    sw.forEach((i, k) => { values[i] = (m >> k) & 1; });
    const v = evalNet(nodes, null, values);
    if (v[nodes.length - 1] !== 1) continue;
    sols++;
    sw.forEach((i) => {
      if (!(i in firstVal)) { firstVal[i] = values[i]; agree[i] = true; }
      else if (firstVal[i] !== values[i]) agree[i] = false;
    });
  }
  return { total: 1 << sw.length, sols, pinned: agree };
}

// ---- generator ---------------------------------------------------------------
function rng(seed) {   // mulberry32
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A DAG of m gates over k = m + 1 - s inputs where s operands reuse a node
// that already feeds a gate (the splits), every node feeds something and the
// last gate is the root. reuse: "gate" | "input" | "any" (what may split).
function shape(R, m, s, reuse) {
  const pick = (arr) => arr[Math.floor(R() * arr.length)];
  for (let tries = 0; tries < 400; tries++) {
    const k = m + 1 - s;
    const nodes = [];
    for (let i = 0; i < k; i++) nodes.push({ kind: "input" });
    let free = nodes.map((_, i) => i);      // not feeding anything yet
    // which gates take a split operand: s of the m, never the first
    const splitAt = new Set();
    while (splitAt.size < s) splitAt.add(1 + Math.floor(R() * (m - 1)));
    const fan = nodes.map(() => 0), pairs = new Set();
    let ok = true;
    for (let g = 0; g < m && ok; g++) {
      let a, b;
      if (splitAt.has(g)) {
        // one fresh operand, one reused
        const used = fan.map((f, i) => i).filter((i) => fan[i] > 0 && fan[i] < 3 &&
          (reuse === "any" || (reuse === "gate" ? nodes[i].kind === "gate" : nodes[i].kind === "input")));
        if (!used.length || !free.length) { ok = false; break; }
        a = pick(free); b = pick(used.filter((i) => i !== a));
        if (b === undefined) { ok = false; break; }
        free = free.filter((i) => i !== a);
      } else {
        if (free.length < 2) { ok = false; break; }
        a = pick(free); free = free.filter((i) => i !== a);
        b = pick(free); free = free.filter((i) => i !== b);
      }
      if (R() < 0.5) { const t = a; a = b; b = t; }
      const key = Math.min(a, b) + "," + Math.max(a, b);
      if (pairs.has(key)) { ok = false; break; }
      pairs.add(key);
      fan[a]++; fan[b]++;
      nodes.push({ kind: "gate", a, b });
      fan.push(0);
      free.push(nodes.length - 1);
    }
    if (!ok || free.length !== 1 || free[0] !== nodes.length - 1) continue;
    return nodes;
  }
  return null;
}
// How many columns deep a circuit runs (inputs at 0). The board shrinks to
// fit a phone, and past 6 deep (7 columns with the bulb) its gates would get
// too small to tap there, so no level goes deeper.
const MAX_DEPTH = 6;
function depth(nodes) {
  const c = [];
  nodes.forEach((n, i) => { c[i] = n.kind === "input" ? 0 : Math.max(c[n.a], c[n.b]) + 1; });
  return c[nodes.length - 1];
}
function toNet(nodes, inputVals, types) {
  return nodes.map((n, i) => n.kind === "input" ? String(inputVals ? inputVals[i] : 0)
    : (types ? types[i] : "?") + " " + n.a + " " + n.b);
}
const WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const num = (n) => n < WORDS.length ? WORDS[n] : String(n);
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const list = (xs) => xs.length === 1 ? xs[0] : xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1];

// ---- size tiers --------------------------------------------------------------
// m gates (slots), s of their operands reused (the splits), d spare gates in
// the tray. Place Gates stops at 8 slots: past that the exhaustive check of
// every filling gets slow. s alternates within a tier where it has a range.
// (The two hand-made openers have 3 and then 4 gates, so the generated ones
// start at 4: a 3 straight after them would be a step back.)
function gatesTier(i) {
  if (i <= 5) return { m: 4, s: [1], d: 0 };
  if (i <= 10) return { m: 5, s: [1, 2], d: 1 };
  if (i <= 17) return { m: 6, s: [2], d: 1 };
  if (i <= 25) return { m: 7, s: [2, 3], d: 2 };
  return { m: 8, s: [3, 4], d: 2 };
}
function inputsTier(i) {
  if (i <= 5) return { m: 4, s: [1] };
  if (i <= 10) return { m: 5, s: [1, 2] };
  if (i <= 16) return { m: 6, s: [2] };
  if (i <= 22) return { m: 7, s: [2] };
  if (i <= 29) return { m: 8, s: [2, 3] };
  if (i <= 35) return { m: 10, s: [3] };
  return { m: 12, s: [4] };
}

// a tray (or a board's fixed gates) worth thinking about: no gate type more
// than 40% of it (five ANDs in a tray of ten read as one big AND puzzle),
// and several kinds
function varied(counts, m) {
  const c = Object.keys(counts).map((k) => counts[k]), total = c.reduce((a, b) => a + b, 0);
  return c.length >= Math.min(4, m - 1) && c.every((x) => x <= Math.ceil(total * 0.4));
}
// the same circuit, whichever way round its nodes were listed (every gate
// type is symmetric, so operand order doesn't count; a split is marked)
function signature(nodes, palette) {
  const f = fans(nodes), memo = {};
  const canon = (i) => {
    if (memo[i]) return memo[i];
    const n = nodes[i];
    const s = n.kind === "input" ? (n.value === undefined ? "x" : String(n.value))
      : "(" + (n.type || "?") + " " + [canon(n.a), canon(n.b)].sort().join(" ") + ")";
    return (memo[i] = f[i] > 1 ? s + "*" : s);
  };
  return canon(nodes.length - 1) + (palette ? " " + Object.keys(palette).sort().map((k) => k + palette[k]).join(",") : "");
}

// A slot or gate, as a hint names it: by what feeds it ("fed by A and C",
// "fed by A and another slot", "fed by two other slots"), or null if that
// could mean more than one. word: "slot" (any gate node) or "gate" (one of
// its own type).
function feedRef(nodes, lab, i, word) {
  const key = (j) => [nodes[j].a, nodes[j].b].filter((x) => nodes[x].kind === "input").map((x) => lab[x]).sort().join("");
  const k = key(i);
  const same = nodes.filter((n, j) => n.kind === "gate" && (word === "slot" || n.type === nodes[i].type) && key(j) === k).length;
  if (same > 1) return null;
  return k.length === 2 ? "fed by " + k[0] + " and " + k[1] : k.length === 1 ? "fed by " + k + " and another " + word : "fed by two other " + word + "s";
}
// what the root gate needs from its two inputs
const ROOT_NEEDS = { AND: "both its inputs at 1", NAND: "at least one 0", OR: "at least one 1",
  NOR: "both its inputs at 0", XOR: "its two inputs to differ", XNOR: "its two inputs to match" };

const POOL = 25;   // valid candidates weighed for each level
const idx = (nodes, keep) => nodes.map((_, j) => j).filter((j) => keep(nodes[j], j));
function makeGates(R, i, seen) {
  const T = gatesTier(i), m = T.m, s = T.s[i % T.s.length], decoys = T.d;
  // A split slot must be a real choice: some of the tray's gate types never
  // work there. (Two ruled out, with a varied tray, came up in none of
  // thousands of random circuits, so one it is; the pool below and the
  // hints carry the rest of the climb.)
  const ruleOut = () => 1;
  // Any random circuit lights its bulb about half the time, so a level can't
  // simply demand a low share of solving placements. Instead the valid
  // candidates make a pool and the hardest (the smallest share) is kept.
  // (the 8-slot tier weighs a smaller pool: a tight split is rarer there, and
  // each full search costs more)
  const pool = m >= 8 ? 10 : POOL;
  let best = null, found = 0;
  for (let tries = 0; tries < 200000 && found < pool; tries++) {
    const nodes = shape(R, m, s, R() < 0.9 ? "gate" : "any");
    if (!nodes || depth(nodes) > MAX_DEPTH) continue;
    const f = fans(nodes);
    if (!idx(nodes, (nd, j) => nd.kind === "gate" && f[j] > 1).length) continue;
    const vals = nodes.map(() => (R() < 0.5 ? 1 : 0));
    const types = nodes.map(() => GATES[Math.floor(R() * 6)]);
    // (the intended answer has to light the bulb: the root takes a gate that does)
    const v0 = evalNet(nodes, types, vals), root = nodes[nodes.length - 1];
    const lit = GATES.filter((t) => applyGate(t, v0[root.a], v0[root.b]) === 1);
    types[nodes.length - 1] = lit[Math.floor(R() * lit.length)];
    const palette = {};
    nodes.forEach((nd, j) => { if (nd.kind === "gate") palette[types[j]] = (palette[types[j]] || 0) + 1; });
    for (let d = 0; d < decoys; d++) { const g = GATES[Math.floor(R() * 6)]; palette[g] = (palette[g] || 0) + 1; }
    if (!varied(palette, m)) continue;
    const net = toNet(nodes, vals, null), parsed = parse(net), sig = signature(parsed, palette);
    if (seen.has(sig)) continue;
    const lab = labels(parsed), kinds = Object.keys(palette).length;
    // the splits a hint can name without ambiguity
    const named = idx(parsed, (nd, j) => nd.kind === "gate" && f[j] > 1 && feedRef(parsed, lab, j, "slot"));
    if (!named.length) continue;
    const q = sampleGates(net, palette, R, 80);
    if (q.frac > 0.65 || !named.some((j) => kinds - q.seen[j].size >= ruleOut(kinds))) continue;
    if (best && q.frac > best.frac + 0.1) continue;   // (can't beat the best so far)
    // a split that takes every type after all (the sample just missed some)
    if (!named.some((j) => Object.keys(palette).filter((t) => !q.seen[j].has(t) && !worksAt(net, palette, j, t)).length >= ruleOut(kinds))) continue;
    const r = solveGates(net, palette);
    if (!r.sols || r.sols / r.total > 0.6) continue;
    const tight = named.filter((j) => kinds - r.typesAt[j].length >= ruleOut(kinds));
    if (!tight.length) continue;
    found++;
    const frac = r.sols / r.total;
    if (!best || frac < best.frac) best = { net, palette, tight, r, frac, sig, m };
  }
  if (!best) throw new Error("gates level " + i + ": no candidate passed");
  seen.add(best.sig);
  return best;
}
function makeInputs(R, i, seen) {
  const T = inputsTier(i), m = T.m, s = T.s[i % T.s.length];
  const needPin = i >= 2;
  // the hardest of a pool, as for Place Gates
  let best = null, found = 0;
  for (let tries = 0; tries < 30000 && found < POOL; tries++) {
    const nodes = shape(R, m, s, R() < 0.7 ? "input" : "any");
    if (!nodes || depth(nodes) > MAX_DEPTH) continue;
    const f = fans(nodes);
    if (!idx(nodes, (nd, j) => nd.kind === "input" && f[j] > 1).length) continue;
    const counts = {};
    const types = nodes.map((nd) => {
      if (nd.kind !== "gate") return null;
      const t = GATES[Math.floor(R() * 6)];
      counts[t] = (counts[t] || 0) + 1;
      return t;
    });
    if (!varied(counts, m)) continue;
    // A NOR at the root (both its inputs at 0) leaves the fewest solutions, so
    // the hardest-of-the-pool rule would pick it nearly every time: each root
    // type gets eight levels at most.
    const root = types[nodes.length - 1];
    if ((seen.roots[root] || 0) >= 8) continue;
    const net = toNet(nodes, null, types), parsed = parse(net), sig = signature(parsed, null);
    if (seen.has(sig)) continue;
    const r = solveInputs(net);
    if (!r.sols || r.sols / r.total > 0.35) continue;
    const swSplits = idx(parsed, (nd, j) => nd.kind === "input" && f[j] > 1);
    const pinned = swSplits.filter((j) => r.pinned[j]);
    if (needPin && !pinned.length) continue;
    found++;
    const frac = r.sols / r.total;
    if (!best || frac < best.frac) best = { net, r, frac, sig, m, root };
  }
  if (!best) throw new Error("inputs level " + i + ": no candidate passed");
  seen.add(best.sig);
  seen.roots[best.root] = (seen.roots[best.root] || 0) + 1;
  return best;
}

// ---- hints -------------------------------------------------------------------
// Each sentence states one fact read off the level; the phrasing turns with
// the level's index so neighbouring levels don't read alike.
const SMALL = 12;   // a solution count is told only up to this
function gatesHint(net, palette, r, i) {
  const nodes = parse(net), lab = labels(nodes), f = fans(nodes);
  const slots = idx(nodes, (n) => n.kind === "gate").length, ins = nodes.length - slots;
  const spare = Object.keys(palette).reduce((a, k) => a + palette[k], 0) - slots, kinds = Object.keys(palette).length;
  const out = [cap(num(ins)) + " inputs, " + num(slots) + " slots, " +
    (spare ? num(spare) + " spare gate" + (spare > 1 ? "s" : "") : "no spares") + "."];
  // the split this hint turns on: a tight one, nameable on its own
  const named = idx(nodes, (n, j) => n.kind === "gate" && f[j] > 1 && feedRef(nodes, lab, j, "slot"));
  const tight = named.filter((j) => kinds - r.typesAt[j].length >= 1);
  const sp = tight[i % tight.length], ref = "the slot " + feedRef(nodes, lab, sp, "slot");
  out.push([cap(ref) + " feeds " + num(f[sp]) + " gates: one gate there has to suit them all.",
    cap(ref) + " splits " + num(f[sp]) + " ways.",
    "Whatever goes in " + ref + " reaches " + num(f[sp]) + " gates."][i % 3]);
  // then a fact or two more, in turn
  const can = r.typesAt[sp].length, extras = [];
  extras.push(can === 1 ? "Only one gate type in the tray can work in " + ref + "."
    : i % 2 ? cap(num(kinds - can)) + " of the " + num(kinds) + " gate types in the tray can never work in " + ref + "."
    : "Only " + num(can) + " of the " + num(kinds) + " gate types in the tray can work in " + ref + ".");
  // (a count only helps while it's small: "2552 ways…" says nothing)
  if (r.sols <= SMALL) extras.push(r.sols === 1 ? "Exactly one way of filling the slots lights the bulb."
    : "Just " + num(r.sols) + " ways of filling the slots light the bulb.");
  const inSplit = idx(nodes, (n, j) => n.kind === "input" && f[j] > 1).map((j) => lab[j]).sort();
  if (inSplit.length) extras.push((inSplit.length === 1 ? "Input " : "Inputs ") + list(inSplit) + (inSplit.length === 1 ? " splits too." : " split too."));
  const nSplit = idx(nodes, (n, j) => n.kind === "gate" && f[j] > 1).length;
  if (nSplit > 1) extras.push(cap(num(nSplit)) + " slots split in all.");
  const more = slots <= 4 ? 1 : 2;
  for (let k = 0; k < more; k++) out.push(extras[(i + k) % extras.length]);
  return out.join(" ");
}
function inputsHint(net, r, i) {
  const nodes = parse(net), lab = labels(nodes), f = fans(nodes);
  const gates = idx(nodes, (n) => n.kind === "gate").length, sw = nodes.length - gates;
  const out = [cap(num(sw)) + " switches, " + num(gates) + " gates."];
  const shared = idx(nodes, (n, j) => n.kind === "input" && f[j] > 1).sort((a, b) => lab[a] < lab[b] ? -1 : 1);
  if (shared.length === 1) {
    const a = shared[0], A = lab[a];
    out.push(["Switch " + A + " feeds " + num(f[a]) + " gates: set it once for all of them.",
      "Switch " + A + " splits " + num(f[a]) + " ways.",
      "Whatever you set " + A + " to reaches " + num(f[a]) + " gates."][i % 3]);
  } else out.push("Switches " + list(shared.map((j) => lab[j])) + " each feed more than one gate.");
  const extras = [];
  const pinned = shared.filter((j) => r.pinned[j]);
  if (pinned.length) extras.push(i % 2 ? "Only one setting of " + lab[pinned[i % pinned.length]] + " can work."
    : lab[pinned[i % pinned.length]] + " has only one setting that can work.");
  const gs = idx(nodes, (n, j) => n.kind === "gate" && f[j] > 1 && j !== nodes.length - 1 && feedRef(nodes, lab, j, "gate"));
  if (gs.length) {
    const g = gs[i % gs.length], ref = "The " + nodes[g].type + " " + feedRef(nodes, lab, g, "gate");
    extras.push(i % 2 ? ref + " passes its answer to " + num(f[g]) + " gates." : ref + " splits " + num(f[g]) + " ways.");
  }
  const root = nodes[nodes.length - 1].type;
  extras.push("The root " + root + " needs " + ROOT_NEEDS[root] + ".");
  if (r.sols <= SMALL) extras.push(r.sols === 1 ? "Exactly one setting of the switches lights the bulb."
    : "Just " + num(r.sols) + " of the " + num(r.total) + " settings light the bulb.");
  const more = gates <= 4 ? 1 : 2;
  for (let k = 0; k < more; k++) out.push(extras[(i + k) % extras.length]);
  return out.join(" ");
}

// ---- the levels --------------------------------------------------------------
const NAMES_GATES = ["Fork in the Road", "Echo", "Two-Way Street", "Split Second", "Same Answer Twice",
  "Ripple", "Branch Line", "Delta", "Hand-Me-Down", "Double Duty", "Common Ground", "Shared Secret",
  "Party Line", "Y Junction", "Tributary", "Copycat", "Overlap", "Many Hands", "Chain Letter",
  "Broadcast", "Hydra", "Splitting Hairs", "Diamond", "Lattice", "Woven", "Tangle", "Switchback",
  "Junction Box", "Overpass", "Interchange", "Cloverleaf", "Relay Race", "Spider Web", "Riverbed",
  "Root System", "Family Tree", "Hub and Spoke", "Spaghetti Junction", "Grand Central", "The Last Fork"];
const NAMES_INPUTS = ["One Switch, Two Gates", "Shared Answer", "Double Agent", "Two Masters",
  "Common Cause", "Tug of War", "Mixed Signals", "Crosstalk", "Split Vote", "Dual Role", "Wishbone",
  "Mirror Mirror", "Backbone", "Keystone", "Linchpin", "Domino Effect", "Butterfly Effect",
  "House of Cards", "Ripple Effect", "Knock-On", "Chain Reaction", "Load Bearing", "Weak Link",
  "Bottleneck", "Switchboard", "Telephone", "Grapevine", "Rumour Mill", "Echo Chamber",
  "Hall of Mirrors", "Rat's Nest", "Gordian Knot", "Master Key", "Skeleton Key", "Cat's Cradle",
  "Fishing Net", "Circuit Breaker", "Mainframe", "Nerve Centre", "Final Fork"];

// the hand-made openers (checked by the solvers like the rest)
const INTRO_GATES = [
  { name: NAMES_GATES[0],
    hint: "See the dot after A? A's wire splits there: the same 1 goes into both gates. Fill all three slots and light the bulb.",
    palette: { AND: 2, OR: 1 },
    net: ["1", "1", "0", "? 0 1", "? 0 2", "? 3 4"] },
  { name: NAMES_GATES[1],
    hint: "The first slot's output splits two ways, so its gate's answer goes to both gates above. Make that one answer work for both.",
    palette: { XOR: 1, AND: 1, OR: 1, NOR: 1 },
    net: ["1", "0", "0", "1", "? 0 1", "? 4 2", "? 4 3", "? 5 6"] },
];
const INTRO_INPUTS = [
  { name: NAMES_INPUTS[0],
    hint: "See the dot after A? A's wire splits: switch A goes into both the AND and the XOR, so one setting has to suit both.",
    net: ["0", "0", "0", "AND 0 1", "XOR 0 2", "AND 3 4"] },
  { name: NAMES_INPUTS[1],
    hint: "The OR's answer splits two ways, to the AND and to the XOR above. The AND needs it at 1, and the XOR has to live with that.",
    net: ["0", "0", "0", "0", "OR 0 1", "AND 4 2", "XOR 4 3", "AND 5 6"] },
];

// Generate one mode: every index from its tier, then within each tier the
// most forgiving first, so the 40 climb smoothly; names and hints go on last,
// by the final order.
function buildMode(N, intro, make, R, log) {
  const seen = new Set(intro.map((l) => signature(parse(l.net), l.palette || null)));
  seen.roots = {};   // root gate types used so far (Set Inputs)
  intro.forEach((l) => { const r = parse(l.net).pop().type; if (r) seen.roots[r] = (seen.roots[r] || 0) + 1; });
  const made = [];
  for (let i = intro.length; i < N; i++) {
    const t0 = Date.now();
    const L = make(R, i, seen);
    made.push(L);
    if (process.env.VERBOSE) console.log(log + " " + i + ": m" + L.m + ", share " + L.frac.toFixed(3) + ", " + (Date.now() - t0) + " ms");
  }
  const order = made.map((L, k) => k).sort((a, b) => made[a].m - made[b].m || made[b].frac - made[a].frac || a - b);
  return order.map((k) => made[k]);
}
function build() {
  const N = 40;
  const gates = INTRO_GATES.slice(), inputs = INTRO_INPUTS.slice();
  buildMode(N, INTRO_GATES, makeGates, rng(0x10c1c), "gates").forEach((L) => {
    const i = gates.length;
    gates.push({ name: NAMES_GATES[i], hint: gatesHint(L.net, L.palette, L.r, i), palette: L.palette, net: L.net });
  });
  buildMode(N, INTRO_INPUTS, makeInputs, rng(0x5911e), "inputs").forEach((L) => {
    const i = inputs.length;
    inputs.push({ name: NAMES_INPUTS[i], hint: inputsHint(L.net, L.r, i), net: L.net });
  });
  // every level, the hand-made ones too: a split, and solvable; and no name twice
  gates.forEach((l) => {
    if (!fans(parse(l.net)).some((f) => f > 1)) throw new Error(l.name + ": no split");
    if (!solveGates(l.net, l.palette).sols) throw new Error(l.name + ": unsolvable");
  });
  inputs.forEach((l) => {
    if (!fans(parse(l.net)).some((f) => f > 1)) throw new Error(l.name + ": no split");
    if (!solveInputs(l.net).sols) throw new Error(l.name + ": unsolvable");
  });
  [gates, inputs].forEach((ls) => {
    if (new Set(ls.map((l) => l.name)).size !== ls.length) throw new Error("a name is used twice");
  });
  return { gates, inputs };
}

function writeFile() {
  const path = require("path"), fs = require("fs");
  const lv = build();
  const fmt = (arr) => arr.map((l) => "    " + JSON.stringify(l)).join(",\n");
  const out = "// LogicGate's split levels: one signal feeding several gates (see fromNet in\n" +
    "// game.js). Written by _dev/tools/logicgate-split-levels.js: change the tool and\n" +
    "// rerun it, not this file.\n" +
    "window.LOGICGATE_SPLITS = {\n  gates: [\n" + fmt(lv.gates) + "\n  ],\n  inputs: [\n" + fmt(lv.inputs) + "\n  ],\n};\n";
  const file = path.join(__dirname, "..", "..", "games", "logicgate", "levels-split.js");
  fs.writeFileSync(file, out);
  console.log("wrote " + file + ": " + lv.gates.length + " Place Gates and " + lv.inputs.length + " Set Inputs levels");
}

module.exports = { GATES, applyGate, parse, fans, labels, depth, MAX_DEPTH, solveGates, solveInputs, build };
if (require.main === module) writeFile();
