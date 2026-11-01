// Abyss: a piece slid off a ledge gets a fresh lock delay where it lands; a
// held soft drop lets go when the tab loses focus; the Sprint clock ticks
// between locks; a 0 is never "a new record"; the buttons' keycaps hide on a
// touch-only phone; a full row clears at the same pace with Visual FX on and
// off; Maelstrom, its switch, its arms and turns, each arm's well 20 deep and
// clearing only its own rows, and its fit (see below); on a
// phone on its side the pad's two halves keep clear of the play area; the
// score box clear of the corner buttons and no new piece under it; a clear's
// points written where it cleared. Frames are
// stepped by the test (see STEPPED), so timing doesn't depend on how busy the
// machine is.
const HOOK = ["start: startRun,", "start: startRun, gameOver: gameOver,"];

// requestAnimationFrame and performance.now on a clock the test advances:
// __frames(n, hz) runs n frames of 1/hz seconds each
const STEPPED = () => {
  let t = 1000, q = [];
  performance.now = () => t;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.__frames = (n, hz) => {
    for (let i = 0; i < n; i++) {
      t += 1000 / (hz || 60);
      const run = q; q = [];
      run.forEach((cb) => { try { cb(t); } catch (e) { setTimeout(() => { throw e; }); } });
    }
  };
};

