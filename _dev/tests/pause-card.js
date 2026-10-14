// The pause card's Restart and Menu, in every game that pauses. Paused, the
// card offers Resume, Restart (R) and Menu (Backspace). Restart asks first
// while there is a game to lose: any other key keeps it, still paused, and
// Enter starts the same game over, un-paused. Menu goes back to the game's own
// menu with nothing left paused, and a game started from there plays and
// pauses again. Each game is driven into a game in progress the way guard.js
// does it. A game that draws its own pause screen has the two as a row laid
// over it (GameShell.pauseMore) in place of the card: the same checks. In a
// game that pauses on Esc because its letters are the game's own (esc: true),
// Restart has no letter key: R typed at the paused game does nothing.
// name, path, start(p): a game in progress. fresh(p): the same game, started
// over. menu(p): the game's own menu is up. Optional: acts (the card's
// buttons, when not both), asks (Restart always asks: a game that saves
// itself), again(p) (what a fresh game needs before it can pause),
// pause(p) (no ⏸ corner button), before(pg), settle (ms), same (the game
// in progress can't be told from a fresh one by what fresh() reads).
const table = (lib) => [
  { name: "ping", path: "ping/",
    start: async (p) => { await p.click('#menu .btn[data-mode="1"]'); await p.waitForFunction(() => state === "playing", null, { timeout: 15000 }); await p.evaluate(() => { left.score = 1; }); },
    fresh: (p) => p.evaluate(() => (state === "countdown" || state === "playing") && left.score + right.score === 0),
    menu: (p) => p.evaluate(() => state === "menu" && !document.getElementById("menu").classList.contains("hidden")) },
  { name: "abyss", path: "abyss/",
    start: (p) => p.evaluate(() => { Abyss.start("descent"); Abyss.hard(); }),
    fresh: (p) => p.evaluate(() => Abyss.state() === "play" && Abyss.score() === 0 && Abyss.mode() === "descent"),
    menu: (p) => p.evaluate(() => Abyss.state() === "menu" && !document.getElementById("menu").hidden) },
  { name: "lanterns", path: "lanterns/", esc: true,
    start: async (p) => { await p.evaluate(() => Lanterns.start("festival")); await p.waitForFunction(() => Lanterns.active().length > 0, null, { timeout: 8000 }); await p.evaluate(() => Lanterns.type(Lanterns.active()[0].key)); await p.waitForFunction(() => Lanterns.score() > 0, null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => Lanterns.state() === "play" && Lanterns.score() === 0),
    menu: (p) => p.evaluate(() => Lanterns.state() === "menu" && !document.getElementById("menu").hidden) },
  { name: "science-fair", path: "science-fair/",
    start: async (p) => { await p.evaluate(() => { ScienceFair.fast(); ScienceFair.start("classic"); }); await p.waitForFunction(() => ScienceFair.state() === "input", null, { timeout: 8000 }); await p.evaluate(() => ScienceFair.press(ScienceFair.seq()[0])); await p.waitForFunction(() => GameShell.leaveActive() && ScienceFair.seq().length > 1, null, { timeout: 8000 }); },   // (round 2's note is in: not to be told from a fresh run before it is)
    fresh: (p) => p.evaluate(() => /^(between|watch|input)$/.test(ScienceFair.state()) && ScienceFair.seq().length <= 1 && ScienceFair.mode() === "classic"),
    menu: (p) => p.evaluate(() => ScienceFair.state() === "menu" && !document.getElementById("menu").hidden) },
  { name: "tall-order", path: "tall-order/",
    start: async (p) => { await p.evaluate(() => TallOrder.start("bakery")); await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 8000 }); await p.evaluate(() => TallOrder.placeAndDrop(0)); await p.waitForFunction(() => GameShell.leaveActive(), null, { timeout: 15000 }); },
    fresh: (p) => p.evaluate(() => TallOrder.state() === "play" && TallOrder.tiers() === 1),
    menu: (p) => p.evaluate(() => TallOrder.state() === "menu" && !document.getElementById("menu").hidden) },
  { name: "mahjong", path: "mahjong/",
    start: async (p) => { await p.evaluate(() => Mahjong.start("classic")); await p.waitForTimeout(300); await p.evaluate(() => Mahjong.removeOnePair()); },
    fresh: (p) => p.evaluate(() => Mahjong.state() === "play" && Mahjong.tilesLeft() === 144 && !GameShell.leaveActive()),
    menu: (p) => p.evaluate(() => Mahjong.state() === "menu" && !document.getElementById("menu").hidden) },
  { name: "passport (a dash)", path: "passport/", esc: true,
    start: async (p) => { await p.evaluate(() => { Passport.fast(); Passport.start("dash"); }); await p.waitForTimeout(150); await p.evaluate(() => Passport.answer(Passport.current().correct)); await p.waitForFunction(() => Passport.state() === "ask" && Passport.score() > 0, null, { timeout: 8000 }); },
    fresh: (p) => p.evaluate(() => Passport.state() === "ask" && Passport.score() === 0 && Passport.mode() === "dash"),
    menu: (p) => p.evaluate(() => Passport.state() === "menu" && !document.getElementById("menu").hidden) },
  { name: "departures", path: "departures/", esc: true,
    start: (p) => p.evaluate(() => { Departures.start("continent", "OC"); Departures.enter("Australia"); }),
    fresh: (p) => p.evaluate(() => Departures.state() === "play" && Departures.found() === 0 && !document.getElementById("answer").disabled),
    menu: (p) => p.evaluate(() => Departures.state() === "menu" && !document.getElementById("menu").hidden && document.activeElement.id !== "answer") },
  { name: "fish-a-fish", path: "fish-a-fish/", esc: true,
    start: async (p) => { await p.evaluate(() => { FishAFish.start("daybreak"); FishAFish.hold(); FishAFish.force(0, "golden", "bite"); FishAFish.press(0, null); }); await p.waitForFunction(() => FishAFish.state().score > 0, null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => { const s = FishAFish.state(); return s.state === "play" && s.score === 0 && s.mode === "daybreak"; }),
    menu: (p) => p.evaluate(() => FishAFish.state().state === "menu") },
  { name: "quick-minute", path: "quick-minute/",
    start: (p) => p.evaluate(() => { __game.start("night"); __game.addScore(200); }),
    fresh: (p) => p.evaluate(() => __game.running && __game.score < 100 && __game.mode === "night"),
    menu: (p) => p.evaluate(() => !__game.running && !!document.getElementById("m-day") && document.getElementById("overlay").classList.contains("show")) },
  { name: "meteor-menace", path: "meteor-menace/", acts: ["restart"],
    start: (p) => p.evaluate(() => { __game.start(); __game.addScore(500); }),
    fresh: (p) => p.evaluate(() => __game.state === "play" && __game.score === 0 && __game.wave === 1) },
  { name: "jam-jar", path: "jam-jar/", acts: ["restart"],
    start: async (p) => { await p.evaluate(() => __game.drop()); await p.waitForFunction(() => GameShell.leaveActive(), null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => __game.state === "play" && __game.fruits.length === 0 && __game.score === 0) },
  { name: "hash", path: "hash/", acts: ["restart"],
    start: (p) => p.click("#hintBtn"),
    fresh: (p) => p.evaluate(() => !GameShell.leaveActive() && document.querySelectorAll("#board .card").length >= 12 && !document.querySelector("#board.paused")) },
  { name: "klondike", path: "klondike/", acts: ["restart"],
    start: async (p) => { await p.evaluate(() => { window.__seed = Klondike.state().seed; Klondike.draw(); }); },
    fresh: (p) => p.evaluate(() => { const s = Klondike.state(); return s.moves === 0 && s.seed === window.__seed && !s.paused && s.waste === ""; }) },
  { name: "minesweeper", path: "minesweeper/", acts: ["restart"],
    start: async (p) => { const pt = await p.evaluate(() => { const c = document.querySelectorAll(".field .c"); const e = c[Math.floor(c.length / 2)]; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await p.mouse.click(pt.x, pt.y); await p.waitForFunction(() => GameShell.leaveActive(), null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => !GameShell.leaveActive() && !document.querySelector(".field.paused") && !document.querySelector(".field .c.open, .field .c.o")) },
  { name: "minesweeper endless", path: "minesweeper/endless.html", acts: ["restart"],
    start: async (p) => { const pt = await p.evaluate(() => { const c = document.querySelectorAll(".field .c"); const e = c[Math.floor(c.length / 2)]; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }); await p.mouse.click(pt.x, pt.y, { button: "right" }); await p.waitForFunction(() => GameShell.leaveActive(), null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => !GameShell.leaveActive() && !document.querySelector(".field.paused")) },
  { name: "metazac", path: "metazac/", esc: true,
    start: async (p) => { await p.click("#start-btn"); await p.waitForTimeout(400); },
    fresh: (p) => p.evaluate(() => document.getElementById("overlay-start").classList.contains("hidden") && document.getElementById("overlay-over").classList.contains("hidden") && !document.getElementById("answer").disabled),
    menu: (p) => p.evaluate(() => !document.getElementById("overlay-start").classList.contains("hidden") && document.getElementById("answer").disabled) },
  { name: "typetwo", path: "typetwo/", esc: true,
    start: async (p) => { await p.keyboard.press("Enter"); await p.waitForFunction(() => __game.state === "playing" && __game.words && __game.words.length > 0, null, { timeout: 8000 }); await p.keyboard.type(await p.evaluate(() => __game.words[0].text)); await p.waitForFunction(() => __game.score > 0, null, { timeout: 8000 }); },
    fresh: (p) => p.evaluate(() => __game.state === "playing" && __game.score === 0),
    menu: (p) => p.evaluate(() => __game.state === "start") },
  { name: "dead-end", path: "dead-end/",
    start: async (p) => { await p.evaluate(() => DeadEnd.start("classic")); await p.waitForTimeout(200); await p.keyboard.press("ArrowLeft"); await p.waitForFunction(() => GameShell.leaveActive(), null, { timeout: 5000 }); },
    again: async (p) => { await p.keyboard.press("ArrowLeft"); },
    fresh: (p) => p.evaluate(() => DeadEnd.ui() === "run" && !GameShell.leaveActive() && DeadEnd.st().score === 0),
    menu: (p) => p.evaluate(() => DeadEnd.ui() === "menu" && !document.getElementById("menu").hidden) },
  { name: "crazy-ohio", path: "crazy-ohio/", same: true,
    start: async (p) => { await p.click("#startBtn"); await p.waitForSelector('.gs-pause-btn[aria-disabled="false"]', { timeout: 15000 }); },
    fresh: (p) => p.evaluate(() => !document.getElementById("play").hidden && document.getElementById("vScore").textContent === "0"),
    menu: (p) => p.evaluate(() => !document.getElementById("setup").hidden && document.getElementById("play").hidden) },
  { name: "corner-pocket", path: "corner-pocket/",
    start: async (p) => { await p.click("#startBtn"); await p.waitForFunction(() => __pool.G.phase === "aim", null, { timeout: 15000 }); await p.evaluate(() => __pool.shoot(0, 0.5)); await p.waitForFunction(() => GameShell.leaveActive(), null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => __pool.G.shots === 0 && /^(flip|aim|cpu)$/.test(__pool.G.phase)),
    menu: (p) => p.evaluate(() => __pool.G.phase === "menu" && !document.getElementById("menu").classList.contains("hidden")) },
  { name: "darkroom", path: "darkroom/", asks: true,
    start: (p) => p.evaluate(() => { Darkroom.open("plus"); Darkroom.apply(0, 0, "fill"); }),
    fresh: (p) => p.evaluate(() => { const s = Darkroom.state(); return s.screen === "puzzle" && s.id === "plus" && !/[12]/.test(s.cells) && !s.paused; }),
    menu: (p) => p.evaluate(() => Darkroom.state().screen === "menu") },
  { name: "neon-pinball", path: "neon-pinball/",
    start: (p) => p.evaluate(() => { NeonPinball.start("speedway"); NeonPinball.setScore(100); }),
    fresh: (p) => p.evaluate(() => { const s = NeonPinball.state(); return s.state === "ready" && s.score === 0 && s.ballNum === 1 && document.getElementById("startScreen").classList.contains("hidden"); }),
    menu: (p) => p.evaluate(() => NeonPinball.state().state === "start" && NeonPinball.state().balls.length === 0 && !document.getElementById("startScreen").classList.contains("hidden")) },
  { name: "pop-the-lock", path: "pop-the-lock/",
    before: (pg) => lib.injectScript(pg, "games/pop-the-lock/game.js", [["if (d <= tol) pop();", "if (true) pop();"]]),
    start: async (p) => { await p.keyboard.press("Space"); await p.waitForTimeout(300); await p.keyboard.press("Space"); await p.waitForFunction(() => document.getElementById("score").textContent !== "0", null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => document.getElementById("overlay").classList.contains("hidden") && document.getElementById("score").textContent === "0"),
    menu: (p) => p.evaluate(() => !document.getElementById("overlay").classList.contains("hidden") && /^PLAY/.test(document.getElementById("play").textContent) && /Tap when the dial/.test(document.getElementById("overlay-msg").textContent)) },
  // a level: Restart deals the same level again, Menu is the level list
  { name: "steamfitter (a level)", path: "steamfitter/",
    start: async (p) => { await p.evaluate(() => { __game.setMode("levels"); __game.loadLevel(2); const g = __game.grid; window.__first = JSON.stringify(g); for (let r = 0; r < g.length; r++) for (let c = 0; c < g[r].length; c++) if (g[r][c].kind === "pipe" && !__game.moves) __game.rotateAt(r, c); }); await p.waitForFunction(() => __game.moves > 0, null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => __game.state === "play" && __game.moves === 0 && __game.curLevel === 2 && JSON.stringify(__game.grid) === window.__first),
    menu: (p) => p.evaluate(() => __game.state === "select" && !document.getElementById("levelSelect").classList.contains("hidden")) },
  // a Panic run: Restart is the run again from level 1; the card has no Menu (the mode bar is on the page)
  { name: "steamfitter (panic)", path: "steamfitter/", acts: ["restart"],
    start: async (p) => { await p.evaluate(() => { __game.setMode("panic"); __game.setQueue(["H", "H", "H", "H", "H"]); }); await p.waitForTimeout(150);
      await p.evaluate(() => { const s = __game.src, d = { E: [0, 1], W: [0, -1], N: [-1, 0], S: [1, 0] }[s.dir] || [0, 1]; __game.place(s.r + d[0], s.c + d[1]); }); await p.waitForFunction(() => GameShell.leaveActive(), null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => __game.state === "play" && __game.mode === "panic" && __game.level === 1 && !__game.grid.some((row) => row.some((c) => c.kind === "pipe"))) },
  { name: "sudoku", path: "sudoku/", acts: ["restart"], asks: true,
    pause: (p) => p.click("#pauseBtn"),
    start: async (p) => { await p.waitForSelector("#board .c.given", { timeout: 20000 }); await p.click("#board .c:not(.given)"); await p.keyboard.press("5"); await p.waitForFunction(() => [...document.querySelectorAll("#board .c:not(.given)")].some((c) => c.textContent.trim()), null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => document.querySelectorAll("#board .c.given").length > 16 && [...document.querySelectorAll("#board .c:not(.given)")].every((c) => !c.textContent.trim()) && !document.querySelector("#field.paused")) },
  // ---- the board games that had no pause: the card is there for Restart and Menu
  { name: "2048", path: "2048/", acts: ["restart"],
    start: async (p) => { for (const k of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) { await p.keyboard.press(k); await p.waitForTimeout(80); } },
    fresh: (p) => p.evaluate(() => !GameShell.leaveActive() && document.querySelectorAll("#tiles .tile, .tile").length <= 2) },
  { name: "lights-out", path: "lights-out/",
    start: async (p) => { await p.evaluate(() => LightsOut.start("zen")); await p.waitForTimeout(200); await p.evaluate(() => LightsOut.press(0)); },
    fresh: (p) => p.evaluate(() => LightsOut.state() === "play" && LightsOut.moves() === 0),
    menu: (p) => p.evaluate(() => LightsOut.state() === "menu" && !document.getElementById("menu").hidden) },
  // (a hand in play: its bet is what there is to lose)
  { name: "jackblack", path: "jackblack/", quit: "Leave the table?",
    start: async (p) => { await p.evaluate(() => JackBlack.start("classic")); await p.waitForTimeout(150); await p.evaluate(() => JackBlack.stack("T 6 5 T 4 9")); await p.keyboard.press("Enter"); await p.waitForFunction(() => !JackBlack.busy() && JackBlack.table().phase === "play", null, { timeout: 10000 }); },
    fresh: (p) => p.evaluate(() => JackBlack.state() === "table" && JackBlack.table().phase !== "play" && JackBlack.hands() === 0),
    menu: (p) => p.evaluate(() => JackBlack.state() === "menu" && !document.getElementById("menu").hidden) },
  { name: "dots-and-boxes", path: "dots-and-boxes/",
    start: async (p) => { await p.click("#startGame"); await p.waitForTimeout(200); await p.evaluate(() => play("h", 0, 0)); },
    fresh: (p) => p.evaluate(() => !GameShell.leaveActive() && !document.getElementById("modeModal").classList.contains("open")),
    menu: (p) => p.evaluate(() => document.getElementById("modeModal").classList.contains("open")) },
  { name: "tic-tac-toe", path: "tic-tac-toe/",
    start: async (p) => { await p.click("#startGame"); await p.waitForTimeout(200); await p.evaluate(() => __TTT_TEST__.humanMove(0)); },
    fresh: (p) => p.evaluate(() => !GameShell.leaveActive() && !document.getElementById("modeModal").classList.contains("open") && __TTT_TEST__.board.every((c) => !c)),
    menu: (p) => p.evaluate(() => document.getElementById("modeModal").classList.contains("open")) },
  { name: "link-many", path: "link-many/",
    start: async (p) => { await p.click("#startGame"); await p.waitForFunction(() => !__game.busy, null, { timeout: 8000 }); await p.evaluate(() => __game.humanMove(3)); },
    fresh: (p) => p.evaluate(() => !GameShell.leaveActive() && !document.getElementById("modeModal").classList.contains("open") && __game.board.every((row) => row.every((c) => !c))),
    menu: (p) => p.evaluate(() => document.getElementById("modeModal").classList.contains("open")) },
  { name: "salvo", path: "salvo/", acts: ["restart"],
    start: async (p) => { await p.keyboard.press("a"); await p.keyboard.press("Enter"); await p.waitForTimeout(300); await p.click("#enemyGrid .cell"); await p.waitForFunction(() => GameShell.leaveActive(), null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => !GameShell.leaveActive() && document.getElementById("enemyCol").hidden && document.getElementById("placeControls").style.display === "flex") },
  // (the cards are the mouse's; H is the pause key there, P being Pass)
  { name: "yi", path: "yi/",
    start: async (p) => { await p.click("#startBtn"); await p.waitForTimeout(300); await p.evaluate(() => { drawCards(1, 1); G.acted = true; }); },
    fresh: (p) => p.evaluate(() => !!G && !G.over && !G.acted && getComputedStyle(document.getElementById("setup")).display === "none"),
    menu: (p) => p.evaluate(() => G === null && getComputedStyle(document.getElementById("setup")).display !== "none") },
  { name: "logicgate", path: "logicgate/", acts: ["restart"],
    start: async (p) => { await p.click('.mode-btn[data-mode="inputs"]'); await p.waitForTimeout(150); await p.click(".input.toggle"); await p.waitForFunction(() => GameShell.leaveActive(), null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => !GameShell.leaveActive()) },
  { name: "tile-maze", path: "tile-maze/", acts: ["restart"],
    start: async (p) => { for (const k of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) { if (await p.evaluate(() => GameShell.leaveActive())) break; await p.keyboard.press(k); await p.waitForTimeout(250); } },
    fresh: (p) => p.evaluate(() => !GameShell.leaveActive()) },
  // ---- the games that draw their own pause screen: the two as a row over it
  { name: "road-bird", path: "road-bird/", row: true,
    start: async (p) => { await p.keyboard.press("2"); await p.keyboard.press("Enter"); await p.waitForTimeout(300); await p.keyboard.press("ArrowUp"); await p.waitForFunction(() => GameShell.leaveActive(), null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => __game.state === "playing" && __game.score === 0 && __game.mode === "cars"),
    menu: (p) => p.evaluate(() => __game.state === "menu") },
  { name: "flappy-world", path: "flappy-world/", row: true, same: true,
    start: async (p) => { await p.keyboard.press("Space"); await p.waitForFunction(() => game.gameState === "PLAYING", null, { timeout: 8000 }); },
    fresh: (p) => p.evaluate(() => /^(PLAYING|PAUSED)$/.test(game.gameState) && game.score === 0),
    menu: (p) => p.evaluate(() => game.gameState === "MENU") },
  { name: "poodle-jump", path: "poodle-jump/", row: true,
    start: async (p) => { await p.evaluate(() => __game.start()); await p.waitForTimeout(150); await p.evaluate(() => { __game.bestY -= 1000; }); await p.waitForFunction(() => GameShell.leaveActive(), null, { timeout: 5000 }); },
    fresh: (p) => p.evaluate(() => __game.state === "play" && __game.score < 60 && !__game.paused),   // (the climb as started: 100 up; a fresh one is a hop or two in)
    menu: (p) => p.evaluate(() => __game.state === "start") },
];


module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  // (the card, or the row of Restart and Menu over a game's own pause screen)
  const cardUp = (p) => p.evaluate(() => [".gs-pause:not(.gs-dialog)", ".gs-pause-more"].some((s) => { const c = document.querySelector(s); return !!c && !c.hidden; }));
  const dialog = (p) => p.evaluate(() => { const d = document.querySelector(".gs-dialog h2"); return d ? d.textContent : null; });
  const gone = (p) => p.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 5000 }).catch(() => {});
  const active = (p) => p.evaluate(() => GameShell.leaveActive());
  const noFlip = (pg) => pg.addInitScript(() => { Object.defineProperty(window, "coinFlip", { configurable: true, get: () => (o, cb) => cb("you"), set: () => {} }); });
  // paused by the ⏸ corner button, once the game lets it (a countdown or a deal may come first)
  // (tried until it takes: the button's dimming is redrawn four times a
  // second, so it can read live while the CPU has just begun its turn)
  const pause = async (p, g) => {
    for (let t = 0; t < 40 && !(await cardUp(p)); t++) {
      if (g.pause) await g.pause(p);
      else {
        await p.waitForSelector('.gs-pause-btn[aria-disabled="false"]', { timeout: 15000 }).catch(() => {});
        await p.click(".gs-pause-btn", { force: true }).catch(() => {});
      }
      await p.waitForFunction(() => [".gs-pause:not(.gs-dialog)", ".gs-pause-more"].some((s) => { const c = document.querySelector(s); return !!c && !c.hidden; }), null, { timeout: 400 }).catch(() => {});
    }
  };

  const GAMES = table(lib);
  const only = (process.env.ONLY || "").split(",").filter(Boolean);
  for (const g of GAMES) {
    if (only.length && !only.some((o) => g.name.startsWith(o))) continue;
    const p = await lib.open(ctx, base, "games/" + g.path, { before: async (pg) => { await noFlip(pg); if (g.before) await g.before(pg); } });
    const want = (g.acts || ["restart", "menu"]).map((a) => a + ":" + (a === "restart" ? (g.esc ? "" : "R") : "⌫"));
    // Restart: by R, or by its button where R is the game's own letter
    const restart = () => (g.esc ? p.click('.gs-pause:not(.gs-dialog) [data-gs-act="restart"]') : p.keyboard.press("r"));
    let step = "start";
    try {
      await g.start(p);
      const lose = await active(p);
      step = "pause"; await pause(p, g);
      const card = await p.evaluate((row) => {
        const c = document.querySelector(row ? ".gs-pause-more" : ".gs-pause:not(.gs-dialog)");
        // each button's lettering against what is behind it (its own fill, or
        // the card's where it has none): the ones too faint to read
        const rgb = (s) => { const m = /rgba?\(([^)]+)\)/.exec(s || ""); if (!m) return null; const v = m[1].split(",").map(Number); return { r: v[0], g: v[1], b: v[2], a: v[3] === undefined ? 1 : v[3] }; };
        const lum = (c) => { const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
        const faint = [];
        if (c) for (const b of c.querySelectorAll("button")) {
          if (b.hidden) continue;
          let back = null, flat = true;
          for (let n = b; n && n !== document.documentElement && !back; n = n.parentElement) {
            const cs = getComputedStyle(n), bg = rgb(cs.backgroundColor);
            if (cs.backgroundImage !== "none") flat = false;          // (a gradient or a picture: not measured)
            else if (bg && bg.a > 0.5) back = bg;
            if (n === c && row) break;
          }
          const ink = rgb(getComputedStyle(b).color);
          if (!flat || !back || !ink) continue;
          const a = lum(ink), z = lum(back), ratio = (Math.max(a, z) + 0.05) / (Math.min(a, z) + 0.05);
          if (ratio < 3) faint.push(b.textContent.trim().slice(0, 12) + " " + ratio.toFixed(1));
        }
        return { up: !!c && !c.hidden, faint, resume: row ? "Resume (the game's own)" : c ? (c.querySelector("button") || {}).textContent : null,
          acts: c ? [...c.querySelectorAll("[data-gs-act]")].filter((b) => !b.hidden).map((b) => b.getAttribute("data-gs-act") + ":" + ((b.querySelector("kbd") || {}).textContent || "")) : [] };
      }, !!g.row);
      check(g.name + ": paused, " + (g.row ? "its own pause screen has under it" : "the card offers Resume") + want.map((w) => (/^restart/.test(w) ? (g.esc ? ", Restart (no letter key)" : ", Restart (R)") : ", Menu (⌫)")).join(""),
        card.up && /Resume/.test(card.resume || "") && card.acts.join() === want.join(), card);
      check(g.name + ": the lettering on its buttons can be read (3 to 1 against what is behind it)", card.faint.length === 0, card.faint);

      if (want.some((w) => /^restart/.test(w))) {
        step = "restart";
        if (g.esc) {
          // a letter typed at the paused game is nobody's key: no box, the card still up, the game as it was
          await p.keyboard.press("r"); await p.waitForTimeout(200);
          const typed = { dialog: await dialog(p), card: await cardUp(p), fresh: await g.fresh(p) };
          check(g.name + ": R typed while paused does nothing (the letters are the game's own; Restart is its button)", typed.dialog === null && typed.card && !typed.fresh, typed);
        }
        await restart(); await p.waitForTimeout(150);
        const asked = await dialog(p);
        let kept = null;
        if (asked) {
          await p.keyboard.press("x"); await gone(p);
          kept = { card: await cardUp(p), dialog: await dialog(p), fresh: await g.fresh(p) };
          await restart(); await p.waitForSelector(".gs-dialog", { timeout: 3000 }).catch(() => {});
          await p.keyboard.press("Enter"); await gone(p);
        }
        await p.waitForTimeout(g.settle || 250);
        const after = { card: await cardUp(p), fresh: await g.fresh(p) };
        const asksRight = lose || g.asks ? asked === (g.ask || "Start over?") && kept.card && kept.dialog === null && (g.same || !kept.fresh) : asked === null;
        check(g.name + ": Restart " + (lose || g.asks ? "asks first (any other key keeps the game, still paused), then" : "(nothing to lose yet)") + " starts the same game over, un-paused",
          asksRight && !after.card && after.fresh, { lose, asked, kept, after });
      }

      if (want.some((w) => /^menu/.test(w))) {
        step = "menu";
        if (g.again) await g.again(p);
        if (!(await cardUp(p))) await pause(p, g);
        const up = await cardUp(p);
        await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
        const asked = await dialog(p);
        if (asked) { await p.keyboard.press("Enter"); await gone(p); }
        await p.waitForTimeout(g.settle || 250);
        if (!g.pause) await p.waitForSelector('.gs-pause-btn[aria-disabled="true"]', { timeout: 3000 }).catch(() => {});
        const m = { up, asked, card: await cardUp(p), menu: await g.menu(p), dim: g.pause ? "true" : await p.evaluate(() => document.querySelector(".gs-pause-btn").getAttribute("aria-disabled")) };
        check(g.name + ": Menu goes back to the game's own menu, nothing left paused (the ⏸ button dims there)",
          m.up && (m.asked === null || m.asked === (g.quit || "Quit this game?")) && !m.card && m.menu && m.dim === "true", m);
        // a game started from that menu plays, and pauses, as the first did
        step = "start again";
        await g.start(p);
        await pause(p, g);
        const again = await cardUp(p);
        check(g.name + ": a game started from that menu plays and pauses again", again, again);
      }
    } catch (e) {
      check(g.name + ": the card's steps ran to the end", false, step + ": " + String(e && e.message || e).split("\n")[0]);
    }
    check(g.name + ": no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  await ctx.close();
};
// (the table, for a tool that wants to drive the same games: a picture of every card, say)
module.exports.table = table;
