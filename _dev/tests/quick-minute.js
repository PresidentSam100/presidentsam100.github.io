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
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  const escLeft = p.leaves === 1 && (await p.evaluate(() => !!document.getElementById("btn-menu")));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const toModes = await p.evaluate(() => !!document.getElementById("m-day") && document.getElementById("overlay").classList.contains("show"));
  check("quick-minute: on the crash card Esc leaves, Backspace goes back to the mode menu", escLeft && toModes && p.leaves === 1, { escLeft, toModes, leaves: p.leaves });
  check("quick-minute: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();

  const { devices } = require("@playwright/test");

  // the driver's seat: the dashboard sits under the windscreen and both fit
  // on the screen (a phone's too, nothing wider than it); the speedometer's
  // needle rests at 0 and swings round with the MPH; night mode lights the
  // dials, and going back to the menu puts them out
  for (const [label, opts] of [["desktop", {}], ["phone", devices["iPhone 13"]], ["small phone", Object.assign({}, devices["iPhone 13"], { viewport: { width: 320, height: 568 } })]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/quick-minute/");
    const read = () => q.evaluate(() => {
      const r = (e) => e.getBoundingClientRect(), dash = document.getElementById("dash"), stage = document.getElementById("stage");
      const needle = dash && dash.querySelector(".needle"), sp = document.getElementById("value-speed");
      const m = needle ? new DOMMatrix(getComputedStyle(needle).transform) : null;
      const card = document.getElementById("card"), ov = document.getElementById("overlay");
      return {
        // the card over the windscreen: all of it inside (its top isn't cut off), nothing to scroll
        card: ov.classList.contains("show") ? { top: Math.round(r(card).top - r(stage).top), gap: Math.round(r(stage).bottom - r(card).bottom), scrolls: ov.scrollHeight - ov.clientHeight } : null,
        under: !!dash && r(dash).top >= r(stage).bottom - 1, fits: !!dash && r(dash).bottom <= innerHeight + 1, over: document.documentElement.scrollWidth - innerWidth,
        mph: +sp.textContent, set: +sp.parentNode.style.getPropertyValue("--mph"), angle: m ? Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI) : null,
        night: document.body.classList.contains("night"),
      };
    });
    const menu = await read();
    await q.evaluate(() => __game.start("night"));
    await q.waitForFunction(() => +document.getElementById("value-speed").textContent >= 60, null, { timeout: 8000 });
    await q.evaluate(() => new Promise((r) => setTimeout(r, 500)));   // (the needle eases to its place)
    const drive = await read();
    await q.evaluate(() => __game.showMenu && __game.showMenu());
    const back = await read();
    check("quick-minute " + label + ": the dashboard is under the windscreen and on the screen, nothing wider than it",
      menu.under && menu.fits && menu.over <= 0 && drive.under && drive.fits && drive.over <= 0, { menu, drive });
    check("quick-minute " + label + ": the needle rests at 0 and swings round with the MPH",
      menu.angle === -135 && drive.mph >= 60 && drive.set === drive.mph && drive.angle > -70 && drive.angle < 100, { menu, drive });
    check("quick-minute " + label + ": night mode lights the dials, the menu puts them out", !menu.night && drive.night && !back.night, { menu: menu.night, drive: drive.night, back: back.night });
    check("quick-minute " + label + ": the whole menu card is inside the windscreen (heading and both switches showing, nothing to scroll)",
      !!menu.card && menu.card.top >= 0 && menu.card.gap >= 0 && menu.card.scrolls <= 0, menu.card);
    check("quick-minute " + label + " (dashboard): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }

  // the hint and the menu's rule name the keys with a keyboard; on a
  // touch-only device they say to tap the left or right side instead
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
