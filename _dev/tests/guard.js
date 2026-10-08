// Leaving mid-game asks first, and bests are saved the moment they're earned.
// For each game: GameShell.leaveActive() is false on a fresh screen and true
// once something would be lost; a score-type best reaches storage mid-run.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const active = (p) => p.evaluate(() => GameShell.leaveActive());
  const ls = (p, k) => p.evaluate((k) => localStorage.getItem(k), k);
  const seed = (pg, kv) => pg.addInitScript((kv) => { for (const k in kv) try { localStorage.setItem(k, kv[k]); } catch (e) {} }, kv);
  const done = async (p, g) => { check(g + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // a real mouse click on the middle cell of a Minesweeper field
  // (Endless has no first-click safety, so there it flags the cell instead: that starts a run too)
  const clickMidCell = async (p, button) => {
    const pt = await p.evaluate(() => { const c = document.querySelectorAll(".field .c"); const e = c[Math.floor(c.length / 2)]; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.click(pt.x, pt.y, button ? { button } : undefined); await p.waitForTimeout(200);
  };
  // [game, path, makeActive(p), before(pg)?] — fresh screen inactive, then active
  const guards = [
    ["jam-jar", "jam-jar/", (p) => p.evaluate(() => __game.drop())],
    ["mahjong", "mahjong/", async (p) => { await p.evaluate(() => Mahjong.start("classic")); await p.waitForTimeout(300); await p.evaluate(() => Mahjong.removeOnePair()); }],
    ["klondike", "klondike/", (p) => p.evaluate(() => Klondike.draw())],
    ["lights-out", "lights-out/", async (p) => { await p.evaluate(() => LightsOut.start("zen")); await p.waitForTimeout(200); await p.evaluate(() => LightsOut.press(0)); }],
    ["link-many", "link-many/", async (p) => { await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); }); await p.click("#startGame"); await p.waitForFunction(() => !__game.busy); await p.evaluate(() => __game.humanMove(3)); }],
    ["hash", "hash/", (p) => p.click("#hintBtn")],
    ["flappy-world", "flappy-world/", async (p) => { await p.keyboard.press("Space"); await p.waitForTimeout(150); }],
    ["lanterns", "lanterns/", async (p) => { await p.evaluate(() => Lanterns.start("festival")); await p.waitForTimeout(200); }],
    ["meteor-menace", "meteor-menace/", async (p) => { await p.evaluate(() => __game.start()); await p.waitForTimeout(200); }],
    ["logicgate", "logicgate/", async (p) => { await p.click('.mode-btn[data-mode="inputs"]'); await p.waitForTimeout(150); await p.click(".input.toggle"); }],
    ["2048", "2048/", async (p) => { for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) { await p.keyboard.press(k); await p.waitForTimeout(80); } }],
    ["24", "24/", async (p) => { await p.evaluate(() => TwentyFour.press("1")); await p.waitForTimeout(200); await p.evaluate(() => { TwentyFour.press("1"); TwentyFour.press("5"); TwentyFour.press("2"); }); }],
    ["abyss", "abyss/", (p) => p.evaluate(() => Abyss.start("descent"))],
    ["chess", "chess/", async (p) => { await p.click('#menu .modebtn[data-mode="2"]'); await p.click("#setup2Start"); await p.waitForTimeout(200); await p.click('.sq[data-i="52"]'); await p.click('.sq[data-i="36"]'); }],
    ["click-tap", "click-tap/", async (p) => { await p.click("#startBtn"); await p.waitForTimeout(150); await p.evaluate(() => { const pad = document.getElementById("pad"), r = pad.getBoundingClientRect(); pad.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true })); }); }],
    ["corner-pocket", "corner-pocket/", async (p) => { await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); }); await p.click("#startBtn"); await p.waitForFunction(() => __pool.G.phase === "aim"); await p.evaluate(() => __pool.shoot(0, 0.5)); }],
    ["crazy-ohio", "crazy-ohio/", async (p) => { await p.click("#startBtn"); await p.waitForTimeout(1900); }],
    ["demolition-row", "demolition-row/", (p) => p.evaluate(() => { sel.mode = "endless"; startGame(); })],
    ["departures", "departures/", async (p) => { await p.evaluate(() => Departures.start("continent", "OC")); const a = await p.evaluate(() => GameShell.leaveActive()); if (a) throw new Error("departures: active before a name"); await p.evaluate(() => Departures.enter("Australia")); }],
    ["dots-and-boxes", "dots-and-boxes/", async (p) => { await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); }); await p.click("#startGame"); await p.waitForTimeout(200); await p.evaluate(() => play("h", 0, 0)); }],
    ["fish-a-fish", "fish-a-fish/", (p) => p.evaluate(() => FishAFish.start("daybreak"))],
    ["neon-pinball", "neon-pinball/", async (p) => { await p.evaluate(() => NeonPinball.start("classic")); if (await active(p)) throw new Error("pinball: active on the plunger"); await p.evaluate(() => NeonPinball.setScore(100)); }],
    ["passport", "passport/", async (p) => { await p.evaluate(() => { Passport.fast(); Passport.start("tour"); }); await p.waitForTimeout(150); if (await active(p)) throw new Error("passport: active before an answer"); await p.evaluate(() => Passport.answer(Passport.current().correct)); }],
    ["ping", "ping/", async (p) => { await p.click('#menu .btn[data-mode="1"]'); await p.waitForTimeout(3500); if (await active(p)) throw new Error("ping: active at 0-0"); await p.evaluate(() => { __game.left.score = 1; }); }],
    ["poodle-jump", "poodle-jump/", async (p) => { await p.evaluate(() => __game.start()); await p.waitForTimeout(150); await p.evaluate(() => { __game.bestY -= 1000; }); await p.waitForTimeout(200); }],
    ["quick-minute", "quick-minute/", async (p) => { await p.evaluate(() => __game.start("day")); await p.waitForTimeout(200); }],
    ["reaction", "reaction/", async (p) => { await p.click("#btn-start"); await p.waitForTimeout(200); await p.keyboard.press("Space"); }],
    ["road-bird", "road-bird/", async (p) => { await p.keyboard.press("Space"); await p.waitForTimeout(300); await p.keyboard.press("ArrowUp"); await p.waitForTimeout(300); }],
    ["salvo", "salvo/", async (p) => { await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); }); await p.keyboard.press("a"); await p.keyboard.press("Enter"); await p.waitForTimeout(300); await p.click("#enemyGrid .cell"); }],
    ["science-fair", "science-fair/", async (p) => { await p.evaluate(() => { ScienceFair.fast(); ScienceFair.start("classic"); }); await p.waitForFunction(() => ScienceFair.state() === "input", null, { timeout: 8000 }); await p.evaluate(() => ScienceFair.press(ScienceFair.seq()[0])); }],
    ["spacer", "spacer/", async (p) => { await p.evaluate(() => game.startGame()); await p.waitForTimeout(200); await p.evaluate(() => game.addScore(100)); }],
    ["speedle", "speedle/", async (p) => { await p.click("#m-sprint"); await p.waitForTimeout(200); if (await active(p)) throw new Error("speedle: active before a letter"); await p.keyboard.press("q"); }],
    ["stopwatch", "stopwatch/", async (p) => { await p.click("#btn-start"); await p.waitForTimeout(200); if (await active(p)) throw new Error("stopwatch: active before the first sweep"); await p.keyboard.press("Space"); }],
    ["sunset-slice", "sunset-slice/", (p) => p.evaluate(() => SunsetSlice.start("calm"))],
    ["tall-order", "tall-order/", async (p) => { await p.evaluate(() => TallOrder.start("bakery")); await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 8000 }); await p.evaluate(() => TallOrder.placeAndDrop(0)); await p.waitForTimeout(300); }],
    ["tic-tac-toe", "tic-tac-toe/", async (p) => { await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); }); await p.click("#startGame"); await p.waitForTimeout(200); await p.evaluate(() => __TTT_TEST__.humanMove(0)); }],
    ["typetwo", "typetwo/", async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(200); }],
    ["yi", "yi/", async (p) => { await p.click("#startBtn"); await p.waitForTimeout(300); await p.evaluate(() => drawCards(1, 1)); }],
    ["tile-maze", "tile-maze/", async (p) => { for (const k of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) { if (await active(p)) break; await p.keyboard.press(k); await p.waitForTimeout(250); } }],
    ["tile-maze editor", "tile-maze/editor.html", async (p) => { await p.fill("#nameIn", "My level " + Date.now()); }],
    ["metazac", "metazac/", async (p) => { await p.click("#start-btn"); await p.waitForTimeout(400); }],
    // (a middle cell: the top-left one sits under the fixed ← Games button)
    ["minesweeper", "minesweeper/", (p) => clickMidCell(p)],
    ["minesweeper endless", "minesweeper/endless.html", (p) => clickMidCell(p, "right")],
    ["pop-the-lock", "pop-the-lock/", async (p) => { await p.keyboard.press("Space"); await p.waitForTimeout(300); await p.keyboard.press("Space"); await p.waitForTimeout(150); },
      (pg) => lib.injectScript(pg, "games/pop-the-lock/game.js", [["if (d <= tol) pop();", "if (true) pop();"]])],
    ["slither", "slither/", async (p) => { await p.click("#play-btn"); await p.waitForTimeout(300); await p.evaluate(() => { const s = __G.snakes[0]; __G.food = { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y }; }); await p.waitForTimeout(500); },
      (pg) => lib.injectScript(pg, "games/slither/game.js", [["  var G = {", "  var G = window.__G = {"]])],
    ["steamfitter panic", "steamfitter/", async (p) => { await p.evaluate(() => { __game.setMode("panic"); __game.setQueue(["H", "H", "H", "H", "H"]); }); await p.waitForTimeout(150);
      await p.evaluate(() => { const s = __game.src, d = { E: [0, 1], W: [0, -1], N: [-1, 0], S: [1, 0] }[s.dir] || [0, 1]; __game.place(s.r + d[0], s.c + d[1]); }); await p.waitForTimeout(150); }],
    // (select the first cell whose piece can move, then play a hinted move)
    ["chess three", "chess/three.html", async (p) => { await p.click("#menu .modebtn"); await p.waitForTimeout(200);
      await p.evaluate(() => { for (const c of document.querySelectorAll("polygon[data-c]")) { c.dispatchEvent(new MouseEvent("click", { bubbles: true })); if (document.querySelector("circle.hint")) break; } });
      await p.evaluate(() => document.querySelector("circle.hint").dispatchEvent(new MouseEvent("click", { bubbles: true }))); await p.waitForTimeout(200); }],
  ];
  for (const [g, path, act, before] of guards) {
    const p = await lib.open(ctx, base, "games/" + path, before ? { before } : undefined);
    const a0 = await active(p);
    await act(p); await p.waitForTimeout(150);
    const a1 = await active(p);
    check(g + ": nothing to lose on a fresh screen; in progress once played", a0 === false && a1 === true, { a0, a1 });
    await done(p, g);
  }

  // ---- Darkroom saves every stroke, so it never asks
  {
    const p = await lib.open(ctx, base, "games/darkroom/");
    await p.evaluate(() => { Darkroom.open("plus"); Darkroom.apply(0, 0, "fill"); });
    check("darkroom: never asks (every stroke is saved)", (await active(p)) === false, null);
    await done(p, "darkroom");
  }

  // ---- Spacer: Home on a banner pauses it under the box; Keep playing goes back to it
  {
    const p = await lib.open(ctx, base, "games/spacer/");
    await p.evaluate(() => { game.startGame(); game.addScore(100); }); await p.waitForTimeout(150);
    await p.keyboard.press("Home"); await p.waitForTimeout(250);
    const m1 = await p.evaluate(() => ({ mode: game.mode, prev: game.prevMode, dlg: !!document.querySelector(".gs-dialog") }));
    await p.keyboard.press("Escape"); await p.waitForTimeout(250);
    const m2 = await p.evaluate(() => game.mode);
    check("spacer: Home on the READY banner asks with the game paused; Keep playing returns to it", m1.dlg && m1.mode === "paused" && m1.prev === "ready" && m2 === "ready" && p.leaves === 0, { m1, m2, leaves: p.leaves });
    await done(p, "spacer ask");
  }

  // ---- Sudoku saves itself, so it never asks
  {
    const p = await lib.open(ctx, base, "games/sudoku/");
    await p.waitForTimeout(300); await p.click("#hintBtn"); await p.waitForTimeout(200);
    check("sudoku: never asks (the puzzle saves itself)", (await active(p)) === false, null);
    await done(p, "sudoku");
  }

  // ---- a stray Space after Home keeps playing (the box focuses Keep playing)
  {
    const p = await lib.open(ctx, base, "games/tall-order/");
    await p.evaluate(() => TallOrder.start("bakery")); await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 8000 });
    await p.evaluate(() => TallOrder.placeAndDrop(0)); await p.waitForTimeout(400);
    await p.keyboard.press("Home"); await p.waitForTimeout(200);
    const focus = await p.evaluate(() => document.activeElement && document.activeElement.textContent);
    await p.keyboard.press("Space"); await p.waitForTimeout(250);
    const r = await p.evaluate(() => ({ dlg: !!document.querySelector(".gs-dialog"), state: TallOrder.state() }));
    check("a reflex Space in the 'Leave this game?' box keeps playing", /Keep playing/.test(focus) && !r.dlg && r.state === "play" && p.leaves === 0, { focus, r, leaves: p.leaves });
    await done(p, "tall-order space");
  }

  // ---- GameShell.askQuit: a game's own New game / Restart asks the same
  // question, but only while a game is in progress, with it paused underneath
  {
    const p = await lib.open(ctx, base, "games/tall-order/");
    const ask = () => p.evaluate(() => { window.__went = 0; GameShell.askQuit({ title: "Start over?" }, () => { window.__went++; }); });
    const box = () => p.evaluate(() => { const d = document.querySelector(".gs-dialog"); return { open: !!d, title: d ? d.querySelector("h2").textContent : "", went: window.__went }; });
    await ask(); const fresh = await box();
    await p.evaluate(() => TallOrder.start("bakery")); await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 8000 });
    await p.evaluate(() => TallOrder.placeAndDrop(0)); await p.waitForTimeout(400);
    await ask(); const mid = await box();
    const paused = await p.evaluate(() => GameShell.leaveActive() && !!document.querySelector(".gs-dialog"));
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    const kept = await box();
    await ask(); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    const quit = await box();
    check("askQuit: goes at once with no game in progress; mid-game asks first, Esc keeps playing, Enter goes",
      !fresh.open && fresh.went === 1 && mid.open && mid.title === "Start over?" && mid.went === 0 && paused && !kept.open && kept.went === 0 && !quit.open && quit.went === 1 && p.leaves === 0,
      { fresh, mid, kept, quit, leaves: p.leaves });
    await done(p, "askQuit");
  }

  // ---- Tile Maze's editor: unsaved work makes "← Back to game" ask too
  {
    const p = await lib.open(ctx, base, "games/tile-maze/editor.html");
    await p.fill("#nameIn", "Unsaved " + Date.now());
    await p.click('a[data-leave]'); await p.waitForTimeout(200);
    const dlg = await p.evaluate(() => (document.querySelector(".gs-dialog p") || {}).textContent);
    check("tile-maze editor: '← Back to game' asks when the level isn't saved", /isn't saved/.test(dlg || ""), dlg);
    await done(p, "tile-maze editor link");
  }

  // ---- with bests saved mid-run, the results still say "new best" when (and
  // only when) the run beat the best it started from
  const text = (p) => p.evaluate(() => document.body.innerText);
  for (const [lowSeed, want] of [["1", true], ["999999", false]]) {
    const tag = want ? "beats a low best: says so" : "falls short of a high best: doesn't";
    // Abyss
    let p = await lib.open(ctx, base, "games/abyss/", { before: async (pg) => { await seed(pg, { abyss_best_descent: lowSeed }); await lib.injectScript(pg, "games/abyss/game.js", [["start: startRun,", "start: startRun, gameOver: gameOver,"]]); } });
    await p.evaluate(() => { Abyss.start("descent"); Abyss.hard(); }); await p.waitForTimeout(150);
    await p.evaluate(() => Abyss.gameOver()); await p.waitForTimeout(900);
    check("abyss results " + tag, /a new record/.test(await text(p)) === want, (await text(p)).slice(0, 200));
    await done(p, "abyss results");
    // Lanterns
    p = await lib.open(ctx, base, "games/lanterns/", { before: async (pg) => { await seed(pg, { lanterns_best_festival: want ? "0" : lowSeed }); await lib.injectScript(pg, "games/lanterns/game.js", [["start: startRun,", "start: startRun, gameOver: gameOver,"]]); } });
    await p.evaluate(() => Lanterns.start("festival"));
    await p.waitForFunction(() => Lanterns.active().length > 0, null, { timeout: 6000 });
    await p.evaluate(() => Lanterns.type(Lanterns.active()[0].key)); await p.waitForTimeout(200);
    await p.evaluate(() => Lanterns.gameOver()); await p.waitForTimeout(900);
    check("lanterns results " + tag, /a new record night/.test(await text(p)) === want, null);
    await done(p, "lanterns results");
    // Science Fair
    p = await lib.open(ctx, base, "games/science-fair/", { before: (pg) => seed(pg, { scifair_best_classic: want ? "0" : "99" }) });
    await p.evaluate(() => { ScienceFair.fast(); ScienceFair.start("classic"); });
    await p.waitForFunction(() => ScienceFair.state() === "input", null, { timeout: 8000 });
    await p.evaluate(() => ScienceFair.press(ScienceFair.seq()[0]));
    await p.waitForFunction(() => ScienceFair.state() === "input", null, { timeout: 8000 });
    await p.evaluate(() => { const s = ScienceFair.seq(); ScienceFair.press((s[0] + 1) % 4); });
    await p.waitForFunction(() => ScienceFair.state() === "over", null, { timeout: 8000 });
    check("science-fair results " + tag, /a new best/.test(await text(p)) === want, null);
    await done(p, "science-fair results");
    // Quick Minute
    p = await lib.open(ctx, base, "games/quick-minute/", { before: (pg) => seed(pg, { rushhour_best_day: want ? "5" : lowSeed }) });
    await p.evaluate(() => { __game.start("day"); __game.addScore(500); }); await p.waitForTimeout(400);
    await p.evaluate(() => __game.obstacles.push({ lane: __game.player.lane, y: 566, w: 44, h: 84, type: "car", color: "#bcc0c6", cx: __game.player.x, pending: false, merging: false, mergeDir: 0, mergeTo: -1, mergeStartY: 0, wc: 0 }));
    await p.waitForFunction(() => !__game.running, null, { timeout: 5000 }); await p.waitForTimeout(1500);
    check("quick-minute results " + tag, /NEW BEST/.test(await text(p)) === want, null);
    await done(p, "quick-minute results");
    // Flappy World (drawn on the canvas: the condition its game-over card checks)
    p = await lib.open(ctx, base, "games/flappy-world/", { before: (pg) => seed(pg, { flappyWorld_hiScore_1: lowSeed, flappyWorld_hiScore_3: lowSeed }) });
    await p.keyboard.press("Space"); await p.waitForTimeout(100);
    await p.evaluate(() => { game.score = 5; }); await p.waitForTimeout(150);
    await p.evaluate(() => game.die()); await p.waitForTimeout(300);
    const fb = await p.evaluate(() => !!(game.newBestThisRound && game.score === game.hiScores[game.livesMode]));
    check("flappy-world results " + tag, fb === want, fb);
    await done(p, "flappy-world results");
  }

  // ---- bests reach storage mid-run
  {
    const p = await lib.open(ctx, base, "games/tall-order/", { before: (pg) => seed(pg, { tallorder_best_bakery: "1" }) });
    await p.evaluate(() => TallOrder.start("bakery")); await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 8000 });
    await p.evaluate(() => TallOrder.placeAndDrop(0)); await p.waitForTimeout(400);
    check("tall-order: a taller tower is saved as it lands", Number(await ls(p, "tallorder_best_bakery")) >= 2 && (await p.evaluate(() => TallOrder.state())) === "play", await ls(p, "tallorder_best_bakery"));
    await done(p, "tall-order best");
  }
  {
    const p = await lib.open(ctx, base, "games/typetwo/", { before: (pg) => seed(pg, { wordfall_best_normal: "0", wordfall_best_easy: "0", wordfall_best_hard: "0" }) });
    await p.keyboard.press("Enter");
    await p.waitForFunction(() => __game.words && __game.words.length > 0, null, { timeout: 8000 });
    const w = await p.evaluate(() => __game.words[0].text);
    await p.keyboard.type(w); await p.waitForTimeout(600);
    const v = await p.evaluate(() => Object.keys(localStorage).filter((k) => /^wordfall_best_/.test(k)).map((k) => k + "=" + localStorage.getItem(k)));
    check("typetwo: a kill past the best is saved mid-run", v.some((s) => Number(s.split("=")[1]) > 0) && (await p.evaluate(() => __game.state)) === "playing", v);
    await done(p, "typetwo best");
  }
  {
    const p = await lib.open(ctx, base, "games/neon-pinball/", { before: (pg) => seed(pg, { pinball_best: "5" }) });
    await p.evaluate(() => { NeonPinball.start("classic"); NeonPinball.setScore(1000); }); await p.waitForTimeout(150);
    check("neon-pinball: a new best is saved mid-game", Number(await ls(p, "pinball_best")) >= 1000, await ls(p, "pinball_best"));
    await done(p, "neon-pinball best");
  }
  {
    const p = await lib.open(ctx, base, "games/spacer/", { before: (pg) => seed(pg, { galaga_high: "5" }) });
    await p.evaluate(() => { game.startGame(); game.addScore(500); }); await p.waitForTimeout(100);
    check("spacer: a new best is saved mid-run", Number(await ls(p, "galaga_high")) >= 500, await ls(p, "galaga_high"));
    await done(p, "spacer best");
  }
  {
    const p = await lib.open(ctx, base, "games/poodle-jump/", { before: (pg) => seed(pg, { dj_high: "5" }) });
    await p.evaluate(() => __game.start()); await p.waitForTimeout(150);
    await p.evaluate(() => { __game.bestY -= 1000; }); await p.waitForTimeout(400);
    check("poodle-jump: a new best is saved mid-run", Number(await ls(p, "dj_high")) >= 100, await ls(p, "dj_high"));
    await done(p, "poodle-jump best");
  }
  {
    const p = await lib.open(ctx, base, "games/quick-minute/", { before: (pg) => seed(pg, { rushhour_best_day: "5" }) });
    await p.evaluate(() => { __game.start("day"); __game.addScore(500); }); await p.waitForTimeout(450);
    check("quick-minute: a new best distance is saved mid-run", Number(await ls(p, "rushhour_best_day")) >= 500 && (await p.evaluate(() => __game.running)), await ls(p, "rushhour_best_day"));
    await done(p, "quick-minute best");
  }
  {
    const p = await lib.open(ctx, base, "games/road-bird/", { before: (pg) => seed(pg, { crossy_high_classic: "0" }) });
    await p.keyboard.press("Space"); await p.waitForTimeout(300); await p.keyboard.press("ArrowUp"); await p.waitForTimeout(300);
    check("road-bird: a new best is saved as you hop", Number(await ls(p, "crossy_high_classic")) >= 1 && (await p.evaluate(() => __game.state)) === "playing", await ls(p, "crossy_high_classic"));
    await done(p, "road-bird best");
  }
  {
    const p = await lib.open(ctx, base, "games/passport/", { before: (pg) => seed(pg, { passport_best_tour: "0" }) });
    await p.evaluate(() => { Passport.fast(); Passport.start("tour"); }); await p.waitForTimeout(150);
    await p.evaluate(() => Passport.answer(Passport.current().correct));
    check("passport: a stamp past the best is saved at once", (await ls(p, "passport_best_tour")) === "1", await ls(p, "passport_best_tour"));
    await done(p, "passport best");
  }
  {
    const p = await lib.open(ctx, base, "games/science-fair/", { before: (pg) => seed(pg, { scifair_best_classic: "0" }) });
    await p.evaluate(() => { ScienceFair.fast(); ScienceFair.start("classic"); });
    await p.waitForFunction(() => ScienceFair.state() === "input", null, { timeout: 8000 });
    await p.evaluate(() => ScienceFair.press(ScienceFair.seq()[0])); await p.waitForTimeout(100);
    check("science-fair: a cleared round past the best is saved at once", Number(await ls(p, "scifair_best_classic")) >= 1 && (await p.evaluate(() => ScienceFair.state())) !== "over", await ls(p, "scifair_best_classic"));
    await done(p, "science-fair best");
  }
  {
    const p = await lib.open(ctx, base, "games/abyss/", { before: (pg) => seed(pg, { abyss_best_descent: "5" }) });
    await p.evaluate(() => { Abyss.start("descent"); Abyss.hard(); }); await p.waitForTimeout(150);
    const v = await ls(p, "abyss_best_descent");
    check("abyss: a new best is saved mid-run", Number(v) > 5 && (await p.evaluate(() => Abyss.state())) !== "over", v);
    await done(p, "abyss best");
  }
  {
    const p = await lib.open(ctx, base, "games/demolition-row/", { before: (pg) => seed(pg, { demolitionRow_endlessBest: "5" }) });
    await p.evaluate(() => { sel.mode = "endless"; startGame(); }); await p.waitForTimeout(200);
    await p.evaluate(() => { GAME.players[0].board.score = 50; }); await p.waitForTimeout(200);
    const v = await ls(p, "demolitionRow_endlessBest");
    check("demolition-row: a new best is saved mid-run", Number(v) >= 50, v);
    await done(p, "demolition-row best");
  }
  {
    const p = await lib.open(ctx, base, "games/departures/", { before: (pg) => seed(pg, { departures_best: '{"OC":{"n":0,"t":1000}}' }) });
    await p.evaluate(() => { Departures.start("continent", "OC"); Departures.enter("Australia"); });
    const v = JSON.parse(await ls(p, "departures_best"));
    check("departures: a board that beats the best is saved as you name it", v.OC && v.OC.n === 1 && (await p.evaluate(() => Departures.state())) === "play", v);
    await done(p, "departures best");
  }
  {
    const p = await lib.open(ctx, base, "games/click-tap/");
    await p.click('[data-dur="3"]'); await p.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^clicktap_best_/.test(k)) localStorage.setItem(k, "0.1"); });
    await p.click("#startBtn"); await p.waitForTimeout(150);
    await p.evaluate(() => { const pad = document.getElementById("pad"), r = pad.getBoundingClientRect(); for (let i = 0; i < 3; i++) pad.dispatchEvent(new PointerEvent("pointerdown", { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2, bubbles: true })); });
    const v = await p.evaluate(() => Object.keys(localStorage).filter((k) => /^clicktap_best_/.test(k)).map((k) => k + "=" + localStorage.getItem(k)));
    check("click-tap: the best climbs with each click, mid-run", v.some((s) => Number(s.split("=")[1]) > 0.1), v);
    await done(p, "click-tap best");
  }
  {
    const p = await lib.open(ctx, base, "games/fish-a-fish/");
    await p.evaluate(() => { FishAFish.start("daybreak"); FishAFish.hold(); FishAFish.force(0, "golden", "bite"); FishAFish.press(0, null); });
    await p.waitForTimeout(150);
    const v = await p.evaluate(() => Object.keys(localStorage).filter((k) => /^fishafish_best_daybreak/.test(k)).map((k) => localStorage.getItem(k)));
    check("fish-a-fish: a catch past the best is saved mid-run", v.some((x) => Number(x) > 0), v);
    await done(p, "fish-a-fish best");
  }
  {
    const p = await lib.open(ctx, base, "games/meteor-menace/", { before: (pg) => seed(pg, { asteroids_best: "100" }) });
    await p.evaluate(() => { __game.start(); __game.addScore(500); }); await p.waitForTimeout(300);
    const v = await ls(p, "asteroids_best");
    check("meteor-menace: a new best is saved mid-run", Number(v) >= 500 && (await p.evaluate(() => GameShell.leaveActive())), v);
    await done(p, "meteor-menace best");
  }
  {
    const p = await lib.open(ctx, base, "games/flappy-world/", { before: (pg) => seed(pg, { flappyWorld_hiScore_1: "1", flappyWorld_hiScore_3: "1" }) });
    await p.keyboard.press("Space"); await p.waitForTimeout(100);
    await p.evaluate(() => { game.score = 5; }); await p.waitForTimeout(150);
    const v = await p.evaluate(() => [localStorage.getItem("flappyWorld_hiScore_1"), localStorage.getItem("flappyWorld_hiScore_3")]);
    check("flappy-world: a new best is saved mid-run", v.includes("5"), v);
    await done(p, "flappy-world best");
  }
  {
    const p = await lib.open(ctx, base, "games/jam-jar/", { before: (pg) => seed(pg, { jamjar_best: "1" }) });
    await p.evaluate(() => { __game.setQueue(0, 0); __game.setAim(240); __game.drop(); }); await p.waitForTimeout(600);
    await p.evaluate(() => { __game.setQueue(0, 0); __game.setAim(240); __game.drop(); });
    await p.waitForFunction(() => Number(localStorage.getItem("jamjar_best")) > 1, null, { timeout: 5000 }).catch(() => {});
    const v = await ls(p, "jamjar_best");
    check("jam-jar: a merge that beats the best saves it at once", Number(v) > 1 && (await p.evaluate(() => __game.state)) === "play", v);
    await done(p, "jam-jar best");
  }
  {
    const p = await lib.open(ctx, base, "games/lanterns/", { before: (pg) => seed(pg, { lanterns_best_festival: "0" }) });
    await p.evaluate(() => Lanterns.start("festival"));
    await p.waitForFunction(() => Lanterns.active().length > 0, null, { timeout: 6000 });
    await p.evaluate(() => Lanterns.type(Lanterns.active()[0].key)); await p.waitForTimeout(200);
    const v = await ls(p, "lanterns_best_festival");
    check("lanterns: lighting a lantern past the best saves it at once", Number(v) > 0 && (await p.evaluate(() => Lanterns.state())) === "play", v);
    await done(p, "lanterns best");
  }
  {
    const p = await lib.open(ctx, base, "games/metazac/", { before: (pg) => seed(pg, { metazac_best: "0" }) });
    await p.evaluate(() => {
      for (const id of ["add-min1", "add-max1", "add-min2", "add-max2"]) { const e = document.getElementById(id); e.value = "1"; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); }
      for (const id of ["sub-on", "mul-on", "div-on"]) { const e = document.getElementById(id); if (e.checked) e.click(); }
    });
    await p.click("#start-btn"); await p.waitForTimeout(1200);
    await p.focus("#answer"); await p.keyboard.type("2"); await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    const v = await ls(p, "metazac_best");
    check("metazac: a popped balloon past the best saves it at once", Number(v) > 0, v);
    await done(p, "metazac best");
  }

  await ctx.close();
};
