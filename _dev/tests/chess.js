// Chess: in 3-player chess every piece gives check (not just pawns), so a
// piece can mate; in 2-player chess stalemate and a bare-king ending are
// draws; a new game or a game that ends closes the promotion picker. P
// pauses a game on every board, the pieces hidden while it is paused, the
// clocks stopped and a CPU's thinking held.
const fs = require("fs");
const path = require("path");

const HOOK2 = ["start(2);  // build a board behind the menu",
  "start(2);  // build a board behind the menu\n  window.__chess = { get G() { return G; }, doMove: doMove, legalFor: legalFor, start: start, render: render };"];
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
        return { opera, empty, full: page(), vw: innerWidth, log: parts[0], board: parts[1], side: parts[2],
          scrolls: log.scrollHeight > log.clientHeight + 10, lastIn: !!last && last.bottom <= lv.bottom + 1 && last.top >= lv.top - 1 };
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
  await ctx.close();
};
