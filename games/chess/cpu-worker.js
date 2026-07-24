/* ============================================================================
   cpu-worker.js — chess CPU opponent. Runs entirely off the main thread so a
   deep search never freezes the board/clock UI. Only ever *decides* on one
   root move and posts it back; index.html's own doMove() is what actually
   executes it, so all sound/render/history/clock logic stays centralized
   there and unduplicated.
   ============================================================================ */
importScripts("engine.js");

(function () {
  "use strict";
  const E = ChessEngine;
  const RULES = E.RULES;

  const PIECE_VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const MATE = 100000;
  const QDEPTH_MAX = 6;

  // Standard public-domain "simplified evaluation function" piece-square
  // tables (Tomasz Michniewski, Chess Programming Wiki). Authored with row 0
  // = rank 8 (the far side from White's home row), which matches this
  // codebase's board layout directly, so White pieces index PST[type][r*8+c]
  // as-is and Black pieces mirror the rank only: PST[type][(7-r)*8+c].
  const PST = {
    p: [
      0, 0, 0, 0, 0, 0, 0, 0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
      5, 5, 10, 25, 25, 10, 5, 5,
      0, 0, 0, 20, 20, 0, 0, 0,
      5, -5, -10, 0, 0, -10, -5, 5,
      5, 10, 10, -20, -20, 10, 10, 5,
      0, 0, 0, 0, 0, 0, 0, 0,
    ],
    n: [
      -50, -40, -30, -30, -30, -30, -40, -50,
      -40, -20, 0, 0, 0, 0, -20, -40,
      -30, 0, 10, 15, 15, 10, 0, -30,
      -30, 5, 15, 20, 20, 15, 5, -30,
      -30, 0, 15, 20, 20, 15, 0, -30,
      -30, 5, 10, 15, 15, 10, 5, -30,
      -40, -20, 0, 5, 5, 0, -20, -40,
      -50, -40, -30, -30, -30, -30, -40, -50,
    ],
    b: [
      -20, -10, -10, -10, -10, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 10, 10, 5, 0, -10,
      -10, 5, 5, 10, 10, 5, 5, -10,
      -10, 0, 10, 10, 10, 10, 0, -10,
      -10, 10, 10, 10, 10, 10, 10, -10,
      -10, 5, 0, 0, 0, 0, 5, -10,
      -20, -10, -10, -10, -10, -10, -10, -20,
    ],
    r: [
      0, 0, 0, 0, 0, 0, 0, 0,
      5, 10, 10, 10, 10, 10, 10, 5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      -5, 0, 0, 0, 0, 0, 0, -5,
      0, 0, 0, 5, 5, 0, 0, 0,
    ],
    q: [
      -20, -10, -10, -5, -5, -10, -10, -20,
      -10, 0, 0, 0, 0, 0, 0, -10,
      -10, 0, 5, 5, 5, 5, 0, -10,
      -5, 0, 5, 5, 5, 5, 0, -5,
      0, 0, 5, 5, 5, 5, 0, -5,
      -10, 5, 5, 5, 5, 5, 0, -10,
      -10, 0, 5, 0, 0, 0, 0, -10,
      -20, -10, -10, -5, -5, -10, -10, -20,
    ],
    k: [
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -30, -40, -40, -50, -50, -40, -40, -30,
      -20, -30, -30, -40, -40, -30, -30, -20,
      -10, -20, -20, -20, -20, -20, -20, -10,
      20, 20, 0, 0, 0, 0, 20, 20,
      20, 30, 10, 0, 0, 10, 30, 20,
    ],
    ke: [
      -50, -40, -30, -20, -20, -30, -40, -50,
      -30, -20, -10, 0, 0, -10, -20, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 30, 40, 40, 30, -10, -30,
      -30, -10, 20, 30, 30, 20, -10, -30,
      -30, -30, 0, 0, 0, 0, -30, -30,
      -50, -30, -30, -30, -30, -30, -30, -50,
    ],
  };

  function pstValue(type, o, r, c, endgame) {
    const table = type === "k" ? (endgame ? PST.ke : PST.k) : PST[type];
    const rr = o === "w" ? r : 7 - r;
    return table[rr * 8 + c];
  }

  // Evaluate from White's perspective (positive = White is better).
  function evaluate(b) {
    if (!E.hasSufficientMaterial(b, "w") && !E.hasSufficientMaterial(b, "b")) return 0;
    let score = 0, nonPawnMaterial = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || p.dead) continue;
      const r = (i / 8) | 0, c = i % 8;
      const val = PIECE_VAL[p.t];
      if (p.t !== "p" && p.t !== "k") nonPawnMaterial += val;
      score += (p.o === "w" ? 1 : -1) * val;
    }
    const endgame = nonPawnMaterial <= 1300;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p || p.dead) continue;
      const r = (i / 8) | 0, c = i % 8;
      score += (p.o === "w" ? 1 : -1) * pstValue(p.t, p.o, r, c, endgame);
    }
    return score;
  }
  function coloredEval(b, color) { const e = evaluate(b); return color === "w" ? e : -e; }

  // One-shot sanity check: catches a wrong-axis PST mirror or a transcription
  // typo that breaks board symmetry, without having to eyeball ~400 digits.
  (function evalSelfTest() {
    try {
      const back = ["r", "n", "b", "q", "k", "b", "n", "r"], b = new Array(64).fill(null);
      for (let c = 0; c < 8; c++) {
        b[c] = { o: "b", t: back[c], dead: false }; b[8 + c] = { o: "b", t: "p", dead: false };
        b[48 + c] = { o: "w", t: "p", dead: false }; b[56 + c] = { o: "w", t: back[c], dead: false };
      }
      const e0 = evaluate(b);
      if (e0 !== 0) console.warn("chess cpu-worker: eval self-test FAILED — starting position should be 0, got", e0);
      const b2 = b.slice(); b2[52] = null; b2[36] = { o: "w", t: "p", dead: false }; // 1.e4
      const e1 = evaluate(b2);
      if (!(e1 > 0)) console.warn("chess cpu-worker: eval self-test FAILED — eval after 1.e4 should be positive for White, got", e1);
    } catch (e) { /* never block worker startup on the self-test */ }
  })();

  const TIMEOUT = { timeout: true };
  function checkBudget(state) {
    if ((state.nodes & 2047) === 0 && performance.now() - state.start > state.budget) throw TIMEOUT;
  }

  function mvvLva(b, ep, m) {
    if (!m.cap) return -1;
    const victim = m.ep ? b[ep.victim] : b[m.to];
    const attacker = b[m.from];
    return (victim ? PIECE_VAL[victim.t] : 0) * 10 - (attacker ? PIECE_VAL[attacker.t] : 0);
  }
  function orderMoves(moves, b, ep, pv) {
    moves.sort((a, c) => {
      const aPv = pv && a.from === pv.from && a.to === pv.to && !!a.promo === !!pv.promo ? 1 : 0;
      const cPv = pv && c.from === pv.from && c.to === pv.to && !!c.promo === !!pv.promo ? 1 : 0;
      if (aPv !== cPv) return cPv - aPv;
      return mvvLva(b, ep, c) - mvvLva(b, ep, a);
    });
  }

  function quiesce(baseCtx, b, ep, castle, color, alpha, beta, qdepth, state) {
    checkBudget(state);
    const G = Object.assign({}, baseCtx, { ep, castle });
    const inCk = E.inCheck(G, b, color);
    let moves;
    if (inCk) {
      moves = E.allLegalMoves(baseCtx, b, ep, castle, color);
      if (moves.length === 0) return -(MATE - (QDEPTH_MAX - qdepth));
    } else {
      const standPat = coloredEval(b, color);
      if (standPat >= beta) return beta;
      if (standPat > alpha) alpha = standPat;
      if (qdepth <= 0) return alpha;
      moves = E.allLegalMoves(baseCtx, b, ep, castle, color).filter((m) => m.cap);
    }
    orderMoves(moves, b, ep, null);
    for (const m of moves) {
      const nxt = E.makeMove(baseCtx, b, ep, castle, m);
      const score = -quiesce(baseCtx, nxt.board, nxt.ep, nxt.castle, color === "w" ? "b" : "w", -beta, -alpha, qdepth - 1, state);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function negamax(baseCtx, b, ep, castle, color, depth, alpha, beta, ply, useQ, state) {
    state.nodes++;
    checkBudget(state);
    const moves = E.allLegalMoves(baseCtx, b, ep, castle, color);
    if (moves.length === 0) {
      const G = Object.assign({}, baseCtx, { ep, castle });
      return E.inCheck(G, b, color) ? -(MATE - ply) : 0;
    }
    if (depth <= 0) return useQ ? quiesce(baseCtx, b, ep, castle, color, alpha, beta, QDEPTH_MAX, state) : coloredEval(b, color);

    orderMoves(moves, b, ep, ply === 0 ? state.pvMove : null);
    let best = -Infinity, bestMove = null;
    for (const m of moves) {
      const nxt = E.makeMove(baseCtx, b, ep, castle, m);
      const score = -negamax(baseCtx, nxt.board, nxt.ep, nxt.castle, color === "w" ? "b" : "w", depth - 1, -beta, -alpha, ply + 1, useQ, state);
      if (score > best) { best = score; bestMove = m; }
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    if (ply === 0 && bestMove) state.rootBestMove = bestMove;
    return best;
  }

  const TIER = {
    easy: { maxDepth: 2, quiescence: false, randomChance: 0.35 },
    medium: { maxDepth: 4, quiescence: false, randomChance: 0 },
    hard: { maxDepth: 6, quiescence: true, randomChance: 0 },
    master: { maxDepth: 8, quiescence: true, randomChance: 0 },
  };

  function search(board, turn, castle, ep, difficulty, budgetMs, maxDepthOverride) {
    const baseCtx = RULES;
    const tier = TIER[difficulty] || TIER.medium;
    const start = performance.now();
    const legalRoot = E.allLegalMoves(baseCtx, board, ep, castle, turn);
    if (legalRoot.length === 0) return { move: null, depthReached: 0, nodes: 0, ms: 0 };

    if (tier.randomChance && Math.random() < tier.randomChance) {
      return { move: legalRoot[(Math.random() * legalRoot.length) | 0], depthReached: 0, nodes: 0, ms: performance.now() - start };
    }

    const maxDepth = maxDepthOverride || tier.maxDepth;
    const state = { start, budget: budgetMs, nodes: 0, pvMove: null, rootBestMove: null };
    let bestMove = legalRoot[0], depthReached = 0;
    try {
      for (let d = 1; d <= maxDepth; d++) {
        state.rootBestMove = null;
        negamax(baseCtx, board, ep, castle, turn, d, -Infinity, Infinity, 0, tier.quiescence, state);
        if (state.rootBestMove) { bestMove = state.rootBestMove; state.pvMove = bestMove; depthReached = d; }
        if (performance.now() - start > budgetMs) break;
      }
    } catch (e) {
      if (e !== TIMEOUT) throw e;
    }
    return { move: bestMove, depthReached, nodes: state.nodes, ms: performance.now() - start };
  }

  self.onmessage = function (ev) {
    const msg = ev.data;
    if (!msg || msg.type !== "think") return;
    try {
      const result = search(msg.board, msg.turn, msg.castle, msg.ep, msg.difficulty, msg.budgetMs, msg.maxDepth);
      self.postMessage({ type: "move", requestId: msg.requestId, move: result.move, depthReached: result.depthReached, nodes: result.nodes, ms: result.ms });
    } catch (e) {
      self.postMessage({ type: "error", requestId: msg.requestId, message: String((e && e.message) || e) });
    }
  };
})();
