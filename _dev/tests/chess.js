// Chess: in 3-player chess every piece gives check (not just pawns), so a
// piece can mate; in 2-player chess stalemate and a bare-king ending are
// draws; a new game or a game that ends closes the promotion picker. P
// pauses a game on every board, the pieces hidden while it is paused, the
// clocks stopped and a CPU's thinking held.
const fs = require("fs");
const path = require("path");

const HOOK2 = ["start(2);  // build a board behind the menu",
  "start(2);  // build a board behind the menu\n  window.__chess = { get G() { return G; }, doMove: doMove, legalFor: legalFor, start: start, render: render, sanOf: sanOf };"];
const HOOK3 = ["start(3); // build board behind menu (default frozen-pieces rule)",
  "start(3); // build board behind menu (default frozen-pieces rule)\n  window.__three = { get G() { return G; }, cid: cid, genMoves: genMoves, legalFor: legalFor, inCheck: inCheck, doMove: doMove, start: start };"];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const over = (p) => p.evaluate(() => document.getElementById("overOverlay").classList.contains("show") ? document.getElementById("overTitle").textContent + " | " + document.getElementById("overMsg").textContent : null);
  // Wait 450ms by the page's own clock: the game's end card (350ms after the
  // end) and its clock ticks (every 100ms) are page timers due sooner, so they
  // have always run by then, however busy the machine (a fixed wait outside
  // the page could end first, failing a check or passing one that should fail).
  const endBeat = (p) => p.evaluate(() => new Promise((r) => setTimeout(r, 450)));

  // ---- 3 players (three.html's script is inline, so the page itself is served with the hook)
  {
    let html = fs.readFileSync(path.join(lib.ROOT, "games/chess/three.html"), "utf8");
    if (!html.includes(HOOK3[0])) throw new Error("chess: three.html anchor not found");
    html = html.replace(HOOK3[0], HOOK3[1]);
    const p = await lib.open(ctx, base, "games/chess/three.html", { before: (pg) => pg.route(/\/games\/chess\/three\.html$/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html })) });
    const r = await p.evaluate(() => {
      const T = __three; T.start(1); document.getElementById("menu").classList.remove("show");
      const pc = (o, t) => ({ o, t, dead: false });
      const kings = (b) => { b[T.cid(0, 3, 4)] = pc("r", "k"); b[T.cid(1, 3, 4)] = pc("w", "k"); b[T.cid(2, 3, 4)] = pc("k", "k"); return b; };
      const out = {};
      // a queen, then a rook, two cells up the file from Red's king
      for (const t of ["q", "r"]) {
        const b = kings(new Array(96).fill(null)); b[T.cid(0, 1, 4)] = pc("w", t);
        T.G.board = b; T.G.turn = "r";
        out[t] = T.inCheck(b, "r");
        if (t === "q") out.kingIntoLine = T.legalFor(T.cid(0, 3, 4)).some((m) => m.to === T.cid(0, 2, 4));
      }
      // a knight one knight's move from Red's king (found with the knight's own moves)
      const kb = kings(new Array(96).fill(null)), from = T.cid(0, 1, 1);
      kb[from] = pc("w", "n");
      const to = T.genMoves(kb, from).map((m) => m.to).find((c) => !kb[c]);
      const nb = new Array(96).fill(null); nb[T.cid(1, 3, 4)] = pc("w", "k"); nb[T.cid(2, 3, 4)] = pc("k", "k"); nb[from] = pc("w", "n"); nb[to] = pc("r", "k");
      out.n = T.inCheck(nb, "r");
      return out;
    });
    check("chess three: a queen, a rook and a knight each give check", r.q === true && r.r === true && r.n === true, r);
    check("chess three: the king can't step onto a cell the queen attacks", r.kingIntoLine === false, r);
    // a smothered mate: Red's king walled in by its own men, Black's knight lands on (0,2,6)
    // (`thenNew`: New Game straight after it, inside the end card's 350ms)
    const mateIt = (thenNew) => p.evaluate((thenNew) => {
      const T = __three; T.start(1);
      const pc = (o, t) => ({ o, t, dead: false }), b = new Array(96).fill(null);
      b[T.cid(0, 3, 4)] = pc("r", "k"); b[T.cid(1, 3, 4)] = pc("w", "k"); b[T.cid(2, 3, 4)] = pc("k", "k");
      [[2, 3], [2, 4], [2, 5]].forEach(([r, f]) => { b[T.cid(0, r, f)] = pc("r", "p"); });
      b[T.cid(0, 3, 3)] = pc("r", "n"); b[T.cid(0, 3, 5)] = pc("r", "n");
      const target = T.cid(0, 2, 6);
      // any empty cell a black knight could jump to the target from
      for (let c = 0; c < 96; c++) {
        if (b[c]) continue;
        const t = b.slice(); t[c] = pc("k", "n");
        if (T.genMoves(t, c).some((m) => m.to === target)) {
          T.G.board = t; T.G.turn = "k";
          const m = T.legalFor(c).find((mm) => mm.to === target);
          if (m) { T.doMove(m); const r = { from: c, turn: T.G.turn }; if (thenNew) T.start(1); return r; }
        }
      }
      return null;
    }, thenNew);
    const before = await mateIt(false);
    await endBeat(p);
    const mate = await over(p);
    check("chess three: a knight's smothered mate ends the game (first checkmate wins)", !!before && /^Black wins!/.test(mate || ""), { before, mate });
    await p.evaluate(() => document.getElementById("overOverlay").classList.remove("show"));
    await mateIt(true);
    await endBeat(p);
    check("chess three: New Game straight after a mate doesn't get the old end card over it", (await over(p)) === null, await over(p));

    // End Rule… mid-game asks first; on a fresh board it goes straight to the menu
    const ruleMenu = () => p.evaluate(() => ({ menu: document.getElementById("menu").classList.contains("show"),
      dlg: (document.querySelector(".gs-dialog h2") || {}).textContent || null }));
    await p.evaluate(() => { __three.start(1); ["menu", "overOverlay"].forEach((id) => document.getElementById(id).classList.remove("show")); });
    await p.click("#ruleBtn"); await p.waitForTimeout(100);
    const fresh3 = await ruleMenu();
    await p.evaluate(() => {
      const T = __three; T.start(1); document.getElementById("menu").classList.remove("show");
      for (let c = 0; c < 96; c++) { const ms = T.legalFor(c); if (ms.length) { T.doMove(ms[0]); break; } }
    });
    await p.click("#ruleBtn"); await p.waitForTimeout(100);
    const asked3 = await ruleMenu();
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    const kept3 = await ruleMenu();
    await p.evaluate(() => document.getElementById("menu").classList.remove("show"));   // (in case it opened unasked)
    await p.click("#ruleBtn"); await p.waitForTimeout(100); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
    const quit3 = await ruleMenu();
    check("chess three: End Rule… mid-game asks 'Quit this game?' (Esc keeps playing, Enter quits); fresh, it opens the menu",
      fresh3.menu && !fresh3.dlg && asked3.dlg === "Quit this game?" && !asked3.menu && !kept3.dlg && !kept3.menu && quit3.menu && !quit3.dlg && p.leaves === 0,
      { fresh3, asked3, kept3, quit3, leaves: p.leaves });

    // the "⇆ 2 / 4 Player" link leaves this game for the other board: mid-game it asks first
    await p.evaluate(() => {
      const T = __three; T.start(1); ["menu", "overOverlay"].forEach((id) => document.getElementById(id).classList.remove("show"));
      for (let c = 0; c < 96; c++) { const ms = T.legalFor(c); if (ms.length) { T.doMove(ms[0]); break; } }
    });
    await p.click('a[href="./index.html"]'); await p.waitForTimeout(150);
    const linkAsk = await p.evaluate(() => ({ dlg: (document.querySelector(".gs-dialog h2") || {}).textContent || null, here: /three\.html/.test(location.pathname) }));
    await p.keyboard.press("Enter"); await p.waitForTimeout(100);
    const stayed = await p.evaluate(() => ({ dlg: !!document.querySelector(".gs-dialog"), here: /three\.html/.test(location.pathname) }));
    check("chess three: mid-game the 2 / 4 Player link asks 'Leave this game?' and stays put on Enter", linkAsk.dlg === "Leave this game?" && linkAsk.here && !stayed.dlg && stayed.here, { linkAsk, stayed });
    check("chess three: no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- 2 players
  const open2 = async () => {
    const p = await lib.open(ctx, base, "games/chess/", { before: (pg) => lib.injectScript(pg, "games/chess/game.js", [HOOK2]) });
    await p.evaluate(() => document.getElementById("menu").classList.remove("show"));
    return p;
  };
  // set up a position (white to move) and play one move: [from, to] board indexes
  const play = (p, pieces, mv) => p.evaluate(([pieces, mv]) => {
    const C = __chess, G = C.G, b = new Array(64).fill(null);
    for (const [i, o, t] of pieces) b[i] = { o, t, dead: false };
    G.board = b; G.turn = "w"; G.castle = { wk: false, wq: false, bk: false, bq: false }; G.ep = null;
    const m = C.legalFor(G, mv[0]).find((x) => x.to === mv[1]);
    if (!m) return "no such move";
    C.doMove(m);
    return { over: C.G.over, turn: C.G.turn };
  }, [pieces, mv]);

  let p = await open2();
  // Black Ka8, White Ke1 + Qc1; Qc7 leaves Black no move and no check
  const s = await play(p, [[0, "b", "k"], [60, "w", "k"], [58, "w", "q"]], [58, 10]);
  await endBeat(p);
  const so = await over(p);
  check("chess: stalemate in 2-player chess is a draw (not another move for White)", s.over === true && /^Draw \| Stalemate/.test(so || ""), { s, so });
  // Undo straight after the end, inside the end card's 350ms: the card stays away
  await p.evaluate(() => { __chess.start(2); document.getElementById("overOverlay").classList.remove("show"); });
  await play(p, [[0, "b", "k"], [60, "w", "k"], [58, "w", "q"]], [58, 10]);
  await p.evaluate(() => document.getElementById("undoBtn").click());
  await endBeat(p);
  const undone = await over(p);
  check("chess: Undo straight after a game ends doesn't bring the end card back over the game", undone === null, undone);

  // Ke1 takes the last black piece: king against king
  await p.evaluate(() => __chess.start(2)); await p.evaluate(() => document.getElementById("overOverlay").classList.remove("show"));
  const kk = await play(p, [[4, "b", "k"], [60, "w", "k"], [51, "b", "n"]], [60, 51]);
  await endBeat(p);
  const kko = await over(p);
  // Ng1xh3: king and knight against king
  await p.evaluate(() => { __chess.start(2); document.getElementById("overOverlay").classList.remove("show"); });
  const kn = await play(p, [[4, "b", "k"], [60, "w", "k"], [62, "w", "n"], [47, "b", "p"]], [62, 47]);
  await endBeat(p);   // (the end card shows 350ms after the end)
  // a rook is enough to mate, so Rh1xh3 plays on
  await p.evaluate(() => { __chess.start(2); document.getElementById("overOverlay").classList.remove("show"); });
  const kr = await play(p, [[4, "b", "k"], [60, "w", "k"], [63, "w", "r"], [47, "b", "p"]], [63, 47]);
  await endBeat(p);
  check("chess: K v K and K+N v K are drawn at once; K+R v K plays on",
    kk.over === true && /^Draw \| Insufficient material/.test(kko || "") && kn.over === true && kr.over === false && kr.turn === "b", { kk, kko, kn, kr });

  // the promotion picker: a clock that runs out, and New Game, both put it away
  const promo = async () => {
    await p.evaluate(() => {
      // (each try starts with no card up, whatever the last one left)
      ["overOverlay", "promoOverlay"].forEach((id) => document.getElementById(id).classList.remove("show"));
      const C = __chess; C.start(2);
      const G = C.G, b = new Array(64).fill(null);
      b[8] = { o: "w", t: "p", dead: false }; b[60] = { o: "w", t: "k", dead: false }; b[23] = { o: "b", t: "k", dead: false };
      G.board = b; G.turn = "w"; C.render();
    });
    await p.click('.sq[data-i="8"]'); await p.click('.sq[data-i="0"]');
    return p.evaluate(() => document.getElementById("promoOverlay").classList.contains("show"));
  };
  const open1 = await promo();
  await p.evaluate(() => { __chess.G.clock = { enabled: true, w: 0, b: 60000, inc: 0, running: "w", lastTick: Date.now() }; });
  await endBeat(p);
  const flagged = await p.evaluate(() => ({ over: __chess.G.over, promo: document.getElementById("promoOverlay").classList.contains("show") }));
  const open2nd = await promo();
  await p.evaluate(() => __chess.start(2));
  const fresh = await p.evaluate(() => document.getElementById("promoOverlay").classList.contains("show"));
  check("chess: the promotion picker closes when the clock ends the game and on a new game",
    open1 && flagged.over && !flagged.promo && open2nd && !fresh, { open1, flagged, open2nd, fresh });

  // New Game inside the end card's 350ms: the old card doesn't land on the new game
  await p.evaluate(() => { __chess.start(2); document.getElementById("overOverlay").classList.remove("show"); });
  await play(p, [[0, "b", "k"], [60, "w", "k"], [58, "w", "q"]], [58, 10]);
  await p.evaluate(() => __chess.start(2));
  await endBeat(p);
  check("chess: New Game straight after a game ends doesn't get the old end card over it", (await over(p)) === null, await over(p));
  check("chess: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Change Mode mid-game (vs CPU, 1 minute): asks first; quitting stops the CPU and the clock
  p = await open2();
  await p.evaluate(() => document.getElementById("menu").classList.add("show"));
  await p.click('#menu .modebtn[data-mode="2"]');
  await p.click('#opponentPick .modebtn[data-opp="cpu"]'); await p.click('#basePick .chip[data-base="1"]');
  await p.click("#setup2Start"); await p.waitForTimeout(200);
  const ui = () => p.evaluate(() => ({ menu: document.getElementById("menu").classList.contains("show"),
    dlg: (document.querySelector(".gs-dialog h2") || {}).textContent || null }));
  await p.click("#modeBtn"); await p.waitForTimeout(100);
  const fresh2 = await ui();
  await p.evaluate(() => { document.getElementById("menu").classList.remove("show"); __chess.start(2); });
  await p.click('.sq[data-i="52"]'); await p.click('.sq[data-i="36"]');      // e2-e4; the CPU starts thinking
  await p.click("#modeBtn"); await p.waitForTimeout(100);
  const asked = await ui();
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const quit = await ui();
  const rec0 = await p.evaluate(() => localStorage.getItem("chess_record"));
  // a minute's worth of thinking time, then White's clock all but gone
  await p.waitForTimeout(3500);
  await p.evaluate(() => { const c = __chess.G.clock; c.w = 5; c.b = 5; });
  await p.waitForTimeout(400);
  const after = await p.evaluate(() => ({ moves: __chess.G.history.length, over: __chess.G.over, running: __chess.G.clock.running, rec: localStorage.getItem("chess_record") }));
  check("chess: Change Mode on a fresh board opens the menu; mid-game it asks 'Quit this game?' first",
    fresh2.menu && !fresh2.dlg && asked.dlg === "Quit this game?" && !asked.menu && quit.menu && !quit.dlg, { fresh2, asked, quit });
  check("chess: quitting for the menu stops the old game's CPU and clock (no move, no flag, no loss recorded)",
    after.moves === 1 && !after.over && !after.running && after.rec === rec0, { after, rec0 });
  check("chess (change mode): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- vs CPU, a game's result counts once: undo reopens it, but its next end isn't recorded again
  p = await open2();
  const rec = () => p.evaluate(() => JSON.parse(localStorage.getItem("chess_record") || "null"));
  // a fresh game vs CPU (you're White): Black Ka8, White Kb6 + Qh7; Qc7 stalemates, Qh8 mates
  const fresh3 = () => p.evaluate(() => {
    ["overOverlay", "menu"].forEach((id) => document.getElementById(id).classList.remove("show"));
    const C = __chess; C.start(2, null, { opponent: "cpu", difficulty: "easy", side: "w", base: 0, inc: 0 });
    const G = C.G, b = new Array(64).fill(null);
    b[0] = { o: "b", t: "k", dead: false }; b[17] = { o: "w", t: "k", dead: false }; b[15] = { o: "w", t: "q", dead: false };
    G.board = b; G.castle = { wk: false, wq: false, bk: false, bq: false }; C.render();
  });
  const finish = async (to) => {
    await p.evaluate((to) => { const C = __chess; C.doMove(C.legalFor(C.G, 15).find((m) => m.to === to)); }, to);
    await endBeat(p);
  };
  const undoIt = () => p.evaluate(() => document.getElementById("undoBtn").click());
  await fresh3();
  await finish(10);                    // stalemate: a draw
  const r1 = await rec();
  await undoIt(); await finish(7);     // undo, then mate instead
  const r2 = await rec();
  await undoIt(); await finish(7);     // and again
  const r3 = await rec();
  check("chess vs CPU: undo after a game ends lets it be replayed, but only its first result counts",
    r1 && r1.d === 1 && r1.w === 0 && r2.d === 1 && r2.w === 0 && r3.d === 1 && r3.w === 0, { r1, r2, r3 });
  await fresh3();
  await finish(7);                     // New Game: a fresh game, recorded as usual
  const r4 = await rec();
  check("chess vs CPU: a new game's result is recorded as usual", r4.d === 1 && r4.w === 1 && r4.l === 0, r4);
  check("chess (record): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Esc on a setup menu goes back to the mode menu; on the mode menu it leaves
  p = await lib.open(ctx, base, "games/chess/");
  const shown = () => p.evaluate(() => ["menu", "setup2Menu", "endMenu"].filter((id) => document.getElementById(id).classList.contains("show")).join());
  await p.click('#menu .modebtn[data-mode="2"]');
  const m0 = await shown();
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const m1 = { shown: await shown(), leaves: p.leaves };
  // (back on the mode menu, whatever that Esc did)
  await p.evaluate(() => { document.getElementById("setup2Menu").classList.remove("show"); document.getElementById("menu").classList.add("show"); });
  await p.click('#menu .modebtn[data-mode="4"]');
  const m2 = await shown();
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const m3 = { shown: await shown(), leaves: p.leaves };
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  await lib.leftBy(p, 1);   // (on a busy machine the leave can land after that wait)
  check("chess: Esc on the 2-player setup or the 4-player end rule goes back to the mode menu (doesn't leave); Esc there leaves",
    m0 === "setup2Menu" && m1.shown === "menu" && m1.leaves === 0 && m2 === "endMenu" && m3.shown === "menu" && m3.leaves === 0 && p.leaves === 1, { m0, m1, m2, m3, leaves: p.leaves });
  check("chess (menus): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- 2 players: threefold repetition and the 50-move rule draw on their own
  p = await open2();
  const card = async () => { await endBeat(p); return over(p); };
  // the knights out and back twice: the opening position comes round a third time
  const shuffle = [[62, 45], [6, 21], [45, 62], [21, 6]];
  const step = (mv) => p.evaluate((mv) => { const C = __chess; const m = C.legalFor(C.G, mv[0]).find((x) => x.to === mv[1]); if (m) C.doMove(m); return { ok: !!m, over: C.G.over }; }, mv);
  await p.evaluate(() => { __chess.start(2); document.getElementById("overOverlay").classList.remove("show"); });
  const plies = [];
  for (let k = 0; k < 8; k++) plies.push(await step(shuffle[k % 4]));
  const rep = await card();
  check("chess: the same position a third time (same side to move) is drawn by threefold repetition, said on the end card",
    plies.slice(0, 7).every((x) => x.ok && !x.over) && plies[7].over && /^Draw: threefold repetition \|/.test(rep || ""), { plies, rep });
  // Undo takes the third time back; playing it again draws again
  await p.evaluate(() => document.getElementById("undoBtn").click());
  const undone2 = await p.evaluate(() => ({ over: __chess.G.over, turn: __chess.G.turn }));
  const again = await step(shuffle[3]);
  const rep2 = await card();
  check("chess: Undo after a repetition draw reopens it, and the same move draws again (the count stays right)",
    !undone2.over && undone2.turn === "b" && again.ok && again.over && /threefold repetition/.test(rep2 || ""), { undone2, again, rep2 });

  // 49½ moves gone with no capture or pawn move: one more quiet move draws
  const fifty = (pieces, mv) => p.evaluate(([pieces, mv]) => {
    const C = __chess; C.start(2); document.getElementById("overOverlay").classList.remove("show");
    const G = C.G, b = new Array(64).fill(null);
    for (const [i, o, t] of pieces) b[i] = { o, t, dead: false };
    G.board = b; G.castle = { wk: false, wq: false, bk: false, bq: false }; G.ep = null; G.halfmove = 99;
    const m = C.legalFor(G, mv[0]).find((x) => x.to === mv[1]);
    C.doMove(m);
    return { over: C.G.over, halfmove: C.G.halfmove };
  }, [pieces, mv]);
  const quiet = await fifty([[4, "b", "k"], [60, "w", "k"], [63, "w", "r"], [8, "b", "p"]], [63, 62]);
  const fq = await card();
  await p.evaluate(() => document.getElementById("undoBtn").click());
  const fu = await p.evaluate(() => ({ over: __chess.G.over, halfmove: __chess.G.halfmove }));
  const pawn = await fifty([[4, "b", "k"], [60, "w", "k"], [63, "w", "r"], [52, "w", "p"]], [52, 44]);
  check("chess: the 100th half-move with no capture or pawn move is drawn by the 50-move rule; Undo takes it back; a pawn move resets the count",
    quiet.over && /^Draw: 50-move rule \|/.test(fq || "") && !fu.over && fu.halfmove === 99 && !pawn.over && pawn.halfmove === 0, { quiet, fq, fu, pawn });
  // a repetition draw ends the log with ½-½; Undo takes the result away again
  await p.evaluate(() => { __chess.start(2); document.getElementById("overOverlay").classList.remove("show"); });
  for (let k = 0; k < 8; k++) await step(shuffle[k % 4]);
  await card();
  const drawLog = await p.evaluate(() => ({ sans: (__chess.G.sans || []).map((e) => e.san).join(" "), res: (document.querySelector("#moveLog li.res") || {}).textContent || null }));
  await p.evaluate(() => document.getElementById("undoBtn").click());
  const drawUndone = await p.evaluate(() => ({ n: (__chess.G.sans || []).length, res: !!document.querySelector("#moveLog li.res") }));
  check("chess: a game drawn by repetition ends its move log with ½-½, and Undo takes the result away with the move",
    drawLog.sans === "Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8" && drawLog.res === "½-½" && drawUndone.n === 7 && !drawUndone.res, { drawLog, drawUndone });
  check("chess (draw rules): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- the move log: every 2-player move in standard algebraic notation, a
  // numbered row a move, White's and Black's side by side, the result at the foot
  p = await open2();
  // set a position up (castle: the rights left; turn: who moves first) and play
  // moves [from, to, promotion piece?] through the game; the log as written
  const san = (pieces, moves, opts) => p.evaluate(([pieces, moves, opts]) => {
    const C = __chess; C.start(2); document.getElementById("overOverlay").classList.remove("show");
    const G = C.G;
    if (pieces) {
      const b = new Array(64).fill(null);
      for (const [i, o, t] of pieces) b[i] = { o, t, dead: false };
      G.board = b; G.turn = (opts && opts.turn) || "w"; G.ep = null;
      G.castle = Object.assign({ wk: false, wq: false, bk: false, bq: false }, (opts && opts.castle) || {});
    }
    for (const [from, to, promo] of moves) {
      const m = C.legalFor(C.G, from).find((x) => x.to === to);
      if (!m) return { error: "no move " + from + "-" + to, sans: (C.G.sans || []).map((e) => e.san) };
      C.doMove(m, promo);
    }
    C.render();
    return { sans: (C.G.sans || []).map((e) => e.san), rows: window.__rows() };
  }, [pieces, moves, opts || null]);
  // (each row of the log as read: "1. e4 e5", the result row alone)
  await p.evaluate(() => { window.__rows = () => [...document.querySelectorAll("#moveLog li")].map((li) => li.children.length ? [...li.children].map((c) => c.textContent).filter(Boolean).join(" ") : li.textContent); });
  const opening = await san(null, [[52, 36], [12, 28], [62, 45], [1, 18], [61, 25]]);
  const fools = await san(null, [[53, 45], [12, 28], [54, 38], [3, 39]]);
  await endBeat(p);
  const foolsRes = await p.evaluate(() => (document.querySelector("#moveLog li.res") || {}).textContent || null);
  check("chess log: an opening is written e4 e5 Nf3 Nc6 Bb5, numbered rows of White's and Black's moves",
    opening.sans.join(" ") === "e4 e5 Nf3 Nc6 Bb5" && opening.rows.join(" | ") === "1. e4 e5 | 2. Nf3 Nc6 | 3. Bb5", opening);
  check("chess log: a mate is marked # and the result follows it (the fool's mate: f3 e5 g4 Qh4#, 0-1)",
    fools.sans.join(" ") === "f3 e5 g4 Qh4#" && foolsRes === "0-1", { fools, foolsRes });
  const kings = [[60, "w", "k"], [4, "b", "k"]];
  const oo = await san(kings.concat([[63, "w", "r"], [56, "w", "r"]]), [[60, 62]], { castle: { wk: true, wq: true } });
  const ooo = await san(kings.concat([[63, "w", "r"], [56, "w", "r"]]), [[60, 58]], { castle: { wk: true, wq: true } });
  check("chess log: castling is O-O on the king's side, O-O-O on the queen's", oo.sans[0] === "O-O" && ooo.sans[0] === "O-O-O", { oo, ooo });
  const promoQ = await san([[60, "w", "k"], [23, "b", "k"], [8, "w", "p"]], [[8, 0, "q"]]);
  const promoN = await san([[60, "w", "k"], [23, "b", "k"], [8, "w", "p"]], [[8, 0, "n"]]);
  const promoX = await san([[60, "w", "k"], [23, "b", "k"], [8, "w", "p"], [1, "b", "r"]], [[8, 1, "q"]]);
  const promoCk = await san([[60, "w", "k"], [7, "b", "k"], [14, "b", "p"], [15, "b", "p"], [8, "w", "p"], [12, "b", "n"]], [[8, 0, "r"]]);
  check("chess log: a promotion is a8=Q (a8=N for a knight), a capturing one axb8=Q, one giving check a8=R+",
    promoQ.sans[0] === "a8=Q" && promoN.sans[0] === "a8=N" && promoX.sans[0] === "axb8=Q" && promoCk.sans[0] === "a8=R+", { promoQ, promoN, promoX, promoCk });
  const ep = await san([[60, "w", "k"], [4, "b", "k"], [28, "w", "p"], [11, "b", "p"]], [[11, 27], [28, 19]], { turn: "b" });
  check("chess log: en passant is written as the pawn's capture (d5 exd6), and a log that starts on Black's move reads 1. … d5",
    ep.sans.join(" ") === "d5 exd6" && ep.rows.join(" | ") === "1. … d5 | 2. exd6", ep);
  const byFile = await san([[63, "w", "k"], [7, "b", "k"], [57, "w", "n"], [45, "w", "n"]], [[57, 51]]);
  const byRank = await san([[63, "w", "k"], [7, "b", "k"], [56, "w", "r"], [24, "w", "r"]], [[56, 40]]);
  const byBoth = await san([[63, "w", "k"], [15, "b", "k"], [56, "w", "q"], [40, "w", "q"], [58, "w", "q"]], [[56, 49]]);
  const alone = await san([[63, "w", "k"], [7, "b", "k"], [57, "w", "n"]], [[57, 51]]);
  check("chess log: a second piece that could go there too is told apart by file (Nbd2), rank (R1a3) or both (Qa1b2); a lone one isn't (Nd2)",
    byFile.sans[0] === "Nbd2" && byRank.sans[0] === "R1a3" && byBoth.sans[0] === "Qa1b2" && alone.sans[0] === "Nd2", { byFile, byRank, byBoth, alone });
  const capMate = await san([[62, "w", "k"], [6, "b", "k"], [13, "b", "p"], [14, "b", "p"], [15, "b", "p"], [56, "w", "r"], [0, "b", "n"]], [[56, 0]]);
  const capCheck = await san([[62, "w", "k"], [6, "b", "k"], [13, "b", "p"], [15, "b", "p"], [56, "w", "r"], [0, "b", "n"]], [[56, 0]]);
  await endBeat(p);
  const mateRes = await p.evaluate(() => (document.querySelector("#moveLog li.res") || {}).textContent || null);
  check("chess log: a capture is x (Rxa8+ with the king able to step out, Rxa8# when it can't; then 1-0)",
    capMate.sans[0] === "Rxa8#" && capCheck.sans[0] === "Rxa8+" && mateRes === null, { capMate, capCheck, mateRes });
  // (capCheck isn't over: no result; the mate before it was, then a new game cleared it)
  const mateAgain = await san([[62, "w", "k"], [6, "b", "k"], [13, "b", "p"], [14, "b", "p"], [15, "b", "p"], [56, "w", "r"], [0, "b", "n"]], [[56, 0]]);
  await endBeat(p);
  const mateRes2 = await p.evaluate(() => (document.querySelector("#moveLog li.res") || {}).textContent || null);
  check("chess log: a game White mates ends with 1-0", mateAgain.sans[0] === "Rxa8#" && mateRes2 === "1-0", { mateAgain, mateRes2 });

  // Undo takes the last move off the log; New Game starts it empty; a pause hides it
  await san(null, [[52, 36], [12, 28], [62, 45]]);
  await p.evaluate(() => document.getElementById("undoBtn").click());
  const undoLog = await p.evaluate(() => ({ sans: (__chess.G.sans || []).map((e) => e.san).join(" "), rows: window.__rows() }));
  await p.evaluate(() => document.getElementById("newBtn").click());
  await p.waitForTimeout(150);
  if (await p.evaluate(() => !!document.querySelector(".gs-dialog"))) { await p.keyboard.press("Enter"); await p.waitForTimeout(150); }
  const newLog = await p.evaluate(() => ({ n: (__chess.G.sans || []).length, rows: document.querySelectorAll("#moveLog li").length, none: !(document.getElementById("logNone") || { hidden: true }).hidden }));
  await p.evaluate(() => { const C = __chess; C.doMove(C.legalFor(C.G, 52).find((x) => x.to === 36)); });
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const pausedLog = await p.evaluate(() => (document.getElementById("moveLog") ? getComputedStyle(document.getElementById("moveLog")).visibility : null));
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const backLog = await p.evaluate(() => (document.getElementById("moveLog") ? getComputedStyle(document.getElementById("moveLog")).visibility : null));
  check("chess log: Undo takes the last move off it (1. e4 e5), New Game starts it empty (No moves yet), and a pause hides it like the board",
    undoLog.sans === "e4 e5" && undoLog.rows.join(" | ") === "1. e4 e5" && newLog.n === 0 && newLog.rows === 0 && newLog.none && pausedLog === "hidden" && backLog === "visible", { undoLog, newLog, pausedLog, backLog });
  // 4 players: long algebraic in the cross's own square names (files a to n
  // along its edge, ranks 1 to 14 up it), a numbered row a round, each move
  // after a dot of its player's colour; Undo takes the last one off
  const fourLog = await p.evaluate(() => {
    const C = __chess; C.start(4, 2); document.getElementById("menu").classList.remove("show");
    const at = (r, c) => r * 14 + c, play = (a, b) => { const m = C.legalFor(C.G, a).find((x) => x.to === b); if (m) C.doMove(m); return !!m; };
    const ok = [play(at(12, 7), at(10, 7)), play(at(7, 1), at(7, 3)), play(at(1, 6), at(3, 6)), play(at(6, 12), at(6, 10)), play(at(13, 4), at(11, 5))];
    const rows = window.__rows(), dots = [...document.querySelectorAll("#moveLog .mv i")].map((i) => i.style.background.replace(/\s/g, ""));
    const shown = document.getElementById("logBox") && getComputedStyle(document.getElementById("logBox")).display;
    const labels = [...document.querySelectorAll("#board .coord")].map((e) => e.textContent);
    document.getElementById("undoBtn").click();
    const undone = window.__rows();
    C.start(2);
    return { ok, rows, dots, shown, labels: labels.length, edge: labels.includes("n") && labels.includes("14"), undone };
  });
  check("chess 4 players: a move log in the cross's own square names, a numbered row a round (1. h2-h4 b7-d7 g13-g11 m8-k8 | 2. Ne1-f3), each move after its player's colour",
    fourLog.ok.every(Boolean) && fourLog.shown !== "none" && fourLog.rows.join(" | ") === "1. h2-h4 b7-d7 g13-g11 m8-k8 | 2. Ne1-f3" &&
    fourLog.dots.length === 5 && fourLog.dots[0] === fourLog.dots[4] && new Set(fourLog.dots).size === 4, fourLog);
  check("chess 4 players: Undo takes the last move off the log, and the board's edge shows the names (files a to n, ranks 1 to 14)",
    fourLog.undone.join(" | ") === "1. h2-h4 b7-d7 g13-g11 m8-k8" && fourLog.labels === 28 && fourLog.edge, fourLog);
  // + and # as in chess, on the board right after the move: Red's rook checks
  // Yellow's king in its corner; walled in by its own pawns it's mate (#) even
  // though Blue moves before Yellow's turn comes, and with a way out it's +
  const fourMarks = await p.evaluate(() => {
    const C = __chess, at = (r, c) => r * 14 + c, out = {};
    for (const walled of [true, false]) {
      C.start(4, 2); document.getElementById("menu").classList.remove("show");
      const b = C.G.board.map(() => null), pc = (o, t) => ({ o, t, dead: false });
      b[at(13, 7)] = pc("r", "k"); b[at(7, 0)] = pc("b", "k"); b[at(7, 13)] = pc("g", "k"); b[at(0, 3)] = pc("y", "k");
      b[at(1, 3)] = pc("y", "p"); if (walled) b[at(1, 4)] = pc("y", "p");
      b[at(5, 10)] = pc("r", "r");
      C.G.board = b; C.G.turn = "r";
      const m = C.legalFor(C.G, at(5, 10)).find((x) => x.to === at(0, 10));
      if (m) C.doMove(m);
      out[walled ? "mate" : "check"] = { log: (C.G.sans || []).map((e) => e.san).join(" "), turn: C.G.turn, yellowIn: C.G.players.y.alive };
    }
    C.start(2);
    return out;
  });
  check("chess 4 players: a move that leaves a player checkmated is # (Rk9-k14#) though another player moves first; a check with a way out is + (Rk9-k14+)",
    fourMarks.mate.log === "Rk9-k14#" && fourMarks.mate.turn === "b" && fourMarks.mate.yellowIn && fourMarks.check.log === "Rk9-k14+", fourMarks);
  check("chess (log): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- vs CPU: the CPU's moves are logged too, and Undo takes back its reply and your move
  p = await open2();
  await p.evaluate(() => { document.getElementById("menu").classList.remove("show"); __chess.start(2, null, { opponent: "cpu", difficulty: "easy", side: "w", base: 0, inc: 0 }); });
  // (what the page asks the worker: kept, to see it carries the draw rules' count)
  await p.evaluate(() => { const post = Worker.prototype.postMessage; Worker.prototype.postMessage = function (m) { window.__asked = m; return post.apply(this, arguments); }; });
  await p.evaluate(() => { const C = __chess; C.doMove(C.legalFor(C.G, 52).find((x) => x.to === 36)); });
  const replied = await p.waitForFunction(() => (__chess.G.sans || []).length === 2, null, { timeout: 20000 }).then(() => true, () => false);
  const cpuLog = await p.evaluate(() => ({ sans: (__chess.G.sans || []).map((e) => e.col + ":" + e.san), asked: window.__asked && { positions: window.__asked.positions, halfmove: window.__asked.halfmove }, now: __chess.G.positions.slice(-1)[0] }));
  await p.evaluate(() => document.getElementById("undoBtn").click());
  const cpuUndo = await p.evaluate(() => (__chess.G.sans || []).length);
  check("chess vs CPU: the CPU's reply is logged after your move, and Undo takes both off the log",
    replied && cpuLog.sans.length === 2 && cpuLog.sans[0] === "w:e4" && /^b:/.test(cpuLog.sans[1]) && cpuUndo === 0, { replied, cpuLog, cpuUndo });
  check("chess vs CPU: the CPU is told the game's positions since the last capture or pawn move, and its half-move count",
    !!cpuLog.asked && Array.isArray(cpuLog.asked.positions) && cpuLog.asked.positions.length === 1 && cpuLog.asked.halfmove === 0 && / b /.test(cpuLog.asked.positions[0] || ""), cpuLog.asked);
  check("chess (log vs CPU): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- the CPU and the draw rules (its worker asked directly, to a fixed depth,
  // so its pick doesn't hang on the time it gets). Only a third time is a draw,
  // as in the game, and a draw is worth 0: ahead, it won't make a position come
  // round a third time nor play the quiet move that ends fifty moves; a second
  // time is just a position, which it plays if that's its best move; behind,
  // it takes a threefold that's on offer and not a mere second time
  p = await open2();
  const cpu = await p.evaluate(async () => {
    const C = __chess;
    const think = (pieces, extra) => new Promise((res) => {
      const b = new Array(64).fill(null);
      for (const [i, o, t] of pieces) b[i] = { o, t, dead: false };
      const w = new Worker("cpu-worker.js");
      w.onmessage = (e) => { w.terminate(); res(e.data.move ? e.data.move.from + "-" + e.data.move.to : null); };
      w.postMessage(Object.assign({ type: "think", requestId: 1, board: b, turn: "b", castle: { wk: false, wq: false, bk: false, bq: false }, ep: null,
        difficulty: "medium", budgetMs: 60000, maxDepth: 3 }, extra));
    });
    // the position after Black's move from-to, as the game writes it (and the one before)
    const keys = (pieces, from, to) => {
      C.start(2); document.getElementById("overOverlay").classList.remove("show");
      const G = C.G, b = new Array(64).fill(null);
      for (const [i, o, t] of pieces) b[i] = { o, t, dead: false };
      G.board = b; G.turn = "b"; G.castle = { wk: false, wq: false, bk: false, bq: false }; G.ep = null;
      const m = C.legalFor(G, from).find((x) => x.to === to);
      C.doMove(m);
      const after = C.G.positions.slice(-1)[0];
      C.start(2);
      return after;
    };
    const out = {};
    // ahead: Black has a rook and the king, White the king alone
    const ahead = [[0, "b", "k"], [7, "b", "r"], [36, "w", "k"]];
    out.aheadFree = await think(ahead, { positions: [], halfmove: 10 });
    const [f1, t1] = out.aheadFree.split("-").map(Number), k1 = keys(ahead, f1, t1);
    out.aheadOnce = await think(ahead, { positions: [k1], halfmove: 10 });        // its move would make the second time
    out.aheadTwice = await think(ahead, { positions: [k1, k1], halfmove: 10 });   // ...or the third
    // behind: a bare king against a queen and a rook; one of its king moves repeats
    const behind = [[0, "b", "k"], [60, "w", "k"], [52, "w", "q"], [44, "w", "r"]];
    out.behindFree = await think(behind, { positions: [], halfmove: 10 });
    out.repeatable = out.behindFree === "0-1" ? "0-8" : "0-1";
    const [f2, t2] = out.repeatable.split("-").map(Number), k2 = keys(behind, f2, t2);
    out.behindOnce = await think(behind, { positions: [k2], halfmove: 10 });
    out.behindTwice = await think(behind, { positions: [k2, k2], halfmove: 10 });
    // ahead with the fifty moves all but run: a pawn move (which starts the count again), not a quiet one
    const fifty = [[0, "b", "k"], [7, "b", "r"], [9, "b", "p"], [36, "w", "k"]];
    out.fiftyFree = await think(fifty, { positions: [], halfmove: 0 });
    out.fiftyLast = await think(fifty, { positions: [], halfmove: 99 });
    return out;
  });
  check("chess CPU: ahead, it doesn't make a position come round a third time (threefold repetition)", !!cpu.aheadFree && !!cpu.aheadTwice && cpu.aheadTwice !== cpu.aheadFree, cpu);
  check("chess CPU: a second time is just a position: ahead, it still plays its best move when that repeats a position once; behind, a mere second time isn't the draw it wants",
    cpu.aheadOnce === cpu.aheadFree && cpu.behindOnce === cpu.behindFree, cpu);
  check("chess CPU: behind, it takes a threefold that's on offer (the draw)", cpu.behindFree !== cpu.repeatable && cpu.behindTwice === cpu.repeatable, cpu);
  check("chess CPU: ahead with the fifty moves all but run, it moves its pawn (the count starts again) instead of a quiet move that draws",
    !/^9-/.test(cpu.fiftyFree || "") && /^9-/.test(cpu.fiftyLast || ""), cpu);
  check("chess (CPU draw rules): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- 4 players, frozen pieces: a checkmated army's frozen king is captured like the rest of it
  p = await open2();
  const four = await p.evaluate(() => {
    const C = __chess; C.start(4, 3); document.getElementById("menu").classList.remove("show");
    const G = C.G, b = G.board.map(() => null), at = (r, c) => r * 14 + c;
    b[at(13, 7)] = { o: "r", t: "k", dead: false }; b[at(0, 7)] = { o: "y", t: "k", dead: false }; b[at(7, 13)] = { o: "g", t: "k", dead: false };
    b[at(7, 5)] = { o: "r", t: "r", dead: false }; b[at(7, 3)] = { o: "b", t: "k", dead: true }; b[at(7, 2)] = { o: "b", t: "q", dead: true };
    b[at(4, 5)] = { o: "y", t: "n", dead: false };
    G.board = b; G.players.b.alive = false; G.turn = "r"; C.render();
    const moves = C.legalFor(G, at(7, 5)).map((m) => m.to);
    const m = C.legalFor(G, at(7, 5)).find((x) => x.to === at(7, 3));
    if (m) C.doMove(m);
    return { took: !!m, past: moves.includes(at(7, 2)), over: C.G.over, turn: C.G.turn, there: C.G.board[at(7, 3)] && C.G.board[at(7, 3)].t + C.G.board[at(7, 3)].o };
  });
  check("chess 4 players: a frozen king can be captured (play goes on to the next player); a rook still can't pass through it",
    four.took && !four.past && !four.over && four.turn === "y" && four.there === "rr", four);
  const live = await p.evaluate(() => {
    const C = __chess, G = C.G, at = (r, c) => r * 14 + c;
    const b = G.board.map(() => null);
    b[at(13, 7)] = { o: "r", t: "k", dead: false }; b[at(0, 7)] = { o: "y", t: "k", dead: false }; b[at(7, 13)] = { o: "g", t: "k", dead: false };
    b[at(0, 5)] = { o: "r", t: "r", dead: false };
    G.board = b; G.turn = "r"; G.over = false;
    return C.legalFor(G, at(0, 5)).some((m) => m.to === at(0, 7));
  });
  check("chess 4 players: a live king is still never capturable (guard)", live === false, live);
  check("chess 4 players (frozen king): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- 3 players: a move log, long algebraic in the board's own cell names
  // (files a to x round the table, Red's a to h, White's i to p, Black's q to
  // x; ranks 1 to 4 from each home row in, shown on the board's edge), a
  // numbered row a round, each move after its player's colour; Undo takes the
  // last one off; a mate is # and the result is in words. On a phone the log
  // sits right under the board.
  {
    let html = fs.readFileSync(path.join(lib.ROOT, "games/chess/three.html"), "utf8");
    html = html.replace(HOOK3[0], HOOK3[1]);
    const route = (pg) => pg.route(/\/games\/chess\/three\.html$/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html }));
    const q = await lib.open(ctx, base, "games/chess/three.html", { before: route });
    const rowsOf = () => [...document.querySelectorAll("#moveLog li")].map((li) => li.children.length ? [...li.children].map((c) => c.textContent).filter(Boolean).join(" ") : li.textContent);
    const log3 = await q.evaluate((rowsSrc) => {
      const rows = eval(rowsSrc), T = __three; T.start(3); document.getElementById("menu").classList.remove("show");
      const play = (a, b) => { const m = T.legalFor(a).find((x) => x.to === b); if (m) T.doMove(m); return !!m; };
      const ok = [play(T.cid(0, 2, 4), T.cid(0, 0, 4)), play(T.cid(1, 2, 4), T.cid(1, 0, 4)), play(T.cid(2, 2, 4), T.cid(2, 0, 4))];
      const knight = T.legalFor(T.cid(0, 3, 1))[0];
      ok.push(!!knight); if (knight) T.doMove(knight);
      const out = { ok, rows: rows(), dots: [...document.querySelectorAll("#moveLog .mv i")].map((i) => i.style.background.replace(/\s/g, "")),
        labels: [...document.querySelectorAll("#boardSvg .lbl")].map((e) => e.textContent) };
      document.getElementById("undoBtn").click();
      out.undone = rows();
      return out;
    }, "(" + rowsOf.toString() + ")");
    check("chess three: a move log in the board's own cell names, a numbered row a round (1. e2-e4 m2-m4 u2-u4 | 2. Nb1-…), each move after its player's colour",
      (log3.ok || []).every(Boolean) && (log3.rows || [])[0] === "1. e2-e4 m2-m4 u2-u4" && /^2\. Nb1-[a-h][1-4]$/.test((log3.rows || [])[1] || "") &&
      (log3.dots || []).length === 4 && new Set(log3.dots).size === 3, log3);
    check("chess three: Undo takes the last move off the log, and the board's edge names the cells (files a to x by the rim, ranks 1 to 4)",
      (log3.undone || []).join(" | ") === "1. e2-e4 m2-m4 u2-u4" && (log3.labels || []).length === 36 && log3.labels.includes("x") && log3.labels.includes("4"), log3);
    // a smothered mate (first checkmate wins): the move is marked # and the result follows in words
    const mated = await q.evaluate((rowsSrc) => {
      const rows = eval(rowsSrc), T = __three; T.start(1);
      const pc = (o, t) => ({ o, t, dead: false }), b = new Array(96).fill(null);
      b[T.cid(0, 3, 4)] = pc("r", "k"); b[T.cid(1, 3, 4)] = pc("w", "k"); b[T.cid(2, 3, 4)] = pc("k", "k");
      [[2, 3], [2, 4], [2, 5]].forEach(([r, f]) => { b[T.cid(0, r, f)] = pc("r", "p"); });
      b[T.cid(0, 3, 3)] = pc("r", "n"); b[T.cid(0, 3, 5)] = pc("r", "n");
      const target = T.cid(0, 2, 6);
      for (let c = 0; c < 96; c++) {
        if (b[c]) continue;
        const t = b.slice(); t[c] = pc("k", "n");
        if (T.genMoves(t, c).some((m) => m.to === target)) {
          T.G.board = t; T.G.turn = "k";
          const m = T.legalFor(c).find((mm) => mm.to === target);
          if (m) { T.doMove(m); return rows(); }
        }
      }
      return null;
    }, "(" + rowsOf.toString() + ")");
    check("chess three: a mate is marked # and the result follows in words (Black wins)",
      !!mated && /^1\. N[a-x][1-4]-g2#$/.test(mated[0] || "") && mated[mated.length - 1] === "Black wins", mated);
    // the same smothered mate on Black, by Red's knight: # on the board as it
    // stands, though White moves before Black's turn comes (the takeover rule)
    const early = await q.evaluate((rowsSrc) => {
      const rows = eval(rowsSrc), T = __three; T.start(2);
      const pc = (o, t) => ({ o, t, dead: false }), b = new Array(96).fill(null);
      b[T.cid(0, 3, 4)] = pc("r", "k"); b[T.cid(1, 3, 4)] = pc("w", "k"); b[T.cid(2, 3, 4)] = pc("k", "k");
      [[2, 3], [2, 4], [2, 5]].forEach(([r, f]) => { b[T.cid(2, r, f)] = pc("k", "p"); });
      b[T.cid(2, 3, 3)] = pc("k", "n"); b[T.cid(2, 3, 5)] = pc("k", "n");
      const target = T.cid(2, 2, 6);
      for (let c = 0; c < 96; c++) {
        if (b[c]) continue;
        const t = b.slice(); t[c] = pc("r", "n");
        if (T.genMoves(t, c).some((m) => m.to === target)) {
          T.G.board = t; T.G.turn = "r";
          const m = T.legalFor(c).find((mm) => mm.to === target);
          if (m) { T.doMove(m); return { rows: rows(), turn: T.G.turn, blackIn: T.G.players.k.alive }; }
        }
      }
      return null;
    }, "(" + rowsOf.toString() + ")");
    check("chess three: a move that leaves a player checkmated is # though another player moves first (Red mates Black, White to move)",
      !!early && /^1\. N[a-x][1-4]-w2#$/.test(early.rows[0] || "") && early.turn === "w" && early.blackIn, early);
    check("chess three (log): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    // on a phone: right under the board, above the players and the buttons
    const { devices } = require("@playwright/test");
    for (const [label, opts] of [["390", devices["iPhone 13"]], ["320", { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }]]) {
      const c = await lib.newContext(browser, opts);
      const r = await lib.open(c, base, "games/chess/three.html", { before: route });
      const where = await r.evaluate(() => {
        document.getElementById("menu").classList.remove("show");
        const box = (e) => e && e.getBoundingClientRect(), lb = box(document.getElementById("logBox")), bd = box(document.getElementById("boardSvg")), sd = box(document.querySelector(".side"));
        return lb ? { log: [lb.left, lb.top, lb.right, lb.bottom].map(Math.round), boardBottom: Math.round(bd.bottom), sideTop: Math.round(sd.top), vw: innerWidth, over: document.documentElement.scrollWidth - innerWidth } : null;
      });
      check("chess three on a " + label + " px phone: the log sits right under the board, above the players and buttons, inside the screen",
        !!where && where.log[1] >= where.boardBottom && where.log[3] <= where.sideTop + 1 && where.log[0] >= 0 && where.log[2] <= where.vw && where.over <= 0, where);
      await c.close();
    }
  }

  // ---- 3 players, frozen pieces: the same
  {
    let html = fs.readFileSync(path.join(lib.ROOT, "games/chess/three.html"), "utf8");
    html = html.replace(HOOK3[0], HOOK3[1]);
    const q = await lib.open(ctx, base, "games/chess/three.html", { before: (pg) => pg.route(/\/games\/chess\/three\.html$/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html })) });
    const three = await q.evaluate(() => {
      const T = __three; T.start(3); document.getElementById("menu").classList.remove("show");
      const G = T.G, b = new Array(96).fill(null);
      b[T.cid(0, 3, 4)] = { o: "r", t: "k", dead: false }; b[T.cid(1, 3, 4)] = { o: "w", t: "k", dead: false };
      b[T.cid(0, 2, 0)] = { o: "r", t: "r", dead: false }; b[T.cid(0, 2, 2)] = { o: "k", t: "k", dead: true };
      G.board = b; G.players.k.alive = false; G.turn = "r";
      const m = T.legalFor(T.cid(0, 2, 0)).find((x) => x.to === T.cid(0, 2, 2));
      if (m) T.doMove(m);
      return { took: !!m, over: G.over, turn: T.G.turn, there: T.G.board[T.cid(0, 2, 2)] && T.G.board[T.cid(0, 2, 2)].t + T.G.board[T.cid(0, 2, 2)].o,
        red: T.inCheck(T.G.board, "r"), white: T.inCheck(T.G.board, "w") };
    });
    check("chess three: a frozen king can be captured, play goes on and check still reads right", three.took && !three.over && three.turn === "w" && three.there === "rr" && !three.red && !three.white, three);
    check("chess three (frozen king): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }

  // ---- the room (cafe.css), the same for both boards: a light marble table
  // with dark lettering in the cafe's type; whoever is to move is named in
  // that ink with a dot of their own colour beside it (so White's name and
  // Black's both read); and on a phone the title is clear of the corner buttons
  {
    const { devices } = require("@playwright/test");
    const look = (pg) => pg.evaluate(() => {
      const lum = (s) => {
        const [r, g, b] = (s.match(/[\d.]+/g) || []).slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const cs = (e) => getComputedStyle(e), st = document.getElementById("status"), who = st.querySelector(".who"), dot = who && who.querySelector("i");
      const page = lum(cs(document.body).backgroundColor), ink = lum(cs(st).color);
      const h1 = document.querySelector("h1"), nav = document.querySelector(".nav-back-games").getBoundingClientRect();
      return {
        page: +page.toFixed(2), contrast: +((Math.max(page, ink) + 0.05) / (Math.min(page, ink) + 0.05)).toFixed(1),
        name: who ? who.textContent : null, inInk: !!who && cs(who).color === cs(st).color,
        dot: dot ? cs(dot).backgroundColor.replace(/\s/g, "") : null, dotW: dot ? Math.round(dot.getBoundingClientRect().width) : 0,
        type: /Bodoni/.test(cs(h1).fontFamily) && /Garamond/.test(cs(st).fontFamily), nav: lum(cs(document.querySelector(".nav-back-games")).backgroundColor) > 0.6,
        clear: h1.getBoundingClientRect().top >= nav.bottom, over: document.documentElement.scrollWidth - innerWidth,
      };
    });
    const room = (l) => l.page > 0.7 && l.contrast >= 7 && l.type && l.nav;
    const named = (l, name, dot) => l.name === name && l.inInk && l.dot === dot && l.dotW >= 8;
    const got = {};
    for (const [label, opts] of [["desktop", {}], ["phone", devices["iPhone 13"]]]) {
      const c = await lib.newContext(browser, opts);
      const two = await lib.open(c, base, "games/chess/");
      await two.evaluate(() => { document.querySelector('#menu [data-mode="2"]').click(); document.getElementById("setup2Start").click(); });
      const white = await look(two);
      await two.evaluate(() => { const q = document.querySelectorAll("#board .sq"); q[52].click(); q[36].click(); });   // e4
      await two.waitForFunction(() => /Black/.test(document.getElementById("status").textContent), null, { timeout: 5000 }).catch(() => {});
      const black = await look(two);
      const three = await lib.open(c, base, "games/chess/three.html");
      await three.evaluate(() => document.querySelector(".overlay.show .modebtn").click());
      const red = await look(three);
      got[label] = { white, black, red, errs: two.errs.concat(three.errs) };
      await two.close(); await three.close();
      await c.close();
    }
    const d = got.desktop, ph = got.phone;
    check("chess: both boards sit on a light marble table, lettered dark in the cafe's type (corner link too)", room(d.white) && room(d.red) && room(ph.white) && room(ph.red), { two: d.white, three: d.red });
    check("chess: whoever is to move is named in ink with a dot of their colour, so White and Black both read (and Red on the 3-player board)",
      named(d.white, "White", "rgb(251,242,226)") && named(d.black, "Black", "rgb(42,33,26)") && named(d.red, "Red", "rgb(226,87,78)"), { white: d.white, black: d.black, red: d.red });
    check("chess on a phone: both titles are clear of the corner buttons, and nothing is wider than the screen",
      ph.white.clear && ph.red.clear && ph.white.over <= 0 && ph.black.over <= 0 && ph.red.over <= 0, { two: ph.white, three: ph.red });
    check("chess (the room): no page errors", d.errs.length === 0 && ph.errs.length === 0, { desktop: d.errs, phone: ph.errs });
  }

  // ---- the log on the page. On a wide window, a scoresheet left of the board,
  // level with it and no taller: a long game scrolls inside it with the latest
  // move in view, and the page is no longer for it. On a phone, under the
  // buttons, inside the screen, scrolling the same way. And Morphy's Opera
  // Game, played through, reads as it is published.
  {
    const { devices } = require("@playwright/test");
    const OPERA = "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5 cxb5 Bxb5+ Nbd7 O-O-O Rd8 Rxd7 Rxd7 Rd1 Qe6 Bxd7+ Nxd7 Qb8+ Nxb8 Rd8#";
    const sizes = [["1280x900", { viewport: { width: 1280, height: 900 } }], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["1280x600", { viewport: { width: 1280, height: 600 } }],
      ["1440x900", { viewport: { width: 1440, height: 900 } }], ["1920x1080", { viewport: { width: 1920, height: 1080 } }],
      ["390", devices["iPhone 13"]], ["320", { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }],
      ["360", { viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true }], ["375x553", { viewport: { width: 375, height: 553 }, isMobile: true, hasTouch: true }]];
    const got = {};
    for (const [label, opts] of sizes) {
      const c = await lib.newContext(browser, opts);
      const q = await lib.open(c, base, "games/chess/", { before: (pg) => lib.injectScript(pg, "games/chess/game.js", [HOOK2]) });
      got[label] = await q.evaluate(([OPERA, playIt]) => {
        document.getElementById("menu").classList.remove("show");
        const C = __chess, box = (e) => { const r = e.getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom].map(Math.round); };
        const page = () => [document.documentElement.scrollHeight, document.documentElement.scrollWidth];
        let opera = null;
        if (playIt) {
          // each move found by trying the legal ones until the log writes it as published
          C.start(2);
          for (const want of OPERA.split(" ")) {
            let found = false;
            for (let i = 0; i < 64 && !found; i++) for (const m of C.legalFor(C.G, i)) {
              C.doMove(m, "q");
              if ((C.G.sans || []).map((e) => e.san).slice(-1)[0] === want) { found = true; break; }
              document.getElementById("undoBtn").click();
            }
            if (!found) break;
          }
          opera = { sans: (C.G.sans || []).map((e) => e.san).join(" "), res: C.G.result || null };
        }
        // (with the clocks on: the side column at its tallest)
        C.start(2, null, { opponent: "local", difficulty: "easy", side: "w", base: 5, inc: 0 });
        const empty = page();
        // a long game: sixty moves a side on the log
        C.G.sans = Array.from({ length: 120 }, (_, k) => ({ col: k % 2 ? "b" : "w", san: k % 2 ? "Nf6" : "Nf3" }));
        C.render();
        const log = document.getElementById("moveLog"), lb = document.getElementById("logBox");
        if (!log || !lb) return { opera, missing: true };
        const last = log.lastElementChild && log.lastElementChild.getBoundingClientRect(), lv = log.getBoundingClientRect();
        const parts = [box(lb), box(document.querySelector(".boardwrap")), box(document.querySelector(".side"))];
        // how far the list stops short of the panel's foot (inside its padding), and the rows it shows before it scrolls
        const fillOf = () => { const l = log.getBoundingClientRect(), b = lb.getBoundingClientRect();
          return { gap: Math.round(b.bottom - parseFloat(getComputedStyle(lb).paddingBottom) - l.bottom), rows: Math.floor(log.clientHeight / log.firstElementChild.getBoundingClientRect().height), panel: Math.round(b.height) }; };
        const fill = fillOf();
        const res = { opera, empty, full: page(), vw: innerWidth, log: parts[0], board: parts[1], side: parts[2], fill,
          scrolls: log.scrollHeight > log.clientHeight + 10, lastIn: !!last && last.bottom <= lv.bottom + 1 && last.top >= lv.top - 1 };
        // the longest opening name, under the heading: whole, inside the panel, above the list, which still fills the rest
        C.G.opening = "Italian Game: Two Knights Defence, Traxler Counterattack"; C.render();
        const on = document.getElementById("logOpening");
        if (on) {
          const ob = on.getBoundingClientRect(), pb = lb.getBoundingClientRect();
          res.named = { shown: !on.hidden && getComputedStyle(on).visibility === "visible", text: on.textContent,
            inside: ob.left >= pb.left && ob.right <= pb.right && ob.top >= pb.top && ob.bottom <= pb.bottom && ob.height > 0,
            whole: on.scrollWidth <= on.clientWidth + 1 && on.scrollHeight <= on.clientHeight + 1, above: ob.bottom <= log.getBoundingClientRect().top + 1,
            fill: fillOf(), box: box(lb), full: page() };
        }
        return res;
      }, [OPERA, label === "1280x900"]);
      got[label].errs = q.errs;
      await c.close();
    }
    const wide = (g) => !g.missing && g.log[2] <= g.board[0] && Math.abs(g.log[1] - g.board[1]) <= 1 && g.log[3] <= Math.max(g.board[3], g.side[3]) + 1 &&
      g.full[0] === g.empty[0] && g.full[1] <= g.vw && g.scrolls && g.lastIn;
    const narrow = (g) => !g.missing && g.log[1] >= g.board[3] && g.log[3] <= g.side[1] + 1 && g.log[0] >= 0 && g.log[2] <= g.vw && g.log[3] - g.log[1] <= 320 && g.full[1] <= g.vw && g.scrolls && g.lastIn;
    check("chess log: Morphy's Opera Game, played through, is written as published (Nbd7, O-O-O, Bxd7+, Rd8#) and ends 1-0",
      !!got["1280x900"].opera && got["1280x900"].opera.sans === OPERA && got["1280x900"].opera.res === "1-0", got["1280x900"].opera);
    const wideOnes = ["1280x900", "1366x657", "1280x600", "1440x900", "1920x1080"];
    check("chess log: on a wide window it sits left of the board, level with it and no taller; a long game scrolls inside it to the latest move, the page no longer for it (1280 x 900 to 1920 x 1080, 1366 x 657, 1280 x 600)",
      wideOnes.every((k) => wide(got[k])), Object.fromEntries(wideOnes.map((k) => [k, got[k]])));
    check("chess log: on a phone it sits right under the board, above the trays and buttons, inside the screen, and a long game scrolls inside it to the latest move (390, 360, 320 px, and 375 x 553)",
      ["390", "360", "320", "375x553"].every((k) => narrow(got[k])), { p390: got["390"], p360: got["360"], p320: got["320"], short: got["375x553"] });
    const all = Object.keys(got);
    check("chess log: its list fills the whole panel before it scrolls, on a laptop (the panel as tall as the board) and on a phone (1280 x 900 to 1920 x 1080, 1366 x 657, 1280 x 600, 390, 360, 320 px, 375 x 553)",
      all.every((k) => !got[k].missing && got[k].fill.gap <= 2), Object.fromEntries(all.map((k) => [k, got[k].fill])));
    check("chess log: an opening's name, the longest there is, shows whole under the heading, inside the panel and above the list, which still fills the rest; on a laptop the panel is no taller for it, on a phone the log starts where it did, and the page is no wider",
      all.every((k) => { const g = got[k], n = g.named; return !!n && n.shown && n.inside && n.whole && n.above && n.fill.gap <= 2 && n.full[1] <= g.vw && n.box[1] === g.log[1] &&
        (wideOnes.includes(k) ? n.box[3] === g.log[3] : true); }), Object.fromEntries(all.map((k) => [k, got[k].named])));
    check("chess log (sizes): no page errors", Object.values(got).every((g) => g.errs.length === 0), Object.fromEntries(Object.entries(got).map(([k, g]) => [k, g.errs])));
  }

  // ---- a cup on the table for every player (two on the 2-player board, four
  // on the 4-player cross, three on the 3-player page), at every size from a
  // big desktop to a small phone, each a different drink, none over the board,
  // the move log, the side column, the title lines, the corner buttons or
  // another cup; the steam rises with Visual FX on and stands still with it off
  {
    const { devices } = require("@playwright/test");
    const sizes = [["1920x1080", { viewport: { width: 1920, height: 1080 } }], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["1280x600", { viewport: { width: 1280, height: 600 } }],
      ["960x800", { viewport: { width: 960, height: 800 } }], ["390", devices["iPhone 13"]], ["360", { viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true }],
      ["320", { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }]];
    const seen = {};
    for (const [label, opts] of sizes) {
      const c = await lib.newContext(browser, opts);
      for (const board of ["2", "4", "3"]) {
        const q = await lib.open(c, base, board === "3" ? "games/chess/three.html" : "games/chess/");
        await q.evaluate((board) => {
          if (board === "3") { document.querySelector("#menu .modebtn").click(); return; }
          document.querySelector('#menu [data-mode="' + board + '"]').click();
          if (board === "2") { document.querySelector('#basePick [data-base="5"]').click(); document.getElementById("setup2Start").click(); }   // (clocks on: the side column at its tallest)
          else document.querySelector("#endMenu .modebtn").click();
        }, board);
        await q.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        seen[board + "p " + label] = await q.evaluate(() => {
          const box = (r) => [r.left + scrollX, r.top + scrollY, r.right + scrollX, r.bottom + scrollY];
          const keep = [...document.querySelectorAll("h1, .sub, #status, .layout > *")].filter((e) => e.getClientRects().length).map((e) => box(e.getBoundingClientRect()));
          for (const e of document.querySelectorAll(".gs-corner, .nav-back-games")) { const r = e.getBoundingClientRect(); keep.push([r.left, r.top, r.right, r.bottom]); }
          const cups = [...document.querySelectorAll(".cupslot")].filter((e) => e.getClientRects().length).map((e) => ({ who: e.dataset.player, drink: e.firstChild && e.firstChild.className, at: box(e.getBoundingClientRect()) }));
          const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
          return { n: cups.length, who: cups.map((x) => x.who).join(""), drinks: new Set(cups.map((x) => x.drink)).size, sizes: cups.map((x) => Math.round(x.at[2] - x.at[0])),
            clear: cups.every((x, i) => !keep.some((k) => hit(x.at, k)) && !cups.some((y, j) => j !== i && hit(x.at, y.at))),
            inside: cups.every((x) => x.at[0] >= 0 && x.at[2] <= document.documentElement.clientWidth), over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
        });
        if (label === "1920x1080" && board === "2") {
          const steam = (on) => q.evaluate((on) => { if (window.RM_ON() === on) document.querySelector(".rm-toggle").click(); const i = document.querySelector(".cup i"); return i ? getComputedStyle(i).animationName : null; }, on);
          seen.steamOn = await steam(true); seen.steamOff = await steam(false);
        }
        seen[board + "p " + label].errs = q.errs;
        await q.close();
      }
      await c.close();
    }
    const want = { "2": ["wb", 2], "4": ["rbyg", 4], "3": ["rwk", 3] };
    const rows = Object.entries(seen).filter(([k]) => / /.test(k));
    check("chess: a cup for every player at every size (two, four on the 4-player cross, three on the 3-player page), each a different drink, 1920 x 1080 down to a 320 px phone",
      rows.every(([k, g]) => g.n === want[k[0]][1] && g.who === want[k[0]][0] && g.drinks === g.n && g.sizes.every((s) => s >= 36 && s <= 128)), Object.fromEntries(rows.map(([k, g]) => [k, { n: g.n, who: g.who, drinks: g.drinks, sizes: g.sizes }])));
    check("chess: no cup covers the board, the move log, the side column, the title lines, the corner buttons or another cup, nor runs off the page, at any of those sizes",
      rows.every(([, g]) => g.clear && g.inside && g.over <= 0), Object.fromEntries(rows.map(([k, g]) => [k, { clear: g.clear, inside: g.inside, over: g.over }])));
    check("chess: the cups' steam rises with Visual FX on and stands still with it off", seen.steamOn === "cafe-steam" && seen.steamOff === "none", { on: seen.steamOn, off: seen.steamOff });
    check("chess (cups): no page errors", rows.every(([, g]) => g.errs.length === 0), Object.fromEntries(rows.map(([k, g]) => [k, g.errs])));
  }

  // ---- a small phone: the 2-player setup card at its tallest (vs CPU, with a
  // time control) is taller than the screen, so it starts at the top and
  // scrolls: its heading isn't cut off and Start can be reached and pressed
  {
    const small = await lib.newContext(browser, { viewport: { width: 320, height: 568 } });
    const s = await lib.open(small, base, "games/chess/");
    await s.evaluate(() => {
      document.querySelector('#menu [data-mode="2"]').click();
      document.querySelector('#opponentPick [data-opp="cpu"]').click();
      document.querySelector('#basePick [data-base="5"]').click();
    });
    const fit = await s.evaluate(() => {
      const card = document.querySelector("#setup2Menu .card"), h = card.querySelector("h2").getBoundingClientRect();
      const hit = document.elementFromPoint(h.left + h.width / 2, h.top + h.height / 2);
      return { top: Math.round(card.getBoundingClientRect().top), heading: !!hit && card.contains(hit) };
    });
    const at = await s.evaluate(() => {
      const b = document.getElementById("setup2Start"); b.scrollIntoView({ block: "nearest" });
      const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      // (within a pixel: the card's height isn't a whole number of pixels, the scroll position is)
      return { x, y, inView: r.top >= -1 && r.bottom <= innerHeight + 1, hit: document.elementFromPoint(x, y) === b };
    });
    if (at.inView && at.hit) await s.mouse.click(at.x, at.y);
    const started = await s.evaluate(() => !document.getElementById("setup2Menu").classList.contains("show") && document.getElementById("modeLabel").textContent);
    check("chess on a 320×568 phone: the tallest 2-player setup card starts on screen (heading showing) and scrolls to a Start button that starts the game",
      fit.top >= 0 && fit.heading && at.inView && at.hit && !!started && /CPU/i.test(started), { fit, at, started });
    check("chess (small phone): no page errors", s.errs.length === 0, s.errs);
    await small.close();
  }

  // ---- the pause (P, or the corner button), with a clock: the board is bare
  // under the card (no piece, no last move), the clocks stop and the game takes
  // no key; resumed, all is back and the clock that ran runs on. Away from the
  // tab a game with a clock pauses; with no clock it doesn't (nothing to stop).
  // "Leave this game?" holds the clock too.
  {
    const q = await lib.open(ctx, base, "games/chess/", { before: (pg) => lib.injectScript(pg, "games/chess/game.js", [HOOK2]) });
    const board = () => q.evaluate(() => ({ pieces: document.querySelectorAll("#board .pc").length, last: document.querySelectorAll("#board .sq.last").length,
      card: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, running: __chess.G.clock && __chess.G.clock.running, b: __chess.G.clock && __chess.G.clock.b, flipped: document.querySelector("#board .sq").dataset.i }));
    await q.evaluate(() => { document.getElementById("menu").classList.remove("show"); __chess.start(2, null, { opponent: "local", difficulty: "easy", side: "w", base: 3, inc: 0 }); });
    await q.click('.sq[data-i="52"]'); await q.click('.sq[data-i="36"]');      // e2-e4: Black's clock runs
    const a = await board();
    await q.keyboard.press("p"); await q.waitForTimeout(100);
    const b = await board();
    await q.keyboard.press("f"); await q.waitForTimeout(1200);                  // (F would flip the board: not under the card)
    const c = await board();
    await q.keyboard.press("p"); await q.waitForTimeout(1200);
    const d = await board();
    check("chess: P pauses: the pieces and the last move are hidden, the clocks stop and F flips nothing; P again brings them back and Black's clock runs on",
      a.pieces === 32 && a.last === 2 && a.running === "b" && b.card && b.pieces === 0 && b.last === 0 && b.running === null && c.card && c.b === b.b && c.flipped === a.flipped &&
      !d.card && d.pieces === 32 && d.last === 2 && d.running === "b" && d.b < c.b && d.b > c.b - 2500, { a, b, c, d });
    // away from the tab: with a clock it pauses, with none it doesn't
    await q.evaluate(() => window.dispatchEvent(new Event("blur"))); await q.waitForTimeout(100);
    const awayClock = (await board()).card;
    if (awayClock) { await q.keyboard.press("p"); await q.waitForTimeout(100); }
    await q.evaluate(() => __chess.start(2, null, { opponent: "local", difficulty: "easy", side: "w", base: 0, inc: 0 }));
    await q.click('.sq[data-i="52"]'); await q.click('.sq[data-i="36"]');
    await q.evaluate(() => window.dispatchEvent(new Event("blur"))); await q.waitForTimeout(100);
    const awayNone = (await board()).card;
    check("chess: away from the tab a game with a clock pauses; one with no clock doesn't", awayClock === true && awayNone === false, { awayClock, awayNone });
    // Leave this game? holds the clock as well
    await q.evaluate(() => __chess.start(2, null, { opponent: "local", difficulty: "easy", side: "w", base: 3, inc: 0 }));
    await q.click('.sq[data-i="52"]'); await q.click('.sq[data-i="36"]');
    await q.click(".nav-back-games"); await q.waitForTimeout(100);
    const l0 = await q.evaluate(() => ({ dlg: (document.querySelector(".gs-dialog h2") || {}).textContent || null, b: __chess.G.clock.b, running: __chess.G.clock.running }));
    await q.waitForTimeout(1000);
    const l1 = await q.evaluate(() => __chess.G.clock.b);
    await q.keyboard.press("x"); await q.waitForTimeout(600);
    const l2 = await q.evaluate(() => ({ running: __chess.G.clock.running, b: __chess.G.clock.b, card: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden }));
    check("chess: 'Leave this game?' holds the clock under it, and Keep playing runs it on",
      l0.dlg === "Leave this game?" && l0.running === null && l1 === l0.b && l2.running === "b" && !l2.card && l2.b < l1 && q.leaves === 0, { l0, l1, l2, leaves: q.leaves });
    check("chess (pause): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }

  // ---- paused while the CPU thinks: no move lands under the card; resumed,
  // the CPU thinks again and plays
  {
    const q = await lib.open(ctx, base, "games/chess/", { before: (pg) => lib.injectScript(pg, "games/chess/game.js", [HOOK2]) });
    await q.evaluate(() => { document.getElementById("menu").classList.remove("show"); __chess.start(2, null, { opponent: "cpu", difficulty: "easy", side: "w", base: 0, inc: 0 }); });
    const m0 = await q.evaluate(() => {
      const G = __chess.G, m = __chess.legalFor(G, 52).find((x) => x.to === 36);
      __chess.doMove(m);                                   // e2-e4, and the CPU starts thinking...
      document.querySelector(".gs-pause-btn").click();     // ...paused at once
      return { turn: G.turn, moves: G.history.length };
    });
    await q.waitForTimeout(3000);
    const m1 = await q.evaluate(() => ({ turn: __chess.G.turn, moves: __chess.G.history.length, card: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden }));
    await q.keyboard.press("p");
    const played = await q.waitForFunction(() => __chess.G.turn === "w" && __chess.G.history.length === 2, null, { timeout: 20000 }).then(() => true, () => false);
    check("chess vs CPU: paused while the CPU thinks, no move lands under the card; resumed, the CPU plays",
      m0.turn === "b" && m1.card && m1.turn === "b" && m1.moves === 1 && played, { m0, m1, played });
    check("chess (pause vs CPU): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }

  // ---- the 3-player board pauses too, its pieces hidden while it is paused
  {
    let html = fs.readFileSync(path.join(lib.ROOT, "games/chess/three.html"), "utf8");
    html = html.replace(HOOK3[0], HOOK3[1]);
    const q = await lib.open(ctx, base, "games/chess/three.html", { before: (pg) => pg.route(/\/games\/chess\/three\.html$/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html })) });
    await q.click("#menu .modebtn"); await q.waitForTimeout(200);
    const glyphs = () => q.evaluate(() => ({ glyphs: document.querySelectorAll("#board text.glyph, svg text.glyph").length, card: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden }));
    const t0 = await glyphs();
    await q.keyboard.press("p"); await q.waitForTimeout(100);
    const t1 = await glyphs();
    await q.keyboard.press("u"); await q.keyboard.press("n"); await q.waitForTimeout(150);
    const t2 = await q.evaluate(() => ({ dlg: !!document.querySelector(".gs-dialog"), card: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden }));
    await q.keyboard.press("p"); await q.waitForTimeout(100);
    const t3 = await glyphs();
    check("chess three: P pauses, the pieces hidden (and U and N do nothing under the card); P again brings them back",
      t0.glyphs === 48 && !t0.card && t1.card && t1.glyphs === 0 && t2.card && !t2.dlg && !t3.card && t3.glyphs === 48, { t0, t1, t2, t3 });
    check("chess three (pause): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }

  // ---- a captured piece keeps its own colour: with FX on it flies off in
  // that colour (to its tray with 2 players, shrinking away where it fell with
  // 4), and with FX on or off each tray holds the other side's pieces in their
  // own colour, outlined as on the board (Black's dark in White's tray,
  // White's light in Black's)
  {
    const got = {};
    for (const off of [false, true]) {
      const q = await lib.open(ctx, base, "games/chess/", { before: async (pg) => {
        await pg.addInitScript((off) => localStorage.setItem("reduceMotion:chess", off ? "1" : "0"), off);
        await lib.injectScript(pg, "games/chess/game.js", [HOOK2]);
      } });
      got[off ? "off" : "on"] = await q.evaluate(() => {
        document.getElementById("menu").classList.remove("show");
        const C = __chess, go = (f, t) => C.doMove(C.legalFor(C.G, f).find((m) => m.to === t));
        // the flying piece held halfway, then taken off (its own cleanup comes
        // a tick later, too late for the next capture's look); the tray's newest piece
        const flying = () => {
          const f = document.querySelector(".pc.fly"); if (!f) return null;
          f.getAnimations().forEach((a) => { a.pause(); a.currentTime = a.effect.getTiming().duration / 2; });
          const o = { color: getComputedStyle(f).color, glyph: f.textContent }; f.remove(); return o;
        };
        const tray = (id) => {
          const e = document.getElementById(id).lastElementChild, s = e && getComputedStyle(e);
          return e && { color: s.color, glyph: e.textContent, stroke: s.webkitTextStrokeColor, strokeW: parseFloat(s.webkitTextStrokeWidth) };
        };
        C.start(2);
        go(52, 36); go(11, 27); go(36, 27);                  // e4 d5 exd5: White takes a black pawn
        const flyW = flying(), trayW = tray("capW");
        go(3, 27);                                          // Qxd5: Black takes a white pawn
        const flyB = flying(), trayB = tray("capB");
        // 4 players: Red's rook takes a blue knight
        C.start(4, 3);
        const G = C.G, b = G.board.map(() => null), at = (r, c) => r * 14 + c;
        b[at(13, 7)] = { o: "r", t: "k", dead: false }; b[at(0, 7)] = { o: "y", t: "k", dead: false }; b[at(7, 13)] = { o: "g", t: "k", dead: false }; b[at(3, 0)] = { o: "b", t: "k", dead: false };
        b[at(7, 5)] = { o: "r", t: "r", dead: false }; b[at(7, 3)] = { o: "b", t: "n", dead: false };
        G.board = b; G.turn = "r"; C.render();
        go(at(7, 5), at(7, 3));
        return { flyW, trayW, flyB, trayB, four: flying() };
      });
      got[off ? "off" : "on"].errs = q.errs;
      await q.close();
    }
    const W = "rgb(251, 242, 226)", B = "rgb(42, 33, 26)", BLUE = "rgb(90, 130, 230)", PAWN = "♟︎";
    const trays = (g) => !!g.trayW && g.trayW.color === B && g.trayW.glyph === PAWN && g.trayW.stroke === "rgb(244, 236, 220)" && g.trayW.strokeW > 0 &&
      !!g.trayB && g.trayB.color === W && g.trayB.glyph === PAWN && g.trayB.stroke === "rgb(25, 29, 36)" && g.trayB.strokeW > 0;
    const on = got.on, off = got.off;
    check("chess: a captured piece keeps its own colour: Black's pawn flies to 'Captured by White' and lies there dark, White's to 'Captured by Black' and lies there light, each outlined as on the board; with 4 players a taken piece shrinks away in its owner's colour",
      !!on.flyW && on.flyW.color === B && !!on.flyB && on.flyB.color === W && trays(on) && !!on.four && on.four.color === BLUE, on);
    check("chess, FX off: nothing flies, and the trays are the same (each piece in its own colour)", off.flyW === null && off.flyB === null && off.four === null && trays(off), off);
    check("chess (captured colours): no page errors", on.errs.length === 0 && off.errs.length === 0, { on: on.errs, off: off.errs });
  }

  // ---- on a phone the 3- and 4-player boards keep their square names (the
  // move list names squares by them), as the 2-player board does
  {
    const c = await lib.newContext(browser, { viewport: { width: 390, height: 664 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const seen = (sel) => [...document.querySelectorAll(sel)].filter((e) => getComputedStyle(e).display !== "none" && e.getBoundingClientRect().width > 0).length;
    const html3 = fs.readFileSync(path.join(lib.ROOT, "games/chess/three.html"), "utf8").replace(HOOK3[0], HOOK3[1]);   // (the 3-player hook, as above)
    const q3 = await lib.open(c, base, "games/chess/three.html", { before: (pg) => pg.route(/\/games\/chess\/three\.html$/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html3 })) });
    const three = await q3.evaluate((seenSrc) => { const seen = eval(seenSrc); __three.start(3); document.getElementById("menu").classList.remove("show");
      return { all: document.querySelectorAll("#boardSvg .lbl").length, shown: seen("#boardSvg .lbl") }; }, "(" + seen.toString() + ")");
    const q4 = await lib.open(c, base, "games/chess/", { before: (pg) => lib.injectScript(pg, "games/chess/game.js", [HOOK2]) });
    const four = await q4.evaluate((seenSrc) => { const seen = eval(seenSrc); __chess.start(4, 2); document.getElementById("menu").classList.remove("show");
      return { all: document.querySelectorAll("#board .coord").length, shown: seen("#board .coord") }; }, "(" + seen.toString() + ")");
    check("chess: on a 390 px phone the 3- and 4-player boards show their square names (every one), as the 2-player board does",
      three.all > 0 && three.shown === three.all && four.all > 0 && four.shown === four.all, { three, four });
    check("chess (phone labels): no page errors", q3.errs.length === 0 && q4.errs.length === 0, [q3.errs, q4.errs]);
    await c.close();
  }

  // ---- how pieces move. A move glides in a straight line at the piece's
  // own size, FX on or off, in the same time. FX on is lively: the piece
  // leaves a short trail of fading copies behind it, and a capture arcs up to
  // its tray; FX off is calm: no trail, and a capture that doesn't fly. A capture's place in its tray is
  // kept empty until it gets there: FX on, it shows only as the flying piece
  // lands on it (in its place, at its size, as itself); FX off, as the move
  // lands. And Undo plays the move back as a move plays: the piece slides
  // back from the square it went to (castling's rook too; a promotion goes
  // back as the piece it became and lands as the pawn), and a piece it took
  // leaves its tray at once and, FX on, flies back out of it to the square
  // it was taken on (with four players it grows back where it fell); FX off
  // it's simply there again. Two undos at once: the first lands, the second
  // plays. On a laptop and a phone. Each motion is read held at points of
  // its run (never after a wait), and the rules are back exactly as they were.
  {
    const { devices } = require("@playwright/test");
    // (in the page) the piece on square i, its centre (and width) as drawn, and
    // as drawn held at a point k (0 to 1) of its animation; every piece's
    // motion run to its end; the game as the rules read it
    const PROBE = () => {
      window.__pc = (i) => document.querySelector('#board .sq[data-i="' + i + '"] .pc');
      window.__mid = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width]; };
      window.__held = (e, k) => { const a = e && e.getAnimations()[0]; if (!a) return null; a.pause(); a.currentTime = a.effect.getTiming().duration * k; return __mid(e); };
      window.__land = () => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.matches(".pc, text.glyph")).forEach((a) => a.finish());
      window.__rules = () => { const G = (window.__chess || window.__three).G; return JSON.stringify([G.board, G.turn, G.castle, G.ep, G.capList, G.halfmove, G.positions, G.sans, G.log, G.over]); };
      window.__until = async (f) => { for (let n = 0; n < 900 && !f(); n++) await new Promise((r) => requestAnimationFrame(r)); return f(); };
      // the page's clock held still while fn runs: a move's renders all start its motion at its start, however busy the machine
      window.__still = (fn) => { const real = performance.now, t = real.call(performance); performance.now = () => t; try { return fn(); } finally { performance.now = real; } };
    };
    const near = (a, b, px) => !!a && !!b && Math.hypot(a[0] - b[0], a[1] - b[1]) <= (px || 2);
    // how far along the way from a to c point b is (0 to 1), and how far off it
    const along = (a, b, c) => { if (!a || !b || !c) return NaN; const dx = c[0] - a[0], dy = c[1] - a[1], L = dx * dx + dy * dy; return L ? ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / L : NaN; };
    const off = (a, b, c) => { if (!a || !b || !c) return NaN; const dx = c[0] - a[0], dy = c[1] - a[1]; return Math.abs((b[0] - a[0]) * dy - (b[1] - a[1]) * dx) / Math.hypot(dx, dy); };
    // slid: drawn at the start where it was, a quarter of the way on part of the way there, and at the end where it is now
    const slid = (from, s0, s25, end) => near(s0, from) && along(from, s25, end) > 0.1 && along(from, s25, end) < 0.95 && !near(end, from, 10);
    const openFx = (c, url, offFx, before) => lib.open(c, base, url, { before: async (pg) => {
      await pg.addInitScript((offFx) => localStorage.setItem("reduceMotion:chess", offFx ? "1" : "0"), offFx);
      await pg.addInitScript(PROBE);
      await before(pg);
    } });
    const hook2 = (pg) => lib.injectScript(pg, "games/chess/game.js", [HOOK2]);
    const html3 = fs.readFileSync(path.join(lib.ROOT, "games/chess/three.html"), "utf8").replace(HOOK3[0], HOOK3[1]);
    const hook3 = (pg) => pg.route(/\/games\/chess\/three\.html$/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8", body: html3 }));

    // the 2-player board (local) and the 4-player cross
    const local = {};
    for (const [size, opts] of [["laptop", {}], ["phone", devices["iPhone 13"]]]) {
      const c = await lib.newContext(browser, opts);
      for (const offFx of [false, true]) {
        const q = await openFx(c, "games/chess/", offFx, hook2);
        const r = await q.evaluate(async () => {
          document.getElementById("menu").classList.remove("show");
          const C = __chess, go = (f, t, pr) => __still(() => C.doMove(C.legalFor(C.G, f).find((m) => m.to === t), pr));
          const undo = () => __still(() => document.getElementById("undoBtn").click());
          const seen = (e) => !!e && getComputedStyle(e).visibility === "visible";
          const slot = () => document.getElementById("capW").lastElementChild, flying = () => document.querySelector(".pc.fly");
          const setup = (pieces, castle, turn) => {
            C.start(2); const G = C.G, b = new Array(64).fill(null);
            for (const [i, o, t] of pieces) b[i] = { o, t, dead: false };
            G.board = b; G.turn = turn || "w"; G.ep = null; G.castle = Object.assign({ wk: false, wq: false, bk: false, bq: false }, castle || {}); C.render();
          };
          const out = {};
          // the way Nf3 goes, and exd5's capture to its tray, held at points of their runs: where, how wide, any tilt
          const pt = (e, k) => { const m = __held(e, k), t = getComputedStyle(e).transform, v = /^matrix\(/.test(t) ? t.slice(7, -1).split(",").map(Number) : [1, 0, 0, 1];
            return { m, tilt: Math.abs(v[1]) + Math.abs(v[2]) }; };
          C.start(2); go(62, 45);
          const nf = __pc(45), na = nf.getAnimations()[0];
          // the trail: its copies and the piece, each held 120 ms into the move (where, how strong, how big, any scale or turn)
          const held = (e, t) => { const a = e.getAnimations()[0]; if (!a) return null; a.pause(); a.currentTime = t;
            const r = e.getBoundingClientRect(), cs = getComputedStyle(e), v = /^matrix\(/.test(cs.transform) ? cs.transform.slice(7, -1).split(",").map(Number) : [1, 0, 0, 1];
            return { m: [r.left + r.width / 2, r.top + r.height / 2], o: +cs.opacity, fs: cs.fontSize, plain: v[0] === 1 && v[3] === 1 && v[1] === 0 && v[2] === 0 }; };
          const copies = [...document.querySelectorAll('#board .sq[data-i="45"] .ghost')];
          out.trail = { n: copies.length, piece: held(nf, 120), copies: copies.map((g) => held(g, 120)) };
          out.path = { dur: na.effect.getTiming().duration, pts: [0, 0.15, 0.3, 0.45, 0.6, 0.8, 0.999].map((k) => pt(nf, k)) };
          na.finish(); out.path.rest = __mid(nf);
          // let the copies run on: gone soon after the piece is down
          copies.forEach((g) => g.getAnimations().forEach((a) => a.play()));
          out.trail.gone = await __until(() => !document.querySelector("#board .ghost"));
          C.start(2); go(52, 36); go(11, 27); __land(); go(36, 27);
          const fp = flying(), fpa = fp && fp.getAnimations()[0];
          out.flyPath = fp ? { dur: fpa.effect.getTiming().duration, pts: [0, 0.25, 0.5, 0.75, 0.999].map((k) => pt(fp, k)) } : null;
          __land(); await __until(() => !flying());
          // exd5 sends Black's pawn to "Captured by White"
          C.start(2); go(52, 36); go(11, 27); __land();
          const before = __rules();
          go(36, 27);
          const f = flying(), fa = f && f.getAnimations()[0];
          out.fly = { flying: !!f, slotSeen: seen(slot()) };
          if (fa) {
            const end = __held(f, 1 - 1e-4);
            Object.assign(out.fly, { end, slot: __mid(slot()), opacity: +getComputedStyle(f).opacity, slotAtEnd: seen(slot()) });
          }
          __land(); await __until(() => !flying() && seen(slot()));
          out.fly.landed = seen(slot());
          // ...and Undo takes it back out of the tray to d5, the pawn sliding back to e4
          const rest = { d5: __mid(__pc(27)), slot: __mid(slot()) };
          undo();
          out.cap = { rest, trayLeft: document.getElementById("capW").children.length, rules: __rules() === before,
            m0: __held(__pc(36), 0), m25: __held(__pc(36), 0.25), c0: __held(__pc(27), 0), c5: __held(__pc(27), 0.5) };
          __land(); out.cap.mEnd = __mid(__pc(36)); out.cap.cEnd = __mid(__pc(27));
          // Undo straight after the capture, while it's still on its way: it comes back from its place in the tray
          go(36, 27);
          const inAir = __mid(slot());
          undo();
          out.midFly = { flies: document.querySelectorAll(".pc.fly").length, trayLeft: document.getElementById("capW").children.length, c0: __held(__pc(27), 0), slot: inAir, rules: __rules() === before };
          __land();
          // a plain move: e4, and back
          C.start(2); go(52, 36); __land();
          const e4 = __mid(__pc(36));
          undo();
          out.plain = { from: e4, m0: __held(__pc(52), 0), m25: __held(__pc(52), 0.25), copies: document.querySelectorAll('#board .sq[data-i="52"] .ghost').length };
          __land(); out.plain.end = __mid(__pc(52));
          // two undos at once (after e4 e5): the first lands, the second plays
          go(52, 36); go(12, 28); __land();
          undo(); undo();
          out.twice = { start: C.G.history.length === 0 && C.G.turn === "w", e2: __pc(52) ? __pc(52).getAnimations().length : -1, e7: __pc(12) ? __pc(12).getAnimations().length : -1, e4: !!__pc(36), e5: !!__pc(28) };
          __land();
          // O-O: the rook slides across too, and Undo slides both back
          setup([[60, "w", "k"], [63, "w", "r"], [4, "b", "k"]], { wk: true });
          const h1 = __mid(__pc(63));
          go(60, 62);
          out.castle = { h1, rook0: __held(__pc(61), 0), copies: [61, 62].map((i) => document.querySelectorAll('#board .sq[data-i="' + i + '"] .ghost').length) };
          __land(); out.castle.f1 = __mid(__pc(61)); out.castle.g1 = __mid(__pc(62));
          undo();
          out.castle.k0 = __held(__pc(60), 0); out.castle.r0 = __held(__pc(63), 0);
          __land();
          // a8=Q taken back: a queen goes back, and lands as the pawn
          setup([[60, "w", "k"], [23, "b", "k"], [8, "w", "p"]]);
          go(8, 0, "q"); __land();
          undo();
          out.promo = { as: __pc(8) && __pc(8).textContent, moving: __pc(8) ? __pc(8).getAnimations().length : 0 };
          __land(); await __until(() => __pc(8) && __pc(8).textContent !== "♛");
          out.promo.lands = __pc(8) && __pc(8).textContent;
          // en passant (d5 exd6) taken back: the pawn it took comes back to d5, the square it was taken on
          setup([[60, "w", "k"], [4, "b", "k"], [28, "w", "p"], [11, "b", "p"]], null, "b");
          go(11, 27); go(28, 19); __land(); await __until(() => !flying());
          const ep = { slot: __mid(slot()), d6: __mid(__pc(19)) };
          undo();
          Object.assign(ep, { d6empty: !__pc(19), trayLeft: document.getElementById("capW").children.length, m0: __held(__pc(28), 0), c0: __held(__pc(27), 0) });
          __land(); ep.cEnd = __mid(__pc(27));
          out.ep = ep;
          // a click while a one-move undo plays back lands it at once, then counts (it picks up the pawn back on e4)
          C.start(2); go(52, 36); go(11, 27); go(36, 27); __land(); await __until(() => !flying());
          undo();
          document.querySelector('#board .sq[data-i="36"]').dispatchEvent(new MouseEvent("click"));
          out.clickOne = { moving: document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.matches(".pc")).length, sel: C.G.sel, d5: !!__pc(27), e4: !!__pc(36) };
          // 4 players: Red's rook takes a blue knight, and Undo
          C.start(4, 3);
          const G4 = C.G, b4 = G4.board.map(() => null), at = (r, c) => r * 14 + c;
          b4[at(13, 7)] = { o: "r", t: "k", dead: false }; b4[at(0, 7)] = { o: "y", t: "k", dead: false }; b4[at(7, 13)] = { o: "g", t: "k", dead: false }; b4[at(3, 0)] = { o: "b", t: "k", dead: false };
          b4[at(7, 5)] = { o: "r", t: "r", dead: false }; b4[at(7, 3)] = { o: "b", t: "n", dead: false };
          G4.board = b4; G4.turn = "r"; C.render();
          const before4 = __rules();
          go(at(7, 5), at(7, 3));
          const copies4 = document.querySelectorAll('#board .sq[data-i="' + at(7, 3) + '"] .ghost').length;
          __land(); await __until(() => !flying());
          const rook = __mid(__pc(at(7, 3)));
          undo();
          const kn = __pc(at(7, 3)), ka = kn && kn.getAnimations()[0];
          out.four = { copies: copies4, rook, rules: __rules() === before4, knight: !!kn && kn.textContent === "♞", grows: !!ka && Object.keys(ka.effect.getKeyframes()[0]).includes("opacity"),
            m0: __held(__pc(at(7, 5)), 0), m25: __held(__pc(at(7, 5)), 0.25) };
          __land(); out.four.end = __mid(__pc(at(7, 5)));
          C.start(2);
          return out;
        });
        // paused while an undo plays it back: nothing is left in the air, and resumed, the board is as the game is
        const paused = await q.evaluate(async () => {
          const C = __chess, go = (f, t) => C.doMove(C.legalFor(C.G, f).find((m) => m.to === t));
          C.start(2); go(52, 36); go(11, 27); go(36, 27); __land(); await __until(() => !document.querySelector(".pc.fly"));
          document.getElementById("undoBtn").click();
          document.querySelector(".gs-pause-btn").click();
          const card = !document.querySelector(".gs-pause:not(.gs-dialog)").hidden;
          document.querySelector(".gs-pause:not(.gs-dialog) button").click();
          const moving = document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.matches(".pc")).length;
          return { card, moving, flies: document.querySelectorAll(".pc.fly").length, d5: !!__pc(27) && getComputedStyle(__pc(27)).visibility === "visible", e4: !!__pc(36), tray: document.getElementById("capW").children.length };
        });
        local[size + (offFx ? " off" : " on")] = Object.assign(r, { paused, errs: q.errs });
        await q.close();
      }
      await c.close();
    }
    const sizes = ["laptop on", "laptop off", "phone on", "phone off"];
    // a move: every point on the straight line from where it set off to where it lands, at its own width, untilted, over several frames
    const moved = (g) => {
      const P = g.path, a = P.pts[0].m, c = P.rest, wide = P.pts.map((q) => q.m[2] / c[2]), offs = P.pts.map((q) => off(a, q.m, c));
      return P.dur >= 150 && !near(a, c, 30) && P.pts.every((q) => q.tilt < 1e-6) && offs.every((d) => d < 1) && wide.every((w) => Math.abs(w - 1) < 0.01);
    };
    // the trail: three copies behind the piece on its way, on its line, each further back and fainter, at its size, unscaled, gone after
    const trailed = (g) => {
      const T = g.trail, a = g.path.pts[0].m, c = g.path.rest;
      return !!T && T.n === 3 && !!T.piece && T.copies.every((q, i) => !!q && q.plain && q.fs === T.piece.fs && off(a, q.m, c) < 1.5 && q.o > 0 && q.o < 0.5 &&
        along(a, q.m, c) < along(a, T.piece.m, c) - 0.02 && (i === 0 || (along(a, q.m, c) < along(a, T.copies[i - 1].m, c) && q.o < T.copies[i - 1].o))) && T.gone;
    };
    // halfway between two points; a capture flying to the tray (FX on): arcing up, well above halfway at half its time, whichever way the tray lies
    const half = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    const flew = (g) => {
      const F = g.flyPath; if (!F) return false;
      const a = F.pts[0].m, c = F.pts[F.pts.length - 1].m;
      return F.dur >= 150 && F.pts.every((q) => q.tilt < 1e-6) && half(a, c)[1] - F.pts[2].m[1] > 10;
    };
    check("chess, FX off: the calm way: a move glides in a straight line at the piece's own size over several frames, with no trail (castling's rook, an undo and 4 players too), and a capture doesn't fly (laptop and phone)",
      ["laptop off", "phone off"].every((k) => { const g = local[k]; return moved(g) && g.trail.n === 0 && g.castle.copies.join() === "0,0" && g.plain.copies === 0 && g.four.copies === 0 && g.flyPath === null; }),
      { laptop: { path: local["laptop off"].path, fly: local["laptop off"].flyPath }, phone: { path: local["phone off"].path, fly: local["phone off"].flyPath } });
    check("chess, FX on: the lively way: a move glides at the piece's own size (no lift) and leaves a trail, three copies following it along its line, each further back and fainter, gone after it lands; castling's rook, an undo and 4 players too; a capture arcs up to its tray (laptop and phone)",
      ["laptop on", "phone on"].every((k) => { const g = local[k]; return moved(g) && trailed(g) && g.castle.copies.join() === "3,3" && g.plain.copies === 3 && g.four.copies === 3 && flew(g); }),
      { laptop: { path: local["laptop on"].path, trail: local["laptop on"].trail, castle: local["laptop on"].castle.copies, undo: local["laptop on"].plain.copies, four: local["laptop on"].four.copies, fly: local["laptop on"].flyPath },
        phone: { path: local["phone on"].path, trail: local["phone on"].trail, fly: local["phone on"].flyPath } });
    check("chess: FX on or off, a move takes the same time (the pace of play is the same)",
      ["laptop", "phone"].every((s) => local[s + " on"].path.dur === local[s + " off"].path.dur), ["laptop", "phone"].map((s) => [local[s + " on"].path.dur, local[s + " off"].path.dur]));
    const lands = (g) => g.fly.flying && !g.fly.slotSeen && !g.fly.slotAtEnd && near(g.fly.end, g.fly.slot, 3) && Math.abs(g.fly.end[2] / g.fly.slot[2] - 1) < 0.15 && g.fly.opacity === 1 && g.fly.landed;
    check("chess, FX on: a captured piece's place in its tray stays empty while it flies there, and it shows as the flying piece lands on it (in its place, at its size, as itself; laptop and phone)",
      lands(local["laptop on"]) && lands(local["phone on"]), { laptop: local["laptop on"].fly, phone: local["phone on"].fly });
    const plain = (g) => !g.fly.flying && !g.fly.slotSeen && g.fly.landed;
    check("chess, FX off: nothing flies, and the captured piece shows in its tray as the move lands, not before (laptop and phone)",
      plain(local["laptop off"]) && plain(local["phone off"]), { laptop: local["laptop off"].fly, phone: local["phone off"].fly });
    check("chess: Undo slides the piece back from the square it went to, FX on or off (e4 and back; laptop and phone)",
      sizes.every((k) => slid(local[k].plain.from, local[k].plain.m0, local[k].plain.m25, local[k].plain.end)), Object.fromEntries(sizes.map((k) => [k, local[k].plain])));
    const capBack = (g, fxOn) => g.cap.rules && g.cap.trayLeft === 0 && slid(g.cap.rest.d5, g.cap.m0, g.cap.m25, g.cap.mEnd) && near(g.cap.cEnd, g.cap.rest.d5) &&
      (fxOn ? near(g.cap.c0, g.cap.rest.slot, 3) && Math.abs(g.cap.c0[2] / g.cap.rest.slot[2] - 1) < 0.15 && !near(g.cap.c5, g.cap.rest.slot, 10) && !near(g.cap.c5, g.cap.cEnd, 10) &&
        half(g.cap.rest.slot, g.cap.cEnd)[1] - g.cap.c5[1] > 10 : g.cap.c0 === null);
    check("chess: Undo of a capture (exd5) takes the pawn out of the tray at once and slides White's back; FX on, Black's flies back out of its place in the tray to d5 in an arc, FX off it's there again at once (laptop and phone)",
      capBack(local["laptop on"], true) && capBack(local["phone on"], true) && capBack(local["laptop off"], false) && capBack(local["phone off"], false), Object.fromEntries(sizes.map((k) => [k, local[k].cap])));
    check("chess: Undo straight after a capture, before it's in its tray, leaves nothing in the air or in the tray; FX on it comes back from its place there, FX off it's on its square again at once",
      sizes.every((k) => { const g = local[k].midFly; return g.flies === 0 && g.trayLeft === 0 && g.rules && (/off/.test(k) ? g.c0 === null : near(g.c0, g.slot, 3)); }), Object.fromEntries(sizes.map((k) => [k, local[k].midFly])));
    check("chess: two undos at once (after e4 e5) take both back: the first lands at once, the second plays (e2's pawn slides back, e7's is still)",
      sizes.every((k) => local[k].twice.start && local[k].twice.e2 === 1 && local[k].twice.e7 === 0 && !local[k].twice.e4 && !local[k].twice.e5), Object.fromEntries(sizes.map((k) => [k, local[k].twice])));
    check("chess: castling slides the rook across with the king, and Undo slides both back (O-O; FX on or off)",
      sizes.every((k) => { const g = local[k].castle; return near(g.rook0, g.h1) && near(g.k0, g.g1) && near(g.r0, g.f1); }), Object.fromEntries(sizes.map((k) => [k, local[k].castle])));
    check("chess: Undo of a8=Q slides a queen back, which lands as the pawn (FX on or off)",
      sizes.every((k) => local[k].promo.as === "♛" && local[k].promo.moving === 1 && local[k].promo.lands === "♟︎"), Object.fromEntries(sizes.map((k) => [k, local[k].promo])));
    const epBack = (g, fxOn) => g.d6empty && g.trayLeft === 0 && near(g.m0, g.d6) && !!g.cEnd && (fxOn ? near(g.c0, g.slot, 3) : g.c0 === null);
    check("chess: Undo of en passant (d5 exd6) slides the pawn back from d6 and brings Black's pawn back to d5, the square it was taken on: out of the tray with FX on, there at once with FX off",
      sizes.every((k) => epBack(local[k].ep, !/off/.test(k))), Object.fromEntries(sizes.map((k) => [k, local[k].ep])));
    const fourBack = (g, fxOn) => g.rules && g.knight && g.grows === fxOn && slid(g.rook, g.m0, g.m25, g.end);
    check("chess 4 players: Undo of a capture slides the rook back; FX on the knight it took grows back where it fell, FX off it's there again at once",
      fourBack(local["laptop on"].four, true) && fourBack(local["phone on"].four, true) && fourBack(local["laptop off"].four, false) && fourBack(local["phone off"].four, false), Object.fromEntries(sizes.map((k) => [k, local[k].four])));
    check("chess: a click while an undo plays it back lands it at once, then counts (exd5 taken back, a click on e4 picks the pawn up there)",
      sizes.every((k) => { const g = local[k].clickOne; return g.moving === 0 && g.sel === 36 && g.d5 && g.e4; }), Object.fromEntries(sizes.map((k) => [k, local[k].clickOne])));
    check("chess: a pause while an undo plays it back leaves nothing in the air, and resumed the board is the game's (both pawns back, on e4 and d5, the tray empty)",
      sizes.every((k) => { const g = local[k].paused; return g.card && g.moving === 0 && g.flies === 0 && g.d5 && g.e4 && g.tray === 0; }), Object.fromEntries(sizes.map((k) => [k, local[k].paused])));
    check("chess (tray and undo motion): no page errors", sizes.every((k) => local[k].errs.length === 0), Object.fromEntries(sizes.map((k) => [k, local[k].errs])));

    // vs CPU, Undo takes back the CPU's reply and your move: played back in
    // order, the reply first (the board showing the position between them),
    // then yours; the rules are back at the start at once. A click while the
    // reply goes back lands it all at once, and then counts.
    const cpu = {};
    for (const offFx of [false, true]) {
      const q = await openFx(ctx, "games/chess/", offFx, hook2);
      const e4 = () => q.evaluate(() => { const C = __chess; C.doMove(C.legalFor(C.G, 52).find((x) => x.to === 36)); });
      const reply = () => q.waitForFunction(() => __chess.G.history.length === 2 && !__chess.G.over, null, { timeout: 20000 }).then(() => true, () => false);
      await q.evaluate(() => { document.getElementById("menu").classList.remove("show"); __chess.start(2, null, { opponent: "cpu", difficulty: "easy", side: "w", base: 0, inc: 0 }); });
      await e4();
      const replied = await reply();
      const two = await q.evaluate(async () => {
        const C = __chess, mv = C.G.last;
        __land();
        const rest = { cpu: __mid(__pc(mv.to)), mine: __mid(__pc(36)) };
        // each redraw of the board, as it happens
        const draws = [];
        new MutationObserver(() => draws.push({ e2: !!__pc(52), e4: !!__pc(36), e2at: __pc(52) && __held(__pc(52), 0) })).observe(document.getElementById("board"), { childList: true });
        document.getElementById("undoBtn").click();
        const G = C.G;
        const first = { rules: G.history.length === 0 && G.turn === "w" && !!G.board[52] && !G.board[36] && !!G.board[mv.from] && !G.board[mv.to],
          e2: !!__pc(52), e4: !!__pc(36), cpuFrom: !!__pc(mv.from), cpuTo: !!__pc(mv.to), cpu0: __held(__pc(mv.from), 0) };
        await __until(() => draws.some((d) => d.e2));
        __land();
        return { mv, rest, first, second: draws.find((d) => d.e2) || null, end: { e2: !!__pc(52), e4: !!__pc(36), cpuFrom: !!__pc(mv.from), cpuTo: !!__pc(mv.to) } };
      });
      // again, with a click on e2 while the reply goes back
      await e4();
      const replied2 = await reply();
      const click = await q.evaluate(async () => {
        const C = __chess, mv = C.G.last;
        __land();
        document.getElementById("undoBtn").click();
        const mid = { e4: !!__pc(36), e2: !!__pc(52) };
        // e2, empty as drawn just then, where the game has the pawn back
        document.querySelector('#board .sq[data-i="52"]').dispatchEvent(new MouseEvent("click"));
        const now = { moving: document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.matches(".pc")).length,
          e2: !!__pc(52), e4: !!__pc(36), cpuFrom: !!__pc(mv.from), cpuTo: !!__pc(mv.to), sel: C.G.sel, history: C.G.history.length };
        // and nothing comes after it: no redraw, by the page's own clock, past the longest step a playback has
        let redraws = 0;
        new MutationObserver(() => redraws++).observe(document.getElementById("board"), { childList: true });
        await new Promise((r) => setTimeout(r, 600));
        return { mid, now, redraws, still: { sel: document.querySelectorAll("#board .sq.sel").length, e2: !!__pc(52), e4: !!__pc(36) } };
      });
      cpu[offFx ? "off" : "on"] = { replied, replied2, two, click, errs: q.errs };
      await q.close();
    }
    const order = (g) => g.replied && g.two.first.rules && g.two.first.e4 && !g.two.first.e2 && g.two.first.cpuFrom && !g.two.first.cpuTo && near(g.two.first.cpu0, g.two.rest.cpu) &&
      !!g.two.second && near(g.two.second.e2at, g.two.rest.mine) && g.two.end.e2 && !g.two.end.e4 && g.two.end.cpuFrom && !g.two.end.cpuTo;
    check("chess vs CPU: Undo plays back the CPU's reply first (your pawn still on e4 meanwhile), then your e4, each piece sliding back from where it went (FX on or off); the game is back at the start at once",
      order(cpu.on) && order(cpu.off), { on: cpu.on.two, off: cpu.off.two, replied: [cpu.on.replied, cpu.off.replied] });
    const clicked = (g) => g.replied2 && g.click.mid.e4 && !g.click.mid.e2 && g.click.now.moving === 0 && g.click.now.e2 && !g.click.now.e4 && g.click.now.cpuFrom && !g.click.now.cpuTo &&
      g.click.now.sel === 52 && g.click.now.history === 0 && g.click.redraws === 0 && g.click.still.sel === 1 && g.click.still.e2 && !g.click.still.e4;
    check("chess vs CPU: a click while the reply goes back lands the playback at once, then counts (it picks the pawn back on e2), and nothing plays after it",
      clicked(cpu.on) && clicked(cpu.off), { on: cpu.on.click, off: cpu.off.click });
    check("chess (undo vs CPU): no page errors", cpu.on.errs.length === 0 && cpu.off.errs.length === 0, { on: cpu.on.errs, off: cpu.off.errs });

    // the 3-player board: Undo slides the piece back too, and FX on a piece it took grows back where it fell
    const three = {};
    for (const [label, c, offFx] of [["laptop on", ctx, false], ["laptop off", ctx, true], ["phone on", null, false]]) {
      const cc = c || await lib.newContext(browser, devices["iPhone 13"]);
      const q = await openFx(cc, "games/chess/three.html", offFx, hook3);
      three[label] = await q.evaluate(() => {
        const T = __three; document.getElementById("menu").classList.remove("show");
        // the piece drawn on a cell (its glyph sits at the cell's centroid, the mean of its corners; the
        // last there, as a captured piece's falling copy goes under the one that took it)
        const at = (cell) => {
          const pts = document.querySelector('polygon.cell[data-c="' + cell + '"]').getAttribute("points").split(" ").map((p) => p.split(",").map(Number));
          const x = pts.reduce((s, p) => s + p[0], 0) / 4, y = pts.reduce((s, p) => s + p[1], 0) / 4;
          return [...document.querySelectorAll("#boardSvg text.glyph")].filter((t) => Math.abs(+t.getAttribute("x") - x) < 0.6 && Math.abs(+t.getAttribute("y") - y) < 0.6).pop() || null;
        };
        const play = (a, b) => __still(() => T.doMove(T.legalFor(a).find((m) => m.to === b)));
        const undo = () => __still(() => document.getElementById("undoBtn").click());
        const out = {};
        T.start(3);
        const e2 = T.cid(0, 2, 4), e4 = T.cid(0, 0, 4);
        play(e2, e4);
        const ma = at(e4) && at(e4).getAnimations()[0];
        out.frames = ma ? ma.effect.getKeyframes().map((k) => k.transform || "") : null;
        out.copies = document.querySelectorAll("#boardSvg text.ghost").length;
        __land();
        const from = __mid(at(e4));
        undo();
        out.plain = { from, m0: __held(at(e2), 0), m25: __held(at(e2), 0.25) };
        __land(); out.plain.end = __mid(at(e2));
        // Red's rook takes a white knight up its file, and Undo
        T.start(1);
        const pc = (o, t) => ({ o, t, dead: false }), b = new Array(96).fill(null);
        b[T.cid(0, 3, 4)] = pc("r", "k"); b[T.cid(1, 3, 4)] = pc("w", "k"); b[T.cid(2, 3, 4)] = pc("k", "k");
        b[T.cid(0, 3, 0)] = pc("r", "r"); b[T.cid(0, 0, 0)] = pc("w", "n");
        T.G.board = b; T.G.turn = "r";
        const before = __rules();
        play(T.cid(0, 3, 0), T.cid(0, 0, 0)); __land();
        const rook = __mid(at(T.cid(0, 0, 0)));
        undo();
        const kn = at(T.cid(0, 0, 0)), ka = kn && kn.getAnimations()[0];
        out.cap = { rook, rules: __rules() === before, knight: !!kn && kn.textContent === "♞", grows: !!ka && Object.keys(ka.effect.getKeyframes()[0]).includes("opacity"),
          m0: __held(at(T.cid(0, 3, 0)), 0), m25: __held(at(T.cid(0, 3, 0)), 0.25) };
        __land(); out.cap.end = __mid(at(T.cid(0, 3, 0)));
        // a click while the undo plays back lands it at once, then counts (on the rook: it's picked up)
        play(T.cid(0, 3, 0), T.cid(0, 0, 0)); __land();
        undo();
        document.querySelector('polygon.cell[data-c="' + T.cid(0, 3, 0) + '"]').dispatchEvent(new MouseEvent("click"));
        out.click = { moving: document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.matches("text.glyph")).length, sel: T.G.sel === T.cid(0, 3, 0) };
        return out;
      });
      three[label].errs = q.errs;
      await q.close();
      if (!c) await cc.close();
    }
    const t3 = Object.keys(three);
    check("chess three: Undo slides the piece back from the cell it went to, FX on or off (e2-e4 and back; laptop and phone)",
      t3.every((k) => slid(three[k].plain.from, three[k].plain.m0, three[k].plain.m25, three[k].plain.end)), Object.fromEntries(t3.map((k) => [k, three[k].plain])));
    check("chess three: Undo of a capture slides the rook back; FX on the knight it took grows back where it fell, FX off it's there again at once",
      t3.every((k) => { const g = three[k].cap; return g.rules && g.knight && g.grows === !/off/.test(k) && slid(g.rook, g.m0, g.m25, g.end); }), Object.fromEntries(t3.map((k) => [k, three[k].cap])));
    check("chess three: a click while an undo plays back lands it at once, then counts (it picks up the rook)", t3.every((k) => three[k].click.moving === 0 && three[k].click.sel), Object.fromEntries(t3.map((k) => [k, three[k].click])));
    check("chess three: a move glides plainly (straight, at its own size: two keyframes, no scale or turn); FX on it leaves a trail of three copies, FX off none",
      t3.every((k) => { const f = three[k].frames; return !!f && f.length === 2 && !f.some((t) => /scale|rotate/.test(t)) && three[k].copies === (/off/.test(k) ? 0 : 3); }),
      Object.fromEntries(t3.map((k) => [k, { frames: three[k].frames, copies: three[k].copies }])));
    check("chess three (undo motion): no page errors", t3.every((k) => three[k].errs.length === 0), Object.fromEntries(t3.map((k) => [k, three[k].errs])));

    // the 3-player page shares the log's look (cafe.css): its list fills the whole panel too before it scrolls
    const fill3 = {};
    for (const [label, opts] of [["1366x657", { viewport: { width: 1366, height: 657 } }], ["390", devices["iPhone 13"]]]) {
      const c = await lib.newContext(browser, opts);
      const q = await lib.open(c, base, "games/chess/three.html", { before: hook3 });
      fill3[label] = await q.evaluate(() => {
        const T = __three; T.start(3); document.getElementById("menu").classList.remove("show");
        T.G.log = Array.from({ length: 150 }, (_, k) => ({ col: ["r", "w", "k"][k % 3], text: "e2-e4" }));
        document.querySelector('polygon.cell[data-c="' + T.cid(0, 1, 0) + '"]').dispatchEvent(new MouseEvent("click"));   // (an empty cell: a redraw)
        const log = document.getElementById("moveLog"), lb = document.getElementById("logBox"), l = log.getBoundingClientRect(), b = lb.getBoundingClientRect();
        return { gap: Math.round(b.bottom - parseFloat(getComputedStyle(lb).paddingBottom) - l.bottom), scrolls: log.scrollHeight > log.clientHeight + 10 };
      });
      fill3[label].errs = q.errs;
      await c.close();
    }
    check("chess three: the move log's list fills its whole panel before it scrolls, as on the 2-player board (1366 x 657 and a 390 px phone)",
      Object.values(fill3).every((g) => g.gap <= 2 && g.scrolls && g.errs.length === 0), fill3);
  }

  // ---- the move log names the opening a 2-player game is in (openings.js),
  // under its heading: the latest position that is a named opening, however
  // the moves got there, a deeper one naming it more closely, and the name
  // kept once the game leaves them. Undo takes a name back with its move; a
  // pause hides it with the log; an offbeat start names nothing; the 3- and
  // 4-player boards have none.
  {
    const q = await lib.open(ctx, base, "games/chess/", { before: (pg) => lib.injectScript(pg, "games/chess/game.js", [HOOK2]) });
    const named = await q.evaluate(() => {
      document.getElementById("menu").classList.remove("show");
      const C = __chess;
      const shown = () => { const e = document.getElementById("logOpening"); return e && !e.hidden ? e.textContent : null; };
      // a fresh game, played through moves written as the log writes them; the name it shows
      const line = (moves) => {
        C.start(2);
        for (const tok of moves.split(" ")) {
          let m = null;
          for (let i = 0; i < 64 && !m; i++) m = C.legalFor(C.G, i).find((x) => C.sanOf(x, "q") === tok) || null;
          if (!m) return "no move " + tok;
          C.doMove(m, "q");
        }
        return shown();
      };
      const out = {};
      const lines = { london: "d4 d5 Bf4 Nf6 e3 e6 Nf3 c5 c3", ruy: "e4 e5 Nf3 Nc6 Bb5", morphy: "e4 e5 Nf3 Nc6 Bb5 a6", qgd: "d4 d5 c4 e6", qga: "d4 d5 c4 dxc4",
        sicilian: "e4 c5", najdorf: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6", italian: "e4 e5 Nf3 Nc6 Bc4", french: "e4 e6 d4 d5", caro: "e4 c6 d4 d5",
        kid: "d4 Nf6 c4 g6 Nc3 Bg7", kidNormal: "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6", viaEnglish: "c4 e6 d4 d5", viaNd2: "e4 c6 d4 d5 Nd2 dxe4 Nxe4 Bf5",
        offbeat: "a4 h5 h4 a5", oneMove: "e4" };
      for (const [k, moves] of Object.entries(lines)) out[k] = line(moves);
      // Undo, a move at a time from the Ruy Lopez back to the start
      line("e4 e5 Nf3 Nc6 Bb5");
      const undo = () => { document.getElementById("undoBtn").click(); return shown(); };
      out.undo = [shown(), undo(), undo(), undo(), undo()];
      // a pause hides it, as the log
      line("e4 c5");
      document.querySelector(".gs-pause-btn").click();
      const seen = () => { const e = document.getElementById("logOpening"); return e ? getComputedStyle(e).visibility : null; };
      out.paused = seen();
      document.querySelector(".gs-pause:not(.gs-dialog) button").click();
      out.resumed = seen();
      // 4 players: a move, and no name
      C.start(4, 2); document.getElementById("menu").classList.remove("show");
      const at = (r, c) => r * 14 + c, m4 = C.legalFor(C.G, at(12, 7)).find((x) => x.to === at(10, 7));
      if (m4) C.doMove(m4);
      out.four = { moved: !!m4, name: shown() };
      C.start(2);
      return out;
    });
    const want = { london: "London System", ruy: "Ruy Lopez", morphy: "Ruy Lopez: Morphy Defence", qgd: "Queen's Gambit Declined", qga: "Queen's Gambit Accepted",
      sicilian: "Sicilian Defence", najdorf: "Sicilian Defence: Najdorf Variation", italian: "Italian Game", french: "French Defence", caro: "Caro-Kann Defence",
      kid: "King's Indian Defence", kidNormal: "King's Indian Defence: Normal Variation" };
    check("chess log: known lines name their opening under the heading (London System, kept as the game leaves it; Ruy Lopez and its Morphy Defence; Queen's Gambit Declined and Accepted; Sicilian and its Najdorf; Italian; French; Caro-Kann; King's Indian and its Normal Variation)",
      Object.entries(want).every(([k, v]) => named[k] === v), Object.fromEntries(Object.keys(want).map((k) => [k, named[k]])));
    check("chess log: a position reached by another order of moves is named too (1. c4 e6 2. d4 d5 is the Queen's Gambit Declined; the Caro-Kann's Classical Variation by 3. Nd2)",
      named.viaEnglish === "Queen's Gambit Declined" && named.viaNd2 === "Caro-Kann Defence: Classical Variation", { viaEnglish: named.viaEnglish, viaNd2: named.viaNd2 });
    check("chess log: an offbeat start (1. a4 h5 2. h4 a5), or 1. e4 alone, names nothing", named.offbeat === null && named.oneMove === null, { offbeat: named.offbeat, oneMove: named.oneMove });
    check("chess log: Undo takes a name back with the move that brought it (Ruy Lopez, then King's Knight Opening, again, King's Pawn Game, none)",
      JSON.stringify(named.undo) === JSON.stringify(["Ruy Lopez", "King's Knight Opening", "King's Knight Opening", "King's Pawn Game", null]), named.undo);
    check("chess log: a pause hides the opening's name with the log; the 4-player board names none",
      named.paused === "hidden" && named.resumed === "visible" && named.four.moved && named.four.name === null, { paused: named.paused, resumed: named.resumed, four: named.four });
    check("chess (openings): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }

  // ---- Undo takes back only your own moves. Playing Black against the CPU,
  // its opening move can't be undone (the button and its key do nothing, and
  // the button shows it), so nothing gets stuck: its move stands, you still
  // move Black, and it replies. On a fresh board (2 and 3 players) Undo shows
  // as unavailable too, and comes back once there's a move to take back.
  {
    const q = await lib.open(ctx, base, "games/chess/", { before: (pg) => lib.injectScript(pg, "games/chess/game.js", [HOOK2]) });
    const look = () => q.evaluate(() => { const u = document.getElementById("undoBtn"); return { off: u.disabled, faded: parseFloat(getComputedStyle(u).opacity) < 0.6 }; });
    await q.evaluate(() => { document.getElementById("menu").classList.remove("show"); __chess.start(2, null, { opponent: "cpu", difficulty: "easy", side: "b", base: 0, inc: 0 }); });
    const opened = await q.waitForFunction(() => __chess.G.history.length === 1 && __chess.G.turn === "b", null, { timeout: 20000 }).then(() => true, () => false);
    const cpuMove = await q.evaluate(() => __chess.G.last);
    const before = await look();
    await q.evaluate(() => document.getElementById("undoBtn").click());
    await q.keyboard.press("u");
    // (by the page's own clock, past anything an undo could have set going: a playback, a CPU's think)
    await q.evaluate(() => new Promise((r) => setTimeout(r, 600)));
    const after = await q.evaluate(() => ({ moves: __chess.G.history.length, turn: __chess.G.turn, last: __chess.G.last,
      thinking: /thinking/.test(document.getElementById("status").textContent), dlg: !!document.querySelector(".gs-dialog") }));
    // Black's e7-e5, by clicks, and the CPU replies
    await q.click('.sq[data-i="12"]'); await q.click('.sq[data-i="28"]');
    const replied = await q.waitForFunction(() => __chess.G.history.length === 3 && __chess.G.turn === "b", null, { timeout: 20000 }).then(() => true, () => false);
    const mine = await look();
    check("chess vs CPU, playing Black: Undo can't take back the CPU's opening move (button and key do nothing, the button faded), so its move stands, you still move Black and it replies",
      opened && before.off && before.faded && after.moves === 1 && after.turn === "b" && JSON.stringify(after.last) === JSON.stringify(cpuMove) && !after.thinking && !after.dlg &&
      replied && !mine.off && !mine.faded, { opened, cpuMove, before, after, replied, mine });
    // a fresh local board, then a move on it
    const fresh = await q.evaluate(() => { __chess.start(2, null, { opponent: "local", difficulty: "easy", side: "w", base: 0, inc: 0 }); const u = document.getElementById("undoBtn"), off = u.disabled; const C = __chess; C.doMove(C.legalFor(C.G, 52).find((x) => x.to === 36)); return { off, then: u.disabled }; });
    check("chess (undo): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    const t = await lib.open(ctx, base, "games/chess/three.html", { before: (pg) => pg.route(/\/games\/chess\/three\.html$/, (r) => r.fulfill({ contentType: "text/html; charset=utf-8",
      body: fs.readFileSync(path.join(lib.ROOT, "games/chess/three.html"), "utf8").replace(HOOK3[0], HOOK3[1]) })) });
    const three = await t.evaluate(() => {
      const T = __three; T.start(3); document.getElementById("menu").classList.remove("show");
      const u = document.getElementById("undoBtn"), off = u.disabled;
      for (let c = 0; c < 96; c++) { const ms = T.legalFor(c); if (ms.length) { T.doMove(ms[0]); break; } }
      return { off, then: u.disabled };
    });
    check("chess: on a fresh board Undo shows as unavailable, and is there again after a move (2 and 3 players)", fresh.off && !fresh.then && three.off && !three.then, { fresh, three });
    check("chess three (undo): no page errors", t.errs.length === 0, t.errs);
    await t.close();
  }
  await ctx.close();
};
