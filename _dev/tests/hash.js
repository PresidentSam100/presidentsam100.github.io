// Hash: a hint stays lit through the re-renders that picking cards causes,
// so the next hint shows a second card instead of charging again for the
// first; Enter or Space on a card keeps keyboard focus on that card.
const HOOK = ["  renderBest();\n  newGame();\n})();", "  renderBest();\n  newGame();\n  window.__h = { get board() { return board; }, findSet: findSet };\n})();"];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/hash/", { before: (pg) => lib.injectScript(pg, "games/hash/game.js", [HOOK]) });
  const lit = () => p.evaluate(() => [...document.querySelectorAll("#board .card.hint")].map((c) => +c.dataset.idx));

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
  await p.click("#newBtn");
  await p.focus('.card[data-idx="4"]');
  await p.keyboard.press("Enter");
  const k1 = await p.evaluate(() => { const a = document.activeElement; return { idx: a.dataset ? a.dataset.idx : null, selected: a.classList.contains("selected") }; });
  await p.keyboard.press(" ");
  const k2 = await p.evaluate(() => { const a = document.activeElement; return { idx: a.dataset ? a.dataset.idx : null, selected: a.classList.contains("selected") }; });
  check("hash: Enter or Space on a card keeps keyboard focus on that card", k1.idx === "4" && k1.selected && k2.idx === "4" && !k2.selected, { k1, k2 });

  // and through a claim: focus on the last card of a found Hash stays in its slot
  await p.click("#newBtn");
  const set = await p.evaluate(() => __h.findSet(__h.board));
  for (const i of set) { await p.focus('.card[data-idx="' + i + '"]'); await p.keyboard.press("Enter"); }
  await p.waitForFunction(() => document.querySelector("#board .card.enter-left"), null, { timeout: 5000 });   // the refill is in
  const k3 = await p.evaluate(() => { const a = document.activeElement; return a.closest("#board") ? a.dataset.idx : a.tagName; });
  check("hash: after a Hash claimed by keyboard, focus stays in that card's slot", k3 === String(set[2]), { k3, set });
  check("hash: no page errors", p.errs.length === 0, p.errs);
  await ctx.close();
};
