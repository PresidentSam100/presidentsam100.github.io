// Klondike: the win cascade leaves nothing behind, so a click in the next
// deal doesn't bring the old win box back (whether the cascade ran to its end
// or a new deal cut it short); a new deal stops an auto-finish still flying
// cards home; keys do nothing under the pause card; in draw three the whole
// top waste card answers a click; a won deal can't be undone and won again.
// requestAnimationFrame (and performance.now) on a clock the test advances
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
const FX_OFF = () => { try { localStorage.setItem("reduceMotion:klondike", "1"); } catch (e) {} };

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const box = (p) => p.evaluate(() => !document.getElementById("shade").hidden);
  const clickStock = async (p) => { const s = await p.evaluate(() => Klondike.slotPos("stock")); await p.mouse.click(s.x, s.y); await p.waitForTimeout(150); };

  // ---- the cascade runs to its end; Deal new; click the stock (in a small
  // window: each stepped frame repaints the whole night sky)
  const small = await lib.newContext(browser, { viewport: { width: 560, height: 480 } });
  let p = await lib.open(small, base, "games/klondike/", { before: (pg) => pg.addInitScript(STEPPED) });
  await p.evaluate(() => { __frames(2); Klondike.almostWin(); Klondike.autoFinish(); });
  // (polled on a timer: this page's animation frames only come when stepped)
  await p.waitForFunction(() => Klondike.state().cascade, null, { timeout: 5000, polling: 50 });
  const ran = await p.evaluate(() => { let n = 0; while (Klondike.state().cascade && n < 4000) { __frames(10); n += 10; } return n; });
  const won = await box(p);
  await p.evaluate(() => { [...document.querySelectorAll("#mb-row button")].find((b) => /Deal new/.test(b.textContent)).click(); __frames(2); });
  await clickStock(p);
  const again = await box(p);
  check("klondike: after a win cascade runs to its end, a click in the next deal doesn't bring the win box back", won && !again, { ran, won, again });
  check("klondike: no page errors (cascade)", p.errs.length === 0, p.errs);
  await small.close();

  // ---- a new deal (N) in the middle of the cascade; click the stock
  p = await lib.open(ctx, base, "games/klondike/");
  await p.evaluate(() => { Klondike.almostWin(); Klondike.autoFinish(); });
  await p.waitForFunction(() => Klondike.state().cascade, null, { timeout: 5000 });
  await p.keyboard.press("n"); await p.waitForTimeout(100);
  await clickStock(p);
  const cut = await box(p);
  check("klondike: a new deal dealt during the cascade doesn't bring the old win box back on its first click", !cut, { cut });

  // ---- N while an auto-finish is still flying cards home (seed 1 deals open aces)
  await p.evaluate(() => { Klondike.almostWin(); Klondike.autoFinish(); Klondike.deal(1); });
  await p.waitForTimeout(700);
  const fresh = await p.evaluate(() => Klondike.state());
  check("klondike: a new deal stops an auto-finish still running, so the deal doesn't play itself",
    fresh.seed === 1 && fresh.moves === 0 && fresh.found.every((f) => f === ""), { moves: fresh.moves, found: fresh.found });

  // ---- keys under the pause card
  await p.evaluate(() => { Klondike.deal(7); Klondike.draw(); Klondike.draw(); });
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const k0 = await p.evaluate(() => Klondike.state());
  for (const k of ["u", "h", "r", "n", "Enter"]) await p.keyboard.press(k);
  await p.keyboard.press("Control+z");
  await p.waitForTimeout(100);
  const k1 = await p.evaluate(() => ({ st: Klondike.state(), hints: document.querySelectorAll(".hintsrc, .hintdst").length }));
  check("klondike: U, H, R, N, Enter and Ctrl+Z do nothing while paused",
    k0.paused && k1.st.paused && k1.st.seed === k0.seed && k1.st.moves === k0.moves && k1.st.waste === k0.waste && k1.hints === 0, { k0: [k0.seed, k0.moves, k0.waste], k1: [k1.st.seed, k1.st.moves, k1.st.waste, k1.hints] });
  await p.keyboard.press("p");

  // ---- draw three: a press near the right edge of the top waste card picks it up
  await p.evaluate(() => { document.getElementById("m-draw3").click(); Klondike.draw(); });
  await p.waitForTimeout(250);
  const top = await p.evaluate(() => {
    const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"], SUITS = ["♠", "♥", "♦", "♣"];
    const w = Klondike.state().waste.split(" "), c = w[w.length - 1];
    const r = RANKS.indexOf(c.slice(0, -1)), s = SUITS.indexOf(c.slice(-1));
    return { key: s + "-" + r, pos: Klondike.cardPos(r, s), n: w.length };
  });
  await p.mouse.move(top.pos.x + top.pos.w / 2 - 4, top.pos.y); await p.mouse.down();
  const grabbed = await p.evaluate((k) => document.querySelector('.card[data-key="' + k + '"]').classList.contains("drag"), top.key);
  await p.mouse.up();
  check("klondike: in draw three a press near the top waste card's right edge picks it up", top.n === 3 && grabbed, { top, grabbed });
  await p.evaluate(() => document.getElementById("m-draw3").click());
  check("klondike: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- a won deal can't be undone and won again (FX off: the box comes straight up)
  p = await lib.open(ctx, base, "games/klondike/", { before: (pg) => pg.addInitScript(FX_OFF) });
  await p.evaluate(() => { Klondike.almostWin(); for (let i = 0; i < 4; i++) Klondike.move("t" + i, "f" + i, 1); });
  const w1 = await p.evaluate(() => JSON.parse(localStorage.getItem("klondike_stats") || "{}").w || 0);
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);   // closes the box
  await p.keyboard.press("u"); await p.waitForTimeout(100);
  await p.evaluate(() => { for (let i = 0; i < 4; i++) Klondike.move("t" + i, "f" + i, 1); });
  const w2 = await p.evaluate(() => ({ w: JSON.parse(localStorage.getItem("klondike_stats") || "{}").w || 0, won: Klondike.state().won }));
  check("klondike: a won deal can't be undone and won (and counted) again", w1 === 1 && w2.w === 1 && w2.won, { w1, w2 });
  check("klondike: no page errors (FX off)", p.errs.length === 0, p.errs);
  await ctx.close();
};
