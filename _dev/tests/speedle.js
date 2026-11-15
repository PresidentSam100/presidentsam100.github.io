// Speedle's Hard mode: once a clue is revealed for a word, later guesses must
// keep its green letters in place and use its yellow letters; Hard mode is a
// remembered setting with its own records. Off, any word-list guess goes.
const HOOK = ["  // ----- boot ---", `  window.__speedle = { setAnswer: function (w) { answer = w; }, row: function () { return rowIdx; }, end: function () { endGame(); } };
  // ----- boot ---`];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await ctx.newPage();
  p.errs = []; p.leaves = 0; p.on("pageerror", (e) => p.errs.push(e.message));
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

  // keyboard: on the menu 1 / 2 pick a mode (the picked one wears Enter, which
  // starts it: a number alone doesn't) and H toggles Hard; on the end card
  // Enter plays again and Backspace returns to the modes (Esc leaves for the
  // games page): each shown as a keycap
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
  const caps = await p.evaluate(() => ["#m-sprint", "#m-race"].map((s) => document.querySelector(s + " .t").getAttribute("data-gs-key")).concat((document.querySelector("#m-hard kbd.gs-kbd") || {}).textContent));
  const k0 = (await hardBtn()).pressed; await p.keyboard.press("h"); const k1 = (await hardBtn()).pressed; await p.keyboard.press("h"); const k2 = (await hardBtn()).pressed;
  await p.keyboard.press("2"); await p.waitForTimeout(200);
  const picked = await p.evaluate(() => ({ menu: document.getElementById("overlay").classList.contains("show") && !!document.getElementById("m-race"), race: document.getElementById("m-race").hasAttribute("data-gs-pick") }));
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const race = await p.evaluate(() => ({ overlay: document.getElementById("overlay").classList.contains("show"), label: document.getElementById("label-a").textContent }));
  await p.evaluate(() => __speedle.end()); await p.waitForTimeout(150);
  const endCaps = await p.evaluate(() => ["#btn-again", "#btn-menu"].map((s) => (document.querySelector(s + " kbd.gs-kbd") || {}).textContent));
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  const escLeaves = p.leaves === 1 && !(await p.evaluate(() => !!document.getElementById("m-sprint")));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  const backToMenu = await p.evaluate(() => !!document.getElementById("m-sprint"));
  const last = await p.evaluate(() => document.getElementById("m-race").hasAttribute("data-gs-pick"));     // (the mode just played is the one picked)
  await p.keyboard.press("1"); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const sprint = await p.evaluate(() => document.getElementById("label-a").textContent);
  await p.evaluate(() => __speedle.end()); await p.waitForTimeout(150);
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const again = await p.evaluate(() => !document.getElementById("overlay").classList.contains("show") && document.getElementById("label-a").textContent);
  check("speedle keys: the menu shows Space or Enter (on Sprint, picked) / 2 / H keycaps, H toggles Hard; 2 picks Race without starting and Enter starts it; back on the menu Race is picked, and 1 then Enter starts Sprint",
    caps.join() === "Space or Enter,2,H" && k1 !== k0 && k2 === k0 && picked.menu && picked.race && !race.overlay && race.label === "Time" && last && /Time left/.test(sprint), { caps, k0, k1, k2, picked, race, last, sprint });
  check("speedle keys: the end card shows Enter / ⌫ keycaps; Esc leaves, Backspace goes back to the modes, Enter plays again",
    endCaps.join() === "Enter,⌫" && escLeaves && backToMenu && /Time left/.test(again), { endCaps, escLeaves, backToMenu, again });

  // Hard mode rebuilds the menu card. The keycap under Sprint and Race is a
  // line of its own, and it used to come back a frame or two after the rest,
  // so the card went a line shorter and back at every switch. Read as the
  // switching script ends, before any frame can be drawn: the keycaps are
  // there and the card is the size it was, by the button and by the H key,
  // on and off. The same for the menu coming back from the end card.
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
  const jump = await p.evaluate(async () => {
    const card = document.getElementById("card"), out = [];
    const look = () => ({ h: Math.round(card.getBoundingClientRect().height), caps: [...card.querySelectorAll(".mode-btn .t")].map((t) => t.getAttribute("data-gs-key")).join() });
    const was = look();
    for (const how of ["click", "click", "key", "key"]) {
      if (how === "click") document.getElementById("m-hard").click();
      else document.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true }));
      await Promise.resolve();   // the script has ended; nothing has been drawn since
      out.push(Object.assign({ how, hard: document.getElementById("m-hard").getAttribute("aria-pressed") }, look()));
    }
    return { was, out };
  });
  check("speedle: switching Hard mode leaves the menu card its size, keycaps and all, with no frame in between",
    jump.was.caps === "Space or Enter,2" && jump.out.map((o) => o.hard).join() === "true,false,true,false" &&
    jump.out.every((o) => o.h === jump.was.h && o.caps === jump.was.caps), jump);
  await p.click("#m-sprint"); await p.waitForTimeout(200);
  await p.evaluate(() => __speedle.end()); await p.waitForTimeout(150);
  const back = await p.evaluate(async () => {
    document.getElementById("btn-menu").click();
    await Promise.resolve();
    return [...document.querySelectorAll("#card .mode-btn .t")].map((t) => t.getAttribute("data-gs-key")).join();
  });
  check("speedle: Change mode brings the menu back with its keycaps on, with no frame in between", back === "Space or Enter,2", back);

  // a click on an on-screen key doesn't leave it focused, so a later Space
  // (not a game key) can't press it again
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
  await p.click("#m-sprint"); await p.waitForTimeout(200);
  await p.click('#kb .key:not(.wide) >> text="a"');
  await p.keyboard.press("Space"); await p.waitForTimeout(80);
  const row0 = await p.evaluate(() => [...document.querySelectorAll("#board .row")[0].children].map((t) => t.textContent).join(""));
  check("speedle: a clicked on-screen key keeps no focus, so Space doesn't type it again", row0 === "a", row0);

  check("speedle: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();

  // ---- the maker's brand, SAM LU, burned into the walnut along the board's
  // foot: on the board, under its last row of slots, inside the screen's
  // width, clear of every slot, the clock's plaques, the message line, the
  // title and the keys, in Sprint and in Race; the strip it sits in is taken
  // back from the gaps above the board and under the message line, so the
  // page is no taller than with the board's old foot and spacing; no "made by"
  const { devices } = require("@playwright/test");
  const mob = (w, h) => ({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true });
  for (const [label, opts] of [["1280x900", {}], ["1366x657", { viewport: { width: 1366, height: 657 } }], ["1280x600", { viewport: { width: 1280, height: 600 } }],
    ["Pixel 7", devices["Pixel 7"]], ["phone 390x844", mob(390, 844)], ["phone 360x640", mob(360, 640)], ["phone 320x568", mob(320, 568)],
    ["phone 375x553", mob(375, 553)], ["phone 360x560", mob(360, 560)], ["Pixel 7 sideways", devices["Pixel 7 landscape"]]]) {
    const c = await lib.newContext(browser, opts);
    const seen = [], errs = [];
    for (const mode of ["#m-sprint", "#m-race"]) {
      const q = await lib.open(c, base, "games/speedle/");
      await q.click(mode); await q.waitForTimeout(250);
      seen.push(await q.evaluate((mode) => {
        const brand = document.querySelector("#board .brand"), board = document.getElementById("board");
        if (!brand) return { mode, missing: true };
        // the letters' own box (the burned patch round them fades to nothing)
        const span = brand.querySelector("span") || brand, range = document.createRange();
        range.selectNodeContents(span);
        const t = range.getBoundingClientRect(), b = board.getBoundingClientRect();
        const rows = board.querySelectorAll(".row"), last = rows[rows.length - 1].getBoundingClientRect();
        const meet = (r) => r.width && r.height && r.left < t.right && r.right > t.left && r.top < t.bottom && r.bottom > t.top;
        const hits = [...document.querySelectorAll("#board .tile, .stat, #msg, h1.title span, header.top p, #kb .key")]
          .filter((e) => meet(e.getBoundingClientRect())).map((e) => e.id || e.className);
        const over = () => document.documentElement.scrollHeight - innerHeight;
        const now = over();
        // the board's old foot and spacing, as they were before the brand:
        // the same padding all round, and the gaps the strip was taken from
        const short = matchMedia("(max-height: 720px)").matches, cs = getComputedStyle(board);
        const was = short ? { hud: "0.45rem", board: "0.5rem", msg: "0.3rem 0px 0.4rem" } : { hud: "0.9rem", board: "0.9rem", msg: "0.6rem 0px 0.7rem" };
        const hud = document.querySelector(".hud"), msg = document.getElementById("msg");
        const keep = [board.style.paddingBottom, board.style.marginTop, hud.style.marginTop, msg.style.margin];
        board.style.paddingBottom = cs.paddingTop; board.style.marginTop = was.board; hud.style.marginTop = was.hud; msg.style.margin = was.msg;
        const before = over();
        [board.style.paddingBottom, board.style.marginTop, hud.style.marginTop, msg.style.margin] = keep;
        return { mode, text: span.textContent.trim(), size: parseFloat(getComputedStyle(span).fontSize),
          onBoard: t.left >= b.left && t.right <= b.right && t.top >= last.bottom && t.bottom <= b.bottom,
          inScreen: t.left >= 0 && t.right <= innerWidth && t.bottom <= document.documentElement.scrollHeight,
          hits, over: now, overBefore: before, madeBy: /made by/i.test(document.body.innerText) };
      }, mode));
      errs.push(...q.errs);
      await q.close();
    }
    const bad = seen.filter((r) => r.missing || r.text !== "SAM LU" || r.size < 11 || !r.onBoard || !r.inScreen || r.hits.length || r.over > r.overBefore || r.madeBy);
    check("speedle, " + label + ": SAM LU is burned into the walnut along the board's foot, under the slots and clear of them, the clock, the message line and the keys, adding no scroll, in Sprint and Race",
      bad.length === 0, bad.length ? bad : seen.map((r) => r.mode + " " + r.size + "px, over " + r.over + " (was " + r.overBefore + ")"));
    check("speedle (brand), " + label + ": no page errors", errs.length === 0, errs);
    await c.close();
  }
};
