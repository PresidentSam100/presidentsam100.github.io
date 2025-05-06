/*
 * Tile Maze - shared rules engine.
 * Pure logic, no DOM. Used by both the browser game (game.js)
 * and the Node level verifier (verify.js).
 *
 * Tile legend (single chars in level grids):
 *   r  red     - solid wall, cannot be entered
 *   p  pink    - inert, walkable
 *   g  green   - "sound" tile, walkable like pink (plays a tone in UI)
 *   y  yellow  - bounces player back to the tile they came from
 *   o  orange  - walkable, sets player flavor to "Orange"
 *   u  purple  - ice: slides player forward; sets flavor to "Lemon"
 *   b  blue    - context sensitive (see resolveBlue)
 *   S  start   - walkable (acts like pink), player spawns here
 *   X  goal    - walkable, reaching it wins the level
 *   ' ' or '.' - void / empty, treated like a wall
 *
 * Flavors: "Plain", "Orange", "Lemon".
 */
(function (root, factory) {
  const mod = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = mod;
  if (typeof window !== "undefined") window.TileEngine = mod;
})(this, function () {
  "use strict";

  const DELTA = {
    up: { r: -1, c: 0 },
    down: { r: 1, c: 0 },
    left: { r: 0, c: -1 },
    right: { r: 0, c: 1 },
  };

  function tileAt(grid, r, c) {
    if (r < 0 || r >= grid.length) return null;
    const row = grid[r];
    if (c < 0 || c >= row.length) return null;
    return row[c];
  }

  function isVoid(ch) {
    return ch === null || ch === " " || ch === ".";
  }
  function isWall(ch) {
    return ch === "r" || isVoid(ch);
  }

  // Blue is "electrified" (acts like yellow) when it is orthogonally
  // adjacent to a yellow tile, OR the player's flavor is "Orange".
  function blueIsBounce(grid, flavor, r, c) {
    if (flavor === "Orange") return true;
    for (const k in DELTA) {
      const d = DELTA[k];
      if (tileAt(grid, r + d.r, c + d.c) === "y") return true;
    }
    return false;
  }

  // Resolve a single directional input.
  // Returns a detailed result so the UI can animate, while the solver
  // only needs `final` and `win`.
  //   steps   : array of {r,c,flavor?} positions the player visibly moves through
  //   final   : {r,c,flavor} resting state after the move
  //   win     : reached the goal
  //   bounced : a yellow/electrified tile threw the player back
  //   blocked : could not move at all (wall in front)
  //   sound   : stepped onto a green tile
  function resolveMove(grid, state, dir) {
    const d = DELTA[dir];
    if (!d) return { steps: [], final: { ...state }, win: false, blocked: true };

    let flavor = state.flavor || "Plain";
    let cur = { r: state.r, c: state.c };
    let next = { r: cur.r + d.r, c: cur.c + d.c };

    const steps = [];
    let win = false,
      bounced = false,
      blocked = false,
      hitWall = false,
      sound = false;
    let guard = 0;

    while (true) {
      if (++guard > 2000) break; // safety against pathological loops
      const ch = tileAt(grid, next.r, next.c);

      if (isWall(ch)) {
        hitWall = true;
        if (steps.length === 0) blocked = true; // nothing moved
        break; // stay on `cur`
      }

      const electrified = ch === "b" && blueIsBounce(grid, flavor, next.r, next.c);

      if (ch === "y" || electrified) {
        // Forced back to the last tile stepped on (= cur).
        bounced = true;
        steps.push({ r: next.r, c: next.c }); // show the doomed step
        steps.push({ r: cur.r, c: cur.c }); // ...then the rebound
        break;
      }

      if (ch === "o") {
        flavor = "Orange";
        cur = next;
        steps.push({ r: cur.r, c: cur.c, flavor });
        break; // orange does not slide
      }

      if (ch === "u") {
        flavor = "Lemon";
        cur = next;
        steps.push({ r: cur.r, c: cur.c, flavor });
        next = { r: cur.r + d.r, c: cur.c + d.c };
        continue; // keep sliding in the same direction
      }

      // Safe tiles: pink, green, blue (inert), start, goal.
      if (ch === "g") sound = true;
      cur = next;
      steps.push({ r: cur.r, c: cur.c });
      if (ch === "X") win = true;
      break;
    }

    return {
      steps,
      final: { r: cur.r, c: cur.c, flavor },
      win,
      bounced,
      blocked,
      hitWall,
      sound,
    };
  }

  function findStart(grid) {
    for (let r = 0; r < grid.length; r++) {
      const c = grid[r].indexOf("S");
      if (c !== -1) return { r, c, flavor: "Plain" };
    }
    return { r: 0, c: 0, flavor: "Plain" };
  }

  return { DELTA, tileAt, isWall, isVoid, blueIsBounce, resolveMove, findStart };
});
