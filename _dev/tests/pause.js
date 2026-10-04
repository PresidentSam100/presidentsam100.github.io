// Pausing, consistently: Esc pauses during play everywhere a game pauses (P too
// where P isn't a game key), Esc backs out on end screens, the shared pause only
// claims its keys when something pauses, and paused games ignore play input.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const card = (p) => p.evaluate(() => { const g = document.querySelector(".gs-pause"); return !!g && !g.hidden; });
  const btn = (p) => p.evaluate(() => { const e = document.querySelector(".gs-pause-btn"); return e ? e.textContent : null; });
  const done = async (p, g) => { check(g + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- the shared pause claims Esc / P / Ctrl+P only when it pauses something
  const starts = {
    "abyss/": async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(400); },
    "mahjong/": async (p) => { await p.keyboard.press("Enter"); await p.waitForTimeout(500); },
    "ping/": async (p) => { await p.click('#menu .btn[data-mode="1"]'); await p.waitForTimeout(3500); },
    "minesweeper/": null,
  };
  for (const g of Object.keys(starts)) {
    const p = await lib.open(ctx, base, "games/" + g);
    const menu = { esc: await lib.fireKey(p, { key: "Escape" }), p: await lib.fireKey(p, { key: "p" }), ctrlP: await lib.fireKey(p, { key: "p", ctrlKey: true }) };
    check(g + " menu: Esc / P / Ctrl+P left to the browser, nothing pauses", !menu.esc && !menu.p && !menu.ctrlP && !(await card(p)), menu);
    if (starts[g]) {
      await starts[g](p);
      const e1 = await lib.fireKey(p, { key: "Escape" }), paused = await card(p);
      const e2 = await lib.fireKey(p, { key: "Escape" }), resumed = !(await card(p));
      check(g + " play: Esc pauses, Esc resumes", e1 && paused && e2 && resumed, { e1, paused, e2, resumed });
    }
    await done(p, g);
  }

  // ---- Ping: a rally pauses, the ball freezes
  let p = await lib.open(ctx, base, "games/ping/");
  await p.click('#menu .btn[data-mode="1"]'); await p.waitForTimeout(3400);
  await p.keyboard.press("p");
  const x0 = await p.evaluate(() => ball.x); await p.waitForTimeout(300); const x1 = await p.evaluate(() => ball.x);
  const pausedPing = await card(p), pbtn = await btn(p);
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  const x2 = await p.evaluate(() => ball.x);
  check("ping: P pauses (ball frozen), Esc resumes", pausedPing && x0 === x1 && !(await card(p)) && x2 !== x1 && /Resume/.test(pbtn), { pausedPing, x0, x1, x2, pbtn });
  await done(p, "ping");

  // ---- 24: the ⏸ button is dimmed on the menu, live in Time attack
  p = await lib.open(ctx, base, "games/24/");
  const dim = await p.evaluate(() => document.querySelector(".gs-pause-btn").getAttribute("aria-disabled"));
  await p.keyboard.press("2"); await p.waitForTimeout(300);
  const live = await p.evaluate(() => document.querySelector(".gs-pause-btn").getAttribute("aria-disabled"));
  await p.click(".gs-pause-btn"); const s1 = await p.evaluate(() => TwentyFour.state().screen);
  await p.keyboard.press("Escape"); const s2 = await p.evaluate(() => TwentyFour.state().screen);
  await p.keyboard.press("Escape"); const s3 = await p.evaluate(() => TwentyFour.state().screen);
  check("24: ⏸ dimmed on the menu, live in Time attack; the button and Esc pause / resume",
    dim === "true" && live === "false" && s1 === "paused" && s2 === "game" && s3 === "paused", { dim, live, s1, s2, s3 });
  await done(p, "24");

  // ---- Crazy Ohio: Esc / P pause a run; Esc backs out of the countdown and the
  // results; P can't be a lane key; paused lane presses don't count
  p = await ctx.newPage(); p.errs = []; p.on("pageerror", (e) => p.errs.push(e.message));
  await lib.injectScript(p, "games/crazy-ohio/game.js", [
    ["function registerMiss(t, col, pressed) {", "function registerMiss(t, col, pressed) { if (pressed) window.__press = (window.__press || 0) + 1;"],
    ["function registerHit(t) {", "function registerHit(t) { window.__press = (window.__press || 0) + 1;"],
  ]);
  await p.goto(base + "games/crazy-ohio/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector(".mute-toggle"); await p.waitForTimeout(400);
  const sec = () => p.evaluate(() => ["setup", "play", "result"].find((id) => !document.getElementById(id).hidden));
  check("crazy-ohio: ⏸ button names Esc / P", (await btn(p)) === "⏸ Pause Esc/P", await btn(p));
  await p.click('#durChoices [data-dur="15"]').catch(() => {});
  await p.click("#startBtn"); await p.waitForTimeout(400);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  check("crazy-ohio: Esc in the countdown backs out to setup", (await sec()) === "setup" && !(await card(p)), await sec());
  await p.click("#startBtn"); await p.waitForTimeout(3800);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150); const a1 = { sec: await sec(), paused: await card(p) };
  const before = await p.evaluate(() => window.__press || 0);
  for (const k of ["f", "g", "h", "j", "f", "g"]) await p.keyboard.press(k);
  const during = await p.evaluate(() => window.__press || 0);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150); const a2 = { sec: await sec(), paused: await card(p) };
  for (const k of ["f", "g", "h", "j"]) await p.keyboard.press(k);
  const after = await p.evaluate(() => window.__press || 0);
  await p.keyboard.press("p"); await p.waitForTimeout(150); const a3 = { paused: await card(p) }; await p.keyboard.press("p");
  check("crazy-ohio running: Esc pauses (doesn't quit), Esc resumes, P pauses", a1.sec === "play" && a1.paused && a2.sec === "play" && !a2.paused && a3.paused, { a1, a2, a3 });
  check("crazy-ohio: lane presses while paused don't count; after resuming they do", during === before && after > during, { before, during, after });
  await p.waitForFunction(() => !document.getElementById("result").hidden, null, { timeout: 60000 });
  const sb = await p.evaluate(() => document.getElementById("settingsBtn").innerHTML);
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  check("crazy-ohio results: Settings shows an Esc keycap, Esc goes to setup", /gs-kbd">Esc/.test(sb) && (await sec()) === "setup", { sb, sec: await sec() });
  await p.click('.keybtn[data-col="0"]'); await p.keyboard.press("p"); await p.waitForTimeout(100);
  check("crazy-ohio: rebinding refuses P", /P pauses the game/.test(await p.evaluate(() => document.getElementById("setupHint").textContent)));
  await p.keyboard.press("Escape");
  await done(p, "crazy-ohio");

  // ---- Flappy World: Esc pauses as well as P; Esc on game over goes to the menu
  p = await lib.open(ctx, base, "games/flappy-world/");
  check("flappy-world: ⏸ button names P / Esc", (await btn(p)) === "⏸ Pause P/Esc", await btn(p));
  await p.keyboard.press("Space"); await p.waitForTimeout(300);
  const f0 = await p.evaluate(() => game.gameState);
  await p.keyboard.press("Escape"); const f1 = await p.evaluate(() => game.gameState);
  await p.keyboard.press("Escape"); const f2 = await p.evaluate(() => game.gameState);
  check("flappy-world: Esc pauses and resumes", f0 === "PLAYING" && f1 === "PAUSED" && f2 === "PLAYING", { f0, f1, f2 });
  await p.waitForFunction(() => game.gameState === "GAMEOVER", null, { timeout: 15000 }); await p.waitForTimeout(200);
  await p.keyboard.press("Escape");
  check("flappy-world: Esc on the game-over screen goes to the menu", (await p.evaluate(() => game.gameState)) === "MENU");
  await done(p, "flappy-world");

  // ---- Spacer: Esc pauses and resumes as well as P
  p = await lib.open(ctx, base, "games/spacer/");
  check("spacer: ⏸ button names P / Esc", (await btn(p)) === "⏸ Pause P/Esc", await btn(p));
  await p.keyboard.press("Enter"); await p.waitForTimeout(2500);
  const m = []; m.push(await p.evaluate(() => window.game.mode));
  for (const k of ["Escape", "Escape", "p"]) { await p.keyboard.press(k); m.push(await p.evaluate(() => window.game.mode)); }
  await p.keyboard.press("p");
  check("spacer: Esc pauses / resumes, P still pauses", m.join() === "playing,paused,playing,paused", m);
  await done(p, "spacer");

  // ---- Slither: P / Esc / Space in Classic; P / Esc in a Fire Eggs arena, where Space lays eggs
  p = await lib.open(ctx, base, "games/slither/");
  await p.click("#play-btn"); await p.waitForTimeout(600);
  const ov = () => p.evaluate(() => !document.getElementById("pause").classList.contains("hidden"));
  const lbl = () => p.evaluate(() => document.getElementById("pause-btn").textContent);
  const l0 = await lbl();
  await p.keyboard.press("Escape"); const c1 = await ov(); const l1 = await lbl();
  await p.keyboard.press("p"); const c2 = await ov();
  await p.keyboard.press("Space"); const c3 = await ov(); await p.keyboard.press("Space");
  check("slither classic: label P/Esc; Esc, P and Space all toggle pause", l0 === "⏸ Pause P/Esc" && c1 && l1 === "▶ Resume P/Esc" && !c2 && c3, { l0, c1, l1, c2, c3 });
  await p.click("#menu-btn"); await p.waitForTimeout(400);
  await p.click('[data-mode="lab"]'); await p.waitForTimeout(400);
  await p.evaluate(() => { const d = [...document.querySelectorAll("details.lab-runs")].find((x) => /Fire Eggs/.test(x.textContent)); d.open = true; [...d.querySelectorAll("button")].find((x) => /^🥚/.test(x.textContent)).click(); });
  await p.waitForTimeout(900);
  const e0 = await lbl();
  await p.keyboard.press("Space"); await p.waitForTimeout(150); const eggPaused = await ov();
  await p.keyboard.press("p"); await p.waitForTimeout(150); const e1 = await lbl();
  await p.keyboard.press("Escape"); await p.waitForTimeout(150); const e2 = await lbl();
  check("slither fire eggs: Space lays an egg (no pause), P pauses, Esc resumes", e0 === "⏸ Pause P/Esc" && !eggPaused && e1 === "▶ Resume P/Esc" && e2 === "⏸ Pause P/Esc", { e0, eggPaused, e1, e2 });
  await done(p, "slither");

  // ---- Typetwo: typing while paused doesn't count, and Enter doesn't fire the bomb
  p = await lib.open(ctx, base, "games/typetwo/");
  await p.keyboard.press("Enter"); await p.waitForTimeout(1500);
  const hud = () => p.evaluate(() => [...document.querySelectorAll("#hud *, .hud *")].map((e) => (e.children.length ? "" : e.textContent.trim())).filter(Boolean).join("|"));
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  const h0 = await hud();
  await p.keyboard.type("qxzqxzqxz"); await p.keyboard.press("Enter");
  await p.evaluate(() => document.getElementById("ti").focus()); await p.keyboard.type("qxzqxz"); await p.waitForTimeout(150);
  const h1 = await hud();
  await p.keyboard.press("Escape"); await p.waitForTimeout(150);
  await p.evaluate(() => document.getElementById("ti").focus()); await p.keyboard.type("qqqxxxzzz"); await p.keyboard.press("Enter"); await p.waitForTimeout(200);
  const h2 = await hud();
  check("typetwo: keys while paused leave the scoreboard alone; after resuming they count", h0 === h1 && h2 !== h1, { h0, h1, h2 });
  await done(p, "typetwo");

  // ---- Klondike: Esc closes How to play without also pausing
  p = await lib.open(ctx, base, "games/klondike/");
  await p.evaluate(() => Klondike.draw()); await p.waitForTimeout(200);
  await p.evaluate(() => document.getElementById("m-rules").click()); await p.waitForTimeout(200);
  const boxOpen = await p.evaluate(() => !document.getElementById("shade").hidden);
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const k1 = await p.evaluate(() => ({ box: !document.getElementById("shade").hidden, paused: Klondike.state().paused }));
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const k2 = await p.evaluate(() => Klondike.state().paused);
  check("klondike: Esc closes How to play without pausing; the next Esc pauses", boxOpen && !k1.box && !k1.paused && k2, { boxOpen, k1, k2 });
  await done(p, "klondike");

  // ---- Demolition Row: after ☰ Menu the board keys are off
  p = await lib.open(ctx, base, "games/demolition-row/");
  await p.click("#play-btn"); await p.waitForTimeout(500);
  await p.click("#menu-btn"); await p.waitForTimeout(200);
  const claimed = await lib.fireKey(p, { key: "a" });
  await p.evaluate(() => { const el = document.querySelector("select.diffsel"); for (let n = el; n && n.id !== "menu"; n = n.parentElement) if (getComputedStyle(n).display === "none") n.style.display = "block"; });
  const sel = p.locator("select.diffsel").first();
  await sel.focus(); await p.keyboard.press("k"); await p.waitForTimeout(100);
  const pick = await sel.inputValue();
  await p.evaluate(() => document.activeElement.blur());
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const overMenu = await p.evaluate(() => !document.getElementById("pause").classList.contains("hidden"));
  await p.click("#play-btn"); await p.waitForTimeout(400);
  await p.keyboard.press("Escape"); await p.waitForTimeout(100);
  const pausesInGame = await p.evaluate(() => !document.getElementById("pause").classList.contains("hidden"));
  check("demolition-row: after Menu, letters aren't claimed, K picks Kaizo, Esc doesn't pop the pause card; a new game still pauses",
    !claimed && pick === "kaizo" && !overMenu && pausesInGame, { claimed, pick, overMenu, pausesInGame });
  await done(p, "demolition-row");

  await ctx.close();
};
