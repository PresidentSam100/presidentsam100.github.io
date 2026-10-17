// Klondike: the win cascade leaves nothing behind, so a click in the next
// deal doesn't bring the old win box back (whether the cascade ran to its end
// or a new deal cut it short); a new deal stops an auto-finish still flying
// cards home; keys do nothing under the pause card; in draw three the whole
// top waste card answers a click; a won deal can't be undone and won again.
// With Visual FX on a new deal is dealt out: every card starts on the stock,
// face down, and the tableau goes out a card at a time, a card to each pile in
// turn, ending where a deal simply laid out puts them; a press, a key, the
// switch flipped off or a resize finishes it at once; with FX off it is there.
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
// (in the page) __snap: where every card is and whether its back shows; how
// many sit on the stock; how many of the tableau's have gone out, and whether
// those are the first of the deal's order (a card to each pile in turn from
// the left, a row at a time). __going: whether a deal is still going out.
const SNAPS = () => {
  window.__going = () => !!(window.Klondike && Klondike.dealing && Klondike.dealing());
  window.__snap = () => {
    const RANKS = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"], SUITS = ["♠", "♥", "♦", "♣"];
    const rect = (el) => el.getBoundingClientRect(), st = Klondike.state();
    const key = (s) => { s = s.replace("*", ""); return SUITS.indexOf(s.slice(-1)) + "-" + RANKS.indexOf(s.slice(0, -1)); };
    const tab = st.tab.map((t) => (t ? t.split(" ") : []).map(key)), order = [];
    for (let row = 0; row < 7; row++) for (let ti = row; ti < 7; ti++) if (tab[ti][row]) order.push(tab[ti][row]);
    const cards = [...document.querySelectorAll("#field .card")];
    const home = rect(cards.find((el) => !order.includes(el.dataset.key)));   // (a card of the stock's own: where the stock is)
    const at = {};
    cards.forEach((el) => { const b = rect(el); at[el.dataset.key] = Math.round(b.left) + "," + Math.round(b.top) + (el.classList.contains("down") ? " back" : ""); });
    const out = order.filter((k) => document.querySelector('.card[data-key="' + k + '"]').classList.contains("dealt"));
    return { dealing: __going(), at,
      onStock: cards.filter((el) => Math.abs(rect(el).left - home.left) < 2 && Math.abs(rect(el).top - home.top) < 2).length,
      up: cards.filter((el) => !el.classList.contains("down")).length,
      out: out.length, inOrder: out.join() === order.slice(0, out.length).join(),
      stock: st.stock, waste: st.waste, moves: st.moves, timerMs: st.timerMs, seed: st.seed };
  };
};

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
  // (the new deal dealt out first: a press while it is going out only finishes it)
  await p.waitForFunction(() => !(Klondike.dealing && Klondike.dealing()), null, { timeout: 10000, polling: 50 });
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
  // (the new deal dealt out first: a press while it is going out only finishes it)
  await p.waitForFunction(() => !(Klondike.dealing && Klondike.dealing()), null, { timeout: 10000, polling: 50 });
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
  // (the toggle on an untouched deal, so it doesn't ask first)
  await p.evaluate(() => { Klondike.deal(3); document.getElementById("m-draw3").click(); Klondike.draw(); });
  // (measured once the drawn cards have settled: with Visual FX on they arc into
  // the waste, which on a busy machine outlasts a fixed wait)
  await p.waitForFunction(() => [...document.querySelectorAll(".card")].every((c) => !c.getAnimations().length), null, { timeout: 10000 }).catch(() => {});
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
  await p.evaluate(() => { Klondike.deal(3); document.getElementById("m-draw3").click(); });
  check("klondike: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- a won deal can't be undone and won again (FX off: the box comes straight up)
  p = await lib.open(ctx, base, "games/klondike/", { before: (pg) => pg.addInitScript(FX_OFF) });
  await p.evaluate(() => { Klondike.almostWin(); for (let i = 0; i < 4; i++) Klondike.move("t" + i, "f" + i, 1); });
  const w1 = await p.evaluate(() => JSON.parse(localStorage.getItem("klondike_stats") || "{}").w || 0);
  // the win box is the end of the game: Backspace puts it away (back to the
  // table) and Esc leaves for the games page, as on every other end screen
  // (Esc used to close the box and stay)
  const winUp = await box(p);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);   // closes the box
  const winShut = { box: await box(p), leaves: p.leaves };
  await p.keyboard.press("u"); await p.waitForTimeout(100);
  await p.evaluate(() => { for (let i = 0; i < 4; i++) Klondike.move("t" + i, "f" + i, 1); });
  const w2 = await p.evaluate(() => ({ w: JSON.parse(localStorage.getItem("klondike_stats") || "{}").w || 0, won: Klondike.state().won }));
  check("klondike: a won deal can't be undone and won (and counted) again", w1 === 1 && w2.w === 1 && w2.won, { w1, w2 });
  {
    // (a page of its own for Esc: it goes to the games page)
    const q = await lib.open(ctx, base, "games/klondike/", { before: (pg) => pg.addInitScript(FX_OFF) });
    await q.evaluate(() => { Klondike.almostWin(); for (let i = 0; i < 4; i++) Klondike.move("t" + i, "f" + i, 1); });
    const up = await box(q);
    await q.keyboard.press("Escape"); await lib.leftBy(q, 1);
    check("klondike: on the win box Backspace puts the box away without leaving, and Esc leaves for the games page",
      winUp && !winShut.box && winShut.leaves === 0 && up && q.leaves === 1, { winUp, winShut, up, leaves: q.leaves });
    await q.close();
  }
  // (a guard: nothing asked before either) a won deal restarts at once
  await p.keyboard.press("r"); await p.waitForTimeout(150);
  const wonR = await p.evaluate(() => ({ dlg: !!document.querySelector(".gs-dialog"), st: Klondike.state() }));
  check("klondike: R on a won deal restarts it at once, without asking", !wonR.dlg && wonR.st.moves === 0 && !wonR.st.won, { dlg: wonR.dlg, moves: wonR.st.moves });
  check("klondike: no page errors (FX off)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- mid-game, R, N / F2, the menu's Restart / Deal new and the draw
  // toggle ask first, with the game paused underneath: Esc keeps playing,
  // Enter goes (and the new deal isn't left paused)
  p = await lib.open(ctx, base, "games/klondike/");
  const dlg = () => p.evaluate(() => {
    const d = document.querySelector(".gs-dialog");
    return d && { title: d.querySelector("h2").textContent, ok: [...d.querySelectorAll("button")].pop().textContent, paused: Klondike.state().paused };
  });
  const press = (k) => async () => p.keyboard.press(k);
  const click = (id) => async () => p.evaluate((id) => document.getElementById(id).click(), id);
  const exits = [
    ["R", press("r"), "Start over?", "Start over", (a, b) => b.seed === a.seed],
    ["N", press("n"), "Start a new game?", "New game", (a, b) => b.seed !== a.seed],
    ["F2", press("F2"), "Start a new game?", "New game", (a, b) => b.seed !== a.seed],
    ["the menu's Restart this deal", click("m-restart"), "Start over?", "Start over", (a, b) => b.seed === a.seed],
    ["the menu's Deal new", click("m-new"), "Start a new game?", "New game", (a, b) => b.seed !== a.seed],
    ["the draw-three toggle", click("m-draw3"), "Start a new game?", "New game", (a, b) => b.draw3 !== a.draw3 && b.seed !== a.seed],
    ["the menu's Daily claim", click("m-daily"), "Start a new game?", "New game", (a, b) => b.isDaily && !a.isDaily],
  ];
  for (const [name, act, title, ok, dealt] of exits) {
    await p.evaluate(() => { Klondike.deal(7); Klondike.draw(); }); await p.waitForTimeout(80);   // a game in progress
    const a = await p.evaluate(() => Klondike.state());
    await act(); await p.waitForTimeout(120);
    const d = await dlg();
    await p.keyboard.press("Escape"); await p.waitForTimeout(120);
    const kept = await p.evaluate(() => ({ st: Klondike.state(), dlg: !!document.querySelector(".gs-dialog") }));
    await act(); await p.waitForTimeout(120);
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    const went = await p.evaluate(() => ({ st: Klondike.state(), dlg: !!document.querySelector(".gs-dialog") }));
    const okKept = !kept.dlg && !kept.st.paused && kept.st.seed === a.seed && kept.st.moves === a.moves && kept.st.draw3 === a.draw3;
    const okWent = !went.dlg && !went.st.paused && went.st.moves === 0 && dealt(a, went.st);
    check("klondike: mid-game, " + name + " asks \"" + title + "\" first; Esc keeps the game, Enter goes",
      !!d && d.title === title && d.ok.indexOf(ok) === 0 && d.paused && okKept && okWent,
      { d, kept: [kept.dlg, kept.st.paused, kept.st.seed, kept.st.moves], went: [went.dlg, went.st.paused, went.st.seed, went.st.moves, went.st.draw3] });
  }
  if ((await p.evaluate(() => Klondike.state().draw3))) await p.evaluate(() => document.getElementById("m-draw3").click());   // (a fresh deal: no ask)
  // (a guard: nothing asked before either) an untouched deal goes at once
  await p.evaluate(() => Klondike.deal(7)); await p.waitForTimeout(80);
  await p.keyboard.press("n"); await p.waitForTimeout(120);
  const fresh2 = await p.evaluate(() => ({ dlg: !!document.querySelector(".gs-dialog"), seed: Klondike.state().seed }));
  check("klondike: N on an untouched deal deals at once, without asking", !fresh2.dlg && fresh2.seed !== 7, fresh2);
  check("klondike: no page errors (asking)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- paused (by P, or under a "Start over?" box) every card shows its back,
  // since the pause card is see-through; resumed, the faces are back
  p = await lib.open(ctx, base, "games/klondike/");
  const faces = () => p.evaluate(() => [...document.querySelectorAll("#field .card")].filter((c) => getComputedStyle(c.querySelector(".idx")).display !== "none").length);
  await p.evaluate(() => { Klondike.deal(7); Klondike.draw(); }); await p.waitForTimeout(80);
  const up = await faces();
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const byP = await faces();
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const resumed = await faces();
  await p.keyboard.press("r"); await p.waitForTimeout(150);
  const asking = { faces: await faces(), dlg: await p.evaluate(() => !!document.querySelector(".gs-dialog")) };
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const kept2 = await faces();
  check("klondike: paused by P or under a \"Start over?\" box, every card shows its back; resumed, the faces come back",
    up === 8 && byP === 0 && resumed === up && asking.dlg && asking.faces === 0 && kept2 === up, { up, byP, resumed, asking, kept2 });
  check("klondike: no page errors (paused cards)", p.errs.length === 0, p.errs);
  await ctx.close();

  // ---- a new deal is dealt out (Visual FX on): it starts with every card on
  // the stock, face down, and ends where a deal simply laid out puts them
  {
    const c = await lib.newContext(browser);
    const slim = (s) => s && Object.assign({}, s, { at: undefined });
    const laid = (q) => q.evaluate(() => { Klondike.deal(Klondike.state().seed); return __snap(); });   // the same deal, laid out at once
    const same = (a, b) => JSON.stringify(a.at) === JSON.stringify(b.at);
    let q = await lib.open(c, base, "games/klondike/", { before: (pg) => pg.addInitScript(SNAPS) });
    await q.waitForFunction(() => !__going(), null, { timeout: 15000 });      // (the deal the page opened with)
    // (asked for and looked at in one go, before a card has moved; then again when it is done)
    const run = await q.evaluate(() => new Promise((res) => {
      const t0 = performance.now();
      document.getElementById("m-new").click();
      const first = __snap();
      (function tick() { if (!__going()) res({ first, took: Math.round(performance.now() - t0), last: __snap() }); else setTimeout(tick, 10); })();
    }));
    const flat = await laid(q);
    check("klondike, FX on: a new deal starts with all 52 cards on the stock, face down, and nothing in play",
      run.first.dealing && run.first.onStock === 52 && run.first.up === 0 && run.first.out === 0 && run.first.moves === 0, slim(run.first));
    check("klondike, FX on: the deal goes out over about a second and ends where a deal simply laid out puts every card (24 on the stock, seven face up), no move made and no clock run",
      run.took >= 700 && !run.last.dealing && run.last.onStock === 24 && run.last.up === 7 && run.last.out === 0 && same(run.last, flat) &&
      run.last.moves === 0 && run.last.timerMs === 0, { took: run.took, last: slim(run.last) });
    check("klondike (the deal): no page errors", q.errs.length === 0, q.errs);
    await q.close();

    // ---- the same on a slowed deal (a card every 0.6 s), so a press or a key
    // is sure to land while it is still going out
    q = await lib.open(c, base, "games/klondike/", { before: async (pg) => {
      await pg.addInitScript(SNAPS);
      await lib.injectScript(pg, "games/klondike/game.js", [["var DEAL_STEP = 36", "var DEAL_STEP = 600"]]);
    } });
    const mid = await q.evaluate(() => new Promise((res) => {
      let n = 0;
      (function tick() { const s = __snap(); if (s.out >= 2 || !s.dealing || ++n > 800) res(s); else setTimeout(tick, 10); })();
    }));
    check("klondike, FX on: the page opens on a deal going out a card at a time, a card to each pile in turn from the left, the rest waiting on the stock with their backs up",
      // (every card not yet out still on the stock, and the first out gone from it: a card
      // only just sent can still be there, and on a busy machine a few sent at once)
      mid.dealing && mid.out >= 2 && mid.out < 28 && mid.inOrder && mid.onStock >= 52 - mid.out && mid.onStock < 52 && mid.up <= mid.out, slim(mid));
    // a press finishes it and does no more; the next one draws
    const s0 = await q.evaluate(() => Klondike.slotPos("stock"));
    const was = await q.evaluate(() => __going());
    await q.mouse.click(s0.x, s0.y); await q.waitForTimeout(80);
    const pressed = await q.evaluate(() => __snap());
    await q.mouse.click(s0.x, s0.y); await q.waitForTimeout(80);
    const drew = await q.evaluate(() => Klondike.state().stock);
    check("klondike: a press while the deal is going out finishes it at once (every card in place) and does no more; the next press on the stock draws",
      was && !pressed.dealing && pressed.onStock === 24 && pressed.up === 7 && pressed.out === 0 && pressed.stock === 24 && pressed.waste === "" && pressed.moves === 0 && drew === 23,
      { was, pressed: slim(pressed), drew });
    // N (asked first: a card is drawn), Enter: the new deal is dealt out too; F1 finishes it and opens How to play
    await q.keyboard.press("n"); await q.waitForTimeout(120);
    await q.keyboard.press("Enter"); await q.waitForTimeout(120);
    const byKey = await q.evaluate(() => __snap());
    await q.keyboard.press("F1"); await q.waitForTimeout(120);
    const keyed = await q.evaluate(() => Object.assign(__snap(), { box: !document.getElementById("shade").hidden }));
    await q.keyboard.press("Escape"); await q.waitForTimeout(80);
    check("klondike: a new deal confirmed with Enter is dealt out too; a key while it is going out finishes it and then does what it does (F1: How to play)",
      byKey.dealing && byKey.moves === 0 && !keyed.dealing && keyed.onStock === 24 && keyed.up === 7 && keyed.box, { byKey: slim(byKey), keyed: slim(keyed) });
    // Visual FX switched off mid-deal lands the cards; with it off a new deal is simply there
    await q.keyboard.press("n"); await q.waitForTimeout(80);
    const going = await q.evaluate(() => __going());
    await q.evaluate(() => document.querySelector(".rm-toggle").click()); await q.waitForTimeout(80);
    const flipped = await q.evaluate(() => __snap());
    const off = await q.evaluate(() => { document.getElementById("m-new").click(); return Object.assign(__snap(), { fxOff: window.RM_ON() }); });
    check("klondike: Visual FX switched off mid-deal lands every card at once; with it off a new deal is simply there",
      going && !flipped.dealing && flipped.onStock === 24 && flipped.up === 7 && off.fxOff && !off.dealing && off.onStock === 24 && off.up === 7 && off.seed !== flipped.seed,
      { going, flipped: slim(flipped), off: slim(off) });
    // a window resized mid-deal: the cards land where the new size puts them
    await q.evaluate(() => { document.querySelector(".rm-toggle").click(); document.getElementById("m-new").click(); });
    const going2 = await q.evaluate(() => __going());
    await q.setViewportSize({ width: 500, height: 800 });
    await q.waitForFunction(() => !__going(), null, { timeout: 5000 }).catch(() => {});
    await q.waitForTimeout(80);
    const sized = await q.evaluate(() => __snap()), flat2 = await laid(q);
    check("klondike: a window resized mid-deal lands the cards where the new size puts them",
      going2 && !sized.dealing && sized.onStock === 24 && sized.up === 7 && same(sized, flat2) && !same(sized, flat), { going2, sized: slim(sized) });
    check("klondike (the deal, slowed): no page errors", q.errs.length === 0, q.errs);
    await c.close();
  }

  // ---- the How to play key legend shows with a keyboard, hides on a touch-only phone
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/klondike/");
    await q.evaluate(() => document.getElementById("m-rules").click()); await q.waitForTimeout(100);
    const legend = await q.evaluate(() => { const li = [...document.querySelectorAll("#mb-body li")].find((x) => x.querySelector("kbd")); return li ? li.getClientRects().length > 0 : null; });
    check("klondike: the How to play key legend " + (label === "phone" ? "is hidden on a touch-only phone" : "shows with a keyboard"), legend === (label !== "phone"), legend);
    await c.close();
  }
};
