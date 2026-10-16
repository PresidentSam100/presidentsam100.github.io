// The games page: Enter is 🎲 random game and Esc is 🗑️ reset all high scores,
// each key shown on its button (not on a touch-only device). Enter on a game's
// card, reached by Tab, still opens that game. In the reset box only Enter
// resets: Esc, a letter or an arrow cancels (the button says "any other key"),
// and a cancelled box clears nothing.
//
// The cards: one description each, wrapping to exactly two lines on a
// laptop's card and to no more than four on a phone's (two cards to a row),
// every card the same size and nothing cut off. The suites see the page in
// the fallback face (lib.js blocks Google Fonts); the wording was written to
// wrap the same way in Inter, which players get.
//
// The search box: / (or any letter typed on the page) goes to it, and as
// characters go in and out only the games whose name or description holds
// every word typed stay, best match first. Enter opens the top one, Esc
// clears the box (and doesn't ask to reset the scores), and 🎲 picks from
// what is showing: with the box empty, every game in the games folder, each
// as likely as any other.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser);
  const seed = (pg) => pg.addInitScript(() => { try { localStorage.setItem("rushhour_best_day", "777"); localStorage.setItem("sudoku_prefs", "{\"level\":\"hard\"}");
    // Hash: a best in two of its other ways to play, today's Daily, and its picked mode (a setting)
    localStorage.setItem("set_best_time_chain", "90000"); localStorage.setItem("set_best_time_junior", "60000");
    localStorage.setItem("hash_daily", "{}"); localStorage.setItem("hash_prefs", "{\"mode\":\"chain\"}");
    // Tall Order: a best in the dark in each mode, and Dark left on (a setting)
    localStorage.setItem("tallorder_best_bakery_dark", "9"); localStorage.setItem("tallorder_best_rush_dark", "4"); localStorage.setItem("tallorder_dark", "1"); } catch (e) {} });
  const open = (c) => lib.open(c, base, "games/", { waitCorner: false, before: seed });
  const gamePath = (p) => p.evaluate(() => (/\/games\/([^/]+)\//.exec(location.pathname) || [])[1] || null);
  const box = (p) => p.evaluate(() => { const d = document.getElementById("reset-dialog"); return { open: d.open, focus: document.activeElement && document.activeElement.className }; });
  const best = (p) => p.evaluate(() => ({ best: localStorage.getItem("rushhour_best_day"), prefs: localStorage.getItem("sudoku_prefs"),
    hash: ["set_best_time_chain", "set_best_time_junior", "hash_daily"].map((k) => localStorage.getItem(k)).filter((v) => v !== null).length, hashPrefs: localStorage.getItem("hash_prefs"),
    dark: ["tallorder_best_bakery_dark", "tallorder_best_rush_dark"].map((k) => localStorage.getItem(k)).filter((v) => v !== null).length, darkOn: localStorage.getItem("tallorder_dark") }));

  // ---- the keys are on the buttons
  let p = await open(ctx);
  const caps = await p.evaluate(() => {
    const cap = (id) => { const k = document.querySelector("#" + id + " kbd"); return k && getComputedStyle(k).display !== "none" ? k.textContent : null; };
    return { random: cap("random-game"), reset: cap("reset-scores") };
  });
  check("games page: 🎲 random game shows Enter and 🗑️ reset all high scores shows Esc", caps.random === "Enter" && caps.reset === "Esc", caps);

  // ---- Esc opens the reset box; a letter, an arrow and Esc all cancel it; nothing is cleared
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const opened = await box(p);
  const words = await p.evaluate(() => ({ cancel: document.querySelector("#reset-dialog .dialog-cancel").textContent.replace(/\s+/g, " ").trim(), ok: document.querySelector("#reset-dialog .dialog-ok").textContent.replace(/\s+/g, " ").trim() }));
  await p.keyboard.press("Shift"); await p.keyboard.press("Tab"); await p.waitForTimeout(100);
  const still = await box(p);                                   // (Shift and Tab answer nothing)
  await p.keyboard.press("k"); await p.waitForTimeout(150);
  const afterLetter = await box(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(150);
  const afterArrow = await box(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const afterEsc = await box(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("Space"); await p.waitForTimeout(150);  // (Cancel has the focus)
  const afterSpace = await box(p);
  const keptAll = await best(p);
  check("games page: Esc opens \"Reset all saved high scores?\" with Cancel focused; the box says any other key cancels and Enter resets",
    opened.open && /dialog-cancel/.test(opened.focus || "") && /^Cancel any other key$/.test(words.cancel) && /^Reset scores Enter$/.test(words.ok), { opened, words });
  check("games page: in the reset box a letter, an arrow, Esc and Space each cancel (Shift and Tab answer nothing), and nothing is cleared",
    still.open && !afterLetter.open && !afterArrow.open && !afterEsc.open && !afterSpace.open && keptAll.best === "777", { still, afterLetter, afterArrow, afterEsc, afterSpace, keptAll });
  // (the letter that cancels the box is the box's: it doesn't also go to the search box)
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("k"); await p.waitForTimeout(150);
  const kSearch = await p.evaluate(() => ({ inBox: document.activeElement && document.activeElement.id === "game-search", value: document.getElementById("game-search").value }));
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const reopened = await box(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  check("games page: a letter that cancels the reset box doesn't also start a search, and Esc then opens the box again",
    !kSearch.inBox && kSearch.value === "" && reopened.open, { kSearch, reopened });

  // ---- ...and Enter resets: the scores go, a game's settings stay
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("Enter"); await p.waitForTimeout(250);
  const cleared = await best(p), closed = await box(p);
  check("games page: Enter in the reset box clears the high scores (and leaves a game's settings alone)",
    !closed.open && cleared.best === null && /hard/.test(cleared.prefs || ""), { closed, cleared });
  check("games page: the reset clears Hash's bests in every way to play and its Daily, and keeps the mode it was left on",
    cleared.hash === 0 && /chain/.test(cleared.hashPrefs || ""), cleared);
  check("games page: the reset clears Tall Order's bests in the dark, and leaves Dark on as it was",
    cleared.dark === 0 && cleared.darkOn === "1", cleared);
  check("games page: Enter in the box hasn't also set off the random game", (await gamePath(p)) === null, await gamePath(p));

  // ---- Enter is the random game, from anywhere but a link or a button
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => /\/games\/[^/]+\//.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
  const went = await gamePath(p);
  check("games page: Enter opens a random game", !!went, went);
  check("games page: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Enter on a game's card (reached by Tab) opens that game, not a random one
  p = await open(ctx);
  const card = await p.evaluate(() => { const a = document.querySelectorAll(".games-grid .game-card")[7]; a.focus(); return a.getAttribute("href").replace(/^\.\//, "").replace(/\/$/, ""); });
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => /\/games\/[^/]+\//.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
  const opened2 = await gamePath(p);
  check("games page: Enter on a focused game card opens that game", opened2 === card, { card, opened2 });
  await p.close();
  await ctx.close();

  // ---- a touch-only phone: no keycaps on the buttons or in the box
  const phone = await lib.newContext(browser, devices["Pixel 7"]);
  p = await open(phone);
  await p.tap("#reset-scores"); await p.waitForTimeout(150);
  const touch = await p.evaluate(() => [...document.querySelectorAll(".reset-row kbd, #reset-dialog kbd, #reset-dialog .anykey")].filter((e) => getComputedStyle(e).display !== "none").length);
  check("games page, a touch-only phone: no keycaps on the two buttons or in the reset box", touch === 0, touch);
  const touchSearch = await p.evaluate(() => getComputedStyle(document.querySelector(".search-row kbd")).display);
  check("games page, a touch-only phone: no / keycap in the search box", touchSearch === "none", touchSearch);
  check("games page (phone): no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await phone.close();

  // ---- the cards, on two laptops and three phones
  const cardsAt = async (c) => {
    const pg = await open(c);
    const r = await pg.evaluate(() => {
      const cs = [...document.querySelectorAll(".games-grid .game-card")];
      const px = (el, k) => parseFloat(getComputedStyle(el)[k]);
      const box = (a) => a.getBoundingClientRect();
      return {
        n: cs.length,
        cols: new Set(cs.map((a) => Math.round(box(a).left))).size,
        sizes: [...new Set(cs.map((a) => Math.round(box(a).width) + "x" + Math.round(box(a).height)))],
        lines: cs.map((a) => { const d = a.querySelector(".desc"); return [a.getAttribute("href"), Math.round(box(d).height / px(d, "lineHeight"))]; }),
        cut: cs.filter((a) => { const d = a.querySelector(".desc"); return d.scrollHeight > d.clientHeight + 1 || getComputedStyle(d).webkitLineClamp !== "none"; }).map((a) => a.getAttribute("href")),
        spill: cs.filter((a) => {
          const edge = box(a).right - px(a, "borderRightWidth") - px(a, "paddingRight") + 0.5;
          return [...a.children].some((k) => box(k).right > edge);
        }).map((a) => a.getAttribute("href")),
        wide: Math.max(document.documentElement.scrollWidth, innerWidth),
        texts: new Set(cs.map((a) => a.querySelector(".desc").textContent.trim())).size,
      };
    });
    await pg.close();
    return r;
  };
  const phoneAt = (width, height) => ({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 });
  const sizes = [
    ["laptop 1280 x 800", { viewport: { width: 1280, height: 800 } }, 4, 2, 2],
    ["laptop 1366 x 657", { viewport: { width: 1366, height: 657 } }, 4, 2, 2],
    ["phone 320 x 568", phoneAt(320, 568), 2, 1, 4],
    ["phone 360 x 640", phoneAt(360, 640), 2, 1, 4],
    ["phone 390 x 664", phoneAt(390, 664), 2, 1, 4],
  ];
  for (const [label, opts, cols, lo, hi] of sizes) {
    const c = await lib.newContext(browser, opts);
    const r = await cardsAt(c);
    await c.close();
    const off = r.lines.filter(([, n]) => n < lo || n > hi);
    check("games page, " + label + ": " + cols + " cards to a row, all one size, every description " + (lo === hi ? "exactly " + lo + " lines" : "at most " + hi + " lines") +
      ", none cut off, and nothing past a card's edge or the screen's",
      r.n >= 48 && r.cols === cols && r.sizes.length === 1 && !off.length && !r.cut.length && !r.spill.length && r.wide <= opts.viewport.width,
      { n: r.n, cols: r.cols, sizes: r.sizes, off, cut: r.cut, spill: r.spill, wide: r.wide });
    if (label === "laptop 1280 x 800") check("games page: every game has a description of its own", r.texts === r.n, r.texts + " of " + r.n);
  }

  // ---- the search box
  const s = await lib.newContext(browser);
  p = await open(s);
  const state = () => p.evaluate(() => {
    const shown = [...document.querySelectorAll(".games-grid .game-card")].filter((a) => !a.hidden && a.getBoundingClientRect().height > 0);
    const nm = document.getElementById("no-match");
    return {
      shown: shown.map((a) => a.querySelector(".name").firstChild.textContent.trim()),
      all: document.querySelectorAll(".games-grid .game-card").length,
      none: nm.hidden ? null : nm.textContent,
      value: document.getElementById("game-search").value,
      inBox: !!document.activeElement && document.activeElement.id === "game-search",
      dialog: document.getElementById("reset-dialog").open,
    };
  });
  const pageOrder = (await state()).shown;
  const cap = await p.evaluate(() => { const k = document.querySelector(".search-row kbd"); return k && getComputedStyle(k).display !== "none" ? k.textContent : null; });
  await p.keyboard.press("/"); await p.waitForTimeout(80);
  const slash = await state();
  await p.keyboard.type("mah"); await p.waitForTimeout(80);
  const mah = await state();
  for (let i = 0; i < 3; i++) await p.keyboard.press("Backspace");
  await p.waitForTimeout(80);
  const back = await state();
  await p.keyboard.type("octopus"); await p.waitForTimeout(80);
  const octo = await state();
  await p.keyboard.press("Escape"); await p.waitForTimeout(80);
  const esc1 = await state();
  await p.keyboard.type("Ti");
  const ti = await state();
  await p.keyboard.type("c tac zzq");
  const zzq = await state();
  for (let i = 0; i < 4; i++) await p.keyboard.press("Backspace");
  const tac = await state();
  await p.keyboard.press("Escape"); await p.keyboard.press("Escape"); await p.waitForTimeout(80);
  const esc2 = await state();
  check("games page: the search box shows its key, /, and / goes into it", cap === "/" && slash.inBox && slash.value === "", { cap, slash });
  check("games page: typing \"mah\" leaves Mahjong first and hides the games without it; deleting it brings them all back in their order",
    mah.shown[0] === "Mahjong" && mah.shown.length < 6 && back.shown.length === back.all && back.shown.join() === pageOrder.join(), { mah: mah.shown, back: back.shown.length });
  check("games page: a word from a description finds its game (\"octopus\": JackBlack)", octo.shown.length === 1 && octo.shown[0] === "JackBlack", octo.shown);
  check("games page: Esc in the box clears it, every game back, without asking to reset the scores; a second Esc leaves the box",
    esc1.value === "" && esc1.inBox && esc1.shown.length === esc1.all && !esc1.dialog && !esc2.inBox && !esc2.dialog && esc2.value === "", { esc1, esc2 });
  check("games page: with no pause between keys every word must match: \"tic tac\" is Tic-Tac-Toe alone, a word matching nothing says so, and deleting it brings Tic-Tac-Toe back",
    ti.shown.slice(0, 2).sort().join() === "Tic-Tac-Toe,Tile Maze" && zzq.shown.length === 0 && /no game matches/.test(zzq.none || "") &&
    tac.value === "Tic tac" && tac.shown.length === 1 && tac.shown[0] === "Tic-Tac-Toe" && tac.none === null,
    { ti: ti.shown.slice(0, 3), zzq, tac });
  // a letter typed on the page goes into the box; Enter there opens the top game
  await p.keyboard.type("lanterns");
  const typed = await state();
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => /\/games\/[^/]+\//.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
  const wentTo = await gamePath(p);
  check("games page: a letter typed on the page starts a search, and Enter in the box opens the top game", typed.inBox && typed.value === "lanterns" && wentTo === "lanterns", { typed, wentTo });
  await p.close();
  // 🎲 picks one of the games the search has left
  p = await open(s);
  await p.fill("#game-search", "chess");
  await p.click("#random-game");
  await p.waitForFunction(() => /\/games\/[^/]+\//.test(location.pathname), null, { timeout: 15000 }).catch(() => {});
  const picked = await gamePath(p);
  check("games page: 🎲 random game picks from the games the search shows (\"chess\": Chess)", picked === "chess", picked);
  await p.close();
  // a keystroke's search, with the grid laid out again, takes a few ms (about
  // 4 on a quiet laptop, 18 with the page's CPU slowed 4x): the bound is loose
  // for a busy machine but catches a search that rebuilds or re-reads the cards
  p = await open(s);
  const ms = await p.evaluate(() => {
    const box = document.getElementById("game-search");
    const steps = ["s", "sl", "sli", "slit", "sli", "sl", "s", "", "m", "ma", "mah", "ma", "", "o", "oc"];
    const t0 = performance.now();
    for (let k = 0; k < 300; k++) { box.value = steps[k % steps.length]; box.dispatchEvent(new Event("input")); void document.body.offsetHeight; }
    return (performance.now() - t0) / 300;
  });
  check("games page: a keystroke's search and the grid's new layout take under 25 ms", ms < 25, ms.toFixed(2) + " ms");
  check("games page (search): no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await s.close();

  // ---- 🎲 random game: every game in the games folder has one card, and with
  // the search box empty each card takes an equal share of the dice (the
  // random number is set to the middle of each share in turn, and where each
  // throw would go is caught before the page leaves)
  {
    const fs = require("fs"), path = require("path"), root = path.join(lib.ROOT, "games");
    const folders = fs.readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(root, d.name, "index.html"))).map((d) => d.name + "/").sort();
    const c = await lib.newContext(browser);
    const q = await open(c);
    const dice = await q.evaluate((n) => {
      const went = [];
      navigation.addEventListener("navigate", (e) => { if (e.cancelable) { e.preventDefault(); went.push(new URL(e.destination.url).pathname.replace(/^.*\/games\//, "")); } });
      const real = Math.random;
      for (let k = 0; k < n; k++) { Math.random = () => (k + 0.5) / n; document.getElementById("random-game").click(); }
      Math.random = real;
      return { went, cards: [...document.querySelectorAll(".games-grid .game-card")].map((a) => a.getAttribute("href").replace(/^\.\//, "")) };
    }, folders.length);
    const cards = dice.cards.slice().sort(), went = dice.went.slice().sort();
    check("games page: 🎲 random game draws from every game, one card each, each as likely as the next",
      folders.length >= 40 && cards.join() === folders.join() && went.join() === folders.join(),
      { folders: folders.length, cards: cards.length, missing: folders.filter((f) => !cards.includes(f)), extra: cards.filter((f) => !folders.includes(f)), went: went.length, twice: went.filter((f, i) => went[i - 1] === f), never: folders.filter((f) => !went.includes(f)) });
    check("games page (dice): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }
};
