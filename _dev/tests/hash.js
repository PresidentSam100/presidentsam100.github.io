// Hash: a hint stays lit through the re-renders that picking cards causes,
// so the next hint shows a second card instead of charging again for the
// first; Enter or Space on a card keeps keyboard focus on that card. The
// clock runs from the moment the deal is down (FX on and off), a press while
// it is coming in landing it first, and a deal in a hidden tab starts paused; P / Esc
// / a hidden tab pause it, with the cards blank under the pause card; leaving
// or ↻ New game mid-deck asks first with the game paused; a best time leaves
// the paused time out and keeps the hint penalty in. A hint glows blue, not
// the gold of a picked card, and isn't a pick; a claimed Hash flies to its
// row in Found (in Set-Chain to the Last Hash beside the table) and the new
// cards come from the pile, with Visual FX on (face down, turning up as they
// land) and off (face up, no turn) alike.
const HOOK = ["  renderBest();\n  newGame();\n})();", "  renderBest();\n  newGame();\n  window.__h = { get board() { return board; }, findSet: findSet, emptyDeck: function () { deck = []; }, clock: clockMs };\n})();"];
// (in the page) whether a deal's cards are still coming in from the pile
const COMING = "!!document.querySelector('#board .card.arriving, .flyer')";

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/hash/", { before: (pg) => lib.injectScript(pg, "games/hash/game.js", [HOOK]) });
  const lit = () => p.evaluate(() => [...document.querySelectorAll("#board .card.hint")].map((c) => +c.dataset.idx));
  // a new deal, saying yes if it asks first (mid-deck it does), and down
  const deal = async () => {
    await p.click("#newBtn"); await p.waitForTimeout(100);
    if (await p.evaluate(() => !!document.querySelector(".gs-dialog"))) { await p.keyboard.press("Enter"); await p.waitForTimeout(100); }
    await p.waitForFunction("!" + COMING, null, { timeout: 8000 });
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
  const before = await p.evaluate((i) => document.querySelector('#board .card[data-idx="' + i + '"]').dataset.id, set[2]);
  for (const i of set) { await p.focus('.card[data-idx="' + i + '"]'); await p.keyboard.press("Enter"); }
  // (the refill is in: a new card in that slot, landed)
  await p.waitForFunction(({ i, was }) => { const c = document.querySelector('#board .card[data-idx="' + i + '"]'); return c && c.dataset.id !== was && !document.querySelector("#board .card.arriving"); }, { i: set[2], was: before }, { timeout: 8000 });
  const k3 = await p.evaluate(() => { const a = document.activeElement; return a.closest("#board") ? a.dataset.idx : a.tagName; });
  check("hash: after a Hash claimed by keyboard, focus stays in that card's slot", k3 === String(set[2]), { k3, set });
  check("hash: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // (the page's first deal down before anything is pressed)
  const open = async () => {
    const q = await lib.open(ctx, base, "games/hash/", { before: (pg) => lib.injectScript(pg, "games/hash/game.js", [HOOK]) });
    await q.waitForFunction("!" + COMING, null, { timeout: 8000 });
    return q;
  };
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

  // ---- the clock waits for the deal: none while a new game's cards are still
  // coming in from the pile, running once the last is down (FX on and off); a
  // press on a card meanwhile lands the deal at once, the clock starting then,
  // and picks the card
  for (const off of [false, true]) {
    const r = await lib.open(ctx, base, "games/hash/", { before: async (pg) => {
      await lib.injectScript(pg, "games/hash/game.js", [HOOK]);
      if (off) await pg.addInitScript(() => { try { localStorage.setItem("reduceMotion:hash", "1"); } catch (e) {} });
    } });
    await r.waitForFunction("!" + COMING, null, { timeout: 8000 });
    const waited = await r.evaluate((coming) => new Promise((res) => {
      const still = new Function("return " + coming);
      document.getElementById("newBtn").click();   // (an untouched game: it deals at once)
      let most = 0, seen = 0;
      (function look() {
        if (still()) { most = Math.max(most, __h.clock()); seen++; return setTimeout(look, 10); }
        setTimeout(() => res({ most, seen, later: __h.clock() }), 300);
      })();
    }), COMING);
    const pressed = await r.evaluate((coming) => new Promise((res) => {
      const still = new Function("return " + coming);
      document.getElementById("newBtn").click();
      const was = still();
      document.querySelector("#board .card").click();
      const now = { was, still: still(), picked: document.querySelectorAll("#board .card.selected").length };
      setTimeout(() => res(Object.assign(now, { clock: __h.clock() })), 300);
    }), COMING);
    check("hash, FX " + (off ? "off" : "on") + ": the clock stays at nothing while a new game's deal is coming in and runs once it is down",
      waited.seen > 0 && waited.most === 0 && waited.later >= 150, waited);
    check("hash, FX " + (off ? "off" : "on") + ": a press on a card while the deal is coming in lands it at once, the clock starting then, and picks the card",
      pressed.was && !pressed.still && pressed.picked === 1 && pressed.clock >= 150, pressed);
    check("hash (the clock and the deal, FX " + (off ? "off" : "on") + "): no page errors", r.errs.length === 0, r.errs);
    await r.close();
  }

  // ---- on a visible tab the clock runs once the deal is down
  let q = await open();
  await q.waitForTimeout(2300);
  const after = await time(q);
  check("hash: on a visible tab the clock runs once the deal is down", after !== "0:00", { after });
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
  await q.keyboard.press("Enter"); await q.waitForTimeout(250);   // (Keep playing)
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
  // every time the clock shows from here on is recorded (read after a fixed
  // wait, a busy machine can already be at 0:01): Enter's deal must reset it
  await q.evaluate(() => { const el = document.getElementById("statTime"); window.__times = []; new MutationObserver(() => __times.push(el.textContent)).observe(el, { childList: true, characterData: true, subtree: true }); });
  await q.keyboard.press("Enter"); await q.waitForTimeout(150);
  const n2 = Object.assign(await st(), { time: await q.evaluate(() => __times.includes("0:00") ? "0:00" : __times.join(" ") || "unchanged"), paused: (await look(q)).paused });
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
    document.getElementById("newBtn").click();         // a fresh deal: the clock starts once it is down
    while (document.querySelector("#board .card.arriving, .flyer")) await wait(10);
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

  // ---- a card clicked with the mouse isn't left focused: H for a hint then
  // lights only the hint (the card last clicked used to get a black focus
  // outline from the key press); Tab still reaches the cards
  {
    const r = await open();
    const ids = await r.evaluate(() => { const t = __h.findSet(__h.board); return t; });
    const pickIdx = await r.evaluate(() => { const t = __h.findSet(__h.board), all = __h.board.map((_, i) => i); return all.find((i) => t.indexOf(i) === -1); });
    await r.click('.card[data-idx="' + pickIdx + '"]');
    await r.click('.card[data-idx="' + pickIdx + '"]');            // (and put it back)
    await r.keyboard.press("h"); await r.waitForTimeout(150);
    const after = await r.evaluate(() => ({
      focusedCard: !!(document.activeElement && document.activeElement.classList.contains("card")),
      ringed: [...document.querySelectorAll("#board .card")].filter((c) => c.matches(":focus-visible")).length,
      hinted: document.querySelectorAll("#board .card.hint").length
    }));
    await r.keyboard.press("Tab");
    const tabbed = await r.evaluate(() => !!(document.activeElement && (document.activeElement.classList.contains("card") || document.activeElement.tagName === "BUTTON")));
    check("hash: after a card is clicked, H lights only the hint, with no focus outline on the card clicked; Tab still reaches the cards",
      !!ids && !after.focusedCard && after.ringed === 0 && after.hinted >= 1 && tabbed, Object.assign({ tabbed }, after));
    check("hash (hint after a click): no page errors", r.errs.length === 0, r.errs);
    await r.close();
  }
  // ======================================================================
  // The modes: Normal, Set-Chain and UltraSet (1 2 3), the Junior switch (J)
  // and the Daily (D), their keys on their buttons; each of the six ways to
  // play has its own best and its own Daily; a log of what's been found.
  const HOOK2 = ["  renderBest();\n  newGame();\n})();", "  renderBest();\n  newGame();\n" +
    "  window.__h = { get board() { return board; }, get deck() { return deck; }, get tray() { return tray; }, get log() { return log; }, get mode() { return mode; }, get locked() { return locked; },\n" +
    "    findSet: findSet, findAny: findAny, emptyDeck: function () { deck = []; }, table: function (codes) { board = codes.map(function (s) { return cardOf(s.split('').map(Number)); }); selected = []; hintIds = []; render(); } };\n})();"];
  // (the page's first deal down before anything is pressed)
  const openM = async (c, seed) => {
    const q = await lib.open(c || ctx, base, "games/hash/", { before: async (pg) => {
      await lib.injectScript(pg, "games/hash/game.js", [HOOK2]);
      if (seed) await pg.addInitScript((s) => { try { localStorage.setItem("hash_prefs", s); } catch (e) {} }, JSON.stringify(seed));
    } });
    await q.waitForFunction("!" + COMING, null, { timeout: 8000 });
    return q;
  };
  const code = (s) => s.split("").map(Number);
  const third = (a, b) => a.map((v, f) => (6 - v - b[f]) % 3);
  const isUltra = (cs) => [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]].some((o) => third(cs[o[0]], cs[o[1]]).join() === third(cs[o[2]], cs[o[3]]).join());
  const state = (q) => q.evaluate(() => ({
    mode: __h.mode, found: +document.getElementById("statSets").textContent, msg: document.getElementById("msg").textContent,
    tray: __h.tray.map((c) => c.id), log: __h.log.length, board: __h.board.length,
    pressed: [...document.querySelectorAll("#modeRow .chip[aria-pressed=true], .chip.sw[aria-pressed=true]")].map((b) => b.dataset.mode || b.id),
    dlg: (document.querySelector(".gs-dialog h2") || {}).textContent || null,
  }));
  const click = (q, sel) => q.evaluate((s) => document.querySelector(s).click(), sel);
  const idx = (i) => '#board .card[data-idx="' + i + '"]';
  // every claim open on the table, claimed by clicks, until the end card is up (the deck emptied first)
  const playOut = (q) => q.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    __h.emptyDeck();
    for (let n = 0; n < 40 && document.getElementById("overlay").hidden; n++) {
      // (a deal or a claim's cards still on their way first)
      for (let k = 0; k < 300 && document.querySelector("#board .card.arriving, .flyer"); k++) await wait(10);
      const f = __h.findAny();
      if (!f) break;
      for (const c of f) {
        const t = __h.tray.indexOf(c);
        document.querySelector(t >= 0 ? '#trayCards [data-tray="' + t + '"]' : '#board .card[data-idx="' + __h.board.indexOf(c) + '"]').click();
      }
      await wait(700);
    }
    return { over: !document.getElementById("overlay").hidden, title: document.getElementById("ovTitle").textContent, body: document.getElementById("ovBody").textContent };
  });

  {
    const r = await openM();
    const caps = await r.evaluate(() => [...document.querySelectorAll("#modeRow .chip, #juniorBtn, #dailyBtn")].map((b) => b.textContent.trim() + " " + b.getAttribute("data-gs-key")).join(", "));
    check("hash: the mode row is Normal 1, Set-Chain 2, UltraSet 3, then Junior J and Daily D, each key on its button",
      caps === "Normal 1, Set-Chain 2, UltraSet 3, Junior J, Daily D", caps);

    // on an untouched deal 2 goes straight to Set-Chain; once the game's begun, 3 asks first (Esc keeps it, Enter deals)
    await r.keyboard.press("2"); await r.waitForTimeout(150);
    const s2 = await state(r);
    const slots = await r.evaluate(() => ({ shown: !document.getElementById("tray").hidden, slots: document.querySelectorAll("#trayCards .slot").length, label: document.getElementById("trayK").textContent }));
    await r.keyboard.press("h"); await r.waitForTimeout(100);
    await r.keyboard.press("3"); await r.waitForTimeout(200);
    const s3a = await state(r);
    await r.keyboard.press("Escape"); await r.waitForTimeout(150);
    const s3b = await state(r);
    await r.keyboard.press("3"); await r.waitForTimeout(200);
    await r.keyboard.press("Enter"); await r.waitForTimeout(200);
    const s3c = await state(r);
    check("hash: 2 on an untouched deal deals Set-Chain at once, the tray showing the last Hash's three empty places; mid-deck 3 asks first, Esc keeps the game and Enter deals UltraSet",
      s2.mode === "chain" && !s2.dlg && s2.pressed.join() === "chain" && slots.shown && slots.slots === 3 &&
      s3a.dlg === "Start a new game?" && s3b.mode === "chain" && !s3b.dlg && s3c.mode === "ultra" && s3c.pressed.join() === "ultra", { s2, slots, s3a, s3b, s3c });
    await r.reload({ waitUntil: "domcontentloaded" }); await r.waitForSelector(".mute-toggle"); await r.waitForTimeout(300);
    check("hash: the mode played last comes back on the next visit", (await state(r)).mode === "ultra", await state(r));
    check("hash (modes): no page errors", r.errs.length === 0, r.errs);
    await r.close();
  }

  // ---- Set-Chain: the first Hash is free and moves aside; after it, a Hash
  // of table cards alone is turned away, and one with a card from the last
  // Hash counts, its three cards the new last Hash; the log rings the carried card
  {
    const r = await openM(null, { mode: "chain" });
    // A B C a Hash; T1 T2 T3 a Hash of table cards; A D E a Hash with A
    await r.evaluate((codes) => __h.table(codes), ["0000", "1111", "2222", "0120", "1201", "2012", "0011", "0022", "2100", "1020", "2210", "0201"]);
    // (each step waits for the table to take clicks again, by the game's own lock: a busy machine runs its timers late)
    const ready = () => r.waitForFunction(() => !__h.locked && !document.querySelector(".flyer"), null, { timeout: 15000 });
    for (const i of [0, 1, 2]) await click(r, idx(i));
    await ready();
    const c1 = await state(r);
    for (const i of [3, 4, 5]) await click(r, idx(i));
    await r.waitForTimeout(100);
    const c2 = await state(r);
    await ready();
    await click(r, '#trayCards [data-tray="0"]'); await click(r, idx(6)); await click(r, idx(7));
    await ready();
    const c3 = await state(r);
    const logged = await r.evaluate(() => [...document.querySelectorAll("#logList li")].map((li) => li.querySelectorAll(".mini").length + "/" + li.querySelectorAll(".mini.carried").length).join(" "));
    check("hash, Set-Chain: the first Hash is free and moves aside; three table cards alone are turned away, even as a Hash; a Hash with a card from the last one counts and becomes the last Hash",
      c1.found === 1 && c1.tray.join() === "0000,1111,2222" && c1.board === 12 &&
      c2.found === 1 && /needs one card from the last Hash/.test(c2.msg) &&
      c3.found === 2 && c3.tray.join() === "0000,0011,0022" && c3.board >= 12, { c1, c2, c3 });   // (more than 12 when no Hash goes with the new last one: more cards came in)
    check("hash, Set-Chain: the log lists both Hashes, newest first, the carried card ringed", logged === "3/1 3/0", logged);
    check("hash (Set-Chain): no page errors", r.errs.length === 0, r.errs);
    await r.close();
  }

  // ---- UltraSet: four cards count when two pairs need the same third card,
  // whichever order they're picked in; the extra card shows in the tray and
  // the log; the table stays at 12; four that don't are turned away
  {
    const r = await openM(null, { mode: "ultra" });
    const fill = ["2101", "0211", "1201", "2012", "0102", "1122", "2200", "0021"];
    // a + b and c + d both need 2220; picked a, c, b, d
    await r.evaluate((codes) => __h.table(codes), ["0000", "0120", "1110", "1020"].concat(fill));
    for (const i of [0, 1, 2, 3]) await click(r, idx(i));
    await r.waitForTimeout(100);
    const u0 = await state(r);
    await r.waitForTimeout(650);
    const u1 = await state(r);
    const shown = await r.evaluate(() => ({
      tray: (document.querySelector("#trayCards .card.extra") || { getAttribute: () => null }).getAttribute("aria-label"),
      log: [...document.querySelectorAll("#logList li")].map((li) => li.querySelectorAll(".pair .mini").length + "+" + li.querySelectorAll(".mini.extra").length).join(" "),
    }));
    // four of the rest that make no UltraSet
    let four = null;
    for (let a = 4; a < 12 && !four; a++) for (let b = a + 1; b < 12 && !four; b++) for (let c = b + 1; c < 12 && !four; c++) for (let d = c + 1; d < 12 && !four; d++)
      if (!isUltra([a, b, c, d].map((i) => code(fill[i - 4])))) four = [a, b, c, d];
    for (const i of four) await click(r, idx(i));
    await r.waitForTimeout(100);
    const u2 = await state(r);
    check("hash, UltraSet: four cards picked in any order count when two pairs need the same third card; the table stays at 12",
      /UltraSet/.test(u0.msg) && u1.found === 1 && u1.board === 12 && u1.log === 1, { u0, u1 });
    check("hash, UltraSet: the extra card (here 3 red open ovals) shows in the tray, and the log has the two pairs and it",
      /^3 red open ovals/.test(shown.tray || "") && shown.log === "4+1", shown);
    check("hash, UltraSet: four cards with no two pairs needing the same card are turned away", !!four && u2.found === 1 && /Not an UltraSet/.test(u2.msg), { four, u2 });
    check("hash (UltraSet): no page errors", r.errs.length === 0, r.errs);
    await r.close();
  }

  // ---- Junior: the 27 solid cards (in any mode), shading gone from the rule line
  {
    const r = await openM();
    await r.keyboard.press("j"); await r.waitForTimeout(150);
    const j = await r.evaluate(() => ({
      pressed: document.getElementById("juniorBtn").getAttribute("aria-pressed"),
      total: __h.board.length + __h.deck.length, deckShown: +document.getElementById("statDeck").textContent, deck: __h.deck.length,
      solid: [...__h.board, ...__h.deck].every((c) => c.shading === "solid"), rule: document.getElementById("subtitle").textContent.replace(/\s+/g, " ").trim(),
    }));
    await r.keyboard.press("2"); await r.waitForTimeout(150);
    const j2 = await r.evaluate(() => ({ mode: __h.mode, total: __h.board.length + __h.deck.length, solid: __h.board.every((c) => c.shading === "solid") }));
    check("hash, Junior: J plays with the 27 solid cards (the Deck count follows), and the rule line leaves shading out; Set-Chain can be Junior too",
      j.pressed === "true" && j.total === 27 && j.deckShown === j.deck && j.solid && !/shading/.test(j.rule) && j2.mode === "chain" && j2.total === 27 && j2.solid, { j, j2 });
    await r.close();
  }

  // ---- the Daily: the same deal on every load that day, a different one in
  // each way to play; its clear is recorded as today's (not as the best)
  {
    const r = await openM(null, { mode: "normal", daily: true });
    const ids = () => r.evaluate(() => __h.board.map((c) => c.id).join(" ") + " | " + __h.deck.map((c) => c.id).join(" "));
    const d1 = await ids();
    const hud = await r.evaluate(() => document.getElementById("statBestK").textContent + " " + document.getElementById("statBest").textContent);
    await r.reload({ waitUntil: "domcontentloaded" }); await r.waitForSelector(".mute-toggle"); await r.waitForTimeout(300);
    const d2 = await ids();
    await r.keyboard.press("2"); await r.waitForTimeout(150);
    const d3 = await ids();
    check("hash, Daily: the deal is the same on a second load, and Set-Chain's Daily is another deal", d1 === d2 && d3 !== d1, { d1: d1.slice(0, 60), d2: d2.slice(0, 60), d3: d3.slice(0, 60) });
    await r.keyboard.press("1"); await r.waitForTimeout(150);
    const out = await playOut(r);
    const rec = await r.evaluate(() => ({ daily: JSON.parse(localStorage.getItem("hash_daily") || "null"), best: localStorage.getItem("set_best_time"), hud: document.getElementById("statBestK").textContent + " " + document.getElementById("statBest").textContent }));
    check("hash, Daily: the HUD shows Today's time in place of Best; a clear is recorded as today's Normal Daily and named on the end card, and leaves the best alone",
      hud === "Today none" && out.over && /Normal, Daily No\. \d+/.test(out.body) && rec.daily && typeof rec.daily.done.normal === "number" && rec.best === null && /^Today \d+:\d\d$/.test(rec.hud), { hud, out, rec });
    check("hash (Daily): no page errors", r.errs.length === 0, r.errs);
    await r.close();
  }

  // ---- each way to play keeps its own best: a Set-Chain clear and a Junior
  // UltraSet clear each save their own, not Normal's
  {
    const r = await openM(null, { mode: "chain" });
    const o1 = await playOut(r);
    await r.click("#ovBtn"); await r.waitForTimeout(150);
    await r.keyboard.press("3"); await r.waitForTimeout(150);
    await r.keyboard.press("j"); await r.waitForTimeout(150);
    const o2 = await playOut(r);
    const keys = await r.evaluate(() => Object.keys(localStorage).filter((k) => /^set_best_time/.test(k)).sort().join(" "));
    const logs = await r.evaluate(() => document.querySelectorAll("#logList li").length);
    check("hash: a Set-Chain clear and a Junior UltraSet clear each save a best of their own, Normal's untouched; the end card names the mode",
      o1.over && /^Set-Chain/.test(o1.body) && o2.over && /^UltraSet, Junior/.test(o2.body) && keys === "set_best_time_chain set_best_time_ultra_junior", { o1, o2, keys });
    check("hash: the log has every one found", logs >= 1, logs);
    check("hash (bests): no page errors", r.errs.length === 0, r.errs);
    await r.close();
  }

  // ---- fit: on phones and laptops the mode row, the HUD, the tray, the
  // table and the buttons are all on the first screen, nothing wider than it;
  // on a laptop the log stands beside the table, on a phone below the page
  {
    // (a phone on its side is too short for the whole table: there the cards
    // keep a playable size and the page scrolls to the buttons)
    const sizes = [[320, 568, true], [360, 640, true], [390, 664, true], [375, 553, true], [1280, 800, false], [1366, 657, false], [1280, 600, false], [844, 390, true, true], [667, 375, true, true]];
    const bad = [], seen = {};
    for (const [w, h, phone, side] of sizes) {
      const c = await lib.newContext(browser, phone ? Object.assign({}, require("@playwright/test").devices["Pixel 7"], { viewport: { width: w, height: h } }) : { viewport: { width: w, height: h } });
      for (const mode of ["normal", "chain", "ultra"]) {
        const q = await openM(c, { mode });
        // (a deal with no Hash in its first twelve has fifteen: measured on twelve)
        for (let k = 0; k < 6 && await q.evaluate(() => __h.board.length > 12); k++) { await q.evaluate(() => document.getElementById("newBtn").click()); await q.waitForTimeout(100); }
        const m = await q.evaluate((w) => {
          const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right), h: Math.round(b.height) }; };
          const card = r("#board .card");
          return { over: Math.max(document.documentElement.scrollWidth, innerWidth) - w, vh: innerHeight, modes: r(".modes"), hud: r(".hud"), tray: document.getElementById("tray").hidden ? null : r("#tray"),
            board: r("#board"), controls: r(".controls"), log: r("#log"), card: card && card.h, logAfter: !document.querySelector(".wrap").contains(document.getElementById("log")) };
        }, w);
        const key = w + "x" + h + " " + mode;
        seen[key] = "card " + m.card + "px";
        const low = [m.modes, m.hud, m.tray, m.board, m.controls].filter(Boolean).filter((b) => b.t < 0 || b.b > m.vh + 1).length;
        if (side) { if (m.over > 0 || m.card < 40) bad.push(key + ": " + JSON.stringify(m)); }
        else if (m.over > 0 || low || m.card < 34) bad.push(key + ": " + JSON.stringify(m));
        else if (phone && !m.logAfter) bad.push(key + ": the log isn't below the page");
        else if (!phone && (m.logAfter || m.log.l < m.board.r || m.log.b > m.vh || m.log.h < 120)) bad.push(key + ": the log isn't beside the table " + JSON.stringify(m.log));
        await q.close();
      }
      await c.close();
    }
    check("hash: at 320 x 568, 360 x 640, 390 x 664, 375 x 553 and on 1280 x 800, 1366 x 657 and 1280 x 600 laptops, every mode's row, HUD, tray, table and buttons fit the first screen (cards at least 34 px tall), the log beside the table on a laptop and below the page on a phone; on a phone on its side (844 x 390, 667 x 375) the cards stay at least 40 px tall",
      bad.length === 0, bad.length ? bad : seen);
  }

  // ---- a hint glows blue, not the gold of a picked card, and isn't a pick
  {
    const r = await openM();
    await r.waitForFunction(() => !document.querySelector("#board .card.arriving"), null, { timeout: 8000 });
    await r.click("#hintBtn"); await r.waitForTimeout(80);
    const hint = await r.evaluate(() => {
      const h = document.querySelector("#board .card.hint"), cs = h && getComputedStyle(h);
      return { border: cs && cs.borderTopColor, picked: document.querySelectorAll("#board .card.selected").length, gold: getComputedStyle(document.documentElement).getPropertyValue("--gold").trim() };
    });
    check("hash: a hint glows blue (not the gold of a picked card) and picks nothing", hint.border === "rgb(74, 168, 255)" && hint.picked === 0, hint);
    check("hash (hint colour): no page errors", r.errs.length === 0, r.errs);
    await r.close();
  }

  // ---- a claimed Hash flies to its row in Found (Normal), or to the Last Hash
  // beside the table (Set-Chain); the new cards come from the pile. With
  // Visual FX on or off alike (where a card goes is play): FX on the new
  // cards fly face down and turn up as they land, FX off they come face up.
  for (const [mode, off] of [["normal", false], ["chain", false], ["normal", true], ["chain", true]]) {
    const r = await openM(null, { mode });
    if (off) { await r.evaluate(() => { localStorage.setItem("reduceMotion:hash", "1"); }); await r.reload({ waitUntil: "domcontentloaded" }); }
    await r.waitForFunction(() => !document.querySelector("#board .card.arriving"), null, { timeout: 8000 });
    const flown = await r.evaluate(() => new Promise((res) => {
      const t = __h.findAny(), b = __h.board, ids = t.map((c) => c.id);
      t.forEach((c) => { const i = b.indexOf(c); document.querySelector('#board .card[data-idx="' + i + '"]').click(); });
      const where = __h.mode === "chain" ? "#trayCards .card" : "#logList li:first-child .mini";
      // every card that flies, as it's sent: a claimed one, or a new one (face down and turning, or face up)
      const sent = { claimed: 0, backs: 0, faces: 0, turns: 0 };
      new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1 || !n.classList.contains("flyer")) return;
        if (ids.includes(n.dataset.id)) sent.claimed++; else if (n.classList.contains("back")) sent.backs++; else sent.faces++;
        if (n.getAnimations().some((a) => a.effect.getKeyframes().some((k) => /rotateY/.test(k.transform || "")))) sent.turns++;
      }))).observe(document.body, { childList: true });
      let mid = null;
      // (looked at once the cards are on their way, by the page's own clock)
      (function look(n) {
        const fl = document.querySelectorAll(".flyer:not(.back)").length;
        if (fl && !mid) mid = { flying: fl, waiting: ids.filter((id) => { const e = document.querySelector(where + '[data-id="' + id + '"]'); return e && e.classList.contains("landing"); }).length };
        if (n < 200 && (!mid || document.querySelector(".flyer"))) return setTimeout(() => look(n + 1), 15);
        res({ mid, sent, fxOff: RM_ON(), kept: ids.filter((id) => { const e = document.querySelector(where + '[data-id="' + id + '"]'); return e && !e.classList.contains("landing"); }).length,
          left: document.querySelectorAll(".flyer, #board .card.arriving, .landing").length, pile: !document.getElementById("pile").hidden });
      })(0);
    }));
    const s = flown.sent;
    check("hash, FX " + (off ? "off" : "on") + " (" + mode + "): a claimed Hash's three cards fly to " + (mode === "chain" ? "the Last Hash beside the table" : "their row in Found") + ", shown there as they land; the refill comes from the pile beside the table, " +
      (off ? "face up, with no turn" : "face down, turning up"),
      flown.fxOff === off && flown.mid && flown.mid.flying === 3 && flown.mid.waiting === 3 && flown.kept === 3 && flown.left === 0 && flown.pile && s.claimed === 3 &&
      (off ? s.faces >= 3 && s.backs === 0 && s.turns === 0 : s.backs >= 3 && s.faces === 0 && s.turns === s.backs), flown);
    check("hash (claim flights, " + mode + ", FX " + (off ? "off" : "on") + "): no page errors", r.errs.length === 0, r.errs);
    await r.close();
  }

  await ctx.close();
};
