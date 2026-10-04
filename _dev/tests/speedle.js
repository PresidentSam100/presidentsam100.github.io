// Speedle's Hard mode: once a clue is revealed for a word, later guesses must
// keep its green letters in place and use its yellow letters; Hard mode is a
// remembered setting with its own records. Off, any word-list guess goes.
const HOOK = ["  // ----- boot ---", `  window.__speedle = { setAnswer: function (w) { answer = w; }, row: function () { return rowIdx; }, end: function () { endGame(); } };
  // ----- boot ---`];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await ctx.newPage();
  p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await lib.injectScript(p, "games/speedle/game.js", [HOOK]);
  await p.goto(base + "games/speedle/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(400);

  const hardBtn = () => p.evaluate(() => { const b = document.getElementById("m-hard"); return b && { pressed: b.getAttribute("aria-pressed"), text: b.textContent }; });
  const h0 = await hardBtn();
  await p.click("#m-hard");
  const h1 = await hardBtn();
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
  const h2 = await hardBtn();
  check("speedle: the Hard mode toggle switches on and is remembered", h0.pressed === "false" && h1.pressed === "true" && /on/.test(h1.text) && h2.pressed === "true", { h0, h1, h2 });

  // guess and report what happened: the message, and whether the row advanced
  const guess = async (w) => {
    const before = await p.evaluate(() => __speedle.row());
    await p.keyboard.type(w); await p.keyboard.press("Enter"); await p.waitForTimeout(80);
    const out = await p.evaluate(() => ({ msg: document.getElementById("msg").textContent, row: __speedle.row() }));
    if (out.row === before) for (let i = 0; i < 5; i++) await p.keyboard.press("Backspace");   // clear a rejected guess
    return { accepted: out.row !== before, msg: out.msg };
  };

  await p.click("#m-sprint"); await p.waitForTimeout(300);
  check("speedle hard: the scoreboard says hard", /hard/.test(await p.evaluate(() => document.getElementById("label-best").textContent)));

  // greens must stay put
  await p.evaluate(() => __speedle.setAnswer("brave"));
  const g1 = await guess("brain");             // b r a green
  const g2 = await guess("crane");             // drops the green B
  const g3 = await guess("brace");             // keeps every green
  check("speedle hard: a guess that drops a green letter is refused, one that keeps them goes through",
    g1.accepted && !g2.accepted && /1st letter must be B/.test(g2.msg) && g3.accepted, { g1, g2, g3 });

  // yellows must be used
  await p.keyboard.type("brave"); await p.keyboard.press("Enter");   // solve "brave" so a fresh word loads
  await p.waitForTimeout(700);
  await p.evaluate(() => __speedle.setAnswer("cable"));
  const y1 = await guess("blast");             // b, l, a all yellow
  const y2 = await guess("aback");             // no L
  const y3 = await guess("label");             // uses a, b, l
  check("speedle hard: a guess missing a yellow letter is refused, one using them goes through",
    y1.accepted && !y2.accepted && /must contain L/.test(y2.msg) && y3.accepted, { y1, y2, y3 });

  // off: the same guesses are fine
  await p.evaluate(() => { document.getElementById("overlay").classList.add("show"); });
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
  await p.click("#m-hard");
  const off = await hardBtn();
  await p.click("#m-sprint"); await p.waitForTimeout(300);
  await p.evaluate(() => __speedle.setAnswer("brave"));
  const n1 = await guess("brain"), n2 = await guess("crane");
  const label = await p.evaluate(() => document.getElementById("label-best").textContent);
  check("speedle normal: any word-list guess goes, the scoreboard doesn't say hard", off.pressed === "false" && n1.accepted && n2.accepted && !/hard/.test(label), { off, n1, n2, label });

  // keyboard: on the menu 1 / 2 pick a mode and H toggles Hard; on the end card
  // Enter plays again and Esc returns to the modes — each shown as a keycap
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
  const caps = await p.evaluate(() => ["#m-sprint", "#m-race", "#m-hard"].map((s) => (document.querySelector(s + " kbd.gs-kbd") || {}).textContent));
  const k0 = (await hardBtn()).pressed; await p.keyboard.press("h"); const k1 = (await hardBtn()).pressed; await p.keyboard.press("h"); const k2 = (await hardBtn()).pressed;
  await p.keyboard.press("2"); await p.waitForTimeout(200);
  const race = await p.evaluate(() => ({ overlay: document.getElementById("overlay").classList.contains("show"), label: document.getElementById("label-a").textContent }));
  await p.evaluate(() => __speedle.end()); await p.waitForTimeout(150);
  const endCaps = await p.evaluate(() => ["#btn-again", "#btn-menu"].map((s) => (document.querySelector(s + " kbd.gs-kbd") || {}).textContent));
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const backToMenu = await p.evaluate(() => !!document.getElementById("m-sprint"));
  await p.keyboard.press("1"); await p.waitForTimeout(200);
  const sprint = await p.evaluate(() => document.getElementById("label-a").textContent);
  await p.evaluate(() => __speedle.end()); await p.waitForTimeout(150);
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const again = await p.evaluate(() => !document.getElementById("overlay").classList.contains("show") && document.getElementById("label-a").textContent);
  check("speedle keys: menu shows 1 / 2 / H keycaps, H toggles Hard, 2 starts Race, 1 starts Sprint",
    caps.join() === "1,2,H" && k1 !== k0 && k2 === k0 && !race.overlay && race.label === "Time" && /Time left/.test(sprint), { caps, k0, k1, k2, race, sprint });
  check("speedle keys: the end card shows Enter / Esc keycaps; Esc goes back to the modes, Enter plays again",
    endCaps.join() === "Enter,Esc" && backToMenu && /Time left/.test(again), { endCaps, backToMenu, again });

  check("speedle: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();
};
