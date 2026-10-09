// Crazy Ohio: with storage blocked the game still runs; a run whose countdown
// ends with the tab hidden or the window unfocused starts paused, its clock
// still full; the lanes' F G H J labels hide on touch-only devices.
const BLOCK_STORAGE = (pg) => pg.addInitScript(() => {
  Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } });
});

module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  const ctx = await lib.newContext(browser);
  const card = (p) => p.evaluate(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; });
  const shown = (p) => p.evaluate(() => ["setup", "play", "result"].find((id) => !document.getElementById(id).hidden));

  let p = await lib.open(ctx, base, "games/crazy-ohio/", { before: BLOCK_STORAGE });
  const setup = await p.evaluate(() => document.getElementById("setupBest").textContent);
  await p.click("#startBtn"); await p.waitForTimeout(100);
  const sec = await shown(p);
  check("crazy-ohio: with storage blocked the game still runs (no best shown, the countdown starts)", p.errs.length === 0 && /No record/.test(setup) && sec === "play", { errs: p.errs, setup, sec });
  await p.close();

  // the window loses focus during the countdown (as a tab switch would leave it)
  p = await lib.open(ctx, base, "games/crazy-ohio/");
  // Start and lose focus in one step (on a busy machine the 1.5 s countdown can
  // be over before a separate step lands), then wait for the run to begin, paused
  await p.evaluate(() => { document.getElementById("startBtn").click(); document.hasFocus = () => false; });
  await p.waitForFunction(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; }, null, { timeout: 15000 }).catch(() => {});
  const away = { paused: await card(p), time: await p.evaluate(() => document.getElementById("vTime").textContent) };
  await p.evaluate(() => { delete document.hasFocus; });
  await p.keyboard.press("Escape");
  // resumed, the clock runs down from full (polled: slower on a busy machine)
  await p.waitForFunction(() => Number(document.getElementById("vTime").textContent) < 30, null, { timeout: 10000 }).catch(() => {});
  const back = { paused: await card(p), time: await p.evaluate(() => document.getElementById("vTime").textContent) };
  check("crazy-ohio: a run that begins with the window away starts paused, its clock full; resuming runs it",
    away.paused && away.time === "30.0" && !back.paused && Number(back.time) < 30, { away, back });
  check("crazy-ohio: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();

  // the lane labels name keys: shown with a keyboard, hidden on touch-only devices
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/crazy-ohio/");
    await q.evaluate(() => document.getElementById("startBtn").click()); await q.waitForTimeout(100);
    const labels = await q.evaluate(() => [...document.querySelectorAll(".lane .key")].map((k) => k.innerText.trim()).join(""));
    const want = label === "desktop" ? "FGHJ" : "";
    check("crazy-ohio " + label + ": the lanes' key labels " + (want ? "show" : "hide"), labels === want, labels);
    await q.close();
    await c.close();
  }
};
