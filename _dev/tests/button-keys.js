// Buttons take keys, and say so. On every game's opening screen each button
// that does something shows a key (a keycap on it or in it), bar the ones left
// to the mouse on purpose: boards, level grids, look pickers, the editors. The
// cards that come up later (results, pause, rules) carry their keys too, and a
// key does what its button does: it asks first where the press would throw a
// game away, and Enter on a result plays again. The canvas menus of Road Bird
// and Spacer, and 24's phone menu, take number keys that pick without starting.

// page -> buttons that show no key on purpose (a selector each; "*" for all)
const ALLOW = {
  "24/": [".key"],                          // the phone's own keys: the line under it maps the keyboard to them
  "darkroom/": [".frame"],                  // the prints: a grid, a Tab and Enter away
  "departures/": ["#giveup"],               // a typing game: every letter is an answer
  "hash/": [".card"],                       // the board
  "klondike/": [".mtop"],                   // the two menus: every item inside shows its key
  "lights-out/": [".bulb"],                 // the board (arrows walk it)
  "logicgate/": [".theme-btn", ".dot"],     // the look, and the level grid
  "metazac/": ["#power-btn"],               // (it says SPACE on its face)
  "minesweeper/": [".tb-close", "#navClassic", "#face"],             // (N is on the Keyboard line; the face keeps its old look)
  "minesweeper/endless.html": [".tb-close", ".mode", "#face"],
  "science-fair/": [".pad"],                // (each planet's number is on the tag beside it)
  "dead-end/editor.html": ["*"],            // the level editors are mouse tools
  "slither/editor.html": ["*"],
  "tile-maze/editor.html": ["*"],
  "speedle/": [".key"],                     // the on-screen keyboard
  "steamfitter/": [".ls-cell", ".ls-create"],   // the level grid
  "sudoku/": [".key"],                      // the digit pad
  "tile-maze/": [".dbtn", ".lvlbtn"],       // the arrows pad, and the level grid
  "typetwo/": ["#startBtn"],                // ("Enter to start" is on the line above it)
};

// page -> [selector, keycap] for buttons that are in the page from the start,
// shown or not (cards that come up later)
const CARDS = {
  "2048/": [["#new-game", "N"]],
  "click-tap/": [["#quitBtn", "⌫"], ["#againBtn", "Space or Enter"], ["#settingsBtn", "⌫"]],
  "crazy-ohio/": [["#quitBtn", "⌫"], ["#againBtn", "Space or Enter"], ["#settingsBtn", "⌫"]],
  "corner-pocket/": [["#againBtn", "Enter"], ["#toMenuBtn", "⌫"], ["#spinReset", "C"], ["#spinDone", "Enter"], ["#quitYes", "Enter"], ["#quitNo", null]],   // (Keep playing says "any other key" in words: no keycap)
  "darkroom/": [["#to-gallery", "G"], ["#hud-back", "⌫"], ["#win-next", "Enter"], ["#win-share", "S"], ["#win-menu", "⌫"], ["#gallery-back", "Esc"]],
  "demolition-row/": [["#menu-btn", "⌫"], ["#pause-resume", "Space or Enter"], ["#pause-restart", "R"], ["#pause-menu", "⌫"], ["#result-again", "Space or Enter"], ["#result-menu", "⌫"]],
  "slither/": [["#menu-btn", "⌫"], ["#pause-restart", "R"], ["#pause-menu", "⌫"], ["#result-primary", "Enter"], ["#result-menu", "⌫"]],
  "hash/": [["#ovBtn", "Space or Enter"]],
  "jam-jar/": [["#againBtn", "Enter"]],
  "steamfitter/": [["#againBtn", "Enter"]],
  "salvo/": [["#againBtn", "Enter"]],
  "sunset-slice/": [["#again", "Space or Enter"], ["#restart", "R"], ["#quit", "⌫"]],
  "lights-out/": [["#hint", "H"], ["#share", "S"]],
  "mahjong/": [["#btn-newdeal", "N"], ["#btn-giveup", "G"], ["#share", "S"]],
  "science-fair/": [["#share", "S"]],
  "minesweeper/": [["#modeBtn", "T"], ["#share", "S"]],
  "minesweeper/endless.html": [["#modeBtn", "T"]],
  "logicgate/": [["#checkBtn", "Enter"], ["#winNext", "Enter"]],
  "tile-maze/": [["#overlayReplay", "R"], ["#overlayNext", "Space or Enter"]],
  "chess/": [["#overAgain", "Space or Enter"]],
  "chess/three.html": [["#overAgain", "Space or Enter"]],
  "dots-and-boxes/": [["#closeRules", "Enter"]],
  "link-many/": [["#closeRules", "Enter"]],
  "tic-tac-toe/": [["#closeRules", "Enter"], ["#symPick button", "X"]],
  "klondike/": [["#m-rules", "F1"]],
  "pop-the-lock/": [["#play", "Space or Enter"]],
};

