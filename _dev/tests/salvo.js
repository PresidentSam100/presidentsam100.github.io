// Salvo: a shot fired in the moment between the last sinking and the end card
// doesn't count the win again; with storage blocked the game still runs.
const HOOK = ['  $("againBtn").addEventListener("click", newGame);', '  window.__salvo = { get enemyShips() { return enemyShips; } };\n  $("againBtn").addEventListener("click", newGame);'];
const BLOCK_STORAGE = (pg) => pg.addInitScript(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
});

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const hook = (pg) => lib.injectScript(pg, "games/salvo/game.js", [HOOK]);

  let p = await lib.open(ctx, base, "games/salvo/", { before: hook });
  await p.evaluate(() => { window.coinFlip = (o, cb) => cb("you"); });
  await p.keyboard.press("a"); await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const res = await p.evaluate(async () => {
    const grid = document.getElementById("enemyGrid");
    const cellAt = (r, c) => grid.querySelector('.cell[data-r="' + r + '"][data-c="' + c + '"]');
    const click = (el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    const ships = new Set();
    __salvo.enemyShips.forEach((s) => s.cells.forEach((rc) => { ships.add(rc[0] + "," + rc[1]); click(cellAt(rc[0], rc[1])); }));   // every shot a hit: the turn never passes
    // the fleet is down and the end card is on its way: one more shot, at open water
    for (let i = 0; i < 100; i++) if (!ships.has(((i / 10) | 0) + "," + (i % 10))) { click(cellAt((i / 10) | 0, i % 10)); break; }
    await new Promise((r) => setTimeout(r, 900));
    return { rec: JSON.parse(localStorage.getItem("battleship_record")), over: !document.getElementById("over").classList.contains("hidden") };
  });
  check("salvo: a shot after the last sinking doesn't count the win twice", res.over && res.rec.w === 1 && res.rec.l === 0, res);

  // the end card: Backspace goes back to the fleet screen, the game's menu,
  // but not in its first second (Backspace is a placement key, Reset); Esc
  // leaves for the games page
  const shown = () => p.evaluate(() => ({ over: !document.getElementById("over").classList.contains("hidden"), placing: document.getElementById("placeControls").style.display !== "none" && document.getElementById("enemyCol").hidden }));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(80);
  const early = await shown();
  await p.waitForTimeout(1000);
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  const esc = Object.assign(await shown(), { leaves: p.leaves });
  await p.keyboard.press("Backspace"); await p.waitForTimeout(80);
  const back = await shown();
  check("salvo: on the end card Esc leaves, Backspace goes back to the fleet screen (not in the card's first second)",
    early.over && esc.over && esc.leaves === 1 && !back.over && back.placing && p.leaves === 1, { early, esc, back });
  check("salvo: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  p = await lib.open(ctx, base, "games/salvo/", { before: BLOCK_STORAGE });
  await p.keyboard.press("a"); await p.waitForTimeout(80);
  const placed = await p.evaluate(() => (document.getElementById("placing") || {}).textContent || "");
  check("salvo: with storage blocked the fleet can still be placed", p.errs.length === 0 && /All ships placed/.test(placed), { errs: p.errs, placed });
  await p.close();

  // ---- the fleet screen: a key held down acts once (a held R spun the ship
  // round and round, a held A dealt fleet after fleet); with Visual FX on a
  // ship set down drops into place and the water rings round it, and the
  // swell drifts over your waters; with it off the ships are simply there and
  // the sea holds still. At a laptop's size and a phone's.
  const { devices } = require("@playwright/test");
  for (const [label, dev] of [["laptop", {}], ["phone", Object.assign({}, devices["iPhone 13"], { viewport: { width: 390, height: 664 } })]]) {
    for (const fxOff of [false, true]) {
      const c = await lib.newContext(browser, dev);
      const q = await lib.open(c, base, "games/salvo/", { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:salvo", off ? "1" : "0"); } catch (e) {} }, fxOff) });
      const fleet = () => q.evaluate(() => [...document.querySelectorAll("#playerGrid .cell.ship")].map((e) => e.dataset.r + e.dataset.c).join());
      const orient = () => q.evaluate(() => /vertical/.test(document.getElementById("placing").textContent) ? "v" : "h");
      const key = (k, repeat) => lib.fireKey(q, { key: k, code: "Key" + k.toUpperCase(), repeat });
      const o0 = await orient(); await key("r", false); const o1 = await orient(); await key("r", true); await key("r", true); const o2 = await orient();
      await key("a", false); const f1 = await fleet(); await key("a", true); await key("a", true); const f2 = await fleet();
      const drops = await q.evaluate(() => ({ drop: document.querySelectorAll("#playerGrid .cell.drop").length, ship: document.querySelectorAll("#playerGrid .cell.ship").length,
        swell: getComputedStyle(document.getElementById("playerGrid"), "::before").animationName }));
      // A new fleet at random over the last one (FX on): every ship comes down
      // whole, never a cell of it ahead of the rest, also where it lies on a
      // cell a ship of the last fleet had (that cell kept its old drop, long
      // landed, and showed at once). Read the moment A is pressed (every hull
      // still to come down) and mid-drop (each ship's cells all alike); then
      // A pressed again and again, and all landed in the end.
      const over = fxOff ? null : await q.evaluate(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        const cells = () => [...document.querySelectorAll("#playerGrid .cell.ship")];
        // (how far down its drop a hull is: its fade and its scale, which a
        // cell's own size doesn't change as it does the shift)
        const look = (e) => { const s = getComputedStyle(e, "::before"), m = /matrix\(([-\d.e]+)/.exec(s.transform); return (+s.opacity).toFixed(2) + " " + (m ? (+m[1]).toFixed(3) : s.transform); };
        const shown = () => cells().filter((e) => getComputedStyle(e, "::before").opacity !== "0").length;
        // the ships whose cells don't all look alike (each ship has its own grey, ship0 to ship4)
        const split = () => {
          const by = {};
          cells().forEach((e) => { const k = [...e.classList].find((c) => /^ship\d$/.test(c)); (by[k] = by[k] || new Set()).add(look(e)); });
          return Object.keys(by).filter((k) => by[k].size > 1);
        };
        const random = () => document.getElementById("randomBtn").click();
        const res = { tries: 0, shared: 0 };
        await wait(1300);   // the last fleet all landed
        while (!res.shared && res.tries < 12) {
          const old = new Set(cells().map((e) => e.dataset.r + "," + e.dataset.c));
          random(); res.tries++;
          res.shared = cells().filter((e) => old.has(e.dataset.r + "," + e.dataset.c)).length;
          if (!res.shared) await wait(1300);
        }
        res.shownAt0 = shown();
        res.split = [];
        for (let i = 0; i < 6; i++) { await wait(60); res.split.push(...split()); }
        for (let i = 0; i < 5; i++) { random(); await wait(45); }
        random(); res.again = { shownAt0: shown(), split: [] };
        for (let i = 0; i < 6; i++) { await wait(60); res.again.split.push(...split()); }
        await wait(1300);
        res.landed = cells().filter((e) => /^1\.00 (none|1\.000)$/.test(look(e))).length; res.cells = cells().length;
        return res;
      });
      if (over) check("salvo " + label + ", Visual FX on: a fleet dealt at random over the last one drops ship by ship, each ship whole, none of its cells ahead (also where it lies on a cell of the last fleet, and with A pressed again and again)",
        over.shared > 0 && over.shownAt0 === 0 && !over.split.length && over.again.shownAt0 === 0 && !over.again.split.length && over.landed === 17 && over.cells === 17, over);
      // a ship set down by hand, on a fresh fleet screen
      await q.click("#resetBtn");
      await q.click('#playerGrid .cell[data-r="0"][data-c="0"]');
      const one = await q.evaluate(() => document.querySelectorAll("#playerGrid .cell.drop").length);
      if (!fxOff) check("salvo " + label + ": R and A act once per press, never again while held (the ship turns once, one fleet is dealt)",
        o1 !== o0 && o2 === o1 && f1.length > 0 && f2 === f1, { o0, o1, o2, same: f2 === f1 });
      check("salvo " + label + ", Visual FX " + (fxOff ? "off: ships set down are simply there and the sea holds still" : "on: a ship set down drops in with the water ringing round it (a random fleet, every ship), and the swell drifts"),
        fxOff ? drops.drop === 0 && one === 0 && drops.swell === "none" : drops.drop === drops.ship && drops.ship === 17 && one === 5 && drops.swell === "swell",
        { drops, one });
      check("salvo " + label + " (fleet screen): no page errors", q.errs.length === 0, q.errs);
      await q.close();
      await c.close();
    }
  }
  await ctx.close();
};
