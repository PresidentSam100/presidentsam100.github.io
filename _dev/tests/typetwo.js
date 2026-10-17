// Typetwo with Visual FX off: the night scene (stars, ward, runes, the
// wizard's robe and orb) is drawn but holds still; with FX on it moves.
// A Zen run ends from its End session button or the End key, onto the
// results; the menus' key legends hide on a touch-only phone. On the start
// screen, Enter on a focused mode button only picks that mode.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const frames = async (fxOff) => {
    const p = await lib.open(ctx, base, "games/typetwo/");
    await p.evaluate((off) => localStorage.setItem("reduceMotion:typetwo", off ? "1" : "0"), fxOff);
    await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(300);
    const shot = () => p.evaluate(() => document.getElementById("game").toDataURL());
    const a = await shot(); await p.waitForTimeout(400); const b = await shot();
    const blank = await p.evaluate(() => { const c = document.createElement("canvas"), g = document.getElementById("game"); c.width = g.width; c.height = g.height; return c.toDataURL(); });
    const errs = p.errs;
    await p.close();
    return { still: a === b, drawn: a !== blank, errs };
  };
  const off = await frames(true), on = await frames(false);
  check("typetwo, FX off: the menu's night scene is drawn and holds still (FX on, it moves)", off.still && off.drawn && !on.still, { off, on });
  check("typetwo (FX): no page errors", off.errs.length === 0 && on.errs.length === 0, [off.errs, on.errs]);

  // ---- Zen: the End key, then the End session button, end the run onto its results
  {
    const p = await lib.open(ctx, base, "games/typetwo/");
    const look = () => p.evaluate(() => {
      const b = document.getElementById("endBtn");
      return { state: __game.state, btn: !!b && !b.hidden && getComputedStyle(b).display !== "none",
        over: !document.getElementById("overScreen").classList.contains("hidden"), best: document.getElementById("overBest").textContent };
    });
    await p.click('.mode[data-mode="zen"]'); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    const z0 = await look();
    await p.keyboard.press("End"); await p.waitForTimeout(100);
    const z1 = await look();
    check("typetwo zen: an End session button shows in the run, and End ends it onto the results", z0.state === "playing" && z0.btn && z1.state === "over" && z1.over && /Zen session ended/.test(z1.best) && !z1.btn, { z0, z1 });
    await p.click("#againBtn"); await p.waitForTimeout(200);
    await p.click("#endBtn"); await p.waitForTimeout(100);
    const z2 = await look();
    check("typetwo zen: the End session button ends the run too", z2.state === "over" && /Zen session ended/.test(z2.best), z2);
    // Normal: no button, and End is no key there
    await p.waitForTimeout(1000);   // (the results' keys wait a beat)
    await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
    await p.click('.mode[data-mode="normal"]'); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
    await p.keyboard.press("End"); await p.waitForTimeout(100);
    const n = await look();
    check("typetwo normal: no End session button, and End doesn't end the run", n.state === "playing" && !n.btn, n);
    check("typetwo (zen): no page errors", p.errs.length === 0, p.errs);
    await p.close();
  }
  await ctx.close();

  // ---- the menus' key legends and the End session keycap: shown on a desktop, hidden on a phone
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c2 = await lib.newContext(browser, opts);
    const q = await lib.open(c2, base, "games/typetwo/");
    const odd = await q.evaluate((phone) => [...document.querySelectorAll("#startScreen kbd, #overScreen kbd, #endBtn kbd")].filter((k) => {
      const w = k.closest(".gs-keys");
      return !w || (getComputedStyle(w).display === "none") !== phone;
    }).map((k) => (k.closest("[id]") || {}).id + ":" + k.textContent), label === "phone");
    const count = await q.evaluate(() => document.querySelectorAll("#startScreen kbd, #overScreen kbd, #endBtn kbd").length);
    check("typetwo, " + label + ": the menus' key legends " + (label === "phone" ? "are hidden" : "show"), count >= 8 && odd.length === 0, { count, odd });
    if (label === "phone") {
      // a Zen run's HUD, with its button, still fits a phone's width
      await q.click('.mode[data-mode="zen"]'); await q.click("#startBtn"); await q.waitForTimeout(200);
      const fit = await q.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, btn: !document.getElementById("endBtn").hidden }));
      check("typetwo, phone: a Zen run's End session button fits the HUD", fit.btn && fit.sw <= fit.w, fit);
    } else { await q.click("#startBtn"); await q.waitForTimeout(200); }
    // the in-run hint names no pause (the ⏸ in the corner carries its key)
    // and no Esc, on a desktop as on a phone
    const hint = await q.evaluate(() => ({ text: document.getElementById("hint").innerText, corner: !!document.querySelector(".gs-pause-btn") }));
    check("typetwo, " + label + ": the in-run hint names no pause key (the corner's ⏸ does) and no Esc", /Type to cast/.test(hint.text) && !/pause/i.test(hint.text) && !/Esc/.test(hint.text) && hint.corner, hint);
    await q.close();
    await c2.close();
  }

  // ---- Enter on a focused mode button picks that mode and stays on the start
  // screen (it used to begin as well, in the mode as it was); a mode picked
  // with the mouse keeps no focus, so the next Enter begins
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/typetwo/");
    const look = () => q.evaluate(() => ({ state: __game.state, mode: document.querySelector("#modes .mode.active").dataset.mode, focus: document.activeElement.tagName }));
    await q.focus('#modes .mode[data-mode="zen"]'); await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    const a = await look();
    await q.evaluate(() => document.activeElement.blur());
    await q.click('#modes .mode[data-mode="hard"]', { timeout: 3000 }).catch(() => {}); await q.waitForTimeout(80);
    const b = await look();
    await q.keyboard.press("Enter"); await q.waitForTimeout(200);
    const d = await look();
    check("typetwo: Enter on a focused mode button only picks it; after a mouse pick (which keeps no focus) Enter begins",
      a.state === "start" && a.mode === "zen" && b.state === "start" && b.mode === "hard" && b.focus !== "BUTTON" && d.state === "playing" && d.mode === "hard", { a, b, d });
    check("typetwo: no page errors (start screen keys)", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }
};
