// 24: the keyboard legend under the phone shows with a keyboard and hides on
// a touch-only phone, where the phone's own labelled keys are the controls.
// On the Paused screen, C (Backspace, or the phone's C key) asks before it
// quits a run in progress, with the run still paused and its cards hidden.
module.exports = async ({ browser, base, check, lib }) => {
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const ctx = await lib.newContext(browser, opts);
    const p = await lib.open(ctx, base, "games/24/");
    const shown = await p.evaluate(() => document.querySelector(".keys-help").getClientRects().length > 0);
    check("24: the keyboard legend " + (label === "phone" ? "is hidden on a touch-only phone" : "shows with a keyboard"), shown === (label !== "phone"), shown);
    check("24 (" + label + "): no page errors", p.errs.length === 0, p.errs);
    await ctx.close();
  }

  const ctx = await lib.newContext(browser);
  const p = await lib.open(ctx, base, "games/24/");
  const now = () => p.evaluate(() => {
    const d = document.querySelector(".gs-dialog");
    return { screen: TwentyFour.state().screen, dlg: d && { title: d.querySelector("h2").textContent, ok: [...d.querySelectorAll("button")].pop().textContent } };
  });
  // a Time attack run with a step made (something to lose), paused with Esc
  const pausedRun = async (menuKey, work) => {
    await p.evaluate((k) => { if (TwentyFour.state().screen !== "menu") { TwentyFour.press("C"); } TwentyFour.press(k); }, menuKey);
    await p.waitForTimeout(150);
    if (work) await p.evaluate(() => { TwentyFour.press("1"); TwentyFour.press("5"); TwentyFour.press("2"); });
    await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  };
  await pausedRun("2", true);
  const before = await now();
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  const asked = await now();
  check("24: on the Paused screen, Backspace asks \"Quit this game?\" first, the cards staying hidden underneath",
    before.screen === "paused" && !!asked.dlg && asked.dlg.title === "Quit this game?" && /^Quit/.test(asked.dlg.ok) && asked.screen === "paused", { before, asked });
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const kept = await now();
  check("24: Esc on that box keeps the run paused (it doesn't resume it)", !kept.dlg && kept.screen === "paused" && p.leaves === 0, { kept, leaves: p.leaves });
  await p.click('[data-key="C"]'); await p.waitForTimeout(150);
  const asked2 = await now();
  await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  const quit = await now();
  check("24: the phone's C key on the Paused screen asks the same, and Enter quits to the menu",
    !!asked2.dlg && asked2.dlg.title === "Quit this game?" && asked2.screen === "paused" && !quit.dlg && quit.screen === "menu", { asked2, quit });

  // (guards: nothing asked before either) nothing to lose quits at once: a
  // Time attack run with nothing done, and a Daily (it saves its clock)
  await pausedRun("2", false);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  const fresh = await now();
  check("24: (guard) C on the Paused screen of an untouched Time attack run quits at once", fresh.screen === "menu" && !fresh.dlg, fresh);
  await pausedRun("3", true);
  const dPaused = await now();
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  const daily = await now();
  check("24: (guard) C on a paused Daily quits at once (the Daily resumes where it was left)", dPaused.screen === "paused" && daily.screen === "menu" && !daily.dlg, { dPaused, daily });

  // Options' "Main menu" asks the same; Esc returns to Options with the run
  // still there (a Time attack run waits paused, cards hidden, under the box)
  const mainMenuItem = async (menuKey, work) => {
    await p.evaluate((k) => TwentyFour.press(k), menuKey); await p.waitForTimeout(150);
    await p.evaluate((work) => {
      if (work) { TwentyFour.press("1"); TwentyFour.press("5"); TwentyFour.press("2"); }
      TwentyFour.press("navi"); for (let i = 0; i < 4; i++) TwentyFour.press("down");   // Options, down to "Main menu"
    }, work);
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);
  };
  for (const [name, key, under] of [["Classic", "1", "options"], ["Time attack", "2", "paused"]]) {
    await mainMenuItem(key, true);
    const ask = await now();
    await p.keyboard.press("Escape"); await p.waitForTimeout(150);
    const back = await p.evaluate(() => { const s = TwentyFour.state(); return { screen: s.screen, run: !!s.G && s.G.hist.length === 1, dlg: !!document.querySelector(".gs-dialog") }; });
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);   // "Main menu" again
    await p.keyboard.press("Enter"); await p.waitForTimeout(150);   // Quit
    const out = await now();
    check("24: " + name + ", Options' Main menu asks \"Quit this game?\" first; Esc returns to Options with the run there, Enter quits",
      !!ask.dlg && ask.dlg.title === "Quit this game?" && /^Quit/.test(ask.dlg.ok) && ask.screen === under && !back.dlg && back.screen === "options" && back.run && !out.dlg && out.screen === "menu",
      { ask, back, out });
  }
  await mainMenuItem("1", false);
  const untouched = await now();
  check("24: (guard) Options' Main menu on an untouched run quits at once", untouched.screen === "menu" && !untouched.dlg, untouched);
  await mainMenuItem("3", true);
  const dMenu = await now();
  check("24: (guard) Options' Main menu in a Daily quits at once", dMenu.screen === "menu" && !dMenu.dlg, dMenu);
  check("24: no page errors (Paused)", p.errs.length === 0, p.errs);
  await ctx.close();
};
