// Passport's keyboard: S shares, M / V and [ / ] reach the corner buttons (but
// not while typing an answer), Backspace goes back to Passport's menu and Esc
// leaves for the games page (both on the end screen and mid-run), and a typed
// run that ends leaves the keys working.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser, { permissions: ["clipboard-read", "clipboard-write"] });
  const st = (p) => p.evaluate(() => ({ m: MUTE_ON(), f: RM_ON() }));

  let p = await lib.open(ctx, base, "games/passport/");
  const lab = await p.evaluate(() => ({
    keys: document.querySelector(".keys").textContent,
    mt: document.querySelector(".mute-toggle").title, mk: document.querySelector(".mute-toggle").getAttribute("aria-keyshortcuts"),
    ft: document.querySelector(".rm-toggle").title, fk: document.querySelector(".rm-toggle").getAttribute("aria-keyshortcuts"),
    bt: document.querySelector(".nav-back-games").title,
  }));
  check("passport: the menu's key line and the button tooltips name the keys",
    /M\/\[ sound · V\/\] visual FX · Esc back to games/.test(lab.keys) && /M or \[$/.test(lab.mt) && lab.mk === "M [" && /V or \]$/.test(lab.ft) && lab.fk === "V ]" && /Esc/.test(lab.bt), lab);

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
  // in the answer box Backspace deletes; Esc leaves for the games page
  await p.keyboard.press("Backspace");
  const bs = await p.evaluate(() => ({ s: Passport.state(), v: document.getElementById("answer").value }));
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  check("passport typed: Backspace deletes a letter (stays in the run), Esc leaves", bs.s === "ask" && bs.v === "mvsMV" && p.leaves === 1, { bs, leaves: p.leaves });
  await p.evaluate(() => Passport.toMenu());
  const afterEsc = await p.evaluate(() => ({ s: Passport.state(), ae: document.activeElement.id || document.activeElement.tagName }));
  const e0 = await st(p); await p.keyboard.press("m"); await p.keyboard.press("v"); const e1 = await st(p); await p.keyboard.press("m"); await p.keyboard.press("v");
  check("passport: back on the menu from a typed run, the answer box lets go and M / V work", afterEsc.s === "menu" && afterEsc.ae !== "answer" && e1.m === !e0.m && e1.f === !e0.f, { afterEsc, e0, e1 });
  await p.keyboard.press("t");

  // Dash: M works while paused
  await p.keyboard.press("2"); await p.keyboard.press("Enter"); await p.keyboard.press("Escape");
  const dashPaused = await p.evaluate(() => !document.querySelector(".gs-pause:not(.gs-dialog)").hidden);
  await p.keyboard.press("m"); const pm = (await st(p)).m; await p.keyboard.press("m");
  await p.keyboard.press("Escape");
  check("passport dash: M works while paused, Esc resumes", dashPaused && pm === !m0.m && (await p.evaluate(() => document.querySelector(".gs-pause:not(.gs-dialog)").hidden && Passport.state())) === "ask", { dashPaused, pm });
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
    !sh.hidden && /<kbd>S<\/kbd>/.test(sh.html) && copied === "copied!" && /Visa Run #\d+/.test(clip) && restored === "Share result <kbd>S</kbd>", { sh, copied, clip, restored });
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

  // a typed Dash, paused: the answer box takes nothing and Enter stamps nothing; resumed, it's back in play
  p = await lib.open(ctx, base, "games/passport/");
  await p.evaluate(() => { Passport.setStyle("typed"); Passport.start("dash"); });
  await p.waitForFunction(() => document.activeElement && document.activeElement.id === "answer");
  const ans = await p.evaluate(() => Passport.current().answer);
  await p.keyboard.press("Escape");
  const pz = await p.evaluate(() => ({ paused: !document.querySelector(".gs-pause:not(.gs-dialog)").hidden, disabled: document.getElementById("answer").disabled }));
  await p.keyboard.type(ans); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const pz2 = await p.evaluate(() => ({ score: Passport.score(), state: Passport.state(), v: document.getElementById("answer").value }));
  await p.keyboard.press("Escape"); await p.waitForTimeout(50);
  const rz = await p.evaluate(() => ({ disabled: document.getElementById("answer").disabled, ae: document.activeElement.id }));
  await p.keyboard.type(ans); await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const rz2 = await p.evaluate(() => Passport.score());
  check("passport typed dash: paused, the answer box is shut and Enter stamps nothing; resumed, it's focused and stamps",
    pz.paused && pz.disabled && pz2.score === 0 && pz2.state === "ask" && !rz.disabled && rz.ae === "answer" && rz2 === 1, { pz, pz2, rz, rz2 });
  check("passport (paused dash): no page errors", p.errs.length === 0, p.errs);
  await p.close();

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

  // keycaps on Passport's buttons show on a desktop and hide on a touch-only phone
  // (Share's S is left out: its exact markup is checked above)
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c2 = await lib.newContext(browser, opts);
    const q = await lib.open(c2, base, "games/passport/");
    const odd = () => q.evaluate((phone) => [...document.querySelectorAll("#desk button kbd, #menu button kbd, #over button kbd")].filter((k) => !k.closest("#share")).filter((k) => {
      const w = k.closest(".gs-keys");
      return !w || !k.closest("button").contains(w) || (getComputedStyle(w).display === "none") !== phone;
    }).map((k) => (k.closest("button").id || k.closest("button").className) + ":" + k.textContent), label === "phone");
    const onMenu = await odd();
    await q.evaluate(() => { Passport.fast(); Passport.start("tour"); });
    for (let k = 0; k < 3; k++) {
      await q.waitForFunction(() => Passport.state() === "ask");
      await q.evaluate(() => { const c = Passport.current(); Passport.answer((c.correct + 1) % 4); });
      await q.waitForFunction(() => Passport.state() !== "reveal");
    }
    await q.waitForFunction(() => Passport.state() === "over");
    const onEnd = await odd();
    check("passport, " + label + ": the keycaps on its buttons " + (label === "phone" ? "are hidden" : "show"), onMenu.length === 0 && onEnd.length === 0, { onMenu, onEnd });
    await q.close();
    await c2.close();
  }
};
