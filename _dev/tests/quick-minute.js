// Quick Minute: lane changes while paused don't count; after resuming they do.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/quick-minute/");
  const card = () => p.evaluate(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; });
  const lane = () => p.evaluate(() => __game.player.lane);

  await p.evaluate(() => __game.start("day")); await p.waitForTimeout(100);
  await p.keyboard.press("p"); await p.waitForTimeout(60);
  const paused = await card(), l0 = await lane();
  await p.keyboard.press("ArrowLeft"); await p.keyboard.press("a");
  const l1 = await lane();
  await p.keyboard.press("p"); await p.waitForTimeout(60);
  await p.keyboard.press("ArrowLeft");
  const l2 = await lane();
  check("quick-minute: lane changes while paused don't count; after resuming they do", paused && l0 === 2 && l1 === 2 && l2 === 1, { paused, l0, l1, l2 });

  // the crash card: Esc leaves for the games page, Backspace goes back to the
  // mode menu (Change mode)
  await p.evaluate(() => __game.obstacles.push({ lane: __game.player.lane, y: 566, w: 44, h: 84, type: "car", color: "#bcc0c6", cx: __game.player.x, pending: false, merging: false, mergeDir: 0, mergeTo: -1, mergeStartY: 0, wc: 0 }));
  await p.waitForFunction(() => !__game.running && !!document.getElementById("btn-menu"), null, { timeout: 5000 });
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  const escLeft = p.leaves === 1 && (await p.evaluate(() => !!document.getElementById("btn-menu")));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const toModes = await p.evaluate(() => !!document.getElementById("m-day") && document.getElementById("overlay").classList.contains("show"));
  check("quick-minute: on the crash card Esc leaves, Backspace goes back to the mode menu", escLeft && toModes && p.leaves === 1, { escLeft, toModes, leaves: p.leaves });
  check("quick-minute: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();

  // the hint and the menu's rule name the keys with a keyboard; on a
  // touch-only device they say to tap the left or right side instead
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/quick-minute/");
    const t = await q.evaluate(() => ({ hint: document.querySelector(".hint").innerText.replace(/\s+/g, " "), rule: document.querySelector("#card .rules li").innerText.replace(/\s+/g, " ") }));
    const ok = label === "desktop"
      ? /^←→ or A \/ D to switch lanes · on mobile, tap/.test(t.hint) && /^←→ or A \/ D to change lanes \(tap left\/right on mobile\)/.test(t.rule)
      : t.hint === "tap the left or right side to switch lanes" && t.rule === "Tap left or right to change lanes.";
    check("quick-minute " + label + ": the hint and the menu " + (label === "desktop" ? "name the keys" : "say to tap left or right, no keys"), ok, t);
    await q.close();
    await c.close();
  }
};
