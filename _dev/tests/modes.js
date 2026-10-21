// Mode and setup screens take keys (GameShell.menuKeys): every option that's
// on screen wears its key as a keycap and the key presses that button, Enter
// presses Play, and none of it fires in a text field, with Ctrl held, or on a
// phone (where the keycaps hide). Where every button on the menu starts the
// game there's no Play button, so there a key only picks its button (ringed,
// wearing Enter) and Enter starts it: a number alone never starts a game.
// Then the pickers with more to them: rows that come and go, sub-menus, and
// keys that ask before throwing a game away.

// page -> the keys that work on its opening screen (in an order that keeps
// every row on screen until it's been tried), whether Enter starts, `pick`
// where the keys pick and Enter starts the picked one, and `fresh` where each
// key has to be tried on a newly opened page
const MENUS = {
  "tic-tac-toe/": { keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], enter: true },
  "dots-and-boxes/": { keys: ["2", "3", "4", "5", "e", "h"], enter: true },
  "link-many/": { keys: ["1", "2", "3", "4", "5"], enter: true },
  "click-tap/": { keys: ["1", "2", "3"], enter: true },
  "crazy-ohio/": { keys: ["1", "2", "3", "4", "5", "6", "7", "8", "9"], enter: true },
  "corner-pocket/": { keys: ["3", "4", "5", "2", "1"], enter: true },
  "ping/": { keys: ["1", "2"], pick: true },
  "quick-minute/": { keys: ["1", "2", "3"], pick: true },
  "neon-pinball/": { keys: ["1", "2", "3"], pick: true },
  "sunset-slice/": { keys: ["1", "2", "3"], pick: true },
  "speedle/": { keys: ["1", "2"], pick: true },
  "stopwatch/": { keys: ["1", "2"] },
  "salvo/": { keys: ["1", "2", "3"] },
  "chess/": { keys: ["2", "4"], fresh: true },          // (each opens a sub-menu; 3 goes to the 3-player page: below)
  "chess/three.html": { keys: ["1", "2", "3"], pick: true },
  "demolition-row/": { keys: ["1", "2", "3"], enter: true },
  "slither/": { keys: ["4", "5", "6", "7", "1", "2", "3"], enter: true },
  "yi/": { keys: ["2", "3", "4", "5", "6", "7", "8", "9", "0", "f", "t"], enter: true },
  "jackblack/": { keys: ["2", "1"], enter: true },
  "dead-end/": { keys: ["2", "1"], enter: true },             // (L leaves for the maze editor)
  "toy-tanks/": { keys: [], enter: true },                     // (← → step the start mission, any of the 100; L opens the mission editor: toy-tanks.js, toy-tanks-editor.js)
  "metazac/": { keys: ["1", "2", "3", "4"] },
  "steamfitter/": { keys: ["1", "2", "3"] },
  "2048/": { keys: ["2", "1"] },
  "klondike/": { keys: ["t", "d"] },
  "logicgate/": { keys: ["2", "1"] },
  "minesweeper/": { keys: ["1", "2", "3", "4"] },       // (the tabs' C / D / E leave the page: below)
  "sudoku/": { keys: ["e", "d", "h", "x"] },
  "darkroom/": { keys: ["d"] },
  "typetwo/": { keys: ["1", "2", "3"] },                // (◂ ▸ step through the modes too, and Enter starts: the game's own keys)
  "page-turner/": { keys: ["3", "4", "5", "2", "1"], enter: true },   // (the rivals 3 4 5 show only for Party: 2 picks Endless)
};