module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  let ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]); } });

  // An O sits half on a one-wide pillar for 450 ms of its 500 ms lock delay,
  // then slides off it in one step and falls to the floor
  const ledge = await p.evaluate(() => {
    __frames(3);
    Abyss.start("descent"); __frames(2);
    for (let y = 8; y < 20; y++) Abyss.test.fill(y, [4]);
    Abyss.test.setGrav(16);
    Abyss.test.setPiece("O"); Abyss.move(-1);              // columns 3-4
    for (let n = 0; n < 200 && Abyss.piece().y < 8; n++) __frames(1);
    __frames(27);
    Abyss.move(-1);                                         // columns 2-3: nothing under it now
    let landed = null, f = 0;
    for (; f < 120; f++) {
      __frames(1);
      const pc = Abyss.piece();
      if (pc.t !== "O" || pc.y < 8) break;                  // it locked (a new piece is up top)
      if (landed === null && pc.y === 20) landed = f;
    }
    Abyss.test.setGrav(0);
    return { landed, locked: f, ms: landed === null ? null : Math.round((f - landed) * 1000 / 60) };
  });
  check("abyss: a piece slid off a ledge gets the whole lock delay where it lands", ledge.ms !== null && ledge.ms >= 480, ledge);

  // Hold ↓, the tab loses focus (it pauses; the key is let go elsewhere, so
  // no keyup comes), resume: nothing should keep soft-dropping
  await p.evaluate(() => { Abyss.start("descent"); Abyss.test.setGrav(100000); __frames(2); });
  await p.keyboard.down("ArrowDown");
  await p.evaluate(() => { __frames(2); window.dispatchEvent(new Event("blur")); });
  const blurred = await p.evaluate(() => !document.querySelector(".gs-pause").hidden);
  const soft = await p.evaluate(() => {
    document.querySelector(".gs-pause button").click();
    const a = { score: Abyss.score(), y: Abyss.piece().y };
    __frames(60);
    return { a, b: { score: Abyss.score(), y: Abyss.piece().y } };
  });
  await p.keyboard.up("ArrowDown");
  check("abyss: a held soft drop lets go when the tab loses focus", blurred && soft.a.score === soft.b.score && soft.a.y === soft.b.y, { blurred, soft });
  await p.evaluate(() => Abyss.test.setGrav(0));

  // Sprint: a second of play with no lock moves the clock on
  const clock = await p.evaluate(() => {
    Abyss.start("sprint"); Abyss.test.setGrav(100000); __frames(2);
    const a = document.getElementById("hud-depth").textContent;
    __frames(60);
    const b = document.getElementById("hud-depth").textContent;
    Abyss.test.setGrav(0);
    return { a, b };
  });
  check("abyss: the Sprint clock ticks between locks", clock.b !== clock.a && /^0:01\.\d\d$/.test(clock.b), clock);

  // A first-ever Descent that ends at 0 (fresh storage: no best yet)
  const zero = await p.evaluate(() => { localStorage.removeItem("abyss_best_descent"); Abyss.start("descent"); __frames(2); Abyss.gameOver(); return { score: Abyss.score(), stats: document.getElementById("over-stats").textContent }; });
  check("abyss: a run that ends at 0 isn't a new record, even the first", zero.score === 0 && !/new record/.test(zero.stats), zero);
  check("abyss: no page errors", p.errs.length === 0, p.errs);
  await ctx.close();

  // Keycaps inside buttons (Dive, Dive again, the mode keys) show with a
  // keyboard and hide on a touch-only phone
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    ctx = await lib.newContext(browser, opts);
    const q = await lib.open(ctx, base, "games/abyss/", { before: (pg) => lib.injectScript(pg, "games/abyss/game.js", [HOOK]) });
    const shown = () => q.evaluate(() => [...document.querySelectorAll(".panel button kbd")].filter((k) => k.getClientRects().length).map((k) => k.closest("button").id || k.closest("button").dataset.v));
    const menu = await shown();
    // the menu's key legend (the touch pad's buttons carry their own icons)
    const legend = await q.evaluate(() => document.querySelector("#menu .keys").getClientRects().length > 0);
    await q.evaluate(() => { Abyss.start("descent"); Abyss.gameOver(); });
    const over = await shown();
    if (label === "phone") check("abyss: on a touch-only phone the buttons' keycaps are hidden", menu.length === 0 && over.length === 0, { menu, over });
    else check("abyss: with a keyboard the buttons' keycaps show (four modes, the Intense switch, Dive)", menu.length === 6 && over.length === 2, { menu, over });
    check("abyss: the menu's key legend " + (label === "phone" ? "is hidden on a touch-only phone" : "shows with a keyboard"), legend === (label !== "phone"), legend);
    await ctx.close();
  }

  // ---- X and Z spin, the up arrow doesn't; the menu's key legend names
  // neither the up arrow nor a pause (the ⏸ button at the top shows that)
  {
    const ctx = await lib.newContext(browser);
    const q = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]); } });
    const legend = await q.evaluate(() => document.querySelector("#menu .keys").textContent.replace(/\s+/g, " ").trim());
    await q.evaluate(() => { Abyss.start("descent"); Abyss.test.setPiece("T"); __frames(1); });
    const turn = async (key) => { const a = await q.evaluate(() => Abyss.piece().r); await q.keyboard.press(key); return (await q.evaluate(() => Abyss.piece().r)) !== a; };
    const up = await turn("ArrowUp"), x = await turn("x"), z = await turn("z");
    check("abyss: X and Z spin the piece and the up arrow doesn't; the key legend names no up arrow and no pause",
      !up && x && z && !/↑|pause/i.test(legend) && /X/.test(legend) && /Z/.test(legend), { up, x, z, legend });
    check("abyss (spin keys): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await ctx.close();
  }

  // ---- in the middle, top to bottom: each mode's keycap in its row and
  // Dive's beside the word (they sat on the text's foot, three and five
  // pixels low), each button's keycap on the pause card (the keycap set the
  // line, a pixel and a half low), and the score box's figures (on one
  // baseline the small ones hung low)
  {
    const ctx = await lib.newContext(browser);
    const q = await lib.open(ctx, base, "games/abyss/", { before: (pg) => lib.injectScript(pg, "games/abyss/game.js", [HOOK]) });
    const off = (pairs) => q.evaluate((pairs) => pairs.map(([inner, outer]) => {
      return [...document.querySelectorAll(inner)].filter((e) => e.getClientRects().length).map((e) => {
        const r = e.getBoundingClientRect(), b = e.closest(outer).getBoundingClientRect();
        return +(((r.top + r.bottom) - (b.top + b.bottom)) / 2).toFixed(2);
      });
    }).flat(), pairs);
    // (a mode's or a switch's keycap: on its name's line, at the right)
    const menu = (await q.evaluate(() => [...document.querySelectorAll("#menu .seg button kbd")].filter((e) => e.getClientRects().length).map((e) => {
      const r = e.getBoundingClientRect(), b = e.closest("button").querySelector("b").getBoundingClientRect();
      return +(((r.top + r.bottom) - (b.top + b.bottom)) / 2).toFixed(2);
    }))).concat(await off([["#menu .playbtn kbd", "button"]]));
    await q.evaluate(() => Abyss.start("descent")); await q.waitForTimeout(300);
    const hud = await off([["#hud > span", "#hud"]]);
    await q.keyboard.press("p"); await q.waitForTimeout(300);
    const pause = await off([[".gs-pause:not(.gs-dialog) .gs-pause-card button kbd", "button"]]);
    const mid = (a, n, tol) => a.length === n && a.every((d) => Math.abs(d) <= tol);
    check("abyss: each mode's and the switch's keycap sits in the middle of its name's line and Dive's beside the word, top to bottom", mid(menu, 6, 1), menu);
    check("abyss: on the pause card each button's keycap sits in the middle of it, top to bottom", mid(pause, 3, 1), pause);
    check("abyss: the score and its two figures sit in the middle of their box, top to bottom", mid(hud, 3, 1.5), hud);
    // the end card's Dive again: its keycap reads dark on the glow, as Dive's
    // does (it was the glow's own colour on the glow, all but invisible)
    const cap = await q.evaluate(() => { document.getElementById("over").hidden = false; const k = document.querySelector("#again kbd"), cs = getComputedStyle(k); return { color: cs.color, shown: k.getClientRects().length > 0 }; });
    check("abyss: on the end card the keycap on Dive again reads dark on the glow", cap.shown && cap.color === "rgb(4, 16, 28)", cap);
    check("abyss (centring): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await ctx.close();
  }

  // ---- full rows take the same time to clear with Visual FX on and off (a
  // quicker clear with it off made every Sprint quicker)
  {
    const frames = {};
    for (const off of [false, true]) {
      const ctx = await lib.newContext(browser);
      const q = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => {
        await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]);
        await pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:abyss", off ? "1" : "0"); } catch (e) {} }, off);
      } });
      frames[off ? "off" : "on"] = await q.evaluate(() => {
        __frames(2); Abyss.start("descent"); __frames(2);
        Abyss.test.fill(19, [0, 1, 2, 3, 4, 5]);
        Abyss.test.setPiece("I"); Abyss.move(1); Abyss.move(1); Abyss.move(1);   // columns 6-9
        Abyss.hard();
        const was = Abyss.state();
        let f = 0;
        while (Abyss.state() === "clearing" && f < 200) { __frames(1); f++; }
        return { was, f, lines: Abyss.lines() };
      });
      check("abyss (clear pace, FX " + (off ? "off" : "on") + "): no page errors", q.errs.length === 0, q.errs);
      await ctx.close();
    }
    check("abyss: a full row takes the same time to clear with Visual FX off as with it on (about a third of a second)",
      frames.on.was === "clearing" && frames.off.was === "clearing" && frames.on.lines === 1 && Math.abs(frames.on.f - frames.off.f) <= 1 && frames.on.f >= 17, frames);
  }

  // ---- Maelstrom (4): a board shaped like a plus. The menu's 4 picks it and
  // I flips Intense (kept; greyed where it doesn't count); there is no Juggle
  // any more (one piece at a time, always). A dive starts with one arm open;
  // Q and E turn nothing (the board turns by itself); every 10 rows another
  // arm opens and has the next run of pieces, its mouth marked while the
  // piece before sinks; between pieces the board turns that arm to the top,
  // easing round over 0.8 s with no piece in play; with the arm across open,
  // a piece stops at the middle line; a full column of the core clears as a
  // row does; the dive's best is saved as it's passed.
  {
    const ctx = await lib.newContext(browser);
    const q = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]); } });
    const sw = () => q.evaluate(() => ({ mode: Abyss.mode(), intense: document.getElementById("opt-intense").getAttribute("aria-pressed"),
      intenseOff: document.getElementById("opt-intense").disabled, juggle: !!document.getElementById("opt-juggle"), opts: document.querySelectorAll("#pick-opts button").length,
      kept: ["abyss_mode", "abyss_intense"].map((k) => localStorage.getItem(k)).join() }));
    await q.keyboard.press("2"); const sprint = await sw();
    await q.keyboard.press("4"); const mael = await sw();
    await q.keyboard.press("i"); await q.keyboard.press("j"); const on = await sw();
    await q.keyboard.press("i"); const off = await sw();
    check("abyss: 4 picks Maelstrom; I flips Intense (kept, greyed in Sprint); no Juggle switch, and J does nothing",
      sprint.mode === "sprint" && sprint.intenseOff && mael.mode === "maelstrom" && !mael.intenseOff && !mael.juggle && mael.opts === 1 &&
      on.intense === "true" && on.kept === "maelstrom,1" && off.intense === "false" && off.kept === "maelstrom,0",
      { sprint, mael, on, off });

    await q.evaluate(() => { __frames(2); Abyss.start("maelstrom"); __frames(2); Abyss.board().openArms(2); __frames(2); });
    const qe = {};
    for (const key of ["q", "e"]) {
      await q.keyboard.press(key);
      qe[key] = await q.evaluate(() => { __frames(6); return { top: Abyss.board().top, angle: Abyss.view().angle, turning: !!Abyss.board().turning }; });
    }
    check("abyss, Maelstrom: Q and E don't turn the board, even with a second arm open",
      ["q", "e"].every((k) => qe[k].top === 0 && qe[k].angle === 0 && !qe[k].turning), qe);

    const single = await q.evaluate(() => {
      Abyss.toMenu(); __frames(2); Abyss.start("maelstrom"); __frames(2);
      const B = Abyss.board(), r = {};
      r.start = { open: B.open.join(), pieces: B.pieces().filter(Boolean).length, k: B.piece().k, next: B.nextArm };
      // nine rows down already; the tenth (the core's last row, its gap filled by a standing I) opens the east arm
      Abyss.test.setLines(9);
      for (let x = 10; x < 20; x++) if (x !== 14) B.test.set(x, 19, 1);
      B.test.clearPiece(0); B.test.place(0, "I", 1, 2, 2);
      Abyss.hard();
      r.clearing = Abyss.state();
      __frames(30);
      r.cleared = { state: Abyss.state(), lines: Abyss.lines(), open: B.open.join(), gap: [16, 17, 18, 19].map((y) => B.test.get(14, y) ? 1 : 0).join(""),
        k: B.piece() && B.piece().k, next: B.nextArm, mark: Abyss.view().mark };
      // that piece down: the board turns the east arm to the top by itself, with no piece in play, easing round
      B.test.clearPiece(0); B.test.place(0, "O", 0, 0, -1);   // (at the core's west side, clear of the rows the east arm's piece sinks along)
      Abyss.hard();
      const T = B.turning;
      r.turn = { on: !!T, to: T && T.to, ms: T && T.ms, piece: !!B.piece(), angles: [] };
      for (let f = 1; f <= 60; f++) { __frames(1); if (f % 6 === 0) r.turn.angles.push(+Abyss.view().angle.toFixed(4)); if (f === 24) r.turn.half = Abyss.view().angle; if (f === 46) r.turn.still = !!B.turning && !B.piece(); }
      r.turn.done = { top: B.top, turning: !!B.turning, k: B.piece() && B.piece().k, angle: Abyss.view().angle };
      // every arm open: a piece still sinks its well's whole 20 rows, to the
      // core's far edge (the east arm's ly 19: column 10 of the board)
      B.openArms(4);
      B.test.clearPiece(B.top); B.test.place(B.top, "I", 0, 3, -1);
      r.deep = { from: B.piece().y, to: B.ghostY() };
      Abyss.hard();
      r.deep.col10 = [13, 14, 15, 16].every((y) => B.test.get(10, y));
      r.deep.col11 = !!B.test.get(11, 13);
      for (let f = 0; f < 120 && (B.turning || !B.piece()); f++) __frames(1);
      // a clean board, every arm open: a north piece that fills a column of
      // the core (x 15, rows 10 to 19) but none of its own well's rows clears
      // nothing; that column is a row of the east well, and the next east
      // piece, landing anywhere, clears it, and only that well moves in
      for (let k = 0; k < 4; k++) B.test.clearPiece(k);
      for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) B.test.set(x, y, 0);
      for (let y = 11; y < 20; y++) B.test.set(15, y, 1);
      const lines1 = Abyss.lines();
      B.test.place(0, "I", 1, 3, 7);           // (standing at lx 5: board column 15, rows 7 to 10)
      B.test.lock(0);
      __frames(30);
      r.column = { lines: Abyss.lines() - lines1, state: Abyss.state(), kept: [7, 10, 15, 19].every((y) => B.test.get(15, y)) };
      for (let k = 0; k < 4; k++) B.test.clearPiece(k);
      B.test.place(1, "I", 0, 3, -1);          // (lying across the east arm's first row: board column 29, rows 13 to 16)
      B.test.lock(1);
      __frames(30);
      r.east = { lines: Abyss.lines() - lines1, gone: [10, 13, 19].every((y) => !B.test.get(15, y)), arm: [7, 8, 9].every((y) => B.test.get(15, y)),
        moved: [13, 14, 15, 16].every((y) => B.test.get(28, y) && !B.test.get(29, y)) };
      // a north row clear moves the north well alone: a block in the south
      // arm stays where it is
      for (let k = 0; k < 4; k++) B.test.clearPiece(k);
      for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) B.test.set(x, y, 0);
      for (let x = 10; x < 20; x++) if (x !== 14) B.test.set(x, 19, 1);
      B.test.set(12, 18, 1); B.test.set(12, 25, 1); B.test.set(25, 15, 1);
      const lines2 = Abyss.lines();
      B.test.place(0, "I", 1, 2, 16);          // (standing at lx 4: board column 14, rows 16 to 19)
      B.test.lock(0);
      __frames(30);
      r.north = { lines: Abyss.lines() - lines2, down: !B.test.get(12, 18) && !!B.test.get(12, 19), south: !!B.test.get(12, 25), east: !!B.test.get(25, 15),
        gap: [16, 17, 18, 19].map((y) => B.test.get(14, y) ? 1 : 0).join("") };
      r.best = localStorage.getItem("abyss_best_maelstrom");
      r.score = Abyss.score();
      return r;
    });
    check("abyss, Maelstrom: one arm open, one piece, in it, and the next from it too",
      single.start.open === "true,false,false,false" && single.start.pieces === 1 && single.start.k === 0 && single.start.next === 0, single.start);
    check("abyss, Maelstrom: the tenth row (the core's last, its gap filled) clears, the blocks above coming down one, and opens the east arm: the piece after this one comes from it, its mouth marked",
      single.clearing === "clearing" && single.cleared.state === "play" && single.cleared.lines === 10 && single.cleared.open === "true,true,false,false" && single.cleared.gap === "0111" &&
      single.cleared.k === 0 && single.cleared.next === 1 && single.cleared.mark === 1, single.cleared);
    const tn = single.turn, steps = tn.angles.map((a, i) => i ? a - tn.angles[i - 1] : a);
    check("abyss, Maelstrom: then the board turns the east arm to the top by itself, with no piece in play: 0.8 s, easing in and out (half way at the half), and the next piece in the east arm",
      tn.on && tn.to === 1 && tn.ms === 800 && !tn.piece && tn.still && Math.abs(tn.half + Math.PI / 4) < 0.02 &&
      steps.slice(0, 8).every((d) => d <= 0) && Math.abs(steps[1]) > Math.abs(steps[0]) && Math.abs(steps[6]) < Math.abs(steps[3]) &&
      tn.done.top === 1 && !tn.done.turning && tn.done.k === 1 && Math.abs(tn.done.angle + Math.PI / 2) < 1e-9, { tn, steps });
    check("abyss, Maelstrom: with every arm open a piece still sinks its well's whole 20 rows (10 of arm, 10 of core) to the core's far edge",
      single.deep.from === -1 && single.deep.to === 18 && single.deep.col10 && !single.deep.col11, single.deep);
    check("abyss, Maelstrom: a north piece that fills a column of the core but no row of its own well clears nothing",
      single.column.lines === 0 && single.column.state === "play" && single.column.kept, single.column);
    check("abyss, Maelstrom: that column is a row of the east well: the next east piece clears it, and only the east well moves in (the north arm's blocks stay), and the dive's best is saved as it's passed",
      single.east.lines === 1 && single.east.gone && single.east.arm && single.east.moved && Number(single.best) === single.score && single.score > 0, { east: single.east, best: single.best, score: single.score });
    check("abyss, Maelstrom: a north row clear brings the north well's rows above it down one, and leaves the south and east arms' blocks where they are",
      single.north.lines === 1 && single.north.down && single.north.south && single.north.east && single.north.gap === "0111", single.north);
    check("abyss (Maelstrom): no page errors", q.errs.length === 0, q.errs);
    await ctx.close();
  }

  // ---- Maelstrom's arms in turn: with all four open (Intense), 40 pieces
  // in a row come from at least three arms, in runs of no more than five;
  // each comes in at the top with the board square to it, and there's never
  // more than one piece in play. A quarter turn takes 48 frames (0.8 s) and
  // the arm across 72 (1.2 s), with Visual FX on and off alike
  {
    const ctx = await lib.newContext(browser);
    const SEEDED = () => { let s = 12345; Math.random = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); };
    const q = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => { await pg.addInitScript(STEPPED); await pg.addInitScript(SEEDED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]); } });
    await q.keyboard.press("4"); await q.keyboard.press("i");
    const run = await q.evaluate(() => {
      __frames(2); Abyss.start("maelstrom"); __frames(2);
      const B = Abyss.board(), r = { open: B.open.join(), arms: [], square: true, most: 0, turns: [] };
      const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      for (let n = 0; n < 40; n++) {
        if (n === 30) window.RM_ON = () => true;          // the last ten with Visual FX off
        let f = 0, tf = 0, quarters = 0;
        while (f < 300 && (B.turning || !B.piece())) {
          if (B.turning) { tf++; quarters = B.turning.quarters; }
          __frames(1); f++;
          r.most = Math.max(r.most, B.pieces().filter(Boolean).length);
        }
        if (tf) r.turns.push({ quarters, frames: tf, off: n >= 30 });
        const p = B.piece();
        if (!p) { r.stuck = n; break; }
        r.arms.push(p.k);
        if (p.k !== B.top || Math.abs(norm(Abyss.view().angle) - norm(-B.top * Math.PI / 2)) > 1e-9) r.square = false;
        __frames(3);
        r.most = Math.max(r.most, B.pieces().filter(Boolean).length);
        Abyss.hard();
        for (let x = 0; x < 26; x++) for (let y = 0; y < 26; y++) B.test.set(x, y, 0);   // (an empty board each time: no clears, no game over)
      }
      return r;
    });
    let streak = 1, longest = 1;
    for (let i = 1; i < run.arms.length; i++) { streak = run.arms[i] === run.arms[i - 1] ? streak + 1 : 1; longest = Math.max(longest, streak); }
    const kinds = new Set(run.arms).size, qt = run.turns.filter((t) => t.quarters === 1), ht = run.turns.filter((t) => t.quarters === 2);
    check("abyss, Maelstrom with Intense: 40 pieces come from at least three of the four arms, in runs of five at most, each at the top with the board square to it, never two in play at once",
      run.open === "true,true,true,true" && run.arms.length === 40 && kinds >= 3 && longest <= 5 && run.square && run.most === 1, { arms: run.arms.join(""), kinds, longest, square: run.square, most: run.most, stuck: run.stuck });
    check("abyss, Maelstrom: a quarter turn takes 48 frames (0.8 s) and the arm across 72 (1.2 s), with Visual FX on and off alike",
      qt.length > 0 && qt.every((t) => Math.abs(t.frames - 48) <= 1) && ht.every((t) => Math.abs(t.frames - 72) <= 1) && run.turns.some((t) => t.off),
      run.turns);
    check("abyss (Maelstrom arms): no page errors", q.errs.length === 0, q.errs);
    await ctx.close();
  }

  // ---- Maelstrom paused mid-turn: the board stops turning and nothing
  // comes in under the pause card (Q, E and the arrows do nothing either);
  // resumed, the turn finishes and the piece comes in; Esc mid-dive asks
  // "Leave this game?"
  {
    const ctx = await lib.newContext(browser);
    const q = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => { await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]); } });
    const look = () => q.evaluate(() => { const B = Abyss.board(), pc = B.piece(), T = B.turning; return { top: B.top, angle: +Abyss.view().angle.toFixed(4), left: T ? T.left : null, piece: pc ? pc.k : null, state: Abyss.state(),
      paused: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, dlg: (document.querySelector(".gs-dialog h2") || {}).textContent || null }; });
    await q.evaluate(() => { __frames(2); Abyss.start("maelstrom"); const B = Abyss.board(); B.openArms(2); __frames(2); B.test.setNext(1); Abyss.hard(); __frames(12); });
    await q.keyboard.press("p");
    const before = await look();
    await q.keyboard.press("q"); await q.keyboard.press("e"); await q.keyboard.press("ArrowLeft");
    await q.evaluate(() => __frames(90));
    const under = await look();
    await q.evaluate(() => document.querySelector(".gs-pause:not(.gs-dialog) button").click());
    await q.evaluate(() => __frames(60));
    const after = await look();
    await q.keyboard.press("Escape");
    // (the box can take a moment on a busy machine: wait for it, a frame at a time)
    await q.waitForFunction(() => { __frames(1); return !!document.querySelector(".gs-dialog h2"); }, null, { timeout: 15000, polling: 50 }).catch(() => {});
    const esc = await look();
    check("abyss, Maelstrom: paused mid-turn, the board stops turning and no piece comes in, whatever's pressed; resumed, the turn finishes and the piece comes in at the top; Esc mid-dive asks \"Leave this game?\"",
      before.paused && before.left > 0 && before.piece === null && under.paused && under.angle === before.angle && under.left === before.left && under.piece === null &&
      !after.paused && after.top === 1 && after.left === null && after.piece === 1 && esc.dlg === "Leave this game?", { before, under, after, esc });
    check("abyss (Maelstrom paused): no page errors", q.errs.length === 0, q.errs);
    await ctx.close();
  }

  // ---- Maelstrom on a phone: the pad is Descent's, one row of six (no turn
  // buttons: the board turns by itself); the whole plus, with a row above it
  // for the piece coming in, is on the screen between the score box and the
  // pad, on phones and on laptops
  {
    const fits = [];
    for (const [w, h, phone] of [[320, 568, 1], [375, 553, 1], [360, 640, 1], [390, 664, 1], [1366, 657, 0], [1280, 600, 0], [1280, 900, 0]]) {
      const ctx = await lib.newContext(browser, phone ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: h } });
      const q = await lib.open(ctx, base, "games/abyss/", { before: (pg) => lib.injectScript(pg, "games/abyss/game.js", [HOOK]) });
      const look = () => q.evaluate(() => {
        const r = (sel) => { const e = document.querySelector(sel); return e && e.getClientRects().length ? e.getBoundingClientRect() : null; };
        const v = Abyss.view(), hud = r("#hud"), pad = r("#pad");
        const shown = [...document.querySelectorAll("#pad button")].filter((b) => b.getClientRects().length && b.getBoundingClientRect().width);
        return { buttons: shown.length, rows: new Set(shown.map((b) => Math.round(b.getBoundingClientRect().top))).size, top: v.cy - 14 * v.cell, bottom: v.cy + 13 * v.cell, left: v.cx - 13 * v.cell, right: v.cx + 13 * v.cell,
          hud: hud ? hud.bottom : 0, pad: pad ? pad.top : innerHeight, cell: v.cell };
      });
      await q.evaluate(() => { Abyss.start("descent"); });
      const descent = await look();
      await q.evaluate(() => { Abyss.toMenu(); Abyss.start("maelstrom"); Abyss.board().openArms(2); });
      await q.waitForTimeout(100);
      const m = await look();
      fits.push({ size: w + "x" + h, ok: m.top >= m.hud - 1 && m.bottom <= m.pad + 1 && m.left >= 0 && m.right <= w && (!phone || (m.buttons === 6 && m.rows === 1 && descent.buttons === 6)), m, descent: descent.buttons, errs: q.errs.length });
      await ctx.close();
    }
    check("abyss, Maelstrom: on phones the pad is Descent's one row of six (no turn buttons); at 320 x 568, 375 x 553, 360 x 640, 390 x 664, 1366 x 657, 1280 x 600 and 1280 x 900 the plus fits between the score box and the pad",
      fits.every((f) => f.ok && !f.errs), fits);
  }

  // ---- a phone on its side: the pad in two halves at the screen's sides,
  // and the play area (the well with its hold and next boxes, or the plus
  // with a row above it) between them, on the screen, under no button and
  // not under the score box; in Descent and Maelstrom
  {
    const side = [];
    for (const [w, h] of [[844, 390], [667, 375], [740, 360]]) {
      const ctx = await lib.newContext(browser, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const q = await lib.open(ctx, base, "games/abyss/");
      for (const m of ["descent", "maelstrom"]) {
        const r = await q.evaluate((m) => {
          Abyss.toMenu();
          Abyss.start(m);
          const box = (e) => { const b = e.getBoundingClientRect(); return { n: e.id, x: b.left, y: b.top, w: b.width, h: b.height }; };
          const areas = Abyss.areas(), hud = box(document.getElementById("hud"));
          const btns = [...document.querySelectorAll("#pad button")].filter((b) => b.getClientRects().length && b.getBoundingClientRect().width).map(box);
          const meet = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
          const play = areas[0], under = [];
          areas.forEach((a) => btns.concat(hud).forEach((b) => { if (meet(a, b)) under.push(a.n + "/" + b.n); }));
          return { n: btns.length, under, off: areas.filter((a) => a.x < 0 || a.y < 0 || a.x + a.w > innerWidth || a.y + a.h > innerHeight).map((a) => a.n),
            left: btns.filter((b) => b.x + b.w <= play.x).length, right: btns.filter((b) => b.x >= play.x + play.w).length };
        }, m);
        side.push({ size: w + "x" + h, m, ok: r.n === 6 && !r.under.length && !r.off.length && r.left + r.right === r.n && r.left === 4, r });
      }
      side.push({ size: w + "x" + h, m: "errors", ok: !q.errs.length, errs: q.errs });
      await ctx.close();
    }
    check("abyss: on a phone on its side (844 x 390, 667 x 375, 740 x 360) the pad is in two halves at the screen's sides (four buttons on the left), and in Descent and Maelstrom the play area is on the screen between them, under no button and not under the score box",
      side.every((s) => s.ok), side.filter((s) => !s.ok).concat(side.length ? [] : ["none run"]));
  }

  // ---- a phone upright: the well and its hold and next boxes (or the plus)
  // all on the screen, none over another, nor under the score box, the
  // corner buttons, the way back or the pad; the hold and next boxes below
  // the score box. At the start of a run and a few pieces in (Sprint's
  // clock widens the score box), small phones and tall ones
  {
    const up = [];
    for (const [w, h] of [[320, 568], [360, 560], [375, 553], [360, 640], [390, 664], [412, 915], [390, 844]]) {
      const ctx = await lib.newContext(browser, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const q = await lib.open(ctx, base, "games/abyss/");
      for (const m of ["descent", "sprint", "maelstrom"]) {
        for (const when of ["start", "in"]) {
          const r = await q.evaluate(([m, when]) => {
            if (when === "start") { Abyss.toMenu(); Abyss.start(m); } else for (let i = 0; i < 3; i++) Abyss.hard();
            const box = (n, e) => { if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return b.width ? { n, x: b.left, y: b.top, w: b.width, h: b.height } : null; };
            const others = [box("score", document.getElementById("hud")), box("corner", document.querySelector(".gs-corner")), box("back", document.querySelector(".nav-back-games"))]
              .concat([...document.querySelectorAll("#pad button")].map((b) => box(b.id, b))).filter(Boolean);
            const meet = (a, b) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0.5 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.5;
            const areas = Abyss.areas(), score = others[0], under = [];
            areas.forEach((a, i) => { others.forEach((o) => { if (meet(a, o)) under.push(a.n + "/" + o.n); }); areas.slice(i + 1).forEach((b) => { if (meet(a, b)) under.push(a.n + "/" + b.n); }); });
            const off = areas.filter((a) => a.x < -0.5 || a.y < -0.5 || a.x + a.w > innerWidth + 0.5 || a.y + a.h > innerHeight + 0.5).map((a) => a.n);
            const high = areas.filter((a) => (a.n === "hold" || a.n === "next") && score && a.y < score.y + score.h).map((a) => a.n);
            return { n: areas.length, under, off, high };
          }, [m, when]);
          up.push({ size: w + "x" + h, m, when, ok: r.n === (m === "maelstrom" ? 1 : 3) && !r.under.length && !r.off.length && !r.high.length, r });
        }
      }
      up.push({ size: w + "x" + h, m: "errors", ok: !q.errs.length, errs: q.errs });
      await ctx.close();
    }
    check("abyss: on a phone upright (320 x 568, 360 x 560, 375 x 553, 360 x 640, 390 x 664, 412 x 915, 390 x 844), in Descent, Sprint and Maelstrom, the well with its hold and next boxes (or the plus) is on the screen, nothing over anything else nor under the score box, the corner buttons, the way back or the pad, the hold and next boxes below the score box",
      up.every((u) => u.ok), up.filter((u) => !u.ok));
  }

  // ---- the score box at its widest (a seven-figure score, Sprint's clock)
  // keeps clear of the corner buttons and the way back: on a phone on its
  // side, and in a window 641 to 800 px wide (under them up to 700 px)
  {
    const got = [];
    for (const [w, h, touch] of [[667, 375, 1], [740, 360, 1], [568, 320, 1], [641, 700, 0], [700, 800, 0], [720, 700, 0], [800, 600, 0], [1280, 900, 0]]) {
      const ctx = await lib.newContext(browser, touch ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: h } });
      const q = await lib.open(ctx, base, "games/abyss/");
      for (const m of ["descent", "sprint"]) {
        got.push(Object.assign({ size: w + "x" + h, m }, await q.evaluate((m) => {
          Abyss.toMenu(); Abyss.start(m); Abyss.test.setGrav(100000);
          document.getElementById("hud-score").textContent = (1234567).toLocaleString();
          Abyss.test.setLines(m === "sprint" ? 39 : 999);   // (the readout drawn again, the box placed for it)
          const d = document.getElementById("hud-depth");
          if (m === "sprint") { d.textContent = "59:59.99"; window.dispatchEvent(new Event("resize")); }
          const hud = document.getElementById("hud").getBoundingClientRect();
          const hit = [...document.querySelectorAll(".nav-back-games, .gs-corner > *")].filter((e) => e.getClientRects().length).filter((e) => {
            const c = e.getBoundingClientRect();
            return Math.min(hud.right, c.right) - Math.max(hud.left, c.left) > 0 && Math.min(hud.bottom, c.bottom) - Math.max(hud.top, c.top) > 0;
          }).map((e) => e.className || e.textContent.trim());
          return { hit, l: Math.round(hud.left), r: Math.round(hud.right), t: Math.round(hud.top), on: hud.left >= 0 && hud.right <= innerWidth };
        }, m)));
      }
      got.push({ size: w + "x" + h, m: "errors", hit: q.errs, on: true });
      await ctx.close();
    }
    check("abyss: the score box at its widest (1,234,567, Sprint's clock) runs into no corner button and not the way back, on a phone on its side (667 x 375, 740 x 360, 568 x 320) and in windows 641 to 800 px wide",
      got.every((g) => g.on && g.hit.length === 0), got.filter((g) => !g.on || g.hit.length));
  }

  // ---- a new piece comes in on the row above the well, which on a phone
  // held upright lies partly under the score box: none of it is drawn
  // under the box, and the rest of that row it is
  {
    const got = [];
    for (const [w, h] of [[320, 568], [390, 664]]) {
      const ctx = await lib.newContext(browser, { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const q = await lib.open(ctx, base, "games/abyss/");
      await q.evaluate(() => { Abyss.start("descent"); Abyss.test.setGrav(100000); Abyss.test.setPiece("I"); });
      await q.waitForTimeout(300);
      got.push(Object.assign({ size: w + "x" + h }, await q.evaluate(() => {
        const cv = document.getElementById("stage"), k = cv.width / innerWidth, g = cv.getContext("2d");
        const hud = document.getElementById("hud").getBoundingClientRect(), well = Abyss.areas()[0];
        const cell = (well.w - 8) / 10, top = well.y + 4, row = top - cell, pc = Abyss.piece();
        // the siphonophore (I) lies across the row above the well; a sample
        // in the middle of each of its cells, in the band under the score box
        // and in the band between the box and the well
        const cyan = (x, y) => { const d = g.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data; return d[1] > 140 && d[2] > 180; };
        const xs = [0, 1, 2, 3].map((i) => well.x + 4 + (pc.x + i + 0.5) * cell);
        const yUnder = (Math.max(row, hud.top) + hud.bottom) / 2, yBelow = (hud.bottom + top) / 2;
        return { band: [Math.round(Math.max(row, hud.top)), Math.round(hud.bottom), Math.round(top)], under: xs.map((x) => cyan(x, yUnder)), below: hud.bottom + 2 < top ? xs.map((x) => cyan(x, yBelow)) : null };
      })));
      await ctx.close();
    }
    check("abyss: on a phone upright (320 x 568, 390 x 664) a new piece on the row above the well is drawn only below the score box, none of it under the box",
      got.every((g) => g.band[0] < g.band[1] && g.under.every((c) => !c) && (!g.below || g.below.every((c) => c))), got);
  }

  // ---- a clear's points are written where it cleared: "+100" over a single
  // row, "+1,200 ×1.5" over a four after a four, and in Maelstrom over the
  // cleared cells; with Visual FX on they rise, off they hold still, and
  // either way they're gone within a second; a pause holds them
  {
    const got = {};
    for (const off of [false, true]) {
      const ctx = await lib.newContext(browser);
      const q = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => {
        await pg.addInitScript(STEPPED); await lib.injectScript(pg, "games/abyss/game.js", [HOOK]);
        await pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:abyss", off ? "1" : "0"); } catch (e) {} }, off);
      } });
      got[off ? "off" : "on"] = await q.evaluate(() => {
        __frames(2); Abyss.start("descent"); Abyss.test.setGrav(100000); __frames(2);
        const r = {}, well = () => Abyss.areas()[0];
        // one row: the bottom one, its last four cells filled by a lying I
        Abyss.test.fill(19, [0, 1, 2, 3, 4, 5]);
        Abyss.test.setPiece("I"); Abyss.move(1); Abyss.move(1); Abyss.move(1);
        Abyss.hard(); __frames(1);
        const w = well(), c = (w.w - 8) / 10, rowTop = w.y + 4 + 19 * c, pop = Abyss.test.pops()[0];
        r.one = { n: Abyss.test.pops().length, text: pop && pop.text, inRow: !!pop && pop.y0 >= rowTop && pop.y0 <= rowTop + c, mid: !!pop && Math.abs(pop.x - (w.x + w.w / 2)) < 1 };
        const ys = [pop.y];
        __frames(20); ys.push(Abyss.test.pops()[0].y);
        // paused: nothing moves on
        const life0 = Abyss.test.pops()[0].life;
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", bubbles: true }));
        __frames(40);
        r.paused = { life: Abyss.test.pops().length ? +(Abyss.test.pops()[0].life - life0).toFixed(3) : null };
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", code: "KeyP", bubbles: true }));
        __frames(1);
        let f = 0;
        while (Abyss.test.pops().length && f < 120) { __frames(1); f++; if (f === 10 && Abyss.test.pops().length) ys.push(Abyss.test.pops()[0].y); }
        r.ys = ys.map((y) => +y.toFixed(1)); r.framesLeft = f;
        // two fours in a row: the second is worth half again
        for (const k of [0, 1]) {
          for (let y = 16; y < 20; y++) Abyss.test.fill(y, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
          Abyss.test.setPiece("I"); Abyss.rotate(1); for (let i = 0; i < 6; i++) Abyss.move(1);
          Abyss.hard(); __frames(1);
          if (k === 0) { r.four = Abyss.test.pops().map((p) => p.text); __frames(60); }
          else r.twice = Abyss.test.pops().map((p) => p.text);
          for (let i = 0; i < 30 && Abyss.state() === "clearing"; i++) __frames(1);
        }
        // Maelstrom: the north well's floor row, its gap filled by a standing I
        Abyss.toMenu(); __frames(2); Abyss.start("maelstrom"); Abyss.test.setGrav(100000); __frames(2);
        const B = Abyss.board();
        for (let x = 10; x < 20; x++) if (x !== 14) B.test.set(x, 19, 1);
        B.test.clearPiece(0); B.test.place(0, "I", 1, 2, 16);
        B.test.lock(0); __frames(1);
        const v = Abyss.view(), mp = Abyss.test.pops()[0];
        r.mael = { text: mp && mp.text, dx: mp && +(mp.x - v.cx).toFixed(1), dy: mp && +(mp.y0 - (v.cy + 4.5 * v.cell)).toFixed(1) };
        return r;
      });
      got[off ? "off" : "on"].errs = q.errs;
      await ctx.close();
    }
    const steady = (r) => r.ys.every((y) => Math.abs(y - r.ys[0]) < 0.01), rises = (r) => r.ys[1] < r.ys[0] - 3 && r.ys[2] <= r.ys[1];
    check("abyss: a clear's points are written over the rows it cleared (\"+100\" for a row), a four after a four as \"+1,200 ×1.5\", and in Maelstrom over the cleared cells",
      ["on", "off"].every((k) => { const r = got[k]; return r.one.n === 1 && r.one.text === "+100" && r.one.inRow && r.one.mid && r.four.join() === "+800" && r.twice.join() === "+1,200 ×1.5" && r.mael.text === "+100" && Math.abs(r.mael.dx) < 1 && Math.abs(r.mael.dy) < 1; }), got);
    check("abyss: with Visual FX on the points rise as they fade, with it off they hold still; either way they're gone within a second and a pause holds them",
      rises(got.on) && steady(got.off) && ["on", "off"].every((k) => got[k].framesLeft > 0 && got[k].framesLeft <= 40 && got[k].paused.life === 0), { on: [got.on.ys, got.on.framesLeft, got.on.paused], off: [got.off.ys, got.off.framesLeft, got.off.paused] });
    check("abyss (points): no page errors", !got.on.errs.length && !got.off.errs.length, [got.on.errs, got.off.errs]);
  }
};
