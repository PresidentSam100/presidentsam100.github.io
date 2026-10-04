// Passport's keyboard: S shares, M / V and [ / ] reach the corner buttons (but
// not while typing an answer), Esc steps back, and a typed run that ends leaves
// the keys working.
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
  await p.keyboard.press("Escape");
  check("passport: Esc mid-tour returns to the menu", (await p.evaluate(() => Passport.state())) === "menu");

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
  await p.keyboard.press("Escape");
  const afterEsc = await p.evaluate(() => ({ s: Passport.state(), ae: document.activeElement.id || document.activeElement.tagName }));
  const e0 = await st(p); await p.keyboard.press("m"); await p.keyboard.press("v"); const e1 = await st(p); await p.keyboard.press("m"); await p.keyboard.press("v");
  check("passport: after Esc from a typed run, the answer box lets go and M / V work on the menu", afterEsc.s === "menu" && afterEsc.ae !== "answer" && e1.m === !e0.m && e1.f === !e0.f, { afterEsc, e0, e1 });
  await p.keyboard.press("t");

  // Dash: M works while paused
  await p.keyboard.press("2"); await p.keyboard.press("Enter"); await p.keyboard.press("Escape");
  const dashPaused = await p.evaluate(() => !document.querySelector(".gs-pause").hidden);
  await p.keyboard.press("m"); const pm = (await st(p)).m; await p.keyboard.press("m");
  await p.keyboard.press("Escape");
  check("passport dash: M works while paused, Esc resumes", dashPaused && pm === !m0.m && (await p.evaluate(() => document.querySelector(".gs-pause").hidden && Passport.state())) === "ask", { dashPaused, pm });
  await p.evaluate(() => Passport.toMenu());

  // Visa Run: S shares, the hint survives "copied!"; Esc → menu → games list
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
  await p.keyboard.press("Escape");
  check("passport: Esc on the end screen returns to the menu", (await p.evaluate(() => Passport.state())) === "menu");
  await Promise.all([p.waitForURL((u) => !/passport/.test(u.toString())), p.keyboard.press("Escape")]);
  check("passport: Esc on the menu goes back to the games list", /\/games\/$/.test(p.url()), p.url());
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
  await ctx.close();
};
