// Darkroom: a flawless print in the gallery is only replaced by a better
// flawless one (a faster fogged replay doesn't take its place); the share
// fallback box goes away with the win card, and "Copied!" turns back into
// "Share".
const HOOK = ["    apply: apply,", "    apply: apply,\n    setMs: function (v) { cur.ms = v; },"];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const before = (pg) => lib.injectScript(pg, "games/darkroom/game.js", [HOOK]);
  let p = await lib.open(ctx, base, "games/darkroom/", { before });
  const album = () => p.evaluate(() => JSON.parse(localStorage.getItem("darkroom_album") || "{}").plus || null);
  // develop "plus" with the clock at `ms`, fogging one wrong cell first if asked
  const develop = (ms, fog) => p.evaluate(([ms, fog]) => {
    Darkroom.open("plus");
    if (fog) { const art = Darkroom.art(); for (let y = 0; y < art.length; y++) { const x = art[y].indexOf("."); if (x >= 0) { Darkroom.apply(x, y, "fill"); break; } } }
    Darkroom.setMs(ms);
    Darkroom.solveNow();
  }, [ms, fog]);

  await develop(300000, false);
  const a0 = await album();
  await develop(60000, true);
  const a1 = await album();
  await develop(200000, false);
  const a2 = await album();
  check("darkroom: a faster fogged replay keeps the flawless print; a faster flawless one replaces it",
    a0 && a0.fog === 0 && a0.ms === 300000 && a1.fog === 0 && a1.ms === 300000 && a2.fog === 0 && a2.ms === 200000, { a0, a1, a2 });
  await p.close();

  // the daily's Share: the clipboard refuses, then allows
  p = await lib.open(ctx, base, "games/darkroom/", { before: async (pg) => {
    await before(pg);
    await pg.addInitScript(() => {
      window.__clip = "deny";
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => window.__clip === "deny" ? Promise.reject(new Error("denied")) : Promise.resolve() } });
    });
  } });
  const daily = async () => {
    await p.evaluate(() => { Darkroom.openDaily(); Darkroom.solveNow(); });
    await p.waitForFunction(() => !document.getElementById("win").hidden, null, { timeout: 5000 });
  };
  await daily();
  await p.click("#win-share"); await p.waitForTimeout(150);
  const shown = await p.evaluate(() => !document.getElementById("share-out").hidden);
  await p.click("#win-menu"); await p.waitForTimeout(100);
  const gone = await p.evaluate(() => document.getElementById("share-out").hidden);
  check("darkroom: the share fallback box shows when the clipboard refuses, and goes with the win card", shown && gone, { shown, gone });
  await p.evaluate(() => { window.__clip = "allow"; });
  await daily();
  await p.click("#win-share"); await p.waitForTimeout(150);
  const said = await p.evaluate(() => document.getElementById("win-share").textContent);
  await p.waitForTimeout(1600);
  const back = await p.evaluate(() => document.getElementById("win-share").textContent);
  check("darkroom: Share says Copied!, then Share again", said === "Copied!" && back === "Share", { said, back });
  check("darkroom: no page errors", p.errs.length === 0, p.errs);
  await p.close();
  await ctx.close();

  // the tool buttons' 1 / 2 keycaps show on a desktop and hide on a touch-only phone
  const { devices } = require("@playwright/test");
  for (const [label, opts] of [["desktop", {}], ["phone", devices["Pixel 7"]]]) {
    const c2 = await lib.newContext(browser, opts);
    const q = await lib.open(c2, base, "games/darkroom/");
    await q.evaluate(() => Darkroom.open("plus"));
    const odd = await q.evaluate((phone) => [...document.querySelectorAll(".toolset button kbd")].filter((k) => {
      const w = k.closest(".gs-keys");
      return !w || !k.closest("button").contains(w) || (getComputedStyle(w).display === "none") !== phone;
    }).map((k) => k.closest("button").id + ":" + k.textContent), label === "phone");
    check("darkroom, " + label + ": the tool buttons' keycaps " + (label === "phone" ? "are hidden" : "show"), odd.length === 0, odd);
    await q.close();
    await c2.close();
  }
};
