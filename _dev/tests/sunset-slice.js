// Sunset Slice: once a Duel's bomb has gone off, the rest of that swipe cuts
// nothing (no points, no best) during the end beat. Modes on the pause card
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

  // ---- short screens: nothing is left out to make the menu fit. With saved
  // bests on it, the how-to line and each mode's description are shown, all of
  // it is inside the window, and none of it lies over the three targets in the
  // middle (or the names under them): on a small phone, a phone on its side,
  // ---- the pause card has Restart between Resume and Modes: R presses it, it
  // asks first (any other key keeps the run, still paused), and Enter starts
  // the same mode again from 0
  {
    const c = await lib.newContext(browser);
    const s = await lib.open(c, base, "games/sunset-slice/");
    await s.evaluate(() => { SunsetSlice.start("calm"); SunsetSlice.hold(); SunsetSlice.spawn("peach", 0.5, 0.5); });
    const W = await s.evaluate(() => innerWidth), H = await s.evaluate(() => innerHeight);
    await s.mouse.move(W * 0.3, H * 0.5); await s.mouse.down(); await s.mouse.move(W * 0.7, H * 0.5, { steps: 4 }); await s.mouse.up();
    await s.waitForFunction(() => SunsetSlice.state().score > 0, null, { timeout: 5000 }).catch(() => {});
    await s.keyboard.press("p"); await s.waitForTimeout(150);
    const card = await s.evaluate(() => ({ up: !document.getElementById("pause").hidden, btns: [...document.querySelectorAll("#pause button")].map((b) => b.textContent.replace(/\s+/g, " ").trim() + (b.getAttribute("data-gs-key") ? " " + b.getAttribute("data-gs-key") : "")).join(" | ") }));
    await s.keyboard.press("r"); await s.waitForSelector(".gs-dialog", { timeout: 3000 }).catch(() => {});
    const ask = await s.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null);
    await s.keyboard.press("x"); await s.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 3000 }).catch(() => {});
    const kept = await s.evaluate(() => { const t = SunsetSlice.state(); return { paused: t.paused, score: t.score, up: !document.getElementById("pause").hidden }; });
    await s.keyboard.press("r"); await s.waitForSelector(".gs-dialog", { timeout: 3000 }).catch(() => {});
    await s.keyboard.press("Enter"); await s.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 3000 }).catch(() => {});
    const again = await s.evaluate(() => { const t = SunsetSlice.state(); return { state: t.state, mode: t.mode, score: t.score, paused: t.paused, up: !document.getElementById("pause").hidden }; });
    check("sunset-slice: the pause card has Restart (R) between Resume and Modes; it asks 'Start over?', any other key keeps the run paused, and Enter starts the same mode again from 0",
      card.up && /^Resume P \| Restart R \| Modes ⌫$/.test(card.btns) && ask === "Start over?" && kept.paused && kept.up && kept.score > 0 &&
      again.state === "play" && again.mode === "calm" && again.score === 0 && !again.paused && !again.up, { card, ask, kept, again });
    check("sunset-slice (restart): no page errors", s.errs.length === 0, s.errs);
    await s.close();
    await c.close();
  }

  // ---- with keys, the menu's keys are on its targets (drawn by their names)
  // and one box shows below them: the picked mode's, Space or Enter on it.
  // 1 2 3 pick, and so does the mouse over a target
  {
    const c = await lib.newContext(browser);
    const s = await lib.open(c, base, "games/sunset-slice/", { before: (pg) => pg.addInitScript(() => { try { localStorage.removeItem("sunsetslice_last"); } catch (e) {} }) });
    await s.waitForTimeout(300);
    const box = () => s.evaluate(() => { const v = [...document.querySelectorAll(".modes button[data-mode]")].filter((b) => b.getClientRects().length);
      return { shown: v.map((b) => b.dataset.mode).join(), cap: v[0] && v[0].querySelector("b").getAttribute("data-gs-key"), inside: v[0] && (() => { const b = v[0].getBoundingClientRect(), n = v[0].querySelector("b").getBoundingClientRect(); return n.right <= b.right && n.left >= b.left; })() }; });
    const b0 = await box();
    await s.keyboard.press("3"); const b3 = await box();
    const t = await s.evaluate(() => { const R = SunsetSlice.state().R; return { x: innerWidth * 0.28, y: innerHeight * 0.5, R }; });
    await s.mouse.move(t.x, t.y); await s.waitForTimeout(150); const bm = await box();
    const keys = await s.evaluate(() => { const said = []; const real = GameShell.drawKeys; GameShell.drawKeys = function (ctx, str) { said.push(str); return real.apply(this, arguments); };
      return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { GameShell.drawKeys = real; r([...new Set(said)].join(" | ")); }))); });
    check("sunset-slice: with keys one box shows, the picked mode's (Space or Enter inside it); 3 picks Calm, the mouse over the Duel target picks Duel; the targets' names carry 1 2 3",
      b0.shown.split(",").length === 1 && b0.cap === "Space or Enter" && b0.inside && b3.shown === "calm" && bm.shown === "duel" && /Duel \[1\]/.test(keys) && /Last Light \[2\]/.test(keys) && /Calm \[3\]/.test(keys),
      { b0, b3, bm, keys });
    check("sunset-slice (menu keys): no page errors", s.errs.length === 0, s.errs);
    await s.close();
    await c.close();
  }

  // ---- paused right after a cut, the halves (and the ink, the gleam, the
  // score text) hold where they were instead of fading out under the pause
  // card, or under "Leave this game?"; resumed, they carry on
  {
    const c = await lib.newContext(browser);
    const s = await lib.open(c, base, "games/sunset-slice/");
    await s.evaluate(() => { SunsetSlice.start("calm"); SunsetSlice.hold(); SunsetSlice.spawn("peach", 0.5, 0.5); });
    const W = await s.evaluate(() => innerWidth), H = await s.evaluate(() => innerHeight);
    await s.mouse.move(W * 0.3, H * 0.5); await s.mouse.down(); await s.mouse.move(W * 0.7, H * 0.5, { steps: 4 }); await s.mouse.up();
    await s.keyboard.press("p");
    const look = () => s.evaluate(() => { const t = SunsetSlice.state(); return { halves: t.halves, clock: Math.round(t.clock), paused: t.paused }; });
    const p0 = await look();
    await s.evaluate(() => new Promise((r) => setTimeout(r, 1800)));   // (longer than a half takes to fade)
    const p1 = await look();
    await s.keyboard.press("p"); await s.keyboard.press("Escape"); await s.waitForSelector(".gs-dialog", { timeout: 3000 }).catch(() => {});
    const l0 = await look();
    await s.evaluate(() => new Promise((r) => setTimeout(r, 1800)));
    const l1 = await look();
    await s.keyboard.press("Enter"); await s.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 3000 }).catch(() => {});
    await s.evaluate(() => new Promise((r) => setTimeout(r, 300)));
    const back = await look();
    check("sunset-slice: paused right after a cut (by P, or under 'Leave this game?'), the halves hold still, half-faded, on a clock that stops; resumed, it runs on",
      p0.paused && p0.halves === 2 && p1.halves === 2 && p1.clock === p0.clock && l0.paused && l1.halves === 2 && l1.clock === l0.clock && !back.paused && back.clock > l1.clock,
      { p0, p1, l0, l1, back });
    check("sunset-slice (paused cut): no page errors", s.errs.length === 0, s.errs);
    await s.close();
    await c.close();
  }

  // and a short laptop window ([wide, high, touch])
  const SHORT = [[320, 480, true], [375, 553, true], [360, 560, true], [320, 568, true], [568, 320, true], [667, 331, true], [844, 390, true], [915, 412, true],
    [1024, 480, false], [1280, 500, false], [1366, 520, false], [1366, 580, false], [1280, 600, false]];
  const shortBad = [];
  for (const [w, h, touch] of SHORT) {
    const c = await lib.newContext(browser, touch ? { viewport: { width: w, height: h }, hasTouch: true, isMobile: true } : { viewport: { width: w, height: h } });
    const s = await lib.open(c, base, "games/sunset-slice/", { before: (pg) => pg.addInitScript(() => { try { ["duel", "lastlight", "calm"].forEach((k) => localStorage.setItem("sunsetslice_best_" + k, "1234")); } catch (e) {} }) });
    await s.waitForTimeout(200);
    const m = await s.evaluate(() => {
      const menu = document.getElementById("menu"), r = (e) => e.getBoundingClientRect(), W = innerWidth, H = innerHeight, R = SunsetSlice.state().R;
      // the targets hang at mid-height, bobbing a little, their names under them
      const top = H * 0.5 - R * 1.2, bot = H * 0.5 + R * 1.75 + Math.max(15, R * 0.42) * 0.45 + H * 0.015;
      const parts = [...menu.querySelectorAll("h1, .tag, .how, .modes button, .bests")].filter((e) => e.getClientRects().length), out = [], over = [];
      parts.forEach((e) => { const b = r(e), name = e.className || e.tagName; if (b.left < -0.5 || b.right > W + 0.5 || b.top < -0.5 || b.bottom > H + 0.5) out.push(name); if (Math.min(b.bottom, bot) - Math.max(b.top, top) > 0.5) over.push(name); });
      return { how: r(menu.querySelector(".how")).height > 8, small: (() => { const sm = [...menu.querySelectorAll(".modes small")], shown = sm.filter((e) => r(e).height > 8);
        return matchMedia("(hover: none)").matches ? shown.length === 3 : shown.length === 1 && !!shown[0].closest("[data-gs-pick]"); })(), bests: /1234/.test(document.getElementById("bests").textContent), out, over };
    });
    if (!(m.how && m.small && m.bests && m.out.length === 0 && m.over.length === 0)) shortBad.push(w + "x" + h + (touch ? " touch " : " mouse ") + JSON.stringify(m));
    if (s.errs.length) shortBad.push(w + "x" + h + " errors " + s.errs.join("; "));
    await s.close(); await c.close();
  }
  check("sunset-slice: on short screens the menu leaves nothing out to fit: the how-to line and the modes' descriptions are shown (all three on a touch screen; with keys the picked one, the others a key away), inside the window and clear of the targets", shortBad.length === 0, shortBad);
};
