// Pausing, consistently: P pauses during play everywhere a game pauses, and Esc
// never does: it's the way out to the games page, asking "Leave this game?"
// first mid-game. (A few games still pause on Esc: the typing games and
// Fish-a-Fish, where no letter is free; Demolition Row, where P turns a piece;
// and 24, where Esc is the phone's own key.) Backspace backs out of end
// screens, the shared pause only claims its key when something pauses, and
// paused games ignore play input.
module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  // the "Leave this game?" box: its title once it's up (null if it never comes), and waiting it gone
  const asked = async (p) => { await p.waitForSelector(".gs-dialog", { timeout: 5000 }).catch(() => {}); return p.evaluate(() => (document.querySelector(".gs-dialog h2") || {}).textContent || null); };
  const boxGone = (p) => p.waitForFunction(() => !document.querySelector(".gs-dialog"), null, { timeout: 5000 }).catch(() => {});
  // what an Esc the game left alone did: "asked" (the box is up), "left" (the nth trip to the games page), or "nothing"
  const wayOut = async (p, n) => {
    await p.evaluate(() => new Promise((r) => setTimeout(r, 250)));
    if (await p.evaluate(() => !!document.querySelector(".gs-dialog"))) return "asked";
    return (await lib.leftBy(p, n, 4000)) >= n ? "left" : "nothing";
  };
  const card = (p) => p.evaluate(() => { const g = document.querySelector(".gs-pause:not(.gs-dialog)"); return !!g && !g.hidden; });   // (the pause card, not a dialog)
  const btn = (p) => p.evaluate(() => { const e = document.querySelector(".gs-pause-btn"); return e ? e.textContent : null; });
  const done = async (p, g) => { check(g + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };

  // ---- the shared pause claims P only when it pauses something, and never Esc or Ctrl+P
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
      const p1 = await lib.fireKey(p, { key: "p" }), paused = await card(p);
      const p2 = await lib.fireKey(p, { key: "p" }), resumed = !(await card(p));
      // Esc is left to the page's way out: it asks first if there's a game to lose, else just goes
      const esc = await lib.fireKey(p, { key: "Escape" }), out = await wayOut(p, 1);
      check(g + " play: P pauses, P resumes; Esc isn't claimed (it's the way out)", p1 && paused && p2 && resumed && !esc && out !== "nothing", { p1, paused, p2, resumed, esc, out });
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

  // ---- Ping: a rally pauses on P, the ball freezes; Esc is the way out and
  // never the pause key (it used to be both)
  p = await lib.open(ctx, base, "games/ping/");
  const pingBtn = await btn(p), pingHint = await p.evaluate(() => document.querySelector("#controls .ctrl-desktop").textContent);
  check("ping: the ⏸ button and the menu's hint name P for pause (Esc is 'all games')", pingBtn === "⏸ Pause P" && /P pause · Esc all games/.test(pingHint), { pingBtn, pingHint });
  await p.click('#menu .btn[data-mode="1"]'); await p.waitForFunction(() => state === "playing", null, { timeout: 15000 });
  await p.keyboard.press("p");
  const x0 = await p.evaluate(() => ball.x); await p.waitForTimeout(300); const x1 = await p.evaluate(() => ball.x);
  const pausedPing = await card(p), pbtn = await btn(p), cardText = await p.evaluate(() => document.querySelector(".gs-pause:not(.gs-dialog) p").textContent);
  // paused at 0-0 there's nothing to lose, so Esc doesn't resume: it leaves
  await p.keyboard.press("Escape");
  const pingLeft = await lib.leftBy(p, 1), stillPaused = await card(p);
  await p.keyboard.press("p"); await p.waitForTimeout(200);
  const x2 = await p.evaluate(() => ball.x);
  check("ping: P pauses (ball frozen) and P resumes; the card names only P", pausedPing && x0 === x1 && !(await card(p)) && x2 !== x1 && pbtn === "▶ Resume P" && /press P to continue/.test(cardText) && !/Esc/.test(cardText),
    { pausedPing, x0, x1, x2, pbtn, cardText });
  check("ping, paused at 0-0: Esc doesn't resume, it leaves for the games page", pingLeft === 1 && stillPaused, { pingLeft, stillPaused });
  // with a point on the board Esc asks first, the rally held under the box; Esc again keeps playing
  await p.evaluate(() => { left.score = 1; ball.x = W / 2; ball.y = H / 2; });   // (mid-court, so no point ends the rally meanwhile)
  await p.keyboard.press("Escape");
  const pingAsk = await asked(p), y0 = await p.evaluate(() => ball.x);
  await p.waitForTimeout(250);
  const y1 = await p.evaluate(() => ball.x), heldUnder = await card(p);
  await p.keyboard.press("Escape"); await boxGone(p);
  const pingKept = { box: await p.evaluate(() => !!document.querySelector(".gs-dialog")), card: await card(p), state: await p.evaluate(() => state) };
  check("ping, mid-match: Esc asks 'Leave this game?' with the rally held (not a bare pause); Esc again plays on",
    pingAsk === "Leave this game?" && y0 === y1 && heldUnder && !pingKept.box && !pingKept.card && pingKept.state === "playing" && p.leaves === 1, { pingAsk, y0, y1, heldUnder, pingKept, leaves: p.leaves });
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

  // ---- Crazy Ohio: P pauses a run and Esc asks to leave it; in the countdown
  // and on the results Backspace backs out to setup and Esc leaves for the
  // games page; paused lane presses don't count; the lanes are F G H J, shown
  // on setup
  p = await ctx.newPage(); p.errs = []; p.leaves = 0; p.on("pageerror", (e) => p.errs.push(e.message));
  await lib.injectScript(p, "games/crazy-ohio/game.js", [
    ["function registerMiss(t, col, pressed) {", "function registerMiss(t, col, pressed) { if (pressed) window.__press = (window.__press || 0) + 1;"],
    ["function registerHit(t) {", "function registerHit(t) { window.__press = (window.__press || 0) + 1;"],
    // (a countdown the test can stretch from 1.5 s to 30: on a busy machine two keys don't always land inside 1.5 s)
    ["let n = 3;", "let n = window.__longCountdown ? 60 : 3;"],
  ]);
  await p.goto(base + "games/crazy-ohio/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector(".mute-toggle"); await p.waitForTimeout(400);
  const sec = () => p.evaluate(() => ["setup", "play", "result"].find((id) => !document.getElementById(id).hidden));
  check("crazy-ohio: ⏸ button names P", (await btn(p)) === "⏸ Pause P", await btn(p));
  await p.click('#durChoices [data-dur="15"]').catch(() => {});
  await p.evaluate(() => { window.__longCountdown = true; });
  await p.click("#startBtn"); await p.waitForTimeout(400);
  await p.keyboard.press("Escape");
  const cdLeaves = await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  await p.evaluate(() => { window.__longCountdown = false; });
  check("crazy-ohio countdown: Esc leaves for the games page, Backspace backs out to setup", cdLeaves === 1 && (await sec()) === "setup" && !(await card(p)), { cdLeaves, sec: await sec() });
  await p.click("#startBtn"); await p.waitForTimeout(3800);
  await p.keyboard.press("p"); await p.waitForTimeout(150); const a1 = { sec: await sec(), paused: await card(p) };
  const before = await p.evaluate(() => window.__press || 0);
  for (const k of ["f", "g", "h", "j", "f", "g"]) await p.keyboard.press(k);
  const during = await p.evaluate(() => window.__press || 0);
  await p.keyboard.press("p"); await p.waitForTimeout(150); const a2 = { sec: await sec(), paused: await card(p) };
  for (const k of ["f", "g", "h", "j"]) await p.keyboard.press(k);
  const after = await p.evaluate(() => window.__press || 0);
  // Esc mid-run is the way out, so it asks (the run held under the box); Esc again keeps playing
  const runLeaves = p.leaves;
  await p.keyboard.press("Escape"); const a3 = { ask: await asked(p), sec: await sec(), held: await card(p) };
  await p.keyboard.press("Escape"); await boxGone(p); const a4 = { sec: await sec(), paused: await card(p), leaves: p.leaves - runLeaves };
  check("crazy-ohio running: P pauses (doesn't quit) and resumes; Esc asks 'Leave this game?' with the run held, Esc again plays on",
    a1.sec === "play" && a1.paused && a2.sec === "play" && !a2.paused && a3.ask === "Leave this game?" && a3.sec === "play" && a3.held && a4.sec === "play" && !a4.paused && a4.leaves === 0, { a1, a2, a3, a4 });
  check("crazy-ohio: lane presses while paused don't count; after resuming they do", during === before && after > during, { before, during, after });
  await p.waitForFunction(() => !document.getElementById("result").hidden, null, { timeout: 60000 });
  const sb = await p.evaluate(() => document.getElementById("settingsBtn").innerHTML);
  const rl0 = p.leaves;
  await p.keyboard.press("Escape");
  const rl1 = await lib.leftBy(p, rl0 + 1);   // (counted when its request arrives: later on a busy machine)
  await p.keyboard.press("Backspace"); await p.waitForTimeout(150);
  check("crazy-ohio results: Settings shows a ⌫ keycap; Esc leaves, Backspace goes to setup", /title="Backspace">⌫/.test(sb) && rl1 === rl0 + 1 && (await sec()) === "setup", { sb, rl0, rl1, sec: await sec() });
  const lk = await p.evaluate(() => ({ caps: [...document.querySelectorAll("#laneKeys kbd")].map((k) => k.textContent).join(""), buttons: document.querySelectorAll("#laneKeys button, .keybtn").length }));
  check("crazy-ohio: setup shows the lane keys F G H J as keycaps, nothing to rebind", lk.caps === "FGHJ" && lk.buttons === 0, lk);
  await done(p, "crazy-ohio");

  // ---- Flappy World: P pauses, Esc doesn't (it asks to leave); on game over Backspace goes to the menu (Esc leaves)
  p = await lib.open(ctx, base, "games/flappy-world/");
  check("flappy-world: ⏸ button names P", (await btn(p)) === "⏸ Pause P", await btn(p));
  await p.keyboard.press("Space"); await p.waitForTimeout(300);
  const f0 = await p.evaluate(() => game.gameState);
  await p.keyboard.press("p"); const f1 = await p.evaluate(() => game.gameState);
  // (paused, so the bird can't fall while the box is read) Esc doesn't resume: it asks, and Keep playing stays paused
  await p.keyboard.press("Escape"); const f2 = { ask: await asked(p), state: await p.evaluate(() => game.gameState) };
  await p.keyboard.press("Escape"); await boxGone(p); const f3 = await p.evaluate(() => game.gameState);
  // (the state it resumes to is caught as it changes: read a moment later, the bird may have fallen and ended the run)
  await p.evaluate(() => { window.__resumed = null; (function poll() { if (game.gameState !== "PAUSED") window.__resumed = game.gameState; else requestAnimationFrame(poll); })(); });
  await p.keyboard.press("p");
  const f4 = await p.waitForFunction(() => window.__resumed, null, { timeout: 8000 }).then((h) => h.jsonValue(), () => null);
  check("flappy-world: P pauses and resumes; Esc doesn't: it asks 'Leave this game?', and Keep playing stays paused",
    f0 === "PLAYING" && f1 === "PAUSED" && f2.ask === "Leave this game?" && f2.state === "PAUSED" && f3 === "PAUSED" && f4 === "PLAYING" && p.leaves === 0, { f0, f1, f2, f3, f4, leaves: p.leaves });
  await p.waitForFunction(() => game.gameState === "GAMEOVER", null, { timeout: 15000 }); await p.waitForTimeout(200);
  await p.keyboard.press("Escape");
  const fl = await lib.leftBy(p, 1);   // (counted when its request arrives: later on a busy machine)
  await p.keyboard.press("Backspace");
  check("flappy-world game over: Esc leaves, Backspace goes to the menu", fl === 1 && (await p.evaluate(() => game.gameState)) === "MENU", { fl });
  await done(p, "flappy-world");

  // ---- Spacer: P opens and shuts the pause menu; Esc doesn't (it asks to leave)
  p = await lib.open(ctx, base, "games/spacer/");
  check("spacer: ⏸ button names P", (await btn(p)) === "⏸ Pause P", await btn(p));
  await p.keyboard.press("Enter");
  await p.waitForFunction(() => window.game.mode === "playing", null, { timeout: 30000 }).catch(() => {});   // (past the READY banner)
  await p.evaluate(() => window.game.addScore(100));   // (a run with a score is one to lose, so leaving asks)
  const m = []; m.push(await p.evaluate(() => window.game.mode));
  for (const k of ["p", "p", "p"]) { await p.keyboard.press(k); m.push(await p.evaluate(() => window.game.mode)); }
  // on the pause menu Esc doesn't resume: it asks, and Keep playing is back on the menu
  await p.keyboard.press("Escape"); m.push((await asked(p)) + ":" + (await p.evaluate(() => window.game.mode)));
  await p.keyboard.press("Escape"); await boxGone(p); m.push(await p.evaluate(() => window.game.mode));
  await p.keyboard.press("p"); m.push(await p.evaluate(() => window.game.mode));
  check("spacer: P pauses / resumes; Esc on the pause menu asks 'Leave this game?' and Keep playing stays paused",
    m.join() === "playing,paused,playing,paused,Leave this game?:paused,paused,playing" && p.leaves === 0, { m, leaves: p.leaves });
  await done(p, "spacer");

  // ---- Slither: P / Space in Classic; P in a Fire Eggs arena, where Space lays eggs; Esc never pauses
  p = await lib.open(ctx, base, "games/slither/");
  await p.click("#play-btn"); await p.waitForTimeout(600);
  const ov = () => p.evaluate(() => !document.getElementById("pause").classList.contains("hidden"));
  const lbl = () => p.evaluate(() => document.getElementById("pause-btn").textContent);
  const l0 = await lbl();
  await p.keyboard.press("p"); const c1 = await ov(); const l1 = await lbl();
  await p.keyboard.press("p"); const c2 = await ov();
  await p.keyboard.press("Space"); const c3 = await ov();
  // paused, Esc doesn't resume: it's the way out (it leaves, or asks first if the snake has eaten by now)
  await p.keyboard.press("Escape"); const sOut = await wayOut(p, 1), c4 = await ov();
  if (sOut === "asked") { await p.keyboard.press("Escape"); await boxGone(p); }   // (Keep playing)
  await p.keyboard.press("Space");
  check("slither classic: label P; P and Space toggle pause; Esc doesn't (it's the way out)", l0 === "⏸ Pause P" && c1 && l1 === "▶ Resume P" && !c2 && c3 && c4 && sOut !== "nothing", { l0, c1, l1, c2, c3, c4, sOut });
  await p.click("#menu-btn"); await p.waitForTimeout(400);
  await p.click('[data-mode="lab"]'); await p.waitForTimeout(400);
  await p.evaluate(() => { const d = [...document.querySelectorAll("details.lab-runs")].find((x) => /Fire Eggs/.test(x.textContent)); d.open = true; [...d.querySelectorAll("button")].find((x) => /^🥚/.test(x.textContent)).click(); });
  await p.waitForTimeout(900);
  const e0 = await lbl();
  await p.keyboard.press("Space"); await p.waitForTimeout(150); const eggPaused = await ov();
  await p.keyboard.press("p"); await p.waitForTimeout(150); const e1 = await lbl();
  await p.keyboard.press("Escape"); await p.evaluate(() => new Promise((r) => setTimeout(r, 250))); const e2 = await lbl();
  if (await p.evaluate(() => !!document.querySelector(".gs-dialog"))) { await p.keyboard.press("Escape"); await boxGone(p); }   // (Keep playing, if it asked)
  await p.keyboard.press("p"); await p.waitForTimeout(150); const e3 = await lbl();
  check("slither fire eggs: Space lays an egg (no pause), P pauses, Esc doesn't resume, P does", e0 === "⏸ Pause P" && !eggPaused && e1 === "▶ Resume P" && e2 === "▶ Resume P" && e3 === "⏸ Pause P", { e0, eggPaused, e1, e2, e3 });
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

  // ---- Klondike: Esc closes How to play and stops there; the next Esc asks to leave; P pauses
  p = await lib.open(ctx, base, "games/klondike/");
  await p.evaluate(() => Klondike.draw()); await p.waitForTimeout(200);
  await p.evaluate(() => document.getElementById("m-rules").click()); await p.waitForTimeout(200);
  const boxOpen = await p.evaluate(() => !document.getElementById("shade").hidden);
  await p.keyboard.press("Escape"); await p.evaluate(() => new Promise((r) => setTimeout(r, 250)));
  const k1 = await p.evaluate(() => ({ box: !document.getElementById("shade").hidden, paused: Klondike.state().paused, ask: !!document.querySelector(".gs-dialog") }));
  await p.keyboard.press("Escape"); const k2 = await asked(p);
  await p.keyboard.press("Escape"); await boxGone(p);
  const k3 = await p.evaluate(() => Klondike.state().paused);
  await p.keyboard.press("p"); const k4 = await p.evaluate(() => Klondike.state().paused);
  await p.keyboard.press("p"); const k5 = await p.evaluate(() => Klondike.state().paused);
  check("klondike: Esc closes How to play without pausing or leaving; the next Esc asks 'Leave this game?'; P pauses and resumes",
    boxOpen && !k1.box && !k1.paused && !k1.ask && k2 === "Leave this game?" && !k3 && k4 && !k5 && p.leaves === 0, { boxOpen, k1, k2, k3, k4, k5, leaves: p.leaves });
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
