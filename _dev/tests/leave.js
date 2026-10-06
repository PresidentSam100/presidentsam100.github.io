// The way out: Home leaves any game for the games page; Esc does too unless
// the game used it (pause, resume, closing a panel). End screens send Esc to
// the games page and Backspace to the game's own menu. Trips to the games
// page are counted, not followed (page.leaves, see lib.newContext).
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const EDITORS = ["slither/editor.html", "tile-maze/editor.html"];   // Esc never leaves (it would lose work)
  const settle = (p) => p.waitForTimeout(250);   // the shared handler decides after the key's dispatch

  // ---- every page: Home leaves; Esc on the opening screen leaves (not in an editor)
  const homeBad = [], escBad = [];
  for (const g of lib.gamePages()) {
    for (const key of ["Home", "Escape"]) {
      const p = await lib.open(ctx, base, "games/" + g, { settle: 300 });
      await p.mouse.move(5, 300);
      await p.keyboard.press(key); await settle(p);
      const want = key === "Escape" && EDITORS.includes(g) ? 0 : 1;
      // (nothing is in progress on an opening screen, so nothing asks first)
      const asked = await p.evaluate(() => !!document.querySelector(".gs-dialog"));
      if (p.leaves !== want || asked) (key === "Home" ? homeBad : escBad).push(g + " " + p.leaves + (asked ? " (asked)" : ""));
      if (p.errs.length) (key === "Home" ? homeBad : escBad).push(g + " errors: " + p.errs[0]);
      await p.close();
    }
  }
  check("Home leaves every game for the games page", homeBad.length === 0, homeBad);
  check("Esc on a game's opening screen leaves for the games page (editors excepted)", escBad.length === 0, escBad);

  // ---- leaving mid-game asks first ("Leave this game?"), pausing the game
  {
    const p = await lib.open(ctx, base, "games/abyss/");
    const st = () => p.evaluate(() => ({ dlg: (document.querySelector(".gs-dialog h2") || {}).textContent || null, paused: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden }));
    await p.keyboard.press("Enter"); await p.waitForTimeout(400);
    await p.keyboard.press("Home"); await settle(p);
    const asked = await st();
    await p.keyboard.press("Escape"); await settle(p);
    const kept = await st();
    await p.click(".nav-back-games"); await settle(p);
    const askedLink = await st();
    await p.keyboard.press("Enter"); await settle(p);
    check("mid-game, Home and ← Games ask 'Leave this game?' (game paused); Esc keeps playing, Enter leaves",
      asked.dlg === "Leave this game?" && asked.paused && !kept.dlg && !kept.paused && askedLink.dlg === "Leave this game?" && p.leaves === 1,
      { asked, kept, askedLink, leaves: p.leaves });
    await p.close();
  }

  // ---- the "← Games" button shows Home on wide screens
  {
    const p = await lib.open(ctx, base, "games/abyss/");
    const cap = await p.evaluate(() => { const b = document.querySelector(".nav-back-games"); return { key: (b.querySelector(".gs-kbd") || {}).textContent, ks: b.getAttribute("aria-keyshortcuts") }; });
    check("the ← Games button shows a Home keycap", cap.key === "Home" && /Home/.test(cap.ks), cap);
    await p.close();
  }

  // ---- text fields keep Home for the caret; a game's own answer box doesn't
  {
    const p = await lib.open(ctx, base, "games/slither/editor.html");
    await p.click("#ed-name"); await p.keyboard.press("Home"); await settle(p);
    check("Home in an editor's text field stays put", p.leaves === 0, p.leaves);
    await p.close();
  }
  {
    const p = await lib.open(ctx, base, "games/metazac/");
    await p.click("#start-btn"); await p.waitForTimeout(400);
    await p.focus("#answer"); await p.keyboard.press("Home"); await settle(p);
    // (mid-game, so it asks first: Home still works from the answer box)
    const asked = await p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent);
    await p.keyboard.press("Enter"); await settle(p);
    check("Home in a typing game's answer box works (asks mid-game, then leaves)", asked === "Leave this game?" && p.leaves === 1, { asked, leaves: p.leaves });
    await p.close();
  }

  // ---- a dialog holds the keys: Home waits, Esc closes it
  {
    const p = await lib.open(ctx, base, "games/lights-out/");
    await p.evaluate(() => { GameShell.copyBox({ text: "x" }); });
    await p.keyboard.press("Home"); await settle(p);
    const l1 = p.leaves;
    await p.keyboard.press("Escape"); await settle(p);
    const open = await p.evaluate(() => !!document.querySelector(".gs-dialog"));
    check("with a dialog up, Home doesn't leave and Esc only closes it", l1 === 0 && p.leaves === 0 && !open, { l1, l2: p.leaves, open });
    await p.close();
  }

  // ---- during play Esc pauses (and resumes) and never leaves
  const starts = {
    "abyss/": async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(400); },
    "mahjong/": async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(500); },
    "ping/": async (p) => { await p.click('#menu .btn[data-mode="1"]'); await p.waitForTimeout(3500); },
    "departures/": async (p) => { await p.evaluate(() => Departures.start("world")); await p.waitForTimeout(300); },
  };
  for (const g of Object.keys(starts)) {
    const p = await lib.open(ctx, base, "games/" + g);
    await starts[g](p);
    await p.keyboard.press("Escape"); await settle(p);
    const paused = await p.evaluate(() => { const c = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!c && !c.hidden; });
    await p.keyboard.press("Escape"); await settle(p);
    const resumed = await p.evaluate(() => { const c = document.querySelector(".gs-pause:not(.gs-dialog)"); return !c || c.hidden; });
    check(g + " play: Esc pauses and resumes, never leaving", paused && resumed && p.leaves === 0, { paused, resumed, leaves: p.leaves });
    check(g + ": no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- end screens: Esc leaves; Backspace goes back to the game's own menu
  // [game, toEnd(p), state(p) -> string, menu state, before(pg)?]
  const ends = [
    ["abyss", async (p) => { await p.evaluate(() => { Abyss.start("descent"); }); await p.waitForTimeout(200); await p.evaluate(() => Abyss.gameOver()); },
      (p) => p.evaluate(() => Abyss.state()), "menu",
      (pg) => lib.injectScript(pg, "games/abyss/game.js", [["start: startRun,", "start: startRun, gameOver: gameOver,"]])],
    ["departures", async (p) => { await p.evaluate(() => { Departures.start("world"); }); await p.waitForTimeout(200); await p.evaluate(() => Departures.giveUp()); },
      (p) => p.evaluate(() => Departures.state()), "menu"],
    ["fish-a-fish", async (p) => { await p.evaluate(() => { FishAFish.start("daybreak"); FishAFish.setTime(0); }); await p.waitForTimeout(900); },
      (p) => p.evaluate(() => FishAFish.state().state), "menu"],
    ["flappy-world", async (p) => { await p.keyboard.press("Space"); await p.waitForTimeout(200); await p.evaluate(() => game.die()); await p.waitForTimeout(100); },
      (p) => p.evaluate(() => game.gameState), "MENU"],
    ["demolition-row", async (p) => { await p.click("#play-btn"); await p.waitForTimeout(300); await p.evaluate(() => GAME.end("t", "m")); await p.waitForTimeout(100); },
      (p) => p.evaluate(() => (typeof GAME === "undefined" || !GAME) ? "menu" : GAME.state), "menu"],
    ["road-bird", async (p) => { await p.keyboard.press("Space"); await p.waitForTimeout(300); await p.evaluate(() => __game.death("runover")); await p.waitForFunction(() => __game.state === "dead", null, { timeout: 5000 }); },
      (p) => p.evaluate(() => __game.state), "menu"],
    ["sunset-slice", async (p) => { await p.evaluate(() => { SunsetSlice.start("lastlight"); SunsetSlice.setTime(0.01); }); await p.waitForFunction(() => SunsetSlice.state().state === "over", null, { timeout: 5000 }); },
      (p) => p.evaluate(() => SunsetSlice.state().state), "menu"],
    ["24", async (p) => { await p.keyboard.press("2"); await p.waitForTimeout(300); await p.evaluate(() => { TwentyFour.state().G.timeLeft = 1; }); await p.waitForFunction(() => TwentyFour.state().screen === "timeup", null, { timeout: 5000 }); },
      (p) => p.evaluate(() => TwentyFour.state().screen), "menu"],
    ["lanterns", async (p) => { await p.evaluate(() => Lanterns.start("festival")); await p.waitForTimeout(300); await p.evaluate(() => Lanterns.gameOver()); await p.waitForTimeout(900); },
      (p) => p.evaluate(() => Lanterns.state()), "menu",
      (pg) => lib.injectScript(pg, "games/lanterns/game.js", [["start: startRun,", "start: startRun, gameOver: gameOver,"]])],
    ["science-fair", async (p) => { await p.evaluate(() => { ScienceFair.fast(); ScienceFair.start(); }); await p.waitForFunction(() => ScienceFair.state() === "input", null, { timeout: 8000 });
        await p.evaluate(() => { const s = ScienceFair.seq(); ScienceFair.press((s[0] + 1) % 4); }); await p.waitForFunction(() => ScienceFair.state() === "over", null, { timeout: 8000 }); },
      (p) => p.evaluate(() => ScienceFair.state()), "menu"],
    ["lights-out", async (p) => { await p.evaluate(() => LightsOut.start("zen")); await p.waitForTimeout(300); await p.evaluate(() => LightsOut.solution().forEach((i) => LightsOut.press(i)));
        await p.waitForFunction(() => !document.getElementById("over").hidden, null, { timeout: 8000 }); },
      (p) => p.evaluate(() => LightsOut.state()), "menu"],
    ["tall-order", async (p) => { await p.evaluate(() => TallOrder.start("bakery")); await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 8000 });
        await p.evaluate(() => TallOrder.placeAndDrop(1000)); await p.waitForFunction(() => TallOrder.state() === "over", null, { timeout: 8000 }); },
      (p) => p.evaluate(() => TallOrder.state()), "menu"],
    ["typetwo", async (p) => { await p.click('.mode[data-mode="hard"]'); await p.keyboard.press("Enter"); await p.waitForTimeout(150); await p.keyboard.press("q");
        await p.waitForFunction(() => __game.state === "over", null, { timeout: 8000 }); await p.waitForTimeout(200); },
      (p) => p.evaluate(() => __game.state), "start"],
    ["metazac", async (p) => { await p.click("#start-btn"); await p.waitForTimeout(400); await p.evaluate(() => window.__end()); await p.waitForTimeout(900); },
      (p) => p.evaluate(() => !document.getElementById("overlay-start").classList.contains("hidden") ? "menu" : !document.getElementById("overlay-over").classList.contains("hidden") ? "over" : "play"), "menu",
      (pg) => lib.injectScript(pg, "games/metazac/game.js", [["  function endGame() {", "  window.__end = function () { endGame(); };\n  function endGame() {"]])],
    ["slither", async (p) => { await p.click("#play-btn"); await p.waitForFunction(() => !document.getElementById("result").classList.contains("hidden"), null, { timeout: 15000 }); await p.waitForTimeout(200); },
      (p) => p.evaluate(() => !document.getElementById("menu").classList.contains("hidden") ? "menu" : "result"), "menu"],
  ];
  for (const [g, toEnd, state, menu, before] of ends) {
    const p = await lib.open(ctx, base, "games/" + g + "/", before ? { before } : undefined);
    await toEnd(p);
    const s0 = await state(p);
    await p.keyboard.press("Escape"); await settle(p);
    const l1 = p.leaves;
    await p.keyboard.press("Backspace"); await settle(p);
    const s1 = await state(p);
    check(g + " end screen: Esc leaves, Backspace goes to the game's menu", s0 !== menu && l1 === 1 && s1 === menu && p.leaves === 1, { s0, l1, s1, leaves: p.leaves });
    check(g + " end screen: no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Flappy World's guide: Esc closes it (and stays)
  {
    const p = await lib.open(ctx, base, "games/flappy-world/");
    await p.keyboard.press("i"); await p.waitForTimeout(200);
    const s0 = await p.evaluate(() => game.gameState);
    await p.keyboard.press("Escape"); await settle(p);
    const s1 = await p.evaluate(() => game.gameState);
    check("flappy-world: Esc closes the guide, without leaving", s0 === "INFO" && s1 === "MENU" && p.leaves === 0, { s0, s1, leaves: p.leaves });
    await p.close();
  }

  // ---- Spacer: Esc closes the guide (stays); during play it pauses (stays)
  {
    const p = await lib.open(ctx, base, "games/spacer/");
    await p.keyboard.press("e"); await p.waitForTimeout(200);
    const m0 = await p.evaluate(() => game.mode);
    await p.keyboard.press("Escape"); await settle(p);
    const m1 = await p.evaluate(() => game.mode);
    await p.keyboard.press("Enter"); await p.waitForTimeout(2600);
    await p.keyboard.press("Escape"); await settle(p);
    const m2 = await p.evaluate(() => game.mode);
    check("spacer: Esc closes the guide, and pauses a game, never leaving", m0 === "gallery" && m1 !== "gallery" && m2 === "paused" && p.leaves === 0, { m0, m1, m2, leaves: p.leaves });
    await p.close();
  }

  // ---- Poodle Jump: Esc pauses a run (its loop reads the key; the keydown claims it)
  {
    const p = await lib.open(ctx, base, "games/poodle-jump/");
    await p.keyboard.press("Space"); await p.waitForTimeout(400);
    await p.keyboard.press("Escape"); await settle(p);
    const r = await p.evaluate(() => ({ state: __game.state, paused: __game.paused }));
    check("poodle-jump: Esc pauses a run without leaving", r.paused && p.leaves === 0, { r, leaves: p.leaves });
    await p.close();
  }

  // ---- Esc that keeps you in place: Steamfitter's level editor, Tile Maze's guide,
  // Klondike's How to play
  {
    let p = await lib.open(ctx, base, "games/steamfitter/");
    await p.evaluate(() => __game.startEditor(null)); await p.waitForTimeout(200);
    await p.keyboard.press("Escape"); await settle(p);
    const sf = await p.evaluate(() => __game.state);
    check("steamfitter: Esc in the level editor keeps your work (doesn't leave)", sf === "edit" && p.leaves === 0, { sf, leaves: p.leaves });
    await p.close();
    p = await lib.open(ctx, base, "games/tile-maze/");
    await p.click("#guideBtn"); await p.waitForTimeout(150);
    await p.keyboard.press("Escape"); await settle(p);
    const tm = await p.evaluate(() => document.getElementById("guideOverlay").hidden);
    check("tile-maze: Esc closes the Tile Guide without leaving", tm && p.leaves === 0, { tm, leaves: p.leaves });
    await p.keyboard.press("Escape"); await settle(p);
    check("tile-maze: with the guide shut, Esc leaves", p.leaves === 1, p.leaves);
    await p.close();
    p = await lib.open(ctx, base, "games/klondike/");
    await p.evaluate(() => document.getElementById("m-rules").click()); await p.waitForTimeout(150);
    await p.keyboard.press("Escape"); await settle(p);
    const kl = await p.evaluate(() => document.getElementById("shade").hidden);
    check("klondike: Esc closes How to play without leaving", kl && p.leaves === 0, { kl, leaves: p.leaves });
    await p.close();
  }

  // ---- Click Tap (no pause): mid-run Backspace quits to setup; Esc leaves
  {
    const p = await lib.open(ctx, base, "games/click-tap/");
    await p.click('[data-dur="3"]'); await p.click("#startBtn"); await p.waitForTimeout(200);
    const shown = () => p.evaluate(() => ["setup", "play", "result"].find((id) => { const e = document.getElementById(id); return e && !e.hidden; }));
    const s0 = await shown();
    await p.keyboard.press("Backspace"); await settle(p);
    const s1 = await shown();
    await p.keyboard.press("Escape"); await settle(p);
    check("click-tap: mid-run Backspace quits to setup; Esc leaves", s0 === "play" && s1 === "setup" && p.leaves === 1, { s0, s1, leaves: p.leaves });
    await p.close();
  }

  // ---- Corner Pocket: Esc closes the spin pad (and stays)
  {
    const p = await lib.open(ctx, base, "games/corner-pocket/");
    await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });   // you break, so it's your aim
    await p.click("#startBtn");
    await p.waitForFunction(() => window.__pool && __pool.G.phase === "aim", null, { timeout: 8000 });
    await p.evaluate(() => document.getElementById("spinPad").classList.remove("hidden"));
    await p.keyboard.press("Escape"); await settle(p);
    const r = await p.evaluate(() => ({ pad: !document.getElementById("spinPad").classList.contains("hidden"), phase: __pool.G.phase }));
    check("corner-pocket: Esc closes the spin pad without leaving or pausing", !r.pad && p.leaves === 0, { r, leaves: p.leaves });
    await p.close();
  }

  await ctx.close();
};
