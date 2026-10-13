// Space or Enter. On a start screen, and on the cards that say play again,
// either key goes on and both are shown ("Space or Enter" on the button, or
// both keycaps in the hint), in every game where Space has no other job. The
// games where it has one keep Enter alone; they are listed here with the job.

// both keys start it, and both are shown
const BOTH = ["click-tap/", "corner-pocket/", "crazy-ohio/", "demolition-row/", "dots-and-boxes/", "fish-a-fish/", "flappy-world/", "jackblack/", "lanterns/",
  "lights-out/", "link-many/", "mahjong/", "metazac/", "ping/", "poodle-jump/", "pop-the-lock/", "quick-minute/", "reaction/", "road-bird/", "science-fair/",
  "speedle/", "stopwatch/", "sunset-slice/", "tall-order/", "tic-tac-toe/", "typetwo/"];
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
const KEEP_ENTER = [["corner-pocket/", "#againBtn"], ["corner-pocket/", "#spinDone"], ["corner-pocket/", "#quitYes"],   // (Space is the cue there)
  ["dots-and-boxes/", "#closeRules"], ["link-many/", "#closeRules"], ["tic-tac-toe/", "#closeRules"]];              // (Got it, on the rules: not a start)

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
  await ctx.close();
};
