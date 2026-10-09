// Chess: in 3-player chess every piece gives check (not just pawns), so a
// piece can mate; in 2-player chess stalemate and a bare-king ending are
// draws; a new game or a game that ends closes the promotion picker.
const fs = require("fs");
const path = require("path");

const HOOK2 = ["start(2);  // build a board behind the menu",
  "start(2);  // build a board behind the menu\n  window.__chess = { get G() { return G; }, doMove: doMove, legalFor: legalFor, start: start, render: render };"];
const HOOK3 = ["start(3); // build board behind menu (default frozen-pieces rule)",
  "start(3); // build board behind menu (default frozen-pieces rule)\n  window.__three = { get G() { return G; }, cid: cid, genMoves: genMoves, legalFor: legalFor, inCheck: inCheck, doMove: doMove, start: start };"];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const over = (p) => p.evaluate(() => document.getElementById("overOverlay").classList.contains("show") ? document.getElementById("overTitle").textContent + " | " + document.getElementById("overMsg").textContent : null);

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
    await p.waitForTimeout(450);
    const mate = await over(p);
    check("chess three: a knight's smothered mate ends the game (first checkmate wins)", !!before && /^Black wins!/.test(mate || ""), { before, mate });
    await p.evaluate(() => document.getElementById("overOverlay").classList.remove("show"));
    await mateIt(true);
    await p.waitForTimeout(450);
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
    await p.keyboard.press("Escape"); await p.waitForTimeout(100);
    check("chess three: mid-game the 2 / 4 Player link asks 'Leave this game?' and stays put on Esc", linkAsk.dlg === "Leave this game?" && linkAsk.here, linkAsk);
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
  await p.waitForTimeout(450);
  const so = await over(p);
  check("chess: stalemate in 2-player chess is a draw (not another move for White)", s.over === true && /^Draw \| Stalemate/.test(so || ""), { s, so });
  // Undo straight after the end, inside the end card's 350ms: the card stays away
  await p.evaluate(() => { __chess.start(2); document.getElementById("overOverlay").classList.remove("show"); });
  await play(p, [[0, "b", "k"], [60, "w", "k"], [58, "w", "q"]], [58, 10]);
  await p.evaluate(() => document.getElementById("undoBtn").click());
  await p.waitForTimeout(450);
  const undone = await over(p);
  check("chess: Undo straight after a game ends doesn't bring the end card back over the game", undone === null, undone);

  // Ke1 takes the last black piece: king against king
  await p.evaluate(() => __chess.start(2)); await p.evaluate(() => document.getElementById("overOverlay").classList.remove("show"));
  const kk = await play(p, [[4, "b", "k"], [60, "w", "k"], [51, "b", "n"]], [60, 51]);
  await p.waitForTimeout(450);
  const kko = await over(p);
  // Ng1xh3: king and knight against king
  await p.evaluate(() => { __chess.start(2); document.getElementById("overOverlay").classList.remove("show"); });
  const kn = await play(p, [[4, "b", "k"], [60, "w", "k"], [62, "w", "n"], [47, "b", "p"]], [62, 47]);
  await p.waitForTimeout(450);   // (the end card shows 350ms after the end)
  // a rook is enough to mate, so Rh1xh3 plays on
  await p.evaluate(() => { __chess.start(2); document.getElementById("overOverlay").classList.remove("show"); });
  const kr = await play(p, [[4, "b", "k"], [60, "w", "k"], [63, "w", "r"], [47, "b", "p"]], [63, 47]);
  await p.waitForTimeout(450);
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
  await p.waitForTimeout(450);
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
  await p.waitForTimeout(450);
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
    await p.waitForTimeout(450);
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
  check("chess: Esc on the 2-player setup or the 4-player end rule goes back to the mode menu (doesn't leave); Esc there leaves",
    m0 === "setup2Menu" && m1.shown === "menu" && m1.leaves === 0 && m2 === "endMenu" && m3.shown === "menu" && m3.leaves === 0 && p.leaves === 1, { m0, m1, m2, m3, leaves: p.leaves });
  check("chess (menus): no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();
};
