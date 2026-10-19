// Space or Enter. On a start screen, and on the cards that say play again,
// either key goes on and both are shown ("Space or Enter" on the button, or
// both keycaps in the hint), in every game where Space has no other job. The
// games where it has one keep Enter alone; they are listed here with the job.

// both keys start it, and both are shown
const BOTH = ["click-tap/", "corner-pocket/", "crazy-ohio/", "demolition-row/", "dots-and-boxes/", "fish-a-fish/", "flappy-world/", "jackblack/", "lanterns/",
  "lights-out/", "link-many/", "mahjong/", "metazac/", "ping/", "poodle-jump/", "pop-the-lock/", "quick-minute/", "reaction/", "road-bird/", "science-fair/",
  "speedle/", "stopwatch/", "sunset-slice/", "tall-order/", "tic-tac-toe/", "typetwo/", "rose-window/", "stone-garden/", "sowing/", "mesa-drift/",
  "potting-shed/", "spice-blend/", "tide-pool/"];
// drawn on a canvas, so the keys shown are read from what is drawn
const CANVAS = ["flappy-world/", "poodle-jump/", "road-bird/"];
// Enter alone starts these: Space is busy
const ENTER_ONLY = {
  "abyss/": "Space is the hard drop",
  "dead-end/": "Space lays a plank",
  "departures/": "Space is a letter of an answer",
  "neon-pinball/": "Space is the plunger",
  "passport/": "Space is a letter of an answer",
  "slither/": "Space pauses, or lays an egg",
  "yi/": "Space calls YI!",
};
// GameShell.menuKeys calls that keep Enter alone in a game of BOTH: [page, start button]
const KEEP_ENTER = [["corner-pocket/", "#spinDone"], ["corner-pocket/", "#quitYes"],                           // (not a start or a play again)
  ["dots-and-boxes/", "#closeRules"], ["link-many/", "#closeRules"], ["tic-tac-toe/", "#closeRules"]];              // (Got it, on the rules: not a start)
