// The games page: Enter is 🎲 random game and Esc is 🗑️ reset all high scores,
// each key shown on its button (not on a touch-only device). Enter on a game's
// card, reached by Tab, still opens that game. In the reset box only Esc
// resets (as Esc again leaves a game from "Leave this game?"): Enter, a letter
// or an arrow cancels (the button says "any other key"), and a cancelled box
// clears nothing.
//
// The cards: one description each, wrapping to exactly two lines on a
// laptop's card and to no more than four on a phone's (two cards to a row),
// every card the same size and nothing cut off. Measured twice: in the
// fallback face the suites see (lib.js blocks Google Fonts), and in Inter,
// which players get, fetched for that check alone.
//
// The search box: / (or any letter typed on the page) goes to it, and as
// characters go in and out only the games whose name or description (or one
// of the other names a game goes by, kept on its card unshown: "tetris" finds
// Abyss) holds every word typed stay, best match first. Enter opens the top one, Esc
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
    localStorage.setItem("tallorder_best_bakery_dark", "9"); localStorage.setItem("tallorder_best_rush_dark", "4"); localStorage.setItem("tallorder_dark", "1");
    // Abyss: a best in Descent with Intense and in each way to play Maelstrom, and both switches on (settings)
    ["abyss_best_descent_intense", "abyss_best_maelstrom", "abyss_best_maelstrom_juggle", "abyss_best_maelstrom_intense", "abyss_best_maelstrom_juggle_intense"].forEach((k) => localStorage.setItem(k, "500"));
    localStorage.setItem("abyss_intense", "1"); localStorage.setItem("abyss_juggle", "1"); } catch (e) {} });
  const open = (c) => lib.open(c, base, "games/", { waitCorner: false, before: seed });
  const gamePath = (p) => p.evaluate(() => (/\/games\/([^/]+)\//.exec(location.pathname) || [])[1] || null);
  const box = (p) => p.evaluate(() => { const d = document.getElementById("reset-dialog"); return { open: d.open, focus: document.activeElement && document.activeElement.className }; });
  const best = (p) => p.evaluate(() => ({ best: localStorage.getItem("rushhour_best_day"), prefs: localStorage.getItem("sudoku_prefs"),
    hash: ["set_best_time_chain", "set_best_time_junior", "hash_daily"].map((k) => localStorage.getItem(k)).filter((v) => v !== null).length, hashPrefs: localStorage.getItem("hash_prefs"),
    dark: ["tallorder_best_bakery_dark", "tallorder_best_rush_dark"].map((k) => localStorage.getItem(k)).filter((v) => v !== null).length, darkOn: localStorage.getItem("tallorder_dark"),
    abyss: ["abyss_best_descent_intense", "abyss_best_maelstrom", "abyss_best_maelstrom_juggle", "abyss_best_maelstrom_intense", "abyss_best_maelstrom_juggle_intense"].map((k) => localStorage.getItem(k)).filter((v) => v !== null).length,
    abyssSwitches: ["abyss_intense", "abyss_juggle"].map((k) => localStorage.getItem(k)).join() }));

  // ---- the keys are on the buttons
  let p = await open(ctx);
  const caps = await p.evaluate(() => {
    const cap = (id) => { const k = document.querySelector("#" + id + " kbd"); return k && getComputedStyle(k).display !== "none" ? k.textContent : null; };
    return { random: cap("random-game"), reset: cap("reset-scores") };
  });
  check("games page: 🎲 random game shows Enter and 🗑️ reset all high scores shows Esc", caps.random === "Enter" && caps.reset === "Esc", caps);

  // ---- Esc opens the reset box; a letter, an arrow, Enter and Space all cancel it; nothing is cleared
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const opened = await box(p);
  const words = await p.evaluate(() => ({ cancel: document.querySelector("#reset-dialog .dialog-cancel").textContent.replace(/\s+/g, " ").trim(), ok: document.querySelector("#reset-dialog .dialog-ok").textContent.replace(/\s+/g, " ").trim() }));
  // (the two buttons sit in the middle of the box, as a pair: they were at its right)
  const pair = await p.evaluate(() => {
    const d = document.getElementById("reset-dialog").getBoundingClientRect(), a = document.querySelector("#reset-dialog .dialog-cancel").getBoundingClientRect(), b = document.querySelector("#reset-dialog .dialog-ok").getBoundingClientRect();
    return { left: Math.round(Math.min(a.left, b.left) - d.left), right: Math.round(d.right - Math.max(a.right, b.right)), oneRow: Math.abs(a.top - b.top) < 1 };
  });
  check("games page: the reset box's two buttons sit in the middle of it, side by side", pair.oneRow && Math.abs(pair.left - pair.right) <= 1, pair);
  await p.keyboard.press("Shift"); await p.keyboard.press("Tab"); await p.waitForTimeout(100);
  const still = await box(p);                                   // (Shift and Tab answer nothing)
  await p.keyboard.press("k"); await p.waitForTimeout(150);
  const afterLetter = await box(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(150);
  const afterArrow = await box(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const afterEnter = await box(p), enterWent = await gamePath(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("Space"); await p.waitForTimeout(150);  // (Cancel has the focus)
  const afterSpace = await box(p);
  const keptAll = await best(p);
  check("games page: Esc opens \"Reset all saved high scores?\" with Cancel focused; the box says any other key cancels and Esc resets",
    opened.open && /dialog-cancel/.test(opened.focus || "") && /^Cancel any other key$/.test(words.cancel) && /^Reset scores Esc$/.test(words.ok), { opened, words });
  check("games page: in the reset box a letter, an arrow, Enter and Space each cancel (Shift and Tab answer nothing; Enter doesn't also open a game), and nothing is cleared",
    still.open && !afterLetter.open && !afterArrow.open && !afterEnter.open && enterWent === null && !afterSpace.open && keptAll.best === "777", { still, afterLetter, afterArrow, afterEnter, enterWent, afterSpace, keptAll });
  // (the letter that cancels the box is the box's: it doesn't also go to the search box)
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.keyboard.press("k"); await p.waitForTimeout(150);
  const kSearch = await p.evaluate(() => ({ inBox: document.activeElement && document.activeElement.id === "game-search", value: document.getElementById("game-search").value }));
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const reopened = await box(p);
  check("games page: a letter that cancels the reset box doesn't also start a search, and Esc then opens the box again",
    !kSearch.inBox && kSearch.value === "" && reopened.open, { kSearch, reopened });

  // ---- ...and Esc again resets: the scores go, a game's settings stay, and the box stays shut
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  const cleared = await best(p), closed = await box(p);
  check("games page: Esc in the reset box clears the high scores (and leaves a game's settings alone), and doesn't open the box again",
    !closed.open && cleared.best === null && /hard/.test(cleared.prefs || ""), { closed, cleared });
  check("games page: the reset clears Hash's bests in every way to play and its Daily, and keeps the mode it was left on",
    cleared.hash === 0 && /chain/.test(cleared.hashPrefs || ""), cleared);
  check("games page: the reset clears Tall Order's bests in the dark, and leaves Dark on as it was",
    cleared.dark === 0 && cleared.darkOn === "1", cleared);
  check("games page: the reset clears Abyss's bests in Descent with Intense and in every way to play Maelstrom, and leaves its two switches as they were",
    cleared.abyss === 0 && cleared.abyssSwitches === "1,1", cleared);
  check("games page: Esc in the box hasn't also set off anything else (no game opened)", (await gamePath(p)) === null, await gamePath(p));

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
    const r = await pg.evaluate(async () => {
      // (the page's stylesheets, Google's included, are in by the load event)
      if (document.readyState !== "complete") await new Promise((ok) => addEventListener("load", ok, { once: true }));
      await document.fonts.ready;
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
        inter: Array.from(document.fonts).some((f) => f.family.replace(/["']/g, "") === "Inter" && f.status === "loaded") &&
          /^["']?Inter/.test(getComputedStyle(cs[0].querySelector(".desc")).fontFamily),
        note: (() => { const n = document.querySelector(".games-header .side-note"); if (!n) return null; const r = box(n);
          return { text: n.textContent.replace(/\s+/g, " ").trim(), shown: r.height > 0 && getComputedStyle(n).visibility !== "hidden", right: Math.round(r.right) }; })(),
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
    // the same in Inter, the face players get (Google Fonts let through, so this one needs the network)
    const ci = await lib.newContext(browser, opts);
    await ci.route(/fonts\.googleapis|fonts\.gstatic/, (rt) => rt.continue());
    const ri = await cardsAt(ci);
    await ci.close();
    const offInter = ri.lines.filter(([, n]) => n < lo || n > hi);
    check("games page, " + label + ", in Inter (fetched from Google Fonts): every description " + (lo === hi ? "exactly " + lo + " lines" : "at most " + hi + " lines") +
      ", all cards one size, none cut off",
      ri.inter && !offInter.length && ri.sizes.length === 1 && !ri.cut.length && !ri.spill.length,
      ri.inter ? { off: offInter, sizes: ri.sizes, cut: ri.cut, spill: ri.spill } : "Inter didn't load (no network?)");
    if (label === "laptop 1280 x 800") check("games page: every game has a description of its own", r.texts === r.n, r.texts + " of " + r.n);
    // (under the line about the arcade: the bigger games, made in Unity and Unreal, are private)
    check("games page, " + label + ": the header says there are bigger games in Unity and Unreal that are private, all of it on the screen",
      !!r.note && r.note.shown && /unity/i.test(r.note.text) && /unreal/i.test(r.note.text) && /private/i.test(r.note.text) && r.note.right <= opts.viewport.width, r.note);
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
  // another name a game goes by finds it, though the card doesn't show it
  const also = {};
  for (const q of ["tetris", "pong", "sokoban", "candy crush", "connect 4", "mastermind", "breakout"]) {
    await p.keyboard.press("Escape"); await p.keyboard.type(q); await p.waitForTimeout(80);
    also[q] = (await state()).shown.slice(0, 2);
  }
  const unshown = await p.evaluate(() => [...document.querySelectorAll(".games-grid .game-card")].some((a) => /tetris|sokoban/i.test(a.innerText)));
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
  check("games page: another name a game goes by finds it first, unshown on its card (tetris: Abyss, pong: Ping, sokoban: Potting Shed, candy crush: Tide Pool, connect 4: Link Many, mastermind: Spice Blend, breakout: Rose Window)",
    also.tetris.join() === "Abyss" && also.pong[0] === "Ping" && also.sokoban.join() === "Potting Shed" && also["candy crush"][0] === "Tide Pool" &&
    also["connect 4"][0] === "Link Many" && also.mastermind.join() === "Spice Blend" && also.breakout[0] === "Rose Window" && !unshown, { also, unshown });
  check("games page: Esc in the box clears it, every game back, without asking to reset the scores; a second Esc leaves the box",
    esc1.value === "" && esc1.inBox && esc1.shown.length === esc1.all && !esc1.dialog && !esc2.inBox && !esc2.dialog && esc2.value === "", { esc1, esc2 });
  check("games page: with no pause between keys every word must match: \"tic tac\" is Tic-Tac-Toe alone, a word matching nothing says so, and deleting it brings Tic-Tac-Toe back",
    ti.shown.slice(0, 3).sort().join() === "Tic-Tac-Toe,Tide Pool,Tile Maze" && zzq.shown.length === 0 && /no game matches/.test(zzq.none || "") &&
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
