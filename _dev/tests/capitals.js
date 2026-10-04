// Capitals: the shared list covers every country, and Departures can name
// capitals instead of countries (each city boards its country; bests kept
// apart). Passport's capital questions are checked below too.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);

  // ---- the data: every country has a capital, no name means two countries
  {
    const p = await lib.open(ctx, base, "games/departures/");
    const d = await p.evaluate(() => {
      const C = FlagData, K = CapitalJudge;
      const missing = C.filter((c) => !K.CAP[c[0]]).map((c) => c[0]);
      const seen = {}, shared = [];
      K.names.forEach((x) => { if (seen[x.n] !== undefined && seen[x.n] !== x.ci) shared.push(x.n); seen[x.n] = x.ci; });
      const r = (t) => { const i = K.resolve(t); return i < 0 ? "-" : C[i][0]; };
      return { n: C.length, missing, shared, kiev: r("Kiev"), kingston: r("Kingston"), kingstown: r("Kingstown"), canbera: r("Canbera"), dc: r("Washington, D.C.") };
    });
    check("capitals: all 197 countries have one, no name is shared, typos and alternates resolve",
      d.n === 197 && !d.missing.length && !d.shared.length && d.kiev === "ua" && d.kingston === "jm" && d.kingstown === "vc" && d.canbera === "au" && d.dc === "us", d);
    await p.close();
  }

  // ---- Departures: Capitals on the menu (C / N), a city boards its country
  {
    const p = await lib.open(ctx, base, "games/departures/");
    await p.keyboard.press("c");
    const menu = await p.evaluate(() => ({ t: Departures.target(), on: (document.querySelector("#pick-target .on") || {}).textContent, ph: document.getElementById("answer").placeholder }));
    check("departures: C picks Capitals on the menu", menu.t === "capitals" && /Capitals/.test(menu.on) && /capital/.test(menu.ph), menu);
    const regionsShown = await p.evaluate(() => { Departures.toMenu(); const r = document.getElementById("pick-region"); return r.getClientRects().length > 0; });
    await p.evaluate(() => Departures.start("world"));
    await p.waitForTimeout(300);
    const clock = await p.evaluate(() => document.getElementById("clock").textContent);
    check("departures capitals: the clock runs (15:00 for the world), and the continent row hides for The World", /^1[45]:\d\d$/.test(clock) && !regionsShown, { clock, regionsShown });
    await p.evaluate(() => Departures.type("paris"));
    const row = await p.evaluate(() => { const li = document.querySelector("#log li"); return { found: Departures.found(), dest: li.querySelector(".dest").textContent, cty: (li.querySelector(".cty") || {}).textContent }; });
    await p.waitForTimeout(900);
    const dest = await p.evaluate(() => document.querySelector("#log li .dest").textContent);
    check("departures capitals: typing Paris boards France, the row shows PARIS and FRANCE", row.found === 1 && dest === "PARIS" && row.cty === "FRANCE", { row, dest });
    await p.evaluate(() => Departures.enter("Germany"));
    const nudge = await p.evaluate(() => ({ found: Departures.found(), toast: document.getElementById("toast").textContent }));
    check("departures capitals: a country's name gets a 'name its capital' nudge", nudge.found === 1 && /NAME ITS CAPITAL/.test(nudge.toast), nudge);
    // (no capital is the start of another's, so each boards as soon as it's typed)
    await p.evaluate(() => Departures.type("Kingston"));
    await p.evaluate(() => Departures.type("Kingstown"));
    const kk = await p.evaluate(() => ({ found: Departures.found(), ctys: [...document.querySelectorAll("#log li .cty")].slice(0, 2).map((e) => e.textContent) }));
    check("departures capitals: Kingston boards Jamaica and Kingstown St Vincent, each as typed", kk.found === 3 && kk.ctys[0] === "SAINT VINCENT AND THE GRENADINES" && kk.ctys[1] === "JAMAICA", kk);
    // typed key by key, a full name with a shorter same-city alternate boards once, box empty
    await p.focus("#answer");
    for (const t of ["mexico city", "washington dc", "kuwait"]) await p.keyboard.type(t, { delay: 15 });
    const typed = await p.evaluate(() => ({ found: Departures.found(), box: document.getElementById("answer").value, hint: !document.getElementById("hint").hidden }));
    await p.keyboard.press("Enter");
    const kw = await p.evaluate(() => ({ found: Departures.found(), box: document.getElementById("answer").value }));
    check("departures capitals: 'Mexico City' / 'Washington DC' typed key by key board cleanly; a bare 'Kuwait' waits for Enter",
      typed.found === 5 && typed.box === "kuwait" && typed.hint && kw.found === 6 && kw.box === "", { typed, kw });
    await p.evaluate(() => Departures.giveUp());
    const man = await p.evaluate(() => ({ html: document.getElementById("missed").innerHTML, stats: document.getElementById("over-stats").textContent, bests: Departures.bests() }));
    check("departures capitals: the manifest lists cities with their countries; the best is kept apart",
      /Berlin <i>\(Germany\)<\/i>/.test(man.html) && /capitals/.test(man.stats) && man.bests["world-cap"] && man.bests["world-cap"].n === 6 && !man.bests.world, { stats: man.stats, bests: man.bests });
    await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
    await p.keyboard.press("n");
    const back = await p.evaluate(() => ({ t: Departures.target(), ph: document.getElementById("answer").placeholder }));
    check("departures: N goes back to naming countries", back.t === "countries" && /country/.test(back.ph), back);
    check("departures capitals: no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }

  // ---- Passport: each capital question type, with Tags and with Typed
  for (const ask of ["capital", "capflag", "both"]) {
    for (const style of ["t", "y"]) {
      const p = await lib.open(ctx, base, "games/passport/");
      const key = { capital: "a", capflag: "f", both: "b" }[ask];
      await p.keyboard.press(style); await p.keyboard.press(key);
      const picked = await p.evaluate(() => Passport.ask());
      await p.evaluate(() => Passport.fast()); await p.keyboard.press("Enter");
      const seen = [];
      for (let i = 0; i < 8 && seen.length < 3; i++) {
        await p.waitForFunction(() => Passport.state() === "ask", null, { timeout: 4000 });
        const c = await p.evaluate(() => { const c = Passport.current(); return { ci: c.ci, step: c.step, correct: c.correct, answer: c.answer, name: c.name, capital: c.capital, cap: document.getElementById("post-cap").textContent }; });
        if (style === "t") await p.keyboard.press(String(c.correct + 1));
        else await p.evaluate((a) => Passport.type(a), c.answer);
        if (c.step === "capital") seen.push(c);
        await p.waitForTimeout(120);
      }
      const r = await p.evaluate(() => ({ score: Passport.score(), state: Passport.state(), mini: [...document.querySelectorAll("#stamps .mini")].map((m) => m.textContent) }));
      const label = ask + (style === "t" ? " / tags" : " / typed");
      const captionOk = seen.every((c) => ask === "capflag" ? !c.cap.includes(c.name) && /capital/.test(c.cap) : c.cap.includes(c.name));
      check("passport " + label + ": three capitals answered right give three stamps, each naming its city",
        picked === ask && seen.length >= 3 && r.score >= 3 && r.mini.slice(0, 3).every((m, i) => true) && seen.every((c) => r.mini.some((m) => m.toUpperCase().includes(c.capital.toUpperCase()))),
        { picked, seen: seen.map((c) => c.capital), r });
      check("passport " + label + ": the question " + (ask === "capflag" ? "keeps the country secret" : "names the country"), captionOk, seen.map((c) => c.cap));
      check("passport " + label + ": no page errors", p.errs.length === 0, p.errs);
      await p.close();
    }
  }

  // a wrong capital is a denial that names the right one
  {
    const p = await lib.open(ctx, base, "games/passport/");
    await p.keyboard.press("t"); await p.keyboard.press("a"); await p.keyboard.press("Enter");
    await p.waitForFunction(() => Passport.state() === "ask");
    const c = await p.evaluate(() => Passport.current());
    await p.keyboard.press(String(((c.correct + 1) % 4) + 1));
    await p.waitForTimeout(150);
    const big = await p.evaluate(() => document.getElementById("big-stamp").textContent);
    check("passport capital: a wrong capital is DENIED, naming the right city", /DENIED/.test(big) && big.toUpperCase().includes(c.capital.toUpperCase()), { big, capital: c.capital });
    await p.close();
  }

  await ctx.close();
};
