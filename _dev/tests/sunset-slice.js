// Sunset Slice: once a Duel's bomb has gone off, the rest of that swipe cuts
// nothing — no points, no best — during the end beat. Modes on the pause card
// asks before throwing the run away.
// (The beat is stretched from 1.1s to 5s here: on a busy machine the swipe's
// mouse moves alone can outlast 1.1s, and a swipe after the beat proves nothing.)
const BEAT = ['finish("bomb", 1100);', 'finish("bomb", 5000);'];
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/sunset-slice/", { before: (pg) => lib.injectScript(pg, "games/sunset-slice/game.js", [BEAT]) });
  // a bomb and a peach that hang still, side by side; one swipe through both
  const geo = await p.evaluate(() => { SunsetSlice.start("duel"); SunsetSlice.hold(); SunsetSlice.spawn("bomb", 0.3, 0.5); SunsetSlice.spawn("peach", 0.7, 0.5); return { W: innerWidth, H: innerHeight }; });
  const y = geo.H * 0.5;
  await p.mouse.move(geo.W * 0.18, y); await p.mouse.down();
  await p.mouse.move(geo.W * 0.42, y, { steps: 3 });
  const mid = await p.evaluate(() => SunsetSlice.state());
  await p.mouse.move(geo.W * 0.82, y, { steps: 3 }); await p.mouse.up();
  const after = await p.evaluate(() => ({ s: SunsetSlice.state(), best: localStorage.getItem("sunsetslice_best_duel") }));
  await p.waitForFunction(() => SunsetSlice.state().state === "over", null, { timeout: 12000 });
  const msg = await p.evaluate(() => document.getElementById("over-msg").textContent);
  check("sunset-slice: after a Duel's bomb the rest of the swipe scores nothing",
    mid.state === "ending" && after.s.state === "ending" && after.s.score === 0 && after.s.objs === 1 && after.best === null && /^0 points/.test(msg),
    { mid: mid.state, after: after.s.state, score: after.s.score, objs: after.s.objs, best: after.best, msg });
  check("sunset-slice: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Modes on the pause card asks before throwing the run away; Esc on
  // the box leaves it paused on the card; Quit goes to the modes
  const q = await lib.open(ctx, base, "games/sunset-slice/");
  const look = () => q.evaluate(() => {
    const d = document.querySelector(".gs-dialog"), s = SunsetSlice.state();
    return { state: s.state, paused: s.paused, card: !document.getElementById("pause").hidden, dlg: d ? d.querySelector("h2").textContent : null,
      ok: d ? [...d.querySelectorAll("button")].map((b) => b.textContent.trim()).join(" | ") : null };
  });
  await q.evaluate(() => { SunsetSlice.start("calm"); SunsetSlice.hold(); });
  await q.keyboard.press("p"); await q.waitForTimeout(100);
  await q.click("#quit"); await q.waitForTimeout(150);
  const a = await look();
  await q.keyboard.press("Escape"); await q.waitForTimeout(250);
  const b = await look();
  if (b.card) { await q.click("#quit"); await q.waitForTimeout(150); await q.keyboard.press("Enter"); await q.waitForTimeout(250); }
  const c = await look();
  check("sunset-slice: Modes on the pause card asks \"Quit this game?\"; Esc keeps the run paused on the card; Quit goes to the modes",
    a.state === "play" && a.paused && a.dlg === "Quit this game?" && /Quit/.test(a.ok) &&
    b.state === "play" && b.paused && b.card && !b.dlg && q.leaves === 0 &&
    c.state === "menu" && !c.paused && !c.card && !c.dlg, { a, b, c, leaves: q.leaves });

  // ---- (guard) a run that's over goes back to the modes at once
  await q.evaluate(() => { SunsetSlice.start("lastlight"); SunsetSlice.hold(); SunsetSlice.setTime(0.01); });
  await q.waitForFunction(() => SunsetSlice.state().state === "over", null, { timeout: 8000 });
  await q.click("#to-menu"); await q.waitForTimeout(150);
  const d = await look();
  check("sunset-slice: Modes on the end screen goes at once, no question", d.state === "menu" && !d.dlg, d);
  check("sunset-slice (modes): no page errors", q.errs.length === 0, q.errs);
  await ctx.close();
};
