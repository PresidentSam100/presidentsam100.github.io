// Themed text and pop-ups: no browser confirm / alert / prompt boxes anywhere
// (the shared GameShell dialogs, or the hub's own), the dialogs take keys
// away from the game while they're up, the pause card's Resume button gets
// the game's font, Klondike's corner buttons are filled, and the shared coin
// flip can be restyled per game.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  // record any native dialog instead of showing it
  const before = (p) => p.addInitScript(() => {
    window.__native = [];
    ["alert", "confirm", "prompt"].forEach((k) => { window[k] = (msg) => { window.__native.push(k + ": " + msg); return k === "confirm" ? true : null; }; });
    // and count keys that get past the dialog to the page
    window.__leaked = [];
    document.addEventListener("keydown", (e) => window.__leaked.push(e.key));
  });
  const dlg = (p) => p.evaluate(() => {
    const d = document.querySelector(".gs-dialog");
    if (!d) return null;
    const ta = d.querySelector("textarea");
    return {
      title: d.querySelector("h2").textContent,
      text: (d.querySelector("p") || {}).textContent || "",
      copy: ta ? ta.value : null,
      selected: ta ? ta.selectionEnd - ta.selectionStart === ta.value.length && document.activeElement === ta : null,
      focus: document.activeElement && d.contains(document.activeElement),
      bg: getComputedStyle(d.querySelector(".gs-pause-card")).backgroundImage + " " + getComputedStyle(d.querySelector(".gs-pause-card")).backgroundColor,
      font: getComputedStyle(d.querySelector("button")).fontFamily,
    };
  });
  const native = (p) => p.evaluate(() => window.__native);
  const leaked = (p) => p.evaluate(() => { const l = window.__leaked.slice(); window.__leaked.length = 0; return l; });
  const done = async (p, g) => { check(g + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- the share-result fallbacks: the clipboard refuses, the copy box shows
  const shares = {
    "lights-out": { n: 7, ymd: "2026-10-04", moves: 12, par: 10 },
    "mahjong": { n: 7, ymd: "2026-10-04", ms: 312000 },
    "minesweeper": { n: 7, ymd: "2026-10-04", secs: 61.5, tries: 2 },
    "passport": { n: 7, ymd: "2026-10-04", score: 8, typed: false },
    "science-fair": { n: 7, ymd: "2026-10-04", best: 6, used: 2 },
  };
  for (const g of Object.keys(shares)) {
    const p = await lib.open(ctx, base, "games/" + g + "/", {
      before: async (pg) => {
        await before(pg);
        // expose shareDaily, fed a made-up daily result
        await lib.injectScript(pg, "games/" + g + "/game.js", [["function shareDaily() {",
          "window.__share = function (d) { var rd = readDaily; readDaily = function () { return d; }; try { shareDaily(); } finally { readDaily = rd; } };\n  function shareDaily() {"]]);
        await pg.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("denied")) } }); });
      },
    });
    await p.evaluate((d) => window.__share(d), shares[g]);
    await p.waitForTimeout(150);
    const d = await dlg(p);
    check(g + ": the share fallback is the themed copy box, text selected", !!d && /Daily|Visa Run|Field Trip/.test(d.copy || "") && d.selected === true, d);
    await leaked(p);
    await p.keyboard.press("p"); await p.keyboard.press("Escape");
    const gone = !(await dlg(p)), lk = await leaked(p);
    check(g + ": keys don't reach the game while it's up; Esc closes it", gone && lk.length === 0, { gone, lk });
    check(g + ": no browser prompt()", (await native(p)).length === 0, await native(p));
    await done(p, g);
  }

  // Klondike's daily Share: "copied!" on the button when the clipboard takes
  // it (it used to copy silently), the copy box when it refuses
  for (const ok of [true, false]) {
    const p = await lib.open(ctx, base, "games/klondike/", {
      before: async (pg) => {
        await before(pg);
        await lib.injectScript(pg, "games/klondike/game.js", [["function winBox(isBest) {", "window.__win = function () { winBox(false); };\n  function winBox(isBest) {"]]);
        await pg.addInitScript((ok) => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => ok ? Promise.resolve() : Promise.reject(new Error("denied")) } }); }, ok);
      },
    });
    await p.evaluate(() => document.getElementById("m-daily").click()); await p.waitForTimeout(300);   // (in the closed Game menu) a daily deal, so the win box offers Share
    await p.evaluate(() => window.__win()); await p.waitForTimeout(200);
    await p.evaluate(() => [...document.querySelectorAll("#mb-row button")].find((b) => b.textContent === "Share").click());
    await p.waitForTimeout(200);
    const r = await p.evaluate(() => ({ btns: [...document.querySelectorAll("#mb-row button")].map((b) => b.textContent), box: !document.getElementById("shade").hidden }));
    const d = await dlg(p);
    if (ok) check("klondike share: the button says copied! (the win box stays up)", r.box && r.btns.includes("copied!") && !d, { r, d });
    else check("klondike share: a refused clipboard opens the themed copy box", !!d && /Daily claim/.test(d.copy || ""), { r, d });
    check("klondike share: no browser prompt()", (await native(p)).length === 0, await native(p));
    await done(p, "klondike share");
  }

  // the copy box borrows the game's look: Lights Out's back link is solid, so
  // the card is too, in its font (not the browser's)
  {
    const p = await lib.open(ctx, base, "games/lights-out/");
    const r = await p.evaluate(() => {
      window.GameShell.copyBox({ text: "hello" });
      const back = getComputedStyle(document.querySelector(".nav-back-games"));
      const card = getComputedStyle(document.querySelector(".gs-dialog .gs-pause-card"));
      const btn = getComputedStyle(document.querySelector(".gs-dialog button"));
      return { backBg: back.backgroundColor, cardBg: card.backgroundColor, backFont: back.fontFamily, btnFont: btn.fontFamily, size: btn.fontSize };
    });
    check("copy box: the back link's colour and font", r.cardBg === r.backBg && r.btnFont === r.backFont && r.size === "16px", r);
    // Enter presses Copy (the old copy command), which closes it
    await p.keyboard.press("Enter"); await p.waitForTimeout(900);
    check("copy box: Enter copies and closes", !(await dlg(p)), await dlg(p));
    await done(p, "lights-out copy box");
  }

  // ---- Slither: a level link that doesn't parse -> themed alert, not alert()
  {
    const p = await lib.open(ctx, base, "games/slither/#play=v1.notalevel", { before });
    const d = await dlg(p);
    check("slither: a broken level link shows the themed alert", !!d && /doesn't work/.test(d.title) && d.focus, d);
    check("slither: its look is the back link's bronze gradient", !!d && /gradient/.test(d.bg), d && d.bg);
    await p.keyboard.press("Escape");
    check("slither: Esc closes the alert", !(await dlg(p)) && (await native(p)).length === 0, await native(p));
    await done(p, "slither alert");
  }

  // ---- Slither labyrinth: starting a new pack run over a saved one asks first
  {
    const p = await lib.open(ctx, base, "games/slither/", { before });
    const lab = async () => { await p.click("#mode-pick [data-mode=lab]"); await p.waitForTimeout(300); };   // the run buttons are on the Labyrinth menu
    await lab();
    const zone = await p.evaluate(() => {
      const b = [...document.querySelectorAll("button.btn")].find((x) => /^Start a /.test(x.title) && !x.disabled);
      return b ? b.textContent.replace(/🏆.*/, "") : null;
    });
    await p.evaluate((z) => localStorage.setItem("slither_labyrinth", JSON.stringify({ best: {}, run: { zone: z, idx: 0, lives: 4, apples: 0 } })), zone);
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(500); await lab();
    const startBtn = () => p.evaluate(() => [...document.querySelectorAll("button.btn")].find((x) => /^Start a /.test(x.title) && !x.disabled).click());
    const run = () => p.evaluate(() => (JSON.parse(localStorage.getItem("slither_labyrinth")) || {}).run);
    await startBtn(); await p.waitForTimeout(100);
    const d = await dlg(p);
    check("slither run: giving up a saved run asks in the themed dialog", !!d && /Give up/.test(d.title) && /×4 lives/.test(d.text), d);
    await p.keyboard.press("Escape"); await p.waitForTimeout(100);
    const kept = await run();
    check("slither run: Esc keeps the run", !(await dlg(p)) && kept && kept.lives === 4, kept);
    await startBtn(); await p.waitForTimeout(100);
    await p.keyboard.press("Enter"); await p.waitForTimeout(300);
    const fresh = await run();
    check("slither run: Enter gives it up and starts fresh", !(await dlg(p)) && fresh && fresh.lives === 9, fresh);
    check("slither run: no browser confirm()", (await native(p)).length === 0, await native(p));
    await done(p, "slither run");
  }

  // ---- Slither's editor: New and Delete ask in the themed dialog; while it's
  // up the tool keys (P / R / F) do nothing
  {
    const p = await lib.open(ctx, base, "games/slither/editor.html", { before });
    const tool = () => p.evaluate(() => (document.querySelector("#ed-tools .btn.sel") || {}).dataset.tool);
    await p.click("#ed-tools [data-tool=fill]");
    await p.click("#ed-clear"); await p.waitForTimeout(100);
    const d = await dlg(p);
    check("editor: New asks in the themed dialog", !!d && /blank level/.test(d.title), d);
    await p.keyboard.press("r");
    check("editor: R doesn't switch tools behind the dialog", (await tool()) === "fill", await tool());
    await p.keyboard.press("Escape");
    check("editor: Esc cancels", !(await dlg(p)), null);
    // save a level, then delete it
    await p.click("#ed-save"); await p.waitForTimeout(150);
    const count = () => p.evaluate(() => JSON.parse(localStorage.getItem("slither_custom") || "[]").length);
    const n0 = await count();
    const del = () => p.evaluate(() => { const r = [...document.querySelectorAll(".ed-mine-row button")].find((b) => b.textContent === "✕"); r.click(); });
    await del(); await p.waitForTimeout(100);
    const dd = await dlg(p);
    check("editor: Delete asks in the themed dialog", !!dd && /Delete/.test(dd.title), dd);
    await p.keyboard.press("Escape"); await p.waitForTimeout(100);
    const n1 = await count();
    await del(); await p.waitForTimeout(100);
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    const n2 = await count();
    check("editor: Esc keeps the level, Enter deletes it", n0 === 1 && n1 === 1 && n2 === 0, { n0, n1, n2 });
    check("editor: no browser confirm()", (await native(p)).length === 0, await native(p));
    await done(p, "slither editor");
  }

  // ---- the hub's "reset all high scores" asks in its own dialog
  {
    const p = await lib.open(ctx, base, "games/", { before, waitCorner: false });
    // (with the pre-rename keys ClickTap and Tile Maze copy forward on load,
    // which the reset has to clear as well, or the next visit restores them)
    await p.evaluate(() => { localStorage.setItem("lightsout_best", "5"); localStorage.setItem("clickrush_best_mouse_10", "9"); localStorage.setItem("colorTileMaze.v1", "{}"); });
    const kept = () => p.evaluate(() => localStorage.getItem("lightsout_best"));
    const legacy = () => p.evaluate(() => [localStorage.getItem("clickrush_best_mouse_10"), localStorage.getItem("colorTileMaze.v1")]);
    const open = () => p.evaluate(() => document.getElementById("reset-dialog").open);
    await p.click("#reset-scores"); await p.waitForTimeout(100);
    const o1 = await open();
    await p.keyboard.press("Escape"); await p.waitForTimeout(100);
    const o2 = await open(), k1 = await kept();
    await p.click("#reset-scores"); await p.waitForTimeout(100);
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);
    const o3 = await open(), k2 = await kept();
    const msg = await p.evaluate(() => document.getElementById("reset-msg").textContent);
    check("hub: reset asks in the page's dialog; Esc keeps scores, Enter clears them", o1 && !o2 && k1 === "5" && !o3 && /cleared|no saved/.test(msg), { o1, o2, k1, o3, k2, msg });
    const lg = await legacy();
    check("hub: reset also clears ClickTap's and Tile Maze's pre-rename keys", lg[0] === null && lg[1] === null, lg);
    check("hub: no browser confirm()", (await native(p)).length === 0, await native(p));
    await done(p, "hub");
  }

  // ---- every shared pause card: the Resume button is in the game's font at
  // 16px (an invalid `font:` shorthand used to leave it in the browser's 13px)
  {
    const blank = await ctx.newPage();
    const ua = await blank.evaluate(() => { const b = document.body.appendChild(document.createElement("button")); const cs = getComputedStyle(b); return { family: cs.fontFamily, size: cs.fontSize }; });
    await blank.close();
    const bad = [], seen = [];
    for (const g of lib.gamePages()) {
      const p = await lib.open(ctx, base, "games/" + g, { settle: 250 });
      const r = await p.evaluate(() => {
        const ov = document.querySelector(".gs-pause:not(.gs-dialog)");
        if (!ov) return null;
        const cs = getComputedStyle(ov.querySelector("button"));
        return { family: cs.fontFamily, size: cs.fontSize, overlay: getComputedStyle(ov).fontFamily };
      });
      if (r) {
        seen.push(g);
        const themed = r.family !== ua.family || r.overlay === ua.family;
        if (!themed || r.size === ua.size) bad.push(Object.assign({ g }, r));
      }
      await p.close();
    }
    check("pause card: Resume button in the game's font on all " + seen.length + " pages with the shared card", seen.length > 15 && bad.length === 0, { ua, bad });
  }

  // ---- Klondike: the corner buttons and pause card take the wood colour
  {
    const p = await lib.open(ctx, base, "games/klondike/");
    const r = await p.evaluate(() => {
      const fill = (sel) => { const e = document.querySelector(sel); if (!e) return "missing"; const cs = getComputedStyle(e); return cs.backgroundImage !== "none" ? "gradient" : cs.backgroundColor; };
      const ov = document.querySelector(".gs-pause:not(.gs-dialog)");
      return { fx: fill(".rm-toggle"), mute: fill(".mute-toggle"), pause: fill(".gs-pause-btn"), card: ov ? ov.style.getPropertyValue("--gs-bg") : "missing" };
    });
    const filled = (v) => v && v !== "missing" && v !== "rgba(0, 0, 0, 0)" && v !== "transparent";
    check("klondike: ✨ / 🔊 / ⏸ and the pause card are filled", filled(r.fx) && filled(r.mute) && filled(r.pause) && filled(r.card), r);
    await done(p, "klondike");
  }

  // ---- the coin flip: class hooks, the default look, and a game's own
  {
    const look = (g) => async () => {
      const p = await lib.open(ctx, base, "games/" + g + "/");
      const r = await p.evaluate(() => {
        window.coinFlip({ you: "You (X)", cpu: "CPU (O)" }, () => {});
        const q = (s) => document.querySelector(s);
        const card = q(".cf-card") && getComputedStyle(q(".cf-card"));
        return {
          parts: [".cf-overlay", ".cf-card", ".cf-title", ".cf-window", ".cf-sub"].every((s) => q(s)),
          bg: card && card.backgroundColor, bgImg: card && card.backgroundImage, shadow: card && card.boxShadow,
          winFont: q(".cf-window") && getComputedStyle(q(".cf-window")).fontFamily,
        };
      });
      await done(p, g + " coin flip");
      return r;
    };
    const dots = await look("dots-and-boxes")();
    check("coin flip: every part has its class; the default glass card stays where a game doesn't restyle it", dots.parts && dots.bg === "rgba(12, 18, 30, 0.55)", dots);
    const ttt = await look("tic-tac-toe")();
    check("coin flip: Tic-Tac-Toe's is a slate in an oak frame, chalked in Cabin Sketch", /176, 122, 69/.test(ttt.shadow) && /Cabin Sketch/.test(ttt.winFont), ttt);
    const salvo = await look("salvo")();
    check("coin flip: Salvo's is a steel plate in Black Ops One", /gradient/.test(salvo.bgImg) && /Black Ops One/.test(salvo.winFont), salvo);
  }

  await ctx.close();
};
