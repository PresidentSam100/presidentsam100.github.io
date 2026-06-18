/* Dev tool: procedurally generate + validate themed levels.
 * Each candidate is solved with BFS (same engine the game uses) and kept only
 * if the optimal solution length falls inside a target difficulty band.
 * Prints ready-to-paste grids. Not shipped to players.
 */
const { resolveMove, tileAt } = require("./engine.js");
const { analyze } = require("./analyze.js");

const DIRS = ["up", "down", "left", "right"];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// BFS over (r,c,flavor); returns optimal move count or -1.
function optimal(grid) {
  let start = null;
  for (let r = 0; r < grid.length; r++) {
    const c = grid[r].indexOf("S");
    if (c !== -1) start = { r, c, flavor: "Plain" };
  }
  if (!start) return -1;
  const key = (s) => `${s.r},${s.c},${s.flavor}`;
  const seen = new Set([key(start)]);
  let frontier = [start];
  let depth = 0;
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      if (tileAt(grid, s.r, s.c) === "X") return depth;
      for (const dir of DIRS) {
        const res = resolveMove(grid, s, dir);
        const ns = res.final;
        const k = key(ns);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(ns);
      }
    }
    frontier = next;
    depth++;
    if (depth > 200) break;
  }
  return -1;
}

function blank(H, W) {
  const g = [];
  for (let r = 0; r < H; r++) {
    let row = "";
    for (let c = 0; c < W; c++) row += r === 0 || r === H - 1 || c === 0 || c === W - 1 ? "r" : ".";
    g.push(row.split(""));
  }
  return g;
}
function place(g, r, c, ch) { g[r][c] = ch; }
function toStrings(g) { return g.map((row) => row.join("")); }

// Generic random-fill generator for a single-base theme.
// base: fill char for interior; feature: hazard char; prob: feature density.
function genTheme(base, feature, opts) {
  const { H, W, prob, band, seed0 = 1, tries = 20000 } = opts;
  for (let seed = seed0; seed < seed0 + tries; seed++) {
    const rnd = mulberry32(seed);
    const g = blank(H, W);
    for (let r = 1; r < H - 1; r++)
      for (let c = 1; c < W - 1; c++) g[r][c] = rnd() < prob ? feature : base;
    // start & goal at opposite interior corners
    place(g, 1, 1, "S");
    place(g, H - 2, W - 2, "X");
    // keep a couple of neighbors of S/X open so they aren't walled in
    if (g[2][1] === "r") g[2][1] = base;
    if (g[1][2] === "r") g[1][2] = base;
    const len = optimal(g);
    if (len >= band[0] && len <= band[1]) return { grid: toStrings(g), len, seed };
  }
  return null;
}

// Flavor maze: blue water (safe while Plain/Lemon) with orange "poison"
// patches (which electrify all water) and occasional purple ice that resets
// you back to Lemon. The solver tracks flavor, so kept levels are fair.
function genFlavor(opts) {
  const { H, W, band, seed0 = 1, tries = 40000, weights } = opts;
  const w = weights || { b: 0.6, o: 0.2, p: 0.12, u: 0.08 };
  const pick = (rnd) => {
    let x = rnd();
    for (const k in w) { if ((x -= w[k]) < 0) return k; }
    return "b";
  };
  for (let seed = seed0; seed < seed0 + tries; seed++) {
    const rnd = mulberry32(seed);
    const g = blank(H, W);
    for (let r = 1; r < H - 1; r++)
      for (let c = 1; c < W - 1; c++) g[r][c] = pick(rnd);
    place(g, 1, 1, "S");
    place(g, H - 2, W - 2, "X");
    // keep the goal approachable on safe water
    if ("ou".includes(g[H - 2][W - 3])) g[H - 2][W - 3] = "b";
    if ("ou".includes(g[H - 3][W - 2])) g[H - 3][W - 2] = "b";
    if ("ou".includes(g[1][2])) g[1][2] = "b";
    if ("ou".includes(g[2][1])) g[2][1] = "b";
    const len = optimal(g);
    if (len >= band[0] && len <= band[1]) return { grid: toStrings(g), len, seed };
  }
  return null;
}

// Variety: a walkable pink-base maze sprinkled with EVERY tile type, so each
// level shows off the full palette (pink paths, green, red walls, yellow,
// orange, purple ice, blue water). Kept only if it uses >= minDistinct types,
// is solvable, and lands in the difficulty band.
function genVariety(opts) {
  const { H, W, band, minDistinct = 6, seed0 = 1, tries = 60000, scoreBand } = opts;
  const w = { p: 0.34, b: 0.15, r: 0.14, u: 0.1, o: 0.1, y: 0.09, g: 0.08 };
  const types = "pbruyog";
  const pick = (rnd) => {
    let x = rnd();
    for (const k in w) { if ((x -= w[k]) < 0) return k; }
    return "p";
  };
  for (let seed = seed0; seed < seed0 + tries; seed++) {
    const rnd = mulberry32(seed);
    const g = blank(H, W);
    for (let r = 1; r < H - 1; r++)
      for (let c = 1; c < W - 1; c++) g[r][c] = pick(rnd);
    place(g, 1, 1, "S");
    place(g, H - 2, W - 2, "X");
    // give S and X breathing room so they aren't sealed off
    if (g[1][2] === "r") g[1][2] = "p";
    if (g[2][1] === "r") g[2][1] = "p";
    if (g[H - 2][W - 3] === "r") g[H - 2][W - 3] = "p";
    if (g[H - 3][W - 2] === "r") g[H - 3][W - 2] = "p";
    const flat = g.map((r) => r.join("")).join("");
    const distinct = types.split("").filter((t) => flat.includes(t)).length;
    if (distinct < minDistinct) continue;
    const len = optimal(g);
    if (len < band[0] || len > band[1]) continue;
    if (scoreBand) {
      const a = analyze(toStrings(g));
      if (!a || a.score < scoreBand[0] || a.score > scoreBand[1]) continue;
      return { grid: toStrings(g), len, seed, distinct, score: +a.score.toFixed(1) };
    }
    return { grid: toStrings(g), len, seed, distinct };
  }
  return null;
}

// Mixed: everything at once — water, electrified yellow, orange poison, ice.
function genMixed(opts) {
  return genFlavor(Object.assign({ weights: { b: 0.62, o: 0.12, y: 0.1, p: 0.1, u: 0.06 } }, opts));
}

// Levels 33-40: harder than anything so far (current max difficulty ~76),
// gated on the difficulty SCORE (not length) and using all 7 tile types.
const jobs = [
  { label: "H38", fn: () => genVariety({ H: 11, W: 13, band: [18, 90],  scoreBand: [104, 113], minDistinct: 7, seed0: 6000, tries: 700000 }) },
  { label: "H39", fn: () => genVariety({ H: 12, W: 14, band: [20, 110], scoreBand: [110, 122], minDistinct: 7, seed0: 7000, tries: 700000 }) },
  { label: "H40", fn: () => genVariety({ H: 12, W: 15, band: [22, 120], scoreBand: [118, 145], minDistinct: 7, seed0: 8000, tries: 900000 }) },
];

for (const j of jobs) {
  const r = j.fn();
  if (!r) { console.log(`${j.label}: NONE FOUND`); continue; }
  console.log(`\n// ${j.label}  (optimal ${r.len} moves, difficulty ${r.score}, seed ${r.seed})`);
  console.log("grid: [");
  r.grid.forEach((row) => console.log(`  "${row}",`));
  console.log("],");
}