module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser);
  const noFlip = (pg) => pg.addInitScript(() => { Object.defineProperty(window, "coinFlip", { configurable: true, get: () => (o, cb) => cb("you"), set: () => {} }); });

  // the option a key belongs to, on a menu that's up: its keycap, and whether its button can be pressed
  const optionFor = (p, key) => p.evaluate((key) => {
    for (const m of (window.GameShell && GameShell.menuKeys && GameShell.menuKeys.all) || []) {
      if (!m.active()) continue;
      for (const o of m.options()) {
        if (o.key !== key || !(o.g.hidden || m.usable(o.btn))) continue;
        const host = (typeof o.g.into === "function" ? o.g.into(o.btn) : o.g.into && o.btn.querySelector(o.g.into)) || o.btn;
        const own = o.btn.querySelector("kbd");
        window.__opt = o.btn; window.__host = host; window.__menu = m; window.__hits = 0;
        o.btn.addEventListener("click", () => { window.__hits++; }, { once: true, capture: true });
        return { picked: o.btn.hasAttribute("data-gs-pick"), cap: o.g.caps === false ? own && own.textContent : host.getAttribute("data-gs-key"),
          shown: o.g.hidden ? true : o.g.caps === false ? !!own && getComputedStyle(own.closest(".gs-keys") || own).display !== "none" : getComputedStyle(host, "::after").display !== "none" };
      }
    }
    return null;
  }, key);
  const menuUp = (p) => p.evaluate(() => ((window.GameShell && GameShell.menuKeys && GameShell.menuKeys.all) || []).some((m) => m.active())).catch(() => false);
  const label = (k) => (k.length === 1 ? k.toUpperCase() : k);

  // ---- every menu: each key presses its button, and the button shows the key
  for (const g of Object.keys(MENUS)) {
    const want = MENUS[g];
    let p = await lib.open(ctx, base, "games/" + g, { before: noFlip });
    const bad = [];
    if (want.pick) {
      // every button here starts the game: a key picks its button without
      // pressing it (one ring, on it, and Enter in place of its own key),
      // the menu stays up, and Enter then starts the picked one, once.
      // (Where Space starts too, the picked button wears "Space or Enter".)
      const go = await p.evaluate(() => GameShell.menuKeys.all.some((x) => x.active() && x.space) ? "Space or Enter" : "Enter");
      for (const k of want.keys) {
        const o = await optionFor(p, k);
        if (!o) { bad.push(k + ": no button"); continue; }
        if (!o.shown || !(o.picked ? o.cap === go : o.cap === label(k))) bad.push(k + ": keycap " + JSON.stringify(o));
        await p.keyboard.press(k);
        const s = await p.evaluate(() => new Promise((r) => setTimeout(() => r({ hits: window.__hits, picked: window.__opt.hasAttribute("data-gs-pick"),
          cap: window.__host.getAttribute("data-gs-key"), rings: document.querySelectorAll("[data-gs-pick]").length, ring: getComputedStyle(window.__opt).outlineStyle, up: window.__menu.active() }), 60))).catch(() => "page left");
        if (!(s.hits === 0 && s.picked && s.cap === go && s.rings === 1 && s.ring === "solid" && s.up)) bad.push(k + ": " + JSON.stringify(s));
      }
      check(g + ": each menu key picks its button (ringed, wearing Enter, or Space or Enter where Space starts too) without starting the game", bad.length === 0, bad);
      await p.keyboard.press("Enter");     // (the last key's button still counts its clicks: none so far)
      const went = await p.evaluate(() => new Promise((r) => setTimeout(() => r({ hits: window.__hits, up: window.__menu.active() }), 80))).catch(() => "page left");
      check(g + ": Enter starts the picked one, once, and the menu goes", went.hits === 1 && went.up === false, went);
      check(g + ": no page errors", p.errs.length === 0, p.errs);
      await p.close();
      continue;
    }
    for (const k of want.keys) {
      if (!(await menuUp(p)) || (want.fresh && k !== want.keys[0])) { await p.close(); p = await lib.open(ctx, base, "games/" + g, { before: noFlip }); }   // (the last key started a game)
      const o = await optionFor(p, k);
      if (!o) { bad.push(k + ": no button"); continue; }
      await p.keyboard.press(k);
      const hits = await p.evaluate(() => new Promise((r) => setTimeout(() => r(window.__hits), 60))).catch(() => "page left");
      if (hits !== 1) bad.push(k + ": pressed " + hits);
      if (o.cap !== label(k) || !o.shown) bad.push(k + ": keycap " + JSON.stringify(o));
    }
    check(g + ": each menu key presses its button, and the button wears the key", bad.length === 0, bad);
    if (want.enter) {
      await p.close(); p = await lib.open(ctx, base, "games/" + g, { before: noFlip });
      const cap = await p.evaluate(() => {
        const m = GameShell.menuKeys.all.find((x) => x.active() && x.start), s = document.querySelector(m.start);
        window.__hits = 0; s.addEventListener("click", () => { window.__hits++; }, { once: true, capture: true });
        return s.getAttribute("data-gs-key") || (s.querySelector("kbd") || {}).textContent || null;
      }).catch((e) => String(e));
      const go = await p.evaluate(() => (GameShell.menuKeys.all.find((x) => x.active() && x.start) || {}).space ? "Space or Enter" : "Enter").catch(() => "Enter");
      await p.keyboard.press("Enter");
      const hits = await p.evaluate(() => new Promise((r) => setTimeout(() => r(window.__hits), 60))).catch(() => "page left");
      check(g + ": Enter presses the start button, which shows its keycap (Enter, or Space or Enter where Space starts too)", hits === 1 && cap === go, { hits, cap, go });
    }
    check(g + ": no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- a key does what the click does: Tic-Tac-Toe, whose pickers all take keys
  {
    const p = await lib.open(ctx, base, "games/tic-tac-toe/", { before: noFlip });
    const sel = () => p.evaluate(() => ({
      board: document.querySelector('.opts[data-target="boardModeSel"] .sel').dataset.value, diff: document.querySelector('.opts[data-target="difficulty"] .sel').dataset.value,
      side: document.querySelector('.opts[data-target="chaosSide"] .sel').dataset.value, sideRow: document.getElementById("chaosSideGroup").style.display !== "none",
      open: document.getElementById("modeModal").classList.contains("open") }));
    const s0 = await sel();
    await p.keyboard.press("2"); const s1 = await sel();
    await p.keyboard.press("9"); const s2 = await sel();
    await p.keyboard.press("c"); const s3 = await sel();            // (no side row yet: nothing)
    await p.keyboard.press("5"); await p.keyboard.press("c"); const s4 = await sel();
    await p.keyboard.press("Control+1"); await p.keyboard.down("1"); await p.keyboard.down("1"); await p.keyboard.up("1");   // Ctrl+1 is the browser's; a held 1 picks once
    const s5 = await sel();
    await p.keyboard.press("Enter"); await p.waitForTimeout(200); const s6 = await sel();
    check("tic-tac-toe: 2 picks Ultimate, 9 Hard; C does nothing until Order & Chaos (5) brings the side row, then picks Chaos; Enter starts",
      s0.board === "classic" && s1.board === "ultimate" && s2.diff === "hard" && s3.side === "order" && !s3.sideRow && s4.board === "chaos" && s4.sideRow && s4.side === "chaos" &&
      s5.board === "classic" && s6.open === false, { s0, s1, s2, s3, s4, s5, s6 });
    // once the game is on, the picker's keys are dead (the board is up, the picker isn't)
    const before = await p.evaluate(() => document.getElementById("boardModeSel").value);
    await p.keyboard.press("3"); await p.keyboard.press("Enter");
    check("tic-tac-toe: with the picker shut its keys do nothing", (await p.evaluate(() => document.getElementById("boardModeSel").value)) === before && !(await sel()).open, before);
    check("tic-tac-toe keys: no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Chess: the mode menu, then the 2-player setup's rows, then Enter
  {
    const p = await lib.open(ctx, base, "games/chess/");
    const up = () => p.evaluate(() => ["menu", "setup2Menu", "endMenu"].filter((id) => document.getElementById(id).classList.contains("show")).join());
    const pick = () => p.evaluate(() => ({ opp: document.querySelector("#opponentPick .sel").dataset.opp, diff: document.querySelector("#diffPick .sel").dataset.diff, side: document.querySelector("#sidePick .sel").dataset.side }));
    await p.keyboard.press("2"); const u1 = await up();
    await p.keyboard.press("4"); const a = await pick();            // (the CPU's rows aren't up: 4 does nothing)
    await p.keyboard.press("2"); await p.keyboard.press("6"); await p.keyboard.press("b"); const b = await pick();
    await p.keyboard.press("Enter"); await p.waitForTimeout(200); const u2 = await up();
    check("chess: 2 opens the 2-player setup; there 2 picks the CPU, 6 Master and B Black (4 did nothing before the CPU's rows showed); Enter starts",
      u1 === "setup2Menu" && a.opp === "local" && a.diff === "medium" && b.opp === "cpu" && b.diff === "master" && b.side === "b" && u2 === "", { u1, a, b, u2 });
    await p.close();
    const q = await lib.open(ctx, base, "games/chess/");
    const anyMenu = () => q.evaluate(() => ["menu", "setup2Menu", "endMenu"].some((id) => document.getElementById(id).classList.contains("show")));
    await q.keyboard.press("4"); const e1 = await q.evaluate(() => document.getElementById("endMenu").classList.contains("show"));
    await q.keyboard.press("2"); await q.waitForTimeout(200);
    const e2 = { up: await anyMenu(), picked: await q.evaluate(() => (document.querySelector("#endMenu [data-gs-pick]") || { dataset: {} }).dataset.end) };
    await q.keyboard.press("Enter"); await q.waitForTimeout(200);
    const e3 = { up: await anyMenu(), sub: await q.evaluate(() => document.getElementById("modeLabel").textContent) };
    check("chess: 4 opens the 4-player end rules; a number there picks a rule (2 is Takeover) and Enter starts the game with it",
      e1 && e2.up && e2.picked === "2" && !e3.up && /takeover/i.test(e3.sub), { e1, e2, e3 });
    await q.keyboard.press("Home"); await q.waitForTimeout(200);
    await q.close();
    const r = await lib.open(ctx, base, "games/chess/");
    await Promise.all([r.waitForURL(/three\.html$/, { timeout: 15000 }).catch(() => {}), r.keyboard.press("3")]);
    check("chess: 3 goes to the 3-player board", /three\.html$/.test(r.url()), r.url());
    await r.close();
  }

  // ---- rows that only some modes have: Departures' continents, Lights Out's Zen sizes
  {
    let p = await lib.open(ctx, base, "games/departures/");
    await p.keyboard.press("5"); const d0 = await p.evaluate(() => document.getElementById("pick-region").hidden);   // (The World: no continents, 5 does nothing)
    await p.keyboard.press("2"); await p.keyboard.press("5");
    const d1 = await p.evaluate(() => ({ hidden: document.getElementById("pick-region").hidden, on: [...document.querySelectorAll("#pick-region button")].filter((b) => b.classList.contains("on")).map((b) => b.dataset.r).join(),
      caps: [...document.querySelectorAll("#pick-region kbd")].map((k) => k.textContent).join("") }));
    check("departures: with One Continent picked, 3-7 choose the continent (5 is Africa), and the buttons show the keys", d0 === true && !d1.hidden && d1.on === "AF" && d1.caps === "34567", { d0, d1 });
    check("departures keys: no page errors", p.errs.length === 0, p.errs);
    await p.close();
    p = await lib.open(ctx, base, "games/lights-out/");
    await p.keyboard.press("3"); await p.keyboard.press("6");
    const l1 = await p.evaluate(() => ({ hidden: document.getElementById("pick-size").hidden, on: [...document.querySelectorAll("#pick-size button")].filter((b) => b.classList.contains("on")).map((b) => b.dataset.n).join(),
      caps: [...document.querySelectorAll("#pick-size kbd")].map((k) => k.textContent).join("") }));
    check("lights-out: in Zen, 4 5 6 choose the board size (6 is 7×7), and the buttons show the keys", !l1.hidden && l1.on === "7" && l1.caps === "456", l1);
    check("lights-out keys: no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- a key never throws a game away unasked: Minesweeper's levels, LogicGate's modes, 2048's
  {
    let p = await lib.open(ctx, base, "games/minesweeper/");
    const lvl = () => p.evaluate(() => (document.querySelector(".lvl.sel") || {}).dataset.level);
    const box = () => p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
    const l0 = await lvl();
    await p.keyboard.press("2"); await p.waitForTimeout(150); const l1 = await lvl(), b1 = await box();     // fresh field: at once
    const pt = await p.evaluate(() => { const c = document.querySelectorAll(".field .c"); const e = c[Math.floor(c.length / 2)]; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(250);
    await p.keyboard.press("1"); await p.waitForSelector(".gs-dialog", { timeout: 5000 }).catch(() => {});
    const b2 = await box(), l2 = await lvl();
    await p.keyboard.press("Escape"); await p.waitForTimeout(250); const l3 = await lvl(), b3 = await box();
    await p.keyboard.press("1"); await p.waitForSelector(".gs-dialog", { timeout: 5000 }).catch(() => {}); await p.keyboard.press("Enter"); await p.waitForTimeout(250);
    const l4 = await lvl();
    check("minesweeper: a level's key switches a fresh field at once; mid-game it asks 'Start a new game?' (Esc keeps the game, Enter switches)",
      l0 === "beginner" && l1 === "intermediate" && !b1 && b2 === "Start a new game?" && l2 === "intermediate" && l3 === "intermediate" && !b3 && l4 === "beginner", { l0, l1, b1, b2, l2, l3, b3, l4 });
    await Promise.all([p.waitForURL(/endless\.html$/, { timeout: 15000 }).catch(() => {}), p.keyboard.press("e")]);
    const onEndless = /endless\.html$/.test(p.url());
    await p.waitForSelector(".mute-toggle"); await p.waitForTimeout(300);
    await Promise.all([p.waitForURL(/minesweeper\/$/, { timeout: 15000 }).catch(() => {}), p.keyboard.press("c")]);
    check("minesweeper: E opens the Endless tab, and C there comes back to Classic", onEndless && /minesweeper\/$/.test(p.url()), p.url());
    await p.close();

    p = await lib.open(ctx, base, "games/logicgate/");
    const mode = () => p.evaluate(() => document.body.dataset.lgMode);
    const m0 = await mode();
    await p.keyboard.press("2"); await p.waitForTimeout(150); const m1 = await mode();     // nothing placed: at once
    await p.click(".input.toggle"); await p.waitForTimeout(150);
    await p.keyboard.press("1"); await p.waitForSelector(".gs-dialog", { timeout: 5000 }).catch(() => {});
    const b = await p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null), m2 = await mode();
    await p.keyboard.press("Enter"); await p.waitForTimeout(250); const m3 = await mode();
    const caps = await p.evaluate(() => [...document.querySelectorAll("#modeBar .mode-btn")].map((x) => x.getAttribute("data-gs-key")).join(""));
    check("logicgate: 2 / 1 switch mode, asking first once there's work on the board; the rebuilt bar keeps its keycaps",
      m0 === "gates" && m1 === "inputs" && b === "Switch mode?" && m2 === "inputs" && m3 === "gates" && caps === "12", { m0, m1, b, m2, m3, caps });
    check("logicgate keys: no page errors", p.errs.length === 0, p.errs);
    await p.close();

    p = await lib.open(ctx, base, "games/2048/");
    const fib = () => p.evaluate(() => !document.getElementById("mode-fib").classList.contains("ghost"));
    await p.keyboard.press("2"); await p.waitForTimeout(150); const f1 = await fib();
    for (const k of ["ArrowLeft", "ArrowUp", "ArrowRight", "ArrowDown"]) { await p.keyboard.press(k); await p.waitForTimeout(120); }
    await p.keyboard.press("1"); await p.waitForSelector(".gs-dialog", { timeout: 5000 }).catch(() => {});
    const fb = await p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
    await p.keyboard.press("Escape"); await p.waitForTimeout(250); const f2 = await fib();
    check("2048: 2 switches a fresh board to Fibonacci; mid-game 1 asks first, and Esc keeps the game", f1 && fb === "Start a new game?" && f2, { f1, fb, f2 });
    await p.close();
  }

  // ---- text fields keep their typing; Steamfitter's editor is left alone
  {
    let p = await lib.open(ctx, base, "games/yi/");
    const n = () => p.evaluate(() => document.querySelector("#playerSeg .active").dataset.n);
    await p.click("#custom0"); await p.keyboard.press("End"); await p.keyboard.type("7f");
    const typed = await p.evaluate(() => document.getElementById("custom0").value), n1 = await n();
    await p.evaluate(() => document.activeElement.blur());
    await p.keyboard.press("7"); const n2 = await n();
    check("yi: 7 and F typed in a rule box stay in the box; outside it 7 sets seven players", /7f$/.test(typed) && n1 === "4" && n2 === "7", { typed, n1, n2 });
    await p.close();
    p = await lib.open(ctx, base, "games/steamfitter/");
    await p.evaluate(() => __game.startEditor(null)); await p.waitForTimeout(200);
    await p.keyboard.press("1"); await p.waitForTimeout(200);
    const ed = await p.evaluate(() => ({ state: __game.state, box: !!document.querySelector(".gs-dialog") }));
    check("steamfitter: in the level editor the mode keys do nothing", ed.state === "edit" && !ed.box, ed);
    await p.close();
  }

  // ---- on a phone there are no keys to show
  {
    const phone = await lib.newContext(browser, devices["Pixel 7"]);
    const shown = [];
    for (const g of ["tic-tac-toe/", "ping/", "sudoku/", "chess/"]) {
      const p = await lib.open(phone, base, "games/" + g, { before: noFlip });
      const any = await p.evaluate(() => [...document.querySelectorAll("[data-gs-key]")].filter((e) => e.getClientRects().length && getComputedStyle(e, "::after").display !== "none").length);
      const have = await p.evaluate(() => document.querySelectorAll("[data-gs-key]").length);
      // (nor is a picked button ringed there: a tap on any of them starts)
      const rings = await p.evaluate(() => [...document.querySelectorAll("[data-gs-pick]")].filter((e) => getComputedStyle(e).outlineStyle !== "none").length);
      if (any || !have || rings) shown.push(g + " " + any + "/" + have + " rings " + rings);
      await p.close();
    }
    check("on a touch-only device the menu keycaps are hidden, and no button is ringed as picked", shown.length === 0, shown);
    await phone.close();
  }

  await ctx.close();
};
