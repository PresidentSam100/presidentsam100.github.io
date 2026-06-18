/* Dev tool: estimate puzzle DIFFICULTY (not just solution length).
 *
 * Optimal move count alone is misleading: a 26-move forced ice slide is easier
 * than a 12-move route through poison + live water where most moves are traps.
 *
 * We BFS the full state graph over (row, col, flavor) and combine:
 *   len       - optimal solution length (raw effort)
 *   states    - size of the reachable state space (how much there is to consider)
 *   spread    - states / len  (many states, one thin solution = easy to get lost)
 *   flavorOps - flavor changes forced along an optimal path (Plain/Orange/Lemon juggling)
 *   trap      - fraction of all moves that make no progress (bounce/blocked/self-loop)
 *   mech      - count of distinct mechanic tiles present (y,o,u,b)
 *   combo     - bonus when interacting mechanics coexist (orange+water, yellow+water, ice+orange)
 */
const { resolveMove, tileAt } = require("./engine.js");

const DIRS = ["up", "down", "left", "right"];

function findStart(grid) {
  for (let r = 0; r < grid.length; r++) {
    const c = grid[r].indexOf("S");
    if (c !== -1) return { r, c, flavor: "Plain" };
  }
  return null;
}

function analyze(grid) {
  const start = findStart(grid);
  if (!start) return null;
  const key = (s) => `${s.r},${s.c},${s.flavor}`;

  // BFS with parent links for path reconstruction.
  const seen = new Map();
  seen.set(key(start), { state: start, parent: null, depth: 0 });
  const q = [start];
  let moveTotal = 0;
  let moveNoProgress = 0;

  while (q.length) {
    const s = q.shift();
    const info = seen.get(key(s));
    for (const dir of DIRS) {
      const ns = resolveMove(grid, s, dir).final;
      moveTotal++;
      if (ns.r === s.r && ns.c === s.c && ns.flavor === s.flavor) moveNoProgress++;
      const k = key(ns);
      if (!seen.has(k)) {
        seen.set(k, { state: ns, parent: key(s), depth: info.depth + 1 });
        q.push(ns);
      }
    }
  }

  // shallowest goal state = optimal
  let best = null;
  for (const info of seen.values()) {
    if (tileAt(grid, info.state.r, info.state.c) === "X") {
      if (!best || info.depth < best.depth) best = info;
    }
  }
  if (!best) return null;

  // flavor changes along that optimal path
  const flavors = [];
  let cur = best;
  while (cur) {
    flavors.push(cur.state.flavor);
    cur = cur.parent ? seen.get(cur.parent) : null;
  }
  flavors.reverse();
  let flavorOps = 0;
  for (let i = 1; i < flavors.length; i++) if (flavors[i] !== flavors[i - 1]) flavorOps++;

  const len = best.depth;
  const states = seen.size;
  const spread = states / (len + 1);
  const trap = moveTotal ? moveNoProgress / moveTotal : 0;

  const flat = grid.join("");
  const has = (ch) => flat.includes(ch);
  const mech = ["y", "o", "u", "b"].filter(has).length;
  let combo = 0;
  if (has("o") && has("b")) combo += 2; // orange electrifies water
  if (has("y") && has("b")) combo += 2; // live water
  if (has("u") && has("o")) combo += 2; // ice resets flavor
  if (has("u") && has("b")) combo += 1; // slide into water

  const score =
    len * 1.0 +
    Math.log2(states + 1) * 2.5 +
    spread * 0.7 +
    flavorOps * 4 +
    trap * 22 +
    mech * 1.5 +
    combo;

  return { len, states, spread, flavorOps, trap, mech, combo, score };
}

module.exports = { analyze, findStart };
