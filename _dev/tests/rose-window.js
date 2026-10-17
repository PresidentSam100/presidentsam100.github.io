// Rose Window: the modes take 1 and 2 (shown on them, the pick kept) and
// Space or Enter starts; every window's glass lies inside the arch and none
// is walled in by stone; Space sends the light, and where the bead lands on
// the bar sets the way it leaves; thick glass takes two knocks and stone
// none; a window broken to its last pane is lit, and the next one waits with
// the bead on the bar; the jewels widen the bar, slow the light or give three
// beads; a Vigil ends with its one bead, a Pilgrimage after three; a new
// best is kept as it's passed; the end card ignores Space for a moment, then
// begins again, and Backspace goes to the modes; paused, the keys neither
// move the bar nor send the light; with Visual FX off a broken pane throws no
// shards and the bead leaves no trail; on a phone a drag moves the bar and a
// tap sends the light. Sixteen windows: a game that reaches one opens it on
// the menu, where ← and → (shown on ◀ ▶) pick one to start from among those
// open, the pick kept; a game from any but I keeps no best, and says so.
// (the physics stepped by hand, and a few more things to read, through
// lines served into the game's script)
const HOOK = ["    gameOver: gameOver\n  };", `    gameOver: gameOver,
    put: function (x, y, vx, vy) { serving = false; balls = [{ x: x, y: y, vx: vx, vy: vy, trail: [] }]; },
    step: function (dt) { update(dt); },
    live: function () { return balls; },
    shards: function () { return shards.length; },
    jewels: function () { return jewels.length; },
    pops: function () { return pops.map(function (q) { return { y: q.y, age: q.age }; }); }
  };`];

