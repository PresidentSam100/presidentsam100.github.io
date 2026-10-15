// Passport's keyboard: S shares, M / V and [ / ] reach the corner buttons (but
// not while typing an answer), Backspace goes back to Passport's menu, Esc
// leaves for the games page (asking first mid-run, the run paused under the
// box), the ⏸ button pauses any run (a tour and a Visa Run as well as a dash,
// the flag and its question hidden), and a typed run that ends leaves the
// keys working. Enter on a focused
// button is that button's own press: a mode is picked, Modes goes to the modes.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser, { permissions: ["clipboard-read", "clipboard-write"] });
  const st = (p) => p.evaluate(() => ({ m: MUTE_ON(), f: RM_ON() }));

  let p = await lib.open(ctx, base, "games/passport/");
  const lab = await p.evaluate(() => ({
    keys: [...document.querySelectorAll("#menu p, #menu .keys")].map((e) => e.textContent).filter((t) => /sound|visual FX|Esc\b/i.test(t)).join(" | "),
    mt: document.querySelector(".mute-toggle").title, mk: document.querySelector(".mute-toggle").getAttribute("aria-keyshortcuts"),
    ft: document.querySelector(".rm-toggle").title, fk: document.querySelector(".rm-toggle").getAttribute("aria-keyshortcuts"),
    bt: document.querySelector(".nav-back-games").title,
  }));
  check("passport: the menu has no line of keys for sound, Visual FX or Esc; the corner buttons name them, as in the other games",
    lab.keys === "" && /M or \[$/.test(lab.mt) && lab.mk === "M [" && /V or \]$/.test(lab.ft) && lab.fk === "V ]" && /Esc/.test(lab.bt), lab);

  const m0 = await st(p); await p.keyboard.press("m"); const m1 = await st(p); await p.keyboard.press("M"); const m2 = await st(p);
  await p.keyboard.press("v"); const m3 = await st(p); await p.keyboard.press("v");
  check("passport menu: M toggles sound, V toggles FX", m1.m === !m0.m && m2.m === m0.m && m3.f === !m0.f, { m0, m1, m2, m3 });

  await p.click(".mute-toggle");
  const clickedMute = (await st(p)).m;
  await p.keyboard.press("Enter");
  const started = await p.evaluate(() => ({ s: Passport.state(), m: MUTE_ON() }));
  check("passport: Enter after clicking the sound button starts the run without re-toggling it", started.s === "ask" && started.m === clickedMute, started);
  await p.click(".mute-toggle");
  await p.keyboard.press("Backspace");
  check("passport: Backspace mid-tour returns to the menu (and doesn't leave)", (await p.evaluate(() => Passport.state())) === "menu" && p.leaves === 0, p.leaves);

  // typed mode: letters belong to the answer, [ still mutes
  await p.keyboard.press("y"); await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === "answer");
  const t0 = await st(p);
  await p.keyboard.type("mvsMVS");
  const t1 = await p.evaluate(() => ({ m: MUTE_ON(), f: RM_ON(), v: document.getElementById("answer").value }));
  await p.keyboard.press("BracketLeft");
  const t2 = await p.evaluate(() => ({ m: MUTE_ON(), v: document.getElementById("answer").value }));
  await p.keyboard.press("BracketLeft");
  check("passport typed: letters go in the answer, [ mutes without typing", t1.m === t0.m && t1.f === t0.f && t1.v === "mvsMVS" && t2.m === !t1.m && t2.v === "mvsMVS", { t0, t1, t2 });
  // in the answer box Backspace deletes (and P would be a letter); the ⏸
  // button pauses the tour, as it does every run (the flag hidden, the box
  // shut), and P resumes with the box back in hand; Esc leaves (nothing
  // answered yet: at once)
  await p.keyboard.press("Backspace");
  const bs = await p.evaluate(() => ({ s: Passport.state(), v: document.getElementById("answer").value }));
  await p.click(".gs-pause-btn"); await p.waitForTimeout(100);
  const tp = await p.evaluate(() => ({ card: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, flag: getComputedStyle(document.getElementById("flag")).visibility, shut: document.getElementById("answer").disabled }));
  await p.keyboard.press("p"); await p.waitForTimeout(100);
  const tr = await p.evaluate(() => ({ card: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, ae: document.activeElement.id, s: Passport.state(), v: document.getElementById("answer").value }));
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  check("passport typed tour: Backspace deletes a letter (stays in the run); the ⏸ button pauses (the flag hidden, the box shut) and P resumes with the box in hand; Esc leaves",
    bs.s === "ask" && bs.v === "mvsMV" && tp.card && tp.flag === "hidden" && tp.shut && !tr.card && tr.ae === "answer" && tr.s === "ask" && tr.v === "mvsMV" && p.leaves === 1, { bs, tp, tr, leaves: p.leaves });
  await p.evaluate(() => Passport.toMenu());
  const afterEsc = await p.evaluate(() => ({ s: Passport.state(), ae: document.activeElement.id || document.activeElement.tagName }));
  const e0 = await st(p); await p.keyboard.press("m"); await p.keyboard.press("v"); const e1 = await st(p); await p.keyboard.press("m"); await p.keyboard.press("v");
  check("passport: back on the menu from a typed run, the answer box lets go and M / V work", afterEsc.s === "menu" && afterEsc.ae !== "answer" && e1.m === !e0.m && e1.f === !e0.f, { afterEsc, e0, e1 });
  await p.keyboard.press("t");

  // Dash: P pauses (the tags take 1 to 4), and M works while paused
  await p.keyboard.press("2"); await p.keyboard.press("Enter"); await p.keyboard.press("p");
  const dashPaused = await p.evaluate(() => !document.querySelector(".gs-pause:not(.gs-dialog)").hidden);
  await p.keyboard.press("m"); const pm = (await st(p)).m; await p.keyboard.press("m");
  await p.keyboard.press("p");
  check("passport dash: P pauses, M works while paused, P resumes", dashPaused && pm === !m0.m && (await p.evaluate(() => document.querySelector(".gs-pause:not(.gs-dialog)").hidden && Passport.state())) === "ask", { dashPaused, pm });
  await p.evaluate(() => Passport.toMenu());

  // Visa Run: S shares, the hint survives "copied!"; Backspace → menu; Esc → games list
  await p.keyboard.press("3"); await p.evaluate(() => Passport.fast()); await p.keyboard.press("Enter");
  for (let i = 0; i < 10; i++) {
    await p.waitForFunction(() => Passport.state() === "ask" || Passport.state() === "over");
    if ((await p.evaluate(() => Passport.state())) === "over") break;
    await p.keyboard.press(String((await p.evaluate(() => Passport.current().correct)) + 1));
    await p.waitForFunction(() => Passport.state() !== "reveal");
  }
  await p.waitForFunction(() => Passport.state() === "over");
  const sh = await p.evaluate(() => ({ hidden: document.getElementById("share").hidden, html: document.getElementById("share").innerHTML }));
  await p.keyboard.press("s");
  await p.waitForFunction(() => document.getElementById("share").textContent === "copied!", null, { timeout: 2000 }).catch(() => {});
  const copied = await p.evaluate(() => document.getElementById("share").textContent);
  const clip = await p.evaluate(() => navigator.clipboard.readText());
  await p.waitForTimeout(1600);
  const restored = await p.evaluate(() => document.getElementById("share").innerHTML);
  check("passport visa run: S copies the result, the S keycap comes back after 'copied!'",
    !sh.hidden && /^Share result .*<kbd>S<\/kbd>/.test(sh.html) && copied === "copied!" && /Visa Run #\d+/.test(clip) && restored === sh.html, { sh, copied, clip, restored });
  const l0 = p.leaves;
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  const l1 = p.leaves;
  await p.keyboard.press("Backspace");
  check("passport: on the end screen Esc leaves for the games list, Backspace returns to the menu", l1 === l0 + 1 && (await p.evaluate(() => Passport.state())) === "menu", { l0, l1 });
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  check("passport: Esc on the menu goes back to the games list (once)", p.leaves === l1 + 1, p.leaves);
  check("passport: no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // a typed Dash that runs out of time leaves the keys working (fake clock)
  p = await lib.open(ctx, base, "games/passport/", { before: (pg) => pg.clock.install() });
  await p.keyboard.press("y"); await p.keyboard.press("2"); await p.keyboard.press("Enter");
  await p.clock.runFor(50);
  const focused = await p.evaluate(() => document.activeElement.id);
  await p.keyboard.type("x");
  await p.clock.runFor(61000);
  const d1 = await p.evaluate(() => ({ m: MUTE_ON(), v: document.getElementById("answer").value, s: Passport.state() }));
  await p.keyboard.press("m");
  const d2 = await p.evaluate(() => ({ m: MUTE_ON(), v: document.getElementById("answer").value }));
  check("passport typed dash: when the clock runs out, M toggles on the end screen", focused === "answer" && d1.s === "over" && d2.m === !d1.m && d2.v === d1.v, { focused, d1, d2 });
  check("passport (dash): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // a typed Dash, paused (by the ⏸ button: P in the box is a letter): the
  // answer box is shut and typing goes nowhere; P resumes, the box is
  // focused, and it stamps
  p = await lib.open(ctx, base, "games/passport/");
  await p.evaluate(() => { Passport.setStyle("typed"); Passport.start("dash"); });
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === "answer");
  const ans = await p.evaluate(() => Passport.current().answer);
  await p.click(".gs-pause-btn");
  const pz = await p.evaluate(() => ({ paused: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, disabled: document.getElementById("answer").disabled }));
  await p.keyboard.type("qxz"); await p.waitForTimeout(150);
  const pz2 = await p.evaluate(() => ({ score: Passport.score(), state: Passport.state(), v: document.getElementById("answer").value }));
  await p.keyboard.press("p"); await p.waitForTimeout(50);
  const rz = await p.evaluate(() => ({ disabled: document.getElementById("answer").disabled, ae: document.activeElement.id, paused: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden }));
  await p.keyboard.type(ans); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const rz2 = await p.evaluate(() => Passport.score());
  check("passport typed dash: paused, the answer box is shut and typing goes nowhere; P resumes, the box focused, and it stamps",
    pz.paused && pz.disabled && pz2.score === 0 && pz2.state === "ask" && pz2.v === "" && !rz.paused && !rz.disabled && rz.ae === "answer" && rz2 === 1, { pz, pz2, rz, rz2 });
  check("passport (paused dash): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // a Dash, paused: the flag, its caption, the tags and the stamp hide for the
  // whole pause, so it's no free study. The next flag, due as a stamp's beat
  // ends, waits for the resume, and then drops in (Visual FX on)
  p = await lib.open(ctx, base, "games/passport/");
  const seen = () => p.evaluate(() => {
    const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
    return { flag: vis(document.getElementById("flag")), cap: vis(document.getElementById("post-cap")), tags: [...document.querySelectorAll("#tags .tag")].some(vis),
      stamp: vis(document.getElementById("big-stamp")), code: Passport.current().code, state: Passport.state() };
  });
  const tog = async () => { await p.click(".gs-pause-btn", { force: true }); await p.waitForTimeout(60); };   // (the ⏸ button: pause, then resume)
  await p.evaluate(() => Passport.start("dash"));
  await p.waitForFunction(() => Passport.state() === "ask");
  const sh0 = await seen(); await tog(); const sh1 = await seen(); await tog(); const sh2 = await seen();
  check("passport dash: paused, the flag, its caption and the tags hide; resumed, they're back",
    sh0.flag && sh0.cap && sh0.tags && !sh1.flag && !sh1.cap && !sh1.tags && sh2.flag && sh2.cap && sh2.tags, { sh0, sh1, sh2 });
  await p.evaluate(() => { const c = Passport.current(); Passport.answer(c.correct); });
  await tog();
  await p.waitForTimeout(1300);   // past the stamp's beat
  const sh3 = await seen();
  await p.evaluate(() => { window.__deal = null; document.getElementById("postcard").addEventListener("animationstart", (e) => { window.__deal = e.animationName; }); });
  await tog(); await p.waitForTimeout(150);
  const sh4 = await seen(), deal = await p.evaluate(() => window.__deal);
  check("passport dash: a pause during a stamp hides it, and the next flag waits for the resume, then drops in",
    !sh3.flag && !sh3.stamp && sh3.state === "reveal" && sh3.code === sh2.code && sh4.state === "ask" && sh4.code !== sh2.code && sh4.flag && deal === "deal", { sh2, sh3, sh4, deal });
  check("passport (dash, hidden while paused): no page errors", p.errs.length === 0, p.errs);
  await p.close();

  // every run pauses, not a dash alone: a World Tour and a Visa Run pause by
  // the ⏸ button with the flag, its question and the tags hidden, and the
  // button again brings them back; away from the tab a dash pauses (its clock
  // runs) and a tour doesn't (it has no clock, and just waits). And Esc mid-run
  // is the way out: it asks "Leave this game?", the run paused under the box
  {
    const q = await lib.open(ctx, base, "games/passport/");
    const look = () => q.evaluate(() => {
      const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
      return { card: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, flag: vis(document.getElementById("flag")), cap: vis(document.getElementById("post-cap")),
        tags: [...document.querySelectorAll("#tags .tag")].some(vis), state: Passport.state() };
    });
    const runs = {};
    for (const mode of ["tour", "daily"]) {
      await q.evaluate((m) => { Passport.toMenu(); Passport.start(m); }, mode);
      await q.waitForFunction(() => Passport.state() === "ask");
      const a = await look(); await q.click(".gs-pause-btn", { force: true }); await q.waitForTimeout(80);
      const b = await look(); await q.click(".gs-pause-btn", { force: true }); await q.waitForTimeout(80);
      runs[mode] = { a, b, c: await look() };
    }
    check("passport: a World Tour and a Visa Run pause by the ⏸ button as a dash does, the flag, its question and the tags hidden; the button again brings them back",
      ["tour", "daily"].every((m) => { const { a, b, c } = runs[m]; return !a.card && a.flag && a.cap && a.tags && b.card && !b.flag && !b.cap && !b.tags && b.state === "ask" && !c.card && c.flag && c.cap && c.tags; }) && q.leaves === 0,
      { runs, leaves: q.leaves });
    const away = {};
    for (const mode of ["tour", "dash"]) {
      await q.evaluate((m) => { Passport.toMenu(); Passport.start(m); }, mode);
      await q.waitForFunction(() => Passport.state() === "ask");
      await q.evaluate(() => window.dispatchEvent(new Event("blur"))); await q.waitForTimeout(80);
      away[mode] = (await look()).card;
      if (away[mode]) { await q.click(".gs-pause-btn", { force: true }); await q.waitForTimeout(80); }
    }
    check("passport: away from the tab a dash pauses (its clock runs) and a tour doesn't (no clock: it waits)", away.dash === true && away.tour === false, away);
    // Esc in a tour with a stamp in it: "Leave this game?", the run paused (flag hidden) under the box; Enter plays on
    await q.evaluate(() => { Passport.toMenu(); Passport.fast(); Passport.start("tour"); });
    await q.waitForFunction(() => Passport.state() === "ask");
    await q.evaluate(() => Passport.answer(Passport.current().correct));
    await q.waitForFunction(() => Passport.state() === "ask" && Passport.score() === 1, null, { timeout: 8000 });
    await q.keyboard.press("Escape"); await q.waitForSelector(".gs-dialog", { timeout: 5000 }).catch(() => {});
    const asked = await q.evaluate(() => ({ dlg: (document.querySelector(".gs-dialog h2") || {}).textContent || null, flag: getComputedStyle(document.getElementById("flag")).visibility }));
    await q.keyboard.press("Enter"); await q.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 5000 }).catch(() => {});
    const kept = await look();
    check("passport: Esc mid-run asks 'Leave this game?' with the run paused under the box (the flag hidden); Enter plays on",
      asked.dlg === "Leave this game?" && asked.flag === "hidden" && !kept.card && kept.flag && kept.state === "ask" && q.leaves === 0, { asked, kept, leaves: q.leaves });
    check("passport (every run pauses): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }

  // a typed tour paused during a stamp: the next flag waits for the resume,
  // the answer box shut all the while; resumed, the flag comes and the box is
  // back in hand
  {
    const q = await lib.open(ctx, base, "games/passport/");
    await q.keyboard.press("y");
    await q.evaluate(() => Passport.start("tour"));
    await q.waitForFunction(() => Passport.state() === "ask" && document.activeElement && document.activeElement.id === "answer");
    const c0 = await q.evaluate(() => Passport.current());
    await q.keyboard.type(c0.answer); await q.keyboard.press("Enter");
    await q.waitForFunction(() => Passport.state() === "reveal");
    await q.click(".gs-pause-btn", { force: true });
    await q.waitForTimeout(1300);   // past the stamp's beat
    const held = await q.evaluate(() => ({ state: Passport.state(), code: Passport.current().code, shut: document.getElementById("answer").disabled,
      card: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, flag: getComputedStyle(document.getElementById("flag")).visibility }));
    await q.click(".gs-pause-btn", { force: true });
    const next = await q.waitForFunction((code) => Passport.state() === "ask" && Passport.current().code !== code && document.activeElement && document.activeElement.id === "answer" && !document.getElementById("answer").disabled, c0.code, { timeout: 5000 }).then(() => true, () => false);
    check("passport typed tour: paused during a stamp, the next flag waits for the resume with the answer box shut; resumed, it comes with the box in hand",
      held.card && held.state === "reveal" && held.code === c0.code && held.shut && held.flag === "hidden" && next && q.leaves === 0, { held, next, leaves: q.leaves });
    check("passport (typed tour paused mid-stamp): no page errors", q.errs.length === 0, q.errs);
    await q.close();
  }

  // a first-ever tour: no stamps is no record; one stamp is
  p = await lib.open(ctx, base, "games/passport/");
  const tour = async (right) => {
    await p.evaluate(() => { Passport.fast(); Passport.start("tour"); });
    for (let k = 0, hits = right; k < 3 + right; k++) {
      await p.waitForFunction(() => Passport.state() === "ask");
      await p.evaluate((hit) => { const c = Passport.current(); Passport.answer(hit ? c.correct : (c.correct + 1) % 4); }, hits-- > 0);
      await p.waitForFunction(() => Passport.state() !== "reveal");
    }
    await p.waitForFunction(() => Passport.state() === "over");
    return p.evaluate(() => document.getElementById("over-stats").textContent);
  };
  const t0s = await tour(0), t1s = await tour(1);
  check("passport: a first tour with no stamps isn't a new record; a later one with a stamp is",
    !/new record/.test(t0s) && /new record/.test(t1s), { t0s, t1s });
  await p.close();
  await ctx.close();

  // keycaps on Passport's buttons, and the menu's key line, show on a desktop
  // and hide on a touch-only phone or tablet
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]], ["tablet", devices["iPad Mini"]]]) {
    const c2 = await lib.newContext(browser, opts);
    const q = await lib.open(c2, base, "games/passport/");
    const odd = () => q.evaluate((touch) => [...document.querySelectorAll("#desk button kbd, #menu button kbd, #over button kbd, #menu .keys kbd")].filter((k) => {
      const w = k.closest(".gs-keys"), b = k.closest("button");
      return !w || (b && !b.contains(w)) || (getComputedStyle(w).display === "none") !== touch;
    }).map((k) => ((k.closest("button") || k.parentElement).id || (k.closest("button") || k.parentElement).className) + ":" + k.textContent), label !== "desktop");
    const onMenu = await odd();
    await q.evaluate(() => { Passport.fast(); Passport.start("tour"); });
    for (let k = 0; k < 3; k++) {
      await q.waitForFunction(() => Passport.state() === "ask");
      await q.evaluate(() => { const c = Passport.current(); Passport.answer((c.correct + 1) % 4); });
      await q.waitForFunction(() => Passport.state() !== "reveal");
    }
    await q.waitForFunction(() => Passport.state() === "over");
    const onEnd = await odd();
    check("passport, " + label + ": the keycaps on its buttons and its key line " + (label === "desktop" ? "show" : "are hidden"), onMenu.length === 0 && onEnd.length === 0, { onMenu, onEnd });
    await q.close();
    await c2.close();
  }

  // ---- Enter on a focused mode button picks that mode and stays on the menu
  // (it used to start a run as well, in the mode as it was); a mode picked
  // with the mouse keeps no focus, so the next Enter starts the run. On the
  // end screen, Enter on the focused Modes button goes to the modes.
  {
    const c = await lib.newContext(browser);
    const q = await lib.open(c, base, "games/passport/");
    const look = () => q.evaluate(() => ({ state: Passport.state(), mode: Passport.mode(), focus: document.activeElement.tagName }));
    await q.focus('#pick-mode button[data-v="dash"]'); await q.keyboard.press("Enter"); await q.waitForTimeout(150);
    const a = await look();
    await q.evaluate(() => document.activeElement.blur());
    await q.click('#pick-mode button[data-v="tour"]', { timeout: 3000 }).catch(() => {}); await q.waitForTimeout(80);
    const b = await look();
    await q.keyboard.press("Enter"); await q.waitForTimeout(200);
    const d = await look();
    check("passport: Enter on a focused mode button only picks it; after a mouse pick (which keeps no focus) Enter starts the run",
      a.state === "menu" && a.mode === "dash" && b.state === "menu" && b.mode === "tour" && b.focus !== "BUTTON" && d.state !== "menu" && d.mode === "tour", { a, b, d });
    // three denials end the tour
    await q.evaluate(() => Passport.fast());
    for (let i = 0; i < 3; i++) {
      await q.waitForFunction(() => Passport.state() === "ask", null, { timeout: 8000 });
      await q.evaluate(() => { const cur = Passport.current(); Passport.answer((cur.correct + 1) % 4); });
      await q.waitForFunction(() => Passport.state() !== "reveal", null, { timeout: 8000 });
    }
    await q.waitForFunction(() => Passport.state() === "over", null, { timeout: 8000 });
    await q.focus("#to-menu"); await q.keyboard.press("Enter"); await q.waitForTimeout(200);
    const end = await look();
    check("passport: on the end screen, Enter on the focused Modes button goes to the modes, not into another run", end.state === "menu", end);
    check("passport: no page errors (focused buttons)", q.errs.length === 0, q.errs);
    await q.close();
    await c.close();
  }
};
