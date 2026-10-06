// Ctrl / Cmd / Alt shortcuts belong to the browser (Print, Save, Bookmark,
// Reload, Find, Back): game key handlers ignore them, while the same keys
// pressed alone are still the game's.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const cases = [
    // [game, how to get into play, a plain key the game claims, combos that must reach the browser]
    ["2048/", null, { key: "s", code: "KeyS" }, [{ key: "s", code: "KeyS", ctrlKey: true }, { key: "d", code: "KeyD", ctrlKey: true }, { key: "ArrowLeft", code: "ArrowLeft", altKey: true }]],
    ["tile-maze/", null, { key: "d", code: "KeyD" }, [{ key: "r", code: "KeyR", ctrlKey: true }, { key: "s", code: "KeyS", ctrlKey: true }]],
    ["speedle/", async (p) => { await p.click("#m-sprint"); await p.waitForTimeout(300); }, null, [{ key: "f", code: "KeyF", ctrlKey: true }]],
    ["jam-jar/", null, { key: "p", code: "KeyP" }, [{ key: "p", code: "KeyP", ctrlKey: true }, { key: "ArrowLeft", code: "ArrowLeft", altKey: true }]],
    ["meteor-menace/", async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(300); }, { key: "a", code: "KeyA" }, [{ key: "d", code: "KeyD", ctrlKey: true }, { key: "p", code: "KeyP", ctrlKey: true }]],
    ["salvo/", null, { key: "r", code: "KeyR" }, [{ key: "r", code: "KeyR", ctrlKey: true }, { key: "a", code: "KeyA", ctrlKey: true }]],
    ["typetwo/", async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(500); await p.evaluate(() => document.activeElement.blur()); }, { key: "q", code: "KeyQ" }, [{ key: "f", code: "KeyF", ctrlKey: true }]],
    ["slither/", async (p) => { await p.click("#play-btn"); await p.waitForTimeout(300); }, { key: "s", code: "KeyS" }, [{ key: "s", code: "KeyS", ctrlKey: true }, { key: "p", code: "KeyP", ctrlKey: true }]],
    ["road-bird/", async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(400); }, { key: "ArrowUp", code: "ArrowUp" }, [{ key: "ArrowLeft", code: "ArrowLeft", altKey: true }]],
    ["corner-pocket/", null, null, [{ key: "p", code: "KeyP", ctrlKey: true }]],
  ];
  for (const [g, start, plain, combos] of cases) {
    const p = await lib.open(ctx, base, "games/" + g);
    if (start) await start(p);
    const card = () => p.evaluate(() => { const x = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!x && !x.hidden; });
    const pausedBefore = await card();
    const claimed = [];
    for (const k of combos) claimed.push(await lib.fireKey(p, k));
    const pausedByCombo = (await card()) && !pausedBefore;
    const plainClaimed = plain ? await lib.fireKey(p, plain) : null;
    check(g + ": Ctrl / Alt combos reach the browser" + (plain ? ", the plain key is still the game's" : ""),
      claimed.every((x) => x === false) && !pausedByCombo && (plain ? plainClaimed === true : true) && !p.errs.length,
      { claimed, plainClaimed, pausedByCombo, errs: p.errs });
    await p.close();
  }
  await ctx.close();
};
