// Typing games: letters stay the player's mid-game, while [ and ] still reach
// the sound and Visual FX buttons (also from the game's own typing box). Plain
// text fields elsewhere keep every key.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const st = (p) => p.evaluate(() => ({ m: MUTE_ON(), f: RM_ON(), ae: document.activeElement && (document.activeElement.id || document.activeElement.tagName) }));

  // Speedle: letters are guesses
  let p = await lib.open(ctx, base, "games/speedle/");
  await p.click("#m-sprint"); await p.waitForTimeout(400);
  let a = await st(p);
  await p.keyboard.press("m"); await p.keyboard.press("v");
  let b = await st(p);
  const typed = await p.evaluate(() => /\bM\b/.test(document.body.innerText) && /\bV\b/.test(document.body.innerText));
  await p.keyboard.press("BracketLeft"); await p.keyboard.press("BracketRight");
  let c = await st(p);
  check("speedle mid-game: m / v are guesses, [ / ] toggle", b.m === a.m && b.f === a.f && typed && c.m === !a.m && c.f === !a.f, { a, b, c, typed });
  check("speedle: no page errors", p.errs.length === 0, p.errs); await p.close();

  // Departures: the answer box keeps letters; [ / ] work from inside it and aren't typed
  p = await lib.open(ctx, base, "games/departures/");
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.activeElement.id === "answer");
  a = await st(p);
  await p.keyboard.type("m"); await p.keyboard.press("BracketLeft"); await p.keyboard.press("BracketRight");
  b = await st(p);
  let v = await p.evaluate(() => document.getElementById("answer").value);
  check("departures mid-game: m is typed, [ / ] toggle and aren't typed", v === "m" && b.m === !a.m && b.f === !a.f, { v, a, b });
  check("departures: no page errors", p.errs.length === 0, p.errs); await p.close();

  // Metazac: M works on the start screen; mid-game digits type and [ mutes
  p = await lib.open(ctx, base, "games/metazac/");
  a = await st(p); await p.keyboard.press("m"); b = await st(p); await p.keyboard.press("m");
  check("metazac start screen: M mutes", b.m === !a.m, { a, b });
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => document.activeElement.id === "answer" && !document.activeElement.disabled, null, { timeout: 5000 }).catch(() => {});
  a = await st(p);
  await p.keyboard.type("5"); await p.keyboard.press("m"); await p.keyboard.press("BracketLeft");
  b = await st(p);
  v = await p.evaluate(() => document.getElementById("answer").value);
  check("metazac mid-game: 5 typed, m ignored, [ mutes", a.ae === "answer" && v === "5" && b.m === !a.m, { a, b, v });
  check("metazac: no page errors", p.errs.length === 0, p.errs); await p.close();

  // Typetwo and Lanterns: letters are the game
  for (const [g, both] of [["typetwo", true], ["lanterns", false]]) {
    p = await lib.open(ctx, base, "games/" + g + "/");
    await p.keyboard.press("Enter"); await p.waitForTimeout(600);
    a = await st(p);
    await p.keyboard.press("m"); await p.keyboard.press("v");
    b = await st(p);
    await p.keyboard.press("BracketLeft"); if (both) await p.keyboard.press("BracketRight");
    c = await st(p);
    check(g + " mid-game: m / v don't toggle, [" + (both ? " / ]" : "") + " do", b.m === a.m && b.f === a.f && c.m === !a.m && (!both || c.f === !a.f), { a, b, c });
    check(g + ": no page errors", p.errs.length === 0, p.errs); await p.close();
  }

  // Tile Maze editor: brackets in the level-data box are just text
  p = await lib.open(ctx, base, "games/tile-maze/editor.html");
  a = await st(p);
  await p.evaluate(() => { document.getElementById("ioPanel").hidden = false; const t = document.getElementById("ioText"); t.value = ""; t.focus(); });
  await p.keyboard.type("[m]v");
  b = await st(p);
  v = await p.evaluate(() => document.getElementById("ioText").value);
  check("tile-maze editor: [m]v typed into the text box, nothing toggles", v === "[m]v" && b.m === a.m && b.f === a.f, { v, a, b });
  check("tile-maze editor: no page errors", p.errs.length === 0, p.errs); await p.close();

  await ctx.close();
};
