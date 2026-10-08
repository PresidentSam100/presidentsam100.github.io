// Departures: while paused the desk is shut, so a name typed then doesn't
// board, during the pause or after it; on resume the box is open and focused.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/departures/");
  const card = () => p.evaluate(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; });
  const desk = () => p.evaluate(() => ({ found: Departures.found(), box: document.getElementById("answer").value, focused: document.activeElement === document.getElementById("answer") }));

  await p.evaluate(() => Departures.start("continent", "OC")); await p.waitForTimeout(150);
  await p.keyboard.press("Escape"); await p.waitForTimeout(80);
  const paused = await card();
  await p.keyboard.type("Australia"); await p.keyboard.press("Enter"); await p.waitForTimeout(80);
  const during = await desk();
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const after = await desk();
  await p.keyboard.type("Fiji"); await p.waitForTimeout(80);
  const typed = await desk();
  check("departures: names typed while paused don't board, then or after resuming; the box is focused again",
    paused && during.found === 0 && after.found === 0 && after.box === "" && after.focused && !(await card()) && typed.found === 1,
    { paused, during, after, typed });
  check("departures: no page errors", p.errs.length === 0, p.errs);

  // A run's time is when its last name boarded: the save made then stands,
  // however the run ends (Final call, or waiting out the bell), and a tie on
  // names goes to the faster last departure. (Oceania: a 1:30 clock. The
  // same page, fresh runs: one page load fewer on a busy machine.)
  {
    const q = p;
    const best = () => q.evaluate(() => JSON.parse(localStorage.getItem("departures_best") || "{}").OC || null);
    const stats = () => q.evaluate(() => document.getElementById("over-stats").textContent);
    // boarded 10 s in, Final call 50 s later
    await q.evaluate(() => { localStorage.removeItem("departures_best"); Departures.start("continent", "OC"); Departures.setTime(80); Departures.enter("Australia"); Departures.setTime(30); Departures.giveUp(); });
    const call = { best: await best(), stats: await stats() };
    // boarded 10 s in, then the bell
    await q.evaluate(() => { localStorage.removeItem("departures_best"); Departures.start("continent", "OC"); Departures.setTime(80); Departures.enter("Australia"); Departures.setTime(0.1); });
    await q.waitForFunction(() => Departures.state() === "over", null, { timeout: 3000 });
    const bell = await best();
    check("departures: a run's time is when its last name boarded, whether it ends on Final call or the bell",
      !!call.best && call.best.n === 1 && call.best.t === 10000 && /0:10/.test(call.stats) && !!bell && bell.n === 1 && bell.t === 10000, { call, bell });

    // the same one name against a 0:20 record, boarded at 0:15
    await q.evaluate(() => { localStorage.setItem("departures_best", '{"OC":{"n":1,"t":20000}}'); Departures.start("continent", "OC"); Departures.setTime(75); Departures.enter("Australia"); Departures.setTime(10); Departures.giveUp(); });
    const faster = { best: await best(), stats: await stats() };
    check("departures: a tie on names goes to the faster last departure", faster.best.n === 1 && faster.best.t === 15000 && /new record/.test(faster.stats), faster);

    // a slower tie leaves the record be; nor does the end overwrite a better
    // time saved meanwhile (another tab)
    await q.evaluate(() => { localStorage.setItem("departures_best", '{"OC":{"n":1,"t":5000}}'); Departures.start("continent", "OC"); Departures.setTime(75); Departures.enter("Australia"); Departures.setTime(10); Departures.giveUp(); });
    const slower = await best();
    await q.evaluate(() => { localStorage.removeItem("departures_best"); Departures.start("continent", "OC"); Departures.setTime(80); Departures.enter("Australia");
      localStorage.setItem("departures_best", '{"OC":{"n":1,"t":5000}}'); Departures.setTime(30); Departures.giveUp(); });
    const kept = await best();
    check("departures: the end of a run never makes a saved best's time worse", slower.t === 5000 && kept.t === 5000, { slower, kept });
    check("departures timing: no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }
  await ctx.close();

  // the menu's and end card's key shortcuts (1, 2, N, C, Enter) need a
  // keyboard: they show on a desktop and hide on a touch-only device. (Enter
  // in the typing hints stays: a phone's on-screen keyboard has it.)
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c = await lib.newContext(browser, opts);
    const q = await lib.open(c, base, "games/departures/");
    const seen = (sel) => q.evaluate((s) => [...document.querySelectorAll(s)].map((k) => k.getClientRects().length > 0), sel);
    const menu = await seen("#pick-mode kbd, #pick-target kbd, #play kbd"), how = await seen("#menu .how kbd");
    await q.evaluate(() => { Departures.start("continent", "OC"); Departures.giveUp(); }); await q.waitForTimeout(100);
    const again = await seen("#again kbd");
    const want = label === "desktop";
    check("departures " + label + ": the menu and end-card key shortcuts " + (want ? "show" : "hide") + "; the typing hint's Enter stays",
      menu.length === 5 && menu.every((v) => v === want) && again.length === 1 && again[0] === want && how.every(Boolean), { menu, again, how });
    await q.close();
    await c.close();
  }
};
