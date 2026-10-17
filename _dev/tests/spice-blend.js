// Spice Blend: the menu takes 1 and 2 (shown on them, the pick kept) and
// Space or Enter begins; the weights are right (a brass weight for each spice
// in its bowl, a wooden one for each right spice elsewhere, every bowl of the
// blend counted once); the spices take 1 to 6 (shown on them), Backspace takes
// the last back and Enter tastes a full row (not a part-filled one); a full
// row's weights' place becomes a Taste button; naming the blend wins, keeps
// the fewest tastes and the record, and running out of tastes shows the blend;
// the end card waits a moment for Space, then pours another; paused, keys pour
// nothing; with Visual FX off the weights land without moving; on a phone a
// tap on a spice fills the next bowl.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/spice-blend/", opts);
  const done = async (p, what) => { check("spice-blend " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const wait = (p, ms) => p.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);

  // ---- the weights
  let p = await open();
  const sc = await p.evaluate(() => {
    const s = SpiceBlend.score;
    return [s([0, 1, 2, 3], [0, 1, 2, 3]), s([0, 1, 2, 3], [3, 2, 1, 0]), s([0, 0, 1, 1], [0, 1, 0, 1]), s([0, 0, 0, 1], [0, 0, 1, 1]), s([2, 2, 3, 4], [2, 5, 2, 2]), s([0, 1, 2, 3], [4, 4, 5, 5])]
      .map((r) => r.right + "/" + r.near).join(" ");
  });
  check("spice-blend: a brass weight for each spice in its bowl, a wooden one for each right spice in another, every bowl counted once", sc === "4/0 0/4 2/2 3/0 1/1 0/0", sc);

  // ---- the menu and the keys
  const caps = await p.evaluate(() => [...document.querySelectorAll("#pick-mode button, #play")].map((b) => (b.querySelector("[data-gs-key]") || b).getAttribute("data-gs-key")));
  await p.keyboard.press("2"); await p.waitForTimeout(80);
  const kept = await p.evaluate(() => localStorage.getItem("spiceblend_mode"));
  await p.keyboard.press("1"); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const began = await p.evaluate(() => ({ state: SpiceBlend.state(), mode: SpiceBlend.mode(), spices: [...document.querySelectorAll("#palette .spice")].map((b) => b.getAttribute("data-gs-key")).join(""), bowls: document.querySelectorAll(".row.now .bowl").length }));
  check("spice-blend: the modes wear 1 and 2 and the start Space or Enter; 2 picks the bazaar (kept); Enter pours the stall's blend, its six spices wearing 1 to 6, four bowls a row",
    caps.join() === "1,2,Space or Enter" && kept === "bazaar" && began.state === "play" && began.mode === "stall" && began.spices === "123456" && began.bowls === 4, { caps, kept, began });
  await p.evaluate(() => SpiceBlend.setBlend([0, 1, 2, 3]));
  await p.keyboard.press("1"); await p.keyboard.press("2"); await p.keyboard.press("3"); await p.waitForTimeout(60);
  await p.keyboard.press("Enter"); await p.waitForTimeout(60);
  const part = await p.evaluate(() => ({ cur: SpiceBlend.cur().join(), rows: SpiceBlend.rows().length }));
  await p.keyboard.press("Backspace"); await p.waitForTimeout(60);
  const back = await p.evaluate(() => SpiceBlend.cur().join());
  await p.keyboard.press("6"); await p.keyboard.press("4"); await p.waitForTimeout(60);
  const tasteBtn = await p.evaluate(() => !!document.querySelector(".row.now .taste-here"));
  await p.keyboard.press("Enter"); await p.waitForTimeout(100);
  const tasted = await p.evaluate(() => SpiceBlend.rows());
  check("spice-blend: 1 2 3 pour three bowls; Enter doesn't taste a part-filled row; Backspace takes the last back; a full row grows a Taste button, and Enter tastes it (three brass weights here)",
    part.cur === "0,1,2" && part.rows === 0 && back === "0,1" && tasteBtn && tasted.length === 1 && tasted[0].guess.join() === "0,1,5,3" && tasted[0].right === 3 && tasted[0].near === 0, { part, back, tasteBtn, tasted });
  // ---- paused, keys pour nothing
  await p.keyboard.press("p"); await p.waitForTimeout(120);
  await p.keyboard.press("1"); await p.waitForTimeout(60);
  const paused = await p.evaluate(() => SpiceBlend.cur().length);
  await p.keyboard.press("p"); await p.waitForTimeout(120);
  check("spice-blend: paused, a number key pours nothing", paused === 0, paused);
  // ---- naming the blend wins; the fewest tastes and the record are kept; Space waits, then another
  const win = await p.evaluate(() => {
    localStorage.removeItem("spiceblend_best_stall"); localStorage.removeItem("spiceblend_record_stall");
    SpiceBlend.start("stall"); SpiceBlend.setBlend([2, 2, 5, 0]);
    [5, 5, 5, 5].forEach((s) => SpiceBlend.add(s)); SpiceBlend.taste();
    [2, 2, 5, 0].forEach((s) => SpiceBlend.add(s)); SpiceBlend.taste();
    return { state: SpiceBlend.state(), title: document.getElementById("over-title").textContent, msg: document.getElementById("over-msg").textContent, best: localStorage.getItem("spiceblend_best_stall"), rec: localStorage.getItem("spiceblend_record_stall"), code: document.querySelectorAll("#over-code .bowl").length };
  });
  await p.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true })));
  const early = await p.evaluate(() => SpiceBlend.state());
  await wait(p, 900);
  await p.keyboard.press("Space"); await p.waitForTimeout(120);
  const again = await p.evaluate(() => ({ state: SpiceBlend.state(), rows: SpiceBlend.rows().length }));
  check("spice-blend: naming the blend in two tastes wins, the card showing the blend, keeping 2 as the fewest tastes and a win in the record; Space waits a moment, then pours another",
    win.state === "over" && win.title === "That's the blend" && win.msg === "2 tastes" && win.best === "2" && JSON.parse(win.rec).w === 1 && win.code === 4 && early === "over" && again.state === "play" && again.rows === 0, { win, early, again });
  // ...and ten wrong tastes lose, showing it
  const lose = await p.evaluate(() => {
    SpiceBlend.setBlend([0, 0, 0, 0]);
    for (let t = 0; t < 10; t++) { [1, 1, 1, 1].forEach((s) => SpiceBlend.add(s)); SpiceBlend.taste(); }
    return { state: SpiceBlend.state(), title: document.getElementById("over-title").textContent, rec: localStorage.getItem("spiceblend_record_stall"), stats: document.getElementById("over-stats").textContent };
  });
  check("spice-blend: ten tastes without the blend lose, the card showing the blend and a loss in the record", lose.state === "over" && lose.title === "The blend was" && JSON.parse(lose.rec).l === 1 && /saffron · saffron · saffron · saffron/.test(lose.stats), lose);
  await wait(p, 900);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(120);
  check("spice-blend: Backspace on the end card goes to the menu", (await p.evaluate(() => SpiceBlend.state())) === "menu", null);
  await done(p, "play");

  // ---- Visual FX off: the weights land without moving
  const anim = {};
  for (const off of [false, true]) {
    const q = await open(null, { before: (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:spice-blend", off ? "1" : "0"); } catch (e) {} }, off) });
    anim[off ? "off" : "on"] = await q.evaluate(() => { SpiceBlend.start("stall"); SpiceBlend.setBlend([0, 1, 2, 3]); [0, 2, 4, 4].forEach((s) => SpiceBlend.add(s)); SpiceBlend.taste(); const w = document.querySelector(".weights i.brass"); return getComputedStyle(w).animationName; });
    await done(q, "FX " + (off ? "off" : "on"));
  }
  check("spice-blend: with Visual FX on the weights drop onto the counter; with it off they're just there", anim.on === "sb-weigh" && anim.off === "none", anim);

  // ---- on a phone: a tap on a spice fills the next bowl
  {
    const { devices } = require("@playwright/test");
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await open(c);
    await q.evaluate(() => SpiceBlend.start("stall"));
    const r = await q.evaluate(() => { const e = document.querySelectorAll("#palette .spice")[2].getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
    await q.touchscreen.tap(r.x, r.y); await q.waitForTimeout(120);
    check("spice-blend, phone: a tap on a spice fills the next bowl", (await q.evaluate(() => SpiceBlend.cur().join())) === "2", null);
    await done(q, "phone");
    await c.close();
  }
  await ctx.close();
};