// And the games where Space has a job in play (fire, drop, turn, develop, the
// valve, the cue) take it on their start and play-again screens all the same
// (checked one by one, at the end): on a card that comes up as play ends it
// waits a moment, so one pressed as the run ended can't skip the result, and
// one held down never counts.

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  // every page: no coin flip to wait on, the text drawn on canvases kept, and
  // each GameShell.menuKeys call noted as it is made
  const before = (pg) => pg.addInitScript(() => {
    Object.defineProperty(window, "coinFlip", { configurable: true, get: () => (o, cb) => cb("you"), set: () => {} });
    window.__drawn = {};
    const ft = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s) { window.__drawn[String(s)] = 1; return ft.apply(this, arguments); };
    window.__mk = [];
    let gs;
    Object.defineProperty(window, "GameShell", { configurable: true, get: () => gs, set: (v) => {
      gs = v;
      const mk = v && v.menuKeys;
      if (mk) v.menuKeys = function (o) {
        o = o || {};
        window.__mk.push({ start: o.start || null, pick: (o.groups || []).some((g) => g && g.pick), space: !!o.space });
        return mk.apply(this, arguments);
      };
    } });
  });
  // what the screen is: its buttons, the game's own state where it says, how much is hidden
  const sig = (p) => p.evaluate(() => {
    const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden" && +getComputedStyle(e).opacity > 0.05;
    const btns = [...document.querySelectorAll("button, a.btn")].filter((b) => !b.closest(".gs-corner, .gs-dialog, .gs-pause") && !b.classList.contains("nav-back-games") && vis(b)).map((b) => (b.id || "") + ":" + b.textContent.trim().slice(0, 12)).join("|");
    let st = "";
    try { const g = window.__game; if (g) st += JSON.stringify(typeof g.state === "function" ? g.state() : g.state); } catch (e) {}
    try { st += game.gameState; } catch (e) {}
    return btns + "#" + st + "#" + document.querySelectorAll("[hidden], .hidden, .show, .open, .on").length + "#" + document.body.className;
  });
  // the Space / Enter keycaps showing: on buttons, in hints, and drawn on a canvas
  const caps = (p) => p.evaluate(() => {
    const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== "hidden";
    const on = [], hint = [];
    document.querySelectorAll("[data-gs-key], kbd").forEach((e) => {
      if (!vis(e) || e.closest(".gs-corner, .gs-dialog, .gs-pause, .nav-back-games")) return;
      const key = e.tagName === "KBD" ? e.textContent.trim() : e.getAttribute("data-gs-key");
      if (/space|enter/i.test(key)) (e.closest("button, a") ? on : hint).push(key);
    });
    return { on, hint, drawn: Object.keys(window.__drawn).join(" ") };
  });

  // ---- the opening screens
  const wrong = [], audit = [], errs = [];
  for (const g of BOTH.concat(Object.keys(ENTER_ONLY))) {
    const both = BOTH.includes(g), moved = {};
    let shown = null, calls = null;
    for (const key of both ? ["Space", "Enter"] : ["Space"]) {
      const p = await lib.open(ctx, base, "games/" + g, { before });
      await p.waitForTimeout(350);
      if (!shown) { shown = await caps(p); calls = await p.evaluate(() => window.__mk); }
      await p.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
      const a = await sig(p);
      await p.keyboard.press(key); await p.waitForTimeout(450);
      moved[key] = a !== await sig(p);
      if (p.errs.length) errs.push(g + ": " + p.errs.join("; "));
      await p.close();
    }
    if (both) {
      const drawn = CANVAS.includes(g) && /space/i.test(shown.drawn) && /enter/i.test(shown.drawn);
      const dom = shown.on.includes("Space or Enter") || (shown.hint.some((k) => /^space$/i.test(k)) && shown.hint.some((k) => /^enter$/i.test(k)));
      if (!moved.Space || !moved.Enter || !(drawn || dom)) wrong.push(g + " " + JSON.stringify({ moved, on: shown.on, hint: shown.hint, drawn: CANVAS.includes(g) ? shown.drawn.slice(0, 160) : undefined }));
      // each of its start buttons (and rows where Enter starts the picked one) takes Space too
      calls.filter((c) => (c.start || c.pick) && !c.space && !KEEP_ENTER.some(([pg, s]) => pg === g && s === c.start)).forEach((c) => audit.push(g + " " + (c.start || "a pick row")));
    } else {
      if (moved.Space || shown.on.includes("Space or Enter")) wrong.push(g + " (Space is busy here: " + ENTER_ONLY[g] + ") " + JSON.stringify({ moved, on: shown.on }));
      calls.filter((c) => c.space).forEach((c) => audit.push(g + " " + (c.start || "a pick row") + " takes Space, where " + ENTER_ONLY[g]));
    }
  }
  check("on a start screen Space or Enter both go on, and both are shown, wherever Space has no other job (" + BOTH.length + " games); where it has one, Enter alone starts (" + Object.keys(ENTER_ONLY).length + ")", wrong.length === 0, wrong);
  check("in those games every start and play-again button's keys take Space as they take Enter (GameShell.menuKeys' space), and none does where Space is busy", audit.length === 0, audit);
  check("start keys: no page errors", errs.length === 0, errs);

  // ---- "Space or Enter" is a wider keycap than "Enter" was: in a narrow
  // window with a keyboard (320 px) the button that wears it, and the buttons
  // beside it in its row, still sit whole inside the row and the window
  // (Quick Minute's Night switch was pushed off the card's edge)
  {
    const narrow = await lib.newContext(browser, { viewport: { width: 320, height: 568 } });
    const off = [];
    for (const g of BOTH.filter((b) => !CANVAS.includes(b))) {
      const p = await lib.open(narrow, base, "games/" + g, { before });
      await p.waitForTimeout(250);
      const bad = await p.evaluate(() => {
        const r = (e) => e.getBoundingClientRect(), out = [];
        document.querySelectorAll('[data-gs-key="Space or Enter"], kbd').forEach((c) => {
          if (c.tagName === "KBD" && c.textContent.trim() !== "Space or Enter") return;
          const b = c.closest("button, a");
          if (!b || !b.getClientRects().length || b.closest(".gs-corner, .gs-dialog, .gs-pause")) return;
          const row = r(b.parentElement);
          [...b.parentElement.children].filter((e) => /^(BUTTON|A)$/.test(e.tagName) && e.getClientRects().length).forEach((e) => {
            const q = r(e);
            if (q.left < row.left - 1 || q.right > row.right + 1 || q.right > innerWidth + 1 || q.left < -1) out.push((e.id || e.textContent.trim().slice(0, 12)) + " " + Math.round(q.left) + ".." + Math.round(q.right) + " in " + Math.round(row.left) + ".." + Math.round(row.right));
          });
        });
        return out;
      });
      if (bad.length) off.push(g + " " + bad.join("; "));
      if (p.errs.length) off.push(g + " errors: " + p.errs.join("; "));
      await p.close();
    }
    check("in a 320 px window with a keyboard, a button wearing \"Space or Enter\" and the buttons beside it stay whole inside their row", off.length === 0, off);
    await narrow.close();
  }

  // ---- GameShell.menuKeys' space: Space presses the start button and its
  // keycap reads "Space or Enter"; on a focused button Space is that button's own
  {
    const p = await lib.open(ctx, base, "games/click-tap/", { before });
    await p.waitForTimeout(300);
    const cap = await p.evaluate(() => ({ cap: document.getElementById("startBtn").getAttribute("data-gs-key"), aria: document.querySelector("#durChoices .choice").getAttribute("aria-keyshortcuts") }));
    const first = await p.evaluate(() => { const b = document.querySelector("#durChoices .choice:not(.sel), #durChoices .choice:last-child"); b.focus(); return document.activeElement === b; });
    const a = await sig(p);
    await p.keyboard.press("Space"); await p.waitForTimeout(300);
    const onButton = a === await sig(p) || !(await p.evaluate(() => document.getElementById("startBtn").getClientRects().length === 0));
    await p.evaluate(() => document.activeElement.blur());
    await p.keyboard.press("Space"); await p.waitForTimeout(400);
    const started = await p.evaluate(() => document.getElementById("startBtn").getClientRects().length === 0);
    check("click-tap: the start button reads \"Space or Enter\"; Space on a focused choice only presses that choice, and with nothing focused it starts", cap.cap === "Space or Enter" && first && onButton && started, { cap, first, onButton, started });
    check("click-tap (start keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- the cards that say play again
  {
    // Fish-A-Fish: Space on the end card casts off again
    let p = await lib.open(ctx, base, "games/fish-a-fish/", { before });
    await p.evaluate(() => { FishAFish.start("daybreak"); FishAFish.hold(); FishAFish.setTime(0.01); });
    await p.waitForFunction(() => FishAFish.state().state === "over", null, { timeout: 8000 });
    const fishCap = await p.evaluate(() => [...document.querySelectorAll("#again kbd")].map((k) => k.textContent).join("|"));
    await p.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });   // (no button's own Space)
    await p.keyboard.press("Space"); await p.waitForTimeout(300);
    const fish = await p.evaluate(() => FishAFish.state().state);
    check("fish-a-fish: on the end card Again reads \"Space or Enter\" (and R), and Space casts off again", fishCap === "Space or Enter|R" && fish === "play", { fishCap, fish });
    check("fish-a-fish (start keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();

    // Tile Maze: Space on the solved card goes on to the next level
    p = await lib.open(ctx, base, "games/tile-maze/", { before: async (pg) => { await before(pg); await pg.addInitScript(() => { try { localStorage.setItem("tileMaze.v1", "{}"); } catch (e) {} }); } });
    for (const k of ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowLeft", "ArrowLeft"]) { await p.keyboard.press(k); await p.waitForTimeout(450); }
    await p.waitForFunction(() => !document.getElementById("overlay").hidden, null, { timeout: 8000 }).catch(() => {});
    const mazeCap = await p.evaluate(() => document.getElementById("overlayNext").getAttribute("data-gs-key"));
    await p.keyboard.press("Space"); await p.waitForTimeout(400);
    const maze = await p.evaluate(() => ({ lvl: document.getElementById("lvlNum").textContent, card: !document.getElementById("overlay").hidden }));
    check("tile-maze: on the solved card Next Level reads \"Space or Enter\", and Space goes on to level 2", mazeCap === "Space or Enter" && maze.lvl === "2" && !maze.card, { mazeCap, maze });
    check("tile-maze (start keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();

    // Tall Order: Space drops a tier in play, so on the end card it waits a
    // moment before it bakes another (a drop pressed as the card comes up
    // mustn't skip it); Enter is as it was
    p = await lib.open(ctx, base, "games/tall-order/", { before });
    await p.evaluate(() => TallOrder.start("bakery"));
    await p.waitForFunction(() => TallOrder.sliderReady(), null, { timeout: 8000 });
    await p.evaluate(() => { TallOrder.placeAndDrop(5000); window.__t0 = 0; (function w() { if (TallOrder.state() === "over") window.__t0 = performance.now(); else requestAnimationFrame(w); })(); });
    await p.waitForFunction(() => window.__t0 > 0, null, { timeout: 15000 });
    await p.keyboard.press("Space");
    const early = await p.evaluate(() => ({ state: TallOrder.state(), ms: Math.round(performance.now() - window.__t0) }));
    await p.waitForTimeout(900);
    await p.keyboard.press("Space"); await p.waitForTimeout(300);
    const late = await p.evaluate(() => TallOrder.state());
    // (on a stalled machine the first press can come after the wait is over: then it proves nothing either way)
    check("tall-order: on the end card Space bakes another, but not in the card's first moments", (early.ms > 600 || early.state === "over") && late !== "over" && late !== "menu", { early, late });
    check("tall-order (start keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();

    // Flappy World: Enter starts as Space does, and doesn't flap in flight
    p = await lib.open(ctx, base, "games/flappy-world/", { before });
    await p.waitForTimeout(300);
    const f0 = await p.evaluate(() => game.gameState);
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    const f1 = await p.evaluate(() => { window.__flaps = 0; const f = game.bird.flap.bind(game.bird); game.bird.flap = () => { window.__flaps++; f(); }; return game.gameState; });
    await p.keyboard.press("Enter"); await p.waitForTimeout(80);
    const f2 = await p.evaluate(() => window.__flaps);
    check("flappy-world: Enter starts the flight as Space does; in flight Enter doesn't flap", f0 === "MENU" && f1 === "PLAYING" && f2 === 0, { f0, f1, f2 });
    check("flappy-world (start keys): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- where Space has a job in play, it starts and plays again all the
  // same, as Enter does, and both are shown; but a card that comes up as play
  // ends takes it only after a moment (one pressed as the run ended mustn't
  // skip the result), and a Space held down never counts. For each card, by
  // cardKeys(): a Space at once (the card stays); past the moment, a held
  // Space's repeat (sent by hand, so the timing is the page's: the card
  // stays); then a fresh Space (it goes on). `ms` is how long after the card
  // came up the first press landed: past 600 (a stalled machine) that press
  // proves nothing either way, and the card is brought up again.
  {
    const frames = (p, n) => p.evaluate((n) => new Promise((r) => { let k = 0; (function f() { if (++k >= n) r(); else requestAnimationFrame(f); })(); }), n);
    // show(): brings the card up, returns the page's time then; up(): is it still up
    const cardKeys = async (p, show, up, wait) => {
      let at = await show();
      await p.keyboard.press("Space");
      const first = { ms: await p.evaluate((t) => Math.round(performance.now() - t), at), stayed: await up() };
      if (!first.stayed) at = await show();
      await p.evaluate((w) => new Promise((r) => setTimeout(r, w)), wait + 150);       // (past the moment, on the page's clock)
      await p.evaluate(() => {
        const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
        t.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", repeat: true, bubbles: true, cancelable: true }));
      });
      await p.waitForTimeout(120);
      const held = await up();
      await p.keyboard.press("Space"); await p.waitForTimeout(250);
      const again = await up();
      return { first, held, again, ok: (first.stayed || first.ms > wait - 100) && held && !again };
    };

    // Meteor Menace: Space fires in play
    {
      const HOOK = ["    start: start\n  };", "    start: start,\n    over: function () { lives = 0; gameOver(); },\n    shots: function () { return bullets.length; }\n  };"];
      const p = await lib.open(ctx, base, "games/meteor-menace/", { before: async (pg) => { await before(pg); await lib.injectScript(pg, "games/meteor-menace/game.js", [HOOK]); } });
      await p.waitForTimeout(300);
      const said = await p.evaluate(() => Object.keys(window.__drawn).join(" "));
      // the title: a Space held down starts, and doesn't fire until it's let go and pressed again
      await p.keyboard.down("Space"); await frames(p, 20);
      const go = await p.evaluate(() => ({ state: __game.state, shots: __game.shots() }));
      await p.keyboard.up("Space"); await p.keyboard.down("Space"); await frames(p, 10); await p.keyboard.up("Space");
      const fired = await p.evaluate(() => __game.shots());
      const end = await cardKeys(p, () => p.evaluate(() => { __game.over(); return performance.now(); }), () => p.evaluate(() => __game.state === "over"), 700);
      check("meteor-menace: the title and THE END say PRESS [SPACE] OR [ENTER]; Space blasts off from the title, and the press that starts doesn't fire (until let go and pressed again)",
        /SPACE/.test(said) && /ENTER/.test(said) && go.state === "play" && go.shots === 0 && fired > 0, { said: said.slice(0, 200), go, fired });
      check("meteor-menace: on THE END Space plays again, but not in its first moment, and not held down", end.ok, end);
      check("meteor-menace (start keys): no page errors", p.errs.length === 0, p.errs);
      await p.close();
    }

    // Spacer: Space fires in play
    {
      const p = await lib.open(ctx, base, "games/spacer/", { before });
      await p.waitForTimeout(300);
      const said = await p.evaluate(() => Object.keys(window.__drawn).join(" "));
      await p.keyboard.down("Space"); await frames(p, 5);
      const go = await p.evaluate(() => ({ mode: game.mode, fire: game.input.fire }));
      await p.keyboard.up("Space");
      const ends = [];
      for (const finish of ["gameOver", "gameComplete"]) {
        const end = await cardKeys(p, () => p.evaluate((f) => { game.startGame(); game[f](); return performance.now(); }, finish),
          () => p.evaluate(() => game.mode === "gameover" || game.mode === "complete"), 700);
        ends.push(Object.assign({ finish }, end));
      }
      check("spacer: the title says [SPACE]/[ENTER] START and the end screens PRESS [SPACE] OR [ENTER]; Space starts from the title, not firing as it does",
        /SPACE/.test(said) && /ENTER/.test(said) && go.mode !== "attract" && go.fire === false, { said: said.slice(0, 200), go });
      check("spacer: on GAME OVER and CONGRATULATIONS Space plays again, but not in their first moment, and not held down", ends.every((e) => e.ok), ends);
      check("spacer (start keys): no page errors", p.errs.length === 0, p.errs);
      await p.close();
    }

    // Toy Tanks: Space fires in play
    {
      const p = await lib.open(ctx, base, "games/toy-tanks/", { before });
      await p.waitForTimeout(300);
      const cap = await p.evaluate(() => document.getElementById("play").getAttribute("data-gs-key"));
      await p.keyboard.down("Space"); await frames(p, 5); await p.keyboard.up("Space");
      // (on to the mission itself: the press that started it fired nothing)
      await p.evaluate(() => ToyTanks.advance(1700, {}));
      const go = await p.evaluate(() => ({ ui: ToyTanks.ui(), status: ToyTanks.st().status, shells: ToyTanks.st().shells.length }));
      const end = await cardKeys(p, () => p.evaluate(() => { ToyTanks.end(); return performance.now(); }), () => p.evaluate(() => ToyTanks.ui() === "over"), 700);
      check("toy-tanks: Roll out wears Space or Enter, and Space starts a run without firing a shell", cap === "Space or Enter" && go.ui === "run" && go.status === "play" && go.shells === 0, { cap, go });
      check("toy-tanks: on the end card Space plays again, but not in its first moment, and not held down", end.ok, end);
      check("toy-tanks (start keys): no page errors", p.errs.length === 0, p.errs);
      await p.close();
    }

    // Salvo: Space turns a ship while the fleet is being placed
    {
      const HOOK = ['  $("againBtn").addEventListener("click", newGame);', '  window.__salvoOver = function () { gameOver("player"); };\n  window.__salvoOrient = function () { return orient; };\n  $("againBtn").addEventListener("click", newGame);'];
      const p = await lib.open(ctx, base, "games/salvo/", { before: async (pg) => { await before(pg); await lib.injectScript(pg, "games/salvo/game.js", [HOOK]); } });
      await p.waitForTimeout(300);
      const placing = () => p.evaluate(() => document.getElementById("placeControls").style.display !== "none");
      const caps = await p.evaluate(() => ({ start: document.querySelector("#startBtn kbd").textContent, again: document.getElementById("againBtn").getAttribute("data-gs-key") }));
      const o0 = await p.evaluate(() => __salvoOrient());
      await p.keyboard.press("Space"); await p.waitForTimeout(100);
      const turned = (await placing()) && (await p.evaluate(() => __salvoOrient())) !== o0;
      await p.keyboard.press("a"); await p.waitForTimeout(100);
      await p.keyboard.press("Space"); await p.waitForTimeout(250);
      const battle = !(await placing());
      const end = await cardKeys(p, () => p.evaluate(() => { __salvoOver(); return performance.now(); }), () => p.evaluate(() => !document.getElementById("over").classList.contains("hidden")), 1000);
      const placingAgain = await placing();
      check("salvo: Start Battle and New Game read \"Space or Enter\"; Space turns a ship while the fleet is going down (as R does), and once it's all down starts the battle",
        caps.start === "Space or Enter" && caps.again === "Space or Enter" && turned && battle, { caps, turned, battle });
      check("salvo: on the end card Space starts a new game, but not in its first second, and not held down", end.ok && placingAgain, Object.assign({ placingAgain }, end));
      check("salvo (start keys): no page errors", p.errs.length === 0, p.errs);
      await p.close();
    }

    // Jam Jar and Steamfitter: Space drops a fruit / holds the valve open
    for (const [g, hook] of [
      ["jam-jar/", ["    setAim: function (x) { aimX = x; },", "    setAim: function (x) { aimX = x; },\n    over: function () { gameOver(); },"]],
      ["steamfitter/", ["    place: place,", "    place: place,\n    over: function () { gameOver(); },"]]]) {
      const p = await lib.open(ctx, base, "games/" + g, { before: async (pg) => { await before(pg); await lib.injectScript(pg, "games/" + g + "game.js", [hook]); } });
      await p.waitForTimeout(300);
      const cap = await p.evaluate(() => document.getElementById("againBtn").getAttribute("data-gs-key"));
      const end = await cardKeys(p, () => p.evaluate(() => { __game.over(); return performance.now(); }), () => p.evaluate(() => !document.getElementById("overScreen").classList.contains("hidden")), 700);
      check(g.slice(0, -1) + ": on the result card the button reads \"Space or Enter\", and Space plays again, but not in the card's first moment, and not held down",
        cap === "Space or Enter" && end.ok, Object.assign({ cap }, end));
      check(g.slice(0, -1) + " (start keys): no page errors", p.errs.length === 0, p.errs);
      await p.close();
    }

    // Darkroom: Space develops a square
    {
      const p = await lib.open(ctx, base, "games/darkroom/", { before });
      await p.waitForTimeout(300);
      const show = () => p.evaluate(() => new Promise((res) => { Darkroom.open("plus"); Darkroom.solveNow(); (function w() { if (!document.getElementById("win").hidden) res(performance.now()); else requestAnimationFrame(w); })(); }));
      const end = await cardKeys(p, show, () => p.evaluate(() => !document.getElementById("win").hidden), 700);
      const after = await p.evaluate(() => Darkroom.state());
      const cap = await p.evaluate(() => document.getElementById("win-next").getAttribute("data-gs-key"));
      check("darkroom: on the win card Next negative reads \"Space or Enter\", and Space goes on, but not in the card's first moment, and not held down",
        cap === "Space or Enter" && end.ok && after.id !== "plus", Object.assign({ cap, after: [after.screen, after.id] }, end));
      check("darkroom (start keys): no page errors", p.errs.length === 0, p.errs);
      await p.close();
    }

    // Corner Pocket: Space is the cue (the result card gives Rematch the focus)
    {
      const HOOK = ["    shoot: function (a, p, tx, ty) {", "    showOver: function () { G.pendingOver = { title: \"You win!\", why: \"\", rec: \"\", good: true }; showOver(); G.pendingOver = null; },\n    shoot: function (a, p, tx, ty) {"];
      const p = await lib.open(ctx, base, "games/corner-pocket/", { before: async (pg) => { await before(pg); await lib.injectScript(pg, "games/corner-pocket/game.js", [HOOK]); } });
      await p.waitForTimeout(300);
      await p.evaluate(() => { document.getElementById("menu").classList.add("hidden"); });
      const cap = await p.evaluate(() => document.getElementById("againBtn").getAttribute("data-gs-key"));
      // (Rematch takes the focus 30 ms on: the first press lands on it)
      const show = async () => { const t = await p.evaluate(() => { __pool.showOver(); return performance.now(); }); await p.waitForTimeout(60); return t; };
      const end = await cardKeys(p, show, () => p.evaluate(() => !document.getElementById("over").classList.contains("hidden")), 700);
      const phase = await p.evaluate(() => __pool.G.phase);
      check("corner-pocket: on the result card Rematch reads \"Space or Enter\", and Space racks again, but not in the card's first moment, and not held down",
        cap === "Space or Enter" && end.ok && phase !== "over", Object.assign({ cap, phase }, end));
      check("corner-pocket (start keys): no page errors", p.errs.length === 0, p.errs);
      await p.close();
    }
  }
  await ctx.close();
};
