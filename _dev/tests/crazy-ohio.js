// Crazy Ohio: with storage blocked the game still runs; a run whose countdown
// ends with the tab hidden or the window unfocused starts paused, its clock
// still full; the lanes' F G H J labels hide on touch-only devices; a
// Precision hit's judgment says what it scored.
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
  await p.keyboard.press("p");
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

  // ---- a Precision hit's judgment says what it scored under it ("+300" for a
  // PERFECT, "+150" a GREAT), in the lane pressed; it rises with Visual FX on
  // and holds still with it off; a pause holds it, and it goes after 620 ms.
  // (How much of the tile is in the key zone is set by the test.)
  {
    const FRAC = ["  function judgeFraction(frac) {", "  function judgeFraction(frac) {\n    if (window.__coFrac != null) frac = window.__coFrac;"];
    const wait = (q, ms) => q.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);
    const c = await lib.newContext(browser);
    const got = {};
    for (const off of [false, true]) {
      const q = await lib.open(c, base, "games/crazy-ohio/", { before: (pg) => lib.injectScript(pg, "games/crazy-ohio/game.js", [FRAC]) });
      await q.evaluate((off) => { window.RM_ON = () => off; document.documentElement.classList.toggle("fx-off", off); }, off);
      await q.click('.choice[data-mode="precision"]');
      await q.click("#startBtn");
      const r = {};
      for (const [frac, want] of [[1, "+300"], [0.7, "+150"]]) {
        await q.waitForFunction(() => __OSU_TEST__.getTiles().some((t) => !t.resolved), null, { timeout: 20000 });
        const hit = await q.evaluate(async (frac) => {
          window.__coFrac = frac;
          const t = __OSU_TEST__.getTiles().filter((x) => !x.resolved).sort((a, b) => b.lastY - a.lastY)[0];
          const s0 = +document.getElementById("vScore").textContent;
          document.dispatchEvent(new KeyboardEvent("keydown", { code: ["KeyF", "KeyG", "KeyH", "KeyJ"][t.col], key: "fghj"[t.col], bubbles: true }));
          document.dispatchEvent(new KeyboardEvent("keyup", { code: ["KeyF", "KeyG", "KeyH", "KeyJ"][t.col], key: "fghj"[t.col], bubbles: true }));
          const lane = document.querySelectorAll(".lane")[t.col], j = [...lane.querySelectorAll(".judge")].pop();
          return { col: t.col, gain: +document.getElementById("vScore").textContent - s0, label: j ? j.firstChild.textContent : null,
            pts: j && j.querySelector(".pts") ? j.querySelector(".pts").textContent : null, inLane: !!j };
        }, frac);
        hit.want = want;
        r[want] = hit;
      }
      // the last label: does it move, does a pause hold it, does it go
      const top = () => q.evaluate(() => { const j = document.querySelector(".judge.great"); return j ? j.getBoundingClientRect().top : null; });
      const a = await top(); await wait(q, 250); const b = await top();
      r.moved = a !== null && b !== null ? +(a - b).toFixed(1) : null;
      await q.keyboard.press("p");
      await wait(q, 900);
      r.heldThrough = await q.evaluate(() => !!document.querySelector(".judge.great"));
      await q.keyboard.press("p");
      r.gone = await q.waitForFunction(() => !document.querySelector(".judge.great"), null, { timeout: 10000 }).then(() => true, () => false);
      got[off ? "off" : "on"] = r;
      check("crazy-ohio (Precision points, FX " + (off ? "off" : "on") + "): no page errors", q.errs.length === 0, q.errs);
      await q.close();
    }
    const ok = (r) => ["+300", "+150"].every((w) => r[w] && r[w].inLane && r[w].pts === w && "+" + r[w].gain === w) && r["+300"].label === "PERFECT" && r["+150"].label === "GREAT" && r.heldThrough && r.gone;
    check("crazy-ohio: a Precision hit's judgment says what it scored under it in the lane pressed (PERFECT +300, GREAT +150, the score's own rise); a pause holds it, and it goes after",
      ok(got.on) && ok(got.off), got);
    check("crazy-ohio: the judgment and its points rise as they fade with Visual FX on, and hold still with it off",
      got.on.moved > 2 && got.off.moved === 0, { on: got.on.moved, off: got.off.moved });
    await c.close();
  }
};
