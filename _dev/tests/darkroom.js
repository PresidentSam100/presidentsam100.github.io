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
    // the how-to on the menu: its keys go on a phone, the rest of it stays
    await q.evaluate(() => Darkroom.toMenu());
    const how = await q.evaluate((phone) => {
      const h = document.querySelector(".how"), ks = [...h.querySelectorAll("kbd")];
      return { keys: ks.length, odd: ks.filter((k) => { const w = k.closest(".gs-keys"); return !w || (getComputedStyle(w).display === "none") !== phone; }).map((k) => k.textContent),
        text: h.innerText.replace(/\s+/g, " ") };
    }, label === "phone");
    check("darkroom, " + label + ": the how-to's keys " + (label === "phone" ? "are hidden" : "show") + ", the rest reads on",
      how.keys === 10 && how.odd.length === 0 && /switch with the button/.test(how.text) && /fogs the print/.test(how.text) && /Keys:/.test(how.text) === (label !== "phone"), how);
    await q.close();
    await c2.close();
  }

  // ---- R / ↺ on a print with work on it asks "Start over?", the clock stopped under the box
  const c3 = await lib.newContext(browser);
  p = await lib.open(c3, base, "games/darkroom/");
  const st = () => p.evaluate(() => Darkroom.state());
  const box = () => p.evaluate(() => { const d = document.querySelector(".gs-dialog"); return d && { title: d.querySelector("h2").textContent, text: (d.querySelector("p") || {}).textContent, buttons: [...d.querySelectorAll("button")].map((b) => b.textContent) }; });
  await p.evaluate(() => { Darkroom.open("plus"); const art = Darkroom.art(); for (let y = 0; y < art.length; y++) { const x = art[y].indexOf("#"); if (x >= 0) { Darkroom.apply(x, y, "fill"); break; } } });
  await p.waitForTimeout(300);
  await p.keyboard.press("r"); await p.waitForTimeout(250);
  const asked = await box(), s0 = await st();
  await p.waitForTimeout(700);
  const s1 = await st();
  await p.keyboard.press("Escape"); await p.waitForTimeout(250);
  const kept = { box: await box(), s: await st() };
  await p.waitForTimeout(400);
  const ticking = (await st()).ms > kept.s.ms;
  const restartBtn = () => p.evaluate(() => document.getElementById("hud-restart").click());
  await restartBtn(); await p.waitForTimeout(250);
  const asked2 = await box();
  await p.keyboard.press("Enter"); await p.waitForTimeout(250);
  const wiped = { box: await box(), s: await st() };
  check("darkroom: R on a print with a fill asks 'Start over?' with the clock stopped; Keep playing keeps it, ↺ then Start over wipes it",
    !!asked && asked.title === "Start over?" && /fills/.test(asked.text) && asked.buttons.some((b) => /Start over/.test(b)) && asked.buttons.some((b) => /Keep playing/.test(b)) &&
      s0.paused && s1.ms === s0.ms && s1.filled === 1 &&
      !kept.box && !kept.s.paused && kept.s.filled === 1 && ticking &&
      !!asked2 && !wiped.box && !wiped.s.paused && wiped.s.filled === 0 && !/[12]/.test(wiped.s.cells) && wiped.s.ms < 1000,
    { asked, s0, s1, kept, ticking, asked2, wiped });

  // ...a blank print, or a finished one, starts over at once (guards)
  await p.keyboard.press("r"); await p.waitForTimeout(250);
  const blank = { box: await box(), s: await st() };
  await p.evaluate(() => Darkroom.solveNow());
  await restartBtn(); await p.waitForTimeout(250);
  const solved = { box: await box(), s: await st() };
  check("darkroom: R on a blank print and ↺ on a finished one start over at once, no box",
    !blank.box && blank.s.screen === "puzzle" && !blank.s.paused && !solved.box && !solved.s.won && solved.s.filled === 0, { blank, solved });
  check("darkroom: no page errors (start over)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- Esc in the gallery goes back to the darkroom; on the menu it leaves, as ever
  p = await lib.open(c3, base, "games/darkroom/");
  await p.click("#to-gallery"); await p.waitForTimeout(100);
  const g0 = (await st()).screen;
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  const g1 = { screen: (await st()).screen, leaves: p.leaves };
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  check("darkroom: Esc in the gallery goes back to the darkroom (doesn't leave); Esc there leaves",
    g0 === "gallery" && g1.screen === "menu" && g1.leaves === 0 && p.leaves === 1, { g0, g1, leaves: p.leaves });

  // ---- the keys are written down: the how-to names Space and R too, and ↺ shows its R
  const keys = await p.evaluate(() => {
    const how = document.querySelector(".how"), r = document.getElementById("hud-restart"), cap = r.querySelector(".gs-keys kbd");
    return { how: [...how.querySelectorAll(".gs-keys kbd")].map((k) => k.textContent), text: how.textContent.replace(/\s+/g, " "),
      cap: cap && cap.textContent, title: r.title };
  });
  check("darkroom: the how-to names every key (Space develops, R starts over), and ↺ shows R as a keycap with a tooltip",
    ["Z", "Space", "X", "R"].every((k) => keys.how.includes(k)) && /Space develop/.test(keys.text) && /R start over/.test(keys.text) &&
      keys.cap === "R" && /\bR\b/.test(keys.title), keys);
  check("darkroom: no page errors (keys)", p.errs.length === 0, p.errs);
  await p.close();

  // ---- the win card: Backspace goes back to the darkroom, as its menu button does; Esc still leaves
  p = await lib.open(c3, base, "games/darkroom/");
  const won = async () => {
    await p.evaluate(() => { Darkroom.open("plus"); Darkroom.solveNow(); });
    await p.waitForFunction(() => !document.getElementById("win").hidden, null, { timeout: 5000 });
  };
  await won();
  await p.keyboard.press("Backspace"); await p.waitForTimeout(250);
  const w1 = { screen: (await st()).screen, card: await p.evaluate(() => !document.getElementById("win").hidden), leaves: p.leaves };
  await won();
  await p.keyboard.press("Escape"); await p.waitForTimeout(300);
  check("darkroom: Backspace on the win card goes back to the darkroom menu; Esc there leaves for the games page",
    w1.screen === "menu" && !w1.card && w1.leaves === 0 && p.leaves === 1, { w1, leaves: p.leaves });
  check("darkroom: no page errors (win card)", p.errs.length === 0, p.errs);
  await p.close();
  await c3.close();
};
