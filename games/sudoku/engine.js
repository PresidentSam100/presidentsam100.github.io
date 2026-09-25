/* =====================================================================
   Sudoku engine: generator, uniqueness check and a human-style grader.
   No DOM. game.js uses it in the page (and in a worker); tests use it
   under node.

   Grids are 81-long arrays, row-major, 0 = empty. Candidate sets are
   9-bit masks: bit (d - 1) set means digit d is still possible.

   Difficulty is graded by the hardest technique a person needs, not by
   clue count alone:
     tier 1  singles (naked + hidden)
     tier 2  locked candidates, naked/hidden pairs & triples
     tier 3  X-Wing, Swordfish, XY-Wing, XYZ-Wing
   Puzzles the grader can't finish with those are never handed out.
   Uniqueness is always decided by the exhaustive counter, never by the
   grader, so a bug in a technique can't ship an ambiguous puzzle.
   ===================================================================== */
(function (root) {
  "use strict";

  const ALL = 0x1ff;

  // ---- geometry ----------------------------------------------------------
  const ROW_OF = new Uint8Array(81), COL_OF = new Uint8Array(81), BOX_OF = new Uint8Array(81);
  const UNITS = [];      // 0-8 rows, 9-17 columns, 18-26 boxes
  const PEERS = [];      // 20 cells sharing a row, column or box
  const IS_PEER = [];    // IS_PEER[i][j] -> 1 if j sees i
  for (let i = 0; i < 81; i++) {
    const r = (i / 9) | 0, c = i % 9;
    ROW_OF[i] = r;
    COL_OF[i] = c;
    BOX_OF[i] = ((r / 3) | 0) * 3 + ((c / 3) | 0);
  }
  for (let u = 0; u < 27; u++) UNITS.push([]);
  for (let i = 0; i < 81; i++) {
    UNITS[ROW_OF[i]].push(i);
    UNITS[9 + COL_OF[i]].push(i);
    UNITS[18 + BOX_OF[i]].push(i);
  }
  for (let i = 0; i < 81; i++) {
    const seen = new Uint8Array(81);
    const list = [];
    for (const u of [ROW_OF[i], 9 + COL_OF[i], 18 + BOX_OF[i]]) {
      for (const j of UNITS[u]) {
        if (j !== i && !seen[j]) { seen[j] = 1; list.push(j); }
      }
    }
    PEERS.push(list);
    IS_PEER.push(seen);
  }

  const POP = new Uint8Array(512);
  for (let m = 1; m < 512; m++) POP[m] = POP[m >> 1] + (m & 1);
  const digitOf = (bit) => 32 - Math.clz32(bit);   // single-bit mask -> 1..9

  // ---- randomness ----------------------------------------------------------
  // Seedable so tests are reproducible; the game passes Math.random.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, rand) {
    for (let k = arr.length - 1; k > 0; k--) {
      const j = Math.floor(rand() * (k + 1));
      const t = arr[k]; arr[k] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // ---- exhaustive search ---------------------------------------------------
  // Bitmask backtracking, most-constrained cell first. Stops at `limit`
  // solutions. With `rand`, candidates are tried in random order, which is
  // how a fresh solved grid is made. Returns { count, first }.
  function search(grid, limit, rand) {
    const g = Int8Array.from(grid);
    const rm = new Int32Array(9), cm = new Int32Array(9), bm = new Int32Array(9);
    for (let i = 0; i < 81; i++) {
      const v = g[i];
      if (!v) continue;
      const bit = 1 << (v - 1);
      if ((rm[ROW_OF[i]] | cm[COL_OF[i]] | bm[BOX_OF[i]]) & bit) return { count: 0, first: null };
      rm[ROW_OF[i]] |= bit; cm[COL_OF[i]] |= bit; bm[BOX_OF[i]] |= bit;
    }
    const empties = [];
    for (let i = 0; i < 81; i++) if (!g[i]) empties.push(i);
    let count = 0, first = null;

    function go(k) {
      if (k === empties.length) {
        if (!first) first = Array.from(g);
        return ++count >= limit;
      }
      let best = k, bestN = 10, bestMask = 0;
      for (let j = k; j < empties.length; j++) {
        const i = empties[j];
        const m = ALL & ~(rm[ROW_OF[i]] | cm[COL_OF[i]] | bm[BOX_OF[i]]);
        const n = POP[m];
        if (n < bestN) {
          bestN = n; best = j; bestMask = m;
          if (n <= 1) break;
        }
      }
      if (!bestN) return false;
      const i = empties[best];
      empties[best] = empties[k];
      empties[k] = i;
      const r = ROW_OF[i], c = COL_OF[i], b = BOX_OF[i];
      let bits = [];
      for (let m = bestMask; m; m &= m - 1) bits.push(m & -m);
      if (rand) bits = shuffle(bits, rand);
      for (const bit of bits) {
        g[i] = digitOf(bit);
        rm[r] |= bit; cm[c] |= bit; bm[b] |= bit;
        if (go(k + 1)) return true;
        rm[r] ^= bit; cm[c] ^= bit; bm[b] ^= bit;
      }
      g[i] = 0;
      return false;
    }
    go(0);
    return { count, first };
  }

  const countSolutions = (grid, limit) => search(grid, limit || 2, null).count;
  const solve = (grid) => search(grid, 1, null).first;
  const fullGrid = (rand) => search(new Array(81).fill(0), 1, rand).first;

  // ---- logical solver ------------------------------------------------------
  // S = { v: values, c: candidate masks, left: empty cells }
  function makeState(grid) {
    const v = Int8Array.from(grid);
    const c = new Int16Array(81);
    let left = 0;
    for (let i = 0; i < 81; i++) {
      if (v[i]) continue;
      left++;
      let used = 0;
      for (const p of PEERS[i]) if (v[p]) used |= 1 << (v[p] - 1);
      c[i] = ALL & ~used;
    }
    return { v, c, left };
  }

  function place(S, i, d) {
    const bit = 1 << (d - 1);
    S.v[i] = d;
    S.c[i] = 0;
    S.left--;
    for (const p of PEERS[i]) S.c[p] &= ~bit;
  }

  // Remove `mask` from cell i; true if anything was actually removed.
  function strip(S, i, mask) {
    if (S.v[i] || !(S.c[i] & mask)) return false;
    S.c[i] &= ~mask;
    return true;
  }

  // Next single, in the order a person tends to spot them: hidden singles
  // in boxes, then in rows/columns, then naked singles.
  const HIDDEN_ORDER = [];
  for (let u = 18; u < 27; u++) HIDDEN_ORDER.push(u);
  for (let u = 0; u < 18; u++) HIDDEN_ORDER.push(u);

  function findSingle(S) {
    for (const u of HIDDEN_ORDER) {
      const cells = UNITS[u];
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1);
        let at = -1, n = 0;
        for (const i of cells) {
          if (S.v[i] === d) { n = 2; break; }   // already placed in this unit
          if (S.c[i] & bit) { at = i; if (++n > 1) break; }
        }
        if (n === 1) return { i: at, d, how: "hidden", unit: u };
      }
    }
    for (let i = 0; i < 81; i++) {
      if (!S.v[i] && POP[S.c[i]] === 1) return { i, d: digitOf(S.c[i]), how: "naked", unit: -1 };
    }
    return null;
  }

  // k-combinations of `arr` (small arrays only).
  function combos(arr, k, fn) {
    const pick = [];
    (function rec(start) {
      if (pick.length === k) return fn(pick);
      for (let j = start; j <= arr.length - (k - pick.length); j++) {
        pick.push(arr[j]);
        const stop = rec(j + 1);
        pick.pop();
        if (stop) return true;
      }
      return false;
    })(0);
  }

  // -- tier 2 --
  function lockedCandidates(S) {
    // Pointing: within a box, a digit confined to one row/column clears
    // that line outside the box. Claiming: within a line, a digit confined
    // to one box clears the rest of that box.
    for (let u = 0; u < 27; u++) {
      const cells = UNITS[u];
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1);
        let rows = 0, cols = 0, boxes = 0, n = 0;
        for (const i of cells) {
          if (S.c[i] & bit) {
            rows |= 1 << ROW_OF[i]; cols |= 1 << COL_OF[i]; boxes |= 1 << BOX_OF[i];
            n++;
          }
        }
        if (n < 2) continue;
        let targets = null;
        if (u >= 18) {
          if (POP[rows] === 1) targets = UNITS[digitOf(rows) - 1];
          else if (POP[cols] === 1) targets = UNITS[9 + digitOf(cols) - 1];
        } else if (POP[boxes] === 1) {
          targets = UNITS[18 + digitOf(boxes) - 1];
        }
        if (!targets) continue;
        let hit = false;
        for (const j of targets) {
          if (cells.indexOf(j) === -1 && strip(S, j, bit)) hit = true;
        }
        if (hit) return true;
      }
    }
    return false;
  }

  function nakedSubset(S, size) {
    for (let u = 0; u < 27; u++) {
      const cells = UNITS[u];
      const pool = cells.filter((i) => !S.v[i] && POP[S.c[i]] >= 2 && POP[S.c[i]] <= size);
      if (pool.length < size) continue;
      let hit = false;
      combos(pool, size, (pick) => {
        let union = 0;
        for (const i of pick) union |= S.c[i];
        if (POP[union] !== size) return false;
        for (const j of cells) {
          if (pick.indexOf(j) === -1 && strip(S, j, union)) hit = true;
        }
        return hit;
      });
      if (hit) return true;
    }
    return false;
  }

  function hiddenSubset(S, size) {
    for (let u = 0; u < 27; u++) {
      const cells = UNITS[u];
      const where = [];   // where[d] = bitmask of positions (0..8) in the unit
      const digits = [];
      for (let d = 1; d <= 9; d++) {
        const bit = 1 << (d - 1);
        let pos = 0;
        for (let k = 0; k < 9; k++) if (S.c[cells[k]] & bit) pos |= 1 << k;
        where[d] = pos;
        if (POP[pos] >= 2 && POP[pos] <= size) digits.push(d);
      }
      if (digits.length < size) continue;
      let hit = false;
      combos(digits, size, (pick) => {
        let pos = 0, keep = 0;
        for (const d of pick) { pos |= where[d]; keep |= 1 << (d - 1); }
        if (POP[pos] !== size) return false;
        for (let k = 0; k < 9; k++) {
          if (pos & (1 << k) && strip(S, cells[k], ALL & ~keep)) hit = true;
        }
        return hit;
      });
      if (hit) return true;
    }
    return false;
  }

  // -- tier 3 --
  // Fish of `size` (2 = X-Wing, 3 = Swordfish): if a digit's spots in
  // `size` rows all fall in the same `size` columns, it's gone from the
  // rest of those columns. Then the same with rows and columns swapped.
  function fish(S, size) {
    for (let d = 1; d <= 9; d++) {
      const bit = 1 << (d - 1);
      for (let byCol = 0; byCol < 2; byCol++) {
        const base = [];    // lines with 2..size spots for d
        const spots = [];
        for (let L = 0; L < 9; L++) {
          const cells = UNITS[(byCol ? 9 : 0) + L];
          let m = 0;
          for (let k = 0; k < 9; k++) if (S.c[cells[k]] & bit) m |= 1 << k;
          spots[L] = m;
          if (POP[m] >= 2 && POP[m] <= size) base.push(L);
        }
        if (base.length < size) continue;
        let hit = false;
        combos(base, size, (lines) => {
          let cover = 0;
          for (const L of lines) cover |= spots[L];
          if (POP[cover] !== size) return false;
          for (let k = 0; k < 9; k++) {
            if (!(cover & (1 << k))) continue;
            const crossCells = UNITS[(byCol ? 0 : 9) + k];
            for (let L = 0; L < 9; L++) {
              if (lines.indexOf(L) === -1 && strip(S, crossCells[L], bit)) hit = true;
            }
          }
          return hit;
        });
        if (hit) return true;
      }
    }
    return false;
  }

  // XY-Wing: pivot {a,b} sees pincers {a,c} and {b,c}; whichever the pivot
  // is, one pincer is c, so c goes from every cell that sees both pincers.
  // XYZ-Wing: pivot {a,b,c} with the same pincers; the pivot itself might
  // be c, so the target must see the pivot too.
  function wing(S, xyz) {
    for (let p = 0; p < 81; p++) {
      const pm = S.c[p];
      if (S.v[p] || POP[pm] !== (xyz ? 3 : 2)) continue;
      const wings = PEERS[p].filter((j) => !S.v[j] && POP[S.c[j]] === 2 && POP[S.c[j] & pm] === (xyz ? 2 : 1));
      for (let x = 0; x < wings.length; x++) {
        for (let y = x + 1; y < wings.length; y++) {
          const a = wings[x], b = wings[y];
          const am = S.c[a], bm = S.c[b];
          if (am === bm) continue;
          const z = am & bm;
          if (POP[z] !== 1) continue;
          // {a,c} + {b,c}: XY needs the pivot to be {a,b}, XYZ {a,b,c}
          if (xyz ? (am | bm) !== pm : (am ^ bm) !== pm) continue;
          let hit = false;
          for (const j of PEERS[a]) {
            if (j === p || j === b || !IS_PEER[b][j]) continue;
            if (xyz && !IS_PEER[p][j]) continue;
            if (strip(S, j, z)) hit = true;
          }
          if (hit) return true;
        }
      }
    }
    return false;
  }

  const TECHNIQUES = [
    { name: "locked candidates", tier: 2, run: lockedCandidates },
    { name: "naked pair", tier: 2, run: (S) => nakedSubset(S, 2) },
    { name: "hidden pair", tier: 2, run: (S) => hiddenSubset(S, 2) },
    { name: "naked triple", tier: 2, run: (S) => nakedSubset(S, 3) },
    { name: "hidden triple", tier: 2, run: (S) => hiddenSubset(S, 3) },
    { name: "X-Wing", tier: 3, run: (S) => fish(S, 2) },
    { name: "XY-Wing", tier: 3, run: (S) => wing(S, false) },
    { name: "XYZ-Wing", tier: 3, run: (S) => wing(S, true) },
    { name: "Swordfish", tier: 3, run: (S) => fish(S, 3) },
  ];

  // Solve like a person would; stop at the first technique past `maxTier`.
  // Returns { solved, tier, used, grid }.
  function grade(grid, maxTier) {
    maxTier = maxTier || 3;
    const S = makeState(grid);
    let tier = 1;
    const used = {};
    for (;;) {
      if (!S.left) return { solved: true, tier, used, grid: Array.from(S.v) };
      const s = findSingle(S);
      if (s) {
        place(S, s.i, s.d);
        continue;
      }
      let moved = false;
      for (const t of TECHNIQUES) {
        if (t.tier > maxTier) break;
        if (t.run(S)) {
          if (t.tier > tier) tier = t.tier;
          used[t.name] = (used[t.name] || 0) + 1;
          moved = true;
          break;
        }
      }
      if (!moved) return { solved: false, tier: 4, used, grid: Array.from(S.v) };
    }
  }

  // The next cell a person could fill on `grid` (which must hold no wrong
  // entries), plus the techniques needed to get there. null if the
  // grader's techniques can't find one.
  function nextStep(grid) {
    const S = makeState(grid);
    if (!S.left) return null;
    const via = [];
    for (let guard = 0; guard < 400; guard++) {
      const s = findSingle(S);
      if (s) {
        s.via = via;
        return s;
      }
      let moved = false;
      for (const t of TECHNIQUES) {
        if (t.run(S)) {
          if (via.indexOf(t.name) === -1) via.push(t.name);
          moved = true;
          break;
        }
      }
      if (!moved) return null;
    }
    return null;
  }

  // ---- generator -----------------------------------------------------------
  // Clues come out in 180°-symmetric pairs, like a printed puzzle. Each
  // removal must keep the answer unique AND keep the puzzle solvable with
  // techniques no harder than the level allows, so carving can go as deep
  // as the level permits without overshooting it.
  const LEVELS = {
    easy: { clues: 38, minTier: 1, maxTier: 1 },
    medium: { clues: 30, minTier: 1, maxTier: 1 },
    hard: { clues: 0, minTier: 2, maxTier: 2 },
    expert: { clues: 0, minTier: 3, maxTier: 3 },
  };
  const MAX_ATTEMPTS = 300;   // p99 is ~80 for expert; this is a runaway guard

  function carve(solution, rand, level) {
    const L = LEVELS[level];
    const puzzle = solution.slice();
    let clues = 81;
    const order = shuffle(Array.from({ length: 41 }, (_, k) => k), rand);
    for (const i of order) {
      if (clues <= L.clues) break;
      const j = 80 - i;
      const vi = puzzle[i], vj = puzzle[j];
      puzzle[i] = 0;
      puzzle[j] = 0;
      if (countSolutions(puzzle, 2) === 1 && grade(puzzle, L.maxTier).solved) {
        clues -= i === j ? 1 : 2;
      } else {
        puzzle[i] = vi;
        puzzle[j] = vj;
      }
    }
    return puzzle;
  }

  // Returns { puzzle, solution, level, tier, clues, attempts, used }.
  // Always returns something: if no attempt reaches the level's floor
  // (vanishingly rare), the hardest one found is used.
  function generate(level, rand, maxAttempts) {
    if (!LEVELS[level]) level = "easy";
    rand = rand || Math.random;
    const L = LEVELS[level];
    let best = null;
    for (let attempt = 1; attempt <= (maxAttempts || MAX_ATTEMPTS); attempt++) {
      const solution = fullGrid(rand);
      const puzzle = carve(solution, rand, level);
      const g = grade(puzzle, L.maxTier);
      const out = {
        puzzle,
        solution,
        level,
        tier: g.tier,
        clues: puzzle.filter(Boolean).length,
        attempts: attempt,
        used: g.used,
      };
      if (g.solved && g.tier >= L.minTier) return out;
      if (g.solved && (!best || g.tier > best.tier)) best = out;
    }
    return best;
  }

  const api = {
    UNITS, PEERS, ROW_OF, COL_OF, BOX_OF, LEVELS,
    mulberry32, countSolutions, solve, fullGrid, grade, nextStep, generate,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SudokuEngine = api;
})(typeof self !== "undefined" ? self : this);
