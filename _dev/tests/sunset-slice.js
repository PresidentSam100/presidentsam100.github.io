// Sunset Slice: once a Duel's bomb has gone off, the rest of that swipe cuts
// nothing — no points, no best — during the end beat.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/sunset-slice/");
  // a bomb and a peach that hang still, side by side; one swipe through both
  const geo = await p.evaluate(() => { SunsetSlice.start("duel"); SunsetSlice.hold(); SunsetSlice.spawn("bomb", 0.3, 0.5); SunsetSlice.spawn("peach", 0.7, 0.5); return { W: innerWidth, H: innerHeight }; });
  const y = geo.H * 0.5;
  await p.mouse.move(geo.W * 0.18, y); await p.mouse.down();
  await p.mouse.move(geo.W * 0.42, y, { steps: 3 });
  const mid = await p.evaluate(() => SunsetSlice.state());
  await p.mouse.move(geo.W * 0.82, y, { steps: 3 }); await p.mouse.up();
  const after = await p.evaluate(() => ({ s: SunsetSlice.state(), best: localStorage.getItem("sunsetslice_best_duel") }));
  await p.waitForFunction(() => SunsetSlice.state().state === "over", null, { timeout: 8000 });
  const msg = await p.evaluate(() => document.getElementById("over-msg").textContent);
  check("sunset-slice: after a Duel's bomb the rest of the swipe scores nothing",
    mid.state === "ending" && after.s.score === 0 && after.s.objs === 1 && after.best === null && /^0 points/.test(msg), { mid: mid.state, score: after.s.score, objs: after.s.objs, best: after.best, msg });
  check("sunset-slice: no page errors", p.errs.length === 0, p.errs);
  await ctx.close();
};