module.exports = async ({ browser, base, check, lib }) => {
  const ctx = await lib.newContext(browser);
  const open = (c, opts) => lib.open(c || ctx, base, "games/rose-window/", opts);
  const hooked = (c, more) => open(c, { before: async (pg) => { if (more) await more(pg); await lib.injectScript(pg, "games/rose-window/game.js", [HOOK]); } });
  const done = async (p, what) => { check("rose-window " + what + ": no page errors", p.errs.length === 0, p.errs); await p.close(); };
  const st = (p) => p.evaluate(() => ({ state: RoseWindow.state(), mode: RoseWindow.mode(), win: RoseWindow.win(), beads: RoseWindow.beads(), score: RoseWindow.score(), serving: RoseWindow.serving() }));
  // the page's own clock: ends after anything shorter the game set going
  const wait = (p, ms) => p.evaluate((ms) => new Promise((r) => setTimeout(r, ms)), ms);

  // ---- the menu: 1 and 2 pick the mode, shown on them and kept; Space starts
  let p = await open();
  const caps = await p.evaluate(() => [...document.querySelectorAll("#pick-mode button")].map((b) => b.getAttribute("data-gs-key")).concat(document.getElementById("play").getAttribute("data-gs-key")));
  await p.keyboard.press("2"); await p.waitForTimeout(80);
  const picked = await p.evaluate(() => ({ on: document.querySelector("#pick-mode .on").getAttribute("data-v"), kept: localStorage.getItem("rosewindow_mode") }));
  await p.keyboard.press("Space"); await p.waitForTimeout(200);
  const vigil = await st(p);
  const hudWin = await p.evaluate(() => document.getElementById("hud-win").textContent);
  check("rose-window: the modes wear 1 and 2 and the start Space or Enter; 2 picks Vigil (kept), and Space starts it at window I with one bead",
    caps.join() === "1,2,Space or Enter" && picked.on === "vigil" && picked.kept === "vigil" && vigil.state === "play" && vigil.mode === "vigil" && vigil.win === 0 && vigil.beads === 1 && vigil.serving && /^I · The Lancets$/.test(hudWin),
    { caps, picked, vigil, hudWin });
  // ...Space sends the light up off the bar, and a Vigil ends with its one bead
  await p.keyboard.press("Space"); await p.waitForTimeout(150);
  const sent = await p.evaluate(() => ({ serving: RoseWindow.serving(), b: RoseWindow.balls()[0] }));
  check("rose-window: Space sends the light up off the bar", !sent.serving && !!sent.b && sent.b.vy < 0, sent);
  await p.evaluate(() => RoseWindow.loseBall());
  check("rose-window: a Vigil ends when its one bead falls", (await st(p)).state === "over", await st(p));
  await done(p, "menu");

  // ---- the window to start from: only window I open at first (◀ ▶ off); a game
  // that reaches window II opens it
  p = await hooked();
  const first = await p.evaluate(() => ({ pick: RoseWindow.pick(), reached: RoseWindow.reached(), off: document.getElementById("win-prev").disabled && document.getElementById("win-next").disabled, note: document.getElementById("win-note").textContent }));
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(60);
  const still = await p.evaluate(() => RoseWindow.pick());
  const opened = await p.evaluate(() => { RoseWindow.start("pilgrimage"); RoseWindow.launch(); RoseWindow.breakAllBut(1); for (let k = 0; k < 3 && !RoseWindow.lit(); k++) RoseWindow.knock(0); for (let i = 0; i < 400 && RoseWindow.win() === 0; i++) RoseWindow.step(1 / 60); return { win: RoseWindow.win(), reached: RoseWindow.reached(), kept: localStorage.getItem("rosewindow_reached") }; });
  check("rose-window: at first only window I is open (◀ ▶ off, → does nothing); a game that reaches window II opens it",
    first.pick === 0 && first.reached === 0 && first.off && /one window open/.test(first.note) && still === 0 && opened.win === 1 && opened.reached === 1 && opened.kept === "1", { first, still, opened });
  await done(p, "first window");
  // ...with four open: → and ← go round those four (shown on ◀ ▶), the pick kept, the
  // window behind the card the one picked; Space starts from it, and a game from
  // it keeps no best (the end card says so), while one from I does
  p = await open(null, { before: (pg) => pg.addInitScript(() => { try { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("rosewindow_reached", "3"); } } catch (e) {} }) });
  const arrowCaps = await p.evaluate(() => ["win-prev", "win-next"].map((id) => document.getElementById(id).getAttribute("data-gs-key")));
  const walk = [];
  for (const k of ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "ArrowLeft"]) { await p.keyboard.press(k); await p.waitForTimeout(40); walk.push(await p.evaluate(() => RoseWindow.pick())); }
  await p.keyboard.press("ArrowLeft"); await p.waitForTimeout(40);
  const atIV = await p.evaluate(() => ({ pick: RoseWindow.pick(), kept: localStorage.getItem("rosewindow_from"), name: document.getElementById("win-name").textContent, note: document.getElementById("win-note").textContent }));
  await p.reload(); await p.waitForFunction(() => window.RoseWindow);
  const afterReload = await p.evaluate(() => RoseWindow.pick());
  const fromIV = await p.evaluate(() => {
    localStorage.removeItem("rosewindow_best_pilgrimage");
    RoseWindow.start("pilgrimage"); const s = { win: RoseWindow.win(), from: RoseWindow.from(), hud: document.getElementById("hud-win").textContent };
    RoseWindow.launch(); RoseWindow.knock(0); RoseWindow.knock(0); RoseWindow.gameOver(false);
    return Object.assign(s, { score: RoseWindow.score(), best: localStorage.getItem("rosewindow_best_pilgrimage"), line: document.querySelector("#over-stats .best").textContent });
  });
  check("rose-window: with four windows open, → and ← (on ◀ ▶) go round those four, the pick kept through a reload; Space starts from it, and a game from IV keeps no best, the end card saying so",
    arrowCaps.join() === "←,→" && walk.join() === "1,2,3,0,3" && atIV.pick === 2 && atIV.kept === "2" && /^III · The Rose$/.test(atIV.name) && /four of sixteen open · no best kept from here/.test(atIV.note) && afterReload === 2 &&
    fromIV.win === 2 && fromIV.from === 2 && /^III · /.test(fromIV.hud) && fromIV.score > 0 && fromIV.best === null && /no best kept/.test(fromIV.line),
    { arrowCaps, walk, atIV, afterReload, fromIV });
  await done(p, "start window");

  // ---- every window: its glass inside the arch, some to break, and none
  // walled in by stone (a path of anything but stone from the open window)
  p = await open();
  const wins = await p.evaluate(() => {
    const g = RoseWindow.geo(), out = [];
    RoseWindow.windows().forEach((w) => {
      const cell = {}, bad = [];
      w.panes.forEach(([c, r, max]) => { cell[c + "," + r] = max; });
      w.panes.forEach(([c, r]) => {
        const x0 = 16 + c * g.CW, y0 = 34 + r * g.CH;
        [[x0, y0], [x0 + g.CW, y0], [x0, y0 + g.CH], [x0 + g.CW, y0 + g.CH]].forEach(([x, y]) => {
          if (y < g.R && Math.hypot(x - g.R, y - g.R) > g.R) bad.push("outside " + c + "," + r);
          if (x < 0 || x > g.FW) bad.push("past the jambs " + c + "," + r);
        });
      });
      // flood from the empty cells through anything but stone
      const seen = {}, q = [];
      for (let c = 0; c < 14; c++) for (let r = 0; r < 20; r++) { const k = c + "," + r; if (!(k in cell)) { seen[k] = 1; q.push([c, r]); } }
      while (q.length) {
        const [c, r] = q.pop();
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dc, dr]) => {
          const nc = c + dc, nr = r + dr, k = nc + "," + nr;
          if (nc < 0 || nc > 13 || nr < 0 || nr > 19 || seen[k] || cell[k] === 0) return;
          seen[k] = 1; q.push([nc, nr]);
        });
      }
      const walled = w.panes.filter(([c, r, max]) => max > 0 && !seen[c + "," + r]).length;
      out.push({ name: w.name, breakable: w.panes.filter((x) => x[2] > 0).length, thick: w.panes.filter((x) => x[2] === 2).length, stone: w.panes.filter((x) => x[2] === 0).length, bad: bad.slice(0, 3), walled });
    });
    return out;
  });
  check("rose-window: sixteen windows, each with glass to break, all of it inside the arch, none walled in by stone, and thick glass and stone among them",
    wins.length === 16 && wins.every((w) => w.breakable > 40 && w.bad.length === 0 && w.walled === 0) && wins.some((w) => w.thick > 0) && wins.some((w) => w.stone > 0),
    wins.map((w) => [w.name, w.breakable, w.thick, w.stone, w.walled, w.bad.join(";")]));
  await done(p, "windows");

  // ---- the physics, stepped by hand
  {
    const q = await hooked();
    // where the bead meets the bar: right of its middle it leaves to the
    // right, left of it to the left, on the middle straight up
    const ways = await q.evaluate(() => {
      RoseWindow.start("pilgrimage");
      const out = {};
      for (const [name, dx] of [["right", 30], ["left", -30], ["middle", 0]]) {
        RoseWindow.setBar(240);
        RoseWindow.put(240 + dx, 560, 0, 330);
        let b;
        for (let i = 0; i < 40; i++) { RoseWindow.step(1 / 60); b = RoseWindow.live()[0]; if (b && b.vy < 0) break; }
        out[name] = b ? { vx: Math.round(b.vx), vy: Math.round(b.vy) } : null;
      }
      return out;
    });
    check("rose-window: a bead landing right of the bar's middle leaves to the right, left of it to the left, and on the middle straight up",
      !!ways.right && ways.right.vy < 0 && ways.right.vx > 100 && !!ways.left && ways.left.vx < -100 && !!ways.middle && Math.abs(ways.middle.vx) < 5, ways);

    // thick glass takes two knocks; stone none (window III, the Rose, has both)
    const glass = await q.evaluate(() => {
      RoseWindow.start("pilgrimage");
      for (let w = 0; w < 2; w++) { RoseWindow.breakAllBut(1); RoseWindow.knock(0); RoseWindow.knock(0); for (let i = 0; i < 200 && RoseWindow.lit(); i++) RoseWindow.step(1 / 60); }
      const panes = RoseWindow.panes(), thick = panes.find((x) => x.max === 2), stone = panes.find((x) => x.max === 0);
      const at = (x, y) => RoseWindow.panes().find((p) => p.x === x && p.y === y);
      // a bead sent straight up into the pane from just under it
      const fire = (pane) => { RoseWindow.put(pane.x + 16, pane.y + 18 + 7, 0, -330); for (let i = 0; i < 6; i++) RoseWindow.step(1 / 120); };
      fire(thick); const once = at(thick.x, thick.y);
      fire(thick); const twice = at(thick.x, thick.y);
      fire(stone); fire(stone); fire(stone); const rock = at(stone.x, stone.y);
      return { win: RoseWindow.win(), once: [once.hp, once.broken], twice: [twice.hp, twice.broken], rock: [rock.hp, rock.broken] };
    });
    check("rose-window: thick glass cracks at the first knock and breaks at the second; stone never breaks",
      glass.win === 2 && glass.once[0] === 1 && !glass.once[1] && glass.twice[1] && !glass.rock[1], glass);

    // the window broken to its last pane is lit; then the next waits with the bead on the bar
    const lit = await q.evaluate(() => {
      const before = { win: RoseWindow.win(), score: RoseWindow.score() };
      RoseWindow.breakAllBut(1); RoseWindow.knock(0); RoseWindow.knock(0);
      const during = { lit: RoseWindow.lit(), balls: RoseWindow.balls().length, score: RoseWindow.score() };
      for (let i = 0; i < 200 && RoseWindow.lit(); i++) RoseWindow.step(1 / 60);
      return { before, during, after: { win: RoseWindow.win(), serving: RoseWindow.serving(), lit: RoseWindow.lit(), hud: document.getElementById("hud-win").textContent } };
    });
    check("rose-window: the last pane broken lights the window (a bonus, the bead gone), then the next window waits with the bead on the bar",
      lit.during.lit && lit.during.balls === 0 && lit.during.score >= lit.before.score + 250 * (lit.before.win + 1) && lit.after.win === lit.before.win + 1 && lit.after.serving && !lit.after.lit && /^IV · The Trefoil$/.test(lit.after.hud), lit);

    // the jewels: a wider bar, slower light, three beads
    const jewels = await q.evaluate(() => {
      RoseWindow.start("pilgrimage"); RoseWindow.launch();
      const w0 = RoseWindow.bar().w, sp = (b) => Math.hypot(b.vx, b.vy);
      const s0 = sp(RoseWindow.live()[0]);
      // (stepped only until the bar has it)
      const take = (k) => { RoseWindow.drop(k); for (let i = 0; i < 60 && RoseWindow.jewels() > 0; i++) RoseWindow.step(1 / 60); };
      const settle = () => { for (let i = 0; i < 20; i++) RoseWindow.step(1 / 60); };
      take("wide"); settle(); const w1 = RoseWindow.bar().w;
      take("slow"); settle(); const s1 = sp(RoseWindow.live()[0]);
      take("three"); const n = RoseWindow.live().length;
      // with two beads in the air, the next three-bead jewel makes each of them three
      RoseWindow.put(240, 330, 40, -300); RoseWindow.live().push({ x: 180, y: 330, vx: -60, vy: -290, trail: [] });
      take("three"); const n2 = RoseWindow.live().length;
      return { w0: Math.round(w0), w1: Math.round(w1), s0: Math.round(s0), s1: Math.round(s1), n, n2 };
    });
    check("rose-window: the jewels caught give a wider bar, slower light and three beads; with two beads in the air the three-bead jewel makes each of them three (six)",
      jewels.w1 > jewels.w0 + 30 && jewels.s1 < jewels.s0 * 0.8 && jewels.n === 3 && jewels.n2 === 6, jewels);

    // a Pilgrimage ends after its third bead; a new best is kept as it's passed
    const run = await q.evaluate(() => {
      localStorage.removeItem("rosewindow_best_pilgrimage");
      RoseWindow.start("pilgrimage"); RoseWindow.launch();
      for (let i = 0; i < 12; i++) RoseWindow.knock(i);
      const kept = Number(localStorage.getItem("rosewindow_best_pilgrimage")), score = RoseWindow.score();
      const states = [];
      for (let i = 0; i < 3; i++) { RoseWindow.launch(); RoseWindow.loseBall(); states.push(RoseWindow.state() + ":" + RoseWindow.beads()); }
      return { kept, score, states, card: document.getElementById("over").hidden ? null : document.getElementById("over-stats").textContent };
    });
    check("rose-window: a new best is kept the moment it's passed, and a Pilgrimage ends with its third bead, the end card saying so",
      run.score > 0 && run.kept === run.score && run.states.join() === "play:2,play:1,over:0" && /panes broken/.test(run.card || "") && /record/.test(run.card || ""), run);
    await done(q, "physics");
  }

  // ---- Visual FX: on, a broken pane throws shards, the bead leaves a trail
  // and a floating word rises; off, none of that moves (the pane still breaks
  // and lets the light in, and the word still shows, holding still)
  const fxSeen = {};
  for (const off of [false, true]) {
    const q = await hooked(null, (pg) => pg.addInitScript((off) => { try { localStorage.setItem("reduceMotion:rose-window", off ? "1" : "0"); } catch (e) {} }, off));
    fxSeen[off ? "off" : "on"] = await q.evaluate(() => {
      RoseWindow.start("pilgrimage"); RoseWindow.launch();
      const before = RoseWindow.left();
      RoseWindow.knock(0);
      const broke = before - RoseWindow.left(), shards = RoseWindow.shards();
      RoseWindow.drop("wide");
      for (let i = 0; i < 40 && RoseWindow.jewels() > 0; i++) RoseWindow.step(1 / 60);
      const pop = RoseWindow.pops().length > 0;
      for (let i = 0; i < 6; i++) RoseWindow.step(1 / 60);
      return { broke, shards, trail: RoseWindow.live().length ? RoseWindow.live()[0].trail.length : -1, pop };
    });
    await done(q, "FX " + (off ? "off" : "on"));
  }
  check("rose-window, FX on: a broken pane throws shards and the bead leaves a trail", fxSeen.on.broke === 1 && fxSeen.on.shards > 0 && fxSeen.on.trail > 0 && fxSeen.on.pop, fxSeen.on);
  check("rose-window, FX off: the pane breaks all the same, with no shards and no trail, and the word for the jewel still shows", fxSeen.off.broke === 1 && fxSeen.off.shards === 0 && fxSeen.off.trail === 0 && fxSeen.off.pop, fxSeen.off);

  // ---- the end card: Space waits a moment, then begins again; Backspace goes to the modes
  p = await open();
  const card = await p.evaluate(() => {
    RoseWindow.start("vigil"); RoseWindow.launch(); RoseWindow.loseBall();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: " ", code: "Space", bubbles: true }));
    return { early: RoseWindow.state() };
  });
  await wait(p, 900);
  await p.keyboard.press("Space"); await p.waitForTimeout(200);
  const again = await st(p);
  await p.evaluate(() => { RoseWindow.launch(); RoseWindow.loseBall(); });
  await wait(p, 900);
  await p.keyboard.press("Backspace"); await p.waitForTimeout(200);
  const back = await st(p);
  const capsOver = await p.evaluate(() => [document.getElementById("again").getAttribute("data-gs-key"), document.getElementById("to-menu").getAttribute("data-gs-key")]);
  check("rose-window: on the end card Space does nothing in its first moment, then begins again; Backspace goes back to the modes; the buttons wear Space or Enter and ⌫",
    card.early === "over" && again.state === "play" && again.mode === "vigil" && back.state === "menu" && capsOver.join() === "Space or Enter,⌫", { card, again: again.state, back: back.state, capsOver });
  await done(p, "end card");

  // ---- paused: the keys neither move the bar nor send the light
  p = await open();
  await p.evaluate(() => RoseWindow.start("pilgrimage")); await p.waitForTimeout(150);
  await p.keyboard.press("p"); await p.waitForTimeout(150);
  const x0 = await p.evaluate(() => RoseWindow.bar().x);
  // (held for a count of frames, not a time, so a busy machine holds it as long)
  const frames = (n) => p.evaluate((n) => new Promise((r) => { let k = 0; (function f() { if (++k > n) r(); else requestAnimationFrame(f); })(); }), n);
  await p.keyboard.down("ArrowLeft"); await frames(20); await p.keyboard.up("ArrowLeft");
  await p.keyboard.press("Space"); await frames(6);
  const paused = await p.evaluate(() => ({ x: RoseWindow.bar().x, serving: RoseWindow.serving(), up: !document.querySelector(".gs-pause").hidden }));
  await p.keyboard.press("p"); await p.waitForTimeout(150);
  // resumed: held until the bar has gone 40 px (or long past when it should have)
  await p.keyboard.down("ArrowLeft");
  await p.waitForFunction((x0) => RoseWindow.bar().x < x0 - 40, x0, { timeout: 8000 }).catch(() => {});
  await p.keyboard.up("ArrowLeft");
  const moved = await p.evaluate(() => RoseWindow.bar().x);
  check("rose-window: paused, ← and Space neither move the bar nor send the light; resumed, ← moves it",
    paused.up && paused.x === x0 && paused.serving && moved < x0 - 40, { x0, paused, moved });
  await done(p, "pause");

  // ---- on a phone: a drag moves the bar, a tap sends the light
  {
    const { devices } = require("@playwright/test");
    const c = await lib.newContext(browser, devices["Pixel 7"]);
    const q = await open(c);
    await q.evaluate(() => RoseWindow.start("pilgrimage")); await q.waitForTimeout(200);
    const g = await q.evaluate(() => RoseWindow.geo());
    const bx = (x) => g.OX + x * g.S, by = g.OY + 560 * g.S;
    const cdp = await c.newCDPSession(q);
    const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] });
    await touch("touchStart", bx(240), by); await touch("touchMove", bx(160), by); await touch("touchMove", bx(100), by); await touch("touchEnd");
    await q.waitForTimeout(150);
    const dragged = await q.evaluate(() => ({ x: Math.round(RoseWindow.bar().x), serving: RoseWindow.serving() }));
    await q.touchscreen.tap(bx(100), by); await q.waitForTimeout(150);
    const tapped = await q.evaluate(() => RoseWindow.serving());
    check("rose-window, phone: a drag moves the bar without sending the light; a tap sends it", Math.abs(dragged.x - 100) < 8 && dragged.serving && !tapped, { dragged, tapped });
    await done(q, "phone");
    await c.close();
  }
  await ctx.close();
};
