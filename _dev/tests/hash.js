// Hash: a hint stays lit through the re-renders that picking cards causes,
// so the next hint shows a second card instead of charging again for the
// first; Enter or Space on a card keeps keyboard focus on that card. The
// clock runs from the deal, and a deal in a hidden tab starts paused; P / Esc
// / a hidden tab pause it, with the cards blank under the pause card; leaving
// or ↻ New game mid-deck asks first with the game paused; a best time leaves
// the paused time out and keeps the hint penalty in.
const HOOK = ["  renderBest();\n  newGame();\n})();", "  renderBest();\n  newGame();\n  window.__h = { get board() { return board; }, findSet: findSet, emptyDeck: function () { deck = []; } };\n})();"];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/hash/", { before: (pg) => lib.injectScript(pg, "games/hash/game.js", [HOOK]) });
  const lit = () => p.evaluate(() => [...document.querySelectorAll("#board .card.hint")].map((c) => +c.dataset.idx));
  // a new deal, saying yes if it asks first (mid-deck it does)
  const deal = async () => {
    await p.click("#newBtn"); await p.waitForTimeout(100);
    if (await p.evaluate(() => !!document.querySelector(".gs-dialog"))) { await p.keyboard.press("Enter"); await p.waitForTimeout(100); }
  };

  // hint, pick the glowing card, put it back, hint again
  await p.click("#hintBtn");
  const h1 = await lit();
  const card = '.card[data-idx="' + h1[0] + '"]';
  await p.click(card);
  const picked = await p.evaluate((s) => { const c = document.querySelector(s); return { selected: c.classList.contains("selected"), hint: c.classList.contains("hint") }; }, card);
  await p.click(card);
  const h2 = await lit();
  await p.click("#hintBtn");
  const h3 = await lit(), msg = await p.evaluate(() => document.getElementById("msg").textContent);
  check("hash: a hinted card glows again once it's picked and put back, and the next hint lights a second card",
    h1.length === 1 && picked.selected && !picked.hint && h2.join() === h1.join() && h3.length === 2 && h3.includes(h1[0]) && /two cards/.test(msg), { h1, picked, h2, h3, msg });

  // keyboard: Enter picks a card and focus stays on it; Space puts it back
  await deal();
  await p.focus('.card[data-idx="4"]');
  await p.keyboard.press("Enter");
  const k1 = await p.evaluate(() => { const a = document.activeElement; return { idx: a.dataset ? a.dataset.idx : null, selected: a.classList.contains("selected") }; });
  await p.keyboard.press(" ");
  const k2 = await p.evaluate(() => { const a = document.activeElement; return { idx: a.dataset ? a.dataset.idx : null, selected: a.classList.contains("selected") }; });
  check("hash: Enter or Space on a card keeps keyboard focus on that card", k1.idx === "4" && k1.selected && k2.idx === "4" && !k2.selected, { k1, k2 });

  // and through a claim: focus on the last card of a found Hash stays in its slot
  await deal();
  const set = await p.evaluate(() => __h.findSet(__h.board));
  for (const i of set) { await p.focus('.card[data-idx="' + i + '"]'); await p.keyboard.press("Enter"); }
  await p.waitForFunction(() => document.querySelector("#board .card.enter-left"), null, { timeout: 5000 });   // the refill is in
  const k3 = await p.evaluate(() => { const a = document.activeElement; return a.closest("#board") ? a.dataset.idx : a.tagName; });
  check("hash: after a Hash claimed by keyboard, focus stays in that card's slot", k3 === String(set[2]), { k3, set });
  check("hash: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  const open = () => lib.open(ctx, base, "games/hash/", { before: (pg) => lib.injectScript(pg, "games/hash/game.js", [HOOK]) });
  const time = (q) => q.evaluate(() => document.getElementById("statTime").textContent);
  // how many cards show their faces; whether the pause card is up
  const look = (q) => q.evaluate(() => ({
    faces: [...document.querySelectorAll("#board .card")].filter((c) => { const s = c.querySelector(".sym"); return s && getComputedStyle(s).visibility !== "hidden"; }).length,
    paused: !!document.querySelector(".gs-pause:not(.gs-dialog):not([hidden])"),
  }));

  // ---- a deal in a hidden tab (a page opened in the background, or New game
  // while hidden) starts paused, cards blank, clock at 0:00
  const hidden = await lib.open(ctx, base, "games/hash/", { before: async (pg) => {
    await lib.injectScript(pg, "games/hash/game.js", [HOOK]);
    await pg.addInitScript(() => { Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); });
  } });
  await hidden.waitForTimeout(1300);
  const opened = Object.assign(await look(hidden), { time: await time(hidden) });
  await hidden.keyboard.press("p"); await hidden.waitForTimeout(100);   // resumed by hand
  const resumed = await look(hidden);
  await hidden.click("#newBtn"); await hidden.waitForTimeout(100);       // (a fresh deal: no question)
  const redealt = await look(hidden);
  check("hash: a deal in a hidden tab starts paused, cards blank and the clock held, whether on opening or after New game",
    opened.paused && opened.faces === 0 && opened.time === "0:00" && !resumed.paused && redealt.paused && redealt.faces === 0, { opened, resumed, redealt });
  await hidden.close();

  // ---- on a visible tab the clock runs from the deal
  let q = await open();
  await q.waitForTimeout(2300);
  const after = await time(q);
  check("hash: on a visible tab the clock runs from the deal", after !== "0:00", { after });
  await q.click('.card[data-idx="0"]');

  // ---- P pauses: the clock holds, the cards go blank and take no picks; P resumes;
  // a hidden tab (its blur) pauses too
  await q.keyboard.press("p"); await q.waitForTimeout(100);
  const p0 = await look(q), t0 = await time(q);
  await q.focus('.card[data-idx="3"]'); await q.keyboard.press("Enter");
  await q.waitForTimeout(2300);
  const p1 = await look(q), t1 = await time(q), picks = await q.evaluate(() => document.querySelectorAll("#board .card.selected").length);
  await q.keyboard.press("p"); await q.waitForTimeout(100);
  const r0 = await look(q);
  await q.waitForTimeout(1200);
  const t2 = await time(q);
  await q.evaluate(() => window.dispatchEvent(new Event("blur"))); await q.waitForTimeout(100);
  const b0 = await look(q);
  check("hash: P pauses (cards blank, clock held, no picks) and resumes (cards back, clock on); losing focus pauses too",
    p0.paused && p0.faces === 0 && p1.paused && p1.faces === 0 && t1 === t0 && picks === 1 && !r0.paused && r0.faces >= 12 && t2 !== t1 && b0.paused && b0.faces === 0,
    { p0, p1, t0, t1, picks, r0, t2, b0 });
  check("hash (pause): no page errors", q.errs.length === 0, q.errs);
  await q.close();

  // ---- leaving mid-deck (a hint taken) asks first, the game paused underneath
  q = await open();
  await q.click("#hintBtn"); await q.waitForTimeout(100);
  await q.keyboard.press("Home"); await q.waitForTimeout(300);
  const asked = await q.evaluate(() => !!document.querySelector(".gs-dialog")), under = await look(q);
  const ta = await time(q); await q.waitForTimeout(1200); const tb = await time(q);
  await q.keyboard.press("Escape"); await q.waitForTimeout(250);
  const kept = await look(q);
  check("hash: leaving mid-deck asks first, with the clock held and the cards blank underneath; Keep playing brings them back",
    asked && under.faces === 0 && ta === tb && q.leaves === 0 && !kept.paused && kept.faces >= 12, { asked, under, ta, tb, kept, leaves: q.leaves });

  // ---- ↻ New game mid-deck asks "Start a new game?" (paused underneath):
  // Esc keeps the game, Enter deals; on a fresh deal it deals at once
  const st = () => q.evaluate(() => {
    const d = document.querySelector(".gs-dialog");
    return { dlg: d && d.querySelector("h2").textContent, ok: d && [...d.querySelectorAll("button")].pop().textContent, deck: document.getElementById("statDeck").textContent,
      hint: document.querySelectorAll("#board .card.hint").length, faces: [...document.querySelectorAll("#board .card .sym")].filter((s) => getComputedStyle(s).visibility !== "hidden").length };
  });
  await q.click("#newBtn"); await q.waitForTimeout(150);
  const n0 = await st();
  await q.keyboard.press("Escape"); await q.waitForTimeout(150);
  const n1 = await st();
  await q.click("#newBtn"); await q.waitForTimeout(150);
  await q.keyboard.press("Enter"); await q.waitForTimeout(150);
  const n2 = Object.assign(await st(), { time: await time(q), paused: (await look(q)).paused });
  await q.click("#newBtn"); await q.waitForTimeout(150);
  const n3 = await st();
  check("hash: mid-deck, New game asks \"Start a new game?\" first (game paused); Esc keeps the game, Enter deals unpaused; a fresh deal deals at once",
    n0.dlg === "Start a new game?" && n0.ok.indexOf("New game") === 0 && n0.faces === 0 && !n1.dlg && n1.hint === 1 && n1.faces > 0 &&
    !n2.dlg && n2.hint === 0 && n2.faces > 0 && !n2.paused && n2.time === "0:00" && !n3.dlg, { n0, n1, n2, n3 });
  check("hash (asking): no page errors", q.errs.length === 0, q.errs);
  await q.close();

  // ---- a cleared deck's best time: the play time without the pause, plus 30s for the hint
  q = await open();
  const run = await q.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const card = (i) => document.querySelector('#board .card[data-idx="' + i + '"]');
    document.getElementById("newBtn").click();         // a fresh deal: the clock starts
    const t0 = performance.now();
    await wait(400);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
    await wait(3000);                                  // paused: not counted
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
    document.getElementById("hintBtn").click();        // +30s
    __h.emptyDeck();
    let t1 = 0;
    for (let n = 0; n < 8 && document.getElementById("overlay").hidden; n++) {
      const s = __h.findSet(__h.board);
      if (!s) break;
      s.forEach((i) => card(i).click());
      t1 = performance.now();
      await wait(800);
    }
    return { best: +localStorage.getItem("set_best_time"), play: Math.round(t1 - t0 - 3000), body: document.getElementById("ovBody").textContent };
  });
  check("hash: a cleared deck's best time is the play time without the pause, plus 30s for the hint",
    Math.abs(run.best - (run.play + 30000)) < 900 && /30s for 1 hint/.test(run.body), run);
  check("hash (best): no page errors", q.errs.length === 0, q.errs);
  await ctx.close();
};
