/* Dev tool: BFS over (row,col,flavor) to prove each level is solvable.
 *   node _dev/tools/tile-maze-verify.js */
const { resolveMove, findStart, tileAt, isWall } = require("../../games/tile-maze/engine.js");
const LEVELS = require("../../games/tile-maze/levels.js");

const DIRS = ["up", "down", "left", "right"];

function solve(grid) {
  const start = findStart(grid);
  const key = (s) => `${s.r},${s.c},${s.flavor}`;
  const seen = new Set([key(start)]);
  const q = [{ state: start, path: [] }];
  while (q.length) {
    const { state, path } = q.shift();
    if (tileAt(grid, state.r, state.c) === "X") return path;
    for (const dir of DIRS) {
      const res = resolveMove(grid, state, dir);
      const ns = res.final;
      const k = key(ns);
      if (seen.has(k)) continue;
      seen.add(k);
      q.push({ state: ns, path: [...path, dir[0].toUpperCase()] });
      if (res.win) return [...path, dir[0].toUpperCase()];
    }
  }
  return null;
}

function checkRectangular(grid) {
  const w = grid[0].length;
  return grid.every((row) => row.length === w);
}

let allOk = true;
// every level needs an id of its own: progress is saved under it (see levels.js)
const ids = new Map();
LEVELS.forEach((lvl, i) => {
  if (!lvl.id) { allOk = false; console.log(`Level ${i + 1} "${lvl.name}": NO ID! Give it one (its name will do) so a later rename keeps players' progress.`); }
  else if (ids.has(lvl.id)) { allOk = false; console.log(`Level ${i + 1} "${lvl.name}": its id "${lvl.id}" is level ${ids.get(lvl.id) + 1}'s too.`); }
  else ids.set(lvl.id, i);
});
LEVELS.forEach((lvl, i) => {
  const rect = checkRectangular(lvl.grid);
  const sol = solve(lvl.grid);
  const status = sol ? `OK (${sol.length} moves: ${sol.join(" ")})` : "UNSOLVABLE";
  if (!rect || !sol) allOk = false;
  console.log(
    `Level ${i + 1} "${lvl.name}": ${rect ? "" : "NON-RECTANGULAR! "}${status}`
  );
});

process.exit(allOk ? 0 : 1);
