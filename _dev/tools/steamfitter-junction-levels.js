// Steamfitter: generate the junction levels (31-36 in games/steamfitter/levels.js).
//
//   node _dev/tools/steamfitter-junction-levels.js
//
// For each spec it carves a route from the tank to the drain on the 9x7 board,
// lays the right straight / bend on every cell, swaps some route cells for
// 4-way junctions (j) and tees (t u y z, oriented to carry the flow), scatters
// decoys (bends, straights, crossovers, tees, the odd junction) and a few
// blocked plates, then checks the SOLVED layout connects using the game's own
// rules (a tee or junction is one chamber; a crossover is two channels). The
// game scrambles the pieces at play time. Seeds are fixed, so the output is
// the same every run; paste the printed lines into levels.js.
const ROWS = 7, COLS = 9;
const OPP = { N: "S", S: "N", E: "W", W: "E" }, DXY = { N: [0, -1], S: [0, 1], E: [1, 0], W: [-1, 0] };
const PORTS = { h: "WE", v: "NS", a: "NE", b: "NW", c: "SE", d: "SW", x: "NSEW", j: "NESW", t: "EWN", u: "NSE", y: "EWS", z: "NSW" };
const GROUPS = { h: ["WE"], v: ["NS"], a: ["NE"], b: ["NW"], c: ["SE"], d: ["SW"], x: ["NS", "EW"], j: ["NESW"], t: ["EWN"], u: ["NSE"], y: ["EWS"], z: ["NSW"] };
const BEND = { EN: "a", NE: "a", NW: "b", WN: "b", ES: "c", SE: "c", SW: "d", WS: "d", EW: "h", WE: "h", NS: "v", SN: "v" };
const TEE_FOR_MISSING = { S: "t", W: "u", N: "y", E: "z" };   // a tee's ports are all but one side
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function dirBetween(a, b) { return b.c > a.c ? "E" : b.c < a.c ? "W" : b.r > a.r ? "S" : "N"; }
function connected(g, s, d) {
  const at = (r, c) => g[r * COLS + c];
  if (!PORTS[at(s, 1)]) return 0;
  const q = [[s, 1, "W", 1]], seen = new Set([s + ",1,W"]);
  while (q.length) {
    const [r, c, e, n] = q.shift(), ch = at(r, c), grp = (GROUPS[ch] || []).find(x => x.includes(e));
    if (!grp) continue;
    for (const ex of grp) { if (ex === e) continue;
      const nr = r + DXY[ex][1], nc = c + DXY[ex][0]; if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) continue;
      const nb = at(nr, nc); if (nb === "O") return n + 1;
      if (!PORTS[nb] || !PORTS[nb].includes(OPP[ex])) continue;
      const k = nr + "," + nc + "," + OPP[ex]; if (seen.has(k)) continue; seen.add(k); q.push([nr, nc, OPP[ex], n + 1]); }
  }
  return 0;
}
function carve(R, s, d, want) {
  let best = null;
  for (let attempt = 0; attempt < 400; attempt++) {
    const vis = new Set(), path = []; let out = null;
    const dfs = (r, c) => {
      if (out) return; vis.add(r + "," + c); path.push({ r, c });
      if (r === d && c === COLS - 2) { if (path.length >= want - 3) out = path.slice(); }
      else { const dirs = ["N", "S", "E", "W"].sort(() => R() - 0.5);
        for (const dd of dirs) { const nr = r + DXY[dd][1], nc = c + DXY[dd][0];
          if (nr < 0 || nr >= ROWS || nc < 1 || nc > COLS - 2 || vis.has(nr + "," + nc)) continue;
          if (path.length > want + 4) break; dfs(nr, nc); if (out) break; } }
      if (!out) { path.pop(); vis.delete(r + "," + c); }
    };
    dfs(s, 1);
    if (out && (!best || Math.abs(out.length - want) < Math.abs(best.length - want))) best = out;
    if (best && Math.abs(best.length - want) <= 1) break;
  }
  return best;
}
function make(seed, want, junctions, tees, decoyP, blocks) {
  const R = rng(seed);
  for (let tries = 0; tries < 200; tries++) {
    const s = 1 + (R() * (ROWS - 2) | 0), d = 1 + (R() * (ROWS - 2) | 0);
    const path = carve(R, s, d, want); if (!path) continue;
    const g = Array(ROWS * COLS).fill(".");
    g[s * COLS] = "o"; g[d * COLS + COLS - 1] = "O";
    const info = path.map((p, i) => ({ ...p, enter: i === 0 ? "W" : OPP[dirBetween(path[i - 1], p)], exit: i === path.length - 1 ? "E" : dirBetween(p, path[i + 1]) }));
    info.forEach(p => { g[p.r * COLS + p.c] = BEND[p.enter + p.exit]; });
    // junctions on the route (not the first or last piece), spread out
    const mids = info.slice(2, -2).sort(() => R() - 0.5);
    const jset = [];
    for (const p of mids) { if (jset.length >= junctions) break; if (jset.some(q => Math.abs(q.r - p.r) + Math.abs(q.c - p.c) < 3)) continue; jset.push(p); g[p.r * COLS + p.c] = "j"; }
    if (jset.length < junctions) continue;
    // a few tees on the route too, oriented to carry the flow
    let tcount = 0;
    for (const p of mids) { if (tcount >= tees) break; if (g[p.r * COLS + p.c] === "j") continue;
      const missing = ["N", "S", "E", "W"].filter(x => x !== p.enter && x !== p.exit); const m = missing[(R() * missing.length) | 0];
      g[p.r * COLS + p.c] = TEE_FOR_MISSING[m]; tcount++; }
    // decoys: bends / straights / crossovers / tees / the odd junction; a few blocks
    for (let r = 0; r < ROWS; r++) for (let c = 1; c < COLS - 1; c++) {
      const k = r * COLS + c; if (g[k] !== ".") continue;
      const x = R();
      if (x < decoyP) g[k] = "hvabcd"[(R() * 6) | 0];
      else if (x < decoyP + 0.04) g[k] = "x";
      else if (x < decoyP + 0.07) g[k] = "tuyz"[(R() * 4) | 0];
      else if (x < decoyP + 0.09) g[k] = "j";
    }
    let b = 0; for (let k = 0; k < 400 && b < blocks; k++) { const r = (R() * ROWS) | 0, c = 1 + ((R() * (COLS - 2)) | 0), kk = r * COLS + c; if (g[kk] === ".") { g[kk] = "#"; b++; } }
    const str = g.join(""), len = connected(str, s, d);
    if (!len) continue;
    return { s, d, g: str, len, pathLen: path.length, j: (str.match(/j/g) || []).length };
  }
  return null;
}
const specs = [
  ["Four Ways", 18, 2, 1, 0.22, 0], ["Crossroads", 20, 2, 1, 0.26, 2], ["Manifold", 22, 3, 2, 0.30, 2],
  ["Switchyard", 24, 3, 2, 0.32, 3], ["Grand Central", 26, 4, 2, 0.36, 3], ["Waterworks", 28, 4, 3, 0.40, 4],
];
const out = [];
specs.forEach(([n, want, J, T, dp, bl], i) => {
  const L = make(9001 + i * 77, want, J, T, dp, bl);
  if (!L) { console.error("FAILED", n); return; }
  out.push(L); console.error(n, "path", L.pathLen, "solution", L.len, "junctions", L.j);
  console.log(`  { n: "${n}", s: ${L.s}, d: ${L.d}, g: "${L.g}" },`);
});
