// Pausing, consistently: Esc pauses during play everywhere a game pauses (P too
// where P isn't a game key), Backspace backs out of end screens (Esc leaves), the shared pause only
// claims its keys when something pauses, and paused games ignore play input.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const card = (p) => p.evaluate(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; });   // (the pause card, not a dialog)
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

  // ---- Speedle: the ⏸ button shows but never pauses (a stopped clock would be a free look)
  let p = await lib.open(ctx, base, "games/speedle/");
  const sp = () => p.evaluate(() => { const b = document.querySelector(".gs-pause-btn"); return b && { off: b.getAttribute("aria-disabled"), title: b.title, text: b.textContent }; });
  const spMenu = await sp();
  await p.click("#m-sprint"); await p.waitForTimeout(300);
  const spPlay = await sp();
  // (force: Playwright won't click an aria-disabled button, but a player's click still lands on it)
  // (Esc leaves at once here: nothing typed yet. The 300ms lets it decide before P types a letter)
  await p.click(".gs-pause-btn", { force: true }); await p.keyboard.press("Escape"); await p.waitForTimeout(300); await p.keyboard.press("p");
  const spAfter = await sp(), spCard = await card(p);
  const typedP = await p.evaluate(() => [...document.querySelectorAll(".tile")].map((t) => t.textContent).join("").includes("p"));   // P still types a letter
  check("speedle: ⏸ is shown, always off, says why; clicking it or Esc doesn't pause",
    spMenu && spMenu.off === "true" && spPlay.off === "true" && /can't be paused/.test(spPlay.title) && spAfter.off === "true" && !spCard && typedP,
    { spMenu, spPlay, spAfter, spCard, typedP });
  await done(p, "speedle");

  // ---- Ping: a rally pauses, the ball freezes
  p = await lib.open(ctx, base, "games/ping/");
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

  // ---- 24: in Classic and Hard the dimmed ⏸ says there's no clock, not "works during a game"
  p = await lib.open(ctx, base, "games/24/");
  const tip = () => p.evaluate(() => { const b = document.querySelector(".gs-pause-btn"); return { off: b.getAttribute("aria-disabled"), title: b.title, aria: b.getAttribute("aria-label") }; });
  const onMenu = await tip();
  await p.keyboard.press("1"); await p.waitForTimeout(400);
  const classic = await tip();
  await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(400);
  await p.keyboard.press("4"); await p.waitForTimeout(400);
  const hard = await tip();
  check("24: in Classic / Hard the dimmed ⏸ explains there's no clock; on the menu it says it works during a game",
    /during a game/.test(onMenu.title) && classic.off === "true" && /No clock in Classic/.test(classic.title) && classic.aria === classic.title &&
    hard.off === "true" && /No clock in Hard/.test(hard.title), { onMenu, classic, hard });
  await done(p, "24 untimed");

  // ---- Crazy Ohio: Esc / P pause a run; in the countdown and on the results
  // Backspace backs out to setup and Esc leaves for the games page; paused
  // lane presses don't count; the lanes are F G H J, shown on setup
  p = await ctx.newPage(); p.errs = []; p.leaves = 0; p.on("pageerror", (e) => p.errs.push(e.message));
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
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  const cdLeaves = p.leaves;
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  check("crazy-ohio countdown: Esc leaves for the games page, Backspace backs out to setup", cdLeaves === 1 && (await sec()) === "setup" && !(await card(p)), { cdLeaves, sec: await sec() });
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
  const rl0 = p.leaves;
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  const rl1 = p.leaves;
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  check("crazy-ohio results: Settings shows a ⌫ keycap; Esc leaves, Backspace goes to setup", /title="Backspace">⌫/.test(sb) && rl1 === rl0 + 1 && (await sec()) === "setup", { sb, rl0, rl1, sec: await sec() });
  const lk = await p.evaluate(() => ({ caps: [...document.querySelectorAll("#laneKeys kbd")].map((k) => k.textContent).join(""), buttons: document.querySelectorAll("#laneKeys button, .keybtn").length }));
  check("crazy-ohio: setup shows the lane keys F G H J as keycaps, nothing to rebind", lk.caps === "FGHJ" && lk.buttons === 0, lk);
  await done(p, "crazy-ohio");

  // ---- Flappy World: Esc pauses as well as P; on game over Backspace goes to the menu (Esc leaves)
  p = await lib.open(ctx, base, "games/flappy-world/");
  check("flappy-world: ⏸ button names P / Esc", (await btn(p)) === "⏸ Pause P/Esc", await btn(p));
  await p.keyboard.press("Space"); await p.waitForTimeout(300);
  const f0 = await p.evaluate(() => game.gameState);
  await p.keyboard.press("Escape"); const f1 = await p.evaluate(() => game.gameState);
  await p.keyboard.press("Escape"); const f2 = await p.evaluate(() => game.gameState);
  check("flappy-world: Esc pauses and resumes", f0 === "PLAYING" && f1 === "PAUSED" && f2 === "PLAYING", { f0, f1, f2 });
  await p.waitForFunction(() => game.gameState === "GAMEOVER", null, { timeout: 15000 }); await p.waitForTimeout(200);
  await p.keyboard.press("Escape"); await p.waitForTimeout(200);
  const fl = p.leaves;
  await p.keyboard.press("Backspace");
  check("flappy-world game over: Esc leaves, Backspace goes to the menu", fl === 1 && (await p.evaluate(() => game.gameState)) === "MENU", { fl });
  await done(p, "flappy-world");

  // ---- Spacer: Esc pauses and resumes as well as P
  p = await lib.open(ctx, base, "games/spacer/");
  check("spacer: ⏸ button names P / Esc", (await btn(p)) === "⏸ Pause P/Esc", await btn(p));
  await p.keyboard.press("Enter");
  // (past the READY banner, where Esc isn't the pause key: it asks to leave)
  await p.waitForFunction(() => window.game.mode === "playing", null, { timeout: 10000 }).catch(() => {});
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
  // mid-game ☰ Menu asks "Quit this game?" first; Enter quits
  await p.click("#menu-btn"); await p.waitForSelector(".gs-dialog", { timeout: 3000 });
  await p.keyboard.press("Enter"); await p.waitForTimeout(200);
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