// the keycap an element wears: its own data-gs-key, one inside it, or a <kbd> inside it
const capOf = (el) => {
  if (!el) return null;
  const host = el.matches("[data-gs-key]") ? el : el.querySelector("[data-gs-key]");
  const kbd = el.querySelector("kbd");
  return host ? host.getAttribute("data-gs-key") : kbd ? kbd.textContent : null;
};

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const noFlip = (pg) => pg.addInitScript(() => { Object.defineProperty(window, "coinFlip", { configurable: true, get: () => (o, cb) => cb("you"), set: () => {} }); });
  const box = (p) => p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
  const settle = (p, ms) => p.waitForTimeout(ms || 250);

  // ---- every opening screen: a button that shows no key is one of the ones left on purpose
  for (const g of lib.gamePages()) {
    const p = await lib.open(ctx, base, "games/" + g, { before: noFlip });
    await settle(p, 200);
    const got = await p.evaluate(({ allow, capSrc }) => {
      const capOf = new Function("return (" + capSrc + ")")();
      const bare = [], cards = [];
      document.querySelectorAll("button, a.btn, [role=button]").forEach((b) => {
        if (b.closest(".gs-corner") || b.classList.contains("nav-back-games") || b.closest(".gs-dialog")) return;
        if (!b.getClientRects().length || b.disabled) return;
        const cs = getComputedStyle(b), r = b.getBoundingClientRect();
        if (cs.visibility === "hidden" || +cs.opacity === 0 || cs.pointerEvents === "none" || r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) return;
        if (allow.some((s) => s === "*" || b.matches(s))) return;
        // a keycap in the button, drawn from an attribute (and so showing), or a <kbd> beside its label
        const host = b.matches("[data-gs-key]") ? b : b.querySelector("[data-gs-key]");
        const shown = host ? getComputedStyle(host, "::after").display !== "none" : !!b.querySelector("kbd");
        if (!shown) bare.push((b.innerText || b.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 24) + (b.id ? "#" + b.id : ""));
      });
      return { bare, capOf: !!capOf };
    }, { allow: ALLOW[g] || [], capSrc: capOf.toString() });
    check(g + ": every button on the opening screen shows its key (bar the ones left to the mouse on purpose)", got.bare.length === 0, got.bare);
    if (CARDS[g]) {
      const caps = await p.evaluate(({ list, capSrc }) => {
        const capOf = new Function("return (" + capSrc + ")")();
        return list.map(([sel, want]) => { const c = capOf(document.querySelector(sel)); return c === want ? null : sel + " wears " + JSON.stringify(c) + ", not " + want; }).filter(Boolean);
      }, { list: CARDS[g], capSrc: capOf.toString() });
      check(g + ": the buttons on its later cards carry their keys too", caps.length === 0, caps);
    }
    check(g + " (button keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- 2048: N is AC (asking first mid-game); on Game Over Enter is Try Again
  {
    const HOOK = ["  newGame();\n})();", `  newGame();
  window.__set2048 = function (rows) {
    newGame(); tilesEl.innerHTML = ""; tiles = {}; grid = [];
    for (var r = 0; r < 4; r++) grid.push([null, null, null, null]);
    for (r = 0; r < 4; r++) for (var c = 0; c < 4; c++) if (rows[r][c]) makeTile(r, c, rows[r][c], null);
  };
})();`];
    const p = await lib.open(ctx, base, "games/2048/", { before: (pg) => lib.injectScript(pg, "games/2048/game.js", [HOOK]) });
    for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) { await p.keyboard.press(k); await p.waitForTimeout(120); }
    await p.keyboard.press("n"); await p.waitForSelector(".gs-dialog", { timeout: 5000 }).catch(() => {});
    const asked = await box(p);
    await p.keyboard.press("Escape"); await settle(p);
    // a full board with one move left, which ends it
    await p.evaluate(() => __set2048([[2, 2, 8, 16], [32, 64, 128, 256], [128, 256, 512, 8], [8, 16, 32, 64]]));
    await p.keyboard.press("ArrowLeft"); await p.waitForFunction(() => document.getElementById("overlay").classList.contains("show"), null, { timeout: 5000 }).catch(() => {});
    const over = await p.evaluate(() => ({ title: document.getElementById("overlay-title").textContent, cap: document.getElementById("overlay-retry").getAttribute("data-gs-key") }));
    await p.keyboard.press("Enter"); await settle(p);
    const again = await p.evaluate(() => ({ shown: document.getElementById("overlay").classList.contains("show"), score: document.getElementById("score").textContent }));
    check("2048: N is the AC key (asking 'Start a new game?' mid-game); on Game Over Try Again shows Enter, and Enter starts a new game",
      asked === "Start a new game?" && over.title === "Game Over" && over.cap === "Space or Enter" && !again.shown && again.score === "0", { asked, over, again });
    check("2048 (keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Quick Minute: the crash card's buttons show Enter and ⌫, and Enter drives again
  {
    const p = await lib.open(ctx, base, "games/quick-minute/");
    await p.keyboard.press("1"); await p.keyboard.press("Enter"); await p.waitForFunction(() => __game.running, null, { timeout: 5000 });
    await p.evaluate(() => __game.obstacles.push({ lane: __game.player.lane, y: 566, w: 44, h: 84, type: "car", color: "#bcc0c6", cx: __game.player.x, pending: false, merging: false, mergeDir: 0, mergeTo: -1, mergeStartY: 0, wc: 0 }));
    await p.waitForFunction(() => !__game.running && !!document.getElementById("btn-menu"), null, { timeout: 5000 });
    const caps = await p.evaluate(() => [document.getElementById("btn-again").getAttribute("data-gs-key"), document.getElementById("btn-menu").getAttribute("data-gs-key")].join(" "));
    await p.keyboard.press("Enter"); await settle(p, 300);
    const running = await p.evaluate(() => __game.running);
    check("quick-minute: the crash card's Drive again shows Space or Enter and Change mode ⌫; Enter drives again", caps === "Space or Enter ⌫" && running, { caps, running });
    await p.close();
  }

  // ---- Sudoku: U undoes, ? takes a hint, F2 is New puzzle (which wants a second press)
  {
    const p = await lib.open(ctx, base, "games/sudoku/");
    const st = () => p.evaluate(() => ({ filled: document.querySelectorAll("#board .cell.user, #board .cell.given, #board .cell.hinted").length, hints: document.getElementById("hintBadge").textContent, hintShown: !document.getElementById("hintBadge").hidden, newText: document.getElementById("newBtn").textContent, undoOff: document.getElementById("undoBtn").disabled }));
    const s0 = await st();
    await p.keyboard.press("?"); await settle(p);
    const s1 = await st();
    await p.keyboard.press("F2"); await settle(p, 150);
    const s2 = await st();
    await p.keyboard.press("u"); await settle(p);
    const s3 = await st();
    check("sudoku: ? takes a hint (the badge counts it), F2 presses New puzzle (which asks for a second press), and U undoes the hint",
      s1.hintShown && s1.hints === "1" && !s1.undoOff && /again/i.test(s2.newText) && !/again/i.test(s0.newText) && s3.undoOff, { s0, s1, s2, s3 });
    check("sudoku (keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Tile Maze: ? opens the guide; E / Q change level, asking first once the level has moves on it
  {
    const p = await lib.open(ctx, base, "games/tile-maze/", { before: (pg) => pg.addInitScript(() => { try { localStorage.setItem("tileMaze.v1", '{"done":["First Steps"],"open":[],"bestTimes":{}}'); } catch (e) {} }) });
    const lvl = () => p.evaluate(() => document.getElementById("lvlNum").textContent);
    await p.keyboard.press("?"); await settle(p, 150);
    const guide = await p.evaluate(() => !document.getElementById("guideOverlay").hidden);
    await p.keyboard.press("Escape"); await settle(p, 150);
    const l0 = await lvl();                                                                 // (level 1 is done, so it opens on 2)
    await p.keyboard.press("q"); await settle(p); const l1 = await lvl(), b1 = await box(p);        // a fresh level: at once
    await p.keyboard.press("e"); await settle(p); const back = await lvl();
    await p.keyboard.press("e"); await settle(p); const shut = await lvl();                        // (level 3 isn't open: nothing)
    await p.keyboard.press("ArrowRight"); await p.waitForTimeout(700);
    await p.keyboard.press("q"); await p.waitForSelector(".gs-dialog", { timeout: 5000 }).catch(() => {});
    const b2 = await box(p), l2 = await lvl();
    await p.keyboard.press("Enter"); await settle(p); const l3 = await lvl();
    check("tile-maze: ? opens the Tile Guide; Q and E change level at once from a fresh one (not to a locked one); with moves made Q asks 'Leave this level?' and Enter goes",
      guide && l0 === "2" && l1 === "1" && !b1 && back === "2" && shut === "2" && b2 === "Leave this level?" && l2 === "2" && l3 === "1", { guide, l0, l1, b1, back, shut, b2, l2, l3 });
    check("tile-maze (keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Darkroom: G opens the gallery (Esc comes back); in a negative Backspace is the ← button
  {
    const p = await lib.open(ctx, base, "games/darkroom/");
    await p.keyboard.press("g"); await settle(p); const s1 = await p.evaluate(() => Darkroom.state().screen);
    await p.keyboard.press("Escape"); await settle(p); const s2 = await p.evaluate(() => Darkroom.state().screen);
    await p.evaluate(() => Darkroom.open("plus")); await settle(p);
    const s3 = await p.evaluate(() => Darkroom.state().screen);
    await p.keyboard.press("Backspace"); await settle(p); const s4 = await p.evaluate(() => Darkroom.state().screen);
    check("darkroom: G opens the gallery and Esc comes back; in a negative Backspace goes back to the darkroom, as ← does (never leaving the page)",
      s1 === "gallery" && s2 === "menu" && s3 === "puzzle" && s4 === "menu" && p.leaves === 0, { s1, s2, s3, s4, leaves: p.leaves });
    await p.close();
  }

  // ---- Klondike: F1 is Help's How to play, and the box's OK shows Enter
  {
    const p = await lib.open(ctx, base, "games/klondike/");
    await p.keyboard.press("F1"); await settle(p);
    const k = await p.evaluate(() => ({ open: !document.getElementById("shade").hidden, title: document.getElementById("mb-title").textContent, ok: (document.querySelector("#mb-row button") || { getAttribute: () => null }).getAttribute("data-gs-key") }));
    await p.keyboard.press("Enter"); await settle(p);
    const shut = await p.evaluate(() => document.getElementById("shade").hidden);
    check("klondike: F1 opens How to play; its OK shows Enter, and Enter closes it", k.open && k.title === "How to play" && k.ok === "Enter" && shut, { k, shut });
    await p.close();
  }

  // ---- the bars under the three board games: ? the rules, R and N asking first mid-game
  for (const [g, move] of [["dots-and-boxes", ".line, .edge, [data-line]"], ["tic-tac-toe", "#board .cell, #board button"]]) {
    const p = await lib.open(ctx, base, "games/" + g + "/", { before: noFlip });
    await p.keyboard.press("Enter"); await p.waitForTimeout(900);          // start with the picker's choices
    await p.keyboard.press("?"); await settle(p, 150);
    const rules = await p.evaluate(() => document.getElementById("rulesModal").classList.contains("open"));
    await p.keyboard.press("Enter"); await settle(p, 150);
    const shut = await p.evaluate(() => !document.getElementById("rulesModal").classList.contains("open"));
    await p.evaluate((sel) => { const e = document.querySelector(sel); if (e) e.dispatchEvent(new MouseEvent("click", { bubbles: true })); }, move);
    await p.waitForTimeout(400);
    const live = await p.evaluate(() => GameShell.leaveActive());
    await p.keyboard.press("r"); await settle(p, 300); const br = await box(p);
    await p.keyboard.press("Escape"); await settle(p);
    await p.keyboard.press("n"); await settle(p, 300); const bn = await box(p);
    await p.keyboard.press("Escape"); await settle(p);
    const picker = await p.evaluate(() => document.getElementById("modeModal").classList.contains("open"));
    check(g + ": ? opens the Rules and Enter is Got it; mid-game R asks 'Start over?' and N 'Start a new game?' (Esc keeps the game)",
      rules && shut && live && br === "Start over?" && bn === "Start a new game?" && !picker, { rules, shut, live, br, bn, picker });
    check(g + " (bar keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Hash: A adds three cards, H lights a hint, N a new game (asking first once the game's begun)
  {
    const p = await lib.open(ctx, base, "games/hash/");
    const lit = () => p.evaluate(() => document.querySelectorAll("#board .card.hint, #board .card.hinted").length);
    const h0 = await lit();
    await p.keyboard.press("h"); await settle(p); const h1 = await lit();
    await p.keyboard.press("n"); await settle(p, 300); const b = await box(p);
    await p.keyboard.press("Escape"); await settle(p); const h2 = await lit();
    check("hash: H lights a card of a Hash; N then asks 'Start a new game?' and Esc keeps the game", h0 === 0 && h1 === 1 && b === "Start a new game?" && h2 === 1, { h0, h1, b, h2 });
    check("hash (keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Demolition Row: in play Backspace is ☰ Menu; paused, R and Backspace ask first; on the result Enter plays again
  {
    const p = await lib.open(ctx, base, "games/demolition-row/");
    await p.click("#play-btn"); await p.waitForTimeout(400);
    await p.keyboard.press("Backspace"); await settle(p, 300); const b0 = await box(p);
    await p.keyboard.press("Escape"); await settle(p);
    await p.click(".gs-pause-btn, #pause-btn"); await settle(p); const st1 = await p.evaluate(() => GAME.state);
    await p.keyboard.press("r"); await settle(p, 300); const b1 = await box(p);
    await p.keyboard.press("Escape"); await settle(p); const st2 = await p.evaluate(() => GAME.state);
    await p.keyboard.press("Enter"); await settle(p);
    await p.evaluate(() => GAME.end("t", "m")); await settle(p, 200);
    await p.keyboard.press("Enter"); await settle(p, 400);
    const st3 = await p.evaluate(() => GAME.state);
    check("demolition-row: Backspace in play asks 'Quit this game?'; on the pause card R asks 'Restart this game?' (Esc stays paused); on the result Enter plays again",
      b0 === "Quit this game?" && st1 === "paused" && b1 === "Restart this game?" && st2 === "paused" && st3 === "playing", { b0, st1, b1, st2, st3 });
    check("demolition-row (keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Chess: N asks before a new game once a move's on the board; F flips; on three.html E opens the end rules
  {
    const p = await lib.open(ctx, base, "games/chess/");
    await p.keyboard.press("2"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    const f0 = await p.evaluate(() => document.querySelector(".sq").dataset.i);      // (the first square drawn: the far corner, or the near one once flipped)
    await p.keyboard.press("f"); await settle(p, 200);
    const f1 = await p.evaluate(() => document.querySelector(".sq").dataset.i);
    await p.keyboard.press("n"); await settle(p, 300); const fresh = await box(p);      // no move yet: at once, no question
    check("chess: F flips the board, and N on a board with no move made starts over without asking", f0 !== f1 && !fresh, { f0, f1, fresh });
    check("chess (keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
    const q = await lib.open(ctx, base, "games/chess/three.html");
    await q.keyboard.press("1"); await q.keyboard.press("Enter"); await q.waitForTimeout(300);
    await q.keyboard.press("e"); await settle(q, 300);
    const menu = await q.evaluate(() => document.getElementById("menu").classList.contains("show"));
    check("chess, 3 players: E opens the end rules again", menu, menu);
    await q.close();
  }

  // ---- Yi: at the table D draws; in the colour box a letter picks the colour; Space calls YI!
  {
    const p = await lib.open(ctx, base, "games/yi/", { before: noFlip });
    await p.keyboard.press("Enter"); await p.waitForTimeout(1200);
    const caps = await p.evaluate(() => [...document.querySelectorAll("#controls [data-gs-key]")].map((e) => e.getAttribute("data-gs-key")).join(" "));
    await p.evaluate(() => showColorPicker(function (c) { window.__picked = c; }));
    await settle(p, 200);
    const colour = await p.evaluate(() => [...document.querySelectorAll("#modal .color-choices [data-gs-key]")].map((e) => e.getAttribute("data-gs-key")).join(""));
    await p.keyboard.press("g"); await settle(p, 200);
    await p.evaluate(() => showUnoButton(function () { window.__uno = (window.__uno || 0) + 1; hideOverlay(); }));
    await settle(p, 200);
    const uno = await p.evaluate(() => document.getElementById("unoBtn").getAttribute("data-gs-key"));
    await p.keyboard.press("Space"); await settle(p, 200);
    const got = await p.evaluate(() => ({ picked: window.__picked, uno: window.__uno }));
    check("yi: Draw shows D (and Pass S when it is there; Quit to menu has gone to the pause card); the colour box takes R Y G B (G is green); YI! shows Space and Space calls it, once",
      /^D( S)?$/.test(caps) && colour === "RYGB" && got.picked === "green" && uno === "Space" && got.uno === 1, { caps, colour, uno, got });
    check("yi (keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Crazy Ohio: Backspace is Cancel during a run too
  {
    const p = await lib.open(ctx, base, "games/crazy-ohio/");
    const sec = () => p.evaluate(() => ["setup", "play", "result"].find((id) => !document.getElementById(id).hidden));
    await p.keyboard.press("Enter"); await p.waitForTimeout(3800);
    const s1 = await sec();
    await p.keyboard.press("Backspace"); await settle(p, 200);
    const s2 = await sec();
    check("crazy-ohio: Backspace during a run is its Cancel button (back to setup)", s1 === "play" && s2 === "setup", { s1, s2 });
    await p.close();
  }

  // ---- 24: a number on the phone's menu moves the bar without opening the line; Enter opens it
  {
    const p = await lib.open(ctx, base, "games/24/");
    await p.keyboard.press("2"); await settle(p, 200);
    const a = await p.evaluate(() => TwentyFour.state().screen);
    await p.keyboard.press("1"); await p.keyboard.press("2"); await settle(p, 150);
    const b = await p.evaluate(() => TwentyFour.state().screen);
    await p.keyboard.press("Enter"); await settle(p, 300);
    const c = await p.evaluate(() => ({ screen: TwentyFour.state().screen, mode: TwentyFour.state().G && TwentyFour.state().G.mode }));
    check("24: a number on the menu moves the bar without starting (2, 1, 2: still the menu); Enter then starts line 2, Time attack",
      a === "menu" && b === "menu" && c.screen === "game" && c.mode === "timed", { a, b, c });
    // the phone's own keypad is another matter: a tap (or a click) on its 2 opens line 2 at once
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector(".mute-toggle"); await settle(p, 300);
    await p.click('[data-key="2"]'); await settle(p, 300);
    const tap = await p.evaluate(() => ({ screen: TwentyFour.state().screen, mode: TwentyFour.state().G && TwentyFour.state().G.mode }));
    check("24: the same number tapped on the phone's keypad opens its line at once (2 starts Time attack)", tap.screen === "game" && tap.mode === "timed", tap);
    check("24 (menu keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Road Bird: 1-4 go to a mode without starting it; Enter starts the one the number chose
  {
    const p = await lib.open(ctx, base, "games/road-bird/");
    await p.waitForTimeout(300);
    await p.keyboard.press("3"); await settle(p, 150);
    const a = await p.evaluate(() => ({ state: __game.state, sel: __game.menuSel }));
    await p.keyboard.press("9"); await p.keyboard.press("2"); await settle(p, 150);       // (no ninth mode: nothing)
    const b = await p.evaluate(() => ({ state: __game.state, sel: __game.menuSel }));
    await p.keyboard.press("Enter"); await settle(p, 400);
    const c = await p.evaluate(() => ({ state: __game.state, mode: __game.mode }));
    check("road-bird: 3 goes to the third mode and 2 to the second without starting; Enter starts Cars & Trucks",
      a.state === "menu" && a.sel === 2 && b.state === "menu" && b.sel === 1 && c.state === "playing" && c.mode === "cars", { a, b, c });
    check("road-bird (menu keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Spacer: 1 2 3 go to a life mode on the title without starting; Enter starts with it
  {
    const p = await lib.open(ctx, base, "games/spacer/");
    await p.waitForTimeout(300);
    await p.keyboard.press("3"); await settle(p, 150);
    const a = await p.evaluate(() => ({ mode: game.mode, at: game.menuIndex }));
    await p.keyboard.press("2"); await settle(p, 150);
    const b = await p.evaluate(() => ({ mode: game.mode, at: game.menuIndex }));
    await p.keyboard.press("Enter"); await settle(p, 500);
    const c = await p.evaluate(() => ({ mode: game.mode, lives: game.lives }));
    check("spacer: 3 goes to Infinite and 2 to 1 Life on the title without starting; Enter starts with one life",
      a.mode === "attract" && a.at === 2 && b.mode === "attract" && b.at === 1 && c.mode !== "attract" && c.lives === 1, { a, b, c });
    check("spacer (menu keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- on a phone none of the new keycaps show
  {
    const { devices } = require("@playwright/test");
    const phone = await lib.newContext(browser, devices["Pixel 7"]);
    const shown = [];
    // [page, a button that has a keycap now]: it's there, and hidden with every other one
    for (const [g, sel] of [["hash/", "#addBtn"], ["chess/", "#newBtn"], ["dots-and-boxes/", "#rules"], ["logicgate/", "#hintBtn"], ["2048/", "#new-game"]]) {
      const p = await lib.open(phone, base, "games/" + g, { before: noFlip });
      const has = await p.evaluate((sel) => !!document.querySelector(sel + "[data-gs-key]"), sel);
      const n = await p.evaluate(() => [...document.querySelectorAll("[data-gs-key]")].filter((e) => e.getClientRects().length && getComputedStyle(e, "::after").display !== "none").length);
      if (n || !has) shown.push(g + " " + n + (has ? "" : " (no keycap on " + sel + ")"));
      await p.close();
    }
    check("on a touch-only device the buttons' keycaps are hidden", shown.length === 0, shown);
    await phone.close();
  }

  await ctx.close();
};
