// Quick Minute: lane changes while paused don't count; after resuming they do.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/quick-minute/");
  const card = () => p.evaluate(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; });
  const lane = () => p.evaluate(() => __game.player.lane);
  // a car put right in the player's way: the run ends, the crash card comes up
  const crash = async (pg) => {
    await pg.evaluate(() => __game.obstacles.push({ lane: __game.player.lane, y: 566, w: 44, h: 84, type: "car", color: "#bcc0c6", cx: __game.player.x, pending: false, merging: false, mergeDir: 0, mergeTo: -1, mergeStartY: 0, wc: 0 }));
    await pg.waitForFunction(() => !__game.running && !!document.getElementById("btn-menu"), null, { timeout: 5000 });
  };

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
  await crash(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  const escLeft = p.leaves === 1 && (await p.evaluate(() => !!document.getElementById("btn-menu")));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(100);
  const toModes = await p.evaluate(() => !!document.getElementById("m-day") && document.getElementById("overlay").classList.contains("show"));
  check("quick-minute: on the crash card Esc leaves, Backspace goes back to the mode menu", escLeft && toModes && p.leaves === 1, { escLeft, toModes, leaves: p.leaves });

  // Change mode rebuilds the card: the switches wear their keys as the script
  // ends, before a frame can be drawn (they used to come a frame or two late)
  await p.evaluate(() => __game.start("day")); await p.waitForTimeout(100);
  await crash(p);
  const capsBack = await p.evaluate(async () => {
    document.getElementById("btn-menu").click();
    await Promise.resolve();
    return ["#m-day .t", "#m-night .t"].map((s) => { const e = document.querySelector(s); return e && e.getAttribute("data-gs-key"); });
  });
  check("quick-minute: Change mode brings the menu back with its keycaps on, with no frame in between",
    capsBack.every(Boolean) && capsBack.indexOf("Space or Enter") >= 0, capsBack);
  check("quick-minute: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();

  const { devices } = require("@playwright/test");

  // the card over the windscreen: all of it inside (its top isn't cut off),
  // nothing to scroll, and what shows on it: how many of the three how-to-play
  // rules, the two switches and their bests, its name, its buttons
  const cardOf = (pg) => pg.evaluate(() => {
    const r = (e) => e.getBoundingClientRect(), stage = document.getElementById("stage"), card = document.getElementById("card"), ov = document.getElementById("overlay");
    if (!ov.classList.contains("show")) return null;
    const shown = (sel) => Array.from(card.querySelectorAll(sel)).filter((e) => r(e).height > 0);
    return {
      top: Math.round(r(card).top - r(stage).top), gap: Math.round(r(stage).bottom - r(card).bottom), scrolls: ov.scrollHeight - ov.clientHeight,
      rules: shown(".rules li").length, switches: shown(".mode-btn").length,
      bests: shown(".mode-btn .b").filter((b) => /best \d/.test(b.textContent)).length,
      name: shown("h2.nm").length === 1, buttons: shown(".btn").length,
    };
  });
  const inside = (c) => !!c && c.top >= 0 && c.gap >= 0 && c.scrolls <= 0;
  const whole = (c) => inside(c) && c.rules === 3 && c.switches === 2;

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
      return {
        under: !!dash && r(dash).top >= r(stage).bottom - 1, fits: !!dash && r(dash).bottom <= innerHeight + 1, over: document.documentElement.scrollWidth - innerWidth,
        mph: +sp.textContent, set: +sp.parentNode.style.getPropertyValue("--mph"), angle: m ? Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI) : null,
        night: document.body.classList.contains("night"),
      };
    });
    const menu = await read(), menuCard = await cardOf(q);
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
    check("quick-minute " + label + ": the whole menu card is inside the windscreen (all three rules and both switches showing, nothing to scroll)",
      whole(menuCard), menuCard);
    check("quick-minute " + label + " (dashboard): no page errors", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }

  // short screens: a phone's browser bars leave about 550 px, and a laptop's
  // window is often 600 to 700 px tall (the desktop above is 900). The
  // windscreen is at or near its smallest there, and the menu still shows
  // everything on it, for a player with a best saved in both modes (the
  // tallest card): the three rules, both switches and their bests, and on a
  // desktop its name. Nothing is left out or cut off to make it fit. The
  // crash card is whole too.
  const bests = (pg) => pg.addInitScript(() => { try { localStorage.setItem("rushhour_best_day", "12345"); localStorage.setItem("rushhour_best_night", "23456"); } catch (e) {} });
  for (const [w, h, phone] of [[375, 553, true], [360, 560, true], [320, 568, true], [320, 480, true], [320, 664, true], [1366, 657, false], [1280, 600, false], [1280, 500, false]]) {
    const c = await lib.newContext(browser, Object.assign({}, phone ? devices["iPhone 13"] : {}, { viewport: { width: w, height: h } }));
    const q = await lib.open(c, base, "games/quick-minute/", { before: bests });
    const label = "quick-minute, a " + w + " x " + h + (phone ? " phone" : " window");
    const card = await cardOf(q);
    check(label + ": the menu keeps all three rules, both switches and their bests" + (phone ? "" : ", and its name") + ", whole inside the windscreen",
      whole(card) && card.bests === 2 && (phone || card.name), card);
    await q.evaluate(() => __game.start("day")); await q.waitForTimeout(120);
    await crash(q);
    const over = await cardOf(q);
    check(label + ": the crash card is whole inside the windscreen, both its buttons showing", inside(over) && over.buttons === 2, over);
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
