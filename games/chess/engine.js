/* ============================================================================
   engine.js — pure 8x8 chess move-generation logic, used ONLY by
   cpu-worker.js via importScripts(). NOT loaded by index.html.

   This intentionally duplicates the pure move-generation functions from
   index.html's inline script (genPseudo/attacked/kingSq/inCheck/applyTo and
   friends) rather than sharing a module with the main page, so the existing,
   working 2-player + 4-player game in index.html never has to be touched or
   re-wired for this feature. Keep any bugfix made here in sync with the
   equivalent function in index.html by hand if one is ever needed there too.

   Every function here is pure: it takes a small "ctx" object shaped like
   { dim, valid(r,c), pawnDir, pawnStart(o,r,c), pawnPromo(o,r,c), hasCastle,
     ep, castle } plus an explicit board array, and never mutates its inputs.
   ============================================================================ */
(function (global) {
  "use strict";

  const RULES = {
    dim: 8,
    valid: (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8,
    pawnDir: { w: [-1, 0], b: [1, 0] },
    pawnStart: (o, r) => (o === "w" ? r === 6 : r === 1),
    pawnPromo: (o, r) => (o === "w" ? r === 0 : r === 7),
    hasCastle: true,
  };

  const idx = (G, r, c) => r * G.dim + c;
  const rc = (G, i) => [(i / G.dim) | 0, i % G.dim];

  function pawnCaps(G, r, c, o) {
    const [dr, dc] = G.pawnDir[o];
    return [
      [r + dr + dc, c + dc - dr],
      [r + dr - dc, c + dc + dr],
    ];
  }

  function genPseudo(G, b, i) {
    const p = b[i];
    if (!p || p.dead) return [];
    const col = p.o, type = p.t, [r, c] = rc(G, i), out = [];
    const push = (r2, c2, extra) => {
      if (!G.valid(r2, c2)) return false;
      const t = idx(G, r2, c2), tp = b[t];
      if (tp) {
        if (tp.o !== col && tp.t !== "k") out.push(Object.assign({ from: i, to: t, cap: true }, extra));
        return false;
      }
      out.push(Object.assign({ from: i, to: t }, extra));
      return true;
    };
    const slide = (dirs) => {
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (push(nr, nc)) { nr += dr; nc += dc; }
      }
    };
    const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]], ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    if (type === "p") {
      const [dr, dc] = G.pawnDir[col], fr = r + dr, fc = c + dc;
      if (G.valid(fr, fc) && !b[idx(G, fr, fc)]) {
        addPawn(out, i, idx(G, fr, fc), G.pawnPromo(col, fr, fc));
        const sr = r + 2 * dr, sc = c + 2 * dc;
        if (G.pawnStart(col, r, c) && G.valid(sr, sc) && !b[idx(G, sr, sc)]) out.push({ from: i, to: idx(G, sr, sc), dbl: true });
      }
      for (const [nr, nc] of pawnCaps(G, r, c, col)) {
        if (!G.valid(nr, nc)) continue;
        const t = idx(G, nr, nc), tp = b[t];
        if (tp && tp.o !== col && tp.t !== "k") addPawn(out, i, t, G.pawnPromo(col, nr, nc), true);
        else if (G.ep && t === G.ep.sq && b[G.ep.victim] && b[G.ep.victim].o !== col) out.push({ from: i, to: t, ep: true, cap: true });
      }
    } else if (type === "n") {
      for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]]) push(r + dr, c + dc);
    } else if (type === "b") { slide(DIAG); }
    else if (type === "r") { slide(ORTH); }
    else if (type === "q") { slide(DIAG); slide(ORTH); }
    else if (type === "k") {
      for (const [dr, dc] of DIAG.concat(ORTH)) push(r + dr, c + dc);
      if (G.hasCastle && G.castle) {
        const home = col === "w" ? 7 : 0;
        if (r === home && c === 4 && !attacked(G, b, i, col)) {
          if (G.castle[col + "k"] && !b[idx(G, home, 5)] && !b[idx(G, home, 6)] && cell(G, b, home, 7, col, "r")
            && !attacked(G, b, idx(G, home, 5), col) && !attacked(G, b, idx(G, home, 6), col)) out.push({ from: i, to: idx(G, home, 6), castle: "k" });
          if (G.castle[col + "q"] && !b[idx(G, home, 3)] && !b[idx(G, home, 2)] && !b[idx(G, home, 1)] && cell(G, b, home, 0, col, "r")
            && !attacked(G, b, idx(G, home, 3), col) && !attacked(G, b, idx(G, home, 2), col)) out.push({ from: i, to: idx(G, home, 2), castle: "q" });
        }
      }
    }
    return out;
  }
  function cell(G, b, r, c, o, t) { const p = b[idx(G, r, c)]; return p && p.o === o && p.t === t && !p.dead; }
  function addPawn(out, from, to, promo, cap) { if (promo) out.push({ from, to, promo: true, cap: !!cap }); else out.push({ from, to, cap: !!cap }); }

  function attacked(G, b, t, defCol, att) {
    const [r, c] = rc(G, t);
    const foe = (p, types) => p && !p.dead && p.o !== defCol && (!att || p.o === att) && types.indexOf(p.t) >= 0;
    for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
      if (!G.valid(r + dr, c + dc)) continue;
      const p = b[idx(G, r + dr, c + dc)];
      if (p && !p.dead && p.t === "p" && p.o !== defCol && (!att || p.o === att)) {
        for (const [ar, acc] of pawnCaps(G, r + dr, c + dc, p.o)) if (ar === r && acc === c) return true;
      }
    }
    for (const [dr, dc] of [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]])
      if (G.valid(r + dr, c + dc) && foe(b[idx(G, r + dr, c + dc)], ["n"])) return true;
    for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]])
      if (G.valid(r + dr, c + dc) && foe(b[idx(G, r + dr, c + dc)], ["k"])) return true;
    const ray = (dirs, types) => {
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (G.valid(nr, nc)) { const p = b[idx(G, nr, nc)]; if (p) { if (foe(p, types)) return true; break; } nr += dr; nc += dc; }
      }
      return false;
    };
    if (ray([[-1, 0], [1, 0], [0, -1], [0, 1]], ["r", "q"])) return true;
    if (ray([[-1, -1], [-1, 1], [1, -1], [1, 1]], ["b", "q"])) return true;
    return false;
  }
  function kingSq(G, b, col) { for (let i = 0; i < b.length; i++) { const p = b[i]; if (p && p.o === col && p.t === "k" && !p.dead) return i; } return -1; }
  function inCheck(G, b, col) { const k = kingSq(G, b, col); return k >= 0 && attacked(G, b, k, col); }

  function applyTo(G, b, m, promoType) {
    const nb = b.slice(); const p = nb[m.from], col = p.o;
    nb[m.to] = m.promo ? { o: col, t: (promoType || "q"), dead: false } : p;
    nb[m.from] = null;
    if (m.ep) nb[G.ep.victim] = null;
    if (m.castle) {
      const [hr] = rc(G, m.from);
      if (m.castle === "k") { nb[idx(G, hr, 5)] = nb[idx(G, hr, 7)]; nb[idx(G, hr, 7)] = null; }
      else { nb[idx(G, hr, 3)] = nb[idx(G, hr, 0)]; nb[idx(G, hr, 0)] = null; }
    }
    return nb;
  }

  // Advances a full node context (board + ep + castle) by one move, mirroring
  // the non-DOM parts of index.html's doMove(). Always promotes to queen —
  // the search never considers under-promotion (not worth the branching).
  function makeMove(baseCtx, b, ep, castle, m) {
    const G = Object.assign({}, baseCtx, { ep, castle });
    const p = b[m.from], col = p.o;
    const nb = applyTo(G, b, m, "q");
    let nCastle = castle ? Object.assign({}, castle) : null;
    if (G.hasCastle && nCastle) {
      if (p.t === "k") { nCastle[col + "k"] = false; nCastle[col + "q"] = false; }
      if (m.from === 56 || m.to === 56) nCastle.wq = false;
      if (m.from === 63 || m.to === 63) nCastle.wk = false;
      if (m.from === 0 || m.to === 0) nCastle.bq = false;
      if (m.from === 7 || m.to === 7) nCastle.bk = false;
    }
    let nEp = null;
    if (m.dbl) { const [fr, fc] = rc(G, m.from), [dr, dc] = G.pawnDir[col]; nEp = { sq: idx(G, fr + dr, fc + dc), victim: m.to }; }
    return { board: nb, ep: nEp, castle: nCastle };
  }

  // All fully-legal (not-leaves-self-in-check) moves for `col` on board `b`.
  function allLegalMoves(baseCtx, b, ep, castle, col) {
    const G = Object.assign({}, baseCtx, { ep, castle });
    const out = [];
    for (let i = 0; i < b.length; i++) {
      const p = b[i];
      if (p && !p.dead && p.o === col) {
        const ms = genPseudo(G, b, i);
        for (const m of ms) if (!inCheck(G, applyTo(G, b, m, "q"), col)) out.push(m);
      }
    }
    return out;
  }

  // True if `col` has enough material to ever force checkmate (used both for
  // the search's dead-draw shortcut and the main page's clock flag-loss rule).
  function hasSufficientMaterial(b, col) {
    let minors = 0;
    for (const p of b) {
      if (!p || p.dead || p.o !== col) continue;
      if (p.t === "p" || p.t === "r" || p.t === "q") return true;
      if (p.t === "n" || p.t === "b") minors++;
    }
    return minors >= 2;
  }

  global.ChessEngine = {
    RULES, idx, rc, genPseudo, attacked, kingSq, inCheck, applyTo, makeMove, allLegalMoves, hasSufficientMaterial,
  };
})(typeof self !== "undefined" ? self : this);
